---
name: harness-entropy-management
description: "Agent 系统熵管理。定期清理工作流：文档新鲜度扫描、工具库存清理、质量评分更新、技术债跟踪、过期计划归档、重复失败分析。防止过时文档和弱范例积累。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, agent-behavior, entropy, maintenance, cleanup]
    related_skills: [agent-harness-best-practices, pua-harness-governance]
---

# Harness 熵管理

> 来源：DenisSergeevitch/agents-best-practices `agent-legibility-feedback-loops.md`
> 核心问题：Agent 系统随时间积累熵——过时文档、重复规则、弱范例、过期工具。

## 熵的来源

Agent 会复制现有模式，包括坏的模式。没有清理机制时：

| 熵类型 | 表现 | 后果 |
|--------|------|------|
| 过时文档 | SOUL.md/rules.md 中的命令已失效 | worker 执行失败 |
| 重复规则 | 多个文件说同一件事 | token 浪费 + 维护负担 |
| 弱范例 | 低质量代码块被新 agent 模仿 | 质量逐代下降 |
| 过期工具 | skill 引用的工具未安装 | skill_view 后无法执行 |
| 技术债 | 临时方案变成永久方案 | 系统复杂度上升 |
| 过期计划 | kanban 旧任务从未完成 | 看板污染 |
| 重复失败 | 同一类错误反复出现 | 无教训沉淀 |

## 定期清理工作流

### 1. 文档新鲜度扫描

```bash
# 扫描所有 SOUL.md 和 rules.md 的最后修改时间
find ~/.hermes/profiles -name "SOUL.md" -o -name "rules.md" | \
  xargs stat -f "%m %N" | sort -n
```

- 超过 30 天未更新的文件：检查内容是否仍然准确
- 命令是否可执行：抽取代码块逐个验证
- 链接是否有效：检查引用的外部文件是否存在

### 2. 工具库存清理

```bash
# 扫描 SOUL.md 中引用的工具是否在 toolsets 中
grep -rh "^\`\`\`" ~/.hermes/profiles/*/SOUL.md | \
  grep -oP '\b\w+\b' | sort -u | \
  while read tool; do
    hermes tools list 2>/dev/null | grep -q "$tool" || echo "MISSING: $tool"
  done
```

- 标记为 MISSING 的工具：从 SOUL.md 移除或安装
- 检查 Docker 沙箱中是否有对应命令

### 3. 质量评分更新

对每个 profile 的 SOUL.md 检查：
- 命令手册覆盖率（是否有 `## 具体操作命令手册` 段落）
- 代码块数量 vs 总行数比例
- 是否有 `[SKILL_PRUNED]` 标记
- 是否有过期的模型名/版本号

### 4. 技术债跟踪

| 债务类型 | 检测方法 | 优先级 |
|---------|---------|--------|
| 临时方案 | 搜索 "TODO"、"FIXME"、"临时"、"暂时" | P2 |
| 硬编码值 | 搜索 IP、端口号、用户名 | P1 |
| 失效引用 | 搜索已不存在的文件路径 | P2 |
| 冗余配置 | 多个 profile config.yaml 重复配置 | P3 |

### 5. 过期计划归档

```bash
# 扫描 kanban 中超过 7 天未更新的任务
hermes kanban list --status running --limit 50 2>/dev/null
```

- running 超过 7 天：检查是否需要 kanban_block 或重新分配
- blocked 超过 14 天：归档或重新路由

### 6. 重复失败分析

- 搜索 kanban_comment 中的教训记录
- 按失败类型分类（编译错误/部署失败/权限问题/网络超时）
- 同类失败 ≥3 次：创建 skill 或 patch SOUL.md 预防

### 7. Prompt/工具包审查

- 检查 SOUL.md 总行数（超过 500 行考虑拆分到 references/）
- 检查 skill 数量（超过 50 个考虑分类归档）
- 检查 memory 使用率（超过 90% 考虑清理旧条目）

## 清理频率建议

| 清理项 | 频率 | 执行者 |
|--------|------|--------|
| 文档新鲜度 | 每月 | orchestrator cron job |
| 工具库存 | 每月 | orchestrator cron job |
| kanban 过期任务 | 每周 | orchestrator |
| 重复失败分析 | 每次任务完成后 | worker (kanban_comment) |
| 技术债跟踪 | 每季度 | orchestrator + 用户确认 |
| memory 清理 | 当使用率 >90% | orchestrator |

## 机械不变量优于 prompt 建议

> 文档本身不能保持 agent 系统一致。将重复指导转化为机械检查。

| 检查类型 | 实现方式 |
|---------|---------|
| Schema 验证器 | tool input/output schema 校验 |
| 策略检查器 | permission matrix + Human Gate |
| 结构测试 | 文件存在/行数/格式检查 |
| 工作流验证器 | kanban 任务状态转换检查 |
| 来源引用检查 | 研究任务的来源 URL 可访问性 |
| PII/秘密扫描 | redact_pii + redact_secrets |
| 新鲜度检查 | 文件 mtime 检查 |
| 成本/延迟预算 | kanban max_runtime_seconds |
| 回归评估 | evals/ 测试套件 |

**给验证器提供修复消息**，安全地返回给模型作为结构化观测。

## 知识库作为系统记录

| 知识类型 | 存储位置 | Hermes 对应 |
|---------|---------|-----------|
| 指令地图 | 顶层 SOUL.md | SOUL.md（简洁地图） |
| 策略索引 | references/*.md | rules.md + references/ |
| 运行手册 | runbooks/ | skill references/ |
| 活跃计划 | plans/active/ | kanban running tasks |
| 完成计划 | plans/completed/ | kanban done tasks |
| 质量记分卡 | quality/ | hindsight + memory |
| 评估用例 | evals/ | evals/ (if exists) |

**指令地图应该告诉 agent 下一步去哪里看，不是一本竞争任务上下文的巨型手册。**
