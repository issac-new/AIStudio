// overlay[expdual] 分类与形态校验测试：主语代理信号、默认 TIP、FACT 禁动作。
import { describe, expect, it } from 'vitest'
import { classifyRule, validateRuleShape } from '../dual-classify'

describe('FACT/TIP 结构初判', () => {
  it('条件-动作句式 → TIP，并解析出条件与动作', () => {
    const c = classifyRule('在「任务需要多个同类对象」条件下：继续检查其他可能位置')
    expect(c.channel).toBe('tip')
    expect(c.condition).toBe('任务需要多个同类对象')
    expect(c.action).toBe('继续检查其他可能位置')
    expect(c.text).toBe('在「任务需要多个同类对象」条件下：继续检查其他可能位置')
    expect(c.rationale).toContain('条件-动作')
  })

  it('句首命令式 → TIP（主语是执行者）', () => {
    const c = classifyRule('使用 openpyxl 检查原始存储值')
    expect(c.channel).toBe('tip')
    expect(c.rationale).toContain('命令式')
  })

  it('环境主语＋陈述式且非句首命令 → FACT', () => {
    expect(classifyRule('workspace/input 目录是上游素材目录').channel).toBe('fact')
    // '必须' 出现在环境约束里不算动作（主语是配置，不是执行者）
    expect(classifyRule('配置必须包含字段 owner').channel).toBe('fact')
    expect(classifyRule('日期字段常见文本型存储').channel).toBe('fact')
  })

  it('信号不足默认 TIP（保守，防 FACT 污染）', () => {
    const c = classifyRule('情况可能有变化')
    expect(c.channel).toBe('tip')
    expect(c.rationale).toContain('默认 TIP')
  })
})

describe('形态校验', () => {
  it('TIP 缺条件或缺动作 → 拒收', () => {
    expect(validateRuleShape({ channel: 'tip', text: '继续检查其他位置' }).ok).toBe(false)
    expect(validateRuleShape({ channel: 'tip', text: '', condition: '任务需要多个同类对象' }).ok).toBe(false)
  })

  it('TIP 可由 text 解析出条件-动作并规范化', () => {
    const r = validateRuleShape({ channel: 'tip', text: '当遇到编码未知的 CSV 时，先用 chardet 探测编码' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.condition).toBe('遇到编码未知的 CSV')
      expect(r.action).toBe('先用 chardet 探测编码')
      expect(r.text).toBe('在「遇到编码未知的 CSV」条件下：先用 chardet 探测编码')
    }
  })

  it('FACT 携带条件/动作或含动作动词 → 拒收', () => {
    const withCond = validateRuleShape({ channel: 'fact', text: '目录是上游素材', condition: '有任务' })
    expect(withCond.ok).toBe(false)
    const withAction = validateRuleShape({ channel: 'fact', text: '使用 openpyxl 读取原始值' })
    expect(withAction.ok).toBe(false)
  })

  it('合法 FACT 原样通过', () => {
    const r = validateRuleShape({ channel: 'fact', text: 'workspace/input 目录是上游素材目录' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.text).toBe('workspace/input 目录是上游素材目录')
  })
})
