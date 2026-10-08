# 2026-10-08 六文调研能力落地：事故报告/防篡改/损益表/事件总线/校准度/自治阶梯

> 状态：已落地（feat/incident-governance-suite 分支，A–H2 全绿并入 main；H3 待单独开轮）
> 来源：六篇公众号文章调研（BCG Agentic AI 价值公式 / arXiv 2609.24515 Agent 事故报告框架 /
> 元认知与校准 / 赵汀阳思想语法 / 湖仓统一治理 / 金融科技 FDE）
> 本文是本轮能力完善的单一事实源；调研原文全文存 /tmp/wx_extract/（会话级，勿引用为长期锚点）。

## 一、六文 → 能力映射（一句话版）

| 文章 | 可迁移核心 | 落地件 |
|---|---|---|
| BCG 价值公式 | 六控机制、自治阶梯、AI 虚拟损益表 | H2 阶梯配置面、E 损益表、B 对账 |
| Agent 事故报告框架（arXiv 2609.24515） | 三类 17 要素、设计态≠运行态、语义鸿沟、反取证、证据/报告分层 | A 汇编器、B 对账、C hash 链、H1 语义层 |
| 元认知 | 校准度=自报把握 vs 实际命中 | G 校准断言（消费判词 p 留痕） |
| 赵汀阳思想语法 | 动词+因果建模（设计参考） | 不落功能项，记观察 |
| 湖仓统一治理 | 治理事件总线联动各域 | F 事件总线+双真实桥 |
| 金融 FDE | Product Gap vs Implementation Gap 二分 | D gapClass 分诊 |

## 二、落地清单（按 patch/域）

### A+B. incident 域（事故报告汇编器 + 自治度对账）— patch 577
- `custom/server/incident/`：types / sources（七源只读实取）/ report（17 要素汇编）/ markdown / controller / tool-semantics（H1）
- REST：`GET /api/incident/sessions/:id/report[.md]`、`/autonomy`
- 七源：messages 库、run-trace JSONL、工具审计账、审批历史、agentidentity、ekko 记忆审计、workflow 快照/实际执行
- B 对账：理论面（自治阶梯→身份白名单→审批历史，优先级递降）vs 实际面（轨迹/消息/审批窗口），四类偏差黄条
- 纪律：缺席要素如实标 absent 不造数；报告层最小暴露（内容预览≤160 字符、凭证只带标识、命令只取前 4 词）
- 测试：`incident/__tests__/`（13+7 用例，17 要素齐全/诚实降级/防泄露/双攻击面）

### C. evidence hash 链 — `GET /api/evidence/:taskId/chain`
- `hash(n)=sha256(prevHash + 规范化记录体)`；旧记录不回填（前链时代 unchained 如实呈现）
- 双攻击面覆盖：不重算哈希→hash_mismatch；重算掩蔽→下一条 link_broken；环形挤出断锚=anchor_dangling 不算篡改

### D. 缺陷二分法 — `gapClass` + `GET /api/evidence/:taskId/gaps`
- POST 收敛校验 `product_gap|implementation_gap`；untagged 如实计数；gapClass 入 hash 链覆盖面

### E. AI 虚拟损益表 — patch 578，`GET /api/hermes/virtual-pl`
- `harness/virtual-pnl.ts`：per-profile 成本面（session_usage×价目）∪ 交付面（kanban 实耗）
- 单位产出成本 delivered=0 时 null 不造单价；未收录模型入 unpricedRows
- 日成本异常（前 7 日均值×2，前窗零成本无基线不告警）
- 收益面：HERMES_PL_VALUE_MAP（JSON env）显式配置才有 L 侧，默认诚实缺席

### F. 治理事件总线 — patch 578，`GET /api/hermes/governance-events`
- `govbus/event-log.ts`：append-only JSONL（CAP 2000）+ 六域三级 + 进程内订阅（fail-soft）
- 双真实桥：审批裁决→approval 域（deny/reject→high）；证据 verdict=fail→quality 域 high
- 坑（本轮实测）：桥用动态 import 单例——vitest ESM 下 require 加载含 import 语句的模块会静默失败
- 只读查询面，不开公开 emit（防伪造事件流）；/compact 幂等裁剪

### G. Eval 校准度断言 — `eval/calibration.ts` → `aggregates.calibration`
- 消费 `AttemptVerdict.p`（判分器早留口）：10 桶分桶 / ECE / Brier / 大白话高估结论
- unknown 先剔除（非校准候选），无 p 如实缺席（samples=0 + 提示）

### H1. 工具语义层 — `incident/tool-semantics.ts`
- tool+实参→业务动作短语；白名单键 + 60 字符截断；敏感值绝不落语义层；未识别工具 null 降级
- 坐标级点击如实标"语义未留痕"（语义鸿沟的实例标注）

### H2. 自治阶梯 — patch 579，`/api/hermes/autonomy-ladder`
- `autonomyladder/`：insight/assist/auto 三档 + 人工确认点 + 最高风险档；auto 档与确认点语义矛盾拒收
- 配置变更发 govbus autonomy 事件（auto 档=warn）
- incident B 对账接入：理论面优先消费；偏差 0=配 insight/assist 但轨迹深度自主（黄条）

