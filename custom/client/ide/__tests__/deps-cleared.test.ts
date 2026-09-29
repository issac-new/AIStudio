// 依赖消除批守门（D2/D3）：
// D3 brief 前缀稳定——squad 简报规则段跨任务字节稳定（prompt cache 命中的请求侧
// 前提，不依赖响应侧增量帧协议）；diffBrief 断言前缀=规则段全长。
// D2 知识闭环——distillTarget 三归宿判定+shouldContribute 通用性线。
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildSquadBriefing } from '../../../server/zcode/squad-protocol'
import { diffBrief } from '../../../server/brief/brief-cache'
import { distillTarget } from '../../../server/learndistill/learn-distill'
import { shouldContribute } from '../../../server/knowledge/knowledge-loop'

describe('D3 brief 前缀稳定（请求侧 prompt-cache 前提）', () => {
  it('squad 简报规则段跨任务字节稳定（前缀=规则段+task_data 定界头）', () => {
    const b1 = buildSquadBriefing('squad-a', { leader: 'l', members: ['m1', 'm2'] }, '任务甲的内容'.repeat(50))
    const b2 = buildSquadBriefing('squad-a', { leader: 'l', members: ['m1', 'm2'] }, '完全不同的任务乙'.repeat(80))
    // 前缀稳定断言：同 squad 两任务的公共前缀必须覆盖到 <task_data> 定界头
    //（规则段全稳定——任务数据只出现在定界头之后）。
    const marker = b2.prompt.indexOf('<task_data>')
    expect(marker).toBeGreaterThan(0)
    const d = diffBrief(b1.prompt, b2.prompt)
    expect(d.prefixChars).toBeGreaterThanOrEqual(marker)
    expect(d.stablePrefix).toContain('规则：')
  })
})

describe('D2 知识闭环判定', () => {
  it('distillTarget 三归宿：流程化→skills；项目范围→rules；余→memory', () => {
    expect(distillTarget({ text: '每次发布先跑清单', projectScoped: false, procedural: true }).target).toBe('skills')
    expect(distillTarget({ text: '这个项目必须用 pnpm', projectScoped: true, procedural: false }).target).toBe('rules')
    expect(distillTarget({ text: '我喜欢简洁回复', projectScoped: false, procedural: false }).target).toBe('memory')
  })
  it('shouldContribute 通用性线：0.8 入库 / 0.4 拒（防会话垃圾）', () => {
    expect(shouldContribute('提交前跑测试', 0.8).contribute).toBe(true)
    const low = shouldContribute('本期 sprint 的排期', 0.4)
    expect(low.contribute).toBe(false)
    expect(low.reason).toContain('会话专用')
  })
})
