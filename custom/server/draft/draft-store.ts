// overlay/draft 域：草稿恢复（minimax §六 C 表 P2 吸收，矩阵 §3.4 P2）。
//
// minimax 语义（草稿恢复 2MiB 原子写+粘贴附件）：输入框草稿防丢——
// - **2MiB 上限**：超限拒存（草稿不是文档库）；
// - **原子写**：临时文件+rename（崩溃不留半稿）；
// - **恢复**：按 (workspace,slot) 取回草稿（会话/输入框两槽）。
// 粘贴附件本版不落（附件走 evidence/media 域，职责分界）。
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, rmSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

const MAX_DRAFT_BYTES = 2 * 1024 * 1024

export interface DraftRecord {
  workspacePath: string
  slot: string
  text: string
  savedAt: number
}

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.draft-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function draftDir(): string {
  const env = process.env.HERMES_DRAFT_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.draft')
  return join(homedir(), '.hermes-web-ui', 'draft')
}

function draftFile(workspacePath: string, slot: string): string {
  const key = `${workspacePath}::${slot}`.replace(/[^A-Za-z0-9._-]/g, '_')
  return join(draftDir(), `${key}.json`)
}

/** 存草稿（2MiB 上限拒存；原子写=临时+rename，崩溃不留半稿）。 */
export function saveDraft(workspacePath: string, slot: string, text: string): { ok: boolean; reason?: string } {
  const bytes = Buffer.byteLength(text, 'utf8')
  if (bytes > MAX_DRAFT_BYTES) {
    return { ok: false, reason: `草稿超 2MiB 上限（${bytes} 字节）——草稿不是文档库` }
  }
  const dir = draftDir()
  const target = draftFile(workspacePath, slot)
  const tmp = `${target}.tmp-${process.pid}`
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(tmp, JSON.stringify({ workspacePath, slot, text, savedAt: Date.now() }), 'utf8')
    renameSync(tmp, target)  // 原子替换
    return { ok: true }
  } catch (err) {
    try { rmSync(tmp, { force: true }) } catch { /* 清理失败忽略 */ }
    return { ok: false, reason: `落盘失败：${err instanceof Error ? err.message : String(err)}` }
  }
}

/** 恢复草稿（无草稿=null；坏文件=null fail-soft）。 */
export function loadDraft(workspacePath: string, slot: string): DraftRecord | null {
  try {
    const raw = JSON.parse(readFileSync(draftFile(workspacePath, slot), 'utf8'))
    if (raw && typeof raw.text === 'string') return raw as DraftRecord
  } catch { /* 坏/无文件 */ }
  return null
}

/** 清草稿（发送后调用）。 */
export function clearDraft(workspacePath: string, slot: string): boolean {
  try {
    unlinkSync(draftFile(workspacePath, slot))
    return true
  } catch {
    return false
  }
}
