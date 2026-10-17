<!-- overlay/custom/client/ia2/views/gov/GateRepairsPanel.vue -->
<!-- 签 1 关卡与流程·闸修复视图（C3 件一，R3——设计正本 §二 S10）：
     闸 FAIL 唯一出口=登记修复单并跟踪到复审 PASS——本面板即修复单台账
     （orgloop PR-5 端点），状态机按钮只渲染合法迁移（镜像服务端规则），
     界面无任何「绕过闸」动作。六闸卡（GovHealthSection 六闸半区拆分）
     随 C3 拆分正件并入本签。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  fetchGateRepairs, transitionGateRepair, legalTransitions, GATE_STATE_LABEL, GATE_FULL_NAME,
  type GateRepair, type GateRepairState,
} from '../../api/gov'

const records = ref<GateRepair[] | null>(null)
const open = ref(0)
const loadError = ref('')
const busy = ref(false)
const actionMsg = ref('')
const filter = ref<'open' | 'all'>('open')

const shown = computed(() => records.value ?? [])
const LEGAL_LABEL: Partial<Record<GateRepairState, string>> = { repair_dispatched: '标记已派修', re_review: '进入复审', pass: '复审通过', waived: '豁免（须理由）' }

async function refresh(): Promise<void> {
  busy.value = true
  loadError.value = ''
  actionMsg.value = ''
  try {
    const res = await fetchGateRepairs(filter.value)
    records.value = res.records
    open.value = res.open
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function doTransition(rec: GateRepair, to: GateRepairState): Promise<void> {
  const note = to === 'waived' ? window.prompt('豁免理由（必填，用户批准语义）：') ?? '' : `界面操作 ${to}`
  if (to === 'waived' && !note) return
  busy.value = true
  try {
    await transitionGateRepair(rec.id, to, note)
    actionMsg.value = `${rec.id} → ${GATE_STATE_LABEL[to]}（留痕在修复单 history）`
    await refresh()
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

onMounted(() => { void refresh() })
</script>

<template>
  <div class="grp" data-testid="grp-panel">
    <div class="grp__bar">
      <h4 class="grp__h">质量门修复单（待处理 {{ open }}）</h4>
      <select v-model="filter" class="grp__select" data-testid="grp-filter" @change="refresh">
        <option value="open">未结</option>
        <option value="all">全部</option>
      </select>
      <button class="grp__btn" type="button" data-testid="grp-refresh" :disabled="busy" @click="refresh">刷新</button>
    </div>
    <p class="grp__note" data-testid="grp-rule">质量门 FAIL 唯一出口＝登记修复单并跟踪到复审通过；本面板无任何绕过质量门动作（R3）。</p>

    <p v-if="loadError" class="grp__error" data-testid="grp-error">{{ loadError }}</p>
    <p v-if="actionMsg" class="grp__msg" data-testid="grp-action-msg">{{ actionMsg }}</p>
    <p v-else-if="shown.length === 0" class="grp__hint" data-testid="grp-empty">无修复单。</p>

    <div v-for="r in shown" :key="r.id" class="grp__rec" :data-testid="`grp-rec-${r.id}`">
      <div class="grp__rec-head">
        <span class="grp__gate">{{ GATE_FULL_NAME[r.gate] ?? r.gate }}</span>
        <span class="grp__state" :class="`grp__state--${r.state}`">{{ GATE_STATE_LABEL[r.state] }}</span>
        <span class="grp__ts">{{ r.ts }}</span>
      </div>
      <p class="grp__evidence">失败证据：{{ r.fail_evidence || '（未附）' }}</p>
      <p v-if="r.missing.length > 0" class="grp__missing">缺项：{{ r.missing.join('、') }}</p>
      <details v-if="r.history.length > 0" class="grp__history">
        <summary>流转留痕 {{ r.history.length }} 条</summary>
        <ul class="grp__history-list">
          <li v-for="(h, i) in r.history" :key="i">{{ h.ts }}｜{{ GATE_STATE_LABEL[h.from] }} → {{ GATE_STATE_LABEL[h.to] }}｜{{ h.note }}</li>
        </ul>
      </details>
      <div class="grp__actions">
        <button
          v-for="t in legalTransitions(r.state)"
          :key="t"
          class="grp__btn"
          type="button"
          :data-testid="`grp-tr-${r.id}-${t}`"
          :disabled="busy"
          @click="doTransition(r, t)"
        >{{ LEGAL_LABEL[t] ?? t }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.grp { display: flex; flex-direction: column; gap: 10px; }
.grp__bar { display: flex; gap: 10px; align-items: center; }
.grp__h { margin: 0; font-size: 13px; font-weight: 600; }
.grp__select {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 2px 6px;
}
.grp__btn {
  border: 1px solid var(--border-color, #e5e7eb);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.grp__note { margin: 0; font-size: 12px; color: var(--text-muted, #878c99); }
.grp__error { color: #d33; font-size: 12px; margin: 0; word-break: break-all; }
.grp__msg { color: #2e9e5b; font-size: 12px; margin: 0; }
.grp__hint { color: var(--text-muted, #878c99); font-size: 12px; margin: 0; }
.grp__rec { border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 8px 10px; }
.grp__rec-head { display: flex; gap: 10px; align-items: baseline; }
.grp__gate { font-size: 12px; font-weight: 600; }
.grp__state { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.grp__state--fail_registered { color: #d33; background: rgba(221, 51, 51, 0.12); }
.grp__state--repair_dispatched { color: #c9962e; background: rgba(201, 150, 46, 0.14); }
.grp__state--re_review { color: #7ab0e8; background: rgba(122, 176, 232, 0.14); }
.grp__state--pass { color: #2e9e5b; background: rgba(46, 158, 91, 0.12); }
.grp__state--waived { color: #b98ee0; background: rgba(150, 84, 214, 0.18); }
.grp__ts { font-size: 11px; color: var(--text-muted, #878c99); margin-left: auto; }
.grp__evidence, .grp__missing { margin: 4px 0 0; font-size: 12px; word-break: break-all; }
.grp__missing { color: #d33; }
.grp__history { font-size: 12px; summary { cursor: pointer; margin-top: 4px; } }
.grp__history-list { margin: 4px 0 0; padding-left: 16px; color: var(--text-muted, #878c99); }
.grp__actions { display: flex; gap: 6px; margin-top: 6px; }
</style>
