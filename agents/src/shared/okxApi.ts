// L0 Header — machine-readable state metadata
// ROLE: shared/okxApi | STATUS: active | LAST_ACTION: fetch_price | NEXT_ACTION: idle

// ============================================================
// OKX Market API wrapper — public endpoints, no auth required
// REST: https://www.okx.com/api/v5/market/
// WS:   wss://ws.okx.com:8443/ws/v5/public
// ============================================================

const BASE = 'https://www.okx.com/api/v5'

// ── Proxy setup — synchronous, runs before any fetch ──────────
// Node.js native fetch (undici) does not read system proxy env vars.
// We configure the global undici dispatcher here at module load time.
import { ProxyAgent, setGlobalDispatcher } from 'undici'
{
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
                 || process.env.HTTP_PROXY  || process.env.http_proxy
  if (proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(proxyUrl))
    console.log(`[OKX] Proxy configured: ${proxyUrl}`)
  }
}

// ── Demo fallback prices (used when OKX unreachable) ─────────
const DEMO_PRICES: Record<string, number> = {
  'BTC-USDT': 66_400,
  'ETH-USDT':  1_990,
  'OKB-USDT':    82.5,
}
// Drift demo prices slightly over time for a realistic look
let _demoPriceSeed = Date.now()
function demoPriceOf(instId: string): number {
  _demoPriceSeed++
  const base = DEMO_PRICES[instId] ?? 100
  const drift = (Math.sin(_demoPriceSeed / 1_000) * base * 0.003)
  return parseFloat((base + drift).toFixed(2))
}

export interface Ticker {
  instId:   string
  price:    number
  open24h:  number
  high24h:  number
  low24h:   number
  vol24h:   number
  change24h: number  // percentage
  ts:       number
}

// ── REST: Ticker ─────────────────────────────────────────────

async function fetchTicker(instId: string): Promise<Ticker | null> {
  const res  = await fetch(`${BASE}/market/ticker?instId=${instId}&instType=SPOT`, {
    headers: { 'User-Agent': 'OracleX/1.0' },
    signal:  AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const body: any = await res.json()
  const d = body.data?.[0]
  if (!d) return null

  const price   = parseFloat(d.last)
  const open24h = parseFloat(d.open24h)
  return {
    instId:    d.instId,
    price,
    open24h,
    high24h:   parseFloat(d.high24h),
    low24h:    parseFloat(d.low24h),
    vol24h:    parseFloat(d.vol24h),
    change24h: open24h > 0 ? ((price - open24h) / open24h) * 100 : 0,
    ts:        parseInt(d.ts),
  }
}

export async function getCurrentPrice(instId: string): Promise<Ticker | null> {
  // Try twice — first attempt may fail if proxy needs a moment at startup
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const ticker = await fetchTicker(instId)
      if (ticker) return ticker
    } catch {
      if (attempt === 0) await new Promise(r => setTimeout(r, 2_000))
    }
  }
  console.warn(`[OKX REST] ${instId}: unreachable — using demo price`)
  const price = demoPriceOf(instId)
  return {
    instId, price,
    open24h:   price * 0.99,
    high24h:   price * 1.015,
    low24h:    price * 0.985,
    vol24h:    1_000_000,
    change24h: 1.2,
    ts:        Date.now(),
  }
}

// ── REST: Candles (for Claude technical analysis) ────────────

export interface Candle {
  openTime: number  // ms
  open:  number
  high:  number
  low:   number
  close: number
  vol:   number     // base currency volume
}

/**
 * Get recent OHLCV candles for technical analysis.
 * bar: '1H' | '4H' | '1D'  limit: number of candles (max 100)
 */
export async function getCandles(
  instId: string,
  bar: '1H' | '4H' | '1D' = '1H',
  limit = 24,
): Promise<Candle[]> {
  try {
    const res = await fetch(
      `${BASE}/market/candles?instId=${instId}&bar=${bar}&limit=${limit}&instType=SPOT`,
      { headers: { 'User-Agent': 'OracleX/1.0' }, signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return []
    const body: any = await res.json()
    const raw: string[][] = body.data || []
    // OKX returns newest-first; reverse to get chronological order
    return raw.reverse().map(c => ({
      openTime: parseInt(c[0]),
      open:  parseFloat(c[1]),
      high:  parseFloat(c[2]),
      low:   parseFloat(c[3]),
      close: parseFloat(c[4]),
      vol:   parseFloat(c[5]),
    }))
  } catch {
    return []
  }
}

// ── REST: Candles (for settlement) ───────────────────────────

/**
 * Get settlement price — hourly candle close at deadline
 * Falls back to latest price if candle not found
 */
export async function getSettlementPrice(
  instId: string,
  deadlineMs: number   // milliseconds
): Promise<number | null> {
  // Target: the 1H candle whose open time contains the deadline
  const targetOpenTs = Math.floor(deadlineMs / 3_600_000) * 3_600_000

  // Search up to 3 pages of candles (300 candles = 12.5 days back)
  for (let page = 0; page < 3; page++) {
    try {
      const after = page === 0 ? '' : `&after=${targetOpenTs + (page * 100) * 3_600_000}`
      const res = await fetch(
        `${BASE}/market/candles?instId=${instId}&bar=1H&limit=100&instType=SPOT${after}`,
        { headers: { 'User-Agent': 'OracleX/1.0' }, signal: AbortSignal.timeout(10_000) }
      )
      if (!res.ok) continue
      const body: any = await res.json()
      const candles: string[][] = body.data || []

      const match = candles.find(c => parseInt(c[0]) === targetOpenTs)
      if (match) {
        const price = parseFloat(match[4])
        console.log(`[Settlement] ${instId}: found candle at ${new Date(targetOpenTs).toISOString()} → $${price}`)
        return price
      }
    } catch {}
  }

  // Strict: no fallback. Return null to block resolution until candle is available.
  console.error(`[Settlement] BLOCKED: candle for ${instId} at ${new Date(targetOpenTs).toISOString()} not found. Will retry.`)
  return null
}

// ── Convert price to contract format ─────────────────────────

/** Convert float price to 1e8 integer (contract format) */
export function toContractPrice(price: number): bigint {
  return BigInt(Math.round(price * 1e8))
}

/** Convert 1e8 integer back to float */
export function fromContractPrice(raw: bigint): number {
  return Number(raw) / 1e8
}
