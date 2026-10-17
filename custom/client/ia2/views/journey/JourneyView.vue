<!-- overlay/custom/client/ia2/views/journey/JourneyView.vue -->
<!-- 旅程首页（D12 时序重构 → D18 旅程式重构定稿，2026-10-17 用户裁定）：
     产品默认入口（/app 索引路由），按「从 0 到 1」的使用时序组织两区十卡——
     A 区搭建五步（建立组织→建立账号→建立团队与协调关系→准备环境与资产→
     准备智能体，单一事实源=stage-meta.ts 的 SETUP_STEPS）；B 区交付五阶段
     （需求→分析设计→开发→验收→治理，与顶栏②-⑥同构同名的 STAGE_META）。
     每卡=状态（run-state 键推导）+一句话+进入入口；无轮次=引导态（从 A 区
     第 1 步开始）；有轮次=当前卡点提示条（第一道未过阶段+遗留项清算提示）。
     设计正本=docs/superpowers/specs/2026-10-17-journey-ia-terminology-redesign.md §5.1。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authFetch } from '../../../ide/utils/auth-fetch'
import { STAGE_META, SETUP_STEPS, type SetupStep } from '../../stage-meta'

const route = useRoute()
const router = useRouter()
const run = computed(() => String(route.query.run ?? '').trim())
const runState = ref<{ posture: string; gates: Record<string, string>; steps: Record<string, string>; ledger: { open: number } } | null>(null)
const loadError = ref('')

async function load(): Promise<void> {
  loadError.value = ''
  runState.value = null
  if (!run.value) return
  try {
    const res = await authFetch(`/api/hermes/sim/run-state?run=${encodeURIComponent(run.value)}`)
    if (!res.ok) throw new Error(String(res.status))
    runState.value = await res.json() as typeof runState.value
  } catch (e) {
    loadError.value = (e as Error).message
  }
}
watch(run, () => { void load() }, { immediate: true })

// ── 状态推导（与 StageShell 同款纯逻辑；merged=steps+gates 合一）──────
const merged = computed(() => (runState.value ? { ...runState.value.steps, ...runState.value.gates } : {}))

/** A 区五步：有键按 run-state 推导；无键=轮次内不跟踪（诚实呈现） */
type CardState = 'done' | 'active' | 'pending' | 'untracked'
function stepState(st: SetupStep): CardState {
  if (st.keys.length === 0) return 'untracked'
  if (!runState.value) return 'pending'
  if (st.keys.some(k => k in merged.value)) return 'done'
  const firstPending = SETUP_STEPS.find(s => s.keys.length > 0 && !s.keys.some(k => k in merged.value))
  return firstPending?.key === st.key ? 'active' : 'pending'
}

/** B 区五阶段（顶栏②-⑥，STAGE_META 第 2-6 项） */
const deliveryStages = computed(() => STAGE_META.filter(s => s.no >= 2))
function stageState(no: number): CardState {
  if (!runState.value) return 'pending'
  const keys = STAGE_META[no - 1].keys
  if (keys.some(k => k in merged.value)) return 'done'
  const firstPending = STAGE_META.find(s => !s.keys.some(k => k in merged.value))
  return firstPending?.no === no ? 'active' : 'pending'
}

/** 当前卡点：第一个未完成阶段（含①搭建整体）；无=全部完成 */
const bottleneck = computed(() => {
  if (!runState.value) return null
  const first = STAGE_META.find(s => !s.keys.some(k => k in merged.value))
  return first ?? null
})
const openItems = computed(() => runState.value?.ledger.open ?? 0)

const runInput = ref('')
function submitRun(): void {
  const r = runInput.value.trim()
  if (!r) return
  void router.replace({ query: { ...route.query, run: r } })
}
function goStep(st: SetupStep): void {
  void router.push(st.target)
}
function goStage(no: number): void {
  void router.push({ name: `ia2.stage${no}` as 'ia2.stage2' })
}
</script>

