<script setup lang="ts">
// IdeResumeAdvisor — 会话续接失败分档建议卡（吸收第一批 B2，multica §2.5/§3.1：
// 失败按续接安全性分档——平台错同会话重试 / resume-unsafe 强制新会话 / agent 错
// 指数退避）。判定=resume-safety.ts classifyResume（server 域纯函数跨引）。
// 数据源=消息流最后一条 error 系统消息（chatStore 错误面）；分类启发式：
// 网络/超时/5xx→transport；会话 404/上下文损坏→session；余→model/tool。
// resume-unsafe 黑名单：同会话连续 2 次 session 类失败本地标记（不引服务端态）。
import { computed, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { classifyResume, type ResumeDecision } from '../../../server/resume/resume-safety'

const chat = useChatStore()
const dismissedAt = ref<number>(0)

interface ErrorMsg { text: string; at: number }

const lastError = computed<ErrorMsg | null>(() => {
  const msgs = (chat.activeSession?.messages ?? []) as Array<Record<string, unknown>>
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role === 'system' && (m.systemType === 'error' || m.type === 'error')) {
      return { text: String(m.content ?? ''), at: Number(m.timestamp ?? 0) }
    }
  }
  return null
})

/** 同会话连续 session 类失败计数（黑名单=2）。 */
const sessionFailStreak = computed(() => {
  const msgs = (chat.activeSession?.messages ?? []) as Array<Record<string, unknown>>
  let streak = 0
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]
    if (m.role !== 'system' || (m.systemType !== 'error' && m.type !== 'error')) break
    if (/session|not found|404|context/i.test(String(m.content ?? ''))) streak += 1
    else break
  }
  return streak
})

function categorize(text: string): string {
  if (/network|fetch|timeout|ECONNREFUSED|50[0-4]|offline/i.test(text)) return 'transport'
  if (/session|not found|404|context|corrupt/i.test(text)) return 'session'
  return 'model'
}

const decision = computed<ResumeDecision | null>(() => {
  const err = lastError.value
  if (!err || err.at <= dismissedAt.value) return null
  if (!/network|fetch|timeout|ECONNREFUSED|50[0-4]|offline|session|not found|404|context|corrupt|error|fail/i.test(err.text)) return null
  return classifyResume({
    category: categorize(err.text),
    resumeUnsafe: sessionFailStreak.value >= 2,
    attempts: 1,
  })
})

/** 退避倒计时（backoff 档禁用重试按钮）。 */
const backoffLeft = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
watch(decision, (d) => {
  if (timer) { clearInterval(timer); timer = null }
  if (d?.backoffMs) {
    backoffLeft.value = Math.ceil(d.backoffMs / 1000)
    timer = setInterval(() => {
      backoffLeft.value -= 1
      if (backoffLeft.value <= 0 && timer) { clearInterval(timer); timer = null }
    }, 1000)
  }
})

function retryLast(): void {
  // 重发最后一条 user 消息（同会话续接重试——transport 档语义）。
  const msgs = (chat.activeSession?.messages ?? []) as Array<Record<string, unknown>>
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'user') {
      void chat.sendMessage(String(msgs[i].content ?? ''))
      break
    }
  }
  dismissedAt.value = Date.now()
}

function newSession(): void {
  void chat.newSession?.()
  dismissedAt.value = Date.now()
}

function dismiss(): void {
  dismissedAt.value = Date.now()
}
</script>

<template>
  <div v-if="decision" class="ide-resume" :data-testid="`ide-resume-${decision.cls}`">
    <span class="ide-resume__dot" :class="`is-${decision.cls}`" />
    <span class="ide-resume__detail">{{ decision.detail }}</span>
    <button
      v-if="decision.cls === 'safe_retry'" type="button" class="ide-resume__btn"
      data-testid="ide-resume-retry" @click="retryLast"
    >重试</button>
    <button
      v-if="decision.cls === 'new_session'" type="button" class="ide-resume__btn is-primary"
      data-testid="ide-resume-new" @click="newSession"
    >新建会话</button>
    <button
      v-if="decision.cls === 'backoff'" type="button" class="ide-resume__btn"
      :disabled="backoffLeft > 0" data-testid="ide-resume-backoff-retry" @click="retryLast"
    >{{ backoffLeft > 0 ? `${backoffLeft}s 后可重试` : '重试' }}</button>
    <button type="button" class="ide-resume__close" data-testid="ide-resume-dismiss" @click="dismiss">✕</button>
  </div>
</template>

<style scoped lang="scss">
.ide-resume {
  display: flex; align-items: center; gap: 8px; margin: 4px 12px; padding: 4px 10px;
  border-radius: 6px; font-size: 11px; background: var(--hover-color, rgba(0, 0, 0, 0.04));
}
.ide-resume__dot { width: 7px; height: 7px; border-radius: 50%; flex: none;
  &.is-safe_retry { background: var(--info-color, #2080f0); }
  &.is-new_session { background: var(--error-color, #d03050); }
  &.is-backoff { background: var(--warning-color, #f0a020); } }
.ide-resume__detail { color: var(--text-color-2, #555); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-resume__btn {
  border: 1px solid var(--border-color, #e0e0e0); background: transparent; border-radius: 4px;
  font-size: 11px; padding: 1px 10px; cursor: pointer; color: var(--text-color-2, #555); white-space: nowrap;
  &:disabled { opacity: 0.5; cursor: default; }
  &.is-primary { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); } }
.ide-resume__close { border: none; background: transparent; color: var(--text-color-3, #999); cursor: pointer; padding: 0 2px; }
</style>
