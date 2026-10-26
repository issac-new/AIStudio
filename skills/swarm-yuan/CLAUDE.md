# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Working language of this repo is **Chinese** (docs, commit messages, inline comments). Match it when editing prose; code/identifiers stay English.
> **口径权威源**：`assets/facts.conf`（catchphrase 数字单一事实源，self-check 机器执法）。

## What this repo is

`swarm-yuan` is a **meta-skill generator**: a bash-based tool that, pointed at any code repository, generates a project-specific development "skill" for AI coding assistants. The generated skill encodes a project's rules as a **17-item feature card** （特征卡， the "legislation") and enforces them with **56 quality gates** （56 个质量门禁， the "enforcement"). It integrates 15 external runtimes by **invoking them, never reimplementing** —按接线深度分三层（深度接线 4 / CLI 接线 6 / 方法论引用 5；mattpocock-skills 与 diagram-design 为 `runtime/` 仓内物化型），每层有自带降级载体，未装不阻塞。运行时/门禁/变量/框架等口径数字详见 `assets/facts.conf`（单一事实源，self-check 机器执法做漂移检测）与 `README.md` 附录 A（数字速览）。

There is no compiled artifact and no conventional build — the product is a set of bash scripts, markdown templates/references, and shell gate fragments that get copied into a target skill directory.

## 范式定位

swarm-yuan 现为**两体系统**（README.md 一章 What）：生成器侧自举仍在（一次性消费不算税；行数不手抄、无日期锚，需要时用 `wc -l` 机械统计），生成物侧标准档约 90+ 文件（UNIVERSAL_FILES 与 PROJECT_SPECIFIC_FILES 计数）、概念负担降到 5 个层次名词——重量没有消失，只是归位。四档 `--profile auto|lite|standard|compliance` 让重量显式可选，`auto` 按项目规模+合规+技术栈复杂度自适应判定（质量优先升档偏置）。适用/不适用场景与轻量替代方案详见 `README.md` 五章 When。

## Repository layout (AIStudio single repo)

