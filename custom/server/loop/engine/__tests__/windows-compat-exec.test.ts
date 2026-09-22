// 守门:win-x64 命令执行面(S6/S7)。
// - execTemplateCommand:POSIX 保持空白切分 + execFile 历史语义;win32 走
//   cmd.exe 通道(npm/npx 等是 .cmd shim,execFile 直调必 ENOENT/EINVAL)。
// - resolveHermesInvocation:hermes.exe → python -m;venv hermes.cmd/裸名 →
//   cmd.exe /c;POSIX 直 execFile。
import { describe, it, expect } from 'vitest'
import { splitTemplateCommand, buildWindowsCommandArgs, execTemplateCommand } from '../../../runtime/platform-exec'
import { resolveHermesInvocation } from '../../../runtime/hermes-invocation'

describe('splitTemplateCommand(POSIX 历史语义)', () => {
  it('按空白切分并去空段', () => {
    expect(splitTemplateCommand('npm  test -- --watch=false')).toEqual(['npm', 'test', '--', '--watch=false'])
    expect(splitTemplateCommand('   ')).toEqual([])
  })
})

describe('buildWindowsCommandArgs(cmd.exe 包装)', () => {
  it('/d /s /c 包整串', () => {
    expect(buildWindowsCommandArgs('npm test')).toEqual(['/d', '/s', '/c', 'npm test'])
  })
})

describe('execTemplateCommand(POSIX 通路回归)', () => {
  it('空白切分 + 直执行', async () => {
    const { stdout } = await execTemplateCommand('node -p 1+1')
    expect(stdout.trim()).toBe('2')
  }, 15000)
})

describe('resolveHermesInvocation(跨平台解析)', () => {
  const withPyEnv = (val: string | undefined, fn: () => void) => {
    const prev = process.env.HERMES_AGENT_CLI_PYTHON
    if (val === undefined) delete process.env.HERMES_AGENT_CLI_PYTHON
    else process.env.HERMES_AGENT_CLI_PYTHON = val
    try {
      fn()
    } finally {
      if (prev === undefined) delete process.env.HERMES_AGENT_CLI_PYTHON
      else process.env.HERMES_AGENT_CLI_PYTHON = prev
    }
  }

  it('POSIX 直 execFile hermes', () => {
    expect(resolveHermesInvocation('hermes', 'darwin')).toEqual({ command: 'hermes', argsPrefix: [] })
  })

  it('win32 + hermes.exe 无捆绑 python → 直跑 exe', () => {
    withPyEnv(undefined, () => {
      expect(resolveHermesInvocation('C:\\definitely\\missing\\hermes.exe', 'win32')).toEqual({
        command: 'C:\\definitely\\missing\\hermes.exe',
        argsPrefix: [],
      })
    })
  })

  it('win32 + 裸名/venv .cmd → cmd.exe /c 通道(execFile 直跑 .cmd 抛 EINVAL)', () => {
    withPyEnv(undefined, () => {
      const inv = resolveHermesInvocation('hermes', 'win32')
      expect(inv.command.toLowerCase()).toContain('cmd')
      expect(inv.argsPrefix.slice(0, 3)).toEqual(['/d', '/s', '/c'])
      expect(inv.argsPrefix[3]).toBe('hermes')
    })
  })

  it('win32 + HERMES_AGENT_CLI_PYTHON → python -m hermes_cli.main', () => {
    withPyEnv('C:\\py\\python.exe', () => {
      expect(resolveHermesInvocation('C:\\x\\hermes.exe', 'win32')).toEqual({
        command: 'C:\\py\\python.exe',
        argsPrefix: ['-m', 'hermes_cli.main'],
      })
    })
  })
})
