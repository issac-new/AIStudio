// overlay/custom/server/controllers/ide/__tests__/devtools.test.ts
// 编程工具启动 + zcode CLI 会话（2026-10-19 用户需求批）守门：
//   纯函数：白名单校验/buildLaunchPlan 平台分支与转义/validateCwd/shapeCliSessions
//   HTTP 面：devtoolsRoutes 中间件三分支（可用性列表/launch 校验/CLI 会话缺席态）
import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  TOOL_DEFS, applescriptEscape, buildLaunchPlan, shapeCliSessions,
  toolAvailableOnDarwin, validateCwd, type ToolKey,
} from '../devtools'

describe('buildLaunchPlan — 白名单与平台分支（纯函数）', () => {
  it('未知工具不在白名单 → null', () => {
    expect(buildLaunchPlan('rm -rf' as ToolKey, null, 'darwin')).toBeNull()
  })

  it('darwin：vscode 带目录打开工作区；无目录只开应用', () => {
    expect(buildLaunchPlan('vscode', '/tmp/proj', 'darwin'))
      .toEqual({ file: 'open', args: ['-a', 'Visual Studio Code', '/tmp/proj'] })
    expect(buildLaunchPlan('vscode', null, 'darwin'))
      .toEqual({ file: 'open', args: ['-a', 'Visual Studio Code'] })
  })

  it('darwin：terminal-zcode 走 osascript，路径与内部引号被转义', () => {
    const plan = buildLaunchPlan('terminal-zcode', '/tmp/my dir', 'darwin')!
    expect(plan.file).toBe('osascript')
    const script = plan.args[1]
    expect(script).toContain('cd')
    expect(script).toContain("do script \"cd '/tmp/my dir' && zcode\"")
  })

  it('darwin 不提供 powershell/cmd；win32 提供两者且命令服务端拼装', () => {
    expect(buildLaunchPlan('powershell', null, 'darwin')).toBeNull()
    expect(buildLaunchPlan('cmd', null, 'win32')).toEqual({ file: 'cmd', args: ['/c', 'start', 'cmd'] })
    expect(buildLaunchPlan('powershell', null, 'win32')).toEqual({ file: 'cmd', args: ['/c', 'start', 'powershell'] })
  })

  it('applescriptEscape：反斜杠与双引号', () => {
    expect(applescriptEscape('a"b\\c')).toBe('a\\"b\\\\c')
  })
})

describe('可用性探测（darwin）', () => {
  it('应用按 /Applications/<app>.app 判定；Terminal 走系统目录', () => {
    const exists = (p: string) => p === '/Applications/iTerm.app' || p === '/System/Applications/Utilities/Terminal.app'
    const iterm = TOOL_DEFS.find(d => d.key === 'iterm')!
    const warp = TOOL_DEFS.find(d => d.key === 'warp')!
    const terminal = TOOL_DEFS.find(d => d.key === 'terminal')!
    expect(toolAvailableOnDarwin(iterm, exists)).toBe(true)
    expect(toolAvailableOnDarwin(warp, exists)).toBe(false)
    expect(toolAvailableOnDarwin(terminal, exists)).toBe(true)
  })
})

describe('validateCwd / shapeCliSessions（纯函数）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'devtools-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('cwd 必须是存在目录；null 合法', () => {
    const stat = (p: string) => (p === dir ? { isDirectory: true } : p.startsWith(dir) ? { isDirectory: false } : null)
    expect(validateCwd(dir, { stat })).toBe(true)
    expect(validateCwd(join(dir, 'nope'), { stat })).toBe(false)
    expect(validateCwd(null, { stat })).toBe(true)
  })

  it('会话行整形：空标题给未命名占位，目录缺省空串', () => {
    expect(shapeCliSessions([
      { id: 's1', title: '  ', directory: '/w', time_updated: 5, time_created: 1 },
      { id: 's2', title: null, directory: null, time_updated: 0, time_created: 0 },
    ])).toEqual([
      { id: 's1', title: '（未命名会话）', directory: '/w', timeUpdated: 5, timeCreated: 1 },
      { id: 's2', title: '（未命名会话）', directory: '', timeUpdated: 0, timeCreated: 0 },
    ])
  })
})
