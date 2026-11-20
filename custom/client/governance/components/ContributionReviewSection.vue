<!-- overlay/custom/client/governance/components/ContributionReviewSection.vue -->
<!-- 贡献回顾（批三 T6，设计 §4.8/§5.1）：按 outcomeId（或根任务解析）消费
     GET /:id/contribution 五面事实＋签署 POST /:id/contribution-reviews。纪律：
     - 六面如实：五面 fail-soft（失败≠空数据分文案）；第六面「评审结论」v1 恒
       unavailable（review_linkage_not_built）——如实标注「暂未接通」，不伪造挂接。
     - 反目标（不生成排名）：页面无总分/排名/得分 UI——评价四枚举（有效/混合/无效/
       未知）是唯一结论词表，无数值分。
     - 签署只收 human-entry：subject 选 person/agent/team；rationale ≥20 字前端提示
       （服务端同口径兜底）；evidenceRefs 必填多行；person 主体自评前端拦截＋服务端
       422 兜底显示（签署人=登录身份，服务端定死，客户端不得指定 signedBy）。
     功能门关（OUTCOME_WORKBENCH≠1）整段不渲染。 -->
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { humanDateTime } from '@/custom/ia2/format'
import { getStoredUsername } from '@/api/client'
import {
  fetchContribution, resolveOutcomeFace, submitContributionReview, OrgWorkbenchDisabledError,
  type ContributionAssessment, type ContributionRead, type ContributionSubjectKind, type FaceFail,
} from '@/custom/governance/api/org-workbench'

