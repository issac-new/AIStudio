<script setup lang="ts">
// IdeHooksPane — Hooks 管理面板（R4 只读 MVP → B3 写档面 2026-09-29）。
// 读：GET /api/hermes/config?section=hooks（既有端点，零 patch）。
// 写：PUT /api/hermes/config {section:'hooks', values:{hooks:[...]}}（upstream
// updateConfigSection 同通道，真实落 ~/.hermes/config.yaml）。
// 编辑语义对齐 hookswrite 域七事件词表（claude-code d.ts:402 锚）；hermes
// ShellHookSpec 无 enabled 字段——启停不做假档，删除即停用（schema 诚实）。
// 生效面诚实标注：写入即持久化；运行中的 gateway/agent 按其配置装载节奏消费。
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ideHooksApi, type HookSpec } from '../api/hooks'
import { HOOK_EVENTS } from '../../../server/hookswrite/hooks-write'

const { t } = useI18n()

const hooks = ref<HookSpec[]>([]) // 服务端真值
const draft = ref<HookSpec[]>([]) // 编辑草稿（保存前不落盘）
const state = ref<'loading' | 'ok' | 'empty' | 'error'>('loading')
const saving = ref(false)
const saveError = ref('')
const validationError = ref('')

const editingIdx = ref<number | null>(null)
const editForm = ref<HookSpec>({ event: 'PreToolUse', command: '', matcher: '', timeout: undefined, fail_closed: false })
const adding = ref(false)
const addForm = ref<HookSpec>({ event: 'PreToolUse', command: '', matcher: '', timeout: undefined, fail_closed: false })

const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(hooks.value))

async function load(): Promise<void> {
  state.value = 'loading'
  saveError.value = ''
  try {
    hooks.value = await ideHooksApi.list()
    draft.value = hooks.value.map((h) => ({ ...h }))
    state.value = hooks.value.length ? 'ok' : 'empty'
  } catch {
    state.value = 'error'
  }
}

onMounted(load)

/** 按 event 分组渲染，item 携带扁平序号（编辑/重排操作以扁平序定位） */
function byEvent(list: HookSpec[]): Array<{ event: string; items: Array<{ spec: HookSpec; idx: number }> }> {
  const map = new Map<string, Array<{ spec: HookSpec; idx: number }>>()
  list.forEach((spec, idx) => {
    const arr = map.get(spec.event) ?? []
    arr.push({ spec, idx })
    map.set(spec.event, arr)
  })
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([event, items]) => ({ event, items }))
}

function validateSpec(h: HookSpec): string {
  if (!HOOK_EVENTS.includes(h.event as (typeof HOOK_EVENTS)[number])) return `事件须为七事件词表之一（${HOOK_EVENTS.join('/')}）`
  if (!h.command.trim()) return '命令不能为空'
  return ''
}

function startEdit(idx: number): void {
  editingIdx.value = idx
  editForm.value = { ...draft.value[idx]! }
  validationError.value = ''
}

function applyEdit(): void {
  const idx = editingIdx.value
  if (idx === null) return
  const problem = validateSpec(editForm.value)
  if (problem) { validationError.value = problem; return }
  draft.value = draft.value.map((h, i) => (i === idx ? { ...editForm.value, matcher: editForm.value.matcher || null } : h))
  editingIdx.value = null
}

function removeHook(idx: number): void {
  draft.value = draft.value.filter((_, i) => i !== idx)
  if (editingIdx.value === idx) editingIdx.value = null
}

function moveHook(idx: number, dir: -1 | 1): void {
  const j = idx + dir
  if (j < 0 || j >= draft.value.length) return
  const next = [...draft.value]
  const tmp = next[idx]!
  next[idx] = next[j]!
  next[j] = tmp
  draft.value = next
}

