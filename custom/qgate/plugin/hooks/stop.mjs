#!/usr/bin/env node
// QGate Stop hook（Phase 2：真内核接线，设计 §5.3 降级阶梯）。
// 流程：opt-in → qgate status --fresh --json（轻检查 <5s，不执行门）→ 全部满足→放行；
//       阻断预算内→block+修复指令；预算耗尽→放行+Risk 登记（degraded）。
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  readStdinJson, projectRootOf, resolveCli, emit,
  stopBudgetState, saveStopBudgetState, canBlock, registerDegradedRisk, isNewOnly,
} from './qgate-lib.mjs'

const input = await readStdinJson()
if (!input) process.exit(0)

const cwd = projectRootOf(input)
if (!cwd) process.exit(0) // 未采纳项目：no-op

const qgateDir = join(cwd, '.qgate')
const sessionId = String(input.session_id ?? input.sessionId ?? '')
const cli = resolveCli()

function log(entry) {
  try {
    appendFileSync(join(qgateDir, 'hooks.log'), JSON.stringify(entry) + '\n')
  } catch { /* no-op */ }
}

// CLI 不可用（未构建）→ 放行并留痕（绝不因框架自身故障卡死 agent）
if (!cli) {
  log({ hook: 'Stop', at: new Date().toISOString(), outcome: 'approve', why: 'cli-unavailable' })
  process.exit(0)
}

let status
try {
  // status 在存在阻断门时按设计退出码 1 —— spawnSync 容忍退出码，只看 stdout
  const res = spawnSync('node', [cli, 'status', '--fresh', '--json'], {
    cwd,
    encoding: 'utf8',
    timeout: 20_000,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if (res.error || !res.stdout || res.stdout.trim().length === 0) throw new Error(res.error?.message ?? 'empty stdout')
  status = JSON.parse(res.stdout)
} catch (e) {
  log({ hook: 'Stop', at: new Date().toISOString(), outcome: 'approve', why: `status-failed:${String(e.message).slice(0, 120)}` })
  process.exit(0) // 框架自身故障 ≠ 阻断（v0.1 §69）
}

// 只认 CLI 计算好的 blocking 字段（isBlockingVerdict 已按 effectivePolicy 求值）——
// 不再对原始 verdict 做 OR 兜底：那会把 warn 档（advisory）的 never-run/INCONCLUSIVE
// 也拦下，违背 D5 内嵌 advisory 语义（claude 双宿主实测逮住的残余缺陷）。
const blocking = (status.gates ?? []).filter((g) => g.blocking === true)
const advisory = (status.advisory ?? []).filter((a) => a && a.gateId)
const state = stopBudgetState(qgateDir, sessionId)

// advisory 可见性（上游 v1.26：advisory 不得静默）：approve 时若存在 CONDITIONAL 门，
// 仍随行提示——放行不等于全绿，未解除条件必须对用户可见。
const advisoryNote = advisory.length > 0
  ? `QGate advisory (non-blocking, must not be silenced): ${advisory.map((a) => `${a.gateId}: ${(a.conditions ?? []).join('; ')}`).join(' | ')}`
  : ''

if (blocking.length === 0) {
  saveStopBudgetState(qgateDir, { sessionId, blocks: 0 })
  log({ hook: 'Stop', at: new Date().toISOString(), outcome: 'approve', gates: (status.gates ?? []).length, advisory: advisory.length })
  emit(advisoryNote ? { decision: 'approve', systemMessage: advisoryNote } : { decision: 'approve' })
}

const detail = blocking
  .map((g) => `${g.gateId}:${g.verdict}${g.freshness ? `(${g.freshness})` : ''}`)
  .join(', ')

// R6 new-only 降级：阻断门全是会话基线里的既有失败且证据仍新鲜（本会话没引入新问题）
// → 放行留痕，不烧阻断预算（上游 blockMode:new-only 本地方言；INCONCLUSIVE 永不降级）。
if (isNewOnly(blocking, state)) {
  log({ hook: 'Stop', at: new Date().toISOString(), outcome: 'approve-new-only', blocking: detail })
  emit({
    decision: 'approve',
    // 上游 v1.26 边界表达：降级放行必须明示"本次报告仍为非 PASS"——不得被读成全绿。
    systemMessage: `QGate new-only downgrade: blocking gates (${detail}) were already failing at session baseline with fresh evidence — no new regressions introduced this session. The report for this session is still NOT all-PASS. Known issues remain tracked; fix them before the next release gate.`,
  })
}

if (!canBlock(state)) {
  registerDegradedRisk(qgateDir, detail)
  saveStopBudgetState(qgateDir, { sessionId, blocks: 0 })
  log({ hook: 'Stop', at: new Date().toISOString(), outcome: 'approve-degraded', blocking: detail })
  emit({
    decision: 'approve',
    systemMessage: `QGate: stop budget exhausted — releasing with registered RISK. Blocking gates remain: ${detail}. A risk entry has been recorded in .qgate/risks/.`,
  })
}

state.blocks += 1
saveStopBudgetState(qgateDir, state)
const final = state.blocks >= 2
log({ hook: 'Stop', at: new Date().toISOString(), outcome: 'block', attempt: state.blocks, blocking: detail })
emit({
  decision: 'block',
  reason: `QGate: quality gates not satisfied: ${detail}`,
  systemMessage:
    `QGate blocking gates: ${detail}.\n` +
    `Run gates now: \`node ${cli} run --all\` (cwd ${cwd}), fix the reported failures, then re-run until all gates PASS.\n` +
    `fix-first: fix artifacts, not acceptance lines — disabling gates, loosening thresholds, adding waivers or rewriting acceptance criteria is an acceptance change requiring explicit registration (qgate waive/intent), never a fix action.\n` +
    (advisoryNote ? `${advisoryNote}\n` : '') +
    (final ? 'This is the FINAL stop budget. If gates still fail on your next finish attempt, the task will be released with a registered risk.' : ''),
})
