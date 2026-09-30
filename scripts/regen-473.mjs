// 473 重生成：0.7.26 基线 locale × stash 注入态 locale 深合并 → 写入 ISO 树
// 语义：overlay 词条（叶子）覆盖，0.7.26 新增词条（base 独有）保留——rebaseline 本义
import { build } from 'esbuild'
import { mkdirSync, writeFileSync, readFileSync } from 'fs'
import { resolve } from 'path'

const ISO = '/Volumes/nvme2230/lab/.wxwork/upstream-iso-20261001/hermes-studio'
const STASH = '/tmp/473-regen'
const TMP = '/tmp/473-regen-bundle'
mkdirSync(TMP, { recursive: true })

async function loadLocale(file, tag) {
  const out = resolve(TMP, `${tag}.mjs`)
  await build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
  const mod = await import(`file://${out}`)
  return mod.default
}

function deepMerge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over ?? base
  if (typeof base === 'object' && base !== null && typeof over === 'object' && over !== null) {
    // 键序=overlay 主序（与老 473 结果态一致，后续 locale 补丁 hunk 上下文可匹配），
    // base 独有键（0.7.26 新增词条/域）按原序追加在后
    const out = {}
    for (const k of Object.keys(over)) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k]
    for (const k of Object.keys(base)) if (!(k in out)) out[k] = base[k]
    return out
  }
  return over !== undefined ? over : base
}

// 单引号风格序列化：无单引号/无转义的字符串用 '，其余保留 "
function q(s) {
  if (!/['\\\n]/.test(s)) return `'${s}'`
  return JSON.stringify(s)
}
function ser(v, indent) {
  if (typeof v === 'string') return q(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return '[' + v.map(x => ser(x, indent + '  ')).join(', ') + ']'
  if (v === null) return 'null'
  const pad = indent + '  '
  const body = Object.entries(v).map(([k, val]) => `${pad}${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${ser(val, pad)}`).join(',\n')
  return `{\n${body}\n${indent}}`
}

for (const lang of ['en', 'zh']) {
  const base = await loadLocale(resolve(ISO, `packages/client/src/i18n/locales/${lang}.ts`), `${lang}-base`)
  const over = await loadLocale(resolve(ISO, `packages/client/src/i18n/locales/__${lang}-overlay.ts`), `${lang}-over`)
  const merged = deepMerge(base, over)
  const head = `import { socialMessages${lang === 'en' ? 'En' : 'Zh'} } from '../social-messages'\n\nexport default `
  const out = head + ser(merged, '') + '\n'
  writeFileSync(resolve(STASH, `${lang}-merged.ts`), out)
  writeFileSync(resolve(STASH, `${lang}-merged.obj.json`), JSON.stringify({ baseKeys: Object.keys(base).length, overKeys: Object.keys(over).length, mergedKeys: Object.keys(merged).length }))
  console.log(lang, JSON.parse(readFileSync(resolve(STASH, `${lang}-merged.obj.json`), 'utf8')), 'lines:', out.split('\n').length)
}
