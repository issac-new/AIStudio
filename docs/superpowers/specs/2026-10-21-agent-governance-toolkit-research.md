# 微软 Agent Governance Toolkit 调研与 Swarm Studio 吸收方案

日期：2026-10-21。状态：方案待用户裁定，未落地。

## 结论

调研对象真实存在：`microsoft/agent-governance-toolkit`（下称 AGT）。2026-10-21 实核 GitHub 页面：约 6.4k star，MIT 许可证，Public Preview，v4.1.0。核心思想一句话：在每次工具调用前插一道确定性闸门。违规动作因此在结构上不可能发生，而不是「不太可能发生」。

对账结论：Studio 的审批流、审计覆盖、证据导出三面已强于 AGT 对应物。但有四个实质差距，见第三节。文章最尖锐的批评，在 Studio 同样成立。治理配置没生效时，产品面没有一处常驻的「实际生效值 vs 期望值」对账。仪表盘区分不了真治理与裸奔。

2026-10-16 的安全检查报告实锤过此问题：49 个 profile 全量工具集、默认 profile 审批 off、执法总闸未开。取证靠人工，不是产品端点。

建议本轮吸收三件套（方案 A/B/C）：治理姿态对账面、审计链防篡改推广、未注册 agent 发现。约一个落地轮工作量。方案 D/E/F 列为次批，G 类明确不做。

## 一、调研对象与置信度

文章：《微软 Agent Governance Toolkit 拆解：把「请 AI 守规矩」换成「让 AI 没法不守规矩」》。公众号 Wester 的 AI 安全札记，2026-09-28 发布。地址 https://mp.weixin.qq.com/s/0T_EfOcuWrIkYP6vx-7Ktg ，原文地址 https://we5ter.github.io/ai-tools/agent-governance-toolkit/ 。

置信度分两档，如实声明：

- 已实核：仓库存在，MIT，Public Preview，五语言 SDK（Python/TS/.NET/Rust/Go），star 量级与文章一致。
- 转述未逐条核：文章自注「由 AI 生成，内容可能存在错误」。具体数字（992 条一致性测试、408 行 LIMITATIONS.md、六套合规映射深度）未逐一验证。本文不依赖这些数字做决策，只吸收设计思想。

## 二、AGT 核心思想拆解

AGT 立论于三个问题：这个动作允许执行吗？是哪个 agent 干的？你能证明发生了什么吗？对应四层能力：策略执行（verdict 四态 allow/deny/transform/require_approval）、零信任身份、执行沙箱、可靠性工程。

对 Studio 有镜鉴价值的设计取向有四条：

1. **确定性优于概率性**。README 原话：「提示词层的安全不是控制面，只是对一个随机系统的礼貌请求」。拦截点在应用代码里、模型意图到达执行之前。提示词写得再巧，策略引擎的判定不变。
2. **失败即关闭（fail-closed）**。求值异常即拒绝。生产建议 strict 模式：默认拒绝，每条许可动作显式放行。
3. **防篡改审计**。Merkle 审计链记录三件事：当时生效的策略、agent 请求了什么、判定结果。
4. **治理状态真实性**。AGT 红队批评最多的一条短板：策略没加载时默认放行，仪表盘照样显示 governed。官方缓解是 strict 模式，加 `agt audit` 查实际加载的策略。

文章第七章另有三条边界值得镜鉴：审计只记尝试不记结果。治理的是动作不是推理，两个各自合法的动作可以串成非法链。kill switch 是合作式机制，不是保命符。

## 三、Swarm Studio 现状对账

盘点范围：overlay 全部治理代码（2026-10-21，锚点为当前行号）。

### 已强于 AGT 对应物（不动）

| 能力 | Studio 现状 | 对 AGT 的优势 |
|---|---|---|
| 审计的尝试与结果 | tool-audit pre/post 成对记录（`custom/server/toolpipeline/tool-hooks.ts:35-67`），post 记 ok/error/durationMs/errorCategory | AGT 只记尝试不记结果，官方承认的缺口 |
| 审批工作流 | 双层。hermes 运行时三模式（`upstream/hermes-agent/tools/approval_context.py:213-253`，旁路默认拒绝）加 overlay 收件箱（`custom/server/approvals/pending-controller.ts:359-606`，风险三档、一单一执行） | AGT 的 require_approval 只是 verdict 态，无完整收件箱 |
| 证据导出 | evidence hash 链加 verify（`custom/server/evidence/evidence-store.ts:209-231`）、eval 密封集、incident report.md、qgate verdicts | 多源可导出 |

