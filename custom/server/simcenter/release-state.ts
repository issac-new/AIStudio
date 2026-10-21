/**
 * overlay/custom/server/simcenter/release-state.ts
 * G5 发布门最小状态机（spec 2026-10-21-g5-uat-state-machine §1）：
 * 纯函数派生，不造通用工作流引擎。状态图：
 *
 *   draft --submit--> pending --approve--> approved --release--> released
 *     |                  |
 *     +------reject------+--> rejected（终态；重新提交需新 run，不做回流）
 *     +------approve-----+（兼容旧台账：无 submit 直接批准）
 *
 * 存储沿用 evidence/release-gate.jsonl append-only：旧记录只有 decision
 * （approve/reject），新记录写 action（submit/approve/reject/release）+ decision
 * （approve/reject 时附带，保持旧读面兼容）。读模型按事件顺序派生当前状态与历史，
 * 旧台账的 approve/reject 改判按旧语义覆盖（不因新矩阵把历史读成 draft）。
 */

export type ReleaseState = 'draft' | 'pending' | 'approved' | 'rejected' | 'released'
export type ReleaseAction = 'submit' | 'approve' | 'reject' | 'release'
export type ReleaseDecision = 'approve' | 'reject'

/** 台账记录：旧台账只有 decision；新台账 action 必填，decision 兼容旧读面。 */
export interface ReleaseGateRecord {
  ts: string
  actor: string
  run: string
  action?: ReleaseAction
  decision?: ReleaseDecision
  note?: string
  /** 证据锚（批准必填）：UAT 台账/门记录/commit 任一，形如 evidence/uat-verdicts.jsonl#AC-1 */
  anchor?: string
}

export interface ReleaseHistoryEntry extends ReleaseGateRecord {
  action: ReleaseAction
  stateAfter: ReleaseState
  /** 旧台账记录（无 action 字段），按旧语义应用 */
  legacy?: boolean
  /** 新记录出现非法序列（只可能来自手工改台账），读面忽略该事件 */
  ignored?: boolean
}

export interface ReleaseDerived {
  state: ReleaseState
  latest: ReleaseGateRecord | null
  latestDecision: ReleaseGateRecord | null
  history: ReleaseHistoryEntry[]
}

export const RELEASE_ACTIONS: readonly ReleaseAction[] = ['submit', 'approve', 'reject', 'release']

/** 每状态允许的“会改变状态”的动作（幂等同态动作单列，见 isReleaseActionIdempotent）。 */
export const RELEASE_ALLOWED: Record<ReleaseState, ReleaseAction[]> = {
  draft: ['submit', 'approve', 'reject'],
  pending: ['approve', 'reject'],
  approved: ['release'],
  rejected: [],
  released: [],
}

export const RELEASE_STATE_LABEL: Record<ReleaseState, string> = {
  draft: '草稿', pending: '待审批', approved: '已批准', rejected: '已驳回', released: '已发布',
}

export const RELEASE_ACTION_LABEL: Record<ReleaseAction, string> = {
  submit: '提交审批', approve: '批准', reject: '驳回', release: '发布',
}

/** 记录动作归一（纯函数）：新记录优先 action；旧记录回落 decision。 */
export function actionOfRecord(record: Pick<ReleaseGateRecord, 'action' | 'decision'>): ReleaseAction | null {
  if (record.action && (RELEASE_ACTIONS as readonly string[]).includes(record.action)) return record.action
  if (record.decision === 'approve' || record.decision === 'reject') return record.decision
  return null
}

/**
 * 动作应用（纯函数）：合法迁移返回新状态；同态幂等返回当前状态；非法返回 null。
 * draft/pending 均可直接 approve/reject（旧台账无 submit，兼容直接批准）。
 */
export function applyReleaseAction(state: ReleaseState, action: ReleaseAction): ReleaseState | null {
  switch (action) {
    case 'submit':
      if (state === 'draft') return 'pending'
      return state === 'pending' ? 'pending' : null
    case 'approve':
      if (state === 'draft' || state === 'pending') return 'approved'
      return state === 'approved' ? 'approved' : null
    case 'reject':
      if (state === 'draft' || state === 'pending') return 'rejected'
      return state === 'rejected' ? 'rejected' : null
    case 'release':
      if (state === 'approved') return 'released'
      return state === 'released' ? 'released' : null
    default:
      return null
  }
}

