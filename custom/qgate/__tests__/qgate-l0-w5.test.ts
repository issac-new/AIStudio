// W1/W5 守门：L0 三门（scope/acceptance/registers）+ files mustContain + 脱敏 + evidenceCommit 归档。
import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runGate } from '../src/core/run.js'
import { runScopeExecutor } from '../src/executors/scope.js'
import { runFilesExecutor } from '../src/executors/files.js'
import { redactForStore } from '../src/core/store.js'
import type { Evidence, ExecutorSpec, GateSpec } from '../src/core/types.js'

const here = dirname(fileURLToPath(import.meta.url))
const distCli = join(here, '..', 'dist', 'cli.js')

function tmpProject(): { dir: string; qgateDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'qgate-l0-'))
  const qgateDir = join(dir, '.qgate')
  mkdirSync(qgateDir, { recursive: true })
  return { dir, qgateDir }
}

const scopeExecutor: ExecutorSpec = { id: 'l0.scope', type: 'scope', mode: 'scope', evidenceType: 'scope-check-result' }
const acceptanceExecutor: ExecutorSpec = { id: 'l0.acc', type: 'scope', mode: 'acceptance', evidenceType: 'acceptance-coverage-result' }

describe('W1 · scope executor（mode=scope：声明范围 vs 实际变更）', () => {
  it('变更全在声明内 → pass/exercised；超范围 → fail 并点名；未声明 → error（INCONCLUSIVE 不是 PASS）', () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'scope.yaml'), 'paths:\n  - "src/**"\n  - ".qgate/**"\n')
      const ok = runScopeExecutor(scopeExecutor, { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['src/a.ts', '.qgate/scope.yaml'] })
      expect(ok.result).toBe('pass')
      expect(ok.execution).toBe('exercised')

      const bad = runScopeExecutor(scopeExecutor, { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['src/a.ts', 'docs/README.md'] })
      expect(bad.result).toBe('fail')
      expect(bad.summary).toContain('docs/README.md')

      rmSync(join(fx.qgateDir, 'scope.yaml'))
      const undeclared = runScopeExecutor(scopeExecutor, { runId: 'r', gateId: 'g', workspace: fx.dir, changedPaths: ['src/a.ts'] })
      expect(undeclared.result).toBe('error')
      expect(undeclared.execution).toBe('wired')
      expect(undeclared.summary).toContain('scope.yaml')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('W1 · scope executor（mode=acceptance：验收条目映射完备）', () => {
  it('全映射 → pass；缺 covered-by → fail 点名；文件缺失 → error', () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'acceptance.yaml'), [
        'criteria:',
        '  - id: AC-1',
        '    statement: 登录成功跳首页',
        '    coveredBy: [e2e.login]',
        '  - id: AC-2',
        '    statement: 密码错误提示',
        '    coveredBy: [unit.auth]',
      ].join('\n'))
      const ok = runScopeExecutor(acceptanceExecutor, { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(ok.result).toBe('pass')

      writeFileSync(join(fx.qgateDir, 'acceptance.yaml'), [
        'criteria:',
        '  - id: AC-1',
        '    coveredBy: [e2e.login]',
        '  - id: AC-2',
        '    statement: 无映射条目',
      ].join('\n'))
      const bad = runScopeExecutor(acceptanceExecutor, { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(bad.result).toBe('fail')
      expect(bad.summary).toContain('AC-2')

      rmSync(join(fx.qgateDir, 'acceptance.yaml'))
      const missing = runScopeExecutor(acceptanceExecutor, { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(missing.result).toBe('error')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('W1 · files mustContain（登记在档且含必备标记段）', () => {
  it('在档且标记齐 → pass；缺标记 → fail 点名；仍为 present 级', () => {
    const fx = tmpProject()
    try {
      const regDir = join(fx.dir, '.qgate', 'registers')
      mkdirSync(regDir, { recursive: true })
      writeFileSync(join(regDir, 'assumptions.md'), '# Registers\n\n## Assumptions\n- assumption: DB 已迁移\n  impact: 高\n')
      writeFileSync(join(regDir, 'decisions.md'), '# Dec\n\n## Decisions\n- decision: 用 SQLite\n  status: accepted\n')
      const executor: ExecutorSpec = {
        id: 'l0.reg', type: 'files',
        require: ['.qgate/registers/assumptions.md', '.qgate/registers/decisions.md'],
        mustContain: [
          { file: '.qgate/registers/assumptions.md', markers: ['## Assumptions', 'assumption:', 'impact:'] },
          { file: '.qgate/registers/decisions.md', markers: ['## Decisions', 'decision:', 'status:'] },
        ],
        evidenceType: 'registers-present',
      }
      const ok = runFilesExecutor(executor, { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(ok.result).toBe('pass')
      expect(ok.execution).toBe('exercised') // mustContain=真实内容检查（非纯存在性）

      writeFileSync(join(regDir, 'decisions.md'), '# Dec\n\n## Decisions\n（空登记，无条目）\n')
      const bad = runFilesExecutor(executor, { runId: 'r', gateId: 'g', workspace: fx.dir })
      expect(bad.result).toBe('fail')
      expect(bad.summary).toContain('decision:')
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('W1 · L0 门端到端（runGate→判定→store）', () => {
  it('scope 门 FAIL 阻断语义（明细在证据摘要）；registers 门 mustContain 为 exercised 级（标记缺失=真 FAIL）', async () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), 'profile: vibe-fast\nclaims: []\n')
      writeFileSync(join(fx.qgateDir, 'scope.yaml'), 'paths:\n  - "src/**"\n')
      const scopeSpec: GateSpec = {
        apiVersion: 'qgate/v1alpha1', kind: 'Gate',
        metadata: { id: 'L0.scope-check', version: '0.1.0' },
        spec: {
          domain: 'L0', claims: ['c'], triggers: ['task_close'],
          executors: [scopeExecutor], evidence: { required: ['scope-check-result'] },
          policy: { failure: 'block', inconclusive: 'warn' },
        },
      }
      const fail = await runGate({ spec: scopeSpec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: ['src/a.ts', 'db/x.sql'] })
      expect(fail.run.verdict).toBe('FAIL')
      expect(fail.run.failureSummary).toContain('scope-check-result:fail')
      expect(fail.evidence[0].summary).toContain('db/x.sql') // 超范围明细在证据摘要（explain 消费）
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})

describe('W5 · 脱敏（v0.1 §50）', () => {
  it('secret 模式与 env 值在落盘前打码；正常文本不受影响', () => {
    process.env.QGATE_TEST_SECRET = 'super-secret-token-xyz'
    try {
      const ev = {
        id: 'ev1', runId: 'r', gateId: 'g', type: 't', producer: 'p',
        result: 'fail' as const, execution: 'exercised' as const,
        summary: 'failed: Authorization: Bearer super-secret-token-xyz and api_key="abcd1234efgh5678"',
        provenance: { startedAt: 1 },
      }
      const out = redactForStore(ev) as typeof ev
      expect(out.summary).not.toContain('super-secret-token-xyz')
      expect(out.summary).not.toContain('abcd1234efgh5678')
      expect(out.summary).toContain('***REDACTED***')
      expect(redactForStore('plain text, no secrets')).toBe('plain text, no secrets')
    } finally {
      delete process.env.QGATE_TEST_SECRET
    }
  })

  it('runGate 落盘的证据文件已脱敏（泄漏负例：stderr 尾巴带 token）', async () => {
    process.env.QGATE_LEAK = 'zzz-leak-value-987654'
    try {
      const fx = tmpProject()
      try {
        // command executor 把 stderr 尾巴写进 summary——模拟一个"打印 env secret 后退出非零"的命令
        const spec: GateSpec = {
          apiVersion: 'qgate/v1alpha1', kind: 'Gate',
          metadata: { id: 't.leak', version: '0.1.0' },
          spec: {
            domain: 'L1', claims: ['c'], triggers: ['task_close'],
            executors: [{ id: 'e', type: 'command', command: ['node', '-e', 'console.error(process.env.QGATE_LEAK); process.exit(3)'], evidenceType: 'x' }],
            evidence: { required: ['x'] }, policy: { failure: 'block', inconclusive: 'warn' },
          },
        }
        const result = await runGate({ spec, trigger: 'task_close', workspace: fx.dir, qgateDir: fx.qgateDir, changedPaths: [] })
        const evFile = join(fx.qgateDir, 'evidence', result.run.runId, `${result.evidence[0].id}.json`)
        const stored = readFileSync(evFile, 'utf8')
        expect(stored).not.toContain('zzz-leak-value-987654')
        expect(stored).toContain('***REDACTED***')
      } finally { rmSync(fx.dir, { recursive: true, force: true }) }
    } finally {
      delete process.env.QGATE_LEAK
    }
  })
})

describe('W5 · evidenceCommit 归档（v0.1 §51 证据落卡）', () => {
  it('qgate.yaml 开 evidenceCommit 后 run 把证据复制进 docs/delivery-evidence/', () => {
    const fx = tmpProject()
    try {
      writeFileSync(join(fx.qgateDir, 'qgate.yaml'), 'profile: vibe-fast\nclaims: []\nevidenceCommit: true\n')
      writeFileSync(join(fx.qgateDir, 'scope.yaml'), 'paths:\n  - "src/**"\n')
      const res = spawnSync('node', [distCli, 'run', 'L0.scope-check'], {
        cwd: fx.dir, encoding: 'utf8', timeout: 30_000,
      })
      expect(res.status).toBe(0)
      expect(res.stdout).toContain('archived')
      const archiveRoot = join(fx.dir, 'docs', 'delivery-evidence')
      expect(existsSync(archiveRoot)).toBe(true)
      expect(readdirSync(archiveRoot).length).toBeGreaterThanOrEqual(1)
    } finally { rmSync(fx.dir, { recursive: true, force: true }) }
  })
})
