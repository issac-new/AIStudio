# send_message Tool — Key Source Excerpts

## Matrix Send Implementation

Two code paths handle Matrix delivery in `tools/send_message_tool.py`:

### Path 1: Direct HTTP API (`_send_matrix`)

Used when no gateway adapter is running. Direct Client-Server API call.

```python
# Line 1493-1534
async def _send_matrix(token, extra, chat_id, message):
    homeserver = (extra.get("homeserver") or os.getenv("MATRIX_HOMESERVER", "")).rstrip("/")
    token = token or os.getenv("MATRIX_ACCESS_TOKEN", "")
    if not homeserver or not token:
        return {"error": "Matrix not configured (MATRIX_HOMESERVER, MATRIX_ACCESS_TOKEN required)"}

    txn_id = f"hermes_{int(time.time() * 1000)}_{os.urandom(4).hex()}"
    encoded_room = quote(chat_id, safe="")
    url = f"{homeserver}/_matrix/client/v3/rooms/{encoded_room}/send/m.room.message/{txn_id}"

    payload = {"msgtype": "m.text", "body": message}
    # Markdown → HTML conversion for rich rendering
    try:
        import markdown as _md
        html = _md.markdown(message, extensions=["fenced_code", "tables"])
        html = re.sub(r"<h[1-6]>(.*?)</h[1-6]>", r"<strong>\1</strong>", html)
        payload["format"] = "org.matrix.custom.html"
        payload["formatted_body"] = html
    except ImportError:
        pass

    # PUT request to Matrix API
    async with aiohttp.ClientSession(...) as session:
        async with session.put(url, headers=headers, json=payload) as resp:
            if resp.status not in {200, 201}:
                body = await resp.text()
                return _error(f"Matrix API error ({resp.status}): {body}")
```

**Key insight:** The `chat_id` is URL-encoded and placed directly in the API path as the room ID. If you pass a user ID (`@user:server.org`), it becomes part of the room path, which is invalid.

### Path 2: Via Gateway Adapter (`_send_matrix_via_adapter`)

Used when the Hermes Gateway is running with a Matrix connection. Supports media uploads.

```python
# Line 1537-1589
async def _send_matrix_via_adapter(pconfig, chat_id, message, media_files=None, thread_id=None):
    from gateway.platforms.matrix import MatrixAdapter
    adapter = MatrixAdapter(pconfig)
    connected = await adapter.connect()
    # ... sends via adapter.send() / send_image_file() / send_video() / etc.
```

**Trigger condition:** `platform == Platform.MATRIX and media_files` (line 808)

## Platform Selection Logic

```python
# Line 888-910
if platform == Platform.MATRIX:
    result = await _send_matrix(pconfig.token, pconfig.extra, chat_id, chunk)
```

The platform is determined by parsing the `target` parameter:
- `matrix:` prefix → `Platform.MATRIX`
- Everything after `:` becomes the `chat_id` passed to the send function

## Target Parsing

```python
# From _parse_target_ref or similar logic
target = "matrix:!roomid:server.org"
parts = target.split(":", 1)  # ["matrix", "!roomid:server.org"]
platform_name = parts[0]       # "matrix"
chat_id = parts[1]             # "!roomid:server.org"
```

## Media Support Gate

```python
# Line 807-822
if platform == Platform.MATRIX and media_files:
    # Uses _send_matrix_via_adapter with native media upload
    result = await _send_matrix_via_adapter(pconfig, chat_id, chunk, media_files=media_files, thread_id=thread_id)
else:
    # Falls through to plain text path
    result = await _send_matrix(pconfig.token, pconfig.extra, chat_id, chunk)
```

Without media, even if the gateway is running, it uses the direct HTTP path.
