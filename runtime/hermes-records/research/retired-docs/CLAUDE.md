# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SwarmStudio is an **overlay-based fork** of [hermes-studio](https://github.com/EKKOLearnAI/hermes-studio). All custom code lives in `overlay/`; `upstream/` repos remain pristine and are only modified via build-time patch injection. `ncwk/` itself is **not** a git repo — the git repo is `overlay/`.

## Hard Constraints (from AGENTS.md)

- **Only modify `overlay/`** — `upstream/` is read-only (only `git pull` allowed). Any upstream change must ship as a patch in `overlay/patches/`.
- **Git lives in `overlay/`**, not the workspace root (each `upstream/*` is its own repo). Branch from `main` (`feat/<desc>` / `fix/<desc>` / `refactor/<desc>`), merge back to `main` after verification.
- **Verify via browser HMR by default; do not build installers unless asked.** `npm run dev` + walk changes at `http://localhost:8649`. Only package DMG/exe on explicit user request. Exception: Electron main-process / IPC / native changes — state the browser-verification limits and follow the user's direction.
- **Worktree cleanup goes through git only** (2026-10-17 双删事故立法): never `rm -rf` anything under `.claude/worktrees/` — use `git worktree remove` / `git worktree prune`; an `IN-FLIGHT` marker created <24h ago means another session owns it; unowned orphan dirs go to `.claude/worktrees/.quarantine/`, never the trash.
- **Dependencies are borrowed, not declared**: `overlay/node_modules` is a symlink to `upstream/hermes-studio/node_modules`; single source of truth is the upstream `package.json` (devDependencies). Overlay never redeclares framework/test deps — guarded by `.qgate/gates/symbol-grounding.yaml`.
- Windows x64 is supported for dev/build (`npm run serve` is cross-platform), but Windows installers must be built on a Windows host (`sharp` platform binaries); set `git config core.autocrlf false`.

## Development Commands

```bash
cd overlay

# Build system
npm run inject              # Apply patches + generate vite config + symlink node_modules (idempotent)
npm run clean               # Reverse patches, restore upstream to pristine state
npm run verify              # Check upstream working tree is clean
npm run sync                # Upstream upgrade: clean → git fetch/reset → re-inject

# Development
npm run dev                 # Frontend dev server :8649 (vite HMR; auto-injects if needed; localhost only)
npm run dev:lan             # Same but --host (LAN-accessible); devAutoLogin grants a super_admin
                            #   session to any LAN device — trusted networks only
npm run serve               # Backend :8647 (cross-platform Node wrapper; Windows use this)
bash scripts/serve-server.sh &   # Backend :8647 (macOS/Linux; no hot reload)

# Build
npm run build               # Client bundle only (vite; postbuild runs verify-dist)
npm run build:full          # Full web UI (openapi + client + server) → upstream dist/
npm run build:dmg:mac       # macOS arm64 DMG + zip (auto inject+build+package)
npm run build:dmg:win       # Windows x64 zip + exe + msi
npm run build:dmg:linux     # Linux build
npm run check:bundle        # Bundle budget check

# Tests (vitest)
npm test                    # custom/**/*.test.ts + scripts/**/*.test.ts
npm test -- cockpit         # Filter by filename pattern
npm test -- -t "attention"  # Filter by test name
npm run test:eval           # Eval regression suite (custom/server/eval)
npm run test:ide-smoke      # IDE smoke regression (scripts/regression)
npm run test:ide-selfcheck  # IDE selfcheck CLI regression
npm run typecheck:harness   # tsc over the server contract/harness core files (no vite involved)

# zcode 引擎底座（会话引擎层，见 ../docs/universal-delivery-gate-zcode-design-v0.1.md）
npm run zcode:ensure        # 依赖+构建产物就绪（幂等）
npm run zcode:serve         # 拉起 zcode 引擎服务（:3030 WS；已在跑则幂等跳过）
npm run catalog-check       # zcode catalog 一致性检查

# 基础运行时层（受管 pin 的外部运行时，见 runtime/README.md）
npm run runtime:doctor      # 硬检查（schema/PIN 对账/patch 一致性）+ 软检查
npm run runtime:vendor-pua  # pua 技能按 pin 同步进 runtime/pua
npm run runtime:register    # 注册进 HERMES_HOME external_dirs（幂等）
```

