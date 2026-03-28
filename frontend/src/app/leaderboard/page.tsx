'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { fetchStats, fetchActions, type AgentAction } from '@/lib/api'

interface AgentStats {
  role: string; icon: string; label: string; color: string
  signals: number; creates: number; resolves: number
  accuracy: number | null; description: string; erc: string
}

function StatBox({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      <p className="text-xs text-oracle-muted mt-1">{label}</p>
    </div>
  )
}

// Static class maps — Tailwind JIT requires complete class strings, no template interpolation
const COLOR_MAP: Record<string, { text: string; bg: string; border: string; hoverBorder: string }> = {
  'oracle-gold':   { text: 'text-oracle-gold',   bg: 'bg-oracle-gold/12',   border: 'border-oracle-gold',   hoverBorder: 'hover:border-oracle-gold/40' },
  'oracle-accent': { text: 'text-oracle-accent',  bg: 'bg-oracle-accent/12', border: 'border-oracle-accent',  hoverBorder: 'hover:border-oracle-accent/40' },
  'oracle-yes':    { text: 'text-oracle-yes',     bg: 'bg-oracle-yes/12',    border: 'border-oracle-yes',     hoverBorder: 'hover:border-oracle-yes/40' },
}

function AgentCard({ agent, actions }: { agent: AgentStats; actions: AgentAction[] }) {
  const myActions = actions.filter(a => a.role === agent.role).slice(0, 5)
  const cls = COLOR_MAP[agent.color] ?? COLOR_MAP['oracle-accent']
  return (
    <div className={`border-2 rounded-xl bg-oracle-panel p-6 border-oracle-border ${cls.hoverBorder} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${cls.bg} flex items-center justify-center text-xl ${cls.text}`}>
            {agent.icon}
          </div>
          <div>
            <h2 className={`text-base font-bold ${cls.text}`}>{agent.label}</h2>
            <p className="text-xs text-oracle-muted mt-0.5 max-w-[180px]">{agent.description}</p>
          </div>
        </div>
        <span className="text-xs border border-oracle-border px-2.5 py-1 rounded-full font-mono text-oracle-muted bg-oracle-bg">{agent.erc}</span>
      </div>

      <div className="grid grid-cols-3 gap-4 py-4 border-y border-oracle-border/60 mb-5">
        <StatBox value={String(agent.signals)}  label="Signals"  color={cls.text} />
        <StatBox value={String(agent.creates)}  label="Deploys"  color="text-oracle-text" />
        <StatBox
          value={agent.accuracy !== null ? `${agent.accuracy.toFixed(0)}%` : '—'}
          label="Accuracy"
          color={agent.accuracy && agent.accuracy > 60 ? 'text-oracle-yes' : 'text-oracle-muted'}
        />
      </div>

      {myActions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-oracle-muted uppercase tracking-wider mb-2 font-semibold">Recent Activity</p>
          {myActions.map(a => (
            <div key={a.id} className="flex items-start gap-2 text-sm">
              <span className={`${cls.text} shrink-0 mt-0.5`}>›</span>
              <span className="text-oracle-muted truncate">{a.action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LeaderboardPage() {
  const [stats,   setStats]   = useState<any>({})
  const [actions, setActions] = useState<AgentAction[]>([])

  async function load() {
    const [s, a] = await Promise.all([fetchStats(), fetchActions()])
    setStats(s)
    setActions(a)
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 10_000)
    return () => clearInterval(id)
  }, [])

  const signalCount  = actions.filter(a => a.role === 'signal').length
  const createCount  = actions.filter(a => a.role === 'creator').length
  const resolveCount = actions.filter(a => a.role === 'resolver').length

  // Accuracy not yet tracked on-chain — show null until real data available
  const accuracy: number | null = null

  const agents: AgentStats[] = [
    {
      role: 'signal', icon: '◈', label: 'Signal Agent', color: 'oracle-gold',
      signals: signalCount, creates: 0, resolves: 0, accuracy: null,
      description: 'Monitors OKX price feeds 24/7, detects volatility, triggers market creation',
      erc: 'Job Commit Hash',
    },
    {
      role: 'creator', icon: '⬡', label: 'Creator Agent', color: 'oracle-accent',
      signals: signalCount, creates: createCount, resolves: 0, accuracy: null,
      description: 'Deploys PredictionMarket contracts on X Layer, manages nonce & liquidity',
      erc: 'Job Hash + Reputation',
    },
    {
      role: 'resolver', icon: '✓', label: 'Resolver Agent', color: 'oracle-yes',
      signals: 0, creates: 0, resolves: resolveCount, accuracy,
      description: 'Polls OKX Market API at deadline, settles markets with cryptographic proof',
      erc: 'Job Complete Hash',
    },
  ]

  return (
    <div className="min-h-screen bg-oracle-bg">
      <Header />

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-6 text-sm text-oracle-muted">
          <Link href="/" className="hover:text-oracle-text transition-colors">Home</Link>
          <span>/</span>
          <span className="text-oracle-text font-medium">Agent Leaderboard</span>
        </div>

        {/* Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-oracle-text mb-2">Agent Performance</h1>
          <p className="text-oracle-muted">
            Three autonomous AI agents running the OracleX prediction market pipeline.
            Each action is recorded on-chain via cryptographic job hashes.
          </p>
        </div>

        {/* Global stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Markets Created',  value: stats.agents?.creates  ?? createCount,  color: 'text-oracle-accent' },
            { label: 'Markets Resolved', value: stats.agents?.resolves ?? resolveCount, color: 'text-oracle-yes' },
            { label: 'Signals Fired',    value: stats.agents?.signals  ?? signalCount,  color: 'text-oracle-gold' },
            { label: 'On-chain TXs',     value: stats.agents?.txs      ?? 0,            color: 'text-oracle-text' },
          ].map(s => (
            <div key={s.label} className="border border-oracle-border rounded-xl bg-oracle-panel p-4 text-center">
              <p className={`text-2xl font-bold font-mono ${s.color}`}>{String(s.value)}</p>
              <p className="text-xs text-oracle-muted mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Agent cards */}
        <div className="grid md:grid-cols-3 gap-5 mb-8">
          {agents.map(a => <AgentCard key={a.role} agent={a} actions={actions} />)}
        </div>

        {/* ERC standards */}
        <div className="border border-oracle-border rounded-xl bg-oracle-panel p-6">
          <h3 className="text-sm font-bold text-oracle-muted uppercase tracking-wider mb-5">On-Chain Audit Trail</h3>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                std: 'Job Hash',
                name: 'Commit / Complete',
                desc: 'Every market deployment records a keccak256 hash of the job parameters on-chain. Every resolution records a completion hash. Enables cryptographic audit of every agent action.',
                color: 'text-oracle-accent',
                bg: 'bg-oracle-accent/8',
              },
              {
                std: 'Reputation',
                name: 'Agent Performance',
                desc: 'Creator Agent reputation increments with each successful market deployment. Resolver Agent reputation tracks settlement accuracy. Scores are publicly verifiable on X Layer.',
                color: 'text-oracle-yes',
                bg: 'bg-oracle-yes/8',
              },
            ].map(e => (
              <div key={e.std} className={`border border-oracle-border/60 rounded-xl p-4 ${e.bg}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`font-mono font-bold text-base ${e.color}`}>{e.std}</span>
                  <span className="text-oracle-muted">·</span>
                  <span className="text-oracle-text font-medium text-sm">{e.name}</span>
                </div>
                <p className="text-sm text-oracle-muted leading-relaxed">{e.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
