<script setup lang="ts">
// IdeTurnRail — 轮导航 rail（UI 融合 UI-1，dsh TurnNavigator 吸收落地）。
// 数据面=cockpit/adapters/turn-outline.ts（轮轮廓投影）；跳转=chatStore.focusMessageId
// →MessageList.scrollToMessage 既有链（不新造滚动机制）。悬停展开该轮锚点与工具数。
import { computed } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { buildTurnOutline, type OutlineEvent } from '../../cockpit/adapters/turn-outline'
import { fetchEngineRows, findForkAnchor, forkAtAnchor } from '../utils/zcode-fork'
import { useIdeStore } from '../store/ide'
import { defineSection, moveTurn, type SessionSection } from '../../../server/sections/session-sections'

const chatStore = useChatStore()
const ide = useIdeStore()

// ── 会话分节（吸收第一批 C1，codex §三：长会话分节+手动 move）──
// 分节=纯视图重组（localStorage per session，不动物理消息序）；右键轮项移节。
const SECTION_COLORS = ['#18a058', '#2080f0', '#f0a020', '#8b5cf6', '#d03050']

function sectionsKey(sid: string | null | undefined): string {
  return `ide_sections_${sid ?? 'none'}`
}
function loadSections(): SessionSection[] {
  try {
    const raw = JSON.parse(localStorage.getItem(sectionsKey(chatStore.activeSessionId)) ?? '[]')
    return Array.isArray(raw) ? raw : []
  } catch { return [] }
}
function saveSections(next: SessionSection[]): void {
  localStorage.setItem(sectionsKey(chatStore.activeSessionId), JSON.stringify(next))
}
function sectionOf(turnIndex: number, sections: SessionSection[]): number {
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].turnIndices.includes(turnIndex)) return i
  }
  return -1
}
function moveToSection(turnIndex: number): void {
  const title = window.prompt('移至分节（输入节名；新名=建节）')?.trim()
  if (!title) return
  let next = defineSection(loadSections(), `sec-${title}`, title)
  const target = next.find((s) => s.title === title)
  const current = next.find((s) => s.turnIndices.includes(turnIndex))
  if (current && target && current.sectionId !== target.sectionId) {
    next = moveTurn(next, current.sectionId, target.sectionId, turnIndex)
  } else if (target && !current) {
    next = next.map((s) => (s.sectionId === target.sectionId ? { ...s, turnIndices: [...s.turnIndices, turnIndex].sort((a, b) => a - b) } : s))
  }
  saveSections(next)
}
const sectionTitles = computed<SessionSection[]>(() => loadSections())

interface TurnRow {
  turnIndex: number
  anchor: string
  steps: number
  toolCalls: number
  durationMs: number
  firstMessageId: string
}

const rows = computed<TurnRow[]>(() => {
  const messages = chatStore.activeSession?.messages ?? []
  const events: Array<OutlineEvent & { messageId: string }> = []
  for (const m of messages) {
    const role = m.role
    if (role === 'user') {
      events.push({ kind: 'user', at: Date.parse(String(m.created_at ?? '')) || 0, text: typeof m.content === 'string' ? m.content : '', messageId: String(m.id) })
    } else if (role === 'assistant') {
      const toolCalls = Array.isArray((m as { tool_calls?: unknown }).tool_calls) ? (m as { tool_calls: unknown[] }).tool_calls.length : 0
      if (toolCalls > 0) {
        for (let i = 0; i < toolCalls; i += 1) {
          events.push({ kind: 'tool', at: Date.parse(String(m.created_at ?? '')) || 0, toolName: 'call', messageId: String(m.id) })
        }
      } else {
        events.push({ kind: 'assistant', at: Date.parse(String(m.created_at ?? '')) || 0, messageId: String(m.id) })
      }
    }
  }
  const outline = buildTurnOutline(events)
  return outline.map((entry) => ({
    turnIndex: entry.turnIndex,
    anchor: entry.anchor,
    steps: entry.steps,
    toolCalls: entry.toolCalls,
    durationMs: entry.durationMs,
    firstMessageId: events[entry.startIndex]?.messageId ?? '',
  }))
})

function jump(row: TurnRow, ev?: MouseEvent): void {
  if (ev?.shiftKey) {
    void forkFromTurn()
    return
  }
  if (row.firstMessageId) chatStore.focusMessageId = row.firstMessageId
}

/** ⇧点击：从该会话最新稳定 assistant 行分叉（zcode v4 forkAssistant）。 */
async function forkFromTurn(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid || !ide.workspace) return
  try {
    const rows = await fetchEngineRows(ide.workspace, sid)
    const anchor = findForkAnchor(rows)
    if (!anchor) {
      window.alert('未找到可分叉的稳定 assistant 行（需至少一条完整回复）')
      return
    }
    await forkAtAnchor(ide.workspace, sid, anchor)
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err))
  }
}

function fmt(ms: number): string {
  if (!ms) return ''
  const s = Math.round(ms / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`
}
</script>

<template>
  <nav v-if="rows.length > 1" class="ide-turn-rail" data-testid="ide-turn-rail" aria-label="turn navigator">
    <div
      v-for="row in rows"
      :key="row.turnIndex"
      class="ide-turn-rail__row"
      :class="{ 'has-section': sectionOf(row.turnIndex, sectionTitles) >= 0 }"
      :style="sectionOf(row.turnIndex, sectionTitles) >= 0 ? { borderRight: `3px solid ${SECTION_COLORS[sectionOf(row.turnIndex, sectionTitles) % SECTION_COLORS.length]}` } : {}"
      :data-testid="`ide-turn-rail-${row.turnIndex}`"
      :title="`#${row.turnIndex + 1} ${row.anchor} · ${row.steps} steps · ${row.toolCalls} tools · ${fmt(row.durationMs)} · ⇧点击分叉 · 右键分节` + (sectionOf(row.turnIndex, sectionTitles) >= 0 ? ` · 节：${sectionTitles[sectionOf(row.turnIndex, sectionTitles)].title}` : '')"
      @click="jump(row, $event)"
      @contextmenu.prevent="moveToSection(row.turnIndex)"
    >
      <span class="ide-turn-rail__idx">{{ row.turnIndex + 1 }}</span>
      <span v-if="row.toolCalls" class="ide-turn-rail__tools">{{ row.toolCalls }}</span>
    </div>
  </nav>
</template>

<style scoped lang="scss">
.ide-turn-rail {
  position: absolute;
  right: 2px;
  top: 8px;
  bottom: 8px;
  width: 22px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  z-index: 5;
  opacity: 0.45;
  transition: opacity 0.15s;
}

.ide-turn-rail:hover {
  opacity: 1;
}

.ide-turn-rail__row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 1px 3px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  line-height: 1.4;
  color: var(--text-color-3, #999);
}

.ide-turn-rail__row:hover {
  background: var(--hover-color, rgba(0, 0, 0, 0.08));
  color: var(--primary-color, #18a058);
}

.ide-turn-rail__tools {
  font-size: 10px;
  background: var(--hover-color, rgba(0, 0, 0, 0.08));
  border-radius: 3px;
  padding: 0 2px;
}
</style>
