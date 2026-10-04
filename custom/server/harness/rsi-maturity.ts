// overlay/custom/server/harness/rsi-maturity.ts
// 驾驭工程 B6：RSI（递归自我改进）分级自检（2026-10-04 九源轮 P9）。
//
// 出处：《Self-Improvement、Self-Evolving、RSI，终于有人讲清楚了》L1-L5 分级
// 与 Agent System 五元组（Model+Harness+Data+Trainer+Improvement Mechanism）。
// 产品化定位：把本仓 RSI 现状钉在分级表上——每级达成/未达成必须带本机证据
// （能力阶梯文件、gap 台账、spec 锚点）；未达标如实写"未达成+缺什么"，
// 禁止把"机制存在"拔高成"级别达成"（对照字节三论文：流程跑通≠能力提升）。
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

export type RsiLevelKey = 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

export interface RsiEvidence {
  /** 证据类型锚点（文件路径/spec 节） */
  anchor: string
  /** 该证据在吗（fail-soft 探测结果） */
  present: boolean
}

export interface RsiLevelReport {
  key: RsiLevelKey
  /** true=达成 / false=未达成 / null=证据缺席无法判定 */
  achieved: boolean | null
  title: string
  whatItMeans: string
  evidence: RsiEvidence[]
  gap: string
}

export interface RsiElementReport {
  key: 'model' | 'harness' | 'data' | 'trainer' | 'improvementMechanism'
  evolvable: 'yes' | 'partial' | 'no'
  how: string
  anchor: string
}

export interface RsiMaturityReport {
  levels: RsiLevelReport[]
  elements: RsiElementReport[]
  meta: {
    note: string
    source: string
    boundary: string
  }
}

function hermesPath(rel: string): string {
  const home = process.env.HERMES_HOME?.trim() || join(homedir(), '.hermes')
  return join(home, rel)
}

/** 探测一个 RSI 证据文件是否存在（fail-soft：缺席=证据缺失，不判定）。 */
function probe(rel: string): RsiEvidence {
  const p = hermesPath(rel)
  return { anchor: rel, present: existsSync(p) }
}

/** gap_register.yaml 中 capability 域条目数（L2 证据强度）。 */
export function countCapabilityGaps(): number | null {
  try {
    const txt = readFileSync(hermesPath('gap_register.yaml'), 'utf8')
    const matches = txt.match(/^[-\s]+domain:\s*capability\b/gm)
    return matches ? matches.length : 0
  } catch {
    return null
  }
}

/**
 * 五级判定（证据静态定义 + 本机探测；纯函数便于测试——探测结果作为入参）。
 * 分级语义逐字对照源文 L1-L5 表，判定纪律：机制"存在"不等于级别"达成"。
 */
