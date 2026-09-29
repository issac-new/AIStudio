// overlay/custom/server/approvals/autopass.ts
// V4.1 §七 backlog ③：低风险自动通过抽检器（2026-09-29 重构轮）。
// 设计（方案 V4.1 §三 人机分工域"低风险自动通过的抽检器"落地）：
//   - low 档（纯只读命令，risk-tier 服务端权威分类）超过宽限期后自动放行
//     （choice=once），人不再逐条点——低风险项从"等审"变"事后抽检"。
//   - 确定性抽检：stableHash(item.id) 决定该自动放行是否进抽检队列
//     （默认 20%，跨重启稳定——同 id 永远同判定，不靠随机数/计数器状态）。
//   - 全部自动放行落审批台账（actor=system · decision=auto_pass · risk=low），
//     抽检否决再落 decision=spotcheck_veto（治理信号：分类器误放行的回灌通道）。
// 开关与参数（env）：
//   HERMES_APPROVALS_AUTOPASS=0            整体关闭（默认开）
//   HERMES_APPROVALS_AUTOPASS_GRACE_MS     宽限期（默认 3000；新人列项先可见后放行）
//   HERMES_APPROVALS_SPOTCHECK_RATE        抽检比例 0..1（默认 0.2）
//   HERMES_APPROVALS_SPOTCHECK_FILE        抽检队列文件（默认 ~/.hermes-web-ui/approvals/spotcheck.json）
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import { appendApprovalLog } from './approval-log'
import type { ApprovalRiskTier } from './risk-tier'

/** FNV-1a 32 位：短、稳、无依赖（抽检确定性只需稳定不需加密）。 */
export function stableHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 该自动放行项是否抽检（确定性：同 id 恒同判定）。rate<=0 全不抽，>=1 全抽。 */
export function shouldSpotCheck(id: string, rate: number): boolean {
  if (!Number.isFinite(rate)) return false
  if (rate <= 0) return false
  if (rate >= 1) return true
  return stableHash(id) % 10_000 < Math.round(rate * 10_000)
}

export function autopassEnabled(): boolean {
  return process.env.HERMES_APPROVALS_AUTOPASS !== '0'
}

export function autopassGraceMs(): number {
  const v = Number(process.env.HERMES_APPROVALS_AUTOPASS_GRACE_MS)
  return Number.isFinite(v) && v >= 0 ? v : 3_000
}

export function spotcheckRate(): number {
  const v = Number(process.env.HERMES_APPROVALS_SPOTCHECK_RATE)
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.2
}

// ── 抽检队列（append 为主、resolve 原地改判；文件与审批历史同目录约定）──

export interface SpotCheckItem {
  /** 与审批队列同 id（fleet:… / fleetfile:…） */
  id: string
  /** 自动放行时间 */
  ts: number
  title: string
  detail: string
  profile?: string
  /** 抽检处置：confirmed=认可放行 / vetoed=误放行（治理回灌）；未处置=待抽检 */
  verdict?: 'confirmed' | 'vetoed'
  verdictTs?: number
  verdictActor?: string
  verdictNote?: string
}

export function resolveSpotcheckPath(): string {
  if (process.env.HERMES_APPROVALS_SPOTCHECK_FILE) return process.env.HERMES_APPROVALS_SPOTCHECK_FILE
  return join(homedir(), '.hermes-web-ui', 'approvals', 'spotcheck.json')
}

function loadSpotchecks(): SpotCheckItem[] {
  const file = resolveSpotcheckPath()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed.filter((v): v is SpotCheckItem =>
      !!v && typeof v === 'object' && typeof (v as SpotCheckItem).id === 'string' && typeof (v as SpotCheckItem).ts === 'number') : []
  } catch {
    return []
  }
}

function saveSpotchecks(list: SpotCheckItem[]): void {
  const file = resolveSpotcheckPath()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(list, null, 1), 'utf8')
  renameSync(tmp, file)
}

/** 待抽检清单（新→旧，只列未处置；limit 上限 100）。 */
export function listOpenSpotchecks(limit = 20): SpotCheckItem[] {
  return loadSpotchecks()
    .filter((s) => !s.verdict)
    .reverse()
    .slice(0, Math.max(1, Math.min(limit, 100)))
}

/** 已处置抽检（治理回看；vetoed 优先呈现）。 */
export function listResolvedSpotchecks(limit = 20): SpotCheckItem[] {
  return loadSpotchecks()
    .filter((s) => s.verdict)
    .reverse()
    .slice(0, Math.max(1, Math.min(limit, 100)))
}

/** 抽检处置（一次定音）：落审批台账 spotcheck_confirm / spotcheck_veto。 */
export function resolveSpotcheck(id: string, verdict: 'confirm' | 'veto', actor: string, note?: string): SpotCheckItem | null {
  const list = loadSpotchecks()
  const item = list.find((s) => s.id === id)
  if (!item || item.verdict) return null
  item.verdict = verdict === 'confirm' ? 'confirmed' : 'vetoed'
  item.verdictTs = Date.now()
  item.verdictActor = actor
  item.verdictNote = note
  saveSpotchecks(list)
  appendApprovalLog({
    id: `spotcheck:${id}`,
    actor,
    targetKind: 'command',
    targetId: id,
    targetTitle: item.title || item.detail,
    decision: verdict === 'confirm' ? 'spotcheck_confirm' : 'spotcheck_veto',
    note: note || (verdict === 'confirm' ? undefined : '抽检否决：分类器误放行，回灌治理'),
    risk: 'low',
  })
  return item
}

// ── 自动放行执行（副作用；由 pending 聚合前调用，见 pending-controller）──

/** autopass 候选判定（纯函数）：命令类 + low 档 + 过宽限期。 */
export function isAutopassCandidate(item: { kind: string; risk?: ApprovalRiskTier; createdAt?: number }, now = Date.now()): boolean {
  if (item.kind !== 'command') return false
  if (item.risk !== 'low') return false
  // createdAt<=0/缺失 视为未知（fleet 源 lastActiveAt=0 即"未知"）：宽限期从
  // 当下起算，杜绝陈旧/零值让新人列项首扫即被放行（先可见后放行失效）。
  const created = typeof item.createdAt === 'number' && item.createdAt > 0 ? item.createdAt : now
  return now - created >= autopassGraceMs()
}

/** 记一笔自动放行：台账 + 命中抽检则入队列。返回是否入抽检队列。 */
export function recordAutoPass(item: { id: string; title: string; detail: string; profile?: string }): boolean {
  appendApprovalLog({
    id: `autopass:${item.id}`,
    actor: 'system',
    targetKind: 'command',
    targetId: item.id,
    targetTitle: item.title || item.detail,
    decision: 'auto_pass',
    note: '低风险只读命令自动放行（V4.1 抽检器）',
    risk: 'low',
  })
  if (!shouldSpotCheck(item.id, spotcheckRate())) return false
  const list = loadSpotchecks()
  if (list.some((s) => s.id === item.id)) return true
  list.push({ id: item.id, ts: Date.now(), title: item.title, detail: item.detail, profile: item.profile })
  saveSpotchecks(list)
  return true
}
