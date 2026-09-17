<!-- overlay/custom/client/matrix-teams/components/DispatchList.vue -->
<!-- 外派任务：leader 表单（标题/描述/目标账号/profile 可选）+ assign∪receipt 聚合列表。
     轮询回执 30s 一轮（pollAndReport），组件卸载时清定时器。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskDispatchStore } from '../stores/task-dispatch'
import { useTeamRegistryStore } from '../stores/team-registry'

const { t } = useI18n()
const dispatch = useTaskDispatchStore()
const registry = useTeamRegistryStore()

const title = ref('')
const body = ref('')
const targetAccount = ref('')
const targetProfile = ref('')
const accounts = computed(() => registry.accounts.map(a => ({ userId: a.userId, label: a.displayName, profiles: a.agentTeams.flatMap(tm => tm.profiles) })))
const profileOptions = computed(() => accounts.value.find(a => a.userId === targetAccount.value)?.profiles ?? [])

async function send(): Promise<void> {
  if (!title.value.trim() || !targetAccount.value) return
  if (await dispatch.sendAssignment({
    title: title.value.trim(),
    body: body.value.trim() || undefined,
    target: { account: targetAccount.value, profile: targetProfile.value || undefined },
  })) { title.value = ''; body.value = ''; targetProfile.value = '' }
}

let timer: ReturnType<typeof setInterval> | null = null
// 监听挂载在 task-dispatch store setup 顶层（pinia effect scope，终审修复）——
// 组件不再调 ensureListening；这里只挂组件级轮询定时器，卸载即清。
onMounted(() => {
  timer = setInterval(() => { void dispatch.pollAndReport() }, 30_000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="dl" data-testid="dispatch-list">
    <div class="dl__sec">{{ t('teams.dispatch.title') }}</div>

    <form v-if="registry.isLeader" class="dl__form" @submit.prevent="send">
      <input v-model="title" class="dl__input dl__input--wide" data-testid="dispatch-title-input"
        :placeholder="t('teams.dispatch.titleField')" />
      <input v-model="body" class="dl__input dl__input--wide" data-testid="dispatch-body-input"
        :placeholder="t('teams.dispatch.body')" />
      <select v-model="targetAccount" class="dl__select" data-testid="dispatch-target-select"
        :aria-label="t('teams.dispatch.target')">
        <option value="">{{ t('teams.dispatch.target') }}</option>
        <option v-for="a in accounts" :key="a.userId" :value="a.userId">{{ a.label }}（{{ a.userId }}）</option>
      </select>
      <select v-model="targetProfile" class="dl__select" data-testid="dispatch-profile-select"
        :aria-label="t('teams.dispatch.profile')" :disabled="!targetAccount">
        <option value="">{{ t('teams.dispatch.profile') }}</option>
        <option v-for="p in profileOptions" :key="p" :value="p">{{ p }}</option>
      </select>
      <button type="button" class="dl__primary" data-testid="dispatch-send" @click="send">
        {{ t('teams.dispatch.send') }}</button>
    </form>

    <div v-if="dispatch.dispatches.length === 0" class="dl__empty" data-testid="dispatch-empty">
      {{ t('teams.dispatch.empty') }}</div>
    <div v-for="d in dispatch.dispatches" :key="d.assign.taskId"
      class="dl__row" :data-testid="`dispatch-item-${d.assign.taskId.slice(0, 6)}`">
      <span class="dl__task-title">{{ d.assign.title }}</span>
      <span class="dl__target">{{ d.assign.target.account }}</span>
      <span class="dl__issuer">{{ t('teams.dispatch.issuedBy') }}: {{ d.assign.issuedBy }}</span>
      <span class="dl__status" :class="`dl__status--${d.receipt?.status ?? 'pending'}`"
        data-testid="dispatch-status">{{ t(`teams.dispatch.status.${d.receipt?.status ?? 'pending'}`) }}</span>
    </div>
  </div>
</template>

<style scoped>
.dl { display: flex; flex-direction: column; gap: 8px; }
.dl__sec { font-size: 12px; font-weight: 600; }
.dl__form { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.dl__input, .dl__select { border: 1px solid var(--border-color); border-radius: var(--radius-standard); padding: 3px 8px; font-family: inherit; background: var(--bg-primary); color: var(--text-primary); }
.dl__input--wide { grid-column: 1 / -1; }
.dl__primary { border: 1px solid var(--color-primary, #3b82f6); background: var(--color-primary, #3b82f6); color: var(--bg-primary); border-radius: var(--radius-standard); padding: 3px 12px; cursor: pointer; font-family: inherit; }
.dl__empty { font-size: 12px; color: var(--text-secondary); }
.dl__row { display: flex; align-items: center; gap: 8px; font-size: 12px; flex-wrap: wrap; }
.dl__task-title { font-weight: 600; }
.dl__target { color: var(--color-primary, #3b82f6); }
.dl__issuer { color: var(--text-secondary); font-size: 11px; }
.dl__status { font-size: 11px; border-radius: 999px; border: 1px solid var(--border-color); padding: 0 8px; }
.dl__status--done { border-color: var(--color-success, #22c55e); color: var(--color-success, #22c55e); }
.dl__status--failed { border-color: var(--color-danger, #e11d48); color: var(--color-danger, #e11d48); }
.dl__status--running { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
</style>
