<!-- overlay/custom/client/ia2/components/TriageQueue.vue -->
<!-- Triage 分诊队列（P3 Task 5，§7B.4 Linear 模式）：两视图——
     「今日待分诊」（默认，等待时长×严重度序，projectTriage 产出）与「已分诊」
     （今日手动标记 + 未衰减自动归档）。审批条目行内展开内嵌 runcenter
     ApprovalPanel（复用不复制：run 对象由 runs prop 提供，批准/拒绝走
     runs store 既有 resumeRun——REST 成功即离场，视图层记档后条目流转）。
     组件薄壳：数据与分诊动作由父层（InboxView）注入，本组件只展示与转发事件。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import RunStageBadge from '@/custom/loop/runcenter/components/RunStageBadge.vue'
import ApprovalPanel from '@/custom/loop/runcenter/components/ApprovalPanel.vue'
import { formatDurationMs } from '@/custom/loop/runcenter/adapters/intervention'
import type { RunSummary } from '@/custom/loop/runcenter/types'
import type { TriageEntry, TriageKind, TriageProjection } from '../adapters/inbox-center'

const props = defineProps<{
  /** 今日待分诊（已排序） */
  pending: TriageEntry[]
  /** 已分诊（triaged = 今日手动；archived = 自动归档快照） */
  done: TriageProjection['done']
  /** awaiting RunSummary 集（审批行内联 ApprovalPanel 的 run 数据源） */
  runs: RunSummary[]
}>()

const emit = defineEmits<{
  (e: 'triage', entry: TriageEntry): void
  (e: 'untriage', entry: TriageEntry): void
  (e: 'open', entry: TriageEntry): void
}>()

const { t } = useI18n()

type Tab = 'pending' | 'done'
const tab = ref<Tab>('pending')
const expandedId = ref<string | null>(null)

const rows = computed<TriageEntry[]>(() => (tab.value === 'pending' ? props.pending : props.done.map(d => d.entry)))

/** done 行的来源徽标（pending 恒 null） */
function originOf(id: string): 'triaged' | 'archived' | null {
  if (tab.value !== 'done') return null
  return props.done.find(d => d.entry.id === id)?.origin ?? null
}

/** 审批条目 → 内联审批面板的 run（不在 awaiting 集/非审批 → null 不展开） */
function runFor(entry: TriageEntry): RunSummary | null {
  if (entry.kind !== 'approval' || !entry.runId) return null
  return props.runs.find(r => r.runId === entry.runId) ?? null
}

function toggleExpand(entry: TriageEntry): void {
  if (!runFor(entry)) return
  expandedId.value = expandedId.value === entry.id ? null : entry.id
}

function waitLabel(entry: TriageEntry): string {
  return entry.waitMs > 0 ? formatDurationMs(entry.waitMs) : '—'
}

function kindLabel(kind: TriageKind): string {
  return t(`ia2.inbox.kind.${kind}`)
}
</script>

