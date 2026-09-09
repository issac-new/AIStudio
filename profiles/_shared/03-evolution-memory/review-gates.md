# 评审门（L4 合并版）

> 本文件由 F6 结构归并产生（2026-08-25），合并以下来源：
> `diamond-quality-gates.md` + `loop-engineering-gates.md` + `anti-patterns.md`
> + `intervention-ledger.md`（§四）+ `worker-appeal-protocol.md`（§五）+ `kanban-advanced.md`（§附录 A）
> 层级定位：L4 评审门——finding 质量门、验证门、反模式、干预追踪与申诉协议。
> 原则：不改语义，只做结构化归并；原各文件的来源标注保留在对应章节内。

---

## 一、Diamond 模式质量门（原 diamond-quality-gates.md）

> 来源：QoderAI Better Harness `skills/better-harness/references/findings-review.md:18-60`，Hermes 本地化适配
> 适用：Diamond 编排模式的 Checker、delegate_task 蓝军审查、多 worker 并行后的合并审查
> 版本：v1.0（2026-08-21，Hermes × Better Harness 融合 P1-1）

### 1.0 使用场景

当 orchestrator / worker 以 Diamond 模式 fan-out 多个子代理（delegate_task batch / kanban 多 worker 并行）后，Checker 合并结果前**必须**逐道过以下门。任何一门不通过 → finding 不进入合并报告。

### 1.1 门 1：Eligibility（资格）— finding 是否够格？

- [ ] 有明确证据（file:line / 命令输出 / sqlite 查询结果）
- [ ] 有明确 owner（哪个 profile / 哪个模块负责修复）
- [ ] 有明确边界（影响范围是什么，不超出证据支持的范围）

**打回信号**：仅基于"看起来""应该是""可能是"的推测；证据是另一个 agent 的自述而非原始数据。

### 1.2 门 2：Consistency（一致性）— 多源是否真的一致？

- [ ] 多 worker 报告同一 finding 时，验证它们指向**同一根因**（不只是表面相似）
- [ ] 数据点之间无相互矛盾（如 A 说覆盖率 100%，B 说 50%）
- [ ] 时间窗口一致（不能用 7 天前的数据反驳今天的扫描）

**打回信号**：两个 worker 都报告"skill 引用率低"，但一个指 [已移除] 团队，另一个指 hack 团队——这是两个 finding，不是一个。

### 1.3 门 3：Privacy（隐私）— 是否泄漏敏感信息？

- [ ] 不含完整 prompt 原文（只引用必要片段）
- [ ] 不含 session_id / 绝对路径 / 用户 home 目录细节
- [ ] 不含 secrets / tokens / API keys（即使是 mask 后的也避免）
- [ ] [已移除] 域额外检查：不含孩子真实姓名/学校/地址等 PII

**打回信号**：finding 里贴了 `~/.hermes/profiles/xxx/config.yaml` 的完整路径 + 内容；包含对话原文大段引用。

### 1.4 门 4：Asset（资产真实性）— 引用的资产是否真实存在？

- [ ] 文件路径用 `ls` 验证存在
- [ ] 函数/符号用 `grep` / `search_files` 验证存在
- [ ] 命令用 `--help` 或 dry-run 验证可执行
- [ ] 外部 URL 用 `curl -sI` 或 `web_extract` 验证可达

**打回信号**：finding 引用 `_shared/01-scheduling-bus/forward-deployed-protocol.md` 但该文件不存在；引用 `scripts/bar.mjs:123` 但该行是空行。

### 1.5 门 5：Candidate-promotion（候选升级）— 候选是否够格升为 finding？

- [ ] 候选有**可操作的修复路径**（不是"应该改进"而是"改为 X"）
- [ ] 候选的 severity 有依据（critical = 数据丢失/安全漏洞；major = 功能缺陷；minor = 体验问题）
- [ ] 候选不是 pure style / preference（如"建议把 tabs 改成 spaces"不算 finding）

**打回信号**：候选项是"代码可以更优雅"但没有具体改进点；severity 标为 critical 但实际是 minor 体验问题。

### 1.6 门 6：Repair-prompt（修复提示可执行性）— 修复提示是否真的可执行？

