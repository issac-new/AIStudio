---
name: tool-inventory-baseline
description: "Use when auditing installed CLI tools or package drift."
version: 1.0.0
metadata:
  hermes:
    tags: [tools, inventory, brew, npm, entropy, baseline]
    related_skills: [skill-board-scoping, harness-entropy-management, hermes-disk-slimming, macos-security-tool-install]
---

# Tool Inventory Baseline

The machine's CLI toolset is **curated by team workflow**, same philosophy as
skill-board-scoping: a tool earns its install by serving the agent cluster
(orchestrator/hack/worker/[已移除]/[已移除]/ops), not by being generally useful.
Backup snapshots live at `~/.hermes/tool-prune-backup-20260805/`
(`*.before.txt` / `*.after.txt` for brew/npm/pipx/uv/conda).

## When to Use

- After `brew install` sprees or agent-CLI experiments accumulate
- Quarterly entropy scan alongside skill-board-scoping
- Before adding a new tool — check it isn't already covered below

## Canonical Toolset (2026-08-05, post-prune)

### brew leaves (73) — by team

| Team | Tools |
|------|-------|
| **hack (offensive)** | ffuf gobuster hashcat hydra john masscan nikto nuclei sqlmap sslscan testssl binwalk lynis yara radare2 |
| **hack (supply-chain/audit)** | gitleaks grype trivy osv-scanner semgrep shellcheck dependency-check kics |
| **worker-dev** | gh git git-lfs jq ripgrep fzf grep findutils coreutils gnu-getopt pandoc poppler graphviz shellcheck |
| **worker-build** | gcc make cmake automake ccache ninja bison byacc binutils |
| **ops/k8s** | helm (kubectl from Docker Desktop) |
| **lang runtimes** | go rust rustup python@3.11 openjdk@11 pipx pnpm yarn |
| **system/net** | wget tmux zsh bash-completion coreutils unzip trash zeromq portaudio icu4c@76 pcre libxslt highs llama.cpp |

### npm global (16)

`@openai/codex` `claude-code-acp` `agently-cli`(QQ mail) `echarts`
`harness-monitor` `hermes-web-ui` `kanban` `npm` `pptxgenjs` `promptfoo`
`ruflo` `gitnexus` `@playwright/cli` `sharp`

### pipx (10) — all hack-team

`arjun bandit certipy-ad commix cupp impacket pip-audit shodan volatility3 whatweb`

### uv tools (3)

`browser-act-cli` `hindsight-api-slim` `skill-seekers`

### conda envs (3)

`base` `clawailab` `py312`(6.1GB, agentscope/appworld experiments)

## Pruned (do NOT reinstall without a consumer)

- **Competing agent CLIs**: gemini-cli, ironclaw, zeroclaw, summarize, rtk,
  agy, nanobot, specify-cli, it2, graphifyy, flowise, n8n, continuedev,
  codegraph, agentscope-studio, iflow-cli, comet, synsci/*, deepseek-tui,
  claude-mem, agency-orchestrator, oh-my-claude-sisyphus, tmux-ide
- **Duplicate runtimes**: node@22/24/25/26 (node v26 lives in ~/.local/bin),
  python@3.10 (py312 conda + python@3.11 brew cover), scala×2, llvm@16, maven
- **Desktop toys**: mpv, autojump, himalaya, cliclick, git-gui
- **Global npm libs** (never CLIs): cheerio, dayjs, dotenv, reflect-metadata,
  react*, @babel/*, cnpm, tyarn, yarn(dup)
- **conda experiments**: kotaemon, dbgpt_env, dra, py310, xinference

Rationale: hermes is the agent runtime; competing CLIs split context and
credentials. Duplicate runtimes cost disk (node@22 alone ~500MB) with zero
consumers (`brew uses` = none).

## Verification

```bash
# drift check — compare against canonical counts
echo "brew leaves: $(brew leaves | wc -l)"        # expect ~73
echo "npm global: $(npm ls -g --depth=0 | tail -n +2 | wc -l)"  # expect ~16
echo "pipx: $(pipx list --short | wc -l)"         # expect 10
echo "uv tools: $(uv tool list | grep -c '^[a-z]')" # expect 3
echo "conda envs: $(conda env list | grep -c envs/)" # expect 3

# orphan check — a leaf with no dependents AND no SOUL reference is a prune candidate
for t in $(brew leaves); do
  refs=$(grep -rl "\b$t\b" $HOME/.hermes/profiles/*/SOUL.md 2>/dev/null | wc -l)
  deps=$(brew uses --installed $t 2>/dev/null | wc -l)
  [ "$refs" = "0" ] && [ "$deps" = "0" ] && echo "ORPHAN: $t"
done
```

## Pitfalls

1. **Check `brew uses --installed <t>` before uninstalling** — leaves with no
   dependents AND no SOUL.md reference are safe; the script above automates it.
2. **Global npm libraries are not CLIs** — `npm i -g cheerio/react/dotenv`
   does nothing useful; libraries belong in project package.json.
3. **Backup before any prune round**: snapshot `brew leaves`, `npm ls -g`,
   `pipx list`, `uv tool list`, `conda env list` into a timestamped dir.
4. **node/python version proliferation is the #1 silent disk drain** — keep
   exactly ONE active node and ONE active python per purpose; prune the rest.
5. **Competing agent CLIs are credential risks** — each holds its own API keys
   in its own config dir; fewer agent runtimes = smaller secret surface.

## Related Skills

- **skill-board-scoping** — same philosophy applied to skill symlinks
- **harness-entropy-management** — quarterly cron target for the verification script
- **macos-security-tool-install** — the hack-team tool install reference (58+ tools)
- **hermes-disk-slimming** — broader disk reclamation beyond tools
