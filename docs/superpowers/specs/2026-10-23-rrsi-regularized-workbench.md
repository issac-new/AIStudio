# RRSI 吸收轮：改进实验台正则化（2026-10-23）

## 背景与来源

Google Cloud AI Research 论文《RRSI: Regularized Recursive Self-Improvement of Agent
Harnesses》（arXiv 2609.24972，v3 2026-10-04；代码 github.com/google-research/rrsi；
项目页 regularized-rsi.com；机器之心编译文 2026-10-23）。核心论点：Agent Harness
（提示词/控制流/工具/记忆/上下文管理）围绕冻结模型的迭代自改 = 递归自改进（RSI），
但对有限 evolve 任务集反复自改会过拟合——benchmark 特化、追逐评测噪声、复杂度堆积，
表现为「evolve 分更高、OOD 迁移更差、token 更贵」。RRSI 的立场是**正则化搜索过程，
而不是锁死可编辑空间**：提案端约束「怎么改」，选择端要求「每个想留下来的改动证明自己」。

SwarmStudio 已有完整的改进实验台（2026-10-19 落地，spec: 2026-10-19-harness2-improvement-workbench.md）：
提案→基线→批准→探测→组合→晋级（回归门）→回滚，八类可编辑面，冠军链即演化历史。
本仓映射后缺的正是 RRSI 的七项正则化机制。本轮吸收把改进闭环从「能自改」升级为
「有纪律地自改」。

## 论文机制 → 本仓落点（映射表）

| # | RRSI 机制（论文原文） | 本仓落点 |
|---|---|---|
| P1 | 退火编辑预算：b_t = ⌈b_min+(b_max−b_min)·½(1+cos(πt/T))⌉，后期强制单变量可归因 | `loop.ts` `annealedEditBudget()`；t=该面已采纳冠军数，T=20（env `HARNESS2_RSI_T`）；候选捆绑改动文件数（files+deletions，单文件=1）超 b_t → 提交与晋级双闸 blocker `edit_budget_exceeded` |
| P2 | 进化历史作证据：失败假设不复提 | 提案创建时扫描同面历史提案（rejected/rolled_back），假设词面 Jaccard ≥0.6 → `derived.regularization.hypothesisRetry` 警示（不硬拦，人裁决）；overview 新增 evolution 段呈现历史 |
| P3 | 停滞探测：w 轮无超越噪声带的进展 → 保留槽位给从未探索的组件 | `stallDetection()`：连续 w=3 个提案无采纳 → 该面 stalled；从未有提案的面列 `unexercised` → overview `evolution` 指令区引导转向 |
| S1 | 泄漏批评者：评测前读 diff，拒绝携带任务名/实体/答案/评测特化逻辑 | `findBenchmarkLeakage()`：确定性扫描候选内容与文件路径，命中评测集任务 id/断言文本/参照答案/题干 → 提交时（按基线集）与晋级时（按探测证据集）blocker `benchmark_leakage`；既有 `GRADER_VERDICT_MARKERS` 闸保持 |
| S2 | 噪声调整接受地板：δ=未改动基线重复评测的实测离散度，Ŝ(H′)≥S*−δ；δ 不许调参 | 新「噪声标定」：`POST /proposals/:id/noise` 用 ≥2 条同集真实基线运行算 passAt1 半极差=δ，存 proposal.noise；晋级门增益 ≤δ → blocker `gain_within_noise`（例外：该面首个提案=结构性探索，降为 warning）；未标定 → warning `noise_uncalibrated`（env `HARNESS2_RSI_REQUIRE_NOISE=1` 可升为 blocker）。**δ 不提供 env 覆盖**（论文纪律：调低 δ 只会买到噪声分） |
| S3 | 成本规则：带外增益须 ΔC ≤ β₀+β₁ΔS；带内增益只有结构性新组件才可进（coding 取 w_s=0） | 晋级门：增益超噪声带时，token 相对增量超过 β₀+β₁·(ΔS·100) → blocker `cost_unjustified`（β₀=0.10、β₁=0.25/百分点，即论文「每多一分允许 25% token 余量」的归一换算，env 可调） |
| S4 | 剪枝信号：窗口内组件最大增益 ≤0 → 列为删除目标交提案端 | `pruneSignal()`：最近 n_prune=4 个提案的全部已记录探测最大 passAt1 增量 ≤0 → 该面打 prune 旗，overview 指令区建议「做减法提案」；不自动删（提案端参考，与论文一致的 directive 定位） |
| 观 | evolve 分 ≠ 迁移分；30 轮曲线只有 10 次接受；噪声带地板可视化 | overview 新增 `evolution.timelines`（按面：轮次×通过率×token×噪声 δ＋提案去向计数）；面板新增「进化与正则化」区（SVG 曲线＋噪声带＋去向条＋各面正则化状态表） |

