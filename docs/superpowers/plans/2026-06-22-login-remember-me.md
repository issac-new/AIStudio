# Login "Remember Me" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Remember Me" checkbox to both Matrix and Local login forms that persists username + Base64-encoded password to localStorage, with auto-fill on page load.

**Architecture:** In-component logic in `LoginView.vue` — two independent refs (`matrixRememberMe` / `localRememberMe`), a shared helper for load/save/clear operations keyed by form type. On mount, read localStorage and restore credentials. On successful login, save or clear based on checkbox state.

**Tech Stack:** Vue 3 Composition API (`<script setup>`), TypeScript, SCSS, vue-i18n

---

## File Structure

| File | Responsibility |
|------|---------------|
| `packages/client/src/views/LoginView.vue` | Form logic, localStorage I/O, checkbox, styles |
| `packages/client/src/i18n/locales/en.ts` | English string `login.rememberMe` |
| `packages/client/src/i18n/locales/zh.ts` | Chinese string `login.rememberMe` |
| `packages/client/src/i18n/locales/de.ts` | Fallback (en) string |
| `packages/client/src/i18n/locales/es.ts` | Fallback (en) string |
| `packages/client/src/i18n/locales/fr.ts` | Fallback (en) string |
| `packages/client/src/i18n/locales/ja.ts` | Fallback (en) string |
| `packages/client/src/i18n/locales/ko.ts` | Fallback (en) string |
| `packages/client/src/i18n/locales/pt.ts` | Fallback (en) string |
| `packages/client/src/i18n/locales/ru.ts` | Fallback (en) string |
| `packages/client/src/i18n/locales/zh-TW.ts` | Fallback (en) string |

---

### Task 1: Add i18n keys to all locale files

**Files:**
- Modify: `packages/client/src/i18n/locales/en.ts`
- Modify: `packages/client/src/i18n/locales/zh.ts`
- Modify: `packages/client/src/i18n/locales/de.ts`
- Modify: `packages/client/src/i18n/locales/es.ts`
- Modify: `packages/client/src/i18n/locales/fr.ts`
- Modify: `packages/client/src/i18n/locales/ja.ts`
- Modify: `packages/client/src/i18n/locales/ko.ts`
- Modify: `packages/client/src/i18n/locales/pt.ts`
- Modify: `packages/client/src/i18n/locales/ru.ts`
- Modify: `packages/client/src/i18n/locales/zh-TW.ts`

- [ ] **Step 1: Add `rememberMe` key to en.ts**

In `packages/client/src/i18n/locales/en.ts`, after the `useMatrixLogin` line (line 21), add:

```ts
    rememberMe: 'Remember me',
```

The surrounding context should look like:

```ts
    backendConnectionFailed: 'Connected to the Homeserver, but cannot reach the Hermes backend. Is the backend running?',
    fallbackToLocalHint: 'Matrix login succeeded but the backend is unreachable. You can sign in with a local account instead.',
    useMatrixLogin: 'Use Matrix login',
    rememberMe: 'Remember me',
    passwordLogin: 'Password',
```

- [ ] **Step 2: Add `rememberMe` key to zh.ts**

In `packages/client/src/i18n/locales/zh.ts`, after the `backendConnectionFailed` line, add:

```ts
    rememberMe: '记住我',
```

The surrounding context should look like:

```ts
    backendConnectionFailed: '已连接到 Homeserver，但无法访问 Hermes 后端。请确认后端服务已启动。',
    rememberMe: '记住我',
    passwordLogin: '密码登录',
```

- [ ] **Step 3: Add `rememberMe` key to de.ts**

In `packages/client/src/i18n/locales/de.ts`, after the `sessionExpired` line (line 26), add:

```ts
    rememberMe: 'Remember me',
```

- [ ] **Step 4: Add `rememberMe` key to es.ts**

In `packages/client/src/i18n/locales/es.ts`, after the `sessionExpired` line (line 26), add:

```ts
    rememberMe: 'Remember me',
```

- [ ] **Step 5: Add `rememberMe` key to fr.ts**

In `packages/client/src/i18n/locales/fr.ts`, after the `sessionExpired` line (line 26), add:

```ts
    rememberMe: 'Remember me',
```

- [ ] **Step 6: Add `rememberMe` key to ja.ts**

