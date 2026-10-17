# SwarmStudio 全功能 GUI 回归（第二轮）与缺陷修复

- 日期：2026-10-17
- 账号：Matrix `@swarm:matrix.test`（studio role=admin，非 super_admin）
- 环境：vite 8649（`npm run dev` 热更新）+ 后端 8647（ts-node 源码树）；浏览器 IAB 真人点击
- 证据目录：`gui-test-screenshots/regress-20261017/`（截图按 t01-t134 编号）

## 一、覆盖范围

按运行时路由表逐域走查（含二三四级页面）：

- 顶栏全局：常用入口四入口、六阶段导航、IDE 工作区、全局搜索（任务匹配+深链）、任务徽章面板（排序/深链）、日程面板、通知面板、主题切换、语言切换、版本更新日志、面包屑。
- 旅程/六阶段：`/app`、`/app/stage/setup|reqs|design|build|accept|govern` 及页内联操作（密钥台账加行、新增成员行/删除、质量门筛选、运行目录读取、AC 判定链）。
- 看板与 IDE：`/app/board`（全部板 chip、筛选、清除筛选、任务抽屉、任务面板深链）、`/app/ide`（任务列、页签、文件树、Git/查看文件、自动化、工作空间、命令面板、评审面板）。
- ia2 工作台域：`/app/dash`、`/app/inbox`、`/app/collab`、`/app/s/chat`、`/app/agent`、`/app/history`、`/app/teams`、`/app/agents`、`/app/accounts`、`/app/cases`。
- 治理中心 7 签 + 子页：质量门与流程/组织与资产/遗留项清算/问题清单对账/审计与变更（源筛选+搜索）/文档评审/度量检查；`/app/gov/settings`、`/app/gov/model-providers`。
- 仿真中心 6 签 + 设置/编排：运行总览（真实 run21）、监督面板、运行监控（探测）、证据库（空锚校验/台账）、交付健康、需求追溯、`/app/sim/settings`、`/app/sim/orchestration`。
- 收编页 17+：模型、工作流、设备互联、文件、技能、插件、MCP、记忆、频道、任务/定时、旧看板、学习轨迹、设置、主题、技能用量、日志、用量、单聊、群聊。
- 自定义域：`/app/bpa`（六页签+重新体检）、`/app/ontology`（概览/模式/图谱/实例/校验/版本/导出/约束卡）、`/app/skillgov`。
- `/matrix`、五条权限拦截页（→ `/app`）、六条假 ID 深链（不白屏不崩）。

## 二、缺陷与修复

### D1 [P1] 看板任务卡点开必现 404「Task not found」

- 现象：`/app/board` 任一可见任务卡点开，抽屉显示 `API Error 404: Task not found / 加载任务失败`。复现于 Default 板（t_a6185892）与协作板（t_eef3e5f2，t65 截图）。
- 根因：看板列表来自聚合快道（`/api/hermes/kanban/overview`，sqlite 直读，不按用户可见 profile 过滤）；任务详情走上游 CLI 控制器，读侧仍套 `filterTasksByVisibleProfiles`。聚合可见、详情被过滤 → 404。跨板 fallback（patch 492）只在 detail 为 null 时生效，过滤分支直接 404。
- 修复：`patches/649-server-kanban-admin-task-read.patch`——`get` 读侧对 role=admin/super_admin 跳过 profile 过滤；写操作（认领/更新/评论）仍由 `authorizeTaskIds`/`denyProfileAccess` 把守。
- 复验：待合入 + 重启 8647 后重开 t_a6185892 / t_eef3e5f2 抽屉，期望 200 并渲染详情。

### D2 [P1·运维] 仿真中心整族 503（标准 dev 启动未设 OBS_SIM_ROOT）

- 现象：运行总览输入 run21 → 503「simcenter 未配置（OBS_SIM_ROOT 缺席）」；运行监控探测 topology/sleeping-workers、问题清单、度量检查 AI 产出质量、交付健康/需求追溯同因。
- 根因：`serve-server.mjs` 只默认 `GOVERNANCE_REPO`，未默认 `OBS_SIM_ROOT`；产物设计是 fail-closed，dev 启动即整族不可用。
- 修复：`scripts/serve-server.mjs`——缺省时若工作区 `ncwk-sim-mux` 存在则设 `OBS_SIM_ROOT` 指向它（显式 env 尊重不动），启动日志打印实际值。
- 复验：重启 8647 后运行总览读取 run21、探测拓扑应返回 200；无 SIM 根的环境仍 fail-closed。

