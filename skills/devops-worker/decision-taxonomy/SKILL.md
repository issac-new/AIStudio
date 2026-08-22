---
name: decision-taxonomy
description: "三级决策分类：Mechanical 直接做/Taste 给方案/UserChallenge 必停五要素；可逆性 one-way 自动升级。用于 kanban_block 结构化与决策留痕。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, decision-governance, human-gate, kanban-block, swarm-yuan-fusion]
    related_skills: [kanban-worker, pua-harness-governance, hindsight]
---

# Decision Taxonomy（三级决策分类与留痕）

> 来源：swarm-yuan `references/decision-governance.md:13-60`（三级分类 + 可逆性横切 + decisions.jsonl 留痕，对齐 ISO/IEC 42001 人工监督条款），适配 Hermes kanban_block。
> 定位：**执行中防线**——给 kanban_block 一个结构化语义，让所有"停下来问人"的决策带上可审计的分类与要素。

## 触发条件 / When to Use

- 任何 worker 需要 `kanban_block` 停下来问人时
- 判断一个决策"能不能自己做主"时
- 复盘审计"这个决策是谁定的、依据是什么"时

## 核心内容

### 1. 三级决策分类

| 级别 | 定义 | 动作 |
|---|---|---|
| **Mechanical** | 有明确对错标准，可逆 | 直接做，不问 |
| **Taste** | 多个合理方案，偏好相关 | 给出方案 + 推荐 + 理由，继续推进（不阻塞） |
| **UserChallenge** | 影响重大、不可逆、或涉及用户偏好/价值观 | **必停**，五要素齐全后 `kanban_block` |

### 2. 可逆性横切属性（自动升级规则）

| 可逆性 | 含义 | 升级规则 |
|---|---|---|
| reversible | 改文件、跑测试、本地分支 | 保持原级 |
| costly | 回滚有代价但可能（已发布、已通知） | Taste → 建议升级 UserChallenge |
| one-way | 不可逆（删除数据、force push、发外部消息） | **任何级别自动升 UserChallenge** |

与 worker-coder SOUL 的「可逆性分级」表对齐：本 skill 提供**分类学**，SOUL 表提供**动作清单**。

### 3. UserChallenge 五要素模板（kanban_block reason/comment 结构）

```markdown
## UserChallenge 决策请求
- **user_decision_needed**: <需要用户拍板的具体问题（一句话）>
- **ai_suggestion**: <AI 的推荐方案>
- **rationale**: <推荐理由，带证据引用>
- **alternatives**: <备选方案及各自代价>
- **missing_context**: <AI 缺少什么信息导致无法自决>
- **cost_if_wrong**: <选错了的代价是什么（量化）>
```

对应调用：
```
kanban_comment(body=<五要素全文>)
kanban_block(kind="needs_input", reason="UserChallenge: <一句话问题>")
```

### 4. 决策留痕（decisions 记录）

每个 Taste/UserChallenge 决策在 kanban_complete metadata 或 comment 中留痕：

```json
{
  "type": "mechanical|taste|user_challenge",
  "decision": "<一句话>",
  "user_action": "approved|overridden|deferred|n/a",
  "rationale": "<理由>",
  "reversibility": "reversible|costly|one_way",
  "confidence": "extracted|inferred|ambiguous"
}
```

confidence 三级溯源（与 hindsight 增强联动）：
- **extracted**：字面证据（文件/命令输出直接给出）
- **inferred**：合理推断（基于证据的推理链）
- **ambiguous**：待人工确认（推断依据不足）

### 5. 判定流程

```
遇到决策点
  ├─ 有明确对错 + 可逆？ → Mechanical → 直接做
  ├─ 不可逆？ → 自动 UserChallenge → 五要素 + kanban_block
  ├─ 多方案偏好相关？ → Taste → 给方案+推荐，继续
  └─ 影响重大/涉价值观？ → UserChallenge → 五要素 + kanban_block
```

## 与其他 skill 的联动

- `kanban-worker`：kanban_block 用法的分类学增强
- `pua-harness-governance`：四权分离中"何时必须移交决策权"的判定标准
- `hindsight`：decisions 留痕的 confidence 标记同步进 hindsight_retain
- `scale-adaptive-routing`：路由门的"不可逆 → 完整环路"与本 skill 的 one-way 升级同源

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| `kanban_block(kind="needs_input")` | UserChallenge 标准出口，五要素进 comment |
| `kanban_complete(metadata=...)` | decisions 数组留痕 |
| `hindsight_retain` | 长期决策事实带 confidence 标记 |
| worker SOUL 可逆性表 | 动作清单与本分类学联动 |
