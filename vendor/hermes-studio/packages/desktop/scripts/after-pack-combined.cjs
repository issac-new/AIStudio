// AFTERPACK-V10 // Combined afterPack hook: runs verify-packaged-webui + node-pty prebuild pruning
// + sharp platform-binary pruning + Linux spawn-helper exec-bit restore.
// electron-builder 25.x only supports a single afterPack string, so we wrap all
// hooks in one CommonJS module. Pure decision helpers are exported for tests.
const { chmodSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } = require('node:fs')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

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

// npm 包管理器的平台命名不统一，且与 electron-builder 的 electronPlatformName
// 不同：node-pty prebuilds 目录与 @img/sharp-* 用 Node 名（win32），sherpa-onnx-*
// 用 win。跨平台打包（如 darwin 宿主打 win x64 zip）时 keep 名必须按各族规范解析，
// 否则修剪把 win32-x64 一起剪掉（win10-mig 实测 prebuilds/ 全空）。
const NPM_PLATFORMS = { win: 'win32' }
function npmPlatform(platform) {
  return NPM_PLATFORMS[platform] || platform
}

function computeKeepDir(platform, arch) {
  return npmPlatform(platform) + '-' + archName(arch)
}

function listPruneTargets(dirs, keep) {
  return dirs.filter(dir => dir !== keep)
}

