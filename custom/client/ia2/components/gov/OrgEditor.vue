<!-- overlay/custom/client/ia2/components/gov/OrgEditor.vue -->
<!-- P8 组织关系 UI（补遗④）：账号↔角色↔汇报线(lead)↔板↔matrix 可维护；保存即提交 org.md。
     离职三步向导：①任务移交 ②停用双账号 ③审计留痕（服务端原子序，逐步 commit 可回溯）。 -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchRegistry, saveRegistry, offboardAccount } from '@/custom/governance/api/adminRegistry'
import { parseFirstTable, setCellAlign } from '@/custom/governance/utils/registry-md'

const COLS = ['账号', '角色', '汇报线(lead)', '板（team）', 'matrix 账号']
const rows = ref<string[][]>([])
const preamble = ref<string[]>([]); const after = ref<string[]>([])
const commit = ref(''); const msg = ref(''); const busy = ref(false)
const wizard = ref<null | { step: number; name: string; handoverTo: string; taskIds: string; reason: string; adminToken: string; result: string }>(null)

async function load() {
  const doc = await fetchRegistry('org')
  commit.value = doc.commit
  const { table, preamble: p, after: a } = parseFirstTable(doc.markdown)
  rows.value = setCellAlign(table.rows, COLS.length)
  preamble.value = p; after.value = a
}
onMounted(() => { void load().catch(e => { msg.value = String(e) }) })

function addRow() { rows.value.push(['', '', '', '', '']) }
function delRow(i: number) { rows.value.splice(i, 1) }

async function save() {
  busy.value = true; msg.value = ''
  try {
    const md = [...preamble.value,
      `| ${COLS.join(' | ')} |`, `| ${COLS.map(() => '---').join(' | ')} |`,
      ...rows.value.map(r => `| ${r.join(' | ')} |`), ...after.value].join('\n')
    const r = await saveRegistry('org', md, `组织关系更新（${rows.value.length} 人）`)
    msg.value = `已保存提交 ${r.commit}`; commit.value = r.commit
  } catch (e) { msg.value = `保存失败：${String(e)}` } finally { busy.value = false }
}

function openWizard(name: string) { wizard.value = { step: 1, name, handoverTo: '', taskIds: '', reason: '', adminToken: '', result: '' } }
async function runWizard() {
  const w = wizard.value; if (!w) return
  busy.value = true
  try {
    w.step = 3
    const r = await offboardAccount({
      localName: w.name, handoverTo: w.handoverTo,
      taskIds: w.taskIds.split(/[,，\s]+/).filter(Boolean),
      reason: w.reason, adminToken: w.adminToken, homeserverUrl: 'http://127.0.0.1:8008',
    })
    w.result = `移交@${r.handoverCommit} · 停用 ${r.deactivated.join(' ')} · 留痕@${r.auditCommit}`
    await load()
  } catch (e) { if (w) w.result = `失败：${String(e)}` } finally { busy.value = false }
}
</script>

<template>
  <section class="oed" data-testid="org-editor">
    <div class="oed__hd">
      <h3>研发组织与权限 <span class="oed__meta">@{{ commit || '…' }}</span></h3>
      <div class="oed__acts">
        <button data-testid="oed-add" @click="addRow">＋ 新增成员</button>
        <button data-testid="oed-save" :disabled="busy" @click="save">保存（提交 git）</button>
      </div>
    </div>
    <p v-if="msg" class="oed__msg">{{ msg }}</p>
    <table class="oed__table">
      <thead><tr><th v-for="c in COLS" :key="c">{{ c }}</th><th /></tr></thead>
      <tbody>
        <tr v-for="(r, i) in rows" :key="i">
          <td v-for="(_, j) in COLS" :key="j"><input v-model="r[j]" /></td>
          <td class="oed__rowacts">
            <button :data-testid="`oed-del-${i}`" title="删除行" @click="delRow(i)">✕</button>
            <button :data-testid="`oed-offboard-${i}`" title="离职向导" @click="openWizard(r[0])">离职</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="wizard" class="oed__wiz" data-testid="offboard-wizard">
      <div class="oed__wiz-hd">离职三步向导：{{ wizard.name }}
        <button class="oed__wiz-x" @click="wizard = null">✕</button></div>
      <template v-if="wizard.step === 1">
        <p>① 任务移交——接手人与在办任务：</p>
        <input v-model="wizard.handoverTo" placeholder="接手人（如 chen）" data-testid="wiz-handover" />
        <input v-model="wizard.taskIds" placeholder="移交任务卡号，逗号分隔（可空）" />
        <input v-model="wizard.reason" placeholder="离职原因（入审计留痕）" />
        <button data-testid="wiz-next2" :disabled="!wizard.handoverTo" @click="wizard.step = 2">下一步：确认停用</button>
      </template>
      <template v-else-if="wizard.step === 2">
        <p>② 停用账号——输入 synapse 管理员 access token（操作以此鉴权）：</p>
        <input v-model="wizard.adminToken" type="password" placeholder="synapse admin access token" data-testid="wiz-token" />
        <button data-testid="wiz-back1" @click="wizard.step = 1">上一步</button>
        <button data-testid="wiz-run" :disabled="!wizard.adminToken || busy" @click="runWizard">执行：移交→停用→留痕</button>
      </template>
      <template v-else>
        <p>③ 完成：<span data-testid="wiz-result">{{ wizard.result }}</span></p>
        <button @click="wizard = null">关闭</button>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.oed__hd { display: flex; justify-content: space-between; gap: 8px; h3 { margin: 0; font-size: 13px; } }
.oed__meta { font-size: 10.5px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }
.oed__acts { display: flex; gap: 6px; button { font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border-color, #e5e7eb); background: var(--bg-primary, #fff); cursor: pointer; } }
.oed__msg { font-size: 12px; color: var(--text-muted, #878c99); margin: 4px 0; }
.oed__table { width: 100%; border-collapse: collapse; font-size: 12px; th, td { border: 1px solid var(--border-color, #e5e7eb); padding: 3px 5px; text-align: left; } input { width: 100%; border: none; background: transparent; font: inherit; } }
.oed__rowacts { white-space: nowrap; button { margin-right: 4px; cursor: pointer; border: 1px solid var(--border-color, #e5e7eb); border-radius: 5px; background: transparent; font-size: 11px; } }
.oed__wiz { margin-top: 10px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 10px 12px; input { display: block; width: 100%; margin: 4px 0; padding: 4px 8px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; } button { margin-top: 6px; margin-right: 6px; font-size: 12px; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border-color, #e5e7eb); cursor: pointer; } }
.oed__wiz-hd { font-weight: 600; font-size: 13px; margin-bottom: 4px; display: flex; justify-content: space-between; }
</style>
