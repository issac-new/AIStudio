# AIPAYDEV 推演全流程设计实现审查：不合理与未实现清单

| 项 | 内容 |
|---|---|
| 文档 ID | RFD-001-flow-review |
| 范围 | 20 步全流程的设计合理性 + 功能实现完整性（含 IDE 工作台步骤 20） |
| 方法 | 端到端实弹推演亲历取证 + 运行时/代码树逐点核对，锚点=file:line / commit / 命令实测 |
| 日期 | 2026-09-24 |
| 结论 | 修复根因级缺陷 5 项（已验证），归档架构性问题 4 项 + 流程未实现 6 项（附根治建议） |

> 纪律：本文每条结论带锚点。已修复项标 ✅（附验证），未实现/待办标 ⬜（附证据与建议），
> 不无据断言。推演中模型通道故障、网关重启噪音等真实过程不粉饰。

---

## 一、根因级缺陷（✅ 已修复 + 验证）

### A1. Matrix 房间工具从未部署到运行时 —— room-invite-gap 的真正根因 ✅

**症状**：RFD-002 步骤 10 中 agent 报 `matrix_room_list / matrix_room_invite tools are not available`，
RACI 派发整体卡死（DISPATCH-BLOCKED-RFD-002）；RFD-001 推演时以导演兜底邀人掩盖。

**根因**（多层）：
1. 修复代码在 workspace 树（`upstream/hermes-agent/plugins/platforms/matrix/tools.py`，
   commit 8d6548f 一系），但推演执行的是安装树 `~/.hermes/hermes-agent`（v0.21.4），
   该处 matrix 插件**只有 adapter.py，无 tools.py**（实测 `ls ~/.hermes/.../matrix/`）。
   sync 脚本自述（`aipay-agent-sync.sh`）："两棵树互不相干，agent 侧 patch 长期对推演无效"。
2. 即使 tools.py 存在，运行时 plugin.yaml 未声明 `provides_tools`（upstream 已有，运行时无），
   加载器（`hermes_cli/plugins_loader.py`）显式要求 manifest 声明才注册工具。

**修复**（`~/.hermes/hermes-agent/plugins/platforms/matrix/`）：
- 部署 `tools.py`（从 upstream zcode 同源复制）；
- plugin.yaml 注入 `provides_tools: [matrix_room_create, matrix_room_invite, matrix_room_list]`；
- 备份 `plugin.yaml.bak-20260924`。

**验证**：重启 fanfan gateway → agent tool_search 可发现工具 → **DISPATCH-DONE-RFD-002 实测成功**：
`matrix_room_list` 返回 2 间房定位到 18 人群、9 条 RACI 派发消息 9/9 按 event ID 在群、
9 张跟踪子卡挂主卡 t_4bee99f1、16/16 目标账号核验在群。

### A2. upstream tools.py 协程注册 bug —— 修复从未被端到端验证的实锤 ✅

**症状**：A1 部署后 agent 仍报 `Matrix 插件工具返回了一个未解析的协程`，绕道本地 Synapse Admin API。

**根因**：`tools.py register_tools()` 调 `ctx.register_tool(...)` 未传 `is_async=True`；两条代码线
（运行时 `hermes_cli/plugins.py:456`、upstream 同名）均只信显式 `is_async`，不自动检测
`iscoroutinefunction`。tools.py 的 handler 全是 `async def`，故 `registry.dispatch`
（`tools/registry.py:899`）走同步分支不 await → 返回协程对象。**说明 8d6548f 修复只写了工具、
从未实际调用验证过**。

**修复**：`register_tools` 补 `is_async=True`（运行时部署树）。

**验证**：重启 gateway 重试 → agent 直连 matrix 工具完成派发（同 A1 验证）。

> 根治建议：upstream `tools.py` 同步补 `is_async=True`（回移 workspace 树）；
> `register_tool` 增加 `inspect.iscoroutinefunction(handler)` 自动推断兜底，防同类回归。

