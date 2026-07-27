# Matrix Target Formats — Reference

## The Critical Distinction: User ID vs Room ID

Matrix has two fundamentally different identifier types that are often confused:

| Identifier | Format | Purpose | Can Send To? |
|-----------|--------|---------|-------------|
| **User ID** | `@user:server.org` | Identifies a person/account | ❌ NO — not a message destination |
| **Room ID** | `!roomid:server.org` | Identifies a chat room/channel | ✅ YES — where messages are sent |

### The Pitfall

Using `@testuser1:server.org` as a `send_message` target produces:

```
Matrix API error (403): {"errcode":"M_FORBIDDEN","error":"User @sender:matrix.test not in room @target:server.org"}
```

This happens because the code treats the user ID as a room ID and attempts to send a `m.room.message` event to it. A user ID is not a valid room, so the homeserver rejects it with a 403.

## How to Send a DM on Matrix

Matrix DMs are just regular rooms with special metadata. To DM someone:

### Option 1: Use an Existing DM Room

If you already have a DM room with the user, find its room ID:

- In Element: Room Settings → Advanced → Room ID
- Via API: `GET /_matrix/client/v3/joined_rooms` then filter by `is_direct` flag

Then send to the room ID:
```json
{"target": "matrix:!existing_dm_room:server.org", "message": "hello"}
```

### Option 2: Create a DM Room via API

```bash
curl -X POST "https://homeserver/_matrix/client/v3/createRoom" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "invite": ["@targetuser:server.org"],
    "is_direct": true,
    "preset": "trusted_private_chat"
  }'
```

Returns `{"room_id": "!newroom:server.org"}` — use this for sending.

### Option 3: Via Hermes Matrix Tools (when in Matrix context)

When the agent is running in a Matrix conversation, these tools are available:

- `matrix_create_room` — create a new room
- `matrix_invite_user` — invite user to a room

Then use the created room ID with `send_message`.

## Target Format Summary

| What you want | Target format | Notes |
|--------------|---------------|-------|
| Send to a public room | `matrix:!roomid:server.org` | Room ID from room settings |
| Send to a room alias | ❌ **Not supported directly** | Must resolve alias to room ID first (see below) |
| Send to a DM (existing) | `matrix:!dm_room_id:server.org` | Must already exist |
| Send to a user (new DM) | Not directly supported | Create DM room first, then send to room ID |
| React to a message | `matrix:!roomid:server.org` + `message_id` + `emoji` | Event ID as message_id |

## Resolving Room Aliases to Room IDs

Matrix rooms have two identifiers:
- **Room Alias** (`#name:server.org`) — human-readable, can change
- **Room ID** (`!roomid:server.org`) — permanent, required for API calls

The `send_message` tool only accepts **Room IDs**. If you have an alias like `#room01:matrix.test`, resolve it first:

### Via Matrix API

```bash
curl -X GET "http://localhost:8008/_matrix/client/v3/directory/room/%23room01%3Amatrix.test" \
  -H "Authorization: Bearer $MATRIX_ACCESS_TOKEN"
```

Response:
```json
{"room_id": "!<matrix-room-id>:matrix.test", "servers": ["matrix.test"]}
```

Then use the resolved room ID:
```json
{"target": "matrix:!<matrix-room-id>:matrix.test", "message": "hello"}
```

### Via Python (aiohttp)

```python
import aiohttp

async def resolve_alias(homeserver, token, alias):
    encoded = alias.replace("#", "%23").replace(":", "%3A")
    url = f"{homeserver}/_matrix/client/v3/directory/room/{encoded}"
    headers = {"Authorization": f"Bearer {token}"}
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers) as resp:
            if resp.status == 200:
                data = await resp.json()
                return data["room_id"]  # "!xxx:server.org"
            else:
                raise Exception(f"Failed to resolve: {await resp.text()}")
```

### Common Error: Alias Used Directly

```json
{"target": "matrix:#room01:matrix.test", "message": "hello"}
```

Result:
```
Could not resolve '#room01:matrix.test' on matrix. Use send_message(action='list') to see available targets.
```

**Fix:** Resolve the alias to a room ID first, then use the room ID in the target.

## Creating Rooms and Inviting Users on Matrix

When you need to create a new room and invite users (e.g., starting a new group chat or DM):

