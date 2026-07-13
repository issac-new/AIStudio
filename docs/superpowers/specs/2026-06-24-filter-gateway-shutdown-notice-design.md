# 折叠 Matrix 聊天界面中的网关关闭告警

**日期**：2026-06-24
**状态**：待评审
**适用项目**：`overlay/`（经 patch 注入 `upstream/hermes-studio`）

---

## 1. 背景

当 `hermes-agent` 的网关关闭或重启时，会向所有活跃聊天会话推送一条系统告警（`upstream/hermes-agent/gateway/run.py:4497`）：

```python
msg = f"⚠️ Gateway {action} — {hint}"
# shutting down: "⚠️ Gateway shutting down — Your current task will be interrupted."
# restarting:    "⚠️ Gateway restarting — Your current task will be interrupted. Send any message after restart and I'll try to resume where you left off."
```

该消息经 socket 以 `role: 'assistant'` 进入 `stores/hermes/chat.ts`，在两个聊天界面里**以普通助手气泡**渲染，占据大块视觉空间、打断对话阅读流。用户反馈希望将其过滤或折叠。

## 2. 目标与非目标

**目标**
- 网关生命周期告警不再以大气泡形式占据聊天正文视觉焦点；
- 改为紧凑的系统提示样式呈现；
- 运行聊天（`MessageList`）与群组聊天（`GroupMessageList`）两个界面同时生效；
- 刷新会话（历史回放）后告警**依然**被折叠，而非仅对当次新消息生效。

**非目标**
- 不彻底丢弃告警（需保留可追溯性，便于用户理解任务为何中断）；
- 不修改 `hermes-agent` 上游推送逻辑（受 `AGENTS.md` 约束，仅可改 `overlay/`）；
- 不改变消息的 `role`（避免连锁影响未读计数、最后消息预览、中断恢复等逻辑）；
- 不引入新的开关/设置项（采用固定行为，B 方案不含可配置开关）。

## 3. 设计决策（已与用户确认）

| 决策点 | 选定方案 |
|--------|---------|
| 处理行为 | **B — 折叠成紧凑系统提示**（保留消息，渲染为小灰条，不丢弃） |
| 折叠样式 | **B1 — 复用现有 system/command 气泡样式**（紧凑灰条，不新增独立 CSS 组件） |
| 覆盖范围 | **范围3 — 运行聊天 + 群组聊天两者都处理** |
| 识别策略 | **C1 — 文本前缀匹配打标**（新增 `systemType: 'gateway'` 标记） |

## 4. 整体架构与数据流

```
hermes-agent gateway shutdown
   │  (发出 "⚠️ Gateway shutting down — ...")
   ▼
socket 入站 (handlePeerUserMessage / streaming delta)  ──┐
                                                          │
历史消息回放 (normalizeHistoryMessage)  ──────────────────┤
                                                          ▼
                                    【打标层 - 新增】
                          isGatewayNotice(content) 命中?
                                   │ yes
                                   ▼
                  message.systemType = 'gateway'   (新增 systemType 枚举值)
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                          ▼
   MessageList.vue (run chat)              GroupMessageList.vue (group chat)
   displayMessages 仍显示该消息             displayMessages 仍显示该消息
              │                                          │
              ▼                                          ▼
   MessageItem.vue / GroupMessageItem.vue 命中 systemType==='gateway'
   → 渲染为紧凑系统提示(B1: 复用 system/command 气泡样式)
```

**关键设计原则**：在数据层（chat store）打标记，渲染层只读标记。职责清晰，且改动集中。

## 5. 打标层（数据层）

文件：`packages/client/src/stores/hermes/chat.ts`（经 `094` patch 注入）

### 5.1 新增识别工具函数

**先扩展类型**：`Message` 接口的 `systemType` 联合类型（`chat.ts` line 53）需加入新值：

```typescript
systemType?: 'command' | 'error' | 'fork-divider' | 'gateway'
```

**新增识别函数**（放在 message 归一化辅助函数附近）：

