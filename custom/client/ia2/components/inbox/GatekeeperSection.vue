<!-- overlay/custom/client/ia2/components/inbox/GatekeeperSection.vue -->
<!-- S7 审批待办（B3 工单，R5/R6——设计正本 §二 S7）：双队列=人工介入请求（14 介入点）
     +清偿门审批（resolve 挂 PR 锚/waive 强制理由）+收尾三步指令模板。
     数据消费 orgloop X2 端点；源缺席=介入点灰列「状态未知」不猜；动作后刷新两队列。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchInterventionsPending,
  fetchClearanceLedger,
  fetchHumanGateRequests,
  decideHumanGate,
  resolveClearance,
  waiveClearance,
  groupClearanceTargets,
  buildClosingOrder,
  type InterventionsView,
  type ClearanceLedgerView,
  type HumanGateRequestView,
} from '../../api/gatekeeper'
import { SimInterventionCard } from '../sim/index'
import { compensationLabel } from '../../compensation-labels'
import { useRouter } from 'vue-router'

const router = useRouter()

/**
 * 介入点 → 真实裁决面派发表（2026-10-22 走查批：批准/打回原绑空函数=假按钮）。
 * 单一事实源在各源系统（关卡判词/UAT 台账/清偿门/编制表），驾驶舱只做导流，
 * 不在本地另造第二份决策真相——按钮语义=「去对应面执行批准或打回」。
 */
const DECIDE_ROUTES: Record<string, string> = {
  'g1_frozen': '/app/stage/reqs?tab=g1',
  'g2_arch_pass': '/app/stage/design?tab=g2',
  'g5_human': '/app/stage/accept?tab=g5',
  'uat-verdict': '/app/stage/accept?tab=uat',
  'clearance-waive': '#clearance',
  'admin-roster': '/app/stage/setup?tab=accounts',
  'req-scope': '/app/stage/reqs?tab=reqs',
  'dispatch': '/app/stage/design?tab=tasks',
  'triage': '/app/board',
  'defect-verdict': '/app/stage/accept?tab=uat',
  'audit-sign': '/app/stage/govern?tab=audit',
  'retro-decide': '/app/stage/govern?tab=clearance',
  'breaker-override': '/app/sim/supervision',
  'posture-approve': '/app/stage/govern?tab=posture',
}

