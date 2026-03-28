# OracleX: AI-Powered Prediction Markets on X Layer

## Project Overview

OracleX is an autonomous AI prediction market platform on X Layer where three AI agents — Signal, Creator, and Resolver — continuously monitor OKX cryptocurrency prices, deploy YES/NO prediction markets on-chain, and settle them using real OKX market data. Agents communicate via x402 HTTP 402 protocol with dynamic pricing. All key actions are recorded on X Layer with Job Hash cryptographic audit trails.

---

## Problem Statement

The hackathon theme asks: "What does on-chain commerce look like when AI agents are the primary actors?"

Most prediction markets require human operators to create and settle markets. OracleX removes the human entirely — AI agents autonomously detect trading opportunities, deploy markets, and settle them with real price data, creating a fully automated prediction market economy on X Layer.

---

## Solution Architecture

### AI Agent Pipeline

**Signal Agent (AI Brain)**
Uses a full tool-use agentic loop with 5 tools: `get_price`, `get_candles`, `get_market_sentiment`, `list_active_markets`, `create_market`. Analyzes trends, volume, and momentum before creating markets. Generates reasoning displayed on the frontend.

**Creator Agent (Contract Deployer)**
Receives signals via x402 payment, deploys PredictionMarket contracts on X Layer with nonce management. Injects 0.004 OKB initial liquidity split 50/50.

**Resolver Agent (OKX Oracle)**
Polls market deadlines every 5 minutes. Fetches OKX settlement price at deadline, resolves markets on-chain, then asks AI for post-resolution analysis.

### x402 Protocol

Complete HTTP 402 Payment Required flow between agents:
- Signal → Creator: pays for `deploy-market` service (0.002 OKB)
- Creator → Resolver: pays for `resolve-market` service (0.001 OKB)
- Dynamic pricing adjusts based on time-of-day and demand
- 6 services in the catalog with real-time pricing

---

## OnchainOS Integration

| # | Integration | Protocol | Frequency | Status |
|---|------------|----------|-----------|--------|
| 1 | OKX Market API v5 (BTC/ETH/OKB) | REST | Every 5s | Active |
| 2 | OKX Candlestick Data (1H/4H/1D) | REST | Per AI analysis | Active |
| 3 | OKX WebSocket Price Feed | WebSocket | Real-time | Active |
| 4 | OnchainOS DEX Aggregator V6 | REST (HMAC-SHA256) | Per OKB resolution | Active — cross-validate CEX vs DEX price |
| 5 | OnchainOS Wallet API V6 | REST (HMAC-SHA256) | Per deployment | Active — pre-flight balance check |
| 6 | X Layer RPC | JSON-RPC | Per transaction | Active |
| 7 | x402 HTTP 402 Protocol | HTTP 402 | Per service call | Active |
| 8 | Crypto Fear & Greed Index | REST | Per AI run | Active |
| 9 | OKX/MetaMask Wallet (EIP-1193) | DApp Connect | On user action | Active |
| 10 | AI LLM (configurable, OpenAI-compatible) | REST | Every 30min + per resolution | Active |
| 11 | MarketFactory Contract | Solidity | On deployment | Active |
| 12 | PredictionMarket Contract | Solidity | On bet/resolve/claim | Active |

---

## Smart Contracts

