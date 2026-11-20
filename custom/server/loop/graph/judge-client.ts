// overlay/loop/graph/judge-client.ts
// 独立审查模型客户端（2026-11-19 调度智能接线批）。
//
// 只做一件事：把 diff + rubric 发给 OpenAI-compatible /chat/completions，解析
// {score, reasoning}。所有失败（未配置、HTTP 错、超时、坏 JSON、分数越界）都
// 返回 {status:'pending', reason}——与 verifier 的 pending 语义一致：跳过该项，
// 不让 judge 故障烧穿 repair 循环。
//
// 安全边界：不把 API key、diff 全文写日志；diff 有字符上限；请求带超时。
import type { JudgeVerdict } from '../types'

export type JudgeProtocol = 'openai' | 'anthropic'

export interface JudgeClientOptions {
  baseUrl: string
  model: string
  apiKey?: string
  /** 协议：openai=/chat/completions，anthropic=/v1/messages（缺省 openai）。 */
  protocol?: JudgeProtocol
  timeoutMs?: number
  /** 输出上限；anthropic 协议缺省 1024（思考块也占 token）。 */
  maxTokens?: number
  /** diff 上限（字符），超限截断并附提示；缺省 20000。 */
  maxDiffChars?: number
  fetchImpl?: typeof fetch
}

export interface JudgeRequestContext {
  model?: string
  diff: string
  rubric: string
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_DIFF_CHARS = 20_000

function pending(reason: string): JudgeVerdict {
  return { status: 'pending', reason }
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : trimmed).trim()
  try {
    return JSON.parse(candidate)
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

export function createOpenAiJudgeClient(
  opts: JudgeClientOptions,
): (model: string, diff: string, rubric: string) => Promise<JudgeVerdict> {
  const baseUrl = opts.baseUrl.trim().replace(/\/+$/, '')
  const defaultModel = opts.model.trim()
  const protocol: JudgeProtocol = opts.protocol ?? 'openai'
  const timeoutMs = Math.max(1, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const maxTokens = Math.max(64, opts.maxTokens ?? (protocol === 'anthropic' ? 1024 : 512))
  const maxDiffChars = Math.max(1000, opts.maxDiffChars ?? DEFAULT_MAX_DIFF_CHARS)
  const fetchImpl = opts.fetchImpl ?? fetch
  const systemPrompt = 'You are an independent reviewer. Return STRICT JSON only: '
    + '{"score": <number 0..1>, "reasoning": "<short evidence-based reason>"}. '
    + 'Do not include markdown fences or extra keys.'

  return async (model, diff, rubric) => {
    if (!baseUrl || !defaultModel) return pending('judge client not configured (baseUrl/model)')
    if (protocol === 'anthropic' && !opts.apiKey) {
      return pending('judge api key missing for anthropic protocol')
    }
    const chosen = (model || defaultModel).trim()
    const bodyDiff = diff.length > maxDiffChars
      ? `${diff.slice(0, maxDiffChars)}\n… [diff truncated at ${maxDiffChars} chars, total ${diff.length}]`
      : diff
    const userPrompt = `Rubric:\n${rubric}\n\nDiff under review:\n${bodyDiff}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      let content: string | null = null
      if (protocol === 'anthropic') {
        const url = baseUrl.endsWith('/v1') ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': opts.apiKey as string,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: chosen,
            max_tokens: maxTokens,
            temperature: 0,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
          signal: controller.signal,
        })
        if (!res.ok) return pending(`judge http ${res.status}`)
        const data = await res.json() as {
          content?: Array<{ type?: unknown; text?: unknown }>
        }
        content = (data?.content ?? [])
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => String(block.text))
          .join('\n')
      } else {
        const res = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: chosen,
            temperature: 0,
            max_tokens: maxTokens,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
          }),
          signal: controller.signal,
        })
        if (!res.ok) return pending(`judge http ${res.status}`)
        const data = await res.json() as {
          choices?: Array<{ message?: { content?: unknown } }>
        }
        const value = data?.choices?.[0]?.message?.content
        content = typeof value === 'string' ? value : null
      }
      if (typeof content !== 'string' || !content.trim()) return pending('judge empty response')
      const parsed = extractJson(content) as { score?: unknown; reasoning?: unknown } | null
      const score = typeof parsed?.score === 'number' ? parsed.score : Number.NaN
      if (!Number.isFinite(score) || score < 0 || score > 1) {
        return pending('judge score missing or out of range')
      }
      const reasoning = typeof parsed?.reasoning === 'string' ? parsed.reasoning.trim() : ''
      return { score, reasoning: reasoning.slice(0, 4000) || 'judge returned no reasoning' }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return pending(`judge unavailable (${message.slice(0, 200)})`)
    } finally {
      clearTimeout(timer)
    }
  }
}
