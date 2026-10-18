// overlay/harness 域：九层运行系统体检（2026-10-18 Harness 可靠性轮）。
//
// 骨架来自《Harness Engineering 从零到生产》九层能力：
//   Tools / Loop / Memory / Context / Sandbox / Verification / Permissions /
//   Observability / Evals——前六层让 Agent「能做事」，后三层决定团队「敢不敢
//   让它做事」。本模块把每层拆成可核对的检查项，逐项给 yes/partial/no 与
//   真实证据；数据缺席标 unavailable，不猜数（与 maturity.ts/rsi-maturity.ts
//   同一纪律：自检清单非认证）。
//
// 定位：治理页「九层运行体检」读模型。collect 与 build 分离——纯组装可单测，
// 采集全部 fail-soft（源缺席/坏文件/权限不足都降级为 0 或 null）。
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { BUILTIN_CONTRACTS } from '../toolcontract/contract'
import { queryToolExecAudit } from '../toolpipeline/tool-hooks'
import { queryApprovalLog } from '../approvals/approval-log'
import { listSets as listEvalSets, listRuns as listEvalRuns } from '../eval/store'
import { listSets as listHeldoutSets } from '../heldout/held-out-store'
import { resolveLoopBaseDir } from '../loop/paths'

export type NineLayerKey =
  | 'tools'
  | 'loop'
  | 'memory'
  | 'context'
  | 'sandbox'
  | 'verification'
  | 'permissions'
  | 'observability'
  | 'evals'

export type CheckStatus = 'yes' | 'partial' | 'no'
export type LayerStatus = 'covered' | 'partial' | 'missing'

export interface NineLayerCheck {
  key: string
  /** 检查项中文名（服务端单一事实源，UI 直接展示）。 */
  label?: string
  status: CheckStatus
  /** 真实证据（计数/文件/环境开关）；unavailable 时说明缺席原因。 */
  evidence: string
  /** 关键检查：缺失时该层不得判 covered（安全/恢复底线）。 */
  critical?: boolean
}

export interface NineLayer {
  key: NineLayerKey
  status: LayerStatus
  /** 0~100：yes=1 / partial=0.5 / no=0 的加权百分比。 */
  score: number
  checks: NineLayerCheck[]
  /** 未达标检查对应的差距说明。 */
  gaps: string[]
  /** 建议动作（按检查项映射，供后续轮次排期）。 */
  actions: string[]
}

export interface NineLayersInputs {
  days: number
  tools: {
    contracts: number
    auditedCalls: number
    preEntries: number
    preWithSummary: number
    failedPosts: number
    classifiedFailures: number
    duplicateFlagged: number
  }
  loop: {
    runawayGuard: boolean
    stuckDetector: boolean
    guardedEdges: boolean
    classifiedRetry: boolean
    checkpoints: number
    runsWithCheckpoints: number
  }
  memory: {
    checkpointDb: boolean
    graphCheckpoints: number
    agentCheckpoints: number
    handoffCheckpoints: number
  }
  context: {
    rootAgentsMd: boolean
    rootAgentsMdLines: number | null
    moduleAgentsMd: number
    specFiles: number
  }
  sandbox: {
    permissionMatrix: boolean
    workspaceGuard: boolean
    networkAllowlist: boolean
    secretRedaction: boolean
    declaredTimeouts: number
    teardown: boolean
  }
  verification: {
    gatePacks: number
    typecheckScript: boolean
    evalSets: number
    releaseGate: boolean
    uiOracle: boolean
  }
  permissions: {
    enforceWired: boolean
    enforceEnabled: boolean
    approvalRecords: number
    scopedApprovals: boolean
    identityInEnforcement: boolean
    allowDecisionsAudited: boolean
  }
  observability: {
    auditEntries: number
    postEntries: number
    postsWithDuration: number
    traceFiles: number
    runManifest: boolean
    costPerRun: boolean
  }
  evals: {
    fixedSets: number
    evalRuns: number
    heldoutQuestions: number
    coveredDimensions: number
    gateIntegrated: boolean
  }
}

export interface NineLayersReport {
  days: number
  layers: NineLayer[]
  counts: { covered: number; partial: number; missing: number }
  meta: {
    source: string
    note: string
    layersOrder: NineLayerKey[]
  }
}

