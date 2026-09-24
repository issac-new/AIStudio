#!/usr/bin/env node
// QGate PostToolUseFailure hook（async 审计面，v0.1 §34.5）。项目级 opt-in。
// 职责：记录工具失败；给 Agent 注入修复上下文提示（标记证据不完整）。
import { existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

let input = {}
try {
  const raw = await new Promise((resolve, reject) => {
    let data = ''
    process.stdin.on('data', (c) => (data += c))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
  input = raw ? JSON.parse(raw) : {}
} catch {
  process.exit(0)
}

const cwd = typeof input.cwd === 'string' ? input.cwd : process.cwd()
if (!existsSync(join(cwd, '.qgate'))) process.exit(0)

const tool = input.tool_name ?? input.toolName ?? ''
const err = input.error_details ?? input.error ?? {}
try {
  appendFileSync(join(cwd, '.qgate', 'hooks.log'), JSON.stringify({
    hook: 'PostToolUseFailure', at: new Date().toISOString(), tool,
    error: typeof err?.message === 'string' ? err.message.slice(0, 200) : undefined,
  }) + '\n')
} catch { /* no-op */ }

process.stdout.write(JSON.stringify({
  additionalContext: `QGate: tool ${tool} failed. The evidence chain for this step is incomplete — fix the tool failure before claiming the task done, otherwise gates will report INCONCLUSIVE.`,
}))
process.exit(0)
