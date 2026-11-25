// 守门：dependency-audit.mjs 的清单加载与审计输出解析（2026-11-26 批 C，无网络纯解析）。
// spec: docs/superpowers/specs/2026-11-26-full-retro-design-revision-batch.md（批 C、决策 D4）
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadAccepted, normalize } from '../../scripts/dependency-audit.mjs'

const root = resolve(__dirname, '../..')

describe('loadAccepted v2 对象形态', () => {
  it('对象条目齐全：ids 可匹配、完整度满格、无告警', () => {
    const r = loadAccepted(JSON.stringify({
      accepted: [
        { id: 'GHSA-aaaa-bbbb-cccc', package: 'foo', reason: 'r', tracking: 'N35-10', retireWhen: '上游升级' },
        { id: 'bar@1.0.0 - 1.2.3', package: 'bar', reason: 'r', tracking: 'N35-8', retireWhen: '上游升级' },
      ],
    }))
    expect(r.total).toBe(2)
    expect(r.complete).toBe(2)
    expect(r.warnings).toEqual([])
    expect(r.ids.has('GHSA-aaaa-bbbb-cccc')).toBe(true)
    expect(r.ids.has('bar@1.0.0 - 1.2.3')).toBe(true)
  })

  it('对象缺 id：跳过不进 ids，告警不拦', () => {
    const r = loadAccepted(JSON.stringify({
      accepted: [{ package: 'foo', reason: 'r', retireWhen: 'x' }, { id: 'GHSA-ok', package: 'p', reason: 'r', retireWhen: 'x' }],
    }))
    expect(r.total).toBe(2)
    expect(r.complete).toBe(1)
    expect(r.ids.has('GHSA-ok')).toBe(true)
    expect(r.ids.size).toBe(1)
    expect(r.warnings.some((w) => w.includes('缺 id') && w.includes('#0'))).toBe(true)
  })

  it('对象缺 package/reason/retireWhen：逐条「缺元数据」告警且不计完整度', () => {
    const r = loadAccepted(JSON.stringify({
      accepted: [{ id: 'GHSA-1' }, { id: 'GHSA-2', package: 'p', reason: 'r' }],
    }))
    expect(r.complete).toBe(0)
    expect(r.warnings.filter((w) => w.includes('GHSA-1')).join('\n')).toContain('缺 package/reason/retireWhen')
    expect(r.warnings.filter((w) => w.includes('GHSA-2')).join('\n')).toContain('缺 retireWhen')
  })

  it('legacy 字符串条目：视为仅 id，不计完整度也不告警（兼容形态）', () => {
    const r = loadAccepted(JSON.stringify({ accepted: ['GHSA-legacy', 'pkg@1 - 2'] }))
    expect(r.total).toBe(2)
    expect(r.complete).toBe(0)
    expect(r.warnings).toEqual([])
    expect(r.ids.has('GHSA-legacy')).toBe(true)
  })

  it('缺 accepted 数组与非 JSON 输入如实报错', () => {
    const r = loadAccepted('{}')
    expect(r.total).toBe(0)
    expect(r.warnings.some((w) => w.includes('缺 accepted 数组'))).toBe(true)
    expect(() => loadAccepted('not json')).toThrow()
  })
})

describe('normalize 审计输出解析', () => {
  it('npm：via.source 是数字通告号时回退「包@影响范围」作 id', () => {
    const raw = JSON.stringify({
      vulnerabilities: {
        katex: {
          name: 'katex', severity: 'low',
          via: [{ source: 1241206, name: 'katex', severity: 'low' }],
          range: '0.11.0 - 0.18.1',
        },
      },
    })
    expect(normalize(raw, 'npm')).toEqual([{ id: 'katex@0.11.0 - 0.18.1', name: 'katex', severity: 'low' }])
  })

  it('npm：via.source 带 GHSA 号时用 GHSA 作 id；字符串 via（被依赖方）不产出条目', () => {
    const raw = JSON.stringify({
      vulnerabilities: {
        'basic-ftp': {
          name: 'basic-ftp', severity: 'high',
          via: [{ source: 'GHSA-c475-qrg2-pj4r', name: 'basic-ftp', severity: 'high' }],
          range: '5.0.0 - 5.3.1',
        },
        '@vscode/markdown-it-katex': { name: '@vscode/markdown-it-katex', severity: 'low', via: ['katex'], range: '*' },
      },
    })
    expect(normalize(raw, 'npm')).toEqual([{ id: 'GHSA-c475-qrg2-pj4r', name: 'basic-ftp', severity: 'high' }])
  })

  it('pnpm：github_advisory_id 作 id，findings 逐版本展开', () => {
    const raw = JSON.stringify({
      advisories: {
        a: {
          github_advisory_id: 'GHSA-c475-qrg2-pj4r', module_name: 'basic-ftp', severity: 'high',
          findings: [{ version: '5.2.2' }, { version: '5.3.1' }],
        },
      },
    })
    expect(normalize(raw, 'pnpm')).toEqual([
      { id: 'GHSA-c475-qrg2-pj4r', name: 'basic-ftp', severity: 'high' },
      { id: 'GHSA-c475-qrg2-pj4r', name: 'basic-ftp', severity: 'high' },
    ])
  })
})

describe('真实清单守门（config/accepted-vulnerabilities.json）', () => {
  const real = loadAccepted(readFileSync(resolve(root, 'config/accepted-vulnerabilities.json'), 'utf8'))

  it('14 条全部是 v2 完整对象（缺一条元数据即红）', () => {
    expect(real.total).toBe(14)
    expect(real.complete).toBe(14)
    expect(real.warnings).toEqual([])
  })

  it('id 与审计输出的两种口径逐字对齐（npm 回退串含空格连字符；GHSA 号原样）', () => {
    expect(real.ids.has('katex@0.11.0 - 0.18.1')).toBe(true)
    expect(real.ids.has('GHSA-c475-qrg2-pj4r')).toBe(true)
    expect(real.ids.has('GHSA-238p-pmpm-9mq7')).toBe(true)
  })
})
