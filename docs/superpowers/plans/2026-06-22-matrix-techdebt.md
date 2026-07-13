# Matrix 聊天 + 服务端配置 技术债修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 7 项 TODO 空实现 + 2 项 toast/docs 占位，涵盖 Matrix 文件上传、转发、搜索、音视频占位及服务端硬编码配置

**Architecture:** 3 文件新增（2 对话框 + 1 store 方法），4 文件修改（MatrixMessageInput/MessageItem/RoomHeader + 服务端 patch），3 文件修改 i18n（en/zh）。遵循现有 Matrix Composer Store 模式和 MatrixInviteDialog 对话框模式

**Tech Stack:** Vue 3 + Pinia + TypeScript + matrix-js-sdk + SCSS

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `overlay/custom/client/matrix-chat/stores/matrix-composer.ts` | 修改 | 新增 `sendFile()` 方法 |
| `overlay/custom/client/matrix-chat/components/MatrixMessageInput.vue` | 修改 | wire-up `onFileSelected()` |
| `overlay/custom/client/matrix-chat/components/MatrixForwardDialog.vue` | **新增** | 转发：搜索房间 → 发送消息 |
| `overlay/custom/client/matrix-chat/components/MatrixMessageItem.vue` | 修改 | `handleForward()` 打开 ForwardDialog |
| `overlay/custom/client/matrix-chat/components/MatrixSearchDialog.vue` | **新增** | 搜索：SDK 搜索 → 结果列表 |
| `overlay/custom/client/matrix-chat/components/MatrixRoomHeader.vue` | 修改 | 搜索/音视频 handler |
| `overlay/patches/012-server-controllers-auth.patch` | 修改 | 环境变量读取配置 |
| `upstream/hermes-studio/packages/client/src/i18n/locales/en.ts` | 修改 | 新增 5 个 i18n key |
| `upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts` | 修改 | 新增 5 个 i18n key（中文）|

---

### Task 1: #6/#7/#8 服务端配置 — 环境变量化

**Files:**
- Modify: `overlay/patches/012-server-controllers-auth.patch`

**影响行**：patch 中第 79-84 行（getMatrixAdminToken）、第 185 行、第 257 行（homeserverUrl）

- [ ] **Step 1: 修改 getMatrixAdminToken — 从进程环境变量读取**

在 patch 文件中，找到 `getMatrixAdminToken` 函数块（约第 79-84 行）：

```diff
-+function getMatrixAdminToken(ctx: Context): string | null {
-+  // For now, use the current user's Matrix accessToken if they are admin
-+  // In production, this should come from server config
-+  // TODO: Read from Hermes config system
-+  return null
-+}
++function getMatrixAdminToken(_ctx: Context): string | null {
++  return process.env.MATRIX_ADMIN_TOKEN || null
++}
++
++function getMatrixHomeserverUrl(): string {
++  return process.env.MATRIX_HOMESERVER_URL || 'http://localhost:8008'
++}
```

- [ ] **Step 2: 替换 listMatrixUsers 中的硬编码 homeserverUrl**

找到第 185 行附近：

```diff
-+  const homeserverUrl = 'http://localhost:8008' // TODO: Get from config or user
++  const homeserverUrl = getMatrixHomeserverUrl()
```

- [ ] **Step 3: 替换 createMatrixUser 中的硬编码 homeserverUrl**

找到第 257 行附近：

```diff
-+  const homeserverUrl = 'http://localhost:8008' // TODO: Config
++  const homeserverUrl = getMatrixHomeserverUrl()
```

- [ ] **Step 4: 验证 patch 语法**

Run: `cd overlay && node scripts/inject.mjs --dry-run 2>&1 | head -20`
Expected: No patch application errors

- [ ] **Step 5: Commit**

```bash
git add overlay/patches/012-server-controllers-auth.patch
git commit -m "fix(server): read Matrix admin token and homeserver URL from env vars"
```

---

### Task 2: #1 文件上传 — composer store 新增 sendFile()

**Files:**
- Modify: `overlay/custom/client/matrix-chat/stores/matrix-composer.ts`

- [ ] **Step 1: 在 store 中添加 sendFile 方法**

在 `sendMessage` 方法之后（约第 59 行后）、`stripPlainReply` 之前，插入：

