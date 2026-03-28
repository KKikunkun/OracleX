'use client'

import { useState, useMemo, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther } from 'viem'
import type { MarketInfo } from '@/lib/api'
import { API_BASE } from '@/lib/api'

const MARKET_ABI = [
  { name: 'buyYes',       type: 'function', stateMutability: 'payable',    inputs: [], outputs: [] },
  { name: 'buyNo',        type: 'function', stateMutability: 'payable',    inputs: [], outputs: [] },
  { name: 'claimWinnings',type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'refund',       type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { name: 'totalYesMinted',type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { name: 'totalNoMinted', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
] as const

const isSimAddress = (addr: string) => addr.startsWith('0xSIM_')

function AgenticBetButton({ market, side, amount }: { market: MarketInfo; side: string; amount: string }) {
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState<{ ok: boolean; txHash?: string; error?: string } | null>(null)
  const [wallet, setWallet]       = useState<{ available: boolean; email?: string; address?: string } | null>(null)

  useEffect(() => {
    fetch(`${API_BASE}/api/agentic-wallet/status`).then(r => r.json()).then(setWallet).catch(() => setWallet({ available: false }))
  }, [])

  if (!wallet || !wallet.available) return null

  async function handleAgenticBet() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`${API_BASE}/api/agentic-bet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketAddress: market.address, side, amount }),
      })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ ok: false, error: 'Network error' })
    }
    setLoading(false)
  }

  if (result?.ok) {
    return (
      <div className="text-center text-oracle-yes text-sm py-2 font-medium">
        Agentic Wallet bet confirmed!{' '}
        {result.txHash && (
          <a href={`https://www.oklink.com/xlayer/tx/${result.txHash}`} target="_blank" rel="noopener noreferrer" className="underline">View tx</a>
        )}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={handleAgenticBet}
        disabled={loading || !amount || parseFloat(amount) <= 0}
        className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', color: '#A78BFA' }}
      >
        {loading ? 'Signing via TEE...' : `Agentic Wallet: ${amount} OKB on ${side.toUpperCase()}`}
      </button>
      {result?.error && <p className="text-xs text-oracle-no mt-1">{result.error}</p>}
    </div>
  )
}

// CPMM price impact calculator
function calcCPMM(yesPool: number, noPool: number, amountIn: number, side: 'yes' | 'no') {
  if (yesPool <= 0 || noPool <= 0 || amountIn <= 0) return null
  const k = yesPool * noPool
  if (side === 'yes') {
    const newYes = yesPool + amountIn
    const newNo  = k / newYes
    const shares = noPool - newNo
    const total  = newYes + newNo
    const priceAfter = (newNo / total) * 100
    return { shares, priceAfter, priceImpact: priceAfter - (noPool / (yesPool + noPool)) * 100 }
  } else {
    const newNo  = noPool + amountIn
    const newYes = k / newNo
    const shares = yesPool - newYes
    const total  = newYes + newNo
    const priceAfter = (newYes / total) * 100
    return { shares, priceAfter, priceImpact: priceAfter - (yesPool / (yesPool + noPool)) * 100 }
  }
}

