# Threads(话题)功能迁移设计:对齐 element-web

> 日期: 2026-06-22
> 状态: **设计中**(待评审)
> 关联: `upstream/element-web` 的 `ThreadPanel.tsx` / `ThreadView.tsx` / `ThreadSummaryView.tsx` / `EventTileThreadInfo.tsx`;overlay 现有 `custom/client/matrix-chat/components/MatrixThreadPanel.vue` 等组件
> 上游基线: element-web `origin/main`(本地 `upstream/element-web`)

## 1. 背景与目标

### 1.1 现状

overlay 的 Matrix 聊天主界面已有 Threads(话题)功能,但实现与 `upstream/element-web` 的参考实现存在系统性偏离:

- **列表视图**是 overlay 手写的简化 `thread-list-item`(sender + 时间 + 2 行正文 + 文字回复数),而非上游的 **EventTile + ThreadSummary 卡片**(ThreadsIcon + 回复数 + 最后回复头像 + 预览内容 + chevron 悬停动画 + 通知圆点)。
- **详情视图**是 overlay 手写的 `thread-root` + `thread-replies` 纯文本列表,而非上游的 **复用 TimelinePanel**(thread.timelineSet 驱动),因此缺少富文本、编辑、回复、文件上传、reactions、action bar。
- **容器与路由**用 `threadStore.threadRootEventId` 的 `null | '__list__' | <eventId>` 三态魔法值驱动,`MatrixChatPanel.vue` 用 `v-if/v-else-if` 把 thread panel 与 right panel 硬互斥;而非上游的 **RightPanelStore phase 模型**(`ThreadPanel` / `ThreadView` / `RoomSummary` 等枚举 phase)。
- **过滤**是前端遍历判断 sender,而非上游的 **SDK timelineSet 切换**(`room.threadsTimelineSets[0]` = All,`[1]` = My)。
- **composer** 是手写 `<textarea>` + 发送按钮,而非复用上游 `MessageComposer`(compact 模式,带 reply/edit/upload/emoji)。
- **时间线内话题入口**(`MatrixEventTileFooter` 里的 `MatrixThreadInfo`)是简单文字"N 条回复",而非上游的 **ThreadSummary 卡片**。

### 1.2 目标

按用户确认的 **C 档:全面对齐(含路由模型重构)**,把 Threads 功能迁移到与 element-web 一致的形态:

1. **路由模型重构**:把 thread 的 view state 从 `matrix-thread` store 迁移到 `matrix-right-panel` store 的 phase 模型,消除三态魔法值。
2. **列表视图对齐**:列表 = 复用 `MatrixTimelinePanel` 渲染 `threadsTimelineSets`,每个 thread 根消息渲染为 EventTile + 新增 `MatrixThreadSummary` 卡片。
3. **详情视图对齐**:`ThreadView` 复用 `MatrixTimelinePanel` 渲染 `thread.timelineSet`,获得完整能力。
4. **时间线内入口对齐**:`MatrixEventTileFooter` 的 `MatrixThreadInfo` 替换为 `MatrixThreadSummary`。
5. **零回归**:主聊天界面(`<MatrixTimelinePanel>` 不传参)行为零变化;RoomSummary/MemberList/MemberInfo phase 不受影响。

### 1.3 非目标

- 不实现 element-web 的 **Threads Activity Centre**(全局未读话题中心,spaces 层级功能)——这是独立子系统,本期不做。
- 不实现 **ThreadListContextMenu** 的全部上下文菜单项(Copy link / View source / Unpin thread 等),首期只做 back 按钮 + "Thread" 标题,菜单项留作后续。
- 不引入 element-web 的 **dispatcher/action** 机制(overlay 用 Pinia store 直接调用,不引入 flux dispatcher)。
- 不实现 **文件上传到 thread**(UploadBar / FileDropTarget),首期 thread composer 只支持文本 + 回复 + 编辑。
- 不改变 **MatrixMessageInput** 的现有 UX(emoji picker、autocomplete 等),仅在 `compact` 模式下复用。

