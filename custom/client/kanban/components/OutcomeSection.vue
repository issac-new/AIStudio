<script setup lang="ts">
// OutcomeSection — 根任务业务结果面板（批一 Task 13；spec §91：根任务抽屉
// OutcomeSection 建/激活/观察/结算）。
// 数据面：GET /outcomes?rootTaskId= 命中即渲染（合同即挂在根任务上，命中即根）；
// 无合同且本卡为根卡（无 parents，由抽屉传入）→「建模业务结果」提示入口；
// 无合同非根卡 → 整段不渲染。功能门关（404 outcome_workbench_disabled）→
// 整段不渲染且不报错；其余 API 失败 → 本段显示不可用，不炸抽屉（fail-soft）。
// 读面（Task 15 升级）：「最新实际值」按 GET /:id/measurements 的 latest 摘要
// （当前版本口径）真实读取；「结算摘要」按 GET /:id/settlement（最新有效＋
// superseded 链）。读取失败（非门关）→ 降级回显本会话提交响应并如实标注，
// 历史以服务端事件账为准（不猜数）。
// 权限（spec §4.6）：激活/取消/结算=owner；观察迁移/测量=owner 或 verifier；
// 服务端另有 owner/verifier 须在人员名单 active 的守卫，前端无从判断，
// 只按登录名比对禁用并示因，终裁以服务端 403 为准。
import { computed, ref, watch } from 'vue'
import { getStoredUsername } from '@/api/client'
import {
  createOutcome,
  fetchOutcomeByRoot,
  fetchOutcomeMeasurements,
  fetchOutcomeSettlement,
  fetchOutcomeComparison,
  type OutcomeComparison,
  fetchOutcomeSnapshots,
  settleOutcome,
  submitMeasurement,
  transitionOutcome,
  OutcomeApiError,
  OutcomeWorkbenchDisabledError,
  type MeasureOperator,
  type OutcomeContract,
  type OutcomeMeasurement,
  type OutcomeSettlement,
  type OutcomeSettlementSuperseded,
  type OutcomeVerdict,
} from '@/custom/kanban/api/outcome'

const props = defineProps<{
  taskId: string
  /** 根卡判定：任务无 parents（抽屉 links.parents 为空）。 */
  isRootTask?: boolean
  /** 卡标题（抽屉 task.title）：建模表单 title 预填用（可改），不伪造。 */
  taskTitle?: string
}>()

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', active: '生效', observing: '观察期', settled: '已结算', cancelled: '已取消',
}
const EFFECT_LABEL: Record<string, string> = { improved: '有改善迹象', degraded: '较基线退步', unknown: '效果未知' }
const VERDICT_LABEL: Record<string, string> = {
  achieved: '达成', partial: '部分达成', missed: '未达成', unknown: '无法判定（证据缺口）',
}
const OPERATOR_LABEL: Record<string, string> = { gte: '≥', lte: '≤', eq: '＝' }

// 登录名即 actor（服务端 actorOf 同口径：ctx.state.user.username）。
const actor = getStoredUsername() ?? ''

const loading = ref(false)
const gateOff = ref(false)
const loadError = ref('')
const contract = ref<OutcomeContract | null>(null)
const snapshotCount = ref<number | null>(null)

// 服务端读面（Task 15）：latest=每 measure 当前版本最新摘要；settlement=最新有效结算
const serverLatest = ref<Record<string, OutcomeMeasurement>>({})
const serverSettlement = ref<OutcomeSettlement | null>(null)
const supersededChain = ref<OutcomeSettlementSuperseded[]>([])
// 批二 T6：同口径对照投影（settled 后加载；只读）
const comparison = ref<OutcomeComparison | null>(null)
// 读面降级标记：测量/结算读失败（非门关）→ 回退会话内回显并如实标注
const readDegraded = ref(false)

// 会话内回显（读面降级时的实时来源；正常态由服务端读面覆盖）
const sessionMeasurements = ref<Map<string, OutcomeMeasurement>>(new Map())
const sessionSettlement = ref<OutcomeSettlement | null>(null)

