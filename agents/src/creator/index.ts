// L0 Header — machine-readable state metadata
// ROLE: creator | STATUS: idle | LAST_ACTION: none | NEXT_ACTION: await_signal
// QUEUE_IN: signal→deploy_market | QUEUE_OUT: creator→resolver:market_deployed

import { ethers } from 'ethers'
import { getCreatorWallet, NonceManager } from '../shared/wallet.js'
import { toContractPrice } from '../shared/okxApi.js'
import { config } from '../shared/config.js'
import type { DeployParams, MarketInfo, AgentAction, QueueMessage } from '../shared/types.js'
import { withRetry } from '../shared/retry.js'
import { getWalletBalance } from '../shared/onchainos.js'

// MarketFactory minimal ABI
const FACTORY_ABI = [
  'function deployMarket(string question, string instId, uint256 targetPrice, uint256 deadline, bytes32 jobCommitHash) payable returns (address)',
  'function getMarkets() view returns (address[])',
  'function totalMarkets() view returns (uint256)',
  'event MarketDeployed(address indexed market, string question, string instId, uint256 targetPrice, uint256 deadline, address creatorAgent)',
]

const MARKET_ABI = [
  'function question() view returns (string)',
  'function instId() view returns (string)',
  'function targetPrice() view returns (uint256)',
  'function deadline() view returns (uint256)',
  'function yesPool() view returns (uint256)',
  'function noPool() view returns (uint256)',
  'function resolved() view returns (bool)',
  'function outcomeYes() view returns (bool)',
  'function resolutionPrice() view returns (uint256)',
  'function creatorAgent() view returns (address)',
  'function getOdds() view returns (uint256 yesOdds, uint256 noOdds)',
  'function getStatus() view returns (bool, bool, uint256, uint256, uint256, uint256, uint256)',
]

export { MARKET_ABI }

export class CreatorAgent {
  private wallet:       ethers.Wallet | null = null
  private nonceMgr:     NonceManager | null = null
  private factory:      ethers.Contract | null = null
  private simMode:      boolean = false
  private simMarkets:   MarketInfo[] = []   // in-memory for simulation

  constructor(
    private onAction: (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
    private onMarketCreated: (market: MarketInfo) => void
  ) {}

  async init() {
    this.wallet = getCreatorWallet()
    if (!this.wallet) {
      this.simMode = true
      console.log('[Creator] Simulation mode (no CREATOR_PRIVATE_KEY)')
      return
    }

    if (!config.FACTORY_ADDRESS) {
      this.simMode = true
      console.log('[Creator] Simulation mode (no FACTORY_ADDRESS)')
      return
    }

    this.nonceMgr = new NonceManager(this.wallet)
    await this.nonceMgr.init()
    this.factory = new ethers.Contract(config.FACTORY_ADDRESS, FACTORY_ABI, this.wallet)
    console.log('[Creator] Initialized | Factory:', config.FACTORY_ADDRESS)
  }

  // ── Instruction Queue: receive from Signal ────────────────────
  // > FROM:SignalAgent TO:CreatorAgent ACTION:deploy_market
  async handleSignal(params: DeployParams): Promise<void> {
    await this.deployMarket(params)
  }

  // ── Deploy market ─────────────────────────────────────────────

  async deployMarket(params: DeployParams): Promise<MarketInfo | null> {
    const { instId, question, targetPrice, deadline } = params

    this.onAction({
      role:   'creator',
      action: `Deploying market: ${instId}`,
      detail: `${question.slice(0, 70)}... | deadline: ${new Date(deadline * 1000).toUTCString()}`,
    })

    if (this.simMode) {
      return this.simulateDeploy(params)
    }

    // Pre-flight: check wallet balance via OnchainOS Wallet API
    // Prevents failed on-chain TX from insufficient funds
    try {
      const balances = await getWalletBalance(this.wallet!.address)
      const okbBalance = balances.find(b => b.symbol === 'OKB')
      const balanceNum = okbBalance ? parseFloat(okbBalance.balance) : 0
      const requiredOKB = parseFloat(config.INITIAL_LIQUIDITY_ETH)

      this.onAction({
        role:   'creator',
        action: `Wallet balance check: ${this.wallet!.address.slice(0, 10)}...`,
        detail: `OKB balance: ${balanceNum.toFixed(4)} | Required: ${requiredOKB} OKB | ${balanceNum >= requiredOKB ? 'Sufficient ✓' : 'Low ⚠️'}`,
      })

      if (balanceNum > 0 && balanceNum < requiredOKB) {
        this.onAction({
          role:   'creator',
          action: `⚠️ Insufficient balance for ${instId}`,
          detail: `Need ${requiredOKB} OKB but wallet has ${balanceNum.toFixed(4)} OKB — skipping deployment`,
        })
        console.warn(`[Creator] Insufficient balance: ${balanceNum} OKB < ${requiredOKB} OKB required`)
        return null
      }
    } catch (err) {
      // Balance check is advisory — don't block deployment if Wallet API is down
      console.warn('[Creator] Wallet balance check failed (non-blocking):', (err as Error).message?.slice(0, 60))
    }

    try {
      const targetPriceRaw = toContractPrice(targetPrice)
      const value          = ethers.parseEther(config.INITIAL_LIQUIDITY_ETH)
      const jobCommitHash  = ethers.keccak256(
        ethers.toUtf8Bytes(`${question}-${deadline}-${Date.now()}`)
      )
      const nonce = this.nonceMgr!.getNext()

      const tx = await withRetry(
        () => this.factory!.deployMarket(
          question, instId, targetPriceRaw, BigInt(deadline), jobCommitHash,
          { value, nonce }
        ),
        { maxRetries: 2, label: `deployMarket(${instId})` }
      )
      const receipt = await tx.wait()

      // Parse MarketDeployed event to get market address
      const iface   = new ethers.Interface(FACTORY_ABI)
      let   address = ''
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log)
          if (parsed?.name === 'MarketDeployed') {
            address = parsed.args.market
            break
          }
        } catch {}
      }