Backend restart after server/patch changes: `lsof -ti:8647 | xargs kill -9`, then re-serve. If a B类 patch changed, `npm run clean && npm run inject` **before** restarting. Frontend changes hot-reload; only alias/entry-shim/vite-config changes need a vite restart.

`OVERLAY_UPSTREAM_ROOT` env var: private-upstream isolation — inject/serve/vitest can point at an isolated injected copy (used from worktrees) instead of the shared `../upstream`.

## Port Conventions

| Port | Service |
|------|---------|
| 8647 | Backend (Koa server) |
| 8649 | Frontend dev (Vite; proxies `/agent-health` → 127.0.0.1:8650) |
| 3030 | zcode engine server (WS channel, `npm run zcode:serve`) |

## Architecture: Overlay Injection System

### A类 vs B类 Modifications

| Type | Nature | Location | Mechanism |
|------|--------|----------|-----------|
| **A类** | Pure additions (components/store/services) | `custom/` | Vite alias redirect + entry shim + runtime registry |
| **B类** | Skeleton modifications (schema/config/routes) | `patches/` | `git apply` at build time (reversible) |

### Injection Flow (`npm run inject`)

1. Verify upstream working tree is clean
2. Apply patches from `patches/series` in order (skipping `#`-commented disabled entries)
3. Symlinks: `node_modules → upstream/hermes-studio/node_modules`, `upstream/.../server/src/custom → overlay/custom/server`
4. Generate `vite.config.overlay.ts` with alias redirects
5. Write `.overlay-injected.json` manifest (for clean reversal)

**Auto-inject hook**: `npm run dev` / `npm run build` run `ensure-injected.mjs` first (predev/prebuild). If upstream is dirty without inject markers, it skips — run `npm run clean` manually.

**Patch routing** (`scripts/inject.mjs`): three targets. (a) prefixes like `hermes_cli/`, `plugins/`, `agent/`, `apps/`, `assets/`, `acp_`, `gateway/`, `tools/`, `tests/`, `hermes_state_*.py` route to **hermes-agent** — authoritative list: `HERMES_AGENT_PATCH_PREFIXES` in inject.mjs; (b) everything else → **hermes-studio**; (c) `zcode-patches/` is a separate optional series routed to **upstream/zcode** (fault-tolerant skip). `patches/series` currently holds ~460 active entries.

### Vite Alias Chain (order matters — array form, specific prefixes first)

```
/src/main.ts  → registries/client/entry.mts   (entry shim)
@/custom      → custom/client                  (A类)
@custom       → custom/client                  (vitest variant)
@registries   → registries                     (registry hub)
@             → upstream/.../client/src        (upstream fallback)
```

`vite.config.overlay.ts` is generated (gitignored); `vitest.config.ts` is hand-maintained and tracked — when aliases change, keep both in sync.

### Entry Shim + Bootstrap

`registries/client/entry.mts` replicates upstream `main.ts` startup, inserting A类 registration before `app.mount()` (`.then` chain, no top-level await — es2020 target):

`app.use(router)` → `bootstrapClient(app)` → `router.isReady()` → `app.mount('#app')`

`registries/client/bootstrap.ts` registers via parallel `Promise.all` (2026-09-30 cold-start fix; order-independent — all writes happen before the addRoute loop and mount): matrixChat → kanbanEnhancements → branding → cockpit → **ide** (falls back to `/ide` + `/app/ide` → `/app` redirects when flag off, since login guard patches 276/277 hard-point to `/ide`, which the ide module redirects to `/app/ide`) → **ia2** (unconditional) → **eval** (route always registered; flag only gates the nav entry) → skillgov → ontology → bpa. Collected routes are `router.addRoute()`-ed before mount. i18n keys are NOT runtime-merged — they are injected directly into upstream locale files via patches.

