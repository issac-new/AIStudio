<!-- overlay/custom/client/ia2/views/records/RecordDetailView.vue
     执行记录详情（route records/:kind/:id）：kind=delegate → 委托详情
     （result JSON 摘要 + logTail 尾部日志 + 元数据）；kind=coding-run →
     编码运行详情（session 元数据 + usage 卡 + changes 变更表）。
     骨架照 sim/DirectorRunDetail.vue：useRoute + watch 深链可分享、
     IaBreadcrumb 面包屑 + 返回列表。数据源=/api/execution-records/*（只读）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import {
  fetchCodingDetail, fetchDelegateDetail,
  type CodingChangeRow, type CodingDetail, type DelegateDetail, type ExecutionRecord,
} from '../../api/execution-records'
import {
  formatDurationLabel, formatLogBytes, formatRecordTime, kindLabel,
  outcomeBadgeClass, outcomeLabel,
} from '../../utils/records'

const route = useRoute()
const router = useRouter()

/** 参数路由 /app/records/:kind/:id（深链可分享；kind 决定调哪个详情端点） */
const kindParam = computed(() => {
  const raw = Array.isArray(route.params.kind) ? route.params.kind[0] : route.params.kind
  return typeof raw === 'string' ? raw.trim() : ''
})
const idParam = computed(() => {
  const raw = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id
  return typeof raw === 'string' && raw.trim() ? raw.trim() : ''
})
const kind = computed<'delegate' | 'coding-run' | null>(() =>
  kindParam.value === 'delegate' || kindParam.value === 'coding-run' ? kindParam.value : null,
)

const loading = ref(false)
const loadError = ref('')
const record = ref<ExecutionRecord | null>(null)
const delegate = ref<DelegateDetail | null>(null)
const coding = ref<CodingDetail | null>(null)

