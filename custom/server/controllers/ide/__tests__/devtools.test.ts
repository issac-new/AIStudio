// overlay/custom/server/controllers/ide/__tests__/devtools.test.ts
// 编程工具启动 + zcode CLI 会话（2026-10-19 用户需求批；2026-11-10 白名单收窄）守门：
//   纯函数：白名单校验/buildLaunchPlan 平台分支与转义/validateCwd/shapeCliSessions
//   HTTP 面：devtoolsRoutes 中间件三分支（可用性列表/launch 校验/CLI 会话缺席态）
import { afterAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  TOOL_DEFS, ZCODE_CLI_DIST, applescriptEscape, buildLaunchPlan, resolveZcodeCli, shapeCliSessions,
  toolAvailableOnDarwin, validateCwd, type ToolKey,
} from '../devtools'

describe('buildLaunchPlan — 白名单与平台分支（纯函数）', () => {
  it('未知工具不在白名单 → null', () => {
    expect(buildLaunchPlan('rm -rf' as ToolKey, null, 'darwin')).toBeNull()
  })

  it('2026-11-10 收窄守门：退役 key（iterm/vscode/warp/terminal/idea/powershell/cmd）两侧平台均拒绝', () => {
    for (const removed of ['iterm', 'vscode', 'warp', 'terminal', 'idea', 'powershell', 'cmd'] as ToolKey[]) {
      expect(buildLaunchPlan(removed, null, 'darwin')).toBeNull()
      expect(buildLaunchPlan(removed, null, 'win32')).toBeNull()
    }
    expect(TOOL_DEFS.map(d => d.key)).toEqual(['zcode', 'deepseek-harness'])
  })

  it('darwin：zcode / deepseek-harness 走 open -a 应用直启（带 cwd 即附目录参）', () => {
    expect(buildLaunchPlan('zcode', '/tmp/proj', 'darwin'))
      .toEqual({ file: 'open', args: ['-a', 'ZCode', resolve('/tmp/proj')] })
    expect(buildLaunchPlan('deepseek-harness', null, 'darwin'))
      .toEqual({ file: 'open', args: ['-a', 'DeepSeek Harness'] })
  })

  it('darwin：terminal-zcode 走 osascript，路径与内部引号被转义', () => {
    const plan = buildLaunchPlan('terminal-zcode', '/tmp/my dir', 'darwin', { exists: () => false })!
    expect(plan.file).toBe('osascript')
    const script = plan.args[1]
    expect(script).toContain('cd')
    expect(script).toContain("do script \"cd '/tmp/my dir' && zcode\"")
  })

  it('darwin：terminal-zcode 优先受管 fork 源码树 CLI（不依赖 PATH 安装）', () => {
    const exists = (p: string) => p === ZCODE_CLI_DIST
    expect(resolveZcodeCli(exists)).toBe(ZCODE_CLI_DIST)
    const plan = buildLaunchPlan('terminal-zcode', '/tmp/my dir', 'darwin', { exists })!
    const script = plan.args[1]
    expect(script).toContain(`node '${ZCODE_CLI_DIST}'`)
    expect(script).toContain("cd '/tmp/my dir'")
  })

  it('win32：只留 zcode 与 terminal-zcode；命令服务端拼装', () => {
    expect(buildLaunchPlan('zcode', null, 'win32')).toEqual({ file: 'cmd', args: ['/c', 'start', '', 'zcode'] })
    expect(buildLaunchPlan('terminal-zcode', 'C:\\proj', 'win32'))
      .toEqual({ file: 'cmd', args: ['/c', 'start', 'cmd', '/k', 'cd /d C:\\proj && zcode'] })
    // deepseek-harness 仅 darwin（win32 安装形态未实核，不造假按钮）
    expect(buildLaunchPlan('deepseek-harness', null, 'win32')).toBeNull()
  })

  it('applescriptEscape：反斜杠与双引号', () => {
    expect(applescriptEscape('a"b\\c')).toBe('a\\"b\\\\c')
  })
})

