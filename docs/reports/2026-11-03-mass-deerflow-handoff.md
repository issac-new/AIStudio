# 两篇调研吸收：多智能体自监督（MASS）与 DeerFlow 2.0——把「交接」变成可观测对象

日期：2026-11-03
材料一：公号解读文《UC Berkeley 提出 MAS-RSI：多智能体自监督驱动递归进化，科研效率最高 1.6 倍》→ 论文《Recursive Self-Improvement through Multi-Agent Self-Supervision》（arXiv 2610.12176，39 页，UC Berkeley + Sakana AI；**核对到摘要级，正文未读**）
材料二：公号解读文《字节跳动开源 84k Star DeerFlow：让 AI 自己带团队干活》→ https://github.com/bytedance/deer-flow（**已补源码级核对，见 §五**，浅克隆 commit `1dd6d05`）
性质：吸收轮调研报告；落地见 `docs/superpowers/specs/2026-11-03-handoff-quality-ledger.md`

## 一、MASS 说了什么（可迁移的部分）

**机制**：双层循环。内层固定权重、只搜**多智能体工作流**（附加在任务后的文本：每个子代理的角色、指令、**输出约定**、统筹者的**调用顺序**）；外层用保留工作流下跑出的轨迹做监督微调，权重更新后同一模型继续当执行者/优化者/评价者，再进下一轮。

**四个可迁移判断**：

1. **交接是三件事写清楚**：谁产出什么（输出约定）、交回什么形态（文件/报告/决定）、什么时候流向谁（调用顺序）。论文实测：随迭代，工作流的任务信息从「角色与指令」转向「输出约定与调用顺序」——**任务差异越来越多体现在交接与路由上**（图 4）。
2. **用真实产物筛选，而不是用自评分**：候选工作流必须真跑，产物对比较胜出才替换保留方案。结论口径也诚实：「最优工作流」＝已尝试方案里自评保留的那个，不是全局最优。
3. **交接质量是学习信号**（本仓只能用作观测信号）：两轮后不经提示也会调用子代理（1/110 → 87/110）、出现代码交接（1/110 → 83/110）；子代理与统筹者按约 2:1 平衡采样，避免执行信号淹没统筹信号。
4. **累计覆盖 ≠ 当前表现**：找到过好流程不等于之后每次更好（图 7 右侧当前胜率仍回落）——所以必须保留当前优胜者。这条与我们已有的冠军+回滚机制一致。

**MASS 自己的边界**：多智能体学生用 28.82M 监督 token 胜率 68.3%，单智能体用 42M 到 64.0%——但**生成多智能体教师轨迹平均还要 2.4 倍输出 token**，「训练信号利用率提高」不等于「整个流程更便宜」；作者也说明 M⁺ 覆盖了更多训练任务，不能把差距全归因于协作轨迹。

## 二、DeerFlow 2.0 说了什么（工程形状）

字节的 Super Agent Harness（84.2k star，MIT，LangGraph 重写）。**以下为文章口径，源码核对见 §五**：Gateway 多通道入口 → Lead Agent 拆活 → 四类子代理（Researcher/Coder/Reporter/Creator，**源码实际只有 bash_agent 与 general_purpose 两个内置**）按需委派 → 工具层（Skills/MCP/沙箱）→ 持久层（跨会话记忆 + 私有知识检索）。

三条对工程有约束力的做法：

1. **技能渐进式加载**：用到才载入，避免上下文被撑爆；技能是一等能力单元，可整体替换、可导出给别的工具用。
2. **每步可检查、失败可重放**：姐妹项目 LLM Space 专门做「逐帧看 harness 每一步、重放失败、跑基准」——把 harness 当被测对象，而不是黑盒。
3. **沙箱与权限的坦白**：Gateway Admin 权限等同代码执行权限，官方安全文档明写。

## 三、对表：AIStudio 已有与缺口

