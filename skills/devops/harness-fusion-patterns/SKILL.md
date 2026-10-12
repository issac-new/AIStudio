---
name: harness-fusion-patterns
description: "调研吸收外部Harness(BetterHarness等)优化Hermes时的机制速查与落地模式。"
version: 1.2.0
metadata:
  hermes:
    tags: [devops, research, agent-behavior, fusion, harness, governance]
    related_skills: [open-source-skill-fusion, codex-harness-patterns]
---

# Harness 融合模式知识库（Better Harness + HarnessEval + 统一治理框架）

> 来源：2026-08-21 两轮 Harness 融合实战（Better Harness v0.6.4 + HarnessEval-W arXiv:2608.16859），
> 以及 5 套 Harness（+Codex/DSH RC8/麦肯锡）合并为统一治理框架的全落地。
> 详细机制→源码映射见 `references/better-harness-harnesseval-patterns.md`。
> 增补（2026-09-11）：Harness Playbook（Can Bölük/omp 作者，经微信文章转引）五推论+五问评估地图，见 `references/harness-playbook-patterns.md`。
> 增补（2026-09-11）：openJiuwen 双维度 RSI 框架（华为 2012 实验室，源码 clone 验证 + arXiv:2607.15524 交叉），见下「RSI 速查」与存档 `research/rsi-fusion-20260911/REPORT.md`。

## When to Use

- 用户给微信文章/GitHub 链接要求"调研并吸收 XXX 的理念/设计/功能，优化 hermes agent teams"
- 需要评审或扩展 `_shared/diamond-quality-gates.md`、`verification-checklist.md`、`intervention-ledger.md` 等统一治理规则
- 需要做多套外部框架的冲突映射与统一合并
- 落地状态盘点/审计（audit-soul-rules.sh 生态）
- 涉及"递归自我改进/RSI/自改进闭环/失败归因分类"类融合与评审

## 核心速查

| 框架 | 核心模型 | 一句话铁律 | 详细 |
|---|---|---|---|
| Better Harness | 五维 Work Loop × 15 checks + 证据 7 态 + 评分上限 59/74/84/94/100 | "A configured capability is not observed use" | references §1 |
| HarnessEval | 四阶段 Plan/Route/Decompose/Verify + evidence tree digest 链 | 分数必须由可审计 evidence tree 支撑；fail-closed | references §2 |
| 统一治理框架 | 三环（生产/评估/治理）+ 证据谱系 S0-S4 + 质量门 G1-G7+Guardian | 分层适配：[已移除] 轻量，hack 最高+Guardian | references §3 |
| Harness Playbook (Can Bölük/omp²) | 系统软件五推论（单一权威/可信控制面/有界工作/显式兼容/视图投影） | "An agent harness is systems software—not a while loop" | references §4 |
| openJiuwen RSI | 双维度（Harness 优化+Artifacts 优化）× 六阶段闭环（基线→定位→提案→采纳→经验→归档）+ 四维优化对象（Prompt/Skill/Tool/Rail，源码实为 12 类） | 每份证据绑定版本；候选改动后必须重测；优化收益须泛化到未参与迭代的任务才算数 | 存档 `research/rsi-fusion-20260911/REPORT.md` |

## RSI 融合落点（2026-09-11，吸收 2 + 登记 2 + drop 2）

- **R1 失败签名分类学 → 已落地**：8 类 `sig-*` 轨迹签名词表入 `_shared/03-evolution-memory/output-contract.md` §3-6（四标签粗分类之下的细分归因，evo 聚类/月度聚合消费）。
- **R2 候选重测闸 → 已落地**：自改进提案落地即结构变更，入 `structure-evolution-rollback.md` 六步闭环第 2 步——"提案写得很对"不构成免测理由。
- **R3 失败资产化接线 → 登记**（gap-20260911-002）：五段式案例库与 evo 失败标签之间缺"标签→案例"转化触发；与 HoH H4 reopened 字段合并待裁决。
- **R4 Artifacts 优化回路 → downgrade 留档**：单机第二优化回路收益不抵编排成本（同 HoH H9 先例），worker goal_mode 已承载多轮打磨。
- drop：算力亲和（无 NPU 栈）、实验模式可视性（kanban 轨迹已等效）。
- 效果数字纪律实例：SWE-bench 61%→87% 等厂商数字**不可本机复现，全部按转引标注**——方向性结论（泛化到未参与任务）靠 RHI 论文独立双源交叉成立。

## 融合工作流（微信文章 → 落地，6 步）

1. **抓取**：curl + regex 提取 js_content div（`wechat-article-research` skill 零依赖路径）
2. **深读**：delegate_task 子代理 clone GitHub 仓库 --depth 1，按 SKILL.md → models → scripts → references 优先级深读，产出带 file:line 的 deep-dive 报告
3. **现状扫描**：机械 grep + sqlite 实测 Hermes 现状（严禁 LLM 主观判断）
4. **融合方案**：按"吸收/保留/不吸收"三分，零代码等效优先；**上游数字必须机械复现 ≥3 个关键数字再引用**
5. **蓝军评审**：delegate_task 5-lens 对抗评审（事实核查/过度设计/遗漏/可行性/偏好对齐），critical+major 逐项修正后出 v2
6. **批量落地**：Tier 1/2/3 分层补齐 + 锚点优先级 + dry-run JSON + 从后往前插入 + 审计复验

## 关键 Pitfalls（两轮蓝军 critical 教训）

### 0. hermes 源码 patch 纪律：update=reset --hard，本地 commit 必被洗
kanban_write_sanctioned UDF 四次复发实证：修复 commit 73f7160a4e（9-10）与 65743b6ea4（9-11）均被次日 update 的 `reset --hard origin/main` 洗掉（reflog 实锤）。防复发唯一有效路径：`patches/` 登记 patch 文件 + update 后重放（apply→py_compile→gateway restart→CLI 写冒烟→update-safe 校验4）。详录 `research/rsi-fusion-20260911/udf-patch-discipline.md`。

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

### 6. 机械门下的 body 纪律=死文本（2026-09-17 GE 融合 critical 教训）

凡纪律写进任务卡 body 要求 worker 执行、而 worker 根本不会被 dispatch 的场景（如 parents 门控卡：任一上游非终态，child 永驻 todo），body 纪律是死文本——无人执行，却给方案装出「已容错」的假象。修法不是改文案：把容忍语义上移到**构图层**（parents 只挂硬依赖，软依赖写 body 不建边）或**运维层**（`hermes kanban unlink` 释放死边，内部自动 recompute_ready）。判据：每条新纪律问一句「它的执行者在真实机制下真的会被触发吗」，机制锚点必须出自源码而非文档自述。

### 7. 引用文件必须存在性验证，幽灵引用要根治不要绕过（2026-09-17）

方案引用文件前先 `find` 验证存在——skill/文档自述「已落地」的文件可能被 update 事故洗掉（实例：task-contract-guard.md、shared-rules-reference.md 双双仅存于引用）。根治=重建真实载体（如 shared-rules-reference 索引从 `_shared/` 全目录回填）或改指现存等价载体（如 12 项契约原文在 longhorizon-harness-research 附录），不是删引用了事。

## Related Skills

- **open-source-skill-fusion** — 融合主流程方法论（位于 default profile，orchestrator 侧只读）
- **codex-harness-patterns** — Codex Guardian/execpolicy 模式知识库（default profile）
- **wechat-article-research** — 微信文章抓取（curl+regex 零依赖）
- **adversarial-review-lens** — 蓝军 5-lens 评审纪律
