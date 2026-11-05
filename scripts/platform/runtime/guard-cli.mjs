#!/usr/bin/env node
// guard-cli.mjs — SIM 运行时所有权 CLI（P2 Task 1）。
//
// 子命令：owner-acquire/owner-release/driver-acquire/driver-release/
//         resident-register/resident-unregister/clean-begin/clean-assert/clean-end/lock-status
// 输出：单行 JSON 到 stdout。退出码：0=ok；1=被拒（活锁在位/租约在位/匹配失败）；
// 2=接管竞争失败或状态不可解析（宁停勿抢）；64=用法错误。
// Bash 消费方（run-driver-supervisor/mx-relay/mx-clean/mx-scenario-lib 包装）一律
// 经本 CLI 走 node 子进程，锁语义单一正本=guard.mjs。
import { ownerAcquire, ownerRelease, driverAcquire, driverRelease,
  residentRegister, residentUnregister, cleanBegin, assertNoActiveResidents,
  cleanEnd, lockStatus } from './guard.mjs'

const USAGE = `用法: guard-cli.mjs <子命令> [参数]
  owner-acquire       --sim-root S --kind K --run-id R --pid P --cmd-matcher M
  owner-release       --sim-root S --pid P --instance I
  driver-acquire      --sim-root S [--lock-dir D] --pid P [--run-id R] --cmd-matcher M
  driver-release      --sim-root S [--lock-dir D] --pid P --instance I
  resident-register   --sim-root S --role R --run-id I --pid P --cmd-matcher M
  resident-unregister --sim-root S --role R --run-id I --pid P [--instance I]
  clean-begin         --sim-root S --pid P --cmd-matcher M
  clean-assert        --sim-root S
  clean-end           --sim-root S --pid P --instance I
  lock-status         --sim-root S`

function parseArgs(argv) {
  const cmd = argv[0]
  const out = { _: [] }
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      out[key] = argv[i + 1]
      i++
    } else out._.push(a)
  }
  return { cmd, opts: out }
}

const num = (v) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${v} 需为正整数 pid`)
  return n
}

const [cmd, opts] = (() => {
  const p = parseArgs(process.argv.slice(2))
  return [p.cmd, p.opts]
})()

if (!cmd || cmd === '-h' || cmd === '--help') {
  console.error(USAGE)
  process.exit(cmd ? 0 : 64)
}

try {
  let result
  switch (cmd) {
    case 'owner-acquire':
      result = ownerAcquire({
        simRoot: opts.simRoot, kind: opts.kind, runId: opts.runId ?? null,
        pid: num(opts.pid), cmdMatcher: opts.cmdMatcher,
      })
      break
    case 'owner-release':
      result = ownerRelease({ simRoot: opts.simRoot, pid: num(opts.pid), instance: opts.instance })
      break
    case 'driver-acquire':
      result = driverAcquire({
        simRoot: opts.simRoot, lockDir: opts.lockDir, kind: opts.kind ?? 'driver',
        runId: opts.runId ?? null, pid: num(opts.pid), cmdMatcher: opts.cmdMatcher,
      })
      break
    case 'driver-release':
      result = driverRelease({ simRoot: opts.simRoot, lockDir: opts.lockDir, pid: num(opts.pid), instance: opts.instance })
      break
    case 'resident-register':
      result = residentRegister({
        simRoot: opts.simRoot, role: opts.role, runId: opts.runId ?? null,
        pid: num(opts.pid), cmdMatcher: opts.cmdMatcher,
      })
      break
    case 'resident-unregister':
      result = residentUnregister({
        simRoot: opts.simRoot, role: opts.role, runId: opts.runId ?? null,
        pid: num(opts.pid), instance: opts.instance,
      })
      break
    case 'clean-begin':
      result = cleanBegin({ simRoot: opts.simRoot, pid: num(opts.pid), cmdMatcher: opts.cmdMatcher })
      break
    case 'clean-assert':
      result = assertNoActiveResidents({ simRoot: opts.simRoot })
      break
    case 'clean-end':
      result = cleanEnd({ simRoot: opts.simRoot, pid: num(opts.pid), instance: opts.instance })
      break
    case 'lock-status':
      result = lockStatus({ simRoot: opts.simRoot })
      break
    default:
      console.error(`未知子命令：${cmd}\n${USAGE}`)
      process.exit(64)
  }
  console.log(JSON.stringify(result))
  process.exit(result.ok ? 0 : (result.code ?? 1))
} catch (e) {
  console.log(JSON.stringify({ ok: false, code: 64, reason: e instanceof Error ? e.message : String(e) }))
  process.exit(64)
}
