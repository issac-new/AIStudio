# 网关告警可关闭横幅 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在已有的网关告警紧凑渲染基础上，升级为可关闭横幅——粘性定位在消息列表顶部，点击 × 关闭后持久化到 localStorage（per-session），运行聊天与群组聊天同时生效。

**Architecture:** 抽纯逻辑 composable `useGatewayNoticeBanner(sessionId, messagesRef)` 管理横幅状态（读 localStorage、找 gateway 消息、暴露 dismiss）。UI 组件 `GatewayNoticeBanner.vue` 接收 `sessionId` 和 `messages` props，内部调 composable 并渲染琥珀色横幅。通过 patch 097/098 在 `MessageList.vue` 和 `GroupMessageList.vue` 的 `displayMessages` 里筛掉 gateway 消息，并在模板顶部插入横幅组件。

**Tech Stack:** Vue 3 Composition API, Pinia (`useChatStore` / `useGroupChatStore`), Vitest + jsdom + `@vue/test-utils`, overlay patch 注入机制。

**设计依据**：`docs/superpowers/specs/2026-06-24-gateway-notice-banner-design.md`

**依赖**：094/095/096 patch 已注入（store 打标 + 紧凑渲染）。

---

## 关键背景（实施者必读）

1. **只能改 `overlay/`**：`upstream/` 只读。所有 upstream 改动通过 `overlay/patches/NNN-*.patch`（`git apply` 格式）实现，由 `npm run inject` 注入。
2. **测试只跑 `custom/` 下的**：`overlay/vitest.config.ts` 配置 `include: ['custom/**/*.test.ts']`。composable 和组件测试放在 `overlay/custom/client/chat/__tests__/`。
3. **alias**：`@/custom/...` → `overlay/custom/client/...`；`@` → `upstream/hermes-studio/packages/client/src`。
4. **patch 序号**：当前最大 100。新 patch 为 101/102。
5. **已有基础**：
   - `chatStore` 的 `systemType` 联合已含 `'gateway'`（094 patch）
   - `MessageItem.vue` 和 `GroupMessageItem.vue` 已会紧凑渲染 gateway 消息（095/096 patch）
   - `chatStore.activeSessionId` — run chat 当前会话 ID
   - `groupChatStore.currentRoomId` — group chat 当前房间 ID

## 文件结构

| 文件 | 职责 | 类型 |
|------|------|------|
| `overlay/custom/client/chat/useGatewayNoticeBanner.ts` | 纯逻辑 composable：读 localStorage、找 gateway 消息、暴露 `{showBanner, noticeMessage, dismiss}` | 新建 |
| `overlay/custom/client/chat/__tests__/useGatewayNoticeBanner.test.ts` | composable 单测（localStorage、消息查找、dismiss） | 新建 |
| `overlay/custom/client/chat/components/GatewayNoticeBanner.vue` | 横幅 UI 组件 | 新建 |
| `overlay/patches/101-messagelist-gateway-banner.patch` | 改 `MessageList.vue`：筛 gateway 消息 + 插入横幅 | 新建 |
| `overlay/patches/102-groupmessagelist-gateway-banner.patch` | 改 `GroupMessageList.vue`：筛 gateway 消息 + 插入横幅 | 新建 |
| `overlay/patches/series` | 追加 101, 102 | 修改 |

---

### Task 0: 建立 feature 分支

- [ ] **Step 1: 基于 main 建 feature 分支**

```bash
cd overlay
git checkout main
git pull origin main 2>/dev/null || true
git checkout -b feat/gateway-notice-banner
```

---

### Task 1: Composable `useGatewayNoticeBanner`（TDD）

