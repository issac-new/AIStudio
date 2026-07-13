# Threads(话题)功能迁移实施计划:对齐 element-web

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 overlay 的 Matrix Threads(话题)功能从手写简化实现迁移到与 `upstream/element-web` 一致的形态:路由模型重构为 RightPanelStore phase、列表/详情复用 MatrixTimelinePanel、新增 ThreadSummary 卡片、删除 MatrixThreadInfo。

**Architecture:** 分 10 个任务递进:(1-2) 路由模型重构 + store 瘦身 → (3) TimelinePanel 参数化 → (4) ThreadSummary 卡片 → (5) 列表重构 → (6) ThreadView 详情 → (7) Composer 扩展 → (8) EventTile footer 替换 → (9) 删除旧组件 → (10) i18n。每任务独立可测、可提交。所有新 props 可选,不传 = 现状,保证零回归。

**Tech Stack:** Vue 3 `<script setup>` + Pinia + TypeScript + matrix-js-sdk + vue-i18n;测试 vitest(jsdom);样式 scoped scss 复用 `upstream/hermes-studio/packages/client/src/styles/variables.scss` 的 `$`-token。

**Spec:** `docs/superpowers/specs/2026-06-22-threads-migration-design.md`

**路径约定:**
- overlay 自定义代码根: `overlay/custom/client/matrix-chat/` —— **直接文件**,提交到 overlay 仓(A 类纯新增)
- 测试目录: `upstream/hermes-studio/tests/client/` 属于 **hermes-studio 独立 git 仓**,overlay 不直接跟踪。**测试必须以 patch 文件投递**:在 `overlay/patches/NNN-test-matrix-*.patch` 新建(`diff --git a/tests/... b/tests/...` 格式,新文件源为 `/dev/null`),登记到 `overlay/patches/series`,经 `npm run inject` 应用到 hermes-studio
- 上游 element-web 参考: `upstream/element-web/apps/web/src/components/structures/ThreadPanel.tsx` 等(只读)

**运行测试:** `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test`(等价于在上游 hermes-studio 跑 `vitest run`,包含 `tests/**/*.test.ts`)。**注意**:新建测试 patch 后必须先 `npm run inject` 应用,vitest 才能发现该测试文件。

**Patch 编号约定**:本计划新增 patch 用 `055-` 起编号(现有最大为 `054-i18n-login-title-swarmstudio.patch`)。测试 patch 命名 `NNN-test-matrix-<topic>.patch`。

**测试 patch 创建流程**(每个新测试文件统一套用):
1. 确保 hermes-studio 工作区是已 inject 状态(`npm run inject`)
2. 把测试内容直接写到 `upstream/hermes-studio/tests/client/<name>.test.ts`
3. `npm run test -- <name>` 验证通过
4. 生成 patch:`git -C upstream/hermes-studio diff -- tests/client/<name>.test.ts > overlay/patches/NNN-test-matrix-<topic>.patch`(新文件自动产生 `/dev/null` 源)
5. 把 `NNN-test-matrix-<topic>.patch` 追加到 `overlay/patches/series` 末尾
6. 验证 patch 可干净重放:`npm run clean && npm run inject && npm run test -- <name>`
7. **overlay 仓提交**(只提交 patch + series + custom 改动,绝不提交 hermes-studio 工作区的测试文件):`git -C overlay add patches/NNN-*.patch patches/series custom/...`

> hermes-studio 工作区的测试文件本身**不提交到任何仓**(那是上游仓,inject 会重新生成);唯一持久化在 overlay 仓的是 patch 文件 + series。

---

## 文件结构总览

### 新增
| 文件 | 职责 |
|------|------|
| `overlay/custom/client/matrix-chat/components/MatrixThreadSummary.vue` | ThreadSummary 卡片(移植 ThreadSummaryView) |
| `overlay/custom/client/matrix-chat/components/MatrixThreadMessagePreview.vue` | ThreadSummary 内的最后回复预览 |
| `overlay/custom/client/matrix-chat/components/MatrixThreadView.vue` | 单 thread 详情视图(复用 TimelinePanel) |
| `overlay/custom/client/matrix-chat/components/MatrixSpinner.vue` | 统一 loading spinner |
| `overlay/custom/client/matrix-chat/components/MatrixContextMenu.vue` | 轻量上下文菜单(过滤 dropdown 用) |
| `overlay/patches/055-test-matrix-right-panel.patch` | right-panel store 测试(patch,应用到 hermes-studio/tests/) |
| `overlay/patches/056-test-matrix-thread-notifications.patch` | thread store 通知 helper 测试(patch) |
| `overlay/patches/057-test-matrix-room-threads.patch` | room store thread helpers 测试(patch) |
| `overlay/patches/058-test-matrix-timeline-panel-params.patch` | TimelinePanel 参数化测试(patch) |
| `overlay/patches/059-test-matrix-thread-summary.patch` | ThreadSummary 组件测试(patch) |

### 修改
| 文件 | 改动 |
|------|------|
| `stores/matrix-right-panel.ts` | 扩展 phase 联合类型 + thread view state + actions |
| `stores/matrix-thread.ts` | 删 view state,保留纯 helper + 新增 notification helper |
| `stores/matrix-room.ts` | 新增 `initRoomThreads` / `getThreadsTimelineSet` / `getThreadById` |
| `components/MatrixTimelinePanel.vue` | 参数化:新增可选 props |
| `components/MatrixMessageItem.vue` | 新增 renderingType prop,threads-list 模式渲染 ThreadSummary |
| `components/MatrixMessageInput.vue` | 新增 compact + threadRelation props |
| `components/MatrixThreadPanel.vue` | 重构为列表 = TimelinePanel + dropdown header |
| `components/MatrixEventTileFooter.vue` | MatrixThreadInfo → MatrixThreadSummary |
| `components/MatrixRightPanel.vue` | phase 分发新增 ThreadPanel/ThreadView |
| `components/MatrixChatPanel.vue` | 移除 thread panel v-if,统一 MatrixRightPanel |
| `components/MatrixRoomHeader.vue` | threads 按钮调 openThreadPanel |
| `components/MatrixRoomSummaryCard.vue` | "Threads" 按钮调 openThreadPanel |

### 删除
| 文件 | 原因 |
|------|------|
| `components/MatrixThreadInfo.vue` | 被 MatrixThreadSummary 取代(仅 MatrixEventTileFooter 引用) |

---

## Task 1: 扩展 matrix-right-panel store 支持 Thread phase

**Files:**
- Modify: `overlay/custom/client/matrix-chat/stores/matrix-right-panel.ts`
- Create: `overlay/patches/055-test-matrix-right-panel.patch`(应用到 `upstream/hermes-studio/tests/client/matrix-right-panel.test.ts`)

此任务把 thread view state 的归属从 thread store 迁到 right-panel store。完成后旧 MatrixThreadPanel 暂时还能跑(下一个任务才改调用点),保证中间态可编译。

- [ ] **Step 1: 写失败的 store 测试**

确保已 inject(`cd /Volumes/nvme2230/lab/ncwk/overlay && npm run inject`)。然后把以下内容写到 `upstream/hermes-studio/tests/client/matrix-right-panel.test.ts`(此文件不提交到任何仓,仅用于生成 patch):

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'

