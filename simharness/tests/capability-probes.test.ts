// 推演期新能力探测脚本的端到端守门（方案 §5.11，2026-11-04 扩组至十三组；同日 W4 扩至十四组）：
// 真起 Koa（handoff + proactivity + 精简 workbench 面 + governance/lifecycle + trust +
// projectworkflow + execution-records + userenv + userperms + vendor 技能路由），
// 跑 mx-capability-probes.mjs，断言十四组探测全绿且产物落盘。脚本本身是 run 期取证
// 工装（驱动 testpass 步自动调用），若它坏了，G4 的新能力证据就没人取。
// vendor 技能路由依赖注入态树（src/custom/skillgov 由 inject 生成）——与仓内其他
// 跨树测试同前提：worktree 内先 npm run inject。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
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

/** 最小看板库（projectworkflow 夹具）：tasks/task_links 只建本域依赖的列。
 *  probe-proj：t1(done,父)→t2(running,子)＋t3(todo,父=t1)——图有边、next 非空、
 *  完成守卫有未终结任务（422/400 两负例确定性触发，且都不落库）。 */
function makeKanbanDb(path: string): void {
  const { DatabaseSync } = require('node:sqlite') as {
    DatabaseSync: new (p: string) => {
      exec(sql: string): void
      prepare(sql: string): { run(...a: unknown[]): unknown }
      close(): void
    }
  }
  mkdirSync(join(path, '..'), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, status TEXT, assignee TEXT, block_kind TEXT, project_id TEXT)')
  db.exec('CREATE TABLE task_links (parent_id TEXT, child_id TEXT)')
  const ins = db.prepare('INSERT INTO tasks (id, title, status, assignee, block_kind, project_id) VALUES (?, ?, ?, ?, NULL, ?)')
  ins.run('t1', '父任务已完成', 'done', 'probe-a', 'probe-proj')
  ins.run('t2', '子任务进行中', 'running', 'probe-b', 'probe-proj')
  ins.run('t3', '三号待就绪', 'todo', 'probe-a', 'probe-proj')
  const link = db.prepare('INSERT INTO task_links (parent_id, child_id) VALUES (?, ?)')
  link.run('t1', 't2')
  link.run('t1', 't3')
  db.close()
}