## 三、H3 执行面（v1 已落地，2026-10-08 当日追加轮）

**关键侦查结论**：patch 565 的引擎瀑布早已支持 preExecute 返回 `{allow:false}` 拦截（registry.ts 拒绝即短路、工具本体不执行）——H3 引擎通道本已就绪，缺的只是 overlay 钩子从"只观测"升级为"按策略裁决"。因此 **H3 v1 零新引擎 patch**，全部落在 overlay：

### 落地件：`toolpipeline/enforce-gate.ts`（挂进既有钩子链末位）

- **三级策略链**（先命中先裁决，阶梯优先于全局模式——具体配置胜出，口径已记测试注释）：
  1. 自治阶梯（per profile）：insight=只放 read 类；assist=放行但命中确认点（字面匹配或高危自动命中）即拒；auto=仅风险上限；风险超 maxRiskTier 恒拒（**硬边界先于软确认**——确认后仍过不了上限，先报硬边界更有行动性）
  2. 全局权限模式（`HERMES_TOOL_ENFORCE_MODE`，七档矩阵）：OFF 拒；RA 拒并指引走审批流（v1 无交互桥）
  3. 无配置不执法（不装已治理）
- **风险分档复用审批域单一事实源**（risk-tier.ts classifyCommand）；未知工具（含 MCP 动态）保守归 write 类
- **总闸 `HERMES_TOOL_ENFORCE=1` 才生效**（默认 0 零行为变化，对齐 toolresultguard 先例）；裁决面异常 fail-open
- **每次拒绝发 govbus security/high 事件**（type=tool.denied_<rule>）
- 验证：单域 13 用例 + **真实瀑布集成 3 用例**（注入树 registry × overlay 钩子：deny 短路时工具本体 executed.flag=false 实证）

### H3 剩余边界（后续轮，非本轮欠账）

1. ~~交互式审批桥~~ **已落（2026-10-08 H3 收口轮）**：执法门"需人工确认"类裁决（RA 档/阶梯确认点）自动挂审批单入收件箱（`enf:` 域，toolpipeline/enforce-approvals——callHash=tool+规范化入参+profile 幂等挂单）；人工批准后同调用重试即放行 **一次**（consume-on-pass 一单一执行，防批单无限重放）；deny 文案带单号指引。硬边界（OFF/风险上限/insight 只读）不经桥——批单不越权（H3 v1"硬边界先于软确认"延续，有测试钉死）。裁决落审批台账+收件箱 decide 路由（pending-controller `enf:` 分支）。**瀑布级挂起（2026-10-08 追加，理想形态达成）**：patch 565 瀑布 `await hook.preExecute` 无超时无 race（registry.ts 实证）——挂起钩子 Promise 即挂起调用本体。执法门确认类裁决（挂起开关 `HERMES_ENFORCE_SUSPEND`≠0，随执法总闸生效）原地等待：批准→consume→放行**续跑执行**（agent 无需重试）；否决→拒（文案如实）；TTL 封顶超时（缺省 30min，`HERMES_ENFORCE_SUSPEND_TTL_MS` 可调——方案 §4.3-26 活性等待必须有封顶）→拒但单留收件箱（批后重试即放行）；并发同调用消费竞态→如实拒并指引重挂。等待=轮询存储真值（跨进程裁决可达，拍距 `HERMES_ENFORCE_SUSPEND_POLL_MS`）+同进程 decide 即时唤醒；挂起/续跑/超时发 govbus approval 域事件。**剩余边界（进程面）+中间态缓解（已落）**：server 进程重启则挂起即断（票据留存、批后重试放行）。中间态已落——等待起/止各落一次 `waitingAt` 标记（挂起是人审级低频事件，两次写可忽略）；tool-hooks 装配面（server 启动）扫遗留 waitingAt 单→逐单发 govbus approval/warn `tool.enforce_suspend_lost` 提醒（含单号/工具/等待起点+"仍在收件箱批后重试"指引）并清标记（幂等，重启再扫不重报）。跨重启续跑本身仍需引擎侧回合级挂起持久化（独立轮，触发信号=执法常开+审批窗常被部署切断）
2. ~~会话级权限模式存储~~ **已落（2026-10-08 v4 会话档轮）**：per-profile 会话档=`permmodes/session-mode-store.ts`（env 目录 JSON 原子写，autonomyladder 同范式）；执法链升级 **阶梯＞会话档＞全局档**（会话档更具体恒胜全局，enforce-gate）；REST 查/切/清=`/api/hermes/permmodes/session-mode/*`（patch 581）。**引擎面实证接通**（upstream/zcode protocol-v4 command.ts）：createSession.config.mode（:39）建会话带档——mention-dispatch 建会话穿线 ENGINE_MODE_MAP；switchCollaborationMode（:216）会话内切档（引擎可切子集 build/edit/plan/yolo；auto 族仅建会话生效，REST 如实返 not_switchable）；PUT 带 sessionId+workspacePath 即发引擎切档信封。切档发 govbus autonomy 事件（auto/bypass=warn）。验证：permmodes/toolpipeline/zcode 三域 71/71
3. **MCP 工具细分类**：未知工具按 write 保守归类，MCP 目录（工具元数据）可提供更细类别

