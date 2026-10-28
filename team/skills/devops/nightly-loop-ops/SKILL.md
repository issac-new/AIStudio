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

## v3.9 fin-sentinel 金融舆情态势步（2026-10-19，全链 7 卡交付）

- **新增步**：`run_step fin-sentinel "$REP/fin_sentinel_$D.pdf" bash ~/.hermes/scripts/fin_sentinel_cron.sh`（8 域后）；另有 `graph-shape` 步（看板 DAG 宽度巡检，kanban_graph_shape_check.py，根治「构图过度串行」——规则见 kanban-orchestrator skill「拆卡第一刀切在依赖边界」）。
- **管道**：40 源 watchlist（research/fin-sentinel-recon-20261019/watchlist.yaml，T1×8/T2×32/零T3，五类机构×五事件轴中英），fin_sentinel.py（fetch 含 cninfo POST 型/hkexnews 双重 JSON 解码型/sec-edgar-fts/sina JSON 等特殊 fetcher）→ build_fs_report.py（五轴分布+重点关注+机构分桶，LLM 研判段走 radar_llm 链）→ pandoc+Chrome PDF → 微信 stdout 摘要。
- **哑源判据**：fetch_one 的 SILENT_SOURCE——ok=True 且 items=0 必须显式告警，防「名义达标实际空采」（D2 蓝军 2026-10-19 实证：JSON API 被错映射到 RSS 解析器静默产 0 条）。
- **LLM 限额坑**：zcode/direct 撞 1310 周月限时，管道降级规则研判版（非静默——报告头明示）；限额重置后自动恢复 LLM「今日态势」段。radar_llm 的 hermes 计费兜底有总量闸，不会无限烧。
- **root cause 存档**：10-19 雷达链 rc=126/127 断裂＝10-17 13:10 用户批准的内置盘清理把 workspace 8.4G 整体归档至 nvme（含 .git 与 .venv），先存档再删协议生效、恢复无损——但恢复前 loop 断链两夜。教训：批准整目录清理前 grep 引用面（loop 硬编码 $R/scripts 路径的全量清单）。

## v3.12 loop-graph render 连败三层修复（2026-10-23，commit b414d0ed3）

- **模板 col 硬上限 5**：archify workflow schema `nodes[].col` maximum=5（generated-validators.mjs 实锤）。10-19 融合收尾给 IR 模板加 fin-sentinel 节点用了 col=6 → 10-20 起 deliver 每晚 schema 拒收，HTML 冻结在 10-19（用户观察=「每天内容重复」）。修法=加第三泳道 `fs-lane`（lanes 无数量上限）安置 fin-sentinel col=4。**改 IR 模板必须先数 col≤5**；溢出时加泳道，不加列。
- **第二道坎 desktop-readability**：col 修好后 deliver 仍挂 composition/desktop-readability——三泳道拉宽 viewBox(1041)，scale 降到 0.893，最长 sublabel `step-fs fin_sentinel_cron` 投影 5.45px < 6px 下限。修法=缩短文案+width 118。**改版图几何后最长文案是 readability 检查第一嫌疑人**。
- **judge_render 假绿盲区**：旧判据=「最新 loop_graph_status_*.json mtime≤30h」。render 失败路径异常上抛不落快照 → 三夜连败零痕迹；失败快照一旦写入又假绿（t_b989b4f3 自证悖论镜像）。根治=判据改盯 **OUT_HTML mtime**（deliver+visual-check 双过才刷新，唯一诚实信号）+ **deliver 失败也落快照**（visual=`fail:<类型>`）。
- **xhs 浏览器预采挂死链**：10-23 02:49 Chrome goto 超时后 wedged，`page.screenshot()` 无限挂起 7h，loop 卡死 fin-sentinel 步（render/digest/heartbeat 全灭）。双层修复：脚本内两处 screenshot 加 `timeout=10000`；wrapper 层 600s perl alarm 墙钟帽（reclaim 同款 rc=142）。**playwright timeout 只保护显式带参调用，screenshot/content 默认无界**。
- **杀在跑 wrapper 前查 inode**：bash 边读边执行，patch 若原地改写同 inode，在跑进程从字节偏移恢复会错位读。stat 确认 patch 产生新 inode 才安全 kill。
- **陈尸 index.lock**：workspace 仓 0 字节 index.lock（lsof 无持有）挡 commit 3 天，确认后直接 rm。

## v3.11 3600s 墙钟根治 + 心跳口径对齐（2026-10-20，卡 t_5ce6cf31）

