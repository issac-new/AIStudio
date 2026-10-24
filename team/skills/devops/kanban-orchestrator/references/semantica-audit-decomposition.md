# Semantica Audit → Kanban Decomposition Pattern

> 来源：2026-08-29 Semantica (开源版 Palantir) 源码审计 + Hermes 本机语义层差距分析

## 背景
当需要对照外部参考实现（如 Semantica = 开源版 Palantir 确定性语义底座）审计本机语义层，并将差距分解为 Kanban 任务时，使用此模式。

## 核心流程

### 1. 源码级参考实现审计
```bash
# 克隆并轻量审计
cd /workspace
 git clone --depth 1 https://github.com/semantica-agi/semantica.git
 find semantica -name '*.py' | wc -l  # 356 files, 188k LOC
 # 关键子系统：provenance, context, ontology, deduplication, reasoning, mcp_server
```

### 2. 本机真实状态直查（禁推断）
```bash
# 逐项 sqlite/文件/grep 实测
for b in swarm hack product ops [已移除] platform [已移除]; do
  sqlite3 ~/.hermes/kanban/boards/$b/kanban.db "SELECT count(*) FROM tasks WHERE markings LIKE '%AMBER%'"
done
# markings 零实战：7 board 各 1 task 且全 TLP:GREEN，0 个 AMBER/RED/PII
# clearance_gate 未接入活路径：grep 0 行调用
```

### 3. 差距映射到 8 类优化工作流
| 参考实现能力 | 本机缺口 | 分解任务 | 优先级 |
|------------|---------|---------|--------|
| 本体是运行时地基 (MCP) | 门未接活路径 | P1 接电 clearance_gate+ontology_validate | 🔴 |
| 向量≠语义/混合检索 | 纯关键词检索 | P2 skill 检索链加 ontology 图谱遍历 | 🟠 |
| 溯源=证据 (PROV-O) | markings 仅 GREEN | P3 敏感任务强制 marking + provenance | 🔴 |
| 双时态/价值流 | 仅 intake/execute 可观测 | P4 task_events 补 verify/retrospect | 🟠 |
| 机器起草人把关 | OEL cron 未挂 | P5 注册 oel_aggregate 周 cron | 🟡 |
| 一致性治理/实体解析 | 4.5× skill 重复 | P6 skill 去重 170 目录 | 🔴 |
| 契约版本化 | ontology.md 无 git | P7 ontology.md 进 git subtree | 🟡 |
| 上下文瘦身 38k→12k | 596KB SOUL 常驻 | P8 ontology 驱动按需注入 | 🟡 |

### 4. Kanban 分解模板（8 任务并行 + 依赖）
```python
# 父卡：Program 卡（triage，规约完备）
parent = kanban_create(
    title="[Program] Semantica 启示→语义层落地补齐",
    assignee="platform-ontology-curator",
    body=PROGRAM_BODY,  # 含 frozen 验收标准
    triage=True,
    workspace_kind="dir",
    workspace_path="/workspace/research",
)

# 子卡 7 个（platform 板）
children = [
    ("P1 接电活路径", "platform-ontology-curator", P1_BODY, [parent]),
    ("P2 混合检索 PoC", "platform-ontology-curator", P2_BODY, [parent]),
    ("P3 溯源实战", "platform-ontology-curator", P3_BODY, [parent]),
    ("P4 价值流全阶段", "platform-skill-miner", P4_BODY, [parent]),
    ("P5 OEL 周 cron", "platform-ontology-curator", P5_BODY, [parent]),
    ("P6 skill 去重", "platform-skill-miner", P6_BODY, [parent]),
    ("P7 ontology 进 git", "platform-ontology-curator", P7_BODY, [parent]),
]
# P8 独立卡（swarm 板，orchestrator 执行）
kanban_create(
    title="[P8] ontology 驱动按需注入",
    assignee="orchestrator",
    board="swarm",
    body=P8_BODY,
    parents=[parent],
)
```

### 5. Staged Action for 共享运行时改动
**P1 接电 kanban_tools.py** 和 **P7 ontology.md 进 git** 均为 `reversible=false` shared_state：
- 必须 `kanban_comment` 提交 `<staged-action-proposal>`
- 含 diff、影响范围、回滚命令、预计后果
- `kanban_block(kind=needs_input)` 等 orchestrator 确认
- 确认后 ACP (`provider=claude`) 定点 patch
- 验证后 `kanban_complete(evidence_strength=exercised)`

### 6. 关键验收标准
- P1: `p9_marking_drill 6/6` + AMBER 任务放行/拦截断言
- P3: 真实 PII/AMBER 任务 complete 前被门校验
- P6: `worldmonitor-intel` 嵌套 ≤1 层，全集群 77 独立名
- P7: `git log -- ontology.md` 可见 commit
- P8: A/B 实测 token 降幅 ≥89%

## 实战要点
- 父卡 `triage` 完备后 complete → 子卡自动 `promote` → dispatcher 派发
- P1/P6 并行最长（30-60 min），决定整体窗口
- P1 是全链路供电开关，其完成后 P3 markings 才真实生效
- 跨板依赖用 `parents=[parent_id]` + 子卡 body 注入 parent 信息（勿用 `kanban_link` 跨板）