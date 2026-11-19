# 流程解耦批二：看板库路径单一事实源、派单五问准入、tier 未标缺省对齐立法

承接 `2026-11-19-kanban-process-baseline.md`（批一：词表单源与三红灯）。批二做解耦与准入层：
信息依赖收口（看板库路径 9+ 份实现 → 1）、AI 五问派单准入机械门（文章第六章）、
tier 未标缺省 T1→T2（对齐 team/shared/completion-contract.md:57 的团队立法「防漏标降级」）。

## 变更

### 一、看板库布局解析单一事实源：`custom/server/services/hermes/kanban-layout.ts`

新模块只管「给定 home 之后的库布局」（家目录解析仍归 `lib/paths.ts` 的 `hermesHome`）：

- `mainDbOf(home)`：`<home>/kanban.db` → `<home>/kanban/kanban.db`（两态，现行序）。
- `boardsDirsOf(home)`：`kanban/boards` 与旧 `boards` 双布局，新在前、仅存存在的。
- `boardDbPathOf(slug, home)`：default 板三态（根级 → `kanban/boards/default` → `kanban/kanban.db`）；
  命名板双布局（`kanban/boards/<slug>` → `boards/<slug>`）。
- `namedBoardDbsOf(home, {skipUnderscored})` / `allBoardDbsOf(...)`：枚举（default 主库 + 双布局全板，
  按路径去重；`_` 前缀目录跳过为可选，保 project-tasks/clusterinspector 既有口径）。
- `boardSlugOf(dbPath)`：路径含 `boards/<slug>` 段才认板名，否则 default（收口 kanban-bridge 与
  project-tasks 的逐字重复双胞胎）。
- `isKanbanHome(p)`：四探测收一（kanban-home 探测序等价）。

迁移面（13 处消费点改为 import，公开签名不动）：governance-analytics、boards-reader、
board-status、kanban-overview、kanban-task-fast、orchestrator/kanban-bridge、mind-projection、
projectworkflow/project-tasks、controllers/sim/board-staleness、clusterinspector 两文件、
delivery/kanban-home、ontology-watch。

行为变化（均为加法）：枚举类消费方（governance-analytics / mind-projection / boards-reader /
ontology-watch / clusterinspector）获得旧布局 `<home>/boards` 支持——此前旧布局部署下这些域
集体读空而 delivery 域能读到（批一调研 P0 项）。单板解析类（board-status / task-fast /
board-staleness）逐板获得双布局回退。

守门：`custom/__tests__/kanban-layout-ratchet.test.ts`——custom/server 非测试面禁止新增
`'kanban.db'` / `'kanban','boards'` join 字面量；允许清单=新模块＋7 个未收敛存量文件
（cli-fast-gates、board-graph、delegate-scan、run-surface、governance-audit、
task-workspace-cache、kanban-home 的候选注释面若仍残留），只减不增（棘轮）。
7 个存量收敛进挂账台账 N02。

### 二、AI 五问派单准入：`custom/server/kanban/dispatch-readiness.ts`

文章第六章「判断一项业务活动是否适合引入 AI 的五个方面」机械化，接进
`dispatchColumnTransition`（列编排派单面）：

| 维度 | 机械判据（如实，不猜） |
|---|---|
| 信息可获取 | workspacePath 非空且 existsSync |
| 规则明确 | 命中交接规则行，或列声明 requiredArtifacts，或 step 声明 autonomy/constraints |
| 目标清晰 | taskId 可取到非空任务标题（fetchTaskTitleByTaskId） |
| 过程可控 | taskId 在场（幂等闸/台账/证据链均以 taskId 为键；缺席即这些闸全部缺位） |
| 结果可验证 | 任务 body 含验收标记（`AC[-·]?\d` / 验收 / acceptance / dod），或列声明 requiredArtifacts |

