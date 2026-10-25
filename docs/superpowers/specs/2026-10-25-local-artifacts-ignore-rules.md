# 本地产物忽略规则补齐（接管收口批）

- 日期：2026-10-25
- 背景：接管收口轮（main 同步 6ddf9e099、被取代分支清理、推送）后，主树余 71 个未跟踪条目不在忽略规则内，污染 `git status`。本批逐类处置并补规则。

## 变更

1. `.gitignore` 新增两条锚定规则：
   - `runtime/hermes-records/` —— hermes 系统记录同步副本（11MB，decisions/design/evals/research + SHA256 清单）；
   - `/skills/.swarm-yuan/` —— swarm-yuan 生成器状态目录残留（仅 45B 的 `.gate-fail-flag` 瞬态标记）。
2. `info/exclude` 本轮零变更（两类产物均按通用通道处置，见决策 D1/D2）。
3. vendor/ 下 69 个未跟踪文件**不加**忽略规则（决策 D3）。

## 决策记录

- **D1 runtime/hermes-records/ → .gitignore（通用通道）**：`runtime/hermes-records/MANIFEST.md` 自述为 2026-10-25 08:18 生成的「本地工作副本」，源映射指向本机 `~/.hermes/shared/`、`team/profiles/` 等系统记录位置，回流走手动反同步；`runtime/`、`custom/`、`scripts/`、`registries/` 全域 grep 零代码引用。内容含内部决策与调研快照，不入公开仓是安全底线，故走通用 .gitignore（对任何机器的同类同步副本生效），而非机器特定 info/exclude。
- **D2 skills/.swarm-yuan/ → .gitignore（根锚定）**：swarm-yuan 生成器（`assets/precheck.sh` 等）在所运行项目根落 `.swarm-yuan/` 状态目录；本仓根 `.swarm-yuan/` 已按 AGENTS.md「有意入库」例外跟踪。`skills/.swarm-yuan/` 是对 skills/ 树运行后的残留，仅含 `.gate-fail-flag`（precheck 失败标记，写者 `skills/swarm-yuan/assets/precheck.sh`，成功覆盖式运行时清除）。根锚定 `/skills/.swarm-yuan/` 与根例外互不误伤。
- **D3 vendor 69 个 ?? 不加规则**：抽验证实其构成为补丁新增文件（inject 应用 patches/ 产生）与 runtime 覆盖层拷贝（拼合树测试前置），与 311 个 tracked M 注入态文件同源同性质。`.gitignore` 既有立法（vendor 段注释）明确「基线整树入库，只挡本地构建垃圾、根锚定防误伤」（2026-10-24 全局规则误伤 24,772 个基线文件的事故实录），且 AGENTS.md 立法「注入后的脏态是预期工作态」——git status 常驻注入态是设计态，不做半清（只清 ?? 清不掉 M，反而掩盖注入面）。
- **D4（挂账，本轮发现）**：AGENTS.md 所称「pre-commit 自动撤出（vendor 脏态不入提交）」在现行钩子（`.claude/skills/aistudio-dev/scripts/spec-first-pre-commit.sh`，经 `.swarm-yuan/hooks/pre-commit` 垫片 exec）中**不存在**——钩子全文仅做 spec-first 四层拦截，无 vendor 撤出/挡护逻辑；`git add -A` 可将注入态 M+?? 卷入提交。本轮以精确暂存（只 add 本 spec 与 .gitignore）规避。修法挂账：aistudio-dev 技能源脚本补 vendor/** 挡护段后重装配 `core.hooksPath` 钩子。

## 验证

- 全量 `npm test`（vitest run，主检出规范位）：**884 测试文件 878 过 + 6 跳过、0 失败；6345 用例 6334 过 + 11 跳过；EXIT=0，84s**（日志 /tmp/npm-test-main-6ddf9e099.log）。环境前置核验在案：`~/lab/upstream/hermes-agent|hermes-studio` 软链挂 vendor 注入态、`~/lab/simharness` 软链、`node_modules → vendor/hermes-studio/node_modules`。
- 忽略规则生效：`git status` 未跟踪面由 71 条收敛至 69 条（余 69 全为 vendor 注入态 ??，见 D3 属设计态），`runtime/hermes-records/` 与 `skills/.swarm-yuan/` 不再显示。
- 提交面：仅 `.gitignore` + 本 spec 两个文件入库（精确暂存，规避 D4 挂账缺口）。
