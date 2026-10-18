<!-- overlay/custom/client/ia2/views/sim/EvidencePanel.vue -->
<!-- S3 证据库（B2 工单，R7/R12——设计正本 §二 S3）：两类高频锚检索先行（$事件号
     与十六进制 commit；t_ 卡/! 房间服务端已支持，检索框提示注明）→结果进锚点
     抽屉（全产品唯一反查交互）；台账/帧图廊只读呈现。
     2026-10-19 产品走查批：台账进页自动读取；帧图廊接入 /frames 端点（按步骤
     分组、before/after 配对、点击看大图）；缺数据给人话空态，不露出挂账措辞。 -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { fetchAnchor, fetchFrames, frameUrl, type AnchorResult, type FrameFile } from '../../api/supervision'
import { fetchClearanceLedger, type ClearanceLedgerView } from '../../api/gatekeeper'
import { useRunContext } from '../../composables/useRunContext'
import { compensationLabel } from '../../compensation-labels'
import { authFetch } from '../../../ide/utils/auth-fetch'
import SimAnchorDrawer from '../../components/sim/SimAnchorDrawer.vue'

const { run } = useRunContext()

const anchorId = ref('')
const searching = ref(false)
const anchorError = ref('')
const anchorFound = ref<AnchorResult | null>(null)

const drawerOpen = ref(false)
const drawerTitle = ref('')
const drawerAnchorType = ref<'event' | 'commit' | null>(null)
const drawerAnchorId = ref('')
const drawerEvidence = ref('')

const ledger = ref<ClearanceLedgerView | null>(null)
const ledgerError = ref('')
const ledgerLoading = ref(false)

const frames = ref<FrameFile[]>([])
const framesError = ref('')
const framesNote = ref('')
const framesLoading = ref(false)
const frameStep = ref('all')
const preview = ref<FrameFile | null>(null)
const previewUrl = ref('')

// 图片端点要 Authorization 头，<img src> 带不上——统一走 authFetch 取 blob 再显示。
// 缩略图按可视区懒加载（50 帧 × 200KB，不一次性拉全量）。
const thumbSrc = reactive<Record<string, string>>({})
const objectUrls = new Map<string, string>()
let observer: IntersectionObserver | null = null

function releaseObjectUrls(): void {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url)
  objectUrls.clear()
  for (const key of Object.keys(thumbSrc)) delete thumbSrc[key]
}

async function fetchBlobUrl(name: string): Promise<string> {
  const res = await authFetch(frameUrl(run.value.trim(), name))
  if (!res.ok) throw new Error(String(res.status))
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  objectUrls.set(`${name}#${objectUrls.size}`, url)
  return url
}

async function loadThumb(f: FrameFile): Promise<void> {
  if (thumbSrc[f.name]) return
  try { thumbSrc[f.name] = await fetchBlobUrl(f.name) } catch { /* 单帧失败不拖垮图廊 */ }
}

function registerFrame(el: unknown, f: FrameFile): void {
  if (!(el instanceof Element)) return
  if (!observer) {
    observer = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const name = (e.target as HTMLElement).dataset.frameName || ''
        const frame = frames.value.find(x => x.name === name)
        if (frame) void loadThumb(frame)
        observer?.unobserve(e.target)
      }
    }, { rootMargin: '240px' })
  }
  observer.observe(el)
}

async function openPreview(f: FrameFile): Promise<void> {
  preview.value = f
  previewUrl.value = thumbSrc[f.name] || ''
  if (!previewUrl.value) {
    try { previewUrl.value = await fetchBlobUrl(f.name) } catch { /* 留空态 */ }
  }
}

function closePreview(): void {
  preview.value = null
  previewUrl.value = ''
}

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  releaseObjectUrls()
})

const frameSteps = computed(() => {
  const set = new Set(frames.value.map(f => f.step).filter(Boolean))
  return [...set].sort((a, b) => a.localeCompare(b))
})

const visibleFrames = computed(() =>
  (frameStep.value === 'all' ? frames.value : frames.value.filter(f => f.step === frameStep.value))
    .slice(0, 60))

