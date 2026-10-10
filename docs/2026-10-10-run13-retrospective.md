# run13 回归轮复盘（2026-10-10，report_done 12:19:05，全程 3h04m）

> 定位：对照方案 V8.4（正本 `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`）逐项复盘 run13（20261010-v8-run13，回归轮首航，夹具自 run12，执行带步 18-26）。产出=问题清单（带锚）+修复方案（F 编号）+run14 前置。本文档为 run14 前置正本之一；工程侧修复落 simharness/overlay main，条款修订落方案 V8.5。
>
> 一句话总结：**run13 把「诚实账」立住了（错帧不冒充、UAT 3 条不通过如实判、全量补拍如实标注），但报告链的机器面暴露出一批「声称与台账不符」「计数不闭合」「旧账冒充」缺陷，采集链与产品成效采集两条 V8.4 承诺未接线——run14 前须双侧根治。**

## 一、先说成绩（可反查）

1. 回归轮口径首次全程落地：17 步沿用声明态、缺帧三态（未采集/功能不存在/准确补拍）、jargon 门禁、双正本四查全过（12:19 report_done）。
2. 边界守卫（防过度交付）首次实战：零 main 污染、零越界代做（六域 L5 行+分支对账）。
3. 事故诚实账：G5/repo_has 两起重启循环、步 18/19 错帧、UAT AC-1/5/6 不通过（一手复测 31/34+3 失败+tsc TS2339 与 qi 报备双源一致）全部如实记单，无一美化。
4. 产品面 G1-G4 修复中途上线并当轮实证（IDE 落地引导/403 根治/board-status 29 板/回归轮横幅）。
5. 判词纪律首验通过（G5 一轮过 11:30:41，零模板字样污染）。

## 二、问题清单（四类，锚点可反查）

### A. 报告层（生成器/合并器）——12 项

| # | 问题 | 锚点 | 修复 |
|---|---|---|---|
| A1 | **PART1「本轮结论」「真实缺口」两张核心卡带【收尾链回填：…】占位符出厂**——收尾链回填了六域行与步 21-26 实锚，漏了这两张卡；审计无占位符残留断言 | final-report.html PART1（提取文本 L57-59） | F-P1 补齐 run13 注册稿并重出；F-audit 新增占位符残留 FAIL 断言 |
| A2 | **口径行「记入问题清单（type=X）」声称与台账不符**：delivery-g5-gate-event-missing、product-outcome-missing 两处在 issues.log 均无对应条目（报告声称记单、台账无单） | mx-report-gen.py:2267/2308 硬编码；issues.log 69 行无此二键 | F4 声称条件化（查台账再写）；缺单则由审计记单 |
| A3 | **DISP 唯一键表错挂**：r18-collection-missing 五主体的处置全显示 step-23 内容；g3-local-gate-missing·PAYCORE-C 显示 CHWX 的处置 | mx-report-gen.py issues_stats（DISP 按类型广播到全部主体键） | F5 主体精确优先+泛化 DISP 才广播；方案 §4.3-28 同步细化（C1） |
| A4 | **三态计数不闭合**：「唯一键 26：已修 2·观察 4·延后 0·待处置 0」只归桶 6 键，20 键 DISP 首词表外（已处置/降级/记单跟踪/收口）凭空消失；第 9 章却称「26 个问题单全部有处置结论」——同页两口径打架 | final-report 第 1/8/9 章；§4.3-28 首词三态约束在收尾链书写侧未执行 | F6 表外词计数入行+audit WARN；收尾链 DISP 书写规范入监控手册 |
| A5 | **六道关卡仪表盘 G2 行「10-10 09:14 已通过」**：lite-seed 用 `$NOW` 写夹具闸键，把源轮（run12）评审冒充为本轮通过、时刻=起跑时刻；G1 行同样无「沿用源轮」分带 | mx-lite-seed.sh:72；state.env g2_arch_pass=1791594891=run_started_at | F1 seed 携源轮真值+分带标记；仪表盘按 lite_fixtures_from 分带呈现 |
| A6 | **闸间人工确认点表陈旧静态文案**：「该轮无 G4/UAT/G6 checkpoint 留痕——归档轮离线再生成」为 run10 归档轮产物语；run13 当轮实跑 UAT/G6 却显示无留痕；「T-101~T-108」为历轮静态卡号——§5.5 静态注册表兜底条款违例（R11 复发） | mx-report-gen.py:1373-1376 默认分支 | F3 默认文案中性化（拒绝编造语义）；run13/run14 补真锚注册 |
| A7 | **R7 三功能区证据行三面全「本轮未拍」**，与报告内步 19 看板帧/步 25 IDE 帧及承载率 4/5 自相矛盾 | final-report 第 0 章 R7 行 | F7bis R7 行取数改自当轮帧注册表 |
| A8 | **意图通路七条 AC 的编码门禁/UAT 对账两列全 ⬜**：testlog 在分支可反查、acceptance.md 12:07 已入 origin/main，解析器取数未命中（本地 clone 未随轮刷新） | final-report 第 3 章 | F18 gen 前中央仓 fresh pull+解析源对齐 |
| A9 | **夹具步①叙事错位**：步 3（登录）讲 org.md（步 6 内容）、步 5（应用初始化）讲 G1 冻结（步 7 内容） | mx-report-gen.py:1113/1119 | F7 叙事修正（回归轮模板正文，run14 重出时生效） |
| A10 | **沿用步徽章误标「R18 未采集·记入问题清单在案」**：与 V8.4④ 回归轮「不在本轮执行范围」声明态冲突，且这些步无对应问题单 | final-report 步 7-17 块头 | F8 徽章按声明态渲染 |
| A11 | 交付物全景矩阵计数表述混乱：「文件在仓 17 件——模版符合 15·模版不符/缺件 7」（15+7≠17；实为 15 符合+2 不符在仓+5 缺件+1 无文件域） | final-report 第 9 章矩阵引言行 | F9b 措辞改「在仓 17（符合 15/不符 2）+缺件 5+无文件域 1」 |
| A12 | **并行度实测 0%**：六分支 44 分钟内全部落地（分支时间线在报告内），但段界行缺失致活跃 agent 分钟数测不出——测量链前置动作（驱动发射分界行）无主 | mx-report-gen.py:1660 fallback；aipay-scenario.sh devimpl 段尾 | F12 段尾发射分界行+parser 优先段界；方案补条款（C5） |

