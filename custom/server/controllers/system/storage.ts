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
 */
import Router from '@koa/router'
import { spawn } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { readdirSync, statSync, existsSync, rmSync } from 'fs'

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

function dirSize(dir: string): number {
  let total = 0
  let entries = 0
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      try {
        const st = statSync(p)
        entries++
        total += st.isFile() ? st.size : dirSize(p)
      } catch { /* 权限或并发删除，跳过 */ }
    }
  } catch { /* 目录不存在 */ }
  return entries > 0 ? total : (existsSync(dir) ? 0 : -1) // -1 = 目录不存在
}

function countFiles(dir: string): number {
  let n = 0
  try {
    for (const name of readdirSync(dir)) {
      const st = statSync(join(dir, name))
      n += st.isDirectory() ? countFiles(join(dir, name)) : 1
    }
  } catch { /* 忽略 */ }
  return n
}

const router = new Router({ prefix: '/api/ide/storage' })

router.get('/snapshot', async (ctx: any) => {
  const categories = CATEGORIES.map(c => {
    const bytes = dirSize(c.dir)
    return {
      key: c.key,
      path: c.dir,
      cleanable: c.cleanable,
      hint: c.hint,
      exists: bytes >= 0,
      bytes: bytes < 0 ? 0 : bytes,
      files: bytes < 0 ? 0 : countFiles(c.dir),
    }
  })
  ctx.body = {
    categories,
    totalBytes: categories.reduce((sum, c) => sum + c.bytes, 0),
  }
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
  if (!existsSync(cat.dir)) {
    ctx.body = { ok: true, freedBytes: 0 }
    return
  }
  const before = Math.max(0, dirSize(cat.dir))
  try {
    rmSync(cat.dir, { recursive: true, force: true })
    ctx.body = { ok: true, freedBytes: before }
  } catch (err: unknown) {
    ctx.status = 500
    ctx.body = { error: 'clean_failed', message: err instanceof Error ? err.message : String(err) }
  }
})

router.post('/reveal', async (ctx: any) => {
  const { category } = ctx.request?.body || {}
  const cat = CATEGORIES.find(c => c.key === category)
  if (!cat || !existsSync(cat.dir)) {
    ctx.status = 404
    ctx.body = { error: 'unknown_category' }
    return
  }
  const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
  try {
    spawn(cmd, [cat.dir], { stdio: 'ignore', detached: true }).unref()
    ctx.body = { ok: true }
  } catch {
    ctx.status = 500
    ctx.body = { error: 'reveal_failed' }
  }
})

export default router
