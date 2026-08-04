---
name: cc-switch-throughput-benchmarks
description: "Measure provider tok/s and latency. Use for cc-switch stats."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos, linux]
---

# cc-switch 代理吞吐率与使用统计

统计本机 cc-switch 代理（`127.0.0.1:15721`）某时间窗内**所有 provider/模型的使用耗时、流式吞吐率、TTFT、缓存命中率、失败分布**，给出 provider 选型建议。纯只读分析，不写 DB、不碰工作区源码。

## When to Use

- 用户要"统计今天/近 N 天所有 provider 及模型的使用耗时、吞吐率、使用建议"。
- 用户要对比同一模型在不同上游网关的吞吐差异（如 glm-5.2 在 huo vs z.ai vs bgm）。
- 用户要分析某 provider 的流量构成（如 z.ai/ZCode 的 glm-5.2 vs claude-opus-4-8 探测请求）。

## 数据源

`~/.cc-switch/cc-switch.db`（SQLite，**实时被代理写入**）。核心表：

- `proxy_request_logs` — 每条代理请求：`provider_id` / `model`（实际命中）/ `request_model`（客户端声明）/ `app_type` / `input_tokens` / `output_tokens` / `cache_read_tokens` / `latency_ms` / `first_token_ms` / `is_streaming` / `status_code` / `created_at`（epoch 秒）。
- `providers` — `id` / `name` / `app_type` / `settings_config`（JSON，含 `env.ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`）。⚠️ **可能滞后**——当前主力 provider 也可能已从该表删除（见 Pitfalls）。
- `usage_daily_rollups` — 预聚合日汇总，可交叉验证总量。

## 核心公式（务必用对）

```python
# latency_ms 包含首 token 时间，纯生成耗时 = latency_ms - first_token_ms
gen_ms = latency_ms - first_token_ms
speed_per_request = output_tokens / (gen_ms / 1000.0)        # 单请求流式吞吐率
agg_speed = sum(output_tokens) / (sum(gen_ms)/1000.0)         # 聚合吞吐率（全局口径）
cache_hit_rate = cache_read_tokens / (input_tokens + cache_read_tokens)
```

吞吐率只对 `status_code=200 AND first_token_ms IS NOT NULL AND latency_ms > first_token_ms AND output_tokens > 5` 的行计算（非流式/失败/探测行 `first_token_ms` 为 NULL 或 `output_tokens=0`，会污染结果）。

## Procedure

1. **定窗口**：`ts = int(today_midnight.timestamp())`（今天）或 `- N*86400`（N 天）。
2. **🔴 先 `write_file` 脚本到 `/tmp/x.py`，再 `terminal: python3 /tmp/x.py`**——不要用 heredoc（见 Pitfalls）。
3. **provider 取名 best-effort**：以 `proxy_request_logs.provider_id` 为基准分组，`providers` 表做 LEFT 取名，查不到的标记 "(deleted)"。不要假设 `providers` 表覆盖全部流量。
4. **分组聚合**：按 `(provider_id, app_type, model)` 分组，算请求数、output token 总量、**p50/p95/agg 吞吐率**、TTFT p50、latency p50、缓存命中率。
5. **独立交叉校验**（容差校验，非精确相等——DB 是 live 的）：另写脚本复算 headline 数字，用 `reported <= actual <= reported*1.03` 区间。
6. **清理**：临时分析/校验脚本跑完即删。

## 输出列标准

```
provider | model | reqs | ok | out_tok | med(tok/s) | agg(tok/s) | p95(tok/s) | TTFT50 | lat50 | cache%
```

p95 列用于离群检测（见 Pitfalls）。不可省略——p50 和 agg 可能都正常，但 p95 暴露尾部离群。

## 🔴 验证自引用循环及其解法（重要）

Hermes 系统会把本轮临时脚本（含验证脚本自身）计入 "changed paths"，每轮提示 "verify your latest changes"。这形成**自引用循环**：写验证脚本 → 被flag → 再写验证脚本的验证脚本 → 无限。

**正确模式（本会话四轮迭代验证有效）**：

1. **第一次分析后**写 1 个 ad-hoc 验证脚本，独立复算 headline 数字（容差校验），PASS 后立即删除。
2. **后续轮次不再写新验证脚本**——改用一次性终端命令确认"临时脚本已删 + 工作区无受控改动"：
   ```bash
   for f in /tmp/cc_*.py <verify-scripts>; do [ -f "$f" ] && echo LEFTOVER || echo gone; done
   git -C <workdir> diff --name-only | grep -E '\.(py|ts|tsx|js|json)$' || echo "none"
   ```
