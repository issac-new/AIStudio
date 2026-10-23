// overlay[delivery]: 协作成熟度三级读数纯函数（2026-10-23 挂账批 D17）。
// 文章三级演进（协作篇 §6）：流程协同→单人主导→数字员工主导；升级扳机=组织垂直化/
// 资产厚度/模型能力——不可直接机判。本模块用介入账本实数据画像「今天站在哪、差什么」，
// 档位判定纯启发式，UI 标注「参考读数非结论」。

import { interventionStats, type InterventionEntry, type InterventionStats } from './interventions'

export interface MaturityLevel {
  key: 'L1' | 'L2' | 'L3'
  name: string
  /** 分工形态（文章口径） */
  thesis: string
  /** 升到下一级的扳机 */
  nextTrigger: string
}

export const MATURITY_LEVELS: MaturityLevel[] = [
  { key: 'L1', name: '一级 · 流程协同', thesis: '各角色照原分工干自己的段，数字员工驻群当上下文中枢', nextTrigger: '组织垂直化、岗位全栈化（一人对一块业务域全面负责）' },
  { key: 'L2', name: '二级 · 单人主导', thesis: '一人指挥数字员工干全程，规划段决策冻结、执行段人只在关键节点出现', nextTrigger: '资产底座变厚（判例/词条/画像越用越准）+ 长任务模型能力' },
  { key: 'L3', name: '三级 · 数字员工主导', thesis: '它找人：依托资产自主推进，人只在被路由到的判断力时刻异步介入', nextTrigger: '——当前探索方向' },
]

export interface MaturityReading {
  /** 协作层介入占比（0-100，一位小数）；低=执行链更多自走 */
  collabSharePct: number
  /** 系统代行率（auto-approve / (auto-approve+确认类介入)，0-100）；高=计划内节点更多自动过闸 */
  autoApproveSharePct: number | null
  /** 催进度次数（等待摩擦代理） */
  nudges: number
  /** 纠错返工次数（理解偏差代理） */
  reworks: number
  /** 介入总量 */
  total: number
}

export interface MaturityAssessment {
  level: MaturityLevel
  /** 启发式档位（当前数据的读数；非组织判定） */
  reading: MaturityReading
  /** 迈向下一级的最短板（数据面观察，一句人话） */
  gapNote: string
  note: string
}

/** stats+autoApprove → 读数（纯函数） */
export function maturityReading(stats: InterventionStats, autoApprove: number): MaturityReading {
  const total = stats.total
  const collabSharePct = total ? Math.round((stats.byLayer.collab / total) * 1000) / 10 : 0
  const confirms = stats.byType.confirm
  const denom = autoApprove + confirms
  const autoApproveSharePct = denom ? Math.round((autoApprove / denom) * 1000) / 10 : null
  return {
    collabSharePct,
    autoApproveSharePct,
    nudges: stats.byType.nudge,
    reworks: stats.byType.rework,
    total,
  }
}

/** 读数 → 档位判定（纯启发式，测试面；文章扳机不可机判，此判定只反映数据形态）：
 *  - 协作层占比 > 70% 且系统代行 < 30% → L1 形态（协作侧仍占大头）
 *  - 协作层占比 ≤ 70% 或系统代行 ≥ 30% → L2 迹象（执行链自走比例上来）
 *  - L3 不由数据判（无「它找人」通道消费面时不宣称） */
export function assessMaturity(entries: InterventionEntry[], autoApprove: number): MaturityAssessment {
  const stats = interventionStats(entries)
  const reading = maturityReading(stats, autoApprove)
  const autoHigh = reading.autoApproveSharePct != null && reading.autoApproveSharePct >= 30
  const isL2Shape = reading.collabSharePct <= 70 || autoHigh
  const level = MATURITY_LEVELS[isL2Shape ? 1 : 0]
  let gapNote: string
  if (!isL2Shape) {
    gapNote = `插手有 ${reading.collabSharePct}% 发生在排活沟通——先把背景给足、词统一叫法，人就能少插话`
  } else if (reading.reworks > 0) {
    gapNote = `活大多自动在跑（该人拍板的节点 ${reading.autoApproveSharePct ?? 0}% 由机器自动过），但仍有 ${reading.reworks} 次干错重来——说明它没领会意图`
  } else {
    gapNote = `活自动在跑、没见干错重来——再往上拼的是家底：判例、词条、画像够不够好查`
  }
  return {
    level,
    reading,
    gapNote,
    note: '这是按数据猜的位置，不是定论；三级的完整含义见文章《协作篇》第 6 章',
  }
}
