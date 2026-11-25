# 2026-11-26 全面复盘·设计修订·实施批（回归前改进批）

> 状态：实施完成（2026-11-26；四批全部合入 main，全量回归与发版结果待回填本文件验证节）。基线 aac12a62d；批 B/C/D 各自 worktree 并行实施后逐个 --no-ff 合入。用户指令：提交合入清分支之后，「全面复盘并改进 AIStudio，修订整体设计，并实施完成，最后完成全功能及非功能、安全的回归测试并修复暴露问题，发版 GitHub 与 modelscope」。本 spec 承载复盘结论、设计修订与实施项；全量回归与发版另有收口记录回填本文件验证节。

写给谁看：本仓 AI 会话与后续接手者；判定「这轮改进做了什么、为什么、怎么验收」。

## 一、复盘结论（四路只读调研，2026-11-26 实测）

决定性发现三条：

1. **验证闭环缺口**：回归矩阵 21 面无任何浏览器/走查面——判定裁判（`scripts/regression/walkthrough-probes.mjs`）有单测、走查本身靠人跑；`test:ide-smoke` 有 npm script 未登记矩阵；`capability-matrix`（release:preflight 链成员）同样未登记。三条真实端到端补验在挂账（Ekko UI 批二 `2026-11-25-ekko-ui-v2-batch2.md:122`、数字员工批一 `2026-11-24-digital-employee-batch1-lifecycle-loop.md:256`、outcome 走查 `2026-11-20-ai-native-outcome-batch1.md:62`）。
2. **lint 视野外的账本漂移**：四个棘轮类（gates/scripts/ledgers/npmScripts）零漂移、矩阵 path 零失效——「有 lint 在查的面」纪律成立；漂移集中在 lint 盲区：`config/mechanism-budget.json` patches 上限 562 对在册 504（虚高 58，且总则/`docs/DESIGN.md:1292` 豁免/lint 实现三口径不一）；预算册 2026-11-25 条目仍记 014=entry-http（实已让号 015）；`docs/DESIGN.md:1708` hermes-agent 停在 v0.23.3（实际 v0.23.4）；2026-06-21 overlay 正本头部无时点声明（40 patch/74 custom/6 registry、studio v0.6.18 全为历史值）；53 枚补丁在盘不在册（patches/ 52＋zcode-patches/ 1）。
3. **安全清单不自足**：`config/accepted-vulnerabilities.json` 14 条全是裸 ID/GHSA 字符串，逐条包名、理由、退役条件只能反查 N35 台账；无 CSRF 专项回归；`dependency-audit` 面 `ci:null`。密钥卫生抽查 6 文件全合格（JWT env 化、审计白名单脱敏、token 只走握手）——卫生面无缺陷，缺口全在「清单可维护性」与「回归覆盖」。

其余发现（支撑证据从简）：挂账 open 约 21 条/组＋7 个已立项未开工批次＋4 条未裁决决策（清单见 `2026-11-18-run32-pending-batch.md` 等 6 份台账与盘点输出，不在本批清偿，防范围失控）；8 个 spec 状态行滞后于实际合并态；根 `tests/` 4 个 pytest 文件为 git 未跟踪本地残留（runtime/tests 侧为受跟踪真身且演进更新）；`custom/client/shared/` 36 源文件零覆盖（登记挂账不在本批补齐）；enforce-gate 默认 fail-open 属设计内（strict opt-in），回归判读需区分非缺陷。

## 二、变更

按文件归属切四批并行实施（worktree 各一，文件面不相交）：

