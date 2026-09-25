// /learn 沉淀闭环守门（antigravity：三归宿判定/流程化优先）。
import { describe, it, expect } from 'vitest'
import { distillTarget } from '../learn-distill'

describe('/learn 归宿判定（antigravity 语义）', () => {
  it('流程化→skills；项目范围→rules(convention)；余→memory(preference)', () => {
    expect(distillTarget({ text: 'x', projectScoped: true, procedural: true }).target).toBe('skills')  // 流程化优先
    expect(distillTarget({ text: 'x', projectScoped: true, procedural: false })).toMatchObject({ target: 'rules', memoryType: 'convention' })
    expect(distillTarget({ text: 'x', projectScoped: false, procedural: false })).toMatchObject({ target: 'memory', memoryType: 'preference' })
  })
})
