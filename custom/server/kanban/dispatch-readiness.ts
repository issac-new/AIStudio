// overlay/kanban 域：派单五问准入（2026-11-19 流程解耦批二）。
//
// 来源：企业流程重构文章第六章「判断一项业务活动是否适合引入 AI 的五个方面」：
// 信息是否能够获取／业务规则是否明确／任务目标是否清晰／执行过程是否可控／
// 结果是否能够验证。本模块把这五问机械化为列编排派单面的 readiness 门。
//
// 如实边界：判据是**机械启发式**（见各 dimension 注释），不是语义级判断——
// 「目标清晰=标题非空」只证下界，语义判断留给评审与人。默认 warn（缺口可见），
// HERMES_DISPATCH_READINESS_ENFORCE=1 时任一缺失抛 DispatchReadinessError
// （REST 400），在任何 step 派发前拦截。执法梯度与 TEAM_STOP_ENFORCE /
// GOVERNANCE_SLO_BUDGET 同哲学：先让缺口可见，再谈强制。
import { existsSync } from 'node:fs'
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics'

export type ReadinessDimension = 'information' | 'rules' | 'goal' | 'control' | 'verifiable'

export interface DispatchReadinessFinding {
  dimension: ReadinessDimension
  ok: boolean
  /** 判据说明（缺失时给人读：缺什么、按什么判的）。 */
  detail: string
}

/** readiness 缺失（≠配置错误≠引擎不可达）：enforce 档的硬拦截载体。 */
export class DispatchReadinessError extends Error {
  constructor(public readonly findings: DispatchReadinessFinding[]) {
    super(`派单五问未过（${findings.filter(f => !f.ok).map(f => f.dimension).join('/')}）：`
      + findings.filter(f => !f.ok).map(f => `${f.dimension}——${f.detail}`).join('；'))
    this.name = 'DispatchReadinessError'
  }
}

export interface DispatchReadinessInput {
  workspacePath: string
  taskId?: string
  /** 任务快照（title/body）；缺席时由调用方先用 fetchTaskTitleAndBody 取。 */
  task?: { title?: string | null; body?: string | null } | null
  /** 命中的交接规则行（handoff-rules 建议面）。 */
  handoffRuleLine?: string | null
  /** 目标列声明的证据契约（columns.yaml requiredArtifacts）。 */
  columnRequiredArtifacts?: string[]
  /** 任一 step 声明了 autonomy/constraints（授权要素面）。 */
  stepsRuleCoverage?: boolean
}

/** 五问求值（纯函数，便于测试与 REST 透出）。 */
export function assessDispatchReadiness(input: DispatchReadinessInput): DispatchReadinessFinding[] {
  const workspaceOk = input.workspacePath.trim().length > 0 && existsSync(input.workspacePath)
  const body = input.task?.body ?? ''
  // 验收标记：AC-1/AC1/AC·1、中文「验收」、acceptance/dod 关键字（启发式，覆盖
  // 任务书七要素与完成契约两套既成口径的常用写法）。
  const acceptanceMarked = /(^|\n)\s*AC[-·]?\s?\d/i.test(body) || /验收|acceptance|\bdod\b/i.test(body)
  const columnArtifacts = input.columnRequiredArtifacts?.length ?? 0
  return [
    {
      dimension: 'information',
      ok: workspaceOk,
      detail: workspaceOk ? '工作区在位' : 'workspacePath 缺失或不存在（agent 无处落地）',
    },
    {
      dimension: 'rules',
      ok: Boolean(input.handoffRuleLine) || columnArtifacts > 0 || Boolean(input.stepsRuleCoverage),
      detail: '命中交接规则／列证据契约／step 授权要素三者任一即视为规则面已声明',
    },
    {
      dimension: 'goal',
      ok: Boolean(input.task?.title && String(input.task.title).trim().length > 0),
      detail: '任务标题非空（标题缺失=派单文本只能写列名，目标不成立）',
    },
    {
      dimension: 'control',
      ok: Boolean(input.taskId && input.taskId.trim().length > 0),
      detail: 'taskId 在场（幂等闸/台账/证据链均以 taskId 为键；缺席即这些闸全部缺位）',
    },
    {
      dimension: 'verifiable',
      ok: acceptanceMarked || columnArtifacts > 0,
      detail: '任务 body 含验收标记（AC-n/验收/acceptance/dod）或列声明 requiredArtifacts',
    },
  ]
}

/** warn/enforce 收口：默认 warn 一行；HERMES_DISPATCH_READINESS_ENFORCE=1 抛错。 */
export function enforceOrWarnReadiness(findings: DispatchReadinessFinding[]): void {
  const missing = findings.filter(f => !f.ok)
  if (missing.length === 0) return
  if (process.env.HERMES_DISPATCH_READINESS_ENFORCE === '1') {
    throw new DispatchReadinessError(findings)
  }
  console.warn(`[column-dispatch] 派单五问缺口（warn，HERMES_DISPATCH_READINESS_ENFORCE=1 可强拦）：`
    + missing.map(f => `${f.dimension}=${f.detail}`).join('；'))
}

/** 按 taskId 跨板取任务标题/正文/assignee/技能声明/能力需求（只读主键查询，毫秒级；查不到返回 null 不猜）。 */
export async function fetchTaskTitleAndBodyByTaskId(taskId: string): Promise<{
  title: string | null
  body: string | null
  assignee: string | null
  skills: string[]
  /** Task 8：能力需求（declared 优先，缺列回退 skills） */
  required_capabilities: string[]
} | null> {
  for (const dbPath of kanbanDbFiles()) {
    let db: Awaited<ReturnType<typeof openReadonly>> | undefined
    try {
      db = await openReadonly(dbPath)
      // 旧库无 skills/required_capabilities 列时逐级回落：标题/正文/assignee 仍可取。
      let row: {
        title?: string | null
        body?: string | null
        assignee?: string | null
        skills?: string | null
        required_capabilities?: string | null
      } | undefined
      try {
        row = db.prepare('SELECT title, body, assignee, skills, required_capabilities FROM tasks WHERE id = ?').get(taskId) as typeof row
      } catch {
        try {
          row = db.prepare('SELECT title, body, assignee, skills FROM tasks WHERE id = ?').get(taskId) as typeof row
        } catch {
          row = db.prepare('SELECT title, body, assignee FROM tasks WHERE id = ?').get(taskId) as typeof row
        }
      }
      if (row) {
        const parseList = (raw: string | null | undefined): string[] => {
          try {
            const parsed = raw ? (JSON.parse(raw) as unknown) : []
            return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
          } catch {
            return []
          }
        }
        const skills = parseList(row.skills)
        const rc = parseList(row.required_capabilities)
        return {
          title: row.title ?? null,
          body: row.body ?? null,
          assignee: row.assignee?.trim() ? row.assignee.trim() : null,
          skills,
          // declared 口径优先；无声明时回退 skills（过渡期）
          required_capabilities: rc.length > 0 ? rc : skills,
        }
      }
    } catch {
      // 单板读失败继续下一板（fail-soft）
    } finally {
      try { db?.close() } catch { /* 已关 */ }
    }
  }
  return null
}
