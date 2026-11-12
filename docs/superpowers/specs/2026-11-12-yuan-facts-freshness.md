# 2026-11-12 swarm-yuan 生成物事实层：项目数字现算根治（复盘 P2-12a/12b 最小切口）

> 面向读者：swarm-yuan 生成器维护者与 aistudio-dev 等目标技能的使用会话。读完应能判断：为什么生成物里的项目数字必然漂移、事实层如何让数字回到「现算」、以及升级旧实例时数字为何保持可读。

## 变更

背景（审计实锤，2026-11-12 复盘 P2-12a/12b）：生成器产出的目标技能由 AI 在 Step 7 把项目数字（spec 数/补丁数/测试数/vendor 版本）写死进 SKILL.md「项目认知摘要」；SKILL.md 属 `PROJECT_SPECIFIC_FILES`，`--upgrade` 永不重生成——实测已漂移（aistudio-dev 写 334 spec/6270 测试，现实 650/8726，vendor 版本落后一整代）。感知链（指纹→更新）从未真正接线。根治方向：数字不落在永不重生成的文件里，改落在可随时机械重算的事实层文件里，SKILL.md 只留指针。

1. **新增事实层脚本 `skills/swarm-yuan/assets/project-facts.sh`**（纯 bash、bash 3.2 安全、无关联数组；参数 `<技能目录> <项目根>`）：按机械计数规则现算四维项目数字——specs（`docs/superpowers/specs/*.md` 计数）、patches（`patches/series` 有效行=非注释非空）、tests（有 `.qgate/junit-report.xml` 读根元素 `tests/failures/errors` 属性，否则「未采集」）、vendor 基线（`vendor/VENDOR.md` 表行 tree=版本列首个语义化版本 token）——写入 `<技能目录>/references/project-facts.md`，首行 `as_of: <日期> @ <git HEAD>`（非 git 项目 `unknown`）。任一维度源缺席输出「未采集」（fail-soft 不猜数）；原子替换（同目录候选+mv）；目标路径为符号链接时拒绝写入。口径选择对齐本仓形态；其他项目形态下四维全部「未采集」也不失败。
2. **SKILL.md 模板认知摘要表（generate-skill.sh `_fg_emit_skill_md`）新增「项目数字」行**：值为指针——指向 `references/project-facts.md`（路径取 `FACT_PROJECT_FACTS_FILE` 单一事实源），明示「勿写死进本表，由 scripts/project-facts.sh 机械现算」。旧实例已写死的数字仍可读（PROJECT_SPECIFIC_FILES 保留语义不变），新实例不再写死。
3. **生成流程接线**：create/resume 尾段（`_write_skill_manifest` 前）自动首跑一次事实层（失败仅告警不阻断）；`--upgrade` 发布尾段提示「事实层可刷新：bash scripts/project-facts.sh …」——upgrade 不自动刷（dry-run 零写入承诺 + 刷新属用户裁决面），随本次升级 `scripts/project-facts.sh` 经 UNIVERSAL_FILES 落进目标技能。
4. **分发面登记**：`assets/registry/dist.tsv` 增行 `scripts/project-facts.sh`（lite 档，源=assets）→ 重渲 generate-skill.sh 的 dist-manifest 块与 `assets/facts.generated.conf`（FACT_UNIVERSAL_FILES 109→110）；`scripts/registry-render.sh` 行数门补 110。
5. **口径立法**：`assets/facts.conf` 新增 `FACT_PROJECT_FACTS_FILE=references/project-facts.md`（消费者=generate-skill.sh 模板行，满足 self-check 2c-补 FACT 键消费闭环）；`scripts/self-check.sh` check_doc_consistency 补两断言——生成器模板认知摘要须引用 FACT_PROJECT_FACTS_FILE 指针（防模板重构退回写死）、已存在的 project-facts.md 首行必须带 as_of 戳（机器可判新旧）。
6. **预算登记**：认知摘要 +1 行与按需读取索引 +1 行（新随发脚本）推高生成物 SKILL.md 字节，`FACT_SKILLMD_BYTES_BUDGET` 按第九次登记惯例上调（gen-e2e 实测锚，见验证段）。
7. **测试与文档**：新增 `skills/swarm-yuan/tests/test-project-facts.sh`（假项目正向计数/全维缺席 fail-soft/非 git unknown/符号链接拒绝/重跑刷新）并登记 tests/index.tsv；`references/generation-flow.md` Step 6 补一句事实层首刷说明。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 事实层独立文件（references/project-facts.md）而非 SKILL.md 内嵌刷新 | SKILL.md 属 PROJECT_SPECIFIC_FILES 永不重生成，任何落在其中的数字都复现 P2-12a 漂移；独立文件可被脚本原子重算，且不入 PROJECT_SPECIFIC_FILES（upgrade 保留旧文件不丢数据、create 后可反复刷新） |
| D2 | 四维口径对齐本仓形态，缺席输出「未采集」而非零 | fail-soft 不造假是仓不变量（源缺席返回 null 不猜数）；「未采集」显式暴露口径不适配，比假 0 诚实 |
| D3 | 测试数读 `.qgate/junit-report.xml` 而非现场跑测试 | 现场跑全量测试分钟级且可能红，事实层须秒级可刷新；junit 是 qgate 既有产物（root `tests/failures/errors` 属性），其时点滞后由 as_of 行显式化 |
| D4 | --upgrade 只提示不自动刷新 | dry-run 升级承诺项目零写入；且 upgrade 后立即重算可能落在「模板已换、项目半迁移」的斜切窗口——刷新时机留给用户/属主会话 |
| D5 | 脚本放 assets/（dist.tsv cat=assets）而非 scripts/（cat=gen） | 任务指令锚定 assets/project-facts.sh；与 precheck.sh/state-machine.sh 同族（模板资产），生成器侧 `$ASSETS_DIR` 直调路径最短 |
| D6 | vendor 版本取「版本列首个语义化版本 token」机械规则 | VENDOR.md 版本单元格含 tag 命名说明等长注释，首个 `v?N.N(.N)+` token 即基线版本（hermes-studio=v0.8.20 / zcode=3.18.0 实测命中）；规则机械可测，不做语义解析 |
| D7 | 不动已安装实例（~/.agents/skills/）与本仓 .claude/skills/ 生成物 | 部署面与真机重生成属主会话；本批只改仓内生成器与模板（任务边界） |

