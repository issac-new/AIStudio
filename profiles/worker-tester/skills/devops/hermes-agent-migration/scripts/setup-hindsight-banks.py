#!/usr/bin/env python3
"""
Hindsight bank_id auto-configuration script
============================================
Detects the local machine's MAC address and updates all profiles'
hindsight/config.json, ensuring per-machine memory bank isolation.

Usage:
  python3 setup-hindsight-banks.py                     # auto-detect MAC
  python3 setup-hindsight-banks.py --mac AABBCCDDEEFF  # manual MAC
  python3 setup-hindsight-banks.py --dry-run            # preview only
  python3 setup-hindsight-banks.py --template "hermes-{MAC}-{profile}"  # custom

Supports: macOS (ifconfig), Linux (ip link), Windows (getmac).
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def detect_mac() -> str:
    """Detect the primary MAC address across macOS/Windows/Linux."""
    # macOS / Linux: ifconfig or ip link
    for cmd in [
        ["ifconfig", "en0"],          # macOS primary
        ["ifconfig"],                  # macOS/Linux fallback
        ["ip", "link", "show"],        # Linux
    ]:
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            for pattern in [r'ether\s+([0-9a-f:]{17})', r'link/ether\s+([0-9a-f:]{17})']:
                m = re.search(pattern, result.stdout)
                if m:
                    return m.group(1).replace(":", "").lower()
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue

    # Windows: getmac
    try:
        result = subprocess.run(["getmac", "/fo", "csv", "/nh"],
                              capture_output=True, text=True, timeout=5)
        for line in result.stdout.strip().split("\n"):
            parts = line.strip().strip('"').split('","')
            if parts and len(parts[0].replace("-", "")) == 12:
                mac = parts[0].replace("-", "").lower()
                if not mac.startswith(("0050", "00ff")):
                    return mac
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    # Fallback: hostname
    try:
        return subprocess.run(["hostname"], capture_output=True, text=True, timeout=5).stdout.strip().lower()
    except:
        return "unknown"


def find_profiles(hermes_home: Path) -> list[Path]:
    """Find all profile directories with hindsight/config.json."""
    profiles_dir = hermes_home / "profiles"
    if not profiles_dir.exists():
        return []
    result = []
    for prof in sorted(profiles_dir.iterdir()):
        cfg = prof / "hindsight" / "config.json"
        if cfg.exists():
            result.append(prof)
    return result


def update_config(config_path: Path, mac: str, dry_run: bool = False) -> bool:
    """Update bank_id_template with MAC-based isolation."""
    with open(config_path) as f:
        cfg = json.load(f)

    old_template = cfg.get("bank_id_template", "")
    new_template = f"hermes-{mac}-{{profile}}"

    if old_template == new_template:
        return False

    cfg["bank_id_template"] = new_template

    if dry_run:
        print(f"  [DRY-RUN] {config_path.parent.parent.name}: {old_template} -> {new_template}")
    else:
        with open(config_path, 'w') as f:
            json.dump(cfg, f, indent=2)
        print(f"  OK {config_path.parent.parent.name}: {old_template} -> {new_template}")
    return True


def main():
    parser = argparse.ArgumentParser(description="Setup Hindsight bank_id with MAC-based isolation")
    parser.add_argument("--mac", help="Manually specify MAC (without colons/dashes)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--hermes-home", default=str(Path.home() / ".hermes"),
                       help="Hermes home directory (default: ~/.hermes)")
    args = parser.parse_args()

    mac = args.mac.lower().replace(":", "").replace("-", "") if args.mac else detect_mac()
    print(f"Machine ID (MAC): {mac}")
    print(f"bank_id_template: hermes-{mac}-{{profile}}")
    print()

    hermes_home = Path(args.hermes_home)
    profiles = find_profiles(hermes_home)

    if not profiles:
        print(f"No profiles with hindsight/config.json found in {hermes_home}")
        sys.exit(1)

    print(f"Found {len(profiles)} profiles:")
    updated = 0
    for prof in profiles:
        cfg_path = prof / "hindsight" / "config.json"
        if update_config(cfg_path, mac, dry_run=args.dry_run):
            updated += 1

    print(f"\n{'Would update' if args.dry_run else 'Updated'} {updated}/{len(profiles)} profiles.")
    if not args.dry_run and updated > 0:
        print("\nNote: New banks will be auto-created on first memory write.")
        print("      Historical banks are preserved but no longer used.")
        print("      Run migrate-hindsight-banks.py to migrate old memories.")


if __name__ == "__main__":
    main()
