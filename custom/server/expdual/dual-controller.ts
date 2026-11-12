// overlay[expdual] 双轨经验台账 REST（/api/expdual/*）。
//
// 写路径一律「读 → 纯函数演进 → 落盘」，拒绝项带原因返回（不静默降级为通过）。
// 读路径只读，直接返回当前库与退役池/归因/批次快照。
import Router from '@koa/router'
import { bodyOf, fail, ok } from '../lib/http'
import {
  commitSynthesis,
  detectContradictions,
  previewClassification,
  recordBlame,
  retireRule,
  applyInduce,
  closeChunk,
  dismissSynthesis,
} from './dual-lifecycle'
import { buildBlamePrompt, buildInducePrompt, buildSynthesisPrompt, type TraceSample } from './dual-prompts'
import { readDualStore, writeDualStore } from './dual-store'
import type { DualStoreShape, InduceOp, RetireReason } from './dual-types'
import { listPremises } from '../premiselog/store'
import { bigramSimilarity } from '../eval/vectorizer'

const router = new Router({ prefix: '/api/expdual' })

function statusFor(message: string): number {
  return /不存在/.test(message) ? 404 : 400
}

function reject(ctx: Parameters<typeof fail>[0], message: string, code: string): void {
  fail(ctx, statusFor(message), message, { code, problems: [message] })
}

/** 批次号：显式给出优先，否则用台账当前批次（不猜调用方意图）。 */
function chunkOf(body: Record<string, unknown>, store: DualStoreShape): number {
  const n = Number(body.chunk)
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : store.chunk
}

router.get('/banks', async (ctx) => {
  const store = readDualStore()
  ok(ctx, {
    chunk: store.chunk,
    facts: store.rules.filter((r) => r.channel === 'fact'),
    tips: store.rules.filter((r) => r.channel === 'tip'),
    retired: store.retired,
    removed: store.removed,
    counts: {
      facts: store.rules.filter((r) => r.channel === 'fact').length,
      tips: store.rules.filter((r) => r.channel === 'tip').length,
      retired: store.retired.length,
      removed: store.removed.length,
    },
  })
})

router.get('/retired', async (ctx) => {
  ok(ctx, { items: readDualStore().retired })
})

router.get('/blames', async (ctx) => {
  ok(ctx, { items: readDualStore().blames })
})

router.get('/snapshots', async (ctx) => {
  ok(ctx, { items: readDualStore().snapshots })
})

router.get('/synthesis', async (ctx) => {
  ok(ctx, { items: readDualStore().synthesis })
})

router.post('/classify', async (ctx) => {
  const body = bodyOf(ctx)
  const text = String(body.text ?? '').trim()
  if (!text) {
    reject(ctx, 'text 不能为空', 'empty_text')
    return
  }
  ok(ctx, { classification: previewClassification(text) })
})

router.post('/induce', async (ctx) => {
  const body = bodyOf(ctx)
  const ops = body.ops
  if (!Array.isArray(ops) || ops.length === 0) {
    reject(ctx, 'ops 须为非空数组', 'bad_ops')
    return
  }
  const store = readDualStore()
  const result = applyInduce(store, ops as InduceOp[], chunkOf(body, store))
  if (result.applied.length > 0) writeDualStore(result.store)
  if (result.rejected.length > 0) {
    fail(ctx, 400, '部分归纳操作未通过校验', {
      code: 'ops_rejected',
      problems: result.rejected.map((r) => `#${r.index}: ${r.reason}`),
      extra: { applied: result.applied },
    })
    return
  }
  ok(ctx, { applied: result.applied, chunk: result.store.chunk })
})

router.post('/blame', async (ctx) => {
  const body = bodyOf(ctx)
  const store = readDualStore()
  const result = recordBlame(store, {
    chunk: chunkOf(body, store),
    taskRef: String(body.taskRef ?? '').trim(),
    step: String(body.step ?? '').trim(),
    ruleId: String(body.ruleId ?? '').trim(),
    note: String(body.note ?? '').trim(),
  })
  if (result.rejected) {
    reject(ctx, result.rejected, 'blame_rejected')
    return
  }
  writeDualStore(result.store)
  ok(ctx, { retired: result.retired ?? null })
})

router.post('/retire', async (ctx) => {
  const body = bodyOf(ctx)
  const reason = String(body.reason ?? 'manual') as RetireReason
  if (!['blame', 'contradiction', 'manual', 'budget'].includes(reason)) {
    reject(ctx, 'reason 须为 blame/contradiction/manual/budget', 'bad_reason')
    return
  }
  const store = readDualStore()
  const result = retireRule(store, String(body.ruleId ?? '').trim(), {
    reason,
    chunk: chunkOf(body, store),
    note: body.note ? String(body.note) : undefined,
  })
  if (result.rejected) {
    reject(ctx, result.rejected, 'retire_rejected')
    return
  }
  writeDualStore(result.store)
  ok(ctx, { retired: result.retired })
})

router.post('/synthesize/detect', async (ctx) => {
  const store = readDualStore()
  const result = detectContradictions(store)
  if (result.candidates.length > 0) writeDualStore(result.store)
  ok(ctx, { candidates: result.candidates, open: result.store.synthesis.filter((c) => c.status === 'open') })
})

