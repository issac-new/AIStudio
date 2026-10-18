<!-- overlay/custom/client/ia2/views/sim/OverviewPanel.vue -->
<!-- S1 运行总览（旗舰签 B2 工单——设计正本 2026-10-16-sim-center-detailed-design.md 签 1）：
     运行模式横幅（三档色带+遗留项清算灯）→ KPI 四卡 → 七幕旅程条 → 双列表（左 2/3 26 步表
     +交付物 14 件链；右 1/3 六道质量门+净计卡+观察窗入口）。run 来自路由 query
     （/app/sim?run=xxx，runs 家族重定向同源）；数字全部自 X1 端点实测计算（N2），
     run 缺席=引导输入不造假，端点缺席/失败=如实缺席态（N1）。 -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  fetchBranches, fetchDeliverables, fetchIssues, fetchRunState,
  type BranchesResponse, type DeliverablesResponse, type IssuesResponse, type RunStateResponse,
} from '../../api/overview'
import {
  ACTS_7, compDeduction, countStepsDone, netStepsAvailable, resolveGateRows, resolveStepRows,
  type StepRow,
} from './steps-registry'
import SimDualCredential from '../../components/sim/SimDualCredential.vue'
import SimGateBadge from '../../components/sim/SimGateBadge.vue'
import SimCompensatedTag from '../../components/sim/SimCompensatedTag.vue'
import SimAnchorDrawer from '../../components/sim/SimAnchorDrawer.vue'
import { useRunContext } from '../../composables/useRunContext'
import { compensationLabel } from '../../compensation-labels'

const router = useRouter()

// ── run 定位：与页头 RunSelector/阶段页共用 useRunContext（query 优先+记忆回落）──
const { run, remember } = useRunContext()
const loading = ref(false)
const loadError = ref('')
const runState = ref<RunStateResponse | null>(null)
const deliverables = ref<DeliverablesResponse | null>(null)
const deliverablesError = ref('')
const issues = ref<IssuesResponse | null>(null)
const issuesError = ref('')
const branches = ref<BranchesResponse | null>(null)
const branchesError = ref('')


/** 运行模式政策一句话（§1.2 运行模式旋钮口径照录） */
const POSTURE_POLICY: Record<string, string> = {
  strict: '全程不自动代处理，检验自主运行能力；停滞如实登记为问题',
  standard: '保留现有动作，每笔自动代处理都记账（用于人工/自动对账）',
  demo: '里程碑演示，允许后台自动编排，全程显著标注「演示」',
}

// ── 折算（纯函数层见 steps-registry.ts；此处仅组包） ──
/** V3：七幕分组头数据（actOfStep 已在 steps-registry） */
const stepGroups = computed(() =>
  ACTS_7.map(a => ({ act: a.act, name: a.displayName, from: a.from, to: a.to })),
)

const stepRows = computed<StepRow[]>(() =>
  runState.value ? resolveStepRows(runState.value.steps, runState.value.gates) : [])

const gateRows = computed(() =>
  runState.value ? resolveGateRows(runState.value.gates, runState.value.steps, issues.value ? issues.value.lines : null) : [])

const curAct = computed(() => {
  const dones = stepRows.value.filter(r => r.state === 'done')
  if (dones.length === 0) return 1
  const maxNo = Math.max(...dones.map(d => d.no))
  return ACTS_7.find(a => maxNo >= a.from && maxNo <= a.to)?.act ?? 1
})

const gatesPassed = computed(() => gateRows.value.filter(g => g.passed).length)
const stepsDoneComp = computed(() => countStepsDone(stepRows.value))
const stepsDoneNet = computed(() =>
  runState.value ? netStepsAvailable(stepRows.value, runState.value.ledger.byType) : 0)
const deduction = computed(() =>
  runState.value ? compDeduction(runState.value.ledger.byType) : 0)
/** 分支交付=已推 origin 的 feat 分支数（上限 6=六路 feat 编制，§2.4 步 18）；端点缺席=null 如实呈现 */
const branchesDelivered = computed<number | null>(() =>
  branches.value ? Math.min(6, branches.value.branches.filter(b => b.pushed).length) : null)

/** 交付物 14 件链=端点 13 类+完备性检查（方案 §1.3 文档链 L230；S4 勘误「13 件旧档
 *  计数承袭，实物链含完备性检查」——第 14 件端点清单未覆盖，如实缺席不硬凑） */
