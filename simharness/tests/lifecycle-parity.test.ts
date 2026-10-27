// lifecycle-parity.test.ts — 判词语料守门（融合批二）：推演套件直接 import 产品
// 治理模块跑同一语料（判定语义单一正本=custom/server/governance/lifecycle，零复制；
// 原 harness-gate-integrity ⑤/⑦/⑧ 与 mux/tests/{verdict-parser-retrial,reqgate-ac3}
// 的 bash 内联实现已退役——本文件承接其语料与期望值，逐字迁移不改判据）。
import { describe, expect, it } from 'vitest'
import {
  combinedGateVerdict, coveredAcs, gateVerdictOfText, uatVerdictFor,
} from '../../custom/server/governance/lifecycle/verdict'
import { judgeRequirementFreeze } from '../../custom/server/governance/lifecycle/requirements'

describe('判词语料（原 ⑤/⑦ 块 + verdict-parser-retrial 全量）', () => {
  const v = (body: string, gate = 'READY-GATE') => gateVerdictOfText(gate, body)

  it('f1979781 转述 stub 原文（成对判词）整行不作判词', () => {
    expect(v('False alarm — the stub itself says "结论行 READY-GATE-PASS 或 READY-GATE-FAIL", tripping my check.')).toBe('')
    expect(v('False alarm — the stub itself says "结论行 READY-GATE-PASS 或 READY-GATE-FAIL", tripping my check. Refining the collision test.')).toBe('')
  })

  it('真实结论行（判词居中/居末）正确取判词', () => {
    expect(v('技能已修补。评审卡 t_11e182b3 落卡复核通过，结论 **ARCH-GATE-PASS**，缺项清单已指名到人。', 'ARCH-GATE')).toBe('PASS')
    expect(v('conclusion: READY-GATE-FAIL')).toBe('FAIL')
    expect(v('无判词消息')).toBe('')
  })

  it('多行末判词赢：打回后复审 PASS 盖过前次 FAIL', () => {
    expect(v('结论 READY-GATE-FAIL（缺项）\n复审完成，结论 READY-GATE-PASS')).toBe('PASS')
  })

  it('卡面 FAIL 优先于房间 PASS（双源保守合并）', () => {
    const room = gateVerdictOfText('READY-GATE', '结论 READY-GATE-PASS')
    const card = gateVerdictOfText('READY-GATE', '七项检查单见派单。结论行 READY-GATE-PASS 或 READY-GATE-FAIL。\n\nconclusion: READY-GATE-FAIL')
    expect(room).toBe('PASS')
    expect(card).toBe('FAIL')
    expect(combinedGateVerdict({ room, card })).toBe('FAIL')
  })

  it('roundN 注记族（run22 复盘根治②语料，原 verdict-parser-retrial 全量）', () => {
    expect(v('结论：READY-GATE-PASS（八节全过）')).toBe('PASS')
    expect(v('结论：READY-GATE-FAIL（缺项）')).toBe('FAIL')
    expect(v('READY-GATE-PASS round12 复核')).toBe('PASS')
    expect(v('结论（round12）：READY-GATE-PASS——清零')).toBe('PASS')
    expect(v('结论（round12，改判重报）: READY-GATE-PASS——阻断缺项清零')).toBe('PASS')
    expect(v('结论（round11，改判）: READY-GATE-FAIL（维持）')).toBe('FAIL')
    expect(v('结论（round9）：READY-GATE-FAIL（总判词维持）')).toBe('FAIL')
    expect(v('结论（round3，改判）: READY-GATE-FAIL → READY-GATE-PASS')).toBe('PASS')
  })

  it('污染防回归（白名单不放宽）', () => {
    expect(v('结论行写 READY-GATE-PASS')).toBe('')
    expect(v('结论行：READY-GATE-PASS 或 READY-GATE-FAIL')).toBe('')
    expect(v('结论（某某转述）：READY-GATE-PASS')).toBe('')
    expect(v('七项检查单见派单。结论行 READY-GATE-PASS 或 READY-GATE-FAIL(附缺项)。')).toBe('')
  })

  it('锚点/前导族', () => {
    expect(v('结论行：READY-GATE-FAIL')).toBe('FAIL')
    expect(v('结论：READY-GATE-PASS')).toBe('PASS')
    expect(v('conclusion: READY-GATE-PASS')).toBe('PASS')
    expect(v('verdict: READY-GATE-FAIL')).toBe('FAIL')
    expect(v('closing: READY-GATE-PASS')).toBe('PASS')
    expect(v('结论行为 READY-GATE-PASS')).toBe('PASS')
    expect(v('- **READY-GATE-PASS** 缺项已补')).toBe('PASS')
    expect(v('1) ARCH-GATE-PASS 五要素齐备', 'ARCH-GATE')).toBe('PASS')
    expect(v('2. READY-GATE-FAIL 缺项')).toBe('FAIL')
    expect(v('READY-GATE-PASS（首过）\n复审结论行\nREADY-GATE-FAIL（回归失败）')).toBe('FAIL')
    expect(v('SECURITY-GATE-PASS')).toBe('')
  })
})

