#!/usr/bin/env python3
"""
Hindsight Bank Migration Script
================================
Migrate memories from old bank_id formats to MAC-based bank_id format.

Source banks (auto-detected):
  - hermes-{profile} (profile-only, pre-isolation)
  - hermes-{user}-{profile} (user-isolated, if previously configured)

Target banks:
  - hermes-{MAC}-{profile} (MAC-based machine isolation)

Reads all memories from each source bank via the recall API,
then re-writes them to the target bank with migration tags.
Processes in batches of 5 to avoid LLM rate limits on the retain endpoint.

Usage:
  python3 migrate-hindsight-banks.py                    # auto-detect MAC
  python3 migrate-hindsight-banks.py --mac AABBCCDDEEFF # manual MAC
  python3 migrate-hindsight-banks.py --dry-run           # preview migration map
  python3 migrate-hindsight-banks.py --api-base http://host:8888  # remote API

The script is long-running (5-10 min for ~200 memories). Run in background:
  terminal(background=true, notify_on_complete=true)
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request


def detect_mac() -> str:
    """Detect MAC address (same logic as setup-hindsight-banks.py)."""
    try:
        result = subprocess.run(["ifconfig", "en0"], capture_output=True, text=True, timeout=5)
        m = re.search(r'ether\s+([0-9a-f:]{17})', result.stdout)
        if m:
            return m.group(1).replace(":", "").lower()
    except:
        pass
    try:
        result = subprocess.run(["ip", "link", "show"], capture_output=True, text=True, timeout=5)
        m = re.search(r'link/ether\s+([0-9a-f:]{17})', result.stdout)
        if m:
            return m.group(1).replace(":", "").lower()
    except:
        pass
    try:
        result = subprocess.run(["getmac", "/fo", "csv", "/nh"], capture_output=True, text=True, timeout=5)
        for line in result.stdout.strip().split("\n"):
            parts = line.strip().strip('"').split('","')
            if parts and len(parts[0].replace("-", "")) == 12:
                return parts[0].replace("-", "").lower()
    except:
        pass
    return "unknown"


def get_all_banks(api_base):
    try:
        with urllib.request.urlopen(f"{api_base}/banks", timeout=10) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"Failed to list banks: {e}", flush=True)
        return {"banks": []}


def recall_all(api_base, bank_id, limit=500):
    try:
        data = json.dumps({"query": "all memories context test hindsight configuration error debug agent profile matrix kanban workspace skill rules soul migration bank", "limit": limit}).encode()
        req = urllib.request.Request(
            f"{api_base}/banks/{bank_id}/memories/recall",
            data=data,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f"    recall error for {bank_id}: {e}", flush=True)
        return {"results": []}


def retain_to_bank(api_base, bank_id, items):
    if not items:
        return True, 0
    try:
        data = json.dumps({"items": items}).encode()
        req = urllib.request.Request(
            f"{api_base}/banks/{bank_id}/memories",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
            return result.get("success", False), len(items)
    except Exception as e:
        print(f"    retain error for {bank_id}: {e}", flush=True)
        return False, 0


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Migrate Hindsight banks to MAC-based format")
    parser.add_argument("--mac", help="Manually specify MAC")
    parser.add_argument("--dry-run", action="store_true", help="Preview migration map")
    parser.add_argument("--api-base", default="http://localhost:8888/v1/default",
                       help="Hindsight API base URL")
    parser.add_argument("--batch-size", type=int, default=5, help="Batch size for retain")
    args = parser.parse_args()

    mac = args.mac.lower().replace(":", "").replace("-", "") if args.mac else detect_mac()
    print(f"MAC: {mac}", flush=True)

    known_profiles = [
        "orchestrator", "architect", "project-manager", "requirement-analyst",
        "worker-coder", "worker-deployer", "worker-researcher",
        "worker-reviewer", "worker-tester",
    ]

    data = get_all_banks(args.api_base)
    all_banks = [b["bank_id"] for b in data.get("banks", [])]
    print(f"Total banks: {len(all_banks)}", flush=True)

    mac_banks = [b for b in all_banks if mac in b]
    legacy_banks = [b for b in all_banks if mac not in b and b != "hermes-default"]

    print(f"MAC-based (target): {len(mac_banks)}", flush=True)
    print(f"Legacy (to migrate): {len(legacy_banks)}", flush=True)

    migrations = []
    for src in legacy_banks:
        for kp in known_profiles:
            if src.endswith(kp):
                dst = f"hermes-{mac}-{kp}"
                migrations.append((src, dst))
                break

    print(f"\nMigrations: {len(migrations)}", flush=True)
    for src, dst in migrations:
        print(f"  {src} -> {dst}", flush=True)

    if args.dry_run:
        return

    total_migrated = 0
    total_failed = 0

    for src_bank, dst_bank in migrations:
        print(f"\n{'='*50}", flush=True)
        print(f"Migrating: {src_bank} -> {dst_bank}", flush=True)

        result = recall_all(args.api_base, src_bank, limit=500)
        memories = result.get("results", [])
        print(f"  Source: {len(memories)} memories", flush=True)

        if not memories:
            print(f"  (empty, skipping)", flush=True)
            continue

        items = []
        for mem in memories:
            content = mem.get("content", "") or mem.get("text", "") or ""
            if not content.strip():
                continue
            items.append({
                "content": content,
                "context": f"migrated from {src_bank}",
                "tags": mem.get("tags", []) + ["migration", src_bank],
            })

        print(f"  Items to migrate: {len(items)}", flush=True)
        if not items:
            continue

        success_count = 0
        for i in range(0, len(items), args.batch_size):
            batch = items[i:i+args.batch_size]
            ok, count = retain_to_bank(args.api_base, dst_bank, batch)
            if ok:
                success_count += count
            total_batches = (len(items) + args.batch_size - 1) // args.batch_size
            print(f"    batch {i//args.batch_size+1}/{total_batches}: {'OK' if ok else 'FAIL'} ({success_count}/{len(items)})", flush=True)
            time.sleep(1)

        total_migrated += success_count
        total_failed += (len(items) - success_count)
        print(f"  Result: {success_count}/{len(items)} migrated", flush=True)

    print(f"\n{'='*50}", flush=True)
    print(f"MIGRATION COMPLETE", flush=True)
    print(f"  Total migrated: {total_migrated}", flush=True)
    print(f"  Total failed: {total_failed}", flush=True)

    print(f"\n=== Final bank listing ===", flush=True)
    data = get_all_banks(args.api_base)
    for b in sorted(data.get("banks", []), key=lambda x: x["bank_id"]):
        tag = "MAC" if mac in b["bank_id"] else "LEGACY"
        print(f"  {tag}: {b['bank_id']}", flush=True)


if __name__ == "__main__":
    main()
