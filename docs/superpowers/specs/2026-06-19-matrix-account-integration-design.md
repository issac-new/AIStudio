# Matrix Account Integration Design

**Date:** 2026-06-19
**Project:** hermes-web-ui
**Topic:** Settings "Current Account" and "Account Management" Matrix Integration
**Status:** Approved, ready for implementation

---

## 1. Overview

### 1.1 Problem Statement

Hermes Web UI currently has two independent authentication systems:

1. **Matrix client authentication** — `matrix-js-sdk` logs into the Matrix homeserver directly in the browser. Credentials are stored in `localStorage`.
2. **Hermes backend authentication** — `/api/auth/login` returns a JWT. The backend maintains a SQLite `users` table with `super_admin` and `admin` roles.

When a user logs in via Matrix but has no Hermes backend account, they receive a hardcoded `matrix-bypass-token` with `super_admin` role. There is no linkage between the Matrix `userId` and the Hermes user record.

The Settings page has two account-related tabs that are disconnected from the Matrix login:
- `account` (Current Account) — shows local Hermes info only
- `users` (Account Management) — manages only Hermes local users

### 1.2 Goal

Connect the Settings "Current Account" and "Account Management" with the Matrix login system, enabling:
- **Current Account** displays the actual Matrix user identity (userId, display name, avatar, homeserver)
- **Account Management** can manage all Matrix users (not just Hermes DB users)
- **Super Admin** can create, edit, disable, and delete Matrix accounts
- Matrix homeserver admins automatically receive Hermes `super_admin` role

### 1.3 Design Approach: Progressive Migration (方案 A)

Instead of a complete rewrite, we extend the existing Hermes user table to hold Matrix user references. This minimizes risk and allows gradual migration without breaking existing local users.

---

## 2. Architecture

### 2.1 High-Level Data Flow

```
┌─────────────┐     Matrix SDK     ┌─────────────────┐
│  Browser    │ ──────────────────→ │ Matrix Homeserver│
│  (Vue 3)    │  login/password   │                 │
└──────┬──────┘                     └─────────────────┘
       │ accessToken, userId, deviceId, homeserverUrl
       ▼
┌─────────────┐   POST /api/auth/matrix-login   ┌─────────────┐
│  Hermes     │ ────────────────────────────────→ │  Hermes     │
│  Client     │                                   │  Backend    │
│  (API)      │ ←─────────────────────────────── │  (Koa 2)    │
└─────────────┘      JWT token + user info        └──────┬──────┘
                                                         │
                    ┌────────────────────────────────────┘
                    │ 1. Validate Matrix token (/whoami)
                    │ 2. Query Matrix admin API (is_admin)
                    │ 3. Find or create user in SQLite
                    │ 4. Compute role (matrix admin → super_admin)
                    │ 5. Issue Hermes JWT
                    │
                    ▼
            ┌─────────────────┐
            │  SQLite (users)  │
            │  + Matrix Admin  │
            │  API calls       │
            └─────────────────┘
```

### 2.2 Role Resolution Rules (Hybrid)

```typescript
function resolveUserRole(
  matrixUserId: string,
  matrixIsAdmin: boolean,
  hermesRole: string | null
): UserRole {
  // Matrix homeserver admin automatically gets super_admin
  if (matrixIsAdmin) return 'super_admin';
  
  // Hermes independently granted super_admin
  if (hermesRole === 'super_admin') return 'super_admin';
  
  // Hermes independently granted admin
  if (hermesRole === 'admin') return 'admin';
  
  // Default: Matrix regular users get admin (so they can use the system)
  return 'admin';
}
```

### 2.3 User Data Sources