describe('UAT 判词语料（原 ⑧ 块逐字迁移）', () => {
  const BODY_RUN6 = `UAT-EVIDENCE RUN=20261001-v5-run6（G1 冻结清单逐条证据；派单 AC 编号=冻结 RFD-001.freeze.md AC-1/4/5/6/7，冻结条款与首冻逐字一致）
UAT-EVIDENCE AC-1（统一下单幂等=冻结AC-1 L5）通过 — 分支 origin/integration/RFD-001 @ 8dbf5bf（被测 8ec13c3）：①用例 L38
UAT-EVIDENCE AC-2（双渠道调起参数=冻结AC-4 L8 渠道适配）通过 — 同基线：①微信 5 文件
UAT-EVIDENCE AC-3（回调验签拒绝+重复回调幂等=冻结AC-5 L9）通过 — 同基线
UAT-EVIDENCE AC-4（超时关单=冻结AC-6 L10）通过 — 同基线
UAT-EVIDENCE AC-5（收银台双端结果三态=冻结AC-7 L11 前半）通过 — 同基线
UAT-EVIDENCE AC-6（失败重试不重复下单=冻结AC-7 L11 后半）通过 — 同基线
UAT-EVIDENCE AC-7（测试报告全绿）通过 — ①报告 194/194
依据链：G1 冻结 origin/main 3191c11；派单 AC 编号映射——派单AC-1=冻结AC-1、派单AC-2/AC-3=冻结AC-4 双渠道四方法、派单AC-7=报告全绿总检。
[导演代投注记 RUN=20261001-v5-run6] 本结论行原文由 @fanfan-agent 于 DM 线程发出。`

  it('判词按证据行取：通过/有条件通过/不通过/未见', () => {
    const body = '逐条证据已按冻结清单核出。结论先行：**AC-1/AC-2/AC-3/AC-5/AC-6 通过；AC-4、AC-7 有条件通过**（历史缺陷修复未合入 integration 基线，放行权归 bella）。'
    expect(uatVerdictFor(body, 'AC-1')).toBe('通过')
    expect(uatVerdictFor(body, 'AC-4')).toBe('有条件通过')
    expect(uatVerdictFor(body, 'AC-7')).toBe('有条件通过')
    expect(uatVerdictFor(body, 'AC-9')).toBe('未见')
    expect(uatVerdictFor('AC-2 未通过：断言不成立', 'AC-2')).toBe('不通过')
  })

  it('判词耐受括号注（run6 实锤：编号与判词隔全角注不得判"未见"）', () => {
    for (let i = 1; i <= 7; i++) expect(uatVerdictFor(BODY_RUN6, `AC-${i}`)).toBe('通过')
  })

  it('判词含映射归属（括注冻结AC-M 映射时判词同时归属映射目标）', () => {
    const body = 'UAT-EVIDENCE AC-2（双渠道调起参数=冻结AC-4 L8 渠道适配）不通过 — 断言不成立'
    expect(uatVerdictFor(body, 'AC-2')).toBe('不通过')
    expect(uatVerdictFor(body, 'AC-4')).toBe('不通过')
    expect(uatVerdictFor(body, 'AC-5')).toBe('未见')
  })

  it('AC 覆盖整词（AC-1 不被 AC-10 子串误满足）', () => {
    expect(coveredAcs(['AC-1', 'AC-10'], 'AC-10 通过')).toEqual(['AC-1'])
    expect(coveredAcs(['AC-1', 'AC-2'], 'AC-1 通过；AC-2 通过')).toEqual([])
  })
})

describe('G1 判读语料（原 reqgate-ac3 守门迁移）', () => {
  const doc = (acCount: number, firstFuzzy = false) => `# 需求
## 验收标准
${Array.from({ length: acCount }, (_, i) =>
    firstFuzzy && i === 0 ? '- **AC-1** 页面性能良好' : `- **AC-${i + 1}** 点击提交后 200ms 内返回订单号`,
  ).join('\n')}
## Scope-Out
- 不含退款
## 影响面
- 模块：收银台
## 涉敏
- 涉敏：是（ISO27001 摘要见附）
`

  it('AC=2 判缺失并给出实测条数', () => {
    const r = judgeRequirementFreeze(doc(2))
    expect(r.ok).toBe(false)
    expect(r.missing[0]).toContain('少于 3')
    expect(r.missing[0]).toContain('实测 2')
  })

  it('AC=3 四要素齐备通过；模糊词判缺失', () => {
    expect(judgeRequirementFreeze(doc(3)).ok).toBe(true)
    expect(judgeRequirementFreeze(doc(3, true)).ok).toBe(false)
  })
})
