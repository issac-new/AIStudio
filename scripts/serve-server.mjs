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
import { existsSync, lstatSync } from 'fs';
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
// ncwk 根（Z5 同款修法，与 deploy-agent-runtime.mjs 对齐）：worktree 检出
// （.claude/worktrees/<x>，如 serve-main）与主检出（ncwk/overlay）层级不同，
// 固定层数回溯（overlayRoot/../../）在 serve-main 位起服时差一层——OBS_SIM_ROOT/
// GOVERNANCE_REPO 解析落空，仿真中心/治理台账整族 fail-closed（2026-10-22 升级轮
// serve-main 重启实锤，当时靠显式 env 兜底拉起）。向上锚定首个含**真实** upstream/
// 目录的祖先（lstat 不随软链，跳过 worktree 内的 upstream 软链）；锚不到回落旧行为。
const ncwkRoot = (() => {
  for (let d = resolve(overlayRoot); ; d = resolve(d, '..')) {
    try { if (lstatSync(resolve(d, 'upstream')).isDirectory()) return d; } catch { /* 不是，继续向上 */ }
    if (resolve(d, '..') === d) return null;
  }
})();
// OVERLAY_UPSTREAM_ROOT：私有上游隔离（与 inject.mjs 同一基建；语义=upstream 根）
const upstream = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? resolve(process.env.OVERLAY_UPSTREAM_ROOT.trim(), 'hermes-studio')
  : resolve(overlayRoot, '..', 'upstream', 'hermes-studio');

process.env.TS_NODE_PROJECT = 'packages/server/tsconfig.json';
process.env.TS_NODE_FILES = '1';
process.env.PORT = port;
// 推演执行面根（SIM_ROOT）：仿真中心族（run-state/topology/issues/quality/delivery…
// 的 fail-closed 门）。缺省工作区同级目录 lab/ncwk-sim-mux（存在才设；显式 env
// 尊重不动）——否则 npm run serve 起服务后整族 503「OBS_SIM_ROOT 缺席」，页面
// 功能全不可用。
if (!process.env.OBS_SIM_ROOT?.trim()) {
  // SIM_ROOT 是 ncwk 工作区的兄弟目录（lab/ncwk-sim-mux），不是 ncwk 内子目录；
  // 从 ncwk 根向上一级取兄弟（serve-main 等 worktree 位同样成立）。
  const simRoot = ncwkRoot ? resolve(ncwkRoot, '..', 'ncwk-sim-mux') : resolve(overlayRoot, '..', '..', 'ncwk-sim-mux');
  if (existsSync(simRoot)) process.env.OBS_SIM_ROOT = simRoot;
}
// 仿真中心专用门配套缺省（回归轮残留 R1）：中央仓 = SIM_ROOT/central/aipaydev
//（分支新鲜度 branches 与证据 commit 锚 anchor 共用同一仓）。存在才设；显式
// env 尊重不动——缺席时两端点按 fail-closed 语义 503，行为不变。
if (process.env.OBS_SIM_ROOT) {
  const central = resolve(process.env.OBS_SIM_ROOT, 'central', 'aipaydev');
  if (existsSync(central)) {
    if (!process.env.SIM_BRANCHES_REPO?.trim()) process.env.SIM_BRANCHES_REPO = central;
    if (!process.env.SIM_ANCHOR_REPO?.trim()) process.env.SIM_ANCHOR_REPO = central;
  }
}
// D20 治理台账仓落点（org/roster/invites 等 registry 的 git 仓）。缺省链（2026-10-22
// 用户裁定「开发测试统一指推演仓」）：显式 GOVERNANCE_REPO 尊重不动（生产部署指
// 生产仓）；否则推演中央仓存在时缺省指它——开发测试机的组织台账唯一有数据的
// 来源在推演仓（run22 十五人编制），此前缺省指空生产仓致驾驶舱组织/账号页空表
//（2026-10-22 事故）；两者皆缺回落工作区生产仓 ncwk/governance（空表占位，真实
// 编制投产时启用；remote=github.com/issac-new/governance）。
if (!process.env.GOVERNANCE_REPO?.trim()) {
  const centralGov = process.env.OBS_SIM_ROOT
    ? resolve(process.env.OBS_SIM_ROOT, 'central', 'aipaydev')
    : '';
  if (centralGov && existsSync(centralGov)) {
    process.env.GOVERNANCE_REPO = centralGov;
  } else {
    process.env.GOVERNANCE_REPO = ncwkRoot ? resolve(ncwkRoot, 'governance') : resolve(overlayRoot, '..', 'governance');
  }
}

console.log(`[serve-server] PORT=${port}`);
console.log(`[serve-server] GOVERNANCE_REPO=${process.env.GOVERNANCE_REPO}`);
console.log(`[serve-server] OBS_SIM_ROOT=${process.env.OBS_SIM_ROOT || '(未配置——仿真中心 fail-closed)'}`);
console.log(`[serve-server] SIM_BRANCHES_REPO=${process.env.SIM_BRANCHES_REPO || '(未配置——分支交付 fail-closed)'}`);
console.log(`[serve-server] TS_NODE_PROJECT=${process.env.TS_NODE_PROJECT}`);
console.log(`[serve-server] TS_NODE_FILES=${process.env.TS_NODE_FILES}`);
console.log(`[serve-server] starting: node -r ts-node/register ${upstream}/packages/server/src/index.ts`);

if (!existsSync(resolve(upstream, 'packages', 'server', 'src', 'index.ts'))) {
  console.error(`[serve-server] 上游入口缺失: ${upstream}/packages/server/src/index.ts —— 先完成 upstream 克隆与 npm run inject`);
  process.exit(1);
}

// 与 .sh 版 exec 语义对齐:子进程替换自身stdio,Ctrl+C 传导,退出码透传。
const child = spawn(
  process.execPath,
  ['-r', 'ts-node/register', 'packages/server/src/index.ts'],
  { cwd: upstream, stdio: 'inherit', env: process.env, windowsHide: true },
);

// spawn 失败(如 ts-node 缺失)默认发 unhandled 'error' 裸栈崩溃,给可读指引
child.on('error', (err) => {
  console.error(`[serve-server] 启动失败: ${err.message} —— 检查 upstream 依赖是否安装(ts-node)`);
  process.exit(1);
});

child.on('close', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
