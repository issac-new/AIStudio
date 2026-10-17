<!-- overlay/custom/client/ia2/views/gov/ClearancePanel.vue -->
<!-- 签 3 清偿门（C2 工单，R6——设计正本 §二 S11）：台账全量表（三态徽）+
     按目标 resolve（挂 PR 锚）/waive（强制理由）审批 + 开轮放行灯
     （灯值与 check-clearance 同源——orgloop X2 端点单一消费面）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchClearanceLedger, resolveClearance, waiveClearance, groupClearanceTargets,
  type ClearanceLedgerView,
} from '../../api/gatekeeper'

const ledger = ref<ClearanceLedgerView | null>(null)
const loadError = ref('')
const busy = ref(false)
const actionMsg = ref('')

const resolveInput = ref<Record<string, string>>({})
const waiveInput = ref<Record<string, string>>({})

const targets = computed(() => (ledger.value ? groupClearanceTargets(ledger.value) : []))
const rows = computed(() => (ledger.value ? [...ledger.value.rows].reverse().slice(0, 100) : []))

async function refresh(): Promise<void> {
  busy.value = true
  loadError.value = ''
  try {
    ledger.value = await fetchClearanceLedger()
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function act(kind: 'resolve' | 'waive', target: string): Promise<void> {
  busy.value = true
  actionMsg.value = ''
  try {
    if (kind === 'resolve') {
      ledger.value = await resolveClearance(target, (resolveInput.value[target] ?? '').trim())
      delete resolveInput.value[target]
    } else {
      ledger.value = await waiveClearance(target, (waiveInput.value[target] ?? '').trim())
      delete waiveInput.value[target]
    }
    actionMsg.value = `已${kind === 'resolve' ? '登记根治' : '豁免'} ${target}（留痕在 orgloop 处置记录）`
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

const STATE_LABEL: Record<string, string> = { open: '未清', waived: '豁免', resolved: '已清' }

onMounted(() => { void refresh() })
</script>

<template>
  <div class="clr" data-testid="clr-panel">
    <div class="clr__bar">
      <h4 class="clr__h">遗留项清算</h4>
      <span
        v-if="ledger"
        class="clr__lamp"
        :class="ledger.pass ? 'clr__lamp--green' : 'clr__lamp--red'"
        data-testid="clr-lamp"
      >{{ ledger.pass ? '放行（零未清）' : `${ledger.open} 笔未清·拒开新轮` }}</span>
      <button class="clr__btn" type="button" data-testid="clr-refresh" :disabled="busy" @click="refresh">刷新</button>
    </div>

    <p v-if="loadError" class="clr__error" data-testid="clr-error">{{ loadError }}</p>
    <p v-if="actionMsg" class="clr__msg" data-testid="clr-action-msg">{{ actionMsg }}</p>
    <p v-else-if="!ledger" class="clr__hint">读取中……</p>

    <template v-if="ledger">
      <section class="clr__box">
        <h5 class="clr__h2">按缺陷目标审批（resolve 挂 PR 锚；waive 强制理由）</h5>
        <p v-if="targets.length === 0" class="clr__hint" data-testid="clr-targets-empty">台账无未清项。</p>
        <div v-for="g in targets" :key="g.target" class="clr__target" :data-testid="`clr-target-${g.target}`">
          <div class="clr__target-head">
            <span class="clr__target-name">{{ g.target }}</span>
            <span class="clr__target-meta">{{ g.openCount }} 笔未清（{{ g.types.join('、') }}）</span>
          </div>
          <div class="clr__target-actions">
            <input v-model="resolveInput[g.target]" class="clr__input" :data-testid="`clr-resolve-pr-${g.target}`" placeholder="PR 锚（必填）">
            <button class="clr__btn" type="button" :data-testid="`clr-resolve-${g.target}`" :disabled="busy || !(resolveInput[g.target] ?? '').trim()" @click="act('resolve', g.target)">resolve</button>
            <input v-model="waiveInput[g.target]" class="clr__input clr__input--reason" :data-testid="`clr-waive-reason-${g.target}`" placeholder="批准理由（必填）">
            <button class="clr__btn" type="button" :data-testid="`clr-waive-${g.target}`" :disabled="busy || !(waiveInput[g.target] ?? '').trim()" @click="act('waive', g.target)">waive</button>
          </div>
        </div>
      </section>

      <section class="clr__box">
        <h5 class="clr__h2">台账全量（{{ ledger.rows.length }} 行，倒序前 100）</h5>
        <table class="clr__table" data-testid="clr-table">
          <thead><tr><th>类型</th><th>缺陷</th><th>时刻</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td>{{ r.type }}</td>
              <td>{{ r.defect || '—' }}</td>
              <td class="clr__mono">{{ r.ts }}</td>
              <td><span class="clr__state" :class="`clr__state--${r.state}`">{{ STATE_LABEL[r.state] }}</span></td>
            </tr>
          </tbody>
        </table>
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.clr { display: flex; flex-direction: column; gap: 12px; }
.clr__bar { display: flex; gap: 10px; align-items: center; }
.clr__h { margin: 0; font-size: 13px; font-weight: 600; }
.clr__h2 { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.clr__lamp { padding: 1px 10px; border-radius: 4px; font-size: 12px; color: #fff; }
.clr__lamp--red { background: #b33; }
.clr__lamp--green { background: #2e9e5b; }
.clr__btn {
  border: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}
.clr__error { color: #d33; font-size: 12px; margin: 0; word-break: break-all; }
.clr__msg { color: #2e9e5b; font-size: 12px; margin: 0; }
.clr__hint { color: var(--text-muted, #878c99); font-size: 12px; margin: 0; }
.clr__box { border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 10px 12px; }
.clr__target { padding: 6px 0; & + & { border-top: 1px dashed var(--border-color, #e5e7eb); } }
.clr__target-head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.clr__target-name { font-family: var(--font-mono, ui-monospace, monospace); font-size: 12px; font-weight: 600; }
.clr__target-meta { font-size: 11px; color: var(--text-muted, #878c99); }
.clr__target-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.clr__input {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  width: 170px;
  background: transparent;
  color: inherit;
  &--reason { flex: 1; min-width: 180px; }
}
.clr__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.clr__table th, .clr__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.clr__mono { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; }
.clr__state { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.clr__state--open { color: #d33; background: rgba(221, 51, 51, 0.12); }
.clr__state--waived { color: #b98ee0; background: rgba(150, 84, 214, 0.18); }
.clr__state--resolved { color: #2e9e5b; background: rgba(46, 158, 91, 0.12); }
</style>