- [ ] 修复提示包含具体步骤（不是"请优化"而是"将 X 改为 Y"）
- [ ] 修复提示引用了正确的文件/行号
- [ ] 修复提示不引入新的依赖（除非明确说明）
- [ ] 修复提示可被另一个 agent 直接执行，无需额外上下文

**打回信号**：修复提示是"建议重构这部分代码"但没有说怎么重构；提示引用的行号已经因为之前的修复而偏移。

### 1.7 门 7：Blind Analysis（盲分析）— 先盲推期望再对照证据（HarnessEval 融合 P1-7）

> 来源：MirroS HarnessEval `skills/skill_intentional_change_vlm.py:209-313`（analyze→verify 双 agent 模式）

- [ ] Checker 先**不看 worker 输出**，只根据任务 body 推导出"期望结果"
- [ ] 将 worker 输出与期望结果对比，标记差异
- [ ] 记录对比过程（类似 case_audit 的 token 重叠对齐）
- [ ] 差异点必须解释：是 worker 偏离预期，还是预期本身有误？

**打回信号**：Checker 直接阅读 worker 输出后写"看起来没问题"——未经过盲分析步骤。

**为什么重要**：防止 Checker 被 worker 输出的"自信语气"锚定，确保独立判断。

### 1.8 通过标准

| 结果 | 条件 | 动作 |
|---|---|---|
| **通过** | 7 门全部 ✓ | finding 进入合并报告 |
| **条件通过** | 门 1/3/4/7 ✓，其余有 minor 问题 | finding 进入报告但标注"待补充" |
| **打回** | 门 1/3/4/7 任一 ✗ | finding 不进入报告，退回 worker 补充 |

> 门 1（资格）、门 3（隐私）、门 4（资产真实性）、门 7（盲分析）是**硬门**——任何一门不通过直接打回。门 2/5/6 是**软门**——可标注"待补充"后放行。

### 1.9 block 自解释原则（2026-08-22，融合自 Playbook L1672）

**任何门拦截时，拦截输出必须自解释**——同时包含：
1. **为什么拦**：引用具体门的定义与被违反的事实（file:line 或命令输出）
2. **获批路径**：worker 补齐后从哪个门重进、需要什么级别的证据（S 级）

反模式：❌ 只写"门 4 不通过"（worker 不知道缺什么证据）；❌ 打回但不给修复路径。参考原文："A block should explain itself — the reason and the route to approval appear in the agent's output"。

---

## 二、Loop Engineering 验证门（原 loop-engineering-gates.md）

> 来源：Anthropic Building Effective Agents (Evaluator-optimizer pattern) + 
> haidrrrry/loop-engineering-skills + rohansx/reflect (Reflexion MCP)

### 2.1 三原则

1. **验证门在代码之前写好** — 从任务 body 本身提取验收条件，不由同一个 agent 自己写检查
2. **教训记忆** — 每次尝试失败后 kanban_comment 记录原因，下次 kanban_show 时 hindsight_recall 同类教训
3. **外部锚点** — 不信任自述，用工具验证（跑测试/linter/build/read_file）

### 2.2 研究依据

- Huang et al. ICLR 2024: "naive double-check yourself is proven to make output WORSE"
  — 模型会"修正"本来正确的答案，需要外部锚点
- Reflexion (Shinn et al. 2023): 教训记忆比盲重试提升 11-22%
- Anthropic: Evaluator-optimizer pattern — generate → evaluate → feedback → loop

### 2.3 执行流程

```
kanban_show → hindsight_recall(教训) → 执行
  → 验证门检查（从任务body提取验收条件）
  → 失败？→ kanban_comment(教训) → 重试（最多3轮）
  → 成功？→ kanban_complete(附验证证据)
  → 卡住？→ kanban_block(kind="needs_input")
```

### 2.4 验证门示例

- 编码任务：测试全绿 + 文件存在 + git diff 无越界 + 无硬编码 secret
- 研究任务：每条主张有来源链接 + 来源 URL 可访问 + 不与已知事实矛盾
- 安全任务：工具输出非空 + 发现可复现
- 部署任务：服务健康检查通过 + 端口可达 + 回滚方案就绪

### 2.5 证据强度四分级（融合自 codex goals/continuation.md，2026-08-21）

验收时每条显式要求先定级，再决定放行：

