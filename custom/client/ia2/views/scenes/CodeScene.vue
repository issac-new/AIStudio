<!-- overlay/custom/client/ia2/views/scenes/CodeScene.vue -->
<!-- Code 场景（2026-09-16 多视图重构）：IDE 习惯三区——
     左文件树 + 中终端 + 右任务上下文，顶部任务上下文条。
     cockpit 组件经 Task 4 可选 props 注入任务 workspace（不 bootstrap
     cockpit store）。终端会话 MVP 切任务/切场景即断开重建（:key 换任务，
     场景卸载组件销毁）——与 AI 协作中心切 mode 现状一致，代价已声明。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { NSelect } from 'naive-ui'
import { useWorkspaceStore } from '../../store/workspace'
import CockpitFilePanel from '@/custom/cockpit/components/CockpitFilePanel.vue'
import CockpitTerminalPane from '@/custom/cockpit/components/CockpitTerminalPane.vue'
import RunLinks from '../../components/RunLinks.vue'
import KanbanTaskDrawer from '@/custom/kanban/components/KanbanTaskDrawer.vue'

const router = useRouter()
const { t } = useI18n()
const workspace = useWorkspaceStore()

const currentTaskId = ref<string | null>(null)
const currentTask = computed(() =>
  workspace.tasks.find(x => x.id === currentTaskId.value) ?? null)
const workspacePath = computed(() =>
  (currentTask.value as { workspace?: string } | null)?.workspace)
const drawerOpen = ref(false)

const taskOptions = computed(() =>
  workspace.tasks.map(x => ({ label: x.title, value: x.id })))

const goComms = () => void router.push({ name: 'ia2.comms' })
</script>

<template>
  <section class="cscene" data-testid="scene-code">
    <!-- 任务上下文条 -->
    <div class="cscene__bar">
      <NSelect
        :value="currentTaskId"
        :options="taskOptions"
        :placeholder="t('loopScenes.code.selectTask')"
        clearable
        filterable
        class="cscene__bar-select"
        data-testid="cscene-task-select"
        @update:value="v => { currentTaskId = (v as string | null) }"
      />
      <template v-if="currentTask">
        <span class="cscene__bar-title" :title="currentTask.title">{{ currentTask.title }}</span>
        <button type="button" class="cscene__bar-btn" data-testid="cscene-open-drawer" @click="drawerOpen = true">
          {{ t('loopScenes.code.openDrawer') }}</button>
      </template>
    </div>

    <div v-if="!currentTask" class="cscene__empty" data-testid="cscene-empty">
      {{ t('loopScenes.code.noTask') }}
    </div>
    <div v-else-if="!workspacePath" class="cscene__empty" data-testid="cscene-no-workspace">
      {{ t('loopScenes.code.noWorkspace') }}
    </div>

    <div v-else class="cscene__body">
      <aside class="cscene__files">
        <CockpitFilePanel :workspace-path="workspacePath" />
      </aside>
      <main class="cscene__term">
        <CockpitTerminalPane :key="currentTask.id" :workspace-path="workspacePath" />
      </main>
      <aside class="cscene__ctx">
        <div class="cscene__ctx-head">{{ t('loopScenes.code.context') }}</div>
        <div class="cscene__ctx-row">{{ t(`kanban.columns.${currentTask.status}`) }}</div>
        <div class="cscene__ctx-sub">{{ t('loopScenes.code.runs') }}</div>
        <RunLinks :task-id="currentTask.id" :show="true" />
        <button type="button" class="cscene__bar-btn cscene__ctx-chat" data-testid="cscene-open-chat" @click="goComms">
          {{ t('loopScenes.code.openChat') }}</button>
      </aside>
    </div>

    <KanbanTaskDrawer v-model:show="drawerOpen" :task-id="currentTaskId" @close="drawerOpen = false" />
  </section>
</template>

<style scoped>
.cscene { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.cscene__bar {
  flex: 0 0 auto; display: flex; align-items: center; gap: 10px;
  padding: 6px 10px; border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary));
}
.cscene__bar-select { max-width: 320px; }
.cscene__bar-title { font-size: 12.5px; font-weight: 600; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cscene__bar-btn {
  padding: 4px 12px; border-radius: var(--radius-standard); cursor: pointer;
  border: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
  font-size: 12px; font-family: inherit; white-space: nowrap;
}
.cscene__bar-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.cscene__empty { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 13px; }
.cscene__body { flex: 1 1 auto; min-height: 0; display: flex; gap: 10px; }
.cscene__files { flex: 0 0 260px; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: var(--radius-standard); overflow: hidden; }
.cscene__term { flex: 1 1 auto; min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: var(--radius-standard); overflow: hidden; }
.cscene__ctx {
  flex: 0 0 260px; min-height: 0; overflow-y: auto; padding: 10px 12px;
  border: 1px solid var(--border-color); border-radius: var(--radius-standard);
  background: var(--bg-card, var(--bg-primary)); display: flex; flex-direction: column; gap: 6px;
}
.cscene__ctx-head { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.cscene__ctx-row { font-size: 12px; color: var(--text-secondary); }
.cscene__ctx-sub { font-size: 11px; font-weight: 600; color: var(--text-secondary); margin-top: 6px; }
.cscene__ctx-chat { margin-top: auto; }
</style>
