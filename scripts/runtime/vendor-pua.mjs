// overlay/scripts/runtime/vendor-pua.mjs
// 把上游 tanweai/pua 的技能集(skills/*)按 pinned ref 同步进 overlay/runtime/pua/。
// overlay/runtime/pua/skills/ 为脚本所有(生成物),勿手改 —— 更新一律走本脚本。
//
// 用法:
//   node scripts/runtime/vendor-pua.mjs --source /path/to/pua-checkout [--ref main|<tag>|<sha>]
//   node scripts/runtime/vendor-pua.mjs                # 无 --source:从 GitHub 拉取
//                                                     # (ref 默认取 PIN 现值,无 PIN 则 main)
//
// 产物:
//   overlay/runtime/pua/skills/<skill>/SKILL.md[+references/]
//   overlay/runtime/pua/PIN.yaml       # 上游 repo/ref/commit/日期/技能数
//   overlay/runtime/pua/ATTRIBUTION.md # 人类可读的来源与许可声明(由 PIN 派生)
//
// 设计约束:
//   - 纯函数(校验/PIN 构建/同步)与 CLI(git 拉取)分离,守门测试免网络驱动纯函数。
//   - 跨平台:fs.cpSync/rmSync,不落 shell;远端模式经 spawnSync('git')。
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

const overlayRoot = resolve(import.meta.dirname, '..', '..');
const puaRoot = resolve(overlayRoot, 'runtime', 'pua');
const skillsDest = resolve(puaRoot, 'skills');
const pinPath = resolve(puaRoot, 'PIN.yaml');
const attributionPath = resolve(puaRoot, 'ATTRIBUTION.md');
export const PUA_REPOSITORY = 'https://github.com/tanweai/pua';

// ---------- 纯函数(测试驱动) ----------

/** 校验 source 的 skills/ 形状:非空、每个一级目录必须有 SKILL.md。
 *  返回 [{name}] 列表;不合法则抛错(带具体目录名)。 */
