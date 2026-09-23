// overlay/custom/client/ide/utils/modelPricing.ts
// 会话成本估算价目资产（R1，dsh-TUI deepseekPricing 三原则移植：
// ①未收录模型不显示金额；②缓存读写分价；③价目随官方调整需手工维护）。
//
// 来源（2026-09-22 实抓官方定价页，USD / 1M tokens）：
//   - Claude: platform.claude.com/docs/en/docs/about-claude/pricing
//     （缓存命中 = 0.1×输入价，5m 缓存写入 = 1.25×输入价）
//   - GPT: developers.openai.com/api/docs/pricing（cached input 列即缓存命中价）
//   - DeepSeek / GLM：定价页抓取失败（超时 / JS 渲染无数字），未收录 → 不显示金额；
//     后续补录时在 TABLE 增行并更新本注释来源。
export interface ModelPrice {
  /** 每百万 token 输入价（USD） */
  input: number
  /** 每百万 token 输出价（USD） */
  output: number
  /** 每百万 token 缓存命中读取价（缺省 = 不单独计价，按 input 结算） */
  cacheRead?: number
  /** 每百万 token 缓存写入价（缺省 = 不单独计价，按 input 结算） */
  cacheWrite?: number
}

// 匹配规则：小写子串包含，从上到下首个命中（具体型号排在系列前缀之前）
const TABLE: Array<{ match: string; price: ModelPrice }> = [
  // ── Claude（缓存：读 0.1×input / 写 1.25×input）──
  { match: 'claude-opus-4', price: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { match: 'claude-opus', price: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 } },
  { match: 'claude-sonnet-4', price: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 } },
  { match: 'claude-sonnet', price: { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } },
  { match: 'claude-haiku', price: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 } },
  // ── GPT ──
  { match: 'gpt-5.5-pro', price: { input: 30, output: 180 } },
  { match: 'gpt-5.5', price: { input: 5, output: 30, cacheRead: 0.5 } },
  { match: 'gpt-5.4-mini', price: { input: 0.75, output: 4.5, cacheRead: 0.075 } },
  { match: 'gpt-5.4-nano', price: { input: 0.2, output: 1.25, cacheRead: 0.02 } },
  { match: 'gpt-5.4-pro', price: { input: 30, output: 180 } },
  { match: 'gpt-5.4', price: { input: 2.5, output: 15, cacheRead: 0.25 } },
  { match: 'gpt-5.2-pro', price: { input: 21, output: 168 } },
  { match: 'gpt-5.2', price: { input: 1.75, output: 14, cacheRead: 0.175 } },
  { match: 'gpt-5-pro', price: { input: 15, output: 120 } },
  { match: 'gpt-5-mini', price: { input: 0.25, output: 2, cacheRead: 0.025 } },
  { match: 'gpt-5-nano', price: { input: 0.05, output: 0.4, cacheRead: 0.005 } },
  { match: 'gpt-5', price: { input: 1.25, output: 10, cacheRead: 0.125 } },
  { match: 'gpt-4.1-mini', price: { input: 0.4, output: 1.6, cacheRead: 0.1 } },
  { match: 'gpt-4.1-nano', price: { input: 0.1, output: 0.4, cacheRead: 0.025 } },
  { match: 'gpt-4.1', price: { input: 2, output: 8, cacheRead: 0.5 } },
  { match: 'gpt-4o-mini', price: { input: 0.15, output: 0.6, cacheRead: 0.075 } },
  { match: 'gpt-4o', price: { input: 2.5, output: 10, cacheRead: 1.25 } },
]

export function findModelPrice(model: string | null | undefined): ModelPrice | null {
  if (!model) return null
  const name = model.toLowerCase()
  for (const row of TABLE) {
    if (name.includes(row.match)) return row.price
  }
  return null
}

export interface CostUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** 按价目折算成本（USD）；未收录模型返回 null（调用方不得显示金额）。
 *  口径契约：usage 各字段来自服务端 normalizeTokenUsage 之后的存储
 *  （usage-recorder.ts：inputIncludesCache 时已做 input - cacheRead - cacheWrite），
 *  即 inputTokens 不含缓存读写量，与 MetricsPopover 输入列的
 *  input+cacheRead+cacheWrite 展示口径一致——这里不得再扣一次缓存。 */
export function estimateCostUsd(model: string | null | undefined, usage: CostUsage): number | null {
  const price = findModelPrice(model)
  if (!price) return null
  const input = Math.max(0, Number(usage.inputTokens) || 0)
  const output = Math.max(0, Number(usage.outputTokens) || 0)
  const cacheRead = Math.max(0, Number(usage.cacheReadTokens) || 0)
  const cacheWrite = Math.max(0, Number(usage.cacheWriteTokens) || 0)
  const cost =
    (input / 1e6) * price.input +
    (output / 1e6) * price.output +
    (cacheRead / 1e6) * (price.cacheRead ?? price.input) +
    (cacheWrite / 1e6) * (price.cacheWrite ?? price.input)
  return Number.isFinite(cost) && cost > 0 ? cost : 0
}

/** 金额展示：<$0.01 显示 "<$0.01"；≥$1000 取整；其余两位小数 */
export function formatCostUsd(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.00'
  if (cost < 0.01) return '<$0.01'
  if (cost >= 1000) return `$${Math.round(cost).toLocaleString('en-US')}`
  return `$${cost.toFixed(2)}`
}
