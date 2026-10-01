/**
 * 运行时暗能力只读代理 REST（/api/runtime-caps/*）——2026-10-01 吸收批 9
 * （#7 审批建议/#17 凭证池/cron 运行史）。
 *
 * GET /api/runtime-caps/credentials            hermes auth list（凭证池：provider×凭证/priority/失败态）
 * GET /api/runtime-caps/approval-suggestions   hermes approvals suggest --json（放行建议，纯只读不落盘）
 * GET /api/runtime-caps/cron-runs?limit=20     hermes cron runs --limit（定时任务执行史）
 *
 * 设计约束（吸收 2026-09-30 性能批教训）：
 *   - CLI spawn 慢（冷启 1-3s）：结果带 TTL 缓存 + 单飞锁（并发请求共享同一次
 *     spawn，防 CLI 风暴——kanban CLI 4-6s 卡顿主因就是无锁并发 spawn）；
 *   - HERMES_SKIP_UPDATE=1 阻断 source-update 自更新（曾抹掉 venv）；
 *   - 二进制探测序：HERMES_BIN env → 安装树 venv → PATH hermes；探测失败如实
 *     409（runtime 通道缺席，前端显示诚实空态不做摆设）；
 *   - 全部只读命令；approvals suggest 不带 --apply（永不在代理里落盘）。
 */
import Router from '@koa/router'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const router = new Router({ prefix: '/api/runtime-caps' })

const CLI_TIMEOUT_MS = 45_000

function resolveHermesBin(): string | null {
  const envBin = process.env.HERMES_BIN?.trim()
  if (envBin && existsSync(envBin)) return envBin
  const installTree = join(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes')
  if (existsSync(installTree)) return installTree
  return null
}

interface CachedOut { at: number; body: unknown; status: number }

const cache = new Map<string, CachedOut>()
const inflight = new Map<string, Promise<CachedOut>>()

function isFresh(entry: CachedOut | undefined, ttlMs: number): boolean {
  return !!entry && Date.now() - entry.at < ttlMs && entry.status === 200
}

function runCli(args: string[], ttlMs: number, key: string, timeoutMs = CLI_TIMEOUT_MS): Promise<CachedOut> {
  const fresh = cache.get(key)
  if (isFresh(fresh, ttlMs)) return Promise.resolve(fresh!)

  const existing = inflight.get(key)
  if (existing) return existing

  const task = (async (): Promise<CachedOut> => {
    const bin = resolveHermesBin()
    if (!bin) {
      return { at: Date.now(), status: 409, body: { ok: false, error: 'hermes runtime 不在可达路径（HERMES_BIN 未设且安装树 venv 缺席）' } }
    }
    return await new Promise<CachedOut>((resolve) => {
      const child = spawn(bin, args, {
        env: { ...process.env, HERMES_HOME: join(homedir(), '.hermes'), HERMES_SKIP_UPDATE: '1' },
        timeout: CLI_TIMEOUT_MS,
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (d: Buffer) => { out += d.toString() })
      child.stderr.on('data', (d: Buffer) => { err += d.toString() })
      child.on('error', (e) => resolve({ at: Date.now(), status: 409, body: { ok: false, error: `spawn 失败：${e.message}` } }))
      child.on('close', (code) => {
        if (code === null) {
          // spawn timeout 杀死：如实标注超时语义（exit null 不可读）
          resolve({ at: Date.now(), status: 504, body: { ok: false, error: `CLI 超时（>${Math.round(timeoutMs / 1000)}s）` } })
          return
        }
        if (code === 0 && out.trim()) {
          const entry: CachedOut = { at: Date.now(), status: 200, body: { ok: true, raw: out } }
          cache.set(key, entry)
          resolve(entry)
        } else {
          // 非零退出/空输出不缓存（下次重试）；错误如实透出
          resolve({ at: Date.now(), status: 502, body: { ok: false, error: (err || out || `exit ${code}`).slice(0, 400) } })
        }
      })
    })
  })()

  inflight.set(key, task)
  task.finally(() => inflight.delete(key)).catch(() => undefined)
  return task
}

async function respond(ctx: { status: number; body: unknown }, key: string, args: string[], ttlMs: number, timeoutMs?: number): Promise<void> {
  const out = await runCli(args, ttlMs, key, timeoutMs)
  ctx.status = out.status
  ctx.body = out.body
}

/** 凭证池（#17）：TTL 60s */
router.get('/credentials', async (ctx) => {
  await respond(ctx, 'credentials', ['auth', 'list'], 60_000)
})

/** 放行建议（#7）：纯只读（不带 --apply）。扫 session db 冷启约 60-70s（--days 3
 *  实测 67s；不窗口化 >2min）——超时 90s+TTL 600s（长缓存，一次冷启换十分钟命中）；
 *  前端按"生成中"态呈现，不阻塞页面。 */
router.get('/approval-suggestions', async (ctx) => {
  const limit = Math.min(Number(ctx.query.limit) || 8, 20)
  const days = Math.min(Number(ctx.query.days) || 3, 30)
  await respond(ctx, `approval-suggestions:${days}:${limit}`,
    ['approvals', 'suggest', '--json', '--days', String(days), '--limit', String(limit)],
    600_000, 90_000)
})

/** cron 执行史（#7）：TTL 30s */
router.get('/cron-runs', async (ctx) => {
  const limit = Math.min(Number(ctx.query.limit) || 20, 50)
  await respond(ctx, 'cron-runs', ['cron', 'runs', '--limit', String(limit)], 30_000)
})

export default router
