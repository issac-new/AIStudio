<!-- overlay/custom/client/ia2/views/stage/StageG5Panel.vue -->
<!-- ⑤验收·G5 审批（spec 2026-10-19-studio-p2 §3）：上半=发布准出台账
     （run 绑定的批准/打回留痕，打回强制理由）；下半=发布类评审审批
     （ApprovalPanel filter=release，普通命令/评审不混入）。
     发布门只做人工批准留痕，不写 run-state 闸键（闸键由 harness 判定）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ApprovalPanel from '@/custom/cockpit/components/ApprovalPanel.vue'
import { useRunContext } from '../../composables/useRunContext'
import { fetchReleaseGate, postReleaseGate, type ReleaseGateStatus } from '../../api/sim-verdicts'

const emit = defineEmits<{ 'open-all': [] }>()
const { run } = useRunContext()

const status = ref<ReleaseGateStatus | null>(null)
const loadError = ref('')
const actionError = ref('')
const busy = ref(false)
const note = ref('')

const hasRun = computed(() => run.value.trim().length > 0)

async function load(): Promise<void> {
  const r = run.value.trim()
  status.value = null
  loadError.value = ''
  if (!r) return
  try {
    status.value = await fetchReleaseGate(r)
  } catch (e) {
    loadError.value = (e as Error).message
  }
}

