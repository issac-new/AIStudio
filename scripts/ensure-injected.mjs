// overlay/scripts/ensure-injected.mjs
// 幂等确保 upstream 已 inject:dev/build 前置钩子。
// 检测 inject 状态(manifest 存在 OR cockpit 路由已注入);若否则跑 inject。
// 若 upstream 处于不干净状态(可能已 inject),跳过避免误清理。
//
// series 领先 manifest 的差量处理(2026-09-22 根治):
//   旧逻辑只看 manifest 存在就 exit(0),series 尾部追加的新 patch(如 336-338 事件)
//   永远不被注入且无任何日志——曾被迫手动 git apply + 手工登记 manifest。
//   现改为:计算 series - manifest 差量,非空时打印清单并自动补套(git apply 到
//   hermes-studio;hermes-agent 目标按前缀路由,与 inject.mjs 保持同步),
//   成功后把差量追加进 manifest;任一失败 exit(1) 提示手动处理,不再静默。
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const overlayRoot = resolve(import.meta.dirname, '..');
const manifestPath = resolve(overlayRoot, '.overlay-injected.json');
const patchSeriesFile = resolve(overlayRoot, 'patches', 'series');
const patchDir = resolve(overlayRoot, 'patches');
const upstream = resolve(overlayRoot, '..', 'upstream', 'hermes-studio');
const hermesAgentRoot = resolve(overlayRoot, '..', 'upstream', 'hermes-agent');
const routerPath = resolve(upstream, 'packages/client/src/router/index.ts');

function gitStatus() {
  try {
    return execSync('git status --porcelain', { cwd: upstream, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function readSeries() {
  try {
    return readFileSync(patchSeriesFile, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function readManifestApplied() {
  try {
    const applied = JSON.parse(readFileSync(manifestPath, 'utf8')).appliedPatches;
    return Array.isArray(applied) ? applied : [];
  } catch {
    return null;
  }
}

// hermes-agent 目标路由:前缀清单与 inject.mjs applyPatches 保持同步(改一处须同步另一处)
function patchTargetRoot(patchName) {
  try {
    const text = readFileSync(resolve(patchDir, patchName), 'utf8');
    const m = text.match(/^(?:---|\+\+\+) [ab]\/(.+?)$/m);
    const p = m ? m[1] : '';
    if (
      p.startsWith('hermes_cli/') || p.startsWith('plugins/') || p.startsWith('agent/') ||
      p.startsWith('apps/') || p.startsWith('assets/') || p.startsWith('acp_') ||
      p.startsWith('gateway/') || p.startsWith('tests/gateway/') || p.startsWith('tests/hermes_cli/')
    ) {
      return hermesAgentRoot;
    }
  } catch { /* 读取失败按 hermes-studio 处理 */ }
  return upstream;
}

// 自动补套差量;全部成功返回 true,任一失败打印原因返回 false
function applyDelta(delta) {
  for (const p of delta) {
    const patchPath = resolve(patchDir, p);
    if (!existsSync(patchPath)) {
      console.error(`[ensure-injected] FAILED: patch 文件不存在: ${p}`);
      return false;
    }
    const targetRoot = patchTargetRoot(p);
    const label = targetRoot === hermesAgentRoot ? 'hermes-agent' : 'hermes-studio';
    try {
      execSync(`git apply --whitespace=nowarn "${patchPath}"`, { cwd: targetRoot, stdio: 'pipe' });
      console.log(`[ensure-injected] applied series-ahead patch: ${p} (to ${label})`);
    } catch (e) {
      console.error(`[ensure-injected] FAILED to apply series-ahead patch: ${p} (to ${label})`);
      console.error(`  ${String(e.stderr || e.message).trim().split('\n').slice(0, 4).join('\n  ')}`);
      console.error('  请手动处理(git apply -R 未应用差量后重试,或 npm run clean && npm run inject 全量重放)');
      return false;
    }
  }
  return true;
}

// cockpit 路由是否已注入(patch 071 的标志,最可靠的 inject 信号)
function cockpitRouteInjected() {
  try {
    const router = readFileSync(routerPath, 'utf8');
    return router.includes("name: 'hermes.cockpit'") || router.includes('name: "hermes.cockpit"');
  } catch {
    return false;
  }
}

const manifestApplied = readManifestApplied();

if (manifestApplied === null && !existsSync(manifestPath) && !cockpitRouteInjected()) {
  // 未 inject → 检查 upstream 是否干净
  const status = gitStatus();
  if (status) {
    // upstream 不干净且无 inject 标志 —— 可能是异常状态。
    // 不自动清理(避免丢失工作),提示用户手动处理。
    console.warn('[ensure-injected] upstream 不干净且无 inject 标志,跳过自动 inject。');
    console.warn('[ensure-injected] 若需重新 inject,请先运行 npm run clean。');
    process.exit(0);
  }

  console.log('[ensure-injected] 未检测到 inject 状态,执行 inject...');
  try {
    execSync('node scripts/inject.mjs', { cwd: overlayRoot, stdio: 'inherit' });
  } catch {
    // inject 可能因个别 patch(如 117 hermes-agent)失败而 exit(1),
    // 但 cockpit 路由(patch 071)通常已应用。检查 cockpit 路由是否注入成功。
    if (cockpitRouteInjected()) {
      console.warn('[ensure-injected] inject 部分失败,但 cockpit 路由已注入,继续。');
      process.exit(0);
    }
    console.error('[ensure-injected] inject 失败且 cockpit 路由未注入,请手动运行 npm run inject');
    process.exit(1);
  }
  process.exit(0);
}

// 已 inject(manifest 存在或 cockpit 路由在位)→ 差量检查
const injectedSet = new Set(manifestApplied ?? []);
const delta = readSeries().filter((p) => !injectedSet.has(p));
if (delta.length === 0) {
  process.exit(0);
}

console.warn(`[ensure-injected] series 领先 manifest ${delta.length} 条,自动补套:`);
for (const p of delta) console.warn(`  ${p}`);
if (!applyDelta(delta)) process.exit(1);
// 差量入册(manifest 可能不存在——cockpit 路由在位但无 manifest 的中间态,此时重建)
const nextApplied = [...(manifestApplied ?? readSeries().filter((p) => !delta.includes(p)))];
for (const p of delta) nextApplied.push(p);
writeFileSync(manifestPath, JSON.stringify({ appliedPatches: nextApplied, generatedAt: new Date().toISOString() }, null, 2));
console.log(`[ensure-injected] manifest 已更新(${nextApplied.length} 条)`);


