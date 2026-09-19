<!-- overlay/custom/client/ia2/components/flow/ParticipantsBar.vue -->
<!-- v12 参与方条：员工（👤）∪ 智能体（🤖）徽章序列 + ＋邀请 + 值守 chip。
     参与者投影由装配方（WorkbenchView）计算——matrix 房间取成员列表与值守
     编制，agent 会话取会话 agent。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

export interface ParticipantBadge {
  kind: 'human' | 'agent'
  name: string
  team?: string
}

defineProps<{
  participants: ParticipantBadge[]
  dutyName?: string | null
  /** 会话型画布（agent 会话）无邀请语义时置 false */
  canInvite?: boolean
}>()

const emit = defineEmits<{ (e: 'invite'): void }>()
const { t } = useI18n()
</script>

<template>
  <div class="partbar" data-testid="participants-bar">
    <span class="partbar__label">{{ t('ia2.part.title') }}</span>
    <span class="partbar__list">
      <span
        v-for="(p, i) in participants.slice(0, 10)"
        :key="`${p.kind}:${p.name}:${i}`"
        class="partbar__badge"
        :data-testid="`participant-${p.kind}-${p.name}`"
        :title="p.team ? `${p.name} · ${p.team}` : p.name"
      >{{ p.kind === 'human' ? '👤' : '🤖' }} {{ p.name }}<template v-if="p.team"> · {{ p.team }}</template></span>
      <span v-if="participants.length > 10" class="partbar__more">+{{ participants.length - 10 }}</span>
      <button
        v-if="canInvite"
        type="button" class="partbar__invite" data-testid="participants-invite"
        @click="emit('invite')"
      >＋ {{ t('ia2.part.invite') }}</button>
    </span>
    <span v-if="dutyName" class="partbar__duty">{{ t('ia2.part.duty') }} {{ dutyName }}</span>
  </div>
</template>

<style scoped lang="scss">
.partbar {
  display: flex; align-items: center; gap: 8px; min-height: 30px;
  padding: 3px 10px; border-bottom: 1px solid var(--border-color);
  background: var(--bg-card); font-size: 11px; flex-shrink: 0;
}
.partbar__label { color: var(--text-muted); font-weight: 700; flex-shrink: 0; }
.partbar__list {
  display: flex; align-items: center; gap: 4px; flex: 1; min-width: 0;
  overflow-x: auto; scrollbar-width: thin;
}
.partbar__badge {
  display: inline-flex; align-items: center; height: 20px; padding: 0 8px;
  border-radius: 10px; background: var(--bg-secondary); color: var(--text-secondary);
  white-space: nowrap; flex-shrink: 0;
}
.partbar__more { color: var(--text-muted); flex-shrink: 0; }
.partbar__invite {
  border: none; background: none; color: var(--text-muted); font-size: 11px;
  cursor: pointer; flex-shrink: 0; &:hover { color: var(--primary); }
}
.partbar__duty {
  flex-shrink: 0; height: 20px; padding: 0 8px; border-radius: 10px;
  border: 1px solid var(--border-color); color: var(--text-secondary);
  display: inline-flex; align-items: center; white-space: nowrap;
}
</style>
