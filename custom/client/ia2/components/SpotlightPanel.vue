<!-- overlay/custom/client/ia2/components/SpotlightPanel.vue -->
<!-- Spotlight 混合搜索面板（element-web SpotlightDialog 吸收，2026-10-01 消息面批 #3）。
     单入口=页头既有全局搜索框（B3 驾驶舱聚焦：不新增一级入口）：
     聚焦/输入时下拉，结果三组分栏——会话与房间（useSessionRows 混排行）/
     看板任务（cockpit cockpitTasks）/命令（静态导航表）。
     键盘 ↑↓ 选择、Enter 直达、Esc 关闭；空查询时显示命令组（类 Spotlight 默认建议）。
     跳转映射与 WorkbenchView.onSelect 同源（room→selectRoom 兜底+commsRoom）。 -->
<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useSessionRows } from '../composables/useSessionRows'
import { useMsgSurfaceText } from '../i18n-msg-surface'
import { useSessionSearch } from '@/composables/useSessionSearch'

const props = defineProps<{ query: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const router = useRouter()
const matrixRoom = useMatrixRoomStore()
const cockpit = useCockpitStore()
const { sessionRows } = useSessionRows()
const tx = useMsgSurfaceText()

/** 结果行归一（分组渲染 + 键盘序） */
interface SpotRow {
  key: string
  group: 'sessions' | 'tasks' | 'commands'
  label: string
  sub: string
  icon: string
  navigate: () => void
}

const query = computed(() => props.query.trim().toLowerCase())

/** 命令表（静态导航；空查询时的默认建议面）。路由名对齐 ia2/routes.ts 真值：
    概览=ia2.dash、运行中心=ia2.runs、治理=board?tab=gov-org 深链、案例=ia2.deliveryCases、
    IDE=ide.shell（/app/ide 子路由）、设置=hermes.settings（收编路由）。 */
const COMMANDS = computed<Array<{ key: string; label: string; icon: string; to: { name: string; query?: Record<string, string> } }>>(() => [
  { key: 'overview', label: tx.value.cmdOverview, icon: '🏠', to: { name: 'ia2.dash' } },
  { key: 'board', label: tx.value.cmdBoard, icon: '📋', to: { name: 'ia2.board' } },
  { key: 'inbox', label: tx.value.cmdInbox, icon: '📥', to: { name: 'ia2.inbox' } },
  { key: 'runs', label: tx.value.cmdRuns, icon: '⚙️', to: { name: 'ia2.runs' } },
  { key: 'gov', label: tx.value.cmdGov, icon: '🏛️', to: { name: 'ia2.board', query: { tab: 'gov-org' } } },
  { key: 'cases', label: tx.value.cmdCases, icon: '📦', to: { name: 'ia2.deliveryCases' } },
  { key: 'ide', label: tx.value.cmdIde, icon: '⌨️', to: { name: 'ide.shell' } },
  { key: 'settings', label: tx.value.cmdSettings, icon: '🛠️', to: { name: 'hermes.settings' } },
])

/** 会话与房间组（v14 单一聊天列表同源行） */
const sessionHits = computed(() => {
  if (!query.value) return []
  return sessionRows.value
    .filter((s) => s.name.toLowerCase().includes(query.value)
      || s.taskIds.some((id) => id.toLowerCase().includes(query.value)))
    .slice(0, 6)
})

/** 看板任务组（cockpit tasks：标题/任务号匹配） */
const taskHits = computed(() => {
  if (!query.value) return []
  const tasks = (cockpit as any).cockpitTasksAny as Array<{ id: string; title?: string; name?: string }> | undefined
  if (!Array.isArray(tasks)) return []
  return tasks
    .filter((tk) => (tk.id || '').toLowerCase().includes(query.value)
      || String(tk.title ?? tk.name ?? '').toLowerCase().includes(query.value))
    .slice(0, 6)
})

const commandHits = computed(() => {
  if (!query.value) return COMMANDS.value
  return COMMANDS.value.filter((c) => c.label.toLowerCase().includes(query.value))
})

/** 分组归一的键盘序行集 */
const rows = computed<SpotRow[]>(() => {
  const out: SpotRow[] = []
  for (const s of sessionHits.value) {
    out.push({
      key: `s:${s.kind}:${s.id}`,
      group: 'sessions',
      label: s.name,
      sub: s.kind,
      icon: s.kind === 'room' ? '#' : s.kind === 'group' ? '👥' : '💬',
      navigate: () => {
        if (s.kind === 'room') {
          matrixRoom.selectRoom(s.id)
          void router.push({ name: 'ia2.commsRoom', params: { roomId: s.id } })
        } else if (s.kind === 'group') {
          void router.push({ name: 'ia2.groupRoom', params: { roomId: s.id } })
        } else {
          void router.push({ name: 'ia2.collabSession', params: { sessionId: s.id } })
        }
      },
    })
  }
  for (const tk of taskHits.value) {
    out.push({
      key: `t:${tk.id}`,
      group: 'tasks',
      label: String(tk.title ?? tk.name ?? tk.id),
      sub: tk.id,
      icon: '📋',
      navigate: () => void router.push({ name: 'ia2.board', query: { task: tk.id } }),
    })
  }
  for (const c of commandHits.value) {
    out.push({
      key: `c:${c.key}`,
      group: 'commands',
      label: c.label,
      sub: '',
      icon: c.icon,
      navigate: () => void router.push(c.to as never),
    })
  }
  return out
})

const activeIndex = ref(0)
watch(() => rows.value.length, (n) => {
  if (activeIndex.value >= n) activeIndex.value = 0
})

function move(delta: number) {
  const n = rows.value.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
}

function activate(index?: number) {
  const row = rows.value[index ?? activeIndex.value]
  if (!row) return
  row.navigate()
  emit('close')
}

const listRef = ref<HTMLElement | null>(null)
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  else if (e.key === 'Enter') { e.preventDefault(); activate() }
  else if (e.key === 'Escape') { e.preventDefault(); emit('close') }
  if (listRef.value) {
    nextTick(() => {
      listRef.value?.querySelector('.spot__row--on')?.scrollIntoView({ block: 'nearest' })
    })
  }
}
defineExpose({ onKeydown })

