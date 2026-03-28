'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseAbi, formatEther } from 'viem'
import { Header } from '@/components/Header'
import { fetchMarkets, API_BASE, type MarketInfo } from '@/lib/api'

const MARKET_ABI = parseAbi([
  'function yesShares(address) view returns (uint256)',
  'function noShares(address) view returns (uint256)',
  'function claimed(address) view returns (bool)',
  'function claimWinnings()',
  'function refund()',
])

interface Position {
  market: MarketInfo
  yesShares: bigint
  noShares: bigint
  claimed: boolean
}

interface AgenticWalletInfo {
  available: boolean
  email?: string
  address?: string
}

interface AgenticTrade {
  side: string
  amountIn: string
  timestamp: number
  txHash?: string
  source?: string
}

function PositionCard({ pos }: { pos: Position }) {
  const m = pos.market
  const hasYes = pos.yesShares > 0n
  const hasNo  = pos.noShares > 0n
  const isWinner = m.resolved && (
    (m.outcomeYes && hasYes) || (!m.outcomeYes && hasNo)
  )
  const isLoser = m.resolved && !isWinner && (hasYes || hasNo)

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  return (
    <div className={`border rounded-xl bg-oracle-panel p-5 transition-all ${
      isWinner ? 'border-oracle-yes/30' : isLoser ? 'border-oracle-no/30' : 'border-oracle-border'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold px-2 py-1 rounded-lg"
          style={{ background: 'rgba(124,58,237,0.12)', color: '#A78BFA', border: '1px solid rgba(124,58,237,0.2)' }}>
          {m.instId}
        </span>
        {m.resolved ? (
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${m.outcomeYes ? 'bg-oracle-yes/12 text-oracle-yes' : 'bg-oracle-no/12 text-oracle-no'}`}>
            {m.outcomeYes ? 'YES WON' : 'NO WON'}
          </span>
        ) : (
          <span className="text-xs text-oracle-yes font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-oracle-yes animate-pulse" /> LIVE
          </span>
        )}
      </div>
      <Link href={`/market/${m.address}`}>
        <p className="text-sm font-semibold text-oracle-text mb-3 hover:text-oracle-accent transition-colors">{m.question}</p>
      </Link>
      <div className="grid grid-cols-2 gap-3 mb-3">
        {hasYes && (
          <div className="rounded-lg px-3 py-2 bg-oracle-yes/8 border border-oracle-yes/20">
            <p className="text-xs text-oracle-muted">YES Shares</p>
            <p className="text-sm font-bold text-oracle-yes font-mono">{formatEther(pos.yesShares)} shares</p>
          </div>
        )}
        {hasNo && (
          <div className="rounded-lg px-3 py-2 bg-oracle-no/8 border border-oracle-no/20">
            <p className="text-xs text-oracle-muted">NO Shares</p>
            <p className="text-sm font-bold text-oracle-no font-mono">{formatEther(pos.noShares)} shares</p>
          </div>
        )}
      </div>
      {isSuccess && (
        <p className="text-sm text-oracle-yes font-medium text-center">
          Success!{' '}{txHash && <a href={`https://www.oklink.com/xlayer/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">View tx</a>}
        </p>
      )}
      {pos.claimed && <p className="text-xs text-oracle-muted text-center">Already claimed</p>}
      {isLoser && !pos.claimed && <p className="text-xs text-oracle-no text-center">No winnings to claim</p>}
    </div>
  )
}

// Agentic Wallet trade card (from trade history, not on-chain reads)
function AgenticTradeCard({ market, trades }: { market: MarketInfo; trades: AgenticTrade[] }) {
  return (
    <div className="border border-oracle-accent/30 rounded-xl bg-oracle-panel p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2 py-1 rounded-lg"
            style={{ background: 'rgba(124,58,237,0.12)', color: '#A78BFA', border: '1px solid rgba(124,58,237,0.2)' }}>
            {market.instId}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded font-bold"
            style={{ background: 'rgba(124,58,237,0.15)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.3)' }}>
            Agentic Wallet
          </span>
        </div>
        {market.resolved ? (
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${market.outcomeYes ? 'bg-oracle-yes/12 text-oracle-yes' : 'bg-oracle-no/12 text-oracle-no'}`}>
            {market.outcomeYes ? 'YES WON' : 'NO WON'}
          </span>
        ) : (
          <span className="text-xs text-oracle-yes font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-oracle-yes animate-pulse" /> LIVE
          </span>
        )}
      </div>
      <Link href={`/market/${market.address}`}>
        <p className="text-sm font-semibold text-oracle-text mb-3 hover:text-oracle-accent transition-colors">{market.question}</p>
      </Link>
      <div className="space-y-1.5">
        {trades.map((t, i) => (
          <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-oracle-border/20 last:border-0">
            <span className={`font-bold ${t.side === 'YES' ? 'text-oracle-yes' : 'text-oracle-no'}`}>{t.side}</span>
            <span className="font-mono text-oracle-text">{t.amountIn} OKB</span>
            <span className="text-oracle-muted">{t.source || 'TEE'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PortfolioContent() {
  const { address, isConnected } = useAccount()
  const [markets, setMarkets]    = useState<MarketInfo[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading]     = useState(true)
  const [agenticWallet, setAgenticWallet] = useState<AgenticWalletInfo | null>(null)
  const [agenticTrades, setAgenticTrades] = useState<Map<string, AgenticTrade[]>>(new Map())

  useEffect(() => {
    fetchMarkets().then(r => setMarkets(r.markets)).finally(() => setLoading(false))
    // Check Agentic Wallet status
    fetch(`${API_BASE}/api/agentic-wallet/status`).then(r => r.json()).then(setAgenticWallet).catch(() => {})
  }, [])

  // Load Agentic Wallet trades from trade history
  useEffect(() => {
    if (!agenticWallet?.available || !agenticWallet.address || markets.length === 0) return
    const addr = agenticWallet.address.toLowerCase()
    Promise.all(markets.map(async m => {
      try {
        const res = await fetch(`${API_BASE}/api/markets/${m.address.toLowerCase()}/trades`)
        if (!res.ok) return { market: m, trades: [] }
        const d = await res.json()
        const myTrades = (d.trades || []).filter((t: any) => t.user?.toLowerCase() === addr)
        return { market: m, trades: myTrades }
      } catch { return { market: m, trades: [] } }
    })).then(results => {
      const map = new Map<string, AgenticTrade[]>()
      for (const r of results) {
        if (r.trades.length > 0) map.set(r.market.address, r.trades)
      }
      setAgenticTrades(map)
    })
  }, [agenticWallet, markets.length])

  const realMarkets = markets.filter(m => !m.address.startsWith('0xSIM_'))

  const contracts = realMarkets.flatMap(m => [
    { address: m.address as `0x${string}`, abi: MARKET_ABI, functionName: 'yesShares' as const, args: [address!] },
    { address: m.address as `0x${string}`, abi: MARKET_ABI, functionName: 'noShares' as const,  args: [address!] },
    { address: m.address as `0x${string}`, abi: MARKET_ABI, functionName: 'claimed' as const,   args: [address!] },
  ])

  const { data: results } = useReadContracts({
    contracts: isConnected && address ? contracts : [],
    query: { enabled: isConnected && !!address && realMarkets.length > 0 },
  })

  useEffect(() => {
    if (!results || realMarkets.length === 0) return
    const pos: Position[] = []
    for (let i = 0; i < realMarkets.length; i++) {
      const yesShares = (results[i * 3]?.result as bigint) ?? 0n
      const noShares  = (results[i * 3 + 1]?.result as bigint) ?? 0n
      const claimed   = (results[i * 3 + 2]?.result as boolean) ?? false
      if (yesShares > 0n || noShares > 0n) {
        pos.push({ market: realMarkets[i], yesShares, noShares, claimed })
      }
    }
    setPositions(pos)
  }, [results, realMarkets.length])

  const activePositions   = positions.filter(p => !p.market.resolved)
  const resolvedPositions = positions.filter(p => p.market.resolved)
  const agenticMarkets = markets.filter(m => agenticTrades.has(m.address))

  return (
    <div className="min-h-screen bg-oracle-bg">
      <Header />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-6 text-sm text-oracle-muted">
          <Link href="/" className="hover:text-oracle-text transition-colors">Home</Link>
          <span>/</span>
          <span className="text-oracle-text font-medium">My Portfolio</span>
        </div>

        <h1 className="text-3xl font-bold text-oracle-text mb-2">My Portfolio</h1>
        <p className="text-oracle-muted mb-8">Your positions across all OracleX prediction markets.</p>

        {/* Agentic Wallet positions */}
        {agenticWallet?.available && agenticMarkets.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-sm font-bold text-oracle-text uppercase tracking-wider">
                Agentic Wallet Positions ({agenticMarkets.length})
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(124,58,237,0.12)', color: '#A78BFA' }}>
                {agenticWallet.email}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-oracle-yes animate-pulse" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {agenticMarkets.map(m => (
                <AgenticTradeCard key={m.address} market={m} trades={agenticTrades.get(m.address) || []} />
              ))}
            </div>
          </div>
        )}

        {/* Browser wallet positions */}
        {isConnected && activePositions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-oracle-text uppercase tracking-wider mb-4">
              OKX Wallet — Active ({activePositions.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {activePositions.map(p => <PositionCard key={p.market.address} pos={p} />)}
            </div>
          </div>
        )}

        {isConnected && resolvedPositions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-oracle-text uppercase tracking-wider mb-4">
              OKX Wallet — Resolved ({resolvedPositions.length})
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {resolvedPositions.map(p => <PositionCard key={p.market.address} pos={p} />)}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isConnected && agenticMarkets.length === 0 && (
          <div className="border border-oracle-border border-dashed rounded-xl py-20 text-center">
            <p className="text-oracle-muted text-lg mb-2">Connect your wallet to view positions</p>
            <p className="text-oracle-muted/60 text-sm">Your YES/NO shares and claimable winnings will appear here</p>
            {agenticWallet?.available && (
              <p className="text-oracle-accent text-sm mt-3">Agentic Wallet is online — place bets to see them here</p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
