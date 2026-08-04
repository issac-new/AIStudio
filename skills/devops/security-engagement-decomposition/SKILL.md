---
name: security-engagement-decomposition
description: >-
  Decompose a hack-team engagement against a real, named target into
  compliance-respecting Kanban tasks. Use when the user says "use hack team
  on this intelligence/target" and the intelligence already contains live
  credentials, live infrastructure details, or otherwise identifies a real
  company. Covers three patterns that must fire together: (1) clarify scope
  BEFORE dispatch — offer compliant options (passive OSINT, public-data code
  audit, responsible-disclosure synthesis) first and the
  authorization-gated option (active pentest) last; (2) embed compliance
  constraints verbatim in each worker's task body so they cannot be
  forgotten mid-run; (3) gate active testing AND outbound disclosure behind
  HumanGate HIGH. Also covers the Diamond orchestration variant (parallel
  workers → independent Checker, different profile) for verification-heavy
  work where worker outputs are self-reports.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, hack-team, security, orchestration, compliance, humangate]
    related_skills:
      - kanban-orchestrator
      - orchestrator-board-routing
      - prompt-ownership-boundary
      - scope-discipline
      - pua-harness-governance
---

# Security Engagement Decomposition

How to decompose a hack-team engagement against a **real, named target** into
Kanban tasks that respect compliance boundaries. The failure mode this skill
prevents: the user says "use hack team on this intel" and the orchestrator
dispatches `hack-exploit` against a real company's live infrastructure
without confirming authorization — an irreversible external action with real
legal exposure.

## When to use

- User says "用 hack team / use hack team" + references a real company or
  real intelligence report
- Intelligence report already contains live credentials, live subdomain/IP
  inventory, or identifies a real company by name
- User selects "all of the above" / "所有范围" when asked about scope
- Dispatching any `hack-*` profile against a target that is not an
  authorized lab/CTF/sandbox

## The three patterns (must fire together)

### Pattern 1 — Clarify scope BEFORE dispatch

When the intelligence concerns a real company and already contains live
credentials or live infrastructure, do NOT immediately `kanban_create` for
every hack subtask. First use `clarify` to confirm the work's nature and
authorization state.

Offer the options in this order — **compliant first, authorization-gated
last**:

| # | Option | Compliance | Gate |
|---|--------|-----------|------|
| 1 | Passive OSINT expansion (zero target traffic) | ✅ compliant | none |
| 2 | Public-data code audit (audit only what's already public) | ✅ compliant | none |
| 3 | Responsible-disclosure report synthesis | ✅ compliant | none |
| 4 | Active penetration testing | ⛔ requires written authorization | HumanGate HIGH |

Rationale: the user may not realize that "all of the above" includes active
testing against a real company. Listing the authorization-gated option last
and labeling it ⛔ makes the boundary explicit. If the user picks "all," you
still dispatch options 1–3 immediately but create option 4 as a **blocked**
task pending authorization materials.

This is the security-engagement analogue of `scope-discipline`'s
research-then-propose rule: confirm the scope boundary before acting, do
not push forward on an ambiguous "all."

### Pattern 2 — Embed compliance constraints verbatim in each worker's task body

Write the constraints as explicit, quotable rules inside the `body` of each
card so the worker cannot "forget" them mid-run. Do not paraphrase; do not
rely on the worker's SOUL.md to enforce them. The body is the contract.

Constraints to embed (pick the ones relevant to each task):

- **Zero target traffic**: "Do not send HTTP/TCP/port scan/dir
  busting/vuln probe to any target IP. Standard DNS resolution is OK;
  active probing is not."
- **Public sources only**: "CT logs, passive DNS DBs, public APIs, search
  engines, archives. No credential use, no target login."
- **No credential use**: "Even though credentials are known (e.g.
  MySQL root/122112), do not attempt to log in to any system."
- **No target contact**: "Do not contact the repo owner, do not file
  issues/PRs, do not modify public repos."
- **No auto-send**: "The disclosure report is generated but NOT sent to
  the target. Sending triggers a fresh HumanGate HIGH."

Why the body and not the SOUL.md: the SOUL.md is a shared, slow-changing
profile document. The task body is per-engagement, carries the specific
scope boundaries for THIS target, and is read by the worker as part of its
task context. Embedding constraints here means they are in the worker's
working memory, not in a distant reference it may not load.

This is the security-engagement application of the
`prompt-ownership-boundary` distinction: **authorization framing** (making
the model not refuse) is the model service's job and should NOT be added
locally; **authorization boundaries** (when to stop, what's in/out of
scope) ARE the local deployment's job and MUST be embedded in the task
body. Pattern 2 is the latter.

### Pattern 3 — Gate active testing AND outbound disclosure behind HumanGate HIGH

Two irreversible external actions in a security engagement:

| Action | Why irreversible | Gate |
|--------|-----------------|------|
| Active pentest against real infra | Probes a real company's live systems; legal exposure; may trigger IDS/IR | `initial_status="blocked"` + list required authorization materials in body |
| Sending disclosure report to target | Irreversible external communication; once sent, cannot un-send | `kanban_block(kind="needs_input", reason="[HumanGate:HIGH] ...")`; draft saved in `kanban_comment` first |

