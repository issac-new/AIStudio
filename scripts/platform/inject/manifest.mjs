// manifest v2 契约与严格增量判定（P1 注入核心，平台重写 Task 3）。
//
// 语义不可妥协项（docs/superpowers/specs/2026-11-05-platform-rewrite-design.md 4.1）：
//   - manifest v2 逐补丁记录 {channel,target,name,sha256,seriesIndex,addedFiles,status,reason}；
//     整体 status 只有 complete/partial/failed。
//   - 兼容数组 appliedPatches/appliedZcodePatches 只从 status==='applied' 派生——
//     失败、跳过、回滚项不得进入任何 applied/success 投影。
//   - 只允许「已验证精确前缀后的尾部增量」；改名/修改/中插/删除/重排/基线变/
//     根变/上次失败/v1 manifest 一律 IncrementRefusedError（要求 clean 后全量重放）。
//   - v1 manifest 不可自动收养为 v2。
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

export const SCHEMA_VERSION = 2;
const MANIFEST_TMP_SUFFIX = '.tmp';

/** 严格增量拒绝错误：reason ∈ {v1-manifest,last-failed,root-change,baseline-change,rename,modify,insert,reorder,removed}。 */
export class IncrementRefusedError extends Error {
  constructor(reason, detail) {
    super(`增量注入被拒绝（${reason}）${detail ? `：${detail}` : ''}——请 npm run clean && npm run inject 全量重放`);
    this.name = 'IncrementRefusedError';
    this.reason = reason;
    this.detail = detail ?? null;
  }
}

export function isV2Manifest(manifest) {
  return Boolean(manifest) && typeof manifest === 'object' && manifest.schemaVersion === SCHEMA_VERSION;
}

const normTreeOids = (treeOids) => ({
  'hermes-studio': treeOids?.['hermes-studio'] ?? null,
  'hermes-agent': treeOids?.['hermes-agent'] ?? null,
  zcode: treeOids?.zcode ?? null,
});

/** 空 manifest 骨架。baseline: {upstreamRoot, treeOids:{'hermes-studio','hermes-agent',zcode}}，缺席= null。 */
export function emptyManifest(baseline = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: null,
    baseline: {
      upstreamRoot: baseline.upstreamRoot ?? null,
      treeOids: normTreeOids(baseline.treeOids),
    },
    patches: [],
    runtimeDeploy: null,
    status: 'complete', // 空计划=无事可做=complete；执行器按逐项结果推导最终 status
  };
}

/** 整体 status 推导：任一 failed→failed；否则存在非 applied（skipped/rolled-back）→partial；否则 complete。 */
function deriveStatus(patches) {
  if (patches.some((p) => p.status === 'failed')) return 'failed';
  if (patches.some((p) => p.status !== 'applied')) return 'partial';
  return 'complete';
}

/**
 * 追加一个补丁的真实执行结果（纯函数：返回新 manifest，不改入参）。
 * @param item PlanItem（planner.buildPlan 产物）
 * @param result {status:'applied'|'skipped'|'failed'|'rolled-back', reason?:string, addedFiles?:string[]}
 *   applied 时 addedFiles 默认取计划声明；其余状态一律 []（未落盘就没有产出面）。
 */
export function applyPlanToManifest(manifest, item, result) {
  const status = result?.status;
  if (!['applied', 'skipped', 'failed', 'rolled-back'].includes(status)) {
    throw new Error(`applyPlanToManifest: 非法逐项 status "${status}"（${item?.name}）`);
  }
  const patches = [
    ...manifest.patches,
    {
      channel: item.channel,
      target: item.target,
      name: item.name,
      sha256: item.sha256,
      seriesIndex: item.seriesIndex,
      addedFiles: status === 'applied' ? (result.addedFiles ?? item.addedFiles ?? []) : [],
      status,
      reason: result.reason ?? null,
    },
  ];
  return { ...manifest, patches, status: deriveStatus(patches) };
}

/** 兼容数组：只从 status==='applied' 派生（hermes 通道）。 */
export function deriveAppliedPatches(manifest) {
  if (!isV2Manifest(manifest)) return [];
  return manifest.patches.filter((p) => p.status === 'applied' && p.channel === 'hermes').map((p) => p.name);
}

