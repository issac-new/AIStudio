// A2 守门（实弹）：git poller 与 file watcher 两条真实事件源端到端——真 git 仓库、
// 真 fs.watch、真定时器（有界等待）。验收锚点：方案 A2「事件源各实测一条规则
// 端到端触发」。kanban/webhook 源走 REST 摄入（automations-rest.test.ts 已覆盖
// 摄入面），此处覆盖需要 OS 设施的两条。
import { describe, it, expect, beforeEach } from 'vitest'
import { execSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AutomationEngine, type AutomationDispatchPort } from '../automation-engine'

const dir = mkdtempSync(join(tmpdir(), 'automations-live-'))

const dispatchCalls: Array<{ workspacePath: string; text: string }> = []
const port: AutomationDispatchPort = {
  dispatch: async (params) => {
    dispatchCalls.push(params)
    return [{ reason: 'dispatched', sessionId: 'live-s' }]
  },
}

function git(cwd: string, args: string): void {
  execSync(`git -C ${JSON.stringify(cwd)} ${args}`, { stdio: 'ignore' })
}

async function waitFor(cond: () => boolean, ms = 8000): Promise<void> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (cond()) return
    await new Promise((r) => setTimeout(r, 100))
  }
}

beforeEach(() => { dispatchCalls.length = 0 })

describe('A2 实弹事件源', () => {
  it('git poller：新提交 → git 事件 → 去抖 → 派发（briefing 含 commit subject）', async () => {
    const repo = join(dir, 'repo')
    mkdirSync(repo, { recursive: true })
    git(repo, 'init -q')
    git(repo, '-c user.email=t@t -c user.name=t commit -q --allow-empty -m "init"')
    const engine = new AutomationEngine({
      storePath: join(dir, 'g-rules.json'),
      historyPath: join(dir, 'g-hist.json'),
      port,
      enableGitPoll: true,
      gitPollIntervalMs: 300,
    })
    try {
      engine.addRule({ name: 'push 检查', workspacePath: repo, source: { type: 'git' }, promptTemplate: '检查新提交 {{events}}', debounceMs: 400 })
      // 首轮 poll 只记基线——等它完成（无派发）
      await new Promise((r) => setTimeout(r, 500))
      expect(dispatchCalls.length).toBe(0)
      git(repo, '-c user.email=t@t -c user.name=t commit -q --allow-empty -m "feat: live poller trigger"')
      await waitFor(() => dispatchCalls.length > 0)
      expect(dispatchCalls[0].workspacePath).toBe(repo)
      expect(dispatchCalls[0].text).toContain('feat: live poller trigger')
      expect(dispatchCalls[0].text.startsWith('@zcode')).toBe(true)
      await waitFor(() => engine.listHistory().length > 0)
      expect(engine.listHistory()[0]).toMatchObject({ reason: 'dispatched', sessionId: 'live-s' })
    } finally {
      engine.dispose()
    }
  }, 20_000)

  it('file watcher：源码文件写入 → file 事件 → 去抖 → 派递（.git 噪声不触发）', async () => {
    const ws = join(dir, 'ws')
    mkdirSync(join(ws, 'src/api'), { recursive: true })
    const engine = new AutomationEngine({
      storePath: join(dir, 'f-rules.json'),
      historyPath: join(dir, 'f-hist.json'),
      port,
    })
    try {
      engine.addRule({ name: 'api 变更', workspacePath: ws, source: { type: 'file', pathPattern: 'src/api/**.ts' }, promptTemplate: '为变更补测试 {{paths}}', debounceMs: 500 })
      engine.syncSources()
      writeFileSync(join(ws, 'src/api/user.ts'), 'export const x = 1\n')
      writeFileSync(join(ws, 'README.md'), 'noise')
      await waitFor(() => dispatchCalls.length > 0)
      expect(dispatchCalls[0].text).toContain('src/api/user.ts')
      // README 同窗口写入但规则 pattern 只认 src/api/**.ts——规则级过滤生效，不进简报
      expect(dispatchCalls[0].text).not.toContain('README.md')
      // 第二轮：只写 .git 噪声文件 → 不派发
      dispatchCalls.length = 0
      mkdirSync(join(ws, '.git'), { recursive: true })
      writeFileSync(join(ws, '.git/config-stress'), 'x')
      await new Promise((r) => setTimeout(r, 1500))
      expect(dispatchCalls.length).toBe(0)
    } finally {
      engine.dispose()
    }
  }, 20_000)
})
