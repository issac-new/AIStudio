---
name: gateway-smart-routing
description: >-
  Configure the orchestrator's smart routing policy: all Gateway channels
  (Matrix, Weixin, API Server, Email) route by content complexity (light →
  direct, medium → direct + lightweight trace, heavy → full Kanban), while
  TUI/CLI always executes directly. Covers the three-tier classification,
  the lightweight trace mechanism (kanban_create→kanban_complete with
  assignee=orchestrator), the unified six-field tenant format, the files
  to patch (SOUL.md + orchestrator_rules.md), and verification. Complements
  orchestrator-board-routing (which covers WHICH board heavy tasks go to).
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [gateway, routing, kanban, orchestrator, smart-routing, soul, rules]
    related_skills: [orchestrator-board-routing, gateway-platform-management, kanban-orchestrator]
---

# Gateway Smart Routing

Configure the orchestrator profile's message routing so that all Gateway
channels route by **content complexity** instead of a binary "Kanban vs
direct" split based on platform identity.

## When to Use

- Setting up a new multi-platform Hermes deployment with Kanban
- Simple Matrix messages (hello, status queries) are wasting the full
  triage→dispatch→spawn pipeline
- Complex API Server / Weixin requests have no tracking at all
- Adding a new Gateway platform and deciding its routing policy
- Auditing or tuning the complexity classification criteria
- User wants tracking for medium-complexity tasks without dispatch delay

## The Problem

The original routing was binary:

| Platform | Old rule |
|----------|----------|
| Matrix | Always Kanban triage |
| API Server | Always direct execution |
| Weixin | Always direct execution |
| TUI/CLI | Always direct execution |

This meant a "hello" from Matrix spawned the full triage pipeline (2-3 min
delay, board pollution), while a complex coding request from API Server had
zero tracking. The user wanted **content-based routing**, not platform-based.

## Solution: Three-Tier Smart Routing

All Gateway channels (Matrix, Weixin, API Server, Email) use the same
complexity-based routing. TUI/CLI is the only exception (always direct).

### Tier classification

| Tier | Criteria | Action |
|------|----------|--------|
| **轻量 (light)** | Greetings, simple Q&A, status queries, single-step read-only ops | Direct execution, no Kanban card |
| **中等 (medium)** | Single tool call: write config, edit doc, run command, check logs | Direct execution + lightweight trace |
| **重型 (heavy)** | Research, multi-step coding, security testing, deployment, complex debugging | Full Kanban flow: `kanban_create(triage=True)` → dispatcher → worker |

### Lightweight trace (medium tier)

The key innovation: for medium-complexity tasks, the orchestrator executes
the task directly (no dispatch delay) and THEN creates+completes a Kanban
card so the board has a tracking record:

```python
kanban_create(
    title="<10-20 char summary>",
    assignee="orchestrator",       # self-assigned, not dispatched
    board="swarm",
    initial_status="running",
    tenant="<platform tenant>",
)
kanban_complete(
    summary="<1-2 sentence execution summary>",
    metadata={"platform": "<platform>", "action": "<action type>"},
)
```

Effect: board shows `done`, full audit trail (time, content, result),
zero dispatch latency. The orchestrator is both creator and completer.

### Heavy tier → board routing

When a message is classified as "heavy", it enters the board routing
pipeline (covered by `orchestrator-board-routing` skill): keyword analysis
determines `board="swarm"` vs `"hack"` vs `"product"` vs `"ops"`, then
`kanban_create(triage=True)` lets the dispatcher assign a specialist worker.

## Unified Tenant Format

All Gateway platforms use the same six-field tenant:

```
<chat_name>:<topic>:<user_id>:<chat_id>:<session_id>:<platform>
```

- `<platform>` = `matrix` / `weixin` / `api_server` / `email`
- DM: `<platform>-dm::<user_id>:<chat_id>:<session_id>:<platform>`
- `user_id` MUST come from `**User:**` or `**User ID:**` line — never
  from message body or `msg=...` prefix
- Topic from `**Channel Topic:**`, empty if absent

