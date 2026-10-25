// Combined afterPack hook: runs verify-packaged-webui + node-pty prebuild pruning
// + sharp platform-binary pruning + Linux spawn-helper exec-bit restore.
// electron-builder 25.x only supports a single afterPack string, so we wrap all
// hooks in one CommonJS module. Pure decision helpers are exported for tests.
const { chmodSync, existsSync, readdirSync, rmSync, statSync } = require('node:fs')
const { join } = require('node:path')

// electron-builder passes context.arch as a NUMERIC enum (0=ia32, 1=x64,
// 2=armv7l, 3=arm64, 4=universal), NOT the string name. node-pty's prebuilds
// dirs are named <platform>-<arch-string> (e.g. darwin-arm64), so we must map
// the number to the string. Mirrors builder-util's Arch enum and the upstream
// verify-packaged-webui.mjs ARCH_NAMES array.
const ARCH_NAMES = ['ia32', 'x64', 'armv7l', 'arm64', 'universal']
function archName(arch) {
  if (typeof arch === 'number') {
    if (!ARCH_NAMES[arch]) throw new Error('unknown arch enum: ' + arch)
    return ARCH_NAMES[arch]
  }
  return String(arch)
}

function computeKeepDir(platform, arch) {
  return platform + '-' + archName(arch)
}

function listPruneTargets(dirs, keep) {
  return dirs.filter(dir => dir !== keep)
}

// @img/sharp-* optional deps install for the BUILD host platform; npm never
// fetches target-platform variants on a cross build. Prune everything that
// cannot load on the target so wrong-ABI failures stay loud instead of subtle.
const SHARP_KEEP_ALWAYS = new Set(['colour', 'sharp-wasm32'])
function sharpKeepDirs(platform, arch) {
  return ['sharp-' + platform + '-' + archName(arch), 'sharp-libvips-' + platform + '-' + archName(arch)]
}
function listSharpPruneTargets(dirs, platform, arch) {
  const keep = new Set([...sharpKeepDirs(platform, arch), ...SHARP_KEEP_ALWAYS])
  return dirs.filter(dir => !keep.has(dir))
}

function resourcesDirFor(context) {
  return context.electronPlatformName === 'darwin'
    ? join(context.appOutDir, context.packager.appInfo.productFilename + '.app', 'Contents', 'Resources')
    : join(context.appOutDir, 'resources')
}

async function verifyPackagedWebUi(context) {
  const webUiRoot = join(resourcesDirFor(context), 'webui')
  const required = [
    join(webUiRoot, 'package.json'),
    join(webUiRoot, 'bin', 'hermes-web-ui.mjs'),
    join(webUiRoot, 'dist', 'server', 'index.js'),
  ]
  for (const f of required) {
    if (!existsSync(f)) throw new Error('[after-pack] Missing required file: ' + f)
  }
}

async function pruneNodePtyPrebuilds(context) {
  const prebuildsDir = join(resourcesDirFor(context), 'webui', 'node_modules', 'node-pty', 'prebuilds')
  if (!existsSync(prebuildsDir)) return
  const target = computeKeepDir(context.electronPlatformName, context.arch)
  for (const entry of readdirSync(prebuildsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    for (const prune of listPruneTargets([entry.name], target)) {
      rmSync(join(prebuildsDir, prune), { recursive: true, force: true })
      console.log('[after-pack-prune] removed non-target node-pty prebuild: ' + prune + ' (keep: ' + target + ')')
    }
  }
}

async function pruneSharpPackages(context) {
  const imgDir = join(resourcesDirFor(context), 'webui', 'node_modules', '@img')
  if (!existsSync(imgDir)) return
  const platform = context.electronPlatformName
  const arch = context.arch
  const entries = readdirSync(imgDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
  for (const prune of listSharpPruneTargets(entries, platform, arch)) {
    rmSync(join(imgDir, prune), { recursive: true, force: true })
    console.log('[after-pack-prune] removed non-target @img package: ' + prune + ' (keep: ' + sharpKeepDirs(platform, arch).join(', ') + ')')
  }
}

async function ensureLinuxSpawnHelperExecutable(context) {
  if (context.electronPlatformName !== 'linux') return
  const nodePtyRoot = join(resourcesDirFor(context), 'webui', 'node_modules', 'node-pty')
  const helperPaths = [
    join(nodePtyRoot, 'build', 'Release', 'spawn-helper'),
    join(nodePtyRoot, 'build', 'Debug', 'spawn-helper'),
    join(nodePtyRoot, 'prebuilds', computeKeepDir('linux', context.arch), 'spawn-helper'),
  ]
  for (const helperPath of helperPaths) {
    if (!existsSync(helperPath)) continue
    try {
      const mode = statSync(helperPath).mode
      if ((mode & 0o111) !== 0o111) {
        chmodSync(helperPath, 0o755)
        console.log('[after-pack] restored spawn-helper exec bit: ' + helperPath)
      }
    } catch (err) {
      console.warn('[after-pack] could not normalize spawn-helper permissions at ' + helperPath + ': ' + err.message)
    }
  }
}

module.exports = async function (context) {
  await verifyPackagedWebUi(context)
  await pruneNodePtyPrebuilds(context)
  await pruneSharpPackages(context)
  await ensureLinuxSpawnHelperExecutable(context)
}
module.exports.computeKeepDir = computeKeepDir
module.exports.listPruneTargets = listPruneTargets
module.exports.archName = archName
module.exports.ARCH_NAMES = ARCH_NAMES
module.exports.SHARP_KEEP_ALWAYS = SHARP_KEEP_ALWAYS
module.exports.sharpKeepDirs = sharpKeepDirs
module.exports.listSharpPruneTargets = listSharpPruneTargets
