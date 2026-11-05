/**
 * Eval Studio REST（/api/hermes/eval/*）——spec: 2026-10-07-eval-studio-design.md §4.8。
 *
 * GET  /api/hermes/eval/sets                       评测集元数据列表（密封契约：永不携带题目内容）
 * POST /api/hermes/eval/sets                       建集（校验：risk 断言 expect 必须 'no' 等）
 * GET  /api/hermes/eval/sets/:id                   详情（密封集只回元数据）
 * POST /api/hermes/eval/sets/:id/seal              密封（此后内容不出库、改题须 Rubric Loop 留痕）
 * GET  /api/hermes/eval/sets/:id/export            导出（密封集拒绝）
 * POST /api/hermes/eval/sets/:id/dimensions        能力维度批量标注/种子族回填 {assignments?|backfill:'redteam-seed'|'enterprise-seed'}
 * POST /api/hermes/eval/sets/:id/tasks/:taskId/rubric  Rubric 修订（密封集须带 iterationId 留痕）
 * POST /api/hermes/eval/runs                       发起回放判分运行 {setId, samples, target?, crossValidate?}
 * GET  /api/hermes/eval/runs?setId=                运行摘要列表（不含 attempt 明细）
 * GET  /api/hermes/eval/runs/:id                   运行报告（密封集只回聚合——防探测：逐条对错可被重试探测）
 * GET  /api/hermes/eval/runs/compare?base=&head=   A/B 对比（同集两 run 逐任务翻转表+读数 delta；密封集拒绝）
 * POST /api/hermes/eval/runs/:id/reflow            坏例回流（失败任务一键转回归样本库，带溯源；幂等）
 * POST /api/hermes/eval/badcase/distill            失败样本五要素提炼入回归库（根因/禁忌动作/步数红线；dryRun 可预览；
 *                                                   judgeAttribution=true 附裁判端归因复核，四态入台账不改主判）
 * POST /api/hermes/eval/badcase/variants           坏例蓝本五维反事实变体扩产（默认 10 条，幂等；变体不可再当蓝本）
 * GET  /api/hermes/eval/flywheel                   数据飞轮读数（转化漏斗/根因聚类/坏例通过率退化门）
 * GET  /api/hermes/eval/flywheel/fewshot?query=    Few-shot 记忆按相似度召回（台账三元组；无相关历史=空）
 * POST /api/hermes/eval/flywheel/merge-gate        合入门试算（Prompt/模型/编排三类变更 → 回归库门 fail-closed）
 * POST /api/hermes/eval/runs/:id/verdicts          人工仲裁（冲突/unknown 断言的最终裁决）
 * POST /api/hermes/eval/runs/:id/attributions      归因双 Loop（finding=judge_wrong/rubric_ambiguous → Rubric Loop；
 *                                                   route=agent → 指回 review 域既有流程）
 * GET  /api/hermes/eval/runs/:id/iterations        该运行的 Rubric Loop 账本
 *
 * 归属：单租户信任模型（与 evidence 域同口径），写操作记 actor 痕。
 * 挂载：B 类 patch（M2 落），在 bootstrap/routes.ts。
 */
import Router from '@koa/router'
import { mountRedteam } from '../redteam/routes'
import { setsHandlers } from './routes/sets'
import { runsHandlers } from './routes/runs'
import { analysisHandlers } from './routes/analysis'

const router = new Router({ prefix: '/api/hermes/eval' })

