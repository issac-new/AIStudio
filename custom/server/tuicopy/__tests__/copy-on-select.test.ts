// TUI 选中即复制守门（kimi：三档/检测矩阵/能力降级）。
import { describe, it, expect } from 'vitest'
import { detectTerminal, terminalCaps, copyOnSelectDecision } from '../copy-on-select'

describe('detectTerminal（检测矩阵）', () => {
  it('多复用键识别；tmux 优先于 TERM_PROGRAM', () => {
    expect(detectTerminal({ TMUX: '/tmp/t', TERM_PROGRAM: 'iTerm.app' })).toBe('tmux')
    expect(detectTerminal({ STY: 'x' })).toBe('screen')
    expect(detectTerminal({ TERM_PROGRAM: 'iTerm.app' })).toBe('iterm2')
    expect(detectTerminal({ TERM_PROGRAM: 'vscode' })).toBe('vscode')
    expect(detectTerminal({ KITTY_WINDOW_ID: '1' })).toBe('kitty')
    expect(detectTerminal({ TERM: 'xterm-256color' })).toBe('xterm')
    expect(detectTerminal({})).toBe('unknown')
  })
  it('能力矩阵：kitty 三能；apple-terminal/xterm 无 osc52', () => {
    expect(terminalCaps('kitty')).toMatchObject({ osc52: true, mouse: true, trueColor: true })
    expect(terminalCaps('apple-terminal').osc52).toBe(false)
    expect(terminalCaps('xterm').osc52).toBe(false)
    expect(terminalCaps('screen').osc52).toBe(false)
  })
})

describe('copyOnSelectDecision（三档）', () => {
  const caps = terminalCaps('kitty')
  it('off=skip；on-select=copy；foreground 按焦点', () => {
    expect(copyOnSelectDecision('off', caps, true)).toBe('skip')
    expect(copyOnSelectDecision('on-select', caps, false)).toBe('copy')
    expect(copyOnSelectDecision('foreground', caps, true)).toBe('copy')
    expect(copyOnSelectDecision('foreground', caps, false)).toBe('defer-until-focus')
  })
  it('无 osc52 能力档自动降级 skip（不发无效序列）', () => {
    const noOsc = terminalCaps('xterm')
    expect(copyOnSelectDecision('on-select', noOsc, true)).toBe('skip')
    expect(copyOnSelectDecision('foreground', noOsc, true)).toBe('skip')
  })
})
