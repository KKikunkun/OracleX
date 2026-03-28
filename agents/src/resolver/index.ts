// L0 Header — machine-readable state metadata
// ROLE: resolver | STATUS: polling | LAST_ACTION: none | NEXT_ACTION: check_deadlines
// QUEUE_IN: creator→market_deployed | POLLS: every 5min

import { ethers } from 'ethers'
import { getResolverWallet, NonceManager } from '../shared/wallet.js'
import { getSettlementPrice, getCurrentPrice, toContractPrice } from '../shared/okxApi.js'
import { withRetry } from '../shared/retry.js'
import { runClaudeResolverAnalysis } from '../shared/claudeAgent.js'
import { getOnchainOKBPrice } from '../shared/onchainos.js'
import type { MarketInfo, AgentAction } from '../shared/types.js'

// Maximum allowed divergence between CEX and DEX price (5%)
// If prices diverge more than this, we flag it but still use CEX price
const MAX_PRICE_DIVERGENCE = 0.05

const MARKET_ABI = [
  'function resolve(uint256 settlementPrice, bytes32 jobCompleteHash)',
  'function resolved() view returns (bool)',
  'function deadline() view returns (uint256)',
  'function instId() view returns (string)',
  'function targetPrice() view returns (uint256)',
]

export class ResolverAgent {
  private wallet:   ethers.Wallet | null = null
  private nonceMgr: NonceManager  | null = null
  private simMode:  boolean = false

