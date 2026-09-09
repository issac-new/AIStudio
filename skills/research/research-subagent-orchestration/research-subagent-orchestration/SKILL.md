---
name: research-subagent-orchestration
description: "Orchestrate parallel research subagents for multi-dimensional OSINT/research tasks: dispatch workstreams, recover data from interrupted subagents via transcript mining, re-dispatch with pre-collected context to avoid re-collection, and merge results with deduplication + verification columns. Use when dispatching 2+ parallel research subagents, when a subagent is interrupted (max_iterations/provider_error), or when merging partial reports from multiple subagents."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [research, subagent, delegate-task, osint, parallel, data-recovery, deduplication]
    related_skills:
      - deep-research-workflow
      - osint-asset-mapping
      - scope-discipline
      - cognition-self-check
---

# Research Subagent Orchestration

Patterns for dispatching, monitoring, recovering, and merging parallel
research subagents. Complements `deep-research-workflow` (which covers the
overall research workflow) with the specific subagent lifecycle patterns
discovered in the phlexing OSINT session (3 parallel subagents producing
40KB unified intelligence report).

## When to Use

- Dispatching 2+ parallel research subagents for different dimensions
  (e.g. subdomain/DNS + code-leak + personnel/shareholder)
- A subagent is interrupted (max_iterations, provider_error, timeout)
  before writing its output file
- Merging partial reports from multiple subagents into a unified report
- Re-dispatching a failed subagent without re-collecting the same data

## Core Patterns

### Pattern 1: Parallel workstream dispatch

Split research into independent, non-overlapping dimensions. Each subagent
gets a specific domain with clear boundaries:

```
delegate_task(tasks=[
  {"goal": "Subdomain expansion + DNS history + certificate SAN analysis",
   "context": "Target: phlexing.com. Use crt.sh, HackerTarget, RapidDNS. Zero target traffic."},
  {"goal": "Public code repository leak detection",
   "context": "Target: phlexing.com. Search GitHub/Gitee/GitCode for leaked code, hardcoded credentials, internal tool source."},
  {"goal": "Personnel academic footprint + shareholder network",
   "context": "Target: 贺青 (founder). Search DBLP/Semantic Scholar/arXiv for publications. Map investor network."}
])
```

**Boundary discipline**: Each workstream must be independent — no shared
mutable state, no sequential dependencies. If workstream B needs workstream
A's output, they should be sequential (not parallel) or A's output should
be passed as context to B.

### Pattern 2: Subagent failure modes and recovery

| exit_reason | Meaning | Data recoverable? | Action |
|-------------|---------|-------------------|--------|
| `completed` | Finished normally, wrote output file | No need — read the file | Verify + merge |
| `max_iterations` | Iteration budget exhausted mid-research | **Yes** — mine transcript | Extract data → re-dispatch with context |
| `provider_error` / `api_error` | LLM API failed after retries | **Yes** — mine transcript | Extract data → re-dispatch with context |
| `interrupted` | Runtime interrupted (timeout/user cancel) | **Yes** — mine transcript | Extract data → re-dispatch with context |

**Transcript mining**: The live transcript at
`~/.hermes/profiles/orchestrator/cache/delegation/live/<delegation_id>/task-N.log`
contains all tool call results. Extract with regex:

```python
import re

with open(transcript_path, 'r') as f:
    content = f.read()

# Extract structured data (repos, papers, DNS records, etc.)
# Pattern depends on data type — see deep-research-workflow for examples
```

### Pattern 3: Re-dispatch with pre-collected context (key innovation)

When re-dispatching an interrupted subagent, do NOT re-dispatch blindly.
Extract already-collected data from the transcript and pass it as context:

```
delegate_task(
  goal="...",
  context="""【上次已采集的数据（勿重复采集，在此基础上补充）】
1. <data point 1> — source: <where it came from>
2. <data point 2> — source: <where it came from>
...
【需要补充采集的维度】
A. <missing dimension A>
B. <missing dimension B>
【禁止】<constraints>
【输出格式】报告写入 <absolute path>"""
)
```

