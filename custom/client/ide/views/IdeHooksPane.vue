<script setup lang="ts">
// IdeHooksPane — Hooks 管理只读面板（R4，claude-code hooks 管理入口语义）。
// 数据源：GET /api/hermes/config?section=hooks（既有端点，零 patch）。
// 按 event 分组渲染 shell hook 条目（event/command/matcher/timeout/fail_closed）。
// 写入/批准管理落 R5+——allowlist 是安全面，MVP 不做 UI 写。
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ideHooksApi, type HookSpec } from '../api/hooks'

const { t } = useI18n()

const hooks = ref<HookSpec[]>([])
const state = ref<'loading' | 'ok' | 'empty' | 'error'>('loading')

async function load(): Promise<void> {
  state.value = 'loading'
  try {
    hooks.value = await ideHooksApi.list()
    state.value = hooks.value.length ? 'ok' : 'empty'
  } catch {
    state.value = 'error'
  }
}

onMounted(load)

function byEvent(list: HookSpec[]): Array<{ event: string; items: HookSpec[] }> {
  const map = new Map<string, HookSpec[]>()
  for (const h of list) {
    const arr = map.get(h.event) ?? []
    arr.push(h)
    map.set(h.event, arr)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([event, items]) => ({ event, items }))
}
</script>

<template>
  <div class="ide-hooks">
    <div class="ide-hooks__head">
      <span class="ide-hooks__title">{{ t('ide.hooks.title') }}</span>
      <button type="button" class="ide-hooks__refresh" data-testid="ide-hooks-refresh" @click="load">
        {{ t('ide.hooks.refresh') }}
      </button>
    </div>

    <div v-if="state === 'loading'" class="ide-hooks__state">…</div>
    <div v-else-if="state === 'error'" class="ide-hooks__state" data-testid="ide-hooks-error">
      {{ t('ide.hooks.loadFailed') }}
    </div>
    <div v-else-if="state === 'empty'" class="ide-hooks__state" data-testid="ide-hooks-empty">
      {{ t('ide.hooks.empty') }}
    </div>

    <template v-else>
      <section v-for="group in byEvent(hooks)" :key="group.event" class="ide-hooks__group">
        <div class="ide-hooks__event" :data-testid="`ide-hooks-event-${group.event}`">{{ group.event }}</div>
        <ul class="ide-hooks__list">
          <li v-for="(h, i) in group.items" :key="i" class="ide-hooks__item" :data-testid="ide-hooks-item">
            <code class="ide-hooks__command" :title="h.command">{{ h.command }}</code>
            <span v-if="h.matcher" class="ide-hooks__matcher" :title="h.matcher">~ {{ h.matcher }}</span>
            <span class="ide-hooks__meta">
              <span v-if="h.timeout">{{ h.timeout }}s</span>
              <span v-if="h.fail_closed" class="ide-hooks__failclosed">{{ t('ide.hooks.failClosed') }}</span>
            </span>
          </li>
        </ul>
      </section>
    </template>

    <p class="ide-hooks__hint">{{ t('ide.hooks.hint') }}</p>
  </div>
</template>

<style scoped lang="scss">
.ide-hooks {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-primary, #d7dae0);
  overflow-y: auto;
}

.ide-hooks__head {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.ide-hooks__title {
  font-weight: 600;
}

.ide-hooks__refresh {
  margin-left: auto;
  border: 1px solid var(--border-color, #3a3f4b);
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;

  &:hover { border-color: #61afef; color: #61afef; }
}

.ide-hooks__state {
  color: var(--text-muted, #9aa0aa);
  padding: 8px 0;
}

.ide-hooks__group {
  margin-bottom: 10px;
}

.ide-hooks__event {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  font-weight: 600;
  color: #61afef;
  margin-bottom: 4px;
}

.ide-hooks__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ide-hooks__item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px dashed color-mix(in srgb, var(--border-color, #3a3f4b) 50%, transparent);
}

.ide-hooks__command {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.ide-hooks__matcher {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
}

.ide-hooks__meta {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
}

.ide-hooks__failclosed {
  color: #f0a44c;
}

.ide-hooks__hint {
  margin-top: auto;
  padding-top: 8px;
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
}
</style>