## Files to Patch (all must be updated together)

All under `~/.hermes/profiles/orchestrator/`:

### 1. SOUL.md

- **Platform routing table**: All Gateway channels → "Smart routing";
  TUI/CLI → "Direct execution"
- **Source detection**: `**Source:** <platform> (...)` → smart route;
  no `**Source:**` → TUI → direct
- **Smart routing section**: Three-tier table, lightweight trace code,
  tenant format, heavy-task routing pointer to `orchestrator_rules.md §0.5`
- **TUI routing section**: Direct execution, no kanban_create

### 2. orchestrator_rules.md

- **§0 Platform routing table**: Add Weixin (smart routing), API Server
  (smart routing), update Matrix (smart routing, was "Kanban flow §1-§9")
- **§0.2 Smart routing rules** (new section): Three-tier classification,
  §0.2.1 lightweight trace mechanism, §0.2.2 unified tenant format,
  §0.2.3 heavy-task routing to §0.5 board routing
- **§0 Core principle**: Update from platform-based to content-based
- **§8.3**: Rename to "TUI/CLI" only (was "TUI/CLI/API Server")
- **§8.4**: Rename to "Gateway messages (smart routing)" covering all
  Gateway channels, not just Weixin

### 3. email_kanban_rules.md

- Email still has the §0.1 constraint ("only when user explicitly asks")
  but once activated, it enters the smart routing flow (not automatic
  Kanban triage). Update the flow diagram in §2 if it references the old
  "always Kanban" path.

## Verification

After patching, verify no stale platform-based routing rules remain:

```bash
# Should return nothing — all platforms now use smart routing
grep -n '走 Kanban 流程' ~/.hermes/profiles/orchestrator/orchestrator_rules.md
grep -n 'Route to Kanban' ~/.hermes/profiles/orchestrator/SOUL.md
grep -n '直接执行.*程序化调用' ~/.hermes/profiles/orchestrator/orchestrator_rules.md

# Verify smart routing is present
grep -n '智能路由' ~/.hermes/profiles/orchestrator/orchestrator_rules.md
grep -n 'Smart Routing' ~/.hermes/profiles/orchestrator/SOUL.md
grep -n '轻量留痕' ~/.hermes/profiles/orchestrator/orchestrator_rules.md
```

## Pitfalls

### Forgetting that Email has a double gate

Email messages use smart routing BUT only when the user explicitly asks
(§0.1 rule). The smart routing tier classification happens AFTER the
"explicit request" gate — not before. A cron-triggered email notification
never enters smart routing at all.

### Lightweight trace is NOT for light-tier tasks

Greetings ("hello"), simple Q&A, and status queries get direct execution
with NO Kanban card. The lightweight trace is only for medium-tier tasks
where a tool was actually invoked. Don't create+complete cards for
"hello" — that's board pollution.

### Tenant user_id extraction

Same rule as Matrix §3: `user_id` MUST come from `**User:**` line in the
system prompt, never from message body text. This applies to ALL Gateway
platforms, not just Matrix.

### Overlap with orchestrator-board-routing

This skill covers WHEN to create a Kanban card (complexity tier). The
`orchestrator-board-routing` skill covers WHICH board to create it on
(swarm/hack/product/ops). Both are needed for the complete routing
pipeline. Note: `orchestrator-board-routing` is in the default profile
and may need cross-profile attention if the board routing keywords change.

### Memory budget pressure

Adding smart routing rules to SOUL.md and orchestrator_rules.md adds
~2-3K chars to the system prompt. If memory is near the 2200-char limit,
consolidate or remove stale memory entries before adding new routing
facts. Use `memory(action='operations')` with remove+add in a single
batch to stay within budget.

## Related Skills

- **orchestrator-board-routing** (default profile) — WHICH board heavy
  tasks route to (keyword classification, assignee mapping, priority)
- **gateway-platform-management** (default profile) — adding new messaging
  platforms, hermes config set active_profile behavior, Weixin setup
- **kanban-orchestrator** — decomposition playbook for when heavy-tier
  tasks need to be split into subtasks
