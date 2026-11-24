<!-- overlay/custom/client/ia2/components/gov/OrgEditor.vue -->
<!-- P8 组织关系 UI（补遗④）：账号↔角色↔汇报线(lead)↔板↔matrix 可维护；保存即提交 org.md。
     离职三步向导（批一 Task 10）：①前置检查（只读，收齐信息含管理员令牌与接手执行单元）
     ②确认停用 ③执行结果——执行序：前置检查 → 逐卡改派（不回收在跑任务）→ 离职；
     半完成（已改派但离职失败）列出已改派的卡并提供「改回原指派对象」。 -->
<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchRegistry, saveRegistry, offboardAccount, fetchOrgCosign, openOrgCosign, resolveOrgCosign, type OrgCosignPending } from '@/custom/governance/api/adminRegistry'
import { request } from '@/api/client'
import { getTask, reassignTask, getAssignees } from '@/api/hermes/kanban'
import { parseFirstTable, setCellAlign } from '@/custom/governance/utils/registry-md'
import { fetchMatrixServerInfo } from '../../matrix-server-info'

// 离职向导文案（批一 Task 10）：中英双语内联字典（沿用 WorkUnitLedgerSection 先例）；
// 只覆盖本向导的文案，组件其余存量文案不在本任务范围。
const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))
const T = computed(() => zh.value ? {
  wizTitle: '离职三步向导',
  step1: '① 任务移交——收齐信息（接手人、任务卡、接手执行单元、管理员令牌）：',
  handoverTo: '接手人（如 chen）',
  taskIds: '移交任务卡号，逗号分隔（可空）',
  reason: '离职原因（入审计留痕）',
  profileLabel: '接手执行单元（可选，逐卡改派在办任务卡）',
  profileNone: '不改派（仅登记）',
  adminToken: 'synapse admin access token（操作以此鉴权）',
  next2: '下一步：确认停用',
  step2: '② 确认停用——执行序：前置检查 → 逐卡改派 → 离职（停用双账号并留痕）：',
  back1: '上一步',
  run: '执行：前置检查→改派→离职',
  runNeedHomeserver: 'matrix 服务地址未就绪（刷新页面重试）',
  step3: '③ 完成：',
  step3Fail: '③ 执行结果：',
  blockedTitle: '前置检查未通过——仍有在岗执行单元，先完成退役交接：',
  precheckBlocked: '前置检查未通过：仍有在岗执行单元',
  handoverTitle: '逐卡改派核实（服务端）：',
  personLinked: '自然人联动：已随离职停用',
  personNotLinked: '自然人联动：无命中登记自然人（not-linked）',
  revertTitle: '已改派的卡（离职未完成，可逐卡改回）：',
  revert: '改回原指派对象',
  reverted: '已改回',
  close: '关闭',
} : {
  wizTitle: 'Offboarding wizard',
  step1: '① Handover — collect everything (successor, task cards, handover profile, admin token):',
  handoverTo: 'Successor (e.g. chen)',
  taskIds: 'Task card ids, comma-separated (optional)',
  reason: 'Reason (written to audit trail)',
  profileLabel: 'Handover work profile (optional; reassigns task cards one by one)',
  profileNone: 'No reassignment (register only)',
  adminToken: 'Synapse admin access token (authorizes this operation)',
  next2: 'Next: confirm deactivation',
  step2: '② Confirm deactivation — order: precheck → per-card reassign → offboard (deactivate both accounts, audit):',
  back1: 'Back',
  run: 'Run: precheck → reassign → offboard',
  runNeedHomeserver: 'Matrix homeserver URL not ready (reload the page)',
  step3: '③ Done: ',
  step3Fail: '③ Result: ',
  blockedTitle: 'Precheck blocked — active work units must finish retirement handover first:',
  precheckBlocked: 'Precheck blocked: active work units remain',
  handoverTitle: 'Per-card reassignment verification (server):',
  personLinked: 'Linked person: deactivated with offboarding',
  personNotLinked: 'Linked person: no registered person matched (not-linked)',
  revertTitle: 'Reassigned cards (offboarding incomplete — revert one by one):',
  revert: 'Revert to original assignee',
  reverted: 'Reverted',
  close: 'Close',
})