async function load(): Promise<void> {
  loading.value = true
  gateOff.value = false
  loadError.value = ''
  contract.value = null
  snapshotCount.value = null
  serverLatest.value = {}
  serverSettlement.value = null
  supersededChain.value = []
  readDegraded.value = false
  sessionMeasurements.value = new Map()
  sessionSettlement.value = null
  if (!props.taskId) { loading.value = false; return }
  try {
    contract.value = await fetchOutcomeByRoot(props.taskId)
  } catch (err) {
    if (err instanceof OutcomeWorkbenchDisabledError) gateOff.value = true
    else loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
  if (contract.value) {
    try {
      const snaps = await fetchOutcomeSnapshots(contract.value.outcomeId)
      snapshotCount.value = snaps.length
    } catch (err) {
      if (err instanceof OutcomeWorkbenchDisabledError) gateOff.value = true
      /* 快照计数 fail-soft：显示 — */
    }
    // 测量/结算读面（Task 15）：失败（非门关）降级回显并标注，不炸段
    try {
      const m = await fetchOutcomeMeasurements(contract.value.outcomeId)
      serverLatest.value = m.latest
    } catch (err) {
      if (err instanceof OutcomeWorkbenchDisabledError) gateOff.value = true
      else readDegraded.value = true
    }
    try {
      const s = await fetchOutcomeSettlement(contract.value.outcomeId)
      serverSettlement.value = s.settlement
      supersededChain.value = s.superseded
      if (contract.value.status === 'settled') {
        try { comparison.value = await fetchOutcomeComparison(contract.value.outcomeId) } catch { comparison.value = null }
      }
    } catch (err) {
      if (err instanceof OutcomeWorkbenchDisabledError) gateOff.value = true
      else readDegraded.value = true
    }
  }
}

watch(() => props.taskId, () => { void load() }, { immediate: true })

// 整段渲染判定：门关不渲染；无合同非根卡不渲染；无合同根卡渲染建模入口。
const visible = computed(() => {
  if (gateOff.value) return false
  return !!contract.value || !!props.isRootTask
})

// ---------- 权限（前端只按登录名比对；服务端另有 active 名单守卫，403 终裁） ----------
// observing 迁移/测量=owner 或 verifier；激活/取消/结算=owner（控制器 authz 同口径）
const isOwner = computed(() => !!contract.value && actor !== '' && actor === contract.value.ownerPersonId)
const isVerifier = computed(() => !!contract.value && actor === contract.value.verificationOwnerId)
const authzNote = computed(() => {
  if (!contract.value || isOwner.value) return ''
  if (isVerifier.value) return '验证责任人（verifier）仅可发起观察迁移与提交测量；激活/取消/结算仅结果责任人可操作'
  return `仅结果责任人（owner）或验证责任人（verifier）可操作（当前登录：${actor || '未登录'}）`
})

const actionMsg = ref<{ ok: boolean; text: string } | null>(null)

async function doTransition(to: 'active' | 'observing'): Promise<void> {
  if (!contract.value) return
  actionMsg.value = null
  try {
    contract.value = await transitionOutcome(contract.value.outcomeId, { to })
    actionMsg.value = { ok: true, text: to === 'active' ? '合同已激活（绑定根任务家族）' : '已进入观察期' }
  } catch (err) {
    // F3 定向文案：按响应码（body.code）识别，不做 problems 字符串匹配——
    // schema_missing=看板库缺 outcome_id 列（805 迁移面未覆盖），须修库而非重试。
    if (err instanceof OutcomeApiError && err.code === 'schema_missing') {
      actionMsg.value = {
        ok: false,
        text: '激活失败：看板库缺 outcome_id 列（805 迁移面未覆盖）——经 python CLI 建库/迁移或手工补列后重试',
      }
      return
    }
    actionMsg.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  }
}

// ---------- 取消（reason 必填，服务端 reason_required 守卫） ----------
const cancelOpen = ref(false)
const cancelReason = ref('')
const cancelErr = ref('')

async function doCancel(): Promise<void> {
  if (!contract.value) return
  cancelErr.value = ''
  if (!cancelReason.value.trim()) {
    cancelErr.value = '取消必须填写理由（reason）'
    return
  }
  actionMsg.value = null
  try {
    contract.value = await transitionOutcome(contract.value.outcomeId, { to: 'cancelled', reason: cancelReason.value.trim() })
    cancelOpen.value = false
    actionMsg.value = { ok: true, text: '合同已取消（终态）' }
  } catch (err) {
    actionMsg.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  }
}

// ---------- 测量提交（owner 或 verifier） ----------
const measureFormOpen = ref(false)
const measureId = ref('')
const measureActual = ref('')
const measureAvailability = ref<'available' | 'pending' | 'unavailable'>('available')
const measureEvidence = ref('')
const measureErr = ref('')
const measureBusy = ref(false)

const measureOptions = computed(() => contract.value?.measures ?? [])

function openMeasureForm(): void {
  measureFormOpen.value = !measureFormOpen.value
  if (measureFormOpen.value && !measureId.value && measureOptions.value.length) {
    measureId.value = measureOptions.value[0]!.measureId
  }
}

async function doSubmitMeasurement(): Promise<void> {
  if (!contract.value || measureBusy.value) return
  measureErr.value = ''
  // v-model 对 type=number 自动 number 化（可解析时），空输入保持 ''——统一按字符串处理
  const actualTrim = String(measureActual.value ?? '').trim()
  const evidenceRefs = measureEvidence.value.split('\n').map((s) => s.trim()).filter(Boolean)
  if (measureAvailability.value === 'available' && actualTrim === '') {
    measureErr.value = '实际值必填（可用性=有值 时不得为空；不可用请改选可用性）'
    return
  }
  if (actualTrim !== '' && !Number.isFinite(Number(actualTrim))) {
    measureErr.value = '实际值须为有限数值'
    return
  }
  if (evidenceRefs.length === 0) {
    measureErr.value = '证据引用必填（每行一条，至少一条——spec §4.6 无论来源必须附证据）'
    return
  }
  measureBusy.value = true
  try {
    const m = await submitMeasurement(contract.value.outcomeId, {
      measureId: measureId.value,
      contractVersion: contract.value.version,
      actual: actualTrim === '' ? null : Number(actualTrim),
      availability: measureAvailability.value,
      evidenceRefs,
    })
    sessionMeasurements.value = new Map(sessionMeasurements.value).set(m.measureId, m)
    // 乐观同步读面摘要（服务端权威，下次 load 以读端点为准）
    serverLatest.value = { ...serverLatest.value, [m.measureId]: m }
    // 连续提交防误带旧值：成功后清空实际值与证据（度量/可用性保留上次选择便于批量录入）
    measureActual.value = ''
    measureEvidence.value = ''
    actionMsg.value = { ok: true, text: `测量已记录（${m.measureId} → ${m.actual ?? '未知'}）` }
  } catch (err) {
    actionMsg.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    measureBusy.value = false
  }
}

function latestActualOf(measureId: string): OutcomeMeasurement | null {
  // 服务端读面优先（当前版本口径）；读面降级时回退会话内回显
  return serverLatest.value[measureId] ?? sessionMeasurements.value.get(measureId) ?? null
}

// 结算摘要展示源：会话内回显（签署后即时）优先，常态由服务端读面供给
const shownSettlement = computed<OutcomeSettlement | null>(
  () => sessionSettlement.value ?? serverSettlement.value,
)

// ---------- 结算签署（owner only；仅 observing） ----------
const settleVerdict = ref<'' | OutcomeVerdict>('')
const settleRationale = ref('')
const settleGapNote = ref('')
const settleNextReview = ref('')
const settleErr = ref('')
const settleBusy = ref(false)

/** datetime-local 值 → ms epoch；空串/非法返回 null。 */
function parseNextReview(): number | null {
  const v = settleNextReview.value.trim()
  if (!v) return null
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

async function doSettle(): Promise<void> {
  if (!contract.value || settleBusy.value) return
  settleErr.value = ''
  if (settleVerdict.value === '') {
    settleErr.value = '请选择裁决（达成/部分达成/未达成/无法判定）'
    return
  }
  const rationaleLen = settleRationale.value.trim().length
  if (rationaleLen < 20) {
    settleErr.value = `裁决理由 trim 后至少 20 字（现 ${rationaleLen} 字）——结算是对外承诺的正式收口`
    return
  }
  if (settleVerdict.value === 'unknown') {
    if (!settleGapNote.value.trim()) {
      settleErr.value = '裁决=无法判定必须说明证据缺口（gapNote：缺哪个口径/为何无法判定）'
      return
    }
    const next = parseNextReview()
    if (next === null) {
      settleErr.value = '裁决=无法判定必须安排下次复审时间（须晚于当前时刻）'
      return
    }
    if (next <= Date.now()) {
      settleErr.value = '下次复审时间必须晚于当前时刻（不得排在过去）'
      return
    }
  }
  settleBusy.value = true
  try {
    // 引用集＝本会话提交 ∪ 服务端在账最新（终审 I-2：刷新后 session 为空不空引用；
    // 服务端同门兜底——有在账测量时空集 422，这里先行并集减少一次往返失败）。
    const referenced = new Set<string>([
      ...[...sessionMeasurements.value.values()].map((m) => m.measurementId),
      ...Object.values(serverLatest.value).map((m) => m.measurementId),
    ])
    const s = await settleOutcome(contract.value.outcomeId, {
      verdict: settleVerdict.value,
      rationale: settleRationale.value.trim(),
      measurementIds: [...referenced],
      contractVersion: contract.value.version,
      ...(settleVerdict.value === 'unknown'
        ? { gapNote: settleGapNote.value.trim(), nextReviewAt: parseNextReview() ?? undefined }
        : {}),
    })
    sessionSettlement.value = s
    settleVerdict.value = ''
    settleRationale.value = ''
    settleGapNote.value = ''
    settleNextReview.value = ''
    actionMsg.value = { ok: true, text: '结算已签署（合同进入已结算终态）' }
    // 结算改变合同状态，重读正身
    try {
      contract.value = await fetchOutcomeByRoot(props.taskId)
    } catch { /* 重读失败保留本地态，不覆盖刚签署的回显 */ }
  } catch (err) {
    actionMsg.value = { ok: false, text: err instanceof Error ? err.message : String(err) }
  } finally {
    settleBusy.value = false
  }
}

function fmtTs(ms?: number): string {
  return ms && Number.isFinite(ms) ? new Date(ms).toLocaleString() : '—'
}

// ---------- 建模表单（批四 T1）：空态根卡「建合同」折叠表单 ----------
// 必填集与服务端 validateContractInput 同源（D1：单一事实源）；客户端只做必填
// 非空级提示，合法性判定（高风险同人分离、人员名单 active 等）一律服务端终裁
// ——这里仅给预警文案，不阻断。未入表单的字段按服务端可接受缺省发送：
// acceptance.requiredEvidenceKinds/scope.excluded/contextPolicy 均空数组（validate
// 接受空数组），不伪造内容；rootTaskId=当前卡自动携带，不暴露输入。
interface MeasureRow {
  measureId: string
  name: string
  unit: string
  operator: MeasureOperator
  target: string
  baseline: string
  definition: string
  sourceRef: string
}

const createOpen = ref(false)
const createBusy = ref(false)
/** 幂等键：打开表单时生成一次，失败重试不换键（重开/换卡才换新会话）。 */
const createClientRequestId = ref('')
const createTitle = ref('')
const createValue = ref('')
const createOwner = ref('')
const createVerifier = ref('')
const createRiskTier = ref<'' | 'low' | 'medium' | 'high'>('')
const createReversibility = ref<'' | 'reversible' | 'costly' | 'one-way' | 'unknown'>('')
const createLearningOptIn = ref(false)
/** 验收陈述（每行一条）——定性合同可只填陈述不加度量。 */
const createStatements = ref('')
/** scope.included（逗号分隔，可留空=空数组）。 */
const createScopeIncluded = ref('')
const createMeasures = ref<MeasureRow[]>([])
const createErr = ref('')
/** 服务端 422 problems 逐条回显。 */
const createProblems = ref<string[]>([])
/** 409（root_task_taken/outcome_exists）：提示刷新而非重试（重试同键仍 409）。 */
const createConflict = ref(false)

/** 高风险/不可逆预警（警示色，不用绿色）：只提示不阻断，服务端终裁。 */
const createRiskHint = computed(() => {
  if (createRiskTier.value === 'high') return '高风险：验证责任人必须与结果责任人分离（同人将被服务端拒绝）'
  if (createRiskTier.value === 'medium') return '中风险：允许责任/验证同人，但未分离（服务端将附未分离提示）'
  return ''
})
const createReversibilityHint = computed(() =>
  createReversibility.value === 'one-way' ? '不可逆：动作一旦执行无法撤销，请确认验收口径' : '',
)

// 切卡即换建模会话：表单收起（clientRequestId 随下次打开重新生成）。
// 独立非 immediate watch：上面主 watch 是 immediate，此块声明在其后避免 TDZ。
watch(() => props.taskId, () => { createOpen.value = false })

function toggleCreateForm(): void {
  createOpen.value = !createOpen.value
  if (!createOpen.value) return
  createClientRequestId.value = `creq-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  // 预填不伪造：title=卡标题（可改）、owner=当前登录人（可改），其余留空
  createTitle.value = (props.taskTitle ?? '').trim()
  createValue.value = ''
  createOwner.value = actor
  createVerifier.value = ''
  createRiskTier.value = ''
  createReversibility.value = ''
  createLearningOptIn.value = false
  createStatements.value = ''
  createScopeIncluded.value = ''
  createMeasures.value = []
  createErr.value = ''
  createProblems.value = []
  createConflict.value = false
}

function addMeasureRow(): void {
  createMeasures.value.push({
    measureId: `m${createMeasures.value.length + 1}`,
    name: '', unit: '', operator: 'gte', target: '', baseline: '', definition: '', sourceRef: '',
  })
}

function removeMeasureRow(idx: number): void {
  createMeasures.value.splice(idx, 1)
}

/** 必填非空级客户端提示（D1：合法性判定一律服务端）。 */
function collectCreateMissing(): string[] {
  const miss: string[] = []
  if (!createTitle.value.trim()) miss.push('标题')
  if (!createValue.value.trim()) miss.push('价值陈述')
  if (!createOwner.value.trim()) miss.push('结果责任人')
  if (!createVerifier.value.trim()) miss.push('验证责任人')
  if (createRiskTier.value === '') miss.push('风险档')
  if (createReversibility.value === '') miss.push('默认可逆性')
  createMeasures.value.forEach((row, i) => {
    const rowMiss: string[] = []
    // type=number 的 v-model 可解析时自动 number 化（空输入保持 ''）——统一按字符串判空
    const target = String(row.target ?? '').trim()
    const baseline = String(row.baseline ?? '').trim()
    if (!row.measureId.trim()) rowMiss.push('measureId')
    if (!row.name.trim()) rowMiss.push('名称')
    if (!row.unit.trim()) rowMiss.push('单位')
    if (target === '' || !Number.isFinite(Number(target))) rowMiss.push('目标值（有限数值）')
    if (baseline !== '' && !Number.isFinite(Number(baseline))) rowMiss.push('基线（留空或有限数值）')
    if (!row.definition.trim()) rowMiss.push('口径定义')
    if (!row.sourceRef.trim()) rowMiss.push('数据源引用')
    if (rowMiss.length) miss.push(`度量${i + 1}：${rowMiss.join('、')}`)
  })
  const statements = createStatements.value.split('\n').map((s) => s.trim()).filter(Boolean)
  if (createMeasures.value.length === 0 && statements.length === 0) {
    miss.push('度量与验收陈述至少填一项（定性合同可只填验收陈述）')
  }
  return miss
}

/** 逗号分隔（中英文逗号/换行）→ trim 后非空数组（scope.included 用）。 */
function splitCsv(v: string): string[] {
  return v.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)
}

async function doCreateOutcome(): Promise<void> {
  if (createBusy.value || !props.taskId) return
  createErr.value = ''
  createProblems.value = []
  createConflict.value = false
  const miss = collectCreateMissing()
  if (miss.length) {
    createErr.value = `必填未填：${miss.join('；')}`
    return
  }
  createBusy.value = true
  try {
    await createOutcome({
      rootTaskId: props.taskId,
      title: createTitle.value.trim(),
      valueStatement: createValue.value.trim(),
      ownerPersonId: createOwner.value.trim(),
      verificationOwnerId: createVerifier.value.trim(),
      riskTier: createRiskTier.value as 'low' | 'medium' | 'high',
      defaultReversibility: createReversibility.value as 'reversible' | 'costly' | 'one-way' | 'unknown',
      learningOptIn: createLearningOptIn.value,
      acceptance: {
        statements: createStatements.value.split('\n').map((s) => s.trim()).filter(Boolean),
        requiredEvidenceKinds: [],
      },
      scope: { included: splitCsv(createScopeIncluded.value), excluded: [] },
      contextPolicy: { allowedScopes: [], excludedSourceKinds: [] },
      measures: createMeasures.value.map((row) => ({
        measureId: row.measureId.trim(),
        name: row.name.trim(),
        unit: row.unit.trim(),
        operator: row.operator,
        target: Number(row.target),
        baseline: String(row.baseline ?? '').trim() === '' ? null : Number(row.baseline),
        definition: row.definition.trim(),
        sourceRef: row.sourceRef.trim(),
      })),
      clientRequestId: createClientRequestId.value,
    })
    createOpen.value = false
    // 成功后面板刷新进合同态（复用既有 load；幂等重放命中时同合同，展示一致）
    await load()
  } catch (err) {
    if (err instanceof OutcomeWorkbenchDisabledError) {
      gateOff.value = true
      return
    }
    if (err instanceof OutcomeApiError) {
      if (err.code === 'root_task_taken' || err.code === 'outcome_exists') {
        createConflict.value = true
        return
      }
      if (err.problems.length) {
        createProblems.value = err.problems
        return
      }
    }
    createErr.value = err instanceof Error ? err.message : String(err)
  } finally {
    createBusy.value = false
  }
}
</script>

<template>
  <section v-if="visible" class="outcome-section" data-testid="outcome-section">
    <template v-if="contract">
      <div class="outcome-head">
        <span class="outcome-title">业务结果 · {{ contract.title }}</span>
        <span class="outcome-status" :class="`is-${contract.status}`">{{ STATUS_LABEL[contract.status] }}</span>
        <span class="outcome-version">v{{ contract.version }}</span>
        <span class="outcome-snapshots" data-testid="outcome-snapshot-count">
          快照 {{ snapshotCount ?? '—' }} 份
        </span>
      </div>

      <div class="outcome-meta">
        <span>责任人 {{ contract.ownerPersonId }}</span>
        <span>验证 {{ contract.verificationOwnerId }}</span>
        <span>风险 {{ contract.riskTier }} / 可逆性 {{ contract.defaultReversibility }}</span>
      </div>

      <!-- 度量表：定义来自合同；最新实际值/可用性来自服务端测量读面（当前版本口径） -->
      <table class="outcome-measures" data-testid="outcome-measures">
        <thead>
          <tr><th>度量</th><th>基线</th><th>目标</th><th>最新实际值</th><th>可用性</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in contract.measures" :key="m.measureId" :data-testid="`outcome-measure-${m.measureId}`">
            <td :title="`${m.measureId} · ${m.definition}（源 ${m.sourceRef}）`">{{ m.name }}<span class="outcome-unit">（{{ m.unit }}）</span></td>
            <td>{{ m.baseline ?? '—' }}</td>
            <td>{{ OPERATOR_LABEL[m.operator] ?? m.operator }}{{ m.target }}</td>
            <td :data-testid="`outcome-actual-${m.measureId}`">
              {{ latestActualOf(m.measureId) ? (latestActualOf(m.measureId)!.actual ?? '未知') : '—' }}
            </td>
            <td>{{ latestActualOf(m.measureId)?.availability ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
      <p class="outcome-hint" data-testid="outcome-actual-hint">
        「最新实际值」按当前合同版本口径取最新测量{{ readDegraded ? '（读取不可用，仅回显本面板提交）' : '' }}；历史记录以事件账为准。
      </p>

      <!-- 结算摘要（服务端读面：最新有效结算＋历史取代链） -->
      <div v-if="shownSettlement" class="outcome-settlement" data-testid="outcome-settlement-summary">
        <div class="outcome-settlement__head">
          <span class="outcome-verdict" :class="`is-${shownSettlement.verdict}`">
            {{ VERDICT_LABEL[shownSettlement.verdict] }}
          </span>
          <span class="outcome-hint">由 {{ shownSettlement.signedBy }} 于 {{ fmtTs(shownSettlement.signedAt) }} 签署</span>
        </div>
        <p class="outcome-settlement__rationale">{{ shownSettlement.rationale }}</p>
        <p v-if="shownSettlement.verdict === 'unknown' && shownSettlement.gapNote" class="outcome-settlement__gap" data-testid="outcome-settlement-gap">
          证据缺口：{{ shownSettlement.gapNote }}（下次复审 {{ fmtTs(shownSettlement.nextReviewAt) }}）
        </p>
        <p v-if="supersededChain.length" class="outcome-hint" data-testid="outcome-settlement-superseded">
          历史结算 {{ supersededChain.length }} 笔已被取代（根任务重开），链序以事件账为准。
        </p>
      </div>
      <p v-else-if="contract.status === 'settled'" class="outcome-hint" data-testid="outcome-settled-readonly">
        合同已结算。结算读面暂不可用，裁决详情以事件账为准。
      </p>

      <!-- 同口径对照（批二 T6：effect 三态，不足两个同口径已结算结果恒 unknown） -->
      <div v-if="comparison" class="outcome-comparison" data-testid="outcome-comparison">
        <div class="outcome-comparison__head">
          <span class="outcome-effect" :class="`is-${comparison.effect}`" data-testid="outcome-comparison-effect">对照：{{ EFFECT_LABEL[comparison.effect] }}</span>
          <span class="outcome-hint">
            {{ comparison.baselineOutcomeId ? `基线 ${comparison.baselineOutcomeId}` : '无同口径基线' }} · {{ comparison.gapNote }}
          </span>
        </div>
        <table class="outcome-comparison__table">
          <thead><tr><th>度量</th><th>目标</th><th>登记基线</th><th>基线实测</th><th>本次</th></tr></thead>
          <tbody>
            <tr v-for="row in comparison.rows" :key="row.measureId">
              <td>{{ row.name }}</td>
              <td>{{ row.operator === 'gte' ? '≥' : row.operator === 'lte' ? '≤' : '=' }}{{ row.target }}</td>
              <!-- 登记基线=本合同创建时登记的起点值；基线实测=另一份同口径合同的实测。两者不同义（2026-11-28 B5） -->
              <td data-testid="outcome-comparison-declared" :title="row.declaredBaseline?.note">{{ row.declaredBaseline?.baseline ?? '未登记' }}</td>
              <td>{{ row.baseline && row.baseline.availability === 'available' ? row.baseline.actual : '未知' }}</td>
              <td data-testid="outcome-comparison-eval">{{ row.evaluation && row.evaluation.availability === 'available' ? row.evaluation.actual : '未知' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 操作面（终态只读） -->
      <div v-if="contract.status !== 'settled' && contract.status !== 'cancelled'" class="outcome-actions">
        <button
          v-if="contract.status === 'draft'"
          type="button"
          class="outcome-btn outcome-btn--primary"
          data-testid="outcome-activate"
          :disabled="!isOwner"
          @click="doTransition('active')"
        >激活</button>
        <button
          v-if="contract.status === 'active'"
          type="button"
          class="outcome-btn"
          data-testid="outcome-observe"
          :disabled="!isOwner && !isVerifier"
          title="进入观察需根任务及全部同 outcome 子任务已终结（服务端守卫）"
          @click="doTransition('observing')"
        >进入观察</button>
        <span v-if="contract.status === 'active'" class="outcome-hint">观察门槛：根任务及全部同 outcome 子任务须全部终结。</span>
        <button
          type="button"
          class="outcome-btn outcome-btn--danger"
          data-testid="outcome-cancel-toggle"
          :disabled="!isOwner"
          @click="cancelOpen = !cancelOpen"
        >取消…</button>
        <p v-if="authzNote" class="outcome-authz" data-testid="outcome-authz-note">{{ authzNote }}</p>
      </div>

      <div v-if="cancelOpen && contract.status !== 'settled' && contract.status !== 'cancelled'" class="outcome-cancel-form" data-testid="outcome-cancel-form">
        <input
          v-model="cancelReason"
          type="text"
          placeholder="取消理由（必填，随事件落账）"
          data-testid="outcome-cancel-reason"
        />
        <button
          type="button"
          class="outcome-btn outcome-btn--danger"
          data-testid="outcome-cancel-confirm"
          :disabled="!isOwner"
          @click="doCancel"
        >确认取消</button>
        <p v-if="cancelErr" class="outcome-err">{{ cancelErr }}</p>
      </div>

      <!-- 测量提交（owner 或 verifier；终态不可再测） -->
      <div v-if="contract.status !== 'settled' && contract.status !== 'cancelled'" class="outcome-measure-form">
        <button
          type="button"
          class="outcome-btn"
          data-testid="outcome-measure-toggle"
          :disabled="!isOwner && !isVerifier"
          @click="openMeasureForm"
        >＋ 提交测量</button>
        <div v-if="measureFormOpen" class="outcome-form" data-testid="outcome-measure-form">
          <select v-model="measureId" data-testid="outcome-measure-select">
            <option v-for="m in measureOptions" :key="m.measureId" :value="m.measureId">{{ m.name }}（{{ m.measureId }}）</option>
          </select>
          <input v-model="measureActual" type="number" step="any" placeholder="实际值" data-testid="outcome-measure-actual" />
          <select v-model="measureAvailability" data-testid="outcome-measure-availability">
            <option value="available">有值</option>
            <option value="pending">待补</option>
            <option value="unavailable">不可用</option>
          </select>
          <textarea
            v-model="measureEvidence"
            rows="2"
            placeholder="证据引用（每行一条，必填）"
            data-testid="outcome-measure-evidence"
          />
          <button
            type="button"
            class="outcome-btn outcome-btn--primary"
            data-testid="outcome-measure-submit"
            :disabled="measureBusy"
            @click="doSubmitMeasurement"
          >{{ measureBusy ? '提交中…' : '记录测量' }}</button>
          <p v-if="measureErr" class="outcome-err" data-testid="outcome-measure-err">{{ measureErr }}</p>
        </div>
      </div>

      <!-- 结算表单（owner only；仅观察期） -->
      <div v-if="contract.status === 'observing'" class="outcome-settle-form">
        <div class="outcome-settle-form__head">结算签署（仅结果责任人）</div>
        <template v-if="isOwner">
          <select v-model="settleVerdict" data-testid="outcome-settle-verdict">
            <option value="" disabled>请选择裁决</option>
            <option value="achieved">达成</option>
            <option value="partial">部分达成</option>
            <option value="missed">未达成</option>
            <option value="unknown">无法判定（须说明证据缺口）</option>
          </select>
          <textarea
            v-model="settleRationale"
            rows="2"
            placeholder="裁决理由（trim 后至少 20 字）"
            data-testid="outcome-settle-rationale"
          />
          <template v-if="settleVerdict === 'unknown'">
            <input
              v-model="settleGapNote"
              type="text"
              placeholder="证据缺口说明（必填：缺哪个口径/为何无法判定）"
              data-testid="outcome-settle-gapnote"
            />
            <label class="outcome-next-review">
              下次复审
              <input v-model="settleNextReview" type="datetime-local" data-testid="outcome-settle-nextreview" />
            </label>
          </template>
          <button
            type="button"
            class="outcome-btn outcome-btn--primary"
            data-testid="outcome-settle-submit"
            :disabled="settleBusy"
            @click="doSettle"
          >{{ settleBusy ? '签署中…' : '签署结算' }}</button>
          <p v-if="settleErr" class="outcome-err" data-testid="outcome-settle-err">{{ settleErr }}</p>
        </template>
        <p v-else class="outcome-authz" data-testid="outcome-settle-authz">
          仅结果责任人（owner: {{ contract.ownerPersonId }}）可签署业务裁决，验证责任人不得代签（当前登录：{{ actor || '未登录' }}）
        </p>
      </div>

      <p v-if="actionMsg" :class="['outcome-msg', actionMsg.ok ? 'is-ok' : 'is-err']" data-testid="outcome-action-msg">
        {{ actionMsg.text }}
      </p>
    </template>

    <!-- 无合同且本卡为根卡：建模入口（批四 T1 升级为可操作表单——POST / 接线） -->
    <div v-else class="outcome-model-entry" data-testid="outcome-model-hint">
      <span class="outcome-title">业务结果</span>
      <span class="outcome-hint">该根任务尚未建模业务结果（合同）。建模后此处展示状态、度量与结算。</span>
      <button
        type="button"
        class="outcome-btn"
        data-testid="outcome-create-toggle"
        @click="toggleCreateForm"
      >{{ createOpen ? '收起' : '建合同…' }}</button>
      <div v-if="createOpen" class="outcome-form outcome-create-form" data-testid="outcome-create-form">
        <label class="outcome-field">
          标题（必填）
          <input v-model="createTitle" type="text" data-testid="outcome-create-title" />
        </label>
        <label class="outcome-field">
          价值陈述（必填：这个结果为什么值得做）
          <textarea v-model="createValue" rows="2" data-testid="outcome-create-value" />
        </label>
        <label class="outcome-field">
          结果责任人（必填）
          <input v-model="createOwner" type="text" data-testid="outcome-create-owner" />
        </label>
        <label class="outcome-field">
          验证责任人（必填；高风险须与结果责任人分离）
          <input v-model="createVerifier" type="text" data-testid="outcome-create-verifier" />
        </label>
        <div class="outcome-field-row">
          <label class="outcome-field">
            风险档（必填）
            <select v-model="createRiskTier" data-testid="outcome-create-risktier">
              <option value="" disabled>请选择</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
          <label class="outcome-field">
            默认可逆性（必填）
            <select v-model="createReversibility" data-testid="outcome-create-reversibility">
              <option value="" disabled>请选择</option>
              <option value="reversible">可逆</option>
              <option value="costly">高代价</option>
              <option value="one-way">不可逆</option>
              <option value="unknown">未知</option>
            </select>
          </label>
        </div>
        <p v-if="createRiskHint" class="outcome-warn" data-testid="outcome-create-risk-hint">{{ createRiskHint }}</p>
        <p v-if="createReversibilityHint" class="outcome-warn" data-testid="outcome-create-reversibility-hint">{{ createReversibilityHint }}</p>
        <label class="outcome-field outcome-field--check">
          <input v-model="createLearningOptIn" type="checkbox" data-testid="outcome-create-learning" />
          同意学习沉淀（learningOptIn：结算事实可入学习面）
        </label>
        <label class="outcome-field">
          验收陈述（每行一条；不加度量时至少一条）
          <textarea v-model="createStatements" rows="2" data-testid="outcome-create-statements" />
        </label>
        <label class="outcome-field">
          范围内（scope.included，逗号分隔，可留空）
          <input v-model="createScopeIncluded" type="text" data-testid="outcome-create-scope-included" />
        </label>

        <div class="outcome-create-measures" data-testid="outcome-create-measures">
          <div class="outcome-create-measures__head">度量（行可增删；与验收陈述至少其一非空）</div>
          <div
            v-for="(row, i) in createMeasures"
            :key="i"
            class="outcome-create-measure-row"
            :data-testid="`outcome-create-measure-${i}`"
          >
            <input v-model="row.measureId" type="text" placeholder="measureId" data-testid="outcome-create-measure-measureid" />
            <input v-model="row.name" type="text" placeholder="名称" data-testid="outcome-create-measure-name" />
            <input v-model="row.unit" type="text" placeholder="单位" data-testid="outcome-create-measure-unit" />
            <select v-model="row.operator" data-testid="outcome-create-measure-operator" title="判定算子">
              <option value="gte">≥</option>
              <option value="lte">≤</option>
              <option value="eq">＝</option>
            </select>
            <input v-model="row.target" type="number" step="any" placeholder="目标值" data-testid="outcome-create-measure-target" />
            <input v-model="row.baseline" type="number" step="any" placeholder="基线（可空）" data-testid="outcome-create-measure-baseline" />
            <input v-model="row.definition" type="text" placeholder="口径定义" data-testid="outcome-create-measure-definition" />
            <input v-model="row.sourceRef" type="text" placeholder="数据源引用" data-testid="outcome-create-measure-sourceref" />
            <button
              type="button"
              class="outcome-btn outcome-btn--danger"
              :data-testid="`outcome-create-measure-remove-${i}`"
              @click="removeMeasureRow(i)"
            >删</button>
          </div>
          <button type="button" class="outcome-btn" data-testid="outcome-create-measure-add" @click="addMeasureRow">＋ 添加度量</button>
        </div>

        <p v-if="createErr" class="outcome-err" data-testid="outcome-create-err">{{ createErr }}</p>
        <ul v-if="createProblems.length" class="outcome-problems" data-testid="outcome-create-problems">
          <li v-for="(p, pi) in createProblems" :key="pi" :data-testid="`outcome-create-problem-${pi}`">{{ p }}</li>
        </ul>
        <p v-if="createConflict" class="outcome-err" data-testid="outcome-create-conflict">
          该根任务已存在业务结果合同（他人刚建或本页数据过期）——请刷新面板查看。
          <button type="button" class="outcome-btn" data-testid="outcome-create-conflict-refresh" @click="load()">刷新面板</button>
        </p>
        <button
          type="button"
          class="outcome-btn outcome-btn--primary"
          data-testid="outcome-create-submit"
          :disabled="createBusy"
          @click="doCreateOutcome"
        >{{ createBusy ? '创建中…' : '创建合同（草稿）' }}</button>
        <span class="outcome-hint">提交后合同为草稿态；激活才绑定根任务家族（归属证明与人员名单校验由服务端终裁）。幂等键随本次表单会话保持，失败重试不会重复建。</span>
      </div>
    </div>

    <!-- 其余读取失败：本段不可用，不炸抽屉 -->
    <p v-if="loadError" class="outcome-err" data-testid="outcome-error">业务结果面板不可用：{{ loadError }}</p>
  </section>
</template>

<style scoped lang="scss">
.outcome-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  padding: 8px 10px;
  margin: 8px 0;
}
.outcome-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.outcome-title { font-weight: 600; color: var(--text-secondary, #555); }
.outcome-status {
  font-size: 10px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; padding: 0 6px;
  &.is-draft { color: var(--text-muted, #999); }
  &.is-active { color: var(--primary-color, #18a058); border-color: var(--primary-color, #18a058); }
  &.is-observing { color: var(--warning-color, #f0a020); border-color: var(--warning-color, #f0a020); }
  &.is-settled { color: var(--success-color, #208040); border-color: var(--success-color, #208040); }
  &.is-cancelled { color: var(--error-color, #c0392b); border-color: var(--error-color, #c0392b); }
}
.outcome-version { font-family: monospace; font-size: 11px; color: var(--text-muted, #999); }
.outcome-snapshots { font-size: 11px; color: var(--text-muted, #999); margin-left: auto; }
.outcome-meta { display: flex; gap: 12px; flex-wrap: wrap; color: var(--text-muted, #999); font-size: 11px; }
.outcome-measures {
  width: 100%; border-collapse: collapse; font-size: 12px;
  th, td { border: 1px solid var(--border-color, #eee); padding: 3px 6px; text-align: left; }
  th { font-size: 11px; color: var(--text-muted, #999); font-weight: 500; }
}
.outcome-unit { color: var(--text-muted, #999); font-size: 11px; }
.outcome-hint { font-size: 11px; color: var(--text-muted, #999); margin: 0; }
.outcome-settlement {
  border: 1px solid var(--border-color, #ddd); border-radius: 6px; padding: 6px 8px;
  &__head { display: flex; align-items: center; gap: 8px; }
  &__rationale { margin: 4px 0 0; }
  &__gap { margin: 4px 0 0; color: var(--warning-color, #f0a020); }
}
.outcome-verdict { font-weight: 600; font-size: 12px; }
.outcome-actions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.outcome-btn {
  border: 1px solid var(--border-color, #ccc); background: none; border-radius: 4px;
  font-size: 11px; padding: 2px 10px; cursor: pointer;
  &:disabled { opacity: 0.45; cursor: not-allowed; }
  &--primary { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
  &--danger { border-color: var(--error-color, #c0392b); color: var(--error-color, #c0392b); }
}
.outcome-authz { font-size: 11px; color: var(--text-muted, #999); margin: 0; }
.outcome-cancel-form, .outcome-form { display: flex; flex-direction: column; gap: 6px; }
.outcome-cancel-form { flex-direction: row; align-items: center; flex-wrap: wrap; }
.outcome-form select, .outcome-form input, .outcome-form textarea,
.outcome-cancel-form input, .outcome-settle-form select, .outcome-settle-form input,
.outcome-settle-form textarea {
  border: 1px solid var(--border-color, #ccc); border-radius: 4px; padding: 4px 6px; font-size: 12px;
}
.outcome-cancel-form input { flex: 1; min-width: 160px; }
.outcome-settle-form { display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--border-color, #eee); padding-top: 8px; }
.outcome-settle-form__head { font-weight: 600; font-size: 11px; color: var(--text-secondary, #555); }
.outcome-next-review { font-size: 11px; color: var(--text-muted, #999); display: flex; align-items: center; gap: 6px; }
.outcome-err { color: var(--error-color, #c0392b); font-size: 11px; margin: 0; }
.outcome-msg {
  font-size: 11px; padding: 4px 8px; border-radius: 4px; margin: 0;
  &.is-ok { background: rgba(32, 128, 64, 0.08); color: var(--success-color, #2080f0); }
  &.is-err { background: rgba(192, 57, 43, 0.08); color: var(--error-color, #c0392b); }
}
.outcome-model-entry { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.outcome-create-form { flex-basis: 100%; border-top: 1px dashed var(--border-color, #eee); padding-top: 8px; }
.outcome-field { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text-secondary, #555); }
.outcome-field--check { flex-direction: row; align-items: center; gap: 6px; }
.outcome-field-row { display: flex; gap: 12px; flex-wrap: wrap; }
.outcome-create-measures { display: flex; flex-direction: column; gap: 6px; }
.outcome-create-measures__head { font-size: 11px; color: var(--text-secondary, #555); font-weight: 500; }
.outcome-create-measure-row { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
/* 高风险/不可逆预警：警示色（非绿色），只提示不阻断（服务端终裁） */
.outcome-warn { font-size: 11px; color: var(--warning-color, #f0a020); margin: 0; }
.outcome-problems { margin: 0; padding-left: 16px; color: var(--error-color, #c0392b); font-size: 11px; }
</style>
