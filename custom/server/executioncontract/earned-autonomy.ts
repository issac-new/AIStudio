// overlay/executioncontract：earned autonomy 档位建议器（2026-11-14 Proactive AI 二轮 P4）。
//
// 范式来源：论文 §4.6.3——「自主应当是分级且以证据索引的，随绩效历史累积而调整」；
// §7.1.2「逐渐挣得、失去或重新协商其主动性」。数据源＝approval-ledger（三态决议账，
// 只记不裁）——track record 按 profile 聚合决议分布。
// 口径（按账本真实 schema：recordType=pending/resolved/exempted，decidedBy=user|policy:*）：
//   - userResolvedShare＝人介入率（decidedBy=user / 全部 resolved）——高＝当前挡位超出实际可靠性
//   - pendingShare＝悬而未决占比——高＝挡位产生的审批积压
//   - resolvedAutoShare＝策略自动放行占比——高且人介入近零＝已证明可靠
// 纪律（spec D7/D8）：默认只建议不动档；冷启动 <20 不出建议；只消费决议统计不消费文本反馈（防谄媚）。
// 收紧自动写档（2026-11-15 清偿挂账）：`EARNED_AUTONOMY_AUTO_TIGHTEN=1` 时把 tighten 建议
// 落到会话权限档（session-mode-store）；**永不自动放宽**。四挡→七档的唯一映射声明在本文件
// `MODE_TO_PERMISSION`（单点事实源，测试锁表；此前挂账理由「映射缺失」由此解除）。
import Router from '@koa/router'
import { ok, fail as httpFail } from '../lib/http'
import { MODE_IDS, type ModeId } from './index'
import { readApprovalLedger, type ApprovalLedgerRecord } from '../approval-ledger/ledger-store'
import { sessionModeOf, setSessionMode } from '../permmodes/session-mode-store'
import type { PermissionMode } from '../permmodes/permission-modes'

/** 收紧方向序（索引大=权限宽；tighten=向索引小走一步）。 */
export const TIGHTEN_ORDER: readonly ModeId[] = ['plan', 'build', 'guarded', 'yolo']

export interface TrackRecord {
  profile: string
  sampleSize: number
  resolvedTotal: number
  userResolved: number
  policyResolved: number
  pending: number
  exempted: number
  /** 人介入率（resolved 中 decidedBy=user 占比；resolved=0 时=0）。 */
  userResolvedShare: number
  /** 悬而未决占比（pending / 全部记录）。 */
  pendingShare: number
  /** 策略自动放行占比（policy:* / 全部记录）。 */
  autoShare: number
}

export interface ModeRecommendation {
  direction: 'tighten' | 'loosen' | 'hold'
  target: ModeId
  evidence: string
}

/** 冷启动阈值（spec D8：小样本建议=噪声放大）。 */
export const COLD_START_MIN = 20
/** 放宽的样本门槛（论文：在大规模运行记录上证明可靠性后才扩大授权）。 */
export const LOOSEN_MIN_SAMPLE = 50
/** 收紧触发：人介入率高于此（当前挡位超出实际可靠性）。 */
export const TIGHTEN_USER_SHARE = 0.3

/** 聚合（纯函数；records 注入可测，生产由调用方读账本）。 */
export function aggregateTrackRecord(profile: string, records: ApprovalLedgerRecord[]): TrackRecord {
  const rows = records.filter((r) => r.profile === profile)
  const sampleSize = rows.length
  const pending = rows.filter((r) => r.recordType === 'approval.pending').length
  const resolvedRows = rows.filter((r) => r.recordType === 'approval.resolved')
  const userResolved = resolvedRows.filter((r) => r.decidedBy === 'user').length
  const policyResolved = resolvedRows.length - userResolved
  const exempted = rows.filter((r) => r.recordType === 'approval.exempted').length
  return {
    profile, sampleSize,
    resolvedTotal: resolvedRows.length, userResolved, policyResolved, pending, exempted,
    userResolvedShare: resolvedRows.length === 0 ? 0 : userResolved / resolvedRows.length,
    pendingShare: sampleSize === 0 ? 0 : pending / sampleSize,
    autoShare: sampleSize === 0 ? 0 : (policyResolved + exempted) / sampleSize,
  }
}

