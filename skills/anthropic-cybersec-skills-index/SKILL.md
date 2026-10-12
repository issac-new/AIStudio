---
name: anthropic-cybersec-skills-index
description: >-
  Shared index over the 571 *new* (not-yet-grounded) cybersecurity skills from the
  mukul975/Anthropic-Cybersecurity-Skills fusion set. Use this to discover what
  attack/defense capability exists before asking a hack-team profile to load a
  specific skill. Retrieve by subdomain, MITRE ATT&CK technique ID, or tool name.
domain: cybersecurity
version: '1.0'
author: hack-auditor (fused from mukul975/Anthropic-Cybersecurity-Skills)
license: Apache-2.0
---

# Anthropic Cybersecurity Skills Index (571 new skills)

> Shared lazy-load index for `hack-recon`, `hack-exploit`, `hack-forensics`,
> `hack-auditor`. These 571 skills are the **net-new** portion of the mukul975
> fusion (818 upstream − 247 already overlapping Hermes's existing
> cybersecurity skills). They are indexed here but **not** auto-loaded into any
> profile's SOUL — load the one you need on demand.

## What this is
- `references/by-subdomain.md` — all 571 skills grouped by subdomain (43 groups).
- `references/by-attck-id.md` — 183 MITRE ATT&CK technique IDs → skills.
- `references/by-tool.md` — 60 tool names → skills that use them.
- `scripts/search-index.py` — CLI to query the index from the terminal.

## How to use
1. Pick the retrieval axis you have: a subdomain ("I need cloud recon"), an
   ATT&CK ID ("map T1555.004"), or a tool ("what uses bloodhound").
2. Open the matching `references/` file (or run `python scripts/search-index.py`).
3. Ask the relevant hack profile to load the specific skill named there.

## Boundaries
- Source is a **community** project (mukul975/mahipal), **not** Anthropic official.
- Only use these skills under authorized engagement scopes / signed RoE.
- Verified-delivery: every `<skill>` below is a real directory produced by the
  fusion analysis step (`mukul-new-with-meta.tsv`, 571 rows).
