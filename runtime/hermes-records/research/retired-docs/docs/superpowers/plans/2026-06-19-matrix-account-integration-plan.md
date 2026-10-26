# Matrix Account Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Hermes Web UI Settings "Current Account" and "Account Management" with the Matrix login system, enabling unified Matrix-backed user identity and admin user management through Matrix homeserver admin APIs.

**Architecture:** Progressive migration extending the existing Hermes `users` SQLite table with Matrix references (`matrix_user_id`, `matrix_display_name`, etc.). Matrix login becomes the primary authentication path: browser uses `matrix-js-sdk` to authenticate, then calls a new Hermes backend endpoint `/api/auth/matrix-login` which validates the Matrix token, resolves/creates a Hermes user record, and issues a Hermes JWT. Account Management fetches users from the Matrix homeserver admin API and merges with Hermes local metadata (roles, profiles, status).

**Tech Stack:** Vue 3 + TypeScript + Vite + Naive UI (frontend), Koa 2 + better-sqlite3 + matrix-js-sdk (backend).

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/server/src/services/matrix-admin-service.ts` | Encapsulates all Matrix homeserver admin API calls (validate token, get user info, list users, create/delete/deactivate/reset password). |
| `packages/server/src/controllers/hermes/matrix-admin.ts` | Thin proxy controller for Matrix admin operations, delegates to `matrix-admin-service`. |
| `packages/client/src/stores/hermes/auth.ts` | New Pinia store for unified auth state: current user (with Matrix identity), Hermes + Matrix tokens, login/logout actions. |

### Modified Files

| File | Responsibility |
|------|---------------|
| `packages/server/src/db/hermes/schemas.ts` | Extend `USERS_SCHEMA` with Matrix columns (`matrix_user_id`, `matrix_display_name`, `matrix_avatar_url`, `matrix_homeserver_url`, `auth_source`). |
| `packages/server/src/db/hermes/users-store.ts` | Add `findByMatrixUserId`, `createFromMatrix`, `syncMatrixMetadata`, `updateMatrixUserMetadata`. Update `UserRecord` interface. |
| `packages/server/src/controllers/auth.ts` | Add `matrixLogin`, `listMatrixUsers`, `createMatrixUser`, `updateMatrixUser`, `deleteMatrixUser`, `deactivateMatrixUser`, `resetMatrixUserPassword`. Remove `matrix-bypass-token` handling from `currentUser` and `getMyAvatar`. |
| `packages/server/src/middleware/user-auth.ts` | Remove `matrix-bypass-token` hardcoded path. Optionally add Matrix accessToken validation as a secondary auth method. Update `signUserJwt`/`issueUserJwt` to accept extended user data. |
| `packages/server/src/routes/auth.ts` | Register new Matrix login and Matrix user management routes. |
| `packages/client/src/api/auth.ts` | Add `matrixLogin` (Hermes backend), `fetchMatrixUsers`, `createMatrixUser`, `updateMatrixUser`, `deleteMatrixUser`, `deactivateMatrixUser`, `resetMatrixUserPassword`. Update `CurrentUser` interface with Matrix fields. |
| `packages/client/src/api/client.ts` | Remove `MATRIX_BYPASS_TOKEN` and `isMatrixBypassMode`. Update `getStoredUserRole` to handle new JWT payload. |
| `packages/client/src/views/LoginView.vue` | Redesign to dual-tab login: Matrix Login (homeserver/username/password) and Local Login (preserved). Matrix flow: `matrix-js-sdk` login → `POST /api/auth/matrix-login` → store both tokens. |
| `packages/client/src/components/hermes/settings/AccountSettings.vue` | Add Matrix Identity section (avatar, userId, display name, homeserver, role badge, auth source). Keep Hermes config (profiles) and security (change password via Matrix, locked IPs). |
| `packages/client/src/components/hermes/settings/UserManagementSettings.vue` | Switch data source to `fetchMatrixUsers`. Update table columns to show Matrix identity. Update create/edit modals for Matrix user fields. |
| `packages/client/src/router/index.ts` | Update `hasApiKey` check; no structural changes needed if auth store manages token. |

---

## Phase 1: Backend Foundation

### Task 1: Extend Users Table Schema

**Files:**
- Modify: `packages/server/src/db/hermes/schemas.ts`

- [ ] **Step 1: Add Matrix columns to USERS_SCHEMA**

```typescript
export const USERS_SCHEMA: Record<string, string> = {
  id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
  username: 'TEXT NOT NULL UNIQUE',
  password_hash: 'TEXT NOT NULL',
  role: "TEXT NOT NULL DEFAULT 'admin'",
  status: "TEXT NOT NULL DEFAULT 'active'",
  created_at: 'INTEGER NOT NULL',
  updated_at: 'INTEGER NOT NULL',
  last_login_at: 'INTEGER',
  avatar: "TEXT NOT NULL DEFAULT ''",
  matrix_user_id: 'TEXT UNIQUE',
  matrix_display_name: 'TEXT',
  matrix_avatar_url: 'TEXT',
  matrix_homeserver_url: 'TEXT',
  auth_source: "TEXT NOT NULL DEFAULT 'local'",
}
```

- [ ] **Step 2: Verify `syncTable` can add these columns safely**

The `canAddColumnToExistingTable` function checks:
- No `PRIMARY KEY` in column def → PASS
- No `NOT NULL` without `DEFAULT` → PASS (all new columns have `DEFAULT` or are nullable)

All five new columns can be safely added to existing tables.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/db/hermes/schemas.ts
git commit -m "feat(db): add Matrix columns to users schema"
```

---

### Task 2: Update Users Store with Matrix Methods

**Files:**
- Modify: `packages/server/src/db/hermes/users-store.ts`

- [ ] **Step 1: Update UserRecord interface**

```typescript
export interface UserRecord {
  id: number
  username: string
  password_hash: string
  role: UserRole
  status: UserStatus
  created_at: number
  updated_at: number
  last_login_at: number | null
  avatar: string
  matrix_user_id: string | null
  matrix_display_name: string | null
  matrix_avatar_url: string | null
  matrix_homeserver_url: string | null
  auth_source: 'local' | 'matrix'
}
```

- [ ] **Step 2: Add findByMatrixUserId**

```typescript
export function findByMatrixUserId(matrixUserId: string): UserRecord | null {
  const db = getDb()
  if (!db) return null
  const row = db.prepare(`SELECT * FROM ${USERS_TABLE} WHERE matrix_user_id = ?`).get(matrixUserId) as UserRecord | undefined
  return row || null
}
```

- [ ] **Step 3: Add createFromMatrix**