const deliverableChain = computed(() => {
  const fromApi = deliverables.value
    ? deliverables.value.deliverables.map(d => ({ label: d.label, status: d.status as 'present' | 'absent' | 'uncovered', file: d.file }))
    : []
  return [...fromApi, { label: '完备性检查', status: 'uncovered' as const, file: null }]
})

const byTypeList = computed(() =>
  runState.value ? Object.entries(runState.value.ledger.byType).sort((a, b) => b[1] - a[1]) : [])

// ── 锚点抽屉（R7：全产品唯一反查交互，接线照 EvidencePanel） ──
const drawerOpen = ref(false)
const drawerTitle = ref('')
const drawerEvidence = ref('')

function openStepDrawer(row: StepRow): void {
  drawerTitle.value = `步 ${row.no}·${row.name}`
  drawerEvidence.value = JSON.stringify({
    no: row.no,
    name: row.name,
    operator: row.operator,
    act: ACTS_7.find(a => a.act === row.act)?.displayName,
    state: row.state,
    doneKeys: row.doneKeys.length > 0 ? row.doneKeys : '（完成键未落——如实缺席）',
  }, null, 2)
  drawerOpen.value = true
}

// ── 加载：run-state 主端点失败=整屏如实报错；三副端点各自软失败就地呈现 ──
async function load(): Promise<void> {
  const name = run.value.trim()
  if (!name) return
  loading.value = true
  loadError.value = ''
  runState.value = null
  deliverables.value = null
  deliverablesError.value = ''
  issues.value = null
  issuesError.value = ''
  branches.value = null
  branchesError.value = ''
  const main = fetchRunState(name)
  const soft = [
    fetchDeliverables(name).then(r => { deliverables.value = r }, e => { deliverablesError.value = (e as Error).message }),
    fetchIssues(name).then(r => { issues.value = r }, e => { issuesError.value = (e as Error).message }),
    fetchBranches(name).then(r => { branches.value = r }, e => { branchesError.value = (e as Error).message }),
  ]
  try {
    runState.value = await main
    remember()
  } catch (e) {
    runState.value = null
    loadError.value = (e as Error).message
  } finally {
    await Promise.all(soft)
    loading.value = false
  }
}

watch(run, () => { if (run.value.trim()) void load() })
onMounted(() => { if (run.value.trim()) void load() })

function goSupervision(): void {
  const r = run.value.trim()
  void router.push({ name: 'ia2.simSupervision', query: r ? { run: r } : {} })
}
</script>

