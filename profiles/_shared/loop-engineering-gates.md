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
- 安全任务：工具输出非空 + 发现可复现 + 授权上下文完整
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
