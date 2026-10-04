<!-- overlay/custom/client/ide/components/IdeReplayTheater.vue -->
<!-- P5 编辑时间轴回放（Replay Theater，2026-10-04 九源轮）：逐轮文件修改
     before/after 对照。数据面 GET /api/ide/replay/:sessionId（filehistory
     双相快照投影）。作为模组带一员（priority 55）：无快照不占位。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useChatStore } from '@/stores/hermes/chat'
import { useI18n } from 'vue-i18n'

const { locale } = useI18n()
const T = computed(() => ((((locale as { value?: string } | undefined)?.value) ?? 'zh').startsWith('zh')
  ? {
      open: '回放文件修改', none: '本会话暂无回合快照', steps: '轮', files: (n: number) => `${n} 个文件`,
      lines: (a: number, d: number) => `+${a} / -${d}`, added: '新增', removed: '删除', changed: '修改',
      before: '改前', after: '改后', empty: '（该轮无文件改动）', close: '关闭',
      truncated: (n: number) => `…另有 ${n} 行未展示`,
    }
  : {
      open: 'Replay edits', none: 'No turn snapshots for this session', steps: 'Turn', files: (n: number) => `${n} file(s)`,
      lines: (a: number, d: number) => `+${a} / -${d}`, added: 'added', removed: 'removed', changed: 'changed',
      before: 'Before', after: 'After', empty: '(no file changes this turn)', close: 'Close',
      truncated: (n: number) => `…${n} more lines not shown`,
    }))

interface FileView { path: string; kind: string; addedLines: number; deletedLines: number; contextBefore: number; contextAfter: number; beforeExcerpt: string[]; afterExcerpt: string[] }
interface Step { turnIndex: number; at: number; files: FileView[]; totalAdded: number; totalDeleted: number }

const chatStore = useChatStore()
const open = ref(false)
const steps = ref<Step[] | null>(null)
const loading = ref(false)
const error = ref('')
const activeTurn = ref<number | null>(null)
const activeFile = ref(0)

