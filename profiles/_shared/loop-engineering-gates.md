# Loop Engineering 验证门（共享参考）

> 来源：Anthropic Building Effective Agents (Evaluator-optimizer pattern) + 
> haidrrrry/loop-engineering-skills + rohansx/reflect (Reflexion MCP)

## 三原则

1. **验证门在代码之前写好** — 从任务 body 本身提取验收条件，不由同一个 agent 自己写检查
2. **教训记忆** — 每次尝试失败后 kanban_comment 记录原因，下次 kanban_show 时 hindsight_recall 同类教训
3. **外部锚点** — 不信任自述，用工具验证（跑测试/linter/build/read_file）

## 研究依据

- Huang et al. ICLR 2024: "naive double-check yourself is proven to make output WORSE"
  — 模型会"修正"本来正确的答案，需要外部锚点
- Reflexion (Shinn et al. 2023): 教训记忆比盲重试提升 11-22%
- Anthropic: Evaluator-optimizer pattern — generate → evaluate → feedback → loop

## 执行流程

```
kanban_show → hindsight_recall(教训) → 执行
  → 验证门检查（从任务body提取验收条件）
  → 失败？→ kanban_comment(教训) → 重试（最多3轮）
  → 成功？→ kanban_complete(附验证证据)
  → 卡住？→ kanban_block(kind="needs_input")
```

## 验证门示例

- 编码任务：测试全绿 + 文件存在 + git diff 无越界 + 无硬编码 secret
- 研究任务：每条主张有来源链接 + 来源 URL 可访问 + 不与已知事实矛盾
- 安全任务：工具输出非空 + 发现可复现
- 部署任务：服务健康检查通过 + 端口可达 + 回滚方案就绪

---

## 四权分离防作弊（PUA Harness Governance）

> 来源：tanweai/pua `harness-governance.md`，增强 kanban_complete 验证逻辑。
> 目标：让 agent 没有机会把"看起来完成"伪装成"真实完成"。

### 四权分离

| 权力 | Hermes 对应 | 禁止混同 |
|------|-----------|---------|
| 行动权 | kanban worker（执行任务） | 执行者不能同时改验证标准 |
| 自评权 | delegate_task 独立子代理 | 不能把"我认为完成"写成最终完成 |
| 评分建议权 | kanban_complete 验证门 | 评分器不在 worker 可写区 |
| 环境修改权 | orchestrator Human Gate | 改测试/CI/权限/memory 要审批 |

### 候选状态 vs 最终状态

- Worker 只能声明 `agent_proposed_status: candidate_pass`（候选）
- 验证门/human gate 裁决 `verifier_status: pass/fail`（最终）
- Worker 的候选 ≠ 最终完成，必须经独立验证

### kanban_complete 前增强检查

在原有验证门基础上增加：

1. **候选状态声明**：worker 是否声明候选状态（而非直接声称"已完成"）？
2. **验证证据**：verify_commands 是否运行并贴出输出？
3. **禁止资产检查**：是否触碰 forbidden 列表中的文件？
4. **intent 对齐**：交付是否满足 task contract 的 intent（不只是 proxy）？
5. **失败路径披露**：是否报告了失败路径和剩余风险？

### 防作弊红线

- 不能为"通过"去改 tests/evals/scoring/verifier/CI
- 不能偷看 hidden solution 或 benchmark answer
- 不能把未验证结论写入长期 memory 或最终 status
- 复杂任务（≥6 次工具调用）完成时，用 `delegate_task` 派独立子代理做蓝军审查

### 详细协议

完整四权分离治理、风险分层审批、Task Contract 格式见 `skill_view('pua-harness-governance')`。

---

## Harness 循环不变量（Agent Harness Best Practices）

> 来源：DenisSergeevitch/agents-best-practices，补充 Hermes 循环的机械不变量。

### 7 条循环不变量（代码强制）

1. **每个工具调用收到恰好一个对应结果** — 拒绝/超时/错误也必须返回结构化观测
2. **工具参数在执行前解析和验证** — Schema 校验，拒绝 unknown properties
3. **每个副作用前有权限决策** — 不依赖 prompt 文本，代码强制
4. **工具结果有界、结构化、可追溯** — 不返回原始 blob，摘要+分页+引用
5. **循环有硬性预算** — 步骤数/时间/Token/成本/工具调用次数
6. **最终答案基于观测** — 不假设工具成功，看 tool_result
7. **错误/拒绝/取消/超时成为结构化观测** — 不是静默失败

### 工具风险分类与权限矩阵

| 风险类别 | 权限策略 | Hermes 映射 |
|---------|---------|-----------|
| 公开读取 | 允许 | read_file, search_files |
| 草稿（仅创建） | 允许 | write_file (workspace 内) |
| 写入本地工件 | 范围内允许 | patch, write_file (workspace 内) |
| 写入内部记录 | 审批或白名单 | kanban_comment, kanban_complete |
| 外部通信 | 先草稿，审批后发送 | kanban_block(Human Gate:HIGH) |
| 金融/破坏性操作 | 默认拒绝，审批+恢复计划 | kanban_block(Human Gate:HIGH) |
| 进程执行 | 沙箱+白名单+超时 | terminal (Docker sandbox) |

### 草稿与提交分离

高风险操作拆分为两个工具/步骤：
- **草稿步骤**：可自动执行（draft_email, prepare_refund, propose_change）
- **提交步骤**：需审批（send_email, issue_refund, apply_change）