export function validateSkillsShape(skillsDir) {
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) {
    throw new Error(`skills 目录不存在: ${skillsDir}`);
  }
  const entries = readdirSync(skillsDir).filter((e) => statSync(resolve(skillsDir, e)).isDirectory());
  if (entries.length === 0) throw new Error(`skills 目录为空: ${skillsDir}`);
  for (const name of entries) {
    const skillMd = resolve(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillMd)) {
      throw new Error(`技能 ${name} 缺少 SKILL.md(不符合技能目录契约)`);
    }
  }
  return entries.map((name) => ({ name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** 由事实构建 PIN.yaml 文本(手写序列化,守门测试按行断言)。 */
export function buildPinYaml({ repository, ref, commit, refDate, skillNames, vendoredAt, normalized = [] }) {
  if (!repository || !ref || !commit) throw new Error('PIN 必须含 repository/ref/commit');
  const lines = [
    '# 本文件由 scripts/runtime/vendor-pua.mjs 生成,勿手改。',
    '# 更新流程见 overlay/runtime/README.md(同步 SOP)。',
    `runtime: pua`,
    `repository: ${repository}`,
    `ref: ${ref}`,
    `commit: ${commit}`,
    `ref_date: ${JSON.stringify(refDate)}`,
    `vendored_at: ${JSON.stringify(vendoredAt)}`,
    `skill_count: ${skillNames.length}`,
    `# 同步时做过 SKILL.md frontmatter 规范化的技能(YAML1.1 布尔裸值加引号,`,
    `# 见 normalizeSkillMd;上游修复后此清单应回归为空)`,
    `normalized:`,
    ...(normalized.length ? normalized.map((n) => `  - ${n}`) : ['  []']),
    `skills:`,
    ...skillNames.map((n) => `  - ${n}`),
    '',
  ];
  return lines.join('\n');
}

/** 由 PIN 事实构建 ATTRIBUTION.md(许可与来源声明)。 */
export function buildAttributionMd({ repository, ref, commit, refDate, skillNames, license, normalized = [] }) {
  return [
    '# pua 技能集 vendored 声明',
    '',
    `- 上游仓库: ${repository}`,
    `- 同步 ref: ${ref} (commit \`${commit}\`,${refDate})`,
    `- 许可: ${license}(上游 plugin.json/README 声明;仓库根无独立 LICENSE 文件)`,
    `- 技能清单(${skillNames.length}): ${skillNames.join(', ')}`,
    normalized.length ? `- frontmatter 规范化(加引号): ${normalized.join(', ')}(YAML 1.1 布尔裸值兼容,详见 PIN)` : '- frontmatter 规范化: 无',
    '',
    '本目录内容(script-owned,勿手改)由 overlay/scripts/runtime/vendor-pua.mjs 从上述',
    '上游提交同步(仅 frontmatter 布尔裸值加引号这一类最小规范化)。本地修改一律会被',
    '下次同步覆盖;如需裁剪,改 vendor 脚本并同步更新守门测试,不要直接改技能文件。',
    '',
  ].join('\n');
}

/** 同步时对 SKILL.md frontmatter 做的最小规范化,返回是否改动。
 *  背景:上游 pua 的 yes 技能写了 `name: yes`(裸标量),YAML 1.1 解析器
 *  (hermes 的 pyyaml)把它读成布尔 True,技能扫描时 True.lower() 抛错被静默
 *  跳过 —— 12 技能只装载 11(2026-09-23 实弹发现)。规则:frontmatter 里
 *  name/description 若为 YAML 1.1 布尔裸值(yes/no/on/off/true/false)则加引号。 */
export function normalizeSkillMd(text) {
  const fmEnd = text.indexOf('\n---', text.startsWith('---') ? 3 : 0);
  if (!text.startsWith('---') || fmEnd < 0) return { text, changed: false };
  const fm = text.slice(0, fmEnd);
  const rest = text.slice(fmEnd);
  const re = /^(\s*(?:name|description)\s*:\s*)(yes|no|on|off|true|false)(\s*)$/gim;
  const normalizedFm = fm.replace(re, '$1"$2"$3');
  const changed = normalizedFm !== fm;
  return { text: normalizedFm + rest, changed };
}

/** 全量重建目标 skills 目录 + PIN + ATTRIBUTION。source/dest 均为绝对路径。 */
export function syncFromSource(sourceRoot, destRoot, { ref, commit, refDate, vendoredAt, repository = PUA_REPOSITORY, license = 'MIT' }) {
  const skillsDir = resolve(sourceRoot, 'skills');
  const skillEntries = validateSkillsShape(skillsDir);
  const skillNames = skillEntries.map((s) => s.name);

  const destSkills = resolve(destRoot, 'skills');
  rmSync(destSkills, { recursive: true, force: true });
  mkdirSync(destSkills, { recursive: true });
  const normalized = [];
  for (const { name } of skillEntries) {
    cpSync(resolve(skillsDir, name), resolve(destSkills, name), { recursive: true });
    const skillMdPath = resolve(destSkills, name, 'SKILL.md');
    const raw = readFileSync(skillMdPath, 'utf8');
    const { text, changed } = normalizeSkillMd(raw);
    if (changed) {
      writeFileSync(skillMdPath, text, 'utf8');
      normalized.push(name);
    }
  }
  const pin = buildPinYaml({ repository, ref, commit, refDate, skillNames, vendoredAt, normalized });
  writeFileSync(resolve(destRoot, 'PIN.yaml'), pin, 'utf8');
  const attribution = buildAttributionMd({ repository, ref, commit, refDate, skillNames, license, normalized });
  writeFileSync(resolve(destRoot, 'ATTRIBUTION.md'), attribution, 'utf8');
  return { skillNames, normalized, pin, attribution };
}

/** 严格按段读取 PIN 的 skills 清单(排除 normalized 段)。 */
export function readPinSkills(raw) {
  const m = raw.match(/^skills:\n((?:  - .+\n?)+)/m);
  return m ? m[1].split('\n').map((l) => l.replace(/^\s*- /, '')).filter(Boolean) : [];
}

/** 严格按段读取 PIN 的 normalized 清单。 */
export function readPinNormalized(raw) {
  const m = raw.match(/^normalized:\n(  - .+(?:\n|$))+/m);
  return m ? [...m[1].matchAll(/- (.+)/g)].map((x) => x[1]) : [];
}

/** 读取现有 PIN(供 ref 默认值与一致性校验)。文件不存在返回 null。 */
export function readPin(destRoot = puaRoot) {
  const p = resolve(destRoot, 'PIN.yaml');
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8');
  const get = (key) => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (!m) return null;
    const v = m[1].trim();
    return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v;
  };
  return {
    runtime: get('runtime'), repository: get('repository'), ref: get('ref'), commit: get('commit'),
    skill_count: Number(get('skill_count')),
    normalized: readPinNormalized(raw),
    skills: readPinSkills(raw),
  };
}

// ---------- CLI(涉及 git/网络) ----------

function gitOk(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失败: ${(r.stderr || '').trim()}`);
  return r.stdout.trim();
}

function fetchUpstream(ref, cacheDir) {
  // 与 hermes mcp_catalog 同款语义:tag/branch 走浅克隆 fast-path,SHA 回落全量克隆。
  mkdirSync(cacheDir, { recursive: true });
  const dest = resolve(cacheDir, 'pua');
  rmSync(dest, { recursive: true, force: true });
  const isSha = /^[0-9a-f]{7,40}$/.test(ref);
  if (!isSha) {
    const shallow = spawnSync('git', ['clone', '--depth', '1', '--branch', ref, PUA_REPOSITORY, dest], { encoding: 'utf8' });
    if (shallow.status !== 0) rmSync(dest, { recursive: true, force: true });
    else return dest;
  }
  gitOk(['clone', PUA_REPOSITORY, dest]);
  gitOk(['checkout', ref], dest);
  return dest;
}

function main() {
  const argv = process.argv.slice(2);
  const sourceIdx = argv.indexOf('--source');
  const refIdx = argv.indexOf('--ref');
  const explicitRef = refIdx >= 0 ? argv[refIdx + 1] : undefined;
  const existingPin = readPin();
  const ref = explicitRef || existingPin?.ref || 'main';

  let sourceRoot;
  if (sourceIdx >= 0) {
    sourceRoot = resolve(argv[sourceIdx + 1]);
    if (!existsSync(resolve(sourceRoot, 'skills'))) {
      console.error(`[vendor-pua] --source 缺少 skills/ 目录: ${sourceRoot}`);
      process.exit(1);
    }
  } else {
    const cacheDir = resolve(overlayRoot, '.runtime-cache');
    console.log(`[vendor-pua] 从 ${PUA_REPOSITORY} 拉取 ref=${ref} …`);
    sourceRoot = fetchUpstream(ref, cacheDir);
  }

  const commit = gitOk(['rev-parse', 'HEAD'], sourceRoot);
  const refDate = gitOk(['log', '-1', '--format=%cI', 'HEAD'], sourceRoot);
  const result = syncFromSource(sourceRoot, puaRoot, {
    ref, commit, refDate, vendoredAt: new Date().toISOString(),
  });
  console.log(`[vendor-pua] 同步完成 ref=${ref} commit=${commit.slice(0, 10)} 技能 ${result.skillNames.length} 个:`);
  for (const n of result.skillNames) console.log(`  - ${n}`);
  if (result.normalized.length) {
    console.log(`[vendor-pua] frontmatter 规范化(YAML1.1 布尔裸值加引号): ${result.normalized.join(', ')}`);
  }
  console.log(`[vendor-pua] PIN: ${pinPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
