// overlay/scripts/build.mjs
// 编排完整构建:用 overlay 的 vite config 生成 client bundle,其余沿用上游 build 步骤。
// 对应上游 `npm run build`,但 vite build 改用 overlay config(@/custom alias + entry shim)。
// 自包含(不 import config/bootstrap.ts,路径内联)。
import { execSync } from 'child_process';
import { cpSync, existsSync } from 'fs';
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
// 路径一律绝对解析(锚定本脚本所在 overlay 树):旧写法 `../../overlay/...`、
// `../../upstream/...` 假定 overlay 与 upstream 是 ncwk 根下的兄弟目录,git worktree
// 布局(worktree 根即 overlay,upstream 靠 .claude/worktrees/upstream 软链)下相对
// 解析差一层即失联——与 deploy-agent-runtime.mjs 的 Z5 同款病灶,一并根治。
const upstreamNodeModules = resolve(upstream, 'node_modules');
const bin = (pkgEntry) => `node ${resolve(upstreamNodeModules, pkgEntry)}`;

// 1. openapi(上游脚本)
run('node scripts/generate-openapi.mjs', upstream, 'openapi:generate → dist/server/openapi.json');
// 2. client bundle(用 overlay config,@/custom alias + entry shim)
run(
  `${bin('vite/bin/vite.js')} build --config ${resolve(overlayRoot, 'vite.config.overlay.ts')}`,
  upstream,
  'vite build (overlay config → dist/client)',
);
// 3. server 类型检查
run(bin('typescript/bin/tsc') + ' --noEmit -p packages/server/tsconfig.json', upstream, 'tsc server type-check');
// 4. server 打包
run('node scripts/build-server.mjs', upstream, 'build-server → dist/server');
// 5. 运行时配置资源随包（打包态 __dirname=dist/server，多候选加载器按 __dirname 同级
// runtime/ 探测；不拷则价目表/列编排/squad 三表在装机产物里静默回空——dev 形态经
// overlay 软链布局可解析、打包态不可见，2026-09-25 审查实证的验证盲区）。
const runtimeResSrc = resolve(overlayRoot, 'runtime');
const runtimeResOut = resolve(upstream, 'packages/server/dist/server/runtime');
for (const sub of ['pricing', 'roster']) {
  const from = resolve(runtimeResSrc, sub);
  if (!existsSync(from)) throw new Error(`[overlay-build] 运行时配置缺失: ${from}`);
  cpSync(from, resolve(runtimeResOut, sub), { recursive: true });
}
console.log('[overlay-build] ▶ 运行时配置资源 → dist/server/runtime/{pricing,roster}');

console.log('\n[overlay-build] ✓ 完整构建完成:');
console.log('  dist/client/  — 客户端(含自定义矩阵/看板/品牌)');
console.log('  dist/server/  — 服务端');
