// overlay/scripts/extract-i18n-increments.mjs
// 一次性迁移工具:从 migration-source 的完整 locale 文件相对 upstream 的 diff,
// 机械地生成每个 locale 的增量对象,写入 overlay/custom/client/branding/i18n/<loc>.ts。
//
// 策略:用 eval 解析 source 与 upstream 的 default export 对象,做"以 source 为准"的
// 深度差集(只保留 source 有而 upstream 无的 key,以及 source 中值与 upstream 不同的 key),
// 输出为 TS 对象。这样精确反映 custom 的实际改动,避免手工重构出错。
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const overlayRoot = resolve(import.meta.dirname, '..');
const ncwkRoot = resolve(overlayRoot, '..');
const upstreamLocaleDir = resolve(ncwkRoot, 'upstream/hermes-studio/packages/client/src/i18n/locales');
const sourceLocaleDir = resolve(ncwkRoot, 'hermes-web-ui/packages/client/src/i18n/locales');
const outDir = resolve(overlayRoot, 'custom/client/branding/i18n');

const LOCALES = ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'ru', 'zh-TW', 'zh'];

// 把 `export default { ... }` 的对象体提取出来,用 Function 求值(安全:仅字面量)
function parseLocale(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const m = src.match(/export\s+default\s+(\{[\s\S]*\})\s*;?\s*$/);
  if (!m) throw new Error(`无法解析 ${filePath}: 找不到 export default {...}`);
  // locale 文件是纯字面量对象(字符串/嵌套对象),用 Function 求值
  // eslint-disable-next-line no-new-func
  return new Function(`return (${m[1]})`)();
}

// 深度差集:返回 diff = source 中与 upstream "不同"的部分
// (key 不存在、或值不同[递归到对象])。source 独有的整个子树都包含。
function deepDiff(upstream, source) {
  const out = Array.isArray(source) ? [] : {};
  let hasDiff = false;
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const uv = upstream?.[key];
    if (uv === undefined) {
      // source 独有的 key:整个保留
      out[key] = sv;
      hasDiff = true;
    } else if (isObj(sv) && isObj(uv)) {
      const sub = deepDiff(uv, sv);
      if (Object.keys(sub).length > 0) {
        out[key] = sub;
        hasDiff = true;
      }
    } else if (sv !== uv) {
      // 值不同(覆盖)
      out[key] = sv;
      hasDiff = true;
    }
  }
  return hasDiff ? out : {};
}
function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 把 JS 对象序列化为 TS 字面量(2 空格缩进)
function toTsLiteral(obj, indent = 2) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(obj)) {
    const items = obj.map((v) => toTsLiteral(v, indent + 2));
    return `[${items.length ? '\n' + pad + '  ' + items.join(',\n' + pad + '  ') + '\n' + pad : ''}]`;
  }
  if (obj !== null && typeof obj === 'object') {
    const entries = Object.entries(obj).map(([k, v]) => {
      const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : JSON.stringify(k);
      return `${pad}${key}: ${toTsLiteral(v, indent + 2)},`;
    });
    return `{${entries.length ? '\n' + entries.join('\n') + '\n' + ' '.repeat(indent - 2) : ''}}`;
  }
  if (typeof obj === 'string') {
    // 用单引号,转义内部单引号
    return `'${obj.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  }
  return String(obj);
}

let totalKeys = 0;
for (const loc of LOCALES) {
  const upPath = resolve(upstreamLocaleDir, `${loc}.ts`);
  const srcPath = resolve(sourceLocaleDir, `${loc}.ts`);
  if (!existsSync(srcPath)) {
    console.warn(`[extract] 跳过 ${loc}: 源文件不存在`);
    continue;
  }
  const upstream = parseLocale(upPath);
  const source = parseLocale(srcPath);
  const diff = deepDiff(upstream, source);
  const keyCount = Object.keys(diff).length;
  totalKeys += keyCount;
  const varName = `${loc.replace('-', '')}Extended`;
  const out = `// 自动生成(inherit from migration-source ${loc}.ts vs upstream)。勿手改,改源后重跑 extract-i18n-increments.mjs。\nexport const ${varName} = ${toTsLiteral(diff)} as const\n`;
  writeFileSync(resolve(outDir, `${loc}.ts`), out);
  console.log(`[extract] ${loc}.ts: ${keyCount} top-level diff namespaces`);
}
console.log(`[extract] done. ${LOCALES.length} locales, regenerated mechanically from source diff.`);
