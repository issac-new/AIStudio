#!/usr/bin/env node
// 离线安装包打包器（Windows amd64 / web 模式）
// spec: docs/superpowers/specs/2026-11-02-offline-windows-package.md（D1-D13）
// 产物: dist/offline/aistudio-offline-<full版>-win64.zip（dist 不入库）
// 隐私: 脱敏扫描 fail-closed——内容命中凭据形态即拒打包（D7）。
import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '..');
const templateRoot = join(repoRoot, 'scripts', 'offline-template');

// ---------- 可单测的纯函数 ----------

/** 凭据形态扫描（fail-closed 判定用）。返回命中数组（模式名+完整匹配串）。 */
export function scanSecrets(text) {
  const patterns = [
    ['aws-access-key', /AKIA[0-9A-Z]{16}/],
    ['openai-style-key', /sk-[A-Za-z0-9_-]{24,}/],
    ['github-pat', /ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}/],
    ['slack-token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
    ['gitlab-pat', /glpat-[A-Za-z0-9_-]{20,}/],
    ['private-key-block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ['jwt', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/],
  ];
  const hits = [];
  for (const [name, re] of patterns) {
    const m = re.exec(text);
    if (m) hits.push({ pattern: name, match: m[0], sample: `${m[0].slice(0, 12)}…(${m[0].length} 字符)` });
  }
  return hits;
}

/** zcode 配置面快照排除规则（D14, 2026-11-02）：可再生产物与缓存不入包
 * （node_modules/.git/缓存/备份/.DS_Store）；mac 编译二进制（gstack bin/dist 等）
 * 保留随包以维持环境一致，README 注明 Windows 不可执行。 */
export function zcodeTreeExclude(relPath, isDir) {
  const segs = relPath.split('\\').join('/').split('/');
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const isLast = i === segs.length - 1;
    if (/\.bak(\.|[-0-9]|$)/i.test(seg)) return `剔除杂项 ${seg}`;  // 备份目录族(如 swarm-yuan.bak.1793…)与文件
    if (seg === '.DS_Store') return `剔除杂项 ${seg}`;
    if (isLast && !isDir) continue;
    if (['node_modules', '.git', '__pycache__'].includes(seg)) return `排除目录 ${seg}`;
    if (seg.startsWith('venv') || seg.startsWith('.venv')) return `排除目录 ${seg}`;
    if (/^\.[a-zA-Z]+[-_]cache$/.test(seg)) return `排除目录 ${seg}`;
  }
  return null;
}

/** 明显假值判定（上游测试夹具/文档示例形态, 2026-11-02 实测采样校准）。
 * 命中这些标记的降级为报告项; 其余命中一律 fatal（fail-closed 不变）,
 * 另有本机真实密钥值哈希对撞检查兜底（见 main 流程, 假值形态也拦）。 */
const DUMMY_MARKERS = [
  /abcdefghijklmnop/i,           // 字母表序列 fixture
  /^sk-[a-z]+(-[a-z]+){3,}$/,    // 人类词 slug 链(如 sk-user-question-format-compliance, ≥4 小写词非随机 key)
  /0123456789|1234567890/,       // 数字序列 fixture
  /ABCDEF/i,
  /(^|[-_])(test|fake|dummy|example|your|xxx|aaa|000|123|abc)/i, // 凭据前缀后的假值开头词
  /example|placeholder|here|do-not|should-not|secret|process-level|not-persist|expired|canary|deadbeef|not-a-real/i,
];
// 注: 不得加「大写字母长跑」类规则——真实 AWS Access Key ID 恰是 20 位大写字母数字,
// [A-Z]{12,} 会把真 key 误降级(审查 P0-3, 已实测证伪后删除)。
export function isDummySecret(s) {
  return DUMMY_MARKERS.some((re) => re.test(s));
}

/** 扫描白名单（显式人工核判留痕, 2026-11-02）：只放宽到「文件×模式」粒度,
 * 真实值哈希对撞检查在其之前仍然 fatal。新增条目必须附核判理由与日期。 */
