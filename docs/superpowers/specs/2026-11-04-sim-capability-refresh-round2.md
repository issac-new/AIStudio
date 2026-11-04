# 推演工装刷新第二轮：方案 §5.11 扩组至十三组＋探测脚本六新组＋驱动接线

日期：2026-11-04
状态：implemented
触发：用户「更新全流程推演方案、推演程序，并提交」。上轮刷新（2026-11-03-sim-capability-refresh）覆盖到七组为止；其后两天内新落地的能力面（四性四格判据 2026-11-03 晚批、AgentTeams 四批与挂账清偿 2026-11-04）全部没有进推演验证面。另发现上轮遗留真缺口：`mx-capability-probes.mjs` 立了法（方案 §5.11＋审计器查 19）但**驱动从未调用它**——grep 全 simharness 仅 README 与报告模板引用，每轮证据只能缺席落 WARN，等于「立法无执法生产方」。

## 变更

- **方案正本**（`2026-10-05-mux-v8-fullflow-plan.md`，SPEC_REBIND 授权修订）：§5.11 标题与立条背景补 2026-11-04 扩组注记；判据表增 8-13 六行（四性四格判据／项目一级状态机与拓扑／编码执行记录／环境变量编辑面／权限变更审计／技能导出三道限）；准出规则同步「七组→十三组」并补空态与条件负例口径；取证工装行补驱动接线说明。§5.3 G4 判据 ⑪「新能力探测七组」改十三组。
- **探测脚本**（`simharness/mux/mx-capability-probes.mjs`）：新增六组共约 15 条探测（正例取读数、负例必红），新增 `--profile` 参数（userenv 组用，缺省 default）。组键：`fourgap`／`projectworkflow`／`execution-records`／`userenv`／`userperms`／`skills`。
- **驱动接线**（`simharness/aipay-scenario.sh` testpass 步，本批最重要的缺口清偿）：契约观察块之后、评测子门之前，对生效 studio（`STUDIO_PORT:-8802`）全量探测一次，`--token "$(jwt_of fanfan)"`；退出码非 0 → 落 `g4-capability-probe-failed` 问题单＋置 `g4_capability_blocked`＋**g4_pass 不置位**（G5 的 gate_blocked 拒入）。这是上轮「立法无生产方」的根治：证据从「每轮缺席 WARN」变为「每轮必产、失败拦闸」。
- **报告模板**（`templates-pending/test-report.md`）：§8.1 七组措辞改十三组并补新组名与条件负例说明；判据 18 同步。
- **审计器**（`simharness/mux/mx-report-audit.py` 查 19）：必齐组集从 7 扩到 13（缺组 WARN 语义不变），文案同步。
- **README**（`simharness/README.md`）：新能力探测节更新为十三组＋注明步 19 自动接线。
- **守门测试**（`simharness/tests/capability-probes.test.ts`）：夹具增挂 governance／trust／projectworkflow／execution-records／userenv／userperms 六组 custom 路由＋vendor 技能路由（依赖注入态树），临时看板根造 project_id 任务行使状态机组正负例确定性成立；十三组全绿断言＋服务不可达仍写产物退 1 断言保留。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 扩组进 §5.11 而非另立新节 | 探测脚本／审计查 19／报告判据 18 是同一套机制，另立节=验证面分裂两处 | 另立 §5.12（否决：单一事实源） | 是 |
| D2 | 驱动接线在 testpass 步、失败拦 G4 | §5.11 准出规则本就写「failed>0 即 G4 不通过」，但没有生产方时该规则永不触发；接线后负例转绿当轮拦截而非报告期追认 | 只在报告审计环判（否决：上轮现状已证明=缺席 WARN 空转） | 是 |
| D3 | 状态机类端点只探「不落库的拒绝分支」 | 脚本纪律「只读只算不写业务数据」；complete/pause 的成功路径会写 projects-state.json，探测一旦造项目就留永久脏态（completed 是终态无 reopen） | 探测自建项目再清理（否决：无删除端点，清不掉） | 是 |
| D4 | projectworkflow 组正例空态合法、负例条件执行 | SIM 板任务是否带 project_id 未证；无未终结项目时 422/400 负例无触发条件，如实记 skip 理由优于造数据。全量正负行为由守门测试夹具（临时看板根＋HERMES_KANBAN_HOME 重定向）确定性验证 | 探测造项目（否决：同 D3） | 是 |
| D5 | skills 组只探列表正例＋不存在技能 404 负例；413 超限／403 外部源分支由 `custom/__tests__/skills-export-contract.test.ts` 契约断言把守 | 413 需构造 >200MB 目录、403 需 external_dirs 配置，端点探测造不起；契约测试读补丁文本断言常量与分支已在册（组 7 码表先例） | 全分支端点探（否决：造大目录探自身就是负担） | 是 |
| D6 | 探测脚本加 `--profile` 参数（缺省 default） | userenv 组需指定在档 profile；SIM 与夹具都有 default，硬编码则失弹 | 硬编码（否决） | 是 |

## 验证

- `npx vitest run tests/capability-probes.test.ts`（simharness 目录）→ **2/2 绿**：十三组 31 条探测全过（含组 9 条件负例真跑非 skip）＋服务不可达仍写产物退 1。
- `bash tests/run-gates.sh` 全量守门套件 → **274/274 绿**（18 文件，含 jargon 门 HARD=0）。
- `bash -n simharness/aipay-scenario.sh` 过；`node --check mx-capability-probes.mjs` 过；`ast.parse(mx-report-audit.py)` 过。
- 全量根 `npm test` → **7689 passed / 0 failed / 11 skipped**。首轮 2 红为本批引入（A.1 标题计数漏改＋设计索引未含新 spec），当场清偿后复跑全绿。
- 守门测试夹具两个源码级发现随批固化：vendor 技能面依赖 `bootstrap/agent-profile-adapter` 的 import 即接线（不接则 readConfigYamlForProfile 抛「not configured」全 500）；profile 无 config.yaml 同因 500。夹具补生产同源装配＋最小 config.yaml。

## 设计文档影响

DESIGN_SYNC: touched——本批修订推演方案正本《2026-10-05-mux-v8-fullflow-plan.md》§5.11 与 §5.3 G4 判据 ⑪（七组→十三组＋驱动接线条款），正本随本批同批修订；数字总账（闸数/步数/矩阵分母）无变化。产品侧六组能力的设计依据见各自 spec（2026-11-03-four-gap-capabilities／-completion、2026-11-04-agentteams-project-workflow／-execution-records／-project-graph／-skill-export／-ledger-items）。
