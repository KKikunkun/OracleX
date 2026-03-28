'use client'

import { useEffect, useState } from 'react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface PriceItem {
  instId: string
  price: number
  change24h: number
  prev: number | null
}

export function PriceTicker() {
  const [prices, setPrices] = useState<PriceItem[]>([])

  useEffect(() => {
    async function fetchPrices() {
      try {
        const res = await fetch(`${API_BASE}/api/prices`)
        if (!res.ok) return
        const data = await res.json()
        setPrices(prev =>
          data.prices.map((p: any) => ({
            ...p,
            prev: prev.find((x: PriceItem) => x.instId === p.instId)?.price ?? null,
          }))
        )
      } catch {}
    }
    fetchPrices()
    const id = setInterval(fetchPrices, 5_000)
    return () => clearInterval(id)
  }, [])

  if (prices.length === 0) return null

  return (
    <div className="border-b border-oracle-border"
      style={{ background: 'rgba(124,58,237,0.05)' }}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center gap-3 py-2.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-oracle-yes animate-pulse" />
            <span className="text-xs text-oracle-muted uppercase tracking-widest font-semibold">OKX Live</span>
          </div>
          <div className="w-px h-4 bg-oracle-border shrink-0" />
          <div className="flex gap-6 overflow-x-auto">
            {prices.map(p => {
              const up = p.change24h >= 0
              const flash = p.prev !== null && p.price !== p.prev
                ? p.price > p.prev ? 'text-oracle-yes' : 'text-oracle-no'
                : 'text-oracle-text'
              return (
                <div key={p.instId} className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-oracle-muted font-medium">
                    {p.instId.replace('-USDT', '')}
                  </span>
                  <span className={`text-sm font-bold transition-colors duration-300 ${flash}`}>
                    ${p.price.toLocaleString(undefined, { maximumFractionDigits: p.price >= 100 ? 0 : 4 })}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                    ${up ? 'text-oracle-yes' : 'text-oracle-no'}`}
                    style={{ background: up ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)' }}>
                    {up ? '▲' : '▼'} {Math.abs(p.change24h).toFixed(2)}%
                  </span>
                </div>
              )
            })}
          </div>
          <span className="ml-auto text-xs text-oracle-muted/40 shrink-0 hidden sm:block">Powered by OKX</span>
        </div>
      </div>
    </div>
  )
}
