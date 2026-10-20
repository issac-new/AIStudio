<!-- ⑤验收·验收总览（日常源）：看板任务与审批回答当前还缺什么；
     推演只作为显式参照链接，不驱动日常进度。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useWorkspaceStore } from '../../store/workspace'

const emit = defineEmits<{ (e: 'open-tab', key: string): void }>()
const i18nCtx = useI18n() as { locale?: { value?: string } }
const router = useRouter()
const zh = computed(() => String(i18nCtx?.locale?.value ?? 'zh').startsWith('zh'))
const workspace = useWorkspaceStore()

const counts = computed(() => {
  const tasks = workspace.tasks ?? []
  return {
    review: tasks.filter(t => t.status === 'review').length,
    done: tasks.filter(t => t.status === 'done').length,
    blocked: tasks.filter(t => t.status === 'blocked').length,
  }
})

const gates = computed(() => [
  { key: 'trace', zh: '需求追溯', en: 'Traceability', count: counts.value.review + counts.value.done, desc: zh.value ? '看任务、结果与人工判定是否闭环' : 'Check task, result, and human decisions' },
  { key: 'delivery', zh: '交付健康', en: 'Delivery health', count: counts.value.done, desc: zh.value ? '分支、工作区与结果是否齐' : 'Branch, workspace, and result completeness' },
  { key: 'uat', zh: 'UAT 待判', en: 'UAT waiting', count: counts.value.review, desc: zh.value ? '待人验收的任务数量' : 'Tasks waiting for human acceptance' },
  { key: 'g5', zh: 'G5 审批', en: 'G5 approvals', count: counts.value.blocked, desc: zh.value ? '受阻任务需先清掉再放行' : 'Blocked tasks must be cleared first' },
])

function openSimulation(): void {
  void router.push({ name: 'ia2.sim' })
}
</script>

<template>
  <section class="sao" data-testid="stg-accept-overview">
    <header class="sao__head">
      <div>
        <h2 class="sao__title">{{ zh ? '日常验收进度' : 'Acceptance progress' }}</h2>
        <p class="sao__sub">{{ zh ? '数据来自看板任务与审批；无推演运行时也可继续验收。' : 'Data comes from board tasks and approvals; no simulation run required.' }}</p>
      </div>
      <button type="button" class="sao__sim" data-testid="sao-open-simulation" @click="openSimulation">
        {{ zh ? '查看推演参照 →' : 'Simulation reference →' }}
      </button>
    </header>

    <div class="sao__gates">
      <article v-for="g in gates" :key="g.key" class="sao__gate" :data-testid="`stg-accept-${g.key}`">
        <span class="sao__label">{{ zh ? g.zh : g.en }}</span>
        <strong class="sao__count">{{ g.count }}</strong>
        <span class="sao__state">{{ g.desc }}</span>
        <button type="button" class="sao__go" :data-testid="`stg-accept-go-${g.key}`" @click="emit('open-tab', g.key)">{{ zh ? '打开' : 'Open' }}</button>
      </article>
    </div>
  </section>
</template>

<style scoped>
.sao { display: flex; flex-direction: column; gap: 14px; }
.sao__head { display: flex; align-items: flex-start; gap: 12px; }
.sao__title { margin: 0; font-size: 15px; }
.sao__sub { margin: 4px 0 0; font-size: 12px; color: var(--text-muted); line-height: 1.6; }
.sao__sim { margin-left: auto; border: 1px solid var(--border-color); border-radius: 6px; background: transparent; color: var(--accent-info); font: inherit; font-size: 12px; padding: 5px 11px; cursor: pointer; white-space: nowrap; }
.sao__gates { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; }
.sao__gate { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; }
.sao__label { font-size: 12px; font-weight: 600; }
.sao__count { font-size: 20px; color: var(--accent-primary); font-variant-numeric: tabular-nums; }
.sao__state { grid-column: 1 / -1; font-size: 11px; color: var(--text-muted); }
.sao__go { grid-column: 1 / -1; border: none; background: transparent; color: var(--accent-primary); font: inherit; font-size: 11.5px; text-align: left; padding: 0; cursor: pointer; }
.sao__go:hover { text-decoration: underline; text-underline-offset: 3px; }
</style>
