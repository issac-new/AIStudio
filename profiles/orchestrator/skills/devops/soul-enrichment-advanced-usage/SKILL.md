---
name: soul-enrichment-advanced-usage
description: >-
  Phase 4 and Phase 5 of the SOUL.md enrichment pipeline: advanced tool
  usage deep-dives (## 高级用法与实战技巧) and collaboration team
  enrichment completion. Extends soul-operability-quality-bar (default
  profile, cannot be patched from orchestrator). Also captures macOS
  Ruby gem PATH resolution failures and Docker fallback patterns for
  Ruby-dependent security tools (wpscan, evil-winrm).
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [soul-design, hack-team, collaboration-team, advanced-usage, ruby-gem]
    related_skills:
      - soul-operability-quality-bar
      - security-team-soul-enrichment
      - collaboration-team-soul-enrichment
      - macos-security-tool-install
---

# SOUL Enrichment — Advanced Usage Phase

After Phases 1-3 (catalog → commands → research), Phase 4 adds
`## 高级用法与实战技巧` with advanced patterns per tool. Phase 5 extends
the same enrichment to collaboration-team agents.

## Phase 4 — Advanced Usage Deep-Dive

### Dispatch pattern

3 parallel `delegate_task` subagents, each handling 2 agents:

| Subagent | Agents | Advanced topics |
|----------|--------|-----------------|
| Task 0 | hack-recon + hack-forensics | nmap NSE scripts/fragmentation/source-port evasion, subfinder multi-source chaining, httpx fingerprint depth, ffuf multi-position/multi-wordlist, nuclei template writing/OOB; Volatility3 all plugin categories (pslist/psscan/netstat/malfind/handles/svcscan), tshark protocol hierarchy/conversation/follow-stream, YARA rule writing (meta/strings/condition/hex/regex) |
| Task 1 | hack-auditor + hack-c2 | Semgrep custom rule writing (pattern+metavariable-regex+message), CI mode --ci --error, autofix, SARIF; Trivy multi-mode (image/fs/repo/k8s) + SBOM; CodeQL database creation + query suites; Sliver full workflow (implant/listener/sessions/port-forward/SOCKS5), Impacket full toolkit (secretsdump/GetUserSPNs/GetNPUsers/ntlmrelayx), BloodHound custom Cypher queries, Certipy ESC1-ESC8 |
| Task 2 | hack-exploit + hack-weapons | sqlmap tamper scripts/WAF bypass (--tamper=space2comment,between,randomcase), --second-order, --os-shell, --file-read/write; ffuf multi-position (FUZZ1/FUZZ2), vhost fuzzing, post data fuzzing; Burp Intruder payload types (sniper/battering ram/pitchfork/cluster bomb), Collaborator OAST; Hashcat rule chains, mask attacks, combination/hybrid modes, session restore; MSFVenom all platforms, encoder iteration, bad chars; Evilginx2 phishlet config, 2FA bypass flow |

### Results (2026-07 session)

After Phase 4, all 6 hack agents had `## 高级用法与实战技巧` sections.
SOUL.md sizes grew from ~2,662 lines to ~4,029 lines total.

## Phase 5 — Collaboration Team Completion

The collaboration-team enrichment (Phase 5) follows the same pattern as
hack team but with software-engineering toolchains instead of security tools.

### Results (2026-07 session)

| Agent | Before | After | Delta | Code blocks |
|-------|--------|-------|-------|-------------|
| architect | 42 | 218 | +176 | 7 |
| project-manager | 80 | 215 | +135 | 8 |
| requirement-analyst | 40 | 141 | +101 | 2 |
| worker-coder | 205 | 348 | +143 | 11 |
| worker-deployer | 138 | 286 | +148 | 9 |
| worker-reviewer | 148 | 253 | +105 | 7 |
| worker-tester | 144 | 260 | +116 | 8 |
| **Total** | **797** | **1,721** | **+924** | **52** |

### Known gap

Phase 4 (advanced usage) was NOT applied to collaboration agents — only
Phase 1 (command manuals). If the user requests deeper collaboration agent
enrichment, add `## 高级用法与实战技巧` covering:
- worker-coder: ACP delegation patterns, multi-language debug workflows
- worker-deployer: Docker multi-stage builds, K8s rolling updates
- worker-reviewer: Custom Semgrep rules, SARIF aggregation
- worker-tester: Test pyramid strategy, property-based testing

## macOS Ruby Gem PATH Resolution

### Problem

System Ruby on macOS is 2.6. Security tools requiring Ruby ≥3.2 (wpscan,
evil-winrm) cannot install via system `gem`. `brew install ruby` installs
to `/opt/homebrew/opt/ruby/bin/` but non-interactive shells (the terminal
tool) still resolve to system Ruby 2.6 because PATH isn't updated.

### What works

| Tool | Method | Notes |
|------|--------|-------|
| zsteg | `/usr/bin/gem install zsteg --user-install` | Works on Ruby 2.6. Add `~/.gem/ruby/2.6.0/bin` to PATH |
| whatweb | `pipx install whatweb` | Python reimplementation, no Ruby needed |
| wpscan | `docker run --rm wpscanteam/wpscan [args]` | Docker is the only reliable method on macOS |
| evil-winrm | Docker or `rbenv install 3.2 && rbenv shell 3.2` | Needs Ruby ≥2.7 |

### Verification

```bash
export PATH="/opt/homebrew/bin:$HOME/.local/bin:$HOME/go/bin:$HOME/.gem/ruby/2.6.0/bin:$PATH"
which zsteg   # → ~/.gem/ruby/2.6.0/bin/zsteg
which whatweb # → ~/.local/bin/whatweb (pipx)
# wpscan/evil-winrm: use docker
```

## Skill Overlap Notes

The following skills overlap and may be consolidated by the curator:

- `soul-operability-quality-bar` — quality threshold + 3-phase workflow
- `security-team-soul-enrichment` — hack team tool catalogs + Burp guide
- `collaboration-team-soul-enrichment` — collaboration team command manuals
- `agent-soul-patching` — batch patch techniques
- `macos-security-tool-install` — tool installation reference

This skill extends all five with Phase 4/5 learnings and the Ruby gem
PATH resolution issue. The default-profile originals cannot be patched
from orchestrator (`skill_manage cross_profile=True` does not work for
symlinked skills — confirmed again in this session).

## Related Skills

- **soul-operability-quality-bar** (default) — quality threshold definition
- **security-team-soul-enrichment** (default) — hack team enrichment phases 1-3
- **collaboration-team-soul-enrichment** (default) — collaboration team enrichment
- **macos-security-tool-install** (default) — tool installation reference
- **agent-soul-patching** (default) — batch patch techniques
