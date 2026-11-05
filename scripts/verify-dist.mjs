// overlay/scripts/verify-dist.mjs
// P0 长期改进(2026-09-28):构建产物完整性门禁。
// 背景:09-27 推演暴露 studio 服务端 ready 但 dist/client 为空、SPA 全 404——
// 构建静默失效没有任何报警。本脚本作为 postbuild 钩子,产物缺失即硬失败。
//
// 2026-10-16 安全轮 M8（预警先行版）：出厂默认口令扫描——WARN 态。
// 背景：安全检查 B1 判「部分符合」——真实密钥零泄漏，但出厂 bundle 含桌面
// 免密登录默认口令 admin/123456（WebPet.vue:189）。按用户「先预警、后阻断」
// 裁定：本期只打 WARN 并计数，退出码保持 0（不阻断构建）；源头修复评估完成、
// 且 WARN 连续两周零新增后，再提请把 WARN 升为 FAIL（转硬失败的判据见方案
// 第五节 M8 行）。显式豁免位 VERIFY_DIST_ALLOW_DEFAULT_PASSWORD=1（内部/演练
// 构建），放过时同样打 WARN 留痕——不提供静默豁免。
import { createHash } from 'node:crypto';
import { existsSync, statSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
// 上游根解析单一事实源（P1 Task 6）：env > 仓内 vendor > 旧兄弟 upstream（realpath）。
import { resolveUpstreamRoots } from './platform/lib/upstream-root.mjs';

const upstreamRoot = resolveUpstreamRoots(resolve(import.meta.dirname, '..')).upstreamRoot;
const distClient = resolve(upstreamRoot, 'hermes-studio', 'dist', 'client');
// --server（P1 Task 7）：交付链（build:full/build-dmg）按运行时资产清单校验 server 面；
// postbuild（npm run build，纯 vite client 构建）保持 client-only——无 server 产物不校验。
const SERVER_MODE = process.argv.includes('--server');
const distServer = resolve(upstreamRoot, 'hermes-studio', 'dist', 'server');

const fail = (msg) => {
  console.error(`[verify-dist] FAIL: ${msg}`);
  process.exit(1);
};

if (!existsSync(distClient)) fail(`dist/client 目录不存在: ${distClient}`);
const indexHtml = resolve(distClient, 'index.html');
if (!existsSync(indexHtml)) fail(`dist/client/index.html 缺失(build 未产出入口)`);

const size = statSync(indexHtml).size;
if (size < 200) fail(`dist/client/index.html 异常偏小(${size}B),疑似空壳`);

const assets = readdirSync(resolve(distClient, 'assets')).filter((f) => f.endsWith('.js'));
if (assets.length === 0) fail('dist/client/assets 无 JS 产物,SPA 将白屏');

// ── M8：出厂默认口令扫描（WARN 态，不阻断构建）──
// 两类模式，均为字符串字面量级（抗 minify）：
//   P1 自动登录调用：username:"admin",password:"123456" 同现（桌面免密登录）
//   P2 提示文案：123456 与口令类关键词同现（UI 向用户展示默认口令）
// 负向断言（2026-10-16 实测 0.7.36 产物后修正）：原 P2 用 /123456(?!\s*:)/ 邻近判定，
// 把 minify 产物里的 base64 字母表（…0123456789…）与日期正则（[123456789]）全算成
// 命中——每次干净构建都误报。现要求 123456 前为分隔符（空白/冒号/等号/逗号，含全角）
// 且后不接数字：base64 前是 '0'、日期正则前是 '['，双双排除；telegram token 占位符
// （123456:ABC-DEF…，PlatformSettings.vue:320）因前为 '"' 不在分隔符集同样排除。
const P1_RE = /username\s*:\s*['"`]admin['"`]\s*,\s*password\s*:\s*['"`]123456['"`]/i;
const P2_SECRET_RE = /[\s:=,，：]123456(?![\d])/;
const P2_KEYWORD_RE = /admin|password|密码|密碼|contraseña|passwort|passe|parola|пароль|비밀번호|パスワード/i;

function scanDefaultPassword() {
  const targets = [indexHtml, ...assets.map((f) => resolve(distClient, 'assets', f))];
  const p1 = [];
  const p2 = [];
  for (const file of targets) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    if (P1_RE.test(text)) p1.push(file);
    else if (P2_SECRET_RE.test(text) && P2_KEYWORD_RE.test(text)) p2.push(file);
  }
  return { p1, p2 };
}