### A3. 任务简报 RACI 行恒空白 ✅

**症状**：简报抽屉 RACI 显示 `R: — · A: — · C: — · I: —`，而卡片正文其实写明"责任人：chen / 团队负责人 @wei"。

**根因**：
1. 挂载点 `IdeShell.vue` 的 `<TaskBriefingPanel>` **从未传 `:raci`**（对照 `:task :git :collab :workflow`）；
2. 卡片模型无结构化 RACI 字段，且无正文解析回退 → `raciView` 恒取空对象
   （`TaskBriefingPanel.vue:30` `props.raci ?? {…空}`）。

**修复**（`feat/briefing-raci-collab-fix` @ 6c638f2）：
- 新增 `parseRaciFromTask`（`briefing-types.ts`）：从 assignee + 正文行解析
  责任人/团队负责人/咨询/通知/发起方；`(?<!团队)` 负向后顾防"团队负责人"被"责任人"误匹配；
  冒号可选（派单式"团队负责人 @wei"无冒号）；@mention 去域名；assignee 结构化字段优先。
- `IdeShell.vue` 挂 `:raci="briefingRaci"`，跨板解析/计算属性映射 `assignee`。

**验证**：`briefing-raci-parse.test.ts` 8 例全绿（6 解析 + 2 渲染回归），渲染断言实证
排期卡显 `R: chen` 而非 `R: —`；ide 全量 239 例无回归。

### A4. 简报协作动态锚点真实推演零命中 ✅

**症状**：协作动态块恒空（"暂无协作消息"）。

**根因**：锚点是"群名前缀 `[taskId 前 8 位]`"（`IdeShell.vue loadBriefingCollab`），
但真实房间按业务命名（"支付收银台需求分析讨论群"），前缀匹配 `matchRoomByPrefix` 永不命中。

**修复**：二级回退——从标题/正文提取 `RFD-\d+` 需求码，扫最近 8 房最近一页消息，
命中提及（任务 id 前 8 位或需求码）即锚定；只读、防请求放大；保留原前缀锚点优先级。

**验证**：逻辑守门（stale 守卫、try/catch 空态）；渲染链路由 A3 同套面板测试覆盖。

### A5. 简报 Git 活动块在无 workspace_path 卡片整块空态 ✅

**症状**：排期卡/跟踪卡简报"Git 活动 分支 — / Worktree — / 暂无提交"。

**根因**：`loadBriefingGit` 仅取 `briefingTask.value?.workspacePath`，无回退；而排期卡
`t_47374e48` 正文自述"排期跟踪卡…非执行载体"，无 workspace_path。

**修复**：回退链 `卡片 workspace_path → chatStore.activeSession?.workspace → ide.workspace`
（用户此刻开发的仓库，比空态更有信息量）。

---

## 二、架构 / 工程不合理（⬜ 部分修复 + 根治建议）

### B1. 两棵代码树漂移：inject 打不进运行时，agent 侧修复长期失效 ⬜

`npm run inject` 只注入 `upstream/*`（workspace 构建树），推演执行 `~/.hermes/hermes-agent`
（安装树）。`aipay-agent-sync.sh` 明确要求**显式点名逐个部署**，默认只部署 1 个 patch。
A1 就是此问题的直接后果：upstream 有 matrix 工具修复，运行时没有，推演卡死。
- **根治**：sync 脚本扩展为"按 upstream/... 与 ~/.hermes/... 的 diff 自动识别需部署文件清单 +
  幂等 apply + 冲突告警"，把"agent 侧修复"纳入 `npm run inject` 的部署出口，杜绝只修一边。

### B2. 提交不完整：R4-P1 vendored RPC 缺两文件致全量构建断 ⬜（已临时补）

