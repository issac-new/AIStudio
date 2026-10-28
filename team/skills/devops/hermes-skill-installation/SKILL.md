---
name: hermes-skill-installation
version: 1.1.0
description: Install skills from hub or taps. Use for tap-add issues.
---

# Hermes Skill Installation (tap → search → install)

Covers the full workflow for adding skills from the Skills Hub (`skills.sh`), custom GitHub "taps", or direct URLs. The single most common confusion is conflating **registering a source** with **installing a skill** — they are two different commands.

## The core distinction (read this first)

| Command | What it does | What it does NOT do |
|---------|--------------|---------------------|
| `hermes skills tap add <owner/repo>` | Registers a GitHub repo as a **skill source** (a "tap"). Its skills become *discoverable* via search/browse. | ❌ Does NOT install any skill. Files are NOT written to disk. |
| `hermes skills search <term>` | Searches across ALL registered sources (hub + every tap). Taps are auto-included once registered. | ❌ There is NO `--tap` flag. Do not pass it — argparse rejects it. |
| `hermes skills install <identifier>` | Actually installs ONE skill to the profile's `skills/` dir and seeds it into SOUL context. | Requires the exact identifier from search results. |
| `hermes skills browse` | Paginated list of all available skills across sources. | |

> **Pitfall #1 — "I ran `tap add` so it's installed"**: NO. `tap add` only registers the source. The user will say "I installed X via `hermes skills tap add owner/repo`" and expect it to work. It won't — no skill is on disk. You must follow with `hermes skills install <identifier>` for each skill you want.

## Verified workflow (2026-08)

```bash
# 1. (Optional) Register a custom GitHub repo as a skill source
hermes skills tap add K-Dense-AI/scientific-agent-skills
hermes skills tap list                     # confirm it's registered

# 2. Discover what's available (taps auto-included, no --tap flag)
hermes skills search "scientific"          # → table with Identifier column
hermes skills browse                       # paginated full list

# 3. Install the specific skill(s) you want
#    Identifier format from search: skills-sh/<owner>/<repo>/<skill-name>
hermes skills install skills-sh/k-dense-ai/scientific-agent-skills/literature-review
hermes skills install skills-sh/k-dense-ai/scientific-agent-skills/scientific-writing -y   # -y skips prompt in TUI

# 4. Verify it actually landed
hermes skills list | grep <skill-name>     # installed skills only
```

## How to verify "is it actually installed?"

Do NOT trust `tap list` as proof of installation. Use this triad:

1. **`hermes skills list`** — lists ONLY installed skills. If the name isn't here, it's not installed.
2. **Filesystem check** — `~/.hermes/profiles/<profile>/skills/<skill-name>/SKILL.md` must exist.
3. **`skill_view(name='<skill-name>')`** from inside a session — if it loads, it's installed and seeded.

`hermes skills inspect <identifier>` previews a skill's content WITHOUT installing — useful for vetting before install. Note: `inspect` needs the full hub path; a bare `owner/repo` will error with "Could not find".

## Trust levels

Search results show a `Trust` column:
- `official` — Hermes-shipped / Anthropic-curated.
- `community` — third-party (e.g. `k-dense-ai/*`, `davila7/*`). Vet SKILL.md before installing; these run with your tool access.

## When the user says "I installed X but it's not working"

Run this diagnostic ladder (do not guess):

```bash
hermes skills tap list                      # is the source registered?
hermes skills list | grep -i <name>         # is the skill actually installed?
ls ~/.hermes/profiles/orchestrator/skills/  # does the dir exist on disk?
```

The most common outcome: `tap list` shows the repo ✓ but `skills list` is empty ✗ → they ran `tap add` and stopped. Tell them: **tap add registers the source; you still need `hermes skills install <identifier>` per skill.**

## Bulk install guidance

Large taps can hold 100+ skills (e.g. `K-Dense-AI/scientific-agent-skills` has 158). Do NOT blindly install all of them — each installed skill seeds into SOUL context and inflates token cost. Instead:
1. Ask the user for their goal (paper writing? genomics? data viz?).
2. Pick the 5-10 most relevant skills from the search results.
3. Install only those.

## engines.hermes 兼容校验（安装前声明门）

第三方 skill 的 frontmatter 可声明 `engines.hermes` 兼容区间（SemVer 子集：
`>= <= > < = ^ ~ *`、空格 AND、`||` OR，如 `>=0.22.0 <0.23.0`）。语义沿用
dsh engines.dsh 规则：

- **已声明且满足**当前 `hermes --version` → 放行安装。
- **已声明且不满足** → 拒绝安装，回复两侧版本号，不要强装。
- **区间语法非法**（如 `workspace:*`）→ 拒绝安装。
- **未声明 engines.hermes** → 警告不拒绝，沿用旧规则继续装（旧 skill
  存量普遍未声明，硬拒会把整个生态挡在门外）。

```bash
# 声明位置：SKILL.md frontmatter
# engines:
#   hermes: "^0.22"        # 或平铺 engines.hermes: ^0.22

# 机械校验（技能市集索引工具，index 由 build_skill_index.py 生成）：
python3 ~/.hermes/skills/devops/skill-market-index/scripts/query_skill_index.py \
  --index <index.json> --check-engines <skill-name>
# 退出码 0=ok/未声明(打 warning)，1=不兼容或未收录
```

安装 hub/tap 来源的第三方 skill 前，先看 trust 档（official/community）
再做此校验；community 级还需人工过一遍 SKILL.md 内容（见上文 Trust levels）。

## Related skills
- `skill-library-maintenance` — audit/dedup/repair an already-installed multi-profile library.
- `hermes-agent-skill-authoring` — author in-repo SKILL.md files (frontmatter + structure).
- `hermes-agent` (bundled) — the authoritative Hermes CLI reference; consult it first for any CLI feature.
