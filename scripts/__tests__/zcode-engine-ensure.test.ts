// overlay/scripts/__tests__/zcode-engine-ensure.test.ts
// 守门：zcode 引擎依赖就绪判据以锁文件为准（2026-11-24 全面复盘批·Ycode 依赖安全刷新）。
// 背景：ensure 此前只看 node_modules 目录在不在。锁文件变了（zcode-patch 013 把带安全通告的
// 依赖钉到修补版本）已有安装不会跟进，引擎继续带着旧依赖跑——安全修复只对新装生效。
// 这里用假的 pnpm 与临时目录跑真实脚本，锁六件事：①缺目录必装且写指纹；②指纹一致不重装；
// ③锁文件变化重装并更新指纹；④旧安装（有目录无指纹）补装一次后不再重复；⑤补装失败时
// 有目录则带着现有依赖继续、指纹不写以便下次重试；⑥缺目录且装失败必须退出非零。
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve(__dirname, '../zcode-engine.mjs')
const STAMP = join('node_modules', '.aistudio-lock-sha256')
const digest = (text: string) => createHash('sha256').update(text).digest('hex')

function fixture(withNodeModules: boolean) {
  const tmp = mkdtempSync(join(tmpdir(), 'zcode-engine-ensure-'))
  const upstream = join(tmp, 'upstream')
  const root = join(upstream, 'zcode')
  const bin = join(tmp, 'bin')
  const log = join(tmp, 'pnpm-calls.log')
  mkdirSync(join(root, 'packages/server/dist'), { recursive: true })
  // CLI 产物占位：让 install-cli 跳过构建，只验证依赖判据这一段
  mkdirSync(join(root, 'apps/zcode-cli/packages/cli/dist'), { recursive: true })
  mkdirSync(bin, { recursive: true })
  if (withNodeModules) mkdirSync(join(root, 'node_modules'))
  writeFileSync(join(root, 'packages/server/dist/entry-http.js'), '')
  writeFileSync(join(root, 'apps/zcode-cli/packages/cli/dist/zcode.cjs'), '')
  // 产物旁补构建戳记：这批加了产物陈旧判定（指纹=基线树对象+zcode 补丁序列），
  // 不补戳记会触发重建、多出一笔 pnpm build 调用。夹具里没有 vendor/zcode 基线，
  // 用 empty tree oid（4b825dc642…）与空补丁集，指纹可预先算定。
  // 构建戳记：本批加了产物陈旧判定（指纹=基线树对象+zcode 补丁序列，产物旁 .aistudio-stamp），
  // 不补会触发重建、多出一笔 pnpm build。夹具里 zcode 根指到临时目录（仓外→树对象 null），
  // 补丁序列经 AISTUDIO_ZCODE_PATCHES_FOR_TESTS 指向真实仓（与脚本同口径），由脚本自算指纹。
  // 戳记初值 placeholder：首次 ensure 时会按当前指纹重写（本批加了产物陈旧判定，
  // 指纹=基线树对象+zcode 补丁序列；夹具的 zcode 根在仓外→树对象 null，补丁序列
  // 经 AISTUDIO_ZCODE_PATCHES_FOR_TESTS 指向真实仓，由脚本自算并覆写此处）。
  writeFileSync(join(root, 'packages/server/dist/.aistudio-stamp'), 'placeholder\n')
  writeFileSync(join(root, 'apps/zcode-cli/packages/cli/dist/.aistudio-stamp'), 'placeholder\n')
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfile: v1\n')
  writeFileSync(log, '')
  const fakePnpm = join(bin, 'pnpm')
  // 假 pnpm：记录调用，安装成功时像真 pnpm 一样建出 node_modules（指纹文件写在里面）
  writeFileSync(fakePnpm, '#!/bin/sh\ncase "$*" in *"run build"*) : ;; *) echo "${ELECTRON_SKIP_BINARY_DOWNLOAD}|$*" >> "$FAKE_PNPM_LOG" ;; esac\n[ -n "${FAKE_PNPM_FAIL:-}" ] && exit 7\ncase "$*" in install*) mkdir -p node_modules ;; esac\nexit 0\n')
  chmodSync(fakePnpm, 0o755)
  const env = (fail = false) => ({
    PATH: `${bin}:${process.env.PATH ?? ''}`,
    OVERLAY_UPSTREAM_ROOT: upstream,
    AISTUDIO_ZCODE_PATCHES_FOR_TESTS: resolve(__dirname, '../../zcode-patches'),
    // install-cli 会把 CLI 产物装到 $HOME/.hermes/ycode——测试里必须指向临时目录
    HOME: tmp,
    FAKE_PNPM_LOG: log,
    FAKE_PNPM_FAIL: fail ? '1' : '',
  })
  return {
    tmp, root, log,
    run: (mode = 'ensure', fail = false) => spawnSync(process.execPath, [SCRIPT, mode], { env: env(fail), encoding: 'utf8' }),
    calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
    stamp: () => (existsSync(join(root, STAMP)) ? readFileSync(join(root, STAMP), 'utf8').trim() : null),
    setLock: (text: string) => writeFileSync(join(root, 'pnpm-lock.yaml'), text),
    dispose: () => rmSync(tmp, { recursive: true, force: true }),
  }
}