## 2. 决策记录

| 决策 | 选择 | 备选 |
|------|------|------|
| 迁移范围 | C 档:全面对齐(含路由模型重构) | A 档(仅列表);B 档(列表+详情,不含路由) |
| 详情/列表时间线渲染 | **复用 MatrixTimelinePanel**(参数化传入 timelineSet) | 新建轻量 thread-timeline 渲染器 |
| 列表项形态 | **EventTile + ThreadSummary**(忠实上游) | 卡片式(视觉对齐,结构不动) |
| Thread view state 归属 | **right-panel store**(phase 模型) | 保留在 thread store(三态魔法值) |
| ThreadSummary 卡片 | **新建 MatrixThreadSummary.vue**,移植 `ThreadSummaryView.tsx` + `ThreadSummary.module.css` | 用 CSS 改造现有 MatrixThreadInfo |
| Timeline 参数化方式 | **可选 props,不传 = 现状**(向后兼容) | 强制传参,改造所有调用点 |
| Composer 复用 | **复用 MatrixMessageInput**,加 `compact` + `relation` props | 为 thread 单独写 composer |
| CPD token 映射 | 映射到现有 `$`-token 体系(`$text-secondary`、`$border-color` 等) | 引入完整 CPD token 层 |

## 3. 架构设计

### 3.1 路由模型重构(§1)

**`matrix-right-panel.ts` 扩展**:

```ts
export type RightPanelPhase =
  | 'RoomSummary' | 'MemberList' | 'MemberInfo'
  | 'ThreadPanel'      // 列表(对应上游 RightPanelPhases.ThreadPanel)
  | 'ThreadView'       // 单个 thread 详情(对应上游 RightPanelPhases.ThreadView)
  | null

export type ThreadFilterType = 'all' | 'my'

// 新增 state
const rightPanelThreadRootId = ref<string | null>(null)    // 仅 ThreadView phase 有值
const rightPanelThreadFilter = ref<ThreadFilterType>('all')

// 新增 action
function openThreadPanel(): void        // phase = 'ThreadPanel', rootId = null
function openThreadView(rootEventId: string): void  // phase = 'ThreadView', rootId = eventId
function setThreadFilter(filter: ThreadFilterType): void
function clearThreadView(): void        // 决策规则:当前 phase==='ThreadView' → 回 'ThreadPanel';否则 closeRightPanel()
```

`rightPanelPhaseHistory`(已有)继续维护,`rightPanelBack()` 已支持回退。`closeRightPanel()` 同时清 `rightPanelThreadRootId`。

**`matrix-thread.ts` 瘦身**:

删除(迁移到 right-panel store):
- `threadRootEventId`、`threadMessages`、`threadsLoading` ref
- `setThreadView`、`clearThreadView`、`openThreadPanel`、`toggleThreadPanel`、`refreshThreadMessages`

保留为**纯 helper**(无 view state):
- `sendThreadMessage(text, rootId, lastReplyId?)` —— 已正确实现 thread relation
- `getThreadForEvent(event)`、`getThreadReplyCount(event)`、`getThreadLastReply(event)`、`getRoomThreads()`
- 新增 `getThreadNotificationIndicator(thread): 'none' | 'unread' | 'highlight'` —— 镜像 `determineUnreadState` + `notificationLevelToIndicator`
- `initRoomThreads()` —— 从 thread store 搬到 room store(见 §3.4),thread store 不再持有

**`MatrixChatPanel.vue` 改造**:

`chat-content-wrapper` 由:
```vue
<MatrixThreadPanel v-if="threadStore.threadRootEventId" />
<MatrixRightPanel v-else-if="rightPanelStore.rightPanelPhase" />
```
改为**单一** `<MatrixRightPanel />`,内部按 phase 分发。

