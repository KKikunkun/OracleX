'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider, createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { defineChain } from 'viem'
import { useState } from 'react'

export const xlayer = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.xlayer.tech'] },
  },
  blockExplorers: {
    default: { name: 'OKLink', url: 'https://www.oklink.com/xlayer' },
  },
})

// Only allow OKX Wallet — detect via window.okxwallet provider
const okxWalletConnector = injected({
  target: {
    id:   'okxWallet',
    name: 'OKX Wallet',
    provider: typeof window !== 'undefined' ? (window as any).okxwallet : undefined,
  },
})

const config = createConfig({
  chains: [xlayer],
  connectors: [okxWalletConnector],
  transports: { [xlayer.id]: http() },
})

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 5_000, refetchInterval: 10_000 } },
  }))

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
