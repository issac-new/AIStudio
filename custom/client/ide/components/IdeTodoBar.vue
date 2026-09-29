<script setup lang="ts">
// IdeTodoBar — todo 常驻条（B5，mcode/kimi Ctrl-T 常驻 todo 面板对照的 /ide 形态）。
// 数据源=当前会话最新一条 todo 类工具消息（todo_list 全量快照语义：每次调用
// 携带完整清单，取最新一条即当前态）。常驻条显示 进度 n/m + 进行中项；点击展开
// 完整清单。无 todo 工具消息时不渲染（自隐藏）。
import { computed, ref } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { parseTodoContent, type TodoItem, type TodoStatus } from '../utils/todo-parse'

const chat = useChatStore()
const expanded = ref(false)

/** 最新一条 todo 类工具消息内容（todo_list 全量快照语义） */
const latestTodoContent = computed(() => {
  const msgs = (chat.activeSession?.messages ?? []) as Array<Record<string, unknown>>
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role !== 'tool') continue
    const name = String(m.toolName ?? m.tool_name ?? '').toLowerCase()
    if (name.includes('todo')) return String(m.content ?? '')
  }
  return ''
})

const items = computed<TodoItem[]>(() => parseTodoContent(latestTodoContent.value))
const doneCount = computed(() => items.value.filter((i) => i.status === 'completed').length)
const currentItem = computed(() => items.value.find((i) => i.status === 'in_progress') ?? null)
const nextPending = computed(() => items.value.find((i) => i.status === 'pending') ?? null)

const STATUS_ICON: Record<TodoStatus, string> = { completed: '☑', in_progress: '◐', pending: '☐' }
</script>

<template>
  <div v-if="items.length" class="ide-todo" data-testid="ide-todo-bar">
    <button type="button" class="ide-todo__head" data-testid="ide-todo-head" @click="expanded = !expanded">
      <span class="ide-todo__chev">{{ expanded ? '▾' : '▸' }}</span>
      ☑ 待办 {{ doneCount }}/{{ items.length }}
      <span v-if="currentItem" class="ide-todo__current" data-testid="ide-todo-current">◐ {{ currentItem.text }}</span>
      <span v-else-if="nextPending" class="ide-todo__next">☐ 下一项：{{ nextPending.text }}</span>
    </button>
    <ol v-if="expanded" class="ide-todo__list" data-testid="ide-todo-list">
      <li v-for="(it, i) in items" :key="i" :class="`is-${it.status}`">
        {{ STATUS_ICON[it.status] }} {{ it.text }}
      </li>
    </ol>
  </div>
</template>

<style scoped lang="scss">
.ide-todo { margin: 4px 12px; font-size: 11px; }
.ide-todo__head {
  display: flex; gap: 6px; align-items: baseline; width: 100%; text-align: left;
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 6px;
  padding: 4px 8px; cursor: pointer; color: var(--text-color-2, #666);
}
.ide-todo__chev { color: var(--text-color-3, #999); }
.ide-todo__current { color: var(--warning-color, #f0a020); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-todo__next { color: var(--text-color-3, #999); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-todo__list { margin: 4px 0 0; padding: 4px 8px 4px 24px; border-left: 2px solid var(--border-color, #eee); }
.ide-todo__list li { padding: 1px 0; }
.ide-todo__list li.is-completed { color: var(--text-color-3, #999); text-decoration: line-through; }
.ide-todo__list li.is-in_progress { color: var(--warning-color, #f0a020); }
</style>
