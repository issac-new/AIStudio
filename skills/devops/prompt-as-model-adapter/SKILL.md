---
name: prompt-as-model-adapter
description: "Prompt即模型适配层——Opus 4.7→4.8→5的U型曲线分析。Delivering Work治理+Corrections纠错传播阈值+规则分层放置审计+模型升级评估。"
version: 1.0.0
metadata:
  hermes:
    tags: [context-engineering, prompt-engineering, model-adapter, governance, fusion]
    related_skills: [agent-harness-best-practices, skill-self-evolution-fusion, loop-engineering-gates, cognition-self-check]
---

# Prompt 即模型适配层 (Prompt as Model Adapter)

> 来源：微信公众号「Vibe编码」文章《Opus 4.8 删掉了73%的提示词，Opus 5 为何又新增了 82%》(2026-07-27)。
> 核心洞察：Claude Code 三代 System Prompt 的 U 型曲线（14,808→4,050→7,376字符）揭示了一个成熟趋势——
> Prompt 不再是"说明书"，而是"模型适配层" + "治理内核"。

## 触发条件 / When to Use

- orchestrator 审查 SOUL.md/rules.md 内容是否过度膨胀时
- 模型升级后重新评估现有规则集时
- 需要判断一条规则应该放在 System / CLAUDE.md / Skill / Schema / Memory / Runtime 哪一层
- 任务完成时判断"是否真正闭环"（Delivering Work 治理）
- 自我纠错时判断"哪些错误值得打断用户"（Corrections 治理）
- 子 Agent 输出需要信任评估时

## 核心内容

### 1. U 型曲线：三代 Prompt 演进

| 版本 | System 字符 | System+Tools 字符 | 设计哲学 |
|------|------------|-------------------|---------|
| Opus 4.7 | 14,808 | 105,286 | **工程规则书** — 细讲每步怎么做 |
| Opus 4.8 | 4,050 | 76,268 | **薄 Harness** — 接口语义，情境判断 |
| Opus 5 | 7,376 | 79,423 | **治理内核** — 交付与纠错协议 |

**关键洞察**：
- 4.8→5 的 System 增长 82.12%，但 System+Tools 只增长 4.14%
- Opus 5 公共底座只有 3,989 字符（比 4.8 还短 61 字符）
- 净增 3,326 字符集中在两个新章节：`Delivering work`(2,019) + `Corrections`(1,368)
- 旧规则书没有复活，增加的是自主 Agent 的治理协议

### 2. 三代设计哲学对比

| 维度 | 4.7 工程规则书 | 4.8 薄 Harness | 5 治理内核 |
|------|-------------|---------------|----------|
| **任务执行** | 细讲如何解释任务、最小改动、写注释、验证 UI | 压成一句：观察周围代码 | 删除（模型自行判断） |
| **操作治理** | 列出删除/强推/改CI/外部发送风险案例 | 1,702字符接口语义：权限拒绝、Hook、并行 | 升级为 Delivering Work 治理 |
| **工具描述** | 教程色彩（Agent 6,725字符, Bash 9,821字符） | 瘦身（Agent 1,574, Bash 1,205） | 保持瘦身（schema 不变） |
| **代码风格** | 固定规则 | 一句话：观察周围代码 | 删除 |
| **完成定义** | 进度更新规则 | 无 | `Delivering work`：任务闭环后才能报告完成 |
| **纠错** | 无显式规则 | 无显式规则 | `Corrections`：传播阈值 + 子 Agent 信任 |

### 3. Delivering Work 治理（Opus 5 新增）

**管什么**：不是注释格式或 Bash 用法，而是自主 Agent 的委托治理。

| 治理项 | 含义 | Hermes 对应 |
|--------|------|------------|
| **范围漂移** | Agent 扩大任务范围时的约束 | scope-discipline + orchestrator 分解 |
| **澄清过载** | 日常歧义由 Agent 判断，只有方向性分叉才交还用户 | clarify 使用阈值（Gateway 不用，headless 用 kanban_block） |
| **过早宣布完成** | 只有任务闭环后才能报告完成 | loop-engineering-gates 验证门 |
| **单点阻塞** | 遇到局部阻塞时，先完成不依赖答案的部分 | kanban_block(kind="dependency") + 并行子任务 |
| **授权边界** | 真正会改变结果方向的分叉才交还用户 | Human Gate 分级（高/中/低） |

### 4. Corrections 治理（Opus 5 新增）

**核心**：给自我纠错设置传播阈值——不是所有错误都需要长篇道歉。