describe('matrix-right-panel store (thread phases)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('openThreadPanel sets phase to ThreadPanel with null root id', () => {
    const store = useMatrixRightPanelStore()
    store.openThreadPanel()
    expect(store.rightPanelPhase).toBe('ThreadPanel')
    expect(store.rightPanelThreadRootId).toBe(null)
  })

  it('openThreadView sets phase to ThreadView with root event id', () => {
    const store = useMatrixRightPanelStore()
    store.openThreadView('$evt1:server')
    expect(store.rightPanelPhase).toBe('ThreadView')
    expect(store.rightPanelThreadRootId).toBe('$evt1:server')
  })

  it('openThreadView records history so rightPanelBack returns to ThreadPanel', () => {
    const store = useMatrixRightPanelStore()
    store.openThreadPanel()
    store.openThreadView('$evt1:server')
    store.rightPanelBack()
    expect(store.rightPanelPhase).toBe('ThreadPanel')
    expect(store.rightPanelThreadRootId).toBe(null)
  })

  it('clearThreadView from ThreadView returns to ThreadPanel', () => {
    const store = useMatrixRightPanelStore()
    store.openThreadView('$evt1:server')
    store.clearThreadView()
    expect(store.rightPanelPhase).toBe('ThreadPanel')
    expect(store.rightPanelThreadRootId).toBe(null)
  })

  it('clearThreadView from ThreadPanel closes the panel', () => {
    const store = useMatrixRightPanelStore()
    store.openThreadPanel()
    store.clearThreadView()
    expect(store.rightPanelPhase).toBe(null)
  })

  it('setThreadFilter updates filter', () => {
    const store = useMatrixRightPanelStore()
    expect(store.rightPanelThreadFilter).toBe('all')
    store.setThreadFilter('my')
    expect(store.rightPanelThreadFilter).toBe('my')
  })

  it('closeRightPanel clears thread root id and filter', () => {
    const store = useMatrixRightPanelStore()
    store.openThreadView('$evt1:server')
    store.setThreadFilter('my')
    store.closeRightPanel()
    expect(store.rightPanelPhase).toBe(null)
    expect(store.rightPanelThreadRootId).toBe(null)
    expect(store.rightPanelThreadFilter).toBe('all')
  })
})
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-right-panel 2>&1 | tail -30`
Expected: FAIL — `useMatrixRightPanelStore` 没有 `openThreadPanel` / `openThreadView` / `clearThreadView` / `setThreadFilter` 方法,`rightPanelThreadRootId` / `rightPanelThreadFilter` 不存在。

- [ ] **Step 3: 实现扩展**

Replace the entire contents of `overlay/custom/client/matrix-chat/stores/matrix-right-panel.ts` with:

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

// Right-panel phase store, split out of the former god-store.
// Reference: element-web RightPanelStorePhases (ThreadPanel / ThreadView / RoomSummary ...).
export type RightPanelPhase =
  | 'RoomSummary'
  | 'MemberList'
  | 'MemberInfo'
  | 'ThreadPanel'   // 列表(对应上游 RightPanelPhases.ThreadPanel)
  | 'ThreadView'    // 单个 thread 详情(对应上游 RightPanelPhases.ThreadView)
  | null

export type ThreadFilterType = 'all' | 'my'

interface PhaseHistoryEntry {
  phase?: RightPanelPhase
  memberId?: string
  threadRootId?: string
}

export const useMatrixRightPanelStore = defineStore('matrix-right-panel', () => {
  const rightPanelPhase = ref<RightPanelPhase>(null)
  const rightPanelMemberUserId = ref<string | null>(null)
  const rightPanelThreadRootId = ref<string | null>(null)
  const rightPanelThreadFilter = ref<ThreadFilterType>('all')
  const rightPanelPhaseHistory = ref<PhaseHistoryEntry[]>([])

  function snapshot(): PhaseHistoryEntry {
    return {
      phase: rightPanelPhase.value ?? undefined,
      memberId: rightPanelMemberUserId.value ?? undefined,
      threadRootId: rightPanelThreadRootId.value ?? undefined,
    }
  }

  function restore(entry: PhaseHistoryEntry): void {
    rightPanelPhase.value = entry.phase ?? null
    rightPanelMemberUserId.value = entry.memberId ?? null
    rightPanelThreadRootId.value = entry.threadRootId ?? null
  }

  function pushHistory(): void {
    rightPanelPhaseHistory.value.push(snapshot())
  }

  function openRoomSummary() {
    pushHistory()
    rightPanelPhase.value = 'RoomSummary'
    rightPanelMemberUserId.value = null
    rightPanelThreadRootId.value = null
  }

  function openMemberList() {
    pushHistory()
    rightPanelPhase.value = 'MemberList'
    rightPanelMemberUserId.value = null
    rightPanelThreadRootId.value = null
  }

  function openMemberInfo(userId: string) {
    pushHistory()
    rightPanelPhase.value = 'MemberInfo'
    rightPanelMemberUserId.value = userId
    rightPanelThreadRootId.value = null
  }

  /** 打开话题列表(对应上游 ThreadPanel phase) */
  function openThreadPanel() {
    pushHistory()
    rightPanelPhase.value = 'ThreadPanel'
    rightPanelThreadRootId.value = null
    rightPanelMemberUserId.value = null
  }

  /** 打开单个话题详情(对应上游 ThreadView phase) */
  function openThreadView(rootEventId: string) {
    pushHistory()
    rightPanelPhase.value = 'ThreadView'
    rightPanelThreadRootId.value = rootEventId
    rightPanelMemberUserId.value = null
  }

  /** 切换话题列表的 All/My 过滤 */
  function setThreadFilter(filter: ThreadFilterType) {
    rightPanelThreadFilter.value = filter
  }

  /**
   * 决策规则(对齐 spec §3.1):
   *   当前 phase === 'ThreadView' → 回到 'ThreadPanel'
   *   否则(从 ThreadPanel 调)→ 关闭 panel
   */
  function clearThreadView() {
    if (rightPanelPhase.value === 'ThreadView') {
      rightPanelPhase.value = 'ThreadPanel'
      rightPanelThreadRootId.value = null
    } else {
      closeRightPanel()
    }
  }

  function closeRightPanel() {
    rightPanelPhase.value = null
    rightPanelMemberUserId.value = null
    rightPanelThreadRootId.value = null
    rightPanelThreadFilter.value = 'all'
    rightPanelPhaseHistory.value = []
  }

  function rightPanelBack() {
    const history = rightPanelPhaseHistory.value
    if (history.length > 0) {
      restore(history[history.length - 1])
      rightPanelPhaseHistory.value = history.slice(0, -1)
    } else {
      closeRightPanel()
    }
  }

  return {
    rightPanelPhase,
    rightPanelMemberUserId,
    rightPanelThreadRootId,
    rightPanelThreadFilter,
    openRoomSummary,
    openMemberList,
    openMemberInfo,
    openThreadPanel,
    openThreadView,
    setThreadFilter,
    clearThreadView,
    closeRightPanel,
    rightPanelBack,
  }
})
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-right-panel 2>&1 | tail -30`
Expected: PASS — 全部 7 个用例通过。

- [ ] **Step 5: 生成测试 patch 并登记 series**

```bash
# 生成 patch(新文件自动产生 /dev/null 源格式)
git -C /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio diff -- tests/client/matrix-right-panel.test.ts \
  > /Volumes/nvme2230/lab/ncwk/overlay/patches/055-test-matrix-right-panel.patch
# 追加到 series 末尾
printf '\n055-test-matrix-right-panel.patch\n' >> /Volumes/nvme2230/lab/ncwk/overlay/patches/series
# 验证 patch 可干净重放 + 测试仍通过
cd /Volumes/nvme2230/lab/ncwk/overlay && npm run clean && npm run inject && npm run test -- matrix-right-panel 2>&1 | tail -10
```
Expected: inject 成功无冲突;测试 PASS。

- [ ] **Step 6: 提交(仅 patch + series + store,绝不提交 hermes-studio 工作区的测试文件)**

```bash
git -C /Volumes/nvme2230/lab/ncwk/overlay add \
  custom/client/matrix-chat/stores/matrix-right-panel.ts \
  patches/055-test-matrix-right-panel.patch \
  patches/series
git -C /Volumes/nvme2230/lab/ncwk/overlay commit -m "feat(matrix): extend right-panel store with ThreadPanel/ThreadView phases"
git -C /Volumes/nvme2230/lab/ncwk/overlay show --stat HEAD  # 验证只有 3 个文件
```

---

## Task 2: matrix-thread store 瘦身 + 新增 notification helper

**Files:**
- Modify: `overlay/custom/client/matrix-chat/stores/matrix-thread.ts`
- Create: `overlay/patches/056-test-matrix-thread-notifications.patch`

删除 view state(已迁到 right-panel store),保留纯 helper,新增 `getThreadNotificationIndicator`。注意:此任务**只删 store 字段、不删调用点**——调用点在 Task 5/6/8 才改。为避免中间态编译错误,被删字段先保留为**只读 computed 兜底**(读 right-panel store 派生),等 Task 5/6/8 改完调用点后再在 Task 9 彻底删除。

- [ ] **Step 1: 写失败的 notification helper 测试**

确保已 inject。把以下内容写到 `upstream/hermes-studio/tests/client/matrix-thread-notifications.test.ts`(不提交,仅生成 patch):

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// mock room store: 提供一个可控的 activeRoom
const mockRoom = {
  threadsAggregateNotificationType: 0,
}
vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({
    get activeRoom() { return mockRoom },
  }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: null, error: null }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({
  useMatrixComposerStore: () => ({
    composerMode: 'normal', replyToEvent: null, editingEvent: null,
    stripPlainReply: (s: string) => s,
  }),
}))

import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import { NotificationCountType } from 'matrix-js-sdk'

describe('matrix-thread store notification helper', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('returns "highlight" when room has highlight thread notifications', () => {
    mockRoom.threadsAggregateNotificationType = NotificationCountType.Highlight
    const store = useMatrixThreadStore()
    expect(store.getThreadNotificationIndicator()).toBe('highlight')
  })

  it('returns "unread" when room has total (non-highlight) thread notifications', () => {
    mockRoom.threadsAggregateNotificationType = NotificationCountType.Total
    const store = useMatrixThreadStore()
    expect(store.getThreadNotificationIndicator()).toBe('unread')
  })

  it('returns "none" when no thread notifications', () => {
    mockRoom.threadsAggregateNotificationType = 0
    const store = useMatrixThreadStore()
    expect(store.getThreadNotificationIndicator()).toBe('none')
  })

  it('returns "none" when activeRoom is null', () => {
    // 临时让 activeRoom 返回 null
    const roomMod = require('@/custom/matrix-chat/stores/matrix-room')
    const original = Object.getOwnPropertyDescriptor(roomMod, 'useMatrixRoomStore')
    Object.defineProperty(roomMod, 'useMatrixRoomStore', {
      value: () => ({ get activeRoom() { return null } }),
      configurable: true,
    })
    const store = useMatrixThreadStore()
    expect(store.getThreadNotificationIndicator()).toBe('none')
    if (original) Object.defineProperty(roomMod, 'useMatrixRoomStore', original)
  })
})
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-thread-notifications 2>&1 | tail -30`
Expected: FAIL — `getThreadNotificationIndicator` 方法不存在。

- [ ] **Step 3: 重写 matrix-thread.ts**

Replace the entire contents of `overlay/custom/client/matrix-chat/stores/matrix-thread.ts` with:

```ts
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  MatrixEvent,
  MsgType,
  RelationType,
  NotificationCountType,
} from 'matrix-js-sdk'
import { matrixEventBus } from './matrix-events'
import { useMatrixClientStore } from './matrix-client'
import { useMatrixRoomStore } from './matrix-room'
import { useMatrixComposerStore } from './matrix-composer'
import { useMatrixRightPanelStore } from './matrix-right-panel'

export type ThreadNotificationIndicator = 'none' | 'unread' | 'highlight'