## 设计决策

1. **纯函数优先**：七个机制全部落在 `loop.ts` 纯函数层（不读盘不写库），service 只做
   编排与证据读取——与既有架构一致，单测覆盖全分支。
2. **门禁分级**：benchmark_leakage / gain_within_noise / cost_unjustified /
   edit_budget_exceeded 是 blocker（晋级硬闸）；noise_uncalibrated / stalled /
   hypothesis_retry / exploratory_within_noise 是 warning（人裁决）。理由：本台已有人工
   批准环节，正则化的职责是把「看不见的风险」显性化并在晋级口拦死，不取代人的发起权。
3. **噪声 δ 语义**：论文用未改动 harness 重复评测的 spread。本仓用同评测集、同基线
   内容的多条真实运行的 passAt1 **半极差**（(max−min)/2，保守、可解释、不需要分布假设）。
   样本 ≥2 且非 null 才成立；δ 无 env 调参入口（如实标注）。
4. **轮次 t 的口径**：论文 t=进化轮；本仓 = 该面未回滚冠军数（被采纳次数）。已回滚的
   冠军不计轮——回滚等于这轮没发生。
5. **成本规则换算**：论文 β₁ 依 domain 24.4~44.5（相对分 vs 相对 token）；本仓统一
   ΔS 用百分点（passAt1 差×100），β₁=0.25/百分点（对应论文 agentic/coding 的
   「每增 1 pass 允许 25% token 余量」），β₀=0.10。两者 env 可调但给缺省即用值。
6. **曲线用 SVG 不用 ECharts**：进化曲线是折线＋噪声带＋散点，SVG 模板即可；避开
   ECharts canvas 的 var() 坑与 jsdom 测试坑，颜色走 CSS token（governance 域 raw-hex
   预算为 0 永不放开）。
7. **存储向后兼容**：`Proposal.noise` 为可选新字段，旧 workbench.json 无需迁移；
   evolution 段由现有 proposals+champions 现算，不落盘。
8. **i18n**：全部进 `improve-i18n.ts` 域级小字典（zh/en 成对），不动全局 locale 树，
   零新 patch。

## 验证计划

- `loop.test.ts` 新增：退火预算三点校验（t=0→b_max、t=T/2、t≥T→b_min）、泄漏扫描
  命中/干净/短串免疫、假设相似度、停滞/剪枝、进化时间线、晋级门新四 blocker 与
  warning 全分支。
- `workbench-http.test.ts` 新增：噪声标定端点（同集校验/≥2 条/半极差）、提交期编辑
  预算拦截、overview evolution 段、晋级期泄漏拦截。
- `harness-improve-panel.test.ts`：新「进化与正则化」区渲染断言。
- 全量跑 harness workbench 相关套件 + tsc 类型检查；浏览器 web 版活体走查
  （localhost:8649，阶段⑥改进实验页签）。

## 决策记录

- **2026-10-23 · 用户指示**：深入调研 RRSI（微信文/arXiv 2609.24972/GitHub/项目页）
  并完善 SwarmStudio。裁决：吸收落点=改进实验台正则化（映射表八行），本 spec 即决策
  正本；七机制全落、门禁分级（blocker×4 / warning×4）、δ 不设调参入口、SVG 曲线零新
  图表依赖。
- **边界**：本轮不实现自动提案器（论文 proposer 是 LLM 自动改 harness；本台坚持
  「人提案、台正则、门拦险」的既有边界——正则化的是搜索纪律，发起权在人）。
  自动化提案器作为后续独立轮评估。
- **来源锚**：arxiv.org/abs/2609.24972（Table 2 消融：unregularized evolve 92.8 vs
  OOD 40.3/3.80M tokens；RRSI 90.5 vs 43.6/2.42M；Table 5 超参：T=20、b 1/4、w=3、
  n_prune=4、β₀=0.10、β₁≈25%/pass）；github.com/google-research/rrsi（模块
  propose/selection/critic/schedule）；regularized-rsi.com（"Regularize the search,
  not the harness"）。
