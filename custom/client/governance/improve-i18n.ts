// overlay/custom/client/governance/improve-i18n.ts
// 「改进实验」页签本地小字典（同 governance/i18n 与 i18n-tabs 先例，不依赖全局 locale 树）。
// 文案纪律：说人话、先结论后口径；缺数据用「—」，不造数。

export interface ImproveCopy {
  title: string
  sub: string
  refresh: string
  loading: string
  loadFailed: string
  surfacesTitle: string
  surfacesSub: string
  managed: string
  advisory: string
  riskLow: string
  riskMedium: string
  riskHigh: string
  artifactCount: string
  revision: string
  noArtifacts: string
  expected: string
  managedBy: string
  proposalsTitle: string
  proposalsSub: string
  emptyProposals: string
  newProposal: string
  formTitle: string
  formHypothesis: string
  formSurface: string
  formTarget: string
  formTargetHint: string
  formBudget: string
  formMode: string
  formDomain: string
  sourceMap: string
  sourceAlwaysOn: string
  sourceOnDemand: string
  sourceToolLoop: string
  diversity: string
  reflectionTitle: string
  reflectionCue: string
  reflectionLesson: string
  reflectionEvidence: string
  reflectionHint: string
  formParallel: string
  formSequential: string
  formEvidence: string
  formEvidenceHint: string
  formVariants: string
  formVariant: string
  formVariantContent: string
  formVariantMode: string
  formModeSingle: string
  formModeTree: string
  formFiles: string
  formFilePath: string
  formFileContent: string
  formDeletions: string
  formDeletionsHint: string
  addFile: string
  removeFile: string
  fileCount: string
  deletionsCount: string
  addVariant: string
  removeVariant: string
  create: string
  cancel: string
  creating: string
  createFailed: string
  statusDraft: string
  statusSubmitted: string
  statusApproved: string
  statusRejected: string
  statusProbing: string
  statusComposed: string
  statusPromoted: string
  statusRolledBack: string
  approvalApproved: string
  approvalRejected: string
  approvalNone: string
  approvedBy: string
  baseline: string
  baselineHint: string
  attachBaseline: string
  baselineRunId: string
  baselineMissing: string
  submit: string
  approve: string
  reject: string
  actor: string
  note: string
  probes: string
  createProbes: string
  probePlanned: string
  probeRecorded: string
  evalRunId: string
  regressionRunId: string
  record: string
  recordHint: string
  variants: string
  diff: string
  quality: string
  qualityImproved: string
  qualityRegressed: string
  qualityNeutral: string
  qualityUnknown: string
  passAt1: string
  trajectory: string
  tokens: string
  cost: string
  latency: string
  regression: string
  compose: string
  composeHint: string
  composeRationale: string
  selectedVariant: string
  composeAction: string
  promote: string
  promoteApply: string
  promoteApplyHint: string
  promoteAction: string
  rollback: string
  rollbackReason: string
  rollbackAction: string
  gate: string
  gateOk: string
  gateBlocked: string
  warnings: string
  experiencesTitle: string
  experiencesSub: string
  emptyExperiences: string
  importExperiences: string
  imported: string
  newExperience: string
  experienceStatement: string
  experienceConfidence: string
  confidenceLow: string
  confidenceMedium: string
  confidenceHigh: string
  adopt: string
  retire: string
  expCandidate: string
  expAdopted: string
  expRetired: string
  general: string
  filterByDomain: string
  citeForProposal: string
  citedExperiences: string
  boundary: string
  actionFailed: string
  confirmApply: string
  autoProbe: string
  autoProbeHint: string
  autoSetId: string
  autoRegressionSetId: string
  autoMaxTasks: string
  autoRun: string
  autoRunning: string
  autoStopped: string
  autoFailed: string
  autoDone: string
  autoProgress: string
  autoEstimated: string
  autoBudgetStop: string
}

