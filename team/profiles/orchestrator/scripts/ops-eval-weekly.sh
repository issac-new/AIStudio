#!/bin/bash
# ops-eval weekly report generator
# Runs weekly, scans all kanban boards, generates agent workflow evaluation report
# Output: ~/.hermes/evals/weekly-$(date +%Y%m%d).md

REPORT_DIR="$HOME/.hermes/evals"
mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/weekly-$(date +%Y%m%d).md"

echo "# Agent 工作流评估周报 $(date +%Y-%m-%d)" > "$REPORT"
echo "" >> "$REPORT"
echo "> 由 ops-eval cron job 自动生成 | 灵感来源：Palantir AIP Evals" >> "$REPORT"
echo "" >> "$REPORT"

for board in swarm hack product ops eda platform; do
  DB="$HOME/.hermes/kanban/boards/$board/kanban.db"
  if [ ! -f "$DB" ]; then continue; fi
  
  TOTAL=$(sqlite3 "$DB" "SELECT count(*) FROM tasks;" 2>/dev/null)
  DONE=$(sqlite3 "$DB" "SELECT count(*) FROM tasks WHERE status='done';" 2>/dev/null)
  BLOCKED=$(sqlite3 "$DB" "SELECT count(*) FROM tasks WHERE status='blocked';" 2>/dev/null)
  RUNNING=$(sqlite3 "$DB" "SELECT count(*) FROM tasks WHERE status='running';" 2>/dev/null)
  
  echo "## $board 看板" >> "$REPORT"
  echo "" >> "$REPORT"
  echo "| 指标 | 值 |" >> "$REPORT"
  echo "|------|-----|" >> "$REPORT"
  echo "| 总任务 | $TOTAL |" >> "$REPORT"
  echo "| 完成 | $DONE |" >> "$REPORT"
  echo "| 阻塞 | $BLOCKED |" >> "$REPORT"
  echo "| 运行中 | $RUNNING |" >> "$REPORT"
  if [ "$TOTAL" -gt 0 ]; then
    RATE=$((DONE * 100 / TOTAL))
    echo "| 完成率 | ${RATE}% |" >> "$REPORT"
  fi
  
  # Top assignees by task count
  echo "" >> "$REPORT"
  echo "### 按执行者统计" >> "$REPORT"
  echo "" >> "$REPORT"
  echo "| 执行者 | 完成 | 阻塞 | 总计 |" >> "$REPORT"
  echo "|--------|------|------|------|" >> "$REPORT"
  sqlite3 "$DB" "SELECT assignee, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END), SUM(CASE WHEN status='blocked' THEN 1 ELSE 0 END), count(*) FROM tasks GROUP BY assignee ORDER BY count(*) DESC LIMIT 10;" 2>/dev/null | while IFS='|' read -r assignee done blocked total; do
    echo "| $assignee | $done | $blocked | $total |" >> "$REPORT"
  done
echo "" >> "$REPORT"
done

# ===== 后评价四维（融合万事网联《生产运维后评价机制和流程》V0.1，2026-09-11） =====
# 维度1 变更达成率：release-plan 报告产出量 vs 发布类任务完成量
echo "## 后评价四维（生产机制融合 v1.1）" >> "$REPORT"
echo "" >> "$REPORT"
echo "### ① 变更达成率" >> "$REPORT"
echo "" >> "$REPORT"
REL_PLANS=$(find "$HOME/.hermes" /Users/YOURNAME/hermes-docker-sandbox/workspace -maxdepth 4 -name "release-plan*.md" -mtime -7 2>/dev/null | wc -l | tr -d ' ')
echo "- 近 7 天 release-plan 报告数：$REL_PLANS" >> "$REPORT"
echo "" >> "$REPORT"

# 维度2 工具失败率趋势（token-meter --errors，AutoQA 信号）
echo "### ② 工具失败率趋势" >> "$REPORT"
echo "" >> "$REPORT"
echo '```' >> "$REPORT"
python3 "$HOME/.hermes/bin/token-meter.py" --errors --days 7 2>/dev/null | head -12 >> "$REPORT" || echo "(token-meter 不可用)" >> "$REPORT"
echo '```' >> "$REPORT"
echo "" >> "$REPORT"

