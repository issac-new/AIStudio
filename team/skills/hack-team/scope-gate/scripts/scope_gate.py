#!/usr/bin/env python3
"""
scope_gate.py — 确定性 Scope 门禁
Inspired by Threatswarm scope_check.py (226 lines, PreToolUse exit 2 hard-block)

Usage:
    python3 scope_gate.py check "nmap -sV 192.168.1.1"
    python3 scope_gate.py check "curl https://target.com/api" --strict
    python3 scope_gate.py check-script exploit.sh
"""

import argparse
import ipaddress
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path


# ── 60+ network tools with word-boundary matching ─────────────────────────────
# Prevents false positives: \bnmap\b won't match "sync" or "hashcat"

NETWORK_TOOLS = [
    # Port scanners
    r"\bnmap\b", r"\bmasscan\b", r"\brustscan\b", r"\bnaabu\b", r"\bzmap\b",
    # Web scanners
    r"\bnuclei\b", r"\bhttpx\b", r"\bffuf\b", r"\bgobuster\b", r"\bdirsearch\b",
    r"\bferoxbuster\b", r"\bwfuzz\b", r"\bnikto\b", r"\bwpscan\b", r"\bjoomscan\b",
    r"\bdroopescan\b",
    # Vulnerability scanners
    r"\bsqlmap\b", r"\bcommix\b", r"\bxsstrike\b",
    # Password attacks
    r"\bhydra\b", r"\bmedusa\b", r"\bhashcat\b", r"\bjohn\b", r"\bcrackmapexec\b",
    r"\bmimikatz\b",
    # Network utilities
    r"\bcurl\b", r"\bwget\b", r"\bnc\b", r"\bnetcat\b", r"\bsocat\b",
    r"\btelnet\b", r"\bssh\b", r"\bsmbclient\b", r"\brpcclient\b", r"\brdesktop\b",
    r"\bvncviewer\b", r"\bftp\b", r"\btftp\b",
    # Recon tools
    r"\bsubfinder\b", r"\bamass\b", r"\bassetfinder\b", r"\btheHarvester\b",
    r"\brecon-ng\b", r"\bshodan\b", r"\bcensys\b", r"\bfofa\b",
    # DNS tools
    r"\bdig\b", r"\bnslookup\b", r"\bhost\b", r"\bwhois\b", r"\bdnsrecon\b",
    r"\bdnsenum\b", r"\bfierce\b",
    # Exploitation frameworks
    r"\bmsfconsole\b", r"\bmsfvenom\b", r"\bmetasploit\b",
    # Packet tools
    r"\btcpdump\b", r"\bwireshark\b", r"\btshark\b", r"\bettercap\b",
    r"\barpspoof\b", r"\bmacchanger\b",
    # Other
    r"\bping\b", r"\btraceroute\b", r"\btracepath\b", r"\bmtr\b",
    r"\baircrack-ng\b", r"\bairodump-ng\b", r"\bwifite\b",
]

# Compile tool patterns
TOOL_PATTERNS = [re.compile(p, re.IGNORECASE) for p in NETWORK_TOOLS]

# ── False positive filters ────────────────────────────────────────────────────

FP_PATTERNS = [
    # Version strings only when explicitly in version context (checked separately)
    # Removed overly broad: re.compile(r"\bv?\d+\.\d+\.\d+\b"),
    # Python method chains
    re.compile(r"\b\w+\.(stdout|stderr|text|content|json|read|write)\b"),
    # File extensions (require alpha prefix, not just digits like .1 in IPs)
    # Exclude common TLDs which are part of domain names
    re.compile(r"\.(py|txt|json|md|sh|js|ts|yaml|yml|xml|html|css|sql|log|conf|cfg|ini|env|lock|toml)$"),
    # Common non-target strings
    re.compile(r"\b(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)\b", re.IGNORECASE),
]

# ── IP/Hostname extraction ────────────────────────────────────────────────────

# IPv4 pattern (simple but effective for command-line extraction)
IPV4_PATTERN = re.compile(r"\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b")

# Hostname pattern (domain-like strings)
HOSTNAME_PATTERN = re.compile(
    r"\b([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,})\b"
)


