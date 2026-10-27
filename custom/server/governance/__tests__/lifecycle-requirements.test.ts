// G1 需求四要素判读守门（融合批一）：语义正本自 simharness reqgate_judge
// （mx-scenario-lib.sh:2160）逐字移植。模糊词只扫 AC 条目行（行首 "- **AC-N"），
// 不扫段落说明行——规则说明行自身引用模糊词示例，扫全段必自指误报（v3 实测 bug）。
import { describe, expect, it } from 'vitest'
import { judgeRequirementFreeze } from '../lifecycle/requirements'

const DOC_OK = `# RFD-001 需求书
## 一、验收标准
- **AC-1** 下单幂等：同一订单号重复提交只产生一笔支付单（可机械化判定）
- **AC-2** 状态机全转移覆盖
## 二、Scope-Out
- 不做多需求并行
## 三、影响面
- 收银台前端、支付核心
## 四、涉敏判定
- 支付资金域=内部-机密（ISO27001 风险评估摘要见 §12）
`

const DOC_NO_AC_SECTION = `# RFD-001
## 一、范围
只有一段
## 二、Scope-Out
- x
## 三、影响面
- y
## 四、涉敏判定
涉敏
`

const DOC_FUZZY = DOC_OK.replace(
  '- **AC-2** 状态机全转移覆盖',
  '- **AC-2** 界面性能良好、体验优秀',
)

describe('judgeRequirementFreeze（G1 四要素）', () => {
  it('四要素齐 → ok', () => {
    expect(judgeRequirementFreeze(DOC_OK)).toEqual({ ok: true, missing: [] })
  })

  it('缺验收标准段或无 AC 编号 → 对应缺失项', () => {
    expect(judgeRequirementFreeze(DOC_NO_AC_SECTION)).toEqual({
      ok: false,
      missing: ['验收标准段缺失或无 AC 编号'],
    })
  })

  it('AC 条目含模糊词（不可机械化判定）', () => {
    const r = judgeRequirementFreeze(DOC_FUZZY)
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('AC 含模糊词（不可机械化判定）')
  })

  it('模糊词在段落说明行不算（自指误报防）', () => {
    const doc = DOC_OK.replace('## 一、验收标准', '## 一、验收标准\n（规则说明：AC 条目禁写"性能良好/快速/稳定"等模糊词）')
    expect(judgeRequirementFreeze(doc)).toEqual({ ok: true, missing: [] })
  })

  it('各缺失项并列返回', () => {
    const r = judgeRequirementFreeze('# 只有标题\n正文无节')
    expect(r.missing).toEqual([
      '验收标准段缺失或无 AC 编号',
      'Scope-Out 缺失',
      '影响面缺失',
      '涉敏判定缺失',
    ])
  })
})
