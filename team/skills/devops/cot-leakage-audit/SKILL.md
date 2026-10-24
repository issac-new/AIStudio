---
name: cot-leakage-audit
description: "审查文档中链式推理泄漏：版本痕迹、看板引用、时间锚。用 HEAD 读者测试判定。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, documentation, quality, governance, maintenance]
    related_skills: [harness-entropy-management, evidence-based-retro, agent-harness-best-practices]
---

# 链式推理泄漏审查（CoT Leakage Audit）

> 来源：deepseek-ai/deepseek-harness `.agents/skills/dsh-trim-cot-leakage`（2026-08-13），适配 Hermes Agent 集群。
> 核心立场：文档的读者 vantage 应该是 HEAD 上的新 worker，不是作者 session。

## When to Use

- 用户说"审查 SOUL.md/skill 文档质量"
- 定期文档卫生维护（配合 harness-entropy-management）
- 发现 agent 被 SOUL.md 中过时的版本引用误导
- SOUL.md/rules.md/skill SKILL.md 的内容审计

## 唯一测试

对每段可疑文字问：**一个 HEAD 上的新 worker，无权访问任何 session 记录/git log/看板评论/聊天历史，能否解析每个引用并验证每个声明？**

- **不能** → 重述幸存的事实（使其在 HEAD 独立成立），删除周围的记录
- **能** → 不是泄漏（但当前状态文档上仍有变更叙事问题，见分类 3）

## 八类泄漏分类（针对 Hermes 实际痛点）

### 1. 版本标记泄漏

`(V5新增)`、`(08-09纠正)`、`(08-10范式转移)`、`v1→v4迭代`、`Phase 4`。

这些标记只对作者的 session 有意义。**处理**：如果该规则仍然有效，重述为当前事实（去掉版本标记）；如果已废弃，删除整段。

### 2. 修复历史泄漏

`修法: real_set⊆shared_set时rmtree→symlink_to`、`坑: sqlite3内联PRAGMA污染$()`。

这些是调试 session 的产物。**处理**：提取幸存的经验教训，重述为"最佳实践"（当前时态），删除调试叙事。

### 3. 变更叙事与时间锚

`used to`、`no longer`、`this cut`、`旧的做法`、`今天`、`现在（对比过去）`。

**处理**：描述当前行为。已修复的回归变成现在时反事实（"不加 X，则 Y 发生"），而非仓库历史（"以前 Y"）。

### 4. 看板/任务引用泄漏

`kanban task t_25432`、`详见 task t_xxxx`、`（来自 t_25432cc9）`。

外部读者无法访问看板 DB。**处理**：如果该决策已编码到共享规则，引用规则文件路径；否则删除引用，重述事实。

### 5. 评审/讨论痕迹

`用户纠正`、`经确认`、`reviewer 指出`、`评审通过`。

**处理**：保留幸存的决策和理由作为事实，删除谁在何时说了什么。

### 6. 控制流叙事

`首先我们 X，然后 Y`、`步骤1→步骤2→步骤3`（在散文中而非结构化清单中）。

**处理**：删除，只保留非显而易见的契约或不变量。

### 7. 犹豫和规划残留

`probably fine for now`、`should be enough`、`暂且如此`、`待补充`。

**处理**：提升为明确的 `TODO`/`FIXME` 或重述为实际边界，删除犹豫。

### 8. 作者语言滑入

中文散文中出现未翻译的工作语言片段（`端`、`设计稿`、`---- 私有 ----`），或反之。

**处理**：翻译或删除。

## 不是泄漏的情况（避免误删）

- **Issue 引用** — `#1470`、`TODO(name):`、`issue #N owns the follow-up` 在 HEAD 可解析，保留
- **反事实现在时回归钉** — "不加 X，则 Y 发生"是有效的
- **测量边界** — `(measured: 512 nests ≈ 0.15s)` 校准常量，provenance 词 "measured" 是负载的
- **运行时旧/新状态** — "旧连接在新的接受前排空" 是运行时生命周期，不是变更历史
- **外部引用** — RFC、标准章节、外部标准在自己的 § 编号体系内

## 工作流程

### Step 1: 确定范围

```bash
# 确定审查目标
TARGET="$1"  # 如 ~/.hermes/profiles/worker-coder/SOUL.md
# 或批量
TARGET="~/.hermes/profiles/*/SOUL.md"
```

