// 补丁 736/737 落地契约（2026-11-04 AgentTeams 吸收批四）：技能 ZIP 导出 +
// 导入三道限 + 统一 registry URI。本测试是**标记断言**——只读补丁文本证明
// 机制写在补丁里（路由序/常量/403 分支/按钮门槛/接线点），真值在补丁可重放
// 性：由收口方在干净树 reset→inject 重放并 cmp 快照核验（本 worktree 禁跑
// inject，无法在此复放）。套路同 kanban-patch-409-guard 的源层守门，差异是
// 那边读注入态 vendor、这边读 patches/ 文本（新补丁未入 series 前 vendor 未注入）。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PATCH_736 = resolve(__dirname, '../../patches/737-server-skill-export-limits.patch')
const PATCH_737 = resolve(__dirname, '../../patches/738-agent-skill-hub-uri.patch')

/** 按 `diff --git` 分段取指定文件的 hunk 文本（含段头行） */
function fileHunk(patchText: string, pathFragment: string): string {
  const sections = patchText.split(/^diff --git /m)
  const hit = sections.find(s => s.includes(pathFragment))
  return hit ?? ''
}

describe('补丁 736：技能 ZIP 导出 + 导入三道限（标记断言）', () => {
  const text = existsSync(PATCH_736) ? readFileSync(PATCH_736, 'utf8') : ''

  it('补丁文件存在且触及服务端路由/控制器', () => {
    expect(existsSync(PATCH_736), 'patches/737-server-skill-export-limits.patch 在').toBe(true)
    expect(text).toContain('a/packages/server/src/modules/hermes/routes/skills.ts')
    expect(text).toContain('a/packages/server/src/modules/hermes/controllers/skills.ts')
  })

  it('export 路由注册行在 {*path} 通配行之前（Koa Router 按注册序匹配）', () => {
    const exportLine = text.indexOf("skillRoutes.get('/api/hermes/skills/:category/:skill/export'")
    const wildcardLine = text.indexOf("skillRoutes.get('/api/hermes/skills/{*path}'")
    expect(exportLine).toBeGreaterThan(-1)
    expect(wildcardLine).toBeGreaterThan(-1)
    // 行号比较：export 行必须先于通配行出现
    expect(exportLine, 'export 路由行号 < 通配行行号').toBeLessThan(wildcardLine)
  })

  it('导入三道限常量齐备（单 entry/解压总量/entry 数）', () => {
    const ctrl = fileHunk(text, 'hermes/controllers/skills.ts')
    expect(ctrl).toContain('MAX_SKILL_ENTRY_SIZE')
    expect(ctrl).toContain('MAX_SKILL_UNCOMPRESSED')
    expect(ctrl).toContain('MAX_SKILL_ENTRIES')
    // 三道闸各自消费对应常量（不是只声明常量），并各自回 413
    expect(ctrl).toContain('if (zipEntries.length > MAX_SKILL_ENTRIES)')
    expect(ctrl).toContain('if (entry.header.size > MAX_SKILL_ENTRY_SIZE)')
    expect(ctrl).toContain('if (totalUncompressed > MAX_SKILL_UNCOMPRESSED)')
    const inflates = ctrl.match(/^\+.*ctx\.status = 413/gm) ?? []
    expect(inflates.length).toBeGreaterThanOrEqual(4) // 三道限 + 导出 200MB 上限
  })

  it('external 只读挂载导出 403 分支存在', () => {
    const ctrl = fileHunk(text, 'hermes/controllers/skills.ts')
    expect(ctrl).toContain('exportSkill')
    expect(ctrl).toMatch(/isPathWithin\(skillDir, skillsDir\)/)
    expect(ctrl).toMatch(/ctx\.status = 403/)
    expect(ctrl).toContain('External skills (read-only mounted directories) cannot be exported')
  })

  it('客户端导出按钮门槛含 local/hub/builtin 三源（external 隐藏）', () => {
    const detail = fileHunk(text, 'components/hermes/skills/SkillDetail.vue')
    expect(detail).toContain('skills.exportZip')
    expect(detail).toMatch(/props\.source === 'builtin' \|\| props\.source === 'hub' \|\| props\.source === 'local'/)
    expect(detail).toContain('exportSkillZip')
    // 带鉴权下载：fetch→blob→a.download 三件套
    expect(detail).toContain('URL.createObjectURL(blob)')
    expect(detail).toContain('link.download')
  })
})

describe('补丁 737：统一 registry URI 解析器（标记断言）', () => {
  const text = existsSync(PATCH_737) ? readFileSync(PATCH_737, 'utf8') : ''

  it('补丁文件存在且含解析器新模块与表驱动测试', () => {
    expect(existsSync(PATCH_737), 'patches/738-agent-skill-hub-uri.patch 在').toBe(true)
    expect(text).toContain('a/tools/skills_hub_uri.py')
    expect(text).toContain('a/tests/tools/test_skills_hub_uri.py')
  })

  it('skills_hub.py hunk 含 parse_skill_uri 调用（分发链入口短路）', () => {
    const hub = fileHunk(text, 'hermes_cli/skills_hub.py')
    expect(hub).toContain('def _resolve_source_meta_and_bundle')
    expect(hub).toContain('parsed = parse_skill_uri(identifier)')
    expect(hub).toMatch(/pinned = \[src for src in sources if src\.source_id\(\) == parsed\[0\]\]/)
    // _registry_from_identifier 也改走解析器
    expect(hub).toContain('def _registry_from_identifier')
  })
})
