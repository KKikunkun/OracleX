'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseAbi, formatEther } from 'viem'
import { Header } from '@/components/Header'
import { fetchMarkets, type MarketInfo } from '@/lib/api'

const MARKET_ABI = parseAbi([
  'function yesShares(address) view returns (uint256)',
  'function noShares(address) view returns (uint256)',
  'function claimed(address) view returns (bool)',
  'function claimWinnings()',
])

interface Position {
  market: MarketInfo
  yesShares: bigint
  noShares: bigint
  claimed: boolean
}

function PositionCard({ pos }: { pos: Position }) {
  const m = pos.market
  const hasYes = pos.yesShares > 0n
  const hasNo  = pos.noShares > 0n
  const canClaim = m.resolved && !pos.claimed && (
    (m.outcomeYes && hasYes) || (!m.outcomeYes && hasNo)
  )
  const isWinner = m.resolved && (
    (m.outcomeYes && hasYes) || (!m.outcomeYes && hasNo)
  )
  const isLoser = m.resolved && !isWinner && (hasYes || hasNo)

  const { writeContract, data: txHash, isPending } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  return (
    <div className={`border rounded-xl bg-oracle-panel p-5 transition-all ${
      isWinner ? 'border-oracle-yes/30' :
      isLoser  ? 'border-oracle-no/30' :
      'border-oracle-border'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold px-2 py-1 rounded-lg"
          style={{ background: 'rgba(124,58,237,0.12)', color: '#A78BFA', border: '1px solid rgba(124,58,237,0.2)' }}>
          {m.instId}
        </span>
        {m.resolved ? (
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
            m.outcomeYes ? 'bg-oracle-yes/12 text-oracle-yes' : 'bg-oracle-no/12 text-oracle-no'
          }`}>
            {m.outcomeYes ? 'YES WON' : 'NO WON'}
          </span>
        ) : (
          <span className="text-xs text-oracle-yes font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-oracle-yes animate-pulse" /> LIVE
          </span>
        )}
      </div>

      <Link href={`/market/${m.address}`}>
        <p className="text-sm font-semibold text-oracle-text mb-3 hover:text-oracle-accent transition-colors">
          {m.question}
        </p>
      </Link>

      <div className="grid grid-cols-2 gap-3 mb-3">
        {hasYes && (
          <div className="rounded-lg px-3 py-2 bg-oracle-yes/8 border border-oracle-yes/20">
            <p className="text-xs text-oracle-muted">YES Shares</p>
            <p className="text-sm font-bold text-oracle-yes font-mono">
              {formatEther(pos.yesShares)} OKB
            </p>
          </div>
        )}
        {hasNo && (
          <div className="rounded-lg px-3 py-2 bg-oracle-no/8 border border-oracle-no/20">
            <p className="text-xs text-oracle-muted">NO Shares</p>
            <p className="text-sm font-bold text-oracle-no font-mono">
              {formatEther(pos.noShares)} OKB
            </p>
          </div>
        )}
      </div>

      {canClaim && !pos.claimed && !isSuccess && (
        <button
          onClick={() => writeContract({
            address: m.address as `0x${string}`,
            abi: MARKET_ABI,
            functionName: 'claimWinnings',
          })}
          disabled={isPending || confirming}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-oracle-gold hover:bg-oracle-gold/90 text-white transition-colors disabled:opacity-50"
        >
          {isPending ? 'Confirm...' : confirming ? 'Claiming...' : 'Claim Winnings'}
        </button>
      )}
      {isSuccess && (
        <p className="text-sm text-oracle-yes font-medium text-center">
          Claimed!{' '}
          {txHash && (
            <a href={`https://www.oklink.com/xlayer/tx/${txHash}`}
              target="_blank" rel="noopener noreferrer" className="underline">
              View tx
            </a>
          )}
        </p>
      )}
      {pos.claimed && (
        <p className="text-xs text-oracle-muted text-center">Already claimed</p>
      )}
      {isLoser && !pos.claimed && (
        <p className="text-xs text-oracle-no text-center">No winnings to claim</p>
      )}
    </div>
  )
}

export default function PortfolioContent() {
  const { address, isConnected } = useAccount()
  const [markets, setMarkets]    = useState<MarketInfo[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    fetchMarkets().then(r => setMarkets(r.markets)).finally(() => setLoading(false))
  }, [])

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

        {!isConnected ? (
          <div className="border border-oracle-border border-dashed rounded-xl py-20 text-center">
            <p className="text-oracle-muted text-lg mb-2">Connect your wallet to view positions</p>
            <p className="text-oracle-muted/60 text-sm">Your YES/NO shares and claimable winnings will appear here</p>
          </div>
        ) : loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map(i => (
              <div key={i} className="border border-oracle-border rounded-xl bg-oracle-panel h-40 animate-pulse" />
            ))}
          </div>
        ) : positions.length === 0 ? (
          <div className="border border-oracle-border border-dashed rounded-xl py-20 text-center">
            <p className="text-oracle-muted text-lg mb-2">No positions yet</p>
            <p className="text-oracle-muted/60 text-sm mb-4">Place bets on active markets to see them here</p>
            <Link href="/" className="text-oracle-accent text-sm underline">Browse Markets</Link>
          </div>
        ) : (
          <>
            {activePositions.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-oracle-text uppercase tracking-wider mb-4">
                  Active Positions ({activePositions.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {activePositions.map(p => <PositionCard key={p.market.address} pos={p} />)}
                </div>
              </div>
            )}

            {resolvedPositions.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-oracle-text uppercase tracking-wider mb-4">
                  Resolved ({resolvedPositions.length})
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {resolvedPositions.map(p => <PositionCard key={p.market.address} pos={p} />)}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
