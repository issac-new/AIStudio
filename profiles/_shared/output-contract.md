# 输出契约（Output Contract — 共享参考）

> **无评论不完成（真实事故驱动）**：`kanban_complete` 前必须先发 `kanban_comment`，
> 包含四段——`## 变更`（changed_files 绝对路径）、`## 验证`（真实命令+真实输出摘要+环境版本）、
> `## 实现方式`（含 ACP session_id 若有）、`## 决策与 follow-up`。
> 评论中引用的任务 ID/卡片/文件，引用前必须验证其存在（`kanban_show` / `ls`）——
> 幻觉引用会触发看板守卫并打回完成。看板历史上 51% 的完成任务零交接评论，
> 下游和根协调者只能拿到 result 摘要、被迫翻工作区。

## 标准模板

```python
# 结构化 handoff 先进评论（供 reviewer/tester 直接读）
kanban_comment(body=(
    "## 变更\n- changed_files: [src/x.py, tests/test_x.py]\n"
    "## 验证\n- tests: 8 passed / 0 failed (pytest 7.4, python 3.11)\n"
    "## 实现方式\n- ACP session: ses_xxx（3 轮迭代）\n"
    "## 决策与 follow-up\n- 选 A 方案而非 B，理由：…；follow-up：浮点用例"
), task_id="<本任务id>")

# 再完成
kanban_complete(
    summary="实现了模块A核心功能，8 个单元测试全绿，已请 reviewer 审查。",
    metadata={
        "files_changed": ["src/x.py", "tests/test_x.py"],
        "tests_written": 8, "tests_passed": 8,
        "language": "python", "framework": "pytest",
        "acp_sessions": [session_id],
        "verification": {  # Shadow 模式（2026-08-21 起，覆盖率≥80%后转强制）
            "syntax": "pass|skip|n/a",
            "test": "pass|skip|n/a",
            "lint": "pass|skip|n/a",
            "build": "pass|skip|n/a",
            "evidence_strength": "present|wired|exercised",
            "observability_gates": "ready|partial|n/a"
        },
    },
    created_cards=[],   # 若你派生了子任务，填 kanban_create 返回的 id
)
```

### Intervention 字段（治理动作类任务追加）

当任务本身是**治理干预**（规则补齐/skill 演进/流程修复）时，在 kanban_comment 追加 4 字段（详见 `_shared/intervention-ledger.md`）：

```python
kanban_comment(body=(
    "## Intervention\n"
    "- intervention: 补齐 22 个 SOUL.md 的 verification-checklist 引用\n"
    "- outcome: improving\n"           # pending|improving|unchanged|regressing|outcome-supported
    "- evidenceRef: research/soul-rules-audit-20260821.txt\n"
    "- owner: orchestrator"
), task_id="<本任务id>")
```

### Decision 字段（G3，重大技术/架构决策追加）

当任务产出包含**重大决策**（技术选型/架构决策/优先级判定）时，在 kanban_comment 追加 Decision 结构化模板（对应 ontology.md 的 Decision 对象，同一性标准 = decided_by+topic+decided_at 三元组）：

```python
kanban_comment(body=(
    "## Decision\n"
    "- topic: 任务卡执行引擎选型\n"
    "- choice: 方案 A（kanban + dispatcher）\n"
    "- alternatives: [方案 B（纯 delegate_task）, 方案 C（消息队列）]\n"
    "- rationale: 已有 kanban 基础设施 + 状态机完整；B 缺持久化；C 过重\n"
    "- decided_by: orchestrator\n"
    "- decided_at: 2026-08-21T21:00:00+08:00\n"
    "- based_on: [research/xxx-comparison.md（已 ls 验证存在）]"
), task_id="<本任务id>")
```

**强制规则**：`based_on` 引用的文件必须先 `ls` 验证存在（蓝军门 4）；决策改向用 `supersedes: <旧 Decision 的 topic+decided_at>` 表达，不删除旧决策。

