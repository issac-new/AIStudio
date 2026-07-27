# iMessage / SMS

Use `imsg` CLI to send/receive iMessages and SMS via macOS Messages.app.

```bash
# Install
brew install steipete/tap/imsg

# List Chats
imsg chats --limit 10 --json

# View History
imsg history --chat-id 1 --limit 20 --json
imsg history --chat-id 1 --limit 20 --attachments --json

# Send Messages
imsg send --to "+14155551212" --text "Hello!"
imsg send --to "+14155551212" --text "Check this" --file /path/image.jpg

# Force service
imsg send --to "+14155551212" --text "Hi" --service imessage
imsg send --to "+14155551212" --text "Hi" --service sms
# --service auto (default): let Messages.app decide

# Watch for New Messages
imsg watch --chat-id 1 --attachments
```

Rules:
1. Always confirm recipient and message content before sending
2. Never send to unknown numbers without explicit approval
3. Verify file paths exist before attaching
