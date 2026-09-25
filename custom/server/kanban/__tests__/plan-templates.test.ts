// 计划/评审范式模板守门（自研模板要素齐+专有红线声明在位）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const DIR = resolve(__dirname, '../../../../runtime/roster/prompts')

describe('Ycode 模板资产（cc 概念自研合规）', () => {
  it('计划模板：目标/验收/非目标/关键文件/阶段门禁/风险回退六要素', () => {
    const t = readFileSync(resolve(DIR, 'plan-template.md'), 'utf8')
    for (const seg of ['目标与验收', '关键文件清单', '阶段', '门禁', '风险与回退', '非目标']) {
      expect(t, `缺 ${seg}`).toContain(seg)
    }
    expect(t).toContain('专有许可红线')
    expect(t).toContain('不抄原文')
  })

  it('评审模板：高信号纪律三类+四态结论+独立验证轮三问', () => {
    const t = readFileSync(resolve(DIR, 'review-template.md'), 'utf8')
    for (const seg of ['高信号', '正确性缺陷', '独立验证', 'REQUEST-CHANGES', '验证者≠实现者']) {
      expect(t, `缺 ${seg}`).toContain(seg)
    }
  })
})