| Data | Source | Notes |
|------|--------|-------|
| userId | Matrix | `@alice:matrix.org` |
| displayName | Matrix | Synced from Matrix profile |
| avatar | Matrix | `mxc://` URL, can be overridden locally |
| role | Hybrid | Matrix admin → super_admin; Hermes can override |
| status | Hybrid | Matrix deactivate + Hermes local status |
| profiles | Hermes | `user_profiles` table |
| lastLoginAt | Hermes | Tracked in `users` table |
| password | Matrix | Managed via Matrix admin API |

---

## 3. Data Model

### 3.1 Schema Changes

```sql
-- Extend existing users table
ALTER TABLE users ADD COLUMN matrix_user_id TEXT UNIQUE;
ALTER TABLE users ADD COLUMN matrix_display_name TEXT;
ALTER TABLE users ADD COLUMN matrix_avatar_url TEXT;
ALTER TABLE users ADD COLUMN matrix_homeserver_url TEXT;
ALTER TABLE users ADD COLUMN auth_source TEXT DEFAULT 'local' CHECK (auth_source IN ('local', 'matrix'));

-- Create index for fast lookup
CREATE INDEX idx_users_matrix_user_id ON users(matrix_user_id);
```

### 3.2 Users Table (Updated)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | INTEGER | PK | Internal Hermes user ID |
| username | TEXT | NOT NULL | Hermes local username (or Matrix localpart) |
| password_hash | TEXT | | Scrypt hash; NULL for Matrix users |
| role | TEXT | NOT NULL | `super_admin` or `admin` |
| status | TEXT | `active` | `active` or `disabled` |
| matrix_user_id | TEXT | UNIQUE | e.g. `@alice:matrix.org` |
| matrix_display_name | TEXT | | Cached display name |
| matrix_avatar_url | TEXT | | `mxc://` URL |
| matrix_homeserver_url | TEXT | | e.g. `https://matrix.org` |
| auth_source | TEXT | `local` | `local` or `matrix` |
| created_at | INTEGER | | Unix timestamp |
| updated_at | INTEGER | | Unix timestamp |
| last_login_at | INTEGER | | Unix timestamp |
| avatar | BLOB | | Local avatar override |

### 3.3 Auth Source Semantics

- `auth_source = 'local'` — Traditional Hermes user. Authenticates via `/api/auth/login` with username/password. Can optionally have a linked `matrix_user_id`.
- `auth_source = 'matrix'` — Matrix-backed user. Authenticates via `/api/auth/matrix-login` with Matrix accessToken. No local password. Managed through Matrix admin API.

### 3.4 Existing Data Migration

- All existing users remain `auth_source = 'local'` with `matrix_user_id = null`.
- On first Matrix login, if `matrix_user_id` does not exist, a new user record is created with `auth_source = 'matrix'`.
- Optional: If a local user's username matches the Matrix userId localpart (e.g., `alice` ↔ `@alice:matrix.org`), offer to link them in the UI.

---

## 4. Backend Design

### 4.1 New Service: Matrix Admin Service

**File:** `packages/server/src/services/matrix-admin-service.ts`

```typescript
interface MatrixAdminService {
  /**
   * Validate a Matrix accessToken by calling /account/whoami
   */
  validateToken(
    accessToken: string,
    homeserverUrl: string
  ): Promise<{ userId: string; deviceId: string }>;

  /**
   * Get user details including admin status
   */
  getUserInfo(
    userId: string,
    adminToken: string,
    homeserverUrl: string
  ): Promise<{
    displayName: string;
    avatarUrl: string;
    isAdmin: boolean;
    deactivated: boolean;
  }>;

  /**
   * List all users via Matrix admin API
   */
  listUsers(
    adminToken: string,
    homeserverUrl: string,
    from: number,
    limit: number
  ): Promise<{ users: MatrixUser[]; total: number }>;

  /**
   * Create a new Matrix user
   */
  createUser(
    userId: string,
    password: string,
    adminToken: string,
    homeserverUrl: string
  ): Promise<void>;

  /**
   * Reset a user's password
   */
  resetPassword(
    userId: string,
    password: string,
    adminToken: string,
    homeserverUrl: string
  ): Promise<void>;

  /**
   * Activate or deactivate a user
   */
  setUserActive(
    userId: string,
    active: boolean,
    adminToken: string,
    homeserverUrl: string
  ): Promise<void>;

  /**
   * Delete a user completely
   */
  deleteUser(
    userId: string,
    adminToken: string,
    homeserverUrl: string
  ): Promise<void>;
}
```