### 有对应物但有实质差距（本方案要补）

1. **治理状态真实性：弱**。执法链存在，含身份白名单、沙箱硬边界、自治阶梯、权限模式（`custom/server/toolpipeline/enforce-gate.ts:272-386`）。但总闸 `HERMES_TOOL_ENFORCE` 默认关，无配置即放行，内部异常也放行（:543-545）。产品面无常驻端点显示每 profile 的实际审批模式、执法闸状态、已加载规则数。与配置期望值的偏差不可见。该问题即 AGT 红队批评的「governed 假信号」。
2. **审计防篡改：弱**。仅 evidence 一处有前向 hash 链。执法决策账（`custom/server/toolpipeline/policy-decisions.ts`，放行与拒绝都落账）、审批决策日志（`custom/server/approvals/approval-log.ts`）、治理事件总线（`custom/server/govbus/event-log.ts`）都是 append-only 但文件可改，无链无签名。
3. **未注册 agent 发现：弱**。仅有 D2 槽位膨胀检测（网关 active_agents 与注册表差值，`custom/server/clusterinspector/detectors.ts:187-199`），无进程扫描。多机环境里「这台机器上跑着几个 agent」没有权威答案。
4. **MCP 配置漂移检测：缺**。MCP 目录化与工具级禁用存在（`custom/server/mcpcatalog/mcp-catalog.ts`），skill 三段扫描（密钥、反弹 shell、供应链规则）也存在。但工具清单与描述的变更无快照比对，工具描述投毒不可见。
5. **kill switch 语义：弱-中**。会话中止是合作式 abort，有 abort.completed 确认事件（`upstream/hermes-studio/packages/server/src/modules/studio/sockets/chat-run.ts:1273`）。但无跨 profile 一键停止，无停后独立活性复核。预算 block 只拦下一次工具调用，不杀正在跑的 run。这是设计而非缺陷，但产品面没把该语义讲清楚。
6. **fail-closed 姿态：缺**。执法面刻意 opt-in（2026-10-16 整改方案 v2 裁定零阻断先预警）。求值异常与无配置均放行。

## 四、吸收方案（编号待裁定）

### A. 治理姿态对账面（建议优先）

吸收 AGT「治理状态真实性」教训，做成产品能力而非人工检查。

- 端点 `GET /api/governance/posture`：按 profile 汇总实际生效值，再与注册表期望值比对，输出偏差清单。汇总四项：
  - 审批模式实际值（读 profile config.yaml）。
  - 执法总闸开关。
  - 各域已加载规则数（身份白名单、沙箱根、预算策略、工具黑名单逐域计数）。
  - fail-open/fail-closed 语义标注。
- UI：治理中心新增 PostureSection。每 profile 三态灯（真治理、部分、裸奔）加偏差明细。「已治理」徽标只在实际生效时显示。
- 代价：中。一个端点、一个组件，各域读取函数多数已有，以聚合为主。
- 验收：把任一 profile 的 config 改为 mode off，面板一分钟内变红，不需要人工取证。

### B. 审计链防篡改推广（建议优先）

把 evidence-store 已验证的前向 hash 链模式（`hash(n)=sha256(prevHash|canonicalJSON(body))`）推广到两本主账：执法决策账、审批决策日志。各加 verify 端点。治理中心审计视图显示 intact/firstBroken 状态。

- 代价：低到中。模式在 evidence 域验证过，属移植加测试。
- 边界：只对新写入条目建链。历史条目不回填，链起点如实标注。

### C. 未注册 agent 发现（建议优先）

巡检官新增检测器：扫描本机进程中的 hermes 指纹（命令行特征），与注册 profile 及网关 active_agents 对账。发现未注册进程即报 govbus security 域事件。照 D2 槽位膨胀检测器的既有样式实现。

- 代价：低。检测器框架成熟，加一个 collector 和一个 detector。
- 边界：只扫本机。多机环境靠 fleet 上报聚合，本轮不做远程扫描。

### D. MCP 工具清单漂移检测（次批）

mcpcatalog 定期快照各 server 的工具清单与描述 hash。变更即产生 govbus security 事件。驾驶舱安全告警区显示差异，分新增、移除、描述变更三类。

- 代价：低到中。快照存储、比对函数、一条检测器。