describe('可用性探测（darwin）', () => {
  it('白名单两项均按 /Applications/<app>.app 判定；未安装置灰', () => {
    const exists = (p: string) => p === '/Applications/ZCode.app'
    const zcode = TOOL_DEFS.find(d => d.key === 'zcode')!
    const deepseek = TOOL_DEFS.find(d => d.key === 'deepseek-harness')!
    expect(toolAvailableOnDarwin(zcode, exists)).toBe(true)
    expect(toolAvailableOnDarwin(deepseek, exists)).toBe(false)
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

// ── 任务工作区带入（2026-11-10 spec 2026-11-10-ide-devtools-task-cwd）──
describe('buildLaunchPlan — APP 键携带 cwd', () => {
  it('darwin zcode/DSH 带 cwd → open -a <App> <dir>（无 cwd 行为不变）', () => {
    expect(buildLaunchPlan('zcode', '/ws/task-42', 'darwin'))
      .toEqual({ file: 'open', args: ['-a', 'ZCode', resolve('/ws/task-42')] })
    expect(buildLaunchPlan('deepseek-harness', '/ws/task-42', 'darwin'))
      .toEqual({ file: 'open', args: ['-a', 'DeepSeek Harness', resolve('/ws/task-42')] })
    expect(buildLaunchPlan('zcode', null, 'darwin'))
      .toEqual({ file: 'open', args: ['-a', 'ZCode'] })
  })

  it('win32 zcode 带 cwd → start "" /d <dir> zcode（工作目录确定性生效）', () => {
    const plan = buildLaunchPlan('zcode', 'D:\\ws\\task-42', 'win32')
    expect(plan?.file).toBe('cmd')
    expect(plan?.args).toEqual(['/c', 'start', '', '/d', resolve('D:\\ws\\task-42'), 'zcode'])
    expect(buildLaunchPlan('zcode', null, 'win32')).toEqual({ file: 'cmd', args: ['/c', 'start', '', 'zcode'] })
  })
})

// ── Windows APP 本体启动＋open-file 深改（2026-11-10 spec 2026-11-10-zcode-openfile-workspace）──
describe('buildLaunchPlan — win32 zcode APP 本体与回落', () => {
  const EXE = 'C:\\Users\\x\\AppData\\Local\\Programs\\ZCode\\ZCode.exe'
  const withExe = { exists: (p: string) => p === EXE, env: { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' } }

  it('exe 在场＋cwd → 直接启动 APP 本体并附 --open-workspace', () => {
    const plan = buildLaunchPlan('zcode', 'D:\\ws\\task-7', 'win32', withExe)
    expect(plan).toEqual({ file: EXE, args: ['--open-workspace', resolve('D:\\ws\\task-7')] })
  })
  it('exe 在场无 cwd → 裸 APP 本体', () => {
    expect(buildLaunchPlan('zcode', null, 'win32', withExe)).toEqual({ file: EXE, args: [] })
  })
  it('exe 缺席 → 回落 PATH zcode＋start /d（CLI 不认 --open-workspace，不附加）', () => {
    const plan = buildLaunchPlan('zcode', 'D:\\ws\\task-7', 'win32', { exists: () => false, env: { LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' } })
    expect(plan?.file).toBe('cmd')
    expect(plan?.args).toEqual(['/c', 'start', '', '/d', resolve('D:\\ws\\task-7'), 'zcode'])
    expect(plan?.args).not.toContain('--open-workspace')
  })
  it('LOCALAPPDATA 缺失视为 exe 缺席（回落不炸）', () => {
    const plan = buildLaunchPlan('zcode', null, 'win32', { exists: () => false })
    expect(plan).toEqual({ file: 'cmd', args: ['/c', 'start', '', 'zcode'] })
  })
})

describe('zcode-patches 010 内容锁（open-file 深改）', () => {
  it('补丁存在、series 登记、含 open-file 处理与冷启动并入', () => {
    const patchPath = resolve(__dirname, '../../../../..', 'zcode-patches/010-desktop-open-file-workspace.patch')
    expect(existsSync(patchPath), '补丁文件存在').toBe(true)
    const patch = readFileSync(patchPath, 'utf8')
    expect(readFileSync(resolve(__dirname, '../../../../..', 'zcode-patches/series'), 'utf8'))
      .toContain('010-desktop-open-file-workspace.patch')
    expect(patch).toContain('app.on("open-file"')
    expect(patch).toContain('startupOpenWorkspaceRequest')
    expect(patch).toContain('handleOpenWorkspacePath')
    expect(patch).toContain('process.platform === "darwin"')
  })
})
