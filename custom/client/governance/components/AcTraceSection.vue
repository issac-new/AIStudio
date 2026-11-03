<!-- overlay/custom/client/governance/components/AcTraceSection.vue -->
<!-- 四性四格补齐批 F2（2026-11-03）：AC × 用例矩阵。
     只读制品：数据来自 run 目录的 evidence/ac-trace.json（判据与落盘在服务端）。
     立场：缺口要可见——未绑定、无结果、失败三种缺口分别标出，未采集就写未采集。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchAcTrace, type AcTraceResp, type AcTraceRow } from '@/custom/governance/api/governance'

const props = defineProps<{ run?: string }>()

const route = useRoute()
const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))

const runId = computed(() => props.run || String(route.query.run ?? ''))
const data = ref<AcTraceResp | null>(null)
const error = ref('')
const loading = ref(false)

async function refresh(): Promise<void> {
  const run = runId.value
  data.value = null
  error.value = ''
  if (!run) return
  loading.value = true
  try {
    data.value = await fetchAcTrace(run)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
watch(runId, refresh)

const trace = computed(() => data.value?.trace ?? null)
const judgement = computed(() => trace.value?.judgement ?? null)

function rowStatus(row: AcTraceRow): 'unbound' | 'no-result' | 'failed' | 'ok' {
  if (row.cases.length === 0) return 'unbound'
  if (row.cases.some((c) => c.status === 'fail')) return 'failed'
  if (row.cases.every((c) => c.status === 'unknown' || c.status === 'missing')) return 'no-result'
  return 'ok'
}

const statusLabel = computed<Record<string, string>>(() => (zh.value
  ? { unbound: '未绑定', 'no-result': '无结果', failed: '失败', ok: '通过' }
  : { unbound: 'Unbound', 'no-result': 'No result', failed: 'Failed', ok: 'OK' }))

const statusGlyph = { unbound: '○', 'no-result': '◐', failed: '✕', ok: '●' } as const
</script>

<template>
  <section class="atx" data-testid="ac-trace-section">
    <header class="atx__head">
      <h2 class="atx__title">{{ zh ? '验收标准 × 用例追溯' : 'AC × case trace' }}</h2>
      <span v-if="runId" class="atx__run">{{ runId }}</span>
      <button type="button" class="atx__btn" data-testid="ac-trace-refresh" @click="refresh">
        {{ zh ? '刷新' : 'Refresh' }}
      </button>
    </header>

    <p v-if="!runId" class="atx__hint" data-testid="ac-trace-no-run">
      {{ zh ? '未选择推演轮次：在地址栏带 ?run=<轮次> 打开，或从推演运行进入。' : 'No run selected: open with ?run=<id>.' }}
    </p>
    <p v-else-if="loading" class="atx__hint">{{ zh ? '读取中…' : 'Loading…' }}</p>
    <p v-else-if="error" class="atx__err" data-testid="ac-trace-error">{{ error }}</p>
    <p v-else-if="data && data.available === false" class="atx__hint" data-testid="ac-trace-unavailable">
      {{ zh ? '未采集' : 'Not collected' }}：{{ data.note ?? '' }}
    </p>

    <template v-else-if="trace && judgement">
      <div class="atx__summary">
        <span :class="['atx__pill', judgement.ok ? 'is-ok' : 'is-bad']" data-testid="ac-trace-verdict">
          {{ judgement.ok ? (zh ? '追溯完整' : 'Trace complete') : (zh ? '存在缺口' : 'Gaps found') }}
        </span>
        <span class="atx__count">{{ zh ? 'AC' : 'AC' }} {{ trace.acTotal }}</span>
        <span v-if="judgement.unbound.length" class="atx__gap" data-testid="ac-trace-unbound">
          {{ zh ? '未绑定' : 'Unbound' }} {{ judgement.unbound.join('、') }}
        </span>
        <span v-if="judgement.noResult.length" class="atx__gap" data-testid="ac-trace-noresult">
          {{ zh ? '无结果' : 'No result' }} {{ judgement.noResult.join('、') }}
        </span>
        <span v-if="judgement.failed.length" class="atx__gap is-bad" data-testid="ac-trace-failed">
          {{ zh ? '失败' : 'Failed' }} {{ judgement.failed.join('、') }}
        </span>
      </div>

      <table class="atx__table">
        <thead>
          <tr>
            <th class="atx__th">{{ zh ? '验收标准' : 'AC' }}</th>
            <th class="atx__th">{{ zh ? '可验证方式' : 'Verifiable' }}</th>
            <th class="atx__th">{{ zh ? '用例（状态）' : 'Cases' }}</th>
            <th class="atx__th">{{ zh ? '判定' : 'Verdict' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in trace.rows" :key="row.acId" class="atx__row" :data-status="rowStatus(row)" data-testid="ac-trace-row">
            <td class="atx__td">
              <strong>{{ row.acId }}</strong>
              <span class="atx__text">{{ row.text }}</span>
            </td>
            <td class="atx__td atx__kind">{{ row.verifiable }}</td>
            <td class="atx__td">
              <span v-if="row.cases.length === 0" class="atx__none">—</span>
              <span v-for="c in row.cases" :key="c.case" class="atx__case" :data-status="c.status">
                {{ c.case }}<em>{{ c.status }}</em>
              </span>
            </td>
            <td class="atx__td">
              <span :class="['atx__mark', `is-${rowStatus(row)}`]">
                {{ statusGlyph[rowStatus(row)] }} {{ statusLabel[rowStatus(row)] }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <p v-if="judgement.orphanCases.length" class="atx__hint" data-testid="ac-trace-orphans">
        {{ zh ? '不属于任何 AC 的用例（提示，不阻断）' : 'Cases bound to no AC (advisory)' }}：{{ judgement.orphanCases.join('、') }}
      </p>
    </template>
  </section>
</template>

<style scoped lang="scss">
.atx {
  border: 1px solid var(--border-color);
  border-radius: var(--radius, 8px);
  padding: 12px;
  background: var(--bg-primary);
}
.atx__head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.atx__title { font-size: 14px; margin: 0; color: var(--text-primary); }
.atx__run { font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono); }
.atx__btn { margin-left: auto; font-size: 12px; padding: 3px 10px; cursor: pointer; }
.atx__hint { font-size: 12px; color: var(--text-muted); margin: 6px 0; }
.atx__err { font-size: 12px; color: var(--color-danger); margin: 6px 0; }
.atx__summary { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 8px; }
.atx__pill { font-size: 12px; padding: 2px 8px; border-radius: var(--radius-pill); }
.atx__pill.is-ok { background: color-mix(in srgb, var(--color-success) 12%, transparent); color: var(--color-success); }
.atx__pill.is-bad { background: color-mix(in srgb, var(--color-danger) 12%, transparent); color: var(--color-danger); }
.atx__count { font-size: 12px; color: var(--text-secondary); }
.atx__gap { font-size: 12px; color: var(--color-warning); }
.atx__gap.is-bad { color: var(--color-danger); }
.atx__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.atx__th { text-align: left; padding: 6px; border-bottom: 1px solid var(--border-color); color: var(--text-secondary); font-weight: 500; }
.atx__td { padding: 6px; border-bottom: 1px solid var(--border-light); vertical-align: top; }
.atx__text { display: block; color: var(--text-secondary); margin-top: 2px; }
.atx__kind { color: var(--text-secondary); }
.atx__none { color: var(--text-color-3); }
.atx__case { display: inline-block; margin: 0 6px 4px 0; padding: 1px 6px; border-radius: var(--radius-micro); background: var(--bg-secondary); }
.atx__case em { font-style: normal; margin-left: 4px; color: var(--text-secondary); }
.atx__case[data-status='fail'] { background: color-mix(in srgb, var(--color-danger) 12%, transparent); }
.atx__case[data-status='unknown'] { background: color-mix(in srgb, var(--color-warning) 14%, transparent); }
.atx__mark.is-ok { color: var(--color-success); }
.atx__mark.is-unbound { color: var(--text-secondary); }
.atx__mark.is-no-result { color: var(--color-warning); }
.atx__mark.is-failed { color: var(--color-danger); }
.atx__row[data-status='failed'] { background: color-mix(in srgb, var(--color-danger) 6%, transparent); }
</style>
