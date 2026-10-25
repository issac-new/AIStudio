<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "@/stores/hermes/auth";
import { resolveLoginRedirect } from "@/utils/login-redirect";

const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const activeTab = ref<'matrix' | 'local'>('matrix');

const homeserverUrl = ref("http://localhost:8008");
const matrixUsername = ref("@swarm:matrix.test");
const matrixPassword = ref("TestPass123!");

const localUsername = ref("");
const localPassword = ref("");

const matrixRememberMe = ref(false);
const localRememberMe = ref(false);
const loading = ref(false);
const errorMsg = ref("");

// overlay[nav]: 默认登录后跳驾驶舱总览 /app；保留 query.redirect 保真。
// 2026-09-18 统一导航裁决：与 router 守卫落点一致。
function loginRedirectTarget(): string {
  const resolved = resolveLoginRedirect(route.query.redirect);
  return resolved === "/hermes/chat" ? "/app" : resolved;
}

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
  if (username && password) {
    localStorage.setItem(keys.user, username);
    localStorage.setItem(keys.pass, encodePassword(password));
  }
}

function clearSavedCredentials(form: 'matrix' | 'local'): void {
  const keys = STORAGE_KEYS[form];
  localStorage.removeItem(keys.user);
  localStorage.removeItem(keys.pass);
}

onMounted(() => {
  const savedHs = localStorage.getItem('matrix_homeserver_url');
  if (savedHs) homeserverUrl.value = savedHs;
  loadSavedCredentials('matrix');
  loadSavedCredentials('local');
});

function classifyLoginError(err: any): string {
  const errcode = err?.errcode || err?.data?.errcode;
  if (errcode === 'M_FORBIDDEN' || errcode === 'M_UNKNOWN' || err?.httpStatus === 403) return t("login.invalidCredentials");
  const name = err?.name || err?.constructor?.name;
  const msg = String(err?.message || '');
  if (name === 'ConnectionError') return t("login.homeserverConnectionFailed");
  if (/Failed to fetch|NetworkError|ERR_CONNECTION|ERR_NETWORK|Load failed/i.test(msg)) return t("login.backendConnectionFailed");
  return msg || t("login.invalidCredentials");
}

async function handleMatrixLogin() {
  if (!homeserverUrl.value.trim()) { errorMsg.value = t("login.homeserverRequired"); return; }
  if (!matrixUsername.value.trim() || !matrixPassword.value) { errorMsg.value = t("login.credentialsRequired"); return; }
  loading.value = true; errorMsg.value = "";
  try {
    await authStore.matrixLogin(homeserverUrl.value.trim(), matrixUsername.value.trim(), matrixPassword.value);
    localStorage.setItem('matrix_homeserver_url', homeserverUrl.value.trim());
    if (matrixRememberMe.value) saveCredentials('matrix'); else clearSavedCredentials('matrix');
    router.replace(loginRedirectTarget());
  } catch (err: any) {
    errorMsg.value = classifyLoginError(err);
    clearSavedCredentials('matrix');
    if (errorMsg.value === t("login.backendConnectionFailed")) activeTab.value = 'local';
  } finally { loading.value = false; }
}

async function handleLocalLogin() {
  if (!localUsername.value.trim() || !localPassword.value) { errorMsg.value = t("login.credentialsRequired"); return; }
  loading.value = true; errorMsg.value = "";
  try {
    await authStore.localLogin(localUsername.value.trim(), localPassword.value);
    if (localRememberMe.value) saveCredentials('local'); else clearSavedCredentials('local');
    router.replace(loginRedirectTarget());
  } catch (err: any) {
    errorMsg.value = err?.message || t("login.invalidCredentials");
    clearSavedCredentials('local');
  } finally { loading.value = false; }
}
</script>

