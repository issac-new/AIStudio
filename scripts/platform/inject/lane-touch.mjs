// noop 哨兵（N33-1，挂账 2026-11-23-compat-release-pending-batch）：
// v2 noop 判定只核 baseline treeOids＋series 逐项 sha＋前缀一致，不验补丁落盘——
// 树被外部还原后清单残留即判 noop 静默跳过（v1.0.19 发版轮两次中毒实录：投影
// 误植 130→CI parity 红、路由实验全污染）。
//
// N34-9 修订（挂账 2026-11-24-zcode-400-pending-batch）：判别证据从「通道下
// git status 有没有输出」改为「补丁改过的已跟踪文件还在不在状态输出里」。
// `git checkout -- <目录>` 与 `git reset --hard` 只还原已跟踪文件、不清理补丁新增的
// 未跟踪文件，旧判别在半还原态下三个通道都「有输出」而判 ok（实录：清单
// status=complete、connectionsExtras 计数 0、路由 130，直到 docs:check 才暴露）。
// 被还原的已跟踪文件会从状态输出里彻底消失；被后续补丁或人工继续改过的文件仍在
// 输出里——路径级证据对补丁链式叠加与在途改动都不误报。内容精确校验不可用：健康
// 注入态下逐补丁 `git apply --check --reverse` 512 条里 213 条因后续补丁改同一文件
// 而失败。
//   ok       —— 各 applied 通道没有缺失的已跟踪证据（健康 noop，行为不变）
//   reverted —— 各 applied 通道都是「补丁改过的已跟踪文件一个都不在位，且通道里
//               没有任何已跟踪改动」＝树已被外部还原
//               （先清残留新增文件再全量重放，见 sweepResidualAddedFiles）
//   mixed    —— 介于两者之间＝清单与树不一致且不可自动判定归属（拒绝，指引 clean）
// 非 git 树/命令异常、或通道没有任何可观察证据时按「在位」放行（保守：不阻断既有 noop 语义）。
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, unlinkSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/**
 * 通道根 → git 状态输出里的路径，按状态位分两组：modified＝已跟踪改动（修改、暂存、
 * 删除、冲突、重命名两端），untracked＝未跟踪新增。失败返回 null。
 * -z：路径不转义（中文与空格路径原样）、不折叠未跟踪目录；--untracked-files=all：
 * 补丁先新增、后被另一补丁修改的文件逐个列出。
 */