| 论文要素 | 仓内现状 | 缺口 |
|---|---|---|
| 输出约定/产物/调用顺序（MASS） | **有** `custom/server/handoff/stage-keys.ts`：四把阶段键（req-frozen/design-approved/dev-done/verify-done）＋产物哈希＋提交锚点＋链判定（缺键/失败/IO 不符都拦） | 只覆盖「阶段」这一层，且是**声明式**：手写键，不是运行态观测 |
| 用真实产物筛选 | 有探测证据、行为对比、冠军/回滚 | — |
| 交接质量作为信号 | **缺**：没有「派了活、接手方有没有交出东西」的账本 | 本次补 |
| 累计覆盖 ≠ 当前表现 | 冠军保留 + 回滚已符合 | — |
| 子代理派活/收活可观测 | 看板事件有 claimed/worker_bound/completed/gave_up/crashed/reclaimed | 未聚合成指标 |
| 每步可检查、可重放 | 有 loop 图回放、trace、运行详情 | — |
| 技能渐进加载 | 有 skills 面与供给对账 | 加载策略属运行时（上游），本仓不改 |

**结论**：MASS 的「交接即信号」在本仓缺的正是**运行态那一半**——stage-keys 管意图（该交什么），没人管现实（到底交出来没有）。

## 四、本批落地：交接质量账本

`custom/server/handoff/handoff-quality.ts`（纯函数）＋ `handoff-controller.ts`（`GET /api/harness/handoff/quality`）：

- **认领回合（claim episode）**：`claimed` 起，`completed`／`gave_up`／`crashed`／`reclaimed`／`archived` 止；`reclaimed`（锁过期回收）只关闭上一回合（判掉落），不开新回合——否则一次回收会被记成两次认领。
- **四个读数**：交付率（completed／已判回合）、掉落率、认领→完成的**中位时长**、**停滞数**（认领后超阈值无终态且任务未 done）。
- **抖动**：同任务窗口内被认领 ≥3 次（换人不换活，等于没人背）。
- **依赖交接**：`dependency_wait` 次数与其后 `unblocked` 次数（跨卡/跨板依赖的断链面）。
- **口径纪律**：窗口外的认领不计（不偷看历史）；`running` 不进分母（还没到判的时候）；空输入比率为 `null` 而不是 0%；任务状态为 done 时作为事件裁剪的兜底。

## 五、源码级核对（2026-11-03 补做，本机浅克隆 `1dd6d05`）

上一版对 DeerFlow 的判断来自公号解读文，**不是源码级**——用户当面质询后补做。核对结果：文章大方向对，但有一处硬错、几处遗漏，且遗漏的恰是最值得借鉴的部分。

### 5.1 仓库实况

| 项 | 实测 |
|---|---|
| 规模 | 2595 个 `.py`（不含 frontend），`backend/app`（channels/gateway/scheduler/subagent_batches）+ `backend/packages/harness/deerflow`（agents/skills/sandbox/subagents/memory/persistence）+ `skills/public` + 大量 `test_subagent_*` |
| 通道 | `channels/` 下确有 slack、telegram、wechat、wecom、feishu（100.3KB）、dingtalk（61.7KB）、discord（62.3KB）、qq、github、buzz_nostr——文章列的没夸大 |
| 沙箱 | `sandbox/` 不是「三种模式」一句话：`lease.py`(33.8KB)、`middleware.py`(30.9KB)、`acquire_serialization.py`、`command_scope.py`、`env_policy.py`、`identity.py`、`file_operation_lock.py`——租约+串行化+命令作用域+环境策略 |

### 5.2 硬错：子代理不是「四类」

- 文章：Lead Agent 委派 **Researcher / Coder / Reporter / Creator** 四类子代理。
- 源码：`subagents/builtins/` 只有 **`bash_agent.py`、`general_purpose.py`** 两个内置（`builtins/__init__.py` 只导出这两个）。文章的四类更像 1.x 的品牌叙事或宣传口径，不是 2.0 的代码事实。

