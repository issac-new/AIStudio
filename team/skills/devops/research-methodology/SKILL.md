---
name: research-methodology
description: Use when 调研开题/检索/证据/三角验证/报告/伦理检查时。55 条检查清单单一事实源：开题 T1-T5、检索 S1-S10、证据 E1-E16、验证 V1-V4、报告 R1-R12、伦理 L1-L8，附判例对照。
version: 1.0.0
metadata:
  hermes:
    tags: [devops, research, methodology, checklist]
    related_skills: [deep-research-workflow, grounded-citations]
---

# 调研方法论（research-methodology）

> 底座规则。55 条清单本体见 `references/checklists.md`（2026-10-17 从 research/ 归档层恢复为 skill——历史报告称「新建 skill」但实际未落盘，本次补齐）。
> 下游消费方 `deep-research-workflow` 引用本 skill 为方法论来源；本 skill 是被引方，不反向依赖工作流。

## 一、六段编号体系（用时查表，不用通读）

| 段 | 编号 | 管什么 | 何时过 |
|---|---|---|---|
| 开题 | T1-T5 | 问题边界/可答性/口径冻结 | 立项时 |
| 检索 | S1-S10 | 源选择/检索式/时效/多源交叉 | 检索时 |
| 证据 | E1-E16 | 引文锚点/时效标注/证据分级 | 引用时 |
| 三角验证 | V1-V4 | 回源比对/多源一致/矛盾裁决 | 结论前 |
| 报告 | R1-R12 | 结论先行/结构/数字口径 | 成文时 |
| 伦理 | L1-L8 | 抓取合规/涉人数据/争议议题 | 全程 |

## 二、三条最常用纪律（从清单提炼）

1. **E 段证据分级**：每个关键结论标证据级（实测/官方源/转述/未验证），不许无源结论。
2. **V 段三角验证**：单源结论必须第二源交叉；两源矛盾时禁择优站队，双源并列 + 明示分歧。
3. **L 段伦理前置**：抓取前先核 robots/服务条款；涉人数据先过隐私红线（mandatory-privacy.md）。

## 三、与其他 skill 的分界

- `deep-research-workflow`：**工作流**（多源深调的流程编排）——引用本 skill 为规则底座。
- `grounded-citations`：**引文工具侧**（citation 生成与校验）。
- 本 skill：**方法论规则本体**——do work 前的检查清单。