let dir: string
let server: import('node:http').Server | undefined
let base = ''
const prevEnv: Record<string, string | undefined> = {}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mx-probe-'))
  for (const k of ['HERMES_HOME', 'HARNESS2_STORE', 'HERMES_GOAL_ALIGNMENT_DIR', 'INTERVENTION_LEDGER_PATH',
    'ATTENTION_PREFS_PATH', 'HERMES_KANBAN_HOME', 'EXECUTION_RECORDS_DIR', 'USER_PERMS_AUDIT_FILE',
    // W4 组 14（harness 路由整挂）：审计账/执法批单/运行清单/govbus 事件四源全部隔离进临时目录
    'TOOL_EXEC_AUDIT_DIR', 'HERMES_ENFORCE_APPROVALS_DIR', 'RUN_MANIFEST_DIR', 'HERMES_GOV_EVENT_DIR']) {
    prevEnv[k] = process.env[k]
  }
  process.env.HERMES_HOME = join(dir, 'home')
  process.env.HARNESS2_STORE = join(dir, 'workbench', 'workbench.json')
  process.env.HERMES_GOAL_ALIGNMENT_DIR = join(dir, 'proactivity')
  process.env.INTERVENTION_LEDGER_PATH = join(dir, 'proactivity', 'interventions.json')
  process.env.ATTENTION_PREFS_PATH = join(dir, 'proactivity', 'attention.json')
  process.env.HERMES_KANBAN_HOME = join(dir, 'kanban')
  process.env.EXECUTION_RECORDS_DIR = join(dir, 'exec-records')
  process.env.USER_PERMS_AUDIT_FILE = join(dir, 'audit', 'user-perms-audit.jsonl')
  process.env.TOOL_EXEC_AUDIT_DIR = join(dir, 'tool-audit')
  process.env.HERMES_ENFORCE_APPROVALS_DIR = join(dir, 'enf-approvals')
  process.env.RUN_MANIFEST_DIR = join(dir, 'run-manifests')
  process.env.HERMES_GOV_EVENT_DIR = join(dir, 'govbus')

  // userenv 夹具：default 档在册＋一个敏感键（脱敏回显面可读）
  const profileDir = join(dir, 'home', 'profiles', 'default')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, '.env'), 'PROBE_DEMO_TOKEN=abcd1234\nPLAIN_KEY=hello\n')
  // vendor 技能面夹具：profile 无 config.yaml 时 readConfigYamlForProfile 直接抛
  // 「Studio profile config has not been configured」→列表/导出全 500（生产档必有该文件）
  writeFileSync(join(profileDir, 'config.yaml'), '{}\n')
  mkdirSync(join(profileDir, 'skills'), { recursive: true })
  // projectworkflow 夹具：临时看板根（默认板 kanban.db）
  makeKanbanDb(join(dir, 'kanban', 'kanban.db'))
  mkdirSync(join(dir, 'exec-records'), { recursive: true })

  const Koa = (await import('koa')).default
  const bodyParser = (await import('@koa/bodyparser')).default
  const { handoffRoutes } = await import('../../custom/server/handoff/handoff-controller')
  const { proactivityRouter } = await import('../../custom/server/proactivity/proactivity-controller')
  const { workbenchRoutes } = await import('../../custom/server/harness/workbench/controller')
  const { governanceRoutes } = await import('../../custom/server/governance/governance-controller')
  const trustRoutes = (await import('../../custom/server/trust/controller')).default
  const { projectworkflowRoutes } = await import('../../custom/server/projectworkflow/controller')
  const executionRecordsRoutes = (await import('../../custom/server/execution-records/controller')).default
  const { userenvRoutes } = await import('../../custom/server/userenv/controller')
  const { userPermsAuditRoutes } = await import('../../custom/server/userperms/controller')
  // W4 组 14：harness 治理面整路由（tool-contracts/execution-join/taskmodel 所在）
  const { harnessRoutes } = await import('../../custom/server/harness/harness-controller')
  // vendor 技能面的生产装配：profile-config 等依赖注入在 import 时接线（与 studio
  // 启动同源），不接则 readConfigYamlForProfile 抛「not been configured」→全 500
  await import('../../vendor/hermes-studio/packages/server/src/bootstrap/agent-profile-adapter')
  const { skillRoutes } = await import('../../vendor/hermes-studio/packages/server/src/modules/hermes/routes/skills')
  // Koa 的 app.use 不收路径前缀；用 Router.use 挂子路由（与生产装配同形）。
  // 自带 prefix 的路由（governance/projectworkflow/execution-records/userenv/userperms/
  // vendor skills）挂根；无 prefix 的（trust）按生产挂法挂到 /api/harness/trust 之下。
  const Router = (await import('@koa/router')).default
  const root = new Router()
  root.use('/api/harness/handoff', handoffRoutes.routes(), handoffRoutes.allowedMethods())
  root.use('/api/harness/workbench', workbenchRoutes.routes(), workbenchRoutes.allowedMethods())
  root.use('/api/harness/trust', trustRoutes.routes(), trustRoutes.allowedMethods())
  root.use(proactivityRouter.routes(), proactivityRouter.allowedMethods())
  root.use(governanceRoutes.routes(), governanceRoutes.allowedMethods())
  root.use(projectworkflowRoutes.routes(), projectworkflowRoutes.allowedMethods())
  root.use(executionRecordsRoutes.routes(), executionRecordsRoutes.allowedMethods())
  root.use(userenvRoutes.routes(), userenvRoutes.allowedMethods())
  root.use(userPermsAuditRoutes.routes(), userPermsAuditRoutes.allowedMethods())
  root.use(harnessRoutes.routes(), harnessRoutes.allowedMethods())
  root.use(skillRoutes.routes(), skillRoutes.allowedMethods())
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
  it('十四组探测全绿，产物 capability-probes.json 落盘且计数自洽', async () => {
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
    expect(report.total).toBeGreaterThanOrEqual(34)
    // 十四组齐全（组名是方案 §5.11 的十四条验证面；W4 扩组 harness-contract）
    const groups = [
      'proactivity', 'handoff', 'acceptance', 'claims', 'workbench', 'schedule', 'dispatch',
      'fourgap', 'projectworkflow', 'execution-records', 'userenv', 'userperms', 'skills', 'harness-contract',
    ]
    for (const g of groups) {
      expect(report.byGroup[g], `缺组 ${g}`).toBeTruthy()
      expect(report.byGroup[g].failed, `组 ${g} 有失败：${JSON.stringify(report.results.filter((x) => x.group === g && !x.ok))}`).toBe(0)
    }
    // 夹具造了未终结项目：组 9 条件负例必须真跑（不是 skip）
    const pwNegative = report.results.find((x) => x.group === 'projectworkflow' && x.name.includes('负例'))
    expect(pwNegative?.ok, `projectworkflow 负例未过：${pwNegative?.detail}`).toBe(true)
    expect(JSON.stringify(pwNegative?.detail), '夹具有未终结项目，负例不得走 skip 分支').not.toContain('skipped')
    // 组 14 三负例必须真红绿（参数门/404 fail-closed/板必填——契约面的存在理由）
    const hcNegatives = report.results.filter((x) => x.group === 'harness-contract' && x.name.includes('负例'))
    expect(hcNegatives.length, 'harness-contract 负例数不足').toBeGreaterThanOrEqual(3)
    for (const n of hcNegatives) expect(n.ok, `harness-contract 负例未过：${n.detail}`).toBe(true)
    const hcVersion = report.results.find((x) => x.group === 'harness-contract' && x.name.includes('版本'))
    expect(hcVersion?.ok, `契约版本锚未过：${hcVersion?.detail}`).toBe(true)
  })

  it('服务不可达时脚本仍写产物并退出 1（失败可见，不静默）', async () => {
    const out = join(dir, 'evidence-down')
    const r = await runProbe(['--base', 'http://127.0.0.1:9', '--out', out])
    expect(r.code).toBe(1)
    const report = JSON.parse(readFileSync(join(out, 'capability-probes.json'), 'utf8')) as { failed: number }
    expect(report.failed).toBeGreaterThan(0)
  })
})
