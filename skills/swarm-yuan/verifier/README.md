> **迁移说明（2026-10-26）**：verifier 已随技能并入 `skills/swarm-yuan/verifier/`。v1/v2 为生成器侧资产，不进入安装产物；历史运行日志（`runs/`）保留在旧仓归档，未随迁。下列历史记录中的 `swarm-yuan/tests/...` 路径现对应技能根下 `tests/...`。

# Verifier 索引 — Swarm-yuan 重构验收

本文件为只增不改的索引，每个版本一条记录。

## v1（2026-07-19 创建）
- **测量什么**：fixture 行为等价（79 框架门禁，violating/compliant 双端退出码）、e2e 通过、shellcheck error/warning 计数、重复度与行数指标（precheck 双副本 diff、LOC、.DS_Store）。
- **入口**：`bash verifier/v1/run-verifier.sh all`（支持 fixtures/e2e/shellcheck/metrics 子模式）。
- **标准**：见 `v1/acceptance-criteria.md`（C1 行为等价 / C2 e2e / C3 重复消除 / C4 shellcheck 不恶化 / C5 CLI 兼容 / C6 可维护性量化提升 / C7 报告交付）。
- **运行记录**：`runs/` 目录，每次运行一条带时间戳的记录（命令 + 退出码 + 输出摘要）。

## 最终验收记录（2026-07-19，refactor/optimization 分支 HEAD=032bfa9）
- C1 行为等价 ✅：57/57 fixture，退出码向量与 v1/golden-vector.txt 逐行一致（runs/2026-07-19T1808-final-fixtures.log）；57 个门禁片段另经 v1/gate-ab-diff.sh 字节级 stdout 等价逐个 PASS
- C2 e2e ✅：RC 0（runs/2026-07-19T1805-final-metrics.log）
- C3 重复消除 ✅：precheck 双副本 diff 469→22（仅剩声明的路径定制），同步机制 SKILLS_PATH_REWRITE 建立
- C4 shellcheck ✅：error(-s bash)=0；warning 15→13（存量均为保行为有意保留项）
- C5 CLI 兼容 ✅：precheck.sh A/B 沙箱 131 次调用 stdout+退出码逐字节一致（唯一例外为授权的 check_test 空值守卫修复）
- C6 可维护性 ✅：framework-gates 15369→13168 行（-14.3%）；precheck.sh 提取 6 helper+8 家族公共剥离库；397 处报告尾收编 _fw_report；27 个嵌套重复函数删除
- 基线演进：R0 前 fixtures 57/57 BAD（conf 硬编码 /Volumes 路径，violating 为假阳性）→ R0 后 57/57 OK

