'use client'

import dynamic from 'next/dynamic'

const PortfolioContent = dynamic(() => import('./PortfolioContent'), { ssr: false })

export default function PortfolioPage() {
  return <PortfolioContent />
}
