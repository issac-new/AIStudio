---
name: pua-harness-governance
description: "四权分离防作弊治理。行动权/自评权/评分权/环境修改权分离，防止 agent 把看起来完成伪装成真实完成。增强 kanban_complete 验证逻辑。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, agent-behavior, governance, anti-cheating, kanban]
    related_skills: [pua-pressure-engine, pua-methodology-router, loop-engineering-gates]
---

# PUA Harness 防作弊治理

> 来源：tanweai/pua `harness-governance.md`，适配 Hermes Kanban 生命周期。
> 核心目标：让 agent 没有机会把"看起来完成"伪装成"真实完成"。

## 一句话原则

把四类权力分开：

| 权力 | Hermes 对应 | 禁止混同 |
|------|-----------|---------|
| 行动权 | kanban worker（执行任务） | 执行者不能同时改验证标准 |
| 自评权 | delegate_task 子代理（独立审查） | 不能把"我认为完成"写成最终完成 |
| 评分建议权 | kanban_complete 验证门 | 评分器不在 worker 可写区 |
| 环境修改权 | orchestrator Human Gate 规则 | 改测试/CI/权限/memory 要审批 |

## 四权分离拓扑

```
Task Contract (intent / acceptance / forbidden / verify_commands)
   ↓
[环境修改权审查] orchestrator 判定：allow / ask_human / deny
   ↓
[行动权] kanban worker 执行 → agent_proposed_status: candidate_pass
   ↓
[自评权] delegate_task 独立子代理审查 → review_pass / review_fail / needs_verifier
   ↓
[评分建议权] kanban_complete 验证门 → verifier_recommendation: pass / fail
   ↓
[最终裁决] orchestrator / human gate → final verifier_status
```

## Task Contract 最小格式

在 `kanban_create` 的 body 中，复杂任务应包含：

```json
{
  "intent": "用户要什么",
  "acceptance": ["验收条件1", "验收条件2"],
  "forbidden": ["不能做的事1", "不能做的事2"],
  "verify_commands": ["npm test", "curl -sf http://..."],
  "agent_proposed_status": "pending",
  "verifier_status": "pending"
}
```

**强制规则**：Worker 可以更新 `agent_proposed_status`，但最终 `verifier_status` 只能由验证门/human 写入。

## 防作弊红线

以下行为被严格禁止：

| 作弊面 | 信号 | 对策 |
|--------|------|------|
| Grader gaming | 修改 tests/evals 让失败消失 | 先声明这是评分资产，不能直接改成"通过" |
| Solution contamination | 读取 hidden solution/benchmark answer | 只能读公开需求和失败报告 |
| Self-report cheating | 没跑验证就写 done/pass | agent 只能提出候选状态 |
| Intent drift | 用户要修 bug，却只隐藏症状 | 回到 task contract 的 intent |
| Persistent hallucination | 把未验证结论写入 memory | append-only，标注 verified/unverified |
| Capability abuse | 越权读敏感数据或部署生产 | 风险分层审批 |

## 风险分层审批

| 行为 | 默认动作 |
|------|---------|
| 读项目普通文件 | 允许 |
| 修改普通代码 | 允许，交付前验证 |
| 删除文件、大规模重命名 | advisory + 人工确认 |
| 改 tests/evals/scoring/CI | advisory-only，必须说明不是 grader gaming |
| 读 hidden tests/solution | deny，除非用户显式授权 |
| 写长期 memory/status | advisory-only，区分 proposed 与 verified |
| 生产部署/发邮件/访问敏感数据 | **human gate**（kanban_block） |

## 交付前治理循环

1. 将用户目标拆成 task contract：intent / acceptance / forbidden / verify_commands
2. 执行修改时保持最小 diff，避免无关文件变化
3. 自测只能产生候选状态，不产生最终完成权
4. 外部验证（kanban_complete 验证门 / delegate_task 独立审查 / human gate）独立验证
5. 如果验证失败，只根据 fail report 修复，不改评分器逃避失败
6. 交付报告必须包含：变更、验证命令、失败路径、剩余风险

## 候选状态 vs 最终状态

**Worker 报告**（候选）：
```
agent_proposed_status: candidate_pass
modified_files: [path1, path2]
verification_run: [{command: "npm test", result: "pass"}]
forbidden_assets_touched: no
```

**验证门裁决**（最终）：
```
verifier_status: pass / fail
acceptance_result: [{criterion: "测试全绿", result: "pass"}]
forbidden_result: [{constraint: "无硬编码 secret", result: "pass"}]
```

Worker 的 `agent_proposed_status` 是候选，验证门的 `verifier_status` 才是最终。

## 与 Hermes Kanban 的集成

### 增强 kanban_complete 验证

`kanban_complete` 前的验证门检查清单（在 `loop-engineering-gates.md` 基础上增加）：

