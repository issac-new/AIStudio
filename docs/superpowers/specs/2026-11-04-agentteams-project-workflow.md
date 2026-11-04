# AgentTeams 吸收批一：项目一级实体、暂停/完成、改派通知、配置白名单

来源调研：AgentTeams 1.2.5 + Dashboard v1.3.1（源码级核对，/tmp/agentteams_src）。
本文是批一（feat/project-workflow 分支）的决策事实源；批二（执行记录面）、批三（拓扑契约）、批四（技能导出）各自另立 spec。

## 变更

对标 AgentTeams「项目与任务两级看板」层的四个缺口，落在 AIStudio：

1. **项目状态机**：新增 `custom/server/projectworkflow/` 域。项目生命周期状态
   `active | paused | completed`，持久化于 `<kanban_root>/projects-state.json`
   （按 canonical project id 索引，含 timeline 事件流）。不建新表、不改
   projects.db schema（该库 per-profile，跨 profile 不可见）。
2. **完成守卫**：`POST /api/projectworkflow/projects/:id/complete` 先扫全板
   kanban 库 `SELECT id,status FROM tasks WHERE project_id=? AND status NOT IN
   ('done','archived')`；非空即 422 返回卡号与状态清单。`?override=true&reason=`
   显式豁免才放行，豁免事件入 timeline。终态口径与 `_parents_satisfied`
   （kanban_db.py:2295）一致，仅 `done/archived`。
3. **暂停/恢复**（用户裁定：只拦机器派单）：状态写入同文件；生效点在
   dispatch 选卡面——`runtime/hermes_cli/kanban_db_dispatch.py` 的
   `_lane_rows`/`_dispatch_once_locked`/`_has_spawnable` 过滤 paused 项目的行，
   `runtime/gateway/kanban_watchers_dispatcher.py` 的 `auto_decompose_tick`
   跳过 paused 项目的 triage 卡。`_has_spawnable` 不过滤会被 cluster-inspector
   误报 `dispatcher.stuck` 并触发 CLI 直派自愈，暂停自我绕过——三处必须同批。
   不用 block/unblock 承载暂停（二次同 kind 会撞 BLOCK_RECURRENCE_LIMIT 转
   triage 并被 auto-decompose 拆新卡；恢复也无法区分暂停 blocked 与原生
   blocked）。在飞 worker 不动（与 ESTOP 口径一致）。
4. **改派通知**（AgentTeams 1.2.5「重新委派任务时会发送新的通知」）：
   `gateway/kanban_watchers_notifier.py` 的 TERMINAL_KINDS 增加 `assigned`，
   加 ping-only formatter（不进 _WAKE_KINDS）；dispatcher 默认分派事件
   （payload 含 `source=kanban.default_assignee`）静默，只通知人工改派。
   事件 payload 已含 `from`/`assignee`，本轮不加 actor 贯通（避免动 4 层调用
   链，留待批二顺路）。
5. **运行时配置白名单**（对标 AgentTeams `l2RuntimeConfigWhitelist` fail-closed）：
   vendor/hermes-studio `controllers/config.ts` PUT 路径加 ALLOWED_SECTIONS
   白名单（按 settings store 全量调用方清点），未知 section 400。GET 不收紧
   （读面已受 profile 访问权门禁）。

端点挂载：新 patch `731-server-projectworkflow-routes.patch`（照 597 形状）。
runtime 侧改动（kanban_db_dispatch.py、kanban_watchers_dispatcher.py、
kanban_watchers_notifier.py）同步落 patch（732）并登记 runtime-manifest.json
（notifier 此前不在 manifest，按 533/534 先例补入），保零漂移。
客户端：`custom/client/projects/` 列表+详情页，路由注册进
registries/client/bootstrap.ts。

## 决策记录

