#!/usr/bin/env node
// QGate SessionStart hook：项目级 opt-in；注入真实 Profile 与门约束（additionalContext）。
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { readStdinJson, projectRootOf, resolveCli } from './qgate-lib.mjs'

const input = await readStdinJson()
if (!input) process.exit(0)

const cwd = projectRootOf(input)
if (!cwd) process.exit(0)

const qgateDir = join(cwd, '.qgate')
try {
  appendFileSync(
    join(qgateDir, 'hooks.log'),
    JSON.stringify({ hook: 'SessionStart', at: new Date().toISOString(), source: input.source ?? 'startup', sessionId: input.session_id ?? input.sessionId }) + '\n',
  )
} catch { /* no-op */ }

const cli = resolveCli()
let line =
  'This project uses QGate quality gates. Blocking gates must hold fresh exercised evidence before you finish a task.'
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

process.stdout.write(JSON.stringify({ additionalContext: line }))
process.exit(0)
