<!-- overlay/custom/client/loop/runcenter/views/RunCenterView.vue -->
<!-- RunCenterView — 运行中心视图骨架：工具条（视图 tab/状态筛选/搜索/刷新/连接态）+
     运行列表（行内 peek 展开 + 内联审批）+ 底部分页 + 空态三步引导（R4）+
     介入收件箱（两态，task-7）+ 回放面板（终态 run）。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import { useRunCenterStore } from '@/custom/loop/runcenter/store/runs'
import RunListTable from '@/custom/loop/runcenter/components/RunListTable.vue'
import InboxPanel from '@/custom/loop/runcenter/components/InboxPanel.vue'
import { filterRuns } from '@/custom/loop/runcenter/adapters'
import { formatEventTs } from '@/custom/loop/runcenter/adapters/run-graph'
import type { GraphEventLike, RunAction, RunStatus, RunSummary } from '@/custom/loop/runcenter/types'

const store = useRunCenterStore()
const { t } = useI18n()
const router = useRouter()

// ── 视图 tab（运行列表 / 介入收件箱，task-7）──
const activeTab = ref<'runs' | 'inbox'>('runs')

// ── 工具条状态 ──
const statusFilter = ref<'' | RunStatus>('')
const query = ref('')

const FILTER_OPTIONS: Array<{ value: '' | RunStatus; i18n: string }> = [
  { value: '', i18n: 'runcenter.toolbar.all' },
  { value: 'running', i18n: 'runcenter.status.running' },
  { value: 'awaiting-input', i18n: 'runcenter.status.awaitingInput' },
  { value: 'completed', i18n: 'runcenter.status.completed' },
  { value: 'failed', i18n: 'runcenter.status.failed' },
]

// ── 分页（虚拟滚动后置 P3）──
const PAGE_SIZE = 20
const page = ref(1)
const filteredRuns = computed(() => filterRuns(store.sortedRuns, {
  status: statusFilter.value || undefined,
  query: query.value || undefined,
}))
const totalPages = computed(() => Math.max(1, Math.ceil(filteredRuns.value.length / PAGE_SIZE)))
const pagedRuns = computed(() =>
  filteredRuns.value.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE),
)
watch([statusFilter, query], () => { page.value = 1 })

function prevPage(): void { if (page.value > 1) page.value-- }
function nextPage(): void { if (page.value < totalPages.value) page.value++ }

// ── 生命周期 ──
onMounted(() => { store.fetchRuns() })
onBeforeUnmount(() => { store.disconnect() })

// ── 操作分发（合法操作集 → 现有落点；无落点的动作不出现按钮）──
const actionError = ref<string | null>(null)

/** P2 Task 6：运行详情页（执行图 + 回放），行点击 / detail 动作的统一入口 */
function goRunDetail(run: RunSummary): void {
  router.push({ name: 'hermes.loopRunDetail', params: { runId: run.runId } })
}

// ── 行内 peek 展开（task-7）：approve/peek 动作与行首箭头同一路径，不进详情页 ──
const expandedRunId = ref<string | null>(null)

function togglePeek(runId: string): void {
  expandedRunId.value = expandedRunId.value === runId ? null : runId
}

async function onAction(payload: { kind: RunAction; run: RunSummary }): Promise<void> {
  actionError.value = null
  const { kind, run } = payload
  try {
    switch (kind) {
      case 'approve': // 行内展开审批面板（审批不进详情页，task-7）
      case 'peek':
        togglePeek(run.runId)
        break
      case 'detail':
        goRunDetail(run)
        break
      case 'fork':
        await store.forkRun(run.runId)
        break
      case 'replay':
        replayVisible.value = true
        await store.fetchReplay(run.runId)
        break
    }
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e)
  }
}

// ── 回放面板 ──
const replayVisible = ref(false)
function closeReplay(): void { replayVisible.value = false }

// 回放端点（GET /replay）返回日志词汇：事件名在 kind、ts 为 epoch ms；
// socket 词汇（type / ISO ts / step）兼容保留——双词汇读取对照 run-graph.ts 词汇归一表
function replayLine(e: GraphEventLike): string {
  const kind = e.kind ?? e.type ?? ''
  const step = e.superStep ?? e.step
  return `${kind}${typeof step === 'number' ? ` @${step}` : ''}`
}

