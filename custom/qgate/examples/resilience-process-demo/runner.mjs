// resilience-process-demo——故障注入演练 runner（上游 v1.29 W2 本地方言）：
// 观察协议 stdin {schemaVersion,runId} → stdout JSON。三种场景（QGATE_SCENARIO）：
//   recover（默认）   kill 子进程 → supervisor 真实重启 → 真实健康轮询计时 → 恢复时长
//   process-kill-no-restart  kill 后不重启——观察窗口（3 秒）内端口确无响应（时间不可伪造）
//   healthy           只起进程并探活（正例基线）
// 判定字段（ops resilience 消费）：kind/phase/recovered/recoveryMs/signals/maxRecoveryMs。
// 纪律：runner 只观察不自判——恢复判定由门内核做（recovered 与 recoveryMs 是观察事实）。
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const scenario = process.env.QGATE_SCENARIO ?? 'recover'

function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => { data += c })
    process.stdin.on('end', () => resolve(data))
    // 管道立即关闭/TTY 无输入：300ms 内无数据即按空输入处理（上游 adapter 同款容错）
    const timer = setTimeout(() => { process.stdin.destroy(); resolve(data) }, 300)
    process.stdin.on('end', () => clearTimeout(timer))
    process.stdin.resume()
  })
}

let input = {}
try { input = JSON.parse(await readStdin() || '{}') } catch { /* 与上游一致：协议输入尽力而为 */ }

function startService() {
  const child = spawn(process.execPath, [join(here, 'service.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] })
  return new Promise((resolve) => {
    let buf = ''
    const onLine = (chunk) => {
      buf += chunk
      const m = /SERVICE_READY port=(\d+) pid=(\d+)/.exec(buf)
      if (m) {
        child.stderr.off('data', onLine)
        resolve({ child, port: Number(m[1]), pid: Number(m[2]) })
      }
    }
    child.stderr.on('data', onLine)
    child.on('exit', (code, sig) => { buf += `\nSERVICE_EXIT code=${code} sig=${sig}\n`; onLine('') })
  })
}

async function probe(port, timeoutMs = 800) {
  const t0 = Date.now()
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.ok) return { ok: true, ms: Date.now() - t0 }
  } catch { /* 连接拒绝/超时=未恢复 */ }
  return { ok: false, ms: Date.now() - t0 }
}

async function waitHealthy(port, budgetMs) {
  const t0 = Date.now()
  while (Date.now() - t0 < budgetMs) {
    const r = await probe(port)
    if (r.ok) return Date.now() - t0
    await sleep(150)
  }
  return null
}

const signals = []
const startedAt = Date.now()
let out

if (scenario === 'healthy') {
  const svc = await startService()
  signals.push('service-started')
  const healthy = await probe(svc.port)
  out = {
    kind: 'resilience-process', phase: 'healthy', recovered: healthy.ok,
    recoveryMs: 0, signals: [...signals, healthy.ok ? 'health-probe-ok' : 'health-probe-fail'],
    pid: svc.pid, port: svc.port, maxRecoveryMs: 5000,
  }
  svc.child.kill('SIGTERM')
} else if (scenario === 'process-kill-no-restart') {
  const svc = await startService()
  signals.push('service-started')
  svc.child.kill('SIGKILL')
  signals.push('process-killed')
  // 观察窗口：3 秒内轮询——端口必须确无响应（时间不可伪造；谎报 ready 无法伪造 3 秒静默）
  const windowMs = 3000
  const t0 = Date.now()
  let anyResponse = false
  while (Date.now() - t0 < windowMs) {
    const r = await probe(svc.port, 400)
    if (r.ok) { anyResponse = true; break }
    await sleep(250)
  }
  out = {
    kind: 'resilience-process', phase: 'kill-no-restart', recovered: false,
    recoveryMs: null, signals: [...signals, anyResponse ? 'unexpected-response' : 'port-silent-3s'],
    pid: svc.pid, port: svc.port, windowMs, maxRecoveryMs: 0,
  }
} else {
  // recover：真实终止 → 真实重启 → 真实健康轮询计时
  const svc = await startService()
  signals.push('service-started')
  svc.child.kill('SIGKILL')
  signals.push('process-killed')
  const killedAt = Date.now()
  const restart = await startService()
  signals.push('service-restarted')
  const healthyAfter = await waitHealthy(restart.port, 5000)
  // recoveryMs 口径：kill 时刻 → 重启后首个健康响应（重启+探活全程真实计时）
  const recoveryMs = healthyAfter === null ? null : Date.now() - killedAt
  out = {
    kind: 'resilience-process', phase: 'kill-restart-recover',
    recovered: recoveryMs !== null,
    recoveryMs, signals, pid: restart.pid, port: restart.port, maxRecoveryMs: 5000,
  }
  restart.child.kill('SIGTERM')
}

process.stdout.write(JSON.stringify({ schemaVersion: '0.1', runId: input.runId ?? 'unknown', observedAt: startedAt, scenario, ...out }))
process.exit(0)
