// overlay/custom/server/filehistory/replay-theater.ts
// P5 编辑时间轴回放（2026-10-04 九源轮）。出处：Claude Code Mods 官方
// Replay Theater——"记录这一轮的文件修改，让你按顺序查看：第一步改了哪里，
// 原来是什么，现在变成了什么"。数据面=本仓 filehistory 双相快照
//（kimi 回合级 before/after，已落盘），本域做时间轴投影：
//   轮列表（时间+文件数+增删账）× 选中轮的逐文件 before/after 对照
//   （公共前后缀行裁剪，中段 -旧行/+新行——朴素 diff，不冒充逐 hunk 合并 diff）。
// 纯投影无 IO；快照列举由 listTurnSnapshots（file-history.ts 补）提供。
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { historyDir, type TurnSnapshot } from './file-history'

export interface ReplayFileView {
  path: string
  /** before/after 任一侧缺席（新增/删除文件） */
  kind: 'added' | 'removed' | 'changed'
  addedLines: number
  deletedLines: number
  /** 公共前缀行数（裁剪展示用） */
  contextBefore: number
  /** 公共后缀行数 */
  contextAfter: number
  /** 中段旧行（红）与新行（绿） */
  beforeExcerpt: string[]
  afterExcerpt: string[]
}

export interface ReplayStep {
  turnIndex: number
  at: number
  files: ReplayFileView[]
  totalAdded: number
  totalDeleted: number
}

export interface ReplayTimeline {
  taskId: string
  steps: ReplayStep[]
  meta: { note: string }
}

const splitLines = (s: string): string[] => (s === '' ? [] : s.split('\n'))

/** 朴素行对照：剥公共前后缀，中段算增删账并截取摘要（≤60 行/侧）。 */
export function projectFile(path: string, before: string | null, after: string | null): ReplayFileView {
  if (before === null && after === null) {
    return { path, kind: 'changed', addedLines: 0, deletedLines: 0, contextBefore: 0, contextAfter: 0, beforeExcerpt: [], afterExcerpt: [] }
  }
  if (before === null) {
    const lines = splitLines(after ?? '')
    return { path, kind: 'added', addedLines: lines.length, deletedLines: 0, contextBefore: 0, contextAfter: 0, beforeExcerpt: [], afterExcerpt: lines.slice(0, 60) }
  }
  if (after === null) {
    const lines = splitLines(before)
    return { path, kind: 'removed', addedLines: 0, deletedLines: lines.length, contextBefore: 0, contextAfter: 0, beforeExcerpt: lines.slice(0, 60), afterExcerpt: [] }
  }
  const a = splitLines(before)
  const b = splitLines(after)
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre += 1
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf += 1
  const oldMid = a.slice(pre, a.length - suf)
  const newMid = b.slice(pre, b.length - suf)
  return {
    path,
    kind: pre === a.length && suf === 0 && newMid.length === 0 ? 'changed' : oldMid.length === 0 && newMid.length === 0 ? 'changed' : 'changed',
    addedLines: newMid.length,
    deletedLines: oldMid.length,
    contextBefore: pre,
    contextAfter: suf,
    beforeExcerpt: oldMid.slice(0, 60),
    afterExcerpt: newMid.slice(0, 60),
  }
}

/** 快照列表 → 时间轴投影（轮序=turnIndex 升序；无快照=空 steps，如实）。 */
export function buildReplayTimeline(taskId: string, snaps: TurnSnapshot[]): ReplayTimeline {
  const steps = snaps
    .filter((s) => s && Array.isArray(s.files))
    .sort((x, y) => x.turnIndex - y.turnIndex)
    .map((s) => {
      const files = s.files.map((f) => projectFile(f.path, f.before, f.after))
      return {
        turnIndex: s.turnIndex,
        at: s.at,
        files,
        totalAdded: files.reduce((n, f) => n + f.addedLines, 0),
        totalDeleted: files.reduce((n, f) => n + f.deletedLines, 0),
      }
    })
  return {
    taskId,
    steps,
    meta: { note: '逐轮 before/after 对照（公共前后缀裁剪 + 中段增删）；朴素行对照，非逐 hunk 合并 diff。' },
  }
}

/** 枚举某 taskId 的回合快照（文件名 `<safeTaskId>-t<N>.json`；坏档跳过）。 */
export function listTurnSnapshots(taskId: string): TurnSnapshot[] {
  const safe = taskId.replace(/[^A-Za-z0-9._-]/g, '_')
  const dir = historyDir()
  const out: TurnSnapshot[] = []
  try {
    for (const name of readdirSync(dir)) {
      const m = new RegExp(`^${safe.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}-t(\\d+)\\.json$`).exec(name)
      if (!m) continue
      try {
        const snap = JSON.parse(readFileSync(join(dir, name), 'utf8')) as TurnSnapshot
        if (snap && typeof snap.turnIndex === 'number') out.push(snap)
      } catch { /* 坏档跳过 */ }
    }
  } catch { /* 目录缺席=空 */ }
  return out.sort((a, b) => a.turnIndex - b.turnIndex)
}