<template>
  <div class="login-view">
    <div class="login-card">
      <h1 class="login-title">{{ t("login.title") }}</h1>

      <!-- Matrix Login Form (default) -->
      <form v-if="activeTab === 'matrix'" class="login-form" @submit.prevent="handleMatrixLogin">
        <p class="login-desc">{{ t("login.matrixDescription") }}</p>
        <input v-model="homeserverUrl" type="url" class="login-input" :placeholder="t('login.homeserverPlaceholder')" autofocus />
        <input v-model="matrixUsername" type="text" class="login-input" :placeholder="t('login.matrixUsernamePlaceholder')" />
        <input v-model="matrixPassword" type="password" class="login-input" :placeholder="t('login.passwordPlaceholder')" @keyup.enter="handleMatrixLogin" />
        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
        <label class="login-remember"><input v-model="matrixRememberMe" type="checkbox" />{{ t("login.rememberMe") }}</label>
        <button type="submit" class="login-btn" :disabled="loading">{{ loading ? "..." : t("login.submit") }}</button>
      </form>

      <!-- Local Login Form (fallback) -->
      <form v-else-if="activeTab === 'local'" class="login-form" @submit.prevent="handleLocalLogin">
        <p class="login-fallback-hint">{{ t("login.fallbackToLocalHint") }}</p>
        <p class="login-desc">{{ t("login.localDescription") }}</p>
        <input v-model="localUsername" type="text" class="login-input" :placeholder="t('login.usernamePlaceholder')" autofocus />
        <input v-model="localPassword" type="password" class="login-input" :placeholder="t('login.passwordPlaceholder')" @keyup.enter="handleLocalLogin" />
        <div v-if="errorMsg" class="login-error">{{ errorMsg }}</div>
        <label class="login-remember"><input v-model="localRememberMe" type="checkbox" />{{ t("login.rememberMe") }}</label>
        <button type="submit" class="login-btn" :disabled="loading">{{ loading ? "..." : t("login.submit") }}</button>
        <button type="button" class="login-fallback-link" @click="activeTab = 'matrix'">{{ t("login.useMatrixLogin") }}</button>
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
  border: var(--border-width, 1px) solid $border-color;
  border-radius: $radius-lg;
  background: var(--theme-card-bg, $bg-card);
  text-align: center;

  @media (max-width: $breakpoint-mobile) {
    padding: calc(32px * var(--spacing-scale, 1)) calc(24px * var(--spacing-scale, 1));
  }
}

.login-title {
  font-size: calc(var(--font-size-base, 14px) * 26 / 14);
  font-weight: 600;
  color: $text-primary;
  margin: 0 0 10px;
}

.login-desc {
  font-size: calc(var(--font-size-base, 14px) * 14 / 14);
  color: $text-muted;
  margin: 0 0 12px;
  line-height: var(--line-height, 1.6);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: calc(14px * var(--spacing-scale, 1));
}

.login-input {
  width: 100%;
  padding: calc(14px * var(--spacing-scale, 1)) calc(16px * var(--spacing-scale, 1));
  border: var(--border-width, 1px) solid $border-color;
  border-radius: $radius-sm;
  font-size: calc(var(--font-size-base, 14px) * 15 / 14);
  color: $text-primary;
  background: var(--theme-input-bg, $bg-input);
  outline: none;
  transition: border-color $transition-fast;
  box-sizing: border-box;
  font-family: var(--font-code, $font-code);

  &::placeholder {
    color: $text-muted;
  }

  &:focus {
    border-color: $accent-primary;
  }
}

.login-error {
  font-size: calc(var(--font-size-base, 14px) * 13 / 14);
  color: $error;
  text-align: start;
}

.login-btn {
  width: 100%;
  padding: calc(14px * var(--spacing-scale, 1));
  border: none;
  border-radius: $radius-sm;
  background: $text-primary;
  color: var(--text-on-accent);
  font-size: calc(var(--font-size-base, 14px) * 15 / 14);
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

.login-fallback-hint {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid rgba(var(--warning-rgb), 0.35);
  border-radius: $radius-sm;
  background: rgba(var(--warning-rgb), 0.08);
  color: $text-secondary;
  font-size: 13px;
  line-height: 1.5;
  text-align: start;
}

.login-fallback-link {
  margin-top: 4px;
  padding: 6px;
  border: none;
  background: transparent;
  color: $text-muted;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  transition: color $transition-fast;

  &:hover { color: $text-primary; }
}

.login-remember {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: $text-secondary;
  cursor: pointer;

  input[type="checkbox"] { accent-color: $accent-primary; }
}
</style>
