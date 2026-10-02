// overlay/custom/server/contextarchive/__tests__/anchor.test.ts
// C2 守门：三行格式 + 截断（80/60）+ 无工具消息回退 + 纯函数无 IO（源码级断言）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildHandoffAnchor } from '../anchor'

const baseMsgs = [
  { role: 'user', content: '请修复登录崩溃' },
  { role: 'assistant', content: '正在排查', display_role: '助手', tool_name: null },
  { role: 'tool', content: 'bash: npm test 通过', tool_name: 'terminal' },
  { role: 'assistant', content: '已修复并验证', display_role: '助手' },
]

describe('三行机械交接锚点', () => {
  it('格式：窗号行 + 任务行（标题优先）+ 最近动作行（工具消息优先）', () => {
    const lines = buildHandoffAnchor({ windowNumber: 3, sessionTitle: '修复登录', messages: baseMsgs })
    expect(lines).toEqual([
      'Context window #3 opened',
      '任务：修复登录',
      '最近动作：terminal bash: npm test 通过',
    ])
  })

  it('任务行回退：无标题用窗内第一条 user 消息；截断 80 字符', () => {
    const long = '长'.repeat(120)
    const lines = buildHandoffAnchor({ windowNumber: 1, sessionTitle: null, messages: [{ role: 'user', content: long }] })
    expect(lines[1]).toBe(`任务：${'长'.repeat(80)}`)
    expect(lines[1]!.length).toBe('任务：'.length + 80)
    // 标题与首 user 都缺：诚实占位
    const empty = buildHandoffAnchor({ windowNumber: 1, sessionTitle: null, messages: [{ role: 'assistant', content: 'x' }] })
    expect(empty[1]).toBe('任务：（无标题且窗内无 user 消息）')
  })

  it('最近动作行：无工具消息回退最后一条 assistant（display_role+内容头 60）；截断 60 字符', () => {
    const noTool = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a1', display_role: '助手A' },
      { role: 'assistant', content: '最后回复', display_role: '助手B' },
    ]
    const lines = buildHandoffAnchor({ windowNumber: 2, sessionTitle: 't', messages: noTool })
    expect(lines[2]).toBe('最近动作：助手B 最后回复')
    // 截断：tool_name+content 拼接头 60 字符
    const longTool = buildHandoffAnchor({
      windowNumber: 1, sessionTitle: 't',
      messages: [{ role: 'tool', content: 'x'.repeat(100), tool_name: 'terminal' }],
    })
    expect(longTool[2]).toBe(`最近动作：terminal ${'x'.repeat(60)}`.slice(0, '最近动作：'.length + 60))
    expect(longTool[2]!.length).toBe('最近动作：'.length + 60)
  })

  it('守门：纯函数无 IO（源码无 fs/http/net/child_process/require/fetch）', () => {
    const src = readFileSync(join(__dirname, '../anchor.ts'), 'utf8')
    expect(src).not.toMatch(/from ['"]node:(fs|http|https|net|child_process|os|dns|tls)/)
    expect(src).not.toMatch(/\brequire\s*\(/)
    expect(src).not.toMatch(/\bfetch\s*\(/)
    expect(src).not.toMatch(/\bspawn|execSync|readFile|writeFile\b/)
  })
})
