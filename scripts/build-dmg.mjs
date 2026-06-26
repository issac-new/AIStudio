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
const upstream = resolve(ncwkRoot, 'upstream/hermes-studio');
const desktopDir = resolve(upstream, 'packages/desktop');

const platform = process.argv.includes('--win') ? 'win'
  : process.argv.includes('--linux') ? 'linux'
  : 'mac';

const electronBuilderFlags = {
  mac: '--mac --publish never',
  win: '--win --publish never',
  linux: '--linux --publish never',
}[platform];

function run(cmd, cwd, label) {
  console.log(`\n[build-dmg] ▶ ${label}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// === Step 0: Inject (apply patches, create symlinks, generate overlay vite config) ===
run('node scripts/inject.mjs', overlayRoot, 'inject patches → upstream');

// === Step 1: Full web UI build (client + server, 用 overlay vite config) ===
// 关键: 使用 build.mjs (overlay config)，而不是上游的 npm run build
run('node scripts/build.mjs', overlayRoot, 'build:full (overlay config → dist/client + dist/server)');

// === Step 2: Desktop deps ===
run('npm ci --prefix packages/desktop --no-audit --no-fund', upstream, 'desktop:install');

// === Step 3: Build desktop main process (tsc) ===
run('npm run build:main', desktopDir, 'build desktop main process (tsc)');

// === Step 4: electron-builder 打包 ===
// 直接用 electron-builder，不经过 upstream npm run dist（避免其 npm run build 覆盖 dist/）
run(`npx electron-builder ${electronBuilderFlags}`, desktopDir, `electron-builder ${electronBuilderFlags}`);

console.log(`\n[build-dmg] ✓ DMG 打包完成: upstream/hermes-studio/packages/desktop/release/`);
console.log('  包含 overlay 全部自定义组件（@/custom + patches）');
