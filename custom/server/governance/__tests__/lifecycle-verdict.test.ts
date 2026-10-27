// lifecycle 判词器守门（融合批一）：判词语义正本自 simharness mx_text_gate_verdict
// （mx-scenario-lib.sh:1495）逐字移植，语料=simharness/tests/harness-gate-integrity.test.ts ⑤
// 三案归一回归面（run2 转述污染/f1979781 卡面自毒/run12 模板字面）——两侧判定必须一致，
// 差异即缺陷。UAT 判词语义正本自 mux/uat_verdict.py（run2/run6 沉淀）；AC 覆盖修
// AC-1 被 AC-10 子串误满足缺陷（mx-scenario-lib.sh uat_ac_covered 朴素 case 匹配）。
import { describe, expect, it } from 'vitest'
import {
  combinedGateVerdict, coveredAcs, gateVerdictOfText, uatVerdictFor,
} from '../lifecycle/verdict'

describe('gateVerdictOfText（判词结构锚定，三案归一回归面）', () => {
  const v = (body: string, gate = 'READY-GATE') => gateVerdictOfText(gate, body)

  it('run12 模板字面不作判词：「或」式二选一模板/转述整行弃', () => {
    expect(v('七项检查单见派单。结论行 READY-GATE-PASS 或 READY-GATE-FAIL(附缺项)。')).toBe('')
  })

  it('run12 过渡叙述取末判词：旧判词 → 复审改判 新判词', () => {
    expect(v('conclusion: READY-GATE-FAIL → 复审改判 READY-GATE-PASS')).toBe('PASS')
    expect(v('conclusion: READY-GATE-PASS → 复审改判 READY-GATE-FAIL（回归失败）')).toBe('FAIL')
  })

  it('run2 转述引用不作判词', () => {
    expect(v('fanfan 转述派单原文「结论行 READY-GATE-PASS 或 READY-GATE-FAIL」后讨论了半小时')).toBe('')
  })

  it('指令文本单 token 不作判词', () => {
    expect(v('请注意结论行要写 READY-GATE-PASS 开头，缺项时写 FAIL')).toBe('')
  })

  it('f1979781 卡面自毒：同行成对（PASS…FAIL）且无过渡词=语境不明整行弃', () => {
    expect(v('本卡引用判词契约原文 READY-GATE-PASS 或 READY-GATE-FAIL 作为说明')).toBe('')
  })

  it('行首结论行判 PASS/FAIL（含尾注括号）', () => {
    expect(v('READY-GATE-PASS（七项齐备）')).toBe('PASS')
    expect(v('READY-GATE-FAIL（附缺项：回滚阈值/灰度）')).toBe('FAIL')
    expect(v('ARCH-GATE-PASS', 'ARCH-GATE')).toBe('PASS')
  })

  it('列表符号/编号/加粗前导容忍', () => {
    expect(v('- **READY-GATE-PASS** 缺项已补')).toBe('PASS')
    expect(v('1) ARCH-GATE-PASS 五要素齐备', 'ARCH-GATE')).toBe('PASS')
  })

  it('锚点紧邻判词（含全角冒号归一与「结论行」锚点）', () => {
    expect(v('结论行：READY-GATE-FAIL')).toBe('FAIL')
    expect(v('结论：READY-GATE-PASS')).toBe('PASS')
    expect(v('conclusion: READY-GATE-PASS')).toBe('PASS')
  })

  it('run22 复审轮注记剥离：「结论（roundN，改判…）：X」按末判词读', () => {
    expect(v('结论（round3，改判重报）：READY-GATE-PASS')).toBe('PASS')
    expect(v('结论（round2，改判）：READY-GATE-FAIL')).toBe('FAIL')
    expect(v('结论（round4，维持）：READY-GATE-PASS')).toBe('PASS')
    expect(v('结论（round1）：READY-GATE-FAIL')).toBe('FAIL')
  })

  it('末判词赢：打回后复审结论居末盖过前次（多行）', () => {
    expect(v('上一轮结论行\nREADY-GATE-FAIL（缺三项）\n补齐后复审结论行\nREADY-GATE-PASS（齐备）')).toBe('PASS')
    expect(v('READY-GATE-PASS（首过）\n复审结论行\nREADY-GATE-FAIL（回归失败）')).toBe('FAIL')
  })

  it('非本闸 token 不误判（gate 前缀整词）', () => {
    expect(v('SECURITY-GATE-PASS', 'READY-GATE')).toBe('')
  })
})

describe('combinedGateVerdict（房间行+评审卡双源保守合并）', () => {
  it('FAIL 任一出现即 FAIL；无 FAIL 且任一 PASS 才 PASS', () => {
    expect(combinedGateVerdict({ room: 'PASS', card: 'FAIL' })).toBe('FAIL')
    expect(combinedGateVerdict({ room: '', card: 'PASS' })).toBe('PASS')
    expect(combinedGateVerdict({ room: 'PASS', card: '' })).toBe('PASS')
    expect(combinedGateVerdict({ room: '', card: '' })).toBe('')
  })
})

describe('uatVerdictFor（AC 组共享判词/括号注耐受/冻结映射/后段胜）', () => {
  it('AC 组+判词同段共享（run2 语料）', () => {
    expect(uatVerdictFor('AC-1/AC-2/AC-3/AC-5/AC-6 通过；AC-4、AC-7 有条件通过', 'AC-5')).toBe('通过')
    expect(uatVerdictFor('AC-1/AC-2/AC-3/AC-5/AC-6 通过；AC-4、AC-7 有条件通过', 'AC-7')).toBe('有条件通过')
  })

  it('括号注耐受：编号与判词隔全/半角括号注（run6 语料）', () => {
    expect(uatVerdictFor('AC-1（冻结AC-2 映射）通过', 'AC-1')).toBe('通过')
  })

  it('冻结 AC-M 映射归属包容：判词同时归属段首 AC 与映射目标', () => {
    expect(uatVerdictFor('AC-3（冻结AC-8）不通过', 'AC-8')).toBe('不通过')
    expect(uatVerdictFor('AC-3（冻结AC-8）不通过', 'AC-3')).toBe('不通过')
  })

  it('FAIL/PASS 英文判词归一；间距>40 或越句界不算', () => {
    expect(uatVerdictFor('AC-2 PASS', 'AC-2')).toBe('通过')
    expect(uatVerdictFor('AC-2 FAIL', 'AC-2')).toBe('不通过')
    expect(uatVerdictFor('AC-2 提交记录里 ack FAIL 的旧回执。AC-2 通过', 'AC-2')).toBe('通过')
  })

  it('AC 整词匹配：AC-1 不命中 AC-10', () => {
    expect(uatVerdictFor('AC-10 通过', 'AC-1')).toBe('未见')
  })

  it('多段命中同 AC 取后段（逐条明细行更具体者胜）', () => {
    expect(uatVerdictFor('汇总：AC-4 有条件通过\n明细：AC-4 不通过（余额回退缺失）', 'AC-4')).toBe('不通过')
  })
})

describe('coveredAcs（AC 覆盖缺号清单）', () => {
  it('AC-1 不被 AC-10 子串误满足（原 uat_ac_covered 缺陷根治）', () => {
    expect(coveredAcs(['AC-1', 'AC-10'], '逐条判词：AC-10 通过')).toEqual(['AC-1'])
  })

  it('全覆盖返回空清单', () => {
    expect(coveredAcs(['AC-1', 'AC-2'], 'AC-1 通过；AC-2 通过')).toEqual([])
  })
})
