// eval 路由共享助手（v0.4 单文件体量治理：从 controller.ts 拆出，行为不变）。
import type { Context } from 'koa'
import type { OutcomeRunContext } from '../outcome'
import { getSet, getSetRevision } from '../store'
import type { EvalRun, EvalSet } from '../types'

export function actorOf(ctx: Context): string | undefined {
  const user = (ctx.state as { user?: { id?: number | string; username?: string } } | undefined)?.user
  if (!user) return undefined
  return user.username ?? (user.id !== undefined ? String(user.id) : undefined)
}

export function outcomeContext(): OutcomeRunContext {
  const roots = process.env.EVAL_OUTCOME_ALLOWED_ROOTS?.split(',').map((s) => s.trim()).filter(Boolean)
  const baseUrl = process.env.EVAL_KANBAN_BASE_URL?.trim()
  const token = process.env.EVAL_KANBAN_TOKEN?.trim()
  const board = process.env.EVAL_KANBAN_BOARD?.trim()
  return {
    runStartedAt: Date.now(),
    ...(roots && roots.length ? { allowedRoots: roots } : {}),
    ...(baseUrl ? { kanban: { baseUrl, ...(token ? { token } : {}), ...(board ? { board } : {}) } } : {}),
  }
}

export function runSummary(run: EvalRun) {
  return {
    id: run.id,
    setId: run.setId,
    ...(run.setHash ? { setHash: run.setHash } : {}),
    ...(run.setRevision !== undefined ? { setRevision: run.setRevision } : {}),
    target: run.target,
    k: run.k,
    status: run.status,
    ...(run.evidenceMode ? { evidenceMode: run.evidenceMode } : {}),
    createdAt: run.createdAt,
    createdBy: run.createdBy,
    note: run.note,
    aggregates: run.aggregates,
  }
}

/** 密封契约：集摘要永不携带题目内容（写端点同样适用）。 */
export function setSummary(set: EvalSet) {
  return {
    id: set.id,
    name: set.name,
    track: set.track,
    module: set.module,
    sealed: true,
    contentHash: set.contentHash,
    revision: set.revision,
    createdAt: set.createdAt,
    taskCount: set.tasks.length,
  }
}

/** 按运行钉住的版本取考卷；历史运行无版本时回落当前集（由指纹门另判）。 */
export function setForRun(run: EvalRun): EvalSet | undefined {
  const current = getSet(run.setId)
  if (!current) return undefined
  if (run.setRevision !== undefined) {
    const frozen = getSetRevision(run.setId, run.setRevision)
    if (frozen) {
      return { ...current, revision: frozen.revision, contentHash: frozen.contentHash, tasks: frozen.tasks }
    }
  }
  return current
}

export function parseStabilityRetest(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined
  const n = Math.floor(raw)
  if (n < 2 || n > 10) return undefined
  return n
}
