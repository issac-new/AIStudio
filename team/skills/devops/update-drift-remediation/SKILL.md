---
name: update-drift-remediation
version: 1.0.0
description: Use when fixing update-induced baseline drift in Hermes.
metadata:
  hermes:
    tags: [hermes-update, drift, baseline, compression, self-healing, restabilize]
    related_skills: [update-time-inventory-self-healing, hermes-patch-watchdog, tool-inventory-baseline, skill-library-slimming]
---

# Update Drift Remediation (profile-owned extension)

This profile's extension layer for update-induced baseline drift. The canonical
umbrella `update-time-inventory-self-healing` lives in the shared layer
(`~/.hermes/skills/devops/`) and cannot be patched from this profile (skill_manage
reports "not found" — owner is profile `default`); validated learnings land here
instead. Read the shared umbrella for the three-layer architecture (post-merge
hook → weekly watchdog → update-behavior facts); this skill adds what that layer
does not yet carry.

## 1. Profile config values silently revert (compression pattern)

Profiles do NOT inherit the main `~/.hermes/config.yaml` at runtime —
`hermes_cli/config.py::load_config()` reads only the profile's own config.yaml,
and `agent/agent_init.py:2116` pulls compression from it. A stale per-profile
value shadows the optimized main value. Found 2026-09-02: 33/33 profiles ran
compression 0.5/0.2 while main config said 0.35/0.15.

Root cause shape (look for it in any "profile didn't keep main config" drift):
DOUBLE-hardcoded defaults — `shared_config.compression` in
`~/.hermes/shared/profiles.yaml` AND the fallback dict in
`~/.hermes/shared/generate-configs.py` both carried 0.5/0.2.

Fix order matters:
1. Fix the single source of truth first (`profiles.yaml` shared_config).
2. THEN converge existing profile files with a point-sync script.
3. Only then will a full regen (post-merge `skill-fence.py apply --with-configs`)
   produce correct values instead of reverting you.

**Hazard — full regen vs point-fix**: `generate-configs.py --diff` and
`--with-configs` regenerate the WHOLE config (toolsets/providers/auxiliary/agent,
not just the drifted key). Never run them mid-session to fix one value —
hand-maintained profile state gets clobbered (this bit once: the fallback edit
was applied, `--diff` showed a ~200-line regen, rolled back via the .bak).
Point-sync instead: yaml-load each config, set only drifted keys, safe_dump —
`~/.hermes/bin/sync-compression.py` is the reference implementation (outputs
CHANGED/SKIPPED/NO-KEY counts). Full regen is sanctioned at update/post-merge
time only.

Verification: recount all profiles (`sort | uniq -c` over threshold/target_ratio),
spot-check 2-3 configs that other config sections survived (keys list intact).

## 2. Self-heal chain integrity: the hook exec bit

"Hook file exists" ≠ "hook runs". The post-merge hook was found `-rw-r--r--`
with perfectly good content — git silently never executed it, so NO update-time
convergence ever ran and drift accumulated until manual cleanup. A `cp` or
editor rewrite strips the bit.

Check on every drift investigation:
```bash
ls -la ~/.hermes/hermes-agent/.git/hooks/post-merge   # want -rwxr-xr-x
chmod +x ~/.hermes/hermes-agent/.git/hooks/post-merge  # fix if not
bash -n ~/.hermes/hermes-agent/.git/hooks/post-merge   # syntax gate
```
Current hook contract (2026-08-18+): watchdog → on drift `skill-fence.py
apply --with-configs` → re-run watchdog → log to
`~/.hermes/logs/post-merge-inventory.log`, always exit 0.

## 3. Skill board convergence (fence apply)

- Dry-run = run with NO argument; `--dry-run` is NOT a valid mode argument
  (argparse choices are `['--dry-run','apply']` with default `--dry-run` —
  passing it explicitly errors with "unrecognized arguments").
- Real run: `~/.hermes/hermes-agent/venv/bin/python3 ~/.hermes/shared/skill-fence.py apply`
  — prunes non-allowlist symlinks, archives real-dir copies (DIRCOPIES),
  reports kept/linked/demoted/pruned/archived per profile.
- Trust-but-verify: spot-check one profile's surviving board against its
  `profiles.yaml` `skills_enabled` + `skills_pinned` before accepting.
- Empty stub categories (dir with only DESCRIPTION.md, 0 references in
  profiles.yaml) go to `~/.hermes/skills-archive/_stub-<name>-<date>`.
- 2026-09-02 result: 49 issues → 0 (DIRCOPIES ~30 + count DRIFT ~15 + 1 stub).

## 4. Tool baseline rebaseline: consumer-proof norm

A count drift is a question, not a verdict. For each new package find a REAL
consumer before blessing it into the baseline:
- Claude Code plugin usage: `~/.claude.json` → `usageCount` / `lastUsedAt`
  (claude-mem: 2263 uses, last 2026-08-26 → legit).
- User action: install date + config trail (cnpm: installed 08-28,
  `~/.npmrc` registry=npmmirror → user's deliberate mirror choice).
- Hermes-side: grep `~/.hermes/bin`, SOULs, skills for references.

Resolve contradictions with dated notes: a package sitting in BOTH the
baseline and the Pruned/do-NOT-reinstall list (`tool-inventory-baseline`
SKILL.md) must be moved out of one with a reason + date. Keep the watchdog
BANNED list consistent with that Pruned list.

2026-09-02: npm global 16 → 25 (9 new: dsh, dsh-tui, openspec, codex-security,
claude-code, open-code-review, gitlab-ci-local, corepack + claude-mem/cnpm
resolved as above). Counting pitfall: script counts `npm ls -g --depth=0`
skip=1; `corepack@` has no version — off-by-one vs manual count is inside
tolerance, use the script's own command when rebaselining.

## Session references

- Full 2026-09-02 restabilize run with exact commands and verification output:
  `references/2026-09-02-baseline-restabilize.md`

## Related Skills

- `update-time-inventory-self-healing` (shared layer) — the three-layer
  architecture this extends.
- `hermes-patch-watchdog` — the launchd layer that re-applies source patches;
  its deployed script checks 4 source signatures + dist, not the 2 the shared
  docs mention.
- `tool-inventory-baseline` (shared layer) — canonical toolset + Pruned list.
