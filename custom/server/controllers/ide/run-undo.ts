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

const router = new Router({ prefix: '/api/ide' })

interface FileRow {
  path: string
  old_path: string | null
  change_type: string
  patch: string | null
}

function openDb(): { query: (sql: string, args: unknown[]) => Array<Record<string, unknown>> } | null {
  const dbPath = process.env.RUN_UNDO_DB?.trim()
    ? resolve(process.env.RUN_UNDO_DB)
    : resolve(__dirname, '../../../../data/hermes-web-ui.db')
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
  const dir = mkdtempSync(join(tmpdir(), 'run-undo-'))
  try {
    const patchFile = join(dir, 'undo.patch')
    writeFileSync(patchFile, row.patch, 'utf8')
    execFileSync('git', ['apply', '-R', '--recount', '-p1', patchFile], { cwd: workspace })
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

// ── 视频抽帧 REST（层 2 消费面；videoref 域同文件挂载省一个 patch）──
router.post('/video-frames', async (ctx) => {
  const body = (ctx.request as { body?: Record<string, unknown> }).body ?? {}
  const videoPath = String(body.videoPath ?? '')
  const frames = Number(body.frames ?? 8)
  const widthPx = Number(body.widthPx ?? 1280)
  if (!videoPath || !Number.isFinite(frames) || frames <= 0 || frames > 32) {
    ctx.status = 400
    ctx.body = { ok: false, detail: 'videoPath 必填；frames 1-32' }
    return
  }
  const { existsSync: exists } = await import('fs')
  if (!exists(videoPath)) {
    ctx.status = 404
    ctx.body = { ok: false, detail: '视频文件不存在' }
    return
  }
  try {
    const { extractFramesBase64 } = await import('../../videoref/frame-extract')
    const out = await extractFramesBase64(videoPath, { frames, widthPx })
    ctx.body = { ok: true, count: out.length, frames: out }
  } catch (err) {
    ctx.status = 422
    ctx.body = { ok: false, detail: err instanceof Error ? err.message.slice(0, 300) : String(err) }
  }
})
