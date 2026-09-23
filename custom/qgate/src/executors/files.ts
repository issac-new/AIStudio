// files executor（P9，L5 运维就绪/发布证据类门用）：制品存在性检查。
// 诚实语义：文件存在 = present 级证据（不 exercised）——单凭它过不了 PASS，
// 决策层会给出 not-exercised → INCONCLUSIVE（policy warn → CONDITIONAL）。
// 这是证据强度阶梯（设计 §4.2）的活演示：present 永远只是占位。

import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Evidence, ExecutorSpec } from '../core/types.js'
import { globMatch } from '../core/impact.js'

export interface FilesExecutorInput {
  runId: string
  gateId: string
  workspace: string
  commit?: string
}

export function runFilesExecutor(executor: ExecutorSpec, input: FilesExecutorInput): Evidence {
  const startedAt = Date.now()
  const patterns = executor.require ?? []
  const missing: string[] = []
  const present: string[] = []
  for (const pattern of patterns) {
    const hits = matchFiles(input.workspace, pattern)
    if (hits.length > 0) present.push(...hits.map((h) => relative(input.workspace, h)))
    else missing.push(pattern)
  }
  const ev: Evidence = {
    id: `ev-${randomUUID().slice(0, 12)}-files`,
    runId: input.runId,
    gateId: input.gateId,
    type: executor.evidenceType,
    producer: executor.id,
    result: missing.length === 0 ? 'pass' : 'fail',
    execution: 'present', // 文件存在 ≠ 真跑过——证据强度三级里的最低档
    independence: 'spec-derived',
    summary:
      missing.length === 0
        ? `all ${patterns.length} required artifacts present (present-level evidence only)`
        : `missing artifacts: ${missing.join(', ')}`,
    provenance: { startedAt, endedAt: Date.now(), commit: input.commit, cwd: input.workspace, affectedPaths: present.slice(0, 50) },
  }
  return ev
}

function matchFiles(root: string, pattern: string): string[] {
  const out: string[] = []
  const visit = (dir: string, depth: number): void => {
    if (depth > 8 || out.length > 500) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git') continue
      const full = join(dir, name)
      let st
      try {
        st = statSync(full)
      } catch {
        continue
      }
      if (st.isDirectory()) visit(full, depth + 1)
      else {
        const rel = relative(root, full)
        if (globMatch(pattern, rel) && existsSync(full)) out.push(full)
      }
    }
  }
  visit(root, 0)
  return out
}