### Navigation Landscape (which UI is live)

| Route | What |
|-------|------|
| `/app` | **IA 2.0 workbench** (default post-login area): zones 总览/编排/工程/运行中心/介入中心/工作项/沟通 + governance (`/app/gov/*`), delivery cases (`/app/cases`), and sub-workbenches `/app/eval`, `/app/skillgov`, `/app/ontology`, `/app/bpa` |
| `/app/ide` | **IDE workbench** (default login landing, patch 276/277): codex base + zcode session UI; `/ide` is a compat redirect → `/app/ide` |
| `/hermes/cockpit` | Legacy cockpit, **parallel coexistence** (P4 user ruling 2026-09-11): chat/history/matrix-chat/swarm-kanban sub-routes |
| `/hermes/loop*` | **Retired** (2026-09-18); runcenter views now mounted via ia2 routes |

### Feature Flags (`config/features.ts`, `VITE_*` env vars; read via `import.meta.env` only)

| Group | Flags | Default |
|-------|-------|---------|
| On by default | matrixChat, kanbanEnhancements, branding, extendedI18n, cockpit, ide | on (`VITE_CUSTOM_X=false` to disable) |
| Off by default | matrixAuth, matrixAdmin | off |
| S3 dormant surfaces (opt-in) | voice, pet (`VITE_CUSTOM_PETS`), connectionsExtras, agentManager, externalLinks, imageAssist | off (`=true` to enable) |
| Product features (on) | ekko, eval, skillgov, ontology, bpa | on (`=false` to disable) |

## Custom Code Map (overlay/custom)

```
client/   ia2 (IA 2.0 主界面/stage 页) · ide (IDE 工作台/zcode 会话) · eval · skillgov ·
          ontology · bpa · governance · loop (runcenter 视图组件库) · cockpit (旧驾驶舱：
          adapters/store/kv 仍被新 IA 复用) · matrix-chat · matrix-teams · kanban · chat ·
          branding · ui · settings-layers · test (测试桩)
server/   ~140 domain dirs — one dir per domain, `*-controller.ts` mounts REST, pure logic
          and storage separated, `__tests__/` alongside. Anchors: toolcontract/ (工具契约
          单一事实源) · toolpipeline/ (工具执行瀑布：审计→结果围栏→技能治理→执法门) ·
          harness/ (治理读模型) · loop/graph/ (图执行器/检查点/停滞检测) · approvals/ ·
          eval/ · govbus/ (治理事件总线) · evidence/ (hash 链证据台账)
qgate/    质量门禁（gate-packs/evidence/plugin，自带 vitest 配置）
desktop/  桌面端 A类
hermes-agent-plugins/  Python 插件（run-trace OTel formatter）
packages/ overlay 自有 client/server packages
```

Per-domain conventions live in `overlay/custom/client/AGENTS.md` and `overlay/custom/server/AGENTS.md` — read them before touching those trees. Essentials:

- **Server routes**: prefer adding to an already-mounted controller (e.g. `harness/harness-controller.ts`, mounted via patch 543); a brand-new controller requires a mount patch + `series` entry.
- **Server storage**: JSON/JSONL via `mkdir` + atomic write (tmp → rename); SQLite via `node:sqlite`; tests point env at tmpdir, never write the real home.
- **Failure semantics**: read models fail-soft (`available:false`/`null`); enforcement chains fail-closed. Never mix the two.
- **Client data**: API modules go through `@/api/client` `request` (JWT from `hermes_api_key`); i18n zh/en pairs in domain-level `i18n.ts`; styles use CSS-variable tokens (no raw hex); interactive nodes carry `data-testid` (`<域>-<对象>-<状态>`); heavy tabs lazy-load.

