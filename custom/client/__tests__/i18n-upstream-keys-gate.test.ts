// overlay/custom/client/__tests__/i18n-upstream-keys-gate.test.ts
// i18n 上游词条保全守门（2026-10-03 全功能回归）：patches/ 系列对 locales/*.ts 的
// 改动不得「永久丢弃」纯净上游已有的词条键。473 rebaseline 锚 0.7.26 基线把
// 0.7.27 的 changelog/usage 词条当旧键删除，更新日志弹层裸键上屏——本守门
// 按「pristine ⊆ pristine - 系列删除 + 系列新增」逐键对账，改键必须显式双端。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

const OVERLAY_ROOT = resolve(__dirname, '../../..')
const PATCH_DIR = resolve(OVERLAY_ROOT, 'patches')
const UPSTREAM = resolve(OVERLAY_ROOT, '../upstream/hermes-studio')

const KEY_RE = /^\s*([A-Za-z0-9_$]+)\s*:/

function keysOf(source: string): Set<string> {
  const out = new Set<string>()
  for (const line of source.split('\n')) {
    const m = line.match(KEY_RE)
    if (m) out.add(m[1])
  }
  return out
}

function pristineLocale(lang: string): string {
  return execSync(`git show HEAD:packages/client/src/i18n/locales/${lang}.ts`, {
    cwd: UPSTREAM,
    encoding: 'utf8',
  })
}

/** 系列内所有触及该 locale 文件的补丁：删除/新增键集合（按 series 顺序累计） */
function seriesKeyDelta(lang: string): { deleted: Set<string>; added: Set<string> } {
  const deleted = new Set<string>()
  const added = new Set<string>()
  const target = `packages/client/src/i18n/locales/${lang}.ts`
  const series = readFileSync(resolve(PATCH_DIR, 'series'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  for (const name of series) {
    const patchPath = resolve(PATCH_DIR, name)
    if (!existsSync(patchPath)) continue
    const patch = readFileSync(patchPath, 'utf8')
    if (!patch.includes(target)) continue
    // 只看该文件的 diff 段（--- a/<target> 到下一个 --- a/ 或文件尾）
    const start = patch.indexOf(`--- a/${target}`)
    if (start < 0) continue
    const nextDiff = patch.indexOf('\n--- a/', start + 6)
    const section = patch.slice(start, nextDiff < 0 ? undefined : nextDiff)
    for (const line of section.split('\n')) {
      const del = line.match(/^-\s*([A-Za-z0-9_$]+)\s*:/)
      if (del) deleted.add(del[1])
      const add = line.match(/^\+\s*([A-Za-z0-9_$]+)\s*:/)
      if (add) added.add(add[1])
    }
  }
  return { deleted, added }
}

const upstreamAvailable = existsSync(resolve(UPSTREAM, '.git'))

describe.skipIf(!upstreamAvailable)('i18n 上游词条保全（系列补丁不得永久丢弃上游键）', () => {
  for (const lang of ['zh', 'en']) {
    it(`${lang}.ts：纯净上游词条全部仍可达（删则须在系列内回填）`, () => {
      const pristine = keysOf(pristineLocale(lang))
      const { deleted, added } = seriesKeyDelta(lang)
      const effective = new Set<string>([...pristine].filter((k) => !deleted.has(k)))
      for (const k of added) effective.add(k)
      const dropped = [...pristine].filter((k) => !effective.has(k)).sort()
      expect(dropped, `以下上游词条键被系列补丁永久丢弃：${dropped.join(', ')}`).toEqual([])
    })
  }

  it('0.7.27 changelog 词条必须在系列内回填（550 回归实锤缺陷的定点守门）', () => {
    const { deleted, added } = seriesKeyDelta('zh')
    for (let i = 1; i <= 8; i++) {
      const key = `new_0_7_27_${i}`
      if (deleted.has(key)) expect(added.has(key), `${key} 被删但未回填`).toBe(true)
    }
  })
})
