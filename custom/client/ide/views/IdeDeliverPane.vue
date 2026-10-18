<script setup lang="ts">
// IdeDeliverPane — G4 交付物面板 + G7 选段导出。
// 只读聚合：计划（taskPlan）/ 变更（run digest）/ 验证（测试构建命令）/ 产物文件；
// 评审门只做本地标记 + 退回意见真实发到会话；不伪造服务端评审状态。
// 选段导出走本地 Blob（markdown/json），云分享链接保持既有 stub 并如实标注。
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { useIdeWorkspace } from '../composables/useIdeWorkspace'
import { ideRunsApi, digestRunChanges, type RunChangesDigest } from '../api/runs'
import { buildDeliverables, deliverableSummaryMarkdown } from '../utils/deliverables'
import { sliceMessages, rangeToMarkdown, rangeToJson, rangeLabel } from '../utils/share-range'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'

const { locale } = useI18n()
const chat = useChatStore()
const ide = useIdeStore()
const { root } = useIdeWorkspace()
const tx = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].deliver)

const changes = ref<RunChangesDigest[]>([])
const loading = ref(false)
const loadError = ref('')
const copied = ref(false)
const sent = ref(false)
const rejectOpen = ref(false)
const rejectDraft = ref('')
const decision = ref<'approved' | 'rejected' | null>(null)
const range = ref({ start: 0, end: 0 })
const linkCopied = ref(false)

const messages = computed(() => (chat.activeSession?.messages ?? []) as Array<Record<string, unknown>>)
const snap = computed(() => buildDeliverables({
  messages: messages.value as never,
  changes: changes.value,
}))
const summary = computed(() => deliverableSummaryMarkdown(snap.value, tx.value.title))
const rangeText = computed(() => rangeLabel(messages.value as never, range.value))

function reviewKey(): string {
  return `ide-deliver-review:${chat.activeSessionId ?? 'none'}`
}
function loadDecision(): void {
  try {
    const v = sessionStorage.getItem(reviewKey())
    decision.value = v === 'approved' || v === 'rejected' ? v : null
  } catch { decision.value = null }
}
function saveDecision(v: 'approved' | 'rejected' | null): void {
  decision.value = v
  try {
    if (v) sessionStorage.setItem(reviewKey(), v)
    else sessionStorage.removeItem(reviewKey())
  } catch { /* 存储不可用不影响本次展示 */ }
}

