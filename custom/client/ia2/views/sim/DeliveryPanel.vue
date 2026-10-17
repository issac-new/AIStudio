<!-- overlay/custom/client/ia2/views/sim/DeliveryPanel.vue -->
<!-- 签 5 交付健康（B5 工单，R4——设计正本 §二 S4 的分支与交付物面）：分支表
     （新鲜度三态 fresh/宽限窗内 stale/旧残留 old——branch_fresh 语义唯一实现
     在服务端，界面只消费）＋交付物 14 件链（件名/在场状态）。缺件如实缺席。 -->
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { authFetch } from '../../../ide/utils/auth-fetch'
import { useRouter } from 'vue-router'
import { useRunContext } from '../../composables/useRunContext'

interface BranchRow { name: string; localTs: number; pushTs: number | null; pushed: boolean; freshness: 'fresh' | 'stale' | 'old' }
interface BranchesResponse { run: string; graceMs: number; count: number; branches: BranchRow[] }
interface DeliverableRow { name: string; label: string; file: string | null }
interface DeliverablesResponse { run: string; deliverables: DeliverableRow[]; scanned: number }

const router = useRouter()
const { run, remember } = useRunContext()
const loading = ref(false)
const loadError = ref('')
const branches = ref<BranchesResponse | null>(null)
const deliverables = ref<DeliverablesResponse | null>(null)

const FRESH_LABEL: Record<BranchRow['freshness'], string> = { fresh: '新鲜', stale: '宽限窗内', old: '旧残留' }
const FRESH_CLASS: Record<BranchRow['freshness'], string> = { fresh: 'fresh', stale: 'stale', old: 'old' }

async function getJson<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res.json() as Promise<T>
}

async function load(): Promise<void> {
  const r = run.value.trim()
  if (!r) { loadError.value = '请输入运行目录名'; return }
  loading.value = true
  loadError.value = ''
  branches.value = null
  deliverables.value = null
  const [b, d] = await Promise.allSettled([
    getJson<BranchesResponse>(`/api/hermes/sim/branches?run=${encodeURIComponent(r)}`),
    getJson<DeliverablesResponse>(`/api/hermes/sim/deliverables?run=${encodeURIComponent(r)}`),
  ])
  if (b.status === 'fulfilled') { branches.value = b.value; remember() }
  else loadError.value = (b.reason as Error).message
  if (d.status === 'fulfilled') deliverables.value = d.value
  else loadError.value = loadError.value || (d.reason as Error).message
  loading.value = false
}

// 跨签贯通：run 已预填（query 或最近记忆）则挂载即读取，省一次手动点击
onMounted(() => { if (run.value.trim()) void load() })
</script>

<template>
  <div class="dlv" data-testid="dlv-panel">
    <div class="dlv__bar">
      <input v-model="run" class="dlv__input" data-testid="dlv-run" placeholder="运行目录名（如 20261015-v8-run20）" @keyup.enter="load">
      <button class="dlv__btn" type="button" data-testid="dlv-load" :disabled="loading" @click="load">读取</button>
    </div>
    <p v-if="loadError" class="dlv__error" data-testid="dlv-error">{{ loadError }}</p>
    <div v-else-if="!branches && !deliverables" class="dlv__hint" data-testid="dlv-empty">
      <p>输入运行读取分支新鲜度与交付物链。</p>
      <button type="button" class="dlv__goto" data-testid="dlv-goto-overview" @click="router.push({ name: 'ia2.sim' })">不知道目录名？去运行总览选取 →</button>
    </div>

    <section v-if="branches" class="dlv__box">
      <h4 class="dlv__h">分支交付（{{ branches.count }} 条，宽限窗 {{ Math.round(branches.graceMs / 60000) }} 分钟）</h4>
      <table class="dlv__table" data-testid="dlv-branch-table">
        <thead><tr><th>分支</th><th>最近提交</th><th>推送</th><th>新鲜度</th></tr></thead>
        <tbody>
          <tr v-for="b in branches.branches" :key="b.name">
            <td class="dlv__mono">{{ b.name }}</td>
            <td>{{ new Date(b.localTs).toLocaleString() }}</td>
            <td>{{ b.pushed ? '已推' : '从未推送' }}</td>
            <td>
              <span class="dlv__fresh" :class="`dlv__fresh--${FRESH_CLASS[b.freshness]}`" :data-testid="`dlv-fresh-${b.name}`">{{ FRESH_LABEL[b.freshness] }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="deliverables" class="dlv__box">
      <h4 class="dlv__h">交付物链（在库 {{ deliverables.deliverables.filter(d => d.file).length }}/{{ deliverables.deliverables.length }}，扫 {{ deliverables.scanned }} 文件）</h4>
      <ul class="dlv__chain">
        <li v-for="d in deliverables.deliverables" :key="d.name" class="dlv__chain-item" :data-testid="`dlv-dv-${d.name}`">
          <span class="dlv__chain-mark" :class="d.file ? 'dlv__chain-mark--present' : 'dlv__chain-mark--absent'">{{ d.file ? '✓' : '缺' }}</span>
          <span class="dlv__chain-label">{{ d.label }}</span>
          <span v-if="d.file" class="dlv__mono dlv__chain-file">{{ d.file }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
.dlv { display: flex; flex-direction: column; gap: 12px; }
.dlv__bar { display: flex; gap: 6px; }
.dlv__input {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  width: 260px;
  font-family: var(--font-mono);
}
.dlv__btn {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.dlv__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.dlv__goto { border: none; background: transparent; padding: 2px 0; color: var(--accent-primary); cursor: pointer; font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
.dlv__hint { color: var(--text-muted); font-size: 12px; margin: 0; }
.dlv__box { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; }
.dlv__h { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.dlv__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.dlv__table th, .dlv__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color); }
.dlv__mono { font-family: var(--font-mono); }
.dlv__fresh { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.dlv__fresh--fresh { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
.dlv__fresh--stale { color: var(--ia-stale); background: rgba(201, 150, 46, 0.14); }
.dlv__fresh--old { color: var(--text-muted); background: rgba(127, 127, 127, 0.14); }
.dlv__chain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.dlv__chain-item { display: flex; gap: 8px; align-items: baseline; font-size: 12px; }
.dlv__chain-mark { width: 16px; text-align: center; }
.dlv__chain-mark--present { color: var(--ia-fresh); }
.dlv__chain-mark--absent { color: var(--ia-fail); }
.dlv__chain-file { font-size: 11px; color: var(--text-muted); }
</style>
