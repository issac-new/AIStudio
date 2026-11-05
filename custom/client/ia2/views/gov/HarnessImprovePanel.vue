<!-- overlay/custom/client/ia2/views/gov/HarnessImprovePanel.vue
     Harness² 改进实验台（2026-10-19 调研轮）：⑥治理 → 改进实验。
     四段：可编辑面 / 改进提案（提出-探测-组合-晋级-回滚）/ 经验库 / 边界。
     纪律：本页不跑模型；探测只认 Eval Studio 真实运行；缺证据标「—」，不放行。 -->
<script setup lang="ts">
import { useHarnessImprovePanel } from './harness-improve-panel'

const {
  L,
  data,
  busy,
  error,
  actionError,
  showCreate,
  constraintTexts,
  createForm,
  expForm,
  expDomainFilter,
  suggestForm,
  deletable,
  removeProposal,
  suggest,
  experienceDomains,
  filteredExperiences,
  formFor,
  probeInput,
  surfaceName,
  statusLabel,
  contextLabel,
  riskLabel,
  verdictLabel,
  expStatusLabel,
  fmtPct,
  fmtDelta,
  fmtRatio,
  fmtNum,
  fmtUsd,
  short,
  paretoEntryOf,
  freshnessLabel,
  probeOf,
  refresh,
  create,
  addVariant,
  removeVariant,
  addFile,
  removeFile,
  attachBaseline,
  submit,
  decide,
  createProbes,
  autoProbe,
  autoStatusLabel,
  hasRunnableProbe,
  recordProbe,
  compose,
  promote,
  exportSurfaceArtifacts,
  markApplied,
  rollback,
  importExperiences,
  citeExperience,
  citedExperiencesOf,
  addExperience,
  setExperienceStatus,
  saveConstraints,
  archiveList,
  memoryPolicy,
  orphanChecked,
  staleChecked,
  toggleOrphan,
  toggleStale,
  retireCheckedOrphans,
  citeCheckedStale,
  calibrateNoise,
  evoSurfaceKey,
  evoSurfacesWithTimeline,
  selectedEvoKey,
  selectedEvo,
  CURVE_W,
  CURVE_H,
  CURVE_PAD,
  curve,
  curvePath,
  latestProposalOfSurface,
  editClassLabel,
} = useHarnessImprovePanel()
</script>


