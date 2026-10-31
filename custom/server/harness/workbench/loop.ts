// overlay/custom/server/harness/workbench/loop.ts
// 改进闭环的纯函数层：摘要、diff、无真值行为对比、晋级门禁。
// 这里不读盘、不写库，便于单测覆盖全部分支；副作用在 service/apply。
import { createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseHookPolicy } from '../../goalbudget/stage-ladder'
import type {
  BehaviorContrast, Champion, EvolutionReport, EvolutionRound, EvolutionSurface, GateBlocker,
  ParetoPoint, ParetoReport, ParetoTier, ProbeMetrics, PromotionGateReport, Proposal,
  ProposalStatus, QualityVerdict, RegularizationDerived, RetirementCandidate, SurfaceKey, Variant,
} from './types'

export const MAX_VARIANTS = 8
export const DEFAULT_BUDGET_CAP_USD = 5

/**
 * 源文 core/context.py:419 的防泄漏标记：harness/经验文件不得携带评测器自己的判词，
 * 否则它会被当成"证据"喂给后续任务，等于把答案写进提示词。逐字对齐。
 */
export const GRADER_VERDICT_MARKERS: readonly string[] = [
  'deterministic_eval_summary',
  'deterministic_eval_result',
  'judge_scope_and_deterministic_status',
  'Judge findings on the rendered result',
  '"passed_count"',
  '"pass_rate"',
  '"test_pass_rate"',
]

export function findGraderMarkers(content: string): string[] {
  const body = String(content ?? '')
  return GRADER_VERDICT_MARKERS.filter((m) => body.includes(m))
}

/** 源文还会扫文件路径：文件名里带判词 marker 同样视为泄漏。 marker 里带引号的按去引号后匹配。 */
export function findGraderMarkersInPath(rel: string): string[] {
  const body = String(rel ?? '')
  return GRADER_VERDICT_MARKERS.filter((m) => {
    const token = m.replace(/^"|"$/g, '')
    return body.includes(m) || body.includes(token)
  })
}

export interface TreeValidationIssue {
  code: string
  message: string
  path?: string
}

export interface TreeValidationResult {
  ok: boolean
  issues: TreeValidationIssue[]
  census: { alwaysOnChars: number; files: number; skills: number; subAgents: number; scripts: number }
}

const SKILL_RX = /^skills\/([a-z0-9][a-z0-9_-]*)\/SKILL\.md$/
const SKILL_SCRIPT_RX = /^skills\/[a-z0-9][a-z0-9_-]*\/scripts\/[A-Za-z0-9_.-]+$/
const SUBAGENT_RX = /^sub_agents\/([a-z0-9][a-z0-9_-]*)\/AGENT\.md$/
const SCRIPT_RX = /^scripts\/[a-z0-9_][a-z0-9_]*\.py$/
const SCRIPT_REF_RX = /(?:python3?\s+)(skills\/[\w-]+\/scripts\/[\w.-]+\.py|scripts\/[\w.-]+\.py)/g

const ALWAYS_ON_PATHS = ['profiles/*/SOUL.md', 'profiles/*/config.yaml', 'profiles/_shared/constraint-policy.md']
const ALWAYS_ON_MAX_CHARS = 24_000
const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'SessionStart']

function matchAlwaysOn(path: string): boolean {
  return ALWAYS_ON_PATHS.some((pat) => {
    if (pat.includes('*')) {
      const [pre, post] = pat.split('*')
      return path.startsWith(pre) && path.endsWith(post)
    }
    return path === pat
  })
}

function skillNames(tree: Record<string, string>): string[] {
  const names = new Set<string>()
  for (const rel of Object.keys(tree)) {
    const m = rel.match(SKILL_RX)
    if (m) names.add(m[1])
  }
  return [...names].sort()
}

function subagentNames(tree: Record<string, string>): string[] {
  const names = new Set<string>()
  for (const rel of Object.keys(tree)) {
    const m = rel.match(SUBAGENT_RX)
    if (m) names.add(m[1])
  }
  return [...names].sort()
}

/** 真实 py_compile（对齐源文 compile()）；python3 缺席时跳过——不伪造编译判定。 */
export function pyCompileAvailable(): boolean {
  try {
    const res = spawnSync('python3', ['--version'], { encoding: 'utf8', timeout: 3000 })
    return !res.error && res.status === 0
  } catch {
    return false
  }
}

