// 看板库路径字面量棘轮（2026-11-19 流程解耦批二）。
//
// 目的：布局语义唯一正本是 custom/server/services/hermes/kanban-layout.ts；
// 其余 server 非测试面不得再手拼 'kanban.db' / 'kanban','boards' 路径——
// 批二收敛前 9+ 份实现漂移（旧布局口径不一致、boardNameOf 双胞胎）的根因
// 就是各域自拼。允许清单=正本＋6 个存量未收敛文件（挂账台账 N02），只减不增：
// 清单内文件收敛后应从 ALLOWED 删除对应条目，清单外新增字面量即红。
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const SERVER = join(ROOT, 'custom/server')

/** 布局正本（豁免本体）＋存量未收敛文件（N02 台账，只减不增）。 */
const ALLOWED = new Set([
  'services/hermes/kanban-layout.ts', // 正本：全部布局语义的唯一实现
  'middleware/cli-fast-gates.ts',
  'knowledge/board-graph.ts',
  'execution-records/delegate-scan.ts',
  'governance/governance-audit.ts',
  'governance/run-surface.ts',
  'services/hermes/task-workspace-cache.ts',
])

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue
      yield* walk(p)
    } else if (e.name.endsWith('.ts')) {
      yield p
    }
  }
}

function offenders(): string[] {
  const out: string[] = []
  for (const p of walk(SERVER)) {
    const rel = relative(SERVER, p).split(sep).join('/')
    if (ALLOWED.has(rel)) continue
    let src: string
    try { src = readFileSync(p, 'utf8') } catch { continue }
    // 'kanban.db' 字面量 或 'kanban','boards' join 手拼（含双引号变体）
    if (src.includes("'kanban.db'") || src.includes('"kanban.db"')
      || /['"]kanban['"]\s*,\s*['"]boards['"]/.test(src)) {
      out.push(rel)
    }
  }
  return out
}

describe('kanban-layout 棘轮（路径字面量只减不增）', () => {
  it('允许清单内的存量文件真实存在（防删除后空清单虚绿）', () => {
    for (const rel of ALLOWED) {
      const p = join(SERVER, rel)
      expect({ rel, exists: statSync(p, { throwIfNoEntry: false }) !== undefined })
        .toEqual({ rel, exists: true })
    }
  })

  it('清单外 server 非测试面不得出现 kanban.db / kanban,boards 路径字面量', () => {
    const bad = offenders()
    expect(bad, `清单外出现路径字面量（应改用 services/hermes/kanban-layout）：\n${bad.join('\n')}`).toEqual([])
  })
})
