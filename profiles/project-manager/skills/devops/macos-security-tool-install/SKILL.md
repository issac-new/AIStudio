---
name: macos-security-tool-install
description: >-
  Install and verify 58+ security tools on macOS (Apple Silicon) for the hack
  team. Covers brew bottle mirror failures, PEP 668 pipx workaround, Go PATH
  issues for non-interactive shells, pre-compiled binary fallback (feroxbuster),
  impacket per-script model, and NSE script installation. Includes a copy-paste
  verification script. Use when setting up a new machine for the hack team,
  when a tool from a SOUL.md is not found, or after a macOS upgrade breaks
  tool paths.
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [hack-team, tool-installation, macos, brew, pipx, go]
    related_skills:
      - soul-operability-quality-bar
      - security-team-soul-enrichment
      - multi-board-team-deployment
---

# macOS Security Tool Installation

Install and verify the 58 security tools referenced across 6 hack team
agents' SOUL.md files on macOS (Apple Silicon).

## When to Use

- Setting up a new machine for the hack team
- A tool from a SOUL.md command manual is `command not found`
- After a macOS upgrade that breaks Homebrew or Go paths
- Verifying tool availability before dispatching hack team tasks

## Installation by Package Manager

### Brew (19 tools)

```bash
brew install sqlmap hydra nikto gobuster hashcat john \
  semgrep trivy grype kics dive lynis gitleaks \
  radare2 binwalk yara osv-scanner
```

**Common failure**: Aliyun/Tuna mirror cache miss — bottle download fails with
`No such file or directory @ rb_sysopen`. Fix:

```bash
brew cleanup -s
rm -rf ~/Library/Caches/Homebrew/downloads/*
export HOMEBREW_BOTTLE_DOMAIN=""   # bypass mirror, use GHCR directly
brew install <tool>
```

**feroxbuster**: Brew needs Rust (also has bottle issues). Download
pre-compiled binary from GitHub releases:

```bash
# Find correct asset name via API
curl -sL "https://api.github.com/repos/epi052/feroxbuster/releases/latest" | \
  python3 -c "import json,sys; [print(a['browser_download_url']) for a in json.load(sys.stdin)['assets'] if 'aarch64-macos' in a['name']]"
# Download and install
curl -sL <url> -o /tmp/ferox.tar.gz && tar xzf /tmp/ferox.tar.gz -C /tmp/
cp /tmp/feroxbuster /opt/homebrew/bin/
```

### Go (10 tools)

```bash
export GOPATH=~/go && export PATH=$PATH:$(go env GOPATH)/bin

go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest
go install github.com/ffuf/ffuf/v2@latest
go install github.com/projectdiscovery/katana/cmd/katana@latest
go install github.com/lc/gau/v2/cmd/gau@latest
go install github.com/tomnomnom/waybackurls@latest
go install github.com/projectdiscovery/naabu/v2/cmd/naabu@latest
go install github.com/projectdiscovery/dnsx/cmd/dnsx@latest
go install github.com/projectdiscovery/uncover/cmd/uncover@latest
go install github.com/hahwul/dalfox/v2@latest
```

**Pitfall**: Go binaries install to `~/go/bin/` which is NOT in PATH for
non-interactive shells (the terminal tool runs a non-login shell). Always
prepend `export PATH="/opt/homebrew/bin:$HOME/.local/bin:$HOME/go/bin:$PATH"`
in verification and usage scripts.

**Pitfall**: `go install github.com/s0md3v/Arjun@latest` fails (module doesn't
contain root package). Use `pipx install arjun` instead.

### pipx (8 tools — PEP 668 workaround)

PEP 668 prevents `pip install --user` on Homebrew Python. Use `pipx`:

```bash
brew install pipx && pipx ensurepath

pipx install volatility3     # → vol
pipx install bandit
pipx install impacket        # → secretsdump.py, wmiexec.py, psexec.py, etc.
pipx install certipy-ad      # → certipy
pipx install commix
pipx install arjun
pipx install cupp
pipx install shodan
pipx install pip-audit
```

