#!/usr/bin/env python3
"""jobs.json 直改（runbook 规则 6：flock + 临时文件原子替换 + .bak + 改后重读复核）

三个夜间 agent 模式 job → no_agent 脚本直跑（0 token）：
- ops-devops/56b0cd499076 nightly-radar-wrapper   → nightly_radar_cron.sh
- ops-devops/6b16a336c2ea Protocol Violation      → protocol_violation_consumer_run.py
- platform-skill-miner/762bf6c7f6a9 skill-health  → skill_health_weekly_silent.sh
"""
import fcntl
import json
import os
import shutil
import sys
import tempfile
from datetime import date

HOME = os.path.expanduser("~")
TODAY = date.today().strftime("%Y%m%d")

# job_id → (jobs.json 路径, script 名, 新 prompt, 需清空的连接字段)
CHANGES = {
    "56b0cd499076": (
        f"{HOME}/.hermes/profiles/ops-devops/cron/jobs.json",
        "nightly_radar_cron.sh",
        "no_agent 模式：nightly_radar_cron.sh 直跑雷达管道，stdout 即投递消息（2026-09-08 改造，原 agent 外层纯透传白烧 aim@cc-switch）",
        True,
    ),
    "6b16a336c2ea": (
        f"{HOME}/.hermes/profiles/ops-devops/cron/jobs.json",
        "protocol_violation_consumer_run.py",
        "no_agent 模式：protocol_violation_consumer_run.py 直跑 F-1 周扫（DRY_RUN=1 可演练）；原 agent prompt 存档于 jobs.json.bak-*",
        True,
    ),
    "762bf6c7f6a9": (
        f"{HOME}/.hermes/profiles/platform-skill-miner/cron/jobs.json",
        "skill_health_weekly_silent.sh",
        "no_agent 模式：skill_health_weekly_silent.sh 直跑审计，Phase3 有重复或异常才输出，健康=静默",
        True,
    ),
}


def apply(job_id: str) -> None:
    path, script, new_prompt, clear_conn = CHANGES[job_id]
    lock = os.path.join(os.path.dirname(path), ".jobs.lock")
    with open(lock, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        data = json.load(open(path))
        jobs = data if isinstance(data, list) else data.get("jobs", [])
        target = None
        for j in jobs:
            if isinstance(j, dict) and j.get("id") == job_id:
                target = j
                break
        if target is None:
            print(f"[{job_id}] NOT FOUND in {path}")
            sys.exit(1)

        bak = f"{path}.bak-{TODAY}"
        if not os.path.exists(bak):
            shutil.copy2(path, bak)
            print(f"[{job_id}] backup → {bak}")

        before = {k: target.get(k) for k in ("no_agent", "script", "model", "provider")}
        target["no_agent"] = True
        target["script"] = script
        target["prompt"] = new_prompt
        if clear_conn:
            for k in ("model", "provider", "model_snapshot", "provider_snapshot",
                      "base_url", "skill", "skills"):
                if k in target:
                    target[k] = None if k != "skills" else []

        # 原子替换
        d = os.path.dirname(path)
        fd, tmp = tempfile.mkstemp(dir=d, prefix=".jobs.", suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
        fcntl.flock(lf, fcntl.LOCK_UN)

    # 改后重读复核（口头声明≠落盘）
    data2 = json.load(open(path))
    jobs2 = data2 if isinstance(data2, list) else data2.get("jobs", [])
    t2 = next((j for j in jobs2 if isinstance(j, dict) and j.get("id") == job_id), None)
    ok = t2 and t2.get("no_agent") is True and t2.get("script") == script
    print(f"[{job_id}] {before}  →  no_agent=True script={script}  重读复核: {'✅' if ok else '❌ MISMATCH'}")
    if not ok:
        sys.exit(1)


for jid in sys.argv[1:] or list(CHANGES):
    apply(jid)
print("ALL DONE")
