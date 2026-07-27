# Find My (Apple)

Track Apple devices and AirTags via AppleScript + screenshot + vision_analyze. No CLI available.

```bash
# Install peekaboo for better UI automation (optional)
brew install steipete/tap/peekaboo

# Open FindMy
osascript -e 'tell application "FindMy" to activate'
sleep 3

# Screenshot
screencapture -w -o /tmp/findmy.png
# Then: vision_analyze(image_url="/tmp/findmy.png", question="What locations?")

# Switch tabs via AppleScript
osascript -e 'tell application "System Events" to tell process "FindMy" to click button "Devices" of toolbar 1 of window 1'
osascript -e 'tell application "System Events" to tell process "FindMy" to click button "Items" of toolbar 1 of window 1'

# With Peekaboo
peekaboo see --app "FindMy" --annotate --path /tmp/findmy-ui.png
peekaboo click --on B3 --app "FindMy"
peekaboo image --app "FindMy" --path /tmp/findmy-detail.png
```

Limitations:
- No CLI or API — must use UI automation
- AirTags only update location while page is displayed
- Screen Recording permission required
- AppleScript may break across macOS versions