**`MatrixRightPanel.vue` 改造**:

content 区按 phase 分发(扩展现有 switch):
```vue
<MatrixRoomSummaryCard v-if="phase === 'RoomSummary'" />
<MatrixMemberList v-else-if="phase === 'MemberList'" />
<MatrixMemberInfo v-else-if="phase === 'MemberInfo'" />
<MatrixThreadPanel v-else-if="phase === 'ThreadPanel'" />
<MatrixThreadView v-else-if="phase === 'ThreadView'" />
```

header 的 panelTitle 与 canGoBack 逻辑扩展,覆盖 ThreadPanel/ThreadView 的标题与回退。

**入口收口**:所有打开 thread 的动作统一调 right-panel store:
- EventTile ThreadSummary 点击 → `rightPanelStore.openThreadView(eventId)`
- RoomHeader 的 threads 按钮 → `rightPanelStore.openThreadPanel()`
- RoomSummaryCard 的 "Threads" 按钮 → `rightPanelStore.openThreadPanel()`

**`matrixEventBus.onSelectRoom`**:改为调 `rightPanelStore.closeRightPanel()`(切房清 thread view)。

### 3.2 列表视图:EventTile + ThreadSummary(§2)

**`MatrixThreadPanel.vue`(列表模式)重构**:

不再手写 `thread-list-item`,改为渲染 `<MatrixTimelinePanel>`:

```vue
<MatrixTimelinePanel
  v-if="timelineSet"
  :timeline-set="timelineSet"
  rendering-type="threads-list"
  :show-read-receipts="false"
  :show-reactions="false"
  :hide-threaded-messages="false"
  :always-show-timestamps="true"
  :disable-grouping="true"
  :empty-state="emptyState"
/>
<div v-else class="mx_ThreadPanel_spinner"><MatrixSpinner /></div>
```

其中 `timelineSet = computed(() => roomStore.getThreadsTimelineSet(rightPanelStore.rightPanelThreadFilter))`。

**header 改造**(移植 `ThreadPanelHeader`):
- MarkAllRead 图标按钮(`MarkAllThreadsReadIcon`)→ 调 `clearRoomNotification`(发 unthreaded read receipt)
- vertical separator
- 下拉过滤 dropdown:`ContextMenuButton`(显示当前过滤项 + chevron)+ `ContextMenu`(两个 `MenuItemRadio`:All / My,带 description)

**空态**(移植 `EmptyState`):ThreadsIcon + 标题 + 描述,居中 Flex column。仅在 `hasThreads = false` 时由 `MatrixTimelinePanel` 的 `empty-state` prop 渲染。

**loading**:用现有 `MatrixSpinner`(若无则新建极简 spinner 组件,或复用 `MatrixThreadPanel` 已有的 `.thread-spinner`)。

### 3.3 新增 MatrixThreadSummary.vue(§2 + §4)

移植 `packages/shared-components/.../ThreadSummary/ThreadSummaryView.tsx` + `ThreadSummary.module.css`。

**Props**:
```ts
interface Props {
  thread: Thread              // SDK Thread 对象
  mxEvent: MatrixEvent        // thread 根事件
  narrow?: boolean            // 窄布局(默认 false)
}
const emit = defineEmits<{ openThread: [rootEventId: string] }>()
```

**模板结构**(忠实上游):
```vue
<button class="mx_ThreadSummary" :class="{ narrow }" @click="handleClick">
  <span class="mx_ThreadSummary_threadIcon">
    <IndicatorIcon :indicator="notificationIndicator">
      <ThreadsSolidIcon />
    </IndicatorIcon>
  </span>
  <span class="mx_ThreadSummary_repliesAmount">{{ replyCountLabel }}</span>
  <MatrixThreadMessagePreview :thread="thread" />
  <div class="mx_ThreadSummary_chevron"><ChevronRightIcon /></div>
</button>
```

