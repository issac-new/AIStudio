---
name: tool-launcher-analysis
description: "Analysis archetype for tool-launcher/wrapper projects — CLI menus or TUIs that wrap many external tools (hackingtool, Kali launchers, pentest menus). Distinct from agent frameworks: no orchestration, no pipeline, no result aggregation. Focus on invocation patterns, dependency management, complete tool catalog extraction, and overlap-with-standard-tools analysis."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [research, open-source, architecture, security-tools, launcher, wrapper]
    related_skills: [open-source-project-deep-analysis, open-source-architecture-analysis, github-repo-survey]
---

# Tool Launcher / Wrapper Project Analysis

Analysis playbook for a distinct project archetype: CLI menus/TUIs that wrap
many external tools. The "framework" is install/run lifecycle management,
NOT orchestration. No agent logic, no prompts, no pipeline.

Canonical example: **hackingtool** (v2.0.0, 185+ tools, 20 categories)
- Repo: https://github.com/Z4nzu/hackingtool
- Python 3.10+, sole dependency: `rich>=13.0.0`

## When to Use

- "Research project X" where X is a menu-driven tool launcher (not an agent framework)
- "Find the complete tool catalog of Y" where Y wraps many external tools
- "How does Z invoke its tools — CLI wrapper, direct binary, or parameterized?"
- Any analysis of a project whose value is curation (which tools it wraps) not
  orchestration (how it chains tools together)

## When NOT to Use

- Agent frameworks with multi-agent orchestration → use `open-source-project-deep-analysis`
- Metadata-only surveys (stars, descriptions) → use `github-repo-survey`
- LOC/language breakdown → use `codebase-inspection`

## Key Analysis Questions (Different from Agent Frameworks)

### 1. Invocation Pattern

Does the base `run()` use `os.system()` (shell string) or `subprocess.run()`
(list form)? Do individual tools override `run()` with parameterized input?
Is there command-injection risk in how user input reaches shell strings?

**hackingtool example**: Base class `HackingTool.run()` uses `os.system(cmd)` for
`RUN_COMMANDS` (shell=True semantics). ~20% of tools override `run()` with
`subprocess.run(["binary", param], cwd=...)` using list form (safer — no shell
injection). The codebase shows systematic bug fixes migrating from
`os.system("cd foo; tool")` to `subprocess.run(["tool"], cwd=...)`.

Three invocation patterns observed:
1. **Simple shell string** (~70%): `RUN_COMMANDS = ["nuclei -h"]` → `os.system()`
2. **Parameterized Python method** (~20%): Override `run()`, `Prompt.ask()` for
   input, `subprocess.run(["binary", param], cwd=...)` — list form, safer
3. **Install-only / instructions-only** (~10%): `runnable=False`, user manually
   navigates to tool directory

### 2. Dependency Management

Is it centralized (one requirements.txt) or per-tool (each tool handles its
own deps)?

**hackingtool**: Three-tier system:
- Tier 1: System packages (git, python3-pip, ruby, golang-go, php, java) —
  installed during bootstrap, detected via `os_detect.py`
