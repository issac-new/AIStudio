<!-- overlay/custom/client/ia2/components/flow/SessionCanvas.vue -->
<!-- v12 中栏 · 对象工作区之会话面（2026-09-19 统一视图）：链路条 + 参与方条 +
     消息画布。room → MatrixRoomCanvas（matrix 房间头/消息流/输入/右信息面板，
     路由参数绑定）；chat → 上游 ChatView（hermes agent 会话，路由参数绑定）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'
import ChainBar from './ChainBar.vue'
import ParticipantsBar, { type ParticipantBadge } from './ParticipantsBar.vue'
import MatrixRoomCanvas from '@/custom/matrix-chat/components/MatrixRoomCanvas.vue'
import ChatView from '@/views/hermes/ChatView.vue'

const props = defineProps<{
  kind: 'room' | 'chat'
  objectName: string
  linkedTasks: CockpitTask[]
  gateTitle?: string | null
  participants: ParticipantBadge[]
  dutyName?: string | null
}>()

const emit = defineEmits<{
  (e: 'open-task', taskId: string): void
  (e: 'open-timeline'): void
  (e: 'open-ide', taskId: string): void
  (e: 'invite'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="sc" :data-testid="`session-canvas-${props.kind}`">
    <ChainBar
      :object-name="objectName"
      :linked-tasks="linkedTasks"
      :gate-title="gateTitle"
      @open-task="id => emit('open-task', id)"
      @open-timeline="emit('open-timeline')"
      @open-ide="id => emit('open-ide', id)"
    />
    <ParticipantsBar
      :participants="participants"
      :duty-name="dutyName"
      :can-invite="props.kind === 'room'"
      @invite="emit('invite')"
    />
    <div class="sc__body">
      <MatrixRoomCanvas v-if="props.kind === 'room'" class="sc__chat" />
      <ChatView v-else class="sc__chat" />
    </div>
    <div class="sc__hint">{{ t('ia2.canvas.inputHint') }}</div>
  </div>
</template>

<style scoped lang="scss">
.sc {
  display: flex; flex-direction: column; height: 100%; min-height: 0;
  background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px;
  overflow: hidden;
}
.sc__body { flex: 1; min-height: 0; display: flex; }
.sc__chat { flex: 1; min-width: 0; }
.sc__hint {
  flex-shrink: 0; padding: 3px 10px; border-top: 1px solid var(--border-color);
  font-size: 10px; color: var(--text-muted); background: var(--bg-card);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
</style>
