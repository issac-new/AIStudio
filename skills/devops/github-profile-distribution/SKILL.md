---
name: github-profile-distribution
description: >-
  Sync local Hermes Agent profiles to a public GitHub distribution repository
  (e.g. issac-new/SwarmTeam). Covers the 5-step clone→sync→sanitize→scan→push
  workflow, public-repo sanitization (real emails, username paths), SOUL.md
  capability extraction for README generation, and bilingual README authoring.
  Complements hermes-agent-migration (which covers zip/tarball packaging) with
  the GitHub-native incremental sync workflow.
triggers:
  - "重新分发 profile 至 GitHub"
  - "redistribute profiles to GitHub"
  - "sync profiles to GitHub repo"
  - "update SwarmTeam repo"
  - "push profiles to GitHub"
  - "GitHub distribution sync"
---

# GitHub Profile Distribution Sync

## 🔴 RED LINE: Forbidden Teams (MUST ENFORCE)

**The following teams MUST NEVER be published to GitHub. This is non-negotiable.**

| Team | Forbidden Profiles | Reason |
|------|--------------------|--------|
| **[已移除]** | `[已移除]-orchestrator`, `[已移除]`, `[已移除]`, `[已移除]`, `[已移除]`, `[已移除]` | Children's education data — privacy sensitive |
| **[已移除]** | `[已移除]`, `[已移除]`, `[已移除]`, `[已移除]`, `[已移除]*`, `[已移除]*` | Proprietary [已移除] research |
| **hack** | `hack-recon`, `hack-exploit`, `hack-forensics`, `hack-auditor`, `hack-c2*`, `hack-weapons*` | Security/offensive tooling — do not publish |

**Enforcement procedure (MUST run before any sync):**

1. Before syncing, scan the target repo for forbidden profile directories and DELETE them if found:
```bash
# Delete forbidden team profiles from the repo before syncing
for team in [已移除] [已移除] hack [已移除]; do
  find /tmp/<RepoName>/profiles/ -maxdepth 1 -type d -name "${team}-*" -exec rm -rf {} +
  find /tmp/<RepoName>/profiles/ -maxdepth 1 -type d -name "${team}_*" -exec rm -rf {} +
done
```

2. When syncing FROM local `~/.hermes/`, SKIP these teams entirely — never copy them into the repo:
```python
FORBIDDEN_TEAMS = {"[已移除]", "[已移除]", "hack", "[已移除]"}
forbidden_prefixes = tuple(f"{t}-" for t in FORBIDDEN_TEAMS)
# Only sync profiles whose directory name does NOT start with a forbidden prefix
profiles_to_sync = [d for d in profile_dirs if not d.name.startswith(forbidden_prefixes)]
```

3. After sync, verify NO forbidden profiles exist in the repo:
```bash
ls /tmp/<RepoName>/profiles/ | grep -E '^([已移除]|[已移除]-|hack-|[已移除]-)' && echo "ERROR: forbidden profiles found!" && exit 1 || echo "OK: clean"
```

4. If forbidden profiles were PREVIOUSLY published, they MUST be deleted from git history:
```bash
# Remove from current tree
git rm -r profiles/[已移除]-* profiles/[已移除]-* profiles/hack-* profiles/[已移除]-* 2>/dev/null
# Use git filter-repo to purge from history (if previously committed)
git filter-repo --invert-paths --path-glob 'profiles/[已移除]-*' --path-glob 'profiles/[已移除]-*' --path-glob 'profiles/hack-*' --path-glob 'profiles/[已移除]-*' --force
git push origin main --force
```

**Only these teams may be published:** `swarm`, `product`, `ops`, `platform`.

## When to Use

- User says "重新分发 profile 至 GitHub" / "redistribute profiles to GitHub"
- Syncing local `~/.hermes/` changes to an existing GitHub distribution repo
- Updating a SwarmTeam-style multi-profile repository after local config changes
- Rewriting/updating the repo README to reflect current profile content

## Relationship to hermes-agent-migration

`hermes-agent-migration` covers **zip/tarball** packaging (Mode A/B/C/D) for
cross-machine migration. This skill covers the **GitHub-native** workflow:
clone the repo, sync changed files, sanitize for public release, push. The
key difference is **public repo sanitization** is more aggressive (real emails,
username paths) and the repo is maintained incrementally (not one-shot).

## Workflow (5 steps)

### Step 1: Clone the distribution repo

```bash
cd /tmp && rm -rf <RepoName>
gh repo clone <user>/<RepoName> -- --depth 5
```

Use `--depth 5` — the repo may have 55K+ files (bundled skills per profile).