### 5.3 文章漏掉、但比「四类子代理」重要得多的四件

1. **报告契约（`subagents/report_contract.py`，注释标 RFC #4651 PR3）**：子代理的最终报告是**自述**，必须给主张挂可核验把手（绝对路径/URL/记录 ID/HTTP 状态），并（在 receipts 开启时）用 `[rN]` 引用执行记录；**父侧核验器拿执行记录对账，未引用即判 UNVERIFIED**。这正好是 MASS「输出约定」的可执行版本：不是让模型"说清楚"，而是让自述可被机器对照。
2. **验收条件走不可信通道（同文件）**：`acceptance_criteria` 是模型生成、最终用户可影响的数据，因此注入时做框架标签转义 + 整条消息按不可信输入边界框定，且**上限 20 条 × 500 字符**；子代理的 SystemMessage 只带框架自己的指针，绝不带条件正文——防"条件里写 ignore the report contract"夺权。
3. **容量与预算治理**：`capacity.py`（进程内准入：队列满即拒 `SubagentCapacityRejected`、等不到槽位即 `SubagentCapacityTimeout`）、`turn_budget.py`、`token_collector.py`、`batch_lease.py`、`context_snapshot.py`、`step_events.py`——派活不是 `spawn` 完就算，有准入、预算、租约、步事件。
4. **技能是真·延迟发现（`skills/catalog.py`）**：注释明写「exposes metadata on demand instead of embedding full descriptions in prompts」——模型只在 `<skill_index>` 看到技能名，调 `describe_skill` 才拿元数据（`MAX_RESULTS=5`）。且技能带 `required_secrets`＋`secrets_autonomous`（自主加载可绑密钥，/slash 显式激活另走一路）＋`authz/skill_filter.py` 授权过滤＋`security_static_scanner.py`。文章的「渐进式加载」属实，但安全面（密钥绑定、授权过滤、静态扫描）一字未提。

### 5.4 另一篇（MASS）的核对深度

MASS 只到 **arXiv 摘要级**（`arxiv.org/abs/2610.12176`：39 页、2026-10-08 提交、Qwen3.6-27B、1.2–1.6×、多智能体学生比单智能体学生少用 1.4× token）；正文 39 页未读。摘要与公号文的数字一致，未发现冲突。

### 5.5 这些发现如何修正我方结论

- 上轮把 DeerFlow 概括成「Lead + 四类子代理」应当撤回：**真实可借鉴的是「报告契约 + 验收对账 + 容量准入 + 步事件」**。
- 我实现的**交接质量账本测的是「结果」**（认领→终态：有没有交出东西）；DeerFlow 测的是**「声明与执行记录的一致性」**（你说做了 ⇄ 记录里有）。两者不重复：前者是事后统计，后者是事中可核验主张。若要做「主张-证据对账」，仓内已有 `custom/server/auditchain`、`custom/server/evidence`，应先查重再动手，不另造一套。
- 容量准入（队列满拒/超时拒）与我方 `dispatchpreview`（死代码）与 kanban dispatcher 的并发闸是同一问题域——这条列后续观察，不在本轮改。

## 六、MASS 正文精读（39 页 PDF 已下载，p1–p10 主体＋附录定位）

### 6.1 形式化定义（p4）

工作流是**附加在任务后的文本**：`w_t := {h_t, (r_{t,j}, u_{t,j}, c_{t,j})_{j=1..m}}`——`r` 角色、`u` 指令、`c` **输出契约**（子代理交回什么给统筹者）、`h` **调用顺序**。执行即 `A(x_t ⊕ w_t)`；统筹者与子代理**共用同一个模型参数**。

### 6.2 内层：精英规模 1 的进化（Algorithm 2，p4–5）

