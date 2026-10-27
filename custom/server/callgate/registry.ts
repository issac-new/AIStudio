// overlay callgate 进程内单例（wx 挂账 #14 接线批，2026-10-27）。
//
// 执法钩子（toolpipeline 钩子链）与 harness 观测/规则写面共享同一注册表——
// GET /callgate 看到的就是执法面真实流量，不是第二本账。
import type { CallgateRule, ResourceKind } from './callgate'
import { CallgateRegistry } from './callgate'

export const overlayCallgate = new CallgateRegistry()

const KINDS: readonly ResourceKind[] = ['llm', 'mcp', 'tool']

/**
 * REST 规则体校验（POST /callgate/rule）：字段齐全、类型正确、数值为正才放行；
 * 非法输入返回 problems（不猜默认值——规则是执法参数，错配即误拦）。
 */
export function parseCallgateRule(body: unknown): { ok: true; rule: CallgateRule } | { ok: false; problems: string[] } {
  const problems: string[] = []
  const b = (body ?? {}) as Record<string, unknown>
  const resource = (b.resource ?? {}) as Record<string, unknown>
  const quota = (b.quota ?? {}) as Record<string, unknown>
  const breaker = (b.breaker ?? {}) as Record<string, unknown>
  const kind = resource.kind
  const key = typeof resource.key === 'string' ? resource.key.trim() : ''
  if (typeof kind !== 'string' || !KINDS.includes(kind as ResourceKind)) problems.push(`resource.kind 须为 ${KINDS.join('|')} 之一`)
  if (!key) problems.push('resource.key 不得为空')
  const positive = (v: unknown, name: string): number | null => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) {
      problems.push(`${name} 须为正整数`)
      return null
    }
    return v
  }
  const maxConcurrent = positive(quota.maxConcurrent, 'quota.maxConcurrent')
  const maxPerMinute = positive(quota.maxPerMinute, 'quota.maxPerMinute')
  const failureThreshold = positive(breaker.failureThreshold, 'breaker.failureThreshold')
  const windowMs = positive(breaker.windowMs, 'breaker.windowMs')
  const openMs = positive(breaker.openMs, 'breaker.openMs')
  const halfOpenProbes = breaker.halfOpenProbes === undefined ? 1 : positive(breaker.halfOpenProbes, 'breaker.halfOpenProbes')
  if (problems.length) return { ok: false, problems }
  return {
    ok: true,
    rule: {
      resource: { kind: kind as ResourceKind, key },
      quota: { maxConcurrent: maxConcurrent!, maxPerMinute: maxPerMinute! },
      breaker: { failureThreshold: failureThreshold!, windowMs: windowMs!, openMs: openMs!, halfOpenProbes: halfOpenProbes ?? 1 },
    },
  }
}