/** 批准/打回：写台账后重读；打回未填理由由服务端拒绝，前端先拦一道。 */
async function decide(decision: 'approve' | 'reject'): Promise<void> {
  const r = run.value.trim()
  if (!r || busy.value) return
  if (decision === 'reject' && !note.value.trim()) {
    actionError.value = '打回必须给理由（填写理由后再打回）'
    return
  }
  const label = decision === 'approve' ? '批准发布' : '打回'
  if (!window.confirm(`确认${label}？决定将写入运行证据台账并留痕（可改判，历史保留）。`)) return
  busy.value = true
  actionError.value = ''
  try {
    await postReleaseGate({ run: r, decision, note: note.value.trim() || undefined })
    note.value = ''
    await load()
  } catch (e) {
    actionError.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

function fmtTime(ts: string): string {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
}

onMounted(() => { if (hasRun.value) void load() })
watch(run, () => { void load() })
</script>

<template>
  <div class="g5p" data-testid="stage-g5-panel">
    <section class="g5p__block" data-testid="g5-release-gate">
      <header class="g5p__head">
        <h3 class="g5p__title">发布准出（人工批准留痕）</h3>
        <span
          v-if="status?.decision"
          class="g5p__state"
          :class="status.decision === 'approve' ? 'g5p__state--approve' : 'g5p__state--reject'"
          data-testid="g5-current-decision"
        >{{ status.decision === 'approve' ? '已批准' : '已打回' }}</span>
        <span v-else-if="status" class="g5p__state g5p__state--none" data-testid="g5-current-decision">未决</span>
      </header>
      <p class="g5p__note">
        发布门是运行绑定的人工批准台账（evidence/release-gate.jsonl）：批准/打回均留痕、可改判；
        质量门闸键（g5_ready 等）仍由 harness 判定，本面板不改闸。
      </p>

      <div v-if="!hasRun" class="g5p__empty" data-testid="g5-no-run">
        <p>在页头选择一次运行后，这里显示发布门判定并可批准/打回。</p>
        <p class="g5p__dim">当前还没有历史运行——先完成一次运行，或到运行中心查看启动准备。</p>
      </div>
      <template v-else>
        <p v-if="loadError" class="g5p__error" data-testid="g5-load-error">{{ loadError }}</p>
        <p v-if="actionError" class="g5p__error" data-testid="g5-action-error">{{ actionError }}</p>

        <div v-if="status?.current" class="g5p__current" data-testid="g5-current">
          <span class="g5p__current-label">当前判定</span>
          <b :class="status.current.decision === 'approve' ? 'g5p__ok' : 'g5p__fail'">
            {{ status.current.decision === 'approve' ? '批准' : '打回' }}
          </b>
          <span class="g5p__dim">{{ fmtTime(status.current.ts) }} · {{ status.current.actor }}</span>
          <span v-if="status.current.note" class="g5p__dim">理由：{{ status.current.note }}</span>
        </div>

        <div class="g5p__actions">
          <textarea
            v-model="note"
            class="g5p__note-input"
            rows="2"
            :placeholder="'理由（打回必填，≤300 字）'"
            data-testid="g5-note-input"
          />
          <div class="g5p__btns">
            <button type="button" class="g5p__btn g5p__btn--approve" data-testid="g5-approve" :disabled="busy" @click="decide('approve')">批准发布</button>
            <button type="button" class="g5p__btn g5p__btn--reject" data-testid="g5-reject" :disabled="busy" @click="decide('reject')">打回</button>
          </div>
        </div>

        <details v-if="status?.records.length" class="g5p__history" data-testid="g5-history">
          <summary>留痕历史（{{ status.records.length }}）</summary>
          <ul>
            <li v-for="(rec, i) in [...status.records].reverse()" :key="i">
              <b :class="rec.decision === 'approve' ? 'g5p__ok' : 'g5p__fail'">{{ rec.decision === 'approve' ? '批准' : '打回' }}</b>
              <span class="g5p__dim">{{ fmtTime(rec.ts) }} · {{ rec.actor }}</span>
              <span v-if="rec.note" class="g5p__dim">— {{ rec.note }}</span>
            </li>
          </ul>
        </details>
      </template>
    </section>

    <section class="g5p__block">
      <header class="g5p__head">
        <h3 class="g5p__title">发布类评审审批</h3>
      </header>
      <p class="g5p__note">与发布、准出相关的评审卡；普通命令与普通评审在审批收件箱处理。</p>
      <ApprovalPanel :poll-ms="10000" :show-history="true" :hide-title="true" filter="release" @open-all="emit('open-all')" />
    </section>
  </div>
</template>

<style scoped>
.g5p { display: flex; flex-direction: column; gap: 18px; }
.g5p__block { display: flex; flex-direction: column; gap: 8px; }
.g5p__head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.g5p__title { margin: 0; font-size: 13px; font-weight: 600; }
.g5p__note { margin: 0; font-size: 11.5px; color: var(--text-muted); line-height: 1.55; }
.g5p__state { font-size: 11px; padding: 1px 8px; border-radius: 8px; }
.g5p__state--approve { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); }
.g5p__state--reject { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); }
.g5p__state--none { color: var(--text-muted); background: rgba(127, 127, 127, 0.12); }
.g5p__empty { border: 1px dashed var(--border-color); border-radius: 6px; padding: 10px 12px; font-size: 12px; }
.g5p__dim { color: var(--text-muted); font-size: 11px; }
.g5p__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.g5p__current { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; font-size: 12px; }
.g5p__ok { color: var(--ia-fresh); }
.g5p__fail { color: var(--ia-fail); }
.g5p__actions { display: flex; flex-direction: column; gap: 8px; max-width: 560px; }
.g5p__note-input {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 12px;
  padding: 6px 8px;
  resize: vertical;
}
.g5p__btns { display: flex; gap: 8px; }
.g5p__btn {
  border: 1px solid var(--border-color);
  background: transparent;
  border-radius: 5px;
  padding: 4px 14px;
  font-size: 12px;
  cursor: pointer;
}
.g5p__btn--approve { color: var(--ia-fresh); border-color: color-mix(in srgb, var(--ia-fresh) 45%, var(--border-color)); }
.g5p__btn--reject { color: var(--ia-fail); border-color: color-mix(in srgb, var(--ia-fail) 45%, var(--border-color)); }
.g5p__btn:disabled { opacity: 0.5; cursor: wait; }
.g5p__history { font-size: 12px; }
.g5p__history summary { cursor: pointer; color: var(--text-muted); font-size: 11.5px; }
.g5p__history ul { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
</style>
