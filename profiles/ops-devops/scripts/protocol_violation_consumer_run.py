#!/usr/bin/env python3
"""Protocol Violation Consumer — no_agent 直跑版（2026-09-08 改造）。

原为 agent 模式（周一 02:00，platform-skill-miner 默认模型 @cc-switch 计费）。
Agent 步骤完全机械化，无推理价值 → 脚本化后 0 token。

步骤（与原 prompt 等价，硬规则天然满足——本脚本只做 comment+create，不碰 complete）：
1. 跑 scan_protocol_violations.py（唯一事实源，禁自写 SQL）
2. 解析 ---MACHINE--- 块：REPORT_FILE / POST_DIRECTIVE / VIOLATORS_JSON
3. POST_DIRECTIVE=SKIP → 静默退出（stdout 空不投递）
4. POST → kanban_comment(t_1c73540a, 全文报告) → scanner --mark-posted
5. 每个 violator → kanban create(board=swarm, assignee=orchestrator,
   parents=[t_1c73540a], idempotency_key=f1-rootcause-<assignee>-<ISOweek>)

DRY_RUN=1 环境变量：只打印将执行的动作，不写看板（白天演练用）。
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone, timedelta

WORKDIR = "/Volumes/YOURVOLUME/lab/hermes-docker-sandbox/workspace/remediation/F-1-protocol-violation-consumer"
SCANNER = os.path.join(WORKDIR, "scan_protocol_violations.py")
HERMES = os.path.expanduser("~/.hermes/hermes-agent/venv/bin/hermes")
PARENT_TASK = "t_1c73540a"
DRY_RUN = os.environ.get("DRY_RUN") == "1"
CST = timezone(timedelta(hours=8))


def iso_week() -> str:
    w = datetime.now(CST).isocalendar()
    return f"{w[0]}-W{w[1]}"


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=120, **kw)


def main() -> int:
    r = run([sys.executable, SCANNER], cwd=WORKDIR)
    out = r.stdout or ""
    if r.returncode != 0:
        print(f"[F-1] scanner rc={r.returncode}: {(r.stderr or '')[-300:]}")
        return 1
    if "---MACHINE---" not in out:
        print("[F-1] scanner 输出缺 ---MACHINE--- 块，拒绝盲动")
        return 1

    machine = out.split("---MACHINE---", 1)[1].strip().splitlines()
    fields = {}
    for line in machine:
        if "=" in line:
            k, v = line.split("=", 1)
            fields[k.strip()] = v.strip()

    directive = fields.get("POST_DIRECTIVE", "SKIP")
    report_file = fields.get("REPORT_FILE", "")
    try:
        violators = json.loads(fields.get("VIOLATORS_JSON", "[]"))
    except json.JSONDecodeError:
        print(f"[F-1] VIOLATORS_JSON 解析失败: {fields.get('VIOLATORS_JSON', '')[:200]}")
        return 1

    if directive == "SKIP":
        # 静默：本周已投递（runbook 幂等铁律），stdout 留空 → cron 不投递
        return 0

    report_text = open(report_file, encoding="utf-8").read() if report_file else out
    wk = iso_week()
    actions = []

    actions.append(f"kanban comment {PARENT_TASK}  # 报告 {len(report_text)} 字符")
    if not DRY_RUN:
        c = run([HERMES, "kanban", "comment", PARENT_TASK, report_text])
        if c.returncode != 0:
            print(f"[F-1] comment 失败（不 mark-posted，下周重投）: {(c.stderr or c.stdout)[-300:]}")
            return 1
        m = run([sys.executable, SCANNER, "--mark-posted"], cwd=WORKDIR)
        if m.returncode != 0:
            print(f"[F-1] WARN: 已投递但 mark-posted 失败: {(m.stderr or '')[-200:]}")
    else:
        print(f"[DRY] comment -> {PARENT_TASK}")

    for assignee in violators:
        title = f"[F-1 root-cause] {assignee}: >=3 protocol_violation events this week"
        idem = f"f1-rootcause-{assignee}-{wk}"
        body = (f"来自 F-1 周扫（{wk}）：{assignee} 本周 protocol_violation 达到阈值。\n"
                f"报告全文见 {PARENT_TASK} 评论区。请 root-cause 解剖到 file:line 并给根治提案。")
        actions.append(f"kanban create board=swarm assignee=orchestrator idem={idem}")
        if not DRY_RUN:
            c = run([HERMES, "kanban", "--board", "swarm", "create", title,
                     "--assignee", "orchestrator", "--parent", PARENT_TASK,
                     "--idempotency-key", idem, "--body", body])
            if c.returncode != 0:
                print(f"[F-1] create {assignee} 失败: {(c.stderr or c.stdout)[-300:]}")
        else:
            print(f"[DRY] create {title!r} idem={idem}")

    print(f"[F-1] {datetime.now(CST):%F %T} 投递完成：{len(violators)} violators, week={wk}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
