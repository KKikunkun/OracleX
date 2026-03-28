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
import { ethers } from 'ethers'

// Shared RPC provider — reuse across requests
let _provider: ethers.JsonRpcProvider | null = null
function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) _provider = new ethers.JsonRpcProvider(config.RPC_URL)
  return _provider
}

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

interface DemoHooks {
  deployMarket: (params: any) => Promise<any>
  logAction:    (action: any) => void
}

export function createApiServer(
  getMarkets: () => MarketInfo[],
  getActions: () => AgentAction[],
  x402?: X402Hooks,
  demo?: DemoHooks,
) {
  const app = express()
  app.use(cors())
  app.use(express.json())
  app.use(rateLimit)

  // ── Markets ────────────────────────────────────────────────

  app.get('/api/markets', async (_req, res) => {
    const markets = getMarkets()

    // Live refresh pools from chain for real markets
    try {
      const provider = getProvider()
      const abi = ['function yesPool() view returns (uint256)', 'function noPool() view returns (uint256)', 'function getOdds() view returns (uint256, uint256)']
      await Promise.all(markets.filter(m => !m.address.startsWith('0xSIM')).map(async m => {
        try {
          const c = new ethers.Contract(m.address, abi, provider)
          const [yp, np, odds, bal] = await Promise.all([
            c.yesPool(), c.noPool(), c.getOdds(), provider.getBalance(m.address),
          ])
          m.yesPool = yp.toString(); m.noPool = np.toString()
          m.yesOdds = Number(odds[0]); m.noOdds = Number(odds[1])
          m.contractBalance = bal.toString()
        } catch {}
      }))
    } catch {}

    const totalVolume = markets.reduce((sum, m) => {
      return sum + parseFloat(m.contractBalance || '0') / 1e18
    }, 0)
    const stats = {
      totalMarkets:    markets.length,
      activeMarkets:   markets.filter(m => m.status === 'active').length,
      resolvedMarkets: markets.filter(m => m.status === 'resolved').length,
      totalVolume:     totalVolume.toFixed(4),
    }
    res.json({ markets, stats })
  })

  app.get('/api/markets/:address', async (req, res) => {
    const market = getMarkets().find(m =>
      m.address.toLowerCase() === req.params.address.toLowerCase()
    )
    if (!market) { res.status(404).json({ error: 'Market not found' }); return }

    // Live refresh pools from chain if real contract
    if (!market.address.startsWith('0xSIM')) {
      try {
        const provider = getProvider()
        const abi = [
          'function yesPool() view returns (uint256)',
          'function noPool() view returns (uint256)',
          'function getOdds() view returns (uint256 yesOdds, uint256 noOdds)',
        ]
        const c = new ethers.Contract(market.address, abi, provider)
        const [yp, np, odds] = await Promise.all([c.yesPool(), c.noPool(), c.getOdds()])
        market.yesPool = yp.toString()
        market.noPool  = np.toString()
        market.yesOdds = Number(odds.yesOdds)
        market.noOdds  = Number(odds.noOdds)
      } catch {}
    }

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

  // ── Market trades ────────────────────────────────────────────
  // Tracked in-memory + persisted. Also accepts POST from external sources.

  const tradesMap = new Map<string, any[]>()

  // Load from disk
  try {
    const fs = require('fs')
    const pathMod = require('path')
    const tradesFile = pathMod.resolve(process.cwd(), '../.data/trades.json')
    if (fs.existsSync(tradesFile)) {
      const data = JSON.parse(fs.readFileSync(tradesFile, 'utf-8'))
      for (const [addr, trades] of Object.entries(data)) {
        tradesMap.set(addr, trades as any[])
      }
    }
  } catch {}

  function saveTrades() {
    try {
      const fs = require('fs')
      const pathMod = require('path')
      const dir = pathMod.resolve(process.cwd(), '../.data')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const obj: Record<string, any[]> = {}
      for (const [k, v] of tradesMap) obj[k] = v
      fs.writeFileSync(pathMod.join(dir, 'trades.json'), JSON.stringify(obj, null, 2))
    } catch {}
  }

  app.get('/api/markets/:address/trades', (req, res) => {
    const trades = tradesMap.get(req.params.address.toLowerCase()) || []
    res.json({ trades })
  })

  app.post('/api/markets/:address/trades', (req, res) => {
    // Internal only — requires token or localhost
    const token = req.get('x-internal-token')
    const ip = req.ip || req.socket.remoteAddress || ''
    const isLocal = ip.includes('127.0.0.1') || ip.includes('::1')
    if (!isLocal && token !== (process.env.INTERNAL_API_TOKEN || 'oraclex-internal')) {
      res.status(403).json({ error: 'Forbidden' }); return
    }
    const addr = req.params.address.toLowerCase()
    const trade = req.body
    if (!trade || !trade.user || !trade.side) {
      res.status(400).json({ error: 'Invalid trade data' }); return
    }
    const trades = tradesMap.get(addr) || []
    trades.unshift({ ...trade, timestamp: Date.now() })
    if (trades.length > 200) trades.pop()
    tradesMap.set(addr, trades)
    saveTrades()
    res.json({ ok: true })
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
          { name: 'OnchainOS Gateway (TX Broadcast)', type: 'REST (HMAC)', frequency: 'Per deployment/resolution', status: os.dexAggregator.status, endpoint: 'https://web3.okx.com/api/v6/dex/pre-transaction/broadcast-transaction' },
          { name: 'X Layer RPC (fallback)', type: 'JSON-RPC', frequency: 'Fallback if Gateway unavailable', status: 'active', endpoint: 'https://rpc.xlayer.tech' },
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

  // ── Agentic Wallet: bet via backend TEE wallet ─────────────

  app.get('/api/agentic-wallet/status', (_req, res) => {
    try {
      const { execSync } = require('child_process')
      const output = execSync('onchainos wallet status', { timeout: 5000, encoding: 'utf-8' })
      const data = JSON.parse(output)
      if (data.ok && data.data?.loggedIn) {
        // Get address
        let address = ''
        try {
          const addrOutput = execSync('onchainos wallet addresses --chain 196', { timeout: 5000, encoding: 'utf-8' })
          const addrData = JSON.parse(addrOutput)
          address = addrData.data?.xlayer?.[0]?.address || addrData.data?.evm?.[0]?.address || ''
        } catch {}
        res.json({ available: true, email: data.data.email, address, account: data.data.currentAccountName })
      } else {
        res.json({ available: false })
      }
    } catch {
      res.json({ available: false })
    }
  })

  app.post('/api/agentic-bet', async (req, res) => {
    const { marketAddress, side, amount } = req.body
    if (!marketAddress || !side || !amount) {
      res.status(400).json({ error: 'Missing marketAddress, side, or amount' }); return
    }

    // Validate inputs to prevent command injection
    if (!/^0x[0-9a-fA-F]{40}$/.test(marketAddress)) {
      res.status(400).json({ error: 'Invalid market address' }); return
    }
    if (!['yes', 'no'].includes(side.toLowerCase())) {
      res.status(400).json({ error: 'Side must be yes or no' }); return
    }
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0 || numAmount > 1) {
      res.status(400).json({ error: 'Amount must be 0-1 OKB' }); return
    }

    const calldata = side.toLowerCase() === 'yes' ? '0x9e075449' : '0xa9709c0c'

    try {
      const { execFileSync } = require('child_process')
      const args = ['wallet', 'contract-call', '--chain', '196', '--to', marketAddress, '--input-data', calldata, '--value', String(numAmount)]
      const output = execFileSync('onchainos', args, { timeout: 30000, encoding: 'utf-8' })
      const result = JSON.parse(output)

      if (result.ok && result.data?.txHash) {
        // Auto-record trade
        const addr = marketAddress.toLowerCase()
        const trades = tradesMap.get(addr) || []
        trades.unshift({
          user: '0xc981d073a309b7ab3f25705681670d21138db522',
          side: side.toUpperCase(),
          amountIn: amount,
          sharesOut: '...',
          priceAfter: '...',
          txHash: result.data.txHash,
          source: 'Agentic Wallet (TEE)',
          timestamp: Date.now(),
        })
        tradesMap.set(addr, trades)
        saveTrades()

        res.json({ ok: true, txHash: result.data.txHash, wallet: 'Agentic Wallet (TEE)' })
      } else {
        res.status(500).json({ error: result.error || 'Transaction failed' })
      }
    } catch (err) {
      res.status(500).json({ error: (err as Error).message?.slice(0, 100) })
    }
  })

  // ── Demo: quick market for demo/judging ────────────────────

  app.post('/api/demo/quick-market', async (req, res) => {
    if (!demo) { res.status(500).json({ error: 'Demo hooks not configured' }); return }
    const minutes = parseInt(req.query.minutes as string) || 10
    try {
      const { getCurrentPrice } = await import('../shared/okxApi.js')
      const { x402HttpCall } = await import('../shared/x402.js')
      const ticker = await getCurrentPrice('OKB-USDT')
      if (!ticker) { res.status(500).json({ error: 'Price fetch failed' }); return }

      const targetPrice = Math.round(ticker.price)
      const deadlineTs = Math.floor(Date.now() / 1000) + minutes * 60
      const deadlineStr = new Date(deadlineTs * 1000).toUTCString().replace(' GMT', ' UTC')

      // x402 HTTP payment
      await x402HttpCall('signal', 'creator', 'deploy-market', demo.logAction)

      // Deploy market
      const market = await demo.deployMarket({
        instId: 'OKB-USDT',
        currentPrice: ticker.price,
        question: `Will OKB close above $${targetPrice} by ${deadlineStr}?`,
        targetPrice,
        deadline: deadlineTs,
        aiReasoning: `Demo market — ${minutes}min expiry for live demonstration of full market lifecycle.`,
      })

      res.json({
        ok: true,
        market: market ? { address: market.address, txHash: market.txHash, question: market.question } : 'simulation',
        expiresIn: `${minutes} minutes`,
        expiresAt: deadlineStr,
      })
    } catch (err) {
      res.status(500).json({ error: (err as Error).message?.slice(0, 100) })
    }
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
