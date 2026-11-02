// 守门:win-x64 兼容修复的静态断言——patch 内容与脚本形态,防回归/防 patch 漂移。
// vitest 由 overlay 根启动(门禁约定 cd overlay && npm test),process.cwd() 即根。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { js } from '../../../scripts/inject.mjs'

const overlayRoot = process.cwd()

describe('附件文件名 win 非法字符(patch 013/111 同步携带)', () => {
  const patches = [
    'patches/013-server-controllers-kanban.patch',
    'patches/111-hermes-to-swarm-rebrand.patch',
  ]
  for (const p of patches) {
    it(`${p} 的 safeAttachmentName 正则覆盖 :*?"<>|`, () => {
      const text = readFileSync(resolve(overlayRoot, p), 'utf8')
      // patch 内的字面量:/[\x00-\x1f\\/:*?"<>|]/g —— 覆盖 NTFS ADS(:)与 EINVAL 字符
      expect(text).toContain('[\\x00-\\x1f\\\\/:*?"<>|]')
    })
  }
})

describe('inject.mjs 路径转义(js)', () => {
  it('Windows 反斜杠路径生成合法 JS 字符串字面量(裸插值会把 \\r 当回车)', () => {
    const literal = js('C:\\Users\\x\\repo')
    expect(literal).toBe(JSON.stringify('C:\\Users\\x\\repo'))
    expect(JSON.parse(literal)).toBe('C:\\Users\\x\\repo')
  })
})

describe('build.mjs 不再引用 .bin shim(win32 是 sh 脚本)', () => {
  it('命令直指包内 JS 入口', () => {
    const text = readFileSync(resolve(overlayRoot, 'scripts/build.mjs'), 'utf8')
    // 只看代码行:注释里说明性提及 .bin 不算引用
    const code = text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    expect(code).not.toContain('.bin/')
    expect(text).toContain("bin('vite/bin/vite.js')")
    expect(text).toContain("bin('typescript/bin/tsc')")
  })
})

describe('跨平台 serve 脚本', () => {
  it('package.json 提供 npm run serve(node 版,cmd.exe 可跑)', () => {
    const pkg = JSON.parse(readFileSync(resolve(overlayRoot, 'package.json'), 'utf8'))
    expect(pkg.scripts.serve).toBe('node scripts/serve-server.mjs')
    expect(existsSync(resolve(overlayRoot, 'scripts/serve-server.mjs'))).toBe(true)
  })
})

describe('verifier/dispatcher 不再手写 .loop 相对路径', () => {
  it('loop 执行面统一经 loopWorktreeDir 派生', () => {
    const verifier = readFileSync(resolve(overlayRoot, 'custom/server/loop/engine/verifier.ts'), 'utf8')
    expect(verifier).not.toContain('`.loop/worktrees/')
    const dispatcher = readFileSync(resolve(overlayRoot, 'custom/server/loop/engine/subagent-dispatcher.ts'), 'utf8')
    expect(dispatcher).not.toContain('`.loop/worktrees/')
    expect(dispatcher).toContain('resolveHermesInvocation()')
  })
})

describe('离线安装脚本守门(2026-11-02-offline-windows-package D3/D9/D13)', () => {
  const ps1Path = 'scripts/offline-template/install/install-windows.ps1'
  it('install-windows.ps1 存在且不写/不覆写 registry(D3 镜像由目标机环境变量接管)', () => {
    const ps1 = readFileSync(resolve(overlayRoot, ps1Path), 'utf8')
    const lower = ps1.toLowerCase()
    expect(lower).not.toContain('config set registry')
    expect(lower).not.toContain('index-url')
    expect(lower).not.toContain('npmrc')
  })
  it('install-windows.ps1 纯 PowerShell,不依赖 bash/WSL(D9)', () => {
    const ps1 = readFileSync(resolve(overlayRoot, ps1Path), 'utf8')
    expect(ps1).not.toMatch(/\bbash\b/i)
    expect(ps1).not.toMatch(/\bwsl\b/i)
  })
  it('安装链四要素齐: doctor/uv 通道/ignore-scripts/zcode ensure', () => {
    const ps1 = readFileSync(resolve(overlayRoot, ps1Path), 'utf8')
    expect(ps1).toContain('S0 doctor')
    // uv 走钉版占位(打包器从上游 pm/lock.json 注入真版本), 占位在=注入机制在
    expect(ps1).toContain('"-m","pip","install","uv==__UV_VERSION__"')
    expect(ps1).toContain('"install","--ignore-scripts"')
    expect(ps1).toContain('zcode:ensure')
  })
  it('zcode AGENTS/CLAUDE 脱敏正本无本机路径与凭证位置描述(D13/D14)', () => {
    for (const f of ['AGENTS.md', 'CLAUDE.md']) {
      const ag = readFileSync(resolve(overlayRoot, 'scripts/offline-template/zcode', f), 'utf8')
      expect(ag).not.toContain('/Users/')
      expect(ag).not.toMatch(/(?<!\/System)\/Volumes\//) // /System/Volumes/Data=macOS 通用系统卷, 放行
    }
    const ag = readFileSync(resolve(overlayRoot, 'scripts/offline-template/zcode/AGENTS.md'), 'utf8')
    expect(ag.toLowerCase()).not.toContain('modelscope')
    expect(ag.toLowerCase()).not.toContain('oauth2')
  })
})