### 4.2 New Controller: Matrix Admin Controller

**File:** `packages/server/src/controllers/hermes/matrix-admin.ts`

Handles the proxy layer between Hermes backend and Matrix homeserver admin API. Encapsulates all direct Matrix admin API calls.

### 4.3 Auth Controller Changes

**File:** `packages/server/src/controllers/auth.ts`

New methods:

```typescript
/**
 * Matrix user login to Hermes
 * POST /api/auth/matrix-login
 */
async matrixLogin(ctx: Context): Promise<void>;

/**
 * List all Matrix users (with Hermes metadata merged)
 * GET /api/auth/matrix-users
 * Requires: super_admin
 */
async listMatrixUsers(ctx: Context): Promise<void>;

/**
 * Create a new Matrix user
 * POST /api/auth/matrix-users
 * Requires: super_admin
 */
async createMatrixUser(ctx: Context): Promise<void>;

/**
 * Update a Matrix user (Hermes metadata + Matrix profile)
 * PUT /api/auth/matrix-users/:id
 * Requires: super_admin
 */
async updateMatrixUser(ctx: Context): Promise<void>;

/**
 * Delete a Matrix user
 * DELETE /api/auth/matrix-users/:id
 * Requires: super_admin
 */
async deleteMatrixUser(ctx: Context): Promise<void>;

/**
 * Activate/deactivate a Matrix user
 * POST /api/auth/matrix-users/:id/deactivate
 * Requires: super_admin
 */
async deactivateMatrixUser(ctx: Context): Promise<void>;

/**
 * Reset a Matrix user's password
 * POST /api/auth/matrix-users/:id/reset-password
 * Requires: super_admin
 */
async resetMatrixUserPassword(ctx: Context): Promise<void>;
```

### 4.4 Users Store Changes

**File:** `packages/server/src/db/hermes/users-store.ts`

New methods:

```typescript
/**
 * Find user by Matrix userId
 */
function findByMatrixUserId(matrixUserId: string): User | undefined;

/**
 * Create a new user from Matrix login data
 */
function createFromMatrix(data: {
  matrixUserId: string;
  displayName: string;
  avatarUrl: string;
  homeserverUrl: string;
  role: UserRole;
}): User;

/**
 * Sync Matrix metadata (displayName, avatarUrl) into local record
 */
function syncMatrixMetadata(
  userId: number,
  data: {
    displayName?: string;
    avatarUrl?: string;
    lastLoginAt?: number;
  }
): void;

/**
 * Update Hermes-specific metadata for a Matrix user
 */
function updateMatrixUserMetadata(
  matrixUserId: string,
  data: {
    role?: UserRole;
    status?: UserStatus;
  }
): void;
```

### 4.5 Auth Middleware Changes

**File:** `packages/server/src/middleware/user-auth.ts`

Changes:
- Remove the hardcoded `matrix-bypass-token` logic (which granted `super_admin` unconditionally)
- Add `matrixAccessToken` validation path: when a request includes a Matrix token, validate it via `/whoami` and resolve the Hermes user record
- Update `issueUserJwt()` to include `matrix_user_id` in the JWT payload

### 4.6 Route Changes

**File:** `packages/server/src/routes/auth.ts`

New routes:

