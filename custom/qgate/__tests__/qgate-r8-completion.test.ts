// v0.3 R8 门类补齐守门：conventions/consistency 五类型/configuration/documentation/symbols
// + semantic profile(SHACL-lite) + behavior invariant/replayBaseline。
// 负例先行：违规命中、借贷不平、审计链断裂、配置漂移、秘密明文、文档缺、幻觉 import、
// 形状违例、不变量违例、基线漂移——都不得 PASS。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runOpsExecutor } from '../src/executors/ops.js'
import { runSemanticExecutor } from '../src/executors/semantic.js'
import { runBehaviorExecutor } from '../src/executors/behavior.js'
import type { ExecutorSpec } from '../src/core/types.js'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'qgate-r8-'))
const runOps = (e: ExecutorSpec, ws: string) => runOpsExecutor(e, { runId: 'r', gateId: 'g', workspace: ws })
const runSem = (e: ExecutorSpec, ws: string) => runSemanticExecutor(e, { runId: 'r', gateId: 'g', workspace: ws })
const runBeh = (e: ExecutorSpec, ws: string) => runBehaviorExecutor(e, { runId: 'r', gateId: 'g', workspace: ws })

describe('ops conventions（约定对齐）', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'conventions', evidenceType: 'x', dataFile: '.qgate/registers/conventions.json' }

  it('命中 fail 规则 → FAIL 带文件名；干净 → pass；坏正则 → error', () => {
    const ws = tmp()
    mkdirSync(join(ws, '.qgate', 'registers'), { recursive: true })
    mkdirSync(join(ws, 'src'), { recursive: true })
    writeFileSync(join(ws, 'src', 'a.ts'), 'const x = captured_amount\n')
    writeFileSync(join(ws, '.qgate', 'registers', 'conventions.json'), JSON.stringify({
      rules: [{ id: 'no-captured-amount', include: 'captured_amount', paths: ['src/**'], severity: 'fail' }],
    }))
    const fail = runOps(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('src/a.ts')
    writeFileSync(join(ws, 'src', 'a.ts'), 'const x = 1\n')
    expect(runOps(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, '.qgate', 'registers', 'conventions.json'), JSON.stringify({
      rules: [{ id: 'bad', include: '(', paths: [], severity: 'fail' }],
    }))
    expect(runOps(exec, ws).result).toBe('error')
  })
})

