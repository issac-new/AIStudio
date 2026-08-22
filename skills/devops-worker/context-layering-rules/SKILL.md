---
name: context-layering-rules
description: "上下文六层模型：规则放哪层的元决策框架（System/Tools/rules.md/Skills/Memory/permissions）。用于审查 SOUL.md 是否过度膨胀与新规则落位判定。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, context-engineering, profile-design, skill-authoring, swarm-yuan-fusion]
    related_skills: [kernel-context-budget, hermes-agent-skill-authoring, harness-entropy-management]
---

# Context Layering Rules（上下文六层落位规则）

> 来源：swarm-yuan `references/context-engineering-layering.md:45-60`（六层模型 + 四条判据），适配 Hermes profile/skill 体系。
> 定位：**持续维护防线**——"这条规则该放哪一层"的元决策框架，防止 SOUL.md 过度膨胀（长规则书反模式）。

## 触发条件 / When to Use

- 新增任何规则/纪律到 profile 时（先判定该放哪层）
- 审查 SOUL.md / rules.md 是否过度膨胀时
- 设计新 profile 或新 skill 时
- 发现"规则写了但 agent 不遵守"时（可能放错了层）

## 核心内容

### 1. 六层模型（Hermes 映射版）

| 层 | Hermes 对应物 | 特点 | 适合放什么 |
|---|---|---|---|
| L1 模型能力 | 模型本身 | 不可控 | —（不放规则） |
| L2 System prompt | 系统注入的 kanban 协议、SOUL.md | 永远加载，最强约束 | 跨任务、影响决策、不可推断的铁律 |
| L3 Tools | 工具 schema/权限/审批 | 机器强制 | 能用工具约束的绝不写进 prompt |
| L4 项目文档 | rules.md / AGENTS.md / CLAUDE.md | 常驻但次于 system | 项目/团队特定约定 |
| L5 Skills | ~/.hermes/skills/ | **按需加载**，token 经济 | 任务型方法论、领域知识 |
| L6 Memory+权限 | hindsight / session DB / config.yaml | 持久+机器门 | 事实记忆、权限边界 |

### 2. 四条判据（规则落位决策）

新规则来了，依次问：

| # | 判据 | 是 → 落位 |
|---|---|---|
| 1 | 能由工具/权限/机器门禁解决？ | **L3/L6**（不进 prompt） |
| 2 | 跨任务复用 + 影响用户决策 + 不可从环境推断？ | **L2 SOUL.md** |
| 3 | 项目/团队特定，常驻需要？ | **L4 rules.md** |
| 4 | 任务型、场景触发型？ | **L5 skill**（按需加载） |

### 3. 反模式（swarm-yuan 警示）

| 反模式 | 症状 | 修复 |
|---|---|---|
| SOUL 膨胀 | SOUL.md >300 行，规则互相稀释 | 按判据下沉到 L4/L5 |
| hook 能解决的写进 prompt | "每次 X 之前记得 Y"（有机器等价物） | 转 L3 工具约束或 L6 权限 |
| 可从环境推断的重复声明 | "你在 macOS 上"（环境可知） | 删除 |
| 一次性规则常驻 | 某次事故的临时对策写进 SOUL | 转 L5 skill 或 memlog |

### 4. 审查流程（与 kernel-context-budget 联动）

```
对某 profile：
1. 列出 SOUL.md 所有规则块
2. 每条过四条判据，标应属层
3. 层错位清单 → 迁移计划（下沉到 rules/skill/工具）
4. 迁移后验证：agent 行为不漂移（关键规则有回归检查）
```

## 与其他 skill 的联动

- `kernel-context-budget`：本 skill 定"放哪层"，kernel-budget 定"放进去怎么写+预算"
- `hermes-agent-skill-authoring`：skill 写作时的 L5 定位确认
- `harness-entropy-management`：定期审计的层错位检查项

## 与 Hermes 的集成映射

| 集成点 | 用法 |
|---|---|
| profile 设计/审查 | 四条判据逐条过 |
| 新规则引入 | 先判层再落笔 |
| `hermes tools` / config.yaml | L3/L6 机器约束优先于 prompt 规则 |
