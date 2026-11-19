# 05 执行轨迹可归因日志（D5）

矩阵映射：P0-16 TRACESAFE-BENCH 执行过程评测（`research/moanju-fusion/research-slices/p0-claims.md`）；承接 D1 闸门决策输出。

## 机制说明

为每次工具调用写 append-only JSONL 审计事件，字段：

```
ts (UTC ISO8601) | caller | tool | params_hash (SHA-256) |
output_summary (≤120 字符截断) | decision (allow/deny) | gate_reason
```

- **params 全文、output 全文不落盘**——只落哈希与截断摘要；
- 落盘前强制过模块 04 同源 redactor，日志文件中不出现明文 secret（fixture 实测断言）；
- `verify` 子命令重放校验 JSONL 完整性（每行合法 JSON），供审计归因复现。

## fail-closed 原则

- 事件缺 caller/tool/params/decision 任一字段 -> 拒绝记录（不写半条事件），exit 1。
- decision 非 allow/deny -> 拒绝记录。
- 历史日志存在非法 JSON 行 -> 判定篡改嫌疑，**停止追加**（ValueError: tamper_suspected），exit 2。
- params JSON 解析失败 -> exit 2。
- 日志目录不可写 -> OSError 上抛，exit 2，不静默丢弃审计事件。

## 命令

```bash
# 记录一条（正面）-> exit 0
python3 05-execution-trace-audit/gate.py record --caller worker-a --tool file_read \
  --params '{"path":"README.md"}' --decision allow --log /tmp/trace.jsonl

# 记录一条 deny（D1 闸门拒绝事件）-> exit 0
python3 05-execution-trace-audit/gate.py record --caller worker-a --tool file_delete \
  --params '{"path":"/tmp/x"}' --decision deny --gate-reason high_risk_headless --log /tmp/trace.jsonl

# 缺字段（反面）-> exit 1
python3 05-execution-trace-audit/gate.py record --caller w --tool t \
  --params '{}' --decision maybe --log /tmp/trace.jsonl

# 完整性校验
python3 05-execution-trace-audit/gate.py verify --log /tmp/trace.jsonl

# 全部 fixture：python3 05-execution-trace-audit/test_gate.py
```

## fixture 清单（test_gate.py，10 例全过）

| 类 | 用例 | 期望 |
|---|---|---|
| 正 | valid_event_recorded | recorded=true, hash=64hex, ts=UTC |
| 正 | params_hash_reproducible | 同 params -> 同 hash（SHA-256 可复现） |
| 正 | secret_not_in_log_file | 日志文件不含明文 secret |
| 正 | output_summary_truncated | 摘要 ≤120+3 字符 |
| 正 | verify_log_integrity | 2 事件 intact |
| 反 | missing_field_rejected | recorded=false |
| 反 | bad_decision_rejected | recorded=false |
| 反 | tampered_history_refuses_append | ValueError tamper_suspected |
| CLI | bad_params_exit_2 | exit 2 |
| CLI | record_exit_0 | exit 0 |

## 关键决策

- 只记哈希不记原文：审计可归因（重放比对 hash）而不泄密，对齐矩阵"不落任何明文 secret"。
- redactor 以路径导入模块 04（`04-secret-minimal-exposure/gate.py`），单一事实源，避免两处 pattern 漂移。
- append-only + 追加前全文件 JSONL 校验：篡改检测的最小实现（哈希链属 P1 范围，本卡不做）。