- 结果随 `ColumnDispatchResult.readiness` 透出（dimension/ok/detail），默认 warn（console.warn 一行）。
- `HERMES_DISPATCH_READINESS_ENFORCE=1` 时任一缺失 → 抛 `DispatchReadinessError`，REST 422
  `dispatch_readiness_failed`（column-automation-controller 增加 name 判定——前置条件不满足，
  区别于配置错误的 400），任何 step 派发前拦截。
- 判据是启发式的就写明是启发式：目标=标题非空、规则=任一规则面声明，不宣称语义级判断。

### 三、tier 未标缺省 T1 → T2（对齐团队立法）

- 走补丁通道：新增 `patches/803-agent-unmarked-tier-default.patch`（vendor
  `tools/kanban_tools.py` `decision_tier_for_task`：非字符串 body 与无标记两处缺省由
  `T1` 改为 `unmarked_decision_tier()`——`KANBAN_UNMARKED_TIER` env，缺省 T2，值非法
  回落 T2，fail-closed 从严）。`runtime/tools/kanban_tools.py` 是补丁触碰面的部署镜像，
  同步同一改动（deploy-agent-runtime 补丁触碰面收口口径）。
- `custom/server/approval-inbox/decision-grant.ts` `decisionTierForTask`：同规则同 env，双侧同边界。
- 依据：`team/shared/completion-contract.md:57`「卡未标层时按 T2 执行（从严默认，防漏标降级）」——
  此前代码 T1 与文档冲突，未标层的卡直接绕过 T2/T3 HumanGate 硬门（批一调研高优先缺口）。
- 逃生通道：`KANBAN_UNMARKED_TIER=T1` 恢复旧行为（应急用，不写入默认配置）。
- 测试面适配：`runtime/tests/hermes_cli/test_project_pause.py` 建卡补 `tier=T1` 标记
  （该文件测暂停过滤，不测分层门——未标层新缺省会让其 spawn 断言全灭，显式标 T1 隔离关注点）。
- 宿主生效条件：runtime 部署后需重启对应 profile gateway（本批不执行重启）。
- 已知跟进：803 追加在 series 尾触发「增量 inject 拒中插」，需下次无活服窗口
  `npm run clean && npm run inject` 全量重放（本批以 `git apply --directory` 手工落到
  注入态验证，pytest 152 绿）。

### 四、verify 意图收口（批一 D4 挂账决议）

- `team/shared/handoff-rules.yaml` v3：新增 active 规则 `review-to-ready-rework`
  （from review → to ready），证据要求沿用原 review→verify 的三件（review_verdict / test_evidence /
  residual_risks）。理由：打回返工（review→ready）是九态内真实可达且会触发派发的流转
  （ready entry → implement step → 交接行注入），原「复测」意图的证据契约在此存活；
  「自动复测派发」本身维持退役——并入 review 会改变进入列派发步数（行为变更），不猜。
- 原 retired 规则保留历史不动。

### 五、配套

- `custom/server/kanban/__tests__/handoff-observability.test.ts` 夹具 `in_progress` → `ready`
  （测试自建 store，同步词表口径）。
- 机制预算 `config/mechanism-budget.json` changes[] 登记：新增 readiness 门＋layout 模块，
  配对删除=verify 死键退役（批一）＋路径实现 13→1 收敛＋boardNameOf 双胞胎去重。
- DESIGN.md：§3.9 权威数据源表补「看板库布局解析」单一事实源行；§4.2 补 tier 未标缺省与
  readiness 门一句。

## 决策记录

**D1 布局模块只管 layout、不管 home 候选政策。** 各消费方的 env 候选序
（ORCHESTRATOR_KANBAN_DBS / HERMES_KANBAN_DB / DELIVERY_KANBAN_HOME / SIM 根）是域策略，
硬并进模块会把推演侧与产品侧耦死。收口的是「给定 home 后的布局语义」这一层——
这层正是 9+ 份实现漂移、旧布局口径不一致的所在。

