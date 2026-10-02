/**
 * 驾驭工程 B4：八工程原语对账（信通院《驾驭工程》八原语 → 本仓代码现实）。
 *
 * 八原语：任务/会话/状态/工具/记忆/权限/评估/审计——报告要求每个原语要有
 * 唯一标识、版本、生命周期、审计追溯四属性。本模块做两件事：
 *   1. 静态定义：八原语各自的 idPattern/存储位置/版本来源/生命周期阶段/审计挂点，
 *      全部从代码现实归纳，每条带锚点注释（文件+符号，可对账）
 *   2. 活体计数 + 覆盖矩阵：每原语对 唯一标识/版本/生命周期/审计 四属性标
 *      有/部分/缺——"部分"= 机制存在但有明显口径缺口（note 写明缺口）
 *
 * 活体计数口径：任务=kanban tasks 数、会话=sessions 数、工具=能力目录 entries 数、
 * 权限=approval rules 数、评估=qgate gate-packs 目录数、审计=audit 事件数（采样上限 500）；
 * 状态/记忆无独立事实源，恒 null 如实标注（不造数）。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { auditLog } from '../governance/governance-audit'
import { kanbanDbFiles, openReadonly } from '../governance/governance-analytics'
import { resolveApprovalRulesPath } from '../approval/approval-store'
import { collectCapabilityCatalog } from './capability-catalog'
import { resolveStudioDb } from './cost-accounts'

// ── 类型 ───────────────────────────────────────────────────────────

export type PrimitiveKey =
  | 'task' | 'session' | 'state' | 'tool' | 'memory' | 'permission' | 'evaluation' | 'audit'

export type CoverageStatus = '有' | '部分' | '缺'
export type CoverageAttribute = 'identity' | 'version' | 'lifecycle' | 'audit'

export const COVERAGE_ATTRIBUTES: readonly CoverageAttribute[] = ['identity', 'version', 'lifecycle', 'audit']

export const COVERAGE_ATTRIBUTE_LABELS: Record<CoverageAttribute, string> = {
  identity: '唯一标识', version: '版本', lifecycle: '生命周期', audit: '审计追溯',
}

export interface PrimitiveDef {
  key: PrimitiveKey
  name: string
  enName: string
  /** 唯一标识形态（现实归纳，非应然设计） */
  idPattern: string
  /** 存储位置 */
  storage: string
  /** 版本来源（"无"=现实缺口） */
  versionSource: string
  /** 生命周期阶段（现实词表） */
  lifecycle: string[]
  /** 审计挂点（哪个表/台账记它的变更） */
  auditHook: string
  /** 代码锚点（file + 符号） */
  anchors: string[]
  coverage: Record<CoverageAttribute, CoverageStatus>
  coverageNotes: Partial<Record<CoverageAttribute, string>>
}

export interface PrimitiveRow extends PrimitiveDef {
  liveCount: number | null
  liveCountNote?: string
}

export interface PrimitivesReport {
  ok: true
  primitives: PrimitiveRow[]
  matrix: {
    totalPrimitives: number
    /** 每属性 有/部分/缺 的原语数（横向汇总） */
    byAttribute: Record<CoverageAttribute, Record<CoverageStatus, number>>
    /** 全四属性至少"有"的原语数（最严口径） */
    fullyCovered: number
  }
}

// ── 八原语静态定义（锚点=代码现实，改这些文件时同步本表） ──────────