**Files:**
- Create: `overlay/custom/client/chat/useGatewayNoticeBanner.ts`
- Create: `overlay/custom/client/chat/__tests__/useGatewayNoticeBanner.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `overlay/custom/client/chat/__tests__/useGatewayNoticeBanner.test.ts`：

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useGatewayNoticeBanner } from '@/custom/chat/useGatewayNoticeBanner'

const STORAGE_KEY = (id: string) => `gateway-notice-dismissed:${id}`

const makeMessage = (overrides: Record<string, unknown> = {}) => ({
  id: 'msg-1',
  role: 'assistant',
  content: '⚠️ Gateway shutting down — Your current task will be interrupted.',
  timestamp: Date.now(),
  systemType: 'gateway',
  ...overrides,
})

describe('useGatewayNoticeBanner', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('showBanner=true 当有 gateway 消息且未关闭', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([makeMessage()])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(true)
    expect(noticeMessage.value).toBe('⚠️ Gateway shutting down — Your current task will be interrupted.')
  })

  it('showBanner=false 当无 gateway 消息', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([
      { id: 'msg-1', role: 'user', content: 'hello', timestamp: Date.now() },
    ])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(false)
    expect(noticeMessage.value).toBeUndefined()
  })

  it('showBanner=false 当 messages 为空数组', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(false)
    expect(noticeMessage.value).toBeUndefined()
  })

  it('showBanner=false 当 sessionId 为 null', async () => {
    const sessionId = ref<string | null>(null)
    const messages = ref([makeMessage()])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(false)
    expect(noticeMessage.value).toBeUndefined()
  })

  it('showBanner=false 当已 dismiss', async () => {
    localStorage.setItem(STORAGE_KEY('sess-1'), '1')
    const sessionId = ref('sess-1')
    const messages = ref([makeMessage()])

    const { showBanner } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(false)
  })

  it('dismiss() 将 showBanner 置 false 并写 localStorage', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([makeMessage()])

    const { showBanner, dismiss } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(true)

    dismiss()
    await nextTick()

    expect(showBanner.value).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY('sess-1'))).toBe('1')
  })

  it('切换 sessionId 时重新读 localStorage', async () => {
    // sess-1 已关闭 → 不应显示
    localStorage.setItem(STORAGE_KEY('sess-1'), '1')
    const sessionId = ref<string | null>('sess-1')
    const messages = ref([makeMessage()])

    const { showBanner } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()
    expect(showBanner.value).toBe(false)

    // 切换到 sess-2（未关闭）→ 应显示
    sessionId.value = 'sess-2'
    await nextTick()
    expect(showBanner.value).toBe(true)

    // 切换到 sess-3（已关闭）→ 不应显示
    localStorage.setItem(STORAGE_KEY('sess-3'), '1')
    sessionId.value = 'sess-3'
    await nextTick()
    expect(showBanner.value).toBe(false)
  })

  it('dismiss() 在 sessionId 为 null 时不写 localStorage', async () => {
    const sessionId = ref<string | null>(null)
    const messages = ref([makeMessage()])

    const { dismiss } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    dismiss()
    await nextTick()

    // 不应写入任何 key
    expect(localStorage.length).toBe(0)
  })

  it('取多条 gateway 消息中的第一条', async () => {
    const sessionId = ref('sess-1')
    const messages = ref([
      { id: 'm1', role: 'assistant', content: 'normal msg', timestamp: 1 },
      makeMessage({ id: 'm2', content: '⚠️ Gateway shutting down — first.' }),
      makeMessage({ id: 'm3', content: '⚠️ Gateway restarting — second.' }),
    ])

    const { showBanner, noticeMessage } = useGatewayNoticeBanner(sessionId, messages)
    await nextTick()

    expect(showBanner.value).toBe(true)
    expect(noticeMessage.value).toBe('⚠️ Gateway shutting down — first.')
  })
})
```

> 注：最后两个测试（切换 sessionId 后重新读 + sessionId 为 null 不写 localStorage）需要 composable 实际实现来验证。若某些场景难以纯单测覆盖（如 watch 回调时序），可简化为仅测核心路径。

- [ ] **Step 2: 跑测试确认失败**

```bash
cd overlay
npm run test -- useGatewayNoticeBanner
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 composable**

创建 `overlay/custom/client/chat/useGatewayNoticeBanner.ts`：

```typescript
import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'

const STORAGE_KEY_PREFIX = 'gateway-notice-dismissed:'

export interface Message {
  id: string
  role: string
  content: string
  timestamp: number
  systemType?: 'command' | 'error' | 'fork-divider' | 'gateway'
  [key: string]: unknown
}

/**
 * 管理单个会话的网关告警横幅状态。
 *
 * @param sessionId - 当前会话/房间 ID（Ref）
 * @param messages  - 当前会话的消息列表（Ref 或 ComputedRef）
 * @returns showBanner（是否显示横幅）、noticeMessage（告警文本）、dismiss（关闭并持久化）
 */
