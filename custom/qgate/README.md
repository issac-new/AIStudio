# QGate — 通用交付门禁框架（Universal Delivery Gate）

面向 Code Agent 的可裁剪软件交付质量门禁：**没有证据不得 PASS**。
设计文档：`overlay/docs/superpowers/specs/2026-09-23-qgate-universal-delivery-gate-design.md`（v0.2，上游 v0.1 见 `ncwk/docs/universal-delivery-gate-zcode-design-v0.1.md`）。
状态：**P0-P9 + 收尾件收口；2026-09-24 复盘轮修复虚报项**（§34 三钩子重写为可用、§49 缓存真接线、overlay 仓内嵌 .qgate/、demo 补齐、MCP schema 1210 事故修复 8cbcfa1）。

## 组成

```text
custom/qgate/
├── src/core/         内核（平台无关）：Claim/Evidence/Gate/Risk/Exception + 判定 + 存储 + Profile + 影响分析 + 语义对齐层 + 发布证据包 + §49 缓存（已接线 runGate）
├── src/executors/    command（argv 白名单）/ persistence（SQLite 快照断言不变量）/ ontology（语义检查）/ files（制品存在性=present 级）/ llm（插件位，永不单独 PASS）
├── src/ontology/     OntologyProvider 接口 + FIBO 预处理索引加载 + MockProvider
├── src/cli.ts        CLI：plan / run / status / explain / evidence / risk / waive / exceptions / release-report / validate-config / init
├── src/mcp-server.ts MCP stdio 服务（gate.plan/run/status/get_evidence/get_failures/get_risks/explain 七工具，零依赖手写）
├── plugin/           ZCode 插件（六事件钩子：SessionStart/PreToolUse/UserPromptSubmit/PostToolUse/PostToolUseFailure/Stop；命令×5 + 技能 + MCP）；.claude-plugin 双清单兼容 Claude Code
├── gate-packs/       engineering / persistence / ontology / security / architecture / delivery / api-contract / schema / llm + _profiles 四档
├── examples/         golden scenarios×5 + payment-demo
└── __tests__/        vitest（overlay 根 npm test 自动收）
```

## 快速开始

### 本仓已内嵌（零 init）

`overlay/.qgate/` 随仓走：clone 即生效，SessionStart 自动注入约束、`/qgate-run` 可跑。
档位为 advisory（basic-check `policy.warn`）——全量套件结果受 upstream 注入态影响，稳定后可切 `block`。

### 其他项目启用（项目级 opt-in）

```bash
cd <你的项目>
node overlay/custom/qgate/dist/cli.js init     # 便捷骨架生成（可选手工建 .qgate/qgate.yaml 等价）
node overlay/custom/qgate/dist/cli.js validate-config
node overlay/custom/qgate/dist/cli.js run --all
```

项目无 `.qgate/` 时，插件与 CLI 全部静默放行——注册全局插件不影响其他项目。

### 安装 ZCode 插件（inline 开发态）

```bash
# 1. 构建
cd overlay/custom/qgate && npm install && npx tsc -p tsconfig.json

# 2. 注册 inline 插件（写入 ~/.zcode/cli/config.json 的 plugins.dirs）
#    "plugins": { "dirs": ["/abs/path/to/overlay/custom/qgate/plugin"] }

# 3. 启用 hooks（zcode 全局开关默认关，~/.zcode/cli/config.json）
#    "hooks": { "enabled": true }

node <zcode>/dist/zcode.cjs plugin list   # 应见 qgate@inline [enabled] hooks: 6
```

### Payment Demo（单测绿 ≠ 数据对）

```bash
cd overlay/custom/qgate/examples/payment-demo
npm test                                             # unit 5/5 pass（响应契约正确）
node ../../dist/cli.js run data.persistence-integrity # FAIL：amount 10000 ≠ 100（field-diff + invariant 双证据）
sed -i '' 's/amount \* 100/amount/' db.mjs            # 修复植入缺陷
node ../../dist/cli.js run data.persistence-integrity # PASS
```

