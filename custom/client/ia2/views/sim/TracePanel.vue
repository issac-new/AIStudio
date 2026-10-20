<!-- overlay/custom/client/ia2/views/sim/TracePanel.vue -->
<!-- 签 6 需求追溯（B6 工单，R12——设计正本 §二 S4 的判词链面）：AC 判词链
     四列表（AC 编号/判据原文/测试结果/UAT 判定三态）；源缺席列=null 如实
     呈现（meta 三徽标明冻结单/测试报告/验收书在场状态），不硬凑。
     P2（2026-10-19）：UAT 待判模式支持就地三态录入，写入运行证据台账
     （evidence/uat-verdicts.jsonl，服务端合并回本表）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authFetch } from '../../../ide/utils/auth-fetch'
import { useRunContext } from '../../composables/useRunContext'
import { postUatVerdict, type UatVerdictKey } from '../../api/sim-verdicts'

/** UAT 判定页签只看未判条目（2026-10-18 阶段页页签批；默认全量） */
const props = withDefaults(defineProps<{ onlyUnjudged?: boolean }>(), { onlyUnjudged: false })
const router = useRouter()

interface TraceRow { ac: string; criterion: string | null; caseResult: string | null; uatVerdict: string | null }
interface TraceResponse {
  run: string
  rows: TraceRow[]
  meta: { frozenPresent: boolean; testReportPresent: boolean; acceptancePresent: boolean; uatLedger?: boolean }
  source: { evidenceDir: string }
}

const { run, remember } = useRunContext('sim')
const loading = ref(false)
const loadError = ref('')
const trace = ref<TraceResponse | null>(null)
const actingAc = ref('')
const actionError = ref('')

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

const rows = computed(() => {
  const all = trace.value?.rows ?? []
  // P2（spec 2026-10-19-studio-p2 §2.1）：台账补行（三源缺席但有人工判定的 AC）
  // 在 UAT 待判模式下不显示——录入入口只面向"未判 AC"；已判条目留在全量
  // 需求追溯面，不回填待判列表制造"全部已判"的假满。
  return props.onlyUnjudged ? all.filter(r => !r.uatVerdict) : all
})

/** 证据目录只展示工作区末两层；完整绝对路径留在 title 供排查。 */
const evidenceLabel = computed(() => {
  const p = trace.value?.source.evidenceDir ?? ''
  const parts = p.split('/').filter(Boolean)
  return parts.slice(-2).join('/')
})

/** UAT 判定三态徽（不通过红/有条件通过琥珀/通过绿；未判定=灰） */
function verdictClass(v: string | null): string {
  if (!v) return 'none'
  if (/不通过|reject|fail/i.test(v)) return 'reject'
  if (/有条件|conditional/i.test(v)) return 'conditional'
  if (/通过|pass/i.test(v)) return 'pass'
  return 'none'
}

const VERDICT_OPTIONS: Array<{ key: UatVerdictKey; label: string; cls: string }> = [
  { key: 'pass', label: '通过', cls: 'pass' },
  { key: 'conditional', label: '有条件通过', cls: 'conditional' },
  { key: 'reject', label: '不通过', cls: 'reject' },
]

/** 就地录入：写运行证据台账后整表重读（服务端合并人工判定）。 */
async function recordVerdict(ac: string, verdict: UatVerdictKey): Promise<void> {
  const r = run.value.trim()
  if (!r || actingAc.value) return
  const label = VERDICT_OPTIONS.find(o => o.key === verdict)?.label ?? verdict
  if (!window.confirm(`确认将 ${ac} 判定为「${label}」？判定将写入运行证据台账并留痕。`)) return
  actingAc.value = ac
  actionError.value = ''
  try {
    await postUatVerdict({ run: r, ac, verdict })
    await load()
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    actingAc.value = ''
  }
}

// 跨签贯通：run 已预填（query 或最近记忆）则挂载即读取，省一次手动点击
onMounted(() => { if (run.value.trim()) void load() })
watch(run, () => { if (run.value.trim()) void load() })
</script>

