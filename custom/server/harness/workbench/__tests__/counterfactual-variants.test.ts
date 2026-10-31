// R3（2026-10-31 二批执行）：CHASE 协议变换器守门。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _useStoreDirForTests, createSet } from '../../../eval/store'
import { buildCounterfactualVariant, VARIANT_KINDS } from '../counterfactual-variants'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cf-var-'))
  _useStoreDirForTests(dir)
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function seedSet(): string {
  const r = createSet({
    name: '源集', track: 'e2e',
    tasks: [
      { id: 't1', problem: '打开 src/main.py 并修复 file 里的 bug', expectedBehavior: '修复完成', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] },
      { id: 't2', problem: '运行 test_foo 验证', expectedBehavior: '测试通过', rubric: [{ id: 'a1', text: 'ok', expect: 'yes', kind: 'result' }] },
    ],
  })
  if (!r.ok) throw new Error(JSON.stringify(r))
  return r.set.id
}

describe('R3 CHASE 协议变换器', () => {
  it('四类变换全覆盖：id 哈希可复现、期望行为逐字保留、语义清单在位', () => {
    const setId = seedSet()
    for (const kind of VARIANT_KINDS) {
      const v = buildCounterfactualVariant(setId, kind)
      expect(v, kind).not.toBeNull()
      expect(v!.tasks).toHaveLength(2)
      expect(v!.tasks.every((t) => t.transformNote.length > 0)).toBe(true)
      expect(v!.semanticChecklist.length).toBe(4)
      expect(v!.deterministic).toBe(true)
      // 期望行为与源逐字一致（语义保持底线）
      expect(v!.tasks[0].expectedBehavior).toBe('修复完成')
    }
    // 确定性：同 kind 两次生成逐字相同
    const a = buildCounterfactualVariant(setId, 'rename_ids')!
    const b = buildCounterfactualVariant(setId, 'rename_ids')!
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // id 全部改名（防 harness 记忆任务名）
    expect(a.tasks.map((t) => t.id)).not.toContain('t1')
  })

  it('rename_files 改写路径词且无路径词时原样保留；wrap_output 追加包装要求；inject_noise 尾插干扰行', () => {
    const setId = seedSet()
    const files = buildCounterfactualVariant(setId, 'rename_files')!
    expect(files.tasks[0].problem).toContain('sources_/main.py')
    expect(files.tasks[0].problem).toContain('artifact')
    const wrap = buildCounterfactualVariant(setId, 'wrap_output')!
    expect(wrap.tasks[0].problem).toContain('<result>')
    const noise = buildCounterfactualVariant(setId, 'inject_noise')!
    expect(noise.tasks[0].problem).toContain('（注：')
  })

  it('源集不存在 → null（不猜）', () => {
    expect(buildCounterfactualVariant('no-such-set', 'rename_ids')).toBeNull()
  })
})
