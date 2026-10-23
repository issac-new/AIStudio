<!-- overlay/custom/client/ia2/components/IdentityChatCanvas.vue -->
<!-- 统一身份聊天画布（2026-10-23 五轮用户裁定：「在一个聊天窗口中统一，可以和
     所有身份进行聊天会话」）。身份=本机网关全部 profile（49 个，/api/ia2/
     identities 目录全集+在线态）；会话走网关 peer dm 协议（每身份一个 Bot Chat，
     服务端 ensure→chat 同步回/超时转轮询）。批2（Matrix 远程身份）预留 kind 扩展。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { fetchIdentities, fetchIdentityMessages, sendToIdentity, type IdentityInfo, type IdentityMessage } from '../identity-chat'

const props = defineProps<{ presetProfile?: string | null }>()

const identities = ref<IdentityInfo[]>([])
const loadErr = ref('')
const filter = ref('')
const selected = ref<string>('')
/** from=回复身份 id（@ 扇出多身份时区分发言人；user 消息无 from） */
const messages = ref<Array<IdentityMessage & { from?: string }>>([])
const sessionId = ref('')
const draft = ref('')
const busy = ref(false)
const sending = ref(false)
const turnNote = ref('')
const identityOpen = ref(false)

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollMisses = 0

const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  if (!q) return identities.value
  return identities.value.filter(i => i.id.toLowerCase().includes(q))
})
const current = computed(() => identities.value.find(i => i.id === selected.value) ?? null)

async function loadIdentities(): Promise<void> {
  try {
    loadErr.value = ''
    identities.value = await fetchIdentities()
    if (!selected.value && identities.value.length > 0) {
      const preset = props.presetProfile && identities.value.some(i => i.id === props.presetProfile)
        ? props.presetProfile
        : identities.value.find(i => i.online)?.id ?? identities.value[0].id
      await select(preset)
    }
  } catch (e) {
    loadErr.value = `身份清单不可达：${(e as Error).message}`
  }
}

async function select(profile: string): Promise<void> {
  if (selected.value === profile) { identityOpen.value = false; return }
  selected.value = profile
  messages.value = []
  sessionId.value = ''
  turnNote.value = ''
  identityOpen.value = false
  await reload()
}

async function reload(): Promise<void> {
  if (!selected.value || busy.value) return
  busy.value = true
  try {
    const r = await fetchIdentityMessages(selected.value, sessionId.value || undefined)
    sessionId.value = r.sessionId
    messages.value = r.messages
    pollMisses = 0
  } catch (e) {
    turnNote.value = (e as Error).message.slice(0, 160)
  } finally {
    busy.value = false
  }
}

/** 消息内 @<身份> 可指定一个或多个目标（须命中身份清单）；无 @ 时发当前选中身份。 */
function targetsOf(text: string): string[] {
  const ids = new Set(identities.value.map(i => i.id))
  const out: string[] = []
  for (const m of text.matchAll(/@([A-Za-z0-9_.-]+)/g)) {
    if (ids.has(m[1]) && !out.includes(m[1])) out.push(m[1])
  }
  return out.length > 0 ? out.slice(0, 5) : (selected.value ? [selected.value] : [])
}

async function send(): Promise<void> {
  const text = draft.value.trim()
  const targets = targetsOf(text)
  if (!text || sending.value || targets.length === 0) return
  sending.value = true
  turnNote.value = ''
  messages.value.push({ role: 'user', content: text, at: Math.floor(Date.now() / 1000) })
  draft.value = ''
  try {
    // 多目标扇出（2026-10-23 五轮 D：@多身份统一聊天）；每身份独立 Bot Chat 会话
    const results = await Promise.all(targets.map(id =>
      sendToIdentity(id, text).then(r => ({ id, r })).catch(e => ({ id, err: e })),
    ))
    for (const item of results) {
      if ('err' in item) {
        messages.value.push({ role: 'assistant', from: item.id, content: `发送失败：${(item.err as Error).message.slice(0, 120)}`, at: null })
        continue
      }
      const { id, r } = item
      if (id === selected.value) sessionId.value = r.sessionId
      if (r.queued) {
        turnNote.value = r.note ?? '回复仍在生成，稍后自动拉取'
      } else if (r.reply) {
        messages.value.push({ role: 'assistant', from: id, content: r.reply, at: null })
      }
    }
  } finally {
    sending.value = false
  }
}

// 轻轮询：仅 queued 场景 8s 一次，连续 8 次无果停（回合大概率已终结）
onMounted(() => {
  void loadIdentities()
  pollTimer = setInterval(() => {
    if (turnNote.value.includes('生成') || turnNote.value.includes('Bot Chat')) {
      void reload()
      pollMisses += 1
      if (pollMisses > 8) turnNote.value = ''
    }
  }, 8_000)
})
onUnmounted(() => { if (pollTimer) clearInterval(pollTimer) })
</script>