const COLS = ['账号', '角色', '汇报线(lead)', '板（team）', 'matrix 账号']
const rows = ref<string[][]>([])
const preamble = ref<string[]>([]); const after = ref<string[]>([])
const commit = ref(''); const msg = ref(''); const busy = ref(false)
const homeserverUrl = ref('')
const wizard = ref<WizardState | null>(null)
// 向导失败时第三步标题改「执行结果」（result 以「失败」前缀判定；前置检查被拦同属未执行）
const wizardFailed = computed(() => !!wizard.value?.result?.startsWith('失败') || !!wizard.value?.blocked.length)
// 治理者守卫（2026-10-22）：admin 行变更 409 后的会签/紧急通道对话框 + 待会签块
const guard = ref<null | { detail: string; markdown: string; message: string; reason: string }>(null)
const pending = ref<OrgCosignPending | null>(null)
const cosignReason = ref('')

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
    // adminRegistry 旧签名中的 approver 由服务端忽略；身份仅取当前登录会话。
    const r = await resolveOrgCosign(action, '', cosignReason.value)
    msg.value = action === 'approve'
      ? `会签落盘完成：org@${r.orgCommit ?? ''} 决议@${r.commit}（已审计留痕）`
      : `已驳回（决议@${r.commit}）`
    cosignReason.value = ''
    await load(); await loadCosign()
  } catch (e) { msg.value = `${action === 'approve' ? '批准' : '驳回'}失败：${String(e)}` } finally { busy.value = false }
}

function openWizard(name: string) {
  wizard.value = {
    step: 1, name, handoverTo: '', taskIds: '', reason: '', adminToken: '', handoverProfile: '',
    result: '', blocked: [], reassigned: [], reassignNotes: [], taskHandover: [], person: null,
  }
  // 接手执行单元候选=既有指派对象列表接口；取不到不阻断向导（下拉只剩「不改派」）
  void getAssignees().then(list => { assignees.value = list.map(a => a.name) }).catch(() => { assignees.value = [] })
}

// 离职向导（批一 Task 10）状态：前置检查被拦名单、已改派卡（含原指派对象，供半完成改回）、
// 改派失败记录、离职响应的逐卡核实与自然人联动。
interface OffboardBlockedUnit { identityId: string; name: string; stage: string }
interface OffboardPersonLink { status: string; personId?: string }
interface TaskHandoverRow { taskId: string; before: string | null; after: string | null; reassigned: boolean; note: string }
interface ReassignedCard { taskId: string; before: string | null; reverted: boolean }
interface WizardState {
  step: number; name: string; handoverTo: string; taskIds: string; reason: string
  adminToken: string; handoverProfile: string; result: string
  blocked: OffboardBlockedUnit[]; reassigned: ReassignedCard[]
  reassignNotes: string[]; taskHandover: TaskHandoverRow[]; person: OffboardPersonLink | null
}
/** 离职响应（Task 7 起含 taskHandover/person；adminRegistry 类型未扩，本地补齐可选键） */
interface OffboardResponse {
  handoverCommit: string; deactivated: string[]; auditCommit: string
  taskHandover?: TaskHandoverRow[]; person?: OffboardPersonLink
}
const assignees = ref<string[]>([])

