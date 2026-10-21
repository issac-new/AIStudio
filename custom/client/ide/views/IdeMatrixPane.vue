<!-- overlay/custom/client/ide/views/IdeMatrixPane.vue -->
<!-- IDE 内完整 Matrix 客户端（2026-10-21 挂账实施轮，用户裁定）：
     左列复用 MatrixRoomList（含推演房间徽标），右侧 MatrixRoomHeader +
     MatrixMessagePanel（读写同工作台画布），线程/摘要走 MatrixRightPanel。
     与 /matrix 全量客户端同一套 store（matrix-client/matrix-room），凭据与
     server-info 单源对账复用；不另建第二运行时。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMatrixClientStore } from '@/custom/matrix-chat/stores/matrix-client'
import { useMatrixRoomStore } from '@/custom/matrix-chat/stores/matrix-room'
import { useMatrixRightPanelStore } from '@/custom/matrix-chat/stores/matrix-right-panel'
import MatrixRoomList from '@/custom/matrix-chat/components/MatrixRoomList.vue'
import MatrixRoomHeader from '@/custom/matrix-chat/components/MatrixRoomHeader.vue'
import MatrixMessagePanel from '@/custom/matrix-chat/components/MatrixMessagePanel.vue'
import MatrixRightPanel from '@/custom/matrix-chat/components/MatrixRightPanel.vue'
import MatrixCreateRoomDialog from '@/custom/matrix-chat/components/MatrixCreateRoomDialog.vue'
import MatrixJoinRoomDialog from '@/custom/matrix-chat/components/MatrixJoinRoomDialog.vue'
import '../../matrix-chat/styles/matrix-chat.scss'

const { t } = useI18n()
const clientStore = useMatrixClientStore()
const roomStore = useMatrixRoomStore()
const rightPanelStore = useMatrixRightPanelStore()

const showList = ref(true)
const showCreateRoom = ref(false)
const showJoinRoom = ref(false)

const syncLabel = computed(() => {
  if (!clientStore.authenticated) return t('matrixChat.notAuthenticated')
  if (clientStore.syncState !== 'PREPARED' && clientStore.syncState !== 'SYNCING') return t('matrixChat.syncing')
  return t('matrixChat.syncConnected', '已连接')
})

onMounted(() => {
  // 与 MatrixChatPanel 同一初始化链：存量凭据起 client（未登录→空态提示，
  // 登录入口在日常工作台/账户管理，不在 IDE 内重复造）。
  clientStore.refreshCredentials()
  if (clientStore.authenticated && !clientStore.client) clientStore.initClient()
})
</script>

<template>
  <div class="ide-matrix" data-testid="ide-matrix-pane">
    <aside v-show="showList" class="ide-matrix__list">
      <MatrixRoomList />
    </aside>
    <section class="ide-matrix__main">
      <header class="ide-matrix__head">
        <button
          type="button" class="ide-matrix__toggle"
          :title="showList ? t('ide.matrix.hideList', '收起房间列') : t('ide.matrix.showList', '展开房间列')"
          data-testid="ide-matrix-toggle-list"
          @click="showList = !showList"
        >≡</button>
        <MatrixRoomHeader v-if="roomStore.activeRoomId && roomStore.activeRoom" />
        <span v-else class="ide-matrix__placeholder">{{ t('matrixChat.noRoomSelected', '选择一个房间开始') }}</span>
        <span class="ide-matrix__sync" data-testid="ide-matrix-sync">{{ syncLabel }}</span>
        <button type="button" class="ide-matrix__act" data-testid="ide-matrix-create" @click="showCreateRoom = true">
          {{ t('matrixChat.createRoom') }}
        </button>
        <button type="button" class="ide-matrix__act" data-testid="ide-matrix-join" @click="showJoinRoom = true">
          {{ t('matrixChat.joinRoom') }}
        </button>
      </header>
      <div class="ide-matrix__content">
        <div class="ide-matrix__messages">
          <MatrixMessagePanel />
        </div>
        <MatrixRightPanel v-if="rightPanelStore.rightPanelPhase" />
      </div>
    </section>
    <MatrixCreateRoomDialog v-if="showCreateRoom" @close="showCreateRoom = false" />
    <MatrixJoinRoomDialog v-if="showJoinRoom" @close="showJoinRoom = false" />
  </div>
</template>

<style scoped lang="scss">
.ide-matrix { flex: 1; min-width: 0; display: flex; overflow: hidden; }
.ide-matrix__list { flex: 0 0 180px; min-width: 0; display: flex; flex-direction: column; border-right: 1px solid var(--border-color); overflow: hidden; }
.ide-matrix__main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.ide-matrix__head {
  flex: none; display: flex; align-items: center; gap: 6px;
  padding: 4px 8px; border-bottom: 1px solid var(--border-color);
  font-size: 12px; min-width: 0;
}
.ide-matrix__toggle { border: 0; background: transparent; cursor: pointer; color: var(--text-muted); padding: 2px 4px; }
.ide-matrix__placeholder { flex: 1; min-width: 0; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-matrix__sync { flex: none; font-size: 10px; color: var(--text-muted); }
.ide-matrix__act {
  flex: none; border: 1px solid var(--border-color); border-radius: 10px;
  background: transparent; color: var(--text-secondary);
  font-size: 10px; line-height: 16px; padding: 0 8px; cursor: pointer;
  &:hover { color: var(--text-primary); border-color: var(--text-muted); }
}
.ide-matrix__content { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.ide-matrix__messages { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
</style>
