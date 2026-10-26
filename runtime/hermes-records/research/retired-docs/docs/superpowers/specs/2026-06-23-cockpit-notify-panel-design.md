# Cockpit 右上角"通知"功能设计

**日期**：2026-06-23
**状态**：待评审
**基线设计**：`docs/superpowers/specs/2026-06-22-swarm-studio-cockpit-design.md`（§5.1 顶栏第 6 项）
**原型**：`.superpowers/brainstorm/42060-1782212737/content/notify-design.html`
**适用项目**：`overlay/custom/client/cockpit/`

---

## 1. 背景

驾驶舱顶栏已有"通知"按钮（`CockpitTopBar.vue`），带红色角标 `notifyCount`，emit `notify` 事件。当前实现存在两个问题：

1. **角标硬编码**：`CockpitView.vue` 写死 `:notify-count="3"`，非真实数据
2. **行为占位**：`@notify="store.openHistory()"` — 点击通知打开的是历史弹窗（任务事件维度），与"通知"语义不符

设计文档原文（§5.1 第 6 项）：
> **通知按钮** `通知 [n]`：红色角标=未读数，点击复用历史弹窗样式

本设计将"通知"实现为**未读聊天消息**的通知面板：聚合 Matrix / 单聊 / 群聊三类未读消息，点击条目进入对应聊天窗口。与"注意力条"（任务维度）解耦，专注聊天维度。

## 2. 数据源审计

三类聊天系统的未读数据现状：

| 来源 | 未读数据 | Preview | 路由 | 缺口 |
|------|---------|---------|------|------|
| **Matrix** | ✅ 已有 `getRoomUnreadCount(room)`（SDK 跟踪 Total+Highlight），响应式（`RoomEvent.Receipt`/`Timeline` 触发 `roomList` 重快照） | 需新增：遍历 `room.timeline` 取最后一条 `m.room.message` 的 body+sender | `hermes.matrixChatRoom { roomId }` | preview helper |
| **单聊 Chat** | ⚠️ 仅有 `completedUnreadSessions` Set（助手运行完成时标记，二值，非计数） | 固定文案"助手运行完成，请查看结果"（无消息 preview 可用） | `hermes.session { sessionId } query:{profile}` | 无（接受二值语义） |
| **群聊 Group** | ❌ **完全没有**未读跟踪，`RoomInfo` 无 `lastMessage`/`updatedAt` 字段 | 需从 socket `message` 事件实时捕获 | `hermes.groupChatRoom { roomId }` | 需新增 patch 构建内存 unreadMap + lastMessageMap |

## 3. 设计

### 3.1 新增 `notify-adapter.ts`（数据归一）

**文件**：`overlay/custom/client/cockpit/adapters/notify-adapter.ts`（新增）

将三类异构的未读数据归一为统一的 `NotifyItem`：

```ts
import type { RouteLocationRaw } from 'vue-router'

export type NotifyKind = 'matrix' | 'chat' | 'group'

export interface NotifyItem {
  id: string                  // 唯一键：`<kind>:<roomId/sessionId>`
  kind: NotifyKind
  title: string               // 房间名 / 会话标题
  preview: string             // 最后一条消息预览（单行截断）
  ts: number                  // 最后消息时间戳（毫秒，用于排序）
  count: number               // 未读计数（单聊恒为 1）
  routeTarget: RouteLocationRaw
}
```

三个纯函数适配器：

