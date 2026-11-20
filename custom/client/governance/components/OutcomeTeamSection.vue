<!-- overlay/custom/client/governance/components/OutcomeTeamSection.vue -->
<!-- 结果团队面（批三 T6，设计 §4.6/§5.1）：按根任务或 outcomeId 查结果合同，消费
     GET /:id 扩展面（team 面）。纪律：
     - draft 与 null 两态分文案：null=从未落 team.json（尚未建立团队记录）；
       draft=候选提案待 owner 显式确认（候选不自动成队）；active=已确认。
     - owner 确认走 PUT /:id/team：changeReason 必填（前端先拦）、expectedVersion=当前
       团队版本（无团队首次确认为 0）、status=active；409 version_conflict 提示刷新重试
       （乐观并发，他人先一步确认）；服务端 owner/active 名单/roster 约束终裁（403/422）。
     - 成员编辑以当前（候选）团队为底：确认即原样提交候选成员转 active；无团队记录时
       可手工录入首版成员——不伪造「系统已派生候选」。
     - 界面诚实态：高风险警示色（不用绿色）；中文文案＋英文标识符。
     功能门关（OUTCOME_WORKBENCH≠1）整段不渲染。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getStoredUsername } from '@/api/client'
import {
  confirmOutcomeTeam, resolveOutcomeFace, ApiError, OrgWorkbenchDisabledError,
  type OutcomeTeam, type OutcomeTeamFace, type OutcomeTeamMember, type TeamSubjectKind,
} from '@/custom/governance/api/org-workbench'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))

/** 登录名即 actor（服务端 actorOf 同口径：ctx.state.user.username）。 */
const actor = getStoredUsername() ?? ''

const gateOff = ref(false)
const input = ref('')
const face = ref<OutcomeTeamFace | null>(null)
const loadError = ref('')
const busy = ref(false)
/** 成员编辑底稿：确认提交的正身（从当前团队初始化，可增删改行）。 */
const memberRows = ref<OutcomeTeamMember[]>([])
const changeReason = ref('')
const formErr = ref('')
const conflict = ref(false)
const actionMsg = ref('')

const STATUS_LABEL: Record<string, string> = { draft: '草稿', active: '生效', observing: '观察期', settled: '已结算', cancelled: '已取消' }