export const useMatrixThreadStore = defineStore('matrix-thread', () => {
  const clientStore = useMatrixClientStore()
  const roomStore = useMatrixRoomStore()
  const composer = useMatrixComposerStore()
  const rightPanelStore = useMatrixRightPanelStore()

  // ── View-state back-compat(只读,派生自 right-panel store) ──
  // Task 5/6/8 改完调用点后,Task 9 删除这些 computed。
  const threadRootEventId = computed<string | null>(
    () => rightPanelStore.rightPanelPhase === 'ThreadView'
      ? rightPanelStore.rightPanelThreadRootId
      : (rightPanelStore.rightPanelPhase === 'ThreadPanel' ? '__list__' : null),
  )
  const threadMessages = ref<MatrixEvent[]>([])
  const threadsLoading = ref(false)

  function refreshThreadMessages() {
    const rootId = rightPanelStore.rightPanelThreadRootId
    if (!rootId || !roomStore.activeRoom) {
      threadMessages.value = []
      return
    }
    const thread = roomStore.activeRoom.getThread(rootId)
    if (!thread || !thread.timelineSet) {
      threadMessages.value = []
      return
    }
    const liveTimeline = thread.timelineSet.getLiveTimeline()
    const events = liveTimeline?.getEvents() ?? []
    threadMessages.value = [...events.filter(
      (evt: MatrixEvent) => evt.getType() === 'm.room.message' && !evt.isRedacted(),
    )]
  }

  function setThreadView(event: MatrixEvent) {
    const eventId = event.getId()
    if (!eventId) return
    rightPanelStore.openThreadView(eventId)
    composer.composerMode = 'thread'
    composer.replyToEvent = null
    composer.editingEvent = null
    refreshThreadMessages()
  }

  function clearThreadView() {
    rightPanelStore.clearThreadView()
    threadMessages.value = []
    composer.composerMode = 'normal'
    composer.replyToEvent = null
    composer.editingEvent = null
  }

  function openThreadPanel() {
    rightPanelStore.openThreadPanel()
    threadMessages.value = []
  }

  function toggleThreadPanel() {
    if (rightPanelStore.rightPanelPhase === 'ThreadPanel'
      || rightPanelStore.rightPanelPhase === 'ThreadView') {
      rightPanelStore.closeRightPanel()
    } else {
      openThreadPanel()
    }
  }

  /** Send a message in a thread with m.thread relation */
  async function sendThreadMessage(text: string, threadRootId: string, lastReplyId?: string) {
    if (!clientStore.client || !roomStore.activeRoomId) return
    try {
      const content: Record<string, unknown> = {
        body: text,
        msgtype: MsgType.Text,
        'm.relates_to': {
          rel_type: RelationType.Thread,
          event_id: threadRootId,
          is_falling_back: true,
          'm.in_reply_to': {
            event_id: lastReplyId ?? threadRootId,
          },
        },
      }
      await clientStore.client.sendEvent(roomStore.activeRoomId, 'm.room.message' as any, content as any)
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to send thread message'
      throw err
    }
  }

  /** Initialize threads timeline sets on the server (mirrors element-web ThreadPanel onMount) */
  async function initRoomThreads(): Promise<void> {
    if (!roomStore.activeRoom) return
    threadsLoading.value = true
    try {
      await roomStore.activeRoom.createThreadsTimelineSets()
      await roomStore.activeRoom.fetchRoomThreads()
    } catch {
      // Server may not support threads — ignore
    }
    threadsLoading.value = false
  }

  // ── Thread helpers ──────────────────────────────────────

  function getThreadForEvent(event: MatrixEvent): any | null {
    if (!roomStore.activeRoom) return null
    const eventId = event.getId()
    if (!eventId) return null
    return roomStore.activeRoom.getThread(eventId) ?? null
  }

  function getThreadReplyCount(event: MatrixEvent): number {
    const thread = getThreadForEvent(event)
    if (!thread) return 0
    return thread.length ?? 0
  }

  function getThreadLastReply(event: MatrixEvent): MatrixEvent | null {
    const thread = getThreadForEvent(event)
    if (!thread) return null
    return thread.replyToEvent ?? null
  }

  function getRoomThreads(): any[] {
    if (!roomStore.activeRoom) return []
    try {
      const threadList = roomStore.activeRoom.getThreads()
      if (!threadList) return []
      return [...threadList]
    } catch {
      return []
    }
  }

  /**
   * 话题通知指示器(镜像 element-web determineUnreadState + notificationLevelToIndicator)。
   * 读 room.threadsAggregateNotificationType。
   */
  function getThreadNotificationIndicator(): ThreadNotificationIndicator {
    if (!roomStore.activeRoom) return 'none'
    try {
      const t = roomStore.activeRoom.threadsAggregateNotificationType
      if (t === NotificationCountType.Highlight) return 'highlight'
      if (t === NotificationCountType.Total) return 'unread'
      return 'none'
    } catch {
      return 'none'
    }
  }

  const hasThreadNotifications = computed(() => getThreadNotificationIndicator() !== 'none')

  matrixEventBus.onSelectRoom.value = () => {
    rightPanelStore.closeRightPanel()
    threadMessages.value = []
  }
  matrixEventBus.onThreadUpdate.value = refreshThreadMessages

  return {
    // back-compat view state
    threadRootEventId,
    threadMessages,
    threadsLoading,
    refreshThreadMessages,
    setThreadView,
    clearThreadView,
    openThreadPanel,
    toggleThreadPanel,
    // pure helpers
    sendThreadMessage,
    initRoomThreads,
    getThreadForEvent,
    getThreadReplyCount,
    getThreadLastReply,
    getRoomThreads,
    getThreadNotificationIndicator,
    hasThreadNotifications,
  }
})
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-thread-notifications 2>&1 | tail -30`
Expected: PASS — 4 个用例通过。

- [ ] **Step 5: 跑全量测试,确认无回归**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test 2>&1 | tail -15`
Expected: 全部 PASS(旧的 right-panel 调用点暂时未改,但因为 thread store 保留了 back-compat computed,编译与运行均不破)。

- [ ] **Step 6: 生成测试 patch + 登记 series + 提交**

```bash
git -C /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio diff -- tests/client/matrix-thread-notifications.test.ts \
  > /Volumes/nvme2230/lab/ncwk/overlay/patches/056-test-matrix-thread-notifications.patch
printf '\n056-test-matrix-thread-notifications.patch\n' >> /Volumes/nvme2230/lab/ncwk/overlay/patches/series
cd /Volumes/nvme2230/lab/ncwk/overlay && npm run clean && npm run inject && npm run test -- matrix-thread-notifications 2>&1 | tail -10
git -C /Volumes/nvme2230/lab/ncwk/overlay add \
  custom/client/matrix-chat/stores/matrix-thread.ts \
  patches/056-test-matrix-thread-notifications.patch patches/series
git -C /Volumes/nvme2230/lab/ncwk/overlay commit -m "refactor(matrix): slim thread store to helpers + add notification indicator"
```

---

## Task 3: matrix-room store 新增 thread timeline helpers

**Files:**
- Modify: `overlay/custom/client/matrix-chat/stores/matrix-room.ts`
- Create: `overlay/patches/057-test-matrix-room-threads.patch`

为 TimelinePanel 参数化(Task 4)与列表/详情视图(Task 5/6)提供数据来源。

- [ ] **Step 1: 写失败的测试**

确保已 inject。把以下内容写到 `upstream/hermes-studio/tests/client/matrix-room-threads.test.ts`(不提交,仅生成 patch):

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const allSet = { filterId: 'all' }
const mySet = { filterId: 'my' }
const threadObj = { id: '$root:server' }

const mockRoom = {
  threadsTimelineSets: [allSet, mySet],
  getThread: vi.fn((id: string) => (id === '$root:server' ? threadObj : null)),
  createThreadsTimelineSets: vi.fn().mockResolvedValue(undefined),
  fetchRoomThreads: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: null, error: null }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-events', () => ({
  matrixEventBus: { onSelectRoom: { value: null }, onThreadUpdate: { value: null }, onRoomListChange: { value: null }, onTimeline: { value: null } },
}))

import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