```ts
/** Matrix：从 SDK room 提取未读项 */
export function fromMatrixRoom(room: any, getRoomUnreadCount: (r: any) => number): NotifyItem | null {
  const count = getRoomUnreadCount(room)
  if (!count) return null
  // 遍历 timeline 倒序找最后一条 m.room.message
  let preview = ''
  let ts = 0
  let sender = ''
  for (let i = room.timeline.length - 1; i >= 0; i--) {
    const evt = room.timeline[i]
    if (evt.getType() === 'm.room.message') {
      preview = evt.getContent()?.body ?? ''
      ts = evt.getTs() || 0
      sender = evt.getSender() ?? ''
      break
    }
  }
  const name = room.name || room.roomId
  return {
    id: `matrix:${room.roomId}`,
    kind: 'matrix',
    title: name,
    preview: sender ? `${shorten(sender)}: ${preview}` : preview,
    ts,
    count,
    routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId: room.roomId } },
  }
}

/** 单聊：从 Session 提取未读项（仅 completedUnread 二值） */
export function fromChatSession(session: { id: string; title: string; profile?: string | null; updatedAt?: string; lastActiveAt?: string | number | null }): NotifyItem | null {
  const ts = toMs(session.lastActiveAt ?? session.updatedAt)
  return {
    id: `chat:${session.id}`,
    kind: 'chat',
    title: session.title || session.id,
    preview: '助手运行完成，请查看结果',
    ts,
    count: 1,
    routeTarget: { name: 'hermes.session', params: { sessionId: session.id }, query: session.profile ? { profile: session.profile } : {} },
  }
}

/** 群聊：从 RoomInfo + 内存 unreadMap/lastMessageMap 提取 */
export function fromGroupRoom(room: { id: string; name: string }, unreadCount: number, lastMsg: { content: string; senderName: string; ts: number } | null): NotifyItem | null {
  if (!unreadCount) return null
  const preview = lastMsg ? (lastMsg.senderName ? `${lastMsg.senderName}: ${lastMsg.content}` : lastMsg.content) : `${unreadCount} 条新消息`
  return {
    id: `group:${room.id}`,
    kind: 'group',
    title: room.name || room.id,
    preview,
    ts: lastMsg?.ts ?? 0,
    count: unreadCount,
    routeTarget: { name: 'hermes.groupChatRoom', params: { roomId: room.id } },
  }
}

function toMs(t: string | number | null | undefined): number {
  if (t == null) return 0
  const n = typeof t === 'number' ? t : Date.parse(t)
  return Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : 0
}

function shorten(sender: string): string {
  // Matrix userId 形如 @name:server.org → 取 name
  const m = /^@?([^:]+)/.exec(sender)
  return m ? m[1] : sender
}
```

### 3.2 群聊未读跟踪 patch

**新 patch**：`overlay/patches/081-group-chat-unread-tracking.patch`

在 `upstream/.../stores/hermes/group-chat.ts` 中新增：

```ts
// 新增 state（内存态，刷新后重置 — 已确认接受）
const unreadCounts = ref<Record<string, number>>({})
const lastMessageMap = ref<Record<string, { content: string; senderName: string; ts: number }>>({})

// 修改 socket.on('message', ...) handler，在现有逻辑外增加：
//   if (msg.roomId !== currentRoomId.value) {
//     unreadCounts.value = { ...unreadCounts.value, [msg.roomId]: (unreadCounts.value[msg.roomId] ?? 0) + 1 }
//     lastMessageMap.value = { ...lastMessageMap.value, [msg.roomId]: { content: msg.content, senderName: msg.senderName, ts: Date.now() } }
//   }
// （对 message_stream_end 同样处理，取最终 content）

// 进入房间时清零：
//   joinRoom(roomId) 成功后 → unreadCounts.value[roomId] = 0（删除 key）

// 新增方法：
function clearRoomUnread(roomId: string) {
  if (!unreadCounts.value[roomId]) return
  const next = { ...unreadCounts.value }
  delete next[roomId]
  unreadCounts.value = next
}
function clearAllUnread() {
  unreadCounts.value = {}
}
function getRoomUnread(roomId: string): number {
  return unreadCounts.value[roomId] ?? 0
}

// export 新增：unreadCounts, lastMessageMap, clearRoomUnread, clearAllUnread, getRoomUnread
```

**patch 边界**：仅修改 `socket.on('message')` 和 `joinRoom` 两处，新增 state + 3 个方法 + export。不改动现有消息处理逻辑。

### 3.3 store 扩展（`cockpit.ts`）

**文件**：`overlay/custom/client/cockpit/store/cockpit.ts`（修改）

新增通知相关 state + computed + 方法：

