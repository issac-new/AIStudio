---
name: hindsight-cross-bank-sync
description: "Sync topic memories between per-team Hindsight banks."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [hindsight, memory, multi-agent, bank-sync, cross-team, dual-bank]
    related_skills: [hindsight-bank-strategy, memory-consolidation]
---

# Hindsight Cross-Bank Memory Sync

Bridge memories between two per-team Hindsight banks (Model C of
`hindsight-bank-strategy`) when a knowledge class legitimately spans teams.
Companion to `hindsight-bank-strategy` (which decides the isolation model —
this skill implements the topic bridge on top of it).

## When to Use

- One human domain is served by two profiles on different banks (e.g. dad
  gateway → swarm bank, mom gateway → [已移除] bank; both need child memories)
- A knowledge class must flow between per-team banks WITHOUT merging banks
  (merging pollutes both sides with irrelevant domains)
- Periodic or event-driven memory synchronization between banks

## Verified case (production)

Orchestrator (swarm bank, 4692 nodes) vs [已移除]-orchestrator ([已移除] bank,
20 nodes). Mom-side teachers could not recall any child-analysis memories
written on the dad side. Fixed with bidirectional topic-filtered sync:
570-item backfill (20→1557 nodes) + 9:00/21:00 cron + per-retain trigger.
Recall verification: [已移除] bank returned 57 hits for a child-memory query
that originated in the swarm bank.

## API mechanics (Hindsight daemon, default http://localhost:8888)

### List (paged)

```
GET /v1/default/banks/<bank_id>/memories/list?limit=200&offset=<N>
```

Returns envelope `{"items": [...], "total": <int>, "limit", "offset"}`.
**Item field is `text`, NOT `content`.** Each item: `text`, `context`,
`date` (ISO), `fact_type`, `id`. Loop until `offset + len(items) >= total`.

### Retain (write)

```
POST /v1/default/banks/<bank_id>/memories
{"items": [{"content": "...", "context": "...", "tags": [...]}], "async": true}
```