**Active pentest card**: create with `initial_status="blocked"` so it sits
on the board waiting. The body must list the exact authorization materials
required (signed authorization from the target's legal rep, scope IP/domain
list, method constraints, legal disclaimer). The user unblocks by providing
materials and calling `kanban_unblock`. No worker may run active tests
before that.

**Outbound disclosure**: the disclosure-synthesis task generates the report
but does NOT send it. If the user later asks to send, that triggers a fresh
`kanban_block(kind="needs_input")` with the report draft saved in a
`kanban_comment` first. Do not auto-send.

This is the security-engagement application of the `pua-harness-governance`
action-authority separation: the worker has action authority to generate
the report, but the submit-authority (sending to target) stays with the
human.

## The Diamond pattern — independent Checker for verification-heavy work

When worker outputs are **self-reports** (recon findings, audit findings —
claims of "found / leaked / exposed" that cannot be trusted at face value),
use the Diamond orchestration variant instead of plain fan-in.

```
    N parallel worker cards (no parents)
           ↓
    1 Checker card, parents=[all worker ids],
    assignee = a DIFFERENT profile than the workers
```

The Checker does NOT merge worker outputs as a paste-up. It **independently
verifies** each finding and keeps only the "survivors."

The Checker asks different questions than the Workers did:

1. **Is the information correct?** — sample-verify the evidence chain, not
   the claim.
2. **Is it current enough?** — check timestamps (DNS resolution, CT cert,
   repo commit, page fetch).
3. **Does the cited source actually exist?** — fetch the URL / stat the
   file / re-read the record.
4. **Does it answer the user's original question?** — re-align to the
   kickoff prompt, not the worker's reframing.

Merge = the findings that survive all four questions. Discard the rest
(record them in an appendix with the failure reason).

**Why the Checker must be a different profile**: a Checker that shares a
profile (and therefore SOUL/skills/memory) with the Workers is anchored by
the same assumptions. Assign the Checker to a **different profile** when
possible so it isn't primed to agree. (This session used `hack-auditor`
for both the audit worker and the Checker; when a second auditor-type
profile is available, prefer it for the Checker to avoid self-anchoring.)

The Diamond matters most when:
- Worker outputs are self-reports that cannot be verified by reading them
- A wrong "finding" has downstream cost (disclosure to a real company,
  deploy, public report)
- The user will act on the merged output
- Multiple independent methods should cross-check

This is the Machina Graph Engineering Diamond: Workers produce, Checker
independently validates, the merged output is verified findings — not a
paste-up of whatever the Workers claimed. `kanban-orchestrator` (default
profile) covers fan-out + fan-in; the Diamond is the stronger variant for
verification-heavy work and is captured here because the default-profile
skill cannot be patched from the orchestrator profile.

## Decomposition shape (typical)

```
intel report (known creds + infra)
        ↓
   ┌────┴────┐
   ↓         ↓
 hack-recon  hack-auditor     ← parallel, compliant (passive/public-data)
   ↓         ↓
   └────┬────┘
        ↓
   hack-auditor (Checker)      ← parents=[recon, auditor], DIFFERENT profile
   responsible-disclosure      ← generates report, does NOT send
        ↓
   hack-exploit (blocked)      ← initial_status="blocked", HumanGate HIGH
```

All on the `hack` board, with a shared `tenant=<engagement-name>` so the
tasks cluster on the board.

## Anti-patterns

- **Dispatching hack-exploit against a real target on "all of the above"**
  without the authorization gate. Active pentest is irreversible; the
  authorization gate is non-negotiable.
- **Embedding compliance constraints in SOUL.md instead of the task body.**
  The body is the per-engagement contract; the SOUL is too distant and
  shared across engagements.
- **Plain fan-in for verification-heavy work.** When workers self-report
  findings, a synthesizer that paste-merges propagates any fabrication.
  Use the Diamond with an independent Checker.
- **Auto-sending the disclosure report.** Sending is an irreversible
  external communication; it must pass HumanGate HIGH even if the user
  asked for the report to be "sent" — confirm recipient and method first.
- **Adding authorization framing to the prompt.** That is the model
  service's job (see `prompt-ownership-boundary`). The local deployment
  owns boundaries, not framing.

## Related skills

- **kanban-orchestrator** (default profile, symlinked) — the decomposition
  playbook this skill extends with the Diamond variant and compliance
  gating. Cannot be patched from the orchestrator profile; this native
  skill captures the extension.
- **orchestrator-board-routing** — covers routing a message to the `hack`
  board; this skill covers what to do AFTER routing (decompose with
  compliance constraints).
- **prompt-ownership-boundary** — the framing-vs-boundary distinction
  Pattern 2 applies.
- **scope-discipline** — the clarify-before-dispatch pattern is the
  security-engagement analogue of research-then-propose.
- **pua-harness-governance** — action-authority separation; Pattern 3
  keeps submit-authority with the human.
