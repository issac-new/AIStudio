<!-- overlay/custom/client/ia2/views/journey/JourneyView.vue -->
<!-- 工作总览首页（D18 旅程式重构 → D18' 日常口径定稿，2026-10-27 Task 4）：
     产品默认入口（/app 索引路由），按「从 0 到 1」的使用时序组织两区十卡——
     A 区搭建五步（建立组织→建立账号→建立团队与协调关系→准备环境与资产→
     准备智能体，状态=真实配置信号 daily-setup-signals：org/accounts/agents
     可判，无信号步骤如实「未纳入跟踪」）；B 区交付五阶段（需求→分析设计→
     开发→验收→治理，状态=跨板日常任务分布，与左侧栏②-⑥同构同名的
     STAGE_META）。本页不读推演 run-state——推演进度回全流程推演区看；
     阶段 done=「已流转」（后续阶段已有工作），不画绿✓「已完成」。
     设计正本=docs/superpowers/specs/2026-10-17-journey-ia-terminology-redesign.md §5.1
     + 2026-10-27-product-coherence-refactor「日常阶段语义」决策行。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { STAGE_META, SETUP_STEPS, type SetupStep } from '../../stage-meta'
import { useDailyStageProgress } from '../../composables/useDailyStageProgress'

const router = useRouter()
// 日常口径进度：五步=配置信号；五阶段=跨板任务（单一事实源=useDailyStageProgress）
const progress = useDailyStageProgress()
const tasks = computed(() => progress.tasks.value)
const signals = computed(() => progress.signals.value)

/** A 区五步：org/accounts/agents 按真实信号；teams/env 无日常信号=未跟踪（诚实呈现） */
type CardState = 'done' | 'active' | 'pending' | 'untracked' | 'flowed' | 'blocked'
function stepState(st: SetupStep): Exclude<CardState, 'flowed' | 'blocked'> {
  const s = progress.stepState(st)
  return s === 'current' ? 'active' : s
}
function stepStateText(st: SetupStep): string {
  const s = stepState(st)
  if (s === 'done') return '✓ 完成'
  if (s === 'active') return '● 待完成'
  if (s === 'untracked') return '未纳入跟踪'
  return '未开始'
}

/** B 区五阶段（②-⑥，STAGE_META 第 2-6 项）：done=已流转（工作集中后移） */
const deliveryStages = computed(() => STAGE_META.filter(s => s.no >= 2))
function stageState(no: number): 'flowed' | 'active' | 'pending' | 'blocked' {
  const s = progress.stageState(no as 1 | 2 | 3 | 4 | 5 | 6)
  if (s === 'current') return 'active'
  if (s === 'done') return 'flowed'
  return s
}
function stageStateText(no: number): string {
  const s = stageState(no)
  if (s === 'flowed') return '已流转'
  if (s === 'active') return '● 进行中'
  if (s === 'blocked') return '● 有阻塞'
  return '未开始'
}

/** 引导态分两支（2026-10-27 日常口径）：组织未建=搭建引导；组织已建且无日常
 *  任务=日常空态引导；信号源不可判=null 时不指引（不猜组织状态）。 */
const hasOrg = computed(() => signals.value.org === true || signals.value.accounts === true)
const showSetupGuide = computed(() => signals.value.org === false && signals.value.accounts !== true)
const showDailyGuide = computed(() => hasOrg.value && tasks.value.length === 0)

function goStep(st: SetupStep): void {
  // 来路阶段①：账号/环境等落点页跨阶段复用，顶栏高亮按搭建语境而非路径归属
  const target = st.target
  if (typeof target === 'string') void router.push({ path: target, query: { from: '1' } })
  else void router.push({ ...target, query: { ...(target.query ?? {}), from: '1' } })
}
function goStage(no: number): void {
  void router.push({ name: `ia2.stage${no}` as 'ia2.stage2' })
}
function goWorkbench(): void {
  void router.push({ name: 'ia2.collab' })
}
function goBoard(): void {
  void router.push({ name: 'ia2.board' })
}
</script>