async function runWizard() {
  const w = wizard.value; if (!w) return
  busy.value = true
  try {
    w.step = 3
    const taskIds = w.taskIds.split(/[,，\s]+/).filter(Boolean)
    const inp = {
      localName: w.name, handoverTo: w.handoverTo, taskIds,
      reason: w.reason, adminToken: w.adminToken, homeserverUrl: homeserverUrl.value,
    }
    // ① 前置检查（只读）：仍有在岗执行单元即止步——不发起改派与离职，名单如实展示
    const pre = await request<{ ok: boolean; blockedUnits?: OffboardBlockedUnit[]; person?: OffboardPersonLink }>(
      '/api/governance/matrix-offboard/precheck',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inp) })
    if (pre.blockedUnits?.length) {
      w.blocked = pre.blockedUnits
      w.result = `${T.value.precheckBlocked}（${pre.blockedUnits.length}）`
      return
    }
    // ② 逐卡改派：不回收在跑任务——调用不得带 reclaim（规格 D10/D13），运行中的卡被看板
    //    拒绝后如实记录并继续，由离职端点只读核实标「未改派」。原指派对象在改派前用
    //    getTask 取一次（前置检查响应不带任务信息），供半完成状态「改回原指派对象」。
    const profile = w.handoverProfile.trim()
    if (profile && taskIds.length) {
      for (const taskId of taskIds) {
        let before: string | null = null
        try { before = (await getTask(taskId)).task.assignee ?? null } catch { before = null }
        try {
          await reassignTask(taskId, profile, { reason: '离职移交' })
          w.reassigned.push({ taskId, before, reverted: false })
        } catch (e) {
          w.reassignNotes.push(`${taskId}：${String(e instanceof Error ? e.message : e)}`)
        }
      }
    }
    // ③ 离职：服务端再做同款前置检查（防两次调用间状态变化）、逐卡核实改派结果并联动自然人
    const r: OffboardResponse = await offboardAccount({ ...inp, handoverProfile: profile || undefined })
    w.result = `移交@${r.handoverCommit} · 停用 ${r.deactivated.join(' ')} · 留痕@${r.auditCommit}`
    w.taskHandover = r.taskHandover ?? []
    w.person = r.person ?? null
    await load()
  } catch (e) { if (w) w.result = `失败：${String(e)}` } finally { busy.value = false }
}

