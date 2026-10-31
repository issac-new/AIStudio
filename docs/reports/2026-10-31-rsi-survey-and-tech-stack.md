# RSI 当前综述与技术栈调研（2026-10-31）

> 用途：AIStudio 日常调研轮的外部世界锚点。结论按「实测数字 / 作者主张 / 摘要级」标注，未核验的不写成事实。
> 本报告不替代论文原文；引用条目均给 arXiv 或项目页。

## 一、三句话主旨

**RSI 是什么。** 在模型权重冻结的前提下，把 agent 的 harness（提示词、控制流、工具、记忆、上下文管理）当作可搜索、可评测、可采纳的对象，用「提案—评测—选择」的闭环反复自改，形成系统级而非权重级的递归自我改进。

**当前共识。** 这条路在分布内确实能涨分，但涨分里很大一部分不是真本事。HDA 在 11 个执行模型 × 3 个 harness 演化框架、21 个显著增益设置上实测：过拟合平均占增益 54%，测试时算力占 14%，两者合计在 21 个设置中有 14 个超过一半。因此 2026 年的研究重心已从「能不能自改」转向「怎么证明涨的是真能力」。

**最大风险。** 不是模型突然失控，而是**评测失真**：自改系统会自动朝评测信号的可利用面收敛（奖励黑客、基准特化、策略性低表现），而一旦改进机制本身被改写，人类监督会同步失效。可信 RSI 综述因此把「有效监督」单列为三大透镜之一。

## 二、技术栈地图

| 层 | 代表工作 | 关键机制 |
|---|---|---|
| 冻结模型 + 可编辑 harness | RRSI、DGM、Gödel Agent、ADAS、STOP | 模型不动，只改 harness 代码/提示/控制流；DGM 与 Gödel Agent 直接改自身源码，STOP 只改调用模型的脚手架程序 |
| 提案生成 | RRSI proposer、ADAS Meta Agent Search、CHASE Challenger | 退火编辑预算（后期只许单变量）、向提案者注入完整编辑史、停滞时导向未探索组件；ADAS 用「元 agent 写代码」遍历图灵完备的设计空间；CHASE 反向生成反事实基准来杀增益 |
| 选择与评测 | RRSI selector、HDA、Harness Evolution 评测重思 | 泄漏批评者、噪声调整接受地板、成本规则、剪枝信号；HDA 把增益拆成「产物过拟合 / 测试时算力 / 可泛化残差」；评测重思要求等预算基线 + 留出集 |
| 记忆 | Context Engineering 综述、SEAL（权重级对照） | 上下文检索/处理/管理三分；记忆操作暴露为工具（存/取/摘要/遗忘）；SEAL 走另一条路——自生成微调数据 + RL 做持久权重更新 |
| 工具与环境 | AlphaEvolve、DGM 沙箱、RepliBench | 程序化 evaluator 作适应度函数；候选在 git worktree/沙箱内构建，采纳版永远是一个 commit；RepliBench 测自主复制 |
| 安全治理 | Trustworthy RSI 综述、AI Sandbagging、奖励黑客综述 | 三透镜：改进有效性、约束保持、有效监督；四阶段 S1–S4 加「对改进机制本身再应用」RI；sandbagging 是「评测上的策略性低表现」 |
| 评测基准 | Terminal-Bench 2.1、SWE-bench Verified、ARC-AGI-3、EdgeBench 等 | 关键是搜索集与确认集分离；单一 benchmark 上进化出的 harness 迁移性极差 |

## 三、论文清单（按与 AIStudio 的相关度排序）

