---
name: apple-macos
description: "macOS tools: Apple Notes, Reminders, Find My, iMessage via CLI tools (memo, remindctl, AppleScript, imsg)."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [macos]
metadata:
  hermes:
    tags: [Apple, macOS, Notes, Reminders, FindMy, iMessage, IM, productivity]
    related_skills: [obsidian]
---

# Apple macOS Tools

Manage Apple ecosystem tools on macOS via CLI and AppleScript automation. Covers Notes, Reminders, Find My, and iMessage.

## When to Use

- **Apple Notes:** User asks to create, view, or search notes; needs cross-device sync via iCloud
- **Apple Reminders:** User mentions "reminder" or "Reminders app"; personal to-dos with due dates syncing to iOS
- **Find My:** User asks "where is my [device/cat/keys/bag]?"; tracking AirTag locations
- **iMessage:** User asks to send an iMessage/SMS; reading conversation history

## Prerequisites

Common setup commands:
```bash
# Apple Notes
brew tap antoniorodr/memo && brew install antoniorodr/memo/memo

# Apple Reminders
brew install steipete/tap/remindctl

# Find My (optional, for better UI automation)
brew install steipete/tap/peekaboo

# iMessage
brew install steipete/tap/imsg
```

Grant automation/access permissions when prompted by each tool.

---

## Apple Notes (via memo CLI)

### Quick Reference

```bash
memo notes                          # List all notes
memo notes -f "Folder Name"         # Filter by folder
memo notes -s "query"               # Search notes (fuzzy)
memo notes -a                       # Interactive editor to create
memo notes -a "Note Title"          # Quick add with title
memo notes -e                       # Interactive edit
memo notes -d                       # Interactive delete
memo notes -m                       # Move to folder (interactive)
memo notes -ex                      # Export to HTML/Markdown
```

### Rules
1. Prefer Apple Notes for cross-device sync (iPhone/iPad/Mac)
2. Use `memory` tool for agent-internal notes
3. Cannot edit notes with images/attachments

---

## Apple Reminders (via remindctl)

### Quick Reference

```bash
remindctl                         # Today's reminders
remindctl today|tomorrow|week     # Date queries
remindctl overdue                 # Past due
remindctl all                     # Everything
remindctl 2026-01-04              # Specific date

# Manage lists
remindctl list                    # All lists
remindctl list Work               # Show specific list

# Create reminders
remindctl add "Buy milk"
remindctl add --title "Call mom" --list Personal --due tomorrow
remindctl add --title "Meeting prep" --due "2026-02-15 09:00"

# Due vs Alarm: --due sets deadline, --alarm sets notification trigger
remindctl add --title "Hairdresser" --due "2026-05-15 14:00" --alarm "2026-05-15 13:30"

# Complete / Delete
remindctl complete 1 2 3          # Complete by ID
remindctl delete 4A83 --force     # Delete by ID

# Output formats
remindctl today --json            # JSON for scripting
remindctl today --plain           # TSV format
```

### Rules
1. When user says "remind me", clarify: Apple Reminders (syncs to phone) vs agent cronjob alert
2. Use `--json` for programmatic parsing

---

## Find My (Apple Devices/AirTags)

Apple provides no CLI for Find My. Use AppleScript + screenshot capture:

### Basic Method

```bash
# Open Find My app
osascript -e 'tell application "FindMy" to activate'
sleep 3
# Take screenshot of window
screencapture -w -o /tmp/findmy.png
```

Use `vision_analyze` on the screenshot to read locations.

### Peekaboo Method (recommended)

```bash
peekaboo see --app "FindMy" --annotate --path /tmp/findmy-ui.png
peekaboo click --on B3 --app "FindMy"  # Click on specific device
peekaboo image --app "FindMy" --path /tmp/findmy-detail.png
```

### Tab Switching

```bash
# Devices tab
osascript -e 'tell application "System Events" to tell process "FindMy" to click button "Devices" of toolbar 1 of window 1'

# Items tab (AirTags)
osascript -e 'tell application "System Events" to tell process "FindMy" to click button "Items" of toolbar 1 of window 1'
```

### Tracking AirTags

Keep FindMy in the foreground while tracking — AirTags only update when the page is displayed:
```bash
while true; do
    screencapture -w -o /tmp/findmy-$(date +%H%M%S).png
    sleep 300  # Every 5 minutes
done
```

### Limitations
- No CLI or API — must use UI automation
- Screen Recording permission required
- AppleScript may break across macOS versions

---

## iMessage (via imsg CLI)

### Quick Reference

```bash
# List chats
imsg chats --limit 10 --json

# View history
imsg history --chat-id 1 --limit 20 --json
imsg history --chat-id 1 --limit 20 --attachments --json

# Send messages
imsg send --to "+14155551212" --text "Hello!"
imsg send --to "+14155551212" --text "Check this" --file /path/to/image.jpg
imsg send --to "+14155551212" --text "Hi" --service imessage
imsg send --to "+14155551212" --text "Hi" --service sms

# Watch for new messages
imsg watch --chat-id 1 --attachments
```

### Service Options
- `--service imessage` — Force iMessage
- `--service sms` — Force SMS (green bubble)
- `--service auto` — Let Messages.app decide (default)

### Rules
1. **Always confirm recipient and content** before sending
2. **Never send to unknown numbers** without explicit user approval
3. **Verify file paths** exist before attaching
4. Grant Full Disk Access for terminal (System Settings → Privacy → Full Disk Access)

## Related Skills
- `obsidian` — for Markdown-native knowledge management (use instead of Notes when sync not needed)
