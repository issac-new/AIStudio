# Cockpit 通知面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 右上角"通知"按钮聚合 Matrix/单聊/群聊三类未读聊天消息，点击条目进入对应聊天窗口。

**Architecture:** 新增纯函数适配器 `notify-adapter.ts` 将三类异构未读数据归一为 `NotifyItem[]`；`cockpit.ts` store 新增 `notifyItems`/`notifyCount` computed 聚合三源 + 未读清零方法；新增 `CockpitNotifyModal.vue` 组件（复用 HistoryModal 样式）渲染列表，组件层 `router.push` 跳转；群聊未读通过 patch 085 在 `group-chat.ts` 拦截 socket `message` 事件构建内存 `unreadMap`。

**Tech Stack:** Vue 3 `<script setup>` + Pinia + TypeScript + vitest/@vue/test-utils + Pure Ink CSS 变量。变更通过 `overlay/patches/` 经 `npm run inject` 注入 upstream（禁止直接改 upstream）。

**Spec:** `overlay/docs-cockpit-notify-panel-design.md`

**Branch:** `feat/cockpit-notify-panel`（已基于 main 创建，spec 已提交）

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `overlay/custom/client/cockpit/adapters/notify-adapter.ts` | 新增 | `NotifyItem` 类型 + 3 个纯函数适配器（fromMatrixRoom/fromChatSession/fromGroupRoom）|
| `overlay/custom/client/cockpit/__tests__/notify-adapter.test.ts` | 新增 | 适配器纯函数单测 |
| `overlay/custom/client/cockpit/components/CockpitNotifyModal.vue` | 新增 | 通知弹窗组件（复用 HistoryModal 样式 + 列表渲染 + 点击跳转）|
| `overlay/custom/client/cockpit/__tests__/cockpit-notify-modal.test.ts` | 新增 | 组件渲染/筛选/点击/空态单测 |
| `overlay/custom/client/cockpit/store/cockpit.ts` | 修改 | 新增 notify state + computed + 方法 |
| `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts` | 修改 | 扩展 mock 暴露 notify 依赖 + 新增 notify 行为测试 |
| `overlay/custom/client/cockpit/views/CockpitView.vue` | 修改 | 接线 TopBar + 挂载 NotifyModal |
| `overlay/patches/085-group-chat-unread-tracking.patch` | 新增 | group-chat.ts 未读跟踪（socket 拦截 + 内存 map + 清零方法）|
| `overlay/patches/086-i18n-cockpit-notify.patch` | 新增 | i18n keys（en.ts + zh.ts）|
| `overlay/patches/series` | 修改 | 追加 085/086 |

---

### Task 1: notify-adapter 纯函数适配器（TDD）

**Files:**
- Create: `overlay/custom/client/cockpit/adapters/notify-adapter.ts`
- Test: `overlay/custom/client/cockpit/__tests__/notify-adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `overlay/custom/client/cockpit/__tests__/notify-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fromMatrixRoom, fromChatSession, fromGroupRoom } from '@/custom/cockpit/adapters/notify-adapter'

const mkRoom = (over: Record<string, any> = {}) => ({
  roomId: '!abc:server',
  name: 'auth-svc 联调',
  timeline: [
    { getType: () => 'm.room.message', getContent: () => ({ body: 'hello' }), getTs: () => 1000, getSender: () => '@shi:server' },
  ],
  ...over,
})

describe('fromMatrixRoom', () => {
  it('unread > 0 → NotifyItem with count + preview', () => {
    const item = fromMatrixRoom(mkRoom(), () => 2)
    expect(item).toEqual({
      id: 'matrix:!abc:server',
      kind: 'matrix',
      title: 'auth-svc 联调',
      preview: 'shi: hello',
      ts: 1000,
      count: 2,
      routeTarget: { name: 'hermes.matrixChatRoom', params: { roomId: '!abc:server' } },
    })
  })
  it('unread === 0 → null', () => {
    expect(fromMatrixRoom(mkRoom(), () => 0)).toBeNull()
  })
  it('timeline 无 message → preview 空, ts 0', () => {
    const item = fromMatrixRoom(mkRoom({ timeline: [] }), () => 1)
    expect(item!.preview).toBe('')
    expect(item!.ts).toBe(0)
  })
  it('roomId 无 name → 用 roomId 作 title', () => {
    const item = fromMatrixRoom(mkRoom({ name: undefined }), () => 1)
    expect(item!.title).toBe('!abc:server')
  })
})

describe('fromChatSession', () => {
  it('构造 NotifyItem, count 恒 1, preview 固定文案', () => {
    const item = fromChatSession({ id: 's1', title: 'SQL 注入排查', profile: 'claude', lastActiveAt: '2026-06-23T14:20:00Z' })
    expect(item).toEqual({
      id: 'chat:s1',
      kind: 'chat',
      title: 'SQL 注入排查',
      preview: '助手运行完成，请查看结果',
      ts: Date.parse('2026-06-23T14:20:00Z'),
      count: 1,
      routeTarget: { name: 'hermes.session', params: { sessionId: 's1' }, query: { profile: 'claude' } },
    })
  })
  it('无 profile → query 空', () => {
    const item = fromChatSession({ id: 's2', title: 'X' })
    expect(item!.routeTarget.query).toEqual({})
  })
})