async function search(): Promise<void> {
  const id = anchorId.value.trim()
  if (!id) { anchorError.value = '请输入锚（$事件号 / 十六进制 commit 号；t_ 卡号与 ! 房间号亦可用）'; return }
  searching.value = true
  anchorError.value = ''
  anchorFound.value = null
  try {
    const res = await fetchAnchor(id)
    anchorFound.value = res
    drawerAnchorType.value = res.type === 'event' ? 'event' : res.type === 'commit' ? 'commit' : null
    drawerAnchorId.value = id
    drawerTitle.value = `锚反查 ${id}`
    drawerEvidence.value = res.error
      ? `查询失败：${res.error}`
      : JSON.stringify(res.matches ?? res.data ?? res, null, 2)
    drawerOpen.value = true
  } catch (e) {
    anchorError.value = (e as Error).message
  } finally {
    searching.value = false
  }
}

async function loadLedger(): Promise<void> {
  ledgerLoading.value = true
  ledgerError.value = ''
  try {
    ledger.value = await fetchClearanceLedger()
  } catch (e) {
    ledger.value = null
    ledgerError.value = humanizeLedgerError((e as Error).message)
  } finally {
    ledgerLoading.value = false
  }
}

async function loadFrames(): Promise<void> {
  const r = run.value.trim()
  releaseObjectUrls()
  if (!r) { frames.value = []; framesNote.value = '还没有选择运行记录——在页头选择后显示本次运行的截图'; return }
  framesLoading.value = true
  framesError.value = ''
  framesNote.value = ''
  try {
    const res = await fetchFrames(r)
    frames.value = res.frames ?? []
    framesNote.value = res.note ?? (frames.value.length === 0 ? '本次运行没有截图' : '')
  } catch (e) {
    frames.value = []
    framesError.value = humanizeFramesError((e as Error).message)
  } finally {
    framesLoading.value = false
  }
}

function humanizeLedgerError(message: string): string {
  return /ORGLOOP_LEDGER_TSV/.test(message)
    ? '还没有遗留事项台账（开始一次运行后生成）'
    : message
}

function humanizeFramesError(message: string): string {
  return /503/.test(message) ? '截图服务未配置：请联系管理员检查推演数据目录设置' : message
}

function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function phaseLabel(phase: FrameFile['phase']): string {
  return phase === 'before' ? '操作前' : phase === 'after' ? '操作后' : '截图'
}

onMounted(() => {
  void loadLedger()
  void loadFrames()
})
</script>