/** 会话全文深搜升级行（2026-10-01 上游自用批 A2）：Spotlight 是混合对象快搜，
 *  消息级全文检索升级出口=上游 SessionSearchModal（全局挂载于 App.vue，
 *  此前 overlay 侧零调用方——本条接线即全部成本）。 */
const { openSessionSearch } = useSessionSearch()
function openDeepSearch() {
  emit('close')
  openSessionSearch()
}

function groupLabel(g: SpotRow['group']): string {
  return g === 'sessions' ? tx.value.groupSessions : g === 'tasks' ? tx.value.groupTasks : tx.value.groupCommands
}
</script>

<template>
  <div class="spot" data-testid="spotlight-panel" @click.stop @keydown="onKeydown">
    <div v-if="!rows.length" class="spot__empty">{{ tx.groupEmpty }}</div>
    <div v-else ref="listRef" class="spot__list">
      <template v-for="(row, i) in rows" :key="row.key">
        <div v-if="i === 0 || rows[i - 1].group !== row.group" class="spot__group">{{ groupLabel(row.group) }}</div>
        <button
          type="button"
          class="spot__row"
          :class="{ 'spot__row--on': i === activeIndex }"
          :data-testid="`spotlight-row-${row.key}`"
          @mouseenter="activeIndex = i"
          @click="activate(i)"
        >
          <span class="spot__icon">{{ row.icon }}</span>
          <span class="spot__label">{{ row.label }}</span>
          <span v-if="row.sub" class="spot__sub">{{ row.sub }}</span>
        </button>
      </template>
    </div>
    <button type="button" class="spot__foot" data-testid="spotlight-deep-search" @click="openDeepSearch">
      {{ tx.deepSearchSessions }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.spot {
  position: absolute;
  top: 100%;
  left: 0;
  width: 420px;
  max-width: calc(100vw - 32px);
  max-height: 380px;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  z-index: 1000;
  overflow: hidden;
}

.spot__empty {
  padding: 24px 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.spot__list { overflow-y: auto; padding: 4px 0; }

.spot__foot {
  display: block;
  width: 100%;
  padding: 7px 12px;
  border: none;
  border-top: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  text-align: left;
  cursor: pointer;
}
.spot__foot:hover { color: var(--text-primary); background: var(--bg-hover, rgba(0, 0, 0, 0.04)); }

.spot__group {
  padding: 6px 12px 2px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.spot__row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  text-align: left;

  &:hover, &.spot__row--on { background: var(--bg-secondary); }
}

.spot__icon { flex-shrink: 0; font-size: 12px; width: 18px; text-align: center; }

.spot__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-primary);
}

.spot__sub {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
}
</style>