In `packages/client/src/i18n/locales/ja.ts`, after the `sessionExpired` line (line 26), add:

```ts
    rememberMe: 'Remember me',
```

- [ ] **Step 7: Add `rememberMe` key to ko.ts**

In `packages/client/src/i18n/locales/ko.ts`, after the `sessionExpired` line (line 26), add:

```ts
    rememberMe: 'Remember me',
```

- [ ] **Step 8: Add `rememberMe` key to pt.ts**

In `packages/client/src/i18n/locales/pt.ts`, after the `sessionExpired` line (line 26), add:

```ts
    rememberMe: 'Remember me',
```

- [ ] **Step 9: Add `rememberMe` key to ru.ts**

In `packages/client/src/i18n/locales/ru.ts`, after the `sessionExpired` line (line 24), add:

```ts
    rememberMe: 'Remember me',
```

- [ ] **Step 10: Add `rememberMe` key to zh-TW.ts**

In `packages/client/src/i18n/locales/zh-TW.ts`, after the `sessionExpired` line (line 26), add:

```ts
    rememberMe: 'Remember me',
```

- [ ] **Step 11: Verify no TypeScript errors in locale files**

Run: `cd upstream/hermes-studio && npx tsc --noEmit packages/client/src/i18n/locales/en.ts packages/client/src/i18n/locales/zh.ts 2>&1 | head -20`
Expected: No errors (or only pre-existing errors unrelated to our changes)