**computed**:
- `replyCountLabel = thread.length > 0 ? (narrow ? String(thread.length) : t('matrixChat.threadsCountOfReply', { count: thread.length })) : ''`
- `notificationIndicator = threadStore.getThreadNotificationIndicator(thread)` → `'none' | 'unread' | 'highlight'`
- 最后回复预览:从 `thread.replyToEvent` 取 sender 头像 + body 预览(`stripPlainReply` + 截断)

**子组件 `MatrixThreadMessagePreview.vue`**(独立组件,见 §4.1):最后回复头像 + sender 名(narrow 时隐藏)+ 预览内容。独立成组件便于复用与单测。

**样式**(scoped scss,移植 `ThreadSummary.module.css`):
- `.mx_ThreadSummary`:横向 button、`background: $bg-secondary`、圆角 8px、hover border 高亮、min-width 267px / max-width 600px
- `.chevron`:绝对定位右侧、`opacity:0` → hover `opacity:1` + `translateX(0)` 渐入动画(transition 0.1s)
- `.repliesAmount`:粗体、右 padding
- token 映射:`--cpd-color-text-secondary` → `$text-secondary`;`--cpd-color-bg-subtle-secondary` → `$bg-secondary`;`--cpd-color-border-interactive-secondary` → `$accent-primary`

**IndicatorIcon**(通知圆点):简化实现——一个绝对定位的小圆点(`.indicator--unread` 黄色 / `.indicator--highlight` 红色),叠在 ThreadsSolidIcon 右上角。无需引入 compound-web。

**ThreadsSolidIcon / ChevronRightIcon**:内联 SVG(沿用 overlay 现有内联 SVG 风格,见 `MatrixThreadInfo.vue` 现状的 SVG 写法)。

### 3.4 详情视图:复用 MatrixTimelinePanel(§3)

**新增 `MatrixThreadView.vue`**(镜像 `ThreadView.tsx`):

```vue
<template>
  <div class="mx_ThreadView">
    <!-- header -->
    <div class="mx_ThreadView_header">
      <button class="mx_ThreadView_back" @click="rightPanelStore.clearThreadView()">
        <BackIcon /> {{ t('matrixChat.backToThreads') }}
      </button>
      <h4 class="mx_ThreadView_title">{{ t('matrixChat.thread') }}</h4>
      <!-- ThreadListContextMenu 占位,首期不实现 -->
    </div>

    <!-- timeline -->
    <div class="mx_ThreadView_timelineWrapper">
      <MatrixSpinner v-if="!thread" />
      <MatrixTimelinePanel
        v-else
        :timeline-set="thread.timelineSet"
        rendering-type="thread"
        :thread-id="threadId"
        :show-read-receipts="true"
        :show-reactions="true"
      />
    </div>

    <!-- composer -->
    <MatrixMessageInput
      v-if="thread?.timelineSet"
      compact
      :thread-relation="threadRelation"
    />
  </div>
</template>
```

**computed**:
- `threadId = rightPanelStore.rightPanelThreadRootId`
- `thread = computed(() => threadStore.getThreadForEventById(threadId))`(新增 helper,或在 room store 加 `getThreadById`)
- `threadRelation = { rel_type: RelationType.Thread, event_id: threadId, is_falling_back: true, 'm.in_reply_to': { event_id: lastReplyId ?? threadId } }`(镜像上游 `threadRelation` getter)

**loading**:首次进入 ThreadView 时,若 `room.getThread(threadId)` 还不存在,调 `room.createThread(threadId, mxEvent, [], true)`(镜像上游 `setupThread`)。

### 3.5 MatrixTimelinePanel 参数化(§3 关键改造)

