---
name: batch-llm-concurrency-ops
version: 1.0.0
author: Hermes Agent (orchestrator)
description: "Shape batch LLM concurrency under upstream rate limits."
metadata:
  hermes:
    tags: [llm, concurrency, rate-limit, capacity, batch, circuit-breaker]
    related_skills: [cc-switch-failover-ops, cc-switch-stats-analysis, nightly-radar-runbook]
---

# batch-llm-concurrency-ops — 批量 LLM 任务并发预算与整形

适用于：夜间/批量/多域并行类 LLM 任务上线或扩容前的容量判定；上游限流（429）风暴的
归因与缓解。核心模型：上游有**并发安全域**（本舰队口径 GLM-5.3-Flash = 40），超限即
429 风暴 → 熔断雪崩。目标是让任何新负载上线前就能算出它对在飞并发的贡献。

## 上线前并发账（必算，不做凭感觉扩容）

**稳态在飞 ≈ 每分钟到达数 × p50 延迟（Little's Law）**。叠加舰队常驻基线后必须显著
低于上游安全域，留重试余量。数据库口径（cc-switch）：

```sql
-- 到达率: 每分钟 ok 数
SELECT strftime('%H:%M', created_at, 'unixepoch', 'localtime') AS m, count(*)
FROM proxy_request_logs WHERE status_code=200 AND model='<model>'
  AND created_at BETWEEN <ts0> AND <ts1> GROUP BY m;
-- p50 latency: OFFSET 技巧（sqlite 无百分位）
SELECT latency_ms FROM proxy_request_logs WHERE status_code=200 AND model='<model>'
  AND created_at BETWEEN <ts0> AND <ts1> ORDER BY latency_ms
  LIMIT 1 OFFSET (SELECT count(*)/2 FROM proxy_request_logs WHERE ...);
```

小请求也拖出高 p50 = 上游已过载的信号，不是负载特征。**429 被拒的请求同样占连接**——
重试风暴自己抬高并发水位，构成「越熔断越重试」的放大器；算容量时把重试计成额外到达。

## 整形四杠杆（按优先级，源头优先）

1. **管道咽喉串行闸**：批量管道的唯一 LLM 入口函数加全局 flock——管道自身恒 +0 并发，
   不与舰队负载共振。这是结构性防线，先于一切调参。
2. **调度共振消解（时间轴）**：多 profile 周期任务对齐整点（:00）会在同一分钟叠加突发
   并发——错峰是零成本容量。跑 `scripts/scan_schedule_resonance.py` 列出 ≥3 共振的
   (hour,minute) 槽位，逐个 +1~+13 分钟错开（避开既有分钟），复跑应为空。注意扫描器
   必须兼容 dict 格式 schedule（跨 profile jobs.json 两种格式混存，字符串正则会静默漏）；
   直改 jobs.json 的 expr 是安全路径（scheduler 自动 re-anchor，见 cron-job-management）。
3. **舰队派发基线降档**：worker 并发基线压到安全域的 1/4 以下（本舰队 8 派发/3 编队），
   dispatcher 热加载生效，改配置不用重启。
4. **熔断降档阈值放宽**（如 4/2→6/2→8/1）：只作最后手段——闸门已防淹没，降档敏感化
   反而增加无谓停摆。

**退避必加抖动**：429 backoff 乘 `random.uniform(0.7, 1.3)`——同步重试波会把上游偶发
过载放大成雪崩，固定间隔退避是雪崩推手。

## 风暴形态判读（先证明异常，再优化）

- **token 分桶**：input_tokens 分层 probe<100 / 小单发<3k / 中 3k-30k / 大>30k——先分桶
  再评估「省调用」空间；探针噪音与真实负载混在一起读总数必误判。
- **session 形态**：每 session_id 仅 1-2 请求 = 无状态单轮调用 fan-out 的**常态形态**，
  不是会话泄漏；非流式是单轮结构化生成的正确选择，不是病灶。别把常态当优化对象。
- **深夜风暴归因三板斧**：① 同窗 kanban task_events 事件数（零事件 → 非 dispatcher
  派工）→ ② 各 profile `logs/agent.log` 会话加载时间戳（多 profile 周期任务时间共振
  才是叠加源）→ ③ cc-switch `app_type` 分布（claude/codex 端点分流定位调用方族群）。

## 用量对账纪律

代理日志只覆盖经 cc-switch 的流量：ACP 直连与 anthropic-direct 都**绕过代理不可见**。
报「某管道/某时段用量」必须三源合账：调度侧设计值（管道步骤数 × 每步调用数）+ cc-switch
计费份额 + token-meter 实测；单看代理日志会把主通道流量漏成「全走计费」的假象。

## 本舰队数字基线（改动需重测）

- 上游并发安全域：GLM-5.3-Flash = 40
- worker 派发基线：8 派发 / 3 编队（自 12/4 降档）
- 夜间统一管道设计值：≈11 次 LLM 调用/晚（主雷达 1 + 8 域 + [已移除] 1 + brief 1），咽喉串行
