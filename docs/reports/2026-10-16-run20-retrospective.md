# run20 全流程推演复盘报告（2026-10-16）

- 复盘对象：20261015-v8-run20（2026-10-14 17:15 开跑 → 2026-10-16 11:45 report_done，净 42.5 小时）
- 依据：全流程推演方案正本 V8.35（overlay/docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md）
- 复盘方法：报告全文逐节通读 + 中央仓/工作区 git 实物反查 + 运行日志与台账实测统计；每个结论带锚点，无锚不立
- 修复实施：simharness 侧五提交（e693096/8cfcada/c1dcca2/f6b90ef + 语言门合规修）、overlay 侧一提交（f7c1c848），对照表见第三章

## 结论先行

run20 六道关卡全过、26 步走完，但逐一复盘确认四类失真，其中最重的一类不是"哪一步没做好"，而是**「存在即可反查」的存在性判据取代了「产物归属」的溯源判据**：四件往轮产物（两份系分稿、两份测试日志）经集成分支的合并兜底路径混入本轮，被报告和 G3 门禁同时当作本轮交付物放行；赛后集成分支被删，13 件交付物的锚点集体不可反查。第二重失真在报告层：26 步的「已知问题」段全部渲染成"零问题单"，与台账 139 行问题登记并存。第三重是方案与产品的机制缺口：采集降级无上限、代偿台账 179 笔未开跑前清偿、逐步问题单注册无守门。上述问题的修复已实施并通过隔离副本端到端验证（修复后的审计器对 run20 证据判 FAIL 12 件旧账 + 30 处死锚，全部命中预期），方案正本修订为 V8.36 的要点在第四章，run21 前置准备在第五章。

## 一、本轮基本盘（实测数据）

| 维度 | 实测值 | 锚点 |
|---|---|---|
| 时长 | 净 42.5h（10-14 17:15 → 10-16 11:45） | state.env run_started_at=1791969313 / report_done=1792122332 |
| 六闸 | 6/6 过（G2/G3/G4/G5/G6 均有打回环记录） | 报告第 6 章闸门仪表盘 |
| UAT | 6 过 1 不过（AC-7 收银台三态不通过） | 报告第 4 章成效表；issues.log uat-conditional |
| 单测 | 498 条，485 绿，13 未绿 | 报告第 4 章成效表 |
| 缺陷 | 4 个（测试报告入仓时点已修 1） | 658971a 测试报告 §3 |
| 问题单 | 139 行 ISSUE / 150 行 DISP；唯一键 116：已修 0 · 观察 101 · 延后 14 · 待处置 1 | evidence/issues.log；报告第 8 章 |
| 代偿 | open 179 笔（auto-approve 150、dispatch-preset 18、nudge 9 等） | 报告代偿净额对账节 |
| 产品面承载率 | 1/5（验收线 ≥4/5）：仅审批面达标 | 报告第 1 章口径卡 |
| R18 必采 | 10/15 | 报告第 1 章口径卡 |
| 截图 | 报告嵌 2 帧、口径"本轮未拍摄"；盘上实有 59 帧 19MB | evidence/screenshots/steps/；审计 A5a 自记 |
| 集成 | 六支内容级并入；对象级 C/N 差异记 lead_merge_fallback 代偿 | state.env；issues.log |

## 二、问题清单（四类分级）

分级口径：P0=阻断下轮或诚信级失真（反查承诺失效）；P1=机制缺口会复发；P2=体验/效率损耗。

### A 报告问题（6 项 P0 + 2 项 P1）

