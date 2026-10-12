#!/usr/bin/env python3
"""Onboard a team's new profiles to the fleet Hindsight daemon (:8888).

Usage:
    python3 scripts/onboard-team-hindsight.py <team-slug> <profile> [<profile>...]

For each profile:
  - refuse if ~/.hermes/profiles/<p>/hindsight/config.json already exists
    (never clobber an existing config),
  - write the 12-field team template with bank=hermes-<machine>-<team>,
  - read back and assert every field.

Machine id is derived from the orchestrator profile's config.json (single source).
Then probes the server bank: 200/405 = exists; 404 = fine (lazy-creates on first
retain). Exits nonzero on any write/verify failure.
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

HOME = Path.home()
PROFILES_DIR = HOME / ".hermes" / "profiles"
API = "http://127.0.0.1:8888"

TEMPLATE = {
    "mode": "local_external",
    "api_url": "http://localhost:8888",
    "bank_id": "",  # filled per team below
    "recall_budget": "mid",
    "recall_method": "recall",
    "auto_recall": True,
    "auto_retain": True,
    "retain_async": True,
    "retain_every_n_turns": 1,
    "memory_mode": "hybrid",
    "recall_types": "observation,world,experience",
    "recall_max_tokens": 4096,
    "bank_id_template": "",
}


def machine_id() -> str:
    ref = PROFILES_DIR / "orchestrator" / "hindsight" / "config.json"
    bank = json.loads(ref.read_text())["bank_id"]  # hermes-<mid>-<team>
    parts = bank.split("-")
    if len(parts) < 3 or parts[0] != "hermes":
        sys.exit(f"cannot derive machine id from {ref}: {bank!r}")
    return parts[1]


def probe_bank(bank_id: str) -> None:
    url = f"{API}/v1/default/banks/{bank_id}"
    try:
        urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=5)
        print("server bank: exists (200)")
    except urllib.error.HTTPError as e:
        if e.code == 405:
            print("server bank: exists (405 probe)")
        elif e.code == 404:
            print("server bank: absent -- fine, lazy-creates on first retain")
        else:
            print(f"server bank: HTTP {e.code} -- check daemon")
    except (urllib.error.URLError, TimeoutError, OSError):
        print("server bank: daemon unreachable -- config still valid, check /health later")


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    team, profiles = sys.argv[1], sys.argv[2:]
    mid = machine_id()
    tpl = dict(TEMPLATE, bank_id=f"hermes-{mid}-{team}")

    written = 0
    for p in profiles:
        d = PROFILES_DIR / p / "hindsight"
        f = d / "config.json"
        if f.exists():
            print(f"SKIP {p}: {f} already exists (never clobber)")
            continue
        d.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(tpl, indent=2, ensure_ascii=False) + "\n")
        check = json.loads(f.read_text())
        assert check == tpl, f"{p}: readback mismatch"
        print(f"OK   {p}: bank={tpl['bank_id']}")
        written += 1

    print(f"{written}/{len(profiles)} profile(s) written & verified")
    if written:
        probe_bank(tpl["bank_id"])


if __name__ == "__main__":
    main()
