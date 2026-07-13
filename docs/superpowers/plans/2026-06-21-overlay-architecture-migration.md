# Overlay 架构迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `hermes-web-ui/` 的本地二次开发成果迁移到独立 `overlay/` 仓,使三个上游仓保持纯净可升级。

**Architecture:** 混合策略——A 类(纯新增)迁入 `overlay/custom/` + 运行时 registry 接入;B 类(改上游骨架)转 `overlay/patches/`(`git apply` 可逆)。上游入口经 overlay 派生 config(vite/tsconfig alias)重定向到 entry shim。上游 `.git` 历史始终干净,工作区仅含可清除的 inject 产物。

**Tech Stack:** Node 23+、Vite 8、TypeScript 6、Vue 3、Koa、Pinia、ts-node。overlay 脚本用 Node ESM(.mjs)。

**关联 Spec:** `docs/superpowers/specs/2026-06-21-overlay-architecture-design.md`

---

## 阶段总览

| 阶段 | 产出 | 验证检查点 |
|------|------|-----------|
| **阶段 0** | upstream/ + overlay/ 骨架就位 | overlay 仓 git init 成功,三上游仓可 git status |
| **阶段 1** | inject/sync/clean 工具链可用(空 patch、空 custom) | inject→clean 可往返,上游 git 历史干净 |
| **阶段 2** | B 类 patch 全部迁移 | inject 后上游工作区含全部 B 类改动,clean 后还原 |
| **阶段 3** | A 类 custom/ + entry shim + registry 全部迁移 | overlay 构建启动,三大自定义功能可用 |
| **阶段 4** | 旧目录删除、收尾 | §6.3 验收通过,工作区仅余 upstream/+overlay/+docs/ |

---

## 阶段 0:目录骨架与 upstream/ 就位

### Task 0.1:创建 upstream/ 并迁入 hermes-agent 与 element-web

**Files:**
- Move: `ncwk/hermes-agent/` → `ncwk/upstream/hermes-agent/`
- Move: `ncwk/element-web/` → `ncwk/upstream/element-web/`

- [ ] **Step 1:创建 upstream 目录**

```bash
cd /Volumes/nvme2230/lab/ncwk
mkdir -p upstream
```

- [ ] **Step 2:移动两个已纯净的上游仓**

```bash
cd /Volumes/nvme2230/lab/ncwk
mv hermes-agent upstream/hermes-agent
mv element-web upstream/element-web
```

- [ ] **Step 3:验证两仓 remote 与工作树状态完好**

```bash
git -C upstream/hermes-agent remote -v    # origin → NousResearch/hermes-agent
git -C upstream/element-web remote -v     # origin → element-hq/element-web
git -C upstream/hermes-agent status -s    # (允许有原 kanban.py 改动,本期不动)
git -C upstream/element-web status -s     # 应为空
```
Expected: remote 指向各自官方仓;element-web 工作树干净;hermes-agent 保持原样(含 kanban.py 改动,不在本期范围)。

### Task 0.2:把 hermes-web-ui 上游基线设为 upstream/hermes-studio

> 现有 `hermes-web-ui/`(含本地 37 commit)是迁移**来源**。`hermes-studio/`(空壳,新 remote)合并进来,checkout 到纯净 v0.6.18 作为 upstream。

**Files:**
- Modify: `ncwk/hermes-studio/.git`(空壳)→ 合并 hermes-web-ui 的上游基线
- Keep: `ncwk/hermes-web-ui/`(迁移来源,阶段 4 才删)

