<!-- overlay/custom/loop/runcenter/components/InboxPanel.vue -->
<!-- InboxPanel — 介入收件箱两态（task-7，§7B.1）：awaiting-input runs 分
     "待处理 / 已归档" 两个 tab。归档仅本地 kv 标记（store.archiveRun，不改 run 状态）；
     run 在服务端恢复后自动退出两态列表（都以 awaiting 为域）。
     行内展开内嵌 ApprovalPanel（审批不进详情页）；空态文案两 tab 各自独立。
     组件薄壳：数据与归档动作由父层（RunCenterView）注入，本组件只展示与转发事件。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import CockpitIcon from '@/custom/cockpit/components/CockpitIcon.vue'
import RunStageBadge from './RunStageBadge.vue'
import ApprovalPanel from './ApprovalPanel.vue'
import { relativeTime } from '../adapters'
import type { RunSummary } from '../types'

const props = defineProps<{
  /** 待处理：awaiting-input 且未归档 */
  pending: RunSummary[]
  /** 已归档：awaiting-input 且本地 kv 打标 */
  archived: RunSummary[]
}>()

const emit = defineEmits<{
  (e: 'archive', run: RunSummary): void
  (e: 'unarchive', run: RunSummary): void
  (e: 'detail', run: RunSummary): void
}>()

const { t } = useI18n()

type Tab = 'pending' | 'archived'
const tab = ref<Tab>('pending')
const expandedRunId = ref<string | null>(null)

const rows = computed<RunSummary[]>(() => (tab.value === 'pending' ? props.pending : props.archived))

function toggleExpand(runId: string): void {
  expandedRunId.value = expandedRunId.value === runId ? null : runId
}

function waitingLabel(run: RunSummary): string {
  const rt = relativeTime(run.lastActivityAt)
  return rt ? t(`runcenter.time.${rt.key}`, { n: rt.n ?? 0 }) : '—'
}
</script>

<template>
  <div class="ib-panel" data-inbox-panel>
    <div class="ib-panel__tabs">
      <button
        class="ib-panel__tab"
        :class="{ 'ib-panel__tab--active': tab === 'pending' }"
        @click="tab = 'pending'"
      >
        {{ t('runcenter.inbox.pending') }}
        <span v-if="pending.length > 0" class="ib-panel__count">{{ pending.length }}</span>
      </button>
      <button
        class="ib-panel__tab"
        :class="{ 'ib-panel__tab--active': tab === 'archived' }"
        @click="tab = 'archived'"
      >
        {{ t('runcenter.inbox.archived') }}
        <span v-if="archived.length > 0" class="ib-panel__count">{{ archived.length }}</span>
      </button>
    </div>

    <!-- 空态：两 tab 各自文案 -->
    <div v-if="rows.length === 0" class="ib-panel__empty">
      <p>{{ t(tab === 'pending' ? 'runcenter.inbox.empty' : 'runcenter.inbox.archivedEmpty') }}</p>
      <p class="ib-panel__empty-hint">
        {{ t(tab === 'pending' ? 'runcenter.inbox.emptyHint' : 'runcenter.inbox.archivedEmptyHint') }}
      </p>
    </div>

    <template v-else>
      <template v-for="run in rows" :key="run.runId">
        <div class="ib-row" :class="{ 'ib-row--expanded': expandedRunId === run.runId }">
          <button
            class="ib-row__expand"
            :title="t('runcenter.inbox.expand')"
            @click="toggleExpand(run.runId)"
          >
            <span class="ib-row__chevron" :class="{ 'ib-row__chevron--open': expandedRunId === run.runId }" aria-hidden="true" />
          </button>
          <span class="ib-row__main" @click="toggleExpand(run.runId)">
            <span class="ib-row__run-id">{{ run.runId }}</span>
            <span class="ib-row__graph-id">{{ run.graphId }}</span>
          </span>
          <RunStageBadge :status="run.status" />
          <span class="ib-row__waiting">{{ waitingLabel(run) }}</span>
          <span class="ib-row__actions">
            <button
              class="ib-row__detail"
              :title="t('runcenter.actions.detail')"
              @click="emit('detail', run)"
            >
              <CockpitIcon name="file" :size="11" />
              <span>{{ t('runcenter.actions.detail') }}</span>
            </button>
            <button
              v-if="tab === 'pending'"
              class="ib-row__archive"
              :title="t('runcenter.inbox.archive')"
              @click="emit('archive', run)"
            >
              {{ t('runcenter.inbox.archive') }}
            </button>
            <button
              v-else
              class="ib-row__archive"
              :title="t('runcenter.inbox.unarchive')"
              @click="emit('unarchive', run)"
            >
              {{ t('runcenter.inbox.unarchive') }}
            </button>
          </span>
        </div>

        <!-- 行内展开：审批面板（内联审批不进详情页） -->
        <div v-if="expandedRunId === run.runId" class="ib-row__peek" @click.stop>
          <ApprovalPanel :run="run" />
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.ib-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.ib-panel__tabs { display: flex; gap: 4px; }
.ib-panel__tab {
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
.ib-panel__tab--active {
  border-color: var(--accent-primary, var(--color-primary, #3b82f6));
  background: var(--accent-bg, var(--hover-bg, rgba(127, 127, 127, 0.08)));
}
.ib-panel__count {
  padding: 0 6px;
  border-radius: var(--radius-pill, 999px);
  background: var(--color-warning, #f59e0b);
  color: #fff;
  font-size: 11px;
}

.ib-panel__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ib-panel__empty p { margin: 0 0 6px; }
.ib-panel__empty-hint { font-size: 12px; opacity: 0.8; }

.ib-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  cursor: pointer;
}
.ib-row:hover,
.ib-row--expanded {
  background: var(--hover-bg, var(--bg-secondary, rgba(127, 127, 127, 0.08)));
}
.ib-row__expand {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
/* CSS 折叠箭头（不依赖图标库） */
.ib-row__chevron {
  display: inline-block;
  border-left: 4px solid currentColor;
  border-bottom: 4px solid transparent;
  border-top: 4px solid transparent;
  transition: transform 0.15s ease;
}
.ib-row__chevron--open { transform: rotate(90deg); }
.ib-row__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.ib-row__run-id {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ib-row__graph-id {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ib-row__waiting {
  flex: 0 0 96px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.ib-row__actions { display: flex; gap: 4px; }
.ib-row__actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  white-space: nowrap;
}
.ib-row__actions button:hover {
  background: var(--hover-bg, var(--bg-secondary, rgba(127, 127, 127, 0.08)));
}
.ib-row__peek { padding: 4px 2px 8px 36px; }
</style>
