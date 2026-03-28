'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { API_BASE } from '@/lib/api'

interface EvidenceData {
  project: string
  chain: { name: string; chainId: number; explorer: string }
  contracts: { factory: string }
  onchainActivity: { totalMarkets: number; resolvedMarkets: number; onchainTxCount: number; txHashes: any[] }
  x402: { totalPayments: number; totalVolume: number; serviceBreakdown: Record<string, number> }
  integrations: Array<{ name: string; type: string; frequency: string; status: string; endpoint?: string }>
  aiModels: any
  standards: Record<string, string>
}

interface X402Data {
  payments: Array<{ id: string; from: string; to: string; service: string; amount: number; timestamp: number }>
  stats: { totalPayments: number; totalVolume: number }
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={`w-2 h-2 rounded-full inline-block ${
      status === 'active' ? 'bg-oracle-yes' : 'bg-oracle-gold'
    }`} />
  )
}

export default function EvidencePage() {
  const [evidence, setEvidence] = useState<EvidenceData | null>(null)
  const [x402, setX402] = useState<X402Data | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/api/evidence`).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE}/api/x402/payments`).then(r => r.ok ? r.json() : null),
    ]).then(([ev, x]) => {
      setEvidence(ev)
      setX402(x)
    })
    const id = setInterval(() => {
      fetch(`${API_BASE}/api/x402/payments`).then(r => r.ok ? r.json() : null).then(setX402)
    }, 10_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-screen bg-oracle-bg">
      <Header />
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center gap-2 mb-6 text-sm text-oracle-muted">
          <Link href="/" className="hover:text-oracle-text transition-colors">Home</Link>
          <span>/</span>
          <span className="text-oracle-text font-medium">On-Chain Evidence</span>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-oracle-text mb-2">On-Chain Evidence</h1>
          <p className="text-oracle-muted">
            Verifiable proof of OracleX agent activity on X Layer. Every transaction, x402 payment, and AI decision is auditable.
          </p>
        </div>

        {!evidence ? (
          <div className="animate-pulse space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-32 bg-oracle-panel rounded-xl border border-oracle-border" />)}
          </div>
        ) : (
          <div className="space-y-6">

            {/* Chain Info */}
            <div className="border border-oracle-border rounded-xl bg-oracle-panel p-6">
              <h2 className="text-sm font-bold text-oracle-muted uppercase tracking-wider mb-4">Chain</h2>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-oracle-muted">Network</p>
                  <p className="text-sm font-semibold text-oracle-text">{evidence.chain.name} (chainId {evidence.chain.chainId})</p>
                </div>
                <div>
                  <p className="text-xs text-oracle-muted">Factory Contract</p>
                  {evidence.contracts.factory && evidence.contracts.factory !== 'pending deployment' ? (
                    <a href={`${evidence.chain.explorer}/address/${evidence.contracts.factory}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-sm font-mono text-oracle-accent hover:underline">
                      {evidence.contracts.factory.slice(0, 10)}...{evidence.contracts.factory.slice(-6)}
                    </a>
                  ) : (
                    <p className="text-sm text-oracle-gold font-medium">Pending deployment</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-oracle-muted">Explorer</p>
                  <a href={evidence.chain.explorer} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-oracle-accent hover:underline">OKLink X Layer</a>
                </div>
              </div>
            </div>

            {/* Activity Stats */}
            <div className="grid sm:grid-cols-4 gap-4">
              {[
                { label: 'Markets Created', value: evidence.onchainActivity.totalMarkets, color: 'text-oracle-accent' },
                { label: 'Markets Resolved', value: evidence.onchainActivity.resolvedMarkets, color: 'text-oracle-yes' },
                { label: 'On-Chain TXs', value: evidence.onchainActivity.onchainTxCount, color: 'text-oracle-text' },
                { label: 'x402 Payments', value: x402?.stats?.totalPayments ?? 0, color: 'text-oracle-gold' },
              ].map(s => (
                <div key={s.label} className="border border-oracle-border rounded-xl bg-oracle-panel p-4 text-center">
                  <p className={`text-3xl font-bold font-mono ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-oracle-muted mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* x402 Protocol */}
            <div className="border border-oracle-border rounded-xl bg-oracle-panel p-6">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-sm font-bold text-oracle-muted uppercase tracking-wider">x402 Protocol Activity</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-oracle-gold/12 text-oracle-gold font-semibold border border-oracle-gold/20">HTTP 402</span>
              </div>
              {x402 && x402.payments.length > 0 ? (
                <>
                  <div className="flex gap-6 mb-4 text-sm">
                    <span className="text-oracle-muted">Total Volume: <span className="text-oracle-gold font-mono font-bold">{x402.stats.totalVolume.toFixed(4)} OKB</span></span>
                    <span className="text-oracle-muted">Payments: <span className="text-oracle-text font-mono font-bold">{x402.stats.totalPayments}</span></span>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {x402.payments.slice(0, 20).map((p) => (
                      <div key={p.id} className="flex items-center gap-3 text-xs py-2 border-b border-oracle-border/40 last:border-0">
                        <span className="text-oracle-accent font-semibold uppercase w-16">{p.from}</span>
                        <span className="text-oracle-muted">→</span>
                        <span className="text-oracle-yes font-semibold uppercase w-16">{p.to}</span>
                        <span className="text-oracle-muted flex-1 truncate">{p.service}</span>
                        <span className="text-oracle-gold font-mono font-bold">{p.amount.toFixed(4)} OKB</span>
                        <span className="text-oracle-muted/50">{new Date(p.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-oracle-muted text-sm">Waiting for agent service calls...</p>
              )}
            </div>

            {/* OnchainOS Integrations */}
            <div className="border border-oracle-border rounded-xl bg-oracle-panel p-6">
              <h2 className="text-sm font-bold text-oracle-muted uppercase tracking-wider mb-4">OnchainOS Integrations</h2>
              <div className="space-y-2">
                {evidence.integrations.map((int, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-oracle-border/40 last:border-0">
                    <StatusDot status={int.status} />
                    <span className="text-sm text-oracle-text font-medium flex-1">{int.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-oracle-accent/10 text-oracle-accent font-mono">{int.type}</span>
                    <span className="text-xs text-oracle-muted">{int.frequency}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ERC Standards */}
            <div className="border border-oracle-border rounded-xl bg-oracle-panel p-6">
              <h2 className="text-sm font-bold text-oracle-muted uppercase tracking-wider mb-4">Agent Standards</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {Object.entries(evidence.standards).map(([std, desc]) => (
                  <div key={std} className="border border-oracle-border/60 rounded-xl p-4 bg-oracle-accent/5">
                    <span className="font-mono font-bold text-oracle-accent">{std}</span>
                    <p className="text-sm text-oracle-muted mt-1">{desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Models */}
            <div className="border border-oracle-border rounded-xl bg-oracle-panel p-6">
              <h2 className="text-sm font-bold text-oracle-muted uppercase tracking-wider mb-4">AI Models</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {Object.entries(evidence.aiModels).map(([agent, info]: [string, any]) => (
                  <div key={agent} className="border border-oracle-border/60 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-bold text-oracle-text capitalize">{agent} Agent</span>
                      <span className="text-xs font-mono text-oracle-accent">{info.model}</span>
                    </div>
                    <p className="text-xs text-oracle-muted">{info.usage}</p>
                    {info.tools && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {info.tools.map((t: string) => (
                          <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-oracle-bg border border-oracle-border font-mono text-oracle-muted">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* On-chain TX Hashes */}
            {evidence.onchainActivity.txHashes.length > 0 && (
              <div className="border border-oracle-border rounded-xl bg-oracle-panel p-6">
                <h2 className="text-sm font-bold text-oracle-muted uppercase tracking-wider mb-4">Verified Transactions</h2>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {evidence.onchainActivity.txHashes.map((tx, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm py-1.5 border-b border-oracle-border/40 last:border-0">
                      <a href={`${evidence.chain.explorer}/tx/${tx.hash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-mono text-oracle-accent hover:underline text-xs">
                        {tx.hash.slice(0, 14)}...
                      </a>
                      <span className="text-xs text-oracle-muted flex-1 truncate">{tx.action}</span>
                      <span className="text-xs text-oracle-muted/50">{new Date(tx.time).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