## 统一报告契约（Better Harness 融合 P2-2）

> 来源：QoderAI Better Harness `templates/reporting/report-structure.md:17-24`（5 节骨架），**Hermes 本地化改造版**——源骨架为 Project Overview/Harness Dimensions/Issue Findings/Next Recommendations/Notes And Method，此处按 Hermes 报告受众重排为 Executive Summary/Findings/Recommendations/Methodology/Appendix
> 适用：所有报告类产出（调研报告/审计报告/评审报告/融合方案）

### 报告 5 节骨架

```markdown
# <标题>

## 1. Executive Summary
（≤200 字核心结论，一眼看完）

## 2. Findings
（按 severity 排序：critical → major → minor；每条带 evidence + owner + 边界）

## 3. Recommendations
（每条带 track 标签 bootstrap|optimize + 验收标准 + 优先级 P0/P1/P2）

## 4. Methodology
（数据来源 + 工具调用次数 + 时间窗口 + 复现命令）

## 5. Appendix
（file:line 索引 / SQL 查询 / 原始数据 / 参考文档链接）
```

### 风格层（参照 templates/style/）

按报告受众选择风格（风格 id 不出现在可见文本）：

| 风格 | 适用场景 | 特点 |
|---|---|---|
| `engineering-diagnosis` | 技术审计/故障分析 | 重证据链、file:line、复现步骤 |
| `executive-dashboard` | 管理层汇报 | 重结论、趋势图、ROI |
| `audit-scorecard` | 合规审计 | 重评分、达标/不达标、整改清单 |
| `transformation-playbook` | 融合/迁移方案 | 重路线图、分阶段、风险评估 |

### 报告质量门

- [ ] Executive Summary ≤200 字，能独立成立
- [ ] 每条 Finding 有 evidence（file:line 或命令输出）
- [ ] 每条 Recommendation 有验收标准（怎么算"做完了"）
- [ ] Methodology 可复现（给出具体命令）
- [ ] Appendix 有完整索引（非"详见上文"）

## 技能路由决策（HarnessEval 融合 P0-5）

> 来源：MirroS HarnessEval `pipeline/planner.py:159-171`（selected_skills + skipped_skills schema）+ `protocols.py:62-69`（SKILL_SPECS 反例约束）
> 适用：`kanban_create` 时记录技能路由决策，确保"为什么启用/跳过某 skill"可追溯

### kanban_create 模板新增段

```markdown
## 技能路由决策
- 启用 skill: [已移除]
  - reason: 家长需要完整教案/活动方案
  - parameters: {subject: "chinese", grade: "1"}
  - 反例约束: 不适用于简单知识问答（仅完整教案场景）
- 跳过 skill: mom-feedback-coaching
  - reason: 本次任务不涉及家长反馈话术
- 执行 profile: [已移除]
```

### 四要素

| 要素 | 必填 | 说明 |
|---|---|---|
| `skill` | 是 | 技能名称（与 skills/ 目录下的目录名一致） |
| `reason` | 是 | 启用/跳过的具体理由（case-grounded） |
| `parameters` | 否 | 技能参数（如有） |
| `反例约束` | 否 | 什么情况下**不**应使用该技能（防误路由） |

### 评测无关性保证

技能路由决策**只依赖任务内容，不依赖将被分配的 worker**。orchestrator 在 kanban_create 时完成路由决策，worker 执行时按决策加载 skill。

## review-required 路径

> 注意：需要 reviewer 把关的代码变更，**优先 `kanban_block(reason="review-required: …")`** 而非直接
> `kanban_complete`（平台协议有此条）。除非任务卡明确说"无需审查"，否则走 review-required。

## SOUL 内单行引用

```
输出契约（详见 _shared/output-contract.md）：kanban_complete 前必先 kanban_comment，含四段（变更/验证/实现/决策）。
```