# SwarmStudio 企业 Agent 框架完善方案（闸门收口 + 自改进闭环 + 决策分层）

> 依据：ThinkingAgent《Muse/Jev/Ontology 企业 Agent 架构》三轮调研对账（2026-10-19）。
> 对账确认：#2 workbench 回滚、#8 晋级门语义已由 zcode-eval-closure 会话（2f88ddb1）完成，本方案不含。
> 本方案为剩余 8 项（#1/#3/#4/#5/#6/#7/#9/#10）的实施与验收单一事实源。

## 决策记录

| 项 | 裁决 | 理由 |
|---|---|---|
| #2/#8 排除 | 已被 zcode-eval-closure 完成（实测 main 6/6 绿） | 不重复施工 |
| #1 优先 | 闸门可被绕过会让下游所有指标失真 | 先修闸再谈飞轮 |
| #4 默认开 | 关闭处置单即回流回归库，带开关可关 | 默认复利，可回退 |
| #5 主库归一 | workbench experiences 为主、expcandidates 为上游候选池 | 消两套经验库分裂 |
| #9 影子先行 | 先记录判官建议+置信度，不接管真值 | 攒校准真值再定阈值 |
| 仓库分工 | simharness=#1；overlay worktree=#3/#4/#5/#6/#7/#9/#10 | simharness 是闸门运行面 |

## 一、闸门收口（#1，simharness feat/gate-closure）

**问题（代码实证）**：
- 安全评审非硬闸：`aipay-scenario.sh:822` 涉敏安全评审是独立 if 块，超时分支（`:940-967`）只记 ISSUE 不置键不终止；`gate_blocked` 全部调用点（`:441/1101/1888/2158/2176/2473`）均不检查 `security_review_done`。arch 先 PASS、secops 未回复时 `g2_arch_pass` 照常落键。
- G3 只记不拦：`:1444` 无条件 `sset_once g3_code_pass`，无任何 `gate_blocked g3_code_pass`。
- UAT 有条件通过等价全过：`:2270` 非全过只记 `uat-conditional`，`:2278` 仍 `sset_once uat_done`，复盘 `:2473` 只查 `uat_done`。
- G6 键口径分裂：第24步复盘用 `retro_done`（`steps-registry.ts:78`），六闸徽标读 `report_done`（`steps-registry.ts:95`），demo-kit 用 `retro_done`。

**改动**：
1. G2 落 `g2_arch_pass` 前，先硬校验 `security_review_done` 已置（涉敏轮）。非涉敏轮该键已直接置 1（`:825`），不受影响。校验缺失即 `fail` 中止本轮（与 gate_blocked 同语义），不静默放行。
2. G3 后 G4 前加 `gate_blocked g3_code_pass defect`（G4 的 gate_blocked 已是 `g4_pass ready`，在其前置 G3 校验）。
3. UAT 改为：全过才落 `uat_done`；有条件通过落 `uat_conditional`（新问题键），复盘门改为「`uat_done` 或 `uat_conditional` + bella 显式批准事件 `UAT-COND-APPROVED` 落 `approved.events`」。允许 bella 人对有条件项放行，但留痕且非默认。
4. G6 统一为 `retro_done`：`steps-registry.ts:95` 徽标键 `report_done`→`retro_done`；demo-kit 已是 `retro_done` 无需改。

**验收**：每个绕过面配负面测试（simharness `discipline-v88-810-gates.test.sh` 增补 case）：缺 `security_review_done` 时 G2 拒绝置键；缺 `g3_code_pass` 时 G4 拒绝；UAT 非全过不落 `uat_done` 落 `uat_conditional`；徽标读 `retro_done`。

## 二、幽灵状态清理（#3，overlay）

`stage-task-filter.ts:11` ④映射含 `in_progress`，但九态枚举无此值（`kanban_db.py:916`/`kanban_workflow.py:142`），永不命中。删之。

