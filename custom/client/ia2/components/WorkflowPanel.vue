<!-- overlay/custom/client/ia2/components/WorkflowPanel.vue -->
<!-- 工作流面板（2026-10-23 五轮 H）：新建工作流（声明式步骤：本机分布式 hermes
     身份 / matrix 集群房间，串/并行）+ 运行详情（每步状态与回执）。模型迁移自
     zcode dynamic-workflow 的 agent().ask() 子代理调度范式。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { fetchIdentities, type IdentityInfo } from '../identity-chat'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { deleteWorkflowRun, fetchWorkflowRun, fetchWorkflowRuns, startWorkflow, type WorkflowRun } from '../workflow'

const props = defineProps<{ runId?: string | null }>()

const emit = defineEmits<{
  /** 行点击/创建成功 → 宿主更新 ?wf=<runId> 深链 */
  (e: 'open-run', id: string): void
  /** 新建取消（URL 态 ?wf=new）→ 宿主清除 wf query */
  (e: 'cancel'): void
}>()

const runs = ref<WorkflowRun[]>([])
const detail = ref<WorkflowRun | null>(null)
const identities = ref<IdentityInfo[]>([])
const listError = ref('')
const detailError = ref('')
const detailLoading = ref(false)

// matrix 集群房间下拉（批 2 ①）：与左栏聊天列表同一数据源（matrix-room store），
// 不再手填 roomId——实测手填易错且无从发现房间。
const matrixRoom = useMatrixRoomStore()
const roomOptions = computed(() =>
  (matrixRoom.sortedRooms ?? []).map(r => ({ roomId: r.roomId, name: r.name || r.roomId })))
const composerOpen = ref(false)
const busy = ref(false)
const errMsg = ref('')

// ── 列表轮询：running 存在时 4s，否则 30s ──
// Task 3（2026-10-27）：刷新完成后重排——旧实现挂载即按空列表排 30s，
// 首载明明有 running 也要等 30s 才第一次跟进；失败置错误态（不得伪装空列表）。
// fix round 1（卸载竞态）：宿主以 :key="wf:${wfRunId}" 强重挂本面板，fetch 在途
// 时卸载后 onUnmounted 已清旧 timer，在途 refreshRuns 落地不得再新建 interval
// （否则永无清理者，无限轮询泄漏）——disposed 守卫在 schedule 前拦截。
let timer: ReturnType<typeof setInterval> | null = null
let disposed = false
async function refreshRuns(): Promise<void> {
  try {
    runs.value = await fetchWorkflowRuns()
    listError.value = ''
  } catch (e) {
    listError.value = (e as Error).message.slice(0, 160)
  }
  if (!disposed) schedule()
}
function schedule(): void {
  const hasRunning = runs.value.some(r => r.status === 'running')
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    void refreshRuns()
    if (detail.value) void loadDetail(detail.value.id)
  }, hasRunning ? 4_000 : 30_000)
}
onMounted(() => { void refreshRuns(); void fetchIdentities().then(l => { identities.value = l }).catch(() => {}) })
onUnmounted(() => { disposed = true; if (timer) clearInterval(timer) })

// ── 详情 ──
async function removeRun(): Promise<void> {
  if (!detail.value || detail.value.status === 'running') return
  try {
    await deleteWorkflowRun(detail.value.id)
    detail.value = null
    await refreshRuns()
    if (typeof location !== 'undefined' && location.hash.includes('wf=')) location.hash = '#/app/collab'
  } catch (e) { errMsg.value = (e as Error).message.slice(0, 160) }
}

async function loadDetail(id: string): Promise<void> {
  detailLoading.value = !detail.value
  try {
    detail.value = await fetchWorkflowRun(id)
    detailError.value = ''
  } catch (e) {
    // 轮询刷新失败保旧态（既有语义）；首载失败必须给错误+重试出口，不得永久 loading
    if (!detail.value) detailError.value = (e as Error).message.slice(0, 160)
  } finally {
    detailLoading.value = false
  }
}

async function retryDetail(): Promise<void> {
  if (!props.runId || props.runId === 'new') return
  detailError.value = ''
  await loadDetail(props.runId)
}

/** 新建取消：关弹层；URL 态（?wf=new）通知宿主清 query */
function cancelComposer(): void {
  composerOpen.value = false
  if (props.runId === 'new') emit('cancel')
}