      // Emit to resolver queue
      const msg: QueueMessage = {
        from:   'creator',
        to:     'resolver',
        action: 'market_deployed',
        data:   { address, instId, deadline },
        ts:     Date.now(),
      }
      console.log(`  > FROM:creator TO:resolver ACTION:market_deployed DATA:${JSON.stringify({ address, instId })}`)

      const market: MarketInfo = {
        address,
        question,
        instId,
        targetPrice,
        deadline,
        yesPool:         (value / 2n).toString(),
        noPool:          (value / 2n).toString(),
        yesOdds:         5000,
        noOdds:          5000,
        status:          'active',
        resolved:        false,
        outcomeYes:      null,
        resolutionPrice: null,
        currentPrice:    targetPrice,
        createdAt:       Math.floor(Date.now() / 1000),
        txHash:          receipt.hash,
        aiReasoning:     params.aiReasoning,
      }

      this.onMarketCreated(market)
      this.onAction({
        role:   'creator',
        action: `✅ Market deployed: ${instId}`,
        detail: `${address.slice(0, 10)}... | tx: ${receipt.hash.slice(0, 12)}...`,
        txHash: receipt.hash,
        marketAddress: address,
      })

      console.log(`[Creator] Market deployed: ${address} | tx: ${receipt.hash}`)
      return market
    } catch (err: any) {
      const msg = (err as Error).message || ''
      this.onAction({
        role:   'creator',
        action: `❌ Deploy failed: ${instId}`,
        detail: msg.slice(0, 100),
      })
      if (msg.includes('nonce')) await this.nonceMgr?.resync()
      console.error('[Creator] Deploy failed:', msg.slice(0, 100))
      return null
    }
  }

  // ── Simulation mode (no private key) ─────────────────────────

  private simulateDeploy(params: DeployParams): MarketInfo {
    const { instId, question, targetPrice, deadline } = params
    const address = `0xSIM_${Date.now().toString(16)}_${instId}`
    const halfLiq = '2000000000000000'  // 0.002 ETH

    const market: MarketInfo = {
      address,
      question,
      instId,
      targetPrice,
      deadline,
      yesPool:         halfLiq,
      noPool:          halfLiq,
      yesOdds:         5000,
      noOdds:          5000,
      status:          'active',
      resolved:        false,
      outcomeYes:      null,
      resolutionPrice: null,
      currentPrice:    targetPrice,
      createdAt:       Math.floor(Date.now() / 1000),
      aiReasoning:     params.aiReasoning,
    }

    this.simMarkets.push(market)
    this.onMarketCreated(market)
    this.onAction({
      role:   'creator',
      action: `✅ Market created: ${instId}`,
      detail: `${question.slice(0, 70)} | target $${targetPrice.toFixed(2)}`,
    })
    console.log(`[Creator SIM] Market created: ${instId} @ $${targetPrice}`)
    return market
  }

  // ── Read factory markets on startup ──────────────────────────

  async loadOnchainMarkets(): Promise<string[]> {
    if (!this.factory) return []
    try {
      const addrs: string[] = await this.factory.getMarkets()
      console.log(`[Creator] Loaded ${addrs.length} markets from factory`)
      return addrs
    } catch {
      return []
    }
  }

  // ── Read single market state ──────────────────────────────────

  async readMarket(address: string): Promise<MarketInfo | null> {
    if (!this.wallet) return null
    try {
      const provider = this.wallet.provider!
      const m = new ethers.Contract(address, MARKET_ABI, provider)
      const [question, instId, targetPriceRaw, deadline,
             yesPool, noPool, resolved, outcomeYes, resolutionPrice] = await Promise.all([
        m.question(), m.instId(), m.targetPrice(), m.deadline(),
        m.yesPool(), m.noPool(), m.resolved(), m.outcomeYes(), m.resolutionPrice(),
      ])
      const [yesOdds, noOdds] = await m.getOdds()
      const now = Math.floor(Date.now() / 1000)

      return {
        address,
        question,
        instId,
        targetPrice:     Number(targetPriceRaw) / 1e8,
        deadline:        Number(deadline),
        yesPool:         yesPool.toString(),
        noPool:          noPool.toString(),
        yesOdds:         Number(yesOdds),
        noOdds:          Number(noOdds),
        status:          resolved ? 'resolved' : Number(deadline) <= now ? 'closed' : 'active',
        resolved,
        outcomeYes:      resolved ? outcomeYes : null,
        resolutionPrice: resolved ? Number(resolutionPrice) / 1e8 : null,
        currentPrice:    null,
        createdAt:       0,
      }
    } catch {
      return null
    }
  }
}
