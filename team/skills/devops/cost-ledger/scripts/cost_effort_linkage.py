#!/usr/bin/env python3
"""cost-ledger: reasoning_effort <-> cost linkage (heuristic, HONEST).

How cc-switch accounts traffic: the proxy records each request under an
`app_type` (claude / codex / opencode / claude-desktop) taken from the
*client application* that made the call. In this cluster every Hermes profile
connects via `provider: custom:cc-switch` + `api_mode: anthropic_messages`,
so essentially ALL Hermes traffic lands in `app_type='claude'`. The other
app_types (codex/opencode/claude-desktop) come from external native tools
pointing at the same proxy — NOT from Hermes profiles.

Therefore the reasoning_effort linkage CANNOT be a clean per-profile cost join.
What we CAN do honestly:
  1. Report the real 7d cost per app_type (the only cc-switch dimension).
  2. Build the Hermes tier distribution from config.yaml.
  3. Flag that the dominant `claude` bucket blends many profiles across tiers,
     and call out any tier∈{low,none} profile riding the shared premium
     pipeline as an optimization candidate.

OUTPUT is DIRECTIONAL. Do not use as exact per-profile billing.
"""
import argparse
import glob
import os
import re
import sqlite3
import subprocess

PROFILES_DIR = os.path.expanduser("~/.hermes/profiles")
DB = os.path.expanduser("~/.cc-switch/cc-switch.db")
VALID_TIERS = ("ultra", "medium", "low", "none")


def scan_profiles():
    out = []
    for cfg in sorted(glob.glob(os.path.join(PROFILES_DIR, "*", "config.yaml"))):
        profile = os.path.basename(os.path.dirname(cfg))
        text = open(cfg, encoding="utf-8", errors="ignore").read()
        # tier: first agent.reasoning_effort (also matches auxiliary.* lines,
        # but agent. one is the session-level setting).
        m = re.search(r"^\s*reasoning_effort:\s*(\w+)", text, re.M)
        tier = m.group(1).lower() if m else "medium"
        if tier not in VALID_TIERS:
            tier = "medium"
        # Hermes -> cc-switch always uses anthropic_messages, so app_type=claude.
        app = "claude"
        out.append({"profile": profile, "tier": tier, "app_type": app})
    return out


def app_costs(days):
    if not os.path.exists(DB):
        return {}
    now = int(subprocess.check_output(["date", "+%s"]).decode().strip())
    start = now - days * 86400
    con = sqlite3.connect(f"file:{DB}?immutable=1")
    cur = con.execute(
        "SELECT app_type, ROUND(SUM(CAST(total_cost_usd AS REAL)),4) cost, COUNT(*) "
        "FROM proxy_request_logs WHERE created_at >= ? GROUP BY app_type ORDER BY cost DESC",
        (start,),
    )
    out = [{"app_type": r[0], "cost": r[1], "calls": r[2]} for r in cur.fetchall()]
    con.close()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    args = ap.parse_args()

    profiles = scan_profiles()
    costs = app_costs(args.days)
    total = sum(c["cost"] for c in costs) or 1.0

    # tier distribution among Hermes profiles
    tier_count = {t: 0 for t in VALID_TIERS}
    for p in profiles:
        tier_count[p["tier"]] += 1
    hermes_n = len(profiles)
    low_none = [p["profile"] for p in profiles if p["tier"] in ("low", "none")]

    print(f"== cc-switch 7d cost by app_type (last {args.days}d) ==")
    print(f"{'app_type':16} {'cost_usd':>12} {'pct':>7} {'calls':>8}  source")
    ext = {"codex", "opencode", "claude-desktop"}
    for c in costs:
        src = "Hermes (anthropic_messages)" if c["app_type"] == "claude" else "external native tool"
        print(f"{c['app_type']:16} {c['cost']:12.4f} {100*c['cost']/total:6.1f}% {c['calls']:8d}  {src}")

    print(f"\n== Hermes reasoning_effort tier spread (all {hermes_n} profiles) ==")
    for t in VALID_TIERS:
        print(f"  {t:8}: {tier_count[t]}")

    print("\n== optimization signal ==")
    claude = next((c for c in costs if c["app_type"] == "claude"), None)
    if claude:
        print(f"  app_type='claude' (Hermes blend) = ${claude['cost']:.2f} across "
              f"{hermes_n} profiles spanning tiers {tier_count}")
        if low_none:
            print(f"  ⚠️ low/none-tier profiles ride the SAME premium pipeline: {low_none}")
            print("     → verify these tasks truly need premium models; consider a cheaper")
            print("       model/provider or a higher reasoning_effort only where warranted.")
        else:
            print("  ✅ all Hermes profiles use ultra/medium tiers — no low/none leverage point.")
    others = [c for c in costs if c["app_type"] in ext and c["cost"] > 0]
    if others:
        ext_cost = sum(c["cost"] for c in others)
        print(f"  external non-Hermes traffic = ${ext_cost:.2f} on app_types "
              f"{[c['app_type'] for c in others]} (not covered by Hermes tier config).")


if __name__ == "__main__":
    main()
