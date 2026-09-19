<!-- overlay/custom/client/ide/components/IdeDimsBar.vue -->
<!-- v12 IDE 工作空间维度条（2026-09-19 统一视图）：任务/项目/会话/链路四维度
     绑定同一编码环境 + ⇄ 沟通协作（动线⑤编码的双向互链）。
     副作用：任务→侧栏任务视图；项目→侧栏文件树；会话→会话消息页签；
     链路→RunTrace 全局时间线。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useIdeStore, type IdeDimension } from '../store/ide'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'

const { t } = useI18n()
const router = useRouter()
const ide = useIdeStore()
const cockpit = useCockpitStore()

const DIMS: IdeDimension[] = ['task', 'project', 'session', 'chain']

const dimLabel = computed(() => ({
  task: ide.activeTaskId ? `${t('ide.dims.task')} · #${ide.activeTaskId.slice(0, 8)}` : t('ide.dims.task'),
  project: ide.workspace ? `${t('ide.dims.project')} · ${ide.workspace.split('/').pop() ?? ide.workspace}` : t('ide.dims.project'),
  session: t('ide.dims.session'),
  chain: t('ide.dims.chain'),
}) as Record<IdeDimension, string>)

function pick(dim: IdeDimension): void {
  ide.setDimension(dim)
  if (dim === 'task') {
    ide.setSidebarView('tasks')
    ide.setChatTab('messages')
  } else if (dim === 'project') {
    ide.setSidebarView('files')
  } else if (dim === 'session') {
    ide.setChatTab('messages')
  } else {
    cockpit.openRunTraceGlobal()
  }
}

function gotoCollab(): void {
  void router.push({ name: 'ia2.collab' })
}
</script>

<template>
  <div class="ide-dims" data-testid="ide-dims">
    <span class="ide-dims__label">{{ t('ide.dims.workspace') }}</span>
    <button
      v-for="d in DIMS" :key="d"
      type="button" class="ide-dims__chip"
      :class="{ 'ide-dims__chip--on': ide.dimension === d }"
      :data-testid="`ide-dim-${d}`"
      @click="pick(d)"
    >{{ dimLabel[d] }}</button>
    <span class="ide-dims__spacer" />
    <button type="button" class="ide-dims__collab" data-testid="ide-dims-collab" @click="gotoCollab">
      ⇄ {{ t('ide.dims.switchCollab') }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.ide-dims {
  display: flex; align-items: center; gap: 4px; flex-shrink: 0;
  height: 32px; padding: 0 12px; border-bottom: 1px solid var(--border-color);
  background: var(--bg-card); font-size: 11px; overflow-x: auto; scrollbar-width: thin;
}
.ide-dims__label { color: var(--text-muted); font-weight: 700; margin-right: 4px; white-space: nowrap; }
.ide-dims__chip {
  height: 22px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
  white-space: nowrap; font-family: inherit;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.ide-dims__chip--on { border-color: var(--primary); color: var(--primary); font-weight: 600; }
.ide-dims__spacer { flex: 1; min-width: 8px; }
.ide-dims__collab {
  height: 22px; padding: 0 10px; border: 1px solid var(--border-color); border-radius: 11px;
  background: transparent; color: var(--text-secondary); font-size: 11px; cursor: pointer;
  white-space: nowrap;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
</style>
