# IDE 工作台待办清零（G4/G6/G7）与 zcode 3.15.3 对齐（2026-10-18）

**主旨三句话**：把上一轮矩阵里明确挂账的四类能力——交付物评审（G4）、Gen UI 与远程工作区（G6）、分享增强与插件目录（G7）——做成 IDE 内可用、可测、可回退的功能；同时把 zcode 源码基线升到公开仓库最新（v3.15.1）并以安装版 3.15.3 的实包做增量核对。受众是 IDE 日常使用者与后续维护者，读完应能验收每个页签的行为与边界。

## 一、zcode 3.15.3 对齐（事实与边界）

公开仓库 `zai-org/zcode` 最新只到 **v3.15.1**（`git ls-remote --tags` 实核：v3.14.3、v3.15.1；GitHub API 同样只有这两个 tag；remote 仅 main + feat/ui-plugin）。安装版 3.15.3（`Info.plist` 3.15.3 / build 8237）是**未公开源码的构建**，因此"把源码 checkout 到 3.15.3"在公开渠道不可执行。

本轮采用可复核的替代：把本地源码基线固定在 `origin/main`（v3.15.1，已实核 `package.json:3`），并从安装包 `app.asar` 提取 3.15.3 的渲染层产物做增量核对：

- i18n 键差集：3.15.3 包内 6370 个点号命名键 vs 3.15.1 源码 6362 键，**新增 8 键**：`chat.captcha.verifyFailed`、`chat.error.action.retryCaptcha`、`manualClaimPlan.banner.bonus`、`manualClaimPlan.banner.period.daily`、`manualClaimPlan.banner.period.oneTime`、`manualClaimPlan.claim.failure.captcha`、`settings.memory.viewer.disabled`、`zcode.error.providerBusiness.3007`。
- V4 协议方法：3.15.3 包内 35 个 vs 3.15.1 源码 36 个，差集只有 `v4/session/import`（本仓 overlay 002 补丁新增，安装包自然没有）——**3.15.2/3.15.3 未新增协议方法**。
- 结论：3.15.2/3.15.3 是本仓可观测面的补丁级变化（验证码/套餐领取/记忆查看器禁用态/供应商业务错误 3007），无新能力族；IDE 侧需要吸收的是错误码 3007 的提示映射与"记忆查看器禁用"的诚实空态，其余不改变。

## 二、G4 交付物面板（页签 `deliver`）

一个页签收齐当前会话的交付证据，数据全部来自已有只读面：

1. **计划**：取消息流最近一次 `taskPlan`，显示完成/总数与未完成步骤。
2. **变更**：复用 `fetchWorkspaceRunChangesForSession` + `digestRunChanges`，按 run 显示文件数/±行数/文件清单，可打开文件或跳转审查页签。
3. **验证**：扫描 message 里 `bash/shell/exec` 类工具调用，筛出测试/构建/类型检查/ lint 命令（`vitest|pytest|npm test|npm run build|tsc|go test|cargo test|make test|eslint`），显示命令、状态（done/error/running）与最近一次结果摘要。
4. **产物文件**：从变更文件里挑出文档/数据/演示类扩展名（md/docx/xlsx/pptx/pdf/csv/html），作为"交付物"单列。
5. **评审门**：本地"通过/退回"两态 + 退回意见；退回时把意见作为一条真实消息发到当前会话（不伪造后端评审状态），本地标记仅在本页签展示并持久化到 sessionStorage。
6. **复制/发送摘要**：一键把上述证据拼成 markdown，复制或发送到会话。

边界：只读聚合，不改变 run/审批/任务状态；没有后端评审记录时不显示假"已通过"。

## 三、G6 Gen UI 面板（页签 `genui`）

对齐 zcode 3.15.1 `packages/ui/src/gen-ui` 的 `::visualize` 契约（`domain/references.ts`、`CONTRACT.md`）：

