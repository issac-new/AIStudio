// 推演期新能力探测脚本的端到端守门（方案 §5.11）：
// 真起 Koa（handoff + proactivity + 精简 workbench 面），跑 mx-capability-probes.mjs，
// 断言七组探测全绿且产物落盘。脚本本身是 run 期取证工装，若它坏了，G4 的新能力证据就没人取。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'

const ROOT = resolve(__dirname, '../..')
const SCRIPT = join(ROOT, 'simharness/mux/mx-capability-probes.mjs')

/** 异步起子进程：spawnSync 会阻塞事件循环，同进程内的服务就无法应答探测请求。 */
function runProbe(args: string[]): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => { stdout += String(d) })
    child.stderr.on('data', (d) => { stderr += String(d) })
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolvePromise({ code, stdout, stderr })
    })
  })
}

let dir: string
let server: import('node:http').Server | undefined
let base = ''
const prevEnv: Record<string, string | undefined> = {}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mx-probe-'))
  for (const k of ['HERMES_HOME', 'HARNESS2_STORE', 'HERMES_GOAL_ALIGNMENT_DIR', 'INTERVENTION_LEDGER_PATH', 'ATTENTION_PREFS_PATH']) {
    prevEnv[k] = process.env[k]
  }
  process.env.HERMES_HOME = join(dir, 'home')
  process.env.HARNESS2_STORE = join(dir, 'workbench', 'workbench.json')
  process.env.HERMES_GOAL_ALIGNMENT_DIR = join(dir, 'proactivity')
  process.env.INTERVENTION_LEDGER_PATH = join(dir, 'proactivity', 'interventions.json')
  process.env.ATTENTION_PREFS_PATH = join(dir, 'proactivity', 'attention.json')

  const Koa = (await import('koa')).default
  const bodyParser = (await import('@koa/bodyparser')).default
  const { handoffRoutes } = await import('../../custom/server/handoff/handoff-controller')
  const { proactivityRouter } = await import('../../custom/server/proactivity/proactivity-controller')
  const { workbenchRoutes } = await import('../../custom/server/harness/workbench/controller')
  // Koa 的 app.use 不收路径前缀；用 Router.use 挂子路由（与生产装配同形）
  const Router = (await import('@koa/router')).default
  const root = new Router()
  root.use('/api/harness/handoff', handoffRoutes.routes(), handoffRoutes.allowedMethods())
  root.use('/api/harness/workbench', workbenchRoutes.routes(), workbenchRoutes.allowedMethods())
  root.use(proactivityRouter.routes(), proactivityRouter.allowedMethods())
  const app = new Koa()
  app.use(bodyParser())
  app.use(root.routes())
  server = createServer(app.callback())
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterAll(() => {
  server?.close()
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  if (dir) rmSync(dir, { recursive: true, force: true })
})

describe('mx-capability-probes', () => {
  it('七组探测全绿，产物 capability-probes.json 落盘且计数自洽', async () => {
    const out = join(dir, 'evidence')
    const r = await runProbe(['--base', base, '--out', out])
    expect(r.code, `probe 退出码非 0：${r.stderr || r.stdout}`).toBe(0)
    const file = join(out, 'capability-probes.json')
    expect(existsSync(file)).toBe(true)
    const report = JSON.parse(readFileSync(file, 'utf8')) as {
      total: number
      passed: number
      failed: number
      byGroup: Record<string, { ok: number; failed: number }>
      results: Array<{ group: string; ok: boolean; detail?: string }>
    }
    expect(report.failed).toBe(0)
    expect(report.passed).toBe(report.total)
    expect(report.total).toBeGreaterThanOrEqual(12)
    // 七组齐全（组名是方案 §5.11 的七条验证面）
    for (const g of ['proactivity', 'handoff', 'acceptance', 'claims', 'workbench', 'schedule', 'dispatch']) {
      expect(report.byGroup[g], `缺组 ${g}`).toBeTruthy()
      expect(report.byGroup[g].failed, `组 ${g} 有失败：${JSON.stringify(report.results.filter((x) => x.group === g && !x.ok))}`).toBe(0)
    }
  })

  it('服务不可达时脚本仍写产物并退出 1（失败可见，不静默）', async () => {
    const out = join(dir, 'evidence-down')
    const r = await runProbe(['--base', 'http://127.0.0.1:9', '--out', out])
    expect(r.code).toBe(1)
    const report = JSON.parse(readFileSync(join(out, 'capability-probes.json'), 'utf8')) as { failed: number }
    expect(report.failed).toBeGreaterThan(0)
  })
})
