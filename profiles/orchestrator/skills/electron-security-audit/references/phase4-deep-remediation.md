# Phase 4 Deep Remediation Patterns

Detailed fix templates for MEDIUM/LOW severity vulnerabilities and forensics
issues discovered during the BossEyeCodeX Phase 4 audit pass.

## Error Message Sanitization (CWE-209)

The `safe()` IPC wrapper returns `error.message` directly to the renderer.
SQLite internal errors leak system state. Add a sanitization layer:

```typescript
const SENSITIVE_PATTERNS = [
  /数据库未初始化/i,
  /SQLITE_/i,
  /no such table/i,
  /no such column/i,
  /disk I\/O error/i,
  /database is locked/i,
  /database disk image is malformed/i,
]
function sanitizeError(msg: string): string {
  for (const p of SENSITIVE_PATTERNS) {
    if (p.test(msg)) return '操作失败，请稍后重试'
  }
  return msg // business errors (无权限, 原密码错误) pass through
}
// In safe():
return err(sanitizeError(error.message), error.code)
```

**Key**: Business errors like "无权限" and "原密码错误" must NOT be sanitized —
they are intentional user-facing messages. Only sanitize internal/system errors.

## Session Token Rotation on Role Change (CWE-613)

After `org:updateUser` changes a user's role, old sessions must be invalidated
to prevent privilege escalation via stale tokens:

```typescript
import { destroyAllSessions } from '../auth/session'

register('org:updateUser', (d, _e, token, userId, fields) => {
  const session = authService.me(d, token)
  if (!can(session.role, 'manage_users')) throw new Error('无权限')
  const result = updateUser(d, userId, fields)
  logAudit(d, { actor: session.userId, action: 'update_user', ... })
  if (fields.role) { destroyAllSessions(d, userId) } // force re-login
  return result
})
```

**Key**: Non-role updates (name, position) should NOT destroy sessions — only
role changes invalidate the authorization context.

## Audit Log Coverage Expansion (CWE-778)

Add `logAudit()` calls to handlers performing sensitive operations:

```typescript
import { logAudit } from '../audit/logger'

// After each critical operation:
logAudit(d, { actor: session.userId, action: 'create_user', targetType: 'user', targetId: user.id, afterJson: JSON.stringify({ role: user.role }) })
```

Cover at minimum these 10 operations:
1. `create_user` (org:createUser)
2. `deactivate_user` (org:deactivateUser)
3. `update_user` (org:updateUser)
4. `adjust_balance` (balance:adjust)
5. `create_approval_flow` (approval:createFlow)
6. `update_approval_flow` (approval:updateFlow)
7. `delete_approval_flow` (approval:deleteFlow)
8. `approve_{type}` (approval:act)
9. `backup_now` (backup:now)
10. `restore_backup` (backup:restore)

## Approval Approver Verification (CWE-285)

Verify the caller is the assigned approver for the current step, not just any
user with `approve_others` permission:

```typescript
try {
  const flowRow = d.prepare(
    'SELECT af.steps FROM approval_flows af WHERE af.id IN ' +
    '(SELECT flow_id FROM approval_flow_assignments WHERE request_type = ?)'
  ).get(requestType) as { steps: string } | undefined

  if (flowRow?.steps) {
    const steps = JSON.parse(flowRow.steps) as Array<{ approverId?: string }>
    if (steps[0]?.approverId && steps[0].approverId !== session.userId)
      throw new Error('您不是当前步骤的指定审批人')
  }
} catch (e) {
  if ((e as Error).message.includes('指定审批人')) throw e
  // Table doesn't exist or query fails → fall through to self-approval check
}
```

**Key**: Wrap in try/catch — if the `approval_flow_assignments` table doesn't
exist (fresh install), the query will throw. Fall through to the existing
self-approval check in `actOnRequest()` rather than crashing.

## Backup Restore Functional Fix (CWE-454)

`restoreBackup()` that only snapshots but never replaces the database is a
silent functional bug — tests pass because `r.ok === true` but data is never
restored. Fix: decrypt backup → write temp file → open as readonly source →
transactional table-by-table DELETE + INSERT → secure-delete temp file.

