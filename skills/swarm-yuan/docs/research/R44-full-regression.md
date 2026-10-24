# R44 全量回归轮（2026-09-23，栈轮换第六棒 .NET/C#）

## 结论

真实场景项目 r44-drill-inventory（仓储库存管理 API：ASP.NET Core 10 Web API + EF Core 10 + SQLite + xUnit 2.9；9 端点/2 实体/2 迁移/12 用例，真实工具链 build/test/ef 全绿）生成目标技能，流A ⓪-⑨ 全步走完（--mark-active、--all 绿、--all-full fail=0），流B 五项典型执勤全部达成。识别 8 处缺陷全修（D1-D5 五处 .NET 形态缺位/死分支 + D6-D8 两处诚实化/一处字段错位死代码），变异锁 fixture 加固。共性根因第六次复现：新栈执勤必须穷举"探测→清单→门禁→反查"全链路的语言形态假设。

## 环境与演练项目

- .NET SDK 10.0.401：brew cask 需 sudo 交互装不上（沙箱），走官方 dotnet-install.sh 装至 ~/.dotnet（全局规则第 5 节备用通道；未装标注未验证，本轮不适用）。
- r44-drill-inventory：dotnet new 脚手架 + 手写领域层。执勤中踩到 .NET 10 两个真实语义（已沉淀进 dev-guide/framework-knowledge）：record 校验特性须标构造参数位（property: 目标在 MVC 绑定抛 InvalidOperationException→500）；.NET 10 模板 OpenAPI 已内置（Swashbuckle 不再随发）。
- 集成测试踩出状态性坏味道（固定 SKU + 真实 SQLite 文件库，第二次运行撞唯一索引）——check_test 正确抓到，测试改每次运行唯一 SKU。门禁抓真问题的实证。

## 流A 执行记录（⓪-⑨）

⓪ 自检绿 → ⓪.5 项目知识（无 AGENTS.md/记忆史，如实落痕）→ ① 三路并行探查子代理（结构/规范/代码组织，全部带 file:line 锚）→ ①.5 形态判定（纯后端 REST）+ detect-frameworks 实测 + relations-extract（0 机械边：C# 不在声明覆盖，AI 补 6 条语义边，判诚实降级非缺陷）→ ③ 骨架（standard 档）→ ④ 六文件填充 → ④.5 --inject-frameworks（1 框架注入）→ ⑤ conf 三件套（TODO:model 五项补实值 + AUTO:default 两项 AI 手补——D1 缺陷的执勤侧补偿）→ ⑤.5 hooks 双宿主 → ⑥ --all（误报走 conf+decisions.jsonl 留痕两处：BRANCH_REGEX 放行主干名、STABLE_GLOBS 激活 check_reuse）→ ⑦ --review + review-record（2 findings 当场修）→ ⑧ memory-writeback 三路成功 → ⑨ verify-completeness --strict 零占位符 + inventory-verify（D4 现场八维全 0）+ --mark-active。

## 流B 执行记录（T0-T5）

- **T1 新功能全链**：低库存预警端点 GET /api/products/low-stock。spec-first hook 反测 deny（无 spec 写源码，gate-deny/gate-audit 双落盘）→ spec 落 docs/specs → 正测放行；状态机 open→build 跨级拒绝（守卫生效）；design 准入要 proposal；§5.5/§19 格式契约两处 fail 后按模板补齐；TDD 红（6 编译错）→绿（11/11）；--all-full fail=0；gate-runs.jsonl 证据 + verify_result/verify_evidence 落状态；archive 达成。
- **T2 字段变更四件套**：StockReceipt.UnitCost（实体+迁移 AddReceiptUnitCost+DTO+精度用例，12/12 绿）。
- **T3 指纹自成长**：基线 --write → --diff 检出 docs/src scope → reference-manual 数据映射表单条更新 → 新基线 --write → --diff 无变化。
- **T4 rules.d 三值**：dotnet ef database drop→FORBID 带替代方案；git push→PROMPT；未覆盖命令→PROMPT（fail-closed）。
- **T5 审计**：fail-gate-hook --report 四段（事件/拦截率/门禁聚合/工具分布）；failure-detector L1→SPINNING 同签名去重（D8 修复前 tool_response 键整链死代码）。

## 缺陷清单（D1-D8，全部修复）

| # | 级 | 文件 | 缺陷 | 修法 |
|---|----|------|------|------|
| D1 | P1 | scripts/conf-render.sh | 嗅探表无 .NET 工程文件分支，BUILD/TEST_CMD 落空（R39-D1 同族） | 补 csproj/fsproj/sln/slnx find 分支，AUTO:detected |
| D2 | P1 | scripts/detect-frameworks.sh | 无 .NET 信号通道，ACTIVE_FRAMEWORKS 恒空 | 新增 file_glob 通道 + dotnet 两信号行 |
| D3 | P1 | assets/gates-warn.sh | check_test 无 dotnet 单行聚合形态，零用例假绿 | dotnet 分支（Passed 求和）+ 探测清单镜像同步 |
| D4 | P1 | assets/inventory-dimensions.conf | 六维对 .cs 恒 0（ENUM_ZERO_DIM 全家桶） | 补六维 C# 形态（低估方向安全教义） |
| D5 | P1 | assets/framework-gates/dotnet.sh | nullable 的 csproj 分支死代码（continue 守卫在前），恒误报 | csproj 独立 find 兜底 + fixture 变异锁 |
| D6 | P2 | assets/gates-warn.sh | check_build 判 tail 退出码 + 命令缺失与构建失败同词 | 显式捕获 + 127/缺失单列诚实化（check_test 同源） |
| D7 | P2 | scripts/project-fingerprint.sh | 排除链缺 bin/obj，构建产物入指纹基线（R33-D6 同族） | 补两目录排除 + 各维同步 |
| D8 | P1 | assets/hooks/failure-detector.sh | 只读 tool_result，现代宿主 tool_response 下整链死代码（回归#20b 同型） | 双字段兼容取值 |

观察项（不修，留痕）：relations-extract 不支持 C# import（声明覆盖内无，AI 语义边兜底）；--all-full 无 spec 的全新项目 TOGAF 门禁恒 fail（spec-first 教义内，流B 建 spec 后消解）；check_layer find 白名单无 .cs 但 git ls-files 兜底覆盖已跟踪文件（未跟踪新文件有盲区，P3）；GATE_RUNS_DIR 环境变量临时覆盖未生效（conf 语义，P3 待查）。

部署态发现（F1）：cc-switch 安装版内容停在 R37 时代、.swarm-yuan-version 锚却虚报 v2.16.1-4——对账锚失真击穿"装旧版无感知"防线（cc-switch 无 install.sh 目标、手工五步复刻不完整所致）。本轮收口后重做安装同步。

## 验证面

self-check 全绿（FACT_SCRIPT_LOC 6489→6516 第十次登记 + gate-enforce-level.conf 再生同步）；79 规则集四要素全过；79 fixture 双态全过（dotnet fixture 加固：violating 五断言 + compliant expected-pass-ids 十门禁负向断言，变异实测回退修复即红）；gate-fixtures 全组过；e2e 三链（四框架注入/生成质量/漏改字段防线）全过；bash 3.2 语法全扫零失败；演练项目 --all 全绿、--all-full fail=0。

## 载体与发版

CHANGELOG v2.16.2；双 README badge bump；tag v2.16.2 + v20260923-src；GitHub Release Latest。
