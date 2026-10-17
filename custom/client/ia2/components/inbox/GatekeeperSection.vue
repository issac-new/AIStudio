<!-- overlay/custom/client/ia2/components/inbox/GatekeeperSection.vue -->
<!-- S7 审批待办（B3 工单，R5/R6——设计正本 §二 S7）：双队列=人工介入请求（14 介入点）
     +清偿门审批（resolve 挂 PR 锚/waive 强制理由）+收尾三步指令模板。
     数据消费 orgloop X2 端点；源缺席=介入点灰列「状态未知」不猜；动作后刷新两队列。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchInterventionsPending,
  fetchClearanceLedger,
  resolveClearance,
  waiveClearance,
  groupClearanceTargets,
  buildClosingOrder,
  type InterventionsView,
  type ClearanceLedgerView,
} from '../../api/gatekeeper'
import { SimInterventionCard } from '../sim/index'

const interventions = ref<InterventionsView | null>(null)
const clearance = ref<ClearanceLedgerView | null>(null)
const loadError = ref('')
const busy = ref(false)

const pendingPoints = computed(() => (interventions.value?.points ?? []).filter(p => p.pending === true))
const unknownPoints = computed(() => (interventions.value?.points ?? []).filter(p => p.pending === null))
const clearanceTargets = computed(() => (clearance.value ? groupClearanceTargets(clearance.value) : []))

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
  loadError.value = ''
  try {
    const [iv, cl] = await Promise.all([fetchInterventionsPending(), fetchClearanceLedger()])
    interventions.value = iv
    clearance.value = cl
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function doResolve(target: string): Promise<void> {
  const pr = (resolveInput.value[target] ?? '').trim()
  if (!pr) return
  busy.value = true
  try {
    clearance.value = await resolveClearance(target, pr)
    delete resolveInput.value[target]
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function doWaive(target: string): Promise<void> {
  const reason = (waiveInput.value[target] ?? '').trim()
  if (!reason) return
  busy.value = true
  try {
    clearance.value = await waiveClearance(target, reason)
    delete waiveInput.value[target]
  } catch (e) {
    loadError.value = (e as Error).message
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
    loadError.value = '剪贴板不可用——请手动复制文本框内容'
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

    <p v-if="loadError" class="gk__error" data-testid="gk-error">{{ loadError }}</p>
    <p v-else-if="!interventions" class="gk__hint">读取中……</p>

    <div class="gk__queue">
      <h4 class="gk__queue-title">等人决定（介入点 {{ pendingPoints.length }}）</h4>
      <p v-if="interventions && pendingPoints.length === 0" class="gk__hint" data-testid="gk-interv-empty">
        无待办介入点——「等人决定的事」当前为零。
      </p>
      <ul class="gk__cards">
        <li v-for="p in pendingPoints" :key="p.id" class="gk__card">
          <SimInterventionCard :point="p" @approve="() => {}" @reject="() => {}" />
        </li>
      </ul>
      <details v-if="unknownPoints.length > 0" class="gk__unknown" data-testid="gk-unknown">
        <summary>源缺席·状态未知 {{ unknownPoints.length }} 项</summary>
        <ul>
          <li v-for="p in unknownPoints" :key="p.id" class="gk__unknown-item">{{ p.title }}——数据源未接，待接线后计数</li>
        </ul>
      </details>
    </div>

    <div class="gk__queue">
      <h4 class="gk__queue-title">
        清偿门（未清 {{ clearance?.open ?? '—' }}<template v-if="clearance">{{ clearance.pass ? '，放行' : '，拒开新轮' }}</template>）
      </h4>
      <p v-if="clearanceTargets.length === 0" class="gk__hint" data-testid="gk-clear-empty">台账无未清项。</p>
      <div v-for="g in clearanceTargets" :key="g.target" class="gk__cl" :data-testid="`gk-cl-${g.target}`">
        <div class="gk__cl-head">
          <span class="gk__cl-target">{{ g.target }}</span>
          <span class="gk__cl-meta">{{ g.openCount }} 笔未清（{{ g.types.join('、') }}）</span>
        </div>
        <div class="gk__cl-actions">
          <input
            v-model="resolveInput[g.target]"
            class="gk__input"
            :data-testid="`gk-resolve-pr-${g.target}`"
            placeholder="resolve 的 PR 锚（必填）"
          >
          <button
            class="gk__btn"
            type="button"
            :data-testid="`gk-resolve-${g.target}`"
            :disabled="busy || !(resolveInput[g.target] ?? '').trim()"
            @click="doResolve(g.target)"
          >resolve</button>
          <input
            v-model="waiveInput[g.target]"
            class="gk__input gk__input--reason"
            :data-testid="`gk-waive-reason-${g.target}`"
            placeholder="waive 的批准理由（必填）"
          >
          <button
            class="gk__btn"
            type="button"
            :data-testid="`gk-waive-${g.target}`"
            :disabled="busy || !(waiveInput[g.target] ?? '').trim()"
            @click="doWaive(g.target)"
          >waive</button>
        </div>
      </div>
    </div>

    <div class="gk__tpl">
      <h4 class="gk__queue-title">收尾三步指令模板</h4>
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
  color: #2e9e5b;
  &--absent {
    background: rgba(127, 127, 127, 0.14);
    color: #999;
  }
}
.gk__refresh {
  margin-left: auto;
  border: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
.gk__error { color: #d33; font-size: 12px; margin: 0; }
.gk__hint { color: var(--text-muted, #878c99); font-size: 12px; margin: 0; }
.gk__queue-title {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, inherit);
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
  color: var(--text-muted, #878c99);
  summary { cursor: pointer; }
}
.gk__unknown-item { margin: 2px 0; }
.gk__cl {
  border: 1px solid var(--border-color, #e5e7eb);
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
.gk__cl-meta { font-size: 11px; color: var(--text-muted, #878c99); }
.gk__cl-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.gk__input {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  width: 180px;
  &--reason { flex: 1; min-width: 200px; }
}
.gk__btn {
  border: 1px solid #555;
  background: transparent;
  color: inherit;
  border-radius: 4px;
  padding: 3px 12px;
  font-size: 12px;
  cursor: pointer;
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
</style>
