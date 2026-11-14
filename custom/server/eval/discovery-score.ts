// overlay[eval] 发现测试判分（2026-11-14 Proactive AI 二轮 P1）。
//
// 范式来源：《Proactive AI for Superintelligent Agents》§6.1.5——现有基准「很少要求智能体
// 自己决定什么值得关注」；终极评估环境不预选 issue，评「是否随项目演化发现、调度、执行并
// 守护有用的工作」。四指标：
//   - discoveryPrecision：发现条目带证据锚点且命中期望（开放域＝带锚点即可计入 supported）
//   - discoveryRecall：期望发现被命中比例（无期望＝开放域，置 undefined 不计，不冒充满分）
//   - correctSilencePenalty：对已解决问题集（resolvedConcerns）重复报告的条数＝行动偏差
//     （FixedBench 实证：智能体常在问题已解决时仍修改代码，任务完成型基准不惩罚此偏差）
//   - verificationBurden：发现条数对 maxFindings 的超限比例（人工验证工作量代理）
// 无锚点发现直接判 unsupported（红线：结论无锚点不成立——锚点是门槛不是加分项）。
//
// 存档走独立 DiscoveryRun 账（JSONL append-only，先例＝intervention-ledger）：
// 不写 EvalRun 主账——那是 task 回放判分形态（attempts/aggregates 按任务键控），
// 双形态塞一个 schema 会互相污染；报告面按 setId 关联呈现。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { underWebUi } from '../lib/paths'
import type { DiscoveryFinding, DiscoverySpec } from './types'

/** 单条发现的机检判定（判分层；judge 复核在其上叠加，不推翻锚点门槛）。 */
export type FindingVerdict = 'supported' | 'unsupported' | 'duplicate-resolved'

export interface ScoredFinding {
  finding: DiscoveryFinding
  verdict: FindingVerdict
  /** 命中的期望发现 id（supported 且命中期望时）；开放域为 undefined。 */
  matchedExpectedId?: string
  /** 命中的已解决问题 id（duplicate-resolved 时）。 */
  matchedResolvedId?: string
}

export interface DiscoveryScore {
  /** 提交发现总条数。 */
  totalFindings: number
  /** 无锚点条数（判 unsupported）。 */
  unsupportedCount: number
  /** 对已解决问题重复报告条数（行动偏差）。 */
  duplicateResolvedCount: number
  /** supported 条数（含重复报告——重复也算「发现」但其价值被 correctSilence 抵扣）。 */
  supportedCount: number
  /** precision＝supported / total（total=0 时＝1：正确地什么都没报）。 */
  discoveryPrecision: number
  /** recall＝命中期望数 / 期望总数；开放域（无期望）置 undefined。 */
  discoveryRecall?: number
  /** 行动偏差惩罚条数（duplicate-resolved 计数；0＝正确沉默）。 */
  correctSilencePenalty: number
  /** 验证负担＝max(0, total/maxFindings - 1)；无上限置 undefined。 */
  verificationBurden?: number
  findings: ScoredFinding[]
}

/** 文本匹配：小写化后双向包含即视为命中（判分层保守宽松，judge 复核收严）。 */
function textMatches(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  return x.includes(y) || y.includes(x)
}

/** 判分纯函数：无 IO，可全矩阵测。 */
export function scoreDiscovery(spec: DiscoverySpec, findings: DiscoveryFinding[]): DiscoveryScore {
  const scored: ScoredFinding[] = []
  const expected = spec.expectedFindings ?? []
  const resolved = spec.resolvedConcerns ?? []
  const hitExpected = new Set<string>()
  let unsupportedCount = 0
  let duplicateResolvedCount = 0

  for (const f of findings) {
    const hasAnchor = Array.isArray(f.evidenceRefs) && f.evidenceRefs.length > 0
      && f.evidenceRefs.every((r) => typeof r === 'string' && r.trim().length > 0)
    if (!hasAnchor) {
      unsupportedCount += 1
      scored.push({ finding: f, verdict: 'unsupported' })
      continue
    }
    const dup = resolved.find((r) => textMatches(f.description, r.description))
    if (dup) {
      duplicateResolvedCount += 1
      scored.push({ finding: f, verdict: 'duplicate-resolved', matchedResolvedId: dup.id })
      continue
    }
    const hit = expected.find((e) => textMatches(f.description, e.description))
    if (hit) hitExpected.add(hit.id)
    scored.push({ finding: f, verdict: 'supported', matchedExpectedId: hit?.id })
  }

  const total = findings.length
  const supportedCount = scored.filter((s) => s.verdict === 'supported').length
  return {
    totalFindings: total,
    unsupportedCount,
    duplicateResolvedCount,
    supportedCount,
    // total=0 且无已解决问题＝正确沉默（满分）；total=0 但存在已解决问题同样没报＝满分。
    discoveryPrecision: total === 0 ? 1 : supportedCount / total,
    discoveryRecall: expected.length > 0 ? hitExpected.size / expected.length : undefined,
    correctSilencePenalty: duplicateResolvedCount,
    verificationBurden: spec.maxFindings ? Math.max(0, total / spec.maxFindings - 1) : undefined,
    findings: scored,
  }
}

// ---------- DiscoveryRun 独立存档（JSONL；不进 EvalRun 主账） ----------

export interface DiscoveryRun {
  id: string
  setId: string
  /** 运行时集指纹锚点（改版后读数不可比可机械判定，同 EvalRun.setHash 语义）。 */
  setHash: string
  score: DiscoveryScore
  createdAt: number
  createdBy?: string
  note?: string
}

function ledgerDir(): string {
  return process.env.HERMES_DISCOVERY_RUN_DIR?.trim() || join(underWebUi('eval'), 'discovery-runs')
}

function ledgerFile(): string {
  return join(ledgerDir(), 'discovery-runs.jsonl')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object'
}

/** append-only 落账（坏行读取时隔离，不阻断账本；先例＝intervention-ledger）。 */
export function appendDiscoveryRun(run: DiscoveryRun): void {
  mkdirSync(ledgerDir(), { recursive: true })
  appendFileSync(ledgerFile(), `${JSON.stringify(run)}\n`, 'utf8')
}

/** 读取（fail-soft：账本缺席＝空数组；坏行跳过计数如实呈现）。 */
export function listDiscoveryRuns(setId?: string): { runs: DiscoveryRun[]; badLines: number } {
  if (!existsSync(ledgerFile())) return { runs: [], badLines: 0 }
  let badLines = 0
  const runs: DiscoveryRun[] = []
  for (const line of readFileSync(ledgerFile(), 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (!isRecord(parsed) || typeof parsed.setId !== 'string' || !isRecord(parsed.score)) { badLines += 1; continue }
      runs.push(parsed as unknown as DiscoveryRun)
    } catch { badLines += 1 }
  }
  return { runs: setId ? runs.filter((r) => r.setId === setId) : runs, badLines }
}