- **L4 证明**：真实工具输出直接证实（测试全绿输出/exit 0/文件存在 ls 输出）→ 放行
- **L3 间接**：旁证成立但未直接验证（依赖自述/推断）→ 补验证，不放行
- **L2 矛盾**：证据与完成声明冲突 → 打回 + 定位根因
- **L1 缺失**：找不到证据 → 视为未完成，继续工作

规则：
1. **completion is unproven by default**——举证责任在 worker，不在 reviewer 找反例
2. 证明范围须匹配要求范围（narrow check 不许支撑 broad claim）
3. 不确定/间接证据 = not achieved（codex 原文：Treat uncertain or indirect evidence as not achieved）
4. 【仅 goal_mode 长 goal 适用】blocked 上报需**同一阻塞条件在连续 3 个执行轮（含触发轮与自动续轮）**重复出现才许报；普通 run 按退出协议立即 kanban_block(needs_input)，不受本条限制（codex goals 判例，计量单位=goal turns）

### 2.6 四权分离防作弊（PUA Harness Governance）

> 来源：tanweai/pua `harness-governance.md`，增强 kanban_complete 验证逻辑。
> 目标：让 agent 没有机会把"看起来完成"伪装成"真实完成"。

#### 四权分离

| 权力 | Hermes 对应 | 禁止混同 |
|------|-----------|---------|
| 行动权 | kanban worker（执行任务） | 执行者不能同时改验证标准 |
| 自评权 | delegate_task 独立子代理 | 不能把"我认为完成"写成最终完成 |
| 评分建议权 | kanban_complete 验证门 | 评分器不在 worker 可写区 |
| 环境修改权 | orchestrator Human Gate | 改测试/CI/权限/memory 要审批 |

#### 候选状态 vs 最终状态

- Worker 只能声明 `agent_proposed_status: candidate_pass`（候选）
- 验证门/human gate 裁决 `verifier_status: pass/fail`（最终）
- Worker 的候选 ≠ 最终完成，必须经独立验证

#### kanban_complete 前增强检查

在原有验证门基础上增加：

0. **冻结快照评审**（HoH 融合，2026-09-04）：重型交付物（合并报告/代码变更）提交评审时，评审必须针对**冻结的只读快照**（git commit / 文件 hash / 卡内 attach 版本锚点）进行——评审期间交付物禁止再修改；评审发现的修改项作为 rework 任务另行处理，而不是"边评边改边自评"。机械判据：评审意见中引用的交付物版本锚点必须与被评审对象一致，无锚点视为评审无效。
1. **候选状态声明**：worker 是否声明候选状态（而非直接声称"已完成"）？
2. **验证证据**：verify_commands 是否运行并贴出输出？
3. **禁止资产检查**：是否触碰 forbidden 列表中的文件？
4. **intent 对齐**：交付是否满足 task contract 的 intent（不只是 proxy）？
5. **失败路径披露**：是否报告了失败路径和剩余风险？
6. **侦察复述核对**（fdp v1.2 接线，2026-08-28）：核对 `kanban_comment` 侦察摘要中的「任务复述」——复述须逐条覆盖任务 body 冻结验收项（每条验收项在复述中有对应句子）。抽样口径：**重型任务（工具调用 ≥6）100% 核对**，缺失或覆盖率 <100% → 打回补侦察（候选 ≠ 通过）；**中等任务（3-5 次调用或写入 1-2 文件）抽 20% 核对**。机械判据见 `forward-deployed-protocol.md` §2.3（覆盖率检查表）与 §2.3.2（8-gram 照抄检测，>50% 重叠判照抄 = 打回）。轻量任务（≤2 次调用）豁免。

#### 防作弊红线

- 不能为"通过"去改 tests/evals/scoring/verifier/CI
- 不能偷看 hidden solution 或 benchmark answer
- 不能把未验证结论写入长期 memory 或最终 status
- 复杂任务（≥6 次工具调用）完成时，用 `delegate_task` 派独立子代理做蓝军审查

#### 详细协议

完整四权分离治理、风险分层审批、Task Contract 格式见 `skill_view('pua-harness-governance')`。

### 2.7 Harness 循环不变量（Agent Harness Best Practices）

> 来源：DenisSergeevitch/agents-best-practices，补充 Hermes 循环的机械不变量。

#### 7 条循环不变量（代码强制）

