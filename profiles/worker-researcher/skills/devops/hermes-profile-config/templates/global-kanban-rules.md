# Global Kanban Rules — Template

Place this file at `~/.hermes/global_kanban_rules.md` and set each profile's
`agent.environment_hint` to point to it. All agents (orchestrator + workers)
receive the same rules on their next message / dispatch.

## workspace_kind — FORBID scratch, default = dir

All `kanban_create()` calls **must explicitly set workspace_kind**. Never omit
it or rely on the default (the tool-level default is `"scratch"`).

### ❌ Forbidden
- `workspace_kind="scratch"` — including omitting the parameter

### ✅ Allowed
- `workspace_kind="dir"` — default, fixed directory (requires workspace_path)
- `workspace_kind="worktree"` — git worktree (for project-linked repos)

> **Global default root**: all agent task workspace dirs default to `~/hermes-docker-sandbox/workspace/`. When `workspace_kind="dir"` is used without an explicit `workspace_path`, a subdirectory under this root is created per task ID.

### Call examples

```python
# CORRECT — explicit dir workspace
kanban_create(
    title="research report",
    assignee="worker-researcher",
    workspace_kind="dir",
    workspace_path="~/workspace",
    ...
)

# CORRECT — explicit worktree
kanban_create(
    title="fix db migration",
    assignee="worker-coder",
    workspace_kind="worktree",
    project="hermes-agent",
    ...
)

# WRONG — default scratch (silently rejected by global rule)
kanban_create(
    title="quick task",
    assignee="worker-coder",
    # workspace_kind omitted → default "scratch" → violates rule
)
```

### Per-profile setup

```yaml
# orchestrator — via hermes config set (write-guarded profile)
# hermes -p orchestrator config set agent.environment_hint \
#   ~/.hermes/global_kanban_rules.md

# worker-coder — patch tool (non-protected)
# patch:
#   path: ~/.hermes/profiles/worker-coder/config.yaml
#   old_string: "  environment_hint: \"\""
#   new_string: "  environment_hint: ~/.hermes/global_kanban_rules.md"

# worker-researcher — same patch as worker-coder
```

> Rule version: 1.0
> Applicable to: all agent profiles (orchestrator, worker-coder, worker-researcher)
