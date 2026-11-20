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
  fetchOutcomeByRoot,
  fetchOutcomeMeasurements,
  fetchOutcomeSettlement,
  fetchOutcomeSnapshots,
  settleOutcome,
  submitMeasurement,
  transitionOutcome,
  OutcomeWorkbenchDisabledError,
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
}>()

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿', active: '生效', observing: '观察期', settled: '已结算', cancelled: '已取消',
}
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
    const s = await settleOutcome(contract.value.outcomeId, {
      verdict: settleVerdict.value,
      rationale: settleRationale.value.trim(),
      measurementIds: [...sessionMeasurements.value.values()].map((m) => m.measurementId),
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

    <!-- 无合同且本卡为根卡：建模入口（批一面板不含建模表单，POST / 由后续任务接线） -->
    <div v-else class="outcome-model-entry" data-testid="outcome-model-hint">
      <span class="outcome-title">业务结果</span>
      <span class="outcome-hint">该根任务尚未建模业务结果（合同）。建模后此处展示状态、度量与结算。</span>
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
</style>