**新增 props**(全部可选,不传 = 现状):
```ts
interface Props {
  timelineSet?: EventTimelineSet
  renderingType?: 'room' | 'thread' | 'threads-list'
  threadId?: string
  showReadReceipts?: boolean      // 默认 true
  showReactions?: boolean         // 默认 true
  hideThreadedMessages?: boolean  // 默认 false
  alwaysShowTimestamps?: boolean  // 默认 false
  disableGrouping?: boolean       // 默认 false
  emptyState?: { icon: ComponentType; title: string; description: string }
}
```

**派生逻辑**:
- `messages` computed:`timelineSet` 传入时,从该 timelineSet 的 liveTimeline 取 events;否则用 `roomStore.activeRoomMessages`(现状)
- `paginateMessages()`:`timelineSet` 传入时,对该 timelineSet 调 `timelineSet.getLiveTimeline().paginate(...)`;否则用 `roomStore.paginateMessages()`
- `readMarker`:`timelineSet` 传入时不显示(列表/详情都不需要 read marker);否则用 `roomStore.readMarkerEventId`

**`MatrixMessageItem` 透传**:
- 新增 prop `renderingType`、`threadId`、`showReactions`、`alwaysShowTimestamps` 透传给 `MatrixMessageItem`
- `MatrixMessageItem` 根据 `renderingType` 调整 footer:`threads-list` 时显示 `MatrixThreadSummary`(替代 `MatrixThreadInfo`)、隐藏 reactions/RR;`thread` 时正常显示 reactions

**groupedItems**:`disableGrouping=true` 时跳过 sender 续接合并,每条消息独立(对齐上游 thread 列表样式)。

### 3.6 数据层调整(§4)

**`matrix-room.ts` 新增**:
```ts
async function initRoomThreads(): Promise<void> {
  if (!activeRoom.value) return
  await activeRoom.value.createThreadsTimelineSets()
  await activeRoom.value.fetchRoomThreads()
}

function getThreadsTimelineSet(filter: 'all' | 'my'): EventTimelineSet | undefined {
  if (!activeRoom.value) return undefined
  const sets = activeRoom.value.threadsTimelineSets
  return filter === 'my' ? sets?.[1] : sets?.[0]
}

function getThreadById(threadId: string): Thread | null {
  if (!activeRoom.value) return null
  return activeRoom.value.getThread(threadId) ?? null
}
```

`matrixEventBus.onThreadUpdate` 改为触发 room store 的 thread 相关 computed 重算(timelineSet 是 SDK 对象,Vue 的响应式会自动追踪其内部事件数组变化——需验证,可能需要手动 trigger)。

**`matrix-thread.ts` 瘦身后**:
- 删除 view state(见 §3.1)
- 保留:`sendThreadMessage`、`getThreadForEvent`、`getThreadReplyCount`、`getThreadLastReply`、`getRoomThreads`
- 新增:`getThreadNotificationIndicator(thread)` —— 读 `room.threadsAggregateNotificationType` + 单 thread 的 `NotificationCountType`

**`matrix-composer.ts`**:`composerMode='thread'` 已支持,无需改动;`MatrixMessageInput` 新增 `compact` + `threadRelation` props(见 §3.7)。

### 3.7 MatrixMessageInput 扩展(§3)

新增 props:
```ts
interface Props {
  compact?: boolean                // 默认 false;true 时减小 padding/字号(thread composer 用)
  threadRelation?: IEventRelation  // 传入时,send 走 thread relation
}
```

`handleSend()` 逻辑:
- `threadRelation` 传入 + `composerMode === 'normal'` → 调 `threadStore.sendThreadMessage(text, threadRelation.event_id, lastReplyId)`
- 其他模式(reply/edit)保持现状

`compact` 模式样式:padding 减小、textarea 高度更紧凑(对齐上游 `MessageComposer compact={true}`)。

### 3.8 时间线内入口对齐(§4)

**`MatrixEventTileFooter.vue` 改造**:

把 `<MatrixThreadInfo>` 替换为 `<MatrixThreadSummary>`,Props 从 `threadReplyCount` / `threadLastReplySender` / `threadLastReplyContent` 改为 `:thread="thread" :mx-event="event"`,emit `openThread` 时调 `rightPanelStore.openThreadView(event.getId())`。

