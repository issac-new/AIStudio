# AIStudio 单仓 — AI 工作入口

一句话：AIStudio 是单一完整项目仓（原 ncwk 多仓于 2026-10-24 整合）：AIStudio 桌面应用（Electron + Koa + Vue 3）的二次开发层 + `vendor/` 钉版上游基线 + `simharness/` 推演 harness + `skills/swarm-yuan/` 技能本体。所有改动经 `patches/` 与 `custom/` 在构建期注入 `vendor/` 基线（`npm run inject`）。

## 工作规则

1. 只改本仓；`vendor/**` 是钉版基线（台账 `vendor/VENDOR.md`），注入后的脏态是预期工作态、不入提交（pre-commit 自动撤出）；基线替换只走 `npm run vendor:sync` + `VENDOR_SYNC=1` 显式通道。`vendor/**` 内禁建 `.git`。
2. 代码改动先写 `docs/superpowers/specs/YYYY-MM-DD-<slug>.md`，至少含「变更 / 决策记录 / 验证」三段；spec 是决策事实源，不是事后补记。
3. 分支 `feat|fix|refactor/<slug>`，从 `origin/main` 起；并行会话用 worktree；清理只走 `git worktree remove/prune`，禁止 `rm -rf`。
4. 提交前跑目标测试 `npx vitest run <path>`；合并前 `npm test`；新增服务端模块跑 `npm run typecheck:harness`。
5. 失败不隐瞒：测试红、步骤跳过、未验证项必须写进交付说明。
6. 安全纪律：审计不落敏感原值；密钥只存 env 名；不削弱既有安全边界。
7. 注释用中文，标识符用英文；注释只写约束与来源，不复述代码。
8. 本仓只存源码/脚本/文档/依赖清单；中间产物（node_modules、dist、runs、截图、离线包、evidence 二进制）不入库（.gitignore 立法，2026-10-24 用户指示）。

## 目录导航

| 路径 | 作用 |
|---|---|
| `custom/server/` | Koa 服务端扩展；域索引见 `custom/server/AGENTS.md` |
| `custom/client/` | Vue 客户端扩展；组件约定见 `custom/client/AGENTS.md` |
| `custom/qgate/` | 质量门禁框架（L0-L5 gate packs） |
| `patches/` | 上游注入补丁（编号 series）；改上游行为必须走这里 |
| `vendor/` | 上游钉版基线（hermes-studio v0.7.39 / hermes-agent v0.22.5 / zcode v3.16.1 系列）；只读，台账见 `vendor/VENDOR.md` |
| `simharness/` | 全流程推演 harness（mx-* 脚本/场景/守门测试；SIM_ROOT 等运行态在仓外） |
| `skills/swarm-yuan/` | swarm-yuan 技能本体源码（六段目录；dist 离线包不入库） |
| `runtime/` | agent 运行时扩展（Python/TS 工具与检查器；部署到 ~/.hermes/hermes-agent） |
| `scripts/` | inject / build / serve / verify / vendor-sync 脚本 |
| `docs/superpowers/specs/` | 设计规格与决策记录（单一事实源） |
| `registries/` | 客户端/服务端路由与功能注册表 |
| `team/` | SwarmTeam 多 profile 部署包（脱敏正本；安装指南见目录内 README） |
| `zcode-patches/` | Ycode（zcode 分叉）编辑器补丁 series |
| `evidence/` | 验证证据留档（文本类；二进制中间产物不入库） |
| `assets/` | 静态资产与技能品牌配置 |
| `config/` | 特性开关与回路配置（bootstrap/features/loop-config；features.cockpit 等门控在此） |

### 隐藏目录（入库但易漏）

| 路径 | 作用 |
|---|---|
| `.swarm-yuan/` | 本仓自身的 swarm-yuan 项目状态：`hooks/pre-commit`（`core.hooksPath` 指向的 L2 钩子）+ decisions/trace 台账——**有意入库**，fresh clone 即得钩子与留痕 |
| `.qgate/` | qgate 门禁运行面（`gates/` 项目覆盖门 + `cache/` 运行证据） |
| `.archived-patches/` | 退役补丁族档案（旧 matrix 系列 018-061 等） |
| `.github/` | CI（`workflows/qgate.yml`） |

### 本地基建（不入库；.gitignore / info/exclude / 自忽略兜底）

`upstream/`（升级源缓存，pristine 规则见 `vendor/VENDOR.md`）、`archive/`（旧仓归档+bundle）、`sim-mux/`（SIM 运行数据）、`governance/`（治理生产仓，嵌套 git）、`.claude/`（worktrees）、`.zcode/`、`.gstack/`、`.superpowers/`、`node_modules`（符号链 → `vendor/hermes-studio/node_modules` 借用）。新增本地目录须同步加忽略规则（通用产物进 `.gitignore`、机器特定进 `info/exclude`），禁裸放污染 git status。

## 三条不变量

- **单一事实源**：契约、阈值、格式只定义一处；改一端必须同步消费者与守门测试。
- **fail-soft 不造假**：源缺席返回 `null` / `available:false`，不猜数；审计失败可见但不阻断业务。
- **执行层强制**：权限与沙箱不能只靠提示词，边界上的确定性检查优先。

## 输出格式

结论先行 → 改动清单（文件:行）→ 验证命令与结果 → 未做/未验证项。
