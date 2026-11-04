# 执行观测贯通、验收 DSL、spec 任务卡与任务模型（W3）

> 日期: 2026-11-04
> 状态: 已实施
> 关联: 调研源=vivo《面向技术产品经理的 Agent Harness 设计》第 3/8/10 章；前置=2026-11-04-agentteams-execution-records（记录索引）、2026-10-21-swarmstudio-appendix-a-spec-index（A.1 三处登记）

## 任务卡审查七项

### 业务完成条件
四件产物各自可判定：①ExecutionRecord v2 字段在（新记录带关联字段、v1 旧档读取兼容）；②/api/harness/execution-join 四源归并返回且单源缺失不 500；③四断言（forbidden_tools/json_path/result_schema/side_effects_max）求值正反例全过；④七项机检对基线外 spec 生效且 l2-kit-parity 棘轮锁基线只许减。

### 输入与来源
输入=本仓 git 事实（HEAD d5201dedc 快照）＋调研文章全文（mp.weixin xDcGpE-s_UefbJwPwbE6uQ，2026-11-05 抓取存档 /tmp/wx-art/art.txt）；引用行号以当时文件为准，无外部数据源；不依赖运行态服务。

### 工作流边界
四件相互独立可并行评审；七项机检依赖 spec 模板先改（同批）；execution-join 依赖 W2 的 resultContract 时为动态 import fail-soft（W2 未合入=available:false，不算失败）；spec 模板/hooks 改动必须资产↔副本字节同步（parity 守门）。

### 工具与副作用
全部只读或新增文件；唯一写副作用=append 执行记录（旁路观测）与 gate-deny.jsonl（机检拦截留痕）。无外部系统写、无网络。幂等：端点只读；append 按 runId 幂等（既有语义）。

### 结果与证据
证据=测试命令输出（vitest 通过数、typecheck 零错）＋文件锚点（见「变更」段 file 列表）；六类故障样本如实标注「未执行真实模型」；执行记录 v1 旧档缺字段=未知（不猜）。

### 异常与恢复
json_path 非法路径=not found 判 no（不静默吞）；证据面缺席=unknown 不误伤；execution-join 单源异常=available:false 带原因；机检 bash 语法经 bash -n 冒烟；回滚=git revert 单批（四件无 schema 迁移、无破坏性 DDL）。

### 验收反例
必须被拦住：①禁用工具出现仍判 yes（forbidden_tools 失效）；②无证据结论通过（json_path every 语义失效）；③createdRecords=2 通过（side_effects_max 失效）；④七项机检对基线外新 spec 静默放行（机检失效）；⑤基线条目指向已删 spec（豁免墙腐化）。

## 变更

四件收口（全部 custom/ + skills/，零 patch）：

1. **执行记录字段贯通**：`ExecutionRecord` 增可选 `traceId/stepId/workflowVersion/promptVersion/inputRef/outputRef/retryCount/approvalId`（taskId/runId 已有）——补齐源文 08 节「单条可关联执行记录」在中央索引侧的字段面；版本升 v:2，读取器兼容 v1（缺字段即未知，不猜）。
2. **单端点 join**：`GET /api/harness/execution-join?runId=&taskId=` 一次返回执行记录 + 工具审计条目 + 执法审批单 + 结果投影，每源缺失 `{available:false, reason}`——「谁调了什么工具、是否重试、批单是什么、产物在哪」不再要跨四个分域端点手工拼。
3. **验收 DSL 四断言**：`custom/server/eval` 断言族增 `forbidden_tools`（禁用工具出现即失败）、`json_path`（$.a.b / $.items[*].x 最小子集取值+比较）、`result_schema`（必填键+基本类型）、`side_effects_max`（如 maxCreatedRecords 上限）——对齐源文 08 节契约用例（requiredTools/forbiddenTools/resultSchema/assertions/sideEffects），只做规则级求值，不承诺模型行为。
4. **六类故障样本（规则级）**：空输入/依赖不可用/重复提交/越权/拒绝审批/超时六样本以 DSL 结构落 `eval/__tests__/fixtures`，作为确定性回归输入——**未执行真实模型**（如实声明：样本是断言求值器的回归夹具，不是 AI 行为评测）。
5. **spec 七项任务卡**：`skills/swarm-yuan/assets/spec-template.md` 增「任务卡审查七项」段（业务完成条件/输入与来源/工作流边界/工具与副作用/结果与证据/异常与恢复/验收反例——源文 10 章模板）；`.swarm-yuan/hooks/spec-first-lib.sh` 增 `spf_taskcard_check`，pre-commit 调用：对不在 `.swarm-yuan/spec-taskcard-baseline.txt` 的 spec 检查七项标题存在，缺失即拦；baseline 初值=当前全部存量 spec（只许减，棘轮）；l2-kit-parity 字节一致同步。
6. **任务模型读模型**：新建 `custom/server/taskmodel/`——`TaskModel v1`（schemaVersion/userGoal/inputRefs[]/workflowVersion/artifactRefs[]/runs[]/conversation/available 细项），从 `readTaskDetailFast` 详情派生（纯函数 `deriveTaskModel`），缺字段 null 不猜；端点 `GET /api/harness/taskmodel/:taskId?board=` 挂 harness 路由前缀下（零 patch——bootstrap 挂载需补丁通道，读模型投影归观测面不改产品路由面）。**输入冻结（写路径 run 开启时 input_manifest 快照）未做**——需 kanban_db 写路径（patch 通道），如实挂账。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 | decisions.jsonl 行号 |
|------|------|------|------|------|---------|---------------------|
| 执行记录版本 | v:2 新字段可选、读端兼容 v1 | 强制迁移 | 记录是旁路观测，旧档缺字段=未知（fail-soft 契约），不值得迁移 | Mechanical | approved | 73 |
| 七项机检的存量处置 | baseline 全量豁免、只拦新 spec（只许减） | 立即全量强制 | 546 份存量 spec 无七项段，立即强制=全仓瘫痪；棘轮与 spec-sections-baseline 同范式 | Mechanical | approved | — |
| taskmodel 数据源 | 复用 kanban-task-fast 快道详情做纯函数派生 | 直连 SQLite 新查询 | 快道已按 CLI 形状 1:1 复刻且 fail-soft；纯函数可测、不引入第二套 SQL | Mechanical | approved | — |
| 六类故障样本形态 | DSL 断言夹具（规则级回归） | 真实模型评测集 | 零预算跑模型；本轮立的是「断言可表达+求值器正确」，AI 行为评测留 eval studio 通道 | Mechanical | approved | — |

## 验证

- `npx vitest run custom/server/execution-records custom/server/harness custom/server/eval custom/server/taskmodel custom/__tests__/l2-kit-parity.test.ts`
- `npm run typecheck:harness`（taskmodel 并入点名清单）
- A.1 三处登记（附录 A 标题计数/覆盖行/表行）随本批合并在主会话统一做（三批 spec 共用一次登记窗口）。

## 设计文档影响

- DESIGN_SYNC: touched
  - docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md —— §8.4 能力边界表补「任务模型读模型（taskmodel v1 只读投影）」与「执行记录 v2 关联字段」两行；本批合入时随批修订（L2 核验）。
