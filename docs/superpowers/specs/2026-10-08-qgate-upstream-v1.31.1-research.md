# QGate 上游 quality-gate v1.31.1 增量调研报告（v1.24.0 → v1.31.1）

日期：2026-10-08
状态：调研闭环（七版 release notes 逐版研读 + 累计提交 diff 盘点 + 吸收实施落地 + 实机走查）
调研对象：`lazyzhsh/quality-gate` @ v1.31.1（commit `e41417d`，2026-10-06 发布；本机只读副本 `/Volumes/nvme2230/lab/research/quality-gate` 已 `git pull` 至最新）
基线：v1.24.0（`89e7860`，2026-10-01 首次开源版）
姊妹篇：《QGate 上游 quality-gate v1.24.0 调研报告》（`2026-10-01-qgate-upstream-v1.24-research.md`，下称《v1.24 调研》）；移植设计《2026-10-01-qgate-v0.3-port-design.md》
受众：QGate 维护者与推演方案读者

## 三句话主旨

上游七版（1.25.0→1.31.1，全部 2026-10-06 一日发布，单累计提交 89 文件 +4034/−708）主线是**受控表达与证明链**：报告层从"结论呈现"升级为"来源分级呈现"（核验/声明/降级/无信号），证明链从"门 PASS 即可"收紧到"AC 必须绑定真实执行且通过的用例身份"（acCaseMissing 四形态），执行面补齐统一预算执法。本地 v0.3 已有 rawOutput 内核重算与输入快照等工程地基，但报告诚实度、advisory 可见性、AC 用例绑定、预算执法四件全部缺位——本轮全部按本地方言吸收；PNG 像素重算、OpenAPI 提取器、文风检查器等六件明确延后（理由见 §4）。

## 1. 版本线（v1.24.0 → v1.31.1）

七版一日连发，主题按批收敛（据 `docs/release/RELEASE-1.2{5..9}.md`、`RELEASE-1.3{0,1}*.md` 逐版归纳）：

| 版本 | 主题 | 判定语义变化 |
|---|---|---|
| 1.25.0 | 受控表达第一批：失败建议改修复优先（放松验收不作为修复选项）+ SKILL 三处纠正 + WRITING-GUIDE（W1-W12） | 零（纯文案/文档） |
| 1.26.0 | 报告表达：逐门**来源列**（核验/声明/降级信号标签）+ 来源分布行 + advisory 可见性 + brief 例外行 + **声明关联**（逐 Claim 关联门与结论、未验证声明）+ Stop 边界措辞（new-only 明示仍 FAIL） | 零（渲染层） |
| 1.27.0 | 文风检查器接入（WS-1 长句/WS-2 模糊词/WS-3 多动作，全 advisory）+ 零扫描可见性 + 入口文档重构 | 零（advisory 不阻断） |
| 1.28.0 | SKIP 原因显式化（`{reason:'disabled'\|'stage-not-selected'}` 结构化）+ 不适用跳过审计行 + 未验证声明成因区分（无关联门 vs 关联门未执行） | details 字段字符串→对象 |
| 1.29.0 | 七工作包：documentation **内容级核验**（内核实读制品）/ 真实进程故障 runner / 依赖图真实测量 / **PNG 像素差内核重算** / OWL+SHACL 组合 oracle 测试 / OpenAPI 契约提取器 / 多轮延迟分布 | W6 修复传递闭包误报 |
| 1.30.0 | 二轮评审六缺陷：**统一执行预算**（登记内 runner 预算并入同一计划，宿主预算即执行期限，不足=ERROR budget-exhausted）/ requireLive 缺失 mode=FAIL / 反向认可收紧（须 inverseOf）/ PNG 结构防线 / 依赖提取状态机 / OpenAPI fail-closed | F02/F03 收紧（错放输入改 FAIL/ERROR） |
| 1.31.0 | 证明链补齐：**AC→真实用例绑定**（AC `cases:[{gateId,caseIds}]`，traceability 当轮逐用例复核 acCaseMissing/Skipped/Failed + requireCaseBinding→acCaseUnbound）+ 来源信号补齐（内核像素重算/内容核验入核验桶，无信号第四桶与非 PASS 的"—"分离） | 绑定复核收紧（opt-in） |
| 1.31.1 | 反思轮补丁：重复 tRNS 拒绝 / 正则语境守卫 / exact-bytes 计入核验 / caseOutcomesOf 限定 behavior / 负例矩阵 14 / 术语补登记 | 补严方向 |

回归基线：678 测试 0 SKIP、27 demo PASS、zip SHA256 留档（`RELEASE-1.31.1.md:334`）。

## 2. 与本地 v0.3 对照（增量维度）

