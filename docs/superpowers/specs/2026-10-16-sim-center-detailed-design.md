# 推演中心·实施级详细设计（Phase B 首件）

> **重审状态（2026-10-16，需求已冻结）**：重审通过，无结构改动（需求 §六）——六签与场景编排挂面全部有需求承接；preflight 十六项灯=R11 手工过检痛点的本期缓解件。

> **文档定位**：定稿（swarmstudio-final-design）§三 推演中心六签的实施级设计——每一屏：布局线框＋组件（对账行号）＋数据契约（端点/文件锚）＋状态与交互＋验收（条款锚）。实现者照此编码，不再自行决策展示内容。
> **通用件**：八展示原子（定稿三·补）做成共享组件包 `sim-atoms`：步境标/闸徽/RACI 角标/双凭证标/锚点抽屉/判词位/紫标/纪律位——六签统一引用；锚点抽屉=全产品唯一反查交互（右滑出，宽 480px，内容=证据原文+四类锚跳转）。

## 签 1 轮次总览 `/app/sim`

**布局**：姿态横幅（全宽 48px）→ KPI 行（4 卡）→ 七幕旅程条（全宽）→ 双列表（左 2/3 步骤表+交付物链；右 1/3 六闸仪+净额卡+观察窗最新）。

- 姿态横幅：三档色带（strict 深绿/standard 琥珀/demo 紫）+政策一句话+清偿门灯（红=n open）。数据=`observability/run-state`→posture+ledger.open。
- KPI 四卡：六闸 n/6（键=g1_frozen…report_done，§3.3 keys 表前端副本）；分支交付 n/6；含代偿步可用；净额步可用（紫）。
- 七幕旅程条：七段横条，当前幕高亮+步微刻度。数据=state keys→步序（§3.3 映射表为前端常量，注册表单一事实源）。
- 26 步表：行=步号+全名+操作者+状态（✓ 时刻/进行中动画/未达灰）+双凭证标+步境标。点击行→锚点抽屉（该步证据帧+日志行+事件）。
- 交付物链 13 件：卡列表=件名+模板字段核对状态（✅/缺红）+仓锚。数据=evidence/ 与中央仓实读（后端聚合端点 `GET /api/hermes/sim/deliverables?run=`，Phase B 新增，读 §2.7 清单）。
- 六闸仪（右）：六行=闸全名徽+首过/补过/打回+判词 provenance 标。数据=state 闸键+issues.log 打回计数（后端聚合）。
- 净额卡：双行（含代偿/净额）+紫项列表（台账 type 分组计数）。

**验收**：§2.4/§3.3 步序与键全对；数字实测计算；§5.3 判据摘要可展开原文。

## 签 2 监督面板 `/app/sim/supervision`

**布局**：观察窗流（时间线列表，每窗一卡）→ 右侧研判/判词两栏。

- 窗卡：窗号+时刻+轮数/变化数/事件数+结论摘要；展开=该窗 journal 行。数据=`GET /api/hermes/sim/journal?run=&tail=`（Phase B 新增只读端点，读 workflow-journal.ndjson）。
- 研判栏：接棒员 situation_brief 行（时刻+局势+在途+风险三段）；判词栏：stall_verdict+gate_verdict 行（provenance 徽）。
- 交互：任一行→锚点抽屉（journal 原行+诊断证据文件）。

**验收**：journal 六类行全渲染；只读端点零写。

## 签 3 运行观测 `/app/sim/ops`

**布局**：环境拓扑卡行（4 服务）→ 双健康卡 → 活性表。

- 拓扑卡：gateway :8801/studio :8802/synapse :8008/hindsight :8888——绿/红圆点+延迟。数据=各 /health 探测（后端代理一次聚合成 `GET /api/hermes/sim/topology`，避免前端跨域）。
- 派发器健康卡：ready 板清单/距最近孵化秒/连续零孵化拍——数据=`dispatcher_health_snapshot()`（634）经 `GET /api/hermes/sim/dispatcher-health` 包一层（subprocess 调 CLI 或 import；合并铁律=正身仍在 hermes-agent）。
- 休眠卡：sleeping-workers 输出表（账号/静默秒/在办卡/unknown 标）。数据=同法包 635 CLI。
- 活性表：驱动/监督器/哨兵进程状态+最新日志行时刻（后端读 mtime）。

## 签 4 证据库 `/app/sim/evidence`

**布局**：左侧四类锚检索框（$/commit/t_/!）→ 中部结果列表 → 帧图廊页签。

