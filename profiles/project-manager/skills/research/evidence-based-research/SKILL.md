---
name: evidence-based-research
description: "Anti-hallucination research method: every factual claim carries a URL you actually fetched this task (Stanford: SOTA models hallucinate 69-88% of citations), triangulate ≥2 independent sources, steel-man the opposing view, and timestamp every key fact. Use for any technical investigation, tool/vendor evaluation, or literature gathering that feeds a decision."
version: 1.0.0
author: Hermes Agent (Stanford citation-hallucination + research-ops distilled)
platforms: [linux, macos]
metadata:
  hermes:
    tags: [research, citations, hallucination, triangulation, worker-researcher]
    related_skills: [kanban-handoff-contract]
---

# Evidence-based research

## Citations as evidence (引用即证据) — the hallucination firewall

- Every factual assertion in the report carries a URL that **you actually
  fetched content from during THIS task**. A fetch failure (403/anti-bot/404)
  must be marked "未能验证" and the claim downgraded or quoted second-hand.
- **Never cite a URL you didn't open. Never construct a URL from training
  memory.** Stanford: SOTA models hallucinate 69-88% of citations on
  domain queries — an unverified link is more likely wrong than right.
- Quote the key sentence from the source; pages change, and a bare link can
  dangle later.

## Triangulation

Key conclusions need ≥2 independent sources. A single-vendor claim is marked
"单源" and interest-flagged ("该数据来自 X 自家产品客户"). Searching only for
evidence that supports your preset conclusion is confirmation bias.

## Steel-man the opposition

Actively look for disconfirming evidence — critiques, outage/postmortem
threads, "why we moved off X". A finding with only positive evidence usually
means you didn't search hard enough, not that it's true.

## Timestamp everything

Every key fact gets a source date; stale ones marked "截至 YYYY-MM". Tech
information has a shelf life — an undated "fact" is a liability.

## Coverage requirements

A technology-selection survey MUST cover **cost / license / compatibility** —
missing any one makes the recommendation a half-product. Read primary sources
(official docs/specs/papers) via full-text extraction, not SEO summaries or
AI-generated overviews. Check the local repo first
(`read_file`/`search_files`) for prior decisions before re-researching.

## No-spin rule

Same URL / same search with minor variations failing 3 times → no 4th
near-identical attempt: switch source/angle, or hand off a partial result
("verified part + unverified list"). A real incident burned ~30 near-identical
curls (UA-only differences) on one search engine for nothing.
