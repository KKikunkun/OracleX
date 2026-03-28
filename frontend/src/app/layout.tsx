import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'OracleX — AI Prediction Markets on X Layer',
  description: 'Three autonomous AI agents watch OKX prices 24/7, deploy CPMM prediction markets on X Layer, and settle them using real market data. Polymarket-style dynamic pricing. Zero gas.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'OracleX — AI Prediction Markets on X Layer',
    description: '3 AI agents. Polymarket-style pricing. Zero gas. Fully autonomous prediction markets powered by AI + OKX Market API on X Layer.',
    type: 'website',
    siteName: 'OracleX',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OracleX — AI Prediction Markets on X Layer',
    description: '3 AI agents. Polymarket-style pricing. Zero gas. Fully autonomous prediction markets on X Layer.',
    creator: '@OracleX_Agnet',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
