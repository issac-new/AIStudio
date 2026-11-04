<!-- overlay/custom/client/ia2/views/records/RecordsListView.vue
     执行记录列表（AgentTeams 吸收批二）：编码 CLI run 与 delegate 通道的统一
     留痕查询面。首屏回答：最近谁跑了什么、结果如何、为什么失败；筛选条四值
     （kind/outcome/agent/task）+ offset 分页；行内任务/会话键链接到对应详情。
     数据源=/api/execution-records（只读，旁路观测面）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import IaBreadcrumb from '../../components/IaBreadcrumb.vue'
import { listExecutionRecords, type ExecutionRecord } from '../../api/execution-records'
import {
  detailRouteOf, formatDurationLabel, formatRecordTime, kindLabel,
  outcomeBadgeClass, outcomeLabel, paginationState,
} from '../../utils/records'

const router = useRouter()

/** 页大小取服务端默认档（50）；序列化时限值恒下发，URL 可核对 */
const PAGE_SIZE = 50

const KIND_OPTIONS = [
  { value: '', label: '全部类型' },
  { value: 'coding-run', label: '编码运行' },
  { value: 'delegate', label: '委托通道' },
]
const OUTCOME_OPTIONS = [
  { value: '', label: '全部结果' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'timeout', label: '超时' },
  { value: 'blocked', label: '被阻止' },
]

const filters = ref({ kind: '', outcome: '', agent: '', task: '' })
const offset = ref(0)
const records = ref<ExecutionRecord[]>([])
const total = ref(0)
const hasMore = ref(false)
const loading = ref(false)
const loadError = ref('')

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const r = await listExecutionRecords(filters.value, { limit: PAGE_SIZE, offset: offset.value })
    records.value = r.records
    total.value = r.total
    hasMore.value = r.hasMore
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

/** 筛选变化回第一页（下拉即时生效；文本框回车/点筛选按钮生效） */
function applyFilters(): void {
  offset.value = 0
  void load()
}
function resetFilters(): void {
  filters.value = { kind: '', outcome: '', agent: '', task: '' }
  applyFilters()
}
function prevPage(): void {
  offset.value = Math.max(0, offset.value - PAGE_SIZE)
  void load()
}
function nextPage(): void {
  if (!hasMore.value) return
  offset.value += PAGE_SIZE
  void load()
}

watch(() => [filters.value.kind, filters.value.outcome], () => { applyFilters() })

const page = computed(() => paginationState(offset.value, PAGE_SIZE, hasMore.value))

/** 行定位键：delegate=taskId、coding-run=sessionId（缺席则不造死链） */
function rowKeyLabel(rec: ExecutionRecord): string {
  return rec.taskId ?? rec.sessionId ?? rec.runId
}
function openDetail(rec: ExecutionRecord): void {
  const target = detailRouteOf(rec)
  if (target) void router.push(target)
}

onMounted(() => { void load() })
</script>