| 错误级别 | 传播策略 | Hermes 对应 |
|----------|---------|------------|
| **改变代码/结论/用户决策的错误** | 明确说明，打断用户 | kanban_comment + kanban_block |
| **小偏差** | 直接修正后继续，不挤占注意力 | 静默修复 + kanban_comment 简记 |
| **子 Agent 输出** | 先判断再信任，不自动升级为事实 | delegate_task 返回值独立验证 |

**关键规则**：不让长篇道歉和自我审判挤占用户注意力。

### 5. 规则分层放置审计框架

文章提出的核心方法论——**每条规则应该放在哪一层**：

| 层 | 放什么 | Hermes 对应 | 判定标准 |
|----|--------|------------|---------|
| **System Prompt** | 产品身份、授权边界、完成定义、全局信任协议 | SOUL.md 顶部强制规则块 | 跨任务复用 + 影响用户决策 + 无法从局部环境推断 |
| **CLAUDE.md / AGENTS.md** | 仓库目标、代码中推不出的约定 | workspace 中的 AGENTS.md | 仓库特定 + 代码推不出 |
| **Skills (按需加载)** | 部署、评审、迁移验收、专项流程 | skills/ 目录 + skill_view() | 按需加载 + 专项流程 |
| **Tool Schema** | 工具状态机、参数约束、返回结构 | config.yaml toolsets + tool schema | 接口约束 + 类型安全 |
| **Memory** | 跨会话经验、用户偏好 | memory + hindsight | 跨会话 + 低频但不丢失 |
| **Runtime 门禁** | 删除、发布、外部消息、secrets 处理 | kanban_block + Human Gate + Docker | 真正阻断副作用 |

**审计问题**：若一个问题能由测试、接口或 Hook 更稳定地解决，就没有理由继续让它常驻 System。

### 6. 模型升级评估协议

升级模型时，重新跑任务集，重点看：

| 评估维度 | 衡量什么 | 信号 |
|----------|---------|------|
| **范围扩张** | Agent 是否过度扩大任务范围 | scope-discipline 违规次数 |
| **澄清次数** | Agent 是否频繁要求用户澄清 | kanban_block(kind="needs_input") 次数 |
| **完成率** | 任务是否真正闭环 | kanban_complete vs kanban_block 比率 |
| **过度验证** | Agent 是否过度检查 | 工具调用次数 vs 预期 |
| **子 Agent 成本** | 委托是否合理 | delegate_task 次数 + 返回值利用率 |
| **纠错噪声** | 纠错是否打断用户过多 | kanban_comment 中 "修正/错误" 出现频率 |

### 7. Prompt = Model Adapter

**核心论点**：同一客户端仅切换 model ID 就选择不同 System，意味着 Prompt 正在承担模型适配层角色。

```
新模型能力增强 → 适配层删除已被模型/基础设施吸收的旧教程
    ↓
新的稳定失败模式出现 → 加入少量跨任务治理
    ↓
追求最小充分集合 (minimal sufficient set)
    ↓
字符最少只是可能结果，不是目标
```

**Anthropic Context Engineering 定义**：minimal 并不必然 short，关键是保留高信号内容，并处在合适的抽象高度。

## 与其他 skill 的联动

| Skill | 联动方式 |
|-------|---------|
| `agent-harness-best-practices` | 规则分层放置审计 = Harness 10 条规则的补充框架 |
| `skill-self-evolution-fusion` | 模型升级评估 = 5D 评估的具体应用场景 |
| `loop-engineering-gates` | Delivering Work = 验证门的完成定义增强 |
| `cognition-self-check` | Corrections 传播阈值 = 认知自检的输出控制 |
| `scope-discipline` | Delivering Work 的范围漂移治理 = scope-discipline 的理论依据 |
| `pua-pressure-engine` | 纠错噪声控制 = 压力升级中的突破降压机制 |

## 与 Hermes 的集成映射

| 文章概念 | Hermes 对应 |
|----------|-----------|
| System Prompt = 治理内核 | SOUL.md 顶部强制规则块（不断精简） |
| CLAUDE.md = 仓库事实 | workspace AGENTS.md |
| Skills = 按需加载 | skills/ + skill_view() |
| Tools schema = 动作空间 | config.yaml toolsets |
| Memory = 跨会话经验 | memory + hindsight |
| permissions/sandbox/hooks = 阻断副作用 | kanban_block + Human Gate + Docker |
| Delivering work | kanban_complete 前的完成定义检查 |
| Corrections 传播阈值 | kanban_comment 的纠错记录策略 |
| 模型适配层 | SOUL.md 随模型升级调整（删旧教程 + 加新治理） |
