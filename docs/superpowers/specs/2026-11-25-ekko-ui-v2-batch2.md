# Ekko UI v2 批二：持久化与非阻塞生命周期（C 方案第二切片）

- 状态：in-progress（2026-11-25）
- 性质：能力扩展批。主体是 A 类（`custom/` 下纯新增），另有 B 类补丁两枚：820（MCP 工具）、821（路由挂载、宿主接线与智能体使用说明）；原编号 819/820 与主干已有的 819（follow-redirects 锁文件补丁）撞号，整批后移一位
- 上游依据：`vendor/hermes-studio/packages/ekko-agent/docs/interactive-ui-plan.md`——「Surface 更新」节（单调递增的 revision、乐观并发、按稳定节点 id 的六种补丁）、「Host Interface」节、「持久化」节（`ekko_ui_surfaces` 表）、实施阶段第六阶段（长期 Surface 与 continuation turn）
- 源头依据：ChatGPT 智能界面一手逆向（2026-11-24，本会话）——界面随消息存在；用户状态按部件身份保存；界面与模型通信的唯一通道是发一条新的用户消息；「刷新后状态保留」是它自己没解决的点
- 前序：`docs/superpowers/specs/2026-11-24-ekko-ui-v2-batch1.md`（协议 v2 与表达力）

## 变更

一句话：界面从「阻塞式工具调用期间的临时表单」升级为「可持久、可续改的工件」。智能体创建界面后立即拿到回执继续工作，之后能按节点续改同一块界面；界面和用户填过的值落库，会话重新打开后恢复到最新版本；用户提交时发起一轮新的对话，把结果带回智能体。

具体落地：

1. **协议层**（`custom/client/chat/ekko-ui/protocol.ts`，仍是单一事实源，纯 TS）：
   - 补丁操作六种，照上游定义：`set-props`（改属性）、`set-style`（改样式）、`replace-node`（整节点替换）、`insert-child`（在指定子节点之后插入）、`remove-node`（删节点）、`set-state`（改状态初值）。`applySurfacePatches` 是纯函数，打完补丁对整个规格重新校验。
   - 可修复错误：未知部件时列出全部可用部件，未知属性时列出该部件的属性，未知事件与未知动作同理；`formatValidationErrors` 把前几条压成一句话，因为 MCP 脚本只把响应体里的 `error` 一句话抛给模型。
   - 目录投影 `catalogProjection({ query?, category? })`：部件（类型、类别、说明、属性及其类型与取值、事件、可绑定类型）、表达式种类与写法、各项上限、能力位。
   - 回执摘要 `surfaceDigest`：对规格与状态初值的规范化 JSON 取 32 位散列，只用来识别版本，不作安全用途。续接消息格式 `formatSurfaceTurnMessage`。
   - 工具名识别：`surface_create` 的工具消息渲染为界面卡片；`surface_update`、`surface_inspect`、`surface_close`、`surface_catalog` 是普通工具轨迹。
   - 能力位：`clientCapabilities()` 里 `persistent` 与 `updates` 置真。
2. **服务端**（`custom/server/ekko-ui/`）：
   - `protocol-bridge.ts`：服务端引用协议模块的唯一入口。
   - `surface-store.ts`：内置 `node:sqlite`；库路径 `EKKO_UI_DB` 可覆写，缺省 `underWebUi('ekko-ui-surfaces.db')`；表 `ekko_ui_surfaces`。
   - `persistent-surfaces.ts`：非阻塞宿主，依赖由外部注入（`{ store, resolveTurn, publish }`），提供创建、更新、查看、关闭、保存状态、记录提交六个操作。
   - `persistent-controller.ts`：koa 路由。
   - `SurfaceRuns.resolveTurn`：把当前轮的上下文编号解析成会话，沿用 v1 的活动轮校验。
3. **MCP 工具**（补丁 820，`vendor/hermes-studio/bin/ekko-studio-mcp.mjs`）：新增五个工具，并订正 `ekko_studio_show_surface` 的描述。
4. **挂载与接线**（补丁 821）：`packages/server/src/bootstrap/routes.ts` 挂上路由；`packages/server/src/modules/studio/sockets/chat-run.ts` 把两个能力登记给自定义侧（向会话推事件、解析当前轮会话）；`services/task-plan-runs.ts` 与 `services/clarification-runs.ts` 的两段指令补上 v2 说明。
5. **客户端**（`custom/client/chat/`）：新增 `ekko-ui/surface-sync.ts`（界面登记表、接口调用、套接字订阅）；`EkkoUISurfaceCard.vue` 支持 `surface_create` 的卡片从服务端取最新版本与状态、把状态回存、收到更新事件后重渲染、提交后发起一轮新对话；`EkkoUISurface.vue` 增加初始状态入口并在规格更新时保留用户已填的值。