### B. harness（采集/驱动/台账）——7 项

| # | 问题 | 锚点 | 修复 |
|---|---|---|---|
| B1 | **采集链未按方案挂驱动**：r18-collect 对话挂钩仅步 17/19，必采对话 5 步缺 9/11/21；capture_step 有挂钩但 URL/账号不走 capture-plan 注册表——14 帧全部收尾补拍，帧四断言③失去当轮执法对象 | aipay-scenario.sh:747/1002；hero「全部实拍（收尾后补拍）」 | F13 补挂钩 9/11/21；capture_step 读 capture-plan（步→URL/账号同源 r18-frames） |
| B2 | **qgate release-report 落盘失败**（CLI 路径/构建前置缺失）×11 张重复单 | aipay-scenario.sh:1082；issues.log qgate-evidence ×11 | F14 起跑前清单+构建 qgate dist；F9 issue_once 幂等记单 |
| B3 | **重启循环刷单污染台账**：qgate-evidence ×11、uat-precheck ×5（39 条中 16 条重复）——记单点无幂等 | issues.log L15-31 | F9 issue_once（类型+主体去重）换装易复发现场 |
| B4 | G5 收口 dlv_gate 裸调缺守卫、repo_has 新鲜度×回归轮冲突——两起重启循环根因（已修 b05131f/6959a2b，保留事故账） | issues.log g5-restart-loop | 已修，无新增动作 |
| B5 | **completeness-check 旧基线残留**：11:37 生成后 repo_has 修复（11:42）未重生成，报告嵌入的完备性检查仍列「缺 freeze.md」与 UAT 通过矛盾 | evidence/completeness-check.md（11:37:30） | F15 completeness 与 repo_has 同用回归轮基线（根修，非重生成补丁） |
| B6 | **产品成效采集未实现**：§5.4「驱动于步 26 落盘 quality-summary.env+下单/幂等实拍」无对应驱动动作，evidence/product-outcome/ 全空；§5.6「产品成效帧入分母、r18_matrix 同批改（三方同步）」未执行（TOTAL 仍 13） | aipay-scenario.sh 无该动作；r18_matrix.py:29 | F17 驱动落盘实算+双帧+执行输出；r18_matrix/hero/audit 三方同步改分母 |
| B7 | capture-plan 全量轮位 12 条+动态位 5 条「入册待同步 call site」；步 22 仍 none（G3 board-status 已落 main） | issues.log L12；capture-plan.env | F16 步 22 撤 none 改交付健康页签；全量位进 capture_step 默认表 |