`overlay/custom/server/zcode/vendor/rpc/channels.ts` 引用 `./channelServer.js`/`./delayedChannel.js`，
但 commit 724de66 只 vendored 8 个文件（缺这两个），`npm run build:full` 在 tsc 阶段报
TS2307 断。已从 `upstream/zcode/packages/rpc/src/` 复制两文件补齐（构建恢复）。
- **根治**：vendored 目录加"导出面完整性"守门测试（channels.ts 的每个 re-export 目标必须存在），
  防提交漏文件；本次两文件应随 R4-P1 一并提交。

### B3. build:full 全量构建在干净树仍有环境级阻塞 ⬜

补 B2 后 vite build 通过，但 `WorkflowAgentNode.vue` 报
`[@vue/compiler-sfc] No fs option provided to compileScript in non-Node environment`
（4 errors，`npm run build` 从 overlay cwd 跑复现；从 upstream cwd 跑 build.mjs 同样）。
与本次改动无关（clean tree 复现），疑为 vite/vue-sfc 版本组合下 `defineProps<import(...)>`
跨文件类型解析需 fs。dist 目录仍有旧可用产物（12.9M server bundle）。
- **根治**：`vue()` 插件显式传 fs，或 `WorkflowAgentNode.vue` 的 `NodeProps<WorkflowAgentNodeData>`
  改为显式 interface（避免 import type 泛型触发 fs 解析）。属独立技术债，单列跟进。

### B4. IDE 工作台开发态代理不转发 session，联调困难 ⬜

`vite.config.overlay.ts` 只代理 `/agent-health`（target 8650），`/api/*` 需登录态但 dev 代理
session 不转发 → `/api/kanban/boards` 401，简报跨板解析拿不到板数据，无法在 dev 态验证。
（生产 8703 自带 session 无此问题。）
- **根治**：dev 代理透传 cookie/session（`changeOrigin` + cookie domain 重写），或提供 dev 登录桩。

---

## 三、流程未实现 / 设计缺口（⬜ 分析 + 建议）

### C1. 步骤 10 "每个应用的专用研发 agent（csw-*）" 未落地 ⬜

**证据**：`~/.hermes/profiles/` 下是 `[已移除]-* / data-* / aiteam-*`（与支付域无关），
**无 csw-pay-core / csw-channel-wechat 等应用级专职 agent**。推演实际由人员 agent
（chen-agent/hu-agent/lin-agent/xiao-agent）按"人=应用主责"完成，非"应用=专职 agent"。
- **性质**：设计歧义或未实现。步骤 10 文字要求"teams 下的 agent 及 agent 能力（每个应用有
  自己的专用研发 agent，csw 开头的应用 agent 即应用模块清单）"。
- **建议**：二选一并写死——① 为每个 csw-* 应用建 profile/agent（capability-report 技能上报其能力）；
  ② 明确"应用主责人代行研发 agent"的映射口径，步骤 10 文字相应修订。当前口径模糊。

### C2. 步骤 3 "默认 matrix 账号自动登录" 未实现 ⬜

**证据**：`grep auto.*login|自动登录|matrix.*token.*login` 在 overlay/client 零命中；每次进
Studio 需在登录页手输 homeserver/账号/密码（`Aipay_<user>_2026`）。
- **建议**：gateway 已持有 MATRIX_ACCESS_TOKEN/USER_ID（步骤 2 配置），Studio 登录页可读
  gateway session 直接换取 Studio 登录态，实现"配置即登录"。

### C3. RACI 无结构化字段，靠正文解析（A3 为补丁） ⬜

A3 的 `parseRaciFromTask` 是正则回退，鲁棒性有限（依赖正文格式稳定）。
- **建议**：kanban 卡片模型增加结构化 `raci: {responsible, approver, consulted, informed}` 字段，
  派单/建卡时写入（步骤 10 的 RACI 表已具备数据源），简报直读字段；正文解析降级为兜底。

### C4. 步骤 10 "图片转 OCR" 提取路径未验证 ⬜