const i18nCtx = useI18n()
const zh = computed(() => String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh').startsWith('zh'))

/** 登录名即签署人（服务端 signedBy=ctx.state.user.username，客户端冒传被忽略）。 */
const actor = getStoredUsername() ?? ''

const gateOff = ref(false)
const input = ref('')
const outcomeId = ref('')
const read = ref<ContributionRead | null>(null)
const loadError = ref('')
const busy = ref(false)

const ASSESSMENT_LABEL: Record<ContributionAssessment, string> = {
  effective: '有效', mixed: '混合（有效与无效并存）', ineffective: '无效', unknown: '未知（证据不足）',
}
const SUBJECT_KIND_LABEL: Record<ContributionSubjectKind, string> = { person: '自然人', agent: 'Agent', team: '团队' }
const AVAILABILITY_LABEL: Record<string, string> = { available: '有值', pending: '待补', unavailable: '不可用' }

/** 面失败窄化（available:false 时 reason 必在）。 */
function isFail(f: unknown): f is FaceFail {
  return !!f && typeof f === 'object' && (f as { available?: unknown }).available === false
}

async function load(): Promise<void> {
  if (busy.value) return
  busy.value = true
  loadError.value = ''
  read.value = null
  outcomeId.value = ''
  formErr.value = ''
  actionMsg.value = ''
  try {
    const face = await resolveOutcomeFace(input.value)
    if (!face) {
      loadError.value = `未找到输入「${input.value.trim()}」对应的结果合同（先按 outcomeId 直查，再按根任务 id 解析，两路皆空）`
      return
    }
    outcomeId.value = face.contract.outcomeId
    read.value = await fetchContribution(face.contract.outcomeId)
  } catch (err) {
    if (err instanceof OrgWorkbenchDisabledError) gateOff.value = true
    else loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

// ── 签署表单 ──
const form = ref({
  subjectKind: 'agent' as ContributionSubjectKind,
  subjectId: '',
  assessment: 'effective' as ContributionAssessment,
  rationale: '',
  evidence: '',
})
const formErr = ref('')
const actionMsg = ref('')

async function submit(): Promise<void> {
  formErr.value = ''
  actionMsg.value = ''
  if (!outcomeId.value) return
  const subjectId = form.value.subjectId.trim()
  const rationale = form.value.rationale.trim()
  const evidenceRefs = form.value.evidence.split('\n').map((s) => s.trim()).filter(Boolean)
  if (!subjectId) {
    formErr.value = '被评价主体 id 必填（person 填 person.id，agent 填身份册 id，team 填团队 id）'
    return
  }
  // person 自评前端拦截（服务端 appendContributionReview 同禁 422 兜底）
  if (form.value.subjectKind === 'person' && subjectId === actor) {
    formErr.value = `不得自评：被评价主体（person: ${subjectId}）与签署人（${actor}）相同——贡献评价禁止本人评本人，服务端同样拒绝（422）`
    return
  }
  if (rationale.length < 20) {
    formErr.value = `评价理由至少 20 字（现 ${rationale.length} 字）——写出依据与证据对应关系，不写空泛结论`
    return
  }
  if (evidenceRefs.length === 0) {
    formErr.value = '证据引用必填（每行一条，至少一条——可引用上方事实面的 measurementId/事件 id）'
    return
  }
  busy.value = true
  try {
    const r = await submitContributionReview(outcomeId.value, {
      subjectKind: form.value.subjectKind,
      subjectId,
      assessment: form.value.assessment,
      rationale,
      evidenceRefs,
    })
    actionMsg.value = `评价已签署（${r.id}，签署人 ${r.signedBy}）`
    form.value.subjectId = ''
    form.value.rationale = ''
    form.value.evidence = ''
    read.value = await fetchContribution(outcomeId.value)
  } catch (err) {
    formErr.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

const T = computed(() => zh.value ? {
  title: '贡献回顾（事实与署名评价）',
  sub: '五面事实（测量/团队角色/人署名评价/学习候选与召回留痕/事件时间线）＋人署名评价签署——评价必须回指证据，本面板不生成汇总评分或对比座次',
  inputPh: 'outcomeId 或根任务 id', load: '查询',
  faceMeasurements: '测量事实', faceTeam: '团队角色', faceReviews: '人署名评价',
  faceLearning: '学习候选与召回留痕', faceEvents: '事件时间线', faceReviewConclusions: '评审结论',
  unavailable: (reason: string) => `来源不可用：${reason}`,
  emptyMeasurements: '暂无测量记录', emptyReviews: '尚无署名评价',
  emptyLearning: '暂无学习候选与召回留痕', emptyEvents: '暂无事件记录', noTeam: '未成队',
  injections: (n: number) => `${n} 条召回留痕`,
  candidates: (n: number) => `学习候选 ${n} 条`,
  signTitle: '签署贡献评价（human-entry）',
  signerNote: (a: string) => `签署人＝当前登录（${a || '未登录'}，服务端身份，不可代签）；仅 owner 或验证责任人可签（服务端终裁）`,
  subjectKind: '主体类型', subjectId: '主体 id', assessment: '评价',
  rationalePh: '评价理由（trim 后至少 20 字，写依据不写结论）',
  evidencePh: '证据引用（每行一条，必填）',
  submitBtn: '签署评价',
} : {
  title: 'Contribution Review (facts & signed assessments)',
  sub: 'Five fact faces plus human-signed assessments — no scores or rankings; every assessment must cite evidence',
  inputPh: 'outcomeId or root task id', load: 'Load',
  faceMeasurements: 'Measurements', faceTeam: 'Team roles', faceReviews: 'Signed assessments',
  faceLearning: 'Learning candidates & recall log', faceEvents: 'Event timeline', faceReviewConclusions: 'Review conclusions',
  unavailable: (reason: string) => `Source unavailable: ${reason}`,
  emptyMeasurements: 'No measurements yet', emptyReviews: 'No signed assessments yet',
  emptyLearning: 'No learning candidates or recall log yet', emptyEvents: 'No events yet', noTeam: 'No team formed',
  injections: (n: number) => `${n} recall log entr${n === 1 ? 'y' : 'ies'}`,
  candidates: (n: number) => `${n} learning candidate(s)`,
  signTitle: 'Sign a contribution assessment (human-entry)',
  signerNote: (a: string) => `Signer = current login (${a || 'anonymous'}; server-side identity); only owner or verifier may sign (enforced server-side)`,
  subjectKind: 'Subject kind', subjectId: 'Subject id', assessment: 'Assessment',
  rationalePh: 'Rationale (at least 20 chars after trim; state the evidence, not the verdict)',
  evidencePh: 'Evidence refs (one per line, required)',
  submitBtn: 'Sign assessment',
})
</script>

<template>
  <section v-if="!gateOff" class="cr" data-testid="org-contribution-section">
    <div class="cr__bar">
      <h3 class="cr__title">{{ T.title }}</h3>
    </div>
    <p class="cr__sub">{{ T.sub }}</p>
    <div class="cr__query">
      <input v-model="input" type="text" :placeholder="T.inputPh" data-testid="org-contrib-input" @keydown.enter="load()" />
      <button type="button" :disabled="busy" data-testid="org-contrib-load" @click="load()">{{ busy ? '…' : T.load }}</button>
    </div>
    <p v-if="loadError" class="cr__err" data-testid="org-contrib-error">{{ loadError }}</p>

    <template v-if="read">
      <!-- 面一：测量事实 -->
      <div class="cr__face" data-testid="org-contrib-measurements">
        <h4 class="cr__face-title">{{ T.faceMeasurements }}</h4>
        <p v-if="isFail(read.measurements)" class="cr__fail">{{ T.unavailable(read.measurements.reason) }}</p>
        <table v-else-if="read.measurements.items.length" class="cr__table">
          <thead><tr><th>measureId</th><th>actual</th><th>availability</th><th>observedAt</th><th>recordedBy</th></tr></thead>
          <tbody>
            <tr v-for="m in read.measurements.items" :key="m.measurementId">
              <td>{{ m.measureId }}</td>
              <td>{{ m.actual ?? '未知' }}</td>
              <td>{{ AVAILABILITY_LABEL[m.availability] ?? m.availability }}</td>
              <td>{{ humanDateTime(m.observedAt) }}</td>
              <td>{{ m.recordedBy }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="cr__empty">{{ T.emptyMeasurements }}</p>
      </div>

      <!-- 面二：团队角色 -->
      <div class="cr__face" data-testid="org-contrib-team">
        <h4 class="cr__face-title">{{ T.faceTeam }}</h4>
        <p v-if="isFail(read.team)" class="cr__fail">{{ T.unavailable(read.team.reason) }}</p>
        <template v-else-if="read.team.item">
          <table class="cr__table">
            <thead><tr><th>subjectKind</th><th>subjectId</th><th>role</th><th>responsibility</th></tr></thead>
            <tbody>
              <tr v-for="m in read.team.item.members" :key="`${m.subjectKind}:${m.subjectId}`">
                <td>{{ SUBJECT_KIND_LABEL[m.subjectKind] ?? m.subjectKind }}</td>
                <td>{{ m.subjectId }}</td>
                <td>{{ m.role }}</td>
                <td>{{ m.responsibility }}</td>
              </tr>
            </tbody>
          </table>
          <p class="cr__note">团队 v{{ read.team.item.version }}（{{ read.team.item.status }}）</p>
        </template>
        <p v-else class="cr__empty">{{ T.noTeam }}</p>
      </div>

      <!-- 面三：人署名评价 -->
      <div class="cr__face" data-testid="org-contrib-reviews">
        <h4 class="cr__face-title">{{ T.faceReviews }}</h4>
        <p v-if="isFail(read.reviews)" class="cr__fail">{{ T.unavailable(read.reviews.reason) }}</p>
        <table v-else-if="read.reviews.items.length" class="cr__table">
          <thead><tr><th>subject</th><th>assessment</th><th>signedBy</th><th>signedAt</th><th>rationale</th></tr></thead>
          <tbody>
            <tr v-for="r in read.reviews.items" :key="r.id">
              <td>{{ r.subject.subjectKind }}:{{ r.subject.subjectId }}</td>
              <td>{{ ASSESSMENT_LABEL[r.assessment] ?? r.assessment }}</td>
              <td>{{ r.signedBy }}</td>
              <td>{{ humanDateTime(r.signedAt) }}</td>
              <td class="cr__rat">{{ r.rationale ?? '（细节按读面权限脱敏）' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="cr__empty">{{ T.emptyReviews }}</p>
      </div>

      <!-- 面四：学习候选与召回留痕 -->
      <div class="cr__face" data-testid="org-contrib-learning">
        <h4 class="cr__face-title">{{ T.faceLearning }}</h4>
        <p v-if="isFail(read.learning)" class="cr__fail">{{ T.unavailable(read.learning.reason) }}</p>
        <template v-else>
          <p class="cr__note">{{ T.candidates(read.learning.candidates.length) }} · {{ T.injections(read.learning.injections.length) }}</p>
          <ul v-if="read.learning.candidates.length" class="cr__list">
            <li v-for="c in read.learning.candidates" :key="c.id">
              {{ c.id }}（{{ c.type }} · {{ c.status }}）<template v-if="c.outcomeId">→ {{ c.outcomeId }}</template>
            </li>
          </ul>
          <p v-if="read.learning.candidates.length === 0 && read.learning.injections.length === 0" class="cr__empty">{{ T.emptyLearning }}</p>
        </template>
      </div>

      <!-- 面五：事件时间线 -->
      <div class="cr__face" data-testid="org-contrib-events">
        <h4 class="cr__face-title">{{ T.faceEvents }}</h4>
        <p v-if="isFail(read.events)" class="cr__fail">{{ T.unavailable(read.events.reason) }}</p>
        <ul v-else-if="read.events.timeline.length" class="cr__list">
          <li v-for="e in read.events.timeline" :key="e.eventId">
            {{ humanDateTime(e.at) }} · {{ e.type }} · {{ e.actor }} · 合同 v{{ e.contractVersion }}
          </li>
        </ul>
        <p v-else class="cr__empty">{{ T.emptyEvents }}</p>
      </div>

      <!-- 面六：评审结论——v1 恒 unavailable，如实标注不伪造 -->
      <div class="cr__face" data-testid="org-contrib-review-conclusions">
        <h4 class="cr__face-title">{{ T.faceReviewConclusions }}</h4>
        <p class="cr__fail">
          评审结论暂未接通（{{ read.reviewConclusions.reason }}）——评审域与结果合同尚未逐条挂接，本面不做拼接推测；评审原文在评审治理域查阅。
        </p>
      </div>

      <!-- 签署表单（human-entry 唯一写面） -->
      <div class="cr__sign">
        <div class="cr__sign-head">{{ T.signTitle }}</div>
        <p class="cr__note">{{ T.signerNote(actor) }}</p>
        <div class="cr__sign-grid">
          <label>{{ T.subjectKind }}
            <select v-model="form.subjectKind" data-testid="org-contrib-kind">
              <option value="person">person（自然人）</option>
              <option value="agent">agent</option>
              <option value="team">team</option>
            </select>
          </label>
          <label>{{ T.subjectId }}<input v-model="form.subjectId" type="text" data-testid="org-contrib-subject" /></label>
          <label>{{ T.assessment }}
            <select v-model="form.assessment" data-testid="org-contrib-assessment">
              <option value="effective">有效</option>
              <option value="mixed">混合（有效与无效并存）</option>
              <option value="ineffective">无效</option>
              <option value="unknown">未知（证据不足）</option>
            </select>
          </label>
        </div>
        <textarea v-model="form.rationale" rows="2" :placeholder="T.rationalePh" data-testid="org-contrib-rationale" />
        <textarea v-model="form.evidence" rows="2" :placeholder="T.evidencePh" data-testid="org-contrib-evidence" />
        <button type="button" class="cr__btn" :disabled="busy" data-testid="org-contrib-submit" @click="submit()">
          {{ busy ? '…' : T.submitBtn }}
        </button>
        <p v-if="formErr" class="cr__err" data-testid="org-contrib-formerr">{{ formErr }}</p>
        <p v-if="actionMsg" class="cr__msg" data-testid="org-contrib-msg">{{ actionMsg }}</p>
      </div>
    </template>
  </section>
</template>

<style scoped lang="scss">
.cr { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: 8px; }
.cr__bar { display: flex; align-items: center; justify-content: space-between; }
.cr__title { margin: 0; font-size: 13.5px; }
.cr__sub { margin: 0; font-size: 11.5px; color: var(--text-muted); }
.cr__query { display: flex; gap: 6px; }
.cr__query input { flex: 1; }
.cr__err { color: var(--error); margin: 0; font-size: 12px; }
.cr__msg { color: var(--text-secondary); margin: 0; font-size: 11.5px; }
.cr__face { border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 10px; }
.cr__face-title { margin: 0 0 4px; font-size: 12px; }
.cr__fail { margin: 0; color: var(--warning); font-size: 11.5px; }
.cr__empty { margin: 0; color: var(--text-muted); font-size: 11.5px; }
.cr__note { margin: 2px 0; font-size: 11px; color: var(--text-muted); }
.cr__table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
.cr__table th, .cr__table td { border-bottom: 1px solid var(--border-color); padding: 3px 6px; text-align: left; }
.cr__rat { max-width: 320px; }
.cr__list { margin: 2px 0 0; padding-left: 16px; font-size: 11.5px; }
.cr__sign { display: flex; flex-direction: column; gap: 6px; border-top: 1px dashed var(--border-color); padding-top: 8px; }
.cr__sign-head { font-size: 11.5px; font-weight: 600; color: var(--text-secondary); }
.cr__sign-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.cr__sign-grid label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; }
.cr__sign textarea { resize: vertical; }
.cr__btn { align-self: flex-start; border: 1px solid var(--border-color); border-radius: 4px; background: none; font-size: 11.5px; padding: 3px 10px; cursor: pointer; }
.cr__btn:disabled { opacity: 0.45; cursor: not-allowed; }
input, select, textarea { border: 1px solid var(--border-color); border-radius: 4px; padding: 3px 6px; font-size: 12px; font-family: inherit; }
</style>
