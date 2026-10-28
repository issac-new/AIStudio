# scripts/ 说明

构建、注入、验证与运维脚本。**根目录只放被外部显式调用的入口和共享库**，其余按用途进子目录（2026-10-28 整理）。

## 归位规则

| 判据 | 落位 |
|---|---|
| 被 `package.json` scripts、CI workflow、qgate 配置、源码或测试按路径调用 | 留在 `scripts/` 根 |
| 被其他脚本 `import`/`require` 的共享库 | 留在 `scripts/` 根或对应子目录 |
| 走查、探针、验收、冒烟等一次性验证脚本 | `regression/` |
| 数据迁移、批量重生成、漂移对账、一次性修复 | `maintenance/` |
| 单一工具族的配套文件（如 `plan-html/`、`fibo/`、`runtime/`） | 该工具族目录内 |

新增脚本先跑引用扫描再决定落位，不要按文件名猜。判断依据是「有没有调用方」，不是「看起来像不像入口」。

## 根目录入口（被 package.json 调用）

| 脚本 | npm 命令 |
|---|---|
| `inject.mjs` | `npm run inject` / `npm run clean` |
| `ensure-injected.mjs` | `predev` / `prebuild` / `pretest` / `npm run ensure-injected` |
| `serve-server.mjs` | `npm run serve` |
| `build.mjs` / `build-dmg.mjs` | `npm run build:full` / `npm run build:dmg` |
| `verify-clean.mjs` / `verify-dist.mjs` | `npm run verify` / `postbuild` |
| `sync-upstream.sh` / `vendor-sync.sh` | `npm run sync` / `npm run vendor:sync` |
| `zcode-engine.mjs` | `npm run zcode:ensure` / `npm run zcode:serve` |
| `zcode-catalog-check.mjs` | `npm run catalog-check` |
| `check-bundle-budget.mjs` | `npm run check:bundle` |
| `forge-benchmark.mjs` | `npm run bench:expert` |
| `verify-release-manifest.mjs` / `make-release-packages.mjs` | `npm run release:check` / `npm run release:packages` |
| `deploy-agent-runtime.mjs` | 由 `inject.mjs` 在注入出口调用（按 `runtime-manifest.json` 同步运行时）；`build.mjs` 不调用它，只复用同一套上游根解析约定。目标与模板不同默认保留，`--force` 才覆盖 |

## 根目录其余常驻项

- `diagram-export-png.mjs`、`diagram-self-check.sh`、`sync-diagram-skill.mjs`、`ts-resolve.mjs`、`archive-agent-patches.sh`、`classify-agent-patch.py`、`loop-migrate.mjs`、`loop-migrate-saas.mjs`：被源码、测试或同族脚本按路径引用，位置即契约。
- `serve-server.sh`：POSIX 兼容的旧包装器（`npm run serve` 走 `serve-server.mjs`）；无 package.json/CI/测试调用，保留仅为手工排障通道。
- 移动上述任一文件前，先 `git grep -F <basename>` 确认调用方，并同批改调用方。

## 子目录

| 目录 | 内容 |
|---|---|
| `regression/` | 浏览器走查、探针、验收与冒烟脚本（`harness.mjs` 为共享夹具） |
| `maintenance/` | 迁移、重生成、对账与一次性修复工具 |
| `plan-html/` | 方案正本 md → HTML 的渲染链 |
| `runtime/` | agent 运行时的注册与诊断脚本 |
| `fibo/` | FIBO 本体索引同步 |
| `governance/` | 治理仓相关脚本 |
| `githooks/` | git 钩子样本 |
| `lib/` | 共享小工具 |
| `v0735-fixes/` | 0.7.35 升级轮的定向修复脚本（历史批次，保留可追溯） |
| `__tests__/` | 本目录脚本的守门测试 |

## 上游根解析约定

需要访问 hermes-studio 上游树的脚本，统一使用 `env → vendor/hermes-studio → 旧 ../upstream` 的解析序（先例见 `build.mjs`、`serve-server.mjs`）。纯本仓检出没有兄弟 `upstream/`，写死不生效。