- 解析当前会话 assistant 消息里的 `::visualize{path="..." title="..." mode="wide|fullscreen"}` 与 JSON 变体 `::visualize{"path":...}`；忽略代码块内的示例、相对路径、URL、含 `..` 的路径（与上游 `collectGenUiSourcePaths` 同口径）。
- 只接受工作区内绝对路径；经既有 `readFile(path, root)` 读取，单文件上限 512 KiB；路径解析后必须仍在工作区根内（前缀校验 + 拒绝 `..`）。
- 渲染：`<iframe sandbox="allow-scripts" srcdoc="...">`，无 `allow-same-origin`、无 `allow-top-navigation`；注入 CSP `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: blob:;`。全屏按钮只改本地布局。
- 列表展示所有引用（标题/路径/时间），点击预览；空态说明如何让 agent 产出（`::visualize{path="..."}`）。

## 四、G6 远程工作区面板（页签 `remote`）

Hermes 的 `FileProvider` 已支持 `local | docker | ssh | singularity`（`packages/server/src/modules/studio/services/files/file-provider.ts:803`，配置读 `$HERMES_HOME/config.yaml` 的 `terminal.*`，SSH 读 `.env` 的 `TERMINAL_SSH_*`），文件与终端 API 会随 backend 自动切换。本轮把这个既有能力在 IDE 里显性化：

- 新增只读端点 `GET /api/ide/remote/status`：返回当前 profile 的 backend、docker 容器/镜像、cwd、SSH host/user/port/key 是否配置（**不返回 key 内容/口令**）、以及探针结果（用 `createFileProvider(profile).stat(cwd || home)`，带 8s 超时；失败返回结构化 code，不 500 抛栈）。
- 新增只读端点 `GET /api/ide/remote/list?path=`：用同一 provider `listDir` 列目录（上限 200 条），供面板浏览远端根；**不提供写/删/上传**。
- 客户端面板：backend 徽标、探针状态、SSH/Docker 配置是否就绪、cwd、远端目录列表；配置未就绪时给"需在 config.yaml/.env 配置"的说明与可复制模板（不在 IDE 内改服务端配置文件，避免误改/泄密）。
- 边界：远程**执行**（agent 会话跑在远端）仍需引擎/终端支持，本轮只交付文件浏览与连接诊断；WSL 不在 Hermes BackendType 内（Windows-only），明确标注未支持。

## 五、G7 分享增强（页签 `deliver` 内 + 会话分享入口）

- 会话分享入口保留既有 `session-share` 创建链接，但按服务端 `stub: true` 如实标注"当前为本地占位链接，prompt 通道未接线"，不再让用户误以为可实时协同。
- 新增**选段导出**：在交付物面板选择消息区间（起止序号/角色/摘要），导出 markdown 或 JSON 文件（客户端 Blob 下载）；导出内容包含角色、时间、正文、工具名与 tool 结果摘要（不含附件二进制）。
- 新增**深链复制**：`#/app/ide?session=<id>` 一键复制，导入续作沿用既有历史导入通道（不在本轮扩展）。

## 六、G7 插件目录（页签 `plugins`）

- 聚合三源：Hermes skills（`fetchSkills`，含类别/启用态）、MCP servers（`fetchMcpServers`，含工具数/状态）、zcode 插件目录（`$ZCODE_HOME` 下已知 plugins 目录的文件名/版本清单，只读）。
- 支持 skills 启停（`toggleSkill`）与 MCP 重载/测试（`mcpReload`/`mcpServerTest`）——全部走既有 API，不新增写面；zcode 插件只列不装（安装需宿主/引擎通道，标注）。
- 搜索/分类过滤；空态说明。

## 决策记录

