---
name: design-doc-diagram-consistency
description: "Cross-diagram relation alignment: master diagram wins."
version: 1.0.0
metadata:
  hermes:
    tags: [devops, documentation, design-doc, diagrams]
---

# 跨图关系一致性（主图为基准）

用户判词：「图 X-Y 的关系错了 要参考 X-1 的关系」。

## When to Use

- 设计文档同一实体出现在多张 mermaid 图里时（改图前/修图后必查）

## 规则

1. **主图为基准**：结构总图（如图 2-1）对实体关系的定稿画法是全文基准；局部链路图（如图 2-4）必须照它改，不许各自发挥。改前先提取两图 mermaid 源码并排比对，定位差异点再动手。
2. **实体身份先定稿再画图**：SwarmStudio=驾驶舱=接入层与调度层的核心用户（人的行权界面），不在消息链路中间；Gateway 属接入层，不是 SwarmStudio 的组成部分。画链路图时把它放在主链上方（人→驾驶舱→接入→调度→执行），回流虚线交付与证据回到驾驶舱。
3. **正文联动**：改图后同步正文引用（编号「五级→四级」类、题注、§引用），全文 grep 旧称清零；mermaid 渲染验证 + vision 复检（压字/截断/主链方向）。

## 关联

- 结构层总规范 → `design-doc-structure-standards`（default profile，只读）
