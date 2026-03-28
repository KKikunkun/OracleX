'use client'

export default function MarketError({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-oracle-bg flex flex-col items-center justify-center gap-4">
      <p className="text-oracle-muted text-sm">Could not load market</p>
      <button
        onClick={reset}
        className="text-xs px-3 py-1.5 border border-oracle-border rounded text-oracle-muted hover:text-white"
      >
        Retry
      </button>
    </div>
  )
}