- D-1：zcode 源码固定在公开最新 v3.15.1，不伪造 3.15.3 源码。理由=公开 tag/branch 实核只有 v3.15.1；3.15.3 是未公开构建，无法取得源码。以 app.asar 产物做可复核增量，而不是把 3.15.1 改名成 3.15.3。
- D-2：3.15.3 增量只吸收 IDE 可观测面的两处（供应商业务错误 3007 映射、记忆查看器禁用空态），其余 6 键属于验证码/套餐领取，不在 IDE 工作台出现。理由=避免为不存在于本 UI 的词条造死代码。
- D-3：交付物面板只读聚合，评审门只做本地标记 + 真实消息回流。理由=没有服务端评审记录时不伪造"已通过"；退回意见必须是真实可送达的消息。
- D-4：Gen UI 只接受工作区内文件路径，sandbox 不开 same-origin，加 CSP 与 512 KiB 上限。理由=`::visualize` 内容来自模型输出，等同不可信 HTML；沙箱与路径约束是硬边界。
- D-5：Gen UI 不做内联消息渲染，落在独立页签。理由=上游 MessageList 是复用件，插槽改造会与并行 composer 轮冲突；页签同样能完成"看产物"，且可集中做安全约束。
- D-6：远程工作区复用 Hermes 既有 FileProvider，只读 status/list，不在 IDE 内写 config.yaml/.env。理由=写服务端配置涉及密钥与并发会话，误改代价高；显性化既有能力 + 给出模板已能闭环排障与浏览。
- D-7：WSL 明确标注未支持。理由=Hermes BackendType 无 wsl，且本机为 macOS；假装支持会造死入口。
- D-8：分享云链接如实标注 stub，选段导出走本地 Blob。理由=服务端 prompt 通道未接线（控制器头注自述），不能让用户以为协同可用；本地导出是真实可交付能力。
- D-9：插件目录复用既有 skills/MCP API，zcode 插件只读。理由=安装/卸载需要宿主通道，本轮不扩写面；目录价值在"看见有什么、能启停什么"。
- D-10：新增四个页签统一进 `IdeSidePaneTab` 与本地字典，页签数 17→21；smoke/矩阵测试同步更新。理由=页签是本仓辅助栏唯一层级，新能力不应跳页。

## 验收

- 单测：交付物聚合/验证扫描/Gen UI 解析与路径安全/远程 client/server/分享选段/插件目录过滤，新增用例 ≥ 30。
- IDE 全量 + 全量 vitest 零失败；双 tsc；`build:full` rc=0。
- IDE smoke 更新为 21 页签并 11/11；双模式走查 21/21 不回归。
- 浏览器实测：四个新页签可打开、有真实数据/诚实空态；Gen UI 沙箱 iframe 无 same-origin；远程面板在 local backend 下探针通过。

## 验证记录（2026-10-18 实测）

- **新增用例**：deliverables 8 / genui 10 / share-range 5 / remote-workspace 8 / deliver-pane 5 / genui-pane 4 / remote-pane 4 / plugins-pane 5，合计 49；IDE 目录 112 文件 / 688 用例全绿。
- **构建**：`build:full` rc=0（vite + server tsc + build-server + verify-dist 全过）。构建期发现并修复两件 main 存量问题：`detectors.ts` 的 `activeNoArtifactMs` 漏声明（server tsc TS2339）；`build-server.mjs` 的兄弟布局 require 逃逸只匹配四层 `../`，本批 `controllers/ide` 是五层——新增 patch 661 扩展为「任意层 ../ + upstream/hermes-studio/」。
- **浏览器实测（私有 vite 8659 + 私有 bundled 后端 8657）**：四个新页签 14/14 检查通过——交付物四区/分享选段、Gen UI 空态说明、远程 backend=local + 探针 59ms + 目录列表、插件目录 skills 818/MCP/zcode 三源；页面无未捕获异常。截图 `/tmp/ide-backlog.png`（不入库）。
- **冒烟**：`ide-smoke` 21 页签 **11/11**（幽灵任务抽屉检查改为 8s 轮询稳态：跨板解析异步，固定 3s 单点会偶发误判）。
- **自检 CLI**：12 通过 / 1 告警 / 2 失败；失败为环境态（活动会话在 coding-agent global 工作区：文件 400、Git 404），告警为模型目录空（私有 bundled 后端未读到 ZCode 目录）——均非本批代码路径。
- **双模式回归**：`ide-work-mode-walkthrough.mjs` 21/21（首次跑遇 vite 依赖优化 reload，复跑全过）。
