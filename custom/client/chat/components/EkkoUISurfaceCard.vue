<script setup lang="ts">
/**
 * 聊天时间线里的 Ekko UI Surface 卡片。
 *
 * spec 来自工具调用参数（tool.started 的 arguments，出站不截断，且随消息持久化），
 * 提交结果来自工具结果；因此挂起、完成与历史三态都无需新增消息字段或数据库表。
 */
import { computed, ref } from 'vue'
import EkkoUISurface from '../ekko-ui/EkkoUISurface.vue'
import {
  EKKO_UI_LIMITS,
  extractSurfaceSpec,
  isSurfaceToolName,
  parseSurfaceToolResult,
  surfaceIdFor,
  validateSpec,
  type EkkoUIJsonValue,
  type EkkoUISubmissionStatus,
} from '../ekko-ui/protocol'
import { respondUiSurface } from '@/api/studio/chat'
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

const extracted = computed(() => extractSurfaceSpec(props.message.toolArgs))
const validation = computed(() => validateSpec(extracted.value.spec))
const fallbackText = computed(() => extracted.value.fallbackText
  || (extracted.value.spec && typeof extracted.value.spec === 'object'
    ? String((extracted.value.spec as Record<string, unknown>).fallbackText || '')
    : '')
  || '此交互界面无法显示。')
const specSurfaceId = computed(() => validation.value.ok ? (validation.value.spec?.surfaceId || '') : '')
const surfaceId = computed(() => specSurfaceId.value && sessionId.value
  ? surfaceIdFor(sessionId.value, specSurfaceId.value)
  : '')
const revision = EKKO_UI_LIMITS.maxRevision

const result = computed(() => parseSurfaceToolResult(props.message.toolResult))
const optimistic = ref<EkkoUISubmissionStatus | ''>('')
const submitError = ref('')
const submitting = ref(false)

const status = computed<EkkoUISubmissionStatus | 'pending' | 'invalid'>(() => {
  if (!validation.value.ok || !isSurfaceToolName(props.message.toolName)) return 'invalid'
  if (optimistic.value) return optimistic.value
  if (result.value && result.value.status !== 'pending') return result.value.status
  if (props.message.toolStatus === 'running') return 'pending'
  if (props.message.toolStatus === 'error') return 'closed'
  return result.value?.status === 'pending' ? 'pending' : 'closed'
})

const interactive = computed(() => status.value === 'pending' && !!sessionId.value && !!surfaceId.value)

const statusLabel = computed(() => {
  switch (status.value) {
    case 'pending': return '等待填写'
    case 'submitted': return '已提交'
    case 'cancelled': return '已取消'
    case 'expired': return '已超时'
    case 'closed': return props.message.toolStatus === 'error' ? '发送失败' : '已关闭'
    default: return '无法渲染'
  }
})

const statusTone = computed(() => status.value === 'pending' ? 'pending'
  : status.value === 'submitted' ? 'ok'
    : status.value === 'invalid' || props.message.toolStatus === 'error' ? 'bad' : 'muted')

const submissionPayload = computed<EkkoUIJsonValue>(() => result.value?.payload ?? null)

const issues = computed(() => validation.value.errors.slice(0, 6))

function sendAction(actionId: string, payload?: EkkoUIJsonValue): void {
  if (!interactive.value || submitting.value || !sessionId.value || !surfaceId.value) return
  submitting.value = true
  submitError.value = ''
  try {
    // 乐观切到已提交/已取消，最终状态由工具结果校正。
    optimistic.value = actionId === 'cancel' ? 'cancelled' : 'submitted'
    respondUiSurface(sessionId.value, surfaceId.value, revision, actionId, payload, chatStore.activeSession?.profile || undefined)
  } catch (error) {
    optimistic.value = ''
    submitError.value = error instanceof Error ? error.message : String(error)
  } finally {
    submitting.value = false
  }
}

function onSubmit(value: { actionId: string; payload: EkkoUIJsonValue }): void {
  sendAction(value.actionId, value.payload)
}
function onCancel(value: { actionId: string }): void {
  sendAction(value.actionId)
}
</script>

