<script setup lang="ts">
// IdeReadOnlyTree — 任务工作区只读文件树（未物化兜底视图的文件区）。
// 数据源=GET /api/hermes/kanban/workspace-files（服务端按任务 workspace_path 列出，
// 已限定在任务工作区内、深度上限 4）。只展示不写入：无新建/删除/重命名入口。
import { computed } from 'vue'
import type { TaskWorkspaceFileEntry } from '../api/taskWorkspace'

const props = withDefaults(defineProps<{
  entries: TaskWorkspaceFileEntry[]
  depth?: number
}>(), { depth: 0 })

const sorted = computed(() => [...props.entries].sort((a, b) =>
  a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1))

function sizeText(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
  <ul class="ide-rotree" :data-depth="depth">
    <li v-for="entry in sorted" :key="`${depth}:${entry.name}`" class="ide-rotree__row">
      <details v-if="entry.isDir" class="ide-rotree__dir" :open="depth === 0">
        <summary class="ide-rotree__name">📁 {{ entry.name }}<span v-if="entry.children?.length" class="ide-rotree__meta">（{{ entry.children.length }}）</span></summary>
        <IdeReadOnlyTree v-if="entry.children?.length" :entries="entry.children" :depth="depth + 1" />
        <p v-else class="ide-rotree__meta">空目录</p>
      </details>
      <span v-else class="ide-rotree__name">📄 {{ entry.name }}<span class="ide-rotree__meta">{{ sizeText(entry.size) }}</span></span>
    </li>
  </ul>
</template>

<style scoped lang="scss">
.ide-rotree {
  margin: 0;
  padding-left: 14px;
  list-style: none;
  font-size: 12px;
  line-height: 1.9;
  color: var(--text-primary);
}
.ide-rotree__row { min-width: 0; }
.ide-rotree__dir > summary { cursor: pointer; user-select: none; }
.ide-rotree__name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.ide-rotree__meta { margin-left: 6px; color: var(--text-muted); font-size: 11px; }
</style>
