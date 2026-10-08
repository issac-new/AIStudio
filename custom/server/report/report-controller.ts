// overlay/custom/server/report/report-controller.ts
// 报告链 REST（2026-10-08 建设实施落地轮，方案 §5.4 形式契约/§4.4-10）：
// 报告链能力正本在产品侧（本目录），推演 harness（simharness）为兼容消费壳。
// 两个入口：
//   POST /api/hermes/report/part1-skeleton —— PART1 五段式骨架出稿（RunFacts 实算数字入参）
//   POST /api/hermes/report/acceptance    —— 报告验收断言（六闸工件/承载率/QGate 纪律）
// 输入校验从严：字段缺失/类型不对 400 并指名字段，不静默兜底。
import Router from '@koa/router'
import { part1Skeleton, type RunFacts } from './part1-skeleton'
import {
  MIN_ARTIFACT_VIEWS,
  checkFaceRateLine,
  checkGateArtifacts,
  checkQgateDiscipline,
  countArtifactViews,
  type StepBlock,
} from './acceptance'

export const reportRoutes = new Router({ prefix: '/api/hermes/report' })

const RUNFACTS_REQUIRED = [
  'runId', 'rfd', 'windowText', 'featureFlags', 'stepsDone', 'gatesPassed',
  'firstPass', 'issuesTotal', 'disp', 'typeTop',
] as const

reportRoutes.post('/part1-skeleton', (ctx) => {
  const b = ctx.request.body as Record<string, unknown> | undefined
  const missing = RUNFACTS_REQUIRED.filter((k) => b?.[k] === undefined || b?.[k] === null)
  if (missing.length > 0 || typeof b !== 'object') {
    ctx.status = 400
    ctx.body = { ok: false, detail: `RunFacts 缺字段：${missing.join('/') || '(body 空)'}` }
    return
  }
  // 索引面按 Record 收窄（ts-node 严格模式 TS7053：string 不能索引字面量键类型）——
  // 语义不变：仍是"disp 须为三数字"校验
  const disp = (b as unknown as RunFacts).disp as unknown as Record<string, unknown> | undefined
  if (typeof disp !== 'object' || ['已修', '观察', '延后'].some((k) => typeof disp?.[k] !== 'number')) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'disp 须为 { 已修, 观察, 延后 } 三数字' }
    return
  }
  ctx.body = { ok: true, html: part1Skeleton(b as unknown as RunFacts) }
})

reportRoutes.post('/acceptance', (ctx) => {
  const b = ctx.request.body as { steps?: unknown; html?: unknown } | undefined
  if (typeof b?.html !== 'string' || !Array.isArray(b?.steps)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: '须为 { steps: StepBlock[], html: string }' }
    return
  }
  const steps = (b.steps as Array<Record<string, unknown>>).map((s, i) => {
    if (typeof s.n !== 'number' || typeof s.html !== 'string') {
      throw new Error(`steps[${i}] 须为 { n: number, html: string }`)
    }
    return s as unknown as StepBlock
  })
  const gate = checkGateArtifacts(steps)
  const face = checkFaceRateLine(b.html)
  const qgate = checkQgateDiscipline(b.html)
  const views = countArtifactViews(b.html)
  ctx.body = {
    ok: gate.ok && face.ok && qgate.ok,
    gateArtifacts: gate,
    artifactViews: { n: views, min: MIN_ARTIFACT_VIEWS, belowMin: views < MIN_ARTIFACT_VIEWS },
    faceRate: face,
    qgate,
  }
})