<template>
  <div class="tq-panel" data-triage-queue>
    <div class="tq-panel__tabs">
      <button
        class="tq-panel__tab"
        :class="{ 'tq-panel__tab--active': tab === 'pending' }"
        @click="tab = 'pending'"
      >
        {{ t('ia2.inbox.tabPending') }}
        <span v-if="pending.length > 0" class="tq-panel__count">{{ pending.length }}</span>
      </button>
      <button
        class="tq-panel__tab"
        :class="{ 'tq-panel__tab--active': tab === 'done' }"
        @click="tab = 'done'"
      >
        {{ t('ia2.inbox.tabDone') }}
        <span v-if="done.length > 0" class="tq-panel__count">{{ done.length }}</span>
      </button>
    </div>

    <!-- 空态：两 tab 各自文案 -->
    <div v-if="rows.length === 0" class="tq-panel__empty">
      <p>{{ t(tab === 'pending' ? 'ia2.inbox.emptyPending' : 'ia2.inbox.emptyDone') }}</p>
      <p class="tq-panel__empty-hint">
        {{ t(tab === 'pending' ? 'ia2.inbox.emptyPendingHint' : 'ia2.inbox.emptyDoneHint') }}
      </p>
    </div>

    <template v-else>
      <template v-for="entry in rows" :key="entry.id">
        <div class="tq-row" :class="[`tq-row--${entry.kind}`, { 'tq-row--expanded': expandedId === entry.id }]">
          <span class="tq-row__bar" aria-hidden="true" />
          <button
            v-if="runFor(entry)"
            class="tq-row__expand"
            :title="t('ia2.inbox.expand')"
            @click.stop="toggleExpand(entry)"
          >
            <span class="tq-row__chevron" :class="{ 'tq-row__chevron--open': expandedId === entry.id }" aria-hidden="true" />
          </button>
          <span v-else class="tq-row__expand-spacer" aria-hidden="true" />

          <span class="tq-row__main" @click="emit('open', entry)">
            <span class="tq-row__title-line">
              <span class="tq-row__kind">{{ kindLabel(entry.kind) }}</span>
              <span class="tq-row__title">{{ entry.title }}</span>
              <span v-if="entry.subtitle" class="tq-row__subtitle">{{ entry.subtitle }}</span>
              <span v-if="originOf(entry.id)" class="tq-row__origin">
                {{ t(originOf(entry.id) === 'archived' ? 'ia2.inbox.originArchived' : 'ia2.inbox.originTriaged') }}
              </span>
            </span>
          </span>

          <!-- 审批行：状态徽标占位与 runcenter 收件箱同语言 -->
          <RunStageBadge v-if="runFor(entry)" :status="runFor(entry)!.status" />

          <span class="tq-row__wait" :title="t('ia2.inbox.wait')">{{ waitLabel(entry) }}</span>

          <span class="tq-row__actions">
            <button class="tq-row__action" :title="t('ia2.inbox.open')" @click.stop="emit('open', entry)">
              {{ t('ia2.inbox.open') }}
            </button>
            <button
              v-if="tab === 'pending'"
              class="tq-row__action tq-row__action--triage"
              @click.stop="emit('triage', entry)"
            >
              {{ t('ia2.inbox.triage') }}
            </button>
            <button
              v-else-if="originOf(entry.id) === 'triaged'"
              class="tq-row__action"
              @click.stop="emit('untriage', entry)"
            >
              {{ t('ia2.inbox.untriage') }}
            </button>
          </span>
        </div>

        <!-- 行内展开：审批面板（就地审批，批准后条目随 run 离场自动流转） -->
        <div v-if="expandedId === entry.id && runFor(entry)" class="tq-row__peek" @click.stop>
          <ApprovalPanel :run="runFor(entry)!" />
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.tq-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.tq-panel__tabs { display: flex; gap: 4px; }
.tq-panel__tab {
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
.tq-panel__tab--active {
  border-color: var(--primary-color, var(--accent-primary, #3b82f6));
  background: var(--bg-hover, var(--bg-secondary, rgba(127, 127, 127, 0.08)));
}
.tq-panel__count {
  padding: 0 6px;
  border-radius: var(--radius-pill, 999px);
  background: var(--color-warning, #f59e0b);
  color: var(--color-on-accent, #fff);
  font-size: 11px;
}
.tq-panel__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
}
.tq-panel__empty p { margin: 0 0 6px; }
.tq-panel__empty-hint { font-size: 12px; opacity: 0.8; }

.tq-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-micro, 3px);
  background: var(--bg-card);
}
.tq-row:hover,
.tq-row--expanded {
  background: var(--bg-hover, var(--bg-secondary, rgba(127, 127, 127, 0.08)));
}
.tq-row__bar {
  flex: 0 0 3px;
  height: 16px;
  border-radius: 3px;
  background: var(--text-muted, var(--border-color));
}
.tq-row--approval .tq-row__bar,
.tq-row--blocked .tq-row__bar { background: var(--error, var(--color-danger, #e11d48)); }
.tq-row--review .tq-row__bar,
.tq-row--alarm .tq-row__bar { background: var(--warning, var(--color-warning, #f59e0b)); }
.tq-row--reminder .tq-row__bar { background: var(--text-muted, var(--color-text-secondary, #878c99)); }

.tq-row__expand {
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
.tq-row__expand-spacer { flex: 0 0 20px; }
.tq-row__chevron {
  display: inline-block;
  border-left: 4px solid currentColor;
  border-bottom: 4px solid transparent;
  border-top: 4px solid transparent;
  transition: transform 0.15s ease;
}
.tq-row__chevron--open { transform: rotate(90deg); }

.tq-row__main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.tq-row__title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.tq-row__kind {
  flex-shrink: 0;
  font-size: 10px;
  padding: 0 6px;
  border-radius: 3px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
}
.tq-row__title {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tq-row__subtitle {
  font-size: 11px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-family: var(--font-mono, ui-monospace, monospace);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tq-row__origin {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  border: 1px solid var(--border-color);
  border-radius: 3px;
  padding: 0 5px;
}
.tq-row__wait {
  flex: 0 0 88px;
  font-size: 12px;
  color: var(--text-muted, var(--color-text-secondary, #878c99));
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.tq-row__actions { display: flex; gap: 4px; }
.tq-row__action {
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
.tq-row__action:hover {
  background: var(--bg-hover, var(--bg-secondary, rgba(127, 127, 127, 0.08)));
}
.tq-row__action--triage {
  border-color: var(--primary-color, var(--accent-primary, #3b82f6));
  color: var(--primary-color, var(--accent-primary, #3b82f6));
}
.tq-row__peek { padding: 4px 2px 8px 40px; }
</style>
