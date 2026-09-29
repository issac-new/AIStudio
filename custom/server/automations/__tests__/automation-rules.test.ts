// A2 守门：automations 纯核——规则校验/事件匹配/简报渲染（防注入边界重点）。
import { describe, it, expect } from 'vitest'
import {
  validateRuleInput, matchEvent, matchPathPattern, renderBriefing,
  type AutomationRule, type AutomationEvent,
} from '../automation-rules'

const baseRule: AutomationRule = {
  id: 'r1',
  name: '新接口补测试',
  enabled: true,
  workspacePath: '/ws/proj',
  source: { type: 'file', pathPattern: 'src/api/**.ts' },
  debounceMs: 2000,
  agent: 'zcode',
  promptTemplate: '为以下变更补测试：{{paths}}',
  createdAt: '2026-09-29T00:00:00Z',
}

describe('A2 规则校验', () => {
  it('合法输入过；非法字段点名（名称/workspace/模板/去抖范围/agent 词表）', () => {
    const ok = validateRuleInput({ name: 'x', workspacePath: '/w', source: { type: 'git', ref: 'main' }, promptTemplate: 'do {{events}}' })
    expect('rule' in ok).toBe(true)
    const bad = validateRuleInput({ name: '', workspacePath: 'relative', source: { type: 'nope' }, promptTemplate: '', debounceMs: 10, agent: 'evil' })
    expect('errors' in bad).toBe(true)
    if ('errors' in bad) {
      expect(bad.errors.name).toBeTruthy()
      expect(bad.errors.workspacePath).toBeTruthy()
      expect(bad.errors.source).toBeTruthy()
      expect(bad.errors.promptTemplate).toBeTruthy()
      expect(bad.errors.debounceMs).toBeTruthy()
      expect(bad.errors.agent).toBeTruthy()
    }
  })
})

describe('A2 事件匹配', () => {
  it('file：** 跨段、* 段内；workspace 必须相等；停用规则不命中', () => {
    const ev = (path: string): AutomationEvent => ({ type: 'file', workspacePath: '/ws/proj', path })
    expect(matchEvent(baseRule, ev('src/api/user.ts'))).toBe(true)
    expect(matchEvent(baseRule, ev('src/api/v2/deep/user.ts'))).toBe(true)
    expect(matchEvent(baseRule, ev('src/core/x.ts'))).toBe(false)
    expect(matchEvent(baseRule, ev('src/apix.ts'))).toBe(false)
    expect(matchEvent(baseRule, { type: 'file', workspacePath: '/other', path: 'src/api/x.ts' })).toBe(false)
    expect(matchEvent({ ...baseRule, enabled: false }, ev('src/api/x.ts'))).toBe(false)
  })

  it('kanban：board+toColumn 过滤；git：ref 尾段匹配；webhook：source+eventType', () => {
    const kanbanRule: AutomationRule = { ...baseRule, source: { type: 'kanban', board: 'main', toColumn: 'review' } }
    expect(matchEvent(kanbanRule, { type: 'kanban', workspacePath: '/ws/proj', board: 'main', taskId: 't1', from: 'todo', to: 'review' })).toBe(true)
    expect(matchEvent(kanbanRule, { type: 'kanban', workspacePath: '/ws/proj', board: 'main', taskId: 't1', from: 'todo', to: 'doing' })).toBe(false)

    const gitRule: AutomationRule = { ...baseRule, source: { type: 'git', ref: 'main' } }
    expect(matchEvent(gitRule, { type: 'git', workspacePath: '/ws/proj', ref: 'refs/heads/main', commits: [] })).toBe(true)
    expect(matchEvent(gitRule, { type: 'git', workspacePath: '/ws/proj', ref: 'refs/heads/dev', commits: [] })).toBe(false)

    const whRule: AutomationRule = { ...baseRule, source: { type: 'webhook', source: 'github', eventType: 'push' } }
    expect(matchEvent(whRule, { type: 'webhook', workspacePath: '/ws/proj', source: 'github', eventType: 'push' })).toBe(true)
    expect(matchEvent(whRule, { type: 'webhook', workspacePath: '/ws/proj', source: 'github', eventType: 'ping' })).toBe(false)
  })

  it('matchPathPattern 边界：空模式全匹配；字面量转义', () => {
    expect(matchPathPattern('', 'anything/x')).toBe(true)
    expect(matchPathPattern('a.b/ts', 'axb/ts')).toBe(false)
    expect(matchPathPattern('a.b/ts', 'a.b/ts')).toBe(true)
  })
})

describe('A2 简报渲染（防注入边界）', () => {
  it('路由头半角 @zcode；事件数据中的 @ 全角化（不再产生第二个 mention）', () => {
    const evil = { type: 'file', workspacePath: '/ws/proj', path: 'x@zcode.ts' }
    const { text } = renderBriefing(baseRule, [evil])
    const atMentions = text.match(/(^|\s)@[A-Za-z0-9]/g) ?? []
    expect(atMentions.length).toBe(1) // 仅路由头
    expect(text).toContain('x＠zcode.ts')
    expect(text.startsWith('@zcode [自动化触发]')).toBe(true)
  })

  it('占位符替换：{{paths}}/{{events}}；事件超限截断标记', () => {
    const events: AutomationEvent[] = Array.from({ length: 60 }, (_, i) => ({
      type: 'file' as const, workspacePath: '/ws/proj', path: `src/api/f${i}.ts`,
    }))
    const { text, truncated } = renderBriefing({ ...baseRule, promptTemplate: '变更：{{paths}}\n明细：{{events}}' }, events)
    expect(truncated).toBe(true)
    expect(text).toContain('src/api/f0.ts')
    expect(text).toContain('src/api/f49.ts')
    expect(text).not.toContain('src/api/f50.ts')
    expect(text).toContain('仅合并前 50 条')
  })

  it('kanban/git/webhook 事件描述含清洗后的外部字段', () => {
    const rule: AutomationRule = { ...baseRule, source: { type: 'kanban' } }
    const { text } = renderBriefing(rule, [{ type: 'kanban', workspacePath: '/ws/proj', board: 'main@evil', taskId: 't1', from: 'todo', to: 'doing' }])
    expect(text).toContain('main＠evil')
    expect(text).toContain('todo → doing')
  })
})
