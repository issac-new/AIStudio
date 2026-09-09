---
name: cost-ledger
description: 查 cc-switch 代理成本或预算告警时用：7天聚合+按模型/session 切片。
---

# Cost Ledger — 统一成本仪表盘

为全集群（所有 Hermes profile 共用同一个 cc-switch 代理）提供统一成本视图：
per-call USD 抽取 → 7 天聚合 → 分组切片 → 预算门 → reasoning_effort 联动。

**与 `cc-switch-usage-analytics` 的边界**：analytics 做 raw-log 历史的吞吐/缓存/失败率分析；
本 skill 是**统一成本聚合层**，只关心钱。验证方法论（live DB 容差、缓存命中陷阱、time window、
`provider_id='default'` 跨 app_type 碰撞）直接引用 analytics 的 §Correct methodology / §Verifying，
不复制实现。

## 0. 一键 ledger（推荐路径）

`scripts/ledger.py` 是本 skill 的可执行 CLI：直接查询 cc-switch.db 的
`proxy_request_logs`，输出 **7 天聚合 + 按模型 + 按 session** 三段 markdown 报表，
并按 `--budget-gate` / `--total-budget` 在超支项加 `[OVER]` 标记。

```bash
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py --since 7d
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py --since 30d --budget-gate 50
# 自定义阈值 / DB 路径
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py \
  --since 7d --budget-gate 20 --total-budget 1000 --db ~/.cc-switch/cc-switch.db
```

要点：
- 成本列是 TEXT，`ledger.py` 内部统一 `CAST(total_cost_usd AS REAL)`（适配本机 schema）。
- `--since` 支持 `7d` / `12h` / 原始秒数；窗口用本地 `date +%s`。
- 只读走 `file:...?immutable=1`，不锁 live 代理写入。
- 下文的 §1–§3 是等效的手动 sqlite 片段（便于审计/学习），生产用 `ledger.py` 即可。

## Data source (read-only!)
`~/.cc-switch/cc-switch.db` — 代理运行时**只读**访问。live DB 实时增长，任何验证一律用容差
（`>= 报告值 AND <= 报告值*1.03`），绝不精确相等。
- `proxy_request_logs`: `total_cost_usd`(TEXT usd), `provider_id`, `app_type`, `model`,
  `request_model`, `input/output/cache_read/cache_creation_tokens`, `session_id`,
  `created_at`(epoch s), `status_code`
- `usage_daily_rollups`: `date`, `app_type`, `provider_id`, `model`, `request_count`,
  `total_cost_usd`, token 列 — 可作为 rollup 交叉校验源

## 1. 7 天统一仪表盘

```bash
DB=~/.cc-switch/cc-switch.db
NOW=$(date +%s); START=$((NOW - 7*86400))

# 7 天总成本
sqlite3 "file:$DB?immutable=1" \
  "SELECT ROUND(SUM(CAST(total_cost_usd AS REAL)),4) \
   FROM proxy_request_logs WHERE created_at >= $START;"

# 7 天成本分组表 (provider_id, app_type, model)
sqlite3 -header -column "file:$DB?immutable=1" \
  "SELECT provider_id, app_type, model, \
          ROUND(SUM(CAST(total_cost_usd AS REAL)),4) cost, COUNT(*) calls \
   FROM proxy_request_logs WHERE created_at >= $START \
   GROUP BY provider_id, app_type, model ORDER BY cost DESC;"

# 按 app_type 汇总
sqlite3 -header -column "file:$DB?immutable=1" \
  "SELECT app_type, ROUND(SUM(CAST(total_cost_usd AS REAL)),4) cost, COUNT(*) calls \
   FROM proxy_request_logs WHERE created_at >= $START \
   GROUP BY app_type ORDER BY cost DESC;"
```
注：`provider_id` 是 UUID 串，需 JOIN `providers` 表取 display name；分组务必带上 `app_type`
（`provider_id='default'` 跨 app_type 碰撞）。本 skill 聚焦成本，不展开 name 解析——
需要展示名时调 `cc-switch-usage-analytics` 报表。

## 2. 预算门告警

读 `COST_LEDGER_BUDGET_USD` 环境变量或直接传参；超阈值高亮。