<template>
  <div class="jrn" data-testid="jrn-page">
    <header class="jrn__head">
      <div class="jrn__heading">
        <h1 class="jrn__title" title="准备阶段五步把组织从零搭起来，交付阶段五阶段把需求交付到治理；本页只看日常任务与配置，推演进度在全流程推演区">工作总览：从 0 到 1，建组织、跑交付、做治理</h1>
        <p class="jrn__sub">准备阶段按组织配置的真实信号呈现进度；交付阶段按看板任务分布呈现当前工作集中在哪里——本页不读推演运行。</p>
      </div>
      <div class="jrn__runbar">
        <button class="jrn__btn" type="button" data-testid="jrn-workbench-link" title="会话、任务与 IDE 工作区" @click="router.push({ name: 'ia2.collab' })">进入日常工作台 →</button>
      </div>
    </header>

    <!-- 搭建引导（组织未建；日常措辞，不提运行） -->
    <div v-if="showSetupGuide" class="jrn__guide" data-testid="jrn-guide">
      <p class="jrn__guide-title">组织还没搭起来——从第 1 步「建立组织」开始</p>
      <div class="jrn__guide-btns">
        <button class="jrn__guide-btn" type="button" data-testid="jrn-start" @click="goStep(SETUP_STEPS[0])">去建立组织 →</button>
        <button class="jrn__guide-btn jrn__guide-btn--ghost" type="button" data-testid="jrn-skip" @click="goStage(2)">已搭好，看交付流程 →</button>
      </div>
    </div>
    <!-- 日常空态引导（组织已建、还没有日常任务） -->
    <div v-else-if="showDailyGuide" class="jrn__guide jrn__guide--daily" data-testid="jrn-guide-daily">
      <p class="jrn__guide-title">组织已就绪，还没有日常任务——从工作台或看板开始今天的交付</p>
      <div class="jrn__guide-btns">
        <button class="jrn__guide-btn" type="button" data-testid="jrn-daily-workbench" @click="goWorkbench">进入工作台 →</button>
        <button class="jrn__guide-btn jrn__guide-btn--ghost" type="button" data-testid="jrn-daily-board" @click="goBoard">打开看板 →</button>
      </div>
    </div>

    <!-- A 区：从 0 到 1 搭建（五步，真实信号） -->
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
            <span class="jrn__state" :data-testid="`jrn-step-state-${st.no}`">{{ stepStateText(st) }}</span>
          </div>
          <p class="jrn__what jrn__what--one">{{ st.purpose }}</p>
          <p class="jrn__go">进入 →</p>
        </li>
      </ol>
    </section>

    <!-- B 区：交付全流程（五阶段，与顶栏②-⑥同构；已流转≠已完成） -->
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
            <span class="jrn__state" :data-testid="`jrn-state-${s.no}`">{{ stageStateText(s.no) }}</span>
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
.jrn__guide {
  border: 1px solid color-mix(in srgb, var(--accent-primary, var(--color-primary)) 35%, var(--border-color));
  border-radius: 12px; padding: 16px 20px;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  background: color-mix(in srgb, var(--accent-primary, var(--color-primary)) 7%, transparent);
}
.jrn__guide--daily {
  border-color: color-mix(in srgb, var(--ia-stale) 35%, var(--border-color));
  background: color-mix(in srgb, var(--ia-stale) 6%, transparent);
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
/* 日常口径：done（真信号完成）保留绿沿；已流转/未跟踪/未开始=中性；阻塞=红沿 */
.jrn__card--done { border-left: 3px solid var(--ia-fresh); }
.jrn__card--active { border-left: 3px solid var(--ia-stale); }
.jrn__card--blocked { border-left: 3px solid var(--ia-fail); }
.jrn__card--pending, .jrn__card--untracked, .jrn__card--flowed { border-left: 3px solid var(--border-color); }
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
.jrn__card--blocked .jrn__state { color: var(--ia-fail); background: color-mix(in srgb, var(--ia-fail) 10%, transparent); font-weight: 600; }
.jrn__what {
  margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--text-secondary);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.jrn__go { margin: 2px 0 0; font-size: 12.5px; font-weight: 500; color: var(--accent-primary, var(--color-primary)); }

/* 窄屏：两列卡改单列，避免 375px 下标题与按钮被压成竖排 */
@media (max-width: 720px) {
  .jrn { padding: 16px; gap: 14px; }
  .jrn__title { font-size: 18px; }
  .jrn__steps, .jrn__stages { grid-template-columns: minmax(0, 1fr); }
  .jrn__guide { align-items: flex-start; }
}
</style>
