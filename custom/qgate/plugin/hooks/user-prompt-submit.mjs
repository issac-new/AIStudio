#!/usr/bin/env node
// QGate UserPromptSubmit hook（async 审计面，v0.1 §34.2）。项目级 opt-in。
// 职责：记录任务开始事件（Task Run 起点），不阻断普通 prompt（§34.2 明示）。
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

const prompt = typeof input.prompt === 'string' ? input.prompt : ''
try {
  appendFileSync(join(cwd, '.qgate', 'hooks.log'), JSON.stringify({
    hook: 'UserPromptSubmit', at: new Date().toISOString(),
    promptPreview: prompt.slice(0, 120),
  }) + '\n')
} catch { /* no-op */ }
process.exit(0)
