<script setup lang="ts">
/**
 * 聊天时间线里的持久式界面卡片（批二，spec D1/D2/D6/D10）。
 *
 * 与阻塞式卡片（EkkoUISurfaceCard.vue）的分工：那张卡跟着一次工具调用走，提交后变只读；
 * 这张卡跟着一块落库的界面走——工具消息只是它在时间线上的锚点，规格一律以服务端为准，
 * 所以智能体后来续改、用户刷新页面，卡片都恢复到最新版本并保留用户填过的值。
 *
 * 提交：先让服务端记一笔，再用与键盘输入相同的发消息通道发起一轮新对话（spec D1）。
 * 界面提交后保持可用（spec D6）。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import EkkoUISurface from '../ekko-ui/EkkoUISurface.vue'
import {
  extractSurfaceSpec,
  isSafeExternalUrl,
  isPersistentSurfaceToolName,
  surfaceIdFor,
  validateSpec,
  type EkkoUIJsonValue,
  type EkkoUIState,
} from '../ekko-ui/protocol'
import {
  buildSurfaceTurnMessage,
  closeSurface,
  createStateFlush,
  recordSurfaceSubmission,
  saveSurfaceState,
  usePersistentSurface,
} from '../ekko-ui/surface-sync'
import { useChatStore } from '@/stores/hermes/chat'

interface SurfaceMessageLike {
  id: string
  role?: string
  toolName?: string
  toolArgs?: unknown
  toolResult?: unknown
  toolStatus?: 'running' | 'done' | 'error' | string
}

const props = defineProps<{
  message: SurfaceMessageLike
  sessionId?: string
}>()

const chatStore = useChatStore()
const sessionId = computed(() => props.sessionId !== undefined ? props.sessionId : (chatStore.activeSessionId || ''))
const profile = computed(() => chatStore.activeSession?.profile || 'default')

// 工具参数里的规格只用于两件事：算出界面编号；服务端取不到时的兜底文本与首屏
const extracted = computed(() => extractSurfaceSpec(props.message.toolArgs))
const firstVersion = computed(() => validateSpec(extracted.value.spec))
const fallbackText = computed(() => extracted.value.fallbackText
  || (extracted.value.spec && typeof extracted.value.spec === 'object'
    ? String((extracted.value.spec as Record<string, unknown>).fallbackText || '')
    : '')
  || '此界面无法显示。')
const specSurfaceId = computed(() => firstVersion.value.ok ? (firstVersion.value.spec?.surfaceId || '') : '')
const surfaceId = computed(() => specSurfaceId.value && sessionId.value
  ? surfaceIdFor(sessionId.value, specSurfaceId.value)
  : '')

const sync = surfaceId.value ? usePersistentSurface(surfaceId.value, sessionId.value, profile.value) : null
const entry = sync?.entry
const issues = computed(() => firstVersion.value.errors.slice(0, 6))
const actionError = ref('')
const busy = ref(false)

/** 渲染用规格：服务端为准；取不到时退回工具参数里的第 1 版（只在工具调用失败时）。 */
const activeSpec = computed(() => {
  if (entry?.phase === 'ready' && entry.spec) return entry.spec
  if (entry?.phase === 'missing' || entry?.phase === 'error') return null
  // 还在加载：先用第 1 版占位，取回后替换
  return firstVersion.value.ok ? firstVersion.value.spec ?? null : null
})

const interactive = computed(() => !!surfaceId.value && entry?.status === 'active'
  && (entry.phase === 'ready' || entry.phase === 'loading'))

const statusLabel = computed(() => {
  if (!firstVersion.value.ok) return '无法渲染'
  if (entry?.status === 'closed') return '已关闭'
  if (entry?.phase === 'missing') return '不可用'
  if (entry?.phase === 'error') return '读取失败'
  if (entry?.phase === 'loading' || entry?.phase === 'idle') return '加载中'
  return '可用'
})

const statusTone = computed(() => {
  if (!firstVersion.value.ok || entry?.phase === 'error' || entry?.phase === 'missing') return 'bad'
  if (entry?.status === 'closed') return 'muted'
  if (entry?.phase !== 'ready') return 'pending'
  return 'ok'
})

const note = computed(() => {
  if (entry?.phase === 'missing') return entry.error || '界面不存在或无权访问。'
  if (entry?.phase === 'error') return entry.error
  if (entry?.status === 'closed') return '界面已关闭，内容只读。'
  return ''
})

