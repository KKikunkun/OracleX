'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { MarketCard } from '@/components/MarketCard'
import { TxFeed } from '@/components/TxFeed'
import { PriceTicker } from '@/components/PriceTicker'
import { fetchMarkets, fetchActions, connectWebSocket, type MarketInfo, type AgentAction } from '@/lib/api'

// Static class maps — required so Tailwind JIT doesn't purge these classes
const STEP_ACTIVE: Record<string, string> = {
  'oracle-gold':   'border-oracle-gold/50   bg-oracle-gold/8   text-oracle-gold',
  'oracle-accent': 'border-oracle-accent/50 bg-oracle-accent/8 text-oracle-accent',
  'oracle-yes':    'border-oracle-yes/50    bg-oracle-yes/8    text-oracle-yes',
}

function AgentStep({
  icon, label, sub, color, active,
}: { icon: string; label: string; sub: string; color: string; active?: boolean }) {
  const activeClass = STEP_ACTIVE[color] ?? 'border-oracle-accent/50 bg-oracle-accent/8 text-oracle-accent'
  return (
    <div className={`flex flex-col items-center text-center px-5 py-4 rounded-xl border-2 transition-all ${
      active ? activeClass : 'border-oracle-border bg-oracle-panel'
    }`}>
      <span className={`text-3xl mb-1.5 ${active ? activeClass.split(' ').find(c => c.startsWith('text-')) : 'text-oracle-muted'}`}>{icon}</span>
      <span className={`text-sm font-bold uppercase tracking-wider ${active ? activeClass.split(' ').find(c => c.startsWith('text-')) : 'text-oracle-muted'}`}>{label}</span>
      <span className="text-xs text-oracle-muted mt-1 hidden sm:block">{sub}</span>
    </div>
  )
}

