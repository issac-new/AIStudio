# Kanban + ACP Dual-Lane Convention

When a Hermes Kanban worker wants to run an ACP CLI (Codex, Claude Code, OpenCode)
as an isolated implementation lane, use this pattern. Hermes always owns the task
lifecycle; the ACP CLI is an input lane only.

## Ownership Rules

1. **Hermes** owns the Kanban lifecycle. ACP CLI must never call kanban tools or messaging.
2. **Hermes** owns final acceptance. Treat ACP commits/diffs as untrusted patches until reviewed.
3. **Hermes** owns test execution. ACP may run tests but those are advisory — re-run with canonical wrappers.
4. **Hermes** owns safety. Reject the lane if it changes safety boundaries, risk gates, or secrets.
5. **Hermes** owns cleanup. Kill stuck processes and remove temporary worktrees.

## Required Worktree Pattern

```bash
TASK_ID="${HERMES_KANBAN_TASK:-t_manual}"
REPO="/path/to/repo"
BASE="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
SAFE_TASK="$(printf '%s' "$TASK_ID" | tr -cd '[:alnum:]_-')"
BRANCH="acp/${SAFE_TASK}/$(date -u +%Y%m%d%H%M%S)"
WORKTREE="/tmp/${SAFE_TASK}-acp-lane"

git -C "$REPO" fetch --all --prune
git -C "$REPO" worktree add -b "$BRANCH" "$WORKTREE" "$BASE"
```

## Prompt Construction

Every prompt must include:
- `task_id`, title, and full Kanban acceptance criteria
- Repo path, worktree path, branch name, allowed file scope
- Explicit: Hermes owns Kanban lifecycle; ACP is input lane only
- Required output: concise summary, files changed, commits, tests run, risks
- Prohibited: secrets access, external messaging, board mutation, unrelated refactors
- Verification commands (both what ACP may run and what Hermes will run)

## Reconciliation Checklist

- [ ] `git status --short --branch` shows only expected files
- [ ] Diff reviewed by Hermes
- [ ] No secrets, credentials, or unrelated artifacts included
- [ ] ACP commits are small enough to cherry-pick or squash
- [ ] Hermes ran canonical tests independently
- [ ] Accepted commits applied to Hermes workspace/branch

## Acceptance Outcomes

- `accepted`: diff reviewed, applied, and verified
- `partial`: some work accepted after edits; rejected parts documented
- `rejected`: no changes accepted; reason documented
- `timed_out`: ACP exceeded budget; useful artifacts may exist

## Metadata Schema (kanban_complete)

```json
{
  "acp_lane": {
    "used": true,
    "mode": "exec",
    "worktree": "/absolute/path/to/worktree",
    "branch": "acp/t_caa69668/20260508100000",
    "result": "accepted | rejected | partial | timed_out",
    "accepted_commits": ["sha1", "sha2"],
    "rejected_reason": "concrete reason or empty",
    "tests_run": [
      {"command": "scripts/run_tests.sh", "exit_code": 0, "owner": "hermes"}
    ],
    "artifacts": ["/absolute/path/to/log-or-patch"]
  }
}
```
