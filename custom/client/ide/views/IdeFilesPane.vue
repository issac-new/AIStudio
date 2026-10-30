<script setup lang="ts">
// IdeFilesPane — 右侧辅助面板「查看文件」页签（09-20 裁定自左侧栏右移）：
// 基于任务会话与项目的视图——根目录响应式跟随当前会话 workspace（回退
// ide.workspace），不与任务列表平行独立存在；保留「查看文件 | Git」双
// 子页签（上游 FileTree + IdeGitPane）。
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFilesStore } from '@/stores/hermes/files'
import FileTree from '@/components/hermes/files/FileTree.vue'
import type { FileEntry } from '@/api/studio/files'
import IdeGitPane from './IdeGitPane.vue'
import { noWorkspaceHint, useIdeWorkspace } from '../composables/useIdeWorkspace'
import { useIdeStore } from '../store/ide'
import { workspaceLabel } from '../utils/time'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'

const { t, locale } = useI18n()
const router = useRouter()
const ide = useIdeStore()
const invalidTx = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].filesInvalid)
const zhUi = computed(() => String(locale.value ?? 'zh').startsWith('zh'))
// validation 是 ComputedRef（模板自动解包、脚本内不解包），脚本内必须读 .value。
const permissionDenied = computed(() =>
  /super administrator|super admin|permission|forbidden|not authorized/i.test(validation.value.message || ''))
const invalidTitle = computed(() => {
  const message = validation.value.message
  if (!permissionDenied.value) return invalidTx.value.title(message || invalidTx.value.fallback)
  return zhUi.value
    ? '当前工作区根目录需要管理员权限；当前账号只能打开自己的任务工作区。'
    : 'This workspace root requires administrator privileges; this account can only open its own task workspace.'
})
const filesStore = useFilesStore()
const { root, validation, validate, invalidate } = useIdeWorkspace()

const tab = ref<'tree' | 'git'>('tree')

/**
 * 空工作区文案（2026-10-30 run23 复盘 · 产品承载面诊断）：
 * 深链 ?task=<id> 未命中时，旧文案「还没有任务工作区」与「任务存在但未物化」看起来一样，
 * 采集帧与用户都无法判断是页面没做还是参数错了。判定逻辑在 noWorkspaceHint（纯函数可单测）。
 */
const noWorkspaceMessage = computed(() => {
  const hint = noWorkspaceHint({
    taskId: ide.activeTaskId,
    error: ide.taskWorkspaceError,
    taskWorkspace: ide.taskWorkspace,
  })
  return zhUi.value ? hint.zh : hint.en
})

// 只读兜底（2026-10-30 run23 复盘续作）：有激活任务、工作区已解析但未物化
// （taskWorkspace 在、materialized=false）→ 右栏也出默认根只读树，不再停在死胡同
// 空态。解析故障/任务不存在（taskWorkspaceError 非空）不渲染树——与中栏兜底视图同规则。
const readOnlyFallback = computed(() =>
  Boolean(ide.activeTaskId) && Boolean(ide.taskWorkspace) && !ide.taskWorkspaceError && !root.value)

// FileTree 的 workspaceKey 只用于根标签；真正决定列目录的根是 filesStore.
// workspaceRoot（上游 FileTree 直接读该 ref）。根先校验再接线：非法根只打
// 一次探测请求并显示可解释状态，不让 FileTree 反复 400。
watch(root, async (value) => {
  filesStore.workspaceRoot = undefined
  if (!value) {
    await validate()
    return
  }
  const ok = await validate()
  if (ok && root.value === value) filesStore.workspaceRoot = value
}, { immediate: true })
onUnmounted(() => {
  filesStore.workspaceRoot = undefined
})

async function retryRoot(): Promise<void> {
  invalidate()
  const ok = await validate()
  if (ok) filesStore.workspaceRoot = root.value ?? undefined
}


// 文件节点点击 → 走 toolPanel 预览 overlay（IdeChatPane 的 FilePreview 宿主），
// IDE 没有独立编辑器面板，openEditor 无落点。
async function openEntry(entry: FileEntry): Promise<void> {
  if (entry.isDir) return
  filesStore.closePreview()
  await filesStore.openPreview(entry, { profile: null })
}
</script>