- 锚检索：单框自动识别四类（正则区分）→ 后端 `GET /api/hermes/sim/anchor?id=`（Phase B 新增：事件=synapse 查询、commit=中央仓、卡=看板 API、房间=state 键）→锚点抽屉。
- 帧图廊：按步分组的缩略网格（capture-plan 投影：步→URL→user），点击放大+图注（补拍标注态如实）。数据=帧目录扫描+capture-plan 解析端点。
- 台账/journal/审批事件三子表：同页下半，各=只读列表+紫标。

**验收**：四类锚各至少一条真实样例可反查；零帧步显示「未采集」不隐藏。

## 签 5 交付健康 `/app/sim/delivery`

分支表（六 feat 行：分支名+提交数+新鲜度三态徽[新鲜/宽限窗内/旧残留]+双凭证）+在制卡列表（RACI+在制≤2 声明纪律位）。数据=`GET /api/hermes/sim/branches?run=`（后端 git ls-remote+宽限窗计算——branch_fresh 语义产品化，正身=后端一份）。

## 签 6 需求追溯 `/app/sim/trace`

AC 判词链四列表：AC 编号+判据原文｜对应用例｜测试结果｜UAT 判词（三态徽）。数据=冻结单 AC 提取+测试报告映射+验收书判词（后端聚合端点）。行点击→锚点抽屉。

## 挂面 场景编排执行器 `/app/sim/orchestration`（A8+D9，壳层挂面非第七签）

> 2026-10-16 补章：对账行 A8（eng 编排）与 D9（排期产品源）此前在详设中无落位，本节补齐——推演中心 6 签结构不变，本面挂壳层。

**布局**：场景清单区 → 排期面 → 开轮操作行。

- 场景清单区：OrchestrateView 14.3K＋EngScene 2.8K 整件从 /app/eng 迁入（旧路由重定向一周期）。场景卡=场景名+26 步模板引用+姿态适用档；场景注册表数据化（bash→数据）属 replan Phase C 正件，本面先承载既有编排面形态。
- 排期面：排期表预览（人日/依赖/并行工位）——消费 `GET /api/hermes/autosched/schedule`（636 既有端点，只读消费不复制语义，合并铁律）。
- 开轮操作行：开轮/续跑/姿态切换三钮＋prelaunch 十六项状态灯。守卫=本轮开轮与续跑的实际执行仍由 harness 侧完成（本面只发起与展示，不内置执行——一键开轮=replan Phase C 分水岭件，届时本面升格为执行器正身）；姿态切换写 run 参数，在跑轮姿态以 run-state 为准不受影响。
- 与治理中心互链：本面=运行态编排；流程定义态（26 步/判据/姿态政策冻结只读）在治理中心·关卡与流程签定义态，两处互链不重复建面。

**验收**：/app/eng 重定向可达；排期数字与 autosched 端点同值；prelaunch 灯与 harness 判定同源；开轮动作留痕可在审计签反查。

## 数据契约汇总（Phase B 新增后端，全部只读代理/聚合——正身不复制）

| 端点 | 数据源 | 合并铁律 |
|---|---|---|
| GET /api/hermes/sim/run-state | observability（631）透传 | 正身 631 |
| GET /api/hermes/sim/journal | workflow-journal.ndjson 读 | 只读 |
| GET /api/hermes/sim/topology | 四服务 /health 探测 | 探测代理 |
| GET /api/hermes/sim/dispatcher-health | 634 CLI/import | 正身 hermes-agent |
| GET /api/hermes/sim/sleeping-workers | 635 CLI | 同上 |
| GET /api/hermes/sim/deliverables | evidence/+中央仓 | 聚合 |
| GET /api/hermes/sim/branches | git+宽限窗 | branch_fresh 语义唯一实现 |
| GET /api/hermes/sim/anchor | synapse/git/看板/state | 聚合 |
| GET /api/hermes/sim/trace | 冻结单+报告+验收书 | 聚合 |

九端点=一个 `custom/server/simcenter/` 控制器族（模式同 orgloop 636），挂载补丁 638（更正：原记 637 与网关续作泵补丁撞号，顺延 638——实施计划 §1 已载）；纯函数单测照 PR-0 模式。

## 实施序与守卫

组件序：sim-atoms（8 原子）→签 1→3→4→5→6→2（1/3 数据现成，4/5 需新端点，2 等 journal 积累）；场景编排挂面随壳（B1 同批或紧随）；端点随签进；帧拍摄位随 /app/eng 路由迁移同步；实现新会话；studio 在跑轮次期间禁 inject（638 随部署窗）。
