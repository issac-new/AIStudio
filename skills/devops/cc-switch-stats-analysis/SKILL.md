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

- **`input_tokens` 列存在语义混录，聚合 fresh 输入前必须按 `input_token_semantics` 列归一**：0 = input 不含 cache（fresh=input）；1 = input 已含 cache_read+cache_creation（fresh=input-crt-cct）；2 = 未声明/混合，内部两种语义并存（input<crt 与 input≥crt+cct 的行都大量出现）——直接 SUM 会把 cache 双计或漏计，fresh 输入可差近一倍。sem=2 的行按两种口径都算、报告给区间；不得假设全库单一语义。zcode `model_usage.input_tokens` 实测恒含 cache（input<cache_read 行数=0），fresh 同样 = input−两cache。折算流量字节时 cache_read 也走上行（Anthropic 式无服务端缓存复用 = 每请求重传全部上下文，cache 常占输入 90%+），fresh 与 cache 都乘上行系数。
- **sqlite3 CLI 与 Python sqlite3 的 SQL 方言有差异**：CLI 不认科学计数法字面量（`1e6.0`/`1e9`），该表达式求值为 NULL，整列输出空串——不报错、不返回行，极易误判「无数据」；Python sqlite3 认。shell 内嵌查询一律用整数除法 `/1000000`，别用 `/1e6`。另 `GROUP BY x HAVING MAX(y)` 不是「取每组最新行」，静默返回 0 行；取最新行必须 `JOIN (SELECT task_id, MAX(id) FROM ... GROUP BY task_id)`。计数=0 且明细=0 的自相矛盾结果先修查询，勿下「全部成功」结论。
- **非 Hermes 客户端也会打满额度**：额度异常时先 `lsof -nP -iTCP:15721` 找常驻 LLM 客户端。Hindsight API（launchd 常驻）曾以旗舰模型把全集群 retain 记忆抽取流量打到 cc-switch，单日 2300+ 次吃穿订阅额度。**非流式 + avg_in~3k/avg_out~440 是记忆抽取指纹**（真 agent 会话是流式 avg_in 8 万+）。模型/版本/重启细节归 `hindsight-model-configuration` skill，同步脚本细节归 `hindsight-cross-bank-sync` skill——本 skill 只负责"额度被谁打穿"的定位。修复验证同口径：切换模型后按**原 provider+model** 的请求计数应归零——cc-switch 按模型名分队列，切模型即换通道。
- **Hindsight 侧有精确账本**：额度定位到 Hindsight 后，深入查 PostgreSQL `llm_requests` 表（scope/bank/status/token 齐全）按 `started_at::date` 分组——比 cc-switch 日志更准（含失败重试行）。daemon 侧调用量三层放大：抽取按文档触发（重复导入也重新抽取）、批量导入=每文档≥1 次抽取、额度打穿后失败重试继续撞墙。
- **SQLite 时间过滤用 `datetime(created_at,'unixepoch','localtime') >= 'YYYY-MM-DD HH:MM:SS'` 字符串比较**——`strftime('%s',...,'localtime')` 与 epoch 整数混算会双重时区换算，静默返回空结果（不报错，极易误判为"无流量"）。
- **`latency_ms` ≠ 纯生成耗时**——必须减 `first_token_ms`，否则吞吐率被严重低估。
- **p50 与 agg 可能差很多**——长输出请求会拉偏聚合值；报告时两个都给。
- **`output_tokens=0` 的探测行要排除**——z.ai 30 天有 100 条 `claude-opus-4-8`/`haiku-4-5` 的探测/直连请求，`output_tokens=0`，计入会污染吞吐率。
- **已删除 provider 的日志残留**——`provider_id` 在 `providers` 表里查不到时标记为"已删除 provider"，其大量 403 是删除后仍被调用的痕迹。
- **校验口径 > 报告口径时的差异是口径差异，不是报告错误**——按 provider 前缀 `LIKE` 校验会比按 provider+模型分组的报告多计入同 provider 下其它模型的失败行。
- **provider_id='default' 名字碰撞制造「假镜像」统计假象（2026-10-02 实测）**——按 name 聚合或子查询 `WHERE name='X'` 时，claude 与 claude-desktop 两个不同 provider 同名会被合并/错配，得出「两 provider 每日请求数完美相等」的双倍假象；用 uuid 原值 + input_tokens 相等且 dt<10s 配对验证立刻归零证伪。凡按 provider 对比流量，一律用 uuid 原值，禁用 name JOIN/子查询。
- **zcode-cli 完全绕过 cc-switch 直连 bigmodel，代理日志零可见（2026-09-27 实测）**——「代理上某 provider 今天 0 请求」≠「该账号今天没消耗」。排查手法：① `dig +short open.bigmodel.cn`（解出 39.106.105.100/47.94.131.76 等 GA 入口）→ ② `lsof -nP -iTCP@<ip>` 找直连进程；③ zcode-cli 自带精确账本 `~/.zcode/cli/db/db.sqlite` 的 `model_usage` 表（**`started_at` 是毫秒 epoch**，按天过滤用裸数值直比，别用 strftime 秒级函数——秒级过滤会静默返回空集，把全历史当今日账）；④ 其流量分三类 provider_id：`bigmodel-api`（**注意：实机 2026-10-02 核实为 `zhipu-coding-plan-api-key` 套餐 key（zcode 显示名 SGLM），走 coding plan 额度池，并非按 token 计费的裸 API——勿按 token 计费口径误判成本**；单发 input 仍可达 50-80 万）、`account:bigmodel-*-plan`（订阅套餐额度池，与 cc-switch 里的 coding-plan provider 同一账号额度）、`builtin:bigmodel-coding-plan`；⑤ zcode 的 goal 模式会话跨天常驻、开机自动恢复（boot 后 ~33 秒即建新 /goal 会话），mode=yolo 下 subagent 扇出（zcode-general-purpose/Explore）放大调用量——「额度偷偷掉」优先查这里；⑥ 会话级治理红线（用户裁决）：单会话 24h token 超 8 亿只经 peak-guard 弹提醒，禁自动 compact/挂起——自动刹车会打断用户在跑的会话；治理对象限定无人值守的 goal 常驻会话。

