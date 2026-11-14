// overlay/standingagenda 域（2026-11-14 Proactive AI 二轮 P3）：standing agenda——
// 跨会话存活的持久意图。
//
// 范式来源：论文 §4.3.2——「注册触发条件 → 挂起 → 条件触发时重新激活」；
// §6.1.4 stewardship——挑战不只是让进程活着，而是保住「这项工作仍然值得做的理由」，
// 故记录必须携带 mandateGoal（委托目标）与 evidence（立案证据锚点），恢复建议据此复核。
// 恢复动作走既有治理链（interventions 台账＋治理者四门裁决），本域不自建旁路（spec D5）。
// 存档 JSONL append-only（先例＝intervention-ledger）；不触上游 kanban（卡级 standing 语义挂账后续批）。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { underWebUi } from '../lib/paths'
import type { AutomationSourceFilter } from '../automations/automation-rules'

export type StandingAgendaStatus = 'parked' | 'resumed' | 'done' | 'dropped'

export interface StandingAgendaRecord {
  id: string
  title: string
  /** 委托目标语句——「这项工作为什么值得做」（stewardship 三件套之一，恢复前复核）。 */
  mandateGoal: string
  /** 立案证据锚点（file:line / URL / 事件 id）。 */
  evidence: string[]
  /** 恢复条件：复用 automations 四源过滤器语义（file/kanban/git/webhook）。 */
  resumeCondition: AutomationSourceFilter
  parkedAt: number
  status: StandingAgendaStatus
  resumeCount: number
  lastResumeAt?: number
  /** 溯源：立案会话（P5 意图+diff 一体的最小增量）。 */
  sessionId?: string
  /** 关联 goal-alignment 目标 id（可选；有则恢复建议附新鲜度检查——stale 时「先重对齐再恢复」）。 */
  goalId?: string
  note?: string
}

/** 恢复建议（matcher 命中后产出；投 interventions 治理链，不直接动看板）。 */
export interface ResumeProposal {
  recordId: string
  title: string
  mandateGoal: string
  /** 命中的事件（证据锚点回填）。 */
  matchedEventSummary: string
  /** 立案证据回显（恢复前复核「仍然值得做」）。 */
  evidence: string[]
  /** goal-alignment 新鲜度附注（stale/never-confirmed 时＝「先重对齐再恢复」）。 */
  alignmentNote?: string
  createdAt: number
}

function ledgerDir(): string {
  const env = process.env.HERMES_STANDING_AGENDA_DIR?.trim()
  return env ? resolve(env) : underWebUi('standing-agenda')
}

function ledgerFile(): string {
  return join(ledgerDir(), 'standing-agenda.jsonl')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object'
}

/** 校验入参（纯函数；问题清单返回）。 */
export function validateAgendaInput(input: {
  title?: unknown
  mandateGoal?: unknown
  evidence?: unknown
  resumeCondition?: unknown
}): { problems: string[]; value?: { title: string; mandateGoal: string; evidence: string[]; resumeCondition: AutomationSourceFilter } } {
  const problems: string[] = []
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const mandateGoal = typeof input.mandateGoal === 'string' ? input.mandateGoal.trim() : ''
  if (!title || title.length > 120) problems.push('title 必填（≤120 字符）')
  if (!mandateGoal || mandateGoal.length > 1000) problems.push('mandateGoal 必填（≤1000 字符；这项工作为什么值得做）')
  const evidence = Array.isArray(input.evidence)
    ? input.evidence.filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    : undefined
  if (input.evidence !== undefined && (!Array.isArray(input.evidence) || (evidence ?? []).length === 0)) {
    problems.push('evidence 须为非空锚点数组（file:line / URL / 事件 id）')
  }
  const cond = input.resumeCondition as Partial<AutomationSourceFilter> | undefined
  if (!isRecord(cond) || typeof cond.type !== 'string'
    || !['file', 'kanban', 'git', 'webhook'].includes(cond.type)) {
    problems.push('resumeCondition.type 须为 file/kanban/git/webhook')
  }
  if (problems.length) return { problems }
  return {
    problems: [],
    value: {
      title, mandateGoal,
      evidence: evidence ?? [],
      resumeCondition: cond as AutomationSourceFilter,
    },
  }
}

/** append-only 落账；单写整记录（状态流转也走 append，读取取每 id 最新行——状态机留痕）。 */
export function appendAgenda(record: StandingAgendaRecord): void {
  mkdirSync(ledgerDir(), { recursive: true })
  appendFileSync(ledgerFile(), `${JSON.stringify(record)}\n`, 'utf8')
}

/** 读取（fail-soft：账本缺席＝空；坏行跳过计数如实呈现；同 id 取最新行）。 */
export function readAgendas(): { records: StandingAgendaRecord[]; badLines: number } {
  if (!existsSync(ledgerFile())) return { records: [], badLines: 0 }
  let badLines = 0
  const latest = new Map<string, StandingAgendaRecord>()
  for (const line of readFileSync(ledgerFile(), 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.status !== 'string') { badLines += 1; continue }
      latest.set(parsed.id, parsed as unknown as StandingAgendaRecord)
    } catch { badLines += 1 }
  }
  return { records: [...latest.values()], badLines }
}

export function getAgenda(id: string): StandingAgendaRecord | undefined {
  return readAgendas().records.find((r) => r.id === id)
}

export function newAgendaId(): string {
  return `sag-${randomUUID().slice(0, 8)}`
}