// 半完成恢复：离职失败但已有改派时，逐卡以原指派对象调同一改派接口改回（同样不回收）
async function revertCard(card: ReassignedCard) {
  const w = wizard.value; if (!w || card.reverted || !card.before) return
  busy.value = true
  try {
    await reassignTask(card.taskId, card.before, { reason: '离职中止改回' })
    card.reverted = true
  } catch (e) {
    w.reassignNotes.push(`${card.taskId} 改回失败：${String(e instanceof Error ? e.message : e)}`)
  } finally { busy.value = false }
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
    <p class="oed__hint" data-testid="org-editor-board-hint">
      「板（team）」列填板 slug（可带括号角色注记，如 <code>bella-req-intake(requirements-analyst)</code>），按原文提交；看板中文名在看板页查看。
    </p>
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
      <p>批准人须为当前登录的编制在册治理岗（admin 或 审计），且不等于发起人 {{ pending.initiator }}。</p>
      <input v-model="cosignReason" placeholder="意见（批准可空，驳回必填）" data-testid="org-cosign-reason" />
      <button data-testid="org-cosign-approve" :disabled="busy"
        @click="resolveCosign('approve')">以当前登录人批准落盘</button>
      <button data-testid="org-cosign-reject" :disabled="!cosignReason.trim() || busy"
        @click="resolveCosign('reject')">以当前登录人驳回</button>
    </div>

    <div v-if="wizard" class="oed__wiz" data-testid="offboard-wizard">
      <div class="oed__wiz-hd">{{ T.wizTitle }}：{{ wizard.name }}
        <button class="oed__wiz-x" @click="wizard = null">✕</button></div>
      <template v-if="wizard.step === 1">
        <p>{{ T.step1 }}</p>
        <input v-model="wizard.handoverTo" :placeholder="T.handoverTo" data-testid="wiz-handover" />
        <input v-model="wizard.taskIds" :placeholder="T.taskIds" data-testid="wiz-tasks" />
        <input v-model="wizard.reason" :placeholder="T.reason" data-testid="wiz-reason" />
        <label class="oed__wiz-label">{{ T.profileLabel }}
          <select v-model="wizard.handoverProfile" data-testid="wiz-profile">
            <option value="">{{ T.profileNone }}</option>
            <option v-for="a in assignees" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>
        <input v-model="wizard.adminToken" type="password" :placeholder="T.adminToken" data-testid="wiz-token" />
        <button data-testid="wiz-next2" :disabled="!wizard.handoverTo || !wizard.adminToken" @click="wizard.step = 2">{{ T.next2 }}</button>
      </template>
      <template v-else-if="wizard.step === 2">
        <p>{{ T.step2 }}</p>
        <button data-testid="wiz-back1" @click="wizard.step = 1">{{ T.back1 }}</button>
        <button data-testid="wiz-run" :disabled="!wizard.adminToken || busy || !homeserverUrl" :title="!homeserverUrl ? T.runNeedHomeserver : undefined" @click="runWizard">{{ T.run }}</button>
      </template>
      <template v-else>
        <p>{{ wizardFailed ? T.step3Fail : T.step3 }}<span data-testid="wiz-result">{{ wizard.result }}</span></p>
        <div v-if="wizard.blocked.length" data-testid="wiz-blocked">
          <p>{{ T.blockedTitle }}</p>
          <p v-for="u in wizard.blocked" :key="u.identityId" class="oed__wiz-detail">{{ u.name }}（{{ u.identityId }}，{{ u.stage }}）</p>
        </div>
        <div v-if="wizard.taskHandover.length" data-testid="wiz-handover">
          <p>{{ T.handoverTitle }}</p>
          <p v-for="row in wizard.taskHandover" :key="row.taskId" class="oed__wiz-detail">{{ row.taskId }}：{{ row.note }}</p>
        </div>
        <div v-if="wizard.reassignNotes.length" data-testid="wiz-reassign-notes">
          <p v-for="n in wizard.reassignNotes" :key="n" class="oed__wiz-detail">{{ n }}</p>
        </div>
        <p v-if="wizard.person" data-testid="wiz-person">
          {{ wizard.person.status === 'deactivated' ? `${T.personLinked}（${wizard.person.personId}）` : T.personNotLinked }}
        </p>
        <div v-if="wizardFailed && wizard.reassigned.length" data-testid="wiz-revert">
          <p>{{ T.revertTitle }}</p>
          <p v-for="card in wizard.reassigned" :key="card.taskId" class="oed__wiz-detail">
            {{ card.taskId }} → {{ card.before }}
            <button v-if="!card.reverted" :data-testid="`wiz-revert-${card.taskId}`" :disabled="busy || !card.before" @click="revertCard(card)">{{ T.revert }}</button>
            <span v-else>{{ T.reverted }}</span>
          </p>
        </div>
        <button @click="wizard = null">{{ T.close }}</button>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.oed__hd { display: flex; justify-content: space-between; gap: 8px; h3 { margin: 0; font-size: 13px; } }
.oed__meta { font-size: 10.5px; color: var(--text-muted); font-family: ui-monospace, monospace; }
.oed__acts { display: flex; gap: 6px; button { font-size: 12px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-primary); cursor: pointer; } }
.oed__msg { font-size: 12px; color: var(--text-muted); margin: 4px 0; }
.oed__hint { font-size: 11.5px; color: var(--text-muted); margin: 6px 0 4px; background: var(--bg-secondary); border-radius: 6px; padding: 5px 8px; code { font-family: ui-monospace, monospace; font-size: 11px; } }
.oed__table { width: 100%; border-collapse: collapse; font-size: 12px; th, td { border: 1px solid var(--border-color); padding: 3px 5px; text-align: left; } input { width: 100%; border: none; background: transparent; font: inherit; } }
.oed__rowacts { white-space: nowrap; button { margin-right: 4px; cursor: pointer; border: 1px solid var(--border-color); border-radius: 5px; background: transparent; font-size: 11px; } }
.oed__wiz { margin-top: 10px; border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; input { display: block; width: 100%; margin: 4px 0; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 6px; } button { margin-top: 6px; margin-right: 6px; font-size: 12px; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border-color); cursor: pointer; } p { font-size: 12px; margin: 4px 0; } }
.oed__wiz-label { display: block; font-size: 12px; margin: 4px 0; select { display: block; width: 100%; margin-top: 2px; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); font: inherit; } }
.oed__wiz-detail { color: var(--text-muted); }
.oed__wiz-x { margin-left: auto; }
.oed__guard-detail { white-space: pre-wrap; color: var(--text-muted); background: var(--bg-secondary); border-radius: 6px; padding: 6px 8px; }
.oed__wiz-hd { font-weight: 600; font-size: 13px; margin-bottom: 4px; display: flex; justify-content: space-between; }
</style>
