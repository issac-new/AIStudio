---
name: orchestrator-board-routing
description: >-
  Configure the orchestrator profile's SOUL.md and rules.md to route
  incoming Matrix/Email messages to the correct Kanban board in a
  multi-board deployment. Covers the keyword classification table,
  keyword-to-assignee mapping, routing priority, and the three files
  that must be updated together. Use when adding a new board to a
  multi-board deployment, when security messages never reach the hack
  board, or when all messages go to swarm regardless of content.
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [kanban, multi-board, orchestrator, routing, soul, rules]
    related_skills: [kanban-board-profile-scoping, hermes-gateway-operations, multi-board-team-deployment]
---

# Orchestrator Board Routing

Configure the orchestrator's message routing so incoming Matrix/Email
messages go to the correct Kanban board (`swarm` vs `hack`) based on
content analysis.

## When to Use

- Adding a new board to a multi-board deployment (e.g. hack board)
- Security messages never reach the hack board — all go to swarm
- SOUL.md or rules.md hardcode `board="swarm"` in every kanban_create
- Auditing routing after adding new hack-* agent profiles

## Problem

The dispatcher (`kanban_watchers.py`) enumerates ALL non-archived boards
automatically and dispatches tasks per board. But the **orchestrator**
must decide which board to create a task on. By default, SOUL.md and
orchestrator_rules.md hardcode `board="swarm"` in every `kanban_create`
call. No security message will ever reach the hack board regardless of
how well `profile_scope` is configured in `board.json`.

**Two separate layers are needed:**

1. **Orchestrator routing** (SOUL.md + rules.md) — decides `board="swarm"`
   vs `board="hack"` based on message content
2. **Decomposer scoping** (board.json `profile_scope` + `_build_roster()`
   patch) — restricts assignee roster per board

Layer 2 (covered by `kanban-board-profile-scoping` skill) prevents the
decomposer from assigning a hack-board task to `worker-coder`. But
without layer 1, no task ever reaches the hack board in the first place.

## Solution: Add §0.5 to orchestrator_rules.md

### 1. Keyword classification table

Define 7 categories of security/hacking keywords. Any message matching
a keyword in any category routes to `board="hack"`. All other messages
default to `board="swarm"`.

| Category | Sample keywords (CN/EN) |
|----------|------------------------|
| Recon/OSINT | 侦察, recon, 扫描, scan, 端口扫描, OSINT, 指纹识别, fingerprint |
| Exploit/Pentest | 渗透, pentest, exploit, 攻击, attack, 入侵, intrusion, 提权 |
| Forensics/IR | 取证, forensics, 应急响应, incident response, 内存分析 |
| Audit/Compliance | 审计, audit, 合规, compliance, 漏洞扫描, 基线检查 |
| C2/Command Control | C2, command and control, beacon, 植入, implant, 持久化, 隧道 |
| Weapons/Payloads | 载荷, payload, 钓鱼, phishing, 字典, wordlist, 密码爆破, DDoS |
| General security | security, 安全, hacker, 黑客, 漏洞, CVE, 0day, APT, malware |

See `references/board-routing-keywords.md` for the full keyword table
with assignee mappings and routing examples.

### 2. Keyword → assignee mapping

Each category maps to a specific hack agent profile:

| Category | Assignee |
|----------|----------|
| Recon/OSINT | hack-recon |
| Exploit/Pentest | hack-exploit |
| Forensics/IR | hack-forensics |
| Audit/Compliance | hack-auditor |
| C2/Command Control | hack-c2 |
| Weapons/Payloads | hack-weapons |
| General security only | "" (triage=True) |
| Mixed/ambiguous | "" (triage=True) |

### 3. Routing priority

1. `[hack]` or `[security]` prefix → force hack board
2. `@hack-recon` / `@hack-exploit` etc. mention → hack board + that assignee
3. Keyword match from table → hack board + mapped assignee
4. No match → swarm board (default)

## Files to Patch (all 3 must be updated together)

All under `~/.hermes/profiles/orchestrator/`:

### SOUL.md

This is the system prompt the orchestrator agent sees. Changes:
- Step 1: "Determine the target board via §0.5" (before kanban_create)
- Step 2: `kanban_create(board=<determined_board>, triage=True)`
- Reply template: `"已创建任务到 {board}: ..."` not hardcoded `swarm`

### orchestrator_rules.md

The detailed rules file. Changes:
- **New §0.5**: Full routing section (keyword table, assignee map, priority,
  3 code examples — hack+assignee, hack+triage, swarm default)
- **§2 flow diagram**: Add `[Board 路由判定]` step before kanban_create
- **§4.1 assignment table**: Add "安全类消息 → hack" row
- **§4.2 worker list**: Add hack-* profiles (6 agents with descriptions)
- **§5.1 code example**: `board="swarm"` → `board=board`
- **§9.1 code example**: Add hack board example, annotate swarm examples

### email_kanban_rules.md

Email-specific routing. Changes:
- **§2 flow diagram**: `board=swarm` → `board=<§0.5 判定>`
- **§4.1 code example**: `board="swarm"` → `board=board`
- **§4.2 assignment table**: Add "安全相关邮件 → hack" row

## Verification

After patching, grep for any remaining hardcoded board assignments:

```bash
grep -n 'board="swarm"' ~/.hermes/profiles/orchestrator/SOUL.md \
  ~/.hermes/profiles/orchestrator/orchestrator_rules.md \
  ~/.hermes/profiles/orchestrator/email_kanban_rules.md
```

The only acceptable results are in **example code blocks** where the
comment explicitly says `# 非安全类 → swarm`. All template/flow-diagram
references should use `board=board` or `board=<判定结果>`.

## Pitfalls

### Forgetting email_kanban_rules.md

Email messages also go through the orchestrator. If email_kanban_rules.md
still hardcodes `board="swarm"`, security-related emails will never reach
the hack board. Always update all three files together.

### General keywords without specific category

Messages that only match general security terms (安全, security, hacker)
but no specific category should get `assignee=""` and `triage=True` — do
NOT auto-assign based on general terms alone, since the specific hack
agent is unclear.

### Profile scoping ≠ board routing

`board.json` `profile_scope` restricts the decomposer's roster (layer 2).
It does NOT affect which board the orchestrator routes to (layer 1). Both
layers must be configured. See `kanban-board-profile-scoping` skill for
layer 2 setup.

## Related Skills

- **kanban-board-profile-scoping** (default profile) — decomposer-side
  profile_scope restriction via board.json + _build_roster() patch
- **hermes-gateway-operations** (default profile) — multi-board Kanban
  architecture, dispatcher enumeration, board management commands
- **multi-board-team-deployment** (default profile) — full workflow for
  deploying a specialized agent team on a dedicated board
