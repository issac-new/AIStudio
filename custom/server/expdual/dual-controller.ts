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
import { readDualStore, writeDualStore } from './dual-store'
import type { DualStoreShape, InduceOp, RetireReason } from './dual-types'

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

export { router as expDualRoutes }