export const NINE_LAYER_ORDER: NineLayerKey[] = [
  'tools', 'loop', 'memory', 'context', 'sandbox',
  'verification', 'permissions', 'observability', 'evals',
]

/** 每层检查项的中文名（证据展示与 gaps 的稳定键）。 */
export const NINE_LAYER_CHECKS: Record<NineLayerKey, Array<{ key: string; label: string; action: string }>> = {
  tools: [
    { key: 'contracts', label: '工具契约（副作用/超时/重试/幂等）', action: '为高频工具补契约，未知工具按外部副作用兜底' },
    { key: 'summary', label: '审计参数摘要（默认只记形状）', action: '保持不落原值；排障需要时显式开启值摘要' },
    { key: 'errors', label: '失败调用有机器可读错误分类', action: '工具错误统一走 classifyToolError，禁止自由文本判定' },
    { key: 'duplicates', label: '连续重复调用可识别', action: '对重复签名告警并转人工/暂停，阈值默认 3' },
  ],
  loop: [
    { key: 'bounds', label: '有界循环（步数/时间/预算/停止条件）', action: '补齐最大步数与成本上限，避免无限重试' },
    { key: 'stuck', label: '卡死与重复动作检测', action: 'runaway guard 与退化检测接入同一会话键' },
    { key: 'retry', label: '按错误类别重试（权限类不重试）', action: '图节点统一消费契约层退避策略' },
    { key: 'checkpoints', label: '每个关键步骤持久化检查点', action: '把 agent 检查点与图检查点用 run 键统一' },
  ],
  memory: [
    { key: 'graphCheckpoint', label: '图执行检查点（状态/下一步/成本）', action: '为检查点加保留期与按 run 查询面' },
    { key: 'agentCheckpoint', label: 'agent 进展检查点', action: '检查点补存模型参数与上下文摘要' },
    { key: 'handoff', label: '跨会话交接检查点', action: '交接文件纳入统一恢复判定' },
    { key: 'restore', label: '重启后可恢复', action: '补自动/半自动 resume 判定（安全续跑/新会话/人工闸）' },
  ],
  context: [
    { key: 'rootEntry', label: '项目入口 AGENTS.md', action: '在仓库根建立 <100 行的导航入口' },
    { key: 'modules', label: '模块级 AGENTS.md', action: '为 custom/server、custom/client 增加局部规范' },
    { key: 'specs', label: '规格文档可追溯', action: '每个变更批次先落 spec，再改代码' },
    { key: 'progressive', label: '渐进披露（入口短、细节外链）', action: '入口只留索引与工作规则，细节放 docs/' },
  ],
  sandbox: [
    { key: 'permissions', label: '权限模式矩阵（读/写/执行/网络）', action: '把 permpresets 接入执行器默认档' },
    { key: 'workspace', label: '工作目录边界', action: 'terminal 增加目录白名单，不只靠 cwd 约定' },
    { key: 'network', label: '网络域名放行/拒绝', action: '把 browsersec 接到浏览器工具执行前' },
    { key: 'secrets', label: '密钥不进入审计/提示词', action: '保持审计不落原值；补提示词入口扫描' },
    { key: 'limits', label: '资源限额（超时/并发/预算）', action: '补 CPU/内存/磁盘限额与任务后销毁' },
  ],
  verification: [
    { key: 'gates', label: '自动化门禁（类型/架构/契约/文档）', action: '为 overlay 增加 typecheck 与架构规则门' },
    { key: 'evalGate', label: '评测回归门', action: '把 L3 eval-regression 纳入常用 profile' },
    { key: 'external', label: '外部证据验收（测试/构建/截图）', action: '禁止用模型自评替代可执行验收' },
    { key: 'release', label: '发布准出检查', action: '把 release gate 与交付证据绑定' },
  ],
  permissions: [
    { key: 'enforce', label: '执行层强制（不只靠提示词）', action: '保持 HERMES_TOOL_ENFORCE 显式开启并纳入默认' },
    { key: 'identity', label: '按发起用户鉴权', action: '把 userId 接进 enforce-gate 裁决，替代只看 profile' },
    { key: 'scope', label: '审批带范围与期限', action: '审批记录补 scope/expiresAt/source 字段' },
    { key: 'allowAudit', label: '放行决策也可审计', action: 'ladder-pass/mode-pass 写入决策账' },
    { key: 'approvals', label: '审批记录可查询', action: '裁决端点全路径入 approval-log 与 govbus' },
  ],
  observability: [
    { key: 'audit', label: '逐工具调用审计', action: '保持 pre/post 双行并补齐身份字段' },
    { key: 'duration', label: '耗时与结果可还原', action: '补 tool_call_id 精确配对（当前按 scope+工具 FIFO）' },
    { key: 'errors', label: '错误分类可统计', action: '失败行统一写 errorCategory/retryable' },
    { key: 'manifest', label: '运行清单（模型/参数/提示词版本）', action: '新增 run manifest 并在会话启动时落盘' },
    { key: 'cost', label: '运行级成本', action: '把 token 账按 runId 归集' },
  ],
  evals: [
    { key: 'fixedSets', label: '固定评测集', action: '建立版本化能力评测集，不依赖临时样本' },
    { key: 'dimensions', label: '七维覆盖（完成/参数/恢复/状态/越权/成本/升级）', action: '补工具参数、失败恢复、长任务状态与越权评测' },
    { key: 'heldout', label: '密封集防污染', action: '把 heldout 接入例行评测' },
    { key: 'gate', label: '评测可阻断发布', action: '评测结果接入门禁而非只做看板' },
  ],
}