## 终验记录（2026-07-20，standards-refactor 标准合规增强重构，工作区未提交）
- C1 行为等价 ✅：57/57 fixture，退出码向量与 v1/golden-vector.txt diff 为空（runs/2026-07-20T1606-standards-refactor-fixtures.log）；spring-boot POSIX 字符类修复未改变其向量（v=1 c=0），golden 无需更新
- C2 e2e ✅：`swarm-yuan/tests/e2e/run-e2e.sh` RC=0（四框架注入 + 4 fail id 断言全过）
- C3 重复消除 ✅：本轮未触及双副本机制，既有 SKILLS_PATH_REWRITE 同步机制维持
- C4 shellcheck ⚠️ 无法判定：本机无 shellcheck（PATH//tmp//mnt/agents/tools 均无），run-verifier.sh shellcheck 按 fail-closed 设计报 SHELLCHECK_UNAVAILABLE 退出 1（runs/2026-07-20T1606-standards-refactor-shellcheck.log），非代码回归；全部 13 个 shell 脚本 `bash -n` 语法通过
- C8 合规门禁 fixture ✅：6/6 组双态 + id 级断言全过（runs/2026-07-20T1606-standards-refactor-gate-fixtures.log，GATE_FIXTURES_FAILS 0）
- 真值核对 ✅：check_* 函数 31 = GATE_FLAGS 31；precheck.conf 变量 162；UNIVERSAL_FILES 24；references/*.md（不含 frameworks/）14
- 最小 conf A/B ✅：`--all` 核心 10 序列（调用 10/执行 9/跳过 1 check_reuse）不含 4 新门禁；`--all-full` 执行汇总行「调用 31，执行 21，跳过 10」且 check_compliance/check_docs_pack/check_sbom/check_privacy 均计入跳过
- self-check 修复 ✅：check_doc_consistency 的 conf 变量提取 grep -E 模式 `\|`→`|`（`\|` 在 ERE 下按字面管道解析永不命中，致「SKILL.md 声明 precheck.conf 变量漂移」活跃误报；paradigm-decisions.md 记录的 `\|` 字面 bug 家族又一例）。修复后未篡改态「✓ conf 变量数一致(162)」，篡改 162→163 复现 ⚠ 漂移告警，恢复后转绿
- 既有行为留档：`--check-only` 在工具缺失时于 doc_consistency 之前早期 exit（HEAD 既有，非本轮引入）；本环境 superpowers 未装（既有环境 miss，唯一 ✗），故 doc_consistency 段经等代码路径 harness（仅中和早期 exit）验证全绿：57 框架规则/31 门禁/conf 162/refs 14/四文档头部数字/framework-signal-index 全部一致；上游基线 drifted（comet/graphify/ruflo）为 warn-only 忠告不置 FAIL

## 回归记录格式预留（P1-6 断言化后适用，由后续回归代理填写，只增不改）
- 判定入口：`bash verifier/v1/run-verifier.sh all`（子模式 `cli-ab` / `metrics` 可单独复跑；C5/C6 判据见 v1/acceptance-criteria.md，阈值真值 v1/metrics-baseline.txt、序列基线 v1/core10-sequence.txt）。
- 记录格式（每次运行一条，追加于本文件末尾新节，不改动既有节）：
  - `<ts> all RC=<n> ｜ cli-ab CALLS=<n> DIFFS=<n> RC_INVALID=<n> ｜ metrics LOC=<n>/<baseline> DUP_DIFF=<n> DOC_VIOLATIONS=<n> ｜ 日志 runs/<ts>-*.log`
- 填写要求：
  - 异常行须附对照证据（A/B diff 前 20 行，或阈值实测值 vs 基线值的命令+输出）。
  - 基线变更（v1/metrics-baseline.txt、v1/core10-sequence.txt）须单行说明理由并链 commit，不得静默改值。
  - 环境性 SKIP（无 git / 语料缺失 / shellcheck 不可用）须如实登记 SKIP 行，不得记为通过。

## 回归记录（2026-07-20，p1p2-regression，P1/P2 第二批标准合规增强终态，feat/standards-compliance 工作区未提交，HEAD=c27c8bc）
- 2026-07-20T2041 fixtures RC=0 ｜ FIXTURES_TOTAL 61 FAILS 0 ｜ 日志 runs/2026-07-20T2041-p1p2-regression-fixtures.log
- 2026-07-20T2041 gate-fixtures RC=0 ｜ GATE_FIXTURES_TOTAL 6 FAILS 0（全量 34 组经 run-gate-fixture.sh 无参数遍历另证全绿）｜ 日志 runs/2026-07-20T2041-p1p2-regression-gate-fixtures.log
- 2026-07-20T2041 metrics RC=0 ｜ LOC=3603/2982（+20.8% <40%）DUP_DIFF=0 DOC_VIOLATIONS=0 METRICS_ASSERT_FAILS=0 ｜ 环境登记：Swarm-studio 兄弟仓库不在本机，LOC_PRECHECK_STUDIO/DUP_DIFF_LINES 测量行留空（断言不依赖该路径）｜ 日志 runs/2026-07-20T2041-p1p2-regression-metrics.log
- 2026-07-20T2041 cli-ab RC=1（预期内，如实登记非通过）｜ CALLS=147 DIFFS=9 RC_INVALID=0 ｜ 9 处 DIFF 逐条核对全部合法：--authz/--requirements/--crypto 各×2 语料（A=HEAD 无此 flag 报未知 rc=1，B 正常执行）、--all-full comp/viol×2（仅新增 3 合规门禁段头 + 汇总行 调用31→34/跳过10→13，fail/warn 计数逐值不变）、--bogus-flag×1（Usage 行追加 3 新 flag）；既有 31 flag 全部逐字节一致，core10 序列 OK；主会话提交后 HEAD==工作区自动复绿 ｜ 日志 runs/2026-07-20T2041-p1p2-regression-cli-ab.log
- 基线变更：v1/golden-vector.txt 57→61 框架向量（理由：P1/P2 新增 dameng/kratos/langchain/terraform 4 框架门禁；diff 摘要：57 条旧记录纯 a-hunk 追加逐值不变 + 4 条新记录字典序插入 + TOTAL 57→61）｜ 日志 runs/2026-07-20T2041-p1p2-regression-golden-vector-rebuild.log
- C1 ✅：61/61 fixture 双态退出码 (v=1 c=0)，新 golden diff 为空（61 框架全量经 run-framework-fixture.sh 循环另证 61/61）
- C2 ✅：`swarm-yuan/tests/e2e/run-e2e.sh` RC=0（四框架注入 + 4 fail id 断言）
- C3 ✅：本轮未触及双副本机制；metrics DUP_DIFF_LINES 因兄弟仓库缺失记环境 SKIP（非 0 计数，非通过判定）
- C4 ⚠️ 无法判定：本机无 shellcheck，fail-closed 报 SHELLCHECK_UNAVAILABLE；bash -n 77 个脚本（precheck+scripts+tests+e2e+verifier+61 gates）语法 FAILS=0
- C5 ⚠️ 预期内挂起：cli-ab RC=1，9 处 DIFF 全部合法（见上），提交后复绿
- C6 ✅：metrics 断言 3/3 OK（LOC +20.8%<40% / 注入双副本 diff=0<30 / 文档一致性 0 违规，段含 34 门禁/171 变量/61 框架/四文档头部数字全 ✓）
- C7 ✅：报告交付物既有，本轮不重复产出
- C8 ✅：gate-fixtures 6/6 OK + 全量 34 组遍历全绿（run-gate-fixture.sh 无参数「共 34 组，失败组 0」）
- 真值核对 ✅：check_*=34、GATE_FLAGS=34、conf 变量=171、references/*.md（不含 frameworks/）=16、framework-gates/*.sh=61、references/frameworks/*.md=62（含模板）、gate-fixtures=34 组
- self-check ✅：RC=1 唯一 ✗ 为 superpowers 环境 miss（既有允许项）；文档一致性段 0 违规无新增 ERROR；注：--check-only 在工具缺失时早期 exit 为 HEAD 既有行为
- 本轮修复项：无（未发现回归，未改动任何源码；仅覆盖更新 golden-vector.txt 并新增 runs 归档）

## 回归记录（2026-07-20，p3-regression，P3 长期清单批次终态，feat/p3-longterm 工作区未提交，HEAD=94d43e3）
- 2026-07-20T2227 fixtures RC=0 ｜ FIXTURES_TOTAL 61 FAILS 0 ｜ 日志 runs/2026-07-20T2227-p3-regression-fixtures.log
- 2026-07-20T2227 gate-fixtures RC=0 ｜ GATE_FIXTURES_TOTAL 6 FAILS 0（全量 36 组经 run-gate-fixture.sh 无参数遍历另证全绿「共 36 组，失败组 0」，rtm/release-sign 经 GATE_FLAGS 动态解析自动命中，运行器无补映射）｜ 日志 runs/2026-07-20T2227-p3-regression-gate-fixtures.log
- 2026-07-20T2227 metrics RC=0 ｜ LOC=3755/2982（+25.9% <40%）DUP_DIFF=0 DOC_VIOLATIONS=0 METRICS_ASSERT_FAILS=0 ｜ 环境登记：Swarm-studio 兄弟仓库不在本机，LOC_PRECHECK_STUDIO/DUP_DIFF_LINES 测量行留空（断言不依赖该路径，同 p1p2 登记先例）｜ 日志 runs/2026-07-20T2227-p3-regression-metrics.log
- 2026-07-20T2227 cli-ab RC=1（预期内，如实登记非通过）｜ CALLS=155 DIFFS=7 RC_INVALID=0 ｜ 7 处 DIFF 逐条核对全部合法：--rtm/--release-sign 各×2 语料（A=HEAD 无此 flag 报未知 rc=1，B 正常执行 skip-if-unconfigured rc=0）、--all-full comp/viol×2（仅新增 2 门禁段头 + 汇总行 调用34→36/跳过13→15，fail 0/2 与 warn 23/21 逐值不变）、--bogus-flag×1（Usage 行追加 --rtm|--release-sign）；既有 34 flag 全部逐字节一致，core10 序列 OK；主会话提交后 HEAD==工作区自动复绿 ｜ 日志 runs/2026-07-20T2227-p3-regression-cli-ab.log
- golden-vector diff 为空：fixtures 日志与 v1/golden-vector.txt 逐行一致（61 框架退出码向量 (v=1 c=0)，框架数未变，golden 无需更新）
- C1 ✅：61/61 fixture 双态退出码 (v=1 c=0) + 全量 run-framework-fixture.sh 循环 61/61（双态+expected-fail-ids id 断言）PASS=61 FAIL=0
- C2 ✅：`swarm-yuan/tests/e2e/run-e2e.sh` RC=0（四框架注入 + 4 fail id 断言）
- C3 ✅：本轮未触及双副本机制；metrics DUP_DIFF_LINES 因兄弟仓库缺失记环境 SKIP（非 0 计数，非通过判定）
- C4 ⚠️ 无法判定：本机无 shellcheck（PATH//tmp 均无），fail-closed 报 SHELLCHECK_UNAVAILABLE，非代码回归；bash -n 89 个脚本/conf（precheck+scripts+tests+e2e+verifier+61 gates+tool-adapters+industry-profiles conf）FAILS=0
- C5 ⚠️ 预期内挂起：cli-ab RC=1，7 处 DIFF 全部合法（见上），提交后复绿
- C6 ✅：metrics 断言 3/3 OK（LOC +25.9%<40% / 注入双副本 diff=0<30 / 文档一致性 0 违规，段含 36 门禁/179 变量/61 框架/四文档头部数字全 ✓）
- C7 ✅：报告交付物既有，本轮不重复产出
- C8 ✅：gate-fixtures 6/6 OK + 全量 36 组遍历全绿（含新组 rtm 3 fixture / release-sign 5 fixture 双态+id 断言全过）
- 真值核对 ✅：check_*=36、GATE_FLAGS=36、ALL_GATES_CORE=10/ALL_GATES_COMPLIANCE=9/ALL_GATES_FULL=36（架构=36−10−9=17）、conf 变量=179、references/*.md（不含 frameworks/）=18、framework-gates/*.sh=61、references/frameworks/*.md=62（含模板）、gate-fixtures=36 组
- self-check ✅：--check-only RC=1 唯一 ✗ 为 superpowers 环境 miss（既有允许项）；文档一致性段经等代码路径 harness（仅中和 --check-only 早期 exit，HEAD 既有行为）验证全绿：61 框架规则/36 门禁/conf 179/refs 18/四文档头部数字/framework-signal-index 全部一致；上游基线 drifted（comet/graphify/ruflo）为 warn-only 忠告不置 FAIL
- 行业 profile 冒烟 ✅：finance.conf / medical.conf 各自追加到最小 conf 后 --doctor 均 fail=0（finance pass 4/warn 3；medical pass 3/warn 4，warn 均为未配置目录类披露）
- 渲染器冒烟 ✅：临时目录 create 骨架 RC=0 → --render-tools 首轮生成 6 工具原生规则文件（Cursor/Windsurf/Gemini/Codex/OpenCode/Kimi，Claude 维持现状）→ 二次渲染全 no-op，产物 sha256 逐文件一致（幂等）
- 本轮修复项：1 处口径 bug——P3 子代理将 check_rtm/check_release_sign 注册进 ALL_GATES_FULL 与 GATE_FLAGS 但漏挂 ALL_GATES_COMPLIANCE（7≠9），致 self-check 真值算术 架构=36−10−7=19≠17 与文档「合规 9」口径冲突；最小修复=数组补两函数（根因：五代理并行各自只改 FULL/FLAGS，合规族数组无 owner；证据：修复后 COMPLIANCE=9、四文档头部数字一致性 ✓、36 组 fixture 仍全绿）

## 回归记录（2026-07-22，wp-s1-security-gates，WP-S1 标准深化批次终态收口，feat/wp-s-standards-deepening 工作区，HEAD=c1d497b）
- 2026-07-23T0031 all RC=0 ｜ cli-ab CALLS=171 DIFFS=0 RC_INVALID=0 ｜ metrics LOC=1307/2982（WP-Q1.3 拆分后主文件行数低于基线，增长判定 OK）DUP_DIFF=0 DOC_VIOLATIONS=0 METRICS_ASSERT_FAILS=0 ｜ fixtures 62/62 FAILS 0 ｜ gate-fixtures 40/40 FAILS 0（36→40：WP-S1 +dengbao/pia/sast-deep/oss-eval 4 组）｜ e2e RC=0 ｜ 日志 runs/2026-07-23T0031-wp-s1-final-all.log（gate-fixtures/e2e/self-check/industry-profile-gov 同 ts 各一份）
- 基线变更：无。门禁数 36→40 不触及既有三项 metrics 断言口径（LOC 增长 / 注入双副本 diff / 文档一致性段），metrics-baseline.txt 未改；golden-vector diff 为空（62 框架向量 (v=1 c=0)，框架数未变）
- C1 ✅：62/62 fixture 双态退出码与 golden 逐行一致
- C2 ✅：`swarm-yuan/tests/e2e/run-e2e.sh` RC=0
- C3 ✅：本轮未触及双副本机制；LOC_PRECHECK_STUDIO/DUP_DIFF_LINES 因兄弟仓库缺失记 ABSENT（环境 SKIP，非通过判定）
- C4 ✅ 不恶化：本机 shellcheck 0.11.0 本轮新入 PATH（此前记录均为 SHELLCHECK_UNAVAILABLE）——SHELLCHECK_ERRORS 2（precheck.sh:573/575 SC1087，bc9cdff P1 批存量代码，0.11.0 对 `$vn[$i]` 解析更严）/ WARNINGS_CORE 21；`git show HEAD:` 复测 precheck.sh error=2、self-check.sh error=0 与 warning 计数逐项一致，本轮改动 0 新增
- C5 ✅：cli-ab 171 调用 0 diff（含 4 新门禁 flag 的 A/B 沙箱逐字节一致），core10 序列 OK
- C6 ✅：metrics 断言 3/3 OK
- C8 ✅：gate-fixtures 40/40 组全绿（run-gate-fixture.sh 无参数「共 40 组，失败组 0」）
- 行业 profile ✅：`tests/run-industry-profile.sh gov` RC=0（覆盖断言通过）
- 真值核对 ✅：check_*=40、GATE_FLAGS=40（1:1）、ALL_GATES_CORE=10/COMPLIANCE=13/FULL=40（架构=40−10−13=17）、conf 变量=151（core 12 + arch 100 + compliance 39）、references/*.md（不含 frameworks/）=19、enforce strict 14/warn 20/advisory 6（WP-S1 时态；WP-S2 终审后 strict 17/warn 21/advisory 10，门禁 48/变量 158）、framework-gates/*.sh=62、gate-fixtures=40 组
- self-check ✅：--check-only RC=0 全绿（11 运行时全装；文档一致性段 0 违规：40 门禁/151 变量/62 框架/五文档头部数字/enforce 分层一致；上游基线 drifted comet/graphify/ruflo 为 warn-only 忠告不置 FAIL）
- 本轮修复项（2 处 verifier/自检链路缺陷，非门禁语义变更）：
  1. self-check.sh：MISSING==0（运行时全装）时早期 exit，文档一致性/框架规则集核验/enforce 分层段永不执行——2026-07-21 修复的「--check-only 死代码」同类缺陷另一分支；修复后本地检查段无条件执行。注：此前记录「--check-only 早期 exit 为 HEAD 既有行为」自本轮起不再成立
  2. metrics-assert.sh ③：self-check 改 `--check-only`——裸跑默认 FORCE_LATEST=1，全装也联网升级全部运行时（npm i -g/npx/源码包重装/gstack setup 拉 playwright chromium ~160MB），断言目标（文档一致性段）与升级无关却使 verifier 非密封且篡改全局环境；本轮首跑即在 chromium 下载段（~40KB/s）挂 1.5h 被终止（如实登记：首跑未完成非代码失败）。--check-only（FORCE_LATEST=0）跳过升级段，文档一致性段经修复 1 后照常执行

## 回归记录（2026-10-09，r101-spec-first-universal 轮）
- 基线变更：v1/core10-sequence.txt 10→11 段头（理由：R101 check_spec_first 入 ALL_GATES_CORE——无 hook 宿主 spec-first 强拦截在门禁面的唯一承载，门禁预算决策 26.2 例外修订 55→56 同轮留痕；diff 摘要：纯插入 `=== spec-first 流程门（L3 门禁时强拦，R101）===` 一行于「改动范围检查」后，既有 10 行逐字节不变）｜ 详见 CHANGELOG v2.64.0 与 docs/research/R101-spec-first-universal.md
