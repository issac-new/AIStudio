#!/usr/bin/env node
// ide-smoke-walkthrough 矩阵面包装（2026-11-26 全面复盘批 B，spec D3）。
// 自起 dev 全链 → 轮询就绪 → 跑 IDE 冒烟探针 scripts/regression/ide-smoke.mjs
// 并透传其退出码 → teardown 只杀本脚本自起的进程树。仅登记回归矩阵 full 档
// （config/regression-matrix.json）；手动单跑等价：
//   cd <仓库根> && node scripts/regression/run-ide-smoke-face.mjs
//
// 链路构成（实测 2026-11-26）：
//   - 前端 vite：npm run dev（8649；predev 自动 ensure-injected 约 20s），就绪=GET 8649 → 200，上限 90s。
//   - 后端 Koa：npm run serve（8647；ts-node 冷编译 35-50s），就绪=GET /health → 200，上限 150s。
//     8647 已有服务应答时视为活体后端：直接借用，不接管、teardown 不代杀（与 8649 的拒绝语义不同：
//     vite 端口被占无法确定服务身份故拒绝，后端按 /health 判定是同一应用）。
//   - 自起后端默认注入 NODE_ENV=production + HERMES_WEB_UI_HOME=<一次性空目录> +
//     HERMES_WEB_UI_DEV_BOOTSTRAP=1（密闭化）：首登建 super_admin 于隔离 HOME，主检出惯态账户库
//     与宿主网关凭据不参与判定；teardown 不删隔离目录。
//     探针侧随之获得 IDE_SMOKE_ALLOW_NO_SESSION=1（隔离空库无会话，「会话深链」按环境条件 SKIP，
//     不计入失败）。借用活体后端或调用方显式设 TEST_DB_DIR 时两者都不注入，探针按实态判红。
//
// 登录态环境语义（探针假定已认证，实测登录闸三态）：
//   - 活体环境（惯态检出：账户库有 active 账户＋网关凭据已配）：网关一键进入路径接管，历史轮 11/11。
//   - 密闭环境（默认：NODE_ENV=production + HERMES_WEB_UI_HOME=<一次性空目录> + DEV_BOOTSTRAP=1
//     + 探针 ALLOW_NO_SESSION=1）：空库首登建号，探针 10 pass + 1 skip，面退出 0——「会话深链」
//     在空库属环境条件项非产品缺陷。TEST_DB_DIR 不用（serve 态 isDev 分支读不到它）。
//   - 半环境（账户库无 active 账户且无网关凭据）：登录闸拦下全部 UI 步骤（2/10，2026-11-26 实测），
//     处置：激活账户或配网关凭据后再跑，包装器不代改账户库。
//
// 输出统一带 [ide-smoke-walkthrough] 前缀便于矩阵日志识别；仓库根以 process.cwd() 锚定
// （矩阵执行器以仓库根为 cwd 调起各面）。端口被占先 lsof -ti :8649 确认归属，属别人的不要杀。
import { existsSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

const FACE = 'ide-smoke-walkthrough'
const VITE_PORT = 8649
const BACKEND_PORT = 8647
const VITE_BASE = `http://localhost:${VITE_PORT}`
const BACKEND_BASE = `http://127.0.0.1:${BACKEND_PORT}`
const VITE_READY_TIMEOUT_MS = 90_000
const BACKEND_READY_TIMEOUT_MS = 150_000
const POLL_MS = 1_000
const TERM_GRACE_MS = 8_000
const PROBE = 'scripts/regression/ide-smoke.mjs'
// 自起隔离库目录（密闭化时生成；null=借用活体后端或调用方自管）
let isolatedDbDir = null

const log = (line) => process.stderr.write(`[${FACE}] ${line}\n`)
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
        IDE_SMOKE_BASE: VITE_BASE,
        // 仅自起隔离库时许可「无会话」条件跳过（探针只读不造会话，空库本就无深链目标）；
        // 活体借用后端时保持默认，无会话按 FAIL 如实报红。
        ...(isolatedDbDir ? { IDE_SMOKE_ALLOW_NO_SESSION: '1' } : {}),
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

  // 后端：8647 有 /health 应答=活体借用；否则自起并在 teardown 终止。
  const backendStatus = await httpStatus(`${BACKEND_BASE}/health`)
  let backend = null
  if (backendStatus === 200) {
    log(`后端 ${BACKEND_PORT} 已就绪（活体借用，不接管）`)
  } else {
    log(`自起后端：npm run serve（8647；ts-node 冷编译 35-50s，就绪上限 ${BACKEND_READY_TIMEOUT_MS / 1000}s）`)
    // 密闭化（2026-11-26 全面复盘 P7）：serve 态的 DB 目录解析（infrastructure/database/index.ts:12-18）
    // 在 isDev 分支写死 cwd/packages/server/data，HERMES_WEB_UI_TEST_DB_DIR 只对 isTest 生效——
    // 故按既立隔离走查配方（2026-11-13 全功能回归轮）用 NODE_ENV=production + HERMES_WEB_UI_HOME=
    // 一次性空目录：production 分支 DB_DIR=config.appHome=HOME 隔离点，主检出惯态账户库与宿主网关
    // 凭据都不参与判定；DEV_BOOTSTRAP 是纯 env 门（auth.ts:216），production 态照常空库建号。
    // 调用方显式已设 HOME 时尊重之（不再额外设 probe 豁免）。目录保留不删，作为面证据一部分。
    let bootEnv
    if (process.env.HERMES_WEB_UI_HOME !== undefined) {
      bootEnv = process.env.HERMES_WEB_UI_DEV_BOOTSTRAP === undefined ? { HERMES_WEB_UI_DEV_BOOTSTRAP: '1' } : {}
    } else {
      isolatedDbDir = mkdtempSync(join(tmpdir(), 'ide-smoke-home-'))
      bootEnv = {
        NODE_ENV: 'production',
        HERMES_WEB_UI_HOME: isolatedDbDir,
        ...(process.env.HERMES_WEB_UI_DEV_BOOTSTRAP === undefined ? { HERMES_WEB_UI_DEV_BOOTSTRAP: '1' } : {}),
      }
    }
    backend = spawnDetached(['npm', 'run', 'serve'], root, bootEnv)
    let bootFailed = false
    backend.child.on('error', (err) => {
      bootFailed = true
      log(`后端启动失败：${err.message}`)
    })
    const up = await waitReady(`${BACKEND_BASE}/health`, BACKEND_READY_TIMEOUT_MS, '后端', () => bootFailed, backend.tail)
    if (!up) return 1
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