1. **候选状态声明**：worker 是否声明 `agent_proposed_status`？（而非直接声称"已完成"）
2. **验证证据**：verify_commands 是否运行并贴出输出？
3. **禁止资产检查**：是否触碰 forbidden 列表中的文件？
4. **intent 对齐**：交付是否满足 task contract 的 intent（不只是 proxy）？
5. **失败路径披露**：是否报告了失败路径和剩余风险？

### delegate_task 独立审查

复杂任务（工具调用 ≥6 次或涉及安全/部署）完成时，用 `delegate_task` 派出独立子代理做蓝军审查：

- 审查 diff 是否满足 intent（不只是 acceptance proxy）
- 检查是否有 intent drift（修了症状没修病根）
- 验证命令是否 fresh、relevant、sufficient
- 检查是否触碰了 governance assets（tests/CI/memory/status）

### kanban_comment 教训记录

验证失败时，用 `kanban_comment` 记录：
- 哪条验收条件失败
- 失败原因（intent drift / 未验证 / 触碰 forbidden）
- 下次如何避免

## 七层工具执行管线（借鉴 DeepSeek Harness）

> 来源：deepseek-ai/deepseek-harness `docs/tool-execution-pipeline.md`（2026-08-13）。
> dsh 的工具执行有七个有序阶段，本节补入 Hermes 缺失的 post-execute 和 result 审计层。

### 七层管线（从模型输出到最终结果）

```
① tool/call         — 日志记录（模型输出了工具调用）
② pre-execute       — waterfall: hooks/permission/sandbox（pua-pressure-engine 对应此层）
③ monotonic guards  — deny 或 abstain（Human Gate 对应此层）
④ approval          — ctx.approval 一次性审批（kanban_block kind=needs_input 对应此层）
⑤ execute           — waterfall: timeout/retry/metrics（terminal Docker sandbox 对应此层）
⑥ post-execute      — waterfall: accept/block/replace/add context（← Hermes 缺失此层）
⑦ result            — 不可变最终结果通知 + 审计（← Hermes 缺失此层）
```

### post-execute 层（结果变换，新增）

工具返回结果后、kanban_complete 前，进行**标准化变换**：

| 变换类型 | 含义 | Hermes 对应 |
|---------|------|-----------|
| **accept** | 接受结果，原样传递 | 默认行为 |
| **block** | 拒绝结果，标记 isError | 验证门失败 |
| **replace** | 用标准化结果替换原始输出 | ontology 字段归一化 |
| **add context** | 附加额外上下文到结果 | metadata 补充 |

**实施检查点**（worker 在 kanban_complete 前的 prompt 级参考——非运行时强制）：

> ⚠️ 以下为伪代码示意，`normalize_to_ontology` / `redact_secrets` 不是 Hermes 内置函数。
> 实际操作时 worker 应手动检查 metadata 字段名与 ontology.md 一致，手动去除敏感信息。

```python
# post-execute 标准化检查（伪代码，需手动执行对应步骤）
result_raw = tool_output  # 工具原始返回

# 1. ontology 字段归一化（replace）—— 手动检查，非函数调用
#    核对 metadata 字段名与 _shared/ontology.md 定义一致
#    不在 ontology 中定义的临时字段 → 删除或映射

# 2. 验证证据嵌入（add context）
metadata["verification_evidence"] = {
    "commands_run": ["npm test", "lint"],
    "results": ["pass", "pass"],
}

# 3. 敏感信息脱敏（replace）—— 手动检查，非函数调用
#    确认 metadata 中无 tokens/keys/passwords

# 4. 最终结果（result 层）
#    kanban_complete 写入后 metadata 不可变
```

### result 层（审计快照，新增）

kanban_complete 后，结果在 Hermes kanban DB 中持久化：

- `verifier_status` 和 `metadata` 写入后不易修改（但 Hermes kanban DB 无 immutable 字段保护，这是 prompt 级声明而非运行时强制）
- 任何对已完成任务的修正应通过新任务（而非修改旧 metadata）
- delegate_task 独立审查只能读取已写入的结果，不能修改

> ⚠️ **防作弊能力限制**：dsh 的 result 层有运行时不可变性保证；Hermes kanban 无此保证。本段的"防篡改"是 prompt 级建议，真正的防作弊靠 delegate_task 独立审查 + Human Gate。

### 三层选择规则

| 需求 | 用哪层 | 示例 |
|------|--------|------|
| 权限/安全策略 | ② pre-execute | 拦截危险命令 |
| 不可绕过的最终拒绝 | ③ guards | 禁止改 tests |
| 超时/重试/指标 | ⑤ execute | terminal timeout |
| 结果格式标准化 | ⑥ post-execute | ontology 归一化 |
| 最终审计/防篡改 | ⑦ result | 冻结 metadata |

---

## 可接受的"100% 信心"定义

"事实上的 100%"不是宇宙级绝对正确，而是当前可获得证据下：
- 所有公开验收已运行且通过
- 所有可访问的高风险漏洞已修复或明确披露
- 没有修改评分器/隐藏测试/verifier/CI 来制造通过
- 最终完成权由验证门或用户确认，不由执行 agent 自封