export function treeStatusPaths(root) {
  // --porcelain 的路径相对仓库根：通道是本仓子目录（vendor/…）时带目录前缀，按 show-prefix 剥掉。
  // show-prefix 的输出带结尾换行，必须先去掉——2026-11-24 实录：没去换行时前缀比对全部落空、
  // 路径全带前缀，健康注入态被误判「已还原」并清掉了补丁新增文件。
  const pre = spawnSync('git', ['rev-parse', '--show-prefix'], { cwd: root, encoding: 'utf8' });
  if (pre.status !== 0) return null;
  const r = spawnSync('git', ['status', '--porcelain', '-z', '--untracked-files=all', '--', '.'],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  const prefix = pre.stdout.replace(/\r?\n$/, '');
  const strip = (p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p);
  const modified = new Set();
  const untracked = new Set();
  let trackedEntry = false; // 重命名/复制条目的下一个字段是不带状态位的原路径，归属同上一条
  for (const token of r.stdout.split('\u0000')) {
    if (!token) continue;
    if (/^[ MADRCU?!]{2} /.test(token)) {
      trackedEntry = !token.startsWith('??');
      (trackedEntry ? modified : untracked).add(strip(token.slice(3)));
    } else if (trackedEntry) {
      modified.add(strip(token));
    }
  }
  return { modified, untracked };
}

const STATE_LABEL = { absent: '已还原', partial: '部分还原' };

/**
 * 逐通道核对清单声明的已应用补丁是否真的落在工作树上。
 * @param manifest v2 清单（patches 逐项 status）
 * @param items    PlanItem[]（与清单前缀逐项对应；提供 trackedFiles——补丁改过的已跟踪文件）
 * @param lanes    { [target]: 绝对根 } 各通道根；缺席通道（absent-tree 跳过态）不传即不核
 * @param statusOf 可注入：通道根 → { modified, untracked } | null（缺省取真实 git status）
 * @returns {{ verdict: 'ok' | 'reverted' | 'mixed', lanes: {
 *   [target]: { state: 'present' | 'absent' | 'partial', tracked: number, present: number,
 *              neutral: number, missing: string[] } } }}
 *   tracked＝补丁改过的文件数；present＝其中有已跟踪改动证据的；neutral＝只以未跟踪形态
 *   出现的；missing＝状态输出里没有的。
 *   补丁改过的每个文件按状态位归类：已跟踪改动＝在位证据；只以未跟踪形态出现＝中性
 *   （这类文件是链上更早的补丁新建的，git checkout／reset 动不了它，无从判别，不参与判定）；
 *   状态输出里没有＝缺失。
 *   state：present＝没有缺失（或无可观察证据）；
 *   absent＝有缺失且没有任何在位证据，同时通道里没有任何已跟踪改动——只有
 *   `git checkout`／`reset`／`stash` 会造成这个状态，是「已还原」的唯一形态；
 *   partial＝其余情况（部分在位，或补丁面全缺但通道里另有已跟踪改动——后者可能是
 *   开发者在途改动或判别失配，不得当作已还原处理）。
 */
export function sentinelReport(manifest, items, lanes, statusOf = treeStatusPaths) {
  const trackedOf = new Map(items.map((it) => [`${it.channel}/${it.name}`, it.trackedFiles ?? []]));
  const applied = (manifest.patches ?? []).filter((p) => p.status === 'applied');
  const report = { verdict: 'ok', lanes: {} };
  for (const target of new Set(applied.map((p) => p.target))) {
    const root = lanes[target];
    if (!root || !existsSync(root)) continue;
    const recs = applied.filter((p) => p.target === target);
    const tracked = new Set();
    for (const rec of recs) {
      for (const f of trackedOf.get(`${rec.channel}/${rec.name}`) ?? []) tracked.add(f);
    }
    const status = statusOf(root);
    if (!status) {
      report.lanes[target] = { state: 'present', tracked: tracked.size, present: tracked.size, neutral: 0, missing: [] };
      continue;
    }
    if (tracked.size === 0) {
      // 纯新增文件面的通道：新增文件在不在磁盘是唯一可观察证据；连声明都没有则无从判断
      const added = recs.flatMap((r) => r.addedFiles ?? []);
      const anyAdded = added.some((f) => existsSync(resolve(root, f)));
      report.lanes[target] = {
        state: added.length === 0 || anyAdded ? 'present' : 'absent',
        tracked: 0, present: anyAdded ? 1 : 0, neutral: 0, missing: [],
      };
      continue;
    }
    const missing = [];
    let present = 0;
    for (const f of tracked) {
      if (status.modified.has(f)) present += 1;
      else if (!status.untracked.has(f)) missing.push(f);
    }
    const state = missing.length === 0 ? 'present'
      : present > 0 || status.modified.size > 0 ? 'partial'
        : 'absent';
    report.lanes[target] = {
      state, tracked: tracked.size, present, neutral: tracked.size - present - missing.length, missing,
    };
  }
  const states = Object.values(report.lanes).map((l) => l.state);
  if (states.length === 0 || states.every((s) => s === 'present')) return report;
  report.verdict = states.every((s) => s === 'absent') ? 'reverted' : 'mixed';
  return report;
}

/** mixed 拒绝信息：逐通道列出不在位的状态与缺失的已跟踪文件（每通道最多 5 处）。 */
export function describeSentinelLanes(report) {
  return Object.entries(report.lanes)
    .filter(([, info]) => info.state !== 'present')
    .map(([lane, info]) => {
      const shown = info.missing.slice(0, 5).join(', ');
      const detail = info.tracked === 0
        ? '通道无已跟踪文件面，声明的新增文件一个都不在'
        : `补丁改过的文件 ${info.tracked} 个：在位 ${info.present}、中性 ${info.neutral}、缺 ${info.missing.length}${shown ? `（如 ${shown}）` : ''}`;
      return `${lane}：${STATE_LABEL[info.state]}（${detail}）`;
    });
}

/**
 * 「已还原」自愈的前置：删除清单声明 applied、仍留在磁盘上的补丁新增文件。
 * 这些文件是 git 还原留下的（checkout/reset 不清理未跟踪文件），不清则全量重放会在
 * 「文件已存在」上失败。删除面与 v2 clean 的「分树删除 addedFiles」相同：按清单逐项
 * 记录路由到目标树、越界路径拒绝、不跟随符号链接、只删普通文件。
 * @returns {{ removed: number, skipped: number }} skipped＝越界或删除失败的条数
 */
export function sweepResidualAddedFiles(manifest, lanes) {
  let removed = 0;
  let skipped = 0;
  for (const rec of manifest.patches ?? []) {
    if (rec.status !== 'applied') continue;
    const root = lanes[rec.target];
    if (!root || !existsSync(root)) continue;
    for (const rel of rec.addedFiles ?? []) {
      const abs = resolve(root, rel);
      const inward = relative(root, abs);
      if (!inward || inward.startsWith('..') || isAbsolute(inward)) {
        skipped += 1;
        continue;
      }
      try {
        if (existsSync(abs) && lstatSync(abs).isFile()) {
          unlinkSync(abs);
          removed += 1;
        }
      } catch {
        skipped += 1;
      }
    }
  }
  return { removed, skipped };
}
