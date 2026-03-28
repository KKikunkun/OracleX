// L0 Header — machine-readable state metadata
// ROLE: orchestrator | STATUS: starting | LAST_ACTION: init | NEXT_ACTION: start_agents
// AGENTS: signal, creator, resolver | API_PORT: 3001

import { SignalAgent }   from './signal/index.js'
import { CreatorAgent }  from './creator/index.js'
import { ResolverAgent } from './resolver/index.js'
import { createApiServer } from './api/server.js'
import { config }        from './shared/config.js'
import { loadMarkets, saveMarket, loadActions, saveActions } from './shared/store.js'
import { x402HttpCall, getPayments, getX402Stats, getServiceCatalog } from './shared/x402.js'
import type { MarketInfo, AgentAction } from './shared/types.js'

// ── Shared state (persisted to .data/ directory) ─────────────

const marketsMap = loadMarkets()
const actions    = loadActions()

function getMarkets(): MarketInfo[] {
  return Array.from(marketsMap.values()).sort((a, b) => b.createdAt - a.createdAt)
}

function getActions(): AgentAction[] {
  return actions.slice(0, 100)
}

function logAction(action: Omit<AgentAction, 'id' | 'timestamp'>) {
  const entry: AgentAction = {
    ...action,
    id:        `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  }
  // actions IS the store cache (same reference), so just unshift + persist
  actions.unshift(entry)
  if (actions.length > 500) actions.pop()
  saveActions(actions)
}

// ── Resolver Agent ────────────────────────────────────────────

const resolver = new ResolverAgent(
  logAction,
  (address, finalPrice, outcomeYes, txHash) => {
    const market = marketsMap.get(address)
    if (market) {
      // x402: Creator pays Resolver for resolve-market service
      x402HttpCall('creator', 'resolver', 'resolve-market', logAction)
      market.status          = 'resolved'
      market.resolved        = true
      market.outcomeYes      = outcomeYes
      market.resolutionPrice = finalPrice
      if (txHash) market.resolveTxHash = txHash
      saveMarket(market)
    }
  }
)

// ── Creator Agent ─────────────────────────────────────────────

const creator = new CreatorAgent(
  logAction,
  (market) => {
    marketsMap.set(market.address, market)
    saveMarket(market)
  }
)

// ── Signal Agent ──────────────────────────────────────────────

const signal = new SignalAgent(
  // onSignal → x402 payment → forward to Creator
  async (params) => {
    // x402: Signal pays Creator for deploy-market service
    x402HttpCall('signal', 'creator', 'deploy-market', logAction)
    await creator.deployMarket(params)
  },
  logAction,
  getMarkets   // give Claude visibility into existing markets
)

// ── Bootstrap: load onchain markets ──────────────────────────

async function loadExistingMarkets() {
  const addresses = await creator.loadOnchainMarkets()
  for (const address of addresses) {
    if (!marketsMap.has(address)) {
      const market = await creator.readMarket(address)
      if (market) {
        marketsMap.set(address, market)
        saveMarket(market)
      }
    }
  }
}

// ── Start everything ──────────────────────────────────────────

async function main() {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║        OracleX Agents v1.1           ║
  ║   Signal → Creator → Resolver        ║
  ║   OKX Market API as Oracle           ║
  ║   X Layer Mainnet (chainId 196)      ║
  ╚═══════════════════════════════════════╝
  `)

  // Init wallets
  await creator.init()
  await resolver.init()

  // Load existing markets from chain
  await loadExistingMarkets()
  console.log(`[Boot] Loaded ${marketsMap.size} markets (${actions.length} actions from disk)\n`)

  // Start API server FIRST (x402 HTTP calls need it running)
  const { server } = createApiServer(getMarkets, getActions, { getPayments, getX402Stats, getServiceCatalog })
  await new Promise<void>(resolve => {
    server.listen(config.PORT, () => {
      console.log(`API server: http://localhost:${config.PORT}`)
      console.log(`   GET  /api/markets`)
      console.log(`   GET  /api/x402/payments`)
      console.log(`   GET  /x402/:agent/:service  ← real HTTP 402`)
      console.log(`   WS   ws://localhost:${config.PORT}\n`)
      resolve()
    })
  })

  // Reconcile x402 payments via real HTTP (server must be running)
  const x402Stats = getX402Stats()
  if (marketsMap.size > 0 && x402Stats.totalPayments === 0) {
    console.log(`[Boot] Reconciling x402 via HTTP for ${marketsMap.size} deployed markets`)
    for (const market of marketsMap.values()) {
      await x402HttpCall('signal', 'creator', 'deploy-market', logAction)
    }
  }

  // Start agent loops
  signal.start()
  resolver.start(getMarkets)
}

main().catch(console.error)
