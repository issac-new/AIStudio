#!/usr/bin/env python3
"""Session wire realignment watchdog.

Long-lived sessions pin gateway_runtime.api_mode at creation (or during a
fallback). If the profile config later declares a different api_mode for the
same provider, the session keeps using the stale wire forever (the 2026-09-05
[已移除] incident: chat_completions pin -> cc-switch codex route -> 400).

This tool scans all profile state.db sessions, compares each pinned
gateway_runtime.api_mode against the profile's custom_providers declaration,
and realigns mismatches in-place (backup JSON of every row touched).

Usage:
  python3 session_wire_watchdog.py            # report only (exit 1 if drift)
  python3 session_wire_watchdog.py --fix      # realign mismatches
  python3 session_wire_watchdog.py --fix --json out.json
"""
import glob
import json
import os
import sqlite3
import sys
from datetime import datetime

HERMES = os.path.expanduser("~/.hermes")
PROFILES_GLOB = os.path.join(HERMES, "profiles/*/state.db")
MAIN_DB = os.path.join(HERMES, "state.db")

FIX = "--fix" in sys.argv
JSON_OUT = None
if "--json" in sys.argv:
    JSON_OUT = sys.argv[sys.argv.index("--json") + 1]


def profile_ccswitch_api_mode(profile_dir):
    """Return the api_mode declared for cc-switch in the profile config, if any."""
    cfg = os.path.join(profile_dir, "config.yaml")
    if not os.path.exists(cfg):
        return None
    try:
        import yaml
        c = yaml.safe_load(open(cfg))
    except Exception:
        return None
    for p in (c or {}).get("custom_providers") or []:
        if "cc-switch" in str(p.get("name", "")):
            return p.get("api_mode")
    return None


def main():
    report = {"checked": 0, "drift": [], "fixed": [], "errors": []}
    dbs = [(p, p.split("/profiles/")[1].split("/state.db")[0])
           for p in glob.glob(PROFILES_GLOB)]
    dbs.append((MAIN_DB, "orchestrator-main"))

    for db_path, prof in dbs:
        expected = profile_ccswitch_api_mode(os.path.dirname(db_path))
        if not expected:
            continue  # profile doesn't declare cc-switch; nothing to compare
        try:
            conn = sqlite3.connect(db_path)
        except Exception as e:
            report["errors"].append(f"{prof}: open failed {e}")
            continue
        try:
            rows = conn.execute(
                "SELECT id, model_config FROM sessions "
                "WHERE model_config LIKE '%gateway_runtime%' AND ended_at IS NULL"
            ).fetchall()
        except sqlite3.OperationalError:
            continue
        for sid, mc in rows:
            report["checked"] += 1
            try:
                cfg = json.loads(mc)
            except Exception:
                continue
            gw = cfg.get("gateway_runtime") or {}
            mode = gw.get("api_mode")
            if mode and mode != expected:
                entry = {
                    "profile": prof, "session": sid,
                    "pinned": mode, "expected": expected,
                    "fallback_active": gw.get("fallback_active"),
                }
                report["drift"].append(entry)
                if FIX:
                    gw["api_mode"] = expected
                    gw["fallback_active"] = False
                    cfg["gateway_runtime"] = gw
                    # backup original row before write
                    bdir = os.path.join(HERMES, "backup/session-wire-watchdog")
                    os.makedirs(bdir, exist_ok=True)
                    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
                    bfile = os.path.join(bdir, f"{prof}-{sid}-{stamp}.json")
                    with open(bfile, "w") as f:
                        json.dump({"session": sid, "original": mc}, f, ensure_ascii=False)
                    conn.execute(
                        "UPDATE sessions SET model_config=? WHERE id=?",
                        (json.dumps(cfg, ensure_ascii=False), sid),
                    )
                    conn.commit()
                    entry["fixed"] = True
                    entry["backup"] = bfile
                    report["fixed"].append(entry)
        conn.close()

    tag = "FIX" if FIX else "REPORT"
    print(f"[session-wire-watchdog:{tag}] checked={report['checked']} "
          f"drift={len(report['drift'])} fixed={len(report['fixed'])} "
          f"errors={len(report['errors'])}")
    for d in report["drift"]:
        print(f"  DRIFT {d['profile']}/{d['session']}: pinned={d['pinned']} expected={d['expected']}")
    for e in report["errors"]:
        print(f"  ERROR {e}")
    if JSON_OUT:
        with open(JSON_OUT, "w") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
    # drift without --fix = alarm (watchdog convention: exit 1)
    sys.exit(1 if (report["drift"] and not FIX) else 0)


if __name__ == "__main__":
    main()