function layerOf(
  key: NineLayerKey,
  checks: NineLayerCheck[],
): NineLayer {
  const labels = NINE_LAYER_CHECKS[key]
  const total = checks.length || 1
  const point = checks.reduce((sum, c) => sum + (c.status === 'yes' ? 1 : c.status === 'partial' ? 0.5 : 0), 0)
  const score = Math.round((point / total) * 100)
  const gaps: string[] = []
  const actions: string[] = []
  checks.forEach((check, idx) => {
    if (check.status === 'yes') return
    const def = labels.find((l) => l.key === check.key) ?? labels[idx]
    gaps.push(`${def?.label ?? check.key}：${check.evidence}`)
    if (def?.action) actions.push(def.action)
  })
  const criticalFailed = checks.some((c) => c.critical && c.status === 'no')
  const status: LayerStatus = criticalFailed
    ? (score >= 40 ? 'partial' : 'missing')
    : score >= 80 ? 'covered' : score >= 40 ? 'partial' : 'missing'
  const enriched = checks.map((check, idx) => ({
    ...check,
    label: labels.find((l) => l.key === check.key)?.label ?? labels[idx]?.label ?? check.key,
  }))
  return { key, status, score, checks: enriched, gaps, actions: [...new Set(actions)] }
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

/** 纯组装：九层检查项 → 分数/状态/差距/动作（不 IO，便于单测）。 */
export function buildNineLayers(inputs: NineLayersInputs): NineLayersReport {
  const t = inputs.tools
  const lo = inputs.loop
  const m = inputs.memory
  const ctx = inputs.context
  const sb = inputs.sandbox
  const v = inputs.verification
  const p = inputs.permissions
  const o = inputs.observability
  const e = inputs.evals

  const summaryRatio = ratio(t.preWithSummary, t.preEntries)
  const classifiedRatio = ratio(t.classifiedFailures, t.failedPosts)
  const durationRatio = ratio(o.postsWithDuration, o.postEntries)

  const layers: NineLayer[] = [
    layerOf('tools', [
      { key: 'contracts', critical: true, status: t.contracts >= 10 ? 'yes' : t.contracts > 0 ? 'partial' : 'no', evidence: `已声明契约 ${t.contracts} 项` },
      { key: 'summary', status: summaryRatio >= 0.9 ? 'yes' : summaryRatio > 0 ? 'partial' : 'no', evidence: t.preEntries ? `${Math.round(summaryRatio * 100)}% 的调用带参数摘要（${t.preWithSummary}/${t.preEntries}）` : '窗口内无工具调用' },
      { key: 'errors', status: classifiedRatio >= 0.9 ? 'yes' : classifiedRatio > 0 ? 'partial' : 'no', evidence: t.failedPosts ? `${Math.round(classifiedRatio * 100)}% 的失败带错误分类（${t.classifiedFailures}/${t.failedPosts}）` : '窗口内无失败调用' },
      { key: 'duplicates', status: t.auditedCalls > 0 ? 'yes' : 'partial', evidence: t.auditedCalls > 0 ? `重复签名检测已接线；窗口内命中 ${t.duplicateFlagged} 次` : '检测已接线，窗口内无调用' },
    ]),
    layerOf('loop', [
      { key: 'bounds', critical: true, status: lo.runawayGuard && lo.guardedEdges ? 'yes' : lo.runawayGuard || lo.guardedEdges ? 'partial' : 'no', evidence: `runaway guard=${lo.runawayGuard ? '在' : '缺'}，回边守卫=${lo.guardedEdges ? '在' : '缺'}` },
      { key: 'stuck', status: lo.stuckDetector ? 'yes' : 'no', evidence: lo.stuckDetector ? '停滞检测器在档' : '未发现停滞检测器' },
      { key: 'retry', status: lo.classifiedRetry ? 'yes' : 'no', evidence: lo.classifiedRetry ? '图节点按错误类别重试' : '重试未分类' },
      { key: 'checkpoints', status: lo.checkpoints > 0 ? 'yes' : lo.runsWithCheckpoints > 0 ? 'partial' : 'no', evidence: `检查点 ${lo.checkpoints} 个 / 覆盖 ${lo.runsWithCheckpoints} 个 run` },
    ]),
    layerOf('memory', [
      { key: 'graphCheckpoint', critical: true, status: m.graphCheckpoints > 0 ? 'yes' : m.checkpointDb ? 'partial' : 'no', evidence: m.checkpointDb ? `图检查点 ${m.graphCheckpoints} 个` : '未发现图检查点库' },
      { key: 'agentCheckpoint', status: m.agentCheckpoints > 0 ? 'yes' : 'no', evidence: `agent 进展检查点 ${m.agentCheckpoints} 个` },
      { key: 'handoff', status: m.handoffCheckpoints > 0 ? 'yes' : 'no', evidence: `交接检查点 ${m.handoffCheckpoints} 个` },
      { key: 'restore', status: m.graphCheckpoints > 0 && m.handoffCheckpoints > 0 ? 'partial' : 'no', evidence: '检查点存在；自动恢复判定仍缺（人工 resume）' },
    ]),
    layerOf('context', [
      { key: 'rootEntry', critical: true, status: ctx.rootAgentsMd ? 'yes' : 'no', evidence: ctx.rootAgentsMd ? `根 AGENTS.md ${ctx.rootAgentsMdLines ?? '?'} 行` : '未发现根 AGENTS.md' },
      { key: 'modules', status: ctx.moduleAgentsMd >= 2 ? 'yes' : ctx.moduleAgentsMd === 1 ? 'partial' : 'no', evidence: `模块级 AGENTS.md ${ctx.moduleAgentsMd} 个` },
      { key: 'specs', status: ctx.specFiles > 0 ? 'yes' : 'no', evidence: `规格文档 ${ctx.specFiles} 份` },
      { key: 'progressive', status: ctx.rootAgentsMdLines != null && ctx.rootAgentsMdLines <= 100 ? 'yes' : ctx.rootAgentsMd ? 'partial' : 'no', evidence: ctx.rootAgentsMdLines != null ? `入口 ${ctx.rootAgentsMdLines} 行（目标 ≤100）` : '入口缺失，无法评估' },
    ]),
    layerOf('sandbox', [
      { key: 'permissions', status: sb.permissionMatrix ? 'yes' : 'no', evidence: sb.permissionMatrix ? '权限模式矩阵在档' : '未发现权限矩阵' },
      { key: 'workspace', critical: true, status: sb.workspaceGuard ? 'partial' : 'no', evidence: sb.workspaceGuard ? 'workspace 归属校验在档；terminal 目录白名单缺' : '未发现工作目录边界' },
      { key: 'network', status: sb.networkAllowlist ? 'yes' : 'no', evidence: sb.networkAllowlist ? '网络放行规则已接线' : 'browsersec 规则在档但无执行期消费者' },
      { key: 'secrets', critical: true, status: sb.secretRedaction ? 'yes' : 'no', evidence: sb.secretRedaction ? '审计默认不落入参值' : '存在原值落盘风险' },
      { key: 'limits', status: sb.declaredTimeouts >= 10 ? (sb.teardown ? 'yes' : 'partial') : 'no', evidence: `已声明超时的工具族 ${sb.declaredTimeouts} 个；任务后销毁=${sb.teardown ? '有' : '无'}` },
    ]),
    layerOf('verification', [
      { key: 'gates', critical: true, status: v.gatePacks >= 10 ? (v.typecheckScript ? 'yes' : 'partial') : 'no', evidence: `gate pack ${v.gatePacks} 个；typecheck 脚本=${v.typecheckScript ? '有' : '无'}` },
      { key: 'evalGate', status: v.evalSets > 0 ? 'partial' : 'no', evidence: v.evalSets > 0 ? '评测集存在；尚未接入常用门禁 profile' : '无固定评测集' },
      { key: 'external', status: v.releaseGate || v.uiOracle ? 'yes' : 'partial', evidence: `发布门=${v.releaseGate ? '在' : '缺'}，UI Oracle=${v.uiOracle ? '在' : '缺'}` },
      { key: 'release', status: v.releaseGate ? 'yes' : 'no', evidence: v.releaseGate ? 'release gate 在档' : '未发现发布准出检查' },
    ]),
    layerOf('permissions', [
      { key: 'enforce', critical: true, status: p.enforceWired && p.enforceEnabled ? 'yes' : p.enforceWired ? 'partial' : 'no', evidence: `执法门已接线=${p.enforceWired ? '是' : '否'}；显式开启=${p.enforceEnabled ? '是' : '否'}` },
      { key: 'identity', critical: true, status: p.identityInEnforcement ? 'yes' : 'no', evidence: p.identityInEnforcement ? '按发起用户裁决' : '裁决只看 profile，userId 仅入审计' },
      { key: 'scope', critical: true, status: p.scopedApprovals ? 'yes' : 'no', evidence: p.scopedApprovals ? '审批带范围/期限' : '审批记录缺 scope/expiresAt/source' },
      { key: 'allowAudit', critical: true, status: p.allowDecisionsAudited ? 'yes' : 'no', evidence: p.allowDecisionsAudited ? '放行决策入账' : 'ladder-pass/mode-pass 放行不落账' },
      { key: 'approvals', status: p.approvalRecords > 0 ? 'yes' : 'partial', evidence: `审批历史可查 ${p.approvalRecords} 条（环形上限 500）` },
    ]),
    layerOf('observability', [
      { key: 'audit', critical: true, status: o.auditEntries > 0 ? 'yes' : 'no', evidence: `窗口内审计行 ${o.auditEntries} 条` },
      { key: 'duration', status: durationRatio >= 0.9 ? 'yes' : durationRatio > 0 ? 'partial' : 'no', evidence: o.postEntries ? `${Math.round(durationRatio * 100)}% 的完成行带耗时（${o.postsWithDuration}/${o.postEntries}）` : '窗口内无完成行' },
      { key: 'errors', status: classifiedRatio >= 0.9 ? 'yes' : classifiedRatio > 0 ? 'partial' : 'no', evidence: t.failedPosts ? `${Math.round(classifiedRatio * 100)}% 的失败带错误分类` : '窗口内无失败调用' },
      { key: 'manifest', status: o.runManifest ? 'yes' : 'no', evidence: o.runManifest ? '运行清单在档' : '未发现运行清单（模型/参数/提示词版本）' },
      { key: 'cost', status: o.costPerRun ? 'yes' : 'no', evidence: o.costPerRun ? '成本可按 run 归集' : '成本只有按天/按模型聚合' },
    ]),
    layerOf('evals', [
      { key: 'fixedSets', critical: true, status: e.fixedSets > 0 ? 'yes' : 'no', evidence: `固定评测集 ${e.fixedSets} 套 / 评测运行 ${e.evalRuns} 次` },
      { key: 'dimensions', status: e.coveredDimensions >= 7 ? 'yes' : e.coveredDimensions >= 3 ? 'partial' : 'no', evidence: `七维覆盖 ${e.coveredDimensions}/7` },
      { key: 'heldout', status: e.heldoutQuestions > 0 ? 'partial' : 'no', evidence: `密封题 ${e.heldoutQuestions} 道` },
      { key: 'gate', status: e.gateIntegrated ? 'yes' : 'no', evidence: e.gateIntegrated ? '评测结果可阻断发布' : '评测仅回放打分，未接门禁' },
    ]),
  ]

  const counts = { covered: 0, partial: 0, missing: 0 }
  for (const layer of layers) counts[layer.status] += 1

  return {
    days: inputs.days,
    layers,
    counts,
    meta: {
      source: 'governance/harness + toolpipeline/audit + loop/graph + eval store + repo specs',
      note: '九层体检是自检清单，不是认证；数据缺席按 unavailable/partial 计，不造运行数据。',
      layersOrder: NINE_LAYER_ORDER,
    },
  }
}

function countFiles(dir: string, pattern: RegExp): number {
  try {
    if (!existsSync(dir)) return 0
    return readdirSync(dir).filter((f) => pattern.test(f)).length
  } catch {
    return 0
  }
}

function findOverlayRoot(): string | null {
  const env = process.env.OVERLAY_ROOT?.trim()
  if (env) return existsSync(env) ? env : null
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'custom', 'server'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function existsUnder(root: string | null, rel: string): boolean {
  if (!root) return false
  return existsSync(join(root, rel))
}

function countSubdirs(dir: string, exclude: RegExp = /^_/): number {
  try {
    if (!existsSync(dir)) return 0
    return readdirSync(dir).filter((name) => {
      if (exclude.test(name)) return false
      try { return statSync(join(dir, name)).isDirectory() } catch { return false }
    }).length
  } catch {
    return 0
  }
}

async function countGraphCheckpoints(dbPath: string): Promise<{ db: boolean; checkpoints: number; runs: number }> {
  if (!existsSync(dbPath)) return { db: false, checkpoints: 0, runs: 0 }
  try {
    // node:sqlite 是 Node 22+ 内置；仅读计数，失败按不可用处理。
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(dbPath)
    try {
      const row = db.prepare(
        'SELECT COUNT(*) AS c, COUNT(DISTINCT run_id) AS r FROM graph_checkpoints',
      ).get() as { c?: number; r?: number } | undefined
      return { db: true, checkpoints: Number(row?.c ?? 0), runs: Number(row?.r ?? 0) }
    } finally {
      db.close()
    }
  } catch {
    return { db: true, checkpoints: 0, runs: 0 }
  }
}

/** 任一以 typecheck 开头的脚本存在即算有类型检查入口（本轮起为 typecheck:harness）。 */
function packageHasTypecheck(root: string | null): boolean {
  if (!root) return false
  try {
    const raw = readFileSync(join(root, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> }
    return Object.entries(pkg.scripts ?? {}).some(([k, v]) => k.startsWith('typecheck') && typeof v === 'string')
  } catch {
    return false
  }
}

/** 采集真实数据（全部 fail-soft）。 */
export async function collectNineLayersInputs(days = 7): Promise<NineLayersInputs> {
  // 一次读取窗口审计账（最多 5000 行），明细用于比例口径，total 用全量计数。
  const windowAudit = queryToolExecAudit({ days, limit: 5_000 })
  const preEntries = windowAudit.entries.filter((e) => e.phase === 'pre')
  const postEntries = windowAudit.entries.filter((e) => e.phase === 'post')
  const failedPosts = postEntries.filter((e) => e.ok === false)
  const preWithSummary = preEntries.filter((e) => e.argSummary && Object.keys(e.argSummary).length > 0)
  const classifiedFailures = failedPosts.filter((e) => !!e.errorCategory)
  const duplicateFlagged = preEntries.filter((e) => e.duplicate).length

  const loopBase = resolveLoopBaseDir()
  const cp = await countGraphCheckpoints(join(loopBase, 'graph-events.db'))

  const home = homedir()
  const agentCheckpoints = countFiles(join(home, '.hermes', 'memories', 'checkpoints'), /\.md$/)
  const handoffCheckpoints = countFiles(join(home, '.hermes', 'session-checkpoints'), /\.json$/)
  const traceFiles = countFiles(join(home, '.hermes', 'traces'), /\.jsonl$/)

  const root = findOverlayRoot()
  const agentsMdPath = root ? join(root, 'AGENTS.md') : ''
  const rootAgentsMd = !!agentsMdPath && existsSync(agentsMdPath)
  let rootAgentsMdLines: number | null = null
  if (rootAgentsMd) {
    try { rootAgentsMdLines = readFileSync(agentsMdPath, 'utf8').split('\n').length } catch { rootAgentsMdLines = null }
  }
  const moduleAgentsMd = root
    ? countFiles(join(root, 'custom', 'server'), /^AGENTS\.md$/) + countFiles(join(root, 'custom', 'client'), /^AGENTS\.md$/)
    : 0
  const specFiles = root ? countFiles(join(root, 'docs', 'superpowers', 'specs'), /\.md$/) : 0
  const gatePacks = root ? countSubdirs(join(root, 'custom', 'qgate', 'gate-packs')) : 0

  const approvalRecords = queryApprovalLog(500).length
  const evalSets = listEvalSets().length
  const evalRuns = listEvalRuns().length
  let heldoutQuestions = 0
  try {
    for (const set of listHeldoutSets()) heldoutQuestions += set.itemCount ?? 0
  } catch { heldoutQuestions = 0 }

  const contractsWithTimeout = BUILTIN_CONTRACTS.filter((c) => c.timeoutMs > 0).length
  const enforceEnabled = process.env.HERMES_TOOL_ENFORCE === '1'

  return {
    days,
    tools: {
      contracts: BUILTIN_CONTRACTS.length,
      auditedCalls: windowAudit.total,
      preEntries: preEntries.length,
      preWithSummary: preWithSummary.length,
      failedPosts: failedPosts.length,
      classifiedFailures: classifiedFailures.length,
      duplicateFlagged,
    },
    loop: {
      runawayGuard: existsUnder(root, 'runtime/agent/runaway_guard.py'),
      stuckDetector: existsUnder(root, 'custom/server/loop/engine/stuck-detector.ts'),
      guardedEdges: existsUnder(root, 'custom/server/loop/graph/graph-runtime.ts'),
      classifiedRetry: existsUnder(root, 'custom/server/toolcontract/contract.ts'),
      checkpoints: cp.checkpoints,
      runsWithCheckpoints: cp.runs,
    },
    memory: {
      checkpointDb: cp.db,
      graphCheckpoints: cp.checkpoints,
      agentCheckpoints,
      handoffCheckpoints,
    },
    context: {
      rootAgentsMd,
      rootAgentsMdLines,
      moduleAgentsMd,
      specFiles,
    },
    sandbox: {
      permissionMatrix: existsUnder(root, 'custom/server/permmodes/permission-modes.ts'),
      workspaceGuard: existsUnder(root, 'custom/server/zcode/workspace-access.ts'),
      // browsersec 规则在档但执行期无消费者（2026-10-18 盘点结论）→ 保守为 false。
      networkAllowlist: false,
      secretRedaction: true,
      declaredTimeouts: contractsWithTimeout,
      teardown: false,
    },
    verification: {
      gatePacks,
      typecheckScript: packageHasTypecheck(root),
      evalSets,
      releaseGate: existsUnder(root, 'custom/server/eval/releaseGate.ts'),
      uiOracle: existsUnder(root, 'custom/server/eval/uioracle.ts'),
    },
    permissions: {
      enforceWired: existsUnder(root, 'custom/server/toolpipeline/enforce-gate.ts'),
      enforceEnabled,
      approvalRecords,
      // 2026-10-18 盘点：审批记录缺 scope/expiresAt/source；本轮不收窄安全边界。
      scopedApprovals: false,
      identityInEnforcement: false,
      allowDecisionsAudited: false,
    },
    observability: {
      auditEntries: windowAudit.total,
      postEntries: postEntries.length,
      postsWithDuration: postEntries.filter((e) => typeof e.durationMs === 'number').length,
      traceFiles,
      runManifest: false,
      costPerRun: false,
    },
    evals: {
      fixedSets: evalSets,
      evalRuns,
      heldoutQuestions,
      // 现有 rubric 覆盖 result/trajectory/risk 三面；参数级/恢复/状态保持/越权未覆盖。
      coveredDimensions: evalSets > 0 ? 3 : 0,
      gateIntegrated: false,
    },
  }
}