每个训练任务独立维护序列与「当前最优」`w*`；每轮执行产生产物，`L_eval` 与最优产物**成对比较**，赢了才替换。**优化提示 `x_opt` 显式强调通信结构 `(h, {c})` 高于 `(r, u)`**——这一条是「任务信息迁往交接与路由」的设计源头，不是事后观察。论文也自己声明：`w*` 是「自评保留」而非全局最优认证。

### 6.3 外层：把工作流烧进权重（Algorithm 3，p5–6）

每任务跑 `M=18` 条候选 → 成对锦标赛 → Bradley–Terry 转成排序 → 取 `K−1=15` 条训练、第 16 条验证。**构造训练样本时把 `w*` 从提示里删掉**（只留原始任务），这样模型被迫从任务本身学派工——这是「裸任务提示下也会委派」的机制来源。

数据规模（p6 实测）：119 条轨迹 → **2,435 个训练窗口（282 统筹 / 2,054 子代理 / 99 辅助）**、17.2M 监督 token；LoRA r=64、1,624 步；子代理:统筹 = **2:1 固定采样**。

### 6.4 结果（p3/p6–7）

| 基准 | L(0) → L(2) | 每 token 得分比 |
|---|---|---|
| ScienceAgentBench 成功率 | 28.7% → 31.8% | 1.20× |
| MLR-Bench 均分 | 1.58 → 2.40 | 1.60× |
| AstaBench | 0.053 → 0.067 | 1.28× |
| DSBench | 0.473 → 0.482 | 1.35× |
| **Terminal-Bench 2.0** | — | **0.96×（下降）** |
| **SWE-bench Verified** | — | **0.94×（下降）** |

三个合成测试任务胜率 53.9% → 69.9%（L2 vs L1 = 60.8%）；自评与外部强模型一致率 0.73 → 0.91 → 0.93。Table 1 的迁移最硬：**固定执行器为 L(0)，L(1) 搜出的工作流仍以 64% 胜率压过 L(0) 的**——说明「优化器」这个角色自己也进步了。

### 6.5 两个假设的实证（p7–8）

- **H1 信息流**：用互信息衡量组件与任务的关联。随迭代，`role/instruction` 的任务信息**下降**、`contract/hop` 的**上升**；组件间冗余总体下降（一种嵌入配置例外）。→ Claim 1。
- **H2 多代理轨迹更密**：多智能体学生 68.3% 胜率 / 28.82M 监督 token，单智能体 64.0% / 42M——**少 31.4% token、高 4.3pp**；但生成多智能体轨迹本身约 **2.4×** token；外部偏好 85.1%，同长度子集仍 80.0%。→ Claim 2（作者自己标注为「由实验支持的机制假设，未被单独的因果消融完全分离」）。

### 6.6 消融：瓶颈在优化器（p9）

固定执行器、只换评价者（GPT-5.5）→ 提升有限；**同时换优化者的提升明显更早到位**；全 L(0) 循环最终也在 11/12 任务上拿到一致胜利。**到达能力 ≠ 稳定优化**：强迭代之后仍有回落；**文本改动幅度与结果变化的 |ρ| ≤ 0.12**——改得多不代表改得好。

### 6.7 行为内化（p10，Table 2a）

裸任务提示下：委派 1/110 → 48/110 → **87/110**；代码交接 1/110 → 42/110 → **83/110**；子代理修订 0 → 10 → 39；统筹者主编辑 1 → 14 → 12。教师数据里这些行为**确实被采样**（委派 114 记录/112 采样，代码交接 98/79，修订 57/37）。

### 6.8 与公号文的差异

- 数字基本一致，仅 ScienceAgentBench 一处：公号 28.8→31.7，正文 §4.2 为 **28.7→31.8**（图 2 与正文另有细微差异，属四舍五入口径）。
- **公号文没提两个编码基准是退的**（Terminal-Bench 0.96×、SWE-bench 0.94×）。对 AIStudio 这种编码平台，这是最重要的一条限定：MASS 的增益出现在**开放式科研任务**上，编码任务没有跟着涨。