Verify `gh auth status` is logged in before cloning.

### Step 2: Sync profile files from local ~/.hermes

Copy ONLY distribution-relevant files — never runtime data.

**Per-profile files to sync:**
- `SOUL.md` — personality
- `config.yaml` — model, toolsets, agent params
- `distribution.yaml` — manifest (name, version, env_requires)
- `profile.yaml` — display metadata
- `*_rules.md` — role-specific rules (glob)
- `email_kanban_rules.md` — orchestrator-only

**Shared/global files to sync:**
- `shared/profiles.yaml`, `shared/generate-configs.py`, `shared/setup-hindsight-banks.py`
- `shared/start-gateway-with-dashboard.sh`, `shared/README.md`
- `config.yaml` (global), `SOUL.md` (global), `global_kanban_rules.md`

**Do NOT sync:** `.env`, `auth.json`, `sessions/`, `logs/`, `state.db*`,
`gateway_state.json`, `kanban.db`, `cache/`, `memories/`, `.curator_backups/`

Use `execute_code` with `shutil.copy2` to batch-sync all 23 profiles + shared + global in one call.

### Step 3: Sanitize for PUBLIC release

Public GitHub = more aggressive sanitization than private migration zip.

```python
import re
REPLACEMENTS = [
    (r'HK_MAIL@qq\.com', 'your@email.com'),   # real personal email → placeholder
    (r'/Users/<username>/', '$HOME/'),            # macOS user paths → $HOME
    (r'/Users/<username>(?=\s|$|["\'\)])', '$HOME'),
]
```

**Find files needing sanitization** (exclude .git/, skills/, plugins/):
```bash
grep -rl --include=*.md --include=*.yaml --include=*.py --include=*.sh \
  -E "HK_MAIL@qq\.com|/Users/<username>" /tmp/<RepoName>/ \
  | grep -v '.git/' | grep -v '/skills/' | grep -v '/plugins/'
```

**Plugin removal propagation**: If a plugin was removed from `profiles.yaml`
locally (e.g. `memtensor`), verify it's also gone from all `profiles/*/config.yaml`:
```bash
grep -rn "memtensor" /tmp/<RepoName>/profiles/*/config.yaml  # should be empty
```

### Step 4: Secret scan (CRITICAL — public repo)

Scan for ALL credential patterns before committing:

```python
PATTERNS = {
    "sk- API keys":         r'sk-[a-zA-Z0-9]{20,}',
    "gho_ GitHub tokens":   r'gho_[a-zA-Z0-9]{30,}',
    "syt_ Matrix tokens":   r'syt_[a-zA-Z0-9_]{20,}',
    "password pattern":  r'(Test|Sys)Pass\d+',
    "real email":           r'HK_MAIL@qq\.com',
    "username path":        r'/Users/<username>',
    "username in text":     r'<username>',
}
```

Exclude `.git/`, `/skills/`, `/plugins/` from the scan — skills may contain
`sk-REDACTED` examples (already sanitized), plugins may reference removed
plugins in their own code.

### Step 5: Commit and push

```bash
cd /tmp/<RepoName>
git add -A
git diff --cached --stat  # review what changed
git commit -m "feat: v1.x.0 — sync <description>"
git push origin main
```

## Public-repo sanitization patterns

| Pattern | Why | Example |
|---------|-----|---------|
| Real personal emails → `your@email.com` | Public repo = anyone can read | `your@email.com` → `your@email.com` |
| macOS user paths → `$HOME/` | Leaks username | `$HOME/` → `$HOME/` |
| Username in text → generic | Leaks username in prose | `cuishi` → removed |
| Plugin removal propagation | Config must match profiles.yaml | `memtensor` removed from all config.yaml |
| SwarmStudio node version | MCP command path update | `0.18.0` → `0.19.0` |

## README Authoring for Multi-Profile Distributions

### Extracting profile capabilities from SOUL.md

When rewriting the README to reflect current profile content, extract role
title, role identity, and core capabilities from each SOUL.md programmatically:

