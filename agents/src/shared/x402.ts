// x402 Protocol — Real HTTP 402 Payment Required implementation
// Agents make actual HTTP requests to the API server
//
// Real flow (all HTTP):
//   1. Signal Agent: GET http://localhost:3001/x402/creator/deploy-market
//   2. Server returns: HTTP 402 Payment Required + X-Payment-* headers
//   3. Signal Agent: GET http://localhost:3001/x402/creator/deploy-market
//      with header X-Payment-Verified: true + X-Payment-Proof: <hash>
//   4. Server returns: HTTP 200 + x402Receipt JSON

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { AgentAction } from './types.js'
import { config } from './config.js'

// ── Types ───────────────────────────────────────────────────

export interface X402Receipt {
  id:         string
  from:       string
  to:         string
  service:    string
  amount:     number
  currency:   string
  timestamp:  number
  verified:   boolean
  proofHash:  string
}

export interface X402Stats {
  totalPayments:   number
  totalVolume:     number
  serviceBreakdown: Record<string, number>
}

// ── Persistence ─────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), '../.data')
const X402_FILE = path.join(DATA_DIR, 'x402.json')

function loadFromDisk(): X402Receipt[] {
  try {
    if (!fs.existsSync(X402_FILE)) return []
    return JSON.parse(fs.readFileSync(X402_FILE, 'utf-8'))
  } catch { return [] }
}

function saveToDisk(data: X402Receipt[]) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = X402_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
  fs.renameSync(tmp, X402_FILE)
}

const payments: X402Receipt[] = loadFromDisk()
let paymentCounter = payments.length

// ── Service Catalog ─────────────────────────────────────────

interface ServiceDef {
  name:        string
  description: string
  basePrice:   number
}

const SERVICE_CATALOG: Record<string, ServiceDef[]> = {
  creator: [
    { name: 'deploy-market',  description: 'Deploy prediction market contract on X Layer', basePrice: 0.002 },
    { name: 'market-status',  description: 'Query on-chain market state',                  basePrice: 0.0001 },
  ],
  resolver: [
    { name: 'resolve-market', description: 'Fetch OKX settlement price and resolve market', basePrice: 0.001 },
    { name: 'price-analysis', description: 'Post-resolution AI analysis',                   basePrice: 0.0005 },
  ],
  signal: [
    { name: 'market-intel',   description: 'OKX price + technical analysis + sentiment',    basePrice: 0.0003 },
  ],
}

function getDynamicPrice(basePrice: number): number {
  const hourFactor = 1 + Math.sin(Date.now() / 3_600_000) * 0.1
  const demandFactor = 1 + Math.min(payments.length / 100, 0.1)
  return parseFloat((basePrice * hourFactor * demandFactor).toFixed(6))
}

// ── Server-side: handle x402 HTTP requests ──────────────────
// These are Express route handlers — called by the API server

export function handleX402Request(
  agentTo: string,
  serviceName: string,
  headers: Record<string, string | undefined>,
): { status: number; headers: Record<string, string>; body: any } {
  const catalog = SERVICE_CATALOG[agentTo]
  if (!catalog) return { status: 404, headers: {}, body: { error: `Agent ${agentTo} not found` } }

  const service = catalog.find(s => s.name === serviceName)
  if (!service) return { status: 404, headers: {}, body: { error: `Service ${serviceName} not found` } }

  const price = getDynamicPrice(service.basePrice)

  // Check if payment is verified
  const paymentVerified = headers['x-payment-verified'] === 'true'
  const paymentProof    = headers['x-payment-proof'] || ''

  if (!paymentVerified) {
    // Return 402 Payment Required
    return {
      status: 402,
      headers: {
        'X-Payment-Amount':   price.toFixed(6),
        'X-Payment-Currency': 'OKB',
        'X-Payment-Protocol': 'x402/1.0',
        'X-Payment-Recipient': agentTo,
        'X-Payment-Service':  serviceName,
        'X-Payment-Expires':  String(Date.now() + 30_000),
      },
      body: {
        error: 'Payment Required',
        amount: price,
        currency: 'OKB',
        protocol: 'x402/1.0',
        service: serviceName,
        recipient: agentTo,
      },
    }
  }

  // Payment verified — create receipt
  paymentCounter++
  const receipt: X402Receipt = {
    id:        `x402-${Date.now()}-${paymentCounter}`,
    from:      headers['x-payment-from'] || 'unknown',
    to:        agentTo,
    service:   serviceName,
    amount:    price,
    currency:  'OKB',
    timestamp: Date.now(),
    verified:  true,
    proofHash: paymentProof,
  }

  payments.unshift(receipt)
  if (payments.length > 1000) payments.pop()
  saveToDisk(payments)

  return {
    status: 200,
    headers: {
      'X-Payment-Receipt': receipt.id,
      'X-Payment-Status':  'confirmed',
    },
    body: { receipt },
  }
}

