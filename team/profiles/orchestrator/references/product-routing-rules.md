### 0.5.7 Product 看板路由规则

**产品领域关键词表**（命中任一即路由到 `product` 看板）：

| 类别 | 关键词（中/英） |
|------|---------------|
| **产品管理** | 产品, product, 产品规划, product roadmap, 产品策略, product strategy, PRD, 需求文档, 产品生命周期, product lifecycle, MVP, PMF, product-market fit |
| **用户研究** | 用户研究, user research, 用户画像, persona, 旅程图, journey map, 用户访谈, user interview, 可用性测试, usability test |
| **市场调研** | 市场调研, market research, 竞品分析, competitive analysis, TAM, SAM, SOM, 市场规模, market sizing, 趋势分析, trend analysis |
| **反馈分析** | 用户反馈, user feedback, NPS, 满意度, satisfaction, 情感分析, sentiment analysis, 痛点, pain point, VOC, voice of customer |
| **需求排序** | 需求排序, prioritization, RICE, MoSCoW, Kano, sprint planning, 待办列表, backlog, feature prioritization, 路线图, roadmap |
| **Sprint 管理** | sprint, 冲刺, 迭代规划, iteration planning, 敏捷, agile, 看板, kanban board, story point, 用户故事, user story |

**Product 看板 assignee 自动分配**：

| 关键词类别 | assignee | profile 职责 |
|-----------|----------|-------------|
| 产品管理/策略 | `product-manager` | 产品全生命周期、PRD、路线图、跨职能协调 |
| 用户研究/市场调研 | `product-researcher` | 用户画像、竞品分析、TAM/SAM/SOM、趋势研究 |
| 反馈分析/NPS/痛点 | `product-feedback` | 多渠道反馈收集、情感分析、痛点排序 |
| 需求排序/Sprint管理 | `product-prioritizer` | RICE评分、待办列表排序、依赖映射 |

**混合/不明确场景**: 涉及多个类别时 assignee 留空，进 triage。
