# RSI 生命周期综述吸收：环路审计＋证据角色披露＋技能失败三分归因（2026-11-20）

> 状态：已批准（用户裁决「全做」）
> 来源：《When, Where, and How Experience Becomes Structure: Mechanisms for Recursive Self-Improvement in LLM Agents》（中科院自动化所＋美团等 10 机构，alphaxiv 2611.recursive-self-improvement-llm-agentsv1）；公众号导读《42页综述！RSI的四条进化路线与七阶段生命周期》（模智空间 2026-11-20）。调研对账正本见 `docs/reports/2026-11-20-rsi-lifecycle-survey.md`。
> 边界：遵守 2026-11-01「机制扩展停止」裁定——本批零新增正则化晋级规则（零 blocker/warning 门码），只做可观测性与诊断（A 审计器、B 披露行、C 纯函数诊断）；不解锁递归深度（`rsi-maturity.ts` L4 硬边界不动）。

## 变更

### 问题（调研三个决定性发现）

1. **七阶段生命周期缺口在仓内不可见**：仓内五条真实更新环路（qgate-FAIL 经验回流／workbench 提案晋级／swarm-yuan 指纹更新／skill-lifecycle 退役／复盘-N台账外环）没有一处按 Collect→Evaluate→Diagnose→Abstract→Update→Verify→Consolidate 做覆盖审计；综述用 Figure 5 矩阵（20 环路）实证 Memory/Skill 路线 Verify 系统性缺位，同款缺口在仓内存在但无分析工具。
2. **留出集被晋级消费＝测试独立性消耗**：`loop-report.ts` heldout 门用留出读数参与候选接受决策（综述 Self-Harness 判据：留出分参与选择后不能当完全独立的最终测试）；仓内无「哪份证据在哪个决策角色被消费」的披露面。
3. **技能失败三分归因零覆盖**：综述 Figure 8——坏结果≠技能错（选错技能→改路由／照做但跳步→改 Harness 完成检查／流程缺步→改 Skill 本体）；仓内技能维护只有使用率信号与晋级差分，运行时失败落不到「该改哪里」。

### 范围（用户裁决：E+D+A+B+C 全做）

- **E** 调研报告落盘 `docs/reports/2026-11-20-rsi-lifecycle-survey.md`（对账矩阵正本，含三层验证×三留存×三挑战九格覆盖表与论文行号锚）。
- **D** 本 spec：把综述判据登记为在途批（Agnes 批一学习闭环、ai-native-batch2 认知批二）合并后的验收对照输入（见「决策记录」）。
- **A** 生命周期审计器 `custom/server/harness/rsi-lifecycle.ts`：纯函数声明式矩阵（5 环路×7 阶段，格态 implemented/partial/nr＋锚点＋缺口定性行）；REST `GET /api/harness/rsi-lifecycle`；面板节 `RsiLifecycleSection.vue`（挂 GovHarnessView，与 RsiMaturitySection 同范式）＋i18n zh/en。
- **B** 证据角色披露：`workbench/types.ts` 增 `EvidenceRoleLine`/`evidenceRoles?` 字段（向后兼容可选）；`loop-report.ts` 纯函数 `evidenceRoleLines()` 在晋级报告输出「heldout 已参与候选接受」等披露行——只披露不拦截（不新增门码）。
- **C** 技能失败三分归因：`custom/server/skillgov/skill-failure-attribution.ts` 纯函数（信号→selection_miss/execution_miss/skill_defect/supply_gap/unknown 五态＋修复目标建议）；`skillgov-controller.ts` 增 POST `/api/skillgov/failure-attribution`（只诊断不改行为）。

### 文件清单

新增：

- `docs/reports/2026-11-20-rsi-lifecycle-survey.md`（E）
- `custom/server/harness/rsi-lifecycle.ts`（A）
- `custom/server/harness/__tests__/rsi-lifecycle.test.ts`（A）
- `custom/client/governance/components/RsiLifecycleSection.vue`（A）
- `custom/server/harness/workbench/__tests__/evidence-roles.test.ts`（B）
- `custom/server/skillgov/skill-failure-attribution.ts`（C）
- `custom/server/skillgov/__tests__/skill-failure-attribution.test.ts`（C）

修改：

