# AIStudio 单仓整合（ncwk 五组件合一 + GitHub 更名）

- 日期：2026-10-24
- 状态：已裁定，实施中
- 分支：feat/integrate-aistudio
- 关联：`docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`（SIM 根目录约定）、`vendor/VENDOR.md`（基线台账）

## 背景与目标

ncwk 工作区当前为多仓散落形态：overlay（SwarmStudio 补丁仓，origin=issac-new/SwarmStudio）、upstream/（三棵真实基树 hermes-studio/hermes-agent/zcode + 参照软链）、simharness（独立仓 issac-new/simharness）、Swarm-yuan（技能仓，本体外置 ~/lab/Swarm-yuan）、docs/superpowers（工作区层散档）。用户裁定（2026-10-24）：

1. 整合为**一个完整项目 AIStudio**：单 zcode 工作区 = 单 git 仓根；GitHub 仓库 issac-new/SwarmStudio 更名 **AIStudio**（旧 URL 重定向）。
2. 整合方式＝**基线入库 + 补丁机制内化**（449 补丁/series 846 条的 inject 管线全保留，目标树从外置 upstream/ 切到仓内 vendor/ 钉版基线）。
3. simharness 源码 subtree 并入；swarm-yuan **技能本体**源码并入（排除 dist 离线包）；element-web 不入仓（无构建依赖，仅参照，见 build.mjs/inject.mjs 全文无引用、patch 008/667 仅为静态挂载钩子）。
4. GitHub 仅存源码/脚本/文档/依赖清单；中间产物（node_modules、dist、runs、截图、离线包、evidence 二进制）不入库。
5. 合并后 simharness 与 Swarm-yuan 两旧仓 archive。

## 目标目录（终态）

```
AIStudio/（= 原 ncwk/overlay 仓根，zcode 工作区根）
├── README.md / AGENTS.md / CLAUDE.md   # AIStudio 品牌 + 单仓工作区规则
├── patches/ custom/ scripts/ zcode-patches/ …   # 原 overlay 全部原位，零路径重排
├── vendor/{hermes-studio,hermes-agent,zcode}/  # 上游基线钉版快照（无 .git，外仓跟踪）
├── simharness/                          # subtree 并入（历史保留）
├── skills/swarm-yuan/                   # 技能本体（排除 dist）
├── docs/                                # overlay/docs + 工作区层散档归一
└── （gitignored 本地基建）upstream/ archive/ sim-mux/ governance/ …
```

## 技术要点

### vendor 模式 git 适配（inject.mjs 导出，四脚本共用）

vendor/<tree> 是外仓跟踪的普通目录（不能带自身 .git——嵌套 .git 会让外仓记成 gitlink 无法跟踪文件）。因此：

- **apply/reverse**：`git apply --directory=vendor/<tree> <patch>`，cwd=仓根（worktree 检出即 worktree 根，自包含）。
- **status/dirty-check**：`git status --porcelain -- vendor/<tree>` + 剥前缀，输出与树内相对路径同构，现有 precheck/豁免逻辑零改动兼容。
- **产物还原**：`git checkout -- vendor/<tree>/<file>`。
- 有 `.git` 的树（外置 upstream/，env `OVERLAY_UPSTREAM_ROOT` 指定时）保持今日行为，双模并存。

### 默认根解析顺序（inject/serve/build/ensure/zcode-engine 统一）

`OVERLAY_UPSTREAM_ROOT` env ＞ 仓内 `vendor/`（存在即用）＞ 旧布局 `../upstream/`。合并前主检出无 vendor/，行为不变、活服务零影响；合并后默认切 vendor/。

### node_modules 共享（worktree 语义）

vendor/hermes-studio/node_modules 不入库（产物）。worktree 检出缺依赖时，inject 自动软链到主检出（`git rev-parse --git-common-dir` 定位）的 vendor node_modules，保持单实例；全新克隆需 `npm ci`（README 上手步骤）。

### 基线钉版（2026-10-24 实测）

| 树 | commit | 版本 | 说明 |
|---|---|---|---|
| hermes-studio | 04e5d9aa7 | v0.7.38 | 干净 HEAD 快照（工作树注入态不入库） |
| hermes-agent | 4d04303818 | v0.22.4 | 同上 |
| zcode | 3c5b2276 | series 基线 0a1fc56+1 | series 头声明 0a1fc56(v3.16.1)；实际树 HEAD 为其后一个 sync 提交，补丁在 3c5b2276 上重放实测通过（见 VENDOR.md），台账记录差一提交事实 |

### vendor 防误提交