### C. 方案层——5 项

| # | 问题 | 修复（V8.5） |
|---|---|---|
| C1 | §4.3-28 DISP 连接键「主体段不参与 join」在多主体同类型时必然错挂（A3 同根；步块③段过滤同病） | 细化为「类型段连接+主体精确优先配对；仅主体为泛指（director/monitor）的 DISP 才广播到该类型全部键」 |
| C2 | 回归轮条款缺口三件：①夹具闸门键时间戳口径（禁 `$NOW` 冒充，应携源轮真值+分带呈现）②delivery 协议事件缺省启用×回归轮（run13 全程未开案例房，无豁免条款与记单口径）③必采分母 13 项×回归轮执行域（3/13 呈现误导） | §3.2 分层轮声明扩三条：夹具闸键带源轮真值与分带；回归轮 delivery 处置二选一（lite-seed 建案例房 或 显式豁免+专用记单键）；必采覆盖率回归轮按执行域折算呈现（n/13 及 执行域内 n'/m' 并列） |
| C3 | 首过率口径未定义「打回」判据：治理报告把闸步问题单（g3-local-gate-missing/qgate-evidence）计成打回（4/6：G3 打回 G5 打回），与「G5 一轮过」叙事冲突 | §2.6-5/治理报告口径：打回只认判词 FAIL（关卡结论行）；闸段问题单另列「闸段问题单 N 起」不入打回分母 |
| C4 | 记单幂等条款缺失（B3 同根） | §4.3-28 增补：ISSUE 记单点必须幂等（类型+主体去重，重启循环重放不刷单）；刷单=台账卫生缺陷 |
| C5 | 并行度测量的段界行发射无条款（A12 同根） | §5.5 并行度行条款补「驱动在 devimpl 段尾发射分界行（scenario.log 可 grep 锚）」 |

### D. 产品（SwarmStudio）与被测产物——7 项

| # | 问题 | 状态 |
|---|---|---|
| D1 | /app/ide 裸路由落聊天壳页+403 toast（步 18 错帧根因链） | 已修 main（IdeLandingHero/deeplink 单源/403 降噪+白名单，b85a839a/c47cad65），run14 构建生效 |
| D2 | r18 dismissPopups 裸关闭钮误关看板页签（步 19 错帧根因，采集工具缺陷） | 已修 simharness 6c4f6dd |
| D3 | UAT AC-1/5/6 不通过（cashier 代码 tsc TS2339 handleChannelNotify 缺失+31/34 复测 3 失败） | 被测产物缺陷，backlog；run14 全量轮重做时作为已知风险项写入步 18 派发词风险提示（不代修） |
| D4 | REL-DELIVER 商户接入文档缺件（audit-finding） | 派发词有要求、agent 未产出；run14 发布段验证；模板无缺陷 |
| D5 | 判定后端 clef-flash 快照不在档（F-7 fail-open） | run14 起跑前清单必做项（§4.1 前置⑦） |
| D6 | incident-report 17 要素 12 项未采集（RUN≠单会话，数据面映射局限） | 如实标注不造数；改进列观察（汇编器数据源映射到推演三源属长线项） |
| D7 | 六域体检本轮未跑（按轮注册静态呈现，已声明） | 治理中心体检在轮内重跑的接线仍缺，列 backlog |

### E. 流程/监控面——3 项（记录性）

