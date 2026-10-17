// overlay/custom/client/__tests__/raw-hex-budget.test.ts
// 守门：custom/client 各域 raw hex 预算闸（ratchet）+ 幽灵变量 fallback 断言。
// 动机（前端一致性重构批 A8，spec 2026-10-17-frontend-ux-consolidation-redesign）：
// governance 整模块 Tailwind 色板亮色假设曾致暗色主题破相；本闸按目录锁上限，
// 只降不升——新增裸 hex 即红，改法=用 token（var(--error)/--ia-* 等）或入
// 预算表并注明理由。token 定义行（`--x: #hex`）与 var() fallback 内部不计数：
// 前者是 token 正本，后者按 D-5 保留（--ia-* 等可能在其 scss 未装载的上下文渲染）。
// 幽灵变量断言：var(--x, #fb) 的 x 必须真实有定义——曾经 var(--warning-ink, #92400e)
// 类幽灵 fallback 恒走 fallback 值，是变相裸 hex 与第二套状态色的温床。
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { join, resolve } from 'path'

const CLIENT_ROOT = resolve(__dirname, '..')
const NCWK_ROOT = resolve(__dirname, '../../../..')
const UPSTREAM_VARS = [
  join(NCWK_ROOT, 'upstream/hermes-studio/packages/client/src/styles/variables.scss'),
]

/** 批 A 后基线（2026-10-17 实测）。批 C 逐目录压降；压到 0 的目录永不再放开。 */
const BUDGET: Record<string, number> = {
  governance: 0,
  ia2: 247,
  ide: 101,
  cockpit: 95,
  kanban: 61,
  'matrix-teams': 32,
  bpa: 24,
  ontology: 23,
  loop: 12,
  'matrix-chat': 7,
  eval: 3,
}

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g
const TOKEN_DEF = /--[\w-]+\s*:\s*#/
const VARFB = /var\((--[\w-]+)\s*,[^)]*\)/g

function listFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__' || e.name === 'node_modules') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) listFiles(p, out)
    else if (/\.(vue|scss|css)$/.test(e.name)) out.push(p)
  }
  return out
}

function collect(clientRel: string): { bare: number; fallbacks: number; phantomVars: Set<string>; files: string[] } {
  const files = listFiles(clientRel)
  let bare = 0
  let fallbacks = 0
  const phantomVars = new Set<string>()
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(VARFB)) {
      fallbacks += 1
      phantomVars.add(m[1])
    }
    const cleaned = src.replace(VARFB, 'var()')
    const kept = cleaned
      .split('\n')
      .filter((l) => !TOKEN_DEF.test(l))
      .join('\n')
    const n = kept.match(HEX)
    if (n) bare += n.length
  }
  return { bare, fallbacks, phantomVars, files }
}

function definedVarSet(): Set<string> {
  const defined = new Set<string>()
  const harvest = (src: string) => {
    for (const m of src.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1])
  }
  for (const p of UPSTREAM_VARS) if (existsSync(p)) harvest(readFileSync(p, 'utf8'))
  for (const f of listFiles(CLIENT_ROOT)) harvest(readFileSync(f, 'utf8'))
  return defined
}

describe('raw hex 预算闸（ratchet：只降不升）', () => {
  it('各域裸 hex 数 ≤ 预算表（BUDGET 即当前基线；降了就改小，禁改大）', () => {
    const violations: string[] = []
    for (const [dir, budget] of Object.entries(BUDGET)) {
      const rel = join(CLIENT_ROOT, dir)
      if (!existsSync(rel)) continue
      const { bare } = collect(rel)
      if (bare > budget) violations.push(`${dir}: ${bare} > 预算 ${budget}`)
    }
    expect(violations.join('\n')).toBe('')
  })

  it('var() fallback 引用的变量必须真实有定义（幽灵变量=变相裸 hex）', () => {
    const defined = definedVarSet()
    const { phantomVars } = collect(CLIENT_ROOT)
    // 运行时注入变量（静态扫描看不见定义，但真实存在）：
    // --cluster-color: RunTraceGraph 经 :style 逐节点注入（RunTraceGraph.vue:131）
    // --vh: JS 视口高度变量（视口单位兜底惯例）
    const RUNTIME_PROVIDED = new Set(['--cluster-color', '--vh'])
    const phantoms = [...phantomVars].filter((v) => !defined.has(v) && !RUNTIME_PROVIDED.has(v))
    expect(phantomVars.size).toBeGreaterThan(50) // 防扫描空转假绿
    expect(phantoms, `以下变量带 fallback 但全仓无定义：\n${phantoms.join('\n')}`).toEqual([])
  })
})