function goDecide(sourceKey?: string): void {
  const target = sourceKey ? DECIDE_ROUTES[sourceKey] : undefined
  if (!target) { actionError.value = '该介入点未登记裁决面——请在对应系统处理'; return }
  if (target.startsWith('#')) {
    document.getElementById(target.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  void router.push(target)
}

const interventions = ref<InterventionsView | null>(null)
const clearance = ref<ClearanceLedgerView | null>(null)
// 部分失败隔离（2026-10-17 内容与交互批）：介入队列与遗留项台账各自取数——
// 台账 fail-closed 503 时，人工介入队列仍要能用，不能一起陪葬。
const interventionsError = ref('')
const clearanceError = ref('')
const rawClearanceError = ref('')
const actionError = ref('')
const busy = ref(false)
// HumanGate 前置批准队列（2026-10-22 P0 接线批；与介入队列/台账三路隔离取数）
const humanGate = ref<HumanGateRequestView[]>([])
const humanGateError = ref('')
const humanGatePending = computed(() => humanGate.value.filter(r => r.status === 'pending'))

/** 补偿目标代号 → 人话（2026-10-22 信息降噪批）：主文案说人话供决策，
 *  原代号进 title 供排查反查。未知代号原样显示不猜。 */
const CLEARANCE_TARGET_LABEL: Record<string, string> = {
  'PR-1': '锁文件', 'PR-2': '自动批准', 'PR-3': '催办', 'PR-4': '卡片补录/代办',
  'PR-5': '环形依赖', 'PR-6': '挂账先例', 'PR-7': '预设派发',
}
function targetLabel(target: string): string {
  return CLEARANCE_TARGET_LABEL[target] ?? target
}

/** 台账技术错误人话化：正文给人能懂的原因与下一步，原始错误进 title 供排查。 */
function humanizeLedgerError(message: string): string {
  return /ORGLOOP_LEDGER_TSV/.test(message)
    ? '还没有遗留事项台账（开始一次运行后生成）'
    : message
}

const pendingPoints = computed(() => (interventions.value?.points ?? []).filter(p => p.pending === true))
const unknownPoints = computed(() => (interventions.value?.points ?? []).filter(p => p.pending === null))
const clearanceTargets = computed(() => (Array.isArray(clearance.value?.rows) ? groupClearanceTargets(clearance.value) : []))

// 清偿操作输入（每目标一组，键=target）
const resolveInput = ref<Record<string, string>>({})
const waiveInput = ref<Record<string, string>>({})

// 收尾令模板
const closingCard = ref('')
const closingCommit = ref('')
const closingText = computed(() =>
  closingCard.value.trim() ? buildClosingOrder(closingCard.value.trim(), closingCommit.value.trim() || undefined) : ''
)
const copied = ref(false)

async function refresh(): Promise<void> {
  busy.value = true
  interventionsError.value = ''
  clearanceError.value = ''
  rawClearanceError.value = ''
  actionError.value = ''
  const [iv, cl, hg] = await Promise.allSettled([fetchInterventionsPending(), fetchClearanceLedger(), fetchHumanGateRequests()])
  if (iv.status === 'fulfilled') interventions.value = iv.value
  else { interventions.value = null; interventionsError.value = (iv.reason as Error).message }
  if (cl.status === 'fulfilled') clearance.value = cl.value
  else {
    clearance.value = null
    rawClearanceError.value = (cl.reason as Error).message
    clearanceError.value = humanizeLedgerError(rawClearanceError.value)
  }
  if (hg.status === 'fulfilled') { humanGate.value = hg.value; humanGateError.value = '' }
  else { humanGate.value = []; humanGateError.value = (hg.reason as Error).message }
  busy.value = false
}

/** HumanGate 前置批准裁决（2026-10-22 P0 接线批）：批准/驳回直调服务端，
 *  裁决落库留痕（decidedBy/decidedAt），失败就地报错供重试。 */
async function decideGate(id: string, decision: 'approve' | 'reject'): Promise<void> {
  busy.value = true
  actionError.value = ''
  try {
    await decideHumanGate(id, decision)
    await refresh()
  } catch (e) {
    actionError.value = `前置批准${decision === 'approve' ? '批准' : '驳回'}失败：${(e as Error).message}`
  } finally {
    busy.value = false
  }
}

async function doResolve(target: string): Promise<void> {
  const pr = (resolveInput.value[target] ?? '').trim()
  if (!pr) return
  busy.value = true
  clearanceError.value = ''
  rawClearanceError.value = ''
  try {
    clearance.value = await resolveClearance(target, pr)
    delete resolveInput.value[target]
  } catch (e) {
    rawClearanceError.value = (e as Error).message
    clearanceError.value = humanizeLedgerError(rawClearanceError.value)
  } finally {
    busy.value = false
  }
}

async function doWaive(target: string): Promise<void> {
  const reason = (waiveInput.value[target] ?? '').trim()
  if (!reason) return
  busy.value = true
  clearanceError.value = ''
  rawClearanceError.value = ''
  try {
    clearance.value = await waiveClearance(target, reason)
    delete waiveInput.value[target]
  } catch (e) {
    rawClearanceError.value = (e as Error).message
    clearanceError.value = humanizeLedgerError(rawClearanceError.value)
  } finally {
    busy.value = false
  }
}

async function copyClosing(): Promise<void> {
  if (!closingText.value) return
  try {
    await navigator.clipboard.writeText(closingText.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    actionError.value = '剪贴板不可用——请手动复制文本框内容'
  }
}

onMounted(() => { void refresh() })
</script>

<template>
  <section class="gk" data-testid="gk-section">
    <div class="gk__head">
      <h3 class="gk__title">审批待办</h3>
      <span
        v-for="(st, name) in interventions?.sources ?? {}"
        :key="name"
        class="gk__src"
        :class="{ 'gk__src--absent': st === 'absent' }"
        :data-testid="`gk-src-${name}`"
      >{{ name }}{{ st === 'ok' ? '✓' : '（缺席）' }}</span>
      <button class="gk__refresh" type="button" data-testid="gk-refresh" :disabled="busy" @click="refresh">刷新</button>
    </div>

    <p v-if="interventionsError" class="gk__error" data-testid="gk-error">{{ interventionsError }}</p>
    <p v-else-if="!interventions" class="gk__hint">读取中……</p>

    <div class="gk__queue">
      <h4 class="gk__queue-title">等人决定（介入点 {{ pendingPoints.length }}）</h4>
      <p v-if="interventions && pendingPoints.length === 0" class="gk__hint" data-testid="gk-interv-empty">
        无待办介入点——「等人决定的事」当前为零。
      </p>
      <ul class="gk__cards">
        <li v-for="p in pendingPoints" :key="p.id" class="gk__card">
          <SimInterventionCard :point="p" @approve="goDecide(p.sourceKey)" @reject="goDecide(p.sourceKey)" />
        </li>
      </ul>
      <p v-if="interventions && pendingPoints.length > 0" class="gk__hint">
        点「批准 / 打回」跳到该介入点的真实裁决面执行——裁决记录落在源系统，这里不另立台账。
      </p>
      <details v-if="unknownPoints.length > 0" class="gk__unknown" data-testid="gk-unknown">
        <summary>源缺席·状态未知 {{ unknownPoints.length }} 项</summary>
        <ul>
          <li v-for="p in unknownPoints" :key="p.id" class="gk__unknown-item">{{ p.title }}——数据源未接，待接线后计数</li>
        </ul>
      </details>
    </div>

    <!-- HumanGate 前置批准（2026-10-22 P0 接线批）：发布前须人拍板的批准单，
         裁决直调服务端落库留痕（区别于上方介入卡的导流语义）。 -->
    <div class="gk__queue">
      <h4 class="gk__queue-title">前置批准（HumanGate，待批 {{ humanGatePending.length }}）</h4>
      <p v-if="humanGateError" class="gk__error" data-testid="gk-hgate-error">{{ humanGateError }}</p>
      <p v-else-if="humanGatePending.length === 0" class="gk__hint" data-testid="gk-hgate-empty">
        无待批的前置批准单。
      </p>
      <ul v-else class="gk__cards">
        <li v-for="r in humanGatePending" :key="r.id" class="gk__card" :data-testid="`gk-hgate-${r.id}`">
          <div class="gk__hgate">
            <div class="gk__hgate-main">
              <div class="gk__hgate-title">{{ r.title }}</div>
              <div class="gk__hgate-meta">
                由 {{ r.requestedBy }} 提出 · 运行 {{ r.runId }} · 卡 {{ r.cardId }}
                <template v-if="r.detail">· {{ r.detail }}</template>
              </div>
            </div>
            <div class="gk__hgate-actions">
              <button class="gk__btn gk__btn--approve" type="button" :disabled="busy"
                data-testid="gk-hgate-approve" @click="decideGate(r.id, 'approve')">批准</button>
              <button class="gk__btn gk__btn--reject" type="button" :disabled="busy"
                data-testid="gk-hgate-reject" @click="decideGate(r.id, 'reject')">驳回</button>
            </div>
          </div>
        </li>
      </ul>
      <p v-if="actionError" class="gk__error" data-testid="gk-action-error">{{ actionError }}</p>
    </div>

    <div id="clearance" class="gk__queue">
      <h4 class="gk__queue-title">
        遗留事项清算（未清 {{ clearance?.open ?? '—' }}<template v-if="clearance">{{ clearance.pass ? '，放行' : '，拒绝启动新运行' }}</template>）
      </h4>
      <p v-if="clearanceError" class="gk__error" data-testid="gk-clearance-error" :title="rawClearanceError">{{ clearanceError }}</p>
      <p v-else-if="clearanceTargets.length === 0" class="gk__hint" data-testid="gk-clear-empty">台账无未清项。</p>
      <div v-for="g in clearanceTargets" :key="g.target" class="gk__cl" :data-testid="`gk-cl-${g.target}`">
        <div class="gk__cl-head">
          <span class="gk__cl-target" :title="g.target">{{ targetLabel(g.target) }}</span>
          <span class="gk__cl-meta">{{ g.openCount }} 项未清（{{ g.types.map(compensationLabel).join('、') }}）</span>
        </div>
        <div class="gk__cl-actions">
          <input
            v-model="resolveInput[g.target]"
            class="gk__input"
            :data-testid="`gk-resolve-pr-${g.target}`"
            placeholder="根治 PR 锚（必填）"
          >
          <button
            class="gk__btn"
            type="button"
            :data-testid="`gk-resolve-${g.target}`"
            :disabled="busy || !(resolveInput[g.target] ?? '').trim()"
            @click="doResolve(g.target)"
          >登记根治</button>
          <input
            v-model="waiveInput[g.target]"
            class="gk__input gk__input--reason"
            :data-testid="`gk-waive-reason-${g.target}`"
            placeholder="豁免批准理由（必填）"
          >
          <button
            class="gk__btn"
            type="button"
            :data-testid="`gk-waive-${g.target}`"
            :disabled="busy || !(waiveInput[g.target] ?? '').trim()"
            @click="doWaive(g.target)"
          >批准豁免</button>
        </div>
      </div>
    </div>

    <div class="gk__tpl">
      <h4 class="gk__queue-title">收尾指令模板</h4>
      <div class="gk__tpl-row">
        <input v-model="closingCard" class="gk__input" data-testid="gk-closing-card" placeholder="看板卡号（如 t_rel_001）">
        <input v-model="closingCommit" class="gk__input" data-testid="gk-closing-commit" placeholder="提交号（可选）">
        <button
          class="gk__btn"
          type="button"
          data-testid="gk-closing-copy"
          :disabled="!closingText"
          @click="copyClosing"
        >{{ copied ? '已复制' : '复制指令' }}</button>
      </div>
      <pre v-if="closingText" class="gk__tpl-text" data-testid="gk-closing-text">{{ closingText }}</pre>
      <p v-if="actionError" class="gk__error" data-testid="gk-action-error">{{ actionError }}</p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.gk {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.gk__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gk__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.gk__src {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(46, 158, 91, 0.12);
  color: var(--ia-fresh);
  &--absent {
    background: rgba(127, 127, 127, 0.14);
    color: var(--text-muted);
  }
}
.gk__refresh {
  margin-left: auto;
  border: 1px solid var(--border-color);
  background: transparent;
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
.gk__error { color: var(--ia-fail); font-size: 12px; margin: 0; }
.gk__hint { color: var(--text-muted); font-size: 12px; margin: 0; }
.gk__queue-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}
.gk__cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.gk__card { margin: 0; }
.gk__unknown {
  font-size: 12px;
  color: var(--text-muted);
  summary { cursor: pointer; }
}
.gk__unknown-item { margin: 2px 0; }
.gk__cl {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 10px;
  & + & { margin-top: 6px; }
}
.gk__cl-head {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin-bottom: 6px;
}
.gk__cl-target { font-family: ui-monospace, monospace; font-size: 12px; font-weight: 600; }
.gk__cl-meta { font-size: 11px; color: var(--text-muted); }
.gk__cl-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.gk__input {
  border: 1px solid var(--ia-border-control, var(--border-color));
  border-radius: 6px;
  padding: 5px 10px;
  font-size: 12.5px;
  width: 180px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
  &::placeholder { color: var(--text-muted); }
  &:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 1px; }
  &--reason { flex: 1; min-width: 200px; }
}
.gk__btn {
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: inherit;
  border-radius: 6px;
  padding: 5px 12px;
  font-family: inherit;
  font-size: 12.5px;
  cursor: pointer;
  &:hover:not(:disabled) { background: var(--bg-secondary); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.gk__tpl-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.gk__tpl-text {
  margin: 6px 0 0;
  white-space: pre-wrap;
  font-size: 12px;
  background: rgba(127, 127, 127, 0.08);
  border-radius: 6px;
  padding: 8px 10px;
}
.gk__hgate {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid rgba(127, 127, 127, 0.3);
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.06);
}
.gk__hgate-main { flex: 1; min-width: 0; }
.gk__hgate-title { font-size: 13px; font-weight: 600; }
.gk__hgate-meta { font-size: 11px; opacity: 0.75; margin-top: 2px; }
.gk__hgate-actions { display: flex; gap: 6px; flex: none; }
.gk__btn {
  border: 1px solid rgba(127, 127, 127, 0.4);
  border-radius: 6px;
  background: transparent;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}
.gk__btn:disabled { opacity: 0.5; cursor: default; }
.gk__btn--approve { border-color: rgba(46, 125, 50, 0.5); color: var(--success); }
.gk__btn--reject { border-color: rgba(183, 28, 28, 0.5); color: var(--danger); }
</style>