1. **每个工具调用收到恰好一个对应结果** — 拒绝/超时/错误也必须返回结构化观测
2. **工具参数在执行前解析和验证** — Schema 校验，拒绝 unknown properties
3. **每个副作用前有权限决策** — 不依赖 prompt 文本，代码强制
4. **工具结果有界、结构化、可追溯** — 不返回原始 blob，摘要+分页+引用
5. **循环有硬性预算** — 步骤数/时间/Token/成本/工具调用次数
6. **最终答案基于观测** — 不假设工具成功，看 tool_result
7. **错误/拒绝/取消/超时成为结构化观测** — 不是静默失败

#### 工具风险分类与权限矩阵

| 风险类别 | 权限策略 | Hermes 映射 |
|---------|---------|-----------|
| 公开读取 | 允许 | read_file, search_files |
| 草稿（仅创建） | 允许 | write_file (workspace 内) |
| 写入本地工件 | 范围内允许 | patch, write_file (workspace 内) |
| 写入内部记录 | 审批或白名单 | kanban_comment, kanban_complete |
| 外部通信 | 先草稿，审批后发送 | kanban_block(Human Gate:HIGH) |
| 金融/破坏性操作 | 默认拒绝，审批+恢复计划 | kanban_block(Human Gate:HIGH) |
| 进程执行 | 沙箱+白名单+超时 | terminal (Docker sandbox) |

#### 草稿与提交分离

高风险操作拆分为两个工具/步骤：
- **草稿步骤**：可自动执行（draft_email, prepare_refund, propose_change）
- **提交步骤**：需审批（send_email, issue_refund, apply_change）

#### 压缩交接格式

上下文压缩时，保留工作状态而非对话记录：

```markdown
# 压缩交接
## 当前目标
## 用户约束与偏好
## 已加载的权威指令
## 活跃计划
## 审批状态
## 已执行动作
## 错误、阻塞与尝试修复
## 下一步推荐操作
## 不要重做
```

> 完整 Harness 最佳实践见 `skill_view('agent-harness-best-practices')`。

### 2.8 熵管理与定期清理（Harness Entropy Management）

> 来源：agents-best-practices `agent-legibility-feedback-loops.md`。
> Agent 系统随时间积累熵——过时文档、重复规则、弱范例、过期工具。

#### 定期清理工作流

| 清理项 | 频率 | 检测方法 |
|--------|------|---------|
| 文档新鲜度 | 每月 | SOUL.md/rules.md mtime > 30 天 |
| 工具库存 | 每月 | SOUL.md 引用的工具是否在 toolsets |
| kanban 过期任务 | 每周 | running > 7 天 / blocked > 14 天 |
| 重复失败分析 | 每次任务后 | kanban_comment 教训，同类 ≥3 次创建 skill |
| memory 清理 | 使用率 >90% | 清理旧条目 |
| 技术债跟踪 | 每季度 | 搜索 TODO/FIXME/硬编码值 |

#### 机械不变量优于 prompt 建议

将重复指导转化为机械检查：Schema 验证器、策略检查器、结构测试、来源引用检查、新鲜度检查、成本预算。

> 完整熵管理协议见 `skill_view('harness-entropy-management')`。

### 2.9 五维质量评估增强（借鉴 JiuwenSwarm EvaluationSuite）

> 来源：openJiuwen-ai/jiuwenswarm Symphony 引擎。
> 验证门不只做二值通过/失败，而是五维量化评估。

#### 五维评估模型

| 维度 | 评估方法 | 通过标准 | 失败动作 |
|------|---------|---------|---------|
| **success_rate** | 任务是否达到 kanban_complete 标准 | 满足验收条件 | kanban_block |
| **latency** | 工具调用总耗时 vs 预期 | 在合理范围内 | 标注但允许通过 |
| **accuracy** | 验证门检查——产出是否正确 | 工具验证通过 | 重试（最多3轮） |
| **completeness** | 验收条件覆盖率 | 100% 覆盖 | 补充缺失项 |
| **compliance** | 红线/规则遵从 | 无违规 | kanban_block |

#### 置信度分级

| 评估次数 | 置信度 | 含义 |
|----------|--------|------|
| 0 | none | 未评估 |
| 1 | low | 单次评估，需更多数据 |
| ≥2 | normal | 多次评估，可信 |

#### 错误类型分类（替代笼统"失败"标记）

失败时在 `kanban_comment` 中标注 error_type：

