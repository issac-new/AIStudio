import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { getDb } from '../infrastructure/database'
import { USER_PROFILES_TABLE, USER_THEMES_TABLE, USER_THEME_PRESETS_TABLE, USERS_TABLE } from '../infrastructure/database/schemas'

export type UserRole = 'super_admin' | 'admin'
export type UserStatus = 'active' | 'disabled'
export type UserId = number | string

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

export interface UserProfileRecord {
  user_id: number
  profile_name: string
  is_default: number
  created_at: number
}

export interface UserSummary {
  id: number
  username: string
  role: UserRole
  status: UserStatus
  profiles: string[]
  default_profile: string | null
  created_at: number
  updated_at: number
  last_login_at: number | null
  matrix_user_id: string | null
  matrix_display_name: string | null
  matrix_avatar_url: string | null
}

export const DEFAULT_USERNAME = 'admin'
// HERMES_CUSTOM[SecNoDefaultCred]: DEFAULT_PASSWORD（'123456'）已删——出厂不再有
// 已知默认口令；账号初始化走 CLI 随机密码或 Matrix 登录。
export const DEFAULT_PROFILE_NAME = 'default'

const SCRYPT_KEY_LEN = 64

function normalizeUserId(id: UserId): number | null {
  const userId = typeof id === 'number' ? id : Number(id)
  return Number.isInteger(userId) && userId > 0 ? userId : null
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, SCRYPT_KEY_LEN).toString('hex')
  return `scrypt:${salt}:${hash}`
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [scheme, salt, expectedHex] = passwordHash.split(':')
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false
  try {
    const expected = Buffer.from(expectedHex, 'hex')
    const actual = scryptSync(password, salt, expected.length)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

export function findUserById(id: UserId): UserRecord | null {
  const db = getDb()
  if (!db) return null
  const userId = normalizeUserId(id)
  if (!userId) return null
  const row = db.prepare(`SELECT * FROM ${USERS_TABLE} WHERE id = ?`).get(userId) as UserRecord | undefined
  return row || null
}

export function findUserByUsername(username: string): UserRecord | null {
  const db = getDb()
  if (!db) return null
  const row = db.prepare(`SELECT * FROM ${USERS_TABLE} WHERE username = ?`).get(username) as UserRecord | undefined
  return row || null
}

export function findByMatrixUserId(matrixUserId: string): UserRecord | null {
  const db = getDb()
  if (!db) return null
  const row = db.prepare(`SELECT * FROM ${USERS_TABLE} WHERE matrix_user_id = ?`).get(matrixUserId) as UserRecord | undefined
  return row || null
}

export function findFirstUser(): UserRecord | null {
  const db = getDb()
  if (!db) return null
  const row = db.prepare(`SELECT * FROM ${USERS_TABLE} ORDER BY id ASC LIMIT 1`).get() as UserRecord | undefined
  return row || null
}

export function listUsers(): UserSummary[] {
  const db = getDb()
  if (!db) return []
  const users = db.prepare(
    `SELECT id, username, role, status, created_at, updated_at, last_login_at, matrix_user_id, matrix_display_name, matrix_avatar_url FROM ${USERS_TABLE} ORDER BY id ASC`
  ).all() as Array<Omit<UserSummary, 'profiles' | 'default_profile'>>
  return users.map(user => {
    const profiles = listUserProfiles(user.id)
    return {
      ...user,
      profiles: profiles.map(profile => profile.profile_name),
      default_profile: profiles.find(profile => profile.is_default === 1)?.profile_name || null,
    }
  })
}

export function listUserProfiles(userId: UserId): UserProfileRecord[] {
  const db = getDb()
  if (!db) return []
  const id = normalizeUserId(userId)
  if (!id) return []
  return db.prepare(
    `SELECT * FROM ${USER_PROFILES_TABLE} WHERE user_id = ? ORDER BY is_default DESC, profile_name ASC`
  ).all(id) as unknown as UserProfileRecord[]
}

export function userCanAccessProfile(userId: UserId, profileName: string): boolean {
  const db = getDb()
  if (!db) return false
  const id = normalizeUserId(userId)
  if (!id) return false
  const row = db.prepare(
    `SELECT 1 FROM ${USER_PROFILES_TABLE} WHERE user_id = ? AND profile_name = ?`
  ).get(id, profileName)
  return !!row
}

export function getDefaultProfileForUser(userId: UserId): string {
  const db = getDb()
  if (!db) return DEFAULT_PROFILE_NAME
  const id = normalizeUserId(userId)
  if (!id) return DEFAULT_PROFILE_NAME
  const row = db.prepare(
    `SELECT profile_name FROM ${USER_PROFILES_TABLE} WHERE user_id = ? AND is_default = 1 LIMIT 1`
  ).get(id) as { profile_name?: string } | undefined
  return row?.profile_name || DEFAULT_PROFILE_NAME
}

export function countUsers(): number {
  const db = getDb()
  if (!db) return 0
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${USERS_TABLE}`).get() as { count?: number } | undefined
  return Number(row?.count || 0)
}

export function countActiveSuperAdmins(excludeUserId?: UserId): number {
  const db = getDb()
  if (!db) return 0
  const exclude = excludeUserId == null ? null : normalizeUserId(excludeUserId)
  const row = exclude
    ? db.prepare(`SELECT COUNT(*) as count FROM ${USERS_TABLE} WHERE role = 'super_admin' AND status = 'active' AND id != ?`).get(exclude)
    : db.prepare(`SELECT COUNT(*) as count FROM ${USERS_TABLE} WHERE role = 'super_admin' AND status = 'active'`).get()
  return Number((row as { count?: number } | undefined)?.count || 0)
}

export function touchUserLogin(userId: UserId, at = Date.now()): void {
  const db = getDb()
  if (!db) return
  const id = normalizeUserId(userId)
  if (!id) return
  db.prepare(`UPDATE ${USERS_TABLE} SET last_login_at = ?, updated_at = ? WHERE id = ?`).run(at, at, id)
}

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

export function updateUserPassword(userId: UserId, password: string): boolean {
  const db = getDb()
  if (!db) return false
  const id = normalizeUserId(userId)
  if (!id) return false
  const result = db.prepare(`UPDATE ${USERS_TABLE} SET password_hash = ?, updated_at = ? WHERE id = ?`)
    .run(hashPassword(password), Date.now(), id)
  return result.changes > 0
}

export function updateUsername(userId: UserId, username: string): boolean {
  const db = getDb()
  if (!db) return false
  const id = normalizeUserId(userId)
  if (!id) return false
  const result = db.prepare(`UPDATE ${USERS_TABLE} SET username = ?, updated_at = ? WHERE id = ?`)
    .run(username, Date.now(), id)
  return result.changes > 0
}

export function getUserAvatar(userId: UserId): string {
  const db = getDb()
  if (!db) return ''
  const id = normalizeUserId(userId)
  if (!id) return ''
  const row = db.prepare(`SELECT avatar FROM ${USERS_TABLE} WHERE id = ?`).get(id) as { avatar?: string } | undefined
  return row?.avatar || ''
}

export function setUserAvatar(userId: UserId, avatarJson: string): boolean {
  const db = getDb()
  if (!db) return false
  const id = normalizeUserId(userId)
  if (!id) return false
  const result = db.prepare(`UPDATE ${USERS_TABLE} SET avatar = ?, updated_at = ? WHERE id = ?`)
    .run(avatarJson ?? '', Date.now(), id)
  return result.changes > 0
}

export function createUser(input: {
  username: string
  password: string
  role?: UserRole
  status?: UserStatus
  profiles?: string[]
  defaultProfile?: string | null
}): UserRecord | null {
  const db = getDb()
  if (!db) return null
  const now = Date.now()
  const role = input.role || 'admin'
  const status = input.status || 'active'
  db.prepare(
    `INSERT INTO ${USERS_TABLE} (username, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(input.username, hashPassword(input.password), role, status, now, now)

  const user = findUserByUsername(input.username)
  if (user) replaceUserProfiles(user.id, input.profiles || [], input.defaultProfile)
  return user
}

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
  const user = findByMatrixUserId(data.matrixUserId)
  if (user) replaceUserProfiles(user.id, [DEFAULT_PROFILE_NAME], DEFAULT_PROFILE_NAME)
  return user
}

export function updateUser(input: {
  userId: UserId
  username?: string
  role?: UserRole
  status?: UserStatus
  password?: string
  profiles?: string[]
  defaultProfile?: string | null
}): UserRecord | null {
  const db = getDb()
  if (!db) return null
  const id = normalizeUserId(input.userId)
  if (!id) return null

  const current = findUserById(id)
  if (!current) return null

  const nextUsername = input.username ?? current.username
  const nextRole = input.role ?? current.role
  const nextStatus = input.status ?? current.status
  const nextPasswordHash = input.password ? hashPassword(input.password) : current.password_hash
  const now = Date.now()

  db.prepare(
    `UPDATE ${USERS_TABLE}
     SET username = ?, password_hash = ?, role = ?, status = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextUsername, nextPasswordHash, nextRole, nextStatus, now, id)

  if (input.profiles) replaceUserProfiles(id, input.profiles, input.defaultProfile)
  return findUserById(id)
}

export function deleteUser(userId: UserId): boolean {
  const db = getDb()
  if (!db) return false
  const id = normalizeUserId(userId)
  if (!id) return false
  db.exec('BEGIN')
  try {
    db.prepare(`DELETE FROM ${USER_PROFILES_TABLE} WHERE user_id = ?`).run(id)
    db.prepare(`DELETE FROM ${USER_THEME_PRESETS_TABLE} WHERE user_id = ?`).run(id)
    db.prepare(`DELETE FROM ${USER_THEMES_TABLE} WHERE user_id = ?`).run(id)
    const result = db.prepare(`DELETE FROM ${USERS_TABLE} WHERE id = ?`).run(id)
    db.exec('COMMIT')
    return result.changes > 0
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function replaceUserProfiles(userId: UserId, profiles: string[], defaultProfile?: string | null): void {
  const db = getDb()
  if (!db) return
  const id = normalizeUserId(userId)
  if (!id) return

  const uniqueProfiles = [...new Set(profiles.map(profile => profile.trim()).filter(Boolean))]
  const defaultName = defaultProfile && uniqueProfiles.includes(defaultProfile) ? defaultProfile : uniqueProfiles[0] || null
  const now = Date.now()

  db.exec('BEGIN')
  try {
    db.prepare(`DELETE FROM ${USER_PROFILES_TABLE} WHERE user_id = ?`).run(id)
    const stmt = db.prepare(
      `INSERT INTO ${USER_PROFILES_TABLE} (user_id, profile_name, is_default, created_at) VALUES (?, ?, ?, ?)`
    )
    uniqueProfiles.forEach(profile => {
      stmt.run(id, profile, profile === defaultName ? 1 : 0, now)
    })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function createSuperAdmin(username: string, password: string): UserRecord | null {
  const db = getDb()
  if (!db) return null
  if (!username || !password) return null

  const now = Date.now()
  db.prepare(
    `INSERT INTO ${USERS_TABLE} (username, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(username, hashPassword(password), 'super_admin', 'active', now, now)

  return findUserByUsername(username)
}