/** 建议（纯函数）：冷启动 hold；高人介入/高积压收紧；大样本近零介入放宽。 */
export function recommendMode(current: ModeId, record: TrackRecord): ModeRecommendation {
  const idx = TIGHTEN_ORDER.indexOf(current)
  const hold: ModeRecommendation = { direction: 'hold', target: current, evidence: '维持现状' }
  if (idx < 0) return hold
  if (record.sampleSize < COLD_START_MIN) {
    return { direction: 'hold', target: current, evidence: `冷启动（样本 ${record.sampleSize}<${COLD_START_MIN}，统计上不构成建议依据）` }
  }
  if (record.userResolvedShare > TIGHTEN_USER_SHARE) {
    const target = TIGHTEN_ORDER[Math.max(0, idx - 1)]!
    return {
      direction: 'tighten', target,
      evidence: `人介入率 ${(record.userResolvedShare * 100).toFixed(0)}%>${TIGHTEN_USER_SHARE * 100}%（${record.userResolved}/${record.resolvedTotal}）——当前挡位超出已证明的可靠性`,
    }
  }
  if (record.pendingShare > 0.5 && record.pending > 10) {
    const target = TIGHTEN_ORDER[Math.max(0, idx - 1)]!
    return { direction: 'tighten', target, evidence: `悬而未决 ${record.pending} 条（占 ${Math.round(record.pendingShare * 100)}%）——审批积压超出人处理容量` }
  }
  if (record.sampleSize >= LOOSEN_MIN_SAMPLE && record.userResolved === 0 && record.autoShare > 0.9) {
    const target = TIGHTEN_ORDER[Math.min(TIGHTEN_ORDER.length - 1, idx + 1)]!
    return {
      direction: 'loosen', target,
      evidence: `${record.sampleSize} 样本人介入 0、自动放行 ${Math.round(record.autoShare * 100)}%——可靠性已证明（放宽须人确认，不自动执行）`,
    }
  }
  return hold
}

/** 生产读数：读账本（fail-soft：账本缺席＝空记录→冷启动 hold，不猜数）。 */
export function trackRecordOf(profile: string): TrackRecord {
  return aggregateTrackRecord(profile, safeReadLedger())
}

function safeReadLedger(): ApprovalLedgerRecord[] {
  try { return readApprovalLedger(2000) } catch { return [] }
}

// ── 四挡 → 七档权限模式（唯一映射；写档需要它，挂账理由由此解除） ────
//
// 对齐逻辑：plan 只读；build 写/执行需审批（default）；guarded 自动改文件、执行仍审批
// （acceptEdits）；yolo 全放行（bypassPermissions）。映射按「权限强度单调」排，测试锁表——
// 任何新增挡位/权限档都必须同时改这里与测试，否则守门当场红。

export const MODE_TO_PERMISSION: Readonly<Record<ModeId, PermissionMode>> = {
  plan: 'plan',
  build: 'default',
  guarded: 'acceptEdits',
  yolo: 'bypassPermissions',
}

export function permissionModeFor(mode: ModeId): PermissionMode {
  return MODE_TO_PERMISSION[mode]
}

export interface ApplyResult {
  applied: boolean
  profile: string
  /** 建议方向（hold/loosen 一律不写档）。 */
  direction: ModeRecommendation['direction']
  target: ModeId
  previous: PermissionMode | null
  /** 写入后的会话档（未写=undefined）。 */
  next?: PermissionMode
  reason: string
}

/**
 * 收紧执行器（唯一写口）：
 *   · `EARNED_AUTONOMY_AUTO_TIGHTEN !== '1'` → 不写（默认 off，存量行为不变）；
 *   · direction 非 tighten → 不写（放宽永远须人确认，防把权限升级交给被评估者）；
 *   · 写会话档（per-profile），返回原档供回滚；写失败如实抛错由调用方转 5xx。
 * 只收紧不放宽的纪律与 enforcement-policy 先例一致。
 */
