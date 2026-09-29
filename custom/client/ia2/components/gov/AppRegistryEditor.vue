<!-- overlay/custom/client/ia2/components/gov/AppRegistryEditor.vue -->
<!-- P7 应用资产表 UI（补遗④）：六列表单增改退役，保存即 git 提交（R13）。
     单一事实源=中央仓 app-registry.md；高级态可直接编辑原文（双向一致）。 -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchRegistry, saveRegistry } from '@/custom/governance/api/adminRegistry'
import { parseFirstTable, setCellAlign } from '@/custom/governance/utils/registry-md'

const COLS = ['应用', '负责人', '专属看板', '技术栈', 'SLA 级', '状态', '门禁骨架']
const rows = ref<string[][]>([])
const preamble = ref<string[]>([])
const after = ref<string[]>([])
const commit = ref('')
const rawMode = ref(false)
const rawMd = ref('')
const busy = ref(false)
const msg = ref('')

async function load() {
  const doc = await fetchRegistry('app-registry')
  commit.value = doc.commit
  rawMd.value = doc.markdown
  const { table, preamble: p, after: a } = parseFirstTable(doc.markdown)
  rows.value = setCellAlign(table.rows, COLS.length)
  preamble.value = p; after.value = a
}
onMounted(() => { void load().catch(e => { msg.value = String(e) }) })

function addRow() { rows.value.push(['', '', '', '', 'Silver', '在役', 'vitest ✓']) }
function delRow(i: number) { rows.value.splice(i, 1) }

async function save() {
  busy.value = true; msg.value = ''
  try {
    const md = rawMode.value
      ? rawMd.value
      : serialize()
    const r = await saveRegistry('app-registry', md, `应用资产表更新（${rows.value.length} 应用）`)
    msg.value = `已保存提交 ${r.commit}`; commit.value = r.commit
    await load()
  } catch (e) { msg.value = `保存失败：${String(e)}` } finally { busy.value = false }
}
function serialize(): string {
  return [...preamble.value,
    `| ${COLS.join(' | ')} |`, `| ${COLS.map(() => '---').join(' | ')} |`,
    ...rows.value.map(r => `| ${r.join(' | ')} |`),
    ...after.value].join('\n')
}
</script>

<template>
  <section class="areg" data-testid="app-registry-editor">
    <div class="areg__hd">
      <h3>应用资产登记表 <span class="areg__meta">@{{ commit || '…' }}</span></h3>
      <div class="areg__acts">
        <button data-testid="areg-add" @click="addRow">＋ 新增应用</button>
        <button data-testid="areg-raw" @click="rawMode = !rawMode">{{ rawMode ? '表单' : '原文' }}</button>
        <button data-testid="areg-save" :disabled="busy" @click="save">保存（提交 git）</button>
      </div>
    </div>
    <p v-if="msg" class="areg__msg" data-testid="areg-msg">{{ msg }}</p>
    <textarea v-if="rawMode" v-model="rawMd" class="areg__raw" rows="14" data-testid="areg-rawmd" />
    <table v-else class="areg__table">
      <thead><tr><th v-for="c in COLS" :key="c">{{ c }}</th><th /></tr></thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i">
          <td v-for="(_, j) in COLS" :key="j"><input v-model="r[j]" :data-testid="`areg-cell-${i}-${j}`" /></td>
          <td><button :data-testid="`areg-del-${i}`" @click="delRow(i)">✕</button></td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped lang="scss">
.areg__hd { display: flex; align-items: center; justify-content: space-between; gap: 8px; h3 { margin: 0; font-size: 13px; } }
.areg__meta { font-size: 10.5px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }
.areg__acts { display: flex; gap: 6px; button { font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border-color, #e5e7eb); background: var(--bg-primary, #fff); cursor: pointer; } }
.areg__msg { font-size: 12px; color: var(--text-muted, #878c99); margin: 4px 0; }
.areg__table { width: 100%; border-collapse: collapse; font-size: 12px; th, td { border: 1px solid var(--border-color, #e5e7eb); padding: 3px 5px; text-align: left; } th { background: color-mix(in srgb, currentColor 5%, transparent); } input { width: 100%; border: none; background: transparent; font: inherit; } }
.areg__raw { width: 100%; font-family: ui-monospace, monospace; font-size: 12px; }
</style>
