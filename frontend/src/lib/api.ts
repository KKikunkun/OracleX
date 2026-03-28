// API client — polls agent server + WebSocket real-time updates

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
export const WS_URL   = API_BASE.replace(/^http/, 'ws')

export interface MarketInfo {
  address:         string
  question:        string
  instId:          string
  targetPrice:     number
  deadline:        number
  yesPool:         string
  noPool:          string
  yesOdds:         number   // 0-10000 bps
  noOdds:          number
  status:          'active' | 'closed' | 'resolved'
  resolved:        boolean
  outcomeYes:      boolean | null
  resolutionPrice: number | null
  currentPrice:    number | null
  createdAt:       number
  txHash?:         string
  resolveTxHash?:  string
  aiReasoning?:    string
  aiAnalysis?:     string
  contractBalance?: string
}

export interface AgentAction {
  id:            string
  role:          'signal' | 'creator' | 'resolver'
  action:        string
  detail:        string
  txHash?:       string
  timestamp:     number
  marketAddress?: string
}

export async function fetchMarkets(): Promise<{ markets: MarketInfo[]; stats: any }> {
  const res = await fetch(`${API_BASE}/api/markets`, { next: { revalidate: 0 } })
  if (!res.ok) return { markets: [], stats: {} }
  return res.json()
}

export async function fetchMarket(address: string): Promise<MarketInfo | null> {
  const res = await fetch(`${API_BASE}/api/markets/${address}`, { next: { revalidate: 0 } })
  if (!res.ok) return null
  const d = await res.json()
  return d.market
}

export async function fetchActions(): Promise<AgentAction[]> {
  const res = await fetch(`${API_BASE}/api/agents/actions`, { next: { revalidate: 0 } })
  if (!res.ok) return []
  const d = await res.json()
  return d.actions || []
}

export async function fetchStats(): Promise<any> {
  const res = await fetch(`${API_BASE}/api/stats`, { next: { revalidate: 0 } })
  if (!res.ok) return {}
  return res.json()
}

// ── WebSocket hook ──────────────────────────────────────────

type WSCallback = (type: string, data: any) => void

export function connectWebSocket(onMessage: WSCallback): () => void {
  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function connect() {
    try {
      ws = new WebSocket(WS_URL)
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string)
          onMessage(msg.type, msg.data)
        } catch {}
      }
      ws.onclose = () => {
        timer = setTimeout(connect, 3000)
      }
      ws.onerror = () => {
        ws?.close()
      }
    } catch {
      timer = setTimeout(connect, 3000)
    }
  }

  connect()

  return () => {
    if (timer) clearTimeout(timer)
    ws?.close()
  }
}
