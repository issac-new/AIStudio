# Apple Reminders

Use `remindctl` CLI to manage Apple Reminders from terminal.

```bash
# Install
brew install steipete/tap/remindctl
remindctl authorize

# View
remindctl              # Today's reminders
remindctl today        # Today
remindctl tomorrow     # Tomorrow
remindctl week         # This week
remindctl overdue      # Past due
remindctl all          # Everything

# Manage Lists
remindctl list                  # List all lists
remindctl list Work --create    # Create list

# Create Reminders
remindctl add "Buy milk"
remindctl add --title "Call mom" --list Personal --due tomorrow
remindctl add --title "Meeting" --due "2026-02-15 09:00"

# Due Time vs Alarm
# --due sets due date, --alarm sets notification trigger (different fields!)
remindctl add --title "Hairdresser" --due "2026-05-15 14:00" --alarm "2026-05-15 13:30"

# Edit
remindctl edit <id> --due "2026-05-15 14:00"

# Complete / Delete
remindctl complete 1 2 3
remindctl delete 4A83 --force

# Output formats
remindctl today --json       # JSON for scripting
remindctl today --plain      # TSV
remindctl today --quiet      # Counts only
```

Date formats: `today`, `tomorrow`, `YYYY-MM-DD`, `YYYY-MM-DD HH:mm`, ISO 8601.
