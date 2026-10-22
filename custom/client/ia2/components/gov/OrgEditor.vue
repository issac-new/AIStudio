<!-- overlay/custom/client/ia2/components/gov/OrgEditor.vue -->
<!-- P8 组织关系 UI（补遗④）：账号↔角色↔汇报线(lead)↔板↔matrix 可维护；保存即提交 org.md。
     离职三步向导：①任务移交 ②停用双账号 ③审计留痕（服务端原子序，逐步 commit 可回溯）。 -->
<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { fetchRegistry, saveRegistry, offboardAccount, fetchOrgCosign, openOrgCosign, resolveOrgCosign, type OrgCosignPending } from '@/custom/governance/api/adminRegistry'
import { parseFirstTable, setCellAlign } from '@/custom/governance/utils/registry-md'
import { fetchMatrixServerInfo } from '../../matrix-server-info'

const COLS = ['账号', '角色', '汇报线(lead)', '板（team）', 'matrix 账号']
const rows = ref<string[][]>([])
const preamble = ref<string[]>([]); const after = ref<string[]>([])
const commit = ref(''); const msg = ref(''); const busy = ref(false)
const homeserverUrl = ref('')
const wizard = ref<null | { step: number; name: string; handoverTo: string; taskIds: string; reason: string; adminToken: string; result: string }>(null)
// 向导失败时第三步标题改「执行结果」（result 以「失败」前缀判定）
const wizardFailed = computed(() => !!wizard.value?.result?.startsWith('失败'))
// 治理者守卫（2026-10-22）：admin 行变更 409 后的会签/紧急通道对话框 + 待会签块
const guard = ref<null | { detail: string; markdown: string; message: string; reason: string }>(null)
const pending = ref<OrgCosignPending | null>(null)
const cosigner = ref(''); const cosignReason = ref('')

async function loadCosign() {
  try { pending.value = (await fetchOrgCosign()).pending } catch { pending.value = null }
}

async function load() {
  const doc = await fetchRegistry('org')
  commit.value = doc.commit
  const { table, preamble: p, after: a } = parseFirstTable(doc.markdown)
  rows.value = setCellAlign(table.rows, COLS.length)
  preamble.value = p; after.value = a
}
onMounted(() => {
  void load().catch(e => { msg.value = String(e) })
  void loadCosign()
  void fetchMatrixServerInfo().then(info => { homeserverUrl.value = info.homeserverUrl }).catch(() => {})
})

function addRow() { rows.value.push(['', '', '', '', '']) }
function delRow(i: number) { rows.value.splice(i, 1) }

async function save(breakGlass?: { reason: string }) {
  busy.value = true; msg.value = ''
  const md = [...preamble.value,
    `| ${COLS.join(' | ')} |`, `| ${COLS.map(() => '---').join(' | ')} |`,
    ...rows.value.map(r => `| ${r.join(' | ')} |`), ...after.value].join('\n')
  const message = `组织关系更新（${rows.value.length} 人）`
  try {
    const r = await saveRegistry('org', md, message, undefined,
      breakGlass ? { breakGlass: true, breakGlassReason: breakGlass.reason } : undefined)
    msg.value = `已保存提交 ${r.commit}${r.breakGlass ? '（紧急通道，已审计留痕）' : ''}`
    commit.value = r.commit; guard.value = null
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string }
    if (err?.code === 'org_needs_cosign') {
      guard.value = { detail: err.message || 'admin 行变更需双人确认', markdown: md, message, reason: '' }
      msg.value = '守卫拦截：admin 行（治理者）变更需双人会签或紧急通道'
    } else {
      msg.value = `保存失败：${String(e)}`
    }
  } finally { busy.value = false }
}

async function startCosign() {
  const g = guard.value; if (!g) return
  busy.value = true
  try {
    const r = await openOrgCosign({ markdown: g.markdown, message: g.message })
    msg.value = `会签单已发起（提交 ${r.commit}）——待另一位治理岗（admin/审计）在下方待会签块批准`
    guard.value = null; await loadCosign()
  } catch (e) { msg.value = `发起会签失败：${String(e)}` } finally { busy.value = false }
}

