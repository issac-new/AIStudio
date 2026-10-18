// overlay/custom/client/ide/utils/deliverables.ts
// 交付物面板数据聚合（G4）：计划 / 变更 / 验证 / 产物文件 / 摘要。
// 全部只读；输入来自 chat messages + runs digest，输出纯数据供组件渲染与测试。
import type { TaskPlanSnapshot } from '@/utils/task-plan'
import type { RunChangesDigest } from '../api/runs'

export interface DeliverableMessageLike {
  id?: string
  role: string
  content?: string
  timestamp?: number
  toolName?: string
  toolArgs?: unknown
  toolStatus?: string
  taskPlan?: TaskPlanSnapshot
}

export interface PlanSummary {
  done: number
  total: number
  pct: number
  pending: string[]
  updatedAt?: number
}

export interface VerificationRow {
  id: string
  command: string
  status: 'done' | 'error' | 'running' | 'unknown'
  at: number
  toolName: string
}

export interface DeliverableArtifact {
  path: string
  changeType: string
  additions: number
  deletions: number
}

export interface DeliverablesSnapshot {
  plan: PlanSummary | null
  verification: VerificationRow[]
  artifacts: DeliverableArtifact[]
  changes: RunChangesDigest[]
}

const TEST_COMMAND_RE = /\b(vitest|pytest|npm\s+(run\s+)?test|npm\s+run\s+build|pnpm\s+(run\s+)?(test|build)|yarn\s+(test|build)|tsc(\s|$)|vue-tsc|go\s+test|cargo\s+test|make\s+test|eslint|ruff\s+check|mypy)\b/i
const ARTIFACT_EXT_RE = /\.(md|markdown|docx?|xlsx?|pptx?|pdf|csv|tsv|html?|svg|png|jpe?g)$/i
const SHELL_TOOL_RE = /(bash|shell|exec|terminal|command|run)/i

/** 最近一次计划快照（消息末尾向前） */
export function latestPlanSummary(messages: DeliverableMessageLike[]): PlanSummary | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const plan = messages[i]?.taskPlan
    if (!plan?.plan?.length) continue
    const total = plan.plan.length
    const done = plan.plan.filter((s) => s.status === 'completed').length
    return {
      done,
      total,
      pct: total ? Math.round((done / total) * 100) : 0,
      pending: plan.plan.filter((s) => s.status !== 'completed').map((s) => s.step).filter(Boolean),
      updatedAt: plan.updated_at,
    }
  }
  return null
}

function commandOf(args: unknown): string {
  if (!args) return ''
  if (typeof args === 'string') return args
  if (Array.isArray(args) && args.every((x) => typeof x === 'string')) return args.join(' ')
  if (typeof args === 'object') {
    const a = args as Record<string, unknown>
    for (const key of ['command', 'cmd', 'script', 'args', 'input']) {
      const v = a[key]
      if (typeof v === 'string' && v.trim()) return v
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v.join(' ')
    }
  }
  return ''
}

/** 验证行：shell 类工具里命中测试/构建/类型检查命令的调用（新→旧） */
export function collectVerification(messages: DeliverableMessageLike[]): VerificationRow[] {
  const rows: VerificationRow[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role !== 'tool' && !m.toolName) continue
    if (!SHELL_TOOL_RE.test(m.toolName || '')) continue
    const command = commandOf(m.toolArgs).replace(/\s+/g, ' ').trim()
    if (!command || !TEST_COMMAND_RE.test(command)) continue
    const status = m.toolStatus === 'error' ? 'error'
      : m.toolStatus === 'running' ? 'running'
        : m.toolStatus === 'done' ? 'done' : 'unknown'
    rows.push({
      id: m.id || `${i}`,
      command: command.length > 160 ? `${command.slice(0, 159)}…` : command,
      status,
      at: m.timestamp ?? 0,
      toolName: m.toolName || 'tool',
    })
  }
  return rows.sort((a, b) => b.at - a.at)
}

/** 产物文件：变更里的文档/数据/演示/静态资源 */
export function collectArtifacts(changes: RunChangesDigest[]): DeliverableArtifact[] {
  const seen = new Set<string>()
  const out: DeliverableArtifact[] = []
  for (const run of changes) {
    for (const f of run.files) {
      if (!ARTIFACT_EXT_RE.test(f.path)) continue
      const key = f.path
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ path: f.path, changeType: f.changeType, additions: f.additions, deletions: f.deletions })
    }
  }
  return out
}

export function buildDeliverables(input: {
  messages: DeliverableMessageLike[]
  changes: RunChangesDigest[]
}): DeliverablesSnapshot {
  return {
    plan: latestPlanSummary(input.messages),
    verification: collectVerification(input.messages),
    artifacts: collectArtifacts(input.changes),
    changes: input.changes,
  }
}

/** 交付摘要 markdown（复制/发送到会话共用；不虚构未发生的验证） */
export function deliverableSummaryMarkdown(snap: DeliverablesSnapshot, title = '交付摘要'): string {
  const lines: string[] = [`## ${title}`, '']
  if (snap.plan) {
    lines.push(`### 计划（${snap.plan.done}/${snap.plan.total}，${snap.plan.pct}%）`)
    if (snap.plan.pending.length) {
      for (const p of snap.plan.pending.slice(0, 20)) lines.push(`- [ ] ${p}`)
    } else lines.push('- 全部完成')
    lines.push('')
  }
  lines.push(`### 变更（${snap.changes.length} 轮，${snap.changes.reduce((n, r) => n + r.fileCount, 0)} 文件）`)
  for (const run of snap.changes.slice(0, 10)) {
    lines.push(`- ${run.runId}：${run.fileCount} 文件 +${run.additions}/-${run.deletions}`)
  }
  if (!snap.changes.length) lines.push('- 本轮无文件变更')
  lines.push('')
  lines.push(`### 验证（${snap.verification.length} 条）`)
  for (const v of snap.verification.slice(0, 10)) {
    lines.push(`- [${v.status}] ${v.command}`)
  }
  if (!snap.verification.length) lines.push('- 未捕获到测试/构建命令')
  if (snap.artifacts.length) {
    lines.push('')
    lines.push(`### 产物文件（${snap.artifacts.length}）`)
    for (const a of snap.artifacts.slice(0, 20)) lines.push(`- ${a.path}（${a.changeType}，+${a.additions}/-${a.deletions}）`)
  }
  return lines.join('\n')
}
