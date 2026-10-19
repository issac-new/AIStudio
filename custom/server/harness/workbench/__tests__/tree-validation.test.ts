// 多文件候选的树校验（源文 tree.validate 的本仓映射）。
import { describe, it, expect } from 'vitest'
import { treeDigest, validateTree, variantContent, diffSummaryTree } from '../loop'
import type { Variant } from '../types'

const GOOD_SOUL = '你是工程师。When 处理代码审查, load the `code_review` skill.'
const GOOD_SKILL = '---\nname: code_review\ndescription: 代码审查流程\n---\n# code_review\n'

function treeOf(entries: Record<string, string>): Record<string, string> {
  return entries
}

describe('validateTree', () => {
  it('合规树通过并给 census', () => {
    const tree = treeOf({
      'profiles/p1/SOUL.md': GOOD_SOUL,
      'skills/code_review/SKILL.md': GOOD_SKILL,
      'scripts/helper.py': 'def helper():\n  return 1\n',
    })
    const res = validateTree(tree)
    expect(res.ok).toBe(true)
    expect(res.census.skills).toBe(1)
    expect(res.census.scripts).toBe(1)
  })

  it('技能缺 description 被拒', () => {
    const tree = treeOf({
      'profiles/p1/SOUL.md': GOOD_SOUL,
      'skills/code_review/SKILL.md': '---\nname: code_review\n---\n',
    })
    const res = validateTree(tree)
    expect(res.ok).toBe(false)
    expect(res.issues.map((i) => i.code)).toContain('skill_missing_description')
  })

  it('技能 name 与目录不一致被拒', () => {
    const tree = treeOf({
      'profiles/p1/SOUL.md': GOOD_SOUL,
      'skills/code_review/SKILL.md': '---\nname: other\ndescription: x\n---\n',
    })
    const res = validateTree(tree)
    expect(res.ok).toBe(false)
    expect(res.issues.map((i) => i.code)).toContain('skill_name_mismatch')
  })

  it('技能未在常驻文本触发 = 死技能', () => {
    const tree = treeOf({
      'profiles/p1/SOUL.md': '你是工程师，只写代码。',
      'skills/code_review/SKILL.md': GOOD_SKILL,
    })
    const res = validateTree(tree)
    expect(res.ok).toBe(false)
    expect(res.issues.map((i) => i.code)).toContain('skill_untriggered')
  })

  it('常驻文本超 24k 被拒', () => {
    const tree = treeOf({
      'profiles/p1/SOUL.md': 'x'.repeat(24_001) + 'code_review',
      'skills/code_review/SKILL.md': GOOD_SKILL,
    })
    const res = validateTree(tree)
    expect(res.ok).toBe(false)
    expect(res.issues.map((i) => i.code)).toContain('always_on_over_cap')
  })

  it('脚本引用缺失被拒；存在的引用通过', () => {
    const bad = treeOf({
      'profiles/p1/SOUL.md': '运行 python scripts/missing.py\ncode_review',
      'skills/code_review/SKILL.md': GOOD_SKILL,
    })
    expect(validateTree(bad).issues.map((i) => i.code)).toContain('script_ref_missing')
    const good = treeOf({
      'profiles/p1/SOUL.md': '运行 python scripts/helper.py\ncode_review',
      'skills/code_review/SKILL.md': GOOD_SKILL,
      'scripts/helper.py': 'def helper():\n  return 1\n',
    })
    expect(validateTree(good).ok).toBe(true)
  })

  it('hooks.json schema：非法 JSON / 未知事件 / 非 command 全列出', () => {
    const badJson = treeOf({ '.codex/hooks.json': 'not json' })
    expect(validateTree(badJson).issues.map((i) => i.code)).toContain('hooks_invalid_json')
    const unknown = treeOf({ '.codex/hooks.json': JSON.stringify({ hooks: { BadEvent: [] } }) })
    expect(validateTree(unknown).issues.map((i) => i.code)).toContain('hooks_unknown_event')
    const badType = treeOf({ '.codex/hooks.json': JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'prompt', command: 'x' }] }] } }) })
    expect(validateTree(badType).issues.map((i) => i.code)).toContain('hooks_schema')
    const good = treeOf({ '.codex/hooks.json': JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'python scripts/check.py' }] }] } }) })
    expect(validateTree(good).ok).toBe(true)
  })

  it('子智能体缺 description 被拒；allowSubagents=false 时整体拒', () => {
    const tree = treeOf({ 'sub_agents/research/AGENT.md': '---\n---\n' })
    expect(validateTree(tree).issues.map((i) => i.code)).toContain('subagent_missing_description')
    expect(validateTree(tree, { allowSubagents: false }).issues.map((i) => i.code)).toContain('subagents_not_allowed')
  })
})

describe('多文件候选工具', () => {
  it('treeDigest 稳定且随内容/删除变化', () => {
    const f1 = [{ path: 'a.md', digest: 'd1' }]
    expect(treeDigest(f1, [])).toBe(treeDigest(f1, []))
    expect(treeDigest(f1, [])).not.toBe(treeDigest([{ path: 'a.md', digest: 'd2' }], []))
    expect(treeDigest(f1, [])).not.toBe(treeDigest(f1, ['old.md']))
  })

  it('variantContent：files 拼接优先于 content', () => {
    const v: Variant = {
      id: 'v1', label: 'x', content: 'single', digest: 'd',
      diffSummary: { added: 0, removed: 0, unchanged: 0 },
      files: [{ path: 'a.md', content: 'A', digest: 'dA' }, { path: 'b.md', content: 'B', digest: 'dB' }],
    }
    expect(variantContent(v)).toBe('A\n\nB')
    expect(variantContent({ ...v, files: undefined })).toBe('single')
  })

  it('diffSummaryTree：deletions 计入增删', () => {
    const d = diffSummaryTree(
      [{ path: 'a', content: 'l1\nl2' }],
      [{ path: 'a', content: 'l1\nl2\nl3' }],
      ['old.md'],
    )
    expect(d.added).toBe(2)
    expect(d.removed).toBe(1)
  })
})