**`MatrixMessageItem.vue`** 的 `hasThread` computed 保留(判断是否有 thread),`renderingType='room'` 时 footer 渲染 `MatrixThreadSummary`。

**删除 `MatrixThreadInfo.vue`**(被 `MatrixThreadSummary` 取代)。

## 4. 文件清单

### 4.1 新增

| 文件 | 用途 |
|------|------|
| `custom/client/matrix-chat/components/MatrixThreadSummary.vue` | ThreadSummary 卡片(移植 ThreadSummaryView) |
| `custom/client/matrix-chat/components/MatrixThreadView.vue` | 单 thread 详情视图(复用 MatrixTimelinePanel) |
| `custom/client/matrix-chat/components/MatrixThreadMessagePreview.vue` | ThreadSummary 内的最后回复预览(可选,可内联) |
| `custom/client/matrix-chat/components/MatrixSpinner.vue` | 统一 loading spinner(若无现有组件) |
| `custom/client/matrix-chat/components/MatrixContextMenu.vue` | 轻量上下文菜单(移植 ContextMenu,供过滤 dropdown 用;若已有则复用) |

### 4.2 修改

| 文件 | 改动 |
|------|------|
| `stores/matrix-right-panel.ts` | 扩展 phase 联合类型 + thread view state + actions |
| `stores/matrix-thread.ts` | 瘦身:删 view state,保留纯 helper + 新增 notification helper |
| `stores/matrix-room.ts` | 新增 `initRoomThreads` / `getThreadsTimelineSet` / `getThreadById` |
| `components/MatrixTimelinePanel.vue` | 参数化:新增 timelineSet/renderingType 等 props |
| `components/MatrixMessageItem.vue` | 新增 renderingType prop,threads-list 模式渲染 ThreadSummary |
| `components/MatrixMessageInput.vue` | 新增 compact + threadRelation props |
| `components/MatrixThreadPanel.vue` | 重构为列表 = MatrixTimelinePanel + dropdown header |
| `components/MatrixEventTileFooter.vue` | MatrixThreadInfo → MatrixThreadSummary |
| `components/MatrixRightPanel.vue` | phase 分发新增 ThreadPanel/ThreadView |
| `components/MatrixChatPanel.vue` | 移除 thread panel v-if,统一 MatrixRightPanel |
| `components/MatrixRoomHeader.vue` | threads 按钮调 openThreadPanel;isThreadPanelOpen 读 right-panel store |
| `components/MatrixRoomSummaryCard.vue` | "Threads" 按钮调 openThreadPanel |
| `styles/matrix-chat.scss` | 新增 ThreadView/ThreadPanel header/ContextMenu 样式 |

### 4.3 删除

| 文件 | 原因 |
|------|------|
| `components/MatrixThreadInfo.vue` | 被 MatrixThreadSummary 取代 |

### 4.4 i18n(patch)

补充 key(对齐上游 `_t("threads|...")` 语义),中英日等 10 语言同步:
- `matrixChat.threadsAllThreads` / `matrixChat.threadsAllThreadsDescription`
- `matrixChat.threadsMyThreads` / `matrixChat.threadsMyThreadsDescription`
- `matrixChat.threadsEmptyTitle` / `matrixChat.threadsEmptyDescription`(含 `replyInThread` 插值)
- `matrixChat.threadsCountOfReply`(单复数:`{count} 回复` / `{count} 回复`)
- `matrixChat.threadsShowFilter`("显示:")
- `matrixChat.markAllThreadsRead`(已有,保留)
- `matrixChat.openThread`(已有,保留)
- `matrixChat.thread`(已有,改语义为详情 header 标题"话题")

## 5. 数据流

### 5.1 打开 thread 列表

