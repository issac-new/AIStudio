// overlay/scripts/serve-server.mjs
// Hermes Studio 后端服务启动脚本(跨平台版,serve-server.sh 的 Node 移植)。
// 用途:包装 upstream 的 server 启动,设置正确的 tsconfig 路径避免 TS 编译错误。
// 用法:npm run serve [-- --port PORT]  (或 PORT 环境变量,默认 8647)
//
// 背景:.sh 版依赖 bash([[ ]]、exec、dirname),cmd.exe 无法直接运行;
// Windows 部署走本文件。环境变量语义与 .sh 版完全一致:
//   TS_NODE_PROJECT=packages/server/tsconfig.json
//   TS_NODE_FILES=1 —— 让 ts-node 走完整项目编译(而非默认按需 require)。
//   默认模式下 @types/node 丢失(TS2591)、custom/server 内同目录的 .d.ts 模块
//   声明(如 proper-lockfile.d.ts)不拾取(TS7016);v0.7.22 起 custom/server
//   新增 loop/store/local-store.ts 首次把该缺项暴露为启动失败。
import { spawn } from 'child_process';
import { resolve } from 'path';

const args = process.argv.slice(2);
let port = process.env.PORT || '8647';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    port = args[i + 1];
    i++;
  } else {
    console.error(`未知参数: ${args[i]}`);
    process.exit(1);
  }
}

const overlayRoot = resolve(import.meta.dirname, '..');
const upstream = resolve(overlayRoot, '..', 'upstream', 'hermes-studio');

process.env.TS_NODE_PROJECT = 'packages/server/tsconfig.json';
process.env.TS_NODE_FILES = '1';
process.env.PORT = port;

console.log(`[serve-server] PORT=${port}`);
console.log(`[serve-server] TS_NODE_PROJECT=${process.env.TS_NODE_PROJECT}`);
console.log(`[serve-server] TS_NODE_FILES=${process.env.TS_NODE_FILES}`);
console.log(`[serve-server] starting: node -r ts-node/register ${upstream}/packages/server/src/index.ts`);

// 与 .sh 版 exec 语义对齐:子进程替换自身stdio,Ctrl+C 传导,退出码透传。
const child = spawn(
  process.execPath,
  ['-r', 'ts-node/register', 'packages/server/src/index.ts'],
  { cwd: upstream, stdio: 'inherit', env: process.env, windowsHide: true },
);

child.on('close', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
