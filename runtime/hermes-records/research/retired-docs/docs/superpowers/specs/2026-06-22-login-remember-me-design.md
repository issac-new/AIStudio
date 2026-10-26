# Login "Remember Me" Feature — Design Spec

**Date:** 2026-06-22
**Status:** Draft

---

## Overview

Add a "Remember Me" checkbox to both the Matrix Login and Local Login forms in `LoginView.vue`. When checked, the username and password are persisted to localStorage (password Base64-encoded). On subsequent visits, saved credentials are auto-filled and the checkbox re-checks itself.

## Scope

- **Matrix Login form:** Remember matrix username + matrix password. Homeserver URL already auto-saves on success (unchanged behavior).
- **Local Login form:** Remember local username + local password.

Each form has its own independent checkbox and storage keys.

## Storage

| Form | Key | Encoding |
|------|-----|----------|
| Matrix | `matrix_remembered_username` | plaintext |
| Matrix | `matrix_remembered_password` | Base64 (`btoa`/`atob`) |
| Local | `local_remembered_username` | plaintext |
| Local | `local_remembered_password` | Base64 (`btoa`/`atob`) |

## Behavior

### On Mount (page load)
1. Read username from localStorage → if present, fill into the corresponding form field.
2. Read password from localStorage → `atob` decode → if present, fill into password field.
3. If **both** username and password were restored, set `rememberMe = true` for that form.

### On Successful Login
- If `rememberMe` is **checked**: save username (plaintext) + password (Base64) to localStorage.
- If `rememberMe` is **unchecked**: remove both username and password keys from localStorage (clear previously saved credentials).

### On Failed Login
- No storage mutation. Never save incorrect credentials.

### Manual Uncheck (without submitting)
- Unchecking the checkbox does **not** clear already-saved credentials. The previous save remains in localStorage; on next page load the checkbox will re-check itself from saved data. To clear saved credentials, the user must uncheck *and* submit a successful login, or manually clear localStorage.

## Files Changed

### 1. `packages/client/src/views/LoginView.vue`

**Script:**
- Add `matrixRememberMe` and `localRememberMe` refs (boolean, default `false`).
- Add `loadSavedCredentials(formType)` helper called in `onMounted`.
- Add `saveCredentials(formType)` / `clearCredentials(formType)` helpers called in the success path of each login handler.
- In `handleMatrixLogin` success: persist homeserver URL (existing), then persist/clear matrix credentials based on `matrixRememberMe`.
- In `handleLocalLogin` success: persist/clear local credentials based on `localRememberMe`.

**Template:**
- Add a `<label class="login-remember">` with `<input type="checkbox">` in each form, between the password input and the error message div.

**Style:**
- Add `.login-remember` block — left-aligned, small font, consistent gap with surrounding elements.

### 2. `packages/client/src/i18n/locales/en.ts`
- Add key: `login.rememberMe: 'Remember me'`

### 3. `packages/client/src/i18n/locales/zh.ts`
- Add key: `login.rememberMe: '记住我'`

### 4. Remaining locale files (de, es, fr, ja, ko, pt, ru, zh-TW)
- Add key `login.rememberMe` with English fallback value `'Remember me'`.

## Out of Scope

- Browser Credential Management API (future enhancement).
- Per-field granular control (username vs password separately).
- Cross-browser/tab sync.