### Step 2: 只读审查

```bash
# 用 recall batteries 探测常见泄漏模式
# 版本标记
rg -n '\(V[0-9]' $TARGET
rg -n '\([0-9]{2}-[0-9]{2}' $TARGET  # 日期标记
rg -n 'v[0-9]→v[0-9]' $TARGET
# 看板引用
rg -n 't_[a-f0-9]{8}' $TARGET  # kanban task id
rg -n 'kanban task' $TARGET
# 修复历史
rg -n '修法:' $TARGET
rg -n '坑:' $TARGET
rg -n '纠正' $TARGET
# 变更叙事
rg -n 'used to|no longer|以前|之前是' $TARGET
rg -n '范式转移|phase [0-9]' $TARGET -i
```

注意：batteries 是探针不是定义。每轮审查都会发现 batteries 漏掉的情况，所以也要不带 pattern 地阅读最密集的散文段落。

### Step 3: 按表层修复（owner-first）

| 表层 | 修复策略 |
|------|---------|
| SOUL.md | 修改原文，保留规则但去掉泄漏标记 |
| skill SKILL.md | 修改 skill 正文 |
| _shared/*.md | 修改共享规则，全集群生效 |
| memory 条目 | 重写为声明性事实，去掉叙事 |

### Step 4: 删除前列举命题

对每个要删除的段落，先列举它的所有命题，检查是否有幸存的事实需要保留：

```
段落: "(08-09纠正：orchestrator的微信=爸爸...)"
命题:
  - orchestrator 微信身份 = 爸爸  ← 幸存，重述为当前事实
  - 08-09 这个日期  ← 删除（时间锚）
  - "纠正"这个动作  ← 删除（变更叙事）
```

### Step 5: 验证

```bash
# 重跑 batteries，预期只有 sanctioned keeps 和本 skill 自身目录的命中
rg -n '\([0-9]{2}-[0-9]{2}' $TARGET
# 确认每个剩余引用在 HEAD 可解析
# 检查 SOUL.md 总行数变化（应减少）
wc -l $TARGET
```

## 具体示例

### 示例 1: memory 条目

**泄漏版**:
```
微信身份识别(08-09纠正)：orchestrator(8650)的微信=爸爸...
```

**清洁版**:
```
orchestrator(端口8650)的微信身份=爸爸(<main-bot-account-id>@im.bot)；[已移除]-orchestrator(端口8651)的微信身份=妈妈(<[已移除]-bot-account-id>@im.bot)。
```

### 示例 2: SOUL.md 规则

**泄漏版**:
```
> (V5新增) 融合外部三区协同：净/脏状态机+契约锚定+净化重写+厂商合规DPA
```

**清洁版**:
```
> 三区网络协同：净/脏状态机 + 契约锚定 + 净化重写 + 厂商合规 DPA
```

### 示例 3: skill Pitfall

**泄漏版**:
```
### 6. triage 卡死不拾取
kanban_create(triage=True) 创建的卡 dispatcher 不会拾取。
（来自 t_25432cc9 的教训）
```

**清洁版**:
```
### 6. triage 卡死不拾取
kanban_create(triage=True) 创建的卡 dispatcher 不会拾取。
创建后必须 promote 到 ready 并验证 worker spawn。
```

## Pitfalls

1. **过度修正** — 不要把义务翻转为认可，不要把假设提升为已发布功能，不要删除真实事实或 provenance
2. **误删 sanctioned keeps** — issue 引用、TODO 标记、反事实回归钉不是泄漏
3. **只跑 batteries 不读散文** — batteries 是探针，漏报率高，必须辅以人工阅读
4. **跨双语对忘记同步** — 如果有 zh/en 双版本，改了一个必须改另一个

## 与其他 skill 的关系

| Skill | 侧重 | 与本 skill 的关系 |
|-------|------|-----------------|
| `harness-entropy-management` | 定期清理工作流（文档新鲜度/工具库存/技术债） | 本 skill 是其文档卫生维度的深化 |
| `evidence-based-retro` | 复盘时每条发现带 file:line 引用 | 本 skill 是其「写出来给人看」面的预防 |
| `agent-harness-best-practices` | 10 条运行时规则 + 成熟度模型 | 本 skill 补充文档质量维度 |