function submitAdd(): void {
  const problem = validateSpec(addForm.value)
  if (problem) { validationError.value = problem; return }
  draft.value = [...draft.value, { ...addForm.value, matcher: addForm.value.matcher || null }]
  addForm.value = { event: 'PreToolUse', command: '', matcher: '', timeout: undefined, fail_closed: false }
  adding.value = false
  validationError.value = ''
  state.value = 'ok' // 空态下新增后离开 empty 分支
}

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    await ideHooksApi.saveAll(draft.value)
    hooks.value = draft.value.map((h) => ({ ...h }))
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}

function discard(): void {
  draft.value = hooks.value.map((h) => ({ ...h }))
  editingIdx.value = null
  validationError.value = ''
}
</script>

<template>
  <div class="ide-hooks">
    <div class="ide-hooks__head">
      <span class="ide-hooks__title">{{ t('ide.hooks.title') }}</span>
      <button type="button" class="ide-hooks__refresh" data-testid="ide-hooks-add" @click="adding = !adding">
        ＋ 新增
      </button>
      <button type="button" class="ide-hooks__refresh" data-testid="ide-hooks-refresh" @click="load">
        {{ t('ide.hooks.refresh') }}
      </button>
    </div>

    <div v-if="adding" class="ide-hooks__form" data-testid="ide-hooks-addform">
      <select v-model="addForm.event" data-testid="ide-hooks-add-event">
        <option v-for="e in HOOK_EVENTS" :key="e" :value="e">{{ e }}</option>
      </select>
      <input v-model="addForm.command" placeholder="command（shell）" data-testid="ide-hooks-add-command" />
      <input v-model="addForm.matcher" placeholder="matcher（可空，如 Edit|Write）" data-testid="ide-hooks-add-matcher" />
      <label class="ide-hooks__fc"><input v-model="addForm.fail_closed" type="checkbox" data-testid="ide-hooks-add-fc" /> fail_closed</label>
      <button type="button" data-testid="ide-hooks-add-ok" @click="submitAdd">加入清单</button>
    </div>

    <div v-if="state === 'loading'" class="ide-hooks__state">…</div>
    <div v-else-if="state === 'error'" class="ide-hooks__state" data-testid="ide-hooks-error">
      {{ t('ide.hooks.loadFailed') }}
    </div>
    <div v-else-if="state === 'empty' && !draft.length" class="ide-hooks__state" data-testid="ide-hooks-empty">
      {{ t('ide.hooks.empty') }}
    </div>

    <template v-else>
      <section v-for="group in byEvent(draft)" :key="group.event" class="ide-hooks__group">
        <div class="ide-hooks__event" :data-testid="`ide-hooks-event-${group.event}`">{{ group.event }}</div>
        <ul class="ide-hooks__list">
          <li v-for="item in group.items" :key="item.idx" class="ide-hooks__item" :data-testid="`ide-hooks-item-${item.idx}`">
            <template v-if="editingIdx === item.idx">
              <span class="ide-hooks__editrow">
                <select v-model="editForm.event" :data-testid="`ide-hooks-edit-event-${item.idx}`">
                  <option v-for="e in HOOK_EVENTS" :key="e" :value="e">{{ e }}</option>
                </select>
                <input v-model="editForm.command" :data-testid="`ide-hooks-edit-command-${item.idx}`" />
                <input v-model="editForm.matcher" placeholder="matcher" :data-testid="`ide-hooks-edit-matcher-${item.idx}`" />
                <button type="button" :data-testid="`ide-hooks-edit-ok-${item.idx}`" @click="applyEdit">✓</button>
              </span>
            </template>
            <template v-else>
              <code class="ide-hooks__command" :title="item.spec.command">{{ item.spec.command }}</code>
              <span v-if="item.spec.matcher" class="ide-hooks__matcher" :title="item.spec.matcher">~ {{ item.spec.matcher }}</span>
              <span class="ide-hooks__meta">
                <span v-if="item.spec.timeout">{{ item.spec.timeout }}s</span>
                <span v-if="item.spec.fail_closed" class="ide-hooks__failclosed">{{ t('ide.hooks.failClosed') }}</span>
              </span>
              <span class="ide-hooks__ops">
                <button type="button" :data-testid="`ide-hooks-up-${item.idx}`" title="上移" @click="moveHook(item.idx, -1)">↑</button>
                <button type="button" :data-testid="`ide-hooks-down-${item.idx}`" title="下移" @click="moveHook(item.idx, 1)">↓</button>
                <button type="button" :data-testid="`ide-hooks-edit-${item.idx}`" title="编辑" @click="startEdit(item.idx)">✎</button>
                <button type="button" :data-testid="`ide-hooks-del-${item.idx}`" title="删除（即停用）" @click="removeHook(item.idx)">🗑</button>
              </span>
            </template>
          </li>
        </ul>
      </section>
    </template>

    <p v-if="validationError" class="ide-hooks__error" data-testid="ide-hooks-validation">{{ validationError }}</p>

    <div v-if="dirty" class="ide-hooks__savebar" data-testid="ide-hooks-savebar">
      <span>有未保存改动</span>
      <button type="button" data-testid="ide-hooks-save" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存到 config.yaml' }}</button>
      <button type="button" data-testid="ide-hooks-discard" @click="discard">丢弃</button>
    </div>
    <p v-if="saveError" class="ide-hooks__error" data-testid="ide-hooks-saveerror">{{ saveError }}</p>

    <p class="ide-hooks__hint">{{ t('ide.hooks.hint') }}写入即持久化到 ~/.hermes/config.yaml；运行中的 gateway/agent 按其配置装载节奏消费。</p>
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
  gap: 6px;
}

