<!-- overlay/custom/client/ia2/views/sim/SupervisionPanel.vue -->
<!-- S2 监督面板（B2 工单，R10/R2/R12——设计正本 §二 S2）：观察窗流+研判/判定
     时间线，只读零写。数据=GET /api/hermes/sim/journal（run 必填+tail 缺省 50）；
     任一行点击→锚点抽屉展开 journal 原行（下钻与报告每步四段同构的界面侧）。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchJournal, organizeJournal, type JournalLine, type OrganizedJournal } from '../../api/supervision'
import SimAnchorDrawer from '../../components/sim/SimAnchorDrawer.vue'
import { useRouter } from 'vue-router'
import { useRunContext } from '../../composables/useRunContext'

const router = useRouter()
const { run, remember } = useRunContext()
const tail = ref(50)
const loading = ref(false)
const loadError = ref('')
const organized = ref<OrganizedJournal | null>(null)
const source = ref('')

// 锚点抽屉（R7：全产品唯一反查交互）
const drawerOpen = ref(false)
const drawerTitle = ref('')
const drawerEvidence = ref('')

function openLineDrawer(title: string, line: JournalLine | Record<string, unknown>): void {
  drawerTitle.value = title
  drawerEvidence.value = JSON.stringify(line, null, 2)
  drawerOpen.value = true
}

const windowsDesc = computed(() => (organized.value ? [...organized.value.windows].reverse() : []))

