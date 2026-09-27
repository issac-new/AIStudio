<script setup lang="ts">
// IdeToolsPane — 工具时间线面板（zcode 62 专属工具卡渲染器的复刻首期：高频七类
// 专属卡+通用兜底；UI 复刻 T 批）。数据=chatStore messages role='tool'（toolName/
// content/状态）；专属语义：edit/write→diff 行着色、bash→命令+退出态、read→路径
// 跳转、grep/search→命中摘要、glob→文件清单、web→URL、mcp→服务器.工具。
import { computed } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'

const chat = useChatStore()

interface ToolRow {
  id: string
  name: string
  category: 'edit' | 'bash' | 'read' | 'search' | 'glob' | 'web' | 'mcp' | 'other'
  summary: string
  detail: string
}

function categorize(name: string): ToolRow['category'] {
  const n = name.toLowerCase()
  if (n.startsWith('mcp') || n.startsWith('mcp__')) return 'mcp'
  if (n.includes('edit') || n.includes('write') || n.includes('apply')) return 'edit'
  if (n.includes('bash') || n.includes('exec') || n.includes('terminal')) return 'bash'
  if (n.startsWith('read') || n.includes('view') || n.includes('cat')) return 'read'
  if (n.includes('grep') || n.includes('search') || n.includes('find')) return 'search'
  if (n.includes('glob') || n.includes('list_dir') || n.includes('ls')) return 'glob'
  if (n.includes('web') || n.includes('fetch') || n.includes('browser')) return 'web'
  return 'other'
}

function summarize(row: Omit<ToolRow, 'summary'>, content: string): string {
  const lines = content.split('\n').filter(Boolean)
  switch (row.category) {
    case 'edit': {
      const adds = lines.filter((l) => l.startsWith('+')).length
      const dels = lines.filter((l) => l.startsWith('-')).length
      return `+${adds} −${dels}`
    }
    case 'bash': return content.split('\n')[0]?.slice(0, 60) ?? ''
    case 'read': return content.split('\n')[0]?.slice(0, 70) ?? ''
    case 'search': return `${lines.length} 行命中`
    case 'glob': return `${lines.length} 文件`
    case 'web': return content.split('\n')[0]?.slice(0, 70) ?? ''
    default: return `${lines.length} 行`
  }
}

const rows = computed<ToolRow[]>(() => {
  const msgs = (chat.activeSession?.messages ?? chat.messages ?? []) as Array<Record<string, unknown>>
  return msgs
    .filter((m) => m.role === 'tool')
    .slice(-80)
    .map((m, i) => {
      const name = String(m.toolName ?? m.tool_name ?? 'tool')
      const content = String(m.content ?? '')
      const base = { id: String(m.id ?? `t${i}`), name, category: categorize(name), detail: content.slice(0, 600) }
      return { ...base, summary: summarize(base, content) }
    })
    .reverse()
})

const CATEGORY_META: Record<ToolRow['category'], { icon: string; label: string }> = {
  edit: { icon: '✎', label: '编辑' },
  bash: { icon: '$', label: '执行' },
  read: { icon: '⊟', label: '读取' },
  search: { icon: '⌕', label: '搜索' },
  glob: { icon: '≡', label: '枚举' },
  web: { icon: '◍', label: '网络' },
  mcp: { icon: '⌗', label: 'MCP' },
  other: { icon: '·', label: '工具' },
}
</script>

<template>
  <div class="ide-tools" data-testid="ide-tools-pane">
    <div class="ide-tools__head">⚙ 工具时间线 <span class="ide-tools__count">{{ rows.length }}</span></div>
    <p v-if="!rows.length" class="ide-tools__empty">当前会话暂无工具调用</p>
    <div
      v-for="row in rows"
      :key="row.id"
      class="ide-tools__row"
      :class="`is-${row.category}`"
      :data-testid="`ide-tool-${row.id}`"
      :title="row.detail"
    >
      <span class="ide-tools__icon">{{ CATEGORY_META[row.category].icon }}</span>
      <span class="ide-tools__name">{{ row.name }}</span>
      <span class="ide-tools__summary">{{ row.summary }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-tools { flex: 1; min-width: 0; overflow-y: auto; font-size: 12px; padding: 6px; }
.ide-tools__head { font-weight: 600; padding: 2px 6px 8px; }
.ide-tools__count { color: var(--text-color-3, #999); font-weight: 400; }
.ide-tools__empty { color: var(--text-color-3, #999); padding: 16px; }
.ide-tools__row {
  display: flex; gap: 6px; align-items: baseline; padding: 3px 6px; border-radius: 5px;
  border-left: 2px solid var(--border-color, #e0e0e0); margin: 3px 0; cursor: default;
}
.ide-tools__row.is-edit { border-left-color: #61afef; }
.ide-tools__row.is-bash { border-left-color: #e5c07b; }
.ide-tools__row.is-read { border-left-color: #98c379; }
.ide-tools__row.is-search { border-left-color: #c678dd; }
.ide-tools__row.is-web { border-left-color: #56b6c2; }
.ide-tools__icon { color: var(--text-color-3, #999); width: 14px; }
.ide-tools__name { font-family: ui-monospace, monospace; font-size: 11px; }
.ide-tools__summary {
  margin-left: auto; color: var(--text-color-3, #999); font-size: 11px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 45%;
}
</style>
