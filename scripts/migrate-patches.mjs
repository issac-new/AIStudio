// overlay/scripts/migrate-patches.mjs — 上游升级时的 patch 批量三向迁移工具
//
// 场景:upstream/hermes-studio 升级到新 tag 后,overlay/patches 里的旧 patch
// 因上下文漂移无法 git apply。本工具用 git 三向合并批量迁移:
//   1. 在 upstream 仓建临时分支 overlay-migrate-old:checkout 旧 base tag,
//      依序应用全部旧 studio patch,每个 commit 一次——由此旧世界全部
//      中间态 blob(每个 patch 的 pre/post image)进入对象库。
//   2. 建临时分支 overlay-migrate-new:checkout 新 tag,对每个 studio patch
//      执行 git apply -3(pre/post blob 已在对象库,三向合并可解上下文漂移)。
//      干净合并 → 自动 commit 并用 git diff HEAD~1 HEAD 再生成 patch 文件;
//      空 diff(上游已原生吸收)→ 从 series 退役并删文件;
//      留冲突标记 → 停下等人工:解标记后 git add -A && git commit -m
//      "migrate: <patch名>" 再重跑本工具续传。
//   3. --finish:checkout 回新 tag 还原纯净工作树,删两条临时分支与状态文件,
//      后续走标准 npm run inject 验证。
//
// hermes-agent 路由的 patch 不迁移(agent 仓未动,原 patch 继续有效);
// zcode-patches/ 独立体系不涉及。进度按 new 链上的 "migrate: <名>" commit
// 识别,可反复重跑续传。上游 .git 仅短暂持有临时分支,--finish 后完全还原
// (commit 成不可达孤儿对象,无引用残留)。
import { readFileSync, writeFileSync, existsSync, unlinkSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const studioRoot = resolve(overlayRoot, '..', 'upstream', 'hermes-studio');
const patchDir = resolve(overlayRoot, 'patches');
const seriesFile = resolve(patchDir, 'series');
const stateFile = resolve(overlayRoot, '.patch-migrate.json');
const OLD_BRANCH = 'overlay-migrate-old';
const NEW_BRANCH = 'overlay-migrate-new';

// 与 inject.mjs 同一事实源:hermes-agent 路由谓词
const { HERMES_AGENT_PATCH_PREFIXES } = await import('./inject.mjs');
const isAgentPatch = (patchText) => {
  const m = patchText.match(/^(?:---|\+\+\+) [ab]\/(.+?)$/m);
  if (!m) return false;
  return HERMES_AGENT_PATCH_PREFIXES.some((p) => m[1].startsWith(p));
};

const sh = (cmd, cwd = studioRoot) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const trySh = (cmd, cwd = studioRoot) => {
  try {
    return { ok: true, out: execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString() };
  } catch (e) {
    return { ok: false, out: (e.stdout?.toString?.() || '') + (e.stderr?.toString?.() || '') };
  }
};
const readSeries = () =>
  readFileSync(seriesFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

function patchTargets(patchText) {
  const out = [];
  for (const line of patchText.split('\n')) {
    const m = line.match(/^\+\+\+ [ab]\/(.+?)(?:\t.*)?$/);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

const hasMarkers = (files) => {
  const bad = [];
  for (const f of files) {
    const abs = resolve(studioRoot, f);
    if (!existsSync(abs)) continue;
    if (/^<{7}( |$)/m.test(readFileSync(abs, 'utf8'))) bad.push(f);
  }
  return bad;
};

const loadState = () => (existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : null);
const saveState = (s) => writeFileSync(stateFile, JSON.stringify(s, null, 2));

const migratedSet = () => {
  const log = trySh(`git log --format=%s ${NEW_BRANCH}`).out;
  return new Set(
    log.split('\n').filter((l) => l.startsWith('migrate: ')).map((l) => l.slice('migrate: '.length).trim()),
  );
};

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--run'));
  const mode = args.includes('--finish') ? '--finish' : 'run';
  const series = readSeries();

  if (mode === '--finish') {
    const st = loadState();
    if (!st) { console.error('[migrate] 无状态文件,无需 finish'); process.exit(1); }
    sh(`git checkout --force --detach ${st.newHead}`);
    sh('git clean -fdx');
    const del = trySh(`git branch -D ${OLD_BRANCH} ${NEW_BRANCH}`);
    console.log(del.ok ? `[migrate] 已删临时分支` : `[migrate] 删分支输出: ${del.out.trim()}`);
    unlinkSync(stateFile);
    console.log('[migrate] finish 完成。上游已还原纯净,接下来:npm run inject && npm install');
    return;
  }

  // ---- run ----
  const baseTag = args.find((a) => !a.startsWith('--'));
  const st = loadState() || {};
  if (!st.newHead) {
    st.newHead = sh('git rev-parse HEAD').trim();
    st.newTag = sh('git describe --tags').trim();
    saveState(st);
  }
  if (!st.baseTag) {
    st.baseTag = baseTag || process.env.MIGRATE_BASE_TAG;
    if (!st.baseTag) {
      console.error('[migrate] 需要旧 base tag:node scripts/migrate-patches.mjs v0.7.29(或环境变量 MIGRATE_BASE_TAG)');
      process.exit(1);
    }
    saveState(st);
  }
  console.log(`[migrate] base=${st.baseTag} new=${st.newTag} (${st.newHead})`);

  // 步骤1:old 链(重建旧世界中间态 blob)
  if (trySh(`git rev-parse --verify ${OLD_BRANCH}`).ok) {
    console.log('[migrate] old 链已存在,跳过重建');
  } else {
    console.log('[migrate] 建 old 链(v0.7.29 + 全部旧 studio patch,逐个 commit)…');
    sh(`git checkout --force -B ${OLD_BRANCH} ${st.baseTag}`);
    sh('git clean -fdx');
    for (const p of series) {
      const pf = resolve(patchDir, p);
      if (!existsSync(pf)) { console.error(`[migrate] patch 缺失: ${p}`); process.exit(1); }
      const text = readFileSync(pf, 'utf8');
      if (isAgentPatch(text)) continue; // agent 仓未动,无需进 old 链
      const r = trySh(`git apply --whitespace=nowarn "${pf}"`);
      if (!r.ok) {
        console.error(`[migrate] old 链应用失败(${p}),base tag 可能不对:\n${r.out}`);
        process.exit(1);
      }
      sh(`git add -A && git commit -q -m "oldchain: ${p}" --no-verify`);
    }
    console.log('[migrate] old 链完成');
  }

  // 步骤2:new 链(三向迁移)
  if (!trySh(`git rev-parse --verify ${NEW_BRANCH}`).ok) {
    sh(`git checkout --force -B ${NEW_BRANCH} ${st.newHead}`);
    sh('git clean -fdx');
  } else {
    sh(`git checkout --force ${NEW_BRANCH}`);
  }
  const done = migratedSet();
  const retired = [];
  let pending = null;

  for (const p of series) {
    if (done.has(p)) continue;
    const pf = resolve(patchDir, p);
    if (!existsSync(pf)) { console.error(`[migrate] patch 缺失: ${p}`); process.exit(1); }
    const text = readFileSync(pf, 'utf8');
    if (isAgentPatch(text)) { console.log(`[migrate] 跳过(agent 路由): ${p}`); continue; }

    const r = trySh(`git apply -3 --whitespace=nowarn "${pf}"`);
    let marked = hasMarkers(patchTargets(text));
    // 兜底:patch index 行的 blob 哈希与 old 链中间态失配时,直接从 old 链
    // 对应 commit 提取 base/pre 与 theirs/post 内容,git merge-file 三向合并。
    if (!r.ok && marked.length === 0 && /lacks the necessary blob/.test(r.out)) {
      const sha = trySh(`git log --format=%H --grep="^oldchain: ${p.replaceAll('.', '\\.')}$" -1 ${OLD_BRANCH}`).out.trim();
      if (sha) {
        let allClean = true;
        for (const f of patchTargets(text)) {
          const abs = resolve(studioRoot, f);
          const baseR = trySh(`git show '${sha}^:${f}'`);
          const theirsR = trySh(`git show '${sha}:${f}'`);
          if (!theirsR.ok) continue; // old 链里无此文件(新增文件等),走通用逻辑
          if (!baseR.ok) { // patch 新增的文件:当前不存在则直接落盘
            if (!existsSync(abs)) writeFileSync(abs, theirsR.out);
            continue;
          }
          if (!existsSync(abs)) continue;
          const tmp = (tag) => `/tmp/mig-${tag}-${f.replaceAll('/', '_')}`;
          writeFileSync(tmp('ours'), readFileSync(abs));
          writeFileSync(tmp('base'), baseR.out);
          writeFileSync(tmp('theirs'), theirsR.out);
          const mf = trySh(`git merge-file -L ours -L base -L theirs '${tmp('ours')}' '${tmp('base')}' '${tmp('theirs')}'`);
          writeFileSync(abs, readFileSync(tmp('ours')));
          if (mf.out.trim() !== '0' && !mf.ok) allClean = false; // 有冲突标记,留给人工
        }
        if (allClean) {
          sh(`git add -A && git commit -q -m "migrate: ${p}" --no-verify`);
          const diff = sh('git diff HEAD~1 HEAD --binary --no-color');
          if (!diff.trim()) { retired.push(p); rmSync(pf); console.log(`[migrate] 已退役(上游原生吸收,空 diff): ${p}`); }
          else { writeFileSync(pf, diff); console.log(`[migrate] 已迁移并再生(merge-file 兜底): ${p}`); }
          continue;
        }
        marked = hasMarkers(patchTargets(text));
        if (marked.length > 0) { pending = { patch: p, detail: `merge-file 兜底后仍有标记: ${marked.join(', ')}` }; break; }
      }
    }
    if (!r.ok && marked.length === 0) {
      pending = { patch: p, detail: r.out };
      break;
    }
    if (marked.length > 0) {
      pending = { patch: p, detail: `冲突标记留在: ${marked.join(', ')}` };
      break;
    }
    // 干净合并(或 -3 报 "with conflicts" 但实无标记)→ 自动提交并再生 patch
    sh(`git add -A && git commit -q -m "migrate: ${p}" --no-verify`);
    const diff = sh('git diff HEAD~1 HEAD --binary --no-color');
    if (!diff.trim()) {
      retired.push(p);
      rmSync(pf);
      console.log(`[migrate] 已退役(上游原生吸收,空 diff): ${p}`);
    } else {
      writeFileSync(pf, diff);
      console.log(`[migrate] 已迁移并再生: ${p}`);
    }
  }

  // series 同步退役项
  if (retired.length > 0) {
    const kept = readSeries().filter((l) => !retired.includes(l));
    writeFileSync(seriesFile, kept.join('\n') + '\n');
  }

  if (pending) {
    console.error(`\n[migrate] 停在需人工的 patch: ${pending.patch}\n${pending.detail}`);
    console.error('手工步骤:解决冲突标记 → git add -A && git commit -m "migrate: ' + pending.patch + '" → 重跑本工具');
    process.exit(2);
  }
  const remaining = series.filter((p) => !migratedSet().has(p) && existsSync(resolve(patchDir, p)) &&
    !isAgentPatch(readFileSync(resolve(patchDir, p), 'utf8')));
  if (remaining.length > 0) { console.error(`[migrate] 未完成: ${remaining.join(', ')}`); process.exit(2); }
  console.log(`[migrate] 全部 studio patch 迁移完成。退役 ${retired.length} 个。`);
  console.log('[migrate] 验证:npm run clean 不需要;直接 node scripts/migrate-patches.mjs --finish,然后 npm run inject');
}

main();
