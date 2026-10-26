<script setup lang="ts">
// overlay/custom/client/ide/components/IdeWorkitemPanorama.vue
// 工作项全景串联面板（JoyAI 闭环吸收轮 P4）：taskId → 全链路八面产物。
// 以 taskId 为统一上下文锚，把看板/事件/证据/评测/评审/计划/图运行/trace 会话
// 汇聚成一张卡；每面 fail-soft（源缺席如实显示不可用，不猜数）；
// coverage 声明串联边界（trace 无 taskId 索引等），防「无产物」误读。
import { ref, watch } from 'vue'
import { fetchWorkitemPanorama, type WorkitemPanoramaDto, type Face } from '../api/workitem'

const props = defineProps<{ taskId: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const p = ref<WorkitemPanoramaDto | null>(null)
const loadError = ref('')
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    p.value = await fetchWorkitemPanorama(props.taskId)
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(() => props.taskId, () => { void load() }, { immediate: true })

function count<T>(f: Face<T[]> | undefined): string {
  if (!f) return '—'
  if (!f.available) return '不可用'
  return String(f.data?.length ?? 0)
}

function fmtTs(ms?: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString()
}
</script>

<template>
  <div class="ide-pano" data-testid="ide-workitem-panorama">
    <header class="ide-pano__head">
      <strong>全景串联</strong>
      <code class="ide-pano__id">{{ taskId }}</code>
      <button type="button" class="ide-pano__close" data-testid="ide-pano-close" @click="emit('close')">✕</button>
    </header>
    <p v-if="loading" class="ide-pano__hint">读取中…</p>
    <p v-else-if="loadError" class="ide-pano__err" data-testid="ide-pano-error">{{ loadError }}</p>
    <template v-else-if="p">
      <!-- 卡片面 -->
      <section class="ide-pano__face" data-testid="ide-pano-task">
        <h4>看板卡片</h4>
        <template v-if="p.task.available && p.task.data">
          <p class="ide-pano__line"><strong>{{ p.task.data.title }}</strong>（{{ p.task.data.board }} · {{ p.task.data.status }}）</p>
          <p class="ide-pano__line muted">负责 {{ p.task.data.assignee ?? '—' }} · 建于 {{ fmtTs(p.task.data.createdAt) }}</p>
        </template>
        <p v-else class="ide-pano__err">{{ p.task.error ?? '不可用' }}</p>
      </section>
      <!-- 计数面 -->
      <section class="ide-pano__faces">
        <div class="ide-pano__face"><h4>看板事件</h4><p class="ide-pano__num" data-testid="ide-pano-count-events">{{ count(p.kanbanEvents) }}</p></div>
        <div class="ide-pano__face"><h4>证据</h4><p class="ide-pano__num" data-testid="ide-pano-count-evidence">{{ p.evidence.available ? p.evidence.data?.count ?? 0 : '不可用' }}</p></div>
        <div class="ide-pano__face"><h4>评测任务</h4><p class="ide-pano__num" data-testid="ide-pano-count-evals">{{ count(p.evals) }}</p></div>
        <div class="ide-pano__face"><h4>评审案例</h4><p class="ide-pano__num" data-testid="ide-pano-count-reviews">{{ count(p.reviews) }}</p></div>
        <div class="ide-pano__face"><h4>计划</h4><p class="ide-pano__num" data-testid="ide-pano-count-plans">{{ count(p.plans) }}</p></div>
        <div class="ide-pano__face"><h4>图运行</h4><p class="ide-pano__num" data-testid="ide-pano-count-graphruns">{{ count(p.graphRuns) }}</p></div>
        <div class="ide-pano__face"><h4>trace 会话</h4><p class="ide-pano__num" data-testid="ide-pano-count-traces">{{ count(p.traces) }}</p></div>
      </section>
      <!-- 明细（最近项） -->
      <section v-if="p.evidence.available && p.evidence.data?.records.length" class="ide-pano__face">
        <h4>最新证据</h4>
        <ul class="ide-pano__list">
          <li v-for="r in p.evidence.data.records.slice(0, 5)" :key="r.evidenceId">
            {{ fmtTs(r.at) }} · {{ r.kind }}<span v-if="r.verdict"> · {{ r.verdict }}</span>
          </li>
        </ul>
      </section>
      <section v-if="p.evals.available && p.evals.data?.length" class="ide-pano__face">
        <h4>评测任务</h4>
        <ul class="ide-pano__list">
          <li v-for="t in p.evals.data" :key="`${t.setId}:${t.taskId}`">
            {{ t.taskId }}（{{ t.setName }}<span v-if="t.sealed"> · 密封</span>）<span v-if="t.runIds.length"> · {{ t.runIds.length }} 次运行</span>
          </li>
        </ul>
      </section>
      <section v-if="p.graphRuns.available && p.graphRuns.data?.length" class="ide-pano__face">
        <h4>图运行（loop.persisted）</h4>
        <ul class="ide-pano__list">
          <li v-for="g in p.graphRuns.data.slice(0, 5)" :key="g.runId">{{ fmtTs(g.ts) }} · {{ g.runId }} → {{ g.artifact }}</li>
        </ul>
      </section>
      <!-- 覆盖边界（诚实声明） -->
      <footer class="ide-pano__cov" :title="p.coverage.note">
        串联边界：trace 会话无 taskId 索引（仅评测桥接可见）；eval 任务按 origin 双路匹配。
      </footer>
    </template>
  </div>
</template>

<style scoped>
.ide-pano { border: 1px solid var(--border-color, #ccc); border-radius: 8px; padding: 10px 12px; margin: 6px 0; font-size: 12px; background: var(--bg-secondary, #fafafa); }
.ide-pano__head { display: flex; align-items: center; gap: 8px; }
.ide-pano__id { font-size: 11px; opacity: 0.7; }
.ide-pano__close { margin-left: auto; border: none; background: none; cursor: pointer; font-size: 13px; }
.ide-pano__faces { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 6px; margin: 8px 0; }
.ide-pano__face { min-width: 0; }
.ide-pano__face h4 { margin: 4px 0 2px; font-size: 11px; opacity: 0.75; font-weight: 600; }
.ide-pano__num { font-size: 16px; font-weight: 600; }
.ide-pano__line { margin: 2px 0; }
.ide-pano__list { margin: 2px 0 0; padding-left: 16px; }
.ide-pano__list li { margin: 2px 0; }
.ide-pano__err { color: var(--error, #c0392b); margin: 4px 0; }
.ide-pano__hint, .muted { opacity: 0.7; }
.ide-pano__cov { margin-top: 8px; opacity: 0.65; font-size: 11px; border-top: 1px dashed var(--border-color, #ddd); padding-top: 6px; }
</style>