```
用户点 RoomHeader threads 按钮
  → rightPanelStore.openThreadPanel()
  → phase = 'ThreadPanel', rootId = null
  → MatrixRightPanel 渲染 <MatrixThreadPanel>
  → MatrixThreadPanel onMounted: roomStore.initRoomThreads()
  → threadsTimelineSets 就绪
  → <MatrixTimelinePanel :timeline-set="threadsTimelineSets[0]" rendering-type="threads-list">
  → 每个 thread 根 EventTile + footer 的 MatrixThreadSummary
```

### 5.2 进入单个 thread

```
用户点某个 ThreadSummary
  → emit openThread(rootEventId)
  → rightPanelStore.openThreadView(rootEventId)
  → phase = 'ThreadView', rootId = rootEventId
  → MatrixRightPanel 渲染 <MatrixThreadView>
  → thread = roomStore.getThreadById(rootEventId)(若不存在则 createThread)
  → <MatrixTimelinePanel :timeline-set="thread.timelineSet" rendering-type="thread">
  → <MatrixMessageInput compact :thread-relation="...">
```

### 5.3 在 thread 内发消息

```
用户在 thread composer 输入并回车
  → MatrixMessageInput.handleSend()
  → threadRelation 传入 → threadStore.sendThreadMessage(text, rootId, lastReplyId)
  → client.sendEvent(roomId, 'm.room.message', { body, msgtype, m.relates_to: { rel_type: Thread, event_id: rootId, is_falling_back: true, 'm.in_reply_to': { event_id: lastReplyId } } })
  → SDK RoomEvent.Timeline 触发 → matrixEventBus.onThreadUpdate
  → thread.timelineSet 自动更新 → MatrixTimelinePanel 的 messages computed 重算
```

### 5.4 切房清 thread view

```
用户切到另一个房间
  → roomStore.selectRoom() → matrixEventBus.onSelectRoom
  → rightPanelStore.closeRightPanel()
  → phase = null, rootId = null
```

## 6. 样式映射(CPD → overlay token)

| 上游 CPD token | overlay `$`-token | 说明 |
|----------------|-------------------|------|
| `--cpd-color-text-secondary` | `$text-secondary` | ThreadSummary 正文、sender |
| `--cpd-color-bg-subtle-secondary` | `$bg-secondary` | ThreadSummary 背景 |
| `--cpd-color-border-interactive-secondary` | `$accent-primary` | hover border |
| `--cpd-color-bg-canvas-default` | `$bg-card` | chevron 渐变背景 |
| `--cpd-color-gray-400` | `$border-color` | panel header 底边 |
| `--cpd-space-2x/3x/4x` | `$spacing-*` 或硬编码 8/12/16px | 间距 |
| `--cpd-font-body-sm-regular` | `font-size: 13px; font-weight: 400` | ThreadSummary 字体 |

## 7. 测试策略

项目用 vitest(见 `overlay/package.json` 的 `test` script)。

### 7.1 store 单测

- **matrix-right-panel**:
  - `openThreadView('evt1')` 后 `rightPanelPhase === 'ThreadView'` 且 `rightPanelThreadRootId === 'evt1'`
  - `clearThreadView()` 从 ThreadView 回到 ThreadPanel
  - `rightPanelBack()` 历史回退正确
- **matrix-thread**(瘦身后):
  - `getThreadNotificationIndicator(mockThread)` 对 highlight/total/none 返回 `'highlight'`/`'unread'`/`'none'`
  - `sendThreadMessage` 构造的 content 包含正确的 `m.relates_to`
- **matrix-room**:
  - `getThreadsTimelineSet('all')` 返回 `threadsTimelineSets[0]`,`'my'` 返回 `[1]`

### 7.2 组件测试

- **MatrixThreadSummary**:
  - 渲染回复数(`thread.length`)
  - 渲染最后回复头像 + 预览
  - 点击 emit `openThread` 带 rootEventId
  - notification indicator 在 highlight 时显示红点