## 判定语义（六态）与对齐

`PASS | FAIL | CONDITIONAL | INCONCLUSIVE | WAIVED | NOT_APPLICABLE`

- CONDITIONAL 必带解除条件（对齐交付标准 G4 与 matrix-teams delivery-protocol v2 的 conditional）。
- INCONCLUSIVE：证据不可得 ≠ 通过（executor 起不来、工具缺失都落这里，Framework ERROR 不是 Gate FAIL）。
- WAIVED：有有效豁免（`qgate waive`，必填 reason/approver，默认 24h 过期，**不抹除原判定事实**）；`allowWaiver:false` 的门拒绝豁免。
- 证据强度三级 present/wired/exercised：**仅 exercised 可支撑 PASS**（对齐交付标准 §4.3；files executor 只产 present 级——文件在 ≠ 真跑过）。
- Profile 四档 ↔ 交付标准 tier：vibe-fast↔lite、feature-close↔standard、high-assurance↔compliance、release（发布档=全域+交付门）。

## 语义门（Ontology，默认关闭）

`.qgate/qgate.yaml` 配置后显式启用：

```yaml
ontology:
  provider: fibo          # fibo | mock | off
  mappings:
    - conceptId: fibo-capture
      fields: [payment.capturedAmount]
```

确定性三查（无 LLM）：字段级术语歧义（映射到 Capture 的字段名内嵌 settled）、同文件混用 distinctFrom 概念（captured/settled 同文档）、概念错配。finding 一律 warning 级 → CONDITIONAL 带解除条件（v0.1 §63）。Provider 不可用 → INCONCLUSIVE 不 crash。

## Golden Scenarios（examples/，v0.1 §68）

| demo | 预期 | 实测 |
|---|---|---|
| demo-clean | PASS | ✓ PASS |
| demo-lint-fail | FAIL（lint-result:fail，退出码 1） | ✓ FAIL |
| demo-inconclusive | 证据不可得 → INCONCLUSIVE（warn 档呈现 CONDITIONAL，explain 可见 spawn ENOENT） | ✓ |
| demo-persistence-mismatch | 单测绿 + 持久化门红（field-diff + invariant） | ✓ |
| demo-semantic-mismatch | FIBO 术语歧义 → CONDITIONAL（terminology-ambiguity[docs/prd.md]） | ✓ |

## 缓存与增量执行（§49，已接线 runGate）

cache key = 门版本 + executor 面 + 输入锚（commit/treeHash/变更集）+ 门配置 + 环境；同输入二跑命中（execution=cached，判定不变）；输入或配置任一变化即 miss 重跑。缓存 FAIL 语义保持（不因缓存虚报 PASS）。守门测试 `__tests__/qgate-cache.test.ts` 3 例。

## MCP 工具面

插件自带 `plugin:qgate:qgate` MCP 服务（zcode plugin list 可见），七工具让 Code Agent 主动询问门禁：`gate.plan / gate.run / gate.status / gate.get_evidence / gate.get_failures / gate.get_risks / gate.explain`。

## 发布证据包

```bash
qgate release-report          # .qgate/release-report.md + .json
qgate waive <gateId> --reason R --approver A [--hours 48] [--revalidation "复验步骤"]
qgate exceptions              # 豁免清单与有效性
```

报告六区块：Gate Summary / Claim Coverage（无门覆盖的 claim 列入 unresolved）/ Evidence Index / Open Risks / Exceptions / Unresolved。

## Stop 门禁与降级阶梯（zcode 硬约束适配）

zcode Stop 钩子续跑上限 3 次（`MAX_STOP_HOOK_CONTINUATIONS`）。QGate 策略：**最多阻断 2 次**（第 2 次附"最后预算"警告），耗尽后放行并登记 Risk（`.qgate/risks/risk-degraded-*.json`）。Stop 只做轻检查（`status --fresh`，<5s）；重执行全在命令面（`/qgate-run`）。

