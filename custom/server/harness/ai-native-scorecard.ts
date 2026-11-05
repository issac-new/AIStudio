// overlay/harness 域：AI Native 评分卡（2026-11-05 AI Native 吸收批 T9）。
//
// 源问题：四套成熟度自检（maturity/rsi-maturity/nine-layers/delivery）并存且口径
// 互异，无「团队整体 AI Native 到没到」的单一结论。本模块把系列五篇的「30 秒判断」
// 12 问落成可测判据：逐条映射既有数据源（文件存在性/账本新鲜度/配置实测），
// 缺数据标 unknown 不猜数——口径是「可测量」，不是「已达标」。
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { repoRoot } from '../lib/upstream'

export type CriterionStatus = 'pass' | 'partial' | 'fail' | 'unknown'

export interface Criterion {
  id: string
  /** 正向判据（做到了算 AI Native）还是反向（做到了算辅助编码） */
  stance: 'positive' | 'negative'
  title: string
  status: CriterionStatus
  evidence: string
}

export interface AiNativeScorecard {
  generatedAt: string
  criteria: Criterion[]
  /** 达标率=pass/(pass+partial+fail)；unknown 不计分母（缺数据不摊薄也不抬分） */
  score: number | null
  passed: number
  partial: number
  failed: number
  unknown: number
  gaps: string[]
  notes: string[]
}

function read(root: string, rel: string): string | null {
  try { return readFileSync(join(root, rel), 'utf8') } catch { return null }
}

function fileAgeDays(root: string, rel: string): number | null {
  try {
    const st = readdirSync ? null : null
    void st
  } catch { /* noop */ }
  try {
    const { statSync } = require('node:fs') as typeof import('node:fs')
    const s = statSync(join(root, rel))
    return (Date.now() - s.mtimeMs) / 86_400_000
  } catch { return null }
}

