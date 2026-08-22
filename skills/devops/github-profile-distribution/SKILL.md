---
name: github-profile-distribution
description: "Publish profiles to GitHub and build offline packages."
triggers:
  - "重新分发 profile 至 GitHub"
  - "redistribute profiles to GitHub"
  - "sync profiles to GitHub repo"
  - "update SwarmTeam repo"
  - "push profiles to GitHub"
  - "GitHub distribution sync"
  - "offline Windows deployment"
  - "离线 Windows 安装"
  - "pip npm only"
---

# GitHub Profile Distribution + Offline Deployment

## 🔴 RED LINE: Forbidden Teams (MUST ENFORCE)

**The following teams MUST NEVER be published. This is non-negotiable.**

| Team | Forbidden Profiles | Reason |
|------|--------------------|--------|
| **[已移除]** | `[已移除]-orchestrator`, `[已移除]-*` | Children's education data — privacy sensitive |
| **[已移除]** | `[已移除]-*` | Proprietary [已移除] research |
| **hack** | `hack-*` | Security/offensive tooling — do not publish |

**Enforcement**: Before syncing, scan the target repo for forbidden profile
directories and DELETE them. When syncing FROM local `~/.hermes/`, SKIP these
teams entirely. After sync, verify zero forbidden profiles exist in the repo.

**Only these teams may be published:** `swarm`, `product`, `ops`, `platform`.

## When to Use

- User says "发布 profile 到 GitHub" / "push profiles to GitHub"
- Syncing local `~/.hermes/` changes to a GitHub distribution repo
- Building an offline deployment package for restricted environments
- User says "Windows 离线" / "pip npm only" / "no bash"

## Part A: GitHub Distribution Sync

### Step 1: Clone the distribution repo

```bash
cd /tmp && rm -rf SwarmTeam
gh repo clone issac-new/SwarmTeam -- --depth 5
```

Use `--depth 5` — the repo may have thousands of files (bundled skills).

### Step 2: Sync ALL 6 categories (critical — do NOT under-scope)

**⚠ This step is frequently under-scoped.** A v2.0 push that synced only
profiles+config forgot skills, patches, _shared, and plugins — requiring 3
follow-up pushes. Sync ALL categories in one pass:

| Category | Path | Contents |
|----------|------|----------|
| **A. Profiles** | `profiles/<name>/` | SOUL.md, config.yaml, distribution.yaml, *_rules.md, references/ |
| **B. Shared protocols** | `profiles/_shared/` | ontology.md, marking-rules.md, forward-deployed-protocol.md, loop-engineering-gates.md, mandatory-acp.md, mandatory-privacy.md, chart-rules.md, shared-rules-reference.md, config.yaml |
| **C. Plugins** | `profiles/orchestrator/plugins/` | acp-client/, cluster-kanban/, matrix-chat-info/, run-trace/, hermes-achievements/ |
| **D. Skills** | `skills/` | Custom skills from `~/.hermes/profiles/orchestrator/skills/` (exclude cybersecurity, hack-team, .hub, wechat-article-extractor) |
| **E. Patches** | `patches/` | Infrastructure patch scripts (.sh for macOS + .ps1 for Windows) |
| **F. Global config** | (repo root) | config.yaml, global_kanban_rules.md, shared/profiles.yaml |

**Clean before commit**: Remove `__pycache__/`, `*.pyc`, runtime artifacts
(`.tirith-install-failed`, `channel_directory.json`, `.skills_prompt_snapshot.json`,
`matrix_threads.json`, `mem0.json`)

**Consolidated profiles**: When profiles are archived locally (`*.archived`),
their old directories in the repo MUST be deleted.

### Step 3: Sanitize for PUBLIC release

```python
REPLACEMENTS = [
    (r'HK_MAIL@qq\.com', 'your@email.com'),
    (r'swarmstudio@agent\.qq\.com', 'your@email.com'),
    (r'$HOME/', '$HOME/'),
    (r'/Users/<username>(?=\s|$|["\'\)\]\,])', '$HOME'),
    (r'sk-[a-zA-Z0-9]{20,}', '${API_KEY}'),
    (r'syt_[a-zA-Z0-9_]{20,}', '${MATRIX_TOKEN}'),
    (r'<WEIXIN_BOT_ID>@im\\.bot:<WEIXIN_SECRET>', '${WEIXIN_TOKEN}'),
    (r'<WEIXIN_BOT_ID>@im\.bot', '${WEIXIN_ACCOUNT_ID}'),
]
```

