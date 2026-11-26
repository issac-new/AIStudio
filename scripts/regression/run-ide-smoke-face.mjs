#!/usr/bin/env node
// 走查面包装器（2026-11-26 全面复盘批 B 起 ide-smoke-walkthrough 专用；2026-11-26 可信 RSI
// 后续批参数化，spec 2026-11-26-trustworthy-rsi-fulltext 决策 D19）：自起 dev 全链 →
// 轮询就绪 → 跑探针并透传退出码 → teardown 只杀本脚本自起的进程树。矩阵登记与手动单跑：
//   cd <仓库根> && node scripts/regression/run-ide-smoke-face.mjs            # 默认：IDE 冒烟面
//   cd <仓库根> && node scripts/regression/run-ide-smoke-face.mjs --face <名> --probe <路径> \
//     --isolated --backend-env HARNESS2_APPLY=1 --probe-env KEY=VAL          # 自定义走查面
//
// 参数：
//   --face <名>            日志前缀（缺省 ide-smoke-walkthrough）
//   --probe <路径>         探针脚本（仓库相对；缺省 scripts/regression/ide-smoke.mjs）
//   --isolated             严格隔离：HERMES_HOME/HERMES_KANBAN_HOME 也指向一次性空目录（写盘、
//                          看板等全部落在隔离目录），且后端端口被占时拒绝启动（不借用别人的后端
//                          ——写盘型走查必须只对着自己种的隔离数据，见决策 D18）
//   --backend-env K=V      追加给后端的环境变量（可重复；调用方显式设过的 HOME 类变量仍优先）
//   --probe-env K=V        追加给探针的环境变量（可重复）
//
// 链路构成（实测 2026-11-26）：
//   - 前端 vite：npm run dev（8649；predev 自动 ensure-injected 约 20s），就绪=GET 8649 → 200，上限 90s。
//   - 后端 Koa：npm run serve（8647；ts-node 冷编译 35-50s），就绪=GET /health → 200，上限 150s。
//     非 --isolated 时，8647 已有服务应答视为活体后端：借用，不接管、teardown 不代杀（与 8649 的
//     拒绝语义不同：vite 端口被占无法确定服务身份故拒绝，后端按 /health 判定是同一应用）。
//   - 自起后端默认注入（密闭化，2026-11-26 加固）：NODE_ENV=production + 三 HOME 隔离
//     （HERMES_WEB_UI_HOME / HERMES_HOME / HERMES_KANBAN_HOME = 一次性空目录）+
//     HERMES_WEB_UI_DEV_BOOTSTRAP=1 + HERMES_WEB_UI_DISABLE_SKILL_INJECTION=1（不写宿主技能目录
//     ——skill-injector 原按宿主根同步，实测扫过宿主 57 个技能目录）+
//     HERMES_WEB_UI_DISABLE_GATEWAY_AUTOSTART=1（不起网关；agent-bridge 仍会启动但其
//     --hermes-home 指向隔离目录，依赖安装与写入都落在隔离侧，实测日志锚定）。
//     首登建 super_admin 于隔离 HOME；teardown 不删隔离目录。探针侧随之获得
//     ISOLATED_HOME_DIR=<目录>（隔离目录根，需要种数据的探针由此定位；--isolated 写盘走查用）
//     与 IDE_SMOKE_ALLOW_NO_SESSION=1（隔离空库无会话，「会话深链」按环境条件 SKIP，不计失败）。
//
// 登录态环境语义（探针假定已认证，实测登录闸三态）：
//   - 活体环境（惯态检出：账户库有 active 账户＋网关凭据已配）：网关一键进入路径接管，历史轮 11/11。
//   - 密闭环境（默认：三 HOME 隔离 + DEV_BOOTSTRAP=1 + 双禁用）：空库首登建号。TEST_DB_DIR 不用
//     （serve 态 isDev 分支读不到它）。隔离覆盖：账户库、看板、agent 家、技能注入（禁用）、
//     网关自启（禁用）；--isolated 时再加写盘目标子目录（写盘型走查只对隔离数据，且拒绝借用后端）。
//     后端进程仍可能读到本机其它配置面，探针只读、不对这些状态做断言；要触发写操作的走查
//     必须 --isolated，或自行在网络层拦截另建夹具。
//   - 半环境（账户库无 active 账户且无网关凭据）：登录闸拦下全部 UI 步骤（2/10，2026-11-26 实测），
//     处置：激活账户或配网关凭据后再跑，包装器不代改账户库。
//
// 输出统一带 [面名] 前缀便于矩阵日志识别；仓库根以 process.cwd() 锚定（矩阵执行器以仓库根为
// cwd 调起各面）。端口被占先 lsof -ti :8649 确认归属，属别人的不要杀。
import { existsSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

const DEFAULT_FACE = 'ide-smoke-walkthrough'
const DEFAULT_PROBE = 'scripts/regression/ide-smoke.mjs'
const VITE_PORT = 8649
const BACKEND_PORT = 8647
const VITE_BASE = `http://localhost:${VITE_PORT}`
const BACKEND_BASE = `http://127.0.0.1:${BACKEND_PORT}`
const VITE_READY_TIMEOUT_MS = 90_000
const BACKEND_READY_TIMEOUT_MS = 150_000
const POLL_MS = 1_000
const TERM_GRACE_MS = 8_000

/** --face/--probe/--isolated/--backend-env/--probe-env；写死默认，非参数形态照旧可用。 */
function parseArgs(argv) {
  const opts = { face: DEFAULT_FACE, probe: DEFAULT_PROBE, isolated: false, backendEnv: [], probeEnv: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--face') opts.face = argv[++i] ?? ''
    else if (a === '--probe') opts.probe = argv[++i] ?? ''
    else if (a === '--isolated') opts.isolated = true
    else if (a === '--backend-env' || a === '--probe-env') {
      const kv = String(argv[++i] ?? '')
      const eq = kv.indexOf('=')
      if (eq <= 0) {
        process.stderr.write(`[${opts.face}] 参数 ${a} 需要 K=V 形式，收到「${kv}」\n`)
        process.exit(3)
      }
      ;(a === '--backend-env' ? opts.backendEnv : opts.probeEnv).push([kv.slice(0, eq), kv.slice(eq + 1)])
    } else {
      process.stderr.write(`[${opts.face}] 未知参数：${a}\n`)
      process.exit(3)
    }
  }
  if (!opts.face || !opts.probe) {
    process.stderr.write(`[${opts.face}] --face 与 --probe 都不能为空\n`)
    process.exit(3)
  }
  return opts
}

const OPTS = parseArgs(process.argv.slice(2))
const PROBE = OPTS.probe
// 自起隔离目录根（密闭化时生成；null=借用活体后端或调用方自管）。
let isolatedDbDir = null

const log = (line) => process.stderr.write(`[${OPTS.face}] ${line}\n`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 子进程输出先吸收（成功路径不刷屏，矩阵 tail 保留本面前缀与探针输出），失败时倒尾部。
function makeTail() {
  const lines = []
  let size = 0
  return {
    absorb(chunk) {
      const text = chunk.toString()
      lines.push(text)
      size += text.length
      while (lines.length > 200 && size > 16_000) size -= lines.shift().length
    },
    dump(label, count = 30) {
      log(`${label}输出尾部：`)
      for (const line of lines.join('').split('\n').slice(-count)) log(`  | ${line}`)
    },
  }
}

async function httpStatus(url, timeoutMs = 1_500) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    return res.status
  } catch {
    return null // 连接失败=端口空闲
  }
}

