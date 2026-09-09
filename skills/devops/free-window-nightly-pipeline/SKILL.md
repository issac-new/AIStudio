---
name: free-window-nightly-pipeline
description: "Use when nightly cron/LLM jobs must run in a free window."
metadata:
  hermes:
    tags: [devops, cron, nightly, acp, cost-optimization]
---

# Free-Window Nightly Pipeline

How to run nightly scheduled jobs so their LLM calls land in a provider's
free-usage window (a coding-plan promo making one model free overnight)
without flipping profile configs or paying for mistakes.

## Always-on rules

- **Route at the call layer, not the config layer.** All nightly LLM calls
  go through ONE helper function that decides the channel per call. Do not
  bulk-switch 24 profile configs twice a day; that is fragile under fleet
  sync and multiplex.
- **The window decision is a script, shared as the single source of truth**
  with any SOUL-level routing rules. The helper shells out to it once per
  process and caches the answer.
- **Pin the model at two layers** — process env via provider config, plus a
  per-session config option at session creation, fail-closed (pin failure =
  hard error, never silent downgrade). Provider catalogs default to their
  first model, which is often the PAID tier even when the free model sits in
  the same catalog; unpinned sessions (subagents, fresh sessions, other
  surfaces) silently cost money.
- **Model-hit ≠ zero-billing.** Verify free windows by before/after quota
  snapshots from the provider's usage endpoint plus the client-side per-
  session usage ledger. Attribute sessions by directory/project — other
  surfaces bypass the pinned route.
- **Preflight probe as pipeline step 1**: inside the window, a dead channel
  must surface as a failed step + alert, never a silent paid fallback.
  Outside the window the probe reports 'window closed' (healthy no-op).
- **Fallback discipline**: transport-level failure (channel dead) → disable
  the channel for the process and fall back immediately. Payload-level
  failure (got a reply, JSON unparseable = format jitter) → retry once on
  the SAME channel with a corrective instruction before judging it dead.
  Nightly failure logs from sibling jobs tell you which kind you have.

## Pipeline ordering rules

- Any step that REGENERATES a shared artifact (report md, summary json)
  must run BEFORE steps that APPEND to it. A dispatch/gap-closure step that
  rewrites the report placed after the LLM-analysis step will silently wipe
  the analysis every night while state shows `done`. Audit each step for
  'rewrites vs appends' whenever you reorder.
- Idempotent state checks must key on `status == done`, not on `done_at`
  existing — failed steps also write timestamps.

## Delivery (user-facing output)

- **Delivery strategy is the user's call and changes over time; keep it in
  exactly one layer.** For cron `no_agent` jobs the job's stdout IS the
  delivered message — compose the brief in the script and never duplicate it
  with a separate send call. Full artifacts (PDF) go to the durable channel
  (email); the instant channel (chat) carries only the brief.
- **Make the durable channel's success part of step success.** If the PDF
  channel fails the step must fail so the supervisor retries; brief-channel
  failure is best-effort and must not block.
- **Chat platforms rate-limit aggressively; attachments are the worst
  offenders.** Before switching delivery strategy, check the backlog queue
  for `attempts` maxed out and a history of cooldown errors — that means an
  account-level penalty cooldown, and every retry (including manual test
  sends) RENEWS it. Stop sending, switch channels, let it decay.

## Retiring a delivery path or migrating jobs

- When a backlog queue's items become obsolete (strategy changed), archive
  the queue file (`.bak`), mark items with a terminal status in history, and
  re-deliver anything owed through the new channel — do not just delete.
- When migrating agent-mode cron jobs to `no_agent` scripts: flock the
  jobs.json, write temp + atomic replace, keep a `.bak`, and re-read to
  verify. A write that is not read back did not happen. Pure pass-through
  agent jobs (one command, no reasoning) waste a full model call per fire —
  always script them.
- After any fleet-wide plugin/config sync, re-verify pinned config survived;
  sync has repeatedly reverted patched files to stock versions.

## Verification checklist before declaring the pipeline free

1. Window script returns 'inside' at the current clock time.
2. One real end-to-end call through the throat: log shows the free channel
   on attempt 1, payload parses.
3. Client usage ledger: all test sessions show the free model + expected
   provider id.
4. Quota snapshots: no movement after the batch.
5. Ask-the-model-its-name probe returns the free model (catches routing
   lies the ledger might miss).
6. A smoke run of the full pipeline in TEST mode (no real send) confirms
   step order and artifact integrity.
