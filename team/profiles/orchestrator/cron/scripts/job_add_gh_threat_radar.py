#!/usr/bin/env python3
"""job_add_gh_threat_radar.py — 向 orchestrator cron 注册 gh_threat_radar 日常档。

runbook 工程规则合规：脚本文件调用（非 heredoc/-c）、flock .jobs.lock、
临时文件原子替换、.bak-<date> 备份、改后重读复核。
"""
import fcntl
import json
import shutil
import sys
import time
from pathlib import Path

JOBS = Path.home() / ".hermes/profiles/orchestrator/cron/jobs.json"
LOCK = JOBS.parent / ".jobs.lock"
BAK = JOBS.parent / f"jobs.json.bak-before-gh-radar-{time.strftime('%Y%m%d')}"

JOB_ID = "gh-threat-radar-daily"
EXPR = "40 9 * * *"          # 09:40 daily：所有 09:0x watchdog 之后、避开 09,21 双写
SCRIPT = "/Users/YOURNAME/.hermes/skills/hack-team/wih-secret-hunter/scripts/gh_threat_radar.py"
STATE = "/Users/YOURNAME/.hermes/profiles/_shared/hack-kb/intel/gh_radar_state.json"
KEYWORDS = ["CVE-2026", "exploit", "0day", "nuclei-template"]


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "add"

    with open(LOCK, "w") as lockf:
        fcntl.flock(lockf, fcntl.LOCK_EX)
        data = json.loads(JOBS.read_text())
        jobs = data.get("jobs", [])

        existing = [j for j in jobs if j.get("id") == JOB_ID]
        if action == "remove":
            before = len(jobs)
            jobs = [j for j in jobs if j.get("id") != JOB_ID]
            data["jobs"] = jobs
            data["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            JOBS.write_text(json.dumps(data, ensure_ascii=False, indent=1))
            print(f"removed {JOB_ID}: {before} -> {len(jobs)} jobs")
            return 0

        if existing:
            print(f"job {JOB_ID} already exists, skip add")
            return 0

        if not JOBS.exists():
            print("jobs.json missing?")
            return 2
        shutil.copy2(JOBS, BAK)

        # 模板字段对齐现有 job 结构（镜像 8becd7e3312c 的字段集）
        job = {
            "id": JOB_ID,
            "name": "GitHub 威胁雷达（CVE/工具/泄露三路）",
            "kind": "cron",
            "schedule": {"kind": "cron", "expr": EXPR, "display": EXPR},
            "script": "/Users/YOURNAME/.hermes/profiles/orchestrator/cron/scripts/run_gh_threat_radar.sh",
            "prompt": "",
            "skills": [],
            "skill": None,
            "model": None,
            "provider": None,
            "provider_snapshot": None,
            "model_snapshot": None,
            "base_url": None,
            "deliver": "local",
            "enabled": True,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "note": "ARL-Next P1 遗留项落地 t_07ef40ca。stdout 摘要存 cron 输出；告警 JSON 落 hack-kb/intel/。关键词变更改 run_gh_threat_radar.sh。",
            "keywords": KEYWORDS,
            "state_path": STATE,
        }
        jobs.append(job)
        data["jobs"] = jobs
        data["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")

        tmp = JOBS.with_suffix(".json.tmp-ghradar")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        tmp.replace(JOBS)

    # 改后重读复核（口头声明≠落盘）
    verify = json.loads(JOBS.read_text())
    found = [j for j in verify.get("jobs", []) if j.get("id") == JOB_ID]
    if not found:
        print("VERIFY FAIL: job not found after write")
        return 2
    print(f"OK: {JOB_ID} registered ({EXPR}), backup={BAK.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