| 上游增量 | 本地 v0.3 现状 | 本轮处置 |
|---|---|---|
| 来源列/来源分布/无信号桶（1.26/1.31） | 无——evidence 有 execution/independence 两轴，但无门级"靠什么撑着 PASS"的分级呈现 | **吸收**：`src/core/sources.ts` 四桶（核验=rawOutput 重算与内核计算类 executor；声明=command 无 rawOutput/llm 自报；降级=files present 级/§49 缓存命中；无信号=PASS 无可分类信号）；聚合优先级 降级＞核验＞声明；FAIL/INCONCLUSIVE 不分类（—）。落 `GateRun.sourceSignal`，status/run/release-report/SessionStart/治理 UI 全链呈现 |
| 声明关联+未验证成因（1.26/1.28） | release-report 只有 coveredBy（声明面） | **吸收**：逐 claim 列关联门实况判定；未验证成因区分 no-gate / gate-not-run；边界句固定随行（"门禁 PASS ≠ 声明全文已被证明"） |
| advisory 可见性+例外不隐藏（1.26/1.27） | CONDITIONAL 只是判定态，摘要层过滤 | **吸收**：status JSON/text + release-report Advisory 节 + Stop approve 消息 advisory 行 + SessionStart 注入；active waivers 行（WAIVED≠PASS 语义随行） |
| 修复优先纪律（1.25） | 无建议层 | **吸收**：`FIX_FIRST_DISCIPLINE` 常量进 explain/run 阻断/release-report Unresolved/Stop block 消息；SKILL 铁律四 |
| SKIP 成因显式化（1.28） | "never run" 一句话 | **吸收**（本地方言）：status `skipCause` 区分 `out-of-change-scope`（appliesWhen 未命中）与 `never-run` |
| AC→用例绑定（1.31 旗舰） | RTM 只核 codeFiles 存在+链接门 PASS 新鲜（无关成功门可充当 AC 证据——上游 AC-UNBOUND 反例同款缺口） | **吸收**：`Evidence.caseOutcomes`（command+rawOutput 逐点重解析、behavior cases 逐用例深比较两个身份源）；requirements AC `cases:[{gateId,caseIds}]` 绑定核验四形态（acCaseMissing/Failed/Skipped/Unbound）+ executor `requireCaseBinding`；畸形登记 fail-closed（gateId 必须 ⊆ testGateIds、1..20/1..50、唯一性） |
| 统一执行预算（1.30 F01） | Stop 钩子自有预算阶梯；run 无预算概念 | **吸收**（最小方言）：`run --budget-ms N` 宿主预算下启动前比剩余 vs 门声明预算（command timeoutMs + 内核侧 5s/executor），不足不启动落 error 证据（INCONCLUSIVE，fail-closed 非 SKIP）；无旗标零行为变化（同上游"期限执法仅在宿主给出预算时生效"） |
| Stop 诚实措辞（1.26 #5） | new-only 已留痕但未明示"本次仍非全绿" | **吸收**：new-only 消息加 "The report for this session is still NOT all-PASS" |
| SwarmStudio 集成面（本地独有维度） | qgate-bridge 换算面已实现但 reportVerdict **无生产调用方**（判定流断头）；治理 gateStats 无来源维度 | **接线**：server `GET /api/governance/qgate-verdicts`（逐门最新判定+六态→三态+来源桶）；bridge 时间线学习挂 RoomEvent.Timeline + `syncVerdictsToCase` 批量上报；交付案例卡「同步 QGate 判定」动作；治理健康页「机器执法实况」条（G1-G6 域映射+来源分布，G2/G6 人工域灰态如实） |

## 3. 延后项清偿（2026-10-08 同日第二执行令：七件全部转已落地）

初版本节为"明确延后项（含理由，待选做）"七件；用户当日裁定"立刻做"，全部落地
（overlay commit f26c075 + dd60dd0，qgate 套件 196/196 绿）。原延后理由与新落地面：

