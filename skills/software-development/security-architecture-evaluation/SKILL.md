---
name: security-architecture-evaluation
description: >-
  Evaluate and fuse security architecture plans (multi-zone data isolation, LLM gateway,
  data loss prevention, supply chain security). Use when the user shares a security plan
  document and asks for assessment, gap analysis, or fusion with an existing plan.
  Covers the keep/new/downgrade/drop decision matrix, over-engineering risk detection,
  and iterative feedback loop patterns.
metadata:
  hermes:
    tags: [security, architecture, evaluation, fusion, plan-review, three-zone, data-isolation]
    related_skills: [a4-pdf-diagram-layout, report-data-verification]
---

# Security Architecture Plan Evaluation & Fusion

Evaluate security architecture documents (multi-zone data isolation,
LLM gateway patterns, supply chain security) and produce structured
assessments or fused successor plans.

## When to Use

- User shares a security plan/architecture document and asks for evaluation
- User asks to compare/fuse two security plans (e.g., internal vs. external)
- User asks for gap analysis of a security mechanism
- User wants a V(N+1) successor plan built from V(N) + external input

## Input Signals

- HTML/PDF/markdown security architecture document
- Reference to an existing plan version ("v4方案", "已有方案")
- Keywords: 三区, 零代码出域, 脱敏, 数据隔离, LLM网关, 供应链安全,
  网闸, 摆渡, 交换区, 内网, 外网, 渗透, 防泄漏

## Evaluation Framework

### Step 1: Read both plans fully (no shortcuts)

Read every section of both the existing plan and the new/external plan.
Do NOT rely on summaries — the security posture is in the details
(threshold values, escalation paths, specific tool choices).

### Step 2: Build the keep/new/downgrade/drop matrix

For each mechanism in both plans, classify:

| Decision | Meaning | When |
|----------|---------|------|
| **keep** | Preserve as-is from existing plan | Mechanism is proven, battle-tested, or safety-critical |
| **new** | Adopt from external plan | Fills a gap the existing plan doesn't cover |
| **downgrade** | Reduce from core to optional | Tool chain immature, cost/benefit unclear, over-engineered |
| **drop** | Remove entirely | Redundant with another mechanism, or contradicts core principle |

### Step 3: Assess against five dimensions

1. **Over-engineering risk** — Is this a full-year OKR disguised as a plan?
   Check: total mechanism count vs. team's actual security headcount.
2. **Technical reliability** — Does the core mechanism work today?
   Check: tool chain maturity, AST/parse accuracy, restore reliability.
3. **Bottleneck acknowledgment** — Does the plan address its weakest link?
   Check: for LLM-based plans, is the weakest model's throughput limit addressed?
4. **State vs. stateless tradeoff** — Does the exchange zone hold state?
   Check: tmpfs/read-only/immutable = safer; Gitea+审批流 = practical but attack surface.
5. **Vendor compliance gap** — Does the plan verify LLM provider terms?
   Check: Kimi vs GLM vs 百炼 — API vs C-end, training clauses, DPA requirements.

### Step 4: Weight by "方案成败权重"

Every security plan has a small number of make-or-break factors.
Identify them (typically 2-3) and weight the evaluation accordingly.

Example: for a three-zone LLM-assisted development plan:
- 60% gateway脱敏质量 — if the gateway doesn't sanitize properly, everything else is moot
- 30% 版本管理纪律 — if engineers bypass version control, isolation breaks down
- 10% 审计检测规则 — important but not the primary defense

## Fusion Patterns

### Pattern A: Rigid base + incremental layer

When the existing plan is more conservative (rigid) and the external plan
adds iterative capability:

```
Layer 1 (base): Existing plan's core principles (零代码出域, 双向Guard, etc.)
Layer 2 (increment): External plan's iteration mechanism (净/脏状态机, 契约锚定, etc.)
Layer 3 (optional): External plan's supply chain components (按需启用)
```

### Pattern B: Decision matrix for conflicting choices

When two plans conflict on the same mechanism:

| Conflict | Existing | External | Fusion Rule |
|----------|----------|----------|-------------|
| 交换区状态 | 无状态化 (tmpfs) | 有状态 (Gitea) | Keep 无状态 (safer) |
| AST 脱敏 | 无 | AST+Restore | Downgrade to optional (工具链不成熟) |
| 出域策略 | 零代码出域 | 脱敏代码出域 | Keep 零代码 (更刚性) |

### Pattern C: Answer the unanswered question

The most valuable contribution of an external plan is often answering
a question the existing plan didn't address. In V5's case:
- V4 didn't answer: "组件进内网装配后怎么继续用外网模型迭代?"
- External plan answered: 净/脏状态机 + 净化重写 + 契约锚定

## Output Format

### For pure evaluation (no fusion)

1. 总体判断 (score + one-sentence verdict)
2. 与已有方案的 core differences table
3. 显著优势 (numbered, each with "why it matters")
4. 关键风险与不足 (numbered, each with "how to fix")
5. 融合建议 (if applicable)
6. 总结 table with scores per dimension

### For fused successor plan (V(N+1))

1. 融合决策清单 (keep/new/downgrade/drop matrix)
2. 三层防御架构 (rigid base + iteration layer + optional supply chain)
3. Full HTML with:
   - CSS calibrated for A4 (font-size ≤ 12px, max-height ≤ 200px for images)
   - Chart captions ABOVE images (prevents caption-image overlap)
   - Square images replaced with HTML tables
   - Spacer divs after every chart container
   - Version history table at the end

## Common Pitfalls

| Pitfall | Why it happens | How to avoid |
|---------|---------------|--------------|
| **Over-engineering** | Plan author tries to be comprehensive | Count total mechanisms; if > 15 for a single team, flag it |
| **AST脱敏高估** | AST seems like a clean technical solution | Test with real code; control flow itself is a fingerprint |
| **忽略瓶颈模型** | Focus on strong external model, ignore weak internal | Always identify the weakest link and design around it |
| **交换区状态化** | Convenience (Gitea, 审批流) wins over security | Default to stateless; add state only with explicit justification |
| **跳过厂商合规调研** | Assumes all APIs are equivalent | Check Kimi/GLM/百炼 terms before finalizing gateway config |

## Verified Example: V4 → V5 Fusion (2026-08-04)

- **V4**: 零代码出域, 双向Guard, 交换区无状态化, 源码-配置永久分离
- **External**: 三区协同 (净/脏状态机, 契约锚定, 净化重写, 厂商合规, LLM网关)
- **V5 decision**: V4 as Layer 1 rigid base (keep), external's iteration mechanisms as Layer 2 (new), supply chain components as Layer 3 (downgrade to optional)
- **AST脱敏**: downgraded (工具链不成熟, 控制流是指纹)
- **交换区**: kept stateless (safer than external's stateful design)
- **厂商合规**: adopted directly (Kimi最干净, GLM需DPA, 百炼专线聚合)
- **GLM-5.1策略**: added Chain-of-Thought拆分 for 40tok/s bottleneck
- **Output**: 20页A4 PDF, 19章, 15图, 0重叠/0窄图/0空白
