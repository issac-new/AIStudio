---
name: cost-ledger
version: 1.0.0
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
# 0.1 默认路径（保留旧 flat CLI；不传子命令走默认 ledger）
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py --since 7d
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py --since 30d --budget-gate 50
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py \
  --since 7d --budget-gate 20 --total-budget 1000 --db ~/.cc-switch/cc-switch.db

# 0.2 子命令路径（推荐；按子命令分配职责）
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py ledger --since 7d
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py alert \
    --threshold 2x_median --window 1d --baseline 7d
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py forecast \
    --horizon 30d --baseline 30d --budget 1000
```

子命令 `alert` 与 `forecast` 是 path-C（observability 融合）2026-10-19 增量；
保留旧 flat CLI 与 `--since/--budget-gate` 完全兼容，**不破坏向后兼容**。

要点：
- 成本列是 TEXT，`ledger.py` 内部统一 `CAST(total_cost_usd AS REAL)`（适配本机 schema）。
- `--since` 支持 `7d` / `12h` / 原始秒数；窗口用本地 `date +%s`。
- 只读走 `file:...?immutable=1`，不锁 live 代理写入。
- 下文的 §1–§3 是等效的手动 sqlite 片段（便于审计/学习），生产用 `ledger.py` 即可。

## 0.3 Alert subcommand（path-C，2026-10-19 新增）

`ledger.py alert` 在不引入新依赖的前提下扩展为成本尖峰探测器：

```bash
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py alert \
    --threshold 2x_median \
    --window 1d \
    --baseline 7d \
    [--db PATH]
```

退出码（与 cost-ledger/eval-calibration 现有惯例一致）：

- 0 = 正常（无尖峰）
- 1 = 尖峰：`[SPIKE]` 标记，触发阈值
- 2 = 脚本崩溃（IO/参数错误）

行为：
1. 计算当前 `--window` 内总成本（半开区间 `[now-window, now)`）。
2. 将 `--baseline` 等分为 N 段（同 `--window` 长度的桶），取各桶总成本的中位数。
3. 阈值是**相对值**（如 `2x_median`），不是绝对 USD——观察报告 §04 明文
   「告警阈值应基于系统自己的基线漂移」。因此 `--threshold 100` 这种
   绝对值会被判为反模式（虽然语法支持，但偏离文章要求）。
4. 触发条件：`current > median × threshold`（仅当 median > 0；baseline 中位
   数为 0 时打印 `[NOTE]` 并 rc=0，因为没有可比基线）。

最小用例：

```bash
# 在合成 fixture 上验证 spike 触发 + 不触发 + 多阈值倍数：
python3 ~/.hermes/skills/devops/cost-ledger/scripts/selftest.py
# 期望：19 passed, 0 failed, rc=0
```

## 0.4 Forecast subcommand（path-C，2026-10-19 新增）

`ledger.py forecast` 用 stdlib 简单线性回归做下 `--horizon` 成本预测：

```bash
python3 ~/.hermes/skills/devops/cost-ledger/scripts/ledger.py forecast \
    --horizon 30d \
    --baseline 30d \
    [--budget 1000] \
    [--db PATH]
```

行为（与文章口径一致）：
- 方法：stdlib `linear_regression`（裸最小二乘）；**不是 ARIMA / PROPHET / PyTorch**——
  文章 §04 明确「不应引入额外依赖」。脚本头会打印 `NOT ARIMA/PROPHET, stdlib only`。
- 输入：`--baseline` 窗口内每日成本序列（至少 2 天）。
- 输出：每日点预测 + 95% 区间（Wilson 简化版 ±1.96×残差 sigma）。
- 不触发任何告警——只输出预测供人工/上层评审（orchestrator/cron 决定下一步）。
- `--budget` 可选：若 30d 总预测 > budget，打印 `[OVER]` 标记；不接 webhook / 不发邮件。

最小用例：

```bash
python3 ~/.hermes/skills/devops/cost-ledger/scripts/selftest.py
# 包含 forecast_test_4 / forecast_test_5 验证表行数 / 斜率 / 错误退出码。
```

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

口径提醒：套餐制 provider（`settings_config.usage_script.templateType=token_plan`，如 Kimi
coding plan）按次/按套餐计费，`total_cost_usd` 只是名义值——预算门对它们报「超支」不等于
真实超支，先过 `llm-usage-cost-audit` 的计费模式确认再下结论。

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
- `~/.hermes/bin/channel-cost-audit.py [--days N] [--threshold PCT] [--input-threshold N] [--json OUT]`
  按 provider+model 维度的缓存命中率 + 均成本审计。补 ledger.py 的盲区：识别"低缓存命中率大输入"反常通道（来源：rsi-harness 调研 §5 P0-1，2026-10-19）。
  默认阈值：缓存命中 <60% 且均输入 >10k 标 `[复查]`。仅读 cc-switch.db。
- `~/.hermes/bin/soul-budget-check.py [--profile NAME] [--soft N] [--hard N] [--json OUT]`
  profile SOUL.md always-on 字符预算审计（来源：rsi-harness 调研第三波 B 任务，p1-7 组件对账 D1，2026-10-19）。
  实测分布（2026-10-19，49 profile）：median=13,123 / p90=20,069 / max=24,402 chars。
  阈值 SOFT>20000（p90）/ HARD>24000（harness2 OpenCode 同限）；超阈警告不阻断
  （本集群 SOUL 比 harness2 always-on 角色更重，硬阻断破坏现有工作能力）。
  rc=1 表示有 profile 超阈（供 cron/CI 判定），只读不改 SOUL。

## 已知数据时效
- `usage_daily_rollups` 聚合持续滞后 live 且节奏不定（MAX(date) 长期落后 live 数周）。
  任何 rollup 交叉校验前先 `SELECT MAX(date) FROM usage_daily_rollups` 核新鲜度——
  落后即弃用，勿拿陈旧 rollup 否决 live 数字。本 skill 全部以 `proxy_request_logs`
  （实时、权威）为准。
