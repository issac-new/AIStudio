// custom/__tests__/l2-kit-parity.test.ts
// 守门：L2 提交强拦「可复现副本」与判定库单一事实源（2026-10-30 HelixHarness 吸收轮）。
// 背景：`.claude/skills/aistudio-dev/` 是生成物且 0 文件入库（.gitignore:33），钩子垫片
// 在找不到判定库时打印「L2 降级跳过」放行——fresh clone 的四层强制面退化为 L1/L3。
// 修法：生成器把 spec-first-lib.sh 与 spec-first-pre-commit.sh 渲染到已入库路径
// .swarm-yuan/hooks/（垫片第四级回退早就指向该处，此前从未落盘）。
// 本测试锁三件事：
//  ① 入库副本 = assets 原文（字节级），防止手工改副本制造第二事实源；
//  ② 生成器两种模式都会渲染（create 走 _fg_install_precommit，upgrade 只有 _fg_render_l2_kit）；
//  ③ 四段基线只许减：基线内条目必须仍然不达标（达标即须删除），且相对 main 不得新增。
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const ROOT = resolve(__dirname, '../..')
const KIT_LIB = resolve(ROOT, '.swarm-yuan/hooks/spec-first-lib.sh')
const KIT_PC = resolve(ROOT, '.swarm-yuan/hooks/spec-first-pre-commit.sh')
const KIT_CONF = resolve(ROOT, '.swarm-yuan/hooks/precheck.conf')
const ASSET_LIB = resolve(ROOT, 'skills/swarm-yuan/assets/spec-first-lib.sh')
const ASSET_PC = resolve(ROOT, 'skills/swarm-yuan/assets/hooks/spec-first-pre-commit.sh')
const GEN = readFileSync(resolve(ROOT, 'skills/swarm-yuan/scripts/generate-skill.sh'), 'utf8')
const BASELINE = resolve(ROOT, '.swarm-yuan/spec-sections-baseline.txt')

