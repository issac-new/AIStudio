# R119 全面审计加固轮——复盘、重构与全量回归

> 载体：swarm-yuan 生成器自身（不是目标项目）。目标：全面深入复盘 → 识别问题与隐患 → 重构改进 → 完整自回归 → 修复 → 发布 GitHub。发版 v2.84.0。
>
> 结论先行：基线 `run-sweep` 全绿并不等于门禁有效。本轮用五路并行审计 + 变异复现证明，系统存在三类结构性缺陷：**fail-open 默认值**、**多事实源漂移**、**把项目输入当可信 shell 文本**。共修复 2 个 P0、40+ 个 P1/P2 项，新增 5 条回归锁，81 框架双态与 48 组门禁夹具全过，发布 v2.84.0。

## 一、复盘方法

1. **基线**：在未改动的 `origin/main` 上跑 `bash swarm-yuan/tests/run-sweep.sh`，66 项全过。基线全绿是审计起点，不是结论。
2. **五路并行只读审计**，每路独立取证、每项发现带 `file:line` 或最小复现：
   - 门禁正确性与死代码：注册表闭环、fail-open、`set -e` 传播、跨平台、框架片段。
   - 脚本健壮性与安装/部署：8 宿主检测、生成器升级、路径含空格、符号链接、Windows Git Bash。
   - 文档口径单一事实源：facts.conf ↔ SKILL/README/CLAUDE/CONTRIBUTING/references 交叉表、断链、生成流程三方一致。
   - 测试/CI/发布链：56 门禁 → 测试覆盖矩阵、CI 诚实性、golden/verifier、离线包与源码包可复现性。
   - 安全与供应链：命令注入、临时文件、安装器写入、hooks、CI 权限、物化运行时、离线下载。
3. **提交历史度量**（近 7 天）：43 commits、fix ratio 25%、热点 `CHANGELOG.md`/`README.md`、`dist/` 历史体积占比 81%——提示“文档/发布物反复手改、生成链税高”，与审计发现互相印证。
4. **修复后回归**：`run-sweep` 全量 + 自举三档 + 48 门禁夹具 + 81 框架双态 + 文档数字锁 + 两个真实项目（task-forge/nest-forge）。

## 二、关键发现

### P0（阻断交付的假通过）

1. **门禁实现文件缺失时整体判通过**：`assets/precheck.sh` 的 source 守卫用 `|| true` 吞掉缺失/加载失败，`_gate_exec` 又把 127 吞进 `|| true`；11 个 core 门禁全部 `command not found` 时仍输出“门禁检查通过”且 rc=0。安装损坏、升级中断、拆分包漏拷都会触发。
2. **`const` 声明密钥系统性漏检**：`assets/gates-strict.sh` 的硬编码密钥排除串含 `const [A-Z_]`，但外层是 `grep -viE`（忽略大小写），`[A-Z_]` 实际匹配小写 `const`，所有 `const password = "..."` 被整体排除；同时 `|\*|` 分支排除任何含 `*` 的行。默认 `--all` 对 JS/TS 最常见的密钥声明失明。

### P1（按域归类，逐项有最小复现）

**安全门禁 fail-open**
- `sensitive`/`security`/`authz` 在扫描目录为空或全部不存在时 warn 后 pass；`sensitive` 默认 `SCAN_DIRS=()` 时直接打印“未发现”。
- `privacy` 的非法用户 ERE 被 `2>/dev/null || true` 吞成“无命中”；`PRIVACY_EXEMPTIONS`/`SBOM_LICENSE_EXEMPTIONS` 只回显不参与判定。
- `release-sign` 在 `REQUIRED=1` 且零产物时输出“0 个产物签名齐备”并 rc=0；零字节 `.asc/.sig` 也算“齐备”；`.asc/.att` 从不验签却宣称“cosign 验签通过”。
- `sast-deep` 的 codex-security 载体 rc=3/124/127 落入 rc=0 分支并打印“扫描通过”。
- `crypto`/`framework` 被 `_ENFORCE_OVERRIDE` 硬编码降为 advisory：函数内按 fail-closed 写的弱算法/框架 fail 级规律全部不阻断，且 gate-enforce-level.conf 与实际生效分层不一致。
- `shift-left` 无 spec/plan 时仍打印“测试设计+变更影响+可观测性均已在 spec/plan 阶段嵌入”。
- `contract`/`api`/`domain` 在“跳过”后仍打印“通过”，出现“跳过 1 + fail 1”的自相矛盾汇总。
- CORS 检测的第二段 `grep -viE '//|/\*|\*'` 把含 `*` 的行全部删掉——死分支。
- `DENGBAO_LEVEL=5` 只 warn 后 return；`cert-audit` 把未执行的检查硬编码为 pass。