<template>
  <div class="hi" data-testid="harness-improve">
    <header class="hi__bar">
      <div>
        <h2 class="hi__title">{{ L.title }}</h2>
        <p class="hi__sub">{{ L.sub }}</p>
      </div>
      <button type="button" class="hi__btn" data-testid="hi-refresh" :disabled="busy" @click="refresh()">
        {{ busy ? L.loading : L.refresh }}
      </button>
    </header>

    <div v-if="error" class="hi__error" data-testid="hi-error">{{ L.loadFailed }}：{{ error }}</div>
    <div v-if="actionError" class="hi__error" data-testid="hi-action-error">{{ L.actionFailed }}：{{ actionError }}</div>

    <template v-if="data">
      <div class="hi__summary" data-testid="hi-summary">
        <div class="hi__stat"><b>{{ data.counts.surfaces }}</b><span>{{ L.surfacesTitle }}（{{ L.managed }} {{ data.counts.managedSurfaces }}）</span></div>
        <div class="hi__stat"><b>{{ data.counts.openProposals }}</b><span>{{ L.proposalsTitle }}</span></div>
        <div class="hi__stat"><b>{{ data.counts.recordedProbes }}</b><span>{{ L.probes }}</span></div>
        <div class="hi__stat"><b>{{ data.counts.champions }}</b><span>{{ L.promote }}</span></div>
        <div class="hi__stat"><b>{{ fmtUsd(data.budget.observedUsd) }}</b><span>{{ L.formBudget }}</span></div>
      </div>

      <section class="hi__section" data-testid="hi-surfaces">
        <div class="hi__sectionHead">
          <h3>{{ L.surfacesTitle }}</h3>
          <p>{{ L.surfacesSub }}</p>
        </div>
        <div class="hi__surfaces">
          <article
            v-for="s in data.surfaces" :key="s.key" class="hi__surface"
            :class="{ 'hi__surface--off': !s.available }" :data-testid="`hi-surface-${s.key}`"
          >
            <div class="hi__surfaceTop">
              <strong>{{ s.nameZh }}</strong>
              <span class="hi__chip" :class="s.applyMode === 'managed' ? 'hi__chip--ok' : 'hi__chip--muted'">
                {{ s.applyMode === 'managed' ? L.managed : L.advisory }}
              </span>
              <span class="hi__chip" :class="`hi__chip--risk-${s.risk}`">{{ riskLabel(s.risk) }}</span>
            </div>
            <div class="hi__meta">{{ L.artifactCount }} {{ s.artifacts.count }} · {{ L.revision }} {{ short(s.revision) }}</div>
            <div v-if="!s.available" class="hi__missing">{{ L.noArtifacts }} · <code>{{ s.expected }}</code></div>
            <ul v-else class="hi__samples">
              <li v-for="x in s.artifacts.samples.slice(0, 3)" :key="x"><code>{{ x }}</code></li>
            </ul>
            <div class="hi__meta">{{ L.managedBy }}：{{ s.managedBy }}</div>
            <div class="hi__meta">
              {{ L.sourceMap }}：<code>{{ s.source.components.join('/') }}</code>
              · {{ contextLabel(s.source.context) }} · <code>{{ s.source.opencode }}</code>
            </div>
          </article>
        </div>
      </section>

      <section class="hi__section" data-testid="hi-proposals">
        <div class="hi__sectionHead hi__sectionHead--row">
          <div>
            <h3>{{ L.proposalsTitle }}</h3>
            <p>{{ L.proposalsSub }}</p>
          </div>
          <button type="button" class="hi__btn hi__btn--primary" data-testid="hi-create-toggle" @click="showCreate = !showCreate">
            {{ showCreate ? L.cancel : L.newProposal }}
          </button>
        </div>
        <div class="hi__row" data-testid="hi-suggest">
          <b>{{ L.suggestTitle }}</b>
          <select v-model="suggestForm.surfaceKey" data-testid="hi-suggest-surface">
            <option v-for="sf in data.surfaces" :key="sf.key" :value="sf.key">{{ sf.nameZh }}</option>
          </select>
          <input v-model="suggestForm.targetPath" :placeholder="L.formTarget" data-testid="hi-suggest-target" style="min-width: 220px" />
          <input v-model="suggestForm.profile" :placeholder="L.suggestProfile" style="width: 130px" />
          <button type="button" class="hi__btn" :disabled="busy" data-testid="hi-suggest-run" @click="suggest">{{ L.suggestRun }}</button>
          <span class="hi__meta">{{ L.suggestHint }}</span>
        </div>

        <form v-if="showCreate" class="hi__form" data-testid="hi-create" @submit.prevent="create()">
          <label>{{ L.formTitle }}<input v-model="createForm.title" data-testid="hi-create-title" required /></label>
          <label>{{ L.formHypothesis }}<textarea v-model="createForm.hypothesis" rows="2" data-testid="hi-create-hypothesis" required /></label>
          <div class="hi__formRow">
            <label>{{ L.formSurface }}
              <select v-model="createForm.surfaceKey" data-testid="hi-create-surface">
                <option v-for="s in data.surfaces" :key="s.key" :value="s.key">{{ s.nameZh }}</option>
              </select>
            </label>
            <label>{{ L.formBudget }}<input v-model.number="createForm.budgetCapUsd" type="number" min="0" step="0.5" /></label>
            <label>{{ L.formDomain }}<input v-model="createForm.domain" placeholder="general" /></label>
            <label>{{ L.formEditClass }}
              <select v-model="createForm.editClass" data-testid="hi-create-edit-class">
                <option value="">{{ L.editClassUndeclared }}</option>
                <option value="invariant">{{ L.editClassInvariant }}</option>
                <option value="domain">{{ L.editClassDomain }}</option>
                <option value="mixed">{{ L.editClassMixed }}</option>
              </select>
              <small>{{ L.formEditClassHint }}</small>
            </label>
            <label>{{ L.formMode }}
              <select v-model="createForm.mode">
                <option value="parallel">{{ L.formParallel }}</option>
                <option value="sequential">{{ L.formSequential }}</option>
              </select>
            </label>
          </div>
          <label>{{ L.formTarget }}<input v-model="createForm.targetPath" :placeholder="'profiles/orchestrator/SOUL.md'" /><small>{{ L.formTargetHint }}</small></label>
          <label>{{ L.formEvidence }}<input v-model="createForm.evidenceRefs" :placeholder="'task:DEV-123, run:run-xxx'" /><small>{{ L.formEvidenceHint }}</small></label>
          <div class="hi__variantsForm">
            <div class="hi__meta">{{ L.formVariants }}</div>
            <div v-for="(v, i) in createForm.variants" :key="i" class="hi__variantForm hi__variantForm--col">
              <div class="hi__row">
                <input v-model="v.label" :placeholder="L.formVariant" />
                <label class="hi__check">
                  <input v-model="v.tree" type="checkbox" :data-testid="`hi-create-tree-${i}`" />
                  {{ L.formModeTree }}
                </label>
                <button type="button" class="hi__btn hi__btn--ghost" @click="removeVariant(i)">{{ L.removeVariant }}</button>
              </div>
              <textarea
                v-if="!v.tree" v-model="v.content" rows="3"
                :placeholder="L.formVariantContent" :data-testid="`hi-create-variant-${i}`"
              />
              <div v-else class="hi__treeForm" :data-testid="`hi-create-treeform-${i}`">
                <div v-for="(f, fi) in v.files" :key="fi" class="hi__fileRow">
                  <input v-model="f.path" :placeholder="L.formFilePath" :data-testid="`hi-create-file-path-${i}-${fi}`" />
                  <textarea v-model="f.content" rows="2" :placeholder="L.formFileContent" />
                  <button type="button" class="hi__btn hi__btn--ghost" @click="removeFile(v, fi)">{{ L.removeFile }}</button>
                </div>
                <button type="button" class="hi__btn" @click="addFile(v)">{{ L.addFile }}</button>
                <label>{{ L.formDeletions }}
                  <textarea v-model="v.deletions" rows="2" :placeholder="'scripts/old.py'" />
                  <small>{{ L.formDeletionsHint }}</small>
                </label>
              </div>
            </div>
            <button type="button" class="hi__btn" @click="addVariant">{{ L.addVariant }}</button>
          </div>
          <div class="hi__formRow">
            <button type="submit" class="hi__btn hi__btn--primary" data-testid="hi-create-submit" :disabled="busy">{{ busy ? L.creating : L.create }}</button>
            <button type="button" class="hi__btn" @click="showCreate = false">{{ L.cancel }}</button>
          </div>
        </form>

        <p v-if="data.proposals.length === 0" class="hi__empty">{{ L.emptyProposals }}</p>

        <article v-for="p in data.proposals" :key="p.id" class="hi__proposal" :data-testid="`hi-proposal-${p.id}`">
          <header class="hi__proposalHead">
            <strong>{{ p.title }}</strong>
            <span class="hi__chip" :class="`hi__chip--status-${p.status}`">{{ statusLabel(p.status) }}</span>
            <span class="hi__chip" data-testid="hi-proposal-edit-class">{{ editClassLabel(p.editClass) }}</span>
            <span class="hi__meta">{{ surfaceName(p.surfaceKey) }} · {{ p.domain }} · {{ riskLabel(p.risk) }} · {{ fmtUsd(p.budgetCapUsd) }}</span>
          </header>
          <p class="hi__hyp">{{ p.hypothesis }}</p>
          <div v-if="p.donorRefs && p.donorRefs.length" class="hi__meta" data-testid="hi-proposal-donors">
            {{ L.donorsLabel }}：<code v-for="id in p.donorRefs" :key="id">{{ id }}</code>
          </div>
          <div v-if="p.targetPath" class="hi__meta">{{ L.formTarget }}：<code>{{ p.targetPath }}</code></div>
          <div v-if="citedExperiencesOf(p).length" class="hi__meta" data-testid="hi-proposal-cited">
            {{ L.citedExperiences }}：<span v-for="e in citedExperiencesOf(p)" :key="e.id"><code>{{ e.domain || L.general }}/{{ e.statement.slice(0, 24) }}</code> </span>
          </div>
          <div class="hi__meta">
            {{ L.baseline }}：<code>{{ p.baselineRunId ?? '—' }}</code>
            · {{ L.approvalApproved }}：{{ p.approval ? `${p.approval.actor}（${p.approval.decision === 'approved' ? L.approvalApproved : L.approvalRejected}）` : L.approvalNone }}
            · {{ L.probes }}：{{ p.derived.recordedProbes }}/{{ p.derived.totalProbes }}
            · {{ L.cost }}：{{ fmtUsd(p.derived.cost.total) }} / {{ fmtUsd(p.budgetCapUsd) }}
          </div>

          <div
            v-if="probeOf(p, p.derived.selectedVariantId ?? '')?.evidence?.regression?.passAt1 != null"
            class="hi__meta" data-testid="hi-heldout-compare"
          >
            {{ L.evoVsHeldout }}：
            {{ L.evolveLabel }} {{ fmtPct(probeOf(p, p.derived.selectedVariantId ?? '')?.evidence?.passAt1) }}
            · {{ L.heldoutLabel }} {{ fmtPct(probeOf(p, p.derived.selectedVariantId ?? '')?.evidence?.regression?.passAt1) }}
            <small v-if="probeOf(p, p.derived.selectedVariantId ?? '')?.contrast?.passAt1Delta != null">
              （{{ L.evolveDelta }} {{ fmtDelta(probeOf(p, p.derived.selectedVariantId ?? '')?.contrast?.passAt1Delta) }}）
            </small>
          </div>

          <details class="hi__details" open>
            <summary>
              {{ L.variants }}（{{ p.variants.length }}）
              · {{ L.diversity }} {{ p.derived.diversity.nDistinct }}/{{ p.derived.diversity.n }}
              · {{ (p.derived.diversity.meanLineJaccard * 100).toFixed(0) }}%
            </summary>
            <table class="hi__table">
              <thead>
                <tr>
                  <th>{{ L.formVariant }}</th><th>{{ L.diff }}</th><th>{{ L.probes }}</th><th>{{ L.quality }}</th>
                  <th>{{ L.passAt1 }}</th><th>{{ L.trajectory }}</th><th>{{ L.tokens }}</th><th>{{ L.cost }}</th><th>{{ L.paretoTier }}</th><th>{{ L.regression }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in p.variants" :key="v.id">
                  <td>
                    {{ v.label }} <small class="hi__meta">{{ v.id }}</small>
                    <div v-if="v.files" class="hi__meta">{{ L.fileCount }} {{ v.files.length }}</div>
                    <div v-if="v.files" class="hi__fileList">
                      <code v-for="f in v.files.slice(0, 4)" :key="f.path">{{ f.path }}</code>
                      <span v-if="v.files.length > 4" class="hi__meta">+{{ v.files.length - 4 }}</span>
                    </div>
                    <div v-if="v.deletions?.length" class="hi__del">-{{ v.deletions.length }} {{ L.deletionsCount }}</div>
                  </td>
                  <td><span class="hi__add">+{{ v.diffSummary.added }}</span> / <span class="hi__del">-{{ v.diffSummary.removed }}</span></td>
                  <td>
                    <span v-if="probeOf(p, v.id)" class="hi__chip" :class="probeOf(p, v.id)?.status === 'recorded' ? 'hi__chip--ok' : 'hi__chip--muted'">
                      {{ probeOf(p, v.id)?.status === 'recorded' ? L.probeRecorded : L.probePlanned }}
                    </span>
                    <span v-else>—</span>
                  </td>
                  <td>
                    <span class="hi__chip" :class="`hi__chip--verdict-${probeOf(p, v.id)?.contrast?.quality ?? 'unknown'}`">
                      {{ verdictLabel(probeOf(p, v.id)?.contrast?.quality) }}
                    </span>
                  </td>
                  <td>{{ fmtPct(probeOf(p, v.id)?.evidence?.passAt1) }} <small class="hi__meta">{{ fmtDelta(probeOf(p, v.id)?.contrast?.passAt1Delta) }}</small></td>
                  <td>{{ fmtPct(probeOf(p, v.id)?.evidence?.trajectoryPassRate) }} <small class="hi__meta">{{ fmtDelta(probeOf(p, v.id)?.contrast?.trajectoryPassRateDelta) }}</small></td>
                  <td>{{ fmtNum(probeOf(p, v.id)?.evidence?.tokens) }} <small class="hi__meta">{{ fmtRatio(probeOf(p, v.id)?.contrast?.tokenDeltaPct) }}</small></td>
                  <td>{{ fmtUsd(probeOf(p, v.id)?.evidence?.costUsd) }} <small class="hi__meta">{{ fmtRatio(probeOf(p, v.id)?.contrast?.costDeltaPct) }}</small></td>
                  <td :data-testid="`hi-pareto-${p.id}-${v.id}`">
                    <span v-if="paretoEntryOf(p, v.id)?.tier" class="hi__chip hi__chip--ok">{{ paretoEntryOf(p, v.id)?.tier }}</span>
                    <span v-else-if="paretoEntryOf(p, v.id) && !paretoEntryOf(p, v.id)!.onFrontier" class="hi__chip hi__chip--muted" :title="paretoEntryOf(p, v.id)!.dominatedBy.join(', ')">
                      {{ L.paretoDominated }}
                    </span>
                    <span v-else>—</span>
                  </td>
                  <td>
                    <span v-if="probeOf(p, v.id)?.evidence?.regression">
                      {{ probeOf(p, v.id)?.evidence?.regression?.failed }} / {{ probeOf(p, v.id)?.evidence?.regression?.total }}
                    </span>
                    <span v-else>—</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="p.derived.pareto?.eligible > 0" class="hi__meta" :data-testid="`hi-pareto-note-${p.id}`">
              {{ L.paretoNote }}：{{ L.paretoEligible }} {{ p.derived.pareto.eligible }}
              <span v-if="p.derived.pareto.excluded.length">· {{ L.paretoExcluded }} {{ p.derived.pareto.excluded.length }}</span>
            </p>
          </details>

          <div class="hi__gate" :class="p.derived.gate.ok ? 'hi__gate--ok' : 'hi__gate--blocked'" :data-testid="`hi-gate-${p.id}`">
            <b>{{ L.gate }}：{{ p.derived.gate.ok ? L.gateOk : L.gateBlocked }}</b>
            <ul v-if="p.derived.gate.blockers.length">
              <li v-for="b in p.derived.gate.blockers" :key="b.code"><code>{{ b.code }}</code> {{ b.message }}</li>
            </ul>
            <ul v-if="p.derived.gate.warnings.length" class="hi__warn">
              <li v-for="w in p.derived.gate.warnings" :key="w.code"><code>{{ w.code }}</code> {{ w.message }}</li>
            </ul>
          </div>

          <div v-if="p.derived.regularization" class="hi__reg" :data-testid="`hi-reg-${p.id}`">
            <span class="hi__chip hi__chip--muted">{{ L.regRound }} {{ p.derived.regularization.round }}/{{ p.derived.regularization.horizon }}</span>
            <span class="hi__chip" :class="p.derived.regularization.editBudgetExceeded ? 'hi__chip--risk-high' : 'hi__chip--muted'">
              {{ L.regEditBudget }} {{ p.derived.regularization.editBudget }} · {{ L.regEditCount }} {{ p.derived.regularization.maxEditCount ?? '—' }}
            </span>
            <span class="hi__chip" :class="p.derived.regularization.noiseDelta != null ? 'hi__chip--ok' : 'hi__chip--muted'">
              {{ L.regNoise }}
              {{ p.derived.regularization.noiseDelta != null ? fmtDelta(p.derived.regularization.noiseDelta) : L.regNoiseNone }}
            </span>
            <span v-if="p.derived.regularization.stalled" class="hi__chip hi__chip--risk-medium">{{ L.regStalled }}</span>
            <span v-if="p.derived.regularization.firstOnSurface" class="hi__chip hi__chip--risk-medium">{{ L.regFirstSurface }}</span>
            <ul v-if="p.derived.regularization.hypothesisRetry.length" class="hi__warn" :data-testid="`hi-hypothesis-retry-${p.id}`">
              <li>
                {{ L.hypothesisRetry }}：
                <span v-for="h in p.derived.regularization.hypothesisRetry" :key="h.proposalId">
                  <code>{{ h.proposalId }}</code>（{{ (h.similarity * 100).toFixed(0) }}%）
                </span>
              </li>
            </ul>
          </div>

          <details class="hi__details" :data-testid="`hi-actions-${p.id}`">
            <summary>{{ L.submit }} / {{ L.approve }} / {{ L.probes }} / {{ L.compose }} / {{ L.promote }}</summary>
            <div class="hi__actions">
              <div v-if="!p.baseline" class="hi__row">
                <input v-model="formFor(p.id).baselineRunId" :placeholder="L.baselineRunId" />
                <button type="button" class="hi__btn" @click="attachBaseline(p)">{{ L.attachBaseline }}</button>
                <span class="hi__meta">{{ L.baselineHint }}</span>
              </div>

              <div v-if="['draft', 'submitted', 'approved', 'probing'].includes(p.status)" class="hi__row" :data-testid="`hi-noise-${p.id}`">
                <b>{{ L.noiseTitle }}</b>
                <textarea v-model="formFor(p.id).noiseRunIds" rows="1" style="min-width: 240px" :placeholder="L.noiseRunIds" />
                <button type="button" class="hi__btn" @click="calibrateNoise(p)">{{ L.noiseCalibrate }}</button>
                <span class="hi__meta">
                  <template v-if="p.noise">{{ L.noiseCalibrated }} δ={{ fmtDelta(p.noise.delta) }}（{{ p.noise.runIds.length }} {{ L.probes }}）</template>
                  <template v-else>{{ L.noiseHint }}</template>
                </span>
              </div>

              <div v-if="['draft', 'submitted', 'approved', 'probing', 'composed'].includes(p.status)" class="hi__row" :data-testid="`hi-constraints-${p.id}`">
                <b>{{ L.constraintTitle }}</b>
                <textarea
                  v-model="constraintTexts[p.id]"
                  rows="2" style="min-width: 260px" :placeholder="L.constraintPlaceholder"
                  data-testid="hi-constraints-input"
                />
                <button type="button" class="hi__btn" @click="saveConstraints(p)">{{ L.constraintSave }}</button>
                <span class="hi__meta">
                  <template v-if="p.constraints">{{ L.constraintRecorded }}（{{ p.constraints.checks.length }}，{{ p.constraints.actor }}）</template>
                  <template v-else>{{ L.constraintHint }}</template>
                </span>
              </div>

              <div v-if="p.status === 'draft'" class="hi__row">
                <button type="button" class="hi__btn hi__btn--primary" @click="submit(p)">{{ L.submit }}</button>
                <button
                  v-if="deletable(p)" type="button" class="hi__btn"
                  :data-testid="`hi-delete-${p.id}`" @click="removeProposal(p)"
                >{{ L.deleteProposal }}</button>
                <span v-if="!p.baseline" class="hi__meta">{{ L.baselineMissing }}</span>
              </div>

              <div v-if="p.status === 'submitted'" class="hi__row">
                <input v-model="formFor(p.id).actor" :placeholder="L.actor" />
                <input v-model="formFor(p.id).note" :placeholder="L.note" />
                <button type="button" class="hi__btn hi__btn--primary" @click="decide(p, 'approve')">{{ L.approve }}</button>
                <button type="button" class="hi__btn" @click="decide(p, 'reject')">{{ L.reject }}</button>
              </div>

              <div v-if="p.status === 'approved' || p.status === 'probing'" class="hi__row">
                <button type="button" class="hi__btn" @click="createProbes(p)">{{ L.createProbes }}</button>
                <span class="hi__meta">{{ L.recordHint }}</span>
              </div>

              <div v-if="p.status === 'approved' || p.status === 'probing'" class="hi__row" :data-testid="`hi-auto-${p.id}`">
                <b>{{ L.autoProbe }}</b>
                <input v-model="formFor(p.id).autoSetId" :placeholder="L.autoSetId" :data-testid="`hi-auto-set-${p.id}`" />
                <input v-model="formFor(p.id).autoRegressionSetId" :placeholder="L.autoRegressionSetId" />
                <input v-model.number="formFor(p.id).autoMaxTasks" type="number" min="1" max="50" :placeholder="L.autoMaxTasks" style="width: 90px" />
                <button type="button" class="hi__btn hi__btn--primary" :disabled="!hasRunnableProbe(p)" :data-testid="`hi-auto-run-${p.id}`" @click="autoProbe(p)">
                  {{ L.autoRun }}
                </button>
                <span class="hi__meta">{{ L.autoProbeHint }}</span>
              </div>

              <div v-for="probe in p.probes.filter((x) => x.autoRun)" :key="`ar-${probe.id}`" class="hi__row hi__autoState" :data-testid="`hi-auto-state-${probe.id}`">
                <code>{{ probe.id }}</code>
                <span class="hi__chip" :class="probe.autoRun?.status === 'done' ? 'hi__chip--ok' : probe.autoRun?.status === 'running' ? 'hi__chip--status-probing' : 'hi__chip--muted'">
                  {{ autoStatusLabel(probe.autoRun?.status ?? 'done') }}
                </span>
                <span class="hi__meta">
                  {{ L.autoProgress }} {{ probe.autoRun?.tasksDone }}/{{ probe.autoRun?.tasksTotal }}
                  · {{ fmtUsd(probe.autoRun?.costUsd) }}
                  <template v-if="probe.autoRun?.estimatedTasks">· {{ L.autoEstimated }} {{ probe.autoRun.estimatedTasks }}</template>
                  <template v-if="probe.autoRun?.reason === 'budget_stop'">· {{ L.autoBudgetStop }}</template>
                </span>
                <span v-if="probe.autoRun?.error" class="hi__error">{{ probe.autoRun.error }}</span>
              </div>

              <div v-for="probe in p.probes.filter((x) => x.status === 'planned')" :key="probe.id" class="hi__row">
                <code>{{ probe.id }}</code>
                <input v-model="probeInput(probe.id).evalRunId" :placeholder="L.evalRunId" />
                <input v-model="probeInput(probe.id).regressionRunId" :placeholder="L.regressionRunId" />
                <input v-model="probeInput(probe.id).equalBudgetRunId" :placeholder="L.equalBudgetRunId" data-testid="hi-eq-budget-input" />
                <input v-model="probeInput(probe.id).counterfactualRunId" :placeholder="L.counterfactualRunId" data-testid="hi-counterfactual-input" />
                <button type="button" class="hi__btn" @click="recordProbe(p, probe)">{{ L.record }}</button>
              </div>

              <div v-if="p.status === 'probing' || p.status === 'composed'" class="hi__row">
                <select v-model="formFor(p.id).selectedVariant">
                  <option value="">{{ L.selectedVariant }}</option>
                  <option v-for="v in p.variants" :key="v.id" :value="v.id">{{ v.label }}（{{ v.id }}）</option>
                </select>
                <input v-model="formFor(p.id).rationale" :placeholder="L.composeRationale" />
                <button type="button" class="hi__btn" @click="compose(p)">{{ L.composeAction }}</button>
                <span class="hi__meta">{{ L.composeHint }}</span>
              </div>

              <div v-if="p.status === 'composed'" class="hi__reflection">
                <div class="hi__meta"><b>{{ L.reflectionTitle }}</b> · {{ L.reflectionHint }}</div>
                <div class="hi__row">
                  <input v-model="formFor(p.id).cue" :placeholder="L.reflectionCue" />
                  <input v-model="formFor(p.id).lesson" :placeholder="L.reflectionLesson" />
                  <input v-model="formFor(p.id).evidence" :placeholder="L.reflectionEvidence" />
                  <select v-model="formFor(p.id).confidence">
                    <option value="low">{{ L.confidenceLow }}</option>
                    <option value="medium">{{ L.confidenceMedium }}</option>
                    <option value="high">{{ L.confidenceHigh }}</option>
                  </select>
                </div>
                <div class="hi__row">
                  <label class="hi__check"><input v-model="formFor(p.id).apply" type="checkbox" />{{ L.promoteApply }}</label>
                  <button type="button" class="hi__btn hi__btn--primary" @click="promote(p)">{{ L.promoteAction }}</button>
                  <span class="hi__meta">{{ L.promoteApplyHint }}</span>
                </div>
              </div>

              <div v-if="p.status === 'promoted'" class="hi__row">
                <input v-model="formFor(p.id).rollbackReason" :placeholder="L.rollbackReason" /><button
          v-if="p.status === 'promoted' && (p.surfaceKey === 'memory' || p.surfaceKey === 'tool_guidance')"
          type="button" class="hi__btn" data-testid="hi-export-artifacts" @click="exportSurfaceArtifacts(p)"
        >{{ L.exportArtifacts }}</button>
        <button
          v-if="p.status === 'promoted' && (p.surfaceKey === 'memory' || p.surfaceKey === 'tool_guidance') && p.promotion?.appliedVia !== 'via-surface'"
          type="button" class="hi__btn" data-testid="hi-mark-applied" @click="markApplied(p)"
        >{{ L.markApplied }}</button>
                <button type="button" class="hi__btn" @click="rollback(p)">{{ L.rollbackAction }}</button>
                <span v-if="p.promotion" class="hi__meta">{{ L.promote }}：{{ p.promotion.applied ? L.managed : L.advisory }} · {{ short(p.promotion.digest) }}</span>
              </div>
            </div>
          </details>
        </article>
      </section>

      <section v-if="data.evolution" class="hi__section" data-testid="hi-evolution">
        <div class="hi__sectionHead">
          <h3>{{ L.evoTitle }}</h3>
          <p>{{ L.evoSub }}</p>
        </div>

        <div v-if="evoSurfacesWithTimeline.length === 0" class="hi__empty">{{ L.evoNoData }}</div>
        <template v-else>
          <div class="hi__row">
            <label class="hi__meta">{{ L.evoCurveTitle }}
              <select v-model="evoSurfaceKey" data-testid="hi-evo-surface">
                <option v-for="s in evoSurfacesWithTimeline" :key="s.surfaceKey" :value="s.surfaceKey">
                  {{ surfaceName(s.surfaceKey) }}（{{ s.rounds }}）
                </option>
              </select>
            </label>
          </div>
          <svg
            v-if="curve" :viewBox="`0 0 ${CURVE_W} ${CURVE_H}`" class="hi__curve"
            :data-testid="`hi-evo-curve-${selectedEvoKey}`" role="img"
            :aria-label="`${L.evoCurveTitle} ${selectedEvoKey}`"
          >
            <rect
              v-for="(pt, i) in curve.points" :key="`band-${i}`"
              v-show="pt.bandTop != null && pt.bandBottom != null"
              :x="pt.x - 3" :y="pt.bandTop ?? pt.y" width="6"
              :height="Math.max(0, (pt.bandBottom ?? pt.y) - (pt.bandTop ?? pt.y))"
              class="hi__curveBand"
            />
            <path :d="curvePath" class="hi__curveLine" />
            <circle
              v-for="(pt, i) in curve.points" :key="`dot-${i}`"
              :cx="pt.x" :cy="pt.y" r="3" class="hi__curveDot"
              :class="{ 'hi__curveDot--rolledBack': pt.rolledBack }"
            >
              <title>{{ L.evoRoundLabel }} {{ pt.round }}{{ pt.rolledBack ? ` · ${L.evoRollbackMark}` : '' }}</title>
            </circle>
            <text :x="CURVE_PAD" :y="CURVE_PAD - 2" class="hi__curveLabel">{{ fmtPct(curve.yMax) }}</text>
            <text :x="CURVE_PAD" :y="CURVE_H - 1" class="hi__curveLabel">{{ fmtPct(curve.yMin) }}</text>
          </svg>
          <p class="hi__meta">
            {{ L.evoNoiseBand }}：
            {{ selectedEvo?.timeline.some((r) => r.noiseDelta != null) ? selectedEvo?.timeline.filter((r) => r.noiseDelta != null).map((r) => fmtDelta(r.noiseDelta)).join(' / ') : L.regNoiseNone }}
          </p>
          <div class="hi__row" v-if="selectedEvo" :data-testid="`hi-evo-outcome-${selectedEvoKey}`">
            <span class="hi__chip hi__chip--ok">{{ L.evoAccepted }} {{ selectedEvo.promoted }}</span>
            <span class="hi__chip hi__chip--risk-high">{{ L.evoRejectedLabel }} {{ selectedEvo.rejected }}</span>
            <span class="hi__chip hi__chip--risk-medium">{{ L.evoRolledBackLabel }} {{ selectedEvo.rolledBack }}</span>
            <span class="hi__chip hi__chip--muted">{{ L.evoOpenLabel }} {{ selectedEvo.open }}</span>
            <span class="hi__chip hi__chip--risk-medium">{{ L.evoFailedProbes }} {{ selectedEvo.failedProbes }}</span>
          </div>
        </template>

        <div class="hi__sectionHead">
          <h4>{{ L.regTitle }}</h4>
          <p>{{ L.regSub }}</p>
        </div>
        <table class="hi__table" data-testid="hi-reg-table" v-if="data.evolution.surfaces.length">
          <thead>
            <tr>
              <th>{{ L.formSurface }}</th><th>{{ L.regRound }}</th><th>{{ L.regEditBudget }}</th>
              <th>{{ L.regEditCount }}</th><th>{{ L.regStalled }}</th><th>{{ L.regPrune }}</th><th>{{ L.evoOutcome }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="s in data.evolution.surfaces" :key="s.surfaceKey" :data-testid="`hi-reg-row-${s.surfaceKey}`">
              <td>{{ surfaceName(s.surfaceKey) }}</td>
              <td>{{ s.rounds }}</td>
              <td>≈{{ data.evolution?.config.bMax }} → {{ data.evolution?.config.bMin }}</td>
              <td>
                {{ latestProposalOfSurface(s.surfaceKey)?.derived.regularization.maxEditCount ?? '—' }}
                <small v-if="latestProposalOfSurface(s.surfaceKey)?.derived.regularization.editBudgetExceeded" class="hi__del">↑</small>
              </td>
              <td>
                <span class="hi__chip" :class="s.stalled ? 'hi__chip--risk-medium' : 'hi__chip--muted'">{{ s.stalled ? L.regYes : L.regNo }}</span>
              </td>
              <td>
                <span class="hi__chip" :class="s.pruneSuggested ? 'hi__chip--risk-medium' : 'hi__chip--muted'">{{ s.pruneSuggested ? L.regYes : L.regNo }}</span>
              </td>
              <td class="hi__meta">
                {{ L.evoAccepted }} {{ s.promoted }} · {{ L.evoRejectedLabel }} {{ s.rejected }} · {{ L.evoRolledBackLabel }} {{ s.rolledBack }} · {{ L.evoOpenLabel }} {{ s.open }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="data.evolution.unexercised.length" class="hi__meta" data-testid="hi-evo-unexercised">
          {{ L.evoUnexercised }}：<code v-for="k in data.evolution.unexercised" :key="k">{{ surfaceName(k) }}</code>
        </p>

        <div v-if="data.evolution.classAttribution && data.evolution.classAttribution.length" class="hi__block" data-testid="hi-class-attribution">
          <h4>{{ L.classAttribution }}</h4>
          <p v-if="data.evolution.seesawSuspected" class="hi__warn" data-testid="hi-seesaw">{{ L.seesawSuspected }}</p>
          <table class="hi__table">
            <thead><tr><th>{{ L.formEditClass }}</th><th>{{ L.regRound }}</th><th>{{ L.evoDelta }}</th><th>{{ L.classRegressed }}</th></tr></thead>
            <tbody>
              <tr v-for="row in data.evolution.classAttribution" :key="row.editClass">
                <td>{{ editClassLabel(row.editClass === 'undeclared' ? null : row.editClass) }}</td>
                <td>{{ row.rounds }}</td>
                <td>{{ row.meanDelta == null ? '—' : fmtDelta(row.meanDelta) }}</td>
                <td>{{ row.regressedTasks }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <details v-if="memoryPolicy && (memoryPolicy.staleAdopted.length || memoryPolicy.orphanCandidates.length)" class="hi__details" data-testid="hi-memory-policy">
          <summary>{{ L.memoryPolicyTitle }}（{{ memoryPolicy.staleAdopted.length + memoryPolicy.orphanCandidates.length }}）</summary>
          <p class="hi__meta">{{ memoryPolicy.hint }}</p>
          <ul class="hi__list">
            <li v-for="s in memoryPolicy.staleAdopted" :key="s.id" :data-testid="`hi-memory-stale-${s.id}`">
              <label><input type="checkbox" :checked="staleChecked.has(s.id)" data-testid="hi-stale-check" @change="toggleStale(s.id)" /></label>
              <code>{{ s.id }}</code>·{{ L.memoryRevalidate }}（{{ Math.round(s.ageDays) }}d）——{{ s.statement.slice(0, 120) }}
            </li>
            <li v-for="o in memoryPolicy.orphanCandidates" :key="o.id" :data-testid="`hi-memory-orphan-${o.id}`">
              <label><input type="checkbox" :checked="orphanChecked.has(o.id)" data-testid="hi-orphan-check" @change="toggleOrphan(o.id)" /></label>
              <code>{{ o.id }}</code>·{{ L.memoryRetire }}（{{ Math.round(o.ageDays) }}d）——{{ o.statement.slice(0, 120) }}
            </li>
          </ul>
          <div class="hi__row">
            <button type="button" class="hi__btn" data-testid="hi-batch-retire" :disabled="orphanChecked.size === 0" @click="retireCheckedOrphans">{{ L.batchRetire }}（{{ orphanChecked.size }}）</button>
            <button type="button" class="hi__btn" data-testid="hi-batch-cite" :disabled="staleChecked.size === 0" @click="citeCheckedStale">{{ L.batchCite }}（{{ staleChecked.size }}）</button>
          </div>
        </details>

        <details v-if="archiveList.length" class="hi__details" data-testid="hi-archive">
          <summary>{{ L.archiveTitle }}（{{ archiveList.length }}）</summary>
          <ul class="hi__list">
            <li v-for="a in archiveList" :key="a.proposalId" :data-testid="`hi-archive-${a.proposalId}`">
              <code>{{ a.proposalId }}</code>·{{ surfaceName(a.surfaceKey) }}·{{ a.title }}
              <span v-if="a.bestPassAt1 != null" class="hi__meta">pass@1={{ fmtDelta(a.bestPassAt1) }}<template v-if="a.bestDelta != null">（Δ{{ fmtDelta(a.bestDelta) }}）</template></span>
              <p class="hi__meta">{{ a.hypothesis }}</p>
            </li>
          </ul>
        </details>
        <div
          v-if="(data.evolution.retirementCandidates ?? []).length"
          class="hi__gate hi__gate--blocked"
          data-testid="hi-evo-retirement"
        >
          <b>{{ L.retireTitle }}（{{ data.evolution.retirementCandidates.length }}）</b>
          <ul>
            <li v-for="r in data.evolution.retirementCandidates" :key="`${r.surfaceKey}-${r.round}`">
              {{ surfaceName(r.surfaceKey) }} · {{ L.retireRound }} {{ r.round }}（{{ r.variantLabel }}）：
              {{ L.retireGain }} {{ fmtDelta(r.passAt1Delta) }}
              <span v-if="r.costDeltaPct != null">· {{ L.retireCost }} +{{ (r.costDeltaPct * 100).toFixed(0) }}%</span>
              · {{ L.retireSince }} {{ r.roundsSince }}
            </li>
          </ul>
          <p class="hi__meta">{{ L.retireNote }}</p>
        </div>
      </section>

      <section class="hi__section" data-testid="hi-experiences">
        <div class="hi__sectionHead hi__sectionHead--row">
          <div>
            <h3>{{ L.experiencesTitle }}</h3>
            <p>{{ L.experiencesSub }}</p>
          </div>
          <button type="button" class="hi__btn" data-testid="hi-exp-import" @click="importExperiences">{{ L.importExperiences }}</button>
        </div>
        <div class="hi__row" v-if="data.experiences.length > 0">
          <label class="hi__meta">{{ L.filterByDomain }}
            <select v-model="expDomainFilter" data-testid="hi-exp-domain-filter">
              <option value="">{{ L.general }}（全部）</option>
              <option v-for="d in experienceDomains" :key="d" :value="d">{{ d }}</option>
            </select>
          </label>
          <span v-if="createForm.experienceIds.length" class="hi__meta" data-testid="hi-cited-count">
            {{ L.citedExperiences }}: {{ createForm.experienceIds.length }}
            <button type="button" class="hi__btn" @click="createForm.experienceIds = []">×</button>
          </span>
        </div>
        <p v-if="filteredExperiences.length === 0" class="hi__empty">{{ L.emptyExperiences }}</p>
        <ul class="hi__expList">
          <li v-for="exp in filteredExperiences" :key="exp.id" class="hi__exp" :data-testid="`hi-exp-${exp.id}`">
            <div class="hi__expMain">
              <span>{{ exp.statement }}</span>
              <span class="hi__meta">
                {{ exp.surfaceKey ? surfaceName(exp.surfaceKey) : L.general }} ·
                {{ exp.domain || L.general }} ·
                {{ exp.confidence === 'high' ? L.confidenceHigh : exp.confidence === 'low' ? L.confidenceLow : L.confidenceMedium }} ·
                {{ expStatusLabel(exp.status) }}
                <span v-if="exp.freshness" class="hi__chip" :class="exp.freshness.band === 'fresh' ? 'hi__chip--ok' : exp.freshness.band === 'stale' ? 'hi__chip--muted' : ''" :data-testid="`hi-exp-fresh-${exp.id}`">
                  {{ freshnessLabel(exp.freshness) }}
                </span>
              </span>
              <span v-if="exp.cue" class="hi__meta">cue: {{ exp.cue }}</span>
              <span v-if="exp.lesson" class="hi__meta">lesson: {{ exp.lesson }}</span>
            </div>
            <div class="hi__meta">
              <code v-for="ref in exp.evidenceRefs.slice(0, 3)" :key="ref">{{ ref }}</code>
            </div>
            <div class="hi__row">
              <button type="button" class="hi__btn" :data-testid="`hi-exp-cite-${exp.id}`" @click="citeExperience(exp)">{{ L.citeForProposal }}</button>
              <button v-if="exp.status === 'candidate'" type="button" class="hi__btn" @click="setExperienceStatus(exp, 'adopted')">{{ L.adopt }}</button>
              <button v-if="exp.status !== 'retired'" type="button" class="hi__btn" @click="setExperienceStatus(exp, 'retired')">{{ L.retire }}</button>
            </div>
          </li>
        </ul>
        <details class="hi__details">
          <summary>{{ L.newExperience }}</summary>
          <div class="hi__actions">
            <textarea v-model="expForm.statement" rows="2" :placeholder="L.experienceStatement" data-testid="hi-exp-statement" />
            <div class="hi__row">
              <select v-model="expForm.surfaceKey">
                <option value="">{{ L.general }}</option>
                <option v-for="s in data.surfaces" :key="s.key" :value="s.key">{{ s.nameZh }}</option>
              </select>
              <select v-model="expForm.confidence">
                <option value="low">{{ L.confidenceLow }}</option>
                <option value="medium">{{ L.confidenceMedium }}</option>
                <option value="high">{{ L.confidenceHigh }}</option>
              </select>
              <input v-model="expForm.evidenceRefs" :placeholder="L.formEvidence" />
              <button type="button" class="hi__btn" @click="addExperience">{{ L.newExperience }}</button>
            </div>
          </div>
        </details>
      </section>

      <p class="hi__boundary">{{ L.boundary }}</p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.hi { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px 24px; }
.hi__bar { display: flex; align-items: flex-start; gap: 10px; }
.hi__title { margin: 0; font-size: 15px; }
.hi__sub { margin: 2px 0 0; font-size: 12px; opacity: 0.72; max-width: 860px; }
.hi__btn { font-size: 12px; padding: 3px 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary); cursor: pointer; }
.hi__btn:hover { border-color: var(--accent); }
.hi__btn:disabled { opacity: 0.5; cursor: default; }
.hi__btn--primary { border-color: var(--accent); color: var(--accent); }
.hi__btn--ghost { border-style: dashed; }
.hi__bar > .hi__btn { margin-left: auto; flex-shrink: 0; }
.hi__error { font-size: 12px; color: var(--danger); border: 1px solid var(--danger); border-radius: 8px; padding: 6px 10px; }
.hi__summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.hi__stat { border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 10px; display: flex; flex-direction: column; gap: 2px; background: var(--bg-primary); }
.hi__stat b { font-size: 18px; }
.hi__stat span { font-size: 11px; opacity: 0.7; }
.hi__section { border: 1px solid var(--border-color); border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; background: var(--bg-primary); }
.hi__sectionHead h3 { margin: 0; font-size: 14px; }
.hi__sectionHead p { margin: 2px 0 0; font-size: 11.5px; opacity: 0.7; }
.hi__sectionHead--row { display: flex; align-items: flex-start; gap: 10px; }
.hi__sectionHead--row > .hi__btn { margin-left: auto; flex-shrink: 0; }
.hi__surfaces { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
.hi__surface { border: 1px solid var(--border-color); border-radius: 8px; padding: 7px 9px; display: flex; flex-direction: column; gap: 3px; }
.hi__surface--off { border-style: dashed; opacity: 0.75; }
.hi__surfaceTop { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hi__surfaceTop strong { font-size: 12.5px; }
.hi__chip { font-size: 10px; padding: 0 6px; border-radius: 8px; border: 1px solid currentColor; }
.hi__chip--ok { color: var(--success); }
.hi__chip--muted { color: var(--text-muted); }
.hi__chip--risk-low { color: var(--success); }
.hi__chip--risk-medium { color: var(--ia-stale); border-style: dashed; }
.hi__chip--risk-high { color: var(--danger); }
.hi__chip--verdict-improved { color: var(--success); }
.hi__chip--verdict-regressed { color: var(--danger); }
.hi__chip--verdict-neutral { color: var(--text-muted); }
.hi__chip--verdict-unknown { color: var(--ia-stale); border-style: dashed; }
.hi__chip--status-draft, .hi__chip--status-submitted { color: var(--ia-stale); border-style: dashed; }
.hi__chip--status-approved, .hi__chip--status-probing, .hi__chip--status-composed { color: var(--accent); }
.hi__chip--status-promoted { color: var(--success); }
.hi__chip--status-rejected, .hi__chip--status-rolled_back { color: var(--danger); }
.hi__meta { font-size: 11px; opacity: 0.68; }
.hi__missing { font-size: 11px; color: var(--ia-stale); }
.hi__samples { margin: 0; padding-left: 16px; font-size: 10.5px; display: flex; flex-direction: column; gap: 1px; }
.hi__samples code, .hi__meta code, .hi__exp code { background: rgb(0 0 0 / 5%); padding: 0 3px; border-radius: 3px; margin-right: 4px; }
.hi__form { border: 1px dashed var(--border-color); border-radius: 8px; padding: 9px; display: flex; flex-direction: column; gap: 7px; }
.hi__form label { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; }
.hi__form input, .hi__form textarea, .hi__form select, .hi__row input, .hi__row select, .hi__actions textarea, .hi__actions input, .hi__actions select {
  font-size: 12px; padding: 4px 6px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-primary); color: var(--text-primary);
}
.hi__form small { font-size: 10.5px; opacity: 0.6; }
.hi__formRow, .hi__row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hi__variantsForm { display: flex; flex-direction: column; gap: 6px; }
.hi__variantForm { display: grid; grid-template-columns: 120px 1fr auto; gap: 6px; align-items: start; }
.hi__variantForm--col { display: flex; flex-direction: column; }
.hi__treeForm { display: flex; flex-direction: column; gap: 6px; border: 1px dashed var(--border-color); border-radius: 7px; padding: 6px 8px; }
.hi__treeForm label { display: flex; flex-direction: column; gap: 3px; font-size: 11px; }
.hi__treeForm small { font-size: 10px; opacity: 0.6; }
.hi__fileRow { display: grid; grid-template-columns: minmax(160px, 240px) 1fr auto; gap: 6px; align-items: start; }
.hi__fileRow textarea { width: 100%; }
.hi__fileList { display: flex; flex-direction: column; gap: 1px; margin-top: 2px; }
.hi__fileList code { font-size: 10px; }
.hi__variantForm textarea { width: 100%; }
.hi__empty { font-size: 12px; opacity: 0.65; margin: 0; }
.hi__proposal { border: 1px solid var(--border-color); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; }
.hi__proposalHead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.hi__proposalHead strong { font-size: 13px; }
.hi__hyp { margin: 0; font-size: 11.5px; opacity: 0.8; }
.hi__details { border-top: 1px dashed var(--border-color); padding-top: 5px; }
.hi__details summary { cursor: pointer; font-size: 11.5px; opacity: 0.8; }
.hi__table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 5px; }
.hi__table th { text-align: left; font-weight: 600; opacity: 0.65; border-bottom: 1px solid var(--border-color); padding: 3px 4px; white-space: nowrap; }
.hi__table td { border-bottom: 1px solid rgb(0 0 0 / 4%); padding: 3px 4px; vertical-align: top; }
.hi__add { color: var(--success); }
.hi__del { color: var(--danger); }
.hi__gate { border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 8px; font-size: 11px; }
.hi__gate--ok { border-color: var(--success); }
.hi__gate--blocked { border-color: var(--danger); }
.hi__gate ul { margin: 3px 0 0; padding-left: 16px; }
.hi__warn { color: var(--ia-stale); }
.hi__actions { display: flex; flex-direction: column; gap: 6px; margin-top: 5px; }
.hi__reflection { border: 1px dashed var(--border-color); border-radius: 7px; padding: 6px 8px; display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.hi__check { display: flex; align-items: center; gap: 4px; font-size: 11.5px; }
.hi__expList { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.hi__exp { border: 1px solid var(--border-color); border-radius: 7px; padding: 6px 8px; display: flex; flex-direction: column; gap: 3px; }
.hi__expMain { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.hi__boundary { margin: 0; font-size: 11px; color: var(--ia-stale); background: rgba(var(--warning-rgb), 0.45); border-radius: 7px; padding: 6px 9px; }
.hi__reg { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.hi__reg ul { margin: 0; padding-left: 16px; flex-basis: 100%; }
.hi__curve { width: 100%; max-width: 420px; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary); }
.hi__curveBand { fill: var(--accent); opacity: 0.14; }
.hi__curveLine { fill: none; stroke: var(--accent); stroke-width: 1.5; }
.hi__curveDot { fill: var(--success); }
.hi__curveDot--rolledBack { fill: var(--danger); }
.hi__curveLabel { font-size: 8px; fill: var(--text-muted); }
</style>
