<!-- overlay/custom/client/ia2/views/sim/TracePanel.vue -->
<!-- 签 6 需求追溯（B6 工单，R12——设计正本 §二 S4 的判词链面）：AC 判词链
     四列表（AC 编号/判据原文/测试结果/UAT 判定三态）；源缺席列=null 如实
     呈现（meta 三徽标明冻结单/测试报告/验收书在场状态），不硬凑。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authFetch } from '../../../ide/utils/auth-fetch'
import { useRunContext } from '../../composables/useRunContext'

/** UAT 判定页签只看未判条目（2026-10-18 阶段页页签批；默认全量） */
const props = withDefaults(defineProps<{ onlyUnjudged?: boolean }>(), { onlyUnjudged: false })
const router = useRouter()

interface TraceRow { ac: string; criterion: string | null; caseResult: string | null; uatVerdict: string | null }
interface TraceResponse {
  run: string
  rows: TraceRow[]
  meta: { frozenPresent: boolean; testReportPresent: boolean; acceptancePresent: boolean }
  source: { evidenceDir: string }
}

const { run, remember } = useRunContext()
const loading = ref(false)
const loadError = ref('')
const trace = ref<TraceResponse | null>(null)

async function load(): Promise<void> {
  const r = run.value.trim()
  if (!r) { loadError.value = ''; return }
  loading.value = true
  loadError.value = ''
  trace.value = null
  try {
    const res = await authFetch(`/api/hermes/sim/trace?run=${encodeURIComponent(r)}`)
    if (!res.ok) throw new Error(`/api/hermes/sim/trace → ${res.status}`)
    trace.value = await res.json() as TraceResponse
    remember()
  } catch (e) {
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

const rows = computed(() => props.onlyUnjudged
  ? (trace.value?.rows ?? []).filter(r => !r.uatVerdict)
  : (trace.value?.rows ?? []))

/** UAT 判定三态徽（不通过红/有条件通过琥珀/通过绿；未判定=灰） */
function verdictClass(v: string | null): string {
  if (!v) return 'none'
  if (/不通过|reject|fail/i.test(v)) return 'reject'
  if (/有条件|conditional/i.test(v)) return 'conditional'
  if (/通过|pass/i.test(v)) return 'pass'
  return 'none'
}

// 跨签贯通：run 已预填（query 或最近记忆）则挂载即读取，省一次手动点击
onMounted(() => { if (run.value.trim()) void load() })
watch(run, () => { if (run.value.trim()) void load() })
</script>

<template>
  <div class="trc" data-testid="trc-panel">
    <p v-if="loadError" class="trc__error" data-testid="trc-error">{{ loadError }}</p>
    <div v-else-if="!trace" class="trc__empty" data-testid="trc-no-run">
      <p class="trc__hint">在页头选择一次运行，读取验收判定链（冻结单×测试报告×验收书三源聚合）。</p>
      <p class="trc__hint">若页头列表为空，说明当前还没有历史运行；先完成一次运行，或到运行中心查看启动准备。</p>
      <button type="button" class="trc__action" data-testid="trc-open-sim" @click="router.push({ name: 'ia2.sim' })">
        打开运行中心 →
      </button>
    </div>

    <template v-if="trace">
      <p v-if="onlyUnjudged" class="trc__readonly" data-testid="trc-uat-readonly">
        UAT 待判为只读清单：本版本尚不在此页录入判定，判定结果来自运行验收数据；未判条目需回到对应运行补齐证据。
      </p>
      <p class="trc__meta" data-testid="trc-meta">
        源在场：
        <span :class="trace.meta.frozenPresent ? 'trc__ok' : 'trc__absent'">冻结单{{ trace.meta.frozenPresent ? '✓' : '缺' }}</span>
        <span :class="trace.meta.testReportPresent ? 'trc__ok' : 'trc__absent'">测试报告{{ trace.meta.testReportPresent ? '✓' : '缺' }}</span>
        <span :class="trace.meta.acceptancePresent ? 'trc__ok' : 'trc__absent'">验收书{{ trace.meta.acceptancePresent ? '✓' : '缺' }}</span>
        <span class="trc__src">证据目录：{{ trace.source.evidenceDir }}</span>
      </p>
      <p v-if="rows.length === 0" class="trc__hint" data-testid="trc-empty">{{ props.onlyUnjudged ? '所有 AC 都已有 UAT 判定。' : '未提取到 AC 行。' }}</p>
      <table v-else class="trc__table" data-testid="trc-table">
        <thead><tr><th>AC</th><th>判据原文</th><th>测试结果</th><th>UAT 判定</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.ac" :data-testid="`trc-row-${r.ac}`">
            <td class="trc__mono">{{ r.ac }}</td>
            <td>{{ r.criterion ?? '（冻结单缺席）' }}</td>
            <td :class="{ 'trc__absent': !r.caseResult }">{{ r.caseResult ?? 'null' }}</td>
            <td>
              <span class="trc__verdict" :class="`trc__verdict--${verdictClass(r.uatVerdict)}`">{{ r.uatVerdict ?? '未判' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped lang="scss">
.trc { display: flex; flex-direction: column; gap: 12px; }
.trc__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.trc__hint { color: var(--text-muted); font-size: 12px; margin: 0; }
.trc__empty { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.trc__action {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--accent-primary);
  border-radius: 5px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.trc__readonly {
  margin: 0;
  padding: 7px 10px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  font-size: 11.5px;
  color: var(--text-muted);
}
.trc__meta { font-size: 12px; margin: 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.trc__ok { color: var(--ia-fresh); }
.trc__absent { color: var(--ia-fail); }
.trc__src { color: var(--text-muted); font-size: 11px; font-family: var(--font-mono); }
.trc__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.trc__table th, .trc__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color); vertical-align: top; }
.trc__mono { font-family: var(--font-mono); white-space: nowrap; }
.trc__verdict { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.trc__verdict--pass { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
.trc__verdict--conditional { color: var(--ia-stale); background: rgba(201, 150, 46, 0.14); }
.trc__verdict--reject { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); }
.trc__verdict--none { color: var(--text-muted); background: rgba(127, 127, 127, 0.12); }
</style>