inject 后 vendor/** 在外仓呈脏态（与今日 upstream 注入态同构）。防 `git add -A` 误收：pre-commit 钩子自动把 vendor/** 路径撤出暂存区（告警不阻断），基线替换走显式 `npm run vendor:sync` 通道。

## 验证门

1. vendor 树上 846-series 补丁全量重放：studio 零 FAILED（硬门）、agent/zcode 容错语义与今日一致；随后 --clean 反向还原回 pristine。
2. /tmp 全新克隆：inject → vendor npm ci → serve（8647 探活）→ dev（8649 走查）→ smoke 子集，零新增回归。
3. 合并后主检出 vendor npm ci + serve-main 换装 + 双端活体绿。

## 验证结果（2026-10-24 实测）

| 门 | 结果 |
|---|---|
| ① vendor 重放 | 403 applied（396 studio/agent + 7 zcode）、0 FAILED；--clean 反向后 vendor 状态 0 行（pristine 复原）。字节对拍 vs 活 upstream 注入树：agent/zcode 零真实差异；studio 仅 2 文件差异且方向=活树滞后（serve-main 钉旧 commit，patch 686 新内容在 vendor 正身侧） |
| ② /tmp 全新克隆 | 克隆→inject 403/0（完整性硬门过）→ npm install 35s/942 包 → serve :8669 /health 200（agent_bridge ready）→ vite :8659 200（title=SwarmStudio）+ 经代理 /health 200 → 守门测试 18/18 |
| ③ GitHub | merge f7cd7bb64 → main；issac-new/SwarmStudio rename → AIStudio（origin 已更新，redirect 保留）；simharness/Swarm-yuan 两旧仓 archived（isArchived=true） |

整合过程修复的三件缺陷（均有独立提交）：

1. `.gitignore` 全局 `packages/`、`tests/` 规则误伤 vendor 基线——根锚定后补收 24,772 文件（f0e2ac5）。
2. 全新克隆 README 顺序（inject 先于 npm install）下 node_modules 软链无人补链致 serve 崩（koa TS2307）——ensure-injected 幂等补链。
3. 守门测试解析序：aipay-agent-sync.sh 改仓内 simharness 优先（dee0022）；ensure-injected 导入序适配锚定字面量。

挂账（不阻塞本整合）：

- Ycode 引擎在 vendor/zcode 的 pnpm install+build（`npm run zcode:ensure`，首次较重）；当前引擎位仍可回落外置树。
- `.swarm-yuan/hooks/pre-commit` 自包含化改动须回移 generate-skill.sh 装配模板。
- skillgov 生成器路径（~/.cc-switch/skills/swarm-yuan）可择优切仓内 `skills/swarm-yuan`（SKILLGEN_PATH 已支持覆盖）。
- 辅助脚本（build-dmg/drift-audit/sync-upstream/migrate-patches 等）仍按旧布局路径解析，用 env 覆盖可用，随后续轮逐个吸收。

## 决策记录

| # | 决策 | 来源 |
|---|---|---|
| 1 | 单仓整合，ncwk/GitHub 仓均更名 AIStudio | 用户 2026-10-24 指示 |
| 2 | 基线入库+补丁内化（否决源码固化——上游升级本周两次，固化后升级成本不可接受） | 用户勾选（AskUserQuestion） |
| 3 | simharness/Swarm-yuan 旧仓 archive | 用户勾选（AskUserQuestion） |
| 4 | GitHub 仅存源码脚本，中间产物不入库 | 用户 2026-10-24 指示 |
| 5 | element-web 不入仓（无构建依赖实证） | 探查结论 + 决策 4 |
| 6 | swarm-yuan 仅入技能本体，dist 离线包排除 | 决策 4 推论 |
| 7 | 工作区目录改名（ncwk→AIStudio）放最后阶段，须等在途会话收口、停 8647/8649 后执行 | 2026-10-17 双删事故立法 + 运行中服务实测 |
| 8 | SwarmTeam 多 profile 部署包（本机 ~/.hermes/profiles 的脱敏分发源）并入 `team/`，旧仓 issac-new/SwarmTeam 归档 | 用户 2026-10-24 指示（「本机 hermes agent 的 profile 等也合并入当前项目」） |
| 9 | AIStudio 仓转 **private**：整合 push 落地后短暂公开暴露了原私有 simharness 内容（窗口约数分钟，唯一 fork 为 9 月旧 SwarmStudio 快照不含该内容，高置信密钥模式扫描零命中），转私有止损；是否恢复公开由用户裁定（恢复前须完成 simharness 脱敏审查） | 2026-10-24 泄露止损（转私有可逆/泄露不可逆） |