<template>
  <div class="jrn" data-testid="jrn-page">
    <header class="jrn__head">
      <h1 class="jrn__title" title="A 区五步把组织从零搭起来，B 区五阶段把需求交付到治理">旅程：从 0 到 1，建组织、跑交付、做治理</h1>
      <div class="jrn__runbar">
        <input v-model="runInput" class="jrn__input" data-testid="jrn-run" placeholder="输入运行目录名查看该轮进度（如 20261015-v8-run20）" @keyup.enter="submitRun">
        <button class="jrn__btn" type="button" data-testid="jrn-load" @click="submitRun">查看进度</button>
      </div>
    </header>

    <!-- 当前卡点提示条（有轮次数据时） -->
    <div v-if="runState && bottleneck" class="jrn__bottleneck" data-testid="jrn-bottleneck">
      <span class="jrn__bottleneck-tag">当前卡点</span>
      <span class="jrn__bottleneck-text">第 {{ bottleneck.no }} 阶段·{{ bottleneck.title }}——{{ bottleneck.act }}</span>
      <span v-if="openItems > 0" class="jrn__bottleneck-debt">另有 {{ openItems }} 笔遗留项未清算，启动新运行前须清零</span>
    </div>

    <!-- 无轮引导态（D19 收敛：一句话+双按钮） -->
    <div v-if="!run && !loadError" class="jrn__guide" data-testid="jrn-guide">
      <p class="jrn__guide-title">还没有进行中的运行——从第 1 步「建立组织」开始</p>
      <div class="jrn__guide-btns">
        <button class="jrn__guide-btn" type="button" data-testid="jrn-start" @click="goStep(SETUP_STEPS[0])">去建立组织 →</button>
        <button class="jrn__guide-btn jrn__guide-btn--ghost" type="button" data-testid="jrn-skip" @click="goStage(2)">已搭好，看交付流程 →</button>
      </div>
    </div>
    <p v-if="loadError" class="jrn__error" data-testid="jrn-error">轮次数据不可达：{{ loadError }}</p>

    <!-- A 区：从 0 到 1 搭建（五步） -->
    <section class="jrn__zone" data-testid="jrn-zone-setup">
      <h2 class="jrn__zone-title">A 区｜从 0 到 1 搭建</h2>
      <ol class="jrn__steps">
        <li
          v-for="st in SETUP_STEPS"
          :key="st.key"
          class="jrn__card"
          :class="`jrn__card--${stepState(st)}`"
          :data-testid="`jrn-step-${st.no}`"
          :title="`完成判据：${st.criteria}${st.note ? `（${st.note}）` : ''}`"
          role="button"
          @click="goStep(st)"
        >
          <div class="jrn__card-head">
            <span class="jrn__no">{{ st.no }}</span>
            <span class="jrn__card-title">{{ st.name }}</span>
            <span class="jrn__state" :data-testid="`jrn-step-state-${st.no}`">
              {{ runState ? (stepState(st) === 'done' ? '✓ 完成' : stepState(st) === 'active' ? '● 待完成' : stepState(st) === 'untracked' ? '轮次内不跟踪' : '未开始') : '' }}
            </span>
          </div>
          <p class="jrn__what jrn__what--one">{{ st.purpose }}</p>
          <p class="jrn__go">进入 →</p>
        </li>
      </ol>
    </section>

    <!-- B 区：交付全流程（五阶段，与顶栏②-⑥同构） -->
    <section class="jrn__zone" data-testid="jrn-zone-delivery">
      <h2 class="jrn__zone-title">B 区｜交付全流程</h2>
      <ol class="jrn__stages">
        <li
          v-for="s in deliveryStages"
          :key="s.no"
          class="jrn__card"
          :class="`jrn__card--${stageState(s.no)}`"
          :data-testid="`jrn-stage-${s.no}`"
          :title="s.what"
          role="button"
          @click="goStage(s.no)"
        >
          <div class="jrn__card-head">
            <span class="jrn__no">{{ s.no }}</span>
            <span class="jrn__card-title">{{ s.title }}</span>
            <span class="jrn__state" :data-testid="`jrn-state-${s.no}`">
              {{ runState ? (stageState(s.no) === 'done' ? '✓ 完成' : stageState(s.no) === 'active' ? '● 进行中' : '未开始') : '' }}
            </span>
          </div>
          <p class="jrn__go">进入 →</p>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped lang="scss">
