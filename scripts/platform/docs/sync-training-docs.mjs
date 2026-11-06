// sync-training-docs.mjs — 文档投影生成器（P2 平台重写 Task 3）。
//
// 铁律：培训手册里的「当前构建」章节（版本/路由计数/全量路由清单/模块版本/
// 特性开关）只从真实载体生成，不手维护第二份：
//   - 路由与特性开关：复用 scripts/regression/route-manifest.ts 真注册链
//     （vite-node 起真实 router+registries；features.ts 经其 featureGates 汇入）；
//   - 版本：package.json version；
//   - 模块版本：RELEASE-MANIFEST.json modules[*].version。
//
// marker 块（docs-projection:begin … docs-projection:end）整块由本脚本拥有：
//   --write  生成并整块替换（块缺席则追加到手册末尾）
//   --check  重算并与在册块对账，漂移非零退出（并入 release:check）
//   --print  生成到 stdout（调试）
// 确定性：同输入同字节（无时间戳）；--write 幂等。
//
// seam（测试用，缺省=真实链路）：
//   DOCS_PROJECTION_MANIFEST_FILE  清单 JSON 文件路径（跳过 vite-node 真跑）
//   --root <dir>                    仓根覆盖（夹具树）
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const MANUAL_REL = 'docs/manuals/aistudio-training-and-user-guide.md';
const ROUTE_MANIFEST_REL = 'scripts/regression/route-manifest.ts';
export const BEGIN_MARKER = '<!-- docs-projection:begin 由 scripts/platform/docs/sync-training-docs.mjs 生成（--write 写入 / --check 对账）；手改此块即 docs:check 红，先跑 npm run docs:sync -->';
export const END_MARKER = '<!-- docs-projection:end -->';

const USAGE = `用法: sync-training-docs.mjs [--write|--check|--print] [--root <仓根>]
  --write   生成 marker 块并写入培训手册（docs:sync）
  --check   重算并与手册在册块对账；漂移/缺席非零退出（docs:check，并入 release:check）
  --print   生成块到 stdout
  --root    仓根覆盖（缺省=脚本定位的仓根；测试夹具用）
环境 seam: DOCS_PROJECTION_MANIFEST_FILE=<清单 JSON 路径>（跳过 vite-node 真注册链）`;

function fail(msg, code = 1) {
  console.error(`✗ docs:projection — ${msg}`);
  process.exit(code);
}

/** 真注册链取清单（route-manifest.ts 输出 JSON）；seam 优先。 */
function loadRouteManifest(root) {
  const seam = process.env.DOCS_PROJECTION_MANIFEST_FILE?.trim();
  if (seam) {
    if (!existsSync(seam)) fail(`DOCS_PROJECTION_MANIFEST_FILE 指向的文件不存在：${seam}`, 64);
    return JSON.parse(readFileSync(seam, 'utf8'));
  }
  const script = resolve(root, ROUTE_MANIFEST_REL);
  if (!existsSync(script)) fail(`真注册链载体缺席：${script}（生成器不另建路由数组）`, 64);
  const r = spawnSync(process.execPath, [
    resolve(root, 'node_modules/vite-node/vite-node.mjs'),
    '--config', resolve(root, 'vitest.config.ts'),
    script,
  ], { cwd: root, encoding: 'utf8', timeout: 120_000 });
  if (r.status !== 0) fail(`真注册链执行失败（exit=${r.status}）：${(r.stderr || r.stdout || '').slice(0, 600)}`);
  return JSON.parse(r.stdout);
}

function validateManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.routes) || !Array.isArray(manifest.stageTabs) || !manifest.counts) {
    fail('清单形状非法（routes/stageTabs/counts 缺席）', 64);
  }
  for (const r of manifest.routes) {
    if (typeof r.name !== 'string' || typeof r.path !== 'string' || (r.kind !== 'page' && r.kind !== 'redirect')) {
      fail(`清单路由行畸形：${JSON.stringify(r).slice(0, 120)}`, 64);
    }
  }
}

