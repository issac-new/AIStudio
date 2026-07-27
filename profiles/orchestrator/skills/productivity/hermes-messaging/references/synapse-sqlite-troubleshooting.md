# Synapse SQLite Troubleshooting

## Symptom: "Problem storing device" / "disk I/O error" on Login

When calling `POST /_matrix/client/v3/login`, Synapse returns:

```json
{
    "errcode": "M_UNKNOWN",
    "error": "Problem storing device."
}
```

The logs show:

```
WARNING - [TXN OPERROR] {store_device-xxxxx} disk I/O error 1/5
...
ERROR - store_device ... failed: disk I/O error
```

### Root Cause

Synapse's SQLite device store hits a concurrency issue (spurious SQLITE_IOERR or SQLITE_BUSY). Despite the error, the database itself is fine — the devices and access_tokens tables remain readable.

### Quick Fix: Read Tokens Directly from SQLite

Since existing valid access tokens are stored in the database, extract them directly:

```bash
# The database is at the bind-mounted path
DB_PATH="~/matrix-docker/synapse-data/homeserver.db"

# Get the latest token for a user
python3 -c "
import sqlite3
conn = sqlite3.connect('$DB_PATH')
c = conn.cursor()
c.execute('SELECT token, device_id FROM access_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 1', ('@user:matrix.test',))
row = c.fetchone()
print(f'Token: {row[0]}')
print(f'Device: {row[1]}')
conn.close()
"
```

### Verify Token

```bash
curl -s "http://localhost:8008/_matrix/client/v3/account/whoami" \
  -H "Authorization: Bearer <token>"
# Returns: {"user_id":"@user:matrix.test","is_guest":false,"device_id":"..."}
```

### Docker Container Details

```yaml
Container: matrix-synapse
Image: matrixdotorg/synapse:latest
Database: SQLite at /data/homeserver.db
Mount: ~/matrix-docker/synapse-data:/data (rw)
```

### Long-term Fixes

1. **Switch to PostgreSQL** — Synapse performs better with PostgreSQL; SQLite device-store I/O errors are a known edge case.
2. **Check disk permissions** — Ensure the `homeserver.db` file is owned by uid 991 (Synapse user) and the mount mode is `rw`.
3. **Restart the container** — `docker restart matrix-synapse` occasionally clears transient SQLite locks.