function spawnDetached(argv, root, envExtra) {
  // detached：进程成为组长，teardown 用 kill(-pid) 整树终止（npm→sh→子链）。
  const child = spawn(argv[0], argv.slice(1), {
    cwd: root,
    env: { ...process.env, ...envExtra },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  const tail = makeTail()
  child.stdout.on('data', (c) => tail.absorb(c))
  child.stderr.on('data', (c) => tail.absorb(c))
  return { child, tail }
}

async function killTree(child) {
  const pid = child.pid
  if (!pid || child.exitCode !== null || child.signalCode !== null) return
  const groupKill = (sig) => {
    try { process.kill(-pid, sig) } catch {
      try { child.kill(sig) } catch { /* 已退出，无进程可杀 */ }
    }
  }
  groupKill('SIGTERM')
  for (let waited = 0; waited < TERM_GRACE_MS; waited += 250) {
    await sleep(250)
    if (child.exitCode !== null || child.signalCode !== null) return
  }
  groupKill('SIGKILL')
  for (let waited = 0; waited < 3_000; waited += 250) {
    await sleep(250)
    if (child.exitCode !== null || child.signalCode !== null) return
  }
  log('警告：终止信号后进程树仍未确认退出（可能已被 init 收养）')
}

async function waitReady(url, deadlineMs, label, failed, tail, dumpLines = 30) {
  const startedAt = Date.now()
  let lastStatus = null
  while (Date.now() - startedAt < deadlineMs) {
    if (failed()) return false
    const status = await httpStatus(url)
    if (status === 200) {
      log(`${label}就绪（GET ${url} → 200，耗时 ${Math.round((Date.now() - startedAt) / 1000)}s）`)
      return true
    }
    if (status !== null && status !== lastStatus) log(`等待${label}就绪：HTTP ${status}`)
    lastStatus = status
    await sleep(POLL_MS)
  }
  log(`${label}就绪超时：${deadlineMs / 1000}s 内 GET ${url} 未得到 200（最后状态 ${lastStatus ?? '连接失败'}）`)
  tail.dump(label, dumpLines)
  return false
}

function runProbe(root) {
  // stdio inherit：探针的 PASS/FAIL 与 evidence 路径直通矩阵日志；退出码即面结果。
  return new Promise((done) => {
    const child = spawn('node', [PROBE], {
      cwd: root,
      env: {
        ...process.env,
        WALK_BASE: VITE_BASE,
        // 默认面（ide-smoke）的既有语义：自起隔离库时空库无会话按环境条件 SKIP。
        ...(isolatedDbDir ? { IDE_SMOKE_ALLOW_NO_SESSION: '1', ISOLATED_HOME_DIR: isolatedDbDir } : {}),
        ...Object.fromEntries(OPTS.probeEnv),
      },
      stdio: 'inherit',
    })
    child.on('error', (err) => {
      log(`探针启动失败：${err.message}`)
      done(1)
    })
    child.on('close', (code) => done(code === 0 ? 0 : (code ?? 1)))
  })
}

async function main() {
  const startedAt = Date.now()
  const root = process.cwd()
  if (!existsSync(resolve(root, 'package.json')) || !existsSync(resolve(root, PROBE))) {
    log(`当前目录不是仓库根或缺少探针脚本：${root}（请在仓库根执行）`)
    return 2
  }
  const viteBusy = await httpStatus(VITE_BASE)
  if (viteBusy !== null) {
    log(`端口 ${VITE_PORT} 已有服务应答（HTTP ${viteBusy}），拒绝接管——先 lsof -ti :${VITE_PORT} 确认无主进程；属其他会话的服务不要杀`)
    return 2
  }

  // 后端：8647 有 /health 应答=活体借用；--isolated 时拒绝借用（写盘型走查只对隔离数据）。
  const backendStatus = await httpStatus(`${BACKEND_BASE}/health`)
  let backend = null
  if (backendStatus === 200 && !OPTS.isolated) {
    log(`后端 ${BACKEND_PORT} 已就绪（活体借用，不接管）`)
  } else if (backendStatus === 200 && OPTS.isolated) {
    log(`后端 ${BACKEND_PORT} 已有服务应答，但 --isolated 模式不许借用别人的后端（要往家目录写数据）——确认端口归属并停掉后再跑`)
    return 2
  } else {
    log(`自起后端：npm run serve（8647；ts-node 冷编译 35-50s，就绪上限 ${BACKEND_READY_TIMEOUT_MS / 1000}s）`)
    // 密闭化（2026-11-26 全面复盘 P7）：serve 态的 DB 目录解析在 isDev 分支写死 cwd/packages/server/data，
    // 故用 NODE_ENV=production + HERMES_WEB_UI_HOME=一次性空目录：production 分支 DB_DIR=HOME 隔离点，
    // 主检出惯态账户库与宿主网关凭据不参与判定；DEV_BOOTSTRAP 是纯 env 门，production 态照常空库建号。
    // 调用方显式已设 HOME 时尊重之。目录保留不删，作为面证据一部分。
    // --isolated：HERMES_HOME（写盘目标）与 HERMES_KANBAN_HOME（看板）也指向隔离目录，
    // 后端 env 追加项（如 HARNESS2_APPLY=1）在此一并注入。
    let bootEnv
    if (process.env.HERMES_WEB_UI_HOME !== undefined) {
      bootEnv = process.env.HERMES_WEB_UI_DEV_BOOTSTRAP === undefined ? { HERMES_WEB_UI_DEV_BOOTSTRAP: '1' } : {}
    } else {
      isolatedDbDir = mkdtempSync(join(tmpdir(), `${OPTS.face}-home-`))
      // 加固（2026-11-26 发版后审查实锤）：只隔 WEB_UI 不够——
      // ① bootstrap 的技能注入器（skill-injector）按 detectHermesRootHome 探测真实 ~/.hermes，
      //    逐档位同步内置技能（实测扫了宿主 57 个技能目录；当次 injected=[] 属内容恰好一致，
      //    换检出即覆盖宿主技能）——HERMES_WEB_UI_DISABLE_SKILL_INJECTION=1 治本；
      // ② 网关自启与 agent-bridge 绑定真实 default 档位（无独立 HOME 开关）——
      //    HERMES_WEB_UI_DISABLE_GATEWAY_AUTOSTART=1 不起；探针只走 UI 不需要网关；
      // ③ 看板根解析序 HERMES_KANBAN_HOME→HERMES_HOME→~/.hermes，agent 面消费 HERMES_HOME——
      //    两个都指隔离目录（2026-11-21 批三隔离配方：只隔 WEB_UI 会读到宿主真实看板）。
      bootEnv = {
        NODE_ENV: 'production',
        HERMES_WEB_UI_HOME: isolatedDbDir,
        HERMES_HOME: isolatedDbDir,
        HERMES_KANBAN_HOME: isolatedDbDir,
        HERMES_WEB_UI_DISABLE_SKILL_INJECTION: '1',
        HERMES_WEB_UI_DISABLE_GATEWAY_AUTOSTART: '1',
        ...(process.env.HERMES_WEB_UI_DEV_BOOTSTRAP === undefined ? { HERMES_WEB_UI_DEV_BOOTSTRAP: '1' } : {}),
        ...(OPTS.isolated
          ? { HERMES_HOME: join(isolatedDbDir, 'hermes'), HERMES_KANBAN_HOME: join(isolatedDbDir, 'kanban') }
          : {}),
        ...Object.fromEntries(OPTS.backendEnv),
      }
      log(`隔离目录：${isolatedDbDir}（teardown 保留，作为面证据）`)
    }
    backend = spawnDetached(['npm', 'run', 'serve'], root, bootEnv)
    let bootFailed = false
    backend.child.on('error', (err) => {
      bootFailed = true
      log(`后端启动失败：${err.message}`)
    })
    const up = await waitReady(`${BACKEND_BASE}/health`, BACKEND_READY_TIMEOUT_MS, '后端', () => bootFailed, backend.tail)
    if (!up) {
      // 2026-11-26 后续批（决策 D19）：后端未就绪也要清理自起进程——原实现在这里直接 return，
      // 自起的后端进程组被留下（detached 成组，不会被后续面的 teardown 收走）。
      log('teardown（后端未就绪）：终止自起进程树')
      await killTree(backend.child)
      return 1
    }
  }

  log(`自起前端：npm run dev（8649；predev 注入约 20s，就绪上限 ${VITE_READY_TIMEOUT_MS / 1000}s）`)
  const vite = spawnDetached(['npm', 'run', 'dev'], root, {})
  let viteFailed = false
  vite.child.on('error', (err) => {
    viteFailed = true
    log(`前端启动失败：${err.message}`)
  })

  let code = 1
  try {
    const ready = await waitReady(VITE_BASE, VITE_READY_TIMEOUT_MS, '前端', () => viteFailed, vite.tail)
    if (!ready) return 1
    log(`执行探针：node ${PROBE}`)
    code = await runProbe(root)
    log(`探针退出码 ${code}`)
    return code
  } finally {
    log('teardown：终止自起进程树（活体借用的后端不动）')
    await killTree(vite.child)
    if (backend) await killTree(backend.child)
    log(`面结束：总耗时 ${Math.round((Date.now() - startedAt) / 1000)}s`)
  }
}

main().then(
  (code) => { process.exitCode = code },
  (err) => {
    log(`包装器异常：${err instanceof Error ? err.stack ?? err.message : String(err)}`)
    process.exitCode = 1
  },
)
