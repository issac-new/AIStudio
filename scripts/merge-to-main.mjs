#!/usr/bin/env node
// overlay/scripts/merge-to-main.mjs
// 安全合入 main：自动定位 main 所在的 worktree（本仓 main 常被 main-live 占用），
// 拒绝把 main 当特性分支切来切去；main 工作树有代码改动时拒绝合并。
//
// 用法：node scripts/merge-to-main.mjs [--message "merge: ..."]
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()

const branch = git('branch', '--show-current')
if (!branch || branch === 'main') {
  console.error('[merge] 当前在 main 或 detached HEAD，拒绝：请从特性分支运行')
  process.exit(1)
}

const porcelain = git('worktree', 'list', '--porcelain').split('\n')
let mainPath = ''
let currentPath = ''
for (let i = 0; i < porcelain.length; i++) {
  if (porcelain[i].startsWith('worktree ')) {
    const path = porcelain[i].slice('worktree '.length).trim()
    const branchLine = porcelain[i + 2] || ''
    if (branchLine === 'branch refs/heads/main') mainPath = path
    if (branchLine === `branch refs/heads/${branch}`) currentPath = path
  }
}
if (!mainPath) {
  console.error('[merge] 未找到 main worktree（git worktree list）')
  process.exit(1)
}
if (mainPath === currentPath) {
  console.error('[merge] main 与当前分支在同一 worktree，拒绝')
  process.exit(1)
}

const status = execFileSync('git', ['status', '--porcelain'], { cwd: mainPath, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
const codeChanges = status.filter(line => !line.includes('IN-FLIGHT'))
if (codeChanges.length) {
  console.error(`[merge] main worktree 有未提交代码改动，拒绝：\n${codeChanges.slice(0, 10).join('\n')}`)
  process.exit(1)
}
if (status.length) console.warn(`[merge] main worktree 仅 IN-FLIGHT 等元数据改动（${status.length} 项），继续`)

const message = process.argv.includes('--message')
  ? process.argv[process.argv.indexOf('--message') + 1]
  : `merge: ${branch} — IDE 深度重构阶段合入`
const out = execFileSync('git', ['merge', '--no-ff', branch, '-m', message], { cwd: mainPath, encoding: 'utf8' })
console.log(`[merge] main worktree: ${mainPath}`)
console.log(out.trim())
console.log('[merge] OK')
