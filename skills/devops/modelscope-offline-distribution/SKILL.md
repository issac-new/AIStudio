---
name: modelscope-offline-distribution
description: Rebuild team offline packages and upload to ModelScope.
triggers:
  - "重新生成离线包"
  - "regenerate offline packages"
  - "上传到 modelscope"
  - "upload packages to modelscope"
  - "rebuild SwarmTeam/HackTeam offline"
---

# ModelScope Offline Package Upload (proven 2026-08-05)

## Repo layout (this user's setup)

- ModelScope repo: `tupang/ollama` (master branch)
- Local working dir: `/Volumes/YOURVOLUME/lab/ollamalinux/ollama` (git + LFS)
- Remote URL carries the oauth2 token inline:
  `https://oauth2:ms-...@www.modelscope.cn/tupang/ollama.git`
  (token in `~/.modelscope/credentials/git_token`)
- Build dirs kept in `/tmp`:
  - `/tmp/SwarmTeam` — swarm 12 profiles (orchestrator, worker-coder/researcher/tester,
    ops-devops/eval/incident-commander/sre, product-manager/researcher,
    platform-ontology-curator/skill-miner) + full global skills + shared
  - `/tmp/HackTeam-offline` — hack 5 profiles (orchestrator + hack-recon/exploit/
    forensics/auditor) + cybersecurity skills only
- Other artifacts in the same repo (LFS-tracked): SwarmStudio zips, hermes-agent
  runtime tar.gz, src zips — do not touch them, only update your own files.

## Rebuild + upload flow (8 steps)

1. **Sync profile files** from live `~/.hermes/profiles/<p>` into build dir:
   `SOUL.md`, `config.yaml`, `profile.yaml`, `distribution.yaml` (if exists),
   plus dirs `hindsight/`, `plugins/`, `references/`, `cron/`.
   Copy dirs with `ignore_patterns("*.pyc", "__pycache__", ".DS_Store",
   "config.yaml", ".env", "auth.json")` — do NOT copy plugin `config.yaml` or
   any runtime state (state.db, sessions/, logs/, memories/).
2. **Sync `_shared`** files (ontology.md, marking-rules.md, mandatory-acp.md,
   chart-rules.md, config.yaml, shared-rules-reference.md,
   loop-engineering-gates.md, mandatory-privacy.md, forward-deployed-protocol.md)
   plus any new `_shared/skills/<name>` dirs (e.g. bailian-image-gen).
3. **Sync global files** for the SwarmTeam package only: `config.yaml` (then
   sanitize), `SOUL.md`, `global_kanban_rules.md`.
4. **Sanitize every config.yaml** (per-profile + global + _shared): real
   `api_key:` values → `""`; keep `PROXY_MANAGED`, `${VAR}`, and short masked
   forms (`HK_KEY_K2_MASKED`, len < 25).
5. **Full-package secret scan** — see scan patterns below. Fix every hit before
   zipping (replace harmless teaching examples with `sk-REDACTED`).
6. **Zip**: `cd <dir> && zip -r /tmp/<Name>-offline.zip . -x '.git/*' '*.pyc'
   '__pycache__/*' '.DS_Store' '*.zip'`
7. **Upload**: copy zip into the ollama repo, `git add <zip>`, `git commit`,
   `git push origin master` (LFS auto-uploads; ~3-4 MB/s, 14 MB ≈ seconds).
8. **Verify remotely**:
   `curl -sS -o /dev/null -w "%{http_code}" https://www.modelscope.cn/models/tupang/ollama/resolve/master/<zip>`
   → expect 200 with correct byte size. Better: download and `unzip -p` to
   spot-check that the LATEST content is inside (grep for a new rule/marker).

## Sanitize function (per-line api_key regex)

```python
import re
def sanitize_config(content: str) -> str:
    out = []
    for line in content.split("\n"):
        m = re.match(r'^(\s*api_key\s*:\s*)(.*)$', line)
        if m:
            val = m.group(2).strip().strip('"').strip("'")
            if val in ("", "PROXY_MANAGED") or val.startswith("${") or val.startswith("YOUR_"):
                out.append(line)
            elif "..." in val and len(val) < 25:   # masked form HK_KEY_K2_MASKED
                out.append(line)
            else:
                out.append(m.group(1) + '""')      # real key → empty
        else:
            out.append(line)
    return "\n".join(out)
```

## Scan patterns (real credentials — must be 0 hits)

- Bailian full key: `<BAILIAN_KEY_ID>` (32-hex, `.suffix` allowed)
- Long sk- keys: `sk-[a-zA-Z0-9]{20,}`
- ModelScope token: `ms-4225fbb3...`
- **False positives to whitelist**: AD domain params `ms-DS-MachineAccountQuota`
  (matches `ms-` but is not a token); teaching examples `sk-123...cdef`
  (6-char, harmless — but replace with `sk-REDACTED` to keep scan clean).

## ⚠️ Patch-freshness checklist (CRITICAL when re-packaging)

The packaged `patches/` directory is a common silent-staleness trap:

- TUI status-bar fixes live in TWO places: `~/.hermes/patches/` AND
  `~/.hermes/profiles/orchestrator/patches/` — `post-update-hook.sh` references
  the **profile** path (`$HOME/.hermes/profiles/orchestrator/patches/...`).
  Packaging only `~/.hermes/patches/` misses fixes stored under the profile.
- Observed: `tui-ccswitch-statusbar.patch` (08-03) did NOT contain the 08-05
  runtime-provider fix (`current_provider_id` read from proxy `/status` instead
  of the DB `is_current` flag which lags behind failover/circuit-breaker trips).
- **Regenerate the patch from live source**, don't trust the on-disk patch:
  ```bash
  git -C ~/.hermes/hermes-agent diff -- \
    ui-tui/src/components/appChrome.tsx ui-tui/src/components/appLayout.tsx \
    > /tmp/SwarmTeam/patches/tui-ccswitch-statusbar.patch
  ```
- **Verify the patch applies to clean HEAD** (not just eyeball the diff):
  ```bash
  cd ~/.hermes/hermes-agent
  git stash push -- ui-tui/src/components/appChrome.tsx ui-tui/src/components/appLayout.tsx
  git apply --check /tmp/SwarmTeam/patches/tui-ccswitch-statusbar.patch   # exit 0 = OK
  git stash pop
  ```
- Copy companion fix scripts into the package (e.g.
  `tui-ccswitch-runtime-provider-fix.sh`).
- When a new fix is added, update the detection markers in
  `apply-tui-patches.ps1` / `post-update-hook.ps1` (add the new marker, e.g.
  `current_provider_id`, to the "already applied" condition) so target machines
  re-apply after `hermes update`.
- macOS has no `pwsh`: validate `.ps1` edits statically (string presence +
  no `$` interpolation conflict in the match literal) and simulate the
  PowerShell `-match` logic in Python. State this honestly as static
  verification, not execution.