```typescript
// Matrix login
router.post('/auth/matrix-login', authController.matrixLogin);

// Matrix user management (all require super_admin)
router.get('/auth/matrix-users', requireUserJwt, requireSuperAdmin, authController.listMatrixUsers);
router.post('/auth/matrix-users', requireUserJwt, requireSuperAdmin, authController.createMatrixUser);
router.put('/auth/matrix-users/:id', requireUserJwt, requireSuperAdmin, authController.updateMatrixUser);
router.delete('/auth/matrix-users/:id', requireUserJwt, requireSuperAdmin, authController.deleteMatrixUser);
router.post('/auth/matrix-users/:id/deactivate', requireUserJwt, requireSuperAdmin, authController.deactivateMatrixUser);
router.post('/auth/matrix-users/:id/reset-password', requireUserJwt, requireSuperAdmin, authController.resetMatrixUserPassword);
```

### 4.7 Configuration Extension

Add Matrix admin configuration to the Hermes config system:

```typescript
interface MatrixAdminConfig {
  /** Enable Matrix user management features */
  enabled: boolean;

  /** Source of admin token for Matrix admin API calls */
  adminTokenSource: 'shared' | 'current_user';

  /** Shared admin token (when adminTokenSource = 'shared') */
  sharedAdminToken?: string;
}
```

This config is stored in the existing Hermes config system and editable via Settings → Platform.

---

## 5. Frontend Design

### 5.1 New Auth Store (Pinia)

**File:** `packages/client/src/stores/hermes/auth.ts` (new)

```typescript
interface AuthState {
  /** Current user info (unified view) */
  user: {
    id: number;
    username: string;
    matrixUserId: string | null;
    displayName: string;
    avatarUrl: string | null;
    role: 'super_admin' | 'admin';
    authSource: 'local' | 'matrix';
    homeserverUrl: string | null;
    profiles: string[];
    defaultProfile: string | null;
  } | null;

  /** Authentication tokens */
  hermesToken: string | null;
  matrixToken: string | null;

  /** Status flags */
  isLoggedIn: boolean;
  isMatrixLoggedIn: boolean;
}

interface AuthActions {
  /** Matrix login flow: Matrix SDK → Hermes backend */
  matrixLogin(credentials: MatrixCredentials): Promise<void>;

  /** Local login (preserved for existing local users) */
  localLogin(username: string, password: string): Promise<void>;

  /** Unified logout */
  logout(): Promise<void>;

  /** Fetch current user info */
  fetchCurrentUser(): Promise<void>;

  /** Update Matrix display name */
  updateDisplayName(name: string): Promise<void>;

  /** Change Matrix password (via admin API or user API) */
  changeMatrixPassword(currentPassword: string, newPassword: string): Promise<void>;
}
```

### 5.2 Login View Redesign

**File:** `packages/client/src/views/LoginView.vue`

Provide two login methods in a tabbed interface:

```
┌─────────────────────────────────────┐
│  [ Matrix Login ]  [ Local Login ]  │
│                                     │
│  Matrix Login:                      │
│  ├─ Homeserver: [https://___]      │
│  ├─ Username:   [__________]        │
│  ├─ Password:   [__________]        │
│  └─ [ Login ]                       │
│                                     │
│  Local Login:                       │
│  ├─ Username:   [__________]        │
│  ├─ Password:   [__________]        │
│  └─ [ Login ]                       │
│                                     │
└─────────────────────────────────────┘
```

Flow:
1. **Matrix Login tab:**
   - User enters homeserver, username, password
   - Frontend calls `matrix-js-sdk` `loginWithPassword()`
   - On success, stores Matrix credentials in `localStorage`
   - Calls `POST /api/auth/matrix-login` with Matrix accessToken
   - Backend validates token, finds/creates user, returns Hermes JWT
   - Frontend stores Hermes JWT, redirects to chat

2. **Local Login tab:**
   - Preserves existing behavior: calls `/api/auth/login` with username/password
   - For `auth_source = 'local'` users who haven't linked Matrix

### 5.3 Current Account Redesign

**File:** `packages/client/src/components/hermes/settings/AccountSettings.vue`

