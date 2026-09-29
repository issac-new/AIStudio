// overlay/scripts/build-dmg.mjs
// 编排完整 DMG 打包流程：
//   1. inject patches → upstream
//   2. build:full (用 overlay vite config 构建 web UI → upstream dist/)
//   3. electron-builder 打包 DMG（跳过上游 npm run build，避免覆盖 dist/）
//
// 用法: node scripts/build-dmg.mjs [--mac | --win | --linux]
//   默认: --mac (arm64 DMG + zip)

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const ncwkRoot = resolve(overlayRoot, '..');
// OVERLAY_UPSTREAM_ROOT：私有上游隔离（与 inject.mjs/ensure-injected.mjs 同一基建；
// 2026-09-29 补齐——此前 build 链缺失该支持，嵌套 worktree 下默认解析撞其他会话副本）。
const upstream = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? resolve(process.env.OVERLAY_UPSTREAM_ROOT.trim(), 'hermes-studio')
  : resolve(ncwkRoot, 'upstream/hermes-studio');
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
  mac: '--mac --publish never',
  win: '--win --publish never',
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

// === Step 0: Inject (apply patches, create symlinks, generate overlay vite config) ===
run('node scripts/inject.mjs', overlayRoot, 'inject patches → upstream');

// === Step 1: Full web UI build (client + server, 用 overlay vite config) ===
// 关键: 使用 build.mjs (overlay config)，而不是上游的 npm run build
// 幂等前置：上轮构建的 Step 3.5 已把根 node_modules 裁剪为生产态，vite/tsc 缺席，
// 先补装开发依赖（已就绪时 npm install 近乎空转）。
// 直接存在性检查：require.resolve 的 paths 解析会沿祖先目录穿透（嵌套 worktree 布局下
// overlay/node_modules 软链在祖先链上，私有树缺 vite 时仍解析成功——假阳性跳过还原，
// build:full 必炸）。检查构建真实消费的 bin 入口文件本身。
if (!existsSync(resolve(upstream, 'node_modules/vite/bin/vite.js'))) {
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
