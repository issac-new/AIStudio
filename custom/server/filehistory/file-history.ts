// overlay/filehistory 域：回合级双相快照（kimi §四 P2-7 吸收，矩阵 §3.3 P2）。
//
// kimi 语义（fileHistory 回合级 checkpoint 双相快照）：agent 每回合对工作区文件的
// 改动有**双相记录**（before/after）——改坏了可回读单文件/整回合。衔接 #5 恢复域
// （checkpoint-options 四恢复选项）：file-history 是逐文件粒度的恢复数据面。
// 存储：每回合一份 JSON（taskId+turnIndex 双键），HERMES_FILE_HISTORY_DIR 降级同款。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, rmSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export interface FileSnapshot {
  path: string
  /** before 相：回合前内容（改前）；after 相：回合后内容。 */
  before: string | null
  after: string | null
}

export interface TurnSnapshot {
  taskId: string
  turnIndex: number
  at: number
  files: FileSnapshot[]
}

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.fh-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function historyDir(): string {
  const env = process.env.HERMES_FILE_HISTORY_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.file-history')
  return join(homedir(), '.hermes-web-ui', 'file-history')
}

function snapFile(taskId: string, turnIndex: number): string {
  return join(historyDir(), `${taskId.replace(/[^A-Za-z0-9._-]/g, '_')}-t${turnIndex}.json`)
}

/** 落双相快照（幂等 turnIndex 覆盖重落=重跑回合）。 */
export function saveTurnSnapshot(snap: TurnSnapshot): { ok: boolean } {
  try {
    mkdirSync(historyDir(), { recursive: true })
    writeFileSync(snapFile(snap.taskId, snap.turnIndex), JSON.stringify(snap, null, 2))
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

export function loadTurnSnapshot(taskId: string, turnIndex: number): TurnSnapshot | null {
  try {
    const raw = JSON.parse(readFileSync(snapFile(taskId, turnIndex), 'utf8'))
    if (raw && Array.isArray(raw.files)) return raw as TurnSnapshot
  } catch { /* 坏/无文件 */ }
  return null
}

/** 单文件回读（改坏兜底）：取该回合该文件的 before 相（改前状态）。 */
export function restoreFileBefore(taskId: string, turnIndex: number, path: string): string | null {
  const snap = loadTurnSnapshot(taskId, turnIndex)
  const f = snap?.files.find((x) => x.path === path)
  return f ? f.before : null
}

/** 整回合 diff 统计（改动面速览：新增/修改/删除）。 */
export function turnDiffStats(snap: TurnSnapshot): { added: number; modified: number; deleted: number } {
  let added = 0, modified = 0, deleted = 0
  for (const f of snap.files) {
    if (f.before === null && f.after !== null) added += 1
    else if (f.before !== null && f.after === null) deleted += 1
    else modified += 1
  }
  return { added, modified, deleted }
}
