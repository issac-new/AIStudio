<script setup lang="ts">
import { ref, computed } from 'vue'
import { NButton, NSelect, NTag } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import type { KanbanDiagnosticItem, KanbanTask } from '@/api/hermes/kanban'
import { useKanbanStore } from '@/stores/hermes/kanban'

const props = defineProps<{
  task: KanbanTask
  diagnostics: KanbanDiagnosticItem[]
  assignees: string[]
}>()

const emit = defineEmits<{
  refresh: []
}>()

const { t } = useI18n()
const store = useKanbanStore()

const expanded = ref(true)
const busyActions = ref<Record<string, boolean>>({})
const actionMessages = ref<Record<string, { ok: boolean; text: string }>>({})
const copiedKey = ref<string | null>(null)
const reassignProfiles = ref<Record<string, string>>({})

const hasDiagnostics = computed(() => props.diagnostics.length > 0)

const severityClass = (sev: string) => {
  if (sev === 'critical') return 'diag--critical'
  if (sev === 'error') return 'diag--error'
  return 'diag--warning'
}

const severityGlyph = (sev: string) => {
  if (sev === 'critical') return '!!!'
  if (sev === 'error') return '!!'
  return '⚠'
}

async function execAction(diag: KanbanDiagnosticItem, action: any) {
  const key = `${diag.kind}-${action.kind}`
  if (busyActions.value[key]) return

  if (action.kind === 'cli_hint') {
    const cmd = action.payload?.command || action.label
    try {
      await navigator.clipboard.writeText(cmd)
      copiedKey.value = action.label
      setTimeout(() => copiedKey.value = null, 2000)
    } catch {
      window.prompt(t('kanban.copyCommand', 'Copy command:'), cmd)
    }
    return
  }

  if (action.kind === 'comment') {
    const ta = document.querySelector('.comment-input-row input, .comment-input-row textarea')
    if (ta) {
      ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      ;(ta as HTMLElement).focus()
    }
    return
  }

  if (action.kind === 'open_docs') {
    const url = action.payload?.url
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  busyActions.value[key] = true
  actionMessages.value[key] = { ok: false, text: '' }

  try {
    if (action.kind === 'unblock') {
      await store.patchTask(props.task.id, { status: 'ready' })
      actionMessages.value[key] = {
        ok: true,
        text: t('kanban.unblockedMessage', { id: props.task.id }, 'Unblocked {id}. Task is ready.')
      }
    } else if (action.kind === 'reclaim') {
      await store.reclaimTask(props.task.id, `recovery action for ${diag.kind}`)
      actionMessages.value[key] = {
        ok: true,
        text: t('kanban.reclaimedMessage', { id: props.task.id }, 'Reclaimed {id}. Task is back to ready.')
      }
    } else if (action.kind === 'reassign') {
      const profile = reassignProfiles.value[diag.kind] || ''
      if (!profile) {
        actionMessages.value[key] = { ok: false, text: t('kanban.pickProfileFirst', 'Pick a profile first.') }
        busyActions.value[key] = false
        return
      }
      await store.reassignTask(props.task.id, profile, { reclaim: true, reason: `recovery action for ${diag.kind}` })
      actionMessages.value[key] = {
        ok: true,
        text: t('kanban.reassignedMessage', { id: props.task.id, profile }, 'Reassigned {id} to {profile}.')
      }
    }
    emit('refresh')
  } catch (err: any) {
    actionMessages.value[key] = { ok: false, text: err?.message || String(err) }
  } finally {
    busyActions.value[key] = false
  }
}

const assigneeOptions = computed(() => [
  { label: t('kanban.unassigned', 'unassigned'), value: '' },
  ...props.assignees.map(a => ({ label: a, value: a }))
])
</script>

<template>
  <div v-if="hasDiagnostics || expanded" class="diagnostics-section">
    <div class="section-head-row">
      <span class="section-head">
        <span v-if="hasDiagnostics" class="section-head-warning">
          ⚠ {{ t('kanban.diagnostics', 'Diagnostics') }} ({{ diagnostics.length }})
        </span>
        <span v-else>{{ t('kanban.diagnostics', 'Diagnostics') }}</span>
      </span>
      <NButton
        size="tiny"
        text
        @click="expanded = !expanded"
      >
        {{ expanded ? t('common.collapse') : t('common.expand') }}
      </NButton>
    </div>

    <div v-if="expanded && hasDiagnostics" class="diag-list">
      <div
        v-for="(diag, i) in diagnostics"
        :key="`${task.id}:${diag.kind}:${i}`"
        class="diag-card"
        :class="severityClass(diag.severity)"
      >
        <div class="diag-header">
          <span class="diag-sev">{{ severityGlyph(diag.severity) }}</span>
          <span class="diag-title">{{ diag.title }}</span>
        </div>

        <div class="diag-detail">{{ diag.detail }}</div>

        <div v-if="diag.data && Object.keys(diag.data).length > 0" class="diag-data">
          <div
            v-for="k in Object.keys(diag.data)"
            :key="k"
            class="diag-data-row"
          >
            <span class="diag-data-key">{{ k }}:</span>
            <span v-if="Array.isArray(diag.data[k]) && (diag.data[k] as string[]).length > 0 && typeof (diag.data[k] as string[])[0] === 'string' && (diag.data[k] as string[])[0].indexOf('t_') === 0" class="diag-data-val">
              <NTag
                v-for="x in (diag.data[k] as string[])"
                :key="x"
                size="tiny"
              >
                {{ x }}
              </NTag>
            </span>
            <span v-else class="diag-data-val">
              {{ Array.isArray(diag.data[k]) ? (diag.data[k] as unknown[]).join(', ') : String(diag.data[k]) }}
            </span>
          </div>
        </div>

        <!-- Reassign picker inline -->
        <div v-if="diag.actions?.find((a: any) => a.kind === 'reassign')" class="reassign-row">
          <span class="reassign-label">{{ t('kanban.reassignTo', 'Reassign to:') }}</span>
          <NSelect
            v-model:value="reassignProfiles[diag.kind]"
            size="tiny"
            :options="assigneeOptions"
            style="width: 160px"
          />
        </div>

        <div class="diag-actions">
          <NButton
            v-for="(action, ai) in diag.actions"
            :key="`${action.kind}-${ai}`"
            size="tiny"
            :type="action.suggested ? 'primary' : 'default'"
            :loading="busyActions[`${diag.kind}-${action.kind}`]"
            :disabled="busyActions[`${diag.kind}-${action.kind}`] || (action.kind === 'reassign' && !reassignProfiles[diag.kind])"
            @click="execAction(diag, action)"
          >
            {{ action.suggested ? '☆ ' : '' }}{{ action.label }}
          </NButton>
        </div>

        <div
          v-if="actionMessages[`${diag.kind}-${diag.actions?.[0]?.kind}`]?.text"
          class="action-msg"
          :class="actionMessages[`${diag.kind}-${diag.actions?.[0]?.kind}`].ok ? 'action-msg--ok' : 'action-msg--err'"
        >
          {{ actionMessages[`${diag.kind}-${diag.actions?.[0]?.kind}`].text }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.diagnostics-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section-head {
  font-size: 13px;
  font-weight: 600;
  color: $text-secondary;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.section-head-warning {
  color: $warning;
}

.diag-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.diag-card {
  border-left: 3px solid $warning;
  background: rgba($warning, 0.05);
  border-radius: $radius-md;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  &.diag--error {
    border-left-color: $error;
    background: rgba($error, 0.06);
  }

  &.diag--critical {
    border-left-color: #ff4d4d;
    background: rgba(#ff4d4d, 0.07);
  }
}

.diag-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.diag-sev {
  font-weight: 700;
  min-width: 1.5rem;
  font-size: 12px;
}

.diag--warning .diag-sev { color: $warning; }
.diag--error .diag-sev { color: $error; }
.diag--critical .diag-sev { color: #ff4d4d; }

.diag-title {
  font-weight: 600;
  font-size: 14px;
  color: $text-primary;
}

.diag-detail {
  font-size: 13px;
  color: $text-primary;
  line-height: 1.4;
}

.diag-data {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.diag-data-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.diag-data-key {
  color: $text-muted;
  font-weight: 500;
  min-width: 80px;
}

.diag-data-val {
  font-family: var(--font-mono, ui-monospace, monospace);
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.reassign-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.reassign-label {
  color: $text-muted;
}

.diag-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.action-msg {
  font-size: 12px;
  padding: 6px 10px;
  border-radius: $radius-sm;

  &--ok {
    background: rgba($success, 0.1);
    color: $success;
  }

  &--err {
    background: rgba($error, 0.1);
    color: $error;
  }
}
</style>