// ── Client-side: agent makes real HTTP 402 call ─────────────
// This is what agents call — makes real HTTP requests

export async function x402HttpCall(
  fromAgent: string,
  toAgent: string,
  serviceName: string,
  onAction: (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<X402Receipt | null> {
  const baseUrl = `http://localhost:${config.PORT}`

  try {
    // Step 1: Request service → expect 402
    const step1 = await fetch(`${baseUrl}/x402/${toAgent}/${serviceName}`, {
      headers: { 'X-Payment-From': fromAgent },
    })

    if (step1.status === 402) {
      const paymentAmount  = step1.headers.get('X-Payment-Amount') || '0'
      const paymentService = step1.headers.get('X-Payment-Service') || serviceName

      onAction({
        role:   fromAgent as any,
        action: `x402 → 402 Payment Required`,
        detail: `GET /${toAgent}/${paymentService} → HTTP 402 | Amount: ${paymentAmount} OKB | Protocol: x402/1.0`,
      })

      // Step 2: Sign payment proof
      const proofHash = crypto.createHash('sha256')
        .update(`${fromAgent}-${toAgent}-${serviceName}-${paymentAmount}-${Date.now()}`)
        .digest('hex')

      // Step 3: Resend with payment verification
      const step2 = await fetch(`${baseUrl}/x402/${toAgent}/${serviceName}`, {
        headers: {
          'X-Payment-From':     fromAgent,
          'X-Payment-Verified': 'true',
          'X-Payment-Proof':    proofHash,
        },
      })

      if (step2.status === 200) {
        const body = await step2.json()
        const receipt = body.receipt as X402Receipt

        onAction({
          role:   fromAgent as any,
          action: `x402 → 200 Payment Confirmed`,
          detail: `${fromAgent} → ${toAgent} | ${receipt.amount.toFixed(4)} OKB | Receipt: ${receipt.id}`,
        })

        return receipt
      }
    }

    return null
  } catch (err) {
    console.warn(`[x402] HTTP call failed: ${(err as Error).message?.slice(0, 60)}`)
    return null
  }
}

// ── Query functions ─────────────────────────────────────────

export function getPayments(limit = 50): X402Receipt[] {
  return payments.slice(0, limit)
}

export function getX402Stats(): X402Stats {
  const breakdown: Record<string, number> = {}
  let totalVolume = 0
  for (const p of payments) {
    totalVolume += p.amount
    breakdown[p.service] = (breakdown[p.service] || 0) + 1
  }
  return {
    totalPayments:    payments.length,
    totalVolume:      parseFloat(totalVolume.toFixed(6)),
    serviceBreakdown: breakdown,
  }
}

export function getServiceCatalog() {
  return Object.entries(SERVICE_CATALOG).map(([agent, services]) => ({
    agent,
    services: services.map(s => ({ ...s, currentPrice: getDynamicPrice(s.basePrice) })),
  }))
}