export function applyTighten(
  profile: string,
  recommendation: ModeRecommendation,
  deps: { autoTightenEnabled?: boolean } = {},
): ApplyResult {
  const enabled = deps.autoTightenEnabled ?? process.env.EARNED_AUTONOMY_AUTO_TIGHTEN === '1'
  const previous = (() => {
    try { return sessionModeOf(profile) } catch { return null }
  })()
  const base: ApplyResult = {
    applied: false, profile, direction: recommendation.direction, target: recommendation.target, previous,
    reason: '',
  }
  if (recommendation.direction !== 'tighten') {
    return { ...base, reason: `方向 ${recommendation.direction} 不写档：放宽/维持须人确认（只收紧不放宽）` }
  }
  if (!enabled) {
    return { ...base, reason: '自动收紧未启用（EARNED_AUTONOMY_AUTO_TIGHTEN!=1）——建议照常呈现，档位不动' }
  }
  const next = permissionModeFor(recommendation.target)
  setSessionMode(profile, next)
  return { ...base, applied: true, next, reason: `已收紧：${recommendation.target} → 会话权限档 ${next}（原档 ${previous ?? '未配置'}）` }
}

// ── REST（GET 单端点；呈现建议不写任何状态） ────

export const earnedAutonomyRouter = new Router({ prefix: '/api/hermes/execution/earned-autonomy' })

earnedAutonomyRouter.get('/', (ctx) => {
  const profile = typeof ctx.query.profile === 'string' && ctx.query.profile.trim() ? ctx.query.profile.trim() : ''
  if (!profile) { httpFail(ctx, 400, 'profile 必填（按 profile 聚合 track record）', { code: 'invalid_profile' }); return }
  const modeRaw = typeof ctx.query.mode === 'string' ? ctx.query.mode : ''
  const current: ModeId = (MODE_IDS as readonly string[]).includes(modeRaw) ? modeRaw as ModeId : 'build'
  const record = trackRecordOf(profile)
  const recommendation = recommendMode(current, record)
  ok(ctx, {
    profile,
    currentMode: current,
    trackRecord: record,
    recommendation,
    // 执行语义声明（诚实边界）：本端点只建议；收紧自动写档与放宽审批不在本面（挂账，见 spec 决策记录）。
    enforcement: 'advisory-only',
    thresholds: { coldStartMin: COLD_START_MIN, loosenMinSample: LOOSEN_MIN_SAMPLE, tightenUserShare: TIGHTEN_USER_SHARE },
  })
})

/** 收紧执行口（POST）：仅在 tighten 且 env 开启时写会话档；放宽永远拒绝（409）。 */
earnedAutonomyRouter.post('/apply', (ctx) => {
  const body = ((ctx.request as { body?: unknown }).body ?? {}) as Record<string, unknown>
  const profile = String(body.profile ?? '').trim()
  if (!profile) { httpFail(ctx, 400, 'profile 必填', { code: 'invalid_profile' }); return }
  const modeRaw = String(body.mode ?? '')
  const current: ModeId = (MODE_IDS as readonly string[]).includes(modeRaw) ? modeRaw as ModeId : 'build'
  const record = trackRecordOf(profile)
  const recommendation = recommendMode(current, record)
  if (recommendation.direction !== 'tighten') {
    httpFail(ctx, 409, recommendation.direction === 'loosen'
      ? '建议方向为放宽：放宽永远须人确认，本口不写档'
      : '当前建议为维持：无可收紧动作', { code: 'no_tighten' })
    return
  }
  const result = applyTighten(profile, recommendation)
  if (!result.applied) {
    httpFail(ctx, 409, result.reason, { code: 'auto_tighten_disabled' })
    return
  }
  ok(ctx, result as unknown as Record<string, unknown>)
})