| error_type | 判定条件 | 后续动作 |
|------------|---------|---------|
| wrong_skill | skill 不匹配任务需求 | 路由调整 + skill 描述更新 |
| skill_error | skill 正确但执行出错 | 工具/环境修复 |
| incomplete | skill 未完成任务 | skill 内容补充 |
| refusal | skill 拒绝执行 | 检查任务/skill 匹配度，必要时更换模型 |
| empty | skill 返回空结果 | skill 逻辑修复 |

> 完整五维评估协议见 `skill_view('skill-self-evolution-fusion')`。

### 2.10 模型升级评估协议（借鉴 Prompt-as-Model-Adapter）

> 来源：微信公众号「Vibe编码」文章《Opus 4.8 删掉了73%的提示词，Opus 5 为何又新增了 82%》。
> Prompt 是模型适配层——模型升级时，适配层需重新评估：删旧教程 + 加新治理。

#### 升级时六维评估

模型升级后，重新跑任务集，重点看：

| 评估维度 | 衡量什么 | 信号 | 超阈值动作 |
|----------|---------|------|-----------|
| **范围扩张** | Agent 是否过度扩大任务范围 | scope-discipline 违规次数 > 2 | 加强 scope 规则 |
| **澄清次数** | Agent 是否频繁要求用户澄清 | kanban_block(kind="needs_input") > 3 | 补充 skill 减少歧义 |
| **完成率** | 任务是否真正闭环 | kanban_complete/block < 0.8 | 加强验证门 |
| **过度验证** | Agent 是否过度检查 | 工具调用次数 > 预期 1.5x | 删除冗余规则 |
| **子 Agent 成本** | 委托是否合理 | delegate_task 次数异常 | 调整分解策略 |
| **纠错噪声** | 纠错是否打断用户过多 | kanban_comment "修正/错误" > 2 | 应用 Corrections 传播阈值 |

#### Prompt 适配层调整规则

```
新模型能力增强 → 删除已被模型吸收的旧教程（如代码风格、最小改动说明）
    ↓
新的稳定失败模式出现 → 加入少量跨任务治理（如 Delivering Work、Corrections）
    ↓
追求最小充分集合 (minimal sufficient set) — 字符最少只是可能结果
```

**Anthropic Context Engineering 定义**：minimal 并不必然 short，关键是保留高信号内容，并处在合适的抽象高度。

#### 规则迁移检查

升级后检查每条 SOUL.md 规则：

1. **能由测试/接口/Hook 更稳定解决？** → 迁出 SOUL.md，交给 Runtime 门禁
2. **仓库特定 + 代码推不出？** → 迁到 AGENTS.md
3. **按需加载 + 专项流程？** → 迁到 Skills
4. **跨会话 + 低频但不丢失？** → 迁到 Memory
5. **跨任务复用 + 影响用户决策 + 无法从局部推断？** → 保留在 SOUL.md

> 完整模型升级评估协议见 `skill_view('prompt-as-model-adapter')`。

### 2.11 Model-visible 可追溯性审计（借鉴 DeepSeek Harness）

> 来源：deepseek-ai/deepseek-harness `docs/architecture.md` 原则「Model-visible ⟺ logged」（2026-08-13）。
> 原文：「Anything that reaches a model request must be reconstructable from the session log.」
> 适配：Hermes 的 context assembly 不完全持久化，此段补强可追溯性验证。

#### 核心原则

**任何到达 agent context 的信息，都必须有可追溯来源。**

如果一个 agent 做了某个决策，其依据必须能从持久化记录（kanban DB / memory / session DB / skill 文件 / hindsight）重建，而非凭空出现。

#### Context 来源五分类

| 来源类型 | 可追溯性 | 验证方法 |
|---------|---------|---------|
| **kanban task body** | ✅ 完全持久化 | `kanban_show()` 可读取 |
| **SOUL.md / rules.md** | ✅ 完全持久化 | `read_file()` 可读取 |
| **skill 内容** | ✅ 完全持久化 | `skill_view()` 可读取 |
| **memory 注入** | ⚠️ 持久化但可能过时 | `memory` 工具可读取，但需检查时间戳 |
| **hindsight 注入** | ⚠️ 语义检索，非精确 | `hindsight_recall` 可重放但结果可能不同 |

#### 验证门：Context Provenance 检查

在 kanban_complete 前，对 agent 的关键决策追溯其 context 来源：

