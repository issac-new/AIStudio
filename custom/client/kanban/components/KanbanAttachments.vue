<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NUpload, NSpin, NEmpty, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import type { KanbanAttachment } from '@/api/hermes/kanban'
import { useKanbanStore } from '@/stores/hermes/kanban'

const props = defineProps<{
  taskId: string
}>()

const { t } = useI18n()
const message = useMessage()
const store = useKanbanStore()

const loading = ref(false)
const uploadLoading = ref(false)

const attachmentList = computed(() => store.attachments[props.taskId] || [])

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function timeAgo(ts: number): string {
  const secs = Math.floor((Date.now() / 1000) - ts)
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

async function handleUpload(file: File) {
  uploadLoading.value = true
  try {
    await store.uploadTaskAttachment(props.taskId, file)
    message.success(t('kanban.message.attachmentUploaded', 'Attachment uploaded'))
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.uploadFailed', 'Upload failed'))
  } finally {
    uploadLoading.value = false
  }
  return false
}

async function handleDownload(att: KanbanAttachment) {
  try {
    const blob = await store.downloadTaskAttachment(att.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = att.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.downloadFailed'))
  }
}

async function handleDelete(att: KanbanAttachment) {
  try {
    await store.deleteTaskAttachment(props.taskId, att.id)
    message.success(t('kanban.message.attachmentDeleted', 'Attachment deleted'))
  } catch (err: any) {
    message.error(err?.message || t('kanban.message.deleteFailed'))
  }
}

// Load attachments on mount
loading.value = true
store.fetchAttachments(props.taskId).finally(() => {
  loading.value = false
})
</script>

<template>
  <div class="kanban-attachments">
    <div class="section-head-row">
      <span class="section-head">
        {{ t('kanban.attachments', 'Attachments') }}
        <span v-if="attachmentList.length">({{ attachmentList.length }})</span>
      </span>
      <NUpload
        :show-file-list="false"
        :custom-request="(opts: any) => handleUpload(opts.file?.file as File)"
        accept="*"
      >
        <NButton size="tiny" text :loading="uploadLoading">
          {{ t('kanban.uploadFile', 'Upload file') }}
        </NButton>
      </NUpload>
    </div>

    <NSpin v-if="loading" size="small" />
    <NEmpty
      v-else-if="attachmentList.length === 0"
      :description="t('kanban.noAttachments')"
      size="small"
    />
    <div v-else class="attachment-list">
      <div
        v-for="att in attachmentList"
        :key="att.id"
        class="attachment-item"
      >
        <button class="attachment-link" @click="handleDownload(att)">
          {{ att.filename }}
        </button>
        <span class="attachment-meta">
          {{ formatBytes(att.size) }} · {{ timeAgo(att.created_at) }}
        </span>
        <NButton
          size="tiny"
          text
          type="error"
          @click="handleDelete(att)"
        >
          {{ t('common.delete') }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-attachments {
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

.attachment-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.attachment-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: $bg-card;
  border: 1px solid $border-light;
  border-radius: $radius-md;
}

.attachment-link {
  appearance: none;
  background: transparent;
  border: 0;
  padding: 0;
  margin: 0;
  text-align: left;
  color: $accent-primary;
  cursor: pointer;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-size: 13px;

  &:hover {
    text-decoration: underline;
  }
}

.attachment-meta {
  font-size: 11px;
  color: $text-muted;
  white-space: nowrap;
}
</style>
