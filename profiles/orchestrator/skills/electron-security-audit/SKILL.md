---
name: ipc-contract-signature-sync
description: >-
  When adding auth tokens to previously-unauthenticated IPC handlers in
  Electron apps, five layers must be updated in sync: handler, contract
  type, renderer calls, unit tests, and component test mocks. Missing
  any layer causes type errors or silent test failures. Use when
  modifying IPC channel signatures, adding authentication to IPC
  handlers, or fixing test failures after IPC contract changes.
version: 1.0.0
platforms: [macos, linux, windows]
metadata:
  hermes:
    tags: [electron, ipc, typescript, testing, contract]
    related_skills: [electron-security-audit, ai-code-testing, test-driven-development]
---

# IPC Contract Signature Sync

When you add a `token` parameter (or any new parameter) to IPC handlers
that previously didn't require authentication, you must update **five
layers** in sync. Missing any layer causes TypeScript type errors or
silent test failures.

## The Five Layers

### 1. IPC Handler (register.ts)
```typescript
// Before:
register('balance:get', (d, _e, userId, leaveType, year) => getBalance(d, userId, ...))
// After:
register('balance:get', (d, _e, token, userId, leaveType, year) => {
  const session = authService.me(d, token)
  if (session.userId !== userId && !can(session.role, 'adjust_balance'))
    throw new Error('无权查看他人额度')
  return getBalance(d, userId, ...)
})
```

### 2. IpcContract Type (shared/ipc.ts)
```typescript
// Before:
'balance:get': { args: [userId: string, leaveType: string, year: number]; result: ... }
// After:
'balance:get': { args: [token: string, userId: string, leaveType: string, year: number]; result: ... }
```

### 3. Renderer Calls (screens/*.tsx)
```typescript
// Before:
const r = await invoke('balance:get', session.userId, t, year)
// After:
const r = await invoke('balance:get', session.token, session.userId, t, year)
```

### 4. Unit Tests (tests/unit/**/*.test.ts)
```typescript
// Before:
const r = await invoke('cal:listHolidays', 2026)
// After:
const token = makeUser('ADMIN1', 'A1', 'admin')
const r = await invoke('cal:listHolidays', token, 2026)
```

### 5. Component Test Mocks (tests/component/*.test.tsx)
Mock implementations must update their parameter signatures:
```typescript
// Before:
invokeMock.mockImplementation((channel: string, _userId: string, leaveType: string) => { ... })
// After:
invokeMock.mockImplementation((channel: string, _token: string, _userId: string, leaveType: string) => { ... })
```

## Verification Workflow

1. After modifying all layers, run `npx vitest run --reporter=verbose`
2. Expect 3-5 failures per batch of signature changes
3. Each failure's stack trace points to a call site missing the new parameter
4. Fix iteratively — don't try to predict all call sites upfront
5. Re-run until 0 failures

## Batch Fix Pattern for Renderer Calls

Use Python regex in `execute_code` to batch-update renderer invoke calls:

```python
import re, os

renderer_dir = os.path.join(project, 'src/renderer/src')
for root, dirs, files in os.walk(renderer_dir):
    for f in files:
        if f.endswith('.tsx') or f.endswith('.ts'):
            fp = os.path.join(root, f)
            with open(fp, 'r') as fh:
                content = fh.read()
            modified = False

            # Determine token variable name (session.token vs token)
            token_var = 'session.token' if 'session.token' in content else 'token'

            # Pattern: invoke('channel', existingArgs) → invoke('channel', token, existingArgs)
            if re.search(r"invoke\('cal:listYear',\s*([^)]+)\)", content):
                content = re.sub(
                    r"invoke\('cal:listYear',\s*([^)]+)\)",
                    f"invoke('cal:listYear', {token_var}, \\1)",
                    content
                )
                modified = True

            if modified:
                with open(fp, 'w') as fh:
                    fh.write(content)
```

## Pitfalls

### NODE_ENV=production skips devDependencies
When `NODE_ENV=production` (common in Docker/CI), `npm install` silently
skips devDependencies. Vitest, @vitejs/plugin-react, and better-sqlite3
are devDependencies. Use `npm install --include=dev` to install them.

### npm allow-scripts blocks native module builds
better-sqlite3 needs `node-gyp rebuild` during install. npm's
`allow-scripts` policy blocks this. The warning says to run
`npm approve-scripts` but that command doesn't exist as an npx binary.
Workaround: `npm install --ignore-scripts` installs the JS files but
not native binaries. For test purposes (mocked DB), this is sufficient.

### LSP type errors from electron module resolution
TypeScript LSP may report "Cannot find module 'electron'" errors in
register.ts. These are pre-existing (electron-vite uses a different
module resolution than tsc). They do NOT indicate problems introduced
by your changes. Verify with `npx vitest run` instead of `npx tsc`.

### Missing token variable in component
Some renderer components receive `session` as a prop, others receive
`token` directly. Check which variable is available before using
`session.token` vs `token` in the batch fix regex.