describe('matrix-room store thread helpers', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('getThreadsTimelineSet returns [0] for all, [1] for my', () => {
    const store = useMatrixRoomStore()
    // 直接注入 mock activeRoom(绕过 selectRoom 的 SDK 路径)
    ;(store as any).activeRoom = mockRoom
    expect(store.getThreadsTimelineSet('all')).toBe(allSet)
    expect(store.getThreadsTimelineSet('my')).toBe(mySet)
  })

  it('getThreadsTimelineSet returns undefined when no active room', () => {
    const store = useMatrixRoomStore()
    ;(store as any).activeRoom = null
    expect(store.getThreadsTimelineSet('all')).toBe(undefined)
  })

  it('getThreadById returns the SDK Thread object', () => {
    const store = useMatrixRoomStore()
    ;(store as any).activeRoom = mockRoom
    expect(store.getThreadById('$root:server')).toBe(threadObj)
    expect(store.getThreadById('$missing:server')).toBe(null)
  })

  it('initRoomThreads calls createThreadsTimelineSets + fetchRoomThreads', async () => {
    const store = useMatrixRoomStore()
    ;(store as any).activeRoom = mockRoom
    await store.initRoomThreads()
    expect(mockRoom.createThreadsTimelineSets).toHaveBeenCalled()
    expect(mockRoom.fetchRoomThreads).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-room-threads 2>&1 | tail -30`
Expected: FAIL — `getThreadsTimelineSet` / `getThreadById` / `initRoomThreads` 不存在。

- [ ] **Step 3: 在 matrix-room.ts 新增三个方法**

打开 `overlay/custom/client/matrix-chat/stores/matrix-room.ts`,在 `return { ... }` 之前(Task 2 后 store 已 import 了所需类型;若缺则补 import)添加:

```ts
  /** 初始化房间的话题 timeline sets(镜像 element-web ThreadPanel onMount) */
  async function initRoomThreads(): Promise<void> {
    if (!activeRoom.value) return
    try {
      await activeRoom.value.createThreadsTimelineSets()
      await activeRoom.value.fetchRoomThreads()
    } catch {
      // Server may not support threads — ignore
    }
  }

  /**
   * 取话题过滤后的 timeline set。
   * All = threadsTimelineSets[0],My = [1](镜像 element-web ThreadPanel)。
   */
  function getThreadsTimelineSet(filter: 'all' | 'my'): any | undefined {
    if (!activeRoom.value) return undefined
    const sets = (activeRoom.value as any).threadsTimelineSets
    if (!sets) return undefined
    return filter === 'my' ? sets[1] : sets[0]
  }

  /** 按 id 取 SDK Thread 对象 */
  function getThreadById(threadId: string): any | null {
    if (!activeRoom.value) return null
    try {
      return activeRoom.value.getThread(threadId) ?? null
    } catch {
      return null
    }
  }
```

然后在 store 的 `return { ... }` 中加入这三个方法名(放在已有导出旁边,如 `paginateMessages` 之后):

```ts
    paginateMessages,
    initRoomThreads,
    getThreadsTimelineSet,
    getThreadById,
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-room-threads 2>&1 | tail -30`
Expected: PASS — 4 个用例通过。

- [ ] **Step 5: 生成测试 patch + 登记 series + 提交**

```bash
git -C /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio diff -- tests/client/matrix-room-threads.test.ts \
  > /Volumes/nvme2230/lab/ncwk/overlay/patches/057-test-matrix-room-threads.patch
printf '\n057-test-matrix-room-threads.patch\n' >> /Volumes/nvme2230/lab/ncwk/overlay/patches/series
cd /Volumes/nvme2230/lab/ncwk/overlay && npm run clean && npm run inject && npm run test -- matrix-room-threads 2>&1 | tail -10
git -C /Volumes/nvme2230/lab/ncwk/overlay add \
  custom/client/matrix-chat/stores/matrix-room.ts \
  patches/057-test-matrix-room-threads.patch patches/series
git -C /Volumes/nvme2230/lab/ncwk/overlay commit -m "feat(matrix): add thread timeline helpers to room store"
```

---

## Task 4: MatrixTimelinePanel 参数化(向后兼容)

**Files:**
- Modify: `overlay/custom/client/matrix-chat/components/MatrixTimelinePanel.vue`
- Create: `overlay/patches/058-test-matrix-timeline-panel-params.patch`

关键:所有新 props 可选,不传 = 现状(读 roomStore.activeRoomMessages),保证主聊天界面零回归。

- [ ] **Step 1: 写失败的参数化测试**

确保已 inject。把以下内容写到 `upstream/hermes-studio/tests/client/matrix-timeline-panel-params.test.ts`(不提交,仅生成 patch):

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// 这个测试只验证 props 的默认值与派生逻辑入口,不挂载完整组件(避免 SDK 依赖)。
// 组件渲染测试用 @vue/test-utils 在 Task 5 ThreadSummary 里做。
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: null, error: null, userId: '' }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-events', () => ({
  matrixEventBus: { onSelectRoom: { value: null }, onThreadUpdate: { value: null }, onRoomListChange: { value: null }, onTimeline: { value: null } },
}))

describe('MatrixTimelinePanel params (props contract)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('exposes optional props with documented defaults via component meta', async () => {
    // 读取组件的 props 定义,验证默认值(不挂载,避免触发 onMounted scroll 逻辑)
    const mod = await import('@/custom/matrix-chat/components/MatrixTimelinePanel.vue')
    const comp: any = mod.default
    const props = comp.props as Record<string, { default?: any; required?: boolean; type?: any }>
    // 旧的调用点不传这些 prop → 它们必须有默认值,且不 required
    expect(props.timelineSet?.required).toBeFalsy()
    expect(props.timelineSet?.default).toBeUndefined() // undefined ⇒ 走 roomStore 现状分支
    expect(props.renderingType?.required).toBeFalsy()
    expect(props.renderingType?.default).toBe('room')
    expect(props.threadId?.required).toBeFalsy()
    expect(props.showReadReceipts?.required).toBeFalsy()
    expect(props.showReadReceipts?.default).toBe(true)
    expect(props.showReactions?.required).toBeFalsy()
    expect(props.showReactions?.default).toBe(true)
    expect(props.hideThreadedMessages?.required).toBeFalsy()
    expect(props.hideThreadedMessages?.default).toBe(false)
    expect(props.alwaysShowTimestamps?.required).toBeFalsy()
    expect(props.alwaysShowTimestamps?.default).toBe(false)
    expect(props.disableGrouping?.required).toBeFalsy()
    expect(props.disableGrouping?.default).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-timeline-panel-params 2>&1 | tail -30`
Expected: FAIL — 组件 props 不含 `timelineSet` / `renderingType` 等。

- [ ] **Step 3: 改造 MatrixTimelinePanel.vue**

打开 `overlay/custom/client/matrix-chat/components/MatrixTimelinePanel.vue`,在 `<script setup>` 顶部 props 定义之前补 import,并重写关键部分。完整改造后的 `<script setup>` 开头到 `messages` computed:

替换现有的:
```ts
const roomStore = useMatrixRoomStore()
const { t } = useI18n()

const listRef = ref<HTMLElement | null>(null)
```
和
```ts
const messages = computed(() => roomStore.activeRoomMessages)
```

为新版本(在 `const roomStore = ...` 之后插入 props,并替换 messages computed)。具体编辑:

**Edit A** — 在 `const roomStore = useMatrixRoomStore()` 行之前插入 props 定义:

```ts
interface Props {
  /** 传入时,从该 timelineSet 派生消息(列表/详情用);不传 = 读 roomStore.activeRoomMessages(主聊天界面,零回归) */
  timelineSet?: any
  /** 渲染模式:'room'(主时间线)|'thread'(单话题详情)|'threads-list'(话题列表) */
  renderingType?: 'room' | 'thread' | 'threads-list'
  /** thread id(renderingType='thread' 时用) */
  threadId?: string
  showReadReceipts?: boolean
  showReactions?: boolean
  hideThreadedMessages?: boolean
  alwaysShowTimestamps?: boolean
  disableGrouping?: boolean
  emptyState?: { title: string; description: string }
}
const props = withDefaults(defineProps<Props>(), {
  timelineSet: undefined,
  renderingType: 'room',
  threadId: undefined,
  showReadReceipts: true,
  showReactions: true,
  hideThreadedMessages: false,
  alwaysShowTimestamps: false,
  disableGrouping: false,
  emptyState: undefined,
})
```

**Edit B** — 替换 `const messages = computed(() => roomStore.activeRoomMessages)` 为:

```ts
// 传入 timelineSet ⇒ 从该 timelineSet 派生;否则走 roomStore(现状)
const useExternalTimeline = computed(() => props.timelineSet !== undefined)
const messages = computed(() => {
  if (useExternalTimeline.value) {
    const live = props.timelineSet?.getLiveTimeline?.()
    const evts = live?.getEvents?.() ?? []
    return evts.filter((e: any) => e.getType?.() === 'm.room.message' && !e.isRedacted?.())
  }
  return roomStore.activeRoomMessages
})
```

**Edit C** — 把 `groupedItems` computed 里的续接合并改成受 `disableGrouping` 控制。在 `groupedItems` 内部,找到这段:

```ts
    const senderId = event.getSender() ?? ''
    const isContinuation = senderId === lastSenderId && lastDateStr === dateStr
```
替换为:
```ts
    const senderId = event.getSender() ?? ''
    const isContinuation = !props.disableGrouping && senderId === lastSenderId && lastDateStr === dateStr
```

**Edit D** — `loadMore` 函数:在外部 timeline 模式下走 timelineSet 自己的分页。把现有:
```ts
async function loadMore() {
  if (isLoadingMore.value) return
  isLoadingMore.value = true
  try {
    await roomStore.paginateMessages()
  } catch {
    // ignore
  } finally {
    isLoadingMore.value = false
  }
}
```
替换为:
```ts
async function loadMore() {
  if (isLoadingMore.value) return
  isLoadingMore.value = true
  try {
    if (useExternalTimeline.value) {
      const live = props.timelineSet?.getLiveTimeline?.()
      await live?.paginate?.('b' as any, 20)
    } else {
      await roomStore.paginateMessages()
    }
  } catch {
    // ignore
  } finally {
    isLoadingMore.value = false
  }
}
```

**Edit E** — 模板:`<MatrixMessageItem>` 上透传 `rendering-type` / `thread-id` / `show-reactions` / `always-show-timestamps`。把模板里的:
```vue
      <MatrixMessageItem
        v-if="item.type === 'message'"
        :event="item.event"
        :show-sender="item.showSender"
        :is-continuation="item.isContinuation"
        :is-last-in-section="item.isLastInSection"
        :layout="roomStore.timelineLayout"
      />
```
替换为:
```vue
      <MatrixMessageItem
        v-if="item.type === 'message'"
        :event="item.event"
        :show-sender="item.showSender"
        :is-continuation="item.isContinuation"
        :is-last-in-section="item.isLastInSection"
        :layout="roomStore.timelineLayout"
        :rendering-type="renderingType"
        :thread-id="threadId"
        :show-reactions="showReactions"
        :always-show-timestamps="alwaysShowTimestamps"
      />
```

- [ ] **Step 4: 运行测试,确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-timeline-panel-params 2>&1 | tail -30`
Expected: PASS。

- [ ] **Step 5: 跑全量测试,确认主聊天界面零回归**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test 2>&1 | tail -15`
Expected: 全部 PASS。

- [ ] **Step 6: 生成测试 patch + 登记 series + 提交**

```bash
git -C /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio diff -- tests/client/matrix-timeline-panel-params.test.ts \
  > /Volumes/nvme2230/lab/ncwk/overlay/patches/058-test-matrix-timeline-panel-params.patch
printf '\n058-test-matrix-timeline-panel-params.patch\n' >> /Volumes/nvme2230/lab/ncwk/overlay/patches/series
cd /Volumes/nvme2230/lab/ncwk/overlay && npm run clean && npm run inject && npm run test -- matrix-timeline-panel-params 2>&1 | tail -10
git -C /Volumes/nvme2230/lab/ncwk/overlay add \
  custom/client/matrix-chat/components/MatrixTimelinePanel.vue \
  patches/058-test-matrix-timeline-panel-params.patch patches/series
git -C /Volumes/nvme2230/lab/ncwk/overlay commit -m "feat(matrix): parameterize MatrixTimelinePanel (backward-compatible props)"
```

---

## Task 5: 新增 MatrixThreadSummary + MatrixThreadMessagePreview

**Files:**
- Create: `overlay/custom/client/matrix-chat/components/MatrixThreadSummary.vue`
- Create: `overlay/custom/client/matrix-chat/components/MatrixThreadMessagePreview.vue`
- Create: `overlay/custom/client/matrix-chat/components/MatrixSpinner.vue`
- Create: `overlay/patches/059-test-matrix-thread-summary.patch`

移植 `upstream/element-web/packages/shared-components/.../ThreadSummary/ThreadSummaryView.tsx` + `ThreadSummary.module.css`。

- [ ] **Step 1: 写失败的组件测试**

确保已 inject。把以下内容写到 `upstream/hermes-studio/tests/client/matrix-thread-summary.test.ts`(不提交,仅生成 patch):

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'

vi.mock('@/custom/matrix-chat/stores/matrix-room', () => ({
  useMatrixRoomStore: () => ({
    getUserAvatarUrl: () => null,
  }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-client', () => ({
  useMatrixClientStore: () => ({ client: null, error: null, userId: '' }),
}))
vi.mock('@/custom/matrix-chat/stores/matrix-events', () => ({
  matrixEventBus: { onSelectRoom: { value: null }, onThreadUpdate: { value: null }, onRoomListChange: { value: null }, onTimeline: { value: null } },
}))
vi.mock('@/custom/matrix-chat/stores/matrix-composer', () => ({
  useMatrixComposerStore: () => ({ stripPlainReply: (s: string) => s }),
}))

import MatrixThreadSummary from '@/custom/matrix-chat/components/MatrixThreadSummary.vue'

function makeThread(length: number, lastReply?: any) {
  return {
    length,
    replyToEvent: lastReply ?? null,
    id: '$root:server',
    room: { roomId: '!r:s' },
  }
}

describe('MatrixThreadSummary', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders reply count label', () => {
    const thread = makeThread(3)
    const wrapper = mount(MatrixThreadSummary, {
      props: { thread, mxEvent: { getId: () => '$root:server' } as any },
    })
    expect(wrapper.text()).toContain('3')
  })

  it('emits openThread with root event id on click', async () => {
    const thread = makeThread(1)
    const wrapper = mount(MatrixThreadSummary, {
      props: { thread, mxEvent: { getId: () => '$root:server' } as any },
    })
    await wrapper.find('button').trigger('click')
    const emitted = wrapper.emitted('openThread')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual(['$root:server'])
  })

  it('renders empty string count when thread has 0 replies', () => {
    const thread = makeThread(0)
    const wrapper = mount(MatrixThreadSummary, {
      props: { thread, mxEvent: { getId: () => '$root:server' } as any },
    })
    expect(wrapper.find('.mx_ThreadSummary_repliesAmount').text()).toBe('')
  })
})
```

> 注:此测试依赖 `@vue/test-utils`。若 `upstream/hermes-studio/package.json` 未装,先在 Task 5 Step 1b 安装。

- [ ] **Step 1b: 确认 @vue/test-utils 已安装**

Run: `cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio && node -e "console.log(require('./package.json').devDependencies?.['@vue/test-utils'] ?? 'MISSING')"`
若输出 `MISSING`:`npm install -D @vue/test-utils` (在 hermes-studio 目录)
否则:跳过。

- [ ] **Step 2: 运行测试,确认失败**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-thread-summary 2>&1 | tail -30`
Expected: FAIL — `@/custom/matrix-chat/components/MatrixThreadSummary.vue` 不存在。

- [ ] **Step 3: 创建 MatrixSpinner.vue**

Create `overlay/custom/client/matrix-chat/components/MatrixSpinner.vue`:

```vue
<script setup lang="ts">
interface Props {
  size?: number
}
withDefaults(defineProps<Props>(), { size: 18 })
</script>

<template>
  <div class="mx_Spinner" :style="{ width: size + 'px', height: size + 'px' }" role="status" aria-label="Loading" />
</template>

<style scoped lang="scss">
.mx_Spinner {
  border: 2px solid var(--border-color, #e0e0e0);
  border-top-color: var(--accent-primary, #333333);
  border-radius: 50%;
  animation: mx-spin 0.7s linear infinite;
  display: inline-block;
}

@keyframes mx-spin {
  to { transform: rotate(360deg); }
}
</style>
```

- [ ] **Step 4: 创建 MatrixThreadMessagePreview.vue**

Create `overlay/custom/client/matrix-chat/components/MatrixThreadMessagePreview.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'

interface Props {
  lastReply: MatrixEvent | null
  showDisplayName?: boolean
}
const props = withDefaults(defineProps<Props>(), { showDisplayName: true })
const roomStore = useMatrixRoomStore()
const composer = useMatrixComposerStore()

const sender = computed(() => props.lastReply?.getSender() ?? '')
const senderName = computed(() => sender.value)
const avatarUrl = computed(() => props.lastReply ? roomStore.getUserAvatarUrl(props.lastReply.getSender(), 24) : null)
const initial = computed(() => sender.value.charAt(0).toUpperCase())
const previewContent = computed(() => {
  if (!props.lastReply) return ''
  const c = props.lastReply.getContent()
  return composer.stripPlainReply(c?.body ?? '').slice(0, 80)
})
</script>

<template>
  <span v-if="lastReply" class="mx_ThreadSummary_preview">
    <span v-if="avatarUrl" class="mx_ThreadSummary_preview-avatar">
      <img :src="avatarUrl!" alt="" />
    </span>
    <span v-else-if="showDisplayName" class="mx_ThreadSummary_preview-avatar mx_ThreadSummary_preview-avatar--placeholder">{{ initial }}</span>
    <span v-if="showDisplayName && senderName" class="mx_ThreadSummary_preview-sender">{{ senderName }}</span>
    <span class="mx_ThreadSummary_preview-content">{{ previewContent }}</span>
  </span>
</template>

<style scoped lang="scss">
.mx_ThreadSummary_preview {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
  flex: 1;
  min-width: 0;
}
.mx_ThreadSummary_preview-avatar {
  flex-shrink: 0;
  margin-right: 8px;
  img {
    width: 24px; height: 24px; border-radius: 50%; object-fit: cover;
  }
}
.mx_ThreadSummary_preview-avatar--placeholder {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--bg-secondary); color: var(--text-secondary);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600;
}
.mx_ThreadSummary_preview-sender {
  font-weight: 600;
  margin-right: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 120px;
}
.mx_ThreadSummary_preview-content {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
```

- [ ] **Step 5: 创建 MatrixThreadSummary.vue**

Create `overlay/custom/client/matrix-chat/components/MatrixThreadSummary.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import MatrixThreadMessagePreview from './MatrixThreadMessagePreview.vue'

interface Props {
  thread: any
  mxEvent: MatrixEvent
  narrow?: boolean
}
const props = withDefaults(defineProps<Props>(), { narrow: false })
const emit = defineEmits<{ openThread: [rootEventId: string] }>()

const threadStore = useMatrixThreadStore()
const { t } = useI18n()

const replyCount = computed(() => props.thread?.length ?? 0)
const replyCountLabel = computed(() => {
  if (replyCount.value === 0) return ''
  return props.narrow ? String(replyCount.value) : t('matrixChat.threadsCountOfReply', { count: replyCount.value })
})
const lastReply = computed<MatrixEvent | null>(() => props.thread?.replyToEvent ?? null)
const notificationIndicator = computed(() => threadStore.getThreadNotificationIndicator())

function handleClick() {
  const id = props.mxEvent.getId()
  if (id) emit('openThread', id)
}
</script>

<template>
  <button
    type="button"
    class="mx_ThreadSummary"
    :class="{ narrow, 'is-highlight': notificationIndicator === 'highlight', 'is-unread': notificationIndicator === 'unread' }"
    @click="handleClick"
  >
    <span class="mx_ThreadSummary_threadIcon">
      <!-- ThreadsSolidIcon (内联 SVG,沿用 overlay 现有风格) -->
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span v-if="notificationIndicator !== 'none'" class="mx_ThreadSummary_indicator" :class="notificationIndicator" />
    </span>
    <span class="mx_ThreadSummary_repliesAmount">{{ replyCountLabel }}</span>
    <MatrixThreadMessagePreview :last-reply="lastReply" :show-display-name="!narrow" />
    <span class="mx_ThreadSummary_chevron" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </span>
  </button>
</template>

<style scoped lang="scss">
.mx_ThreadSummary {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-top: 8px;
  min-width: 267px;
  max-width: 600px;
  width: fit-content;
  height: 40px;
  padding: 0 16px 0 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--bg-secondary);
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: start;
  appearance: none;
  box-sizing: border-box;
  overflow: hidden;
  transition: border-color 0.1s ease-in-out;

  &:hover, &:focus {
    border-color: var(--accent-primary);
  }
  &:hover .mx_ThreadSummary_chevron, &:focus .mx_ThreadSummary_chevron {
    opacity: 1;
    transform: translateX(0);
  }
  &.narrow {
    min-width: 0;
    max-width: 100%;
    width: auto;
  }
}

.mx_ThreadSummary_threadIcon {
  position: relative;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  margin-right: 8px;
  color: var(--text-secondary);
}
.mx_ThreadSummary_indicator {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--bg-card);
  &.highlight { background: #ff4b4b; }
  &.unread { background: #ffc107; }
}

.mx_ThreadSummary_repliesAmount {
  font-weight: 600;
  color: var(--text-secondary);
  padding: 0 12px 0 8px;
  white-space: nowrap;
}

.mx_ThreadSummary_chevron {
  position: absolute;
  top: 0; right: 0; bottom: 0;
  width: 60px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 4px;
  background: linear-gradient(270deg, var(--bg-card) 50%, transparent 100%);
  color: var(--text-secondary);
  opacity: 0;
  transform: translateX(60px);
  transition: opacity 0.1s ease-in-out, transform 0.1s ease-in-out;
  pointer-events: none;
}
</style>
```

- [ ] **Step 6: 运行测试,确认通过**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && npm run test -- matrix-thread-summary 2>&1 | tail -30`
Expected: PASS — 3 个用例通过。

- [ ] **Step 7: 生成测试 patch + 登记 series + 提交**

```bash
git -C /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio diff -- tests/client/matrix-thread-summary.test.ts \
  > /Volumes/nvme2230/lab/ncwk/overlay/patches/059-test-matrix-thread-summary.patch
printf '\n059-test-matrix-thread-summary.patch\n' >> /Volumes/nvme2230/lab/ncwk/overlay/patches/series
cd /Volumes/nvme2230/lab/ncwk/overlay && npm run clean && npm run inject && npm run test -- matrix-thread-summary 2>&1 | tail -10
git -C /Volumes/nvme2230/lab/ncwk/overlay add \
  custom/client/matrix-chat/components/MatrixThreadSummary.vue \
  custom/client/matrix-chat/components/MatrixThreadMessagePreview.vue \
  custom/client/matrix-chat/components/MatrixSpinner.vue \
  patches/059-test-matrix-thread-summary.patch patches/series
git -C /Volumes/nvme2230/lab/ncwk/overlay commit -m "feat(matrix): add MatrixThreadSummary card (ported from element-web ThreadSummaryView)"
```

> ⚠️ `@vue/test-utils`:若 hermes-studio 未安装,Step 1b 先装。但 hermes-studio 是上游仓,**不要直接改它的 package.json 提交**——若需新增依赖,要走 overlay patch(类似 `017-package-json-matrix-sdk-dep.patch`)。先检查是否已装;多数情况 vue 生态已含。

---

## Task 6: MatrixMessageItem 支持 renderingType(threads-list 模式)

**Files:**
- Modify: `overlay/custom/client/matrix-chat/components/MatrixMessageItem.vue`
- Modify: `overlay/custom/client/matrix-chat/components/MatrixEventTileFooter.vue`

让 threads-list 模式下 footer 用 `MatrixThreadSummary`(Task 5 已建),隐藏 reactions/RR。

- [ ] **Step 1: 改 MatrixMessageItem.vue 加 props**

打开 `overlay/custom/client/matrix-chat/components/MatrixMessageItem.vue`,把现有:
```ts
interface Props {
  event: MatrixEvent
  showSender?: boolean
  isContinuation?: boolean
  isLastInSection?: boolean
  isLast?: boolean
  layout?: 'group' | 'bubble' | 'irc'
}

const props = withDefaults(defineProps<Props>(), {
  showSender: true,
  isContinuation: false,
  isLastInSection: false,
  isLast: false,
  layout: 'group',
})
```
替换为:
```ts
interface Props {
  event: MatrixEvent
  showSender?: boolean
  isContinuation?: boolean
  isLastInSection?: boolean
  isLast?: boolean
  layout?: 'group' | 'bubble' | 'irc'
  renderingType?: 'room' | 'thread' | 'threads-list'
  threadId?: string
  showReactions?: boolean
  alwaysShowTimestamps?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showSender: true,
  isContinuation: false,
  isLastInSection: false,
  isLast: false,
  layout: 'group',
  renderingType: 'room',
  threadId: undefined,
  showReactions: true,
  alwaysShowTimestamps: false,
})
```

- [ ] **Step 2: 在 MatrixMessageItem 加 openThread 入口与 footer 切换**

在 `<script setup>` 中,现有 `function openThread()` 之后(Task 2 后该函数存在,调用 `threadStore.setThreadView(props.event)`)改为同时支持新路由:

把现有:
```ts
function openThread() {
  threadStore.setThreadView(props.event)
}
```
替换为:
```ts
function openThread() {
  // 优先走新路由(right-panel store);setThreadView 内部已改为调 openThreadView
  threadStore.setThreadView(props.event)
}
```

并在 `<script setup>` 顶部 import 补 `MatrixThreadSummary`(若 footer 内部使用则不用在此 import;footer 的改造见 Step 4)。同时为模板暴露 `showReactions`/`renderingType` 派生:

在 `<script setup>` 末尾(`function handleCopyLink()` 附近)新增:
```ts
// threads-list 模式下隐藏 reactions/RR(对齐上游 showReactions=false)
const effectiveHasReactions = computed(() => props.renderingType === 'threads-list' ? false : hasReactions.value)
const effectiveShowActionBar = computed(() => props.renderingType === 'threads-list' ? false : true)
```

- [ ] **Step 3: 改 MatrixMessageItem 模板,透传给 footer**

在模板中找到 `<MatrixEventTileFooter>` 调用,把 `hasReactions` / `showActionBar` 替换为 effective 版本,并新增 `:rendering-type` 透传。具体:把 footer 标签的 props 里:
```
      :has-reactions="hasReactions"
      :show-action-bar="..."
