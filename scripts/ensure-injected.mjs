// overlay/scripts/ensure-injected.mjs
// 幂等确保 upstream 已 inject:dev/build 前置钩子。
// 检测 inject 状态(manifest 存在 OR cockpit 路由已注入);若否则跑 inject。
// 若 upstream 处于不干净状态(可能已 inject),跳过避免误清理。
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';

const overlayRoot = resolve(import.meta.dirname, '..');
const manifestPath = resolve(overlayRoot, '.overlay-injected.json');
const upstream = resolve(overlayRoot, '..', 'upstream', 'hermes-studio');
const routerPath = resolve(upstream, 'packages/client/src/router/index.ts');

function gitStatus() {
  try {
    return execSync('git status --porcelain', { cwd: upstream, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
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

if (existsSync(manifestPath) || cockpitRouteInjected()) {
  // 已 inject,跳过
  process.exit(0);
}

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