describe('ops consistency 五类型', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'consistency', evidenceType: 'x', dataFile: 'c.json' }
  const w = (ws: string, v: unknown) => writeFileSync(join(ws, 'c.json'), JSON.stringify(v))

  it('zero-sum：平 → pass；不平 → fail（整数分键 BigInt 纪律）', () => {
    const ws = tmp()
    w(ws, { kind: 'zero-sum', entries: [{ side: 'debit', amount: 100 }, { side: 'credit', amount: 100 }] })
    expect(runOps(exec, ws).result).toBe('pass')
    w(ws, { kind: 'zero-sum', entries: [{ side: 'debit', amount: 100 }, { side: 'credit', amount: 90 }] })
    expect(runOps(exec, ws).summary).toContain('debit 100 ≠ credit 90')
    w(ws, { kind: 'zero-sum', entries: [{ side: 'debit', amount: 1.5 }] })
    expect(runOps(exec, ws).result).toBe('error')
  })

  it('append-only：update/delete → fail；弱来源 → error', () => {
    const ws = tmp()
    w(ws, { kind: 'append-only', operations: [{ op: 'insert', id: 'a' }, { op: 'insert', id: 'b' }] })
    expect(runOps(exec, ws).result).toBe('pass')
    w(ws, { kind: 'append-only', operations: [{ op: 'insert', id: 'a' }, { op: 'update', id: 'a' }] })
    expect(runOps(exec, ws).summary).toContain('update a')
    w(ws, { kind: 'append-only', sourceType: 'declared', operations: [] })
    expect(runOps(exec, ws).result).toBe('error')
  })

  it('reconciliation：超 SLA → fail；桶内 → pass 带分桶', () => {
    const ws = tmp()
    const now = Date.now()
    w(ws, { kind: 'reconciliation', breakSlaHours: 24, now, breaks: [{ id: 'b1', since: now - 2 * 3_600_000 }] })
    const ok = runOps(exec, ws)
    expect(ok.result).toBe('pass')
    expect(ok.summary).toContain('p2=1')
    w(ws, { kind: 'reconciliation', breakSlaHours: 24, now, breaks: [{ id: 'b1', since: now - 30 * 3_600_000 }] })
    expect(runOps(exec, ws).summary).toContain('SLA')
  })

  it('dlq：静默丢弃/过重投/毒消息未解 → fail', () => {
    const ws = tmp()
    w(ws, { kind: 'dlq', entries: [{ id: 'q1', silentDrops: 0, retries: 2, poisonResolved: true }] })
    expect(runOps(exec, ws).result).toBe('pass')
    w(ws, { kind: 'dlq', maxRetries: 5, entries: [{ id: 'q1', silentDrops: 3, retries: 2, poisonResolved: true }, { id: 'q2', silentDrops: 0, retries: 9, poisonResolved: false }] })
    const fail = runOps(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('silent drop')
    expect(fail.summary).toContain('over-retry')
    expect(fail.summary).toContain('poison')
  })

  it('audit-chain：内核重算——链断裂 → fail；seq 跳号 → fail', () => {
    const ws = tmp()
    const link = (prev: string, seq: number, actor: string, action: string) =>
      require('node:crypto').createHash('sha256').update(`${prev}:${seq}:${actor}:${action}`).digest('hex')
    const h1 = link('genesis', 1, 'a', 'create')
    const h2 = link(h1, 2, 'a', 'post')
    w(ws, { kind: 'audit-chain', chain: [
      { seq: 1, actor: 'a', action: 'create', sha256: h1 },
      { seq: 2, actor: 'a', action: 'post', sha256: h2 },
    ] })
    expect(runOps(exec, ws).result).toBe('pass')
    w(ws, { kind: 'audit-chain', chain: [
      { seq: 1, actor: 'a', action: 'create', sha256: h1 },
      { seq: 2, actor: 'a', action: 'post', sha256: 'tampered'.repeat(8) },
    ] })
    expect(runOps(exec, ws).summary).toContain('sha256 mismatch')
    w(ws, { kind: 'audit-chain', chain: [{ seq: 3, actor: 'a', action: 'x', sha256: h1 }] })
    expect(runOps(exec, ws).summary).toContain('seq must be 1')
  })
})

describe('ops configuration（多环境一致性）', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'configuration', evidenceType: 'x', dataFile: 'c.json' }

  it('对齐 → pass；缺键/未声明差异 → fail；allowedDifferences 通配豁免；秘密明文 → fail（值不进证据）', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'staging.json'), JSON.stringify({ redis: { ttl: 30 }, log: 'info', apiKey: 'ref:vault/x' }))
    writeFileSync(join(ws, 'prod.json'), JSON.stringify({ redis: { ttl: 30 }, log: 'warn', apiKey: 'ref:vault/y' }))
    writeFileSync(join(ws, 'c.json'), JSON.stringify({
      environments: { staging: 'staging.json', production: 'prod.json' },
      allowedDifferences: ['/log', '/apiKey'],
    }))
    expect(runOps(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'prod.json'), JSON.stringify({ redis: { ttl: 60 }, log: 'warn', apiKey: 'ref:vault/y' }))
    const drift = runOps(exec, ws)
    expect(drift.result).toBe('fail')
    expect(drift.summary).toContain('undeclared-difference redis.ttl')
    writeFileSync(join(ws, 'prod.json'), JSON.stringify({ log: 'warn', apiKey: 'ref:vault/y' }))
    expect(runOps(exec, ws).summary).toContain('missing-key redis.ttl')
    writeFileSync(join(ws, 'staging.json'), JSON.stringify({ redis: { ttl: 30 }, apiKey: 'sk-live-123456' }))
    writeFileSync(join(ws, 'prod.json'), JSON.stringify({ redis: { ttl: 30 }, apiKey: 'ref:vault/y' }))
    writeFileSync(join(ws, 'c.json'), JSON.stringify({ environments: { staging: 'staging.json', production: 'prod.json' } }))
    const secret = runOps(exec, ws)
    expect(secret.result).toBe('fail')
    expect(secret.summary).toContain('literal-secret')
    expect(secret.summary).not.toContain('sk-live-123456')
  })
})

