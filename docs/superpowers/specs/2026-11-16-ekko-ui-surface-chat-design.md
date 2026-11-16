# 对话内声明式界面（Ekko UI Surface）设计

- 状态：implemented（2026-11-16）
- 性质：界面重构批（A2UI 1.0 吸收 + 上游 `ekko-ui/v1` 规划落地第一切片）
- 上游依据：`vendor/hermes-studio/packages/ekko-agent/docs/interactive-ui-plan.md`（782 行规划，此前未实现）
- 文章依据：Google A2UI 1.0（2026-11-11），核心主张＝Agent 发声明式 JSON、宿主用白名单原生组件渲染、视觉归宿主、交互走独立回传通道

## 变更

一句话：让 Agent 在 Studio 单聊里发一块**真正的原生界面**（表单/选择/确认卡），用户一次填完，工具阻塞返回结构化结果，同一 run 继续；不再是「文本气泡 + 一轮轮追问」。

具体落地：

1. **协议核心**（新增 `custom/client/chat/ekko-ui/`）：`ekko-ui/v1` 子集的类型、catalog 白名单、校验（未知组件/属性/动作一律拒绝）、表达式与本地动作 reducer、尺寸限制。纯 TS，无 DOM/Vue 依赖。
2. **Vue 渲染器**（同目录）：递归渲染组件树，组件映射到 Naive UI + Pure Ink token；结构与数据分离（`state` + `bind`），本地动作在客户端执行，只有 `surface.submit` / `surface.cancel` 跨边界。
3. **聊天接入**：`MessageItem.vue` 工具分支内挂 `<EkkoUISurfaceCard>`（新增补丁）；spec 直接取自 `tool.started` 的 `arguments.spec`（完整、未截断），完成态取自工具结果；无需新增消息字段、无需新表。
4. **服务端宿主**（新增 `custom/server/ekko-ui/`）：`SurfaceRuns` 按 turn 绑定 context，`POST /api/studio/surfaces/request` 阻塞等待提交（300s 超时），`ui.surface.action` socket 回填，发布 `ui.surface.presented` / `ui.surface.closed`。
5. **Agent 生产端**：MCP 工具 `ekko_studio_show_surface`（`bin/ekko-studio-mcp.mjs`，照抄 `ekko_studio_clarify` 的阻塞与凭证模式）；同名工具在 `ekko-studio-interaction` MCP 中对 Hermes/Coding Agent 可见。
6. **提示注入**：bridge/coding run 在既有 `taskPlanRunInstruction` 旁追加一条短说明（何时该用表单而非追问），带当前 turn `context_id`。

### 协议（v1 子集）

```ts
interface EkkoUISpec {
  protocol: 'ekko-ui/v1'
  surfaceId: string            // 模型必填，稳定 slug（^[A-Za-z0-9_-]{1,64}$）
  title?: string
  fallbackText: string         // 必填；无法渲染/导出/过期时的安全文本
  state?: Record<string, JSONValue>
  root: EkkoUINode
  submitSchema?: Record<string, JSONValue>  // v1 只做形状与大小校验
}

interface EkkoUINode {
  id: string                   // Surface 内唯一
  type: string                 // 必须在 catalog 白名单内
  props?: Record<string, JSONValue>
  style?: EkkoUIStyle
  bind?: string                // 状态路径，仅输入类组件
  visibleWhen?: EkkoUIExpression
  events?: Record<string, EkkoUIAction | EkkoUIAction[]>
  children?: EkkoUINode[]
}
```

四类消息按上游规划：`createSurface` / `updateComponents` / `updateDataModel` / `deleteSurface` 的线格式，v1 只实现「一次 createSurface 携带完整树」（对应 A2UI 1.0 的 single-message instantiation）；更新与删除留后续。

### Catalog v1（白名单 30 项）

- 布局：`box` `stack` `row` `grid` `scroll` `card` `divider` `spacer`
- 内容：`text` `heading` `code` `badge` `alert`
- 输入：`form` `field` `input` `textarea` `number` `select` `radio` `checkbox` `switch` `range` `date` `time`
- 动作：`button` `button-group`
- 数据：`list` `progress` `table`

不在清单内的组件、属性、事件、动作一律校验失败，卡片显示 `fallbackText` + 可读错误，不静默降级。

### 关键接线

