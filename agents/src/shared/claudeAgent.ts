// Claude AI Signal Agent — tool-use agentic loop
// Supports both native Anthropic SDK and OpenAI-compatible proxy (e.g. turbo-api.com)
// When CLAUDE_BASE_URL is set → OpenAI-compatible mode (works with most proxy providers)
// When only CLAUDE_API_KEY is set → native Anthropic API

import { getCurrentPrice, getCandles } from './okxApi.js'
import type { DeployParams, MarketInfo, AgentAction } from './types.js'

// ── System Prompts ────────────────────────────────────────────────────────────

const SIGNAL_SYSTEM_PROMPT = `You are the Signal Agent for OracleX, an AI-powered prediction market platform on X Layer blockchain.

Your job: Analyze crypto market data using technical analysis and create prediction markets for OKB-USDT and BTC-USDT.

CRITICAL RULES:
- You may ONLY create markets for OKB-USDT and BTC-USDT. Never create ETH or other markets.
- Create at most 1 market per pair per run (max 2 total).
- Check list_active_markets first. If a pair already has an active market, do NOT create another for that pair.
- If both pairs have active markets, just analyze and explain your thinking.

WORKFLOW — always follow this order:
1. Call get_market_sentiment to understand the overall market mood
2. Call get_price for OKB-USDT and BTC-USDT
3. Call get_candles for the pair(s) you want to create markets for (1H bars, 24 candles)
4. Call list_active_markets to check which pairs already have markets
5. Create markets only for pairs that don't have an active market yet

TECHNICAL ANALYSIS GUIDELINES:
- Trend: Is price making higher highs/lower lows on the candles?
- Volume: Is volume increasing on the move (confirms trend)?
- Support/Resistance: Is price near a round number or recent high/low?
- Momentum: Large 24h change (>3%) suggests strong trend continuation or reversal risk
- Fear & Greed <25 = extreme fear (contrarian bullish signal), >75 = extreme greed (caution)

QUESTION VARIETY — rotate between these formats:
- Price level: "Will X close above $Y by [deadline]?"
- Relative move: "Will X gain more than 3% before midnight UTC?"
- Reversal: "Will X recover above $Y after today's dip?"

TARGET PRICE RULES:
- BTC: round to nearest $500
- OKB: round to nearest $1 (or $0.5 if price < $10)
- Set target at a meaningful level the market is likely to test

DURATION: expire at next UTC midnight (calculate hours remaining).
Be concise — reasoning max 2 sentences.`