- `custom/server/harness/harness-controller.ts`：挂 `GET /rsi-lifecycle`（A）
- `custom/client/ia2/views/gov/GovHarnessView.vue`：引入 RsiLifecycleSection（A）
- `custom/client/governance/i18n.ts`：governance.harness 增 rsiLc* 键 zh/en 成对（A）
- `custom/server/harness/workbench/types.ts`：EvidenceRoleLine 类型＋PromotionGateReport 可选字段（B）
- `custom/server/harness/workbench/loop-report.ts`：evidenceRoleLines()＋evaluatePromotion 挂披露（B）
- `custom/server/skillgov/skillgov-controller.ts`：POST /failure-attribution（C）
- `config/mechanism-budget.json`：changes[] 登记 +0 类别条目（sunset＋配对说明）
- `docs/superpowers/specs/2026-10-19-harness2-improvement-workbench.md`：追加「证据角色披露（2026-11-20）」节（B 的设计正本同批修订，SPEC_REBIND 授权重绑）

## 决策记录

- **2026-11-20 · 用户裁决**：调研方案四批（E+D docs／A 审计器／B 证据角色／C 三分归因）「全做」。
- **门禁冻结遵守**：B 不新增 blocker/warning 门码——evidenceRoles 是 PromotionGateReport 的披露字段，不参与 ok 判定（11-01 裁定「判断规则不再增加，证据供给与可观测性归工作台」的边界内）。
- **A 的矩阵是声明式盘点非运行时探测**：格态与锚点为静态声明（与 rsi-maturity 的 fs 探测互补——那个答「RSI 到几级」，这个答「每条环路缺哪段」）；锚点漂移由测试抽查兜底，矩阵内容演进走本 spec 修订。
- **D 判据登记（在途批验收对照输入）**：Agnes 批一（`.claude/worktrees/agnes-learning-loop`，注入回执/效果归因/试用期/自动回滚）与 ai-native-batch2（对照投影 effect 三态）合并后，其验收应对照综述判据逐条核：①递归依赖成立＝等预算继承组 vs 从头组（对照实验，非轮数/首末分）；②复用≠递归（后续任务复用 alone 不证明递归依赖）；③效果恒三态不自动宣称有效（批二已对齐）。本 spec 不替在途批定验收，只登记对照义务。
- **NR 语义纪律**：矩阵 nr＝「未实现该阶段操作」，不等于「该环路无最终评估」（综述原文口径）；每格 note 必须定性「真缺口／论文允许省略／另批在途」。
- **sunset（机制预算）**：rsi-lifecycle 审计器 reviewBy=2027-02-20；retireWhen=矩阵连续两轮全绿（无 nr/partial 新增）且五环路结构稳定时，降级并入 rsi-maturity 或 spec 附录。零类别增量（无门/钩子/脚本/账本），配对＝B 的披露并入既有晋级报告不加新门、C 并入既有 skillgov 域不加新服务。

## 验证

- 单测（本轮新增三套）：`rsi-lifecycle.test.ts`（矩阵不变量：5×7 全覆盖／格态枚举合法／implemented·partial 必带锚点／gapLines 仅出自 nr·partial／汇总计数一致；锚点存在性抽查）；`evidence-roles.test.ts`（heldout 在场→披露行含「已参与候选接受」；缺席→不产出该行；evidenceRoles 不影响 ok/blockers）；`skill-failure-attribution.test.ts`（五态判定全分支＋修复目标映射＋fail-soft unknown）。
- 目标测试命令：`npx vitest run custom/server/harness/__tests__/rsi-lifecycle.test.ts custom/server/harness/workbench/__tests__/evidence-roles.test.ts custom/server/skillgov/__tests__/skill-failure-attribution.test.ts`；既有回归面：`npx vitest run custom/server/harness/__tests__/harness-controller.test.ts custom/server/harness/workbench`；类型：`npm run typecheck:harness`。
- REST 冒烟：起服务后 `curl /api/harness/rsi-lifecycle` 与 `POST /api/skillgov/failure-attribution` 返回 ok 结构（活体走查随面板节一并）。
- 全量：合并前 `npm test`（先确认 8647/8648 无活服务占口）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-19-harness2-improvement-workbench.md`：追加「证据角色披露（2026-11-20 RSI 生命周期轮 B）」节——PromotionGateReport 新增 evidenceRoles 可选披露字段（不参与判定），晋级报告披露 heldout/等预算/噪声/反事实已被候选接受消费的独立性损耗；授权修订走 SPEC_REBIND=1。
