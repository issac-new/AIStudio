<!-- overlay/custom/client/ia2/views/gov/LongHorizonTrustPanel.vue -->
<!-- ⑥治理·长程可信页签（2026-10-22）。
     来源：《我发现了渗透Agent长程任务的秘密》（FreeBuf 2026-09-28）。
     一屏五段：准入指标 → 角色工具面 → 登记检查 → 案件列表 → 案件详情。
     关键语义：Agent 的"完成了"只是提议；是否准入由服务端读取逐条审计裁决与
     工作区完整性清单决定，页面不提供直接改状态的入口。 -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  admitTrustCase, beginTrustAudit, createTrustCase, fetchTrustCase, fetchTrustCases,
  fetchTrustOverview, fetchTrustSurfaces, verifyTrustCheckpoint, verifyTrustLedger,
  writeTrustCheckpoint,
  type CheckpointVerificationDto, type ClaimVerdictDto, type IntegrityStateDto,
  type TrustAuditDto, type TrustCaseDto, type TrustCaseSummaryDto, type TrustDecisionDto,
  type TrustLedgerVerifyDto, type TrustOverviewDto, type TrustStateDto, type TrustSurfacesDto,
} from '../../api/trust'

const loading = ref(false)
const creating = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const overview = ref<TrustOverviewDto | null>(null)
const surfaces = ref<TrustSurfacesDto | null>(null)
const cases = ref<TrustCaseSummaryDto[]>([])
const selectedId = ref('')
const detail = ref<TrustCaseDto | null>(null)
const ledger = ref<TrustLedgerVerifyDto | null>(null)
const checkpointCheck = ref<CheckpointVerificationDto | null>(null)
const actor = ref('operator')
const form = ref({ title: '', workspaceRoot: '', statement: '', refs: '' })

const stateLabel: Record<TrustStateDto, string> = {
  open: '待裁决', admitted: '已准入', untrusted: '未信任',
}
const integrityLabel: Record<IntegrityStateDto, string> = {
  clean: '完整', violated: '被改动', unknown: '未采集',
}
const verdictLabel: Record<ClaimVerdictDto, string> = {
  verified: '已复核', unverified: '证据不足', refuted: '有反证',
}
const roleLabel = { manager: '管理者', auditor: '审计者', executor: '执行者' } as const
const kindLabel = { added: '新增', modified: '修改', removed: '删除' } as const
const checkpointLabel: Record<CheckpointVerificationDto['status'], string> = {
  consistent: '工作区与断点一致',
  diverged: '工作区已偏离断点',
  workspace_missing: '工作区不存在',
  no_checkpoint: '还没有断点',
}

const latestDecision = computed<TrustDecisionDto | null>(() => {
  const list = detail.value?.decisions ?? []
  return list.length > 0 ? list[list.length - 1] : null
})
const claimRows = computed(() => {
  const d = detail.value
  if (!d) return [] as Array<{ claim: TrustCaseDto['claims'][number]; audit: TrustAuditDto | null }>
  return d.claims.map((claim) => {
    const audits = d.audits.filter((a) => a.claimId === claim.id)
    return { claim, audit: audits.length > 0 ? audits[audits.length - 1] : null }
  })
})

function fmt(ts: number | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('zh-CN', { hour12: false })
}

function shortHash(h: string | null | undefined): string {
  return h ? h.slice(0, 12) : '—'
}

async function select(id: string): Promise<void> {
  selectedId.value = id
  checkpointCheck.value = null
  const res = await fetchTrustCase(id)
  detail.value = res.case
}

