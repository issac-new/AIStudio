<script setup lang="ts">
import { computed } from 'vue'
import { NCheckbox } from 'naive-ui'
import type { KanbanTask } from '@/api/hermes/kanban'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  task: KanbanTask
  selected?: boolean
  selectedCount?: number
  commentCount?: number
  linkCounts?: { parents: number; children: number }
  progress?: { done: number; total: number } | null
  warnings?: { count: number; highest_severity: string | null } | null
}>()

const emit = defineEmits<{
  click: [taskId: string, multiSelect: boolean, rangeSelect: boolean]
  toggleSelect: [taskId: string]
  dragStart: [taskId: string, event: DragEvent, selectedCount: number]
  dragEnd: [taskId: string, event: DragEvent]
}>()

const { t } = useI18n()

// Card body mirrors the reference plugin's TaskCard exactly: a single
// meta row of badges, the title, and a meta line. There is intentionally
// NO body/result/latest-summary/skills preview on cards — the reference
// keeps cards lean (those live in the drawer).
const needsAssignee = computed(() =>
  props.task.status === 'ready' && !props.task.assignee
)

const progressComplete = computed(() =>
  props.progress && props.progress.total > 0 && props.progress.done >= props.progress.total
)

const warningGlyph = computed(() => {
  const sev = props.warnings?.highest_severity
  if (sev === 'critical') return '!!!'
  if (sev === 'error') return '!!'
  if (sev === 'warning') return '⚠'
  return null
})

const warningClass = computed(() => {
  const sev = props.warnings?.highest_severity
  if (sev === 'critical') return 'warn-critical'
  if (sev === 'error') return 'warn-error'
  if (sev === 'warning') return 'warn-warning'
  return ''
})

// Staleness tiers — amber/red inset rings per status (matches the reference
// STALENESS thresholds + `hermes-kanban-card--stale-*` chrome).
const stalenessClass = computed(() => {
  const status = props.task.status
  const createdAge = (Date.now() / 1000) - props.task.created_at
  const startedAge = props.task.started_at ? (Date.now() / 1000) - props.task.started_at : null

  if (status === 'ready') {
    if (createdAge > 86400) return 'stale-red'
    if (createdAge > 3600) return 'stale-amber'
  } else if (status === 'running') {
    if (startedAge !== null) {
      if (startedAge > 3600) return 'stale-red'
      if (startedAge > 600) return 'stale-amber'
    }
  } else if (status === 'blocked') {
    if (createdAge > 86400) return 'stale-red'
    if (createdAge > 3600) return 'stale-amber'
  } else if (status === 'todo') {
    if (createdAge > 2592000) return 'stale-red' // 30d
    if (createdAge > 604800) return 'stale-amber' // 7d
  }
  return ''
})

const timeAgo = computed(() => {
  const now = Date.now()
  const diff = now - props.task.created_at * 1000
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (days > 0) return t('kanban.card.timeAgo.days', { count: days })
  if (hours > 0) return t('kanban.card.timeAgo.hours', { count: hours })
  if (minutes > 0) return t('kanban.card.timeAgo.minutes', { count: minutes })
  return t('kanban.card.timeAgo.justNow')
})

const totalLinks = computed(() =>
  (props.linkCounts?.parents || 0) + (props.linkCounts?.children || 0)
)

function handleClick(e: MouseEvent) {
  if (e.target instanceof HTMLElement && e.target.closest('.card-checkbox')) return
  const multiSelect = e.ctrlKey || e.metaKey
  const rangeSelect = e.shiftKey
  emit('click', props.task.id, multiSelect, rangeSelect)
}

function handleCheckbox() {
  emit('toggleSelect', props.task.id)
}

function handleDragStart(e: DragEvent) {
  // Multi-card drag ghost: if multiple cards selected and this one is selected,
  // show a ghost with the count
  if (props.selected && props.selectedCount && props.selectedCount > 1) {
    const ghost = document.createElement('div')
    ghost.className = 'kanban-drag-ghost'
    ghost.textContent = `${props.selectedCount} cards`
    ghost.style.cssText = `
      position: fixed;
      top: -1000px;
      left: -1000px;
      padding: 8px 16px;
      background: var(--accent-primary, #333333);
      color: var(--text-on-accent, #ffffff);
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      pointer-events: none;
      z-index: 9999;
      white-space: nowrap;
    `
    document.body.appendChild(ghost)
    e.dataTransfer?.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }
  emit('dragStart', props.task.id, e, props.selectedCount || 1)
}

function handleDragEnd(e: DragEvent) {
  emit('dragEnd', props.task.id, e)
}
</script>

