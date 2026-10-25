import * as esbuild from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'))
const version = pkg.version
const serverOutDir = resolve(rootDir, 'dist/server')

rmSync(serverOutDir, { recursive: true, force: true })
mkdirSync(serverOutDir, { recursive: true })

// overlay[build-escape]（patch 525）：custom 侧兄弟布局字面量 require
// （'../../../../upstream/hermes-studio/…'，见 custom/server/zcode/projection-socket.ts）
// 假设 overlay 检出在 ncwk/overlay——worktree/沙箱布局下该前缀不可解析、build:full 必炸
// （2026-09-29 v5run4 沙箱实锤）。onResolve 把该前缀重锚到本仓根，两种布局同解。
// 2026-10-18（661）：custom/server/controllers/ide 比 zcode 深一级，字面量是五个 ../；
// 前缀统一按「任意层 ../ + upstream/hermes-studio/」匹配，两种深度同解。
const overlayUpstreamEscapePlugin = {
  name: 'overlay-upstream-escape',
  setup(build) {
    build.onResolve({ filter: /^(\.\.\/)+upstream\/hermes-studio\// }, (args) => {
      const base = resolve(rootDir, args.path.replace(/^(\.\.\/)+upstream\/hermes-studio\//, ''))
      for (const cand of [base + '.ts', base + '.tsx', resolve(base, 'index.ts'), base]) {
        if (existsSync(cand)) return { path: cand }
      }
      return { path: base }
    })
  },
}

await esbuild.build({
  plugins: [overlayUpstreamEscapePlugin],
  entryPoints: [resolve(rootDir, 'packages/server/src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node23',
  format: 'cjs',
  outfile: resolve(serverOutDir, 'index.js'),
  // miniprogram-automator（patch 608）：runtime-verify 的可选 SDK，未装时探针降级
  // automatorSdk:false、verify 报 CAPABILITY_ABSENT——bundle 期外置，运行期解析。
  external: ['node-pty', 'node:sqlite', 'sharp', 'socket.io', 'miniprogram-automator'],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  sourcemap: true,
  minify: true,
  treeShaking: true,
  logLevel: 'info',
})

const bridgeOutDir = resolve(serverOutDir, 'agent-bridge', 'python')
const bridgeSrcDir = resolve(rootDir, 'packages/server/src/modules/hermes/services/bridge/python')
mkdirSync(bridgeOutDir, { recursive: true })
for (const fileName of readdirSync(bridgeSrcDir)) {
  if (fileName.endsWith('.py')) {
    cpSync(resolve(bridgeSrcDir, fileName), resolve(bridgeOutDir, fileName))
  }
}
chmodSync(resolve(bridgeOutDir, 'hermes_bridge.py'), 0o755)

const serverAssetsSrcDir = resolve(rootDir, 'packages/server/src/assets')
if (existsSync(serverAssetsSrcDir)) {
  cpSync(serverAssetsSrcDir, resolve(serverOutDir, 'assets'), { recursive: true })
}

cpSync(
  resolve(rootDir, 'docs/openapi.json'),
  resolve(serverOutDir, 'openapi.json'),
)

const skillsOutDir = resolve(rootDir, 'dist/skills')
rmSync(skillsOutDir, { recursive: true, force: true })
cpSync(
  resolve(rootDir, 'packages/skills'),
  skillsOutDir,
  { recursive: true },
)

const ekkoSkillsOutDir = resolve(rootDir, 'dist/ekko-skills')
rmSync(ekkoSkillsOutDir, { recursive: true, force: true })
cpSync(
  resolve(rootDir, 'packages/ekko-agent/skills'),
  ekkoSkillsOutDir,
  { recursive: true },
)

const firmwareOutDir = resolve(rootDir, 'dist/mcu')
const legacyFirmwareOutPath = resolve(firmwareOutDir, 'firmware.bin')
for (const firmwareVersion of ['v1', 'v2']) {
  const firmwareBuildSrc = resolve(rootDir, `packages/esp32-c3/${firmwareVersion}/.pio/build/esp32-c3-devkitm-1/firmware.bin`)
  const firmwareReleaseSrc = resolve(rootDir, `packages/esp32-c3/release/${firmwareVersion}/firmware.bin`)
  const firmwareVersionedOutDir = resolve(firmwareOutDir, firmwareVersion)
  const firmwareOutPath = resolve(firmwareVersionedOutDir, 'firmware.bin')
  let firmwareSrc = ''
  let sourceLabel = ''

  if (existsSync(firmwareBuildSrc)) {
    mkdirSync(dirname(firmwareReleaseSrc), { recursive: true })
    cpSync(firmwareBuildSrc, firmwareReleaseSrc)
    firmwareSrc = firmwareBuildSrc
    sourceLabel = 'PlatformIO build output'
  } else if (existsSync(firmwareReleaseSrc)) {
    firmwareSrc = firmwareReleaseSrc
    sourceLabel = 'release artifact'
  }

  if (!firmwareSrc) {
    console.warn(`[build-server] ESP32-C3 ${firmwareVersion} firmware not found, skipped dist/mcu/${firmwareVersion}/firmware.bin`)
    continue
  }

  mkdirSync(firmwareVersionedOutDir, { recursive: true })
  cpSync(firmwareSrc, firmwareOutPath)
  if (firmwareVersion === 'v1') cpSync(firmwareSrc, legacyFirmwareOutPath)
  console.log(`[build-server] ESP32-C3 ${firmwareVersion} firmware copied from ${sourceLabel}`)
}
