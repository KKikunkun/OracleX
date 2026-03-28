// Exponential backoff retry utility

export interface RetryOptions {
  maxRetries:   number
  baseDelayMs:  number
  maxDelayMs:   number
  label?:       string
}

const DEFAULTS: RetryOptions = {
  maxRetries:  3,
  baseDelayMs: 1000,
  maxDelayMs:  15000,
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: Partial<RetryOptions> = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, label } = { ...DEFAULTS, ...opts }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries) throw err

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
      const jitter = delay * (0.5 + Math.random() * 0.5)

      console.warn(
        `[Retry] ${label ?? 'operation'} failed (attempt ${attempt + 1}/${maxRetries + 1}), ` +
        `retrying in ${Math.round(jitter)}ms: ${(err as Error).message?.slice(0, 80)}`
      )
      await new Promise(r => setTimeout(r, jitter))
    }
  }

  throw new Error('unreachable')
}
