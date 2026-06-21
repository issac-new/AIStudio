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
  // 阶段 1:生成最小派生 config(入口 alias 在阶段 3 Task 3.4 扩充)
  const upstreamViteConfig = resolve(hermesStudioRoot, 'vite.config.ts');
  const cfg = `// 派生构建配置(inject 生成,已 gitignore)。阶段 3 将扩充 entry/alias。
import { defineConfig, mergeConfig } from 'vite';
import upstream from '${upstreamViteConfig}';

const upstreamCfg =
  typeof upstream === 'function'
    ? upstream({ command: 'serve', mode: 'development' })
    : upstream;

export default mergeConfig(
  upstreamCfg,
  defineConfig({
    // 阶段 3 Task 3.4 在此追加 resolve.alias 与 build.rollupOptions.input
  })
);
`;
  writeFileSync(resolve(overlayRoot, 'vite.config.overlay.ts'), cfg);
  console.log('[inject] generated vite.config.overlay.ts');
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
