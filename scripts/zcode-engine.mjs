// overlay/scripts/zcode-engine.mjs
// zcode 引擎服务接入脚本（2026-09-23 源码底座轮 R2）。
// 用法:
//   node scripts/zcode-engine.mjs ensure   # 依赖+构建产物就绪(缺失或落后于基线才补)
//   node scripts/zcode-engine.mjs serve    # ensure + 前台拉起引擎服务(:3030)
//
// 语义:
//   - ensure 幂等:node_modules 缺失才安装;构建产物缺失、或落后于当前基线与补丁
//     (产物旁 .aistudio-stamp 记录的构建指纹不一致)才重建,已就绪时秒回。
//     2026-11-24 实录:此前只看产物在不在——vendor/zcode 换血到 4.0 后,主检出的
//     引擎服务端产物仍停在 11-11 的 3.18.0 构建,zcode:serve 会原样拉起旧引擎。
//   - pnpm install 必须 ELECTRON_SKIP_BINARY_DOWNLOAD=1(否则 electron
//     postinstall 挂死 GitHub 源,R1 实证);桌面构建需求另行全量装。
//   - serve 前台托管(stdio inherit,Ctrl+C 传导);:3030 已被监听视为
//     引擎已在跑,不重复拉起(幂等)。
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { createConnection } from 'net';
import { relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const overlayRoot = resolve(import.meta.dirname, '..');
// AIStudio 单仓整合轮（2026-10-24）：zcode 根解析 env ＞ 仓内 vendor/zcode ＞
// 旧布局 ../upstream/zcode。vendor 树 node_modules/dist 由 ensure 幂等补齐。
const zcodeRoot = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? resolve(process.env.OVERLAY_UPSTREAM_ROOT.trim(), 'zcode')
  : existsSync(resolve(overlayRoot, 'vendor', 'zcode'))
    ? resolve(overlayRoot, 'vendor', 'zcode')
    : resolve(overlayRoot, '..', 'upstream', 'zcode');
const serverEntry = resolve(zcodeRoot, 'packages/server/dist/entry-http.js');
const ENGINE_PORT = 3030;
const STAMP_NAME = '.aistudio-stamp';

/**
 * 构建指纹:vendor/zcode 在 HEAD 的树对象(基线换血即变)＋zcode 补丁序列逐文件内容
 * (补丁改了、 reordered 即变)。纯函数,便于守门;两个产物(服务端、分叉 CLI)共用。
 * @param {{ treeOid: string | null, patches: Array<[string, string]> }} input
 */
export function sourceFingerprint({ treeOid, patches }) {
  const h = createHash('sha256');
  h.update(`baseline:${treeOid ?? 'unknown'}\n`);
  for (const [name, text] of patches) {
    h.update(`patch:${name}\n${text}\n`);
  }
  return h.digest('hex');
}

/** 产物是否与指纹一致:产物在位且旁边戳记逐字相同。戳记缺失(被干净构建清掉等)视为落后。 */
export function isBuildFresh(artifactPath, stampPath, fingerprint, exists = existsSync, read = readFileSync) {
  if (!exists(artifactPath) || !exists(stampPath)) return false;
  try {
    return read(stampPath, 'utf8').trim() === fingerprint;
  } catch {
    return false;
  }
}

/** zcode 根在仓内时取 HEAD 下该目录的树对象;仓外树或无 git(源码包解包树)返回 null。 */
function baselineTreeOid() {
  const rel = relative(overlayRoot, zcodeRoot);
  if (!rel || rel.startsWith('..')) return null;
  const r = spawnSync('git', ['rev-parse', `HEAD:${rel.split('\\').join('/')}`], { cwd: overlayRoot, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** zcode 补丁序列(series 剥注释与空行)→ [补丁名, 补丁正文];与 inject.mjs readZcodeSeries 同目录口径。 */
function zcodePatchTexts() {
  const dir = process.env.OVERLAY_ZCODE_PATCH_DIR?.trim();
  const patchDir = dir ? resolve(dir) : resolve(overlayRoot, 'zcode-patches');
  const seriesPath = resolve(patchDir, 'series');
  if (!existsSync(seriesPath)) return [];
  return readFileSync(seriesPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((name) => {
      const path = resolve(patchDir, name);
      return [name, existsSync(path) ? readFileSync(path, 'utf8') : ''];
    });
}

function currentFingerprint() {
  return sourceFingerprint({ treeOid: baselineTreeOid(), patches: zcodePatchTexts() });
}

function writeStamp(stampPath, fingerprint) {
  mkdirSync(resolve(stampPath, '..'), { recursive: true });
  writeFileSync(stampPath, `${fingerprint}\n`);
}

function log(tag, msg) { console.log(`[zcode-engine:${tag}] ${msg}`); }

function portListening(port, host = '127.0.0.1') {
  return new Promise((resolvePromise) => {
    const sock = createConnection({ port, host }, () => { sock.destroy(); resolvePromise(true); });
    sock.on('error', () => resolvePromise(false));
    sock.setTimeout(1500, () => { sock.destroy(); resolvePromise(false); });
  });
}

async function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portListening(port)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: zcodeRoot, ...opts });
  if (r.status !== 0) {
    console.error(`[zcode-engine] 命令失败(exit ${r.status}): ${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
}

async function ensure() {
  if (!existsSync(zcodeRoot)) {
    console.error(`[zcode-engine] upstream/zcode 不存在: ${zcodeRoot} —— 先克隆(pin 见 zcode-foundation-design.md D1)`);
    process.exit(1);
  }
  if (!existsSync(resolve(zcodeRoot, 'node_modules'))) {
    log('ensure', 'node_modules 缺失,执行 pnpm install(跳过 electron 二进制)');
    run('pnpm', ['install'], { env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
  }
  const fingerprint = currentFingerprint();
  const stampPath = resolve(zcodeRoot, 'packages/server/dist', STAMP_NAME);
  if (isBuildFresh(serverEntry, stampPath, fingerprint)) {
    log('ensure', '依赖与构建产物已就绪(构建指纹与当前基线、补丁一致)');
  } else {
    log('ensure', existsSync(serverEntry)
      ? 'packages/server 构建产物落后于当前基线或补丁(或无构建戳记),重建'
      : 'packages/server 构建产物缺失,执行最小面构建');
    run('pnpm', ['--filter', '@zcode/server', 'run', 'build'], { env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
    writeStamp(stampPath, fingerprint);
  }
  // v3.16.1 起上游在 apps/zcode-cli/packages/zcode-cua-plugin 自带 CUA 载荷，
  // seed 经 rootCandidate "../zcode-cua-plugin" 直接命中，无需再往 cli/dist staging。
}

async function serve() {
  await ensure();
  if (await portListening(ENGINE_PORT)) {
    log('serve', `:${ENGINE_PORT} 已被监听,引擎已在跑,跳过拉起(幂等)`);
    return;
  }
  log('serve', `拉起 zcode 引擎服务: node ${serverEntry}`);
  const child = spawn(process.execPath, [serverEntry], {
    cwd: zcodeRoot,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('error', (err) => { console.error(`[zcode-engine:serve] 启动失败: ${err.message}`); process.exit(1); });
  const ok = await waitForPort(ENGINE_PORT, 30000);
  log('serve', ok ? `引擎服务就绪 :${ENGINE_PORT}(WS 通道)` : `30s 内未探测到 :${ENGINE_PORT}(可能仍在启动,进程继续前台托管)`);
  child.on('close', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
  // 前台常驻:await 永不 resolve,由 close 退出
  await new Promise(() => {});
}

// install-cli：构建分叉 CLI 并安装到 ~/.hermes/ycode/zcode.cjs——ACP 桥
// （zcode-acp-server）的引擎身份正身。桥以 [node, ZCODE_BIN, 'app-server',
// '--stdio'] 形式 spawn（resolve.js 头注释），.cjs 路径即可，无需可执行位。
// 安装位在 ~/.hermes 下与 hermes 运行时同域；重跑即覆盖更新（幂等）。
const CLI_ENTRY = resolve(zcodeRoot, 'apps/zcode-cli/packages/cli/dist/zcode.cjs');

async function ensureCli() {
  if (!existsSync(resolve(zcodeRoot, 'node_modules'))) {
    log('install-cli', 'node_modules 缺失,执行 pnpm install(跳过 electron 二进制)');
    run('pnpm', ['install'], { env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
  }
  const fingerprint = currentFingerprint();
  const stampPath = resolve(CLI_ENTRY, '..', STAMP_NAME);
  if (isBuildFresh(CLI_ENTRY, stampPath, fingerprint)) {
    log('install-cli', '分叉 CLI 构建产物已就绪(构建指纹与当前基线、补丁一致)');
    return;
  }
  // CLI 依赖工作区包（@zcode/core、@zcode/i18n 等）的 dist——必须按依赖闭包
  // 构建：turbo 在 apps/zcode-cli 工作区（turbo.json 在该层），二进制借用
  // monorepo 根 node_modules/.bin/turbo（app 层 PATH 无 turbo，实测）。
  log('install-cli', existsSync(CLI_ENTRY) ? '分叉 CLI 产物落后于当前基线或补丁(或无构建戳记),按依赖闭包重建' : '分叉 CLI 产物缺失,按依赖闭包构建');
  const turboBin = resolve(zcodeRoot, 'node_modules', '.bin', 'turbo');
  const cliWorkspace = resolve(zcodeRoot, 'apps/zcode-cli');
  if (existsSync(turboBin)) {
    run(turboBin, ['run', 'build', '--filter=@zcode/cli...'], { cwd: cliWorkspace, env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
  } else {
    run('pnpm', ['--filter', '@zcode/cli', 'build'], { env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
  }
  writeStamp(stampPath, fingerprint);
}

async function installCli() {
  await ensureCli();
  const { copyFileSync, mkdirSync } = await import('node:fs');
  const { homedir } = await import('node:os');
  const destDir = resolve(homedir(), '.hermes', 'ycode');
  const dest = resolve(destDir, 'zcode.cjs');
  mkdirSync(destDir, { recursive: true });
  copyFileSync(CLI_ENTRY, dest);
  log('install-cli', `已安装分叉 CLI: ${dest}(ACP 桥设 ZCODE_BIN=${dest} 即用)`);
}

// 直跑守卫:测试 import 本模块(断言构建指纹判定)不触发安装/构建/拉起。
const isDirectRun = process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
const mode = process.argv[2] ?? 'serve';
if (isDirectRun && mode === 'ensure') await ensure();
else if (isDirectRun && mode === 'serve') await serve();
else if (isDirectRun && mode === 'install-cli') await installCli();
else if (isDirectRun) { console.error(`未知参数: ${mode}(可用 ensure|serve|install-cli)`); process.exit(1); }