function pyCompile(rel: string, src: string): string | null {
  if (!pyCompileAvailable()) return null
  const dir = mkdtempSync(join(tmpdir(), 'harness2-pycompile-'))
  try {
    const file = join(dir, rel.split('/').pop() ?? 'candidate.py')
    writeFileSync(file, src, 'utf8')
    const res = spawnSync('python3', ['-m', 'py_compile', file], { encoding: 'utf8', timeout: 5000 })
    if (res.error) return null
    if (res.status !== 0) return (res.stderr || res.stdout || 'compile failed').trim().slice(0, 160)
    return null
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** 源文 tree.validate 的本仓映射：只校验 managed 面相关的硬规则。 */
export function validateTree(tree: Record<string, string>, opts: { allowSubagents?: boolean } = {}): TreeValidationResult {
  const issues: TreeValidationIssue[] = []
  const allowSubagents = opts.allowSubagents !== false
  const alwaysOnText = Object.keys(tree).filter(matchAlwaysOn).map((k) => tree[k]).join('\n\n')
  if (alwaysOnText.length > ALWAYS_ON_MAX_CHARS) {
    issues.push({ code: 'always_on_over_cap', message: `常驻内容 ${alwaysOnText.length} 字符，超过 ${ALWAYS_ON_MAX_CHARS} 上限；每个 token 都在和 Agent 输出预算竞争` })
  }
  const skills = skillNames(tree)
  for (const name of skills) {
    const rel = `skills/${name}/SKILL.md`
    const fm = (tree[rel] ?? '').slice(0, 600)
    if (!/^description:\s*\S/m.test(fm)) {
      issues.push({ code: 'skill_missing_description', message: `${rel} 需要 frontmatter \`description:\`，否则加载时静默丢弃`, path: rel })
    }
    const mName = fm.match(/^name:\s*(\S+)\s*$/m)
    if (mName && mName[1] !== name) {
      issues.push({ code: 'skill_name_mismatch', message: `${rel} 的 \`name: ${mName[1]}\` 与目录名 ${name} 不一致，加载时静默丢弃`, path: rel })
    }
    if (!alwaysOnText.includes(name)) {
      issues.push({ code: 'skill_untriggered', message: `技能 '${name}' 未在常驻文本中提及，Agent 不会知道去调用它`, path: rel })
    }
  }
  const subs = subagentNames(tree)
  if (subs.length > 0 && !allowSubagents) {
    issues.push({ code: 'subagents_not_allowed', message: `子智能体在当前部署不可用：${subs.join(', ')}` })
  }
  for (const name of subs) {
    const rel = `sub_agents/${name}/AGENT.md`
    const fm = (tree[rel] ?? '').slice(0, 600)
    if (!/^description:\s*\S/m.test(fm)) {
      issues.push({ code: 'subagent_missing_description', message: `${rel} 需要 \`description:\``, path: rel })
    }
  }
  for (const [rel, src] of Object.entries(tree)) {
    if (SCRIPT_RX.test(rel) || (SKILL_SCRIPT_RX.test(rel) && rel.endsWith('.py'))) {
      const err = pyCompile(rel, src)
      if (err) issues.push({ code: 'script_compile_error', message: `${rel} 编译失败：${err.slice(0, 160)}`, path: rel })
    }
  }
  if (tree['.codex/hooks.json'] !== undefined) {
    try {
      const doc = JSON.parse(tree['.codex/hooks.json']) as { hooks?: Record<string, unknown> }
      if (!doc || typeof doc !== 'object' || !doc.hooks || typeof doc.hooks !== 'object') {
        issues.push({ code: 'hooks_schema', message: '.codex/hooks.json 需要顶层 {"hooks": {"<Event>": [...]}} 对象' })
      } else {
        for (const [event, entries] of Object.entries(doc.hooks)) {
          if (!HOOK_EVENTS.includes(event)) {
            issues.push({ code: 'hooks_unknown_event', message: `.codex/hooks.json 未知事件 ${event}` })
            continue
          }
          if (!Array.isArray(entries)) {
            issues.push({ code: 'hooks_schema', message: `.codex/hooks.json ${event} 必须是数组` })
            continue
          }
          for (let i = 0; i < entries.length; i += 1) {
            const entry = entries[i] as { hooks?: Array<{ type?: string; command?: string }> }
            if (!entry || !Array.isArray(entry.hooks)) {
              issues.push({ code: 'hooks_schema', message: `.codex/hooks.json ${event}[${i}] 需要 hooks 数组` })
              continue
            }
            for (const h of entry.hooks) {
              if (h?.type !== 'command') {
                issues.push({ code: 'hooks_schema', message: `.codex/hooks.json ${event}[${i}] hook type 必须是 "command"` })
              } else if (!String(h.command ?? '').trim()) {
                issues.push({ code: 'hooks_schema', message: `.codex/hooks.json ${event}[${i}] command 为空` })
              }
            }
          }
        }
      }
    } catch (e) {
      issues.push({ code: 'hooks_invalid_json', message: `.codex/hooks.json 不是合法 JSON：${e instanceof Error ? e.message : String(e)}` })
    }
    // HarnessPro 轮 HP-3（2026-10-23）：声明了工具环 hook 的树候选必须同时声明
    // 递增的阶段阈值（runtime/policy.json 的 economy<strict<finalize_after_tools）——
    // 没有阶梯的 hook 只有硬拦一档，等于把「提醒→收敛→拦截」退化成「直接掐断」。
    const declaresToolLoopHook = tree['.codex/hooks.json'] !== undefined
      && ['PreToolUse', 'PostToolUse'].some((ev) => {
        try {
          const doc = JSON.parse(tree['.codex/hooks.json']) as { hooks?: Record<string, unknown> }
          return Array.isArray(doc?.hooks?.[ev]) && doc.hooks[ev].length > 0
        } catch { return false }
      })
    if (declaresToolLoopHook) {
      const policyParsed = parseHookPolicy(tree['runtime/policy.json'], 100)
      if (!policyParsed) {
        issues.push({
          code: 'hook_stage_thresholds_missing',
          message: '树候选声明了 PreToolUse/PostToolUse 运行时钩子，但 runtime/policy.json 缺少合法的阶段阈值（economy_after_tools < strict_after_tools < finalize_after_tools，正数递增）——无阶梯的预算钩子会退化成一刀切拦截（HarnessPro 阶梯纪律）',
          path: 'runtime/policy.json',
        })
      }
    }
  }
  const haveScripts = new Set(Object.keys(tree).filter((rel) => SCRIPT_RX.test(rel) || SKILL_SCRIPT_RX.test(rel)))
  for (const [rel, src] of Object.entries(tree)) {
    if (!SKILL_RX.test(rel) && !matchAlwaysOn(rel)) continue
    SCRIPT_REF_RX.lastIndex = 0
    const refs = [...src.matchAll(SCRIPT_REF_RX)].map((m) => m[1])
    for (const ref of refs) {
      if (!haveScripts.has(ref)) {
        issues.push({ code: 'script_ref_missing', message: `${rel} 引用了 ${ref} 但该文件不在 harness 中`, path: rel })
      }
    }
  }
  const scripts = Object.keys(tree).filter((rel) => SCRIPT_RX.test(rel)).length
  return {
    ok: issues.length === 0,
    issues,
    census: {
      alwaysOnChars: alwaysOnText.length,
      files: Object.keys(tree).length,
      skills: skills.length,
      subAgents: subs.length,
      scripts,
    },
  }
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 树级摘要：files 的 path+digest 与 deletions 的稳定哈希。 */
export function treeDigest(files: Array<{ path: string; digest: string }>, deletions: string[]): string {
  const rows = files.map((f) => `${f.path}:${f.digest}`).sort().concat(deletions.map((d) => `DEL:${d}`).sort())
  return sha256(rows.join('\n'))
}

/** 把多文件候选展开为单文件内容（用于 diff 与行为对比）。 */
export function variantContent(v: Variant): string {
  if (v.files && v.files.length > 0) {
    return v.files.map((f) => f.content).join('\n\n')
  }
  return v.content
}

/** 行级 diff：多文件按各文件拼接后的文本做；deletions 单独计数。 */
export function diffSummaryTree(baseFiles: Array<{ path: string; content: string }>, nextFiles: Array<{ path: string; content: string }>, deletions: string[]): Variant['diffSummary'] {
  const base = baseFiles.map((f) => f.content).join('\n\n')
  const next = nextFiles.map((f) => f.content).join('\n\n')
  const line = diffSummary(base, next)
  return { added: line.added + deletions.length, removed: line.removed + deletions.length, unchanged: line.unchanged }
}

export function variantSetDigest(variants: Variant[]): string {
  const parts = variants
    .map((v) => `${v.id}:${v.digest}`)
    .sort()
    .join('\n')
  return sha256(parts)
}

/** 行级摘要：只数增删，不生成完整 patch（完整 diff 由前端按内容自行展示）。 */
export function diffSummary(base: string, next: string): Variant['diffSummary'] {
  const a = base.split('\n')
  const b = next.split('\n')
  // LCS 表在 2k 行内可用；超长按逐行等位比较，避免治理页被大文件拖死。
  if (a.length * b.length > 4_000_000) {
    let same = 0
    const n = Math.min(a.length, b.length)
    for (let i = 0; i < n; i += 1) if (a[i] === b[i]) same += 1
    return { added: Math.max(0, b.length - same), removed: Math.max(0, a.length - same), unchanged: same }
  }
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }
  const unchanged = dp[a.length][b.length]
  return {
    added: Math.max(0, b.length - unchanged),
    removed: Math.max(0, a.length - unchanged),
    unchanged,
  }
}

function pctDelta(base: number | null | undefined, cand: number | null | undefined): number | null {
  if (base == null || cand == null || base === 0) return null
  return (cand - base) / base
}

function numDelta(base: number | null | undefined, cand: number | null | undefined): number | null {
  if (base == null || cand == null) return null
  return cand - base
}

/**
 * 行为对比（源文：不依赖标准答案，用执行差异）。
 * 质量判定只在结果层证据充足时给 improved/regressed/neutral；否则 unknown。
 * 过程层读数（Token/成本/步数/时延）只描述差异，不单独宣称变好。
 */
export function behaviorContrast(base: ProbeMetrics, cand: ProbeMetrics): BehaviorContrast {
  const reasons: string[] = []
  const regressionFailed = cand.regression ? cand.regression.failed : null
  let quality: QualityVerdict = 'unknown'

  if (cand.riskVeto) {
    quality = 'regressed'
    reasons.push('候选运行触发风险一票否决')
  } else if (regressionFailed != null && regressionFailed > 0) {
    quality = 'regressed'
    reasons.push(`历史回归失败 ${regressionFailed} 项`)
  } else if (!cand.judgeOnline) {
    quality = 'unknown'
    reasons.push('判定端离线，结果层不可用')
  } else if (cand.unknownRatio != null && cand.unknownRatio > 0.5) {
    quality = 'unknown'
    reasons.push(`未知判词占比 ${(cand.unknownRatio * 100).toFixed(0)}%，结果层不足以判定`)
  } else {
    const baseRate = base.passAt1 ?? base.passAtK
    const candRate = cand.passAt1 ?? cand.passAtK
    if (baseRate == null || candRate == null) {
      quality = 'unknown'
      reasons.push('基线或候选缺少通过率，无法判定质量')
    } else {
      const delta = candRate - baseRate
      if (delta > 0.01) {
        quality = 'improved'
        reasons.push(`通过率提升 ${(delta * 100).toFixed(1)} 个百分点`)
      } else if (delta < -0.01) {
        quality = 'regressed'
        reasons.push(`通过率下降 ${(Math.abs(delta) * 100).toFixed(1)} 个百分点`)
      } else {
        quality = 'neutral'
        reasons.push('通过率与基线持平')
      }
    }
  }

  return {
    quality,
    reasons,
    passAt1Delta: numDelta(base.passAt1, cand.passAt1),
    passAtKDelta: numDelta(base.passAtK, cand.passAtK),
    resultPassRateDelta: numDelta(base.resultPassRate, cand.resultPassRate),
    trajectoryPassRateDelta: numDelta(base.trajectoryPassRate, cand.trajectoryPassRate),
    unknownRatioDelta: numDelta(base.unknownRatio, cand.unknownRatio),
    tokenDeltaPct: pctDelta(base.tokens, cand.tokens),
    costDeltaPct: pctDelta(base.costUsd, cand.costUsd),
    stepDeltaPct: pctDelta(base.steps, cand.steps),
    latencyDeltaPct: pctDelta(base.latencyMs, cand.latencyMs),
    regressionFailed,
  }
}

/**
 * 候选多样性（源文 tree.diversity）：逐行 Jaccard。K 个候选塌成同一份内容时，
 * 并行探索等于花 K 份钱只试了一种改法——必须在晋级前提示。
 */
export function candidateDiversity(variants: Variant[]): { n: number; nDistinct: number; meanLineJaccard: number } {
  const n = variants.length
  const nDistinct = new Set(variants.map((v) => v.digest)).size
  if (n < 2) return { n, nDistinct, meanLineJaccard: 1 }
  const sets = variants.map((v) => new Set(v.content.split('\n').filter((line) => line.trim()).map((line) => line.trim())))
  const sims: number[] = []
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const a = sets[i]
      const b = sets[j]
      const union = new Set([...a, ...b])
      let inter = 0
      for (const line of a) if (b.has(line)) inter += 1
      sims.push(union.size === 0 ? 1 : inter / union.size)
    }
  }
  return { n, nDistinct, meanLineJaccard: Number((sims.reduce((a, b) => a + b, 0) / sims.length).toFixed(4)) }
}

