# QGate 通用交付门禁框架设计 v0.2（修正与落地方案）

日期：2026-09-23
状态：**P0-P9 + 收尾件全部收口**（同日两轮；第一轮 P0-P4 见 `evidence/20260923-p0..p3p4`，第二轮 P5-P9 + Release Evidence Package + Claude Code 适配见 `evidence/20260923-p5-p9`；38 例单测并入 overlay 套件）
受众：QGate 实施者与评审者；SwarmStudio 维护者
上游依据：《Universal Delivery Gate Framework for ZCode》Draft v0.1（原文 `ncwk/docs/universal-delivery-gate-zcode-design-v0.1.md`，来自 ~/Documents）
本文定位：v0.1 的修正案与落地方案，不重复其方法论论证；与 v0.1 冲突处以本文为准

## 0. 三句话主旨

把 v0.1 的 Claim/Evidence/Gate/Risk/Exception 元模型 + L0-L5 质量域落地为 `overlay/custom/qgate/` 内的可运行框架：ZCode Plugin 首发适配、CLI 为基础接口、内核平台无关。v0.1 的 ZCode 集成声称经源码级核查全部属实，但遗漏 5 个硬约束（Stop 续跑预算 3 次、60s 超时、32KB 输出上限等），本文修正其 Stop 门禁设计并补降级阶梯。另增与仓库既有交付体系（G1-G6 / 证据三级 / delivery-protocol v2）的语义对齐层，消除双标准风险。

## 1. 三项裁定（用户 2026-09-23 拍板）

| # | 分叉 | 裁定 | 落点 |
|---|---|---|---|
| D1 | 代码落位 | `overlay/custom/qgate/`（与 server/、client/ 同级；独立 package.json 自管依赖） | 独立产品开发于 overlay 仓内，feature 分支合 main 走 workspace 规则 |
| D2 | 对齐深度 | 语义对齐层：verdict 增 CONDITIONAL、Profile↔tier 三档映射、证据强制 exercised 级、Claim 概念承接交付标准；**不做** Matrix 事件桥接（留 zcode-engine R4 后） | §4 |
| D3 | 首期范围 | Phase 0-4：Spike → 最小内核 → 修复闭环 → Profile+Impact → Persistence Gate + Payment Demo | §6 |

## 2. ZCode 集成事实核查表（源码锚点，upstream/zcode @872ad96）

v0.1 §83 全部声称属实，逐条锚点：

| v0.1 声称 | 锚点 |
|---|---|
| 7 个 Hook 事件（SessionStart/UserPromptSubmit/PreToolUse/PermissionRequest/PostToolUse/PostToolUseFailure/Stop） | `apps/zcode-cli/packages/contracts/src/hooks/index.ts:7-15` |
| `.zcode-plugin/plugin.json` 清单（另兼容 `.claude-plugin`/`.codex-plugin`） | `apps/zcode-cli/packages/adapters/src/plugins/index.ts:100-102` |
| `hooks/hooks.json` 自动发现 | `apps/zcode-cli/packages/adapters/src/plugins/hook-sources.ts:8` |
| stdin JSON / stdout JSON / exit code 协议 | `apps/zcode-cli/packages/core/src/hooks/configured-runner-callback.ts:29-68` |
| PreToolUse allow/deny/改输入 | `contracts/src/hooks/index.ts:166-170`（permissionDecision + updatedInput） |
| Stop 阻断并让 Agent 续跑 | `apps/zcode-cli/packages/core/src/hooks/output.ts:37-47` |
| 插件专属数据目录 | `ZCODE_PLUGIN_DATA` env，`core/src/hooks/configured-runner-input.ts:74-98` |
| 项目级 hook 需信任确认，插件才是分发通道 | `contracts/src/hooks/workspace-hook-trust.ts:14-29`（pending_trust/trusted_persistent 状态机） |

## 3. v0.1 遗漏的 5 个硬约束（本文修正案）

