# 网关告警可关闭横幅

**日期**：2026-06-24
**状态**：待评审
**适用项目**：`overlay/`（经 patch 注入 `upstream/hermes-studio`）
**依赖**：已完成的 094/095/096 patch（告警识别 + 紧凑渲染）

---

## 1. 背景

当 `hermes-agent` 网关关闭/重启时，会向所有活跃会话推送告警：

```
⚠️ Gateway shutting down — Your current task will be interrupted.
⚠️ Gateway restarting — Your current task will be interrupted. Send any message...
```

上期（094/095/096 patch）已实现：在数据层给告警打 `systemType: 'gateway'` 标记，渲染层折叠为紧凑灰条。但用户反馈：
- 即便折叠成灰条，在消息列表中仍占视觉空间
- 用户看到后想要手动关闭它，不必每次都看到

**本期目标**：在紧凑渲染的基础上进一步升级——告警改为**可关闭横幅**，悬挂在消息列表顶部。关闭后写入 localStorage，同会话不再出现。

---

## 2. 目标与非目标

**目标**
- 网关告警以琥珀色警告横幅形式出现在消息列表顶部（粘性定位）
- 用户可点击 × 关闭横幅
- 关闭状态持久化到 localStorage（key: `gateway-notice-dismissed:{sessionId}`），刷新/重开不再出现
- 运行聊天（`MessageList`）与群组聊天（`GroupMessageList`）两者同时生效
- 每个会话独立记录关闭状态（关闭会话 A 的横幅不影响会话 B）

**非目标**
- 不修改 `hermes-agent` 上游推送逻辑
- 不修改 chat store 打标逻辑（094 patch 保留不动）
- 不引入服务端持久化（仅 localStorage）
- 不跨设备/跨浏览器同步关闭状态
- 不新增设置项开关

---

## 3. 设计决策（已与用户确认）

| 决策点 | 选定方案 |
|--------|---------|
| 关闭持久化 | **B — localStorage**（key `gateway-notice-dismissed:{sessionId}`，值 `"1"`） |
| 横幅与灰条关系 | **A — 横幅替代灰条**：告警从消息列表移除，仅以横幅形式存在；关闭后完全不可见 |
| 横幅位置 | **A — 消息列表顶部**（粘性定位，不随滚动消失） |
| 关闭范围 | 每个会话独立（以 `sessionId` 为粒度） |

---

## 4. 整体架构与数据流

```
hermes-agent gateway shutdown
       │  ("⚠️ Gateway shutting down — ...")
       ▼
chat store ── 094 patch: systemType = 'gateway' （不动）
       │
       ├── store.messages[i].systemType === 'gateway'
       │
       ▼
displayMessages 过滤器（097/098 patch 新增：筛掉 gateway 消息）
       │
       │  消息列表 → 不再出现网关告警（无论灰条还是气泡）
       │
       └── useGatewayNoticeBanner(sessionId)
              │
              ├─ 从 store 获取当前会话的 gateway 消息
              ├─ 查询 localStorage: dismissed?
              ├─ 暴露: { showBanner, noticeMessage, dismiss }
              │
              ▼
           GatewayNoticeBanner.vue
              │  v-if="showBanner"
              │  position: sticky; top: 0; z-index 在消息区之上
              │  ⚠️ Gateway shutting down — Your current task will be interrupted.  [×]
              │
              │  点击 × → dismiss()
              │    → localStorage.setItem('gateway-notice-dismissed:{sessionId}', '1')
              │    → showBanner 变为 false
              │    → 横幅消失
```

**关键原则**：
- **数据层不动**：094 patch 的打标逻辑是数据基础，本期在其上叠加展示层行为
- **纯逻辑抽离**：banner 状态管理抽成 composable（纯 TS，可单测），组件只负责渲染
- **store 消息保留**：从 `displayMessages` 过滤而非删除 store 数据——保留可追溯性，只是不展示

---

## 5. 新增模块

### 5.1 `useGatewayNoticeBanner` Composable

文件：`overlay/custom/client/chat/useGatewayNoticeBanner.ts`

职责：管理单个会话的网关告警横幅状态。

```typescript
// 签名
function useGatewayNoticeBanner(sessionId: Ref<string | undefined>): {
  showBanner: ComputedRef<boolean>
  noticeMessage: ComputedRef<string | undefined>
  dismiss: () => void
}
```

