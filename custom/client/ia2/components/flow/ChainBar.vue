<!-- overlay/custom/client/ia2/components/flow/ChainBar.vue -->
<!-- v12 链路条（对象↔任务↔门 面包屑）：当前对象 → 挂接任务（取首个）→
     等你门节点（该对象上有 review 任务/门等待时）；尾部 时间线▾ 与 ⌨ 在 IDE
     打开。动线①↔②↔⑤ 的互跳锚点。 -->
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { CockpitTask } from '@/custom/cockpit/adapters/task-adapter'

const props = defineProps<{
  objectName: string
  linkedTasks: CockpitTask[]
  /** 等我命中本对象的门标题（无则不渲染门节点） */
  gateTitle?: string | null
}>()

const emit = defineEmits<{
  (e: 'open-task', taskId: string): void
  (e: 'open-timeline'): void
  (e: 'open-ide', taskId: string): void
}>()

const { t } = useI18n()
const first = () => props.linkedTasks[0]
</script>

<template>
  <div class="chain" data-testid="chain-bar">
    <span class="chain__node chain__node--cur" data-testid="chain-object">💬 {{ objectName }}</span>
    <template v-if="first()">
      <span class="chain__arrow">→</span>
      <button
        type="button" class="chain__node chain__node--task" data-testid="chain-task"
        :title="first().title" @click="emit('open-task', first().id)"
      >📋 #{{ first().id.slice(0, 8) }} · {{ first().title }}</button>
    </template>
    <template v-if="gateTitle">
      <span class="chain__arrow">→</span>
      <span class="chain__node chain__node--gate" data-testid="chain-gate">⧖ {{ gateTitle }}</span>
    </template>
    <span class="chain__spacer" />
    <button type="button" class="chain__link" data-testid="chain-timeline" @click="emit('open-timeline')">
      {{ t('ia2.chain.timeline') }} ▾
    </button>
    <button
      v-if="first()"
      type="button" class="chain__chip" data-testid="chain-ide"
      @click="emit('open-ide', first().id)"
    >⌨ {{ t('ia2.chain.openIde') }}</button>
  </div>
</template>

<style scoped lang="scss">
.chain {
  display: flex; align-items: center; gap: 6px; min-height: 34px;
  padding: 4px 10px; border-bottom: 1px solid var(--border-color);
  background: var(--bg-card); font-size: 11px; flex-shrink: 0;
}
.chain__node {
  display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px;
  border: 1px solid var(--border-color); border-radius: 12px;
  color: var(--text-secondary); white-space: nowrap; max-width: 260px;
  overflow: hidden;
}
.chain__node--cur { border-color: var(--primary); color: var(--primary); font-weight: 600; }
.chain__node--task {
  cursor: pointer; background: transparent; font-family: inherit;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.chain__node--gate { border-color: var(--warning); color: var(--warning); flex-shrink: 0; }
.chain__arrow { color: var(--text-muted); flex-shrink: 0; }
.chain__spacer { flex: 1; }
.chain__link { border: none; background: none; color: var(--text-muted); font-size: 11px; cursor: pointer; &:hover { color: var(--primary); } }
.chain__chip {
  height: 22px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
  white-space: nowrap;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
</style>