```
改为:
```
      :has-reactions="effectiveHasReactions"
      :show-action-bar="effectiveShowActionBar"
      :rendering-type="renderingType"
```
(具体现有属性名以文件实际为准;核心是 hasReactions → effectiveHasReactions,新增 rendering-type。)

- [ ] **Step 4: 改 MatrixEventTileFooter.vue 用 MatrixThreadSummary**

替换 `overlay/custom/client/matrix-chat/components/MatrixEventTileFooter.vue` 全文为:

```vue
<script setup lang="ts">
import MatrixReactionsRow from './MatrixReactionsRow.vue'
import MatrixReadReceiptGroup from './MatrixReadReceiptGroup.vue'
import MatrixThreadSummary from './MatrixThreadSummary.vue'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import { computed } from 'vue'
import type { MatrixEvent } from 'matrix-js-sdk'

interface Props {
  eventId: string | null
  hasReactions: boolean
  showActionBar: boolean
  isContinuation: boolean
  /** 当前事件(用于查找 thread;threads-list/room 模式均用) */
  event: MatrixEvent
  renderingType?: 'room' | 'thread' | 'threads-list'
}
const props = withDefaults(defineProps<Props>(), { renderingType: 'room' })
const emit = defineEmits<{ openThread: [rootEventId: string] }>()