describe('fromGroupRoom', () => {
  it('count > 0 + lastMsg → 完整 item', () => {
    const item = fromGroupRoom({ id: 'g1', name: '前端架构组' }, 3, { content: '组件库 v2', senderName: '李华', ts: 2000 })
    expect(item).toEqual({
      id: 'group:g1',
      kind: 'group',
      title: '前端架构组',
      preview: '李华: 组件库 v2',
      ts: 2000,
      count: 3,
      routeTarget: { name: 'hermes.groupChatRoom', params: { roomId: 'g1' } },
    })
  })
  it('count === 0 → null', () => {
    expect(fromGroupRoom({ id: 'g1', name: 'X' }, 0, null)).toBeNull()
  })
  it('无 lastMsg → preview 用 count', () => {
    const item = fromGroupRoom({ id: 'g2', name: 'X' }, 5, null)
    expect(item!.preview).toBe('5 条新消息')
    expect(item!.ts).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd overlay && npx vitest run custom/client/cockpit/__tests__/notify-adapter.test.ts`
Expected: FAIL — `Cannot find module '@/custom/cockpit/adapters/notify-adapter'`

- [ ] **Step 3: Write minimal implementation**

Create `overlay/custom/client/cockpit/adapters/notify-adapter.ts`:

```ts
import type { RouteLocationRaw } from 'vue-router'

export type NotifyKind = 'matrix' | 'chat' | 'group'

export interface NotifyItem {
  id: string                  // `<kind>:<roomId/sessionId>`
  kind: NotifyKind
  title: string
  preview: string
  ts: number                  // 毫秒
  count: number
  routeTarget: RouteLocationRaw
}

/** Matrix: 从 SDK room 提取未读项。getRoomUnreadCount 返回 0 → null */
export function fromMatrixRoom(room: any, getRoomUnreadCount: (r: any) => number): NotifyItem | null {
  const count = getRoomUnreadCount(room)
  if (!count) return null
  let preview = ''
  let ts = 0
  let sender = ''
  const timeline = room.timeline ?? []
  for (let i = timeline.length - 1; i >= 0; i--) {
    const evt = timeline[i]
    if (typeof evt.getType === 'function' && evt.getType() === 'm.room.message') {
      preview = evt.getContent?.()?.body ?? ''
      ts = evt.getTs?.() || 0
      sender = evt.getSender?.() ?? ''
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

/** 单聊: completedUnread 二值, count 恒 1 */
export function fromChatSession(session: {
  id: string
  title: string
  profile?: string | null
  updatedAt?: string
  lastActiveAt?: string | number | null
}): NotifyItem {
  const ts = toMs(session.lastActiveAt ?? session.updatedAt)
  return {
    id: `chat:${session.id}`,
    kind: 'chat',
    title: session.title || session.id,
    preview: '助手运行完成，请查看结果',
    ts,
    count: 1,
    routeTarget: {
      name: 'hermes.session',
      params: { sessionId: session.id },
      query: session.profile ? { profile: session.profile } : {},
    },
  }
}

/** 群聊: count 0 → null */
export function fromGroupRoom(
  room: { id: string; name: string },
  unreadCount: number,
  lastMsg: { content: string; senderName: string; ts: number } | null,
): NotifyItem | null {
  if (!unreadCount) return null
  const preview = lastMsg
    ? (lastMsg.senderName ? `${lastMsg.senderName}: ${lastMsg.content}` : lastMsg.content)
    : `${unreadCount} 条新消息`
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
  // @name:server.org → name
  const m = /^@?([^:]+)/.exec(sender)
  return m ? m[1] : sender
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd overlay && npx vitest run custom/client/cockpit/__tests__/notify-adapter.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
cd overlay
git add custom/client/cockpit/adapters/notify-adapter.ts custom/client/cockpit/__tests__/notify-adapter.test.ts
git commit -m "feat(cockpit): add notify-adapter for normalizing unread sources"
```

---

### Task 2: 群聊未读跟踪 patch（085）

**Files:**
- Create: `overlay/patches/085-group-chat-unread-tracking.patch`
- Modify: `overlay/patches/series`

**背景**：upstream `group-chat.ts` 无任何未读跟踪。本 patch 拦截 socket `message` 事件，对非当前房间的消息累积内存计数 + 记录最后消息；进入房间时清零。刷新后重置（已确认接受）。

- [ ] **Step 1: 生成 patch 文件**

upstream 文件在 inject 后已被 patch 序列修改，但 `group-chat.ts` 在 085 之前**无任何 overlay patch 触及**（series 中无 `group-chat` 相关项）。因此 patch 基线 = upstream HEAD 原始内容（已核实：`git show HEAD:packages/client/src/stores/hermes/group-chat.ts` 的 socket.on('message') 在第 348 行，joinRoom 在第 568 行，return 在第 813 行）。

由于开发机当前处于 injected 态（文件已被 patch 应用），写 patch 需用 `git show HEAD:` 的原始行作 context。创建 patch 文件 `overlay/patches/085-group-chat-unread-tracking.patch`：

```diff
diff --git a/packages/client/src/stores/hermes/group-chat.ts b/packages/client/src/stores/hermes/group-chat.ts
index 0000000..1111111 100644
--- a/packages/client/src/stores/hermes/group-chat.ts
+++ b/packages/client/src/stores/hermes/group-chat.ts
@@ -131,6 +131,14 @@ export const useGroupChatStore = defineStore('groupChat', () => {
     const [userName, setInitialUserName] = useLocalStorageState('gc_user_name', '')
     const [userDescription, setInitialUserDescription] = useLocalStorageState('gc_user_description', '')

+    // ─── Unread tracking (in-memory, resets on refresh) ──────────────
+    // Tracks per-room unread message count + last message preview for
+    // rooms that are NOT currently active. Cleared on joinRoom.
+    const unreadCounts = ref<Record<string, number>>({})
+    const lastMessageMap = ref<Record<string, { content: string; senderName: string; ts: number }>>({})
+
     const currentRoomId = ref<string | null>(null)
     const messages = ref<ChatMessage[]>([])
     const members = ref<MemberInfo[]>([])
@@ -345,6 +353,16 @@ export const useGroupChatStore = defineStore('groupChat', () => {
         })

         socket.on('message', (msg: ChatMessage) => {
+            // Unread tracking: non-active room → accumulate count + last message
+            if (msg.roomId !== currentRoomId.value) {
+                unreadCounts.value = {
+                    ...unreadCounts.value,
+                    [msg.roomId]: (unreadCounts.value[msg.roomId] ?? 0) + 1,
+                }
+                lastMessageMap.value = {
+                    ...lastMessageMap.value,
+                    [msg.roomId]: { content: msg.content ?? '', senderName: msg.senderName ?? '', ts: Date.now() },
+                }
+            }
             if (msg.roomId === currentRoomId.value) {
                 const idx = messages.value.findIndex(m => m.id === msg.id)
                 const existing = idx >= 0 ? messages.value[idx] : null
@@ -568,6 +586,11 @@ export const useGroupChatStore = defineStore('groupChat', () => {
     async function joinRoom(roomId: string) {
         isJoining.value = true
         error.value = null
+        // Clear unread for the room being entered
+        if (unreadCounts.value[roomId]) {
+            const next = { ...unreadCounts.value }
+            delete next[roomId]
+            unreadCounts.value = next
+        }

         try {
             const res = await getRoomDetail(roomId)
@@ -810,6 +833,12 @@ export const useGroupChatStore = defineStore('groupChat', () => {
     function clearCurrentRoomContext() {
         currentRoomId.value = null
     }

+    function clearRoomUnread(roomId: string) {
+        if (!unreadCounts.value[roomId]) return
+        const next = { ...unreadCounts.value }
+        delete next[roomId]
+        unreadCounts.value = next
+    }
+    function clearAllUnread() {
+        unreadCounts.value = {}
+    }
+    function getRoomUnread(roomId: string): number {
+        return unreadCounts.value[roomId] ?? 0
+    }

     return {
         // State
         connected,
         currentRoomId,
         rooms,
         messages,
         members,
         agents,
@@ -848,6 +877,9 @@ export const useGroupChatStore = defineStore('groupChat', () => {
         deleteRoom,
         cloneRoom,
         clearCurrentRoomContext,
+        clearRoomUnread,
+        clearAllUnread,
+        getRoomUnread,
         loadAgents,
         addAgentToRoom,
         removeAgentFromRoom,
     }
 })
```

- [ ] **Step 2: 追加到 series**

修改 `overlay/patches/series`，在文件末尾（`084-client-store-auth.patch` 之后）追加两行：

```
085-group-chat-unread-tracking.patch
086-i18n-cockpit-notify.patch
```

（086 会在 Task 6 创建，先占位写入 series 避免 Task 6 漏改。）

- [ ] **Step 3: 验证 patch 能干净应用**

Run: `cd overlay && npm run clean && npm run inject && echo "INJECT OK"`
Expected: 输出 `INJECT OK`，无 `git apply` 报错。

若 patch 因 context 行号偏移失败（inject 用 `git apply --3way` 容错，但严格模式需精确），用以下命令定位真实 context 行：
```bash
cd upstream/hermes-studio && grep -n "socket.on('message'\|currentRoomId = ref\|async function joinRoom\|clearCurrentRoomContext" packages/client/src/stores/hermes/group-chat.ts
```
调整 patch 中的 hunk context 行使其与原始（inject 前）文件匹配。

- [ ] **Step 4: 验证注入后的 store 暴露新 API**

Run（验证注入后 group-chat.ts 含新导出）：
```bash
cd upstream/hermes-studio && grep -n "clearRoomUnread\|clearAllUnread\|getRoomUnread\|unreadCounts" packages/client/src/stores/hermes/group-chat.ts | head
```
Expected: 6 处匹配（声明 ×2 + 方法 ×3 + export 末尾的 clearAllUnread/getRoomUnread）。

- [ ] **Step 5: Commit**

```bash
cd overlay
git add patches/085-group-chat-unread-tracking.patch patches/series
git commit -m "feat(patch): add group-chat unread tracking (085)"
```

---

### Task 3: i18n keys patch（086）

**Files:**
- Create: `overlay/patches/086-i18n-cockpit-notify.patch`

**背景**：082/083 已注入 history i18n keys，cockpit 块末尾为 `historyDone`。086 锚定在 `historyDone` 之后追加 notify keys。en.ts 注入后 cockpit 块以 `historyDone: 'Done',` + `},` 结尾（已核实）。

- [ ] **Step 1: 生成 patch**

创建 `overlay/patches/086-i18n-cockpit-notify.patch`：

```diff
diff --git a/packages/client/src/i18n/locales/en.ts b/packages/client/src/i18n/locales/en.ts
index 0000000..1111111 100644
--- a/packages/client/src/i18n/locales/en.ts
+++ b/packages/client/src/i18n/locales/en.ts
@@ -351,6 +351,17 @@ export default {
     historyCatComment: 'Comments',
     historyActive: 'Active',
     historyDone: 'Done',
+    notifyTitle: 'Notifications',
+    notifyUnread: 'unread',
+    notifySource: 'Source',
+    notifyAll: 'All',
+    notifyMatrix: 'Matrix',
+    notifyChat: 'Chat',
+    notifyGroup: 'Group',
+    notifyEmpty: 'No unread messages',
+    notifyClickHint: 'Click an item to open the chat',
+    notifyReadAll: 'Mark all as read',
   },

   runtimeVersions: {
diff --git a/packages/client/src/i18n/locales/zh.ts b/packages/client/src/i18n/locales/zh.ts
index 2222222..3333333 100644
--- a/packages/client/src/i18n/locales/zh.ts
+++ b/packages/client/src/i18n/locales/zh.ts
@@ -349,6 +349,17 @@ export default {
     historyCatComment: '评论',
     historyActive: '活跃',
     historyDone: '已完成',
+    notifyTitle: '通知',
+    notifyUnread: '条未读',
+    notifySource: '来源',
+    notifyAll: '全部',
+    notifyMatrix: 'Matrix',
+    notifyChat: '单聊',
+    notifyGroup: '群聊',
+    notifyEmpty: '没有未读消息',
+    notifyClickHint: '点击条目进入对应聊天',
+    notifyReadAll: '全部标为已读',
   },

   runtimeVersions: {
```

- [ ] **Step 2: 验证 zh.ts context 行（修正行号）**

zh.ts 注入后 cockpit 块行号可能与 en.ts 不同。用以下命令核实 zh.ts 的 `historyDone` 行号：
```bash
cd upstream/hermes-studio && grep -n "historyDone\|^  },$|^  runtimeVersions" packages/client/src/i18n/locales/zh.ts
```
若 zh.ts 的 `historyDone` 不在第 351 行附近，调整 zh.ts hunk 的 `@@` 行号与 context 使其匹配。en.ts/zh.ts 的 context 行内容（`historyCatComment`/`historyActive`/`historyDone`/`},`/`runtimeVersions`）必须与注入后文件一致。

- [ ] **Step 3: 验证 patch 能干净应用**

Run: `cd overlay && npm run clean && npm run inject && echo "INJECT OK"`
Expected: `INJECT OK`，无报错。

- [ ] **Step 4: 验证 keys 已注入**

Run:
```bash
cd upstream/hermes-studio && grep -c "notifyTitle\|notifyReadAll\|notifyEmpty" packages/client/src/i18n/locales/en.ts packages/client/src/i18n/locales/zh.ts
```
Expected: en.ts `3`，zh.ts `3`。

- [ ] **Step 5: Commit**

```bash
cd overlay
git add patches/086-i18n-cockpit-notify.patch
git commit -m "feat(patch): add cockpit notify i18n keys (086)"
```

---

### Task 4: store 扩展 — notify computed + 方法（TDD）

**Files:**
- Modify: `overlay/custom/client/cockpit/store/cockpit.ts`
- Modify: `overlay/custom/client/cockpit/__tests__/cockpit-store.test.ts`

- [ ] **Step 1: 扩展测试 mock 暴露 notify 依赖**

在 `cockpit-store.test.ts` 中，找到 `vi.mock('@/stores/hermes/chat', ...)`（约第 52 行），将 mock 改为暴露 notify 需要的 API。替换该 mock 块为：

```ts
const { mockChatSessions, isSessionCompletedUnread, clearSessionCompletedUnread } = vi.hoisted(() => ({
  mockChatSessions: [] as any[],
  isSessionCompletedUnread: vi.fn(() => false),
  clearSessionCompletedUnread: vi.fn(),
}))
vi.mock('@/stores/hermes/chat', () => ({
  useChatStore: () => ({
    loadSessions: vi.fn(async () => {}),
    messages: [],
    sendMessage: vi.fn(async () => {}),
    switchSession: vi.fn(async () => {}),
    sessions: mockChatSessions,
    isSessionCompletedUnread,
    clearSessionCompletedUnread,
  }),
}))
```

找到 `vi.mock('@/stores/hermes/group-chat', ...)`（约第 60 行），替换为：

```ts
const { mockGroupRooms, groupGetRoomUnread, groupClearRoomUnread, groupClearAllUnread, groupLastMessageMap } = vi.hoisted(() => ({
  mockGroupRooms: [] as any[],
  groupGetRoomUnread: vi.fn(() => 0),
  groupClearRoomUnread: vi.fn(),
  groupClearAllUnread: vi.fn(),
  groupLastMessageMap: {} as Record<string, any>,
}))
vi.mock('@/stores/hermes/group-chat', () => ({
  useGroupChatStore: () => ({
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    loadRooms: vi.fn(async () => {}),
    joinRoom: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    sortedMessages: [],
    rooms: mockGroupRooms,
    getRoomUnread: groupGetRoomUnread,
    clearRoomUnread: groupClearRoomUnread,
    clearAllUnread: groupClearAllUnread,
    lastMessageMap: groupLastMessageMap,
  }),
}))
```

找到 `vi.mock('@/custom/matrix-chat/stores/matrix-room', ...)`（约第 73 行），替换为：

```ts
const { mockSortedRooms, matrixGetRoomUnreadCount } = vi.hoisted(() => ({
  mockSortedRooms: [] as any[],
  matrixGetRoomUnreadCount: vi.fn(() => 0),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({
    selectRoom: vi.fn(),
    activeRoomMessages: [],
    roomList: [],
    sortedRooms: mockSortedRooms,
    getRoomUnreadCount: matrixGetRoomUnreadCount,
  }),
}))
```

- [ ] **Step 2: 在 test 文件末尾追加 notify 行为测试**

在 `cockpit-store.test.ts` 末尾追加（在最后一个 `})` 闭合 describe 之前，或文件末尾新开 describe）：

```ts
describe('notify (unread chat aggregation)', () => {
  beforeEach(() => {
    mockSortedRooms.splice(0, mockSortedRooms.length)
    mockChatSessions.splice(0, mockChatSessions.length)
    mockGroupRooms.splice(0, mockGroupRooms.length)
    for (const k of Object.keys(groupLastMessageMap)) delete groupLastMessageMap[k]
    isSessionCompletedUnread.mockReturnValue(false)
    groupGetRoomUnread.mockReturnValue(0)
    matrixGetRoomUnreadCount.mockReturnValue(0)
  })

  it('聚合三类未读 → notifyItems 按 ts 降序', () => {
    mockSortedRooms.push({
      roomId: '!m:sv', name: 'M-room', timeline: [
        { getType: () => 'm.room.message', getContent: () => ({ body: 'hi' }), getTs: () => 3000, getSender: () => '@a:sv' },
      ],
    })
    matrixGetRoomUnreadCount.mockReturnValue(2)
    mockChatSessions.push({ id: 's1', title: 'C-sess', lastActiveAt: '2026-06-23T10:00:00Z' })
    isSessionCompletedUnread.mockReturnValue(true)
    mockGroupRooms.push({ id: 'g1', name: 'G-room' })
    groupGetRoomUnread.mockReturnValue(1)
    groupLastMessageMap['g1'] = { content: 'yo', senderName: 'B', ts: 2000 }

    const store = useCockpitStore()
    expect(store.notifyItems.map(i => i.id)).toEqual(['matrix:!m:sv', 'group:g1', 'chat:s1'])
    expect(store.notifyCount).toBe(4) // 2 + 1 + 1
  })

  it('filteredNotifyItems 按来源筛选', () => {
    mockSortedRooms.push({ roomId: '!m:sv', name: 'M', timeline: [] })
    matrixGetRoomUnreadCount.mockReturnValue(1)
    mockGroupRooms.push({ id: 'g1', name: 'G' })
    groupGetRoomUnread.mockReturnValue(1)

    const store = useCockpitStore()
    store.setNotifySourceFilter('matrix')
    expect(store.filteredNotifyItems.map(i => i.kind)).toEqual(['matrix'])
    store.setNotifySourceFilter('group')
    expect(store.filteredNotifyItems.map(i => i.kind)).toEqual(['group'])
    store.setNotifySourceFilter('all')
    expect(store.filteredNotifyItems).toHaveLength(2)
  })

  it('clearNotifyItemUnread 分发到对应 store', () => {
    mockChatSessions.push({ id: 's1', title: 'X' })
    isSessionCompletedUnread.mockReturnValue(true)
    mockGroupRooms.push({ id: 'g1', name: 'G' })
    groupGetRoomUnread.mockReturnValue(2)

    const store = useCockpitStore()
    store.clearNotifyItemUnread({ id: 'chat:s1', kind: 'chat' } as any)
    expect(clearSessionCompletedUnread).toHaveBeenCalledWith('s1')
    store.clearNotifyItemUnread({ id: 'group:g1', kind: 'group' } as any)
    expect(groupClearRoomUnread).toHaveBeenCalledWith('g1')
  })

  it('openNotify/closeNotify 开关', () => {
    const store = useCockpitStore()
    expect(store.notifyOpen).toBe(false)
    store.openNotify()
    expect(store.notifyOpen).toBe(true)
    store.closeNotify()
    expect(store.notifyOpen).toBe(false)
  })

  it('clearAllNotify 清零全部', () => {
    mockGroupRooms.push({ id: 'g1', name: 'G' }, { id: 'g2', name: 'G2' })
    groupGetRoomUnread.mockReturnValue(1)
    const store = useCockpitStore()
    store.clearAllNotify()
    expect(groupClearAllUnread).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts -t "notify"`
Expected: FAIL — `store.notifyItems is not a function` / undefined。

- [ ] **Step 4: 实现 store 扩展**

在 `overlay/custom/client/cockpit/store/cockpit.ts` 中：

**(a) 顶部 import 区**（在 `import * as kv from './cockpit-kv'` 之后）追加：

```ts
import * as notifyAdapter from '../adapters/notify-adapter'
import type { NotifyItem, NotifyKind } from '../adapters/notify-adapter'
```

**(b) 在 `// ── 频道（parseTenant）──` 注释块之前**（约第 273 行 `channels` computed 之前）插入 notify state + computed：

```ts
  // ── 通知（未读聊天聚合）──
  const notifyOpen = ref(false)
  const notifySourceFilter = ref<NotifyKind | 'all'>('all')

  const notifyItems = computed<NotifyItem[]>(() => {
    const items: NotifyItem[] = []
    for (const room of (matrixRoom as any).sortedRooms ?? []) {
      const item = notifyAdapter.fromMatrixRoom(room, (r: any) => (matrixRoom as any).getRoomUnreadCount(r))
      if (item) items.push(item)
    }
    for (const s of (chatStore as any).sessions ?? []) {
      if ((chatStore as any).isSessionCompletedUnread?.(s.id)) {
        const item = notifyAdapter.fromChatSession(s)
        if (item) items.push(item)
      }
    }
    for (const r of (groupStore as any).rooms ?? []) {
      const cnt = (groupStore as any).getRoomUnread?.(r.id) ?? 0
      if (cnt > 0) {
        const last = (groupStore as any).lastMessageMap?.[r.id] ?? null
        const item = notifyAdapter.fromGroupRoom(r, cnt, last)
        if (item) items.push(item)
      }
    }
    return items.sort((a, b) => b.ts - a.ts)
  })

  const notifyCount = computed(() => notifyItems.value.reduce((n, i) => n + i.count, 0))

  const filteredNotifyItems = computed(() => {
    const f = notifySourceFilter.value
    if (f === 'all') return notifyItems.value
    return notifyItems.value.filter(i => i.kind === f)
  })
```

**(c) 在 `// ── 频道（聊天精简壳）──` 方法区之前**（约第 590 行 `selectChannel` 之前）插入方法：

```ts
  // ── 通知 ──
  function openNotify() { notifyOpen.value = true }
  function closeNotify() { notifyOpen.value = false }
  function setNotifySourceFilter(f: NotifyKind | 'all') { notifySourceFilter.value = f }
  function clearNotifyItemUnread(item: NotifyItem) {
    switch (item.kind) {
      case 'matrix': /* SDK 进入房间后自动清零，无需操作 */ break
      case 'chat': (chatStore as any).clearSessionCompletedUnread?.(item.id.replace('chat:', '')); break
      case 'group': (groupStore as any).clearRoomUnread?.(item.id.replace('group:', '')); break
    }
  }
  function clearAllNotify() {
    for (const item of notifyItems.value) clearNotifyItemUnread(item)
  }
```

**(d) 在 store 的 `return { ... }` 对象中**，在 `channels, channelsForSelectedTask, activeChannel,` 行之后追加：

```ts
    notifyOpen, notifySourceFilter, notifyItems, filteredNotifyItems, notifyCount,
    openNotify, closeNotify, setNotifySourceFilter, clearNotifyItemUnread, clearAllNotify,
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-store.test.ts`
Expected: PASS（含新 notify describe + 原有测试不回归）。

- [ ] **Step 6: Commit**

```bash
cd overlay
git add custom/client/cockpit/store/cockpit.ts custom/client/cockpit/__tests__/cockpit-store.test.ts
git commit -m "feat(cockpit): add notify aggregation to cockpit store"
```

---

### Task 5: CockpitNotifyModal 组件（TDD）

**Files:**
- Create: `overlay/custom/client/cockpit/components/CockpitNotifyModal.vue`
- Create: `overlay/custom/client/cockpit/__tests__/cockpit-notify-modal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `overlay/custom/client/cockpit/__tests__/cockpit-notify-modal.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

// mock 依赖 store（复用 cockpit-store.test.ts 的 mock 模式）
vi.mock('@/stores/hermes/kanban', () => ({ useKanbanStore: () => ({ tasks: [], fetchTasks: vi.fn(async () => {}), fetchAssignees: vi.fn(async () => {}), startEventStream: vi.fn() }) }))
vi.mock('@/custom/cockpit/api/kanban-extras', () => ({ searchSessions: vi.fn(async () => []), listWorkspaceFiles: vi.fn(async () => []), getTimeline: vi.fn(async () => ({ items: [], total: 0 })) }))
vi.mock('@/api/hermes/kanban', async () => { const a = await vi.importActual<any>('@/api/hermes/kanban'); return { ...a, getTask: vi.fn(async () => null), addComment: vi.fn(async () => ({})) } })
vi.mock('@/api/hermes/sessions', async () => { const a = await vi.importActual<any>('@/api/hermes/sessions'); return { ...a, searchSessions: vi.fn(async () => []) } })
vi.mock('@/stores/hermes/auth', () => ({ useAuthStore: () => ({ user: null }) }))
const mockPush = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@/stores/hermes/chat', () => ({ useChatStore: () => ({ loadSessions: vi.fn(async () => {}), messages: [], sessions: [], isSessionCompletedUnread: vi.fn(() => false), clearSessionCompletedUnread: vi.fn() }) }))
vi.mock('@/stores/hermes/group-chat', () => ({ useGroupChatStore: () => ({ connect: vi.fn(async () => {}), disconnect: vi.fn(), loadRooms: vi.fn(async () => {}), rooms: [], getRoomUnread: vi.fn(() => 0), clearRoomUnread: vi.fn(), clearAllUnread: vi.fn(), lastMessageMap: {} }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({ useMatrixClientStore: () => ({ initClient: vi.fn(async () => {}), syncState: { value: 'PREPARED' } }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({ useMatrixRoomStore: () => ({ selectRoom: vi.fn(), sortedRooms: [], getRoomUnreadCount: vi.fn(() => 0) }) }))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({ useMatrixComposerStore: () => ({ sendMessage: vi.fn(async () => {}) }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

beforeEach(() => {
  setActivePinia(createPinia())
  mockPush.mockClear()
})

describe('CockpitNotifyModal', () => {
  it('空态：notifyCount 为 0 时显示 notifyEmpty', () => {
    const store = useCockpitStore()
    store.openNotify()
    const w = mount(CockpitNotifyModal)
    expect(w.text()).toContain('notifyEmpty')
  })

  it('点击条目 → clearNotifyItemUnread + closeNotify + router.push', async () => {
    const store = useCockpitStore()
    // 直接注入一个 notify item（绕过 mock，测试组件点击行为）
    ;(store as any).notifyItems = [{ id: 'group:g1', kind: 'group', title: 'G', preview: 'hi', ts: 1, count: 1, routeTarget: { name: 'hermes.groupChatRoom', params: { roomId: 'g1' } } }]
    store.openNotify()
    const clearSpy = vi.spyOn(store, 'clearNotifyItemUnread')
    const w = mount(CockpitNotifyModal)
    const item = w.find('.cockpit-notify-modal__item')
    expect(item.exists()).toBe(true)
    await item.trigger('click')
    expect(clearSpy).toHaveBeenCalled()
    expect(store.notifyOpen).toBe(false)
    expect(mockPush).toHaveBeenCalledWith({ name: 'hermes.groupChatRoom', params: { roomId: 'g1' } })
  })

  it('全部标为已读按钮 → clearAllNotify', async () => {
    const store = useCockpitStore()
    ;(store as any).notifyItems = [{ id: 'group:g1', kind: 'group', title: 'G', preview: 'hi', ts: 1, count: 1, routeTarget: {} as any }]
    store.openNotify()
    const allSpy = vi.spyOn(store, 'clearAllNotify')
    const w = mount(CockpitNotifyModal)
    await w.find('.cockpit-notify-modal__readall').trigger('click')
    expect(allSpy).toHaveBeenCalled()
  })

  it('筛选 chip → setNotifySourceFilter', async () => {
    const store = useCockpitStore()
    store.openNotify()
    const spy = vi.spyOn(store, 'setNotifySourceFilter')
    const w = mount(CockpitNotifyModal)
    const chips = w.findAll('.cockpit-notify-modal__chip')
    await chips[1].trigger('click') // matrix
    expect(spy).toHaveBeenCalledWith('matrix')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-notify-modal.test.ts`
Expected: FAIL — `Cannot find module '@/custom/cockpit/components/CockpitNotifyModal.vue'`

- [ ] **Step 3: Write the component**

Create `overlay/custom/client/cockpit/components/CockpitNotifyModal.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'
import type { NotifyKind, NotifyItem } from '@/custom/cockpit/adapters/notify-adapter'

const store = useCockpitStore()
const { t } = useI18n()
const router = useRouter()

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
  return sameDay
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

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
      <button
        v-for="s in SOURCES"
        :key="s.key"
        type="button"
        class="cockpit-notify-modal__chip"
        :class="{ 'is-on': store.notifySourceFilter === s.key }"
        @click="store.setNotifySourceFilter(s.key)"
      >{{ t(s.labelKey) }}</button>
    </div>
    <div class="cockpit-notify-modal__list">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="cockpit-notify-modal__item"
        :data-notify-id="item.id"
        @click="onItemClick(item)"
      >
        <span class="cockpit-notify-modal__avatar" :class="'is-' + item.kind">{{ KIND_ICON[item.kind] }}</span>
        <div class="cockpit-notify-modal__body">
          <div class="cockpit-notify-modal__row1">
            <span class="cockpit-notify-modal__kind">{{ KIND_LABEL[item.kind] }}</span>
            <span class="cockpit-notify-modal__name">{{ item.title }}</span>
            <span class="cockpit-notify-modal__when">{{ timeStr(item.ts) }}</span>
          </div>
          <div class="cockpit-notify-modal__preview">{{ item.preview }}</div>
        </div>
        <span class="cockpit-notify-modal__count">{{ item.count }}</span>
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

<style scoped lang="scss">
/* 复用 HistoryModal 样式语言（Pure Ink CSS 变量，无新色值） */
.cockpit-notify-modal { display: flex; flex-direction: column; width: 480px; max-width: 92vw; max-height: 78vh; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25); overflow: hidden; }
.cockpit-notify-modal__head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border-color); }
.cockpit-notify-modal__title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.cockpit-notify-modal__sub { font-size: 11px; color: var(--text-muted); font-weight: 400; }
.cockpit-notify-modal__close { cursor: pointer; color: var(--text-muted); font-size: 16px; width: 24px; height: 24px; border: none; background: none; display: flex; align-items: center; justify-content: center; border-radius: 4px;
  &:hover { background: var(--bg-secondary); color: var(--text-primary); }
}
.cockpit-notify-modal__filters { padding: 12px 18px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cockpit-notify-modal__flabel { font-size: 10px; color: var(--text-muted); width: 44px; flex-shrink: 0; font-weight: 600; }
.cockpit-notify-modal__chip { font-size: 10px; padding: 2px 9px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-card); color: var(--text-muted); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); }
  &.is-on { background: var(--accent-primary); color: var(--text-on-accent); border-color: var(--accent-primary); }
}
.cockpit-notify-modal__list { flex: 1; overflow-y: auto; padding: 4px 0; }
.cockpit-notify-modal__item { display: flex; align-items: flex-start; gap: 11px; padding: 10px 18px; cursor: pointer; border: none; background: none; width: 100%; text-align: left; font: inherit; border-bottom: 1px solid var(--border-light); color: var(--text-primary);
  &:hover { background: var(--bg-secondary); }
}
.cockpit-notify-modal__avatar { flex-shrink: 0; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; color: var(--text-on-accent); }
.cockpit-notify-modal__avatar.is-matrix { background: var(--text-primary); }
.cockpit-notify-modal__avatar.is-chat { background: var(--text-secondary); }
.cockpit-notify-modal__avatar.is-group { background: var(--text-muted); }
.cockpit-notify-modal__body { flex: 1; min-width: 0; }
.cockpit-notify-modal__row1 { display: flex; align-items: center; gap: 6px; }
.cockpit-notify-modal__kind { font-size: 9px; padding: 0 5px; border-radius: 2px; background: var(--bg-secondary); color: var(--text-secondary); font-family: ui-monospace, monospace; }
.cockpit-notify-modal__name { font-size: 12px; font-weight: 600; color: var(--text-primary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cockpit-notify-modal__when { font-size: 9px; color: var(--text-muted); font-family: ui-monospace, monospace; flex-shrink: 0; }
.cockpit-notify-modal__preview { font-size: 11px; color: var(--text-secondary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cockpit-notify-modal__count { flex-shrink: 0; background: var(--error); color: var(--text-on-accent); font-size: 9px; font-weight: 700; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 4px; }
.cockpit-notify-modal__empty { padding: 32px 18px; text-align: center; font-size: 12px; color: var(--text-muted); }
.cockpit-notify-modal__foot { padding: 10px 18px; border-top: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary); }
.cockpit-notify-modal__hint { font-size: 10px; color: var(--text-muted); }
.cockpit-notify-modal__readall { font-size: 11px; padding: 4px 12px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; font: inherit;
  &:hover { border-color: var(--text-muted); color: var(--text-primary); }
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd overlay && npx vitest run custom/client/cockpit/__tests__/cockpit-notify-modal.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
cd overlay
git add custom/client/cockpit/components/CockpitNotifyModal.vue custom/client/cockpit/__tests__/cockpit-notify-modal.test.ts
git commit -m "feat(cockpit): add CockpitNotifyModal component"
```

---

### Task 6: CockpitView 接线

**Files:**
- Modify: `overlay/custom/client/cockpit/views/CockpitView.vue`

- [ ] **Step 1: 添加 import**

在 `CockpitView.vue` 的 `<script setup>` 中，找到 `import CockpitHistoryModal from ...` 行（约第 15 行），在其后追加：

```ts
import CockpitNotifyModal from '@/custom/cockpit/components/CockpitNotifyModal.vue'
```

- [ ] **Step 2: 修改 TopBar 绑定**

在模板中找到 `<CockpitTopBar ...>`（约第 74 行），将 `:notify-count="3"` 改为 `:notify-count="store.notifyCount"`，将 `@notify="store.openHistory()"` 改为 `@notify="store.openNotify()"`。修改后该块为：

```vue
    <CockpitTopBar
      :agent-count="3"
      :human-count="2"
      :notify-count="store.notifyCount"
      :schedule-count="2"
      :user-name="store.currentUserName"
      @schedule="store.openHistory()"
      @notify="store.openNotify()"
      @search="() => {}"
      @settings="goSettings"
    />
```

- [ ] **Step 3: 挂载通知弹窗**

在模板中找到 history overlay/modal 块（约第 165-166 行）：

```vue
    <div v-if="store.historyOpen" class="cockpit-overlay" @click="store.closeHistory()" />
    <CockpitHistoryModal v-if="store.historyOpen" class="cockpit-modal-anchor" />
```

在其后追加：

```vue
    <div v-if="store.notifyOpen" class="cockpit-overlay" @click="store.closeNotify()" />
    <CockpitNotifyModal v-if="store.notifyOpen" class="cockpit-modal-anchor" />
```

- [ ] **Step 4: 运行全量 cockpit 测试确认无回归**

Run: `cd overlay && npx vitest run custom/client/cockpit/`
Expected: 所有测试 PASS（含原有 + 新增 notify）。

- [ ] **Step 5: Commit**

```bash
cd overlay
git add custom/client/cockpit/views/CockpitView.vue
git commit -m "feat(cockpit): wire notify button to NotifyModal in CockpitView"
```

---

### Task 7: 全量验证 + 收尾

- [ ] **Step 1: 完整 inject + 测试**

Run:
```bash
cd overlay
npm run clean
npm run inject
npm test
```
Expected: inject 成功（`INJECT OK`），全部 vitest 测试 PASS。

- [ ] **Step 2: 类型检查**

Run: `cd upstream/hermes-studio && npx vue-tsc --noEmit -p packages/client/tsconfig.json 2>&1 | grep -i "notify\|cockpit/store/cockpit" | head`
Expected: 无 notify 相关类型错误（若 vue-tsc 不可用则跳过，依赖 vitest 类型覆盖）。

- [ ] **Step 3: 手动验证清单（dev 启动后）**

Run: `cd overlay && npm run dev`，浏览器打开 `http://localhost:8649`：

- [ ] 登录后进入驾驶舱，顶栏"通知"角标显示真实未读数（非固定 3）
- [ ] 无未读时角标隐藏
- [ ] 点击"通知"打开通知弹窗（复用历史弹窗样式）
- [ ] 弹窗显示三类未读（Matrix/单聊/群聊），按时间降序
- [ ] 来源筛选 chip 切换（全部/Matrix/单聊/群聊）
- [ ] 点击 Matrix 项 → 跳转 matrix 聊天室，角标减少
- [ ] 点击群聊项 → 跳转群聊房间，该房间未读清零
- [ ] 点击单聊项 → 跳转会话页
- [ ] "全部标为已读" → 角标归零
- [ ] 空态显示"没有未读消息"

- [ ] **Step 4: 合入 main**

```bash
cd overlay
git checkout main
git merge feat/cockpit-notify-panel
```

---

## Self-Review

**1. Spec coverage：**
- §3.1 notify-adapter → Task 1 ✅
- §3.2 群聊 patch 085 → Task 2 ✅
- §3.3 store 扩展 → Task 4 ✅
- §3.4 CockpitNotifyModal → Task 5 ✅
- §3.5 接线（TopBar + View）→ Task 6 ✅
- §3.6 i18n 086 → Task 3 ✅
- §4 数据流 → Task 4 computed + Task 5 点击 ✅
- §5 群聊生命周期 → Task 2 patch（joinRoom 清零 + clearAllUnread）✅

**2. Placeholder scan：** 无 TBD/TODO；所有代码块完整；patch 含精确 context 行。

**3. Type/方法一致性：**
- `NotifyItem` 字段在 Task 1 定义 → Task 4 computed 返回 → Task 5 组件消费，一致
- `clearNotifyItemUnread(item)` Task 4 定义 → Task 5 调用，签名一致
- `getRoomUnread/clearRoomUnread/clearAllUnread` Task 2 patch export → Task 4 store 调用，名字一致
- `notifyItems/notifyCount/filteredNotifyItems/notifyOpen/notifySourceFilter` Task 4 定义 → Task 5/6 消费，一致

**4. patch 编号：** 085/086 不与现有 080-084 冲突；series 末尾追加。