| # | 问题 | 实测锚点 |
|---|---|---|
| A1 (P0) | **四件往轮产物冒充本轮交付物**：「系分稿 PAYCORE」是 RUN=20261012-v8-run16 文档、「系分稿 MP」是 RUN=20261010-v8-run14 文档、「G3 测试日志 PAYCORE-C」是 run19 证据、「PAYCORE-N」是 run16 证据。报告步 13/18 全部按"模版符合/不符"呈现，无一处标注往轮 | 中央仓 f5b47a0 树四文件头实查；驱动 18:15 真值行已记 anexec-missing×2（issues.log）但报告未呈现 |
| A2 (P0) | **13 件交付物锚点集体不可反查**：步 13/18/19/20 的锚为 `origin/integration/RFD-001@658971a`，而远端该分支已不存在（ls-remote 仅 main 与 mx-clean 备份 tag）、658971a 无任何分支包含（游离提交） | `git ls-remote origin`；`git branch -r --contains 658971a` 空 |
| A3 (P0) | **逐步问题单整轮空渲染**：27 处「已知问题：无（本步零问题单）」与台账 139 行 ISSUE 并存——步级账实不符 | 生成器 STEPS_META_20261015_V8_RUN20 26 步 issue_keys 全空（mx-report-gen.py:1531 起，修复前） |
| A4 (P0) | **交付物矩阵虚报零缺件**：矩阵称"在仓 24 件 + 缺件不在仓 0"，而同一报告步 20 嵌入的完备性检查明写 AN-PAYCORE/AN-MP/测试报告三件缺 | 报告交付物全景矩阵 vs completeness-check.md |
| A5 (P1) | **G4 判词与交付物矛盾未对账**：步 19 显"G4 判词通过（10-15 23:10）"，交付物却 0/1 模版符合、结论行 TEST-FAIL（203 例 1 红、集成台架 0 执行、收银台无本轮实跑） | 报告步 19；658971a 测试报告结论行 |
| A6 (P1) | **截图口径与盘上帧矛盾**：口径"本轮未拍摄"、逐步"截图缺失"，盘上实有 59 帧真实截图（2880×1800）因叙事注册 imgs 全空而成孤儿 | evidence/screenshots/steps/ 59 PNG；审计 A5a"盘上未引用帧 53 张" |
| A7 (P1) | 事故报告数据源错位：17 要素 12 项未采集、"共 0 条消息"（读 webui messages 表，agent 实际走 Matrix），自治度对账"人介入 0 轮"无意义 | evidence/incident-report.md；autonomy-reconcile.txt |
| A8 (P2) | 两处口径矛盾：第 2 章称"本轮无独立审计意见书"，步 23 与矩阵却列审计意见书在 origin/main；QGate 发布证据包 9 门全 INCONCLUSIVE（0 核验 0 声明） | 报告第 2 章 vs 步 23；qgate-release-report.txt |

### B 方案问题（4 项 P1 + 2 项 P2）

| # | 问题 | 实测锚点 |
|---|---|---|
| B1 (P1) | **采集降级无上限**：17 步 frame-capture-failed + product-surface-degraded 全以"重启轮"单标签降级观察，R18 必采降到 10/15、产品面承载 1/5 均不阻断收尾——方案缺"降级步数超限=轮次降级"闸 | issues.log 17 条 frame-capture-failed；报告口径卡 |
| B2 (P1) | **代偿清偿门未执行**：V8.29 要求 open 代偿开跑前根治或 waive，run20 开跑时上一轮台账未清（本轮又新增 179 笔 open，auto-approve 150 笔） | 报告代偿对账节；prelaunch ⑯ 存在但未见开跑前执行记录 |
| B3 (P1) | **净额口径无机械判**：§5.9 要求"代偿代判的闸在净额行不计通过"，G5 实测存在 approval-proxy 代批记录，但闸门仪表盘仍显 ✓ 已通过，净额行只是脚注 | 报告闸门 provenance 节自注 |
| B4 (P1) | **交付物轮次一致性无机械判据**：派发词明令"历史轮产物不得引用、恢复或作为完成依据"，但报告新鲜度判据只查"ref 上路径最后 touch"（被 21:10 合并刷新蒙过）、G3 门禁只查文件存在性——两头都没有产物归属判据 | mx-report-gen.py _art_refreshed（修复前）；aipay-scenario.sh repo_branch_has |
| B5 (P2) | 集成分支生命周期无保留规则：赛后即删导致锚点死亡；mx-clean 历史截断使 agent 分支"与集成无共同祖先"，合并兜底改 cherry-pick 独有文件，把陈旧文件扫入分支 | merge 64dff9e 自述"无共同祖先，改走 C 独有 A 文件 cherry-pick" |
| B6 (P2) | 逐步问题单注册无守门：叙事注册可不带 issue_keys 且审计无断言，空渲染静默放行 | 同 A3 |