### Step 1: Create Room via Matrix API

```bash
curl -X POST "http://localhost:8008/_matrix/client/v3/createRoom" \
  -H "Authorization: Bearer $MATRI...EN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Room Name",
    "topic": "Room topic",
    "invite": ["@user1:matrix.test", "@user2:matrix.test"],
    "preset": "private_chat",
    "is_direct": false
  }'
```

**Response:**
```json
{"room_id": "!gLsxhSdtfSNwuQCUkH:matrix.test"}
```

**Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Room display name |
| `topic` | string | Room topic/description |
| `invite` | array | List of user IDs to invite on creation |
| `preset` | string | `private_chat`, `public_chat`, or `trusted_private_chat` |
| `is_direct` | boolean | `true` for DM rooms (affects UI in clients) |

### Step 2: Invite Additional Users (if not invited at creation)

```bash
curl -X POST "http://localhost:8008/_matrix/client/v3/rooms/%21ROOM_ID%3Amatrix.test/invite" \
  -H "Authorization: Bearer $MATRI...EN" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "@user1:matrix.test"}'
```

### Step 3: Set Room Alias (optional, for discoverability)

```bash
# Create alias → room mapping
curl -X PUT "http://localhost:8008/_matrix/client/v3/directory/room/%23my-room%3Amatrix.test" \
  -H "Authorization: Bearer $MATRI...EN" \
  -H "Content-Type: application/json" \
  -d '{"room_id": "!ROOM_ID:matrix.test"}'

# Set canonical alias in room state
curl -X PUT "http://localhost:8008/_matrix/client/v3/rooms/%21ROOM_ID%3Amatrix.test/state/m.room.canonical_alias" \
  -H "Authorization: Bearer $MATRI...EN" \
  -H "Content-Type: application/json" \
  -d '{"alias": "#my-room:matrix.test"}'
```

### Step 4: Send Message via `send_message`

```json
{
  "action": "send",
  "target": "matrix:!gLsxhSdtfSNwuQCUkH:matrix.test",
  "message": "Hello everyone!"
}
```

### Complete Python Example

See `scripts/matrix_room_manager.py` for a reusable script that wraps all four steps.

## Error Reference

| Error | Meaning | Fix |
|-------|---------|-----|
| `M_FORBIDDEN` (403) | Not in room / no permission | Join room first, or check access token |
| `M_UNKNOWN_ROOM` (404) | Room doesn't exist | Verify room ID format |
| `M_UNRECOGNIZED` (404) | Invalid endpoint | Check homeserver URL |
| `M_MISSING_TOKEN` (401) | No auth token | Set `MATRIX_ACCESS_TOKEN` |
| `M_BAD_ALIAS` (400) | Alias doesn't point to room | Create alias mapping first |
| `M_UNKNOWN_TOKEN` (401) | Invalid token | Check token value (not truncated) |

## Configuration Checklist

```yaml
matrix:
  homeserver: "https://matrix.example.com"   # Required
  access_token: "syt_xxxxxxxxxxxxxxxx"          # Required
  user_id: "@bot:matrix.example.com"           # Optional, for identity
```

Or environment variables:
```bash
export MATRIX_HOMESERVER="https://matrix.example.com"
export MATRIX_ACCESS_TOKEN="syt_..."
```

### Gateway Setup (for `send_message` tool)

For the `send_message` tool to route through the Gateway (enabling media support, reactions, and platform-specific features), additional config is required:

**Step 1: Enable Matrix platform in `config.yaml`**
```bash
hermes config set platforms.matrix.enabled true
```

This adds:
```yaml
platforms:
  matrix:
    enabled: true
```

**Step 2: Restart Gateway**
```bash
hermes gateway restart
```

**Step 3: Verify via logs (NOT `hermes status`)**
```bash
hermes logs | grep -i "matrix"
```

Expected:
```
✓ matrix connected
Matrix: using access token for @bot:matrix.example.com
Matrix: initial sync complete, joined N rooms
```

**Important:** `hermes status` does NOT list Matrix under "Messaging Platforms" even when successfully connected. Always verify via logs.

**Step 4: Use `send_message` with room ID**
```json
{"target": "matrix:!roomid:server.org", "message": "Hello"}
```
