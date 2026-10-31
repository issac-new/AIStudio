// custom/server/orchestrator/policy-version.ts
// 四类授权策略的单调版本（2026-10-31 A+B 批 spec D8/D10）。
// 只有「授权的直接依据」需要版本化：审批规则、工具策略、按源准入、主动性策略。
// qgate 门的版本化已存在于 .qgate，不在此重复。
// 语义：变更方调用 bumpPolicyVersion；既有凭证在下次校验时用 currentPolicyVersion 比对，
// 默认只告警（spec D10），严格模式下由 caller 拒绝。
import { kvGet, kvSet } from './store'
import { POLICY_KINDS, type PolicyKind } from './types'

const keyOf = (kind: PolicyKind): string => `policy-version:${kind}`

/** 当前版本；从未 bump 过为 0（与旧 grant 缺省值一致，保证兼容）。 */
export function currentPolicyVersion(kind: PolicyKind, env: NodeJS.ProcessEnv = process.env): number {
  const key = keyOf(kind)
  // 允许部署侧显式钉版本（多进程场景下避免读到尚未同步的本地值）。
  const pinned = (env[`ORCHESTRATOR_POLICY_${kind.replace(/-/g, '_').toUpperCase()}_VERSION`] ?? '').trim()
  if (pinned) {
    const n = Number(pinned)
    if (Number.isFinite(n) && n >= 0) return Math.floor(n)
  }
  const raw = kvGet(key)
  const n = raw === null ? 0 : Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/** 单调递增；返回新版本。 */
export function bumpPolicyVersion(kind: PolicyKind, changedBy: string, at = Date.now()): number {
  const next = currentPolicyVersion(kind) + 1
  kvSet(keyOf(kind), String(next), at)
  kvSet(`policy-version:${kind}:last-changed-by`, changedBy, at)
  return next
}

/** 版本比较的单一判定：缺省视为 0；严格模式下不匹配即拒绝。 */
export function policyVersionCheck(
  kind: PolicyKind,
  recorded: number | undefined | null,
  opts: { strict?: boolean; env?: NodeJS.ProcessEnv } = {},
): { ok: boolean; recorded: number; current: number; strict: boolean } {
  const env = opts.env ?? process.env
  const strict = opts.strict ?? (env.ORCHESTRATOR_STRICT_POLICY ?? '').trim() === '1'
  const current = currentPolicyVersion(kind, env)
  const value = typeof recorded === 'number' && Number.isFinite(recorded) && recorded >= 0 ? Math.floor(recorded) : 0
  // 版本只增不减：记录值小于当前=策略已升级，默认放行并告警，严格模式拒绝。
  return { ok: !strict || value >= current, recorded: value, current, strict }
}

export function isPolicyKind(value: string): value is PolicyKind {
  return (POLICY_KINDS as readonly string[]).includes(value)
}
