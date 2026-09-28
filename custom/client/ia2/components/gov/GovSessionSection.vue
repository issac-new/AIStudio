<!-- overlay/custom/client/ia2/components/gov/GovSessionSection.vue -->
<!-- v12 管理台 · 会话区：房间∪agent 会话表（成员/挂任务/最近活动；30 天无活动
     =归档候选只读标记）+ 行上操作（进入=工作台选中）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useFlowStore } from '../../store/flow'
import { useWorkspaceStore } from '../../store/workspace'
import { linkedTaskIdsOfSession } from '../../adapters/flow'

interface SessionRow {
  kind: 'room' | 'chat'
  id: string
  name: string
  members: number
  lastActivityAt: number | null
}

const props = defineProps<{ sessions: SessionRow[] }>()

const { t } = useI18n()
const router = useRouter()
const flow = useFlowStore()
const workspace = useWorkspaceStore()

const ARCHIVE_MS = 30 * 24 * 3600 * 1000

const rows = computed(() => props.sessions.map(s => {
  const taskCount = linkedTaskIdsOfSession(s, workspace.tasks).length
  const stale = s.lastActivityAt != null && Date.now() - s.lastActivityAt > ARCHIVE_MS
  return { ...s, taskCount, stale }
}))

function enter(row: { kind: 'room' | 'chat'; id: string }): void {
  flow.closeGov()
  if (row.kind === 'room') void router.push({ name: 'ia2.commsRoom', params: { roomId: row.id } })
  else void router.push({ name: 'ia2.collabSession', params: { sessionId: row.id } })
}

function detail(row: { kind: string; id: string }): void {
  flow.govSelectedId = `session:${row.id}`
}

function fmtActivity(ts: number | null): string {
  if (ts == null) return '—'
  const d = new Date(ts)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="gss" data-testid="gov-session-section">
    <div class="gss__head">
      <span class="gss__title">{{ t('ia2.gov.session.title') }}</span>
      <span class="gss__sub">{{ t('ia2.gov.session.sub') }}</span>
    </div>
    <div class="gss__table" data-testid="gov-session-rows">
      <div class="gss__row gss__row--head">
        <span class="gss__c1">{{ t('ia2.gov.session.colSession') }}</span>
        <span class="gss__c2">{{ t('ia2.gov.session.colMembers') }}</span>
        <span class="gss__c3">{{ t('ia2.gov.session.colTasks') }}</span>
        <span class="gss__c4">{{ t('ia2.gov.task.colOps') }}</span>
      </div>
      <div v-if="!rows.length" class="gss__empty">{{ t('ia2.gov.session.empty') }}</div>
      <div
        v-for="r in rows" :key="`${r.kind}:${r.id}`"
        class="gss__row" :data-testid="`gov-session-${r.id}`"
        :class="{ 'gss__row--sel': flow.govSelectedId === `session:${r.id}` }"
        @click="detail(r)"
      >
        <span class="gss__c1">
          <span class="gss__name">{{ r.kind === 'room' ? '💬' : '🤖' }} {{ r.name }}</span>
          <span v-if="r.stale" class="gss__stale" :title="t('ia2.gov.session.staleTitle')">
            {{ t('ia2.gov.session.stale') }}
          </span>
        </span>
        <span class="gss__c2">{{ r.members }}</span>
        <span class="gss__c3">📋{{ r.taskCount }}</span>
        <span class="gss__c4 gss__ops" @click.stop>
          <span class="gss__act">{{ fmtActivity(r.lastActivityAt) }}</span>
          <button type="button" class="gss__op" :data-testid="`gov-enter-${r.id}`" @click="enter(r)">{{ t('ia2.gov.enter') }}</button>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.gss { display: flex; flex-direction: column; height: 100%; min-height: 0; font-size: 12px; }
.gss__head {
  display: flex; align-items: baseline; gap: 8px; padding: 10px 12px 8px;
  border-bottom: 1px solid var(--border-color); flex-shrink: 0;
}
.gss__title { font-weight: 700; color: var(--text-primary); }
.gss__sub { font-size: 10px; color: var(--text-muted); }
.gss__table { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 12px 12px; }
.gss__row {
  display: grid; grid-template-columns: minmax(0,1fr) 60px 70px 170px; gap: 6px;
  align-items: center; padding: 6px 6px; border-radius: 6px; cursor: pointer;
  &:hover { background: var(--bg-secondary); }
}
.gss__row--head {
  cursor: default; color: var(--text-muted); font-size: 10px; text-transform: uppercase;
  &:hover { background: transparent; }
  position: sticky; top: 0; background: var(--bg-primary);
}
.gss__row--sel { background: var(--bg-secondary); }
.gss__c1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
.gss__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gss__stale {
  flex-shrink: 0; padding: 0 6px; height: 16px; border-radius: 8px;
  background: var(--bg-secondary); color: var(--text-muted);
  font-size: 9px; display: inline-flex; align-items: center; white-space: nowrap;
}
.gss__c2, .gss__c3 { color: var(--text-secondary); font-size: 11px; }
.gss__ops { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
.gss__act { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; }
.gss__op {
  height: 20px; padding: 0 8px; border: 1px solid var(--border-color); border-radius: 10px;
  background: transparent; color: var(--text-secondary); font-size: 10px; cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.gss__empty { padding: 16px; color: var(--text-muted); text-align: center; font-size: 11px; }
</style>
