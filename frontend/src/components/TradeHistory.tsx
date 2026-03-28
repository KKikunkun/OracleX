'use client'

import { useEffect, useState } from 'react'
import { API_BASE } from '@/lib/api'

interface Trade {
  user:       string
  side:       'YES' | 'NO'
  amountIn:   string
  sharesOut:  string
  priceAfter: string
  txHash:     string
  block:      number
}

export function TradeHistory({ address }: { address: string }) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/markets/${address}/trades`)
        if (res.ok) {
          const d = await res.json()
          setTrades(d.trades || [])
        }
      } catch {}
      setLoading(false)
    }
    load()
    const id = setInterval(load, 15_000)
    return () => clearInterval(id)
  }, [address])

  return (
    <div className="border border-oracle-border rounded-xl bg-oracle-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-oracle-muted uppercase tracking-wider">Trade History</h3>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: '#64748B' }}>
          {trades.length} trades
        </span>
      </div>

      {loading ? (
        <div className="h-20 animate-pulse bg-oracle-bg rounded-lg" />
      ) : trades.length === 0 ? (
        <p className="text-sm text-oracle-muted text-center py-6">No trades yet — be the first to bet!</p>
      ) : (
        <div className="space-y-0 max-h-72 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center text-xs text-oracle-muted py-2 border-b border-oracle-border/40 font-semibold">
            <span className="w-24">Trader</span>
            <span className="w-12 text-center">Side</span>
            <span className="w-20 text-right">Amount</span>
            <span className="w-20 text-right">Shares</span>
            <span className="flex-1 text-right">Price After</span>
          </div>

          {trades.map((t, i) => (
            <div key={i} className="flex items-center text-xs py-2.5 border-b border-oracle-border/20 last:border-0 hover:bg-white/[0.02] transition-colors">
              {/* Trader */}
              <span className="w-24 font-mono text-oracle-muted">
                {t.user.slice(0, 6)}...{t.user.slice(-4)}
              </span>

              {/* Side */}
              <span className={`w-12 text-center font-bold ${t.side === 'YES' ? 'text-oracle-yes' : 'text-oracle-no'}`}>
                {t.side}
              </span>

              {/* Amount */}
              <span className="w-20 text-right font-mono text-oracle-text">
                {parseFloat(t.amountIn).toFixed(4)}
              </span>

              {/* Shares */}
              <span className="w-20 text-right font-mono text-oracle-muted">
                {parseFloat(t.sharesOut).toFixed(4)}
              </span>

              {/* Price after */}
              <span className="flex-1 text-right">
                <span className={`font-mono font-bold ${t.side === 'YES' ? 'text-oracle-yes' : 'text-oracle-no'}`}>
                  {t.priceAfter}%
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {trades.length > 0 && (
        <div className="mt-3 pt-3 border-t border-oracle-border/30 flex justify-between text-xs text-oracle-muted">
          <span>Total volume: {trades.reduce((s, t) => s + parseFloat(t.amountIn), 0).toFixed(4)} OKB</span>
          <span>CPMM dynamic pricing</span>
        </div>
      )}
    </div>
  )
}
