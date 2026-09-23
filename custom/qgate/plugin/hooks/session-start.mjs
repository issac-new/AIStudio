#!/usr/bin/env node
// QGate SessionStart hook：两段输出——
//  A) 全局宿主提醒（与 QGate 无关）：BigModel 高峰期（工作日 14:00-18:00）+ 超长会话预警（≥700 消息，
//     防 GLM-5.3 Anthropic 兼容层 1210 参数错，实录撞线 755）。原 model-peak-guard.sh check 的迁移面：
//     zcode 主机侧用户配置 SessionStart 通道未接线（4 天日志 0 条执行事件，2026-09-23 实证），
//     插件 SessionStart 通道已实证可执行（rtk/qgate mcp 有事件）——提醒逻辑因此挪到本插件。
//  B) QGate 项目约束注入（项目级 opt-in：cwd 有 .qgate/ 才发）。
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readStdinJson, projectRootOf, resolveCli } from './qgate-lib.mjs'

const input = await readStdinJson()
if (!input) process.exit(0)

const messages = []

// ── A1) BigModel 高峰期提醒（对齐 model-peak-guard.sh is_peak_now：周一..周五 14..17 点）──
function isPeakNow(now) {
  const dow = now.getDay() === 0 ? 7 : now.getDay() // JS: 0=周日 → 归一为 ISO 1..7
  const hour = now.getHours()
  return dow >= 1 && dow <= 5 && hour >= 14 && hour <= 17
}
if (isPeakNow(new Date())) {
  messages.push(
    '⚠️ 当前处于工作日 14:00-18:00 高峰期，BigModel 官方渠道已移出 CCswitch 降级队列。' +
    '当前降级顺序（经 CCswitch 代理 127.0.0.1:15721）：① weekly-z.ai ② huoshan ③ kimi-mid ④ kimi-max ⑤ deepseek-v4-flash ⑥ opus5。' +
    '请在 ZCode 选择 ccswitch-proxy provider 以使用自动降级。',
  )
}

// ── A2) 超长会话预警（≥700 消息 → 建议 /compact；阈值可用 QGATE_LONG_SESSION_THRESHOLD 覆盖）──
const THRESHOLD = Number(process.env.QGATE_LONG_SESSION_THRESHOLD ?? 700)
function lastMessageCount(sessionId) {
  if (!sessionId) return undefined
  const day = new Date().toISOString().slice(0, 10)
  const logFile = join(process.env.HOME ?? '', '.zcode', 'cli', 'log', `zcode-${day}.jsonl`)
  if (!existsSync(logFile)) return undefined
  let lines
  try {
    lines = readFileSync(logFile, 'utf8').split('\n')
  } catch {
    return undefined
  }
  let found
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]
    if (!line.includes(sessionId) || !line.includes('model.request.started')) continue
    try {
      const d = JSON.parse(line)
      const n = d?.context?.messageCount
      if (typeof n === 'number' && Number.isFinite(n)) { found = n; break }
    } catch { /* 行坏跳下一行 */ }
  }
  return found
}
const sessionId = String(input.session_id ?? input.sessionId ?? '')
const msgCount = lastMessageCount(sessionId)
if (msgCount !== undefined && msgCount >= THRESHOLD) {
  messages.push(
    `⚠️ 本会话已有 ${msgCount} 条消息（阈值 ${THRESHOLD}）。BigModel GLM-5.3 的 Anthropic 兼容层对超长历史会返回 1210 参数错（实录撞线 755）。` +
    '建议先 /compact 或新开会话 --resume 续跑，再继续大改动。',
  )
}

// ── B) QGate 项目约束注入（项目级 opt-in）──
const cwd = projectRootOf(input)
if (cwd) {
  const qgateDir = join(cwd, '.qgate')
  try {
    appendFileSync(
      join(qgateDir, 'hooks.log'),
      JSON.stringify({ hook: 'SessionStart', at: new Date().toISOString(), source: input.source ?? 'startup', sessionId }),
    )
  } catch { /* no-op */ }

  let line =
    'This project uses QGate quality gates. Blocking gates must hold fresh exercised evidence before you finish a task.'
  const cli = resolveCli()
  if (cli) {
    try {
      const res = spawnSync('node', [cli, 'status', '--json'], {
        cwd,
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      if (res.error || !res.stdout || res.stdout.trim().length === 0) throw new Error('status unavailable')
      const status = JSON.parse(res.stdout)
      const gates = (status.gates ?? []).map((g) => `${g.gateId}[${g.verdict}]`).join(', ')
      line += ` Profile: ${status.profile ?? '(all)'}${status.tier ? ` (tier=${status.tier})` : ''}. Gates: ${gates || '(none configured)'}.`
      line += ' Before finishing, run the gates (e.g. `qgate run --all` via the /qgate-run command) and fix failures.'
    } catch { /* 状态读失败 → 只发基线声明 */ }
  }
  messages.push(line)
}

if (messages.length === 0) process.exit(0)
process.stdout.write(JSON.stringify({ additionalContext: messages.join('\n') }))
process.exit(0)