export function useGatewayNoticeBanner(
  sessionId: Ref<string | null>,
  messages: Ref<readonly Message[]> | ComputedRef<readonly Message[]>,
) {
  const storageKey = (id: string) => STORAGE_KEY_PREFIX + id

  const dismissed = ref(false)

  // 监听 sessionId 变化，从 localStorage 读取是否已关闭
  watch(
    sessionId,
    (id) => {
      if (id) {
        dismissed.value = localStorage.getItem(storageKey(id)) === '1'
      } else {
        dismissed.value = false
      }
    },
    { immediate: true },
  )

  // 从消息列表中取第一条 systemType === 'gateway' 的消息
  const noticeMessage = computed<string | undefined>(() => {
    if (!sessionId.value) return undefined
    const msg = messages.value.find((m) => m.systemType === 'gateway')
    return msg?.content as string | undefined
  })

  // 有告警消息 且 未关闭
  const showBanner = computed(() => !!noticeMessage.value && !dismissed.value)

  // 关闭横幅并持久化
  function dismiss() {
    dismissed.value = true
    const id = sessionId.value
    if (id) {
      localStorage.setItem(storageKey(id), '1')
    }
  }

  return { showBanner, noticeMessage, dismiss }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npm run test -- useGatewayNoticeBanner
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
cd overlay
git add custom/client/chat/useGatewayNoticeBanner.ts custom/client/chat/__tests__/useGatewayNoticeBanner.test.ts
git commit -m "feat(chat): add useGatewayNoticeBanner composable

管理网关告警横幅状态：读 localStorage 判断是否已关闭、
从消息列表找 gateway 消息、暴露 showBanner/noticeMessage/dismiss。"
```

---

### Task 2: 横幅 UI 组件 `GatewayNoticeBanner.vue`

**Files:**
- Create: `overlay/custom/client/chat/components/GatewayNoticeBanner.vue`

- [ ] **Step 1: 创建组件**

创建 `overlay/custom/client/chat/components/GatewayNoticeBanner.vue`：

```vue
<template>
  <div v-if="showBanner" class="gateway-notice-banner">
    <span class="gateway-notice-icon">⚠️</span>
    <span class="gateway-notice-text">{{ noticeMessage }}</span>
    <button class="gateway-notice-close" @click="dismiss" title="关闭">×</button>
  </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import { useGatewayNoticeBanner, type Message } from '@/custom/chat/useGatewayNoticeBanner'

const props = defineProps<{
  sessionId: string | null
  messages: readonly Message[]
}>()

const sessionIdRef = toRef(props, 'sessionId')
const messagesRef = toRef(props, 'messages')

const { showBanner, noticeMessage, dismiss } = useGatewayNoticeBanner(sessionIdRef, messagesRef)
</script>

<style scoped>
.gateway-notice-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 193, 7, 0.1);
  border-bottom: 1px solid rgba(255, 193, 7, 0.3);
  font-size: 0.85em;
  color: var(--text-secondary, #888);
  flex-shrink: 0;
}

.gateway-notice-icon {
  flex-shrink: 0;
  line-height: 1.4;
}

.gateway-notice-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
  line-height: 1.4;
}

