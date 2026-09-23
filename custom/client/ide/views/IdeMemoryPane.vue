<script setup lang="ts">
// IdeMemoryPane — 工作区记忆查看器（M3，对标 zcode settings.memory.viewer 37 键）：
// 读取 workspace 的记忆文件（AGENTS.md / MEMORY.md / memory 目录），只读浏览 + 搜索。
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { listFiles, readFile } from '@/api/studio/files'
import MarkdownRenderer from '@/components/hermes/chat/MarkdownRenderer.vue'
import { useIdeStore } from '../store/ide'

const { t } = useI18n()
const message = useMessage()
const ide = useIdeStore()

const items = ref<Array<{ path: string; name: string }>>([])
const loading = ref(false)
const selected = ref<{ path: string; name: string } | null>(null)
const content = ref('')
const contentLoading = ref(false)
const query = ref('')

const hasWorkspace = computed(() => Boolean(ide.workspace))
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return q ? items.value.filter(i => i.name.toLowerCase().includes(q)) : items.value
})

async function load(): Promise<void> {
  if (!hasWorkspace.value) return
  loading.value = true
  try {
    // 记忆文件三来源：根 AGENTS.md / MEMORY.md + memory/ 目录（zcode workspace memory 对应物）
    const found: Array<{ path: string; name: string }> = []
    const push = (path: string, name: string) => { if (!found.some(f => f.path === path)) found.push({ path, name }) }
    const rootRes = await listFiles('', ide.workspace!)
    for (const name of ['AGENTS.md', 'CLAUDE.md', 'MEMORY.md']) {
      if (rootRes.entries.some(e => e.name === name && e.type === 'file')) push(name, name)
    }
    if (rootRes.entries.some(e => e.name === 'memory' && e.type === 'directory')) {
      const memRes = await listFiles('memory', ide.workspace!)
      for (const e of memRes.entries) {
        if (e.type === 'file' && e.name.endsWith('.md')) push(`memory/${e.name}`, `memory/${e.name}`)
      }
    }
    items.value = found
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

async function open(item: { path: string; name: string }): Promise<void> {
  selected.value = item
  contentLoading.value = true
  content.value = ''
  try {
    const res = await readFile(item.path, ide.workspace!)
    content.value = res.content
  } catch {
    message.error(t('ide.memory.loadFailed'))
  } finally {
    contentLoading.value = false
  }
}

onMounted(load)
// 工作区切换即重载：否则记忆面板继续读旧目录
watch(() => ide.workspace, () => void load())
</script>

<template>
  <div class="ide-memory" data-testid="ide-memory-pane">
    <div class="ide-memory__toolbar">
      <span class="ide-memory__title">{{ t('ide.memory.panelTitle') }}</span>
      <button type="button" class="ide-memory__btn" data-testid="ide-memory-refresh" @click="load">{{ t('ide.memory.refresh') }}</button>
    </div>

    <p v-if="!hasWorkspace" class="ide-memory__hint">{{ t('ide.memory.needWorkspace') }}</p>
    <p v-else-if="loading" class="ide-memory__hint">{{ t('ide.memory.loading') }}</p>
    <p v-else-if="!items.length" class="ide-memory__hint">{{ t('ide.memory.empty') }}</p>

    <template v-else>
      <div class="ide-memory__search">
        <input v-model="query" type="text" class="ide-memory__search-input" :placeholder="t('ide.memory.searchPlaceholder')" data-testid="ide-memory-search">
      </div>
      <div class="ide-memory__body">
        <ul class="ide-memory__list" data-testid="ide-memory-list">
          <li
            v-for="item in filtered"
            :key="item.path"
            class="ide-memory__item"
            :class="{ 'is-active': selected?.path === item.path }"
            :data-testid="`ide-memory-item-${item.name}`"
            @click="open(item)"
          >{{ item.name }}</li>
        </ul>
        <div class="ide-memory__content">
          <p v-if="contentLoading" class="ide-memory__hint">{{ t('ide.memory.loading') }}</p>
          <MarkdownRenderer v-else-if="content" :content="content" />
          <p v-else class="ide-memory__hint">{{ t('ide.memory.noSelection') }}</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.ide-memory {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ide-memory__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.ide-memory__title { flex: 1; font-size: 12px; color: var(--text-muted, #9aa0aa); }

.ide-memory__btn {
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: transparent;
  color: var(--text-primary, #e6e6e6);
  font-size: 11px;
  cursor: pointer;

  &:hover { border-color: var(--accent-primary, #4cc9f0); }
}

.ide-memory__hint { padding: 16px 12px; font-size: 12px; color: var(--text-muted, #9aa0aa); }

.ide-memory__search { padding: 4px 10px; }

.ide-memory__search-input {
  width: 100%;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 5px;
  background: var(--bg-primary, #14161a);
  color: var(--text-primary, #e6e6e6);
  font-size: 12px;
  outline: none;

  &:focus { border-color: var(--accent-primary, #4cc9f0); }
}

.ide-memory__body { flex: 1; min-height: 0; display: flex; }

.ide-memory__list {
  width: 45%;
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  border-right: 1px solid var(--border-color, #e0e0e0);
}

.ide-memory__item {
  padding: 5px 8px;
  border-radius: 5px;
  font-size: 12px;
  color: var(--text-primary, #e6e6e6);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover { background: var(--bg-tertiary, #ebebeb); }
  &.is-active {
    background: color-mix(in srgb, var(--accent-primary, #4cc9f0) 12%, transparent);
    color: var(--accent-primary, #4cc9f0);
  }
}

.ide-memory__content { flex: 1; min-width: 0; overflow-y: auto; padding: 8px 10px; font-size: 12px; }
</style>
