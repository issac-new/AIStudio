// 注入 Planner（P1 注入核心，平台重写 Task 3）。
// 纯函数层：从 series 文本构造有序注入计划。不做任何写入、不解析绝对
// upstream 根——目标树以树名表达（hermes-studio/hermes-agent/zcode），
// 绝对根由 Executor/入口负责（scripts/inject.mjs 接线见 Task 5）。
//
// 单一事实源约定：
//   - patch 目标路由复用 inject.mjs 的 HERMES_AGENT_PATCH_PREFIXES 谓词
//     （isHermesAgentPatchPath），本模块不复制前缀清单。
//   - 新增文件解析复用 scripts/lib/zcode-patch-manifest.mjs 的
//     addedFilesFromPatch（纯解析，zcode/hermes 两通道同构）。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isHermesAgentPatchPath } from '../../inject.mjs';
import { addedFilesFromPatch } from '../../lib/zcode-patch-manifest.mjs';

/** series 文本 → 有序补丁名清单（剥 # 注释与空行；与 inject.mjs readSeries 同口径）。 */
export function parseSeriesText(seriesText) {
  return String(seriesText ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

/**
 * 补丁文本 → 目标树名（resolvePatchTargetRoot 的纯函数版）。
 * 解析规则与 inject.mjs 一致：优先 ---/+++ 头，回退 diff --git 行
 * （594/595 等手写无头补丁先例）；不可解析时默认 hermes-studio。
 */
export function routePatchTarget(patchText) {
  const text = String(patchText ?? '');
  let targetPath = null;
  const headerMatch = text.match(/^(?:---|\+\+\+) [ab]\/(.+?)$/m);
  if (headerMatch) {
    targetPath = headerMatch[1];
  } else {
    const gitLineMatch = text.match(/^diff --git a\/(.+?) b\/.+$/m);
    if (gitLineMatch) targetPath = gitLineMatch[1];
  }
  if (!targetPath) return 'hermes-studio';
  return isHermesAgentPatchPath(targetPath) ? 'hermes-agent' : 'hermes-studio';
}

/** 解析 patchDir 参数：字符串=hermes 补丁目录（zcode 取兄弟 zcode-patches/），对象=显式双目录。 */
function resolvePatchDirs(patchDir) {
  if (typeof patchDir === 'string') {
    return { hermes: patchDir, zcode: resolve(patchDir, '..', 'zcode-patches') };
  }
  if (patchDir && typeof patchDir === 'object' && patchDir.hermes && patchDir.zcode) {
    return { hermes: patchDir.hermes, zcode: patchDir.zcode };
  }
  throw new Error('buildPlan: patchDir 必须是 hermes 补丁目录字符串或 {hermes, zcode} 对象');
}

function readPatchOrThrow(dir, name, channel) {
  const path = resolve(dir, name);
  try {
    return readFileSync(path);
  } catch {
    // 缺失即响亮失败：series 登记与磁盘事实不符，静默跳过=「尝试过伪装成功」。
    throw new Error(`buildPlan: ${channel} 补丁文件不存在（series 登记与磁盘不符）: ${path}`);
  }
}

/**
 * 构造有序注入计划。
 * @param seriesText patches/series 文本（hermes 通道）
 * @param zcodeSeriesText zcode-patches/series 文本（zcode 通道）
 * @param patchDir hermes 补丁目录字符串或 {hermes, zcode} 目录对象
 * @returns PlanItem[]：hermes 通道（series 序）在前、zcode 通道在后；
 *   每项 {channel, target, name, sha256, seriesIndex, addedFiles[]}，
 *   seriesIndex 为通道内序号，sha256 为补丁文件字节 SHA-256。
 */
export function buildPlan(seriesText, zcodeSeriesText, patchDir) {
  const dirs = resolvePatchDirs(patchDir);
  const items = [];
  const hermesNames = parseSeriesText(seriesText);
  hermesNames.forEach((name, seriesIndex) => {
    const bytes = readPatchOrThrow(dirs.hermes, name, 'hermes');
    const text = bytes.toString('utf8');
    items.push({
      channel: 'hermes',
      target: routePatchTarget(text),
      name,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      seriesIndex,
      addedFiles: addedFilesFromPatch(text),
    });
  });
  const zcodeNames = parseSeriesText(zcodeSeriesText);
  zcodeNames.forEach((name, seriesIndex) => {
    const bytes = readPatchOrThrow(dirs.zcode, name, 'zcode');
    const text = bytes.toString('utf8');
    items.push({
      channel: 'zcode',
      target: 'zcode',
      name,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      seriesIndex,
      // zcode 通道同样按补丁声明记录新增文件（clean 分树删除的清单面）
      addedFiles: addedFilesFromPatch(text),
    });
  });
  return items;
}
