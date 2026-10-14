---
name: nightly-loop-ops
description: "Use when editing the unified nightly loop or its cron jobs."
version: 1.0.0
metadata:
  hermes:
    tags: [devops, cron, nightly, loop, scheduler]
---

# Unified Nightly Loop Operations

> **停役状态（2026-10-10 用户裁决：免费优惠结束）**：`3e1690d29660` 统一夜间Loop入口
> 与 `922320a901e3` 存活看门狗均已 pause（jobs.json 已写 paused_reason）；复活看门狗
> `224b9f33d637` 的 WHITELIST 已清空（否则每 6h 自动 resume 回去），双份脚本
> （`~/.hermes/scripts/` + profile `scripts/`）md5 同步，`.bak-1010` 备份在位，
> `bash -n` + 实跑 rc=0 已验。**恢复排程**：WHITELIST 加回两条 entry → 删脚本内
> 停役注释 → `hermes cron resume` 两个 job。

Orchestrator-profile skill for the unified nightly loop: entry job, step
chain, integrated batch gates, and the retirement blacklist. General cron
consolidation discipline lives in the cron-job-management skill; this skill
carries the loop-specific contract. General cron semantics (model-drift
pinning, no_agent conversion, weixin delivery triage) stay there too.

## Always-on rules

- **Consolidate before folding.** Merge same-cadence jobs into ONE
  composite script per cadence with an internal frequency gate keyed on the
  pipeline date anchor (weekly = Monday, monthly = 1st) that self-declares
  SKIP; one step per job turns the loop into dozens of fragile steps.
- **Four categories never fold — disclose them, don't degrade them**:
  minute-cadence watchmen (a daily loop cannot host a 5-min heartbeat;
  folding neuters the guard), jobs under another profile's HERMES_HOME
  (the scheduler only reads its own jobs.json), long-running/daemon
  processes, and anything the user ruled on separately. Keep them standalone
  and list them in the handoff report — 'all integrated' must never mean
  'guards silently dropped'.
- **Retire = disable + blacklist, never delete.** Backup jobs.json (.bak),
  disable the job, add its id to the BANNED list; prompt, model pin, and
  schedule stay restorable. BANNED detection must anchor the list row's
  `[active]` state — bare-id grep hits disabled rows forever and false-
  alarms every patrol; `[active]` anchoring keeps disabled rows silent
  while still catching a disabled job flipped back to enabled (the classic
  batch-sync accident).
- **Agent-type jobs use keep-number mode**: schedule a VALID never-firing
  expr, keep enabled=true, keep the model/provider pin, and let the loop's
  frequency gate drive them via `cron run`. Two traps: disabled jobs are
  refused by `cron run` (so enabled=true is load-bearing), and day-of-month
  beyond the month's real length (`31 2 *`, `30 2 *`) is an INVALID cron
  expr — croniter rejects it, the job cannot fire or be run. Validate any
  'never-equivalent' expr with a croniter next-fire probe, never by eye;
  `29 2 *` is the canonical never-date.
- **`cron run` is synchronous.** It returns only at terminal state — agent
  jobs can run tens of minutes, so call it with a long timeout from loop
  steps and scripts. Killing it (interactive timeout) leaves an `unknown`
  execution row ('owner exited before a durable terminal state', side
  effects unknown, no auto-retry).
- **Live schedule changes go through `cron edit`, not jobs.json.** The
  running scheduler holds in-memory schedule state that direct file edits
  do not refresh — the entry time can silently stay on the old value until
  an arbitrary reload. The file route is for pin/prompt surgery where
  next-natural-reload pickup is acceptable.
- **Date-anchor discipline.** Folded consumers read the exported pipeline
  date anchor and never self-compute dates (`date +%F` after midnight
  flips the day; hour heuristics read the wrong night). Migrating the entry
  time across a day boundary requires sweeping consumers for self-computed
  dates and hour heuristics BEFORE the move, plus checking the old boundary
  for orphan independent crons the new guard window would silently block.
- **Render digest email bodies before delivery.** Keep the digest source as
  Markdown, convert it to HTML immediately before sending, and pass the HTML
  file through the mail CLI's body-file option while keeping the PDF as the
  attachment; plain Markdown passed as a body file is delivered literally by
  clients that do not render Markdown. Exercise the conversion with a smoke
  assertion for heading and blockquote tags, and remove the temporary HTML
  file in `finally`.

