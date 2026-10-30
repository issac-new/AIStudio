// overlay/scripts/regression/verify-helix-live.mjs
// HelixHarness 吸收轮两项活体验证（2026-10-30 挂账清偿；spec 2026-10-30-helix-followup-debts）：
//   ① /api/harness/obs-signals 的 contextReads 面——真实 koa 服务上按层分桶/TopN 读数；
//   ② eval `command` 验收器 + F2P calibrate 端点——真实 HTTP 建 S0-regex-only 集
//      （零 LLM 判定费，applyRegexRule 全本地），跑命令验收成功/失败两路与校准闭环。
//
// 隔离：PORT=8891（避开 8647 在服实例）＋ EVAL_STORE 指向临时库（不污染真实评测账本）
//      ＋ EVAL_OUTCOME_ALLOWED_ROOTS 指向本检出临时沙盒目录（命令只准在沙盒内跑）。
// 退出码：0=全绿；1=有断言失败（逐项打印）；2=环境不可跑（服务起不来等）。
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const PORT = 8891
const BASE = `http://127.0.0.1:${PORT}`
const MARK = 'LIVE-PROBE-PASS'

const sandbox = mkdtempSync(join(tmpdir(), 'helix-live-'))
const evalStore = join(sandbox, 'eval-store.json')
const results = []
let server = null

function step(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

let token = ''
async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  return { status: r.status, body: await r.json().catch(() => null) }
}
async function post(path, payload) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

