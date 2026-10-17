// overlay/scripts/build-dmg.mjs
// 编排完整 DMG 打包流程：
//   1. inject patches → upstream
//   2. build:full (用 overlay vite config 构建 web UI → upstream dist/)
//   3. electron-builder 打包 DMG（跳过上游 npm run build，避免覆盖 dist/）
//
// 用法: node scripts/build-dmg.mjs [--mac | --win | --linux]
//   默认: --mac (arm64 DMG + zip)

import { execSync } from 'child_process';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const ncwkRoot = resolve(overlayRoot, '..');
// OVERLAY_UPSTREAM_ROOT：与 inject.mjs 同款私有上游隔离——缺省行为不变（ncwk 共享树）。
const upstreamRoot = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? resolve(process.env.OVERLAY_UPSTREAM_ROOT.trim())
  : resolve(ncwkRoot, 'upstream');
const upstream = resolve(upstreamRoot, 'hermes-studio');
const desktopDir = resolve(upstream, 'packages/desktop');

const platform = process.argv.includes('--win') ? 'win'
  : process.argv.includes('--linux') ? 'linux'
  : 'mac';

// 签名禁用（2026-09-19）：本机 Apple Development 证书（plusprimer@me.com）已被
// Apple 吊销，签出的包在执行时被 AMFI 在线校验 SIGKILL（症状=open 报 Launch
// failed / posix 163、直接跑二进制 exit 137）。用户分发惯例本就是 unsigned
// 安装，故固定禁用自动发现签名；恢复签名需先换有效证书并移除本环境变量。
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';

const electronBuilderFlags = {
  // mac：identity=null 显式 ad-hoc（Apple Development 证书已吊销，见上注）；分发签名恢复时移除。
  // win：--x64 必带——electron-builder 缺省取宿主 arch（arm64 mac 上出 arm64 win 包必废）。
  mac: '--mac --publish never -c.mac.identity=null -c.mac.icon=build/icon.icns',
  win: '--win --x64 --publish never',
  linux: '--linux --publish never',
}[platform];

function run(cmd, cwd, label) {
  console.log(`\n[build-dmg] ▶ ${label}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// === Step -1: Clean（上一轮注入残留会卡 inject 的 dirty-check，先反向还原）
try {
  run('node scripts/inject.mjs --clean', overlayRoot, 'clean previous inject state');
} catch {
  console.log('[build-dmg] clean 非零退出（残留已由后续 restore 兜底），继续');
}
// clean 后可能残留 untracked patch 产物（旧版 clean 不删），统一清点
run('git checkout -- .', upstream, 'restore upstream tracked files');
// 隔离模式（OVERLAY_UPSTREAM_ROOT 显式指定 = 一次性构建树）追加硬还原：
// inject --clean 对「补丁新建文件」的反向剥离不完整——同树二连跑（mac 后跑 win）
// 时 024 号类创建型补丁的产物残留必撞 "already exists"（2026-10-15 三目标轮⑯两
// 连实测）。共享树缺省模式不做硬清（非 inject 的 untracked 件不归构建流处置）。
if (process.env.OVERLAY_UPSTREAM_ROOT?.trim()) {
  run('git clean -fde node_modules', upstream, 'isolated mode: hard-clean untracked (keep node_modules)');
}

// === Step 0: Inject (apply patches, create symlinks, generate overlay vite config) ===
run('node scripts/inject.mjs', overlayRoot, 'inject patches → upstream');

// === Step 0.5: v0735-fixes 类型修复（2026-10-16 v0.7.36 轮接线）===
// inject 只落补丁；apply.sh 的 mimo 级联/类型断言是 post-inject 树手术（Step -1 的
// checkout 会抹掉上轮残留），不接进编排则每次出包都缺这批修复。脚本已幂等
// （v0.7.36 上游自带条目自动跳过），同树两连跑（mac→win）安全。
run(`HERMES_STUDIO_ROOT=${JSON.stringify(upstream)} bash ${JSON.stringify(resolve(overlayRoot, 'scripts/v0735-fixes/apply.sh'))}`, overlayRoot, 'v0735-fixes type fixes (post-inject)');

// === Step 1: Full web UI build (client + server, 用 overlay vite config) ===
// 关键: 使用 build.mjs (overlay config)，而不是上游的 npm run build
// 幂等前置：上轮构建的 Step 3.5 已把根 node_modules 裁剪为生产态，vite/tsc 缺席，
// 先补装开发依赖（已就绪时 npm install 近乎空转）。
try {
  execSync(`node -e "require.resolve('vite/package.json', { paths: [${JSON.stringify(upstream)}] })"`, { stdio: 'ignore' });
} catch {
  run('npm install --no-audit --no-fund', upstream, 'root node_modules → dev deps restored (post-prune idempotency)');
}
run('node scripts/build.mjs', overlayRoot, 'build:full (overlay config → dist/client + dist/server)');

// === Step 2: Desktop deps ===
run('npm ci --prefix packages/desktop --no-audit --no-fund', upstream, 'desktop:install');

// === Step 3: Build desktop main process (tsc) ===
run('npm run build:main', desktopDir, 'build desktop main process (tsc)');

// === Step 3.5: 仓库根 node_modules 生产化 ===
// electron-builder 的 extraResources 把仓库根 node_modules 整拷进包内 webui/node_modules，
// 约定它是"已裁剪的生产依赖"（上游 CI 以 --omit=dev 安装）。本机开发轮会把 vite/vitest/
// playwright 等开发依赖装回根目录（实测 14GB），不裁剪则产物膨胀到 14GB（0.7.24 时代的
// 2-3GB 巨型产物即此病灶）。构建在 build:full 之后，vite/tsc 已用完，此处裁剪安全。
// 副作用：裁剪后上游根目录缺开发依赖，下轮开发/构建前需在上游根 `npm install` 还原。
run('npm prune --omit=dev --no-audit --no-fund', upstream, 'root node_modules → production-only');

// === Step 4: electron-builder 打包 ===
// 直接用 electron-builder，不经过 upstream npm run dist（避免其 npm run build 覆盖 dist/）
run(`npx electron-builder ${electronBuilderFlags}`, desktopDir, `electron-builder ${electronBuilderFlags}`);

console.log(`\n[build-dmg] ✓ DMG 打包完成: upstream/hermes-studio/packages/desktop/release/`);
console.log('  包含 overlay 全部自定义组件（@/custom + patches）');