async function load(): Promise<void> {
  const sid = chat.activeSessionId
  loading.value = true
  loadError.value = ''
  changes.value = []
  if (!sid) { loading.value = false; return }
  try {
    changes.value = digestRunChanges(await ideRunsApi.changes(sid))
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function resetRange(): void {
  range.value = { start: 0, end: Math.max(0, messages.value.length - 1) }
}

onMounted(() => { resetRange(); loadDecision(); void load() })
watch(() => chat.activeSessionId, () => { resetRange(); loadDecision(); void load() })
watch(() => messages.value.length, (n) => {
  if (range.value.end === 0 && n > 0) resetRange()
})

async function copySummary(): Promise<void> {
  try {
    await navigator.clipboard.writeText(summary.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch { /* 剪贴板不可用保持静默 */ }
}

function sendSummary(): void {
  if (!chat.activeSessionId) return
  void chat.sendMessage(`[交付摘要]\n${summary.value}`)
  sent.value = true
  setTimeout(() => { sent.value = false }, 1500)
}

function approve(): void {
  saveDecision('approved')
}

function reject(): void {
  const note = rejectDraft.value.trim()
  saveDecision('rejected')
  rejectOpen.value = false
  rejectDraft.value = ''
  if (note && chat.activeSessionId) void chat.sendMessage(`[交付退回]\n${note}`)
}

function download(name: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function slice(): Array<Record<string, unknown>> {
  return sliceMessages(messages.value as never, range.value) as unknown as Array<Record<string, unknown>>
}
function exportMd(): void {
  download(`session-range-${range.value.start + 1}-${range.value.end + 1}.md`, rangeToMarkdown(slice() as never, tx.value.title), 'text/markdown;charset=utf-8')
}
function exportJson(): void {
  download(`session-range-${range.value.start + 1}-${range.value.end + 1}.json`, rangeToJson(slice() as never, tx.value.title), 'application/json;charset=utf-8')
}
async function copyLink(): Promise<void> {
  const sid = chat.activeSessionId
  if (!sid) return
  const url = `${location.origin}${location.pathname}#/app/ide?session=${encodeURIComponent(sid)}`
  try {
    await navigator.clipboard.writeText(url)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 1500)
  } catch { /* 静默 */ }
}
function openReview(): void {
  ide.setSidePaneTab('review')
}
</script>

<template>
  <div class="ide-deliver" data-testid="ide-deliver-pane">
    <header class="ide-deliver__head">
      <strong>{{ tx.title }}</strong>
      <span class="ide-deliver__spacer" />
      <button type="button" class="ide-deliver__btn" data-testid="ide-deliver-refresh" :disabled="loading" @click="load">
        {{ tx.refresh }}
      </button>
    </header>

    <p v-if="loading" class="ide-deliver__hint">…</p>
    <p v-else-if="!chat.activeSessionId" class="ide-deliver__hint" data-testid="ide-deliver-empty">{{ tx.empty }}</p>
    <div v-else class="ide-deliver__body">
      <p v-if="loadError" class="ide-deliver__error" data-testid="ide-deliver-error">{{ loadError }}</p>

      <section class="ide-deliver__sec" data-testid="ide-deliver-plan">
        <h4>{{ tx.plan }}</h4>
        <template v-if="snap.plan">
          <div class="ide-deliver__bar"><span :style="{ width: `${snap.plan.pct}%` }" /></div>
          <p class="ide-deliver__meta">{{ snap.plan.done }}/{{ snap.plan.total }} · {{ snap.plan.pct }}%</p>
          <ul v-if="snap.plan.pending.length" class="ide-deliver__list">
            <li v-for="p in snap.plan.pending" :key="p">☐ {{ p }}</li>
          </ul>
        </template>
        <p v-else class="ide-deliver__muted">{{ tx.planEmpty }}</p>
      </section>

      <section class="ide-deliver__sec" data-testid="ide-deliver-changes">
        <h4>{{ tx.changes }} <small>{{ snap.changes.length }} {{ tx.runs }}</small></h4>
        <ul v-if="snap.changes.length" class="ide-deliver__list">
          <li v-for="run in snap.changes" :key="run.runId">
            <span class="ide-deliver__mono">{{ run.runId }}</span>
            · {{ run.fileCount }} {{ tx.files }}
            <span class="ide-deliver__add">+{{ run.additions }}</span>/<span class="ide-deliver__del">-{{ run.deletions }}</span>
          </li>
        </ul>
        <p v-else class="ide-deliver__muted">{{ tx.noChanges }}</p>
        <button v-if="snap.changes.length" type="button" class="ide-deliver__link" data-testid="ide-deliver-open-review" @click="openReview">{{ tx.openReview }}</button>
      </section>

      <section class="ide-deliver__sec" data-testid="ide-deliver-verify">
        <h4>{{ tx.verification }}</h4>
        <ul v-if="snap.verification.length" class="ide-deliver__list">
          <li v-for="v in snap.verification" :key="v.id" :data-status="v.status">
            <span class="ide-deliver__badge" :class="`is-${v.status}`">{{ tx.status[v.status] }}</span>
            <span class="ide-deliver__mono">{{ v.command }}</span>
          </li>
        </ul>
        <p v-else class="ide-deliver__muted">{{ tx.noVerify }}</p>
      </section>

      <section class="ide-deliver__sec" data-testid="ide-deliver-artifacts">
        <h4>{{ tx.artifacts }}</h4>
        <ul v-if="snap.artifacts.length" class="ide-deliver__list">
          <li v-for="a in snap.artifacts" :key="a.path" class="ide-deliver__mono">{{ a.path }} <small>+{{ a.additions }}/-{{ a.deletions }}</small></li>
        </ul>
        <p v-else class="ide-deliver__muted">{{ tx.noArtifacts }}</p>
      </section>

      <section class="ide-deliver__sec" data-testid="ide-deliver-actions">
        <div class="ide-deliver__row">
          <button type="button" class="ide-deliver__btn" data-testid="ide-deliver-copy" @click="copySummary">{{ copied ? tx.copied : tx.copy }}</button>
          <button type="button" class="ide-deliver__btn" data-testid="ide-deliver-send" @click="sendSummary">{{ sent ? tx.sent : tx.send }}</button>
        </div>
        <div class="ide-deliver__row">
          <button type="button" class="ide-deliver__btn is-ok" :class="{ 'is-active': decision === 'approved' }" data-testid="ide-deliver-approve" @click="approve">{{ tx.approve }}</button>
          <button type="button" class="ide-deliver__btn is-bad" :class="{ 'is-active': decision === 'rejected' }" data-testid="ide-deliver-reject" @click="rejectOpen = !rejectOpen">{{ tx.reject }}</button>
        </div>
        <div v-if="rejectOpen" class="ide-deliver__reject">
          <textarea v-model="rejectDraft" :placeholder="tx.rejectHint" data-testid="ide-deliver-reject-note" rows="2" />
          <button type="button" class="ide-deliver__btn is-bad" data-testid="ide-deliver-reject-send" @click="reject">{{ tx.reject }}</button>
        </div>
        <p class="ide-deliver__muted">{{ tx.localOnly }}<template v-if="decision"> · {{ decision === 'approved' ? tx.approved : tx.rejected }}</template></p>
      </section>

      <section class="ide-deliver__sec" data-testid="ide-deliver-share">
        <h4>{{ tx.share }} <small>{{ rangeText }}</small></h4>
        <div class="ide-deliver__row">
          <label class="ide-deliver__field">{{ tx.rangeStart }}<input v-model.number="range.start" type="number" min="0" :max="Math.max(0, messages.length - 1)"></label>
          <label class="ide-deliver__field">{{ tx.rangeEnd }}<input v-model.number="range.end" type="number" min="0" :max="Math.max(0, messages.length - 1)"></label>
        </div>
        <div class="ide-deliver__row">
          <button type="button" class="ide-deliver__btn" data-testid="ide-deliver-export-md" :disabled="!messages.length" @click="exportMd">{{ tx.exportMd }}</button>
          <button type="button" class="ide-deliver__btn" data-testid="ide-deliver-export-json" :disabled="!messages.length" @click="exportJson">{{ tx.exportJson }}</button>
          <button type="button" class="ide-deliver__btn" data-testid="ide-deliver-copy-link" @click="copyLink">{{ linkCopied ? tx.linkCopied : tx.copyLink }}</button>
        </div>
        <p class="ide-deliver__muted">{{ tx.shareStub }}</p>
      </section>
      <p v-if="root" class="ide-deliver__muted ide-deliver__root">{{ root }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-deliver { display: flex; flex-direction: column; min-height: 0; height: 100%; font-size: 12px; }
.ide-deliver__head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border-color); }
.ide-deliver__spacer { flex: 1; }
.ide-deliver__body { flex: 1; min-height: 0; overflow: auto; padding: 8px 10px 16px; }
.ide-deliver__sec { border-bottom: 1px dashed var(--border-color); padding: 8px 0; }
.ide-deliver__sec h4 { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.ide-deliver__sec h4 small { color: var(--text-muted); font-weight: 400; margin-left: 6px; }
.ide-deliver__bar { height: 6px; border-radius: 3px; background: var(--bg-secondary); overflow: hidden; }
.ide-deliver__bar span { display: block; height: 100%; background: var(--primary-color); }
.ide-deliver__meta { margin: 4px 0 0; color: var(--text-muted); }
.ide-deliver__list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.ide-deliver__list li { line-height: 1.45; word-break: break-word; }
.ide-deliver__mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.ide-deliver__add { color: var(--success-color); }
.ide-deliver__del { color: var(--error-color); }
.ide-deliver__muted { color: var(--text-muted); margin: 4px 0 0; line-height: 1.5; }
.ide-deliver__hint { padding: 16px 12px; color: var(--text-muted); }
.ide-deliver__error { color: var(--error-color); }
.ide-deliver__row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center; }
.ide-deliver__btn { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
.ide-deliver__btn:disabled { opacity: .45; cursor: default; }
.ide-deliver__btn:hover:not(:disabled) { border-color: var(--primary-color); color: var(--primary-color); }
.ide-deliver__btn.is-active { border-color: var(--primary-color); color: var(--primary-color); }
.ide-deliver__btn.is-ok.is-active { border-color: var(--success-color); color: var(--success-color); }
.ide-deliver__btn.is-bad.is-active { border-color: var(--error-color); color: var(--error-color); }
.ide-deliver__badge { display: inline-block; min-width: 34px; text-align: center; border-radius: 4px; padding: 0 4px; margin-right: 6px; font-size: 10px; border: 1px solid var(--border-color); }
.ide-deliver__badge.is-done { color: var(--success-color); border-color: var(--success-color); }
.ide-deliver__badge.is-error { color: var(--error-color); border-color: var(--error-color); }
.ide-deliver__badge.is-running { color: var(--primary-color); border-color: var(--primary-color); }
.ide-deliver__link { border: none; background: none; color: var(--primary-color); cursor: pointer; padding: 2px 0; font-size: 11px; }
.ide-deliver__reject { margin-top: 6px; display: flex; flex-direction: column; gap: 6px; }
.ide-deliver__reject textarea { width: 100%; resize: vertical; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; font-size: 12px; }
.ide-deliver__field { display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); }
.ide-deliver__field input { width: 64px; background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 4px; font-size: 11px; }
.ide-deliver__root { word-break: break-all; }
</style>