- **超时三落点已配 7200s，全部实证**：cron script timeout 解析链（`cron/scheduler_script.py _get_script_timeout`）= `_SCRIPT_TIMEOUT`（测试用）→ env `HERMES_CRON_SCRIPT_TIMEOUT` → config `cron.script_timeout_seconds`（**在 DEFAULT_CONFIG 里，默认 3600**）→ 3600。fire 路径走 external worker：`set_hermes_home_override(属主 home)` 后 env 读属主 `.env`、config 读属主 `config.yaml`（`scheduler.py:3905` 实锤）。落点：①orchestrator/.env `HERMES_CRON_SCRIPT_TIMEOUT=7200`（最高优先）；②orchestrator/config.yaml `cron.script_timeout_seconds: 7200`（config 兜底）；③default ~/.hermes/config.yaml 同键（独立 gateway 兜底）。三处均以 PM selected venv 实测 `_get_script_timeout()=7200` 收口。
- **心跳「0/8 域」根因**：nightly_heartbeat.sh 的 `DOM_OK/DOM_ALL` 只数 8 域 PDF，但标签写「radar/[已移除]/8域」——10-19 夜（.venv 断链全灭）心跳显 0/8，读者以为 10 报告全缺。已改为 radar+[已移除]+8域=10 分母（10-20 实测 10/10，10-19 实测 1/10=dom-pay，双极性验证过）。
- **快照目录 mkdir 补丁**：loop 状态快照写 `cache/radar/unified_loop_$D.json` 前 mkdir（10-19 err.log 实锤：目录缺失时 `|| true` 静默吞错，次日判色缺快照）。
- **launchd 孤儿 02:15 裁决：保留作安全网**。7200s 后 cron 侧最迟 02:02 终止，孤儿 02:15 起跑无重叠；它近 5 夜救了 2 夜（10-19 cron 未触发、10-20 cron 被超时杀，全靠 02:15 收尾）。摘除收益仅省一次 33min 幂等 SKIP 空跑。未来摘除条件：cron 入口连续 ≥5 夜自然满跑且无超时/未触发记录，方可 bootout。
- **10-15/10-19 digest 不补**（operator 裁决 2026-10-20）：10-15 在停役窗内无产物、10-19 断链夜仅 domain_pay/fin_sentinel 两个 PDF，拼不出 digest（跑了也是 `no report PDFs; abort`）。10-20 已补发（marker `.digest_sent_2026-10-20.json` sha1 92e0869e…，10 parts+evo，agent mail msg_5ocw6qeS 实锤）。
- **agently OAuth 恢复**：`agently-cli auth login` 设备流（用户交互）后 +me/`message +list` ok:true。keychain 存 token，config.json 仅 app_id（`cli_002e8cd148c14ad8`）无敏感字段。CLI 1.0.11→1.0.18 更新提示不影响功能。

## v3.10 双通道断信夜复盘（2026-10-20，用户问「为何没收到昨日 digest 邮件」）

- **bash `$(date)` 重置 `$?` 陷阱**：`echo "[$(date)] step rc=$?"` 中命令替换先执行，rc 恒被记 0——10-20 夜 digest 双通道失败被记 `digest rc=0`，铁证=10-19 夜 `.venv/bin/python: No such file or directory`（必然非0）也记 rc=0。修法=先 `drc=$?` 再 echo，且 `STEP_RC+=("digest:rc$drc")` 进 full-done 行。全脚本 grep `rc=\$?` 防同类。已修（loop 脚本 210-213 行）。
- **邮件双通道自 10-14 起无有效回退**：10-14 凭据轮换把 `~/.hermes/.env` 的 EMAIL_* 换成 `__ROTATED-20261014__` 占位符（连各 bak 备份同占位），SMTP 回退连得上 smtp.qq.com 但 AUTH 被拒；agent mail 成独通道。10-17 20:11 agently-cli 自更新后 refresh token `invalid_grant` → 独通道也死。digest/watchdog 告警/evo 晨报全走此通道，一损俱损且 rc 被吞 → 连告警都没有。恢复=`agently-cli auth login`（交互式，只能人做）→ 补发 `.venv/bin/python scripts/nightly_digest.py <date>`（marker 未写会重发）。10-20 已把假 EMAIL_* 键从 .env 撤销（从 10-04 bak 恢复后实测 AUTH 拒，备份同占位，回退不可用）。
- **幽灵 02:15 第二跑 = launchd 孤儿 `ai.hermes.unified-nightly-loop.plist`**（birth 10-15 22:09，v3.8 恢复期残留，未登记任何文档）：每夜 02:15 直接 bash 拉起同一脚本，绕过调度器（cron output 无记录）。**近 5 夜它反而是救命的**——10-19 cron 未触发、10-20 cron 00:02 跑在 01:02 被 3600s 超时杀（dom-data 单步 10min 拖爆墙钟），全靠 02:15 重跑收尾（幂等 SKIP 掉已完成步）。裁决：暂留作安全网，已在此登记；根治 3600s 超时（拆卡或裁步）前不得摘除。
- **cron 入口 3600s 墙钟已临界**：全链自然时长 55-75min（域步 2-10min/个 + radar 重试），超时杀会复发。两个入口并存时 02:15 跑因 SKIP 而快——单入口恢复后需重估时长。

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

