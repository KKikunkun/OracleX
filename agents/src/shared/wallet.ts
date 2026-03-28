// L0 Header — machine-readable state metadata
// ROLE: shared/wallet | STATUS: active | LAST_ACTION: init | NEXT_ACTION: sign_tx

import { ethers } from 'ethers'
import { config } from './config.js'

// ── Provider ──────────────────────────────────────────────────

export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(config.RPC_URL)
}

// ── Agent wallets ─────────────────────────────────────────────

export function getCreatorWallet(): ethers.Wallet | null {
  if (!config.CREATOR_PRIVATE_KEY || config.CREATOR_PRIVATE_KEY === '0x_your_creator_key_here') {
    console.warn('[Wallet] CREATOR_PRIVATE_KEY not set — running in simulation mode')
    return null
  }
  return new ethers.Wallet(config.CREATOR_PRIVATE_KEY, getProvider())
}

export function getResolverWallet(): ethers.Wallet | null {
  if (!config.RESOLVER_PRIVATE_KEY || config.RESOLVER_PRIVATE_KEY === '0x_your_resolver_key_here') {
    console.warn('[Wallet] RESOLVER_PRIVATE_KEY not set — running in simulation mode')
    return null
  }
  return new ethers.Wallet(config.RESOLVER_PRIVATE_KEY, getProvider())
}

// ── Nonce manager ─────────────────────────────────────────────

export class NonceManager {
  private nonce: number = -1

  constructor(private wallet: ethers.Wallet) {}

  async init() {
    this.nonce = await this.wallet.provider!.getTransactionCount(this.wallet.address)
    console.log(`[Nonce] ${this.wallet.address} nonce: ${this.nonce}`)
  }

  getNext(): number {
    if (this.nonce < 0) throw new Error('NonceManager not initialized')
    return this.nonce++
  }

  async resync() {
    this.nonce = await this.wallet.provider!.getTransactionCount(this.wallet.address)
    console.log(`[Nonce] Resynced: ${this.nonce}`)
  }
}