Restructure into three sections:

**Section 1: Matrix Identity (read-only, from Matrix)**
```
┌─────────────────────────────────────┐
│  [Avatar]  @alice:matrix.org        │
│            Alice Smith               │
│            Homeserver: matrix.org    │
│            Role: Super Admin ★        │
│            Auth: Matrix               │
└─────────────────────────────────────┘
```
- Avatar: From Matrix `mxc://` URL (can be overridden with local upload)
- Matrix UserId: Read-only
- Display Name: From Matrix, editable (calls Matrix `/profile/displayname`)
- Homeserver: Read-only
- Role: Computed from hybrid rules (with indicator if from Matrix admin)
- Auth Source: Badge showing "Matrix" or "Local"

**Section 2: Hermes Configuration**
- Assigned Profiles: List of accessible profiles (super_admin shows "All profiles")
- Default Profile: Dropdown selector
- (For local users) Link Matrix Account button

**Section 3: Security**
- Change Matrix Password: For Matrix users, calls Matrix password reset API
- Change Local Password: For local users, preserves existing flow
- Locked IPs: Keep existing functionality (rate limit management)

### 5.4 Account Management Redesign

**File:** `packages/client/src/components/hermes/settings/UserManagementSettings.vue`

**Data source:** `GET /api/auth/matrix-users` (merged Matrix + Hermes data)

**User table columns:**

| Column | Source |
|--------|--------|
| Avatar | Matrix avatarUrl (or local override) |
| Matrix ID | `matrix_user_id` |
| Display Name | `matrix_display_name` |
| Role | Computed (Matrix admin badge + Hermes role) |
| Status | Hybrid: Matrix deactivated + Hermes status |
| Profiles | Hermes `user_profiles` |
| Last Login | Hermes `last_login_at` |
| Actions | Edit / Disable / Delete |

**Actions:**

1. **Create User:**
   - Modal form: Matrix UserId, Password, Display Name (optional), Role, Profiles
   - Calls Matrix admin API to create user
   - Creates Hermes user record with metadata

2. **Edit User:**
   - Modal form: Display Name, Role, Status, Profiles
   - Display Name updates Matrix profile
   - Role/Status/Profiles update Hermes metadata
   - Password reset: Separate button calling Matrix admin API

3. **Disable/Enable:**
   - Calls Matrix admin API deactivate/reactivate
   - Syncs Hermes status

4. **Delete:**
   - Confirmation dialog
   - Calls Matrix admin API to delete user
   - Removes Hermes user record and associations

### 5.5 API Client Changes

**File:** `packages/client/src/api/auth.ts`

New API functions:

```typescript
// Matrix login
export async function matrixLogin(
  matrixAccessToken: string,
  matrixUserId: string,
  deviceId: string,
  homeserverUrl: string
): Promise<{ token: string; user: User }>;

// Matrix user management (super_admin only)
export async function fetchMatrixUsers(
  params: { page: number; pageSize: number }
): Promise<{ users: MatrixUser[]; total: number }>;

export async function createMatrixUser(
  data: {
    userId: string;
    password: string;
    displayName?: string;
    role: UserRole;
    profiles: string[];
  }
): Promise<User>;

export async function updateMatrixUser(
  id: string,
  data: {
    displayName?: string;
    role?: UserRole;
    status?: UserStatus;
    profiles?: string[];
  }
): Promise<User>;

export async function deleteMatrixUser(id: string): Promise<void>;
export async function deactivateMatrixUser(id: string, active: boolean): Promise<void>;
export async function resetMatrixUserPassword(id: string, password: string): Promise<void>;
```

---

## 6. Error Handling & Degradation

### 6.1 Matrix Connection Failure

