'use client'

import type { AgentAction } from '@/lib/api'

const roleStyle: Record<string, { color: string; bg: string; label: string }> = {
  signal:   { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',   label: 'Signal'   },
  creator:  { color: '#7C3AED', bg: 'rgba(124,58,237,0.12)',  label: 'Creator'  },
  resolver: { color: '#10B981', bg: 'rgba(16,185,129,0.1)',   label: 'Resolver' },
}

function isClaudeAction(a: AgentAction) {
  return a.action.includes('🤖') || a.action.toLowerCase().includes('claude')
}

export function TxFeed({ actions }: { actions: AgentAction[] }) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#0F0F1A', border: '1px solid rgba(255,255,255,0.07)' }}>

      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-oracle-text uppercase tracking-wider">Agent Activity</span>
          <span className="text-xs px-1.5 py-0.5 rounded font-bold"
            style={{ background: 'rgba(124,58,237,0.15)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.25)' }}>
            AI
          </span>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.05)', color: '#64748B' }}>
          {actions.length} events
        </span>
      </div>

      {/* Feed */}
      <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {actions.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs" style={{ color: '#64748B' }}>
            Waiting for agent activity…
          </p>
        ) : (
          actions.slice(0, 50).map((a) => {
            const isAI   = isClaudeAction(a)
            const style  = roleStyle[a.role] ?? { color: '#94A3B8', bg: 'rgba(255,255,255,0.06)', label: a.role }
            const isAnalysis = isAI && (a.action.includes('analysis') || a.action.includes('complete'))

            return (
              <div key={a.id}
                className="px-5 py-3 transition-colors hover:bg-white/[0.02]"
                style={isAI ? { borderLeft: '2px solid rgba(124,58,237,0.4)' } : {}}>
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs mt-0.5"
                    style={{ background: isAI ? 'rgba(124,58,237,0.15)' : style.bg }}>
                    {isAI ? '🤖' : (a.role === 'signal' ? '◈' : a.role === 'creator' ? '⬡' : '✓')}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Row 1: label + action + time */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-bold uppercase tracking-wider"
                        style={{ color: isAI ? '#9D5CF5' : style.color }}>
                        {isAI ? 'AI Agent' : style.label}
                      </span>
                      <span className="text-xs" style={{ color: '#374151' }}>·</span>
                      <span className="text-xs truncate flex-1" style={{ color: '#64748B' }}>
                        {a.action.replace('🤖 ', '')}
                      </span>
                      <span className="text-xs shrink-0 ml-auto" style={{ color: '#374151' }}>
                        {new Date(a.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Row 2: detail */}
                    {a.detail && (
                      isAnalysis ? (
                        <div className="mt-1.5 px-3 py-2 rounded-xl text-xs leading-relaxed"
                          style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.12)', color: '#A78BFA' }}>
                          {a.detail}
                        </div>
                      ) : (
                        <p className="text-xs truncate" style={{ color: '#475569' }}>{a.detail}</p>
                      )
                    )}

                    {/* Tx link */}
                    {a.txHash && !a.txHash.startsWith('0xSIM') && (
                      <a href={`https://www.oklink.com/xlayer/tx/${a.txHash}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-xs font-mono hover:underline mt-1 block"
                        style={{ color: '#7C3AED' }}>
                        {a.txHash.slice(0, 10)}…
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
