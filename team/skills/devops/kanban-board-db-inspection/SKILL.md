---
name: kanban-board-db-inspection
description: 写脚本直读 kanban 板库做巡检/审计时用：immutable 单连接、探列名、fixture 双极性验证。
version: 1.0.0
metadata:
  hermes:
    tags: [kanban, sqlite, inspection, audit, patrol]
---

# Kanban 板库巡检脚本力学

写「直读 boards/&lt;slug&gt;/kanban.db 的巡检/审计/形状检查」类脚本时的库访问规则与验证纪律。
DAG 监督取证（update 窗口/停机续接/dispatch 输出解析）走 orchestrator-dag-supervision-forensics；
图的串并行判型规则在 kanban-orchestrator skill（default profile）。

## 库访问四规则（顺序即步骤）

1. **`sqlite3.connect(f"file:{db}?immutable=1", uri=True)`，不用 `mode=ro`** ——
   WAL 活跃库上 mode=ro 报 unable to open database file；immutable=1 稳定可重复。
   **例外——验「刚写入的行/终态」时必须用 `?mode=ro`**：immutable=1 走只读快照、
   **忽略 WAL 未 checkpoint 内容**，本进程/别的进程刚提交的行读不到（实测 2026-10-26：
   kanban_complete 后 immutable 查仍显 running，mode=ro 才见 done）。巡检历史库用
   immutable；验终态/对账刚落库的写用 mode=ro。
2. **一个库一次连接取全所有数据**。同一进程第二次 connect 同一库偶发 open 失败
   （巡检脚本的 flaky 根源）——父边、列名、行数据在同一次 open 里查完再 close。
3. **先 `PRAGMA table_info(tasks)` 探列名再拼 SQL**。各板 schema 有漂移：部分板
   无 `updated_at` 列——按探测结果回退 `created_at`，勿信统一 schema。
4. **单库失败降级不终止**：try/except sqlite3.Error → stderr WARN + continue；
   退出码契约 0=通过 / 1=有告警（供 loop run_step 消费，步骤行加 `|| true`
   让告警进步骤矩阵而不杀 loop）。

## 验证纪律：fixture 双极性

- **绿极**：真实板连跑 3 遍结果稳定（防 flaky）。
- **红极**：tmp 目录造合成库（tasks + task_links 两表），构造已知应告警的最小
  DAG（如三层单宽链），脚本 `--db &lt;fixture&gt;` 单库模式必须 rc=1 且打印告警行。
- 只验过一极的巡检脚本不算验证过。

## 部署物与数据形状

- 图形状检查器：`~/.hermes/bin/kanban_graph_shape_check.py`（非末层宽度&lt;2 告警
  ＋「≥2 父门控且验收项 ≥3」复拆提示），已接入夜间 loop 的 graph-shape 步；
  改它必须重跑双极性验证。
- task_links 表：child_id/parent_id 两列即父边全集；父卡终态（不在活跃集）
  视为边已解除，分层只用未决边。
- 验收项计数用 body 里 `- [ ]` 出现次数估算，仅作复拆提示权重，不作硬判据。
