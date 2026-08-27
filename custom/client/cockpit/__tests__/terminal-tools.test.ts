import { describe, it, expect } from 'vitest'
import {
  TERMINAL_TOOLS,
  TERMINAL_TOOL_STORAGE_KEY,
  isTerminalToolId,
  buildToolInitCommand,
  pickDefaultTool,
} from '@/custom/cockpit/terminal/terminal-tools'

describe('terminal-tools registry', () => {
  it('lists tools in priority order: claude-code > codex > deepseek-harness', () => {
    expect(TERMINAL_TOOLS.map((t) => t.id)).toEqual([
      'claude-code',
      'codex',
      'deepseek-harness',
    ])
  })

  it('validates tool ids', () => {
    expect(isTerminalToolId('claude-code')).toBe(true)
    expect(isTerminalToolId('codex')).toBe(true)
    expect(isTerminalToolId('deepseek-harness')).toBe(true)
    expect(isTerminalToolId('pi')).toBe(false)
    expect(isTerminalToolId(null)).toBe(false)
    expect(isTerminalToolId('__proto__')).toBe(false)
  })
})

describe('buildToolInitCommand', () => {
  it('builds the existing claude-code unix command unchanged', () => {
    expect(buildToolInitCommand('claude-code', '/ws/task-1', false)).toBe(
      '(cd "/ws/task-1" && CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude agents --dangerously-skip-permissions --effort max)',
    )
  })

  it('builds claude-code powershell command', () => {
    expect(buildToolInitCommand('claude-code', '/ws/task-1', true)).toBe(
      'Set-Location "/ws/task-1"; $env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1; claude agents --dangerously-skip-permissions --effort max',
    )
  })

  it('builds codex commands with bypass-approvals flag', () => {
    expect(buildToolInitCommand('codex', '/ws/task-1', false)).toBe(
      '(cd "/ws/task-1" && codex --dangerously-bypass-approvals-and-sandbox)',
    )
    expect(buildToolInitCommand('codex', '/ws/task-1', true)).toBe(
      'Set-Location "/ws/task-1"; codex --dangerously-bypass-approvals-and-sandbox',
    )
  })

  it('builds deepseek-harness (dsh) commands with tui profile', () => {
    expect(buildToolInitCommand('deepseek-harness', '/ws/task-1', false)).toBe(
      '(cd "/ws/task-1" && dsh --profile tui)',
    )
    expect(buildToolInitCommand('deepseek-harness', '/ws/task-1', true)).toBe(
      'Set-Location "/ws/task-1"; dsh --profile tui',
    )
  })

  it('escapes double quotes inside workspace path', () => {
    expect(buildToolInitCommand('codex', '/ws/a"b', false)).toBe(
      '(cd "/ws/a\\"b" && codex --dangerously-bypass-approvals-and-sandbox)',
    )
  })

  it('falls back to ~ for empty workspace path', () => {
    expect(buildToolInitCommand('codex', '', false)).toBe(
      '(cd "~" && codex --dangerously-bypass-approvals-and-sandbox)',
    )
  })
})

describe('pickDefaultTool', () => {
  it('prefers saved choice when still installed', () => {
    expect(pickDefaultTool(['claude-code', 'codex'], 'codex')).toBe('codex')
  })

  it('ignores saved choice that is not installed (falls back to priority)', () => {
    expect(pickDefaultTool(['codex'], 'claude-code')).toBe('codex')
  })

  it('ignores invalid saved value', () => {
    expect(pickDefaultTool(['claude-code'], 'pi')).toBe('claude-code')
  })

  it('picks highest priority installed tool when nothing saved', () => {
    expect(pickDefaultTool(['deepseek-harness', 'codex'])).toBe('codex')
    expect(pickDefaultTool(['claude-code', 'codex'])).toBe('claude-code')
    expect(pickDefaultTool(['deepseek-harness'])).toBe('deepseek-harness')
  })

  it('falls back to claude-code when nothing installed / probe unavailable', () => {
    expect(pickDefaultTool([])).toBe('claude-code')
    expect(pickDefaultTool([], 'codex')).toBe('claude-code')
  })
})

describe('storage key', () => {
  it('uses hermes_ prefix consistent with terminal theme key', () => {
    expect(TERMINAL_TOOL_STORAGE_KEY).toBe('hermes_cockpit_terminal_tool')
  })
})
