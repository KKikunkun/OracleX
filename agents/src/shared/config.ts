// L0 Header — machine-readable state metadata
// ROLE: config | STATUS: static | LAST_ACTION: init | NEXT_ACTION: export

import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '../.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

export const config = {
  // Chain
  RPC_URL:  process.env.RPC_URL  || 'https://rpc.xlayer.tech',
  CHAIN_ID: parseInt(process.env.CHAIN_ID || '196'),

  // Contracts
  FACTORY_ADDRESS: process.env.FACTORY_ADDRESS || '',

  // Agent wallets
  CREATOR_PRIVATE_KEY:  process.env.CREATOR_PRIVATE_KEY  || '',
  RESOLVER_PRIVATE_KEY: process.env.RESOLVER_PRIVATE_KEY || '',
  PLATFORM_WALLET:      process.env.PLATFORM_WALLET      || '',

  // OKX API
  OKX_REST_BASE: 'https://www.okx.com/api/v5',
  OKX_WS_URL:    'wss://ws.okx.com:8443/ws/v5/public',

  // Server
  PORT: parseInt(process.env.PORT || '3001'),

  // Market config
  INITIAL_LIQUIDITY_ETH: '0.004',  // 0.004 OKB split 50/50 per market
  PLATFORM_FEE_BPS: 200,           // 2%

  // Explorer
  EXPLORER: 'https://www.oklink.com/xlayer',
} as const

export type Config = typeof config
