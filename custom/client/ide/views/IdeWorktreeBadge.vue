<script setup lang="ts">
// IdeWorktreeBadge — 会话工作树隔离徽标与编排（R5，codex-product + Qoder
// 任务级 worktree 语义）。
// 两态：
//   ① 会话 workspace 位于 worktree 惯用根（.claude/.loop/worktrees）→ 隔离徽标
//      + 「回收」钮（调 /api/ide/worktree/remove 并清空绑定）；
//   ② 会话 workspace 是普通 git 仓库 → 「建隔离」钮（调 create：loop
//      WorktreeManager detached-HEAD 建 worktree 并绑定会话）。
// 编排引擎在 server（loop WorktreeManager + updateSession 绑定），本组件只做
// 状态投影与命令转发。
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { ideWorktreeApi } from '../api/worktree'
import { showToast } from '../utils/toast'

const { t } = useI18n()
const chatStore = useChatStore()
const ide = useIdeStore()

const busy = ref(false)

// 会话 workspace 优先（与 FilesPane 同源）：徽标描述的是当前会话的隔离态，
// ide.workspace 是面板级偏好，二者不一致时以会话为准
const workspace = computed(() => (chatStore.activeSession?.workspace as string | undefined) ?? ide.workspace ?? '')

// 只认两个惯例根：泛化的 '/worktrees/' 会把路径里恰有该目录的普通仓库
// （如 ~/worktrees/myrepo）误判为已隔离，点回收还会对错误的 repoRoot 发起删除
const WORKTREE_MARKERS = ['/.claude/worktrees/', '/.loop/worktrees/']

const worktreeName = computed(() => {
  const ws = workspace.value
  if (!ws) return ''
  for (const marker of WORKTREE_MARKERS) {
    const idx = ws.indexOf(marker)
    if (idx >= 0) {
      const rest = ws.slice(idx + marker.length).split(/[\\/]/).filter(Boolean)
      return rest[0] ?? ''
    }
  }
  return ''
})

// 普通仓库根（从 worktree 路径反推：.loop/worktrees/<name> 的父父级）
const repoRoot = computed(() => {
  const ws = workspace.value
  if (!ws) return ''
  for (const marker of WORKTREE_MARKERS) {
    const idx = ws.indexOf(marker)
    if (idx >= 0) return ws.slice(0, idx)
  }
  return ws
})

const isolated = computed(() => Boolean(chatStore.activeSessionId) && worktreeName.value !== '')
const canIsolate = computed(() => Boolean(chatStore.activeSessionId) && !isolated.value && workspace.value !== '')

async function createIsolation(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid || !workspace.value || busy.value) return
  busy.value = true
  try {
    const res = await ideWorktreeApi.create(sid, workspace.value)
    ide.setWorkspace(res.path)
    showToast(t('ide.worktree.created', { id: res.worktreeId }), 'info', 4000)
  } catch (err) {
    showToast(t('ide.worktree.createFailed', { message: err instanceof Error ? err.message : String(err) }), 'error', 6000)
  } finally {
    busy.value = false
  }
}

async function removeIsolation(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid || !repoRoot.value || busy.value) return
  busy.value = true
  try {
    await ideWorktreeApi.remove(sid, repoRoot.value)
    ide.setWorkspace(repoRoot.value)
    showToast(t('ide.worktree.removed'), 'info', 4000)
  } catch (err) {
    showToast(t('ide.worktree.removeFailed', { message: err instanceof Error ? err.message : String(err) }), 'error', 6000)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <span v-if="isolated" class="ide-worktree-badge" data-testid="ide-worktree-badge" :title="t('ide.worktree.title', { path: workspace })">
    ⎇ {{ worktreeName }}
    <button
      type="button"
      class="ide-worktree-badge__action"
      :disabled="busy"
      data-testid="ide-worktree-remove"
      :title="t('ide.worktree.remove')"
      @click="removeIsolation"
    >✕</button>
  </span>
  <button
    v-else-if="canIsolate"
    type="button"
    class="ide-worktree-badge ide-worktree-badge--create"
    :disabled="busy"
    data-testid="ide-worktree-create"
    :title="t('ide.worktree.createHint')"
    @click="createIsolation"
  >
    ⎇+ {{ t('ide.worktree.create') }}
  </button>
</template>

<style scoped lang="scss">
.ide-worktree-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  color: #61afef;
  background: rgba(97, 175, 239, 0.12);
  font-family: ui-monospace, monospace;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: none;
  cursor: default;

  &--create {
    cursor: pointer;
    border: 1px dashed #61afef66;
    background: none;

    &:hover:not(:disabled) { border-color: #61afef; }
    &:disabled { opacity: 0.5; cursor: default; }
  }
}

.ide-worktree-badge__action {
  border: none;
  background: none;
  color: #61afef;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  padding: 0 1px;

  &:hover:not(:disabled) { color: #e06c75; }
  &:disabled { opacity: 0.5; cursor: default; }
}
</style>
