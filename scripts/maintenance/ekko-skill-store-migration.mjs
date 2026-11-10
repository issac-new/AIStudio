// scripts/maintenance/ekko-skill-store-migration.mjs
// 一次性迁移：ekko 旧技能树（~/.hermes-web-ui/.ekko/skills）→ hermes profile 树。
// spec 2026-11-10-ekko-hermes-skill-store-unification。
//
// 规则与产品内嵌迁移器（补丁 760 的 EkkoDirectoryManager.migrateLegacySkillStore）
// 完全一致，二者共用同一 marker（.ekko-skill-store-unified-v3.json），幂等可交错：
// 谁先跑谁写 marker，另一方看到即跳过。
//   1. 每个 profile 目录里不在 builtin bundle 名单的技能＝独有 → 搬入 hermes
//      对应 profile 树；目标同名已存在则跳过（hermes 版胜）。bundle 名单零外部
//      依赖：直接读旧树每个 profile 目录自带的 .ekko-builtin-skills.json manifest
//      （产品内嵌迁移器读进程内 bundle 源，本脚本读旧树自证——两来源对同一批
//      目录恒等，因为 manifest 就是同步器当年写入的）。
//      profile 映射：default → ~/.hermes/skills（hermes 主 home），其余 →
//      ~/.hermes/profiles/<name>/skills。
//   2. 整树 tar 归档 → .ekko/skill-store-archive-<ts>.tar.gz（先存档再删）。
//   3. 删除旧树，写 v3 marker。
//
// 用法：node scripts/maintenance/ekko-skill-store-migration.mjs [--dry-run]
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';

const EKKO_ROOT = join(homedir(), '.hermes-web-ui', '.ekko');
const OLD_TREE = join(EKKO_ROOT, 'skills');
const MARKER_PATH = join(EKKO_ROOT, '.ekko-skill-store-unified-v3.json');
const HERMES_HOME = join(homedir(), '.hermes');
const BUILTIN_MANIFEST = '.ekko-builtin-skills.json';

const dryRun = process.argv.includes('--dry-run');

/** 纯函数：计算一个旧 profile 目录的迁移动作（测试复用）。 */
export function planProfileMigration(entries, bundleNames) {
  const bundle = new Set(bundleNames);
  const moveTo = [];   // 独有技能（搬迁）
  const drop = [];     // bundle 拷贝（随旧树删除，正本在共享根种子）
  for (const name of entries) {
    if (name.startsWith('.')) continue;
    if (bundle.has(name)) drop.push(name);
    else moveTo.push(name);
  }
  return { moveTo: moveTo.sort(), drop: drop.sort() };
}

/** 读旧 profile 目录自带的 builtin manifest（owner=ekko-agent 的键即名单）。 */
export function readBuiltinNames(legacyProfileDir) {
  try {
    const manifest = JSON.parse(readFileSync(join(legacyProfileDir, BUILTIN_MANIFEST), 'utf8'));
    return Object.entries(manifest ?? {})
      .filter(([, entry]) => !entry || entry.owner === undefined || entry.owner === 'ekko-agent')
      .map(([name]) => name);
  } catch {
    return [];
  }
}

/** ekko profile 名 → hermes skills 根（default=主 home，与 hermes 解析一致）。 */
export function hermesSkillsRoot(profile) {
  return profile === 'default'
    ? join(HERMES_HOME, 'skills')
    : join(HERMES_HOME, 'profiles', profile, 'skills');
}

function listSkillDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function main() {
  if (existsSync(MARKER_PATH)) {
    console.log('[ekko-skill-migration] v3 marker 已存在，幂等跳过。');
    return;
  }
  if (!existsSync(OLD_TREE)) {
    console.log('[ekko-skill-migration] 旧树不存在（已迁移或全新安装），写 marker 收口。');
    if (!dryRun) writeMarker();
    return;
  }

  const report = { profiles: [], moved: 0, skippedExisting: 0, droppedBundleCopies: 0 };
  for (const profile of listSkillDirs(OLD_TREE)) {
    const srcDir = join(OLD_TREE, profile);
    const entries = listSkillDirs(srcDir);
    const bundleNames = readBuiltinNames(srcDir);
    const plan = planProfileMigration(entries, bundleNames);
    const targetRoot = hermesSkillsRoot(profile);
    const actions = { profile, targetRoot, moved: [], skipped: [] };
    if (!dryRun) mkdirSync(targetRoot, { recursive: true });
    for (const name of plan.moveTo) {
      const dst = join(targetRoot, name);
      if (existsSync(dst)) {
        actions.skipped.push(name); // hermes 版胜
        report.skippedExisting += 1;
      } else {
        if (!dryRun) renameSync(join(srcDir, name), dst);
        actions.moved.push(name);
        report.moved += 1;
      }
    }
    report.droppedBundleCopies += plan.drop.length;
    report.profiles.push(actions);
    console.log(`  · ${profile}: 独有搬迁 ${actions.moved.length}、同名跳过 ${actions.skipped.length}、bundle 拷贝 ${plan.drop.length}（随旧树删）`);
  }

  if (dryRun) {
    console.log('[ekko-skill-migration] DRY-RUN 完成（未写任何变更）。');
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // 先存档再删：tar 归档整棵旧树（含搬迁后残留的 bundle 拷贝与 dotfile）。
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivePath = join(EKKO_ROOT, `skill-store-archive-${stamp}.tar.gz`);
  const tar = spawnSync('tar', ['-czf', archivePath, '-C', EKKO_ROOT, 'skills'], { stdio: 'pipe' });
  if (tar.status !== 0) {
    console.error(`[ekko-skill-migration] fail-fast：归档失败（${tar.stderr}），不删旧树。归档=${archivePath}`);
    process.exit(1);
  }
  rmSync(OLD_TREE, { recursive: true, force: true });
  writeMarker(archivePath);
  console.log(`[ekko-skill-migration] 完成：归档=${archivePath}；搬迁 ${report.moved}、跳过 ${report.skippedExisting}、删 bundle 拷贝 ${report.droppedBundleCopies}。`);
}

function writeMarker(archivePath) {
  mkdirSync(EKKO_ROOT, { recursive: true });
  writeFileSync(MARKER_PATH, JSON.stringify({
    version: 3,
    migratedAt: new Date().toISOString(),
    ...(archivePath ? { archivePath } : {}),
    note: 'ekko/hermes 技能存储合一（spec 2026-11-10-ekko-hermes-skill-store-unification）',
  }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
