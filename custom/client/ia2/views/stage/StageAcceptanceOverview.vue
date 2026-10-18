<!-- overlay/custom/client/ia2/views/stage/StageAcceptanceOverview.vue
     ⑤验收·验收总览页签（2026-10-18 阶段页页签批）：
     用运行状态回答「G5 过没过、发布做没做、UAT 判没判」，并把下一步指向
     需求追溯/交付健康/UAT 判定/G5 审批四个页签。不放假「一键通过」按钮：
     判定只认结构化字段，写入口在各自任务与文档里。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useStageProgress } from '../../composables/useStageProgress'
import { runDisplayName } from '../../run-display'

const emit = defineEmits<{ (e: 'open-tab', key: string): void }>()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const progress = useStageProgress()

const runName = computed(() => {
  const r = progress.run.value.trim()
  return r ? runDisplayName(r) : ''
})
const state = computed(() => progress.state.value)
const gates = computed(() => [
  { key: 'g5_ready', zh: 'G5 发布准出', en: 'G5 release readiness', ok: 'g5_ready' in progress.merged.value },
  { key: 'release_done', zh: '发布完成', en: 'Release done', ok: 'release_done' in progress.merged.value },
  { key: 'uat_done', zh: 'UAT 完成', en: 'UAT done', ok: 'uat_done' in progress.merged.value },
])

const next = computed(() => [
  { key: 'trace', zh: '需求追溯', en: 'Traceability', desc: zh.value ? '逐条核对验收标准、测试结论与 UAT 判定' : 'Check each AC against test and UAT verdicts' },
  { key: 'delivery', zh: '交付健康', en: 'Delivery health', desc: zh.value ? '分支新鲜度与 14 件交付物是否齐' : 'Branch freshness and 14 deliverables' },
  { key: 'uat', zh: 'UAT 判定', en: 'UAT verdicts', desc: zh.value ? '看哪些条目还没判；缺判定去对应任务补' : 'See unjudged items; complete them in their tasks' },
  { key: 'g5', zh: 'G5 审批', en: 'G5 approvals', desc: zh.value ? '人工批准留痕；没有结构化判定不放行' : 'Human approval with a trail; no verdict, no release' },
])
</script>

<template>
  <section class="sao" data-testid="stg-accept-overview">
    <header class="sao__head">
      <div>
        <h2 class="sao__title">{{ zh ? '本轮验收进度' : 'Acceptance progress' }}</h2>
        <p class="sao__sub">{{ zh
          ? '判定只认结构化字段；任一条不过回缺陷回流。当前运行：'
          : 'Only structured verdicts count; a failed item returns to defects. Current run: ' }}{{ runName || (zh ? '未选择' : 'none') }}</p>
      </div>
    </header>

    <div class="sao__gates">
      <article v-for="g in gates" :key="g.key" class="sao__gate" :class="{ 'sao__gate--ok': g.ok }" :data-testid="`stg-accept-${g.key}`">
        <span class="sao__dot" :class="{ 'sao__dot--ok': g.ok }" aria-hidden="true">{{ g.ok ? '✓' : '○' }}</span>
        <span class="sao__label">{{ zh ? g.zh : g.en }}</span>
        <span class="sao__state">{{ g.ok ? (zh ? '已完成' : 'Done') : (state ? (zh ? '未完成' : 'Pending') : (zh ? '无运行数据' : 'No run data')) }}</span>
      </article>
    </div>

    <div class="sao__next">
      <h3 class="sao__h">{{ zh ? '去哪一步' : 'Where to go' }}</h3>
      <div class="sao__grid">
        <button
          v-for="n in next"
          :key="n.key"
          type="button"
          class="sao__card"
          :data-testid="`stg-accept-go-${n.key}`"
          @click="emit('open-tab', n.key)"
        >
          <strong>{{ zh ? n.zh : n.en }}</strong>
          <span>{{ n.desc }}</span>
          <em>{{ zh ? '打开页签 →' : 'Open tab →' }}</em>
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sao { display: flex; flex-direction: column; gap: 14px; }
.sao__title { margin: 0; font-size: 15px; }
.sao__sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); line-height: 1.6; }
.sao__gates { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; }
.sao__gate { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; }
.sao__gate--ok { border-left: 3px solid var(--ia-fresh); }
.sao__dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--border-color); display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.sao__dot--ok { color: var(--ia-fresh); border-color: color-mix(in srgb, var(--ia-fresh) 45%, var(--border-color)); }
.sao__label { font-size: 12.5px; font-weight: 600; }
.sao__state { margin-left: auto; font-size: 11px; color: var(--text-muted); }
.sao__gate--ok .sao__state { color: var(--ia-fresh); }
.sao__h { margin: 0 0 6px; font-size: 13px; }
.sao__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
.sao__card { text-align: left; border: 1px solid var(--border-color); border-radius: 8px; background: transparent; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; cursor: pointer; font-family: inherit; color: inherit; }
.sao__card:hover { border-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 5%, transparent); }
.sao__card:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 2px; }
.sao__card strong { font-size: 12.5px; }
.sao__card span { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; }
.sao__card em { font-style: normal; font-size: 11px; color: var(--accent-primary); }
</style>
