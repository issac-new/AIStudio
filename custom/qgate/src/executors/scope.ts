// scope executor（L0 第一批，v0.1 §6.1）：范围与验收完备性的确定性检查。exercised 级。
//   mode=scope      —— 声明范围 vs 实际变更：.qgate/scope.yaml 声明 paths glob，
//                      门比对 git 变更集（或传入 changedPaths），超范围文件 → FAIL 点名。
//   mode=acceptance —— .qgate/acceptance.yaml 的 criteria 每条必须有非空 covered-by
//                      （映射到 gateId 或命令），缺映射条目 → FAIL 点名。
// 两模式输入文件缺失 → error 证据（INCONCLUSIVE：未声明 ≠ 通过）。

import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { isRecord } from '../core/parse.js'
import { globMatch } from '../core/impact.js'
import { hasGherkinSkeleton, loadTaskIntent, taskIntentSha256 } from '../core/task-intent.js'

export interface ScopeExecutorInput {
  runId: string
  gateId: string
  workspace: string
  commit?: string
  changedPaths?: readonly string[]
}

function strList(v: unknown, max = 200): string[] | undefined {
  if (!Array.isArray(v) || v.length > max) return undefined
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string' || x.length === 0) return undefined
    out.push(x)
  }
  return out
}

export function runScopeExecutor(executor: ExecutorSpec, input: ScopeExecutorInput): Evidence {
  const startedAt = Date.now()
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-scope`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: 'error',
    execution: 'wired',
    independence: 'spec-derived',
    provenance: { startedAt, commit: input.commit, cwd: input.workspace },
  }
  const finish = (result: Evidence['result'], summary: string, affected?: string[]): Evidence => {
    ev.result = result
    ev.execution = 'exercised'
    ev.summary = summary.slice(0, 400)
    if (affected) ev.provenance.affectedPaths = affected.slice(0, 100)
    ev.provenance.endedAt = Date.now()
    return ev
  }
  const err = (summary: string): Evidence => {
    ev.summary = summary.slice(0, 400)
    ev.provenance.endedAt = Date.now()
    return ev
  }

  if (executor.mode === 'scope') {
    const scopeFile = join(input.workspace, '.qgate', 'scope.yaml')
    if (!existsSync(scopeFile)) {
      return err('scope declaration missing: .qgate/scope.yaml not found → declare expected change paths first (INCONCLUSIVE, not pass)')
    }
    let declared: string[]
    try {
      const raw = parseYaml(readFileSync(scopeFile, 'utf8')) as Record<string, unknown>
      const paths = strList(raw.paths)
      if (!paths || paths.length === 0) throw new Error('paths empty')
      declared = paths
    } catch (e) {
      return err(`scope.yaml invalid: ${(e as Error).message}`)
    }
    const changed = [...(input.changedPaths ?? [])] // runGate 统一计算传入（避免与 run.ts 循环 import）
    const outOfScope = changed.filter((c) => !declared.some((p) => globMatch(p, c)))
    if (outOfScope.length > 0) {
      return finish('fail', `out-of-scope changes: ${outOfScope.join(', ')} — declare them in scope.yaml or revert`, outOfScope)
    }

    // 任务意图交集对账（v0.3 §4.2）：声明绑定 taskIntent 时，变更还须落在意图 scope 内，
    // 登记文件哈希与声明不符即 FAIL（防静默修改），require 且无登记即 FAIL。
    const ti = executor.taskIntent
    if (ti) {
      const intentFile = join(input.workspace, ti.file)
      if (!existsSync(intentFile)) {
        if (ti.require) return finish('fail', `no-task-intent: ${ti.file} not registered — run 'qgate intent' to declare what this task claims to do (drift reconciliation is binding)`)
        return finish('pass', `all ${changed.length} changed paths within declared scope (${declared.length} globs); task-intent not registered (not required)`, changed)
      }
      const sha = taskIntentSha256(intentFile)
      if (ti.acknowledgedSha256 && sha !== ti.acknowledgedSha256) {
        return finish('fail', `intent-file-modified: ${ti.file} sha256 drifted from acknowledgedSha256 — re-confirm via 'qgate intent --revise --reason ...' and re-bind the hash`)
      }
      const intent = loadTaskIntent(intentFile)
      if (!intent) return err(`task-intent register invalid: ${ti.file} (fail-closed: unreadable intent is not evidence)`)
      const badAc = intent.acceptance.filter((a) => !hasGherkinSkeleton(a))
      if (badAc.length > 0) {
        return finish('fail', `acceptance entries lacking Gherkin When/Then skeleton: ${badAc.map((a) => a.slice(0, 60)).join(' | ')}`)
      }
      // pin 缺席=哈希对账被整体绕过（2026-10-02 审查批）：登记文件在档而无
      // acknowledgedSha256（手删/手写旁路）在 scope 放行前 FAIL——CLI 登记通道必写 pin，
      // 缺席即非正道形态。
      if (!ti.acknowledgedSha256) {
        return finish('fail', `task-intent pin missing: ${ti.file} declares no acknowledgedSha256 — tamper check cannot run; re-bind via 'qgate intent --revise --reason ...'`)
      }
      const outOfIntent = changed.filter((c) => !intent.scope.some((g) => globMatch(g, c)))
      if (outOfIntent.length > 0) {
        return finish('fail', `outside-task-scope: ${outOfIntent.join(', ')} — task ${intent.taskId} declared scope ${intent.scope.join(', ')}; revise intent or revert`, outOfIntent)
      }
      return finish('pass', `all ${changed.length} changed paths within declared scope ∩ task-intent ${intent.taskId} scope (${intent.scope.length} globs)`, changed)
    }

    return finish('pass', `all ${changed.length} changed paths within declared scope (${declared.length} globs)`, changed)
  }

  if (executor.mode === 'acceptance') {
    const accFile = join(input.workspace, '.qgate', 'acceptance.yaml')
    if (!existsSync(accFile)) {
      return err('acceptance declaration missing: .qgate/acceptance.yaml not found → enumerate criteria with covered-by mappings (INCONCLUSIVE, not pass)')
    }
    let criteria: Array<{ id: string; coveredBy: string[] }>
    try {
      const raw = parseYaml(readFileSync(accFile, 'utf8')) as Record<string, unknown>
      if (!Array.isArray(raw.criteria)) throw new Error('criteria list missing')
      criteria = raw.criteria.map((c, i) => {
        if (!isRecord(c)) throw new Error(`criteria[${i}] not an object`)
        const id = typeof c.id === 'string' ? c.id : `AC-${i + 1}`
        const coveredBy = Array.isArray(c.coveredBy)
          ? (c.coveredBy as unknown[]).filter((x): x is string => typeof x === 'string')
          : []
        return { id, coveredBy }
      })
      if (criteria.length === 0) throw new Error('criteria empty')
    } catch (e) {
      return err(`acceptance.yaml invalid: ${(e as Error).message}`)
    }
    const unmapped = criteria.filter((c) => c.coveredBy.length === 0).map((c) => c.id)
    if (unmapped.length === 0) {
      return finish('pass', `all ${criteria.length} acceptance criteria have coverage mappings`)
    }
    return finish('fail', `acceptance criteria without coverage mapping: ${unmapped.join(', ')}`)
  }

  return err(`unknown scope mode: ${String(executor.mode)}`)
}
