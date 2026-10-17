// overlay/custom/client/ia2/views/sim/steps-registry.ts
// 26 步/七幕/六闸前端常量与行状态折算（S1 轮次总览，旗舰签 B2 工单）。
//
// §3.3 映射表单一事实源，前端副本：
// - 完成键（keys）=上游方案正本 §3.3「state.env 状态标志」列逐行誊写
//   （docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md L1305-L1329，V8.38 重锚）；
// - 步名/操作者=同正本 §2.4 各步条「这步做什么」标题与「操作指引·操作者」列照录；
// - 七幕区间=同正本 §2.4「七幕主线」（L417，V8.38 重锚）。
// 守门测试（sim-overview-panel.test.ts）对本副本做 §3.3/§2.4 抽查断言——
// 改任一端，测试当场失败（纪律 45 前端口径）。
//
// 已知契约缺口（如实注明，不静默）：步 8/9 的完成键 room_analysis/dispatch_marker
// 不匹配 observability（631）steps/gates 筛选正则（无 _done/_pass/_verified 尾），
// run-state 端点两字典中不可见——折算走「链位推断」：主链序（§2.4 步链依赖）下
// 后步完成 ⇒ 前步已过，仅补这两步，不外推（见 resolveStepRows）。

// ── 七幕（§2.4 七幕主线；幕=叙事单元，驱动段位映射另见 §3.3） ──

export interface ActMeta { act: number; name: string; from: number; to: number }

export const ACTS_7: ReadonlyArray<ActMeta> = [
  { act: 1, name: '序幕·搭台', from: 1, to: 4 },
  { act: 2, name: '第一幕·需求上锁', from: 5, to: 8 },
  { act: 3, name: '第二幕·需求分析', from: 9, to: 14 },
  { act: 4, name: '第三幕·设计与排期', from: 15, to: 17 },
  { act: 5, name: '第四幕·并行生产', from: 18, to: 19 },
  { act: 6, name: '第五幕·发布与验收', from: 20, to: 21 },
  { act: 7, name: '尾声·治理与复盘', from: 22, to: 26 },
]

export function actOfStep(no: number): number {
  const hit = ACTS_7.find(a => no >= a.from && no <= a.to)
  return hit ? hit.act : 1
}

// ── 26 步（步名/操作者=§2.4 照录；完成键/关卡标志=§3.3 逐行誊写） ──

export interface StepMeta {
  no: number
  name: string
  operator: string
  /** §3.3「state.env 状态标志」列——判定该步完成的主键（含闸键 g1_frozen/g2_arch_pass） */
  keys: string[]
  /** §3.3「关卡标志」括注（g3_code_pass/g4_pass/g5_ready）——不计步完成，供六闸仪对位 */
  gateFlags?: string[]
  /** 完成键不入 631 steps/gates 筛选（room_analysis/dispatch_marker）→ 链位推断 */
  hiddenKey?: boolean
}

