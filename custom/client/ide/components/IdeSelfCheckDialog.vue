<script setup lang="ts">
// IdeSelfCheckDialog — IDE 全能力自检弹层。
// 命令面板「IDE 自检（全能力冒烟）」入口；只读探针串起会话/工作区/文件/
// Git/存储/命令/工作流/深链等主链路，输出可复制的报告。
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIdeStore } from '../store/ide'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { useChatStore } from '@/stores/hermes/chat'
import { authFetch } from '../utils/auth-fetch'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'
import {
  IDE_SIDE_PANE_TAB_COUNT,
  formatSelfCheckReport,
  runSelfChecks,
  selfCheckSummary,
  type SelfCheckResult,
} from '../utils/selfCheck'

const { locale } = useI18n()
const tx = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].selfCheck)
const ide = useIdeStore()
const { root } = useIdeWorkspace()
const chat = useChatStore()

const results = ref<SelfCheckResult[]>([])
const running = ref(false)
const copied = ref(false)
const summary = computed(() => selfCheckSummary(results.value))

function countRawI18nKeys(): number {
  const text = document.body?.innerText ?? ''
  const keys = text.match(/\bide\.[A-Za-z0-9_.]+/g) ?? []
  // 自检自身的示例串不算产品裸键
  return new Set(keys.filter(key => key !== 'ide.xxx')).size
}

async function run(): Promise<void> {
  if (running.value) return
  running.value = true
  copied.value = false
  try {
    results.value = await runSelfChecks({
      authFetch,
      workspace: root.value,
      sessionsLoaded: chat.sessionsLoaded,
      sessionCount: chat.sessions.length,
      activeSessionId: chat.activeSessionId,
      sidePaneTabs: IDE_SIDE_PANE_TAB_COUNT,
      rawI18nKeys: countRawI18nKeys(),
      // 存储扫描有 4s 预算、工作流经引擎 RPC；并发自检下给足 15s
      timeoutMs: 15_000,
      locale: ideLocaleOf(locale),
    })
  } finally {
    running.value = false
  }
}

async function copyReport(): Promise<void> {
  const text = formatSelfCheckReport(results.value, ideLocaleOf(locale))
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
  } catch {
    copied.value = false
  }
}

function close(): void {
  ide.closeSelfCheck()
}

function onWindowKeydown(event: KeyboardEvent): void {
  if (ide.selfCheckOpen && event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}
watch(() => ide.selfCheckOpen, (open) => { if (open) void run() })
onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onUnmounted(() => window.removeEventListener('keydown', onWindowKeydown))

const STATUS_ICON: Record<SelfCheckResult['status'], string> = { pass: '✓', warn: '!', fail: '✕' }

</script>

<template>
  <Teleport to="body">
    <div v-if="ide.selfCheckOpen" class="ide-selfcheck" data-testid="ide-selfcheck" @click.self="close">
      <div class="ide-selfcheck__panel" role="dialog" aria-modal="true" aria-label="IDE 全能力自检">
        <header class="ide-selfcheck__head">
          <b>{{ tx.title }}</b>
          <span v-if="results.length" class="ide-selfcheck__summary" data-testid="ide-selfcheck-summary">
            {{ summary.pass }} 通过 · {{ summary.warn }} 告警 · {{ summary.fail }} 失败
          </span>
          <span class="ide-selfcheck__spacer" />
          <button type="button" class="ide-selfcheck__btn" data-testid="ide-selfcheck-rerun" :disabled="running" @click="run">
            {{ running ? tx.running : tx.rerun }}
          </button>
          <button type="button" class="ide-selfcheck__btn" data-testid="ide-selfcheck-copy" :disabled="!results.length" @click="copyReport">
            {{ copied ? tx.copied : tx.copy }}
          </button>
          <button type="button" class="ide-selfcheck__btn" data-testid="ide-selfcheck-close" @click="close">✕</button>
        </header>
        <p class="ide-selfcheck__hint">
          只读探针：不修改会话/仓库/配置；存储扫描与工作流引擎依赖当前环境。
        </p>
        <ul v-if="results.length" class="ide-selfcheck__list" data-testid="ide-selfcheck-list">
          <li
            v-for="item in results"
            :key="item.id"
            class="ide-selfcheck__row"
            :class="`is-${item.status}`"
            :data-testid="`ide-selfcheck-${item.id}`"
          >
            <span class="ide-selfcheck__icon">{{ STATUS_ICON[item.status] }}</span>
            <span class="ide-selfcheck__label">{{ item.label }}</span>
            <span class="ide-selfcheck__detail" :title="item.detail">{{ item.detail }}</span>
            <span class="ide-selfcheck__ms">{{ item.ms }}ms</span>
            <span class="ide-selfcheck__status">{{ item.status === 'pass' ? tx.pass : item.status === 'warn' ? tx.warn : tx.fail }}</span>
          </li>
        </ul>
        <p v-else class="ide-selfcheck__hint">{{ running ? tx.runningList : tx.notRun }}</p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.ide-selfcheck {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
}
.ide-selfcheck__panel {
  width: min(760px, calc(100vw - 40px));
  max-height: min(640px, calc(100vh - 60px));
  display: flex;
  flex-direction: column;
  background: var(--card-color);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.ide-selfcheck__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}
.ide-selfcheck__summary { font-size: 11px; color: var(--text-muted); }
.ide-selfcheck__spacer { flex: 1; }
.ide-selfcheck__btn {
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  border-radius: 5px;
  height: 24px;
  padding: 0 10px;
  font-size: 11px;
  cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--accent-primary); }
  &:disabled { opacity: 0.45; cursor: not-allowed; }
}
.ide-selfcheck__hint { margin: 8px 14px; font-size: 11px; color: var(--text-muted); }
.ide-selfcheck__list { list-style: none; margin: 0; padding: 0 14px 12px; overflow-y: auto; }
.ide-selfcheck__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  &:hover { background: var(--bg-secondary); }
  &.is-pass .ide-selfcheck__icon { color: var(--success-color, #63b36f); }
  &.is-warn .ide-selfcheck__icon { color: var(--warning-color, #d8a657); }
  &.is-fail .ide-selfcheck__icon { color: var(--error-color, #e06c75); }
}
.ide-selfcheck__icon { width: 16px; text-align: center; font-weight: 700; }
.ide-selfcheck__label { flex-shrink: 0; width: 130px; color: var(--text-primary); }
.ide-selfcheck__detail {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.ide-selfcheck__ms { flex-shrink: 0; color: var(--text-muted); font-size: 10px; }
.ide-selfcheck__status { flex-shrink: 0; width: 34px; text-align: right; font-size: 11px; color: var(--text-muted); }
</style>
