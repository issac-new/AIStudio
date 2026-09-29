// 任务搜索匹配守门：非字符串字段不得炸（run2 走查实测 b.body.toLowerCase TypeError
// 打死看板视图——api/hermes/kanban 卡面字段不保证 string，契约归一在 util 单点）。
import { describe, expect, it } from 'vitest'
import { taskMatchesQuery } from '../utils/task-search'
import type { KanbanTask } from '@/api/hermes/kanban'

const t = (over: Partial<KanbanTask> = {}): KanbanTask =>
  ({ id: 't_1', title: 'RFD-001 需求分析', body: '正文 Body', status: 'todo', ...over }) as KanbanTask

describe('taskMatchesQuery（字段类型归一）', () => {
  it('body 为对象/数组/数字时不抛且按字符串化内容匹配', () => {
    expect(() => taskMatchesQuery(t({ body: { zh: '收银台' } } as unknown as KanbanTask), 'x')).not.toThrow()
    expect(taskMatchesQuery(t({ body: { zh: '收银台' } } as unknown as KanbanTask), '收银台')).toBe(true)
    expect(taskMatchesQuery(t({ body: [1, 2] } as unknown as KanbanTask), '1,2')).toBe(true)
    expect(taskMatchesQuery(t({ body: 42 } as unknown as KanbanTask), '42')).toBe(true)
  })

  it('title/result/assignee/tenant 非字符串同样不抛', () => {
    const odd = t({
      title: { a: 1 } as unknown as string,
      result: { b: 2 } as unknown as string,
      assignee: 7 as unknown as string,
      tenant: null as unknown as string,
    })
    expect(() => taskMatchesQuery(odd, 'zzz')).not.toThrow()
    expect(taskMatchesQuery(odd, '7')).toBe(true)
  })

  it('空 query 恒真；常规字段大小写不敏感命中', () => {
    expect(taskMatchesQuery(t(), '')).toBe(true)
    expect(taskMatchesQuery(t(), 'rfd-001')).toBe(true)
    expect(taskMatchesQuery(t(), '正文')).toBe(true)
    expect(taskMatchesQuery(t(), 't_1')).toBe(true)
    expect(taskMatchesQuery(t(), '不存在')).toBe(false)
  })
})