**Why this matters**: In the phlexing session, task-2 was interrupted at
1011s (max_iterations). Re-dispatching with 15 pre-collected data points
as context reduced re-collection time from ~15 min to ~8 min and avoided
duplicate work.

### Pattern 4: Merge with deduplication + verification

When multiple subagents produce partial reports:

```python
# 1. Extract data from each source
task0_data = extract_from_report("report0.md")      # completed
task1_data = extract_from_report("report1.md")      # completed
task2_data = mine_from_transcript("task-2.log")     # interrupted

# 2. Deduplicate across sources
#    - Same fact from multiple sources → keep one, note "多源验证"
#    - Conflicting facts → flag for manual review
#    - Unique facts → keep with source tag

# 3. Sort by risk/importance
#    🔴 High risk → 🟠 Medium → 🟡 Low → 🟢 Informational

# 4. Merge into unified report with verification column
#    Each data point: | 内容 | 验证方式 | 来源 |
```

**Verification discipline**: The Checker (orchestrator) must independently
verify each data point before including it. Never trust subagent self-reports
without cross-check. The verification column forces this discipline.

### Pattern 6: 中断成果回收四步法（kanban 重试场景，预算耗尽死法实证）

worker 因迭代预算耗尽（如 90/90）死在「调研完但产物零落盘」时，成果未丢，按序回收：
1. **心跳即恢复包**：kanban.db `task_events` 表 kind=heartbeat 的 payload.note 记录了 worker 的结构性发现（分类体系/ID 段位规律/方法验证）——回收这些写成 `recovery-context.md` 落盘工作区，别让重试 worker 从零探索
2. `kanban_comment` 注入重试卡：标「未读不开工」+ 指向恢复包 + 死因纪律两条（前 10 个工具调用内落产物骨架；先保验收下限再增量）
3. 效果基准：恢复包+纪律注入后重试可反超首跑（实证 27 分钟完成、产出超验收线 75%）
4. **产物内容级回收源**（worker 死后找全文时按此序试）：①bundled patch 文件含 new-file 全文，解析 unified diff 即可重建 ②worker profile 的 state.db（messages_fts_trigram 表 MATCH write_file 调用特征串，从 arguments JSON 提 content 字段）③会话日志 tool 记录只有字节数无内容，别浪费时间

注意：dispatcher 超时通知里的 `max_runtime=0s` 可能是展示 bug——真因查 task_runs.error 字段（如 Iteration budget exhausted），wall-clock 可能根本没到。

## Pitfalls

- **Do NOT re-dispatch blindly**: Without pre-collected context, the new
  subagent re-collects the same data, wasting time and tokens.
- **Do NOT trust subagent self-reports**: A subagent that claims "found X"
  may be wrong. The Checker must verify with independent tool calls.
- **Do NOT merge without deduplication**: Multiple subagents may find the
  same fact from different sources. Keep one instance, note "多源验证".
- **Do NOT skip the verification column**: Every data point must have a
  "验证方式" column. This is the anti-hallucination guard.

## Report Format

```
# <Target> 统一情报报告
> 生成时间 | 测绘方式 | 合规边界 | 验证方式

## 一、执行摘要 (risk-sorted table)

## 二、<Dimension 1> (task-0)
### 2.1 <sub-section>
### 2.2 <sub-section>

## 三、<Dimension 2> (task-1)
### 3.1 🔴 高风险发现
### 3.2 🟠 中风险发现

## 四、<Dimension 3> (task-2)
### 4.1 <sub-section>

## 五、风险评级汇总 (all findings, sorted by risk)

## 六、数据源与验证方法 (per-data-type verification)

## 七、合规声明 (zero-target-traffic confirmation)
```

## Related Skills

- **deep-research-workflow** — overall research workflow (fetch → dispatch → mine → merge)
- **osint-asset-mapping** — Chinese company OSINT asset mapping (7-layer report)
- **scope-discipline** — research-then-propose sequence enforcement
- **cognition-self-check** — pre-output quality gate
