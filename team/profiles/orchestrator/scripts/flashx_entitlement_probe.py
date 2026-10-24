#!/usr/bin/env python3
"""GLM-5.3-FlashX 权限探测 + 自动切换 aim 映射（v2，2026-09-18 用户裁决语义）。

保持 aim→glm-5.3-flash；上游开放 FlashX 权限后自动切。
关键判据（v1 教训）：
- 200 回包 ≠ 权限开放：cc-switch 会把未授权模型名静默降级到默认档，
  必须校验回包 model 字段 == glm-5.3-flashx 才算 ENTITLED。
- aim 的真实解析点 = MGLM 行（app_type=claude, is_current=1）的 env.ANTHROPIC_MODEL，
  hermes 行是 liveConfigManaged 模板，不改。
- sqlite 可能被 proxy 锁：connect(timeout=60) + 重试。
幂等：已切换（状态文件存在）则跳过。验证不过→回滚。
"""
import datetime
import json
import pathlib
import sqlite3
import subprocess
import sys
import time

HOME = pathlib.Path.home()
DB = HOME / ".cc-switch/cc-switch.db"
MGLM_ID = "301b7245-7c7e-4624-adec-c258156b082f"
STATUS = HOME / ".hermes/backups/cc-switch-aim-mapping/flashx-switch-status.json"
LOG = HOME / ".hermes/backups/cc-switch-aim-mapping/probe.log"
TARGET = "glm-5.3-flashx"
FALLBACK_DEFAULT = "glm-5.3-flash[1M]"
PROXY = "http://127.0.0.1:15721"


def log(msg, announce=None):
    """写日志文件；announce=True 时同时打印（cron 投递切换/异常事件）。"""
    LOG.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now().isoformat(timespec="seconds")
    with open(LOG, "a") as f:
        f.write(f"[{ts}] {msg}\n")
    if announce:
        print(msg)


def probe(model, max_tokens=8):
    """返回 (entitled, detail)。entitled 仅当回包 model 含 flashx。"""
    body = json.dumps({"model": model, "max_tokens": max_tokens,
                       "messages": [{"role": "user", "content": "say pong"}]})
    r = subprocess.run(
        ["curl", "-s", "--max-time", "60", "-X", "POST", f"{PROXY}/v1/messages",
         "-H", "Content-Type: application/json", "-d", body],
        capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)
    except Exception:
        return False, f"non-json: {r.stdout[:200]}"
    if d.get("type") == "message":
        served = d.get("model", "")
        if TARGET in served.lower():
            return True, f"200 served={served}"
        return False, f"200-but-downgraded: requested={model} served={served} (silent fallback)"
    err = d.get("error", {})
    return False, f"{err.get('code')} {err.get('message', '')[:120]}"


def connect_db():
    return sqlite3.connect(DB, timeout=60)


def main():
    if STATUS.exists():
        log("already-switched (status file exists), skip")
        return 0
    ok, detail = probe(TARGET)
    if not ok:
        log(f"probe {TARGET}: not-entitled — {detail} — no action")  # 静默
        return 0
    log(f"probe {TARGET}: ENTITLED — {detail} — switching MGLM default", announce=True)

    db = connect_db()
    for attempt in range(3):
        try:
            row = db.execute(
                "SELECT settings_config FROM providers WHERE id=?", (MGLM_ID,)).fetchone()
            break
        except sqlite3.OperationalError as e:
            log(f"db locked (attempt {attempt+1}): {e}")
            time.sleep(10 * (attempt + 1))
    else:
        log("FATAL: db remained locked, abort (no change made)", announce=True)
        return 1
    if not row:
        log("FATAL: MGLM row not found, abort", announce=True)
        return 1

    cfg = json.loads(row[0])
    env = cfg.get("env", {})
    backup_dir = HOME / ".hermes/backups/cc-switch-aim-mapping"
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    (backup_dir / f"mglm-row-{ts}.json").write_text(row[0])

    old_default = env.get("ANTHROPIC_MODEL", "")
    env["ANTHROPIC_MODEL"] = f"{TARGET}[1M]"
    cfg["env"] = env
    for attempt in range(3):
        try:
            db.execute("UPDATE providers SET settings_config=? WHERE id=?",
                       (json.dumps(cfg, ensure_ascii=False), MGLM_ID))
            db.commit()
            break
        except sqlite3.OperationalError as e:
            log(f"db write locked (attempt {attempt+1}): {e}")
            time.sleep(10 * (attempt + 1))
    else:
        log("FATAL: write remained locked, abort (no change committed)", announce=True)
        return 1
    log(f"MGLM ANTHROPIC_MODEL: {old_default} -> {TARGET}[1M] (backup: mglm-row-{ts}.json)")

    # 切后实测：aim 应解析到 flashx；不过→回滚
    time.sleep(3)  # 让 proxy 吃到行更新
    ok2, detail2 = probe("aim")
    if ok2:
        STATUS.write_text(json.dumps({
            "switched_at": ts, "target": TARGET, "old_default": old_default,
            "verify": detail2}, ensure_ascii=False, indent=1))
        log(f"SWITCHED aim -> {TARGET}, verify: {detail2}", announce=True)
    else:
        db.execute("UPDATE providers SET settings_config=? WHERE id=?",
                   (row[0], MGLM_ID))
        db.commit()
        log(f"post-switch verify FAILED ({detail2}) — rolled back to {old_default}", announce=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
