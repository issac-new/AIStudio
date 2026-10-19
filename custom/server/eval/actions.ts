// overlay[eval] 动作驱动清单（百度评测体系轮 B4，2026-10-19）。
//
// 范式来源：《百度 Agent 评测体系技术拆解》§4 深挖「评估器即回报函数」——
// 百度的评测回答「下一步往哪搜、往哪调、往哪训」而非「这个模型几分」。
// 可操作结论：设计任何评估维度前先回答「这个评估结果驱动什么动作」；
// 驱动不了动作的指标，只是给周报提供装饰。
//
// 本模块是动作语义的单一事实源：纯函数从既有聚合面推导 ActionLink 清单，
// 不新增采集面；通过态不产生条目（无事可驱动=不产噪）。
import type { EvalRun } from './types'

export interface ActionLink {
  key: string
  /** 触发读数面（呈现：指标名+读数）。 */
  metric: string
  /** 触发条件（人话：为什么驱动这个动作）。 */
  condition: string
  /** 驱动动作（回答「下一步往哪调」）。 */
  action: string
  priority: 'high' | 'medium' | 'low'
}

/** 门禁项 → 驱动动作映射（gate key 单一事实源；releaseGate.ts 不重复声明）。 */
const GATE_DRIVES: Record<string, { metric: string; condition: string; action: string }> = {
  tool_success: {
    metric: '工具调用成功率',
    condition: '低于门禁线（≥99%）',
    action: '排查失败工具调用（工具名/参数/超时），修复或回滚版本后重跑',
  },
  p99_ratio: {
    metric: 'P99/均值比',
    condition: '长尾超限（≤2×）',
    action: '复盘最慢样本（重试风暴/超时配置/大上下文），压长尾后重测',
  },
  degrade_rate: {
    metric: '降级率',
    condition: '判定端降级占比超限（<0.5%）',
    action: '恢复 S1 判定端或收敛熔断口径，降级样本恢复后重跑',
  },
  ttft: {
    metric: 'TTFT',
    condition: '首 token 时延超限（≤1.5s）',
    action: '排查模型路由与流式配置，压时延后重测',
  },
  response_tier: {
    metric: '响应分档',
    condition: '在线口径无读数',
    action: '接 live 打点后补测（回放判分不产生该口径）',
  },
  qps_headroom: {
    metric: 'QPS 余量',
    condition: '容量压测未做',
    action: '跑 mx-load-probe 峰值×2 压测补齐容量面',
  },
}

/** 校准劣化线（呈现口径）：ECE 超此线且样本足够 → 裁判校准动作。 */
const ECE_WARN = 0.15
const ECE_MIN_SAMPLES = 30

/**
 * 动作驱动清单（纯函数）。anchorDrift 由调用方（aggregateRun，持集对象）判定传入。
 */
export function actionLinksOf(run: EvalRun, anchorDrift: boolean): ActionLink[] {
  const agg = run.aggregates
  const out: ActionLink[] = []

  if (anchorDrift) {
    out.push({
      key: 'anchor_drift',
      metric: '集锚点',
      condition: '运行时集指纹 ≠ 当前集指纹（集已改版）',
      action: '历史读数与当前集不可直接对比：用当前集重跑基线，再下对比结论',
      priority: 'high',
    })
  }

  if (!agg.judgeOnline) {
    out.push({
      key: 'judge_offline',
      metric: '判定端',
      condition: 'S1 离线，本次为纯 S0 降级读数',
      action: '恢复判定端后重跑本集（降级读数不进结论）',
      priority: 'high',
    })
  }

  if (agg.riskVeto) {
    out.push({
      key: 'risk_veto',
      metric: '红线否决',
      condition: '任一 risk 断言命中红线',
      action: '阻断发布；坏例回流回归库 + 根因排查（涉事任务/断言见报告明细）',
      priority: 'high',
    })
  }

  if (agg.rubricDrilldownHint) {
    out.push({
      key: 'rubric_drilldown',
      metric: `unknown 占比 ${(agg.unknownRatio * 100).toFixed(1)}%`,
      condition: '超 Rubric 充分性警戒线',
      action: '逐条人工仲裁（/runs/:id/verdicts）+ Rubric Loop 改题留痕，降 unknown 后重跑',
      priority: 'high',
    })
  }

  if (agg.releaseGate) {
    for (const check of agg.releaseGate.checks) {
      if (check.status === 'fail') {
        const drive = GATE_DRIVES[check.key] ?? { metric: check.key, condition: '门禁未过', action: '排查该项证据面' }
        out.push({ key: `gate_${check.key}`, metric: `${drive.metric} ${check.measured ?? ''}`.trim(), condition: drive.condition, action: drive.action, priority: 'high' })
      } else if (check.status === 'no_data') {
        const drive = GATE_DRIVES[check.key]
        if (drive) out.push({ key: `gate_gap_${check.key}`, metric: drive.metric, condition: drive.condition, action: drive.action, priority: 'low' })
      }
    }
  }

  if (agg.calibration && agg.calibration.ece !== null && agg.calibration.samples >= ECE_MIN_SAMPLES && agg.calibration.ece > ECE_WARN) {
    out.push({
      key: 'judge_calibration',
      metric: `校准 ECE ${agg.calibration.ece.toFixed(3)}（${agg.calibration.samples} 样本）`,
      condition: `裁判信心与命中偏差超 ${ECE_WARN}`,
      action: '校准裁判：调整裁判提示词或 τ 阈值（EVAL_TAU_YES/NO），复跑看 ECE 收敛',
      priority: 'medium',
    })
  }

  if (agg.byLink) {
    for (const [link, seg] of Object.entries(agg.byLink)) {
      if (!seg || seg.total === 0 || seg.passRate === null) continue
      if (seg.passRate < 0.9) {
        out.push({
          key: `link_${link}`,
          metric: `${link} 环通过率 ${(seg.passRate * 100).toFixed(1)}%`,
          condition: '组件环节低于呈现线（90%）',
          action: '单环节归因：只查该环节断言与样本，不全量返工',
          priority: 'medium',
        })
      }
    }
  }

  if (agg.statisticallyInsufficient) {
    out.push({
      key: 'k_insufficient',
      metric: `k=${run.k}`,
      condition: '单跑不作门禁（统计基线缺位）',
      action: '补 k≥2 采样重跑，再下通过率结论',
      priority: 'low',
    })
  }

  const order: Record<ActionLink['priority'], number> = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => order[a.priority] - order[b.priority])
}
