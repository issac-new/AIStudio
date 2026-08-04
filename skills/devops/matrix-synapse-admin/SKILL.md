---
name: matrix-synapse-admin
description: >-
  Manage a self-hosted Matrix Synapse server: change user displaynames, rename
  users (create new + migrate rooms + update config + deactivate old), register
  admin accounts, promote/deactivate users, and navigate the Admin API (V1 vs V2
  endpoint differences). Use when modifying Matrix user profiles, creating admin
  tokens, renaming Matrix accounts, or troubleshooting Synapse admin endpoints.
version: 2.0.0
platforms: [macos]
metadata:
  hermes:
    tags: [matrix, synapse, admin-api, user-management, displayname, rename, docker]
    related_skills: [gateway-platform-management, hermes-messaging]
---

# Matrix Synapse Server Administration

Operational knowledge for managing users on a self-hosted Synapse homeserver
running in Docker. Covers the Admin API endpoint landscape (which work, which
don't), the three access tiers for modifying user profiles, the full user
rename workflow (MXIDs are immutable — must create new + migrate), and the
temp-admin registration pattern.

## When to Use

- Change a Matrix user's displayname (own account or another user's)
- **Rename a Matrix user** (change user_id — requires full migration)
- Register a new admin user on Synapse
- Promote/deactivate users
- Troubleshoot "M_UNRECOGNIZED" errors from Synapse admin endpoints
- Migrate a bot account to a new MXID while preserving room memberships
- Any Synapse server-side user management task (not Hermes gateway config)

## Environment

- Synapse in Docker: `matrixdotorg/synapse:latest`, port 8008, container `matrix-synapse`.
- `homeserver.yaml`: `/data/homeserver.yaml` inside container
  (`~/matrix-docker/synapse-data/homeserver.yaml` on host).
- `registration_shared_secret` in `homeserver.yaml`.
- Hermes bot account token in `~/.hermes/shared/.env.common`:
  `MATRIX_ACCESS_TOKEN` (for `@swarm:matrix.test` — renamed from `@testuser3`).
- Permanent admin account: `@sysadmin:matrix.test` (password `${PASSWORD}`).
- Element Web on port 8081 (`matrix-element` container).

## Key Concept: Matrix User IDs (MXIDs) are IMMUTABLE

Synapse does NOT allow renaming a user's localpart. The `@testuser3:matrix.test`
ID is permanently baked into the account at creation time. To "rename" a user
you must perform a full migration:

1. Register a NEW user with the desired localpart
2. Set the displayname on the new account
3. Have the new user join all rooms the old user was in
4. Update ALL config/env references to the new user's token
5. Deactivate the old account

See "Workflow: Full User Rename" below for the complete step-by-step.

## Access Tiers for User Profile Changes

### Tier 1 — User changes their OWN displayname (has their token)

Standard Client-Server API. Works for the account that owns the token.

```bash
curl -s -X PUT "http://localhost:8008/_matrix/client/v3/profile/%40swarm%3Amatrix.test/displayname" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"displayname":"Swarm"}'
# → {}  (empty success)
```

Verify via the **public** profile endpoint (no auth needed):

```bash
curl -s "http://localhost:8008/_matrix/client/v3/profile/%40swarm%3Amatrix.test/displayname"
# → {"displayname":"Swarm"}
```

**Cannot** change another user's displayname with this endpoint.

### Tier 2 — Admin changes ANOTHER user's displayname (have admin token)

Use the **Synapse Admin V2** endpoint. This is the ONLY admin endpoint that
supports displayname updates.

```bash
curl -s -X PUT "http://localhost:8008/_synapse/admin/v2/users/%40cmder%3Amatrix.test" \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"displayname":"Cmder"}'
# → {"name":"@cmder:matrix.test", ..., "displayname":"Cmder", ...}
```

Query user info (read-only):

```bash
curl -s "http://localhost:8008/_synapse/admin/v2/users/%40cmder%3Amatrix.test" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
# → {"name":"@cmder:matrix.test", "displayname":"Cmder", "admin":false, ...}
```

### ❌ Endpoints that do NOT work for displayname

| Endpoint | Result |
|----------|--------|
| `PUT /_synapse/admin/v1/users/{id}` | `M_UNRECOGNIZED` |
| `PUT /_synapse/admin/v1/users/{id}/displayname` | `M_UNRECOGNIZED` |
| `PUT /_synapse/admin/v1/set_displayname/{id}` | `M_UNRECOGNIZED` |

Only **V2** (`/_synapse/admin/v2/users/{id}`) supports displayname. The V1
admin API simply doesn't have this route. Don't waste time trying V1 variants.

### Tier 3 — No admin token: register a temp admin

When you only have the bot account's token (not an admin) and need to modify
a *different* user, register a temporary admin via the Synapse CLI tool
**inside the Docker container**:

