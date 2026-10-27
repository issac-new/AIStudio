<script setup lang="ts">
// overlay/custom/client/ide/components/IdeLandingHero.vue
// IDE 工作台裸落地引导空态（run13 步18 错帧修复配套产品面）：
// 登录默认落点 /app/ide 不带任务上下文，此前直接落会话栏自动恢复——新用户
// 零引导。此组件承接裸落地：最近任务速选（点击即带任务上下文+展开简报，
// 与 ?task 深链同款体验）或一键进入会话工作区（本次访问不再打扰）。
// 2026-10-27 产品一致性 Task 11：中央不再内嵌 zcode CLI 会话列表——左侧任务栏
// （IdeTaskSidebar）已有同屏列表与全部行动作，中央只做「尚未选择」引导。
import { useI18n } from 'vue-i18n'

export interface LandingTask {
  id: string
  title: string
  status?: string
}

defineProps<{ tasks: LandingTask[] }>()
defineEmits<{ pick: [id: string]; enter: []; board: [] }>()
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
    <!-- 空态语义=「尚未选择」而非「没有数据」：当前板没有任务时工作区里仍有
         他板任务与 CLI 会话可选（设计契约：不得把没有选中写成没有数据）。 -->
    <p v-else class="ui-empty-state">{{ t('ide.landing.empty', '尚未选择任务或会话：从看板选一张卡带入工作区，或直接进入会话工作区') }}</p>
    <button v-if="!tasks.length" type="button" class="ide-landing__board" data-testid="ide-landing-board" @click="$emit('board')">
      {{ t('ide.landing.board', '从看板选一张任务') }}
    </button>
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
.ide-landing__list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
}
.ide-landing__task {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 40px; /* 主要动作命中区（视觉最小集） */
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}
.ide-landing__task:hover {
  border-color: var(--primary-color);
}
.ide-landing__task-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.ide-landing__task-status {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 12px;
}
.ide-landing__board {
  margin-top: 10px;
  min-height: 40px;
  padding: 8px 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
}
.ide-landing__enter {
  margin-top: 10px;
  min-height: 40px;
  padding: 8px 20px;
  border: none;
  border-radius: 8px;
  background: var(--primary-color);
  color: var(--text-on-accent);
  font-size: 14px;
  cursor: pointer;
}
</style>