**生成器命令注入与路径健壮性**
- `conf-render.sh` 渲染 `PROJECT_DIR=%s` 未加引号，项目路径含空格直接 127；monorepo 子目录名裸拼进 `(cd $_d && ...)`，子目录名含 `$(...)` 时在 precheck `eval` 阶段执行任意命令。`inventory-verify.sh`/`framework-evidence.sh` 同样把项目路径 `sed` 直插后 `eval`。
- 生成物垫片 `assets/install.sh`/`assets/generate-skill.sh` 用 `tr -d '[:space:]'` 读 `source_repo`，含空格路径被压扁；`state-machine.sh`/`spec-first-lib.sh` 的 conf 解析同样删除内部空格。
- `--inject-frameworks --remove` 不剥行尾注释，正常生成物的 `ACTIVE_FRAMEWORKS=("flask")  # AUTO:detected` 被改成含 `flask)`/`#`/`AUTO:detected` 的数组。
- skill 名未校验，`../../escaped` 可写出目标目录之外；`--upgrade` 备份目录名含 `:`，Windows 直接失败；部分填充的 snippets/mcp-tools 仍被整文件覆盖。
- `--mark-active` 对 inventory-verify 的 `|| true` 吞掉 verifier 崩溃；生成物 self-check 只查 `assets/memory-backends.sh`（生成物在 `scripts/`），恒报缺失；生成物无 facts/框架库时打印 `✓ 框架规则(0)==门禁片段(0)` 假通过。

**安装/宿主**
- `.gitattributes` 无 eol 规则：Git for Windows 默认 autocrlf 把 `*.sh` 转 CRLF。
- `install.sh --version` 取当前目录 git 版本；符号链接调用找不到 SKILL.md；非交互 stdin 静默 rc=1。
- 用户 hooks JSON 非法时被静默清空；Cursor 缺 `version:1`；Codex 用户级误报“渲染失败”；多技能共享 hooks 只有第一个生效；CRLF 配置块永不更新；备份无限堆积。
- 源树符号链接被原样复制并可写穿目标；WSL 回退把技能装进 WSL `$HOME`（仅静态验证）。

**发布/CI/测试**
- 离线安装器吞掉 `install.sh` 失败并打印“完成”；vendor 失败只警告；无 SHA256SUMS；源码包克隆默认分支 HEAD、无校验和、无重试、资产缺失不校验。
- CI 手写测试清单漏 16 个本地锁测试；行业 profile 手写清单漏 payment；generator-self-gate/self-check 的 `rc=$?` 在 bash -e 下是死代码；Windows 行为测试只在周跑且 `continue-on-error`；CI 的 cli-ab 在干净 checkout 上是自比自。
- `verifier/v1/run-verifier.sh` 自举函数用固定分支名 + `git checkout -`，并发/同名分支时可能把仓库留在临时分支；`test-spec-template-gating.sh` 直接写仓库 fixture，中断留残留。
- `run-sweep` 固定 `/tmp/sweep-*.log`，并发 worktree 互相覆盖。

**文档与口径**
- facts.conf 声称单一事实源，但 self-check 只对账 SKILL.md 的“N 个门禁”；用户面文档成片漂移：55 门禁、79/80 框架、13 运行时、核心 10、标准 28、10240B/8KB、500KiB、19 行基线、template-spec 分层 54 等。
- 生成流程 Step 10/13 的“激活 vs 全量门禁”顺序三方不一致；usage-manual 的核心门禁表漏 `--spec-first`。

**Hook**
- `GATE_ENFORCE_DENY` 白名单不参与判定：任意 precheck 非零（含 `--bogus`）都锁死编辑；PostToolUse 把 precheck 写的真实 FAIL_IDS 覆盖成白名单；`status: draft` 可自行关闭强制门。

