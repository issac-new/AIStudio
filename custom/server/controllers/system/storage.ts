/**
 * IDE Storage API controller（/api/ide/storage/*）——资源管理器。
 *
 * 对标 ZCode 3.12.3 resourceManager(65 键)（spec §三.2，M2）：
 * 磁盘占用分类扫描 / 安全分类清理 / 在文件管理器中显示。
 * 数据面 = 本机 ~/.hermes 目录（SwarmStudio 运行时数据根）。
 *
 * 挂载：B 类 patch（series 312）在 packages/server/src/bootstrap/routes.ts
 * `app.use(ideStorageRoutes.routes())`，与 ide/git 同款模式。
 *
 * 安全约束：
 *  - 分类目录为固定白名单常量，客户端只传 category key（拒绝任意路径）；
 *  - clean 仅对 cleanable=true 的分类执行（会话库/运行时等只读展示）；
 *  - reveal 经 spawn 固定参数（open/xdg-open），零 shell 拼接。
 *
 * 性能（2026-09-23 修复）：目录遍历全部走 fs.promises 异步——此前 readdirSync/
 * statSync 在请求路径上同步扫描 ~/.hermes/hermes-agent（数万文件的 agent
 * 运行时）会阻塞整个 Koa 事件循环数秒，聊天流/SSE 全部停摆。快照另加 30s
 * TTL 缓存：面板重复打开不再重扫。
 */
import Router from '@koa/router'
import { spawn } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { readdir, stat, rm } from 'fs/promises'

/** 分类定义（对标 zcode resourceManager.storage.category 11 类的本地子集） */
const CATEGORIES: Array<{
  key: string
  dir: string
  cleanable: boolean
  hint: string
}> = [
  { key: 'logs', dir: join(homedir(), '.hermes', 'logs'), cleanable: true, hint: '日志与运行记录' },
  { key: 'backups', dir: join(homedir(), '.hermes', 'backups'), cleanable: true, hint: '备份' },
  { key: 'backup', dir: join(homedir(), '.hermes', 'backup'), cleanable: true, hint: '备份（旧目录）' },
  { key: 'trash', dir: join(homedir(), '.hermes', '_trash_20260829_entity_resolution'), cleanable: true, hint: '历史清理暂存' },
  { key: 'audioCache', dir: join(homedir(), '.hermes', 'audio_cache'), cleanable: true, hint: '语音缓存' },
  { key: 'cache', dir: join(homedir(), '.hermes', 'cache'), cleanable: true, hint: '通用缓存' },
  { key: 'sessionStore', dir: join(homedir(), '.hermes', 'db'), cleanable: false, hint: '会话数据库（只读展示）' },
  { key: 'runtimes', dir: join(homedir(), '.hermes', 'hermes-agent'), cleanable: false, hint: 'Agent 运行时（只读展示）' },
  { key: 'assets', dir: join(homedir(), '.hermes', 'assets'), cleanable: false, hint: '静态资产（只读展示）' },
]

/** 单分类扫描的文件数软上限：异常巨大的树（坏挂载/符号环）不至于拖死扫描 */
const SCAN_FILE_LIMIT = 1_000_000
const SNAPSHOT_TTL_MS = 30_000

interface ScanResult {
  bytes: number
  files: number
  exists: boolean
}

/** 异步递归扫描：返回 [字节数, 文件数]；目录不存在返回 exists=false */
async function scanDir(dir: string): Promise<ScanResult> {
  const result: ScanResult = { bytes: 0, files: 0, exists: true }
  const stack: string[] = [dir]
  while (stack.length) {
    const current = stack.pop()!
    let names: string[]
    try {
      names = await readdir(current)
    } catch {
      if (current === dir) return { bytes: 0, files: 0, exists: false }
      continue // 权限或并发删除，跳过
    }
    for (const name of names) {
      if (result.files > SCAN_FILE_LIMIT) return result
      const p = join(current, name)
      try {
        const st = await stat(p)
        if (st.isFile()) {
          result.bytes += st.size
          result.files++
        } else if (st.isDirectory()) {
          stack.push(p)
        }
      } catch { /* 权限或并发删除，跳过 */ }
    }
  }
  return result
}

let snapshotCache: { at: number; body: unknown } | null = null

const router = new Router({ prefix: '/api/ide/storage' })

router.get('/snapshot', async (ctx: any) => {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
    ctx.body = snapshotCache.body
    return
  }
  // 9 分类并行扫描（每分类内部串行栈遍历）：异步 IO 不阻塞事件循环
  const scanned = await Promise.all(
    CATEGORIES.map(async (c) => {
      const r = await scanDir(c.dir)
      return {
        key: c.key,
        path: c.dir,
        cleanable: c.cleanable,
        hint: c.hint,
        exists: r.exists,
        bytes: r.exists ? r.bytes : 0,
        files: r.exists ? r.files : 0,
      }
    }),
  )
  const body = {
    categories: scanned,
    totalBytes: scanned.reduce((sum, c) => sum + c.bytes, 0),
  }
  snapshotCache = { at: Date.now(), body }
  ctx.body = body
})

router.post('/clean', async (ctx: any) => {
  const { category } = ctx.request?.body || {}
  const cat = CATEGORIES.find(c => c.key === category)
  if (!cat) {
    ctx.status = 400
    ctx.body = { error: 'unknown_category' }
    return
  }
  if (!cat.cleanable) {
    ctx.status = 403
    ctx.body = { error: 'category_not_cleanable' }
    return
  }
  try {
    const before = await scanDir(cat.dir)
    if (!before.exists) {
      ctx.body = { ok: true, freedBytes: 0 }
      return
    }
    await rm(cat.dir, { recursive: true, force: true })
    snapshotCache = null // 清理后失效快照缓存
    ctx.body = { ok: true, freedBytes: before.bytes }
  } catch (err: unknown) {
    ctx.status = 500
    ctx.body = { error: 'clean_failed', message: err instanceof Error ? err.message : String(err) }
  }
})

router.post('/reveal', async (ctx: any) => {
  const { category } = ctx.request?.body || {}
  const cat = CATEGORIES.find(c => c.key === category)
  let exists = false
  try {
    await stat(cat?.dir ?? '')
    exists = true
  } catch { /* 不存在或未知分类 */ }
  if (!cat || !exists) {
    ctx.status = 404
    ctx.body = { error: 'unknown_category' }
    return
  }
  // win x64 zip 是正式发布物：win32 必须走 explorer，xdg-open 在 Windows 不存在
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'explorer'
        : 'xdg-open'
  try {
    spawn(cmd, [cat.dir], { stdio: 'ignore', detached: true }).unref()
    ctx.body = { ok: true }
  } catch {
    ctx.status = 500
    ctx.body = { error: 'reveal_failed' }
  }
})

export default router