## 安全边界

- command executor 只执行 Gate Spec 声明的固定 argv（spawn，无 shell 拼接），cwd 锁项目根。
- `.qgate/` 运行数据（runs/evidence/risks/state）默认 .gitignore；配置（qgate.yaml/profiles/gates）入库共享。
- 插件对未启用项目零副作用（cwd 无 `.qgate/` 即 no-op）。

## 阶段实证（evidence/ 目录，2026-09-23）

| Phase | 验收 | 结果 |
|---|---|---|
| P0 Spike | hook 闭环 5/5（安装/发现/SessionStart/Stop 反馈/日志） | 5/5 PASS（headless 实证阻断-续跑，2 次模型请求铁证） |
| P1 内核 | lint 错 FAIL → 修复 PASS，CLI 与 Stop 双通道一致 | PASS（22 单测 + CLI 实证） |
| P2 修复闭环 | agent 写坏代码 → Stop 阻断 → 修复 → 放行；runs 记录两跳 | PASS（headless 9 请求；INCONCLUSIVE(never) 首拦 → FAIL → 修复 → PASS 放行） |
| P3 Profile+Impact | 改 README 不触发；改 src 触发；Profile 裁剪生效 | PASS（四项 CLI 实证） |
| P4 Persistence | 单测全绿 + 持久化门 FAIL（植入缺陷）；证据六件套落盘 | PASS（field-diff 10000≠100 + invariant 跨表 10000≠100） |
| P5 Claim/Risk/Exception | INCONCLUSIVE 不误判 PASS；Exception 可过期可复验可拒 | PASS（WAIVED 实机保留原判定事实；allowWaiver=false 拒绝） |
| P6 Ontology Provider | 接口/索引/可关/可换/不可用不 crash | PASS（FIBO 12 概念索引 + mock，单测 4 例） |
| P7 语义门 v0 | 术语歧义/概念错配，warning 级 | PASS（字段级+内容级歧义单测 5 例，CONDITIONAL 带解除条件） |
| P8 MCP | Agent 主动询问门禁 | PASS（七工具；插件 mcp 面实机可见；子进程协议测试） |
| P9 扩展门包 | security/architecture/delivery + release 档 | PASS（files executor present 级诚实语义单测） |
| L5.7 发布证据包 | release-report 六区块 | PASS（实机 md+json，unresolved 诚实点名） |
| Claude Code 适配 | 双宿主清单 | PASS（.claude-plugin + CLAUDE_PLUGIN_ROOT 双平台变量） |

## 明确不做（设计 §8）

全部路线图已闭合：~~Matrix 事件桥接~~（已落地 client store 层，见下）、~~api-contract/schema 门包~~（已落地模板门）、~~LLM Reasoner~~（已落地插件位）。

**Matrix delivery.gate 桥接**（`custom/client/matrix-teams/stores/qgate-bridge.ts`）：QGate 六态判定按 align 表换算为 delivery gate 三态（PASS→pass / FAIL→reject / 其余→conditional，**INCONCLUSIVE 绝不冒 pass**），domain 映射 G1-G6 门号；判定来源统一 `decidedBy=qgate-bridge`（机器判定不冒人）；案例房从 delivery.case 事件学习，未知案例落注册房兜底。读端为既有 review-center 聚合投影。

**LLM Reasoner（插件位，OD-005 兑现）**：`gate-packs/llm/`。凭据走 `QGATE_LLM_API_KEY`（不读 zcode 加密凭证）；核心纪律——**LLM 判定永远不会单独构成 PASS**（模型说 pass 也强转 conditional）；无凭据/网络失败/响应不可解析 → INCONCLUSIVE 不 crash。默认全 Profile 禁用，项目显式 `enable llm.*` 才开。

**api.contract-alignment / schema.migration-safety**：模板门（默认命令占位，项目用 `.qgate/gates/` 同 id 覆盖为真实检查；未覆盖 → INCONCLUSIVE 诚实暴露）。