# 维度3 问题回顾闭环率：blocked/gave_up 卡的回顾报告覆盖
echo "### ③ 问题回顾闭环率" >> "$REPORT"
echo "" >> "$REPORT"
CLOSED=0
OPEN=0
for board in swarm hack ops platform; do
  DB="$HOME/.hermes/kanban/boards/$board/kanban.db"
  [ -f "$DB" ] || continue
  B=$(sqlite3 "$DB" "SELECT count(*) FROM tasks WHERE status IN ('blocked','gave_up');" 2>/dev/null)
  [ -n "$B" ] && OPEN=$((OPEN + B))
done
echo "- 在卡（blocked/gave_up）：$OPEN 张——每张须有失败模式标签+回顾记录（failure-mode-playbook）" >> "$REPORT"
echo "" >> "$REPORT"

# 维度4 整改验证：看门狗审计结果（D1-D7 / drift report）
echo "### ④ 整改验证（看门狗哨兵）" >> "$REPORT"
echo "" >> "$REPORT"
WD="/Users/YOURNAME/hermes-docker-sandbox/workspace/profiles/orchestrator/scripts/rules_audit_watchdog.py"
[ -f "$WD" ] && { python3 "$WD" >/dev/null 2>&1 && echo "- rules_audit_watchdog D1-D7：全零通过 ✅" >> "$REPORT" || echo "- rules_audit_watchdog：命中异常 ❌（须开问题回顾）" >> "$REPORT"; } || echo "- rules_audit_watchdog 不在位 ❌" >> "$REPORT"
SI="$HOME/.hermes/scripts/soul_integrity_watchdog.py"
[ -f "$SI" ] && { python3 "$SI" >/dev/null 2>&1 && echo "- soul_integrity_watchdog：基线一致 ✅" >> "$REPORT" || echo "- soul_integrity_watchdog：漂移 ❌" >> "$REPORT"; }
DA="$HOME/.hermes/scripts/publish_drift_audit.py"
[ -f "$DA" ] && echo "- publish drift 审计脚本在位（月度 cron）" >> "$REPORT"
echo "" >> "$REPORT"

# ===== 干预率（correction rate 等价信号，teamai G4 融合 2026-10-19 t_d2df2950） =====
# 数据源：$HOME/.hermes/cache/radar/session_friction_<date>.json（夜间 Loop friction 步骤产物，
#   生成器 ~/.hermes/scripts/session_friction_scan.py 的 BASE=~/.hermes；注意不是
#   ~/.hermes/profiles/orchestrator/cache/radar——该目录实测为空，t_d2df2950 侦察实证）。
# 字段映射依据（数据缺失降级，按实际 json 字段映射）：json 实际含 scanned_sessions 与
#   friction_topics[].{name,count,desc}，不含 teamai 三信号（interrupt/toolReject/correction）
#   原值。映射：干预计数 ≡ Σ friction_topics[].count（一次高频摩擦主题命中 = 一次人工
#   干预等价物）；干预率 = Σcount / Σscanned_sessions。
# 硬边界（teamai 源码原则 dashboard.md:30 "What reaches the team is the count, not the text"）：
#   只报计数不报文本；数据缺失输出「friction 数据缺(原因)」，不编造 0；样本覆盖天数如实披露。
echo "## 干预率（teamai G4，friction 等价信号）" >> "$REPORT"
echo "" >> "$REPORT"
python3 - <<'PYEOF' >> "$REPORT" 2>/dev/null || echo "- friction 聚合异常（python3 不可用或数据不可读）" >> "$REPORT"
import glob, json, os
from datetime import date, datetime

