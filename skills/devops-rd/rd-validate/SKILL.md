---
name: rd-validate
description: "RD 需求-实现-测试三方对账（/rd:validate）：requirement ↔ diff ↔ test 逐项对照，产出 implementation-check.md + continue-prompt.md。触发：编码任务验收、接续开发、kanban_complete 前对账。"
version: 1.5.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [rd, validate, reconciliation, acceptance, kanban]
    related_skills: [worker-completion-independence-verification, code-review, rd-apply, verify-requirement]
---

# /rd:validate — 需求-实现-测试三方对账

> 版本说明：v1.5（2026-09-23，NOW 档 t_a4151cc9）持久化断言扩 before/after/delta 三联 + 硬门补接续禁旧证据。v1.4（P3）语义文档一致性+Smoke+脱敏。v1.3（P2）契约迁移断言。v1.2（P1）持久化断言+L0 索引。
> v1.1（2026-08-27 重建）。v1.0 实体在 devops-rd master 化迁移中丢失（倒挂 symlink 事故），
> 本版从 taobao-rd-harness 调研规范（analysis-report.md L154/L366/L386）+ 基座 skill
> `worker-completion-independence-verification`（t_f4fd26da 判例库）重建，逻辑等价并强化对账产物契约。

## When to Use

- worker-tester / worker-coder 在 `kanban_complete` 前对账（RD 质量门检查清单"测试/对账类"）
- orchestrator 验收编码类任务（需求 ↔ 实现 ↔ 测试三方一致才放行）
- 接续开发场景：上一轮 requirement 是否被本轮 diff 完整承接

## 产物契约（强制）

对账必须产出两份文件到任务工作区：

1. **`implementation-check.md`** —— 三方对账矩阵：
   | # | 验收项（requirement 原文） | 实现位置（file:line） | 测试证据（用例/命令+结果） | 判定 |
   每行必须三列齐备才可判 ✓；缺任一列 = GAP，逐条列出。
2. **`continue-prompt.md`** —— 接续开发提示词：当前完成度、剩余 GAP、下一步入口（文件/分支/测试命令），
   让全新上下文的 agent 不读历史即可接手。

## 标准步骤

1. **提取 requirement 锚点**：从 kanban body / requirement.md 提取全部验收标准（frozen:true，不得
   临时改写；需改必须 kanban_comment @orchestrator 审批——见 verify-requirement）。
2. **提取实现锚点**：`git diff --stat <baseline>..HEAD` 逐文件对照验收项，落 file:line。超范围改动
   单列（不属于任何验收项 = 范围违规，交 code-review 处置）。
3. **提取测试锚点**：亲自跑测试（不信 worker 自报 pass 数），记录命令 + 退出码 + 失败清单。
   回归判定用基线对比：改动前失败集合 vs 改动后失败集合的 diff（判例 t_37053748：worker 声称
   「无关失败」实测引入 18 个额外失败）。
4. **三方对照**：填 implementation-check.md 矩阵，每项判 ✓/GAP/PARTIAL。
5. **生成 continue-prompt.md**：GAP 项转下一步行动。
6. **退出路由**：全 ✓ → 允许 kanban_complete（metadata 附两文件路径）；有 GAP → kanban_request_changes
   或 block，GAP 清单原样进 reason。

## 持久化类变更字段级断言（QGate 融合 P1，v1.2.0）

> 来源：Universal Delivery Gate Framework (QGate) v0.1 §8.4/§45-46（源文档存档 `workspace/research/qgate-fusion-20260923/`，任务 t_177caf7a）。
> 收缩吸收：全量 DB snapshot 工具链不建（触发条件见 gap_register），收缩为对账检查项。

**触发**：本次 diff 涉及持久化面——ORM/Entity/model 层、migration/DDL、SQL、DB 写入路径
（repository/dao/service 写操作）。纯 API 透传不触发。

**对账要求**：对每个写路径场景，单元测试 PASS 不构成充分证据（agent 自写测试与实现共享同一
错误假设 = 自证循环），必须补字段级断言：

1. **输入**：请求/调用参数原文（非复述）。
2. **DB Before / After / Delta 三联**（v1.5.0 扩展）：执行前快照受影响表的相关行，执行后快照
   同一行，计算 **Delta**——①断言 After 逐字段正确（字段名、值、类型、nullable、status），
   验证落点是 DB 实际值不是内存对象；②断言 **Delta 恰好等于预期变更集**：Delta 为空 = 预期写入
   没发生（FAIL）；Delta 含预期之外的行/字段变化 = **意外副作用**（如批量 UPDATE 误伤他行、
   agent 顺手改了别的记录），逐行解释，解释不了的判 GAP。「能构建」不等于「能启动」，同理
   「目标行写对了」不等于「没写坏别的行」。
3. **跨表一致**：主表与关联表字段一致（如 `payment.amount == ledger_entry.amount`）。
4. **不变量**：领域不变量成立（如 `refund.amount <= captured.amount`）。

**判定**：四步齐且实测通过 → ✓；缺任何一步 → 该验收项 PARTIAL（不自证循环豁免）；
工具链不可用时按三态协议 §4.4 WAIVED（六字段豁免）或 UNKNOWN，禁标 PASS。

**Evidence 留痕**：断言输出（request/response/DB after 值/字段 diff）附 implementation-check.md
「测试证据」列。

## 契约与迁移一致性断言（QGate 融合 P2，v1.3.0）

> 来源：QGate v0.1 §8.1/§8.2/§11 L5.2（存档 `workspace/research/qgate-fusion-20260923/`，t_116a351e）。
> 收缩吸收：契约静态分析工具与 testcontainer 编排不建，收缩为对账检查项；触发升级条件同 gap_register。

