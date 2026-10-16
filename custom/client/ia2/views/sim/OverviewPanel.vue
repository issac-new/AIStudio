<!-- overlay/custom/client/ia2/views/sim/OverviewPanel.vue -->
<!-- 签 1 轮次总览＝驾驶屏（B 波收尾件，R1/R3/R6/N1——设计正本 §二 S1）：
     姿态横幅（三档色带+清偿门灯）→健康行（四服务红绿点速览，同 ops 端点）→
     六闸全名行→净额双行卡（含代偿/已清并列+分型紫标）→完成步计数。
     数字全部端点实测；端点缺席/失败如实呈现。 -->
<script setup lang="ts">
import { ref } from 'vue'
import { fetchRunState, postureKind, gateRows, netCardRows, type RunStateResponse } from '../../api/overview'
import { fetchTopology } from '../../api/ops'
import { SimCompensatedTag } from '../../components/sim/index'

const run = ref('')
const loading = ref(false)
const loadError = ref('')
const state = ref<RunStateResponse | null>(null)
const topoOk = ref<number | null>(null)
const topoFail = ref<string[]>([])

const POSTURE_LABEL: Record<string, string> = { strict: 'strict（零代偿）', standard: 'standard（代偿落台账）', demo: 'demo（演示标注）' }

async function load(): Promise<void> {
  const r = run.value.trim()
  if (!r) { loadError.value = '请输入轮次目录名'; return }
  loading.value = true
  loadError.value = ''
  state.value = null
  topoOk.value = null
  topoFail.value = []
  const [st, topo] = await Promise.allSettled([fetchRunState(r), fetchTopology()])
  if (st.status === 'fulfilled') {
    state.value = st.value
  } else {
    loadError.value = (st.reason as Error).message
  }
  if (topo.status === 'fulfilled') {
    const okNames = Object.values(topo.value.services).filter(s => s.ok)
    topoOk.value = okNames.length
    topoFail.value = Object.entries(topo.value.services).filter(([, s]) => !s.ok).map(([n]) => n)
  }
  loading.value = false
}
</script>

<template>
  <div class="ov" data-testid="ov-panel">
    <div class="ov__bar">
      <input v-model="run" class="ov__input" data-testid="ov-run" placeholder="轮次目录名（如 20261015-v8-run20）" @keyup.enter="load">
      <button class="ov__btn" type="button" data-testid="ov-load" :disabled="loading" @click="load">读取</button>
    </div>
    <p v-if="loadError" class="ov__error" data-testid="ov-error">{{ loadError }}</p>
    <p v-else-if="!state" class="ov__hint">输入轮次读取驾驶屏（姿态/闸/净额一屏开车）。</p>

    <template v-if="state">
      <!-- 姿态横幅：三档色带+清偿门灯（R6） -->
      <div class="ov__banner" :class="`ov__banner--${postureKind(state.posture)}`" data-testid="ov-posture">
        <span class="ov__posture">{{ POSTURE_LABEL[postureKind(state.posture)] ?? state.posture }}</span>
        <span class="ov__clear-lamp" :class="state.ledger.open > 0 ? 'ov__clear-lamp--red' : 'ov__clear-lamp--green'" data-testid="ov-clearance-lamp">
          清偿门 {{ state.ledger.open > 0 ? `${state.ledger.open} 笔未清·拒开新轮` : '放行' }}
        </span>
      </div>

      <!-- 健康行：四服务速览（细节在签 3 运行观测） -->
      <p class="ov__health" data-testid="ov-health">
        服务：
        <template v-if="topoOk !== null">
          <span :class="topoFail.length === 0 ? 'ov__ok' : 'ov__fail'">{{ 4 - topoFail.length }}/4 在线</span>
          <span v-if="topoFail.length > 0" class="ov__fail">{{ topoFail.join('、') }} 离线（细节见运行观测签）</span>
        </template>
        <span v-else class="ov__absent">未探测（运行观测端点缺席）</span>
      </p>

      <!-- 六闸全名行（R3） -->
      <section class="ov__box">
        <h4 class="ov__h">关卡（{{ gateRows(state.gates).length }} 键）</h4>
        <p v-if="gateRows(state.gates).length === 0" class="ov__hint">state.env 无闸键（如实呈现）。</p>
        <ul v-else class="ov__gates">
          <li v-for="g in gateRows(state.gates)" :key="g.key" class="ov__gate" :data-testid="`ov-gate-${g.key}`">
            <span class="ov__gate-label">{{ g.label }}</span>
            <span class="ov__gate-key">{{ g.key }}</span>
            <span class="ov__gate-value" :class="g.value ? 'ov__ok' : 'ov__absent'">{{ g.value || '未过' }}</span>
          </li>
        </ul>
      </section>

      <!-- 净额双行卡（N1） -->
      <section class="ov__box">
        <h4 class="ov__h">净额对账（双行并列）</h4>
        <p class="ov__net" data-testid="ov-net-compensated">{{ netCardRows(state.ledger).compensated }}</p>
        <p class="ov__net" data-testid="ov-net-cleared">{{ netCardRows(state.ledger).net }}</p>
        <p class="ov__tags">
          <SimCompensatedTag v-for="t in netCardRows(state.ledger).byType" :key="t.type" :label="t.type" :count="t.count" />
          <span v-if="netCardRows(state.ledger).byType.length === 0" class="ov__hint">零代偿（台账空）。</span>
        </p>
      </section>

      <p class="ov__steps" data-testid="ov-steps">完成步标记 {{ Object.keys(state.steps).length }} 项（明细随报告同构下钻，见证据库签）。</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.ov { display: flex; flex-direction: column; gap: 12px; }
.ov__bar { display: flex; gap: 6px; }
.ov__input {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  width: 260px;
  font-family: var(--font-mono, ui-monospace, monospace);
}
.ov__btn {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.ov__error { color: #d33; font-size: 12px; margin: 0; word-break: break-all; }
.ov__hint { color: var(--text-muted, #878c99); font-size: 12px; margin: 0; }
.ov__banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  color: #fff;
}
.ov__banner--strict { background: #1d6b40; }
.ov__banner--standard { background: #9a7018; }
.ov__banner--demo { background: #6a4a9e; }
.ov__banner--unknown { background: #6b6b6b; }
.ov__clear-lamp { padding: 1px 10px; border-radius: 4px; font-size: 12px; }
.ov__clear-lamp--red { background: rgba(221, 51, 51, 0.85); }
.ov__clear-lamp--green { background: rgba(46, 158, 91, 0.85); }
.ov__health { font-size: 12px; margin: 0; }
.ov__ok { color: #2e9e5b; }
.ov__fail { color: #d33; }
.ov__absent { color: var(--text-muted, #878c99); }
.ov__box { border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; padding: 10px 12px; }
.ov__h { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.ov__gates { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.ov__gate { display: flex; gap: 10px; font-size: 12px; align-items: baseline; }
.ov__gate-label { min-width: 150px; font-weight: 600; }
.ov__gate-key { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; color: var(--text-muted, #878c99); min-width: 140px; }
.ov__gate-value { font-family: var(--font-mono, ui-monospace, monospace); font-size: 11px; }
.ov__net { font-size: 12px; margin: 0 0 2px; }
.ov__tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 0; }
.ov__steps { font-size: 12px; color: var(--text-muted, #878c99); margin: 0; }
</style>