- **Weekly absence without catchup = silent weekly-report starvation.** The
  weekly frequency gate (Monday-only, one-vote) silently starves the whole
  week's report when the entry job misses Monday — pmset logged two 00:12
  low-power sleeps (2026-09-28, 2026-10-02) that skipped entire nights, and
  `evals/weekly-*.md` went 12 days stale with zero alerts (caught 2026-10-03
  by manual audit, card t_64052c03). `run_weekly` now carries an artifact-age
  catchup: on non-Monday runs it checks the step's artifact (or the most
  recent Monday `full done` log line); stale/missing beyond 8 days forces one
  catchup run logged as `WK-CATCHUP`, fresh artifacts still `WKSKIP`. Any new
  weekly step must declare its artifact path via `--guard` or accept the
  full-done-line criterion.

## Verification

- `bash -n` every touched script, then smoke-run the loop with today's
  artifacts already present — every step SKIPs, which exercises the full
  chain wiring end-to-end for free (no LLM spend). An all-green SKIP run is
  the wiring proof; a fresh-artifact run is the content proof.
- Watchdog tripwires need both polarities tested: disable a blacklisted-but-
  present job and confirm the patrol stays green, then flip it enabled and
  confirm it alarms. A tripwire validated on one polarity only is not
  validated.
- After any schedule migration, `cron list` the entry and read `Next run`
  from the CLI output — that value reflects live scheduler memory, unlike
  the file.

## Topology contract (mutable — update on restructure)