**D2 迁移面收敛到 13 处＋棘轮，不做 18 处全量。** 余 7 处（cli-fast-gates/board-graph/
delegate-scan/run-surface/governance-audit/task-workspace-cache 等）各有独立语义需逐个核，
一轮全迁的风险大于收益；棘轮保证只减不增，收敛进度进台账 N02。

**D3 readiness 判据用机械启发式并如实标注，不做语义判断。** 「目标清晰=标题非空」
不是语义级判断，但它是可机械执法的下界；语义级判断留给评审与人。默认 warn、
env 才 enforce，与仓内 TEAM_STOP_ENFORCE / GOVERNANCE_SLO_BUDGET 同一执法梯度哲学
（先让缺口可见，再谈强制）。

**D4 tier 缺省翻转选「代码对齐文档」而不是「文档对齐代码」。** 文档是团队立法
（防漏标降级是明确动机），代码 T1 是实现偏离。翻转的运行面影响=未标层卡在 spawn 前
进 needs_decision 等人发 grant——这正是立法意图。提供 env 逃生而非改回 T1，
并把「宿主重启才生效」如实写进验证节。

**D5 verify 意图落在 review→ready 而不是新增板列或并入 review 步骤。** 新增板列要动
kernel DEFAULT_WORKFLOW（vendor patch＋换血重生成，代价不成比例）；并入 review 改变
进入列派发步数（行为变更）。review→ready 是打回返工的真实流转，证据契约在此可存活
且可命中（advisory 注入面），自动复测派发维持退役并留台账。

**D6 DESIGN_SYNC touched。** 布局单一事实源与 tier 缺省都是跨域契约级约定，必须进正本，
否则下一个人再写第 10 份路径实现时无据可依。

## 验证

- `npx vitest run custom/server/services/hermes/__tests__/kanban-layout.test.ts`——布局单元
  （新旧布局、default 三态、slug 推导、去重、`_` 跳过）。
- `npx vitest run custom/__tests__/kanban-layout-ratchet.test.ts`——棘轮（允许清单内 7 存量，
  违规新增即红；变异探针：临时加一处字面量应红）。
- `npx vitest run custom/server/kanban/__tests__/ custom/server/governance/__tests__/
  custom/server/delivery/__tests__/ custom/server/orchestrator/__tests__/
  custom/server/projectworkflow/__tests__/ custom/server/loop/graph/__tests__/
  custom/server/ontology/__tests__/ custom/server/clusterinspector/__tests__/
  custom/server/approval-inbox/__tests__/`——迁移面与 tier 面回归。
- readiness 单元测试：五维各 ok/missing 两态＋enforce 抛错＋默认 warn。
- Python：`pytest runtime/tests -q`（PYTHONPATH 拼 vendor/hermes-agent，conftest 口径）——
  tier 翻转后 decision_grant 向量与 dispatch 族全绿。
- `npm run typecheck:harness`、`npm run typecheck:client:ratchet`。
- `node scripts/merge-invariants.mjs --check`。
- `npm test` 全量（合并前）。
- 宿主部署：`node scripts/deploy-agent-runtime.mjs`（默认保留宿主差异文件）——报告列差异；
  **不重启任何 gateway**，tier 翻转生效时点=下次 gateway 重启（用户掌控）。
- push origin main（含此前 30 个未推提交）。

## 设计文档影响

DESIGN_SYNC: touched
DESIGN_DOCS: docs/DESIGN.md

§3.9 表补一行：看板库布局（主库/分板目录/板名推导）权威来源=`custom/server/services/hermes/
kanban-layout.ts`（正本 kernel 布局的产品侧唯一解析器），消费方不得自拼路径。
§4.2 补两句：未标层卡按 T2 执行（KANBAN_UNMARKED_TIER 可调，非法值回落 T2）；
列编排派单过五问 readiness 门（默认 warn，HERMES_DISPATCH_READINESS_ENFORCE=1 强拦）。