```typescript
// 网关生命周期告警（shutdown/restart）— 由 hermes-agent gateway 在关闭时推送，
// 本质是系统事件而非对话内容。命中即打 systemType: 'gateway' 标记，渲染层折叠为紧凑系统提示。
const GATEWAY_NOTICE_RE = /^⚠️\s*Gateway\s+(shutting down|restarting)\b/i

function isGatewayNotice(content: unknown): boolean {
  const text = typeof content === 'string' ? content.trim() : ''
  return text.length > 0 && GATEWAY_NOTICE_RE.test(text)
}
```

- 匹配 `⚠️ Gateway shutting down` / `⚠️ Gateway restarting` 两种变体；
- `⚠️` 与 `Gateway` 间允许任意空白，兼容未来微调；
- `i` 标志零成本容错（虽不期望大小写问题）。

### 5.2 两个打标入口

| 入口 | 位置 | 改动 |
|------|------|------|
| 历史回放 | `normalizeHistoryMessage`（~line 426-438，`displayRole` 判定后） | `systemType` 计算时：若 `isGatewayNotice(displayContent)` 命中则置 `'gateway'`，否则沿用现有 `command`/`undefined` 逻辑 |
| 入站事件 | `addMessage`（所有消息进 store 的唯一收口，~line 1325） | 写入前兜底：若新消息 `systemType` 未显式设置（`undefined`）且 `isGatewayNotice(content)` 命中，则置 `'gateway'` |

**为什么用 `addMessage` 兜底而非逐处改**：`addMessage` 有十几处调用点（peer 消息、流式 assistant、tool error、command 事件…），逐处改极易遗漏。在收口处兜底最稳，且附加约束**只对未显式指定 `systemType` 的消息生效**——已显式为 `'error'`/`'command'` 的消息优先级更高，不会被误改。

两条路径（历史回放走 `normalizeHistoryMessage`，实时入站走 `addMessage` 兜底）全覆盖、互不冲突。

## 6. 渲染层

### 6.1 运行聊天 — `MessageItem.vue`（经 `095` patch 注入）

- `MessageList.vue` 的 `displayMessages` 过滤器**保持显示**网关告警（不滤除——该过滤器默认保留所有 `assistant` 消息）；
- `MessageItem.vue` 改动（基于其现有结构精确落地）：
  - 新增计算属性 `isGatewayNotice`：`props.message.systemType === 'gateway'`；
  - 在 `message-bubble` 的 `:class` 上追加 `gateway: isGatewayNotice` 标志——复用现有 `system`/`command` 的紧凑灰底气泡 CSS（不新增样式组件）；
  - 内容分支：在 `isCommandMessage` 分支**之前**插入一个 `v-if="isGatewayNotice"` 分支，用 `MarkdownRenderer` 直接渲染 `message.content`（**不带** slash-command 的 `/` 图标，因为 `⚠️ Gateway…` 不是斜杠命令）。其后 `v-else-if` 链保持原有 `isStatusCommand` / `isCommandMessage` 分支不变；
  - 文案自带 `⚠️`，无需额外图标。

### 6.2 群组聊天 — `GroupMessageItem.vue`（经 `096` patch 注入，必要时含 `GroupMessageList.vue`）

> 注意：`GroupMessageItem.vue` 与运行聊天的 `MessageItem.vue` 结构不同——它**没有** `system`/`command` 分支，所有非 tool 消息都走 `v-else` 的气泡渲染（`isAgent` / `isSelf` / `isAgentError`），通过 `.msg-content` 上的 class 标志区分样式。因此"复用 system 样式"在此处不适用，需采用平行于 `agent-error` 的标志方案。