/** 同态幂等判定：动作合法但状态不变（重复提交/重复批准/重复驳回/重复发布）。 */
export function isReleaseActionIdempotent(state: ReleaseState, action: ReleaseAction): boolean {
  const next = applyReleaseAction(state, action)
  return next !== null && next === state
}

/** 事件流 → 当前状态+历史（纯函数）。坏事件（未知动作/非法新序列）跳过并标记。 */
export function deriveReleaseState(records: ReleaseGateRecord[]): ReleaseDerived {
  let state: ReleaseState = 'draft'
  let latest: ReleaseGateRecord | null = null
  let latestDecision: ReleaseGateRecord | null = null
  const history: ReleaseHistoryEntry[] = []
  for (const record of records) {
    const action = actionOfRecord(record)
    if (!action) continue
    const legacy = !record.action
    const next = applyReleaseAction(state, action)
    if (next === null) {
      // 旧台账允许 approve↔reject 改判；新台账不应出现非法序列（写入端已 409）。
      if (legacy && state !== 'released') {
        state = action === 'approve' ? 'approved' : 'rejected'
      } else {
        history.push({ ...record, action, stateAfter: state, ...(legacy ? { legacy: true } : {}), ignored: true })
        continue
      }
    } else {
      state = next
    }
    latest = record
    if (action === 'approve' || action === 'reject') latestDecision = record
    history.push({ ...record, action, stateAfter: state, ...(legacy ? { legacy: true } : {}) })
  }
  return { state, latest, latestDecision, history }
}

export interface ReleaseActionInput {
  action: ReleaseAction
  note?: string
  anchor?: string
}

/**
 * 发布动作入参校验（纯函数；run 由控制器统一校验，避免与 isValidRun 双源）：
 * - action ∈ submit|approve|reject|release（兼容旧 decision=approve|reject）
 * - reject 必填理由（note 或 reason，非空 ≤300）
 * - approve 必填证据锚（anchor 或 evidence，非空 ≤300）
 */
export function validateReleaseActionInput(body: unknown):
  { ok: true; value: ReleaseActionInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: '请求体须为对象' }
  }
  const b = body as Record<string, unknown>
  const rawAction = typeof b.action === 'string'
    ? b.action
    : typeof b.decision === 'string' ? b.decision : ''
  if (!(RELEASE_ACTIONS as readonly string[]).includes(rawAction)) {
    return { ok: false, error: 'action 须为 submit|approve|reject|release（兼容旧 decision=approve|reject）' }
  }
  const action = rawAction as ReleaseAction
  const rawNote = typeof b.note === 'string' ? b.note : typeof b.reason === 'string' ? b.reason : ''
  const note = rawNote.trim()
  if (note.length > 300) return { ok: false, error: 'note 超长（≤300 字符）' }
  const rawAnchor = typeof b.anchor === 'string' ? b.anchor : typeof b.evidence === 'string' ? b.evidence : ''
  const anchor = rawAnchor.trim()
  if (anchor.length > 300) return { ok: false, error: 'anchor 超长（≤300 字符）' }
  if (action === 'reject' && !note) return { ok: false, error: '驳回必须填写理由（note/reason 必填）' }
  if (action === 'approve' && !anchor) {
    return { ok: false, error: '批准必须提供证据锚（UAT 台账/门记录/commit 任一，如 evidence/uat-verdicts.jsonl#AC-1）' }
  }
  return {
    ok: true,
    value: { action, ...(note ? { note } : {}), ...(anchor ? { anchor } : {}) },
  }
}

export interface ReleasePermission {
  submit: boolean
  approve: boolean
  reject: boolean
  release: boolean
}

/** 显式发布审批角色（部署侧赋 role=release；super_admin 恒通）。 */
export const RELEASE_APPROVER_ROLES: readonly string[] = ['super_admin', 'release']

/**
 * 权限矩阵（纯函数）：未启用鉴权的单用户部署放行（与 approval/governance 同先例）；
 * 启用鉴权后，approve/reject/release 仅 super_admin 或 role=release，submit 所有登录用户。
 */
export function releasePermissions(role: string | undefined, authenticated: boolean): ReleasePermission {
  if (!authenticated) return { submit: true, approve: true, reject: true, release: true }
  const approver = typeof role === 'string' && RELEASE_APPROVER_ROLES.includes(role)
  return { submit: true, approve: approver, reject: approver, release: approver }
}
