<script setup lang="ts">
// IdeFilesPane — 右侧辅助面板「查看文件」页签（09-20 裁定自左侧栏右移）：
// 基于任务会话与项目的视图——根目录响应式跟随当前会话 workspace（回退
// ide.workspace），不与任务列表平行独立存在；保留「查看文件 | Git」双
// 子页签（上游 FileTree + IdeGitPane）。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import FileTree from '@/components/hermes/files/FileTree.vue'
import IdeGitPane from './IdeGitPane.vue'
import { useIdeStore } from '../store/ide'
import { workspaceLabel } from '../utils/time'

const { t } = useI18n()
const ide = useIdeStore()
const chat = useChatStore()

const tab = ref<'tree' | 'git'>('tree')

const root = computed(() => chat.activeSession?.workspace ?? ide.workspace)
</script>

<template>
  <div class="ide-files">
    <div class="ide-files__tabs" role="tablist">
      <button type="button" role="tab" class="ide-files__tab" :class="{ 'is-active': tab === 'tree' }" :aria-selected="tab === 'tree'" data-testid="ide-files-tab-tree" @click="tab = 'tree'">{{ t('ide.task.view_files') }}</button>
      <button type="button" role="tab" class="ide-files__tab" :class="{ 'is-active': tab === 'git' }" :aria-selected="tab === 'git'" data-testid="ide-files-tab-git" @click="tab = 'git'">Git</button>
    </div>
    <p class="ide-files__scope" :title="root ?? ''" data-testid="ide-files-scope">{{ root ? workspaceLabel(t, root) : t('ide.task.defaultGroup') }}</p>
    <FileTree v-show="tab === 'tree'" class="ide-files__tree" :profile="null" :workspace-key="root" />
    <IdeGitPane v-if="tab === 'git'" class="ide-files__git" />
  </div>
</template>

<style scoped lang="scss">
.ide-files {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ide-files__tabs {
  display: flex;
  gap: 2px;
  padding: 4px 8px 0;
}

.ide-files__tab {
  flex: 1;
  height: 24px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted, #9aa0aa);
  font-size: 12px;
  cursor: pointer;

  &:hover { color: var(--text-primary, #e6e6e6); }
  &.is-active {
    background: var(--bg-tertiary, #ebebeb);
    color: var(--text-primary, #e6e6e6);
  }
}

.ide-files__scope {
  margin: 0;
  padding: 3px 12px;
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-files__tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px 8px;
}

.ide-files__git { flex: 1; min-height: 0; }
</style>