/** 渲染投影块（确定性：无时间戳；路由行序=注册链输出序）。 */
export function renderBlock({ version, releaseModules, featureGates, manifest }) {
  const c = manifest.counts;
  const lines = [];
  lines.push(BEGIN_MARKER);
  lines.push('### 17.10 当前构建的页面路由投影（生成区，勿手改）');
  lines.push('');
  lines.push('本节由 `npm run docs:sync` 从真实载体生成：路由与特性开关出自注册链清单（`scripts/regression/route-manifest.ts`），版本出自 `package.json`，模块版本出自 `RELEASE-MANIFEST.json`。`npm run docs:check`（并入 `release:check`）对账，漂移即非零——手册不维护第二份路由清单。');
  lines.push('');
  lines.push(`- 适用版本：AIStudio ${version}（package.json）`);
  lines.push(`- 路由计数：routes=${c.routes}（page ${c.pages} / redirect ${c.redirects}）；stageTabs=${c.stageTabs}；visitStates=${c.visitStates}`);
  const moduleBits = Object.entries(releaseModules).map(([key, v]) => `${key} ${v}`);
  lines.push(`- 模块版本（RELEASE-MANIFEST.json）：${moduleBits.join(' · ')}`);
  const gateBits = Object.entries(featureGates)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v ? 'on' : 'off'}`);
  lines.push(`- 特性开关缺省（config/features.ts，经注册链解析）：${gateBits.join(' · ')}`);
  lines.push('');
  lines.push('全量路由清单（行序=注册链输出序；redirect 类不可直访）：');
  lines.push('');
  lines.push('| 路由 | path | 类型 |');
  lines.push('|---|---|---|');
  for (const r of manifest.routes) {
    lines.push(`| ${r.name} | ${r.path} | ${r.kind} |`);
  }
  lines.push(END_MARKER);
  return lines.join('\n');
}

/** 读手册并切块（begin 前文本、块、end 后文本）；块缺席返回 null。 */
export function splitManual(text) {
  const begin = text.indexOf(BEGIN_MARKER);
  const end = text.indexOf(END_MARKER);
  if (begin === -1 || end === -1 || end < begin) return null;
  return { before: text.slice(0, begin), block: text.slice(begin, end + END_MARKER.length), after: text.slice(end + END_MARKER.length) };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }
  const modes = argv.filter(a => a === '--write' || a === '--check' || a === '--print');
  if (modes.length !== 1) {
    console.error(USAGE);
    process.exit(64);
  }
  const mode = modes[0];
  const rootIdx = argv.indexOf('--root');
  const root = resolve(rootIdx !== -1 && argv[rootIdx + 1] ? argv[rootIdx + 1] : resolve(import.meta.dirname, '..', '..', '..'));

  const pkgPath = resolve(root, 'package.json');
  const relPath = resolve(root, 'RELEASE-MANIFEST.json');
  const manualPath = resolve(root, MANUAL_REL);
  for (const p of [pkgPath, relPath, manualPath]) {
    if (!existsSync(p)) fail(`载体缺席：${p}（--root 指错树？）`, 64);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const release = JSON.parse(readFileSync(relPath, 'utf8'));
  const manifest = loadRouteManifest(root);
  validateManifest(manifest);

  const block = renderBlock({
    version: pkg.version,
    releaseModules: Object.fromEntries(Object.entries(release.modules ?? {}).map(([k, m]) => [k, m.version])),
    featureGates: manifest.featureGates ?? {},
    manifest,
  });

  if (mode === '--print') {
    process.stdout.write(`${block}\n`);
    return;
  }

  const manual = readFileSync(manualPath, 'utf8');
  const parts = splitManual(manual);

  if (mode === '--write') {
    let out;
    if (parts) {
      out = `${parts.before}${block}${parts.after}`;
    } else {
      // 块缺席：追加到手册末尾（首跑 docs:sync 建块；此后只在块内轮换）
      const tail = manual.endsWith('\n') ? manual : `${manual}\n`;
      out = `${tail}\n${block}\n`;
    }
    if (out !== manual) writeFileSync(manualPath, out);
    console.log(`✓ docs:sync — 投影块已写入 ${MANUAL_REL}（routes=${manifest.counts.routes}，version=${pkg.version}）`);
    return;
  }

  // --check：重算对账
  if (!parts) fail(`手册无投影 marker 块（${MANUAL_REL}）——先跑 npm run docs:sync 建块`);
  if (parts.block !== block) {
    const expected = block.split('\n');
    const actual = parts.block.split('\n');
    const firstDiff = expected.findIndex((l, i) => l !== actual[i]);
    console.error(`✗ docs:check — 手册投影块与真实载体漂移（版本 ${pkg.version}，首处差异行 ${firstDiff + 1}）：`);
    console.error(`  期望: ${(expected[firstDiff] ?? '<EOF>').slice(0, 160)}`);
    console.error(`  在册: ${(actual[firstDiff] ?? '<EOF>').slice(0, 160)}`);
    console.error('修复：跑 npm run docs:sync 重写投影块（或修正漂移的载体）后重试。');
    process.exit(1);
  }
  console.log(`✓ docs:check — 手册投影块与真实载体一致（routes=${manifest.counts.routes}，version=${pkg.version}）`);
}

// 入口守卫：被导入（锚定 renderBlock/splitManual/markers 契约）时不执行主链。
const isEntry = (() => {
  try { return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

if (isEntry) main();