describe.skipIf(process.platform === 'win32')('zcode-engine ensure：依赖就绪以锁文件为准', () => {
  it('node_modules 缺失：装依赖、带跳过 electron 二进制的环境变量、写指纹', () => {
    const f = fixture(false)
    try {
      const r = f.run()
      expect(r.status).toBe(0)
      expect(f.calls()).toEqual(['1|install --frozen-lockfile --prefer-offline'])
      expect(f.stamp()).toBe(digest('lockfile: v1\n'))
    } finally { f.dispose() }
  })

  it('指纹与锁文件一致：不重复安装', () => {
    const f = fixture(false)
    try {
      expect(f.run().status).toBe(0)
      expect(f.run().status).toBe(0)
      expect(f.calls()).toHaveLength(1)
    } finally { f.dispose() }
  })

  it('锁文件变化（依赖安全刷新的典型路径）：重装并把指纹更新到新锁文件', () => {
    const f = fixture(false)
    try {
      const first = f.run()
      expect(first.stdout).not.toContain('重启后才会用上新依赖')
      f.setLock('lockfile: v1\n# 013 把带通告的依赖钉到修补版本\n')
      const r = f.run()
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('正在运行的引擎要重启后才会用上新依赖')
      expect(f.calls()).toHaveLength(2) // 依赖判据两轮安装；产物重建调用不记日志（假 pnpm 旁路）
      expect(f.stamp()).toBe(digest('lockfile: v1\n# 013 把带通告的依赖钉到修补版本\n'))
      expect(f.run().status).toBe(0)
      expect(f.calls()).toHaveLength(2)
    } finally { f.dispose() }
  })

  it('旧安装（有 node_modules、无指纹）：补装一次，之后不再重复', () => {
    const f = fixture(true)
    try {
      const r = f.run()
      expect(r.status).toBe(0)
      expect(f.calls()).toHaveLength(1)
      expect(r.stdout).toContain('依赖就绪指纹缺失')
      expect(f.run().status).toBe(0)
      expect(f.calls()).toHaveLength(1)
    } finally { f.dispose() }
  })

  it('锁文件变化而补装失败（离线）：带着现有依赖继续、退出码 0、指纹不更新，下次重试', () => {
    const f = fixture(false)
    try {
      f.run()
      f.setLock('lockfile: v1\n# changed\n')
      const r = f.run('ensure', true)
      expect(r.status).toBe(0)
      expect(r.stdout).toContain('继续使用现有依赖')
      expect(f.stamp()).toBe(digest('lockfile: v1\n'))
      expect(f.run().status).toBe(0)
      expect(f.calls()).toHaveLength(3)
      expect(f.stamp()).toBe(digest('lockfile: v1\n# changed\n'))
    } finally { f.dispose() }
  })

  it('node_modules 缺失且安装失败：退出码非零（与旧行为一致，不得假装就绪）', () => {
    const f = fixture(false)
    try {
      const r = f.run('ensure', true)
      expect(r.status).not.toBe(0)
      expect(f.stamp()).toBeNull()
    } finally { f.dispose() }
  })

  it('锁文件不存在：退回只看目录，安装不带冻结模式', () => {
    const f = fixture(true)
    try {
      rmSync(join(f.root, 'pnpm-lock.yaml'))
      expect(f.calls()).toHaveLength(0)
      expect(f.run().status).toBe(0)
      expect(f.calls()).toHaveLength(0)
      rmSync(join(f.root, 'node_modules'), { recursive: true, force: true })
      expect(f.run().status).toBe(0)
      expect(f.calls()).toEqual(['1|install'])
    } finally { f.dispose() }
  })

  it('install-cli 走同一判据：指纹一致不重装，锁文件变化则重装', () => {
    const f = fixture(false)
    try {
      f.run()
      const r1 = f.run('install-cli')
      expect(r1.status).toBe(0)
      const installs = () => f.calls().filter((line) => line.includes('|install ')).length
      expect(installs()).toBe(1)
      // CLI 装进的是临时 HOME，真实用户目录不被测试触碰
      expect(existsSync(join(f.tmp, '.hermes/ycode/zcode.cjs'))).toBe(true)
      f.setLock('lockfile: v1\n# changed\n')
      expect(f.run('install-cli').status).toBe(0)
      expect(installs()).toBe(2)
    } finally { f.dispose() }
  })
})
