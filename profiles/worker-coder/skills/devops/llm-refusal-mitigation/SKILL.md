---
name: llm-refusal-mitigation
title: LLM Refusal Mitigation for Sensitive-Domain Agents
description: >-
  Reduce false refusals from safety-tuned models (GLM-5.2 confirmed, applies to
  any guardrailed LLM) on legitimate sensitive-domain work (authorized security
  research, pentesting, red team). Root cause: models classify safety in the
  FIRST tokens of the system prompt, so authorization context must precede
  sensitive keywords. Provides the three-layer authorization-context-first
  structure (SOUL preamble → rules recovery protocol → task-source framing)
  with copy-paste templates.
triggers:
  - "模型安全拒绝"
  - "model refuses"
  - "safety refusal"
  - "false refusal"
  - "误拒绝"
  - "GLM 拒绝"
  - "refusal mitigation"
  - "安全任务被拒绝"
---

# LLM Refusal Mitigation for Sensitive-Domain Agents

## When to Use

- Agents using safety-tuned models (GLM-5.2, Claude, GPT) refuse legitimate
  authorized tasks in sensitive domains (security research, pentest labs,
  red team, CTF, forensics)
- A profile's SOUL.md lists offensive tooling (nmap/sqlmap/C2/payload) and
  the model refuses before reading any scope/authorization policy
- Kanban workers refuse hack-board tasks whose task body is a bare command

## Root Cause

Guardrailed models classify a session as safe/unsafe within the **first
tokens** of the system prompt. If the prompt leads with role title +
offensive tool names and buries the authorization/scope context in a later
section, the model classifies on the tools and refuses — it never "reaches"
the authorization paragraph. Reframe order, not content: authorization first,
capabilities second. This is prompt-structure engineering for legitimate
authorized work, NOT jailbreaking — the goal is accurate classification, and
the red lines stay intact and visible.

## The Three-Layer Authorization-Context-First Structure

All three layers are required; each covers a different text surface the
model reads. Templates (copy-paste-ready, Chinese, matching production
style): `references/refusal-mitigation-templates.md`.

### Layer 1 — SOUL.md authorization preamble (system prompt)

Insert the authorization declaration block **immediately after the `# Title`
line**, BEFORE the role description and any tool names. Content: authorized
targets (self-built labs DVWA/Metasploitable/HTB/THM, signed-RoE projects,
defensive research, CTF), statement that findings become reports driving
fixes, and an explicit "red lines still apply" closer. Template: §1 of the
reference file.

### Layer 2 — rules.md refusal recovery protocol (environment_hint)

Append a "Refusal Mitigation" section to each `<profile>_rules.md` (injected
via `agent.environment_hint`, so it reinforces authorization in the system
prompt a second time). Teaches the worker what to do when refused anyway:
cite the preamble, rephrase with lab IP + defensive verb (never bare exploit
commands), state the defensive goal, degrade to "needs human execution" in
`kanban_complete` metadata instead of fabricating, and NEVER disguise the
task as non-security to sneak past the filter. Template: §2 of the reference.

### Layer 3 — task-source framing (orchestrator task body)

The kanban task body IS the user request the worker model sees. Require an
authorization frame as the **first line** of every hack-board task body
(written into `orchestrator_rules.md` §0.5.3a on this deployment). A
bare-command task body is the #1 refusal trigger. Template + conforming
`kanban_create` example: §3 of the reference.

## Insertion Procedure

1. Backup `SOUL.md` + `<profile>_rules.md` (timestamped `.bak`) before edits
2. Insert Layer 1 after the title line (skip following blank lines); make
   idempotent by grepping for the header phrase (`授权安全研究声明`) first
3. Append Layer 2 to each rules.md (idempotency phrase: `Refusal Mitigation`)
4. Add Layer 3 to orchestrator rules and update its routing examples
5. Verify: 1× match per file for each idempotency phrase
6. **No gateway restart needed** — workers re-read SOUL/rules on next spawn

Full checklist: §4 of the reference file.

## Escalation

If a profile still refuses constantly after all three layers (payload/
phishing profiles like hack-weapons are the most sensitive), switch THAT
profile's model (`hermes config set model.default <alt> --profile <name>`)
rather than weakening the framing. Weakening authorization language to
reduce refusals trades safety posture for convenience — don't.

## Pitfalls

### 1. Single-layer fixes fail
Preamble alone leaves the task-body vector open; task framing alone leaves
mid-session refusals when tool outputs look scary. Deploy all three.

### 2. Don't bury the preamble mid-file
Insertion position is the entire mechanism. Preamble after the tool catalog
≈ no preamble. It must be the first substantive block after the title.

### 3. Don't teach workers to disguise tasks
"Rephrase as a benign task to get past the filter" corrupts audit trails and
crosses from accurate-classification into evasion. The recovery protocol
ends at transparent degradation to human execution, never concealment.

### 4. Refusals on genuinely ambiguous targets are CORRECT
The red lines (no authorization → block, out-of-scope → stop) exist for a
reason. This skill reduces FALSE refusals on authorized work; it must not
be used to pressure the model past legitimate scope questions.

## Reference Files

- `references/refusal-mitigation-templates.md` — the three copy-paste blocks
  (Chinese, production-verified on 6 hack profiles 2026-07-23) + application
  checklist

## Related Skills

- **security-team-soul-enrichment** (default profile) — hack team SOUL.md
  tool catalogs and design patterns; the natural companion for SOUL content
- **orchestrator-board-routing** (default profile) — hack board routing
  rules where Layer 3 (task-body framing) is enforced