| 上游能力 | 原延后理由（初版） | 落地面（2026-10-08 第二轮） |
|---|---|---|
| PNG 像素差内核重算（1.29 W4/1.30 F04/1.31.1） | 无 visual 基线基建 | `src/core/png.ts` 完整解码器（chunk CRC32/IEND 末尾/未知关键 chunk/tRNS 透明键+RGBA 禁 tRNS+重复拒/解压上限）；visual 门三通道（exact-bytes/kernel-recompute/self-reported），自报不符即 error |
| OpenAPI 契约提取器（1.29 W8/1.30 F06） | 无真实契约消费场景 | `src/core/openapi.ts` + CLI `extract-openapi`（子集外 exit 3 指名；无项目 opt-in 约束的工具命令） |
| 文风检查器 WS-1/2/3（1.27） | 接入点应在推演侧 | `src/core/writing-style.ts` + ops `writing-style` 门先行入内核；推演侧接入（mx-report-gen 骨架/审计器）仍列待选做 |
| 真实进程故障/依赖图 demo（1.29 W2/W3） | demo 属上游验收基建 | `examples/resilience-process-demo`（真实 kill/重启/健康轮询计时，kill-no-restart 3 秒端口静默不可伪造）+ `examples/architecture-dependency-demo`（状态机分类：注释/字符串/模板/正则不误计，副作用 import/export-from 不漏计，DFS 三色环检测，注入场景 finally 清理） |
| OWL/SHACL 组合 oracle（1.29 W6） | 无独立第二实现 | `__tests__/qgate-v131-combinatorial.test.ts`：22 固定种子 × 朴素独立 oracle 对照。**oracle 逮住并根治一枚内核真缺陷：传递性不随 subPropertyOf 继承**（P1 ⊑ P0(传递) 应传递，旧实现只看自身旗标）；F03/W6 镜像缺陷（互逆同方向误受/传递单跳漏报）在 semantic 重写轮根治并有针对性反例 |
| requireLive（1.30 F02）/ 反向认可（F03） | 无对应消费方 | contract diff/breaking/matrix 三模式共用 liveModeBlock（缺失=FAIL/static=FAIL/畸形=ERROR，live 的 mode 元字段 diff 前剥除）；F03 由 relation 重写承担 |
| 零扫描可见性（1.27/1.28） | 随文风检查器同批 | conventions 规则级 scope-empty + symbols 扫描面零文件 → error（与 writing-style 同口径） |

实施过程实锤并修复的本地暗坑：①service.mjs 注册 SIGKILL handler 在 Node 即抛
（SIGKILL 不可捕获）；②demo runner `process.exit` 不跑 finally——注入文件清理必须
退出延后；③文风样例标记 `qgate-style:example` 原实现为全文级豁免（样例行在文档任何
位置关掉整份检查），收敛为行级豁免；④requireLive 开启时 live 观察的 mode 协议元字段
若不剥除，观察必然漂移。四坑均为测试/走查逮住后当场根治。

## 4. 吸收实施与验证（2026-10-08）

- **内核**（overlay commit `08f09b1`）：`sources.ts` 新模块 + types/run/command/behavior/traceability/report/cli/parse 全链；parse 白名单透传 `caseOutcomes`/`sourceSignal`/`domain`（fail-closed 形状校验）。测试 `__tests__/qgate-v131-absorb.test.ts` 13 例（来源四桶正反例/绑定四形态+畸形 fail-closed/预算执法/报告呈现九断言），qgate 套件 **177/177 绿**。
- **SwarmStudio**（overlay commit `56dcd5c`）：verdicts 端点 + 桥接线 + 两处 UI + `qgate-bridge-state.node.ts` 拆分（浏览器 bundle 不得含 node:fs——**走查实锤的真缺陷**：DeliveryCasesView 接线后 vite externalize 在 import 绑定即抛，拆分后零控制台错误）。server/client 新增 6 用例全绿。
- **实机验证**（热更新链路，本仓纪律不装机）：
  - CLI 实跑：`qgate run L1.symbol-grounding` → `PASS [来源 核验]`；`status` → 来源分布行+advisory 行+成因行；`release-report` → 来源列/分布行/声明关联/Advisory 节/纪律句全渲染（`/tmp/rel-report.md` 实录）。
  - 浏览器走查（playwright @ :8649）：治理健康页实况条真实数据（G3:pass、G4:conditional、来源分布 核验1·声明0·降级0·无信号0，API 200）；交付案例页诚实空态；零控制台错误。截图 `/tmp/walk/{gov-strip.png,walk-cases.jpg}`。
- **全量回归**：overlay vitest 542 文件 3930 用例，2 例全量并发下的负载 flake（decisiongraph python 集成 8s 预算、orchestrate-editor UI 用例）——均单跑通过、且不在本次改动面，与吸收无关（如实现象如实记录）。

## 5. 边界与注记（如实）

- 来源分类是**实测信号的展示**，不是新采集协议：无信号的 PASS 不代表低风险（上游 W11 同义）；本地"核验"桶覆盖面（内核计算类 executor）比上游来源列更宽——因为本地架构里 behavior/contract/semantic/ops 判定本就全部在内核 TS 内计算，这是方言差异不是夸大。
- AC 用例绑定的身份源当前为 command+rawOutput（TAP/JUnit 逐点）与 behavior cases 两协议；其他 evidence 形状无逐用例身份协议即落 acCaseMissing——如实边界（上游 1.31.0 同款声明），要求 runner 先声明逐用例协议再谈绑定。
- "AC 语义与用例对应"（这条用例真证明了这条验收吗）仍属人工评审面——绑定复核封的是"凭无关成功门禁放行"。
- 旧 run（无 domain/sourceSignal 字段）在治理端如实缺省：域空 → G4 保守兜底（与桥 toDeliveryGateContent 同规则）；来源桶不入桶。
- 预算执法最小方言未做"登记内嵌 runner 预算并入"（上游 F01 的 registry 面本地不存在登记内嵌 runner 形态）。
