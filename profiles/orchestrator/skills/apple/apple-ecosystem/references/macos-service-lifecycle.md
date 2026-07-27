# macOS Service Lifecycle Management

Complete workflow for removing launchd-managed services (typically Node.js gateways, agents, or daemons installed via npm or Homebrew).

---

## Complete Uninstallation Procedure

Use this when a user asks to "remove" / "uninstall" / "卸载" a service that was installed as a launchd plist. The full pattern is 8 steps:

### Step 1: Stop and unload the launchd service

```bash
# Find the service label
launchctl list | grep -E "<appname>"

# Unload (replace gui/501 with the user's uid if different)
launchctl bootout gui/501 ~/Library/LaunchAgents/com.<app>.gateway.plist

# Verify
launchctl list | grep -E "<appname>" || echo "removed"
```

Exit 0 means success. If the plist has `KeepAlive=true`, the process respawns
immediately unless you unload before removing the plist — always bootout first.

### Step 2: Remove the plist file

```bash
rm ~/Library/LaunchAgents/com.<app>.gateway.plist
```

Check three locations:
- `~/Library/LaunchAgents/` — per-user (most common)
- `/Library/LaunchAgents/` — machine-wide per-user
- `/Library/LaunchDaemons/` — system daemons (needs sudo)

### Step 3: Uninstall the npm global package

```bash
npm uninstall -g <package-name>
```

**If EACCES** (npm installed in a system-owned path like `/opt/homebrew/`):
```bash
rm -rf /opt/homebrew/lib/node_modules/<package-name>
```

### Step 4: Remove command binaries

Check all PATH locations since npm may have symlinks in multiple places:

```bash
which -a <command-name>   # Find all copies
rm /opt/homebrew/bin/<command>   # Remove each
rm /usr/local/bin/<command>      # May have a second copy
rm /opt/homebrew/bin/<command>   # etc.
which -a <command-name> || echo "removed from PATH"
```

### Step 5: Delete config and data directories

```bash
rm -rf ~/.<appname>
```

Check for symlinks too — some tools share config between differently-named
directories (e.g., `~/.clawdbot` → `~/.openclaw`):

```bash
ls -la ~/.<appname>      # Check if symlink
stat -f "%Y" ~/.<appname> # Resolve symlink target
rm ~/.<appname>          # Remove symlink separately
```

### Step 6: Clean logs and temp files

```bash
# Log directories (often large — months of accumulated logs)
rm -rf ~/Library/Logs/<appname>/

# Temp files
rm -rf /tmp/<appname>/
```

Check log sizes first with `du -sh ~/Library/Logs/<appname>/` so the user
knows how much space is being freed.

### Step 7: Verify everything is gone

```bash
# launchd
launchctl list | grep -iE "<appname>" || echo "✅ no service"

# plist files
ls ~/Library/LaunchAgents/*<appname>* 2>/dev/null || echo "✅ no plist"

# npm packages
npm list -g 2>/dev/null | grep -iE "<appname>" || echo "✅ no npm package"

# commands
which <command> 2>/dev/null || echo "✅ command removed"

# data dirs
ls -d ~/.<appname> 2>/dev/null || echo "✅ no config data"

# logs
ls -d ~/Library/Logs/<appname>/ 2>/dev/null || echo "✅ no logs"

# running processes
ps aux | grep -iE "<appname>" | grep -v grep || echo "✅ no processes"
```

### Step 8: Also clean config references (contextual)

Check for stale references in related configuration files:

```bash
# e.g. Hermes .env for deprecated paths referencing the removed app
grep -in "<appname>" ~/.hermes/profiles/*/.env 2>/dev/null || echo "✅ no refs"
```

---

## Disk space savings (typical)

| Item | Size (typical) |
|------|---------------|
| npm global package | 2–15 MB |
| Config + data | 0.5–3 MB (may contain large caches) |
| Logs | 10–500+ MB (depends on runtime and log level) |
| Temp files | 0–100 MB |

---

## Real‑world example: Removing OpenClaw + Clawdbot

Two launchd services sharing the same config tree via symlink:

```
~/.clawdbot → ~/.openclaw   # symlink, same data
```

| Step | Command |
|------|---------|
| 1. Stop services | `launchctl bootout gui/501 ~/Library/LaunchAgents/ai.openclaw.gateway.plist && launchctl bootout gui/501 ~/Library/LaunchAgents/com.clawdbot.gateway.plist` |
| 2. Remove plists | `rm ~/Library/LaunchAgents/ai.openclaw.gateway.plist ~/Library/LaunchAgents/com.clawdbot.gateway.plist` |
| 3. Uninstall npm | `npm uninstall -g clawdbot` + `rm -rf /opt/homebrew/lib/node_modules/openclaw` |
| 4. Remove bins | `rm /opt/homebrew/bin/openclaw /usr/local/bin/openclaw` |
| 5. Delete config | `rm -rf ~/.openclaw && rm ~/.clawdbot` |
| 6. Clean logs | `rm -rf ~/Library/Logs/openclaw/ && rm -rf /tmp/openclaw/` |
| 7. Verify | all 6 checks pass |
| **Recovered** | **~531 MB** (351 MB gateway.log + 180 MB gateway.err.log + config + npm) |
