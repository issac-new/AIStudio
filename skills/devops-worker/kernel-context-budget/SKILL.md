---
name: kernel-context-budget
description: "上下文治理：kernel 最小真相集+instruction budget 超支必砍+现状-only 写作纪律+sweep 刷新语义。用于 SOUL/rules/_shared 长期文档写作与定期审计。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, context-governance, instruction-budget, documentation, bmad-fusion]
    related_skills: [harness-entropy-management, hermes-agent-skill-authoring, context-layering-rules]
---

# Kernel Context Budget（Kernel 上下文预算治理）

> 来源：BMAD-METHOD v6 `bmad-project-context` 的 kernel+bundle 治理 + instruction budget + 现状-only 写作纪律 + sweep 语义，适配 Hermes SOUL.md/rules.md/_shared 长期文档。
> 定位：**持续维护防线**——防止常驻 prompt 文档无限膨胀导致 context-rot。

## 触发条件 / When to Use

- 新写或修改任何常驻文档（SOUL.md / *_rules.md / _shared/*.md）时
- 定期审计 profile 文档膨胀时（与 harness-entropy-management 联动）
- 发现 agent 行为漂移、怀疑"规则太多互相稀释"时

## 核心内容

### 1. 治理公理（BMAD 原文精神）

> "生成的文档让 agent 变差；经过验证的、不可推导的最小真相集让 agent 变好。"

- **kernel = 永远加载的最小真相集**（SOUL.md 顶部的强制规则块）
- **bundle = 按需加载的深度参考**（skills、references/、外置文件）
- 能进 kernel 的必须满足：①跨任务复用 ②影响用户决策 ③不可从环境推断 ④无机器等价物

### 2. Instruction Budget（指令预算）

| 文档类型 | 建议预算 | 超支处理 |
|---|---|---|
| SOUL.md | ≤300 行 | 超支**必砍**，绝不提高预算 |
| *_rules.md | ≤600 行 | 超支 → 外置到 references/ 或 skill |
| _shared/*.md | ≤250 行/文件 | 超支 → 拆分文件 |

**预算纪律**：新增内容必须**先删除等量或更多旧内容**（负向预算，与 swarm-yuan
FACT_GATES_BUDGET=54 冻结同构）。validate 超支就砍，绝不提高预算。

### 3. 写作纪律（三条铁律）

| # | 纪律 | 违禁示例 |
|---|---|---|
| 1 | **Succinct to the point of discomfort**（短到不适） | 用三句话解释一句话能说清的规则 |
| 2 | **现状-only**：只写现状，不写编辑史 | "we removed X because..." / "以前规则是 Y 现在改为 Z" |
| 3 | **无链接不引用**：引用外部概念必须给文件路径/URL | "按最佳实践"（无出处） |

编辑史属于 git commit message 和 memlog，不属于常驻文档。

### 4. Sweep/Refresh 语义（刷新纪律）

刷新文档时：
- **对代码现状 diff**，不是重问 LLM"你觉得应该怎么写"
- 引用路径已消失的 claim → **更新或删除**，不许"洗白"成"文档里说"（文档引用自己不算证据）
- 规则与真实行为漂移时，以真实行为为准修正规则，或明确标记规则为 aspirational

### 5. 审计 checklist（定期，与熵管理联动）

```
□ 每个常驻文档行数在预算内
□ grep 编辑史违禁文体（"以前" "we removed" "原本" "历史"）
□ 所有 file 引用路径真实存在（脚本验证）
□ 每条规则能回答"这条防的是什么真实事故？"（答不出的删除）
□ kernel/bundle 分层：能在 skill 的不在 SOUL；能推断的不写
```

## 与其他 skill 的联动

- `harness-entropy-management`：本 skill 提供文档层的审计标准，熵管理提供周期与流程
- `context-layering-rules`：六层模型决定规则该放哪层；本 skill 管"放进去之后怎么写"
- `hermes-agent-skill-authoring`：skill 写作同样适用三条铁律

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| SOUL.md / *_rules.md 编辑 | 过三条铁律 + 预算检查 |
| cron 定期审计 | 跑审计 checklist，产出超支清单 |
| `_shared/*.md` | 被所有 profile 读取，预算最严格 |
| 新 profile 创建 | 从模板起步时就应用预算 |