## v3.8 update-venv 断裂链与 PATH 断供（2026-10-16 恢复排程实录）

- **`hermes update` 半途中断留三种雷，全部要查**：① `hermes-agent/venv` 被清空重建后只剩 certifi（`venv/bin/python` 不存在）——loop 链条 21 个脚本硬编码该路径，整夜 rc=127/FileNotFoundError；② `.git/hermes-update.lock` 持有进程变僵尸（无 git 子进程、stdout 进死 pipe），之后每个 CLI 都报 "an update is still running"——杀僵尸+删锁才恢复；③ update 把 dirty 文件误报 "half-written"，先 `git diff` 看改动是否有意义再判损坏（本次 kanban_tools.py 的 G2 真伪校验是完整本地改动，非半写）。
- **`hermes update` 不补建 venv 依赖**：git 树修好后 PM 仍报 venv current，但 `venv/bin/python` 依然不存在。官方路径只在 git 层收尾，Python 依赖层要另修。
- **PM 正式运行环境不在 `hermes-agent/venv`**：在 `~/.hermes/installs/<store>/environments/<selected>/venv`（facts.json 的 `packages.venv.environment` 字段指认，editable finder 的 MAPPING 指向该 env 的 `workspace/` 副本）。验证入口=`$SELVENV/bin/python -c "import sys;sys.path.insert(0,'/Users/YOURNAME/.hermes/hermes-agent');import pm;print(pm.activate())"`——用系统 python 跑必然 ModuleNotFoundError（缺 ruamel），别误判 PM 坏了。
- **loop 可用的全依赖解释器 = life-workbench/.venv**（yaml+feedparser+pymupdf+markdown 实测 OK）；`hermes-agent/venv.py311` 缺 feedparser 不全；PM selected venv 有 ruamel 但无 pyyaml/feedparser，不能替代。
- **hermes CLI 引用改 `~/.hermes/hermes-agent/.hermes/bin/hermes`**：由 tools-python 直驱（`/Users/YOURNAME/.hermes/tools/python-3.14.7*/bin/python3`），不依赖任何 venv，cron/worker spawn 全走它。
- **cron 环境 PATH 只有 /usr/bin:/bin**（`launchctl print gui/$(id -u)/<label>` 实测）：node(~/.local/bin)、pandoc(/opt/homebrew/bin) 均不可达 → radar 的 llm_brief（env: node 找不到）与 md_to_html（pandoc 找不到）整夜失败。修法=入口脚本统一 `export PATH="/Users/YOURNAME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"`，子脚本全继承。
- **判色双落点口径**：session_friction_scan.py 的 RADAR_DIR 解析到 `~/.hermes/cache/radar/`，而 render_loop_graph.py 旧读 `life-workbench/cache/radar/` → friction 节点永远误报 RED。判色侧改双候选目录都查，比改写入点安全（写入侧有其他消费者）。
- **恢复排程完整动作链**（顶部恢复程序已不够，以此为准）：杀 update 僵尸+删锁 → `hermes update` 收尾 → 修脚本 venv/PATH → friction/watchdog 实测 → 看门狗白名单加回两条 entry（**entry 名不能含空格**，"统一夜间Loop Graph入口" 会被 for 循环分词拆碎产出「状态未知」误报，改 `统一夜间Loop入口`）→ BANNED_EXTRA 清空 → resume → 双极性测试 → `gateway restart` 等 api_server connected 行（**restart 后 api_server 要 1-2 分钟才连上**，drain 阶段 "still draining" 是正常的，别反复重启）。
- **render cron `aaad7e8586aa` 永久保持停役**：09-21 已折入 loop 的 render 步且在 BANNED，恢复=双跑+看门狗告警。loop 内 render 步失败时看 `nightly-loop-graph.visual-check.json` 的 Chrome Target.getTargets 超时（机器刚唤醒的瞬时故障，已自动回滚 .bak，无损坏）。
