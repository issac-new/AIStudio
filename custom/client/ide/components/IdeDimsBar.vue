<!-- overlay/custom/client/ide/components/IdeDimsBar.vue -->
<!-- v12 IDE 工作空间维度条（2026-09-19 统一视图，09-20 重构三维化）：
     任务/项目/会话三维度绑定同一编码环境。
     副作用：任务→侧栏任务视图；项目→右侧辅助面板「查看文件」页签
     （基于任务会话与项目的视图，09-20 裁定右移）；会话→中栏消息面。
     链路维度已退役（RunTrace 入口 = 会话头部迹线按钮 + 命令面板）。 -->
<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useIdeStore, type IdeDimension } from '../store/ide'

const { t } = useI18n()
const router = useRouter()
const ide = useIdeStore()

const DIMS: IdeDimension[] = ['task', 'project', 'session']

const dimLabel = computed(() => ({
  task: ide.activeTaskId ? `${t('ide.dims.task')} · #${ide.activeTaskId.slice(0, 8)}` : t('ide.dims.task'),
  project: ide.workspace ? `${t('ide.dims.project')} · ${ide.workspace.split('/').pop() ?? ide.workspace}` : t('ide.dims.project'),
  session: t('ide.dims.session'),
}) as Record<IdeDimension, string>)

function pick(dim: IdeDimension): void {
  ide.setDimension(dim)
  if (dim === 'task') {
    ide.setChatFocus()
  } else if (dim === 'project') {
    ide.setSidePaneTab('files')
  } else {
    ide.setChatFocus()
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
