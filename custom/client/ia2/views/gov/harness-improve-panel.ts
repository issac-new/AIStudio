// 文件职责：「治理 → 改进实验」面板的脚本逻辑（状态/派生/API 动作），SFC 只保留模板与绑定。
// 拆分纪律：纯移动，无行为变更；导出面由 HarnessImprovePanel.vue 解构使用。
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { improveMessages } from '@/custom/governance/improve-i18n'
import {
  addWorkbenchExperience,
  attachWorkbenchBaseline,
  calibrateWorkbenchNoise,
  fetchWorkbenchSurfaceArtifacts,
  markWorkbenchSurfaceApplied,
  composeWorkbenchProposal,
  deleteWorkbenchProposal,
  createWorkbenchProbes,
  createWorkbenchProposal,
  decideWorkbenchProposal,
  fetchWorkbenchOverview,
  importWorkbenchExperiences,
  promoteWorkbenchProposal,
  recordWorkbenchConstraints,
  recordWorkbenchProbe,
  rollbackWorkbenchProposal,
  type ArchiveSteppingStoneDto,
  setWorkbenchExperienceStatus,
  suggestWorkbenchProposal,
  startAutoProbe,
  submitWorkbenchProposal,
  type ExperienceDto,
  type ParetoReportDto,
  type ProbeDto,
  type ProposalDto,
  type ProposalStatus,
  type SurfaceKey,
  type WorkbenchOverviewDto,
  type ConstraintCheckDto,
} from '@/custom/governance/api/workbench'

