// overlay/executioncontract：earned autonomy 档位建议器（2026-11-14 Proactive AI 二轮 P4）。
//
// 范式来源：论文 §4.6.3——「自主应当是分级且以证据索引的，随绩效历史累积而调整」；
// §7.1.2「逐渐挣得、失去或重新协商其主动性」。数据源＝approval-ledger（三态决议账，
// 只记不裁）——track record 按 profile 聚合决议分布。
// 口径（按账本真实 schema：recordType=pending/resolved/exempted，decidedBy=user|policy:*）：
//   - userResolvedShare＝人介入率（decidedBy=user / 全部 resolved）——高＝当前挡位超出实际可靠性
//   - pendingShare＝悬而未决占比——高＝挡位产生的审批积压
//   - resolvedAutoShare＝策略自动放行占比——高且人介入近零＝已证明可靠
// 纪律（spec D7/D8）：默认只建议不动档（收紧自动写档挂账——四挡→PermissionMode 反向
// 映射缺失，不自造第三套词表映射）；冷启动 <20 不出建议；只消费决议统计不消费文本反馈（防谄媚）。
import Router from '@koa/router'
import { ok, fail as httpFail } from '../lib/http'
import { MODE_IDS, type ModeId } from './index'
import { readApprovalLedger, type ApprovalLedgerRecord } from '../approval-ledger/ledger-store'

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