radar = os.path.join(os.path.expanduser("~"), ".hermes", "cache", "radar")
today = date.today()
by_date = {}
unreadable = []
for fp in sorted(glob.glob(os.path.join(radar, "session_friction_*.json"))):
    try:
        with open(fp, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("json top-level not object")
    except Exception:
        unreadable.append(os.path.basename(fp))
        continue
    dstr = str(data.get("date") or "") or os.path.basename(fp).replace("session_friction_", "").replace(".json", "")
    try:
        d = datetime.strptime(dstr[:10], "%Y-%m-%d").date()
    except ValueError:
        continue
    by_date[d] = data  # 同日多次夜间跑取最后一次

def bucket_of(d):
    age = (today - d).days
    if 0 <= age <= 6:
        return "this"
    if 7 <= age <= 13:
        return "prev"
    return None

def agg(items):
    sess = cnt = 0
    topics = {}
    for data in items:
        v = data.get("scanned_sessions")
        if isinstance(v, int):
            sess += v
        for t in data.get("friction_topics") or []:
            if not isinstance(t, dict):
                continue
            name = str(t.get("name") or "?")
            c = t.get("count")
            if isinstance(c, int):
                cnt += c
                topics[name] = topics.get(name, 0) + c
    return sess, cnt, topics

weeks = {"this": [], "prev": []}
for d in sorted(by_date):
    b = bucket_of(d)
    if b:
        weeks[b].append(by_date[d])

for n in unreadable:
    print("- 样本不可读：" + n)

def rate(c, s):
    return c * 100.0 / s if s else None

def fmt(r):
    return ("%.2f%%" % r) if r is not None else "N/A(扫描数为0)"

if not weeks["this"] and not weeks["prev"]:
    reason = "无 session_friction_*.json 落盘" if not by_date else "近 14 天样本全缺（仅有更早历史样本）"
    print("- friction 数据缺(%s；目录 %s)" % (reason, radar))
else:
    s1, c1, t1 = agg(weeks["this"])
    s0, c0, t0 = agg(weeks["prev"])
    r1, r0 = rate(c1, s1), rate(c0, s0)
    if weeks["this"]:
        print("- 本周（近 7 天，覆盖 %d/7 天）：扫描 %d 会话，干预计数 %d，干预率 %s" % (len(weeks["this"]), s1, c1, fmt(r1)))
    else:
        print("- 本周：friction 数据缺(近 7 天无样本)")
    if weeks["prev"]:
        print("- 上周（8-14 天前，覆盖 %d/7 天）：扫描 %d 会话，干预计数 %d，干预率 %s" % (len(weeks["prev"]), s0, c0, fmt(r0)))
    else:
        print("- 上周：friction 数据缺(8-14 天前无样本，无法环比)")
    if r1 is not None and r0 is not None:
        print("- 周环比：%s%.2f 个百分点" % ("+" if r1 - r0 >= 0 else "", r1 - r0))
    for label, topics in (("本周", t1), ("上周", t0)):
        if topics:
            for name, c in sorted(topics.items(), key=lambda kv: -kv[1]):
                print("- %s主题计数：%s = %d" % (label, name, c))
        elif weeks["this" if label == "本周" else "prev"]:
            print("- %s高频摩擦主题命中 0（真实 json friction_topics 为空，非数据缺失）" % label)
    print("- 口径：干预计数 ≡ Σ friction_topics[].count（session_friction json 无 interrupt/toolReject/correction 三信号原值，按实际字段等价映射）；只报计数不报文本")
PYEOF
echo "" >> "$REPORT"

# ===== M1/M2 蜂群协作健康指标（银翼蜂群评测融合 2026-10-24，baseline.md §M，gap-20261024-swarm-eval 接线） =====
echo "## M1/M2 蜂群协作健康（baseline.md §M，测量不下角色结论）" >> "$REPORT"
echo "" >> "$REPORT"
CM="$HOME/.hermes/evals/collab-health/m1_m2_metrics.py"
if [ -f "$CM" ]; then
  python3 "$CM" --out "$HOME/.hermes/evals/collab-health/last-run.json" 2>/dev/null | sed 's/^/- /' >> "$REPORT" || echo "- M1/M2 统计异常（脚本 rc!=0，详情跑该脚本看 stderr）" >> "$REPORT"
else
  echo "- M1/M2 统计脚本缺（$CM）" >> "$REPORT"
fi
echo "" >> "$REPORT"
echo "## 评估维度说明" >> "$REPORT"
echo "" >> "$REPORT"
echo "| 维度 | 指标 | 数据源 |" >> "$REPORT"
echo "|------|------|--------|" >> "$REPORT"
echo "| 完成率 | done/total | kanban.db tasks |" >> "$REPORT"
echo "| 阻塞率 | blocked/total | kanban.db tasks |" >> "$REPORT"
echo "| 按执行者分布 | GROUP BY assignee | kanban.db tasks |" >> "$REPORT"
echo "| 干预率 | Σ friction_topics[].count / Σ scanned_sessions | cache/radar/session_friction_*.json |" >> "$REPORT"
echo "| M1 协调开销比 | 协调侧 token ÷ 生产侧 token（窗口 7d） | profiles/*/state.db sessions |" >> "$REPORT"
echo "| M2 评审摩擦率 | changes_requested ÷ completed（按角色，窗口 30d） | kanban boards task_events |" >> "$REPORT"
echo "" >> "$REPORT"
echo "--- 生成时间: $(date '+%Y-%m-%d %H:%M:%S') ---" >> "$REPORT"

echo "Report generated: $REPORT"
