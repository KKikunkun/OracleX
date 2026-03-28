// Shared types across all agents

export type AgentRole = 'signal' | 'creator' | 'resolver'
export type MarketStatus = 'active' | 'closed' | 'resolved'

export interface MarketInfo {
  address:         string
  question:        string
  instId:          string
  targetPrice:     number   // USD float
  deadline:        number   // unix seconds
  yesPool:         string   // wei string
  noPool:          string   // wei string
  yesOdds:         number   // 0–10000 bps
  noOdds:          number
  status:          MarketStatus
  resolved:        boolean
  outcomeYes:      boolean | null
  resolutionPrice: number | null
  currentPrice:    number | null
  createdAt:       number   // unix seconds (block timestamp)
  txHash?:         string
  resolveTxHash?:  string
  // ── Claude AI fields ─────────────────────────────────────────
  aiReasoning?:    string   // Why Claude created this market (shown on card)
  aiAnalysis?:     string   // Post-resolution analysis from Claude
  contractBalance?: string  // Real OKB locked in contract (wei)
}

// ── Instruction Queue (blockquote protocol) ──────────────────
// > FROM:SignalAgent TO:CreatorAgent ACTION:deploy_market DATA:{...}

export interface QueueMessage {
  from:   AgentRole
  to:     AgentRole
  action: string
  data:   Record<string, any>
  ts:     number
}

export interface AgentAction {
  id:        string
  role:      AgentRole
  action:    string
  detail:    string
  txHash?:   string
  timestamp: number
  marketAddress?: string
}

export interface DeployParams {
  instId:        string
  currentPrice:  number
  question:      string
  targetPrice:   number
  deadline:      number   // unix seconds
  aiReasoning?:  string   // Claude's reasoning for creating this market
}
