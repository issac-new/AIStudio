// noop 哨兵（N33-1，挂账 2026-11-23-compat-release-pending-batch）：
// v2 noop 判定只核 baseline treeOids＋series 逐项 sha＋前缀一致，不验补丁落盘——
// 树被外部还原（git checkout -- vendor/ / reset --hard）后清单残留即判 noop 静默
// 跳过（v1.0.19 发版轮两次中毒实录：投影误植 130→CI parity 红、路由实验全污染）。
// 本哨兵在 noop 收场前核「清单声明 applied 的 lane 在 git 工作树确有差异」：
//   ok       —— 各 applied lane 均有落盘差异（健康 noop，行为不变）
//   reverted —— 所有 applied lane 均零差异＝清单残留、树已还原（可安全全量重放）
//   mixed    —— 部分还原＝清单与树不一致且不可自动判定归属（拒绝，指引 clean）
// 非 git 仓/命令异常按「有差异」放行（保守：不阻断既有 noop 语义）。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/** lane 根 → git 工作树是否有 tracked 修改或未跟踪新增（忽略规则生效，node_modules 天然不计）。 */
function treeDirty(root) {
  const r = spawnSync('git', ['status', '--porcelain', '--', '.'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) return true;
  return r.stdout.trim().length > 0;
}

/**
 * @param manifest v2 清单（patches 逐项 status）
 * @param lanes    { [target]: 绝对根 } 各 lane 根；缺席 lane（absent-tree 跳过态）不传即不核
 * @returns {'ok' | 'reverted' | 'mixed'}
 */
export function noopSentinel(manifest, lanes) {
  const appliedLanes = new Set(
    (manifest.patches ?? []).filter((p) => p.status === 'applied').map((p) => p.target),
  );
  const dirty = [...appliedLanes]
    .filter((t) => lanes[t] && existsSync(lanes[t]))
    .map((t) => treeDirty(lanes[t]));
  if (dirty.length === 0) return 'ok';
  if (dirty.every(Boolean)) return 'ok';
  if (dirty.every((v) => !v)) return 'reverted';
  return 'mixed';
}
