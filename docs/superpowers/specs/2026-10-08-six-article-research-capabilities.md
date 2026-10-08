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

1. **交互式审批桥**：assist 档确认点当前=拒绝+人话指引（Agent 转达人工走审批流后重试）；理想形态=deny 转挂起→审批通过自动续跑（需引擎瀑布支持挂起语义，ekko 侧扩展）
2. **会话级权限模式存储**：permmodes v4 缺口的存储面（当前仅环境级全局模式）；需 sessions 表列或独立存储 + UI 切换器
3. **MCP 工具细分类**：未知工具按 write 保守归类，MCP 目录（工具元数据）可提供更细类别

## 四、验证记录

- 单域测试：incident 20 + autonomyladder 3 + tool-semantics 6 + evidence 41（含 chain 7/gaps 2）+ govbus 7 + virtual-pnl 6 + eval-calibration 6 = 新增 89 用例全绿
- 全量套件：feat 3994 passed / 1 failed——该失败（qgate-v131-deferred OpenAPI CLI 冒烟）在 main 上逐字复现（dist 构建态既有问题），非本轮回归；main 基线本身另有 ~99 注入态/环境类既有失败（两分支失败清单差集=1 个 python 集成 flaky，单跑全过）
- inject：000-579 全量重放 0 失败；.overlay-injected.json 登记 303 条
- 端到端 HTTP 冒烟（一次性 Koa 实例挂载真实 registerRoutes，免 auth）：10/10 探针 200（含 PUT 写路径 + govbus 实时事件 + virtual-pl 真实数据 orchestrator 交付 116 件）

## 五、坑与纪律沉淀

1. **vitest ESM 下动态 require 会静默失败**：require 加载含 import 语句的 TS 模块抛错被 fail-soft 吞——跨域桥一律用动态 import().then().catch()
2. **describe 体在收集阶段立即执行**：fixture 依赖的 report 构造必须放 beforeAll（本轮 incident 测试首跑 7 败的根因）
3. **manifest 写在 inject 末段**：中途 exit(1)（如坏 patch）会让"树上已应用但 manifest 停旧"——修复路径=逆序 git apply -R 差量 → clean → 全量重放，勿手改 manifest
4. **手写 patch hunk 计数不可靠**：一律基准副本 + git diff --no-index 出增量（本轮 577 首版手写 corrupt 的教训）
5. 双会话现场保全：overlay 遗留 CSS（plan-html）与 upstream 半成品（openMatrixChat 无模板引用）均已 stash 留名，未销毁