async function load(): Promise<void> {
  const sid = chatStore.activeSessionId
  if (!sid) return
  loading.value = true
  error.value = ''
  try {
    const jwt = localStorage.getItem('hermes_api_key') || ''
    const res = await fetch(`/api/ide/replay/${encodeURIComponent(sid)}`, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json()
    steps.value = body.steps ?? []
    activeTurn.value = steps.value.length ? steps.value[0]!.turnIndex : null
    activeFile.value = 0
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    steps.value = []
  } finally {
    loading.value = false
  }
}

watch(open, (v) => { if (v && steps.value === null) void load() })

const hasData = computed(() => (steps.value?.length ?? 0) > 0)
const currentStep = computed(() => steps.value?.find((s) => s.turnIndex === activeTurn.value) ?? null)
const currentFile = computed(() => currentStep.value?.files[activeFile.value] ?? null)
const kindLabel = computed(() => {
  const k = currentFile.value?.kind
  return k === 'added' ? T.value.added : k === 'removed' ? T.value.removed : T.value.changed
})
function fmtTime(ts: number): string { return ts ? new Date(ts).toLocaleTimeString() : '' }
</script>

<template>
  <div class="irt">
    <button type="button" class="irt__trigger" data-testid="ide-replay-trigger" @click="open = true">⏱ {{ T.open }}</button>
    <div v-if="open" class="irt__modal" data-testid="ide-replay-modal">
      <div class="irt__panel">
        <div class="irt__head">
          <strong>{{ T.open }}</strong>
          <button type="button" data-testid="ide-replay-close" @click="open = false">{{ T.close }}</button>
        </div>
        <div v-if="loading" class="irt__state">…</div>
        <div v-else-if="error" class="irt__state irt__err">{{ error }}</div>
        <div v-else-if="!hasData" class="irt__state">{{ T.none }}</div>
        <div v-else class="irt__body">
          <ol class="irt__steps" data-testid="ide-replay-steps">
            <li
              v-for="s in steps" :key="s.turnIndex"
              :class="{ 'is-active': s.turnIndex === activeTurn }"
              :data-testid="`ide-replay-step-${s.turnIndex}`"
              @click="activeTurn = s.turnIndex; activeFile = 0"
            >
              <span class="irt__stepnum">{{ T.steps }} {{ s.turnIndex }}</span>
              <span class="irt__stepmeta">{{ T.files(s.files.length) }} · {{ T.lines(s.totalAdded, s.totalDeleted) }}</span>
              <span class="irt__steptime">{{ fmtTime(s.at) }}</span>
            </li>
          </ol>
          <div class="irt__detail">
            <div v-if="!currentStep || !currentStep.files.length" class="irt__state">{{ T.empty }}</div>
            <template v-else>
              <div class="irt__filebar" data-testid="ide-replay-files">
                <button
                  v-for="(f, i) in currentStep.files" :key="f.path"
                  type="button" :class="{ 'is-active': i === activeFile }"
                  @click="activeFile = i"
                >{{ f.path }} <span class="irt__fd">{{ T.lines(f.addedLines, f.deletedLines) }}</span></button>
              </div>
              <div v-if="currentFile" class="irt__diff">
                <div class="irt__diffhead">
                  <code>{{ currentFile.path }}</code>
                  <span class="irt__kind" :class="`irt__kind--${currentFile.kind}`">{{ kindLabel }}</span>
                  <span class="irt__ctx">ctx {{ currentFile.contextBefore }}↑ / {{ currentFile.contextAfter }}↓</span>
                </div>
                <div class="irt__cols" data-testid="ide-replay-diff">
                  <div class="irt__col">
                    <div class="irt__colhead">{{ T.before }}</div>
                    <div v-for="(l, i) in currentFile.beforeExcerpt" :key="i" class="irt__line irt__line--del">{{ l }}</div>
                  </div>
                  <div class="irt__col">
                    <div class="irt__colhead">{{ T.after }}</div>
                    <div v-for="(l, i) in currentFile.afterExcerpt" :key="i" class="irt__line irt__line--add">{{ l }}</div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.irt { display: contents; }
.irt__trigger { border: 1px dashed var(--border-color, #ccc); background: none; border-radius: 8px; font-size: 11px; color: var(--text-color-3, #999); cursor: pointer; padding: 1px 10px; align-self: flex-start; }
.irt__modal { position: fixed; inset: 0; background: rgb(0 0 0 / 40%); z-index: 600; display: flex; align-items: center; justify-content: center; }
.irt__panel { width: min(860px, 92vw); max-height: 76vh; display: flex; flex-direction: column; background: var(--card-color, #fff); border-radius: 10px; padding: 10px 14px; font-size: 12px; }
.irt__head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.irt__head button { border: 1px solid var(--border-color, #ddd); background: none; border-radius: 6px; cursor: pointer; font-size: 11px; padding: 1px 8px; }
.irt__state { padding: 18px; color: var(--text-color-3, #999); }
.irt__err { color: var(--error-color, #d03050); }
.irt__body { display: flex; gap: 10px; min-height: 0; flex: 1; }
.irt__steps { list-style: none; margin: 0; padding: 0; width: 200px; overflow: auto; display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
.irt__steps li { display: flex; flex-direction: column; padding: 4px 6px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; cursor: pointer; }
.irt__steps li.is-active { border-color: var(--primary-color, #18a058); }
.irt__stepnum { font-weight: 600; }
.irt__stepmeta { font-size: 10.5px; color: var(--text-color-3, #999); }
.irt__steptime { font-size: 10px; color: var(--text-color-3, #999); }
.irt__detail { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.irt__filebar { display: flex; gap: 4px; flex-wrap: wrap; }
.irt__filebar button { border: 1px solid var(--border-color, #ddd); background: none; border-radius: 6px; font-size: 10.5px; cursor: pointer; padding: 1px 6px; &.is-active { border-color: var(--primary-color, #18a058); } }
.irt__fd { color: var(--text-color-3, #999); }
.irt__diff { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; overflow: auto; }
.irt__diffhead { display: flex; gap: 8px; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--border-color, #e5e7eb); }
.irt__kind { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid currentColor; }
.irt__kind--added { color: var(--success-color, #18a058); }
.irt__kind--removed { color: var(--error-color, #d03050); }
.irt__kind--changed { color: var(--warning-color, #f0a020); }
.irt__ctx { font-size: 10px; color: var(--text-color-3, #999); }
.irt__cols { display: grid; grid-template-columns: 1fr 1fr; }
.irt__col { min-width: 0; }
.irt__colhead { font-size: 10px; padding: 2px 8px; background: rgb(0 0 0 / 4%); }
.irt__line { font-family: monospace; font-size: 10.5px; padding: 0 8px; white-space: pre-wrap; word-break: break-all; }
.irt__line--del { background: rgb(255 160 160 / 15%); }
.irt__line--add { background: rgb(24 160 88 / 12%); }
.irt__more { font-size: 10px; color: var(--text-color-3, #999); padding: 0 8px; }
</style>