export function buildAiNativeScorecard(): AiNativeScorecard {
  const root = repoRoot()
  const criteria: Criterion[] = []
  const push = (id: string, stance: Criterion['stance'], title: string, status: CriterionStatus, evidence: string) =>
    criteria.push({ id, stance, title, status, evidence })

  // ── 正向 6 ──
  {
    // 1 工作从结构化规格与可测试验收开始
    const lib = read(root, '.swarm-yuan/hooks/spec-first-lib.sh')
    const conf = read(root, '.swarm-yuan/hooks/precheck.conf') ?? ''
    const specRequired = /^SPEC_REQUIRED="\${SPEC_REQUIRED:-1}"/m.test(conf) || /SPEC_REQUIRED="\$\{SPEC_REQUIRED:-1\}"/.test(conf)
    const fidelity = !!lib && lib.includes('spf_spec_fidelity_check')
    push('spec-start', 'positive', '工作从结构化规格与可测试验收条件开始',
      lib && specRequired ? (fidelity ? 'pass' : 'partial') : 'fail',
      `spec-first L2 在位=${!!lib}；SPEC_REQUIRED=1=${specRequired}；保真度四维=${fidelity}（T1）`)
  }
  {
    // 2 上下文刻意组装（有预算/分层/计量）
    const layers = existsSync(join(root, '.qgate/context-layers.json'))
    const readsHook = existsSync(join(root, 'custom/qgate/plugin/hooks/post-tool-read.mjs'))
    push('context-assembled', 'positive', '上下文刻意组装——有分层、有读取计量',
      layers && readsHook ? 'pass' : layers || readsHook ? 'partial' : 'fail',
      `四层分层表=${layers}；Read 计量钩子=${readsHook}（reads.jsonl 消费面见 obs-signals contextReads）`)
  }
  {
    // 3 输出附证据（收据/不变量/审计账本）
    const receipts = existsSync(join(root, '.swarm-yuan/spec-receipts.jsonl'))
    const inv = existsSync(join(root, 'scripts/merge-invariants.mjs'))
    const gateDeny = existsSync(join(root, '.swarm-yuan/gate-deny.jsonl'))
    const hit = [receipts, inv, gateDeny].filter(Boolean).length
    push('evidence-with-output', 'positive', 'Agent 输出必须附带证据（收据/不变量/拦截账本）',
      hit >= 3 ? 'pass' : hit >= 1 ? 'partial' : 'fail',
      `spec 收据=${receipts}；合并不变量=${inv}；gate-deny 账本=${gateDeny}`)
  }
  {
    // 4 CI 在评测/测试退回时拦截
    const ci = existsSync(join(root, '.github/workflows/governance.yml'))
    const prepush = read(root, '.swarm-yuan/hooks/pre-push')
    const enforced = !!prepush && prepush.includes('QGATE_PREPUSH_ENFORCE') && !/QGATE_PREPUSH_ENFORCE=0/.test(prepush.split('\n').find((l) => l.includes('默认强制')) ?? '')
    push('ci-blocks', 'positive', 'CI 在门禁退回时拦截合并',
      ci && enforced ? 'pass' : enforced || ci ? 'partial' : 'fail',
      `governance.yml CI 门=${ci}（T6）；pre-push 默认强拦=${enforced}`)
  }
  {
    // 5 权限最小化（D1 记账项：30/31 off + 总闸未开）
    const profiles = readdirSync(join(root, 'team/profiles'), { withFileTypes: true }).filter((d) => d.isDirectory()).length
    const enforceEnv = process.env.HERMES_TOOL_ENFORCE === '1'
    const rulesExist = existsSync(join(root, 'custom/server/approval-rules/approval-domain.ts'))
    push('least-privilege', 'positive', 'Agent 权限最小化、环境沙箱化',
      enforceEnv ? 'partial' : 'fail',
      `HERMES_TOOL_ENFORCE=${enforceEnv ? '1' : '未开'}；审批规则库在位=${rulesExist}；profiles=${profiles} 组 approvals 默认 off（D1 挂账 N01，2026-11-05 用户裁决本轮不动）`)
  }
  {
    // 6 生产信号回流评测/规格
    const recurrence = existsSync(join(root, '.swarm-yuan/recurrence.jsonl'))
    const coverage = read(root, '.swarm-yuan/spec-coverage.json')
    const covFresh = coverage ? (() => { try { return (Date.now() - new Date((JSON.parse(coverage).updatedAt ?? JSON.parse(coverage).recordedAt ?? 0)).getTime()) / 86_400_000 < 30 } catch { return false } })() : false
    push('signal-feedback', 'positive', '生产信号回流到规格/评测更新',
      recurrence && covFresh ? 'pass' : recurrence || covFresh ? 'partial' : 'fail',
      `复发账本=${recurrence}；spec 收据覆盖率账本新鲜=${covFresh}`)
  }

  // ── 反向 5（达成=反向判据不成立，即 pass）──
  push('no-copy-paste-context', 'negative', '上下文不是复制粘贴进聊天框（反向判据：无机械判据）',
    'unknown', '复制粘贴行为无 trace 判据——unknown 不猜数（升级需会话输入指纹比对）')
  {
    const contract = existsSync(join(root, 'vendor/hermes-agent/completion_contract.py')) || existsSync(join(root, 'runtime/completion_contract.py'))
    push('verifiable-done', 'negative', '「做完」有机械判据（DoD 回执），不凭感觉',
      contract ? 'pass' : 'fail', `completion_contract DoD 回执=${contract}`)
  }
  {
    const gates = readdirSync(join(root, 'custom/qgate/gate-packs'), { withFileTypes: true }).filter((d) => d.isDirectory()).length
    push('eval-gates', 'negative', '有评测门槛与合并拦截（不是改完就合）',
      gates >= 5 ? 'pass' : gates >= 1 ? 'partial' : 'fail', `gate-pack 域数=${gates}（L0-L5 门集）`)
  }
  {
    const retro = existsSync(join(root, 'scripts/recurrence-report.mjs'))
    const decisions = existsSync(join(root, '.swarm-yuan/decisions.jsonl'))
    push('fix-system-not-symptom', 'negative', '出错修系统不逐个 debug（复发账本/决策台账在位）',
      retro && decisions ? 'pass' : retro || decisions ? 'partial' : 'fail', `复发报告=${retro}；决策台账=${decisions}`)
  }
  {
    // 与 5 同源（权限过大=反向判据成立=fail）
    const enforceEnv = process.env.HERMES_TOOL_ENFORCE === '1'
    push('no-broad-permission', 'negative', 'Agent 权限不与高级工程师一样大',
      enforceEnv ? 'partial' : 'fail', `执法总闸未开（HERMES_TOOL_ENFORCE≠1）——规则库在位但默认不拦（D1 挂账）`)
  }

  // ── 第 12 条：缓存纪律可见 ──
  {
    const signals = read(root, 'custom/server/obssignals/signals.ts')
    const cacheRate = !!signals && signals.includes('cacheHitRate')
    const overhead = existsSync(join(root, 'custom/server/obssignals/context-overhead.ts'))
    push('cache-discipline', 'positive', '缓存命中率与上下文开销可见（有读数才有纪律）',
      cacheRate && overhead ? 'pass' : cacheRate || overhead ? 'partial' : 'fail',
      `cacheHitRate 面=${cacheRate}；contextOverhead 面=${overhead}（T8）`)
  }

  const passed = criteria.filter((c) => c.status === 'pass').length
  const partial = criteria.filter((c) => c.status === 'partial').length
  const failed = criteria.filter((c) => c.status === 'fail').length
  const unknown = criteria.filter((c) => c.status === 'unknown').length
  const denom = passed + partial + failed
  return {
    generatedAt: new Date().toISOString(),
    criteria,
    score: denom > 0 ? Math.round((passed / denom) * 100) / 100 : null,
    passed, partial, failed, unknown,
    gaps: criteria.filter((c) => c.status === 'fail').map((c) => `${c.id}：${c.title}——${c.evidence}`),
    notes: [
      '口径是「可测量可拦截可追责」的判据在位性，不是运行达标率；pass=机制在位且有执法面。',
      'unknown 不计分母（缺数据不摊薄也不抬分）——D1 权限最小化按 2026-11-05 用户裁决只记账。',
    ],
  }
}