| 批 | worktree/分支 | 内容 | 主要文件面 |
|---|---|---|---|
| A 账本与正本勘正 | `docs/ledger-canon-revision` | ①DESIGN.md:1708 v0.23.3→v0.23.4；②预算册 2026-11-25 条目补让号勘误＋在册数订正＋patches 上限 562→504；③`docs/DESIGN.md:1292` 豁免条款改「换血批同批调整上限」；④8 个 spec 状态行回填实际合并态；⑤2026-06-21 overlay 正本头部加「2026-06-21 时点快照」声明＋现行载体指针（VENDOR.md/series）；⑥RELEASE-MANIFEST yuan-skill notes 的 `.bundle-version` 注记核实后修正 | docs/**、config/mechanism-budget.json |
| B 矩阵卫生＋走查自动化 | `feat/regression-walkthrough-face` | ①删根 `tests/` 本地残留（存档至仓外）；②`ide-smoke` 登记矩阵新面 `ide-smoke-walkthrough`（scope=full，包装脚本自起 dev server→wait ready→探针→teardown）；③`capability-matrix` 登记面（scope=full）；④矩阵守门测试适配新面；⑤scripts/regression/README 注记 @playwright/test 经 vendor 共享链满足（版本单一源=vendor/hermes-studio/package.json:139，不重复声明） | config/regression-matrix.json、package.json、scripts/regression/**、scripts/__tests__/regression-matrix.test.ts |
| C 安全清单自足＋CSRF | `feat/security-inventory-hardening` | ①accepted-vulnerabilities v2：条目改对象 `{id,package,reason,tracking,retireWhen}`（14 条逐条回填 N35 台账映射）；②dependency-audit.mjs 适配 v2 格式（兼容读取，缺失字段告警不拦）；③CSRF 专项回归测试（custom/server/security/__tests__/，覆盖 JWT 走 cookie/header 的 CSRF 防线与 `?token=` 查询串禁入的 VULN-05 防回归） | config/accepted-vulnerabilities.json、scripts/dependency-audit.mjs、custom/server/security/__tests__/** |
| D 数字员工批一审查六项 | `fix/digital-employee-review-defects` | 逐项修复 `2026-11-24-digital-employee-batch1-lifecycle-loop.md:237-251` 表列六项：mention-dispatch 警告整体覆盖、team-validate 拒绝码硬编码、collectUnitGate 一错全丢、raci-dispatch 被拦责任人不再被尝试、governance-controller objectField 静默吞形态、OrgEditor 向导被拦后丢输入；每项配守门测试；另补两套契约（governance action-contracts 与 toolcontract）语义区分守门测试 | custom/server/{mention-dispatch,team-validate,collect-unit-gate,raci-dispatch,governance,governance-controller}/**、custom/client/**OrgEditor** |

不在本批（防失控，留台账）：custom/client/shared 零覆盖补测、Ekko 批三/四与数字员工批二/三立项、AGNES 1b、N32-3、N01-N06 裁决、grounded-citations 原值、N35-10 Electron 验证（留基线属主）。

## 三、决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | patches 上限 562→504 并纳入棘轮检查；`DESIGN.md:1292` 豁免改为「vendor 换血批同批调整上限」 | zcodePatches（14=14）证明补丁类可按上限=在册运转；2026-11-23 复盘承诺「上限须等于在册」对 patches 例外空转 58 席位即治理通胀复发；根治优于保留豁免 | 从 limits 删 patches 键（否决：放弃约束，与机制预算立法相悖）；维持 562（否决：约束空转） |
| D2 | 根 tests/ 4 文件按未跟踪本地残留存档后删除 | git ls-files 零跟踪；runtime/tests 侧为受跟踪真身且演进更新（a5701c74f、a9ef0aca1）；其中 2 份逐字节同、2 份 runtime 版更新 | 尝试合并差异回 runtime（否决：runtime 版已随基线批演进，旧侧无独有内容——diff 实测根侧多出的 fixture 行为旧形态） |
| D3 | ide-smoke 以包装面登记 scope=full；@playwright/test 不在根 package.json 重复声明 | 裁判已有单测、脚本只读有退出码，风险低；版本单一源在 vendor/hermes-studio/package.json（共享链保证可用），双声明制造版本漂移面 | devDependency 重复声明（否决：两个版本源）；scope=merge（否决：起 dev server 拖慢日常合并档） |
| D4 | accepted 清单结构化 v2，脚本兼容读取、缺失字段告警不拦 | 清单可维护性缺口是本轮安全轴最大结构性问题；退役条件进清单使「上游出修复版自动提示摘除」可机检 | 保持裸字符串＋外部台账映射（否决：条目与理由分离，摘除依赖人记） |
| D5 | CSRF 专项测试落 custom/server/security/__tests__/（A 类纯新增） | JWT cookie/header 防线与 VULN-05（`?token=` 禁入）现无回归用例；落安全域目录与 url-guard 相邻 | 合入既有 secaudit 面（否决：secaudit 4/13 欠账未清，混入加重判读负担） |
| D6 | 数字员工六项纳入本批 | 审查已定谳的不拦合并缺陷，属「修复已暴露问题」而非新功能；表内已列位置与影响 | 另立批次（否决：六项体量小，单独立项轮开销大于修复本身） |
| D7 | capability-matrix 登记为面（scope=full） | release:preflight 链成员却不在矩阵，「矩阵=测试面唯一事实源」自相矛盾 | 注记豁免（否决：有命令有产出的面无豁免理由） |

## 四、验证

1. 批 A：`node scripts/governance-lint.mjs --budget` 退出 0 且 patches 类不再报虚高；`node scripts/merge-invariants.mjs --check` 全过；8 个状态行抽查与 git log 实际合并态一致。【已过：合并 aa3607f 系→aac12a62d（合入 main 171bae910），lint 0 problems，不变量 pass，索引 775】
2. 批 B：`npx vitest run scripts/__tests__/regression-matrix.test.ts` 绿（新面登记＋守门适配）；`npm run regress -- --scope full` 时 ide-smoke-walkthrough 与 capability-matrix 两面可执行（全量回归轮实测回填）。【已过：守门 26/26；包装面实跑 11/11 exit 0（95s：后端就绪 46s＋前端 2s＋探针 39s，teardown 双端口清零）；capability-matrix 经执行器 runAxis passed（36s）；预算 lint 0 problems；守门补 manual=true 逃逸通道闭合断言（manual 面必须 scopes=["full"] 且带 note 理由）。登录闸三态语义发现与处置见包装脚本头注：worktree 空库首轮需 DEV_BOOTSTRAP 建 super_admin，惯态库不受影响】
3. 批 C：`node scripts/dependency-audit.mjs` 退出 0 且逐条字段齐全输出；CSRF 测试 `npx vitest run custom/server/security/__tests__/` 绿；变异探针（去掉 CSRF 防线断言目标行后测试必红）实测回填。【已过：审计真跑退出 0、元数据完整度 14/14；CSRF 13 例绿（安全面合计 32）；变异探针守卫改坏→1 failed（目标断言红）→还原绿。VULN-05 守卫实测在补丁 120 非 vendor 原文，测试分文本锚点＋行为断言两层；上游无 cookie 会话与 CSRF token 机制，凭据只走 Authorization header 已按现状钉住】
4. 批 D：六项各自守门测试绿＋`npx vitest run <六项测试路径>` 全绿；两套契约区分守门绿。【已过：七文件 61 例绿＋宽回归 75 文件 789 例绿＋typecheck:harness 0；变异探针×7 全部改坏红/还原绿。实施 spec 2026-11-26-digital-employee-review-defects.md 随批入库；OrgEditor 真实浏览器走查留全量回归轮】
5. 合并后：`npm run regress -- --scope merge` 过；全量回归（P6 阶段）21＋2 面执行并回填本节。【合并复核已过：批 C 目标 42/42、批 D 守门 61/61、批 B 守门 26/26 在 main 复跑绿；merge 档与全量档待回归轮】
6. 预算册批 B 增补（裁决授权）：scripts 上限 76→77，sunset owner=quality、reviewBy 2027-02-26、retireWhen 挂 e2e 取代或探针退役；pairedRemovals=ide-smoke 裸入口降级为面内实现细节。【已过：lint 0 problems】

## 五、设计文档影响

DESIGN_SYNC: touched
DESIGN_DOCS: docs/DESIGN.md, docs/superpowers/specs/2026-06-21-overlay-architecture-design.md

- `docs/DESIGN.md` 基线表行（:1708）：hermes-agent v0.23.3→v0.23.4（实际钉版对齐，批 A 同批修订）。
- `docs/DESIGN.md` 机制预算条款（:1292-1293）：废止补丁两类「不按上限贴死」豁免，改为「重锚或让号增减时同批把上限调到在册数」，先例 patches 562→504（批 A 同批修订）。
- `docs/superpowers/specs/2026-06-21-overlay-architecture-design.md`：头部补时点声明（2026-06-21 快照不随批次回填数字，指明现行事实源载体），正文不回填（批 A 同批修订）。
- 其余文档不触及；新增测试面对应的矩阵正本 spec（`2026-11-23-full-retro-regression-matrix.md`）状态行已在批 A 回填，新增两面落地记录回填本 spec 验证节，不新开设计文档。
