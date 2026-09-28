<script setup lang="ts">
// IdeMemoryPane — 工作区记忆查看器（M3，对标 zcode settings.memory.viewer 37 键）：
// 读取 workspace 的记忆文件（AGENTS.md / MEMORY.md / memory 目录），只读浏览 + 搜索。
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { listFiles, readFile } from '@/api/studio/files'
import MarkdownRenderer from '@/components/hermes/chat/MarkdownRenderer.vue'
import { useIdeStore } from '../store/ide'
import { freshnessOf, type Freshness } from '../../../server/memorytax/memory-taxonomy'
import { toggleScope, clearScope, scopeSummary, type MemoryScopeBoard, type MemoryScopeKind } from '../../../server/memscope/memory-scope'

const { t } = useI18n()
const message = useMessage()
const ide = useIdeStore()

const items = ref<Array<{ path: string; name: string; mtime?: number }>>([])
const loading = ref(false)
const selected = ref<{ path: string; name: string } | null>(null)
const content = ref('')
const contentLoading = ref(false)
const query = ref('')

// ── 两级分治（吸收第一批 D1，qoder 记忆全局/项目分治：开关/文件数/清空）──
// 全局档=memory/ 目录（跨项目共用偏好），项目档=根 AGENTS.md/MEMORY.md；开关影响
// 检索过滤（列表层），清空=隐藏（物理删除归文件管理，诚实不做删除按钮）。
const SCOPE_KEY = 'ide_memory_scope_v1'
function loadBoard(): MemoryScopeBoard {
  try {
    const raw = JSON.parse(localStorage.getItem(SCOPE_KEY) ?? 'null') as MemoryScopeBoard | null
    if (raw && raw.global && raw.project) return raw
  } catch { /* 坏档回默认 */ }
  return { global: { enabled: true, fileCount: 0 }, project: { enabled: true, fileCount: 0 } }
}
const scopeBoard = ref<MemoryScopeBoard>(loadBoard())
function persistBoard(): void { localStorage.setItem(SCOPE_KEY, JSON.stringify(scopeBoard.value)) }
function toggle(scope: MemoryScopeKind): void {
  scopeBoard.value = toggleScope(scopeBoard.value, scope)
  persistBoard()
}
function clearScopeFiles(scope: MemoryScopeKind): void {
  if (!window.confirm(`清空${scope === 'global' ? '全局' : '项目'}档记忆列表？（隐藏列表，不删文件）`)) return
  scopeBoard.value = clearScope(scopeBoard.value, scope)
  persistBoard()
}
const scopeSum = computed(() => scopeSummary(scopeBoard.value))

function itemScope(name: string): MemoryScopeKind {
  return name.startsWith('memory/') ? 'global' : 'project'
}

const hasWorkspace = computed(() => Boolean(ide.workspace))
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return (q ? items.value.filter(i => i.name.toLowerCase().includes(q)) : items.value)
    .filter((i) => scopeBoard.value[itemScope(i.name)].enabled)
})

/** 新鲜度徽章（memory-taxonomy：7d fresh/30d aging/其后 stale 提示重新核实）。 */
function freshnessOfItem(item: { mtime?: number }): { freshness: Freshness; label: string } | null {
  if (!item.mtime) return null
  const f = freshnessOf(item.mtime)
  const label = f.freshness === 'fresh' ? '新' : f.freshness === 'aging' ? `${f.ageDays}d` : `${f.ageDays}d·需核实`
  return { freshness: f.freshness, label }
}