## 验证

- [x] `bash -n` 全部改动脚本（project-facts.sh / generate-skill.sh / registry-render.sh / self-check.sh / 两个测试）零语法错；并经 `/bin/bash`（3.2.57）实跑 project-facts.sh 与 test-project-facts.sh 全绿（三平台铁律 bash 3.2 安全实证；实现期已抓一处 `$var（` 多字节相邻 set -u 崩溃与一处 G20 违例，均改 `${var}` 形式）。
- [x] /tmp 假项目（git 仓 + specs×2 + series 3 有效行含注释空行 + junit tests="42" failures=0 errors=0 + VENDOR.md 三表行）跑 `bash skills/swarm-yuan/assets/project-facts.sh`：首行 `as_of: 2026-11-12 @ <HEAD 短哈希>`、四维计数 2/3/42/三树版本 token 与构造值精确一致（hermes-studio=v0.8.20；hermes-agent=v0.23.1；zcode=3.18.0——长注释单元格取首个语义化版本 token 命中）。真仓对照：worktree 现算 specs=651/patches=461/vendor 三树（vs aistudio-dev 写死的 334/6270/旧版本——漂移面即根治对象）；worktree 无 .qgate/junit-report.xml（运行态不入库）→ tests=未采集（fail-soft 正确）。
- [x] 空项目（仅 package.json）四维全「未采集」且 exit 0；非 git 目录 HEAD=unknown；目标为符号链接时拒绝写入 exit 1 且链接目标 sentinel 未被改写（测试态 3/5/6）。
- [x] `bash skills/swarm-yuan/tests/test-project-facts.sh` PASS（17 断言：四维计数/重跑刷新/全维缺席/无 token 树/符号链接/参数错）；`bash skills/swarm-yuan/tests/run.sh --filter test-project-facts` 同（runner 登记 index.tsv）。
- [x] `bash skills/swarm-yuan/scripts/registry-render.sh --check` 全绿（dist 110 行门/UNIVERSAL_FILES 生成块/gates/enforce/facts.generated 一致）。
- [x] `bash skills/swarm-yuan/scripts/self-check.sh` 全绿（rc=0，90 项 ✓ 零 ✗；含 3d 新断言「生成器模板认知摘要引用 FACT_PROJECT_FACTS_FILE 指针」与 FACT 键消费闭环；5b as_of 戳断言在生成器仓无该文件时按设计跳过，目标技能侧由 test-project-facts 覆盖）。
- [x] gen-e2e（tests/e2e/run-gen-e2e.sh）GEN_E2E_RC 0：产物 SKILL.md 11707B ≤ 预算 11776B（第九次登记 11520→11776）≤ 硬顶 20000B；认知摘要含「项目数字」指针行；产物 references/project-facts.md 落盘（首刷在 _write_skill_manifest 前，files.count 计入）；scripts/project-facts.sh 随发且可执行；--upgrade 打印「事实层可刷新」提示且不覆写既有事实层文件。
- [x] 受影响 shell 测试簇 8/8：doc-numbers / inspection-ledger（FACT_UNIVERSAL_FILES=110 同步）/ skill-manifest / upgrade-hygiene / generator-reliability / source-layout / r141-compendium-fullcheck（--regen 后逐字节一致）/ execution-surface-budget。
- [x] `node scripts/maintenance/gen-doc-indexes.mjs --write` 登记本 spec（655 specs 全链）后 `--check` 0 problem。
- [x] 根仓 `npm test` 全量（worktree yuan-v3 内，lsof 核验 vitest cwd 在树）：**8843 passed / 0 failed / 11 skipped**（1152 文件通过 | 6 跳过，137s，exit 0；另 1 条 vitest-worker RPC 超时 error 为负载型非测试失败，2026-11-10 vendor spec 验证段同款先例）。

## 设计文档影响

DESIGN_SYNC: none —— 触及面为 skills/swarm-yuan 技能自身能力（生成器模板/分发清单/口径注册表/自测），不改 AIStudio 产品面（custom/registries/config）、不触整合正本与数字总账（仓 AGENTS.md 目录导航所指 docs 设计文档均无项目数字口径消费本变更）；事实层消费者是目标技能生成物，不回流本仓设计文档。