### C 产品问题（4 项 P1 + 2 项 P2）

| # | 问题 | 状态 |
|---|---|---|
| C1 (P1) | 看板派发器 assignee 坑：13 张卡填房间账号名（-agent 后缀）而非工人档案名，派发器 131 tick 安全空转——派发词措辞是诱导源 | 派发词措辞已修（simharness 20e2041）；产品侧 assignee 校验/诊断未强验 |
| C2 (P1) | 判词扫描器行首锚脆弱：判词写在标题行中间（全角冒号）即失明，等待环白等至硬窗 | 已修（445c775，run21 生效） |
| C3 (P1) | 采集链未挂驱动：r18-collection-missing 自 run11 起记录"采集链未挂驱动"，run20 仍未接线，59 帧拍而未嵌的展示侧缺口同源 | 未修（挂账） |
| C4 (P1) | QGate 9 门未绑执行器：发布证据包全 INCONCLUSIVE，无信号桶 | 未修（挂账，属大件） |
| C5 (P2) | 网关探活不覆盖矩阵适配器：08:04-10:52 共 2.8 小时群内派发零响应而探活全绿 | 收尾批加固项，需验证落地 |
| C6 (P2) | 零交付遥测无产品面：31 张 done 卡无 commit 锚只在工作报告文本层遥测 | 已修（本轮产品化，见第三章） |

### D 推演程序问题（4 项 P1 + 2 项 P2）

| # | 问题 | 状态 |
|---|---|---|
| D1 (P1) | 监督断档：supervisor 15:31 静默死亡 5 小时无人察觉（监控哨只查日志新鲜度不查进程存活） | 已修（launchd 机械看守人每 30min，run20 夜间实证） |
| D2 (P1) | 驱动入侵 ×6 + 重启风暴：单驱动锁有效但入侵源未绝；ERR trap 每 ~2s 假报"驱动异常退出"共 2138 条，真崩溃信号被淹没 | ERR trap 已修（本轮）；入侵源未绝 |
| D3 (P1) | 部署缺口：NUDGE 升级链（743e83c）未部署进本轮运行树，"合 main"≠"已生效" | 纪律 68 三件套验收已立，需 run21 实证 |
| D4 (P1) | G3 门禁存在性判据（同 B4 的闸证侧） | 已修（本轮加轮次头检查） |
| D5 (P2) | 环境三事战（venv 拆分丢 anthropic、证书死路径、cc-switch DNS 熔断）均当场修复，配方入记忆，无复发机制 | 配方已入记忆；mxp_worker_smoke 起跑前探针已加 |
| D6 (P2) | 会话饥饿无自动换会话机制（wei in 78K/out 1-8 token 四轮临界空转） | 靠人工换会话令救场；自动轮换未产品化 |

## 三、修复实施状态（2026-10-16）

