# Committee 对抗评审协议（合并报告/重型交付物强制）

> 来源：SenteLabsAI/OpenExecutive `orchestrator/committee.py:29-95` + `committee_reviewers.py:1-100`（2026-09-03 源码级调研，`research/openexec-source-analysis-v2.md`）
> 层级：L4 评审门的**机制层补强**——Diamond 7 门是 Checker 自审清单，本协议是「生成后由 3 个独立 reviewer 并行批判→修订」的强制环节
> 适用：orchestrator 合并报告、重型任务交付物、跨 worker 综合结论

---

## 一、核心流程（单轮，不迭代）

```
draft（合并报告/交付物草稿）
  ↓
3 reviewers 并行批判（delegate_task batch）
  ├── 1 个质量评委（quality reviewer）：结构/证据/可读性
  └── 2 个领域评委（domain reviewer）：从本轮实际参与的任务域中选取
        ↓ （参与域不足 2 个时 fallback：worker-researcher + worker-reviewer）
  ↓
1 次修订（orchestrator 汇总 critique → 修订 draft → 终稿交付）
```

## 二、Reviewer 选拔规则（对应 committee.py:38-66 select_reviewers）

1. **质量评委**：固定 1 个，职责=结构完整性/证据强度/逻辑漏洞/三毛病自检（document-writing-craft）
2. **领域评委**：2 个，从本任务实际派生过的 worker 域中选（去重、排除纯路由角色）
3. **fallback**：参与域不足 2 个时补 `worker-researcher` + `worker-reviewer`（覆盖面最广）
4. **独立性硬约束**：reviewer **不得**是产出该 draft 的同一执行主体（四权分离机制化）

## 三、Critique 结构（对应 committee_reviewers.py:Critique）

每条批判必须四字段：

```
reviewer_name: <profile 名>
severity: low | medium | high
critique: <具体问题，必须带 file:line / 数据锚点>
suggested_edits: <可执行修复，不是"建议优化">
```

- reviewer 失败/超时 → 降级为 low-severity 占位（**fail-open，绝不阻塞修订**——committee.py:74 "failures degrade to low-severity placeholders"）
- 领域评委可见的 worker 产出截断至 1500 字符（`_SPECIALIST_EXCERPT_CHARS`——committee_reviewers.py:31，控制成本）

## 四、注入防御（对应 committee_reviewers.py:neutralize_committee_tags）

送入 reviewer 的 draft/产出必须过 `neutralize`：被评审内容中的 `</draft>`、`</critique>` 等闭合标签插入零宽空格，防被评审内容里的指令逃逸评审边界。**评审提示词与被评审内容必须标签隔离。**

## 五、触发条件（orchestrator 何时必须跑）

| 触发 | 判定 |
|------|------|
| 重型任务合并报告（子任务 ≥2 done 后的 merged report） | **必跑** |
| 跨 board 综合交付物 | **必跑** |
| 单一 worker 轻量产出 | 不跑（走 Diamond 7 门即可） |
| 涉及部署/对外发布/不可逆动作的交付物 | **必跑** + HumanGate |

## 六、执行模板（delegate_task batch）

```python
delegate_task(tasks=[
  {"goal": "质量评委：批判以下 draft 的结构/证据/逻辑漏洞...", "context": "<draft 全文 + neutralize>"},
  {"goal": "领域评委(<域1>)：批判以下 draft 的 <域1> 专业准确性...", "context": "<draft + 该域产出 1500 字截断>"},
  {"goal": "领域评委(<域2>)：同上", "context": "..."}
])
# 汇总 3 条 Critique → orchestrator 修订 → severity=high 未修订不得交付
```

## 七、与现有机制的关系

- **Diamond 7 门**（review-gates.md §一）：finding 入门资格——**前置**
- **本协议**：终稿交付前对抗批判——**后置**
- **adversarial-review-lens skill**：多 lens 方法论——本协议是其**强制触发点**的落地
- 硬规则：severity=high 的 critique 未在修订稿中处置（修复或显式驳回+理由）→ 不得交付
