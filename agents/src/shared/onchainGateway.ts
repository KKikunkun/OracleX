// OnchainOS Onchain Gateway — broadcast transactions via OKX infrastructure
// Instead of sending TX directly to X Layer RPC, we route through OKX's
// high-availability broadcast engine for better reliability and MEV protection.
//
// API: POST https://web3.okx.com/api/v6/dex/pre-transaction/broadcast-transaction

import crypto from 'crypto'
import { ethers } from 'ethers'

const WEB3_HOST = 'https://web3.okx.com'
const BROADCAST_PATH = '/api/v6/dex/pre-transaction/broadcast-transaction'
const XLAYER_CHAIN_INDEX = '196'

function getCredentials() {
  const apiKey     = process.env.OKX_API_KEY     || ''
  const secretKey  = process.env.OKX_SECRET_KEY  || ''
  const passphrase = process.env.OKX_PASSPHRASE  || ''
  return { apiKey, secretKey, passphrase, configured: !!(apiKey && secretKey && passphrase) }
}

function signRequest(timestamp: string, method: string, path: string, body: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(timestamp + method + path + body).digest('base64')
}

export interface BroadcastResult {
  success:  boolean
  txHash?:  string
  orderId?: string
  error?:   string
  method:   'okx-gateway' | 'direct-rpc'
}

/**
 * Broadcast a signed transaction via OKX OnchainOS Gateway
 * Falls back to direct RPC if OKX API is unavailable
 */
export async function broadcastViaGateway(
  signedTx: string,
  senderAddress: string,
): Promise<BroadcastResult> {
  const { apiKey, secretKey, passphrase, configured } = getCredentials()

  if (!configured) {
    return { success: false, error: 'OKX API not configured', method: 'direct-rpc' }
  }

  const body = JSON.stringify({
    chainIndex: XLAYER_CHAIN_INDEX,
    address:    senderAddress,
    signedTx:   signedTx,
  })

  const timestamp = new Date().toISOString()
  const sign = signRequest(timestamp, 'POST', BROADCAST_PATH, body, secretKey)

  try {
    const res = await fetch(`${WEB3_HOST}${BROADCAST_PATH}`, {
      method: 'POST',
      headers: {
        'OK-ACCESS-KEY':        apiKey,
        'OK-ACCESS-SIGN':       sign,
        'OK-ACCESS-TIMESTAMP':  timestamp,
        'OK-ACCESS-PASSPHRASE': passphrase,
        'Content-Type':         'application/json',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    })

    const data: any = await res.json()

    if (data.code === '0' && data.data?.[0]) {
      console.log(`[Gateway] TX broadcast via OKX: ${data.data[0].txHash}`)
      return {
        success: true,
        txHash:  data.data[0].txHash,
        orderId: data.data[0].orderId,
        method:  'okx-gateway',
      }
    }

    console.warn(`[Gateway] OKX broadcast failed: ${data.msg || data.code}`)
    return { success: false, error: data.msg || `code ${data.code}`, method: 'okx-gateway' }
  } catch (err) {
    console.warn(`[Gateway] OKX broadcast error: ${(err as Error).message?.slice(0, 60)}`)
    return { success: false, error: (err as Error).message?.slice(0, 80), method: 'okx-gateway' }
  }
}

/**
 * Sign and broadcast a contract call via OKX Gateway
 * Falls back to direct provider.sendTransaction if Gateway fails
 */
export async function signAndBroadcast(
  wallet: ethers.Wallet,
  tx: ethers.TransactionRequest,
): Promise<{ hash: string; method: 'okx-gateway' | 'direct-rpc' }> {
  const provider = wallet.provider!

  // Fill in missing tx fields (chainId, gasLimit, gasPrice)
  const populated = await (async () => {
    try {
      const [gasLimit, feeData, network] = await Promise.all([
        provider.estimateGas(tx),
        provider.getFeeData(),
        provider.getNetwork(),
      ])
      return { ...tx, chainId: network.chainId, gasLimit, gasPrice: feeData.gasPrice, type: 0 }
    } catch {
      // If estimation fails, use defaults for X Layer
      return { ...tx, chainId: 196n, gasLimit: 3_000_000n, gasPrice: 0n, type: 0 }
    }
  })()

  // Sign the transaction locally
  const signedTx = await wallet.signTransaction(populated)

  // Try OKX Gateway first
  const { configured } = getCredentials()
  if (configured) {
    const gatewayResult = await broadcastViaGateway(signedTx, wallet.address)
    if (gatewayResult.success && gatewayResult.txHash) {
      return { hash: gatewayResult.txHash, method: 'okx-gateway' }
    }
  }

  // Fallback: send directly via RPC
  console.log(`[Gateway] Broadcasting via direct RPC`)
  const txResponse = await provider.broadcastTransaction(signedTx)
  return { hash: txResponse.hash, method: 'direct-rpc' }
}
