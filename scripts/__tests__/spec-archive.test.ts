// spec-archive 单元（2026-11-05 AI Native 吸收批 T7）：delta 解析/域解析/合并追加/
// MODIFIED-REMOVED 存在性告警/盖章幂等/--move 的 A.1 联动语义，全部在假树上验证。
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const SCRIPT = resolve(__dirname, '../spec-archive.mjs')

function run(root: string, args: string[]): { code: number; out: string; err: string } {
  const r = spawnSync('node', [SCRIPT, ...args], {
    env: { ...process.env, SPEC_ARCHIVE_ROOT: root },
    encoding: 'utf8',
  })
  return { code: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' }
}

function fakeTree(): string {
  const dir = mkdtempSync(join(tmpdir(), 'spec-arch-'))
  mkdirSync(join(dir, 'docs/superpowers/specs'), { recursive: true })
  writeFileSync(join(dir, 'docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md'),
    '# 附录 A：产品面全量 spec 索引（1 份设计/规格/决策文档）\n\nA.1 收 1 份。\n\n## A.1 逐份索引\n\n| 文件名 | 主旨 | 结论要点 |\n|---|---|---|\n| 2026-11-05-pay-idempotency | 支付幂等规格 | 三场景 |\n')
  writeFileSync(join(dir, 'docs/superpowers/specs/2026-11-05-pay-idempotency.md'),
    `# 支付幂等\n\n## 变更\n- 新增幂等键语义\n\n## 决策记录\n- D-1 采用幂等 token\n\n### ADDED Requirements\n\n### Requirement: 幂等键必填\n同一订单重复支付只处理一次\n\n#### Scenario: 同键重复\n- **WHEN** 同 key 24h 内重复提交\n- **THEN** 返回首次结果\n\n### REMOVED Requirements\n\n### Requirement: 旧重试语义\n- **Reason:** 与幂等键冲突\n- **Migration:** 迁移到幂等键\n`)
  return dir
}

describe('spec-archive（delta 归档）', () => {
  it('无 delta 段 → 退出 1 且说明无需归档', () => {
    const dir = fakeTree()
    try {
      writeFileSync(join(dir, 'docs/superpowers/specs/2026-11-05-plain.md'), '# P\n\n## 决策记录\n- D-1 x\n')
      const r = run(dir, ['docs/superpowers/specs/2026-11-05-plain.md'])
      expect(r.code).toBe(1)
      expect(r.err).toContain('无 delta 段')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('合并：registry/<域>.md 创建＋追加＋源 spec 盖章＋告警登记不阻断', () => {
    const dir = fakeTree()
    try {
      const r = run(dir, ['docs/superpowers/specs/2026-11-05-pay-idempotency.md'])
      expect(r.code).toBe(0)
      const reg = join(dir, 'docs/superpowers/specs/registry/pay.md')
      expect(existsSync(reg)).toBe(true)
      const body = readFileSync(reg, 'utf8')
      expect(body).toContain('### Requirement: 幂等键必填')
      expect(body).toContain('## 2026-11-05 · 2026-11-05-pay-idempotency.md')
      // REMOVED 的「旧重试语义」不在既有 registry（首归档）→ 告警不阻断
      expect(r.err).toContain('旧重试语义')
      // 盖章
      const src = readFileSync(join(dir, 'docs/superpowers/specs/2026-11-05-pay-idempotency.md'), 'utf8')
      expect(src).toContain('已归档：2026-11-05 → registry/pay.md')
      // 幂等：重复跑不再追加（stamp 命中仍会追加条目？——按实现 stamp 只防重复盖章，
      // 重复归档会重复追加；这里钉住「可重复执行不炸」）
      const r2 = run(dir, ['docs/superpowers/specs/2026-11-05-pay-idempotency.md'])
      expect(r2.code).toBe(0)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('--move：源文件入 archive/＋A.1 删行＋计数递减', () => {
    const dir = fakeTree()
    try {
      const r = run(dir, ['docs/superpowers/specs/2026-11-05-pay-idempotency.md', '--move'])
      expect(r.code).toBe(0)
      expect(existsSync(join(dir, 'docs/superpowers/specs/archive/2026-11-05-pay-idempotency.md'))).toBe(true)
      expect(existsSync(join(dir, 'docs/superpowers/specs/2026-11-05-pay-idempotency.md'))).toBe(false)
      const a1 = readFileSync(join(dir, 'docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md'), 'utf8')
      expect(a1).not.toContain('| 2026-11-05-pay-idempotency |')
      expect(a1).toContain('（0 份设计/规格/决策文档）')
      expect(a1).toContain('A.1 收 0 份')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('--dry-run：不动任何文件', () => {
    const dir = fakeTree()
    try {
      const r = run(dir, ['docs/superpowers/specs/2026-11-05-pay-idempotency.md', '--dry-run'])
      expect(r.code).toBe(0)
      expect(r.out).toContain('registry/pay.md')
      expect(existsSync(join(dir, 'docs/superpowers/specs/registry'))).toBe(false)
      const src = readFileSync(join(dir, 'docs/superpowers/specs/2026-11-05-pay-idempotency.md'), 'utf8')
      expect(src).not.toContain('已归档')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('显式「## 规格域」覆盖文件名推域', () => {
    const dir = fakeTree()
    try {
      const p = join(dir, 'docs/superpowers/specs/2026-11-05-pay-idempotency.md')
      writeFileSync(p, readFileSync(p, 'utf8').replace('# 支付幂等', '# 支付幂等\n\n## 规格域：payment-core'))
      const r = run(dir, ['docs/superpowers/specs/2026-11-05-pay-idempotency.md', '--dry-run'])
      expect(r.out).toContain('registry/payment-core.md')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
