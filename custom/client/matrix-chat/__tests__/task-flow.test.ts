// overlay/custom/client/matrix-chat/__tests__/task-flow.test.ts
// P4③ 任务流转解析守门：四类事件识别 + 非任务消息跳过 + 锚点提取。
import { describe, it, expect } from 'vitest'
import { parseTaskFlow, classifyMessage, shortName } from '../utils/task-flow'

const M = (sender: string, body: string, ts = 1000) => ({ sender, body, ts })

describe('任务流转解析（task-flow）', () => {
  it('派发：card=t_x + @责任人 → dispatch（含任务号与提及）', () => {
    const ev = classifyMessage(M('@fanfan:matrix.test', '@chen-agent @lead-zhang 请处理 card=t_f52893c4 支付收银台系分'))
    expect(ev?.action).toBe('dispatch')
    expect(ev?.taskId).toBe('t_f52893c4')
    expect(ev?.mentions).toEqual(['chen-agent', 'lead-zhang'])
    expect(ev?.actor).toBe('fanfan')
  })

  it('完成回执：【完成回执】<id> → receipt', () => {
    const ev = classifyMessage(M('@chen-agent:matrix.test', '【完成回执】RFD-001 已完成\n系分稿已入仓 commit a1b2c3'))
    expect(ev?.action).toBe('receipt')
    expect(ev?.taskId).toBe('RFD-001')
  })

  it('缺陷：【缺陷】前缀 → defect', () => {
    const ev = classifyMessage(M('@fei-agent:matrix.test', '【缺陷】TEST-FE P2 占位渠道未拦截确认支付 @xiao-agent'))
    expect(ev?.action).toBe('defect')
    expect(ev?.taskId).toBe('TEST-FE')
    expect(ev?.mentions).toEqual(['xiao-agent'])
  })

  it('评审/测试结论：G2 PASS 与 TEST-FAIL → verdict', () => {
    expect(classifyMessage(M('@arch:matrix.test', 'G2 PASS：设计五要素齐备'))?.action).toBe('verdict')
    expect(classifyMessage(M('@qi-agent:matrix.test', 'TEST-FAIL-TEST-FE：回归 2 例红'))?.action).toBe('verdict')
    expect(classifyMessage(M('@arch:matrix.test', 'G2 FAIL：红杠命中未回应'))?.action).toBe('verdict')
  })

  it('非任务消息一律跳过：闲聊/纯 @/无卡号', () => {
    expect(classifyMessage(M('@a', '今天天气不错'))).toBeNull()
    expect(classifyMessage(M('@a', '@b 你好'))).toBeNull()
    expect(classifyMessage(M('@a', 'card=t_f52893c4'))).toBeNull() // 有卡无 @ 不算派发
    expect(classifyMessage(M('@a', ''))).toBeNull()
  })

  it('parseTaskFlow 保序输出 + shortName 归一', () => {
    const events = parseTaskFlow([
      M('@fanfan:matrix.test', '@chen-agent card=t_ab12cd 派发', 100),
      M('@chen-agent:matrix.test', '【完成回执】t_ab12cd 已完成', 200),
      M('@chen:matrix.test', '无关闲聊', 300),
    ])
    expect(events.map((e) => e.action)).toEqual(['dispatch', 'receipt'])
    expect(events.map((e) => e.ts)).toEqual([100, 200])
    expect(shortName('@wei:matrix.test')).toBe('wei')
    expect(shortName('plain')).toBe('plain')
  })

  it('摘要取首行截断 64 字', () => {
    const long = '【缺陷】' + '长'.repeat(100)
    const ev = classifyMessage(M('@a', long))
    expect(ev?.summary.length).toBeLessThanOrEqual(65)
    expect(ev?.summary.endsWith('…')).toBe(true)
  })
})