```ts
// ── 通知（未读聊天聚合）──
const notifyOpen = ref(false)
const notifySourceFilter = ref<NotifyKind | 'all'>('all')

const notifyItems = computed<NotifyItem[]>(() => {
  const items: NotifyItem[] = []

  // Matrix
  for (const room of (matrixRoom as any).sortedRooms ?? []) {
    const item = notifyAdapter.fromMatrixRoom(room, (r: any) => (matrixRoom as any).getRoomUnreadCount(r))
    if (item) items.push(item)
  }

  // 单聊
  for (const s of (chatStore as any).sessions ?? []) {
    if ((chatStore as any).isSessionCompletedUnread?.(s.id)) {
      const item = notifyAdapter.fromChatSession(s)
      if (item) items.push(item)
    }
  }

  // 群聊
  for (const r of (groupStore as any).rooms ?? []) {
    const cnt = (groupStore as any).getRoomUnread?.(r.id) ?? 0
    if (cnt > 0) {
      const last = (groupStore as any).lastMessageMap?.[r.id] ?? null
      const item = notifyAdapter.fromGroupRoom(r, cnt, last)
      if (item) items.push(item)
    }
  }

  return items.sort((a, b) => b.ts - a.ts)  // 新在前
})

const notifyCount = computed(() =>
  notifyItems.value.reduce((n, i) => n + i.count, 0),
)

const filteredNotifyItems = computed(() => {
  const f = notifySourceFilter.value
  if (f === 'all') return notifyItems.value
  return notifyItems.value.filter(i => i.kind === f)
})

function openNotify() { notifyOpen.value = true }
function closeNotify() { notifyOpen.value = false }
function setNotifySourceFilter(f: NotifyKind | 'all') { notifySourceFilter.value = f }

// 点击通知条目：清零 + 关闭（路由跳转由组件层处理）
function clearNotifyItemUnread(item: NotifyItem) {
  switch (item.kind) {
    case 'matrix':
      // Matrix 未读由 SDK 管理，进入房间后自动 setReadMarker 清零
      break
    case 'chat':
      (chatStore as any).clearSessionCompletedUnread?.(item.id.replace('chat:', ''))
      break
    case 'group':
      (groupStore as any).clearRoomUnread?.(item.id.replace('group:', ''))
      break
  }
}

function clearAllNotify() {
  for (const item of notifyItems.value) clearNotifyItemUnread(item)
}

// return 新增：notifyOpen, notifySourceFilter, notifyItems, filteredNotifyItems, notifyCount,
//             openNotify, closeNotify, setNotifySourceFilter, clearNotifyItemUnread, clearAllNotify
```

**路由跳转说明**：store 内无法直接用 `useRouter()`（需 setup 上下文），故**路由跳转放在组件层**。`CockpitNotifyModal` 在点击条目时调用 `store.clearNotifyItemUnread(item) + store.closeNotify()`，再用组件内的 `useRouter().push(item.routeTarget)` 跳转。store 仅管未读清零与弹窗开关，组件管导航 —— 职责清晰，无需 `bindCockpitRouter` 注入。

### 3.4 新增 `CockpitNotifyModal.vue`

**文件**：`overlay/custom/client/cockpit/components/CockpitNotifyModal.vue`（新增）

复用 `CockpitHistoryModal.vue` 的结构（头部 + 筛选 + 列表 + 关闭），但内容为通知项。Pure Ink 样式，沿用 CSS 变量。

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import type { NotifyKind } from '@/custom/cockpit/adapters/notify-adapter'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()  // 组件层持有 router，处理跳转

const SOURCES: { key: NotifyKind | 'all'; labelKey: string }[] = [
  { key: 'all', labelKey: 'cockpit.notifyAll' },
  { key: 'matrix', labelKey: 'cockpit.notifyMatrix' },
  { key: 'chat', labelKey: 'cockpit.notifyChat' },
  { key: 'group', labelKey: 'cockpit.notifyGroup' },
]

const items = computed(() => store.filteredNotifyItems)
const KIND_ICON: Record<NotifyKind, string> = { matrix: 'M', chat: 'A', group: 'G' }
const KIND_LABEL: Record<NotifyKind, string> = { matrix: 'matrix', chat: '单聊', group: '群聊' }