export const improveMessages: Record<'zh' | 'en', ImproveCopy> = {
  zh: {
    title: '改进实验',
    sub: '把「改哪里、凭什么、花了多少、有没有倒退、谁批准、怎么回滚」做成一条可审计的闭环。',
    refresh: '刷新',
    loading: '加载中…',
    loadFailed: '加载失败',
    surfacesTitle: '可编辑面',
    surfacesSub: '八类可编辑面按真实产物登记；只有系统提示词与 Skills 可直接写入，其余六面只出建议。',
    managed: '可写入',
    advisory: '只建议',
    riskLow: '低风险',
    riskMedium: '中风险',
    riskHigh: '高风险',
    artifactCount: '产物',
    revision: '修订',
    noArtifacts: '未发现产物',
    expected: '应有位置',
    managedBy: '管理面',
    proposalsTitle: '改进提案',
    proposalsSub: '一个提案 = 一个假设 + K 个候选；每个候选必须绑定真实评测运行，回归通过且批准有效才能晋级。',
    emptyProposals: '还没有提案。先选一个面，写清假设和候选内容。',
    newProposal: '新建提案',
    formTitle: '标题',
    formHypothesis: '改进假设（改什么、预期改善什么）',
    formSurface: '可编辑面',
    formTarget: '目标文件（相对 HERMES_HOME）',
    formTargetHint: '可写面必须填写已存在文件，例如 profiles/orchestrator/SOUL.md；建议面可填锚点或留空。',
    formBudget: '预算上限（美元）',
    formMode: '探索方式',
    formDomain: '经验域（同域经验才互相检索）',
    sourceMap: '源码映射',
    sourceAlwaysOn: '常驻上下文',
    sourceOnDemand: '按需加载',
    sourceToolLoop: '工具循环内',
    diversity: '候选多样性',
    reflectionTitle: '采纳后沉淀经验（可选）',
    reflectionCue: '触发线索（什么情况下用）',
    reflectionLesson: '可迁移教训',
    reflectionEvidence: '证据（运行/回归/对比）',
    reflectionHint: '线索、教训、证据三项齐备才入库；采纳后写入域内经验库并附 harness 快照。',
    formParallel: '并行探索（K 个候选同场对比）',
    formSequential: '顺序加深（逐步递进）',
    formEvidence: '证据引用（逗号分隔）',
    formEvidenceHint: '例如 task:DEV-123、run:run-xxx、audit:事件 id；提交前至少一条。',
    formVariants: '候选修改',
    formVariant: '候选',
    formVariantContent: '候选内容',
    formVariantMode: '候选形态',
    formModeSingle: '单文件',
    formModeTree: '多文件树',
    formFiles: '文件清单',
    formFilePath: '文件路径（相对 HERMES_HOME）',
    formFileContent: '文件内容',
    formDeletions: '删除文件（每行一个路径）',
    formDeletionsHint: '删除路径也必须在可写根内；回滚会恢复被删内容。',
    addFile: '加一个文件',
    removeFile: '删除文件',
    fileCount: '文件数',
    deletionsCount: '删除',
    addVariant: '加一个候选',
    removeVariant: '删除',
    create: '创建草稿',
    cancel: '取消',
    creating: '创建中…',
    createFailed: '创建失败',
    statusDraft: '草稿',
    statusSubmitted: '已提交',
    statusApproved: '已批准',
    statusRejected: '已驳回',
    statusProbing: '探测中',
    statusComposed: '已组合',
    statusPromoted: '已晋级',
    statusRolledBack: '已回滚',
    approvalApproved: '已批准',
    approvalRejected: '已驳回',
    approvalNone: '未裁决',
    approvedBy: '裁决人',
    baseline: '基线',
    baselineHint: '绑定一次真实评测运行作为对照；候选探测与它比较。',
    attachBaseline: '绑定基线',
    baselineRunId: '基线评测运行 id',
    baselineMissing: '未绑定基线，不能提交。',
    submit: '提交',
    approve: '批准',
    reject: '驳回',
    actor: '操作人',
    note: '备注',
    probes: '探测',
    createProbes: '为全部候选建探测',
    probePlanned: '待记录',
    probeRecorded: '已记录',
    evalRunId: '候选评测运行 id',
    regressionRunId: '回归运行 id（回归样本库）',
    record: '记录探测',
    recordHint: '证据只从 Eval Studio 真实运行拉取；找不到运行会被拒绝，不能手填指标。',
    variants: '候选',
    diff: '改动',
    quality: '质量判定',
    qualityImproved: '提升',
    qualityRegressed: '倒退',
    qualityNeutral: '持平',
    qualityUnknown: '证据不足',
    passAt1: 'pass@1',
    trajectory: '轨迹通过率',
    tokens: 'Token',
    cost: '成本',
    latency: '时延',
    regression: '回归',
    compose: '组合',
    composeHint: '从已探测候选里选一个（合并内容须与某个已探测候选摘要一致，否则没有证据）。',
    composeRationale: '组合理由',
    selectedVariant: '选中候选',
    composeAction: '确认组合',
    promote: '晋级',
    promoteApply: '同时写入目标文件',
    promoteApplyHint: '只有可写面、且服务端 HARNESS2_APPLY=1 时才真正写盘；否则只登记冠军。',
    promoteAction: '尝试晋级',
    rollback: '回滚',
    rollbackReason: '回滚原因',
    rollbackAction: '回滚冠军',
    gate: '晋级门禁',
    gateOk: '门禁通过',
    gateBlocked: '门禁阻塞',
    warnings: '警告',
    experiencesTitle: '经验库',
    experiencesSub: '跨任务保留有执行证据的经验；经验指导下一次提议，不自动改行为。',
    emptyExperiences: '还没有经验。可从已批准的经验候选导入，或手工新增。',
    importExperiences: '导入已批准经验候选',
    imported: '已导入',
    newExperience: '新增经验',
    experienceStatement: '经验陈述',
    experienceConfidence: '置信度',
    confidenceLow: '低',
    confidenceMedium: '中',
    confidenceHigh: '高',
    adopt: '采纳',
    retire: '退役',
    expCandidate: '候选',
    expAdopted: '已采纳',
    expRetired: '已退役',
    general: '通用',
    filterByDomain: '按经验域筛选',
    citeForProposal: '引用新建提案',
    citedExperiences: '引用经验',
    boundary: '边界：本页不替用户跑模型；探测必须绑定真实评测运行。可直接写盘仅系统提示词与 Skills，且需人工批准 + HARNESS2_APPLY=1；其余六面只出建议。',
    actionFailed: '操作失败',
    confirmApply: '将把候选内容写入目标文件（写前快照，可回滚）。确认继续？',
    autoProbe: '一键自动探测',
    autoProbeHint: '批准后自动物化候选到隔离环境并发起真实评测，逐题记成本、超支硬停；含脚本/插件的候选禁跑。',
    autoSetId: '评测集 id',
    autoRegressionSetId: '回归集 id（可选）',
    autoMaxTasks: '最多题数',
    autoRun: '自动探测',
    autoRunning: '运行中',
    autoStopped: '已停止',
    autoFailed: '失败',
    autoDone: '完成',
    autoProgress: '进度',
    autoEstimated: '估值记账',
    autoBudgetStop: '预算硬停',
  },
  en: {
    title: 'Improvement experiments',
    sub: 'An auditable loop for what changes, on what evidence, at what cost, with what regression, who approved, and how to roll back.',
    refresh: 'Refresh',
    loading: 'Loading…',
    loadFailed: 'Load failed',
    surfacesTitle: 'Editable surfaces',
    surfacesSub: 'Eight surfaces registered from real artifacts; only system prompt and Skills are writable, the other six are advisory.',
    managed: 'Writable',
    advisory: 'Advisory',
    riskLow: 'Low risk',
    riskMedium: 'Medium risk',
    riskHigh: 'High risk',
    artifactCount: 'Artifacts',
    revision: 'Revision',
    noArtifacts: 'No artifacts found',
    expected: 'Expected location',
    managedBy: 'Managed by',
    proposalsTitle: 'Proposals',
    proposalsSub: 'A proposal is one hypothesis plus K candidates; each candidate must bind a real eval run, and promotion needs a clean regression and valid approval.',
    emptyProposals: 'No proposals yet. Pick a surface, state the hypothesis, add candidates.',
    newProposal: 'New proposal',
    formTitle: 'Title',
    formHypothesis: 'Hypothesis (what changes, what should improve)',
    formSurface: 'Surface',
    formTarget: 'Target file (relative to HERMES_HOME)',
    formTargetHint: 'Writable surfaces require an existing file, e.g. profiles/orchestrator/SOUL.md; advisory surfaces may leave it empty.',
    formBudget: 'Budget cap (USD)',
    formMode: 'Exploration mode',
    formDomain: 'Experience domain (retrieval is domain-scoped)',
    sourceMap: 'Source mapping',
    sourceAlwaysOn: 'Always on',
    sourceOnDemand: 'On demand',
    sourceToolLoop: 'Inside tool loop',
    diversity: 'Candidate diversity',
    reflectionTitle: 'Distil experience after adoption (optional)',
    reflectionCue: 'Cue (when to use it)',
    reflectionLesson: 'Transferable lesson',
    reflectionEvidence: 'Evidence (run/regression/contrast)',
    reflectionHint: 'Only stored when cue, lesson and evidence are all present; the adopted harness snapshot is kept with it.',
    formParallel: 'Parallel (compare K candidates)',
    formSequential: 'Sequential (refine step by step)',
    formEvidence: 'Evidence refs (comma separated)',
    formEvidenceHint: 'e.g. task:DEV-123, run:run-xxx, audit:event-id; at least one before submit.',
    formVariants: 'Candidate edits',
    formVariant: 'Candidate',
    formVariantContent: 'Candidate content',
    formVariantMode: 'Candidate form',
    formModeSingle: 'Single file',
    formModeTree: 'Multi-file tree',
    formFiles: 'Files',
    formFilePath: 'File path (relative to HERMES_HOME)',
    formFileContent: 'File content',
    formDeletions: 'Deleted files (one path per line)',
    formDeletionsHint: 'Deleted paths must also stay inside writable roots; rollback restores the deleted content.',
    addFile: 'Add file',
    removeFile: 'Remove file',
    fileCount: 'Files',
    deletionsCount: 'deleted',
    addVariant: 'Add candidate',
    removeVariant: 'Remove',
    create: 'Create draft',
    cancel: 'Cancel',
    creating: 'Creating…',
    createFailed: 'Create failed',
    statusDraft: 'Draft',
    statusSubmitted: 'Submitted',
    statusApproved: 'Approved',
    statusRejected: 'Rejected',
    statusProbing: 'Probing',
    statusComposed: 'Composed',
    statusPromoted: 'Promoted',
    statusRolledBack: 'Rolled back',
    approvalApproved: 'Approved',
    approvalRejected: 'Rejected',
    approvalNone: 'No decision',
    approvedBy: 'Decided by',
    baseline: 'Baseline',
    baselineHint: 'Bind a real eval run as the control; candidate probes are compared against it.',
    attachBaseline: 'Bind baseline',
    baselineRunId: 'Baseline eval run id',
    baselineMissing: 'No baseline bound; cannot submit.',
    submit: 'Submit',
    approve: 'Approve',
    reject: 'Reject',
    actor: 'Actor',
    note: 'Note',
    probes: 'Probes',
    createProbes: 'Create probes for all candidates',
    probePlanned: 'Planned',
    probeRecorded: 'Recorded',
    evalRunId: 'Candidate eval run id',
    regressionRunId: 'Regression run id (regression suite)',
    record: 'Record probe',
    recordHint: 'Evidence is pulled from real Eval Studio runs; unknown runs are rejected, manual metrics are not accepted.',
    variants: 'Candidates',
    diff: 'Diff',
    quality: 'Quality',
    qualityImproved: 'Improved',
    qualityRegressed: 'Regressed',
    qualityNeutral: 'Neutral',
    qualityUnknown: 'Insufficient evidence',
    passAt1: 'pass@1',
    trajectory: 'Trajectory pass rate',
    tokens: 'Tokens',
    cost: 'Cost',
    latency: 'Latency',
    regression: 'Regression',
    compose: 'Compose',
    composeHint: 'Pick one probed candidate (merged content must match a probed candidate digest, otherwise there is no evidence).',
    composeRationale: 'Composition rationale',
    selectedVariant: 'Selected candidate',
    composeAction: 'Compose',
    promote: 'Promote',
    promoteApply: 'Also write the target file',
    promoteApplyHint: 'Only writable surfaces with server-side HARNESS2_APPLY=1 actually write; otherwise only the champion is recorded.',
    promoteAction: 'Try promote',
    rollback: 'Rollback',
    rollbackReason: 'Rollback reason',
    rollbackAction: 'Roll back champion',
    gate: 'Promotion gate',
    gateOk: 'Gate passed',
    gateBlocked: 'Blocked',
    warnings: 'Warnings',
    experiencesTitle: 'Experience library',
    experiencesSub: 'Evidence-backed lessons kept across tasks; they guide the next proposal, never change behavior automatically.',
    emptyExperiences: 'No experiences yet. Import approved candidates or add one manually.',
    importExperiences: 'Import approved experience candidates',
    imported: 'Imported',
    newExperience: 'New experience',
    experienceStatement: 'Statement',
    experienceConfidence: 'Confidence',
    confidenceLow: 'Low',
    confidenceMedium: 'Medium',
    confidenceHigh: 'High',
    adopt: 'Adopt',
    retire: 'Retire',
    expCandidate: 'Candidate',
    expAdopted: 'Adopted',
    expRetired: 'Retired',
    general: 'General',
    filterByDomain: 'Filter by domain',
    citeForProposal: 'Cite in new proposal',
    citedExperiences: 'Cited experiences',
    boundary: 'Boundary: this page does not run models for you; probes must bind real eval runs. Only system prompt and Skills are writable, and only with human approval + HARNESS2_APPLY=1; the other six surfaces are advisory.',
    actionFailed: 'Action failed',
    confirmApply: 'This writes the candidate into the target file (snapshot first, rollback supported). Continue?',
    autoProbe: 'Auto probe',
    autoProbeHint: 'After approval, materializes candidates into an isolated home and starts real eval runs; per-task real cost with a hard budget stop; candidates with scripts/plugins are refused.',
    autoSetId: 'Eval set id',
    autoRegressionSetId: 'Regression set id (optional)',
    autoMaxTasks: 'Max tasks',
    autoRun: 'Auto probe',
    autoRunning: 'Running',
    autoStopped: 'Stopped',
    autoFailed: 'Failed',
    autoDone: 'Done',
    autoProgress: 'Progress',
    autoEstimated: 'estimated',
    autoBudgetStop: 'Budget stop',
  },
}