接口一览（均挂在 `/api/studio/surfaces` 下）：

| 方法与路径 | 调用方 | 入参 | 成功返回 |
|---|---|---|---|
| `POST /create` | MCP，绑定当前轮 | `context_id`、`spec`、`title?` | 201：`surface_id`、`revision`（恒为 1）、`status`、`digest`、`title` |
| `POST /update` | MCP | `surface_id`、`base_revision`、`patches` 或 `spec` 二选一 | `surface_id`、新 `revision`、`digest`、`changed`（受影响的节点 id） |
| `POST /inspect` | MCP | `surface_id`、`node_id?`、`include_state?` | `revision`、`status`、`title`、`digest`、`nodes`（精简结构）、`state?`、`node?` |
| `POST /close` | MCP | `surface_id` | `surface_id`、`status: closed` |
| `GET /catalog` | MCP | `q?`、`category?` | `catalog` |
| `GET /:surfaceId?profile=` | 客户端 | 无 | `surface`（含最新规格、用户状态、状态所对应的版本、最近提交） |
| `PUT /:surfaceId/state` | 客户端 | `profile`、`revision`、`state` | `state_updated_at` |
| `POST /:surfaceId/actions` | 客户端 | `profile`、`revision`、`action_id`、`payload` | `surface_id`、`revision`、`action_id` |

服务端向会话推送三个事件：`ui.surface.presented`（创建）、`ui.surface.updated`（更新，带新版本号与完整规格）、`ui.surface.closed`（关闭）。

明确不在本批：

- 多人同时编辑同一块界面；多个浏览器标签页之间的用户状态实时同步（规格更新会实时推送，状态不会）。
- 每个历史版本的留存、对比与回滚界面。
- 代理运行时侧的历史压缩（让模型的对话历史里只留回执）。这属于上游代理内核，范围外，见 D9。
- 服务端替用户起轮（见 D1）；沙箱逻辑运行时（批三）；小应用逃生舱与度量反馈（批四）。

## 决策记录

