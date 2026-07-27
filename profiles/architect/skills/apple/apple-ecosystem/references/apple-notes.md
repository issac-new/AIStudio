# Apple Notes

Use `memo` CLI to manage Apple Notes from terminal.

```bash
# Install
brew tap antoniorodr/memo && brew install antoniorodr/memo/memo

# View
memo notes                        # List all notes
memo notes -f "Folder Name"       # Filter by folder
memo notes -s "query"             # Fuzzy search

# Create
memo notes -a                     # Interactive editor
memo notes -a "Note Title"        # Quick add

# Edit / Delete / Move / Export
memo notes -e                     # Interactive edit
memo notes -d                     # Interactive delete
memo notes -m                     # Move to folder
memo notes -ex                    # Export to HTML/Markdown
```

Limitations: Cannot edit notes containing images/attachments. macOS only.