## 三、根因

1. **fail-open 默认值**：`|| true`、`2>/dev/null`、空数组直接 pass、工具缺失 warn 后继续——安全门禁把“未执行”伪装成“通过”。
2. **多事实源**：facts.conf、gate-enforce-level.conf、脚本头注释、README/CLAUDE/usage-manual、生成物模板各写一份数字；self-check 只覆盖最窄的一处。
3. **工具通过即 return / advisory override**：semgrep/gitleaks 通过就跳过互补的内置扫描；security 类门禁被 override 降级，文档却仍按 fail-closed 描述。
4. **测试只断言正向退出码**：框架 compliant 侧 78/81 无负向断言，advisory 门禁 rc 恒 0；golden 只记退出码，误报/文案变化无法发现。
5. **项目输入当可信 shell 文本**：路径、子目录名、skill 名进入 conf 后经 `source`/`eval` 执行；生成器面向不可信仓库，这是本地代码执行链。
6. **发布链把“产物生成”当“产物可信”**：无校验和、无资产齐全性校验、无重试、无固定 commit。

## 四、修复与重构

### 门禁（Batch 1）

| 修复 | 锚点 | 回归锁 |
|---|---|---|
| 三件 gates 文件缺失/加载失败硬失败；注册表→函数定义逐项 `declare -F` 校验；`_gate_exec` 拒绝缺失实现 | `assets/precheck.sh` source 守卫 + `_gate_exec` | `test-r118-gate-hardening` 缺失门禁 rc=2 |
| const 密钥、`.env` 无引号密钥、云/JWT/私钥格式；测试路径按路径段排除；`SENSITIVE_EXCLUDE_GLOBS` 内置路径生效 | `assets/gates-strict.sh` secret loop；`assets/gates-warn.sh` sensitive | 32 项门禁锁含 const/.env/目录缺失 |
| `sensitive`/`security`/`authz`/`crypto` 空目录=skip、配置全不存在=fail；`privacy` 非法 ERE=fail；扫描面扩展 | 同名门禁函数 | 目录缺失/非法正则用例 |
| `release-sign` 无产物/空签名 fail；`.asc/.att` 不再冒充 cosign 验签 | `assets/gates-strict.sh` | 无产物/空签名用例 |
| `sast-deep` 异常退出码 fail；`shift-left` 无 spec 不宣称全部嵌入；contract/api/domain 部分完成措辞；CORS 死分支；DENGBAO 非法值；cert-audit pending | `assets/gates-*.sh` | 对应门禁用例 |
| spec-first/scope 合并已提交+暂存+未跟踪变更 | `assets/precheck.sh:_git_changed_files` | 未跟踪源码用例 |
| crypto/framework 移除 advisory override，按 gate-enforce-level.conf 执行；再生静态 20/20/16、有效 20/17/19 | `assets/precheck.sh` + `assets/gate-enforce-level.conf` | 81 框架双态 + 框架 fixtures |
| `--mermaid` 别名可达；多模式并集（`--all --shift-left`）；`--doctor`/`--cwe-audit` 读 conf；advisory 计数；修复建议变量名 | `assets/precheck.sh` | 别名/多模式/doctor 用例 |
| hook 白名单与真实 FAIL_IDS 交集；PostToolUse 不再覆盖 FAIL_IDS；`--bogus` 不置 flag | `assets/hooks/fail-gate-hook.sh` | `test-fail-gate-hook` 态10/30/31 |
| SBOM 空产物/空 lockfile fail、scoped 包许可证、许可证证据缺失如实披露、许可证豁免生效 | `assets/gates-strict.sh` | sbom 夹具 |

### 生成器/安装（Batch 2）

