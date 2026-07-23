<!-- overlay/custom/client/loop/components/LoopModal.vue -->
<!-- LoopModal — 循环工程全屏弹窗（统一任务流：创建 → 看它跑 → 看结果 → 审批） -->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCockpitStore } from '@/custom/cockpit/store/cockpit'
import { useLoopStore } from '@/custom/loop/store/loop'
import LoopListPanel from '@/custom/loop/components/LoopListPanel.vue'
import LoopDetailPanel from '@/custom/loop/components/LoopDetailPanel.vue'
import LoopCreateWizard from '@/custom/loop/components/LoopCreateWizard.vue'

const { t } = useI18n()
const cockpit = useCockpitStore()
const store = useLoopStore()

const viewMode = ref<'list' | 'detail'>('list')
const selectedLoopId = ref<string | null>(null)
const showWizard = ref(false)

onMounted(() => { store.fetchLoops() })
onUnmounted(() => { store.disconnectSocket() })

function onSelectLoop(id: string) {
  selectedLoopId.value = id
  viewMode.value = 'detail'
}

function onBack() {
  viewMode.value = 'list'
  selectedLoopId.value = null
  store.disconnectSocket()
  void store.fetchLoops()
}

function onCreate() {
  showWizard.value = true
}

// 创建成功：立即运行一次并跳到详情页看它跑
async function onWizardCreated() {
  showWizard.value = false
  const created = store.currentLoop
  if (created) {
    selectedLoopId.value = created.id
    viewMode.value = 'detail'
    // 立即跑一次，让用户看到效果
    await store.tickLoop(created.id).catch(() => {})
  }
}

function onClose() {
  store.disconnectSocket()
  cockpit.closeLoop()
}
</script>

<template>
  <div class="loop-modal" @click.self="onClose">
    <div class="loop-modal__panel" @click.stop>
      <div class="loop-modal__head">
        <span class="loop-modal__title">🔄 {{ t('loop.title') }}</span>
        <button class="loop-modal__close" @click="onClose">×</button>
      </div>
      <div class="loop-modal__body">
        <LoopListPanel
          v-if="viewMode === 'list'"
          @select="onSelectLoop"
          @create="onCreate"
        />
        <LoopDetailPanel
          v-else-if="selectedLoopId"
          :loop-id="selectedLoopId"
          @back="onBack"
        />
      </div>
      <LoopCreateWizard v-if="showWizard" @close="showWizard = false" @created="onWizardCreated" />
    </div>
  </div>
</template>

<style scoped>
.loop-modal {
  position: fixed;
  top: 96px; /* TopBar 44 + Attention 40 + gap 12 — 不遮挡注意力栏 */
  left: 24px;
  right: 24px;
  bottom: 24px;
  z-index: 1001;
  display: flex;
}
.loop-modal__panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-card, var(--color-bg-primary));
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}
.loop-modal__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.loop-modal__title { font-size: 14px; font-weight: 700; }
.loop-modal__close {
  width: 28px; height: 28px;
  border: none; border-radius: 6px;
  background: transparent; cursor: pointer;
  font-size: 18px; line-height: 1;
  color: var(--text-secondary);
}
.loop-modal__close:hover { background: var(--hover-bg); }
.loop-modal__body { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
