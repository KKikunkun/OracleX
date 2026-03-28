# OracleX — AI Prediction Markets on X Layer

> Three autonomous AI agents watch OKX prices 24/7, deploy prediction markets on-chain, and resolve them using real market data — no human intervention needed.

### Three things to remember:
1. **Three AI agents autonomously operate** a full prediction market lifecycle on X Layer
2. **Every market deployment and resolution is on-chain** with Job Hash cryptographic audit trail
3. **x402 protocol** enables agent-to-agent service payments with dynamic pricing

---

## Architecture

```
                    ┌─────────────┐
                    │  OKX Market │
                    │   API v5    │
                    └──────┬──────┘
                           │ Price feeds (REST + WebSocket)
                           ▼
  ┌──────────────────────────────────────────────────────┐
  │                  AGENT PIPELINE                       │
  │                                                       │
  │  ┌──────────┐  x402   ┌──────────┐  x402  ┌────────┐│
  │  │  Signal   │───402──→│ Creator  │──402──→│Resolver││
  │  │  Agent    │         │  Agent   │        │ Agent  ││
  │  │          │         │          │        │        ││
  │  │ AI LLM │         │ Deploy   │        │ OKX    ││
  │  │ Tool-use  │         │ Contract │        │ Settle ││
  │  │ Loop      │         │ On-chain │        │ Price  ││
  │  └──────────┘         └──────────┘        └────────┘│
  │       │                     │                  │     │
  │       └─────────────────────┼──────────────────┘     │
  │                             │                        │
  └─────────────────────────────┼────────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   X Layer Mainnet     │
                    │   chainId: 196        │
                    │   MarketFactory.sol   │
                    │   PredictionMarket.sol│
                    └───────────────────────┘
```

### Agent Roles

| Agent | Brain | Function | x402 Role |
|-------|-------|----------|-----------|
| **Signal** | AI LLM (tool-use agentic loop) | Monitors OKX prices, detects volatility, creates markets | Service buyer (pays Creator) |
| **Creator** | Rule-based + nonce management | Deploys PredictionMarket contracts on X Layer | Service provider (receives from Signal, pays Resolver) |
| **Resolver** | OKX price oracle + AI analysis | Fetches settlement price, resolves markets on-chain | Service provider (receives from Creator) |

### AI Decision Engine

**Signal Agent** uses a full AI LLM tool-use loop with 5 tools:

1. `get_price` — Fetch live OKX spot price + 24h stats
2. `get_candles` — 1H OHLCV candlestick data for technical analysis
3. `get_market_sentiment` — Crypto Fear & Greed Index
4. `list_active_markets` — Avoid duplicate markets
5. `create_market` — Deploy a new prediction market on-chain

The AI analyzes trends, volume, support/resistance, and momentum before deciding whether to create a market. It generates first-person reasoning that is displayed on the frontend.

**Resolver Agent** uses AI for post-resolution analysis — explaining what happened, why, and one forward-looking insight for traders.

---

## OnchainOS Integration

| # | Integration | Protocol | Frequency | Status |
|---|------------|----------|-----------|--------|
| 1 | OKX Market API v5 (BTC/ETH/OKB) | REST | Every 5s (cached) | Active |
| 2 | OKX Candlestick Data | REST | Per AI analysis | Active |
| 3 | OKX WebSocket Price Feed | WebSocket | Real-time | Active |
| 4 | OnchainOS DEX Aggregator V6 | REST (HMAC-SHA256) | Per OKB market resolution | Active — Resolver cross-validates CEX price with DEX on-chain price to prevent oracle manipulation |
| 5 | OnchainOS Wallet API V6 | REST (HMAC-SHA256) | Per market deployment | Active — Creator checks wallet balance before deploying to prevent failed TX from insufficient funds |
| 6 | X Layer RPC (contract calls) | JSON-RPC | Per transaction | Active |
| 7 | x402 HTTP 402 Protocol | HTTP 402 | Per agent service call | Active |
| 8 | Crypto Fear & Greed Index | REST | Per AI analysis run | Active |
| 9 | OKX/MetaMask Wallet | EIP-1193 | On user action | Active |
| 10 | AI LLM (Anthropic SDK / Proxy) | REST | Every 30min + per resolution | Active |
| 11 | MarketFactory Contract | Solidity | On market deployment | Active |
| 12 | PredictionMarket Contract | Solidity | On bet/resolve/claim | Active |