```typescript
export function createFromMatrix(data: {
  matrixUserId: string
  username: string
  displayName: string
  avatarUrl: string
  homeserverUrl: string
  role: UserRole
}): UserRecord | null {
  const db = getDb()
  if (!db) return null
  const now = Date.now()
  db.prepare(
    `INSERT INTO ${USERS_TABLE} (username, password_hash, role, status, created_at, updated_at, matrix_user_id, matrix_display_name, matrix_avatar_url, matrix_homeserver_url, auth_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.username,
    '', // No local password for Matrix users
    data.role,
    'active',
    now,
    now,
    data.matrixUserId,
    data.displayName,
    data.avatarUrl,
    data.homeserverUrl,
    'matrix'
  )
  return findByMatrixUserId(data.matrixUserId)
}
```

- [ ] **Step 4: Add syncMatrixMetadata**

```typescript
export function syncMatrixMetadata(
  userId: UserId,
  data: {
    displayName?: string
    avatarUrl?: string
    lastLoginAt?: number
  }
): boolean {
  const db = getDb()
  if (!db) return false
  const id = normalizeUserId(userId)
  if (!id) return false
  const sets: string[] = []
  const values: (string | number)[] = []
  if (data.displayName !== undefined) {
    sets.push('matrix_display_name = ?')
    values.push(data.displayName)
  }
  if (data.avatarUrl !== undefined) {
    sets.push('matrix_avatar_url = ?')
    values.push(data.avatarUrl)
  }
  if (data.lastLoginAt !== undefined) {
    sets.push('last_login_at = ?')
    values.push(data.lastLoginAt)
  }
  if (sets.length === 0) return false
  sets.push('updated_at = ?')
  values.push(Date.now())
  values.push(id)
  const result = db.prepare(`UPDATE ${USERS_TABLE} SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  return result.changes > 0
}
```

- [ ] **Step 5: Add updateMatrixUserMetadata**

```typescript
export function updateMatrixUserMetadata(
  matrixUserId: string,
  data: {
    role?: UserRole
    status?: UserStatus
  }
): boolean {
  const db = getDb()
  if (!db) return false
  const sets: string[] = []
  const values: (string | number)[] = []
  if (data.role !== undefined) {
    sets.push('role = ?')
    values.push(data.role)
  }
  if (data.status !== undefined) {
    sets.push('status = ?')
    values.push(data.status)
  }
  if (sets.length === 0) return false
  sets.push('updated_at = ?')
  values.push(Date.now())
  values.push(matrixUserId)
  const result = db.prepare(`UPDATE ${USERS_TABLE} SET ${sets.join(', ')} WHERE matrix_user_id = ?`).run(...values)
  return result.changes > 0
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/hermes/users-store.ts
git commit -m "feat(db): add Matrix user CRUD operations to users store"
```

---

### Task 3: Create Matrix Admin Service

**Files:**
- Create: `packages/server/src/services/matrix-admin-service.ts`

- [ ] **Step 1: Write the service file**

```typescript
import fetch from 'node-fetch'

export interface MatrixUserInfo {
  userId: string
  displayName: string
  avatarUrl: string
  isAdmin: boolean
  deactivated: boolean
}

export interface MatrixUserListItem {
  name: string
  displayname: string | null
  avatar_url: string | null
  is_admin: boolean
  deactivated: boolean
}

export interface MatrixUserListResult {
  users: MatrixUserListItem[]
  total: number
}

export async function validateMatrixToken(
  accessToken: string,
  homeserverUrl: string
): Promise<{ userId: string; deviceId: string } | null> {
  try {
    const res = await fetch(`${homeserverUrl}/_matrix/client/v3/account/whoami`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { user_id: string; device_id?: string }
    return { userId: data.user_id, deviceId: data.device_id || '' }
  } catch {
    return null
  }
}

export async function getMatrixUserInfo(
  userId: string,
  adminToken: string,
  homeserverUrl: string
): Promise<MatrixUserInfo | null> {
  try {
    // Synapse-specific admin endpoint
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v1/users/${encodeURIComponent(userId)}/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const isAdmin = res.ok ? (await res.json() as { admin: boolean }).admin : false

    // Get profile info (public endpoint, but use admin token if available)
    const profileRes = await fetch(`${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/displayname`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const displayName = profileRes.ok ? (await profileRes.json() as { displayname: string }).displayname : ''

    const avatarRes = await fetch(`${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(userId)}/avatar_url`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const avatarUrl = avatarRes.ok ? (await avatarRes.json() as { avatar_url: string }).avatar_url : ''

    return { userId, displayName, avatarUrl, isAdmin, deactivated: false }
  } catch {
    return null
  }
}

export async function listMatrixUsers(
  adminToken: string,
  homeserverUrl: string,
  from: number = 0,
  limit: number = 100
): Promise<MatrixUserListResult | null> {
  try {
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v2/users?from=${from}&limit=${limit}&guests=false`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { users: MatrixUserListItem[]; total: number }
    return { users: data.users || [], total: data.total || 0 }
  } catch {
    return null
  }
}

export async function createMatrixUser(
  userId: string,
  password: string,
  adminToken: string,
  homeserverUrl: string
): Promise<boolean> {
  try {
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v1/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: userId.replace(/^@/, '').split(':')[0],
        password,
        admin: false,
        user_type: null,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function resetMatrixUserPassword(
  userId: string,
  password: string,
  adminToken: string,
  homeserverUrl: string
): Promise<boolean> {
  try {
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v1/reset_password/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ new_password: password, logout_devices: true }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function setMatrixUserActive(
  userId: string,
  active: boolean,
  adminToken: string,
  homeserverUrl: string
): Promise<boolean> {
  try {
    const endpoint = active
      ? `/_synapse/admin/v1/activate/${encodeURIComponent(userId)}`
      : `/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`
    const res = await fetch(`${homeserverUrl}${endpoint}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    return res.ok
  } catch {
    return false
  }
}

export async function deleteMatrixUser(
  userId: string,
  adminToken: string,
  homeserverUrl: string
): Promise<boolean> {
  try {
    const res = await fetch(`${homeserverUrl}/_synapse/admin/v1/deactivate/${encodeURIComponent(userId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ erase: true }),
    })
    return res.ok
  } catch {
    return false
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/services/matrix-admin-service.ts
git commit -m "feat(matrix): add Matrix admin API service"
```

---

### Task 4: Update Auth Middleware

**Files:**
- Modify: `packages/server/src/middleware/user-auth.ts`

- [ ] **Step 1: Remove matrix-bypass-token handling**

Replace lines 204-209:
```typescript
// REMOVE this block:
// Allow matrix-bypass-token for development/testing
if (token === 'matrix-bypass-token') {
  ctx.state.user = { id: 0, username: 'matrix-bypass', role: 'super_admin' as UserRole }
  await next()
  return
}
```

With nothing — the standard JWT validation will handle it. If no valid token, return 401.

- [ ] **Step 2: Update signUserJwt to include matrix_user_id**

```typescript
export function signUserJwt(
  user: Pick<UserRecord, 'id' | 'username' | 'role' | 'matrix_user_id'>,
  secret: string,
  now = Date.now(),
  expiresSeconds = DEFAULT_EXPIRES_SECONDS,
): string {
  const iat = Math.floor(now / 1000)
  const payload = {
    sub: String(user.id),
    username: user.username,
    role: user.role,
    matrix_user_id: user.matrix_user_id || null,
    type: 'access',
    aud: JWT_AUDIENCE,
    iat,
    exp: iat + expiresSeconds,
  }
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' })
  const body = base64UrlJson(payload)
  const unsigned = `${header}.${body}`
  return `${unsigned}.${sign(unsigned, secret)}`
}
```

- [ ] **Step 3: Update issueUserJwt signature**

```typescript
export async function issueUserJwt(user: Pick<UserRecord, 'id' | 'username' | 'role' | 'matrix_user_id'>): Promise<string> {
  const secret = await getJwtSecret()
  return signUserJwt(user, secret)
}
```

- [ ] **Step 4: Update toAuthenticatedUser to include matrix_user_id**

```typescript
export function toAuthenticatedUser(user: Pick<UserRecord, 'id' | 'username' | 'role' | 'matrix_user_id'>): AuthenticatedUser {
  const authenticated: AuthenticatedUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    matrix_user_id: user.matrix_user_id || undefined,
  }
  if (user.role !== 'super_admin') {
    authenticated.profiles = listUserProfiles(user.id).map(profile => profile.profile_name)
  }
  return authenticated
}
```

- [ ] **Step 5: Update AuthenticatedUser interface**

```typescript
export interface AuthenticatedUser {
  id: number
  username: string
  role: UserRole
  profiles?: string[]
  matrix_user_id?: string
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/middleware/user-auth.ts
git commit -m "feat(auth): remove matrix-bypass-token, add matrix_user_id to JWT"
```

---

### Task 5: Add Matrix Login to Auth Controller

**Files:**
- Modify: `packages/server/src/controllers/auth.ts`

- [ ] **Step 1: Add imports**

```typescript
import {
  validateMatrixToken,
  getMatrixUserInfo,
  listMatrixUsers,
  createMatrixUser as createMatrixUserOnServer,
  resetMatrixUserPassword as resetMatrixUserPasswordOnServer,
  setMatrixUserActive,
  deleteMatrixUser as deleteMatrixUserOnServer,
} from '../services/matrix-admin-service'
import {
  findByMatrixUserId,
  createFromMatrix,
  syncMatrixMetadata,
  updateMatrixUserMetadata,
} from '../db/hermes/users-store'
```

- [ ] **Step 2: Add matrixLogin function**

```typescript
/**
 * POST /api/auth/matrix-login
 * Authenticate with Matrix accessToken, find/create Hermes user, return JWT.
 */
export async function matrixLogin(ctx: Context) {
  const { matrixAccessToken, matrixUserId, deviceId, homeserverUrl } = ctx.request.body as {
    matrixAccessToken?: string
    matrixUserId?: string
    deviceId?: string
    homeserverUrl?: string
  }

  if (!matrixAccessToken || !matrixUserId || !homeserverUrl) {
    ctx.status = 400
    ctx.body = { error: 'Matrix accessToken, userId, and homeserverUrl are required' }
    return
  }

  // 1. Validate the Matrix token
  const validation = await validateMatrixToken(matrixAccessToken, homeserverUrl)
  if (!validation || validation.userId !== matrixUserId) {
    ctx.status = 401
    ctx.body = { error: 'Invalid Matrix access token' }
    return
  }

  // 2. Get user info from Matrix (including admin status)
  // Use the user's own token to check their profile; admin status requires admin token
  const matrixInfo = await getMatrixUserInfo(matrixUserId, matrixAccessToken, homeserverUrl)
  const isMatrixAdmin = matrixInfo?.isAdmin || false

  // 3. Find or create Hermes user
  let user = findByMatrixUserId(matrixUserId)
  const now = Date.now()

  if (!user) {
    const localpart = matrixUserId.replace(/^@/, '').split(':')[0]
    const role = isMatrixAdmin ? 'super_admin' : 'admin'
    user = createFromMatrix({
      matrixUserId,
      username: localpart,
      displayName: matrixInfo?.displayName || localpart,
      avatarUrl: matrixInfo?.avatarUrl || '',
      homeserverUrl,
      role,
    })
  } else {
    // Update cached metadata
    syncMatrixMetadata(user.id, {
      displayName: matrixInfo?.displayName || undefined,
      avatarUrl: matrixInfo?.avatarUrl || undefined,
      lastLoginAt: now,
    })
    user = findByMatrixUserId(matrixUserId)
  }

  if (!user) {
    ctx.status = 500
    ctx.body = { error: 'Failed to create or update user record' }
    return
  }

  // 4. Issue Hermes JWT
  try {
    const token = await issueUserJwt(user)
    ctx.body = { token, user: {
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      matrix_user_id: user.matrix_user_id,
      matrix_display_name: user.matrix_display_name,
      matrix_avatar_url: user.matrix_avatar_url,
      matrix_homeserver_url: user.matrix_homeserver_url,
      auth_source: user.auth_source,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_login_at: user.last_login_at,
    }}
  } catch (err: any) {
    ctx.status = 500
    ctx.body = { error: err?.message || 'Failed to issue login token' }
  }
}
```

- [ ] **Step 3: Remove matrix-bypass-token handling from currentUser**

Replace lines 49-65 (the matrix-bypass special case) with:
```typescript
// No special handling needed — matrix-bypass-token is removed
// All users must have a valid DB record
```

The existing code after line 65 handles regular users correctly.

- [ ] **Step 4: Remove matrix-bypass-token handling from getMyAvatar**

Replace lines 122-125 with nothing — the regular flow handles it.

- [ ] **Step 5: Add Matrix user management functions**

```typescript
// Helper: get admin token from config or current user
function getMatrixAdminToken(ctx: Context): string | null {
  // For now, use the current user's Matrix accessToken if they are admin
  // In production, this should come from server config
  // TODO: Read from Hermes config system
  return null
}

/**
 * GET /api/auth/matrix-users
 * List Matrix users merged with Hermes metadata.
 */
export async function listMatrixUsers(ctx: Context) {
  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = 'http://localhost:8008' // TODO: Get from config or user

  if (!adminToken) {
    // Fallback: return only Hermes users with matrix_user_id
    const hermesUsers = listUsers().filter(u => u.matrix_user_id)
    ctx.body = {
      users: hermesUsers.map(u => ({
        matrix_user_id: u.matrix_user_id,
        display_name: u.matrix_display_name,
        avatar_url: u.matrix_avatar_url,
        role: u.role,
        status: u.status,
        profiles: u.profiles,
        last_login_at: u.last_login_at,
        is_admin: false,
        source: 'hermes',
      })),
      total: hermesUsers.length,
    }
    return
  }

  const matrixResult = await listMatrixUsers(adminToken, homeserverUrl)
  if (!matrixResult) {
    ctx.status = 503
    ctx.body = { error: 'Failed to fetch users from Matrix homeserver' }
    return
  }

  // Merge with Hermes metadata
  const mergedUsers = matrixResult.users.map(matrixUser => {
    const hermesUser = findByMatrixUserId(matrixUser.name)
    return {
      matrix_user_id: matrixUser.name,
      display_name: matrixUser.displayname || matrixUser.name.replace(/^@/, '').split(':')[0],
      avatar_url: matrixUser.avatar_url,
      role: hermesUser?.role || (matrixUser.is_admin ? 'super_admin' : 'admin'),
      status: hermesUser?.status || (matrixUser.deactivated ? 'disabled' : 'active'),
      profiles: hermesUser ? listUserProfiles(hermesUser.id).map(p => p.profile_name) : [],
      last_login_at: hermesUser?.last_login_at || null,
      is_admin: matrixUser.is_admin,
      source: 'matrix',
    }
  })

  ctx.body = { users: mergedUsers, total: matrixResult.total }
}

/**
 * POST /api/auth/matrix-users
 * Create a Matrix user and Hermes metadata.
 */
export async function createMatrixUser(ctx: Context) {
  const body = ctx.request.body as {
    userId?: string
    password?: string
    displayName?: string
    role?: unknown
    profiles?: unknown
  }
  const userId = String(body.userId || '').trim()
  const password = String(body.password || '')
  const role = normalizeRole(body.role || 'admin')
  const profiles = normalizeProfiles(body.profiles)

  if (!userId || !password || password.length < 6 || !role) {
    ctx.status = 400
    ctx.body = { error: 'Invalid userId, password (min 6 chars), or role' }
    return
  }

  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = 'http://localhost:8008' // TODO: Config

  if (!adminToken) {
    ctx.status = 503
    ctx.body = { error: 'Matrix admin API not configured' }
    return
  }

  const created = await createMatrixUserOnServer(userId, password, adminToken, homeserverUrl)
  if (!created) {
    ctx.status = 500
    ctx.body = { error: 'Failed to create Matrix user' }
    return
  }

  // Create Hermes record
  const localpart = userId.replace(/^@/, '').split(':')[0]
  const hermesUser = createFromMatrix({
    matrixUserId: userId,
    username: localpart,
    displayName: body.displayName || localpart,
    avatarUrl: '',
    homeserverUrl,
    role,
  })

  if (profiles.length > 0 && hermesUser) {
    replaceUserProfiles(hermesUser.id, profiles, profiles[0])
  }

  ctx.status = 201
  ctx.body = { user: hermesUser }
}

/**
 * PUT /api/auth/matrix-users/:id
 * Update Matrix user (Hermes metadata + Matrix profile).
 */
export async function updateMatrixUser(ctx: Context) {
  const matrixUserId = decodeURIComponent(ctx.params.id)
  const body = ctx.request.body as {
    displayName?: string
    role?: unknown
    status?: unknown
    profiles?: unknown
  }

  const role = body.role == null ? undefined : normalizeRole(body.role)
  const status = body.status == null ? undefined : normalizeStatus(body.status)
  const profiles = body.profiles == null ? undefined : normalizeProfiles(body.profiles)

  const hermesUser = findByMatrixUserId(matrixUserId)
  if (!hermesUser) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  // Update Hermes metadata
  if (role !== undefined || status !== undefined) {
    updateMatrixUserMetadata(matrixUserId, { role, status })
  }

  if (profiles !== undefined) {
    replaceUserProfiles(hermesUser.id, profiles, profiles[0] || null)
  }

  // Update Matrix display name if provided
  if (body.displayName) {
    const adminToken = getMatrixAdminToken(ctx)
    const homeserverUrl = hermesUser.matrix_homeserver_url || 'http://localhost:8008'
    if (adminToken) {
      await fetch(`${homeserverUrl}/_matrix/client/v3/profile/${encodeURIComponent(matrixUserId)}/displayname`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayname: body.displayName }),
      })
    }
  }

  ctx.body = { user: findByMatrixUserId(matrixUserId) }
}

/**
 * DELETE /api/auth/matrix-users/:id
 * Delete a Matrix user and Hermes record.
 */
export async function deleteMatrixUser(ctx: Context) {
  const matrixUserId = decodeURIComponent(ctx.params.id)
  const hermesUser = findByMatrixUserId(matrixUserId)

  if (!hermesUser) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  if (ctx.state.user?.id === hermesUser.id) {
    ctx.status = 400
    ctx.body = { error: 'You cannot delete your own account' }
    return
  }

  if (hermesUser.role === 'super_admin' && hermesUser.status === 'active' && countActiveSuperAdmins(hermesUser.id) === 0) {
    ctx.status = 400
    ctx.body = { error: 'At least one active super administrator is required' }
    return
  }

  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = hermesUser.matrix_homeserver_url || 'http://localhost:8008'

  if (adminToken) {
    await deleteMatrixUserOnServer(matrixUserId, adminToken, homeserverUrl)
  }

  deleteUser(hermesUser.id)
  ctx.body = { success: true }
}

/**
 * POST /api/auth/matrix-users/:id/deactivate
 * Activate or deactivate a Matrix user.
 */
export async function deactivateMatrixUser(ctx: Context) {
  const matrixUserId = decodeURIComponent(ctx.params.id)
  const { active } = ctx.request.body as { active?: boolean }

  if (active === undefined) {
    ctx.status = 400
    ctx.body = { error: 'active field is required' }
    return
  }

  const hermesUser = findByMatrixUserId(matrixUserId)
  if (!hermesUser) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  if (ctx.state.user?.id === hermesUser.id && !active) {
    ctx.status = 400
    ctx.body = { error: 'You cannot disable your own account' }
    return
  }

  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = hermesUser.matrix_homeserver_url || 'http://localhost:8008'

  if (adminToken) {
    await setMatrixUserActive(matrixUserId, active, adminToken, homeserverUrl)
  }

  updateMatrixUserMetadata(matrixUserId, { status: active ? 'active' : 'disabled' })
  ctx.body = { success: true }
}

/**
 * POST /api/auth/matrix-users/:id/reset-password
 * Reset a Matrix user's password.
 */
export async function resetMatrixUserPassword(ctx: Context) {
  const matrixUserId = decodeURIComponent(ctx.params.id)
  const { password } = ctx.request.body as { password?: string }

  if (!password || password.length < 6) {
    ctx.status = 400
    ctx.body = { error: 'Password must be at least 6 characters' }
    return
  }

  const hermesUser = findByMatrixUserId(matrixUserId)
  if (!hermesUser) {
    ctx.status = 404
    ctx.body = { error: 'User not found' }
    return
  }

  const adminToken = getMatrixAdminToken(ctx)
  const homeserverUrl = hermesUser.matrix_homeserver_url || 'http://localhost:8008'

  if (!adminToken) {
    ctx.status = 503
    ctx.body = { error: 'Matrix admin API not configured' }
    return
  }

  const ok = await resetMatrixUserPasswordOnServer(matrixUserId, password, adminToken, homeserverUrl)
  if (!ok) {
    ctx.status = 500
    ctx.body = { error: 'Failed to reset password' }
    return
  }

  ctx.body = { success: true }
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/controllers/auth.ts
git commit -m "feat(auth): add Matrix login and user management endpoints"
```

---

### Task 6: Register New Auth Routes

**Files:**
- Modify: `packages/server/src/routes/auth.ts`

- [ ] **Step 1: Add new routes**

```typescript
import Router from '@koa/router'
import * as ctrl from '../controllers/auth'
import { requireSuperAdmin } from '../middleware/user-auth'

// Public routes (no auth required)
export const authPublicRoutes = new Router()
authPublicRoutes.get('/api/auth/status', ctrl.authStatus)
authPublicRoutes.post('/api/auth/login', ctrl.login)
authPublicRoutes.post('/api/auth/mcu-login', ctrl.microcontrollerLogin)
authPublicRoutes.post('/api/auth/matrix-login', ctrl.matrixLogin) // NEW

// Protected routes (auth required)
export const authProtectedRoutes = new Router()
authProtectedRoutes.post('/api/auth/setup', ctrl.setupPassword)
authProtectedRoutes.get('/api/auth/me', ctrl.currentUser)
authProtectedRoutes.post('/api/auth/change-password', ctrl.changePassword)
authProtectedRoutes.post('/api/auth/change-username', ctrl.changeUsername)
authProtectedRoutes.get('/api/auth/avatar', ctrl.getMyAvatar)
authProtectedRoutes.put('/api/auth/avatar', ctrl.updateMyAvatar)
authProtectedRoutes.delete('/api/auth/password', ctrl.removePassword)

// Existing local user management (preserved)
authProtectedRoutes.get('/api/auth/users', requireSuperAdmin, ctrl.listManagedUsers)
authProtectedRoutes.post('/api/auth/users', requireSuperAdmin, ctrl.createManagedUser)
authProtectedRoutes.put('/api/auth/users/:id', requireSuperAdmin, ctrl.updateManagedUser)
authProtectedRoutes.delete('/api/auth/users/:id', requireSuperAdmin, ctrl.deleteManagedUser)

// NEW: Matrix user management
authProtectedRoutes.get('/api/auth/matrix-users', requireSuperAdmin, ctrl.listMatrixUsers)
authProtectedRoutes.post('/api/auth/matrix-users', requireSuperAdmin, ctrl.createMatrixUser)
authProtectedRoutes.put('/api/auth/matrix-users/:id', requireSuperAdmin, ctrl.updateMatrixUser)
authProtectedRoutes.delete('/api/auth/matrix-users/:id', requireSuperAdmin, ctrl.deleteMatrixUser)
authProtectedRoutes.post('/api/auth/matrix-users/:id/deactivate', requireSuperAdmin, ctrl.deactivateMatrixUser)
authProtectedRoutes.post('/api/auth/matrix-users/:id/reset-password', requireSuperAdmin, ctrl.resetMatrixUserPassword)

authProtectedRoutes.get('/api/auth/locked-ips', ctrl.listLockedIps)
authProtectedRoutes.delete('/api/auth/locked-ips', ctrl.unlockIpHandler)
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/routes/auth.ts
git commit -m "feat(routes): register Matrix login and user management routes"
```

---

## Phase 2: Frontend Login and Auth Store

### Task 7: Create Auth Pinia Store

**Files:**
- Create: `packages/client/src/stores/hermes/auth.ts`

- [ ] **Step 1: Write the auth store**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getApiKey, setApiKey, clearApiKey, getMatrixCredentials, clearMatrixCredentials } from '@/api/client'
import { matrixLogin as matrixSdkLogin, matrixLogin as hermesMatrixLogin, loginWithPassword, fetchCurrentUser } from '@/api/auth'
import type { CurrentUser } from '@/api/auth'

export interface UnifiedUser {
  id: number
  username: string
  matrixUserId: string | null
  displayName: string
  avatarUrl: string | null
  role: 'super_admin' | 'admin'
  authSource: 'local' | 'matrix'
  homeserverUrl: string | null
  profiles: string[]
  defaultProfile: string | null
  status: string
  requiresCredentialChange: boolean
}

export const useAuthStore = defineStore('hermes-auth', () => {
  const user = ref<UnifiedUser | null>(null)
  const hermesToken = ref<string | null>(getApiKey())
  const matrixToken = ref<string | null>(getMatrixCredentials()?.accessToken || null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isLoggedIn = computed(() => !!hermesToken.value && !!user.value)
  const isMatrixLoggedIn = computed(() => !!matrixToken.value)
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')

  async function matrixLogin(homeserverUrl: string, username: string, password: string) {
    isLoading.value = true
    error.value = null
    try {
      // 1. Login to Matrix homeserver
      const matrixCreds = await matrixSdkLogin(homeserverUrl, username, password)
      matrixToken.value = matrixCreds.accessToken

      // 2. Login to Hermes backend with Matrix credentials
      const hermesRes = await hermesMatrixLogin(
        matrixCreds.accessToken,
        matrixCreds.userId,
        matrixCreds.deviceId,
        matrixCreds.homeserverUrl
      )
      hermesToken.value = hermesRes.token
      setApiKey(hermesRes.token)

      // 3. Build unified user
      user.value = buildUnifiedUser(hermesRes.user)
    } catch (err: any) {
      error.value = err.message || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function localLogin(username: string, password: string) {
    isLoading.value = true
    error.value = null
    try {
      const token = await loginWithPassword(username, password)
      hermesToken.value = token
      setApiKey(token)

      const current = await fetchCurrentUser()
      user.value = buildUnifiedUser(current)
      matrixToken.value = null
    } catch (err: any) {
      error.value = err.message || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function fetchUser() {
    if (!hermesToken.value) return
    try {
      const current = await fetchCurrentUser()
      user.value = buildUnifiedUser(current)
    } catch {
      user.value = null
    }
  }

  function logout() {
    user.value = null
    hermesToken.value = null
    matrixToken.value = null
    clearApiKey()
    clearMatrixCredentials()
  }

  function buildUnifiedUser(apiUser: CurrentUser): UnifiedUser {
    return {
      id: apiUser.id,
      username: apiUser.username,
      matrixUserId: apiUser.matrix_user_id || null,
      displayName: apiUser.matrix_display_name || apiUser.username,
      avatarUrl: apiUser.matrix_avatar_url || null,
      role: apiUser.role,
      authSource: apiUser.auth_source || 'local',
      homeserverUrl: apiUser.matrix_homeserver_url || null,
      profiles: [], // Fetched separately
      defaultProfile: null,
      status: apiUser.status,
      requiresCredentialChange: apiUser.requiresCredentialChange || false,
    }
  }

  return {
    user,
    hermesToken,
    matrixToken,
    isLoading,
    error,
    isLoggedIn,
    isMatrixLoggedIn,
    isSuperAdmin,
    matrixLogin,
    localLogin,
    fetchUser,
    logout,
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/stores/hermes/auth.ts
git commit -m "feat(store): add unified auth Pinia store"
```

---

### Task 8: Update Auth API Client

**Files:**
- Modify: `packages/client/src/api/auth.ts`

- [ ] **Step 1: Update CurrentUser interface**

```typescript
export interface CurrentUser {
  id: number
  username: string
  role: UserRole
  status: UserStatus
  created_at: number
  updated_at: number
  last_login_at: number | null
  avatar?: string
  requiresCredentialChange?: boolean
  // Matrix fields
  matrix_user_id?: string
  matrix_display_name?: string
  matrix_avatar_url?: string
  matrix_homeserver_url?: string
  auth_source?: 'local' | 'matrix'
}
```

- [ ] **Step 2: Add Hermes Matrix login function**

```typescript
export async function matrixLogin(
  matrixAccessToken: string,
  matrixUserId: string,
  deviceId: string,
  homeserverUrl: string
): Promise<{ token: string; user: CurrentUser }> {
  const res = await fetch('/api/auth/matrix-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matrixAccessToken, matrixUserId, deviceId, homeserverUrl }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || 'Matrix login failed')
  }
  return res.json()
}
```

- [ ] **Step 3: Add Matrix user management APIs**

```typescript
export interface MatrixUser {
  matrix_user_id: string
  display_name: string
  avatar_url: string | null
  role: UserRole
  status: UserStatus
  profiles: string[]
  last_login_at: number | null
  is_admin: boolean
  source: 'matrix' | 'hermes'
}

export interface MatrixUserListResponse {
  users: MatrixUser[]
  total: number
}

export async function fetchMatrixUsers(page = 0, pageSize = 100): Promise<MatrixUserListResponse> {
  return request<MatrixUserListResponse>(`/api/auth/matrix-users?page=${page}&pageSize=${pageSize}`)
}

export async function createMatrixUser(input: {
  userId: string
  password: string
  displayName?: string
  role: UserRole
  profiles: string[]
}): Promise<{ user: CurrentUser }> {
  return request<{ user: CurrentUser }>('/api/auth/matrix-users', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateMatrixUser(matrixUserId: string, input: {
  displayName?: string
  role?: UserRole
  status?: UserStatus
  profiles?: string[]
}): Promise<{ user: CurrentUser }> {
  return request<{ user: CurrentUser }>(`/api/auth/matrix-users/${encodeURIComponent(matrixUserId)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteMatrixUser(matrixUserId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/auth/matrix-users/${encodeURIComponent(matrixUserId)}`, {
    method: 'DELETE',
  })
}

export async function deactivateMatrixUser(matrixUserId: string, active: boolean): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/auth/matrix-users/${encodeURIComponent(matrixUserId)}/deactivate`, {
    method: 'POST',
    body: JSON.stringify({ active }),
  })
}

export async function resetMatrixUserPassword(matrixUserId: string, password: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/auth/matrix-users/${encodeURIComponent(matrixUserId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/api/auth.ts
git commit -m "feat(api): add Matrix login and user management client APIs"
```

---

### Task 9: Update Client API (Remove Bypass Token)

**Files:**
- Modify: `packages/client/src/api/client.ts`

- [ ] **Step 1: Remove MATRIX_BYPASS_TOKEN and isMatrixBypassMode**

```typescript
// REMOVE these lines:
// const MATRIX_BYPASS_TOKEN = 'matrix-bypass-token'
// export function isMatrixBypassMode(): boolean {
//   return getApiKey() === MATRIX_BYPASS_TOKEN
// }
```

- [ ] **Step 2: Update getStoredUserRole to handle matrix_user_id in payload**

```typescript
export function getStoredUserRole(): StoredUserRole | null {
  const token = getApiKey()
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const data = JSON.parse(atob(padded)) as { role?: unknown; matrix_user_id?: unknown }
    return data.role === 'super_admin' || data.role === 'admin' ? data.role : null
  } catch {
    return null
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/api/client.ts
git commit -m "refactor(client): remove matrix-bypass-token, update JWT parsing"
```

---

### Task 10: Redesign Login View

**Files:**
- Modify: `packages/client/src/views/LoginView.vue`

- [ ] **Step 1: Rewrite LoginView with dual tabs**

```vue
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "@/stores/hermes/auth";

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const activeTab = ref<'matrix' | 'local'>('matrix');

// Matrix login fields
const homeserverUrl = ref("http://localhost:8008");
const matrixUsername = ref("@testuser1:matrix.test");
const matrixPassword = ref("");

// Local login fields
const localUsername = ref("");
const localPassword = ref("");

const loading = ref(false);
const errorMsg = ref("");

onMounted(() => {
  const savedHs = localStorage.getItem('matrix_homeserver_url');
  if (savedHs) homeserverUrl.value = savedHs;
});

async function handleMatrixLogin() {
  if (!homeserverUrl.value.trim()) {
    errorMsg.value = t("login.homeserverRequired");
    return;
  }
  if (!matrixUsername.value.trim() || !matrixPassword.value) {
    errorMsg.value = t("login.credentialsRequired");
    return;
  }

  loading.value = true;
  errorMsg.value = "";

  try {
    await authStore.matrixLogin(
      homeserverUrl.value.trim(),
      matrixUsername.value.trim(),
      matrixPassword.value
    );
    router.replace("/hermes/chat");
  } catch (err: any) {
    const msg = err?.message || t("login.invalidCredentials");
    if (msg.includes('M_UNKNOWN') || msg.includes('M_FORBIDDEN') || msg.includes('403')) {
      errorMsg.value = t("login.invalidCredentials");
    } else if (msg.includes('fetch') || msg.includes('network') || msg.includes('Failed to fetch')) {
      errorMsg.value = t("login.homeserverConnectionFailed");
    } else {
      errorMsg.value = msg;
    }
  } finally {
    loading.value = false;
  }
}

async function handleLocalLogin() {
  if (!localUsername.value.trim() || !localPassword.value) {
    errorMsg.value = t("login.credentialsRequired");
    return;
  }

  loading.value = true;
  errorMsg.value = "";

  try {
    await authStore.localLogin(localUsername.value.trim(), localPassword.value);
    router.replace("/hermes/chat");
  } catch (err: any) {
    errorMsg.value = err?.message || t("login.invalidCredentials");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-view">
    <div class="login-card">
      <div class="login-logo">
        <img src="/logo.png" alt="Hermes" width="80" height="80" />
      </div>
      <h1 class="login-title">{{ t("login.title") }}</h1>

      <!-- Tab switcher -->
      <div class="login-tabs">
        <button
          :class="['tab-btn', { active: activeTab === 'matrix' }]"
          @click="activeTab = 'matrix'"
        >
          {{ t("login.matrixTab") }}
        </button>
        <button
          :class="['tab-btn', { active: activeTab === 'local' }]"
          @click="activeTab = 'local'"
        >
          {{ t("login.localTab") }}
        </button>
      </div>

      <!-- Matrix Login Form -->
      <form v-if="activeTab === 'matrix'" class="login-form" @submit.prevent="handleMatrixLogin">
        <p class="login-desc">{{ t("login.matrixDescription") }}</p>
        <input
          v-model="homeserverUrl"
          type="url"
          class="login-input"
          :placeholder="t('login.homeserverPlaceholder')"
          autofocus
        />
        <input
          v-model="matrixUsername"
          type="text"
          class="login-input"
          :placeholder="t('login.matrixUsernamePlaceholder')"
        />
        <input
          v-model="matrixPassword"
          type="password"
          class="login-input"
          :placeholder="t('login.passwordPlaceholder')"
          @keyup.enter="handleMatrixLogin"
        />
        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? "..." : t("login.submit") }}
        </button>
      </form>

      <!-- Local Login Form -->
      <form v-else class="login-form" @submit.prevent="handleLocalLogin">
        <p class="login-desc">{{ t("login.localDescription") }}</p>
        <input
          v-model="localUsername"
          type="text"
          class="login-input"
          :placeholder="t('login.usernamePlaceholder')"
          autofocus
        />
        <input
          v-model="localPassword"
          type="password"
          class="login-input"
          :placeholder="t('login.passwordPlaceholder')"
          @keyup.enter="handleLocalLogin"
        />
        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? "..." : t("login.submit") }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.login-view {
  height: calc(100 * var(--vh));
  display: flex;
  align-items: center;
  justify-content: center;
  background: $bg-primary;
}

.login-card {
  width: 480px;
  max-width: calc(100vw - 32px);
  padding: 56px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: $bg-card;
  text-align: center;

  @media (max-width: $breakpoint-mobile) {
    padding: 32px 24px;
  }
}

.login-logo {
  margin-bottom: 24px;
}

.login-title {
  font-size: 26px;
  font-weight: 600;
  color: $text-primary;
  margin: 0 0 10px;
}

.login-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  justify-content: center;
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-muted;
  font-size: 14px;
  cursor: pointer;
  transition: all $transition-fast;

  &.active {
    background: $text-primary;
    color: var(--text-on-accent);
  }

  &:hover:not(.active) {
    color: $text-secondary;
  }
}

.login-desc {
  font-size: 14px;
  color: $text-muted;
  margin: 0 0 12px;
  line-height: 1.6;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.login-input {
  width: 100%;
  padding: 14px 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  font-size: 15px;
  color: $text-primary;
  background: $bg-input;
  outline: none;
  transition: border-color $transition-fast;
  box-sizing: border-box;
  font-family: $font-code;

  &::placeholder {
    color: $text-muted;
  }

  &:focus {
    border-color: $accent-primary;
  }
}

.login-error {
  font-size: 13px;
  color: $error;
  text-align: left;
}

.login-btn {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: $radius-sm;
  background: $text-primary;
  color: var(--text-on-accent);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity $transition-fast;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/views/LoginView.vue
git commit -m "feat(login): redesign with Matrix and Local login tabs"
```

---

## Phase 3: Current Account Settings

### Task 11: Redesign AccountSettings for Matrix Identity

**Files:**
- Modify: `packages/client/src/components/hermes/settings/AccountSettings.vue`

- [ ] **Step 1: Add imports and update refs**

```typescript
import { useAuthStore } from "@/stores/hermes/auth";
import { getMatrixCredentials } from "@/api/client";

const authStore = useAuthStore();

// Replace username ref with computed from auth store
const user = computed(() => authStore.user);
const isMatrixUser = computed(() => user.value?.authSource === 'matrix');
```

- [ ] **Step 2: Add Matrix Identity section to template**

Insert after the avatar section (before `.configured-section`):

```vue
<!-- Matrix Identity Section -->
<div v-if="isMatrixUser" class="matrix-identity-section">
  <h3 class="section-title">{{ t('settings.matrixIdentity.title') }}</h3>
  <div class="identity-card">
    <div class="identity-avatar">
      <ProfileAvatar
        :name="user?.displayName || 'default'"
        :avatar="user?.avatarUrl ? { type: 'image', dataUrl: user.avatarUrl } : null"
        :size="64"
      />
    </div>
    <div class="identity-info">
      <div class="identity-row">
        <span class="identity-label">{{ t('settings.matrixIdentity.userId') }}</span>
        <span class="identity-value">{{ user?.matrixUserId }}</span>
      </div>
      <div class="identity-row">
        <span class="identity-label">{{ t('settings.matrixIdentity.displayName') }}</span>
        <span class="identity-value">{{ user?.displayName }}</span>
      </div>
      <div class="identity-row">
        <span class="identity-label">{{ t('settings.matrixIdentity.homeserver') }}</span>
        <span class="identity-value">{{ user?.homeserverUrl }}</span>
      </div>
      <div class="identity-row">
        <span class="identity-label">{{ t('settings.matrixIdentity.role') }}</span>
        <span class="identity-value">
          <NTag :type="user?.role === 'super_admin' ? 'warning' : 'default'" size="small">
            {{ user?.role === 'super_admin' ? t('users.roles.superAdmin') : t('users.roles.admin') }}
          </NTag>
        </span>
      </div>
      <div class="identity-row">
        <span class="identity-label">{{ t('settings.matrixIdentity.authSource') }}</span>
        <span class="identity-value">
          <NTag type="info" size="small">Matrix</NTag>
        </span>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Update password/username change section to be conditional**

```vue
<div class="configured-section">
  <!-- For Matrix users: show Matrix password change -->
  <div v-if="isMatrixUser" class="action-row">
    <span class="action-label">{{ t("settings.matrixIdentity.passwordManagedByMatrix") }}</span>
    <div class="action-buttons">
      <NButton @click="openMatrixPasswordModal">{{ t("settings.matrixIdentity.changeMatrixPassword") }}</NButton>
    </div>
  </div>
  <!-- For local users: keep existing password/username change -->
  <div v-else class="action-row">
    <span class="action-label">{{ t("login.passwordLoginConfigured", { username: user?.username }) }}</span>
    <div class="action-buttons">
      <NButton @click="openChangePasswordModal">{{ t("login.changePassword") }}</NButton>
      <NButton @click="openChangeUsernameModal">{{ t("login.changeUsername") }}</NButton>
    </div>
  </div>
</div>
```

- [ ] **Step 4: Add Matrix password change modal and handler**

```typescript
const showMatrixPasswordModal = ref(false);
const matrixNewPassword = ref("");
const matrixPasswordConfirm = ref("");

function openMatrixPasswordModal() {
  matrixNewPassword.value = "";
  matrixPasswordConfirm.value = "";
  showMatrixPasswordModal.value = true;
}

async function handleMatrixPasswordChange() {
  if (matrixNewPassword.value !== matrixPasswordConfirm.value) {
    message.error(t("login.passwordMismatch"));
    return;
  }
  if (matrixNewPassword.value.length < 6) {
    message.error(t("login.passwordTooShort"));
    return;
  }
  loading.value = true;
  try {
    const matrixCreds = getMatrixCredentials();
    if (!matrixCreds) throw new Error('Not logged in to Matrix');
    await resetMatrixUserPassword(matrixCreds.userId, matrixNewPassword.value);
    showMatrixPasswordModal.value = false;
    matrixNewPassword.value = "";
    matrixPasswordConfirm.value = "";
    message.success(t("settings.matrixIdentity.passwordChanged"));
  } catch (err: any) {
    message.error(err.message || t("common.saveFailed"));
  } finally {
    loading.value = false;
  }
}
```

- [ ] **Step 5: Add Matrix password modal to template**

```vue
<NModal v-model:show="showMatrixPasswordModal" preset="dialog" :title="t('settings.matrixIdentity.changeMatrixPassword')">
  <NForm label-placement="top">
    <NFormItem :label="t('login.newPassword')">
      <NInput v-model:value="matrixNewPassword" type="password" show-password-on="click" :placeholder="t('login.newPassword')" />
    </NFormItem>
    <NFormItem :label="t('login.confirmPassword')">
      <NInput v-model:value="matrixPasswordConfirm" type="password" show-password-on="click" :placeholder="t('login.confirmPassword')" @keyup.enter="handleMatrixPasswordChange" />
    </NFormItem>
  </NForm>
  <template #action>
    <NButton @click="showMatrixPasswordModal = false">{{ t("common.cancel") }}</NButton>
    <NButton type="primary" :loading="loading" @click="handleMatrixPasswordChange">{{ t("common.save") }}</NButton>
  </template>
</NModal>
```

- [ ] **Step 6: Add imports for new API**

```typescript
import { resetMatrixUserPassword } from "@/api/auth";
```

- [ ] **Step 7: Add styles for Matrix identity section**

```scss
.matrix-identity-section {
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 1px solid $border-color;
}

.identity-card {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 16px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-input;
}

.identity-avatar {
  flex-shrink: 0;
}

.identity-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.identity-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.identity-label {
  font-size: 13px;
  color: $text-muted;
  min-width: 100px;
}

.identity-value {
  font-size: 14px;
  color: $text-primary;
  font-family: $font-code;
}
```

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/components/hermes/settings/AccountSettings.vue
git commit -m "feat(settings): add Matrix identity section to Current Account"
```

---

## Phase 4: Account Management

### Task 12: Redesign UserManagementSettings for Matrix Users

**Files:**
- Modify: `packages/client/src/components/hermes/settings/UserManagementSettings.vue`

- [ ] **Step 1: Update imports and types**

```typescript
import {
  createMatrixUser,
  deleteMatrixUser,
  deactivateMatrixUser,
  fetchMatrixUsers,
  updateMatrixUser,
  resetMatrixUserPassword,
  type MatrixUser,
  type UserRole,
  type UserStatus,
} from '@/api/auth'
```

- [ ] **Step 2: Update refs and form**

```typescript
const users = ref<MatrixUser[]>([])
const showModal = ref(false)
const editingUser = ref<MatrixUser | null>(null)
const showResetPasswordModal = ref(false)
const resetPasswordTarget = ref<MatrixUser | null>(null)
const newPassword = ref('')

const form = reactive({
  userId: '',
  password: '',
  displayName: '',
  role: 'admin' as UserRole,
  status: 'active' as UserStatus,
  profiles: [] as string[],
})

function resetForm() {
  editingUser.value = null
  form.userId = ''
  form.password = ''
  form.displayName = ''
  form.role = 'admin'
  form.status = 'active'
  form.profiles = []
}
```

- [ ] **Step 3: Update loadUsers**

```typescript
async function loadUsers() {
  loading.value = true
  try {
    const res = await fetchMatrixUsers()
    users.value = res.users
  } catch (err: any) {
    message.error(err.message || t('users.loadFailed'))
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 4: Update openEdit and submit**

```typescript
function openEdit(user: MatrixUser) {
  editingUser.value = user
  form.userId = user.matrix_user_id
  form.displayName = user.display_name
  form.password = ''
  form.role = user.role
  form.status = user.status
  form.profiles = [...user.profiles]
  showModal.value = true
}

async function submit() {
  if (!editingUser.value) {
    // Create new user
    if (!form.userId.trim() || !form.password || form.password.length < 6) {
      message.error(t('login.passwordTooShort'))
      return
    }
    saving.value = true
    try {
      await createMatrixUser({
        userId: form.userId.trim(),
        password: form.password,
        displayName: form.displayName,
        role: form.role,
        profiles: form.role === 'super_admin' ? [] : form.profiles,
      })
      await loadUsers()
      showModal.value = false
      resetForm()
      message.success(t('common.saved'))
    } catch (err: any) {
      message.error(err.message || t('common.saveFailed'))
    } finally {
      saving.value = false
    }
  } else {
    // Update existing user
    saving.value = true
    try {
      await updateMatrixUser(editingUser.value.matrix_user_id, {
        displayName: form.displayName,
        role: form.role,
        status: form.status,
        profiles: form.role === 'super_admin' ? [] : form.profiles,
      })
      await loadUsers()
      showModal.value = false
      resetForm()
      message.success(t('common.saved'))
    } catch (err: any) {
      message.error(err.message || t('common.saveFailed'))
    } finally {
      saving.value = false
    }
  }
}
```

- [ ] **Step 5: Update setStatus and removeUser**

```typescript
async function setStatus(user: MatrixUser, status: UserStatus) {
  saving.value = true
  try {
    await deactivateMatrixUser(user.matrix_user_id, status === 'active')
    await loadUsers()
    message.success(t('common.saved'))
  } catch (err: any) {
    message.error(err.message || t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function removeUser(user: MatrixUser) {
  saving.value = true
  try {
    await deleteMatrixUser(user.matrix_user_id)
    await loadUsers()
    message.success(t('common.saved'))
  } catch (err: any) {
    message.error(err.message || t('common.deleteFailed'))
  } finally {
    saving.value = false
  }
}

async function handleResetPassword() {
  if (!newPassword.value || newPassword.value.length < 6) {
    message.error(t('login.passwordTooShort'))
    return
  }
  if (!resetPasswordTarget.value) return
  saving.value = true
  try {
    await resetMatrixUserPassword(resetPasswordTarget.value.matrix_user_id, newPassword.value)
    showResetPasswordModal.value = false
    newPassword.value = ''
    resetPasswordTarget.value = null
    message.success(t('settings.matrixIdentity.passwordChanged'))
  } catch (err: any) {
    message.error(err.message || t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}
```

- [ ] **Step 6: Update columns**

```typescript
const columns = computed<DataTableColumns<MatrixUser>>(() => [
  {
    title: t('users.matrixUserId'),
    key: 'matrix_user_id',
    minWidth: 180,
    render: (row) => h('span', { class: 'mono' }, row.matrix_user_id),
  },
  {
    title: t('users.displayName'),
    key: 'display_name',
    minWidth: 140,
  },
  {
    title: t('users.role'),
    key: 'role',
    width: 130,
    render: (row) => h(NTag, { size: 'small', type: row.role === 'super_admin' ? 'warning' : 'default' }, {
      default: () => row.role === 'super_admin' ? t('users.roles.superAdmin') : t('users.roles.admin'),
    }),
  },
  {
    title: t('users.statusLabel'),
    key: 'status',
    width: 110,
    render: (row) => h(NTag, { size: 'small', type: row.status === 'active' ? 'success' : 'error' }, {
      default: () => row.status === 'active' ? t('users.status.active') : t('users.status.disabled'),
    }),
  },
  {
    title: t('users.profiles'),
    key: 'profiles',
    minWidth: 200,
    render: (row) => row.role === 'super_admin'
      ? h('span', { class: 'muted' }, t('users.allProfiles'))
      : h(NSpace, { size: 4 }, {
        default: () => row.profiles.length
          ? row.profiles.map(profile => h(NTag, { size: 'small', bordered: false }, { default: () => profile }))
          : h('span', { class: 'muted' }, t('users.noProfiles')),
      }),
  },
  {
    title: t('users.lastLogin'),
    key: 'last_login_at',
    minWidth: 170,
    render: (row) => formatTime(row.last_login_at),
  },
  {
    title: t('common.edit'),
    key: 'actions',
    width: 340,
    render: (row) => h(NSpace, { size: 8 }, {
      default: () => [
        h(NButton, { size: 'small', onClick: () => openEdit(row) }, { default: () => t('common.edit') }),
        h(NButton, { size: 'small', onClick: () => { resetPasswordTarget.value = row; showResetPasswordModal.value = true; } }, { default: () => t('users.resetPassword') }),
        h(NButton, {
          size: 'small',
          type: row.status === 'active' ? 'warning' : 'primary',
          ghost: true,
          loading: saving.value,
          onClick: () => setStatus(row, row.status === 'active' ? 'disabled' : 'active'),
        }, { default: () => row.status === 'active' ? t('users.disable') : t('users.enable') }),
        h(NPopconfirm, { onPositiveClick: () => removeUser(row) }, {
          trigger: () => h(NButton, { size: 'small', type: 'error', ghost: true, loading: saving.value }, { default: () => t('common.delete') }),
          default: () => t('users.deleteConfirm'),
        }),
      ],
    }),
  },
])
```

- [ ] **Step 7: Update modal template**

```vue
<NModal v-model:show="showModal" preset="dialog" :title="editingUser ? t('users.edit') : t('users.create')">
  <NForm label-placement="top">
    <NFormItem :label="t('users.matrixUserId')">
      <NInput v-model:value="form.userId" :disabled="!!editingUser" :placeholder="t('users.matrixUserIdPlaceholder')" />
    </NFormItem>
    <NFormItem v-if="!editingUser" :label="t('login.newPassword')">
      <NInput v-model:value="form.password" type="password" show-password-on="click" :placeholder="t('login.passwordPlaceholder')" />
    </NFormItem>
    <NFormItem :label="t('users.displayName')">
      <NInput v-model:value="form.displayName" :placeholder="t('users.displayNamePlaceholder')" />
    </NFormItem>
    <NFormItem :label="t('users.role')">
      <NSelect v-model:value="form.role" :options="roleOptions" />
    </NFormItem>
    <NFormItem :label="t('users.statusLabel')">
      <NSelect v-model:value="form.status" :options="statusOptions" />
    </NFormItem>
    <NFormItem v-if="form.role !== 'super_admin'" :label="t('users.profiles')">
      <NSelect
        v-model:value="form.profiles"
        multiple
        filterable
        :options="profileOptions"
        :placeholder="t('users.profilesPlaceholder')"
      />
    </NFormItem>
  </NForm>
  <template #action>
    <NButton @click="showModal = false">{{ t('common.cancel') }}</NButton>
    <NButton type="primary" :loading="saving" @click="submit">{{ t('common.save') }}</NButton>
  </template>
</NModal>

<!-- Reset Password Modal -->
<NModal v-model:show="showResetPasswordModal" preset="dialog" :title="t('users.resetPassword')">
  <NForm label-placement="top">
    <NFormItem :label="t('login.newPassword')">
      <NInput v-model:value="newPassword" type="password" show-password-on="click" :placeholder="t('login.passwordPlaceholder')" />
    </NFormItem>
  </NForm>
  <template #action>
    <NButton @click="showResetPasswordModal = false">{{ t('common.cancel') }}</NButton>
    <NButton type="primary" :loading="saving" @click="handleResetPassword">{{ t('common.save') }}</NButton>
  </template>
</NModal>
```

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/components/hermes/settings/UserManagementSettings.vue
git commit -m "feat(settings): redesign Account Management for Matrix users"
```

---

## Phase 5: Integration and Testing

### Task 13: Update SettingsView to use Auth Store

**Files:**
- Modify: `packages/client/src/views/hermes/SettingsView.vue`

- [ ] **Step 1: Replace isStoredSuperAdmin with auth store**

```typescript
import { useAuthStore } from "@/stores/hermes/auth";

const authStore = useAuthStore();
const canManageUsers = computed(() => authStore.isSuperAdmin);
```

- [ ] **Step 2: Commit**

```bash
git add packages/client/src/views/hermes/SettingsView.vue
git commit -m "refactor(settings): use auth store for super admin check"
```

---

### Task 14: Update Router to use Auth Store

**Files:**
- Modify: `packages/client/src/router/index.ts`

- [ ] **Step 1: Import auth store**

```typescript
import { useAuthStore } from '@/stores/hermes/auth'
```

- [ ] **Step 2: Update router guard**

```typescript
router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore()
  
  if (to.meta.public) {
    if (to.name === 'login' && authStore.isLoggedIn) {
      next({ path: '/hermes/chat' })
      return
    }
    next()
    return
  }

  if (!authStore.isLoggedIn) {
    next({ name: 'login' })
    return
  }

  if (to.meta.requiresSuperAdmin && !authStore.isSuperAdmin) {
    next({ name: 'hermes.chat' })
    return
  }

  next()
})
```

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/router/index.ts
git commit -m "refactor(router): use auth store for auth guards"
```

---

### Task 15: Add Backend Tests for Matrix Login

**Files:**
- Create: `packages/server/src/controllers/auth.matrix.test.ts`

- [ ] **Step 1: Write test file**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { matrixLogin } from './auth'
import * as matrixAdminService from '../services/matrix-admin-service'
import * as usersStore from '../db/hermes/users-store'

vi.mock('../services/matrix-admin-service')
vi.mock('../db/hermes/users-store')

describe('matrixLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create new Hermes user for first-time Matrix login', async () => {
    vi.mocked(matrixAdminService.validateMatrixToken).mockResolvedValue({
      userId: '@alice:matrix.org',
      deviceId: 'DEVICE123',
    })
    vi.mocked(matrixAdminService.getMatrixUserInfo).mockResolvedValue({
      userId: '@alice:matrix.org',
      displayName: 'Alice',
      avatarUrl: 'mxc://example.com/alice',
      isAdmin: false,
      deactivated: false,
    })
    vi.mocked(usersStore.findByMatrixUserId).mockReturnValue(null)
    vi.mocked(usersStore.createFromMatrix).mockReturnValue({
      id: 1,
      username: 'alice',
      password_hash: '',
      role: 'admin',
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_login_at: null,
      avatar: '',
      matrix_user_id: '@alice:matrix.org',
      matrix_display_name: 'Alice',
      matrix_avatar_url: 'mxc://example.com/alice',
      matrix_homeserver_url: 'https://matrix.org',
      auth_source: 'matrix',
    })

    const ctx = {
      request: {
        body: {
          matrixAccessToken: 'test_token',
          matrixUserId: '@alice:matrix.org',
          deviceId: 'DEVICE123',
          homeserverUrl: 'https://matrix.org',
        },
      },
      body: {},
      status: 200,
    } as any

    await matrixLogin(ctx)

    expect(ctx.status).toBe(200)
    expect(ctx.body.user.role).toBe('admin')
    expect(ctx.body.user.matrix_user_id).toBe('@alice:matrix.org')
  })

  it('should assign super_admin to Matrix homeserver admin', async () => {
    vi.mocked(matrixAdminService.validateMatrixToken).mockResolvedValue({
      userId: '@admin:matrix.org',
      deviceId: 'DEVICE123',
    })
    vi.mocked(matrixAdminService.getMatrixUserInfo).mockResolvedValue({
      userId: '@admin:matrix.org',
      displayName: 'Admin',
      avatarUrl: '',
      isAdmin: true,
      deactivated: false,
    })
    vi.mocked(usersStore.findByMatrixUserId).mockReturnValue(null)
    vi.mocked(usersStore.createFromMatrix).mockReturnValue({
      id: 2,
      username: 'admin',
      password_hash: '',
      role: 'super_admin',
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_login_at: null,
      avatar: '',
      matrix_user_id: '@admin:matrix.org',
      matrix_display_name: 'Admin',
      matrix_avatar_url: '',
      matrix_homeserver_url: 'https://matrix.org',
      auth_source: 'matrix',
    })

    const ctx = {
      request: {
        body: {
          matrixAccessToken: 'admin_token',
          matrixUserId: '@admin:matrix.org',
          deviceId: 'DEVICE123',
          homeserverUrl: 'https://matrix.org',
        },
      },
      body: {},
      status: 200,
    } as any

    await matrixLogin(ctx)

    expect(ctx.body.user.role).toBe('super_admin')
  })

  it('should reject invalid Matrix token', async () => {
    vi.mocked(matrixAdminService.validateMatrixToken).mockResolvedValue(null)

    const ctx = {
      request: {
        body: {
          matrixAccessToken: 'invalid_token',
          matrixUserId: '@alice:matrix.org',
          deviceId: 'DEVICE123',
          homeserverUrl: 'https://matrix.org',
        },
      },
      body: {},
      status: 200,
    } as any

    await matrixLogin(ctx)

    expect(ctx.status).toBe(401)
    expect(ctx.body.error).toContain('Invalid')
  })
})
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/controllers/auth.matrix.test.ts
git commit -m "test(auth): add Matrix login controller tests"
```

---

### Task 16: Run Full Build and Verify

- [ ] **Step 1: Build the server**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui/packages/server
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 2: Build the client**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui/packages/client
npm run build
```

Expected: No TypeScript/Vite errors.

- [ ] **Step 3: Run backend tests**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui/packages/server
npm test
```

Expected: All new tests pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: verify build and tests pass"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Implementing Task(s) |
|--------------|----------------------|
| Data Model (users table extension) | Task 1, Task 2 |
| Matrix Admin Service | Task 3 |
| Auth Middleware (remove bypass, add matrix_user_id to JWT) | Task 4 |
| Matrix Login endpoint | Task 5 (Step 2) |
| Matrix User Management endpoints | Task 5 (Steps 3-5) |
| Route registration | Task 6 |
| Auth Pinia Store | Task 7 |
| Frontend API client updates | Task 8 |
| Remove bypass token from client | Task 9 |
| Dual login UI | Task 10 |
| Current Account Matrix identity | Task 11 |
| Account Management Matrix users | Task 12 |
| SettingsView super admin check | Task 13 |
| Router auth guards | Task 14 |
| Backend tests | Task 15 |
| Build verification | Task 16 |

### Placeholder Scan

- `getMatrixAdminToken` returns `null` with a TODO comment — this is intentional for the first iteration. The admin token source will be configured in a follow-up task.
- `homeserverUrl` is hardcoded in some controller functions — this is a known limitation that requires config system integration.

### Type Consistency

- `UserRecord` interface updated in `users-store.ts` with all Matrix fields — consistent across store, controller, and middleware.
- `CurrentUser` interface updated in `auth.ts` with Matrix fields — consistent with backend response.
- `UnifiedUser` in auth store maps correctly from `CurrentUser`.

---

*Plan complete and saved to `docs/superpowers/plans/2026-06-19-matrix-account-integration-plan.md`.*

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