/** 组合选中的候选：variantId 明确选择；合并内容必须与某个候选摘要一致（否则无探测证据）。 */
export function composedVariant(proposal: Proposal): Variant | null {
  const c = proposal.composition
  if (!c) return null
  if (c.variantId) return proposal.variants.find((v) => v.id === c.variantId) ?? null
  if (c.mergedContent != null) {
    const digest = sha256(c.mergedContent)
    return proposal.variants.find((v) => v.digest === digest) ?? null
  }
  return null
}

export function probeCost(proposal: Proposal): { total: number; complete: boolean; missing: string[] } {
  let total = 0
  const missing: string[] = []
  for (const probe of proposal.probes) {
    if (probe.status !== 'recorded' || !probe.evidence) {
      missing.push(probe.id)
      continue
    }
    if (probe.evidence.costUsd == null) {
      missing.push(probe.id)
      continue
    }
    total += probe.evidence.costUsd
  }
  return { total, complete: missing.length === 0 && proposal.probes.length > 0, missing }
}

/**
 * HDA 增益归因（2026-10-31 吸收轮）：论文 arXiv 2610.22466。
 * 原始增益 = 候选 − 标准基线；算力增益 = 等预算基线 − 标准基线；
 * harness 残差 = 候选 − 等预算基线。三项满足 raw = compute + harness。
 * 等预算基线缺席时只给 rawGain，compute/harness 记 null（不猜）。
 */
export interface GainAttribution {
  rawGain: number | null
  computeGain: number | null
  harnessGain: number | null
  equalBudgetPassAt1: number | null
  note: string
}

export function attributeGain(input: {
  baselinePassAt1: number | null | undefined
  candidatePassAt1: number | null | undefined
  equalBudgetPassAt1: number | null | undefined
}): GainAttribution {
  const baseline = input.baselinePassAt1 ?? null
  const candidate = input.candidatePassAt1 ?? null
  const equalBudget = input.equalBudgetPassAt1 ?? null
  const rawGain = baseline != null && candidate != null ? candidate - baseline : null
  if (baseline == null || candidate == null || equalBudget == null) {
    return {
      rawGain,
      computeGain: null,
      harnessGain: null,
      equalBudgetPassAt1: equalBudget,
      note: '等预算基线缺失：无法区分算力增益与 harness 残差',
    }
  }
  const computeGain = equalBudget - baseline
  const harnessGain = candidate - equalBudget
  return {
    rawGain,
    computeGain,
    harnessGain,
    equalBudgetPassAt1: equalBudget,
    note: `原始增益 ${(rawGain * 100).toFixed(1)} 分 = 算力 ${(computeGain * 100).toFixed(1)} 分 + harness ${(harnessGain * 100).toFixed(1)} 分`,
  }
}