async function refresh(): Promise<void> {
  if (!kind.value || !idParam.value) return
  loading.value = true
  loadError.value = ''
  record.value = null
  delegate.value = null
  coding.value = null
  try {
    if (kind.value === 'delegate') {
      const d = await fetchDelegateDetail(idParam.value)
      delegate.value = d
      record.value = d.record
    } else {
      const c = await fetchCodingDetail(idParam.value)
      coding.value = c
      record.value = c.record
    }
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => { void refresh() })
watch([kind, idParam], () => { void refresh() })

function backToList(): void {
  void router.push({ name: 'ia2.records' })
}

/** 委托 result 的可读 JSON（稳定键序，摘要卡唯一事实源） */
const resultJson = computed(() => {
  const r = delegate.value?.result
  return r ? JSON.stringify(r, null, 2) : ''
})

/** session/usage 对象 → kv 行（值仅做字符串化展示，不猜结构） */
function metaRows(obj: Record<string, unknown> | null): Array<{ k: string; v: string }> {
  if (!obj) return []
  return Object.entries(obj).map(([k, v]) => ({
    k,
    v: typeof v === 'string' ? v : JSON.stringify(v),
  }))
}
const sessionRows = computed(() => metaRows(coding.value?.session ?? null))
const usageRows = computed(() => metaRows(coding.value?.usage ?? null))
const changes = computed<CodingChangeRow[]>(() => coding.value?.changes ?? [])

/** 元数据 kv 行（record 缺席时不渲染卡片） */
const metaRowsOfRecord = computed(() => {
  const rec = record.value
  if (!rec) return []
  const rows: Array<{ k: string; v: string }> = [
    { k: '运行', v: rec.runId },
    { k: '耗时', v: formatDurationLabel(rec.startedAt, rec.endedAt) },
  ]
  if (rec.sessionId) rows.push({ k: '会话', v: rec.sessionId })
  if (rec.agentId) rows.push({ k: '代理', v: rec.agentId })
  if (rec.cli) rows.push({ k: 'CLI', v: rec.cli })
  if (rec.taskId) rows.push({ k: '任务', v: rec.taskId })
  if (rec.board) rows.push({ k: '看板', v: rec.board })
  if (rec.exitCode !== undefined) rows.push({ k: 'exitCode', v: String(rec.exitCode) })
  if (rec.reason) rows.push({ k: '原因', v: rec.reason })
  rows.push({ k: '开始', v: formatRecordTime(rec.startedAt) })
  rows.push({ k: '结束', v: formatRecordTime(rec.endedAt) })
  if (rec.promptSha256) rows.push({ k: 'promptSha256', v: rec.promptSha256 })
  rows.push({ k: '日志体量', v: formatLogBytes(rec.logBytes) })
  return rows
})

/** 变更行的时间列（epoch/ISO 都收；缺失=「—」） */
function changeTime(v: number | string | undefined): string {
  return formatRecordTime(v)
}
</script>

<template>
  <div class="recd" data-testid="record-detail">
    <IaBreadcrumb />
    <header class="recd__head">
      <h2 class="recd__title">执行记录详情</h2>
      <div class="recd__actions">
        <button type="button" class="recd__btn" data-testid="record-refresh" :disabled="loading || !kind" @click="refresh">{{ loading ? '读取中…' : '刷新' }}</button>
        <button type="button" class="recd__btn" data-testid="record-back" @click="backToList">返回执行记录</button>
      </div>
    </header>

    <p v-if="!kind" class="recd__note" data-testid="record-unknown-kind">
      未知的记录类型「{{ kindParam || '（缺失）' }}」——仅支持 delegate（按 taskId）与 coding-run（按 sessionId）。
    </p>
    <p v-else-if="!idParam" class="recd__note" data-testid="record-missing-id">缺少记录标识——请从执行记录列表进入。</p>
    <p v-else-if="loadError" class="recd__error" data-testid="record-error" :title="loadError">记录详情暂不可用。</p>

    <template v-else>
      <!-- 记录元数据（两种 kind 共用；record=null=索引有条目但详情体缺席，如实提示） -->
      <section v-if="record" class="recd__card" data-testid="record-meta">
        <div class="recd__meta-head">
          <span class="recd__badge" :class="outcomeBadgeClass(record.outcome)" data-testid="record-outcome">{{ outcomeLabel(record.outcome) }}</span>
          <span class="recd__meta-kind">{{ kindLabel(record.kind) }}</span>
          <code class="recd__meta-key" :title="idParam">{{ idParam }}</code>
        </div>
        <div v-for="row in metaRowsOfRecord" :key="row.k" class="recd__kv">
          <span class="recd__k">{{ row.k }}</span>
          <span class="recd__v">{{ row.v }}</span>
        </div>
      </section>
      <p v-else class="recd__note" data-testid="record-no-record">索引中未找到对应记录体（可能已被 14 天窗口裁剪）。</p>

      <!-- delegate：result JSON 摘要 + logTail -->
      <template v-if="kind === 'delegate' && delegate">
        <section class="recd__card" data-testid="record-result">
          <h3 class="recd__h">结果摘要</h3>
          <pre v-if="resultJson" class="recd__json">{{ resultJson }}</pre>
          <p v-else class="recd__empty">没有结果数据（失败/被阻止的执行通常无 result）。</p>
        </section>
        <section class="recd__card" data-testid="record-logtail">
          <h3 class="recd__h">日志尾部 <span class="recd__h-n">共 {{ formatLogBytes(delegate.logBytes) }}</span></h3>
          <pre v-if="delegate.logTail.length" class="recd__log">{{ delegate.logTail.join('\n') }}</pre>
          <p v-else class="recd__empty">没有日志尾部可读。</p>
        </section>
      </template>

      <!-- coding-run：session 元数据 + usage + changes 表 -->
      <template v-else-if="kind === 'coding-run' && coding">
        <section class="recd__card" data-testid="record-session">
          <h3 class="recd__h">会话元数据</h3>
          <p v-if="!sessionRows.length" class="recd__empty">会话元数据不可用（会话文件缺席或已被清理）。</p>
          <div v-for="row in sessionRows" :key="row.k" class="recd__kv">
            <span class="recd__k">{{ row.k }}</span>
            <span class="recd__v">{{ row.v }}</span>
          </div>
        </section>
        <section class="recd__card" data-testid="record-usage">
          <h3 class="recd__h">用量</h3>
          <p v-if="!usageRows.length" class="recd__empty">没有用量数据。</p>
          <div v-for="row in usageRows" :key="row.k" class="recd__kv">
            <span class="recd__k">{{ row.k }}</span>
            <span class="recd__v">{{ row.v }}</span>
          </div>
        </section>
        <section class="recd__card" data-testid="record-changes">
          <h3 class="recd__h">代码变更 <span class="recd__h-n">{{ changes.length }}</span></h3>
          <p v-if="!changes.length" class="recd__empty">本会话没有变更记录。</p>
          <div v-else class="recd__table-wrap">
            <table class="recd__table">
              <thead>
                <tr>
                  <th>变更</th>
                  <th>开始</th>
                  <th>结束</th>
                  <th>文件数</th>
                  <th>+增</th>
                  <th>-删</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="c in changes" :key="`${c.run_id}:${c.change_id}`" :data-testid="`record-change-${c.change_id}`">
                  <td>
                    <div class="recd__change-id" :title="c.change_id">{{ c.change_id }}</div>
                    <div class="recd__change-run" :title="c.run_id">{{ c.run_id }}</div>
                  </td>
                  <td class="recd__ts">{{ changeTime(c.started_at) }}</td>
                  <td class="recd__ts">{{ changeTime(c.finished_at) }}</td>
                  <td class="recd__num">{{ c.files_changed ?? '—' }}</td>
                  <td class="recd__num recd__num--add">{{ c.additions ?? '—' }}</td>
                  <td class="recd__num recd__num--del">{{ c.deletions ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped lang="scss">
.recd { display: flex; flex-direction: column; gap: 12px; height: 100%; padding: 14px 16px; overflow: hidden; }
.recd__head { display: flex; align-items: center; gap: 12px; }
.recd__title { margin: 0; font-size: 15px; }
.recd__actions { margin-left: auto; display: flex; gap: 6px; }
.recd__btn { border: 1px solid var(--border-color); background: transparent; color: inherit; border-radius: 4px; padding: 3px 10px; font: inherit; font-size: 12px; cursor: pointer; &:disabled { opacity: .5; } }
.recd__note { margin: 0; font-size: 12px; color: var(--text-muted); border: 1px dashed var(--border-color); border-radius: 6px; padding: 10px 12px; }
.recd__error { margin: 0; color: var(--ia-fail); font-size: 12px; }
.recd__card { border: 1px solid var(--border-color); border-radius: var(--radius-standard, 8px); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.recd__h { margin: 0; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.recd__h-n { font-size: 11px; color: var(--text-muted); font-weight: 500; }
.recd__meta-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.recd__meta-kind { font-size: 12px; color: var(--text-muted); }
.recd__meta-key { font-family: var(--font-mono, monospace); font-size: 12px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* outcome 徽标配色：success 绿 / failed 红 / timeout 黄 / blocked 灰（token 均已核实存在） */
.recd__badge { font-size: 11px; border-radius: 999px; padding: 1px 8px; border: 1px solid var(--border-color); white-space: nowrap; }
.recd__badge.recd-badge--success { color: var(--ia-fresh); border-color: var(--ia-fresh); }
.recd__badge.recd-badge--failed { color: var(--ia-fail); border-color: var(--ia-fail); }
.recd__badge.recd-badge--timeout { color: var(--ia-stale); border-color: var(--ia-stale); }
.recd__badge.recd-badge--blocked { color: var(--text-muted); border-color: var(--text-muted); }
.recd__kv { display: flex; gap: 10px; align-items: baseline; font-size: 12.5px; }
.recd__k { color: var(--text-muted); min-width: 96px; flex-shrink: 0; }
.recd__v { word-break: break-all; font-family: var(--font-mono, monospace); font-size: 12px; }
.recd__empty { margin: 0; font-size: 12px; color: var(--text-muted); }
.recd__json, .recd__log { margin: 0; max-height: 260px; overflow: auto; font-size: 10.5px; background: var(--bg-secondary, transparent); padding: 8px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; font-family: var(--font-mono, monospace); }
.recd__table-wrap { border: 1px solid var(--border-color); border-radius: 6px; overflow: auto; }
.recd__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.recd__table th { text-align: left; font-weight: 500; color: var(--text-muted); font-size: 11px; padding: 5px 10px; border-bottom: 1px solid var(--border-color); }
.recd__table td { padding: 5px 10px; border-bottom: 1px solid var(--border-color); vertical-align: top; }
.recd__table tr:last-child td { border-bottom: none; }
.recd__change-id { font-family: var(--font-mono, monospace); font-size: 11.5px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recd__change-run { font-family: var(--font-mono, monospace); font-size: 10.5px; color: var(--text-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recd__ts { white-space: nowrap; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.recd__num { font-variant-numeric: tabular-nums; text-align: right; }
.recd__num--add { color: var(--ia-fresh); }
.recd__num--del { color: var(--ia-fail); }
</style>