<template>
  <div class="recl" data-testid="records-list">
    <IaBreadcrumb />
    <header class="recl__head">
      <div>
        <h2 class="recl__title">执行记录</h2>
        <p class="recl__sub">编码 CLI 运行与委托通道的统一留痕（索引保留近 14 天）；每个退出路径都有记录，被拒绝的尝试也在列。</p>
      </div>
      <button type="button" class="recl__btn" data-testid="records-refresh" :disabled="loading" @click="load">
        {{ loading ? '读取中…' : '刷新' }}
      </button>
    </header>

    <section class="recl__filters" data-testid="records-filters">
      <label class="recl__field">类型
        <select v-model="filters.kind" data-testid="records-filter-kind">
          <option v-for="o in KIND_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>
      <label class="recl__field">结果
        <select v-model="filters.outcome" data-testid="records-filter-outcome">
          <option v-for="o in OUTCOME_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>
      <label class="recl__field">代理
        <input v-model="filters.agent" data-testid="records-filter-agent" placeholder="agentId 包含" @keyup.enter="applyFilters" />
      </label>
      <label class="recl__field">任务
        <input v-model="filters.task" data-testid="records-filter-task" placeholder="taskId 包含" @keyup.enter="applyFilters" />
      </label>
      <div class="recl__filter-actions">
        <button type="button" class="recl__btn recl__btn--primary" data-testid="records-filter-apply" :disabled="loading" @click="applyFilters">筛选</button>
        <button type="button" class="recl__btn" data-testid="records-filter-reset" :disabled="loading" @click="resetFilters">重置</button>
      </div>
    </section>

    <p v-if="loadError" class="recl__error" data-testid="records-error" :title="loadError">{{ loadError }}</p>

    <p v-else-if="loading && !records.length" class="recl__hint" data-testid="records-loading">读取中…</p>

    <div v-else-if="!records.length" class="recl__empty" data-testid="records-empty">
      <p class="recl__empty-title">没有匹配的执行记录</p>
      <p class="recl__empty-sub">放宽筛选条件，或等下一次编码运行/委托执行产生留痕。</p>
    </div>

    <div v-else class="recl__table-wrap" data-testid="records-table">
      <table class="recl__table">
        <thead>
          <tr>
            <th>开始时间</th>
            <th>类型</th>
            <th>CLI · 代理</th>
            <th>结果</th>
            <th>exitCode</th>
            <th>原因</th>
            <th>任务 / 会话</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="rec in records" :key="rec.runId" class="recl__row" :data-testid="`records-row-${rec.runId}`">
            <td class="recl__ts" :title="`开始 ${formatRecordTime(rec.startedAt)} · 结束 ${formatRecordTime(rec.endedAt)} · 耗时 ${formatDurationLabel(rec.startedAt, rec.endedAt)}`">
              {{ formatRecordTime(rec.startedAt) }}
            </td>
            <td>{{ kindLabel(rec.kind) }}</td>
            <td class="recl__who">{{ [rec.cli, rec.agentId].filter(Boolean).join(' · ') || '—' }}</td>
            <td><span class="recl__badge" :class="outcomeBadgeClass(rec.outcome)" :data-testid="`records-outcome-${rec.runId}`">{{ outcomeLabel(rec.outcome) }}</span></td>
            <td class="recl__num">{{ rec.exitCode ?? '—' }}</td>
            <td class="recl__reason" :title="rec.reason ?? ''">{{ rec.reason || '—' }}</td>
            <td>
              <button v-if="detailRouteOf(rec)" type="button" class="recl__link" :data-testid="`records-detail-link-${rec.runId}`" :title="rowKeyLabel(rec)" @click="openDetail(rec)">
                {{ rowKeyLabel(rec) }}
              </button>
              <span v-else class="recl__hint" :title="rec.runId">{{ rowKeyLabel(rec) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer v-if="records.length || page.pageNo > 1" class="recl__pager" data-testid="records-pager">
      <span class="recl__hint">共 {{ total }} 条 · 第 {{ page.pageNo }} 页</span>
      <div class="recl__pager-actions">
        <button type="button" class="recl__btn" data-testid="records-prev-page" :disabled="page.prevDisabled || loading" @click="prevPage">上一页</button>
        <button type="button" class="recl__btn" data-testid="records-next-page" :disabled="page.nextDisabled || loading" @click="nextPage">下一页</button>
      </div>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.recl { display: flex; flex-direction: column; gap: 12px; height: 100%; padding: 14px 16px; overflow: hidden; }
.recl__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.recl__title { margin: 0; font-size: 15px; }
.recl__sub { margin: 2px 0 0; font-size: 12px; color: var(--text-muted); }
.recl__filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; }
.recl__field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--text-muted); }
.recl__field select, .recl__field input {
  border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px;
  font-family: inherit; font-size: 12px; background: transparent; color: var(--text-primary);
}
.recl__field input { font-family: var(--font-mono, monospace); min-width: 140px; }
.recl__filter-actions { display: flex; gap: 6px; margin-left: auto; }
.recl__btn {
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
  border-radius: 6px; padding: 4px 12px; font-family: inherit; font-size: 12px; cursor: pointer;
}
.recl__btn--primary { border-color: var(--accent-primary); color: var(--accent-primary); }
.recl__btn:hover:not(:disabled) { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
.recl__btn:disabled { opacity: .55; cursor: default; }
.recl__error { margin: 0; color: var(--ia-fail); font-size: 12px; }
.recl__hint { margin: 0; font-size: 12px; color: var(--text-muted); }
.recl__empty { border: 1px dashed var(--border-color); border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 6px; }
.recl__empty-title { margin: 0; font-size: 14px; font-weight: 600; }
.recl__empty-sub { margin: 0; font-size: 12px; color: var(--text-muted); }
.recl__table-wrap { border: 1px solid var(--border-color); border-radius: 8px; overflow: auto; }
.recl__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.recl__table th {
  text-align: left; font-weight: 500; color: var(--text-muted); font-size: 11px;
  padding: 6px 10px; border-bottom: 1px solid var(--border-color); position: sticky; top: 0; background: var(--bg-secondary, inherit);
}
.recl__row td { padding: 6px 10px; border-bottom: 1px solid var(--border-color); vertical-align: top; }
.recl__row:last-child td { border-bottom: none; }
.recl__ts { white-space: nowrap; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.recl__who { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recl__num { font-variant-numeric: tabular-nums; }
.recl__reason { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.recl__link {
  border: none; background: transparent; color: var(--accent-info, var(--accent-primary)); cursor: pointer; padding: 0;
  font-family: var(--font-mono, monospace); font-size: 11.5px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.recl__link:hover { text-decoration: underline; text-underline-offset: 3px; }
/* outcome 徽标配色：success 绿 / failed 红 / timeout 黄 / blocked 灰（token 均已核实存在） */
.recl__badge { font-size: 11px; border-radius: 999px; padding: 1px 8px; border: 1px solid var(--border-color); white-space: nowrap; }
.recl__badge.recl-badge--success { color: var(--ia-fresh); border-color: var(--ia-fresh); }
.recl__badge.recl-badge--failed { color: var(--ia-fail); border-color: var(--ia-fail); }
.recl__badge.recl-badge--timeout { color: var(--ia-stale); border-color: var(--ia-stale); }
.recl__badge.recl-badge--blocked { color: var(--text-muted); border-color: var(--text-muted); }
.recl__pager { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.recl__pager-actions { display: flex; gap: 6px; }
</style>
