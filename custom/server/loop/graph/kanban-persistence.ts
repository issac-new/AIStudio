// overlay/custom/server/loop/graph/kanban-persistence.ts
// P2 Task 4 — persistence 真实 kanban 写入：替换 P1 的 stub adapter（`artifact:<id>` 占位）。
//
// 设计约束：
// - DI：kanbanCli（modules/hermes/services/kanban/kanban-service）经构造函数注入——本模块
//   沿用 graph 装配层"不 import 上游代码"的 factory-DI 约束（patch 202 在上游树注入真实模块）。
//   唯一的 `typeof import(...)` 只出现在类型位（编译期擦除，vitest/运行时零解析）。
// - dryRun 语义不变（shadow 双跑护栏）：节点层短路不调 persist；适配器再兜一层，零 CLI 调用。
// - 幂等：按 title `[${loop.name}] ${contract.id}` 在目标 board 查重，重复 persist 跳过 + warn。
// - 失败不炸 run：kanban CLI 可预期失败捕获为 { ok:false, error } 返回，persistence 节点发
//   loop.persist-failed + repairQueue 走既有守卫回边；查重/解析失败同样收敛为失败结果。
// - boardResolver 默认实现：loop.tenant 六段格式（<群聊名称>:<话题摘要>:<user_id>:<roomId>:
//   <sessionId>:matrix，与 client/kanban/utils/tenant-parser 的六段格式服务端等价）解析 board。

import type { LoopInstance, TaskContract, VerificationRecord } from '../types'
import type { PersistenceAdapter, PersistFailure } from './phase-nodes'

/** kanban-service 模块类型（类型位引用，运行时零 import——路径自注入后的
 *  packages/server/src/custom/loop/graph/ 出发） */
export type KanbanServiceModule = typeof import('../../../modules/hermes/services/kanban/kanban-service')

/** 与 upstream kanban-service normalizeBoardSlug 同规则（双处定义，各自守门测试断言） */
const BOARD_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

export interface KanbanPersistenceDeps {
  kanban: KanbanServiceModule
  /** loop → kanban board slug；null = 解析不出（persist 跳过并 warn） */
  boardResolver: (loop: LoopInstance) => string | null
  log?: (msg: string) => void
}

/** loop.tenant 防御读取：LoopInstance 尚无类型化 tenant 字段（matrix 来源的 loop 后续补齐），
 *  非字符串/空白归一为 null */
export function readLoopTenant(loop: LoopInstance): string | null {
  const raw = (loop as unknown as { tenant?: unknown }).tenant
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  return trimmed ? trimmed : null
}

function slugify(raw: string): string | null {
  const slug = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!BOARD_SLUG_RE.test(slug)) return null
  // 纯数字/符号残段（如 '跨团队协作群01'→'01'）无辨识度且多群必撞名，视同解析不出
  if (!/[a-z]/.test(slug)) return null
  return slug
}

/** 默认 boardResolver：六段 tenant 的群聊名（第 1 段）slug 化为 board——群聊即团队空间，
 *  与 cockpit 按群聊名分桶/团队=board 集合的建模一致；纯中文等 slug 化后无字母残段时回落
 *  roomId（第 4 段，去 '!' 前缀，房间 id 稳定唯一）。旧格式（matrix 前缀）或不足六段 → null。 */
export function defaultKanbanBoardResolver(loop: LoopInstance): string | null {
  const raw = readLoopTenant(loop)
  if (!raw) return null
  const parts = raw.split(':')
  // 与 client tenant-parser isLegacy 同语义：首段 'matrix' 或不足六段 = 旧格式，解析不出
  if (parts.length < 6 || parts[0] === 'matrix') return null
  return slugify(parts[0]) ?? slugify((parts[3] ?? '').replace(/^!/, ''))
}

/** 产物摘要 body：verification 结果 + 产物元信息（title 已带 loop/contract，body 补可追溯细节） */
function buildBody(contract: TaskContract, verification: VerificationRecord, loop: LoopInstance): string {
  const prog = verification.results.programmatic
  const passed = prog.filter(p => p.passed).length
  const judge = verification.results.judge
  const lines = [
    '[graph-engine] loop run artifact',
    `- loop: ${loop.id} (${loop.name})`,
    `- contract: ${contract.id} — ${contract.source.type} ${contract.source.ref}`,
    `- summary: ${contract.source.summary}`,
    `- artifact: ${contract.resultTemplate.artifactType}`,
    `- verification: ${verification.overall} (programmatic ${passed}/${prog.length} passed)`,
  ]
  if (judge) lines.push(`- judge: ${judge.status ?? (judge.passed === false ? 'failed' : 'passed')}`)
  lines.push(`- worktree: ${contract.worktreeId ?? '-'}`)
  return lines.join('\n')
}

/** P1 stub（`artifact:<id>` 占位）的真实替换：产物落 kanban 看板。
 *  author 语义：kanban-service createTask 无 author 参数，产物摘要 body 以 '[graph-engine]'
 *  头行留痕（see buildBody）；assignee 不设（看板 assignee 是 worker profile，乱指会被
 *  dispatch 误取），租户归属经 `--tenant` 透传供 cockpit 溯源。 */
export class KanbanPersistenceAdapter implements PersistenceAdapter {
  private readonly log: (msg: string) => void

  constructor(private readonly deps: KanbanPersistenceDeps) {
    this.log = deps.log ?? (() => {})
  }

  async persist(
    contract: TaskContract,
    verification: VerificationRecord,
    loop: LoopInstance,
    dryRun: boolean,
  ): Promise<string | PersistFailure> {
    const title = `[${loop.name}] ${contract.id}`

    if (dryRun) {
      // 双跑护栏：shadow 对齐 discovery/handoff 的 dryrun: 前缀标记，零真实写入
      this.log(`[dry-run] persistence skipped: kanban write for ${contract.id}`)
      return `dryrun:${contract.id}`
    }

    let board: string | null = null
    try {
      board = this.deps.boardResolver(loop)
    } catch (err) {
      this.log(`boardResolver threw for ${contract.id} (non-blocking): ${err instanceof Error ? err.message : err}`)
      board = null
    }
    if (!board) {
      this.log(`persistence skipped for ${contract.id}: no kanban board resolved from loop ${loop.id} tenant`)
      return { ok: false, error: `no kanban board resolved for contract ${contract.id} (loop ${loop.id})` }
    }

    try {
      // 幂等查重：repair 回边/重跑会对同一契约再次 persist，按 title 精确匹配既有任务即跳过
      const existing = await this.deps.kanban.listTasks({ board })
      const duplicate = (existing ?? []).find(t => t.title === title)
      if (duplicate) {
        this.log(`persistence duplicate skipped for ${contract.id}: kanban task ${duplicate.id} already exists on '${board}'`)
        return `kanban:${duplicate.id}`
      }
      const task = await this.deps.kanban.createTask(title, {
        board,
        body: buildBody(contract, verification, loop),
        tenant: readLoopTenant(loop) ?? undefined,
      })
      this.log(`persistence wrote kanban task ${task.id} for ${contract.id} on '${board}'`)
      return `kanban:${task.id}`
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      this.log(`persistence failed for ${contract.id} on '${board}': ${error}`)
      return { ok: false, error: `kanban write failed for ${contract.id}: ${error}` }
    }
  }
}