.ide-hooks__title {
  font-weight: 600;
  flex: 1;
}

.ide-hooks__refresh {
  border: 1px solid var(--border-color, #3a3f4b);
  background: none;
  color: var(--text-secondary, #b0b5be);
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;

  &:hover { border-color: var(--primary-color, #18a058); color: var(--primary-color, #18a058); }
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
  color: var(--primary-color, #18a058);
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

.ide-hooks__ops {
  flex-shrink: 0;
  display: flex;
  gap: 2px;

  button {
    border: 1px solid var(--border-color, #3a3f4b);
    background: none;
    color: var(--text-secondary, #b0b5be);
    border-radius: 3px;
    font-size: 10px;
    padding: 0 4px;
    cursor: pointer;
  }
}

.ide-hooks__form {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border: 1px dashed var(--border-color, #3a3f4b);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;

  input, select {
    border: 1px solid var(--border-color, #3a3f4b);
    background: none;
    color: var(--text-primary, #d7dae0);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 11px;
  }

  button {
    border: 1px solid var(--primary-color, #18a058);
    color: var(--primary-color, #18a058);
    background: none;
    border-radius: 4px;
    padding: 2px 10px;
    cursor: pointer;
  }
}

.ide-hooks__fc { font-size: 11px; color: var(--text-muted, #9aa0aa); display: flex; align-items: center; gap: 4px; }

.ide-hooks__editrow {
  display: flex;
  gap: 6px;
  flex: 1;

  input, select {
    border: 1px solid var(--border-color, #3a3f4b);
    background: none;
    color: var(--text-primary, #d7dae0);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    flex: 1;
  }
}

.ide-hooks__savebar {
  display: flex;
  gap: 8px;
  align-items: center;
  border-top: 1px solid var(--border-color, #3a3f4b);
  padding-top: 8px;
  margin-top: 8px;

  button {
    border: 1px solid var(--primary-color, #18a058);
    color: var(--primary-color, #18a058);
    background: none;
    border-radius: 4px;
    padding: 2px 10px;
    cursor: pointer;
  }
}

.ide-hooks__error {
  color: var(--error-color, #f04864);
  font-size: 11px;
}

.ide-hooks__hint {
  margin-top: auto;
  padding-top: 12px;
  font-size: 10px;
  color: var(--text-muted, #9aa0aa);
}
</style>
