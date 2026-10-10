<!-- overlay/custom/client/ia2/views/AccountAdminView.vue -->
<!-- P6 账户管理（补遗④第 2 项）：matrix 系统管理员在此创建/分配账号（synapse 管理端 API），
     本机账号↔matrix 双账号绑定维护（roster），保存/建号即入仓提交（R13）。 -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { fetchRegistry, saveRegistry, provisionAccount } from '@/custom/governance/api/adminRegistry'
import { parseFirstTable, setCellAlign } from '@/custom/governance/utils/registry-md'

const COLS = ['账号', 'AI 助理账号', '角色']
const rows = ref<string[][]>([]); const preamble = ref<string[]>([]); const after = ref<string[]>([])
const commit = ref(''); const msg = ref(''); const busy = ref(false)
const form = ref({ localName: '', role: '', password: '', adminToken: '', homeserverUrl: 'http://127.0.0.1:8008', withAgent: true })

async function load() {
  const doc = await fetchRegistry('roster')
  commit.value = doc.commit
  const { table, preamble: p, after: a } = parseFirstTable(doc.markdown)
  rows.value = setCellAlign(table.rows, COLS.length); preamble.value = p; after.value = a
}
onMounted(() => { void load().catch(e => { msg.value = String(e) }) })

async function create() {
  const f = form.value
  if (!f.localName || !f.role || !f.password || !f.adminToken) { msg.value = '用户名/角色/初始密码/管理 token 均必填'; return }
  busy.value = true; msg.value = ''
  try {
    const r = await provisionAccount({ ...f, withAgent: String(f.withAgent) })
    msg.value = `已创建 ${r.created.join('、')}；roster 提交 ${r.rosterCommit}`
    form.value = { ...form.value, localName: '', role: '', password: '' }
    await load()
  } catch (e) { msg.value = `创建失败：${String(e)}` } finally { busy.value = false }
}

async function saveRoster() {
  busy.value = true; msg.value = ''
  try {
    const md = [...preamble.value, `| ${COLS.join(' | ')} |`, `| ${COLS.map(() => '---').join(' | ')} |`,
      ...rows.value.map(r => `| ${r.join(' | ')} |`), ...after.value].join('\n')
    const r = await saveRegistry('roster', md, '账户绑定关系更新')
    msg.value = `已保存提交 ${r.commit}`; commit.value = r.commit
  } catch (e) { msg.value = `保存失败：${String(e)}` } finally { busy.value = false }
}
function delRow(i: number) { rows.value.splice(i, 1) }
</script>

<template>
  <div class="aac" data-testid="account-admin">
    <h2>设置 · 账户管理 <span class="aac__meta">中央仓 @{{ commit || '…' }}</span></h2>
    <p class="aac__sub">matrix 系统管理员功能：创建/分配 matrix 账号（人类+AI 助理双账号），维护本机账号 ↔ matrix 账号绑定；一切变更提交中央仓可回溯。</p>

    <div class="aac__create" data-testid="aac-create">
      <h3>新建账号</h3>
      <div class="aac__grid">
        <label class="aac__field">本机账号名<input v-model="form.localName" placeholder="如 zhang" data-testid="aac-name" /></label>
        <label class="aac__field">角色<input v-model="form.role" placeholder="如 研发·csw-pay-core" data-testid="aac-role" /></label>
        <label class="aac__field">初始密码<input v-model="form.password" type="password" placeholder="安全渠道另行下发" /></label>
        <label class="aac__field">服务器地址<input v-model="form.homeserverUrl" placeholder="homeserver URL" /></label>
        <label class="aac__field">管理员凭证<input v-model="form.adminToken" type="password" placeholder="synapse 管理员 access token" data-testid="aac-token" /></label>
        <label class="aac__check"><input v-model="form.withAgent" type="checkbox" /> 同建 AI 助理账号</label>
      </div>
      <button data-testid="aac-create-btn" :disabled="busy" @click="create">创建账号</button>
    </div>

    <div class="aac__tbl">
      <h3>账号绑定
        <button data-testid="aac-save" :disabled="busy" title="保存并提交到中央仓（可回溯）" @click="saveRoster">保存修改</button></h3>
      <table>
        <thead><tr><th v-for="c in COLS" :key="c">{{ c }}</th><th /></tr></thead>
        <tbody>
          <tr v-for="(r, i) in rows" :key="i">
            <td v-for="(_, j) in COLS" :key="j"><input v-model="r[j]" :data-testid="`aac-cell-${i}-${j}`" /></td>
            <td><button :data-testid="`aac-del-${i}`" @click="delRow(i)">✕</button></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="msg" class="aac__msg" data-testid="aac-msg">{{ msg }}</p>
  </div>
</template>

<style scoped lang="scss">
.aac { padding: 14px 18px; overflow: auto; h2 { margin: 0 0 4px; font-size: 16px; } h3 { font-size: 13px; margin: 0 0 6px; } }
.aac__meta { font-size: 11px; color: var(--text-muted, #878c99); font-family: ui-monospace, monospace; }
.aac__sub { font-size: 12px; color: var(--text-muted, #878c99); margin: 0 0 12px; }
.aac__create { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
.aac__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.aac__field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--text-muted, #878c99); input { padding: 5px 8px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; font-size: 12px; } }
.aac__check { font-size: 12px; display: flex; align-items: end; gap: 4px; padding-bottom: 3px; }
.aac__create > button { margin-top: 8px; font-size: 12px; padding: 5px 14px; border-radius: 6px; border: 1px solid var(--primary-color, #3b82f6); color: var(--primary-color, #3b82f6); background: color-mix(in srgb, var(--primary-color, #3b82f6) 8%, transparent); cursor: pointer; font-weight: 600; }
.aac__tbl h3 button { margin-left: 8px; font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border-color, #e5e7eb); cursor: pointer; }
table { width: 100%; border-collapse: collapse; font-size: 12px; th, td { border: 1px solid var(--border-color, #e5e7eb); padding: 3px 5px; text-align: left; } input { width: 100%; border: none; background: transparent; font: inherit; } }
.aac__tbl td:last-child, .aac__tbl th:last-child { width: 40px; text-align: center; }
.aac__tbl td button { border: none; background: none; color: var(--text-muted, #878c99); cursor: pointer; font-size: 12px; opacity: .4; padding: 2px 6px; border-radius: 4px; }
.aac__tbl tr:hover td button { opacity: 1; }
.aac__tbl td button:hover { color: var(--danger, #dc2626); background: color-mix(in srgb, var(--danger, #dc2626) 8%, transparent); }
.aac__msg { font-size: 12px; color: var(--text-muted, #878c99); }
</style>