| Scenario | Behavior |
|----------|----------|
| Login — Matrix unreachable | Return 503, UI shows "Cannot connect to Matrix homeserver. Check your homeserver URL or try local login." |
| Runtime — Matrix disconnect | Matrix features (chat, rooms) show offline indicator. Hermes core features (profiles, agent) remain available. |
| Admin API unavailable | Account Management shows banner: "Matrix admin API not configured. User management features are limited." Create/Delete/Disable buttons disabled. |

### 6.2 Permission Handling

| Scenario | Behavior |
|----------|----------|
| Non-super-admin accesses Account Management | Router guard redirects to Chat. API returns 403. |
| Matrix regular user tries admin action | API returns 403. UI shows permission error. |
| Matrix user demoted from admin | On next login, role recomputed. If no longer admin, loses super_admin. Hermes-independent super_admin grant preserved. |

### 6.3 User Lifecycle Edge Cases

| Scenario | Behavior |
|----------|----------|
| Matrix user disabled in Matrix | On next API request, backend detects via token validation or periodic sync. Clears Hermes JWT, redirects to login. |
| Matrix user deleted in Matrix | Same as disabled — token invalid, session terminated. |
| Hermes local user wants to link Matrix | Current Account shows "Link Matrix Account" button. Binding adds `matrix_user_id` without changing `auth_source`. |
| Matrix user with no Hermes record | Auto-created on first `matrixLogin()` with default role. |
| Last super_admin demotion | Blocked by existing `countActiveSuperAdmins()` check. |

### 6.4 Sync Strategy

**Primary: Real-time query**
- Every user list request calls Matrix admin API + queries local DB
- Pros: Data is always fresh
- Cons: Depends on Matrix API latency

**Fallback: Local cache**
- If Matrix admin API unavailable, serve from local `users` table
- Background sync job updates cache when API recovers

---

## 7. Testing Strategy

### 7.1 Backend Unit Tests

**File patterns:** `packages/server/src/**/*.test.ts`

| Module | Test Cases |
|--------|------------|
| `matrix-admin-service.ts` | Token validation, user info retrieval, list/create/update/delete/deactivate operations, error handling, retry logic |
| `auth.ts` controller | `matrixLogin` — new user creation, existing user update, admin role assignment, invalid token rejection, missing matrix_user_id handling |
| `users-store.ts` | `findByMatrixUserId`, `createFromMatrix`, `syncMatrixMetadata`, `updateMatrixUserMetadata` — CRUD operations, edge cases |
| `user-auth.ts` middleware | Matrix token validation path, JWT role parsing, `matrix-bypass-token` removal verification |

### 7.2 Frontend Unit Tests

**File patterns:** `packages/client/src/**/*.spec.ts`

| Component | Test Cases |
|-----------|------------|
| `auth.ts` store | `matrixLogin` action flow, `localLogin` preservation, `logout` cleanup, `fetchCurrentUser` state update |
| `auth.ts` API client | Request/response formatting, error handling, token attachment |

### 7.3 E2E Tests (Playwright)

**File patterns:** `tests/e2e/**/*.spec.ts`

| Flow | Test Cases |
|------|------------|
| Matrix Login | Enter homeserver/username/password → Matrix SDK login → Hermes `matrixLogin` → redirect to chat → verify JWT stored |
| Local Login (preserved) | Enter username/password → Hermes `/api/auth/login` → redirect to chat |
| Current Account | Verify Matrix identity displayed, display name editable, password change works |
| Account Management (super_admin) | Load user list, create user, edit role, disable user, delete user |
| Permission Denial | Admin user tries Account Management → redirect to chat |

### 7.4 Mock Matrix Server

```typescript
// Test helper: Mock Matrix API responses
const mockMatrixApi = {
  whoami: (token: string) => ({
    user_id: '@alice:matrix.org',
    device_id: 'DEVICE123'
  }),

  isAdmin: (userId: string) =>
    userId === '@admin:matrix.org',

  listUsers: (from: number, limit: number) => ({
    users: [
      { name: '@alice:matrix.org', displayname: 'Alice', avatar_url: 'mxc://...' },
      { name: '@bob:matrix.org', displayname: 'Bob', avatar_url: null },
    ],
    total: 2
  }),

  createUser: (userId: string, password: string) => ({ success: true }),
  deactivate: (userId: string) => ({ success: true }),
  resetPassword: (userId: string, password: string) => ({ success: true })
};
```