async function load(): Promise<void> {
  if (!hasWorkspace.value) return
  loading.value = true
  try {
    // 记忆文件三来源：根 AGENTS.md / MEMORY.md + memory/ 目录（zcode workspace memory 对应物）
    // FileEntry 判形用 isDir（api/studio/workspace-files.ts 契约；e.type 字段不存在，
    // 2026-09-28 实测修复：旧 e.type==='file'/'directory' 恒 false → 记忆文件永远列不出）
    const found: Array<{ path: string; name: string; mtime?: number }> = []
    const push = (path: string, name: string, mtime?: string) => {
      if (!found.some(f => f.path === path)) found.push({ path, name, mtime: mtime ? Date.parse(mtime) || undefined : undefined })
    }
    const rootRes = await listFiles('', ide.workspace!)
    for (const name of ['AGENTS.md', 'CLAUDE.md', 'MEMORY.md']) {
      const e = rootRes.entries.find(en => en.name === name && !en.isDir)
      if (e) push(name, name, e.modTime)
    }
    if (rootRes.entries.some(e => e.name === 'memory' && e.isDir)) {
      const memRes = await listFiles('memory', ide.workspace!)
      for (const e of memRes.entries) {
        if (!e.isDir && e.name.endsWith('.md')) push(`memory/${e.name}`, `memory/${e.name}`, e.modTime)
      }
    }
    items.value = found
    // 分治文件数同步（memscope setFileCount 语义——显示当前真实数）。
    scopeBoard.value = {
      global: { ...scopeBoard.value.global, fileCount: found.filter(f => f.name.startsWith('memory/')).length },
      project: { ...scopeBoard.value.project, fileCount: found.filter(f => !f.name.startsWith('memory/')).length },
    }
    persistBoard()
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
      <!-- 两级分治卡（D1，qoder：全局/项目独立开关+文件数+清空列表） -->
      <div class="ide-memory__scopes" data-testid="ide-memory-scopes">
        <div class="ide-memory__scope" data-testid="ide-memory-scope-global">
          <button type="button" class="ide-memory__scope-toggle" :class="{ 'is-on': scopeBoard.global.enabled }" @click="toggle('global')">全局 {{ scopeBoard.global.fileCount }}</button>
          <button type="button" class="ide-memory__scope-clear" title="清空列表（不删文件）" @click="clearScopeFiles('global')">清</button>
        </div>
        <div class="ide-memory__scope" data-testid="ide-memory-scope-project">
          <button type="button" class="ide-memory__scope-toggle" :class="{ 'is-on': scopeBoard.project.enabled }" @click="toggle('project')">项目 {{ scopeBoard.project.fileCount }}</button>
          <button type="button" class="ide-memory__scope-clear" title="清空列表（不删文件）" @click="clearScopeFiles('project')">清</button>
        </div>
        <span class="ide-memory__scope-sum">{{ scopeSum.enabledScopes }}/2 档开</span>
      </div>
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
          >{{ item.name }}
            <span
              v-if="freshnessOfItem(item)"
              class="ide-memory__fresh"
              :data-fresh="freshnessOfItem(item)!.freshness"
              :title="freshnessOfItem(item)!.freshness === 'stale' ? 'stale：请重新核实（防过期记忆误导）' : ''"
            >{{ freshnessOfItem(item)!.label }}</span>
          </li>
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

.ide-memory__scopes { display: flex; align-items: center; gap: 10px; padding: 4px 10px; border-bottom: 1px solid var(--border-color, #e0e0e0); font-size: 11px; }
.ide-memory__scope { display: inline-flex; align-items: center; gap: 4px; }
.ide-memory__scope-toggle { border: 1px solid var(--border-color, #e0e0e0); border-radius: 10px; background: transparent; font-size: 11px; padding: 1px 8px; cursor: pointer; color: var(--text-muted, #9aa0aa);
  &.is-on { color: var(--accent-primary, #4cc9f0); border-color: var(--accent-primary, #4cc9f0); } }
.ide-memory__scope-clear { border: none; background: transparent; color: var(--text-muted, #9aa0aa); cursor: pointer; font-size: 11px; }
.ide-memory__scope-sum { margin-left: auto; color: var(--text-muted, #9aa0aa); font-size: 10px; }
.ide-memory__fresh { font-size: 9px; padding: 0 4px; border-radius: 7px; margin-left: 4px; vertical-align: middle;
  &[data-fresh='fresh'] { color: var(--success-color, #18a058); background: rgba(24, 160, 88, 0.1); }
  &[data-fresh='aging'] { color: var(--warning-color, #f0a020); background: rgba(240, 160, 32, 0.1); }
  &[data-fresh='stale'] { color: var(--error-color, #d03050); background: rgba(208, 48, 80, 0.1); } }
</style>