Entry `3e1690d29660`「统一夜间Loop Graph入口」@ `2 0 * * *`; loop script
`~/.hermes/scripts/unified_nightly_loop.sh`; step snapshot
`~/.hermes/cache/unified_loop_YYYYMM.log` via `run_step <名> <守卫> <cmd>`
(idempotent, SKIP on existing today artifact); renderer judges colors from
that snapshot; watchdog findings surface through snapshot→render, not cron
incidents. Authorization window 00:00–08:00 (user ruling, decider-script
guards); provider billing window is a separate decider — never couple.
Step order v3.3: sweep → reclaim → integrated batch (8 daily + weekly gate
Mondays + monthly gate 1sts) → radar → [已移除] → 8 domains (30s stagger) → evo
→ friction → gh threats → agent-type keep-number jobs → snapshot → digest
→ render → docsync → heartbeat; infra before workload. Keep-number:
skill-mining-weekly `0ccf161ff8ad` @ `7 3 29 2 *`, ttvv-monthly
`e7c616111c7a` @ `9 3 29 2 *` (loop-gated via cron run). BANNED blacklist
lives in the cron self-heal watchdog script, `[active]`-anchored.
Rollback: `cron/jobs.json.bak-20260921-v33`. Not foldable (standalone,
disclosed): minute-cadence watchmen (mailbox / breaker 5m / card-stuck 30m
/ worldmonitor / meta / cron patrol / session-line), 夜间Loop存活看门狗
`922320a901e3` @ `30 1 * * *` (independent of the loop it guards; cron
shim in profile scripts/, real script `~/.hermes/scripts/loop_liveness_watchdog.sh`;
alerts only when the day's `full done` line is missing AND no loop process
is alive — closes the 10-02/10-06 "loop dies → heartbeat dies → zero
alert" blind spot; test with `WATCHDOG_DRYRUN=1 WATCHDOG_FAKE_DATE=<dead
night>`, fake date refuses without dryrun; guard-of-guard: whitelisted in
cron_paused_watchdog), and ~15 other-profile jobs (scheduler is
HERMES_HOME-scoped).

## v3.6 auto hotspot schedule (2026-10-07, user ruling)

- **Schedule**: workdays 09:00 auto-ON, 19:00 conditional-OFF, 22:00 fallback-OFF.
  Pluralist `ai.hermes.hotspot-auto` (one plist, 3 StartCalendarInterval entries,
  wrapper `hotspot_auto_dispatch_wrapper.sh` routes by hour; missed-fire between
  9-19 treated as 09, else 22). Log: `~/.hermes/logs/hotspot-auto.log`.
- **Workday check**: `~/.hermes/bin/workday_check.sh` — timor.tech holiday API,
  type 0=workday / 3=调休补班 both count as workday; per-day cache file
  `~/.hermes/cache/workday-YYYYMMDD`; API fail → weekday-only fallback (biased
  toward false-ON: extra OFF-hours at home cost less than cellular burn) + WARN log.
- **19:00 restore must read the REAL zone, not the marker-gated one**:
  `network_zone.sh real` bypasses the marker (`gated` would mask `home` and the
  restore branch becomes dead code — caught in test). Restore OFF only when the
  machine is genuinely back on 192.168.1.0/24; 22:00 unconditionally OFF so the
  nightly loop is never gate-stuck.
- **09:00 is unconditional ON on workdays** (user semantics: workdays 9-19 ARE
  hotspot time), not zone-dependent — else a late hotspot join leaves download
  apps running on cellular with no marker.

## v3.7 workspace & home-SID drift fix (2026-10-13, user ruling)

- **Home segment changed 192.168.1.x → 192.168.0.x** (user replaced router).
  `network_zone.sh` HOME_SEG updated; 10-08~10-13 every night misjudged `away`
  and the whole loop GATE-SKIPped silently (full done line still written, so
  the liveness watchdog stayed green — gate skip masks dead nights). If the
  gate fires every night, check the REAL subnet against HOME_SEG first.
- **Workspace root R switched back to home** (`~/hermes-docker-sandbox/
  workspace/life-workbench`): the script had drifted to the frozen nvme clone
  after 10-05. Swept nvme hard-paths out of the whole chain: loop entry (R,
  doc-quality, digest), reclaim MAIN, radar supervisor BASE, friction scan
  gap_register(+CLI), liveness watchdog R+sys.path, ops radar wrapper B,
  render_loop_graph.py (LB/RESEARCH/gap_workspaces), [已移除]+domain BASE (LWB and
  ~/.hermes/scripts copies), docsync BASE, heartbeat BASE+MAP_URL,
  render_loop_graph_cron.sh, failure_pattern_monthly WORKSPACE,
  weixin_backlog_deliver REPORTS/STATE. **Kept on nvme on purpose**: reclaim
  ARCHIVE_BASE (cold archive per 先存档再删), radar_llm zcode session dir,
  clef_serve model dir, ccswitch-statusbar repo (lives only on nvme).
- **home .venv rebuilt by full-tree copy** of the nvme .venv (105 pkgs, 770M;
  the 5-pkg recipe was stale — full-tree copy is the fidelity-preserving
  route; import-graph re-derivation is the fallback). Verified: interpreter
  3.12.15, feedparser/crawl4ai/pymupdf/yaml/lxml/PIL import OK.
- **Verification chain**: `bash -n` all touched scripts + py_compile py files,
  `network_zone.sh` → home, then a real full-chain run (artifacts absent →
  every step actually executes).

## v3.5 hotspot gate (2026-10-07, user ruling: save cellular data)

- **Single preflight gate, never per-step edits**: after `declare -a STEP_RC`, the loop
  calls `~/.hermes/bin/network_zone.sh` (outputs `home|away|gated|offline`; home =
  192.168.1.0/24 by interface IP, NOT SSID — TCC redacts SSID and renames break it;
  marker `~/.hermes/hotspot_mode` forces `gated`). Non-home → all steps logged as
  `GATE-SKIP` and the skip path STILL writes the `full done` line (liveness watchdog
  contract) with exit 0.
- **Toggle**: `~/.hermes/bin/hotspot_mode.sh on|off|status` (`HOTSPOT_DRYRUN=1` for a
  no-side-effect drill — dryrun must NOT leave the marker). ON quits Thunder/
  BaiduNetdisk/wpscloudsvr, pkills `netdisk_service` (netdisk's hidden helper — NOT in
  launchd gui domain, bootout can't reach it), boots out updater agents, snapshots
  state to `~/.hermes/hotspot_state.json`; OFF restores updaters from the ledger.
- **matrix-synapse container stays running in hotspot mode**: it hosts the cluster
  Matrix gateway (`MATRIX_HOMESERVER=http://localhost:8008`) and measured ~16MB
  egress per 25h — stopping it cuts the human-machine channel for nothing.
- Patching CJK strings into this script corrupts bytes mid-line (observed twice on
  2026-10-07); prefer ASCII echo messages inside it.

## v3.4 hardening (2026-10-07 postmortem)

- **reclaim 600s hard cap**: the step is wrapped in
  `perl -e 'alarm shift; exec @ARGV' 600` — the 10-06 night died here
  (hung reclaim ate the scheduler's 3600s timeout kill; whole loop +
  heartbeat lost silently). alarm survives exec (SIGALRM → rc=142,
  verified); the kill surfaces in the full-done line and digest anomaly
  section instead of a dead night.
- **digest never aborts silently**: `_night_anomalies(date)` parses the
  loop log for rc≠0 steps and start-without-end hangs. All-PDFs-missing
  now sends a degraded text-only mail (idempotent marker; exit still 1);
  the normal path prepends a「昨夜管线异常」section.
- **evo report self-certification**: S3/S6 `[:10]` truncation root-fixed
  (real backlog was 20 profiles, reports showed 10 for six straight
  nights); the morning report header now carries probe timestamp +
  scanned/violating/missing counts; unadjudicated proposal backlog is
  surfaced in-report (arbitration node was open-loop, 7 pending).
- **render**: `ARCHIFY_CHROME` pinned to the Chrome binary — Chrome
  auto-update windows (10-07 00:44) made archify's visual-check fail and
  roll back the graph. Pin, don't hope.
- **`.venv` is load-bearing**: life-workbench/.venv vanished → radar
  rc=126 for the whole load batch. Rebuilt on python3.12 with
  feedparser/crawl4ai/markdown/pymupdf/pyyaml; no requirements.txt
  exists — deps were re-derived from the import graph, same recipe if it
  vanishes again.
- **kanban write-guardrail UDF** (3rd recurrence): replay via
  `guardrail-test-teardown/apply-guardrail-v2.sh` (git apply --3way,
  version-decoupled); self-heal mounted as section 4 of
  `~/.hermes/bin/tui-patch-watchdog.sh` (launchd 300s; skips while the
  update lock exists).
- **gap register single-source**: workbench `gap_register.yaml` is
  canonical; the `~/.hermes/gap_register.yaml` fork (19 entries, 18 id
  collisions, invisible to weekly triage — why friction gaps never
  closed) is archived `.orphan-20261007`, 4 open entries migrated,
  `session_friction_scan.py` re-anchored. Backlog truth: 171 open (the
  09-08 audit's 71 grew).
- **manual rerun playbook (2026-10-07)**: to backfill a dead night, wrap the
  load steps in a scratch script with `NIGHT_DATE=<date>` + per-step artifact
  guards (PDF exists → SKIP) + 30s stagger; run as a background terminal
  (notify=true). Verify from the LOG step matrix, never the process exit code
  (no `set -e`; the final `say` line forces rc=0). Two noise traps: some
  inner pipeline prints bypass the step redirect via the tty (appear on both
  channels), and the background session may emit a conda env-probe error
  block at teardown that never touches the pipeline log — attribute via the
  log, and pull full stdout with process_manage(action="log") when the
  completion notification is truncated.
- **gap-triage weekly shim interpreter**: system py3.9 lacks yaml →
  hermes-agent venv (yaml 6.0.3).
- **repo topology gotcha (commits)**: `life-workbench/` has NO `.git` of
  its own — `git -C life-workbench …` resolves to the parent workspace
  repo, whose `.gitignore` excludes `life-workbench/` wholesale
  (initial-push bulk-out policy; precedent: `scripts/nightly_radar.py`
  and `radar_llm.py` were force-added despite the rule). Consequence: a
  plain `git add` of edited files silently no-ops and `commit` reports
  "nothing to commit" even with fresh edits on disk. Version-worthy
  source files get `git add -f` from the workspace root (2026-10-07:
  nightly_digest.py / render_loop_graph.py / cron_paused_watchdog.sh /
  gap_register.yaml → `6329563f`); artifacts and `.bak` stay ignored for
  auto-backup. `.venv/` is already ignore-covered (check-ignore ✓) — no
  auto-backup swallow risk after the rebuild.
