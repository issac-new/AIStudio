<!-- overlay/custom/client/ia2/views/AccountAdminView.vue -->
<!-- P6 账户管理（补遗④第 2 项）：matrix 系统管理员在此创建/分配账号（synapse 管理端 API），
     本机账号↔matrix 双账号绑定维护（roster），保存/建号即入仓提交（R13）。 -->
<script setup lang="ts">
import TabIntroBanner from '../components/TabIntroBanner.vue'
import { ref, onMounted } from 'vue'
import { fetchRegistry, saveRegistry, provisionAccount, createInvite, type InviteResult } from '@/custom/governance/api/adminRegistry'
import { parseFirstTable, setCellAlign } from '@/custom/governance/utils/registry-md'

const COLS = ['账号', 'AI 助理账号', '角色']
const rows = ref<string[][]>([]); const preamble = ref<string[]>([]); const after = ref<string[]>([])
const commit = ref(''); const msg = ref(''); const busy = ref(false)
const form = ref({ localName: '', role: '', password: '', adminToken: '', homeserverUrl: 'http://127.0.0.1:8008', withAgent: true })
// D20 邀请表单：口令由服务端生成，不经管理员之手
const inv = ref({ localName: '', role: '', adminToken: '', homeserverUrl: 'http://127.0.0.1:8008', withAgent: true, expiresInHours: 24 })
const inviteResult = ref<InviteResult | null>(null)
const invCopied = ref(false)
async function invite() {
  const f = inv.value
  if (!f.localName || !f.role || !f.adminToken) { msg.value = '用户名/角色/管理 token 均必填'; return }
  busy.value = true; msg.value = ''; inviteResult.value = null
  try {
    inviteResult.value = await createInvite({ ...f, withAgent: String(f.withAgent) })
    inv.value = { ...inv.value, localName: '', role: '' }
    await load()
  } catch (e) { msg.value = `邀请失败：${String(e)}` } finally { busy.value = false }
}
function copyInvite(): void {
  const r = inviteResult.value; if (!r) return
  const text = `SwarmStudio 账号邀请
Matrix 账号：${r.userId}
初始口令（一次性，请尽快登录后修改）：${r.initialPassword}
登录：打开 SwarmStudio 登录页 → Matrix 页签 → 服务器 ${inv.value.homeserverUrl} → 输入账号与初始口令 → 登录后到设置中修改密码。`
  void navigator.clipboard?.writeText(text).then(() => { invCopied.value = true; setTimeout(() => { invCopied.value = false }, 2000) })
}

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
  <TabIntroBanner tab="accounts" />
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

    <div class="aac__create" data-testid="aac-invite">
      <h3>邀请账号（口令由服务端生成，不经管理员之手）</h3>
      <div class="aac__grid">
        <label class="aac__field">本机账号名<input v-model="inv.localName" placeholder="如 zhang" data-testid="aac-inv-name" /></label>
        <label class="aac__field">角色<input v-model="inv.role" placeholder="如 研发·csw-pay-core" data-testid="aac-inv-role" /></label>
        <label class="aac__field">服务器地址<input v-model="inv.homeserverUrl" placeholder="homeserver URL" /></label>
        <label class="aac__field">有效期（小时）<input v-model.number="inv.expiresInHours" type="number" min="1" data-testid="aac-inv-exp" /></label>
        <label class="aac__field">管理员凭证<input v-model="inv.adminToken" type="password" placeholder="synapse 管理员 access token" data-testid="aac-inv-token" /></label>
        <label class="aac__check"><input v-model="inv.withAgent" type="checkbox" /> 同建 AI 助理账号</label>
      </div>
      <button data-testid="aac-inv-btn" :disabled="busy" @click="invite">生成邀请</button>
      <div v-if="inviteResult" class="aac__invres" data-testid="aac-inv-result">
        <p>已创建 <b>{{ inviteResult.created.join('、') }}</b>（台账提交 {{ inviteResult.invitesCommit.slice(0, 7) }}；{{ new Date(inviteResult.expires).toLocaleString() }} 过期）</p>
        <p class="aac__invcred">Matrix 账号：<code>{{ inviteResult.userId }}</code>　初始口令（一次性）：<code data-testid="aac-inv-pass">{{ inviteResult.initialPassword }}</code></p>
        <p class="aac__invhint">交付方式：复制下方邀请文本经安全渠道发送；被邀人在登录页 Matrix 页签首登后到设置改密。</p>
        <button data-testid="aac-inv-copy" @click="copyInvite">{{ invCopied ? '已复制 ✓' : '复制邀请文本' }}</button>
      </div>
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
.aac__meta { font-size: 11px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.aac__sub { font-size: 12px; color: var(--text-muted); margin: 0 0 12px; }
.aac__create { border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
.aac__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }
.aac__field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--text-muted); input { padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; } }
.aac__check { font-size: 12px; display: flex; align-items: end; gap: 4px; padding-bottom: 3px; }
.aac__create > button { margin-top: 8px; font-size: 12px; padding: 5px 14px; border-radius: 6px; border: 1px solid var(--primary-color); color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 8%, transparent); cursor: pointer; font-weight: 600; }
.aac__tbl h3 button { margin-left: 8px; font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border-color); cursor: pointer; }
table { width: 100%; border-collapse: collapse; font-size: 12px; th, td { border: 1px solid var(--border-color); padding: 3px 5px; text-align: left; } input { width: 100%; border: none; background: transparent; font: inherit; } }
.aac__tbl td:last-child, .aac__tbl th:last-child { width: 40px; text-align: center; }
.aac__tbl td button { border: none; background: none; color: var(--text-muted); cursor: pointer; font-size: 12px; opacity: .4; padding: 2px 6px; border-radius: 4px; }
.aac__tbl tr:hover td button { opacity: 1; }
.aac__tbl td button:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, transparent); }
.aac__msg { font-size: 12px; color: var(--text-muted); }
.aac__invres { margin-top: 10px; border: 1px dashed var(--primary-color); border-radius: 8px; padding: 8px 12px; p { margin: 4px 0; font-size: 12px; } }
.aac__invcred code { font-family: ui-monospace, monospace; background: var(--bg-secondary); padding: 1px 6px; border-radius: 4px; }
.aac__invhint { font-size: 11px !important; color: var(--text-muted); }
.aac__invres button { font-size: 12px; padding: 4px 14px; border-radius: 6px; border: 1px solid var(--primary-color); color: var(--primary-color); background: transparent; cursor: pointer; }
</style>