- **D1：续接轮由客户端发起，服务端不起轮（与已批准计划的写法不同，请用户知悉）**。核对结果：Studio 会话一轮运行的起点是 `packages/server/src/modules/studio/sockets/chat-run.ts` 里套接字 `run` 事件的处理器（约 1092 行起），它是绑定具体套接字连接的大闭包，取当前登录用户、往该连接回发事件、排队、插件命令分流都在里面。计划里提到的「DM 唤醒、看板派单」先例针对的是网关会话，不是 Studio 的 bridge 与 coding 会话。服务端起轮意味着把这个闭包重构成可复用函数，代价是对一个四千行的上游文件动大手术，且每次升级上游都要重新对位。客户端发起的做法是：用户提交时，客户端用与键盘输入相同的发消息通道发出一轮，消息里带界面编号、版本、动作和提交内容。理由：用户触发提交时客户端必然开着，服务端起轮唯一多出的能力（客户端不在场也能起轮）在这里用不上；源头产品 ChatGPT 的做法正是如此（界面发起新一轮就是发一条普通用户消息）；上游零改动。服务端仍会把每次提交记进库（`result_json` 与提交时间），供查看与审计。
- **D2：时间线锚点沿用工具消息，不引入合成消息**。`patches/777` 把卡片挂载交给自定义函数 `isSurfaceToolName` 判定（`MessageItem.vue`、`MessageList.vue`、`tool-run-grouping.ts` 三处都调它），卡片本身从工具消息取内容。所以只要让这个函数认得 `surface_create`，卡片就出现在智能体创建它的位置，客户端零补丁；界面后来被续改，卡片再向服务端取最新版本。原计划写的「消息只存引用＋兜底文本」在效果上成立：工具结果是精简回执，规格本体在库里。不采用「快照表＋合成消息注入历史」的原因是它要同时改服务端历史加载与客户端消息识别两处上游代码。
- **D3：服务端复用协议模块，经唯一桥接文件引用**。续改要在服务端校验并应用补丁，否则补丁写错只能等客户端渲染时才发现，智能体拿不到可修复的错误；目录工具也需要同一份目录。批一在服务端只做传输级校验、语义校验全在客户端，那个分工在有了「续改」之后不再够用。可行性依据：协议文件头注释写明「纯 TS，无 DOM/Vue 依赖，可在浏览器、Node 与测试中直接使用」；上游服务端编译配置 `packages/server/tsconfig.json` 的 `rootDirs` 含 `../../../../custom`；服务端打包是整体捆绑（`scripts/build-server.mjs`，`bundle: true`），相对引用的 TS 模块会被打进产物。仓内此前没有服务端引用客户端模块的先例，所以把引用收敛到 `protocol-bridge.ts` 一处，并用上游服务端的类型检查命令验证。
- **D4：更新支持补丁与整版替换两种形态，都带基准版本**。补丁省令牌、适合局部续改；整版替换适合结构大改。`base_revision` 与库中当前版本不一致时拒绝并返回 409，错误里带当前版本号，模型可先 `inspect` 再重试。不存每个历史版本，只存当前规格与版本号。
- **D5：界面存独立库文件，不写会话消息表**。`ekko-ui-surfaces.db`，做法与 `custom/server/governance/change-governance-store.ts` 一致（内置数据库、惰性打开、环境变量覆写路径、建表语句带「不存在才建」）。落点在网页端用户数据目录下，因此遵守隔离环境必须设置 `HERMES_WEB_UI_HOME` 的立法。
- **D6：提交后界面保持可用**。持久界面的状态只有 `active` 与 `closed` 两种，提交不改变状态，界面可以反复提交，每次提交都记最近结果并发起一轮。`surface.cancel` 只记录、不起轮——持久模式下没有工具在等这个结果。关闭有两个来源：智能体调 `surface_close`，或用户点卡片上的关闭。
- **D7：五个 MCP 工具走同一个服务与同一个工具集**。都在 `ekko-studio-interaction`、`toolset: plan`，与 `ekko_studio_show_surface` 并列。`surface_create` 绑定当前轮的 `context_id`：服务端用它解析出会话，并沿用 v1 的约束——没有活动轮就不能创建，所以后台子代理与委派任务天然不可用。其余四个不绑定当前轮（后续轮次要能续改），按用户与 profile 归属判定。
- **D8：目录只在协议文件里定义一份**。目录工具由服务端从协议模块投影得到；同时移除 `ekko_studio_show_surface` 描述里硬编码的 v1 部件清单（那是第二份事实源，批一加部件后已经过期）。这里订正批一规格 D4 的一处表述：批一写了「目录发现靠校验器返回允许值清单」，但批一并没有实现列出允许值，错误信息只有「未知组件：X」。本批补上。
- **D9：模型侧只保证工具结果是精简回执**。创建、更新的返回只有编号、版本、摘要，不带规格。工具调用的参数（规格本身）会留在模型的对话历史里，这是代理运行时的行为，本批不改。缓解办法是说明里要求规格保持紧凑、续改优先用补丁。
- **D10：用户状态回存带版本号，规格更新后保留已填的值**。客户端在状态变化后 500 毫秒合并写一次，写的是渲染所依据的版本号。界面被续改时，卡片重建状态以新规格的初值为底，再覆盖用户已有的值；新规格不再绑定的键不再显示。大小上限沿用 32KB。
- **D11：归属判定与失败语义**。界面记录创建时的 profile 与用户。读写都要求请求的 profile 与界面的一致，记录了用户的还要求用户一致；不一致一律返回 404，不泄露界面是否存在。写操作失败一律非 2xx。服务端留一个运行开关 `EKKO_UI_PERSISTENT`，设为 `0` 时创建与更新返回 503，目录与查看不受影响，用于不发版就能回退。
- **D12：批一未做的真实会话走查并入本批**。批一只验证了渲染器与协议层；本批补上智能体经 MCP 工具发界面的端到端路径，并连同本批的三条验收一起走查。

## 任务卡

### 完成条件

智能体在一轮里调用 `surface_create` 后立即拿到回执并继续工作，界面卡片出现在聊天时间线；之后同一会话里调用 `surface_update`，原卡片更新而不新增卡片；用户刷新页面后卡片恢复到最新版本且保留已填的值；用户提交后同一会话发起一轮新的对话，智能体能读到界面编号、版本、动作与提交内容；`surface_close` 后卡片变为只读。

### 输入与来源

工具入参（规格、补丁、基准版本）由智能体产生，一律当不可信输入校验；用户状态与提交内容来自浏览器；会话归属来自当前轮上下文（创建）或界面记录（其余）。

