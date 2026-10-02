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
import { existsSync, readFileSync } from 'fs'
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

// ── 网关 api_server HTTP 代理（2026-10-02 三受阻项解封：会话分叉/蓝图/暗能力）──
// 通道实证：网关 aiohttp api_server 常驻（launchd），监听 127.0.0.1:<port>（config.yaml
// platforms.api_server.extra.port，默认 8650），鉴权=API_SERVER_KEY（~/.hermes/.env）。
// 路由表锚点：gateway/platforms/api_server.py:1587 _http_route_table——sessions 全套
// （含 POST /api/sessions/{id}/fork）+/v1/capabilities +/api/jobs CRUD。
// 密钥/端口只在本机文件读取，不经请求参数；代理全部走 127.0.0.1，不出机。

interface GatewayConfig { base: string; key: string }
let gwCfgCache: { at: number; cfg: GatewayConfig | null } | null = null

function readGatewayConfig(): GatewayConfig | null {
  if (gwCfgCache && Date.now() - gwCfgCache.at < 60_000) return gwCfgCache.cfg
  let cfg: GatewayConfig | null = null
  try {
    const envText = readFileSync(join(homedir(), '.hermes', '.env'), 'utf-8')
    const key = envText.split('\n').map(l => l.trim())
      .find(l => l.startsWith('API_SERVER_KEY='))?.slice('API_SERVER_KEY='.length).trim() ?? ''
    let port = 8650
    try {
      const yaml = readFileSync(join(homedir(), '.hermes', 'config.yaml'), 'utf-8')
      const m = /api_server:[\s\S]{0,400}?port:\s*(\d+)/.exec(yaml)
      if (m) port = Number(m[1])
    } catch { /* 端口探测失败按默认 */ }
    cfg = key ? { base: `http://127.0.0.1:${port}`, key } : null
  } catch {
    cfg = null
  }
  gwCfgCache = { at: Date.now(), cfg }
  return cfg
}

async function gwFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; body: unknown }> {
  const cfg = readGatewayConfig()
  if (!cfg) return { status: 409, body: { ok: false, error: '网关通道缺席（~/.hermes/.env 无 API_SERVER_KEY）' } }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 10_000)
  try {
    const res = await fetch(cfg.base + path, {
      ...init,
      headers: { Authorization: `Bearer ${cfg.key}`, ...(init.headers ?? {}) },
      signal: ctrl.signal,
    })
    const text = await res.text()
    let body: unknown = text
    try { body = JSON.parse(text) } catch { /* 保留文本 */ }
    return { status: res.status, body }
  } catch (e) {
    return { status: 502, body: { ok: false, error: `网关请求失败：${e instanceof Error ? e.message : String(e)}` } }
  } finally {
    clearTimeout(timer)
  }
}

/** 网关健康+能力面（#10 暗能力）：/v1/capabilities，TTL 30s 缓存（单飞锁同 runCli 族不适用——
 *  这里直接走 fetch，30s 内重复请求接受；面板低频）。 */
router.get('/gateway/status', async (ctx) => {
  const cached = cache.get('gateway-status')
  if (isFresh(cached, 30_000)) { ctx.status = 200; ctx.body = cached!.body; return }
  const out = await gwFetch('/v1/capabilities')
  const body = out.status === 200
    ? { ok: true, healthy: true, capabilities: out.body }
    : { ok: false, healthy: false, error: out.body }
  if (out.status === 200) cache.set('gateway-status', { at: Date.now(), status: 200, body })
  ctx.status = out.status === 200 ? 200 : out.status
  ctx.body = body
})

/** 蓝图目录（#11）：运行时 venv python 导入 cron.blueprint_catalog.CATALOG（16 件，
 *  数据结构与运行时同源零漂移）；TTL 300s。dashboard 的 /api/cron/blueprints 未挂
 *  在 api_server 端口——python 导入是零新进程常驻的等价通道。 */
const PY_BLUEPRINT_DUMP = `
import sys, json, dataclasses
sys.path.insert(0, ${JSON.stringify(join(homedir(), '.hermes', 'hermes-agent'))})
from cron.blueprint_catalog import CATALOG
items = []
for bp in CATALOG:
    items.append({
        'key': bp.key, 'title': bp.title, 'description': bp.description,
        'category': bp.category, 'schedule_template': bp.schedule_template,
        'prompt_template': bp.prompt_template, 'deliver_default': bp.deliver_default,
        'skills': list(bp.skills or []), 'tags': list(bp.tags or []),
        'slots': [dataclasses.asdict(s) for s in bp.slots],
    })
print(json.dumps({'ok': True, 'blueprints': items}, ensure_ascii=False))
`

