// overlay/config/bootstrap.ts
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const overlayRoot = resolve(__dirname, '..');
const ncwkRoot = resolve(overlayRoot, '..');

export const bootstrap = {
  ncwkRoot,
  overlayRoot,
  upstreamRoot: resolve(ncwkRoot, 'upstream'),
  hermesStudioRoot: resolve(ncwkRoot, 'upstream', 'hermes-studio'),

  // B 类 patch:按 series 顺序应用(阶段 2 填充)
  patchSeriesFile: resolve(overlayRoot, 'patches', 'series'),
  patchDir: resolve(overlayRoot, 'patches'),

  client: {
    upstreamEntry: 'packages/client/src/main.ts',
    overlayEntry: resolve(overlayRoot, 'registries/client/entry.mts'),
    customDirs: [resolve(overlayRoot, 'custom/client')],
    // 构建期 asset 覆盖(上游相对路径 → overlay 源)
    assetOverrides: {
      'packages/client/public/logo.png': resolve(overlayRoot, 'assets', 'logo.png'),
    },
  },
  server: {
    upstreamEntry: 'packages/server/src/index.ts',
    overlayEntry: resolve(overlayRoot, 'registries/server/entry.mts'),
    customDirs: [resolve(overlayRoot, 'custom/server')],
  },
} as const;
