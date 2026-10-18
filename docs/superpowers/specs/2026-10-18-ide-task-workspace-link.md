# Ycode 工作区与 kanban 任务 workspace 关联（2026-10-18）

分支：`feat/ide-task-workspace-link`
来源：用户 2026-10-18 指令——「Ycode 的工作空间要和 hermes kanban 任务的 workspace 关联起来（作为具体项目的根目录），集成该任务会话的所有上下文信息和记忆。」

## 一、背景与现状缺口

- kanban 任务卡自带 workspace 三字段（`workspace_kind`=scratch/dir/worktree、`workspace_path`、`branch_name`，hermes_cli/kanban_db_workspace.py 全生命周期管理：scratch 派发时物化、完成时按 containment 回收；worktree 落 `<repo>/.worktrees/<task-id>`）。
- IDE（Ycode 底座）有全局 `workspace`（localStorage `hermes_ide_workspace`）与任务维度 `activeTaskId`（`/ide?task=` 深链），但两者此前完全独立：任务简报 Git 块能拿到 `workspace_path` 展示，文件树/终端 cwd/记忆面板/新建会话的根目录不跟随任务。
- 「该任务会话」的上下文（任务详情自带 `session`（全文 messages）、`latest_summary`、events、comments）此前没有进入 IDE 的呈现面；记忆面板读 `ide.workspace` 下的 AGENTS.md/MEMORY.md/memory/，工作区不关联则任务记忆不可见。

## 二、方案（已落地）

1. **服务端解析端点**（patch 658，`custom/server/controllers/ide/task-workspace.ts`）：`GET /api/ide/task-workspace?task=<id>&board=<slug>` 镜像 upstream `listWorkspaceFiles` 的路径约定——`workspace_path` 绝对直用（系统级任务可在 `~/.hermes` 外）、相对锚定 `<~/.hermes/kanban[/boards/<slug>]/workspaces>`；scratch 未派发（path 空）按 CLI `resolve_workspace` 语义预测 `<workspacesRoot>/<task-id>`；`../` 穿越拒绝（`escape_refused`）；`materialized` 按目录实存如实呈现。任务详情经本机 HTTP 自请求（custom 控制器软链限制，worktree.ts 同款通道），鉴权头透传。
2. **activeTask 绑定三联动**（IdeShell）：① 关联——解析 materialized 时 `ide.setWorkspace(任务根)`，文件树/终端/记忆面板项目档/新建会话 workspace 全随根走；未物化（未派发/已回收）不切换不覆盖用户手选；② 会话跟随——尽力切到任务挂靠会话（`task.session_id` 命中 studio 会话即 switch，原 onMounted 版升级为随绑定跑）；③ 简报装载任务会话块。
3. **简报两新块**（TaskBriefingPanel）：「任务工作区」（根目录/类型+分支/关联状态四级文案：已关联/未派发预测/无工作区/路径异常）与「任务会话」（最新摘要+尾部 8 条消息节选+会话元信息）；「把任务上下文发给当前会话」一键动作（`buildTaskContextMessage` 纯函数组装：卡面+分支+workspace 根+摘要）。
4. **发现路径**：IDE 看板面板卡/表行/泳道卡可点击 → `/ide?task=<id>` 深链（一条链带起绑定+简报+关联）。
5. **词条**（patch 659，zh/en）：workspaceBlock 等 11 键 + `ide.kanban.openTask`。Composer `t` 无默认文案参数，键必须真实落语言包。
6. **配套**：简报 Git 块回退链接入解析根（顺序：解析根 → 卡片原始 path → 会话 workspace → IDE 工作区），stale 守卫改按任务 id（原按 workspacePath 比较会在新链下误丢新鲜结果）；测试桩补 `associateTaskWorkspace`。

## 决策记录

- D-1：路径解析放服务端新端点，不在客户端拼。理由=`workspace_path` 相对/绝对双形态，板 workspaces 根是服务端约定（同 upstream `listWorkspaceFiles`），客户端不可信拼；SIM/宿主 home 又存在隔离重定位先例。
- D-2：只在 `materialized` 时切换 IDE 工作区。理由=未派发/已回收的路径是预测值或死路径，切过去文件树直接报错态，且会覆盖用户手选工作区；预测值仍回填简报展示。
- D-3：任务上下文进会话走「一键显式发送」，不做首消息自动注入、不写上下文文件进 workspace。理由=① ChatInput 发送路径无外部接缝，自动注入既打扰又难测；② 向 worktree 型 workspace 写文件会弄脏树，任务完成时 `_cleanup_worktree_workspace` 对 dirty 树拒绝回收（工作区泄漏）；zcode 底座的项目记忆已经由「根目录关联」经 cwd 下 AGENTS.md 自动获得，无需文件注入。
- D-4：会话跟随从挂载期一次性升级为随 activeTaskId 绑定跑。理由=任务维度中途切换时旧实现不再跟随；实现复用会话直达链接的装载容错（未装载先 loadSessions）。
- D-5：解析端点 404 判死与 5xx 区分沿简报跨板解析同款语义（瞬时故障不伪装成「无工作区」）。
- D-6：store 对 `../api/taskWorkspace` 懒加载。理由=该 api → `@/api/client` → `@/router` 模块级 `createRouter`，顶层 import 会击穿全量 mock vue-router 的既有测试（command-palette/task-sidebar 实锤）；动作内 import 只在实际关联时拉链。
- D-7：关联状态文案的状态→键映射抽纯函数（`workspaceStateKey`）。理由=vue-i18n Composer `t` 的第二参不是默认文案，测试环境返回键名——映射纯函数化后键对接面可纯测，文案由语言包（patch 659）解析。
- D-8：看板卡点击复用 `/ide?task=` 深链而非直接调 store。理由=深链一条链（绑定+简报自动展开+关联+会话跟随）已是既有单一事实源，避免组件内重复编排。

## 验证

- 新增 22 测试全绿：服务端解析纯函数 8 例+路由 6 例；store 关联 5 例（materialized 切根/未物化不切/失败静默/stale 守卫/清绑定）；buildTaskContextMessage 4 例+workspaceStateKey 1 例；面板新块 5 例；看板点击深链 1 例。
- IDE 域全量：99 文件 / 608 测试全绿（含 command-palette/task-sidebar 基线回归）。
- overlay 全量：4897 通过 / 5 失败——失败均为基线既有环境态（`delivery-harness-contract`/`raci-rest-guard` 硬编码已删除的 simharness worktree 绝对路径；stash 基线复现实证非本轮引入，与 memory「夹具绝对路径残根」同族）。
- 隔离注入重放：APFS 克隆 upstream → reset 原始 → 全系列 659 补丁（含本轮 658/659）一次重放成功。
- 类型检查：注入副本上 `vue-tsc -b` 与 `tsc --noEmit -p packages/server/tsconfig.json` 双零错误。
- 未验证项（如实）：8649 浏览器交互走查未做——主树被并行会话在途分支占用（fix/ide-regression-20261018 未提交改动含同域文件），本轮分支未在任何 dev server 运行；需下一轮在主树空闲时 `npm run dev` 走查关联切换/简报两新块/一键发送/看板点击四点。
