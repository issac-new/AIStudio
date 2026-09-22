// overlay/scripts/build.mjs
// 编排完整构建:用 overlay 的 vite config 生成 client bundle,其余沿用上游 build 步骤。
// 对应上游 `npm run build`,但 vite build 改用 overlay config(@/custom alias + entry shim)。
// 自包含(不 import config/bootstrap.ts,路径内联)。
import { execSync } from 'child_process';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const ncwkRoot = resolve(overlayRoot, '..');
const upstream = resolve(ncwkRoot, 'upstream/hermes-studio');

function run(cmd, cwd, label) {
  console.log(`\n[overlay-build] ▶ ${label}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// 直接指向包内 JS 入口而非 .bin shim:Windows 下 node_modules/.bin/<name> 是
// cmd-shim 生成的 sh 脚本,`node <shim>` 把 shell 脚本当 JS 解析必炸;统一走
// 包内入口(vite/bin/vite.js、typescript/bin/tsc 均为 node 可执行 JS)在
// POSIX/Windows 都成立。
const bin = (pkgEntry) => `node ../../upstream/hermes-studio/node_modules/${pkgEntry}`;

// 1. openapi(上游脚本)
run('node scripts/generate-openapi.mjs', upstream, 'openapi:generate → dist/server/openapi.json');
// 2. client bundle(用 overlay config,@/custom alias + entry shim)
run(
  bin('vite/bin/vite.js') + ' build --config ../../overlay/vite.config.overlay.ts',
  upstream,
  'vite build (overlay config → dist/client)',
);
// 3. server 类型检查
run(bin('typescript/bin/tsc') + ' --noEmit -p packages/server/tsconfig.json', upstream, 'tsc server type-check');
// 4. server 打包
run('node scripts/build-server.mjs', upstream, 'build-server → dist/server');

console.log('\n[overlay-build] ✓ 完整构建完成:');
console.log('  dist/client/  — 客户端(含自定义矩阵/看板/品牌)');
console.log('  dist/server/  — 服务端');
