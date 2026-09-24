#!/usr/bin/env node
// QGate PreToolUse hook（async 审计面，v0.1 §34.3）。项目级 opt-in。
// 职责（轻量，不跑门）：记录变更事件供影响分析；对超范围写入注入提示。
// 实现：stdin JSON + 审计日志模式（与 post-tool.mjs 同）——绝不 import 编译产物相对路径
// （2026-09-24 复盘教训：../core/loader.js 从 plugin/hooks/ 解析不存在，钩子运行即崩）。
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
const toolInput = input.tool_input ?? input.toolInput ?? {}
const file = typeof toolInput?.file_path === 'string' ? toolInput.file_path
  : typeof toolInput?.path === 'string' ? toolInput.path : undefined

try {
  appendFileSync(join(cwd, '.qgate', 'hooks.log'), JSON.stringify({
    hook: 'PreToolUse', at: new Date().toISOString(), tool, file,
  }) + '\n')
} catch { /* no-op */ }

// 超范围守卫（§34.3 scope guard）：写 .qgate/ 自身的门配置 = 试图改门禁，注入提醒
if (file && (file.includes('/.qgate/gates/') || file.includes('/.qgate/qgate.yaml'))) {
  process.stdout.write(JSON.stringify({
    additionalContext: 'QGate: you are modifying gate configuration (.qgate/). Changing gates to pass a check is a human decision — state the reason in your final answer instead.',
  }))
}
process.exit(0)