- [ ] **Step 12: Commit locale changes**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
git add packages/client/src/i18n/locales/*.ts
git commit -m "feat: add rememberMe i18n key to all locales"
```

---

### Task 2: Add remember-me logic and UI to LoginView.vue

**Files:**
- Modify: `packages/client/src/views/LoginView.vue`

#### 2A: Add refs and helper functions in `<script setup>`

- [ ] **Step 1: Add rememberMe refs**

After line 19 (`const localPassword = ref("");`), add two new refs:

```ts
const matrixRememberMe = ref(false);
const localRememberMe = ref(false);
```

- [ ] **Step 2: Add localStorage key constants and helpers**

After the two new refs (after `const localRememberMe = ref(false);`), add:

```ts
// Remember-me localStorage keys
const STORAGE_KEYS = {
  matrix: { user: 'matrix_remembered_username', pass: 'matrix_remembered_password' },
  local: { user: 'local_remembered_username', pass: 'local_remembered_password' },
} as const;

function encodePassword(pw: string): string {
  try { return btoa(pw); } catch { return ''; }
}

function decodePassword(encoded: string): string {
  try { return atob(encoded); } catch { return ''; }
}

function loadSavedCredentials(form: 'matrix' | 'local'): boolean {
  const keys = STORAGE_KEYS[form];
  const savedUser = localStorage.getItem(keys.user);
  const savedPass = localStorage.getItem(keys.pass);
  if (savedUser !== null && savedPass !== null) {
    if (form === 'matrix') {
      matrixUsername.value = savedUser;
      matrixPassword.value = decodePassword(savedPass);
      matrixRememberMe.value = true;
    } else {
      localUsername.value = savedUser;
      localPassword.value = decodePassword(savedPass);
      localRememberMe.value = true;
    }
    return true;
  }
  return false;
}

function saveCredentials(form: 'matrix' | 'local'): void {
  const keys = STORAGE_KEYS[form];
  const username = form === 'matrix' ? matrixUsername.value.trim() : localUsername.value.trim();
  const password = form === 'matrix' ? matrixPassword.value : localPassword.value;
  localStorage.setItem(keys.user, username);
  localStorage.setItem(keys.pass, encodePassword(password));
}

function clearCredentials(form: 'matrix' | 'local'): void {
  const keys = STORAGE_KEYS[form];
  localStorage.removeItem(keys.user);
  localStorage.removeItem(keys.pass);
}
```

- [ ] **Step 3: Update `onMounted` to call `loadSavedCredentials`**

Replace the existing `onMounted` block (lines 25-28):

```ts
onMounted(() => {
  const savedHs = localStorage.getItem('matrix_homeserver_url');
  if (savedHs) homeserverUrl.value = savedHs;
});
```

with:

```ts
onMounted(() => {
  const savedHs = localStorage.getItem('matrix_homeserver_url');
  if (savedHs) homeserverUrl.value = savedHs;
  loadSavedCredentials('matrix');
  loadSavedCredentials('local');
});
```

- [ ] **Step 4: Update `handleMatrixLogin` to save/clear credentials on success**

In `handleMatrixLogin`, after the `localStorage.setItem('matrix_homeserver_url', ...)` line, add credential persistence. Replace lines 83-86:

```ts
    // Persist the working homeserver so the user does not have to re-enter it.
    // Only saved on success, never on a failed attempt.
    localStorage.setItem('matrix_homeserver_url', homeserverUrl.value.trim());
    router.replace("/hermes/cockpit");
```

with:

```ts
    // Persist the working homeserver so the user does not have to re-enter it.
    // Only saved on success, never on a failed attempt.
    localStorage.setItem('matrix_homeserver_url', homeserverUrl.value.trim());
    // Remember-me: save or clear credentials based on checkbox
    if (matrixRememberMe.value) {
      saveCredentials('matrix');
    } else {
      clearCredentials('matrix');
    }
    router.replace("/hermes/cockpit");
```

- [ ] **Step 5: Update `handleLocalLogin` to save/clear credentials on success**

In `handleLocalLogin`, after `authStore.localLogin(...)` succeeds, add credential persistence. Replace lines 112-113:

```ts
    await authStore.localLogin(localUsername.value.trim(), localPassword.value);
    router.replace("/hermes/cockpit");
```

with:

```ts
    await authStore.localLogin(localUsername.value.trim(), localPassword.value);
    // Remember-me: save or clear credentials based on checkbox
    if (localRememberMe.value) {
      saveCredentials('local');
    } else {
      clearCredentials('local');
    }
    router.replace("/hermes/cockpit");
```

#### 2B: Add checkbox to template

- [ ] **Step 6: Add "Remember Me" checkbox to Matrix login form**

In the Matrix form template, after the password input and before the error div, add a checkbox. Replace lines 148-149:

```html
          @keyup.enter="handleMatrixLogin"
        />
        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
```

with:

```html
          @keyup.enter="handleMatrixLogin"
        />
        <label class="login-remember">
          <input type="checkbox" v-model="matrixRememberMe" />
          {{ t("login.rememberMe") }}
        </label>
        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
```

- [ ] **Step 7: Add "Remember Me" checkbox to Local login form**

In the Local form template, after the password input and before the error div, add a checkbox. Replace lines 172-173:

```html
          @keyup.enter="handleLocalLogin"
        />
        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
```

with:

```html
          @keyup.enter="handleLocalLogin"
        />
        <label class="login-remember">
          <input type="checkbox" v-model="localRememberMe" />
          {{ t("login.rememberMe") }}
        </label>
        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
```

#### 2C: Add styles

- [ ] **Step 8: Add `.login-remember` style block**

After the `.login-error` style block (after line 258), add:

```scss
.login-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: $text-muted;
  cursor: pointer;
  user-select: none;
  text-align: left;

  input[type="checkbox"] {
    width: 15px;
    height: 15px;
    margin: 0;
    cursor: pointer;
    accent-color: $accent-primary;
  }
}
```

- [ ] **Step 9: Verify the Vue file compiles**

Run: `cd upstream/hermes-studio && npx vue-tsc --noEmit --project packages/client/tsconfig.json 2>&1 | grep -i "LoginView" | head -10`
Expected: No errors mentioning LoginView

- [ ] **Step 10: Commit LoginView changes**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
git add packages/client/src/views/LoginView.vue
git commit -m "feat: add remember-me checkbox to Matrix and Local login forms"
```

---

### Task 3: Final verification

- [ ] **Step 1: Build check**

Run: `cd upstream/hermes-studio && npm run build -- --mode development 2>&1 | tail -20`
Expected: Build succeeds without errors

- [ ] **Step 2: Visual smoke test (manual)**

Start the dev server and verify:
1. Open the login page — both forms show a "Remember me" checkbox below the password field
2. Enter credentials, check "Remember me", submit
3. Reload the page — credentials are auto-filled and checkbox is checked
4. Uncheck "Remember me", submit — credentials are cleared on reload
5. Failed login does NOT save credentials
6. Both Matrix and Local forms work independently
