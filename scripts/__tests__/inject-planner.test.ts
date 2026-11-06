// Task 3 守门：注入 Planner 纯函数契约（P1 注入核心）。
// 负例先行：buildPlan 对缺失补丁文件必须抛错（不猜、不跳过）；
// 计划项必须携带 channel/target/sha256/seriesIndex/addedFiles 且路由与
// inject.mjs 前缀规则一致（hermes-agent 前缀 → hermes-agent 树）。
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let tmp: string
let patchDir: string
let zcodePatchDir: string

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'planner-t-'))
  patchDir = join(tmp, 'patches')
  zcodePatchDir = join(tmp, 'zcode-patches')
  mkdirSync(patchDir, { recursive: true })
  mkdirSync(zcodePatchDir, { recursive: true })
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

// ---- 测试补丁构造 ----------------------------------------------------------

/** 修改 hermes-studio 目标文件的最小补丁。 */
const studioPatch = (file: string, marker: string) =>
  `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-old\n+${marker}\n`

/** 新增文件补丁（clean 时须按 addedFiles 删除的那类）。 */
const newFilePatch = (file: string) =>
  `diff --git a/${file} b/${file}\nnew file mode 100644\nindex 0000000..3333333\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1 @@\n+added\n`

/** 无 ---/+++ 头、仅 diff --git 行的手写补丁（路由回退分支）。 */
const headerlessPatch = (file: string) =>
  `diff --git a/${file} b/${file}\nindex 1111111..2222222 100644\n@@ -1 +1 @@\n-old\n+new\n`

function writePatches() {
  writeFileSync(join(patchDir, 'a-studio.patch'), studioPatch('packages/server/src/x.ts', 'A'))
  writeFileSync(join(patchDir, 'b-agent.patch'), newFilePatch('agent/new_agent_tool.py'))
  writeFileSync(join(patchDir, 'c-studio-new.patch'), newFilePatch('packages/server/src/new.ts'))
  writeFileSync(join(patchDir, 'd-headerless.patch'), headerlessPatch('packages/server/src/y.ts'))
  writeFileSync(join(zcodePatchDir, 'z1.patch'), newFilePatch('src/vs/new-file.ts'))
}

describe('inject planner：parseSeriesText', () => {
  it('剥注释与空行、保序', async () => {
    const { parseSeriesText } = await import('../platform/inject/planner.mjs')
    expect(parseSeriesText('# comment\n\n001-a.patch\n  002-b.patch \n# tail\n'))
      .toEqual(['001-a.patch', '002-b.patch'])
  })
})

describe('inject planner：buildPlan', () => {
  beforeAll(writePatches)

  it('有序计划：hermes 先于 zcode，逐项含 channel/target/name/sha256/seriesIndex/addedFiles', async () => {
    const { buildPlan } = await import('../platform/inject/planner.mjs')
    const plan = buildPlan(
      'a-studio.patch\nb-agent.patch\nc-studio-new.patch\nd-headerless.patch\n',
      'z1.patch\n',
      patchDir,
    )
    expect(plan.map((p: any) => p.name)).toEqual([
      'a-studio.patch', 'b-agent.patch', 'c-studio-new.patch', 'd-headerless.patch', 'z1.patch',
    ])
    // 路由：studio 目标 / agent 前缀 / zcode 通道 / 无头补丁回退 studio
    const byName = Object.fromEntries(plan.map((p: any) => [p.name, p]))
    expect(byName['a-studio.patch'].channel).toBe('hermes')
    expect(byName['a-studio.patch'].target).toBe('hermes-studio')
    expect(byName['b-agent.patch'].target).toBe('hermes-agent')
    expect(byName['d-headerless.patch'].target).toBe('hermes-studio')
    expect(byName['z1.patch'].channel).toBe('zcode')
    expect(byName['z1.patch'].target).toBe('zcode')
    // seriesIndex：通道内序号（非全局）
    expect(byName['a-studio.patch'].seriesIndex).toBe(0)
    expect(byName['d-headerless.patch'].seriesIndex).toBe(3)
    expect(byName['z1.patch'].seriesIndex).toBe(0)
    // sha256 = 补丁文件字节摘要
    const { createHash } = await import('node:crypto')
    const { readFileSync } = await import('node:fs')
    const expectSha = (f: string) =>
      createHash('sha256').update(readFileSync(f)).digest('hex')
    expect(byName['a-studio.patch'].sha256).toBe(expectSha(join(patchDir, 'a-studio.patch')))
    expect(byName['z1.patch'].sha256).toBe(expectSha(join(zcodePatchDir, 'z1.patch')))
    // addedFiles：仅新增文件补丁有值
    expect(byName['a-studio.patch'].addedFiles).toEqual([])
    expect(byName['b-agent.patch'].addedFiles).toEqual(['agent/new_agent_tool.py'])
    expect(byName['c-studio-new.patch'].addedFiles).toEqual(['packages/server/src/new.ts'])
    expect(byName['z1.patch'].addedFiles).toEqual(['src/vs/new-file.ts'])
  })

  it('空 series/空 zcode series 产出空计划', async () => {
    const { buildPlan } = await import('../platform/inject/planner.mjs')
    expect(buildPlan('', '', patchDir)).toEqual([])
    expect(buildPlan('a-studio.patch\n', '', patchDir)).toHaveLength(1)
  })

  it('负例：series 登记但补丁文件缺失 → 抛错点名（不静默跳过）', async () => {
    const { buildPlan } = await import('../platform/inject/planner.mjs')
    expect(() => buildPlan('ghost.patch\n', '', patchDir))
      .toThrow(/ghost\.patch/)
  })

  it('负例：zcode series 登记但补丁缺失 → 抛错点名', async () => {
    const { buildPlan } = await import('../platform/inject/planner.mjs')
    expect(() => buildPlan('', 'ghost-z.patch\n', patchDir))
      .toThrow(/ghost-z\.patch/)
  })

  it('patchDir 支持显式双目录对象（hermes/zcode 分离）', async () => {
    const { buildPlan } = await import('../platform/inject/planner.mjs')
    const plan = buildPlan('a-studio.patch\n', 'z1.patch\n', { hermes: patchDir, zcode: zcodePatchDir })
    expect(plan.map((p: any) => p.name)).toEqual(['a-studio.patch', 'z1.patch'])
  })
})

describe('inject planner：路由与 inject.mjs 前缀单一事实源一致', () => {
  it('agent 前缀路由 hermes-agent、其余落 hermes-studio', async () => {
    const { routePatchTarget } = await import('../platform/inject/planner.mjs')
    expect(routePatchTarget(studioPatch('packages/server/src/a.ts', 'X'))).toBe('hermes-studio')
    for (const p of ['hermes_cli/x.py', 'plugins/y.yaml', 'agent/z.py', 'tools/t.py', 'model_tools.py']) {
      expect(routePatchTarget(newFilePatch(p))).toBe('hermes-agent')
    }
  })
})
