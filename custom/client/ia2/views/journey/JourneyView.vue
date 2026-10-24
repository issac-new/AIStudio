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
      <div class="jrn__heading">
        <h1 class="jrn__title" title="准备阶段五步把组织从零搭起来，交付阶段五阶段把需求交付到治理">流程总览：从 0 到 1，建组织、跑交付、做治理</h1>
        <p class="jrn__sub">先完成五步搭建，再按需求、设计、开发、验收、治理五阶段交付；每张卡都标明当前进度与完成判据。</p>
      </div>
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
            <span v-if="runState" class="jrn__state" :data-testid="`jrn-step-state-${st.no}`">
              {{ stepState(st) === 'done' ? '✓ 完成' : stepState(st) === 'active' ? '● 待完成' : stepState(st) === 'untracked' ? '未纳入跟踪' : '未开始' }}
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
            <span v-if="runState" class="jrn__state" :data-testid="`jrn-state-${s.no}`">
              {{ stageState(s.no) === 'done' ? '✓ 完成' : stageState(s.no) === 'active' ? '● 进行中' : '未开始' }}
            </span>
          </div>
          <p class="jrn__what">{{ s.act }}</p>
          <p class="jrn__go">进入 →</p>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped lang="scss">
.jrn {
  display: flex; flex-direction: column; gap: 18px;
  width: 100%; max-width: 1200px; margin: 0 auto;
  padding: 22px 28px 36px; height: 100%; overflow: auto;
}
.jrn__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.jrn__heading { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.jrn__title { margin: 0; font-size: 21px; line-height: 1.3; font-weight: 650; letter-spacing: -0.01em; }
.jrn__sub { margin: 0; max-width: 760px; font-size: 13px; line-height: 1.6; color: var(--text-secondary); }
.jrn__runbar { display: flex; gap: 6px; padding-top: 3px; }
.jrn__btn {
  border: 1px solid var(--accent-primary, var(--color-primary)); border-radius: 8px;
  background: transparent; color: var(--accent-primary, var(--color-primary));
  font-family: inherit; font-size: 13px; padding: 7px 16px; cursor: pointer;
  transition: background 0.12s;
  &:hover { background: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 12%, transparent); }
  &:focus-visible { outline: 2px solid var(--accent-primary, var(--color-primary)); outline-offset: 2px; }
}
.jrn__btn--ghost { background: transparent; color: var(--text-secondary); border-color: var(--border-color); }
.jrn__bottleneck {
  border: 1px solid color-mix(in srgb, var(--ia-stale) 45%, var(--border-color));
  border-radius: 10px; padding: 12px 16px;
  display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
  background: color-mix(in srgb, var(--ia-stale) 7%, transparent);
}
.jrn__bottleneck-tag {
  font-size: 11px; font-weight: 700; color: var(--ia-stale);
  border: 1px solid color-mix(in srgb, var(--ia-stale) 50%, var(--border-color));
  border-radius: 999px; padding: 1px 8px;
}
.jrn__bottleneck-text { font-size: 13px; }
.jrn__bottleneck-debt { margin-left: auto; font-size: 12px; color: var(--text-secondary); }
.jrn__guide {
  border: 1px solid color-mix(in srgb, var(--accent-primary, var(--color-primary)) 35%, var(--border-color));
  border-radius: 12px; padding: 16px 20px;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  background: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 7%, transparent);
}
.jrn__guide-title { margin: 0; font-size: 14px; font-weight: 600; }
.jrn__guide-btns { display: flex; gap: 10px; flex-wrap: wrap; }
.jrn__guide-btn {
  border: 1px solid var(--accent-primary, var(--color-primary));
  background: var(--accent-primary, var(--color-primary)); color: var(--text-on-accent);
  border-radius: 8px; padding: 8px 18px; font-family: inherit; font-size: 13px; font-weight: 500; cursor: pointer;
  transition: filter 0.12s;
  &:hover { filter: brightness(1.06); }
  &:focus-visible { outline: 2px solid var(--accent-primary, var(--color-primary)); outline-offset: 2px; }
  &--ghost {
    background: transparent; color: var(--accent-primary, var(--color-primary));
    border: 1px solid color-mix(in srgb, var(--accent-primary, var(--color-primary)) 55%, transparent);
  }
}
.jrn__error { color: var(--ia-fail); font-size: 13px; margin: 0; }
.jrn__zone { display: flex; flex-direction: column; gap: 10px; }
.jrn__zone-title {
  margin: 0; display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--text-secondary); font-weight: 650;
  &::before {
    content: ''; width: 3px; height: 13px; border-radius: 2px;
    background: var(--accent-primary, var(--color-primary));
  }
}
.jrn__steps, .jrn__stages { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.jrn__card {
  border: 1px solid var(--border-color); border-radius: 10px; padding: 14px 16px;
  background: var(--bg-card); cursor: pointer;
  display: flex; flex-direction: column; gap: 6px;
  transition: border-color 0.14s, box-shadow 0.14s, transform 0.14s;
  &:hover {
    border-color: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 45%, var(--border-color));
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06);
    transform: translateY(-1px);
  }
  &:focus-visible { outline: 2px solid var(--accent-primary, var(--color-primary)); outline-offset: 2px; }
}
.jrn__card--done { border-left: 3px solid var(--ia-fresh); }
.jrn__card--active { border-left: 3px solid var(--ia-stale); }
.jrn__card--pending, .jrn__card--untracked { border-left: 3px solid var(--border-color); }
.jrn__card-head { display: flex; align-items: center; gap: 10px; }
.jrn__no {
  width: 26px; height: 26px; flex-shrink: 0; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--bg-secondary); color: var(--text-secondary);
  font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums;
  .jrn__card--done & { color: var(--ia-fresh); background: color-mix(in srgb, var(--ia-fresh) 14%, transparent); }
  .jrn__card--active & { color: var(--ia-stale); background: color-mix(in srgb, var(--ia-stale) 16%, transparent); }
}
.jrn__card-title { font-size: 14px; font-weight: 600; }
.jrn__state {
  margin-left: auto; padding: 2px 8px; border-radius: 999px;
  background: var(--bg-secondary); color: var(--text-muted);
  font-size: 11px; white-space: nowrap;
}
.jrn__card--done .jrn__state { color: var(--ia-fresh); background: color-mix(in srgb, var(--ia-fresh) 12%, transparent); }
.jrn__card--active .jrn__state { color: var(--ia-stale); background: color-mix(in srgb, var(--ia-stale) 12%, transparent); font-weight: 600; }
.jrn__what {
  margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--text-secondary);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.jrn__gated { margin: 0; font-size: 11.5px; color: var(--ia-stale); }
.jrn__go { margin: 2px 0 0; font-size: 12.5px; font-weight: 500; color: var(--accent-primary, var(--color-primary)); }

/* 动线批：卡点遗留项行可点去清偿门 */
.jrn__bottleneck-debt--link { background: none; border: none; padding: 0; font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.jrn__bottleneck-debt--link:hover { filter: brightness(1.1); }

/* 窄屏：两列卡改单列，避免 375px 下标题与按钮被压成竖排 */
@media (max-width: 720px) {
  .jrn { padding: 16px; gap: 14px; }
  .jrn__title { font-size: 18px; }
  .jrn__steps, .jrn__stages { grid-template-columns: minmax(0, 1fr); }
  .jrn__guide { align-items: flex-start; }
}
</style>