<template>
  <div class="icc" data-testid="identity-chat">
    <header class="icc__bar">
      <button type="button" class="icc__who" data-testid="icc-identity-current"
        @click="identityOpen = !identityOpen">
        <span class="icc__kind-tag">身份</span>
        <span class="icc__who-name">{{ current?.id ?? '选择身份…' }}</span>
        <span v-if="current" class="icc__dot" :class="current.online ? 'icc__dot--on' : ''" />
        <span class="icc__caret">{{ identityOpen ? '▴' : '▾' }}</span>
      </button>
      <span class="icc__hint">与网关任一 profile 身份直接对话（Bot Chat）</span>
    </header>

    <div v-if="identityOpen" class="icc__picker" data-testid="icc-identity-picker">
      <input v-model="filter" class="icc__filter" placeholder="过滤身份（如 worker / data）" data-testid="icc-identity-filter">
      <div class="icc__list">
        <button v-for="i in filtered" :key="i.id" type="button" class="icc__item"
          :class="{ 'is-active': i.id === selected }"
          :data-testid="`icc-identity-${i.id}`"
          @click="select(i.id)">
          <span class="icc__dot" :class="i.online ? 'icc__dot--on' : ''" />
          <span class="icc__item-name">{{ i.id }}</span>
          <span v-if="i.online" class="icc__on-label">在线</span>
        </button>
        <p v-if="filtered.length === 0" class="icc__empty">无匹配身份</p>
      </div>
    </div>

    <p v-if="loadErr" class="icc__err" data-testid="icc-error">{{ loadErr }}</p>

    <div class="icc__log" data-testid="icc-log">
      <p v-if="messages.length === 0 && !loadErr" class="icc__empty">
        {{ current ? `发消息给 ${current.id}；消息里 @其他身份 可一次发给多个（@a @b …）。` : '' }}
      </p>
      <div v-for="(m, i) in messages" :key="i" class="icc__msg" :class="`icc__msg--${m.role}`"
        :data-testid="`icc-msg-${i}`">
        <span class="icc__msg-role">{{ m.role === 'user' ? '我' : (m.from ?? current?.id ?? '身份') }}</span>
        <span class="icc__msg-body">{{ m.content }}</span>
      </div>
      <p v-if="turnNote" class="icc__note" data-testid="icc-turn-note">{{ turnNote }}</p>
    </div>

    <div class="icc__composer">
      <input v-model="draft" class="icc__input" :placeholder="`发给 ${current?.id ?? '…'}`"
        data-testid="icc-input" :disabled="!current || sending"
        @keydown.enter.prevent="send">
      <button type="button" class="icc__send" data-testid="icc-send" :disabled="!draft.trim() || sending || !current"
        @click="send">{{ sending ? '发送中…' : '发送' }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.icc { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.icc__bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-bottom: 1px solid var(--border-color); }
.icc__who {
  display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px;
  border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card);
  color: var(--text-primary); cursor: pointer; font-size: 12px;
  &:hover { background: var(--bg-secondary); }
}
.icc__who-name { font-weight: 600; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icc__kind-tag { font-size: 10px; color: var(--accent-primary); border: 1px solid var(--accent-primary); border-radius: 3px; padding: 0 3px; }
.icc__caret { color: var(--text-muted); font-size: 10px; }
.icc__hint { font-size: 11px; color: var(--text-muted); }
.icc__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--text-muted, #999); display: inline-block; flex-shrink: 0; }
.icc__dot--on { background: var(--color-success, #2f9e44); }
.icc__picker { border-bottom: 1px solid var(--border-color); padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
.icc__filter { border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px; font-size: 12px; background: var(--bg-primary); color: var(--text-primary); }
.icc__list { max-height: 260px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.icc__item {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px; border: none; border-radius: 5px;
  background: transparent; color: var(--text-primary); cursor: pointer; font-size: 12px; text-align: left;
  &:hover { background: var(--bg-secondary); }
  &.is-active { background: color-mix(in srgb, var(--accent-primary) 12%, transparent); }
}
.icc__item-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icc__on-label { font-size: 10px; color: var(--color-success, #2f9e44); }
.icc__err { margin: 8px 12px; font-size: 12px; color: var(--color-danger, #d33); }
.icc__empty { margin: 14px 12px; font-size: 12px; color: var(--text-muted); }
.icc__log { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.icc__msg { display: flex; flex-direction: column; gap: 2px; max-width: 86%; }
.icc__msg--user { align-self: flex-end; align-items: flex-end; }
.icc__msg--assistant { align-self: flex-start; }
.icc__msg-role { font-size: 10px; color: var(--text-muted); }
.icc__msg-body {
  padding: 6px 10px; border-radius: 8px; font-size: 12.5px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word;
  background: var(--bg-secondary); color: var(--text-primary);
}
.icc__msg--user .icc__msg-body { background: color-mix(in srgb, var(--accent-primary) 16%, transparent); }
.icc__note { font-size: 11px; color: var(--text-muted); font-style: italic; }
.icc__composer { display: flex; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--border-color); }
.icc__input { flex: 1; border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; font-size: 12.5px; background: var(--bg-primary); color: var(--text-primary); }
.icc__send {
  padding: 6px 16px; border-radius: 6px; border: 1px solid var(--accent-primary);
  color: var(--accent-primary); background: transparent; cursor: pointer; font-size: 12px; font-weight: 600;
  &:hover:not(:disabled) { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
  &:disabled { opacity: .45; cursor: default; }
}
</style>
