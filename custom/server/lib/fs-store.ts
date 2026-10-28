// custom/server/lib/fs-store.ts
// 原子写与 JSONL 读写的共享实现（2026-10-28 对账轮 K15 收敛）。
// 背景：custom/server 内 `writeJsonAtomic`/`writeAtomic` 有 9 份独立实现、
// tmp+rename 约 40 处，差异只在 fsync、坏档隔离、随机 tmp 名与缩进——行为已分叉。
// 本模块定义唯一语义：
//   - atomicWriteJson：mkdir -p → 同目录随机 tmp → 写入 → （可选）fsync → rename
//   - readJsonl：坏行跳过并计数（不抛，调用方据 skipped 决定是否告警）
//   - appendJsonl：mkdir -p → 追加一行（带换行），不做 fsync（调用方可自行 flush）
// 需要「落盘持久性」的台账（如 trust）显式传 fsync: true。
import { createHash } from 'node:crypto'
import { appendFileSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface AtomicWriteOptions {
  /** 落盘持久化（fsync）；台账类写入建议 true，缓存类可省 */
  fsync?: boolean
  /** JSON 缩进，默认 2 */
  indent?: number
}

/** 原子写文本：同目录随机 tmp → （可选）fsync → rename，失败清理 tmp */
export function atomicWriteText(file: string, text: string, opts: AtomicWriteOptions = {}): void {
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  const tag = createHash('sha1').update(`${process.pid}:${Date.now()}:${Math.random()}`).digest('hex').slice(0, 12)
  const tmp = join(dir, `.${process.pid}-${tag}.tmp`)
  try {
    const fd = openSync(tmp, 'w')
    try {
      writeSync(fd, text)
      if (opts.fsync) fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, file)
  } catch (e) {
    if (existsSync(tmp)) { try { rmSync(tmp) } catch { /* tmp 清理失败不掩盖原错 */ } }
    throw e
  }
}

/** 原子写 JSON：序列化后走 atomicWriteText */
export function atomicWriteJson(file: string, value: unknown, opts: AtomicWriteOptions = {}): void {
  atomicWriteText(file, JSON.stringify(value, null, opts.indent ?? 2), opts)
}

export interface JsonlReadResult<T> {
  rows: T[]
  /** 无法解析的行数（调用方据此披露坏档，不静默吞掉） */
  skipped: number
  /** 文件不存在时 true（行空、skipped 0） */
  missing: boolean
}

/** 读 JSONL：坏行跳过并计数；文件缺失返回 missing=true 而不是抛错 */
export function readJsonl<T = unknown>(file: string): JsonlReadResult<T> {
  if (!existsSync(file)) return { rows: [], skipped: 0, missing: true }
  const text = readFileSync(file, 'utf8')
  const rows: T[] = []
  let skipped = 0
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try { rows.push(JSON.parse(t) as T) } catch { skipped++ }
  }
  return { rows, skipped, missing: false }
}

/** 追加一行 JSONL（自动补换行）；目录不存在则创建 */
export function appendJsonl(file: string, row: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  appendFileSync(file, `${JSON.stringify(row)}\n`)
}