<template>
  <div class="trc" data-testid="trc-panel">
    <p v-if="loadError" class="trc__error" data-testid="trc-error" :title="loadError">验收判定数据暂不可用（该运行可能尚未生成验收证据）。</p>
    <div v-else-if="!trace" class="trc__empty" data-testid="trc-no-run">
      <p class="trc__hint">在页头选择一次运行，读取验收判定链（冻结单×测试报告×验收书三源聚合）。</p>
      <p class="trc__hint">若页头列表为空，说明当前还没有历史运行；先完成一次运行，或到运行中心查看启动准备。</p>
      <button type="button" class="trc__action" data-testid="trc-open-sim" @click="router.push({ name: 'ia2.sim' })">
        打开运行中心 →
      </button>
    </div>

    <template v-if="trace">
      <p v-if="onlyUnjudged" class="trc__readonly" data-testid="trc-uat-entry">
        UAT 待判就地录入：点行内三态按钮写判定，落运行证据台账（evidence/uat-verdicts.jsonl）并留痕；
        人工判定覆盖验收书提取值。
      </p>
      <p v-if="actionError" class="trc__error" data-testid="trc-action-error">{{ actionError }}</p>
      <p class="trc__meta" data-testid="trc-meta">
        源在场：
        <span :class="trace.meta.frozenPresent ? 'trc__ok' : 'trc__absent'">冻结单{{ trace.meta.frozenPresent ? '✓' : '缺' }}</span>
        <span :class="trace.meta.testReportPresent ? 'trc__ok' : 'trc__absent'">测试报告{{ trace.meta.testReportPresent ? '✓' : '缺' }}</span>
        <span :class="trace.meta.acceptancePresent ? 'trc__ok' : 'trc__absent'">验收书{{ trace.meta.acceptancePresent ? '✓' : '缺' }}</span>
        <span v-if="trace.meta.uatLedger" class="trc__ok">人工判定台账✓</span>
        <span class="trc__src" :title="trace.source.evidenceDir">证据目录：{{ evidenceLabel }}</span>
      </p>
      <p v-if="rows.length === 0" class="trc__hint" data-testid="trc-empty">{{ props.onlyUnjudged ? '所有 AC 都已有 UAT 判定。' : '未提取到 AC 行。' }}</p>
      <table v-else class="trc__table" data-testid="trc-table">
        <thead><tr><th>AC</th><th>判据原文</th><th>测试结果</th><th>UAT 判定</th><th v-if="onlyUnjudged">录入</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.ac" :data-testid="`trc-row-${r.ac}`">
            <td class="trc__mono">{{ r.ac }}</td>
            <td>{{ r.criterion ?? '（冻结单缺席）' }}</td>
            <td :class="{ 'trc__absent': !r.caseResult }">{{ r.caseResult ?? '未测试' }}</td>
            <td>
              <span class="trc__verdict" :class="`trc__verdict--${verdictClass(r.uatVerdict)}`">{{ r.uatVerdict ?? '未判' }}</span>
            </td>
            <td v-if="onlyUnjudged" class="trc__entry">
              <button
                v-for="o in VERDICT_OPTIONS"
                :key="o.key"
                type="button"
                class="trc__verdict-btn"
                :class="`trc__verdict-btn--${o.cls}`"
                :data-testid="`trc-verdict-${r.ac}-${o.key}`"
                :disabled="actingAc === r.ac"
                @click="recordVerdict(r.ac, o.key)"
              >{{ o.label }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </div>
</template>

<style scoped lang="scss">
.trc { display: flex; flex-direction: column; gap: 12px; min-width: 0; overflow-x: auto; }
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
.trc__table { width: 100%; min-width: 720px; border-collapse: collapse; font-size: 12px; }
.trc__table th, .trc__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color); vertical-align: top; }
.trc__mono { font-family: var(--font-mono); white-space: nowrap; }
.trc__verdict { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.trc__verdict--pass { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
.trc__verdict--conditional { color: var(--ia-stale); background: rgba(201, 150, 46, 0.14); }
.trc__verdict--reject { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); }
.trc__verdict--none { color: var(--text-muted); background: rgba(127, 127, 127, 0.12); }
.trc__entry { white-space: normal; min-width: 180px; }
.trc__verdict-btn {
  border: 1px solid var(--border-color);
  background: transparent;
  border-radius: 4px;
  padding: 1px 7px;
  margin-right: 4px;
  font-size: 11px;
  cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--accent-primary); }
  &:disabled { opacity: 0.5; cursor: wait; }
}
.trc__verdict-btn--pass { color: var(--ia-fresh); }
.trc__verdict-btn--conditional { color: var(--ia-stale); }
.trc__verdict-btn--reject { color: var(--ia-fail); }
</style>
