// overlay/modelpool：统一模型池白名单单一事实源（spec 2026-11-21-model-pool-unification）。
// ekkostudio 调用面直钉 cc-switch 单通道（方案 A）后，studio 侧可选模型一律出自本清单；
// 供应商/账号/降级队列的唯一正本在 cc-switch（~/.cc-switch/cc-switch.db），本清单只是
// studio 面的「可见模型」投影，不复制供应商配置。补丁 812 经 ../custom/modelpool/pool
// 相对路径消费本模块（810/811 挂载先例），两侧零漂移。
// 默认模型=aim：cc-switch 占位符，解析为当前粘性 provider 的原生模型，对换组/开 LB
// 免疫（0917 舰队裁决口径，出处 team/skills/devops/ccswitch-routing-semantics-orch）。
export interface UnifiedModelEntry {
  model: string
  /** 上下文窗（与宿主 ~/.hermes/config.yaml cc-switch-route 条目同口径）。 */
  contextLength: number
  note?: string
}

export interface UnifiedModelPool {
  provider: 'cc-switch-route'
  apiMode: 'codex_responses'
  defaultModel: string
  models: UnifiedModelEntry[]
}

export const UNIFIED_PROVIDER = 'cc-switch-route' as const
export const EKKO_MODEL_UPSTREAM_ENV = 'EKKO_MODEL_UPSTREAM_BASE_URL'
/** 默认上游＝本机 cc-switch 的 hermes lane（codex_responses 协议入口）。 */
export const DEFAULT_UPSTREAM = 'http://127.0.0.1:15721/hermes/v1'

export const UNIFIED_POOL: UnifiedModelPool = {
  provider: UNIFIED_PROVIDER,
  apiMode: 'codex_responses',
  defaultModel: 'aim',
  models: [
    { model: 'aim', contextLength: 1048576, note: '默认；占位符→粘性 provider 原生模型' },
    { model: 'glm-5.3', contextLength: 1048576 },
    { model: 'kimi-for-coding', contextLength: 1048576 },
    { model: 'glm-5.3-flash', contextLength: 1048576, note: '轻任务/辅助档' },
    { model: 'claude-opus-5', contextLength: 200000, note: '重评审档（可用性随 cc-switch 挂载）' },
  ],
}

export const unifiedModelNames = (): string[] => UNIFIED_POOL.models.map(entry => entry.model)

export interface UpstreamDecision {
  /** true＝统一模式（直钉外部上游）；false＝legacy（studio 内部模型网关，上游产品态）。 */
  unified: boolean
  /** unified 时为外部上游 base_url；legacy 时为空串。 */
  baseUrl: string
}

// 本仓＝部署正身：env 缺省即统一（默认 cc-switch）；显式 'self' 是唯一回退逃生门，
// 保上游产品态可回归测试（spec 决策记录 4）。
export function resolveModelUpstream(env: Record<string, string | undefined> = process.env): UpstreamDecision {
  const raw = (env[EKKO_MODEL_UPSTREAM_ENV] ?? '').trim()
  if (raw === 'self') return { unified: false, baseUrl: '' }
  return { unified: true, baseUrl: raw || DEFAULT_UPSTREAM }
}