```bash
# Step 1: register temp admin inside the container
docker exec matrix-synapse register_new_matrix_user \
  -u tempadmin -p 'TempPass123!' -a \
  -c /data/homeserver.yaml http://localhost:8008
# → Sending registration request... Success!

# Step 2: login to get access token
curl -s -X POST "http://localhost:8008/_matrix/client/v3/login" \
  -H "Content-Type: application/json" \
  -d '{"type":"m.login.password","user":"tempadmin","password":"TempPass123!"}'
# → {"access_token":"syt_...", "user_id":"@tempadmin:matrix.test", ...}

# Step 3: use the admin token for Tier 2 operations (see above)
```

#### Pitfall: HMAC registration from OUTSIDE the container fails

The `registration_shared_secret`-based HMAC registration
(`POST /_synapse/admin/v1/register` with a computed `mac` field) **fails
with `M_UNKNOWN: HMAC incorrect`** when run from the host — even when the
secret is read directly from `homeserver.yaml` and the HMAC is computed
exactly per the Synapse docs.

Root cause is likely a secret-encoding mismatch between host-side Python
and Synapse's internal computation.

**Working alternative:** run `register_new_matrix_user` inside the
container. It handles the HMAC internally and always succeeds.

#### Promote existing user to admin

```bash
curl -s -X PUT "http://localhost:8008/_synapse/admin/v1/users/%40tempadmin%3Amatrix.test/admin" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"admin":true}'
# → {}
```

#### Cleanup: deactivate temp admin

```bash
curl -s -X POST "http://localhost:8008/_synapse/admin/v1/deactivate/%40tempadmin%3Amatrix.test" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{}'
# → {"id_server_unbind_result":"success"}
```

#### ⚠️ Pitfall: Deactivating your ONLY admin account

If you deactivate the admin account whose token you're using, ALL subsequent
admin API calls will fail with `M_UNKNOWN_TOKEN: Invalid access token passed.`
This happened in practice: a temp admin was deactivated, then the replacement
admin was accidentally deactivated too, requiring a third admin registration.

**Rule**: Always keep at least one active admin account until ALL operations
are complete. Register a PERMANENT admin (e.g. `sysadmin`) for ongoing
maintenance — don't deactivate your only admin.

## Admin API: User Impersonation (get token for any user)

When you need a specific user to perform actions (e.g., invite people to rooms)
but don't have their password or token, the admin can issue a login token:

```bash
curl -s -X POST "http://localhost:8008/_synapse/admin/v1/users/%40testuser1%3Amatrix.test/login" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" -d '{}'
# → {"access_token":"syt_..."} — use this token to act as that user
```

This is essential for the room migration step in the full rename workflow
(see below) — old users need to invite new users to their private rooms.

## Admin API: Query User's Joined Rooms

```bash
curl -s "http://localhost:8008/_synapse/admin/v1/users/%40testuser3%3Amatrix.test/joined_rooms" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
# → {"joined_rooms":["!abc:matrix.test", ...], "total":4}
```

## Admin API: List All Users

```bash
curl -s "http://localhost:8008/_synapse/admin/v2/users?from=0&limit=50" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
# → {"users":[{"name":"@swarm:matrix.test","admin":true,"deactivated":false,...}, ...]}
```

## Workflow: Change displayname only

1. **Check if you have admin access** — try `GET /_synapse/admin/v2/users/{id}`.
   If 403, you need Tier 3.
2. **For your own bot account** (Tier 1): use `PUT /_matrix/client/v3/profile/{id}/displayname`
   with the bot's own token.
3. **For other users** (Tier 2 or 3):
   - If you have an admin token: `PUT /_synapse/admin/v2/users/{id}` with `{"displayname":"..."}`
   - If no admin token: register temp admin (Tier 3), then use Tier 2.
4. **Verify** both via the public profile endpoint (no auth): `GET /_matrix/client/v3/profile/{id}/displayname`
5. **Cleanup** temp admin if created.

## Workflow: Full User Rename (user_id + displayname)

Since MXIDs are immutable, "renaming" means creating a new user and migrating
everything over. See `references/synapse-user-rename.md` for the complete
session transcript with all curl commands.

### Step 1: Register new users
```bash
docker exec matrix-synapse register_new_matrix_user \
  -u swarm -p 'SwarmPass123!' -a \
  -c /data/homeserver.yaml http://localhost:8008
```

### Step 2: Login to get access tokens
```bash
curl -s -X POST "http://localhost:8008/_matrix/client/v3/login" \
  -H "Content-Type: application/json" \
  -d '{"type":"m.login.password","user":"swarm","password":"SwarmPass123!"}'
```

### Step 3: Set displaynames
Use Tier 1 (each user sets their own) or Tier 2 (admin sets for all).

