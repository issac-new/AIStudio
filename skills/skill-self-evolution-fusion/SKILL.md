---
name: skill-self-evolution-fusion
description: "Skill自演进融合——JiuwenSwarm Symphony引擎消化吸收。动态overlay+experience bank+5D评估+beam规划+runtime权重。让skill越用越强。"
version: 1.0.0
metadata:
  hermes:
    tags: [skill-evolution, self-improvement, orchestration, runtime-learning, fusion]
    related_skills: [open-source-skill-fusion, harness-entropy-management, agent-harness-best-practices, loop-engineering-gates]
---

# Skill 自演进融合 (Skill Self-Evolution Fusion)

> 来源：openJiuwen-ai/jiuwenswarm (Apache-2.0) 的 Symphony 引擎。
> 核心理念：**能力越用越强而非越跑越僵** —— 从运行时事件中提取成功/失败信号，动态调整 skill 权重，
> 从历史会话中聚类提炼经验模式，用 5 维评估量化 skill 质量，用 beam 搜索规划最优 skill 编排。

## 触发条件 / When to Use

- orchestrator 执行任务路由/decomposition/Worker分配时
- skill 使用后需要评估效果并记录学习信号
- 需要从历史 session 中提炼可复用经验模式
- 需要用数据驱动的方式调整 skill 之间的依赖权重
- kanban_complete 前需要多维度质量评估

## 核心内容

### 1. 动态 Overlay 系统（借鉴 Symphony evolution overlay）

**原理**：在静态 skill 描述之上叠加一个"运行时 overlay"，记录每条 skill edge 的成功/失败统计和动态权重。

```
静态层: skill descriptions + edges (can_feed 关系)
    ↓
动态层: runtime overlay (成功/失败计数 + 动态权重)
    ↓
决策: 按动态权重优先选择高成功率的 skill 路径
```

**权重策略**（`skillgraph_linear_v1`）：
```
runtime_weight = 1.0 + STEP × (success_count - failure_count)
  - STEP = 0.05（每次调整步长）
  - MIN = 0.2（最低权重，不会完全淘汰）
  - MAX = 2.0（最高权重，最多 2x 加成）
  - needs_input 不影响权重（不是 skill 本身的问题）
```

**在 Hermes 中的实现**：
- 每次任务完成后通过 `kanban_comment` 记录 outcome 事件
- `hindsight_retain` 存储成功/失败模式
- orchestrator 路由时参考历史成功率

### 2. Experience Bank（借鉴 Symphony experience bank）

**原理**：从历史 session 中自动提取、聚类、蒸馏经验模式。

```
Pipeline:
1. Trace Collection — 从 session 历史中提取 (query, skills_used, result) 三元组
2. Clustering — 按 skill_set 分组，FAISS 语义聚类
3. Distillation — LLM 从聚类中提炼泛化模式（query template）
4. Evaluation — LLM 评估 skill 选择正确性（success/error_type/error_detail）
5. Storage — 写入 ExperienceBank (FAISS 向量索引 + JSONL 元数据)
6. Retrieval — 查询时语义检索相关经验，注入上下文
```

**错误类型分类**：
| error_type | 含义 | 对应 Hermes 动作 |
|------------|------|----------------|
| `wrong_skill` | skill 不匹配任务 | 路由调整 + skill 描述更新 |
| `skill_error` | skill 正确但执行失败 | 工具/环境修复 |
| `incomplete` | skill 未完成任务 | skill 内容补充 |
| refusal | skill 拒绝执行 | 检查任务/skill 匹配度，必要时更换模型 |
| `empty` | skill 返回空结果 | skill 逻辑修复 |

**在 Hermes 中的实现**：
- `hindsight_recall` 检索相关经验
- `hindsight_retain` 存储提炼的模式
- `session_search` 回溯历史 session 提取 trace
- `kanban_comment` 记录 skill 使用 outcome

### 3. 五维质量评估（借鉴 Symphony EvaluationSuite）

**固定五维评估模型**：

| 维度 | Evaluator | 衡量什么 | Hermes 对应 |
|------|-----------|---------|------------|
| **success_rate** | SuccessRateEvaluator | 任务是否成功完成 | kanban_complete vs kanban_block |
| **latency** | LatencyEvaluator | 执行延迟 | 工具调用耗时 |
| **accuracy** | AccuracyEvaluator | 结果正确性 | 验证门检查 |
| **completeness** | CompletenessEvaluator | 任务完整度 | 验收条件覆盖率 |
| **compliance** | ComplianceEvaluator | 合规性 | 红线/规则遵从 |

