// 改进闭环晋级/报告层（v0.4 单文件体量治理：第三批拆分，来自 loop.ts，行为不变）。
// overlay/custom/server/harness/workbench/loop.ts
// 改进闭环的纯函数层：摘要、diff、无真值行为对比、晋级门禁。
// 这里不读盘、不写库，便于单测覆盖全部分支；副作用在 service/apply。
import { createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { gainRetention } from './multi-objective'
import { parseHookPolicy } from '../../goalbudget/stage-ladder'
import type {
  BehaviorContrast, Champion, EvolutionReport, EvolutionRound, EvolutionSurface, GateBlocker,
  ParetoPoint, ParetoReport, ParetoTier, ProbeMetrics, PromotionGateReport, Proposal,
  ProposalStatus, QualityVerdict, RegularizationDerived, RetirementCandidate, SurfaceKey, Variant,
} from './types'

import { attributeGain, candidateDiversity, composedVariant, diffSummary, matchAlwaysOn, probeCost, variantSetDigest } from './loop-core'
import type { PromotionGateInput } from './loop-core'

/** 晋级门禁：缺证据不放行（源文「回归」与「--max-usd」的硬约束）。 */
export function evaluatePromotion(input: PromotionGateInput): PromotionGateReport {
  const { proposal } = input
  const blockers: GateBlocker[] = []
  const warnings: GateBlocker[] = []

  if (proposal.status !== 'composed') {
    blockers.push({ code: 'not_composed', message: '提案尚未完成组合（compose）' })
  }

  if (!proposal.approval) {
    blockers.push({ code: 'approval_missing', message: '缺少人工批准' })
  } else if (proposal.approval.decision !== 'approved') {
    blockers.push({ code: 'approval_rejected', message: '提案已被驳回' })
  } else if (proposal.approval.variantSetDigest !== variantSetDigest(proposal.variants)) {
    blockers.push({ code: 'approval_stale', message: '批准后候选集合发生变化，批准已失效' })
  }

  const selected = composedVariant(proposal)
  if (!selected) {
    blockers.push({ code: 'composition_unprobed', message: '组合结果没有对应的候选探测证据' })
  } else {
    const probe = proposal.probes.find((p) => p.variantId === selected.id && p.status === 'recorded')
    if (!probe || !probe.evidence) {
      blockers.push({ code: 'composition_unprobed', message: '选中的候选缺少已记录的探测' })
    } else {
      const contrast = probe.contrast
      if (!contrast || contrast.quality === 'unknown') {
        warnings.push({ code: 'quality_unknown', message: '选中候选的结果层证据不足，请人工复核' })
      } else if (contrast.quality === 'regressed') {
        blockers.push({ code: 'quality_regressed', message: '选中候选相对基线出现倒退' })
      }
      if (!probe.evidence.regression) {
        blockers.push({ code: 'regression_missing', message: '选中候选未绑定历史回归运行（回归样本库）' })
      } else if (probe.evidence.regression.failed > 0) {
        blockers.push({
          code: 'regression_failed',
          message: `选中候选的历史回归失败 ${probe.evidence.regression.failed} 项`,
        })
      }
      // R4（2026-10-31 D4）：k=1 恒 warning（单样本无法区分运气与能力）；
      // pass@1 升而 pass@k 降＝靠运气通过——divergence 告警（两读数齐全才判）。
      if (probe.evidence.statisticallyInsufficient || (probe.evidence.k ?? 1) < 2) {
        warnings.push({ code: 'statistical_insufficient', message: '评测采样 k<2，统计上不足（单样本无法区分运气与能力）' })
      }
      if (probe.evidence.passAt1 != null && probe.evidence.passAtK != null
        && probe.evidence.k != null && probe.evidence.k >= 2
        && probe.contrast?.passAt1Delta != null && probe.contrast.passAt1Delta > 0
        && probe.evidence.passAtK < probe.evidence.passAt1) {
        warnings.push({
          code: 'pass_at_k_divergence',
          message: `pass@1 ${(probe.evidence.passAt1 * 100).toFixed(1)}% 高于 pass@k ${(probe.evidence.passAtK * 100).toFixed(1)}%（k=${probe.evidence.k}）——首样本通过但多样本不稳定，增益可能靠运气而非能力`,
        })
      }

      // ---- RRSI 选择端正则化（2026-10-23 吸收轮）：噪声地板 + 成本规则 ----
      if (contrast) {
        const cfg = rsiConfig()
        const reg = input.regularization ?? null
        const noiseDelta = reg?.noiseDelta ?? null
        const gain = contrast.passAt1Delta
        if (noiseDelta == null) {
          const msg = '未标定噪声带 δ：涨的分可能只是评测噪声（RRSI S2）。用 ≥2 条同集基线真实运行做噪声标定'
          if (cfg.requireNoise) blockers.push({ code: 'noise_missing', message: msg })
          else warnings.push({ code: 'noise_uncalibrated', message: msg })
        } else if (gain != null) {
          if (gain <= noiseDelta) {
            if (reg?.firstOnSurface) {
              warnings.push({
                code: 'exploratory_within_noise',
                message: `增益 ${(gain * 100).toFixed(1)} 分未超噪声带 δ=${(noiseDelta * 100).toFixed(1)} 分，但这是该面首个提案（结构性探索），交人工裁决`,
              })
            } else {
              blockers.push({
                code: 'gain_within_noise',
                message: `增益 ${(gain * 100).toFixed(1)} 分落在噪声带 δ=${(noiseDelta * 100).toFixed(1)} 分以内——没有足够可信的证据成为下一代（RRSI 噪声调整接受地板）`,
              })
            }
          } else {
            const costPct = contrast.costDeltaPct ?? contrast.tokenDeltaPct
            if (costPct != null) {
              const allowance = cfg.beta0 + cfg.beta1PerPoint * (gain * 100)
              if (costPct > allowance) {
                blockers.push({
                  code: 'cost_unjustified',
                  message: `增益 ${(gain * 100).toFixed(1)} 分只允许 token 增长 ${(allowance * 100).toFixed(0)}%，实测 ${(costPct * 100).toFixed(0)}%——额外的 test-time compute 必须被收益覆盖（RRSI 成本规则）`,
                })
              }
            }
          }
        }

        // ---- HDA 增益归因（2026-10-31 吸收轮）：区分算力与 harness 残差 ----
        const attribution = attributeGain({
          baselinePassAt1: proposal.baseline?.passAt1 ?? null,
          candidatePassAt1: probe.evidence.passAt1,
          equalBudgetPassAt1: probe.evidence.equalBudgetBaseline?.passAt1 ?? null,
        })
        if (gain != null && gain > 0) {
          if (attribution.harnessGain == null) {
            const msg = '未绑定等预算基线（HDA）：无法区分 harness 改进与额外 test-time compute'
            if (cfg.requireAttribution) blockers.push({ code: 'attribution_missing', message: msg })
            else warnings.push({ code: 'attribution_missing', message: msg })
          } else if (attribution.harnessGain <= 0) {
            blockers.push({
              code: 'gain_explained_by_compute',
              message: `${attribution.note}；等预算基线已解释全部增益，涨的分来自算力而非 harness（HDA）`,
            })
          } else if (attribution.harnessGain < gain * 0.5) {
            warnings.push({
              code: 'gain_mostly_compute',
              message: `${attribution.note}；算力贡献超过一半，交人工裁决（HDA）`,
            })
          }
          const eq = probe.evidence.equalBudgetBaseline
          if (eq && eq.setId !== probe.evidence.setId) {
            warnings.push({
              code: 'attribution_set_mismatch',
              message: `等预算基线来自不同评测集（${eq.setId} ≠ ${probe.evidence.setId}），归因不可比`,
            })
          }
        }

        // ---- R9 技能差分（2026-10-31 三批）：「装了但不知有没有用」----
    // Agent Skills Can Be Harmful（2608.11888）实证 307 例技能诱导失效；
    // skills 面晋级无差分读数 → warning（差分＝有/无技能同集增益差，人工绑定或后续自动编排）。
    if (proposal.surfaceKey === 'skills' && proposal.skillDifferential == null) {
      warnings.push({
        code: 'skill_undifferentiated',
        message: 'skills 面晋级未绑定技能差分读数——「看似相关」技能可致功能失效（307 例实证）；建议对同一探测集跑有技能/无技能两态对比',
      })
    } else if (proposal.surfaceKey === 'skills' && proposal.skillDifferential?.delta != null && proposal.skillDifferential.delta <= 0) {
      warnings.push({
        code: 'skill_negative_delta',
        message: `技能差分为 ${(proposal.skillDifferential.delta * 100).toFixed(1)}pp（无技能反而更好）——该技能可能是负担（过度验证/重型流水线失效模式）`,
      })
    }

    // ---- Harmony 门（2026-11-03 吸收轮）：增益保留率 + 整块重写 ----
    // 论文《Harmony Harness》（2610.15150）：接受规则只读优化集反馈会被刷；headline 指标是
    // 「换分布后还留住多少演化增益」。留出基线与会话基线都在时才算，缺就不给数。
    {
      const sel = composedVariant(proposal)
      const probe = sel ? proposal.probes.find((p) => p.variantId === sel.id && p.status === 'recorded') : null
      const ev = probe?.evidence
      const baseline = ev?.equalBudgetBaseline?.passAt1 ?? null
      const retained = gainRetention({
        passAt1: ev?.passAt1 ?? null,
        baselinePassAt1: baseline,
        heldoutPassRate: proposal.heldout?.passRate ?? null,
        heldoutBaselinePassRate: ev?.heldoutBaselinePassRate ?? null,
      })
      if (retained.retention != null && retained.retention < 0.3 && (retained.evolveGain ?? 0) > 0) {
        const msg = `增益保留率 ${(retained.retention * 100).toFixed(0)}%（演化增益 +${((retained.evolveGain ?? 0) * 100).toFixed(1)}pp → 留出增益 ${(((retained.heldoutGain ?? 0)) * 100).toFixed(1)}pp）——换分布后增益基本没留住，可能背下了优化集分布`
        if (process.env.HARNESS2_RSI_REQUIRE_RETENTION === '1') blockers.push({ code: 'gain_retention_low', message: msg })
        else warnings.push({ code: 'gain_retention_low', message: msg })
      }
    }
    // 整块重写警示（论文消融：整块重写留出合计 35.0，比不演化 43.3 还低；工具+技能+调度分开演化才到 76.7）
    {
      const sel = composedVariant(proposal)
      const touched = (sel?.files?.length ?? 0) + (sel?.files ? 0 : sel?.content ? 1 : 0) + (sel?.deletions?.length ?? 0)
      if (touched >= 8) {
        warnings.push({
          code: 'whole_harness_rewrite',
          message: `候选一次改 ${touched} 个文件——整块重写实测比不演化更差（增益不可归因）；建议按工具/技能逻辑/调度分开演化`,
        })
      }
    }

    // ---- R6 heldout 门（2026-10-31 二批）：独立新验证数据的准入规则（2610.18813） ----
      if (gain != null && gain > 0) {
        if (proposal.heldout == null) {
          const msg = '未绑定密封留出集读数（R6）：晋级证据缺独立新验证数据——留出集防进化环过拟合'
          if (cfg.requireHeldout) blockers.push({ code: 'heldout_missing', message: msg })
          else warnings.push({ code: 'heldout_missing', message: msg })
        } else if (noiseDelta != null && proposal.heldout.passRate < (probe.evidence.passAt1 ?? 0) - noiseDelta) {
          blockers.push({
            code: 'heldout_regression',
            message: `留出集通过率 ${(proposal.heldout.passRate * 100).toFixed(1)}% 低于 evolve 通过率超噪声带 δ——增益未迁移到独立验证数据（AHE 教训：无留出的进化环过拟合）`,
          })
        }
      }

      // ---- CHASE 反事实门（D2，2026-10-31 吸收轮）：协议级捷径检验 ----
        // 语义：候选 harness 在「语义保持、协议变换」的变体集上的运行读数。
        // 原始增益为正但变体增益 ≤ 噪声带 ⇒ 增益绑定在原协议的可利用面（任务名/
        // 返回格式/错误注入），判捷径；变体读数缺席默认 warning 交人工裁决。
        const cf = probe.evidence.counterfactual
        if (gain != null && gain > 0) {
          const noiseDelta = reg?.noiseDelta ?? null
          if (!cf) {
            const msg = '未绑定反事实变体运行（CHASE D2）：任务留出抓不到协议级捷径——增益可能绑定原协议可利用面'
            if (cfg.requireCounterfactual) blockers.push({ code: 'counterfactual_missing', message: msg })
            else warnings.push({ code: 'counterfactual_missing', message: msg })
          } else if (cf.passAt1 == null) {
            warnings.push({ code: 'counterfactual_unreadable', message: `反事实运行 ${cf.runId} 无 passAt1 聚合，捷径检验不可判` })
          } else {
            const basePassAt1 = proposal.baseline?.passAt1 ?? null
            const cfGain = basePassAt1 != null ? cf.passAt1 - basePassAt1 : null
            if (cfGain == null) {
              warnings.push({ code: 'counterfactual_unreadable', message: '提案基线缺 passAt1，反事实增益不可算' })
            } else if (noiseDelta != null && cfGain <= noiseDelta) {
              blockers.push({
                code: 'counterfactual_gain_collapse',
                message: `原始增益 ${(gain * 100).toFixed(1)} 分，但反事实变体增益 ${(cfGain * 100).toFixed(1)} 分 ≤ 噪声带 δ=${(noiseDelta * 100).toFixed(1)} 分——增益未迁移到协议变换后的同义任务，判协议级捷径（CHASE）`,
              })
            }
          }
        }
      }
      // ---- HarnessPro 帕累托选拔（2026-10-23 吸收轮）：选中候选被支配=硬拦 ----
      // 论文「无情淘汰性能低于初始底线、或处于帕累托劣势（花钱更多、分还更低）的废案」。
      const pareto = paretoReportOf(proposal)
      const selEntry = pareto.entries.find((e) => e.variantId === selected.id)
      if (selEntry && !selEntry.onFrontier) {
        const dom = pareto.entries.filter((e) => selEntry.dominatedBy.includes(e.variantId))
        blockers.push({
          code: 'pareto_dominated',
          message: `选中候选被帕累托支配（花钱更多、分还更低）：被 ${dom.map((d) => d.label).join('、')} 支配——HarnessPro 纪律：帕累托劣势候选不进下一代`,
        })
      }
    }
  }

  const missingProbe = proposal.variants.filter((v) => !proposal.probes.some((p) => p.variantId === v.id && p.status === 'recorded'))
  if (missingProbe.length > 0) {
    warnings.push({
      code: 'probes_incomplete',
      message: `${missingProbe.length} 个候选尚未绑定真实评测运行（非选中候选可缺失）`,
    })
  }

  const selectedProbeForCost = selected ? proposal.probes.find((p) => p.variantId === selected.id && p.status === 'recorded') : null
  if (selectedProbeForCost?.evidence?.costUsd == null) {
    blockers.push({ code: 'cost_missing', message: '选中候选的探测缺少成本读数' })
  } else {
    const cost = probeCost(proposal)
    if (cost.total > proposal.budgetCapUsd) {
      blockers.push({
        code: 'budget_exceeded',
        message: `探测总成本 ${cost.total.toFixed(2)} 超提案上限 ${proposal.budgetCapUsd.toFixed(2)}`,
      })
    }
  }

  const champion = input.currentChampion
  if (champion && champion.proposalId !== proposal.id && champion.promotedAt > proposal.createdAt) {
    blockers.push({ code: 'champion_drift', message: '该面已有更新的冠军，请基于新基线重开提案' })
  }

  // ---- RRSI 提案端正则化：泄漏批评者硬拦 + 退火编辑预算 + 停滞提示 ----
  for (const finding of input.leakage ?? []) {
    blockers.push({ code: 'benchmark_leakage', message: finding.message })
  }
  const reg = input.regularization
  if (reg && reg.editBudgetExceeded && reg.maxEditCount != null) {
    blockers.push({
      code: 'edit_budget_exceeded',
      message: `第 ${reg.round} 轮编辑预算 ${reg.editBudget} 个文件（余弦退火：后期强制少捆绑，让每次变化可归因），候选最大捆绑 ${reg.maxEditCount} 个`,
    })
  }
  if (reg?.stalled) {
    warnings.push({
      code: 'surface_stalled',
      message: `该面连续 ${reg.stallWindow} 个提案无采纳，搜索停滞——可考虑转向未探索面（RRSI 结构性探索）`,
    })
  }

  // ---- 约束保持门（D5，2026-10-31 吸收轮）：能力涨了，行为约束不许退化 ----
  const constraintChecks = proposal.constraints?.checks ?? null
  if (!constraintChecks || constraintChecks.length === 0) {
    const msg = '未记录约束保持断言（guardrails/权限/审计/拒答等「不许退化」项）；晋级前建议记录'
    if (rsiConfig().requireConstraints) blockers.push({ code: 'constraint_unchecked', message: msg })
    else warnings.push({ code: 'constraint_unchecked', message: msg })
  } else {
    const failed = constraintChecks.filter((c) => c.status === 'fail')
    const unknown = constraintChecks.filter((c) => c.status === 'unknown')
    if (failed.length > 0) {
      blockers.push({
        code: 'constraint_regression',
        message: `${failed.length} 项约束未保持：${failed.map((c) => c.id).join('、')}——能力改进不能以行为约束退化为代价`,
      })
    }
    if (unknown.length > 0) {
      warnings.push({
        code: 'constraint_unverified',
        message: `${unknown.length} 项约束未验证：${unknown.map((c) => c.id).join('、')}（unknown 不等于通过）`,
      })
    }

    // ---- R12b 约束单层消融（2026-10-31 二批；Masked Erosion 2610.38392 实证） ----
    // 接受门只看任务分时，冗余护栏的删除被其余护栏掩护（411 循环实证：40 任务批次全失守）。
    // 本层输出「消融准备清单」：每个约束最近一次被显式 fail 消融检验的轮次；
    // 从未 fail 过（全 pass 历史）＝零对抗证据 → 人工复核提示（防静默删除的最低成本对治）。
    const passOnly = constraintChecks!.filter((c) => c.status === 'pass')
    if (passOnly.length > 0) {
      const neverFailed = passOnly.filter((c) => !c.detail?.includes('ablation:fail'))
      if (neverFailed.length === passOnly.length && passOnly.length >= 2) {
        warnings.push({
          code: 'constraint_ablation_due',
          message: `${passOnly.length} 项约束全部 pass 且无任何 fail 历史（零对抗证据）——建议做一轮单层消融（逐个约束关闭后复测），防被其余护栏掩护的静默删除（Masked Erosion）`,
        })
      }
    }
  }

  const diversity = candidateDiversity(proposal.variants)
  if (proposal.mode === 'parallel' && proposal.variants.length < 2) {
    warnings.push({ code: 'parallel_single_candidate', message: '并行探索只有 1 个候选，等价单步，不构成搜索' })
  }
  if (proposal.variants.length > 1 && (diversity.nDistinct < proposal.variants.length || diversity.meanLineJaccard > 0.9)) {
    warnings.push({
      code: 'candidate_collapse',
      message: `候选取样塌缩（去重后 ${diversity.nDistinct}/${proposal.variants.length}，逐行相似度 ${(diversity.meanLineJaccard * 100).toFixed(0)}%），探索预算可能被浪费`,
    })
  }

  const selectedForApply = composedVariant(proposal)
  const isTreeProposal = !!selectedForApply?.files && selectedForApply.files.length > 0

  // ---- HarnessPro 前缀缓存纪律（2026-10-23 吸收轮）：常驻面改动=提示词前缀缓存击穿 ----
  // 进化钩子把阶段提醒拼在工具结果尾部而非改写 prompt 头部，正是为了保住前缀缓存。
  // 启发式口径：候选触碰 always_on 文件且有删除行 → 缓存连续性被破坏（追加式编辑可保尾部缓存）。
  if (selectedForApply) {
    const touchesAlwaysOn = isTreeProposal
      ? selectedForApply.files!.some((f) => matchAlwaysOn(f.path)) || (selectedForApply.deletions ?? []).some((d) => matchAlwaysOn(d))
      : proposal.targetPath != null && matchAlwaysOn(proposal.targetPath)
    if (touchesAlwaysOn && selectedForApply.diffSummary.removed > 0) {
      warnings.push({
        code: 'prefix_cache_churn',
        message: `候选改动常驻面文件（always_on）且含 ${selectedForApply.diffSummary.removed} 行删除——该 profile 会话的 prompt 前缀缓存将被击穿（HarnessPro 缓存复用纪律）。启发式判定：建议追加式编辑、避免重排文件头部；如属必要重写请人工确认`,
      })
    }
  }

  if (input.applyRequested) {
    const surfaceManaged = ['system_prompt', 'skills'].includes(proposal.surfaceKey)
    if (!surfaceManaged) {
      blockers.push({ code: 'surface_not_managed', message: '该面为建议模式，不支持直接写盘' })
    } else if (!input.applyEnvEnabled) {
      blockers.push({ code: 'apply_env_disabled', message: '写盘未启用：需设置 HARNESS2_APPLY=1' })
    } else if (!isTreeProposal && !proposal.targetPath) {
      blockers.push({ code: 'target_missing', message: '提案未指定目标文件' })
    } else if (!isTreeProposal && input.targetExists === false) {
      blockers.push({ code: 'target_missing', message: '目标文件不存在（不创建新文件）' })
    } else if (!isTreeProposal && input.targetDigestNow != null && proposal.base && input.targetDigestNow !== proposal.base.digest) {
      blockers.push({ code: 'target_drift', message: '目标文件在提案后被外部修改，写盘会覆盖他人改动' })
    }
  }

  return { ok: blockers.length === 0, blockers, warnings }
}

/** 提案是否已具备提交条件（服务层用；纯函数便于测试）。 */
export function submitReadiness(proposal: Proposal): GateBlocker[] {
  const blockers: GateBlocker[] = []
  if (!proposal.title.trim()) blockers.push({ code: 'title_missing', message: '缺少标题' })
  if (!proposal.hypothesis.trim()) blockers.push({ code: 'hypothesis_missing', message: '缺少改进假设' })
  if (proposal.variants.length === 0) blockers.push({ code: 'variants_missing', message: '至少需要一个候选修改' })
  if (proposal.evidenceRefs.length === 0) blockers.push({ code: 'evidence_missing', message: '至少需要一条证据引用（任务/审计/评测运行）' })
  if (!proposal.baseline) blockers.push({ code: 'baseline_missing', message: '缺少基线评测运行' })
  return blockers
}

// =====================================================================================
// RRSI 正则化纯函数层（2026-10-23 吸收轮）
// 论文 arXiv 2609.24972：Regularize the search, not the harness。
// 七机制映射见 specs/2026-10-23-rrsi-regularized-workbench.md；全部无副作用，单测覆盖。
// =====================================================================================

export interface RsiConfig {
  /** 论文 T：退火视界（轮）。 */
  horizon: number
  bMin: number
  bMax: number
  stallWindow: number
  pruneN: number
  /** 成本规则 β₀：无增益时仍允许的 token 增长（相对量）。 */
  beta0: number
  /** 成本规则 β₁：每 1 个百分点通过率增益允许的 token 增长（相对量）。论文口径=每增 1 pass 允许 25%。 */
  beta1PerPoint: number
  /** true=未标定噪声带直接拦（缺省 false，warning 交人工裁决）。 */
  requireNoise: boolean
  /** true=未绑定等预算基线直接拦（缺省 false，warning 交人工裁决）。 */
  requireAttribution: boolean
  /** true=未记录约束保持断言直接拦（缺省 false，warning 交人工裁决）。 */
  requireConstraints: boolean
  /** true=未绑定反事实变体运行直接拦（缺省 false，warning 交人工裁决）。 */
  requireCounterfactual: boolean
  /** true=未绑定密封留出读数直接拦（R6，缺省 false）。 */
  requireHeldout: boolean
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Math.trunc(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/**
 * 超参照论文 Table 5 取 coding 档缺省（T=20、b 1/4、w=3、n_prune=4、β₀=0.10、
 * β₁≈25%/pass）。除 δ 外全部 env 可调；δ 刻意不设调参入口（论文纪律：调低 δ 只会买到噪声分）。
 */
export function rsiConfig(): RsiConfig {
  return {
    horizon: envInt('HARNESS2_RSI_T', 20),
    bMin: envInt('HARNESS2_RSI_B_MIN', 1),
    bMax: envInt('HARNESS2_RSI_B_MAX', 4),
    stallWindow: envInt('HARNESS2_RSI_STALL_W', 3),
    pruneN: envInt('HARNESS2_RSI_PRUNE_N', 4),
    beta0: envFloat('HARNESS2_RSI_BETA0', 0.1),
    beta1PerPoint: envFloat('HARNESS2_RSI_BETA1', 0.25),
    requireNoise: process.env.HARNESS2_RSI_REQUIRE_NOISE === '1',
    requireAttribution: process.env.HARNESS2_RSI_REQUIRE_ATTRIBUTION === '1',
    requireConstraints: process.env.HARNESS2_RSI_REQUIRE_CONSTRAINTS === '1',
    requireCounterfactual: process.env.HARNESS2_RSI_REQUIRE_COUNTERFACTUAL === '1',
    requireHeldout: process.env.HARNESS2_RSI_REQUIRE_HELDOUT === '1',
  }
}

/**
 * 垫脚石档案（D3，2026-10-31 吸收轮；DGM/ADAS 档案采样思想）：
 * 把被拒/回滚提案连同其最佳探测读数暴露为「垫脚石候选」——纯爬山会丢掉
 * 低分祖先，而它们常是通往最优的必经路径。提案端可据此在其新提案的
 * 假设里显式引用/改造这些分支。只读投影，不改变任何状态。
 */
export interface ArchiveSteppingStone {
  proposalId: string
  surfaceKey: SurfaceKey
  title: string
  hypothesis: string
  status: ProposalStatus
  /** 该提案全部已记录探测的最高 passAt1（无探测=null）。 */
  bestPassAt1: number | null
  /** 选中候选相对基线的 passAt1 差（无读数=null）。 */
  bestDelta: number | null
  updatedAt: string
}

export function proposalArchive(
  proposals: Proposal[],
  surfaceKey?: SurfaceKey,
): ArchiveSteppingStone[] {
  return proposals
    .filter((p) => (p.status === 'rejected' || p.status === 'rolled_back')
      && (!surfaceKey || p.surfaceKey === surfaceKey))
    .map((p) => {
      const selected = composedVariant(p)
      const recorded = selected
        ? p.probes.find((x) => x.variantId === selected.id && x.status === 'recorded' && x.evidence)
        : undefined
      const deltas = p.probes
        .filter((x) => x.status === 'recorded' && x.evidence?.passAt1 != null && p.baseline?.passAt1 != null)
        .map((x) => (x.evidence!.passAt1 as number) - (p.baseline!.passAt1 as number))
      return {
        proposalId: p.id,
        surfaceKey: p.surfaceKey,
        title: p.title,
        hypothesis: p.hypothesis,
        status: p.status,
        bestPassAt1: recorded?.evidence?.passAt1 ?? null,
        bestDelta: deltas.length > 0 ? Math.max(...deltas) : null,
        updatedAt: p.updatedAt,
      }
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

/** 论文退火编辑预算：b_t = ⌈b_min + (b_max−b_min)·½(1+cos(πt/T))⌉；t≥T 后恒为 b_min。 */
export function annealedEditBudget(t: number, cfg: RsiConfig = rsiConfig()): number {
  const round = Math.max(0, Math.trunc(t))
  if (round >= cfg.horizon) return cfg.bMin
  const value = cfg.bMin + (cfg.bMax - cfg.bMin) * 0.5 * (1 + Math.cos((Math.PI * round) / cfg.horizon))
  return Math.max(cfg.bMin, Math.min(cfg.bMax, Math.ceil(value)))
}

/** 一个候选的捆绑改动数：单文件=1；树候选=新增/修改文件数+删除数。 */
export function editCountOfVariant(v: Variant): number {
  if (v.files && v.files.length > 0) return v.files.length + (v.deletions?.length ?? 0)
  return 1
}

export function maxEditCount(variants: Variant[]): number | null {
  if (variants.length === 0) return null
  return Math.max(...variants.map(editCountOfVariant))
}

/** 论文轮次 t：该面已被采纳的轮数（未回滚冠军数；回滚=这轮没发生）。 */
export function surfaceRound(champions: Champion[], surfaceKey: SurfaceKey): number {
  return champions.filter((c) => c.surfaceKey === surfaceKey && !c.rolledBack).length
}

// ---- 泄漏批评者（S1）：评测前读 diff，拒绝携带评测集特化内容 ----

export interface LeakageSetLike {
  id: string
  tasks: Array<{ id: string; problem?: string; expectedBehavior?: string; rubric?: Array<{ text?: string }> }>
}

export type LeakageKind = 'task_id' | 'assertion_text' | 'reference' | 'problem'

export interface LeakageFinding {
  kind: LeakageKind
  /** 命中的评测集内容（长文本截断呈现）。 */
  needle: string
  /** 命中位置（候选标签/文件路径）。 */
  where: string
}

const LEAK_MIN_TASK_ID_LEN = 6
/** 文本针最小信息量：拉丁字符计 1、CJK 字符计 1.5（中文信息密度高，12 字已足够特化）。 */
const LEAK_MIN_TEXT_WEIGHT = 16
const LEAK_MAX_FINDINGS = 20

function textWeight(text: string): number {
  let w = 0
  for (const ch of text) w += /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch) ? 1.5 : 1
  return w
}

function clip(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * 确定性泄漏扫描（论文 critic 是 LLM 读 diff；本仓映射为可解释的子串扫描）：
 * 候选内容/路径中出现评测集任务 id、断言文本、参照答案、题干 → 泄漏。
 * 泛化性提示词/工具改进不会命中；转述式泄漏检测不到（如实标注为局限）。
 */
export function findBenchmarkLeakage(
  parts: Array<{ where: string; content: string }>,
  set: LeakageSetLike | null | undefined,
): LeakageFinding[] {
  if (!set) return []
  const needles: Array<{ needle: string; kind: LeakageKind }> = []
  for (const task of set.tasks ?? []) {
    if (task.id && task.id.trim().length >= LEAK_MIN_TASK_ID_LEN) needles.push({ needle: task.id.trim(), kind: 'task_id' })
    const addText = (raw: string | undefined, kind: LeakageKind): void => {
      const text = (raw ?? '').trim()
      if (text && textWeight(text) >= LEAK_MIN_TEXT_WEIGHT) needles.push({ needle: text, kind })
    }
    addText(task.problem, 'problem')
    addText(task.expectedBehavior, 'reference')
    for (const a of task.rubric ?? []) addText(a.text, 'assertion_text')
  }
  const findings: LeakageFinding[] = []
  for (const part of parts ?? []) {
    const body = String(part.content ?? '')
    if (!body) continue
    for (const { needle, kind } of needles) {
      if (body.includes(needle)) {
        findings.push({ kind, needle: clip(needle), where: part.where })
        if (findings.length >= LEAK_MAX_FINDINGS) return findings
      }
    }
  }
  return findings
}

export function leakageBlockers(findings: LeakageFinding[]): GateBlocker[] {
  const zh: Record<LeakageKind, string> = {
    task_id: '评测任务 ID',
    assertion_text: '评测断言原文',
    reference: '评测参照答案',
    problem: '评测题干原文',
  }
  return findings.map((f) => ({
    code: 'benchmark_leakage',
    message: `候选携带${zh[f.kind]}（${f.where}：「${f.needle}」）——这是 benchmark 特化而非通用改进（RRSI 泄漏批评者）`,
  }))
}

// ---- 历史证据表（P2）：失败假设不复提 ----

/** 词面相似度：拉丁词（≥2 字符）+ CJK 字符 bigram 的 Jaccard。 */
export function hypothesisSimilarity(a: string, b: string): number {
  const ta = hypothesisTokens(a)
  const tb = hypothesisTokens(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter += 1
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : inter / union
}

function hypothesisTokens(s: string): Set<string> {
  const norm = String(s ?? '').toLowerCase()
  const tokens = new Set<string>()
  for (const w of norm.split(/[^a-z0-9\u4e00-\u9fff]+/)) {
    if (/[a-z0-9]/.test(w) && w.length >= 2) tokens.add(w)
  }
  const cjkSegments = norm.match(/[\u4e00-\u9fff]+/g) ?? []
  for (const seg of cjkSegments) {
    for (let i = 0; i + 1 < seg.length; i += 1) tokens.add(seg.slice(i, i + 2))
  }
  return tokens
}

export const HYPOTHESIS_RETRY_THRESHOLD = 0.6

/** 同面历史失败假设（rejected/rolled_back）中与当前假设词面高度相似者。 */
export function hypothesisRetries(
  proposals: Proposal[],
  surfaceKey: SurfaceKey,
  currentProposalId: string,
  hypothesis: string,
  threshold: number = HYPOTHESIS_RETRY_THRESHOLD,
): RegularizationDerived['hypothesisRetry'] {
  return proposals
    .filter((p) => p.surfaceKey === surfaceKey && p.id !== currentProposalId
      && (p.status === 'rejected' || p.status === 'rolled_back'))
    .map((p) => ({ p, similarity: hypothesisSimilarity(hypothesis, p.hypothesis) }))
    .filter((x) => x.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map((x) => ({ proposalId: x.p.id, title: x.p.title, status: x.p.status, similarity: Number(x.similarity.toFixed(2)) }))
}

// ---- 停滞探测（P3）与剪枝信号（S4） ----

/** 最近 stallWindow 个提案均未被采纳（promoted 且未回滚才算采纳）→ 停滞。 */
export function stallDetection(surfaceProposals: Proposal[], stallWindow: number): boolean {
  const sorted = surfaceProposals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  if (sorted.length < stallWindow) return false
  const recent = sorted.slice(-stallWindow)
  return recent.every((p) => p.status !== 'promoted')
}

/** 最近 pruneN 个提案的全部已记录探测中，最大通过率增量 ≤0 → 该面建议做减法提案。 */
export function pruneSignal(surfaceProposals: Proposal[], pruneN: number): boolean {
  const sorted = surfaceProposals.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const recent = sorted.slice(-pruneN)
  const deltas: number[] = []
  for (const p of recent) {
    for (const probe of p.probes) {
      if (probe.status === 'recorded' && probe.contrast?.passAt1Delta != null) {
        deltas.push(probe.contrast.passAt1Delta)
      }
    }
  }
  return deltas.length > 0 && Math.max(...deltas) <= 0
}

// ---- R12a（2026-10-31 首批执行）：验证信号分级（验证层级理论 arXiv 2607.07663） ----

export type VerificationTier = 'command' | 'heldout' | 'regression' | 'judge' | 'none'

const TIER_ORDER: Record<VerificationTier, number> = { command: 4, heldout: 3, regression: 2, judge: 1, none: 0 }

/**
 * 从提案的探测证据推导本次晋级实际用到的最强验证层：
 * command（命令式验收器运行）> heldout（密封留出，R6 后接）> regression（普通 eval 回归）> judge（LLM 判分主导）> none。
 * 依据：改进强度与验证信号强度绑定（2607.07663）——面板须显式区分，弱层连续晋级是进化健康度信号。
 */
export function verificationTierOf(proposal: Proposal): VerificationTier {
  const selected = composedVariant(proposal)
  if (!selected) return 'none'
  const probe = proposal.probes.find((x) => x.variantId === selected.id && x.status === 'recorded' && x.evidence)
  const ev = probe?.evidence
  if (!ev) return 'none'
  const tiers: VerificationTier[] = []
  if (ev.regression != null) {
    // 回归运行含命令式验收器（eval 侧 outcome command 类型）则升 command 层；
    // ProbeMetrics 无该直读位——以 regression 存在为 regression 层，command 层由
    // heldout/command 专用证据位判定（R6 落地后 heldout 进位）。
    tiers.push('regression')
  }
  if (ev.heldout != null) tiers.push('heldout')
  // 判分主导＝无回归/留出硬证据而 judgeOnline（LLM 判分参与）
  if (tiers.length === 0 && ev.judgeOnline) tiers.push('judge')
  if (tiers.length === 0) tiers.push('none')
  return tiers.sort((a, b) => TIER_ORDER[b] - TIER_ORDER[a])[0]
}

export function tierAtLeast(tier: VerificationTier, floor: VerificationTier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER[floor]
}

// ---- D7/D10（2026-10-31 RSI P2 批）：提案端全历史注入＋删除提案模板 ----

export interface EvolutionHistoryEntry {
  kind: 'adopted' | 'rejected' | 'rolled_back'
  proposalId: string
  title: string
  /** adopted=冠军轮次与增益；rejected=裁决理由；rolled_back=回滚理由。 */
  detail: string
}

/**
 * D7 提案端全历史注入（DGM/ADAS 档案思想在起草侧的消费面）：
 * 该面全部已采纳冠军（含增益）、被拒（含裁决理由）与回滚（含回滚理由）提案
 * 一次性喂给起草器——失败假设禁止换皮重提（升 RRSI P2 的事前版，此前只有
 * Jaccard 事后警告）；低分祖先常是垫脚石，可显式改造而非回避。
 */
export function proposerEvolutionHistory(
  proposals: Proposal[],
  champions: Champion[],
  surfaceKey: SurfaceKey,
): { entries: EvolutionHistoryEntry[]; summary: string } {
  const mine = proposals.filter((p) => p.surfaceKey === surfaceKey)
  const champs = champions
    .filter((c) => c.surfaceKey === surfaceKey)
    .sort((a, b) => (a.promotedAt < b.promotedAt ? -1 : 1))
  const champProposal = new Map(champs.map((c) => [c.proposalId, c]))
  const entries: EvolutionHistoryEntry[] = []
  let round = 0
  for (const c of champs) {
    round += 1
    const proposal = mine.find((p) => p.id === c.proposalId)
    const rolled = proposal?.rollback != null || c.rolledBack === true
    const selected = proposal ? composedVariant(proposal) : null
    const probe = selected
      ? proposal!.probes.find((x) => x.variantId === selected.id && x.status === 'recorded')
      : undefined
    const delta = probe?.contrast?.passAt1Delta
    entries.push({
      kind: rolled ? 'rolled_back' : 'adopted',
      proposalId: c.proposalId,
      title: proposal?.title ?? c.label,
      detail: rolled
        ? `第 ${round} 轮冠军后回滚${proposal?.rollback?.reason ? `（${proposal.rollback.reason.slice(0, 120)}）` : ''}`
        : `第 ${round} 轮冠军${delta != null ? `（pass@1 Δ${(delta * 100).toFixed(1)}pp）` : ''}`,
    })
  }
  for (const p of mine) {
    if (champProposal.has(p.id)) continue
    if (p.status === 'rejected') {
      entries.push({
        kind: 'rejected',
        proposalId: p.id,
        title: p.title,
        detail: `裁决驳回${p.approval?.note ? `（${p.approval.note.slice(0, 120)}）` : ''}`,
      })
    } else if (p.status === 'rolled_back') {
      entries.push({
        kind: 'rolled_back',
        proposalId: p.id,
        title: p.title,
        detail: `回滚${p.rollback?.reason ? `（${p.rollback.reason.slice(0, 120)}）` : ''}`,
      })
    }
  }
  const adopted = champs.filter((c) => {
    const proposal = mine.find((p) => p.id === c.proposalId)
    return !(proposal?.rollback != null || c.rolledBack === true)
  }).length
  const summary = `已采纳 ${adopted} 轮 / 回滚 ${entries.filter((e) => e.kind === 'rolled_back').length} / 拒绝 ${entries.filter((e) => e.kind === 'rejected').length}（提案总数 ${mine.length}）`
  return { entries, summary }
}

export interface DeletionProposalDirective {
  /** pruneSignal 命中＝近窗全部提案零正增益——做减法优先。 */
  suggested: boolean
  windowProposals: Array<{ proposalId: string; title: string; bestDelta: number | null }>
  /** 删除型提案的起草模板（suggested=false 为 null）。 */
  scaffold: string | null
}

/**
 * D10 删除提案模板（RRSI 剪枝信号从 overview 提示升格为可执行提案模板）：
 * 近 n_prune 个提案全部已记录探测增益 ≤0 ⇒ 加法已到边际，起草器收到的不再是
 * 一句「优先做减法」，而是结构化的删除计划模板——每项须给段落锚点＋加入轮次
 * ＋零增益证据＋删除理由，且禁止新增机制段落（论文剪枝=directive 定位，
 * 是否执行仍走人提案＋晋级门）。
 */
export function deletionProposalTemplate(
  proposals: Proposal[],
  surfaceKey: SurfaceKey,
  cfg: RsiConfig = rsiConfig(),
): DeletionProposalDirective {
  const mine = proposals
    .filter((p) => p.surfaceKey === surfaceKey)
    .slice()
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  const recent = mine.slice(-cfg.pruneN)
  const windowProposals = recent.map((p) => {
    const deltas = p.probes
      .filter((x) => x.status === 'recorded' && x.contrast?.passAt1Delta != null)
      .map((x) => x.contrast!.passAt1Delta as number)
    return {
      proposalId: p.id,
      title: p.title,
      bestDelta: deltas.length > 0 ? Math.max(...deltas) : null,
    }
  })
  const suggested = pruneSignal(mine, cfg.pruneN)
  if (!suggested) return { suggested: false, windowProposals, scaffold: null }
  const evidenceLines = windowProposals
    .map((w) => `- ${w.proposalId}「${w.title}」最佳增益 ${w.bestDelta != null ? `${(w.bestDelta * 100).toFixed(1)}pp` : '无读数'}`)
    .join('\n')
  const scaffold = [
    '【删除型提案模板（做减法优先）】近窗提案零正增益证据：',
    evidenceLines,
    '请起草一个删除计划而非新增机制：逐段审读基线文件，列出可整体删除或合并的机制段落。',
    'section 每项格式：「段落锚点（标题或首行摘要）｜加入来源（proposal id 或「基线原生」）｜零增益/负增益证据｜删除理由」。',
    '纪律：不新增任何机制段落；删除后须保证文件结构完整；对「可能有用但无证据」的段落标 [待证] 而非直接删。',
  ].join('\n')
  return { suggested: true, windowProposals, scaffold }
}

// ---- 进化报告（overview 的 evolution 段；论文图 6 曲线与去向计数的本仓形态） ----

function selectedEvidenceOf(p: Proposal): { evidence: ProbeMetrics; contrast: BehaviorContrast | null } | null {
  const selected = composedVariant(p)
  if (!selected) return null
  const probe = p.probes.find((x) => x.variantId === selected.id && x.status === 'recorded')
  if (!probe?.evidence) return null
  return { evidence: probe.evidence, contrast: probe.contrast ?? null }
}

export function evolutionSurfaceReport(
  surfaceKey: SurfaceKey,
  proposals: Proposal[],
  champions: Champion[],
  cfg: RsiConfig,
): EvolutionSurface {
  const mine = proposals.filter((p) => p.surfaceKey === surfaceKey)
  const champChain = champions
    .filter((c) => c.surfaceKey === surfaceKey)
    .sort((a, b) => (a.promotedAt < b.promotedAt ? -1 : 1))
  const byId = new Map(mine.map((p) => [p.id, p]))
  const timeline: EvolutionRound[] = champChain.map((c, idx) => {
    const p = byId.get(c.proposalId)
    const ev = p ? selectedEvidenceOf(p) : null
    return {
      round: idx + 1,
      proposalId: c.proposalId,
      variantLabel: c.label,
      promotedAt: c.promotedAt,
      rolledBack: c.rolledBack === true,
      passAt1: ev?.evidence.passAt1 ?? null,
      tokens: ev?.evidence.tokens ?? null,
      costUsd: ev?.evidence.costUsd ?? null,
      noiseDelta: p?.noise?.delta ?? null,
      passAt1Delta: ev?.contrast?.passAt1Delta ?? null,
      verificationTier: p?.promotion?.verificationTier ?? (p ? verificationTierOf(p) : 'none'),
    }
  })
  const openStatuses: ProposalStatus[] = ['draft', 'submitted', 'approved', 'probing', 'composed']
  return {
    surfaceKey,
    rounds: champions.filter((c) => c.surfaceKey === surfaceKey && !c.rolledBack).length,
    proposalsTotal: mine.length,
    promoted: mine.filter((p) => p.status === 'promoted').length,
    rejected: mine.filter((p) => p.status === 'rejected').length,
    rolledBack: mine.filter((p) => p.status === 'rolled_back').length,
    open: mine.filter((p) => openStatuses.includes(p.status)).length,
    failedProbes: mine.reduce((n, p) => n + p.probes.filter((x) => x.status === 'failed').length, 0),
    stalled: stallDetection(mine, cfg.stallWindow),
    pruneSuggested: pruneSignal(mine, cfg.pruneN),
    weakVerificationStreak: (() => {
      const live = timeline.filter((r) => !r.rolledBack)
      let streak = 0
      for (let i = live.length - 1; i >= 0; i -= 1) {
        const tier = live[i].verificationTier ?? 'none'
        if (tier === 'judge' || tier === 'none') streak += 1
        else break
      }
      return streak
    })(),
    timeline,
  }
}

export function evolutionReport(
  surfaceKeys: SurfaceKey[],
  proposals: Proposal[],
  champions: Champion[],
  cfg: RsiConfig = rsiConfig(),
): EvolutionReport {
  const surfaces = surfaceKeys
    .map((key) => evolutionSurfaceReport(key, proposals, champions, cfg))
    .filter((s) => s.proposalsTotal > 0 || s.rounds > 0)
  const exercised = new Set(proposals.map((p) => p.surfaceKey))
  return {
    config: {
      horizon: cfg.horizon, bMin: cfg.bMin, bMax: cfg.bMax, stallWindow: cfg.stallWindow,
      pruneN: cfg.pruneN, beta0: cfg.beta0, beta1PerPoint: cfg.beta1PerPoint, requireNoise: cfg.requireNoise,
    },
    surfaces,
    unexercised: surfaceKeys.filter((key) => !exercised.has(key)),
    healthWarnings: surfaces
      .filter((s) => s.weakVerificationStreak >= 3)
      .map((s) => ({ surfaceKey: s.surfaceKey, code: 'weak_verification_streak' as const, streak: s.weakVerificationStreak })),
    familyGains: [], // service 层 overview 后处理补（loop 纯函数层拿不到 EvalSet.family）
    retirementCandidates: retirementCandidates(surfaces),
  }
}

// ---- 冠军退役候选（2026-10-23 挂账清偿 G4，腾讯文误区九「拆墙」侧）----
// 语义：时间线上「采纳时增益 ≤0 且相对前一轮变贵」的冠军轮，且其后 ≥minRoundsSince
// 个已采纳轮未被回滚纠正——当年加的控制如今只在花线，值得人复核是否拆除。
// advisory：零增益可能是守卫在起作用，不自动回滚不硬拦；缺读数如实 null。

export const RETIREMENT_MIN_ROUNDS_SINCE = 2

export function retirementCandidates(
  surfaces: EvolutionSurface[],
  minRoundsSince: number = RETIREMENT_MIN_ROUNDS_SINCE,
): RetirementCandidate[] {
  const out: RetirementCandidate[] = []
  for (const s of surfaces) {
    const live = s.timeline.filter((r) => !r.rolledBack)
    for (let i = 0; i < live.length; i += 1) {
      const r = live[i]
      if (r.passAt1Delta == null || r.passAt1Delta > 0) continue
      const prev = i > 0 ? live[i - 1] : null
      const pct = (a: number | null, b: number | null): number | null =>
        a == null || b == null || a === 0 ? null : (b - a) / a
      const costDeltaPct = prev ? pct(prev.costUsd, r.costUsd) : null
      const tokenDeltaPct = prev ? pct(prev.tokens, r.tokens) : null
      const pricier = (costDeltaPct ?? 0) > 0 || (costDeltaPct == null && (tokenDeltaPct ?? 0) > 0)
      if (!pricier) continue
      const roundsSince = live.length - (i + 1)
      if (roundsSince < minRoundsSince) continue
      out.push({
        surfaceKey: s.surfaceKey,
        round: r.round,
        proposalId: r.proposalId,
        variantLabel: r.variantLabel,
        passAt1Delta: r.passAt1Delta,
        costDeltaPct: costDeltaPct == null ? null : Number(costDeltaPct.toFixed(3)),
        tokenDeltaPct: tokenDeltaPct == null ? null : Number(tokenDeltaPct.toFixed(3)),
        roundsSince,
      })
    }
  }
  return out
}

// =====================================================================================
// HarnessPro 帕累托三档选拔纯函数层（2026-10-23 吸收轮）
// 论文 arXiv 2610.26770：淘汰帕累托劣势候选（花钱更多、分还更低），Lite（省钱）/
// Medium（均衡）/Heavy（高性能）三档代表沿性能-成本前沿保留。权重为本仓实例化
// （论文未公开公式细节，spec 决策记录标注）；全部无副作用，单测覆盖全分支。
// =====================================================================================

/**
 * 三档代表选取参考点（本仓实例化，归一化坐标 perf×econ，econ=1-归一成本）：
 * lite=(0,1) 最省代表（性能接受前沿地板）、medium=(1,1) 均衡代表（距双优理想点最近）、
 * heavy=(1,0) 性能代表（接受前沿最贵换最高分）。档位偏好编码在参考点里（论文未公开
 * 公式细节，此为可解释实例化：三代表恰为前沿三个「角+心」）。
 */
export const PARETO_TIER_REFERENCES: Record<ParetoTier, { perf: number; econ: number }> = {
  lite: { perf: 0, econ: 1 },
  medium: { perf: 1, econ: 1 },
  heavy: { perf: 1, econ: 0 },
}

export const PARETO_NOTE = '帕累托双目标=passAt1（越大越好）×costUsd（越小越好）；三档代表=两轴 min-max 归一化后，距档位参考点（lite=(0,1) 最省、medium=(1,1) 双优、heavy=(1,0) 最高分）欧氏平方距离最近的前沿候选。参考点为本仓实例化，论文未公开公式。'

/** a 支配 b ⟺ passAt1 ≥ 且 cost ≤ 且至少一严格（调用方保证双值非 null 有限）。 */
function paretoDominates(a: ParetoPoint, b: ParetoPoint): boolean {
  return a.passAt1! >= b.passAt1! && a.costUsd! <= b.costUsd!
    && (a.passAt1! > b.passAt1! || a.costUsd! < b.costUsd!)
}

/** 帕累托报告：非支配过滤 + 三档代表。单点=前沿（无比较对象）；null 读数如实排除。 */
export function paretoReport(points: ParetoPoint[]): ParetoReport {
  const eligible: ParetoPoint[] = []
  const excluded: ParetoReport['excluded'] = []
  for (const p of points) {
    const perfOk = typeof p.passAt1 === 'number' && Number.isFinite(p.passAt1)
    const costOk = typeof p.costUsd === 'number' && Number.isFinite(p.costUsd)
    if (perfOk && costOk) eligible.push(p)
    else excluded.push({
      variantId: p.variantId,
      label: p.label,
      reason: !perfOk && !costOk ? '缺少通过率与成本读数' : !perfOk ? '缺少通过率读数' : '缺少成本读数',
    })
  }

  const entries: ParetoReport['entries'] = eligible.map((p) => ({
    ...p,
    onFrontier: true,
    dominatedBy: [],
    tier: null,
  }))
  for (const e of entries) {
    e.dominatedBy = entries
      .filter((o) => o !== e && paretoDominates(o, e))
      .map((o) => o.variantId)
    e.onFrontier = e.dominatedBy.length === 0
  }

  const front = entries.filter((e) => e.onFrontier)
  if (front.length > 0) {
    const perfs = front.map((e) => e.passAt1!)
    const costs = front.map((e) => e.costUsd!)
    const perfMin = Math.min(...perfs); const perfMax = Math.max(...perfs)
    const costMin = Math.min(...costs); const costMax = Math.max(...costs)
    const norm = (v: number, min: number, max: number) => (max > min ? (v - min) / (max - min) : 1)
    for (const tier of ['lite', 'medium', 'heavy'] as const) {
      const ref = PARETO_TIER_REFERENCES[tier]
      let best: ParetoReport['entries'][number] | null = null
      let bestDist = Infinity
      for (const e of front) {
        // economy 轴：成本越低分越高（归一化后 1=最省）
        const perfScore = norm(e.passAt1!, perfMin, perfMax)
        const econScore = 1 - norm(e.costUsd!, costMin, costMax)
        const dist = (perfScore - ref.perf) ** 2 + (econScore - ref.econ) ** 2
        if (dist < bestDist) { bestDist = dist; best = e }
      }
      if (best) best.tier = tier
    }
  }

  return { eligible: eligible.length, excluded, entries, note: PARETO_NOTE }
}

/** 从提案的已记录探测组装帕累托报告（service/门禁共用入口）。 */
export function paretoReportOf(proposal: Proposal): ParetoReport {
  const byVariant = new Map(proposal.variants.map((v) => [v.id, v]))
  const points: ParetoPoint[] = []
  for (const probe of proposal.probes) {
    if (probe.status !== 'recorded' || !probe.evidence) continue
    const v = byVariant.get(probe.variantId)
    if (!v) continue
    points.push({ variantId: v.id, label: v.label, passAt1: probe.evidence.passAt1, costUsd: probe.evidence.costUsd })
  }
  return paretoReport(points)
}