**内部逻辑**：

```typescript
const STORAGE_KEY_PREFIX = 'gateway-notice-dismissed:'

// dismissed: 当前会话是否已关闭横幅（reactive）
const dismissed = ref(false)

// 监听 sessionId 变化，读 localStorage 初始化 dismissed
watch(sessionId, (id) => {
  if (id) {
    dismissed.value = localStorage.getItem(STORAGE_KEY_PREFIX + id) === '1'
  } else {
    dismissed.value = false
  }
}, { immediate: true })

// noticeMessage: 从 chatStore 取当前会话第一条 systemType==='gateway' 的消息
const noticeMessage = computed(() => {
  if (!sessionId.value) return undefined
  const session = chatStore.sessions.find(s => s.id === sessionId.value)
  return session?.messages.find(m => m.systemType === 'gateway')?.content as string | undefined
})

// showBanner: 有消息 且 未关闭
const showBanner = computed(() => !!noticeMessage.value && !dismissed.value)

// dismiss: 关闭并持久化
function dismiss() {
  dismissed.value = true
  if (sessionId.value) {
    localStorage.setItem(STORAGE_KEY_PREFIX + sessionId.value, '1')
  }
}
```

**边界情况**：
- `sessionId` 为 `undefined` 时：`showBanner` 为 `false`，不写 localStorage
- 一条会话有多条 gateway 消息时：只取第一条展示（网关关闭通常只推一条）
- 网关再次重启推送新告警（新 sessionId）：key 不同，横幅重新出现 ✅
- 同一会话多次重启（sessionId 不变，新消息推入）：`dismissed` 已为 true → 不显示。这是**有意设计**——用户已关闭过该会话的告警，不应反复弹出。若需重新显示可手动清除 localStorage。

### 5.2 `GatewayNoticeBanner.vue`

文件：`overlay/custom/client/chat/components/GatewayNoticeBanner.vue`

职责：渲染粘性横幅 UI。

**Props**：

| Prop | 类型 | 说明 |
|------|------|------|
| `sessionId` | `string \| undefined` | 当前会话 ID，透传给 `useGatewayNoticeBanner` |

**模板**：

```vue
<template>
  <div v-if="showBanner" class="gateway-notice-banner">
    <span class="gateway-notice-icon">⚠️</span>
    <span class="gateway-notice-text">{{ noticeMessage }}</span>
    <button class="gateway-notice-close" @click="dismiss" title="关闭">×</button>
  </div>
</template>
```

**样式**（scoped）：

```scss
.gateway-notice-banner {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 193, 7, 0.1);   // 琥珀色半透明底色
  border-bottom: 1px solid rgba(255, 193, 7, 0.3);
  font-size: 0.85em;
  color: var(--text-secondary, #888);
}

.gateway-notice-icon {
  flex-shrink: 0;
}

.gateway-notice-text {
  flex: 1;
  min-width: 0;
  word-break: break-word;
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

  &:hover {
    opacity: 1;
  }
}
```

**视觉层级**：琥珀色背景 (`rgba(255, 193, 7, .1)`) 与现有 error 红 (`agent-error`) 区分——警告而非错误。z-index 10 在消息区之上，但不覆盖全局 UI（header 等 z-index 通常 >20）。

---

## 6. Patch 改动

### 6.1 Patch 097：`MessageList.vue`（运行聊天）

改动文件：`upstream/hermes-studio/packages/client/src/components/hermes/chat/MessageList.vue`

**改动 A — 引入组件**：

```vue
<script setup lang="ts">
import GatewayNoticeBanner from '@/custom/chat/components/GatewayNoticeBanner.vue'
// sessionId 从当前路由或父组件获取（MessageList 现有逻辑已持有）
</script>
```

**改动 B — 过滤 gateway 消息**（在现有 `displayMessages` computed 的过滤链末尾追加）：

```typescript
// 现有 displayMessages 逻辑末尾追加：
// 过滤网关告警（改为横幅展示，不进入消息流）
messages = messages.filter(m => m.systemType !== 'gateway')
```

**改动 C — 模板插入横幅**（消息容器 DOM 顶部，消息列表 `<VirtualList>` 之前）：

```vue
<template>
  <div class="message-list-container">
    <GatewayNoticeBanner :session-id="currentSessionId" />
    <!-- 现有 VirtualList / 消息列表渲染 -->
    ...
  </div>
</template>
```

