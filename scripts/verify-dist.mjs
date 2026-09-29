// overlay/scripts/verify-dist.mjs
// P0 长期改进(2026-09-28):构建产物完整性门禁。
// 背景:09-27 推演暴露 studio 服务端 ready 但 dist/client 为空、SPA 全 404——
// 构建静默失效没有任何报警。本脚本作为 postbuild 钩子,产物缺失即硬失败。
import { existsSync, statSync, readdirSync } from 'fs';
import { resolve } from 'path';

// OVERLAY_UPSTREAM_ROOT：私有上游隔离（与 inject.mjs/build.mjs 同一基建）——
// worktree/沙箱布局下兄弟 upstream 不存在，显式指向隔离注入副本。
const upstreamRoot = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? resolve(process.env.OVERLAY_UPSTREAM_ROOT.trim())
  : resolve(import.meta.dirname, '..', '..', 'upstream');
const distClient = resolve(upstreamRoot, 'hermes-studio', 'dist', 'client');

const fail = (msg) => {
  console.error(`[verify-dist] FAIL: ${msg}`);
  process.exit(1);
};

if (!existsSync(distClient)) fail(`dist/client 目录不存在: ${distClient}`);
const indexHtml = resolve(distClient, 'index.html');
if (!existsSync(indexHtml)) fail(`dist/client/index.html 缺失(build 未产出入口)`);

const size = statSync(indexHtml).size;
if (size < 200) fail(`dist/client/index.html 异常偏小(${size}B),疑似空壳`);

const assets = readdirSync(resolve(distClient, 'assets')).filter((f) => f.endsWith('.js'));
if (assets.length === 0) fail('dist/client/assets 无 JS 产物,SPA 将白屏');

console.log(`[verify-dist] OK: index.html ${size}B, assets/js ${assets.length} 个`);
