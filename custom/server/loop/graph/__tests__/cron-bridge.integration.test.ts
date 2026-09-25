// cron-bridge 集成验证（T3b，spec §5 后续项；hermetic：真 node:http 端点 × 真脚本执行，
// 不依赖 hermes 二进制/gateway）——钉死"脚本 ↔ 端点"合同：
//   生成的 no-agent 脚本（bash+curl）打到真 HTTP 服务上，token 正确 → 204 且 poll 执行；
//   token 错误 → 401（curl -f 失败退出非零），poll 不执行。
import { execFile } from 'child_process'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTickScript, registerLoopCronBridgeRoutes, setCronBridgeTick } from '../cron-bridge'

const ENV = { LOOP_SCHEDULER: 'cron', LOOP_CRON_BRIDGE_TOKEN: 'tok-it' }

/** Koa 风格中间件的最小 node:http 适配（生产挂 Koa，合同字段一致：method/path/ip/request.headers/status/body） */
function startBridgeServer(): Promise<{ port: number; statuses: number[]; close: () => Promise<void> }> {
  const middleware: Array<(ctx: any, next: () => Promise<void>) => Promise<void>> = []
  const statuses: number[] = []
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      const ctx = {
        method: req.method,
        path: (req.url ?? '').split('?')[0],
        ip: req.socket.remoteAddress,
        request: { headers: req.headers },
        status: undefined as number | undefined,
        body: undefined as unknown,
      }
      void (async () => {
        for (const mw of middleware) {
          let passthrough = false
          await mw(ctx, async () => { passthrough = true })
          if (!passthrough) break
        }
        statuses.push(ctx.status ?? 404)
        res.writeHead(ctx.status ?? 404)
        res.end(typeof ctx.body === 'string' ? ctx.body : ctx.body ? JSON.stringify(ctx.body) : '')
      })()
    })
  })
  const app = { use: (mw: any) => middleware.push(mw) }
  registerLoopCronBridgeRoutes(app as any, ENV)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({ port, statuses, close: () => new Promise<void>((done) => server.close(() => done())) })
    })
  })
}

function runBash(script: string): Promise<{ code: number | null }> {
  return new Promise((resolve) => {
    execFile('bash', [script], (err) => resolve({ code: err ? (err as any).code ?? 1 : 0 }))
  })
}

afterEach(() => { setCronBridgeTick(null) })

describe('cron-bridge 脚本↔端点合同（真 HTTP × 真脚本）', () => {
  it('token 正确：脚本 curl → 204，poll 执行一次', async () => {
    const { port, close } = await startBridgeServer()
    let ticked = 0
    const deferred = Promise.withResolvers<void>()
    setCronBridgeTick(async () => { ticked += 1; deferred.resolve() })
    const dir = mkdtempSync(join(tmpdir(), 'cronbridge-it-'))
    try {
      const script = join(dir, 'tick.sh')
      writeFileSync(script, buildTickScript(port, ENV.LOOP_CRON_BRIDGE_TOKEN), { mode: 0o700 })
      const { code } = await runBash(script)
      expect(code).toBe(0) // curl -fsS：非 2xx 即失败——204 合同成立
      await deferred.promise
      expect(ticked).toBe(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      await close()
    }
  })

  it('token 错误：端点回 401，poll 不执行（脚本 || true 吞错属设计——cron 不因 tick 失败报错）', async () => {
    const { port, statuses, close } = await startBridgeServer()
    let ticked = 0
    setCronBridgeTick(async () => { ticked += 1 })
    const dir = mkdtempSync(join(tmpdir(), 'cronbridge-it-'))
    try {
      const script = join(dir, 'tick-bad.sh')
      writeFileSync(script, buildTickScript(port, 'wrong-token'), { mode: 0o700 })
      await runBash(script)
      expect(statuses).toEqual([401])
      expect(ticked).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
      await close()
    }
  })
})
