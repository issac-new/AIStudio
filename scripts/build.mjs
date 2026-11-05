// overlay/scripts/build.mjs
// 编排完整构建:用 overlay 的 vite config 生成 client bundle,其余沿用上游 build 步骤。
// 对应上游 `npm run build`,但 vite build 改用 overlay config(@/custom alias + entry shim)。
// 自包含(不 import config/bootstrap.ts,路径内联)。
import { execSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
// 上游根解析单一事实源（P1 Task 6）：env > 仓内 vendor > 旧兄弟 upstream（realpath）。
import { resolveUpstreamRoots } from './platform/lib/upstream-root.mjs';
// 运行时资产清单（P1 Task 7）：随包资源的事实源（pricing/roster/semantica-bridge）。
import { buildRuntimeAssetManifest, renderManifestFile } from './platform/lib/runtime-assets.mjs';

const overlayRoot = resolve(import.meta.dirname, '..');
const upstream = resolveUpstreamRoots(overlayRoot).hermesStudioRoot;

function run(cmd, cwd, label) {
  console.log(`\n[overlay-build] ▶ ${label}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

// 0. 注入前置（P1 Task 6）：build:full 直呼 node（不经 npm 生命周期，prebuild 钩子
// 不触发）——显式 ensure（幂等：noop/差量补套/全量注入），非零即中止构建。
// 此前依赖调用方自觉先 inject，裸跑 build:full 在未注入树上产物静默缺自定义面。
run('node scripts/ensure-injected.mjs', overlayRoot, 'ensure-injected（注入前置）');

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
  `${bin('vite/bin/vite.js')} build --config ${resolve(overlayRoot, 'vite.config.overlay.mts')}`,
  upstream,
  'vite build (overlay config → dist/client)',
);
// 3. server 类型检查
run(bin('typescript/bin/tsc') + ' --noEmit -p packages/server/tsconfig.json', upstream, 'tsc server type-check');
// 4. server 打包
run('node scripts/build-server.mjs', upstream, 'build-server → dist/server');
// 5. 运行时配置资源随包（P1 Task 7 起复制到**真** dist/server/runtime——build-server
// 产物根在 dist/server，旧落点 packages/server/dist/server 是上游旧布局残影，打包态
// __dirname=dist/server 的多候选探测看不见）。资产清单（runtime-assets.json）同批落
// dist/server/，verify-dist --server 逐项校验、桌面 afterPack 与 bundle 身份共用。
const runtimeManifest = buildRuntimeAssetManifest(overlayRoot);
const runtimeResOut = resolve(upstream, 'dist', 'server');
for (const asset of runtimeManifest.assets) {
  // rel 即部署路径；源=runtime/<rel 去 runtime/ 前缀> 或单文件资产映射
  const src = asset.rel.startsWith('runtime/')
    ? resolve(overlayRoot, 'runtime', asset.rel.slice('runtime/'.length))
    : resolve(overlayRoot, 'custom/server/decisiongraph/semantica-bridge.py');
  const dst = resolve(runtimeResOut, asset.rel);
  mkdirSync(resolve(dst, '..'), { recursive: true });
  cpSync(src, dst);
}
mkdirSync(runtimeResOut, { recursive: true });
writeFileSync(resolve(runtimeResOut, 'runtime-assets.json'), renderManifestFile(runtimeManifest));
console.log(`[overlay-build] ▶ 运行时资源+清单 → dist/server/runtime + runtime-assets.json（${runtimeManifest.assets.length} 项）`);

console.log('\n[overlay-build] ✓ 完整构建完成:');
console.log('  dist/client/  — 客户端(含自定义矩阵/看板/品牌)');
console.log('  dist/server/  — 服务端');

// 6. 产物完整性门禁:交付链唯一真实出口是本脚本(build:full/build-dmg 直呼 node,
// 不经 npm 生命周期),postbuild 钩子只在 `npm run build`(纯 vite client 构建)后
// 触发——门禁此前从不覆盖交付链,09-27 dist/client 空壳事故(服务 ready 但 SPA
// 全 404)正发生在这条链路上。execSync 非零即抛,校验失败=构建失败。
// --server（P1 Task 7）：交付链按运行时资产清单校验 server 面；postbuild 的
// client-only 模式（npm run build）不校验 server 面（vite-only 无 server 产物）。
run('node scripts/verify-dist.mjs --server', overlayRoot, 'verify-dist: 产物完整性门禁（client+server 清单）');
