// L0 Header — machine-readable state metadata
// ROLE: api/server | STATUS: serving | LAST_ACTION: init | NEXT_ACTION: handle_requests

import express from 'express'
import cors from 'cors'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import type { MarketInfo, AgentAction } from '../shared/types.js'
import { getCurrentPrice } from '../shared/okxApi.js'
import { config } from '../shared/config.js'
import { getDexSwapQuote, getWalletBalance, getOnchainOSStatus, getOnchainOKBPrice, XLAYER_TOKENS } from '../shared/onchainos.js'
import { handleX402Request } from '../shared/x402.js'

// ── Rate limiter (in-memory, per IP) ────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT   = 60   // requests per window
const RATE_WINDOW  = 60_000  // 1 minute

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  const now = Date.now()
  let entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW }
    rateLimitMap.set(ip, entry)
  }

  entry.count++
  res.setHeader('X-RateLimit-Limit', RATE_LIMIT)
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT - entry.count))

  if (entry.count > RATE_LIMIT) {
    res.status(429).json({ error: 'Too many requests', retryAfterMs: entry.resetAt - now })
    return
  }
  next()
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, 5 * 60_000)

// ── Price cache ─────────────────────────────────────────────

const priceCache: Map<string, { price: number; change24h: number; ts: number }> = new Map()
const PRICE_TTL = 5_000

async function getCachedPrice(instId: string) {
  const cached = priceCache.get(instId)
  if (cached && Date.now() - cached.ts < PRICE_TTL) return cached
  const ticker = await getCurrentPrice(instId)
  if (ticker) {
    const entry = { price: ticker.price, change24h: ticker.change24h, ts: Date.now() }
    priceCache.set(instId, entry)
    return entry
  }
  return cached ?? null
}

// ── WebSocket broadcast ─────────────────────────────────────

let wss: WebSocketServer | null = null
let lastBroadcastMarkets = ''
let lastBroadcastActions = ''

function broadcast(type: string, data: unknown) {
  if (!wss) return
  const msg = JSON.stringify({ type, data, ts: Date.now() })
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  }
}

// Periodically push updates to WS clients
function startBroadcastLoop(
  getMarkets: () => MarketInfo[],
  getActions: () => AgentAction[]
) {
  setInterval(() => {
    const markets = getMarkets()
    const actions = getActions().slice(0, 50)
    const marketsJson = JSON.stringify(markets)
    const actionsJson = JSON.stringify(actions)

    if (marketsJson !== lastBroadcastMarkets) {
      lastBroadcastMarkets = marketsJson
      broadcast('markets', markets)
    }
    if (actionsJson !== lastBroadcastActions) {
      lastBroadcastActions = actionsJson
      broadcast('actions', actions)
    }
  }, 3_000)
}

// ── Server ──────────────────────────────────────────────────

interface X402Hooks {
  getPayments:      (limit?: number) => any[]
  getX402Stats:     () => any
  getServiceCatalog: () => any
}

