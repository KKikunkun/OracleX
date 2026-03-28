'use client'

import Link from 'next/link'
import type { MarketInfo } from '@/lib/api'

function deadlineMs(deadline: number) {
  return deadline > 1e12 ? deadline : deadline * 1000
}

function formatTimeLeft(deadline: number) {
  const diff = deadlineMs(deadline) - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h > 48) return `${Math.floor(h / 24)}d left`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m left`
}

function statusBadge(m: MarketInfo) {
  if (m.resolved) {
    return (
      <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
        style={m.outcomeYes
          ? { background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.2)' }
          : { background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>
        {m.outcomeYes ? 'YES WON' : 'NO WON'}
      </span>
    )
  }
  const expired = deadlineMs(m.deadline) < Date.now()
  if (expired) return (
    <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
      style={{ background: 'rgba(100,116,139,0.12)', color: '#64748B', border: '1px solid rgba(100,116,139,0.2)' }}>
      ENDED
    </span>
  )
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold"
      style={{ color: '#10B981' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-oracle-yes animate-pulse inline-block" />
      LIVE
    </span>
  )
}

const isSimAddress = (addr: string) => addr.startsWith('0xSIM_')

export function MarketCard({ m }: { m: MarketInfo }) {
  const yesOdds   = (m.yesOdds / 100).toFixed(1)
  const noOdds    = (m.noOdds  / 100).toFixed(1)
  const totalPool = (parseFloat(m.yesPool) / 1e18 + parseFloat(m.noPool) / 1e18).toFixed(4)

  return (
    <Link href={`/market/${m.address}`} className="block group">
      <div className="rounded-2xl p-5 cursor-pointer transition-all duration-300"
        style={{
          background: '#0F0F1A',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.border = '1px solid rgba(124,58,237,0.35)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)'
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.border = '1px solid rgba(255,255,255,0.07)'
          ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
          ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
        }}>

        {/* Top row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-1 rounded-lg"
              style={{ background: 'rgba(124,58,237,0.12)', color: '#A78BFA', border: '1px solid rgba(124,58,237,0.2)' }}>
              {m.instId}
            </span>
            {m.aiReasoning && (
              <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                style={{ background: 'rgba(124,58,237,0.15)', color: '#7C3AED', border: '1px solid rgba(124,58,237,0.3)' }}>
                AI
              </span>
            )}
          </div>
          {statusBadge(m)}
        </div>

        {/* Question */}
        <p className="text-[15px] font-semibold text-oracle-text leading-snug mb-3 group-hover:text-oracle-accenthi transition-colors">
          {m.question}
        </p>

        {/* AI Reasoning bubble */}
        {m.aiReasoning && !m.resolved && (
          <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}>
            <span className="text-xs mt-0.5 shrink-0">🤖</span>
            <p className="text-xs leading-relaxed line-clamp-2"
              style={{ color: '#A78BFA' }}>
              {m.aiReasoning}
            </p>
          </div>
        )}

        {/* Post-resolution analysis */}
        {m.resolved && m.aiAnalysis && (
          <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)' }}>
            <span className="text-xs mt-0.5 shrink-0">🤖</span>
            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: '#FCD34D' }}>
              {m.aiAnalysis}
            </p>
          </div>
        )}

        {/* Probability bar */}
        <div className="mb-4">
          <div className="flex text-sm mb-2 justify-between font-semibold">
            <span style={{ color: '#10B981' }}>YES {yesOdds}%</span>
            <span style={{ color: '#EF4444' }}>NO {noOdds}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${m.yesOdds / 100}%`, background: 'linear-gradient(90deg, #10B981, #059669)' }} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs" style={{ color: '#64748B' }}>
          <span>Pool: <span className="text-oracle-subtext font-medium">{totalPool} OKB</span></span>
          {m.currentPrice && (
            <span className="font-mono" style={{ color: '#94A3B8' }}>
              ${m.currentPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          )}
          <span className={deadlineMs(m.deadline) < Date.now() && !m.resolved ? 'text-oracle-no' : 'text-oracle-muted'}>
            {formatTimeLeft(m.deadline)}
          </span>
        </div>

        {/* Resolved footer */}
        {(m.resolved && m.resolutionPrice) || isSimAddress(m.address) ? (
          <div className="flex items-center justify-between mt-3 pt-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {m.resolved && m.resolutionPrice ? (
              <span className="text-xs font-medium" style={{ color: '#F59E0B' }}>
                Settled @ ${m.resolutionPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            ) : <span />}
            {isSimAddress(m.address) && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ color: '#F59E0B', border: '1px solid rgba(245,158,11,0.25)' }}>
                demo
              </span>
            )}
          </div>
        ) : null}
      </div>
    </Link>
  )
}