/** 兼容数组：只从 status==='applied' 派生（zcode 通道）。 */
export function deriveAppliedZcodePatches(manifest) {
  if (!isV2Manifest(manifest)) return [];
  return manifest.patches.filter((p) => p.status === 'applied' && p.channel === 'zcode').map((p) => p.name);
}

/**
 * partial 是否可接受（standalone 语义保留的边界）：
 * 仅当所有非 applied 项都是 absent-tree 跳过、且 runtime 部署无 partial/failed。
 * 其它 partial（blocked-by-failed 残余、部署保留目标等）一律不可当成功。
 */
export function isAcceptablePartial(manifest) {
  if (!isV2Manifest(manifest) || manifest.status !== 'partial') return false;
  if (manifest.patches.some((p) => p.status !== 'applied' && p.reason !== 'absent-tree')) return false;
  const rd = manifest.runtimeDeploy;
  if (rd && rd.apply && rd.apply !== 'complete') return false;
  return true;
}

/** 读 manifest 文件：缺席返回 null（不猜）；JSON 损坏抛错（不静默当 v1/v2）。 */
export function readManifestFile(path) {
  if (!existsSync(path)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`manifest 文件损坏（${path}）：${e.message}——请 npm run clean && npm run inject 全量重放`);
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`manifest 文件内容非法（${path}）——请 npm run clean && npm run inject 全量重放`);
  }
  return parsed;
}

/**
 * 原子写 manifest：兼容数组从 applied 项派生后一并落盘；tmp 写入+rename，
 * 任何时刻磁盘上不存在半份 manifest（spec 4.1.6）。
 */
export function writeManifestAtomic(path, manifest) {
  if (!isV2Manifest(manifest)) throw new Error('writeManifestAtomic: 只接受 v2 manifest');
  const out = {
    ...manifest,
    generatedAt: new Date().toISOString(),
    appliedPatches: deriveAppliedPatches(manifest),
    appliedZcodePatches: deriveAppliedZcodePatches(manifest),
  };
  mkdirSync(dirname(path), { recursive: true });
  const tmpPath = `${path}${MANIFEST_TMP_SUFFIX}`;
  writeFileSync(tmpPath, `${JSON.stringify(out, null, 2)}\n`);
  renameSync(tmpPath, path);
}

/** 清理原子写可能遗留的 tmp 文件（异常中断后的卫生步；正常路径 rename 已消费）。 */
export function pruneManifestTmp(path) {
  const tmpPath = `${path}${MANIFEST_TMP_SUFFIX}`;
  try {
    if (existsSync(tmpPath)) unlinkSync(tmpPath);
  } catch { /* 卫生步失败不阻断 */ }
}

/**
 * 严格增量判定：manifest.patches 必须是 plan.items 的已验证精确前缀；
 * 只允许尾部纯追加。任何其它形态抛 IncrementRefusedError。
 * @param manifest 现有 v2 manifest（非 v2 一律拒绝——含 v1 自动收养禁令）
 * @param plan {baseline:{upstreamRoot,treeOids}, items:PlanItem[]}（或裸 items 数组=跳过基线比对，纯前缀测试用）
 * @returns {kind:'noop'|'tail-append', items:PlanItem[]}
 */