| # | 决策 | 备选 | 取舍理由 |
|---|---|---|---|
| D1 | 状态存 `<kanban_root>/projects-state.json` | projects.db 加列 / project_meta KV | projects.db per-profile，dispatcher（共享根）读不到创建者 profile 的库；kanban_root 是双方共同可见的共享层（HERMES_KANBAN_HOME → HERMES_HOME → ~/.hermes，Python kanban_home() 与 Node cli-fast-gates 同序） |
| D2 | 终态=done/archived，review 不算 | 含 review / 只告警 | 用户裁定（2026-11-04）：与父卡门禁同口径，诚实语义；豁免走显式 override+reason |
| D3 | 暂停拦 dispatch 选卡面 | gateway allowed / 批量 block | 用户裁定：只拦机器派单。dispatch_once 是全部 5 个派单入口（gateway/CLI/daemon/dashboard/studio）的共同下游；gateway 层只盖 1/5；block 会撞复发上限转 triage 被拆 |
| D4 | auto-decompose 卡级过滤 | 板级跳过 | 一个板可承载多项目；板级会误伤同板其它项目的 triage |
| D5 | 改派通知 ping-only，默认分派静默 | 全量 assigned 都通知 | dispatcher 默认分派每 tick 可能批量写 assigned，全量通知=风暴；AgentTeams 语义是「改派后的新通知」即人工改派 |
| D6 | 白名单只收 PUT 的 section 面 | 连 values 字段级校验 | 单批最小步；字段级校验涉及每个 section 的 schema，留待后续 |
| D7 | 完成守卫扫全板库 | 只扫绑定板 | project↔board 是 1:N 且两侧元数据可互不一致（bind-board 不回写 board.json），tasks.project_id 是唯一可靠判定键（探查报告结论） |
| D8 | dispatch.py 暂停过滤以注入态为补丁基底、runtime 侧保留其领先特性 | 字面零漂移（注入态覆盖 runtime） | 实施中发现既有债：runtime/hermes_cli/kanban_db_dispatch.py 领先注入态 163 行=4 个已提交特性（decision-grant/board_team_keys 集成/_reorder_ready_by_workload/DoD env 注入），全仓 487 补丁均无背书——manifest「镜像与补丁链零漂移」声明对该文件已失效。覆盖会删线上特性；照 kanban_decompose.py「runtime 覆盖层为权威版」先例处理。追补补丁链（4 特性回灌）另立批，本批不扩权 |
| D9 | locale 键镜像进 runtime/ 并登记 manifest | 只补 vendor 侧 | locale 不走 overlay 部署链，不镜像则安装树 notifier 显示裸键（通知面破相）；宿主安装树两份 locale 与注入态已核实逐字节一致，零覆盖风险；照 exa/semantica manifest 补位先例 |

## 验证

- 目标测试：`npx vitest run custom/server/projectworkflow/ custom/__tests__/patches-series-guard.test.ts custom/__tests__/docs-ssot-guard.test.ts`
- 全量：`npm test`
- 运行时对账：`node scripts/deploy-agent-runtime.mjs`（dry-run 核差异后 --apply）
- 行为验证（守卫）：临时库造项目挂 1 张 running 卡 → complete 应 422；全 done → 200；override → 200 且 timeline 有豁免事件
- 行为验证（暂停）：paused 项目下 ready 卡 → `dispatch_once` 不领不派且结果含 paused 计数；同库非 paused 项目卡正常派
- 行为验证（通知）：人工 assign 事件 → 订阅方收到 ping；default_assignee 事件 → 静默
- 行为验证（白名单）：PUT 已知 section 200；PUT `foo` → 400
- 客户端（批一客户端面，2026-11-04）：`npx vitest run custom/client/projects`（api 契约/URL 序列化/422 problems 透传 + utils 纯函数，17 例）
- 客户端回归：nav/面包屑消费面 `recent-trail` `workbench-nav-centers` `workbench-flow` `page-presentation` `side-nav` `daily-workbench-coherence` `sim-shell-coherence` `entry-boot-order` `ia2-i18n-coverage` 全绿
- 客户端类型：`vue-tsc --noEmit -p tsconfig.client.json`（仓内 `typecheck:client` 棘轮）——`custom/client/projects/**` 零错；全树 151 错均为本分支存量漂移（kanban/cockpit/governance/ide 域，基线 18，非本批引入）

### 实测结果（2026-11-04 收口轮）

- inject 干净树重放：vendor reset→全链重放，9 个涉改文件与编辑态快照 cmp 逐字节一致（731/732/733 正确性终局证明）。
- pytest：`tests/hermes_cli/test_project_pause.py` 9/9（重放树）；宿主安装树副本叠加 runtime 四文件+locale 含 decision-grant 回归 20/20（732 与既有 4 特性共存无冲突）。
- 目标 vitest：54/54（projectworkflow 22 + projects 客户端 17 + series/docs-ssot/architecture-ratchet 守门）。
- 全量 npm test（worktree）：7523 过 / 5 失败 → 逐一定谳：1=培训手册设计索引未含本批 2 个新 spec（本批引入，已登记 `aistudio-design-document-index.md`，复跑 13/13 绿）；4=存量红（`specialist-presets` 依赖的 `/Users/cuishi/lab/upstream/routa` 缓存缺失、`diagram-export` 3 例 playwright 浏览器缓存缺失——两文件在主树 main 同样红，非本批回归；环境恢复另立批）。
- 宿主部署：inject 出口自动部署+`--force --apply` 补齐 5 个差异文件（差异内容逐个 diff 验证=恰为本批 732 编辑），复核 59/59 一致；**网关重启未做**（生效第三层，待用户/后续轮执行）。

## 设计文档影响

DESIGN_SYNC: none
纯新增能力面（新域 + 新端点 + 新页面），不触及整合正本与数字总账既有章节；
批一合入后由批三（拓扑契约）统一评估是否需要在正本「项目」节登记。