本节与上节（持久化字段级断言）同为 L2 一致性检查，触发面不同：

**触发**：① diff 涉及接口面——OpenAPI/swagger、controller 路由、DTO、client SDK、API 测试；
② diff 涉及 schema 面——migration/DDL、ORM model 字段定义、建表 SQL；③ diff 含 migration 脚本。

**API 契约对齐**（①触发）：spec ↔ handler ↔ client ↔ test 四层逐一对照——每个新增/变更的
endpoint，spec 里的路径、方法、参数、响应码在 handler 有实现、在 client（如有）有同步、在测试
有覆盖；四层任何一层缺位 → 该验收项 PARTIAL。纯加字段默认向后兼容判定；改已有字段语义 → 标记
breaking change 上报。

**Schema 结构对齐**（②触发）：model ↔ migration ↔ 实际 DDL 三方对照——字段名、类型、nullable、
default、主键/索引；任何「model 有 migration 没有」或反向的差异 → PARTIAL（ORM 自动建表不算
migration 覆盖）。

**Migration 升级路径**（③触发，QGate L5.2 核心）：不许只在全新库上验证。必须证明**旧版本库 →
跑本次 migration → 新版本**的升级路径可用：找到 upgrade 前状态（migration 链上一版/fixture 旧
dump），执行本次 migration，断言升级后数据在位（旧数据未丢、字段值未畸变）+ 新结构正确。
只验证「全新 build 从零跑通」不构成通过——生产库里永远有旧数据。无法构造旧库状态时按三态协议
§4.4 WAIVED（六字段）或 UNKNOWN，禁标 PASS。

**Evidence 留痕**：对照表或升级前后断言输出附 implementation-check.md「测试证据」列。

## 语义与文档一致性检查（QGate 复盘 P3，v1.4.0）

> 来源：QGate v0.1 §L2.3/§L5.3（存档 `workspace/research/qgate-fusion-20260923/`，t_ca8d722c）。
> 收缩吸收：本体推理不建，收缩为两条轻量对账检查。

**同名字段语义抽查**（L2.3，触发：diff 涉及 `amount`/`status`/`id`/`type` 类通用名新增或复用）：
同名通用字段在两处以上出现时，抽查语义是否同一——如两处 `amount` 一处是订单金额一处是已结算
金额，即语义冲突。方法：grep 同名字段的赋值与读取点，对照注释/上下游含义；发现歧义 → 登记
Semantic Finding（字段+两处含义+建议改名），不阻塞但**必须进对账报告**。

**文档一致性**（L5.3，触发：diff 变更了对外行为——API 形状、配置项、用法、错误信息）：
代码变更后，描述该行为的既有文档是否同步——README 用法段、API 文档、运维手册、部署脚本注释。
检查方式：`git diff` 中对外行为变更点 ↔ 全仓 grep 旧描述残留；发现漂移 → 该验收项 PARTIAL
（文档不同步 = 实现不完整），或在任务卡显式登记「文档更新另行派卡」并经 orchestrator 认可。

## 硬门（继承 worker-completion-independence-verification）

- 「测试全绿」声明必须亲自复跑验证
- 「文件已创建」声明必须 ls + 语法检查机械验证
- 产物存在且可读（PDF/HTML/JSON 各自解析器验证）
- **Smoke 挂点**（QGate L3.1 收缩）：任务含可运行产物（服务/脚本/app）时，交付前必须跑一次
  最小启动冒烟（import/启动命令/--help 级），输出贴报告——「能构建」不等于「能启动」
- **证据脱敏**（QGate §50）：任何进入报告/看板/Evidence 的输出先过 secret 扫描（api_key/token/
  password/连接串）；连接串与凭据禁止进入证据留痕，需要时只留「已脱敏的连接目标标识」
- **接续开发禁旧证据**（QGate §48 等价，v1.5.0）：接续开发场景必须**本轮亲跑全部测试锚点**，
  禁引用上轮任务（或更早）的 implementation-check / 测试输出作为本轮通过依据——旧证据绑定旧
  commit，代码已变即失效；上轮全 ✓ 只说明「上轮那版对」，不说明「这版对」
- 不信任任何自报通道；无证据 = 未完成

## QGate L0 机制对照（融合索引，2026-09-23 t_177caf7a）

- Requirement Traceability（QGate M13）→ 本 skill 三方对账矩阵（等效印证）
- Assumption Register（M14）→ `rd-clarify` §2.3 预设记录表（三来源标注+禁 LLM 代答，等效印证）
- Open Decision Register（M15）→ `_shared/knowledge/candidate/`（status 元数据）+ `release-plan` 准入第 12 项「未决决策关闭」（融合落地）
- Change Scope Check（M16）→ `code-review` 门 1 Eligibility + Gate 0 超出项判定（等效印证）
- Acceptance Coverage（L0.2）→ 本 skill GAP 判定 + `code-review` 双轴 Spec 轴（等效印证）
- API Contract Alignment（M8.1）/ Schema Structural Alignment（M8.2）/ Migration（L5.2）→ 本 skill 契约与迁移一致性断言节（v1.3.0 融合落地，t_116a351e；静态分析工具链登记 gap_register）

## Pitfalls

1. requirement 措辞模糊时，对**冻结原文**而非自己脑补的意图——发现模糊先 block 让上游澄清。
2. 测试基线必须先跑再改（改动后补基线 = 伪造对照）。
3. implementation-check.md 的「实现位置」列禁止写目录级（`src/foo.py`），必须到行号。
