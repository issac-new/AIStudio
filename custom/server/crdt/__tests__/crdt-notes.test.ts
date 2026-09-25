// CRDT 共写守门（routa：段落 LWW/seq 决胜/同 seq by 决胜/归因统计）。
import { describe, it, expect } from 'vitest'
import { editAttribution, mergeEdits, renderNote, type NoteState } from '../crdt-notes'

const e = (paraId: string, text: string, by: string, seq: number) => ({ paraId, text, by, seq })

describe('共写合并（Yjs 轻量语义）', () => {
  it('段落 LWW（seq 决胜）；同 seq by 字典序决胜；并发不丢段', () => {
    let state: NoteState = { paragraphs: new Map() }
    state = mergeEdits(state, [e('p1', '人写', 'human', 1), e('p2', 'agent 写', 'agent', 1)])
    state = mergeEdits(state, [e('p1', '人改', 'human', 2)])       // LWW 覆盖
    state = mergeEdits(state, [e('p1', '旧', 'human', 1)])         // 旧 seq 不覆盖
    expect(state.paragraphs.get('p1')!.text).toBe('人改')
    expect(renderNote(state)).toBe('人改\n\nagent 写')
    expect(editAttribution(state)).toEqual({ human: 1, agent: 1 })
  })

  it('同 seq 按 by 字典序决胜（确定性）', () => {
    const a = mergeEdits({ paragraphs: new Map() }, [e('p', 'A', 'zoe', 5)])
    const b = mergeEdits({ paragraphs: new Map() }, [e('p', 'B', 'alice', 5)])
    const merged = mergeEdits(a, [...b.paragraphs.values()])
    expect(merged.paragraphs.get('p')!.by).toBe('zoe')  // zoe > alice 字典序
  })
})