- [ ] **Step 1:在空壳 hermes-studio 里 fetch 上游基线**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-studio
git fetch origin main
git checkout -b main origin/main
git status   # 应 detached 或在 main,工作树含 v0.6.18 全部文件
```
Expected: `origin/main` tip = `39e331b4 Update OpenAPI schema (#1709)`(v0.6.18),工作树是纯净上游(无 `packages/client/src/custom/` 目录)。

- [ ] **Step 2:验证这是纯净上游(无 custom/ 目录、无本地 commit)**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-studio
ls packages/client/src/custom 2>/dev/null && echo "ERROR: 不应是纯净上游" || echo "OK: 无 custom/ 目录 = 纯净上游"
git log --oneline origin/main..HEAD | wc -l   # 应为 0
```
Expected: "OK: 无 custom/ 目录",commit 数 = 0。

- [ ] **Step 3:移入 upstream/**

```bash
cd /Volumes/nvme2230/lab/ncwk
mv hermes-studio upstream/hermes-studio
```

- [ ] **Step 4:确认 hermes-web-ui/ 迁移来源仍在原地**

```bash
cd /Volumes/nvme2230/lab/ncwk
ls hermes-web-ui/packages/client/src/custom/matrix-chat >/dev/null && echo "OK: 迁移来源完好" || echo "ERROR"
git -C hermes-web-ui log --oneline -1 refactor/upstream-compat   # 应停在 f3080d2e
```

### Task 0.3:创建 overlay 仓骨架

**Files:**
- Create: `ncwk/overlay/.git`(新仓)
- Create: `ncwk/overlay/package.json`
- Create: `ncwk/overlay/.gitignore`
- Create: `ncwk/overlay/README.md`

- [ ] **Step 1:初始化 overlay 仓并建目录骨架**

```bash
cd /Volumes/nvme2230/lab/ncwk
mkdir -p overlay/{custom/client,custom/server,registries/client,registries/server,patches,config,scripts,assets}
cd overlay
git init -b main
```

- [ ] **Step 2:写 overlay/.gitignore**

```gitignore
# 派生构建产物(inject 生成,不入库)
.overlay-injected.json
vite.config.overlay.ts
*.log
node_modules/
```

- [ ] **Step 3:写 overlay/package.json**

```json
{
  "name": "hermes-overlay",
  "version": "0.6.18-overlay",
  "private": true,
  "type": "module",
  "description": "二次开发 overlay 层:注入到 hermes-studio 上游",
  "scripts": {
    "inject": "node scripts/inject.mjs",
    "clean": "node scripts/inject.mjs --clean",
    "verify": "node scripts/verify-clean.mjs",
    "sync": "bash scripts/sync-upstream.sh",
    "build": "vite build --config vite.config.overlay.ts",
    "dev": "vite --config vite.config.overlay.ts",
    "test": "vitest run"
  },
  "engines": { "node": ">=23.0.0" }
}
```

- [ ] **Step 4:写 overlay/README.md(简述用途 + 与 spec 的关联)**

```markdown
# Hermes Overlay

本仓是 hermes-studio 二次开发的 overlay 层。三个上游仓在 `../upstream/`(hermes-studio / element-web / hermes-agent),保持纯净。

## 机制(混合策略)
- **A 类(纯新增)**:`custom/` + 运行时 registry(经 entry shim + 派生 vite/tsconfig alias 接入)
- **B 类(改上游骨架)**:`patches/`(`git apply` 可逆)

## 常用命令
- `npm run inject` — 应用 B 类 patch + 生成派生 config
- `npm run clean` — 还原上游工作树
- `npm run verify` — 校验上游状态
- `npm run sync` — 升级上游(clean → fetch/reset → re-inject)

详见 `../docs/superpowers/specs/2026-06-21-overlay-architecture-design.md`。
```

- [ ] **Step 5:首次提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add .
git commit -m "chore: initialize overlay scaffold (upstream/+overlay/ layout)"
```

---

## 阶段 1:注入工具链(inject / clean / verify / sync)

> 本阶段建好工具链,但 patch 与 custom 内容为空。目标是让 inject→clean 能空跑往返,上游 git 历史始终干净。

### Task 1.1:overlay/config/features.ts(功能开关)

**Files:**
- Create: `overlay/config/features.ts`

- [ ] **Step 1:写 features.ts(迁移自现有 custom/config.ts + server/custom/config.ts)**

```ts
// overlay/config/features.ts
// 功能开关。默认全部开启(向后兼容),可经环境变量关闭。
export interface FeatureConfig {
  matrixChat: boolean;
  matrixAuth: boolean;
  matrixAdmin: boolean;
  kanbanEnhancements: boolean;
  branding: boolean;
  extendedI18n: boolean;
}

export const features: FeatureConfig = {
  matrixChat: process.env.VITE_CUSTOM_MATRIX_CHAT !== 'false',
  matrixAuth: process.env.CUSTOM_MATRIX_AUTH === 'true',
  matrixAdmin: process.env.CUSTOM_MATRIX_ADMIN === 'true',
  kanbanEnhancements: process.env.CUSTOM_KANBAN_ENHANCEMENTS !== 'false',
  branding: process.env.VITE_CUSTOM_BRANDING !== 'false',
  extendedI18n: process.env.VITE_CUSTOM_EXTENDED_I18N !== 'false',
};

export function isFeatureEnabled(feature: keyof FeatureConfig): boolean {
  return features[feature];
}
```

> 注:matrixAuth/matrixAdmin 在原 server 仓默认 `=== 'true'`(需显式开);其余默认开。保留原语义。

- [ ] **Step 2:提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add config/features.ts
git commit -m "feat(config): port feature flags from custom/config.ts"
```

### Task 1.2:overlay/config/bootstrap.ts(注入清单)

**Files:**
- Create: `overlay/config/bootstrap.ts`

- [ ] **Step 1:写 bootstrap.ts(声明路径映射、patch 清单、asset 覆盖)**

```ts
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
```

- [ ] **Step 2:创建空的 patches/series(阶段 2 填内容)**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
printf '# B 类 patch 应用清单(每行一个 .patch 文件名,按序)\n# 阶段 2 填充\n' > patches/series
```

- [ ] **Step 3:提交**

```bash
git add config/bootstrap.ts patches/series
git commit -m "feat(config): add bootstrap injection manifest"
```

### Task 1.3:overlay/scripts/inject.mjs(核心注入脚本)

**Files:**
- Create: `overlay/scripts/inject.mjs`

- [ ] **Step 1:写 inject.mjs**

```js
// overlay/scripts/inject.mjs
// 职责:1) 应用 B 类 patch(git apply) 2) 生成 overlay 派生构建 config
// 幂等;--clean 反向还原。不触碰上游 .git。
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, relative } from 'path';
import { bootstrap } from '../config/bootstrap.ts';

const mode = process.argv.includes('--clean') ? 'clean' : 'inject';
const manifestPath = resolve(bootstrap.overlayRoot, '.overlay-injected.json');

function git(args, cwd) {
  return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function readSeries() {
  const raw = readFileSync(bootstrap.patchSeriesFile, 'utf8');
  return raw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
}

function applyPatches() {
  const patches = readSeries();
  if (patches.length === 0) { console.log('[inject] 无 B 类 patch(阶段 1 空跑)'); return patches; }
  for (const p of patches) {
    const patchPath = resolve(bootstrap.patchDir, p);
    try {
      git(`apply --whitespace=nowarn ${patchPath}`, bootstrap.hermesStudioRoot);
      console.log(`[inject] applied patch: ${p}`);
    } catch {
      console.error(`[inject] FAILED to apply patch: ${p}`);
      console.error('  用 git apply --reject 手动排查,修复后重跑');
      process.exit(1);
    }
  }
  return patches;
}

function reversePatches(patches) {
  for (const p of [...patches].reverse()) {
    const patchPath = resolve(bootstrap.patchDir, p);
    try {
      git(`apply --reverse --whitespace=nowarn ${patchPath}`, bootstrap.hermesStudioRoot);
      console.log(`[clean] reversed patch: ${p}`);
    } catch {
      console.error(`[clean] FAILED to reverse patch: ${p}`);
      process.exit(1);
    }
  }
}

function generateOverlayViteConfig() {
  const cfg = `// 派生构建配置(inject 生成,已 gitignore)
import { defineConfig, mergeConfig } from 'vite';
import upstream from '${resolve(bootstrap.hermesStudioRoot, 'vite.config.ts')}';

export default mergeConfig(
  typeof upstream === 'function' ? upstream({ command: 'serve', mode: 'development' }) : upstream,
  defineConfig({
    resolve: {
      alias: {
        // A 类入口重定向:上游 main.ts → overlay entry shim(见阶段 3)
        '${relative(bootstrap.hermesStudioRoot, bootstrap.client.upstreamEntry).replace(/\\/g, '/')}': '${bootstrap.client.overlayEntry}',
      },
    },
  })
);
`;
  writeFileSync(resolve(bootstrap.overlayRoot, 'vite.config.overlay.ts'), cfg);
  console.log('[inject] generated vite.config.overlay.ts');
}

async function main() {
  // 1. 校验上游工作树状态
  const status = git('status --porcelain', bootstrap.hermesStudioRoot).trim();
  const patches = readSeries();

  if (mode === 'inject') {
    if (status && patches.length > 0) {
      console.error('[inject] 上游工作树不干净,先运行 npm run clean');
      console.error(status);
      process.exit(1);
    }
    // 2. 应用 B 类 patch
    const applied = applyPatches();
    // 3. 生成派生 config(阶段 3 才有 entry shim,此时 alias 指向的文件可能不存在,正常)
    generateOverlayViteConfig();
    // 4. 写清单
    writeFileSync(manifestPath, JSON.stringify({ appliedPatches: applied, generatedAt: new Date().toISOString() }, null, 2));
    console.log('[inject] done');
  } else {
    // clean
    const applied = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).appliedPatches || [] : patches;
    reversePatches(applied);
    console.log('[clean] done');
  }
}

main();
```

> 说明:`inject.mjs` 在阶段 1 只处理 patch(此时为空)+ 生成空 alias 的 vite config。阶段 3 会扩充 entry shim 的真实 alias。

- [ ] **Step 2:提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add scripts/inject.mjs
git commit -m "feat(scripts): add inject.mjs (B-patch apply + derived config gen)"
```

### Task 1.4:overlay/scripts/verify-clean.mjs

**Files:**
- Create: `overlay/scripts/verify-clean.mjs`

- [ ] **Step 1:写 verify-clean.mjs**

```js
// overlay/scripts/verify-clean.mjs
// 校验:inject --clean 后上游工作树应干净;inject 后应仅含已应用 patch 涉及的文件。
import { execSync } from 'child_process';
import { bootstrap } from '../config/bootstrap.ts';

function git(args, cwd) {
  try { return execSync(`git ${args}`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString(); }
  catch (e) { return e.stdout?.toString() || ''; }
}

const status = git('status --porcelain', bootstrap.hermesStudioRoot).trim();
const localCommits = git('log --oneline origin/main..HEAD', bootstrap.hermesStudioRoot).trim();

let ok = true;
if (localCommits) { console.error('FAIL: upstream/hermes-studio 有本地 commit:\n' + localCommits); ok = false; }
if (status) { console.error('WARN: upstream/hermes-studio 工作树有改动(可能是未 clean 的 patch):\n' + status); }
else { console.log('OK: upstream/hermes-studio 工作树干净'); }

// element-web / hermes-agent 应纯上游
for (const repo of ['element-web']) {
  const s = git('status --porcelain', resolve(bootstrap.upstreamRoot, repo)).trim();
  if (s) console.error(`WARN: upstream/${repo} 工作树有改动:\n` + s);
  else console.log(`OK: upstream/${repo} 工作树干净`);
}

import { resolve } from 'path';
process.exit(ok ? 0 : 1);
```

- [ ] **Step 2:修正 import 顺序(verify-clean.mjs 顶部需 import resolve)**

把 `import { resolve } from 'path';` 移到文件顶部其余 import 旁。

- [ ] **Step 3:提交**

```bash
git add scripts/verify-clean.mjs
git commit -m "feat(scripts): add verify-clean.mjs"
```

### Task 1.5:overlay/scripts/sync-upstream.sh(升级脚本)

**Files:**
- Create: `overlay/scripts/sync-upstream.sh`

- [ ] **Step 1:写 sync-upstream.sh**

```bash
#!/bin/bash
# overlay/scripts/sync-upstream.sh — 升级 hermes-studio 上游
set -e
cd "$(dirname "$0")/.."

echo "[sync] 1. clean(撤销 B 类 patch)"
npm run clean

echo "[sync] 2. fetch + reset upstream/hermes-studio"
cd ../upstream/hermes-studio
git fetch origin
git reset --hard origin/main
cd ../../overlay

echo "[sync] 3. re-inject"
npm run inject

echo "[sync] 4. verify"
npm run verify

echo "[sync] 完成。若 inject 失败,按 spec §3.5 修复 patch;若 entry shim 失效,按 §3.3 修复 shim。"
echo "[sync] 接下来:npm run build && npm run test"
```

- [ ] **Step 2:赋予执行权限并提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
chmod +x scripts/sync-upstream.sh
git add scripts/sync-upstream.sh
git commit -m "feat(scripts): add sync-upstream.sh"
```

### Task 1.6:端到端空跑验证(inject → clean 往返)

- [ ] **Step 1:跑 inject(此时 patch 为空,应只生成 vite.config.overlay.ts 并写清单)**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
```
Expected: `[inject] 无 B 类 patch(阶段 1 空跑)` + `[inject] generated vite.config.overlay.ts` + `[inject] done`。

- [ ] **Step 2:跑 clean(应无 patch 可逆,正常退出)**

```bash
npm run clean
```
Expected: `[clean] done`(无 patch 输出)。

- [ ] **Step 3:验证上游 git 历史与工作树干净**

```bash
npm run verify
```
Expected: 三仓 `OK: ... 工作树干净`,exit 0。

- [ ] **Step 4:验证上游 .git 无本地 commit**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
git log --oneline origin/main..HEAD | wc -l   # 0
cd ../../overlay
```
Expected: 0。

---

## 阶段 2:B 类 patch 迁移

> 把 ~7 个"改上游骨架"的文件改动从 `hermes-web-ui/` 的本地 diff 转成 patch 文件。来源:`hermes-web-ui` 的 `refactor/upstream-compat` 相对 `origin/main`(v0.6.18)的 diff。

### Task 2.1:生成 B 类 patch 文件

> 通用模式:对每个 B 类文件,从 `hermes-web-ui` 仓导出相对 `origin/main` 的 diff,存为 overlay patch。

**Files:**
- Create: `overlay/patches/001-schemas-matrix-columns.patch`
- Create: `overlay/patches/002-config-matrix-fields.patch`
- Create: `overlay/patches/003-vite-matrix-presbundle.patch`
- Create: `overlay/patches/004-sessions-db.patch`
- Create: `overlay/patches/005-routes-auth.patch`
- Create: `overlay/patches/006-safe-file-store.patch`
- Create: `overlay/patches/007-model-run-prompt.patch`
- Modify: `overlay/patches/series`

- [ ] **Step 1:确认 B 类完整清单与来源 diff 可用**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
# B 类文件清单(spec §3.5):
for f in \
  packages/server/src/db/hermes/schemas.ts \
  packages/server/src/config.ts \
  vite.config.ts \
  packages/server/src/db/hermes/sessions-db.ts \
  packages/server/src/routes/auth.ts \
  packages/server/src/services/safe-file-store.ts \
  packages/server/src/services/hermes/run-chat/model-run-prompt.ts ; do
  lines=$(git diff origin/main..refactor/upstream-compat -- "$f" | wc -l)
  echo "$lines  $f"
done
```
Expected: 每个文件有非零 diff(>0 行)。

- [ ] **Step 2:逐个导出 patch(用 git diff,带 a/ b/ 前缀,git apply 兼容)**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
SRC=origin/main
DST=refactor/upstream-compat
OUT=/Volumes/nvme2230/lab/ncwk/overlay/patches

git diff $SRC..$DST -- packages/server/src/db/hermes/schemas.ts        > $OUT/001-schemas-matrix-columns.patch
git diff $SRC..$DST -- packages/server/src/config.ts                   > $OUT/002-config-matrix-fields.patch
git diff $SRC..$DST -- vite.config.ts                                  > $OUT/003-vite-matrix-presbundle.patch
git diff $SRC..$DST -- packages/server/src/db/hermes/sessions-db.ts    > $OUT/004-sessions-db.patch
git diff $SRC..$DST -- packages/server/src/routes/auth.ts              > $OUT/005-routes-auth.patch
git diff $SRC..$DST -- packages/server/src/services/safe-file-store.ts > $OUT/006-safe-file-store.patch
git diff $SRC..$DST -- packages/server/src/services/hermes/run-chat/model-run-prompt.ts > $OUT/007-model-run-prompt.patch
```

- [ ] **Step 3:更新 patches/series**

```bash
cat > /Volumes/nvme2230/lab/ncwk/overlay/patches/series <<'EOF'
# B 类 patch 应用清单(按序)
001-schemas-matrix-columns.patch
002-config-matrix-fields.patch
003-vite-matrix-presbundle.patch
004-sessions-db.patch
005-routes-auth.patch
006-safe-file-store.patch
007-model-run-prompt.patch
EOF
```

- [ ] **Step 4:提交 patch**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add patches/
git commit -m "feat(patches): migrate 7 B-class upstream-skeleton patches"
```

### Task 2.2:验证 B 类 patch 可应用 + 可还原

- [ ] **Step 1:在上游干净状态下跑 inject**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
```
Expected: 7 行 `applied patch: NNN-*.patch` + `done`。

- [ ] **Step 2:验证上游工作树现含全部 B 类改动(未 commit)**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
git status --porcelain
```
Expected: 7 个文件显示为 ` M`(modified),无本地 commit(`git log origin/main..HEAD` 为空)。

- [ ] **Step 3:跑 clean 还原**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run clean
cd ../upstream/hermes-studio && git status --porcelain | wc -l   # 0
```
Expected: clean 输出 7 行 `reversed patch`;上游 `git status` 为空。

- [ ] **Step 4:最终验证(inject → clean → 干净)**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject && npm run clean && npm run verify
```
Expected: 全程无错,verify exit 0。

---

## 阶段 3:A 类迁移(custom/ + entry shim + registry)

> 这是最大阶段。分 3 个子阶段:3A 建 entry shim + registry 骨架(让 overlay 能启动);3B 迁 client A 类;3C 迁 server A 类。

### 子阶段 3A:entry shim 与 registry 骨架

### Task 3.1:client entry shim + registry

**Files:**
- Create: `overlay/registries/client/entry.mts`
- Create: `overlay/registries/client/index.ts`(registry API)
- Create: `overlay/registries/client/bootstrap.ts`

- [ ] **Step 1:写 entry.mts(re-export 上游 main.ts,再 bootstrap)**

```ts
// overlay/registries/client/entry.mts
// A 类入口 shim:先让上游 main.ts 的全部副作用执行(createApp/use/mount),
// 再调 overlay 注册中枢把 A 类扩展挂到 app 实例。
// 注意:上游 main.ts 不 export app 实例,故 A 类中需要 app 引用的注册(如组件/store)
// 改为在上游 mount 前的"createApp 之后"接入——见 bootstrap.ts 的时序说明。
import '../../upstream/hermes-studio/packages/client/src/main.ts';
// 上述 import 执行后,#app 已 mount。A 类注册需在 mount 前发生——
// 因此实际方案:本 shim 不直接 import 上游 main,而是复制其启动序列并在中间插入 bootstrap。
// 见 Step 2 的最终实现。
```

> **关键时序问题(必须在实现时解决)**:上游 `main.ts` 末尾 `app.mount('#app')` 是同步的,但发生在 `registerCustomFeatures` 之后。A 类的组件/store/路由注册必须在 `mount` 前完成,否则组件无法解析。因此 entry shim 不能简单 `import 上游 main`,而要**复制 main.ts 的启动序列,在 `app.use(router)` 与 `mount` 之间插入 bootstrap**。

- [ ] **Step 2:改写 entry.mts 为复制启动序列版(正确时序)**

```ts
// overlay/registries/client/entry.mts
// 复制上游 main.ts 的启动序列,在 mount 前插入 A 类注册。
// 上游 main.ts 来源:upstream/hermes-studio/packages/client/src/main.ts(v0.6.18,69 行)
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import router from '../../upstream/hermes-studio/packages/client/src/router';
import { i18n } from '../../upstream/hermes-studio/packages/client/src/i18n';
import App from '../../upstream/hermes-studio/packages/client/src/App.vue';
import '../../upstream/hermes-studio/packages/client/src/styles/global.scss';
import 'katex/dist/katex.min.css';

// === 上游 main.ts 的 FOUC / token 处理(原样复制)===
const savedBrightness = localStorage.getItem('hermes_brightness') || 'system';
const savedStyle = localStorage.getItem('hermes_style') || 'ink';
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const isDark = savedBrightness === 'dark' || (savedBrightness === 'system' && prefersDark);
const isComic = savedStyle === 'comic';
const isDesktopShell =
  (window as typeof window & { hermesDesktop?: { isDesktop?: boolean } }).hermesDesktop?.isDesktop === true;
if (isDark) document.documentElement.classList.add('dark');
if (isComic) document.documentElement.classList.add('comic');
if (isDesktopShell) document.documentElement.classList.add('hermes-desktop-shell');
const urlParams = new URLSearchParams(window.location.search);
const hashQuery = window.location.hash.split('?')[1];
const urlToken = urlParams.get('token') || (hashQuery ? new URLSearchParams(hashQuery).get('token') : null);
if (urlToken) (window as any).__LOGIN_TOKEN__ = urlToken;

// === 启动 app(上游序列)===
const app = createApp(App);
app.use(createPinia());
app.use(i18n);
app.use(router);

// === A 类注册(mount 前插入)===
import { bootstrapClient } from './bootstrap';
await bootstrapClient(app);

router.isReady().finally(() => app.mount('#app'));
```

> 取舍:此 shim 复制了上游 main.ts 的启动逻辑。上游升级 main.ts 时(如新增 use 调用、改 FOUC 逻辑),shim 需同步——这是 §3.3/§7 记录的"入口结构升级冲突点"。好处是时序正确、上游 main.ts 零改动。

- [ ] **Step 3:写 registry API(overlay/registries/client/index.ts)**

```ts
// overlay/registries/client/index.ts
import type { App } from 'vue';
import type { RouteRecordRaw } from 'vue-router';

export interface NavEntry {
  id: string;
  label: string;
  icon?: string;
  section?: string;
  onActivate?: () => void;
}

const registry = {
  routes: [] as RouteRecordRaw[],
  navEntries: [] as NavEntry[],
  components: new Map<string, any>(),
};

export function registerRoute(route: RouteRecordRaw): void { registry.routes.push(route); }
export function registerNavEntry(entry: NavEntry): void { registry.navEntries.push(entry); }
export function registerComponent(name: string, comp: any): void { registry.components.set(name, comp); }
export function getRegisteredRoutes() { return registry.routes; }
export function getRegisteredNavEntries() { return registry.navEntries; }
export { registry };
```

- [ ] **Step 4:写 bootstrap.ts(调各 extension 的 register,对应现有 registerCustomFeatures)**

```ts
// overlay/registries/client/bootstrap.ts
import type { App } from 'vue';
import { features } from '../../config/features';
import router from '../../upstream/hermes-studio/packages/client/src/router';

export async function bootstrapClient(app: App): Promise<void> {
  // 对应现有 custom/index.ts 的 registerCustomFeatures,改为从 overlay/custom 注册
  if (features.matrixChat) {
    const { registerMatrixChat } = await import('../../custom/client/matrix-chat');
    await registerMatrixChat(app);
  }
  if (features.kanbanEnhancements) {
    const { registerKanbanEnhancements } = await import('../../custom/client/kanban');
    await registerKanbanEnhancements(app);
  }
  if (features.branding) {
    const { registerBranding } = await import('../../custom/client/branding');
    await registerBranding(app);
  }
  if (features.extendedI18n) {
    const { registerExtendedI18n } = await import('../../custom/client/branding/i18n');
    await registerExtendedI18n(app);
  }
  // 把 registry 收集的路由加入上游 router
  const { getRegisteredRoutes } = await import('./index');
  for (const route of getRegisteredRoutes()) router.addRoute(route);
}
```

- [ ] **Step 5:提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add registries/client/
git commit -m "feat(registries/client): add entry shim + registry + bootstrap"
```

### Task 3.2:server entry shim + registry

**Files:**
- Create: `overlay/registries/server/entry.mts`
- Create: `overlay/registries/server/index.ts`
- Create: `overlay/registries/server/bootstrap.ts`

- [ ] **Step 1:写 server entry.mts**

```ts
// overlay/registries/server/entry.mts
// server 入口:re-export 上游 index.ts 的 bootstrap(),并在其执行前/后注入 A 类。
// 上游 index.ts 在顶层调 bootstrap() 并自行 listen——本 shim 需在 bootstrap 内部
// 挂路由。由于上游 bootstrap() 是内联闭包、不 export app,server 端 A 类路由
// 采用"在上游 bootstrap 之外挂载额外 Koa middleware"的方式(见 bootstrap.ts)。
import { bootstrap as upstreamBootstrap } from '../../upstream/hermes-studio/packages/server/src/index';
import { bootstrapServer } from './bootstrap';

// 先注册 A 类(server 端路由在 app 创建后、listen 前挂载——见 bootstrap 注释)
await bootstrapServer();
await upstreamBootstrap();
```

> **server 时序限制(实现时重点)**:上游 `bootstrap()` 是 436 行内联函数,不 export app/router。server 端 A 类路由无法"插入"到 bootstrap 内部。可行方案:bootstrap.ts 启动一个独立的子 router,在上游 listen 后通过 `app.use()` 挂载——但 app 未 export。**实际实现时需评估**:若 server A 类(矩阵路由、kanban 增强)必须在上游路由栈中,可能需把这部分降级为 patch 或调整 entry 策略。本 Task 先建骨架,server A 类的精确挂载点在 Task 3.6 验证时确定。

- [ ] **Step 2:写 server registry(overlay/registries/server/index.ts)**

```ts
// overlay/registries/server/index.ts
import type Router from '@koa/router';

const registry = {
  routePrefixes: [] as { prefix: string; router: any }[],
  middlewares: [] as any[],
};

export function registerRoute(prefix: string, router: any): void {
  registry.routePrefixes.push({ prefix, router });
}
export function registerMiddleware(mw: any): void { registry.middlewares.push(mw); }
export { registry };
```

- [ ] **Step 3:写 bootstrap.ts**

```ts
// overlay/registries/server/bootstrap.ts
import { features } from '../../config/features';
import { registry } from './index';

export async function bootstrapServer(): Promise<void> {
  // 对应现有 server/custom/index.ts 的 registerCustomRoutes
  if (features.matrixAuth || features.matrixAdmin) {
    const { registerMatrixRoutes } = await import('../../custom/server/matrix');
    // registerMatrixRoutes 内部调 registerRoute 把 matrix 子路由加入 registry
    registerMatrixRoutes();
  }
  if (features.kanbanEnhancements) {
    const { registerKanbanRoutes } = await import('../../custom/server/kanban');
    registerKanbanRoutes();
  }
  // 注:registry 收集的路由如何挂到上游 app,见 Task 3.6 的时序解决
}
```

- [ ] **Step 4:提交**

```bash
git add registries/server/
git commit -m "feat(registries/server): add entry shim + registry + bootstrap"
```

### 子阶段 3B:迁移 client A 类 custom/

### Task 3.3:搬迁 client custom/ 纯新增(91 新增文件中的 client 部分)

> 这些是已隔离的纯新增文件(matrix-chat 组件/stores/composables、kanban 组件、branding)。原样搬迁,不改逻辑。来源:`hermes-web-ui/packages/client/src/custom/`。

**Files:**
- Move: `hermes-web-ui/packages/client/src/custom/{matrix-chat,kanban,branding}` → `overlay/custom/client/`

- [ ] **Step 1:确认来源文件清单**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
find packages/client/src/custom -type f | wc -l   # client 纯新增文件数
find packages/client/src/custom -type f | head -20
```

- [ ] **Step 2:复制(非移动,来源保留到阶段 4 删除)custom/ 到 overlay**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
DEST=/Volumes/nvme2230/lab/ncwk/overlay/custom/client
# matrix-chat
cp -R packages/client/src/custom/matrix-chat $DEST/matrix-chat
# kanban
cp -R packages/client/src/custom/kanban $DEST/kanban
# branding
cp -R packages/client/src/custom/branding $DEST/branding
```

- [ ] **Step 3:修正 overlay custom 内部的 import 路径**

> 原 custom 文件内 `import ... from '@/...'` 指向上游 `packages/client/src`。在 overlay 里,这些路径需经 alias 仍指向 upstream。在 Task 3.4 的 vite.config.overlay alias 中把 `@` 指向 `upstream/hermes-studio/packages/client/src`,则原 import 无需改。
>
> 但 custom/index.ts(原 `packages/client/src/custom/index.ts`)已被 entry shim/bootstrap 取代——overlay 不应再有顶层 custom/index.ts 的 registerCustomFeatures,改由 registries/client/bootstrap.ts 调度。删除搬迁过来的 index.ts(若存在):

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
rm -f custom/client/index.ts   # 由 registries/client/bootstrap.ts 取代
ls custom/client/   # 应见 matrix-chat kanban branding
```

- [ ] **Step 4:提交**

```bash
git add custom/client/
git commit -m "feat(custom/client): migrate matrix-chat/kanban/branding pure-additions"
```

### Task 3.4:补全 vite.config.overlay.ts 的 alias(指向 overlay custom + upstream src)

> Task 1.3 的 inject 生成了骨架 alias,本 Task 扩充:把 `@` 指向 upstream src,custom 子路径指向 overlay。

**Files:**
- Modify: `overlay/scripts/inject.mjs`(扩充 generateOverlayViteConfig)

- [ ] **Step 1:更新 inject.mjs 的 generateOverlayViteConfig,加入完整 alias**

把 Task 1.3 的 `generateOverlayViteConfig` 函数替换为:

```js
function generateOverlayViteConfig() {
  const upstreamSrc = resolve(bootstrap.hermesStudioRoot, 'packages/client/src');
  const cfg = `// 派生构建配置(inject 生成,已 gitignore)
import { defineConfig, mergeConfig } from 'vite';
import { resolve } from 'path';
import upstream from '${resolve(bootstrap.hermesStudioRoot, 'vite.config.ts')}';

const upstreamCfg = typeof upstream === 'function' ? upstream({ command: 'serve', mode: 'development' }) : upstream;

export default mergeConfig(upstreamCfg, defineConfig({
  resolve: {
    alias: {
      '@': '${upstreamSrc}',
      '@custom': resolve('${bootstrap.overlayRoot}', 'custom/client'),
      '@registries': resolve('${bootstrap.overlayRoot}', 'registries'),
    },
  },
  // 用 overlay entry shim 替代上游 main.ts 作为入口
  build: { rollupOptions: { input: resolve('${bootstrap.overlayRoot}', 'registries/client/entry.mts') } },
}));
`;
  writeFileSync(resolve(bootstrap.overlayRoot, 'vite.config.overlay.ts'), cfg);
  console.log('[inject] generated vite.config.overlay.ts (with @/@custom/@registries alias)');
}
```

- [ ] **Step 2:重新生成并验证 alias 正确**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject   # 重新生成 vite.config.overlay.ts
grep -E "'@'|@custom|@registries|entry.mts" vite.config.overlay.ts
```
Expected: 能看到三条 alias 与 entry.mts input。

- [ ] **Step 3:提交**

```bash
git add scripts/inject.mjs
git commit -m "feat(scripts): expand vite overlay alias (@/@custom/@registries + entry input)"
```

### Task 3.5:迁移 client A 类的新增导出(api/controllers 中纯新增)

> 部分 A 类是上游文件里**新增的导出函数**(如 api/kanban.ts +26 导出、api/auth.ts +11 导出)。这些需抽到 overlay/custom,而非留在上游文件。本 Task 处理 client 侧(api 层)。

**Files:**
- Create: `overlay/custom/client/api/kanban-extensions.ts`(api/kanban.ts 的 26 新增导出)
- Create: `overlay/custom/client/api/auth-extensions.ts`(api/auth.ts 的 11 新增导出)
- Create: `overlay/custom/client/api/client-extensions.ts`(api/client.ts 的 9 新增导出)

- [ ] **Step 1:对每个 api 文件,提取新增导出(diff 中 +export 行对应的完整函数体)**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
# 列出 api/kanban.ts 的新增导出签名
git diff origin/main..refactor/upstream-compat -- packages/client/src/api/hermes/kanban.ts | grep -E '^\+export'
# 对 api/auth.ts、api/client.ts 同样操作
```

- [ ] **Step 2:把每个新增导出的完整函数体复制到对应的 overlay -extensions.ts**

> 操作:在 `hermes-web-ui` 的 `refactor/upstream-compat` 版本中打开文件,找到每个新增 export,连同其依赖的 import 与类型,复制到 overlay 文件。保留原函数签名与实现,只改 import 路径(若引用上游模块,用 `@/...` 经 alias 指向 upstream)。
>
> 例:`overlay/custom/client/api/kanban-extensions.ts` 顶部加 `import { client } from '@/api/client'`(client 是上游已有的),然后放 26 个新导出。

- [ ] **Step 3:在各 extension 文件导出汇总,供 custom 模块使用**

```ts
// overlay/custom/client/api/kanban-extensions.ts 末尾
export const kanbanApiExtensions = { /* 所有 26 个导出的聚合对象 */ };
```

- [ ] **Step 4:提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/api/
git commit -m "feat(custom/client/api): extract A-class new exports (kanban/auth/client)"
```

> **注**:若某新增导出依赖上游文件内的私有(非 export)辅助函数,该导出无法干净抽出——此时该文件整体降级为 B 类 patch。实现时遇到即在 commit message 标注 `降级为 patch`,并移到 patches/。

### 子阶段 3C:迁移 server A 类

### Task 3.6:迁移 server custom/ + 评估 server A 类路由挂载时序

**Files:**
- Move: `hermes-web-ui/packages/server/src/custom/{matrix,kanban}` → `overlay/custom/server/`

- [ ] **Step 1:复制 server custom 纯新增**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
DEST=/Volumes/nvme2230/lab/ncwk/overlay/custom/server
cp -R packages/server/src/custom/matrix $DEST/matrix
cp -R packages/server/src/custom/kanban $DEST/kanban
```

- [ ] **Step 2:评估 server A 类路由挂载时序(关键决策点)**

> 上游 `bootstrap()`(packages/server/src/index.ts)是内联函数,创建 Koa app、挂路由、listen,不 export app。server A 类(matrix 路由、kanban 增强路由)需挂到这个 app。
>
> **验证上游 bootstrap 是否能被 entry shim 包装**:检查 `hermes-web-ui` 的 `refactor/upstream-compat` 版 `index.ts` 中,本地改动(element-web 静态服务、matrix 路由)是如何插入 bootstrap 的——若它们是 `app.use(...)` 调用插入在 bootstrap 体内,则 server A 类**无法**纯运行时注册,需降级为 patch 或调整 entry。
>
> 运行:
> ```bash
> cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
> git show refactor/upstream-compat:packages/server/src/index.ts | grep -n 'app.use\|registerCustom\|custom' | head
> ```

- [ ] **Step 3:根据评估结果分流**

  - **若上游 index.ts 顶层可被 entry shim 拦截 app**:完善 `registries/server/entry.mts`,在 upstreamBootstrap 后用返回的 app 挂载 registry 路由。
  - **若不可(server A 类路由必须在 bootstrap 体内挂)**:把 `index.ts` 的对应改动(element-web 服务、matrix 路由挂载点)降级为额外 B 类 patch `008-server-custom-routes.patch`,加入 series。在 commit 标注此降级。

- [ ] **Step 4:提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/server/ registries/server/
# 若降级,同时 add patches/008-*.patch patches/series
git commit -m "feat(custom/server): migrate server A-class (+ route-mount timing resolution)"
```

### Task 3.7:迁移 server A 类新增导出(services/controllers/db)

> 对应 spec 分类表里的 controllers/auth +7、controllers/kanban +13、hermes-kanban service +8、users-store +4、middleware/user-auth +3。

**Files:**
- Create: `overlay/custom/server/` 下的对应 -extensions.ts

- [ ] **Step 1:对每个 server 文件提取新增导出,同 Task 3.5 模式**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
for f in \
  packages/server/src/controllers/auth.ts \
  packages/server/src/controllers/hermes/kanban.ts \
  packages/server/src/services/hermes/hermes-kanban.ts \
  packages/server/src/db/hermes/users-store.ts \
  packages/server/src/middleware/user-auth.ts ; do
  echo "=== $f ==="
  git diff origin/main..refactor/upstream-compat -- "$f" | grep -E '^\+export'
done
```

- [ ] **Step 2:逐文件抽出到 overlay/custom/server/,改 import 指向 upstream**

> 与 Task 3.5 同模式:复制新增 export 完整体,依赖的上游模块用相对路径 import overlay→upstream。

- [ ] **Step 3:无法抽出的(依赖上游私有)降级为 patch,记录在 commit**

- [ ] **Step 4:提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/server/
git commit -m "feat(custom/server): extract A-class new exports (controllers/services/db/middleware)"
```

### Task 3.8:迁移 i18n 增量(10 locale 文件)与 brand assets

**Files:**
- Create: `overlay/custom/client/branding/i18n/`(10 locale 增量对象)
- Create: `overlay/assets/logo.png`

- [ ] **Step 1:提取每个 locale 的新增翻译键(diff 中 + 行,排除 import)**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui
mkdir -p /Volumes/nvme2230/lab/ncwk/overlay/custom/client/branding/i18n
for loc in de en es fr ja ko pt ru zh-TW zh; do
  # 提取新增键(需手工整理成对象,因为 TS locale 是 export default {...})
  git diff origin/main..refactor/upstream-compat -- packages/client/src/i18n/locales/$loc.ts | grep -E '^\+\s' | grep -v '^\+\+' > /tmp/i18n-$loc.diff
  echo "=== $loc: $(wc -l < /tmp/i18n-$loc.diff) added lines ==="
done
```

- [ ] **Step 2:手工把每个 locale 的新增键整理成 overlay 增量对象**

> 例 `overlay/custom/client/branding/i18n/zh.ts`:
> ```ts
> export const zhExtended = {
>   // 从 diff 整理的新增键(保持原 key 路径)
>   kanban: { archive: '归档', ... },
> };
> ```
> 10 个文件逐一整理(机械工作,但需人工保证 key 结构对齐上游)。

- [ ] **Step 3:写 branding/i18n/index.ts(registerExtendedI18n 深合并)**

```ts
// overlay/custom/client/branding/i18n/index.ts
import type { App } from 'vue';
import { deExtended } from './de';
import { enExtended } from './en';
// ... 其余 locale
const extended = { de: deExtended, en: enExtended /* ... */ } as const;

export async function registerExtendedI18n(app: App): Promise<void> {
  // 深合并到 vue-i18n messages(运行时,不写上游 locale 文件)
  const { i18n } = await import('@/i18n');
  for (const [locale, ext] of Object.entries(extended)) {
    i18n.global.mergeLocaleMessage(locale, ext);
  }
}
```

- [ ] **Step 4:复制 brand assets**

```bash
cp /Volumes/nvme2230/lab/ncwk/hermes-web-ui/packages/client/public/logo.png /Volumes/nvme2230/lab/ncwk/overlay/assets/logo.png
```

- [ ] **Step 5:提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add custom/client/branding/i18n/ assets/
git commit -m "feat(custom): migrate i18n increments (10 locales) + brand assets"
```

### Task 3.9:overlay 构建启动验证(client)

- [ ] **Step 1:确保 inject 已应用 B 类 patch + 生成 config**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
```

- [ ] **Step 2:尝试 overlay dev 启动(可能需先在上游装依赖)**

```bash
cd /Volumes/nvme2230/lab/ncwk/upstream/hermes-studio
npm ci   # 上游依赖(若未装)
cd ../../overlay
# overlay 依赖 vite 等,需能解析到上游 node_modules
npm run dev  # 或 node --import tsx scripts/dev.mjs
```
Expected: Vite 启动,浏览器打开后能看到 hermes-studio 界面 + 自定义导航项(matrix/kanban)。
> 若失败,按错误调整 entry.mts 的 import 路径或 alias。这是阶段 3 最可能出问题的点,预留迭代。

- [ ] **Step 3:验证三大功能**

手动检查:Matrix 聊天入口可用、Kanban 增强视图渲染、品牌 logo 替换。

- [ ] **Step 4:若 client 验证通过,提交任何修复**

```bash
git add -A
git commit -m "fix(client): resolve overlay dev startup (entry/alias adjustments)"
```

### Task 3.10:迁移 client UI 侵入点(A 类:App.vue/router/PageSidebarNav 等)为 registry 注册

> spec §6.1 的"UI 侵入点(A 类)"~9 文件。这些原来直接改上游文件(App.vue 加 bypass 检查、router 加路由、PageSidebarNav 加导航)。改为经 registry 运行时注册。

**Files:**
- Modify: `overlay/registries/client/bootstrap.ts`(注册 matrix/kanban 的路由与导航)
- Create: `overlay/custom/client/matrix-chat/routes.ts`(用 registerRoute)
- Create: `overlay/custom/client/kanban/nav.ts`(用 registerNavEntry)

- [ ] **Step 1:把 matrix 聊天路由改为 registerRoute**

> 原 hermes-web-ui 的 router/index.ts 改动(matrix 路由)→ 在 `overlay/custom/client/matrix-chat/routes.ts` 用 `router.addRoute`(bootstrap 已调 `getRegisteredRoutes` 统一 addRoute)。

- [ ] **Step 2:把 kanban/matrix 导航项改为 registerNavEntry**

> 原 PageSidebarNav.vue 的 openMatrixChat/openKanban 改动 → PageSidebarNav 本身需读取 registry 的 navEntries 渲染。由于 PageSidebarNav 是上游组件,纯运行时注入需:在 entry shim bootstrap 后,提供一个全局 reactive 的 navEntries,并让 PageSidebarNav 经 monkey-patch 或 provide/inject 读取。
>
> **若 PageSidebarNav 无法纯运行时注入**:降级该组件为 B 类 patch(把导航项加入的改动转 patch),其余 UI 侵入点尽量 registry。在 commit 标注降级。

- [ ] **Step 3:逐个 UI 侵入点评估,能 registry 的转 registry,不能的降级 patch**

> 对照 `hermes-web-ui/CUSTOMIZATIONS.md` 的 9 处清单逐一处理。

- [ ] **Step 4:提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add registries/ custom/ patches/   # patches 含降级的 UI 文件
git commit -m "feat(client): convert UI intrusion points to registry (with patch fallbacks)"
```

---

## 阶段 4:删除旧目录、收尾验证

### Task 4.1:全量验证(spec §6.3)

- [ ] **Step 1:inject --clean 后上游完全干净**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run clean
cd ../upstream/hermes-studio
git status --porcelain | wc -l   # 0
git log --oneline origin/main..HEAD | wc -l   # 0
```
Expected: 均为 0。

- [ ] **Step 2:inject 后上游仅含 B 类 patch 改动**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run inject
cd ../upstream/hermes-studio
git status --porcelain
```
Expected: 仅显示 patches/series 里列出的 B 类文件为 modified;无本地 commit。

- [ ] **Step 3:overlay 构建成功 + 三大功能可用**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run build   # 成功
npm run dev     # 手动验证 matrix/kanban/branding
```

- [ ] **Step 4:overlay git diff 无上游代码混入**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git diff --stat | tail -5   # 仅 custom/patches/registries/scripts/config/assets
```

### Task 4.2:归档旧目录 hermes-web-ui/(不删除,保留为回滚依据)

> 评审决策:hermes-web-ui/ 的 7 个本地分支均未推送、无备份。不执行 rm -rf,改为重命名归档,待确认 overlay 长期无问题后再由人工删除。

- [ ] **Step 1:确认 overlay 已 commit 全部迁出成果**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git status   # clean
```

- [ ] **Step 2:重命名归档(保留全部本地分支与工作树)**

```bash
cd /Volumes/nvme2230/lab/ncwk
mv hermes-web-ui hermes-web-ui.archived
```

- [ ] **Step 3:验证工作区最终结构**

```bash
cd /Volumes/nvme2230/lab/ncwk
ls -d */   # 应余:docs/ upstream/ overlay/ hermes-web-ui.archived/ (及 .superpowers/)
```
Expected: 含 `docs/  upstream/  overlay/  hermes-web-ui.archived/`。归档目录保留,待后续人工确认后删除。

- [ ] **Step 4:在归档目录写一个 README 说明其状态**

```bash
cd /Volumes/nvme2230/lab/ncwk/hermes-web-ui.archived
cat > ARCHIVED.md <<'EOF'
# 已归档(2026-06-21)

本目录是 overlay 迁移的**来源**,二次开发成果已迁出至 ../overlay/。
本地 7 个分支(custom/*, refactor/*, backup/*)未推送,作为回滚依据保留。
确认 ../overlay/ 长期无问题后,可由人工删除本目录。
EOF
```

### Task 4.3:模拟上游升级流程

- [ ] **Step 1:跑 sync 脚本(即使上游无新版本,验证流程可跑通)**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
npm run sync
```
Expected: clean → fetch/reset → inject → verify 全程无错。

- [ ] **Step 2:验证升级后功能仍在**

```bash
npm run build && npm run dev   # 手动确认三大功能
```

### Task 4.4:更新 spec 状态 + 收尾提交

- [ ] **Step 1:把 spec 状态改为"已实施",记录实际降级情况**

```bash
# 编辑 docs/superpowers/specs/2026-06-21-overlay-architecture-design.md 顶部
# 状态: 待评审 → 已实施(2026-06-21)
# 在 §6.1 表格补注实际降级为 patch 的文件清单(若有)
```

- [ ] **Step 2:overlay 仓最终提交**

```bash
cd /Volumes/nvme2230/lab/ncwk/overlay
git add -A
git commit -m "chore: overlay migration complete (spec §6.3 verified)"
```

---

## Self-Review(实现者完成后自查)

实现全部 Task 后,对照 spec 逐项核查:

1. **§1.4 目标 1**(三上游仓纯净):`git -C upstream/* log origin/main..HEAD` 均空?
2. **§1.4 目标 2**(overlay 唯一被提交):工作区仅 upstream/+overlay/+docs/?
3. **§3.3/3.4**(A 类 registry):client entry shim 启动正常,registry 路由/导航生效?
4. **§3.5**(B 类 patch):7+ patch 在 series,inject/clean 可逆?
5. **§4**(inject 流程):inject→clean→verify 往返无错?
6. **§5**(升级流程):sync 脚本跑通?
7. **§6.1**(迁移分类):91 纯新增 + A 类导出 + B 类 patch + i18n + assets 全覆盖?
8. **§6.2**(hermes-agent 不动):未触碰?
9. **§6.3**(验证标准 4 条):逐一通过?
10. **§8**(验收 5 条):逐一通过?

任何"否"→ 回到对应 Task 修补。
