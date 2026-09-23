<script setup lang="ts">
// IdeStoragePane — 资源管理器面板（M2，对标 zcode resourceManager 65 键）：
// 磁盘占用分类扫描 / 安全分类清理（确认弹层 + 释放量 toast）/ 在文件管理器中显示。
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { ideStorageApi, type StorageCategory } from '../api/storage'
import { formatBytes } from '../utils/format'

const { t } = useI18n()
const message = useMessage()

const categories = ref<StorageCategory[]>([])
const totalBytes = ref(0)
const loading = ref(false)
const confirmTarget = ref<StorageCategory | null>(null)
const cleaning = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const snap = await ideStorageApi.snapshot()
    categories.value = snap.categories
    totalBytes.value = snap.totalBytes
  } catch {
    message.error(t('ide.storage.loadFailed'))
  } finally {
    loading.value = false
  }
}

async function doClean(): Promise<void> {
  const target = confirmTarget.value
  if (!target) return
  cleaning.value = true
  try {
    const res = await ideStorageApi.clean(target.key)
    message.success(t('ide.storage.cleanSuccess', { size: formatBytes(res.freedBytes) }))
    confirmTarget.value = null
    await load()
  } catch {
    message.error(t('ide.storage.cleanFailed'))
  } finally {
    cleaning.value = false
  }
}

function reveal(cat: StorageCategory): void {
  ideStorageApi.reveal(cat.key).catch(() => message.error(t('ide.storage.revealFailed')))
}

onMounted(load)
</script>

<template>
  <div class="ide-storage" data-testid="ide-storage-pane">
    <div class="ide-storage__toolbar">
      <span class="ide-storage__title">{{ t('ide.storage.panelTitle') }}</span>
      <span class="ide-storage__total">{{ t('ide.storage.total') }}：{{ formatBytes(totalBytes) }}</span>
      <button type="button" class="ide-storage__btn" data-testid="ide-storage-refresh" @click="load">{{ t('ide.storage.rescan') }}</button>
    </div>

    <p v-if="loading" class="ide-storage__hint">{{ t('ide.storage.scanning') }}</p>
    <div v-else class="ide-storage__list" data-testid="ide-storage-list">
      <div v-for="cat in categories" :key="cat.key" class="ide-storage__row">
        <div class="ide-storage__row-main">
          <span class="ide-storage__name">{{ t(`ide.storage.cat_${cat.key}`) }}</span>
          <span class="ide-storage__size" :data-testid="`ide-storage-size-${cat.key}`">{{ cat.exists ? formatBytes(cat.bytes) : '—' }}</span>
        </div>
        <div class="ide-storage__row-sub">{{ cat.path }}</div>
        <div class="ide-storage__row-actions">
          <button v-if="cat.exists" type="button" class="ide-storage__btn" :data-testid="`ide-storage-reveal-${cat.key}`" @click="reveal(cat)">{{ t('ide.storage.reveal') }}</button>
          <button
            v-if="cat.cleanable && cat.exists && cat.bytes > 0"
            type="button"
            class="ide-storage__btn ide-storage__btn--danger"
            :data-testid="`ide-storage-clean-${cat.key}`"
            @click="confirmTarget = cat"
          >{{ t('ide.storage.clean') }}</button>
        </div>
      </div>
    </div>

    <div v-if="confirmTarget" class="ide-storage__confirm" data-testid="ide-storage-confirm">
      <p>{{ t('ide.storage.confirmTitle', { category: t(`ide.storage.cat_${confirmTarget.key}`) }) }}</p>
      <p class="ide-storage__confirm-size">{{ t('ide.storage.confirmSize', { size: formatBytes(confirmTarget.bytes) }) }}</p>
      <div class="ide-storage__confirm-actions">
        <button type="button" class="ide-storage__btn ide-storage__btn--danger" :disabled="cleaning" data-testid="ide-storage-confirm-ok" @click="doClean">{{ t('ide.storage.clean') }}</button>
        <button type="button" class="ide-storage__btn" @click="confirmTarget = null">{{ t('common.cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-storage {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ide-storage__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-storage__title { flex-shrink: 0; font-size: 12px; color: var(--text-muted, #9aa0aa); }
.ide-storage__total { flex: 1; min-width: 0; font-size: 12px; color: var(--text-primary, #e6e6e6); }

.ide-storage__hint { padding: 16px 12px; font-size: 12px; color: var(--text-muted, #9aa0aa); }

.ide-storage__list { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 8px; }

.ide-storage__row {
  padding: 8px;
  border-radius: 7px;
  margin-bottom: 4px;
  background: var(--bg-primary, #14161a);
}

.ide-storage__row-main { display: flex; align-items: center; gap: 8px; }
.ide-storage__name { font-size: 12px; color: var(--text-primary, #e6e6e6); }
.ide-storage__size { margin-left: auto; font-size: 12px; color: var(--accent-primary, #4cc9f0); font-family: ui-monospace, monospace; }
.ide-storage__row-sub { margin-top: 2px; font-size: 10px; color: var(--text-muted, #9aa0aa); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ide-storage__row-actions { margin-top: 6px; display: flex; gap: 6px; }

.ide-storage__btn {
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary, #e6e6e6);
  font-size: 11px;
  cursor: pointer;

  &:hover:not(:disabled) { border-color: var(--accent-primary, #4cc9f0); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }

  &--danger { color: #e06c75; border-color: rgba(224, 108, 117, 0.5); &:hover:not(:disabled) { background: rgba(224, 108, 117, 0.12); } }
}

.ide-storage__confirm {
  position: absolute;
  inset: auto 10px 10px 10px;
  padding: 10px 12px;
  border: 1px solid rgba(224, 108, 117, 0.5);
  border-radius: 8px;
  background: var(--bg-secondary, #1b1e24);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);

  p { margin: 0 0 4px; font-size: 12px; color: var(--text-primary, #e6e6e6); }
}

.ide-storage__confirm-size { color: var(--text-muted, #9aa0aa); font-size: 11px; }
.ide-storage__confirm-actions { margin-top: 8px; display: flex; gap: 6px; }
</style>