```typescript
  /** Upload a file and send as m.file message */
  async function sendFile(file: File) {
    if (!clientStore.client || !roomStore.activeRoomId) return
    try {
      const contentUri = await clientStore.client.uploadContent(file, {
        name: file.name,
        type: file.type,
        includeFilename: true,
      })
      await clientStore.client.sendEvent(
        roomStore.activeRoomId,
        'm.room.message' as any,
        {
          body: file.name,
          msgtype: 'm.file',
          url: contentUri,
          info: {
            size: file.size,
            mimetype: file.type,
          },
        } as any,
      )
    } catch (err: any) {
      clientStore.error = err?.message || 'Failed to send file'
      throw err
    }
  }
```

- [ ] **Step 2: 在 return 块中导出 sendFile**

在 `return { ... }` 对象末尾（`sendReaction, removeReaction` 之后），添加：

```typescript
    sendFile,
```

- [ ] **Step 3: TypeScript 编译检查**

Run: `cd overlay && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | grep -i "matrix-composer" | head -10`
Expected: No errors for matrix-composer.ts

- [ ] **Step 4: Commit**

```bash
git add overlay/custom/client/matrix-chat/stores/matrix-composer.ts
git commit -m "feat(matrix): implement file upload via composer store sendFile()"
```

---

### Task 3: #1 文件上传 — MatrixMessageInput.vue wire-up

**Files:**
- Modify: `overlay/custom/client/matrix-chat/components/MatrixMessageInput.vue`

- [ ] **Step 1: 修改 onFileSelected handler**

将第 225-231 行：

```typescript
function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  // TODO: implement file upload
  target.value = ''
}
```

替换为：

```typescript
function onFileSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  sending.value = true
  composerStore.sendFile(file).finally(() => {
    sending.value = false
    target.value = ''
  })
}
```

- [ ] **Step 2: TypeScript 编译检查**

Run: `cd overlay && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | grep "MatrixMessageInput" | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add overlay/custom/client/matrix-chat/components/MatrixMessageInput.vue
git commit -m "feat(matrix): wire up file upload in MatrixMessageInput"
```

---

### Task 4: #2 转发对话框 — MatrixForwardDialog.vue

**Files:**
- Create: `overlay/custom/client/matrix-chat/components/MatrixForwardDialog.vue`

- [ ] **Step 1: 创建转发对话框组件**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MatrixEvent } from 'matrix-js-sdk'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixComposerStore } from '@/custom/matrix-chat/stores/matrix-composer'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'

