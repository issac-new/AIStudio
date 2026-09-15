// 守门测试:patch 265/266(server 侧 ACP + 麒麟发现兜底)的跨平台逻辑。
//
// 背景:SwarmStudio 长期只在 macOS 上开发发布,Windows/麒麟上的 ACP 调用与
// 命令发现积累了一批平台假设。此测试锁定四个修复点:
//   1. child-env win32 大小写归一(Windows 注册的是 Path/windir)
//   2. command-path-scan which 缺失时的 PATH 直扫(精简麒麟镜像无 which)
//   3. acp-turn 对 stdout 非 JSON 行(横幅/杀软注入)的容错
//   4. 上述容错的上限(垃圾行淹没输出时仍然失败,不静默吞协议错误)
import { describe, it, expect, afterEach } from 'vitest'
import { PassThrough } from 'node:stream'
import { EventEmitter } from 'node:events'
// 本文件放在 custom/upstream-compat(而非 custom/server):custom/server 会被
// inject 符号链接进上游 server/src/custom,相对 import 在 tsc 的符号链接视角下
// 解析错位;此目录只由 overlay vitest 加载,走真实路径。
import { isolatedCodingAgentChildEnv } from '../../../../upstream/hermes-studio/packages/server/src/modules/coding-agents/services/runtime/child-env'
import { pathEntries, scanPathForCommand } from '../../../../upstream/hermes-studio/packages/server/src/modules/coding-agents/services/runtime/command-path-scan'
import { DshAcpTurn } from '../../../../upstream/hermes-studio/packages/server/src/modules/coding-agents/services/dsh/acp-turn'

const originalPlatform = process.platform
function stubPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}
afterEach(() => stubPlatform(originalPlatform))

describe('isolatedCodingAgentChildEnv (patch 265: win32 大小写归一)', () => {
  it('POSIX 保持大小写敏感:Path 不在允许清单内会被丢弃', () => {
    stubPlatform('darwin')
    const env = isolatedCodingAgentChildEnv({}, { PATH: '/usr/bin', Path: '/spoof', HOME: '/u' } as NodeJS.ProcessEnv)
    expect(env.PATH).toBe('/usr/bin')
    expect(env.Path).toBeUndefined()
    expect(env.HOME).toBe('/u')
  })

  it('win32 大小写不敏感匹配:Path/windir 等原始大小写被保留', () => {
    stubPlatform('win32')
    const env = isolatedCodingAgentChildEnv(
      {},
      { Path: 'C:\\bin', windir: 'C:\\Windows', SystemRoot: 'C:\\Windows', NODE_ENV: 'production' } as NodeJS.ProcessEnv,
    )
    expect(env.Path).toBe('C:\\bin')
    expect(env.windir).toBe('C:\\Windows')
    expect(env.SystemRoot).toBe('C:\\Windows')
    expect(env.NODE_ENV).toBeUndefined()
  })

  it('launchEnv 始终全量覆盖(原有语义不变)', () => {
    stubPlatform('win32')
    const env = isolatedCodingAgentChildEnv(
      { Path: 'C:\\launch', SECRET: 'x' },
      { Path: 'C:\\bin' } as NodeJS.ProcessEnv,
    )
    expect(env.Path).toBe('C:\\launch')
    expect(env.SECRET).toBe('x')
  })
})

describe('scanPathForCommand (patch 266: which 缺失兜底)', () => {
  it('pathEntries 兼容 Windows 的 Path 键名', () => {
    expect(pathEntries({ Path: '/a:/b' } as NodeJS.ProcessEnv)).toEqual(['/a', '/b'])
    expect(pathEntries({ PATH: '/a' } as NodeJS.ProcessEnv)).toEqual(['/a'])
    expect(pathEntries({} as NodeJS.ProcessEnv)).toEqual([])
  })

  it('POSIX:按 PATH 目录直扫命中绝对路径', () => {
    stubPlatform('darwin')
    const exists = (p: string) => p === '/usr/local/bin/dsh'
    expect(scanPathForCommand('dsh', { PATH: '/usr/bin:/usr/local/bin' } as NodeJS.ProcessEnv, exists))
      .toEqual(['/usr/local/bin/dsh'])
  })

  it('win32:按 PATHEXT 后缀展开候选(后缀统一小写比较)', () => {
    stubPlatform('win32')
    const exists = (p: string) => p === '/npm/dsh.cmd'
    expect(scanPathForCommand('dsh', { Path: '/npm', PATHEXT: '.COM;.EXE;.BAT;.CMD' } as NodeJS.ProcessEnv, exists))
      .toEqual(['/npm/dsh.cmd'])
  })

  it('win32:无 PATHEXT 时用默认后缀集', () => {
    stubPlatform('win32')
    const exists = (p: string) => p === '/npm/dsh.exe'
    expect(scanPathForCommand('dsh', { Path: '/npm' } as NodeJS.ProcessEnv, exists))
      .toEqual(['/npm/dsh.exe'])
  })

  it('带路径分隔符的命令不做 PATH 扫描', () => {
    expect(scanPathForCommand('/usr/bin/dsh', { PATH: '/usr/bin' } as NodeJS.ProcessEnv, () => true)).toEqual([])
    expect(scanPathForCommand('', { PATH: '/usr/bin' } as NodeJS.ProcessEnv, () => true)).toEqual([])
  })
})

function fakeChild() {
  const child = new EventEmitter() as any
  child.stdout = new PassThrough()
  child.stdin = new PassThrough()
  return child
}

describe('DshAcpTurn 分帧容错 (patch 265: 非 JSON 行不再杀会话)', () => {
  it('横幅/警告行被跳过,后续 JSON-RPC 响应正常送达', async () => {
    const child = fakeChild()
    const turn = new DshAcpTurn(child, { update: () => {}, session: () => {}, config: () => {} })
    const initialized = (turn as any).request('initialize', {}, 2_000)
    child.stdout.write('npm warn bogus banner line\r\n')
    child.stdout.write('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}\n')
    await expect(initialized).resolves.toEqual({ protocolVersion: 1 })
    ;(turn as any).dispose()
  })

  it('CRLF 行尾仍可解析(Windows 管道)', async () => {
    const child = fakeChild()
    const turn = new DshAcpTurn(child, { update: () => {}, session: () => {}, config: () => {} })
    const initialized = (turn as any).request('initialize', {}, 2_000)
    child.stdout.write('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}\r\n')
    await expect(initialized).resolves.toEqual({ protocolVersion: 1 })
    ;(turn as any).dispose()
  })

  it('垃圾行超过 64 条时判定协议破坏,请求被拒绝', async () => {
    const child = fakeChild()
    const turn = new DshAcpTurn(child, { update: () => {}, session: () => {}, config: () => {} })
    const initialized = (turn as any).request('initialize', {}, 2_000)
    for (let i = 0; i < 70; i += 1) child.stdout.write(`garbage ${i}\n`)
    child.stdout.write('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}\n')
    await expect(initialized).rejects.toThrow(/too many non-JSON/)
  })
})
