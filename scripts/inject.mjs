// overlay/scripts/inject.mjs
// 职责:1) 应用 B 类 patch(git apply) 2) 生成 overlay 派生构建 config
// 幂等;--clean 反向还原。不触碰上游 .git。
//
// 注意:本脚本用 node 直跑(.mjs),不依赖 ts 加载器,因此路径在此内联计算,
// 与 config/bootstrap.ts 保持一致(如需改路径,两处同步)。
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const ncwkRoot = resolve(overlayRoot, '..');
const upstreamRoot = resolve(ncwkRoot, 'upstream');
const hermesStudioRoot = resolve(upstreamRoot, 'hermes-studio');
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
  // 入口重定向到 overlay client entry shim(复制上游 main.ts 启动序列 + A 类 bootstrap)。
  const upstreamViteConfig = resolve(hermesStudioRoot, 'vite.config.ts');
  const upstreamClientSrc = resolve(hermesStudioRoot, 'packages/client/src');
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
    resolve: {
      alias: {
        // 更具体的别名在前(Vite 按顺序匹配,前缀更长者需先声明)
        '@/custom': '${overlayCustomClient}',
        '@custom': '${overlayCustomClient}',
        '@registries': '${overlayRegistries}',
        // @ 指向上游 client/src(@/api、@/views、@/components 等解析到上游)
        '@': '${upstreamClientSrc}',
      },
    },
    // 入口改为 overlay client shim(复制上游 main.ts 启动序列 + A 类注册)
    build: {
      rollupOptions: { input: resolve('${overlayRoot}', 'registries/client/entry.mts') },
    },
  })
);
`;
  writeFileSync(resolve(overlayRoot, 'vite.config.overlay.ts'), cfg);
  console.log('[inject] generated vite.config.overlay.ts (@/@custom/@registries alias + entry input)');
}

function main() {
  if (!existsSync(hermesStudioRoot)) {
    console.error(`[inject] 上游目录不存在: ${hermesStudioRoot}`);
    process.exit(1);
  }

  if (mode === 'inject') {
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
    // 3. 生成派生 config
    generateOverlayViteConfig();
    // 4. 写清单
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
    console.log('[clean] done');
  }
}

main();