export const STEPS_26: ReadonlyArray<StepMeta> = [
  { no: 1, name: '账号分配', operator: '驱动脚本（持 admin token）', keys: ['smoke_done'] },
  { no: 2, name: '每用户配置初始化', operator: '驱动脚本', keys: ['smoke_done'] },
  { no: 3, name: '登录', operator: '每个账号', keys: ['smoke_done'] },
  { no: 4, name: '环境冒烟', operator: '驱动脚本', keys: ['smoke_done'] },
  { no: 5, name: '应用初始化', operator: '驱动脚本（界面同源：治理中心·应用资产页签）', keys: ['appinit_done'] },
  { no: 6, name: '研发人员管理', operator: '驱动脚本（界面同源：治理中心·组织页签）', keys: ['people_done'] },
  { no: 7, name: '需求上锁（G1）', operator: '需求分析师A（驱动脚本代发私信）；G1 判读=驱动脚本', keys: ['g1_frozen'] },
  // §3.3：步 1-4 四合一段共用 smoke_done；步 7 键名=g1_frozen（非 archgate_done 同族陷阱，步 15 同理）
  { no: 8, name: '建群', operator: '产品经理A', keys: ['room_analysis'], hiddenKey: true },
  { no: 9, name: '派发', operator: '产品经理A 人类账号发信，@需求分析AI 执行', keys: ['dispatch_marker'], hiddenKey: true },
  { no: 10, name: '看板登记与任务分解', operator: '卡由 需求分析AI 自己建；驱动脚本只轮询验收、不合格回灌', keys: ['register_done'] },
  { no: 11, name: '系统分析与拆分', operator: '驱动脚本核验（回灌消息以 产品经理A 名义发）', keys: ['analysis_done', 'analysis_verified'] },
  { no: 12, name: '分诊与派工', operator: '团队负责人A/团队负责人B（驱动脚本代做分诊确认，纯板操作无消息）', keys: ['triage_done'] },
  { no: 13, name: '精准系分（四路）', operator: 'chen/xiao/hu/lin 各自人类账号四路同发（@各自 agent+lead agent）', keys: ['anexec_done'] },
  { no: 14, name: '汇总复核定稿', operator: '产品经理A 派发汇总复核；线下虚拟架构小组评审由驱动脚本代走板', keys: ['review_done'] },
  { no: 15, name: '架构治理评审（G2）', operator: '系统架构师A（架构治理）评审；驱动脚本先补邀进群+代建评审卡', keys: ['g2_arch_pass'] },
  { no: 16, name: '系分收尾', operator: '产品经理A（收尾主任务）', keys: ['close_done'] },
  { no: 17, name: '排期', operator: '产品经理A（pm-planning 技能）', keys: ['plan_done'] },
  { no: 18, name: '编码（G3）', operator: '研发工程师A（3 路）/研发工程师D/研发工程师B/研发工程师C 六路同刻派发；测试工程师A/B 预备轮', keys: ['devimpl_done'], gateFlags: ['g3_code_pass'] },
  { no: 19, name: '独立测试（G4）', operator: '后端 lead（wei）/前端 lead（mei）评审+集成合并（V8.30 职责归位）；测试工程师A/B 派发测试；驱动只做真值验收与超时兜底', keys: ['defect_done', 'testpass_done'], gateFlags: ['g4_pass'] },
  { no: 20, name: '发布准出（G5）', operator: '产品经理A（G5 评审）；对外发布=人工批准（批准事件留档）', keys: ['ready_done', 'release_done'], gateFlags: ['g5_ready'] },
  { no: 21, name: 'UAT 验收', operator: '需求分析师A（需求提出方）派发+逐条核对；验收书驱动脚本代写（author=bella 账号）', keys: ['uat_done'] },
  { no: 22, name: '工作台账', operator: '驱动脚本（纯数据实查，无 LLM 参与）', keys: ['workmgr_done'] },
  { no: 23, name: '合规审计', operator: '驱动脚本（机械化审计）+审计AI 独立复核（fire-and-forget 不等待）', keys: ['audit_done'] },
  { no: 24, name: '复盘（G6）', operator: '驱动脚本', keys: ['retro_done'] },
  { no: 25, name: 'IDE 工作台全程介入', operator: '驱动脚本（API/代码级核验）+界面走查', keys: ['ide_done'] },
  { no: 26, name: 'HTML 推演报告', operator: '驱动脚本', keys: ['report_done'] },
]

// ── 六闸（详设签 1「六闸 n/6（键=g1_frozen…report_done）」；全名见 §5.3/SimGateBadge） ──