export const SCAN_ALLOWLIST = [
  { fileRe: /^zcode\/skills\/gstack\/lib\/diagram-render\/dist\/diagram-render\.html$/, pattern: 'aws-access-key',
    reason: '编译产物内 base64 噪声偶合 AKIA+16 位大写(无密钥语境, 人工核判 2026-11-02)' },
  { fileRe: /^zcode\/skills\/gstack\/lib\/redact-patterns\.ts$/, pattern: 'private-key-block',
    reason: '脱敏规则库的正则定义本体(检测器自带 PEM 标记字面量, L754-757/848, 人工核判 2026-11-02)' },
];
export function allowlistReason(rel, pattern) {
  for (const e of SCAN_ALLOWLIST) if (e.fileRe.test(rel) && e.pattern === pattern) return e.reason;
  return null;
}

/** agent 树采集排除规则（2026-11-02 两轮实测口径，spec 打包链 2）。
 * 环境/构建产物全剔除: venv 族(venv、.venv 及其 .bak/.dangling 变体)、.hermes-runtime
 * (内嵌 Python 运行时)、.worktrees(遗留 worktree 拷贝)、dist/release/build/.cache
 * (构建产物, 目标机按需重建)、.git/node_modules/__pycache__/logs/MagicMock。
 * 返回 null=放行；返回字符串=剔除原因（敏感名剔除会进报告）。 */
const DIR_EXACT = new Set([
  '.git', 'node_modules', '__pycache__', 'logs', 'MagicMock',
  '.hermes-runtime', '.worktrees', '.cache', 'dist', 'release', 'build',
]);
export function agentTreeExclude(relPath, isDir) {
  const segs = relPath.split('\\').join('/').split('/');
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const isLast = i === segs.length - 1;
    if (isLast && !isDir) continue; // 末段是文件名时不套目录规则
    if (DIR_EXACT.has(seg)) return `排除目录 ${seg}`;
    if (seg.startsWith('venv') || seg.startsWith('.venv')) return `排除目录 ${seg}`;
    if (seg.endsWith('.egg-info')) return `排除目录 ${seg}`;
    // lint/test 缓存目录族(.ruff_cache/.pytest_cache/.pytest-cache 等, 2026-11-02 zip 实测泄漏后补)
    if (/^\.[a-zA-Z]+[-_]cache$/.test(seg)) return `排除目录 ${seg}`;
  }
  const name = segs.at(-1);
  if (name.endsWith('.pyc') || name.endsWith('.pyo')) return '字节码缓存';
  // 敏感名文件: .env 与 .env.* 剔除并报告; .env.example(上游模板)/.envrc(direnv watch, 无值)放行
  if (name === '.env' || (/^\.env\..+/.test(name) && name !== '.env.example')) return `敏感名剔除 ${name}`;
  return null;
}

/** 由 team/config.yaml（脱敏正本）派生 env/config.example.yaml。 */
export function deriveConfigExample(teamYaml) {
  const header = [
    '# ~/.hermes/config.yaml 模板（离线安装包派生）',
    '# 正本来源: aistudio/team/config.yaml（脱敏）; model/provider 段按目标机调整,',
    '# 其余键结构与团队部署口径一致。安装脚本 S3 只在文件不存在时落位。',
    '',
    ...teamYaml.split('\n'),
  ];
  return header.join('\n');
}

/** 解析 .env 文本为键名集合（跳过注释/空行）。 */
export function parseEnvKeys(text) {
  const keys = new Set();
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

// ---------- 工具 ----------

function sh(cmd, args, opts = {}) {
  // maxBuffer: git diff(154 文件补丁)远超默认 1MB, 放到 512MB(实测教训 2026-11-02)
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: repoRoot, maxBuffer: 512 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`命令失败(${cmd} ${args.join(' ')}): ${r.stderr || r.status}`);
  return r.stdout;
}

function walk(dir, fn) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) { fn(p, true); walk(p, fn); } else fn(p, false);
  }
}

