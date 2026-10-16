// overlay/custom/client/ia2/api/ai-quality.ts
// AI 产出质量数据面（三篇调研轮 E/F 件，R14/N2——方案正本 V8.35 §5.8.2 判据执行产物）。
// 消费 simcenter 端点：GET /api/hermes/sim/quality?run=<run>（evidence/mutation-score.json
// + dup-ratio.json 只读聚合）。纯函数层（双指标卡视图整形）=守门测试锚点；
// fetch 层薄封装；类型按服务端 parseQualityMetric 响应形状最小镜像。
import { authFetch } from '../../ide/utils/auth-fetch'

// ── 类型（服务端契约最小镜像）──

export interface QualityMetricView {
  present: boolean
  reason?: 'file-absent' | 'parse-error' | 'shape-error'
  candidates?: string[]
  source?: string
  tool?: string
  status?: string
  verdict?: string
  score?: number | null
  ratio?: number | null
  threshold?: number
  total?: number
  killed?: number
  survived?: number
  timeout?: number
  incrementLines?: number
  duplicateLines?: number
  blocks?: number
  ts?: string
}

export interface QualityResponse {
  run: string
  mutation: QualityMetricView
  duplication: QualityMetricView
}

// ── 纯函数层（测试锚点）──

export interface QualityCard {
  key: 'mutation' | 'duplication'
  label: string
  /** pass=过线绿 / fail=未过红 / unmeasured=未计分灰 / absent=未跑灰（如实，不猜） */
  state: 'pass' | 'fail' | 'unmeasured' | 'absent'
  headline: string
  detail: string
  source: string
}

const ABSENT_REASON: Record<string, string> = {
  'file-absent': 'evidence 文件缺席（本工具未跑或未落盘）',
  'parse-error': 'evidence JSON 解析失败（文件损坏）',
  'shape-error': 'evidence 形状不符（工具版本错配）',
}

/** 双指标→卡视图（纯函数）：缺席/未计分如实呈现，verdict 色态透传工具原判。 */
export function qualityCards(res: QualityResponse): QualityCard[] {
  const m = res.mutation
  const d = res.duplication
  const mutation: QualityCard = !m.present
    ? { key: 'mutation', label: '增量变异得分', state: 'absent', headline: '未跑', detail: ABSENT_REASON[m.reason ?? 'file-absent'], source: m.candidates?.[0] ?? '' }
    : m.score == null
      ? { key: 'mutation', label: '增量变异得分', state: 'unmeasured', headline: m.status === 'baseline-fail' ? '基线红中止' : '未计分', detail: m.status === 'baseline-fail' ? '改动前测试已红——先修基线再跑变异（不产假得分）' : String(m.status), source: m.source ?? '' }
      : {
          key: 'mutation', label: '增量变异得分', state: m.verdict === 'pass' ? 'pass' : 'fail',
          headline: `得分 ${m.score}（线 ≥${m.threshold ?? '—'}）`,
          detail: `杀 ${m.killed ?? '—'}/共 ${m.total ?? '—'}（存活 ${m.survived ?? '—'}${m.timeout ? `、超时杀 ${m.timeout}` : ''}）`,
          source: m.source ?? '',
        }
  const duplication: QualityCard = !d.present
    ? { key: 'duplication', label: '增量重复率', state: 'absent', headline: '未跑', detail: ABSENT_REASON[d.reason ?? 'file-absent'], source: d.candidates?.[0] ?? '' }
    : d.ratio == null
      ? { key: 'duplication', label: '增量重复率', state: 'unmeasured', headline: '样本太小未计', detail: String(d.status), source: d.source ?? '' }
      : {
          key: 'duplication', label: '增量重复率', state: d.verdict === 'pass' ? 'pass' : 'fail',
          headline: `重复率 ${d.ratio}%（阈 ≤${d.threshold ?? '—'}%）`,
          detail: `增量 ${d.incrementLines ?? '—'} 行中重复 ${d.duplicateLines ?? '—'} 行，样本块 ${d.blocks ?? '—'} 处`,
          source: d.source ?? '',
        }
  return [mutation, duplication]
}

export async function fetchQuality(run: string): Promise<QualityResponse> {
  const res = await authFetch(`/api/hermes/sim/quality?run=${encodeURIComponent(run)}`)
  if (!res.ok) throw new Error(`/api/hermes/sim/quality → ${res.status}`)
  return res.json() as Promise<QualityResponse>
}