.gateway-notice-close {
  flex-shrink: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.2em;
  line-height: 1;
  color: var(--text-secondary, #888);
  padding: 0 4px;
  opacity: 0.6;
}

.gateway-notice-close:hover {
  opacity: 1;
}
</style>
```

- [ ] **Step 2: 跑全部测试确认无回归**

```bash
npm run test --prefix overlay
```

Expected: 全部 PASS（不含本组件的渲染测试——组件渲染测试在 Task 3/4 的集成验证中覆盖）。

- [ ] **Step 3: 提交**

```bash
cd overlay
git add custom/client/chat/components/GatewayNoticeBanner.vue
git commit -m "feat(chat): add GatewayNoticeBanner dismissible banner component

琥珀色粘性横幅，显示网关告警文本，点击 × 关闭并持久化到 localStorage。"
```

---

### Task 3: Patch 101 — `MessageList.vue`（运行聊天）

**Files:**
- Create: `overlay/patches/101-messagelist-gateway-banner.patch`
- Modify: `overlay/patches/series`

**前置**：先 `npm run clean && npm run inject` 确保 upstream 处于干净基线（已含 001-100 所有 patch）。

- [ ] **Step 1: 在 upstream 工作副本上手工做改动**

以下改动针对 `upstream/hermes-studio/packages/client/src/components/hermes/chat/MessageList.vue`。

**改动 A — 引入 GatewayNoticeBanner**（在现有 import 区域末尾，line 25 之后）：

```typescript
import GatewayNoticeBanner from '@/custom/chat/components/GatewayNoticeBanner.vue'
```

**改动 B — 在 `displayMessages` 里过滤 gateway 消息**（修改 line 120-137 的 computed）：

原代码：
```typescript
const displayMessages = computed(() => {
  const currentToolIds = new Set(currentToolCalls.value.map((tool) => tool.id));
  return chatStore.messages.filter((m) => {
    if (m.role === "tool") {
      return toolTraceVisible.value && !!m.toolName && !(chatStore.isRunActive && currentToolIds.has(m.id));
    }
    if (
      m.role === "assistant" &&
      m.isStreaming &&
      !m.content?.trim() &&
      !!m.reasoning?.trim() &&
      currentToolCalls.value.length === 0
    ) {
      return false;
    }
    return true;
  });
});
```

改为：
```typescript
const displayMessages = computed(() => {
  const currentToolIds = new Set(currentToolCalls.value.map((tool) => tool.id));
  return chatStore.messages.filter((m) => {
    if (m.role === "tool") {
      return toolTraceVisible.value && !!m.toolName && !(chatStore.isRunActive && currentToolIds.has(m.id));
    }
    if (
      m.systemType === "gateway" ||
      (m.role === "assistant" &&
       m.isStreaming &&
       !m.content?.trim() &&
       !!m.reasoning?.trim() &&
       currentToolCalls.value.length === 0)
    ) {
      return false;
    }
    return true;
  });
});
```

**改动 C — 模板顶部插入 GatewayNoticeBanner**（在 `<VirtualMessageList` 之前）：

找到 `<VirtualMessageList` 起始标签（line 475 附近），在其上一行插入：

```vue
    <GatewayNoticeBanner :session-id="chatStore.activeSessionId" :messages="chatStore.messages" />
```

- [ ] **Step 2: 生成 patch 文件**

```bash
cd upstream/hermes-studio
git diff packages/client/src/components/hermes/chat/MessageList.vue > /tmp/101.diff
```

将 `/tmp/101.diff` 内容写入 `overlay/patches/101-messagelist-gateway-banner.patch`，确保路径前缀为 `a/packages/client/...` 和 `b/packages/client/...`。

- [ ] **Step 3: 追加到 series 并 inject**

```bash
echo "101-messagelist-gateway-banner.patch" >> overlay/patches/series
npm run clean --prefix overlay
npm run inject --prefix overlay
```

Expected: inject 成功，无 `--reject`、无冲突。

- [ ] **Step 4: 跑全部测试**

```bash
npm run test --prefix overlay
```

Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
cd overlay
git add patches/101-messagelist-gateway-banner.patch patches/series
git commit -m "feat(chat): add gateway notice banner to MessageList

101 patch: displayMessages 过滤 gateway 消息 + 模板顶部插入
GatewayNoticeBanner（传入 activeSessionId 和 messages）。"
```

---

### Task 4: Patch 102 — `GroupMessageList.vue`（群组聊天）

**Files:**
- Create: `overlay/patches/102-groupmessagelist-gateway-banner.patch`
- Modify: `overlay/patches/series`

**前置**：Task 3 完成（upstream 已含 101）。

- [ ] **Step 1: 在 upstream 工作副本上手工做改动**

以下改动针对 `upstream/hermes-studio/packages/client/src/components/hermes/group-chat/GroupMessageList.vue`。

**改动 A — 引入 GatewayNoticeBanner**（在现有 import 区域末尾，line 7 之后）：

```typescript
import GatewayNoticeBanner from '@/custom/chat/components/GatewayNoticeBanner.vue'
```

**改动 B — 在 `displayMessages` 里过滤 gateway 消息**（修改 line 14 的 computed）：

原代码（line 14）：
```typescript
const displayMessages = computed(() => store.sortedMessages.filter(msg => msg.role !== 'tool' || toolTraceVisible.value || msg.toolStatus === 'running'))
```

改为：
```typescript
const displayMessages = computed(() => store.sortedMessages.filter(msg =>
  msg.systemType !== 'gateway' &&
  (msg.role !== 'tool' || toolTraceVisible.value || msg.toolStatus === 'running')
))
```

**改动 C — 模板顶部插入 GatewayNoticeBanner**（在 `<VirtualMessageList` 之前，line 90 附近）：

找到 `<VirtualMessageList` 起始标签，在其上一行插入：

```vue
        <GatewayNoticeBanner :session-id="store.currentRoomId" :messages="store.sortedMessages" />
```

- [ ] **Step 2: 生成 patch 文件**

```bash
cd upstream/hermes-studio
git diff packages/client/src/components/hermes/group-chat/GroupMessageList.vue > /tmp/102.diff
```

将 `/tmp/102.diff` 内容写入 `overlay/patches/102-groupmessagelist-gateway-banner.patch`。

- [ ] **Step 3: 追加到 series 并 inject**

```bash
echo "102-groupmessagelist-gateway-banner.patch" >> overlay/patches/series
npm run clean --prefix overlay
npm run inject --prefix overlay
```

Expected: inject 成功。

- [ ] **Step 4: 跑全部测试**

```bash
npm run test --prefix overlay
```

Expected: 全绿。

- [ ] **Step 5: 提交**

```bash
cd overlay
git add patches/102-groupmessagelist-gateway-banner.patch patches/series
git commit -m "feat(chat): add gateway notice banner to GroupMessageList

102 patch: displayMessages 过滤 gateway 消息 + 模板顶部插入
GatewayNoticeBanner（传入 currentRoomId 和 sortedMessages）。"
```

---

### Task 5: 全量验证

- [ ] **Step 1: 干净 inject + 全量测试**

```bash
cd overlay
npm run clean
npm run inject
npm run test
```

Expected:
- inject 无 `--reject`、无冲突
- vitest 全绿，含 `useGatewayNoticeBanner.test.ts`

- [ ] **Step 2: verify-clean 确认 patch 幂等**

```bash
cd overlay
npm run verify
```

Expected: 通过（patch 可重复 apply，无残留手工改动）。

- [ ] **Step 3: 手动验证（若环境允许运行 gateway）**

触发一次 gateway 关闭，确认：
1. 运行聊天顶部出现琥珀色横幅 `⚠️ Gateway shutting down — Your current task will be interrupted.`
2. 群组聊天同样出现
3. 消息列表中不再有 gateway 告警的灰条/气泡
4. 点击 × → 横幅消失
5. 刷新页面 → 同会话横幅不再出现
6. 切换到另一个会话 → 若有告警则横幅独立出现（per-session 关闭）

---

## 完成后：合入 main

```bash
cd overlay
git checkout main
git merge feat/gateway-notice-banner
```

---

## 自检（writing-plans self-review）

**1. Spec 覆盖**：
- §4 架构 → composable（Task 1）+ 组件（Task 2）+ displayMessages 过滤 + 模板插入（Task 3/4）。✅
- §5.1 `useGatewayNoticeBanner` → Task 1（签名、逻辑、边界）。✅
- §5.2 `GatewayNoticeBanner.vue` → Task 2（模板、props、scoped CSS）。✅
- §6.1 Patch MessageList → Task 3。✅
- §6.2 Patch GroupMessageList → Task 4。✅
- §8 测试 → Task 1 单测 + Task 5 全量。✅

**2. 占位符扫描**：
- 无 TBD/TODO/占位符。所有步骤含完整代码和命令。✅
- Task 1 末尾两个边界测试（sessionId 切换、null 不写 localStorage）需 composable 实际行为验证——已在测试代码中实现，非占位。✅

**3. 类型一致性**：
- Composable 导出 `Message` interface（`systemType?: 'command' | 'error' | 'fork-divider' | 'gateway'`），与 chat store 的 `Message` 类型（094 patch 扩展后）一致。✅
- 组件 props `sessionId: string | null` + `messages: readonly Message[]` — 与 MessageList（`chatStore.activeSessionId` 是 `string | null`，`chatStore.messages` 是 `Message[]`）和 GroupMessageList（`store.currentRoomId` 是 `string | null`，`store.sortedMessages` 是 `Message[]`）完全匹配。✅
- Composable 签名 `(Ref<string | null>, Ref<readonly Message[]> | ComputedRef<readonly Message[]>)` — ComputedRef 是 Ref 子类型，兼容 `chatStore.messages`（ComputedRef）和 `store.sortedMessages`（ComputedRef）。✅
- localStorage key `gateway-notice-dismissed:{sessionId}` 在 composable 和测试中一致。✅
