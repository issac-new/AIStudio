// runtime 资产清单（P1 平台重写 Task 7）：构建期生成 dist/server/runtime-assets.json，
// verify-dist（--server）逐项校验、桌面 afterPack 与 bundle 身份（Task 8 的
// runtimeManifestDigest/assetDigests）共用同一清单——「该进包的资源」只有这一个事实源。
//
// 清单形状（确定性：资产按 rel 排序、无时间戳——同输入必同清单字节，digest 才可复算）：
//   { schemaVersion: 1, assets: [{ rel, sha256, bytes }, ...] }
// rel = 相对 dist/server/ 的部署路径（runtime/pricing/models.yaml、semantica-bridge.py）。
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const RUNTIME_ASSETS_SCHEMA_VERSION = 1;

/** 随包 runtime 目录（源=仓根 runtime/ 下同名子目录 → dist/server/runtime/<子目录>）。 */
export const RUNTIME_ASSET_DIRS = ['pricing', 'roster'];
/** 单文件资产：[源路径（相对仓根）, 部署 rel（相对 dist/server/）]。 */
export const RUNTIME_ASSET_FILES = [
  ['custom/server/decisiongraph/semantica-bridge.py', 'semantica-bridge.py'],
];

function walkFiles(dir) {
  if (!existsSync(dir)) {
    // 缺席即响亮失败：清单面是「该进包的资源」事实源，静默空清单=产物缺表无告警。
    throw new Error(`runtime 资产目录缺失: ${dir}——清单不可凭空生成，先核对仓内 runtime/ 布局`);
  }
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walkFiles(abs));
    else out.push(abs);
  }
  return out;
}

/**
 * 构建运行时资产清单（纯读，不写盘）。
 * @param overlayRoot 仓根（runtime/ 与 custom/ 的所在树）
 * @returns {schemaVersion, assets:[{rel,sha256,bytes}]}（rel 排序，确定性）
 */
export function buildRuntimeAssetManifest(overlayRoot) {
  const root = resolve(overlayRoot);
  const assets = [];
  const add = (abs, rel) => {
    const bytes = readFileSync(abs);
    assets.push({ rel, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
  };
  for (const sub of RUNTIME_ASSET_DIRS) {
    const srcDir = resolve(root, 'runtime', sub);
    const files = walkFiles(srcDir); // 目录缺席=空清单面（build.mjs 对缺席目录已先行硬失败）
    for (const abs of files) add(abs, `runtime/${relative(resolve(root, 'runtime'), abs)}`);
  }
  for (const [src, rel] of RUNTIME_ASSET_FILES) {
    add(resolve(root, src), rel);
  }
  assets.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { schemaVersion: RUNTIME_ASSETS_SCHEMA_VERSION, assets };
}

/** 清单规范化序列化（bundle 身份的 runtimeManifestDigest 输入；与落盘字节同源）。 */
export function canonicalManifestJson(manifest) {
  const assets = [...(manifest?.assets ?? [])].sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return JSON.stringify({ schemaVersion: manifest?.schemaVersion, assets });
}

/** 清单文件落盘形态（canonical JSON + 换行；确定性字节=同输入同文件）。 */
export function renderManifestFile(manifest) {
  return `${JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    assets: manifest.assets,
  }, null, 2)}\n`;
}
