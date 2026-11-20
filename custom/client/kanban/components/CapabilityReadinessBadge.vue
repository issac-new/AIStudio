<!-- overlay/custom/client/kanban/components/CapabilityReadinessBadge.vue -->
<!-- 任务抽屉能力准入：按任务 skills 声明查候选/缺口；只读建议，不自动改派。
     无 skills 不渲染；源缺席显示错误文本，不伪造通过。 -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  fetchCapabilityCandidates, type CapabilityReadinessDto,
} from '@/custom/governance/api/capability-pool'

const props = defineProps<{
  taskId: string | null
  skills: string[] | null | undefined
  assignee: string | null | undefined
}>()

const readiness = ref<CapabilityReadinessDto | null>(null)
const loading = ref(false)
const errorMsg = ref('')
let seq = 0

async function load(): Promise<void> {
  const my = ++seq
  if (!props.skills?.length) {
    readiness.value = null
    errorMsg.value = ''
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    const res = await fetchCapabilityCandidates(props.skills, props.assignee ?? null)
    if (my !== seq) return
    if (!res.ok) throw new Error((res as { error?: string }).error ?? '能力查询失败')
    readiness.value = res.readiness
  } catch (e) {
    if (my !== seq) return
    readiness.value = null
    errorMsg.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (my === seq) loading.value = false
  }
}

watch(
  // 用字符串作 watch 源：数组源每次求值都是新引用，会在 loading 等无关更新时重复触发。
  () => `${props.taskId ?? ''}|${(props.skills ?? []).join(',')}|${props.assignee ?? ''}`,
  () => {
    load().catch((e) => {
      errorMsg.value = e instanceof Error ? e.message : String(e)
    })
  },
  { immediate: true },
)

const DECISION_LABEL: Record<string, string> = { pass: '通过', warn: '警告', block: '缺供给', unknown: '无法判定' }
</script>

<template>
  <div v-if="skills?.length" class="cr" data-testid="capability-readiness-badge">
    <div class="cr__head">
      <span class="cr__title">能力准入</span>
      <span v-if="readiness" class="cr__decision" :class="`is-${readiness.decision}`">
        {{ DECISION_LABEL[readiness.decision] ?? readiness.decision }}
      </span>
      <span v-else-if="loading" class="cr__muted">检查中…</span>
    </div>
    <div v-if="errorMsg" class="cr__err">{{ errorMsg }}</div>
    <template v-else-if="readiness">
      <div v-for="reason in readiness.reasons" :key="reason" class="cr__reason">{{ reason }}</div>
      <div v-if="readiness.candidates.length > 0" class="cr__candidates">
        <span class="cr__muted">候选：</span>
        <span v-for="candidate in readiness.candidates.slice(0, 3)" :key="candidate.agentId" class="cr__candidate">
          {{ candidate.agentId }}
          <span class="cr__muted">可靠度 {{ candidate.reliability ?? '未知' }} · 在途 {{ candidate.load }}</span>
        </span>
      </div>
      <div v-else class="cr__muted">无覆盖候选——不等于无人可用，需补能力声明</div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.cr { display: flex; flex-direction: column; gap: 3px; margin: 4px 0 6px; padding: 6px 8px; border: 1px dashed var(--border); border-radius: 6px; }
.cr__head { display: flex; align-items: center; gap: 8px; }
.cr__title { font-size: 11.5px; font-weight: 600; }
.cr__decision { font-size: 11px; border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
.cr__decision.is-pass { color: var(--success, #18a058); }
.cr__decision.is-warn { color: var(--warning, #d08a00); }
.cr__decision.is-block { color: var(--danger, #d03050); }
.cr__decision.is-unknown { color: var(--text-muted, #888); border-style: dashed; }
.cr__reason { font-size: 11px; color: var(--text-muted); line-height: 1.35; }
.cr__candidates { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 11px; }
.cr__candidate { display: inline-flex; gap: 4px; align-items: baseline; }
.cr__muted { font-size: 11px; color: var(--text-muted); }
.cr__err { font-size: 11px; color: var(--danger, #d03050); }
</style>