const threadStore = useMatrixThreadStore()
const thread = computed(() => threadStore.getThreadForEvent(props.event))
const hasThread = computed(() => Boolean(thread.value && (thread.value.length ?? 0) > 0))
</script>

<template>
  <div class="mx_EventTile_footer">
    <MatrixReactionsRow
      v-if="hasReactions || showActionBar"
      :event-id="eventId"
      :show-add-button="showActionBar"
    />

    <MatrixThreadSummary
      v-if="hasThread"
      :thread="thread!"
      :mx-event="event"
      @open-thread="(id: string) => emit('openThread', id)"
    />

    <MatrixReadReceiptGroup
      v-if="eventId && !isContinuation && renderingType !== 'threads-list'"
      :event-id="eventId"
      :max="5"
      :size="16"
      class="mx_EventTile_msgOption"
    />
  </div>
</template>
```

- [ ] **Step 5: 修正所有 MatrixEventTileFooter 的调用点传 :event**

搜索 `MatrixEventTileFooter` 的使用点(`MatrixMessageItem.vue` 模板内),确保新增 `:event="event"` prop(因为 footer 现在需要 event 来查 thread)。若现有调用未传 event,补上。

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && grep -rn "MatrixEventTileFooter" custom/`

- [ ] **Step 6: 跑全量测试 + 手动构建检查**

Run: `cd overlay && npm run test`
Expected: 全部 PASS(此任务无新测试文件,主要靠既有测试不破)。

- [ ] **Step 7: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/matrix-chat/components/MatrixMessageItem.vue \
        custom/client/matrix-chat/components/MatrixEventTileFooter.vue
git commit -m "feat(matrix): MatrixMessageItem supports renderingType; footer uses ThreadSummary"
```

---

## Task 7: 新增 MatrixContextMenu + MatrixThreadPanel 列表重构

**Files:**
- Create: `overlay/custom/client/matrix-chat/components/MatrixContextMenu.vue`
- Modify: `overlay/custom/client/matrix-chat/components/MatrixThreadPanel.vue`

把列表改为 `<MatrixTimelinePanel :timeline-set>` + dropdown 过滤 header(对齐 `ThreadPanelHeader`)。

- [ ] **Step 1: 创建 MatrixContextMenu.vue(轻量)**

Create `overlay/custom/client/matrix-chat/components/MatrixContextMenu.vue`:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

interface MenuItem {
  key: string
  label: string
  description?: string
  selected?: boolean
}
interface Props {
  items: MenuItem[]
  // 相对触发按钮的定位(top/right,px)
  top?: number
  right?: number
}
const props = withDefaults(defineProps<Props>(), { top: 40, right: 0 })
const emit = defineEmits<{ select: [key: string]; close: [] }>()

function onDocClick(e: MouseEvent) {
  const el = e.target as HTMLElement
  if (!el.closest('.mx_ContextMenu')) emit('close')
}
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="mx_ContextMenu" :style="{ top: top + 'px', right: right + 'px' }" role="menu">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      role="menuitemradio"
      :aria-checked="item.selected ? 'true' : 'false'"
      class="mx_ContextMenu_item"
      :class="{ selected: item.selected }"
      @click.stop="emit('select', item.key)"
    >
      <span v-if="item.selected" class="mx_ContextMenu_check" aria-hidden="true">✓</span>
      <span class="mx_ContextMenu_item-label">
        <span class="mx_ContextMenu_item-title">{{ item.label }}</span>
        <span v-if="item.description" class="mx_ContextMenu_item-desc">{{ item.description }}</span>
      </span>
    </button>
  </div>
</template>

<style scoped lang="scss">
.mx_ContextMenu {
  position: absolute;
  z-index: 1000;
  min-width: 200px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  padding: 4px 0;
}
.mx_ContextMenu_item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: start;
  &:hover { background: var(--bg-card-hover); }
}
.mx_ContextMenu_check { color: var(--text-primary); font-size: 12px; margin-top: 2px; }
.mx_ContextMenu_item-label { display: flex; flex-direction: column; }
.mx_ContextMenu_item-title { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.mx_ContextMenu_item-desc { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
</style>
```

- [ ] **Step 2: 重写 MatrixThreadPanel.vue 为列表 = TimelinePanel**

Replace the entire contents of `overlay/custom/client/matrix-chat/components/MatrixThreadPanel.vue` with:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import MatrixTimelinePanel from './MatrixTimelinePanel.vue'
import MatrixSpinner from './MatrixSpinner.vue'
import MatrixContextMenu from './MatrixContextMenu.vue'

const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()
const threadStore = useMatrixThreadStore()
const clientStore = useMatrixClientStore()
const { t } = useI18n()

onMounted(async () => {
  await threadStore.initRoomThreads()
})

const filter = computed(() => rightPanelStore.rightPanelThreadFilter)
const timelineSet = computed(() => roomStore.getThreadsTimelineSet(filter.value))
const hasThreads = computed(() => {
  const set = roomStore.getThreadsTimelineSet('all')
  return Boolean(set?.getLiveTimeline?.()?.getEvents?.()?.length)
})
const emptyState = computed(() => ({
  title: t('matrixChat.threadsEmptyTitle'),
  description: t('matrixChat.threadsEmptyDescription', { replyInThread: t('matrixChat.replyInThread') }),
}))

// dropdown 菜单
const menuOpen = ref(false)
const menuItems = computed(() => [
  { key: 'all', label: t('matrixChat.threadsAllThreads'), description: t('matrixChat.threadsAllThreadsDescription'), selected: filter.value === 'all' },
  { key: 'my', label: t('matrixChat.threadsMyThreads'), description: t('matrixChat.threadsMyThreadsDescription'), selected: filter.value === 'my' },
])
function onSelectFilter(key: string) {
  rightPanelStore.setThreadFilter(key as 'all' | 'my')
  menuOpen.value = false
}

async function markAllRead() {
  if (!roomStore.activeRoom || !clientStore.client) return
  try {
    // 发 unthreaded read receipt(对齐 element-web clearRoomNotification)
    await clientStore.client.sendReadReceipt(roomStore.activeRoom as any)
  } catch {
    // ignore
  }
}

function closePanel() {
  rightPanelStore.closeRightPanel()
}
</script>

<template>
  <div class="matrix-thread-panel">
    <div class="thread-panel-header">
      <h3 class="thread-panel-title">{{ t('matrixChat.threads') }}</h3>
      <button class="thread-panel-icon-btn" :title="t('matrixChat.markAllThreadsRead')" @click="markAllRead">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" /><polyline points="14 6 3 17" opacity="0.4" />
        </svg>
      </button>
      <span class="thread-panel-separator" />
      <button class="thread-panel-dropdown" @click="menuOpen = !menuOpen">
        {{ t('matrixChat.threadsShowFilter') }} {{ filter === 'all' ? t('matrixChat.threadsAllThreads') : t('matrixChat.threadsMyThreads') }}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      <MatrixContextMenu
        v-if="menuOpen"
        :items="menuItems"
        :top="52"
        :right="12"
        @select="onSelectFilter"
        @close="menuOpen = false"
      />
      <button class="thread-panel-close" @click="closePanel">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>

    <div class="thread-panel-body">
      <MatrixTimelinePanel
        v-if="timelineSet"
        :timeline-set="timelineSet"
        rendering-type="threads-list"
        :show-read-receipts="false"
        :show-reactions="false"
        :hide-threaded-messages="false"
        :always-show-timestamps="true"
        :disable-grouping="true"
        :empty-state="hasThreads ? undefined : emptyState"
      />
      <div v-else class="thread-panel-loading"><MatrixSpinner /><span>{{ t('matrixChat.loadingThreads') }}</span></div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.matrix-thread-panel {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-width: 0;
  border-left: 1px solid var(--border-color);
  background: var(--bg-card);
  overflow: hidden;
  position: relative;
}
.thread-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.thread-panel-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; flex-shrink: 0; }
.thread-panel-icon-btn {
  width: 28px; height: 28px; border: none; background: none;
  color: var(--text-secondary); cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  &:hover { background: rgba(51,51,51,0.06); color: var(--text-primary); }
}
.thread-panel-separator { width: 1px; height: 28px; background: var(--border-color); }
.thread-panel-dropdown {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 13px; color: var(--text-secondary);
  background: none; border: none; cursor: pointer;
  padding: 4px 8px; border-radius: 4px;
  &:hover { background: rgba(51,51,51,0.06); }
}
.thread-panel-close {
  margin-left: auto;
  width: 28px; height: 28px; border: none; background: none;
  color: var(--text-secondary); cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  &:hover { background: rgba(51,51,51,0.06); color: var(--text-primary); }
}
.thread-panel-body { flex: 1; min-height: 0; overflow: hidden; display: flex; }
.thread-panel-body :deep(.matrix-timeline-panel) { padding: 8px 12px; }
.thread-panel-loading {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: var(--text-muted); font-size: 13px;
}
</style>
```

> 注:此任务依赖 Task 8 的 i18n key(`threadsAllThreads` 等)。若 Task 8 未做,先用字面量占位 `'All threads'` / `'My threads'`,Task 8 再补真 i18n。

- [ ] **Step 3: 跑全量测试**

Run: `cd overlay && npm run test`
Expected: 全部 PASS。

- [ ] **Step 4: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/matrix-chat/components/MatrixContextMenu.vue \
        custom/client/matrix-chat/components/MatrixThreadPanel.vue
git commit -m "feat(matrix): rebuild ThreadPanel list as TimelinePanel + dropdown filter header"
```

