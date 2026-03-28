// File-based persistence for markets and agent actions
// Data is saved to .data/ directory as JSON, survives restarts

import fs from 'fs'
import path from 'path'
import type { MarketInfo, AgentAction } from './types.js'

const DATA_DIR = path.resolve(process.cwd(), '../.data')
const MARKETS_FILE = path.join(DATA_DIR, 'markets.json')
const ACTIONS_FILE = path.join(DATA_DIR, 'actions.json')

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJSON(filePath: string, data: unknown) {
  ensureDir()
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, filePath)
}

// ── Markets ─────────────────────────────────────────────────

let marketsCache: Map<string, MarketInfo> | null = null

export function loadMarkets(): Map<string, MarketInfo> {
  if (marketsCache) return marketsCache
  const arr = readJSON<MarketInfo[]>(MARKETS_FILE, [])
  marketsCache = new Map(arr.map(m => [m.address, m]))
  return marketsCache
}

export function saveMarkets(markets: Map<string, MarketInfo>) {
  marketsCache = markets
  const arr = Array.from(markets.values())
  writeJSON(MARKETS_FILE, arr)
}

export function saveMarket(market: MarketInfo) {
  const markets = loadMarkets()
  markets.set(market.address, market)
  saveMarkets(markets)
}

// ── Actions ─────────────────────────────────────────────────

let actionsCache: AgentAction[] | null = null

export function loadActions(): AgentAction[] {
  if (actionsCache) return actionsCache
  actionsCache = readJSON<AgentAction[]>(ACTIONS_FILE, [])
  return actionsCache
}

export function saveActions(actions: AgentAction[]) {
  actionsCache = actions
  // Keep max 500 actions on disk
  writeJSON(ACTIONS_FILE, actions.slice(0, 500))
}

export function appendAction(action: AgentAction) {
  const actions = loadActions()
  actions.unshift(action)
  if (actions.length > 500) actions.pop()
  saveActions(actions)
}