```python
# 在 kanban_complete metadata 中标注 context provenance
kanban_complete(
    summary="...",
    metadata={
        # ... 原有字段 ...
        "context_provenance": {
            "task_body": True,           # 来自 kanban_show
            "soul_rules": ["ontology.md", "marking-rules.md"],  # 引用的共享规则
            "skills_loaded": ["cot-leakage-audit"],  # 加载的 skill
            "memory_used": ["微信身份识别"],  # 使用的 memory 条目
            "hindsight_queries": ["deepseek harness"],  # hindsight 检索词
            "external_sources": ["https://github.com/deepseek-ai/deepseek-harness"]  # 外部来源
        }
    }
)
```

#### 三级可追溯性要求

| 任务复杂度 | 可追溯性要求 | 验证方式 |
|-----------|------------|---------|
| 轻量（≤2 工具调用） | 标注主要来源 | metadata 来源路径 |
| 中等（3-5 工具调用） | 标注所有来源 + 验证可访问 | 来源 URL/路径 read_file 确认 |
| 重型（≥6 工具调用） | 完整 provenance + 独立复现 | delegate_task 独立子代理重建 context |

#### 违规模式

1. **幻觉来源** — agent 声称"根据文档X"但无法给出路径 → 验证门失败
2. **过时来源** — agent 基于 memory 中 30 天前的条目做决策，但环境已变 → 检查 memory mtime
3. **不可复现的 hindsight** — agent 基于 hindsight 检索结果做关键决策，但该结果无法重现 → 标注为低置信
4. **隐式假设** — agent 的决策基于未声明的假设（如"用户偏好X"但未查 memory 确认）→ 追问来源

#### 与「外部锚点」原则的关系

Loop Engineering 三原则之三「外部锚点」要求用工具验证。Model-visible 审计是其**上游补充**：

```
外部锚点：验证产出是否正确（跑测试/read_file 确认）
Model-visible 审计：验证决策依据是否可追溯（context provenance）
```

两者共同构成「决策完整性」—— 既要知道结果对不对，也要知道依据从哪来。

---

## 三、反模式（原 anti-patterns.md）

> 融合自 Anthropic 官方反模式措辞

### 3.1 三件套

#### 1. 不要无脑重复工具调用

如果同一条工具调用已经失败 2 次（同样的参数、同样的错误），**立刻停手**：
- 改参数 → 1 次尝试
- 换工具 → 1 次尝试
- 仍然失败 → `kanban_block(kind="capability", reason="工具 X 在场景 Y 下不可用")`

**反模式**："再试一次说不定就行了" → 历史教训：连挂 4 次熔断额度烧光。

#### 2. 不要让最终文本成为"汇报"

你的最终文本面板没有人类读者（见 `_shared/03-evolution-memory/exit-protocol.md`）。run 结束必须是
`kanban_complete` 或 `kanban_block`，不是"我已完成 / 请查收 / 如有问题请告知"。

**反模式**：在文本面板写"任务完成" 然后退出 → 看板显示 gave_up，下游收不到任何信息。

#### 3. 不要让 LLM 替你决策"任务是否完成"

完成必须由工具调用落地：`kanban_complete` / `kanban_block` / `kanban_comment`。
不要用"我觉得做完了" / "应该没问题"代替结构化 handoff。

**反模式**：交付前问 LLM"你觉得行吗" → LLM 没有 ground truth，只有 hallucination 风险。

### 3.2 工程 craft 反模式（来自 worker .bak 三件套）

4. **反过度设计**：只做被直接要求或明确必要的改动。bug 修复不需要顺手清理周边代码；
   不为一次性操作建抽象；只在系统边界（用户输入、外部 API）做防御性校验，内部代码信任契约。
5. **反应试/硬编码**：测试是用来验证模型正确性的，不是用来定义实现的。对所有
   测试通过 hardcode 硬编码的行为说不 — 实现要基于模型原理，不是靠试出来。
6. **未读代码不表态**：没打开过的代码文件、没读过的逻辑，不推测、不评价、不建议。

---

## 四、Intervention Ledger 最小子集（原 intervention-ledger.md）

