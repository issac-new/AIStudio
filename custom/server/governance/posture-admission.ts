// overlay/governance 域：治理姿态准入判据（四性四格收敛批 C2，2026-11-03）。
//
// 背景：posture.ts 把「实际生效值 vs 期望值」做成了常驻只读端点，能看出 governed/
// partial/bare 三态灯，但**只报不拦**——裸奔姿态可以被看见，却不妨碍任何结论签发。
// 本模块把姿态读数升级为可执行的准入判据：同一份读数，按策略决定放行或拒绝。
//
// 策略三档（env HERMES_POSTURE_POLICY）：
//   report（默认）       始终放行；blockers 恒空，warnings 照报偏差。零行为变化。
//   require-for-gate     bare 姿态 / 治理台账问题 / 配置读错 → 拒（阻断项逐条点名）。
//   strict               在 require-for-gate 基础上，另要求执法总闸与 strict 姿态开启。
//
// 设计约束：
//   - 纯函数：只读传入的 posture 快照，不改环境、不代开开关；解除路径写进 blocker 文本。
//   - 非法策略值不静默降级：policyInvalid=true 显式暴露，便于门禁面发现配置错误。
//   - digest 字段顺序固定在 digestOf() 内，改序即契约变更（spec D5）。

import { createHash } from 'node:crypto'
import type { GovernancePosture } from './posture'

export const POSTURE_POLICY_MODES = ['report', 'require-for-gate', 'strict'] as const
export type PosturePolicyMode = (typeof POSTURE_POLICY_MODES)[number]

export interface PosturePolicy {
  mode: PosturePolicyMode
  /** 原始 env 值（null=未设）；非法值保留原文供审计对账。 */
  raw: string | null
  policyInvalid: boolean
}

export interface PostureAdmission {
  admits: boolean
  mode: PosturePolicyMode
  /** 阻断项（逐条点名，含解除路径）；admits=false 时非空。 */
  blockers: string[]
  /** 不阻断但须呈现的偏差（partial 数量、期望文件缺席、policies 未声明项）。 */
  warnings: string[]
  /** 姿态快照摘要（报告与证据引用用；算法见 digestOf）。 */
  digest: string
  evaluatedAt: number
}

/** 策略解析：缺省 report；非法值回落 report 但标 policyInvalid（不静默）。 */
export function resolvePosturePolicy(env: Record<string, string | undefined> = process.env): PosturePolicy {
  const raw = env.HERMES_POSTURE_POLICY?.trim() || null
  if (!raw) return { mode: 'report', raw: null, policyInvalid: false }
  if ((POSTURE_POLICY_MODES as readonly string[]).includes(raw)) {
    return { mode: raw as PosturePolicyMode, raw, policyInvalid: false }
  }
  return { mode: 'report', raw, policyInvalid: true }
}

/**
 * 姿态摘要（spec D5）：字段顺序写死，只取判据相关面。
 * 不纳入 profiles 全量明细——明细变化（新增 profile）不应让 digest 抖动。
 */
export function digestOf(posture: GovernancePosture): string {
  const payload = {
    // governed 是派生量：新增一个已治理 profile 不改变风险面，故不入摘要。
    partial: posture.summary.partial,
    bare: posture.summary.bare,
    configMissing: posture.summary.configMissing,
    enforceMasterOn: posture.global.enforceMasterOn,
    strictOn: posture.global.strictOn,
    enforceMode: posture.global.enforceMode,
    ledgerProblems: posture.ledger.problems.length,
  }
  return createHash('sha1').update(JSON.stringify(payload)).digest('hex')
}

/**
 * 准入判定（纯函数）。
 * report 档 admits 恒 true；其余档由 blockers 决定。
 */
export function evaluatePostureAdmission(
  posture: GovernancePosture,
  policy: PosturePolicy,
): PostureAdmission {
  const blockers: string[] = []
  const warnings: string[] = []

  // 偏差常报：不管哪档，偏差都要出现在面上（未配置不等于已治理）。
  const partial = posture.profiles.filter((p) => p.lamp === 'partial')
  if (partial.length > 0) {
    warnings.push(
      `${partial.length} 个 profile 姿态为 partial（未声明 approvals.mode 或读不出）：` +
        partial.slice(0, 8).map((p) => p.name).join('、') +
        (partial.length > 8 ? ` 等 ${partial.length} 个` : ''),
    )
  }
  if (!posture.expectations.exists) {
    warnings.push(`期望值文件缺席（${posture.expectations.file}）：偏差面只有实际值，无期望对照`)
  }
  if (posture.expectations.error) {
    warnings.push(`期望值文件解析失败：${posture.expectations.error}`)
  }
  if (policy.policyInvalid) {
    warnings.push(`策略值非法（HERMES_POSTURE_POLICY=${policy.raw}），已回落 report；请修正为 ${POSTURE_POLICY_MODES.join('|')}`)
  }

  if (policy.mode !== 'report') {
    const bare = posture.profiles.filter((p) => p.lamp === 'bare')
    for (const p of bare) {
      blockers.push(
        `profile ${p.name} 为 bare 姿态（approvals.mode=off）：解除=在 ${p.name} 的 config.yaml 显式声明 approvals.mode 为 manual 或 smart`,
      )
    }
    if (posture.ledger.problems.length > 0) {
      blockers.push(
        `治理台账存在 ${posture.ledger.problems.length} 项问题：${posture.ledger.problems.slice(0, 3).join('；')}（解除=修正台账后重跑姿态采集）`,
      )
    }
    for (const p of posture.profiles.filter((x) => x.configError)) {
      blockers.push(`profile ${p.name} 配置读取失败：${p.configError}（解除=修配置文件后重采）`)
    }
  }

  if (policy.mode === 'strict') {
    if (!posture.global.enforceMasterOn) {
      blockers.push('执法总闸未开（HERMES_TOOL_ENFORCE≠1）：解除=启动服务前显式置 1')
    }
    if (!posture.global.strictOn) {
      blockers.push('strict 姿态未开（HERMES_TOOL_ENFORCE_STRICT≠1）：解除=启动服务前显式置 1')
    }
  }

  return {
    admits: blockers.length === 0,
    mode: policy.mode,
    blockers,
    warnings,
    digest: digestOf(posture),
    evaluatedAt: Date.now(),
  }
}