<template>
  <div class="ev" data-testid="ev-panel">
    <section class="ev__box">
      <h4 class="ev__h">锚点检索</h4>
      <div class="ev__row">
        <input v-model="anchorId" class="ev__input" data-testid="ev-anchor-input" placeholder="$ 事件号 或 7-40 位十六进制 commit（t_ 卡 / ! 房间亦可）" @keyup.enter="search">
        <button class="ev__btn" type="button" data-testid="ev-anchor-search" :disabled="searching" @click="search">反查</button>
      </div>
      <p v-if="anchorError" class="ev__error" data-testid="ev-anchor-error">{{ anchorError }}</p>
      <p v-else-if="anchorFound" class="ev__hint" :data-testid="'ev-anchor-found'">命中类型：{{ anchorFound.type }}（原文已进右侧抽屉）。</p>
    </section>

    <section class="ev__box">
      <div class="ev__box-head">
        <h4 class="ev__h">运行截图</h4>
        <div class="ev__tools">
          <select v-if="frameSteps.length > 1" v-model="frameStep" class="ev__select" data-testid="ev-frame-step">
            <option value="all">全部步骤（{{ frames.length }} 张）</option>
            <option v-for="s in frameSteps" :key="s" :value="s">{{ s }}</option>
          </select>
          <button class="ev__btn" type="button" data-testid="ev-frames-reload" :disabled="framesLoading" @click="loadFrames">刷新</button>
        </div>
      </div>
      <p v-if="framesError" class="ev__error" data-testid="ev-frames-error">{{ framesError }}</p>
      <p v-else-if="framesLoading" class="ev__hint">正在读取截图……</p>
      <p v-else-if="visibleFrames.length === 0" class="ev__hint" data-testid="ev-frames-absent">{{ framesNote || '本次运行没有截图' }}</p>
      <div v-else class="ev__frames" data-testid="ev-frames">
        <button
          v-for="f in visibleFrames"
          :key="f.name"
          type="button"
          class="ev__frame"
          :data-testid="`ev-frame-${f.name}`"
          :title="`${f.name}（${fmtSize(f.size)}）`"
          :data-frame-name="f.name"
          :ref="(el) => registerFrame(el, f)"
          @click="openPreview(f)"
        >
          <img v-if="thumbSrc[f.name]" :src="thumbSrc[f.name]" :alt="f.name" loading="lazy">
          <span v-else class="ev__frame-ph" aria-hidden="true" />
          <span class="ev__frame-cap">{{ f.step }}</span>
          <span class="ev__frame-phase">{{ phaseLabel(f.phase) }}</span>
        </button>
      </div>
    </section>

    <section class="ev__box">
      <div class="ev__box-head">
        <h4 class="ev__h">遗留事项台账（只读）</h4>
        <button class="ev__btn" type="button" data-testid="ev-ledger-load" :disabled="ledgerLoading" @click="loadLedger">刷新</button>
      </div>
      <p v-if="ledgerError" class="ev__error" data-testid="ev-ledger-error">{{ ledgerError }}</p>
      <p v-else-if="ledgerLoading" class="ev__hint">正在读取台账……</p>
      <p v-else-if="!ledger" class="ev__hint">暂无台账数据。</p>
      <template v-else>
        <p class="ev__hint" data-testid="ev-ledger-summary">待处理 {{ ledger.open }}｜已处理 {{ ledger.resolved }}｜已豁免 {{ ledger.waived }}｜{{ ledger.pass ? '已清算，可启动新运行' : '未清，暂不能启动新运行' }}</p>
        <table v-if="ledger.rows.length > 0" class="ev__table" data-testid="ev-ledger-table">
          <thead><tr><th>类型</th><th>缺陷</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="r in ledger.rows.slice(0, 50)" :key="r.id">
              <td>{{ compensationLabel(r.type) }}<span class="ev__code">{{ r.type }}</span></td>
              <td>{{ r.defect || '—' }}</td>
              <td>
                <span class="ev__state" :class="`ev__state--${r.state}`" :data-testid="`ev-ledger-state-${r.id}`">{{ r.state === 'open' ? '待处理' : r.state === 'waived' ? '已豁免' : '已处理' }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>

    <div v-if="preview" class="ev__preview" data-testid="ev-frame-preview" @click.self="closePreview">
      <div class="ev__preview-inner">
        <div class="ev__preview-head">
          <span class="ev__preview-name">{{ preview.name }}</span>
          <button class="ev__btn" type="button" @click="closePreview">关闭</button>
        </div>
        <img v-if="previewUrl" :src="previewUrl" :alt="preview.name">
        <p v-else class="ev__hint">大图加载中……</p>
      </div>
    </div>

    <SimAnchorDrawer
      :open="drawerOpen"
      :title="drawerTitle"
      :anchor-type="drawerAnchorType"
      :anchor-id="drawerAnchorId"
      :evidence="drawerEvidence"
      @close="drawerOpen = false"
    />
  </div>
</template>

<style scoped lang="scss">
.ev { display: flex; flex-direction: column; gap: 12px; }
.ev__box { border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; }
.ev__box-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.ev__h { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.ev__tools { display: flex; gap: 6px; align-items: center; }
.ev__row { display: flex; gap: 6px; }
.ev__input {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  font-family: var(--font-mono);
}
.ev__select {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 2px 6px;
  max-width: 220px;
}
.ev__btn {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.ev__error { color: var(--ia-fail); font-size: 12px; margin: 6px 0 0; word-break: break-all; }
.ev__hint { color: var(--text-muted); font-size: 12px; margin: 6px 0 0; }
.ev__table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 12px; }
.ev__table th, .ev__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color); }
.ev__state { padding: 0 6px; border-radius: 4px; font-size: 11px; }
.ev__state--open { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); }
.ev__state--waived { color: var(--ia-compensated); background: rgba(150, 84, 214, 0.18); }
.ev__state--resolved { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
.ev__code { margin-left: 6px; font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
.ev__frames {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}
.ev__frame {
  position: relative;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  overflow: hidden;
  background: var(--surface);
  cursor: zoom-in;
  text-align: left;
  img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; }
}
.ev__frame-ph { display: block; width: 100%; aspect-ratio: 16 / 10; background: var(--bg-secondary); }
.ev__frame-cap { display: block; padding: 3px 6px 0; font-size: 11px; color: var(--text-secondary); }
.ev__frame-phase { display: block; padding: 0 6px 4px; font-size: 10px; color: var(--text-muted); }
.ev__preview {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(0, 0, 0, 0.72);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.ev__preview-inner {
  max-width: min(1200px, 92vw); max-height: 92vh;
  display: flex; flex-direction: column; gap: 8px;
  img { max-width: 100%; max-height: calc(92vh - 44px); object-fit: contain; border-radius: 6px; background: var(--surface); }
}
.ev__preview-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--text-primary); font-size: 12px; }
.ev__preview-name { font-family: var(--font-mono); word-break: break-all; }
</style>