async function load(): Promise<void> {
  if (busy.value) return
  busy.value = true
  loadError.value = ''
  conflict.value = false
  formErr.value = ''
  actionMsg.value = ''
  face.value = null
  try {
    const f = await resolveOutcomeFace(input.value)
    if (!f) {
      loadError.value = `未找到输入「${input.value.trim()}}」对应的结果合同（先按 outcomeId 直查，再按根任务 id 解析，两路皆空）`
      return
    }
    face.value = f
    memberRows.value = f.team ? f.team.members.map((m) => ({ ...m })) : []
    changeReason.value = ''
  } catch (err) {
    if (err instanceof OrgWorkbenchDisabledError) gateOff.value = true
    else loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

/** 刷新：按已解析 outcomeId 重拉 team 面（409 冲突后取他人确认后的最新态）。 */
async function refreshFace(): Promise<void> {
  if (!face.value) return
  const outcomeId = face.value.contract.outcomeId
  const prevInput = input.value
  input.value = outcomeId
  await load()
  input.value = prevInput
}

const contract = computed(() => face.value?.contract ?? null)
const team = computed<OutcomeTeam | null>(() => face.value?.team ?? null)
/** 前端按登录名比对 owner（服务端另有 active 名单守卫，403 终裁——OutcomeSection 同口径）。 */
const isOwner = computed(() => !!contract.value && actor !== '' && actor === contract.value.ownerPersonId)
/** 提交用的乐观并发版本：无团队首次确认为 0（服务端非负整数守卫）。 */
const expectedVersion = computed(() => team.value?.version ?? 0)

function addRow(): void {
  memberRows.value.push({ subjectKind: 'person', subjectId: '', role: '', responsibility: '' })
}
function removeRow(i: number): void {
  memberRows.value.splice(i, 1)
}

async function confirmTeam(): Promise<void> {
  formErr.value = ''
  conflict.value = false
  actionMsg.value = ''
  if (!contract.value) return
  if (!changeReason.value.trim()) {
    formErr.value = '变更理由必填（changeReason，随 team_confirmed 事件落账）'
    return
  }
  if (memberRows.value.length === 0) {
    formErr.value = '成员不可为空（至少一名成员；owner 与验证责任人须各有一名对应成员——服务端校验终裁）'
    return
  }
  busy.value = true
  try {
    const next = await confirmOutcomeTeam(contract.value.outcomeId, {
      expectedVersion: expectedVersion.value,
      members: memberRows.value,
      status: 'active',
      changeReason: changeReason.value.trim(),
    })
    actionMsg.value = `团队已确认 v${next.version}（team_confirmed 事件已落账）`
    // 回显服务端返回的团队正身（PUT 响应即权威）；再次查询走「刷新」按钮
    if (face.value) face.value = { ...face.value, team: next }
    changeReason.value = ''
  } catch (err) {
    if (err instanceof ApiError && err.code === 'version_conflict') conflict.value = true
    else formErr.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

const T = computed(() => zh.value ? {
  title: '团队与责任分工',
  sub: '结果合同的团队面：成员＝自然人（person）/Agent（agent）；责任由 role 承载（accountable/reviewer 等）——owner 与验证责任人必须各有一名对应成员',
  inputPh: 'outcomeId 或根任务 id', load: '查询', refresh: '刷新',
  stateNone: '尚未建立团队记录——团队须由 owner 显式确认（候选不自动成队）',
  stateDraft: (v: number) => `候选团队（draft v${v}）待 owner 确认——确认后转 active 并落事件账`,
  stateActive: (v: number) => `已确认团队 v${v}`,
  stateClosed: '团队已解散（closed）',
  member: '成员', subjectKind: '主体类型', subjectId: '主体 id', role: '角色', responsibility: '责任',
  person: '自然人', agent: 'Agent',
  addMember: '＋ 添加成员', remove: '删除',
  reasonPh: '变更理由（必填，随事件落账）',
  confirmBtn: '确认团队（转 active）',
  highRisk: '高风险结果：owner 与验证责任人须为不同在岗自然人（服务端校验终裁）',
  authz: (a: string, o: string) => `仅结果责任人（owner: ${o}）可确认团队（当前登录：${a || '未登录'}）`,
} : {
  title: 'Team & Accountability',
  sub: 'Team face of an outcome contract: members are persons or agents; accountability is carried by roles — owner and verifier must each have a matching member',
  inputPh: 'outcomeId or root task id', load: 'Load', refresh: 'Refresh',
  stateNone: 'No team record yet — a team becomes effective only after explicit owner confirmation',
  stateDraft: (v: number) => `Candidate team (draft v${v}) awaiting owner confirmation`,
  stateActive: (v: number) => `Confirmed team v${v}`,
  stateClosed: 'Team closed',
  member: 'Member', subjectKind: 'Subject kind', subjectId: 'Subject id', role: 'Role', responsibility: 'Responsibility',
  person: 'person', agent: 'agent',
  addMember: '＋ Add member', remove: 'Remove',
  reasonPh: 'Change reason (required, recorded in the event ledger)',
  confirmBtn: 'Confirm team (to active)',
  highRisk: 'High-risk outcome: owner and verifier must be different active persons (enforced server-side)',
  authz: (a: string, o: string) => `Only the owner (${o}) can confirm the team (signed in: ${a || 'anonymous'})`,
})
</script>

<template>
  <section v-if="!gateOff" class="ot" data-testid="org-team-section">
    <div class="ot__bar">
      <h3 class="ot__title">{{ T.title }}</h3>
      <button v-if="face" type="button" :disabled="busy" data-testid="org-team-refresh" @click="refreshFace()">{{ T.refresh }}</button>
    </div>
    <p class="ot__sub">{{ T.sub }}</p>
    <div class="ot__query">
      <input
        v-model="input"
        type="text"
        :placeholder="T.inputPh"
        data-testid="org-team-input"
        @keydown.enter="load()"
      />
      <button type="button" :disabled="busy" data-testid="org-team-load" @click="load()">{{ busy ? '…' : T.load }}</button>
    </div>
    <p v-if="loadError" class="ot__err" data-testid="org-team-error">{{ loadError }}</p>

    <template v-if="contract">
      <div class="ot__head">
        <strong>{{ contract.title }}</strong>
        <span class="ot__status">{{ STATUS_LABEL[contract.status] ?? contract.status }}</span>
        <span>合同 v{{ contract.version }}</span>
        <span>owner {{ contract.ownerPersonId }} · 验证 {{ contract.verificationOwnerId }}</span>
      </div>
      <p v-if="contract.riskTier === 'high'" class="ot__highrisk is-risk-high" data-testid="org-team-highrisk">{{ T.highRisk }}</p>

      <p v-if="team === null" class="ot__state ot__state--none" data-testid="org-team-none">{{ T.stateNone }}</p>
      <p v-else-if="team.status === 'draft'" class="ot__state ot__state--draft" data-testid="org-team-draft">{{ T.stateDraft(team.version) }}</p>
      <p v-else-if="team.status === 'active'" class="ot__state ot__state--active" data-testid="org-team-active">{{ T.stateActive(team.version) }}</p>
      <p v-else class="ot__state" data-testid="org-team-closed">{{ T.stateClosed }}</p>

      <table v-if="team && team.members.length" class="ot__table" data-testid="org-team-members">
        <thead>
          <tr><th>{{ T.subjectKind }}</th><th>{{ T.subjectId }}</th><th>{{ T.role }}</th><th>{{ T.responsibility }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="m in team.members" :key="`${m.subjectKind}:${m.subjectId}`" :data-testid="`org-team-member-${m.subjectId}`">
            <td><span class="ot__kind" :class="m.subjectKind === 'person' ? 'is-person' : 'is-agent'">{{ m.subjectKind === 'person' ? T.person : T.agent }}</span></td>
            <td>{{ m.subjectId }}</td>
            <td>{{ m.role }}</td>
            <td>{{ m.responsibility }}</td>
          </tr>
        </tbody>
      </table>

      <!-- 确认面（owner）：成员编辑底稿＋changeReason 必填；409 提示刷新重试 -->
      <div class="ot__confirm">
        <div class="ot__confirm-head">{{ T.confirmBtn }}（expectedVersion v{{ expectedVersion }}）</div>
        <table class="ot__table ot__edit">
          <thead>
            <tr><th>{{ T.subjectKind }}</th><th>{{ T.subjectId }}</th><th>{{ T.role }}</th><th>{{ T.responsibility }}</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="(m, i) in memberRows" :key="i" :data-testid="`org-team-row-${i}`">
              <td>
                <select v-model="m.subjectKind">
                  <option value="person">person</option>
                  <option value="agent">agent</option>
                </select>
              </td>
              <td><input v-model="m.subjectId" type="text" :data-testid="`org-team-row-${i}-subject`" /></td>
              <td><input v-model="m.role" type="text" /></td>
              <td><input v-model="m.responsibility" type="text" /></td>
              <td><button type="button" @click="removeRow(i)">{{ T.remove }}</button></td>
            </tr>
          </tbody>
        </table>
        <button type="button" class="ot__add" @click="addRow()">{{ T.addMember }}</button>
        <textarea
          v-model="changeReason"
          rows="2"
          :placeholder="T.reasonPh"
          data-testid="org-team-reason"
        />
        <button
          type="button"
          class="ot__btn"
          :disabled="busy || !isOwner"
          data-testid="org-team-confirm"
          @click="confirmTeam()"
        >{{ T.confirmBtn }}</button>
        <p v-if="!isOwner" class="ot__authz" data-testid="org-team-authz">{{ T.authz(actor, contract.ownerPersonId) }}</p>
        <p v-if="formErr" class="ot__err" data-testid="org-team-formerr">{{ formErr }}</p>
        <p v-if="conflict" class="ot__conflict" data-testid="org-team-conflict">
          团队版本已变化（他人已确认或页面数据过期，version_conflict）——请刷新后重试；当前最新版本以刷新结果为准。
        </p>
        <p v-if="actionMsg" class="ot__msg" data-testid="org-team-msg">{{ actionMsg }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.ot { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; }
.ot__bar { display: flex; align-items: center; justify-content: space-between; }
.ot__title { margin: 0; font-size: 13.5px; }
.ot__sub { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.ot__query { display: flex; gap: 6px; }
.ot__query input { flex: 1; }
.ot__err { color: var(--error); margin: 0; font-size: 12px; }
.ot__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12.5px; }
.ot__status { font-size: 10.5px; border: 1px solid var(--border-color); border-radius: 8px; padding: 0 6px; }
/* 高风险警示：警示色系（不用绿色） */
.ot__highrisk { margin: 0; font-size: 11.5px; color: var(--error); border: 1px solid var(--error); border-radius: 6px; padding: 3px 8px; background: rgba(192, 57, 43, 0.08); align-self: flex-start; }
.ot__state { margin: 0; font-size: 12px; color: var(--text-secondary); }
.ot__state--draft { color: var(--warning); }
.ot__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ot__table th, .ot__table td { border-bottom: 1px solid var(--border-color); padding: 4px 6px; text-align: left; }
.ot__kind { font-size: 10.5px; border-radius: 8px; padding: 0 6px; border: 1px solid var(--border-color); }
.ot__kind.is-agent { color: var(--ia-compensated, var(--text-secondary)); }
.ot__confirm { display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--border-color); padding-top: 8px; }
.ot__confirm-head { font-size: 11.5px; font-weight: 600; color: var(--text-secondary); }
.ot__edit select, .ot__edit input, .ot__confirm textarea {
  border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 6px; font-size: 12px;
}
.ot__confirm textarea { resize: vertical; }
.ot__add, .ot__btn { align-self: flex-start; border: 1px solid var(--border-color); border-radius: 4px; background: none; font-size: 11.5px; padding: 3px 10px; cursor: pointer; }
.ot__btn:disabled { opacity: 0.45; cursor: not-allowed; }
.ot__authz { margin: 0; font-size: 11px; color: var(--text-muted); }
.ot__conflict { margin: 0; font-size: 11.5px; color: var(--warning); }
.ot__msg { margin: 0; font-size: 11.5px; color: var(--text-secondary); }
input, select, textarea { font-family: inherit; }
</style>