describe('ops documentation（文档制品）', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'documentation', evidenceType: 'x', dataFile: 'd.json' }

  it('在档+版本+主题 → pass；缺文件/版本不符/主题缺 → fail 点名', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'API.md'), '# API v2.1\n## 回滚\n见 RUNBOOK\n')
    writeFileSync(join(ws, 'd.json'), JSON.stringify({
      docs: [{ role: 'api', path: 'API.md', version: 'v2.1', requiredTopics: ['回滚'] }],
    }))
    expect(runOps(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'd.json'), JSON.stringify({
      docs: [{ role: 'api', path: 'API.md', version: 'v9.9', requiredTopics: ['灾备'] }],
    }))
    const fail = runOps(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('v9.9')
    expect(fail.summary).toContain('灾备')
    writeFileSync(join(ws, 'd.json'), JSON.stringify({ docs: [{ role: 'user', path: 'MISSING.md' }] }))
    expect(runOps(exec, ws).summary).toContain('file missing')
  })
})

describe('ops symbols（符号接地）', () => {
  const exec: ExecutorSpec = { id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x' }

  it('接地齐全 → pass；幻觉包 → fail；悬空命名成员 → fail；node: 内置豁免', () => {
    const ws = tmp()
    mkdirSync(join(ws, 'src'), { recursive: true })
    writeFileSync(join(ws, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.0.0' } }))
    writeFileSync(join(ws, 'src', 'util.ts'), 'export function helper(): number { return 1 }\nexport const VERSION = "1"\nexport default helper\n')
    writeFileSync(join(ws, 'src', 'app.ts'), [
      "import { helper } from './util'",
      "import def from './util'",
      "import * as fs from 'node:fs'",
      "import { createApp } from 'vue'",
      'export function main(): void { helper(); def(); fs.rmSync; createApp; }',
    ].join('\n'))
    expect(runOps(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'src', 'app.ts'), "import { ghost } from './util'\nimport { stuff } from 'nonexistent-pkg'\n")
    const fail = runOps(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain("member ghost")
    expect(fail.summary).toContain("'nonexistent-pkg'")
  })

  it('require 四形态等价接地（2026-10-02 审查批：const/let/解构赋值此前整行不匹配，未声明依赖逃过检查）', () => {
    const ws = tmp()
    mkdirSync(join(ws, 'src'), { recursive: true })
    writeFileSync(join(ws, 'package.json'), JSON.stringify({ dependencies: { vue: '^3.0.0', yaml: '^2.9.0' } }))
    writeFileSync(join(ws, 'src', 'req.ts'), [
      "const leftpad = require('leftpad-fake')",
      "let y = require('yaml')",
      "const { reactive } = require('vue')",
      'var legacy = require("vue")',
      "require('vue')",
      '// const c = require("commented-pkg")',
    ].join('\n'))
    const fail = runOps(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain("'leftpad-fake' (require)")
    expect(fail.summary).not.toContain('commented-pkg')
    writeFileSync(join(ws, 'src', 'req.ts'), [
      "let y = require('yaml')",
      "const { reactive } = require('vue')",
      'var legacy = require("vue")',
      "require('vue')",
      '// const c = require("commented-pkg")',
    ].join('\n'))
    expect(runOps(exec, ws).result).toBe('pass')
  })
})

describe('semantic profile（SHACL-lite）', () => {
  const exec: ExecutorSpec = { id: 's', type: 'semantic', check: 'profile', evidenceType: 'x', shapesFile: 'shapes.json', dataFile: 'records.json' }

  it('合格 → pass；datatype/pattern/minCount/allowedValues 违例 → fail 点名', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'shapes.json'), JSON.stringify({
      fields: {
        amount: { datatype: 'number', min: 0 },
        currency: { datatype: 'string', pattern: '^[A-Z]{3}$' },
        tags: { minCount: 1 },
        status: { allowedValues: ['open', 'settled'] },
      },
    }))
    writeFileSync(join(ws, 'records.json'), JSON.stringify({ records: [
      { id: 'r1', amount: 100, currency: 'CNY', tags: ['a'], status: 'open' },
    ] }))
    expect(runSem(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'records.json'), JSON.stringify({ records: [
      { id: 'r2', amount: -5, currency: 'cny', tags: [], status: 'closed' },
    ] }))
    const fail = runSem(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('r2.amount')
    expect(fail.summary).toContain('pattern')
    expect(fail.summary).toContain('minCount')
    expect(fail.summary).toContain('allowedValues')
  })
})

describe('behavior invariant（单值集断言）+ replayBaseline', () => {
  it('invariant：违例 → fail；全 when-skip → skipped（INCONCLUSIVE 方向）', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'v.json'), JSON.stringify({ values: { captured: 100, refunded: 30 } }))
    const exec: ExecutorSpec = {
      id: 'b', type: 'behavior', mode: 'invariant', evidenceType: 'x', observedFile: 'v.json',
      assertions: [{ left: 'refunded', operator: 'le', right: 'captured' }],
    }
    expect(runBeh(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'v.json'), JSON.stringify({ values: { captured: 10, refunded: 30 } }))
    const fail = runBeh(exec, ws)
    expect(fail.result).toBe('fail')
    expect(fail.summary).toContain('refunded le captured')
    const skipExec: ExecutorSpec = {
      ...exec,
      assertions: [{ left: 'refunded', operator: 'le', right: 'captured', when: 'flag' }],
    }
    writeFileSync(join(ws, 'v.json'), JSON.stringify({ values: { captured: 1, refunded: 9 } }))
    const skipped = runBeh(skipExec, ws)
    expect(skipped.result).toBe('skipped')
  })

  it('replayBaseline：当次=基线 → pass；漂移 → fail；基线被改 → fail replay-baseline-modified', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'base.json'), JSON.stringify({ cases: [{ id: 'c1', actual: { v: 1 } }] }))
    writeFileSync(join(ws, 'cur.json'), JSON.stringify({ cases: [{ id: 'c1', actual: { v: 1 } }] }))
    const { createHash } = require('node:crypto')
    const sha = createHash('sha256').update(require('fs').readFileSync(join(ws, 'base.json'))).digest('hex')
    const exec: ExecutorSpec = {
      id: 'b', type: 'behavior', mode: 'cases', evidenceType: 'x', observedFile: 'cur.json',
      replayBaseline: { file: 'base.json', contentSha256: sha },
    }
    expect(runBeh(exec, ws).result).toBe('pass')
    writeFileSync(join(ws, 'cur.json'), JSON.stringify({ cases: [{ id: 'c1', actual: { v: 2 } }] }))
    const drift = runBeh(exec, ws)
    expect(drift.result).toBe('fail')
    expect(drift.summary).toContain('replay-drift')
    writeFileSync(join(ws, 'base.json'), JSON.stringify({ cases: [{ id: 'c1', actual: { v: 2 } }] }))
    const tampered = runBeh(exec, ws)
    expect(tampered.result).toBe('fail')
    expect(tampered.summary).toContain('replay-baseline-modified')
  })
})