// ---------- sets ----------
router.post('/sample-from-trace', setsHandlers.postSampleFromTrace)
router.post('/sample-span-from-trace', setsHandlers.postSampleSpanFromTrace)
router.post('/reflow-from-trace', setsHandlers.postReflowFromTrace)
router.get('/sets', setsHandlers.getSets)
router.post('/sets', setsHandlers.postSets)
router.post('/sets/redteam-seed', setsHandlers.postSetsRedteamSeed)
router.post('/sets/redteam-variants', setsHandlers.postSetsRedteamVariants)
router.post('/sets/enterprise-seed', setsHandlers.postSetsEnterpriseSeed)
router.post('/sets/fault-seed', setsHandlers.postSetsFaultSeed)
router.get('/sets/:id', setsHandlers.getSetsId)
router.post('/sets/:id/seal', setsHandlers.postSetsIdSeal)
router.post('/sets/:id/calibrate', setsHandlers.postSetsIdCalibrate)
router.post('/sets/:id/clarifications', setsHandlers.postSetsIdClarifications)
router.get('/sets/:id/export', setsHandlers.getSetsIdExport)
router.post('/sets/:id/dimensions', setsHandlers.postSetsIdDimensions)
router.post('/sets/:id/tasks/:taskId/rubric', setsHandlers.postSetsIdTasksTaskIdRubric)
router.post('/sets/:id/tasks/:taskId/synthesize', setsHandlers.postSetsIdTasksTaskIdSynthesize)
router.get('/sets/:id/revisions', setsHandlers.getSetsIdRevisions)
router.get('/sets/:id/revisions/:revision', setsHandlers.getSetsIdRevisionsRevision)
// ---------- runs ----------
router.post('/runs', runsHandlers.postRuns)
router.get('/runs', runsHandlers.getRuns)
router.post('/runs/:id/rerun', runsHandlers.postRunsIdRerun)
router.post('/runs/:id/remediations', runsHandlers.postRunsIdRemediations)
router.get('/runs/:id/remediations', runsHandlers.getRunsIdRemediations)
router.get('/remediations', runsHandlers.getRemediations)
router.post('/remediations/:id/verify', runsHandlers.postRemediationsIdVerify)
router.get('/runs/compare', runsHandlers.getRunsCompare)
router.post('/runs/:id/reflow', runsHandlers.postRunsIdReflow)
router.post('/badcase/distill', runsHandlers.postBadcaseDistill)
router.post('/badcase/variants', runsHandlers.postBadcaseVariants)
router.get('/flywheel', runsHandlers.getFlywheel)
router.get('/flywheel/fewshot', runsHandlers.getFlywheelFewshot)
router.post('/flywheel/merge-gate', runsHandlers.postFlywheelMergeGate)
router.post('/skill-grade', runsHandlers.postSkillGrade)
router.get('/runs/:id', runsHandlers.getRunsId)
router.post('/runs/:id/verdicts', runsHandlers.postRunsIdVerdicts)
// ---------- analysis ----------
router.get('/runs/:id/agreement', analysisHandlers.getRunsIdAgreement)
router.get('/runs/:id/release-hold', analysisHandlers.getRunsIdReleaseHold)
router.post('/blind-reviews/trimmed-mean', analysisHandlers.postBlindReviewsTrimmedMean)
router.get('/runs/:id/evaluators', analysisHandlers.getRunsIdEvaluators)
router.get('/runs/:id/evidence', analysisHandlers.getRunsIdEvidence)
router.post('/runs/:id/live-evidence', analysisHandlers.postRunsIdLiveEvidence)
router.post('/runs/:id/attributions', analysisHandlers.postRunsIdAttributions)
router.get('/runs/:id/iterations', analysisHandlers.getRunsIdIterations)
router.get('/iterations', analysisHandlers.getIterations)
router.get('/oracle/cases', analysisHandlers.getOracleCases)
router.post('/oracle/cases', analysisHandlers.postOracleCases)
router.post('/oracle/cases/:id/run', analysisHandlers.postOracleCasesIdRun)
router.get('/oracle/runs', analysisHandlers.getOracleRuns)
router.get('/metric-registry', analysisHandlers.getMetricRegistry)
router.get('/outcome-verifiers', analysisHandlers.getOutcomeVerifiers)
router.get('/behavior-signals', analysisHandlers.getBehaviorSignals)
router.get('/runs/:id/business-summary', analysisHandlers.getRunsIdBusinessSummary)
router.post('/e2e-verdict', analysisHandlers.postE2eVerdict)

// 红队路由挂在同一前缀下（/api/hermes/eval/redteam/*），零新增 patch。
mountRedteam(router)

export const evalRoutes = router
