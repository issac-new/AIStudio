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
| 能力过时 | skill 创建后长期零引用/零调用 | 能力地图失真（2026-08-21 增补，融合自麦肯锡技能智能框架） |

### 能力过时预警（麦肯锡融合 P2-7）

> 来源：麦肯锡智能体驱动型组织框架（能力过时预警机制）

**检测规则**：
1. **零引用检测**：skill 创建后 90 天内未被任何 SOUL.md 引用 → 标记 `stale`
2. **引用-禁用矛盾**：SOUL.md 引用但 profile config `skills.disabled` 显式禁用 → 标记 `conflict`
3. **名称相似度**：多个 skill 名称 Levenshtein 距离 ≤ 2 → 标记 `duplicate-suspect`

**预警动作**：
- `stale`：列入熵管理周报，建议归档或合并
- `conflict`：立即告警，需人工确认是引用错误还是禁用错误
- `duplicate-suspect`：列入审查清单，建议合并或明确边界

**落地**：`skill-health-audit.sh`（`~/.hermes/bin/`，周一 9 点 cron）已覆盖零引用检测；引用-禁用矛盾检测见 D7 维度。

### 零引用 skill 分级处置规则（G1，2026-08-21 增补）

> 背景：实测 600/637（94%）skill 零 SOUL 引用——"模式紧、数据松"的反面：数据层失控。但不加区分地全删会误伤（技能库设计本就包含"按需检索"而非"全程引用"的技能）。

**四档处置**（每周 skill-health-audit 产出分级清单，人工决策执行）：

| 档 | 判定标准 | 处置 | 理由 |
|---|---|---|---|
| **保留**（默认） | 零引用但 ≤180 天创建，且属于活跃域（cybersecurity/devops/[已移除] 等本机团队在用域） | 不动 | "按需检索"是技能库的合法形态——SOUL 引用不是唯一使用路径（tool_search/skills_list 也能发现） |
| **观察** | 零引用且 >180 天，无 session 使用痕迹 | 列入季度审查清单，标注"候选归档" | 长期无人问津，但可能等一个场景 |
| **归档** | 零引用 >270 天 且 内容过时（引用的工具/命令已失效，D6 检测命中） | `mv` 到 `~/.hermes/skills-archive/<分类>/`（保留可恢复） | 死技能污染检索（600 条里找 37 条活的） |
| **合并** | duplicate-suspect 且语义确认重复 | 合并到 canonical 实体（三次法则），symlink 兼容旧名 | 单一 canonical 表示 |

**禁止**：
- ❌ 未经人工确认直接删除（违反"零代码等效+保守"纪律）
- ❌ 归档时不留恢复路径
- ❌ 一次性批量清理 >100 个（分批，每批后跑 skills list 验证索引器无异常——历史教训：索引器对目录结构变化敏感，Errno 62 自指环事故）

**季度清理节奏**：每季度第一个周一，skill-health-audit 周报附分级清单 → 图爸勾选归档/合并项 → 分批执行（≤100/批）。

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

### 6-bis. 能力过时预警（2026-08-21，融合自麦肯锡技能智能框架）

> 麦肯锡 R2："持续更新的技能智能——哪些能力正在过时，哪些因AI赋能而变得关键。"
> Hermes 映射：skill 被创建后如果长期零引用，说明该能力可能已过时或从未被采纳。

**检测逻辑**（挂入周一熵管理 cron）：
1. 扫描全部 profile SOUL/rules 中的 `skill_view('...')` 引用
2. 对照 `hermes skills list` 的 enabled 清单
3. 标记**零引用 skill**：enabled 但无任何 SOUL/rules 引用（可能是建了没人用的"样子货"）
4. 输出能力过时清单（不自动删除，只报告——删除决策由图爸拍板）

**与 rules_audit_watchdog 的关系**：D7 检测引用-禁用矛盾（即时错误），本项检测零引用（渐进腐化），互补。

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

## 规则有效性机械审计（2026-08-21 全集群审计新增）

> 来源：2026-08-21 全集群规则有效性审计（27 profile + 24 shared 文件）。
> 一次性扫出 50+ 处"写了但落地不了"的规则，全部是缓慢漂移产物（命令改名/skill 丢失/schema 变动无人发现）。
> 已固化为 cron watchdog：`rules-audit-drift-watchdog`（`~/.hermes/profiles/orchestrator/scripts/rules_audit_watchdog.py`，周一 9:00，no_agent 零 token）。

### 七维机械检查（D1-D7，脚本已实现可直接复用）

| 维度 | 检查什么 | 本轮实证发现 |
|------|---------|------------|
| D1 悬空引用 | SOUL/rules 引用的 `_shared/*.md` 文件是否存在 | 4 处（多为路径口径误报） |
| D2 失效 skill | `skill_view('X')` 引用的 skill 是否可被索引器收录 | **cognition-lattice ×12、codex-guardian 等 20+ 不可见**（见 D2a 根因） |
| D3 模糊措辞 | 规则行首含"尽量/酌情/视情况"等不可判定词 | 1 处（知识陈述误报） |
| D4 重复块 | 跨 profile 5 行指纹重复 | 7 组（判定为合理同构，不修） |
| D5 死链 | markdown 链接目标存在性 | 0 |
| D6 失效命令 | bash 块中 hermes 子命令/脚本路径/DB 路径存在性 | **22 处**（hermes session→sessions、hindsight 无 CLI、kanban/current 非目录） |
| D7 引用-禁用矛盾 | SOUL 引用但被 profile config `skills.disabled` 禁用的 skill | 4 处（orchestrator 误伤核心 skill） |

### D2a skill 不可见的三大根因（审计实证）

1. **平铺不被索引**：索引器只收 `<skills_root>/<category>/<name>/SKILL.md` 二级结构；顶层平铺（`~/.hermes/skills/<name>/`）与 `_shared/skills/` 一律不可见。修法：profile 侧建 `skills/<category>/<name>` symlink 指向实体。
2. **config disabled 误伤**：profile `config.yaml` 的 `skills.disabled` 显式列表（历史瘦身）可能禁用了 rules 正在引用的 skill。修法：从列表移除 + 备份 config。
3. **heredoc/长命令触发终端 hardline block**：超 6 行的 inline python/shell 会被无条件拦（非审批层），存为脚本文件再跑。

### 修复纪律（审计实证教训）

- **symlink 操作前断言 src≠dst**（src==dst 会产生自指环，且 cp -cR 对 symlink 的克隆副作用会把环实体化）
- **master 实体放 `~/.hermes/skills/<分类>/`，profile 侧只建 symlink**——禁止 cp -cR 混用两机制
- **蓝军审查只认实测**：报告"已修"声明必须配 grep 归零/命令原样执行的证据，否则被打回（本轮 2 WARN 即因此）

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