function runPython(code: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  const py = join(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'python3')
  if (!existsSync(py)) return Promise.resolve({ status: 409, body: { ok: false, error: '运行时 venv 缺席（hermes runtime 未安装）' } })
  return new Promise((resolve) => {
    const child = spawn(py, ['-c', code], { timeout: timeoutMs, env: { ...process.env, HERMES_SKIP_UPDATE: '1' } })
    let out = ''
    let err = ''
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })
    child.on('error', (e) => resolve({ status: 409, body: { ok: false, error: `python spawn 失败：${e.message}` } }))
    child.on('close', (code) => {
      if (code === 0 && out.trim()) {
        try { resolve({ status: 200, body: JSON.parse(out) }) }
        catch { resolve({ status: 502, body: { ok: false, error: '蓝图目录解析失败' } }) }
      } else {
        resolve({ status: 502, body: { ok: false, error: (err || out || `exit ${code}`).slice(0, 400) } })
      }
    })
  })
}

router.get('/gateway/blueprints', async (ctx) => {
  const cached = cache.get('gateway-blueprints')
  if (isFresh(cached, 300_000)) { ctx.status = 200; ctx.body = cached!.body; return }
  const out = await runPython(PY_BLUEPRINT_DUMP, 30_000)
  if (out.status === 200) cache.set('gateway-blueprints', { at: Date.now(), status: 200, body: out.body })
  ctx.status = out.status
  ctx.body = out.body
})

/** 蓝图实例化（#11）：python fill_blueprint（校验槽位→create_job kwargs）→ 网关
 *  POST /api/jobs 真实建任务。BlueprintFillError→422（表单内联错误语义对齐 dashboard）。 */
router.post('/gateway/blueprints/instantiate', async (ctx) => {
  const { key, values } = (ctx.request.body ?? {}) as { key?: string; values?: Record<string, unknown> }
  if (!key) { ctx.status = 400; ctx.body = { ok: false, error: 'key 必填' }; return }
  const code = `
import sys, json
sys.path.insert(0, ${JSON.stringify(join(homedir(), '.hermes', 'hermes-agent'))})
from cron.blueprint_catalog import get_blueprint, fill_blueprint, BlueprintFillError
bp = get_blueprint(${JSON.stringify(key)})
if bp is None:
    print(json.dumps({'ok': False, 'code': 404, 'error': 'unknown blueprint: ' + ${JSON.stringify(key)}})); sys.exit(0)
try:
    spec = fill_blueprint(bp, json.loads(${JSON.stringify(JSON.stringify(values ?? {}))}))
    print(json.dumps({'ok': True, 'spec': spec}, ensure_ascii=False, default=str))
except BlueprintFillError as e:
    print(json.dumps({'ok': False, 'code': 422, 'error': str(e)})); sys.exit(0)
`
  const fill = await runPython(code, 20_000)
  if (fill.status !== 200) { ctx.status = fill.status; ctx.body = fill.body; return }
  const fillBody = fill.body as { ok: boolean; code?: number; error?: string; spec?: Record<string, unknown> }
  if (!fillBody.ok) { ctx.status = fillBody.code ?? 422; ctx.body = { ok: false, error: fillBody.error }; return }
  // 网关 /api/jobs create 接受的键（api_server.py _handle_create_job 白名单）
  const spec = fillBody.spec ?? {}
  const payload: Record<string, unknown> = {}
  for (const k of ['name', 'schedule', 'prompt', 'deliver', 'skills', 'repeat', 'paused']) {
    if (k in spec) payload[k] = spec[k]
  }
  const created = await gwFetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 15_000,
  })
  ctx.status = created.status
  ctx.body = created.status === 200 || created.status === 201
    ? { ok: true, job: (created.body as { job?: unknown })?.job ?? created.body }
    : { ok: false, error: created.body }
})

/** 会话列表（#10/#7 数据面）：网关 /api/sessions，TTL 15s。 */
router.get('/gateway/sessions', async (ctx) => {
  const limit = Math.min(Number(ctx.query.limit) || 20, 100)
  const cached = cache.get(`gateway-sessions:${limit}`)
  if (isFresh(cached, 15_000)) { ctx.status = 200; ctx.body = cached!.body; return }
  const out = await gwFetch(`/api/sessions?limit=${limit}`)
  if (out.status === 200) cache.set(`gateway-sessions:${limit}`, { at: Date.now(), status: 200, body: { ok: true, ...out.body as object } })
  ctx.status = out.status
  ctx.body = out.status === 200 ? { ok: true, ...(out.body as object) } : { ok: false, error: out.body }
})

/** 会话分叉（#7 真链路）：网关 POST /api/sessions/{id}/fork——CLI /branch 语义：
 *  子会话全量拷消息+父标记 branched 结束。body 可带 title（缺省 "<base> fork N"）。 */
router.post('/gateway/sessions/:id/fork', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { title?: string }
  const out = await gwFetch(`/api/sessions/${encodeURIComponent(ctx.params.id)}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body.title ? { title: body.title } : {}),
    timeoutMs: 20_000,
  })
  ctx.status = out.status
  ctx.body = out.status === 201 || out.status === 200
    ? { ok: true, session: (out.body as { session?: unknown })?.session ?? out.body }
    : { ok: false, error: out.body }
})

export default router
