# 2026-11-12 yuan-linux 测试修复与 branch 门白名单根治

## 变更

两件事同批：

1. **swarm-yuan sweep Linux CI 4 个安装族测试失败修复**（macOS 全绿、Linux 独有；ubuntu:24.04 容器逐测复现定位）：
   - `skills/swarm-yuan/assets/tool-adapters/common.sh` `ta_tool_home`：`local tool="$1" home det` 改为声明即初始化 `home="" det=""`。根因：bash 3.2 把未赋值 `local x` 视为「已置空」，bash ≥4.4（CI 为 5.2）视为「未置」——`set -u` 下 `[[ -z "$home" ]]` 在 Linux 直接报 `home: unbound variable`（common.sh:186 实测）。该函数是宿主检测/交叉渲染/注销共用的探测入口，一处中断使 `install --list` 检出数归零、`--agents`→zcode 交叉渲染缺失、`--uninstall --all` 中途死亡——波及 `test-r118-install-hardening.sh`（4b）、`test-r128-install-uninstall.sh`（1a/2d/2e/2f/2g/2n/3a 级联）、`test-default-skill-dir.sh`（⑦b）三个测试。
   - `skills/swarm-yuan/scripts/skill-behavioral-eval.sh`：`--dry-run` 分支移到 runner 探测之前，并消除重复的用例装载块。根因：dry-run（只打印计划不烧 token）原先排在 `_pick_runner` 之后，无 claude/codex 的环境（Linux CI）先 exit 2，计划面永不可达；macOS 本机因装了 claude CLI 而侥幸绿。`test-skill-behavioral-eval.sh` 态1 失败根因。

2. **branch 门「main 检出恒红」误报根治＋ENFORCE 回挂**：
   - `skills/swarm-yuan/assets/gates-strict.sh` 与域源 `skills/swarm-yuan/assets/gates/process/branch.sh`（两处同步）：`check_branch` 语义从「检出在保护分支即 fail」改为「保护分支上有实质开发改动才 fail」。新增 `_branch_change_allowed`：merge 态（MERGE_HEAD 在）/ 工作区零变更 / 变更全部命中 `PROTECTED_BRANCH_ALLOW` 白名单（空格分隔 glob，`dir/**` 前缀匹配子树；白名单用 `read -a` 拆分——裸 `${VAR}` 迭代会路径名展开使 `docs/**` 语义静默失效，fixture 实抓）三态放行；未配置白名单=保护分支上任何变更都拦（既有安装不静默放宽）。
   - `skills/swarm-yuan/assets/precheck.conf` 新增 `PROTECTED_BRANCH_ALLOW="*.md docs/** .swarm-yuan/** vendor/**"`（MEASURE 注释齐全），默认对齐本仓工作流：AGENTS.md 规则 3（worktree/feature 开发→main 合并→chore/docs 直提）＋规则 1（vendor 注入后钉版基线脏态属预期工作态，不构成实质开发）。
   - fixture 契约改版：`violating-on-main`/`violating-on-master` 由「干净 main」改为「main＋白名单外源码改动」（新语义下的真实违例形态）；新增 `compliant-on-main-docs`（main＋仅 docs 改动→绿）、`compliant-on-main-clean`（main＋零变更→绿，恒红误报修复锚点）、`violating-on-main-legacy`（无白名单键＋docs 改动→仍拦，锁「未配置=全拦」）。
   - 新增 `skills/swarm-yuan/tests/test-branch-protected-allowlist.sh`（fixture 七态＋计数锁＋merge 态端到端＋merge 撤销后恢复拦截＋conf/双落位/生成物随发静态锚），登记 `tests/index.tsv`（level 2）与 `tests/domains.tsv`（gates 域）。
   - 部署面（任务范围允许）：`~/.agents/skills/aistudio-dev/scripts/` 最小同步 `gates-strict.sh` 与 `precheck.conf`（新增 conf 键），`GATE_ENFORCE_DENY` 从空串回挂为原白名单（见 conf 注释与 decisions.jsonl 877a9ad 行）。
   - `.swarm-yuan/decisions.jsonl` 追加 Mechanical 落痕（ENFORCE 回挂＋根因）。

## 决策记录

- **D1 白名单用 conf 键而非硬编码放行类型**：分支门是生成器通用件，硬编码「chore/docs 放行」会把一个仓的工作流强加给所有生成项目。`PROTECTED_BRANCH_ALLOW` 路径 glob 让各项目按自己工作流声明登记面；本仓模板默认即 aistudio-dev 形态。备选「解析 commit message 前缀」被否：precheck/fail-gate-hook 在编辑期与提交前运行，message 尚不存在，判定面不可达。
- **D2 未配置白名单=保护分支上任何变更都拦（不放松）**：既有安装升级 gates 实现后行为不静默放宽；零变更与 merge 态仍放行——这两个放行正是恒红误报的修复点，不属于「放松」而是修正「检出位置」误判。
- **D3 判定面复用 `_git_changed_files`**：与 spec-first/scope 门同一变更清单口径（base...HEAD＋工作区＋未跟踪），不在 branch 门私开一套 diff 逻辑。
- **D4 修复而非 skip**：4 个 Linux 失败测试全部定位到真实分歧（bash 3.2/5.2 `local` 语义差异、dry-run 顺序），无一处 skip；Linux 行为由 ubuntu:24.04 容器（bash 5.2.21）实测复现与验证。
- **D5 容器伪影识别**：容器挂载无 .git 使 r118 2a（`git describe` 版本号）失败属容器伪影——CI 是完整 checkout，`--always` 兜底短 SHA；该断言不改。

## 验证

- Linux 复现与修复验证：ubuntu:24.04 容器（装 shellcheck/git/python3，git init+commit+tag 模拟 CI checkout）修前 4 测 FAIL → 修后 4 测全 PASS（test-skill-behavioral-eval / test-default-skill-dir / test-r118-install-hardening / test-r128-install-uninstall）。
- branch 门：`bash tests/run-gate-fixture.sh branch` 7/7 绿；`bash tests/test-branch-protected-allowlist.sh` 全绿；bash 3.2 兼容性（`read -a` 拆分＋matcher）以 `/bin/bash`（3.2.57）单测通过。
- macOS 本机：4 个修复测试＋新增测试全绿（回归不破坏）。
- 主检出（main）实测：无改动跑 branch 门→绿；纯 docs 改动→绿；构造 staged 源码改动→红（详见部署后验证输出）。
- 全量：`npm test`、`self-check.sh --check-only`、`gen-doc-indexes --write/--check`、`governance-lint --budget` 结果见交付报告。
- 未验证项：GitHub Actions Linux CI 真机（ubuntu-latest runner）待推分支后由 CI 验证；容器已同构复现（bash 5.2.21），残余风险低。

## 设计文档影响

DESIGN_SYNC: none——本批不触及整合正本与数字总账（改动面为 swarm-yuan 技能自身测试/门禁实现与 conf 模板，分支门语义注释已随代码落位，无跨文档数字或契约需要同步修订）。