- Request body is a **RetainRequest with `items[]`** — a bare memory object
  (`{"content": ...}`) → HTTP 422. **Write field is `content`** (asymmetric
  with list's `text`).
- `async: true` = fast background LLM extraction (default for bulk);
  `async: false` = confirmed per batch (small critical batches).
- Batch size 10, ~0.3-0.5s sleep. 570 items ≈ 10 min. Per-batch timeouts
  happen — retry the batch, then fall back to per-item sync.

### Stats / Recall (verify)

```
GET  /v1/default/banks/<bank_id>/stats          # total_nodes before/after
POST /v1/default/banks/<bank_id>/memories/recall  {"query": "<keywords>"}
```

Recall returns results under `results` (or `items`). Spot-check the bridge
with a query whose answer can only live in the source bank.

## Working pattern (7 rules)

1. **Broad→narrow direction needs a keyword filter.** The swarm bank mixes
   tech + family memories; filter by domain keywords (child name, family
   roles, domain terms) before writing. Narrow→broad ([已移除] is 100%
   child-themed) copies unfiltered.
2. 🔴 **Dedup against the DESTINATION's `documents.content_hash`** — never by
   text prefix, never against memory_unit text. Every synced item becomes a
   document + ≥1 LLM extraction call, and unit text drifts as extraction
   merges/rewrites facts, so any unit-anchored match decays and the next run
   re-imports the same content (a weak prefix match shipped 20%+ duplicate
   documents that each paid an extraction). `content_hash` = sha256 of the
   VERBATIM POSTed content — no whitespace normalization; hash the exact
   string you POST. Endpoint:
   `GET /v1/default/banks/<bank>/documents?limit=200&offset=N` (paged like
   memories/list; items carry `content_hash`).
3. 🔴 **Loop gate excludes ALL `sync-from-*` tags in BOTH directions.**
   Filter `any(str(t).startswith("sync-from-"))` on the source list —
   filtering only your own bank's tag lets copies bounce A→B→A forever, each
   bounce spawning a fresh document + extraction (this grew one bank to 99%
   sync copies).
4. **Guard-gate before writing (two-phase).** Dry-compute the plan
   (`do_post=False`), and if either direction exceeds ~100 items, exit
   non-zero WITHOUT writing — a big plan means first-run backfill or a broken
   dedup gate; require an explicit `--allow-backfill` to proceed. Never gate
   on the post-write returned count: by then the writes happened.
5. **Truncate** content ~2000 chars, context ~100 chars — and compute the
   dedup hash on the truncated string (the anchor must equal what is stored).
6. **Increment anchor = documents.created_at via a state file — never unit
   timestamps.** memory_unit timestamps are all unusable for incremental windows:
   `date` is truncated to midnight (event date, not write time),
   `mentioned_at` is refreshed by every recall, `edited_at` is null on fresh
   units — and unit text drifts as extraction merges facts, so a rolling
   window over units re-admits stale drifts forever. v4 anchors on the last
   successful sync time (state file `~/.hermes/state/child_memory_sync_state.json`,
   first run = now ⇒ no historical backfill, per explicit user decision)
   and syncs whole documents created after it, verbatim via
   `documents/{id}` detail `original_text` — hash idempotent by construction.
7. **Advance the anchor only after BOTH directions succeed**; on partial
   failure keep it (hash dedup makes the retry a no-op for already-synced
   docs). Async retain is invisible to an immediate re-read: the source
   document row lands seconds later — a sync fired right after a POST sees
   nothing; that's expected, the next run catches it.

## Delivery guarantees

- **Per-retain trigger**: after `hindsight_retain` of a domain memory, run the
  sync script immediately (rules file: "存孩子相关记忆后必须触发双写").
- **Cron fallback**: twice-daily cron (9:00/21:00) catches anything missed —
  manual sync is opportunistic, cron is the guarantee.
- **Canonical fact source stays a shared FILE** (e.g. child-profile.md),
  sync covers analysis memories only. Files shared by path are always
  consistent; banks need the bridge.

## Verify a sync-logic change end-to-end

1. POST a tagged probe memory to the source bank (content marked as a test
   item), then run the sync once.
2. The probe must land in the destination carrying the `sync-from-` tag
   (check the documents list/detail, not just the run's printed plan).
3. Run the sync again — that direction's plan must be 0 (anchor advanced;
   hash dedup makes the repeat a no-op). Both steps together prove
   connectivity, extraction handoff, tagging, and idempotence.

Reference implementation (v4: document-level incremental sync with state-file
anchor + content-hash dedup + bidirectional loop gate + two-phase guard):
`~/.hermes/profiles/orchestrator/scripts/child_memory_sync.py`

## Gotchas

- First implementation listed 0 memories: read `content`, API returns `text`,
  and the envelope is `{"items": ...}` not a bare list. Verify with
  `/openapi.json` (RetainRequest/MemoryItem schemas) before writing code.
- Don't sync a broad bank unfiltered into a narrow one (4692 → ~583 relevant
  after keyword filter).
- Plain urllib against localhost:8888 works everywhere the daemon runs; no
  hermes CLI needed.
- Hindsight retain can intermittently return empty/error (cc-switch
  circuit-breaker related): retry once — succeeds on second attempt.
- **Sync volume IS LLM cost**: one document write triggers ≥1 extraction
  call; a bulk import of hundreds of docs = thousands of calls and can
  exhaust a cc-switch subscription quota by mid-morning. Keep daily deltas
  small and cap what a single run may write.
- Verify dedup health by counting duplicate hash groups (API documents
  endpoint, or Postgres `SELECT count(*)-count(DISTINCT content_hash) FROM
  documents WHERE bank_id='...'`) — should always be 0.

## Related Skills

- **hindsight-bank-strategy** — choose the isolation model first; sync bridges
  the chosen models.
- **memory-consolidation** — MEMORY.md vs Hindsight boundary.