<template>
  <div class="ov" data-testid="ov-panel">
    <div class="ov__bar">
      <span class="ov__src" data-testid="ov-endpoints">数据来源：运行状态、交付物、问题清单与分支交付（自动汇总）· 运行记录在页头选择</span>
    </div>

    <!-- N1/N2：run 缺席=引导不造假；主端点失败=如实报错 -->
    <p v-if="loadError" class="ov__error" data-testid="ov-error">{{ loadError }}</p>
    <p v-else-if="!runState" class="ov__hint" data-testid="ov-guide">
      还没有选择运行记录——在页头下拉选择一次运行；页面数字全部来自实测。
    </p>

    <template v-if="runState">
      <!-- 运行模式横幅：三档色带+政策一句话+遗留项清算灯（红=ledger.open>0，§2.6.5 遗留项清算） -->
      <div class="ov__posture" :class="`ov__posture--${runState.posture}`" data-testid="ov-posture">
        <span class="ov__posture-name">运行模式 {{ runState.posture }}</span>
        <span class="ov__posture-policy">{{ POSTURE_POLICY[runState.posture] ?? '运行模式政策未登记' }}</span>
        <button
          v-if="runState.ledger.open > 0"
          type="button"
          class="ov__lamp ov__lamp--red ov__lamp--link"
          data-testid="ov-clearance"
          title="去⑥治理·遗留项清算处理"
          @click="router.push({ name: 'ia2.govClearance' })"
        >{{ `遗留事项 ${runState.ledger.open} 项待清算，清算前不能启动新运行 → 去清算` }}</button>
        <span
          v-else
          class="ov__lamp ov__lamp--green"
          data-testid="ov-clearance"
        >遗留事项已清算（0 项待处理）</span>
      </div>

      <!-- KPI 四卡：六闸 n/6｜分支交付 n/6｜含代偿步可用｜净计步可用（紫） -->
      <div class="ov__kpis">
        <div class="ov__kpi ov__kpi--pass" data-testid="ov-kpi-gates">
          <span class="ov__kpi-num">{{ gatesPassed }}<span class="ov__kpi-denom">/6</span></span>
          <span class="ov__kpi-label">六道质量门通过（G1-G6）</span>
        </div>
        <div class="ov__kpi ov__kpi--link" data-testid="ov-kpi-branches" title="查看分支新鲜度与交付物明细（⑤验收·交付健康）" @click="router.push({ name: 'ia2.simDelivery', query: { run } })">
          <span class="ov__kpi-num">{{ branchesDelivered === null ? '—' : `${branchesDelivered}` }}<span v-if="branchesDelivered !== null" class="ov__kpi-denom">/6</span></span>
          <span class="ov__kpi-label">分支交付（已推送远端）</span>
          <span v-if="branchesError" class="ov__kpi-absent">暂不可用：{{ branchesError }}</span>
        </div>
        <div class="ov__kpi ov__kpi--stale" data-testid="ov-kpi-steps">
          <span class="ov__kpi-num">{{ stepsDoneComp }}<span class="ov__kpi-denom">/26</span></span>
          <span class="ov__kpi-label">步骤完成（含自动代处理）</span>
        </div>
        <div class="ov__kpi ov__kpi--net" data-testid="ov-kpi-net">
          <span class="ov__kpi-num">{{ stepsDoneNet }}<span class="ov__kpi-denom">/26</span></span>
          <span class="ov__kpi-label">人工完成（扣除自动代处理 {{ deduction }} 笔）</span>
        </div>
      </div>

      <!-- 七幕旅程条：七段横条，当前幕高亮+步微刻度 -->
      <div class="ov__journey" data-testid="ov-journey">
        <div
          v-for="a in ACTS_7"
          :key="a.act"
          class="ov__act"
          :class="{ 'ov__act--cur': a.act === curAct }"
          :style="{ flexGrow: a.to - a.from + 1 }"
          :data-testid="`ov-act-${a.act}`"
        >
          <span class="ov__act-name">{{ a.displayName }}</span>
          <span class="ov__act-ticks">
            <span
              v-for="no in a.to - a.from + 1"
              :key="no"
              class="ov__tick"
              :class="`ov__tick--${stepRows[a.from + no - 2]?.state ?? 'pending'}`"
            />
          </span>
        </div>
      </div>

      <!-- 双列表：左 2/3 步骤表+交付物链；右 1/3 六道质量门+净计卡+观察窗入口 -->
      <div class="ov__grid">
        <section class="ov__main">
          <h4 class="ov__h">26 步执行状态（点击查看证据）</h4>
          <table class="ov__table" data-testid="ov-steps">
            <thead><tr><th>步</th><th>全名</th><th>操作者</th><th>状态</th><th>凭证</th></tr></thead>
            <tbody>
              <!-- V3 排版：七幕分段头行（步号连续同幕只出一条头） -->
              <tr
                v-for="g in stepGroups"
                :key="`grp-${g.act}`"
                class="ov__act-head"
                :data-testid="`ov-step-acthead-${g.act}`"
              >
                <td colspan="5">
                  <span class="ov__act-head-name">{{ g.name }}</span>
                  <span class="ov__act-head-range">步 {{ g.from }}-{{ g.to }}</span>
                </td>
              </tr>
              <tr
                v-for="row in stepRows"
                :key="row.no"
                class="ov__step"
                :class="`ov__step--${row.state}`"
                :data-testid="`ov-step-row-${row.no}`"
                role="button"
                @click="openStepDrawer(row)"
              >
                <td class="ov__step-no">{{ row.no }}</td>
                <td class="ov__step-name">{{ row.name }}</td>
                <td class="ov__step-op" :title="row.operator">{{ row.operator }}</td>
                <td class="ov__step-state">
                  <template v-if="row.state === 'done'">✓ {{ row.at }}</template>
                  <template v-else-if="row.state === 'active'">进行中</template>
                  <template v-else>未达</template>
                </td>
                <td class="ov__step-cred">
                  <SimDualCredential v-if="row.commit" :commit="row.commit" />
                  <span v-else class="ov__cred-none">—</span>
                </td>
              </tr>
            </tbody>
          </table>

          <h4 class="ov__h ov__h--link" title="去⑤验收·交付健康看分支推送与催办口径" @click="router.push({ name: 'ia2.simDelivery', query: { run } })">交付物链路（14 件，自动核对）→</h4>
          <p v-if="deliverablesError" class="ov__hint" data-testid="ov-deliverables-error">暂不可用：{{ deliverablesError }}</p>
          <ul v-else class="ov__dl" data-testid="ov-deliverables">
            <li
              v-for="(d, i) in deliverableChain"
              :key="d.label"
              class="ov__dl-item"
              :class="`ov__dl-item--${d.status}`"
              :data-testid="`ov-dl-${i}`"
            >
              <span class="ov__dl-mark">{{ d.status === 'present' ? '✅' : d.status === 'absent' ? '缺' : '未覆盖' }}</span>
              <span class="ov__dl-label">{{ d.label }}</span>
              <span v-if="d.file" class="ov__dl-file">{{ d.file }}</span>
              <span v-else-if="d.status === 'uncovered'" class="ov__dl-note">暂无对应核对标准</span>
            </li>
          </ul>
          <p v-if="deliverables" class="ov__hint">已扫描 evidence 目录 {{ deliverables.scanned }} 个文件；核实 {{ deliverables.deliverables.filter(d => d.status === 'present').length }}/13 类。</p>
        </section>

        <aside class="ov__side">
          <section class="ov__side-box" data-testid="ov-gates">
            <h4 class="ov__h">六道质量门</h4>
            <p v-if="issuesError" class="ov__hint" data-testid="ov-gate-rejects-absent">打回计数缺席：{{ issuesError }}</p>
            <ul class="ov__gates">
              <li v-for="g in gateRows" :key="g.id" class="ov__gate ov__gate--link" :data-testid="`ov-gate-${g.id}`" title="查看质量门修复单（⑥治理·质量门记录）" @click="router.push({ name: 'ia2.governance' })">
                <SimGateBadge :gate="g.id" :status="g.passed ? 'pass' : 'pending'" :first-pass="g.passed && g.rejectCount === 0" :reject-count="issuesError ? null : g.rejectCount" />
                <span v-if="g.passed" class="ov__gate-at">{{ g.at }}</span>
              </li>
            </ul>
          </section>

          <section class="ov__side-box" data-testid="ov-net">
            <h4 class="ov__h">自动代处理 <SimCompensatedTag :count="deduction" /></h4>
            <div class="ov__net-rows">
              <div class="ov__net-row">含自动代处理 {{ stepsDoneComp }}/26</div>
              <div class="ov__net-row ov__net-row--net">人工完成 {{ stepsDoneNet }}/26（= 完成 − 自动代处理）</div>
            </div>
            <p v-if="byTypeList.length === 0" class="ov__hint">没有自动代处理记录。</p>
            <ul v-else class="ov__net-types">
              <li v-for="[t, n] in byTypeList" :key="t" class="ov__net-type"><SimCompensatedTag :label="compensationLabel(t)" :count="n" /></li>
            </ul>
          </section>

          <section class="ov__side-box" data-testid="ov-watch-entry">
            <h4 class="ov__h">观察窗</h4>
            <p class="ov__hint">最新窗行与研判/判定在「监督面板」签（journal 尾读）。</p>
            <button class="ov__btn" type="button" data-testid="ov-watch-go" @click="goSupervision">去监督面板 →</button>
          </section>
        </aside>
      </div>
    </template>

    <SimAnchorDrawer :open="drawerOpen" :title="drawerTitle" :evidence="drawerEvidence" @close="drawerOpen = false" />
  </div>