---

## Task 8: 新增 MatrixThreadView(详情,复用 TimelinePanel + Composer)

**Files:**
- Create: `overlay/custom/client/matrix-chat/components/MatrixThreadView.vue`
- Modify: `overlay/custom/client/matrix-chat/components/MatrixMessageInput.vue`(加 compact + threadRelation props)

详情视图复用主时间线,composer 复用 MessageInput。

- [ ] **Step 1: 改 MatrixMessageInput.vue 加 props + thread send 分支**

打开 `overlay/custom/client/matrix-chat/components/MatrixMessageInput.vue`。

在 `<script setup>` 中现有 props 定义处(Task 前文件用 `composerMode` computed 读 store,不显式 defineProps)。新增显式 props:

在 import 之后、其他逻辑之前插入:
```ts
interface Props {
  compact?: boolean
  threadRelation?: {
    rel_type: string
    event_id: string
    is_falling_back?: boolean
    'm.in_reply_to'?: { event_id: string }
  }
}
const props = withDefaults(defineProps<Props>(), { compact: false, threadRelation: undefined })
```

把现有 `handleSend`:
```ts
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || !roomStore.activeRoomId) return
  sending.value = true
  try {
    if (composerMode.value === 'reply' && replyToEvent.value) {
      await composerStore.sendReply(text, replyToEvent.value as any)
    } else if (composerMode.value === 'edit' && editingEvent.value) {
      await composerStore.sendEdit(text, editingEvent.value as any)
    } else {
      await composerStore.sendMessage(text)
    }
    inputText.value = ''
    if (textareaRef.value) textareaRef.value.style.height = 'auto'
  } catch {
    // error is handled in store
  } finally {
    sending.value = false
  }
}
```
替换为:
```ts
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || !roomStore.activeRoomId) return
  sending.value = true
  try {
    if (composerMode.value === 'reply' && replyToEvent.value) {
      await composerStore.sendReply(text, replyToEvent.value as any)
    } else if (composerMode.value === 'edit' && editingEvent.value) {
      await composerStore.sendEdit(text, editingEvent.value as any)
    } else if (props.threadRelation) {
      // thread 模式:走 thread relation send
      const threadStore = useMatrixThreadStore()
      await threadStore.sendThreadMessage(text, props.threadRelation.event_id, props.threadRelation['m.in_reply_to']?.event_id)
    } else {
      await composerStore.sendMessage(text)
    }
    inputText.value = ''
    if (textareaRef.value) textareaRef.value.style.height = 'auto'
  } catch {
    // error is handled in store
  } finally {
    sending.value = false
  }
}
```

并在顶部 import 补:
```ts
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
```

模板的根 div 加 `:class="{ 'matrix-message-input--compact': compact }"`。

- [ ] **Step 2: 创建 MatrixThreadView.vue**

Create `overlay/custom/client/matrix-chat/components/MatrixThreadView.vue`:

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RelationType } from 'matrix-js-sdk'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixThreadStore } from '@/custom/matrix-chat/stores/matrix-thread'
import MatrixTimelinePanel from './MatrixTimelinePanel.vue'
import MatrixMessageInput from './MatrixMessageInput.vue'
import MatrixSpinner from './MatrixSpinner.vue'

const rightPanelStore = useMatrixRightPanelStore()
const roomStore = useMatrixRoomStore()
const threadStore = useMatrixThreadStore()
const { t } = useI18n()

const threadId = computed(() => rightPanelStore.rightPanelThreadRootId)
const loading = ref(true)

const thread = computed(() => (threadId.value ? roomStore.getThreadById(threadId.value) : null))

const threadRelation = computed(() => {
  if (!threadId.value) return undefined
  const lastReplyId = thread.value?.replyToEvent?.getId?.() ?? threadId.value
  return {
    rel_type: RelationType.Thread,
    event_id: threadId.value,
    is_falling_back: true,
    'm.in_reply_to': { event_id: lastReplyId },
  } as any
})

function back() {
  rightPanelStore.clearThreadView()
}
function closePanel() {
  rightPanelStore.closeRightPanel()
}

onMounted(async () => {
  // 若 thread 尚未创建,镜像 element-web setupThread:createThread
  if (threadId.value && roomStore.activeRoom && !thread.value) {
    try {
      const liveTimeline = roomStore.activeRoom.getLiveTimeline()
      const events = liveTimeline?.getEvents() ?? []
      const rootEvt = events.find((e: any) => e.getId() === threadId.value)
      if (rootEvt) {
        ;(roomStore.activeRoom as any).createThread?.(threadId.value, rootEvt, [], true)
      }
    } catch {
      // ignore
    }
  }
  loading.value = false
})
</script>

<template>
  <div class="matrix-thread-view">
    <div class="thread-view-header">
      <button class="thread-view-back" @click="back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        {{ t('matrixChat.backToThreads') }}
      </button>
      <h4 class="thread-view-title">{{ t('matrixChat.thread') }}</h4>
      <button class="thread-view-close" @click="closePanel">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>

    <div class="thread-view-body">
      <MatrixSpinner v-if="loading" />
      <MatrixTimelinePanel
        v-else-if="thread?.timelineSet"
        :timeline-set="thread.timelineSet"
        rendering-type="thread"
        :thread-id="threadId ?? undefined"
        :show-read-receipts="true"
        :show-reactions="true"
      />
    </div>

    <MatrixMessageInput
      v-if="!loading && thread?.timelineSet"
      compact
      :thread-relation="threadRelation"
    />
  </div>
</template>

<style scoped lang="scss">
.matrix-thread-view {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-self: stretch;
  min-width: 0;
  border-left: 1px solid var(--border-color);
  background: var(--bg-card);
  overflow: hidden;
}
.thread-view-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.thread-view-back {
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: none; cursor: pointer;
  color: var(--text-secondary); font-size: 13px;
  padding: 4px 8px; border-radius: 4px;
  &:hover { background: rgba(51,51,51,0.06); color: var(--text-primary); }
}
.thread-view-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin: 0; }
.thread-view-close {
  margin-left: auto;
  width: 28px; height: 28px; border: none; background: none;
  color: var(--text-secondary); cursor: pointer; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  &:hover { background: rgba(51,51,51,0.06); color: var(--text-primary); }
}
.thread-view-body { flex: 1; min-height: 0; overflow: hidden; display: flex; }
.thread-view-body :deep(.matrix-timeline-panel) { padding: 8px 12px; }
</style>
```

- [ ] **Step 3: 跑全量测试**

Run: `cd overlay && npm run test`
Expected: 全部 PASS。

- [ ] **Step 4: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/matrix-chat/components/MatrixThreadView.vue \
        custom/client/matrix-chat/components/MatrixMessageInput.vue
git commit -m "feat(matrix): add MatrixThreadView reusing TimelinePanel + compact composer"
```

---

## Task 9: MatrixRightPanel + MatrixChatPanel 路由分发 + 入口收口

**Files:**
- Modify: `overlay/custom/client/matrix-chat/components/MatrixRightPanel.vue`
- Modify: `overlay/custom/client/matrix-chat/components/MatrixChatPanel.vue`
- Modify: `overlay/custom/client/matrix-chat/components/MatrixRoomHeader.vue`
- Modify: `overlay/custom/client/matrix-chat/components/MatrixRoomSummaryCard.vue`

把 `MatrixChatPanel` 的 `v-if/v-else-if` 改为单一 `MatrixRightPanel`,内部按 phase 分发;所有入口点改调 right-panel store。

- [ ] **Step 1: 改 MatrixChatPanel.vue**

打开 `overlay/custom/client/matrix-chat/components/MatrixChatPanel.vue`。

把模板里:
```vue
      <!-- Content area with optional right panel / thread panel -->
      <div class="chat-content-wrapper">
        <div class="chat-main-content">
          <MatrixMessagePanel />
        </div>
        <MatrixThreadPanel v-if="threadStore.threadRootEventId" />
        <MatrixRightPanel v-else-if="rightPanelStore.rightPanelPhase" />
      </div>
```
替换为:
```vue
      <!-- Content area with optional right panel (按 phase 分发:RoomSummary/MemberList/ThreadPanel/ThreadView) -->
      <div class="chat-content-wrapper">
        <div class="chat-main-content">
          <MatrixMessagePanel />
        </div>
        <MatrixRightPanel v-if="rightPanelStore.rightPanelPhase" />
      </div>
```

