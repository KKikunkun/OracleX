// L0 Header — machine-readable state metadata
// ROLE: signal | STATUS: monitoring | LAST_ACTION: price_check | NEXT_ACTION: trigger_if_volatile
// WATCHES: OKB-USDT | INTERVAL: 1 market per day
// BRAIN: Claude AI (tool-use agent loop) | FALLBACK: rule-based threshold

import { getCurrentPrice } from '../shared/okxApi.js'
import { runClaudeSignalAgent } from '../shared/claudeAgent.js'
import type { DeployParams, QueueMessage, AgentAction, MarketInfo } from '../shared/types.js'

const WATCH_PAIRS = ['OKB-USDT', 'BTC-USDT']

// ── Round price to nearest key psychological level ────────────
function roundToKeyLevel(instId: string, price: number, change24h: number): number {
  const up = change24h >= 0
  const step = instId === 'BTC-USDT' ? 500 : price >= 100 ? 5 : price >= 10 ? 1 : 0.5
  return up
    ? Math.ceil(price / step) * step
    : Math.floor(price / step) * step
}

export class SignalAgent {
  private createdToday       = new Set<string>()  // track per pair
  private lastCreateDay      = -1
  private claudeCooldown     = 0
  private CLAUDE_INTERVAL_MS = 30 * 60 * 1000  // 30 min

  constructor(
    private onSignal: (params: DeployParams) => Promise<void>,
    private onAction: (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
    private getMarkets: () => MarketInfo[] = () => []
  ) {}

  // ── Instruction Queue: emit message to Creator ───────────────
  private emit(msg: Omit<QueueMessage, 'ts'>) {
    console.log(`  > FROM:signal TO:creator ACTION:${msg.action}`)
  }

  // ── Check if we already have an active market today for a given pair ──
  private hasActiveMarketToday(pair: string): boolean {
    const now = new Date()

    // Reset daily flags at midnight UTC
    if (now.getUTCDate() !== this.lastCreateDay) {
      this.createdToday.clear()
      this.lastCreateDay = now.getUTCDate()
    }

    if (this.createdToday.has(pair)) return true

    const active = this.getMarkets().filter(m =>
      m.instId === pair && !m.resolved && m.status === 'active'
    )
    if (active.length > 0) {
      this.createdToday.add(pair)
      return true
    }

    return false
  }

  // Check if ALL pairs have active markets
  private allPairsActive(): boolean {
    return WATCH_PAIRS.every(p => this.hasActiveMarketToday(p))
  }

  // ── Create daily markets (rule-based fallback) ────────────────
  private async createDailyMarkets() {
    for (const pair of WATCH_PAIRS) {
      if (this.hasActiveMarketToday(pair)) {
        console.log(`[Signal] Already have active ${pair} market today — skipping`)
        continue
      }

      const ticker = await getCurrentPrice(pair)
      if (!ticker) continue

      const now = new Date()
      const msUntilMidnight = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
      ).getTime() - Date.now()
      const hoursUntilMidnight = msUntilMidnight / 3_600_000
      const durationHours = hoursUntilMidnight < 4 ? hoursUntilMidnight + 24 : hoursUntilMidnight

      const targetPrice = roundToKeyLevel(pair, ticker.price, ticker.change24h)
      const symbol = pair.split('-')[0]
      const deadlineTs = Math.floor((Date.now() + durationHours * 3_600_000) / 1000)
      const deadlineStr = new Date(deadlineTs * 1000).toUTCString().replace(' GMT', ' UTC')
      const decimals = targetPrice >= 1000 ? 0 : targetPrice >= 10 ? 2 : 4
      const targetFmt = targetPrice.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

      const params: DeployParams = {
        instId: pair,
        currentPrice: ticker.price,
        question: `Will ${symbol} close above $${targetFmt} by ${deadlineStr}?`,
        targetPrice,
        deadline: deadlineTs,
      }

      this.onAction({ role: 'signal', action: `Daily market: ${pair}`, detail: `price $${ticker.price.toFixed(2)} | target $${targetPrice.toFixed(2)}` })
      this.emit({ from: 'signal', to: 'creator', action: 'deploy_market', data: params })
      await this.onSignal(params)
      this.createdToday.add(pair)

      await new Promise(r => setTimeout(r, 2000))
    }
  }

  // ── Claude AI signal run ──────────────────────────────────────
  // Claude can analyze but NOT create new markets if one already exists today

  async claudeRun() {
    if (!process.env.CLAUDE_API_KEY) return
    const now = Date.now()
    if (now - this.claudeCooldown < this.CLAUDE_INTERVAL_MS) return
    this.claudeCooldown = now

    // Claude always runs analysis (shows thinking process in activity feed)
    // But only creates markets for pairs that don't have one today
    const canCreate = !this.allPairsActive()

    try {
      await runClaudeSignalAgent(
        this.getMarkets,
        canCreate ? async (params) => {
          if (this.hasActiveMarketToday(params.instId)) {
            this.onAction({ role: 'signal', action: `AI Decision: hold on ${params.instId}`, detail: 'Active market already exists for this pair today.' })
            return
          }
          await this.onSignal(params)
          this.createdToday.add(params.instId)
        } : async () => {
          this.onAction({ role: 'signal', action: 'AI Decision: hold — all markets active', detail: 'Analysis complete. All daily markets already running.' })
        },
        this.onAction,
      )
    } catch (err: any) {
      console.error('[Claude] Signal agent error:', (err as Error).message?.slice(0, 120))
      this.onAction({
        role:   'signal',
        action: 'Claude API error',
        detail: (err as Error).message?.slice(0, 100) ?? 'unknown error',
      })
    }
  }

  // ── Start ─────────────────────────────────────────────────────

  start() {
    const hasClaudeKey = !!process.env.CLAUDE_API_KEY
    console.log(`[Signal] Started | Pairs: ${WATCH_PAIRS.join(', ')} | Mode: 1 market/pair/day | Brain: ${hasClaudeKey ? 'Claude AI' : 'Rule-based'}`)

    if (hasClaudeKey) {
      setTimeout(() => this.claudeRun(), 8_000)
      setTimeout(() => this.createDailyMarkets(), 120_000)  // fallback
      setInterval(() => this.claudeRun(), this.CLAUDE_INTERVAL_MS)
    } else {
      setTimeout(() => this.createDailyMarkets(), 5_000)
    }

    setInterval(() => {
      if (hasClaudeKey) this.claudeRun()
      else this.createDailyMarkets()
    }, 60 * 60 * 1000)
  }
}