```python
import re

content = soul_path.read_text()
# Remove code blocks — Python comments inside them match the heading regex
clean = re.sub(r'```[^\n]*\n.*?```', '', content, flags=re.DOTALL)

# 1. Real title: first # heading that is NOT the ACP enforcement block
headings = re.findall(r'^#\s+(.+)$', clean, re.MULTILINE)
real_title = next(h for h in headings
                  if "强制规则" not in h and "ACP" not in h and "编码开发" not in h)

# 2. "你是谁" section: bullet items with bold title + colon
who_section = re.search(r'##\s*你是谁\s*\n(.*?)(?=\n##\s|\Z)', clean, re.DOTALL)
who_items = re.findall(r'^-\s+\*?\*?(.+?)\*?\*?[：:—]', who_section.group(1), re.MULTILINE)

# 3. "核心职责" section: numbered items
core_section = re.search(r'##\s*核心职责\s*\n(.*?)(?=\n##\s|\Z)', clean, re.DOTALL)
duties = re.findall(r'\d+\.\s+\*?\*?(.+?)\*?\*?[：:—]', core_section.group(1))

# 4. "工作流程" section (fallback when 核心职责 has no match)
wf_section = re.search(r'##\s*工作流程\s*\n(.*?)(?=\n##\s|\Z)', clean, re.DOTALL)

# 5. SOUL.md line count (depth indicator)
lines = len(content.splitlines())
```

**Pitfall: ACP block is the first `#` heading.** Every SOUL.md starts with
`## 🔴 强制规则：编码开发必须通过 ACP 调用 Claude Code`. The real role title
(e.g. `# 架构师 (Architect)`) is the SECOND `#` heading. Skip headings
containing "强制规则", "ACP", or "编码开发".

**Pitfall: Code blocks contain `#` comments.** SOUL.md files contain Python
code blocks with `# 1. 先发现可用 agent` comments that match `^#\s+`. Always
strip code blocks (`re.sub(r'```...```', '', content, flags=re.DOTALL)`) before
regex-matching headings.

**Pitfall: "核心职责" vs "工作流程".** Some profiles use `## 核心职责` for
duties, others use `## 工作流程`. Try 核心职责 first, fall back to 工作流程.

### Bilingual README pattern

User prefers **Chinese + English dual-language** format throughout:

- Section titles: `## Quick Start / 快速开始`
- Table headers: `| Profile | Title / 标题 | Role Identity / 角色定位 | Core Capabilities / 核心能力 | SOUL Lines |`
- Table cells: `Scout, not attacker / 侦察兵，不是突击手`
- Prose: English sentence, then Chinese translation (or vice versa)
- Code comments: `# Install all profiles / 安装全部 profile`

### Profile capability table columns

| Column | Source | Example |
|--------|--------|---------|
| Profile | directory name | `hack-recon` |
| Title / 标题 | SOUL.md `#` heading | `侦察工程师 (Hack-Recon)` |
| Role Identity / 角色定位 | "你是谁" section, first bullet | `Scout, not attacker / 侦察兵，不是突击手` |
| Core Capabilities / 核心能力 | "核心职责" or "工作流程" items | `OSINT & passive recon; attack surface discovery; ...` |
| SOUL Lines | `wc -l SOUL.md` | `172` |

## Differences from zip migration (Mode B)

| Aspect | Zip migration (Mode B) | GitHub distribution |
|--------|------------------------|---------------------|
| Audience | Private (cross-machine) | Public (anyone can clone) |
| Sanitization | api_key → "", .env → .env.example | + real emails → placeholders, + username → $HOME |
| Secret scan | Real key prefixes | + passwords, + username in text |
| Distribution | zip download | `hermes profile install github.com/...` |
| Repo maintained | No (one-shot) | Yes (incremental sync commits) |
| Skills/plugins | Optional (dedup) | Always (tracked in git) |

## Pitfalls

### 1. Skills directory is huge — use --depth 5
A 23-profile repo with bundled skills can have 55K+ files. Always clone with
`--depth 5` to avoid slow full-history clones.

### 2. memtensor references in skills/plugins are not secrets
After removing `memtensor` from all `config.yaml` files, a grep will still find
matches inside `skills/` and `plugins/` directories (e.g. skill documentation
about memtensor, or the memtensor plugin code itself). These are NOT config
references — exclude them from the sanitization scan.

### 3. Config.yaml may contain ${ENV_VAR} references — don't sanitize those
When sanitizing `api_key:` values, only clear literal key strings (e.g.
`sk-xxx`). Leave `${DAMOXING_API_KEY}` references intact — they're environment
variable references, not secrets.

### 4. SwarmStudio node version changes with upgrades
The MCP `command:` path contains the SwarmStudio version
(`0.18.0` → `0.19.0`). This is a legitimate config change that should be synced,
not sanitized.

### 5. Hindsight bank_id contains MAC address
`hindsight/config.json` contains `"bank_id": "hermes-b24d7ac5d9c4-swarm"`.
The `b24d7ac5d9c4` segment is a MAC address. For a truly public repo, this
should be replaced with a placeholder like `hermes-XXXX-swarm`. However, if
the repo is for the user's own multi-machine sync (not for public consumption),
keeping the real MAC is acceptable since it's not a credential.