| # | 问题 | 处置 |
|---|---|---|
| E1 | 报告步 12:10-12:19 十二次重启循环：审计 FAIL 项（R5 缺 DISP/帧双挂）在驱动侧无自愈分类，靠监控侧人工清 | 收尾链 SOP 已立（gen→merge→audit 固定序）；F6/F5 落地后此类 FAIL 源头消失 |
| E2 | 驱动声称记单与台账不符（integration-push-unreached 监控侧补记） | R13 已入风险表；F9 issue_once 根治记单点 |
| E3 | 起跑前静场处置（run12→run13 间隙网关拥塞 50min） | 已入 §4.5 R15 与运行手册；run14 前置执行 |

## 三、修复方案与验收（F 编号→run14 门禁）

| F | 内容 | 仓 | 验收 |
|---|---|---|---|
| F1 | lite-seed 夹具闸键携源轮真值+`g1g2_fixtures=1` 标记；仪表盘分带 | simharness | 重出 run13 报告 G2 行显示源轮真值时刻+「沿用源轮」带 |
| F2 | 基线查找过滤非轮次目录（`_wtest`） | simharness | 重出后治理报告基线行显示 run12 首过率 |
| F3 | 卡点注册表默认文案中性化 | simharness | 未注册轮显示「本轮未注册卡点锚（拒绝编造）」 |
| F4 | 「记入问题清单」声称条件化 | simharness | 声称行与 issues.log 键一一对应（audit 断言） |
| F5 | DISP 主体精确优先 join | simharness | run13 重出后五主体各自显示自己的 DISP |
| F6 | 三态计数表外词归桶告警 | simharness | 计数行四桶+表外词 N 求和=唯一键数；audit WARN |
| F7/F7bis/F8/F9b | 夹具叙事步 3/5 修正、R7 行取帧注册、沿用步徽章声明态、矩阵计数措辞 | simharness | run13 重出报告目检 |
| F9 | issue_once 幂等记单 | simharness | 守门测试：同键重复记单只落一行 |
| F10 | 首过率口径=判词 FAIL | simharness | run13 重出治理报告 G3/G5 不再计打回 |
| F11 | 闸键首过保护（sset 不覆盖已有闸键） | simharness | 重启循环后首过时刻保持 |
| F12 | devimpl 段界行发射+解析 | simharness | run14 并行度行为实测数字 |
| F13 | r18-collect 挂步 9/11/21；capture_step 读 capture-plan | simharness | run14 必采对话 5 步在档、当轮帧非补拍 |
| F14 | qgate dist 构建进起跑前清单+路径解析 | simharness/overlay | run14 G5 段 release-report 落盘 |
| F15 | completeness-check 回归轮基线对齐 | simharness | 回归轮不再误报缺件 |
| F16 | capture-plan 步 22 撤 none+全量位激活 | simharness | run14 步 22 交付健康页签实拍 |
| F17 | 产品成效采集（quality-summary.env+下单/幂等帧）+矩阵三方同步 | simharness | run14 第 4 章成效块三件实测 |
| F18 | 报告 gen 前中央仓 fresh pull | simharness | run13 重出意图通路 UAT 列亮起 |
| F-P1 | run13 PART1 占位卡补齐+重出双正本 | simharness | 占位符零残留（新 audit 断言） |
| O1/O2 | 复盘文档（本文）+方案 V8.5 修订合 main | overlay | render.sh 重出方案页标题 V8.5 |

## 四、run14 定位与前置

- **run14=全量轮（L2，26 步全新环境独立回归）**：mx-clean 全旗标（--reset-central --reset-workspaces --reset-memory）→ mx-setup → qgate dist 构建 → product build:full（main 含 G1-G4+V8.5）→ product-dist 供给+studio 重启（GRAPH_ENGINE=on）→ capture-plan 全量位激活 → STEPS_META_RUN14 预注册+PART1 骨架预写 → 起跑前清单九条+静场+判定后端快照 → RUN_ID=20261010-v8-run14。
- 已知风险项带入：步 18 派发词附 run13 UAT 缺陷风险提示（handleChannelNotify 契约完整性，D3）；发布段验证 REL-DELIVER 文档产出（D4）。
- 本文档问题清单与 F 编号是 run14 起跑前验收单：F1-F18 未全绿不得起跑。