| 修复 | 锚点 | 回归锁 |
|---|---|---|
| `PROJECT_DIR`/`BUILD_CMD`/`TEST_CMD` shell 安全渲染；monorepo 子目录 `%q`；inventory/framework-evidence 路径 `%q` | `scripts/conf-render.sh`、`scripts/inventory-verify.sh`、`scripts/framework-evidence.sh` | 含空格路径 + `$(touch PWNED)` 子目录，无 marker |
| 垫片/state-machine/spec-first-lib 保留路径内部空格 | `assets/install.sh`、`assets/generate-skill.sh`、`assets/state-machine.sh`、`assets/spec-first-lib.sh` | generator 锁 + state-machine/spec-first 测试 |
| `--remove` 先剥注释；skill 名拒绝路径分隔符/空白/控制字符；备份名去冒号；部分填充模板按内容比较保留；mark-active verifier rc≥2 拒绝 | `scripts/generate-skill.sh` | generator 锁 11 项 |
| 生成物 self-check 双路径 memory-backends、facts/框架/本体不适用显式披露 | `scripts/self-check.sh` | 生成物 self-check rc=0 + “不适用” |
| 安装器 CRLF 检出、--version 源仓、符号链接自身解析、非交互报错、源树符号链接拒绝、hooks JSON fail-closed/合并、Cursor version、Codex 返回码、多技能键、CRLF 标记、备份保留 3 份、非法选择、--zcode | `install.sh`、`assets/tool-adapters/*`、`.gitattributes` | `test-r118-install-hardening` 35 项 |
| 默认只补装缺失、`--latest` 才升级；vendor-knowledge 不分发 | `scripts/self-check.sh`、`install.sh`、`scripts/make-offline-bundle.sh` | install/offline 测试 |

### 文档/CI/发布（Batch 3/4）

- 19 个用户面文档数字统一到 facts 真值（56/11/29/19/81/14/5/17/185/50/11264/577536/21/8）；新增 `tests/test-doc-numbers.sh`（124 项断言）把“文档→事实源”变成机器锁。
- facts.conf 头部/预算注释/内部脚本注释同步；删除不可复现的 74K 行日期锚与 ~25 文件表述。
- CI 改为 glob 跑全部 `tests/test-*.sh` + 记忆写回测试；行业 profile 用 conf glob 驱动（含 payment）；generator-self-gate/self-check 加 `set +e` 捕获日志；shellcheck 严格层补 install/offline/release。
- 离线包：安装器失败传播、vendor-status.tsv、缺件默认非零/`--allow-partial`、SHA256SUMS、安装前校验、原子发布、多宿主循环。
- 源码包：commit 钉定、git archive、SHA256SUMS、上传重试、资产齐全性校验、zip 前清旧档。
- verifier 自举唯一临时分支 + 原引用恢复；test-spec 临时副本；run-sweep 独立日志目录。

### 新增/更新的回归资产

- `tests/test-r118-gate-hardening.sh`：32 项断言。
- `tests/test-r118-generator-hardening.sh`：11 项断言。
- `tests/test-r118-install-hardening.sh`：35 项断言。
- `tests/test-r118-release-hardening.sh`：35 项断言。
- `tests/test-doc-numbers.sh`：124 项断言。
- crypto advisory 夹具改为 violating；spark `.limit(N).collect()` 豁免；框架/conf-render/offline/hook 测试同步。

## 五、全量回归

### 5.1 仓库全量面

- `run-sweep`：**71 通过 / 0 失败，EXIT=0**（锁测试 + 三条 e2e + verifier all + self-check）。
- 48 组 gate fixture：0 失败。
- 81 框架双态：0 失败（框架门禁转阻断后 violating 退出码由 0 变 1，golden-vector 重建为 `v=1 c=0`）。
- verifier all：golden 82 行一致、gate fixture 48/0、cli-ab 219 调用 0 差异、自举 RC=0、shellcheck 0 error。
- `self-check --check-only`：exit 0；`test-doc-numbers`：124/0。
- 新增回归锁：门禁 35、生成器 11、安装 35、离线/发布 35、文档数字 124。

### 5.2 真实项目面

