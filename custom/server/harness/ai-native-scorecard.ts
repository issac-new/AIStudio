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
  // 死代码清除（P1 Task 10）：首段 try 是历史误植（readdirSync 恒真条件 + void 丢弃），
  // 除触发 tsc TS2774 阻断 build:full 外无任何作用——release:gate 真跑逮住后摘除。
  try {
    const { statSync } = require('node:fs') as typeof import('node:fs')
    const s = statSync(join(root, rel))
    return (Date.now() - s.mtimeMs) / 86_400_000
  } catch { return null }
}

/** 治理姿态里评分卡用得上的读数（2026-11-28）。只取这几项，评分卡不依赖姿态的完整结构。 */
export interface PostureReading {
  /** 执法总闸是否开着（与执法正身同判据）。 */
  enforceMasterOn: boolean
  /** 显式关掉审批的档案数（裸奔）。 */
  bareProfiles: number
  /** 未声明或读不出审批模式的档案数。 */
  partialProfiles: number
  /** 档案总数；0＝一个档案都没读到。 */
  totalProfiles: number
  /** 执法面可见的已加载规则总数。 */
  loadedRuleTotal: number
}

/** 默认取数：读真实治理姿态。任何失败都由调用处按「未知」处理，不在这里猜。 */
function readPosture(): PostureReading {
  // 动态 require：治理姿态域依赖较多且带盘读，评分卡被 harness 控制器同步调用，避免顶层互相引用
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { collectGovernancePosture } = require('../governance/posture') as typeof import('../governance/posture')
  const posture = collectGovernancePosture()
  return {
    enforceMasterOn: posture.global.enforceMasterOn,
    bareProfiles: posture.summary.bare,
    partialProfiles: posture.summary.partial + posture.summary.configMissing,
    totalProfiles: posture.summary.total,
    loadedRuleTotal: posture.global.loadedRuleTotal,
  }
}

/** 目录下的子目录数；目录不存在或读失败返回 null（此前未保护，目录缺席会让整张评分卡报错）。 */
function countSubdirsSafe(dir: string): number | null {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).length
  } catch { return null }
}

/** 两条权限判据共用的读数与结论。
 *  least-privilege（正向）：总闸开、没有档案裸奔、有已加载规则才算做到。
 *  no-broad-permission（反向）：总闸关＝权限确实过大（反向判据成立）；有档案裸奔＝部分成立。 */
function permissionReadings(posture: PostureReading | null): {
  least: CriterionStatus
  leastEvidence: string
  broad: CriterionStatus
  broadEvidence: string
} {
  const facts = posture
    ? `执法总闸=${posture.enforceMasterOn ? '开' : '关'}；档案 ${posture.totalProfiles} 个，其中显式关闭审批 ${posture.bareProfiles} 个、未声明或读不出 ${posture.partialProfiles} 个；已加载规则 ${posture.loadedRuleTotal} 条`
    : '治理姿态读取失败，无法评估执法总闸与各档案审批模式'
  if (!posture) {
    return { least: 'unknown', leastEvidence: `${facts}——unknown 不猜数`, broad: 'unknown', broadEvidence: facts }
  }
  const bare = posture.bareProfiles > 0
  const noProfiles = posture.totalProfiles === 0
  let least: CriterionStatus
  if (!posture.enforceMasterOn) least = 'fail'
  else if (noProfiles || bare || posture.loadedRuleTotal === 0) least = 'partial'
  else least = 'pass'
  let broad: CriterionStatus
  if (!posture.enforceMasterOn) broad = 'fail'
  else if (bare || noProfiles) broad = 'partial'
  else broad = 'pass'
  return {
    least,
    leastEvidence: `${facts}；分层限制：默认策略包（凭证/.git/破坏性红线）＋角色工具矩阵＋managed 锁定通道；沙箱：路径沙箱在、HERMES_TOOL_SANDBOX_ROOTS 未配默认不拦`,
    broad,
    broadEvidence: `${facts}；判定：总闸关＝权限过大成立；有档案显式关闭审批＝部分成立`,
  }
}

export function buildAiNativeScorecard(deps: { posture?: () => PostureReading } = {}): AiNativeScorecard {
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
  // 治理姿态读数：两条权限判据共用。取数抛错按「读不到」处理，判 unknown，不让整张评分卡报错。
  let posture: PostureReading | null
  try {
    posture = (deps.posture ?? readPosture)()
  } catch {
    posture = null
  }
  const permission = permissionReadings(posture)
  {
    // 5 权限最小化：2026-11-28 之前此处写死 'partial'，证据文案里的数字（角色工具矩阵 30/30）
    // 没有读数来源。现按治理姿态的真实读数判定；未用到的变量已删。
    push('least-privilege', 'positive', 'Agent 权限最小化、环境沙箱化',
      permission.least,
      permission.leastEvidence)
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
    const gates = countSubdirsSafe(join(root, 'custom/qgate/gate-packs'))
    push('eval-gates', 'negative', '有评测门槛与合并拦截（不是改完就合）',
      gates === null ? 'unknown' : gates >= 5 ? 'pass' : gates >= 1 ? 'partial' : 'fail',
      gates === null ? '门禁包目录读不到，无法评估' : `gate-pack 域数=${gates}（L0-L5 门集）`)
  }
  {
    const retro = existsSync(join(root, 'scripts/recurrence-report.mjs'))
    const decisions = existsSync(join(root, '.swarm-yuan/decisions.jsonl'))
    push('fix-system-not-symptom', 'negative', '出错修系统不逐个 debug（复发账本/决策台账在位）',
      retro && decisions ? 'pass' : retro || decisions ? 'partial' : 'fail', `复发报告=${retro}；决策台账=${decisions}`)
  }
  {
    // 与 5 同源（权限过大=反向判据成立=fail）。2026-11-28 之前写死 'pass'，与正向判据的
    // 写死 'partial' 互相矛盾且都不随实际状态变。
    push('no-broad-permission', 'negative', 'Agent 权限不与高级工程师一样大',
      permission.broad, permission.broadEvidence)
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
      'unknown 不计分母（缺数据不摊薄也不抬分）。两条权限判据读治理姿态的真实读数（执法总闸、各档案审批模式、已加载规则数），读不到判 unknown。',
    ],
  }
}
