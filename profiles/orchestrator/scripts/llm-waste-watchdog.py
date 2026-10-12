#!/usr/bin/env python3
"""llm-waste-watchdog: token 浪费三信号巡检（W1/G/W2-外显）

信号（阈值可 env 覆盖，默认按 2026-10-03 token 审计基线定）:
  S1 失败风暴: cc-switch 近1小时非200 > FAIL_STORM_HOURLY(默认200) 且失败率>50%
     → 撞墙重试未熔断（对应审计 W1: 30天16.1万发白撞）
  S2 空烧: 近24h status=200 且 output=0 且 input>1000 的请求数 > ZERO_OUT_DAILY(默认30)
     → 白烧指纹（对应审计 W3: 3755发/104M token）
  S3 hindsight 日预算: 近24h llm_requests 总数 > HINDSIGHT_DAILY_CAP(默认800)
     → consolidation/retain 风暴（对应 10-02 反弹: 6086 次）
  S4 zcode 跨天常驻会话: 近24h 有会话 input+cache > ZCODE_SESSION_BUDGET_M(默认3000M)
     → goal 会话常驻重放（对应审计 W2: top1 会话 2707M/4天）

输出: 逐信号 PASS/FAIL 行 + 总判定；FAIL 时建议动作一行。退出码 0=全绿 2=有FAIL。
只读巡检，不改任何状态。
"""
import json
import os
import sqlite3
import subprocess
import sys
import time

CC_DB = os.path.expanduser("~/.cc-switch/cc-switch.db")
ZCODE_DB = os.path.expanduser("~/.zcode/cli/db/db.sqlite")

FAIL_STORM_HOURLY = int(os.environ.get("FAIL_STORM_HOURLY", "200"))
ZERO_OUT_DAILY = int(os.environ.get("ZERO_OUT_DAILY", "30"))
HINDSIGHT_DAILY_CAP = int(os.environ.get("HINDSIGHT_DAILY_CAP", "800"))
ZCODE_SESSION_BUDGET_M = int(os.environ.get("ZCODE_SESSION_BUDGET_M", "3000"))

now = int(time.time())
results = []


def check(name, ok, detail, action):
    results.append((name, ok, detail, action))


# ── S1/S2: cc-switch ──
try:
    db = sqlite3.connect(f"file:{CC_DB}?mode=ro", uri=True)
    row = db.execute(
        "SELECT COUNT(*), SUM(CASE WHEN status_code!=200 THEN 1 ELSE 0 END) "
        "FROM proxy_request_logs WHERE created_at >= ?", (now - 3600,)
    ).fetchone()
    total_h, fail_h = row[0] or 0, row[1] or 0
    rate = fail_h / total_h if total_h else 0.0
    check("S1-fail-storm", not (fail_h > FAIL_STORM_HOURLY and rate > 0.5),
          f"近1h {fail_h}/{total_h} 失败 (率{rate:.0%}, 阈值 {FAIL_STORM_HOURLY}/50%)",
          "检查 cc-switch failover 队列与健康表；夜间 loop LLM 步骤应已熔断降级")

    row = db.execute(
        "SELECT COUNT(*) FROM proxy_request_logs "
        "WHERE status_code=200 AND created_at >= ? "
        "AND (output_tokens IS NULL OR output_tokens=0) AND input_tokens > 1000",
        (now - 86400,),
    ).fetchone()
    zero_out = row[0] or 0
    check("S2-zero-output-burn", zero_out <= ZERO_OUT_DAILY,
          f"近24h 空烧 {zero_out} 发 (阈值 {ZERO_OUT_DAILY})",
          "lsof -nP -iTCP:15721 找常驻客户端；核对是否指向已删 provider")
    db.close()
except Exception as e:
    check("S1/S2-ccswitch-db", False, f"读失败: {e}", "检查 cc-switch.db 可读性")