</template>

<style scoped lang="scss">
.ov { display: flex; flex-direction: column; gap: 10px; }
.ov__bar { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.ov__btn {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  padding: 3px 12px;
  cursor: pointer;
  &:disabled { opacity: 0.4; }
}
.ov__src { color: var(--text-muted); font-size: 11px; font-family: var(--font-mono); }
.ov__error { color: var(--ia-fail); font-size: 12px; margin: 0; word-break: break-all; }
.ov__hint { color: var(--text-muted); font-size: 12px; margin: 0; }
.ov__posture {
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  border-radius: 6px; padding: 6px 12px; font-size: 12px;
  border: 1px solid var(--border-color);
}
.ov__posture--strict { background: rgba(18, 161, 80, 0.14); border-color: rgba(18, 161, 80, 0.4); }
.ov__posture--standard { background: rgba(217, 119, 6, 0.14); border-color: rgba(217, 119, 6, 0.4); }
.ov__posture--demo { background: rgba(150, 84, 214, 0.14); border-color: rgba(150, 84, 214, 0.4); }
.ov__posture-name { font-weight: 600; }
.ov__posture-policy { flex: 1; min-width: 200px; }
.ov__lamp {
  padding: 1px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap;
  &.ov__lamp--red { color: var(--ia-fail); background: rgba(221, 51, 51, 0.12); border: 1px solid rgba(221, 51, 51, 0.35); }
  &.ov__lamp--green { color: var(--ia-fresh); background: rgba(46, 158, 91, 0.12); border: 1px solid rgba(46, 158, 91, 0.35); }
}
.ov__kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.ov__kpi {
  border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px;
  display: flex; flex-direction: column; gap: 2px;
}
.ov__kpi--net { border-color: rgba(150, 84, 214, 0.45); background: rgba(150, 84, 214, 0.08); }
.ov__kpi-num { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ov__kpi-label { font-size: 11px; color: var(--text-muted); }
.ov__kpi-absent { font-size: 10px; color: var(--ia-stale); word-break: break-all; }
.ov__journey { display: flex; gap: 4px; }
.ov__act {
  border: 1px solid var(--border-color); border-radius: 6px;
  padding: 4px 8px; display: flex; flex-direction: column; gap: 3px; min-width: 0;
}
.ov__act--cur { border-color: var(--accent-primary); background: var(--accent-bg, rgba(127, 127, 127, 0.08)); }
.ov__act-name { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov__act-ticks { display: flex; gap: 2px; }
.ov__tick { width: 8px; height: 8px; border-radius: 2px; background: var(--ia-border-control, var(--border-color)); }
.ov__tick--done { background: var(--ia-fresh); }
.ov__tick--active { background: var(--ia-stale); }
.ov__grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 14px; }
.ov__main { min-width: 0; overflow-x: auto; }
/* 26 步表 5 列在 2/3 轨道里会横向溢出盖住右栏（2026-10-19 走查实证）：给表最小宽+容器横向滚动，右栏不再被压字。 */
.ov__table { min-width: 760px; }
.ov__h { margin: 4px 0 6px; font-size: 12px; font-weight: 600; }
.ov__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.ov__table th, .ov__table td { text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--border-color); }
.ov__step { cursor: pointer; &:hover { background: rgba(127, 127, 127, 0.08); } }
.ov__step--pending { color: var(--text-muted); }
.ov__step--active .ov__step-state { color: var(--ia-stale); }
.ov__step--done .ov__step-state { color: var(--ia-fresh); font-family: var(--font-mono); font-size: 11px; }
.ov__step-no { font-family: var(--font-mono); }
.ov__step-name { white-space: nowrap; }
.ov__step-op {
  max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  color: var(--text-muted); font-size: 11px;
}
.ov__cred-none { color: var(--text-muted); }
.ov__dl { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 14px; }
.ov__dl-item { display: flex; gap: 6px; align-items: baseline; font-size: 12px; min-width: 0; }
.ov__dl-mark { width: 2.2em; flex: none; }
.ov__dl-item--absent { color: var(--ia-fail); }
.ov__dl-item--uncovered { color: var(--ia-compensated); }
.ov__dl-label { flex: none; }
.ov__dl-file, .ov__dl-note { color: var(--text-muted); font-size: 10px; font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov__side { display: flex; flex-direction: column; gap: 10px; }
.ov__side-box { border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; }
.ov__gates { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ov__gate { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.ov__gate-at { color: var(--text-muted); font-size: 11px; font-family: var(--font-mono); }
.ov__net-rows { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.ov__net-row--net { color: var(--ia-compensated); }
.ov__net-types { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }

/* 动线批（2026-10-17）：红灯/六闸行/交付 KPI 可点化——去处都在同名功能签 */
.ov__lamp--link { background: none; border: none; padding: 0; font: inherit; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.ov__lamp--link:hover { filter: brightness(1.1); }
.ov__gate--link { cursor: pointer; }
.ov__gate--link:hover { outline: 1px solid var(--border-color); outline-offset: 2px; }
.ov__kpi--link { cursor: pointer; }
.ov__kpi--link:hover { outline: 1px solid var(--border-color); outline-offset: 2px; }
.ov__h--link { cursor: pointer; }
.ov__h--link:hover { text-decoration: underline; text-underline-offset: 3px; }
</style>