router.post('/synthesize/commit', async (ctx) => {
  const body = bodyOf(ctx)
  const store = readDualStore()
  const result = commitSynthesis(store, {
    candidateId: String(body.candidateId ?? '').trim(),
    condition: String(body.condition ?? '').trim(),
    action: String(body.action ?? '').trim(),
    chunk: chunkOf(body, store),
    note: body.note ? String(body.note) : undefined,
  })
  if (result.rejected) {
    reject(ctx, result.rejected, 'synthesis_rejected')
    return
  }
  writeDualStore(result.store)
  ok(ctx, { tipId: result.tipId })
})

router.post('/synthesize/dismiss', async (ctx) => {
  const body = bodyOf(ctx)
  const store = readDualStore()
  const result = dismissSynthesis(store, String(body.candidateId ?? '').trim(), String(body.note ?? ''))
  if (result.rejected) {
    reject(ctx, result.rejected, 'synthesis_rejected')
    return
  }
  writeDualStore(result.store)
  ok(ctx, { dismissed: String(body.candidateId ?? '').trim() })
})

router.post('/chunk/close', async (ctx) => {
  const store = readDualStore()
  const result = closeChunk(store)
  writeDualStore(result.store)
  ok(ctx, { snapshot: result.snapshot, chunk: result.store.chunk })
})

// ── 提示词契约（收尾批：dual-prompts 接 HTTP，调用方不必 import 模块）──────────
// 纯读面：从当前台账渲染 prompt bundle 返回，不落盘不执行；轨迹语料由调用方给。

router.post('/prompts/:kind', async (ctx) => {
  const body = bodyOf(ctx)
  const kind = String(ctx.params.kind ?? '')
  const store = readDualStore()
  const rulesOf = (channel: 'fact' | 'tip'): string[] =>
    store.rules.filter((r) => r.channel === channel && r.status === 'active').map((r) => `${r.id}. ${r.text}`)
  if (kind === 'blame') {
    const taskRef = String(body.taskRef ?? '').trim()
    const trajectory = String(body.trajectory ?? '').trim()
    if (!taskRef || !trajectory) {
      reject(ctx, 'blame 提示词需要 taskRef 与 trajectory（失败轨迹正文）', 'bad_prompt_input')
      return
    }
    ok(ctx, { kind, prompt: buildBlamePrompt({ taskRef, trajectory, rules: [...rulesOf('fact'), ...rulesOf('tip')] }) })
    return
  }
  if (kind === 'induce') {
    const samples = (rows: unknown, outcome: 'success' | 'failure'): TraceSample[] =>
      (Array.isArray(rows) ? rows : [])
        .map((row) => {
          const r = row as { taskRef?: unknown; text?: unknown }
          return { taskRef: String(r?.taskRef ?? '').trim(), outcome, text: String(r?.text ?? '').trim() }
        })
        .filter((s) => s.taskRef && s.text)
    ok(ctx, {
      kind,
      prompt: buildInducePrompt({
        success: samples(body.success, 'success'),
        failure: samples(body.failure, 'failure'),
        facts: rulesOf('fact'),
        tips: rulesOf('tip'),
      }),
    })
    return
  }
  if (kind === 'synthesize') {
    const retired = store.retired.map((r) => `${r.id}. ${r.text}`)
    ok(ctx, { kind, prompt: buildSynthesisPrompt({ retired }) })
    return
  }
  reject(ctx, 'kind 须为 blame/induce/synthesize', 'bad_kind')
})

// ── premiselog ↔ FACT 复核信号（收尾批：假设层推翻 → 经验层复核建议，只读）──────
// 纪律：不自动退役（spec D3）——一个域的判定不得静默放大成另一域的变更；
// 信号只做「该 FACT 建议人工复核」的证据，退役仍走 /retire 显式提交。

/** 信号阈值：bigram 余弦 ≥ 0.35 视为同一主题（低阈值宁多报，复核是人判）。 */
export const PREMISE_SIGNAL_THRESHOLD = 0.35

router.get('/premise-signals', async (ctx) => {
  const store = readDualStore()
  const facts = store.rules.filter((r) => r.channel === 'fact' && r.status === 'active')
  let premises
  try {
    premises = listPremises().filter((p) => p.status === 'refuted' || p.status === 'expired')
  } catch (e) {
    ok(ctx, { available: false, note: `假设登记簿读取失败：${String((e as Error).message || e)}`, signals: [] })
    return
  }
  // strictNullChecks 下 `= []` 不再走 any 演化推断，显式注解投影行形状
  const signals: {
    premiseId: string
    premiseStatus: string
    statement: string
    refutedBy: string | null
    ruleId: string
    ruleText: string
    score: number
  }[] = []
  for (const premise of premises) {
    for (const rule of facts) {
      const score = bigramSimilarity(premise.statement, rule.text)
      if (score >= PREMISE_SIGNAL_THRESHOLD) {
        signals.push({
          premiseId: premise.id,
          premiseStatus: premise.status,
          statement: premise.statement,
          refutedBy: premise.refutedBy?.evidence ?? null,
          ruleId: rule.id,
          ruleText: rule.text,
          score: Number(score.toFixed(4)),
        })
      }
    }
  }
  signals.sort((a, b) => b.score - a.score)
  ok(ctx, {
    available: true,
    threshold: PREMISE_SIGNAL_THRESHOLD,
    checkedPremises: premises.length,
    checkedFacts: facts.length,
    signals,
  })
})

export { router as expDualRoutes }
