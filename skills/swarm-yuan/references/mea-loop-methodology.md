> **何时读我**：长任务规划与审计证据引用、多 agent/多阶段编排的形态选型与评估（Harness/Loop/Graph 三层嵌套，§五）时。来源：阿里 LongHorizon-Harness（MEA 循环/verify_evidence 铁律）。

# MEA 循环方法论（Manage-Execute-Audit，长程执行的任务状态管理）

> 来源：[AMAP-ML/LongHorizon-Harness](https://github.com/AMAP-ML/LongHorizon-Harness)（阿里，v0.1.5，2026-08-14 源码实测），论文 arXiv:2608.01964；中文报道《DeepSeek Harness 刚开源，阿里长程 Harness 也来了》（PaperAgent，2026-08）。
> 纪律：只引用方法论模式与实现视角，不调上游 CLI（LHH 是 Python agent 运行时，swarm-yuan 不做运行时整合）；不复制源码（上游可浅克隆到 `swarm-yuan/research/` 供 AI 阅读，gitignored 不入 git）。
> 守决策 27：吸收优先于新增门禁，不新增 `check_*`，门禁数保持 55；非运行时纯方法论吸收，不进 13/5 运行时计数（与 dsh/Codex 同口径）。
> 适用场景：目标技能 的**验证/收口/多轮长任务治理**设计——AI 在设计 verify 阶段准入、archive 收口、任务契约、verifier 报告协议时，引用本文决定「完成」由谁说了算、凭什么证据说了算。

---

## 一、核心理念：长程执行是任务状态管理问题

LHH 的出发点与「不断加长上下文/轨迹」的路线相反：**长任务的失败不是模型单步能力不够，而是状态在多轮之间失真**——上一轮声称做完的事，下一轮当作已完成的真相接着做，错了就连锁错下去。

三条设计公理：

1. **每轮失忆，状态外置**：Executor 每轮全新上下文（新进程 + prompt 全量重建 + `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` 防跨 episode 记忆），只靠结构化任务状态衔接轮次。状态不在模型脑子里，在文件里。
2. **自我声明不改变持久状态**：Executor 的完成自述只是候选结论（candidate），持久状态里一条事实要落「completed」，必须有独立审计证据引用支撑。没有证据的结论标 untrusted/不可复用。
3. **编排者不碰环境**：Manager（决定下一步做什么的角色）**无任何环境接口**——不看文件、不跑命令、不看屏幕，决策只依赖任务状态 + 审计报告。这从结构上杜绝「自己查自己、越查越自信」的上下文膨胀。

## 二、MEA 三角色与权力边界

```
┌────────────┐ 子任务契约 ┌────────────┐ 执行报告 ┌────────────┐
│ Manager │ ─────────────→ │ Executor │ ────────────→ │ Auditor │
│ 无环境接口 │ │ 全新上下文 │ │ 只读权限 │
│ 读:状态+审计│ ←───────────── │ 每轮失忆 │ ←──────────── │ 快照diff守卫│
└────────────┘ 审计报告 └────────────┘ 独立查环境 └────────────┘
```

| 角色 | 权力 | 禁止 | 对应 swarm-yuan 载体 |
|------|------|------|---------------------|
| Manager | 读任务状态 S_i + 上一轮审计报告 V_{i-1}，产出子任务契约与路由（gui/cli/ask/done/blocked） | 任何环境访问（文件/命令/屏幕） | 主 agent 编排 + `state-machine.sh` 阶段路由 |
| Executor | 在契约边界内改环境，报告 `agent_proposed_status` | 写最终状态、声称完成 | `governance-agents.md` action-executor |
| Auditor | 只读检查环境，产出审计报告（含 integrity 判定） | 写文件（快照 diff 检测篡改，篡改即 integrity violation） | self-reviewer + verifier（四权分离的后两权） |

与 swarm-yuan 已有的四权分离拓扑（policy-guardian/action-executor/self-reviewer/verifier）同构：LHH 的三角色是我们后三权的合并视图；我们的 policy-guardian（改治理资产前的立法侧审查）是 LHH 没有的维度，保留。**相对 LHH 的增量不在拓扑，在下面四个实现细节。**

## 三、关键机制（实现级，已落地）

### 3.1 审计证据引用（evidence ref）

LHH 任务状态的每条事实必须引用 auditor 轮次（如 `round_003`）；Manager 下发子任务时按引用拉取对应审计报告原文注入（默认 5000 chars/轮，上限 60000 chars），**不是全量历史**——这是 Manager 只占 2-8% token 的机制根源。

**落地**：`precheck.sh` 的 `_gate_evidence` 给 gate-runs.jsonl 每行加 `"run":<序号>`——门禁证据成为**可被引用的编号证据**（决策记录/verifier 报告/state-machine 字段引用 `gate-run#N`），而不只是某时刻某门禁的输出。下游解析（gate-report/trends/adaptive-gating）逐行读 JSONL，新增字段向后兼容。

### 3.2 verify_evidence 字段（自我声明 ≠ 持久状态）

LHH 状态段落强制四分类：已完成 / 未完成 / 阻塞风险 / **不可信不可复用（untrusted）**。untrusted 是显式第四态：审计证据缺失或被推翻的结论不删除、不降级为沉默，而是标记后继续可见——防止后续轮次把旧断言当事实复用。

**落地**：`state-machine.sh` 状态文件新增 `verify_evidence` 字段（初始空）。`guard archive` 在 `verify_result=pass` 之外检查该字段：

- 非空（指向 gate-run#N / 验证报告路径 / verifier 报告）→ pass，收口有据
- 空 → warn（不 fail，向后兼容存量状态文件）：`verify_result=pass 无证据引用——自我声明不改变持久状态（MEA 铁律），建议 set verify_evidence "<gate-run#N 或报告路径>"`

这与 `agent_proposed_status` vs `verifier_status` 双轨同构：双轨管「谁能写状态」，verify_evidence 管「写了状态拿什么证明」。

### 3.3 子任务契约补三维

LHH 任务级契约规则 12 项，其中 swarm-yuan Task Contract（intent/acceptance/forbidden/verify_commands/file_domain 五字段）缺三个维度：

| 新维度 | LHH 原则 | 追问 |
|--------|---------|------|
| `state_carrier` | 最终状态语义守卫 | 任务的完成态**落在哪个文件/服务/数据**上？载体错了（比如改了临时副本）= 白做 |
| `persistence_boundary` | 提交/持久化边界 | 什么才算「已提交」？内存里通过不算，落盘/入库/合入哪个节点才算 |
| `contamination_watch` | 候选污染边界 | 旧产物/相似路径/缓存会不会被误当作本次产出（或污染本次产出）？ |

**落地**：`governance-agents.md` Task Contract 模板加三行可选字段 + verifier 验收时逐项反查。

### 3.4 verifier 报告三轴 + 守卫降级链

LHH auditor 报告前三行控制头是机器可解析的：

```
Status: complete|incomplete|blocked # 做完了吗
Integrity: clean|suspect|violation # 证据干净吗（快照 diff 是否检测到篡改）
Contract audit: aligned|unknown|needs_revision|invalid # 与契约对齐吗
```

三条机器守卫（脚本侧强制，不信任 LLM 自报）：

1. 报告列出非空 blocking 项时，`complete` 强制降 `incomplete`
2. `integrity != clean` 或 `contract != aligned` 时，`complete` 无效
3. 完成守卫：只有最近一条审计报告同时 `complete + clean + aligned` 才接受 done——否则注入纠偏反馈，下一轮重管

**落地**：`governance-agents.md` verifier 输出格式加 `integrity:` / `contract_audit:` 轴 + 上述三条守卫降级链作为输出校验纪律（verifier 给 `pass` 前自查）。

## 四、效果数据（论文/报道口径，未独立复算）

- WeaveBench：Qwen 3.7-Plus + MEA 从 51.8% → **80.7%**；Opus 从 20% → 34.3%（ weaker 模型获益更大）
- Manager 只占 2-8% token，Auditor 占 19-38%——审计预算远大于编排预算，钱花在验证上
- 收益最大的是**跨长轨迹相互依赖状态**的任务；单步能力瓶颈型任务收益小
- 案例二则：① 交互卡死不再原地重试 400 步，而是把「已审计的进度」记入状态，从断点继续；② 假完成拦截——视觉上对了但违规走了 XML 直改底层，Auditor 查底层证据拆穿

## 五、长程编排拓扑：Harness / Loop / Graph 三层嵌套与评估

> 来源：《Harness、Loop Engineering、Graph Engineering：如何选择，如何评估》（B 级，2026-10 公众号文章，框架完整）。核心纠偏：**三层不是三选一的流派，是同一系统里嵌套的三个控制层**——比较"用哪个"从问题定义就偏了，该问"每层各自的证据在哪里"。

三层各答一个问题：

| 层 | 回答的问题 | 机制面 | swarm-yuan 实例 |
|----|-----------|--------|----------------|
| **Harness** | 模型/工具/权限/轨迹的**可信运行边界** | 权限判定、沙箱、hook、审计 | 门禁四族 + rules.d 三值 + fail-gate-hook + gate-deny.jsonl |
| **Loop** | 单阶段内的**自我修复闭环** | 评估→修复→重评，收敛判据 | ⑥测试→fail→⑤修复环→重跑；误报→调 conf 重跑 |
| **Graph** | 阶段间的**拓扑**（依赖/审批/发布） | DAG 编排、断点恢复 | 生成流程 Step 1-13 与开发工作流 九节点状态机（前序产出物守卫） |

**三条设计原则**：trust boundary（非全局只读上下文，边界内才可见）/ 最小领域知识原则（用图返回的元信息路由，不猜全局状态）/ common format（trace 与 checkpoint 统一格式——跨层可审计的前提）。

**四层评估口径**（编排系统的验收，不能用单一完成率代替）：结果质量（任务达成）/ 执行质量（副作用受控）/ 资源效率（预算遵守）/ 治理质量（决策可审计）。固定口径指标五件：重复副作用率、恢复成功率、人工接管率、路由违约率、预算停止准确率。

**中断恢复两机制**（长程执行特有）：① checkpoint 七字段（id/timestamp/graph_ref/inputs_hash/outputs/next_action）+ `recovery_lease` 单写者（防并发恢复打架）；② **副作用三态** `confirmed_executed / confirmed_not_executed / unknown`——unknown 不是失败也不是成功，是必须显式留痕的第三态（与归因三态、过期三态同类：**不许把"不知道"静默折算成任一端**）。

**消费指引**：目标技能遇到"多 agent/多阶段/可恢复"编排设计时（⑤复杂变更扇出、长任务），先按三层各自找证据位——harness 层有什么权限拦截、loop 层每阶段的收敛判据、graph 层断点恢复靠什么；三缺一就是该层的缺口，而不是"换个更强的 agent 框架"。

## 六、已登记未实施（评估后缓做/不做）

| 候选 | 评估 | 决定 |
|------|------|------|
| 验收约束自动反查（--backcheck 模式：解析 spec 验收标准为清单，逐条关联 verify_command + 证据，未覆盖非零退出） | 价值高，但需稳定解析 spec 模板的验收段落格式（跨任务类型矩阵），单独立项 | 登记，条件=出现「验收标准写了但没逐条验证」的真实逃逸案例时立项 |
| Auditor 工作区快照 diff（verifier 运行前后 `find + sha256` 两快照，diff 非空判 invalid，fail-closed） | bash 3.2 可实现（sha256sum/shasum 双探测 + 排除 trace/gate-runs 自身写盘），但大仓库耗时 | 登记，条件=目标项目出现「verifier 顺手改了被测物」案例时立项 |
| rounds.jsonl 全量轮次回放账本 | swarm-yuan 已有 trace + decisions + gate-runs 三账本，再加冗余 | 不做 |
| O_NOFOLLOW/fcntl 文件加固全套 | Python os 层 API，bash 3.2 无等价物；swarm-yuan 无 worker 进程对抗面 | 不做 |
| MEA 全循环运行时（Manager/Executor/Auditor 进程编排） | swarm-yuan 是元技能生成器非 agent 运行时；四权分离已覆盖等价拓扑 | 不做 |

## 七、AI 填充指南

目标技能 遇到以下场景时引用本文：

- **verify/archive 阶段设计**：收口判定必须两轴（结果 pass + 证据引用非空）；只有 AI 自述没有独立证据的「完成」标 untrusted，不得作为下游依赖
- **多轮长任务状态设计**：轮与轮之间只传结构化状态 + 证据引用，不传「我上次已经搞定了」的自然语言自述
- **verifier 报告设计**：结论三轴（结果/完整性/契约对齐），给 pass 前自查守卫降级链三条
- **任务契约设计**：五字段之外补 state_carrier / persistence_boundary / contamination_watch 三问

## 八、来源溯源

- 仓库：AMAP-ML/LongHorizon-Harness（MIT，Python ≥3.10，v0.1.5 = 2026-08-14）
- 论文：arXiv:2608.01964；Website: lh-harness.pages.dev
- 源码实测（2026-08-16，浅克隆 v0.1.5）：`manager.py` MEA 主循环 / `auditor_agent.py` 报告协议与机器守卫 / `prompt_texts.py` 契约规则 / `adapters/*` AgentAdapter（Claude Code/Codex/DeepSeek Harness 三后端）
- 关键诚实披露：中文报道所称「Requirement/Artifact/Fact 三类记录」在代码中无对应 schema，实为 Manager 输出的四分类段落（口语化表述）；「Manager 2-8% token」为论文侧数据，仓库内无脚本可复算；auditor 的「只读 shell allowlist」仅存在于 prompt 文本，代码级靠工作区快照 diff 兜底
- §五 来源（2026-10-04）：《Harness、Loop Engineering、Graph Engineering：如何选择，如何评估》公众号文章（B 级转述，checkpoint 字段/指标五件为文中公式化内容，未核对原始论文）