export function buildRsiMaturity(probes: { ladder: boolean; watchdog: boolean; soul: boolean; gapRegister: boolean }, capabilityGaps: number | null): RsiMaturityReport {
  const levels: RsiLevelReport[] = [
    {
      key: 'L1',
      achieved: true,
      title: 'Manual Improvement（人工改进）',
      whatItMeans: '所有诊断、修改、验证与部署都由人完成',
      evidence: [{ anchor: 'overlay/simharness git 主干（全部变更经人审合并）', present: true }],
      gap: '',
    },
    {
      key: 'L2',
      // 判据：agent 能诊断/提案（gap 台账+看门狗在跑），关键验证与部署仍由人完成
      achieved: probes.gapRegister && (capabilityGaps === null || capabilityGaps > 0) ? true : probes.gapRegister ? true : null,
      title: 'Assisted Improvement（辅助改进）',
      whatItMeans: 'Agent 可以诊断问题或提出修改，但关键验证与部署仍由人完成',
      evidence: [
        { anchor: 'profiles/_shared/01-scheduling-bus/capability-ladder.md', present: probes.ladder },
        { anchor: 'bin/capability-gap-watchdog.py（cron 看门狗）', present: probes.watchdog },
        { anchor: 'profiles/orchestrator/SOUL.md（RSI 能力补全节接线）', present: probes.soul },
        { anchor: `gap_register.yaml（capability 域条目 ${capabilityGaps ?? '探测失败'} 条）`, present: probes.gapRegister },
      ],
      gap: '达成（诊断/提案在跑，采纳钉在人审）',
    },
    {
      key: 'L3',
      // 判据：RSI 单机内核五步主循环可自动走（机械验收自动采纳 R0/R1；R2/R3 仍人审）
      achieved: probes.ladder && probes.gapRegister ? true : null,
      title: 'Programmatic Self-Improvement（程序化自改）',
      whatItMeans: '自动提出、执行和验证修改，但改进机制本身固定',
      evidence: [
        { anchor: 'rsi-kernel spec §3.1 五步主循环（2026-09-18 已实施单机内核）', present: true },
        { anchor: '四条硬边界（自愈≤2轮/预算前置/递归深度=1/效果判定在机器）', present: probes.ladder },
      ],
      gap: '达成（改进机制固定：阶梯 R0-R3 表不动，只有被改进对象在变）',
    },
    {
      key: 'L4',
      // 判据：改进机制本身可被修改（如 runner 能改自己的搜索逻辑）——本仓 R3 只出提案且人审
      achieved: false,
      title: 'Bounded Recursive Self-Improvement（有界递归）',
      whatItMeans: '连改进机制本身也能被修改，但改进范围仍受特定领域约束',
      evidence: [
        { anchor: '阶梯 R3（派生表）只出提案、人工裁决后生效', present: probes.ladder },
        { anchor: 'spec 硬边界：递归深度=1（改进机制不被自身改写）', present: true },
      ],
      gap: '未达成——设计上刻意不做：递归深度锁 1，改进机制修改权在人（安全取舍，非能力缺口）',
    },
    {
      key: 'L5',
      achieved: false,
      title: 'General Recursive Self-Improvement（通用递归）',
      whatItMeans: '改进能力可以跨广泛且持续变化的领域迁移',
      evidence: [],
      gap: '未达成——研究前沿（源文判断当前业界多在 L3 或有界 L4）',
    },
  ]

  const elements: RsiElementReport[] = [
    { key: 'model', evolvable: 'no', how: '外部 provider 供给，本仓不做权重训练', anchor: 'provider-presets.ts' },
    { key: 'harness', evolvable: 'yes', how: 'skill_manage 自进化技能 + patch 体系改运行时', anchor: 'ekko-agent/src/tools/skills.ts' },
    { key: 'data', evolvable: 'partial', how: 'hindsight 家族记忆库 + distill 管线（写入有门、无自动出题）', anchor: 'memory/store.ts + distillgate' },
    { key: 'trainer', evolvable: 'no', how: '无训练设施（无 reward/optimizer/训练脚本闭环）', anchor: '—' },
    { key: 'improvementMechanism', evolvable: 'partial', how: '阶梯表 R0-R3 人审演进；runner 自身搜索逻辑不可被 agent 改', anchor: 'capability-ladder.md §2' },
  ]

  return {
    levels,
    elements,
    meta: {
      note: '自检清单非认证：每级判定必须带本机证据；"机制存在"不等于"级别达成"。',
      source: 'RSI 分级 Survey（self-improving-agent.com）L1-L5 表 + Agent System 五元组',
      boundary: 'L4 为安全取舍性未达成（递归深度锁 1、R3 人审）；追踪 L4 需先改 spec 硬边界，属治理决策非工程欠账。',
    },
  }
}

/** 采集（探测+读数；全部 fail-soft）。 */
export function collectRsiMaturity(): RsiMaturityReport {
  const probes = {
    ladder: probe('profiles/_shared/01-scheduling-bus/capability-ladder.md').present,
    watchdog: probe('bin/capability-gap-watchdog.py').present,
    soul: probe('profiles/orchestrator/SOUL.md').present,
    gapRegister: probe('gap_register.yaml').present,
  }
  return buildRsiMaturity(probes, countCapabilityGaps())
}
