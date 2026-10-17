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
import { useRouter } from 'vue-router'
import UiEmptyState from '../../../ui/UiEmptyState.vue'

const records = ref<GateRepair[] | null>(null)
const open = ref(0)
const loadError = ref('')
const router = useRouter()

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

// 末端可用性批（2026-10-17）：豁免理由从 window.prompt 原生弹窗改行内表单——
// 原生弹窗与站内表单风格断裂且无必填校验提示位。
const waiveTarget = ref<GateRepair | null>(null)
const waiveNote = ref('')

function askWaive(rec: GateRepair): void {
  waiveTarget.value = rec
  waiveNote.value = ''
}

function confirmWaive(): void {
  const rec = waiveTarget.value
  if (!rec) return
  void doTransition(rec, 'waived', waiveNote.value).then(() => { waiveTarget.value = null })
}

async function doTransition(rec: GateRepair, to: GateRepairState, noteOverride?: string): Promise<void> {
  const note = to === 'waived' ? (noteOverride ?? '').trim() : `界面操作 ${to}`
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
    <UiEmptyState v-else-if="shown.length === 0" title="无修复单——当前没有未结的质量门修复事项。" hint="质量门 FAIL 会自动登记修复单到此处；想看六闸整体状态去仿真中心·运行总览。" data-testid="grp-empty">
      <template #action>
        <button class="grp__btn" type="button" data-testid="grp-empty-goto-overview" @click="router.push({ name: 'ia2.sim' })">去运行总览看六闸 →</button>
      </template>
    </UiEmptyState>

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
          @click="t === 'waived' ? askWaive(r) : doTransition(r, t)"
        >{{ LEGAL_LABEL[t] ?? t }}</button>
      </div>
      <div v-if="waiveTarget?.id === r.id" class="grp__waive" :data-testid="`grp-waive-${r.id}`">
        <input
          v-model="waiveNote"
          class="grp__waive-input"
          type="text"
          placeholder="豁免理由（必填，用户批准语义；留痕进修复单 history）"
          :data-testid="`grp-waive-input-${r.id}`"
          @keyup.enter="confirmWaive"
        >
        <button class="grp__btn" type="button" :data-testid="`grp-waive-ok-${r.id}`" :disabled="busy || !waiveNote.trim()" @click="confirmWaive">确认豁免</button>
        <button class="grp__btn" type="button" :data-testid="`grp-waive-cancel-${r.id}`" @click="waiveTarget = null">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.grp { display: flex; flex-direction: column; gap: 10px; }
.grp__bar { display: flex; gap: 10px; align-items: center; }
.grp__h { margin: 0; font-size: 13px; font-weight: 600; }
.grp__select {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 2px 6px;
}
.grp__btn {
  border: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.grp__note { margin: 0; font-size: 12px; color: var(--text-muted); }
.grp__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.grp__msg { color: var(--ia-fresh); font-size: 12px; margin: 0; }
.grp__hint { color: var(--text-muted); font-size: 12px; margin: 0; }
.grp__rec { border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; }
.grp__rec-head { display: flex; gap: 10px; align-items: baseline; }
.grp__gate { font-size: 12px; font-weight: 600; }
.grp__state { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.grp__state--fail_registered { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); }
.grp__state--repair_dispatched { color: var(--ia-stale); background: rgba(201, 150, 46, 0.14); }
.grp__state--re_review { color: var(--accent-info); background: rgba(122, 176, 232, 0.14); }
.grp__state--pass { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
.grp__state--waived { color: var(--ia-compensated); background: rgba(150, 84, 214, 0.18); }
.grp__ts { font-size: 11px; color: var(--text-muted); margin-left: auto; }
.grp__evidence, .grp__missing { margin: 4px 0 0; font-size: 12px; word-break: break-all; }
.grp__missing { color: var(--ia-fail); }
.grp__history { font-size: 12px; summary { cursor: pointer; margin-top: 4px; } }
.grp__history-list { margin: 4px 0 0; padding-left: 16px; color: var(--text-muted); }
.grp__waive { display: flex; gap: 6px; margin-top: 6px; align-items: center; }
.grp__waive-input { flex: 1; min-width: 0; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-secondary); color: var(--text-primary); font-size: 12px; }
.grp__actions { display: flex; gap: 6px; margin-top: 6px; }
</style>