function dirStats(dir) {
  let files = 0n, bytes = 0n;
  walk(dir, (p, isDir) => {
    if (!isDir) { files++; bytes += BigInt(statSync(p).size); }
  });
  return { files: Number(files), mb: Number(bytes / 1024n / 1024n) };
}

// ---------- 主流程 ----------

function main() {
  const args = process.argv.slice(2);
  const opt = (k, dflt) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const hermesTree = resolve(opt('hermes-tree', join(homedir(), '.hermes', 'hermes-agent')));
  const outDir = resolve(repoRoot, opt('out', join('dist', 'offline')));

  const manifest = JSON.parse(readFileSync(join(repoRoot, 'RELEASE-MANIFEST.json'), 'utf8'));
  const fullVer = manifest.packaging?.fullPackage?.version;
  if (!fullVer) throw new Error('RELEASE-MANIFEST.json 缺 packaging.fullPackage.version');
  const pkgName = `aistudio-offline-${fullVer}-win64`;
  const staging = join(outDir, pkgName);
  const agentVer = manifest.modules?.['agent-teams']?.version ?? '?';

  if (!existsSync(hermesTree)) throw new Error(`agent 树不存在: ${hermesTree}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  // 1) aistudio/: git archive 全仓 HEAD（full 口径, 复用 make-release-packages 机制）
  mkdirSync(join(staging, 'aistudio'));
  const tgz = join(outDir, '.archive.tmp.tgz');
  sh('git', ['archive', '--format=tar.gz', '-o', tgz, 'HEAD']);
  sh('tar', ['-xzf', tgz, '-C', join(staging, 'aistudio')], { cwd: outDir });
  rmSync(tgz, { force: true });

  // 2) hermes-agent-src/: 工作树快照（排除+敏感名剔除报告）
  const excludedSensitive = [];
  const excludedDirs = new Set();
  cpSync(hermesTree, join(staging, 'hermes-agent-src'), {
    recursive: true,
    filter: (src) => {
      const rel = relative(hermesTree, src);
      if (!rel || rel.startsWith('..')) return true;
      const isDir = existsSync(src) && statSync(src).isDirectory();
      const reason = agentTreeExclude(rel, isDir);
      if (!reason) return true;
      if (reason.startsWith('敏感名')) excludedSensitive.push(rel);
      else excludedDirs.add(reason.replace('排除目录 ', '').split(' ')[0]);
      return false;
    },
  });

  // 3) local-mods.patch: 覆盖修改+新增。经 GIT_INDEX_FILE 临时索引采集——本树是
  //    活体运行树(hermes 网关进程会并发碰 git), 直改真 index 必撞 index.lock 竞态
  //    (2026-11-02 实测两次教训: 一次 maxBuffer 炸、一次撞活体锁); 临时索引零接触真 index。
  const g = (a) => sh('git', ['-C', hermesTree, '-c', 'core.quotepath=false', ...a]);
  const pre = g(['status', '--porcelain']);
  const staged = pre.split('\n').filter((l) => l && l[0] !== ' ' && l[0] !== '?');
  if (staged.length) throw new Error(`agent 树存在已暂存改动(${staged.length} 条), 请先提交/撤销再打包`);
  const tmpIndex = join(hermesTree, '.git', `offline-pkg-index.${process.pid}`);
  let patch;
  try {
    const gi = (a) => sh('git', ['-C', hermesTree, '-c', 'core.quotepath=false', ...a],
      { env: { ...process.env, GIT_INDEX_FILE: tmpIndex } });
    gi(['read-tree', 'HEAD']);                 // 临时索引从 HEAD 起, diff 出的即工作树全量改动
    gi(['add', '-A', '--intent-to-add']);      // 新增文件以 intent-to-add 进临时索引(diff 含全文)
    patch = gi(['diff']);
  } finally {
    rmSync(tmpIndex, { force: true });         // 只删临时索引, 真索引全程未动
  }
  const post = g(['status', '--porcelain']);
  if (post !== pre) throw new Error('采集前后 porcelain 不一致(活体树并发写入?), 请重跑');
  const nMod = pre.split('\n').filter((l) => l.startsWith(' M')).length;
  const nNew = pre.split('\n').filter((l) => l.startsWith('??')).length;
  const nDel = pre.split('\n').filter((l) => l.startsWith(' D')).length;
  writeFileSync(join(staging, 'hermes-agent-src', 'local-mods.patch'), patch);

  // 4) SNAPSHOT
  const baseCommit = sh('git', ['-C', hermesTree, 'rev-parse', '--short', 'HEAD']).trim();
  writeFileSync(join(staging, 'hermes-agent-src', 'HERMES-AGENT-SNAPSHOT.md'), [
    `# hermes-agent 快照（离线安装包）`, '',
    `- 采集时间: ${new Date().toISOString()}`, `- 上游基线 commit: ${baseCommit}`,
    `- 改动量: 修改 ${nMod} + 新增 ${nNew} + 删除 ${nDel} 文件（完整补丁见 local-mods.patch）`,
    `- 与 aistudio/vendor/hermes-agent（钉版 ${agentVer} 基线）为两棵树: 本快照是家机真实运行态(含 runtime 覆盖层与本地修复);`,
    `  studio 运行时经 ~/.hermes 通道消费本树。`,
    `- 已剔除环境/构建产物目录: venv 族/.venv 族/.hermes-runtime/.worktrees/.git/node_modules/dist/release/build/.cache/__pycache__/logs/MagicMock/*.egg-info;`,
    `  ui-tui 等构建产物目标机按需重建。`, '',
  ].join('\n'));

  // 5) env/ + zcode/ + install/(含 uv 钉版注入: 上游 pm/lock.json packages.uv.version)
  const warns = [];
  mkdirSync(join(staging, 'env'));
  cpSync(join(templateRoot, 'env'), join(staging, 'env'), { recursive: true });
  const teamCfg = readFileSync(join(repoRoot, 'team', 'config.yaml'), 'utf8');
  writeFileSync(join(staging, 'env', 'config.example.yaml'), deriveConfigExample(teamCfg));
  mkdirSync(join(staging, 'zcode'));
  cpSync(join(templateRoot, 'zcode'), join(staging, 'zcode'), { recursive: true });
  // zcode 配置面快照（D14 用户裁决「其余都包含」）: skills/scripts/workflows/vendor 整树,
  // 符号链解引用成实体; 排除可再生产物/缓存/备份; 断链逐项容错并报告
  const zcodeHome = join(homedir(), '.zcode');
  const zcodeBroken = [];
  const zcodeExcluded = new Set();
  const zcodeFilter = (src) => (p) => {
    const rel = relative(src, p);
    if (!rel || rel.startsWith('..')) return true;
    const isDir = existsSync(p) && statSync(p).isDirectory();
    const reason = zcodeTreeExclude(rel, isDir);
    if (!reason) return true;
    if (reason.startsWith('排除目录')) zcodeExcluded.add(reason.replace('排除目录 ', ''));
    return false;
  };
  for (const sub of ['skills', 'scripts', 'workflows', 'vendor']) {
    const src = join(zcodeHome, sub);
    if (!existsSync(src)) continue;
    const dst = join(staging, 'zcode', sub);
    mkdirSync(dst, { recursive: true });
    for (const ent of readdirSync(src)) {
      // dereference 解引用符号链; 断链(目标缺失)逐项容错记录, 不打断整批
      try {
        cpSync(join(src, ent), join(dst, ent), { recursive: true, dereference: true, filter: zcodeFilter(src) });
      } catch (e) {
        zcodeBroken.push(`${sub}/${ent}: ${String(e.cause?.code ?? e.message).slice(0, 60)}`);
      }
    }
  }
  cpSync(join(templateRoot, 'install'), join(staging, 'install'), { recursive: true });
  const pmLockPath = join(hermesTree, 'pm', 'lock.json');
  const uvPin = existsSync(pmLockPath)
    ? (JSON.parse(readFileSync(pmLockPath, 'utf8')).packages?.uv?.version ?? null) : null;
  if (!uvPin) warns.push('pm/lock.json 无 uv 钉版, 安装脚本将装未钉版 uv(建议核对上游 lock)');
  const ps1Dst = join(staging, 'install', 'install-windows.ps1');
  writeFileSync(ps1Dst, readFileSync(ps1Dst, 'utf8').replaceAll('__UV_VERSION__', uvPin ?? 'uv'));

  // 6) 对账告警（不阻断）: env 键名漂移 / config 顶层键名漂移; zcode AGENTS 差异仅 INFO(脱敏本身必致差异)
  const liveEnvPath = join(homedir(), '.hermes', '.env');
  if (existsSync(liveEnvPath)) {
    const live = parseEnvKeys(readFileSync(liveEnvPath, 'utf8'));
    const tmpl = parseEnvKeys(readFileSync(join(staging, 'env', 'dot-env.example'), 'utf8'));
    const missing = [...live].filter((k) => !tmpl.has(k));
    if (missing.length) warns.push(`家机 .env 有 ${missing.length} 个键未进模板(键名): ${missing.join(', ')}`);
  }
  const liveCfgPath = join(homedir(), '.hermes', 'config.yaml');
  const topKeys = (t) => new Set(t.split('\n').filter((l) => /^[A-Za-z_][A-Za-z0-9_-]*:/.test(l)).map((l) => l.split(':')[0]));
  if (existsSync(liveCfgPath)) {
    const live = topKeys(readFileSync(liveCfgPath, 'utf8'));
    const tmpl = topKeys(teamCfg);
    const missing = [...live].filter((k) => !tmpl.has(k));
    if (missing.length) warns.push(`家机 config.yaml 有 ${missing.length} 个顶层键未进模板(键名): ${missing.join(', ')}`);
  }
  const liveAg = join(homedir(), '.zcode', 'AGENTS.md');
  if (existsSync(liveAg)) {
    const a = readFileSync(liveAg, 'utf8'), b = readFileSync(join(staging, 'zcode', 'AGENTS.md'), 'utf8');
    console.log(`  INFO: ~/.zcode/AGENTS.md 实况 ${a.split('\n').length} 行 vs 脱敏正本 ${b.split('\n').length} 行(差异=脱敏本身, 大改时人工复核)`);
  }
  const liveCl = join(homedir(), '.zcode', 'CLAUDE.md');
  if (existsSync(liveCl)) {
    const a = readFileSync(liveCl, 'utf8'), b = readFileSync(join(staging, 'zcode', 'CLAUDE.md'), 'utf8');
    console.log(`  INFO: ~/.zcode/CLAUDE.md 实况 ${a.split('\n').length} 行 vs 脱敏正本 ${b.split('\n').length} 行(差异=脱敏本身, 大改时人工复核)`);
  }

  // 7) 脱敏扫描 fail-closed: hermes-agent-src + env + install + zcode（文本文件全量）
  //    三层判据(2026-11-02 两轮实测校准): ①与家机 ~/.hermes/.env 真实值哈希对撞→无条件 fatal;
  //    ②测试/文档面路径(tests/tests-js/evals/website/docs)或明显假值标记→降级为报告项;
  //    ③其余命中一律 fatal。fail-closed 对生产面不放松。
  const liveEnvPath0 = join(homedir(), '.hermes', '.env');
  const liveHashes = new Set();
  if (existsSync(liveEnvPath0)) {
    for (const line of readFileSync(liveEnvPath0, 'utf8').split('\n')) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/.exec(line.trim());
      if (m && m[2].length >= 8) liveHashes.add(createHash('sha256').update(m[2]).digest('hex'));
    }
  }
  const TESTDOC_RE = /(^|\/)(tests?|tests-js|evals|website|docs|manual)(\/|$)/;
  const findings = [];   // fatal
  const dummies = [];    // 已知假值(报告项)
  // 扫描面反转(审查 P0-2): 默认扫全部文件, 只跳过明确二进制扩展名; 无扩展名/patch/pem/log
  // 等一律入扫, 读到的 NUL 字节(二进制特征)再跳过——扩展名白名单曾让 .pem/.patch 整体绕过。
  const BIN_EXT = /\.(png|jpe?g|gif|ico|webp|bmp|pdf|zip|gz|tgz|tar|7z|rar|exe|dll|dylib|so|bin|dat|woff2?|ttf|otf|mp3|mp4|wav|mov|avi|onnx|pyd|node|wasm|asar|db|sqlite3?|class|jar|pyc|pyo)$/i;
  const hitSha = (s) => createHash('sha256').update(s).digest('hex');
  for (const area of ['hermes-agent-src', 'env', 'install', 'zcode']) {
    walk(join(staging, area), (p, isDir) => {
      if (isDir || BIN_EXT.test(p)) return;
      const rel = relative(staging, p);
      const buf = readFileSync(p);
      if (buf.includes(0)) return; // 二进制内容(无 NUL 才按文本扫描)
      const testDoc = TESTDOC_RE.test(rel);
      const text = buf.toString('utf8');
      for (const h of scanSecrets(text)) {
        const rec = { file: rel, pattern: h.pattern, sample: h.sample };
        let fatal = liveHashes.has(hitSha(h.match)) || (!testDoc && !isDummySecret(h.match));
        if (fatal) {
          const al = allowlistReason(rel, h.pattern);
          if (al && !liveHashes.has(hitSha(h.match))) { rec.sample += ` [白名单放行: ${al}]`; fatal = false; }
        }
        (fatal ? findings : dummies).push(rec);
      }
    });
  }
  if (findings.length) {
    console.error('脱敏扫描命中真实形态凭据(已拒打包, 逐条人工核判):');
    for (const f of findings) console.error(`  ${f.file}: ${f.pattern} ${f.sample}`);
    rmSync(staging, { recursive: true, force: true });
    process.exit(1);
  }

  // 8) SHA256SUMS.txt（先写后 zip, 不含自身）
  const sums = [];
  walk(staging, (p, isDir) => {
    if (isDir) return;
    const rel = relative(staging, p).split('\\').join('/');
    if (rel === 'SHA256SUMS.txt') return;
    sums.push(`${createHash('sha256').update(readFileSync(p)).digest('hex')}  ${rel}`);
  });
  writeFileSync(join(staging, 'SHA256SUMS.txt'), sums.join('\n') + '\n');

  // 9) zip
  sh('zip', ['-r', '-q', '-X', `${pkgName}.zip`, pkgName], { cwd: outDir });

  // 10) 报告
  const a = dirStats(join(staging, 'aistudio'));
  const h = dirStats(join(staging, 'hermes-agent-src'));
  const z = dirStats(join(staging, 'zcode'));
  console.log(`[offline-package] ${pkgName}.zip`);
  console.log(`  aistudio/          ${a.files} 文件 ${a.mb}MB`);
  console.log(`  hermes-agent-src/  ${h.files} 文件 ${h.mb}MB（基线 ${baseCommit}, M${nMod}+A${nNew}, patch ${Math.round(patch.length / 1024)}KB）`);
  console.log(`  zcode/             ${z.files} 文件 ${z.mb}MB（规则脱敏正本＋skills/scripts/workflows/vendor 解引用快照; 排除: ${[...zcodeExcluded].join('/') || '无'}; 断链: ${zcodeBroken.length}${zcodeBroken.length ? ' -> ' + zcodeBroken.join(' | ') : ''}; mac 编译二进制随包, Windows 不可执行—见 README）`);
  console.log(`  敏感名剔除: ${excludedSensitive.length} 个(${excludedSensitive.join(', ') || '无'}); 排除目录: ${[...excludedDirs].join('/') || '无'}`);
  console.log(`  脱敏扫描: fatal 0 / 降级 ${dummies.length} 处(测试文档面+假值标记, 真实值哈希对撞 fatal); 对账告警: ${warns.length ? warns.join(' | ') : '无'}`);
  if (warns.length) for (const w of warns) console.warn(`  WARN: ${w}`);
}

if (process.argv[1] === import.meta.filename || process.argv[1]?.endsWith('make-offline-package.mjs')) main();