watch(() => props.runId, id => {
  detail.value = null
  detailError.value = ''
  composerOpen.value = id === 'new'
  if (id && id !== 'new') void loadDetail(id)
}, { immediate: true })

const shown = computed(() => (props.runId ? [] : runs.value))
const stepBadge = (s: WorkflowRun['steps'][number]): string =>
  ({ pending: '待', running: '跑', ok: '成', queued: '排队', error: '错' })[s.status]
const statusTone = (st: WorkflowRun['status']): string =>
  st === 'done' ? 'ok' : st === 'running' ? 'run' : st === 'partial' ? 'warn' : 'err'

// ── 新建表单 ──
const form = ref({
  name: '',
  mode: 'parallel' as 'parallel' | 'serial',
  steps: [{ targetKind: 'identity' as const, ref: '', instructions: '' }],
})
function addStep(): void { form.value.steps.push({ targetKind: 'identity', ref: '', instructions: '' }) }
function removeStep(i: number): void { if (form.value.steps.length > 1) form.value.steps.splice(i, 1) }
async function run(): Promise<void> {
  errMsg.value = ''
  busy.value = true
  try {
    const r = await startWorkflow({
      name: form.value.name.trim() || `工作流 ${new Date().toLocaleTimeString()}`,
      mode: form.value.mode,
      steps: form.value.steps.map(s => ({ targetKind: s.targetKind, ref: s.ref.trim(), instructions: s.instructions.trim() })),
    })
    composerOpen.value = false
    form.value = { name: '', mode: 'parallel', steps: [{ targetKind: 'identity', ref: '', instructions: '' }] }
    await refreshRuns()
    detail.value = r
    // Task 3（2026-10-27）：创建成功把 URL 从 wf=new 换成真实运行 ID（刷新/分享不失真）
    emit('open-run', r.id)
  } catch (e) {
    errMsg.value = (e as Error).message.slice(0, 200)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="wfp" data-testid="workflow-panel">
    <!-- 列表层（无 runId 时）：左栏工作流区块的数据源由宿主取，此处也可独立用 -->
    <template v-if="!props.runId">
      <div class="wfp__bar">
        <span class="wfp__title">工作流<span class="wfp__n">{{ runs.length }}</span></span>
        <button type="button" class="wfp__new" data-testid="wf-new" @click="composerOpen = true">＋ 运行工作流</button>
      </div>
      <!-- Task 3：取数失败≠真空——错误态 + 重试，不得伪装成「还没有工作流」空态 -->
      <div v-if="listError && runs.length === 0" class="wfp__listerr" data-testid="wf-list-error">
        <span class="wfp__step-err">工作流列表载入失败：{{ listError }}（稍后自动重试）</span>
        <button type="button" class="wfp__retry" data-testid="wf-list-retry" @click="refreshRuns">立即重试</button>
      </div>
      <p v-else-if="runs.length === 0" class="wfp__empty">还没有工作流——「＋ 运行工作流」向分布式 agent / matrix 集群下发多步任务</p>
      <button v-for="r in shown" :key="r.id" type="button" class="wfp__row" :data-testid="`wf-row-${r.id}`"
        @click="emit('open-run', r.id)">
        <span class="wfp__dot" :class="`wfp__dot--${statusTone(r.status)}`" />
        <span class="wfp__name">{{ r.name }}</span>
        <span class="wfp__meta">{{ r.mode === 'parallel' ? '并行' : '串行' }} · {{ r.steps.filter(s => s.status === 'ok' || s.status === 'queued').length }}/{{ r.steps.length }}</span>
      </button>
    </template>

    <!-- 详情层（runId 时）：载入/错误/内容三态分明，失败可重试 -->
    <template v-else>
      <div v-if="detail" class="wfp__detail" data-testid="wf-detail">
        <header class="wfp__dhead">
          <span class="wfp__dot" :class="`wfp__dot--${statusTone(detail.status)}`" />
          <span class="wfp__dname">{{ detail.name }}</span>
          <span class="wfp__dmode">{{ detail.mode === 'parallel' ? '并行' : '串行' }}</span>
          <button type="button" class="wfp__del" data-testid="wf-del" :disabled="detail.status === 'running'" :title="detail.status === 'running' ? '运行中不可删除' : '删除该运行记录'" @click="removeRun">删除记录</button>
        </header>
        <div v-for="(s, i) in detail.steps" :key="i" class="wfp__step" :data-testid="`wf-step-${i}`">
          <div class="wfp__step-top">
            <span class="wfp__step-badge" :class="`wfp__step-badge--${s.status}`">{{ stepBadge(s) }}</span>
            <span class="wfp__step-target">{{ s.targetKind === 'identity' ? '身份' : 'Matrix' }} · {{ s.ref }}</span>
          </div>
          <p class="wfp__step-ins">{{ s.instructions }}</p>
          <p v-if="s.reply" class="wfp__step-reply">{{ s.reply }}</p>
          <p v-if="s.error" class="wfp__step-err">{{ s.error }}</p>
        </div>
      </div>
      <p v-else-if="detailLoading" class="wfp__empty">载入运行详情…</p>
      <div v-else-if="detailError" class="wfp__detailerr" data-testid="wf-detail-error">
        <p class="wfp__step-err">运行详情载入失败：{{ detailError }}</p>
        <button type="button" class="wfp__retry" data-testid="wf-detail-retry" @click="retryDetail">重试</button>
      </div>
      <p v-else class="wfp__empty">{{ props.runId === 'new' ? '新建工作流…' : '载入运行详情…' }}</p>
    </template>

    <!-- 新建弹层 -->
    <div v-if="composerOpen" class="wfp__modal" data-testid="wf-composer" @click.self="cancelComposer">
      <div class="wfp__sheet">
        <h3>运行工作流</h3>
        <p class="wfp__hint">每步=对一个目标下达指令（zcode workflow 的 agent().ask() 范式）：身份=本机网关分布式 hermes agent；Matrix=向集群房间投递（远程网关成员原生处理）。</p>
        <input v-model="form.name" class="wfp__input" placeholder="工作流名称（可空，自动命名）" data-testid="wf-name">
        <div class="wfp__mode">
          <button type="button" :class="{ 'is-on': form.mode === 'parallel' }" data-testid="wf-mode-parallel" @click="form.mode = 'parallel'">并行（同时下发）</button>
          <button type="button" :class="{ 'is-on': form.mode === 'serial' }" data-testid="wf-mode-serial" @click="form.mode = 'serial'">串行（依次等待）</button>
        </div>
        <div v-for="(s, i) in form.steps" :key="i" class="wfp__fstep">
          <div class="wfp__fstep-top">
            <select v-model="s.targetKind" class="wfp__select" :data-testid="`wf-step-kind-${i}`">
              <option value="identity">身份（hermes agent）</option>
              <option value="matrix">Matrix（集群房间）</option>
            </select>
            <select v-if="s.targetKind === 'identity'" v-model="s.ref" class="wfp__select wfp__select--ref" :data-testid="`wf-step-ref-${i}`">
              <option value="" disabled>选择身份…</option>
              <option v-for="idn in identities" :key="idn.id" :value="idn.id">{{ idn.id }}{{ idn.online ? ' ·在线' : '' }}</option>
            </select>
            <select v-else v-model="s.ref" class="wfp__select wfp__select--ref" :data-testid="`wf-step-ref-${i}`">
              <option value="" disabled>选择集群房间…</option>
              <option v-for="rm in roomOptions" :key="rm.roomId" :value="rm.roomId">{{ rm.name }}（{{ rm.roomId.slice(0, 10) }}…）</option>
            </select>
            <button v-if="form.steps.length > 1" type="button" class="wfp__rm" :data-testid="`wf-step-rm-${i}`" @click="removeStep(i)">✕</button>
          </div>
          <textarea v-model="s.instructions" class="wfp__ta" rows="2" placeholder="指令（这一步要它做什么）" :data-testid="`wf-step-ins-${i}`" />
        </div>
        <div class="wfp__acts">
          <button type="button" class="wfp__ghost" data-testid="wf-add-step" @click="addStep">＋ 加一步</button>
          <button type="button" class="wfp__ghost" data-testid="wf-cancel" @click="cancelComposer">取消</button>
          <button type="button" class="wfp__primary" data-testid="wf-run-btn" :disabled="busy" @click="run">{{ busy ? '启动中…' : '运行' }}</button>
        </div>
        <p v-if="errMsg" class="wfp__step-err">{{ errMsg }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.wfp { display: flex; flex-direction: column; gap: 6px; }
.wfp__bar { display: flex; align-items: center; gap: 8px; padding: 4px 2px; }
.wfp__title { font-size: 11px; font-weight: 700; color: var(--text-muted); letter-spacing: .08em; }
.wfp__n { margin-left: 4px; font-weight: 400; }
.wfp__new { margin-left: auto; font-size: 11px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent; cursor: pointer; &:hover { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); } }
.wfp__empty { margin: 8px 2px; font-size: 12px; color: var(--text-muted); }
.wfp__listerr, .wfp__detailerr { display: flex; align-items: center; gap: 8px; margin: 8px 2px; font-size: 12px; }
.wfp__retry {
  font-size: 11px; padding: 3px 10px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent;
  &:hover { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
}
.wfp__row { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border: none; border-radius: 6px; background: transparent; cursor: pointer; text-align: left;
  &:hover { background: var(--bg-secondary); } }
.wfp__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text-primary); }
.wfp__meta { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.wfp__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  &--ok { background: var(--color-success, #2f9e44); } &--run { background: var(--accent-primary); animation: wfpPulse 1.2s infinite; }
  &--warn { background: var(--warning); } &--err { background: var(--color-danger, #d33); } }
@keyframes wfpPulse { 50% { opacity: .4; } }
.wfp__detail { display: flex; flex-direction: column; gap: 8px; }
.wfp__dhead { display: flex; align-items: center; gap: 8px; }
.wfp__dname { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.wfp__del { margin-left: auto; font-size: 11px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--color-danger, #d33); color: var(--color-danger, #d33); background: transparent; cursor: pointer; }
.wfp__del:hover:not(:disabled) { background: color-mix(in srgb, var(--color-danger, #d33) 8%, transparent); }
.wfp__del:disabled { opacity: .4; cursor: default; }
.wfp__dmode { font-size: 10px; color: var(--text-muted); border: 1px solid var(--border-color); border-radius: 3px; padding: 0 4px; }
.wfp__step { border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; }
.wfp__step-top { display: flex; align-items: center; gap: 8px; }
.wfp__step-badge { font-size: 10px; border-radius: 3px; padding: 0 4px; border: 1px solid var(--border-color); color: var(--text-muted);
  &--ok { color: var(--color-success, #2f9e44); border-color: currentColor; } &--running { color: var(--accent-primary); border-color: currentColor; }
  &--error { color: var(--color-danger, #d33); border-color: currentColor; } &--queued { color: var(--warning); border-color: currentColor; } }
.wfp__step-target { font-size: 11px; font-weight: 600; color: var(--text-primary); }
.wfp__step-ins { margin: 0; font-size: 11px; color: var(--text-muted); white-space: pre-wrap; }
.wfp__step-reply { margin: 0; font-size: 12px; color: var(--text-primary); white-space: pre-wrap; background: var(--bg-secondary); border-radius: 6px; padding: 6px 8px; }
.wfp__step-err { margin: 0; font-size: 11px; color: var(--color-danger, #d33); }
.wfp__modal { position: fixed; inset: 0; z-index: 1200; background: rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; }
.wfp__sheet { width: min(560px, 92vw); max-height: 84vh; overflow-y: auto; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
  h3 { margin: 0; font-size: 14px; } }
.wfp__hint { margin: 0; font-size: 11px; color: var(--text-muted); line-height: 1.5; }
.wfp__input, .wfp__select, .wfp__ta { border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 12px; background: var(--bg-primary); color: var(--text-primary); font-family: inherit; }
.wfp__ta { resize: vertical; }
.wfp__mode { display: flex; gap: 6px; button { flex: 1; font-size: 11.5px; padding: 5px 0; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); cursor: pointer;
  &.is-on { border-color: var(--accent-primary); color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 8%, transparent); } } }
.wfp__fstep { display: flex; flex-direction: column; gap: 5px; border: 1px dashed var(--border-color); border-radius: 8px; padding: 8px; }
.wfp__fstep-top { display: flex; gap: 6px; align-items: center; }
.wfp__select--ref { flex: 1; min-width: 0; }
.wfp__rm { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; &:hover { color: var(--color-danger, #d33); } }
.wfp__acts { display: flex; gap: 8px; justify-content: flex-end; }
.wfp__ghost { font-size: 12px; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); cursor: pointer; }
.wfp__primary { font-size: 12px; padding: 6px 18px; border-radius: 6px; border: 1px solid var(--accent-primary); color: var(--accent-primary); background: transparent; cursor: pointer; font-weight: 600;
  &:hover:not(:disabled) { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); } &:disabled { opacity: .5; } }
</style>
