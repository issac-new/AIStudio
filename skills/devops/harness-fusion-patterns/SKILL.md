---
name: harness-fusion-patterns
description: "调研吸收外部Harness(BetterHarness等)优化Hermes时的机制速查与落地模式。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, research, agent-behavior, fusion, harness, governance]
    related_skills: [open-source-skill-fusion, codex-harness-patterns]
---

# Harness 融合模式知识库（Better Harness + HarnessEval + 统一治理框架）

> 来源：2026-08-21 两轮 Harness 融合实战（Better Harness v0.6.4 + HarnessEval-W arXiv:2608.16859），
> 以及 5 套 Harness（+Codex/DSH RC8/麦肯锡）合并为统一治理框架的全落地。
> 详细机制→源码映射见 `references/better-harness-harnesseval-patterns.md`。

## When to Use

- 用户给微信文章/GitHub 链接要求"调研并吸收 XXX 的理念/设计/功能，优化 hermes agent teams"
- 需要评审或扩展 `_shared/diamond-quality-gates.md`、`verification-checklist.md`、`intervention-ledger.md` 等统一治理规则
- 需要做多套外部框架的冲突映射与统一合并
- 落地状态盘点/审计（audit-soul-rules.sh 生态）

## 核心速查

| 框架 | 核心模型 | 一句话铁律 | 详细 |
|---|---|---|---|
| Better Harness | 五维 Work Loop × 15 checks + 证据 7 态 + 评分上限 59/74/84/94/100 | "A configured capability is not observed use" | references §1 |
| HarnessEval | 四阶段 Plan/Route/Decompose/Verify + evidence tree digest 链 | 分数必须由可审计 evidence tree 支撑；fail-closed | references §2 |
| 统一治理框架 | 三环（生产/评估/治理）+ 证据谱系 S0-S4 + 质量门 G1-G7+Guardian | 分层适配：[已移除] 轻量，hack 最高+Guardian | references §3 |

## 融合工作流（微信文章 → 落地，6 步）

1. **抓取**：curl + regex 提取 js_content div（`wechat-article-research` skill 零依赖路径）
2. **深读**：delegate_task 子代理 clone GitHub 仓库 --depth 1，按 SKILL.md → models → scripts → references 优先级深读，产出带 file:line 的 deep-dive 报告
3. **现状扫描**：机械 grep + sqlite 实测 Hermes 现状（严禁 LLM 主观判断）
4. **融合方案**：按"吸收/保留/不吸收"三分，零代码等效优先；**上游数字必须机械复现 ≥3 个关键数字再引用**
5. **蓝军评审**：delegate_task 5-lens 对抗评审（事实核查/过度设计/遗漏/可行性/偏好对齐），critical+major 逐项修正后出 v2
6. **批量落地**：Tier 1/2/3 分层补齐 + 锚点优先级 + dry-run JSON + 从后往前插入 + 审计复验

## 关键 Pitfalls（两轮蓝军 critical 教训）

### 1. 本地化改造必须显式声明"非源 schema"
方案 v1 自编 Intervention Ledger 的 9 类资产/6 类 cause 却标注"参照 intervention-ledger.mjs:3-32"——实测资产 4/9 一致、cause 0/6 一致。写"参照"就必须逐字段一致，否则写"本地化改造，非源 schema"。

### 2. 字段覆盖率 ≠ 关键词出现率
scan 声称 evidence_strength 覆盖 11/27(40%)，实测严格字段名 grep 仅 1/27(3.7%)——11 个只是含"evidence"单词（多为其他文件引用的附带短语）。字段落地率必须用精确字段名匹配。

### 3. 落地盘点必须容忍 grep 模式容错
终盘点 4 项误报"未落地"——grep 模式与文档写法不匹配（全角/半角、表格内空格分隔数字）。grep 未命中 ≠ 未落地，先宽松模式人工复核。

### 4. 新规则落地后必须登记索引
批量落地新 `_shared/` 规则后同步登记 `shared-rules-reference.md`，否则规则存在但索引不含。

### 5. 多方案融合先出 conflict-map 再落地
多份方案改同一文件（如 output-contract.md 被 2 个方案同时扩展）时，先列冲突点×合并策略×修改顺序（conflict-map.md），再串行落地。

## Related Skills

- **open-source-skill-fusion** — 融合主流程方法论（位于 default profile，orchestrator 侧只读）
- **codex-harness-patterns** — Codex Guardian/execpolicy 模式知识库（default profile）
- **wechat-article-research** — 微信文章抓取（curl+regex 零依赖）
- **adversarial-review-lens** — 蓝军 5-lens 评审纪律
