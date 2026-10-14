// overlay/scripts/inject.mjs
// 职责:1) 应用 B 类 patch(git apply) 2) 生成 overlay 派生构建 config
// 幂等;--clean 反向还原。不触碰上游 .git。
//
// patch 体系两套(按目录路由,不用路径前缀——zcode 的 packages/apps 前缀
// 与 hermes-agent 的路由前缀冲突,目录是唯一无歧义事实源):
//   patches/            → hermes-studio / hermes-agent(前缀路由,见 resolvePatchTargetRoot)
//   zcode-patches/      → upstream/zcode(全部;2026-09-23 zcode 源码底座轮起)
// zcode 与 hermes-agent 同为"与 hermes-studio 构建无关"的可选树,失败容错跳过。
//
// 注意:本脚本用 node 直跑(.mjs),不依赖 ts 加载器,因此路径在此内联计算,
// 与 config/bootstrap.ts 保持一致(如需改路径,两处同步)。
import { readFileSync, writeFileSync, existsSync, symlinkSync, lstatSync, unlinkSync, realpathSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

// realpathSync：worktree 场景（.claude/worktrees/<feat>/ 经符号链接指回
// upstream）必须取真实绝对路径，否则 vite 会因 root(realpath) 与输入
// html(符号链接路径) 不一致而构建失败（emitFile 相对路径逃逸）。
// 路径不存在时 realpath 抛 ENOENT——回退原样解析，交由 main() 的
// 存在性守卫输出友好报错（2026-09-17 评审：不得在模块顶层裸抛）。
const realpathOrSelf = (p) => {
  try { return realpathSync(p); } catch { return p; }
};
const overlayRoot = realpathOrSelf(resolve(import.meta.dirname, '..'));
const ncwkRoot = resolve(overlayRoot, '..');
// OVERLAY_UPSTREAM_ROOT：私有上游隔离（design-review 轮记档基建恢复）——
// inject 目标指向独立副本，不触碰 ncwk 共享 upstream。缺省行为不变。
const upstreamRoot = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? realpathOrSelf(resolve(process.env.OVERLAY_UPSTREAM_ROOT.trim()))
  : realpathOrSelf(resolve(ncwkRoot, 'upstream'));
const hermesStudioRoot = resolve(upstreamRoot, 'hermes-studio');
const hermesAgentRoot = resolve(upstreamRoot, 'hermes-agent');
const zcodeRoot = resolve(upstreamRoot, 'zcode');
const zcodePatchDir = resolve(overlayRoot, 'zcode-patches');
const zcodeSeriesFile = resolve(zcodePatchDir, 'series');
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

// 2026-10-14 全量回归轮防复发闸（当日 P0 根因封堵）：clean 是运行树手术（反向补丁、
// 移除 src/custom 链接），在 live server（8647 ts-node）运行中执行会留下「进程内旧模块
// 缓存 + 树已变」的分裂态；若并行操作还重写了其 SQLite 库文件，进程内 schema 缓存会被
// 永久污染（2026-10-13 夜实测：malformed database schema 每秒报错 8k+ 条、登录 500，
// 次日回归轮方定位修复）。clean 前探测 8647 监听：在听即拒绝退出；确需带服清理，
// 显式设 OVERLAY_ALLOW_LIVE_CLEAN=1 豁免并自担重启换装责任。
function liveStudioServerListening() {
  if (process.env.OVERLAY_ALLOW_LIVE_CLEAN === '1') return false;
  try {
    const out = execSync(
      'node -e "const n=require(\'node:net\');const s=n.connect(8647,\'127.0.0.1\');s.on(\'connect\',()=>{console.log(\'UP\');s.destroy();process.exit(0)});s.on(\'error\',()=>process.exit(1));setTimeout(()=>process.exit(1),1200)"',
      { stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 },
    ).toString();
    return out.includes('UP');
  } catch {
    return false;
  }
}
if (mode === 'clean' && liveStudioServerListening()) {
  console.error('[clean] 拒绝执行：检测到 8647 端口有 SwarmStudio server 在运行。');
  console.error('[clean] 带服 clean 会造成运行进程与树状态分裂（模块缓存/库句柄悬空），');
  console.error('[clean] 2026-10-13 夜间曾因此触发 server SQLite schema 缓存污染（登录 500）。');
  console.error('[clean] 请先停服再 clean；确需带服清理请设 OVERLAY_ALLOW_LIVE_CLEAN=1。');
  process.exit(1);
}

function git(args, cwd) {
  return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

// 生成的 TS config 里嵌入路径的字符串字面量:JSON.stringify 保证 Windows 反斜杠
// 被正确转义。裸 '${path}' 插值下 C:\repo 会被解析成 \r 回车/未知转义吞反斜杠,
// 生成的 vite.config.overlay.ts 路径损坏,dev/build 全链在配置加载即崩。
export const js = (p) => JSON.stringify(p);

// Windows:Git for Windows 默认 core.autocrlf=true 时工作树为 CRLF 而 patch 上下文
// 为 LF,首个内容 patch 即 does not apply。--ignore-whitespace 仅在 win32 启用,
// POSIX 保持严格匹配、不放松现有门禁。
const win32WsFlag = () => (process.platform === 'win32' ? ' --ignore-whitespace' : '');

function readSeries() {
  if (!existsSync(patchSeriesFile)) return [];
  const raw = readFileSync(patchSeriesFile, 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// hermes-agent 特有的路径前缀 → patch 路由到 hermes-agent,其余落 hermes-studio。
// apply/clean/ensure-injected 三方共用(此前三处内联重复,2026-09-23 收敛为单一
// 事实源:本清单 + isHermesAgentPatchPath 谓词,ensure-injected.mjs import 复用)。
//   - hermes_cli/ plugins/ agent/ apps/ assets/ acp_:基础路由(patch 117-118 起)
//   - gateway/ tests/gateway/ tests/hermes_cli/:见 patch 250/273
//   - optional-mcps/ optional-skills/:基础运行时目录清单(patch 375 起,
//     semantica MCP 目录条目等)。tests/ 其余子树属于 hermes-studio,禁止整段路由。
//   - tools/ tests/tools/ tests/agent/:hermes-agent 工具面与对应测试(patch 395/406 起,
//     395 靠首段 agent/ 前缀侥幸路由；406 首段 tools/ 路由到 studio 报
//     "No such file or directory"后显式补齐)。
// 注意：scripts/aipay/aipay-agent-sync.sh 的 AGENT_PREFIXES 是本清单的 shell 镜像
// (安装树部署用),改这里必须同步它——2a02847 补齐 tools//tests/tools//tests/agent/ 时
// 漏了 shell 副本,tools/ 开头的 patch 被静默跳过(候选 0 exit 0 无告警)。
export const HERMES_AGENT_PATCH_PREFIXES = [
  'hermes_cli/', 'plugins/', 'agent/', 'apps/', 'assets/', 'acp_',
  'gateway/', 'tests/gateway/', 'tests/hermes_cli/',
  'optional-mcps/', 'optional-skills/',
  'tools/', 'tests/tools/', 'tests/agent/',
  // hermes-agent 仓库根层的 hermes_state_*.py 族(patch 485 起):studio 无此文件,
  // 误路由 studio 会因 "No such file" 硬失败阻断整个 inject。
  'hermes_state',
  // 根层 model_tools.py(patch 593 起):同上——593 曾被误路由到 studio,下次 inject
  // 在 "No such file" 上硬死(长会话治理轮发现的拦路雷,此处根治;shell 镜像同步改)。
  'model_tools.py',
  // 根层 toolsets.py(patch 611 起):同上——obs_recall 进 _HERMES_CORE_TOOLS 的补丁
  // 宿主在 hermes-agent 根层,误路由 studio 同样硬死(SoL-Pi 效能轮)。
  'toolsets.py',
  // tests/ 根层 home_io_guard.py(patch 620 起):agent 测试文件在 tests/ 根层(非
  // tests/agent/),首段 tests/ 落 studio 桶"No such file"硬死——run19 根治件 620
  // 首次触发;文件级条目先例同 model_tools.py/toolsets.py。
  'tests/home_io_guard.py',
];

/** patch 目标路径(---/+++ 后的首段)是否路由到 hermes-agent。 */
export function isHermesAgentPatchPath(targetPath) {
  return HERMES_AGENT_PATCH_PREFIXES.some((p) => targetPath.startsWith(p));
}

// 由 patch 文本首个 ---/+++ 目标路径判定路由目标根目录。
// 解析失败(读不到/无目标行)时默认 hermes-studio,与历史行为一致。
// 2026-10-11 长会话治理轮补:594/595/596/599/600 等手写补丁无 ---/+++ 头(仅
// diff --git + hunk),正则匹配不到即误路由 studio 硬死——加 diff --git 行回退,
// 两处取首个 [ab]/ 路径,语义一致。
export function resolvePatchTargetRoot(patchText) {
  let targetPath = null;
  const headerMatch = patchText.match(/^(?:---|\+\+\+) [ab]\/(.+?)$/m);
  if (headerMatch) {
    targetPath = headerMatch[1];
  } else {
    const gitLineMatch = patchText.match(/^diff --git a\/(.+?) b\/.+$/m);
    if (gitLineMatch) targetPath = gitLineMatch[1];
  }
  if (!targetPath) return hermesStudioRoot;
  return isHermesAgentPatchPath(targetPath) ? hermesAgentRoot : hermesStudioRoot;
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
	    // 判断 patch 目标：hermes-agent 还是 hermes-studio（规则单一事实源见 resolvePatchTargetRoot）
	    let targetRoot = hermesStudioRoot;
	    try {
	      const patchText = readFileSync(patchPath, 'utf8');
	      targetRoot = resolvePatchTargetRoot(patchText);
	    } catch { /* 读取失败时使用默认 hermesStudioRoot */ }

    try {
      git(`apply --whitespace=nowarn${win32WsFlag()} "${patchPath}"`, targetRoot);
      console.log(`[inject] applied patch: ${p} (to ${targetRoot === hermesAgentRoot ? 'hermes-agent' : 'hermes-studio'})`);
    } catch (e) {
      // hermes-agent 的 patch 失败时容错跳过（与桌面应用构建无关，不影响 hermes-studio）
      if (targetRoot === hermesAgentRoot) {
        console.warn(`[inject] WARN: hermes-agent patch 失败,跳过: ${p}`);
        const stderrStr = typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString?.() || '');
        console.warn(`  ${stderrStr.trim() || e.message}`);
        continue;
      }
      console.error(`[inject] FAILED to apply patch: ${p}`);
      console.error(`  message: ${e.message}`);
      console.error(`  stderr: ${e.stderr}`);
      console.error('  用 git apply --reject 手动排查,修复后重跑');
      process.exit(1);
    }
  }
  return patches;
}

function reversePatches(patches) {  for (const p of [...patches].reverse()) {
    const patchPath = resolve(patchDir, p);
    if (!existsSync(patchPath)) {
      console.warn(`[clean] WARN: patch 文件不存在,跳过: ${p}`);
      continue;
    }
    // 判断 patch 目标：hermes-agent 还是 hermes-studio（规则单一事实源见 resolvePatchTargetRoot）
    let targetRoot = hermesStudioRoot;
    try {
      const patchText = readFileSync(patchPath, 'utf8');
      targetRoot = resolvePatchTargetRoot(patchText);
    } catch { /* 读取失败时使用默认 hermesStudioRoot */ }
    try {
      git(`apply --reverse --whitespace=nowarn${win32WsFlag()} "${patchPath}"`, targetRoot);
      console.log(`[clean] reversed patch: ${p} (from ${targetRoot === hermesAgentRoot ? 'hermes-agent' : 'hermes-studio'})`);
    } catch {
      // hermes-agent patch 反向失败时容错跳过
      if (targetRoot === hermesAgentRoot) {
        console.warn(`[clean] WARN: hermes-agent patch 反向失败,跳过: ${p}`);
        continue;
      }
      // 反向失败不中断：untracked patch 产物清理必须执行（否则 inject 死循环），
      // tracked 残留由随后的 git checkout / restore 步兜底。
      console.warn(`[clean] WARN: patch 反向失败,继续 untracked 清理: ${p}`);
    }
  }
}

// ── zcode patch 管线(目录路由,全部进 upstream/zcode;容错语义同 hermes-agent) ──

function readZcodeSeries() {
  if (!existsSync(zcodeSeriesFile)) return [];
  return readFileSync(zcodeSeriesFile, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/** 解析 zcode patch 文本里的新增文件(clean 时 git apply -R 不删新文件,须手动清)。 */
function zcodePatchNewFiles(patchText) {
  const files = [];
  const lines = patchText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^diff --git a\/(.+) b\/(.+)$/);
    if (m && /^new file mode/.test(lines[i + 1] ?? '')) files.push(m[2]);
  }
  return files;
}

function applyZcodePatches() {
  if (!existsSync(zcodeRoot)) return [];
  const patches = readZcodeSeries();
  for (const p of patches) {
    const patchPath = resolve(zcodePatchDir, p);
    if (!existsSync(patchPath)) {
      console.error(`[inject] FAILED: zcode patch 文件不存在: ${p}`);
      process.exit(1);
    }
    try {
      git(`apply --whitespace=nowarn${win32WsFlag()} "${patchPath}"`, zcodeRoot);
      console.log(`[inject] applied zcode patch: ${p} (to zcode)`);
    } catch (e) {
      // zcode 与 hermes-studio 构建无关,失败容错跳过(同 hermes-agent 语义)
      console.warn(`[inject] WARN: zcode patch 失败,跳过: ${p}`);
      const stderrStr = typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString?.() || '');
      console.warn(`  ${stderrStr.trim() || e.message}`);
    }
  }
  return patches;
}

function reverseZcodePatches(patches) {
  if (!existsSync(zcodeRoot)) return;
  for (const p of [...patches].reverse()) {
    const patchPath = resolve(zcodePatchDir, p);
    if (!existsSync(patchPath)) {
      console.warn(`[clean] WARN: zcode patch 文件不存在,跳过: ${p}`);
      continue;
    }
    try {
      git(`apply --reverse --whitespace=nowarn${win32WsFlag()} "${patchPath}"`, zcodeRoot);
      console.log(`[clean] reversed zcode patch: ${p} (from zcode)`);
    } catch {
      console.warn(`[clean] WARN: zcode patch 反向失败,跳过: ${p}`);
    }
  }
  // 删除 patch 新增的 untracked 文件(zcode 树内)
  for (const p of patches) {
    const patchPath = resolve(zcodePatchDir, p);
    if (!existsSync(patchPath)) continue;
    for (const f of zcodePatchNewFiles(readFileSync(patchPath, 'utf8'))) {
      const abs = resolve(zcodeRoot, f);
      try {
        if (existsSync(abs) && !lstatSync(abs).isSymbolicLink()) {
          unlinkSync(abs);
          console.log(`[clean] removed zcode patch-added file: ${f}`);
        }
      } catch { /* 已删或权限问题,跳过 */ }
    }
  }
}

export function generateOverlayViteConfig() {
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
import vue from '@vitejs/plugin-vue';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import upstream from ${js(upstreamViteConfig)};

// 裸包名钉单一实例用的根（alias 行引用；此前模板只用法不定义——生成的配置
// 一加载即 ReferenceError: hermesStudioRoot is not defined，dev/build 全断）。
const hermesStudioRoot = ${js(hermesStudioRoot)};

const upstreamCfg =
  typeof upstream === 'function'
    ? upstream({ command: 'serve', mode: 'development' })
    : upstream;

// 环境级根治(B3)：compiler-sfc 解析 <script setup> 导入类型(defineProps<NodeProps<..>> 等)
// 时默认取 ts.sys;本仓 typescript 是 7.x 预览版,compiler-sfc 3.5.x 的 ts.sys 自动探测在其
// 模块结构下失效 → 抛 "No fs option ... non-Node environment",全量构建在 WorkflowAgentNode
// 处断裂。此处显式注入 node:fs 适配器替代 ts.sys 自动探测,一次性覆盖全仓导入类型 defineProps。
// (上游 vite.config 的 vue() 为裸调用无选项,故原位替换不丢配置;若上游日后加选项需同步合并。)
const sfcFs = {
  fileExists: (f) => { try { return existsSync(f); } catch { return false; } },
  readFile: (f) => { try { return readFileSync(f, 'utf8'); } catch { return undefined; } },
  realpath: (f) => { try { return realpathSync(f); } catch { return f; } },
};
const withVueFs = (cfg) => ({
  ...cfg,
  plugins: (cfg.plugins ?? []).map((p) =>
    p && p.name === 'vite:vue' ? vue({ script: { fs: sfcFs } }) : p,
  ),
});

export default mergeConfig(
  withVueFs(upstreamCfg),
  defineConfig({
    // 关键:覆盖上游的相对 root/packages/client,改为绝对上游路径。
    // 上游 config 用相对路径,mergeConfig 后会被当作相对 overlay 解析(错)。
    root: ${js(upstreamClientRoot)},
    publicDir: resolve(${js(upstreamClientRoot)}, 'public'),
    resolve: {
      // 用数组形式 alias(保证顺序:更具体的前缀先匹配)。
      // Vite 对象形式 alias 不保证顺序;数组形式按声明顺序匹配,故 '@/custom' 必须在 '@' 前。
      alias: [
        // 双实例根治（run19 白屏实锤）：overlay/node_modules 是指向 .reg-clone 的
        // 符号链接（另一份依赖树）——entry/custom 解析到 .reg-clone 的 pinia/vue，
        // 上游组件解析到 hermes-studio 的，双实例 app.use(A)/useStore 查 B →
        // activePinia undefined → '._s' TypeError → 根组件空渲染白屏。裸包名钉到
        // 上游树单一实例（deep import 不受影响）。
        { find: /^pinia$/, replacement: hermesStudioRoot + '/node_modules/pinia/dist/pinia.mjs' },
        { find: /^vue$/, replacement: hermesStudioRoot + '/node_modules/vue/dist/vue.runtime.esm-bundler.js' },
        // 子路径钉单（run19 采集壳页实锤，双实例第二例）：/^vue$/ 只精确匹配裸名，
        // 'vue/xxx' 子路径与 '@vue/runtime-core'（pinia/vue-router 内部依赖）不经锚定——
        // 两树并存期（node_modules 符号链接被 npm 拆成实体目录的窗口）解析出双
        // runtime-core → useRoute() inject 落空 undefined → IaShell 'reading query'
        // TypeError 杀渲染树=主区域纯黑空骨架（采集帧 29.3K 同像素壳页族）。
        // vue-router 同钉（双 router 实例同症）。
        { find: /^@vue\/runtime-core$/, replacement: hermesStudioRoot + '/node_modules/@vue/runtime-core/dist/runtime-core.esm-bundler.js' },
        { find: /^vue-router$/, replacement: hermesStudioRoot + '/node_modules/vue-router/dist/vue-router.mjs' },
        // /src/main.ts(index.html 的入口)→ overlay entry shim(复制上游 main.ts 启动序列 + A 类注册)。
        // 用字符串精确匹配 index.html 里的 /src/main.ts,使 Vite 以 index.html 为入口、
        // 但把 main 重定向到 overlay shim(保留 HTML 处理,生成 index.html)。
        // (字符串 find 做精确匹配;正则在模板插值里转义易错,故不用 RegExp。)
        { find: '/src/main.ts', replacement: ${js(overlayClientEntry)} },
        { find: '@/custom', replacement: ${js(overlayCustomClient)} },
        { find: '@custom', replacement: ${js(overlayCustomClient)} },
        { find: '@registries', replacement: ${js(overlayRegistries)} },
        // @ 兜底指向上游 client src(@/api、@/views、@/components 等解析到上游)
        { find: '@', replacement: ${js(upstreamClientSrc)} },
      ],
    },
    // outDir 必须显式覆盖为上游 dist/client 的绝对路径——上游 config 用相对
    // '../../dist/client',mergeConfig 后会相对 overlay 解析(错)。desktop 构建读此目录。
    // input 显式指向上游 index.html:覆盖 root 后,Vite 默认从 <root>/index.html 发现入口
    // 可能失效,显式 input 保证 HTML 被处理、生成 dist/client/index.html。
    build: {
      outDir: ${js(upstreamDistClient)},
      rollupOptions: {
        input: resolve(${js(upstreamClientRoot)}, 'index.html'),
        output: {
          // run19 采集壳页终因（vite8/rolldown 1.0.2 + echarts 6）：懒加载 chunk 引用
          // echarts/zrender 模块初始化器（init_Component 族裸调用）时 rolldown 分 chunk
          // 系统性漏补 import——TasksView/RunTraceOverview 等每个 echarts 消费 chunk 逐个
          // 中招（advancedChunks 归组只治一个换一个，实测 TasksView 修好 RunTraceOverview
          // 又炸）。inlineDynamicImports 全并单 chunk 消灭跨 chunk 面（SIM 内网环境，
          // 体积换稳定；实测 assets/js 收敛为单文件，board 页完整渲染 361K 真帧）。
          inlineDynamicImports: true,
        },
      },
    },
    server: {
      // fs.allow 显式双根（V4 轮实锤）：root 指到 upstream 后 vite 默认
      // searchForWorkspaceRoot 只放行 upstream 树——alias 解析出的 overlay
      // /@fs 模块（entry shim/custom 全部 A 类资产）被 403，A 类注册链路死，
      // 应用以上游裸模式启动（ia2 路由缺失 → #/app 命中 catch-all 重定向环）。
      // 显式放行 overlay 根 + upstream 根 + workspace 外层（node_modules 归属）。
      fs: {
        allow: [
          ${js(overlayRoot)},
          ${js(upstreamRoot)},
          ${js(resolve(upstreamRoot, 'hermes-studio'))},
        ],
      },
      proxy: {
        // G3 威胁面收口：vite dev 代理默认不带 X-Forwarded-For，经代理的 LAN 请求与
        // 本机直连在后端字节级不可区分，gateway-credentials 的回环闸会被本机代理放大。
        // 这里给上游代理键补 xfwd（mergeConfig 深合并，保留上游 target/configure）：
        // 代理如实转发客户端 IP，后端 routes.ts 的 XFF 闸即可拒绝非回环来源。
        '/api': { xfwd: true },
        '/v1': { xfwd: true },
        '/health': { xfwd: true },
        '/upload': { xfwd: true },
        '/socket.io': { xfwd: true },
        '/agent-health': {
          target: 'http://127.0.0.1:8650',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\\/agent-health/, '/health'),
          // hermes-agent v0.18.0 的 /health/detailed 需要 API_SERVER_KEY 认证。
          // 运行时从 ~/.hermes/.env 读取 key（gateway 启动也读同一文件），注入 Authorization header。
          configure: (proxy) => {
            let key = process.env.API_SERVER_KEY || ''
            if (!key) {
              try {
                const fs = require('fs')
                const envPath = require('path').join(require('os').homedir(), '.hermes', '.env')
                const m = fs.readFileSync(envPath, 'utf8').match(/^API_SERVER_KEY=(.+)$/m)
                if (m) key = m[1].trim()
              } catch { /* .env 不存在或读失败，忽略 */ }
            }
            proxy.on('proxyReq', (proxyReq) => {
              if (key) proxyReq.setHeader('Authorization', \`Bearer \${key}\`)
            })
          },
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
      // 'junction' 仅在 Windows 生效(目录联接,无需管理员/开发者模式即可建);
      // POSIX 下 type 参数被忽略,行为与原 symlink 完全一致。
      symlinkSync(upstreamNodeModules, overlayNodeModules, 'junction');
      console.log('[inject] linked overlay/node_modules → upstream/hermes-studio/node_modules');
    } catch (e) {
      // 失败必须可见:用户先在 overlay 跑过 npm install 时会留下真实(空)
      // node_modules/ 目录,旧的 existsSync 门会静默吞掉此告警,后续
      // dev/build/test 全部报 'vite 不是内部或外部命令',极难定位。
      console.warn('[inject] WARN: 无法创建 node_modules 链接:', e.message);
      if (!existsSync(overlayNodeModules)) {
        console.warn(`[inject]   Windows 手动兜底: mklink /J "${overlayNodeModules}" "${upstreamNodeModules}"`);
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
      // junction 同上:Windows 免特权目录链接。
      symlinkSync(overlayServerCustom, upstreamServerCustom, 'junction');
      console.log('[inject] linked upstream/.../server/src/custom → overlay/custom/server');
    } catch (e) {
      console.warn('[inject] WARN: 无法创建 server custom 链接:', e.message);
      if (!existsSync(upstreamServerCustom)) {
        console.warn(`[inject]   Windows 手动兜底: mklink /J "${upstreamServerCustom}" "${overlayServerCustom}"`);
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

// patch 会 touch 的文件集合（修改 + 新增），模块级缓存供 restore/precheck 共用。
let _patchTargetsCache = null;
function patchFileSets() {
  if (_patchTargetsCache) return _patchTargetsCache;
  const patchTargets = new Set();
  const patchNewFiles = new Set(); // patch 新增的 untracked 文件（--- /dev/null +++ b/path）
  for (const p of readSeries()) {
    try {
      const patchText = readFileSync(resolve(patchDir, p), 'utf8');
      const lines = patchText.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(/^(?:\+\+\+|---) b\/(.+)$/);
        if (m) patchTargets.add(m[1]);
        // 新文件：--- /dev/null 后跟 +++ b/path
        if (line.startsWith('--- /dev/null') && i + 1 < lines.length) {
          const m2 = lines[i + 1].match(/^\+\+\+ b\/(.+)$/);
          if (m2) patchNewFiles.add(m2[1]);
        }
      }
    } catch { /* patch 文件读取失败,跳过 */ }
  }
  _patchTargetsCache = { patchTargets, patchNewFiles };
  return _patchTargetsCache;
}

function restoreNonPatchArtifacts(label) {
  // 还原所有"非 patch 目标"的 build 产物(如 docs/openapi.json)到 HEAD。
  // 这些不是我们的 patch,留着会挡住 inject 的 dirty-check。
  const { patchTargets } = patchFileSets();
  // 注意:不能用 .trim() 再 split——porcelain 未暂存行前缀是 " M"(首空格),
  // 整体 trim 会吃掉第一行的前导空格,导致 startsWith(' M') 失配、
  // 首个脏文件(如 build 产物 docs/openapi.json)漏还原,inject 随后被自己的
  // dirty-check 挡住。只按行拆分并去掉行尾换行,保留行首状态位。
  git('status --porcelain', hermesStudioRoot)
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
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
    // 台账 #31:脏树校验前置——先探测,拒绝时零删除(旧序先删自身 symlink 再校验,
    // 校验失败会留下"半态":symlink 已删而 patch 未应用)。
    //    探测:porcelain 中排除自身残留(server/src/custom 符号链接、非 patch 产物),
    //    其余脏文件存在 → 报错退出,不做任何清理动作。
    const selfCustomResidual = (() => {
      try { return lstatSync(upstreamServerCustom).isSymbolicLink(); } catch { return false; }
    })();
    const precheckRaw = git('status --porcelain', hermesStudioRoot).trim();
    const patches = readSeries();
    // 非 patch 产物(openapi.json 等)若有脏行:放行但显式预告回滚——"拒绝时零删除"
    // 对这类文件不成立,至少让用户在回滚发生前看见(2026-09-12 审查)。
    const artifactDirty = precheckRaw
      .split('\n')
      .filter((l) => l.trim())
      .filter((l) => l.includes('docs/openapi.json'));
    if (artifactDirty.length > 0) {
      console.warn('[inject] WARN: 非 patch 产物存在未提交修改,inject 将回滚(非 patch 目标不保留):');
      for (const l of artifactDirty) console.warn(`  ${l}`);
    }
    const precheck = precheckRaw
      .split('\n')
      .filter((l) => l.trim())
      .filter((l) => !(selfCustomResidual && l.trimEnd().endsWith('packages/server/src/custom')))
      .filter((l) => !l.includes('docs/openapi.json')) // restoreNonPatchArtifacts 管理的产物
      .filter((l) => {
        // patch 新增的 untracked 文件（?? 状态）在 clean 后仍可能存在（clean 不删
        // untracked patch 产物），这些文件属于 patch 自身产出，不应阻塞 inject。
        if (!l.startsWith('??')) return true;
        const f = l.slice(3).trim();
        if (patchFileSets().patchNewFiles.has(f)) return false;
        // 目录形 ??（git status 对全 untracked 目录折叠输出 "dir/"，V4 轮实锤：
        // 378 的 services/zcode/ 目录行不匹配文件级 patchNewFiles 致 inject 假死锁）——
        // 该目录下任一 patch 新增文件命中即豁免。
        if (f.endsWith('/')) {
          for (const nf of patchFileSets().patchNewFiles) if (nf.startsWith(f)) return false;
        }
        return true;
      })
      // .loop/ 是 loop 工程运行态（graph-events.db 等由运行中的 server 持有句柄，
      // 非任何 patch 的产物）：app 在跑时每次 inject 都会出现，豁免之。
      // 与 docs/openapi.json 的"回滚管理"不同——这是活运行态，只能放行不能动。
      .filter((l) => !(l.startsWith('??') && l.slice(3).trim().startsWith('.loop/')))
      .join('\n')
      .trim();
    if (precheck && patches.length > 0) {
      console.error('[inject] 上游工作树不干净,先运行 npm run clean:');
      console.error(precheck);
      // 已知漂移类（2026-10-07 根因定位）：README 开发流程在注入树上跑 npm install，
      // 会改写 package-lock（镜像源 resolved 条目）；clean 无法还原这两个文件
      // （lock 逐行 churn 逆放必败，10-02/09-29 stash 前例）。此时 clean 无效，
      // 直接给出对症命令，避免"跑了 clean 还是卡"的误导循环。
      const onlyInstallChurn = precheck.split('\n').every((l) =>
        /package(-lock)?\.json/.test(l) && !l.startsWith('??'));
      if (onlyInstallChurn) {
        console.error('[inject] 判定为 npm install 产物漂移（clean 无法还原）：');
        console.error('  git stash push -m "install-churn <date>" -- package.json package-lock.json  # 存档（仓库惯例）');
        console.error('  或确认无用后: git checkout -- package.json package-lock.json');
      }
      process.exit(1);
    }
    // 0. 校验通过 → 清理 inject/build 自身可能遗留的产物(此时删除是安全的)。
    //    a) server/src/custom 符号链接(inject 建的)
    try {
      if (lstatSync(upstreamServerCustom).isSymbolicLink()) {
        unlinkSync(upstreamServerCustom);
        console.log('[inject] removed stale server/src/custom symlink (self-residual)');
      }
    } catch { /* 不存在,跳过 */ }
    //    b) 非 patch 目标的 build 产物
    restoreNonPatchArtifacts('inject');
    // 1b. Windows autocrlf 可见化:CRLF 检出下靠 --ignore-whitespace 容差套用,
    //     提前告知而非静默放松(根治 = git config core.autocrlf false 后重检出)。
    if (process.platform === 'win32') {
      try {
        const autocrlf = execSync('git config core.autocrlf', { cwd: hermesStudioRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        if (autocrlf === 'true') {
          console.warn('[inject] WARN: upstream core.autocrlf=true(CRLF 检出),已用 --ignore-whitespace 容差套 patch;');
          console.warn('[inject]   建议 git config core.autocrlf false 后重新检出,恢复严格上下文匹配');
        }
      } catch { /* 未配置则无虞 */ }
    }
    // 2. 应用 B 类 patch
    const applied = applyPatches();
    // 2b. 应用 zcode patch(独立树,容错)
    const appliedZcode = applyZcodePatches();
    // 3. 确保 overlay 能解析上游依赖(符号链接 node_modules)
    ensureNodeModulesSymlink();
    // 3b. server 代码用相对路径 import '../custom/...',需把 overlay custom/server 链接到上游
    ensureServerCustomSymlink();
    // 4. 生成派生 config
    generateOverlayViteConfig();
    // B1 双树漂移根治：inject 出口自动同步 agent 运行时（overlay/runtime -> ~/.hermes），
    // 杜绝'修复只在工作树、不达运行时'（room-invite-gap 真根因）。幂等、仅清单内文件。
    execSync('node scripts/deploy-agent-runtime.mjs --apply', { cwd: overlayRoot, stdio: 'inherit' });
    // 5. 写清单
    writeFileSync(
      manifestPath,
      JSON.stringify(
        { appliedPatches: applied, appliedZcodePatches: appliedZcode, generatedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    console.log('[inject] done');
  } else {
    // clean
    const manifest = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, 'utf8'))
      : {};
    const applied = manifest.appliedPatches || readSeries();
    // zcode patch 反向(独立树;manifest 缺项时回退 series 全量)
    reverseZcodePatches(manifest.appliedZcodePatches || readZcodeSeries());
    reversePatches(applied);
    // 还原非 patch 的 build 产物(如 openapi.json),保持上游完全干净
    restoreNonPatchArtifacts('clean');
    // 删除 patch 新增的 untracked 文件（git apply -R 不会删新文件,只还原修改）
    const { patchNewFiles } = patchFileSets();
    for (const f of patchNewFiles) {
      const p = resolve(hermesStudioRoot, f);
      try {
        if (existsSync(p) && !lstatSync(p).isSymbolicLink()) {
          unlinkSync(p);
          console.log(`[clean] removed patch-added file: ${f}`);
        }
      } catch { /* 已删或权限问题,跳过 */ }
    }
    // 移除 inject 创建的 server/src/custom 符号链接(保持上游纯净)
    ensureServerCustomSymlink();
    console.log('[clean] done');
  }
}

// --config-only：只生成派生构建 config + node_modules 软链，不触共享 upstream 注入态
// （worktree 构建门禁用：build:full 需 vite.config.overlay.ts，而全量 inject 会重写
// 共享 upstream——多会话并行期只允许 config 层操作）。
if (process.argv.includes('--config-only')) {
  generateOverlayViteConfig();
  ensureNodeModulesSymlink();
  console.log('[inject] --config-only done（未触碰 upstream 注入态）');
  process.exit(0);
}

// 直跑守卫:测试 import 本模块(断言 js 转义/win32 分支)不触发注入副作用。
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