@dataclass
class ScopeEntry:
    """A single authorized scope entry."""
    raw: str
    type: str  # 'cidr', 'ip', 'domain', 'wildcard'
    value: str

    def matches(self, target: str) -> bool:
        """Check if target matches this scope entry."""
        target = target.lower().strip()

        if self.type == "cidr":
            try:
                network = ipaddress.ip_network(self.value, strict=False)
                # Try as IP first
                try:
                    ip = ipaddress.ip_address(target)
                    return ip in network
                except ValueError:
                    # Try as hostname that resolves to IP in range
                    # (We can't resolve DNS here, so we skip)
                    return False
            except ValueError:
                return False

        elif self.type == "ip":
            return target == self.value

        elif self.type == "domain":
            # Exact domain match or subdomain
            return target == self.value or target.endswith("." + self.value)

        elif self.type == "wildcard":
            # *.example.com matches sub.example.com but not example.com
            base = self.value.lstrip("*.")
            return target.endswith("." + base) and target != base

        return False


class ScopeGate:
    """Deterministic scope enforcement."""

    def __init__(self, scope_file: str = "scope.txt", strict: bool = False):
        self.scope_file = scope_file
        self.strict = strict
        self.entries: list[ScopeEntry] = []
        self._load_scope()

    def _load_scope(self) -> None:
        """Load and parse scope.txt."""
        scope_path = Path(self.scope_file)

        if not scope_path.exists():
            if self.strict:
                print(f"🔴 SCOPE ERROR: {self.scope_file} not found (strict mode)", file=sys.stderr)
                sys.exit(2)
            else:
                print(f"⚠️  No {self.scope_file} found — proceeding with warning", file=sys.stderr)
                return

        for line in scope_path.read_text().splitlines():
            line = line.strip()

            # Skip comments and empty lines
            if not line or line.startswith("#"):
                continue

            entry = self._parse_entry(line)
            if entry:
                self.entries.append(entry)

        if not self.entries and self.strict:
            print(f"🔴 SCOPE ERROR: {self.scope_file} is empty (strict mode)", file=sys.stderr)
            sys.exit(2)

    def _parse_entry(self, line: str) -> ScopeEntry | None:
        """Parse a single scope entry."""
        # CIDR: 192.168.1.0/24
        if "/" in line:
            try:
                network = ipaddress.ip_network(line, strict=False)
                return ScopeEntry(raw=line, type="cidr", value=str(network))
            except ValueError:
                return None

        # Wildcard: *.example.com
        if line.startswith("*."):
            return ScopeEntry(raw=line, type="wildcard", value=line)

        # Single IP: 192.168.1.1
        try:
            ip = ipaddress.ip_address(line)
            return ScopeEntry(raw=line, type="ip", value=str(ip))
        except ValueError:
            pass

        # Domain: example.com
        if re.match(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.[a-zA-Z]{2,}$", line):
            return ScopeEntry(raw=line, type="domain", value=line)

        return None

    def extract_targets(self, command: str) -> list[str]:
        """Extract potential targets (IPs and hostnames) from command."""
        targets = []

        # Check if any network tool is invoked
        tool_invoked = any(p.search(command) for p in TOOL_PATTERNS)
        if not tool_invoked:
            return []  # No network tool = no scope check needed

        # Extract IPs
        for match in IPV4_PATTERN.finditer(command):
            ip = match.group(1)
            if not self._is_false_positive(ip, command):
                targets.append(ip)

        # Extract hostnames
        for match in HOSTNAME_PATTERN.finditer(command):
            hostname = match.group(1)
            if not self._is_false_positive(hostname, command):
                targets.append(hostname)

        return targets

    def _is_false_positive(self, target: str, command: str) -> bool:
        """Check if extracted target is a false positive."""
        # Always allow localhost
        if target in ("localhost", "127.0.0.1", "::1"):
            return True

        # Check FP patterns
        for pattern in FP_PATTERNS:
            if pattern.search(target):
                return True

        # Check if target appears in a version string context
        # e.g., "nmap version 7.94" — 7.94 is not a target
        version_context = re.search(rf"\b(version|v|ver)\s+{re.escape(target)}\b", command, re.IGNORECASE)
        if version_context:
            return True

        return False

    def check(self, command: str) -> tuple[bool, str]:
        """
        Check if command targets are within authorized scope.
        Returns (allowed, message).
        """
        targets = self.extract_targets(command)

        if not targets:
            return True, "✓ No network targets detected"

        # If no scope entries, warn but allow (unless strict)
        if not self.entries:
            if self.strict:
                return False, f"🔴 No scope.txt entries (strict mode). Targets: {', '.join(targets)}"
            else:
                return True, f"⚠️  No scope.txt — proceeding with warning. Targets: {', '.join(targets)}"

        # Check each target against scope
        violations = []
        for target in targets:
            matched = any(entry.matches(target) for entry in self.entries)
            if not matched:
                violations.append(target)

        if violations:
            scope_summary = ", ".join(e.raw for e in self.entries)
            return False, (
                f"🔴 SCOPE VIOLATION: {', '.join(violations)} not in authorized scope\n"
                f"   Authorized: {scope_summary}"
            )

        return True, f"✓ Scope check passed: {', '.join(targets)}"

    def check_script(self, script_path: str) -> tuple[bool, str]:
        """Check all commands in a script file."""
        path = Path(script_path)
        if not path.exists():
            return False, f"🔴 Script not found: {script_path}"

        content = path.read_text()
        lines = content.splitlines()

        violations = []
        for i, line in enumerate(lines, 1):
            # Skip comments and empty lines
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            allowed, msg = self.check(stripped)
            if not allowed:
                violations.append(f"  Line {i}: {stripped}\n    {msg}")

        if violations:
            return False, f"🔴 Script contains scope violations:\n" + "\n".join(violations)

        return True, f"✓ Script check passed: {len(lines)} lines scanned"

    def check_script_structured(self, script_path: str) -> dict:
        """
        Check all commands in a script file, return structured results for SARIF.
        Returns: {"violations": [{"line": int, "command": str, "message": str, "targets": list}], "total_lines": int, "passed": bool}
        """
        path = Path(script_path)
        if not path.exists():
            return {"violations": [{"line": 0, "command": "", "message": f"Script not found: {script_path}", "targets": []}], "total_lines": 0, "passed": False}

        content = path.read_text()
        lines = content.splitlines()

        violations = []
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            targets = self.extract_targets(stripped)
            if not targets:
                continue

            # Check each target against scope
            for target in targets:
                matched = any(entry.matches(target) for entry in self.entries)
                if not matched:
                    scope_summary = ", ".join(e.raw for e in self.entries) if self.entries else "(empty)"
                    violations.append({
                        "line": i,
                        "command": stripped,
                        "message": f"Target {target} not in authorized scope. Authorized: {scope_summary}",
                        "targets": [target],
                        "rule_id": "SCOPE001",
                        "severity": "error"
                    })

        return {
            "violations": violations,
            "total_lines": len(lines),
            "passed": len(violations) == 0
        }

    def check_to_sarif(self, script_path: str) -> dict:
        """Convert check_script_structured results to SARIF 2.1.0 format."""
        result = self.check_script_structured(script_path)
        
        sarif = {
            "$schema": "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
            "version": "2.1.0",
            "runs": [{
                "tool": {
                    "driver": {
                        "name": "scope_gate",
                        "version": "1.0.0",
                        "informationUri": "https://github.com/mukul975/Threatswarm",
                        "rules": [{
                            "id": "SCOPE001",
                            "name": "ScopeViolation",
                            "shortDescription": {"text": "Command targets host outside authorized scope"},
                            "fullDescription": {"text": "The command targets an IP or hostname not listed in scope.txt"},
                            "defaultConfiguration": {"level": "error"}
                        }]
                    }
                },
                "results": []
            }]
        }
        
        for v in result["violations"]:
            sarif["runs"][0]["results"].append({
                "ruleId": v.get("rule_id", "SCOPE001"),
                "level": v.get("severity", "error"),
                "message": {"text": v["message"]},
                "locations": [{
                    "physicalLocation": {
                        "artifactLocation": {"uri": script_path},
                        "region": {"startLine": v["line"]}
                    }
                }]
            })
        
        return sarif


def main():
    parser = argparse.ArgumentParser(description="Deterministic scope gate for security commands")
    subparsers = parser.add_subparsers(dest="action", required=True)

    # check command
    check_parser = subparsers.add_parser("check", help="Check a single command")
    check_parser.add_argument("command", help="Command to check")
    check_parser.add_argument("--strict", action="store_true", help="Strict mode: fail if no scope.txt")
    check_parser.add_argument("--scope-file", default="scope.txt", help="Path to scope file")

    # check-script command
    script_parser = subparsers.add_parser("check-script", help="Check all commands in a script")
    script_parser.add_argument("script", help="Script file to check")
    script_parser.add_argument("--strict", action="store_true", help="Strict mode: fail if no scope.txt")
    script_parser.add_argument("--scope-file", default="scope.txt", help="Path to scope file")

    args = parser.parse_args()

    gate = ScopeGate(scope_file=args.scope_file, strict=args.strict)

    if args.action == "check":
        allowed, msg = gate.check(args.command)
        print(msg)
        sys.exit(0 if allowed else 2)

    elif args.action == "check-script":
        allowed, msg = gate.check_script(args.script)
        print(msg)
        sys.exit(0 if allowed else 2)


if __name__ == "__main__":
    main()