### 工作流边界

创建仅限 Studio 的 bridge 与 coding 会话的正常轮次（与 v1 相同）；更新、查看、关闭在会话仍在的任何时候可用；后台子代理、工作流、群聊不创建。

### 工具与副作用

五个 MCP 工具都是非阻塞的，请求往返即返回。写库的只有创建、更新、保存状态、记录提交、关闭五处，都写 `ekko-ui-surfaces.db`。创建、更新、关闭会向会话的套接字房间推事件。

### 结果与证据

工具返回回执；客户端卡片显示版本号与状态；单元测试、补丁接线标记断言、补丁全量重放、真实会话走查记录见「验证」。

### 异常与恢复

基准版本过期返回 409 并带当前版本号；规格或补丁校验失败返回 422 并带可修复的错误说明；库不可用时写操作返回 503、读操作返回 `available: false`；服务重启后界面仍在库里，卡片重新向服务端取数即可恢复。

### 验收反例

出现以下任一情形即判失败：跨会话或跨 profile 读写到别人的界面；旧版本号的更新被接受；补丁引入未知部件后库里出现非法规格；创建接口在没有活动轮时成功；客户端刷新后用户已填的值丢失；续改后时间线上多出第二张卡片；提交内容超过大小上限被接受；`EKKO_UI_PERSISTENT=0` 时仍能创建。

## 验证

验证项（实现后逐项回填实测结果）：

1. 协议单测（`custom/client/chat/ekko-ui/__tests__/protocol-patches.test.ts`）：六种补丁各自的效果；目标节点不存在、删除根节点、补丁引入重复 id、补丁后超出节点或字节上限时被拒；可修复错误里带可用值；目录投影可按关键词与类别过滤；摘要稳定；续接消息格式。
2. 存储单测（`custom/server/ekko-ui/__tests__/surface-store.test.ts`）：临时库路径下建表、创建、读取、更新、保存状态、记录提交、关闭；库文件落在环境变量指定的位置。
3. 宿主单测（`custom/server/ekko-ui/__tests__/persistent-surfaces.test.ts`）：创建发布 `presented`、更新发布 `updated` 并带新规格、关闭发布 `closed`；版本冲突 409 且带当前版本；归属不符 404；关闭后更新被拒；校验失败 422 且错误文案含可用值；开关关闭时 503；没有活动轮时创建被拒。
4. 路由单测（`custom/server/ekko-ui/__tests__/persistent-controller.test.ts`）：各路由的状态码与响应形状；写操作失败为非 2xx。
5. 客户端单测（`custom/client/chat/__tests__/ekko-ui-card-persistent.test.ts`）：`surface_create` 卡片挂载时向服务端取数；状态变化后合并写回；收到 `ui.surface.updated` 后重渲染；规格更新后已填的值保留；提交后调用发消息通道且文本含编号、版本、动作与内容。
6. 补丁接线标记断言（`custom/server/ekko-ui/__tests__/ekko-ui-patch-wiring.test.ts`）：820 含五个工具的注册与处理器分支；821 含路由挂载、依赖登记与两段指令。
7. 类型：`npm run typecheck:harness` 零错误；`npm run typecheck:client:ratchet` 不超基线；上游服务端类型检查 `tsc --noEmit -p packages/server/tsconfig.json` 零错误。
8. 补丁：`npm run inject` 全量重放零失败，连续两次结果一致。
9. 守门：`raw-hex-budget`、`wcag-contrast` 绿。
10. 全量：合并前 `npm run regress -- --scope merge`。
11. 真实会话走查（批一遗留并入）：起开发服务，在真实 Hermes 会话里走通任务卡「完成条件」的全过程，记录工具回执、刷新前后卡片状态、提交后新一轮的消息原文。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §2.3「协作、审批与检索」：Ekko UI Surface 段补上持久化与非阻塞生命周期（创建即返回、按版本续改、刷新后恢复、提交发起一轮新对话、目录工具）。
- `docs/manuals/aistudio-feature-inventory.md`「对话内声明式界面」行：补五个 MCP 工具、八个接口、落库位置与边界。
- 协议、补丁操作、目录、事件名的单一事实源仍是 `custom/client/chat/ekko-ui/protocol.ts` 与本规格；后续改动先改规格再改实现。
- 不改变阻塞式 `show_surface` 的行为与契约；不改上游数据库结构；不新增 npm 脚本、门禁或账本。