export interface PromotionGateInput {
  proposal: Proposal
  currentChampion: Champion | null
  applyRequested: boolean
  applyEnvEnabled: boolean
  targetDigestNow?: string | null
  targetExists?: boolean
  /** RRSI 正则化读数（service 层现算；缺席时相关门禁跳过）。 */
  regularization?: RegularizationDerived | null
  /** 泄漏批评者（S1）发现，service 层按证据集扫描后注入；晋级硬拦。 */
  leakage?: GateBlocker[]
}

/** 晋级门禁：缺证据不放行（源文「回归」与「--max-usd」的硬约束）。 */
export function evaluatePromotion(input: PromotionGateInput): PromotionGateReport {
  const { proposal } = input
  const blockers: GateBlocker[] = []
  const warnings: GateBlocker[] = []

  if (proposal.status !== 'composed') {
    blockers.push({ code: 'not_composed', message: '提案尚未完成组合（compose）' })
  }

  if (!proposal.approval) {
    blockers.push({ code: 'approval_missing', message: '缺少人工批准' })
  } else if (proposal.approval.decision !== 'approved') {
    blockers.push({ code: 'approval_rejected', message: '提案已被驳回' })
  } else if (proposal.approval.variantSetDigest !== variantSetDigest(proposal.variants)) {
    blockers.push({ code: 'approval_stale', message: '批准后候选集合发生变化，批准已失效' })
  }

  const selected = composedVariant(proposal)
  if (!selected) {
    blockers.push({ code: 'composition_unprobed', message: '组合结果没有对应的候选探测证据' })
  } else {
    const probe = proposal.probes.find((p) => p.variantId === selected.id && p.status === 'recorded')
    if (!probe || !probe.evidence) {
      blockers.push({ code: 'composition_unprobed', message: '选中的候选缺少已记录的探测' })
    } else {
      const contrast = probe.contrast
      if (!contrast || contrast.quality === 'unknown') {
        warnings.push({ code: 'quality_unknown', message: '选中候选的结果层证据不足，请人工复核' })
      } else if (contrast.quality === 'regressed') {
        blockers.push({ code: 'quality_regressed', message: '选中候选相对基线出现倒退' })
      }
      if (!probe.evidence.regression) {
        blockers.push({ code: 'regression_missing', message: '选中候选未绑定历史回归运行（回归样本库）' })
      } else if (probe.evidence.regression.failed > 0) {
        blockers.push({
          code: 'regression_failed',
          message: `选中候选的历史回归失败 ${probe.evidence.regression.failed} 项`,
        })
      }
      if (probe.evidence.statisticallyInsufficient) {
        warnings.push({ code: 'statistical_insufficient', message: '评测采样 k<2，统计上不足' })
      }

      // ---- RRSI 选择端正则化（2026-10-23 吸收轮）：噪声地板 + 成本规则 ----
      if (contrast) {
        const cfg = rsiConfig()
        const reg = input.regularization ?? null
        const noiseDelta = reg?.noiseDelta ?? null
        const gain = contrast.passAt1Delta
        if (noiseDelta == null) {
          const msg = '未标定噪声带 δ：涨的分可能只是评测噪声（RRSI S2）。用 ≥2 条同集基线真实运行做噪声标定'
          if (cfg.requireNoise) blockers.push({ code: 'noise_missing', message: msg })
          else warnings.push({ code: 'noise_uncalibrated', message: msg })
        } else if (gain != null) {
          if (gain <= noiseDelta) {
            if (reg?.firstOnSurface) {
              warnings.push({
                code: 'exploratory_within_noise',
                message: `增益 ${(gain * 100).toFixed(1)} 分未超噪声带 δ=${(noiseDelta * 100).toFixed(1)} 分，但这是该面首个提案（结构性探索），交人工裁决`,
              })
            } else {
              blockers.push({
                code: 'gain_within_noise',
                message: `增益 ${(gain * 100).toFixed(1)} 分落在噪声带 δ=${(noiseDelta * 100).toFixed(1)} 分以内——没有足够可信的证据成为下一代（RRSI 噪声调整接受地板）`,
              })
            }
          } else {
            const costPct = contrast.costDeltaPct ?? contrast.tokenDeltaPct
            if (costPct != null) {
              const allowance = cfg.beta0 + cfg.beta1PerPoint * (gain * 100)
              if (costPct > allowance) {
                blockers.push({
                  code: 'cost_unjustified',
                  message: `增益 ${(gain * 100).toFixed(1)} 分只允许 token 增长 ${(allowance * 100).toFixed(0)}%，实测 ${(costPct * 100).toFixed(0)}%——额外的 test-time compute 必须被收益覆盖（RRSI 成本规则）`,
                })
              }
            }
          }
        }

        // ---- HDA 增益归因（2026-10-31 吸收轮）：区分算力与 harness 残差 ----
        const attribution = attributeGain({
          baselinePassAt1: proposal.baseline?.passAt1 ?? null,
          candidatePassAt1: probe.evidence.passAt1,
          equalBudgetPassAt1: probe.evidence.equalBudgetBaseline?.passAt1 ?? null,
        })
        if (gain != null && gain > 0) {
          if (attribution.harnessGain == null) {
            const msg = '未绑定等预算基线（HDA）：无法区分 harness 改进与额外 test-time compute'
            if (cfg.requireAttribution) blockers.push({ code: 'attribution_missing', message: msg })
            else warnings.push({ code: 'attribution_missing', message: msg })
          } else if (attribution.harnessGain <= 0) {
            blockers.push({
              code: 'gain_explained_by_compute',
              message: `${attribution.note}；等预算基线已解释全部增益，涨的分来自算力而非 harness（HDA）`,
            })
          } else if (attribution.harnessGain < gain * 0.5) {
            warnings.push({
              code: 'gain_mostly_compute',
              message: `${attribution.note}；算力贡献超过一半，交人工裁决（HDA）`,
            })
          }
          const eq = probe.evidence.equalBudgetBaseline
          if (eq && eq.setId !== probe.evidence.setId) {
            warnings.push({
              code: 'attribution_set_mismatch',
              message: `等预算基线来自不同评测集（${eq.setId} ≠ ${probe.evidence.setId}），归因不可比`,
            })
          }
        }
      }
      // ---- HarnessPro 帕累托选拔（2026-10-23 吸收轮）：选中候选被支配=硬拦 ----
      // 论文「无情淘汰性能低于初始底线、或处于帕累托劣势（花钱更多、分还更低）的废案」。
      const pareto = paretoReportOf(proposal)
      const selEntry = pareto.entries.find((e) => e.variantId === selected.id)
      if (selEntry && !selEntry.onFrontier) {
        const dom = pareto.entries.filter((e) => selEntry.dominatedBy.includes(e.variantId))
        blockers.push({
          code: 'pareto_dominated',
          message: `选中候选被帕累托支配（花钱更多、分还更低）：被 ${dom.map((d) => d.label).join('、')} 支配——HarnessPro 纪律：帕累托劣势候选不进下一代`,
        })
      }
    }
  }

  const missingProbe = proposal.variants.filter((v) => !proposal.probes.some((p) => p.variantId === v.id && p.status === 'recorded'))
  if (missingProbe.length > 0) {
    warnings.push({
      code: 'probes_incomplete',
      message: `${missingProbe.length} 个候选尚未绑定真实评测运行（非选中候选可缺失）`,
    })
  }

  const selectedProbeForCost = selected ? proposal.probes.find((p) => p.variantId === selected.id && p.status === 'recorded') : null
  if (selectedProbeForCost?.evidence?.costUsd == null) {
    blockers.push({ code: 'cost_missing', message: '选中候选的探测缺少成本读数' })
  } else {
    const cost = probeCost(proposal)
    if (cost.total > proposal.budgetCapUsd) {
      blockers.push({
        code: 'budget_exceeded',
        message: `探测总成本 ${cost.total.toFixed(2)} 超提案上限 ${proposal.budgetCapUsd.toFixed(2)}`,
      })
    }
  }

  const champion = input.currentChampion
  if (champion && champion.proposalId !== proposal.id && champion.promotedAt > proposal.createdAt) {
    blockers.push({ code: 'champion_drift', message: '该面已有更新的冠军，请基于新基线重开提案' })
  }

  // ---- RRSI 提案端正则化：泄漏批评者硬拦 + 退火编辑预算 + 停滞提示 ----
  for (const finding of input.leakage ?? []) {
    blockers.push({ code: 'benchmark_leakage', message: finding.message })
  }
  const reg = input.regularization
  if (reg && reg.editBudgetExceeded && reg.maxEditCount != null) {
    blockers.push({
      code: 'edit_budget_exceeded',
      message: `第 ${reg.round} 轮编辑预算 ${reg.editBudget} 个文件（余弦退火：后期强制少捆绑，让每次变化可归因），候选最大捆绑 ${reg.maxEditCount} 个`,
    })
  }
  if (reg?.stalled) {
    warnings.push({
      code: 'surface_stalled',
      message: `该面连续 ${reg.stallWindow} 个提案无采纳，搜索停滞——可考虑转向未探索面（RRSI 结构性探索）`,
    })
  }

  // ---- 约束保持门（D5，2026-10-31 吸收轮）：能力涨了，行为约束不许退化 ----
  const constraintChecks = proposal.constraints?.checks ?? null
  if (!constraintChecks || constraintChecks.length === 0) {
    const msg = '未记录约束保持断言（guardrails/权限/审计/拒答等「不许退化」项）；晋级前建议记录'
    if (rsiConfig().requireConstraints) blockers.push({ code: 'constraint_unchecked', message: msg })
    else warnings.push({ code: 'constraint_unchecked', message: msg })
  } else {
    const failed = constraintChecks.filter((c) => c.status === 'fail')
    const unknown = constraintChecks.filter((c) => c.status === 'unknown')
    if (failed.length > 0) {
      blockers.push({
        code: 'constraint_regression',
        message: `${failed.length} 项约束未保持：${failed.map((c) => c.id).join('、')}——能力改进不能以行为约束退化为代价`,
      })
    }
    if (unknown.length > 0) {
      warnings.push({
        code: 'constraint_unverified',
        message: `${unknown.length} 项约束未验证：${unknown.map((c) => c.id).join('、')}（unknown 不等于通过）`,
      })
    }
  }

  const diversity = candidateDiversity(proposal.variants)
  if (proposal.mode === 'parallel' && proposal.variants.length < 2) {
    warnings.push({ code: 'parallel_single_candidate', message: '并行探索只有 1 个候选，等价单步，不构成搜索' })
  }
  if (proposal.variants.length > 1 && (diversity.nDistinct < proposal.variants.length || diversity.meanLineJaccard > 0.9)) {
    warnings.push({
      code: 'candidate_collapse',
      message: `候选取样塌缩（去重后 ${diversity.nDistinct}/${proposal.variants.length}，逐行相似度 ${(diversity.meanLineJaccard * 100).toFixed(0)}%），探索预算可能被浪费`,
    })
  }

  const selectedForApply = composedVariant(proposal)
  const isTreeProposal = !!selectedForApply?.files && selectedForApply.files.length > 0

  // ---- HarnessPro 前缀缓存纪律（2026-10-23 吸收轮）：常驻面改动=提示词前缀缓存击穿 ----
  // 进化钩子把阶段提醒拼在工具结果尾部而非改写 prompt 头部，正是为了保住前缀缓存。
  // 启发式口径：候选触碰 always_on 文件且有删除行 → 缓存连续性被破坏（追加式编辑可保尾部缓存）。
  if (selectedForApply) {
    const touchesAlwaysOn = isTreeProposal
      ? selectedForApply.files!.some((f) => matchAlwaysOn(f.path)) || (selectedForApply.deletions ?? []).some((d) => matchAlwaysOn(d))
      : proposal.targetPath != null && matchAlwaysOn(proposal.targetPath)
    if (touchesAlwaysOn && selectedForApply.diffSummary.removed > 0) {
      warnings.push({
        code: 'prefix_cache_churn',
        message: `候选改动常驻面文件（always_on）且含 ${selectedForApply.diffSummary.removed} 行删除——该 profile 会话的 prompt 前缀缓存将被击穿（HarnessPro 缓存复用纪律）。启发式判定：建议追加式编辑、避免重排文件头部；如属必要重写请人工确认`,
      })
    }
  }

  if (input.applyRequested) {
    const surfaceManaged = ['system_prompt', 'skills'].includes(proposal.surfaceKey)
    if (!surfaceManaged) {
      blockers.push({ code: 'surface_not_managed', message: '该面为建议模式，不支持直接写盘' })
    } else if (!input.applyEnvEnabled) {
      blockers.push({ code: 'apply_env_disabled', message: '写盘未启用：需设置 HARNESS2_APPLY=1' })
    } else if (!isTreeProposal && !proposal.targetPath) {
      blockers.push({ code: 'target_missing', message: '提案未指定目标文件' })
    } else if (!isTreeProposal && input.targetExists === false) {
      blockers.push({ code: 'target_missing', message: '目标文件不存在（不创建新文件）' })
    } else if (!isTreeProposal && input.targetDigestNow != null && proposal.base && input.targetDigestNow !== proposal.base.digest) {
      blockers.push({ code: 'target_drift', message: '目标文件在提案后被外部修改，写盘会覆盖他人改动' })
    }
  }

  return { ok: blockers.length === 0, blockers, warnings }
}