Loop graph engine: `GRAPH_ENGINE` three-state (`legacy`/`shadow`/`on`), event log (`node:sqlite`) as single source of truth, `/api/graph/runs` + `/api/graph/specs` REST, `/graph` socket namespace. Migration: `node scripts/graph-migrate.mjs` (dry-run default).

Runtime layer (`overlay/runtime/`): semantica MCP (knowledge infra, patch 375 → hermes-agent) + pua behavioral skills, pinned versions, managed via `runtime:*` commands.

## Testing

- **Config**: `vitest.config.ts` — hand-maintained, tracked in git (unlike the generated `vite.config.overlay.ts`)
- **Pattern**: `custom/**/*.test.ts` + `scripts/**/*.test.ts` — tests live in `__tests__/` next to their domain
- **Alias**: must mirror `vite.config.overlay.ts` alias chain — keep both in sync when aliases change; `OVERLAY_UPSTREAM_ROOT` redirects the `@` fallback for worktree isolation
- Setup file: `custom/client/test/setup.ts`; DOM tests opt in per-file via `// @vitest-environment jsdom` directive (no global environment); server tests run in plain node env; `testTimeout: 20000` globally

## Adding A类 Features

1. Create component/store in `custom/client/<feature>/` (or domain dir in `custom/server/<domain>/`)
2. Export `register<Feature>(app)`; call it from `registries/client/bootstrap.ts` behind a feature flag
3. Use `registerRoute`/`registerNavEntry`/`registerComponent` to collect extensions
4. `npm run dev` for hot-reload verification

## Adding B类 Patches

1. Modify `upstream/hermes-studio` directly (temporary)
2. `git diff > overlay/patches/NNN-description.patch`
3. `git checkout -- .` to restore upstream
4. Append patch filename to `patches/series`
5. `npm run inject` to verify application

Patch conflicts on upstream upgrade: `git apply --reject` to resolve manually, then fix the patch file.

## Upstream Repositories

| Repo | Version (2026-10-21 audit) | Purpose |
|------|-----------|---------|
| hermes-studio | v0.7.38 (stable line = 0.7.x; v1.0.x tags are misc, not releases) | Main injection target (Vue + Koa + Electron) |
| element-web | v1.12.32 | Matrix client reference implementation |
| hermes-agent | v0.22.2 | AI agent runtime (Python); some patches route here |
| zcode | v3.16.1 (`origin/main 0a1fc56`; installed app 3.16.2) | IDE workspace engine base (managed fork via `zcode-patches/`; 7 active patches) |
| claude-code, codex, dsh-TUI, deepseek-harness, minimax-code, kimi-code, multica, routa | — | Read-only reference sources (Swarm-yuan research / armada lineage) |

## Workspace Siblings (outside overlay/)

- `simharness/` — simulation harness, **separate git repo**; overlay consumes it read-only. Sim runs write to `ncwk-sim-mux/` (SIM_ROOT), never the host `~/.hermes/hermes-agent`. Full-flow sim spec canonical: `overlay/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`
- `overlay/docs/superpowers/` — the **live** design-doc tree (`specs/` architecture designs, `plans/` implementation plans); `docs/superpowers/` at workspace root holds the earlier (pre-October) era of specs
- `docs/universal-delivery-gate-zcode-design-v0.1.md` — zcode engine design; `docs/upstream-analysis/` — upstream analysis

## Environment Requirements

- Node.js ≥ 23.0.0
- Upstream repos must be cloned and pristine before `npm run inject`
- First-time dev: after `npm run inject`, run `npm install --ignore-scripts` in `upstream/hermes-studio` and `mkdir -p dist`

## Gotcha: same-version desktop cache

Desktop `webuiDir()` prefers `~/.hermes-web-ui/webui/<version>/` (see `upstream/hermes-studio/packages/desktop/src/main/paths.ts`). Every release must bump the version; after reinstall, remove the old copy: `rm -rf ~/.hermes-web-ui/webui/<version>/`