const RESOLVER_SYSTEM_PROMPT = `You are the Resolver Agent for OracleX prediction markets.
After a market resolves, write a brief, insightful analysis of what happened.
Be factual, concise, and educational. Max 2-3 sentences.
Format: State the outcome, explain the likely market driver, give one forward-looking insight.`

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS_OPENAI = [
  {
    type: 'function' as const,
    function: {
      name: 'get_price',
      description: 'Fetch current spot price and 24h stats for a crypto pair from OKX',
      parameters: {
        type: 'object',
        properties: {
          instId: { type: 'string', description: 'e.g. BTC-USDT, ETH-USDT, OKB-USDT' },
        },
        required: ['instId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_candles',
      description: 'Get 1H OHLCV candlestick data for technical analysis (last 24 candles). Use this to identify trends, support/resistance, and volume patterns.',
      parameters: {
        type: 'object',
        properties: {
          instId: { type: 'string', description: 'e.g. BTC-USDT' },
        },
        required: ['instId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_market_sentiment',
      description: 'Get the current Crypto Fear & Greed Index (0=extreme fear, 100=extreme greed). Call this first to understand overall market mood.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_active_markets',
      description: 'List all currently active OracleX prediction markets (to avoid creating duplicates)',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_market',
      description: 'Create a new on-chain prediction market. Only call when you have found a genuinely interesting opportunity backed by technical analysis.',
      parameters: {
        type: 'object',
        properties: {
          instId:        { type: 'string',  description: 'Trading pair, e.g. BTC-USDT' },
          question:      { type: 'string',  description: 'The YES/NO prediction question. Must be specific and include a deadline time.' },
          targetPrice:   { type: 'number',  description: 'Price threshold that determines YES/NO outcome' },
          durationHours: { type: 'number',  description: 'Hours until market expires (8–24 recommended)' },
          reasoning:     { type: 'string',  description: 'Technical analysis basis for this market (2 sentences max)' },
        },
        required: ['instId', 'question', 'targetPrice', 'durationHours', 'reasoning'],
      },
    },
  },
]

// ── Fear & Greed helper ───────────────────────────────────────────────────────

async function fetchFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return null
    const body: any = await res.json()
    const d = body.data?.[0]
    if (!d) return null
    return { value: parseInt(d.value), label: d.value_classification }
  } catch {
    return null
  }
}

// ── Technical analysis summary from candles ───────────────────────────────────

function analyzeCandleSummary(candles: import('./okxApi.js').Candle[]): string {
  if (candles.length < 2) return 'Insufficient data'
  const first  = candles[0]
  const last   = candles[candles.length - 1]
  const change = ((last.close - first.open) / first.open * 100).toFixed(2)
  const high   = Math.max(...candles.map(c => c.high))
  const low    = Math.min(...candles.map(c => c.low))
  const avgVol = candles.reduce((s, c) => s + c.vol, 0) / candles.length
  const lastVol = candles[candles.length - 1].vol
  const volRatio = (lastVol / avgVol).toFixed(2)

  // Simple trend detection: count bullish vs bearish candles
  const bullish = candles.filter(c => c.close > c.open).length
  const trend   = bullish > candles.length * 0.6 ? 'uptrend' :
                  bullish < candles.length * 0.4 ? 'downtrend' : 'sideways'

  return `24h range: $${low.toFixed(2)}–$${high.toFixed(2)} | Change: ${change}% | Trend: ${trend} | Vol ratio (last/avg): ${volRatio}x`
}

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  getActiveMarkets: () => MarketInfo[],
  onDeploy: (params: DeployParams) => Promise<void>,
  onAction: (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<unknown> {

  if (name === 'get_price') {
    const instId = args.instId as string
    const ticker = await getCurrentPrice(instId)
    onAction({
      role:   'signal',
      action: `🤖 Claude: checked ${instId}`,
      detail: ticker
        ? `$${ticker.price.toLocaleString()} | 24h: ${ticker.change24h >= 0 ? '+' : ''}${ticker.change24h.toFixed(2)}% | H: $${ticker.high24h.toFixed(2)} L: $${ticker.low24h.toFixed(2)}`
        : 'price unavailable',
    })
    return ticker
      ? {
          instId,
          price:    ticker.price,
          change24h: ticker.change24h,
          high24h:  ticker.high24h,
          low24h:   ticker.low24h,
          vol24h:   ticker.vol24h,
          open24h:  ticker.open24h,
        }
      : { instId, error: 'Price unavailable' }
  }

  if (name === 'get_candles') {
    const instId  = args.instId as string
    const candles = await getCandles(instId, '1H', 24)
    const summary = analyzeCandleSummary(candles)
    onAction({
      role:   'signal',
      action: `🤖 Claude: technical analysis ${instId}`,
      detail: summary,
    })
    // Return condensed candle data (last price, OHLC summary, vol trend)
    return {
      instId,
      candleCount: candles.length,
      summary,
      recentCandles: candles.slice(-6).map(c => ({
        time:  new Date(c.openTime).toISOString().slice(11, 16),
        open:  c.open,
        high:  c.high,
        low:   c.low,
        close: c.close,
        vol:   Math.round(c.vol),
      })),
    }
  }

  if (name === 'get_market_sentiment') {
    const fg = await fetchFearGreed()
    const result = fg
      ? { fearGreedIndex: fg.value, label: fg.label, interpretation: fg.value < 30 ? 'Contrarian buy signal' : fg.value > 70 ? 'Caution — overheated market' : 'Neutral' }
      : { fearGreedIndex: 50, label: 'Neutral', interpretation: 'Data unavailable, assume neutral' }
    onAction({
      role:   'signal',
      action: '🤖 Claude: market sentiment check',
      detail: fg ? `Fear & Greed: ${fg.value} (${fg.label})` : 'Fear & Greed: unavailable',
    })
    return result
  }

  if (name === 'list_active_markets') {
    return getActiveMarkets()
      .filter(m => !m.resolved && m.status === 'active')
      .map(m => ({
        instId:      m.instId,
        targetPrice: m.targetPrice,
        question:    m.question.slice(0, 80),
        expiresIn:   `${Math.max(0, (m.deadline * 1000 - Date.now()) / 3_600_000).toFixed(1)}h`,
      }))
  }

  if (name === 'create_market') {
    const input = args as {
      instId: string; question: string; targetPrice: number
      durationHours: number; reasoning: string
    }
    const deadline = Math.floor((Date.now() + input.durationHours * 3_600_000) / 1000)
    onAction({
      role:   'signal',
      action: `🤖 AI Signal: ${input.instId}`,
      detail: input.reasoning,
    })
    try {
      await onDeploy({
        instId:       input.instId,
        question:     input.question,
        targetPrice:  input.targetPrice,
        deadline,
        currentPrice: input.targetPrice,
        aiReasoning:  input.reasoning,
      })
      return { success: true, deployed: input.instId }
    } catch (err) {
      return { success: false, error: (err as Error).message.slice(0, 80) }
    }
  }

  return { error: `Unknown tool: ${name}` }
}

// ── OpenAI-compatible agentic loop ────────────────────────────────────────────

async function runWithOpenAI(
  apiKey: string,
  baseURL: string,
  model: string,
  systemPrompt: string,
  userMessage: string,
  tools: typeof TOOLS_OPENAI,
  toolExecutor: (name: string, args: Record<string, unknown>) => Promise<unknown>,
  onDone?: (content: string) => void,
): Promise<void> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userMessage },
  ]

  const MAX_ITER = 15
  for (let i = 0; i < MAX_ITER; i++) {
    const res = await fetch(`${baseURL}/v1/chat/completions`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body:    JSON.stringify({
        model,
        messages,
        tools,
        // First turn: force tool use so model always starts by gathering data
        tool_choice: i === 0 ? 'required' : 'auto',
        max_tokens:  1024,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`API ${res.status}: ${err.slice(0, 120)}`)
    }

    const data = await res.json() as {
      choices: Array<{
        finish_reason: string
        message: {
          role: string
          content: string | null
          tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>
        }
      }>
    }

    const choice = data.choices[0]
    messages.push(choice.message)

    if (choice.finish_reason === 'stop' || choice.finish_reason === 'end_turn') {
      if (choice.message.content?.trim()) {
        onDone?.(choice.message.content.trim())
      }
      break
    }

    if (choice.finish_reason !== 'tool_calls' || !choice.message.tool_calls?.length) break

    for (const tc of choice.message.tool_calls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments) } catch {}
      const result = await toolExecutor(tc.function.name, args)
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) })
    }
  }
}