.jrn { display: flex; flex-direction: column; gap: 14px; padding: 16px 24px; height: 100%; overflow: auto; }
.jrn__head { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.jrn__title { margin: 0; font-size: 16px; }
.jrn__runbar { display: flex; gap: 6px; }
.jrn__input {
  border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 10px;
  font-size: 12px; width: 300px; background: transparent; color: inherit;
  font-family: var(--font-mono);
}
.jrn__btn {
  border: 1px solid var(--accent-primary, var(--color-primary)); border-radius: 6px;
  background: transparent; color: var(--accent-primary, var(--color-primary));
  font-size: 12px; padding: 5px 14px; cursor: pointer;
  &:hover { background: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 12%, transparent); }
}
.jrn__bottleneck {
  border: 1px solid var(--ia-stale, #b8860b); border-radius: 8px; padding: 10px 14px;
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  background: color-mix(in srgb, var(--ia-stale, #b8860b) 6%, transparent);
}
.jrn__bottleneck-tag {
  font-size: 11px; font-weight: 700; color: var(--ia-stale, var(--ia-stale));
  border: 1px solid var(--ia-stale, #b8860b); border-radius: 4px; padding: 1px 6px;
}
.jrn__bottleneck-text { font-size: 12px; }
.jrn__bottleneck-debt { margin-left: auto; font-size: 11px; color: var(--text-muted); }
.jrn__guide {
  border: 1px dashed var(--accent-primary, var(--color-primary)); border-radius: 8px;
  padding: 12px 16px; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  background: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 6%, transparent);
}
.jrn__guide-title { margin: 0; font-size: 13px; }
.jrn__guide-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.jrn__guide-btn {
  border: none; background: var(--accent-primary, var(--color-primary)); color: var(--text-on-accent);
  border-radius: 6px; padding: 6px 16px; font-size: 12px; cursor: pointer;
  &--ghost { background: transparent; color: var(--accent-primary, var(--color-primary)); border: 1px solid var(--accent-primary, var(--color-primary)); }
}
.jrn__error { color: var(--ia-fail); font-size: 12px; margin: 0; }
.jrn__zone { display: flex; flex-direction: column; gap: 6px; }
.jrn__zone-title { margin: 0; font-size: 12px; color: var(--text-muted); font-weight: 600; }
.jrn__steps, .jrn__stages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.jrn__card {
  border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 12px;
  cursor: pointer; display: flex; flex-direction: column; gap: 2px;
  &:hover { border-color: var(--accent-primary, var(--color-primary)); }
}
.jrn__card--done { border-left: 3px solid var(--ia-fresh, #2e9e5b); }
.jrn__card--active { border-left: 3px solid var(--ia-stale, #b8860b); background: color-mix(in srgb, var(--ia-stale, #b8860b) 6%, transparent); }
.jrn__card--pending, .jrn__card--untracked { border-left: 3px solid var(--border-color); }
.jrn__card-head { display: flex; align-items: baseline; gap: 8px; }
.jrn__no {
  font-size: 14px; font-weight: 700; color: var(--text-muted); font-variant-numeric: tabular-nums;
  .jrn__card--done & { color: var(--ia-fresh, var(--ia-fresh)); }
  .jrn__card--active & { color: var(--ia-stale, var(--ia-stale)); }
}
.jrn__card-title { font-size: 13px; font-weight: 600; }
.jrn__state { margin-left: auto; font-size: 11px; color: var(--text-muted); }
.jrn__card--done .jrn__state { color: var(--ia-fresh, var(--ia-fresh)); }
.jrn__card--active .jrn__state { color: var(--ia-stale, var(--ia-stale)); font-weight: 600; }
.jrn__what--one {
  margin: 0; font-size: 11.5px; color: var(--text-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.jrn__gated { margin: 0; font-size: 11px; color: var(--ia-stale, var(--ia-stale)); }
.jrn__go { margin: 0; font-size: 11px; color: var(--accent-primary, var(--color-primary)); }
</style>
