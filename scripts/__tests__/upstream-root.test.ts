// @vitest-environment node
// Task 6 负例：统一上游根解析（env 显式 > 仓内 vendor > 旧兄弟 upstream，realpath 规范化）。
// 先在缺失实现的状态下咬红，再以 scripts/platform/lib/upstream-root.mjs 收敛四入口内联副本。
// serve-server 用临时「干净检出」副本做真子进程验证（resolution + ensure 前置 partial 不起服）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(import.meta.dirname, '..', '..')
const libRel = 'scripts/platform/lib/upstream-root.mjs'

async function loadLib() {
  return import(`../platform/lib/upstream-root.mjs`) as Promise<{
    resolveUpstreamRoots: (overlayRoot?: string) => {
      overlayRoot: string
      upstreamRoot: string
      hermesStudioRoot: string
      hermesAgentRoot: string
      zcodeRoot: string
    }
  }>
}

let tmp: string
beforeEach(() => {
  // macOS mkdtemp 落 /var/...（真实路径 /private/var/...）——resolver 会 realpath
  // 规范化，期望值同样取真实路径（这本身就是 realpath 语义的夹具面）。
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'upstream-root-')))
})
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
  delete process.env.OVERLAY_UPSTREAM_ROOT
  delete process.env.OVERLAY_ENSURE_CMD
})

describe('resolveUpstreamRoots 解析序（负例先红：模块缺失即本组全红）', () => {
  it('仓内 vendor 存在时优先于旧兄弟 upstream（build-dmg 旧行为的反面：不再回落 ../upstream）', async () => {
    const { resolveUpstreamRoots } = await loadLib()
    const overlay = join(tmp, 'overlay')
    mkdirSync(join(overlay, 'vendor', 'hermes-studio'), { recursive: true })
    // 同时放置旧布局兄弟 upstream——vendor 必须赢
    mkdirSync(join(tmp, 'upstream', 'hermes-studio'), { recursive: true })
    const roots = resolveUpstreamRoots(overlay)
    expect(roots.overlayRoot).toBe(overlay)
    expect(roots.upstreamRoot).toBe(join(overlay, 'vendor'))
    expect(roots.hermesStudioRoot).toBe(join(overlay, 'vendor', 'hermes-studio'))
    expect(roots.hermesAgentRoot).toBe(join(overlay, 'vendor', 'hermes-agent'))
    expect(roots.zcodeRoot).toBe(join(overlay, 'vendor', 'zcode'))
  })

  it('无 vendor 时回落旧兄弟 upstream', async () => {
    const { resolveUpstreamRoots } = await loadLib()
    const overlay = join(tmp, 'overlay')
    mkdirSync(overlay, { recursive: true })
    mkdirSync(join(tmp, 'upstream', 'hermes-studio'), { recursive: true })
    const roots = resolveUpstreamRoots(overlay)
    expect(roots.upstreamRoot).toBe(join(tmp, 'upstream'))
  })

  it('env 显式指定永远最高', async () => {
    const { resolveUpstreamRoots } = await loadLib()
    const overlay = join(tmp, 'overlay')
    mkdirSync(join(overlay, 'vendor', 'hermes-studio'), { recursive: true })
    const isolated = join(tmp, 'isolated')
    mkdirSync(join(isolated, 'hermes-studio'), { recursive: true })
    process.env.OVERLAY_UPSTREAM_ROOT = isolated
    const roots = resolveUpstreamRoots(overlay)
    expect(roots.upstreamRoot).toBe(isolated)
    expect(roots.hermesStudioRoot).toBe(join(isolated, 'hermes-studio'))
  })

  it('realpath 规范化：env 经符号链接指入时解析到真实路径', async () => {
    const { resolveUpstreamRoots } = await loadLib()
    const overlay = join(tmp, 'overlay')
    mkdirSync(overlay, { recursive: true })
    const real = join(tmp, 'real-upstream')
    mkdirSync(join(real, 'hermes-studio'), { recursive: true })
    const link = join(tmp, 'link-upstream')
    symlinkSync(real, link)
    process.env.OVERLAY_UPSTREAM_ROOT = link
    const roots = resolveUpstreamRoots(overlay)
    expect(roots.upstreamRoot).toBe(real)
  })

  it('缺省 overlayRoot 锚定本仓', async () => {
    const { resolveUpstreamRoots } = await loadLib()
    const roots = resolveUpstreamRoots()
    // 本仓检出必含 vendor/hermes-studio（钉版基线）——缺省解析即 vendor 模式
    expect(roots.upstreamRoot).toBe(join(roots.overlayRoot, 'vendor'))
    expect(roots.hermesStudioRoot).toBe(join(roots.overlayRoot, 'vendor', 'hermes-studio'))
  })
})