- Tier 2: Python venv (only `rich>=13.0.0` — the launcher's sole dependency)
- Tier 3: Per-tool self-managed deps via `INSTALL_COMMANDS` strings
  (git clone + pip / go install / gem install / curl binaries)

### 3. Pipeline Logic

Does it chain tools (output→input) or is it pure menu-select? Most launchers
are menu-select only. Verify by searching for any data-passing between tool
invocations. State this explicitly in findings.

**hackingtool**: ZERO pipeline logic. No tool chaining, no result aggregation,
no data passing between tools. The tag-based discovery system (19 auto-derived
tags via regex on tool names/descriptions) and task recommendations (22
predefined task→tag mappings) are the closest to "workflow" — they group tools
by capability but don't sequence them.

### 4. Complete Tool Catalog Extraction

Walk the class hierarchy recursively to count ALL tools. The top-level
`TOOLS` list is NOT the full count — sub-collections nest further.

**Technique**:
1. Look for a `_collect_all_tools()` or similar recursive walk function —
   if present, it reveals the true count.
2. If absent, manually trace each collection subclass's `TOOLS` list.
3. Check for nested subdirectories (e.g. hackingtool's `tools/others/` has
   10 sub-collection files with 22 additional tools not in the main
   `tools/*.py` files).

**hackingtool**: Top-level `all_tools` list has 20 entries, but the real
count is ~185 because each entry is a `HackingToolsCollection` containing
multiple `HackingTool` instances, and some contain nested sub-collections
(`OtherTools` contains 10 sub-collections in `tools/others/`).

### 5. Overlap with Standard Tools

Identify which wrapped tools are standard (nmap, sqlmap, nuclei, metasploit)
vs unique additions. This is the KEY value-add analysis — the launcher's
worth is in curation and unique tools, not in wrapping well-known tools.

**hackingtool overlap**: 6 port scanners (nmap/masscan/rustscan + 3 niche),
direct integrations of nuclei/sqlmap/hashcat/john/wireshark/ghidra/sliver/
havoc/mythic/bloodhound/impacket/responder. **Unique additions**: 17 phishing
tools (strongest category), 13 wireless tools, 8 mobile/Android tools,
8 payload creators, 8 social media OSINT tools, 6 DDoS tools, 4 steganography
tools, 4 cloud tools.

## File-Reading Priorities

| Look for | File patterns | What they reveal |
|---|---|---|
| Tool definition classes | `**/tools/*.py` (one class per tool) | Tool name, install commands, run commands, metadata |
| Base class / lifecycle | `**/core.py`, `**/base.py` | Install/run/update lifecycle, invocation pattern |
| Tool registry | `**/main.py`, `**/__init__.py` | Master list of categories, menu structure |
| Install/bootstrap | `**/install.py`, `**/install.sh` | System deps, venv, launcher, user config dirs |
| OS/platform detection | `**/os_detect.py`, `**/platform.py` | Supported OSes, package manager, capability flags |
| Config | `**/config.py`, `**/constants.py` | Paths, themes, defaults, config format |

## Batch-Reading Technique for Many-File Projects

When a project has 20+ tool module files (one per category):

**Turn 1** (8-10 reads): Batch-read core framework files (core.py, constants.py,
config.py, install.py, main entry point) alongside 3-4 tool modules.

**Turn 2** (6-8 reads): Read remaining tool modules.

**Turn 3** (1 shell call): For subdirectory files (e.g. `tools/others/*.py`),
use a shell loop instead of individual reads:
```bash
cd /path/to/tools/others && for f in *.py; do echo "=== $f ==="; cat "$f"; done
```

This 3-turn approach covers an entire 185-tool catalog in ~3 tool calls.

## Output Format

```markdown
## 1) Complete Tool Catalog by Category
Table per category: # | Tool | Install Method | Run Method | Description

## 2) How Tools Are Invoked
- Shell string execution (os.system) — count and %
- Parameterized Python method (subprocess.run) — count and %
- Install-only / instructions-only — count and %

## 3) Tool Installation / Dependency Management
- Tier system (system / venv / per-tool)
- Smart update detection mechanism
- Capability flags (REQUIRES_GO, REQUIRES_RUBY, etc.)

## 4) Workflow / Pipeline Logic
- Explicitly state: "NO pipeline logic. Pure menu-select." (or describe what exists)
- Tag/filter/recommend systems (if any)

## 5) Unique Features vs Raw Tool Usage
- What the launcher adds beyond direct tool usage
- What it does NOT add (no automation, no result parsing, etc.)

## 6) Tech Stack and Architecture
- Languages, core dependencies, design patterns

## 7) Overlap Analysis
Table: Standard Tool | Launcher Equivalent | Notes
Plus: Tools unique to the launcher (not in standard pentest stack)
```

## Pitfalls

1. **Don't assume pipeline logic exists.** Launcher projects almost never chain
   tools. Verify this explicitly — search for any data-passing between tool
   invocations. State the finding clearly: "zero tool chaining, zero pipeline
   logic, zero result aggregation."

2. **Top-level TOOLS list ≠ complete count.** Sub-collections nest further.
   Always trace the full class hierarchy recursively. Check for subdirectories
   like `tools/others/` that contain additional sub-collection files.

3. **README tool count is unreliable.** Hackingtool's header says "185+ modules"
   but the actual count requires recursive walking of the class hierarchy.
   Count from source, not from README claims.

4. **INSTALL_COMMANDS strings are the ground truth for dependency management.**
   Read them to understand the three-tier system: system packages, venv, and
   per-tool self-managed deps. Don't assume a single requirements.txt covers
   everything — in hackingtool, it only contains `rich`.

5. **Bug fixes in the codebase reveal security hardening.** Hackingtool's source
   has comments like "Bug 3 fix: os.chdir() replaced with cwd= parameter" and
   "Vuln 1 fix: was os.system('python saphyra.py ' + url) — command injection."
   These reveal the evolution from unsafe shell-string concatenation to safe
   subprocess list form. Note this in the invocation-pattern analysis.

6. **Archived tools matter for completeness.** Some tools are marked
   `ARCHIVED = True` with `ARCHIVED_REASON` (e.g. "Python 2 only"). They're
   hidden from the main menu but accessible via a sub-menu. Count them
   separately and note the reasons.

## Reference Files

| File | Content |
|------|---------|
| `references/hackingtool-analysis.md` | Full 39KB analysis of hackingtool v2.0.0 — complete 185-tool catalog, architecture, invocation patterns, overlap analysis. Worked example of this skill. |

## Related Skills

- **open-source-project-deep-analysis** — the general skill for deep source-code
  analysis. This skill is a specialized archetype for launcher/wrapper projects.
  NOTE: These skills overlap in territory. This skill provides the launcher-specific
  file-reading priorities and analysis questions that the general skill lacks.
- **github-repo-survey** — use first for metadata discovery, then this skill for
  deep analysis.
- **evidence-based-research** — every claim should cite a file path.
