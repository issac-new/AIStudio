<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useI18n } from 'vue-i18n'

const store = useCockpitStore()
const { t } = useI18n()

const emit = defineEmits<{ (e: 'history'): void }>()

function handleClick(item: { taskId: string; title: string }) {
  store.focusOnTaskFromAttention(item.taskId, item.title)
}

function handleHistoryClick() {
  emit('history')
}

function goSwarmKanban() {
  store.swarmKanbanVisible = true
}

// ── 刷新按钮：30s 倒计时 → 自动触发 → 错误暂停 ──
const REFRESH_SEC = 30
const countdown = ref(REFRESH_SEC)
const refreshing = ref(false)
const refreshError = ref(false)
let _cdTimer: ReturnType<typeof setInterval> | null = null

function startCountdown() {
  stopCountdown()
  _cdTimer = setInterval(() => {
    if (refreshing.value) return
    if (countdown.value > 0) countdown.value--
    if (countdown.value === 0 && !refreshing.value && !refreshError.value) {
      doRefresh(false)
    }
  }, 1000)
}
function stopCountdown() {
  if (_cdTimer) { clearInterval(_cdTimer); _cdTimer = null }
}
function resetCountdown() { countdown.value = REFRESH_SEC }

async function doRefresh(force: boolean) {
  refreshing.value = true
  refreshError.value = false
  try {
    const ok = await store.refreshAllBoards(force)
    if (ok) resetCountdown()
    else { refreshError.value = true; stopCountdown() }
  } catch {
    refreshError.value = true
    stopCountdown()
  }
  refreshing.value = false
}

function handleRefreshClick() {
  doRefresh(true)
}

onMounted(() => { startCountdown() })
onUnmounted(() => { stopCountdown() })
</script>

<template>
  <div class="cockpit-attention">
    <div class="cockpit-attention__label">
      <button type="button"
        class="cockpit-attention__refresh"
        :class="{ 'is-spinning': refreshing, 'is-error': refreshError }"
        :title="refreshError ? t('cockpit.refreshFailed') : t('cockpit.refreshAll', { n: countdown })"
        :disabled="refreshing"
        @click="handleRefreshClick">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        <span class="cockpit-attention__refresh-cd">{{ countdown }}</span>
      </button>
      <button type="button" class="cockpit-attention__tab" @click="goSwarmKanban" :title="t('sidebar.swarmKanban')">⊞ {{ t('sidebar.swarmKanban') }}</button>
    </div>
    <div class="cockpit-attention__items">
      <span v-if="store.attention.length === 0" class="cockpit-attention__empty">{{ t('cockpit.noAttention') }}</span>
      <button
        v-for="item in store.attention"
        :key="item.id"
        type="button"
        class="cockpit-attention__item"
        :class="['is-' + item.severity, 'is-' + item.status]"
        @click="handleClick(item)"
      >
        <span class="cockpit-attention__sev-bar" />
        <span class="cockpit-attention__text">{{ item.title }}</span>
        <span class="cockpit-attention__arrow">→</span>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cockpit-attention {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  min-height: 40px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-card);
}
.cockpit-attention__label {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border-right: 1px solid var(--border-color);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}
.cockpit-attention__refresh {
  width: auto; min-width: 24px; height: 20px; border-radius: 4px; border: 1px solid var(--border-color);
  background: var(--bg-card); color: var(--text-muted); cursor: pointer; flex-shrink: 0;
  display: inline-flex; align-items: center; gap: 2px; padding: 0 4px;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
  &:hover:not(:disabled) { background: var(--bg-secondary); color: var(--accent-primary); border-color: var(--accent-primary); }
  &:disabled { opacity: 0.5; cursor: default; }
  &.is-spinning svg { animation: att-refresh-spin 0.8s linear infinite; }
  &.is-error {
    border-color: var(--warning, #e6a23c); color: var(--warning, #e6a23c); background: rgba(230, 162, 60, 0.08);
    &:hover:not(:disabled) { border-color: var(--warning, #e6a23c); color: var(--warning, #e6a23c); background: rgba(230, 162, 60, 0.15); }
    .cockpit-attention__refresh-cd { animation: att-refresh-pulse 1.2s ease-in-out infinite; }
  }
  svg { flex-shrink: 0; }
}
.cockpit-attention__refresh-cd {
  font-size: 9px; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 12px; text-align: center;
}
@keyframes att-refresh-spin { to { transform: rotate(360deg); } }
@keyframes att-refresh-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.cockpit-attention__label-text { white-space: nowrap; }
.cockpit-attention__tab {
  flex-shrink: 0; cursor: pointer;
  font-size: 13px; font-weight: 600; font-family: inherit; color: var(--text-primary);
  background: var(--bg-secondary); border: 1px solid var(--border-color);
  border-radius: 6px; padding: 5px 12px;
  transition: background 0.12s, border-color 0.12s;
  &:hover { background: var(--bg-card-hover); border-color: var(--text-muted); }
}
.cockpit-attention__items {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
.cockpit-attention__item {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  transition: background 0.12s, border-color 0.12s;
  &:hover { background: var(--bg-card-hover); border-color: var(--text-muted); }
  &.is-high { font-weight: 600; }
}
.cockpit-attention__sev-bar {
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--text-muted);
  flex-shrink: 0;
}
.is-high .cockpit-attention__sev-bar { background: var(--error); }
.is-medium .cockpit-attention__sev-bar { background: var(--warning); }
/* 按状态区分色条颜色 */
.is-blocked .cockpit-attention__sev-bar { background: var(--error); }
.is-triage .cockpit-attention__sev-bar { background: var(--success, #52c41a); }
.is-review .cockpit-attention__sev-bar { background: var(--warning); }
.cockpit-attention__text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}
.cockpit-attention__arrow { font-size: 10px; color: var(--text-muted); }
.cockpit-attention__empty { font-size: 11px; color: var(--text-muted); padding: 0 4px; }
</style>