- `GroupMessageList.vue` 的 `displayMessages`（line 14）**保持显示**网关告警（不过滤）；
- `GroupMessageItem.vue` 改动（基于现有结构精确落地）：
  - 新增计算属性 `isGatewayNotice`：`props.message.systemType === 'gateway'`；
  - 在 `.msg-content` 的 `:class` 上追加 `'gateway-notice': isGatewayNotice`（平行于现有 `'agent-error': isAgentError`）；
  - 新增 scoped CSS `.gateway-notice`：紧凑灰底小字样式（参考 `agent-error` 的 `rgba` 半透明底 + 细边框写法，但用中性灰色调而非 error 红），弱化视觉权重；
  - 可选优化：`isGatewayNotice` 为真时隐藏 `msg-header`（sender name）与 `message-meta`（时间/语音/复制按钮）——告警无需归属某人、也无需这些操作，进一步压缩占位。此项为可选，若实现成本高可保留 meta。

### 6.3 有意保留的行为

`role` 保持 `assistant`，因此：
- ✅ 未读计数、`lastVisibleMessage` 预览（会话列表"最后一条消息"）**不受影响**——告警仍作为最后消息被预览，用户在会话列表能看到 `⚠️ Gateway shutting down…`，知晓该会话发生中断；
- 仅在进入聊天正文后，它不再以大气泡占据视觉焦点。

## 7. Patch 落地

遵循 `AGENTS.md`：仅修改 `overlay/`，经 `npm run inject` 注入 upstream，不触碰 `upstream/`。

| 序号 | patch 文件 | 改动 |
|------|-----------|------|
| 094 | `094-client-store-chat-gateway-notice.patch` | `chat.ts`：`GATEWAY_NOTICE_RE` + `isGatewayNotice()`；`normalizeHistoryMessage` 打标；`addMessage` 兜底打标 |
| 095 | `095-client-messageitem-gateway-notice.patch` | `MessageItem.vue`：新增 `isGatewayNotice` 计算属性；bubble `:class` 追加 `gateway` 标志复用 system/command 紧凑样式；内容分支用 `MarkdownRenderer` 渲染（不带 `/` 图标） |
| 096 | `096-client-groupmessageitem-gateway-notice.patch` | `GroupMessageItem.vue`：新增 `isGatewayNotice`；`.msg-content` 追加 `gateway-notice` class + 新增 scoped CSS（紧凑灰底）；可选隐藏 header/meta |

三个 patch 均追加到 `overlay/patches/series` 末尾。

**分支管理**：基于 `overlay` 仓库 `main` 建 `feat/filter-gateway-shutdown-notice` 分支，完成测试验证后合回 `main`。

## 8. 测试策略

参考现有 patch 055-060 的 Matrix 测试约定（位于 `overlay/custom/`）。

### 8.1 打标函数单测（核心）

- `⚠️ Gateway shutting down — Your current task will be interrupted.` → 命中；
- `⚠️ Gateway restarting — Your current task will be interrupted. Send any message...` → 命中；
- 前导/多余空白 → 命中；
- 普通助手对话（如 `⚠️ Gateway 这个词真有意思`）→ **不命中**（前缀后必须紧跟 `shutting down`/`restarting`）；
- 已显式 `systemType: 'error'` 的消息 → **不被 `addMessage` 兜底改写**为 `gateway`。

### 8.2 渲染分支测试

用 vitest + `@vue/test-utils` mount `MessageItem`，传入 `systemType: 'gateway'`，断言渲染出 command 紧凑样式类、而非普通气泡容器（与现有 060 message-actions 测试风格一致）。

## 9. 验证步骤

1. `npm run inject` 成功，无 patch 冲突；
2. `npm run test`（vitest）全绿，含新增用例；
3. 手动验证（若环境允许）：触发一次 gateway 关闭，确认两个聊天界面告警均以紧凑系统提示呈现；刷新页面（走历史回放）后告警**依然**被折叠——这是验证"历史回放入口也打标"的关键点。

## 10. 风险与边界

| 风险 | 评估 |
|------|------|
| 误伤正常对话 | 低。`⚠️ Gateway shutting down`/`restarting` 前缀极特异，正常对话不会触发 |
| 未来文案变更 | 需更新一处正则（`GATEWAY_NOTICE_RE`），改动面小 |
| 影响既有逻辑 | 无。`role` 不变，未读计数/预览/中断恢复等全部不受影响 |