describe('ops symbols alias/ignore 扩展', () => {
  it('aliases 映射 @/ 前缀后可解析；ignoredSpecifiers 显式豁免', () => {
    const ws = tmp()
    mkdirSync(join(ws, 'client'), { recursive: true })
    writeFileSync(join(ws, 'package.json'), JSON.stringify({ dependencies: {} }))
    writeFileSync(join(ws, 'client', 'store.ts'), 'export const x = 1\n')
    writeFileSync(join(ws, 'app.ts'), "import { x } from '@/store'\nimport { testFn } from 'vitest- injected-global'\nexport const y = x\n")
    // 无配置：@ 与 vitest- 注入均 unresolved
    const bare = runOps({ id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x' }, ws)
    expect(bare.result).toBe('fail')
    // 配置后：alias 解析 + 豁免清单放行
    const configured = runOps({
      id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x',
      aliases: { '@/': './client/' },
      ignoredSpecifiers: ['vitest-'],
    }, ws)
    expect(configured.result).toBe('pass')
  })
})

describe('ops symbols depsFile（符号链借用契约显式化）', () => {
  it('depsFile 指认上游清单：上游声明的包接地；清单缺失 → error（架构漂移）', () => {
    const ws = tmp()
    mkdirSync(join(ws, 'shared-host'), { recursive: true })
    writeFileSync(join(ws, 'shared-host', 'package.json'), JSON.stringify({ devDependencies: { vitest: '^3.2.4', vue: '^3.5.0' } }))
    writeFileSync(join(ws, 'app.ts'), "import { describe } from 'vitest'\nimport { ref } from 'vue'\nexport const x = 1\n")
    // 根清单零依赖（借用架构）：无 depsFile → vitest/vue 判 unresolved（如实）
    const bare = runOps({ id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x' }, ws)
    expect(bare.result).toBe('fail')
    // 指认上游清单 → 接地
    const borrowed = runOps({ id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x', depsFile: 'shared-host/package.json' }, ws)
    expect(borrowed.result).toBe('pass')
    // 指认的清单消失 → error（漂移是异常不是"没依赖"）
    rmSync(join(ws, 'shared-host', 'package.json'))
    const drifted = runOps({ id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x', depsFile: 'shared-host/package.json' }, ws)
    expect(drifted.result).toBe('error')
    expect(drifted.summary).toContain('depsFile missing')
  })
})

describe('ops symbols scoped 包与 alias 根锚定（两正统 bug 回归守门）', () => {
  it('scoped 包 @scope/name 的裸名取前两段（@vue/test-utils 不得切成 @vue）；alias 产物按仓根解析', () => {
    const ws = tmp()
    mkdirSync(join(ws, 'client'), { recursive: true })
    writeFileSync(join(ws, 'package.json'), JSON.stringify({ devDependencies: { '@vue/test-utils': '^2.4.0' } }))
    writeFileSync(join(ws, 'client', 'store.ts'), 'export const x = 1\n')
    // 引用者位于 client/deep/ 下：alias 产物 './client/store' 若按引用者相对解析必失败
    mkdirSync(join(ws, 'client', 'deep'), { recursive: true })
    writeFileSync(join(ws, 'client', 'deep', 'app.ts'), "import { x } from '@/custom/store'\nimport { mount } from '@vue/test-utils'\nexport const y = [x, mount]\n")
    const ev = runOps({
      id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x',
      aliases: { '@/custom/': './client/' },
    }, ws)
    expect(ev.result).toBe('pass')
  })
})

describe('ops symbols 导出面两形态补全（84 条长尾两枚根因的守门）', () => {
  it('export async function 与 export type { A } from 均入导出面（薄 re-export 层视角）', () => {
    const ws = tmp()
    mkdirSync(join(ws, 'lib'), { recursive: true })
    writeFileSync(join(ws, 'package.json'), '{}')
    writeFileSync(join(ws, 'lib', 'util.ts'), [
      'export async function authFetch(u: string): Promise<Response> { return fetch(u) }',
      "export type { GraphSpec, NodeSpec } from './deep'",
      "export { validate } from './deep'",
      'export type Deep = { a: 1 }',
    ].join('\n'))
    writeFileSync(join(ws, 'lib', 'deep.ts'), 'export type GraphSpec = unknown\nexport type NodeSpec = unknown\nexport function validate(): void {}\n')
    writeFileSync(join(ws, 'app.ts'), [
      "import { authFetch, validate } from './lib/util'",
      "import type { GraphSpec, Deep } from './lib/util'",
      'export const x = { authFetch, validate } as unknown as GraphSpec as unknown as Deep',
    ].join('\n'))
    const ev = runOps({ id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x' }, ws)
    expect(ev.result).toBe('pass')
  })
})

describe('ops symbols 导出面收官两形态（const enum + .vue script setup 隐式 default）', () => {
  it('export const enum 入导出面；.vue 文件隐式 default 可被具名外 import', () => {
    const ws = tmp()
    writeFileSync(join(ws, 'package.json'), '{}')
    writeFileSync(join(ws, 'shared.ts'), 'export const enum ReqType { Init = 0, Ok = 1 }\n')
    writeFileSync(join(ws, 'Comp.vue'), '<script setup lang="ts">\nconst x = 1\n</script>\n<template><div/></template>\n')
    writeFileSync(join(ws, 'app.ts'), "import { ReqType } from './shared'\nimport Comp from './Comp.vue'\nexport const y = [ReqType.Init, Comp]\n")
    const ev = runOps({ id: 'o', type: 'ops', mode: 'symbols', evidenceType: 'x' }, ws)
    expect(ev.result).toBe('pass')
  })
})