async function load(): Promise<void> {
  const r = run.value.trim()
  if (!r) { loadError.value = '请输入运行目录名（如 20261015-v8-run20）'; return }
  loading.value = true
  loadError.value = ''
  try {
    const res = await fetchJournal(r, Math.max(1, Math.min(1000, Number(tail.value) || 50)))
    organized.value = organizeJournal(res.lines)
    source.value = res.source
    remember()
  } catch (e) {
    organized.value = null
    loadError.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

// 跨签贯通：run 已预填（query 或最近记忆）则挂载即读取，省一次手动点击
onMounted(() => { if (run.value.trim()) void load() })
</script>

<template>
  <div class="sup" data-testid="sup-panel">
    <div class="sup__bar">
      <input v-model="run" class="sup__input" data-testid="sup-run" placeholder="运行目录名（如 20261015-v8-run20）" @keyup.enter="load">
      <select v-model.number="tail" class="sup__select" data-testid="sup-tail">
        <option :value="50">尾 50 行</option>
        <option :value="200">尾 200 行</option>
        <option :value="1000">尾 1000 行</option>
      </select>
      <button class="sup__btn" type="button" data-testid="sup-load" :disabled="loading" @click="load">读取</button>
    </div>

    <p v-if="loadError" class="sup__error" data-testid="sup-error">{{ loadError }}</p>
    <div v-else-if="!organized" class="sup__hint" data-testid="sup-empty">
      <p>输入运行目录名读取观察窗 journal——主管不翻 agent.log 即可回答「现在卡在哪、谁没动」。</p>
      <button type="button" class="sup__goto" data-testid="sup-goto-overview" @click="router.push({ name: 'ia2.sim' })">不知道目录名？去运行总览选取 →</button>
    </div>
    <p v-else-if="source" class="sup__src" :data-testid="'sup-src'">数据源：{{ source }}</p>

    <div v-if="organized" class="sup__grid">
      <section class="sup__main">
        <h4 class="sup__h">观察窗流（{{ organized.windows.length }} 窗）</h4>
        <p v-if="organized.windows.length === 0" class="sup__hint" data-testid="sup-windows-empty">该区间无观察窗行。</p>
        <div v-for="w in windowsDesc" :key="w.id" class="sup__win" :data-testid="`sup-win-${w.id}`">
          <div class="sup__win-head">
            <span class="sup__win-id">{{ w.id }}</span>
            <span class="sup__win-ts">{{ w.startTs }}</span>
            <span v-if="w.posture" class="sup__win-posture">{{ w.posture }}</span>
          </div>
          <div class="sup__win-meta">
            轮数 {{ w.rounds }}｜有变化 {{ w.changedRounds }}｜闸事件 {{ w.gateEvents }}｜台账事件 {{ w.ledgerEvents }}｜缺陷单 {{ w.tickets }}
          </div>
          <div v-if="w.summary" class="sup__win-summary" :data-testid="`sup-win-summary-${w.id}`">{{ w.summary }}</div>
        </div>
        <details class="sup__tickets" data-testid="sup-tickets">
          <summary>缺陷单 {{ organized.tickets.length }} 条（journal 原行可反查）</summary>
          <ul class="sup__ticket-list">
            <li v-for="(tk, i) in organized.tickets" :key="i" class="sup__ticket" role="button" @click="openLineDrawer(`缺陷单 ${tk.ts}`, tk)">
              <span class="sup__ticket-meta">{{ tk.ts }}｜{{ tk.pr }}｜{{ tk.type }} ×{{ tk.count }}</span>
              <span class="sup__ticket-text">{{ tk.ticket }}</span>
            </li>
          </ul>
        </details>
      </section>

      <aside class="sup__side">
        <section class="sup__side-box">
          <h4 class="sup__h">研判（接棒员局势）</h4>
          <p v-if="organized.briefs.length === 0" class="sup__hint">无研判行。</p>
          <ul v-else class="sup__tl">
            <li v-for="(b, i) in organized.briefs" :key="i" class="sup__tl-row" role="button" data-testid="sup-brief-row" @click="openLineDrawer(`研判 ${b.ts}`, { t: 'situation_brief', ts: b.ts, brief: b.text })">
              <span class="sup__tl-ts">{{ b.ts }}</span>
              <span class="sup__tl-text">{{ b.text }}</span>
            </li>
          </ul>
        </section>
        <section class="sup__side-box">
          <h4 class="sup__h">判定（停滞判定）</h4>
          <p v-if="organized.verdicts.length === 0" class="sup__hint">无判定行。</p>
          <ul v-else class="sup__tl">
            <li v-for="(v, i) in organized.verdicts" :key="i" class="sup__tl-row sup__tl-row--verdict" role="button" data-testid="sup-verdict-row" @click="openLineDrawer(`判定 ${v.ts}`, { t: 'stall_verdict', ts: v.ts, verdict: v.text })">
              <span class="sup__tl-ts">{{ v.ts }}</span>
              <span class="sup__tl-text">{{ v.text }}</span>
            </li>
          </ul>
        </section>
        <p v-if="organized.unclassified > 0" class="sup__hint" data-testid="sup-unclassified">
          未归类行 {{ organized.unclassified }} 条（journal 新行型随端点升级归类，如实计数不丢弃）。
        </p>
      </aside>
    </div>

    <SimAnchorDrawer
      :open="drawerOpen"
      :title="drawerTitle"
      :evidence="drawerEvidence"
      @close="drawerOpen = false"
    />
  </div>
</template>

<style scoped lang="scss">
.sup { display: flex; flex-direction: column; gap: 10px; }
.sup__bar { display: flex; gap: 6px; flex-wrap: wrap; }
.sup__input {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 12px;
  width: 260px;
  font-family: var(--font-mono);
}
.sup__select, .sup__btn {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 8px;
}
.sup__btn { cursor: pointer; &:disabled { opacity: 0.4; } }
.sup__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.sup__goto { border: none; background: transparent; padding: 2px 0; color: var(--accent-primary); cursor: pointer; font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
.sup__hint { color: var(--text-muted); font-size: 12px; margin: 0; }
.sup__src { color: var(--text-muted); font-size: 11px; margin: 0; font-family: var(--font-mono); }
.sup__grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 14px; }
.sup__h { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
.sup__win {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 10px;
  & + & { margin-top: 6px; }
}
.sup__win-head { display: flex; gap: 8px; align-items: baseline; }
.sup__win-id { font-family: var(--font-mono); font-size: 12px; font-weight: 600; }
.sup__win-ts { font-size: 11px; color: var(--text-muted); }
.sup__win-posture { font-size: 11px; color: var(--accent-info); }
.sup__win-meta { margin-top: 4px; font-size: 12px; }
.sup__win-summary { margin-top: 4px; font-size: 12px; color: var(--text-muted); }
.sup__tickets { font-size: 12px; summary { cursor: pointer; margin-bottom: 4px; } }
.sup__ticket-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.sup__ticket { cursor: pointer; display: flex; flex-direction: column; gap: 2px; padding: 4px 6px; border-radius: 4px; &:hover { background: rgba(127, 127, 127, 0.08); } }
.sup__ticket-meta { font-family: var(--font-mono); font-size: 11px; }
.sup__ticket-text { font-size: 12px; }
.sup__side { display: flex; flex-direction: column; gap: 10px; }
.sup__side-box { border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; }
.sup__tl { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.sup__tl-row { cursor: pointer; display: flex; gap: 6px; font-size: 12px; padding: 4px 6px; border-radius: 4px; &:hover { background: rgba(127, 127, 127, 0.08); } }
.sup__tl-row--verdict { border-left: 3px solid var(--accent-primary); }
.sup__tl-ts { color: var(--text-muted); font-size: 11px; white-space: nowrap; }
.sup__tl-text { word-break: break-all; }
</style>