- **身份与关联**：服务端生成 `surface_id = srf:<sessionId>:<spec.surfaceId>`；客户端用同一公式计算，因此「提交」无需先拿到服务端返回。v1 revision 恒为 1，`spec.revision` 缺省或 1，否则拒绝。
- **单挂起约束**：工具阻塞语义决定同一会话同一时刻最多一个挂起 Surface，服务端强制；这是 v1 的显式约束，不是缺陷。
- **状态**：输入组件经 `bind` 写入客户端 state；`visibleWhen` 用有限 AST（literal/state/event/equals/not/and/or）求值；未知 AST 节点拒绝。
- **回填**：客户端发 `ui.surface.action` `{session_id, surface_id, revision, action_id: 'submit'|'cancel', payload}`；服务端校验会话归属、挂起记录、revision、action 白名单后 resolve MCP 调用。
- **历史**：已完成 Surface 从持久化的工具消息参数/结果重建（只读），不需要新表；服务端重启会丢「挂起」态（与 clarify 同级），文档化为 v1 限制。

## 决策记录

- **D1：不另发明协议，落地上游 `ekko-ui/v1` 规划**。仓内已有一份 782 行、与 A2UI 1.0 同构的设计；从零设计会制造第二套词汇。事件名统一用规划里的 `ui.surface.presented/updated/closed`、`ui.surface.action`。
- **D2：生产端走 Studio 自带 MCP 工具，不改 hermes-agent 内核**。对照过两条路：hermes-agent 原生 registry 工具需改 4 个 agent 核心文件 + Python bridge 3 个文件 + 2 个 toolset 清单，patch 面大；MCP 工具只需在既有 `ekko-studio-interaction` 里加一个工具 + 一个服务，鉴权/超时/阻塞全有先例（`ekko_studio_clarify`）。代价：工具名带 MCP 前缀，模型靠指令发现；可接受。
- **D3：spec 用工具调用参数承载，不引入消息字段、不建新表**。`tool.started` 的 `arguments` 出站不截断（只有 `tool.completed` 的 output 截断），且参数随消息持久化；卡片从参数渲染即可覆盖「挂起 + 完成 + 历史」三态。任务计划式「独立快照表 + 合成消息」留到需要跨客户端同步/持久挂起时再做。
- **D4：视觉 100% 走宿主 token，Agent 不能指定颜色/品牌**。沿用 A2UI 1.0 的品牌解耦与上游规划；`style` 只允许枚举化的间距/对齐/色调，渲染到 `--text-*`、`--border-color`、`--msg-assistant-bg`、`--radius-component`、`--spacing-scale`。
- **D5：未知即拒绝，失败显式**。校验失败显示 fallbackText 与错误摘要，不做「删掉未知字段继续画」——那会渲染出含义不同的界面。
- **D6：v1 不做**：`ui_update` 增量补丁、图片/上传、Canvas、密码字段、持久 Surface、多客户端同步、`ui_inspect`。这些都在上游规划的后续阶段，本轮不预埋假入口。
- **D7：不碰审批与澄清**。审批是危险操作门禁，澄清是单问文本；上游规划明确要求二者保持独立，不伪装成普通 Surface。本轮只新增能力，不替换既有交互。

- **D8：回填携带会话自身 profile**。工作台会在多 profile 间切换而不总是重连 socket，实测 `ui.surface.action` 被握手 profile 的会话归属校验拒绝（`Profile "pay-orchestrator" is not available on this connection`）。客户端从 `activeSession.profile` 取值随动作上送，服务端仍与 `session.profile` 真值比对，不放宽归属校验。
- **D9：Surface 不是工具轨迹**。挂起中的工具消息默认被运行指示器从消息流过滤，完成的工具消息默认并入可折叠的「工具调用」组——两者都会藏掉界面。Surface 工具同时豁免这两条过滤（`MessageList.vue`、`tool-run-grouping.ts`），即使「显示工具调用」关闭也始终可见。
- **D10：工具可用性依赖会话 profile 的 MCP 配置**。`ekko-studio-interaction` 必须在会话所属 profile 的 `mcp_servers` 中启用；缺失时 `mcpCapabilities.interaction=false`，服务端不会创建 turn context，Agent 退回普通对话或 clarify。这是环境前提，不是渲染器缺陷；功能清单已登记。

## 任务卡