## 七、DeerFlow 源码精读（executor/acceptance/容量/技能/沙箱）

### 7.1 两层验证栈（这是全仓最值得借鉴的结构）

| 层 | 文件 | 做什么 |
|---|---|---|
| L1 回执核验 | `subagents/report_contract.py`（RFC #4651 PR3） | 子代理自述必须给主张挂可核验把手；receipts 开启时用 `[rN]` 引用执行记录，**父侧拿记录对账，未引用判 UNVERIFIED** |
| L2 确定性验收 | `subagents/acceptance_checks.py`（PR4，113KB） | 统筹者把 `acceptance_criteria` 挂到委派上，**在代码里判定可判定项**，返回 `{leaves[], unchecked[], all_hold}` |

L2 的判据形态（`check_acceptance_criteria`，p2155 起）：
- `file_*` 家族（存在/大小/可读/CSV 列）——用沙箱 IO 探针实测；
- `tests_passed: <command>`——与**记录的 bash 执行**和测试摘要对账（unittest / node / go / cargo / build 各一套解析）；
- **不可判定条目落入 `unchecked` 且 `all_hold=false`**——宁可判「没验成」也不放行。

### 7.2 派活的治理面（不是 spawn 完就算）

`capacity.py`（队列满即 `SubagentCapacityRejected`、等不到槽位即 `SubagentCapacityTimeout`）、`turn_budget.py`（`max_turns` → LangGraph `recursion_limit` 换算）、`batch_lease.py`、`context_snapshot.py`、`step_events.py`（issue #3779：子代理步事件以前只在流里露最新一帧、不落库，用户看不到子代理用了什么工具）。

### 7.3 技能：延迟发现 + 安全面

`skills/catalog.py` 注释即契约：「只在 `<skill_index>` 暴露名字，调 `describe_skill` 才给元数据」（`MAX_RESULTS=5`）；技能带 `required_secrets` 与 `secrets_autonomous`（自主加载可绑密钥，/slash 显式激活另走一路），另有 `authz/skill_filter.py` 授权过滤与 `security_static_scanner.py` 静态扫描。

### 7.4 沙箱

`lease.py`(33.8KB) + `middleware.py`(30.9KB) + `acquire_serialization.py` + `command_scope.py` + `env_policy.py` + `identity.py` + `file_operation_lock.py`——是「租约 + 串行化 + 命令作用域 + 环境策略」，不是「三档模式」。

### 7.5 我方与之的差距（三条，按性价比排序）

1. **验收断言检查器（L2）**：仓内 eval 的 rubric 主要靠裁判；缺「代码可判定的验收项」对账（文件在不在/读不读得/测试摘要过不过）。这是把「交接」从主观变客观的最短路径。中等工作量，落点 `custom/server/handoff/acceptance.ts`，证据源可用现有 run 的 bash/tool 记录。
2. **主张-证据回执（L1）**：主张必须引用执行记录、未引判未验证。仓内已有 `auditchain`/`evidence`，**先查重再动手**，别造第二套。
3. **准入拒绝语义**：`dispatchpreview` 是死代码，kanban dispatcher 有并发闸但没有「队满即拒/等不到槽位即超时」的显式语义。小工作量，但要动派发链，需单独评估。

## 六、边界（如实）

- 看板事件里 `claimed` 的 payload 只有锁与 run_id，**没有可用的历史接手人**，所以账本按「回合」算，不做「谁交给谁」的人际归因；人员维度要用 assignee 快照，无法回溯。
- `worker_result` 的 `exit_code` 不在 EventLite 里（读取器只取 author），因此「交付但失败」只能靠 `gave_up/crashed` 间接识别，不能细到退出码。
- 本批只出读数与端点，**没有接界面**；也没有把「交接质量」接入晋级门禁——按 MASS 的说法它是信号，不是判据，先积累再看要不要设阈值。
