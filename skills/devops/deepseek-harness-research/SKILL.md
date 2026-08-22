---
name: deepseek-harness-research
description: "DeepSeek Harness 调研存档：Cordis 理论、七层管线、Seam 三角色及优化映射。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, research, agent-behavior, architecture, reference]
    related_skills: [agent-harness-best-practices, pua-harness-governance, cot-leakage-audit]
---

# DeepSeek Harness (dsh) 调研存档

> 调研日期：2026-08-13（dsh 发布当日）。本文档是 deepseek-harness 源码/理念/论文的结构化知识存档。
> 调研方法：GitHub API 读取源码 + README/AGENTS.md/docs + Cordis 论文摘要。

## 仓库基本信息

| 维度 | 数据 |
|------|------|
| 全名 | `deepseek-ai/deepseek-harness` |
| Stars | 20,215+（发布当日） |
| 语言 | TypeScript (monorepo, pnpm workspace) |
| 许可证 | MIT |
| 状态 | Developer Preview |
| 运行 | `npx @deepseek-ai/dsh web`（Web UI @ 127.0.0.1:3080） |
| 理论基础 | Cordis 框架 + 论文《A Programming Paradigm for Spatiotemporal Composability》 |
| Slogan | **"Everything is a Plugin"** |

## 核心理念：时空可组合性

Cordis 论文识别两个正交维度：
- **时间可组合性**：组件移除时完全撤销副作用（Revertible Effects）
- **空间可组合性**：声明并响应式管理组件间依赖（Reactive Coeffects）

### Cordis 五大核心理念

1. Plugin = Service 实现（可函数可类）
2. Context = Service 仓库（稳定的 `ctx.<key>`）
3. `inject` 声明依赖（加载顺序由服务需求表达）
4. Typed Events 通信（emit / waterfall / parallel / serial）
5. Registrations are reversible effects（disposer 保证卸载回退）

## 架构：微内核 + Capability Seam

```
Profile（命名组合）→ Bundle（Cordis 配置行+代码）→ Plugin Tree（运行时）
```

### 六大核心包

| Package | ctx 键 | 职责 |
|---------|--------|------|
| core/session | ctx.sessions | 追加式 SessionEvent 日志（唯一真相源） |
| core/system-prompt | ctx.systemPrompt | Prompt 段落 + 工具 schema 组装 |
| core/tools | ctx.tools | 作用域工具注册表 + 守卫执行管线 |
| core/agent | ctx.agents | Agent 接口 + 实时注册表 |
| core/agent-loop | ctx.agentLoop | 默认驱动器（可替换） |
| llm/llm | ctx.llm | 消息/流词汇 + 适配器缝隙 |

### 关键设计原则

1. **Model-visible ⟺ logged** — 到达模型的信息必须可从日志重建
2. **Capability Seam 三角色完整** — Definition/Provider/Consumer
3. **Plugins, not loop changes** — 新行为挂载扩展点，不改 agent-loop
4. **Waterfall MUST call next()** — 合作式中间件链
5. **Fail loud** — 配置错误在加载时大声失败
6. **Branded ids** — 不透明跨边界 id 用品牌化类型
7. **Explicit > implicit at boundaries** — 默认值是显式 resolve() 步骤

## 七层工具执行管线

```
① tool/call → ② pre-execute(waterfall) → ③ guards(monotonic)
→ ④ approval(one-shot) → ⑤ execute(waterfall) 
→ ⑥ post-execute(waterfall) → ⑦ result(immutable)
```

| 层 | 功能 | 选择规则 |
|----|------|---------|
| pre-execute | hooks/permission/sandbox | 权限安全策略 |
| guards | 不可绕过的最终拒绝 | 禁止改 tests |
| approval | 一次性审批 | 需要人工决策 |
| execute | timeout/retry/metrics | 超时重试 |
| post-execute | accept/block/replace/add context | 结果标准化 |
| result | 审计快照冻结 | 防篡改 |

## 五大高级能力

| 能力 | 机制 | 对标 |
|------|------|------|
| Goal | ctx.goals 持久化目标 + goal-round cap + 状态机 | Claude Code /goal |
| Ralph Loop | fresh-agent 多轮 + Ralph handoff 传递状态 | SWE-bench 自主 |
| Workflow | model-written JS 脚本 + worker_thread + spawn subagent | Claude Code workflows |
| Compaction | 压力/溢出触发 + tool-result pruning + 摘要替换 | 自动 context 管理 |
| Scoped Registration | 全局 vs per-agent + shadowing + persona 变体 | agent 个性化 |

## 防御性编程模式（7条血泪规则）

1. **独立报告正交结果** — timeout + exit 0 可同时发生
2. **双侧遵守公共契约** — 归一化后返回公共 API
3. **异步状态 ≠ 同步状态** — followup 无 per-message 完成
4. **Dispose 到达静止** — kill → await done
5. **回调异常在分派器内遏制** — 一个坏 subscriber 不破坏核心
6. **不可信输出不给 ambient env** — 清洗 env + 私有临时文件
7. **Symlink 形路径用 unlink** — 不跟随链接递归删

## Agent Notes 制度

dsh 有完善的 `.agents/notes/implemented/` 树（architecture/bug-fix/feature/process/simplification/testing 六类），每个架构决策都有 dated note 记录 rationale。这不是文档，是**设计决策的审计追踪**。

## 对标差距分析（dsh vs Hermes 28-profile 集群）

| dsh 机制 | Hermes 现状 | 融合决策 | 已落地 |
|---------|-----------|---------|--------|
| Revertible Effects | 无回滚机制 | 新建 _shared/revertible-effects.md | ✅ |
| Model-visible ⟺ logged | 部分缺失 | 增强 loop-engineering-gates | ✅ |
| 七层管线(缺 post-execute/result) | 部分(pressure-engine+Gate) | 增强 pua-harness-governance | ✅ |
| Capability Seam 三角色 | 扁平 toolset | 增强 agent-harness-best-practices | ✅ |
| Defensive Patterns | 无 | 新建 _shared/defensive-patterns.md | ✅ |
| CoT Leakage Audit | 无 | 新建 cot-leakage-audit skill | ✅ |
| Typed Events 总线 | 松散 status 变更 | 暂缓(Python架构不适用) | - |
| Scoped shadowing | profile 隔离 | 暂缓(已有等价) | - |
| Ralph Loop | kanban goal_mode | 不采纳(已覆盖) | - |

## 深入阅读路径

- README: https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md
- 架构文档: docs/architecture.md
- Cordis 入门: docs/cordis-primer.md
- 工具管线: docs/tool-execution-pipeline.md
- 术语表: docs/glossary.md
- 防御模式: docs/defensive-patterns.md
- Cordis 论文: https://github.com/cordiverse/paper (PDF: paper.pdf)