// @img/sharp-* optional deps install for the BUILD host platform; npm never
// fetches target-platform variants on a cross build. Prune everything that
// cannot load on the target so wrong-ABI failures stay loud instead of subtle.
const SHARP_KEEP_ALWAYS = new Set(['colour', 'sharp-wasm32'])
function sharpKeepDirs(platform, arch) {
  const p = npmPlatform(platform)
  return ['sharp-' + p + '-' + archName(arch), 'sharp-libvips-' + p + '-' + archName(arch)]
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

// 跨平台构建时 npm 只装宿主平台原生件（@img/sharp-* / sherpa-onnx-* 是按平台
// 拆分的 optional 包），目标平台变体根本不在 node_modules 里——修剪后包内零原生
// 件（win10-mig 实测三缺）。打包期按各族命名规范拉取目标变体进暂存树，版本对齐
// 已暂存的宿主变体（sharp+libvips 同版保 ABI 配对）。命名族：@img 用 win32-x64，
// sherpa-onnx 用 win-x64。
function stagedPkgVersion(dir) {
  if (!existsSync(dir)) return null
  try {
    return JSON.parse(require('node:fs').readFileSync(join(dir, 'package.json'), 'utf8')).version || null
  } catch { return null }
}
async function ensureCrossPlatformNatives(context) {
  const platform = context.electronPlatformName
  const hostPlatform = process.platform === 'win32' ? 'win' : process.platform
  if (platform === hostPlatform || platform === 'linux') return
  const arch = archName(context.arch)
  const webuiDir = join(resourcesDirFor(context), 'webui')
  const imgDir = join(webuiDir, 'node_modules', '@img')
  const hostArchs = [archName(process.arch), 'x64', 'arm64']
  const verOf = (base) => {
    for (const a of hostArchs) {
      const v = stagedPkgVersion(join(imgDir, base + '-' + npmPlatform(hostPlatform) + '-' + a))
      if (v) return v
    }
    return null
  }
  // sharp 与 libvips 是两条独立版本线（libvips 1.x ≠ sharp 0.x），各自读暂存变体版本。
  const sharpVer = verOf('sharp')
  const libvipsVer = verOf('sharp-libvips')
  const sherpaVer = (() => {
    for (const a of hostArchs) {
      const v = stagedPkgVersion(join(webuiDir, 'node_modules', 'sherpa-onnx-' + hostPlatform + '-' + a))
      if (v) return v
    }
    return null
  })()
  const want = []
  if (sharpVer) want.push('@img/sharp-' + npmPlatform(platform) + '-' + arch + '@' + sharpVer)
  if (libvipsVer) want.push('@img/sharp-libvips-' + npmPlatform(platform) + '-' + arch + '@' + libvipsVer)
  const sherpaPlatform = platform === 'win32' ? 'win' : platform  // sherpa npm 名族用 win（@img 才用 win32）
  if (sherpaVer) want.push('sherpa-onnx-' + sherpaPlatform + '-' + arch + '@' + sherpaVer)
  if (want.length === 0) return
  // 目标变体已在（构建前 shell 预装路线）→ 直接短路;构建期网络/vendor 仅为兜底。
  const npmP = npmPlatform(platform)
  const targetNames = [
    '@img/sharp-' + npmP + '-' + arch,
    '@img/sharp-libvips-' + npmP + '-' + arch,
    'sherpa-onnx-' + sherpaPlatform + '-' + arch,
  ]
  const alreadyStaged = targetNames.every((n) => existsSync(join(webuiDir, 'node_modules', n)))
  if (alreadyStaged) {
    console.log('[after-pack] cross build: target natives already staged, skip fetch')
    return
  }
  console.log('[after-pack] cross build: fetching target natives → ' + want.join(', '))
  // tarball 直装：electron-builder 子进程 env 内 registry 旗标被压、fetch/curl 对
  // 个别 CDN 路径一律 404（shell 同命令全通实测）——绕开一切网络不确定性：本地
  // vendor tgz 优先（CROSS_NATIVE_VENDOR_DIR），未命中再进程内 fetch 双源重试，
  // 终态统一 npm install 本地文件（零依赖叶子二进制，无二次解析）。
  const { mkdtempSync, writeFileSync } = require('node:fs')
  const { tmpdir } = require('node:os')
  const tmp = mkdtempSync(join(tmpdir(), 'cross-native-'))
  const tgzPaths = []
  for (const spec of want) {
    const scopeIdx = spec.lastIndexOf('/')
    const nameVer = spec.split('@')[0] === '' && scopeIdx > 0
      ? [spec.slice(0, scopeIdx), spec.slice(scopeIdx + 1)]
      : ['', spec]
    const [scope, nameAtVer] = nameVer
    const pkgName = nameAtVer.split('@')[0]
    const ver = nameAtVer.split('@')[1]
    const fileBase = pkgName + '-' + ver + '.tgz'
    const urls = []
    for (const reg of ['https://registry.npmmirror.com', 'https://registry.npmjs.org']) {
      urls.push(scope ? `${reg}/${scope}/${pkgName}/-/${fileBase}` : `${reg}/${pkgName}/-/${fileBase}`)
    }
    const tgz = join(tmp, fileBase)
    // 本地 vendor 优先（CROSS_NATIVE_VENDOR_DIR 指向 win10-mig vendor-npm 类目录；
    // electron-builder 子进程内 fetch/curl 对个别 registry 路径一律 404 而 shell
    // 全通的进程级拦截规避——本地 tgz 零网络）。文件名容忍 vendor 命名（img- 前缀、
    // 无 @scope）。vendor 未命中再走进程内 fetch 双源×2 轮。
    let ok = false
    const vendorDir = process.env.CROSS_NATIVE_VENDOR_DIR || ''
    if (vendorDir) {
      const { readdirSync: _rd, copyFileSync: _cp } = require('node:fs')
      const key = pkgName + '-' + ver + '.tgz'
      try {
        const _files = _rd(vendorDir)
        // 宽容匹配:vendor 文件名含 pkgName 且含 ver 且 .tgz 结尾(容忍 img- 前缀/
        // 命名装饰/不可见字符边缘态);转储名录便于构建内取证。
        const hit = _files.find((f) => f.endsWith('.tgz') && f.includes(pkgName) && f.includes(ver))
        console.log('[after-pack] vendor probe key=' + key + ' hit=' + (hit || 'MISS') + ' names=' + JSON.stringify(_files))
        if (hit) {
          _cp(join(vendorDir, hit), tgz)
          console.log('[after-pack] cross-native from vendor: ' + hit)
          ok = true
        }
      } catch (err) {
        console.warn('[after-pack] vendor scan failed (' + err.message + ')')
      }
    }
    for (let round = 0; round < 2 && !ok; round++) {
      for (const url of urls) {
        try {
          console.log('[after-pack] cross-native fetch ' + url)
          const res = await fetch(url, { redirect: 'follow' })
          if (!res.ok) throw new Error('HTTP ' + res.status)
          const buf = Buffer.from(await res.arrayBuffer())
          if (buf.length < 1024) throw new Error('suspicious tiny body ' + buf.length)
          writeFileSync(tgz, buf)
          ok = true
          break
        } catch (err) {
          console.warn('[after-pack] fetch failed (' + err.message + ')')
        }
      }
    }
    if (!ok) {
      // 软失败:目标包若已在暂存树(预装+extraResources 复制路线),fetch 兜底失败
      // 无害——跳过该件继续;真缺才抛(构建期网络不可达不阻断既有完整件)。
      const rel = scope ? scope + '/' + pkgName : pkgName
      const dest = join(webuiDir, 'node_modules', rel)
      if (existsSync(dest)) { continue }
      // vendor tgz 直解兜底:electron-builder 26 的 nodeModulesCollector 会把源
      // node_modules 中不在依赖树的预装件 prune 掉(实测),构建子 env 的网络又不
      // 可靠——tar 由本脚本掌控,直接解进暂存树(prune 在本 hook 之后跑,keep 名
      // 已修对,win32 变体保留)。
      const vendorDir2 = process.env.CROSS_NATIVE_VENDOR_DIR || ''
      if (vendorDir2) {
        const key2 = pkgName + '-' + ver + '.tgz'
        let vf = ''
        try {
          const _vf = readdirSync(vendorDir2)
          vf = _vf.find((x) => x.endsWith(key2)) || ''
        } catch (e) { console.error('[V13] readdir threw: ' + e.message); vf = '' }
        if (vf) {
          const xt = join(tmp, 'x-' + fileBase + '.d')
          mkdirSync(xt, { recursive: true })
          const tr = spawnSync('tar', ['-xzf', join(vendorDir2, vf), '-C', xt])
          if (tr.status === 0 && existsSync(join(xt, 'package'))) {
            mkdirSync(join(webuiDir, 'node_modules', scope || ''), { recursive: true })
            rmSync(dest, { recursive: true, force: true })
            spawnSync('mv', [join(xt, 'package'), dest])
            console.warn('[after-pack] cross-native restored from vendor tgz: ' + vf)
            continue
          }
        }
      }
      throw new Error('[after-pack] cross-native tarball fetch failed: ' + spec)
    }
    tgzPaths.push(tgz)
  }
  const npmArgs = ['install', '--no-save', '--no-audit', '--no-fund', '--force',
                   '--cpu', arch, '--os', npmPlatform(platform),
                   '--prefix', webuiDir, ...tgzPaths]
  // EOVERRIDE 规避（构建树态补丁）：webui package.json 的 overrides pin 了 sherpa
  // 全平台族，与 file: tgz 直装硬冲突（npm 硬错，--force 不压）——临时摘除装后还原。
  const _fs = require('node:fs')
  const _pkgPath = join(webuiDir, 'package.json')
  const _pkgBak = _pkgPath + '.crossbak'
  let _pkgPatched = false
  if (_fs.existsSync(_pkgPath)) {
    _fs.copyFileSync(_pkgPath, _pkgBak)
    const _j = JSON.parse(_fs.readFileSync(_pkgPath, 'utf8'))
    if (_j.overrides) {
      for (const k of Object.keys(_j.overrides)) {
        if (k.includes('sherpa-onnx')) { delete _j.overrides[k]; _pkgPatched = true }
      }
      if (_pkgPatched) _fs.writeFileSync(_pkgPath, JSON.stringify(_j, null, 2))
    }
  }
  console.log('[after-pack] cross-native install from local tarballs')
  const r = spawnSync('npm', npmArgs, { stdio: 'inherit' })
  if (_pkgPatched && _fs.existsSync(_pkgBak)) _fs.copyFileSync(_pkgBak, _pkgPath)
  if (_fs.existsSync(_pkgBak)) _fs.unlinkSync(_pkgBak)
  if (r.status !== 0) throw new Error('[after-pack] cross-native npm install failed (exit ' + r.status + ')')
  for (const name of want.map((spec) => spec.split('@').slice(0, spec.startsWith('@') ? 2 : 1).join('@'))) {
    if (!existsSync(join(webuiDir, 'node_modules', name))) {
      throw new Error('[after-pack] cross-native missing after install: ' + name)
    }
  }
}

module.exports = async function (context) {
  await verifyPackagedWebUi(context)
  await ensureCrossPlatformNatives(context)
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