export interface GateMeta { id: 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6'; key: string; step: number }

export const SIX_GATES: ReadonlyArray<GateMeta> = [
  { id: 'G1', key: 'g1_frozen', step: 7 },
  { id: 'G2', key: 'g2_arch_pass', step: 15 },
  { id: 'G3', key: 'g3_code_pass', step: 18 },
  { id: 'G4', key: 'g4_pass', step: 19 },
  { id: 'G5', key: 'g5_ready', step: 20 },
  // G6 取 report_done（详设签 1 键区间右端；闸键首过保护族另含 uat_done/retro_done，
  // 那两键属步完成键不入六闸计数）
  { id: 'G6', key: 'report_done', step: 26 },
]

// ── 行状态折算（导出纯函数，测试面） ──

export type StepRowState = 'done' | 'active' | 'pending'

export interface StepRow {
  no: number
  name: string
  operator: string
  state: StepRowState
  /** ✓ 时刻=首个命中完成键的原值（state.env 值照录：时刻或标志值） */
  at: string | null
  /** 命中的完成键值对（锚点抽屉证据） */
  doneKeys: Array<{ key: string; value: string }>
  /** 键值中的十六进制 commit 串（双凭证标用；无则 null） */
  commit: string | null
  act: number
}

/** 键值中的 commit 识别：7-40 位十六进制且含至少一个 a-f（排除纯数字时间戳/序号） */
export function extractCommit(values: string[]): string | null {
  for (const v of values) {
    for (const m of v.matchAll(/[0-9a-f]{7,40}/g)) {
      const tok = m[0]
      if (/[a-f]/.test(tok)) return tok
    }
  }
  return null
}

/**
 * 26 步行状态折算（纯函数）：
 * - done=任一完成键出现在 run-state 的 steps/gates 字典（键在即完成标记已写）；
 * - 步 8/9（hiddenKey）链位推断：主链序下最远完成步 > 该步步号 ⇒ 已过（§2.4 步链依赖；
 *   仅补这两步——其键不入 631 筛选，非推测其他步）；
 * - active=未完成且所属幕 ≤ 当前幕（当前幕内的未完成=进行中；早于当前幕仍未完成的
 *   归入进行中样式以醒目暴露异常缺口，三态口径内不另造第四态）；
 * - pending=所属幕 > 当前幕（未达灰）。当前幕=最远完成步所在幕；零完成=首幕。
 */
export function resolveStepRows(
  steps: Record<string, string>,
  gates: Record<string, string>,
): StepRow[] {
  const merged: Record<string, string> = { ...steps, ...gates }
  const observed = new Set<number>()
  for (const s of STEPS_26) {
    if (s.keys.some(k => k in merged)) observed.add(s.no)
  }
  const frontier = observed.size > 0 ? Math.max(...observed) : 0
  for (const s of STEPS_26) {
    if (s.hiddenKey && frontier > s.no) observed.add(s.no)
  }
  const maxDone = observed.size > 0 ? Math.max(...observed) : 0
  const curAct = actOfStep(maxDone > 0 ? maxDone : 1)
  return STEPS_26.map(s => {
    const doneKeys = s.keys.filter(k => k in merged).map(k => ({ key: k, value: merged[k] ?? '' }))
    const isDone = observed.has(s.no)
    const state: StepRowState = isDone ? 'done' : (actOfStep(s.no) <= curAct ? 'active' : 'pending')
    return {
      no: s.no,
      name: s.name,
      operator: s.operator,
      state,
      at: doneKeys[0]?.value ?? null,
      doneKeys,
      commit: doneKeys.length > 0 ? extractCommit(doneKeys.map(d => d.value)) : null,
      act: actOfStep(s.no),
    }
  })
}

/** 26 步完成计数（含代偿口径——所有完成标记均计，不问完成通道） */
export function countStepsDone(rows: StepRow[]): number {
  return rows.filter(r => r.state === 'done').length
}

// ── 净额口径（§1.2：满足面扣除代演/代偿通过项；数据源=代偿台账） ──

/** 步级代演型台账类型（§1.2 三判据中的「卡交付/集成合并」两支：
 * card-backfill/card-walk-done=看板卡驱动补建/代走 done 不计交付；
 * driver-merge=集成驱动代合并不计组织完成合并。nudge 等提醒型不扣步。） */
export const STEP_COMP_TYPES: ReadonlyArray<string> = ['card-backfill', 'card-walk-done', 'driver-merge']

/**
 * 净额步可用（纯函数）：含代偿完成数 − 步级代演型台账笔数（每笔=一项满足面扣除，
 * 下限 0）。台账摘要（run-state.ledger.byType）无步级映射，本式为公式化扣减——
 * 精确到步需台账 detail 列端点支持（挂账，界面随卡注明公式）。
 */
export function netStepsAvailable(rows: StepRow[], byType: Record<string, number>): number {
  const deduction = STEP_COMP_TYPES.reduce((sum, t) => sum + (byType[t] ?? 0), 0)
  return Math.max(0, countStepsDone(rows) - deduction)
}

/** 净额扣减笔数（紫标计数用） */
export function compDeduction(byType: Record<string, number>): number {
  return STEP_COMP_TYPES.reduce((sum, t) => sum + (byType[t] ?? 0), 0)
}

// ── 六闸折算（打回计数自 issues.log 聚合端点，code 前缀 g<N>- 入闸） ──

export interface GateRow {
  id: GateMeta['id']
  key: string
  step: number
  passed: boolean
  at: string | null
  /** 打回计数=issues.log 中 code 前缀 g<N>（如 g1-acceptance-blocked）的 ISSUE 行数 */
  rejectCount: number
}

/** issues 行（形状=/api/hermes/sim/issues 契约；只取判定所需字段） */
export interface IssueLike { kind: string; code: string }

export function resolveGateRows(
  gates: Record<string, string>,
  steps: Record<string, string>,
  issues: IssueLike[] | null,
): GateRow[] {
  const merged: Record<string, string> = { ...steps, ...gates }
  const rejects: Record<string, number> = {}
  if (issues) {
    for (const ln of issues) {
      const m = /^g([1-6])(?:[.-]|$)/.exec(ln.code)
      if (m && ln.kind === 'issue') rejects[`G${m[1]}`] = (rejects[`G${m[1]}`] ?? 0) + 1
    }
  }
  return SIX_GATES.map(g => {
    const passed = g.key in merged
    return {
      id: g.id,
      key: g.key,
      step: g.step,
      passed,
      at: passed ? merged[g.key] ?? '' : null,
      rejectCount: issues ? rejects[g.id] ?? 0 : 0,
    }
  })
}
