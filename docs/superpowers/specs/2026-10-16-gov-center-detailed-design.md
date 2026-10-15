# 治理中心·实施级详细设计（Phase C 首件）

> **重审状态（2026-10-16，需求已冻结）**：重审通过，两处增件（需求 §六）——签 6 度量体检增容量阈值灯＋容量检测器进巡检官主动通道（C10 双件）；签 7 资产区增密钥最小台账（C11，不含密钥本体）。

> **文档定位**：定稿（2026-10-16-swarmstudio-final-design）§四 治理中心的实施级设计——每一签：布局线框＋组件（对账行号）＋数据契约（端点/文件锚）＋状态与交互＋验收（条款锚）。行号引自对账总表。实现者照此编码，不再自行决策展示内容。
> **通用件**：八展示原子来自 `sim-atoms` 包（Phase B）；锚点抽屉=唯一反查交互。

## 〇、归属裁决（实施前必读）

定稿 §四标「7 签」而枚举八名；对账总表反向对账行作七组（A3+B7 同组）。裁决：**治理中心=7 签，组织与权限（A3）与资产与能力（B7）合为一签两区**，签名「组织与资产」（人员与权限区＋资产与能力区）。依据=对账总表为归属唯一正本，其七组分组即终态；定稿 §四 行文已于 2026-10-16 同步本裁决（7 签表述+六域对账注）。内容零丢失——八名枚举的全部功能都在，两区各自完整。

## 签 1 关卡与流程 `/app/gov/gates`（C5 拆分之六闸＋D6）

**布局**：顶部态切换（运行态｜定义态，单层两钮）→ 运行态=六闸卡行＋闸修复状态机面板＋受控合并位；定义态=流程只读面。

- 六闸卡（运行态）：六行=闸全名徽（G1 需求冻结…G6 复盘）＋判据摘要（可展开原文）＋判词 provenance 标（agent 判/人类角色模拟/代偿代判——代偿紫标）＋首过/补过/打回计数。数据=`observability/run-state` gates 键＋issues.log 打回计数（复用 Phase B 六闸仪数据面，一处聚合两处消费）。
- 闸修复状态机面板：orgloop gate-repairs 全量表（id/闸号/状态/fail_evidence/missing/history 时刻线）＋迁移按钮（fail_registered→repair_dispatched→re_review→pass，任意态→waived 需人工理由）。数据=`GET /api/hermes/orgloop/gate-repairs`（636 既有）；迁移=`POST /gate-repair/:id/transition`（636 既有，非法迁移 409 由服务端拒）。
- 受控合并位：本域分支列表＋评审意见＋`POST /api/hermes/orgloop/merge-run` 执行钮（lead 职权，非 lead 只见过程——V8.30 职责归位）。fail-closed 语义常驻说明（ORGLOOP_REPO_ROOT 未配=503）。
- 定义态：26 步主链＋六闸判据＋姿态政策三段只读渲染（冻结面——可读不可改；源=方案正本 §2.4/§5.3/§1.5 的前端常量副本，与 §3.3 映射表同一注册表单一事实源）。

**验收**：§5.3 判据原文可展开；闸 FAIL 唯一出口=修复单跟踪到复审 PASS（无拆闸式按钮）；定义态全面无编辑控件。

## 签 2 问题单对账 `/app/gov/issues`（C4）

**布局**：100% 处置进度条（全宽）→ ISSUE/DISP 台账全量表 → 诊断规则区（KanbanDiagnosticsSection 9.0K 迁入）。

- 台账表：行=单号/类型（ISSUE 问题/DISP 处置）/摘要/状态/处置结论/锚点链；表外词标注列（jargon 体检命中词如实标注）。数据=该轮 issues.log＋台账只读聚合——`GET /api/hermes/sim/issues?run=`（simcenter 族新增只读端点，与 journal 端点同模式；正身=issues.log 文件，端点不复制语义）。
- 进度条：处置率=n/n（分母=台账全量，§2.6 治理机制 100% 处置条款）；未 100% 时数字红色。

**验收**：§2.6 与纪律 28 阶梯——任何一单可点锚点抽屉看处置原文；进度数字实测计算不手编。

## 签 3 清偿门 `/app/gov/compensation`（D5 正身，契约定义在此）

**布局**：check-clearance 状态灯（全宽横幅）→ 代偿台账全量表 → type→PR 映射区。

- 状态灯：绿=无 open 代偿（prelaunch ⑯ 可过）；红=n open＋按 type 分组计数。数据=`GET /api/hermes/orgloop/check-clearance`（新增，见下）。
- 台账表：行=id/ts/type/defect/detail/status/resolution＋resolve/waive 双钮（waive 强制人工理由，全留痕）。代偿紫标全表可见。
- type→PR 映射区：每类代偿对应根治 PR 链接与状态——「根治一项拆一项」的进度面（理念·智慧型组织落点）。

**本签定义的新增端点契约**（orgloop 族扩展，replan 表行 2；inbox 与驾驶位同消费）：

| 端点 | 语义 |
|---|---|
| GET /api/hermes/orgloop/ledger?run=&status= | 代偿台账全量/按状态过滤 |
| POST /api/hermes/orgloop/ledger/:id/resolve { pr, note } | 根治清偿：挂 PR 锚＋留痕 |
| POST /api/hermes/orgloop/ledger/:id/waive { reason } | 豁免：reason 必填，人工批准留痕 |
| GET /api/hermes/orgloop/check-clearance?run= | 清偿门灯：open 计数＋可过性 |

数据迁移：mx-compensation-ledger 的 TSV 迁产品存储（迁移窗一次性搬，TSV 留只读降级档）；bash 原件变 API 客户端（透传不重写语义）。

