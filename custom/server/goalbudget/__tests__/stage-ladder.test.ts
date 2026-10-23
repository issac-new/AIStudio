// 阶梯干预机制库守门（2026-10-23 HarnessPro 吸收轮 HP-3）。
// 锚：HarnessPro repo hook.py——economy/strict/finalize 递进 + reminder 重发 + 交卷文案。
import { describe, it, expect } from 'vitest'
import {
  STAGE_TIER_PRESETS, escalationMessage, parseHookPolicy, stageAt,
  strictReminderDue, thresholdsValid,
} from '../stage-ladder'

describe('stage-ladder：三档预设与阈值合法性', () => {
  it('三档预设全部合法且严格递增（economy<strict<finalize）', () => {
    for (const t of Object.values(STAGE_TIER_PRESETS)) {
      expect(thresholdsValid(t)).toBe(true)
    }
  })

  it('lite 收敛早于 medium 早于 heavy（同机制不同旋钮）', () => {
    expect(STAGE_TIER_PRESETS.lite.economyAfter).toBeLessThan(STAGE_TIER_PRESETS.medium.economyAfter)
    expect(STAGE_TIER_PRESETS.medium.economyAfter).toBeLessThan(STAGE_TIER_PRESETS.heavy.economyAfter)
  })

  it('非法阈值（非递增/越界）被拒', () => {
    expect(thresholdsValid({ economyAfter: 0.7, strictAfter: 0.5, finalizeAfter: 1, strictReminderEvery: 8 })).toBe(false)
    expect(thresholdsValid({ economyAfter: 0, strictAfter: 0.5, finalizeAfter: 1, strictReminderEvery: 8 })).toBe(false)
    expect(thresholdsValid({ economyAfter: 0.3, strictAfter: 0.6, finalizeAfter: 1.5, strictReminderEvery: 8 })).toBe(false)
  })
})

describe('stageAt：阶段判定边界', () => {
  const t = STAGE_TIER_PRESETS.medium // 0.40 / 0.70 / 1.0，maxSteps=100
  it('40 步进 economy、70 步进 strict、超 100 步 finalize', () => {
    expect(stageAt(39, 100, t)).toBe('normal')
    expect(stageAt(40, 100, t)).toBe('economy')
    expect(stageAt(69, 100, t)).toBe('economy')
    expect(stageAt(70, 100, t)).toBe('strict')
    expect(stageAt(100, 100, t)).toBe('strict') // 达 finalize 比例但未超
    expect(stageAt(101, 100, t)).toBe('finalize')
  })

  it('maxSteps≤0（无预算）恒 normal', () => {
    expect(stageAt(999, 0, t)).toBe('normal')
  })
})

describe('strictReminderDue：收敛警告按间隔重发', () => {
  const t = { ...STAGE_TIER_PRESETS.medium, strictReminderEvery: 4 }
  it('strict 起点重发，之后每 4 步再发；economy/normal 不发', () => {
    expect(strictReminderDue(70, 100, t)).toBe(true)
    expect(strictReminderDue(71, 100, t)).toBe(false)
    expect(strictReminderDue(74, 100, t)).toBe(true)
    expect(strictReminderDue(50, 100, t)).toBe(false) // economy 区
    expect(strictReminderDue(10, 100, t)).toBe(false) // normal 区
  })
})

describe('escalationMessage：三档文案（hook.py 语义对译）', () => {
  it('economy=合并检查/停复读；strict=停广泛探索/收尾；finalize=保留现场交卷；normal 无消息', () => {
    expect(escalationMessage('economy')).toContain('合并')
    expect(escalationMessage('strict')).toContain('收敛')
    expect(escalationMessage('finalize')).toContain('保留当前文件')
    expect(escalationMessage('normal')).toBeNull()
  })
})

describe('parseHookPolicy：runtime/policy.json 阈值声明解析', () => {
  it('合法声明（14<26<44）按 maxSteps 归一为比例阈值', () => {
    const t = parseHookPolicy(JSON.stringify({ economy_after_tools: 14, strict_after_tools: 26, finalize_after_tools: 44 }), 100)
    expect(t).not.toBeNull()
    expect(t!.economyAfter).toBeCloseTo(0.14)
    expect(thresholdsValid(t!)).toBe(true)
  })

  it('缺文件/坏 JSON/缺键/非递增 → null（调用方如实报缺）', () => {
    expect(parseHookPolicy(undefined, 100)).toBeNull()
    expect(parseHookPolicy('not json', 100)).toBeNull()
    expect(parseHookPolicy(JSON.stringify({ economy_after_tools: 14 }), 100)).toBeNull()
    expect(parseHookPolicy(JSON.stringify({ economy_after_tools: 30, strict_after_tools: 26, finalize_after_tools: 44 }), 100)).toBeNull()
    expect(parseHookPolicy(JSON.stringify({ economy_after_tools: 14, strict_after_tools: 26, finalize_after_tools: 44 }), 0)).toBeNull()
  })
})