**置信度分级**：
| result_count | confidence |
|-------------|-----------|
| 0 | none |
| 1 | low |
| ≥2 | normal |

### 4. Beam 搜索编排（借鉴 Symphony bidirectional beam planner）

**原理**：双向 beam 搜索找到最优 skill 编排路径。

```
Forward search:  从 seed skills 向前搜索可以 feed 的下游 skills
Backward search: 从目标 artifacts 向后搜索可以产出它们的 skills
    ↓
Bidirectional meet: 两个方向在中间相遇，形成完整路径
    ↓
LLM Judge: 对每条候选路径评分（0.0-1.0）
    ↓
Final rerank: LLM 对所有候选 plan 做最终重排
    ↓
Output: OrchestrationPlan (steps + edges + missing_inputs + status)
```

**在 Hermes 中的实现**：
- orchestrator 做任务分解时，不只看单步，而是搜索 skill DAG 中的最优路径
- `kanban_create` 创建子任务时考虑 skill 之间的 can_feed 关系
- 历史成功率（动态 overlay）影响路径选择

### 5. Skill 指纹提取（借鉴 Symphony fingerprint pipeline）

**原理**：自动从 skill 目录中提取结构化指纹（inputs/outputs/dependencies）。

```
1. Scan: 扫描 skills/ 目录
2. Parse: 解析 SKILL.md frontmatter + body
3. Extract: LLM 提取 skill schema (inputs/outputs/name/description)
4. Normalize: 归一化 IO 名称到统一词汇表
5. Incremental: 增量更新（只重新提取变更的 skill）
```

**在 Hermes 中的实现**：
- `skills_list` + `skill_view` 已提供基础能力
- `hindsight_retain` 可存储 skill 使用模式
- 未来可用 cron 定期扫描 skill 新鲜度和使用统计

### 6. Session 反馈消费（借鉴 Symphony session_consumer）

**原理**：从持久化的 session 历史中自动推断 skill 使用结果。

```
1. 监听 session 完成事件
2. 加载 session 历史记录
3. 识别用户确认/拒绝信号（正则匹配 "确认执行" / "confirm" 等）
4. 推断 outcome (success/failure/needs_input)
5. 记录到 evolution event log
6. 触发 overlay rebuild
```

**用户确认信号模式**（正则）：
- 中文：`确认...执行`、`按照上面...路径...执行`、`继续执行`、`开始执行`、`用上面技能执行`
- 英文：`confirm`、`proceed`、`continue`、`execute`、`run`、`go ahead`、`follow the plan`

**在 Hermes 中的实现**：
- `session_search` 可回溯 session 中的用户反馈信号
- `hindsight_retain` 存储 skill outcome 事件
- orchestrator 可定期从 session DB 提取反馈

## 与其他 skill 的联动

| Skill | 联动方式 |
|-------|---------|
| `open-source-skill-fusion` | 本 skill 是其第五步（创建 skill）的增强——加入运行时学习 |
| `harness-entropy-management` | 定期清理 = 本 skill 的 overlay 重建 |
| `agent-harness-best-practices` | 5D 评估 = 完成时验证门的量化版本 |
| `loop-engineering-gates` | beam 规划 = 验证门的 plan-time 增强 |
| `pua-pressure-engine` | failure attribution = 压力升级的信号源 |
| `cognition-self-check` | 5D 评估的 compliance 维度 = 认知自检的量化 |

## 与 Hermes 的集成映射

| JiuwenSwarm 概念 | Hermes 对应 |
|-----------------|-----------|
| dynamic overlay | hindsight_retain + kanban_comment outcome 事件 |
| ExperienceBank | hindsight (bank-based, FAISS 语义检索) |
| EvaluationSuite (5D) | kanban_complete metadata + loop-engineering-gates |
| beam planner | orchestrator task decomposition (kanban_create parents) |
| fingerprint pipeline | skills_list + skill_view + cron 定期扫描 |
| session_consumer | session_search + hindsight_recall |
| record_plan_outcome | kanban_comment (JSON outcome event) |
| failure_attribution | pua-pressure-engine 失败模式检测 |
| runtime_weight | skill 使用频率 + 成功率 → 路由优先级 |