1. **Stop 续跑预算 = 3 次**：`MAX_STOP_HOOK_CONTINUATIONS = 3`（`core/src/runtime/methods/hooks.ts:10`），且续跑要求 `additionalContexts.length > 0`（:125-127）。v0.1 只说"存在次数限制"。→ **降级阶梯设计**（§5.3）：第 1-2 次阻断给修复指令；第 3 次（最后预算）阻断时附带"本轮放行后将登记 Risk"；预算耗尽放行 + Risk 落盘 + 状态标记 degraded。永不无限循环。
2. **Hook 默认 60s 超时 + 32KB 输出上限**（`contracts/src/hooks/index.ts:425-430`；per-hook `timeoutMs` 可调）。→ **Stop 钩子只做轻检查**（证据新鲜度 + 覆盖度，目标 <5s）；重执行放命令面（`/qgate-run` 命令触发 agent 跑 CLI）与 `async: true` 后台钩子。v0.1 §34.6 的"Stop 里跑 required Gate"不可行，修正。
3. **exit code 2 = block**（`configured-runner-callback.ts:127-129`；exit 0 + stdout JSON 为富通道）。→ QGate 钩子统一走 stdout JSON（决策富语义），不依赖 exit 2。
4. **stdin 附带 `transcript_path`**（transcript.jsonl 临时文件，`configured-runner-input.ts:29-33`）。→ Evidence provenance 免费来源：Stop 钩子把 transcript 路径记入 run 元数据。
5. **`hooks.enabled` 全局开关默认 false**（`contracts/src/hooks/index.ts:426`；settings schema `adapters/src/config/schema.ts:266-289`）。→ 插件 README 首步即写启用指引；安装自检命令检测该状态。

另实证两条对实施有利的事实：三方插件 hook 默认放行无额外信任门槛（`plugins/index.ts:366-371`）；本机已有 inline 本地插件先例（rtk-zcode-bridge 直置于 `~/.zcode/cli/plugins/<name>/`），开发期安装 = 目录放置，`${CLAUDE_PLUGIN_ROOT}`/`${ZCODE_PLUGIN_ROOT}` 变量在 hooks.json 命令里可用。

## 4. 语义对齐层（D2 裁定落地）

与 `~/.hermes/delivery/`（交付标准 v1.3.0）及 `overlay/custom/client/matrix-teams/delivery-protocol.ts`（协议 v2）三系统对齐，QGate 定位 = 交付标准的**机器执法层**：

### 4.1 verdict 六态（v0.1 五态 + CONDITIONAL）

`PASS | FAIL | CONDITIONAL | INCONCLUSIVE | WAIVED | NOT_APPLICABLE`

- CONDITIONAL 为新增：对应交付标准 G4 与 delivery-protocol v2 的 `conditional`（"必须写解除条件"，`~/.hermes/delivery/03-gates.md:27`）；**CONDITIONAL 必填 `conditions: string[]`**（schema 强制），否则解析失败。
- 三系统映射：标准 pass/conditional/reject ↔ QGate PASS/CONDITIONAL/FAIL ↔ Matrix gate verdict pass/conditional/reject（`delivery-protocol.ts:159`）。WAIVED ↔ Exception 放行；INCONCLUSIVE 为 QGate 特有（证据不可得），映射 Matrix 时降级为 conditional + reason 说明。

### 4.2 Evidence 强度：exercised 纪律

交付标准证据三级 present/wired/exercised（`DELIVERY-STANDARD-COMPLETE.md:129-135`）映射为 Evidence `execution` 字段：

- `present`：工件存在（断言文件在，未执行）——只算占位；
- `wired`：已接入执行链（命令配置存在，本轮未跑）——只算占位；
- `exercised`：本 Run 真实执行并落盘输出——**Policy 默认仅 exercised 级可判 PASS**（No Evidence ≠ PASS 原则的落地形式）。

v0.1 §31 的 independence 七枚举保留为正交维度（谁生成的证据），与 execution（证据跑没跑）不混用。

### 4.3 Profile ↔ tier 三档同构

| QGate Profile | 交付标准 tier | 语义 |
|---|---|---|
| `vibe-fast` | lite | 快速迭代，最小门集 |
| `feature-close` | standard | 任务收口全门集 |
| `high-assurance` / `release` | compliance | 含 ISO 27001 挂钩位 |

Profile 解析时携带 tier 别名（`profile.tier` 字段），报告与未来 Matrix 桥接直接使用标准词汇。

### 4.4 L0-L5 ↔ G1-G6 映射表（只做映射，不合并体系）

G1↔L0（需求冻结=范围与假设完整性）、G2↔L0.4+L2（设计评审）、G3↔L1（编码门禁）、G4↔L2/L3（验证=一致性+行为）、G5↔L4/L5（发布=非功能+运维就绪）、G6↔L5.6（复盘闭环）。Claim 模板的 `source.requirement` 字段允许携带 G 门编号，供人读追溯；机器不依赖。

## 5. 架构修正与落位

### 5.1 目录（`overlay/custom/qgate/`）