| Contract | Address | Function |
|----------|---------|----------|
| MarketFactory | [`0x5D1b4aaC3556E8fbbfa3B2838bD952c7F9857f7a`](https://www.oklink.com/xlayer/address/0x5D1b4aaC3556E8fbbfa3B2838bD952c7F9857f7a) | Factory for deploying CPMM prediction markets |
| PredictionMarket | Deployed per market by Factory | Individual YES/NO market with CPMM dynamic pricing |

**Security:** ReentrancyGuard on `resolve()`, `claimWinnings()`, `buyYes()`, `buyNo()`, role-based access (onlyCreator, onlyResolver), Job Hash job commit/complete hashes.

**CPMM Model:** Constant Product Market Maker (Polymarket-style). Price changes with every trade. `k = yesPool * noPool` stays constant.

**Test Coverage:** 63 tests passing — covers CPMM pricing, slippage, price impact, deployment, resolution, claims, multi-user proportional payouts.

---

## AI Model & Prompt Design

**Model:** Configurable LLM via OpenAI-compatible API (currently GPT-4o-mini, supports any model)

**Signal Agent System Prompt:**
- Analyzes crypto market data using technical analysis
- Follows strict workflow: sentiment → prices → candles → active markets → create
- Uses 5 tools in an agentic loop (max 15 iterations)
- Question variety: price level, range, relative move, reversal
- Quality over quantity (0-3 markets per run)

**Resolver Agent:**
- 2-3 sentence post-resolution analysis
- States outcome, explains market driver, gives forward insight

---

## Player Experience

1. **Browse Markets** — See active prediction markets with live odds, AI reasoning
2. **Connect Wallet** — MetaMask or OKX Wallet, auto-connects to X Layer
3. **Place Bets** — Buy YES or NO shares with OKB
4. **Watch Resolution** — Resolver Agent settles at deadline using OKX price
5. **Claim Winnings** — Winners share the pool proportionally (2% platform fee)
6. **Track Portfolio** — View all positions, claimable winnings

---

## Why X Layer Is Essential

**Zero gas** — Each market deployment + resolution costs nothing. On Ethereum, the same would cost $50+. This makes autonomous agent commerce viable.

**Fast finality** — Signal-to-deployment in seconds, not minutes.

**OKX ecosystem** — Market API for price feeds, Wallet SDK for onboarding, x402 for agent payments. The full stack in one ecosystem.

---

## Technical Specifications

| Component | Technology |
|-----------|-----------|
| Blockchain | X Layer Mainnet (chainId 196, EVM) |
| Contracts | Solidity 0.8.24, Hardhat, ReentrancyGuard |
| AI | Configurable LLM (OpenAI-compatible API) |
| Backend | Node.js + TypeScript + Express + WebSocket (ws) |
| Frontend | Next.js 14 + React 18 + Tailwind CSS |
| Wallet | Wagmi v2 + Viem (OKX Wallet only) |
| Data | OKX REST API v5 + DEX Aggregator V6 + Fear & Greed |
| Persistence | File-based JSON (survives restarts) |
| Testing | Hardhat + Chai (63 tests) |
| Agent Comms | x402 HTTP 402 Protocol |
| Standards | Job Hash (Job Hash), Agent Reputation (Reputation) |

---

## Verified On-Chain Proof

| Metric | Value | Verification |
|--------|-------|-------------|
| Factory Contract | `0x5D1b4aaC3556E8fbbfa3B2838bD952c7F9857f7a` | [Explorer](https://www.oklink.com/xlayer/address/0x5D1b4aaC3556E8fbbfa3B2838bD952c7F9857f7a) |
| Deployer Wallet | `0xA8950d3e9B0Df7CD5fcdb05B4639B558aFBb57ba` | [Explorer](https://www.oklink.com/xlayer/address/0xA8950d3e9B0Df7CD5fcdb05B4639B558aFBb57ba) |
| Factory Deploy TX | `0x45fe9fcf95d80bc2...` | [Explorer](https://www.oklink.com/xlayer/tx/0x45fe9fcf95d80bc2a71e3566246d25ad598fc2ebfeb0e81b8cbc592b326b8e20) |

All on-chain activity is verifiable via the in-app **Evidence Page** (`/evidence`).

---

## Repository

Open source under Apache 2.0. All code, contracts, tests, and deployment scripts included.

---

## Summary

OracleX demonstrates AI agent commerce on X Layer through a working prediction market platform where three agents autonomously create, operate, and settle markets.

**What's real and verifiable:**
- Smart contracts deployed on X Layer with Job Hash audit trail
- x402 HTTP 402 protocol for agent-to-agent service payments
- AI tool-use agentic loop for market creation decisions
- OKX Market API driving real price data for settlement
- WebSocket real-time updates to frontend
- 63 smart contract tests passing (CPMM model)
- File-based persistence (agents survive restarts)

**What's off-chain (by design):**
- Agent coordination (for speed — sub-second response times)
- AI reasoning (LLM output too large for on-chain storage; summaries displayed)
- x402 settlement (in-memory with on-chain anchoring pattern)

This hybrid architecture follows the standard pattern for blockchain applications: off-chain computation + on-chain state anchoring.
