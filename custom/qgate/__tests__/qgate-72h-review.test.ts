// 2026-10-03 72h 审查轮守门：本轮三处修复的回归锚。
// 1) parse 保留 policy.allowWaiver:false（旧实现把 false 归一成 undefined，
//    cli waive 的拒绝分支与 run 的 `!== false` 守卫整体失效——禁豁免是死代码）
// 2) ops symbols 悬空 default import（裸式 `import Foo from './x'` 走 regex 组3，
//    旧解构丢弃组3，目标无 default 导出时整类逃过接地）
// 3) store state.json 原子写（tmp+rename：落盘后无 .tmp 残留、索引可读）
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parseGateSpec, parseProfile } from '../src/core/parse.js'
import { runOpsExecutor } from '../src/executors/ops.js'
import { storePaths, saveRun } from '../src/core/store.js'
import type { ExecutorSpec, GateRun } from '../src/core/types.js'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'qgate-72h-'))
const runOps = async (e: ExecutorSpec, ws: string) => runOpsExecutor(e, { runId: 'r', gateId: 'g', workspace: ws })

const gate = (over: Record<string, unknown>) => ({
  apiVersion: 'qgate/v1alpha1',
  kind: 'Gate',
  metadata: { id: 't.gate', version: '0.1.0' },
  spec: {
    domain: 'L1',
    claims: ['c1'],
    triggers: ['task_close'],
    executors: [{ id: 'e1', type: 'command', command: ['true'], evidenceType: 'x' }],
    evidence: { required: ['x'] },
    policy: { failure: 'block', inconclusive: 'block' },
    ...over,
  },
})

describe('parse 保留 allowWaiver:false（72h 审查轮）', () => {
  it('gate policy.allowWaiver:false 必须原样落到 spec（不是 undefined）', () => {
    const spec = parseGateSpec(gate({ policy: { failure: 'block', inconclusive: 'block', allowWaiver: false } }))
    expect(spec).not.toBeNull()
    expect(spec!.spec.policy.allowWaiver).toBe(false)
  })

  it('profile override 以 false 收紧同样保留（此前 `=== true` 归丢）', () => {
    const p = parseProfile({
      apiVersion: 'qgate/v1alpha1', kind: 'Profile',
      metadata: { id: 'p', tier: 'lite' },
      spec: { enable: [], disable: [], overrides: { 't.gate': { policy: { allowWaiver: false } } } },
    })
    expect(p).not.toBeNull()
    expect(p!.spec!.overrides!['t.gate']!.policy.allowWaiver).toBe(false)
  })

  it('未声明与 true 语义不变（undefined / true）', () => {
    expect(parseGateSpec(gate({}))!.spec.policy.allowWaiver).toBeUndefined()
    expect(parseGateSpec(gate({ policy: { failure: 'block', inconclusive: 'block', allowWaiver: true } }))!.spec.policy.allowWaiver).toBe(true)
  })
})

describe('ops symbols 悬空 default import（72h 审查轮）', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x' }

  it('裸 default import 指向无 default 导出的模块 → fail 并点名 default', async () => {
    const ws = tmp()
    mkdirSync(join(ws, 'src'), { recursive: true })
    writeFileSync(join(ws, 'package.json'), JSON.stringify({ dependencies: {} }))
    writeFileSync(join(ws, 'src', 'util.ts'), 'export function helper(): number { return 1 }\n')
    writeFileSync(join(ws, 'src', 'app.ts'), "import Solo from './util'\nexport function main(): void { Solo }\n")
    const res = await runOps(exec, ws)
    expect(res.result).toBe('fail')
    expect(res.summary).toContain("default")
  })

  it('目标确有 default 导出 → pass（正例不回归）', async () => {
    const ws = tmp()
    mkdirSync(join(ws, 'src'), { recursive: true })
    writeFileSync(join(ws, 'package.json'), JSON.stringify({ dependencies: {} }))
    writeFileSync(join(ws, 'src', 'util.ts'), 'export default function solo(): number { return 1 }\n')
    writeFileSync(join(ws, 'src', 'app.ts'), "import Solo from './util'\nexport function main(): void { Solo }\n")
    expect((await runOps(exec, ws)).result).toBe('pass')
  })
})

describe('store 原子写（72h 审查轮）', () => {
  it('saveRun 后无 .tmp- 残留且 state.json 可读回', () => {
    const qgateDir = tmp()
    const paths = storePaths(qgateDir)
    const run = { runId: 'run-72h-1', gateId: 't.gate', verdict: 'PASS', startedAt: Date.now() } as unknown as GateRun
    saveRun(paths, run, [])
    const residue = readdirSync(qgateDir).filter((n) => n.includes('.tmp-'))
    expect(residue).toEqual([])
    const state = JSON.parse(readFileSync(join(qgateDir, 'state.json'), 'utf8')) as Record<string, { runId: string }>
    expect(state['t.gate'].runId).toBe('run-72h-1')
  })
})