```text
custom/qgate/
├── package.json            # @ncwk/qgate，依赖仅 yaml；node:sqlite 走 Node ≥22.5 内建
├── tsconfig.json           # NodeNext ESM，与 overlay type:module 一致
├── src/
│   ├── core/               # 内核（平台无关，不知道 ZCode）
│   │   ├── types.ts        # Claim/Evidence/GateSpec/Profile/Run/Risk/Exception/verdict
│   │   ├── parse.ts        # 容错解析器（house style：isRecord/str/num，非法返回 null）
│   │   ├── loader.ts       # .qgate/ 发现 + gate-packs 内置 + YAML/JSON 双格式
│   │   ├── decision.ts     # 证据充分性/新鲜度/强度 → verdict
│   │   ├── policy.ts       # onFail/onInconclusive/allowWaiver/maxAge
│   │   ├── impact.ts       # appliesWhen glob 匹配 + 变更→适用门
│   │   ├── profile.ts      # Profile 解析 + enable/disable/override 合并
│   │   ├── store.ts        # .qgate/runs|evidence|risks|cache JSONL 存储
│   │   ├── run.ts          # Run 编排：executors → normalize → store → decide
│   │   └── align.ts        # §4 三表（verdict/execution/tier）
│   ├── executors/
│   │   ├── command.ts      # allowlist 门禁的命令执行器
│   │   └── persistence.ts  # sqlite 快照/字段断言/不变量（Phase 4）
│   └── cli.ts              # qgate plan/run/status/explain/evidence/risk/validate-config
├── plugin/                 # ZCode 插件（可分发面，见 §5.2）
├── gate-packs/
│   ├── engineering/        # basic-check（lint/test 包装）
│   └── persistence/        # persistence-integrity
├── examples/payment-demo/  # Phase 4 演示（单测绿但持久化门禁 FAIL）
└── __tests__/              # vitest（overlay 根 npm test 自动收）
```

### 5.2 插件面（`plugin/`，开发期 inline 安装）

- `.zcode-plugin/plugin.json`：name `qgate`（id 模式 `^[a-z0-9][a-z0-9._-]{0,127}$` 已核）。
- `hooks/hooks.json`：四事件——SessionStart（注入 Profile 约束声明，`additionalContext`）；UserPromptSubmit（初始化 Task Run，不阻断）；PostToolUse(matcher: `Write|Edit`)（收集变更，async 快速门可配）；**Stop（证据新鲜度+覆盖检查，输出 JSON decision）**。
- Stop 输出协议：`{"decision":"block","reason":"…","systemMessage":"…修复指令…"}`；reason 与 systemMessage 都会成为 additionalContext（`output.ts:44-45`），`stop_hook_active=true` 时进入降级阶梯第 3 级语义。
- `commands/`：`/qgate-status` `//qgate-run` `/qgate-explain`（Markdown 命令，指引 agent 调 CLI）。
- `skills/quality-gate/SKILL.md`：开发闭环纪律（先识别需求→显式假设→快速门→收口检查；skipped≠pass）。
- 钩子脚本调用 `${ZCODE_PLUGIN_ROOT}/../dist/cli.js`（开发期）或打包后 bin。

### 5.3 Stop 门禁时序（修正版，消化 3 次预算）

```text
Stop 触发（stop_hook_active 可知是第几次被自己续跑）
  → qgate status --fresh --json（<5s：只读 .qgate/ 索引，不执行门）
  → 全部 required 门有 exercised 级新鲜证据？
      是 → {"decision":"approve"}（不阻断）
      否 → budget = 3 - 已续跑次数
            budget > 1 → block + 修复指令（缺哪些证据、怎么补）
            budget = 1 → block + 指令 + "最后预算"警告
            budget ≤ 0 → approve 放行 + Risk 登记（degraded，状态非 PASS）
```

### 5.4 证据新鲜度（v0.1 §48 落地）

Evidence 关联 `commit / treeHash / affectedPaths / configHash / startedAt`；判定新鲜 = `treeHash` 一致 或（同 commit 且 affectedPaths 与变更集不相交）且 `age < policy.maxAge`（默认 24h）。`qgate status --fresh` 据此计算。

### 5.5 安全边界（v0.1 §50 落地）

- command executor 仅执行 `.qgate/` 内 Gate Spec 声明的命令；命令白名单 = repo 内声明的固定命令字符串（含参数），无 shell 拼接（`spawn` argv 模式）；`cwd` 锁定项目根。
- Secret 脱敏：Evidence 落盘前对输出做 env 值与常见 secret 模式打码。
- `.qgate/runs|evidence|risks|cache` 默认 `.gitignore`（本地执行数据）；`.qgate/qgate.yaml|profiles/|gates/` 入库（团队共享定义）。Profile 可选 `evidenceCommit: true` 把 evidence 归档进 git（对齐交付标准"证据落卡"）。

## 6. Phase 计划与验收门（D3：到 Phase 4）

