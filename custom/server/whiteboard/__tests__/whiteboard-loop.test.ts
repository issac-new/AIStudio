// 白板回路守门（qoder：圈选回传聚合/区域校验）。
import { describe, it, expect } from 'vitest'
import { roundTrip, validAnnotation, type BoardAnnotation, type WhiteboardGen } from '../whiteboard-loop'

const gen: WhiteboardGen = { genId: 'g1', kind: 'architecture', at: 1 }
const a = (id: string, region: BoardAnnotation['region'], note: string): BoardAnnotation => ({ annotationId: id, region, note, at: 2 })

describe('白板回路（qoder 语义）', () => {
  it('圈选回传聚合（注释→Agent 指令）；区域校验（0-1 内）', () => {
    const round = roundTrip(gen, [
      a('n1', { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, '这里改成异步'),
      a('n2', { x: 0.5, y: 0.5, w: 0.3, h: 0.3 }, '拆两个服务'),
    ])
    expect(round.feedback).toContain('圈选(0.10,0.10,0.20,0.20): 这里改成异步')
    expect(round.feedback).toContain('拆两个服务')
    expect(roundTrip(gen, []).feedback).toBe('')
    expect(validAnnotation(a('ok', { x: 0, y: 0, w: 1, h: 1 }, 'x'))).toBe(true)
    expect(validAnnotation(a('bad', { x: 0.9, y: 0, w: 0.5, h: 0.5 }, 'x'))).toBe(false)  // 越界
    expect(validAnnotation(a('bad2', { x: -0.1, y: 0, w: 0.5, h: 0.5 }, 'x'))).toBe(false)
  })
})