export function createApiServer(
  getMarkets: () => MarketInfo[],
  getActions: () => AgentAction[],
  x402?: X402Hooks,
) {
  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use(rateLimit)

  // ── Markets ────────────────────────────────────────────────

  app.get('/api/markets', (_req, res) => {
    const markets = getMarkets()
    const totalVolume = markets.reduce((sum, m) => {
      return sum + (parseFloat(m.yesPool) + parseFloat(m.noPool)) / 1e18
    }, 0)
    const stats = {
      totalMarkets:    markets.length,
      activeMarkets:   markets.filter(m => m.status === 'active').length,
      resolvedMarkets: markets.filter(m => m.status === 'resolved').length,
      totalVolume:     totalVolume.toFixed(4),
    }
    res.json({ markets, stats })
  })

  app.get('/api/markets/:address', (req, res) => {
    const market = getMarkets().find(m =>
      m.address.toLowerCase() === req.params.address.toLowerCase()
    )
    if (!market) { res.status(404).json({ error: 'Market not found' }); return }
    res.json({ market })
  })

  // ── Agent activity ─────────────────────────────────────────

  app.get('/api/agents/actions', (_req, res) => {
    res.json({ actions: getActions().slice(0, 50) })
  })

  // ── Stats ──────────────────────────────────────────────────

  app.get('/api/stats', (_req, res) => {
    const markets = getMarkets()
    const actions = getActions()
    res.json({
      markets: {
        total:    markets.length,
        active:   markets.filter(m => m.status === 'active').length,
        resolved: markets.filter(m => m.status === 'resolved').length,
      },
      agents: {
        txs:     actions.filter(a => a.txHash).length,
        signals: actions.filter(a => a.role === 'signal').length,
        creates: actions.filter(a => a.role === 'creator').length,
        resolves:actions.filter(a => a.role === 'resolver').length,
      },
      contract: {
        factoryAddress: config.FACTORY_ADDRESS || null,
        explorerBase:   config.EXPLORER,
      },
    })
  })

  // ── Live OKX prices (for frontend ticker) ──────────────────
  app.get('/api/prices', async (_req, res) => {
    const pairs = ['BTC-USDT', 'ETH-USDT', 'OKB-USDT']
    const prices = await Promise.all(
      pairs.map(async id => {
        const p = await getCachedPrice(id)
        return p ? { instId: id, price: p.price, change24h: p.change24h } : null
      })
    )
    res.json({ prices: prices.filter(Boolean), ts: Date.now() })
  })

  // ── x402 Protocol: Real HTTP 402 routes ────────────────────
  // Agents call these endpoints — server returns real HTTP 402 status

  app.get('/x402/:agent/:service', (req, res) => {
    const { agent, service } = req.params
    const result = handleX402Request(agent, service, {
      'x-payment-verified': req.headers['x-payment-verified'] as string,
      'x-payment-proof':    req.headers['x-payment-proof'] as string,
      'x-payment-from':     req.headers['x-payment-from'] as string,
    })

    // Set x402 response headers
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value)
    }
    res.status(result.status).json(result.body)
  })

  // ── x402 query endpoints ──────────────────────────────────

  app.get('/api/x402/payments', (_req, res) => {
    if (!x402) { res.json({ payments: [], stats: {} }); return }
    res.json({
      payments: x402.getPayments(50),
      stats:    x402.getX402Stats(),
    })
  })

  app.get('/api/x402/catalog', (_req, res) => {
    if (!x402) { res.json({ catalog: [] }); return }
    res.json({ catalog: x402.getServiceCatalog() })
  })

  // ── OnchainOS: DEX Aggregator + Wallet API ─────────────────

  app.get('/api/onchainos/dex-quote', async (req, res) => {
    const from   = (req.query.from   as string) || XLAYER_TOKENS.OKB
    const to     = (req.query.to     as string) || XLAYER_TOKENS.USDT
    const amount = (req.query.amount as string) || '1000000000000000000'
    const quote = await getDexSwapQuote(from, to, amount)
    res.json({ quote })
  })

  app.get('/api/onchainos/wallet', async (req, res) => {
    const address = (req.query.address as string) || config.PLATFORM_WALLET || ''
    if (!address) { res.json({ balances: [], error: 'No address provided' }); return }
    const balances = await getWalletBalance(address)
    res.json({ address, balances })
  })

  app.get('/api/onchainos/okb-price', async (_req, res) => {
    const price = await getOnchainOKBPrice()
    res.json({ source: 'OKX DEX Aggregator V6', price, ts: Date.now() })
  })

  app.get('/api/onchainos/status', (_req, res) => {
    res.json(getOnchainOSStatus())
  })

  // ── Evidence (on-chain proof for judges) ───────────────────

  app.get('/api/evidence', (_req, res) => {
    const markets = getMarkets()
    const actions = getActions()
    const onchainTxs = actions.filter(a => a.txHash && !a.txHash.startsWith('0xSIM'))

    res.json({
      project: 'OracleX — AI Prediction Markets on X Layer',
      chain: { name: 'X Layer Mainnet', chainId: 196, rpc: 'https://rpc.xlayer.tech', explorer: 'https://www.oklink.com/xlayer' },
      contracts: {
        factory: config.FACTORY_ADDRESS || 'pending deployment',
      },
      onchainActivity: {
        totalMarkets:    markets.length,
        resolvedMarkets: markets.filter(m => m.resolved).length,
        onchainTxCount:  onchainTxs.length,
        txHashes:        onchainTxs.slice(0, 20).map(a => ({ hash: a.txHash, action: a.action, time: new Date(a.timestamp).toISOString() })),
      },
      x402: x402 ? x402.getX402Stats() : { totalPayments: 0, totalVolume: 0 },
      integrations: (() => {
        const os = getOnchainOSStatus()
        return [
          { name: 'OKX Market API v5', type: 'REST', frequency: 'Every 5s (cached)', status: 'active', endpoint: 'https://www.okx.com/api/v5/market/ticker' },
          { name: 'OKX Candlestick Data', type: 'REST', frequency: 'On demand (Claude analysis)', status: 'active', endpoint: 'https://www.okx.com/api/v5/market/candles' },
            { name: 'OnchainOS DEX Aggregator V6', type: 'REST (HMAC)', frequency: 'On demand', status: os.dexAggregator.status, endpoint: 'https://web3.okx.com/api/v6/dex/aggregator/quote' },
          { name: 'X Layer RPC Balance Query', type: 'JSON-RPC', frequency: 'Per deployment', status: 'active', endpoint: 'https://rpc.xlayer.tech (eth_getBalance)' },
          { name: 'X Layer RPC', type: 'JSON-RPC', frequency: 'Per transaction', status: 'active', endpoint: 'https://rpc.xlayer.tech' },
          { name: 'x402 HTTP 402 Protocol', type: 'HTTP 402', frequency: 'Per agent service call', status: 'active', details: 'Signal→Creator, Creator→Resolver' },
          { name: 'Crypto Fear & Greed Index', type: 'REST', frequency: 'Per Claude analysis run', status: 'active' },
          { name: 'OKX Wallet (EIP-1193)', type: 'DApp Connect', frequency: 'On user action', status: 'active' },
          { name: 'AI LLM (configurable, OpenAI-compatible)', type: 'REST', frequency: 'Every 30min (Signal) + per resolution', status: 'active' },
        ]
      })(),
      aiModels: {
        signal: { model: process.env.CLAUDE_MODEL || 'gpt-4o-mini', usage: 'Tool-use agentic loop for market creation', tools: ['get_price', 'get_candles', 'get_market_sentiment', 'list_active_markets', 'create_market'] },
        resolver: { model: process.env.CLAUDE_MODEL || 'gpt-4o-mini', usage: 'Post-resolution market analysis' },
      },
      standards: {
        'Job Commit/Complete Hash': 'Every market deployment and resolution records a keccak256 hash on-chain for cryptographic audit',
        'Agent Reputation': 'Agent actions tracked on-chain — deployment count, resolution accuracy, publicly verifiable',
      },
      ts: Date.now(),
    })
  })

  // ── Health ────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', name: 'OracleX Agents', ts: Date.now() })
  })

  // ── HTTP + WebSocket server ────────────────────────────────

  const server = http.createServer(app)
  wss = new WebSocketServer({ server })

  wss.on('connection', (ws) => {
    // Send initial state on connect
    const markets = getMarkets()
    ws.send(JSON.stringify({ type: 'markets', data: markets, ts: Date.now() }))
    ws.send(JSON.stringify({ type: 'actions', data: getActions().slice(0, 50), ts: Date.now() }))
  })

  startBroadcastLoop(getMarkets, getActions)

  return { app, server }
}