| 修复 | 归属 | 提交 | 验证 |
|---|---|---|---|
| 报告真值判据单一源 report_truth.py（声明位提取/锚活性/台账键盘点） | simharness | e693096 | 隔离副本重生成 run20 报告：4 件往轮产物全命中、12 处 stale 标记、30 处死锚 |
| 生成器渲染：往轮产物判词+红条+矩阵计缺件；死锚红字；锚活性按分支缓存 | simharness | e693096/c1dcca2 | 同上 |
| run20 逐步问题单补注册 11 步 + 台账未注册键机械暴露 | simharness | e693096 | 逐步问题单从 0 表 → 10 步 157 行渲染 |
| 逐步问题单明细入折叠区（A10 语言门次生修复） | simharness | f6b90ef | 重生成审计 A10 转绿（除并行会话文案一处，已机械修） |
| 审计器查 14 三断言（14a 旧账/14b 死锚/14c 逐步空渲染，全 FAIL 级） | simharness | 8cfcada | 对 run20 证据判 FAIL 12 件旧账+30 处死锚，全部命中预期 |
| 真值侧柜 report-truth-findings.json（生成器→审计器机器通道） | simharness | 8cfcada | 审计读取实证 |
| G3 闸证轮次检查（repo_branch_runtag，≠本轮记 g3-testlog-stale-run 同径处理） | simharness | 8cfcada | 守门测试④陈旧/新鲜两态提取正确 |
| ERR trap 等待环摘除（mx_wait_eval） | simharness | 8cfcada | 守门测试③谓词假零噪音 |
| prelaunch ⑱ 真值三件套在位守门 | simharness | 8cfcada | 静态断言+守门测试联动 |
| 守门测试 report-truth-anchor.test.sh 四路 | simharness | 8cfcada | 全绿 |
| 零交付遥测检测器 completion.zero-delivery + 7 测试 | overlay | f7c1c848 | vitest 7/7，detectAll 接线实证 |
| 安全合规表一词去过载黑话（并行会话文案 A10 合规） | simharness | f6b90ef 后一提交 | 重生成审计该处转绿 |

挂账状态更新（2026-10-16 晚，用户指令「4 个大件没修的 立刻修好」批，全部落地）：

| 原挂账 | 状态 | 落地锚 |
|---|---|---|
| C3 采集链未挂驱动 | ✅ 已修 | simharness b2a4f9f：capture_step 拍后自动登记 R18 op 载荷（--step-key 映射+帧去重）+生成器 imgs 空时按步键自动挂接盘上帧（隔离副本重生成：报告帧引用 2→26、自动挂接横幅 24） |
| C4 QGate 九门未绑执行器 | ✅ 已修 | simharness e0f3f49：mux/qgate-overrides/ 九门覆盖+检查器（读中央仓/集成分支真实产物）+驱动先 run 后 release-report；端到端 INCONCLUSIVE=0；真实 run20 证据复判=5 PASS+3 FAIL（三 FAIL 均复盘锤实真缺口） |
| D6 会话饥饿无自动处置 | ✅ 已修 | overlay db6eb2c9：detectSessionStarvation（空转×上下文压力交集）+nudge 专属换会话令（新会话只干显式命令清单）；7/7 测试 |
| 零交付分类判据未产品化 | ✅ 已修 | overlay db6eb2c9：card-classify.ts 单一源（治理静默/研发强告警/不确定人工分诊）+检测器升级；127 例套件过 |

挂账二件也已修（2026-10-16 深夜批，用户「两件没修的也修了」指令）：

| 原挂账 | 状态 | 落地锚 |
|---|---|---|
| B5 集成分支保留 | ✅ 已修 | simharness 3f4a97c：mx-clean 保留守卫（锚定轮未落 report_done=integration 禁删，判据前置到 runs 归档前）+3c glob 收紧（git ref 模式 `*` 跨 `/` 误删 integration/main 的实锤修复）+tag 未推达 fail-closed+测试硬隔离与 mx-clean 生产确认闸；守门三路全绿。事故如实记：测试首跑漏传 SIM_ROOT 把生产 runs 归档删一次（68MB/221 条目从 archive tar 完整恢复） |
| A7 事故报告要素采集 | ✅ 可修部分全修（三层根因） | overlay cb6c3fc0+simharness 4096e90：聚合窗口跨天（锚定轮 state.env 真窗，RUN_ID 单日窗切掉 run20 42.5h 首尾=15 absent 根因）+聚合回退判据（total=0 空对象≠null）+content NULL 兜底+控制器/驱动 state_env 接线；run20 实测 collected 2→3、absent 15→14。**边界如实挂账**：trace span 落盘（SIM 树无 traces/）与推演身份册供给（15 员工身份未在 SIM 注册）属 hermes 侧数据面，需 hermes telemetry 供给侧独立项，不越界改 upstream |

