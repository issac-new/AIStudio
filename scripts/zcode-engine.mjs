// overlay/scripts/zcode-engine.mjs
// zcode 引擎服务接入脚本（2026-09-23 源码底座轮 R2）。
// 用法:
//   node scripts/zcode-engine.mjs ensure   # 依赖+构建产物就绪(依赖以锁文件为准,产物缺失才补)
//   node scripts/zcode-engine.mjs serve    # ensure + 前台拉起引擎服务(:3030)
//
// 语义:
//   - ensure 幂等:依赖以锁文件为准——node_modules 在、且其中记录的指纹与当前
//     pnpm-lock.yaml 的摘要一致才算就绪;否则补装。dist 产物缺失才构建。
//     已就绪时秒回(不重复 pnpm install)。
//   - pnpm install 必须 ELECTRON_SKIP_BINARY_DOWNLOAD=1(否则 electron
//     postinstall 挂死 GitHub 源,R1 实证);桌面构建需求另行全量装。
//   - serve 前台托管(stdio inherit,Ctrl+C 传导);:3030 已被监听视为
//     引擎已在跑,不重复拉起(幂等)。
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createConnection } from 'net';
import { resolve } from 'path';

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

// allowFailure：命令失败时不退出进程，返回 false，由调用方决定是否带着现有产物继续。
function run(cmd, args, opts = {}) {
  const { allowFailure = false, ...spawnOpts } = opts;
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: zcodeRoot, ...spawnOpts });
  if (r.status !== 0) {
    console.error(`[zcode-engine] 命令失败(exit ${r.status}): ${cmd} ${args.join(' ')}`);
    if (allowFailure) return false;
    process.exit(1);
  }
  return true;
}

const lockfile = resolve(zcodeRoot, 'pnpm-lock.yaml');
// 依赖就绪指纹：记上一次装依赖时锁文件的摘要，放在 node_modules 里与它同生同灭。
const lockStamp = resolve(zcodeRoot, 'node_modules', '.aistudio-lock-sha256');

function lockfileDigest() {
  return createHash('sha256').update(readFileSync(lockfile)).digest('hex');
}

// 依赖是否就绪以锁文件为准。只看目录在不在的旧判据认不出锁文件变化（基线升级、
// zcode-patch 013 一类的依赖安全刷新），已有安装会一直带着旧依赖跑。
// 指纹文件缺失按“未知”处理：补装一次由 pnpm 判定，锁文件没变时只多花几秒。
// 锁文件本身不存在时退回只看目录——没有锁文件就无法比对，也不该用冻结模式安装。
function missingDependencies() {
  if (!existsSync(resolve(zcodeRoot, 'node_modules'))) return 'node_modules 缺失';
  if (!existsSync(lockfile)) return null;
  if (!existsSync(lockStamp)) return '依赖就绪指纹缺失';
  if (readFileSync(lockStamp, 'utf8').trim() !== lockfileDigest()) return '锁文件已变化';
  return null;
}

// 返回是否装成；装成才写指纹，失败则下次启动重试。
function installDependencies(reason, tag) {
  const frozen = existsSync(lockfile);
  log(tag, `${reason},执行 pnpm install${frozen ? ' --frozen-lockfile' : ''}(跳过 electron 二进制)`);
  const ok = run('pnpm', frozen ? ['install', '--frozen-lockfile', '--prefer-offline'] : ['install'],
    { env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' }, allowFailure: true });
  if (ok && existsSync(lockfile)) {
    writeFileSync(lockStamp, `${lockfileDigest()}\n`);
    // 依赖目录被替换时，已在运行的引擎进程内存里还是旧模块：提示重启，不替调用方杀进程。
    if (reason === '锁文件已变化') log(tag, '依赖已按新锁文件更新:正在运行的引擎要重启后才会用上新依赖');
  }
  return ok;
}

async function ensure() {
  if (!existsSync(zcodeRoot)) {
    console.error(`[zcode-engine] upstream/zcode 不存在: ${zcodeRoot} —— 先克隆(pin 见 zcode-foundation-design.md D1)`);
    process.exit(1);
  }
  const reason = missingDependencies();
  if (reason) {
    const ok = installDependencies(reason, 'ensure');
    // 目录整个缺失时装不上就是不可用，退出；只是锁文件变了而补装失败（多为离线）时，
    // 带着现有依赖继续——指纹不写，下次启动重试。可用性优先，但日志说明依赖可能落后于锁文件。
    if (!ok && !existsSync(resolve(zcodeRoot, 'node_modules'))) process.exit(1);
    if (!ok) log('ensure', '依赖补装未完成:继续使用现有依赖(可能与锁文件不一致,联网后重试会自动补装)');
  }
  if (!existsSync(serverEntry)) {
    log('ensure', 'packages/server 构建产物缺失,执行最小面构建');
    run('pnpm', ['--filter', '@zcode/server', 'run', 'build'], { env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
  } else {
    log('ensure', '依赖与构建产物已就绪');
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
  const reason = missingDependencies();
  if (reason) {
    const ok = installDependencies(reason, 'install-cli');
    if (!ok && !existsSync(resolve(zcodeRoot, 'node_modules'))) process.exit(1);
  }
  if (existsSync(CLI_ENTRY)) {
    log('install-cli', '分叉 CLI 构建产物已就绪');
    return;
  }
  // CLI 依赖工作区包（@zcode/core、@zcode/i18n 等）的 dist——必须按依赖闭包
  // 构建：turbo 在 apps/zcode-cli 工作区（turbo.json 在该层），二进制借用
  // monorepo 根 node_modules/.bin/turbo（app 层 PATH 无 turbo，实测）。
  log('install-cli', '分叉 CLI 产物缺失,按依赖闭包构建');
  const turboBin = resolve(zcodeRoot, 'node_modules', '.bin', 'turbo');
  const cliWorkspace = resolve(zcodeRoot, 'apps/zcode-cli');
  if (existsSync(turboBin)) {
    run(turboBin, ['run', 'build', '--filter=@zcode/cli...'], { cwd: cliWorkspace, env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
  } else {
    run('pnpm', ['--filter', '@zcode/cli', 'build'], { env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
  }
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

const mode = process.argv[2] ?? 'serve';
if (mode === 'ensure') await ensure();
else if (mode === 'serve') await serve();
else if (mode === 'install-cli') await installCli();
else { console.error(`未知参数: ${mode}(可用 ensure|serve|install-cli)`); process.exit(1); }