### Step 4: Get old user's room memberships
```bash
curl -s "http://localhost:8008/_synapse/admin/v1/users/%40OLDUSER%3Amatrix.test/joined_rooms" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

### Step 5: Migrate room memberships
Rooms may be invite-only. Three strategies (try in order):

**Strategy A — Direct join** (public rooms):
```bash
curl -s -X POST "http://localhost:8008/_matrix/client/v3/join/%21roomid%3Amatrix.test" \
  -H "Authorization: Bearer <NEW_USER_TOKEN>" \
  -H "Content-Type: application/json" -d '{}'
```

**Strategy B — Invite then join** (private rooms — most common):
```bash
# Old user invites new user (use old user's token or admin impersonation)
curl -s -X POST "http://localhost:8008/_matrix/client/v3/rooms/%21roomid%3Amatrix.test/invite" \
  -H "Authorization: Bearer <OLD_USER_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"@newuser:matrix.test"}'

# New user accepts
curl -s -X POST "http://localhost:8008/_matrix/client/v3/join/%21roomid%3Amatrix.test" \
  -H "Authorization: Bearer <NEW_USER_TOKEN>" \
  -H "Content-Type: application/json" -d '{}'
```

**Strategy C — Admin force-join** (requires admin already IN the room):
```bash
curl -s -X POST "http://localhost:8008/_synapse/admin/v1/join/%21roomid%3Amatrix.test" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"@newuser:matrix.test"}'
```
Note: if admin is NOT in the room, returns 403. Use Strategy B instead.

### Step 6: Get old user's token via admin impersonation (if needed)
```bash
curl -s -X POST "http://localhost:8008/_synapse/admin/v1/users/%40olduser%3Amatrix.test/login" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" -d '{}'
# → {"access_token":"syt_..."} — use to send invites as old user
```

### Step 7: Update ALL Hermes config references
```bash
# Find all affected .env files
grep -rl "olduser\|OLD_TOKEN" $HOME/.hermes/.env $HOME/.hermes/profiles/*/.env

# Batch replace (macOS sed)
OLD_TOKEN="syt_old..."
NEW_TOKEN="syt_new..."
for f in $HOME/.hermes/.env $HOME/.hermes/profiles/*/.env; do
    if grep -q "olduser\|${OLD_TOKEN}" "$f" 2>/dev/null; then
        sed -i '' "s|${OLD_TOKEN}|${NEW_TOKEN}|g; s|@olduser:matrix.test|@newuser:matrix.test|g" "$f"
    fi
done
```

Also update `~/.hermes/shared/.env.common`:
```
MATRIX_ACCESS_TOKEN=<new_token>
MATRIX_USER_ID=@newuser:matrix.test
```

### Step 8: Deactivate old accounts
```bash
curl -s -X POST "http://localhost:8008/_synapse/admin/v1/deactivate/%40olduser%3Amatrix.test" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" -d '{}'
```

### Step 9: Restart gateway
The Hermes gateway (managed by SwarmStudio) must be restarted to pick up the
new `.env` values. Cannot restart from inside the gateway process — must
restart from SwarmStudio UI or a separate shell with `hermes gateway restart`.

### Verification
```bash
# Verify new token works
curl -s "http://localhost:8008/_matrix/client/v3/account/whoami" \
  -H "Authorization: Bearer <NEW_TOKEN>"
# → {"user_id":"@newuser:matrix.test", ...}

# List all users to confirm old=deactivated, new=active
curl -s "http://localhost:8008/_synapse/admin/v2/users?from=0&limit=50" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

## URL-encoding reminder

Matrix user IDs contain `@` and `:`, which must be percent-encoded in URL
paths:

| Raw | Encoded |
|-----|---------|
| `@swarm:matrix.test` | `%40swarm%3Amatrix.test` |
| `!roomid:matrix.test` | `%21roomid%3Amatrix.test` |

Forgetting this gives 404 / `M_UNRECOGNIZED` errors that look like the
endpoint doesn't exist.

## References

- `references/synapse-user-management.md` — Session 1 transcript: displayname-only
  change, failed HMAC attempts, V1 vs V2 endpoint trial-and-error.
- `references/synapse-user-rename.md` — Session 2 transcript: full user rename
  (MXID migration), room membership transfer, admin impersonation, .env batch
  update across 16 profiles, deactivation chain pitfalls.
- See also `hermes-messaging` skill (productivity category) for Matrix message
  sending, room creation, and the `send_message` tool — that skill covers the
  client side; this skill covers the server admin side.

## Related Skills

- `gateway-platform-management` — adding messaging platforms to Hermes gateway
  (WeChat, Telegram, etc.), API Server routing. Complements this skill: that's
  Hermes-side config, this is Synapse-side admin.
- `hermes-messaging` — Matrix `send_message`, room IDs vs user IDs, alias
  resolution. Client-side Matrix operations.
- `gateway-crash-loop-troubleshooting` — Hermes gateway issues (not Synapse).
