<script setup lang="ts">
// overlay/custom/client/ide/components/IdeLandingHero.vue
// IDE 工作台裸落地引导空态（run13 步18 错帧修复配套产品面）：
// 登录默认落点 /app/ide 不带任务上下文，此前直接落会话栏自动恢复——新用户
// 零引导。此组件承接裸落地：最近任务速选（点击即带任务上下文+展开简报，
// 与 ?task 深链同款体验）或一键进入会话工作区（本次访问不再打扰）。
import { useI18n } from 'vue-i18n'

export interface LandingTask {
  id: string
  title: string
  status?: string
}

defineProps<{ tasks: LandingTask[] }>()
defineEmits<{ pick: [id: string]; enter: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="ide-landing" data-testid="ide-landing-hero">
    <h2 class="ide-landing__title">{{ t('ide.landing.title', '从一个任务开始') }}</h2>
    <p class="ide-landing__sub">{{ t('ide.landing.sub', '选择一个最近任务带入简报与上下文，或直接进入会话工作区') }}</p>
    <ul v-if="tasks.length" class="ide-landing__list">
      <li v-for="task in tasks" :key="task.id">
        <button
          type="button"
          class="ide-landing__task"
          :data-task="task.id"
          :data-testid="`ide-landing-task-${task.id}`"
          @click="$emit('pick', task.id)"
        >
          <span class="ide-landing__task-title">{{ task.title || task.id }}</span>
          <span v-if="task.status" class="ide-landing__task-status">{{ task.status }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="ide-landing__empty">{{ t('ide.landing.empty', '暂无任务：从看板新建或跳转进入后自动带入任务上下文') }}</p>
    <button type="button" class="ide-landing__enter" data-testid="ide-landing-enter" @click="$emit('enter')">
      {{ t('ide.landing.enter', '进入会话工作区') }}
    </button>
  </div>
</template>

<style scoped>
.ide-landing {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  overflow: auto;
}
.ide-landing__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.ide-landing__sub,
.ide-landing__empty {
  margin: 0;
  max-width: 360px;
  text-align: center;
  color: var(--text-muted, #9aa0aa);
  font-size: 12px;
  line-height: 1.6;
}
.ide-landing__list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ide-landing__task {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-color, #3a3f47);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.ide-landing__task:hover {
  border-color: var(--primary-color, #4f7cff);
}
.ide-landing__task-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.ide-landing__task-status {
  flex-shrink: 0;
  color: var(--text-muted, #9aa0aa);
  font-size: 11px;
}
.ide-landing__enter {
  margin-top: 10px;
  padding: 6px 18px;
  border: none;
  border-radius: 8px;
  background: var(--primary-color, #4f7cff);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
</style>
