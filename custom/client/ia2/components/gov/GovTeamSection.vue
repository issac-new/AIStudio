<!-- overlay/custom/client/ia2/components/gov/GovTeamSection.vue -->
<!-- v12 管理台 · 团队与通道区：团队卡（cockpit TeamRecord 编制）+ 通道卡
     （platforms store：api_server/matrix/email 实时状态）。 -->
<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { usePlatformsStore } from '../../store/platforms'
import { useFlowStore } from '../../store/flow'

const { t } = useI18n()
const cockpit = useCockpitStore()
const platforms = usePlatformsStore()
const flow = useFlowStore()

const teams = computed(() => cockpit.teams ?? [])

const channels = computed(() => [
  { name: 'api_server', icon: '⌁' },
  { name: 'matrix', icon: '◉' },
  { name: 'email', icon: '✉' },
].map(c => ({ ...c, state: platforms.channelStateOf(c.name) })))

function detail(teamId: string): void {
  flow.govSelectedId = `team:${teamId}`
}

onMounted(() => platforms.retain())
onUnmounted(() => platforms.release())
</script>

<template>
  <div class="gte" data-testid="gov-team-section">
    <div class="gte__head">
      <span class="gte__title">{{ t('ia2.gov.team.title') }}</span>
      <span class="gte__sub">{{ t('ia2.gov.team.sub') }}</span>
    </div>
    <div class="gte__body">
      <div class="gte__card">
        <div class="gte__card-head">{{ t('ia2.gov.team.teams') }}</div>
        <div v-if="!teams.length" class="gte__empty">{{ t('ia2.gov.team.teamsEmpty') }}</div>
        <div
          v-for="tm in teams" :key="tm.id" class="gte__row"
          :data-testid="`gov-team-${tm.id}`" @click="detail(tm.id)"
        >
          <span class="gte__name">{{ tm.name }}</span>
          <span class="gte__meta">{{ tm.profiles.length }} {{ t('ia2.gov.people.profiles') }} · {{ tm.boards?.length ?? 0 }} {{ t('ia2.gov.team.boards') }}</span>
        </div>
      </div>
      <div class="gte__card">
        <div class="gte__card-head">{{ t('ia2.gov.team.channels') }}</div>
        <div class="gte__ch" v-for="c in channels" :key="c.name" :data-testid="`gov-channel-${c.name}`">
          <span class="gte__ch-name">{{ c.icon }} {{ c.name }}</span>
          <span class="gte__ch-state" :class="c.state === 'connected' ? 'gte__ch-state--ok' : 'gte__ch-state--err'">
            {{ c.state === 'connected' ? '✓' : t('ia2.gov.team.offline') }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gte { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; }
.gte__head { display: flex; align-items: baseline; gap: 8px; padding: 10px 12px 8px; border-bottom: 1px solid var(--border-color); }
.gte__title { font-weight: 700; }
.gte__sub { font-size: 10px; color: var(--text-muted); }
.gte__body { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.gte__card { border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); padding: 8px 10px; }
.gte__card-head { font-size: 10px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 4px; }
.gte__row { padding: 5px 4px; border-radius: 6px; cursor: pointer; &:hover { background: var(--bg-secondary); } }
.gte__name { font-size: 12px; color: var(--text-primary); }
.gte__meta { margin-left: 8px; font-size: 10px; color: var(--text-muted); }
.gte__ch { display: flex; align-items: center; justify-content: space-between; padding: 5px 4px; }
.gte__ch-name { color: var(--text-secondary); }
.gte__ch-state { font-size: 11px; font-weight: 700; }
.gte__ch-state--ok { color: var(--success); }
.gte__ch-state--err { color: var(--error); }
.gte__empty { padding: 8px 4px; color: var(--text-muted); font-size: 11px; }
</style>
