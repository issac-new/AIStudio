// shell detach 守门（kimi：前台可转/已后台/已结束拒/PTY 提示）。
import { describe, it, expect } from 'vitest'
import { detachShell, type ShellTaskFacts } from '../shell-detach'

const facts = (over: Partial<ShellTaskFacts> = {}): ShellTaskFacts => ({
  taskId: 't1', foreground: true, finished: false, interactivePty: false, ...over,
})

describe('shell detach（kimi Ctrl-B 语义）', () => {
  it('前台未结束可转；已结束/已后台拒；PTY 特别提示', () => {
    const d = detachShell(facts())
    expect(d.verdict).toBe('detached')
    expect(d.backgroundTaskId).toBe('bg-t1')
    expect(detachShell(facts({ finished: true })).verdict).toBe('refused')
    expect(detachShell(facts({ foreground: false })).reason).toContain('已在后台')
    expect(detachShell(facts({ interactivePty: true })).reason).toContain('submit')
  })
})