// ── Native Anthropic SDK agentic loop ─────────────────────────────────────────

async function runWithAnthropic(
  apiKey: string,
  model: string,
  getActiveMarkets: () => MarketInfo[],
  onDeploy: (params: DeployParams) => Promise<void>,
  onAction: (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<void> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const tools = TOOLS_OPENAI.map(t => ({
    name:         t.function.name,
    description:  t.function.description,
    input_schema: t.function.parameters,
  }))

  const messages: Array<{ role: 'user' | 'assistant'; content: any }> = [
    { role: 'user', content: `Analyze current crypto market conditions and create prediction markets.\nUTC: ${new Date().toUTCString()}` },
  ]

  const MAX_ITER = 15
  for (let i = 0; i < MAX_ITER; i++) {
    const response = await client.messages.create({
      model, max_tokens: 1024,
      system: SIGNAL_SYSTEM_PROMPT,
      tools: tools as any, messages: messages as any,
    })

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') {
      const text = (response.content as any[]).find((b: any) => b.type === 'text')
      if (text?.text?.trim()) {
        onAction({ role: 'signal', action: 'AI analysis complete', detail: text.text.slice(0, 200) })
      }
      break
    }

    if (response.stop_reason !== 'tool_use') break

    const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = []
    for (const block of response.content as any[]) {
      if (block.type !== 'tool_use') continue
      const result = await executeTool(block.name, block.input as Record<string, unknown>, getActiveMarkets, onDeploy, onAction)
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: toolResults })
  }
}

