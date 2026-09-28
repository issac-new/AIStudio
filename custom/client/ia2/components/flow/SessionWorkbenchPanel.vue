<!-- overlay/custom/client/ia2/components/flow/SessionWorkbenchPanel.vue -->
<!-- v12.3 R4b 会话工作台面板（四块，自 ChainBar+ParticipantsBar 收编合一）：
     ① 对象块（名称 + 值守）；② 任务簇块（挂接任务 chip 全量：点击→看板预选、
     双击→IDE 编码动线⑤；等我门节点）；③ 参与方块（👤∪🤖 徽章 + ＋邀请）；
     ④ 动作块（时间线 ▾ / ⌨ IDE）。纯展示：数据全 props、动作全 emit，
     装配方（WorkbenchView）聚合。ChainBar 保留供 RunCanvas（循环面）。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

export interface ParticipantBadge {
  kind: 'human' | 'agent'
  name: string
  team?: string
}

const props = defineProps<{
  objectName: string
  /** 会话类型（群聊/会话无邀请语义时置 false——room 专属） */
  canInvite?: boolean
  dutyName?: string | null
  linkedTasks: CockpitTask[]
  gateTitle?: string | null
  participants: ParticipantBadge[]
}>()

const emit = defineEmits<{
  (e: 'open-task', taskId: string): void
  (e: 'open-timeline'): void
  (e: 'open-ide', taskId: string): void
  (e: 'invite'): void
}>()

const { t } = useI18n()
const firstTask = () => props.linkedTasks[0]
</script>

<template>
  <div class="swp" data-testid="session-workbench-panel">
    <!-- ① 对象块 -->
    <div class="swp__block swp__block--obj">
      <span class="swp__label">{{ t('ia2.swp.object') }}</span>
      <span class="swp__object" data-testid="chain-object" :title="objectName">💬 {{ objectName }}</span>
      <span v-if="dutyName" class="swp__duty" data-testid="swp-duty">{{ t('ia2.part.duty') }} {{ dutyName }}</span>
    </div>
    <!-- ② 任务簇块（全量挂接 chip + 门节点） -->
    <div class="swp__block swp__block--tasks">
      <span class="swp__label">{{ t('ia2.swp.tasks') }}</span>
      <template v-if="linkedTasks.length">
        <button
          v-for="task in linkedTasks.slice(0, 5)"
          :key="task.id"
          type="button"
          class="swp__task"
          :data-testid="task.id === firstTask().id ? 'chain-task' : `chain-task-${task.id}`"
          :title="task.title"
          @click="emit('open-task', task.id)"
          @dblclick.stop="emit('open-ide', task.id)"
        >📋 #{{ task.id.slice(0, 8) }} · {{ task.title }}</button>
        <span v-if="linkedTasks.length > 5" class="swp__more">+{{ linkedTasks.length - 5 }}</span>
      </template>
      <span v-else class="swp__none">{{ t('ia2.swp.noTasks') }}</span>
      <span v-if="gateTitle" class="swp__gate" data-testid="chain-gate">⧖ {{ gateTitle }}</span>
    </div>
    <!-- ③ 参与方块 -->
    <div class="swp__block swp__block--part" data-testid="participants-bar">
      <span class="swp__label">{{ t('ia2.swp.participants') }}</span>
      <span class="swp__parts">
        <span
          v-for="(p, i) in participants.slice(0, 10)"
          :key="`${p.kind}:${p.name}:${i}`"
          class="swp__badge"
          :data-testid="`participant-${p.kind}-${p.name}`"
          :title="p.team ? `${p.name} · ${p.team}` : p.name"
        >{{ p.kind === 'human' ? '👤' : '🤖' }} {{ p.name }}<template v-if="p.team"> · {{ p.team }}</template></span>
        <span v-if="participants.length > 10" class="swp__more">+{{ participants.length - 10 }}</span>
        <button
          v-if="canInvite"
          type="button" class="swp__invite" data-testid="participants-invite"
          @click="emit('invite')"
        >＋ {{ t('ia2.part.invite') }}</button>
      </span>
    </div>
    <!-- ④ 动作块 -->
    <div class="swp__block swp__block--acts">
      <button type="button" class="swp__link" data-testid="chain-timeline" @click="emit('open-timeline')">
        {{ t('ia2.chain.timeline') }} ▾
      </button>
      <button
        v-if="firstTask()"
        type="button" class="swp__chip" data-testid="chain-ide"
        @click="emit('open-ide', firstTask().id)"
      >⌨ {{ t('ia2.chain.openIde') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.swp {
  display: flex; align-items: center; gap: 10px; min-height: 40px; flex-wrap: wrap;
  padding: 4px 10px; border-bottom: 1px solid var(--border-color);
  background: var(--bg-card); font-size: 11px; flex-shrink: 0;
}
.swp__label {
  color: var(--text-muted); font-weight: 700; font-size: 10px;
  text-transform: uppercase; letter-spacing: .04em; flex-shrink: 0;
}
.swp__block { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.swp__block--obj { flex-shrink: 1; min-width: 120px; }
.swp__block--tasks { flex: 1 1 240px; flex-wrap: wrap; }
.swp__block--part { flex: 2 1 280px; min-width: 0; overflow: hidden; }
.swp__block--acts { flex-shrink: 0; margin-left: auto; }
.swp__object {
  display: inline-flex; align-items: center; height: 24px; padding: 0 9px;
  border: 1px solid var(--primary); border-radius: 12px; color: var(--primary);
  font-weight: 600; white-space: nowrap; max-width: 220px; overflow: hidden;
}
.swp__duty {
  flex-shrink: 0; height: 20px; padding: 0 8px; border-radius: 10px;
  border: 1px solid var(--border-color); color: var(--text-secondary);
  display: inline-flex; align-items: center; white-space: nowrap;
}
.swp__task {
  display: inline-flex; align-items: center; height: 24px; padding: 0 9px;
  border: 1px solid var(--border-color); border-radius: 12px;
  color: var(--text-secondary); background: transparent; cursor: pointer;
  font-family: inherit; white-space: nowrap; max-width: 240px; overflow: hidden;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.swp__gate {
  flex-shrink: 0; height: 24px; padding: 0 9px; border: 1px solid var(--warning);
  border-radius: 12px; color: var(--warning); display: inline-flex; align-items: center;
  white-space: nowrap;
}
.swp__none { color: var(--text-muted); font-size: 10px; }
.swp__more { color: var(--text-muted); flex-shrink: 0; }
.swp__parts {
  display: flex; align-items: center; gap: 4px; min-width: 0;
  overflow-x: auto; scrollbar-width: thin;
}
.swp__badge {
  display: inline-flex; align-items: center; height: 20px; padding: 0 8px;
  border-radius: 10px; background: var(--bg-secondary); color: var(--text-secondary);
  white-space: nowrap; flex-shrink: 0;
}
.swp__invite {
  border: none; background: none; color: var(--text-muted); font-size: 11px;
  cursor: pointer; flex-shrink: 0; &:hover { color: var(--primary); }
}
.swp__link { border: none; background: none; color: var(--text-muted); font-size: 11px; cursor: pointer; &:hover { color: var(--primary); } }
.swp__chip {
  height: 22px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
  white-space: nowrap;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
</style>