| Phase | 内容 | 验收（硬标准） |
|---|---|---|
| P0 Spike | plugin.json + hooks.json + stop.mjs 最小插件；inline 安装；headless 回合 | v0.1 §56 五项 5/5：可安装/hook 出现/SessionStart 触发/Stop 注入反馈/日志可定位 |
| P1 内核 | types/parse/loader/decision/policy/store/run + command executor + CLI + engineering.basic-check 门 | 故意 lint 错 → CLI FAIL；修复 → PASS；同一门在 CLI 与 Stop 钩子双通道一致 |
| P2 闭环 | Stop 接 status --fresh；降级阶梯 | headless E2E：agent 写坏代码 → Stop 阻断 → 修复 → 放行；runs 记录 FAIL→PASS 两跳 |
| P3 Profile+Impact | vibe-fast/feature-close + tier 映射 + appliesWhen | 改 README 不触发 build 门；改 src 触发；affected-only 生效 |
| P4 Persistence | sqlite executor（快照 before/after + 字段断言 + 不变量）+ payment-demo | **单测全绿 + persistence 门 FAIL**（amount 写错列的植入缺陷被逮住）；证据六件套（request/response/before/after/field-diff/invariant）落盘 |

每 Phase 收口条件：单测绿 + 该 Phase 验收实证 + evidence 落 `custom/qgate/evidence/`（仓库内，对齐交付标准证据纪律）。

## 7. Open Decisions 裁决（v0.1 §77 五项全闭合）

| OD | 裁定 | 理由 |
|---|---|---|
| OD-001 格式 | YAML 授权 + 容错解析（JSON 为子集天然支持）；不做独立 JSON Schema 文件，解析器即校验器（house style：非法返回 null + 诊断） | 与 matrix-teams 协议文件同模式，测试即契约 |
| OD-002 存储 | JSONL/JSON 文件（.qgate/），不 SQLite | 对象模型未稳；node:sqlite 留给 P4 持久化验证器（那是被测对象不是存储） |
| OD-003 包结构 | 单 package（src/ 分域），P4 后再评估拆分 | overlay 仓内嵌开发，monorepo 过重 |
| OD-004 FIBO | 预处理语义索引（首版 9 概念小集） | 避免运行时 OWL 推理（本轮不实施，列 P5+） |
| OD-005 LLM | executor 插件，非内核依赖 | 内核保持确定性优先（v0.1 §4.3） |

## 8. 不做清单（终态：全部闭合）

第一轮"本轮不做"的五项中，四项在续轮落地；续轮剩余三项也在第三轮（用户指令"完成全部"）闭合：

- ~~Matrix delivery.gate 事件桥接~~ → **第三轮已落地**（不等 zcode-engine R4 的服务器统筹层，改为 client store 层直落）：`custom/client/matrix-teams/stores/qgate-bridge.ts`。换算表 QGATE_TO_DELIVERY 与 align 同源；INCONCLUSIVE 降 conditional 不冒 pass；`decidedBy=qgate-bridge` 机械来源不冒人；案例房从 delivery.case 事件学习，注册房兜底。读端复用 review-center 聚合投影，无需新读端。
- ~~api-contract/schema 专属门包~~ → **第三轮已落地**模板门模式：`api.contract-alignment`、`schema.migration-safety`（默认命令占位，项目覆盖为真实检查；未覆盖 → INCONCLUSIVE 诚实暴露，与 architecture.fitness 同模式）。
- ~~LLM Reasoner executor~~ → **第三轮已落地插件位**（OD-005 兑现）：`src/executors/llm.ts` + `gate-packs/llm/`。凭据 QGATE_LLM_API_KEY；**LLM 判定永不单独构成 PASS**（模型判 pass 强转 conditional）；不可用 → INCONCLUSIVE 不 crash；默认全 Profile 禁用。

至此 v0.1 路线图（Phase 0-9 + §82 研发基线 15 项）全部闭合。后续演进只在真实需求驱动下加门包/Adapter，框架形态不再扩。

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| Stop 3 次预算内 agent 修不完 | 降级阶梯第 3 次警告 + Risk 登记；`/qgate-run` 命令面让 agent 主动预跑，把 Stop 退化为确认位 |
| hook 60s 超时 | Stop 只读索引不执行；执行全在命令面（agent Bash 跑 CLI，无超时墙） |
| overlay 全量测试链被 qgate 拖慢 | qgate 测试不跑真实 zcode 回合；E2E 单独 script（`npm run -w custom/qgate e2e`），vitest 只收单测/集成 |
| yaml 传递依赖漂移 | qgate package.json 显式声明 yaml；加载器缺失时 INCONCLUSIVE + 诊断，不 crash |
| 双写 ~/.zcode 干扰宿主 | inline 安装目录名固定 qgate；E2E 用独立 cwd；测完可 `plugin disable` |
| v0.1 与本文冲突 | 冲突处以本文为准（§3 修正案）；v0.1 方法论部分（L0-L5、元模型、纪律三条）原样有效 |
