/**
 * IDE run 逐文件 Undo（UI 融合 UI-5，codex-product 任务结果卡"逐文件 Undo"落地）。
 *
 * POST /api/ide/run-undo  { sessionId, changeId, fileId, workspace }
 *   → workspace_run_change_files 行的 patch 反向应用（git apply -R --recount）
 *   → 该文件恢复到本轮 run 前内容；added 反向=删除、deleted 反向=重建。
 * 挂载：patch 482（bootstrap/routes.ts 两行，477 同款）。
 * 数据：node:sqlite 直连 studio db（注入态相对 __dirname 四级到 data/；
 *       RUN_UNDO_DB 可覆盖——守门注入临时库）。patch 只来自库内记录。
 */
import Router from '@koa/router'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, isAbsolute, resolve } from 'path'


/** studio db 多候选探测：symlink/物理两种 __dirname 形态 + cwd 兜底（真进程修复）。 */
function resolveStudioDb(): string {
  const env = process.env.RUN_UNDO_DB?.trim()
  if (env) return resolve(env)
  const candidates = [
    // serve 子进程 cwd 恒=hermes-studio 根（serve-server.mjs spawn cwd）——最可靠锚。
    resolve(process.cwd(), 'packages/server/data/hermes-web-ui.db'),
    resolve(__dirname, '../../../../data/hermes-web-ui.db'),
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

const router = new Router({ prefix: '/api/ide' })

interface FileRow {
  path: string
  old_path: string | null
  change_type: string
  patch: string | null
}

/** 将 unified diff 按 @@ 头切为 hunk 序列，只保留选中序号的 hunk（文件头行恒保留）。
 *  序号约定与客户端 IdeInlineDiff parseHunks 一致：按 @@ 出现次序 0 起计。 */
export function filterPatchHunks(patch: string, keep: ReadonlySet<number>): string {
  const lines = patch.split('\n')
  const header: string[] = []
  const hunks: string[][] = []
  let cur: string[] | null = null
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (cur) hunks.push(cur)
      cur = [line]
    } else if (cur) {
      cur.push(line)
    } else {
      header.push(line)
    }
  }
  if (cur) hunks.push(cur)
  const picked = hunks.filter((_, i) => keep.has(i))
  if (!picked.length) return ''
  // 末 hunk 吸收的文件尾空行在无选中时不应带出；逐 hunk 去尾部空行后重组。
  const body = picked.flatMap((h) => {
    const copy = [...h]
    while (copy.length > 1 && copy[copy.length - 1] === '') copy.pop()
    return copy
  })
  return [...header.filter((l) => l !== ''), ...body, ''].join('\n')
}

function openDb(): { query: (sql: string, args: unknown[]) => Array<Record<string, unknown>> } | null {
  const dbPath = resolveStudioDb()
  if (!existsSync(dbPath)) return null
  // 惰性 require：守门环境无 node:sqlite 时降级为不可用（503）。
  let DatabaseSync: new (path: string, opts?: unknown) => { prepare: (sql: string) => { all: (...a: unknown[]) => Array<Record<string, unknown>> } }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('node:sqlite')
    DatabaseSync = mod.DatabaseSync
  } catch {
    return null
  }
  const db = new DatabaseSync(dbPath, { readOnly: true })
  return {
    query: (sql, args) => db.prepare(sql).all(...args) as Array<Record<string, unknown>>,
  }
}

router.post('/run-undo', (ctx) => {
  const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
  const sessionId = String(body.sessionId ?? '')
  const changeId = String(body.changeId ?? '')
  const fileId = Number(body.fileId)
  const workspace = String(body.workspace ?? '')
  if (!sessionId || !changeId || !Number.isFinite(fileId) || fileId <= 0) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'sessionId/changeId/fileId 必填' }
    return
  }
  if (!isAbsolute(workspace) || !existsSync(workspace)) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'workspace 须为存在的绝对路径' }
    return
  }
  const db = openDb()
  if (!db) {
    ctx.status = 503
    ctx.body = { ok: false, detail: 'undo 数据面不可用（db 缺失或 node:sqlite 不可用）' }
    return
  }
  const rows = db.query(
    'SELECT path, old_path, change_type, patch FROM workspace_run_change_files WHERE session_id = ? AND change_id = ? AND id = ?',
    [sessionId, changeId, fileId],
  )
  const row = rows[0] as unknown as FileRow | undefined
  if (!row) {
    ctx.status = 404
    ctx.body = { ok: false, detail: 'change file 行不存在' }
    return
  }
  if (row.patch === null) {
    ctx.status = 422
    ctx.body = { ok: false, detail: '该文件无 patch（二进制/截断），不可 undo' }
    return
  }
  // 可选 hunkIndexes：只反向应用选中 hunk（IdeInlineDiff 逐处拒绝的写通道）。
  let patchText = row.patch
  let hunkMode = false
  if (body.hunkIndexes !== undefined) {
    const raw = body.hunkIndexes
    if (!Array.isArray(raw) || raw.length === 0 || !raw.every((n) => Number.isInteger(n) && (n as number) >= 0)) {
      ctx.status = 400
      ctx.body = { ok: false, detail: 'hunkIndexes 须为非空非负整数数组' }
      return
    }
    patchText = filterPatchHunks(row.patch, new Set(raw as number[]))
    if (!patchText) {
      ctx.status = 422
      ctx.body = { ok: false, detail: '选中 hunk 序号越界（patch 无对应 hunk）' }
      return
    }
    hunkMode = true
  }
  const dir = mkdtempSync(join(tmpdir(), 'run-undo-'))
  try {
    const patchFile = join(dir, 'undo.patch')
    writeFileSync(patchFile, patchText, 'utf8')
    // hunk 模式容忍零上下文 patch（git 默认拒零上下文，需 --unidiff-zero 显式放行）
    const args = ['apply', '-R', '--recount', ...(hunkMode ? ['--unidiff-zero'] : []), '-p1', patchFile]
    execFileSync('git', args, { cwd: workspace })
    ctx.body = { ok: true, restoredPath: row.path, changeType: row.change_type }
  } catch (err) {
    ctx.status = 422
    ctx.body = {
      ok: false,
      detail: `反向应用失败（文件可能已被后续修改）：${err instanceof Error ? err.message.slice(0, 300) : String(err)}`,
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

export default router