## 计费口径决定优化方向（2026-09-21 SRK 案）

- **cc-switch 显示的 $ 是名义计价，不是实际支出**——包月套餐（如 SRK 68元/2000次/日）按次数计费，token 量再大也是 1 次。分析前先问用户各 provider 的真实计费模式，否则成本排名会整体颠倒。
- **按次计费的 provider 应吃满日配额**：利用率低=浪费月费。流量倾斜目标是「配额内用满最便宜的按次通道 → 溢出到按 token 计价的通道」，而非一味压调用数。
- **路由真相（本机实测）**：请求日志里的 `provider_id`/`model` 是**最终承接者**；failover 链主力吃满配额前，请求都记在它名下。403 只写 `provider_health`（连败计数），**不落请求日志**——「日志里没有 403」≠「没失败」。
- **改 is_current 无效且有害**：cc-switch auto-failover 在 current 不健康时自动改写 is_current（DB+settings.json 双写），且应用退出时把内存态写回覆盖磁盘改动。正确做法 = 调 failover 队列优先级（sort_index / in_failover_queue），current 让应用自己管。
- **熔断自愈链路**：failover 引擎对熔断中的 provider 每请求持续试探（不落日志），health 连败持续增长。日配额类 403 在 0 点重置后自动恢复承接——验证脚本 `~/.hermes/bin/srk_quota_reset_check.py` + cron 08:35 判定 RECOVERED/NOT_RECOVERED。

## 实测结论（30 天，2026-07，详见 references）

- **`app_type='codex'` 在日志里 0 条**——Codex CLI 绕过 cc-switch 代理直连（尽管 `proxy_config` 给 codex 配了端口）。
- **同一 glm-5.2 模型，不同上游网关吞吐差 2 倍以上**：huo/bgm ~67-115 tok/s > z.ai ~47 tok/s。**网关是瓶颈，不是模型**。
- **缓存命中率**：z.ai ~28%（差），huo/Mkim/Hkim ~93-95%（好）。