// ── serve-server 干净检出模拟（真子进程）──────────────────────────────────────
// 副本布局：<tmp>/overlay/scripts/{serve-server.mjs, platform/lib/upstream-root.mjs}
// 两种上游并存（vendor 无入口 + 兄弟 upstream 有入口）——serve 必须解析 vendor 并在
// 入口检查处停下，而非起服兄弟树。
function makeCleanCheckout(): string {
  const overlay = join(tmp, 'overlay')
  mkdirSync(join(overlay, 'scripts', 'platform', 'lib'), { recursive: true })
  mkdirSync(join(overlay, 'vendor', 'hermes-studio'), { recursive: true })
  // 旧布局兄弟：放了完整入口——若 serve 回落兄弟则会走到 spawn 分支
  mkdirSync(join(tmp, 'upstream', 'hermes-studio', 'packages', 'server', 'src'), { recursive: true })
  writeFileSync(join(tmp, 'upstream', 'hermes-studio', 'packages', 'server', 'src', 'index.ts'), '// fake\n')
  cpSync(join(repoRoot, 'scripts', 'serve-server.mjs'), join(overlay, 'scripts', 'serve-server.mjs'))
  cpSync(join(repoRoot, libRel), join(overlay, libRel))
  return overlay
}

function stubEnsure(overlay: string, code: number): string {
  const stub = join(overlay, 'scripts', 'stub-ensure.mjs')
  writeFileSync(stub, `process.exit(${code})\n`)
  return `node ${stub}`
}

function runServe(overlay: string, extraEnv: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [join(overlay, 'scripts', 'serve-server.mjs')], {
    encoding: 'utf8',
    env: { ...process.env, HOME: tmp, HERMES_HOME: join(tmp, 'hermes-home'), ...extraEnv },
  })
  return { code: r.status ?? -1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('serve-server 干净检出：vendor 解析 + ensure 前置（partial 不起服）', () => {
  it('解析到仓内 vendor：入口缺失在 vendor 路径上报错（不回落兄弟 upstream）', () => {
    const overlay = makeCleanCheckout()
    const r = runServe(overlay, { OVERLAY_ENSURE_CMD: stubEnsure(overlay, 0) })
    expect(r.code).toBe(1)
    expect(r.out).toContain(join(overlay, 'vendor', 'hermes-studio'))
    expect(r.out).not.toContain(join(tmp, 'upstream', 'hermes-studio'))
  })

  it('ensure 前置非零（partial/failed）：拒绝起服且不打印 starting 行', () => {
    const overlay = makeCleanCheckout()
    const r = runServe(overlay, { OVERLAY_ENSURE_CMD: stubEnsure(overlay, 1) })
    expect(r.code).toBe(1)
    expect(r.out).toContain('拒绝起服')
    expect(r.out).not.toContain('starting:')
  })

  it('ensure 前置 exit 3（v1 迁移态）：同样拒绝起服并透传码', () => {
    const overlay = makeCleanCheckout()
    const r = runServe(overlay, { OVERLAY_ENSURE_CMD: stubEnsure(overlay, 3) })
    expect(r.code).toBe(3)
    expect(r.out).not.toContain('starting:')
  })
})