export function planIncrement(manifest, plan) {
  if (!isV2Manifest(manifest)) {
    throw new IncrementRefusedError('v1-manifest',
      manifest && typeof manifest === 'object' ? '现存 manifest 非 schemaVersion=2，不可自动收养' : 'manifest 缺席');
  }
  // 上次失败：逐项 failed 或整体 failed 都视为 last-failed（失败态不是可增量基线）
  if (manifest.status === 'failed' || manifest.patches.some((p) => p.status === 'failed')) {
    throw new IncrementRefusedError('last-failed', '上次注入存在 failed 项，失败 manifest 不得作为增量基线');
  }
  const items = Array.isArray(plan) ? plan : (plan?.items ?? []);
  const planBaseline = Array.isArray(plan) ? null : (plan?.baseline ?? null);
  if (planBaseline) {
    const mRoot = manifest.baseline?.upstreamRoot ?? null;
    const pRoot = planBaseline.upstreamRoot ?? null;
    if (mRoot !== null && pRoot !== null && mRoot !== pRoot) {
      throw new IncrementRefusedError('root-change', `${mRoot} → ${pRoot}`);
    }
    const mOids = normTreeOids(manifest.baseline?.treeOids);
    const pOids = normTreeOids(planBaseline.treeOids);
    for (const tree of ['hermes-studio', 'hermes-agent', 'zcode']) {
      if (mOids[tree] !== null && pOids[tree] !== null && mOids[tree] !== pOids[tree]) {
        throw new IncrementRefusedError('baseline-change', `${tree} treeOid ${mOids[tree]} → ${pOids[tree]}`);
      }
    }
  }
  // 分通道比对（2026-11-23 全面复盘批）：plan 把各通道的补丁首尾相接，非末位通道
  // （如 hermes-studio）的尾部追加在拼接序列上排在后一通道之前，按整条序列比前缀
  // 会被误判成中插——尾部增量因此对非末位通道从未生效（补丁 817 实录）。每个通道
  // 是独立的注入目标树，所以前缀约束按通道成立；通道间的相对顺序另按首次出现序核对。
  const laneOf = (p) => `${p.channel}/${p.target}`;
  const laneOrder = (list) => {
    const order = [];
    for (const p of list) {
      const lane = laneOf(p);
      if (!order.includes(lane)) order.push(lane);
    }
    return order;
  };
  const manifestLanes = laneOrder(manifest.patches);
  const planLanes = laneOrder(items);
  // 已出现通道的相对顺序不得变化，新通道只能排在末尾。
  if (planLanes.slice(0, manifestLanes.length).join('\u0000') !== manifestLanes.join('\u0000')) {
    throw new IncrementRefusedError('reorder', `通道顺序变化（${manifestLanes.join(' → ') || '空'} → ${planLanes.join(' → ')}）`);
  }
  const tail = [];
  for (const lane of planLanes) {
    const manifestLane = manifest.patches.filter((p) => laneOf(p) === lane);
    const planLane = items.filter((p) => laneOf(p) === lane);
    // 位级判定先行（rename/reorder/insert/modify）——集合级删除检查会把
    // 「同 sha 异名」误报成 removed，必须让位级分类先咬住。
    const laneSet = new Set(manifestLane.map((p) => p.name));
    const common = Math.min(manifestLane.length, planLane.length);
    for (let i = 0; i < common; i++) {
      const m = manifestLane[i];
      const p = planLane[i];
      if (m.name !== p.name) {
        if (m.sha256 === p.sha256) {
          throw new IncrementRefusedError('rename', `${m.name} → ${p.name}（同内容异名）`);
        }
        if (laneSet.has(p.name)) {
          throw new IncrementRefusedError('reorder', `位置 ${i}：${m.name} 与 ${p.name} 顺序变化`);
        }
        throw new IncrementRefusedError('insert', `位置 ${i} 出现新补丁 ${p.name}（前缀内中插）`);
      }
      if (m.sha256 !== p.sha256) {
        throw new IncrementRefusedError('modify', `${m.name} 内容变化（sha256 不符）`);
      }
      if (m.channel !== p.channel || m.target !== p.target) {
        throw new IncrementRefusedError('modify', `${m.name} 路由变化（${m.channel}/${m.target} → ${p.channel}/${p.target}）`);
      }
    }
    // 前缀全匹配但 manifest 更长：该通道尾部已应用补丁从 series 消失=删除。
    if (manifestLane.length > planLane.length) {
      throw new IncrementRefusedError('removed', manifestLane.slice(planLane.length).map((p) => p.name).join(', '));
    }
    tail.push(...planLane.slice(manifestLane.length));
  }
  return { kind: tail.length === 0 ? 'noop' : 'tail-append', items: tail };
}

/** 目录内是否残留 manifest tmp（测试卫生断言用）。 */
export function manifestTmpResidue(dir) {
  try {
    return readdirSync(dir).filter((f) => f.endsWith(MANIFEST_TMP_SUFFIX));
  } catch {
    return [];
  }
}
