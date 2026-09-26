// 动态 Bash 契约守门（minimax：schema 裁剪/shell 感知/平台提示）。
import { describe, it, expect } from 'vitest'
import { buildBashSchema, schemaFieldNames, type BashRuntime } from '../dynamic-bash-contract'

const rt = (over: Partial<BashRuntime> = {}): BashRuntime => ({
  platform: 'linux', shell: 'bash', hasWorkspace: true, supportsTimeout: true, ...over,
})

describe('schema 随运行时裁剪', () => {
  it('全能力=四参；无 workspace 无 cwd；无 timeout 支持无 timeout_ms', () => {
    expect(schemaFieldNames(rt())).toEqual(['command', 'cwd', 'timeout_ms'])
    expect(schemaFieldNames(rt({ hasWorkspace: false }))).not.toContain('cwd')
    expect(schemaFieldNames(rt({ supportsTimeout: false }))).not.toContain('timeout_ms')
    expect(schemaFieldNames(rt({ hasWorkspace: false, supportsTimeout: false }))).toEqual(['command'])
  })
})

describe('shell 感知提示', () => {
  it('fish 提示非 POSIX env 前缀；zsh 提示 glob；bash 无提示', () => {
    expect(buildBashSchema(rt({ shell: 'fish' })).description).toContain('NOT POSIX')
    expect(buildBashSchema(rt({ shell: 'zsh' })).description).toContain('zsh')
    expect(buildBashSchema(rt({ shell: 'bash' })).description).toBe('Run a shell command. ' + 'Linux: GNU userland.')
  })
  it('平台提示按 platform 注入', () => {
    expect(buildBashSchema(rt({ platform: 'darwin' })).description).toContain('BSD userland')
    expect(buildBashSchema(rt({ platform: 'win32' })).description).toContain('junctions')
  })
})
