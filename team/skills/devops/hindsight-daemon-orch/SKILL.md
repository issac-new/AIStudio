---
name: hindsight-daemon-orch
description: Use when hindsight daemon 崩溃循环/retain 卡滞/recall 超时诊断。
version: 1.0.0
author: Hermes Agent (orchestrator)
platforms: [macos]
metadata:
  hermes:
    tags: [hindsight, daemon, crash-loop, mps, launchd, retry-storm]
    related_skills: [hindsight-model-configuration, hindsight-fleet-operations]
---

# Hindsight Daemon Ops (orchestrator-owned)

The single hindsight-api daemon (:8888, launchd `io.hindsight.api`) is launched from
THIS profile's `~/.hermes/profiles/orchestrator/hindsight/start.sh` via `launch.py` —
env-var fixes land in that start.sh, then require a restart (env is read once at
launch). Catalog authority: `hindsight-model-configuration` and
`hindsight-fleet-operations` (default profile) own the full env-var catalog, bank
topology, and fleet audit. This skill carries ONLY the two daemon-failure mechanisms
they lack; do not duplicate their content here.

## Step 0: establish you are reading the LIVE log before diagnosing

Find the daemon's real log path from the launchd plist
(`~/Library/LaunchAgents/io.hindsight.api.plist` → `StandardOutPath`/`StandardErrorPath`),
then `tail` it and check the newest timestamp against `date`. A stale log file in a
plausible location misleads diagnosis for several wasted steps — a log whose last
entries are weeks old is a leftover, not the daemon's output.

## Crash-loop: Metal SIGABRT → FORCE_CPU

Detection signals (any two together = crash-loop, not a one-off):
- `launchctl list | grep hindsight` shows exit code `-6` (SIGABRT) and a PID that keeps
  changing between invocations.
- `lsof -nP -iTCP:8888 -sTCP:LISTEN` returns a DIFFERENT PID seconds apart — the port
  listener is being replaced as the process dies and KeepAlive relaunches it.
- The service answers `/health` with healthy, then drops within ~a minute. A single
  healthy poll proves nothing during a crash-loop; poll repeatedly or check PID
  stability first.