| 标题 | 年份 | arXiv | 核心贡献 | 对 AIStudio 的可借鉴点 | 核验状态 |
|---|---|---|---|---|---|
| RRSI: Regularized Recursive Self-Improvement of Agent Harnesses | 2026 | 2609.24972 | 把正则化落在搜索过程而非编辑空间；退火编辑预算、历史感知提案、泄漏批评者、噪声地板、成本规则、剪枝 | 改进实验台七机制的原始出处；已落地 | 已核验摘要与作者 |
| Harness-Delta Attribution: Dissecting Gains From Harness Evolution | 2026 | 2610.22466 | 把 harness 演化增益拆成过拟合/测试时算力/残差；21 个设置中过拟合平均 54%、算力 14% | 晋级门加「等预算基线归因」；本轮已落 D1 | 已核验摘要 |
| Rethinking the Evaluation of Harness Evolution for Agents | 2026 | 2607.12227 | 现有评测缺等预算基线、训练/测试信号混用；Terminal-Bench 2.1 上 harness 演化打不过简单并行采样 | 探测必须带同预算基线；pass@1 为主、pass@k 仅诊断 | 已核验摘要 |
| Trustworthy Recursive Self-Improvement in the Era of Large Models | 2026 | 2610.35193 | 首个可信 RSI 系统综述；三透镜（改进有效性/约束保持/有效监督）+ S1–S4 + RI | 约束保持门；监督能力自查；递归深度锁 1 | 已核验摘要 |
| A Survey of Self-Evolving Agents: What, When, How, and Where to Evolve | 2025-2026 | 2507.21046 | 四维分类学：演进对象（模型/记忆/工具/架构）、时序（测试内/测试间）、算法、场景 | RSI 成熟度分级可对齐四维；避免只盯提示词一层 | 已核验摘要 |
| Bad Genius: Counterfactual-Guided Harness Evolution Beyond Task-Specific Shortcuts | 2026 | 2609.18366 | CHASE：用「保持任务语义、变换执行协议」的反事实基准检验增益是否崩塌 | 泄漏扫描从静态文本匹配升级为可执行反事实 | 已核验摘要 |
| Darwin Gödel Machine | 2025 | 2505.22954 | 经验验证替代数学证明；档案采样（低分祖先也可当父代）；SWE-bench 20%→50% | 冠军链改档案 DAG，保留被拒分支作垫脚石 | 已核验摘要 |
| AlphaEvolve | 2025 | 2506.13131 | 演化式编码 agent + 可插拔 evaluator；4×4 复矩阵乘法 48 次标量乘 | evaluator 可插拔；程序数据库形态 | 已核验摘要 |
| SEAL: Self-Adapting Language Models | 2025 | 2506.10943 | 模型自生成 self-edit 数据 + RL 做权重更新 | 对照参照：AIStudio 明确不做权重层 | 已核验摘要 |
| Gödel Agent | 2024 | 2410.04444 | 连优化算法自身都可被优化；递归 SELF_IMPROVE | 递归深度=1 的反面教材，佐证 AIStudio 边界 | 已核验摘要 |
| ADAS / Meta Agent Search | 2024 | 2408.08435 | 把 agent 设计本身变成搜索问题；元 agent 编程 + 档案累积 | 提案器可复用档案结构 | 摘要级，未逐篇核验 |
| STOP | 2023 | 2310.02304 | 脚手架程序自举改进，并实测沙箱逃逸频率 | 把「绕过沙箱」当安全指标 | 摘要级 |
| Context Engineering 综述 | 2025 | 2507.13334 | 上下文工程成为独立学科；检索生成/处理/管理三组件 | memory 面缺「压缩/遗忘」策略 | 摘要级 |
| RepliBench | 2025 | 2504.18565 | 20 族 86 任务测自主复制；当前无完整复制威胁但子任务进步快 | R3 派生档加复制类风险测度 | 已核验摘要 |

## 四、机制卡片（11 个，标注本仓状态）

**D1 增益归因三分（HDA）**〔实测｜本轮已落地（服务层/REST，无 UI）〕
把测试时算力伪装成 harness 能力，是自改系统最常见的假增益。本仓落法：`ProbeMetrics.equalBudgetBaseline` 绑定同集、explicit 的等预算真实运行；`attributeGain()` 拆出 `computeGain` 与 `harnessGain`；晋级门在 `harnessGain <= 0` 时硬拦 `gain_explained_by_compute`，算力贡献过半时警告 `gain_mostly_compute`。未绑定时默认 warning，`HARNESS2_RSI_REQUIRE_ATTRIBUTION=1` 升 blocker。当前等预算运行需在 record 时显式传 `equalBudgetBaselineRunId`，自动探测尚未生成该字段。

