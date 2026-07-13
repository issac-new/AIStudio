# 折叠网关关闭告警 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Matrix 聊天界面里的 `⚠️ Gateway shutting down/restarting — ...` 告警从普通助手大气泡改为紧凑系统提示，运行聊天与群组聊天两个界面同时生效。

**Architecture:** 在数据层（chat store）给告警消息打 `systemType: 'gateway'` 标记，渲染层只读标记。识别逻辑抽成纯函数模块 `overlay/custom/client/chat/gateway-notice.ts`（直接可单测，通过 `@/custom/chat/gateway-notice` 被 chat store patch 引用）。改动经 `overlay/patches/` 注入 upstream，不触碰 `upstream/`。

**Tech Stack:** Vue 3 + Pinia（`stores/hermes/chat.ts`）、Vitest、overlay patch 注入机制（`scripts/inject.mjs` + `git apply`）。

**设计依据**：`docs/superpowers/specs/2026-06-24-filter-gateway-shutdown-notice-design.md`

---

## 关键背景（实施者必读）

1. **只能改 `overlay/`**：`upstream/` 只读。所有 upstream 改动通过 `overlay/patches/NNN-*.patch`（`git apply` 格式）实现，由 `npm run inject` 注入。新 patch 追加到 `overlay/patches/series` 末尾。
2. **测试只跑 `custom/` 下的**：`overlay/vitest.config.ts` 配置 `include: ['custom/**/*.test.ts']`。所以纯逻辑必须放在 `overlay/custom/client/` 下才能被 `npm run test` 跑到（这是把 `isGatewayNotice` 抽成 overlay 模块而非埋进 store 的根本原因）。
3. **alias**：`@/custom/...` → `overlay/custom/client/...`；`@` → `upstream/hermes-studio/packages/client/src`。patch 里引用自定义模块用 `@/custom/...`。
4. **patch 序号**：当前最大是 093。本计划新增 094/095/096。
5. **告警来源**：`hermes-agent/gateway/run.py:4497` 发出，经 socket 以 `role: 'assistant'` 进入 chat store。两种变体：
   - `⚠️ Gateway shutting down — Your current task will be interrupted.`
   - `⚠️ Gateway restarting — Your current task will be interrupted. Send any message after restart and I'll try to resume where you left off.`

## 文件结构

| 文件 | 职责 | 类型 |
|------|------|------|
| `overlay/custom/client/chat/gateway-notice.ts` | 纯函数：识别网关告警文本 + 给消息打标的辅助函数。可直接单测。 | 新建 |
| `overlay/custom/client/chat/__tests__/gateway-notice.test.ts` | `isGatewayNotice` / `tagGatewayNotice` 单测（命中/不命中/边界/不覆盖已有 systemType） | 新建 |
| `overlay/patches/094-client-store-chat-gateway-notice.patch` | 改 `stores/hermes/chat.ts`：扩展 `systemType` 联合类型；`normalizeHistoryMessage` 打标；`addMessage` 兜底打标 | 新建 |
| `overlay/patches/095-client-messageitem-gateway-notice.patch` | 改 `MessageItem.vue`：新增 `isGatewayNotice` 计算属性 + 紧凑渲染分支 | 新建 |
| `overlay/patches/096-client-groupmessageitem-gateway-notice.patch` | 改 `GroupMessageItem.vue`：新增 `isGatewayNotice` + `gateway-notice` class + scoped CSS | 新建 |

---

## Task 1: 新建识别模块 `gateway-notice.ts`（TDD）

**Files:**
- Create: `overlay/custom/client/chat/gateway-notice.ts`
- Test: `overlay/custom/client/chat/__tests__/gateway-notice.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `overlay/custom/client/chat/__tests__/gateway-notice.test.ts`：

```typescript
import { describe, it, expect } from 'vitest'
import { isGatewayNotice, tagGatewayNotice } from '@/custom/chat/gateway-notice'