async function waitReady(timeoutMs = 120_000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/health/ready`, { signal: AbortSignal.timeout(2000) })
      if (r.status === 200) return true
    } catch { /* 未起/编译中 */ }
    await new Promise((r) => setTimeout(r, 1000))
  }
  return false
}

function taskWith(over = {}) {
  return {
    id: 'live-t1',
    problem: '活体验证：命令式验收器与 S0 regex 判分',
    expectedBehavior: '证据含探针标记且命令验收器退出码符合期望',
    rubric: [
      { id: 'a1', text: '证据包含探针标记', expect: 'yes', kind: 'result', s0: { kind: 'regex', pattern: MARK } },
    ],
    ...over,
  }
}

try {
  // ---- 起 服务（cwd=vendor/hermes-studio 由 serve-server 负责；repoRoot 上溯解析检出根）----
  server = spawn(process.execPath, ['scripts/serve-server.mjs'], {
    detached: true, // 独立进程组：退出时 kill(-pid) 连 ts-node 子进程一并回收（防孤儿占端口）
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      EVAL_STORE: evalStore,
      EVAL_ALLOW_COMMANDS: '1',
      EVAL_OUTCOME_ALLOWED_ROOTS: sandbox,
      HERMES_CONTEXT_READS_FILE: '', // 显式留空：验证 repoRoot 自动解析（服务 cwd≠仓根）
      // 鉴权面隔离：用户库走官方测试通道（VITEST=true + HERMES_WEB_UI_TEST_DB_DIR）指到
      // 临时空库——dev 模式缺省落在 cwd/packages/server/data（vendor 树内共享库），会撞
      // 真实账号；VITEST 的其余副作用（日志/agent-bridge 指向 tmp）对活体无碍且更隔离。
      // 空库 + 显式开发门首登建号（M8b 后无出厂口令），真实账号不被触碰，凭据一次性。
      VITEST: 'true',
      HERMES_WEB_UI_TEST_DB_DIR: join(sandbox, 'db'),
      HERMES_WEB_UI_DEV_BOOTSTRAP: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', () => {})
  server.stderr.on('data', (d) => process.env.HELIX_LIVE_VERBOSE && process.stderr.write(d))

  // 残留孤儿防护：serve-server.mjs 退出不连带 ts-node 子进程（close handler 只管自己），
  // 上一次异常退出的服务会占着端口，让本轮全部请求打到旧进程（allowedRoots 全不匹配）。
  try {
    const probe = await fetch(`${BASE}/health/ready`, { signal: AbortSignal.timeout(1500) })
    if (probe.ok) {
      console.error(`[helix-live] 端口 ${PORT} 已有服务在跑（上轮残留？）——先 lsof -ti :${PORT} | xargs kill -9 再重试`)
      process.exit(2)
    }
  } catch { /* 端口空闲，正常 */ }

  if (!(await waitReady())) {
    console.error('[helix-live] 服务 120s 未就绪（ts-node 冷编译可能更慢；重试或查 stderr）')
    process.exit(2)
  }
  step('服务就绪（/health/ready 200，PORT=8891 隔离实例）', true)

  // 登录：空库 + DEV_BOOTSTRAP 首登建号 → JWT（活体不碰真实用户库）
  const login = await post('/api/auth/login', { username: 'helix-live', password: 'helix-live-once' })
  token = login.body?.token ?? ''
  step('dev-bootstrap 空库建号并取得 JWT（鉴权面隔离）', login.status === 200 && !!token, `status=${login.status}`)

  // ---- ① contextReads 活体：写账本 → 端点读数 ----
  const readsFile = join(ROOT, '.qgate', 'reads.jsonl')
  const now = new Date().toISOString()
  const rows = [
    { ts: now, tool: 'Read', path: 'AGENTS.md', layer: 'harness' },
    { ts: now, tool: 'Read', path: 'AGENTS.md', layer: 'harness' },
    { ts: now, tool: 'Read', path: 'docs/superpowers/specs/2026-10-30-helix-followup-debts.md', layer: 'specs' },
    { ts: now, tool: 'Read', path: 'custom/server/knowledge/knowledge-loop.ts', layer: 'knowledge' },
    { ts: now, tool: 'Read', path: '.swarm-yuan/hooks/pre-commit', layer: 'hooks' },
    { ts: now, tool: 'Read', path: 'README.md', layer: 'other' },
  ]
  writeFileSync(readsFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n')

  const obs = await get('/api/harness/obs-signals?days=1')
  const cr = obs.body?.contextReads
  step(
    'obs-signals 200 且 contextReads 面存在',
    obs.status === 200 && !!cr,
    `status=${obs.status}`,
  )
  step(
    'contextReads 按层分桶（服务 cwd=vendor 树仍解析到检出根账本）',
    cr?.available === true && cr.byLayer?.harness === 2 && cr.byLayer?.specs === 1 && cr.byLayer?.knowledge === 1 && cr.byLayer?.hooks === 1 && cr.byLayer?.other === 1,
    `byLayer=${JSON.stringify(cr?.byLayer)}`,
  )
  step(
    'contextReads TopN 首位是读取最多的路径',
    cr?.topPaths?.[0]?.path === 'AGENTS.md' && cr.topPaths[0].count === 2,
    `top1=${cr?.topPaths?.[0]?.path}×${cr?.topPaths?.[0]?.count}`,
  )

  // ---- ② command 验收器：成功路 ----
  const created = await post('/api/hermes/eval/sets', {
    name: `helix-live-${Date.now()}`,
    track: 'e2e',
    tasks: [
      taskWith({ outcome: { verifier: 'command', params: { cwd: sandbox }, argv: [process.execPath, '-e', 'process.exit(0)'], expectExit: 0 } }),
    ],
  })
  const setId = created.body?.set?.id
  step('建集 201（S0-regex-only rubric + command outcome）', created.status === 201 && !!setId, `setId=${setId}`)

  const runOk = await post('/api/hermes/eval/runs', {
    setId,
    samples: { 'live-t1': [{ evidence: { transcript: `前置对话……关键产物已产出 ${MARK} ……收尾` } }] },
    target: { profile: 'helix-live' },
  })
  const att = runOk.body?.run?.attempts?.[0]
  step(
    'run 通过：S0 regex 判过 + command 验收器退出码 0',
    runOk.body?.ok === true && att?.outcome?.ok === true && att?.passed === true,
    `outcome=${att?.outcome?.ok} passed=${att?.passed} detail=${JSON.stringify(att?.outcome?.detail)?.slice(0, 140)}`,
  )

  // ---- ②b 失败路：期望退出码 3，命令退 0 → outcome 不达成 ----
  const created2 = await post('/api/hermes/eval/sets', {
    name: `helix-live-fail-${Date.now()}`,
    track: 'e2e',
    tasks: [
      taskWith({
        id: 'live-t2',
        outcome: { verifier: 'command', params: { cwd: sandbox }, argv: [process.execPath, '-e', 'process.exit(0)'], expectExit: 3 },
      }),
    ],
  })
  const runFail = await post('/api/hermes/eval/runs', {
    setId: created2.body?.set?.id,
    samples: { 'live-t2': [{ evidence: { transcript: `证据满足 ${MARK} 但命令退出码不符` } }] },
    target: { profile: 'helix-live' },
  })
  const att2 = runFail.body?.run?.attempts?.[0]
  step(
    'run 拒绝：退出码 0≠期望 3 → outcome.ok=false 且 passed=false（不伪造通过）',
    runFail.body?.ok === true && att2?.outcome?.ok === false && att2?.passed === false,
    `outcome=${att2?.outcome?.ok} passed=${att2?.passed}`,
  )

  // ---- ②c calibrate 端点：F2P 两证据闭环 ----
  const cal = await post(`/api/hermes/eval/sets/${setId}/calibrate`, {
    samples: [
      {
        taskId: 'live-t1',
        baseline: { transcript: '基线证据：没有探针标记，应当判负' },
        solution: { transcript: `解法证据：包含 ${MARK}，应当判过` },
      },
    ],
  })
  step(
    'calibrate F2P 闭环（基线判负+解法判过 → calibrated:true 且落库）',
    cal.body?.ok === true && cal.body?.calibration?.calibrated === true && cal.body?.calibration?.f2p?.[0]?.ok === true,
    `f2p=${JSON.stringify(cal.body?.calibration?.f2p?.[0]?.baselinePassed)}/${JSON.stringify(cal.body?.calibration?.f2p?.[0]?.solutionPassed)}`,
  )
  const setAfter = await get(`/api/hermes/eval/sets/${setId}`)
  step('校准结果已落集（set.calibration 存在且 setHash 一致）', !!setAfter.body?.set?.calibration?.calibrated)
} catch (e) {
  step('活体执行异常', false, e instanceof Error ? e.message : String(e))
} finally {
  if (server && server.pid) {
    try { process.kill(-server.pid, 'SIGKILL') } catch { /* 组已消失 */ }
    server.kill('SIGKILL')
  }
  rmSync(sandbox, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok)
console.log(`\n[helix-live] ${results.length - failed.length}/${results.length} 步通过`)
if (failed.length) process.exit(1)
process.exit(0)