- **nest-forge**（NestJS 10 + TypeORM + better-sqlite3 + JWT / Vue3 + Element Plus + Pinia）：active 技能升级到本轮生成器副本后，`--all` 调用 11/执行 11/fail 0；`--all-full` 调用 29/执行 27/跳过 2/fail 0。项目自身：后端 `nest build` exit 0、Jest 18/18、e2e 7/7；前端 `vue-tsc --noEmit && vite build` exit 0、Vitest 7/7。
- **task-forge**（Express 4 + React 19 + Vite 6，npm workspaces）：生成链 create → inject（4 框架）→ `--all` 调用 11/执行 9/跳过 2/fail 0；`--test` 实跑 API 8/8 + web 3/3；项目 `npm test` 与 `npm run build` exit 0（web 构建 224.88kB）。
- 真实项目回归额外发现并修复 7 项：敏感扫描把 `token: localStorage.getItem(...)` 误报为硬编码密钥；jest-vitest 覆盖率门禁只认 Vitest `thresholds`、不认 Jest `coverageThreshold`；vite 未配置 alias 被误判 fail；typeorm 把第二参参数对象里的模板值误报为 SQL 注入；嵌套样例技能残留 D1 修复前的 express 陈旧探测；spec 缺“影响范围/消费方”段；样例缺 Jest/Vitest 覆盖率阈值。前四项已修为生成器门禁并加回归锁；后三项为样例工程补齐（nest-forge backend coverageThreshold、frontend coverage.thresholds、spec §20.1、移除 express 陈旧激活）。
- 说明：order/note/go/mark/trade 五个历史样例已不在本机 `/tmp`，本轮未重跑；其技术栈由 81 框架双态 + 48 门禁夹具覆盖。CI 侧由 glob 全量本地锁 + 支付 profile + shellcheck 严格层覆盖。

## 六、遗留风险（如实披露）

以下项本轮未修复或只做了部分修复，均已在审计中有锚点：

1. `cli-ab` 在 CI 干净 checkout 上仍接近自比自（A=HEAD、B=worktree）；`golden-vector` 仍只记退出码，误报/文案变化覆盖弱。
2. `real-project-smoke` 仍克隆上游 HEAD 且部分 clone 失败被 `|| true` 吞；Windows 行为测试仍只在周跑/信息性（`.gitattributes` 已根治 CRLF，但无 PR 级 Windows 行为门）。
3. PIA/等保门禁仍以“文档存在 + 关键词”为主要证据，空文档可通过；`decisions.jsonl` 用 `cksum` 而非密码学哈希。
4. hook 在 malformed payload/缺库时仍 fail-open；`status: draft` 仍可由项目内文本自行关闭强制门。
5. `self-check` 的运行时检测仍以目录存在为主（空壳目录可误报已安装）；`--latest` 路径仍拉 `@latest`（默认已不升级，风险面收窄）。
6. `generate-skill`/`project-fingerprint` 对 `.claude` 目录的排除仍可能把位于 `.claude/` 下的项目文件数算成 0；`detect-spec-scale` 仍按行计侵入点。
7. `state-machine restore` 无 checkpoint 时仍静默 rc=1；安装器未提供 `--uninstall`。
8. 非 JS 生态的 SBOM 许可证提取仍不完整（Maven/Go/Python 无许可证证据时只 warn，不冒充通过）；`check_privacy` 的银行卡规则仍未做 Luhn 校验，误报面仍在。
9. `skill-supply-chain` 仍只扫两层/只扫 `.claude`；物化运行时只有数量/存在性校验，无逐文件哈希。
10. 离线包的 pip/npm 传递依赖未完整闭包（`--no-deps`），目标机仍可能需要网络；GitHub Actions 未按 commit SHA 固定。
11. 本轮的“完整自回归”以仓库定义的 `run-sweep` + 81 框架 + 48 门禁夹具 + task-forge/nest-forge 为准；order/note/go/mark/trade 五个历史样例已不在 `/tmp`，未在本轮重跑（其框架规则由 81 夹具覆盖）。框架门禁由 advisory 转阻断后，真实项目暴露的 4 项误报已修（localStorage/jest coverageThreshold/vite 无 alias/typeorm 参数对象），但其他启发式框架规则在更复杂项目上的误报面仍需后续回归轮持续收窄。

## 七、发布

- 版本：v2.84.0（R119 全面审计加固轮）。
- 资产：`swarm-yuan-offline-v2.84.0.zip` + `SHA256SUMS`；源码包沿用已存在的 `v20261017-src`（gstack/superpowers/ECC 三件，未变更上游）。
- 发布前门禁：`run-sweep` 全绿、`self-check --check-only` exit 0、文档数字锁 124/0、81 框架双态 0 失败。
