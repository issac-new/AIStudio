// @vitest-environment node
// Round-2 Important 2 负例：ops 三走读面（symbols/conventions/writing-style）的
// 截断 fail-closed 与字面根剪枝。锚定两个方向：
//  - 截断面不构成证据：走读触顶 → error（INCONCLUSIVE），不得 PASS（convention-alignment
//    曾基于 5 万件仓的随机截断面 PASS——release:gate 池实锤）。
//  - 剪枝有效：字面根声明的扫描面在超大仓上不触顶（bulk/ 5001 件在根外被整树跳过）。
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runOpsExecutor } from '../src/executors/ops.js'
import type { ExecutorSpec } from '../src/core/types.js'

/** 造一个大仓夹具：bulk/ 5001 件（保证裸走读触 5000 顶）+ custom/ 少量真实文件。 */
function makeHugeWorkspace(): string {
  const ws = mkdtempSync(join(tmpdir(), 'qgate-scanface-'))
  mkdirSync(join(ws, 'bulk'), { recursive: true })
  for (let i = 0; i < 5001; i++) writeFileSync(join(ws, 'bulk', `f${i}.txt`), `bulk ${i}\n`)
  mkdirSync(join(ws, 'custom'), { recursive: true })
  writeFileSync(join(ws, 'custom', 'x.md'), '# doc\n')
  writeFileSync(join(ws, 'custom', 'x.ts'), 'export const x = 1\n')
  return ws
}

function opsExecutor(over: Partial<ExecutorSpec> & { mode: string; evidenceType?: string }): ExecutorSpec {
  return {
    id: 'e1',
    type: 'ops',
    evidenceType: over.evidenceType ?? 'scan-face-result',
    ...over,
  } as ExecutorSpec
}

describe('conventions 走读面（round-2：截断 fail-closed + 字面根剪枝）', () => {
  it('规则 paths 无字面根（**/*）且仓超走读顶 → error（截断面不构成证据，不得 PASS）', async () => {
    const ws = makeHugeWorkspace()
    try {
      // 数据文件由 loadRel(executor.dataFile, 'conventions') 解析——写进工作区
      writeFileSync(join(ws, 'conventions.json'), JSON.stringify({
        rules: [{ id: 'r1', include: 'NEVER_MATCHES_ANYTHING', paths: ['**/*'], severity: 'fail' }],
      }))
      const ev = await runOpsExecutor(opsExecutor({ mode: 'conventions', dataFile: 'conventions.json' }), {
        runId: 't', gateId: 'g', workspace: ws, commit: 'c',
      })
      expect(ev.result).toBe('error')
      expect(ev.summary).toContain('truncated')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })

  it('规则 paths 字面根（custom/**）→ bulk/ 整树剪枝、走读完整不触顶 → 正常判定（非 error）', async () => {
    const ws = makeHugeWorkspace()
    try {
      writeFileSync(join(ws, 'conventions.json'), JSON.stringify({
        rules: [{ id: 'r1', include: 'NEVER_MATCHES_ANYTHING', paths: ['custom/**'], severity: 'fail' }],
      }))
      const ev = await runOpsExecutor(opsExecutor({ mode: 'conventions', dataFile: 'conventions.json' }), {
        runId: 't', gateId: 'g', workspace: ws, commit: 'c',
      })
      expect(ev.result).not.toBe('error')
      expect(ev.result).toBe('pass') // custom 面内 0 命中——完整面上的干净才是证据
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})

describe('writing-style 走读面（round-2：同口径）', () => {
  it('缺省 **/*.md 无字面根 + 超顶仓 → error；字面根 scan → 剪枝后正常', async () => {
    const ws = makeHugeWorkspace()
    try {
      const truncated = await runOpsExecutor(opsExecutor({ mode: 'writing-style' }), {
        runId: 't', gateId: 'g', workspace: ws, commit: 'c',
      })
      expect(truncated.result).toBe('error')
      expect(truncated.summary).toContain('truncated')
      const pruned = await runOpsExecutor(opsExecutor({ mode: 'writing-style', scan: ['custom/**/*.md'] }), {
        runId: 't', gateId: 'g', workspace: ws, commit: 'c',
      })
      expect(pruned.result).not.toBe('error')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})

describe('symbols 走读面（Task 10 已修，回归锚定）', () => {
  it('scanGlobs 字面根剪枝：超顶仓上管辖面完整不触顶；无 scanGlobs 触顶即 error', async () => {
    const ws = makeHugeWorkspace()
    try {
      writeFileSync(join(ws, 'package.json'), JSON.stringify({ dependencies: {} }))
      const pruned = await runOpsExecutor(opsExecutor({ mode: 'symbols', depsFile: 'package.json', scanGlobs: ['custom/**/*.ts'] }), {
        runId: 't', gateId: 'g', workspace: ws, commit: 'c',
      })
      expect(pruned.result).not.toBe('error')
      const bare = await runOpsExecutor(opsExecutor({ mode: 'symbols', depsFile: 'package.json' }), {
        runId: 't', gateId: 'g', workspace: ws, commit: 'c',
      })
      expect(bare.result).toBe('error')
      expect(bare.summary).toContain('truncated')
    } finally { rmSync(ws, { recursive: true, force: true }) }
  })
})
