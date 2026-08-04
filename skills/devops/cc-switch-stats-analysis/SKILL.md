---
name: cc-switch-stats-analysis
description: "Analyze cc-switch proxy logs: usage time, throughput, cache."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
---

# cc-switch 代理数据统计分析

统计本机 cc-switch 代理（`127.0.0.1:15721`）某时间窗内**所有 provider/模型的使用耗时、吞吐率、缓存命中率、失败分布**。与 `cc-switch-monitoring`（default profile，实时监控 + TUI widget + 余额查询）互补——本 skill 只做**离线统计分析**，不做实时监控。

## When to Use

- 用户要"统计今天/近 N 天所有 provider 及模型的使用耗时、吞吐率、使用建议"。
- 用户要对比同一模型在不同上游网关的吞吐差异。
- 用户要分析某 provider（如 z.ai / Codex）的流量构成。

## 数据源

`~/.cc-switch/cc-switch.db`（SQLite，**实时被代理写入**）。核心表：

- `proxy_request_logs` — 每条代理请求：`provider_id` / `model`（实际命中）/ `request_model`（客户端声明）/ `input_tokens` / `output_tokens` / `cache_read_tokens` / `latency_ms` / `first_token_ms` / `is_streaming` / `status_code` / `app_type` / `created_at`（epoch 秒）。
- `providers` — `id` / `name` / `app_type` / `settings_config`（JSON，含 `env.ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`）。
- `usage_daily_rollups` — 预聚合的日汇总（可交叉验证总量）。

**完整列含义、复算公式、实测怪癖见 `references/cc-switch-stats-analysis.md`。**

## 核心公式（务必用对）

```python
# latency_ms 包含首 token 时间，纯生成耗时 = latency_ms - first_token_ms
gen_ms = latency_ms - first_token_ms
speed_per_request = output_tokens / (gen_ms / 1000.0)        # 单请求流式吞吐率
agg_speed = sum(output_tokens) / (sum(gen_ms)/1000.0)         # 聚合吞吐率
cache_hit_rate = cache_read_tokens / (input_tokens + cache_read_tokens)
```

只对 `status_code=200 AND first_token_ms IS NOT NULL AND latency_ms > first_token_ms AND output_tokens > 5` 的行算吞吐率（非流式/失败行 `first_token_ms` 为 NULL，会污染结果）。

## Procedure

1. **定窗口**：`ts = int(today_midnight.timestamp())`（今天）或 `- N*86400`（N 天）。
2. **映射 provider**：`SELECT id, name, app_type FROM providers`；同名 `default` 要带 `app_type` 区分（`claude`=Mkim / `claude-desktop`=Kimi）。
3. **分组聚合**：按 `(provider_id, model)` 分组，算请求数、output token 总量、中位/聚合吞吐率、TTFT p50、缓存命中率。
4. **独立交叉校验**：另写脚本复算 headline 数字。⚠️ **DB 是 live 的，校验用容差（`reported <= total <= reported*1.03`），不要断言精确相等**——两次查询之间会有新请求进来。
5. **清理**：临时分析/校验脚本跑完即删；只读任务，不碰工作区受控源码。

## Pitfalls

- **`latency_ms` ≠ 纯生成耗时**——必须减 `first_token_ms`，否则吞吐率被严重低估。
- **p50 与 agg 可能差很多**——长输出请求会拉偏聚合值；报告时两个都给。
- **`output_tokens=0` 的探测行要排除**——z.ai 30 天有 100 条 `claude-opus-4-8`/`haiku-4-5` 的探测/直连请求，`output_tokens=0`，计入会污染吞吐率。
- **已删除 provider 的日志残留**——`provider_id` 在 `providers` 表里查不到时标记为"已删除 provider"，其大量 403 是删除后仍被调用的痕迹。
- **校验口径 > 报告口径时的差异是口径差异，不是报告错误**——按 provider 前缀 `LIKE` 校验会比按 provider+模型分组的报告多计入同 provider 下其它模型的失败行。

## 实测结论（30 天，2026-07，详见 references）

- **`app_type='codex'` 在日志里 0 条**——Codex CLI 绕过 cc-switch 代理直连（尽管 `proxy_config` 给 codex 配了端口）。
- **同一 glm-5.2 模型，不同上游网关吞吐差 2 倍以上**：huo/bgm ~67-115 tok/s > z.ai ~47 tok/s。**网关是瓶颈，不是模型**。
- **缓存命中率**：z.ai ~28%（差），huo/Mkim/Hkim ~93-95%（好）。