**Scan ALL files** (not just profiles) — skills frequently contain PII in
examples. Exclude `.git/` but include `skills/`.

### Step 4: Secret scan (CRITICAL)

```python
PATTERNS = {
    "sk- API keys":  r'sk-[a-zA-Z0-9]{20,}',
    "gho_ tokens":   r'gho_[a-zA-Z0-9]{30,}',
    "syt_ tokens":   r'syt_[a-zA-Z0-9_]{20,}',
    "real email":    r'HK_MAIL@qq\.com|swarmstudio@agent\.qq\.com',
    "username path": r'$HOME',
    "weixin token":  r'<WEIXIN_BOT_ID>',
    "password":      r'(?:Test|Sys)Pass\d+',
}
```

### Step 5: Commit and push

```bash
git add -A
git diff --cached --stat | tail -10  # review
git commit -m "feat: vX.Y — description"
git push origin main
```

## Part B: Offline Windows Deployment

For full offline Windows packaging details (pure PowerShell, no bash),
see `references/offline-windows-deployment.md`.

**Key points**:
- Ship a ~5 MB ZIP with ONLY customizations; framework installed via pip
- ALL patch scripts must be `.ps1` (not `.sh`) — target has no bash
- Provide `install-windows.bat` for double-click install
- Each profile needs `distribution.yaml` for `hermes profile install <dir>`

## hermes profile install: local directory mode

`hermes profile install <source>` accepts a **local directory** (not just git URLs).
The directory MUST contain `distribution.yaml` at its root. Each `profiles/<name>/`
in the repo has its own `distribution.yaml`, so the installer passes each
subdirectory individually:

```powershell
hermes profile install .\profiles\worker-coder --alias -y
```

This is the **Hermes native import** path — it creates the profile with correct
ownership semantics (distribution-owned vs user-owned paths), generates `.env.EXAMPLE`,
and sets up the manifest for future `hermes profile update`.

**Pitfall**: `hermes profile install <git-url>` needs `distribution.yaml` at the
repo ROOT, but our repo is multi-profile. Don't try to install the whole repo as
one distribution — install each profile subdirectory individually.

## README Authoring

### Extracting profile capabilities from SOUL.md

```python
content = soul_path.read_text()
clean = re.sub(r'```[^\n]*\n.*?```', '', content, flags=re.DOTALL)
headings = re.findall(r'^#\s+(.+)$', clean, re.MULTILINE)
real_title = next(h for h in headings
                  if "强制规则" not in h and "ACP" not in h and "编码开发" not in h)
```

**Pitfall**: ACP block is the first `#` heading. Skip headings containing
"强制规则", "ACP", or "编码开发". Also strip code blocks before regex-matching
(Python `#` comments match `^#\s+`).

### Bilingual README pattern

User prefers Chinese + English dual-language: section titles, table headers,
table cells, prose — all bilingual.

## Pitfalls

1. **Under-scoped sync**: Forgetting skills/plugins/patches/_shared. Always
   check all 6 categories. A good verification: ask the user "skills and memory
   uploaded?" — if they ask, you missed something.

2. **Stale profiles in repo**: When profiles are consolidated (archived) locally,
   old directories remain in the repo. Map `.archived` → delete from repo.

3. **Broken symlinks**: Skills bundled as symlinks pointing to `/Users/<user>/`
   are useless on GitHub. Copy real files, not symlinks.

4. **memtensor/memos-local-plugin stale**: Remove deleted plugins from repo
   (memtensor 1954 lines, memos-local-plugin 843 files).

5. **Hindsight bank_id contains MAC address**: Replace with placeholder for
   truly public repos.

6. **distribution.yaml MISSING**: New profiles added to repo without
   `distribution.yaml` will fail `hermes profile install`. Always create one.

7. **Bash-only patches on Windows**: Offline Windows machines have no bash.
   ALL patch scripts must have `.ps1` equivalents.

## Related Skills

- **hermes-agent-migration** — zip/tarball packaging for private cross-machine migration
- **kanban-worktree-workspace** — workspace_kind default patch details