```typescript
const { iv, tag, ciphertext } = deserialize(data)
const plain = decrypt(opts.key, iv, ciphertext, tag)
const tempPath = join(opts.backupDir, `.restore-${now}.db`)
writeFileSync(tempPath, plain)
const Database = require('better-sqlite3')
const srcDb = new Database(tempPath, { readonly: true })

opts.db.exec('BEGIN')
try {
  const tables = srcDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  ).all() as Array<{ name: string }>

  for (const { name: tbl } of tables) {
    opts.db.exec(`DELETE FROM "${tbl}"`)
    const rows = srcDb.prepare(`SELECT * FROM "${tbl}"`).all()
    if (rows.length > 0) {
      const cols = Object.keys(rows[0])
      const placeholders = cols.map(() => '?').join(',')
      const stmt = opts.db.prepare(
        `INSERT OR REPLACE INTO "${tbl}" (${cols.join(',')}) VALUES (${placeholders})`
      )
      for (const row of rows) stmt.run(...cols.map(c => row[c]))
    }
  }
  opts.db.exec('COMMIT')
} catch (e) {
  opts.db.exec('ROLLBACK')
  throw e
} finally {
  srcDb.close()
  // Secure-delete temp file
  try {
    const fd = require('node:fs').openSync(tempPath, 'r+')
    const buf = Buffer.alloc(plain.length, 0)
    require('node:fs').writeSync(fd, buf, 0, buf.length, 0)
    require('node:fs').closeSync(fd)
    require('node:fs').unlinkSync(tempPath)
  } catch { /* ignore */ }
}
```

**Test verification**: Add assertion to verify data was actually restored:
```typescript
const userCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
expect(userCount).toBe(1) // backup contained 1 user
```

## Audit Key Startup Check (CWE-321)

Add to `runStartupHealthCheck()` — verify audit key is persisted, not
ephemeral. If keyring is unavailable and no env var is set, return
`pass: false` with a clear message:

```typescript
if (!process.env.NODE_ENV?.includes('test') && !process.env.BOSS_EYE_TEST) {
  let keyConfigured = false
  try {
    const { Keyring } = require('@napi-rs/keyring')
    const entry = new Keyring({ service: 'BossEye', account: 'audit-secret' })
    if (entry.getPassword()) keyConfigured = true
  } catch { /* keyring not available */ }
  if (!keyConfigured && !process.env.BOSS_EYE_AUDIT_SECRET) {
    auditCheckOk = false
    auditDetail = '审计密钥未持久化，重启后旧审计链将无法验证。请配置 keyring 或 BOSS_EYE_AUDIT_SECRET 环境变量。'
  }
}
```

**Key**: Skip this check in test environments — keyring is unavailable in CI
and tests use deterministic secrets.

## Hash Chain Empty Table Detection (CWE-778)

`verifyChain()` on an empty `audit_logs` table returns `{ ok: true }` —
indistinguishable from "all entries verified". Add `verifyChainSafe()`:

```typescript
export function verifyChainSafe(db: DB, secret: string): ChainVerifyResult {
  const base = verifyChain(db, secret)
  if (base.ok && base.count === 0) {
    return { ...base, reason: '审计日志为空（可能是全新安装或日志被删除）' }
  }
  return base
}
```

## Pitfalls Discovered in Phase 4

- **restoreBackup() unhandled rejection**: `opts.db.backup()` inside
  restoreBackup leaves an unhandled promise that fires after tests complete.
  Remove unnecessary `db.backup()` calls — the SQL transaction approach
  (DELETE + INSERT per table) doesn't need the Online Backup API.
- **Approval flow table may not exist**: Querying `approval_flow_assignments`
  on a fresh install throws. Wrap in try/catch and fall through.
- **Audit key health check must skip test env**: Otherwise CI fails because
  keyring is unavailable.
- **M-02 over-sanitization risk**: Don't sanitize business errors like "无权限"
  or "原密码错误" — only sanitize SQLite/internal system errors.
