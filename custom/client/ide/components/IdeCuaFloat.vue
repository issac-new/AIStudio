<script setup lang="ts">
// IdeCuaFloat — Cua 截图证据浮窗：会话里 agent 经电脑操作截的图（CUA complete
// loop 证据面）。数据=utils/cuaEvidence 从 node_repl 工具结果提取的 image content。
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChatStore } from '@/stores/hermes/chat'
import { useIdeStore } from '../store/ide'
import { collectCuaEvidence, type CuaEvidence } from '../utils/cuaEvidence'
import { IDE_LOCAL_TEXT, ideLocaleOf } from '../i18n'
import IdeFloatPanel from './IdeFloatPanel.vue'

const { locale } = useI18n()
const chat = useChatStore()
const ide = useIdeStore()
const tx = computed(() => IDE_LOCAL_TEXT[ideLocaleOf(locale)].cua)

const shots = computed(() => collectCuaEvidence((chat.activeSession?.messages ?? []) as never))
const selected = ref<CuaEvidence | null>(null)
const zoom = ref(false)

watch(() => chat.activeSessionId, () => { selected.value = null; zoom.value = false })
watch(shots, (list) => {
  if (selected.value && !list.some((s) => s.id === selected.value?.id)) selected.value = null
})

function pick(shot: CuaEvidence): void {
  selected.value = shot
  zoom.value = false
}

function save(shot: CuaEvidence): void {
  const a = document.createElement('a')
  a.href = shot.data
  a.download = `cua-${new Date(shot.at || Date.now()).toISOString().replace(/[:.]/g, '-')}.png`
  a.click()
}
</script>

<template>
  <IdeFloatPanel :title="`${tx.title}${shots.length ? ` · ${shots.length}` : ''}`" testid="ide-cua-float" @close="ide.floats.cua = false">
    <template v-if="shots.length">
      <div class="ide-cua__list">
        <button
          v-for="s in shots"
          :key="s.id"
          type="button"
          class="ide-cua__thumb"
          :class="{ 'is-active': selected?.id === s.id }"
          :data-testid="`ide-cua-shot-${s.id}`"
          :title="s.note || s.toolName"
          @click="pick(s)"
        >
          <img :src="s.data" :alt="tx.shot" loading="lazy">
        </button>
      </div>
      <div v-if="selected" class="ide-cua__view" :class="{ 'is-zoom': zoom }" data-testid="ide-cua-view">
        <div class="ide-cua__bar">
          <span class="ide-cua__meta">{{ new Date(selected.at || Date.now()).toLocaleString() }} · {{ selected.toolName }}</span>
          <button type="button" class="ide-cua__btn" data-testid="ide-cua-zoom" @click="zoom = !zoom">{{ zoom ? tx.shrink : tx.enlarge }}</button>
          <button type="button" class="ide-cua__btn" data-testid="ide-cua-save" @click="save(selected)">{{ tx.save }}</button>
        </div>
        <p v-if="selected.note" class="ide-cua__note">{{ selected.note }}</p>
        <img class="ide-cua__img" :src="selected.data" :alt="tx.shot" @click="zoom = !zoom">
      </div>
    </template>
    <p v-else class="ide-cua__empty" data-testid="ide-cua-empty">{{ tx.empty }}</p>
  </IdeFloatPanel>
</template>

<style scoped lang="scss">
.ide-cua__list { display: flex; flex-wrap: wrap; gap: 6px; }
.ide-cua__thumb {
  width: 96px; height: 64px; padding: 0; border: 1px solid var(--border-color);
  border-radius: 6px; overflow: hidden; cursor: pointer; background: var(--bg-secondary);
}
.ide-cua__thumb.is-active { border-color: var(--primary-color); }
.ide-cua__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ide-cua__view { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.ide-cua__view.is-zoom .ide-cua__img { width: 100%; max-height: none; object-fit: contain; }
.ide-cua__bar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ide-cua__meta { flex: 1; min-width: 0; font-size: 10.5px; color: var(--text-muted); }
.ide-cua__btn { border: 1px solid var(--border-color); background: transparent; color: var(--text-primary); border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.ide-cua__btn:hover { border-color: var(--primary-color); color: var(--primary-color); }
.ide-cua__note { margin: 0; font-size: 10.5px; color: var(--text-muted); }
.ide-cua__img {
  width: 360px; max-height: 240px; object-fit: contain; border: 1px solid var(--border-color);
  border-radius: 6px; cursor: zoom-in; background: var(--bg-secondary);
}
.ide-cua__empty { color: var(--text-muted); font-size: 12px; line-height: 1.6; margin: 0; }
</style>