---

## x402 Protocol Implementation

Agent-to-agent service payments follow the HTTP 402 Payment Required standard:

```
1. Signal Agent:  GET /creator/services/deploy-market
2. Creator Agent: 402 Payment Required
                  X-Payment-Amount: 0.002 OKB
                  X-Payment-Currency: OKB
                  X-Payment-Protocol: x402/1.0
3. Signal Agent:  [verifies balance, signs payment]
4. Signal Agent:  GET /creator/services/deploy-market
                  X-Payment-Verified: true
5. Creator Agent: 200 OK + x402Receipt + deploys market
```

Dynamic pricing adjusts based on time-of-day and demand. Service catalog:

| Provider | Service | Base Price | Description |
|----------|---------|-----------|-------------|
| Creator | deploy-market | 0.002 OKB | Deploy prediction market contract |
| Creator | market-status | 0.0001 OKB | Query on-chain market state |
| Resolver | resolve-market | 0.001 OKB | Fetch OKX price and settle market |
| Resolver | price-analysis | 0.0005 OKB | Post-resolution AI LLM analysis |
| Signal | market-intel | 0.0003 OKB | Price + technical analysis + sentiment |

---

## Smart Contracts

| Contract | Function | Security |
|----------|----------|----------|
| **MarketFactory** | Deploys markets, tracks all instances, manages agent roles | onlyCreator, onlyOwner |
| **PredictionMarket** | YES/NO betting, OKX price resolution, proportional payout | nonReentrant, onlyResolver, afterDeadline |

**Key features:**
- 2% platform fee collected on resolution
- Job Hash Job Commit/Complete Hash for cryptographic audit
- 50/50 initial liquidity split
- Zero-gas on X Layer (OKB native currency)

**Test coverage:** 46 tests passing — deployment, betting, resolution, claiming, edge cases, multi-user scenarios.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Blockchain | X Layer Mainnet (chainId 196, EVM, zero gas) |
| Contracts | Solidity 0.8.24, Hardhat, 2 contracts |
| AI | Configurable LLM (OpenAI-compatible API, supports GPT-4o / Claude / others) |
| Backend | Node.js + TypeScript + Express + WebSocket |
| Frontend | Next.js 14 + React 18 + Tailwind CSS |
| Wallet | Wagmi v2 + Viem (MetaMask, OKX Wallet) |
| Market Data | OKX REST API v5 + WebSocket |
| Persistence | File-based JSON store (survives restarts) |
| Testing | Hardhat + Chai (46 tests) |

---

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your wallet keys and LLM API key

# 3. Deploy contracts (optional — runs in simulation without)
pnpm contracts:compile
pnpm contracts:deploy:mainnet

# 4. Start agents + frontend
pnpm dev

# Agents API: http://localhost:3001
# Frontend:   http://localhost:3000
```

**Without contract deployment:** Agents run in full simulation mode — markets are created, resolved, and displayed with demo data. The entire lifecycle is visible.

**With contract deployment:** Set `FACTORY_ADDRESS`, `CREATOR_PRIVATE_KEY`, `RESOLVER_PRIVATE_KEY` in `.env`. All transactions are live on X Layer.

---

## Why X Layer

**Zero gas** makes autonomous agent transactions viable. Each market deployment + resolution costs nothing on X Layer. On Ethereum, the same operations would cost $50+ per market.

**Fast finality** enables real-time agent commerce. When Signal Agent detects volatility, Creator Agent deploys a market within seconds.

**OKX ecosystem** provides the complete stack: Market API for real-world price feeds, Wallet SDK for player onboarding, and the x402 protocol for agent-to-agent payments.

---

## Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | `/` | Market grid, agent pipeline, live prices, activity feed |
| Market Detail | `/market/[address]` | Odds, betting panel, market info, TX links |
| Leaderboard | `/leaderboard` | Agent performance, ERC standards compliance |
| Portfolio | `/portfolio` | User positions, claimable winnings |
| Evidence | `/evidence` | On-chain proof, x402 payments, integration status |

---

## License

Apache 2.0
