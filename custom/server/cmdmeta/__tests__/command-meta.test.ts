// 命令面板元数据守门（minimax：三元组过滤/category 分组/visibleWhen 谓词）。
import { describe, it, expect } from 'vitest'
import { commandVisible, panelGroups, type CommandMeta } from '../command-meta'

const cmd = (name: string, over: Partial<CommandMeta> = {}): CommandMeta => ({
  name, category: 'session', discoverability: 'always', visibleWhen: [], ...over,
})

describe('命令面板过滤（minimax 语义）', () => {
  it('discoverability 三档；visibleWhen 谓词（全部命中才显）', () => {
    expect(commandVisible(cmd('a'), { keys: [], typed: false })).toBe(true)  // always 常显
    expect(commandVisible(cmd('b', { discoverability: 'hint' }), { keys: [], typed: false })).toBe(false)
    expect(commandVisible(cmd('b', { discoverability: 'hint' }), { keys: [], typed: true })).toBe(true)
    expect(commandVisible(cmd('c', { discoverability: 'hidden' }), { keys: [], typed: true })).toBe(true)
    expect(commandVisible(cmd('d', { visibleWhen: ['running'] }), { keys: ['running'], typed: false })).toBe(true)
    expect(commandVisible(cmd('d', { visibleWhen: ['running', 'has-session'] }), { keys: ['running'], typed: false })).toBe(false)
  })

  it('category 分组过滤+字典序', async () => {
    const groups = panelGroups([
      cmd('stop', { category: 'session', visibleWhen: ['running'] }),
      cmd('read', { category: 'file' }),
      cmd('run-tests', { category: 'tool', discoverability: 'hint' }),
      cmd('help', { category: 'help' }),
    ], { keys: ['running'], typed: true })
    expect(groups.session).toEqual(['stop'])
    expect(groups.file).toEqual(['read'])
    expect(groups.tool).toEqual(['run-tests'])
    // typed=false 时 hint 档 tool 组空
    const quiet = panelGroups([cmd('run-tests', { category: 'tool', discoverability: 'hint' })], { keys: [], typed: false })
    expect(quiet.tool).toEqual([])
  })
})