<template>
  <section class="ekko-surface-card" :data-surface-id="surfaceId">
    <header class="ekko-surface-card-head">
      <span class="ekko-surface-card-dot" :class="statusTone" aria-hidden="true" />
      <span class="ekko-surface-card-title">{{ validation.ok ? (validation.spec?.title || '交互界面') : '交互界面' }}</span>
      <span class="ekko-surface-card-status" :class="statusTone">{{ statusLabel }}</span>
    </header>

    <div class="ekko-surface-card-body">
      <template v-if="status === 'invalid'">
        <p class="ekko-surface-card-fallback">{{ fallbackText }}</p>
        <details v-if="issues.length" class="ekko-surface-card-details">
          <summary>渲染问题（{{ issues.length }}）</summary>
          <ul>
            <li v-for="issue in issues" :key="`${issue.path}:${issue.code}`">
              <code>{{ issue.path || 'spec' }}</code> {{ issue.message }}
            </li>
          </ul>
        </details>
      </template>
      <template v-else>
        <EkkoUISurface
          :spec="extracted.spec"
          :interactive="interactive"
          :submission="status === 'submitted' ? submissionPayload : undefined"
          :title="''"
          :surface-id="surfaceId"
          @submit="onSubmit"
          @cancel="onCancel"
        />
        <p v-if="status === 'expired'" class="ekko-surface-card-note">等待超时，Agent 已收到超时结果。</p>
        <p v-else-if="status === 'cancelled'" class="ekko-surface-card-note">已取消，未向 Agent 发送任何内容。</p>
        <p v-else-if="status === 'submitted' && result?.reason" class="ekko-surface-card-note">{{ result.reason }}</p>
        <p v-else-if="status === 'closed'" class="ekko-surface-card-note">界面已关闭。</p>
        <p v-if="submitError" class="ekko-surface-card-error">{{ submitError }}</p>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* 科技感皮肤：全部视觉从 Pure Ink token 用 color-mix 派生（spec D2），亮暗主题自动成立 */
.ekko-surface-card {
  /* 皮肤交互色：宿主定义（Agent 不可控，spec D2 修订）；青蓝系科技感 */
  --ekko-skin-accent: #0891b2;
  --ekko-skin-accent-hover: #0e7490;
  --ekko-skin-on-accent: #ffffff;

  position: relative;
  margin: 6px 0;
  border: 1px solid color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 32%, var(--border-color));
  border-radius: var(--radius-component);
  /* 玻璃拟态：半透明底 + 背景模糊 */
  background: color-mix(in srgb, var(--msg-assistant-bg) 72%, transparent);
  backdrop-filter: blur(12px);
  overflow: hidden;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 10%, transparent),
    0 0 24px color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 8%, transparent),
    0 8px 24px rgb(0 0 0 / 10%);
}
/* 顶部 accent 渐变光带 */
.ekko-surface-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
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
.ekko-surface-card-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
  background: var(--text-muted);
}
.ekko-surface-card-dot.pending {
  background: var(--ekko-skin-accent, var(--accent-primary));
  animation: ekko-ping 1.8s ease-out infinite;
}
.ekko-surface-card-dot.ok { background: var(--success); box-shadow: 0 0 6px color-mix(in srgb, var(--success) 55%, transparent); }
.ekko-surface-card-dot.bad { background: var(--error); box-shadow: 0 0 6px color-mix(in srgb, var(--error) 55%, transparent); }
.ekko-surface-card-title { flex: 1; font-size: 12px; font-weight: 600; letter-spacing: 0.02em; color: var(--text-secondary); }
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
.ekko-surface-card-status.ok {
  color: var(--success);
  border-color: color-mix(in srgb, var(--success) 55%, transparent);
  background: color-mix(in srgb, var(--success) 10%, transparent);
}
.ekko-surface-card-status.bad {
  color: var(--error);
  border-color: color-mix(in srgb, var(--error) 55%, transparent);
  background: color-mix(in srgb, var(--error) 10%, transparent);
}
.ekko-surface-card-body { padding: 12px; }
.ekko-surface-card-fallback { margin: 0; white-space: pre-wrap; color: var(--text-secondary); }
.ekko-surface-card-details { margin-top: 8px; font-size: 11px; color: var(--text-muted); }
.ekko-surface-card-details code { font-family: var(--font-mono, monospace); }
.ekko-surface-card-note { margin: 8px 0 0; font-size: 11px; color: var(--text-muted); }
.ekko-surface-card-error { margin: 8px 0 0; font-size: 11px; color: var(--error); }

@keyframes ekko-ping {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ekko-skin-accent, var(--accent-primary)) 45%, transparent); }
  75%, 100% { box-shadow: 0 0 0 6px transparent; }
}
@media (prefers-reduced-motion: reduce) {
  .ekko-surface-card-dot.pending { animation: none; }
}
.dark .ekko-surface-card { --ekko-skin-accent: #22d3ee; --ekko-skin-accent-hover: #67e8f9; --ekko-skin-on-accent: #052e3a; }
</style>