// ── Public: Signal Agent entry point ─────────────────────────────────────────

export async function runClaudeSignalAgent(
  getActiveMarkets: () => MarketInfo[],
  onDeploy: (params: DeployParams) => Promise<void>,
  onAction: (action: Omit<AgentAction, 'id' | 'timestamp'>) => void,
): Promise<void> {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) {
    console.log('[Claude] No CLAUDE_API_KEY — skipping AI signal run')
    return
  }

  const baseURL = process.env.CLAUDE_BASE_URL?.replace(/\/$/, '')
  const model   = process.env.CLAUDE_MODEL ?? 'claude-3-5-haiku-20241022'

  onAction({
    role:   'signal',
    action: '🤖 Claude AI analyzing markets…',
    detail: `Model: ${model} | Mode: ${baseURL ? 'proxy' : 'direct'} | ${new Date().toUTCString()}`,
  })

  const toolExecutor = (name: string, args: Record<string, unknown>) =>
    executeTool(name, args, getActiveMarkets, onDeploy, onAction)

  const userMsg = `Analyze current crypto market conditions and create prediction markets where you see opportunity.\nCurrent UTC: ${new Date().toUTCString()}`

  try {
    if (baseURL) {
      await runWithOpenAI(
        apiKey, baseURL, model,
        SIGNAL_SYSTEM_PROMPT, userMsg,
        TOOLS_OPENAI, toolExecutor,
        (content) => onAction({ role: 'signal', action: '🤖 Claude analysis complete', detail: content.slice(0, 200) }),
      )
    } else {
      await runWithAnthropic(apiKey, model, getActiveMarkets, onDeploy, onAction)
    }
  } catch (err) {
    throw err  // let caller handle
  }
}

// ── Public: Resolver analysis (post-settlement) ───────────────────────────────

export async function runClaudeResolverAnalysis(params: {
  question:     string
  instId:       string
  targetPrice:  number
  finalPrice:   number
  outcomeYes:   boolean
  durationHours: number
  change24h?:   number
}): Promise<string | null> {
  const apiKey = process.env.CLAUDE_API_KEY
  if (!apiKey) return null

  const baseURL = process.env.CLAUDE_BASE_URL?.replace(/\/$/, '')
  const model   = process.env.CLAUDE_MODEL ?? 'claude-3-5-haiku-20241022'

  const outcome = params.outcomeYes ? 'YES (price reached target)' : 'NO (price did not reach target)'
  const diff    = ((params.finalPrice - params.targetPrice) / params.targetPrice * 100).toFixed(2)

  const userMsg = `A prediction market just resolved.

Market: "${params.question}"
Asset: ${params.instId}
Target price: $${params.targetPrice.toLocaleString()}
Final settlement price: $${params.finalPrice.toLocaleString()}
Outcome: ${outcome}
Price difference from target: ${diff}%
Market duration: ~${params.durationHours.toFixed(1)} hours
24h change at resolution: ${params.change24h !== undefined ? `${params.change24h.toFixed(2)}%` : 'unknown'}

Write a 2-3 sentence analysis: what happened, why, and one forward-looking insight for traders.`

  try {
    let analysis = ''

    if (baseURL) {
      // Simple single-turn call (no tools needed for analysis)
      const res = await fetch(`${baseURL}/v1/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body:    JSON.stringify({
          model,
          max_tokens: 200,
          messages: [
            { role: 'system', content: RESOLVER_SYSTEM_PROMPT },
            { role: 'user',   content: userMsg },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      })
      if (res.ok) {
        const data: any = await res.json()
        analysis = data.choices?.[0]?.message?.content?.trim() ?? ''
      }
    } else {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client   = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model, max_tokens: 200,
        system: RESOLVER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMsg }],
      })
      const block = response.content.find(b => b.type === 'text')
      if (block?.type === 'text') analysis = block.text.trim()
    }

    return analysis || null
  } catch (err) {
    console.warn('[Claude Resolver] Analysis failed:', (err as Error).message?.slice(0, 80))
    return null
  }
}