function timeStr(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const pad = (n: number) => String(n).padStart(2, '0')
  return sameDay ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 点击条目：store 清零 + 关闭，组件层 router.push
function onItemClick(item: NotifyItem) {
  store.clearNotifyItemUnread(item)
  store.closeNotify()
  router.push(item.routeTarget)
}
</script>

<template>
  <div class="cockpit-notify-modal">
    <div class="cockpit-notify-modal__head">
      <span class="cockpit-notify-modal__title">
        🔔 {{ t('cockpit.notifyTitle') }}
        <span class="cockpit-notify-modal__sub">· {{ store.notifyCount }} {{ t('cockpit.notifyUnread') }}</span>
      </span>
      <button type="button" class="cockpit-notify-modal__close" @click="store.closeNotify()">✕</button>
    </div>
    <div class="cockpit-notify-modal__filters">
      <span class="cockpit-notify-modal__flabel">{{ t('cockpit.notifySource') }}</span>
      <button v-for="s in SOURCES" :key="s.key" type="button"
        class="cockpit-notify-modal__chip" :class="{ 'is-on': store.notifySourceFilter === s.key }"
        @click="store.setNotifySourceFilter(s.key)">{{ t(s.labelKey) }}</button>
    </div>
    <div class="cockpit-notify-modal__list">
      <button v-for="item in items" :key="item.id" type="button"
        class="cockpit-notify-modal__item" @click="onItemClick(item)">
        <span class="cockpit-notify-modal__avatar" :class="'is-' + item.kind">{{ KIND_ICON[item.kind] }}</span>
        <div class="cockpit-notify-modal__body">
          <div class="cockpit-notify-modal__row1">
            <span class="cockpit-notify-modal__kind">{{ KIND_LABEL[item.kind] }}</span>
            <span class="cockpit-notify-modal__name">{{ item.title }}</span>
            <span class="cockpit-notify-modal__when">{{ timeStr(item.ts) }}</span>
          </div>
          <div class="cockpit-notify-modal__preview">{{ item.preview }}</div>
        </div>
        <span class="cockpit-notify-modal__count" :class="{ 'is-highlight': item.kind === 'matrix' && item.count > 1 }">{{ item.count }}</span>
      </button>
      <div v-if="!items.length" class="cockpit-notify-modal__empty">
        {{ t('cockpit.notifyEmpty') }}
      </div>
    </div>
    <div class="cockpit-notify-modal__foot">
      <span class="cockpit-notify-modal__hint">{{ t('cockpit.notifyClickHint') }}</span>
      <button v-if="items.length" type="button" class="cockpit-notify-modal__readall" @click="store.clearAllNotify()">
        {{ t('cockpit.notifyReadAll') }}
      </button>
    </div>
  </div>
</template>
```

**样式**：完全复用 HistoryModal 的 CSS 变量与间距体系（Pure Ink），仅微调：列表项含头像 + 双行（标题行 + preview 行）。无新色值。

### 3.5 接线（`CockpitView.vue` + `CockpitTopBar.vue`）

**`CockpitView.vue` 修改**：

```vue
// 1. import 新组件
import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'

onMounted(() => { store.bootstrap() })

// 2. TopBar：notify-count 改为真实数据，@notify 改为 openNotify
<CockpitTopBar
  :agent-count="3"
  :human-count="2"
  :notify-count="store.notifyCount"     <!-- 替换硬编码 3 -->
  :schedule-count="2"
  :user-name="store.currentUserName"
  @schedule="store.openHistory()"
  @notify="store.openNotify()"           <!-- 替换 openHistory -->
  @search="() => {}"
  @settings="goSettings"
/>

// 3. 模板末尾：新增通知弹窗（与 history overlay/modal 并列）
<div v-if="store.notifyOpen" class="cockpit-overlay" @click="store.closeNotify()" />
<CockpitNotifyModal v-if="store.notifyOpen" class="cockpit-modal-anchor" />
```

**`CockpitTopBar.vue` 不变**（已有 `notify` emit + `notifyCount` prop + 红色 `cockpit-top__bdg--err` 角标）。仅文案"通知"改 i18n（见 3.6）。

### 3.6 i18n（新增 keys）

**patch**：`overlay/patches/082-i18n-cockpit-notify.patch`（修改 `zh.ts` / `en.ts`）

```
cockpit.notifyTitle: '通知' / 'Notifications'
cockpit.notifyUnread: '条未读' / 'unread'
cockpit.notifySource: '来源' / 'Source'
cockpit.notifyAll: '全部' / 'All'
cockpit.notifyMatrix: 'Matrix' / 'Matrix'
cockpit.notifyChat: '单聊' / 'Chat'
cockpit.notifyGroup: '群聊' / 'Group'
cockpit.notifyEmpty: '没有未读消息' / 'No unread messages'
cockpit.notifyClickHint: '点击条目进入对应聊天' / 'Click an item to open the chat'
cockpit.notifyReadAll: '全部标为已读' / 'Mark all as read'
```

## 4. 数据流

```
Matrix SDK (RoomEvent.Receipt/Timeline)
   ↓ roomList 响应式重快照
matrixRoom.sortedRooms + getRoomUnreadCount(room)
   ┐
chatStore.sessions + isSessionCompletedUnread(id)    ─→  notifyItems (computed)
   ┤                                                    ↓ sort by ts desc
groupStore.rooms + getRoomUnread(id) + lastMessageMap  filteredNotifyItems (按 source 筛选)
   ┘                                                    ↓
                                              notifyCount (角标总数)
                                                         ↓
                                    CockpitTopBar :notify-count
                                                         ↓
                          点击"通知" → openNotify() → CockpitNotifyModal
                                                         ↓
                          点击条目 → store.clearNotifyItemUnread + store.closeNotify
                                  → 组件层 router.push(item.routeTarget)
                                       ├─ matrix: → /hermes/matrix-chat/room/:roomId
                                       ├─ chat:   → /hermes/session/:sessionId?profile=
                                       └─ group:  → /hermes/group-chat-room/:roomId
                          点击"全部标为已读" → clearAllNotify()
```

## 5. 群聊 unreadMap 生命周期

- **初始化**：`bootstrap()` → `groupStore.connect().then(loadRooms)` 时 `unreadCounts = {}`（空，无未读）
- **累积**：socket `message` 事件，若 `msg.roomId !== currentRoomId` → 计数 +1，更新 lastMessageMap
- **清零（单房间）**：用户 `joinRoom(roomId)` 进入房间 → 清零该房间
- **清零（全部）**：通知面板"全部标为已读" → `clearAllUnread()`
- **重置**：页面刷新 → 内存态清空（已确认接受）

## 6. 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `overlay/custom/client/cockpit/adapters/notify-adapter.ts` | **新增** | `NotifyItem` 类型 + 3 个纯函数适配器 |
| `overlay/custom/client/cockpit/components/CockpitNotifyModal.vue` | **新增** | 通知弹窗组件（复用 HistoryModal 样式） |
| `overlay/custom/client/cockpit/store/cockpit.ts` | 修改 | 新增 notify state/computed/方法 + router 绑定 |
| `overlay/custom/client/cockpit/views/CockpitView.vue` | 修改 | 接线 TopBar + 挂载 NotifyModal + bindCockpitRouter |
| `overlay/custom/client/cockpit/__tests__/notify-adapter.test.ts` | **新增** | 适配器纯函数单测 |
| `overlay/custom/client/cockpit/__tests__/cockpit-notify.test.ts` | **新增** | store notify computed/方法单测 |
| `overlay/custom/client/cockpit/__tests__/cockpit-notify-modal.test.ts` | **新增** | 组件渲染/交互单测 |
| `overlay/patches/081-group-chat-unread-tracking.patch` | **新增** | group-chat store 未读跟踪 |
| `overlay/patches/082-i18n-cockpit-notify.patch` | **新增** | i18n keys |
| `overlay/patches/series` | 修改 | 追加 081/082 |

## 7. 不变事项

- **注意力条**（`CockpitAttention` + `store.attention`）完全不变 — 任务维度提醒独立保留
- **历史弹窗**（`CockpitHistoryModal` + `store.openHistory`）完全不变 — 仍由"日程"按钮和注意力条"历史"入口触发
- **样式**：沿用 Pure Ink CSS 变量，不引入新色值；通知弹窗视觉与历史弹窗一致
- **组件风格**：继续 `<script setup>` Vue 3 组合式 API
- **测试**：vitest + @vue/test-utils
- **数据流**：Pinia store 单向流动

## 8. Spec Self-Review

- ✅ **无占位符**：所有文件路径、API 名、类型签名均已核实（matrix `getRoomUnreadCount`/`sortedRooms` 已 export；chat `isSessionCompletedUnread`/`clearSessionCompletedUnread` 已 export；group 需新增 patch 暴露）
- ✅ **内部一致**：数据流图与 store/adapter/组件描述吻合；routeTarget 与 `collab-adapter.ts` 现有路由命名一致（`hermes.matrixChatRoom`/`hermes.session`/`hermes.groupChatRoom`）
- ✅ **范围聚焦**：仅新增通知面板，不动注意力/历史/Kanban；group-chat patch 仅触及 unread 跟踪，不改消息处理主路径
- ✅ **无歧义**：群聊 unreadMap 明确为内存态（刷新重置）；单聊明确为二值（"运行完成"语义）；点击行为明确为路由跳转完整聊天页