## 三点五、UI 化（同日追加轮，merge 69cee6ba）

四个治理面板挂进 /app/board 单层页签（用户可见面——REST 只是半成品）：

| 面板 | 组件 | 宿主页签 |
|---|---|---|
| 事故报告（会话选择→17 要素分组渲染→对账黄条→md 下载） | IncidentReportSection | 审计与变更 |
| 治理事件流（域 chips+严重级过滤，high 红徽标） | GovEventStreamSection | 审计与变更 |
| 虚拟损益表（成本区间/单位成本/异常/源缺席注记） | VirtualPnlSection | 工程效能（CostAccounts 同页） |
| 自治阶梯（三档表单；auto 档确认点置灰；执法门状态提示） | AutonomyLadderSection | 能力与规则 |

API 客户端 `custom/client/governance/api/incident-suite.ts`（DTO 即契约）。守门测试 `incident-suite-sections.test.ts` 7 用例（mock 渲染/降级诚实/三视图聚合浅挂载）。

**浏览器实测记录**（8649 热更新 + 重启后 8647，Playwright 直驱对齐 uioracle 先例）：四面板渲染零 console error；登录态下事故报告对真实会话完整生成（17 要素 3 采/2 部/12 缺）、事件流 200 行真实事件、损益表含真实 38 profile 行。截图存档 /tmp/ui-walkthrough/（会话级）。

**本轮实测坑**：
1. ts-node 全量编译（服务端启动）比 vitest 宽松模式严格——抓出 3 处真实类型缺口（enforce-gate/incident-report/virtual-pnl）。**结论：服务端新域必须过一次真实 8647 启动，vitest 绿≠可启动**。
2. 长页下方面板的 Playwright click 会被遮挡超时——DOM evaluate 直驱可绕（渲染断言已证时足够）。
3. 并行会话现场（report 域 untracked + series 580）会挡后端启动：只修其类型错一行（帮过编译、语义零变化），不碰其余现场、不代提交。
4. （续收轮实测）上条现场收口时 controller 误入 `__tests__/` 提交且未带 TS7053 修复，正本路径只剩 untracked 遮蔽——干净 checkout/inject 重放即挂。**两个盲区叠加**：服务端 tsconfig `exclude src/custom/**/__tests__/**` 让错位副本逃过编译守门；upstream 树（产物）已带修复造成"树是好的"错觉。修复=a1efb809 回移 69 行版归位。**结论：并行会话收口后必查 untracked 是否清零（`git status` 非空即有未回移正本的内容）**。

- 单域测试：incident 20 + autonomyladder 3 + tool-semantics 6 + evidence 41（含 chain 7/gaps 2）+ govbus 7 + virtual-pnl 6 + eval-calibration 6 = 新增 89 用例全绿
- 全量套件：feat 3994 passed / 1 failed——该失败（qgate-v131-deferred OpenAPI CLI 冒烟）在 main 上逐字复现（dist 构建态既有问题；**2026-10-08 下午已根治**：`__tests__/ensure-dist.ts` 前置自愈——dist 缺失/mtime 旧于 src 时原地 `npm run build`，文件锁防并发，4 个消费 dist 的测试文件 beforeAll 接入，merge 3d827c65），非本轮回归；main 基线本身另有 ~99 注入态/环境类既有失败（两分支失败清单差集=1 个 python 集成 flaky，单跑全过）
- inject：000-579 全量重放 0 失败；.overlay-injected.json 登记 303 条
- 端到端 HTTP 冒烟（一次性 Koa 实例挂载真实 registerRoutes，免 auth）：10/10 探针 200（含 PUT 写路径 + govbus 实时事件 + virtual-pl 真实数据 orchestrator 交付 116 件）

## 五、验证记录（A-H3 服务端轮）

1. **vitest ESM 下动态 require 会静默失败**：require 加载含 import 语句的 TS 模块抛错被 fail-soft 吞——跨域桥一律用动态 import().then().catch()
2. **describe 体在收集阶段立即执行**：fixture 依赖的 report 构造必须放 beforeAll（本轮 incident 测试首跑 7 败的根因）
3. **manifest 写在 inject 末段**：中途 exit(1)（如坏 patch）会让"树上已应用但 manifest 停旧"——修复路径=逆序 git apply -R 差量 → clean → 全量重放，勿手改 manifest
4. **手写 patch hunk 计数不可靠**：一律基准副本 + git diff --no-index 出增量（本轮 577 首版手写 corrupt 的教训）
5. 双会话现场保全：overlay 遗留 CSS（plan-html）与 upstream 半成品（openMatrixChat 无模板引用）均已 stash 留名，未销毁
