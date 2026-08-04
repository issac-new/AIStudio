---
name: inter-agent-communication-architecture
description: "Use when picking kanban/Matrix/A2A for agent-to-agent work."
version: 1.0.0
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [a2a, kanban, matrix, gateway, orchestration, multi-agent, architecture]
    related_skills: [multi-agent-orchestration-design, kanban-orchestrator, gateway-platform-management]
---

# Inter-Agent Communication Architecture

Decision framework for WHICH mechanism carries agent-to-agent work in a Hermes
deployment. Load when evaluating whether to adopt a new agent protocol (A2A,
future ones), when asked to migrate scheduling off kanban, or when designing
cross-host/cross-zone agent coordination. Prevents the recurring mistake of
treating every new protocol as a candidate replacement for kanban scheduling.

## Layer separation

| Layer | Component | Role |
|---|---|---|
| Scheduling | Kanban | Task state machine, retries, `parents=` dependency chains, heartbeat/stale-reclaim, review gates, markings propagation, artifacts |
| Transport | Matrix + gateway | Store-and-forward via Synapse homeserver; both sides dial OUT, so it works across asymmetric NAT/firewall (三区 反向不通) |
| Invocation (sync) | A2A, delegate_task, ACP | Direct RPC-style calls with capability discovery |

A new protocol almost always lands in the **invocation** layer. Kanban owns
scheduling; Matrix owns transport. Nothing in v0.20.0 A2A competes with either.

## Decision matrix

| Scenario | Mechanism |
|---|---|
| Same machine, Hermes↔Hermes | delegate_task (in-process) or kanban (durable queue) — NEVER A2A (official docs say so) |
| Cross-host, all-Hermes, bidirectional network | kanban over Matrix stays; A2A may LAYER ON TOP for synchronous expert calls + Agent Card capability discovery |
| Cross-host, one-way network (反向不通) | Matrix ONLY. A2A physically impossible in the blocked direction (needs TCP connect to peer :9900) |
| Peer is NOT Hermes (LangChain, CrewAI, ADK, vendor) | A2A is the only standard channel — Matrix/gateway routing is Hermes-private |
| Coding delegation to a coding CLI | ACP (acp_send), not A2A |

## A2A enable rule (two conditions, OR)

Enable A2A only when: (1) the peer is not Hermes, OR (2) Matrix is unreachable
but direct HTTP to the peer's :9900 works. For an all-Hermes cluster with a
working Matrix homeserver, A2A adds nothing; replacing kanban with A2A is a
downgrade (300s-timeout sync RPC replacing a durable queue with retries,
dependency chains, review gates, and markings).

## A2A implementation facts (v0.20.0, verified in source)

- `plugins/platforms/a2a/` — stdlib-only, no a2a-sdk dependency.
- Inbound tasks inject into the LIVE gateway session (shared context/memory).
- `A2A_REPLY_TIMEOUT` default 300s; no task-level requeue; anti-ping-pong cap
  `A2A_MAX_PINGPONG_TURNS=5`.
- Localhost bind unless token + `A2A_HOST` set; per-peer tokens via
  `A2A_PEER_TOKENS`; inbound prompt-injection filtering; outbound credential
  redaction; audit log `~/.hermes/a2a_audit.jsonl`.
- Outbound tools (a2a toolset, off by default): `a2a_discover`, `a2a_call`,
  `a2a_list`, `a2a_history`, `a2a_orchestrate`.

## Security boundary note (三区 / 数据出域)

A2A message bodies crossing a zone boundary are data egress. Any 内→外 A2A
usage requires a markings-filter gateway FIRST (separate security design
task) — never enable A2A across zones as a side effect of enabling it locally.

## Reference

Full evaluation (protocol positioning, Hermes implementation profile, network
topology analysis, migration answer template, verification commands):
`references/a2a-vs-kanban-matrix.md`
