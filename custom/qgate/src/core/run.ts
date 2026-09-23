// Run 编排（设计 §5.1 run.ts）：Gate Spec → executors → evidence 归一化 → store → decision。
// Framework ERROR ≠ Gate FAIL（v0.1 §69）：executor 层 error 已转 INCONCLUSIVE 证据，此处不再抛。

import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { relative } from 'node:path'
import type { Evidence, GateRun, GateSpec, Trigger } from './types.js'
import { decide, type Decision } from './decision.js'
import { runCommandExecutor } from '../executors/command.js'
import { runPersistenceExecutor } from '../executors/persistence.js'
import { runOntologyExecutor } from '../executors/ontology.js'
import { runFilesExecutor } from '../executors/files.js'
import { saveRun, storePaths, activeWaiverFor } from './store.js'

export interface RunInput {
  spec: GateSpec
  trigger: Trigger
  workspace: string
  qgateDir: string
  changedPaths?: readonly string[]
}

export interface RunResult {
  run: GateRun
  evidence: Evidence[]
  decision: Decision
}

/** git 上下文（无 git 或命令失败 → undefined，新鲜度退化为时间判定；stderr 静默防噪声泄漏）。 */
function gitOut(workspace: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: workspace,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

export function gitContext(workspace: string): { commit?: string; treeHash?: string; changedPaths: string[] } {
  const out: { commit?: string; treeHash?: string; changedPaths: string[] } = { changedPaths: [] }
  out.commit = gitOut(workspace, ['rev-parse', 'HEAD'])
  // 全状态锚：stash create 捕获 index+工作区（write-tree 只看 index，未暂存改动会漏）。
  // 工作区干净时 stash create 输出为空 → 退回 HEAD。
  const stashed = gitOut(workspace, ['stash', 'create'])
  out.treeHash = stashed && stashed.length > 0 ? stashed : out.commit
  const status = gitOut(workspace, ['status', '--porcelain'])
  const toplevel = gitOut(workspace, ['rev-parse', '--show-toplevel'])
  // monorepo：porcelain 路径是仓库根相对；appliesWhen 按项目根（.qgate 所在）相对匹配。
  // 项目根 ≠ 仓库根时只保留本项目内的变更并剥前缀，仓库其他项目的变更与本门无关。
  const projectPrefix = toplevel && workspace !== toplevel ? relative(toplevel, workspace) : ''
  const toProjectRelative = (p: string): string | null => {
    if (!projectPrefix) return p
    return p.startsWith(`${projectPrefix}/`) ? p.slice(projectPrefix.length + 1) : null
  }
  out.changedPaths = status
    ? status
        .split('\n')
        .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
        .filter((l) => l.length > 0)
        .map(toProjectRelative)
        .filter((p): p is string => p !== null)
    : []
  return out
}

export async function runGate(input: RunInput): Promise<RunResult> {
  const { spec, trigger, workspace, qgateDir } = input
  const runId = `run-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`
  const git = gitContext(workspace)
  const changedPaths = [...(input.changedPaths ?? git.changedPaths)]
  const startedAt = Date.now()

  const evidence: Evidence[] = []
  for (const executor of spec.spec.executors) {
    if (executor.type === 'command') {
      evidence.push((await runCommandExecutor(executor, { runId, gateId: spec.metadata.id, workspace, commit: git.commit, treeHash: git.treeHash })).evidence)
    } else if (executor.type === 'persistence') {
      evidence.push(...(await runPersistenceExecutor(executor, { runId, gateId: spec.metadata.id, workspace, qgateDir, commit: git.commit })))
    } else if (executor.type === 'ontology') {
      evidence.push(await runOntologyExecutor(executor, { runId, gateId: spec.metadata.id, workspace, qgateDir, commit: git.commit }))
    } else if (executor.type === 'files') {
      evidence.push(runFilesExecutor(executor, { runId, gateId: spec.metadata.id, workspace, commit: git.commit }))
    }
  }

  const decision = decide(spec, evidence)

  // P5 豁免：FAIL/INCONCLUSIVE 且存在有效 waiver 且 policy 允许 → WAIVED（v0.1 §17/§20）。
  // 原始判定保留在 failureSummary/conditions 里——豁免不抹除事实。
  const paths = storePaths(qgateDir)
  let verdict = decision.verdict
  let conditions = decision.conditions
  if ((verdict === 'FAIL' || verdict === 'INCONCLUSIVE') && spec.spec.policy.allowWaiver !== false) {
    const waiver = activeWaiverFor(paths, spec.metadata.id)
    if (waiver) {
      verdict = 'WAIVED'
      conditions = [
        `waived by ${waiver.approver}: ${waiver.reason}`,
        `expires ${new Date(waiver.expiresAt).toISOString()}; revalidation: ${waiver.revalidation ?? 'not specified'}`,
        ...(decision.conditions ?? []),
      ]
    }
  }

  const run: GateRun = {
    runId,
    gateId: spec.metadata.id,
    gateVersion: spec.metadata.version,
    trigger,
    workspace,
    startedAt,
    endedAt: Date.now(),
    verdict,
    conditions,
    evidenceIds: evidence.map((e) => e.id),
    commit: git.commit,
    treeHash: git.treeHash,
    changedPaths,
    failureSummary: decision.failureSummary,
  }
  saveRun(paths, run, evidence)
  return { run, evidence, decision }
}