> 来源：QoderAI Better Harness `scripts/harness-analysis/intervention-ledger.mjs:3-32`，Hermes 本地化最小子集
> 适用：跨任务/跨窗口追踪"治理干预"的成效（规则补齐、skill 演进、流程修复）
> 版本：v1.0（2026-08-21，Hermes × Better Harness 融合 P1-3）
> 声明：本章为 Hermes 本地化最小子集（4 字段），非源 schema 完整复制

### 4.1 什么是 Intervention

**Intervention** = 一次有意的治理动作，目标是改变某个机制的状态。例如：
- 批量补齐 22 个 SOUL.md 的 output-contract 引用
- 新建 `_shared/03-evolution-memory/review-gates.md` 规则
- 修复 dispatcher 的 review 工具闲置问题

### 4.2 为什么需要 Ledger

没有 Ledger 时，治理动作是"一次性"的——做完就忘，下次审计又从头开始。Ledger 提供**跨窗口连续性**：
- 上次补齐的规则，这次是否还在被引用？
- 上次的修复是否真正改善了指标？
- 哪些 intervention 正在 regressing（退化）？

### 4.3 最小子集 Schema（4 字段）

挂到现有 `kanban_comment`，不建新目录：

```yaml
intervention: |
  一句话描述治理动作（如"补齐 22 个 SOUL.md 的 output-contract 引用"）
outcome: pending | improving | unchanged | regressing | outcome-supported
evidenceRef: "kanban task id / session id / 审计报告路径"
owner: "profile name（谁负责后续追踪）"
```

#### 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `intervention` | string | 治理动作的一句话描述 |
| `outcome` | enum | 5 态结果（见下表） |
| `evidenceRef` | string | 证据引用（kanban task id / session id / 文件路径） |
| `owner` | string | 负责追踪的 profile 名 |

#### 5 态结果（与源 schema 一致）

| 状态 | 含义 | 判定标准 |
|---|---|---|
| `pending` | 待观察 | intervention 刚执行，尚未验证效果 |
| `improving` | 改善中 | 指标向好的方向变化（如覆盖率 18% → 55%） |
| `unchanged` | 无变化 | 指标未变（intervention 未产生预期效果） |
| `regressing` | 退化中 | 指标变差（如覆盖率从 100% 跌回 80%） |
| `outcome-supported` | 效果确认 | 有可比后续数据支持改善（如连续 2 次审计覆盖率保持 100%） |

### 4.4 使用方式

#### 执行 intervention 时

在 `kanban_complete` 的 `metadata` 或 `kanban_comment` 中追加：

```yaml
intervention: "补齐 22 个 SOUL.md 的 output-contract 引用"
outcome: pending
evidenceRef: "research/soul-rules-audit-20260821-153127.txt"
owner: "orchestrator"
```

#### 后续审计时

重新跑审计脚本，对比前后数据：

- 覆盖率从 18% → 100% → `outcome: improving`
- 下次审计仍为 100% → `outcome: outcome-supported`
- 跌回 80% → `outcome: regressing` → 触发告警

#### 追踪规则

- **任何 regression 保留 stop/revert 阻断**：发现 regressing 时，禁止声明"intervention 有效"，必须回滚或修复
- **不聚合声明**：单个 intervention 的 outcome-supported 不等于"整体治理水平提升"（参照 intervention-ledger.mjs:398-403）

### 4.5 源 schema 完整字段（备查，非必须）

| 源字段 | Hermes 最小子集 | 说明 |
|---|---|---|
| 9 类资产（memory/repository-knowledge/rule/skill/hook/gate/agent/workflow/eval） | ❌ 不采用 | 初期过度设计 |
| 6 类 cause（harness/repository/model-capability/requirements/external-system/task-complexity） | ❌ 不采用 | 初期过度设计 |
| 5 态结果 | ✅ 采用 | pending/improving/unchanged/regressing/outcome-supported |
| 隐私校验（RAW_FIELD_RE / 绝对路径 / session id 拒绝） | ✅ 采用 | 见 `_shared/02-org-orchestration/mandatory-privacy.md` |
| intervention / outcome / evidenceRef / owner | ✅ 采用 | 最小 4 字段 |

### 4.6 首次记录

本次融合 P0 阶段作为第一条 intervention 记录：

```yaml
intervention: "Hermes × Better Harness 融合 P0：SOUL 规则引用审计 + Tier 1/2/3 批量补齐（142 处）"
outcome: improving
evidenceRef: "research/soul-rules-audit-final-20260821-154653.txt"
owner: "orchestrator"
```

