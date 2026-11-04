<!-- overlay/custom/client/projects/components/ProjectCompleteDialog.vue
     完成豁免确认框（列表/详情共用）：完成动作命中 422 时列出未终结任务
     （id/status/board/title），并提供「带豁免理由强制完成」输入走
     ?override=true&reason=…。理由必填（空理由按钮禁用）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NInput, NModal } from 'naive-ui'
import type { UnfinishedTask } from '../api/projects'

const props = defineProps<{
  show: boolean
  projectId: string
  problems: UnfinishedTask[]
  reason: string
  busy?: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'update:reason': [value: string]
  /** 理由非空才可触发（父层 overrideReady 把守） */
  force: []
}>()

const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const canForce = computed(() => props.reason.trim().length > 0 && !props.busy)
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    :title="zh ? '完成项目：存在未终结任务' : 'Complete project: unfinished tasks'"
    :style="{ width: 'min(560px, calc(100vw - 32px))' }"
    :mask-closable="!busy"
    data-testid="project-complete-dialog"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <p class="pcd__lead">
      {{ zh ? `项目「${projectId}」尚有 ${problems.length} 个未终结任务，直接完成会被服务端拒绝（422）。` : `Project "${projectId}" has ${problems.length} unfinished tasks; completing it is rejected (422).` }}
    </p>
    <table v-if="problems.length" class="pcd__table" data-testid="project-complete-problems">
      <thead>
        <tr>
          <th>{{ zh ? '任务' : 'Task' }}</th>
          <th>{{ zh ? '状态' : 'Status' }}</th>
          <th>{{ zh ? '看板' : 'Board' }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in problems" :key="p.id" :data-testid="`project-complete-problem-${p.id}`">
          <td class="pcd__task">
            <span class="pcd__task-id">{{ p.id }}</span>
            <span v-if="p.title" class="pcd__task-title">{{ p.title }}</span>
          </td>
          <td>{{ p.status }}</td>
          <td>{{ p.board }}</td>
        </tr>
      </tbody>
    </table>
    <div class="pcd__override">
      <label class="pcd__label" for="project-override-reason">
        {{ zh ? '豁免理由（必填，随强制完成留痕）' : 'Override reason (required)' }}
      </label>
      <NInput
        id="project-override-reason"
        type="textarea"
        :rows="2"
        :value="reason"
        :placeholder="zh ? '说明为什么允许带着未终结任务收口…' : 'Why this project may close with unfinished tasks…'"
        data-testid="project-override-reason"
        @update:value="(v: string) => emit('update:reason', v)"
      />
    </div>
    <template #footer>
      <div class="pcd__actions">
        <NButton size="small" :disabled="busy" data-testid="project-complete-cancel" @click="emit('update:show', false)">
          {{ zh ? '取消' : 'Cancel' }}
        </NButton>
        <NButton
          size="small"
          type="warning"
          :loading="busy"
          :disabled="!canForce"
          data-testid="project-complete-force"
          @click="emit('force')"
        >
          {{ zh ? '强制完成' : 'Force complete' }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.pcd__lead { margin: 0 0 10px; font-size: 12.5px; }
.pcd__table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
.pcd__table th,
.pcd__table td { border: 1px solid var(--border-color); padding: 4px 8px; text-align: left; vertical-align: top; }
.pcd__table th { color: var(--text-muted); font-weight: 600; background: var(--bg-secondary); }
.pcd__task { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pcd__task-id { word-break: break-all; }
.pcd__task-title { color: var(--text-muted); word-break: break-all; }
.pcd__override { display: flex; flex-direction: column; gap: 6px; }
.pcd__label { font-size: 12px; color: var(--text-secondary); }
.pcd__actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
