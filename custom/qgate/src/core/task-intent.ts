// 任务意图登记（v0.3 §4.2，上游 v0.9"Agent 对齐失效防护"本地方言）：
// 登记"本任务宣称要做什么"（人在回路确认），供 scope executor 与 git 变更事实做交集对账。
// 纪律（上游 ADR-0014）：写入只经本模块（CLI `qgate intent` 调用），修订自动留痕；
// 登记文件被静默修改由 acknowledgedSha256 对账逮住（见 executors/scope.ts）。

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord } from './parse.js'

export interface TaskIntentRevision {
  at: string
  reason: string
}

export interface TaskIntent {
  taskId: string
  statement: string
  /** 意图范围 glob 清单（与 scope.yaml 取交集判定）。 */
  scope: string[]
  /** 验收条目（Gherkin 骨架：须含 When/Then）。 */
  acceptance: string[]
  constraints?: string[]
  confirmedBy: string
  confirmedAt: string
  revisions?: TaskIntentRevision[]
}

export const TASK_INTENT_DEFAULT_FILE = join('.qgate', 'registers', 'task-intent.json')

function strListOf(v: unknown, max: number): string[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > max) return undefined
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string' || x.length === 0) return undefined
    out.push(x)
  }
  return out
}

/** 容错解析（house style：非法返回 null）。 */
export function parseTaskIntent(raw: unknown): TaskIntent | null {
  if (!isRecord(raw)) return null
  const taskId = typeof raw.taskId === 'string' && raw.taskId.length > 0 && raw.taskId.length <= 128 ? raw.taskId : null
  const statement = typeof raw.statement === 'string' && raw.statement.length > 0 && raw.statement.length <= 4000 ? raw.statement : null
  const scope = strListOf(raw.scope, 50)
  const acceptance = strListOf(raw.acceptance, 50)
  const confirmedBy = typeof raw.confirmedBy === 'string' && raw.confirmedBy.length > 0 ? raw.confirmedBy : null
  const confirmedAt = typeof raw.confirmedAt === 'string' && raw.confirmedAt.length > 0 ? raw.confirmedAt : null
  if (!taskId || !statement || !scope || !acceptance || !confirmedBy || !confirmedAt) return null
  const constraints = raw.constraints === undefined ? undefined : strListOf(raw.constraints, 20)
  if (raw.constraints !== undefined && constraints === undefined) return null
  let revisions: TaskIntentRevision[] | undefined
  if (raw.revisions !== undefined) {
    if (!Array.isArray(raw.revisions) || raw.revisions.length > 100) return null
    revisions = []
    for (const r of raw.revisions) {
      if (!isRecord(r) || typeof r.at !== 'string' || typeof r.reason !== 'string' || r.reason.length === 0) return null
      revisions.push({ at: r.at, reason: r.reason })
    }
  }
  return { taskId, statement, scope, acceptance, constraints, confirmedBy, confirmedAt, revisions }
}

/** Gherkin 骨架最小子集（v0.3 §4.2）：条目须同时含 When 与 Then（兼容中文 当/那么）。 */
export function hasGherkinSkeleton(entry: string): boolean {
  return /(\bwhen\b|当)/i.test(entry) && /(\bthen\b|那么)/i.test(entry)
}

export function taskIntentSha256(file: string): string | null {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex')
  } catch {
    return null
  }
}

export function loadTaskIntent(file: string): TaskIntent | null {
  if (!existsSync(file)) return null
  try {
    return parseTaskIntent(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return null
  }
}

export interface IntentWriteInput {
  taskId: string
  statement: string
  scope: string[]
  acceptance: string[]
  constraints?: string[]
  confirmedBy: string
}

/**
 * 唯一确定性写入通道。revise 模式：读取既有登记，保留 taskId，追加 revisions 留痕；
 * acceptance 在写入前过 Gherkin 骨架校验（fail-closed：不合格拒绝写盘）。
 * 返回写入后的登记与文件哈希；调用方（CLI）负责把哈希重绑到引用它的门声明。
 */
export function writeTaskIntent(
  file: string,
  input: IntentWriteInput,
  opts: { revise?: boolean; reason?: string; now?: Date } = {},
): { intent: TaskIntent; sha256: string } {
  for (const ac of input.acceptance) {
    if (!hasGherkinSkeleton(ac)) {
      throw new Error(`acceptance entry lacks Gherkin When/Then skeleton: "${ac.slice(0, 80)}"`)
    }
  }
  const now = (opts.now ?? new Date()).toISOString()
  let revisions: TaskIntentRevision[] | undefined
  if (opts.revise) {
    if (!opts.reason || opts.reason.length === 0) throw new Error('--revise requires --reason (修订必须留痕)')
    const prev = loadTaskIntent(file)
    if (!prev) throw new Error(`cannot revise: no valid task-intent register at ${file}`)
    revisions = [...(prev.revisions ?? []), { at: now, reason: opts.reason }]
  }
  const intent: TaskIntent = {
    taskId: input.taskId,
    statement: input.statement,
    scope: input.scope,
    acceptance: input.acceptance,
    constraints: input.constraints,
    confirmedBy: input.confirmedBy,
    confirmedAt: now,
    revisions,
  }
  if (parseTaskIntent(intent) === null) throw new Error('assembled task-intent failed self-validation (refusing to write)')
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, JSON.stringify(intent, null, 2) + '\n', 'utf8')
  return { intent, sha256: taskIntentSha256(file)! }
}
