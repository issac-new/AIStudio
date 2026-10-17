// 台账路径解析单测（2026-10-18 环境遗留清理）：
// 显式 ORGLOOP_LEDGER_TSV 优先且错误时失败关闭；未配置时从 SIM 根最新 run
// 的 evidence/compensation-ledger.tsv 自动发现；无台账仍返回 null。
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveLedgerPath } from '../orgloop-controller'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'ledger-path-'))
  dirs.push(d)
  return d
}
function seedLedger(simRoot: string, run: string, body: string, mtimeSec: number): string {
  const ev = join(simRoot, 'runs', run, 'evidence')
  mkdirSync(ev, { recursive: true })
  const file = join(ev, 'compensation-ledger.tsv')
  writeFileSync(file, body, 'utf-8')
  utimesSync(file, new Date(mtimeSec * 1000), new Date(mtimeSec * 1000))
  return file
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('resolveLedgerPath', () => {
  it('显式 env 存在 → 直接用显式路径', () => {
    const root = tmp()
    const explicit = seedLedger(root, 'run-x', 'id\n', 100)
    expect(resolveLedgerPath(explicit, root)).toBe(explicit)
  })

  it('显式 env 指向不存在文件 → null（显式配置错误仍失败关闭）', () => {
    const root = tmp()
    seedLedger(root, 'run-x', 'id\n', 100)
    expect(resolveLedgerPath(join(root, 'missing.tsv'), root)).toBeNull()
  })

  it('未配置 env → 选最新 mtime 的 run 台账', () => {
    const root = tmp()
    seedLedger(root, '20260101-run-old', 'id\n', 100)
    const newest = seedLedger(root, '20261017-run-new', 'id\n', 200)
    expect(resolveLedgerPath(undefined, root)).toBe(newest)
  })

  it('未配置 env 且无任何台账 → null', () => {
    const root = tmp()
    mkdirSync(join(root, 'runs', '20260101-run-empty'), { recursive: true })
    expect(resolveLedgerPath(undefined, root)).toBeNull()
    expect(resolveLedgerPath(undefined, undefined)).toBeNull()
  })
})
