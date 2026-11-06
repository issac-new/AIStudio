// patch-touched.mjs — hermes-agent 补丁触碰面派生（N-1 根治，spec 2026-11-06-runtime-patch-touched-deploy）。
//
// 缺口背景：runtime-manifest.json 只登记补丁**新增**文件；补丁对既有文件的修改
// （601 agent_init 接线、470 collab_event_id 等）从未进部署面——宿主接线历史上
// 依赖「谁记得谁手工同步」（v0230 批 149 件、发版批 8 件回灌都是事故级补丁）。
// 本模块把「series 里 agent 面补丁碰了哪些文件」变成 deploy 器可消费的派生面：
// 补丁增删即自动跟随，零第二清单维护（D1）。
//
// 口径单一事实源（不复制）：
//   - series 解析与 agent 面路由复用 inject/planner.mjs（routePatchTarget/
//     parseSeriesText），与 inject 主链同一判定；
//   - 触碰文件取 `diff --git a/X b/Y` 头的 Y 侧（新文件 Y=真实路径、
//     删除文件 Y=/dev/null → 记 deleted 不参与同步，D4）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSeriesText, routePatchTarget } from '../inject/planner.mjs';

/** 单枚补丁文本 → 触碰文件对（修改/新增 → files；删除 → deleted）。 */
export function touchedFilesFromPatchText(patchText) {
  const files = new Set();
  const deleted = new Set();
  const text = String(patchText ?? '');
  // 按 `diff --git a/X b/Y` 头分段；删除判定看段内 `+++ /dev/null`（git 的删除文件头
  // b 侧仍是文件名，/dev/null 只出现在 +++ 行——头行判删会漏，纯实测坑）。
  const segments = text.split(/^diff --git /m).slice(1);
  for (const seg of segments) {
    const head = seg.match(/^a\/(\S+) b\/(\S+)/);
    if (!head) continue;
    const [, aPath, bPath] = head;
    if (/^\+\+\+ \/dev\/null$/m.test(seg)) {
      if (aPath !== '/dev/null') deleted.add(aPath);
    } else {
      files.add(bPath);
    }
  }
  return { files, deleted };
}

/**
 * series 文本（或补丁目录路径）→ agent 面补丁触碰面。
 * @param {string} patchDir patches/ 绝对路径
 * @param {string} seriesText series 文件原文
 * @returns {{ files: Set<string>, deleted: Set<string>, agentPatches: number, studioPatches: number }}
 */
export function deriveAgentPatchTouchedFiles(patchDir, seriesText) {
  const names = parseSeriesText(seriesText);
  const files = new Set();
  const deleted = new Set();
  let agentPatches = 0;
  let studioPatches = 0;
  for (const name of names) {
    let text = '';
    try { text = readFileSync(join(patchDir, name), 'utf8'); } catch { continue; }
    if (routePatchTarget(text) !== 'hermes-agent') { studioPatches++; continue; }
    agentPatches++;
    const t = touchedFilesFromPatchText(text);
    for (const f of t.files) files.add(f);
    for (const f of t.deleted) { deleted.add(f); files.delete(f); }
  }
  return { files, deleted, agentPatches, studioPatches };
}