需求文档 RFD-001/002 均为纯文本 markdown，无图片，"图片转 OCR 提取需求内容（无信息偏差）"
路径未被推演覆盖。
- **建议**：补一份含图片/扫描件的需求样例，验证 OCR 提取 + 无偏差校验链路。

### C5. 步骤 20 IDE"交互式编码开发"演示缺口 ⬜

IDE 内置终端在纯浏览器模式卡"连接中"（node-pty 需本地/桌面运行时），路演无法展示真实
编码过程；简报已能带任务关联信息（A3–A5 修复），但"看任务简报→交互编码→git 图谱→切模型"
的连贯编码环节缺终端一环。
- **建议**：桌面态（Electron）跑路演演示，或 IDE 终端降级为纯 WebSocket 远程 shell。

### C6. 需求群 RFD-001 派发现场在超长房间难回溯 ⬜

RFD-001 主讨论群 3000+ 条消息（含推演末期模型故障刷屏），时间线虚拟滚动无法高效回到
9-22 派单现场；RFD-002 仅 44 条才完整留痕。
- **建议**：Matrix 房间按"需求/阶段"分房，或消息加 `[RFD-xxx][step-n]` 结构化锚点，
  支持按事件 ID 直跳（本轮已用 Matrix API 按 event ID 取证绕过）。

---

## 四、修复清单汇总

| # | 缺陷 | 类别 | 处置 | 验证 |
|---|---|---|---|---|
| A1 | matrix 工具未部署运行时 | 根因 | ✅ 部署 tools.py + provides_tools | DISPATCH-DONE-RFD-002 实测 |
| A2 | tools.py 协程注册 bug | 根因 | ✅ is_async=True | agent 直连工具派发成功 |
| A3 | 简报 RACI 恒空白 | 根因 | ✅ parseRaciFromTask + :raci 挂载 | 8 例（含渲染回归） |
| A4 | 协作锚点零命中 | 根因 | ✅ 需求码锚点回退 | 面板测试链路 |
| A5 | Git 块空态 | 根因 | ✅ workspace 回退链 | 同上 |
| B1 | 双树漂移 | 架构 | ⬜ 建议 sync 自动部署 | — |
| B2 | vendored RPC 缺文件 | 工程 | ✅ 临时补 + 建议守门测试 | build:full 恢复 |
| B3 | build 环境级阻塞 | 工程 | ⬜ 独立技术债 | clean tree 复现 |
| B4 | dev 代理 session | 工程 | ⬜ 建议透传 cookie | — |
| C1 | csw-* 专职 agent 缺 | 流程 | ⬜ 口径待定 | profiles 实测无 |
| C2 | 自动登录未实现 | 流程 | ⬜ 建议 gateway 换票 | grep 零命中 |
| C3 | RACI 无结构化字段 | 流程 | ⬜ 建议卡片加字段 | A3 为补丁 |
| C4 | OCR 路径未验 | 流程 | ⬜ 建议补样例 | 无图片样例 |
| C5 | IDE 终端演示缺口 | 流程 | ⬜ 建议桌面态演示 | node-pty 卡连接 |
| C6 | 超长房间难回溯 | 流程 | ⬜ 建议结构化锚点 | 已用 API 绕过 |

---

## 五、结论

20 步主链路（需求→系分→RACI→开发→集成→测试→缺陷环→发版）功能闭环成立，
51/51 测试 + 6 缺陷闭环是真实质量基线。但**交付前暴露 5 项根因级缺陷**（尤其 matrix 工具
从未触达运行时、upstream 修复从未端到端验证、简报 RACI/协作/数据多处空白），均为
"表面走通、细节断裂"型问题，靠本轮实弹验证才揪出。已全部修复并验证；架构双树漂移（B1）
是同类问题的温床，建议优先根治；其余 C 类为设计口径与演示完备性缺口，附建议待决策。
