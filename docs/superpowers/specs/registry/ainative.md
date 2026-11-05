# 规格库·ainative

> 主规格库（2026-11-05 AI Native 吸收批 T7 立）：聚合本域已归档 spec 的
> delta 需求（OpenSpec Spec-Anchored 语义）。registry/ 为子目录，不进 A.1 与
> design-index 的根目录直接文件集合（两者均为 flat 扫描）。

---

## 2026-11-05 · 2026-11-05-ainative-absorption.md
### ADDED

### Requirement: 规格保真度门
治理 spec 的「变更」段须含可验证验收（GWT 或含判据验收行）、「决策记录」段至少 1 条决策行、全文零模糊词（词表单一源 `config/fuzzy-words.json`）与零 TBD。档位 `SPEC_FIDELITY_ENFORCE=warn|block`，存量债走基线棘轮（只许减）。

#### Scenario: 新 spec 含模糊词
- **WHEN** 基线外 spec 正文命中模糊词表（围栏与行内 code 除外）
- **THEN** L3 spec-first 门输出 gate_spec_fidelity 违规（block 档强拦）

### Requirement: 统一终止原因码
Loop/门禁/看板/回合四族终态词表可映射到统一十七码视图（`custom/server/loop/termination.ts`），未知输入落 UNKNOWN 不抛错；`GET /api/harness/terminations` 输出 byCode/bySubsystem 分布（数据面 fail-soft）。

#### Scenario: 未知终态输入
- **WHEN** 任一映射函数收到词表外取值
- **THEN** 返回 UNKNOWN 且不抛错

### Requirement: 墙钟硬中止
`run_budget_seconds` 设置后，通用循环在迭代边界判 100% 耗尽即以 `wall_clock_exhausted` 收口（不打断在途工具调用、预算后不发摘要请求）；未设置预算行为不变。迭代默认上限四方一致为 200。

#### Scenario: 预算耗尽
- **WHEN** 回合内墙钟越过 run_budget_seconds 且工具调用已返回
- **THEN** 本回合终止，退出原因 wall_clock_exhausted

### Requirement: 三种死法检测
颤振（同文件反复编辑且其间验证连败）入 runaway 第七信号；Plan Mode requested 超 TTL 自动过期（默认 30 分钟）；pr-babysitter 模板带无变化轮询上限（默认 12 次）并写明升级人工。

#### Scenario: 计划悬挂
- **WHEN** requested 计划超 TTL 未裁决
- **THEN** 状态转 expired 且不可再 confirm，plan.stale 检测器可见

### Requirement: harness-doctor 体检
`npm run doctor` 输出八项只读体检（上下文文档分叉/死链/权限总闸/沙箱/迭代墙钟一致/缓存层序/反馈新鲜度/机制退役），fail 抬退出码 1，`--json` 可机消费；nine-layers 不得含硬编码 true 的自检项。

#### Scenario: 机制退役过期
- **WHEN** mechanism-budget 任一 sunset 条目 reviewBy 已过
- **THEN** doctor 报 fail 且退出码 1

### Requirement: CI 产品治理门
`governance.yml` 在 push/PR 跑 governance-lint --budget、merge-invariants --check、typecheck:harness（CI 内联装工具链）；全量 npm test 因依赖本地注入态 vendor 树不入 CI。

#### Scenario: 推送触发
- **WHEN** main 收到 push 或 PR 开启
- **THEN** 治理静态门三命令在干净 CI 环境执行并以失败阻断

### Requirement: delta 规格归档
`spec-archive.mjs` 解析 spec 的 ADDED/MODIFIED/REMOVED Requirements 合并进 `registry/<域>.md`（日志式溯源追加，MODIFIED/REMOVED 缺既有正本即告警登记）；默认盖章不动源文件（A.1/design-index 零扰动），`--move` 提供完整归档联动。

#### Scenario: 首次归档
- **WHEN** 含 delta 段的 spec 执行归档
- **THEN** registry 域文件创建并追加带日期溯源的条目，源 spec 盖「已归档」戳

### Requirement: 上下文开销比
`obs-signals` 端点新增 `contextOverhead` 面：按会话聚合工具结果与读取字符为分子、最终回复与完成任务为分母的字符代理比值（token 口径挂账），缺数据 available:false 不猜数。

#### Scenario: 零分母会话
- **WHEN** 会话无有效产出（分母为零）
- **THEN** 该会话不计入比值（不产生无穷大）

### Requirement: AI Native 评分卡
`GET /api/harness/ai-native-scorecard` 输出 12 条判据（6 正 5 反 1 缓存）的达标态，逐条映射既有数据源，缺失标 unknown 不猜数，前端 governance 面板呈现。

#### Scenario: 数据源缺席
- **WHEN** 某判据的数据面不可用
- **THEN** 该判据标 unknown 且不计入达标分子