async function loadAll(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const [o, s, list] = await Promise.all([fetchTrustOverview(), fetchTrustSurfaces(), fetchTrustCases()])
    overview.value = o
    surfaces.value = s
    cases.value = list.cases
    if (selectedId.value && cases.value.some((c) => c.id === selectedId.value)) {
      await select(selectedId.value)
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function reloadDetail(): Promise<void> {
  if (!selectedId.value) return
  await select(selectedId.value)
  const [o, list] = await Promise.all([fetchTrustOverview(), fetchTrustCases()])
  overview.value = o
  cases.value = list.cases
}

async function create(): Promise<void> {
  if (!form.value.title.trim() || !form.value.workspaceRoot.trim() || !form.value.statement.trim()) {
    error.value = '标题、工作区路径与要核验的事实都不能为空'
    return
  }
  creating.value = true
  error.value = ''
  try {
    const refs = form.value.refs.split(',').map((s) => s.trim()).filter(Boolean)
    const res = await createTrustCase({
      title: form.value.title.trim(),
      workspaceRoot: form.value.workspaceRoot.trim(),
      actor: actor.value,
      claims: [{ statement: form.value.statement.trim(), evidenceRefs: refs, claimedBy: actor.value }],
    })
    selectedId.value = res.case.id
    detail.value = res.case
    form.value = { title: '', workspaceRoot: '', statement: '', refs: '' }
    notice.value = `已登记检查 ${res.case.id}`
    await loadAll()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    creating.value = false
  }
}

async function beginAuditAction(): Promise<void> {
  if (!detail.value) return
  if (!window.confirm('将重新采集审计前基线；之后审计阶段内的任何工作区改动都会被判为违规。继续？')) return
  busy.value = true
  error.value = ''
  try {
    await beginTrustAudit(detail.value.id, actor.value)
    notice.value = '已记录审计前基线'
    await reloadDetail()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function writeCheckpointAction(): Promise<void> {
  if (!detail.value) return
  busy.value = true
  error.value = ''
  try {
    const res = await writeTrustCheckpoint(detail.value.id, { actor: actor.value })
    notice.value = `已写入断点（第 ${res.checkpoint.round} 轮）`
    await reloadDetail()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function verifyCheckpointAction(): Promise<void> {
  if (!detail.value) return
  busy.value = true
  error.value = ''
  try {
    checkpointCheck.value = await verifyTrustCheckpoint(detail.value.id)
    notice.value = `断点核对：${checkpointLabel[checkpointCheck.value.status]}`
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function admitAction(): Promise<void> {
  if (!detail.value) return
  if (!window.confirm('提交完成提议会写入事件账；未通过双准入会累加伪造尝试次数。继续？')) return
  busy.value = true
  error.value = ''
  try {
    const res = await admitTrustCase(detail.value.id, { actor: actor.value, auditorReportedIntegrity: 'clean' })
    notice.value = res.decision.result === 'admitted'
      ? '双条件成立，已准入'
      : `未准入：${res.decision.blockers.map((b) => b.detail).join('；')}`
    await reloadDetail()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

async function verifyLedgerAction(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    ledger.value = await verifyTrustLedger()
    notice.value = ledger.value.intact
      ? `事件账完整（${ledger.value.total} 条）`
      : `事件账出现断点，第一条异常在 #${ledger.value.firstBroken ?? '?'}`
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}

onMounted(loadAll)
</script>

<template>
  <section class="trust" data-testid="trust-panel">
    <header class="trust__head">
      <div>
        <h2 class="trust__title">长程可信</h2>
        <p class="trust__lede">
          完成态由执行框架判定：每条主张都有独立的审计裁决，且审计期间工作区没有被改动，
          才允许把任务标为完成。Agent 自报"做完了"只是一份提议，页面不提供直接改状态的入口。
        </p>
      </div>
      <div class="trust__tools">
        <label class="trust__actor">
          操作者
          <input v-model="actor" data-testid="trust-actor" aria-label="操作者" />
        </label>
        <button class="trust__btn" :disabled="loading" @click="loadAll">刷新</button>
        <button class="trust__btn" :disabled="busy" @click="verifyLedgerAction">核对事件账</button>
      </div>
    </header>

    <p v-if="error" class="trust__alert" data-testid="trust-error">{{ error }}</p>
    <p v-if="notice" class="trust__notice" data-testid="trust-notice">{{ notice }}</p>
    <p v-if="loading" class="trust__muted">读取中…</p>

    <div v-if="overview" class="trust__kpis" data-testid="trust-kpi">
      <div class="trust__kpi"><span class="trust__kpi-label">检查案件</span><strong>{{ overview.cases }}</strong></div>
      <div class="trust__kpi is-pass"><span class="trust__kpi-label">已准入</span><strong>{{ overview.admitted }}</strong></div>
      <div class="trust__kpi is-fail"><span class="trust__kpi-label">未信任</span><strong>{{ overview.untrusted }}</strong></div>
      <div class="trust__kpi"><span class="trust__kpi-label">伪造尝试</span><strong>{{ overview.forgeAttempts }}</strong></div>
      <div class="trust__kpi is-fail"><span class="trust__kpi-label">完整性违规</span><strong>{{ overview.integrityViolations }}</strong></div>
      <div class="trust__kpi">
        <span class="trust__kpi-label">事件账</span>
        <strong :class="overview.ledgerIntact ? 'is-pass-text' : 'is-fail-text'">
          {{ overview.ledgerIntact ? '完整' : '异常' }}
        </strong>
        <span class="trust__muted">{{ overview.ledgerEntries }} 条</span>
      </div>
    </div>
    <p v-else-if="!loading && !error" class="ui-empty-state" data-testid="trust-empty">
      还没有可信检查案件。先在下方登记一个检查。
    </p>
    <p v-if="ledger" class="trust__muted" data-testid="trust-ledger">
      事件账核对：{{ ledger.total }} 条，{{ ledger.intact ? '完整' : '存在断点' }}
      （链上 {{ ledger.chained }} 条，未入链 {{ ledger.unchained }} 条）
    </p>

    <section v-if="surfaces" class="trust__card" data-testid="trust-surface-chain">
      <h3 class="trust__h3">角色工具面单调链</h3>
      <p class="trust__muted">
        审计者工具面严格大于管理者（0 件），执行者严格大于审计者；审计者不含写入或命令执行工具。
        工具清单是静态声明，不随运行时配置放宽。
      </p>
      <div class="trust__roles">
        <div v-for="s in surfaces.surfaces" :key="s.role" class="trust__role">
          <span class="trust__role-name">{{ roleLabel[s.role] }}</span>
          <strong class="trust__role-count">{{ surfaces.sizes[s.role] }}</strong>
          <span class="trust__muted">{{ s.allowWrite ? '可写' : '只读' }}</span>
        </div>
      </div>
      <p v-if="surfaces.valid" class="trust__ok">单调链成立</p>
      <ul v-else class="trust__problem">
        <li v-for="v in surfaces.violations" :key="v">{{ v }}</li>
      </ul>
    </section>

    <section class="trust__card" data-testid="trust-create">
      <h3 class="trust__h3">登记一次可信检查</h3>
      <div class="trust__form">
        <input v-model="form.title" data-testid="trust-create-title" aria-label="检查标题" placeholder="检查标题，例如：登录改造验收" />
        <input v-model="form.workspaceRoot" data-testid="trust-create-root" aria-label="工作区绝对路径" placeholder="工作区绝对路径，例如 /Users/me/lab/demo" />
        <input v-model="form.statement" data-testid="trust-create-statement" aria-label="要核验的完成事实" placeholder="要核验的完成事实" />
        <input v-model="form.refs" data-testid="trust-create-refs" aria-label="证据锚" placeholder="证据锚（逗号分隔）：file:src/login.ts,git:abc1234" />
        <button class="trust__btn trust__btn--primary" :disabled="creating" @click="create">登记</button>
      </div>
    </section>

    <section class="trust__card">
      <h3 class="trust__h3">检查案件</h3>
      <table v-if="cases.length" class="trust__table" data-testid="trust-cases-table">
        <thead>
          <tr>
            <th>案件</th><th>状态</th><th>主张复核</th>
            <th>工作区</th><th>伪造尝试</th><th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in cases" :key="c.id"
            :class="{ 'is-selected': c.id === selectedId }"
            data-testid="trust-case-row"
            @click="select(c.id)"
          >
            <td>
              <div>{{ c.title }}</div>
              <div class="trust__muted trust__mono">{{ c.id }}</div>
            </td>
            <td><span class="trust__pill" :class="`is-${c.state}`">{{ stateLabel[c.state] }}</span></td>
            <td>{{ c.verifiedCount }}/{{ c.claimCount }}</td>
            <td>{{ integrityLabel[c.integrityState] }}</td>
            <td>{{ c.forgeAttempts }}</td>
            <td class="trust__nowrap">{{ fmt(c.updatedAt) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="ui-empty-state" data-testid="trust-cases-empty">还没有案件。</p>
    </section>

    <section v-if="detail" class="trust__card" data-testid="trust-detail">
      <div class="trust__detail-head">
        <div>
          <h3 class="trust__h3">{{ detail.title }}</h3>
          <p class="trust__muted trust__mono">{{ detail.workspaceRoot }}</p>
        </div>
        <span class="trust__pill" :class="`is-${detail.state}`">{{ stateLabel[detail.state] }}</span>
      </div>
      <p class="trust__muted">
        伪造尝试 {{ detail.forgeAttempts }} 次
        <span v-if="detail.blockedReason">；最近未准入原因：{{ detail.blockedReason }}</span>
      </p>
      <div class="trust__actions">
        <button class="trust__btn" :disabled="busy" @click="beginAuditAction">记录审计前基线</button>
        <button class="trust__btn" :disabled="busy" @click="writeCheckpointAction">写入断点</button>
        <button class="trust__btn" :disabled="busy" @click="verifyCheckpointAction">核对断点</button>
        <button class="trust__btn trust__btn--primary" :disabled="busy" @click="admitAction">提交完成提议</button>
      </div>
      <p v-if="checkpointCheck" class="trust__muted" data-testid="trust-checkpoint-result">
        断点核对：{{ checkpointLabel[checkpointCheck.status] }}
        <span v-if="checkpointCheck.changes.length">；差异 {{ checkpointCheck.changes.length }} 处</span>
        <span v-if="checkpointCheck.caseChanged">；断点后案件又有新记录</span>
      </p>

      <h4 class="trust__h4">主张与裁决</h4>
      <table class="trust__table" data-testid="trust-claims-table">
        <thead>
          <tr><th>主张</th><th>证据锚</th><th>主张人</th><th>最新裁决</th><th>审计者</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in claimRows" :key="row.claim.id">
            <td>{{ row.claim.statement }}</td>
            <td class="trust__mono">{{ row.claim.evidenceRefs.join('，') || '—' }}</td>
            <td>{{ row.claim.claimedBy }}</td>
            <td>
              <span v-if="row.audit" class="trust__pill" :class="`is-${row.audit.verdict}`">
                {{ verdictLabel[row.audit.verdict] }}
              </span>
              <span v-else class="trust__muted">未审计</span>
            </td>
            <td>{{ row.audit?.auditor ?? '—' }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="latestDecision" data-testid="trust-decision">
        <h4 class="trust__h4">最近一次准入裁决</h4>
        <p>
          <span class="trust__pill" :class="latestDecision.result === 'admitted' ? 'is-admitted' : 'is-untrusted'">
            {{ latestDecision.result === 'admitted' ? '已准入' : '未准入' }}
          </span>
          <span class="trust__muted"> {{ fmt(latestDecision.at) }} · {{ latestDecision.actor }}</span>
        </p>
        <ul v-if="latestDecision.blockers.length" class="trust__problem">
          <li v-for="b in latestDecision.blockers" :key="b.code + (b.claimId ?? '')">{{ b.detail }}</li>
        </ul>
        <p class="trust__muted">
          工作区完整性：{{ integrityLabel[latestDecision.integrity.state] }}；
          变化 {{ latestDecision.integrity.changeTotal }} 处
          <span v-if="latestDecision.integrity.overridden">
            （审计者自报 clean，框架观察到改动，以框架观察为准）
          </span>
        </p>
        <ul v-if="latestDecision.integrity.changes.length" class="trust__changes">
          <li v-for="ch in latestDecision.integrity.changes.slice(0, 10)" :key="ch.kind + ch.path">
            {{ kindLabel[ch.kind] }} <code>{{ ch.path }}</code>
          </li>
        </ul>
      </div>

      <h4 class="trust__h4">断点</h4>
      <p v-if="!detail.checkpoints.length" class="trust__muted">还没有断点。</p>
      <ul v-else class="trust__checkpoints">
        <li v-for="cp in detail.checkpoints.slice().reverse()" :key="cp.id">
          第 {{ cp.round }} 轮 · {{ fmt(cp.at) }} · 工作区摘要
          <code>{{ shortHash(cp.workspaceDigest) }}</code> · 案件摘要
          <code>{{ shortHash(cp.caseDigest) }}</code>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped lang="scss">
.trust {
  display: flex;
  flex-direction: column;
  gap: var(--ia-sp-3);
  padding: var(--ia-sp-3);
  color: var(--text-primary);
}
.trust__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ia-sp-3);
}
.trust__title {
  margin: 0 0 var(--ia-sp-1);
  font-size: var(--ia-fs-page);
}
.trust__lede {
  margin: 0;
  max-width: 72ch;
  color: var(--text-secondary);
  line-height: 1.65;
}
.trust__tools {
  display: flex;
  align-items: flex-end;
  gap: var(--ia-sp-2);
  flex-wrap: wrap;
}
.trust__actor {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: var(--ia-fs-aux);
  color: var(--text-muted);
}
.trust__actor input,
.trust__form input {
  padding: 6px 10px;
  border: 1px solid var(--ia-card-border);
  border-radius: var(--ia-card-radius);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: var(--ia-fs-body);
}
.trust__btn {
  padding: 6px 12px;
  border: 1px solid var(--ia-card-border);
  border-radius: var(--ia-card-radius);
  background: var(--bg-card);
  color: var(--text-primary);
  cursor: pointer;
  font-size: var(--ia-fs-body);
}
.trust__btn:disabled {
  opacity: 0.55;
  cursor: default;
}
.trust__btn--primary {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.trust__alert {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--ia-fail);
  background: var(--bg-secondary);
  color: var(--ia-fail);
}
.trust__notice {
  margin: 0;
  padding: 8px 12px;
  border-left: 3px solid var(--ia-pass);
  background: var(--bg-secondary);
  color: var(--text-secondary);
}
.trust__muted {
  color: var(--text-muted);
  font-size: var(--ia-fs-aux);
}
.trust__mono {
  font-family: var(--font-mono, monospace);
}
.trust__nowrap {
  white-space: nowrap;
}
.trust__kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--ia-sp-2);
}
.trust__kpi {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--ia-card-pad);
  border: 1px solid var(--ia-card-border);
  border-radius: var(--ia-card-radius);
  background: var(--bg-card);
}
.trust__kpi strong {
  font-size: 24px;
}
.trust__kpi-label {
  color: var(--text-muted);
  font-size: var(--ia-fs-aux);
}
.trust__kpi.is-pass strong,
.is-pass-text {
  color: var(--ia-pass);
}
.trust__kpi.is-fail strong,
.is-fail-text {
  color: var(--ia-fail);
}
.trust__card {
  padding: var(--ia-card-pad);
  border: 1px solid var(--ia-card-border);
  border-radius: var(--ia-card-radius);
  background: var(--bg-card);
}
.trust__h3 {
  margin: 0 0 var(--ia-sp-2);
  font-size: var(--ia-fs-block);
}
.trust__h4 {
  margin: var(--ia-sp-3) 0 var(--ia-sp-1);
  font-size: var(--ia-fs-body);
}
.trust__roles {
  display: flex;
  gap: var(--ia-sp-3);
  flex-wrap: wrap;
  margin: var(--ia-sp-2) 0;
}
.trust__role {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--ia-card-border);
  border-radius: var(--ia-card-radius);
  background: var(--bg-secondary);
}
.trust__role-name {
  color: var(--text-secondary);
}
.trust__role-count {
  font-size: 22px;
}
.trust__ok {
  margin: 0;
  color: var(--ia-pass);
}
.trust__problem {
  margin: var(--ia-sp-1) 0 0;
  padding-left: 18px;
  color: var(--ia-fail);
}
.trust__form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--ia-sp-2);
  align-items: end;
}
.trust__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ia-fs-body);
}
.trust__table th,
.trust__table td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--ia-card-border);
  text-align: left;
  vertical-align: top;
}
.trust__table th {
  color: var(--text-muted);
  font-weight: 500;
  font-size: var(--ia-fs-aux);
}
.trust__table tbody tr {
  cursor: pointer;
}
.trust__table tbody tr:hover,
.trust__table tbody tr.is-selected {
  background: var(--bg-secondary);
}
.trust__pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--ia-card-border);
  font-size: var(--ia-fs-aux);
  white-space: nowrap;
}
.trust__pill.is-admitted,
.trust__pill.is-verified {
  color: var(--ia-pass);
  border-color: var(--ia-pass);
}
.trust__pill.is-untrusted,
.trust__pill.is-refuted {
  color: var(--ia-fail);
  border-color: var(--ia-fail);
}
.trust__pill.is-open,
.trust__pill.is-unverified {
  color: var(--ia-compensated);
  border-color: var(--ia-compensated);
}
.trust__detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ia-sp-2);
}
.trust__actions {
  display: flex;
  gap: var(--ia-sp-2);
  flex-wrap: wrap;
  margin: var(--ia-sp-2) 0;
}
.trust__changes,
.trust__checkpoints {
  margin: var(--ia-sp-1) 0 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: var(--ia-fs-aux);
  line-height: 1.7;
}
</style>
