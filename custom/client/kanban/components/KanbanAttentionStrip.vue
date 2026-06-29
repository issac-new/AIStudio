<script setup lang="ts">
import { computed } from 'vue'
import { NButton } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import type { KanbanDiagnostic } from '@/api/hermes/kanban'

const props = defineProps<{
  diagnostics: KanbanDiagnostic[]
  expanded?: boolean
}>()

const emit = defineEmits<{
  open: [taskId: string]
  toggle: []
  refresh: []
}>()

const { t } = useI18n()

const topSeverity = computed(() => {
  let top = 'warning'
  for (const d of props.diagnostics) {
    const s = d.diagnostics[0]?.severity || 'warning'
    if (s === 'critical') { top = 'critical'; break }
    if (s === 'error' && top !== 'critical') top = 'error'
  }
  return top
})

const severityClass = computed(() => {
  if (topSeverity.value === 'critical') return 'attention--critical'
  if (topSeverity.value === 'error') return 'attention--error'
  return 'attention--warning'
})

const severityIcon = computed(() => {
  if (topSeverity.value === 'critical') return '!!!'
  if (topSeverity.value === 'error') return '!!'
  return '⚠'
})

function sortedDiagnostics(): KanbanDiagnostic[] {
  const sevIdx = { critical: 3, error: 2, warning: 1 }
  return [...props.diagnostics].sort((a, b) => {
    const aSev = sevIdx[a.diagnostics[0]?.severity || 'warning']
    const bSev = sevIdx[b.diagnostics[0]?.severity || 'warning']
    if (aSev !== bSev) return bSev - aSev
    const aLa = a.diagnostics[0]?.last_seen_at || 0
    const bLa = b.diagnostics[0]?.last_seen_at || 0
    return bLa - aLa
  })
}

function rowSeverityClass(d: KanbanDiagnostic): string {
  const s = d.diagnostics[0]?.severity || 'warning'
  if (s === 'critical') return 'row--critical'
  if (s === 'error') return 'row--error'
  return 'row--warning'
}

function rowSeverityIcon(d: KanbanDiagnostic): string {
  const s = d.diagnostics[0]?.severity || 'warning'
  if (s === 'critical') return '!!!'
  if (s === 'error') return '!!'
  return '⚠'
}

function diagnosticKinds(d: KanbanDiagnostic): string[] {
  return d.diagnostics.map(x => x.kind)
}

const attentionText = computed(() => {
  if (props.diagnostics.length === 1) {
    return t('kanban.taskNeedsAttention')
  }
  return t('kanban.tasksNeedAttention', { n: props.diagnostics.length })
})
</script>

<template>
  <div v-if="diagnostics.length > 0" class="attention-strip" :class="severityClass">
    <div class="attention-bar">
      <span class="attention-icon">{{ severityIcon }}</span>
      <span class="attention-text">{{ attentionText }}</span>
      <NButton size="tiny" text @click="emit('toggle')">
        {{ expanded ? t('common.collapse', 'Hide') : t('common.expand', 'Show') }}
      </NButton>
    </div>

    <div v-if="expanded" class="attention-list">
      <div
        v-for="d in sortedDiagnostics()"
        :key="d.task_id"
        class="attention-row"
        :class="rowSeverityClass(d)"
      >
        <span class="row-sev">{{ rowSeverityIcon(d) }}</span>
        <span class="row-id">{{ d.task_id }}</span>
        <span class="row-title">{{ d.task_title || t('kanban.untitled', '(untitled)') }}</span>
        <span class="row-meta">
          {{ d.task_assignee ? '@' + d.task_assignee : t('kanban.unassigned', 'unassigned') }}
          · {{ diagnosticKinds(d).join(', ') }}
        </span>
        <NButton size="tiny" @click="emit('open', d.task_id)">
          {{ t('common.open') }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.attention-strip {
  border: 1px solid rgba($warning, 0.35);
  background: rgba($warning, 0.06);
  border-radius: $radius-md;
  overflow: hidden;

  &.attention--error {
    border-color: rgba($error, 0.45);
    background: rgba($error, 0.08);
  }

  &.attention--critical {
    border-color: rgba(#ff4d4d, 0.55);
    background: rgba(#ff4d4d, 0.10);
  }
}

.attention-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
}

.attention-icon {
  color: $warning;
  font-size: 14px;
  font-weight: 700;
}

.attention--error .attention-icon { color: $error; }
.attention--critical .attention-icon { color: #ff4d4d; }

.attention-text {
  flex: 1;
  font-weight: 500;
}

.attention-list {
  border-top: 1px solid rgba($warning, 0.2);
  padding: 4px 0;
}

.attention--error .attention-list {
  border-top-color: rgba($error, 0.2);
}

.attention--critical .attention-list {
  border-top-color: rgba(#ff4d4d, 0.2);
}

.attention-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 13px;

  &:hover {
    background: rgba($warning, 0.08);
  }

  &.row--error:hover {
    background: rgba($error, 0.08);
  }

  &.row--critical:hover {
    background: rgba(#ff4d4d, 0.08);
  }
}

.row-sev {
  display: inline-block;
  min-width: 1.5rem;
  font-weight: 600;
  font-size: 12px;
}

.row--warning .row-sev { color: $warning; }
.row--error .row-sev { color: $error; font-weight: 700; }
.row--critical .row-sev { color: #ff4d4d; font-weight: 700; }

.row-id {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 12px;
  color: $text-muted;
  min-width: 7rem;
}

.row-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.row-meta {
  font-size: 12px;
  color: $text-muted;
  white-space: nowrap;
}
</style>
