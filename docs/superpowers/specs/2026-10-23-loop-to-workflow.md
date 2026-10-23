# 「循环」→ 工作流（zcode workflow 范式迁移 + 分布式调度）

- 日期：2026-10-23
- 版本：v1（分支 feat/loop-to-workflow）
- 需求：用户裁定「将"循环"调整为 zcode 的 workflow 功能（参考 zcode 最新源代码迁移），但此处 workflow 要可以调度 SwarmStudio 的分布式 hermes agent 和 matrix 的集群」。

## 调研锚点

- zcode 引擎正本：`upstream/zcode/apps/zcode-cli/packages/dynamic-workflow/src/facade/dts.ts`——`agent(name?, persona?).ask(instructions): Node<T>`（子代理任务、类型化结果）+ `log()` + `report()`；runtime 在 dynamic-workflow-runtime（child 沙箱）。SwarmStudio 取其**调度模型**（声明式步骤×目标×指令），不搬 TS-eval 沙箱（服务端跑任意脚本的安全面与复杂度都不合适 v1）。
- 循环旧面：`/api/loop/loops` 实测恒空（本机零实例、UI 创建入口 V5 已退役）——换面无存量迁移负担。

## 交付

- 服务端 `custom/server/controllers/ia2/workflow.ts`（原生中间件，patch 685）：
  - `POST /api/ia2/workflow/runs` {name, mode: parallel|serial, steps:[{targetKind, ref, instructions}]}：异步执行、201 立即回 running 快照；
  - identity 步 = **本机分布式 hermes agent**：peer dm 协议（ensureBotChat→chat 同步回；超时=queued 不重发）；
  - matrix 步 = **matrix 集群**：网关凭据（resolveMatrixDispatchEnv）+ chat-bridge.matrixSend 直发目标房间指令（远程网关成员原生处理、回复落房）；
  - run 状态机 running→done/partial/failed + 每步 status/reply/eventId/error；落盘 runtime/workflow-runs.json（≤50 原子写）；GET 列表/详情。
- 客户端：`workflow.ts`（API 层）+ `WorkflowPanel.vue`（列表〔30s/4s 自适应轮询〕+ 新建弹窗〔目标=身份下拉 49 在线态/matrix roomId、指令、串/并行〕+ 运行详情〔步卡：状态徽/目标/指令/回执〕）；左栏「循环」区换面「工作流」（行=id+模式+步进度，点击→`?wf=` 详情）；词条 patch 473（filter.loop/groupLoops zh+en→工作流/Workflows）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | 取 zcode 的 agent().ask() 调度范式（声明式步骤×目标×指令），不搬 TS 脚本沙箱 | 用户要的是「可调度分布式 agent」的编排能力；服务端 eval 任意 TS 的安全/复杂度不适合 v1 | 全量搬 dynamic-workflow runtime（否决：v1 过重，留 v2 按需） | 是 |
| 2 | identity 步走 peer dm（复用 identity-chat 通道） | 本机 49 profile 的既有会话通道；与统一聊天同池同语义 | 新建 per-run 会话（否决：与网关会话权模型冲突） | 是 |
| 3 | matrix 步=网关凭据直发房间消息 | 远程网关=矩阵成员（用户第 0 点），其网关矩阵平台原生响应房间指令；web 无需自持 matrix 客户端 | 逐成员开 DM（否决：需建房+邀请两步且成员发现是批 2 面） | 是 |
| 4 | 执行异步推进+轮询（4s/30s），不上 SSE/WS | v1 最简可靠；runner 落盘驱动 | SSE（否决：v2 与 identity-chat 批 2 一并换） | 是 |
| 5 | 左栏循环区整体换面（渲染/词条/路由 ?wf=），旧 loop 数据管道（loopStore/loopRows）保留不删 | 零存量实例（实测空）；保留管道降低回退成本 | 双轨渲染（否决：恒空区无意义） | 是 |

## 验证

- 守门 `workflow.test.ts` 4/4（并行双身份回执/矩阵投递 eventId/校验 400/放行）；
- ia2 双目录 756/756；浏览器端到端（见提交后走查记录）。

## 批 2 ① 补录（2026-10-24，分支 feat/wf-matrix-dropdown）

- matrix 步目标选择器接房间下拉：matrix-room store sortedRooms（与左栏聊天列表同一数据源），选项=房间名（roomId 前 10 位…）；手填 roomId 退役（实测易错且无从发现房间）。

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 6 | 房间源=matrix-room store（复用左栏同源） | 已同步已连接的房间全集；单一事实源 | 独立 API 拉取（否决：重复面） | 是 |

## 残留与移交（批 2 余项）

- 类型化结果（Node<T> 校验）/report() 产物面板、SSE 进度流、按 run 的中止/重跑。
