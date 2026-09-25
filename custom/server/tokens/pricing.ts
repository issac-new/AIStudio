// overlay/tokens 域：成本估算价目表（dsh deepseekPricing.ts 三原则吸收，矩阵 §3.8 dsh P0）。
//
// 三原则（dsh-TUI 分析 §"余额与成本估算"）：
// 1. [空闲, 高峰] 两档单价——每价目给 idle/peak 两档，估算双档区间；
// 2. 缓存分价——cacheRead/cacheWrite 各自独立单价（cacheRead 通常为 input 的 1/10）；
// 3. 未收录模型返回 undefined 不显示金额——**绝不瞎算**（无价目=无估算，UI 不渲染金额）。
//
// 价目单一事实源：``overlay/runtime/pricing/models.yaml``（runtime 层清单模式，同 exa/semantica）。
// 计价单位：每百万 token 的价格（per-Mtok），货币单位表级声明。本模块为纯函数域（IO 仅价目加载）。
import { readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'
import type { TokenUsage } from './meter-projections'

export interface ModelPrice {
  /** 每 Mtok 单价；idle/peak 两档（dsh 原则 1）。 */
  input: { idle: number; peak: number }
  output: { idle: number; peak: number }
  /** 缓存分价（dsh 原则 2）；缺省按 input 的 1/10（cacheRead）与 input 全价（cacheWrite）折算。 */
  cacheRead?: { idle: number; peak: number }
  cacheWrite?: { idle: number; peak: number }
}

export interface PricingTable {
  currency: string
  /** per-Mtok 价格，按模型 id（精确或 provider/model 前缀匹配取最长）。 */
  models: Record<string, ModelPrice>
}

export interface CostEstimate {
  model: string
  currency: string
  /** 两档区间（dsh 原则 1：[空闲, 高峰]）。 */
  idleCost: number
  peakCost: number
  /** 使用的价目键（审计：匹配到哪条价目）。 */
  priceKey: string
}

let cachedTable: PricingTable | null = null

export function pricingTablePath(): string {
  const env = process.env.HERMES_PRICING_TABLE?.trim()
  if (env) return resolve(env)
  return resolve(__dirname, '../../../runtime/pricing/models.yaml')
}

export function loadPricingTable(): PricingTable {
  if (cachedTable) return cachedTable
  const p = pricingTablePath()
  try {
    if (!existsSync(p)) return (cachedTable = { currency: 'CNY', models: {} })
    // yaml 解析走与 server 一致的依赖；解析失败回空表（未收录=不显示，fail-soft）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parse } = require('yaml') as typeof import('yaml')
    const raw = parse(readFileSync(p, 'utf8')) || {}
    cachedTable = {
      currency: typeof raw.currency === 'string' ? raw.currency : 'CNY',
      models: raw.models && typeof raw.models === 'object' ? raw.models : {},
    }
  } catch {
    cachedTable = { currency: 'CNY', models: {} }
  }
  return cachedTable
}

export function resetPricingCacheForTests(): void {
  cachedTable = null
}

/** 键匹配：精确优先，次通配键（形如 ``provider/x-pro*`` 覆盖同前缀模型，取最长），未命中 null。 */
export function matchPriceKey(table: PricingTable, model: string): string | null {
  if (!model) return null
  if (table.models[model]) return model
  const keys = Object.keys(table.models)
    .filter((k) => k.endsWith('*') && model.startsWith(k.slice(0, -1)))
    .sort((a, b) => b.length - a.length)
  return keys[0] ?? null
}

const CACHE_READ_DEFAULT_RATIO = 0.1
const M_TOK = 1_000_000

/** dsh 原则 3 的返回形态：未收录模型返回 null（调用方不渲染金额，绝不瞎算）。 */
export function estimateCost(model: string, usage: TokenUsage, table: PricingTable = loadPricingTable()): CostEstimate | null {
  const key = matchPriceKey(table, model)
  if (!key) return null
  const price = table.models[key]
  const cacheRead = price.cacheRead ?? {
    idle: price.input.idle * CACHE_READ_DEFAULT_RATIO,
    peak: price.input.peak * CACHE_READ_DEFAULT_RATIO,
  }
  const cacheWrite = price.cacheWrite ?? price.input
  const perTier = (tier: 'idle' | 'peak') =>
    (usage.uncachedInput * price.input[tier]
      + usage.output * price.output[tier]
      + usage.cacheRead * cacheRead[tier]
      + usage.cacheWrite * cacheWrite[tier]) / M_TOK
  return {
    model,
    currency: table.currency,
    idleCost: round(perTier('idle')),
    peakCost: round(perTier('peak')),
    priceKey: key,
  }
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}