const { p1, p2 } = scanDefaultPassword();
if (p1.length > 0 || p2.length > 0) {
  const detail = [
    p1.length > 0 ? `P1(免密登录) ${p1.length} 个文件` : null,
    p2.length > 0 ? `P2(提示文案) ${p2.length} 个文件` : null,
  ].filter(Boolean).join('、');
  const exempt = process.env.VERIFY_DIST_ALLOW_DEFAULT_PASSWORD === '1';
  const tag = exempt ? 'WARN(已豁免)' : 'WARN';
  console.warn(`[verify-dist] ${tag}: 出厂默认口令泄漏 — ${detail}`);
  console.warn('  处置：① 桌面免密登录改为主进程下发一次性 token（WebPet.vue:189）；② 摘除 login.defaultCredentialsHint 的语言条；③ 确需保留设 VERIFY_DIST_ALLOW_DEFAULT_PASSWORD=1');
  if (exempt) {
    console.warn('  （豁免仅留痕，不转 FAIL——预警先行版纪律；转硬失败的判据见整改方案第五节 M8 行）');
  }
  // 预警态：不打退出码。转 FAIL 的条件（源头修复完成 + 连续两周 WARN 零新增）
  // 达成后，把上面的 console.warn 对调成 fail() 即可，改动就一处。
} else {
  console.log('[verify-dist] OK: 出厂默认口令扫描零命中');
}

console.log(`[verify-dist] OK: index.html ${size}B, assets/js ${assets.length} 个`);

// ── server 面（--server）：运行时资产清单逐项校验（P1 Task 7）──
// 清单（dist/server/runtime-assets.json）是随包资源的事实源：server 入口、价目表、
// 名册、列配置、semantica bridge 任一缺失或字节漂移即 FAIL——装机产物静默回空表
// （2026-09-25 审查实证）/ bridge 进程全灭（2026-10-06 重建实锤）都在这条链路上堵。
if (SERVER_MODE) {
  const manifestPath = resolve(distServer, 'runtime-assets.json');
  if (!existsSync(manifestPath)) fail(`server 模式缺运行时资产清单: ${manifestPath}(build.mjs 应随包生成)`);
  const entry = resolve(distServer, 'index.js');
  if (!existsSync(entry)) fail(`dist/server/index.js 缺失(server 入口未产出)`);

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    fail(`runtime-assets.json 损坏: ${e.message}`);
  }
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    fail('runtime-assets.json 形状非法(schemaVersion=1 + 非空 assets 数组)');
  }
  for (const asset of manifest.assets) {
    if (typeof asset?.rel !== 'string' || typeof asset.sha256 !== 'string') {
      fail(`runtime-assets.json 条目非法: ${JSON.stringify(asset)}`);
    }
    const target = resolve(distServer, asset.rel);
    if (!existsSync(target)) fail(`清单资产缺失: ${asset.rel} (期望 ${target})`);
    const bytes = readFileSync(target);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== asset.sha256) {
      fail(`清单资产内容漂移: ${asset.rel}（清单 ${asset.sha256.slice(0, 12)}… ≠ 实物 ${digest.slice(0, 12)}…）`);
    }
  }
  console.log(`[verify-dist] OK: runtime 资产清单 ${manifest.assets.length} 项逐项存在且摘要一致`);
}
