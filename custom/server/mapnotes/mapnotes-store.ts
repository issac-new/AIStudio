// overlay[mapnotes] 业务地图标注存储（挂账清偿批二 C1，2026-10-27）。
//
// 范式来源：JoyAI ONE 协同推演的「在线标注」——画布节点人工修正持久化+实时协同。
// 批三翻批二 D1 降维案：LWW-Register 合并协议（合法 CRDT，收敛性可证）——条目带
// rev（写方 lamport 计数）+by，按 (rev,by) 字典序比较，旧写拒绝返回现存条目，
// 并发写自动合并不丢更新；实时通道=socket.io /mapnotes 房间广播（mapnotes-socket.ts）。
// 形态照抄 ctxnotes（notes-store.ts）：env 重定向+原子写+坏文件诚实空态；
// key=需求指纹（impact 响应下发的 sha1(title+description)）。
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { atomicWriteJson } from '../lib/fs-store'

export interface MapAnnotation {
  /** 画布节点 id（ent-…/spec-…/mod-…/req-center；条目内原样存，文件名只承载 hex 指纹）。 */
  nodeId: string
  /** 人工备注。 */
  note: string
  /** 人工确认勾选（影响面已核/待核的标注位）。 */
  checked: boolean
  by: string
  at: number
  /** 写方 lamport 计数（批三 LWW）：每写+1；同 nodeId 按 (rev,by) 全序比较取胜者。 */
  rev: number
}

/** (rev,by) 全序比较：rev 主序，同 rev 以 by 字典序破平——LWW-Register 的比较器。 */
function lwwWins(candidate: MapAnnotation, existing: MapAnnotation): boolean {
  if (candidate.rev !== existing.rev) return candidate.rev > existing.rev
  return candidate.by > existing.by
}

export interface MapAnnotationsFile {
  key: string
  annotations: MapAnnotation[]
}

const KEY_RE = /^[a-f0-9]{6,64}$/

function mapNotesDir(): string {
  const env = process.env.MAP_NOTES_DIR?.trim()
  if (env) return env
  return join(homedir(), '.hermes-web-ui', 'overlay', 'map-notes')
}

/** 指纹 key 净化（sha1 hex 白名单——非十六进制直接拒，防路径穿越）。 */
function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error('key 非法（须为 sha1 十六进制指纹）')
}

function fileOf(key: string): string {
  return join(mapNotesDir(), `${key}.json`)
}

function readAnnotationsFile(key: string): MapAnnotationsFile {
  try {
    const raw = JSON.parse(readFileSync(fileOf(key), 'utf8')) as Partial<MapAnnotationsFile>
    return {
      key,
      annotations: Array.isArray(raw.annotations)
        ? raw.annotations.filter((a) => a && typeof a.nodeId === 'string' && typeof a.note === 'string' && typeof a.checked === 'boolean'
            && typeof a.by === 'string' && typeof a.at === 'number')
        : [],
    }
  } catch {
    // 首装无文件/坏文件=诚实空态（不猜数）
    return { key, annotations: [] }
  }
}

/** tmp+rename 原子写（ctxnotes writeNotesFile 同款）。 */
function writeAnnotationsFile(file: MapAnnotationsFile): void {
  const dir = mapNotesDir()
  mkdirSync(dir, { recursive: true })
  const target = fileOf(file.key)
  atomicWriteJson(target, file)
}

export function listAnnotations(key: string): MapAnnotation[] {
  assertKey(key)
  return readAnnotationsFile(key).annotations
}

export interface UpsertOutcome {
  annotation: MapAnnotation
  /** true=本写胜出已落盘；false=旧写被 LWW 拒绝（annotation=现存条目，调用方如实回显）。 */
  applied: boolean
}

/** upsert 单节点标注（LWW-Register：同 nodeId 按 (rev,by) 全序比较；旧写拒绝）。 */
export function upsertAnnotation(key: string, input: Omit<MapAnnotation, 'at' | 'rev'> & { at?: number; rev?: number }): UpsertOutcome {
  assertKey(key)
  const file = readAnnotationsFile(key)
  const entry: MapAnnotation = {
    nodeId: input.nodeId.slice(0, 200),
    note: input.note.slice(0, 4000),
    checked: input.checked,
    by: (input.by || 'anonymous').slice(0, 64),
    at: input.at ?? Date.now(),
    rev: input.rev ?? 1,
  }
  const idx = file.annotations.findIndex((a) => a.nodeId === entry.nodeId)
  if (idx >= 0) {
    const existing = file.annotations[idx]
    if (!lwwWins(entry, existing)) return { annotation: existing, applied: false }
    file.annotations[idx] = entry
  } else {
    file.annotations.push(entry)
  }
  writeAnnotationsFile(file)
  return { annotation: entry, applied: true }
}

export function deleteAnnotation(key: string, nodeId: string): boolean {
  assertKey(key)
  const file = readAnnotationsFile(key)
  const before = file.annotations.length
  file.annotations = file.annotations.filter((a) => a.nodeId !== nodeId)
  if (file.annotations.length === before) return false
  writeAnnotationsFile(file)
  return true
}

/** 存量指纹清单（走查/治理读数用；目录缺席空清单）。 */
export function listKeys(): string[] {
  try {
    return readdirSync(mapNotesDir())
      .map((f) => f.replace(/\.json$/, ''))
      .filter((k) => KEY_RE.test(k))
  } catch { return [] }
}

export function hasAnnotationsFile(key: string): boolean {
  assertKey(key)
  return existsSync(fileOf(key))
}