- **SWARM_YUAN_HOME（AIStudio 的 `skills/swarm-yuan`）** — the generator skill itself. This is the primary thing you edit.
  - `SKILL.md` — the AI entry point / operating manual (generation pipeline 编号 = `references/generation-flow.md` Step 1–13，SKILL.md 总览表为同一口径）。
  - `install.sh` — one-key installer; auto-detects 8 AI runtimes and copies the skill in.
  - `assets/` — **templates + gates, the source of truth for generated skills.** `precheck.sh` + `gates-strict.sh` + `gates-warn.sh` + `gates-advisory.sh` (56 个 check_* 门禁函数 19+22+15 全在三个 `gates-*.sh`，`precheck.sh` 为编排入口不含 check_*；self-check 对四文件机械计数；LOC tracked by `facts.conf` `FACT_SCRIPT_LOC`), `precheck.conf` + `precheck.arch.conf` + `precheck.compliance.conf` (config vars, core/arch/compliance 三文件拆分）, `spec-template.md` (25-section spec，整数节口径，§5.5/5.6/5.7 为子节), `trace-log.sh` (full-chain invocation tracing: stdout announcement + `.swarm-yuan/trace.jsonl`; node-level default, `SWARM_YUAN_TRACE=verbose` for call-level), `framework-gates/<fw>.sh` (81 per-framework gate fragments).
  - `references/` — methodology docs + `references/frameworks/<fw>.md` (81 framework rule sources).
  - `runtime/` — 仓内物化型 CLI 层运行时（`mattpocock-skills` 27 技能、`diagram-design`，MANIFEST 登记上游基线）。
  - `research/` — 外部运行时上游仓库的本地 git clone 缓存（self-check 版本核对用，1.6GB+，gitignored，勿提交）。
  - `vendor-knowledge/` — 外部团队知识物化（pay-team 等，MANIFEST 登记）。
  - `scripts/` — the generator `generate-skill.sh`, `self-check.sh`（口径漂移检测）, `make-offline-bundle.sh`（离线安装包，`--no-vendor` 不带 npm/pip 通道件）, framework tooling.
  - `tests/` — fixture + e2e tests (see below).
- **`verifier/`** — a self-contained acceptance harness that re-runs the whole suite (fixture double-state + id-level assertions) with golden-vector line-count reconciliation (`run-verifier.sh golden` does content comparison; `rebuild-golden` rebuilds the baseline after intentional gate changes).
- **`README.md`** — the single design document（What / Why / How / 实现 / When / 核心总结 + 附录；决策史在 `docs/design-evolution.md`，改门禁前先读相关决策）。`docs/` — `usage-manual.md`（操作命令）、`design-evolution.md`（决策史）、`upstream-baseline.md`（上游基线）、`research/`（调研证据链 archive）。`SWARM_YUAN_SOURCE_ROOT/dist/` 为发版离线包产物（gitignored）。

## Common commands

All bash, run from SWARM_YUAN_HOME unless noted. There is no build step; "tests" = the fixture/e2e/verifier suites and shellcheck.

```bash
# --- Install the skill (into a detected AI runtime's skills/ dir) ---
bash install.sh                 # auto-detect + install
bash install.sh --list          # just list detected runtimes
bash install.sh --version       # version + bash version

# --- Self-check (verifies 11 runtime tools; not a unit test. 15 = 含方法论引用的接线口径 FACT_RUNTIMES) ---
bash scripts/self-check.sh --check-only   # detect only, don't install

# --- Generate a skill for some project ---
bash scripts/generate-skill.sh <skill-name> <project-dir>
bash scripts/generate-skill.sh --upgrade <skill-name> <project-dir>
bash scripts/generate-skill.sh --inject-frameworks <skill-dir>

# --- Build an offline install bundle (zip, distributed via GitHub releases) ---
bash scripts/make-offline-bundle.sh [<输出目录>] [--allow-partial] [--no-vendor]

# --- Tests: framework fixture (double-state) for ONE framework ---
# violating/ must FAIL (non-zero exit), compliant/ must PASS (zero exit).
bash tests/run-framework-fixture.sh <framework-id>     # e.g. mybatis, vue, koa

# --- Tests: E2E (4-framework injection + gate fail full chain) ---
bash tests/e2e/run-e2e.sh

# --- Static check / lint ---
shellcheck -x -e SC2086,SC1090,SC1091,SC2155,SC2034,SC2230,SC2004,SC2312 assets/precheck.sh
bash -n scripts/self-check.sh   # syntax check

# --- Verify ONE framework ruleset (four-element check) ---
bash scripts/verify-framework-ruleset.sh <framework-id>

# --- Run the FULL acceptance suite (fixtures + e2e + shellcheck + metrics) ---
bash verifier/v1/run-verifier.sh all       # or: fixtures | e2e | shellcheck | metrics

# --- Local full regression in ONE command (locks + 3 e2e + verifier all + self-check) ---
# 收口前必跑：任何"验证通过"的声称以本命令 EXIT=0 为准。
bash tests/run-sweep.sh
```

**Run the full loop for one framework** when changing its gate/rule:
```bash
bash scripts/verify-framework-ruleset.sh <id> && \
bash tests/run-framework-fixture.sh <id>
```

## The 81-framework system (most edits touch this)

Each of 81 supported frameworks (vue, koa, mybatis, django, gin, kafka, …) has **three coupled artifacts** that must stay consistent:

1. `references/frameworks/<fw>.md` — the rules/规律 (frontmatter declares a `深度门槛:` = min number of rules).
2. `assets/framework-gates/<fw>.sh` — the executable gate fragment defining a `_fw_<id>_check` function.
3. `tests/fixtures/<fw>/{violating,compliant}/` — minimal projects that must trigger / not trigger the gate.

Gate fragments are **injected** into a generated skill's `precheck.sh` between the markers `# >>> swarm-yuan:framework-gates >>>` / `# <<< ... <<<` by `--inject-frameworks`; `--framework <id>` then dynamically dispatches to `_fw_<id>_check`. The marker block is machine-maintained — **never hand-edit inside it.**

**Four-element acceptance** (enforced by `verify-framework-ruleset.sh` and CI): ① component-inventory count ≥ actual × 0.95; ② rule count ≥ the `.md`'s `深度门槛` AND every rule has an `证据:` field; ③ `_fw_<id>_check` exists, `--framework <id>` runs with exit 0; ④ `dev-guide.md §10` has ≥3 framework constraints.

## Key architecture rules

### Cross-platform bash constraint (swarm-yuan's own scripts)
The generator's own scripts must run on **Windows/macOS/Linux**. **Bash is a hard prerequisite** (the 56 gates and generator are all bash scripts; native Windows cmd/PowerShell are not supported). On Windows, install Git for Windows (bundles Git Bash) or WSL first, then `.bat` wrappers locate Git Bash/WSL/MSYS2 to run the `.sh` scripts. In bash: **no `declare -A`** (use parallel arrays / strings), use `sed -i.bak` then `rm`, `grep -E`, `date -u`, `$(cd ... && pwd)` instead of `readlink -f`, and `${var}` quoting for C-locale safety. See `references/security-spec.md` §六.

### Gates are intentionally conservative
Many gates "sleep" (match nothing) on purpose; `docs/design-evolution.md`（决策史）documents cases where a naive fix would **wake a sleeping gate and flood real projects with false positives**. Before changing gate matching logic, check the decision history and validate against a real project sample, not just the fixture.

## Testing notes

- **No unit-test framework.** Correctness = fixture double-state tests（81 框架夹具 + 55 组 `gate-fixtures/` id 级断言）+ e2e（`run-e2e.sh` 注入链 / `run-gen-e2e.sh` 生成闭环 / `run-fieldchange-e2e.sh` 字段变更传播）+ shellcheck + the `verifier/` golden-vector comparison.
- **Single test** = `run-framework-fixture.sh <id>` (one framework) or `run-verifier.sh fixtures` (all).
- **Fixture `precheck.conf` uses a `__REPO_ROOT__` placeholder** that the runner substitutes at runtime, so fixtures are machine-independent.
- `verifier/v1/golden-vector.txt` is the expected 81-fixture exit-code vector.
- CI (`SWARM_YUAN_SOURCE_ROOT/.github/workflows/swarm-yuan.yml`) runs on push/PR to `main`. The full regression uses the same `tests/run-sweep.sh` entry as local development; generator self-gate and macOS/Windows compatibility checks remain separate jobs.
