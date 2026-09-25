// overlay[zcode] P1：派发让位队列（minimax GOAL-05 让位语义吸收，矩阵 §3.4 P1）。
//
// minimax 语义（§四 P1-5 + queue.dispatcher.ts:35,133-189）：运行中消息队列里
// **用户消息 > 自治目标**——自治派发（squad 编排/列编排等自动触发）遇到用户消息
// 到达时让位（yield：挂起待发项），用户轮空后恢复（drain）。"任务跑着也能继续说话"
// 是工作台对 CLI 的核心体验优势，让位保证用户意图永远插队。
//
// Ycode 形状：每 workspace 一个让位队列（JSON 存储）——
// - origin 两型：user（用户消息）| autonomy（自治派发）；
// - yield 信号：用户消息到达 → 队列内 autonomy 项全部置 yielded；
// - drain 信号：用户轮空（调用方声明）→ yielded 项恢复 pending 顺序出队；
// - 出队语义：pending 项按入队序出队（origin 决定优先：user 先于 autonomy）。
// 执行面（真派发）复用 P3 派单链；本域只管排队/让位/出队顺序——单一职责。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export type QueueOrigin = 'user' | 'autonomy'
export type QueueState = 'pending' | 'yielded' | 'dispatched' | 'cancelled'

export interface QueueItem {
  itemId: string
  workspacePath: string
  origin: QueueOrigin
  /** 派发载荷（透传给 P3 派单链：text 等）。 */
  text: string
  at: number
  state: QueueState
  /** 自治来源标注（squad:<名> / column:<列>），审计用。 */
  source?: string
}

const MAX_QUEUE = 100

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.dq-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function queueDir(): string {
  const env = process.env.HERMES_DISPATCH_QUEUE_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.dispatch-queue')
  return join(homedir(), '.hermes-web-ui', 'dispatch-queue')
}

function queueFile(workspacePath: string): string {
  return join(queueDir(), `${workspacePath.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

export function loadQueue(workspacePath: string): QueueItem[] {
  try {
    const raw = JSON.parse(readFileSync(queueFile(workspacePath), 'utf8'))
    if (Array.isArray(raw)) return raw.filter((i: QueueItem) => i && typeof i.itemId === 'string')
  } catch { /* 坏/无文件 fail-soft */ }
  return []
}

function saveQueue(workspacePath: string, items: QueueItem[]): void {
  mkdirSync(queueDir(), { recursive: true })
  writeFileSync(queueFile(workspacePath), JSON.stringify(items, null, 2))
}

/** 入队（幂等 itemId；环形 100）。 */
export function enqueue(item: QueueItem): { added: boolean; total: number } {
  const items = loadQueue(item.workspacePath)
  if (items.some((i) => i.itemId === item.itemId)) return { added: false, total: items.length }
  items.push(item)
  if (items.length > MAX_QUEUE) items.shift()
  saveQueue(item.workspacePath, items)
  return { added: true, total: items.length }
}

/**
 * 让位信号（GOAL-05）：用户消息到达 → 队列内全部 pending 的 autonomy 项置 yielded。
 * 返回被让位的项数（user 项不动）。
 */
export function yieldToUser(workspacePath: string, at: number = Date.now()): number {
  const items = loadQueue(workspacePath)
  let yielded = 0
  for (const i of items) {
    if (i.origin === 'autonomy' && i.state === 'pending') {
      i.state = 'yielded'
      yielded += 1
    }
  }
  if (yielded) saveQueue(workspacePath, items)
  void at
  return yielded
}

/**
 * 用户轮空恢复（drain 前置）：yielded 项恢复 pending（保持原入队序）。
 */
export function restoreYielded(workspacePath: string): number {
  const items = loadQueue(workspacePath)
  let restored = 0
  for (const i of items) {
    if (i.state === 'yielded') {
      i.state = 'pending'
      restored += 1
    }
  }
  if (restored) saveQueue(workspacePath, items)
  return restored
}

/**
 * 出队（优先级：user 先于 autonomy，同 origin 按入队序）；取出即置 dispatched。
 * 无 pending 返回 null。
 */
export function dequeueNext(workspacePath: string): QueueItem | null {
  const items = loadQueue(workspacePath)
  const pending = items.filter((i) => i.state === 'pending')
  if (!pending.length) return null
  pending.sort((a, b) => (a.origin === b.origin ? a.at - b.at : a.origin === 'user' ? -1 : 1))
  const next = pending[0]
  const inList = items.find((i) => i.itemId === next.itemId)!
  inList.state = 'dispatched'
  saveQueue(workspacePath, items)
  return inList
}

/** 队列视图（pending/yielded 优先，审计用）。 */
export function queueView(workspacePath: string): QueueItem[] {
  return loadQueue(workspacePath).filter((i) => i.state === 'pending' || i.state === 'yielded')
}
