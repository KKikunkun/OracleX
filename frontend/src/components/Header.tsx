'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAccount, useConnect, useDisconnect, useConfig, useSwitchChain, useSignMessage } from 'wagmi'
import { xlayer } from '@/app/providers'

function hasOKXWallet(): boolean {
  return typeof window !== 'undefined' && !!(window as any).okxwallet
}

const NAV_LINKS = [
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/portfolio',   label: 'Portfolio' },
  { href: '/evidence',    label: 'Evidence' },
]

export function Header() {
  const { address, isConnected, chainId } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { connectors } = useConfig()
  const { switchChain } = useSwitchChain()
  const { signMessageAsync } = useSignMessage()

  const [verified, setVerified]   = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [menuOpen, setMenuOpen]   = useState(false)

  const wrongChain = isConnected && chainId !== xlayer.id
  const needsVerify = isConnected && !wrongChain && !verified

  function handleConnect() {
    if (!hasOKXWallet()) {
      window.open('https://www.okx.com/web3', '_blank')
      return
    }
    setVerified(false)
    const okxConnector = connectors[0]
    if (okxConnector) connect({ connector: okxConnector })
  }

  function handleDisconnect() {
    setVerified(false)
    disconnect()
  }

  async function handleVerify() {
    if (!address) return
    setVerifying(true)
    try {
      const nonce = Math.random().toString(36).slice(2, 10)
      const message = `OracleX Verification\n\nWallet: ${address}\nChain: X Layer (196)\nNonce: ${nonce}\nTimestamp: ${new Date().toISOString()}`
      await signMessageAsync({ message })
      setVerified(true)
    } catch {
    } finally {
      setVerifying(false)
    }
  }

  function handleSwitchChain() {
    switchChain({ chainId: xlayer.id })
  }

  const walletButton = isConnected ? (
    wrongChain ? (
      <button onClick={handleSwitchChain}
        className="px-4 py-2 text-sm rounded-xl font-semibold transition-all"
        style={{ border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444', background: 'rgba(239,68,68,0.08)' }}>
        Switch to X Layer
      </button>
    ) : needsVerify ? (
      <button onClick={handleVerify} disabled={verifying}
        className="px-4 py-2 text-sm rounded-xl font-semibold transition-all disabled:opacity-50"
        style={{ border: '1px solid rgba(245,158,11,0.4)', color: '#F59E0B', background: 'rgba(245,158,11,0.08)' }}>
        {verifying ? 'Sign message...' : 'Verify Wallet'}
      </button>
    ) : (
      <button onClick={handleDisconnect}
        className="px-4 py-2 text-sm rounded-xl font-mono transition-all flex items-center gap-2"
        style={{ border: '1px solid rgba(16,185,129,0.3)', color: '#10B981', background: 'rgba(16,185,129,0.06)' }}>
        <img src="https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png" alt="" className="w-4 h-4 rounded" />
        {address?.slice(0, 6)}...{address?.slice(-4)}
      </button>
    )
  ) : (
    <button onClick={handleConnect}
      className="px-5 py-2 text-sm font-semibold text-white rounded-xl transition-all hover:opacity-90 active:scale-95 flex items-center gap-2"
      style={{ background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', boxShadow: '0 0 20px rgba(124,58,237,0.35)' }}>
      {hasOKXWallet() ? 'Connect OKX Wallet' : 'Install OKX Wallet'}
    </button>
  )

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-oracle-border"
        style={{ background: 'rgba(8,8,15,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)' }}>
              <span className="text-white text-sm font-bold">⬡</span>
            </div>
            <span className="text-oracle-text font-bold text-lg tracking-tight">OracleX</span>
            <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
              style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#A78BFA' }}>
              AI
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-6">
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href}
                className="text-sm text-oracle-subtext hover:text-oracle-text transition-colors font-medium">
                {l.label}
              </Link>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-oracle-yes animate-pulse inline-block" />
              <span className="text-xs text-oracle-yes font-medium">Agents Active</span>
            </div>
            {walletButton}
          </div>

          {/* Mobile: wallet + hamburger */}
          <div className="flex sm:hidden items-center gap-3">
            {walletButton}
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-lg border border-oracle-border">
              <span className={`w-4 h-0.5 bg-oracle-text transition-transform ${menuOpen ? 'rotate-45 translate-y-1' : ''}`} />
              <span className={`w-4 h-0.5 bg-oracle-text transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`w-4 h-0.5 bg-oracle-text transition-transform ${menuOpen ? '-rotate-45 -translate-y-1' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden fixed inset-x-0 top-16 z-40 border-b border-oracle-border"
          style={{ background: 'rgba(8,8,15,0.95)', backdropFilter: 'blur(20px)' }}>
          <nav className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-3">
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}
                className="text-sm text-oracle-subtext hover:text-oracle-text transition-colors font-medium py-2 border-b border-oracle-border/30">
                {l.label}
              </Link>
            ))}
            <div className="flex items-center gap-1.5 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-oracle-yes animate-pulse inline-block" />
              <span className="text-xs text-oracle-yes font-medium">Agents Active</span>
            </div>
          </nav>
        </div>
      )}
    </>
  )
}