export function useHarnessImprovePanel() {

  const i18nCtx = useI18n()
  const L = computed(() => {
    const loc = String((i18nCtx as { locale?: { value?: string } })?.locale?.value ?? 'zh')
    return improveMessages[loc.startsWith('zh') ? 'zh' : 'en']
  })

  const data = ref<WorkbenchOverviewDto | null>(null)
  const busy = ref(false)
  const error = ref('')
  const actionError = ref('')
  const showCreate = ref(false)

  interface ProposalForm {
    baselineRunId: string
    selectedVariant: string
    rationale: string
    rollbackReason: string
    actor: string
    note: string
    apply: boolean
    cue: string
    lesson: string
    evidence: string
    confidence: 'low' | 'medium' | 'high'
    autoSetId: string
    autoRegressionSetId: string
    autoMaxTasks: number
    noiseRunIds: string
  }
  const forms = reactive<Record<string, ProposalForm>>({})
  const probeInputs = reactive<Record<string, { evalRunId: string; regressionRunId: string; equalBudgetRunId: string; counterfactualRunId: string }>>({})
  const constraintTexts = reactive<Record<string, string>>({})

  const createForm = reactive({
    title: '',
    hypothesis: '',
    surfaceKey: 'system_prompt' as SurfaceKey,
    editClass: '' as '' | 'invariant' | 'domain' | 'mixed',
    targetPath: '',
    mode: 'parallel' as 'parallel' | 'sequential',
    domain: 'general',
    budgetCapUsd: 5,
    evidenceRefs: '',
    variants: [{ label: '候选 A', tree: false, content: '', files: [{ path: '', content: '' }], deletions: '' }] as Array<{
      label: string; tree: boolean; content: string; files: Array<{ path: string; content: string }>; deletions: string
    }>,
    // #5 经验库合流：引用经验新建提案（把经验 id 传入 experienceIds，激活原死字段）
    experienceIds: [] as string[],
  })

  const expForm = reactive({
    statement: '',
    surfaceKey: '' as SurfaceKey | '',
    evidenceRefs: '',
    confidence: 'medium' as 'low' | 'medium' | 'high',
  })

  // #5 经验库合流：按经验域筛选（消「导入全 general 后无法分域检索」的盲区）。
  const expDomainFilter = ref('')

  // RRSI AI 起草器（受治理 proposer）：按面起草 draft，后续仍走人工门禁。
  const suggestForm = reactive({
    surfaceKey: 'system_prompt' as SurfaceKey,
    targetPath: 'profiles/orchestrator/SOUL.md',
    profile: 'orchestrator',
  })

  /** 纯占位草稿可删（draft＋无探测＋无裁决）；有审计线索的不可删（服务端同规则把关）。 */
  function deletable(p: ProposalDto): boolean {
    return p.status === 'draft' && p.probes.length === 0 && !p.approval
  }

  async function removeProposal(p: ProposalDto): Promise<void> {
    if (!window.confirm(L.value.confirmDeleteProposal)) return
    await act(() => deleteWorkbenchProposal(p.id))
  }

  async function suggest(): Promise<void> {
    await act(() => suggestWorkbenchProposal({
      surfaceKey: suggestForm.surfaceKey,
      targetPath: suggestForm.targetPath.trim() || undefined,
      profile: suggestForm.profile.trim() || undefined,
    }))
  }

  const experienceDomains = computed<string[]>(() => {
    const all = (data.value?.experiences ?? []).map((e) => e.domain || 'general')
    return [...new Set(all)].sort()
  })

  const filteredExperiences = computed(() => {
    const all = data.value?.experiences ?? []
    if (!expDomainFilter.value) return all
    return all.filter((e) => (e.domain || 'general') === expDomainFilter.value)
  })

  function formFor(id: string): ProposalForm {
    if (!forms[id]) {
      forms[id] = {
        baselineRunId: '', selectedVariant: '', rationale: '', rollbackReason: '', actor: '', note: '',
        apply: false, cue: '', lesson: '', evidence: '', confidence: 'medium',
        autoSetId: '', autoRegressionSetId: '', autoMaxTasks: 5, noiseRunIds: '',
      }
    }
    return forms[id]
  }

  function probeInput(probeId: string): { evalRunId: string; regressionRunId: string; equalBudgetRunId: string; counterfactualRunId: string } {
    if (!probeInputs[probeId]) probeInputs[probeId] = { evalRunId: '', regressionRunId: '', equalBudgetRunId: '', counterfactualRunId: '' }
    return probeInputs[probeId]
  }

  function surfaceName(key: SurfaceKey | string): string {
    return data.value?.surfaces.find((s) => s.key === key)?.nameZh ?? String(key)
  }

  /** W2（2026-11-05）：编辑类别徽标文案；未声明如实显示。 */
  function editClassLabel(cls: 'invariant' | 'domain' | 'mixed' | null | undefined): string {
    if (cls === 'invariant') return L.value.editClassInvariant
    if (cls === 'domain') return L.value.editClassDomain
    if (cls === 'mixed') return L.value.editClassMixed
    return L.value.editClassUndeclared
  }

  const STATUS_LABEL: Record<ProposalStatus, keyof typeof improveMessages.zh> = {
    draft: 'statusDraft',
    submitted: 'statusSubmitted',
    approved: 'statusApproved',
    rejected: 'statusRejected',
    probing: 'statusProbing',
    composed: 'statusComposed',
    promoted: 'statusPromoted',
    rolled_back: 'statusRolledBack',
  }

  function statusLabel(s: ProposalStatus): string {
    return L.value[STATUS_LABEL[s]]
  }

  function contextLabel(ctx: 'always_on' | 'on_demand' | 'tool_loop'): string {
    return ctx === 'always_on' ? L.value.sourceAlwaysOn : ctx === 'on_demand' ? L.value.sourceOnDemand : L.value.sourceToolLoop
  }

  function riskLabel(r: 'low' | 'medium' | 'high'): string {
    return r === 'high' ? L.value.riskHigh : r === 'medium' ? L.value.riskMedium : L.value.riskLow
  }

  function verdictLabel(q: string | undefined): string {
    if (q === 'improved') return L.value.qualityImproved
    if (q === 'regressed') return L.value.qualityRegressed
    if (q === 'neutral') return L.value.qualityNeutral
    return L.value.qualityUnknown
  }

  function expStatusLabel(s: ExperienceDto['status']): string {
    return s === 'adopted' ? L.value.expAdopted : s === 'retired' ? L.value.expRetired : L.value.expCandidate
  }

  function fmtPct(v: number | null | undefined): string {
    return v == null ? '—' : `${(v * 100).toFixed(1)}%`
  }

  function fmtDelta(v: number | null | undefined): string {
    return v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}pp`
  }

  function fmtRatio(v: number | null | undefined): string {
    return v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`
  }

  function fmtNum(v: number | null | undefined): string {
    return v == null ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))
  }

  function fmtUsd(v: number | null | undefined): string {
    return v == null ? '—' : `$${v.toFixed(2)}`
  }

  function short(s: string | null | undefined): string {
    return s ? s.slice(0, 12) : '—'
  }

  function paretoEntryOf(p: ProposalDto, variantId: string): ParetoReportDto['entries'][number] | undefined {
    return p.derived.pareto?.entries.find((e) => e.variantId === variantId)
  }

  function freshnessLabel(f: NonNullable<ExperienceDto['freshness']>): string {
    const band = f.band === 'fresh' ? L.value.freshnessFresh : f.band === 'aging' ? L.value.freshnessAging : L.value.freshnessStale
    return `${band} ${f.confidenceScore.toFixed(2)}（${Math.round(f.ageDays)}d）`
  }

  function probeOf(p: ProposalDto, variantId: string): ProbeDto | undefined {
    return p.probes.find((x) => x.variantId === variantId)
  }

  function defaultVariant(p: ProposalDto): string {
    return p.derived.selectedVariantId ?? p.variants[0]?.id ?? ''
  }

  async function refresh(): Promise<void> {
    busy.value = true
    error.value = ''
    try {
      data.value = await fetchWorkbenchOverview()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
    } finally {
      busy.value = false
    }
  }

  async function act(fn: () => Promise<unknown>): Promise<boolean> {
    actionError.value = ''
    try {
      await fn()
      await refresh()
      return true
    } catch (e) {
      actionError.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  function splitRefs(raw: string): string[] {
    return raw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean).slice(0, 20)
  }

  async function create(): Promise<void> {
    const variants = createForm.variants
      .map((v, i) => {
        const label = v.label.trim() || `候选 ${i + 1}`
        if (v.tree) {
          const files = v.files.filter((f) => f.path.trim()).map((f) => ({ path: f.path.trim(), content: f.content }))
          if (files.length === 0) return null
          return {
            label, files,
            deletions: v.deletions.split(/[,，\n]+/).map((x) => x.trim()).filter(Boolean),
          }
        }
        return v.content.trim() ? { label, content: v.content } : null
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
    const ok = await act(() => createWorkbenchProposal({
      title: createForm.title.trim(),
      hypothesis: createForm.hypothesis.trim(),
      surfaceKey: createForm.surfaceKey,
      targetPath: createForm.targetPath.trim() || undefined,
      mode: createForm.mode,
      domain: createForm.domain.trim() || 'general',
      ...(createForm.editClass ? { editClass: createForm.editClass } : {}),
      budgetCapUsd: Number(createForm.budgetCapUsd) || 0,
      evidenceRefs: splitRefs(createForm.evidenceRefs),
      ...(createForm.experienceIds.length ? { experienceIds: createForm.experienceIds } : {}),
      variants,
    }))
    if (ok) {
      showCreate.value = false
      createForm.title = ''
      createForm.hypothesis = ''
      createForm.targetPath = ''
      createForm.evidenceRefs = ''
      createForm.domain = 'general'
      createForm.editClass = ''
      createForm.experienceIds = []
      createForm.variants = [{ label: '候选 A', tree: false, content: '', files: [{ path: '', content: '' }], deletions: '' }]
    }
  }

  function addVariant(): void {
    createForm.variants.push({
      label: `候选 ${String.fromCharCode(65 + createForm.variants.length)}`,
      tree: false, content: '', files: [{ path: '', content: '' }], deletions: '',
    })
  }

  function removeVariant(i: number): void {
    if (createForm.variants.length > 1) createForm.variants.splice(i, 1)
  }

  function addFile(v: { files: Array<{ path: string; content: string }> }): void {
    v.files.push({ path: '', content: '' })
  }

  function removeFile(v: { files: Array<{ path: string; content: string }> }, i: number): void {
    if (v.files.length > 1) v.files.splice(i, 1)
  }

  async function attachBaseline(p: ProposalDto): Promise<void> {
    await act(() => attachWorkbenchBaseline(p.id, formFor(p.id).baselineRunId.trim()))
  }

  async function submit(p: ProposalDto): Promise<void> {
    await act(() => submitWorkbenchProposal(p.id))
  }

  async function decide(p: ProposalDto, decision: 'approve' | 'reject'): Promise<void> {
    const f = formFor(p.id)
    await act(() => decideWorkbenchProposal(p.id, decision, f.actor.trim() || 'operator', f.note.trim()))
  }

  async function createProbes(p: ProposalDto): Promise<void> {
    await act(() => createWorkbenchProbes(p.id))
  }

  async function autoProbe(p: ProposalDto): Promise<void> {
    const f = formFor(p.id)
    if (!f.autoSetId.trim()) return
    await act(() => startAutoProbe(p.id, {
      setId: f.autoSetId.trim(),
      regressionSetId: f.autoRegressionSetId.trim() || undefined,
      maxTasks: Number(f.autoMaxTasks) || 5,
    }))
  }

  function autoStatusLabel(st: string): string {
    return st === 'running' ? L.value.autoRunning : st === 'stopped' ? L.value.autoStopped : st === 'failed' ? L.value.autoFailed : L.value.autoDone
  }

  function hasRunnableProbe(p: ProposalDto): boolean {
    return (p.status === 'approved' || p.status === 'probing')
      && p.probes.some((x) => x.status !== 'recorded')
      && !p.probes.some((x) => x.autoRun?.status === 'running')
  }

  async function recordProbe(p: ProposalDto, probe: ProbeDto): Promise<void> {
    const input = probeInput(probe.id)
    const f = formFor(p.id)
    await act(() => recordWorkbenchProbe(p.id, probe.id, {
      evalRunId: input.evalRunId.trim(),
      regressionRunId: input.regressionRunId.trim() || undefined,
      equalBudgetBaselineRunId: input.equalBudgetRunId.trim() || undefined,
      counterfactualRunId: input.counterfactualRunId.trim() || undefined,
      actor: f.actor.trim() || 'operator',
    }))
  }

  async function compose(p: ProposalDto): Promise<void> {
    const f = formFor(p.id)
    await act(() => composeWorkbenchProposal(p.id, {
      variantId: f.selectedVariant || defaultVariant(p),
      rationale: f.rationale.trim(),
    }))
  }

  async function promote(p: ProposalDto): Promise<void> {
    const f = formFor(p.id)
    if (f.apply && !window.confirm(L.value.confirmApply)) return
    const reflection = f.cue.trim() && f.lesson.trim() && f.evidence.trim()
      ? { cue: f.cue.trim(), lesson: f.lesson.trim(), evidence: f.evidence.trim(), confidence: f.confidence }
      : undefined
    await act(() => promoteWorkbenchProposal(p.id, f.apply, reflection))
  }

  /** R7（2026-11-01 残项）：advisory 面建议产物导出（人审后经既有管理面应用）。 */
  async function exportSurfaceArtifacts(p: ProposalDto): Promise<void> {
    const res = await fetchWorkbenchSurfaceArtifacts(p.id)
    if (!res.artifacts) return
    const blob = new Blob([res.artifacts.payload], { type: res.artifacts.kind === 'memory-items' ? 'application/json' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `surface-artifacts-${p.id}.${res.artifacts.kind === 'memory-items' ? 'json' : 'md'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** R7：人审应用完成后标记（三态 appliedVia；回读验证＝新建提案基线即生效态）。 */
  async function markApplied(p: ProposalDto): Promise<void> {
    const f = formFor(p.id)
    if (!window.confirm(L.value.markAppliedConfirm)) return
    await act(() => markWorkbenchSurfaceApplied(p.id, f.actor.trim() || 'operator'))
  }

  async function rollback(p: ProposalDto): Promise<void> {
    const f = formFor(p.id)
    await act(() => rollbackWorkbenchProposal(p.id, f.rollbackReason.trim()))
  }

  async function importExperiences(): Promise<void> {
    await act(() => importWorkbenchExperiences())
  }

  // #5：把经验加入待引用清单（创建提案时作为 experienceIds 传入，激活死字段）。
  // 同时把经验域带到提案 domain，保证「同域经验互相检索」语义贯穿。
  function citeExperience(exp: { id: string; domain?: string | null }): void {
    if (!createForm.experienceIds.includes(exp.id)) createForm.experienceIds.push(exp.id)
    if (exp.domain) createForm.domain = exp.domain
    showCreate.value = true
  }

  function unciteExperience(id: string): void {
    createForm.experienceIds = createForm.experienceIds.filter((x) => x !== id)
  }

  // #5：提案详情展示其引用的经验（experienceIds → 经验摘要，激活死字段的可视消费）。
  function citedExperiencesOf(p: { experienceIds?: string[] }): Array<{ id: string; domain?: string | null; statement: string }> {
    const ids = p.experienceIds ?? []
    if (!ids.length) return []
    const all = data.value?.experiences ?? []
    return all.filter((e) => ids.includes(e.id))
  }

  async function addExperience(): Promise<void> {
    const ok = await act(() => addWorkbenchExperience({
      surfaceKey: expForm.surfaceKey || null,
      statement: expForm.statement.trim(),
      evidenceRefs: splitRefs(expForm.evidenceRefs),
      confidence: expForm.confidence,
    }))
    if (ok) {
      expForm.statement = ''
      expForm.evidenceRefs = ''
    }
  }

  async function setExperienceStatus(exp: ExperienceDto, status: ExperienceDto['status']): Promise<void> {
    await act(() => setWorkbenchExperienceStatus(exp.id, status))
  }

  // ---------- RRSI 进化与正则化（2026-10-23 吸收轮） ----------

  /** 约束保持断言录入（D5 前端面）：每行「id | statement | pass/fail/unknown | evidenceRef」。 */
  function constraintFormFor(id: string): string {
    if (!constraintTexts[id]) constraintTexts[id] = ''
    return constraintTexts[id]
  }

  function parseConstraintLines(text: string): ConstraintCheckDto[] {
    return text.split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [id, statement, status, evidenceRef] = line.split('|').map((s) => s.trim())
      if (!id || !statement) throw new Error(L.value.constraintBadLine.replace('{line}', line))
      if (status !== 'pass' && status !== 'fail' && status !== 'unknown') {
        throw new Error(L.value.constraintBadStatus.replace('{line}', line))
      }
      return { id, statement, status, ...(evidenceRef ? { evidenceRef } : {}) }
    })
  }

  async function saveConstraints(p: ProposalDto): Promise<void> {
    const f = formFor(p.id)
    let checks: ConstraintCheckDto[]
    try {
      checks = parseConstraintLines(constraintFormFor(p.id))
    } catch (e) {
      actionError.value = e instanceof Error ? e.message : String(e)
      return
    }
    if (checks.length === 0) {
      actionError.value = L.value.constraintEmpty
      return
    }
    const ok = await act(() => recordWorkbenchConstraints(p.id, checks, f.actor.trim() || 'operator'))
    if (ok) constraintTexts[p.id] = ''
  }

  /** D3 垫脚石档案：被拒/回滚提案投影（面内全部，供新提案假设引用）。 */
  const archiveList = computed<ArchiveSteppingStoneDto[]>(() => data.value?.archive ?? [])

  /** D11 记忆压缩/遗忘策略（纯派生；执行走既有状态按钮，人裁决）。 */
  const memoryPolicy = computed(() => data.value?.memoryPolicy ?? null)

  /** R8 批量复核勾选集（2026-10-31 首批执行）：孤儿退役 / stale 引用到新提案。 */
  const orphanChecked = ref<Set<string>>(new Set())
  const staleChecked = ref<Set<string>>(new Set())

  function toggleOrphan(id: string): void {
    const s = orphanChecked.value
    if (s.has(id)) s.delete(id)
    else s.add(id)
  }

  function toggleStale(id: string): void {
    const s = staleChecked.value
    if (s.has(id)) s.delete(id)
    else s.add(id)
  }

  /** 批量退役孤儿：串行调既有 setExperienceStatus（D4 决策：不扩 REST 面）。 */
  async function retireCheckedOrphans(): Promise<void> {
    const ids = [...orphanChecked.value]
    if (!ids.length) return
    if (!window.confirm(L.value.batchRetireConfirm.replace('{n}', String(ids.length)))) return
    for (const id of ids) {
      const ok = await act(() => setWorkbenchExperienceStatus(id, 'retired'))
      if (!ok) break
    }
    orphanChecked.value = new Set()
  }

  /** 引用 stale 经验到新建提案表单（走既有 citeExperience 同款通道并弹创建表单）。 */
  function citeCheckedStale(): void {
    const ids = [...staleChecked.value]
    if (!ids.length) return
    const all = data.value?.experiences ?? []
    for (const id of ids) {
      if (!createForm.experienceIds.includes(id)) createForm.experienceIds.push(id)
    }
    const first = all.find((e) => e.id === ids[0])
    if (first?.domain) createForm.domain = first.domain
    staleChecked.value = new Set()
    showCreate.value = true
  }

  async function calibrateNoise(p: ProposalDto): Promise<void> {
    const f = formFor(p.id)
    const runIds = f.noiseRunIds.split(/[,，\n\s]+/).map((s) => s.trim()).filter(Boolean)
    await act(() => calibrateWorkbenchNoise(p.id, runIds))
  }

  const evoSurfaceKey = ref('')

  const evoSurfacesWithTimeline = computed(() => (data.value?.evolution?.surfaces ?? []).filter((s) => s.timeline.length > 0))

  const selectedEvoKey = computed<string>(() => {
    const list = evoSurfacesWithTimeline.value
    if (list.length === 0) return ''
    return evoSurfaceKey.value && list.some((s) => s.surfaceKey === evoSurfaceKey.value)
      ? evoSurfaceKey.value
      : list[0].surfaceKey
  })

  const selectedEvo = computed(() => evoSurfacesWithTimeline.value.find((s) => s.surfaceKey === selectedEvoKey.value) ?? null)

  const CURVE_W = 320
  const CURVE_H = 120
  const CURVE_PAD = 10

  /** SVG 进化曲线几何：纵轴=通过率（含噪声带端点定界），横轴=轮次；噪声带画 ±δ 竖带。 */
  const curve = computed<{ points: Array<{ x: number; y: number; bandTop: number | null; bandBottom: number | null; rolledBack: boolean; round: number }>; yMin: number; yMax: number } | null>(() => {
    const evo = selectedEvo.value
    if (!evo) return null
    const rounds = evo.timeline.filter((r) => r.passAt1 != null)
    if (rounds.length === 0) return null
    const vals: number[] = []
    for (const r of rounds) {
      const v = r.passAt1 as number
      vals.push(v)
      if (r.noiseDelta != null) vals.push(v + r.noiseDelta, v - r.noiseDelta)
    }
    let yMin = Math.min(...vals)
    let yMax = Math.max(...vals)
    if (yMax - yMin < 0.02) { yMin -= 0.02; yMax += 0.02 }
    const span = yMax - yMin
    yMin -= span * 0.08
    yMax += span * 0.08
    const n = rounds.length
    const yOf = (v: number): number => CURVE_H - CURVE_PAD - ((v - yMin) / (yMax - yMin)) * (CURVE_H - 2 * CURVE_PAD)
    const xOf = (i: number): number => CURVE_PAD + (n === 1 ? (CURVE_W - 2 * CURVE_PAD) / 2 : (i / (n - 1)) * (CURVE_W - 2 * CURVE_PAD))
    const points = rounds.map((r, i) => {
      const v = r.passAt1 as number
      const x = xOf(i)
      return {
        x,
        y: yOf(v),
        bandTop: r.noiseDelta != null ? yOf(v + r.noiseDelta) : null,
        bandBottom: r.noiseDelta != null ? yOf(v - r.noiseDelta) : null,
        rolledBack: r.rolledBack,
        round: r.round,
      }
    })
    return { points, yMin, yMax }
  })

  const curvePath = computed(() => {
    if (!curve.value) return ''
    return curve.value.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  })

  /** overview 的提案按 updatedAt 倒序，取该面最新一条读「本轮最大捆绑」。 */
  function latestProposalOfSurface(key: SurfaceKey): ProposalDto | null {
    const list = (data.value?.proposals ?? []).filter((p) => p.surfaceKey === key)
    return list.length > 0 ? list[0] : null
  }

  onMounted(() => void refresh())

  return {
    L, data, busy, error, actionError, showCreate, constraintTexts, createForm, expForm, expDomainFilter, suggestForm, deletable, removeProposal, suggest, experienceDomains, filteredExperiences, formFor, probeInput, surfaceName, editClassLabel, statusLabel, contextLabel, riskLabel, verdictLabel, expStatusLabel, fmtPct, fmtDelta, fmtRatio, fmtNum, fmtUsd, short, paretoEntryOf, freshnessLabel, probeOf, refresh, create, addVariant, removeVariant, addFile, removeFile, attachBaseline, submit, decide, createProbes, autoProbe, autoStatusLabel, hasRunnableProbe, recordProbe, compose, promote, exportSurfaceArtifacts, markApplied, rollback, importExperiences, citeExperience, citedExperiencesOf, addExperience, setExperienceStatus, saveConstraints, archiveList, memoryPolicy, orphanChecked, staleChecked, toggleOrphan, toggleStale, retireCheckedOrphans, citeCheckedStale, calibrateNoise, evoSurfaceKey, evoSurfacesWithTimeline, selectedEvoKey, selectedEvo, CURVE_W, CURVE_H, CURVE_PAD, curve, curvePath, latestProposalOfSurface
  }
}