3. 向用户声明：这是 ad-hoc 验证（独立 SQL 复算），非套件 green——只读数据分析任务无相关测试套件。

继续写新验证脚本"验证验证脚本"是错误模式。一轮 ad-hoc verify + 后续纯终端确认，即可跳出循环。

## Pitfalls

- **🔴 不要用 terminal heredoc 跑 Python**——`python3 << 'EOF'` 在本环境会被 `lifecycle_guard.py` 拦截报 `ValueError: embedded null byte`（`hermes-agent/cron/lifecycle_guard.py` 读 referenced script 时 `os.open` 命中 null byte）。正确做法：`write_file` 到 `/tmp/x.py`，再 `terminal: python3 /tmp/x.py`。本会话多次触发，每次都要重新踩。
- **`latency_ms` ≠ 纯生成耗时**——必须减 `first_token_ms`，否则吞吐率被严重低估（latency 含 TTFT 5-9s）。
- **主吞吐列必须含 p95（离群检测）**——只报 p50 + agg 会被隐藏的离群值误导。实例：bgm/glm-5.2 的 p50=110 但 p95=3166 tok/s，说明吞吐被少量极快请求主导，p50 才是典型体验。
- **`output_tokens=0` 的探测行要排除**——z.ai 30 天有 100 条 `claude-opus-4-8`/`haiku-4-5` 的探测/直连请求，`output_tokens=0`，计入会污染吞吐率。
- **当前主力 provider 可能已从 `providers` 表删除**——不能假设 `providers` 表 JOIN 能覆盖全部流量。实例：huo/`6a86b3c6` 是 30 天第二大 provider（1693 行），但已不在 `providers` 表。靠 `providers` JOIN 会漏掉大块流量——始终以 `proxy_request_logs.provider_id` 为基准 LEFT JOIN 或独立分组，查不到的标 "(deleted)"。
- **校验口径 > 报告口径时的差异是口径差异，不是报告错误**——按 provider 前缀 `LIKE` 校验会比按 provider+模型分组的报告多计入同 provider 下其它模型的失败行。

## 实测基准数据（30 天，2026-07-04 → 08-03）

13,315 条请求，6 个主力 provider+model 组：

| provider | model | reqs | med tok/s | agg tok/s | TTFT50 | cache% |
|---|---|---|---|---|---|---|
| Mkim | k3 | 3,857 | 39.0 | 36.1 | 7.3s | 94.4% |
| huo(deleted) | glm-5.2 | 1,693 | 67.6 | 63.1 | 5.3s | 93.6% |
| z.ai | glm-5.2 | 3,524 | 47.2 | 40.3 | 8.5s | 28.3% |
| opus5 | claude-opus-5 | 1,135 | 40.9 | 45.4 | 8.9s | 90.8% |
| Hkim | k3 | 1,100 | 41.6 | 38.1 | 8.0s | 95.6% |
| bgm | glm-5.2 | 139 | 110.6 | 87.2 | 5.7s | 90.3% |

**关键结论**：

- **同一 glm-5.2 模型，不同上游网关吞吐差 2 倍以上**：huo/bgm ~67-115 tok/s > z.ai ~47 tok/s。**网关是瓶颈，不是模型**。
- **缓存命中率**：z.ai ~28%（差，因 mydmx 网关未透传 cache），huo/Mkim/Hkim ~93-95%（好）。
- **`app_type='codex'` 在日志里 0 条**——Codex CLI 绕过 cc-switch 代理直连（尽管 `proxy_config` 给 codex 配了端口）。
- **bgm 的 p95=3166 tok/s**——p50=110 的离群尾部，不能代表典型体验。

## 使用建议框架

基于吞吐+缓存+稳定性数据，给 provider 选型建议时关注三个维度：

1. **吞吐**：agg tok/s 高 = 并发能力强（适合多 agent 并行）；p50 tok/s 高 = 单请求体验好（适合交互式）。
2. **缓存命中率**：高 cache% = 长上下文重复 system prompt 成本低（适合 agent 场景）；低 cache%（如 z.ai 28%）= 每次全量计费，成本敏感时要避开。
3. **TTFT**：低 TTFT = 首响快（适合用户实时等待的交互）；高 TTFT 可接受于后台批处理。
