# Phase 5-9 + 收尾件实证（2026-09-23 续轮）

用户指令"继续 完成所有"后，v0.1 路线图剩余项全部落地（Matrix 事件桥接除外——设计 §8 明确等 zcode-engine R4，属外部依赖）。

## P5 Claim/Risk/Exception 完整化

| 验收点（v0.1 §61 + DoD v0.2） | 实证 |
|---|---|
| 证据不可得 → INCONCLUSIVE 而非 PASS | P1 起单测覆盖；本轮 waiver 链路复证 |
| Exception 显式放行且可追踪/过期/复验 | `qgate waive <gateId> --reason --approver [--hours] [--revalidation]` 落 `.qgate/exceptions/`；过期自动失效（activeWaiverFor 过滤）；`allowWaiver:false` 的门拒绝豁免 |
| WAIVED 不抹除事实 | 实机（payment-demo）：`△ WAIVED — waived by cuishi … — field-diff:fail, invariant-result:fail`（原判定保留在 conditions） |

## P6 Ontology Provider Skeleton（DoD v0.1 FIBO 版 9/9）

Provider 接口（load）+ 预处理语义索引 `gate-packs/ontology/data/fibo-mini.json`（12 概念含 authorization/capture/settlement 歧义三元组 + 3 候选不变量，OD-004 不做运行时 OWL 推理）+ MockProvider + 配置面（`ontology.provider: fibo|mock|off`）。
验收：Provider 可关闭（off→skipped）、可替换（mock）、索引缺失→null→门 INCONCLUSIVE 不 crash——单测 4 例全绿。

## P7 Ontology Semantic Gate v0（v0.1 §63：finding=warning）

确定性三查（无 LLM）：字段级歧义（映射到 Captured 的字段名内嵌 settled）→ terminology-ambiguity；同文件混用 distinctFrom 概念术语（captured/settled 同文档）→ terminology-ambiguity；映射指向索引外概念 → concept-mismatch。
端到端：evidence conditional → 门 CONDITIONAL 带解除条件（非强阻断）。单测 5 例：off 不 nag / 字段歧义 / 内容歧义+干净文档 pass / 概念错配 / 端到端 CONDITIONAL。

## P8 MCP 工具面（v0.1 §37 七工具）

`src/mcp-server.ts`：手写 stdio JSON-RPC（零依赖，initialize/tools/list/tools/call/ping），七工具 gate.plan/run/status/get_evidence/get_failures/get_risks/explain。
插件接线：`plugin/.mcp.json`（`${CLAUDE_PLUGIN_ROOT}` 展开，zcode MCP 变量上下文实证 mcp.ts:391-395）。
实机：`zcode plugin list` 显示 `mcp: plugin:qgate:qgate`；子进程协议测试（initialize→tools/list=7→gate.status 回真数据）绿。

## P9 扩展门包 + Profile 重整

新增 executor：`files`（制品存在性 → **present 级证据**——单凭它过不了 PASS，决策层判 not-exercised，证据强度阶梯活演示）。
新增门：`security.sast-audit`（npm audit，改锁文件触发）、`architecture.fitness`（适应度函数模板，未覆盖→INCONCLUSIVE 诚实暴露）、`delivery.operational-readiness`（runbook/rollback 存在性）、`delivery.release-evidence`（发布证据包+复盘工件）。
Profile 重整：vibe-fast(lite)=仅工程基线；feature-close(standard)=+持久化+审计+架构；high-assurance(compliance)=全域 INCONCLUSIVE 阻断；新增 **release 档**=全域+交付门。语义门全部默认禁用（需项目配 provider 显式启用，防 nag）。

## L5.7 Release Evidence Package（v0.1 §71）

`qgate release-report`：Gate Summary / Claim Coverage（无门覆盖的 claim → unresolved）/ Evidence Index / Open Risks / Exceptions（含过期态）/ Unresolved 六区块，md+json 双产出。实机（payment-demo）：md 落盘且 unresolved 诚实点名 `architecture.fitness: INCONCLUSIVE`、`security.sast-audit: INCONCLUSIVE`。

## Claude Code Adapter（v0.1 §2.1 多宿主首步）

`plugin/.claude-plugin/plugin.json` 双清单（zcode 三清单兼容已实证 adapters/plugins/index.ts:100-102）；hooks.json 变量切 `${CLAUDE_PLUGIN_ROOT}`（zcode expandPluginVariables 双前缀展开实证 configured-runner-input.ts:113-117）——单文件双平台。

## 测试与门禁

- qgate 套件 3 文件 **38/38 绿**（core 22 + persistence 2 + P5-P9 14）
- tsc 零错；本轮新踩坑：注释内 `docs/**/*.md` 的 `**/` 会终结块注释（TS 解析炸）——已改措辞
- 过程修复：ontology executor 曾把项目根当 packs 根传给 createProvider（单测逮住）

## 明确不做（维持设计 §8 裁定）

Matrix delivery.gate 事件桥接（等 zcode-engine R4 统筹层）；api-contract/schema 专属门包（等真实项目需求，防占位膨胀）；LLM Reasoner executor（OD-005 保持插件位）。