// ---- 状态回存（spec D10：500ms 合并写一次，卸载时落盘）----
const flusher = createStateFlush((revision, state) => saveSurfaceState(surfaceId.value, profile.value, revision, state))

function onStateChange(state: EkkoUIState): void {
  if (!interactive.value || !entry) return
  entry.state = { ...state }
  flusher.schedule(entry.revision, state)
}

// ---- 提交 / 取消 / 关闭 ----
async function record(actionId: string, payload?: EkkoUIJsonValue): Promise<void> {
  if (!surfaceId.value || !entry) return
  await recordSurfaceSubmission(surfaceId.value, profile.value, entry.revision, actionId, payload)
}

async function onSubmit(value: { actionId: string; payload: EkkoUIJsonValue }): Promise<void> {
  if (!interactive.value || busy.value || !entry) return
  busy.value = true
  actionError.value = ''
  try {
    await record(value.actionId, value.payload)
    // 续接轮由客户端发起（spec D1）：与键盘输入同一条用户消息通道
    chatStore.sendMessage(buildSurfaceTurnMessage(entry, value.actionId, value.payload))
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function onCancel(value: { actionId: string }): Promise<void> {
  if (!interactive.value || busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    await record(value.actionId)
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

async function onClose(): Promise<void> {
  if (!surfaceId.value || busy.value) return
  busy.value = true
  actionError.value = ''
  try {
    await closeSurface(surfaceId.value, profile.value)
    if (entry) entry.status = 'closed'
  } catch (error) {
    actionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function onTurn(value: { text: string }): void {
  if (value.text.trim()) chatStore.sendMessage(value.text)
}
function onCopy(value: { text: string }): void {
  void navigator.clipboard?.writeText(value.text).catch(() => { actionError.value = '复制失败：剪贴板不可用' })
}
function onOpenUrl(value: { url: string }): void {
  if (isSafeExternalUrl(value.url)) window.open(value.url, '_blank', 'noopener,noreferrer')
}

let off: (() => void) | null = null
onMounted(() => {
  if (!sync) return
  void sync.refresh()
  off = sync.onEvent(() => { /* 登记表是响应式的，模板自动跟随；这里只需保持订阅 */ })
})
onBeforeUnmount(() => {
  off?.()
  off = null
  flusher.dispose()
})

// 会话切换后同一块界面换了 profile：重新拉取
watch(profile, () => { void sync?.refresh() })
</script>

<template>
  <section v-if="isPersistentSurfaceToolName(message.toolName)" class="ekko-surface-card persistent" :data-surface-id="surfaceId">
    <header class="ekko-surface-card-head">
      <span class="ekko-surface-card-dot" :class="statusTone" aria-hidden="true" />
      <span class="ekko-surface-card-title">{{ entry?.title || (firstVersion.ok ? (firstVersion.spec?.title || '界面') : '界面') }}</span>
      <span v-if="entry?.revision" class="ekko-surface-card-version">v{{ entry.revision }}</span>
      <span class="ekko-surface-card-status" :class="statusTone">{{ statusLabel }}</span>
      <button
        v-if="entry?.status === 'active'"
        type="button"
        class="ekko-surface-card-close"
        aria-label="关闭此界面"
        title="关闭此界面"
        :disabled="busy"
        @click="onClose"
      >×</button>
    </header>

    <div class="ekko-surface-card-body">
      <!-- 工具参数就不合法：不可能有界面 -->
      <template v-if="!firstVersion.ok">
        <p class="ekko-surface-card-fallback">{{ fallbackText }}</p>
        <details class="ekko-surface-card-details">
          <summary>渲染问题（{{ issues.length }}）</summary>
          <ul>
            <li v-for="issue in issues" :key="`${issue.path}:${issue.code}`">
              <code>{{ issue.path || 'spec' }}</code> {{ issue.message }}
            </li>
          </ul>
        </details>
      </template>

      <!-- 服务端没有这块界面，或读取失败：兜底文本 + 原因（失败可重试） -->
      <template v-else-if="entry?.phase === 'missing' || entry?.phase === 'error'">
        <p class="ekko-surface-card-fallback">{{ fallbackText }}</p>
        <p class="ekko-surface-card-note">{{ note }}</p>
        <button v-if="entry.phase === 'error'" type="button" class="ekko-surface-card-retry" @click="sync?.refresh()">重试</button>
      </template>

      <template v-else>
        <EkkoUISurface
          v-if="activeSpec"
          :spec="activeSpec"
          :interactive="interactive"
          :initial-state="entry?.state"
          :title="''"
          :surface-id="surfaceId"
          :on-state-change="onStateChange"
          @submit="onSubmit"
          @cancel="onCancel"
          @turn="onTurn"
          @copy="onCopy"
          @open-url="onOpenUrl"
        />
        <p v-if="note" class="ekko-surface-card-note">{{ note }}</p>
        <p v-if="actionError" class="ekko-surface-card-error">{{ actionError }}</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* 外壳沿用阻塞式卡片的科技感皮肤：同一套 token 派生与皮肤交互色 */
.ekko-surface-card {
  --ekko-skin-accent: #0891b2;
  --ekko-skin-accent-hover: #0e7490;
  --ekko-skin-on-accent: #ffffff;
  position: relative;
  margin: 6px 0;
  border: 1px solid color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 32%, var(--border-color));
  border-radius: var(--radius-component);
  background: color-mix(in srgb, var(--msg-assistant-bg) 72%, transparent);
  backdrop-filter: blur(12px);
  overflow: hidden;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 10%, transparent),
    0 0 24px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 8%, transparent),
    0 8px 24px rgb(0 0 0 / 10%);
}
.ekko-surface-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 4%, color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 85%, transparent), transparent 96%);
  pointer-events: none;
}
.ekko-surface-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 12%, var(--border-light));
  background: linear-gradient(90deg, color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 9%, transparent), transparent 58%);
}
.ekko-surface-card-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--text-muted); }
.ekko-surface-card-dot.pending { background: var(--ekko-skin-accent, var(--accent-primary)); animation: ekko-ping 1.8s ease-out infinite; }
.ekko-surface-card-dot.ok { background: var(--success); box-shadow: 0 0 6px color-mix(in srgb, var(--success) 55%, transparent); }
.ekko-surface-card-dot.bad { background: var(--error); box-shadow: 0 0 6px color-mix(in srgb, var(--error) 55%, transparent); }
.ekko-surface-card-title { flex: 1; font-size: 12px; font-weight: 600; letter-spacing: 0.02em; color: var(--text-secondary); }
.ekko-surface-card-version {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  color: var(--text-muted);
}
.ekko-surface-card-status {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 2px 9px;
  border-radius: var(--radius-pill, 999px);
  border: 1px solid color-mix(in srgb, var(--text-muted) 35%, transparent);
  color: var(--text-muted);
  white-space: nowrap;
}
.ekko-surface-card-status.pending {
  color: var(--ekko-skin-accent, var(--accent-primary));
  border-color: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 55%, transparent);
  background: color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 12%, transparent);
}
.ekko-surface-card-status.ok { color: var(--success); border-color: color-mix(in srgb, var(--success) 55%, transparent); background: color-mix(in srgb, var(--success) 10%, transparent); }
.ekko-surface-card-status.bad { color: var(--error); border-color: color-mix(in srgb, var(--error) 55%, transparent); background: color-mix(in srgb, var(--error) 10%, transparent); }
.ekko-surface-card-close {
  flex: none;
  width: 18px; height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 18px;
  cursor: pointer;
}
.ekko-surface-card-close:hover:not(:disabled) { background: var(--bg-card-hover); color: var(--text-primary); }
.ekko-surface-card-close:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 22%, transparent); }
.ekko-surface-card-close:disabled { opacity: 0.5; cursor: not-allowed; }
.ekko-surface-card-body { padding: 12px; }
.ekko-surface-card-fallback { margin: 0; white-space: pre-wrap; color: var(--text-secondary); }
.ekko-surface-card-details { margin-top: 8px; font-size: 11px; color: var(--text-muted); }
.ekko-surface-card-details code { font-family: var(--font-mono, monospace); }
.ekko-surface-card-note { margin: 8px 0 0; font-size: 11px; color: var(--text-muted); }
.ekko-surface-card-error { margin: 8px 0 0; font-size: 11px; color: var(--error); }
.ekko-surface-card-retry {
  margin-top: 8px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-standard, 6px);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.ekko-surface-card-retry:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 22%, transparent); }
@keyframes ekko-ping {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 45%, transparent); }
  75%, 100% { box-shadow: 0 0 0 6px transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .ekko-surface-card-dot.pending { animation: none; }
}
.dark .ekko-surface-card { --ekko-skin-accent: #22d3ee; --ekko-skin-accent-hover: #67e8f9; --ekko-skin-on-accent: #052e3a; }
</style>
