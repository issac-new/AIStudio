---
name: team-model-routing
title: Team-Level Model Routing in Multi-Profile Hermes
description: >-
  Pin a whole team of profiles (e.g. hack board → k3, swarm board → glm-5.2)
  to a different model/provider than the shared default, using the
  profiles.yaml per-profile `model:` override and generate-configs.py.
  Covers the override mechanism, custom-provider declaration rules,
  backup→regenerate→diff verification, smoke-testing, and the
  dangling-skills-symlink startup crash that profile deletion leaves behind.
triggers:
  - "hack team 换模型"
  - "switch team model"
  - "per-profile model override"
  - "统一使用k3模型"
  - "pin profile to model"
  - "different model per team"
---

# Team-Level Model Routing in Multi-Profile Hermes

## When to Use

- A whole Kanban team (hack board's 6 profiles, swarm board's 9) should run a
  DIFFERENT model/provider than the `shared_config.model` default
- A single profile needs pinning to another model (e.g. hack-weapons to a
  low-refusal model after `llm-refusal-mitigation` framing isn't enough)
- Provider-side false refusals / cost / latency make the shared default wrong
  for one team but not the other

Do NOT hand-edit each profile's `config.yaml` — the next
`generate-configs.py` run silently reverts it. The single source of truth is
`~/.hermes/shared/profiles.yaml`.

## The Override Mechanism (added 2026-07-23)

`generate-configs.py::generate_config_yaml()` resolves the model block as:

```python
model_cfg = profile_cfg.get("model") or shared.get("model", {...default...})
```

So a per-profile `model:` key in `profiles.yaml` wins over
`shared_config.model`; profiles without it inherit the shared default
unchanged. When editing the generator, keep this exact `or` pattern —
`profile_cfg.get("model", shared...)` also works but `or` is what production
has; don't diverge.

## Workflow: pin a team to a new model

### 1. Declare the override in profiles.yaml

Insert a `model:` block as the FIRST key under each target profile (before
`api_server:`), keeping the exact shape of `shared_config.model`:

```yaml
  hack-recon:
    model:
      default: k3
      provider: custom:kimicode
      base_url: https://api.kimi.com/coding
    api_server:
      enabled: false
    ...
```

Do it programmatically for 6+ profiles (regex-insert after the
`^  <name>:\n` header), then `yaml.safe_load` and assert every target
profile has the block and every non-target has `model: None`.

### 2. Custom provider declaration rules

- Declare the provider ONCE in `shared_config.custom_providers` (legacy list
  form), NOT under `providers:`. A dict entry makes the model resolve under
  two slugs (`kimicode` AND `custom:kimicode`) and `_configured_provider_matches()`
  rejects it as ambiguous — this is why `custom_providers:` list form exists.
- Reference it from the profile's model block as `provider: custom:<name>`
  (e.g. `custom:kimicode`). Runtime accepts both `<name>` and `custom:<name>`
  (`_custom_provider_runtime_ids`), but the canonical pinned form is
  `custom:<name>`.
- The API key comes from `${KIMI_API_KEY}`-style env refs in the
  custom_providers entry; verify each target profile's `.env` actually
  defines that var (`grep -c KIMI_API_KEY profiles/*/​.env`) BEFORE switching.
- `api_mode: anthropic_messages` endpoints (Kimi coding, damoxing) work for
  both main and auxiliary calls; Hindsight LLM stays on the shared provider
  regardless.

### 3. Backup, regenerate, diff-verify

```bash
# Backup ALL profiles' configs first (enables per-profile diff)
mkdir -p /tmp/config-backup && for p in $(ls ~/.hermes/profiles/); do
  cp ~/.hermes/profiles/$p/config.yaml /tmp/config-backup/$p.yaml; done

# Regenerate — MUST use the hermes venv python (system python3 has no yaml)
~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/generate-configs.py

# Diff: target team should differ ONLY in the model: block (3 lines);
# every other profile must be byte-identical
for p in hack-recon hack-exploit hack-forensics hack-auditor hack-c2 hack-weapons; do
  diff /tmp/config-backup/$p.yaml ~/.hermes/profiles/$p/config.yaml; done
for p in orchestrator architect worker-coder; do
  diff -q /tmp/config-backup/$p.yaml ~/.hermes/profiles/$p/config.yaml; done
```

Expected non-model drift on regeneration: `skills.disabled` lists refresh
from disk (new skill dirs appear as new disabled entries — e.g. worker-reviewer
gained `docx`, `pdf`, `xlsx`, `tui-widgets`). This is allowlist bookkeeping,
harmless, and NOT a model change. Verify the profile's `model:` block is
untouched and move on. Watch for junk dirs like `skills/productivity/nano-pdf.bak`
entering the disabled list — delete the stray dir rather than letting it
pollute configs.

### 4. Verify + smoke test

```bash
hermes -p hack-recon doctor   # team line should read "hack-recon: k3, no alias"
hermes -p hack-recon chat -q "用一句话确认你当前可用的模型身份。" -Q
# Expect the answer to name the NEW model identity
```

No gateway restart needed — the kanban dispatcher re-reads each profile's
config.yaml when it spawns a worker, so the next dispatched task uses the
new model. Running workers keep the old model until their task cycles.

## Pitfall: deleting a profile bricks its symlink dependents

Profiles created by cloning may hold `skills/` as a symlink INTO another
profile (hack-* → `worker-security/skills`). Deleting the target profile
leaves dangling symlinks, and EVERY `hermes -p <profile>` command then
crashes at startup:

```
FileExistsError: [Errno 17] File exists: '.../profiles/<profile>/skills'
# from ensure_hermes_home() → mkdir on the dangling symlink
```

This silently disables the whole team — the dispatcher spawns workers that
instantly crash, and it surfaces as "model won't start" during a model
switch smoke test, which is misleading.

Diagnose + fix:

```bash
for p in ~/.hermes/profiles/*/; do
  t=$(readlink "$p/skills" 2>/dev/null)
  [ -n "$t" ] && [ ! -e "$t" ] && echo "DANGLING: $p/skills -> $t"
done
rm ~/.hermes/profiles/<profile>/skills
ln -s ~/.hermes/skills ~/.hermes/profiles/<profile>/skills
```

Prevention: before `hermes profile delete`, run
`find ~/.hermes/profiles -type l -lname "*<name>*"` and repoint dependents
first. (2026-07-23: all 6 hack profiles bricked this way after worker-security
deletion; repointed to the global skills dir.)

## Pitfall: skills are symlink-resolved, skill_manage is ownership-scoped

`skill_view` reads skills through the orchestrator profile's symlinked
skills dir, so a skill LOOKS local but physically belongs to `default`.
`skill_manage` then fails with "not found in active profile 'orchestrator'".
The usable paths from this profile: edit the physical file under
`~/.hermes/skills/...` with file tools (cross_profile=True), or create
orchestrator-owned extension skills (like this one).

## Related Skills

- **llm-refusal-mitigation** (default profile) — model switch is the
  documented escalation path when three-layer authorization framing isn't
  enough; this skill is the mechanics of executing that switch team-wide
- **hermes-profile-config** (default profile) — the broader config-editing
  playbook: write-guard rules, custom provider shapes, generator pitfalls
- **agent-profile-lifecycle** (default profile) — create/delete profile
  workflow; see its symlink warning which this skill's pitfall extends
