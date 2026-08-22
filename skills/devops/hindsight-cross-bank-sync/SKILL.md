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

## Verified case (2026-08, production)

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

## Working pattern (4 rules)

1. **Broad→narrow direction needs a keyword filter.** The swarm bank mixes
   tech + family memories; filter by domain keywords (child name, family
   roles, domain terms) before writing. Narrow→broad ([已移除] is 100%
   child-themed) copies unfiltered.
2. **Dedup by first ~80 chars of `text`** against the destination set —
   makes the script idempotent for cron reruns.
3. **Loop prevention via origin tags.** Tag writes `sync-from-<source>`;
   filter tagged items OUT of the source list before syncing. Without this,
   A→B then B→A ping-pongs forever.
4. **Truncate** content ~2000 chars, context ~100 chars.

## Delivery guarantees

- **Per-retain trigger**: after `hindsight_retain` of a domain memory, run the
  sync script immediately (rules file: "存孩子相关记忆后必须触发双写").
- **Cron fallback**: twice-daily cron (9:00/21:00) catches anything missed —
  manual sync is opportunistic, cron is the guarantee.
- **Canonical fact source stays a shared FILE** (e.g. child-profile.md),
  sync covers analysis memories only. Files shared by path are always
  consistent; banks need the bridge.

Reference implementation:
`~/hermes-docker-sandbox/workspace/life-workbench/scripts/child_memory_sync.py`

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

## Related Skills

- **hindsight-bank-strategy** — choose the isolation model first; sync bridges
  the chosen models.
- **memory-consolidation** — MEMORY.md vs Hindsight boundary.
