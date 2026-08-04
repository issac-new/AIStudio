# delegate_task Lifecycle Failure Modes & Rescue

Companion to the mutation-block rules in SKILL.md. Covers how delegate_task
subagents die, how to recover their collected data, and how to redispatch
without repeating work. Verified 2026-07-29 (deleg_96e32c72 / deleg_66f0dc3b).

## Failure signatures (from live transcripts)

Paths: `~/.hermes/profiles/<profile>/cache/delegation/live/<delegation_id>/`
— `manifest.json` (per-task status) + `task-N.log` (append-only transcript).

| Signature in log | Meaning | Data state |
|------------------|---------|-----------|
| `status=interrupted ... waiting for model response (X.Xs elapsed)` | Provider/model stall mid-turn | All tool results so far are in the log |
| `status=completed exit_reason=max_iterations (iteration budget exhausted)` | Turn budget ran out mid-work | Same — but final summary is TRUNCATED (`…(+93 chars)`) and the output file was **never written** |
| `final \| end status=completed exit_reason=completed` | True clean finish | Report file should exist — verify it |

Key trap: `status=completed` does NOT imply the deliverable exists. Check for
the output file before trusting completion. A subagent can run 100+ tool
calls over 1400+ seconds, hit max_iterations, and leave zero files.

## Rescue — mine the transcript

The log carries every tool call's full result. Recover with regex over
`task-N.log`:

```python
import re
with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
    log = f.read()

# Full tool outputs (decode escapes after extracting)
outputs = re.findall(r'"output": "(.*?)"\s*,\s*"exit_code"', log, re.DOTALL)
for o in outputs:
    decoded = o.replace('\\n', '\n').replace('\\"', '"')

# Subagent's own analysis lines
thinks     = re.findall(r'think    \| (.+)', log)
assistants = re.findall(r'assistant\| (.+)', log)

# Final summary (may be truncated — treat as hint, not full text)
final = re.search(r'final    \| status=\w+ duration=[\d.]+s summary: (.+)', log)
```

Then compile the recovered data into the report yourself — do not quote the
truncated final summary as if complete.

## Redispatch with context injection (verified)

When a whole workstream dimension is missing (>30% of plan), redispatch —
but **inject the already-collected data into the new subagent's `context`
field** as a numbered list with a "勿重复采集" instruction. Verified effect:
a redispatched agent given 15 prior data points went straight to the missing
dimensions instead of repeating 100+ tool calls of collection.

## Prevention for long collectors

1. Goal must name the output file path AND require **incremental writes**
   ("write the partial report after each major section, append as you go").
   A subagent dying at max_iterations after 100+ tool calls otherwise loses
   everything.
2. For batch dispatches, prefer 3 small tasks over 1 long collector — the
   iteration budget is per-task.
3. Polling: foreground `sleep 60+` in terminal hits the ~60s command
   timeout. Use short sleeps or rely on auto-delivery — the consolidated
   result re-enters the conversation on its own; you never need to block.

## execute_code statelessness (bitten during report merging)

`execute_code` calls are stateless sandboxes — variables do NOT persist
between calls (a `NameError` on call N+1 means lost state). Persist
intermediate data to `/tmp/*.json` between calls, or do all processing in
one call. This applies to any multi-step data-wrangling, not just delegation.