---

## 8. Implementation Phases

### Phase 1: Backend Foundation
1. Extend `users` table schema with Matrix columns
2. Implement `MatrixAdminService`
3. Add `matrixLogin()` to auth controller
4. Update auth middleware (remove bypass token, add Matrix validation)
5. Add new auth routes

### Phase 2: Frontend Login
1. Create `auth.ts` Pinia store
2. Redesign `LoginView.vue` with dual login tabs
3. Implement `matrixLogin()` API client
4. Update router guards

### Phase 3: Current Account
1. Redesign `AccountSettings.vue` with Matrix identity section
2. Implement display name update via Matrix API
3. Add password change via Matrix admin API
4. Add "Link Matrix Account" for local users

### Phase 4: Account Management
1. Implement `fetchMatrixUsers()` and related APIs
2. Redesign `UserManagementSettings.vue` with Matrix user list
3. Implement create/edit/delete/disable operations
4. Add Matrix admin API configuration UI in Platform settings

### Phase 5: Testing & Polish
1. Backend unit tests
2. Frontend unit tests
3. E2E tests with mock Matrix server
4. Error handling verification
5. Documentation update

---

## 9. File Change Summary

### New Files

| Path | Description |
|------|-------------|
| `packages/server/src/services/matrix-admin-service.ts` | Matrix admin API client |
| `packages/server/src/controllers/hermes/matrix-admin.ts` | Matrix admin proxy controller |
| `packages/client/src/stores/hermes/auth.ts` | Unified auth Pinia store |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/server/src/db/hermes/schemas.ts` | Add Matrix columns to users table |
| `packages/server/src/db/hermes/users-store.ts` | Add Matrix user lookup, creation, sync methods |
| `packages/server/src/controllers/auth.ts` | Add matrixLogin, matrix user CRUD |
| `packages/server/src/middleware/user-auth.ts` | Replace bypass token, add Matrix validation |
| `packages/server/src/routes/auth.ts` | Add Matrix login and user management routes |
| `packages/client/src/api/auth.ts` | Add Matrix login and user management APIs |
| `packages/client/src/views/LoginView.vue` | Dual login interface |
| `packages/client/src/components/hermes/settings/AccountSettings.vue` | Matrix identity display |
| `packages/client/src/components/hermes/settings/UserManagementSettings.vue` | Matrix user management |
| `packages/client/src/router/index.ts` | Update auth state references |

---

## 10. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Matrix homeserver admin API not available | Account Management CRUD fails | Graceful degradation — show read-only user list, disable admin actions |
| Matrix connection unstable | Login fails | Fallback to local login, show clear error messages |
| Existing local users broken | High | Preserve local login path fully, migration is optional |
| Role escalation | Security | Matrix admin check is verified server-side on every login, not cached |
| Data inconsistency | Medium | Real-time query strategy, fallback to local cache |
| Large user base performance | Medium | Implement pagination, consider background sync for >1000 users |

---

## 11. Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| How to identify Matrix users in Hermes? | Extend `users` table with `matrix_user_id` |
| Role system? | Hybrid: Matrix admin → super_admin; Hermes can independently grant |
| User list source? | Matrix admin API + Hermes metadata merge |
| Create/delete users? | Unified UI, calls Matrix admin API + updates Hermes metadata |
| Current Account display? | Matrix identity + Hermes config, unified view |
| Login flow? | Matrix login mandatory, Hermes auto-creates/looks up user record |

---

*Design approved by user on 2026-06-19. Ready for implementation planning.*