至此 run20 复盘问题清单四类 26 项全部有着落（修/立规/边界挂账）。

诚实说明：run20 官方报告未重写——历史轮次产物按"不改写历史"原则留档，修复对 run21 及以后生效；本报告第三章的验证数字来自隔离副本（/tmp 验证树，未触生产证据）。

## 四、方案修订要点（V8.36，已落正本）

正本修订随本复盘同批落地（overlay 分支 fix/run20-retro-plan-v836；档案记档同批）：

1. **纪律 70 交付物轮次一致性**：进入本轮交付物面的工件，文件头声明轮必须等于本轮 RUN；判据单一源=simharness mux/report_truth.py，报告层（渲染+审计查 14a）与闸证层（G3 testlog）双落地。「ref 最后 touch ≥ 轮起点」的旧新鲜度判据降为辅助信号。
2. **纪律 71 交付物锚点保留**：报告锚 ref 必须存在于远端；集成分支保留至报告四格式持久化后才可清理，清理前打保留 tag；审计查 14b FAIL 级。
3. **纪律 72 逐步问题单注册守门**：叙事注册必须带 issue_keys；台账命中键未渲染=审计查 14c FAIL；收尾链补注册前先跑「台账键×步归属」盘点。
4. **纪律 73 净额闸判机械判据**：仪表盘 ✓ 必须带判词 provenance；代批放行的闸在净额行不计通过，判据=approved.events 该闸裁决记录 actor 非 proxy；auto-approve 单轮超 50 笔触发产品缺陷升级。测试锚待 run21 审计器接线首验。
5. **纪律 74 采集降级上限**：单轮降级步数超必采清单 1/3 → 整轮级「采集降级超限」红徽章；承载率低于验收线的轮净额行不计「全流程验证通过」。测试锚待 run21 审计器接线首验。
6. **§5.9 增第 4 线（真值三件套线）**：70/71/72 由审计器查 14a/14b/14c 机械断言，三者均 FAIL 级（反查承诺失效类禁 WARN 化）。

## 五、run21 前置准备

1. prelaunch 全项（现十八项）实跑一遍，重点：⑯ 代偿清偿门（run20 台账 open 179 笔须逐笔 resolve 或 waive）、⑱ 报告真值三件套（新增）。
2. 结构性延后 14 键按纪律 56 开跑前人工处置并带锚回写（g3-local-gate-missing/conclusion-gap/g5-ready-fail/merge-conflict/gate-evidence-blocked/test-report-missing/audit-finding/gate-breaker-tripped 等族）。
3. 叙事注册预写（含 issue_keys——纪律 72 新增要求）与 STEPS_META 键对账，防收尾链补注册再空渲染。
4. 集成分支保留规则入起跑 runbook：赛中建的 integration/RFD-001 在 report_done 前禁止删除，赛后打保留 tag 再清。
5. 采集链接线状态核验（C3 挂账项）：r18-frames.mjs 拍摄位与驱动挂钩在位，59 帧级别的"拍而未嵌"不得再现——叙事注册 imgs 必须与盘上帧对账。
6. 产品面：零交付检测器随下轮产品重建上线（纪律 68 三件套验收）；判词扫描器 445c775 换装验证。
7. 姿态建议：standard 连续第三轮，若 run21 仍 auto-approve 类代偿高企，按 §1.5 收紧路径评估 strict 小规模轮。