export function BettingPanel({ market }: { market: MarketInfo }) {
  const { isConnected } = useAccount()
  const [side, setSide]     = useState<'yes' | 'no'>('yes')
  const [amount, setAmount] = useState('0.01')
  const simMode = isSimAddress(market.address)

  const { writeContract, data: txHash, isPending, error } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })
  const { address: userAddress } = useAccount()

  // Trade recording is handled server-side via chain polling (resolver auto-detect)

  // CPMM price impact preview
  const preview = useMemo(() => {
    const yesPool = parseFloat(market.yesPool) / 1e18
    const noPool  = parseFloat(market.noPool) / 1e18
    const amt     = parseFloat(amount) || 0
    return calcCPMM(yesPool, noPool, amt, side)
  }, [market.yesPool, market.noPool, amount, side])

  function placeBet() {
    if (!amount || isNaN(parseFloat(amount))) return
    writeContract({
      address:      market.address as `0x${string}`,
      abi:          MARKET_ABI,
      functionName: side === 'yes' ? 'buyYes' : 'buyNo',
      value:        parseEther(amount),
    })
  }

  if (market.resolved) {
    if (simMode) {
      return (
        <div className={`border-2 rounded-xl p-5 ${market.outcomeYes ? 'border-oracle-yes/30 bg-oracle-yes/5' : 'border-oracle-no/30 bg-oracle-no/5'}`}>
          <p className="text-base font-semibold text-oracle-text mb-2">Market Resolved</p>
          <p className={`text-3xl font-bold mb-2 ${market.outcomeYes ? 'text-oracle-yes' : 'text-oracle-no'}`}>
            {market.outcomeYes ? 'YES wins' : 'NO wins'}
          </p>
          {market.resolutionPrice && (
            <p className="text-sm text-oracle-muted">
              OKX settled @ ${market.resolutionPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}
        </div>
      )
    }
    return (
      <div className={`border-2 rounded-xl p-5 ${market.outcomeYes ? 'border-oracle-yes/30 bg-oracle-yes/5' : 'border-oracle-no/30 bg-oracle-no/5'}`}>
        <p className="text-base font-semibold text-oracle-text mb-2">Market Resolved</p>
        <p className={`text-3xl font-bold mb-3 ${market.outcomeYes ? 'text-oracle-yes' : 'text-oracle-no'}`}>
          {market.outcomeYes ? 'YES wins' : 'NO wins'}
        </p>
        {market.resolutionPrice && (
          <p className="text-sm text-oracle-muted mb-4">
            Settled @ ${market.resolutionPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </p>
        )}
        {isConnected ? (
          isSuccess ? (
            <p className="text-oracle-yes text-sm font-medium">Success!{' '}
              {txHash && <a href={`https://www.oklink.com/xlayer/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">View tx</a>}
            </p>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => writeContract({ address: market.address as `0x${string}`, abi: MARKET_ABI, functionName: 'claimWinnings' })}
                disabled={isPending || confirming}
                className="w-full py-3 rounded-lg text-sm font-semibold bg-oracle-gold hover:bg-oracle-gold/90 text-white transition-colors disabled:opacity-50"
              >
                {isPending ? 'Confirm...' : confirming ? 'Claiming...' : 'Claim Winnings'}
              </button>
              <button
                onClick={() => writeContract({ address: market.address as `0x${string}`, abi: MARKET_ABI, functionName: 'refund' })}
                disabled={isPending || confirming}
                className="w-full py-2 rounded-lg text-xs font-medium border border-oracle-border text-oracle-muted hover:text-oracle-text transition-colors disabled:opacity-50"
              >
                Refund (if no counterparty)
              </button>
            </div>
          )
        ) : (
          <p className="text-sm text-oracle-muted text-center">Connect wallet to claim</p>
        )}
        {error && <p className="text-xs text-oracle-no mt-2">{(error as Error).message.slice(0, 100)}</p>}
      </div>
    )
  }

  if (market.status !== 'active') {
    return (
      <div className="border border-oracle-border rounded-xl bg-oracle-panel p-5 text-center text-oracle-muted">
        Market closed — awaiting resolution
      </div>
    )
  }

  if (simMode) {
    return (
      <div className="border-2 border-oracle-gold/25 rounded-xl bg-oracle-gold/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-oracle-gold font-semibold">Demo Mode</span>
        </div>
        <p className="text-sm text-oracle-muted mb-4">
          This market is running in simulation. Deploy contracts to X Layer to enable real betting.
        </p>
        <div className="flex gap-3">
          <div className="flex-1 border border-oracle-yes/25 bg-oracle-yes/8 rounded-lg px-4 py-3 text-center">
            <div className="text-oracle-yes font-bold text-xl">{(market.yesOdds / 100).toFixed(1)}%</div>
            <div className="text-xs text-oracle-muted mt-0.5">YES</div>
          </div>
          <div className="flex-1 border border-oracle-no/25 bg-oracle-no/8 rounded-lg px-4 py-3 text-center">
            <div className="text-oracle-no font-bold text-xl">{(market.noOdds / 100).toFixed(1)}%</div>
            <div className="text-xs text-oracle-muted mt-0.5">NO</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-oracle-border rounded-xl bg-oracle-panel p-5">
      <h3 className="text-base font-semibold text-oracle-text mb-5">Place Bet</h3>

      {/* Side selector */}
      <div className="flex rounded-lg overflow-hidden border border-oracle-border mb-5">
        <button
          onClick={() => setSide('yes')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            side === 'yes' ? 'bg-oracle-yes text-white' : 'bg-transparent text-oracle-muted hover:text-oracle-yes'
          }`}
        >
          YES · {(market.yesOdds / 100).toFixed(1)}%
        </button>
        <button
          onClick={() => setSide('no')}
          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
            side === 'no' ? 'bg-oracle-no text-white' : 'bg-transparent text-oracle-muted hover:text-oracle-no'
          }`}
        >
          NO · {(market.noOdds / 100).toFixed(1)}%
        </button>
      </div>

      {/* Amount input */}
      <div className="mb-4">
        <label className="text-sm text-oracle-muted mb-1.5 block font-medium">Amount (OKB)</label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0.001"
            step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-oracle-bg border border-oracle-border rounded-lg px-3 py-2.5 text-sm font-mono text-oracle-text focus:outline-none focus:border-oracle-accent"
          />
          {['0.01', '0.05', '0.1'].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className="px-3 py-2 text-xs border border-oracle-border rounded-lg hover:border-oracle-accent text-oracle-muted hover:text-oracle-text transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* CPMM Price Impact Preview */}
      {preview && parseFloat(amount) > 0 && (
        <div className="mb-4 rounded-lg px-4 py-3 border border-oracle-border/60"
          style={{ background: 'rgba(124,58,237,0.05)' }}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-oracle-muted">You receive</span>
            <span className="text-oracle-text font-mono font-bold">{preview.shares.toFixed(6)} shares</span>
          </div>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-oracle-muted">Price after trade</span>
            <span className={`font-mono font-bold ${side === 'yes' ? 'text-oracle-yes' : 'text-oracle-no'}`}>
              {side.toUpperCase()} → {preview.priceAfter.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-oracle-muted">Price impact</span>
            <span className={`font-mono ${Math.abs(preview.priceImpact) > 5 ? 'text-oracle-no' : 'text-oracle-muted'}`}>
              {preview.priceImpact > 0 ? '+' : ''}{preview.priceImpact.toFixed(2)}%
            </span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!isConnected ? (
        <div className="space-y-2">
          <AgenticBetButton market={market} side={side} amount={amount} />
          <div className="relative flex items-center gap-2 py-1">
            <div className="flex-1 h-px bg-oracle-border" />
            <span className="text-xs text-oracle-muted">or</span>
            <div className="flex-1 h-px bg-oracle-border" />
          </div>
          <p className="text-center text-sm text-oracle-muted">Connect OKX Wallet to bet manually</p>
        </div>
      ) : isSuccess ? (
        <div className="text-center text-oracle-yes text-sm py-2 font-medium">
          Bet confirmed!{' '}
          {txHash && (
            <a href={`https://www.oklink.com/xlayer/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="underline">
              View tx
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={placeBet}
            disabled={isPending || confirming}
            className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors ${
              side === 'yes' ? 'bg-oracle-yes hover:bg-oracle-yes/90 text-white' : 'bg-oracle-no hover:bg-oracle-no/90 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isPending ? 'Confirm in wallet...' : confirming ? 'Confirming...' : `Bet ${amount} OKB on ${side.toUpperCase()}`}
          </button>
          <AgenticBetButton market={market} side={side} amount={amount} />
        </div>
      )}

      {error && (
        <p className="text-xs text-oracle-no mt-2 break-all">{(error as Error).message.slice(0, 120)}</p>
      )}

      <p className="text-xs text-oracle-muted/50 text-center mt-3">CPMM pricing · 2% platform fee on resolution</p>
    </div>
  )
}
