<!-- overlay/custom/client/ia2/views/journey/JourneyView.vue -->
<!-- 旅程首页（D12 时序重构 → D18 旅程式重构定稿，2026-10-17 用户裁定）：
     产品默认入口（/app 索引路由），按「从 0 到 1」的使用时序组织两区十卡——
     A 区搭建五步（建立组织→建立账号→建立团队与协调关系→准备环境与资产→
     准备智能体，单一事实源=stage-meta.ts 的 SETUP_STEPS）；B 区交付五阶段
     （需求→分析设计→开发→验收→治理，与左侧栏②-⑥同构同名的 STAGE_META）。
     每卡=状态（run-state 键推导）+一句话+进入入口；无轮次=引导态（从 A 区
     第 1 步开始）；有轮次=当前卡点提示条（第一道未过阶段+遗留项清算提示）。
     设计正本=docs/superpowers/specs/2026-10-17-journey-ia-terminology-redesign.md §5.1。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { STAGE_META, SETUP_STEPS, type SetupStep } from '../../stage-meta'
import { useStageProgress } from '../../composables/useStageProgress'

const router = useRouter()
// 进度来自最近一次推演运行（只读状态，不在日常首页放运行选择器/卡点条）
const progress = useStageProgress()
const run = progress.run
const runState = computed(() => progress.state.value)
const loadError = computed(() => progress.error.value)

/** A 区五步：有键按 run-state 推导；无键=轮次内不跟踪（诚实呈现） */
type CardState = 'done' | 'active' | 'pending' | 'untracked'
function stepState(st: SetupStep): CardState {
  const s = progress.stepState(st)
  return s === 'current' ? 'active' : s
}

/** B 区五阶段（②-⑥，STAGE_META 第 2-6 项） */
const deliveryStages = computed(() => STAGE_META.filter(s => s.no >= 2))
function stageState(no: number): CardState {
  const s = progress.stageState(no as 1 | 2 | 3 | 4 | 5 | 6)
  return s === 'current' ? 'active' : s
}

/** 当前卡点（仅展示最近一次推演的进度，不在日常首页提供运行切换） */
const bottleneck = computed(() => {
  if (!progress.state.value) return null
  return STAGE_META.find(s => progress.stageState(s.no) !== 'done') ?? null
})

function goStep(st: SetupStep): void {
  // 来路阶段①：账号/环境等落点页跨阶段复用，顶栏高亮按搭建语境而非路径归属
  const target = st.target
  if (typeof target === 'string') void router.push({ path: target, query: { from: '1' } })
  else void router.push({ ...target, query: { ...(target.query ?? {}), from: '1' } })
}
function goStage(no: number): void {
  void router.push({ name: `ia2.stage${no}` as 'ia2.stage2' })
}
</script>

<template>
  <div class="jrn" data-testid="jrn-page">
    <header class="jrn__head">
      <h1 class="jrn__title" title="准备阶段五步把组织从零搭起来，交付阶段五阶段把需求交付到治理">流程总览：从 0 到 1，建组织、跑交付、做治理</h1>
      <div class="jrn__runbar">
        <button class="jrn__btn" type="button" data-testid="jrn-workbench-link" title="会话、任务与 IDE 工作区" @click="router.push({ name: 'ia2.collab' })">进入日常工作台 →</button>
      </div>
    </header>

    <!-- 最近一次推演的进度提示（只读；运行切换与卡点处置在全流程推演模式） -->
    <div v-if="runState && bottleneck" class="jrn__bottleneck" data-testid="jrn-bottleneck">
      <span class="jrn__bottleneck-tag">最近推演</span>
      <span class="jrn__bottleneck-text">第 {{ bottleneck.no }} 阶段·{{ bottleneck.title }}——{{ bottleneck.act }}</span>
      <button type="button" class="jrn__bottleneck-debt jrn__bottleneck-debt--link" data-testid="jrn-bottleneck-sim" title="在全流程推演中查看本轮运行" @click="router.push({ name: 'ia2.sim' })">在推演中查看 →</button>
    </div>

    <!-- 无轮引导态（D19 收敛：一句话+双按钮） -->
    <div v-if="!run && !loadError" class="jrn__guide" data-testid="jrn-guide">
      <p class="jrn__guide-title">还没有进行中的运行——从第 1 步「建立组织」开始</p>
      <div class="jrn__guide-btns">
        <button class="jrn__guide-btn" type="button" data-testid="jrn-start" @click="goStep(SETUP_STEPS[0])">去建立组织 →</button>
        <button class="jrn__guide-btn jrn__guide-btn--ghost" type="button" data-testid="jrn-skip" @click="goStage(2)">已搭好，看交付流程 →</button>
      </div>
    </div>
    <p v-if="loadError" class="jrn__error" data-testid="jrn-error">{{ loadError === '记录已不存在（可能已被清理）——请在页头选择其他运行' ? loadError : `运行数据暂时不可用：${loadError}` }}</p>

    <!-- A 区：从 0 到 1 搭建（五步） -->
    <section class="jrn__zone" data-testid="jrn-zone-setup">
      <h2 class="jrn__zone-title">准备阶段｜从 0 到 1 搭建</h2>
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
              {{ runState ? (stepState(st) === 'done' ? '✓ 完成' : stepState(st) === 'active' ? '● 待完成' : stepState(st) === 'untracked' ? '未纳入跟踪' : '未开始') : '' }}
            </span>
          </div>
          <p class="jrn__what jrn__what--one">{{ st.purpose }}</p>
          <p class="jrn__go">进入 →</p>
        </li>
      </ol>
    </section>

    <!-- B 区：交付全流程（五阶段，与顶栏②-⑥同构） -->
    <section class="jrn__zone" data-testid="jrn-zone-delivery">
      <h2 class="jrn__zone-title">交付阶段｜需求到治理</h2>
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
.jrn__btn--ghost { background: transparent; color: var(--text-secondary); }
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

/* 动线批：卡点遗留项行可点去清偿门 */
.jrn__bottleneck-debt--link { background: none; border: none; padding: 0; font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.jrn__bottleneck-debt--link:hover { filter: brightness(1.1); }

/* 窄屏：两列卡改单列，避免 375px 下标题与按钮被压成竖排 */
@media (max-width: 720px) {
  .jrn__steps, .jrn__stages { grid-template-columns: minmax(0, 1fr); }
  .jrn__guide { align-items: flex-start; }
  .jrn__what--one { white-space: normal; overflow: visible; text-overflow: clip; }
}
</style>
