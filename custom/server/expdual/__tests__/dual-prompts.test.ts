// overlay[expdual] 提示词契约测试：三条硬约束必须出现在提示里（防后续改词洗掉）。
import { describe, expect, it } from 'vitest'
import { BLAME_SCHEMA, buildBlamePrompt, buildInducePrompt, buildSynthesisPrompt, INDUCE_SCHEMA } from '../dual-prompts'

describe('提示词契约', () => {
  it('归因：最多一条、必须定位步骤、找不到返回 null', () => {
    const p = buildBlamePrompt({
      taskRef: 'task-1',
      trajectory: 'step-1 读模板 → step-2 写文件失败',
      rules: ['t-1. 在「模板已知」条件下：先读模板再写'],
    })
    expect(p.system).toContain('最多归因一条规则')
    expect(p.system).toContain('必须指出出错步骤')
    expect(p.system).toContain('ruleId=null')
    expect(p.system).toContain(BLAME_SCHEMA)
    expect(p.user).toContain('task-1')
    expect(p.user).toContain('step-2 写文件失败')
    expect(p.user).toContain('t-1.')
  })

  it('归纳：双阶段、默认 TIP、操作上限与同规则唯一', () => {
    const p = buildInducePrompt({
      success: [{ taskRef: 't-ok', outcome: 'success', text: '直接按列名分组' }],
      failure: [{ taskRef: 't-bad', outcome: 'failure', text: '按位置猜列' }],
      facts: ['f-1. workspace/input 是上游素材目录'],
      tips: ['t-1. 在「编码未知」条件下：先用 chardet 探测编码'],
    })
    expect(p.system).toContain('compare')
    expect(p.system).toContain('success-only')
    expect(p.system).toContain('拿不准默认 TIP')
    expect(p.system).toContain('每批最多 4 条操作')
    expect(p.system).toContain('同一规则最多 1 条操作')
    expect(p.system).toContain(INDUCE_SCHEMA)
    expect(p.user).toContain('t-ok')
    expect(p.user).toContain('t-bad')
    expect(p.user).toContain('workspace/input')
  })

  it('合成：无真矛盾返回 NONE，禁止编造条件', () => {
    const p = buildSynthesisPrompt({ retired: ['t-2. 在「缓存已预热」条件下：检查缓存目录'] })
    expect(p.system).toContain('NONE')
    expect(p.system).toContain('不要为了产出而编造条件')
    expect(p.system).toContain('在什么条件下：做什么')
    expect(p.user).toContain('缓存已预热')
  })

  it('确定性：同输入两次构建完全一致', () => {
    const input = { retired: ['t-2. x'] }
    expect(buildSynthesisPrompt(input)).toEqual(buildSynthesisPrompt(input))
  })
})