### E. 全局紧急停止加停后活性复核（次批）

驾驶舱新增一键停止：跨 profile 并发发 abort，N 秒后复核 fleet 快照与会话状态，未停的标红。界面明示语义为合作式中止（AGT 的诚实表述：kill switch 不是保命符），不承诺强杀。

- 代价：中。涉及 socket 层与复核定时器。

### F. fail-closed 可选姿态（待裁定，涉及设计哲学）

执法门新增 `HERMES_TOOL_ENFORCE_STRICT` 选项：开启后求值异常或无配置改为拒绝。默认行为不变（仍 opt-in），只增加可选项。

- 代价：低（enforce-gate.ts 判定分支加测试）。
- 需要裁定的原因：2026-10-16 整改方案 v2 用户已裁定「零阻断、只观测」。strict 是该裁定的反向选项。默认姿态不擅自改变，只把选择权做成开关。

### G. 明确不做（Non-goals）

- **transform 态（参数改写后放行）**：需理解各工具语义才能安全改参。误改比拒绝更危险，v1 不做。
- **统一策略 DSL**：Studio 已有五域治理台账作单一事实源（`overlay/runtime/governance/*.yaml` 加 validate 面）。再造一套策略语言是重复建设。
- **引入 AGT 依赖**：AGT 处于 Public Preview 且 API 漂移期。Studio 为 TS 自有运行时，吸收思想不引包。

## 五、决策记录

- 2026-10-21 调研轮：文章与仓库实核完成，能力盘点与差距对账成文。方案 A-G 等待用户裁定执行范围。
- 2026-10-21 用户裁定：「全做」。A-F 六件同轮落地（分支 feat/agt-governance，worktree 隔离）：
  - **A 姿态对账**：`custom/server/governance/posture.ts` + `GET /api/governance/posture` + PostureSection（阶段⑥新页签「治理姿态」）。三态灯语义：显式 manual/smart=已治理、显式 off=裸奔、未声明=部分（生效=上游默认 smart，如实标注不冤枉）。期望值走 `~/.hermes-web-ui/posture-expectations.json`（运维手编，缺省只报实际值不编造期望）。
  - **B 审计链**：`custom/server/auditchain/forward-chain.ts` 共用件（evidence 模式抽干），执法决策账与审批决策日志写入即入链，`GET /api/harness/policy-decisions/chain` 与 `GET /api/approvals/history/chain` 校验端点。跨日连续续链；轮转/裁剪/留存断锚如实标 anchor_dangling 不算篡改；前链时代记录标 unchained。
  - **C Shadow agent**：`custom/server/clusterinspector/process-scan.ts`（ps 采集+指纹判定纯函数）+ `detectUnregisteredAgents`（security.shadow-agent，未注册 profile=high、无法归属=warn），挂入巡检官快照与 detectAll。
  - **D MCP 漂移**：`custom/server/mcpcatalog/mcp-drift.ts` + `GET/POST /api/harness/mcp-drift(/snapshot)` + `detectMcpDrift`。监 mcpconfig 目录与 hermes 插件目录两面；基线显式 rebase 才更新。边界如实：漂移=名单与内容 hash 级；「描述语义判读投毒」v1 不做（判读需理解内容）。
  - **E 紧急停止**：`abortFleetSession`（复用 upstream abortSession 公开方法，零 patch）+ `emergencyStopAll`（并发 abort 在跑/排队会话→等 3s→fleet 快照复核→govbus system/high 留痕）+ `POST /api/governance/emergency-stop`（confirm 闸=字面 STOP-ALL）+ EmergencyStopSection（复核仍在跑的标红，界面明示合作式语义）。
  - **F strict 姿态**：`HERMES_TOOL_ENFORCE_STRICT=1` 时无任何策略配置→strict-deny、裁决面异常→fail-closed 拒。默认行为零变化（opt-in 与 fail-open 原样，2026-10-16 整改 v2「零阻断」裁定不被擅动）；strict 不越总闸。
  - 验收：新增 35 测（F5/B12/A3/C8/D3/E4）全绿；全量回归 custom/server 2719 通过 0 失败、custom/client 2598 通过 0 失败（raw-hex 预算闸 8 处裸 hex 改 rgb 记法后过）；typecheck:harness 0 错。激活待办：8647/8649 由并行会话占用（后端 cwd=共享 upstream 树、vite cwd=主树），本轮未重启活体，合入 main 后由下次服务重启生效。