<template>
  <div
    class="kanban-task-card"
    :class="[stalenessClass, { selected }]"
    draggable="true"
    tabindex="0"
    role="button"
    :aria-label="`${task.title} — ${task.id} — ${task.status}`"
    @click="handleClick"
    @keydown.enter="handleClick($event as any)"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
  >
    <div class="card-top-row">
      <NCheckbox
        class="card-checkbox"
        :checked="selected"
        size="small"
        @update:checked="handleCheckbox"
        @click.stop
      />
      <span class="task-id" :title="`Task id: ${task.id}.`">#{{ task.id }}</span>
      <span v-if="warningGlyph" class="warning-badge" :class="warningClass">{{ warningGlyph }}</span>
      <span v-if="task.priority > 0" class="priority-badge" :title="`Priority ${task.priority}.`">
        P{{ task.priority }}
      </span>
      <span v-if="task.tenant" class="tenant-badge" :title="`Tenant: ${task.tenant}.`">
        {{ task.tenant }}
      </span>
      <span
        v-if="progress && progress.total > 0"
        class="progress-badge"
        :class="{ complete: progressComplete }"
        :title="`${progress.done} of ${progress.total} child tasks done`"
      >
        {{ progress.done }}/{{ progress.total }}
      </span>
      <span v-if="needsAssignee" class="needs-assignee-badge">
        {{ t('kanban.card.needsAssignee') }}
      </span>
    </div>

    <div class="card-title">{{ task.title || t('kanban.card.untitled') }}</div>

    <div class="card-meta">
      <span v-if="task.assignee" class="meta-assignee" :title="`Assigned to Hermes profile @${task.assignee}`">
        @{{ task.assignee }}
      </span>
      <span v-else class="meta-unassigned">{{ t('kanban.card.unassigned') }}</span>
      <span
        v-if="commentCount"
        class="meta-count"
        :title="`${commentCount} comment${commentCount === 1 ? '' : 's'} on this task`"
      >
        💬 {{ commentCount }}
      </span>
      <span
        v-if="totalLinks > 0"
        class="meta-count"
        :title="`${linkCounts?.parents || 0} parent(s), ${linkCounts?.children || 0} children.`"
      >
        ↔ {{ totalLinks }}
      </span>
      <span class="meta-time" :title="task.created_at ? `Created ${task.created_at}` : ''">{{ timeAgo }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-task-card {
  background-color: $bg-card;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  // Reference uses inset ring shadows for hover/selected/staleness (no border
  // colour change). Keep a transparent base border so the inset ring reads.
  padding: 0.5rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  cursor: grab;
  user-select: none;
  outline: none;
  transition: transform 100ms ease, box-shadow 100ms ease;

  &:hover {
    box-shadow: inset 0 1px 0 0 $accent-primary,
                inset 0 0 0 1px $accent-primary;
  }

  &:focus-visible {
    box-shadow: inset 0 0 0 2px $accent-primary;
  }

  &:active {
    cursor: grabbing;
    transform: scale(0.995);
  }

  // Selected takes precedence (matches reference `.hermes-kanban-card--selected`).
  &.selected {
    box-shadow: inset 0 0 0 2px $accent-primary,
                inset 0 0 0 1px $accent-primary;
    background-color: rgba(var(--accent-primary-rgb), 0.06);
  }

  // Staleness tiers (reference `hermes-kanban-card--stale-*`). These only
  // apply when not selected — selected keeps its own ring above via order.
  &.stale-amber:not(.selected):not(:hover) {
    box-shadow: inset 0 0 0 1px #d4b34888;
  }

  &.stale-amber:not(.selected):hover {
    box-shadow: inset 0 0 0 2px #d4b348;
  }

  &.stale-red:not(.selected):not(:hover) {
    box-shadow: inset 0 0 0 1px $error,
                0 0 8px rgba(var(--error-rgb), 0.3);
  }

  &.stale-red:not(.selected):hover {
    box-shadow: inset 0 0 0 2px $error,
                0 0 10px rgba(var(--error-rgb), 0.45);
  }
}

.card-top-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.card-checkbox {
  flex-shrink: 0;
}

.task-id {
  font-family: $font-code;
  font-size: 0.65rem;
  color: $text-muted;
  letter-spacing: 0.03em;
}

.priority-badge {
  font-size: 0.6rem;
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  background: rgba(var(--accent-primary-rgb), 0.18);
  color: $text-primary;
  border: 1px solid rgba(var(--accent-primary-rgb), 0.4);
  white-space: nowrap;
}

.tenant-badge {
  font-size: 0.6rem;
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  background: transparent;
  color: $text-secondary;
  border: 1px solid $border-color;
  white-space: nowrap;
}

.progress-badge {
  font-family: $font-code;
  font-size: 0.62rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: rgba(var(--accent-primary-rgb), 0.08);
  border: 1px solid rgba(var(--accent-primary-rgb), 0.2);
  color: $text-muted;
  letter-spacing: 0.02em;
  white-space: nowrap;

  &.complete {
    background: rgba(63, 185, 125, 0.22);
    border-color: rgba(63, 185, 125, 0.45);
    color: $text-primary;
  }
}

.needs-assignee-badge {
  font-size: 0.6rem;
  padding: 0.05rem 0.3rem;
  border-radius: 999px;
  background: rgba(var(--warning-rgb), 0.16);
  border: 1px solid rgba(var(--warning-rgb), 0.45);
  color: $text-primary;
  white-space: nowrap;
}

// Warning glyph colours mirror the reference diagnostic severity tokens
// (--hermes-diag-warning/error/critical).
.warning-badge {
  font-size: 0.65rem;
  padding: 0 2px;
  cursor: help;

  &.warn-critical {
    color: #ff4d4d;
    font-weight: 700;
  }

  &.warn-error {
    color: #ff6b3d;
    font-weight: 700;
  }

  &.warn-warning {
    color: #ff9e3b;
  }
}

.card-title {
  font-size: 0.85rem;
  font-weight: 500;
  color: $text-primary;
  line-height: 1.3;
  word-break: break-word;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.7rem;
  color: $text-muted;
  flex-wrap: wrap;
}

.meta-assignee {
  color: rgba(var(--text-primary-rgb), 0.8);
  font-weight: 500;
}

.meta-unassigned {
  color: $text-muted;
  font-style: italic;
}

.meta-count {
  display: inline-flex;
  gap: 0.2rem;
  align-items: center;
}

.meta-time {
  margin-left: auto;
  white-space: nowrap;
}
</style>