export const HARNESS_PRIMITIVES: readonly PrimitiveDef[] = [
  {
    key: 'task', name: '任务', enName: 'Task',
    idPattern: 'kanban tasks.id（TEXT PRIMARY KEY，每板一库）',
    storage: '~/.hermes/kanban/boards/*/<slug>/kanban.db tasks 表（根库 ~/.hermes/kanban.db 兜底）',
    versionSource: '任务无版本列（缺口）；历史经 task_events 事件流可回放',
    lifecycle: ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived'],
    auditHook: 'task_events 表（每板库）+ governance-audit kanban 源归一',
    anchors: [
      'custom/server/governance/governance-analytics.ts kanbanDbFiles（板库定位）',
      'custom/server/knowledge/board-graph.ts syncBoardGraph（tasks 列锚点）',
      'custom/client/ia2/views/TasksView.vue KANBAN_STATUSES（上游 KanbanTaskStatus 派生词表）',
    ],
    coverage: { identity: '有', version: '缺', lifecycle: '有', audit: '有' },
    coverageNotes: { version: '无任务级版本字段；task_events 可追溯但非版本语义' },
  },
  {
    key: 'session', name: '会话', enName: 'Session',
    idPattern: 'sessions.id TEXT PRIMARY KEY（hermes-web-ui.db）',
    storage: 'hermes-web-ui.db sessions/messages 表（upstream studio schema）',
    versionSource: 'history_revision 列（历史修订号——修订语义，非内容版本）',
    lifecycle: ['started(started_at)', 'active(last_active)', 'ended(ended_at+end_reason)'],
    auditHook: 'provider_audit_events 表（governance-audit provider 源归一）',
    anchors: [
      'upstream/hermes-studio packages/server/src/modules/studio/infrastructure/database/schemas.ts SESSIONS_SCHEMA / MESSAGES_SCHEMA',
      'custom/server/controllers/ide/compaction-trace.ts resolveStudioDb（库定位候选法）',
    ],
    coverage: { identity: '有', version: '部分', lifecycle: '有', audit: '有' },
    coverageNotes: { version: 'history_revision 是历史修订计数，非语义化版本' },
  },
  {
    key: 'state', name: '状态', enName: 'State',
    idPattern: '状态值内嵌宿主表列（tasks.status / sessions.execution_state），无独立状态注册表',
    storage: '分散于宿主表；词表上游 KanbanTaskStatus 类型是单一事实源',
    versionSource: '无（状态机定义无版本化）',
    lifecycle: ['任务侧 9 态词表（triage→archived）；会话侧执行态（execution_state）'],
    auditHook: 'task_events 记录状态转移事实；但状态机定义本体变更无审计',
    anchors: [
      'custom/client/ia2/views/TasksView.vue KANBAN_STATUSES（词表派生自上游类型）',
      'custom/server/governance/governance-audit.ts kanbanEvents（转移事件归一）',
      'custom/server/governance/governance-ledger.ts loadStateModel（状态-事件本体档案）',
    ],
    coverage: { identity: '部分', version: '缺', lifecycle: '部分', audit: '部分' },
    coverageNotes: {
      identity: '状态无全局唯一 id，依附宿主表',
      lifecycle: '有词表但无强制状态机（非法转移无拦截）',
    },
  },
  {
    key: 'tool', name: '工具', enName: 'Tool',
    idPattern: 'MCP server name（配置文件名幂等）+ tool 名（server:tool 复合）',
    storage: '~/.hermes-web-ui/mcp-config/*.json（HERMES_MCP_CONFIG_DIR 可覆写）',
    versionSource: '配置无版本字段（缺口——B1 四要素报告的版本缺口主源）',
    lifecycle: ['configured(scope 三选一)', 'authorized/needs-auth/dismissed（授权闭环）'],
    auditHook: '无工具调用审计表；provider_audit_events 只覆盖 provider 面不覆盖工具面',
    anchors: [
      'custom/server/mcpconfig/mcp-config.ts McpServerConfig（scope/authState 语义）',
      'custom/server/mcpcatalog/mcp-catalog.ts disabledTools（工具级禁用语义）',
    ],
    coverage: { identity: '有', version: '缺', lifecycle: '部分', audit: '缺' },
    coverageNotes: {
      lifecycle: '授权态有闭环，安装/卸载/超时变更无留痕',
      audit: '工具调用无处审计（B1 审计缺口主源）',
    },
  },
  {
    key: 'memory', name: '记忆', enName: 'Memory',
    idPattern: '技能/记忆按目录名或文件名（无全局唯一 id 规范）',
    storage: '~/.hermes/skills/*（技能面）；记忆四类型/作用域为纯域（memorytax/memscope），无独立存储',
    versionSource: 'SKILL.md frontmatter version 字段（多数技能缺席）',
    lifecycle: ['installed', 'referenced', '（退役无留痕）'],
    auditHook: '无（技能目录若在 git 仓内可追提交史，非产品化审计）',
    anchors: [
      'custom/server/memorytax（auto memory 四类型+新鲜度，纯评估面）',
      'custom/server/memscope（记忆 global/project 两级分治，纯评估面）',
      'custom/server/extmarket/extension-market.ts MarketEntry.installedVersion（版本语义在市场面）',
    ],
    coverage: { identity: '部分', version: '部分', lifecycle: '部分', audit: '缺' },
    coverageNotes: {
      identity: '目录名即 id，无注册表',
      version: 'frontmatter version 字段存在但多数缺席',
      lifecycle: '无退役/失效机制',
    },
  },
  {
    key: 'permission', name: '权限', enName: 'Permission',
    idPattern: 'rules.json 规则行（tool 名 + owner/sessionId/agentId 绑定复合标识）',
    storage: '~/.hermes-web-ui/approval/rules.json（HERMES_APPROVAL_RULES_FILE 可覆写）',
    versionSource: '无版本号（defaultMode+rules 整档读写）',
    lifecycle: ['added', 'effective', 'removed（无生效时间窗/灰度）'],
    auditHook: '审批决策有 history.json（approvals 审计源）；规则本身的增删改无审计',
    anchors: [
      'custom/server/approval/approval-store.ts ApprovalRulesFile（schema 单一事实源）',
      'custom/server/approvals/approval-log.ts queryApprovalLog（决策留痕面）',
    ],
    coverage: { identity: '有', version: '缺', lifecycle: '部分', audit: '部分' },
    coverageNotes: { audit: '决策留痕在档，规则变更本体无审计' },
  },
  {
    key: 'evaluation', name: '评估', enName: 'Evaluation',
    idPattern: '门禁包目录名（custom/qgate/gate-packs/*，_ 前缀目录为 profiles 非门禁包）',
    storage: 'custom/qgate/gate-packs/<pack>/（gates/ + scenarios/ 结构）',
    versionSource: '包目录无版本元数据（缺口）',
    lifecycle: ['pack 定稿', 'run 执行（.qgate/runs 落 verdict）', '（包废弃无留痕）'],
    auditHook: '.qgate/runs 运行留痕（governance-analytics collectQgateRuns 扫描）',
    anchors: [
      'custom/qgate/gate-packs/（包目录结构：gates/scenarios）',
      'custom/server/governance/governance-analytics.ts collectQgateRuns / qgateRunRoots',
    ],
    coverage: { identity: '有', version: '缺', lifecycle: '部分', audit: '部分' },
    coverageNotes: { audit: 'run 留痕在档，包自身变更走 git 无产品化审计' },
  },
  {
    key: 'audit', name: '审计', enName: 'Audit',
    idPattern: '事件按 ts+源归一（NormalizedEvent）；仅 approvals 源条目有显式 id',
    storage: '四源分散：approvals history.json / domain-audit.jsonl / provider_audit_events / kanban task_events',
    versionSource: '无 schema 版本（归一投影层 governance-audit 承担兼容）',
    lifecycle: ['append-only 追加（approval-log CAP 500 截尾保最近）'],
    auditHook: '自身即审计原语（四源归一单一读取面 auditLog）',
    anchors: [
      'custom/server/governance/governance-audit.ts auditLog（四源归一）',
      'custom/server/approvals/approval-log.ts CAP（截尾口径）',
    ],
    coverage: { identity: '部分', version: '缺', lifecycle: '有', audit: '有' },
    coverageNotes: { identity: '多数源行无显式 id，按时间+源归一' },
  },
]

