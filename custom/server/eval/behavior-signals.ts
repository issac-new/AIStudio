// overlay[eval] 行为信号面（京东评测体系吸收轮·立项批，2026-10-23）。
//
// 范式来源：《京东 Agent 评测体系技术拆解》实践②「行为数据当评测信号」——
// JoyCoder 用采纳率/活跃度/调用次数这类真实接受行为给模型打分：「1.2 万名研发
// 每天的无感投票，比任何离线榜单都新鲜」。本仓对应物=run-trace 遥测聚合出的
// 真实使用行为（obssignals 域）：调用量、错误率、429 率、缓存命中率、活跃会话。
// 本模块把它们组装成「供评测消费的行为信号行」——与离线 pass@k 互补：线上
// 错误率上行是退化信号（即使离线评测没红），缓存命中率下行是提示词漂移信号。
//
// 边界纪律：本面是观测域信号供评测消费，不并入 METRIC_DEFS（评测域指标单一
// 事实源），与 registry 的 boundary 同款互不冒充。纯函数（不 IO）。
import type { ObsSignalsTotals } from '../obssignals/signals'

/** 行为信号行：读数 + 口径 + 样本量 + 驱动动作（消费建议，非自动触发）。 */
export interface BehaviorSignalRow {
  key: string
  /** 读数（null=窗口内无样本，如实缺席）。 */
  value: number | null
  /** 口径说明（读数怎么算的）。 */
  basis: string
  /** 样本量（分母；<minSamples 如实标 insufficient，不供消费）。 */
  samples: number
  /** 读数是否达到可判读的样本量。 */
  sufficient: boolean
  /** 消费建议：这个信号异常时评测侧该跑什么。 */
  onDrift: string
}

export interface BehaviorSignalsView {
  days: number
  /** 观测窗口是否有任何真实使用（零调用=无感投票不存在，全行 insufficient）。 */
  hasUsage: boolean
  rows: BehaviorSignalRow[]
  boundary: string
}

/** 各信号判读的最小样本量（低于此不供消费——诚实纪律：无感投票不足额不算票）。 */
export const MIN_SAMPLES = {
  llm: 30,
  tool: 20,
  session: 3,
}

/**
 * 组装行为信号行（纯函数）。输入=obssignals 窗口合计（真实使用行为遥测）。
 * 行序固定：质量异常类在前（错误/失败/429），效率类在后（缓存/覆盖度）。
 */
export function buildBehaviorSignals(totals: ObsSignalsTotals, days: number): BehaviorSignalsView {
  const llmSamples = totals.llmCalls + totals.llmErrors
  const toolSamples = totals.toolCalls
  const rows: BehaviorSignalRow[] = [
    {
      key: 'llm_error_rate',
      value: totals.llmErrorRate,
      basis: 'LLM 错误率 = error span /（post+error）LLM span',
      samples: llmSamples,
      sufficient: llmSamples >= MIN_SAMPLES.llm,
      onDrift: '线上错误率上行而离线评测未红 → 对当期集跑一次回放判分，确认模型/网关退化',
    },
    {
      key: 'tool_failure_rate',
      value: totals.toolFailureRate,
      basis: '工具失败率 = error 工具 span / 工具 span',
      samples: toolSamples,
      sufficient: toolSamples >= MIN_SAMPLES.tool,
      onDrift: '工具链失败上行 → 复跑声明 expectedToolCalls 的过程集，定位坏工具',
    },
    {
      key: 'rate_429',
      value: totals.rateLimit429Rate,
      basis: '429 率 = status_code=429 / LLM span 总数',
      samples: llmSamples,
      sufficient: llmSamples >= MIN_SAMPLES.llm,
      onDrift: '限流率上行 → 核查并发/退避配置；评测侧压测项（qpsProbe）需要回填新证据',
    },
    {
      key: 'cache_hit_rate',
      value: totals.cacheHitRate,
      basis: '缓存命中率 = cacheRead /（input+cacheRead+cacheWrite）',
      samples: llmSamples,
      sufficient: llmSamples >= MIN_SAMPLES.llm,
      onDrift: '命中率下行 → 提示词前缀稳定性漂移（动态前缀在破坏缓存锚），核查 prompt 组装',
    },
    {
      key: 'active_sessions',
      value: totals.sessions,
      basis: '窗口内活跃会话数（真实使用覆盖度——行为信号的票数底盘）',
      samples: totals.sessions,
      sufficient: totals.sessions >= MIN_SAMPLES.session,
      onDrift: '样本不足 → 行为信号仅作参考，评测结论以离线集为准',
    },
    {
      key: 'usage_volume',
      value: totals.llmCalls + totals.toolCalls,
      basis: '窗口内 LLM+工具调用总量（行为数据的新鲜度口径）',
      samples: llmSamples + toolSamples,
      sufficient: (llmSamples + toolSamples) >= MIN_SAMPLES.llm,
      onDrift: '调用量骤降 → 先排查采集链路（run-trace 采样率/网关心跳）再下结论',
    },
  ]
  return {
    days,
    hasUsage: llmSamples + toolSamples > 0,
    rows,
    boundary: '行为信号来自真实使用遥测（obssignals 域），供评测消费参考；离线评测指标以运行报告为准，两套口径不互相冒充。',
  }
}
