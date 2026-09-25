// 轮导航 rail 投影守门（dsh TurnNavigator：user 起轮/锚点截断/系统轮合成/时长/摘要）。
import { describe, it, expect } from 'vitest'
import { buildTurnOutline, outlineSummary, type OutlineEvent } from '../adapters/turn-outline'

const e = (kind: 'user' | 'assistant' | 'tool', at: number, over: Partial<OutlineEvent> = {}): OutlineEvent => ({ kind, at, ...over })

describe('turn outline（dsh 语义）', () => {
  it('user 事件起新轮；工具计入当前轮；锚点截 60', () => {
    const outline = buildTurnOutline([
      e('user', 0, { text: '修登录 ' + 'x'.repeat(100) }),
      e('assistant', 100),
      e('tool', 200, { toolName: 'read' }),
      e('tool', 300, { toolName: 'patch' }),
      e('user', 400, { text: '跑测试' }),
      e('assistant', 500),
    ])
    expect(outline).toHaveLength(2)
    expect(outline[0]).toMatchObject({ turnIndex: 0, startIndex: 0, toolCalls: 2, steps: 3 })  // user 不计步
    expect(outline[0].anchor).toHaveLength(60)
    expect(outline[0].durationMs).toBe(300)
    expect(outline[1]).toMatchObject({ turnIndex: 1, startIndex: 4, toolCalls: 0 })
  })

  it('无前置 user 的事件合成系统轮（cron/后台语义）', () => {
    const outline = buildTurnOutline([e('assistant', 0, { text: '后台产出' }), e('tool', 10, { toolName: 'write' })])
    expect(outline).toHaveLength(1)
    expect(outline[0].anchor).toBe('后台产出')
    expect(outline[0].toolCalls).toBe(1)
  })

  it('摘要聚合（rail 行数与工具热度）', () => {
    const outline = buildTurnOutline([
      e('user', 0), e('tool', 50, { toolName: 'a' }),
      e('user', 100), e('assistant', 150),
    ])
    expect(outlineSummary(outline)).toEqual({ turns: 2, toolCalls: 1, avgTurnMs: 50 })  // (50+50)/2
    expect(outlineSummary([])).toEqual({ turns: 0, toolCalls: 0, avgTurnMs: 0 })
  })
})
