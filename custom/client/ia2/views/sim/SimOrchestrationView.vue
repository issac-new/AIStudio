<!-- 全流程推演·运行编排（只读）：场景规格与图运行清单来自 graph 事件源；
     日常看板协同图保留在 /app/board，两个导航域不互相改写。 -->
<script setup lang="ts">
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import TabIntroBanner from '../../components/TabIntroBanner.vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchSimRuns, fetchSimSpecs, type SimRunSummary, type SimSpecSummary } from '../../api/sim-orchestration'
import { humanDateTime, humanEnum } from '../../format'

const route = useRoute()
const router = useRouter()
const specs = ref<SimSpecSummary[]>([])
const runs = ref<SimRunSummary[]>([])
const loading = ref(false)
const loadError = ref('')
const backQuery = computed<Record<string, string> | undefined>(() => {
  const q: Record<string, string> = {}
  for (const key of ['run', 'from'] as const) {
    const v = route.query[key]
    if (typeof v === 'string' && v) q[key] = v
  }
  return Object.keys(q).length ? q : undefined
})

const specRows = computed(() => specs.value.slice(0, 50))
const runRows = computed(() => runs.value.slice(0, 50))

async function refresh(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const [specRes, runRes] = await Promise.all([fetchSimSpecs(), fetchSimRuns()])
    specs.value = specRes
    runs.value = runRes
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

onMounted(() => { void refresh() })
</script>

<template>
  <div class="sro" data-testid="orc-page">
    <IaBreadcrumb />
    <TabIntroBanner tab="orchestration" />
    <header class="sro__head">
      <h2 class="sro__title">运行编排（只读）</h2>
      <div class="sro__actions">
        <button type="button" class="sro__button" data-testid="orc-refresh" :disabled="loading" @click="refresh">{{ loading ? '读取中…' : '刷新' }}</button>
        <button type="button" class="sro__button" data-testid="orc-back" @click="void router.push({ name: 'ia2.sim', query: backQuery })">返回全流程推演</button>
      </div>
    </header>
    <p class="sro__note">这里只列出推演图规格与图运行；启动、续跑和人工闸在导演台处理。日常任务协同图请回到日常工作台的看板。</p>
    <p v-if="loadError" class="sro__error" data-testid="orc-error" :title="loadError">运行编排数据暂不可用。</p>

    <div class="sro__body">
    <section class="sro__panel">
      <h3 class="sro__h">图运行（{{ runRows.length }}）</h3>
      <p v-if="!runRows.length && !loading" class="sro__empty">还没有图运行记录。</p>
      <div v-else class="sro__tablewrap">
        <table class="sro__table">
          <thead><tr><th>运行</th><th>场景</th><th>状态</th><th>更新时间</th></tr></thead>
          <tbody>
            <tr v-for="r in runRows" :key="r.runId" :data-testid="`orc-run-${r.runId}`">
              <td class="sro__mono">{{ r.runId }}</td>
              <td>{{ r.graphId }}</td>
              <td>{{ humanEnum(r.status) }}</td>
              <td>{{ humanDateTime(r.updatedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="sro__panel">
      <h3 class="sro__h">场景规格（{{ specRows.length }}）</h3>
      <p v-if="!specRows.length && !loading" class="sro__empty">还没有场景规格。</p>
      <div v-else class="sro__cards">
        <article v-for="s in specRows" :key="s.id" class="sro__card" :data-testid="`orc-spec-${s.id}`">
          <strong>{{ s.meta?.goal || s.description || s.id }}</strong>
          <span>{{ s.id }} · v{{ s.version ?? 1 }} · {{ s.origin || 'editor' }}</span>
        </article>
      </div>
    </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sro { display: flex; flex-direction: column; gap: 10px; height: 100%; padding: 12px 16px; overflow: hidden; }
.sro__head { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.sro__title { margin: 0; font-size: 15px; }
.sro__actions { margin-left: auto; display: flex; gap: 6px; }
.sro__button { border: 1px solid var(--border-color); background: transparent; color: inherit; border-radius: 4px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; &:disabled { opacity: .5; } }
.sro__note { margin: 0; font-size: 12px; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 6px; padding: 6px 10px; flex-shrink: 0; }
.sro__error { margin: 0; color: var(--ia-fail); font-size: 12px; }
.sro__body { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.sro__panel { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; margin: 0; }
.sro__h { margin: 0 0 8px; font-size: 12.5px; }
.sro__empty { margin: 0; color: var(--text-muted); font-size: 12px; }
.sro__tablewrap { min-width: 0; overflow-x: auto; }
.sro__table { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 12px; th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border-color); } }
.sro__mono { font-family: var(--font-mono); }
.sro__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 8px; }
.sro__card { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px; border: 1px solid var(--border-color); border-radius: 6px; span { color: var(--text-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
</style>