function baselineEntries(): string[] {
  if (!existsSync(BASELINE)) return []
  return readFileSync(BASELINE, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
}

/** 单次 bash 调用里批量跑 spf_sections_check，返回仍不达标（=应留在基线）的条目。 */
function sectionsViolating(files: string[]): string[] {
  if (files.length === 0) return []
  const script = `
set -uo pipefail
lib="$1"; shift
. "$lib"
for f in "$@"; do
  v=$(spf_sections_check < "$f")
  [ -n "$v" ] && printf '%s\\n' "$f"
done
`
  const out = execFileSync('bash', ['-c', script, 'bash', KIT_LIB, ...files], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
  return out.split('\n').filter(Boolean)
}

describe('L2 可复现副本（模板↔产物字节一致）', () => {
  it('判定库副本与生成器资产逐字节一致', () => {
    expect(readFileSync(KIT_LIB)).toEqual(readFileSync(ASSET_LIB))
  })

  it('提交钩子副本与生成器资产逐字节一致', () => {
    expect(readFileSync(KIT_PC)).toEqual(readFileSync(ASSET_PC))
  })

  it('生成器提供 _fg_render_l2_kit 且在非 lite 段调用（create/upgrade 都覆盖）', () => {
    expect(GEN).toContain('_fg_render_l2_kit()')
    // 调用点必须落在 _fg_emit_guides 的非 lite 分支里；upgrade 模式在 _fg_emit_guides 之后才 publish，
    // 因此这里能同时覆盖 create 与 upgrade（_fg_install_precommit 只在 create 生效）。
    const guides = GEN.slice(GEN.indexOf('_fg_emit_guides() {'), GEN.indexOf('_fg_emit_guides\n'))
    expect(guides).toContain('_fg_render_l2_kit')
    expect(guides).toContain('[[ "$PROFILE" != "lite" ]]')
  })

  it('钩子垫片的第四级回退路径与入库副本文件名一致', () => {
    const shim = readFileSync(resolve(ROOT, '.swarm-yuan/hooks/pre-commit'), 'utf8')
    expect(shim).toContain('"$ROOT/.swarm-yuan/hooks/spec-first-pre-commit.sh"')
    // 垫片五级/四级候选必须与生成器模板同构（2026-10-30 对账：入库垫片曾停留在写死
    // aistudio-dev 的旧版，生成器模板早已改成通配候选 + .agents 兜底——模板↔产物漂移）。
    expect(shim).toContain('"$ROOT"/.agents/skills/*/scripts/spec-first-pre-commit.sh')
    expect(shim).toContain('"$ROOT"/.claude/skills/*/scripts/spec-first-pre-commit.sh')
    expect(GEN).toContain('"\\$ROOT"/.agents/skills/*/scripts/spec-first-pre-commit.sh')
    const pc = readFileSync(KIT_PC, 'utf8')
    // 钩子自身按同目录定位判定库与 conf——副本必须同目录成套
    expect(pc).toContain('"${_self}/spec-first-lib.sh"')
    expect(pc).toContain('"${_self}/precheck.conf"')
  })

  it('最小判定面 conf 与目标技能 conf 的共享键取值一致（两者并存时）', () => {
    const kit = readFileSync(KIT_CONF, 'utf8')
    const skillConf = resolve(ROOT, '.claude/skills/aistudio-dev/scripts/precheck.conf')
    if (!existsSync(skillConf)) return // fresh clone 只有入库副本，跳过对账
    const real = readFileSync(skillConf, 'utf8')
    const pick = (text: string, key: string) => {
      const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'))
      return m ? m[1].replace(/\s*#.*$/, '').trim() : null
    }
    for (const key of ['BASE_BRANCH', 'WRITABLE_DIRS', 'SPEC_REQUIRED', 'SPEC_GLOB', 'DESIGN_SYNC_REQUIRED', 'DESIGN_DOCS']) {
      expect(pick(kit, key), `共享键 ${key} 在两份 conf 间漂移`).toBe(pick(real, key))
    }
  })
})

describe('spec 四段基线棘轮（只许减）', () => {
  const entries = baselineEntries()

  it('基线内条目必须仍然不达标（达标后须删条目，禁永久豁免墙）', () => {
    const existing = entries.filter((p) => existsSync(resolve(ROOT, p)))
    const stillViolating = new Set(sectionsViolating(existing))
    const nowCompliant = existing.filter((p) => !stillViolating.has(p))
    expect(nowCompliant, `以下 spec 已四段齐全，须从 .swarm-yuan/spec-sections-baseline.txt 删除：\n${nowCompliant.join('\n')}`).toEqual([])
  })

  it('相对 main 不得新增基线条目', () => {
    let mainBaseline: string[] = []
    try {
      const raw = execFileSync('git', ['show', 'main:.swarm-yuan/spec-sections-baseline.txt'], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      mainBaseline = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    } catch {
      return // main 尚无基线（本批首次建立）——棘轮自下批起生效
    }
    const added = entries.filter((p) => !mainBaseline.includes(p))
    expect(added, `相对 main 新增了豁免条目（棘轮只许减）：\n${added.join('\n')}`).toEqual([])
  })

  it('基线条目不得指向不存在的 spec', () => {
    const missing = entries.filter((p) => !existsSync(resolve(ROOT, p)))
    expect(missing, `基线里有过期路径（spec 已删/改名，须同步清理）：\n${missing.join('\n')}`).toEqual([])
  })
})

describe('spec 内容收据（漂移检测语义）', () => {
  it('首次绑定→重复不变→改正文漂移→显式重绑→空白改动不漂移', () => {
    const dir = mkdtempSync(join(tmpdir(), 'l2-receipt-'))
    try {
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
      execFileSync('git', ['config', 'user.email', 't@t.invalid'], { cwd: dir })
      execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
      mkdirSync(join(dir, 'docs/specs'), { recursive: true })
      writeFileSync(join(dir, 'docs/specs/a.md'), '# A\n\n## 变更\n改点\n')
      writeFileSync(join(dir, 'conf'), 'BASE_BRANCH="main"\n')
      execFileSync('git', ['add', '-A'], { cwd: dir })
      execFileSync('git', ['commit', '-qm', 'init'], { cwd: dir })
      execFileSync('git', ['checkout', '-q', '-b', 'feat'], { cwd: dir })

      const check = (prefix = '') =>
        execFileSync(
          'bash',
          ['-c', `${prefix}${prefix ? '; ' : ''}. "${KIT_LIB}"; spf_receipt_check "$PWD" docs/specs/a.md worktree conf`],
          { cwd: dir, encoding: 'utf8' },
        ).trim()

      expect(check()).toBe('bound')          // 已合入 main 且无收据 → 首绑，不判漂移
      expect(check()).toBe('')               // 收据一致 → 通过
      writeFileSync(join(dir, 'docs/specs/a.md'), '# A\n\n## 变更\n改点改了\n')
      expect(check()).toMatch(/^drift:/)     // 已合入内容被改写 → 漂移
      expect(check('SPEC_REBIND=1')).toBe('bound') // 显式重绑留痕      expect(check()).toBe('')               // 重绑后一致
      writeFileSync(join(dir, 'docs/specs/a.md'), '# A\n\n## 变更\n改点改了   \n\n\n')
      expect(check()).toBe('')               // 行尾空白/尾部空行属噪声，不算漂移
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