describe('isGatewayNotice', () => {
  it('命中: shutting down 变体', () => {
    expect(isGatewayNotice('⚠️ Gateway shutting down — Your current task will be interrupted.')).toBe(true)
  })
  it('命中: restarting 变体（含后续恢复提示）', () => {
    expect(isGatewayNotice('⚠️ Gateway restarting — Your current task will be interrupted. Send any message after restart and I\'ll try to resume where you left off.')).toBe(true)
  })
  it('命中: 前导/多余空白', () => {
    expect(isGatewayNotice('   ⚠️  Gateway shutting down — ...')).toBe(true)
  })
  it('不命中: 普通助手对话即便提到 Gateway', () => {
    expect(isGatewayNotice('⚠️ Gateway 这个词真有意思')).toBe(false)
  })
  it('不命中: 空字符串/非字符串', () => {
    expect(isGatewayNotice('')).toBe(false)
    expect(isGatewayNotice(undefined)).toBe(false)
    expect(isGatewayNotice(null)).toBe(false)
    expect(isGatewayNotice(123)).toBe(false)
  })
  it('不命中: 普通对话', () => {
    expect(isGatewayNotice('请帮我审查这段代码')).toBe(false)
  })
})

describe('tagGatewayNotice', () => {
  // tagGatewayNotice(content, currentSystemType):
  //   若 currentSystemType 已显式设置（非 undefined），原样返回（尊重已有语义，如 error/command）。
  //   否则命中告警返回 'gateway'，未命中返回 undefined。
  it('未显式 systemType 且命中 → gateway', () => {
    expect(tagGatewayNotice('⚠️ Gateway shutting down — x', undefined)).toBe('gateway')
  })
  it('未显式 systemType 且不命中 → undefined', () => {
    expect(tagGatewayNotice('普通消息', undefined)).toBeUndefined()
  })
  it('已显式 error → 保持 error，不被改写', () => {
    expect(tagGatewayNotice('⚠️ Gateway shutting down — x', 'error')).toBe('error')
  })
  it('已显式 command → 保持 command', () => {
    expect(tagGatewayNotice('⚠️ Gateway restarting — x', 'command')).toBe('command')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run（在 `overlay/` 目录）: `npm run test -- gateway-notice`
Expected: FAIL，报错 `Failed to resolve import "@/custom/chat/gateway-notice"`（模块还不存在）。

- [ ] **Step 3: 实现模块**

创建 `overlay/custom/client/chat/gateway-notice.ts`：

```typescript
// 网关生命周期告警识别。
//
// hermes-agent 的 gateway 在关闭/重启时，会向所有活跃会话推送一条告警
// （upstream/hermes-agent/gateway/run.py:4497）：
//   "⚠️ Gateway shutting down — Your current task will be interrupted."
//   "⚠️ Gateway restarting — Your current task will be interrupted. Send any message..."
// 这类消息本质是系统事件而非对话内容，命中后由 chat store 打 systemType: 'gateway'
// 标记，渲染层据此折叠为紧凑系统提示。
//
// 抽成独立模块而非埋进 store，是为了能在 custom/** 下被 vitest 直接单测
// （vitest.config.ts 的 include 只跑 custom/**/*.test.ts）。

const GATEWAY_NOTICE_RE = /^⚠️\s*Gateway\s+(shutting down|restarting)\b/i

/** 判断文本是否为网关关闭/重启告警。 */
export function isGatewayNotice(content: unknown): boolean {
  const text = typeof content === 'string' ? content.trim() : ''
  return text.length > 0 && GATEWAY_NOTICE_RE.test(text)
}

/**
 * 计算消息应使用的 systemType：
 * - 若 currentSystemType 已显式设置（非 undefined），原样返回——尊重 error/command 等已有语义；
 * - 否则命中告警返回 'gateway'，未命中返回 undefined。
 *
 * 用于 chat store 的历史回放与 addMessage 兜底两处打标入口。
 */
export function tagGatewayNotice(
  content: unknown,
  currentSystemType: string | undefined,
): 'gateway' | string | undefined {
  if (currentSystemType !== undefined) return currentSystemType
  return isGatewayNotice(content) ? 'gateway' : undefined
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -- gateway-notice`
Expected: PASS（全部用例绿）。

- [ ] **Step 5: 提交**

```bash
cd overlay
git add custom/client/chat/gateway-notice.ts custom/client/chat/__tests__/gateway-notice.test.ts
git commit -m "feat(chat): add isGatewayNotice/tagGatewayNotice pure helpers

纯函数模块，识别 hermes-agent gateway 关闭/重启告警文本。
后续 patch 引用 @/custom/chat/gateway-notice 在 chat store 打标。"
```

---

## Task 2: chat store 集成打标（patch 094）

让 chat store 在两个入口（历史回放 `normalizeHistoryMessage`、入站兜底 `addMessage`）对告警消息打 `systemType: 'gateway'`。

**Files:**
- Create: `overlay/patches/094-client-store-chat-gateway-notice.patch`
- Test: `overlay/custom/client/chat/__tests__/gateway-notice-store.test.ts`

**实施前置**：patch 必须先 `npm run inject` 注入后才能跑集成测试。所以顺序是「写测试 → 写 patch → inject → 跑测试」。

- [ ] **Step 1: 写集成测试（先写，它依赖 patch 注入后的 store 行为）**

创建 `overlay/custom/client/chat/__tests__/gateway-notice-store.test.ts`：

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useChatStore } from '@/stores/hermes/chat'

// 这条消息由 chat store 经历史回放或 addMessage 入站。
// 我们只关心：进 store 后它的 systemType 是否被正确打成 'gateway'。
const SHUTDOWN = '⚠️ Gateway shutting down — Your current task will be interrupted.'
const RESTART = '⚠️ Gateway restarting — Your current task will be interrupted. Send any message.'
const NORMAL = '请帮我审查这段代码'

describe('chat store 网关告警打标', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('addMessage 兜底：告警 assistant 消息 → systemType=gateway', () => {
    const store = useChatStore() as any
    // 直接调用内部 addMessage（store setup 风格，addMessage 是闭包内函数，
    // 通过给某 session 加消息触发；这里用 messages 数组断言）。
    // 注意：addMessage 需要 sessionId。测试用 ensureSession/直接 set messages 的最小路径。
    // 若 store 未暴露 addMessage，则改测 normalizeHistoryMessage 路径（见下一用例）。
    // —— 见下方“实现注记”：此用例验证入站兜底，通过 store 对外可观测行为。
  })

  it('normalizeHistoryMessage：历史回放命中 → systemType=gateway（role 保持 assistant）', () => {
    // normalizeHistoryMessage 是模块内函数，不直接导出。
    // 通过观察 store 加载历史后的 messages 间接验证：
    // 构造一条 HermesMessage（上游历史格式），断言转成 store Message 后 systemType。
    // 见实现注记：用 fetchSessionMessagesPage 的 mock，或直接断言 store 公开字段。
    expect(true).toBe(true) // placeholder, 见实现注记
  })
})
```

**实现注记（Step 1 的现实约束）**：
`normalizeHistoryMessage` 与 `addMessage` 都是 `stores/hermes/chat.ts` 内部闭包函数，未导出。直接单测它们需要：(a) 导出它们，或 (b) 通过 store 对外可观测行为（mock `fetchSessionMessagesPage` 返回历史，断言 `store.messages`）。**由于 Task 1 已用纯函数 `tagGatewayNotice` 覆盖了打标逻辑的正确性，store 集成测试的价值在于“接线”验证**。

**决策**：本计划采用方案 (b) 的轻量版——不写复杂 mock，而是把集成验证降级为「Task 5 的手动验证 + inject 冒烟」。**删除 Step 1 的占位测试文件**，避免留下永远 pending/空断言的测试（违反 writing-plans 的“无占位符”原则）。

- [ ] **Step 2: 删除占位测试文件，改用 inject 冒烟验证接线**

不创建 `gateway-notice-store.test.ts`。打标逻辑的正确性已由 Task 1 的纯函数测试充分覆盖；store 接线（两处入口调用 `tagGatewayNotice`）的正确性由 patch 代码评审 + Task 5 的 inject/手动验证覆盖。

```bash
# 确认没有创建该文件（若 Step 1 误建则删除）
rm -f overlay/custom/client/chat/__tests__/gateway-notice-store.test.ts
```

- [ ] **Step 3: 写 patch 094（扩展类型 + normalizeHistoryMessage + addMessage 兜底）**

patch 修改 `upstream/hermes-studio/packages/client/src/stores/hermes/chat.ts`。先 `npm run inject` 让 upstream 处于干净基线，再在 **`upstream/` 工作副本**上手工做下面三处改动，然后用 `git diff` 生成 patch。

**改动 A — 扩展 systemType 联合类型（line 53）**：

```typescript
// 改前：
  systemType?: 'command' | 'error' | 'fork-divider'
// 改后：
  systemType?: 'command' | 'error' | 'fork-divider' | 'gateway'
```

**改动 B — 引入 import（文件顶部 import 区，紧接现有 import 之后）**：

```typescript
import { tagGatewayNotice } from '@/custom/chat/gateway-notice'
```

**改动 C — normalizeHistoryMessage 打标（line 435 附近，`displayRole` 判定那行）**：

```typescript
// 改前（line 435）：
      systemType: displayRole === 'command' ? 'command' : undefined,
// 改后：
      systemType: tagGatewayNotice(displayContent, displayRole === 'command' ? 'command' : undefined),
```

**改动 D — addMessage 兜底打标（line 1325 的 `function addMessage`）**：

`addMessage` 实现极简（line 1325-1328），直接把 `msg` 对象 push 进 `s.messages`（无解构/无拷贝），所以可直接改 `msg.systemType`：

```typescript
// 改前：
  function addMessage(sessionId: string, msg: Message) {
    const s = sessions.value.find(s => s.id === sessionId)
    if (s) s.messages.push(msg)
  }
// 改后：
  function addMessage(sessionId: string, msg: Message) {
    // 兜底：未显式指定 systemType 的消息，若是网关关闭/重启告警则打标，
    // 供渲染层折叠为紧凑系统提示（两入口之一；历史回放入口在 normalizeHistoryMessage）。
    if (msg.systemType === undefined) {
      const tagged = tagGatewayNotice(msg.content, msg.systemType)
      if (tagged) msg.systemType = tagged as NonNullable<typeof msg.systemType>
    }
    const s = sessions.value.find(s => s.id === sessionId)
    if (s) s.messages.push(msg)
  }
```

**生成 patch**：

```bash
cd upstream/hermes-studio
git diff packages/client/src/stores/hermes/chat.ts > /tmp/094.diff
# 把 /tmp/094.diff 内容写入 overlay/patches/094-client-store-chat-gateway-notice.patch
# 确保以 a/packages/client/... b/packages/client/... 为路径前缀（git apply -p1 风格，与现有 patch 一致）
cd /Volumes/nvme2230/lab/ncwk
```

- [ ] **Step 4: 追加到 series 并 inject**

```bash
# 追加 094 到 series 末尾
echo "094-client-store-chat-gateway-notice.patch" >> overlay/patches/series
# 先 clean 掉之前手工改的 upstream 副本
npm run clean --prefix overlay
# 注入
npm run inject --prefix overlay
```
Expected: inject 成功，无 `git apply --reject`。

- [ ] **Step 5: 跑全部测试确认无回归**

Run: `npm run test --prefix overlay`
Expected: PASS（Task 1 的 gateway-notice 测试 + 全部现有 custom/ 测试绿）。

- [ ] **Step 6: 提交**

```bash
cd overlay
git add patches/094-client-store-chat-gateway-notice.patch patches/series
git commit -m "feat(chat): tag gateway shutdown/restart notices in chat store

094 patch: 扩展 systemType 联合类型加 'gateway'；
normalizeHistoryMessage 与 addMessage 两入口用 tagGatewayNotice 打标。"
```

---

## Task 3: 运行聊天 MessageItem 紧凑渲染（patch 095）

让 `MessageItem.vue` 把 `systemType: 'gateway'` 渲染成紧凑系统提示（复用 system/command 紧凑气泡样式，不带 slash-command 的 `/` 图标）。

**Files:**
- Create: `overlay/patches/095-client-messageitem-gateway-notice.patch`

- [ ] **Step 1: 写 patch 095（在 upstream 工作副本上改，再 git diff 生成）**

先 `npm run clean` 恢复 upstream 基线（保留已注入的 094），然后在 `upstream/hermes-studio/packages/client/src/components/hermes/chat/MessageItem.vue` 做两处改动：

**改动 A — 新增 isGatewayNotice 计算属性（line 39 之后，紧邻 isAgentError）**：

```vue
const isAgentError = computed(() => props.message.role === "assistant" && props.message.systemType === "error");
const isGatewayNotice = computed(() => props.message.systemType === "gateway");
```

**改动 B — message-bubble 的 :class 追加 gateway 标志（line 850-856 附近）**：

```vue
            :class="{
              system: isSystem,
              'agent-error': isAgentError,
              gateway: isGatewayNotice,
              command: isCommandMessage,
              'command-error': isCommandError,
              'speech-playing': isPlayingThisMessage && !isPausedThisMessage,
            }"
```

**改动 C — 内容分支：在 isCommandMessage 分支前插入 gateway 分支（line 990 附近）**：

找到现有结构（line 990-1009）：
```vue
            <!-- Render system message content -->
            <MarkdownRenderer
              v-if="message.role === 'system' && message.content && !isCommandMessage"
              :content="message.content"
            />
            <div v-if="isStatusCommand" class="command-result command-status">
              ...
            </div>
            <div v-else-if="isCommandMessage && message.content" class="command-result">
              <span class="command-result-icon">/</span>
              ...
            </div>
```

把 system 消息的 MarkdownRenderer 那个 `v-if` 改为也覆盖 gateway，且放在 command 分支之前（这样 gateway 不会进带 `/` 图标的 command-result 分支）：

```vue
            <!-- Render system / gateway-notice content (compact, no slash icon) -->
            <MarkdownRenderer
              v-if="(message.role === 'system' || isGatewayNotice) && message.content && !isCommandMessage"
              :content="message.content"
            />
            <div v-if="isStatusCommand" class="command-result command-status">
              ...
            </div>
            <div v-else-if="isCommandMessage && message.content" class="command-result">
              <span class="command-result-icon">/</span>
              ...
            </div>
```

> 说明：gateway 消息 `role` 仍是 `assistant`，所以原 system 的 `v-if`（`role==='system'`）不会命中它——加 `|| isGatewayNotice` 让它走同一条 MarkdownRenderer 紧凑渲染。`!isCommandMessage` 保证不与 command 冲突（gateway 的 systemType 不是 command，天然满足）。`gateway` class 复用现有 system/command 的紧凑灰底气泡 CSS（可在 `<style>` 里给 `.gateway` 加一条 `@extend` 或与 `.system` 相同的样式；若现有 `.system` 样式已够紧凑，仅靠 MarkdownRenderer 渲染 + 灰底即可，无需额外 CSS——实施者检查 line 1138/1197 附近的 `&.command`/`&.system` 样式块决定是否补 `.gateway { ... }`）。

- [ ] **Step 2: 追加 series + inject + 冒烟**

```bash
echo "095-client-messageitem-gateway-notice.patch" >> overlay/patches/series
npm run clean --prefix overlay
npm run inject --prefix overlay
npm run test --prefix overlay
```
Expected: inject 成功；测试全绿。

- [ ] **Step 3: 生成并提交 patch**

```bash
cd upstream/hermes-studio
git diff packages/client/src/components/hermes/chat/MessageItem.vue > /tmp/095.diff
# 把内容写入 overlay/patches/095-client-messageitem-gateway-notice.patch
cd /Volumes/nvme2230/lab/ncwk
cd overlay
git add patches/095-client-messageitem-gateway-notice.patch patches/series
git commit -m "feat(chat): render gateway notices compactly in MessageItem

095 patch: 新增 isGatewayNotice 计算属性；gateway 消息复用 system
紧凑气泡样式 + MarkdownRenderer 渲染（不带 slash-command / 图标）。"
```

---

## Task 4: 群组聊天 GroupMessageItem 紧凑渲染（patch 096）

让 `GroupMessageItem.vue`（结构与 MessageItem 不同——它没有 system/command 分支，所有非 tool 消息走气泡 + class 标志）给 gateway 消息加 `gateway-notice` class + 紧凑灰底 CSS。

**Files:**
- Create: `overlay/patches/096-client-groupmessageitem-gateway-notice.patch`

- [ ] **Step 1: 写 patch 096（在 upstream 工作副本上改，再 git diff 生成）**

在 `upstream/hermes-studio/packages/client/src/components/hermes/group-chat/GroupMessageItem.vue` 做三处改动：

**改动 A — 新增 isGatewayNotice 计算属性（line 48 之后，紧邻 isAgentError）**：

```vue
const isAgentError = computed(() => {
    if (props.message.role !== 'assistant') return false
    if (props.message.finish_reason === 'error') return true
    return /^Error:\s*/i.test(props.message.content || '')
})

const isGatewayNotice = computed(() => props.message.systemType === 'gateway')
```

**改动 B — .msg-content 的 :class 追加 gateway-notice（line 541-545）**：

```vue
                :class="{
                    'agent-content': isAgent,
                    'agent-error': isAgentError,
                    'gateway-notice': isGatewayNotice,
                    'speech-playing': isPlayingThisMessage && !isPausedThisMessage,
                }"
