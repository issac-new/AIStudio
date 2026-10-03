<script setup lang="ts">
// IdeSlashCommandsPane — 自定义斜杠命令管理（B7，zcode settings/CommandsSection 对照）。
// 语义：name + prompt 模板；/ide 输入框 /name 选中后模板文本写入输入框
// （ChatInput patch 500 消费本 store）。保存=POST /api/ide/slash-commands/save
// 全量替换（服务端校验+原子写）；校验问题逐条可见。
import { onMounted, ref } from 'vue'
import {
  loadSlashCommands, saveSlashCommands,
  __resetSlashCommandsForTest, type SlashCommandEntry,
} from '../store/slash-commands'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const rows = ref<SlashCommandEntry[]>([])
const dirty = ref(false)
const saving = ref(false)
const problems = ref<string[]>([])
const savedOk = ref(false)

onMounted(async () => {
  rows.value = (await loadSlashCommands()).map((c) => ({ ...c }))
})

function addRow(): void {
  rows.value.push({ name: '', description: '', prompt: '' })
  dirty.value = true
  savedOk.value = false
}
function removeRow(i: number): void {
  rows.value.splice(i, 1)
  dirty.value = true
  savedOk.value = false
}
function markDirty(): void { dirty.value = true; savedOk.value = false }

async function save(): Promise<void> {
  if (saving.value) return
  saving.value = true
  problems.value = []
  try {
    const res = await saveSlashCommands(rows.value.map((c) => ({ ...c })))
    if (!res.ok) { problems.value = res.problems ?? ['未知错误']; return }
    dirty.value = false
    savedOk.value = true
  } finally {
    saving.value = false
  }
}

async function reload(): Promise<void> {
  __resetSlashCommandsForTest()
  rows.value = (await loadSlashCommands(true)).map((c) => ({ ...c }))
  dirty.value = false
  problems.value = []
}
</script>

<template>
  <div class="ide-slash" data-testid="ide-slash-pane">
    <div class="ide-slash__head">
      <span class="ide-slash__title">{{ t('ide.slash.title') }}</span>
      <button type="button" data-testid="ide-slash-add" @click="addRow">＋</button>
      <button type="button" data-testid="ide-slash-reload" title="重新载入" @click="reload">↻</button>
    </div>
    <p class="ide-slash__hint">{{ t('ide.slash.hint') }}</p>

    <div v-if="!rows.length" class="ide-slash__empty" data-testid="ide-slash-empty">{{ t('ide.slash.empty') }}</div>

    <div v-for="(c, i) in rows" :key="i" class="ide-slash__row" :data-testid="`ide-slash-row-${i}`">
      <div class="ide-slash__line">
        <span class="ide-slash__slash">/</span>
        <input v-model="c.name" placeholder="name（小写字母/数字/-/_）" data-testid="ide-slash-name" @input="markDirty" />
        <button type="button" data-testid="ide-slash-del" title="删除" @click="removeRow(i)">🗑</button>
      </div>
      <input v-model="c.description" class="ide-slash__desc" placeholder="一句话说明（可空）" data-testid="ide-slash-desc" @input="markDirty" />
      <textarea v-model="c.prompt" rows="3" placeholder="prompt 模板（选中后写入输入框的文本）" data-testid="ide-slash-prompt" @input="markDirty" />
    </div>

    <ul v-if="problems.length" class="ide-slash__problems" data-testid="ide-slash-problems">
      <li v-for="(p, i) in problems" :key="i">{{ p }}</li>
    </ul>

    <div v-if="dirty || savedOk" class="ide-slash__savebar">
      <button v-if="dirty" type="button" data-testid="ide-slash-save" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
      <span v-if="savedOk" class="ide-slash__ok" data-testid="ide-slash-saved">✓ 已保存</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ide-slash { display: flex; flex-direction: column; height: 100%; padding: 10px 12px; font-size: 12px; color: var(--text-primary, #d7dae0); overflow-y: auto; }
.ide-slash__head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.ide-slash__title { font-weight: 600; flex: 1; }
.ide-slash__head button { border: 1px solid var(--border-color, #3a3f4b); background: none; color: var(--text-secondary, #b0b5be); border-radius: 4px; padding: 1px 8px; cursor: pointer; }
.ide-slash__hint { font-size: 10px; color: var(--text-muted, #9aa0aa); margin: 0 0 8px; }
.ide-slash__empty { color: var(--text-muted, #9aa0aa); padding: 8px 0; }
.ide-slash__row { border: 1px solid var(--border-color, #3a3f4b); border-radius: 6px; padding: 6px; margin-bottom: 8px; }
.ide-slash__line { display: flex; gap: 4px; align-items: center; }
.ide-slash__slash { color: var(--primary-color, #18a058); font-weight: 600; }
.ide-slash__row input, .ide-slash__row textarea {
  width: 100%; border: 1px solid var(--border-color, #3a3f4b); background: none;
  color: var(--text-primary, #d7dae0); border-radius: 4px; padding: 3px 6px; font-size: 11px;
  font-family: ui-monospace, monospace;
}
.ide-slash__desc { margin-top: 4px; }
.ide-slash__row textarea { margin-top: 4px; resize: vertical; }
.ide-slash__row button { border: none; background: none; cursor: pointer; color: var(--text-muted, #9aa0aa); }
.ide-slash__problems { color: var(--error-color, #f04864); font-size: 11px; margin: 4px 0; padding-left: 18px; }
.ide-slash__savebar { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
.ide-slash__savebar button { border: 1px solid var(--primary-color, #18a058); color: var(--primary-color, #18a058); background: none; border-radius: 4px; padding: 2px 14px; cursor: pointer; }
.ide-slash__ok { color: var(--primary-color, #18a058); font-size: 11px; }
</style>
