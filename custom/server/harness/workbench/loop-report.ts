// 改进闭环晋级门禁（v0.4 第四批拆分，来自 loop-report）。
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

import { rsiConfig } from './loop-config'
import { paretoReportOf } from './loop-pareto'

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

      // ---- W1 执行证迹（2026-11-05 四篇论文吸收）：增益必须伴随机制真的运行过 ----
      // Evo² §3.3.2：Reflector 的正增益只有在轨迹里能证明新机制运行过才计入，否则置零。
      // 本仓判定口径：候选引入的可判定标记（skill/子代理名）在探测轨迹里一次都没出现
      // ＝该机制大概率没跑，涨的分不能归因给它。只对「有意义增益」判定：噪声带未标定时
      // 退化为任何正增益；标定后必须超过 δ，避免把探索性提案按噪声分拦死。
      {
        const gainNow = contrast?.passAt1Delta ?? null
        const noiseNow = input.regularization?.noiseDelta ?? null
        const meaningfulGain = gainNow != null && gainNow > 0 && (noiseNow == null || gainNow > noiseNow)
        if (meaningfulGain) {
          const et = probe.evidence.executionTrace ?? null
          if (!et || et.status === 'absent') {
            const msg = '未采集执行证迹：无法证明候选引入的机制在探测中真的运行过（Evo² §3.3.2）'
            if (rsiConfig().requireExecution) blockers.push({ code: 'mechanism_trace_missing', message: msg })
            else warnings.push({ code: 'mechanism_trace_missing', message: msg })
          } else if (et.status === 'observed' && et.markers.length > 0 && et.hit.length === 0) {
            blockers.push({
              code: 'mechanism_not_executed',
              message: `候选引入 ${et.markers.join('、')}，但探测轨迹零命中（扫描 ${et.scannedChars} 字符）——增益无法归因到该机制，按 Evo² 纪律置零`,
            })
          }
        }
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

  // ---- W2 编辑类别分层（2026-11-05 四篇论文吸收，Harness² INV/DOM） ----
  // 分层的目的不是分类好看，是让「一类涨、一类跌」的跷跷板效应可归因：
  // 混装两类改动时，涨跌分不清是谁的功，下一轮也就无法定向修正。
  {
    const cfg = rsiConfig()
    const ec = proposal.editClass ?? null
    if (ec == null) {
      const msg = '未声明编辑类别（invariant=怎么干活 / domain=领域知识）：跷跷板效应无法归因到层，建议在提案里声明'
      if (cfg.requireEditClass) blockers.push({ code: 'edit_class_undeclared', message: msg })
      else warnings.push({ code: 'edit_class_undeclared', message: msg })
    } else if (ec === 'mixed') {
      const msg = '提案混装通用不变量与领域知识改动：两类效果会互相抵消且无法归因，建议拆成两份提案分别验证（Harness² 分层纪律）'
      if (cfg.requireEditClass) blockers.push({ code: 'edit_class_mixed', message: msg })
      else warnings.push({ code: 'edit_class_mixed', message: msg })
    }
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

/** 一个候选的捆绑改动数：单文件=1；树候选=新增/修改文件数+删除数。 */
export function editCountOfVariant(v: Variant): number {
  if (v.files && v.files.length > 0) return v.files.length + (v.deletions?.length ?? 0)
  return 1
}

export function maxEditCount(variants: Variant[]): number | null {
  if (variants.length === 0) return null
  return Math.max(...variants.map(editCountOfVariant))
}

