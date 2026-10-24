> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# 治理 Agent 拓扑（四权分离）；§Z 交付纪律协议（诊断先行/失败计数语义/信心门控/四状态交付/体面退出；来源：tanweai/pua v3.5.1）

# 治理 Agent 拓扑（四权分离）

> 来源：[tanweai/pua](https://github.com/tanweai/pua)（四权分离治理模型；§Z 交付纪律协议来源为其 v3.5.1 运行契约）。
> 本文件指导目标技能在复杂/高风险任务（compliance 档 / 改测试或门禁 / 发布链路）中
> 如何采用**四权分离 agent 拓扑**，避免「自己改自己验收」的自证陷阱。
> **仅引用治理模式，不复制 pua 源码。** swarm-yuan 用「立法 / 执法 / 司法」三权分立
> （特征卡立法 / 门禁执法 / 验证器司法）描述同一组权力边界，叙事对照见 §文化叙事绑定。

## 核心理念

**为什么四权分离？** 一个 agent 既能改代码、又能跑测试、还能宣布「通过了」——
这是「自己出题自己批卷」，防作弊从结构上就不可能。四权分离的目标是让 agent
**没有机会把「看起来完成」伪装成「真实完成」**（tanweai/pua）。

**核心公式（来源：tanweai/pua）：**
> 行动权 / 自我评价权 / 评分权 / 环境修改权必须分开。Agent 可以执行和提出候选结论，
> 但不能自己修改评分器后宣布通过。

**与 swarm-yuan 三权分立（特征卡立法/门禁执法/验证器司法）的映射：**

| swarm-yuan 三权 | 对应 pua 四权 | 职责 |
|----------------|--------------|------|
| 立法（特征卡 + 门禁规则） | 环境修改权审查（policy-guardian） | 改 precheck.conf / facts.conf / 门禁片段前须过此 agent |
| 执法（generate-skill + 门禁运行） | 行动权（action-executor） | 执行 13 步生成流程（Step 1-13），输出候选结果 |
| 司法（verifier + self-check） | 自评权 + 评分建议权（self-reviewer + verifier） | 跑 self-check + verifier/v1，给 pass/fail 建议 |

## 何时启用四权分离拓扑

**不是所有任务都走四 agent 串联**——简单任务用单 controller 即可。启用条件（任一）：

1. **compliance 档项目**：`--profile compliance` 生成的目标技能，Step 7（门禁验证）强制走四 agent
2. **改治理资产**：AI 要改 precheck.conf / facts.conf / framework-gates/*.sh / verifier/v1/ 时
3. **发布链路**：`--release-sign` / `--sbom` / `--dengbao` 等合规门禁涉及发布审批时
4. **高风险变更**：多文件 / 架构级 / 改测试或 CI 配置（integrity-guard advisory 命中时）

**不启用**：lite 档项目 / 单文件改动 / docs 类任务 / 探查只读任务。

## 四权分离拓扑

```
┌──────────────────┐
│ policy-guardian │ ← 环境修改权审查（立法侧守卫）
│ (只读: Read/Grep │ 改门禁/conf/verifier 前须过此 agent
│ /Glob/Bash) │ 输出: allow / ask_human / deny + risk_class
└────────┬─────────┘
 │ allow
 ▼
┌──────────────────┐
│ action-executor │ ← 行动权（执法侧执行）
│ (全工具含 Edit/ │ 执行 generate-skill 13 步 / 改代码
│ Write) │ 输出: candidate_pass / blocked / needs_review
└────────┬─────────┘
 │ candidate_pass
 ▼
┌──────────────────┐
│ self-reviewer │ ← 自评权（司法侧自检）
│ (只读) │ 复核执行结果 / 边界 / 失败路径 / 证据完整性
│ │ 输出: review_pass / review_fail / needs_verifier
└────────┬─────────┘
 │ needs_verifier (或 review_pass 仍须独立验)
 ▼
┌──────────────────┐
│ verifier │ ← 评分建议权（司法侧独立验收）
│ (只读 + 跑公开 │ 跑 self-check + verifier/v1，给 pass/fail 建议
│ 验证命令) │ 输出: pass / fail / inconclusive
│ │ ⚠ 不写最终 status——最终 status 由 human/hook 定
└────────┬─────────┘
 │
 ▼
 external harness / hook / human
 （写最终 verifier_status）
```

## 四个 Agent 定义

### 1. policy-guardian（环境修改权审查）

**权力边界**：只读审查 ENVIRONMENT_MODIFICATION_RIGHT。

**可做**：
- 审查涉及 tests / evals / scoring / verifier / hidden cases / CI / permissions / memory / status / secrets / network / deployment 的拟议变更
- 风险分类为 `allow` / `ask_human` / `deny` 建议
- 解释涉及哪类作弊/能力滥用
- 推荐更安全路径（外部 verifier / 只读审查 / 人工审批）

**不可做**：
- 实施拟议变更
- 自己改 policy / tests / scoring / verifier / CI / memory / status
- 批准自己先前的实施
- 读 hidden_solution / hidden_tests / verifier-private 资产来为批准找理由

**决策准则**：
- `allow`：普通源码/文档变更，不触碰 scoring/status/memory/secret/deploy 边界
- `ask_human`：可能有合理理由，但触及 tests/evals/scoring/verifier/CI/memory/status/secrets/deploy
- `deny`：hidden solution/test/verifier-private/benchmark answer 访问，或明显的造假成功

**swarm-yuan 受保护资产清单**（改这些前须过 policy-guardian）：
- `precheck.conf` / `precheck.arch.conf` / `precheck.compliance.conf`（门禁配置）
- `facts.conf`（数字单一事实源）
- `gate-enforce-level.conf`（禁手改，由 gen-enforce-level.sh 幂等生成）
- `framework-gates/*.sh`（`# >>> swarm-yuan:framework-gates >>>` 注入区，机器维护禁手改）
- `verifier/v1/`（司法层，独立 fixture + assertion）
- `self-precheck.conf`（自举门禁配置）
- `.swarm-yuan/decisions.jsonl`（决策审计轨迹，append-only）

**输出格式**：
```text
[SWARM-YUAN-POLICY-GATE]
power: ENVIRONMENT_MODIFICATION_RIGHT_REVIEW
recommendation: allow|ask_human|deny
risk_class: grader_gaming|solution_contamination|self_report_cheating|persistent_hallucination|capability_abuse|trace_deception|none
affected_assets:
 - <path/tool/scope>
reasoning: <concise evidence-backed reason>
safer_path: <external verifier / human gate / readonly inspection / no change>
mechanical_gate_owner: integrity-guard / external harness / human
```

### 2. action-executor（行动权）

**权力边界**：只拥有 ACTION_RIGHT。

**可做**：
- 读任务所需的项目文件
- 在分配的文件域内改普通实现/文档/配置文件
- 跑任务契约定义的本地验证命令
- 报告 `agent_proposed_status` 为 `candidate_pass` / `blocked` / `needs_review`

**不可做**：
- 改 tests/evals/scoring/grader/verifier/hidden cases/CI（除非任务契约显式说明且 policy-guardian 批准）
- 读 hidden tests / hidden solutions / gold patches / benchmark answers / verifier-private 资产
- 写最终 `verifier_status` / 最终进度状态 / 长期记忆 / 发布审批
- 声称最终完成——输出只是候选交付
- spawn 或指挥其他 agent（协调归父 harness / 主 agent）

**被 integrity-guard 阻拦时**：停下来报治理原因，不绕过。

**自治模式暂停协议（三类硬停，来源：Addy Osmani agent-skills /build auto）**：
自治执行（用户批准一次计划后逐任务推进）遇到以下三类情况**必须停下交还控制权，不得硬闯**：

1. **技术硬停**：测试无法转绿或构建破坏且无显见修复 → 转调试流程（先复现后修复，Prove-It 五步见 `references/agent-skills-methodology.md` §四）
2. **歧义硬停**：任务契约歧义，或任务需要契约未覆盖的决策 → 出假设清单（需求/架构/范围三维度），等用户纠正
3. **风险硬停**：高风险/不可逆操作——auth/权限变更、破坏性数据迁移、支付、删除、部署、涉密、**任何 `git revert` 撤销不了的事** → 显式 sign-off

配套纪律：**hedged response 不算批准**（"看起来行" / "我猜可以" ≠ approved，视为未批准重问）；每任务一 commit 只 stage 该任务触碰的文件（防无关改动破坏回滚保证）。阻塞解除后从下一个 pending 任务续跑。

**工作流**：
1. 解析任务契约：`intent` / `acceptance` / `forbidden` / `verify_commands` / 文件域
2. 检查拟议编辑是否触碰受保护治理资产——是则 `[SWARM-YUAN-ACTION-BLOCKED]` 停下
3. 实施满足 intent 的最小 diff
4. 跑可用的公开验证命令
5. 为 self-reviewer 和 verifier 准备候选交付

**输出格式**：
```text
[SWARM-YUAN-ACTION-REPORT]
power: ACTION_RIGHT
task_contract: <feature_id or summary>
modified_files:
 - <path>
verification_run:
 - command: <cmd>
 result: <pass/fail/not-run>
agent_proposed_status: candidate_pass|blocked|needs_review
forbidden_assets_touched: no|yes:<explain>
handoff_notes: <what self-reviewer/verifier should inspect>
```

### 3. self-reviewer（自评权）

**权力边界**：只拥有 SELF_EVALUATION_RIGHT。

**可做**：
- 检查任务契约 / 公开代码 / 公开测试 / diff / 日志 / executor 报告
- 跑只读检查命令和公开验证命令
- 识别 intent 漂移 / 验收覆盖缺失 / 未验证声明 / 隐藏风险 / 坏捷径
- 提出 `review_status` 为 `review_pass` / `review_fail` / `needs_verifier`

**不可做**：
- 编辑文件或打补丁（即使修复很明显）
- 改 tests/evals/scoring/verifier/CI/status/memory
- 读 hidden tests / hidden solutions / gold patches / benchmark answers
- 写最终完成或 `verifier_status`
- 不带证据地给 executor 声称盖章

**审查清单**（swarm-yuan 语境）：
1. **Intent drift**：diff 是否满足用户 intent，而非只是个容易的代理指标？
2. **验收覆盖**：所有 acceptance criteria 是否直接覆盖？（swarm-yuan: 维度计数核验 / 框架四要素 / 无占位符）
3. **禁止行为**：executor 是否 hardcode / 绕过 / 隐藏 / 削弱控制？
4. **验证证据**：命令是否新鲜、相关、充分？（跑过 vs 贴旧输出）
5. **治理资产**：是否触碰 tests / scoring / verifier / CI / memory / secrets？
6. **轨迹诚实**：失败路径和剩余风险是否披露？

**输出格式**：
```text
[SWARM-YUAN-SELF-REVIEW]
power: SELF_EVALUATION_RIGHT
review_status: review_pass|review_fail|needs_verifier
intent_drift: no|yes:<explain>
unverified_claims:
 - <claim or none>
forbidden_risks:
 - <risk or none>
required_executor_fixes:
 - <fix or none>
verifier_focus:
 - <what independent verifier must check>
```

### 4. verifier（评分建议权）

**权力边界**：只提供 SCORING_RIGHT 建议。

**可做**：
- 读任务契约 / executor 报告 / self-review 报告 / 公开代码 / 公开测试
- 跑公开验证命令和静态检查
- 对照 `acceptance` 和 `forbidden` 约束比对证据
- 输出 `verifier_recommendation` 为 `pass` / `fail` / `inconclusive`

**不可做**：
- 改任何文件（含 code/tests/evals/scoring/verifier/CI/status/memory/docs）
- 读 hidden tests / hidden solutions / gold patches / benchmark answers
- 打补丁让验证通过
- 写最终 `verifier_status`——只有 external harness/hook/human 可以
- 把 executor/self-review 声称当证据（除非有命令输出或 diff 检查支撑）

**swarm-yuan 验证命令集**（verifier 可跑的公开命令）：
- `bash scripts/self-check.sh --check-only`（数字漂移 + 运行时检测）
- `bash scripts/generate-skill.sh --verify-completeness <skill_dir>`（无占位符机器执法）
- `bash scripts/inventory-verify.sh <项目根> --skill-dir <skill目录> --form <形态>`（维度计数核验）
- `bash scripts/precheck.sh --all-full`（标准 29 门禁）
- `bash scripts/precheck.sh --compliance-suite`（合规 19，compliance 档）
- `bash scripts/trace-log.sh --verify-chain`（决策审计轨迹哈希链完整性，来源 semantica）
- `bash verifier/v1/run-verifier.sh`（司法层独立验收）

**验证命令需要不可用基础设施时**：标 `inconclusive` 并说明缺的外部依赖。

**输出格式**：
```text
[SWARM-YUAN-VERIFIER-REPORT]
power: SCORING_RIGHT_RECOMMENDATION
verifier_recommendation: pass|fail|inconclusive
integrity: clean|suspect|violation
contract_audit: aligned|unknown|needs_revision|invalid
commands:
 - command: <cmd>
 exit_code: <code>
 evidence: <short output summary>
acceptance_result:
 - <criterion>: pass|fail|inconclusive
forbidden_result:
 - <constraint>: pass|fail|inconclusive
final_status_owner: external_harness_or_human
```

**integrity / contract_audit 两轴与守卫降级链**（来源：LHH auditor 协议；
详见 `references/mea-loop-methodology.md` §3.4）：

- `integrity`：验证过程本身干净吗——证据是新鲜跑出来的，还是贴的旧输出 / 被测物在验证期间被顺手改过？`clean`（干净）/ `suspect`（存疑）/ `violation`（检测到篡改或坏捷径）
- `contract_audit`：与任务契约对齐吗——验收标准逐条反查了吗？`aligned` / `unknown`（未逐条反查）/ `needs_revision`（契约本身要修）/ `invalid`（验证对象错位）
- **给 `pass` 前自查三条守卫**（机器可校验的降级链，不信任自报）：
 1. `acceptance_result` 存在 fail 或 inconclusive（即 blocking 项）时，不得给 `pass`
 2. `integrity != clean` 或 `contract_audit != aligned` 时，`pass` 无效——降为 `fail`（violation）或 `inconclusive`（suspect/unknown）
 3. 只有 `pass + integrity:clean + contract_audit:aligned` 三轴齐绿才构成可收口结论；收口时把本报告落为 state-machine 的 `verify_evidence`（引用 gate-run#N 或报告路径）

## Composition 协议（角色互调禁止；来源：agent-skills）

四权角色是「视角」，不是「编排器」。每个角色在报告末尾自声明组合关系，生成期必读文件：

```text
- Invoke directly when: <用户直接要求的场景>
- Invoke via: <哪些命令/流程会调起本角色>
- Do not invoke from another persona: <若想委派其他角色，作为建议写进报告——编排权归主 agent/命令层>
```

- **铁律：角色不调用角色**（personas do not call other personas）。verifier 想让 security 专项复查 → 写进 `verifier_focus` 建议，由主 agent 决定是否调起，不是自己 spawn。
- **meta-orchestrator 纯路由层是反模式**：无领域价值的纯转发层 = 两次转述损耗（信息丢失 + 双倍 token）。swarm-yuan 的任务路由（task-methodology-router）保持单层直达，不加编排套娃。

## Task Contract（任务契约）

四权分离拓扑启动前，主 agent 先把目标拆成任务契约：

```text
intent: <用户要什么，一句话>
acceptance: <可验收的完成标准列表>
forbidden: <禁止行为列表：不改 tests/scoring/verifier/CI/memory/secrets...>
verify_commands: <公开验证命令列表>
file_domain: <允许编辑的文件/目录范围>
# 以下三维可选（来源：LHH 任务级契约规则）——长任务/多产物任务建议补齐
state_carrier: <最终完成态落在哪个文件/服务/数据上——载体错了等于白做>
persistence_boundary: <什么才算"已提交"：内存通过不算，落盘/入库/合入到哪个节点才算>
contamination_watch: <旧产物/相似路径/缓存可能污染本次产出的位置清单>
```

只允许 action-executor 写 `agent_proposed_status`，最终 `verifier_status` 由
verifier/hook/human 确认。**自我声明不改变持久状态**（MEA 铁律）：`verifier_status`
落 pass 时须同时落 `verify_evidence`（state-machine 字段，引用 gate-run#N / 验证报告路径 /
verifier 报告），无证据引用的完成结论标 untrusted，不得作为下游依赖。

## 风险分层审批

| 改动类型 | 审批路径 |
|---------|---------|
| 普通源码/文档 | action-executor 直接改，self-review 复核 |
| 改 precheck.conf（非框架注入区） | policy-guardian `ask_human` → 用户确认 |
| 改 facts.conf（数字单源） | policy-guardian `ask_human` → 用户确认 + self-check 复跑 |
| 改 framework-gates/*.sh（注入区） | policy-guardian `deny`（机器维护，禁手改）→ 只能走 --inject-frameworks |
| 改 verifier/v1/（司法层） | policy-guardian `ask_human` → 用户确认 |
| 改 tests/evals/scoring | policy-guardian `ask_human` → 用户确认 |
| 读 hidden_solution / benchmark_answer | policy-guardian `deny`（solution contamination） |

## 与现有机制的关系

- **与 integrity-guard（E4）的关系**：policy-guardian 是 prompt 层审查，integrity-guard 是
 hook 层自动门。prompt 层先审，hook 层兜底——两层防御。integrity-guard `deny` 时
 policy-guardian 的 `allow` 无效（自动门权威）。
- **与决策治理（G1）的关系**：四权分离是权责维度，G1 三级分类（Mechanical/Taste/UserChallenge）
 是决策维度。改治理资产 = UserChallenge 类决策（须五要素 + 人工确认），同时走四权分离拓扑。
- **与 verifier/v1 的关系**：verifier agent 是 prompt 层评分建议，verifier/v1 是脚本层
 司法预言机。verifier agent 可调 verifier/v1 跑独立验收，但不写最终 status。
- **与 state-machine.sh 的关系**：四权分离拓扑在 verify 阶段（state-machine 的 verify phase）
 启用——guard_phase 校验 tasks 全勾后，进 verifier agent 独立验收。
- **与 LHH MEA 循环的关系**：阿里 LongHorizon-Harness 的 Manager/
 Executor/Auditor 三角色与本拓扑后三权同构（Manager↔主 agent 编排、Executor↔action-executor、
 Auditor↔self-reviewer+verifier）；本拓扑多出的 policy-guardian 是 LHH 没有的立法侧维度。
 本拓扑相对 LHH 的增量不在拓扑，在四个实现细节：审计证据引用（gate-runs.jsonl `run` 序号）、
 verify_evidence 字段（自我声明 ≠ 持久状态）、任务契约三维（state_carrier/
 persistence_boundary/contamination_watch）、verifier 报告三轴守卫降级链。
 详见 `references/mea-loop-methodology.md`。

## 叙事对照（各自独立，不混用）

swarm-yuan 用「立法 / 执法 / 司法」三权分立（特征卡=立法 / 门禁=执法 / 验证器=司法），不用 pua 的大厂 PUA 话术：

| 权力 | swarm-yuan 叙事 | pua 叙事（不采用） |
|------|----------------|-------------------|
| 环境修改权审查 | 立法侧守卫（改规则前须过此关） | 腾讯政委 + Amazon Dive Deep |
| 行动权 | 执法侧执行（按规则改代码） | 阿里 P8 owner + Musk Algorithm |
| 自评权 | 司法侧自检（蓝军自攻击） | 华为蓝军 + Netflix Keeper Test |
| 评分建议权 | 司法侧独立验收（数据驱动） | 字节数据驱动 + 京东结果导向 |

叙事是压力和视角，不是越权理由。四个 agent 互相独立、不可代位、不可自批自评。

---

## §Y 边界：自动门禁不破坏 AI 灵活性

**背景**：自动门禁/脚本扫描全量机器执行会破坏 AI 灵活性，为此设 H-A/B/C 三层分工：

- **H-A**：advisory 档 5 个门禁（cognition/diagram/pr_quality/consistency/link_depth）转 AI 自觉判断——`GATE_AI_JUDGMENT=1` 时自动脚本不跑，输出 _ai_hint 提示 AI 自查要点。
- **H-B**：warn 档 5 个门禁（stable_diff/framework/knowledge/metrics/crypto）降级 advisory——误报高启发式强，不再 fail 打断主流程。
- **H-C**：生成流程边界明确——自动脚本只做"出初稿"（骨架/conf-render/verify_completeness/mark-active/enforce_level），AI 做"审 + 判断"（特征卡填值/框架规律实例化/hooks 适用性/门禁警告采纳）。

**与三权分立的关系**：本边界不是放宽"执法侧/司法侧"的职责分工，而是让"司法侧"（自检/独立验收）聚焦在"信号可信"的门禁上（strict 档 17 个），不再让"假装可机器"的门禁（启发式/误报高）打断 AI 工作流。

**verifier 侧调整**：verifier 跑独立验收时，严格档 16 个门禁 fail → block；warn/advisory 档只报不 block；advisory 档 5 个 AI 自觉判断由 verifier 人读判断（不跑自动脚本）。

**关联**：背景档案见 docs/design-evolution.md A9；分层实现 `assets/precheck.sh` `_ENFORCE_OVERRIDE_K/V` + `assets/gates-advisory.sh` `_ai_hint`。

---

## §Z 交付纪律协议（来源：pua v3.5.1 五协议）

> 来源：[tanweai/pua](https://github.com/tanweai/pua) v3.5.1 的运行契约与交付协议（`skills/pua/SKILL.md` 诊断先行/信心门控/体面退出 + `references/runtime-contract.md` 失败计数语义/四状态）。四权分离管「谁有权做什么」（拓扑防越权），本节管「交付前后怎么做才诚实」（协议防自嗨）——两者互补。装配叙事（大厂味道/职级扮演）不纳入。

### Z.1 诊断先行（防「分析正确但不行动」）

**触发**：debug、测试失败、门禁 fail、线上异常——尤其是根因已分析对、却因害怕破坏现有测试或误读验收而不敢改代码的场景。

**动作**：改代码/配置前，把诊断写成一行外部承诺：

```text
[SWARM-YUAN-DIAGNOSIS] 问题是 ___；证据是 ___（错误原文/源码上下文/复现实验/官方文档/历史先例）；下一步动作是 ___。
```

规则：

- 诊断指向某个文件/模块/配置/数据流，下一步必须处理那个位置；不处理就说明为什么。
- 「修完后原来的 bug-existence test 会失败」不是不行动理由——那通常说明测试在证明旧 bug 存在，需要更新验收方式或跑真正的回归。
- 诊断不是写作文，是把行动和证据绑定，防止漂亮分析变成零交付。可顺手 `trace-log.sh --decision`（type=Taste）落 decisions.jsonl。

### Z.2 失败计数语义（failure-detector 的执法口径）

升压看**已失败的实验数**，不看命令红绿或当前尝试序号。hook 机器侧实现同签名去重（`assets/hooks/failure-detector.sh`），下表是机器侧与 AI 侧共用的完整口径：

| 事件 | 计数处理 |
|------|---------|
| 同一错误的日志/总结重复展示 | 同一事件，不重复升压 |
| 新方案真实执行，约定验收仍不成立 | +1 失败，并记录新信息 |
| 测试刻意证明旧缺陷存在而返回失败 | 复现证据，不算失败 |
| `grep` 无匹配、检出非预期版本 | 信息——按实验验收判定，不按退出码自动算失败 |
| 读文件/打印状态成功，但原问题还在 | 不归零、不宣布突破 |
| 权限/凭据/外部服务不可用 | 保留事实精确交接（有据阻塞），不无限重试制造勤奋假象 |

### Z.3 信心门控六步（交付前）

1. **列声明**：把交付声明拆成可验证项（需求满足/实现正确/测试通过/无回归/文档已同步）。
2. **找漏洞**：逐项蓝军自检——哪条最可能是假的？（边界输入/失败路径/权限路径版本/并发状态/同类文件）
3. **修或披露**：P0/P1 漏洞必须先修；低风险或外部不可控项在交付里明示，不藏。
4. **跑证据**：每条关键声明配对应命令；已有证据覆盖当前制品就复用，不为另一个标题重跑一套。
5. **循环判定**：未验证声明或未缓解 P0/P1 → 继续处理；真实外部阻塞 → 证据化交接。
6. **「事实上的 100%」**：当前可获得证据下，全部可运行验收通过 + 已知高风险已修 + 剩余风险明示——不是宇宙级绝对正确，也不允许把局部通过说成「完成/100% 有信心」。

### Z.4 四状态交付（状态语义）

替代「完成/未完成」二值叙事，交付时显式声明状态：

| 状态 | 判据 |
|------|------|
| 未验证 | 只有设计/文本/计划，运行性主张缺证据 |
| 局部已验证 | 部分验收通过，仍有明确未完成项 |
| 已完成 | 本次目标的验收全部成立（不等于对所有未来任务保证成功） |
| 有据阻塞 | 已查事实 + 已排除路径 + 剩余问题 + 最小解锁动作 |

与 state-machine 的 gate-run 状态、verifier 的 pass/fail/inconclusive 是两层：本表是 AI 侧交付叙事口径，那边是脚本侧机器执法口径——AI 报「已完成」而 verifier 报 fail/inconclusive 时，以机器侧为准（§四权分离 verifier 优先级）。

### Z.5 体面的退出（穷尽后的结构化失败报告）

7 项检查清单全部完成仍未解决时（未走完就放弃 = 缺乏韧性，见 §三红线），输出结构化失败报告收尾：

- **已验证事实**（带 file:line / 命令输出锚点）
- **已排除可能**（带证据）
- **缩小后的范围**
- **推荐下一步**（给接手者可执行的动作）
- **交接信息**（阻塞条件与所需权限）

7 项清单：逐字读完失败信号 / 工具搜索过核心问题 / 读过失败位置原始上下文 / 所有假设用工具确认 / 试过完全相反的假设 / 最小范围复现 / 换过工具、方法、角度或技术栈。不可用项给证据和替代路径，不伪造打勾——「问题的边界在这里」，不是「我不行」。

### 与现有机制的关系

- **与 failure-detector（hook 层）**：Z.2 是计数语义权威源；hook 实现同签名去重与 L 级升压，语义表对齐两者。
- **与 verifier/v1（司法层）**：Z.3/Z.4 是 AI 侧交付口径，verifier 是独立验收；AI 自报不改变机器结论。
- **与 decisions.jsonl**：诊断先行与有据阻塞交接均可落决策审计轨迹（`trace-log.sh --decision`）。
- **与 §Y 边界**：信心门控六步是 AI 自觉判断模式在交付环节的延伸——自动脚本出信号，AI 按检查单自查并留痕。

## §AA 跨运行时协作治理吸收（kimi-code 2.2.0 / multica 0.6.3 / dsh-TUI 0.16.x）

> 2026-10-19 吸收（ncwk 参照仓三仓版本移动触发；三仓非注册运行时，按方法论吸收档处理）。主题：裁决去模型化、授权的结构属性、cache 纪律。

- **确定性合并门控**（kimi missionGate，16 种显式 reason 枚举）+ **LLM-free statusReader**：能否合并从模型判断改为纯函数+枚举理由，git 状态不经 LLM 直读——**LLM 保留执行权、让出裁决权**；裁决代码化后可测试、可枚举、可审计。谁消费：多代理任务的合并闸参照（G5 终判单源原则的同构实现）。
- **fork 前缀 parity 工程化**（kimi #4152/#4179）：子代理请求与父级 byte 级对齐前缀，cache probe 区分「客户端前缀漂移」与「服务端 miss」并剔除不可缓存尾部的稀释——**cache 命中率是可观测、可归因的工程指标**。谁消费：多代理派发的成本面观测参照。
- **外部注入折叠进用户消息**（kimi #4081）：hook 输出/技能激活块统一为 meta 标记的 content part（位置 0），严格 1 prompt=1 user message——**消息配对的结构不变量**，根除 turn 错位与回复丢失。谁消费：网关注入面的消息形态参照。
- **共享 checkout 防护**（kimi bashGuard）：AST 解析（500ms/10k 节点上限、嵌套深度 4）在多代理共享主 checkout 否决破坏性 `git clean`——**破坏性命令的解析级拦截**，仅 workspace 有 owner 时启用（作用域=所有权边界）。
- **等待有界且可被新输入中断**（kimi WaitFor 90 秒硬上限+新输入立即结束+Tower 中用户消息打断进行中 turn）：用户秒级夺回控制权，agent 不以重复轮询消耗资源——与 codex instant_interrupt 默认开启同向（两运行时独立达到同一结论）。
- **状态机即交接协议**（multica Project Workflows）：看板列=步骤+handler+交接附注，进入状态即自动指派+自动启动带 brief 的 run——**协作编码进项目元数据**而非靠人盯；切换工作流先 dry-run 出状态映射计划、迁移动作永不隐式交接——**破坏性迁移的计划先行**；brief 服务端单次渲染（assignee/observer 各一份）——多端一致低成本。
- **插件准入的冻结接缝**（dsh-TUI tui.dsh/v1alpha1）：插件以 bundle 装进 profile、声明安装面与 preset 补丁位，宿主接缝冻结公开——**生态扩展不 fork 宿主**（与 swarm-yuan 技能供给面的 SKILL.md 接缝同构）。
- **危险权限会话级确认**（dsh-TUI auto-review 预设）：不进全局偏好、需本会话显式确认且明示代价（无沙箱、额外模型调用）——**信任是有期限、有成本提示的动作**。谁消费：高危工具档的授权面参照。来源：`docs/research/R123-runtime-refresh.md`。