// 时间标签走 formatEventTs（epoch ms / ISO 通吃，归一逻辑同 eventTsMs；非法落 —）
function replayTime(e: GraphEventLike): string {
  return formatEventTs(e.ts)
}
</script>

<template>
  <div class="rc-view">
    <!-- 顶部工具条 -->
    <div class="rc-view__toolbar">
      <h2 class="rc-view__title">{{ t('runcenter.title') }}</h2>

      <div class="rc-view__tabs">
        <button
          class="rc-view__tab"
          :class="{ 'rc-view__tab--active': activeTab === 'runs' }"
          @click="activeTab = 'runs'"
        >
          {{ t('runcenter.tab.runs') }}
        </button>
        <button
          class="rc-view__tab"
          :class="{ 'rc-view__tab--active': activeTab === 'inbox' }"
          @click="activeTab = 'inbox'"
        >
          {{ t('runcenter.tab.inbox') }}
          <span v-if="store.awaitingCount > 0" class="rc-view__tab-count">{{ store.awaitingCount }}</span>
        </button>
      </div>

      <span class="rc-view__connection" :class="`rc-view__connection--${store.connection}`">
        <span class="rc-view__connection-dot" aria-hidden="true" />
        {{ t(`runcenter.connection.${store.connection}`) }}
      </span>

      <div v-if="activeTab === 'runs'" class="rc-view__filters">
        <button
          v-for="opt in FILTER_OPTIONS"
          :key="opt.value"
          class="rc-view__filter"
          :class="{ 'rc-view__filter--active': statusFilter === opt.value }"
          @click="statusFilter = opt.value"
        >
          {{ t(opt.i18n) }}
        </button>
      </div>

      <input
        v-if="activeTab === 'runs'"
        v-model="query"
        class="rc-view__search"
        type="search"
        :placeholder="t('runcenter.toolbar.searchPlaceholder')"
      >

      <button class="rc-view__refresh" :title="t('runcenter.toolbar.refresh')" @click="store.fetchRuns()">
        <CockpitIcon name="refresh" :size="13" />
      </button>
    </div>

    <div v-if="store.error" class="rc-view__error">{{ store.error }}</div>
    <div v-if="actionError" class="rc-view__error">{{ actionError }}</div>

    <!-- 介入收件箱（两态，task-7） -->
    <InboxPanel
      v-if="activeTab === 'inbox'"
      :pending="store.pendingInboxRuns"
      :archived="store.archivedInboxRuns"
      @archive="(r: RunSummary) => store.archiveRun(r.runId)"
      @unarchive="(r: RunSummary) => store.unarchiveRun(r.runId)"
      @detail="goRunDetail"
    />

    <!-- 空态三步引导（R4：选模板 → 设节奏 → 跑起来） -->
    <div v-else-if="!store.loading && store.runs.length === 0" class="rc-view__onboarding">
      <h3>{{ t('runcenter.empty.title') }}</h3>
      <div class="rc-view__steps">
        <div class="rc-view__step">
          <span class="rc-view__step-num">1</span>
          <strong>{{ t('runcenter.empty.step1Title') }}</strong>
          <p>{{ t('runcenter.empty.step1Desc') }}</p>
        </div>
        <div class="rc-view__step">
          <span class="rc-view__step-num">2</span>
          <strong>{{ t('runcenter.empty.step2Title') }}</strong>
          <p>{{ t('runcenter.empty.step2Desc') }}</p>
        </div>
        <div class="rc-view__step">
          <span class="rc-view__step-num">3</span>
          <strong>{{ t('runcenter.empty.step3Title') }}</strong>
          <p>{{ t('runcenter.empty.step3Desc') }}</p>
        </div>
      </div>
      <button class="rc-view__cta" @click="router.push({ name: 'hermes.loop' })">
        {{ t('runcenter.empty.cta') }}
      </button>
    </div>

    <!-- 列表 -->
    <template v-else>
      <RunListTable
        :runs="pagedRuns"
        :loading="store.loading"
        :expanded-run-id="expandedRunId"
        @select="goRunDetail"
        @action="onAction"
      />

      <!-- 底部分页 -->
      <div v-if="totalPages > 1" class="rc-view__pager">
        <button :disabled="page <= 1" @click="prevPage">{{ t('runcenter.pager.prev') }}</button>
        <span>{{ t('runcenter.pager.page', { page, pages: totalPages }) }}</span>
        <button :disabled="page >= totalPages" @click="nextPage">{{ t('runcenter.pager.next') }}</button>
      </div>
    </template>

    <!-- 回放面板（终态 run 的完整事件序列） -->
    <div v-if="replayVisible" class="rc-view__overlay" @click.self="closeReplay">
      <div class="rc-view__replay">
        <div class="rc-view__replay-head">
          <strong>{{ t('runcenter.replay.title') }}</strong>
          <span class="rc-view__replay-count">{{ t('runcenter.replay.count', { n: store.replayEvents.length }) }}</span>
          <button class="rc-view__replay-close" :title="t('runcenter.replay.close')" @click="closeReplay">
            <CockpitIcon name="close" :size="13" />
          </button>
        </div>
        <div class="rc-view__replay-body">
          <div v-if="store.replayLoading" class="rc-view__replay-empty">{{ t('runcenter.replay.loading') }}</div>
          <div v-else-if="store.replayEvents.length === 0" class="rc-view__replay-empty">{{ t('runcenter.replay.empty') }}</div>
          <div v-for="(e, i) in store.replayEvents" v-else :key="i" class="rc-view__replay-line">
            <span class="rc-view__replay-ts">{{ replayTime(e) }}</span>
            <span class="rc-view__replay-type">{{ replayLine(e) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rc-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  overflow: auto;
  gap: 12px;
}

.rc-view__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.rc-view__title { margin: 0; font-size: 16px; }

/* 视图 tab（运行列表 / 介入收件箱） */
.rc-view__tabs { display: flex; gap: 4px; }
.rc-view__tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.rc-view__tab--active {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  background: var(--accent-bg, var(--hover-bg, rgba(127, 127, 127, 0.08)));
}
.rc-view__tab-count {
  padding: 0 6px;
  border-radius: var(--radius-pill, 999px);
  background: var(--color-warning, #f59e0b);
  color: #fff;
  font-size: 11px;
}

.rc-view__connection {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.rc-view__connection-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-pill, 999px);
  background: var(--text-muted, #999);
}
.rc-view__connection--connected .rc-view__connection-dot { background: var(--color-success, #28bf5c); }

.rc-view__filters { display: flex; gap: 4px; }
.rc-view__filter {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.rc-view__filter--active {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  background: var(--accent-bg, var(--hover-bg, rgba(127, 127, 127, 0.08)));
}

.rc-view__search {
  flex: 0 1 220px;
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  font-size: 12px;
}
.rc-view__refresh {
  display: inline-flex;
  align-items: center;
  padding: 5px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.rc-view__error {
  padding: 8px 12px;
  border: 1px solid var(--color-danger, #e11d48);
  border-radius: var(--radius-micro, 3px);
  color: var(--color-danger, #e11d48);
  font-size: 12px;
}

/* 空态三步引导 */
.rc-view__onboarding {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: 48px 16px;
  text-align: center;
}
.rc-view__onboarding h3 { margin: 0; font-size: 15px; }
.rc-view__steps { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
.rc-view__step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  max-width: 220px;
}
.rc-view__step-num {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-pill, 999px);
  font-size: 12px;
}
.rc-view__step strong { font-size: 13px; }
.rc-view__step p {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  line-height: 1.5;
}
.rc-view__cta {
  padding: 8px 20px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background: var(--color-primary, #3b82f6);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
}

.rc-view__pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.rc-view__pager button {
  padding: 4px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.rc-view__pager button:disabled { opacity: 0.4; cursor: default; }

/* 回放面板 */
.rc-view__overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}
.rc-view__replay {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, 90vw);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, var(--color-bg-primary, #fff));
  border: 1px solid var(--border-color);
  border-radius: var(--radius-large, 12px);
  z-index: 1001;
  overflow: hidden;
}
.rc-view__replay-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}
.rc-view__replay-count {
  flex: 1;
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.rc-view__replay-close {
  display: inline-flex;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.rc-view__replay-body {
  overflow: auto;
  padding: 8px 16px;
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
}
.rc-view__replay-empty { padding: 24px 0; text-align: center; font-family: inherit; color: var(--text-muted, #999); }
.rc-view__replay-line {
  display: flex;
  gap: 12px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--border-color);
}
.rc-view__replay-ts { color: var(--text-muted, var(--color-text-secondary, #878c99)); flex: 0 0 64px; }
</style>