```

**改动 C — scoped CSS：新增 .gateway-notice 样式（在 `&.agent .msg-content.agent-error { ... }` 块之后，line 665 附近）**：

```scss
    &.agent .msg-content.gateway-notice {
        color: var(--text-secondary, #888);
        background-color: rgba(128, 128, 128, 0.06);
        border: 1px solid rgba(128, 128, 128, 0.2);
        font-size: 0.85em;

        :deep(.markdown-body),
        :deep(.markdown-body p) {
            color: var(--text-secondary, #888);
            margin: 0;
        }
    }
```

> 说明：参考现有 `agent-error`（line 652-665）的 `rgba` 半透明底 + 细边框写法，但用中性灰（非 error 红）。`font-size: 0.85em` 弱化视觉权重。`markdown-body p { margin: 0 }` 去掉段间距使更紧凑。`--text-secondary` 回退 `#888`。

- [ ] **Step 2: 追加 series + inject + 冒烟**

```bash
echo "096-client-groupmessageitem-gateway-notice.patch" >> overlay/patches/series
npm run clean --prefix overlay
npm run inject --prefix overlay
npm run test --prefix overlay
```
Expected: inject 成功；测试全绿。

- [ ] **Step 3: 生成并提交 patch**

```bash
cd upstream/hermes-studio
git diff packages/client/src/components/hermes/group-chat/GroupMessageItem.vue > /tmp/096.diff
# 把内容写入 overlay/patches/096-client-groupmessageitem-gateway-notice.patch
cd /Volumes/nvme2230/lab/ncwk
cd overlay
git add patches/096-client-groupmessageitem-gateway-notice.patch patches/series
git commit -m "feat(chat): render gateway notices compactly in GroupMessageItem

096 patch: 新增 isGatewayNotice；.msg-content 追加 gateway-notice
class + scoped CSS（中性灰紧凑底，参考 agent-error 写法）。"
```

---

## Task 5: 全量验证

**Files:** 无（验证步骤）

- [ ] **Step 1: 干净 inject + 全量测试**

```bash
cd overlay
git checkout main   # 确认在 feat 分支则跳过；本计划分支见 Task 0
npm run clean
npm run inject
npm run test
```
Expected:
- inject 无 `--reject`、无冲突；
- vitest 全绿，含 `gateway-notice.test.ts`。

- [ ] **Step 2: verify-clean 确认 patch 幂等**

```bash
npm run verify
```
Expected: 通过（patch 可重复 apply，无残留手工改动）。

- [ ] **Step 3: 构建冒烟（可选，确认编译通过）**

```bash
npm run build
```
Expected: 构建成功，无 TS/Vue 编译错误（`systemType: 'gateway'` 类型联合已在 094 扩展）。

- [ ] **Step 4: 手动验证（若环境允许运行 gateway）**

触发一次 gateway 关闭（或重启），确认：
1. 运行聊天界面里 `⚠️ Gateway shutting down…` 以紧凑灰条呈现，非大气泡；
2. 群组聊天界面里同样紧凑呈现；
3. **刷新页面（走历史回放）后告警依然被折叠**——验证 normalizeHistoryMessage 入口打标生效；
4. 会话列表的"最后一条消息"预览仍显示 `⚠️ Gateway shutting down…`（role 未变，预览不受影响）。

若无法运行 gateway，跳过本步，依赖 Step 1-3 + 代码评审。

---

## Task 0（前置）：建立 feature 分支

**Files:** 无

- [ ] **Step 1: 基于 main 建 feature 分支**

```bash
cd overlay
git checkout main
git pull origin main 2>/dev/null || true   # 无 remote 则跳过
git checkout -b feat/filter-gateway-shutdown-notice
```

所有 Task 1-4 的提交都在此分支上完成。

---

## 完成后：合入 main

```bash
cd overlay
git checkout main
git merge feat/filter-gateway-shutdown-notice
```

---

## 自检（writing-plans self-review）

**1. Spec 覆盖**：
- §5 打标层（工具函数 + 两入口）→ Task 1（纯函数）+ Task 2（store 接线）。✅
- §6.1 运行聊天渲染 → Task 3。✅
- §6.2 群组聊天渲染 → Task 4。✅
- §7 patch 落地 → 每个 Task 的生成 patch 步骤 + Task 0/合入。✅
- §8 测试 → Task 1 纯函数单测；store 接线测试降级为 inject 冒烟（已在 Task 2 Step 2 说明理由：normalizeHistoryMessage/addMessage 未导出，纯函数已覆盖逻辑正确性）。✅
- §9 验证 → Task 5。✅

**2. 占位符扫描**：Task 2 Step 1 的占位测试已在 Step 2 明确删除并说明理由（不留下空断言测试）。其余步骤均含完整代码/命令。✅

**3. 类型一致性**：`isGatewayNotice`（Task 1）与 `tagGatewayNotice`（Task 1）签名贯穿 Task 2-4 一致；`systemType: 'gateway'` 在 Task 2（类型定义）→ Task 3/4（`systemType === 'gateway'`）一致；class 名 `gateway`（MessageItem）vs `gateway-notice`（GroupMessageItem）有意区分以匹配各自组件现有命名风格（MessageItem 用单 token 如 `system`/`command`；GroupMessageItem 用 kebab 如 `agent-content`/`agent-error`），已在各自 Task 注明。✅