  constructor(
    private onAction:   (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
    private onResolved: (address: string, finalPrice: number, outcomeYes: boolean, txHash?: string) => void
  ) {}

  async init() {
    this.wallet = getResolverWallet()
    if (!this.wallet) {
      this.simMode = true
      console.log('[Resolver] Simulation mode (no RESOLVER_PRIVATE_KEY)')
      return
    }
    this.nonceMgr = new NonceManager(this.wallet)
    await this.nonceMgr.init()
    console.log('[Resolver] Initialized | Wallet:', this.wallet.address)
  }

  // ── Check all tracked markets ─────────────────────────────────
  // > FROM:creator TO:resolver ACTION:market_deployed → adds to tracking list

  async checkAndResolve(markets: MarketInfo[]): Promise<void> {
    const now = Math.floor(Date.now() / 1000)

    for (const market of markets) {
      if (market.resolved || market.status === 'resolved') continue
      if (market.deadline > now) {
        // Update live price for active markets
        await this.updateLivePrice(market)
        continue
      }

      // Market past deadline — time to resolve
      this.onAction({
        role:   'resolver',
        action: `Market ${market.instId} expired — resolving`,
        detail: `Fetching OKX settlement price for deadline ${new Date(market.deadline * 1000).toUTCString()}`,
        marketAddress: market.address,
      })

      try {
        const finalPrice = await withRetry(
          () => getSettlementPrice(market.instId, market.deadline * 1000),
          { maxRetries: 3, label: `getSettlementPrice(${market.instId})` }
        )
        if (finalPrice === null) {
          this.onAction({
            role:   'resolver',
            action: `❌ Price fetch failed: ${market.instId}`,
            detail: 'Will retry next cycle',
            marketAddress: market.address,
          })
          continue
        }

        // Cross-validate with DEX on-chain price (OKX DEX Aggregator V6)
        // This prevents single-oracle manipulation — a real concern for prediction markets
        if (market.instId === 'OKB-USDT') {
          const dexPrice = await getOnchainOKBPrice()
          if (dexPrice !== null) {
            const divergence = Math.abs(finalPrice - dexPrice) / finalPrice
            this.onAction({
              role:   'resolver',
              action: `DEX cross-validation: ${market.instId}`,
              detail: `CEX: $${finalPrice.toFixed(2)} | DEX: $${dexPrice.toFixed(2)} | Divergence: ${(divergence * 100).toFixed(2)}%${divergence > MAX_PRICE_DIVERGENCE ? ' ⚠️ HIGH' : ' ✓'}`,
              marketAddress: market.address,
            })
            if (divergence > MAX_PRICE_DIVERGENCE) {
              console.warn(`[Resolver] Price divergence warning: CEX=$${finalPrice.toFixed(2)} DEX=$${dexPrice.toFixed(2)} (${(divergence * 100).toFixed(1)}%)`)
            }
          }
        }

        const outcomeYes = finalPrice >= market.targetPrice

        this.onAction({
          role:   'resolver',
          action: `OKX price fetched: $${finalPrice.toFixed(2)}`,
          detail: `Target: $${market.targetPrice.toFixed(2)} | ${outcomeYes ? 'YES wins ✅' : 'NO wins ❌'}`,
          marketAddress: market.address,
        })

        if (this.simMode) {
          this.onResolved(market.address, finalPrice, outcomeYes)
          this.onAction({
            role:   'resolver',
            action: `✅ Market resolved: ${market.instId}`,
            detail: `$${finalPrice.toFixed(2)} | ${outcomeYes ? 'YES wins ✅' : 'NO wins ❌'}`,
            marketAddress: market.address,
          })
          // Ask Claude to analyze the resolution
          this.runPostResolutionAnalysis(market, finalPrice, outcomeYes)
          continue
        }

        // On-chain resolution
        const txHash = await this.resolveOnchain(market.address, finalPrice)
        if (txHash) {
          this.onResolved(market.address, finalPrice, outcomeYes, txHash)
          this.onAction({
            role:   'resolver',
            action: `✅ Resolved on-chain: ${market.instId}`,
            detail: `$${finalPrice.toFixed(2)} | ${outcomeYes ? 'YES wins ✅' : 'NO wins ❌'} | tx: ${txHash.slice(0, 12)}...`,
            txHash,
            marketAddress: market.address,
          })
          this.runPostResolutionAnalysis(market, finalPrice, outcomeYes)
        }
      } catch (err) {
        this.onAction({
          role:   'resolver',
          action: `❌ Resolution error: ${market.instId}`,
          detail: (err as Error).message?.slice(0, 100),
          marketAddress: market.address,
        })
      }
    }
  }

  // ── On-chain resolve() call ───────────────────────────────────

  private async resolveOnchain(address: string, finalPrice: number): Promise<string | null> {
    if (!this.wallet || !this.nonceMgr) return null

    try {
      const contract = new ethers.Contract(address, MARKET_ABI, this.wallet)
      const pricePrecision = toContractPrice(finalPrice)
      const jobCompleteHash = ethers.keccak256(
        ethers.toUtf8Bytes(`resolve-${address}-${finalPrice}-${Date.now()}`)
      )
      const nonce = this.nonceMgr.getNext()

      const tx = await withRetry(
        () => contract.resolve(pricePrecision, jobCompleteHash, { nonce }),
        { maxRetries: 2, label: `resolve(${address})` }
      )
      const receipt = await tx.wait()
      console.log(`[Resolver] Resolved ${address} | tx: ${receipt.hash}`)
      return receipt.hash
    } catch (err: any) {
      const msg = err.message || ''
      console.error('[Resolver] resolve() failed:', msg.slice(0, 100))
      if (msg.includes('nonce')) await this.nonceMgr?.resync()
      return null
    }
  }

  // ── Post-resolution Claude analysis (async, non-blocking) ────

  private runPostResolutionAnalysis(market: MarketInfo, finalPrice: number, outcomeYes: boolean) {
    const durationHours = (Date.now() / 1000 - market.createdAt) / 3600
    runClaudeResolverAnalysis({
      question:      market.question,
      instId:        market.instId,
      targetPrice:   market.targetPrice,
      finalPrice,
      outcomeYes,
      durationHours,
    }).then(analysis => {
      if (!analysis) return
      // Store analysis on market object for frontend display
      market.aiAnalysis = analysis
      this.onAction({
        role:   'resolver',
        action: `🤖 Claude post-analysis: ${market.instId}`,
        detail: analysis,
        marketAddress: market.address,
      })
    }).catch(() => {/* silently ignore analysis errors */})
  }

  // ── Update live price for display ────────────────────────────

  private async updateLivePrice(market: MarketInfo): Promise<void> {
    const ticker = await getCurrentPrice(market.instId)
    if (ticker) market.currentPrice = ticker.price
  }

  // ── Start polling loop ────────────────────────────────────────

  start(getMarkets: () => MarketInfo[]) {
    // Poll every 5 minutes — checks deadlines and updates live prices
    const interval = 5 * 60 * 1000
    console.log(`[Resolver] Started — polling every 5min`)
    setInterval(() => this.checkAndResolve(getMarkets()), interval)
    setTimeout(() => this.checkAndResolve(getMarkets()), 5_000)
  }
}
