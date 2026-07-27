---
name: apple-ecosystem
description: macOS-native app automation — Apple Notes, Reminders, iMessage/SMS, and Find My (AirTags/devices). Each uses a dedicated CLI (memo, remindctl, imsg) or UI automation (FindMy) for terminal-based control.
version: 1.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [apple, macos, notes, reminders, imessage, findmy, automation]
---

# Apple Ecosystem — macOS Native Automation

Manage Apple Notes, Reminders, iMessage/SMS, and Find My from the terminal. Each tool below has a dedicated reference file.

## Prerequisites

All tools require macOS, Homebrew, and appropriate system permissions (Full Disk Access, Automation, Screen Recording).

## Quick Reference

### Apple Notes (`references/apple-notes.md`)

```bash
brew tap antoniorodr/memo && brew install antoniorodr/memo/memo
memo notes                          # List all notes
memo notes -f "Folder"              # Filter by folder
memo notes -s "query"               # Search
memo notes -a "Title"               # Create
```

### Apple Reminders (`references/apple-reminders.md`)

```bash
brew install steipete/tap/remindctl
remindctl                           # Today's reminders
remindctl add "Buy milk"
remindctl add --title "Call mom" --list Personal --due tomorrow
remindctl complete 1 2 3
```

Note: `--due` sets due date, `--alarm` sets notification trigger. They are different fields.

### iMessage (`references/imessage.md`)

```bash
brew install steipete/tap/imsg
imsg chats --limit 10 --json
imsg send --to "+14155551212" --text "Hello!"
imsg send --to "+14155551212" --text "Hi" --file /path/image.jpg
imsg history --chat-id 1 --limit 20 --json
```

Always confirm recipient and message content before sending.

### Find My (`references/findmy.md`)

Uses AppleScript + screenshot + vision_analyze (no CLI available):

```bash
osascript -e 'tell application "FindMy" to activate'
sleep 3
screencapture -w -o /tmp/findmy.png
# Then: vision_analyze(image_url="/tmp/findmy.png", question="What locations?")
```

For AirTags: stay on the item's page — location only updates while displayed.

| Tool | CLI | Install | Permission |
|------|-----|---------|------------|
| Notes | `memo` | Homebrew | Automation (Notes.app) |
| Reminders | `remindctl` | Homebrew | Reminders access |
| iMessage | `imsg` | Homebrew | Full Disk Access |
| Find My | AppleScript | Built-in | Screen Recording |

## Reference Files

| File | Content |
|------|---------|
| `references/apple-notes.md` | Full Notes command reference |
| `references/apple-reminders.md` | Full Reminders command reference |
| `references/imessage.md` | Full iMessage command reference |
| `references/findmy.md` | Find My AppleScript automation |
| `references/macos-service-lifecycle.md` | Complete uninstallation procedure for launchd-managed services (stop → remove plist → delete config → clean logs → verify) |