### 压缩交接格式

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

---

## 熵管理与定期清理（Harness Entropy Management）

> 来源：agents-best-practices `agent-legibility-feedback-loops.md`。
> Agent 系统随时间积累熵——过时文档、重复规则、弱范例、过期工具。

### 定期清理工作流

| 清理项 | 频率 | 检测方法 |
|--------|------|---------|
| 文档新鲜度 | 每月 | SOUL.md/rules.md mtime > 30 天 |
| 工具库存 | 每月 | SOUL.md 引用的工具是否在 toolsets |
| kanban 过期任务 | 每周 | running > 7 天 / blocked > 14 天 |
| 重复失败分析 | 每次任务后 | kanban_comment 教训，同类 ≥3 次创建 skill |
| memory 清理 | 使用率 >90% | 清理旧条目 |
| 技术债跟踪 | 每季度 | 搜索 TODO/FIXME/硬编码值 |

### 机械不变量优于 prompt 建议

将重复指导转化为机械检查：Schema 验证器、策略检查器、结构测试、来源引用检查、新鲜度检查、成本预算。

> 完整熵管理协议见 `skill_view('harness-entropy-management')`。

---

## 五维质量评估增强（借鉴 JiuwenSwarm EvaluationSuite）

> 来源：openJiuwen-ai/jiuwenswarm Symphony 引擎。
> 验证门不只做二值通过/失败，而是五维量化评估。

### 五维评估模型

| 维度 | 评估方法 | 通过标准 | 失败动作 |
|------|---------|---------|---------|
| **success_rate** | 任务是否达到 kanban_complete 标准 | 满足验收条件 | kanban_block |
| **latency** | 工具调用总耗时 vs 预期 | 在合理范围内 | 标注但允许通过 |
| **accuracy** | 验证门检查——产出是否正确 | 工具验证通过 | 重试（最多3轮） |
| **completeness** | 验收条件覆盖率 | 100% 覆盖 | 补充缺失项 |
| **compliance** | 红线/规则遵从 | 无违规 | kanban_block |

### 置信度分级

| 评估次数 | 置信度 | 含义 |
|----------|--------|------|
| 0 | none | 未评估 |
| 1 | low | 单次评估，需更多数据 |
| ≥2 | normal | 多次评估，可信 |

### 错误类型分类（替代笼统"失败"标记）

失败时在 `kanban_comment` 中标注 error_type：

| error_type | 判定条件 | 后续动作 |
|------------|---------|---------|
| wrong_skill | skill 不匹配任务需求 | 路由调整 + skill 描述更新 |
| skill_error | skill 正确但执行出错 | 工具/环境修复 |
| incomplete | skill 未完成任务 | skill 内容补充 |
| refusal | skill 拒绝执行 | 检查任务/skill 匹配度，必要时更换模型 |
| empty | skill 返回空结果 | skill 逻辑修复 |

> 完整五维评估协议见 `skill_view('skill-self-evolution-fusion')`。

---

## 模型升级评估协议（借鉴 Prompt-as-Model-Adapter）

> 来源：微信公众号「Vibe编码」文章《Opus 4.8 删掉了73%的提示词，Opus 5 为何又新增了 82%》。
> Prompt 是模型适配层——模型升级时，适配层需重新评估：删旧教程 + 加新治理。

### 升级时六维评估

模型升级后，重新跑任务集，重点看：

| 评估维度 | 衡量什么 | 信号 | 超阈值动作 |
|----------|---------|------|-----------|
| **范围扩张** | Agent 是否过度扩大任务范围 | scope-discipline 违规次数 > 2 | 加强 scope 规则 |
| **澄清次数** | Agent 是否频繁要求用户澄清 | kanban_block(kind="needs_input") > 3 | 补充 skill 减少歧义 |
| **完成率** | 任务是否真正闭环 | kanban_complete/block < 0.8 | 加强验证门 |
| **过度验证** | Agent 是否过度检查 | 工具调用次数 > 预期 1.5x | 删除冗余规则 |
| **子 Agent 成本** | 委托是否合理 | delegate_task 次数异常 | 调整分解策略 |
| **纠错噪声** | 纠错是否打断用户过多 | kanban_comment "修正/错误" > 2 | 应用 Corrections 传播阈值 |

### Prompt 适配层调整规则

```
新模型能力增强 → 删除已被模型吸收的旧教程（如代码风格、最小改动说明）
    ↓
新的稳定失败模式出现 → 加入少量跨任务治理（如 Delivering Work、Corrections）
    ↓
追求最小充分集合 (minimal sufficient set) — 字符最少只是可能结果
```

**Anthropic Context Engineering 定义**：minimal 并不必然 short，关键是保留高信号内容，并处在合适的抽象高度。

### 规则迁移检查

升级后检查每条 SOUL.md 规则：

1. **能由测试/接口/Hook 更稳定解决？** → 迁出 SOUL.md，交给 Runtime 门禁
2. **仓库特定 + 代码推不出？** → 迁到 AGENTS.md
3. **按需加载 + 专项流程？** → 迁到 Skills
4. **跨会话 + 低频但不丢失？** → 迁到 Memory
5. **跨任务复用 + 影响用户决策 + 无法从局部推断？** → 保留在 SOUL.md

> 完整模型升级评估协议见 `skill_view('prompt-as-model-adapter')`。