async function resolveCosign(action: 'approve' | 'reject') {
  busy.value = true
  try {
    const r = await resolveOrgCosign(action, cosigner.value, cosignReason.value)
    msg.value = action === 'approve'
      ? `会签落盘完成：org@${r.orgCommit ?? ''} 决议@${r.commit}（已审计留痕）`
      : `已驳回（决议@${r.commit}）`
    cosigner.value = ''; cosignReason.value = ''
    await load(); await loadCosign()
  } catch (e) { msg.value = `${action === 'approve' ? '批准' : '驳回'}失败：${String(e)}` } finally { busy.value = false }
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
      reason: w.reason, adminToken: w.adminToken, homeserverUrl: homeserverUrl.value,
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
        <button data-testid="oed-save" :disabled="busy" @click="save()">保存（提交 git）</button>
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

    <div v-if="guard" class="oed__wiz" data-testid="org-guard">
      <div class="oed__wiz-hd">治理者守卫：admin 行变更需双人确认
        <button class="oed__wiz-x" @click="guard = null">✕</button></div>
      <p class="oed__guard-detail" data-testid="org-guard-detail">{{ guard.detail }}</p>
      <p>① 双人会签：暂存本次变更，由另一位治理岗（编制内 admin 或 审计）批准后落盘。</p>
      <button data-testid="org-guard-cosign" :disabled="busy" @click="startCosign">发起会签</button>
      <p>② 紧急通道（break-glass）：单人立即落盘，理由强制写入审计留痕（事后可查）。</p>
      <input v-model="guard.reason" placeholder="紧急理由（必填，入审计留痕）" data-testid="org-guard-reason" />
      <button data-testid="org-guard-breakglass" :disabled="!guard.reason.trim() || busy"
        @click="save({ reason: guard.reason.trim() })">紧急落盘</button>
    </div>

    <div v-if="pending" class="oed__wiz" data-testid="org-cosign">
      <div class="oed__wiz-hd">待会签变更（{{ pending.initiator }} 发起 @{{ pending.created }}）</div>
      <p class="oed__guard-detail" v-for="d in pending.detail" :key="d">{{ d }}</p>
      <p>批准人须编制在册治理岗（admin 或 审计）且不等于发起人 {{ pending.initiator }}。</p>
      <input v-model="cosigner" placeholder="会签人账号（如 audit）" data-testid="org-cosign-approver" />
      <input v-model="cosignReason" placeholder="意见（批准可空，驳回必填）" data-testid="org-cosign-reason" />
      <button data-testid="org-cosign-approve" :disabled="!cosigner.trim() || busy"
        @click="resolveCosign('approve')">批准落盘</button>
      <button data-testid="org-cosign-reject" :disabled="!cosigner.trim() || !cosignReason.trim() || busy"
        @click="resolveCosign('reject')">驳回</button>
    </div>

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
        <button data-testid="wiz-run" :disabled="!wizard.adminToken || busy || !homeserverUrl" :title="!homeserverUrl ? 'matrix 服务地址未就绪（刷新页面重试）' : undefined" @click="runWizard">执行：移交→停用→留痕</button>
      </template>
      <template v-else>
        <p>{{ wizardFailed ? '③ 执行结果：' : '③ 完成：' }}<span data-testid="wiz-result">{{ wizard.result }}</span></p>
        <button @click="wizard = null">关闭</button>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.oed__hd { display: flex; justify-content: space-between; gap: 8px; h3 { margin: 0; font-size: 13px; } }
.oed__meta { font-size: 10.5px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.oed__acts { display: flex; gap: 6px; button { font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); cursor: pointer; } }
.oed__msg { font-size: 12px; color: var(--text-muted); margin: 4px 0; }
.oed__table { width: 100%; border-collapse: collapse; font-size: 12px; th, td { border: 1px solid var(--border-color); padding: 3px 5px; text-align: left; } input { width: 100%; border: none; background: transparent; font: inherit; } }
.oed__rowacts { white-space: nowrap; button { margin-right: 4px; cursor: pointer; border: 1px solid var(--border-color); border-radius: 5px; background: transparent; font-size: 11px; } }
.oed__wiz { margin-top: 10px; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; input { display: block; width: 100%; margin: 4px 0; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 6px; } button { margin-top: 6px; margin-right: 6px; font-size: 12px; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border-color); cursor: pointer; } p { font-size: 12px; margin: 4px 0; } }
.oed__wiz-x { margin-left: auto; }
.oed__guard-detail { white-space: pre-wrap; color: var(--text-muted); background: var(--bg-secondary); border-radius: 6px; padding: 6px 8px; }
.oed__wiz-hd { font-weight: 600; font-size: 13px; margin-bottom: 4px; display: flex; justify-content: space-between; }
</style>
