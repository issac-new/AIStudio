// overlay/scripts/zcode-engine.mjs
// zcode 引擎服务接入脚本（2026-09-23 源码底座轮 R2）。
// 用法:
//   node scripts/zcode-engine.mjs ensure   # 依赖+构建产物就绪(缺失才补)
//   node scripts/zcode-engine.mjs serve    # ensure + 前台拉起引擎服务(:3030)
//
// 语义:
//   - ensure 幂等:node_modules 与 dist 产物任一缺失才执行安装/构建,
//     已就绪时秒回(不重复 pnpm install)。
//   - pnpm install 必须 ELECTRON_SKIP_BINARY_DOWNLOAD=1(否则 electron
//     postinstall 挂死 GitHub 源,R1 实证);桌面构建需求另行全量装。
//   - serve 前台托管(stdio inherit,Ctrl+C 传导);:3030 已被监听视为
//     引擎已在跑,不重复拉起(幂等)。
import { spawn, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { createConnection } from 'net';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const zcodeRoot = resolve(overlayRoot, '..', 'upstream', 'zcode');
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
  if (!existsSync(serverEntry)) {
    log('ensure', 'packages/server 构建产物缺失,执行最小面构建');
    run('pnpm', ['--filter', '@zcode/server', 'run', 'build'], { env: { ...process.env, ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } });
  } else {
    log('ensure', '依赖与构建产物已就绪');
  }
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

const mode = process.argv[2] ?? 'serve';
if (mode === 'ensure') await ensure();
else if (mode === 'serve') await serve();
else { console.error(`未知参数: ${mode}(可用 ensure|serve)`); process.exit(1); }