**Pitfalls**:
- `pipx install theHarvester` fails (no CLI entrypoint — it's a library)
- `pipx install stegseek` fails on macOS (needs apt deps)
- `pipx install netexec` fails (not on PyPI) →
  `pipx install git+https://github.com/Pennyw0rth/NetExec.git`

### Impacket Tool Chain

Impacket installs as individual `.py` scripts, NOT a single `impacket` command:

```
secretsdump.py  wmiexec.py  psexec.py  smbexec.py
ntlmrelayx.py   GetUserSPNs.py  GetNPUsers.py
```

Verify with: `which secretsdump.py` (not `which impacket`).

### Git Clone (6 repos to ~/security-tools/)

```bash
mkdir -p ~/security-tools && cd ~/security-tools
git clone --depth 1 https://github.com/trustedsec/social-engineer-toolkit.git setoolkit
git clone --depth 1 https://github.com/internetwache/GitTools.git
git clone --depth 1 https://github.com/swisskyrepo/PayloadsAllTheThings.git
git clone --depth 1 https://github.com/danielmiessler/SecLists.git
git clone --depth 1 https://github.com/HackTricks-wiki/hacktricks.git
git clone --depth 1 https://github.com/TheWover/donut.git
```

**Pitfall**: `airgeddon` repo `v1s1k0r/airgeddon` returns 404 (repo removed/renamed).

### NSE Scripts

```bash
mkdir -p ~/.local/share/nmap/scripts
curl -sL https://raw.githubusercontent.com/vulnersCom/nmap-vulners/main/vulners.nse \
  -o ~/.local/share/nmap/scripts/vulners.nse
```

### Tools Not Installable on macOS

| Tool | Reason | Alternative |
|------|--------|-------------|
| stegseek | Needs apt/system deps | steghide (brew) |
| airgeddon | Repo not found | Use bettercap directly |
| wifite | Needs wlan interfaces | Not applicable on macOS |
| masscan | Brew bottle may fail | `brew install --build-from-source masscan` |

## Verification Script

Run this after all installations to confirm 58 tools are available:

```bash
#!/bin/bash
export PATH="/opt/homebrew/bin:$HOME/.local/bin:$HOME/go/bin:$PATH"

TOOLS="sqlmap hydra nikto gobuster hashcat john semgrep trivy grype kics dive \
lynis gitleaks radare2 binwalk yara dalfox feroxbuster osv-scanner \
subfinder nuclei ffuf katana gau waybackurls naabu dnsx uncover hakrawler \
vol bandit certipy commix arjun cupp shodan pip-audit"

installed=0; missing=0; missing_list=""
for t in $TOOLS; do
    p=$(which $t 2>/dev/null || ls ~/go/bin/$t 2>/dev/null)
    if [ -n "$p" ]; then installed=$((installed+1))
    else missing=$((missing+1)); missing_list="$missing_list $t"; fi
done

# Impacket per-script check
for t in secretsdump.py wmiexec.py psexec.py; do
    p=$(which $t 2>/dev/null)
    if [ -n "$p" ]; then installed=$((installed+1))
    else missing=$((missing+1)); missing_list="$missing_list $t"; fi
done

echo "Installed: $installed | Missing: $missing"
[ -n "$missing_list" ] && echo "Missing:$missing_list"
```

## Conda Interference

The host has Anaconda installed at `/opt/anaconda3`. Conda's `conda` command
may intercept `pip` and `gem` calls, producing "An unexpected error has
occurred" reports. This is a **conda plugin error**, not a pip/gem error —
the actual install may still succeed underneath the noise.

**Fix**: Use `/opt/homebrew/bin/python3 -m pip` explicitly, or use `pipx`
(which creates isolated venvs that bypass conda entirely).

## Related Skills

- **soul-operability-quality-bar** — quality threshold for SOUL.md files
- **security-team-soul-enrichment** — tool catalog integration into SOUL.md
- **multi-board-team-deployment** — hack team creation and board setup
