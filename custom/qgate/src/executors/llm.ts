// llm executor（OD-005 兑现：LLM 判定 = executor 插件，不进内核依赖）。
// 语义边界（v0.1 §4.3 Deterministic First, LLM Second）：
//   - LLM 只产出 conditional/fail 的候选判定，**永远不能单独产出 pass**
//   - 无凭据/网络失败/响应无法解析 → error 证据 → INCONCLUSIVE（不 crash、不假装通过）
//   - evidence.independence = 'implementation-derived'？否——LLM 判定属独立推理面，记 'human-reviewed'？否：
//     LLM 非人。沿用七枚举，LLM 推理最接近 spec-derived（按门声明的评审标准）——显式标注 producer 即足够。
// 凭据来源（不读 zcode 加密凭证库）：QGATE_LLM_API_KEY (+ 可选 QGATE_LLM_BASE_URL/PROVIDER/MODEL)。

import { randomUUID } from 'node:crypto'
import type { Evidence, ExecutorSpec, GateSpec } from '../core/types.js'

export interface LlmExecutorInput {
  runId: string
  gateId: string
  workspace: string
  gateSpec?: GateSpec
  commit?: string
  changedPaths?: readonly string[]
}

interface ChatMessage {
  role: 'system' | 'user'
  content: string
}

const TIMEOUT_MS = 30_000

function pickProvider(): { url: string; key: string | undefined; model: string } | null {
  const provider = (process.env.QGATE_LLM_PROVIDER ?? 'zhipu').toLowerCase()
  const key = process.env.QGATE_LLM_API_KEY
  if (provider === 'openai') {
    return {
      url: process.env.QGATE_LLM_BASE_URL ?? 'https://api.openai.com/v1/chat/completions',
      key,
      model: process.env.QGATE_LLM_MODEL ?? 'gpt-4o-mini',
    }
  }
  if (provider === 'anthropic') {
    return {
      url: process.env.QGATE_LLM_BASE_URL ?? 'https://api.anthropic.com/v1/messages',
      key,
      model: process.env.QGATE_LLM_MODEL ?? 'claude-haiku-4-5',
    }
  }
  // zhipu（bigmodel，GLM）
  return {
    url: process.env.QGATE_LLM_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    key,
    model: process.env.QGATE_LLM_MODEL ?? 'glm-4.5-flash',
  }
}

function parseVerdictJson(text: string): { verdict: 'pass' | 'fail' | 'conditional'; summary: string; conditions?: string[] } | null {
  // 容忍模型加 markdown 围栏与前后缀：截取首个 { 与最后 } 之间内容
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    const verdict = raw.verdict
    const summary = typeof raw.summary === 'string' ? raw.summary : undefined
    if ((verdict === 'pass' || verdict === 'fail' || verdict === 'conditional') && summary) {
      const conditions = Array.isArray(raw.conditions) && raw.conditions.every((c) => typeof c === 'string')
        ? (raw.conditions as string[])
        : undefined
      return { verdict, summary: summary.slice(0, 400), conditions }
    }
  } catch { /* 落到 null */ }
  return null
}

export async function runLlmExecutor(
  executor: ExecutorSpec,
  input: LlmExecutorInput,
): Promise<Evidence> {
  const startedAt = Date.now()
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-llm`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: 'error',
    execution: 'wired',
    independence: 'spec-derived',
    provenance: { startedAt, commit: input.commit, cwd: input.workspace },
  }
  const finish = (result: Evidence['result'], execution: Evidence['execution'], summary: string): Evidence => {
    ev.result = result
    ev.execution = execution
    ev.summary = summary.slice(0, 400)
    ev.provenance.endedAt = Date.now()
    return ev
  }

  const provider = pickProvider()
  if (!provider?.key) {
    return finish('error', 'wired', 'LLM credentials unavailable (set QGATE_LLM_API_KEY) → INCONCLUSIVE')
  }

  const changed = (input.changedPaths ?? []).slice(0, 30)
  const gateCtx = input.gateSpec
    ? `Gate: ${input.gateSpec.metadata.id}\nDomain: ${input.gateSpec.spec.domain}\nClaims: ${input.gateSpec.spec.claims.join(', ')}\nDescription: ${input.gateSpec.metadata.description ?? '-'}`
    : `Gate: ${input.gateId}`
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a strict delivery-gate reviewer. Judge ONLY against the stated claims. ' +
        'Respond with JSON: {"verdict":"pass|fail|conditional","summary":"≤200 chars evidence","conditions":["…"]}. ' +
        'conditional means: cannot fully prove but no direct counter-evidence; conditions = what must be cleared. ' +
        'When in doubt, say conditional. Never invent files or commands.',
    },
    {
      role: 'user',
      content: `${gateCtx}\nChanged paths (${changed.length}):\n${changed.join('\n') || '(none)'}\n\nJudge now.`,
    },
  ]

  try {
    const res = await fetch(provider.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${provider.key}` },
      body: JSON.stringify({ model: provider.model, messages, temperature: 0 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200)
      return finish('error', 'wired', `LLM http ${res.status}: ${body}`)
    }
    const data = (await res.json()) as Record<string, unknown>
    const text =
      provider.url.includes('anthropic')
        ? String((data as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '')
        : String((data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content ?? '')
    const parsed = parseVerdictJson(text)
    if (!parsed) {
      return finish('error', 'wired', `LLM response unparsable: ${text.slice(0, 160)}`)
    }
    // ── 核心纪律：LLM 判定 pass 时强转 conditional——单独 LLM 判定不构成 PASS（v0.1 §4.3）──
    if (parsed.verdict === 'pass') {
      return finish(
        'conditional',
        'exercised',
        `LLM suggested pass, but LLM-only judgement cannot constitute PASS — treated as conditional: ${parsed.summary}`,
      )
    }
    return finish(parsed.verdict === 'fail' ? 'fail' : 'conditional', 'exercised', `LLM ${parsed.verdict}: ${parsed.summary}`)
  } catch (err) {
    return finish('error', 'wired', `LLM call failed: ${(err as Error).message}`)
  }
}
