'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { BettingPanel } from '@/components/BettingPanel'
import { TradeHistory } from '@/components/TradeHistory'
import { fetchMarket, type MarketInfo } from '@/lib/api'

const isSimAddress = (addr: string) => addr.startsWith('0xSIM_')

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-oracle-border/50 last:border-0">
      <span className="text-sm text-oracle-muted">{label}</span>
      <span className={`text-sm font-mono font-medium ${accent ?? 'text-oracle-text'}`}>{value}</span>
    </div>
  )
}

export default function MarketPage() {
  const { address } = useParams<{ address: string }>()
  const [market, setMarket] = useState<MarketInfo | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const m = await fetchMarket(address)
    setMarket(m)
    setLoading(false)
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 8_000)
    return () => clearInterval(id)
  }, [address])

  if (loading) {
    return (
      <div className="min-h-screen bg-oracle-bg">
        <Header />
        <div className="flex items-center justify-center h-64 text-oracle-muted">Loading…</div>
      </div>
    )
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-oracle-bg">
        <Header />
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <p className="text-oracle-muted">Market not found</p>
          <Link href="/" className="text-oracle-accent text-sm underline">← Back</Link>
        </div>
      </div>
    )
  }

  const simMode    = isSimAddress(market.address)
  const yesOdds    = (market.yesOdds / 100).toFixed(1)
  const noOdds     = (market.noOdds  / 100).toFixed(1)
  const yesPoolOKB = (parseFloat(market.yesPool) / 1e18).toFixed(4)
  const noPoolOKB  = (parseFloat(market.noPool)  / 1e18).toFixed(4)
  const deadlineMs = market.deadline > 1e12 ? market.deadline : market.deadline * 1000
  const deadline   = new Date(deadlineMs).toLocaleString()
  const timeLeft   = deadlineMs - Date.now()

  return (
    <div className="min-h-screen bg-oracle-bg">
      <Header />

      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link href="/" className="text-sm text-oracle-muted hover:text-oracle-text transition-colors mb-5 inline-flex items-center gap-1">
          ← All Markets
        </Link>

        {/* Demo banner */}
        {simMode && (
          <div className="mb-5 border border-oracle-gold/30 bg-oracle-gold/8 rounded-xl px-5 py-3.5 flex items-center gap-3">
            <span className="text-oracle-gold text-xl">⚡</span>
            <div>
              <span className="text-oracle-gold font-semibold">Demo Mode</span>
              <span className="text-oracle-muted text-sm ml-2">— Real contract not yet deployed. Agents are simulating the full lifecycle.</span>
            </div>
          </div>
        )}

        {/* Title + status */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <span className="text-sm text-oracle-accent font-mono font-semibold">{market.instId}</span>
            {market.resolved ? (
              <span className={`text-sm px-3 py-1 rounded-full font-semibold ${market.outcomeYes ? 'bg-oracle-yes/15 text-oracle-yes' : 'bg-oracle-no/15 text-oracle-no'}`}>
                RESOLVED · {market.outcomeYes ? 'YES' : 'NO'}
              </span>
            ) : (
              <span className="text-sm px-3 py-1 rounded-full bg-oracle-accent/12 text-oracle-accent font-semibold">LIVE</span>
            )}
            {!market.resolved && timeLeft > 0 && (
              <span className="text-sm text-oracle-muted ml-auto">
                Expires {Math.floor(timeLeft / 60000)}m {Math.floor((timeLeft % 60000) / 1000)}s
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-oracle-text">{market.question}</h1>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: odds + details */}
          <div className="lg:col-span-2 space-y-5">
            {/* Odds visualiser */}
            <div className="border border-oracle-border rounded-xl bg-oracle-panel p-6">
              <h2 className="text-sm font-bold text-oracle-muted uppercase tracking-wider mb-5">Current Odds</h2>
              <div className="flex gap-4 mb-4">
                <div className="flex-1 text-center p-4 rounded-xl bg-oracle-yes/8 border border-oracle-yes/20">
                  <div className="text-4xl font-bold text-oracle-yes font-mono">{yesOdds}%</div>
                  <div className="text-sm text-oracle-muted mt-1.5">YES</div>
                </div>
                <div className="flex-1 text-center p-4 rounded-xl bg-oracle-no/8 border border-oracle-no/20">
                  <div className="text-4xl font-bold text-oracle-no font-mono">{noOdds}%</div>
                  <div className="text-sm text-oracle-muted mt-1.5">NO</div>
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-oracle-border overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-oracle-yes to-oracle-accent rounded-full transition-all duration-500"
                  style={{ width: `${market.yesOdds / 100}%` }}
                />
              </div>
            </div>

            {/* Market info */}
            <div className="border border-oracle-border rounded-xl bg-oracle-panel p-6">
              <h2 className="text-sm font-bold text-oracle-muted uppercase tracking-wider mb-4">Market Details</h2>
              <InfoRow label="Contract"    value={`${address.slice(0, 8)}…${address.slice(-6)}`} />
              <InfoRow label="Instrument"  value={market.instId}     accent="text-oracle-accent" />
              <InfoRow label="Target Price" value={`$${market.targetPrice.toLocaleString()}`} accent="text-oracle-gold" />
              {market.currentPrice && (
                <InfoRow label="Current Price" value={`$${market.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`} />
              )}
              <InfoRow label="YES Reserve (virtual)" value={`${yesPoolOKB}`} accent="text-oracle-yes" />
              <InfoRow label="NO Reserve (virtual)"  value={`${noPoolOKB}`}  accent="text-oracle-no" />
              {market.contractBalance && (
                <InfoRow label="TVL (real)" value={`${(parseFloat(market.contractBalance) / 1e18).toFixed(4)} OKB`} accent="text-oracle-gold" />
              )}
              <InfoRow label="Deadline"    value={deadline} />
              {market.resolved && market.resolutionPrice && (
                <InfoRow label="Settlement Price" value={`$${market.resolutionPrice.toLocaleString()}`} accent="text-oracle-gold" />
              )}
              {!simMode && market.txHash && (
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm text-oracle-muted">Deploy TX</span>
                  <a href={`https://www.oklink.com/xlayer/tx/${market.txHash}`} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-mono text-oracle-accent hover:underline">
                    {market.txHash.slice(0, 10)}…
                  </a>
                </div>
              )}
              {!simMode && market.resolveTxHash && (
                <div className="flex justify-between items-center py-2.5">
                  <span className="text-sm text-oracle-muted">Resolve TX</span>
                  <a href={`https://www.oklink.com/xlayer/tx/${market.resolveTxHash}`} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-mono text-oracle-yes hover:underline">
                    {market.resolveTxHash.slice(0, 10)}…
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Right: betting panel + trade history */}
          <div className="space-y-5">
            <BettingPanel market={market} />

            {!simMode && <TradeHistory address={address} />}

            <div className="border border-oracle-border rounded-xl bg-oracle-panel p-5">
              <h3 className="text-sm font-bold text-oracle-muted uppercase tracking-wider mb-4">How It Works</h3>
              <ol className="space-y-2.5 text-sm text-oracle-muted">
                <li><span className="text-oracle-accent font-bold mr-1.5">1.</span>OracleX Signal Agent detects price movement</li>
                <li><span className="text-oracle-accent font-bold mr-1.5">2.</span>Creator Agent deploys this market onchain</li>
                <li><span className="text-oracle-accent font-bold mr-1.5">3.</span>Place your OKB bet on YES or NO</li>
                <li><span className="text-oracle-accent font-bold mr-1.5">4.</span>Resolver Agent settles using live OKX price at deadline</li>
                <li><span className="text-oracle-accent font-bold mr-1.5">5.</span>Winners claim proportional pool rewards (2% fee)</li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