/** 提案是否已具备提交条件（服务层用；纯函数便于测试）。 */
export function submitReadiness(proposal: Proposal): GateBlocker[] {
  const blockers: GateBlocker[] = []
  if (!proposal.title.trim()) blockers.push({ code: 'title_missing', message: '缺少标题' })
  if (!proposal.hypothesis.trim()) blockers.push({ code: 'hypothesis_missing', message: '缺少改进假设' })
  if (proposal.variants.length === 0) blockers.push({ code: 'variants_missing', message: '至少需要一个候选修改' })
  if (proposal.evidenceRefs.length === 0) blockers.push({ code: 'evidence_missing', message: '至少需要一条证据引用（任务/审计/评测运行）' })
  if (!proposal.baseline) blockers.push({ code: 'baseline_missing', message: '缺少基线评测运行' })
  return blockers
}

// =====================================================================================
// RRSI 正则化纯函数层（2026-10-23 吸收轮）
// 论文 arXiv 2609.24972：Regularize the search, not the harness。
// 七机制映射见 specs/2026-10-23-rrsi-regularized-workbench.md；全部无副作用，单测覆盖。
// =====================================================================================

export interface RsiConfig {
  /** 论文 T：退火视界（轮）。 */
  horizon: number
  bMin: number
  bMax: number
  stallWindow: number
  pruneN: number
  /** 成本规则 β₀：无增益时仍允许的 token 增长（相对量）。 */
  beta0: number
  /** 成本规则 β₁：每 1 个百分点通过率增益允许的 token 增长（相对量）。论文口径=每增 1 pass 允许 25%。 */
  beta1PerPoint: number
  /** true=未标定噪声带直接拦（缺省 false，warning 交人工裁决）。 */
  requireNoise: boolean
  /** true=未绑定等预算基线直接拦（缺省 false，warning 交人工裁决）。 */
  requireAttribution: boolean
  /** true=未记录约束保持断言直接拦（缺省 false，warning 交人工裁决）。 */
  requireConstraints: boolean
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Math.trunc(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/**
 * 超参照论文 Table 5 取 coding 档缺省（T=20、b 1/4、w=3、n_prune=4、β₀=0.10、
 * β₁≈25%/pass）。除 δ 外全部 env 可调；δ 刻意不设调参入口（论文纪律：调低 δ 只会买到噪声分）。
 */
export function rsiConfig(): RsiConfig {
  return {
    horizon: envInt('HARNESS2_RSI_T', 20),
    bMin: envInt('HARNESS2_RSI_B_MIN', 1),
    bMax: envInt('HARNESS2_RSI_B_MAX', 4),
    stallWindow: envInt('HARNESS2_RSI_STALL_W', 3),
    pruneN: envInt('HARNESS2_RSI_PRUNE_N', 4),
    beta0: envFloat('HARNESS2_RSI_BETA0', 0.1),
    beta1PerPoint: envFloat('HARNESS2_RSI_BETA1', 0.25),
    requireNoise: process.env.HARNESS2_RSI_REQUIRE_NOISE === '1',
    requireAttribution: process.env.HARNESS2_RSI_REQUIRE_ATTRIBUTION === '1',
    requireConstraints: process.env.HARNESS2_RSI_REQUIRE_CONSTRAINTS === '1',
  }
}

/** 论文退火编辑预算：b_t = ⌈b_min + (b_max−b_min)·½(1+cos(πt/T))⌉；t≥T 后恒为 b_min。 */
export function annealedEditBudget(t: number, cfg: RsiConfig = rsiConfig()): number {
  const round = Math.max(0, Math.trunc(t))
  if (round >= cfg.horizon) return cfg.bMin
  const value = cfg.bMin + (cfg.bMax - cfg.bMin) * 0.5 * (1 + Math.cos((Math.PI * round) / cfg.horizon))
  return Math.max(cfg.bMin, Math.min(cfg.bMax, Math.ceil(value)))
}

/** 一个候选的捆绑改动数：单文件=1；树候选=新增/修改文件数+删除数。 */
export function editCountOfVariant(v: Variant): number {
  if (v.files && v.files.length > 0) return v.files.length + (v.deletions?.length ?? 0)
  return 1
}

export function maxEditCount(variants: Variant[]): number | null {
  if (variants.length === 0) return null
  return Math.max(...variants.map(editCountOfVariant))
}

/** 论文轮次 t：该面已被采纳的轮数（未回滚冠军数；回滚=这轮没发生）。 */
export function surfaceRound(champions: Champion[], surfaceKey: SurfaceKey): number {
  return champions.filter((c) => c.surfaceKey === surfaceKey && !c.rolledBack).length
}

// ---- 泄漏批评者（S1）：评测前读 diff，拒绝携带评测集特化内容 ----

export interface LeakageSetLike {
  id: string
  tasks: Array<{ id: string; problem?: string; expectedBehavior?: string; rubric?: Array<{ text?: string }> }>
}

export type LeakageKind = 'task_id' | 'assertion_text' | 'reference' | 'problem'

export interface LeakageFinding {
  kind: LeakageKind
  /** 命中的评测集内容（长文本截断呈现）。 */
  needle: string
  /** 命中位置（候选标签/文件路径）。 */
  where: string
}

const LEAK_MIN_TASK_ID_LEN = 6
/** 文本针最小信息量：拉丁字符计 1、CJK 字符计 1.5（中文信息密度高，12 字已足够特化）。 */
const LEAK_MIN_TEXT_WEIGHT = 16
const LEAK_MAX_FINDINGS = 20

function textWeight(text: string): number {
  let w = 0
  for (const ch of text) w += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1.5 : 1
  return w
}

function clip(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * 确定性泄漏扫描（论文 critic 是 LLM 读 diff；本仓映射为可解释的子串扫描）：
 * 候选内容/路径中出现评测集任务 id、断言文本、参照答案、题干 → 泄漏。
 * 泛化性提示词/工具改进不会命中；转述式泄漏检测不到（如实标注为局限）。
 */
export function findBenchmarkLeakage(
  parts: Array<{ where: string; content: string }>,
  set: LeakageSetLike | null | undefined,
): LeakageFinding[] {
  if (!set) return []
  const needles: Array<{ needle: string; kind: LeakageKind }> = []
  for (const task of set.tasks ?? []) {
    if (task.id && task.id.trim().length >= LEAK_MIN_TASK_ID_LEN) needles.push({ needle: task.id.trim(), kind: 'task_id' })
    const addText = (raw: string | undefined, kind: LeakageKind): void => {
      const text = (raw ?? '').trim()
      if (text && textWeight(text) >= LEAK_MIN_TEXT_WEIGHT) needles.push({ needle: text, kind })
    }
    addText(task.problem, 'problem')
    addText(task.expectedBehavior, 'reference')
    for (const a of task.rubric ?? []) addText(a.text, 'assertion_text')
  }
  const findings: LeakageFinding[] = []
  for (const part of parts ?? []) {
    const body = String(part.content ?? '')
    if (!body) continue
    for (const { needle, kind } of needles) {
      if (body.includes(needle)) {
        findings.push({ kind, needle: clip(needle), where: part.where })
        if (findings.length >= LEAK_MAX_FINDINGS) return findings
      }
    }
  }
  return findings
}

export function leakageBlockers(findings: LeakageFinding[]): GateBlocker[] {
  const zh: Record<LeakageKind, string> = {
    task_id: '评测任务 ID',
    assertion_text: '评测断言原文',
    reference: '评测参照答案',
    problem: '评测题干原文',
  }
  return findings.map((f) => ({
    code: 'benchmark_leakage',
    message: `候选携带${zh[f.kind]}（${f.where}：「${f.needle}」）——这是 benchmark 特化而非通用改进（RRSI 泄漏批评者）`,
  }))
}

// ---- 历史证据表（P2）：失败假设不复提 ----

/** 词面相似度：拉丁词（≥2 字符）+ CJK 字符 bigram 的 Jaccard。 */
export function hypothesisSimilarity(a: string, b: string): number {
  const ta = hypothesisTokens(a)
  const tb = hypothesisTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : inter / union
}

function hypothesisTokens(s: string): Set<string> {
  const norm = String(s ?? '').toLowerCase()
  const tokens = new Set<string>()
  for (const w of norm.split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (/[a-z0-9]/.test(w) && w.length >= 2) tokens.add(w)
  }
  const cjkSegments = norm.match(/[\u4e00-\u9fff]+/g) ?? []
  for (const seg of cjkSegments) {
    for (let i = 0; i + 1 < seg.length; i += 1) tokens.add(seg.slice(i, i + 2))
  }
  return tokens
}

export const HYPOTHESIS_RETRY_THRESHOLD = 0.6

/** 同面历史失败假设（rejected/rolled_back）中与当前假设词面高度相似者。 */
export function hypothesisRetries(
  proposals: Proposal[],
  surfaceKey: SurfaceKey,
  currentProposalId: string,
  hypothesis: string,
  threshold: number = HYPOTHESIS_RETRY_THRESHOLD,
): RegularizationDerived['hypothesisRetry'] {
  return proposals
    .filter((p) => p.surfaceKey === surfaceKey && p.id !== currentProposalId
      && (p.status === 'rejected' || p.status === 'rolled_back'))
    .map((p) => ({ p, similarity: hypothesisSimilarity(hypothesis, p.hypothesis) }))
    .filter((x) => x.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map((x) => ({ proposalId: x.p.id, title: x.p.title, status: x.p.status, similarity: Number(x.similarity.toFixed(2)) }))
}

// ---- 停滞探测（P3）与剪枝信号（S4） ----

/** 最近 stallWindow 个提案均未被采纳（promoted 且未回滚才算采纳）→ 停滞。 */
export function stallDetection(surfaceProposals: Proposal[], stallWindow: number): boolean {
  const sorted = surfaceProposals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  if (sorted.length < stallWindow) return false
  const recent = sorted.slice(-stallWindow)
  return recent.every((p) => p.status !== 'promoted')
}

/** 最近 pruneN 个提案的全部已记录探测中，最大通过率增量 ≤0 → 该面建议做减法提案。 */
export function pruneSignal(surfaceProposals: Proposal[], pruneN: number): boolean {
  const sorted = surfaceProposals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const recent = sorted.slice(-pruneN)
  const deltas: number[] = []
  for (const p of recent) {
    for (const probe of p.probes) {
      if (probe.status === 'recorded' && probe.contrast?.passAt1Delta != null) {
        deltas.push(probe.contrast.passAt1Delta)
      }
    }
  }
  return deltas.length > 0 && Math.max(...deltas) <= 0
}

// ---- 进化报告（overview 的 evolution 段；论文图 6 曲线与去向计数的本仓形态） ----

function selectedEvidenceOf(p: Proposal): { evidence: ProbeMetrics; contrast: BehaviorContrast | null } | null {
  const selected = composedVariant(p)
  if (!selected) return null
  const probe = p.probes.find((x) => x.variantId === selected.id && x.status === 'recorded')
  if (!probe?.evidence) return null
  return { evidence: probe.evidence, contrast: probe.contrast ?? null }
}

export function evolutionSurfaceReport(
  surfaceKey: SurfaceKey,
  proposals: Proposal[],
  champions: Champion[],
  cfg: RsiConfig,
): EvolutionSurface {
  const mine = proposals.filter((p) => p.surfaceKey === surfaceKey)
  const champChain = champions
    .filter((c) => c.surfaceKey === surfaceKey)
    .sort((a, b) => (a.promotedAt < b.promotedAt ? -1 : 1))
  const byId = new Map(mine.map((p) => [p.id, p]))
  const timeline: EvolutionRound[] = champChain.map((c, idx) => {
    const p = byId.get(c.proposalId)
    const ev = p ? selectedEvidenceOf(p) : null
    return {
      round: idx + 1,
      proposalId: c.proposalId,
      variantLabel: c.label,
      promotedAt: c.promotedAt,
      rolledBack: c.rolledBack === true,
      passAt1: ev?.evidence.passAt1 ?? null,
      tokens: ev?.evidence.tokens ?? null,
      costUsd: ev?.evidence.costUsd ?? null,
      noiseDelta: p?.noise?.delta ?? null,
      passAt1Delta: ev?.contrast?.passAt1Delta ?? null,
    }
  })
  const openStatuses: ProposalStatus[] = ['draft', 'submitted', 'approved', 'probing', 'composed']
  return {
    surfaceKey,
    rounds: champions.filter((c) => c.surfaceKey === surfaceKey && !c.rolledBack).length,
    proposalsTotal: mine.length,
    promoted: mine.filter((p) => p.status === 'promoted').length,
    rejected: mine.filter((p) => p.status === 'rejected').length,
    rolledBack: mine.filter((p) => p.status === 'rolled_back').length,
    open: mine.filter((p) => openStatuses.includes(p.status)).length,
    failedProbes: mine.reduce((n, p) => n + p.probes.filter((x) => x.status === 'failed').length, 0),
    stalled: stallDetection(mine, cfg.stallWindow),
    pruneSuggested: pruneSignal(mine, cfg.pruneN),
    timeline,
  }
}

export function evolutionReport(
  surfaceKeys: SurfaceKey[],
  proposals: Proposal[],
  champions: Champion[],
  cfg: RsiConfig = rsiConfig(),
): EvolutionReport {
  const surfaces = surfaceKeys
    .map((key) => evolutionSurfaceReport(key, proposals, champions, cfg))
    .filter((s) => s.proposalsTotal > 0 || s.rounds > 0)
  const exercised = new Set(proposals.map((p) => p.surfaceKey))
  return {
    config: {
      horizon: cfg.horizon, bMin: cfg.bMin, bMax: cfg.bMax, stallWindow: cfg.stallWindow,
      pruneN: cfg.pruneN, beta0: cfg.beta0, beta1PerPoint: cfg.beta1PerPoint, requireNoise: cfg.requireNoise,
    },
    surfaces,
    unexercised: surfaceKeys.filter((key) => !exercised.has(key)),
    retirementCandidates: retirementCandidates(surfaces),
  }
}

// ---- 冠军退役候选（2026-10-23 挂账清偿 G4，腾讯文误区九「拆墙」侧）----
// 语义：时间线上「采纳时增益 ≤0 且相对前一轮变贵」的冠军轮，且其后 ≥minRoundsSince
// 个已采纳轮未被回滚纠正——当年加的控制如今只在花线，值得人复核是否拆除。
// advisory：零增益可能是守卫在起作用，不自动回滚不硬拦；缺读数如实 null。

export const RETIREMENT_MIN_ROUNDS_SINCE = 2

export function retirementCandidates(
  surfaces: EvolutionSurface[],
  minRoundsSince: number = RETIREMENT_MIN_ROUNDS_SINCE,
): RetirementCandidate[] {
  const out: RetirementCandidate[] = []
  for (const s of surfaces) {
    const live = s.timeline.filter((r) => !r.rolledBack)
    for (let i = 0; i < live.length; i += 1) {
      const r = live[i]
      if (r.passAt1Delta == null || r.passAt1Delta > 0) continue
      const prev = i > 0 ? live[i - 1] : null
      const pct = (a: number | null, b: number | null): number | null =>
        a == null || b == null || a === 0 ? null : (b - a) / a
      const costDeltaPct = prev ? pct(prev.costUsd, r.costUsd) : null
      const tokenDeltaPct = prev ? pct(prev.tokens, r.tokens) : null
      const pricier = (costDeltaPct ?? 0) > 0 || (costDeltaPct == null && (tokenDeltaPct ?? 0) > 0)
      if (!pricier) continue
      const roundsSince = live.length - (i + 1)
      if (roundsSince < minRoundsSince) continue
      out.push({
        surfaceKey: s.surfaceKey,
        round: r.round,
        proposalId: r.proposalId,
        variantLabel: r.variantLabel,
        passAt1Delta: r.passAt1Delta,
        costDeltaPct: costDeltaPct == null ? null : Number(costDeltaPct.toFixed(3)),
        tokenDeltaPct: tokenDeltaPct == null ? null : Number(tokenDeltaPct.toFixed(3)),
        roundsSince,
      })
    }
  }
  return out
}

// =====================================================================================
// HarnessPro 帕累托三档选拔纯函数层（2026-10-23 吸收轮）
// 论文 arXiv 2610.26770：淘汰帕累托劣势候选（花钱更多、分还更低），Lite（省钱）/
// Medium（均衡）/Heavy（高性能）三档代表沿性能-成本前沿保留。权重为本仓实例化
// （论文未公开公式细节，spec 决策记录标注）；全部无副作用，单测覆盖全分支。
// =====================================================================================

/**
 * 三档代表选取参考点（本仓实例化，归一化坐标 perf×econ，econ=1-归一成本）：
 * lite=(0,1) 最省代表（性能接受前沿地板）、medium=(1,1) 均衡代表（距双优理想点最近）、
 * heavy=(1,0) 性能代表（接受前沿最贵换最高分）。档位偏好编码在参考点里（论文未公开
 * 公式细节，此为可解释实例化：三代表恰为前沿三个「角+心」）。
 */
export const PARETO_TIER_REFERENCES: Record<ParetoTier, { perf: number; econ: number }> = {
  lite: { perf: 0, econ: 1 },
  medium: { perf: 1, econ: 1 },
  heavy: { perf: 1, econ: 0 },
}

export const PARETO_NOTE = '帕累托双目标=passAt1（越大越好）×costUsd（越小越好）；三档代表=两轴 min-max 归一化后，距档位参考点（lite=(0,1) 最省、medium=(1,1) 双优、heavy=(1,0) 最高分）欧氏平方距离最近的前沿候选。参考点为本仓实例化，论文未公开公式。'

/** a 支配 b ⟺ passAt1 ≥ 且 cost ≤ 且至少一严格（调用方保证双值非 null 有限）。 */
function paretoDominates(a: ParetoPoint, b: ParetoPoint): boolean {
  return a.passAt1! >= b.passAt1! && a.costUsd! <= b.costUsd!
    && (a.passAt1! > b.passAt1! || a.costUsd! < b.costUsd!)
}

/** 帕累托报告：非支配过滤 + 三档代表。单点=前沿（无比较对象）；null 读数如实排除。 */
export function paretoReport(points: ParetoPoint[]): ParetoReport {
  const eligible: ParetoPoint[] = []
  const excluded: ParetoReport['excluded'] = []
  for (const p of points) {
    const perfOk = typeof p.passAt1 === 'number' && Number.isFinite(p.passAt1)
    const costOk = typeof p.costUsd === 'number' && Number.isFinite(p.costUsd)
    if (perfOk && costOk) eligible.push(p)
    else excluded.push({
      variantId: p.variantId,
      label: p.label,
      reason: !perfOk && !costOk ? '缺少通过率与成本读数' : !perfOk ? '缺少通过率读数' : '缺少成本读数',
    })
  }

  const entries: ParetoReport['entries'] = eligible.map((p) => ({
    ...p,
    onFrontier: true,
    dominatedBy: [],
    tier: null,
  }))
  for (const e of entries) {
    e.dominatedBy = entries
      .filter((o) => o !== e && paretoDominates(o, e))
      .map((o) => o.variantId)
    e.onFrontier = e.dominatedBy.length === 0
  }

  const front = entries.filter((e) => e.onFrontier)
  if (front.length > 0) {
    const perfs = front.map((e) => e.passAt1!)
    const costs = front.map((e) => e.costUsd!)
    const perfMin = Math.min(...perfs); const perfMax = Math.max(...perfs)
    const costMin = Math.min(...costs); const costMax = Math.max(...costs)
    const norm = (v: number, min: number, max: number) => (max > min ? (v - min) / (max - min) : 1)
    for (const tier of ['lite', 'medium', 'heavy'] as const) {
      const ref = PARETO_TIER_REFERENCES[tier]
      let best: ParetoReport['entries'][number] | null = null
      let bestDist = Infinity
      for (const e of front) {
        // economy 轴：成本越低分越高（归一化后 1=最省）
        const perfScore = norm(e.passAt1!, perfMin, perfMax)
        const econScore = 1 - norm(e.costUsd!, costMin, costMax)
        const dist = (perfScore - ref.perf) ** 2 + (econScore - ref.econ) ** 2
        if (dist < bestDist) { bestDist = dist; best = e }
      }
      if (best) best.tier = tier
    }
  }

  return { eligible: eligible.length, excluded, entries, note: PARETO_NOTE }
}

/** 从提案的已记录探测组装帕累托报告（service/门禁共用入口）。 */
export function paretoReportOf(proposal: Proposal): ParetoReport {
  const byVariant = new Map(proposal.variants.map((v) => [v.id, v]))
  const points: ParetoPoint[] = []
  for (const probe of proposal.probes) {
    if (probe.status !== 'recorded' || !probe.evidence) continue
    const v = byVariant.get(probe.variantId)
    if (!v) continue
    points.push({ variantId: v.id, label: v.label, passAt1: probe.evidence.passAt1, costUsd: probe.evidence.costUsd })
  }
  return paretoReport(points)
}