`sessionId` 通过 prop 显式传入：`currentSessionId` 为 MessageList 组件已有的 session 标识（通常从路由 `params.sessionId` 或 store 当前会话派生）。

### 6.2 Patch 098：`GroupMessageList.vue`（群组聊天）

改动文件：`upstream/hermes-studio/packages/client/src/components/hermes/group-chat/GroupMessageList.vue`

三处改动与 097 对称：
- 引入 `GatewayNoticeBanner`
- `displayMessages` 过滤 `systemType !== 'gateway'`
- 模板 DOM 顶部插入 `<GatewayNoticeBanner :session-id="currentSessionId" />`

### 6.3 已有 patch 处理

- 094（store 打标）、095（MessageItem 紧凑渲染）、096（GroupMessageItem 紧凑渲染）：**保留不动**
- 095/096 的渲染改动虽然不再触发（gateway 消息已被 filter 移除），但作为防御性 fallback 保留——若任何边缘路径绕过 displayMessages 过滤器，仍以紧凑样式呈现而非大气泡
- 不再需要的旧行为（紧凑灰条）被 banner 替代，不影响其他消息类型

---

## 7. localStorage 设计

| 属性 | 值 |
|------|---|
| Key 格式 | `gateway-notice-dismissed:{sessionId}` |
| Value | `"1"`（存在即已关闭） |
| 清理策略 | 不自动清理。每个 key 仅几十字节，累积量可忽略。用户可手动清除浏览器数据 |
| 多标签页同步 | 不处理。每个标签页独立在 `onMounted` 时读取 localStorage，关闭后仅当前标签页即时生效。跨标签页需刷新 |

---

## 8. 测试策略

### 8.1 `useGatewayNoticeBanner` 单测（核心）

文件：`overlay/custom/client/chat/__tests__/useGatewayNoticeBanner.test.ts`

用例：
| 场景 | 预期 |
|------|------|
| sessionId 有值 + store 有 gateway 消息 + 未关闭 | `showBanner = true`，`noticeMessage` 为消息内容 |
| sessionId 有值 + store 无 gateway 消息 | `showBanner = false` |
| sessionId 有值 + 已关闭（localStorage 有标记） | `showBanner = false` |
| sessionId 为 undefined | `showBanner = false` |
| 调用 `dismiss()` | `showBanner` 变为 `false`，localStorage 写入 key |
| 切换 sessionId | dismissed 重新从 localStorage 读取，针对新会话 |

### 8.2 `GatewayNoticeBanner.vue` 渲染测试

用 `@vue/test-utils` mount 组件，注入 mock store：

| 场景 | 预期 |
|------|------|
| `showBanner = false` | 不渲染 DOM |
| `showBanner = true` | 渲染 `.gateway-notice-banner`，文本匹配，点击 × 触发 dismiss |

### 8.3 已有测试

- `gateway-notice.test.ts`（Task 1 遗留）：继续全绿，不受影响
- 全量 `npm run test`：无回归

---

## 9. 风险与边界

| 风险 | 评估 |
|------|------|
| `displayMessages` 过滤后其他逻辑受影响 | 低。gateway 消息 role 为 assistant 但 systemType 唯一。现有逻辑（未读计数、lastMessage 预览、for 循环）不依赖 displayMessages 的过滤结果。 |
| 横幅样式与不同主题冲突 | 低。使用 CSS 变量（`--text-secondary`）和半透明值，适配亮/暗主题。 |
| 频繁切换会话导致 localStorage 读写抖动 | 低。`watch(sessionId)` 只在 sessionId 值变化时触发，正常使用频率极低 |
| 同一会话多次收到告警但不再显示 | 有意行为。若需改变，后续可通过 sessionId+messageId 复合 key 实现 per-message 关闭 |

---

## 10. 验证步骤

1. `npm run inject` 成功，无 patch 冲突
2. `npm run test` 全绿，含新增 `useGatewayNoticeBanner.test.ts`
3. 手动验证：
   - 触发 gateway 关闭 → 运行聊天顶部出现琥珀色横幅
   - 群组聊天同样出现
   - 点击 × → 横幅消失
   - 刷新页面 → 同会话横幅不再出现
   - 切换到另一会话 → 如有告警，横幅独立显示
   - 消息列表中**不再**有网关告警的灰条（已被 filter）
