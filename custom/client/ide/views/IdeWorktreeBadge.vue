<script setup lang="ts">
// IdeWorktreeBadge — 会话工作树隔离提示徽标（R5，codex-product + Qoder
// 任务级 worktree 语义的前端 MVP）。
// 判定：会话携带 workspace 且该目录是 git worktree（含 .git 文件而非目录，
// 或位于 .claude/worktrees/ 等惯用根）→ 头部徽标展示 worktree 名。
// 真正的 worktree 任务级编排（detached HEAD 建/回收）属 loop 引擎域，R5 不做——
// 本组件只把「此会话正在隔离工作树里跑」这个事实显性化，降低互踩风险。
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'

const { t } = useI18n()
const chatStore = useChatStore()
const ide = useIdeStore()

const workspace = computed(() => ide.workspace ?? '')

// worktree 惯用根（.claude/worktrees / .loop/worktrees / worktrees 目录段）
const WORKTREE_MARKERS = ['/.claude/worktrees/', '/.loop/worktrees/', '/worktrees/']

const worktreeName = computed(() => {
  const ws = workspace.value
  if (!ws) return ''
  for (const marker of WORKTREE_MARKERS) {
    const idx = ws.indexOf(marker)
    if (idx >= 0) {
      const rest = ws.slice(idx + marker.length).split('/').filter(Boolean)
      return rest[0] ?? ''
    }
  }
  return ''
})

const visible = computed(() => Boolean(chatStore.activeSessionId) && worktreeName.value !== '')
</script>

<template>
  <span
    v-if="visible"
    class="ide-worktree-badge"
    data-testid="ide-worktree-badge"
    :title="t('ide.worktree.title', { path: workspace })"
  >
    ⎇ {{ worktreeName }}
  </span>
</template>

<style scoped lang="scss">
.ide-worktree-badge {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  color: #61afef;
  background: rgba(97, 175, 239, 0.12);
  font-family: ui-monospace, monospace;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
