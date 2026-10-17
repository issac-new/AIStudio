<!-- overlay/custom/client/ia2/views/gov/GovIssuesPanel.vue -->
<!-- 签 4 问题单对账（C6，R3/R14——设计正本 §二 S10）：ISSUE 台账全量+DISP 联结
     处置态+100% 处置进度条（stats 与服务端同值）。v1 范围=轮次 issues.log
     （方案 §2.6-3 单一事实源）；组织级跨轮账本属 harness 侧数据，如实注明。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { fetchIssues, joinIssueDisposal, type IssueLine } from '../../api/gov'

const run = ref('')
const loading = ref(false)
const loadError = ref('')
const lines = ref<IssueLine[] | null>(null)
const rate = ref<number | null>(null)
const disposedCount = ref(0)
const openCount = ref(0)
const source = ref('')

const rows = computed(() => (lines.value ? joinIssueDisposal(lines.value) : []))

async function load(): Promise<void> {
  const r = run.value.trim()
  if (!r) { loadError.value = '请输入轮次目录名'; return }
  loading.value = true
  loadError.value = ''
  lines.value = null
  try {
    const res = await fetchIssues(r)
    lines.value = res.lines
    rate.value = res.stats.rate
    disposedCount.value = res.stats.disposed
    openCount.value = res.stats.open
    source.value = res.source
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="gis" data-testid="gis-panel">
    <div class="gis__bar">
      <input v-model="run" class="gis__input" data-testid="gis-run" placeholder="轮次目录名（如 20261015-v8-run20）" @keyup.enter="load">
      <button class="gis__btn" type="button" data-testid="gis-load" :disabled="loading" @click="load">读取</button>
    </div>

    <p v-if="loadError" class="gis__error" data-testid="gis-error">{{ loadError }}</p>
    <p v-else-if="!lines" class="gis__hint">读取轮次 issues.log——问题全记账、复盘逐条清点（§2.6-3）。</p>

    <template v-if="lines">
      <p class="gis__stats" data-testid="gis-stats">
        问题 {{ disposedCount + openCount }}｜已处置 {{ disposedCount }}｜未处置 {{ openCount }}｜处置率 {{ rate == null ? '—' : `${Math.round(rate * 100)}%` }}<template v-if="openCount > 0">——未达 100% 处置，红项待清</template>
        <span class="gis__src">数据源：{{ source }}（轮次账本；跨轮组织账本属 harness 侧，如实注明）</span>
      </p>
      <p v-if="rows.length === 0" class="gis__hint" data-testid="gis-empty">台账无 ISSUE 行。</p>
      <table v-else class="gis__table" data-testid="gis-table">
        <thead><tr><th>编号</th><th>主体</th><th>描述</th><th>处置</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i" :data-testid="`gis-row-${i}`">
            <td class="gis__mono">{{ r.code }}</td>
            <td>{{ r.subject || '—' }}</td>
            <td>{{ r.text }}</td>
            <td>
              <span class="gis__state" :class="r.disposed ? 'gis__state--done' : 'gis__state--open'" :data-testid="`gis-state-${i}`">{{ r.disposed ? '已处置' : '未处置' }}</span>
              <span v-if="r.disposed && r.dispText" class="gis__disp">：{{ r.dispText }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped lang="scss">
.gis { display: flex; flex-direction: column; gap: 10px; }
.gis__bar { display: flex; gap: 6px; }
.gis__input {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  width: 260px;
  font-family: var(--font-mono);
  background: transparent;
  color: inherit;
}
.gis__btn {
  border: 1px solid var(--border-color);
  background: transparent;
  color: inherit;
  border-radius: 4px;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.gis__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.gis__hint { color: var(--text-muted); font-size: 12px; margin: 0; }
.gis__stats { font-size: 12px; margin: 0; display: flex; flex-direction: column; gap: 2px; }
.gis__src { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.gis__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.gis__table th, .gis__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color); vertical-align: top; }
.gis__mono { font-family: var(--font-mono); white-space: nowrap; }
.gis__state { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.gis__state--done { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
.gis__state--open { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); }
.gis__disp { font-size: 11px; color: var(--text-muted); }
</style>