**验收**：§2.6.5——waive 无理由不可提交；resolve 必须挂 PR 锚；灯值与 prelaunch ⑯ 判定同源同值。

## 签 4 审计与变更 `/app/gov/audit`（B8）

GovAuditChangeView 1.9K 整件迁入，内容不变＋三呈现约定：审计四查状态灯行；审计意见书锚点链（意见原文→锚点抽屉）；变更记录=基线快进/merge 保护语义标注（纪律 13——每次基线变更带 commit 锚与保护判定结果）。无新数据面。

## 签 5 文档评审 `/app/gov/docs`（B9）

**布局**：13 交付物核对清单（每件一行）→ 行展开=模板字段逐项核对明细。

- 行=交付物名（冻结单→资产表→组织矩阵→任务清单→系分稿→概设→排期→测试报告→发布件→验收书→台账→审计书→复盘）＋字段核对状态（✅/缺红）＋仓锚。
- 展开=§2.7 模板字段逐项 ✅/缺红——字段级模板验收的界面化。
- 数据=`GET /api/hermes/sim/deliverables?run=`（Phase B 聚合端点，一处实现两处消费；GovDocsReviewView 16.3K 迁入后改挂此端点，不自读仓）。

**验收**：§5.5 模板核对——缺字段红显不隐藏；与推演中心·轮次总览交付物链同值。

## 签 6 度量体检 `/app/gov/health`（B10-13＋C3＋C5 之六域体检——五卡合一签）

**布局**：五卡纵列（每卡可展开明细），卡序=工程效能｜集群｜语义｜会话｜成本与容量。

- 卡 1 工程效能（B10）：GovHarnessView 2.7K 迁入；首过率/并行度等 §5.7 基线引用＋实测计算。
- 卡 2 集群（B11）：GovClusterSection 8.9K 迁入。
- 卡 3 语义（B12）：GovOntologySection 8.7K 迁入。
- 卡 4 会话（B13）：GovSessionHealthSection 8.2K 迁入。
- 卡 5 成本与容量（C3＋C5 半）：CapacitySection 8.2K 迁入＋GovHealthSection 16.5K 拆分之六域体检部分——容量分析唯一家在此（对账裁决 1）；推演中心·轮次总览仅引用摘要行。
- 全签约定：数字全部带 §5.7 基线引用标注；CMMI 式自我加严——复盘行动项改变下轮准入阈值时，阈值变更记录随卡展示（理念·智慧型组织落点）。

**验收**：五卡数据面=迁入前各自源（迁入不改数据源）；容量数字在治理中心与轮次总览摘要行同源同值。

## 签 7 组织与资产 `/app/gov/org`（A3＋B7 两区，见〇裁决）

**布局**：两区纵列（单层页内分区，非二级页签）。

- 人员与权限区（A3）：人员编制表（roster：15 人编制与 RACI 矩阵，§2.2/§2.9）＋入职离职记录。账号行政=AccountAdminView 6.5K 从 /app/accounts 迁入，管沟通组账户的开通/停用/权限。工作台仅留「我的账号」快捷入口（F8），行政操作唯一家在本区。
- 资产与能力区（B7）：GovRegistryRulesView 2.0K 迁入——应用资产/中央仓/知识资产清单＋技能装载状态（与 skillgov 岛屿联动入口）＋功能开关。功能开关与治理·系统设置·功能区互链：开关操作唯一家在系统设置，本区只读呈现＋直达链接。

**验收**：§2.2 编制表与 roster 数据源一致；功能开关本区只读（无双写面）；账号行政操作留痕可在签 4 反查。

## 数据契约汇总（Phase C 消费面）

| 端点/数据源 | 消费签 | 正身 | 合并铁律 |
|---|---|---|---|
| GET/POST /api/hermes/orgloop/gate-repair(s)（636 既有） | 签 1 | orgloop 636 | 原样消费 |
| POST /api/hermes/orgloop/merge-run（636 既有） | 签 1 | orgloop 636 | 唯一合并执行面 |
| orgloop/ledger＋resolve＋waive＋check-clearance（新增，契约在本档签 3） | 签 3＋inbox＋驾驶位 | orgloop 族扩展 | 台账唯一实现 |
| GET /api/hermes/sim/issues（simcenter 族新增只读） | 签 2 | issues.log | 只读聚合不复制语义 |
| GET /api/hermes/sim/deliverables（Phase B） | 签 5 | simcenter 族 | 一处实现两处消费 |
| observability/run-state＋issues.log 打回计数（Phase B 数据面） | 签 1 六闸卡 | 631＋Phase B 聚合 | 与六闸仪同源 |
| roster/profiles 编制数据源 | 签 7 | 既有 profiles | 只读 |
| 各 Gov*Section 既有数据面 | 签 6 | 不动 | 迁入不改源 |

## 迁移点与测试随迁

- /app/accounts 路由退役为重定向→/app/gov/org（保留一周期）；governance 域 28 文件按 C7 聚合行逐件归位（未点名者随签走）。
- governance-view.test.ts 随迁（7 签断言）；GovHealthSection 拆分=六闸卡出、六域体检留（C5 行）——拆分两半各带原测试对应断言。
- 帧拍摄位：治理中心新增拍摄位注册（E 收尾件统一核）。

## 实施序与守卫

序：签 3（清偿门契约先行——inbox 与驾驶位等它）→ 签 1（关卡与流程，636 数据现成）→ 签 6（五卡合并，迁入量大）→ 签 5（文档评审，依赖 Phase B 端点）→ 签 2（问题单，依赖 simcenter 新端点）→ 签 4（纯迁入）→ 签 7（两区合并）。守卫：与 Phase A 并行可推（不同路由面）；studio 在跑轮次期间禁 inject；TSV→产品存储迁移在部署窗一次性执行；每签完成即勾对账总表对应行。