Root cause signature in the log:
```
-[AGXG13XFamilyCommandBuffer tryCoalescingPreviousComputeCommandEncoderWithConfig:]: failed assertion `A command encoder is already encoding to this command buffer'
```
Running the two local BGE models (embedding + reranker) concurrently on the Metal GPU
races the command-buffer encoder → hard SIGABRT → KeepAlive turns it into a chronic
loop (hundreds of restarts). This is a DRIVER concurrency abort, distinct from the
MPS memory-leak reason CPU is the default (see `hindsight-model-configuration`).

Fix — pin both local models to CPU in `~/.hermes/profiles/orchestrator/hindsight/start.sh`
(backup start.sh first):
```bash
export HINDSIGHT_API_EMBEDDINGS_LOCAL_FORCE_CPU=true
export HINDSIGHT_API_RERANKER_LOCAL_FORCE_CPU=true
```
Then restart. If the process was crash-looping, bootout+bootstrap guarantees one clean
start with the new env (kickstart alone can race):
```bash
launchctl bootout gui/$(id -u)/io.hindsight.api
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.hindsight.api.plist
```
Verification (all three, in order):
1. `/health` → `{"status":"healthy"}` AND the PID holds stable across ≥2 checks spaced
   a minute apart.
2. Log shows `forcing CPU mode` for both models.
3. `grep -c "failed assertion" <live-log>` does NOT increase after the new process
   starts — count BEFORE the restart as baseline; old crashes stay in the log forever,
   so the raw count alone is meaningless.

Cost: CPU-mode startup is slower (~30-90s model load) and embed/rerank latency rises
slightly. That is the accepted trade for stability.

## Healthy-but-stalled: LLM invalid-JSON retry storm

Symptom: `/health` healthy, but retain POSTs hang past client timeout, recall on large
banks times out, log shows `[STUCK?] ... type=batch_retain ... stage=llm.anthropic.retain_extract_facts`
with climbing age.

Confirm from the log: `Anthropic returned invalid JSON, retrying...` repeating (grep
and count). Mechanism: the upstream model emits a `thinking`/reasoning block ahead of
the payload; Hindsight's JSON extraction rejects the shape and retries the same call.
The upstream returns HTTP 200 — the model is reachable and fine; the OUTPUT SHAPE is
wrong. Do not chase connectivity.

Probe to isolate: send a minimal non-streaming completion through cc-switch
(127.0.0.1:15721) and inspect the body — a `thinking` content block confirms the
shape mismatch without touching hindsight.

Handling rules:
- Prove the read path independently: recall on a SMALL/new bank completes in seconds
  even during a storm; a large-bank recall timeout is queueing, not breakage.
- `[STUCK?]` is a latency warning, not data loss — retains retry and eventually land
  (`[BATCH_RETAIN_TASK] Completed` lines appear in the log). Don't re-fire retains
  during a storm; check the queue instead.
- The durable fix is at the backend: a model/route that returns plain JSON (no thinking
  block), e.g. switching `HINDSIGHT_API_LLM_MODEL` to a non-reasoning model in start.sh
  + restart. Routing around cc-switch to a direct upstream is FORBIDDEN (user hard
  rule, see `hindsight-fleet-operations`).

Distinguish from the quota case: invalid-JSON retries with HTTP 200s = output-shape
problem (this section). 429/quota errors in the same log = upstream trip →
`hindsight-fleet-operations` retain-vs-recall canary rule.

## Stalled queue: orphan processing claim starves the bank (DB restart mid-task)

Detection signal — the `[PENDING_BREAKDOWN] consolidation: total=1 claimable=1 ...
assigned=0` poller line repeating every 30s for tens of minutes while `WORKER_STATS`
shows `my_active: none` and consolidation slots idle. Not a crash, not a retry storm:
the queue itself is wedged.

Root-cause chain (verified 2026-10-07):
1. A consolidation task is claimed → `async_operations.status='processing'`.
2. The Docker Postgres container (`hindsight-db-1`, pgvector:pg16 on :5432) restarts
   mid-flight (log fills with `[Errno 61] Connection refused` in the polling loop) →
   the worker never writes `completed`/`failed` → the row is an orphan `processing`.
3. Consolidation claiming is BANK-SERIALIZED: `ops_postgresql.py claim_tasks()` first
   queries `busy_banks` (banks with any processing consolidation) and excludes them —
   every later consolidation for that bank is skipped forever while the orphan lives.
4. The only stale-claim recovery is `recover_own_tasks()`, which runs ONCE at worker
   startup. A live API process never reclaims its own orphans.

Fix (official-equivalent, single-row scope — do NOT bulk-decommission the live worker
mid-poll): first verify the orphan is the ONLY processing row and the worker shows
`my_active: none`, then reset just that row via the container:
```bash
docker exec hindsight-db-1 psql -U hindsight -d hindsight -c "
UPDATE async_operations SET status='pending', worker_id=NULL, claimed_at=NULL,
updated_at=now() WHERE operation_id='<orphan-uuid>' AND status='processing'
RETURNING operation_id, status;"
```
Verification: within one 30s poll the task is re-claimed (`WORKER_TASK ... age=...s`),
consolidation batches log real progress, and the row reaches `completed`. A swarmed
backlog drains at ~batch-32 cadence (the 2026-10-02 batch-size fix shows up as
`llm_batch #1 (32 memories, 1 llm calls)`).

Known upstream gap (explicit, not silently accepted): no runtime stale-claim reaper —
any DB/container restart that lands mid-consolidation re-creates this stall. If it
recurs, candidates are a Docker post-restart hook running the same single-row-style
reset (`WHERE status='processing' AND claimed_at < now() - interval '1 hour'`) or a
cron watchdog; both are uninstalled pending a second occurrence.
