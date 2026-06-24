// overlay/scripts/inject.mjs
// 职责:1) 应用 B 类 patch(git apply) 2) 生成 overlay 派生构建 config
// 幂等;--clean 反向还原。不触碰上游 .git。
//
// 注意:本脚本用 node 直跑(.mjs),不依赖 ts 加载器,因此路径在此内联计算,
// 与 config/bootstrap.ts 保持一致(如需改路径,两处同步)。
import { readFileSync, writeFileSync, existsSync, symlinkSync, lstatSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const ncwkRoot = resolve(overlayRoot, '..');
const upstreamRoot = resolve(ncwkRoot, 'upstream');
const hermesStudioRoot = resolve(upstreamRoot, 'hermes-studio');
const upstreamNodeModules = resolve(hermesStudioRoot, 'node_modules');
const overlayNodeModules = resolve(overlayRoot, 'node_modules');
// server 代码用相对路径 import '../custom/...'(非 @ alias,tsc/esbuild 无法经 alias 重定向),
// 故需把 overlay/custom/server 链接到上游 packages/server/src/custom。
const upstreamServerCustom = resolve(hermesStudioRoot, 'packages/server/src/custom');
const overlayServerCustom = resolve(overlayRoot, 'custom/server');
const patchSeriesFile = resolve(overlayRoot, 'patches', 'series');
const patchDir = resolve(overlayRoot, 'patches');
const manifestPath = resolve(overlayRoot, '.overlay-injected.json');

const mode = process.argv.includes('--clean') ? 'clean' : 'inject';

function git(args, cwd) {
  return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function readSeries() {
  if (!existsSync(patchSeriesFile)) return [];
  const raw = readFileSync(patchSeriesFile, 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function applyPatches() {
  const patches = readSeries();
  if (patches.length === 0) {
    console.log('[inject] 无 B 类 patch(空跑或尚未迁移)');
    return patches;
  }
  for (const p of patches) {
    const patchPath = resolve(patchDir, p);
    if (!existsSync(patchPath)) {
      console.error(`[inject] FAILED: patch 文件不存在: ${p}`);
      process.exit(1);
    }
    try {
      git(`apply --whitespace=nowarn ${patchPath}`, hermesStudioRoot);
      console.log(`[inject] applied patch: ${p}`);
    } catch {
      console.error(`[inject] FAILED to apply patch: ${p}`);
      console.error('  用 git apply --reject 手动排查,修复后重跑');
      process.exit(1);
    }
  }
  return patches;
}

function reversePatches(patches) {
  for (const p of [...patches].reverse()) {
    const patchPath = resolve(patchDir, p);
    if (!existsSync(patchPath)) {
      console.warn(`[clean] WARN: patch 文件不存在,跳过: ${p}`);
      continue;
    }
    try {
      git(`apply --reverse --whitespace=nowarn ${patchPath}`, hermesStudioRoot);
      console.log(`[clean] reversed patch: ${p}`);
    } catch {
      console.error(`[clean] FAILED to reverse patch: ${p}`);
      process.exit(1);
    }
  }
}

function generateOverlayViteConfig() {
  // 生成完整派生 config:把 @ 指向 upstream src,@/custom 指向 overlay custom,
  // 入口重定向到 overlay client shim(复制上游 main.ts 启动序列 + A 类 bootstrap)。
  const upstreamViteConfig = resolve(hermesStudioRoot, 'vite.config.ts');
  const upstreamClientSrc = resolve(hermesStudioRoot, 'packages/client/src');
  const upstreamClientRoot = resolve(hermesStudioRoot, 'packages/client');
  const upstreamDistClient = resolve(hermesStudioRoot, 'dist/client');
  const overlayClientEntry = resolve(overlayRoot, 'registries/client/entry.mts');
  const overlayCustomClient = resolve(overlayRoot, 'custom/client');
  const overlayRegistries = resolve(overlayRoot, 'registries');
  const cfg = `// 派生构建配置(inject 生成,已 gitignore)。勿手改,改 inject.mjs。
import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'path';
import upstream from '${upstreamViteConfig}';

const upstreamCfg =
  typeof upstream === 'function'
    ? upstream({ command: 'serve', mode: 'development' })
    : upstream;

export default mergeConfig(
  upstreamCfg,
  defineConfig({
    // 关键:覆盖上游的相对 root/packages/client,改为绝对上游路径。
    // 上游 config 用相对路径,mergeConfig 后会被当作相对 overlay 解析(错)。
    root: '${upstreamClientRoot}',
    publicDir: resolve('${upstreamClientRoot}', 'public'),
    resolve: {
      // 用数组形式 alias(保证顺序:更具体的前缀先匹配)。
      // Vite 对象形式 alias 不保证顺序;数组形式按声明顺序匹配,故 '@/custom' 必须在 '@' 前。
      alias: [
        // /src/main.ts(index.html 的入口)→ overlay entry shim(复制上游 main.ts 启动序列 + A 类注册)。
        // 用字符串精确匹配 index.html 里的 /src/main.ts,使 Vite 以 index.html 为入口、
        // 但把 main 重定向到 overlay shim(保留 HTML 处理,生成 index.html)。
        // (字符串 find 做精确匹配;正则在模板插值里转义易错,故不用 RegExp。)
        { find: '/src/main.ts', replacement: '${overlayClientEntry}' },
        { find: '@/custom', replacement: '${overlayCustomClient}' },
        { find: '@custom', replacement: '${overlayCustomClient}' },
        { find: '@registries', replacement: '${overlayRegistries}' },
        // @ 兜底指向上游 client src(@/api、@/views、@/components 等解析到上游)
        { find: '@', replacement: '${upstreamClientSrc}' },
      ],
    },
    // outDir 必须显式覆盖为上游 dist/client 的绝对路径——上游 config 用相对
    // '../../dist/client',mergeConfig 后会相对 overlay 解析(错)。desktop 构建读此目录。
    // input 显式指向上游 index.html:覆盖 root 后,Vite 默认从 <root>/index.html 发现入口
    // 可能失效,显式 input 保证 HTML 被处理、生成 dist/client/index.html。
    build: {
      outDir: '${upstreamDistClient}',
      rollupOptions: { input: resolve('${upstreamClientRoot}', 'index.html') },
    },
    server: {
      proxy: {
        '/agent-health': {
          target: 'http://127.0.0.1:8650',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\\/agent-health/, '/health'),
        },
      },
    },
  })
);
`;
  writeFileSync(resolve(overlayRoot, 'vite.config.overlay.ts'), cfg);
  console.log('[inject] generated vite.config.overlay.ts (@/@custom/@registries alias + entry input)');
}

function ensureNodeModulesSymlink() {
  // overlay 自身无依赖;构建/开发需解析到上游 node_modules(vite/vue/matrix-js-sdk 等)。
  // 建符号链接 overlay/node_modules → upstream/hermes-studio/node_modules。
  if (!existsSync(upstreamNodeModules)) {
    console.warn('[inject] WARN: 上游 node_modules 不存在,先在上游跑 npm ci/install');
    return;
  }
  let need = true;
  try {
    if (lstatSync(overlayNodeModules).isSymbolicLink()) need = false;
  } catch {
    /* not present */
  }
  if (need) {
    try {
      symlinkSync(upstreamNodeModules, overlayNodeModules);
      console.log('[inject] linked overlay/node_modules → upstream/hermes-studio/node_modules');
    } catch (e) {
      if (!existsSync(overlayNodeModules)) {
        console.warn('[inject] WARN: 无法创建 node_modules 符号链接:', e.message);
      }
    }
  }
}

function ensureServerCustomSymlink() {
  // server 代码用相对路径 import '../custom/...'(如 controllers/auth.ts → custom/matrix/admin-service)。
  // tsc/esbuild 无法经 vite alias 重定向相对路径,故把 overlay/custom/server 链接到
  // 上游 packages/server/src/custom。clean 时移除链接(还原上游)。
  const isOursSymlink = () => {
    try {
      return lstatSync(upstreamServerCustom).isSymbolicLink();
    } catch {
      return false;
    }
  };
  if (mode === 'inject') {
    if (isOursSymlink()) return; // 已链接
    try {
      symlinkSync(overlayServerCustom, upstreamServerCustom);
      console.log('[inject] linked upstream/.../server/src/custom → overlay/custom/server');
    } catch (e) {
      if (!existsSync(upstreamServerCustom)) {
        console.warn('[inject] WARN: 无法创建 server custom 符号链接:', e.message);
      }
    }
  } else {
    // clean: 移除我们创建的链接(仅当它是符号链接时)
    if (isOursSymlink()) {
      try {
        unlinkSync(upstreamServerCustom);
        console.log('[clean] removed server/src/custom symlink');
      } catch (e) {
        console.warn('[clean] WARN: 无法移除 server custom 符号链接:', e.message);
      }
    }
  }
}

function restoreNonPatchArtifacts(label) {
  // 还原所有"非 patch 目标"的 build 产物(如 docs/openapi.json)到 HEAD。
  // 这些不是我们的 patch,留着会挡住 inject 的 dirty-check。
  const patchTargets = new Set();
  for (const p of readSeries()) {
    try {
      const patchText = readFileSync(resolve(patchDir, p), 'utf8');
      for (const line of patchText.split('\n')) {
        const m = line.match(/^(?:\+\+\+|---) b\/(.+)$/);
        if (m) patchTargets.add(m[1]);
      }
    } catch { /* patch 文件读取失败,跳过 */ }
  }
  git('status --porcelain', hermesStudioRoot)
    .trim()
    .split('\n')
    .filter(Boolean)
    .forEach((line) => {
      const f = line.slice(3).trim();
      if (!patchTargets.has(f) && line.startsWith(' M')) {
        try {
          execSync(`git checkout -- "${f}"`, { cwd: hermesStudioRoot, stdio: 'ignore' });
          console.log(`[${label}] restored build artifact (non-patch): ${f}`);
        } catch { /* 可能是 untracked 或已删,跳过 */ }
      }
    });
}

function main() {
  if (!existsSync(hermesStudioRoot)) {
    console.error(`[inject] 上游目录不存在: ${hermesStudioRoot}`);
    process.exit(1);
  }

  if (mode === 'inject') {
    // 0. 清理 inject/build 自身可能遗留的产物,避免 dirty-check 被自己的残留挡住。
    //    a) server/src/custom 符号链接(inject 建的)
    try {
      if (lstatSync(upstreamServerCustom).isSymbolicLink()) {
        unlinkSync(upstreamServerCustom);
        console.log('[inject] removed stale server/src/custom symlink (self-residual)');
      }
    } catch { /* 不存在,跳过 */ }
    //    b) 非 patch 目标的 build 产物
    restoreNonPatchArtifacts('inject');
    // 1. 校验上游工作树状态(若有 patch 残留,提示先 clean)
    const status = git('status --porcelain', hermesStudioRoot).trim();
    const patches = readSeries();
    if (status && patches.length > 0) {
      console.error('[inject] 上游工作树不干净,先运行 npm run clean:');
      console.error(status);
      process.exit(1);
    }
    // 2. 应用 B 类 patch
    const applied = applyPatches();
    // 3. 确保 overlay 能解析上游依赖(符号链接 node_modules)
    ensureNodeModulesSymlink();
    // 3b. server 代码用相对路径 import '../custom/...',需把 overlay custom/server 链接到上游
    ensureServerCustomSymlink();
    // 4. 生成派生 config
    generateOverlayViteConfig();
    // 5. 写清单
    writeFileSync(
      manifestPath,
      JSON.stringify(
        { appliedPatches: applied, generatedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    console.log('[inject] done');
  } else {
    // clean
    const applied = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, 'utf8')).appliedPatches || []
      : readSeries();
    reversePatches(applied);
    // 还原非 patch 的 build 产物(如 openapi.json),保持上游完全干净
    restoreNonPatchArtifacts('clean');
    // 移除 inject 创建的 server/src/custom 符号链接(保持上游纯净)
    ensureServerCustomSymlink();
    console.log('[clean] done');
  }
}

main();
