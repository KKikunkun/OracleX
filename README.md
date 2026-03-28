# OracleX — AI-Powered Prediction Markets on X Layer with Agentic Wallet

> Three autonomous AI Agents monitor OKX markets 24/7, automatically create, operate, and settle prediction markets on X Layer. Users participate via OKX Wallet or Agentic Wallet (TEE secure signing), with odds dynamically shifting on every trade.

[![X (Twitter)](https://img.shields.io/badge/Follow-@OracleX__Agnet-000?style=flat&logo=x)](https://x.com/OracleX_Agnet)

---

## Key Features

- **Fully Autonomous** — AI Agents create markets, deploy contracts, settle prices — zero human intervention
- **Agentic Wallet** — OKX TEE secure wallet, AI signs transactions autonomously without manual confirmation
- **Dynamic Pricing** — Virtual liquidity CPMM model, odds slide in real-time with every trade, no initial capital needed
- **Real Data** — OKX Market API real-time feeds, DEX Aggregator V6 on-chain cross-validation
- **Zero Gas** — X Layer zero fees make autonomous AI agent trading viable
- **x402 Protocol** — Real HTTP 402 Payment Required protocol for agent-to-agent service payments

---

## Architecture

```
                    ┌─────────────┐
                    │  OKX Market │
                    │   API v5    │
                    └──────┬──────┘
                           │ Real-time feeds (REST + WebSocket)
                           ▼
  ┌──────────────────────────────────────────────────────────┐
  │                  AI AGENT PIPELINE                        │
  │                                                           │
  │  ┌──────────┐  x402    ┌──────────┐  x402   ┌─────────┐ │
  │  │ Signal   │──HTTP───→│ Creator  │──HTTP──→│ Resolver│ │
  │  │ Agent    │  402     │ Agent    │  402    │ Agent   │ │
  │  │          │          │          │         │         │ │
  │  │ AI       │          │ Deploy   │         │ OKX     │ │
  │  │ Analysis │          │ Contract │         │ Settle  │ │
  │  │ Sentiment│          │ Virtual  │         │ DEX     │ │
  │  │          │          │ Liquidity│         │ Verify  │ │
  │  └──────────┘          └──────────┘         └─────────┘ │
  └────────────────────────────┬─────────────────────────────┘
                               │
                   ┌───────────▼────────────┐
                   │    X Layer Mainnet     │
                   │    chainId: 196        │
                   │    MarketFactory       │
                   │    PredictionMarket    │
                   └────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │ OKX      │    │ Agentic  │    │ Frontend │
        │ Wallet   │    │ Wallet   │    │ Next.js  │
        │ Manual   │    │ TEE Auto │    │ Real-time│
        └──────────┘    └──────────┘    └──────────┘
```

---

## Three AI Agents

| Agent | Brain | Role | x402 Role |
|-------|-------|------|-----------|
| **Signal** | AI LLM (tool-use loop) | Monitors OKX prices, analyzes candlesticks + sentiment, decides whether to create markets | Service buyer (pays Creator) |
| **Creator** | Rule engine + Nonce management | Deploys prediction market contracts on X Layer with virtual liquidity | Service provider + buyer |
| **Resolver** | OKX price oracle + AI analysis | Fetches OKX settlement price at deadline, DEX cross-validates, settles on-chain | Service provider |

---

## AI Decision Engine

Signal Agent runs a full AI tool-use loop with 5 tools:

1. `get_price` — Fetch live OKX spot price + 24h stats
2. `get_candles` — 1H OHLCV candlestick data for technical analysis
3. `get_market_sentiment` — Crypto Fear & Greed Index
4. `list_active_markets` — Avoid duplicate markets
5. `create_market` — Deploy a new prediction market on-chain

The AI analyzes trends, volume, support/resistance, and momentum before deciding. Reasoning is displayed on the frontend.

Resolver Agent uses AI for post-resolution analysis — explaining what happened, why, and one forward-looking insight.

---

## x402 Protocol

Real HTTP 402 Payment Required protocol between agents:

```
1. Signal Agent:  GET /x402/creator/deploy-market
2. Server:        HTTP 402 Payment Required
                  X-Payment-Amount: 0.002 OKB
                  X-Payment-Currency: OKB
                  X-Payment-Protocol: x402/1.0
3. Signal Agent:  Generates SHA-256 payment proof
4. Signal Agent:  Resends with X-Payment-Verified: true
5. Server:        HTTP 200 + x402Receipt
```

---

## Agentic Wallet Integration

Supports OKX Agentic Wallet (TEE Trusted Execution Environment):

- **Private keys generated and signed inside TEE** — never exposed
- **AI autonomous betting** — no manual transaction confirmation needed
- **One-click frontend** — users click a button, backend TEE wallet executes
- **Email login** — via `onchainos` CLI, no private key management

---

## Virtual Liquidity CPMM

Constant Product Market Maker with virtual reserves:

- **Zero cost market creation** — no real OKB needed as initial liquidity
- **Reasonable price impact** — 1 OKB virtual reserve per side, 0.01 OKB bet moves odds ~0.5%
- **Refund protection** — no platform fee when no counterparty, losers can reclaim deposits
- **Precise settlement** — only uses the exact 1H candle close at deadline from OKX, no fallbacks

---

## OnchainOS Integrations (10)

| # | Integration | Protocol | Frequency | Status |
|---|------------|----------|-----------|--------|
| 1 | OKX Market API v5 (BTC/OKB) | REST | Every 5s (cached) | Real |
| 2 | OKX Candlestick Data | REST | Per AI analysis | Real |
| 3 | OnchainOS DEX Aggregator V6 | REST (HMAC-SHA256) | Per OKB resolution | Real |
| 4 | X Layer RPC | JSON-RPC | Per transaction | Real |
| 5 | x402 HTTP 402 Protocol | HTTP 402 | Per agent service call | Real HTTP |
| 6 | Crypto Fear & Greed Index | REST | Per AI analysis | Real |
| 7 | OKX Wallet (EIP-1193) | DApp Connect | On user action | Real |
| 8 | Agentic Wallet (TEE) | onchainos CLI | On bet | Real |
| 9 | AI LLM (OpenAI-compatible) | REST | Every 30min + per resolution | Real |
| 10 | MarketFactory + PredictionMarket | Solidity | Deploy/Bet/Resolve | On-chain |

---

## Smart Contracts

| Contract | Address | Function |
|----------|---------|----------|
| MarketFactory | [`0x62a42AE83304eBa619d71f5f86B87E665A8D7c1E`](https://www.oklink.com/xlayer/address/0x62a42AE83304eBa619d71f5f86B87E665A8D7c1E) | Deploy prediction markets, manage agent roles |
| PredictionMarket | Deployed per market | Virtual liquidity CPMM + Bet + Resolve + Claim + Refund |

**Security:** ReentrancyGuard, role-based access, Job Hash audit trail, no-fee refund, precise settlement.

**Test coverage: 64 tests passing**

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Blockchain | X Layer Mainnet (chainId 196, EVM, zero gas) |
| Contracts | Solidity 0.8.24, Hardhat, ReentrancyGuard |
| AI | Configurable LLM (OpenAI-compatible API) |
| Backend | Node.js + TypeScript + Express + WebSocket |
| Frontend | Next.js 14 + React 18 + Tailwind CSS |
| Wallet | Wagmi v2 + Viem (OKX Wallet) + Agentic Wallet (TEE) |
| Data | OKX REST API v5 + DEX Aggregator V6 + Fear & Greed |
| Testing | Hardhat + Chai (64 tests) |
| Agent Comms | x402 HTTP 402 Protocol (real HTTP) |

---

## Quick Start

```bash
pnpm install
cp .env.example .env    # Fill in keys
pnpm contracts:compile
pnpm contracts:deploy:mainnet  # Optional
pnpm dev                # Agents :3001 + Frontend :3000
```

---

## Links

- **Website:** [oraclex.one](https://oraclex.one)
- **X (Twitter):** [@OracleX_Agnet](https://x.com/OracleX_Agnet)
- **Factory Contract:** [OKLink Explorer](https://www.oklink.com/xlayer/address/0x62a42AE83304eBa619d71f5f86B87E665A8D7c1E)

---

## License

Apache 2.0
