// overlay/secaudit 代码仓审计面守门（2026-10-21 挂账清偿批次 D）：
// 三采集器（密钥形态/依赖声明面/危险 API）只读 fail-soft；漏洞判定指向在线门不造数。
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('代码仓审计面（批次 D）', () => {
  let repo: string

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'secaudit-repo-'))
  })
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('catalog 含 repo 三面且为自动采集面', async () => {
    const { SURFACE_CATALOG } = await import('../catalog')
    const classes = SURFACE_CATALOG.map((s) => s.class)
    for (const cls of ['repo_secrets', 'repo_deps', 'repo_dangerous_api']) {
      expect(classes).toContain(cls)
      expect(SURFACE_CATALOG.find((s) => s.class === cls)?.manual).toBe(false)
    }
  })

  it('密钥采集器命中夹具密钥形态；干净仓计 0', async () => {
    const { scanRepoSecrets } = await import('../repo-scan')
    writeFileSync(join(repo, 'config.js'), 'const ak = "AKIAIOSFODNN7EXAMPLE";\nconst tk = "sk-proj-abcdefghijklmnopqrstuvwx";\n')
    const hit = scanRepoSecrets(repo)
    expect(hit.count).toBeGreaterThanOrEqual(2)
    expect(hit.summary).toContain('密钥')

    const clean = mkdtempSync(join(tmpdir(), 'secaudit-clean-'))
    try {
      writeFileSync(join(clean, 'a.txt'), 'hello world nothing secret\n')
      expect(scanRepoSecrets(clean).count).toBe(0)
    } finally {
      rmSync(clean, { recursive: true, force: true })
    }
  })

  it('依赖采集器只记声明面并指向在线漏洞门（不造漏洞数据）', async () => {
    const { scanRepoDeps } = await import('../repo-scan')
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'x', dependencies: { koa: '^2.14.0', vue: '^3.4.0' } }, null, 2))
    writeFileSync(join(repo, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/koa': {} } }))
    const r = scanRepoDeps(repo)
    expect(r.summary).toContain('2')
    expect(r.summary).toContain('sast-audit')
  })

  it('危险 API 采集器命中 eval/exec 拼接；排除 node_modules', async () => {
    const { scanRepoDangerousApi } = await import('../repo-scan')
    writeFileSync(join(repo, 'a.js'), 'const x = eval(userInput);\n')
    writeFileSync(join(repo, 'b.ts'), "import { execSync } from 'child_process'\nexecSync(`ls ${dir}`)\n")
    mkdirSync(join(repo, 'node_modules', 'dep'), { recursive: true })
    writeFileSync(join(repo, 'node_modules', 'dep', 'c.js'), 'eval(payload)\n')
    const r = scanRepoDangerousApi(repo)
    expect(r.count).toBeGreaterThanOrEqual(2)
    expect(r.summary).toContain('eval')
  })

  it('repoRoot 未指定且无 SECAUDIT_REPO_ROOT → 三面如实跳过（不假检）', async () => {
    const { collectAutoEvidence } = await import('../collectors')
    const prev = process.env.SECAUDIT_REPO_ROOT
    delete process.env.SECAUDIT_REPO_ROOT
    try {
      const out = await collectAutoEvidence()
      expect(out.repo_secrets!.summary).toContain('repoRoot 未指定')
      expect(out.repo_secrets!.count).toBe(0)
    } finally {
      if (prev !== undefined) process.env.SECAUDIT_REPO_ROOT = prev
    }
  })

  it('SECAUDIT_REPO_ROOT 指定目标仓时生效', async () => {
    const { collectAutoEvidence } = await import('../collectors')
    writeFileSync(join(repo, 'a.js'), 'const k = "AKIAIOSFODNN7EXAMPLE";\n')
    const prev = process.env.SECAUDIT_REPO_ROOT
    process.env.SECAUDIT_REPO_ROOT = repo
    try {
      const out = await collectAutoEvidence()
      expect(out.repo_secrets!.count).toBeGreaterThanOrEqual(1)
    } finally {
      if (prev !== undefined) process.env.SECAUDIT_REPO_ROOT = prev
      else delete process.env.SECAUDIT_REPO_ROOT
    }
  })

  it('collectAutoEvidence 带 repoRoot 输出 repo 三键（fail-soft 不炸）', async () => {
    const { collectAutoEvidence } = await import('../collectors')
    const out = await collectAutoEvidence({ repoRoot: repo })
    for (const key of ['repo_secrets', 'repo_deps', 'repo_dangerous_api']) {
      expect(out[key]).toBeDefined()
      expect(typeof out[key]!.count).toBe('number')
      expect(out[key]!.summary.length).toBeGreaterThan(0)
    }
  })
})
