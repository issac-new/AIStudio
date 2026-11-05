// overlay/custom/server/metricpolicy/controller.ts
// 度量纪律 REST（C 组）。挂载 /api/metricpolicy（补丁 751）。
//
// 判定全在 policy.ts 纯函数；派生全在 derive.ts（只读既有台账，不新增埋点）。
// 响应形状走 lib/http 的 ok/fail/bodyOf（K19 单一写法）。
import Router from '@koa/router'
import { appendGovEvent } from '../govbus/event-log'
import { bodyOf, fail, ok } from '../lib/http'
import { auditRegistry, inspectMetric, namespaceOfKey, validateMetricInput } from './policy'
import {
  autonomyRate, humanMachineRatio, humanMinutesPerTask, interfaceCount, reworkRate, skillUsage,
} from './derive'
import { getMetric, listMetrics, putMetric, removeMetric } from './store'
import type { MetricDef, MetricNamespace } from './types'

export const metricPolicyRoutes = new Router({ prefix: '/api/metricpolicy' })

function actorOf(ctx: { state: unknown }): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

metricPolicyRoutes.get('/metrics', (ctx) => {
  const ns = ctx.query.namespace
  const all = listMetrics()
  const entries = ns === 'measure' || ns === 'settle' ? all.filter((m) => m.namespace === ns) : all
  ok(ctx, { entries })
})

metricPolicyRoutes.get('/metrics/:key', (ctx) => {
  const def = getMetric(ctx.params.key)
  if (!def) {
    fail(ctx, 404, '指标未登记', { code: 'not-found' })
    return
  }
  ok(ctx, { entry: def, issues: inspectMetric(def) })
})

metricPolicyRoutes.put('/metrics/:key', (ctx) => {
  const body = bodyOf(ctx)
  const input = {
    key: ctx.params.key,
    namespace: body.namespace,
    title: body.title,
    definition: body.definition,
    sources: body.sources,
    consumers: body.consumers,
    derivedFrom: body.derivedFrom,
  }
  const problems = validateMetricInput(input)
  if (problems.length) {
    fail(ctx, 400, '指标登记校验未通过', { code: 'invalid-input', problems })
    return
  }
  const prev = getMetric(ctx.params.key)
  const consumers = Array.isArray(body.consumers)
    ? (body.consumers as { decisionRef: string; changedAt?: number; note?: string }[]).map((c) => ({
      decisionRef: c.decisionRef,
      changedAt: typeof c.changedAt === 'number' ? c.changedAt : Date.now(),
      ...(c.note ? { note: c.note } : {}),
    }))
    : (prev?.consumers ?? [])
  const def: MetricDef = {
    key: ctx.params.key,
    namespace: body.namespace as MetricNamespace,
    title: String(body.title).trim(),
    definition: String(body.definition).trim(),
    sources: (body.sources as string[]).map(String),
    consumers,
    ...(Array.isArray(body.derivedFrom) ? { derivedFrom: (body.derivedFrom as string[]).map(String) } : {}),
    version: prev ? prev.version : 1,
    ...(prev?.builtin ? { builtin: true } : {}),
  }
  const issues = inspectMetric(def, prev)
  const errors = issues.filter((i) => i.severity === 'error')
  if (errors.length) {
    fail(ctx, 409, '指标登记被拒', {
      code: 'variant-rejected',
      problems: errors.map((e) => e.detail),
      extra: { issues },
    })
    return
  }
  // 结算指标口径变更须显式升版本（inspectMetric 已判；此处落版本号）
  if (prev && prev.namespace === 'settle' && prev.definition !== def.definition) {
    def.version = prev.version + 1
  }
  const entry = putMetric(def)
  appendGovEvent({
    domain: 'system',
    severity: def.namespace === 'settle' ? 'warn' : 'info',
    type: `metric.registered_${def.namespace}`,
    source: 'metricpolicy/controller',
    summary: `指标登记：${def.key}（${def.namespace}，消费者 ${def.consumers.length} 个）`,
    refs: { metricKey: def.key },
    payload: { namespace: def.namespace, version: def.version },
  })
  ok(ctx, { entry, issues })
})

metricPolicyRoutes.delete('/metrics/:key', (ctx) => {
  if (!removeMetric(ctx.params.key)) {
    fail(ctx, 404, '无存储层登记（内置指标口径不可删除，只能覆盖）', { code: 'not-found' })
    return
  }
  ok(ctx)
})

/** 登记簿体检：错误数 + 装饰数 + 逐条问题。 */
metricPolicyRoutes.get('/audit', (ctx) => {
  const all = listMetrics()
  const previous = new Map(all.map((m) => [m.key, m]))
  ok(ctx, {
    ...auditRegistry(all, previous),
    namespaces: {
      measure: all.filter((m) => m.namespace === 'measure').length,
      settle: all.filter((m) => m.namespace === 'settle').length,
    },
  })
})

/** 四类核心指标派生（含缺口态）。 */
metricPolicyRoutes.get('/core', async (ctx) => {
  const [autonomy, ratio, minutes, rework, skills] = await Promise.all([
    autonomyRate(), humanMachineRatio(), humanMinutesPerTask(), reworkRate(), skillUsage(),
  ])
  ok(ctx, {
    readings: [autonomy, ratio, minutes, rework, interfaceCount()],
    skillUsage: skills,
  })
})

/** 装饰化清单（无消费者决策的指标）。 */
metricPolicyRoutes.get('/decorative', (ctx) => {
  ok(ctx, {
    entries: listMetrics().filter((m) => m.consumers.length === 0).map((m) => ({
      key: m.key,
      title: m.title,
      definition: m.definition,
      namespace: m.namespace,
      // 判据句直接进响应：让读者看到「什么算装饰」，而不是只看到一个红点
      judgement: '过去一个季度，有哪个决策因为这个数字而改变？答不出即装饰',
    })),
  })
})

metricPolicyRoutes.get('/skill-usage', async (ctx) => {
  ok(ctx, { ...(await skillUsage()) })
})

metricPolicyRoutes.get('/interface-count', (ctx) => {
  ok(ctx, { reading: interfaceCount() })
})

/** key 前缀与命名空间一致性自检（供前端做即时校验，不必等提交）。 */
metricPolicyRoutes.post('/key-check', (ctx) => {
  const body = bodyOf(ctx)
  const parsed = namespaceOfKey(String(body.key ?? ''))
  ok(ctx, { parsed, consistent: parsed !== null && parsed === body.namespace })
})