# ── S3: hindsight 日预算 ──
try:
    r = subprocess.run(
        ["docker", "exec", "hindsight-db-1", "psql", "-U", "hindsight", "-d", "hindsight", "-t", "-A", "-c",
         f"SELECT COUNT(*) FROM llm_requests WHERE started_at >= now() - interval '24 hours';"],
        capture_output=True, text=True, timeout=30)
    calls = int(r.stdout.strip()) if r.stdout.strip().isdigit() else -1
    check("S3-hindsight-budget", calls <= HINDSIGHT_DAILY_CAP,
          f"近24h llm_calls={calls} (阈值 {HINDSIGHT_DAILY_CAP}; 基线3081/整改目标≤800)",
          "查 retain/consolidation 风暴: 按小时×scope 分组定位触发源；批量同步日预期超限需豁免记录")
except Exception as e:
    check("S3-hindsight", False, f"查询失败: {e}", "检查 hindsight-db-1 docker 容器")

# ── S4: zcode 跨天常驻会话预算 ──
try:
    zdb = sqlite3.connect(f"file:{ZCODE_DB}?mode=ro", uri=True)
    t24 = (now - 86400) * 1000
    rows = zdb.execute(
        "SELECT session_id, SUM(input_tokens+cache_read_input_tokens)/1e6 "
        "FROM model_usage WHERE started_at >= ? GROUP BY session_id "
        "HAVING SUM(input_tokens+cache_read_input_tokens) > ?",
        (t24, ZCODE_SESSION_BUDGET_M * 1e6)).fetchall()
    check("S4-zcode-session-budget", len(rows) == 0,
          f"近24h 超 {ZCODE_SESSION_BUDGET_M}M 的会话 {len(rows)} 个"
          + (": " + ", ".join(f"{sid[:12]}={tot:.0f}M" for sid, tot in rows[:3]) if rows else ""),
          "人工介入: 该会话应 compact 或关闭；检查是否 boot 自动恢复的 goal 会话")
    zdb.close()
except Exception as e:
    check("S4-zcode-db", False, f"读失败: {e}", "检查 ~/.zcode/cli/db/db.sqlite")

# ── S5: proxy_config 熔断参数漂移（2026-10-03 调参: 3/10/120/0.5/15）──
# cc-switch 应用退出时会把内存态写回覆盖 DB 改动——本信号抓「调参被回滚」。
EXPECTED_CFG = {"max_retries": 3, "circuit_failure_threshold": 10,
                "circuit_timeout_seconds": 120, "circuit_error_rate_threshold": 0.5,
                "circuit_min_requests": 15}
try:
    db = sqlite3.connect(f"file:{CC_DB}?mode=ro", uri=True)
    row = db.execute(
        "SELECT max_retries, circuit_failure_threshold, circuit_timeout_seconds, "
        "circuit_error_rate_threshold, circuit_min_requests FROM proxy_config "
        "WHERE app_type='claude'").fetchone()
    drift = {k: v for k, v in zip(EXPECTED_CFG, row) if v != EXPECTED_CFG[k]}
    check("S5-proxy-config-drift", not drift,
          f"claude 行熔断参数 {'一致' if not drift else '漂移: ' + str(drift)}",
          "cc-switch 重启时内存态写回覆盖了 DB 调参——需在应用内重设或窗口后重写（参照 cc-switch-failover-ops: 禁手改 is_current，proxy_config 参数可 DB 写）")
    db.close()
except Exception as e:
    check("S5-proxy-config", False, f"读失败: {e}", "检查 cc-switch.db")


fail = [r for r in results if not r[1]]
for name, ok, detail, action in results:
    print(f"{'✅ PASS' if ok else '🚨 FAIL'} [{name}] {detail}")
    if not ok:
        print(f"   → {action}")
print(f"判定: {'全绿' if not fail else f'{len(fail)} 项 FAIL'}")
sys.exit(0 if not fail else 2)
