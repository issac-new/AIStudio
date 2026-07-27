---
name: kanban-acp-delegation
description: "ACP (Agent Client Protocol) delegation playbook for Hermes kanban workers: atomic acp_send units, self-contained first prompts, session_id continuation, output verification, and provider-stall recovery. Use when delegating coding/analysis work to Claude Code via acp_send, when an ACP call stalls or times out, or when verifying ACP-produced files before kanban_complete."
version: 1.0.0
author: Hermes Agent (distilled from worker SOUL/rules, kanban001 forensics)
platforms: [linux, macos]
metadata:
  hermes:
    tags: [acp, delegation, kanban, worker-coder, claude-code, verification]
    related_skills: [kanban-handoff-contract, systematic-debugging]
---

# Kanban ACP Delegation

How a kanban worker drives `acp_send` (from the `acp-client` plugin) to get
verifiable work out of a Claude Code agent without stalling the provider or
losing the session.

## The atomic-unit rule (highest-impact, incident-driven)

**One `acp_send` = one verifiable unit** (1-3 files OR one test suite).

Never ask for 5+ files in a single prompt. Real incident: one `acp_send`
demanding 16 files at once stalled the provider, crashed the process, and the
task took 7 runs / 5.5 hours for ~1 hour of actual work.

Pipeline per unit:
1. Send the unit → 2. verify files exist + syntax/tests pass → 3. send the
next unit. Do not batch.

## First prompt must be self-contained

The ACP agent sees none of your kanban context. Include in the first prompt:

- **Goal**: one-sentence objective + acceptance criteria.
- **Context**: absolute working dir, upstream design doc (path or key excerpt),
  target file paths (state "create if missing"), tech stack + test framework.
- **Constraints**: match neighboring file style; change only what the task
  needs (no drive-by refactors/renames/formatting); new deps go into the
  manifest; run tests and paste real output.

```python
result = acp_send(
    provider="claude",
    cwd="$HERMES_KANBAN_WORKSPACE",   # always explicit — default is sandbox root
    prompt="## 任务\n<goal + acceptance>\n\n## 上下文\n- 工作目录: <abs path>\n"
           "- 涉及文件: <paths>\n- 技术栈: <stack>\n\n"
           "## 约束\n- 遵循现有风格，不做顺手重构\n\n## 验收标准\n1. ...\n2. ...",
)
session_id = result["session_id"]   # save it — continuation needs it
```

## Continue on the same session

```python
acp_send(provider="claude", session_id=session_id,
         prompt="test_xxx fails: AssertionError ... fix the root cause, not the assertion.")
```

Never open a new session to continue prior work — the agent loses all memory
of the previous round.

## Stall / timeout recovery ladder

1. First no-response or timeout → **resend with a NARROWER prompt** (split the
   unit further).
2. Second consecutive failure → `kanban_block` reporting ACP/provider
   unavailable. **Never resend the same prompt a third time.**
3. Two consecutive API-level failures (401/429/timeout/connection) →
   `kanban_block(kind="dependency", reason="provider <name> 持续故障: <error>")`
   and exit — this converts an infra death into an explicit dependency block.

## Verify before you trust

The agent saying "done" is not evidence. Before `kanban_complete`, personally
run (via `terminal`): files exist (`ls -la`), syntax/type check passes,
module tests pass with real pass/fail counts, `git status` shows no
out-of-scope edits, no secrets in the diff. Escalation: automated check >
your own read > the agent's claim.

## Discipline checklist

- `provider` is always `"claude"` (this environment has no opencode/codex
  binaries); never substitute `claude -p` shell calls.
- Always pass `cwd` explicitly and name exact file paths.
- Long tasks: set `timeout` (default 600s); if ACP runs >1h, `kanban_heartbeat` first.
- Never paste secrets, tokens, or `.env` contents into the prompt — they land
  in workspace files.