```bash
DB=~/.cc-switch/cc-switch.db
BUDGET=${COST_LEDGER_BUDGET_USD:-50}      # 默认 50 USD / 7天，按需覆盖
NOW=$(date +%s); START=$((NOW - 7*86400))
SPEND=$(sqlite3 "file:$DB?immutable=1" \
  "SELECT ROUND(SUM(CAST(total_cost_usd AS REAL)),4) \
   FROM proxy_request_logs WHERE created_at >= $START;")
echo "7d spend=$SPEND budget=$BUDGET"
awk -v s="$SPEND" -v b="$BUDGET" 'BEGIN{
  if (s+0 > b+0) printf "⚠️ OVER BUDGET by %.2f USD\n", s-b;
  else           printf "✅ within budget (%.2f/%.2f)\n", s, b }'
```
也可对照 `providers.limit_daily_usd / limit_monthly_usd`（DB 内 provider 级预算）做二次校验。

## 3. reasoning_effort 联动

目标：把近 N 天成本与 Hermes profile 的 `reasoning_effort` 分级对照，定位优化信号。

⚠️ **口径真相（实测）**：cc-switch 按**调用客户端应用**的 `app_type` 记账，本集群所有
Hermes profile 都走 `provider: custom:cc-switch` + `api_mode: anthropic_messages`，
因此**几乎全部 Hermes 流量落在 `app_type='claude'`**；`codex/opencode/claude-desktop`
来自直连代理的原生外部工具，非 Hermes profile。所以**无法做 per-profile 精确成本 join**，
只能做方向性联动：
1. 输出各 `app_type` 近 N 天真实成本（这是 DB 唯一的成本维度）。
2. 从 `config.yaml` 统计 Hermes 的 tier 分布（ultra/medium/low/none）。
3. 旗舰桶 `claude` 混合了多 profile 多 tier，标注其中 `tier∈{low,none}` 却跑在
   同一 premium 管线的 profile 作为优化候选。

```bash
python3 ~/.hermes/skills/devops/cost-ledger/scripts/cost_effort_linkage.py --days 7
```
脚本逻辑（`scripts/cost_effort_linkage.py`）：扫 `config.yaml` 抽 `reasoning_effort`（缺省 medium），
取 DB 各 `app_type` 成本，输出 app_type 成本表 + Hermes tier 分布 + 优化信号。
详见脚本内 HONEST 注释——**输出为方向性，不作精确计费**。

## 4. 时效说明
`created_at` 为 epoch 秒、本地时区。所有窗口用 `date +%s` 本地计算；需 UTC 对齐改 `date -u +%s`。

## 5. 引用 analytics methodology（不复制实现）
- **live DB 容差验证**：`>= reported AND <= reported*1.03`（§Verifying report numbers）。
- **缓存命中陷阱**：openai-format provider 缓存可能报 0%（reporting artifact）；成本口径以
  `total_cost_usd` 为准，避免误判。
- **作用域隔离**：`provider_id='default'` 跨 `app_type` 碰撞，分组必带 `app_type`。

## Pitfalls
- 不要写 cc-switch.db（代理运行时互斥/数据损坏）。只读走 `file:...?immutable=1`。
- 不要用 terminal heredoc 跑 python（环境 lifecycle_guard 报 `embedded null byte`）。
  写脚本到 `/tmp/x.py` 再 `python3 /tmp/x.py`，跑完清理。
- `total_cost_usd` 是 TEXT，聚合必须 `CAST(... AS REAL)`。
- 7 天窗口起点用本地 `date +%s`，与 analytics 口径一致。

## Scripts
- `scripts/ledger.py --since 7d [--budget-gate N] [--total-budget N] [--top N] [--db PATH]`
  统一成本仪表盘 CLI：7 天聚合 + 按模型 + 按 session 三段报表 + 超支 `[OVER]` 标记。
  **生产默认用这个**，已对真实 cc-switch.db 验证（见验收记录）。
- `scripts/cost_effort_linkage.py --days N`：reasoning_effort ↔ 成本联动分析（启发式分摊，方向性非精确计费）。

## 已知数据时效
- `usage_daily_rollups` 表在本集群**已停止更新**（实测 MAX(date)=2026-07-26，而
  live 流量持续到 2026-08-26）。因此**不要**拿它做交叉校验——它只会给出陈旧/偏低数字。
  本 skill 全部以 `proxy_request_logs`（实时、权威）为准；analytics 的 rollup 交叉校验
  在本机当前已失效，若未来 rollup 重新写入再启用。