- **完成条件**：Agent 能在 Studio 单聊里发出 `ekko-ui/v1` 界面；用户一次提交后工具返回结构化结果并继续同一 run；刷新后历史只读卡片仍可见。
- **输入与来源**：MCP 工具参数 `spec`（`tool.started` arguments，随消息持久化）、用户表单填写、会话自身 profile。
- **工作流边界**：仅 Hermes/Coding Agent 的正常 turn（bridge/coding 分支）可用；background delegation、workflow、global-agent、群聊不创建 surface context。
- **工具与副作用**：MCP 工具 `ekko_studio_show_surface` 阻塞等待最多 5 分钟；服务端 `SurfaceRuns` 只存内存挂起态，不落库、不写文件。
- **结果与证据**：工具返回 `{status, surface_id, revision, action_id?, payload?}`；38 例单测、补丁重放、真实会话走查记录见「验证」。
- **异常与恢复**：超时→`expired`；取消/运行结束→`cancelled`；校验失败→`fallbackText` + 错误摘要；服务重启丢挂起态（与 clarify 同级），历史卡片从工具消息重建。
- **验收反例**：未知组件/属性被渲染、HTML/脚本被执行、跨会话回填成功、重复提交二次唤醒 Agent、过期 revision 被接受——任一出现即判失败。

## 验证

- 单测：
  - `custom/client/chat/ekko-ui/__tests__/protocol.test.ts`：合法 spec、未知组件/属性/动作拒绝、重复 id、原型污染路径、尺寸/深度上限。
  - `custom/client/chat/ekko-ui/__tests__/renderer.test.ts`：挂载渲染 text/input/button、`bind` 两向、`visibleWhen`、提交 payload、fallback。
  - `custom/client/chat/__tests__/ekko-ui-card.test.ts`：从工具消息参数解析、running/done 两态、结果损坏时 fallback。
  - `custom/server/ekko-ui/__tests__/surface-runs.test.ts`：begin/request/respond、revision 不匹配、重复提交幂等、超时、abort、单挂起约束、大小限制。
- 类型：`npm run typecheck:client`（若存在）与 `npm run typecheck:harness`。
- 补丁：`npm run inject` 全量重放零失败；`npm run clean && npm run inject` 幂等二连。
- 实物走查（已完成，2026-11-16）：dev 起服（8647/8649），在真实 Hermes 会话（profile pay-orchestrator，glm-5.3）让 Agent 调用 `ekko_studio_show_surface` 发「团建确认」表单。结果：卡片原生渲染（预算数字 + 饮食偏好单选 + 提交），填写 300/中餐一次提交后工具返回 `{status:"submitted", surface_id:"srf:mu3qq82n7p7f00:team-form", revision:1, action_id:"submit", payload:{budget:300,diet:"中餐"}}`，同一 run 继续并总结；刷新页面后历史仍见只读卡片（输入禁用、值 300/中餐）。首轮曾因 profile 缺 `ekko-studio-interaction` 与回填 profile 校验失败暴露两个接线缺口，均已按 D8/D10 修复。
- 实测测试结果：新增 4 个测试文件 38 例全绿；`npm run inject` 全量重放 777-779 零失败且幂等；`npm run typecheck:harness` 零错误；`npm run typecheck:client` 基线保持 19 条（本轮零新增）。
- 守门：`npx vitest run custom/client/__tests__/raw-hex-budget.test.ts custom/client/__tests__/wcag-contrast.test.ts`。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §2.3「协作、审批与检索」：新增一段「统一身份聊天窗支持 Agent 发起的声明式界面（Ekko UI Surface）」——JSON 描述、白名单原生渲染、视觉归宿主、审批与澄清职责不变。
- 新增能力域「对话内声明式界面（Ekko UI Surface）」；`docs/manuals/aistudio-feature-inventory.md` 已登记同名小节（能力、入口、边界、profile 前提）。
- 协议/事件/catalog 是单一事实源，落在本 spec 与 `custom/client/chat/ekko-ui/protocol.ts`；后续改动先改 spec 再改实现。
- 不改变现有聊天消息 schema、任务计划、审批、澄清的行为与契约；不新增数据库表。
- 与上游 `interactive-ui-plan.md` 的对应关系：本批完成其「第一阶段协议核心 + 第三阶段原生 renderer（Vue 版）+ 第四阶段 Studio 闭环」的子集；Canvas、持久 Surface、增量 patch 仍在规划内。
