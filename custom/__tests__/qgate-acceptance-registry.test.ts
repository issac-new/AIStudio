// L0 断言登记与 pre-push 强制面的守门测试（模型波动加固 B 层）。
// 目的：防止 qgate 再次退化为「有框架、无强制」——登记空/覆盖悬空/推送降级都在这里红。
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const GATE_ID = /^(L\d|engineering|delivery|security|architecture|conventions)\./

function loadYaml(path: string): Record<string, unknown> {
  return parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

describe('qgate 断言登记与 pre-push 强制面', () => {
  it('acceptance.yaml 每条 criterion 都有可解析的覆盖映射', () => {
    const doc = loadYaml('.qgate/acceptance.yaml')
    const criteria = doc.criteria as Array<Record<string, unknown>>
    expect(Array.isArray(criteria)).toBe(true)
    expect(criteria.length).toBeGreaterThanOrEqual(5)
    for (const criterion of criteria) {
      expect(typeof criterion.id).toBe('string')
      expect(String(criterion.statement ?? '').length).toBeGreaterThan(0)
      const coveredBy = criterion.coveredBy as unknown[]
      expect(Array.isArray(coveredBy)).toBe(true)
      expect(coveredBy.length).toBeGreaterThan(0)
      for (const target of coveredBy) {
        expect(typeof target).toBe('string')
        const text = String(target)
        // 覆盖目标只能是仓内已存在文件或门 id；悬空路径当场红。
        if (!GATE_ID.test(text)) expect(existsSync(text), `coveredBy 悬空：${text}`).toBe(true)
      }
    }
  })

  it('scope.yaml 声明了本变更的改动面', () => {
    const doc = loadYaml('.qgate/scope.yaml')
    const paths = doc.paths as string[]
    expect(Array.isArray(paths)).toBe(true)
    expect(paths).toContain('runtime/**')
    expect(paths).toContain('custom/server/modelcap/**')
    expect(paths).toContain('custom/qgate/**')
  })

  it('pre-push 走 L0 硬件集并默认拦截', () => {
    const hook = readFileSync('.swarm-yuan/hooks/pre-push', 'utf8')
    expect(hook).toContain('plan --include-disabled')
    expect(hook).toContain('run "$_g" --trigger pre_commit --include-disabled')
    expect(hook).toContain('QGATE_PREPUSH_ENFORCE:-1')
  })

  it('本变更 spec 四段齐全并声明设计文档影响', () => {
    const spec = readFileSync('docs/superpowers/specs/2026-10-31-model-resilience-hardening.md', 'utf8')
    for (const section of ['## 变更', '## 决策记录', '## 验证', '## 设计文档影响']) {
      expect(spec).toContain(section)
    }
    expect(spec).toContain('DESIGN_SYNC:')
  })
})