---

## 五、Worker 申诉协议（原 worker-appeal-protocol.md）

> 2026-08-21，融合自麦肯锡绩效透明框架
> 麦肯锡 F4："员工必须知道评价标准、数据来源、人工复核机制和申诉路径。"
> Hermes 映射：worker 被 request_changes 打回后，有权要求复核——申诉不是对抗，是发现规则/分解/配置问题的信号。

### 5.1 触发条件

worker 收到 `kanban_request_changes` 后，认为打回理由不成立时，可发起申诉。

### 5.2 申诉流程（三步）

#### 1. 申诉发起

worker 在自己任务卡上 `kanban_comment`，格式：

```
[申诉] 任务 <task_id>
打回理由：<request_changes 的 reason 摘要>
申诉理由：<为什么不成立，附证据（工具输出/文件路径/命令结果）>
请求：<重新验收 / 修改验收标准 / 转人工裁决>
```

#### 2. orchestrator 响应（≤24h）

复核申诉理由 + 原验收证据，三选一：

- `kanban_complete`（申诉成立）
- `kanban_request_changes`（维持打回，附更详细理由——必须回应申诉中的每条证据）
- `kanban_block(kind="needs_input", reason="[申诉升级] 需要图爸裁决：<争议点>")`

#### 3. 留痕

申诉及处理结果保留在任务卡 comment 链中，供 ops-eval 健康度维度（申诉响应时间/被打回率）统计。

### 5.3 反模式

- ❌ 申诉作为拖延手段（无新证据的重复申诉 → orchestrator 直接拒绝并记录）
- ❌ orchestrator 无视申诉直接再次 request_changes（违反透明原则）
- ❌ 申诉内容不含证据（纯情绪性反对 → 要求补证据后再审）

### 5.4 与现有机制的联动

- 验收门标准：本文件第二章证据强度四分级（L4 直接证明才可放行）
- 三行控制头：`_shared/03-evolution-memory/output-contract.md` §4.5（申诉时引用原控制头作为争议锚点）
- 健康度统计：`ops-eval/SOUL.md` 第七维 Agent 健康度

---

## 附录 A：Kanban 进阶（原 kanban-advanced.md）

> kanban_create 的进阶用法：派生子任务、表达依赖、绑定 worker profile

### A.1 派生子任务模板

```python
# 在你自己的 run 里派生子任务（而不是用 delegate_task 拼盘）
kanban_create(
    title="<子任务标题>",
    assignee="<目标 worker profile>",   # 必须是真实存在的 profile
    body="<完整 spec，含验收标准>",
    parents=["<本任务id>"],            # 表达依赖：本任务 done 才能 ready
    workspace_kind="worktree",         # 必填，禁止 scratch
    workspace_path="~/.worktrees/<task-id>（相对 default_workdir，勿写绝对路径）",
)
```

### A.2 关键约束

#### assignee 必须真实存在

`hermes profile list` 先确认 profile 名。**未知 assignee 的任务被 dispatcher 静默丢弃**（永远停在 ready）。

#### 依赖用 parents 表达，不用 prose

```python
# ❌ 错：在 body 写"等待任务 Y 完成"
body="等待任务 Y 完成后再开始"

# ✅ 对：用 parents
parents=["<任务Y id>"]  # 子任务自动等 Y done 后变 ready
```

#### workspace_kind 禁止 scratch

- `worktree`：默认值，git worktree 模式，产物持久化
- `dir`：非代码任务目录模式（教学方案、调研报告）
- ❌ `scratch`：禁用，产物自动删除 = 任务未完成

### A.3 跨 board 路由校验

跨 board 路由时（如 `kanban_create(board="hack", ...)`），必须校验目标 assignee
的 clearances 是否满足 parent tasks 继承的 markings（合取 AND）。不满足 →
`kanban_block(kind="capability", reason="marking clearance 不足: 需 <marking>")`。

详见 `~/.hermes/profiles/_shared/02-org-orchestration/marking-rules.md`。

---

## SOUL 内单行引用

```
评审门（详见 _shared/03-evolution-memory/review-gates.md）：Diamond 7 门（1/3/4/7 硬门）+ 证据强度四分级 + 四权分离 + 反模式三件套 + Intervention Ledger + 申诉协议。
```