- **MatrixTimelinePanel**(参数化):
  - 不传 timelineSet:`messages` 来自 `roomStore.activeRoomMessages`(现状,零回归)
  - 传 timelineSet:`messages` 来自该 timelineSet
- **MatrixMessageItem**:
  - `renderingType='threads-list'`:footer 渲染 ThreadSummary,隐藏 reactions
  - `renderingType='room'`(默认):行为不变

### 7.3 回归验证

- 主聊天界面:进入房间 → 看到现有时间线 + composer,行为与改造前一致
- RoomSummary / MemberList / MemberInfo:打开/关闭/回退正常
- 路由 `roomId` 变化:thread view 自动关闭

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| `MatrixTimelinePanel` 参数化引入主聊天界面回归 | props 全部可选 + 默认值 = 现状;新增单测覆盖"不传参"路径 |
| SDK `Thread` 对象事件数组变化不被 Vue 响应式追踪 | 在 `matrixEventBus.onThreadUpdate` 里手动触发 room store 的 ref 重算(如 `threadVersion.value++`,computed 依赖它) |
| `threadsTimelineSets` 首次为空(未调 `createThreadsTimelineSets`) | `MatrixThreadPanel` onMounted 调 `initRoomThreads()`,loading 态兜底 |
| ThreadSummary 的 `Thread.length` / `replyToEvent` 可能 undefined | computed 全部加 `?? 0` / `?? null` 防御 |
| i18n 10 语言同步遗漏 | 沿用现有 i18n patch 模式(每语言一个 patch 文件),CI/verify 脚本校验 key 完整性 |
| 删除 `MatrixThreadInfo` 破坏其他引用 | 已 grep 确认仅 `MatrixEventTileFooter.vue` 引用;改造时同步替换 |

## 9. 实施顺序(建议)

1. **路由模型重构**:right-panel store 扩展 + thread store 瘦身 + MatrixChatPanel/MatrixRightPanel 改造(此步完成后,旧 MatrixThreadPanel 暂时还能跑,因为 phase 分发兼容)
2. **MatrixTimelinePanel 参数化**:加可选 props + 单测验证零回归
3. **MatrixThreadSummary 新增**:移植 ThreadSummaryView + 样式
4. **MatrixThreadPanel 列表重构**:替换为 TimelinePanel + dropdown header
5. **MatrixThreadView 新增**:复用 TimelinePanel + composer
6. **MatrixMessageInput 扩展**:compact + threadRelation
7. **MatrixEventTileFooter 改造**:ThreadInfo → ThreadSummary
8. **删除 MatrixThreadInfo** + 清理引用
9. **i18n 补充**(10 语言 patch)
10. **样式微调 + 回归测试**

每步独立可验证,建议每步完成后 `npm run test` + 手动验证对应界面。

## 10. 验收标准

- [ ] 点 RoomHeader threads 按钮 → 右侧出现 ThreadPanel,**列表为 EventTile + ThreadSummary 卡片**(ThreadsIcon + 回复数 + 最后回复头像 + 预览 + chevron),视觉与 element-web 一致
- [ ] 点 ThreadSummary → 进入 ThreadView,**复用主时间线**(头像、富文本、reactions、action bar、编辑、回复均可用)
- [ ] ThreadView composer 用 MessageInput(compact),发送的消息带 `m.thread` relation,出现在 thread 时间线
- [ ] 主聊天界面消息下方的话题入口为 ThreadSummary 卡片(不再是"N 条回复"文字)
- [ ] 过滤 dropdown(All / My)切换后,列表对应切换 timelineSet
- [ ] MarkAllRead 按钮发送 unthreaded read receipt
- [ ] 切房、关闭 panel、回退按钮均正常
- [ ] 主聊天界面时间线、composer、RoomSummary、MemberList **零回归**
- [ ] `npm run test` 全部通过
- [ ] 10 语言 i18n key 完整