// ── 活体计数（逐源 fail-soft，缺席 null 不造数） ───────────────────

export interface PrimitiveCounts {
  task: number | null
  session: number | null
  state: null
  tool: number | null
  memory: null
  permission: number | null
  evaluation: number | null
  audit: number | null
}

/** 权限数=approval rules 数（只读 rules.json，不走 store 单例避免测试态污染） */
export function countApprovalRules(): number {
  const file = resolveApprovalRulesPath()
  if (!existsSync(file)) return 0
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as { rules?: unknown[] }
  return Array.isArray(parsed.rules) ? parsed.rules.length : 0
}

/** 评估数=qgate 门禁包数（gate-packs 顶层目录数；_ 前缀为 profiles 不计） */
export function countGatePacks(): number {
  const root = gatePacksDir()
  if (!existsSync(root)) return 0
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .length
}

/** gate-packs 目录定位：GOVERNANCE_QGATE_GATE_PACKS 显式覆盖 > overlay 仓根上寻（与 qgateRunRoots walkUp 同法） */
export function gatePacksDir(): string {
  const env = process.env.GOVERNANCE_QGATE_GATE_PACKS?.trim()
  if (env) return resolve(env)
  const rel = 'custom/qgate/gate-packs'
  let dir = resolve(__dirname)
  for (let i = 0; i <= 8; i++) {
    const candidate = resolve(dir, rel)
    if (existsSync(candidate)) return candidate
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return resolve(process.cwd(), rel)
}

export async function collectPrimitiveCounts(): Promise<{ counts: PrimitiveCounts; notes: Partial<Record<PrimitiveKey, string>> }> {
  const notes: Partial<Record<PrimitiveKey, string>> = {}

  // 任务数：kanban 板库 tasks 全计数
  let task: number | null = 0
  try {
    for (const file of kanbanDbFiles()) {
      let db
      try {
        db = await openReadonly(file)
      } catch { continue }
      try {
        task += Number((db.prepare('SELECT COUNT(*) c FROM tasks').all() as unknown as Array<{ c: number }>)[0].c)
      } catch { /* 单库失败跳过 */ }
      finally { try { db.close() } catch { /* 已关 */ } }
    }
  } catch {
    task = null
    notes.task = 'kanban 板库读取失败'
  }

  // 会话数：sessions 表计数
  let session: number | null = null
  const dbFile = resolveStudioDb()
  if (dbFile) {
    let db
    try {
      db = await openReadonly(dbFile)
      session = Number((db.prepare('SELECT COUNT(*) c FROM sessions').all() as unknown as Array<{ c: number }>)[0].c)
    } catch {
      session = null
      notes.session = 'hermes-web-ui.db sessions 读取失败'
    } finally {
      try { db?.close() } catch { /* 已关 */ }
    }
  } else {
    notes.session = 'hermes-web-ui.db 缺席'
  }

  // 工具数：能力目录 entries 总数（三系全量）
  let tool: number | null = null
  try {
    const catalog = await collectCapabilityCatalog()
    tool = catalog.gapSummary.totalEntries
  } catch {
    notes.tool = '能力目录聚合失败'
  }

  // 权限数：approval rules
  let permission: number | null = null
  try {
    permission = countApprovalRules()
  } catch {
    notes.permission = 'approval rules.json 读取失败'
  }

  // 评估数：gate-packs 目录数
  let evaluation: number | null = null
  try {
    evaluation = countGatePacks()
  } catch {
    notes.evaluation = 'gate-packs 目录读取失败'
  }

  // 审计数：audit 事件数（采样上限 500，如实标注）
  let auditCount: number | null = null
  try {
    const log = await auditLog({ limit: 500 })
    auditCount = log.total
    notes.audit = log.sources.some((s) => s.available)
      ? `采样上限 500（四源在档 ${log.sources.filter((s) => s.available).length}/4）`
      : '四源均缺席，计数 0'
  } catch {
    notes.audit = 'auditLog 读取失败'
  }

  return {
    counts: {
      task, session, state: null, tool, memory: null, permission, evaluation, audit: auditCount,
    },
    notes: {
      ...notes,
      state: '状态无独立事实源（依附宿主表列），不计活体数',
      memory: '记忆无独立存储（memorytax/memscope 为纯评估面），不计活体数',
    },
  }
}

// ── 覆盖矩阵（静态定义 + 活体计数 → 报告行） ──────────────────────

export function buildPrimitivesReport(
  counts: PrimitiveCounts,
  countNotes: Partial<Record<PrimitiveKey, string>> = {},
): PrimitivesReport {
  const byAttribute = {
    identity: { '有': 0, '部分': 0, '缺': 0 },
    version: { '有': 0, '部分': 0, '缺': 0 },
    lifecycle: { '有': 0, '部分': 0, '缺': 0 },
    audit: { '有': 0, '部分': 0, '缺': 0 },
  } as Record<CoverageAttribute, Record<CoverageStatus, number>>
  let fullyCovered = 0
  const primitives: PrimitiveRow[] = HARNESS_PRIMITIVES.map((p) => {
    for (const attr of COVERAGE_ATTRIBUTES) byAttribute[attr][p.coverage[attr]] += 1
    if (COVERAGE_ATTRIBUTES.every((attr) => p.coverage[attr] === '有')) fullyCovered += 1
    return {
      ...p,
      liveCount: counts[p.key],
      liveCountNote: counts[p.key] == null ? (countNotes[p.key] ?? '数据缺席') : countNotes[p.key],
    }
  })
  return {
    ok: true,
    primitives,
    matrix: { totalPrimitives: primitives.length, byAttribute, fullyCovered },
  }
}