**D2 反事实基准（CHASE）**〔实测｜未落地〕
任务留出抓不到协议级捷径。落法：提案采纳后生成「保持语义、变换执行协议」的变体（改文件名、改工具返回格式、改错误注入），增益崩塌即判捷径。落点：Loop Graph 场景库 + 实验台探测证据集。

**D3 开放档案与垫脚石（DGM/ADAS）**〔实测｜部分缺〕
纯爬山会丢掉低分但通往最优的祖先。落法：champion 链改 DAG，保留 rejected 分支作父代候选，按「分数 × 新颖度」采样。

**D4 匹配预算的 pass@k（评测重思）**〔实测｜未落地〕
pass@5 上升可能只是多试几次。落法：探测同时记 pass@1 与 pass@k，晋级只看 pass@1，pass@k 仅诊断。

**D5 约束保持门（Trustworthy RSI）**〔主张｜本轮已落地（服务层/REST，无 UI）〕
能力涨了但行为约束悄悄松了。本仓落法：`Proposal.constraints` 记录一组「不许退化」断言（拒答率、权限边界、审计留痕等），`POST /api/harness/workbench/proposals/:id/constraints` 记录 actor 与 evidenceRef；晋级门对 fail 硬拦 `constraint_regression`，unknown 警告，未记录默认 warning，`HARNESS2_RSI_REQUIRE_CONSTRAINTS=1` 升 blocker。当前无前端录入面，下一轮补。

**D6 评测信号分级（机械断言 > LLM 判分）**〔主张｜已落地，需强化〕
LLM 判分器本身可被 gaming。优先级：退出码 > 结构化断言 > LLM 判分；LLM 判分记录判分器版本与提示词快照。

**D7 提案端全历史注入（RRSI proposer）**〔实测｜部分缺〕
现在只有 Jaccard 事后警告；应把该面采纳/拒绝/回滚历史与失败原因一并喂给起草器。

**D8 退火编辑预算**〔实测｜已落地〕
`annealedEditBudget(t)`：t=该面已采纳冠军数，T=20，余弦退火从 b_max 到 b_min，后期强制单变量可归因。

**D9 噪声调整接受地板 δ**〔实测｜已落地〕
δ = 同集未改动基线重复评测的半极差；增益 ≤ δ 判为噪声；δ 刻意不提供 env 调参入口。

**D10 剪枝/做减法信号**〔实测｜已落地但只到预警〕
`pruneSignal()` 连续 4 个提案最大增益 ≤0 时打旗；目前只是提示，建议升级为「删除提案」模板。

**D11 记忆作为可演化剧本（ACE / memory-as-action）**〔摘要级｜未落地〕
记忆只增不减会变成噪声源。落法：存/取/摘要/遗忘作为显式动作，由评测反馈决定保留哪条；落点 `surface-registry` 的 memory 面 + 既有 distillgate。

## 五、失效模式与治理对策