export default function HomePage() {
  const [markets, setMarkets] = useState<MarketInfo[]>([])
  const [actions, setActions] = useState<AgentAction[]>([])
  const [stats,   setStats]   = useState<any>({})
  const [filter,  setFilter]  = useState<'all' | 'active' | 'resolved'>('all')
  const [loading, setLoading] = useState(true)
  const [pulse,   setPulse]   = useState(0)

  async function load() {
    const [mRes, aRes] = await Promise.all([fetchMarkets(), fetchActions()])
    setMarkets(mRes.markets)
    setStats(mRes.stats)
    setActions(aRes)
    setLoading(false)
  }

  useEffect(() => {
    load()
    // WebSocket for real-time updates, polling as fallback
    const disconnect = connectWebSocket((type, data) => {
      if (type === 'markets') setMarkets(data)
      if (type === 'actions') setActions(data)
    })
    const id = setInterval(load, 15_000) // slower polling as fallback
    const p = setInterval(() => setPulse(v => (v + 1) % 3), 2_000)
    return () => { disconnect(); clearInterval(id); clearInterval(p) }
  }, [])

  const filtered = markets.filter(m => {
    if (filter === 'active')   return !m.resolved && m.status === 'active'
    if (filter === 'resolved') return m.resolved
    return true
  })

  const latestSignal  = actions.find(a => a.role === 'signal')
  const latestCreate  = actions.find(a => a.role === 'creator')
  const latestResolve = actions.find(a => a.role === 'resolver')

  return (
    <div className="min-h-screen bg-oracle-bg">
      <Header />
      <PriceTicker />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="border-b border-oracle-border relative overflow-hidden"
        style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(124,58,237,0.3) 0%, transparent 70%), #08080F' }}>
        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="max-w-7xl mx-auto px-6 py-14 relative">
          <div className="mb-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs mb-6 font-medium"
              style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: '#A78BFA' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-oracle-accent animate-pulse inline-block" />
              Live on X Layer · Powered by AI + OKX Market API
            </div>
            <h1 className="text-5xl sm:text-6xl font-bold text-oracle-text mb-5 leading-[1.1] tracking-tight">
              AI Agents Create &amp; Settle<br className="hidden sm:block" />
              <span style={{ background: 'linear-gradient(135deg, #A78BFA, #7C3AED, #6D28D9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}> Prediction Markets</span>
            </h1>
            <p className="text-oracle-subtext text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Three autonomous AI agents watch OKX prices 24/7, deploy markets onchain,
              and resolve them using real price data — no human needed.
            </p>
          </div>

          {/* Agent pipeline */}
          <div className="max-w-2xl mx-auto mb-10">
            <div className="grid grid-cols-3 gap-3 items-center">
              <AgentStep icon="◈" label="Signal" sub="Detects volatility" color="oracle-gold" active={pulse === 0} />
              <div className="flex items-center justify-center">
                <div className={`h-0.5 flex-1 transition-colors duration-700 ${pulse >= 1 ? 'bg-oracle-accent' : 'bg-oracle-border'}`} />
                <span className={`mx-1 text-sm transition-colors ${pulse >= 1 ? 'text-oracle-accent' : 'text-oracle-border'}`}>→</span>
                <div className={`h-0.5 flex-1 transition-colors duration-700 ${pulse >= 2 ? 'bg-oracle-yes' : 'bg-oracle-border'}`} />
              </div>
              <AgentStep icon="⬡" label="Creator" sub="Deploys contract" color="oracle-accent" active={pulse === 1} />
            </div>
            <div className="flex justify-center mt-3">
              <div className="flex flex-col items-center">
                <div className={`w-0.5 h-5 transition-colors ${pulse === 2 ? 'bg-oracle-yes' : 'bg-oracle-border'}`} />
                <AgentStep icon="✓" label="Resolver" sub="Settles via OKX price" color="oracle-yes" active={pulse === 2} />
              </div>
            </div>
          </div>

          {/* Latest agent actions */}
          {(latestSignal || latestCreate || latestResolve) && (
            <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              {latestSignal && (
                <div className="rounded-xl px-4 py-3"
                  style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                  <span className="font-semibold block mb-0.5 text-xs" style={{ color: '#F59E0B' }}>Signal</span>
                  <span className="truncate block text-xs" style={{ color: '#64748B' }}>{latestSignal.detail}</span>
                </div>
              )}
              {latestCreate && (
                <div className="rounded-xl px-4 py-3"
                  style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
                  <span className="font-semibold block mb-0.5 text-xs" style={{ color: '#A78BFA' }}>Creator</span>
                  <span className="truncate block text-xs" style={{ color: '#64748B' }}>{latestCreate.detail}</span>
                </div>
              )}
              {latestResolve && (
                <div className="rounded-xl px-4 py-3"
                  style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                  <span className="font-semibold block mb-0.5 text-xs" style={{ color: '#10B981' }}>Resolver</span>
                  <span className="truncate block text-xs" style={{ color: '#64748B' }}>{latestResolve.detail}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Stats bar ─────────────────────────────────────────── */}
      <div className="border-b border-oracle-border" style={{ background: '#0A0A14' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-4 divide-x divide-oracle-border/60">
            {[
              { label: 'Markets',  value: stats.totalMarkets    ?? '—' },
              { label: 'Active',   value: stats.activeMarkets   ?? '—' },
              { label: 'Resolved', value: stats.resolvedMarkets ?? '—' },
              { label: 'TVL',      value: stats.totalVolume ? `${parseFloat(stats.totalVolume).toFixed(4)} OKB` : '—' },
            ].map(s => (
              <div key={s.label} className="px-6 py-4 text-center">
                <p className="text-sm text-oracle-muted">{s.label}</p>
                <p className="text-2xl font-bold font-mono text-oracle-text">{String(s.value)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col lg:flex-row gap-8">

          {/* Markets grid */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-base font-bold text-oracle-text uppercase tracking-wider">Markets</h2>
              <div className="flex gap-1.5">
                {(['all', 'active', 'resolved'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors font-medium ${
                      filter === f
                        ? 'bg-oracle-accent text-white'
                        : 'border border-oracle-border text-oracle-muted hover:text-oracle-text hover:border-oracle-accent/50'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                    {f === 'active' && stats.activeMarkets > 0 && (
                      <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-oracle-yes inline-block" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="border border-oracle-border rounded-xl bg-oracle-panel h-40 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="border border-oracle-border/60 border-dashed rounded-xl py-20 text-center">
                <p className="text-oracle-muted">Agents are warming up…</p>
                <p className="text-oracle-muted/60 text-sm mt-1">Markets will appear within 10 seconds</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filtered.map(m => <MarketCard key={m.address} m={m} />)}
              </div>
            )}
          </div>

          {/* Agent feed */}
          <div className="lg:w-80 shrink-0">
            <TxFeed actions={actions} />

            <div className="mt-5 border border-oracle-border rounded-xl bg-oracle-panel p-5">
              <p className="text-sm font-semibold text-oracle-muted uppercase tracking-wider mb-4">How It Works</p>
              <ol className="space-y-3">
                {[
                  { n: '1', c: 'text-oracle-gold',   t: 'Signal Agent watches OKX price feeds 24/7' },
                  { n: '2', c: 'text-oracle-accent',  t: 'Creator Agent deploys a YES/NO market onchain' },
                  { n: '3', c: 'text-oracle-text',    t: 'You bet OKB on the outcome' },
                  { n: '4', c: 'text-oracle-yes',     t: 'Resolver Agent settles using live OKX price' },
                  { n: '5', c: 'text-oracle-gold',    t: 'Winners claim proportional pool (2% fee)' },
                ].map(({ n, c, t }) => (
                  <li key={n} className="flex gap-3 text-sm text-oracle-muted">
                    <span className={`${c} font-bold shrink-0`}>{n}.</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-oracle-border py-8" style={{ background: '#08080F' }}>
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-oracle-muted">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)' }}>
              <span className="text-white text-[8px] font-bold">O</span>
            </div>
            <span>OracleX — AI Prediction Markets on X Layer</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://www.oklink.com/xlayer/address/0x62a42AE83304eBa619d71f5f86B87E665A8D7c1E" target="_blank" rel="noopener noreferrer" className="hover:text-oracle-accent transition-colors">Factory Contract</a>
            <span className="text-oracle-border">|</span>
            <a href="https://x.com/OracleX_Agnet" target="_blank" rel="noopener noreferrer" className="hover:text-oracle-accent transition-colors">@OracleX_Agnet</a>
            <span className="text-oracle-border">|</span>
            <span>Powered by OKX + AI</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