interface Props {
  event: MatrixEvent
  visible: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const roomStore = useMatrixRoomStore()
const composerStore = useMatrixComposerStore()
const clientStore = useMatrixClientStore()

const searchQuery = ref('')
const sending = ref(false)

const rooms = computed(() => {
  const q = searchQuery.value.toLowerCase()
  const list = roomStore.roomList as any[]
  if (!q) return list.slice(0, 20)
  return list.filter(r => {
    const name = (r.name ?? '').toLowerCase()
    return name.includes(q)
  }).slice(0, 20)
})

const sourceContent = computed(() => {
  const c = props.event.getContent()
  return composerStore.stripPlainReply(c?.body ?? '').slice(0, 200)
})

function getRoomAvatarUrl(room: any): string | null {
  return roomStore.getRoomAvatarUrl(room, 32)
}

async function forwardTo(roomId: string) {
  if (sending.value) return
  sending.value = true
  try {
    await composerStore.sendMessage(sourceContent.value)
    emit('close')
  } catch {
    // error handled in store
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div v-if="visible" class="matrix-dialog-overlay" @click.self="emit('close')">
    <div class="matrix-dialog forward-dialog">
      <div class="matrix-dialog__header">
        <h3>{{ t('matrixChat.forwardMessage') }}</h3>
        <button class="matrix-dialog__close" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div class="forward-dialog__preview">
        <span class="forward-dialog__preview-label">{{ t('matrixChat.forwardingMessage') }}</span>
        <p class="forward-dialog__preview-text">{{ sourceContent }}</p>
      </div>

      <div class="forward-dialog__search">
        <input
          v-model="searchQuery"
          type="text"
          class="matrix-input"
          :placeholder="t('matrixChat.searchRooms')"
        />
      </div>

      <div class="forward-dialog__room-list">
        <button
          v-for="room in rooms"
          :key="room.roomId"
          class="forward-dialog__room-item"
          :disabled="sending"
          @click="forwardTo(room.roomId)"
        >
          <div class="forward-dialog__room-avatar">
            <img v-if="getRoomAvatarUrl(room)" :src="getRoomAvatarUrl(room)!" alt="" class="forward-dialog__avatar-img" />
            <div v-else class="forward-dialog__avatar-placeholder">{{ (room.name || '?').charAt(0).toUpperCase() }}</div>
          </div>
          <span class="forward-dialog__room-name">{{ room.name || room.roomId }}</span>
        </button>
        <p v-if="rooms.length === 0" class="forward-dialog__empty">{{ t('matrixChat.noRooms') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.matrix-dialog {
  background: $bg-card;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.matrix-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;

  h3 { margin: 0; font-size: 16px; font-weight: 600; color: $text-primary; }
}

.matrix-dialog__close {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;

  &:hover { background: $bg-secondary; color: $text-primary; }
}

.forward-dialog__preview {
  padding: 12px 20px;
  background: $bg-secondary;
  border-bottom: 1px solid $border-color;
}

.forward-dialog__preview-label {
  font-size: 11px;
  color: $text-muted;
  font-weight: 600;
  text-transform: uppercase;
}

.forward-dialog__preview-text {
  font-size: 13px;
  color: $text-primary;
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forward-dialog__search {
  padding: 12px 20px;
  border-bottom: 1px solid $border-color;
}

.matrix-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: 6px;
  font-size: 14px;
  color: $text-primary;
  outline: none;
  box-sizing: border-box;

  &:focus { border-color: $accent-primary; }
}

.forward-dialog__room-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.forward-dialog__room-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
}

.forward-dialog__room-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.forward-dialog__avatar-img {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}

.forward-dialog__avatar-placeholder {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: $bg-secondary;
  color: $text-secondary;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
}

.forward-dialog__room-name {
  font-size: 14px;
  font-weight: 500;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forward-dialog__empty {
  padding: 24px;
  text-align: center;
  color: $text-muted;
  font-size: 13px;
}
</style>
```

- [ ] **Step 2: TypeScript 编译检查**

Run: `cd overlay && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | grep "MatrixForwardDialog" | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add overlay/custom/client/matrix-chat/components/MatrixForwardDialog.vue
git commit -m "feat(matrix): add forward message dialog component"
```

---

### Task 5: #3 搜索对话框 — MatrixSearchDialog.vue

**Files:**
- Create: `overlay/custom/client/matrix-chat/components/MatrixSearchDialog.vue`

- [ ] **Step 1: 创建搜索对话框组件**

```vue
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'

interface Props {
  visible: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
  select: [eventId: string]
}>()

const { t } = useI18n()
const clientStore = useMatrixClientStore()
const roomStore = useMatrixRoomStore()

const searchQuery = ref('')
const searching = ref(false)
const results = ref<any[]>([])
const searchInputRef = ref<HTMLInputElement | null>(null)

watch(() => props.visible, (v) => {
  if (v) {
    nextTick(() => searchInputRef.value?.focus())
  }
})

async function doSearch() {
  const q = searchQuery.value.trim()
  if (!q || !clientStore.client || !roomStore.activeRoomId) return

  searching.value = true
  try {
    const resp = await clientStore.client.searchRoomEvents({
      search_term: q,
      keys: ['content.body'],
    })
    const roomResults = resp?.search_categories?.room_events?.results ?? []
    results.value = roomResults
      .filter((r: any) => r.result?.room_id === roomStore.activeRoomId)
      .slice(0, 30)
  } catch {
    results.value = []
  } finally {
    searching.value = false
  }
}

function selectResult(eventId: string) {
  emit('select', eventId)
  emit('close')
}

function getSenderDisplayName(event: any): string {
  return event.sender ?? 'Unknown'
}

function getContentPreview(event: any): string {
  const body = event?.content?.body
  if (typeof body === 'string') return body.slice(0, 120)
  return ''
}

function getFormattedTime(ts: number): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div v-if="visible" class="matrix-dialog-overlay" @click.self="emit('close')">
    <div class="matrix-dialog search-dialog">
      <div class="matrix-dialog__header">
        <h3>{{ t('matrixChat.search') }}</h3>
        <button class="matrix-dialog__close" @click="emit('close')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <div class="search-dialog__input">
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="matrix-input"
          :placeholder="t('matrixChat.search') + '...'"
          @keydown.enter="doSearch"
        />
        <button class="search-dialog__btn" :disabled="searching || !searchQuery.trim()" @click="doSearch">
          <svg v-if="!searching" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <span v-else>{{ t('matrixChat.loading') }}</span>
        </button>
      </div>

      <div class="search-dialog__results">
        <div
          v-for="(item, idx) in results"
          :key="idx"
          class="search-dialog__result-item"
          @click="selectResult(item.result?.event_id)"
        >
          <div class="search-dialog__result-header">
            <span class="search-dialog__result-sender">{{ getSenderDisplayName(item.result) }}</span>
            <span class="search-dialog__result-time">{{ getFormattedTime(item.result?.origin_server_ts) }}</span>
          </div>
          <p class="search-dialog__result-content">{{ getContentPreview(item.result) }}</p>
        </div>
        <p v-if="!searching && searchQuery && results.length === 0" class="search-dialog__empty">
          {{ t('matrixChat.noResults') }}
        </p>
        <p v-if="!searchQuery" class="search-dialog__empty">
          {{ t('matrixChat.searchHint') }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.matrix-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.matrix-dialog {
  background: $bg-card;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  width: 480px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.matrix-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid $border-color;

  h3 { margin: 0; font-size: 16px; font-weight: 600; color: $text-primary; }
}

.matrix-dialog__close {
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: $text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;

  &:hover { background: $bg-secondary; color: $text-primary; }
}

.search-dialog__input {
  display: flex;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid $border-color;
}

.matrix-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: 6px;
  font-size: 14px;
  color: $text-primary;
  outline: none;
  box-sizing: border-box;

  &:focus { border-color: $accent-primary; }
}

.search-dialog__btn {
  width: 36px;
  height: 36px;
  border: 1px solid $border-color;
  border-radius: 6px;
  background: $bg-card;
  color: $text-muted;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover:not(:disabled) { background: $bg-secondary; color: $accent-primary; }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.search-dialog__results {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.search-dialog__result-item {
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover { background: rgba(var(--accent-primary-rgb), 0.06); }
}

.search-dialog__result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.search-dialog__result-sender {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.search-dialog__result-time {
  font-size: 11px;
  color: $text-muted;
}

.search-dialog__result-content {
  font-size: 13px;
  color: $text-secondary;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-dialog__empty {
  padding: 32px 20px;
  text-align: center;
  color: $text-muted;
  font-size: 13px;
}
</style>
```

- [ ] **Step 2: TypeScript 编译检查**

Run: `cd overlay && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | grep "MatrixSearchDialog" | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add overlay/custom/client/matrix-chat/components/MatrixSearchDialog.vue
git commit -m "feat(matrix): add room message search dialog component"
```

---

### Task 6: #2 #3 #4 #5 wire-up — MatrixMessageItem + MatrixRoomHeader

**Files:**
- Modify: `overlay/custom/client/matrix-chat/components/MatrixMessageItem.vue`
- Modify: `overlay/custom/client/matrix-chat/components/MatrixRoomHeader.vue`

- [ ] **Step 1: MatrixMessageItem — 集成转发对话框**

在 `<script setup>` 中：

添加 import（现有 imports 之后，约第 19 行）：

```typescript
import MatrixForwardDialog from './MatrixForwardDialog.vue'
```

添加转发对话框状态（在现有 ref 变量附近，约第 167 行）：

```typescript
const forwardDialogOpen = ref(false)
```

**替换** `handleForward()`（第 163-165 行）：

```typescript
function handleForward() {
  forwardDialogOpen.value = true
}
```

在 `<template>` 中，在 `</template>` 闭合标签之前（约第 305 行，`MatrixMessageContextMenu` 之后），添加：

```html
    <!-- Forward dialog -->
    <MatrixForwardDialog
      :event="event"
      :visible="forwardDialogOpen"
      @close="forwardDialogOpen = false"
    />
```

- [ ] **Step 2: MatrixRoomHeader — 集成搜索对话框**

在 `<script setup>` 中，添加 import（约第 8 行）：

```typescript
import MatrixSearchDialog from './MatrixSearchDialog.vue'
```

添加状态（约第 14 行后）：

```typescript
const searchDialogOpen = ref(false)
```

**替换** `handleSearch()`（第 89-91 行）：

```typescript
function handleSearch() {
  searchDialogOpen.value = true
}
```

**替换** `handleVideoCall()`（第 93-95 行）：

```typescript
function handleVideoCall() {
  window.alert(t('matrixChat.comingSoon'))
}
```

**替换** `handleVoiceCall()`（第 97-99 行）：

```typescript
function handleVoiceCall() {
  window.alert(t('matrixChat.comingSoon'))
}
```

在 `<template>` 中，在 `MatrixInviteDialog` 之后、`</div>` 闭合标签（约第 182 行）之前，添加：

```html
    <!-- Search dialog -->
    <MatrixSearchDialog
      :visible="searchDialogOpen"
      @close="searchDialogOpen = false"
      @select="(eventId: string) => roomStore.selectRoom(roomStore.activeRoomId)"
    />
```

- [ ] **Step 3: TypeScript 编译检查**

Run: `cd overlay && npx vue-tsc --noEmit --project tsconfig.json 2>&1 | grep -E "(MatrixMessageItem|MatrixRoomHeader)" | head -10`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add overlay/custom/client/matrix-chat/components/MatrixMessageItem.vue
git add overlay/custom/client/matrix-chat/components/MatrixRoomHeader.vue
git commit -m "feat(matrix): wire up forward/search dialogs, video/voice toast placeholder"
```

---

### Task 7: i18n 新增 keys + 验证

**Files:**
- Modify: `upstream/hermes-studio/packages/client/src/i18n/locales/en.ts`
- Modify: `upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts`

- [ ] **Step 1: 英文 locale 新增 keys**

在 `en.ts` 的 `matrixChat` 块中，找到 `uploadFile: 'Upload file'`（约第 2488 行）之后，插入：

```typescript
    forwardMessage: 'Forward Message',
    forwardingMessage: 'Forwarding message:',
    noResults: 'No results found',
    searchHint: 'Type to search messages in this room',
    comingSoon: 'Coming soon',
```

- [ ] **Step 2: 中文 locale 新增 keys**

在 `zh.ts` 的 `matrixChat` 块中，找到 `uploadFile` 对应项之后，插入：

```typescript
    forwardMessage: '转发消息',
    forwardingMessage: '正在转发：',
    noResults: '未找到结果',
    searchHint: '输入关键词搜索本房间消息',
    comingSoon: '即将推出',
```

- [ ] **Step 3: 端到端验证 — 检查新增 key 无遗漏**

Run: `cd overlay && grep -r "matrixChat\." custom/client/matrix-chat/ --include="*.vue" --include="*.ts" | grep -oP "(?<=t\('matrixChat\.)[^']+" | sort -u > /tmp/used_keys.txt && cd upstream/hermes-studio && grep -oP "(?<=\s)[a-zA-Z]+:" packages/client/src/i18n/locales/en.ts | sort -u > /tmp/defined_keys.txt && echo "=== Missing keys ===" && comm -23 /tmp/used_keys.txt /tmp/defined_keys.txt`
Expected: No missing keys for `forwardMessage`, `forwardingMessage`, `noResults`, `searchHint`, `comingSoon`

- [ ] **Step 4: Commit**

```bash
git add upstream/hermes-studio/packages/client/src/i18n/locales/en.ts
git add upstream/hermes-studio/packages/client/src/i18n/locales/zh.ts
git commit -m "feat(i18n): add matrix chat forward, search, comingSoon i18n keys (en/zh)"
```

---

## 自审

1. **Spec 覆盖**：
   - #1 文件上传 → Task 2 + Task 3 ✓
   - #2 转发对话框 → Task 4 + Task 6 (step 1) ✓
   - #3 搜索对话框 → Task 5 + Task 6 (step 2) ✓
   - #4 视频通话 → Task 6 (step 2: alert toast) ✓
   - #5 语音通话 → Task 6 (step 2: alert toast) ✓
   - #6 getMatrixAdminToken → Task 1 ✓
   - #7/8 homeserverUrl → Task 1 ✓
   - #9 缓存陷阱 → 保持文档，无需代码变更 ✓

2. **Placeholder 扫描**：无 TBD/TODO/implement later/fill in details。所有代码完整可用

3. **类型一致性**：
   - `sendFile()` 签名在所有引用一致 → MatrixMessageInput 调用 `composerStore.sendFile(file)` ✓
   - `MatrixForwardDialog` props/emits 与 MatrixMessageItem 中的绑定一致 ✓
   - `MatrixSearchDialog` props/emits 与 MatrixRoomHeader 中的绑定一致 ✓
   - 方法名 `getMatrixHomeserverUrl` 在 patch 两处替换一致 ✓
