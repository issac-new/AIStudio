// 知识库闭环守门（antigravity：通用性准入/检索命中+降权排序）。
import { describe, it, expect } from 'vitest'
import { searchKnowledge, shouldContribute, type KnowledgeEntry } from '../knowledge-loop'

const e = (id: string, text: string, reusability: number): KnowledgeEntry => ({ entryId: id, text, reusability, at: 1 })

describe('知识闭环（antigravity 语义）', () => {
  it('通用性达线才入库；空条目拒', () => {
    expect(shouldContribute('部署要点', 0.8).contribute).toBe(true)
    expect(shouldContribute('今天天气', 0.3).reason).toContain('会话专用')
    expect(shouldContribute('', 0.9).contribute).toBe(false)
  })

  it('检索命中+通用性降权排序', () => {
    const entries = [e('a', '部署流程要点', 0.9), e('b', '部署', 0.2), e('c', '无关', 0.95)]
    const hits = searchKnowledge(entries, ['部署'])
    expect(hits.map((x) => x.entryId)).toEqual(['a', 'b'])  // 命中两；a 分高
    expect(searchKnowledge(entries, ['无此词'])).toEqual([])
    expect(searchKnowledge(entries, ['部署'], 1)).toHaveLength(1)
  })
})