### D3 [P2] 设备互联页整页空白

- 现象：`/hermes/connections` 只有侧栏，内容区 601px 空 div（t93 截图）。
- 根因：`ConnectionsPanel` 三个页签分别受 `features.connectionsExtras` 与 `isSuperAdmin` 控制；admin 账号 + 开关关时零页签，`NTabs` 空渲染，无任何空态。
- 修复：`patches/650-client-connections-empty-state.patch`——无可用页签时渲染 `common.noData` 空态。
- 复验：合入后该页显示「暂无数据」而非空白。

### D4 [P2] 本体版本史时间显示 1995 年

- 现象：本体工作台「版本」页四条快照时间均为 `2/1/1995`（t55 截图）。
- 根因：`listSpecSnapshots` 用 `f.slice(6, -5)` 解析 `spec-<13 位毫秒>.json`，把首位 1 截掉（791627836440 → 1995-02-01）。
- 修复：`custom/server/ontology/ontology-store.ts` 改为 `slice(5, -5)`；新增守门测试断言 13 位时间戳完整解析且年份 2026。
- 复验：`vitest run custom/server/ontology/__tests__/ontology-store.test.ts` 9/9 通过；GUI 版本页时间应为 2026-10-10。

### D5 [P3] 仿真页在可访问性树里挂三个 0×0 role=dialog

- 现象：仿真中心任意页 DOM 有 3 个 `.sim-anchor-drawer`（role=dialog，0×0，文本「证据原文/关闭/无锚」），视觉不可见但读屏会读到。
- 处置：本轮只记录（未修）。建议改为 `v-if` 或关闭态 `aria-hidden`。

## 三、观察项（非缺陷/未修）

- `/matrix` 房间列表为空（页面空态正常；后端日志同时出现 `Matrix: disconnected` 与 cron 投递 `No module named 'matrix'`，疑 agent 侧依赖/连接问题，超出 overlay 范围）。
- 插件页正文出现原始后端警告「Plugin context_engine/lcm: unknown kind...」——诊断信息直出 UI，建议后续降噪（未修）。
- 旧看板 `/hermes/kanban` 首访 ~16s（冷）、二次 ~4.9s；当轮 10 个 agent 并发，未达性能批宣称的 0.6s，但非功能性故障。
- 英文语言包在线/规模文案出现 `1 people · 1 machines` 单复数不严谨（P3）。
- 在线徽章点击无可视面板（日程/通知/任务徽章均有）；可能为 hover 提示设计，未定性为缺陷。
- IDE 右栏 Git/查看文件页签在「任务简报」抽屉展开时被抽屉覆盖（抽屉本身可关闭），属覆盖层行为，未定性为缺陷。

## 四、决策记录

- **D1 读侧放行 admin**：聚合列表本就不做可见 profile 过滤，详情再拦会让「看得见的卡」全部打不开。认领白名单的意图是防 agent 串领，写路径已有围栏；读详情对 admin/super_admin 放行，普通用户保持过滤。选择改读侧而非给聚合加过滤，是因为「全部视图」跨板巡检是产品明确语义，过滤会把它退化成个人待办。
- **D2 默认 SIM 根而非要求人工设 env**：`ncwk-sim-mux` 是本工作区内置 SIM_ROOT，dev 启动脚本缺省指向它符合「开箱可用」；生产无该目录时仍 fail-closed，不改变安全边界。
- **D3 空态而非隐藏入口**：设备互联入口来自通用侧栏，按账号能力动态隐藏成本高；空态可解释「为什么没有内容」，也覆盖 super_admin 之外的部署形态。
- **D4 修切片而非改前端**：错误在服务端解析层，前端只是如实渲染 `ts`；修解析并加守门测试，避免其它消费方再踩。

## 五、验证

- 单测：`custom/server/ontology/__tests__/ontology-store.test.ts` 9/9 通过（含新增 13 位时间戳守门）。
- 补丁：649/650 已用 `git apply --check` 对当前注入树校验可应用。
- 待办：合入 main → 主工作区 `npm run inject` → `vue-tsc`/构建 → 重启 8647 → GUI 复验 D1/D2/D3/D4 四点。