<template>
  <div class="ide-files">
    <div class="ide-files__tabs" role="tablist">
      <button type="button" role="tab" class="ide-files__tab" :class="{ 'is-active': tab === 'tree' }" :aria-selected="tab === 'tree'" data-testid="ide-files-tab-tree" @click="tab = 'tree'">{{ t('ide.task.view_files') }}</button>
      <button type="button" role="tab" class="ide-files__tab" :class="{ 'is-active': tab === 'git' }" :aria-selected="tab === 'git'" data-testid="ide-files-tab-git" @click="tab = 'git'">Git</button>
    </div>
    <p class="ide-files__scope" :title="root ?? ''" data-testid="ide-files-scope">{{ root ? workspaceLabel(t, root) : t('ide.task.defaultGroup') }}</p>
    <p v-if="tab === 'tree' && validation.status === 'checking'" class="ide-files__hint" data-testid="ide-files-checking">{{ t('ide.loading') }}</p>
    <div v-else-if="tab === 'tree' && validation.status === 'invalid'" class="ide-files__invalid" data-testid="ide-files-invalid">
      <p data-testid="ide-files-invalid-message">{{ invalidTitle }}</p>
      <p v-if="permissionDenied" class="ide-files__invalid-hint">
        {{ zhUi ? '重试不会改变权限。请改选你自己的任务工作区，或确认账号角色。' : 'Retrying will not change permissions. Pick your own task workspace or check the account role.' }}
      </p>
      <div class="ide-files__actions">
        <button type="button" class="ide-files__retry" @click="retryRoot">{{ invalidTx.retry }}</button>
        <button v-if="permissionDenied" type="button" class="ide-files__retry" data-testid="ide-files-pick-workspace" @click="router.push({ name: 'ia2.board' })">
          {{ zhUi ? '选择任务工作区' : 'Pick task workspace' }}
        </button>
        <button v-if="permissionDenied" type="button" class="ide-files__retry" data-testid="ide-files-view-role" @click="router.push({ name: 'ia2.govSettings' })">
          {{ zhUi ? '查看账号角色' : 'View account role' }}
        </button>
      </div>
    </div>
    <div v-else-if="tab === 'tree' && !root && readOnlyFallback" class="ide-files__fallback" data-testid="ide-files-readonly-fallback">
      <p class="ide-files__fallback-note" data-testid="ide-files-readonly-note">
        {{ zhUi ? '未物化任务工作区：以下为服务器默认根只读视图（非任务仓库）' : 'Task workspace not materialized: read-only server default root below (not the task repo)' }}
      </p>
      <FileTree class="ide-files__tree" :profile="null" show-files @open-entry="openEntry" />
    </div>
    <div v-else-if="tab === 'tree' && !root" class="ide-files__invalid" data-testid="ide-files-no-workspace">
      <p data-testid="ide-files-no-workspace-message">{{ noWorkspaceMessage }}</p>
      <button type="button" class="ide-files__retry" data-testid="ide-files-pick-task" @click="router.push({ name: 'ia2.board' })">
        {{ t('ide.files.pickTask', '去工作台选任务') }}
      </button>
    </div>
    <FileTree
      v-else-if="tab === 'tree'"
      class="ide-files__tree"
      :profile="null"
      :workspace-key="root"
      show-files
      @open-entry="openEntry"
    />
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
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;

  &:hover { color: var(--text-primary); }
  &.is-active {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
}

.ide-files__scope {
  margin: 0;
  padding: 3px 12px;
  font-size: 10px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ide-files__hint {
  margin: 8px 12px;
  font-size: 11px;
  color: var(--text-muted);
}

.ide-files__invalid {
  margin: 8px 12px;
  padding: 8px 10px;
  border: 1px solid var(--error-color);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-primary);

  p { margin: 0 0 6px; word-break: break-all; }
}
.ide-files__invalid-hint { color: var(--text-muted); font-size: 10.5px; }
.ide-files__actions { display: flex; gap: 6px; flex-wrap: wrap; }
.ide-files__fallback {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.ide-files__fallback-note {
  margin: 8px 12px 4px;
  padding: 6px 8px;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 40%, var(--border-color));
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-card));
  font-size: 11px;
  color: var(--text-primary);
}

.ide-files__retry {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  border-radius: 4px;
  height: 22px;
  padding: 0 10px;
  font-size: 11px;
  cursor: pointer;
}

.ide-files__tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px 8px;
}

.ide-files__git { flex: 1; min-height: 0; }
</style>