并删除 `<script setup>` 中不再用的 `MatrixThreadPanel` import 与 `threadStore`(若 threadStore 在该文件无其他用途)。搜索确认:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay && grep -n "threadStore\|MatrixThreadPanel" custom/client/matrix-chat/components/MatrixChatPanel.vue
```
若仅剩 import 行,删除 import 与 `const threadStore = ...`。

- [ ] **Step 2: 改 MatrixRightPanel.vue 按 phase 分发**

Replace `overlay/custom/client/matrix-chat/components/MatrixRightPanel.vue` 全文为:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import MatrixRoomSummaryCard from './MatrixRoomSummaryCard.vue'
import MatrixMemberList from './MatrixMemberList.vue'
import MatrixMemberInfo from './MatrixMemberInfo.vue'
import MatrixThreadPanel from './MatrixThreadPanel.vue'
import MatrixThreadView from './MatrixThreadView.vue'

const rightPanelStore = useMatrixRightPanelStore()
const { t } = useI18n()

const phase = computed(() => rightPanelStore.rightPanelPhase)
const canGoBack = computed(() => phase.value !== null)

const panelTitle = computed(() => {
  switch (phase.value) {
    case 'RoomSummary': return t('matrixChat.roomInfo')
    case 'MemberList': return t('matrixChat.roomMembers')
    case 'MemberInfo': return t('matrixChat.roomMembers')
    case 'ThreadPanel': return t('matrixChat.threads')
    case 'ThreadView': return t('matrixChat.thread')
    default: return ''
  }
})

function close() {
  // ThreadPanel/ThreadView 有自己的 close 按钮(组件内部),这里兜底
  rightPanelStore.closeRightPanel()
}
</script>

<template>
  <div v-if="phase" class="matrix-right-panel">
    <!-- ThreadPanel / ThreadView 自带 header(含 back/close),跳过通用 header -->
    <template v-if="phase === 'ThreadPanel' || phase === 'ThreadView'">
      <MatrixThreadPanel v-if="phase === 'ThreadPanel'" />
      <MatrixThreadView v-else-if="phase === 'ThreadView'" />
    </template>

    <!-- 其他 phase 用通用 header -->
    <template v-else>
      <div class="right-panel-header">
        <button v-if="canGoBack" class="back-btn" @click="rightPanelStore.rightPanelBack()">
          ← {{ t('matrixChat.cancel') }}
        </button>
        <span class="right-panel-title">{{ panelTitle }}</span>
        <button class="close-btn" @click="close">✕</button>
      </div>
      <div class="right-panel-content">
        <MatrixRoomSummaryCard v-if="phase === 'RoomSummary'" />
        <MatrixMemberList v-else-if="phase === 'MemberList'" />
        <MatrixMemberInfo v-else-if="phase === 'MemberInfo'" />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.matrix-right-panel {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
}
.right-panel-header {
  height: 52px; padding: 0 12px;
  display: flex; align-items: center; gap: 8px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.back-btn {
  height: 28px; padding: 0 8px; border: none; background: none;
  color: var(--accent-primary); font-size: 13px; cursor: pointer;
  border-radius: 4px;
  &:hover { background: rgba(51,51,51,0.04); }
}
.right-panel-title {
  flex: 1; font-size: 15px; font-weight: 600; color: var(--text-primary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.close-btn {
  width: 28px; height: 28px; border: none; background: none;
  color: var(--text-muted); font-size: 16px; cursor: pointer;
  border-radius: 4px; display: flex; align-items: center; justify-content: center;
  &:hover { background: rgba(153,153,153,0.06); color: var(--text-primary); }
}
.right-panel-content { flex: 1; overflow-y: auto; min-width: 0; }
</style>
```

- [ ] **Step 3: 改 MatrixRoomHeader.vue 入口调 openThreadPanel**

打开 `overlay/custom/client/matrix-chat/components/MatrixRoomHeader.vue`。

现有 `isThreadPanelOpen`:
```ts
const isThreadPanelOpen = computed(() => threadStore.threadRootEventId !== null)
```
替换为:
```ts
const isThreadPanelOpen = computed(() =>
  rightPanelStore.rightPanelPhase === 'ThreadPanel' || rightPanelStore.rightPanelPhase === 'ThreadView')
```

现有 `handleToggleRightPanel`:
```ts
function handleToggleRightPanel() {
  if (threadStore.threadRootEventId) {
    threadStore.clearThreadView()
    rightPanelStore.openRoomSummary()
  } else if (rightPanelStore.rightPanelPhase) {
    rightPanelStore.closeRightPanel()
  } else {
    rightPanelStore.openRoomSummary()
  }
}
```
替换为:
```ts
function handleToggleRightPanel() {
  if (rightPanelStore.rightPanelPhase) {
    rightPanelStore.closeRightPanel()
  } else {
    rightPanelStore.openRoomSummary()
  }
}
```

现有 `handleToggleThreadPanel`:
```ts
function handleToggleThreadPanel() {
  threadStore.toggleThreadPanel()
}
```
保留(`threadStore.toggleThreadPanel` 在 Task 2 已重写为调 right-panel store)。

确认 `threadStore` 仍用于 `hasThreadNotifications` 显示(`isThreadPanelOpen` 已不依赖)。若不再用 `threadRootEventId`,无需改 import。

- [ ] **Step 4: 改 MatrixRoomSummaryCard.vue 入口调 openThreadPanel**

打开 `overlay/custom/client/matrix-chat/components/MatrixRoomSummaryCard.vue`,找到现有调 `threadStore.openThreadPanel()` 的按钮(Task 0 grep 显示 line 55),改为:
```ts
rightPanelStore.openThreadPanel()
```
并在该文件 import `useMatrixRightPanelStore`(若未 import)。

- [ ] **Step 5: 跑全量测试**

Run: `cd overlay && npm run test`
Expected: 全部 PASS。

- [ ] **Step 6: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/matrix-chat/components/MatrixRightPanel.vue \
        custom/client/matrix-chat/components/MatrixChatPanel.vue \
        custom/client/matrix-chat/components/MatrixRoomHeader.vue \
        custom/client/matrix-chat/components/MatrixRoomSummaryCard.vue
git commit -m "feat(matrix): route ThreadPanel/ThreadView via right-panel phase; consolidate entry points"
```

---

## Task 10: 删除 MatrixThreadInfo + 补 i18n key + 清理 thread store 兜底

**Files:**
- Delete: `overlay/custom/client/matrix-chat/components/MatrixThreadInfo.vue`
- Modify: `overlay/custom/client/matrix-chat/stores/matrix-thread.ts`(删 back-compat computed)
- Modify(可选): `overlay/patches/053-i18n-locale-zh.patch` 等 10 语言 patch

收尾:删旧组件、清 store 兜底、补 i18n。

- [ ] **Step 1: 确认 MatrixThreadInfo 无引用**

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && grep -rn "MatrixThreadInfo" custom/`
Expected: 仅 `MatrixThreadInfo.vue` 自身(Task 6 已把 footer 改用 MatrixThreadSummary)。若有残留引用,先改。

- [ ] **Step 2: 删除 MatrixThreadInfo.vue**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
rm custom/client/matrix-chat/components/MatrixThreadInfo.vue
```

- [ ] **Step 3: 清理 matrix-thread.ts 的 back-compat 兜底**

打开 `overlay/custom/client/matrix-chat/stores/matrix-thread.ts`。

Task 2 保留的 back-compat computed(`threadRootEventId` 派生 right-panel store)——Task 9 已改完所有调用点,现在删除。

删除:
```ts
  const threadRootEventId = computed<string | null>(...)
```
与 `return { ... }` 里的 `threadRootEventId` 导出。

> ⚠️ 删除前再 grep 确认无组件直接读 `threadStore.threadRootEventId`:
> `cd /Volumes/nvme2230/lab/ncwk/overlay && grep -rn "threadStore.threadRootEventId\|\.threadRootEventId" custom/`
> 应无输出(Task 9 的 MatrixChatPanel/RoomHeader 已改)。若有,先迁到读 `rightPanelStore`。

- [ ] **Step 4: 跑全量测试确认无回归**

Run: `cd overlay && npm run test`
Expected: 全部 PASS。

- [ ] **Step 5: 补 i18n key(以 en + zh 为例,其余 8 语言同模式)**

检查现有 i18n key 是否已含 Task 7/8 用到的:`threadsAllThreads` / `threadsAllThreadsDescription` / `threadsMyThreads` / `threadsMyThreadsDescription` / `threadsEmptyTitle` / `threadsEmptyDescription` / `threadsCountOfReply` / `threadsShowFilter`。

Run: `cd /Volumes/nvme2230/lab/ncwk/overlay && grep -n "threadsAllThreads\|threadsEmptyTitle\|threadsCountOfReply\|threadsShowFilter" patches/053-i18n-locale-zh.patch patches/045-i18n-locale-en.patch`

若缺失,在对应 patch 文件的 `matrixChat` 对象内补。**定位方式**:先 grep 找到现有 thread 相关 key 的 hunk,把新 key 追加到同一 hunk 的末尾(紧接 `threadPlaceholder: ...` 或 `noThreads: ...` 行之后),保证 patch 上下文可匹配。以 zh patch 为例,追加内容:
```
+    threadsAllThreads: '全部话题',
+    threadsAllThreadsDescription: '显示本房间的所有话题',
+    threadsMyThreads: '我的话题',
+    threadsMyThreadsDescription: '显示我参与的所有话题',
+    threadsEmptyTitle: '暂无话题',
+    threadsEmptyDescription: '点击消息上的「在话题中回复」即可创建话题',
+    threadsCountOfReply: '{count} 条回复',
+    threadsShowFilter: '显示:',
```
en patch 对应英文。其余 8 语言(de/es/fr/ja/ko/pt/ru/zh-TW)同语义补全。

补完后 re-apply patch 验证:
```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run clean && npm run inject
```
Expected: inject 成功,无 patch 冲突。

- [ ] **Step 6: 手动验收(对照 spec §10 验收标准)**

启动 dev server(或按 RELEASE-NOTES.md 构建):
- [ ] 点 RoomHeader threads 按钮 → 右侧 ThreadPanel,**列表为 EventTile + ThreadSummary 卡片**
- [ ] 点 ThreadSummary → 进入 ThreadView,**复用主时间线**(头像、reactions、action bar 可用)
- [ ] ThreadView composer 发消息 → 带 `m.thread` relation,出现在 thread 时间线
- [ ] 主聊天界面消息下方话题入口为 ThreadSummary 卡片(非"N 条回复"文字)
- [ ] 过滤 dropdown All/My 切换正常
- [ ] MarkAllRead / 切房 / 关闭 / 回退正常
- [ ] 主聊天界面、RoomSummary、MemberList 零回归

- [ ] **Step 7: 提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add -A custom/client/matrix-chat/components/MatrixThreadInfo.vue \
        custom/client/matrix-chat/stores/matrix-thread.ts \
        patches/0*-i18n-locale-*.patch
git commit -m "chore(matrix): remove MatrixThreadInfo; clean thread store back-compat; add i18n keys"
```

> 注:`git add` 已删文件用 `git rm` 或 `git add -A` 均可。

---

## 完成标志

全部 10 个 task 完成后:
- 所有 vitest 测试通过(`cd overlay && npm run test`)
- spec §10 验收标准逐条手动确认
- 主聊天界面零回归
- element-web ThreadPanel/ThreadView/ThreadSummary 视觉与交互对齐