| 失效模式 | 证据 | 治理对策 |
|---|---|---|
| 搜索集过拟合 | 增益 54% 为过拟合；Terminal-Bench 2.1 上 harness 演化打不过并行采样 | 噪声地板 + 归因三分 + 匹配预算基线 |
| 基准级捷径 | 任务留出抓不到协议级相关 | 反事实协议变换 + 泄漏批评者 |
| 测试时算力伪装 | TTS 占增益 14% | pass@1 为准，pass@k 只作诊断 |
| 复杂度堆积 | RRSI 核心动机；剪枝信号存在即为承认 | 退火编辑预算 + 剪枝提案 + 成本规则 |
| 奖励黑客 / 判分器 gaming | DGM 复现：变体删掉检测标记而非解题；奖励黑客已有四级分类 | 机械断言优先、运行时隔离、判分器指纹 |
| Sandbagging | 前沿模型可被提示/微调为在危险能力评测上策略性低表现 | 能力激发对照 + 多信号交叉 |
| 评测污染 | 深度研究 agent 检索到基准答案，最高虚增约 4% | 隔离沙箱、检索轨迹留痕、训练/测试通道分离 |
| 自我复制 | RepliBench：最佳模型 15/20 族 pass@10 >50%，但尚无完整复制威胁 | 复制类任务纳入 R3 派生档准入测度 |
| 监督失效 | 改进机制被改写后人类监督同步弱化 | 递归深度锁 1；改进机制修改权留人 |

## 六、与 AIStudio 已有资产的对照

| 已有资产 | 位置 | 覆盖情况 |
|---|---|---|
| RRSI 七机制 | `custom/server/harness/workbench/loop.ts`；`2026-10-23-rrsi-regularized-workbench.md` | 全落地，blocker/warning 分级 |
| 八类可编辑面 | `surface-registry.ts` | 系统提示词/护栏/记忆/工具指导/子智能体/Skills/脚本/插件 |
| 改进实验台闭环 | 提案→基线→批准→探测→组合→晋级→回滚 | 有 champion 链、Pareto 双目标、退休候选 |
| RSI 内核五步循环 + 四条硬边界 | `2026-09-18-rsi-kernel-design.md` | 单机已实施，R0-R3 阶梯 + 人审采纳 |
| RSI 分级自检 | `custom/server/harness/rsi-maturity.ts` | L1-L3 达成，L4 刻意未达成（递归深度锁 1） |
| 机械验收纪律 | 全仓 | 与 D6 一致，是既有强项 |

**本轮补上的两块**：D1 增益归因、D5 约束保持门。**仍缺的按优先级**：

| 优先级 | 缺口 | 对应机制 | 理由 |
|---|---|---|---|
| P1 | 反事实协议变体 | D2 | 现有 `findBenchmarkLeakage` 只做静态文本匹配，抓不到协议级捷径 |
| P1 | 档案 DAG（保留劣解祖先） | D3 | champion 链是单线，天然丢掉垫脚石 |
| P2 | 起草器注入进化史 | D7 | 机制已有一半（Jaccard 警告），补全成本低 |
| P2 | 剪枝升级为删除提案模板 | D10 | 现在只会加法，长期必然复杂度堆积 |
| P2 | 记忆压缩/遗忘策略 | D11 | memory 面可编辑但策略缺位 |

## 七、来源

- RRSI — https://arxiv.org/abs/2609.24972 ｜ https://github.com/google-research/rrsi
- Trustworthy RSI — https://arxiv.org/abs/2610.35193
- HDA — https://arxiv.org/abs/2610.22466
- Rethinking Harness Evolution — https://arxiv.org/abs/2607.12227
- Self-Evolving Agents survey — https://arxiv.org/abs/2507.21046
- CHASE / Bad Genius — https://arxiv.org/abs/2609.18366
- DGM — https://arxiv.org/abs/2505.22954
- AlphaEvolve — https://arxiv.org/abs/2506.13131
- SEAL — https://arxiv.org/abs/2506.10943
- Gödel Agent — https://arxiv.org/abs/2410.04444
- ADAS — https://arxiv.org/abs/2408.08435（摘要级）
- STOP — https://arxiv.org/abs/2310.02304（摘要级）
- Context Engineering — https://arxiv.org/abs/2507.13334（摘要级）
- RepliBench — https://arxiv.org/abs/2504.18565

**核验边界**：前 8 条与 RepliBench 已核对 arXiv 标题/摘要/提交日期；ADAS、STOP、Context Engineering 只做摘要级引用，未逐篇读全文。所有「54%」「14%」「20%→50%」等数字来自论文摘要或检索摘要，未逐表复核。