## 三、评测关闭自动回流（#4，overlay）

**问题**：处置单机械关闭（`eval/store.ts:442-479`）后不调 `reflowTaskToSet`（`:579-638`），失败场景不自动变永久回归用例，全靠人工按钮（`client/eval/api.ts:246`）。

**改动**：`verifyRemediation` 关闭分支内调用 `reflowTaskToSet`，目标集固定为「回归样本库」（沿用现有回归集约定），加内容指纹幂等去重。新增 `autoReflowOnClose` 配置（默认 true，`eval/types.ts`）。密封集与自指仍拒绝。

**验收**：修复关闭后回归库自动 +1 题；重跑回归集覆盖该场景；幂等（重复关闭不重复加）；`autoReflowOnClose=false` 时不回流。

## 四、经验库合流（#5，overlay）

**问题**：workbench `experiences`（workbench.json）与复盘/注入消费的 `expcandidates/exp-candidates.json`（`aipay-scenario.sh:2593`）两套互不相通；`experienceIds` 是死字段（仅定义/写入/测试，无读取方，`service.ts:211`）；导入时 `domain` 硬编码 `general`（`service.ts:623`）。

**改动**：
- `service.ts:623` 导入时保留 expcandidate 真实 domain（若候选带 domain 字段）。
- `createProposal` 读 `experienceIds` 关联经验，详情/提案视图可见引用经验；前端 `HarnessImprovePanel.vue:193` 传该字段（提供「引用该经验新建提案」入口）。
- G6 复盘生成器读 workbench experiences 合并视图（`aipay-scenario.sh:2593` 增补读 workbench.json）。

**验收**：同域经验可检索；提案详情可见引用经验；复盘台账含 workbench 采纳经验数；domain 不再全 general。

## 五、评测裁判与过程覆盖（#6/#7，overlay）

- #6 `eval/types.ts:419-425`：默认 `judgeModels` 至少两裁判（同模型不同温度或配 `EVAL_JUDGE_MODELS`）；校准报告（`calibration.ts`）按 S0/S1/人工三来源分别展示；单裁判时报告显式标「未校准」。
- #7 `eval/metrics.ts:127-136`：报告新增 `processCoverage`（有期望序列样本数/总样本数），低于阈值（如 <0.5）标 warning，不静默。

**验收**：默认两裁判生效；校准分来源；`processCoverage` 出现在报告且低覆盖告警。

## 六、决策影子层（#9，overlay clusterinspector）

**改动**：9 类催办 + 1→2→3 升级接入可插拔判官接口 `DecisionJudge`。现有规则判官照常执行（真值不变）；影子判官并行记录「建议动作 + 置信度 + 特征」（静默时长/历史催办响应率/任务类型/失败次数），写 `decisiongraph` 不改行为。新增 `CLUSTER_INSPECTOR_SHADOW_JUDGE` 开关（默认 on，仅记录）。

**验收**：影子日志含建议与置信度；规则真值不受影响；可导出对照报告。

## 七、任务级自治度指标（#10，overlay）

**改动**：`harness/maturity.ts` 新增任务级口径（非仅组织级 `humanInterventionRate`）：无人工介入完成率、人工介入次数/任务、自动完成占比、代偿笔数/任务。数据源 `tasks`/`task_events`/`task_runs` + 审批历史 + 派发台账 + 代偿台账。进成熟度报告 + 阶段看板。需给 `task_events` 补 actor 标注或 ETL。

**验收**：四项指标进 `/api/harness/maturity` 且前端看板可见。

## 跨项验收

- overlay：`npx vitest run custom/server/eval custom/server/harness custom/server/expcandidates custom/server/clusterinspector` 全绿；`npm run test:eval` 绿。
- simharness：`bash simharness/mux/tests/discipline-v88-810-gates.test.sh` 绿 + 新增负面 case 绿。
- 合并：各自 `--no-ff` 合 main；双仓推送。
