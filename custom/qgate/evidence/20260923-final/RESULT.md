# 第三轮：最后三项闭合实证（2026-09-23）

用户指令"完成全部"后，设计 §8 不做清单的最后三项全部落地（此前裁定"等 zcode-engine R4 / 等真实需求 / 维持插件位"）。

## ① LLM Reasoner executor（OD-005 兑现，插件位）

- `src/executors/llm.ts`：凭据 `QGATE_LLM_API_KEY`（+ PROVIDER/BASE_URL/MODEL，zhipu|openai|anthropic 三 Provider 分支），30s 超时，响应宽容解析（截 `{...}` 容错模型包裹文本）。
- **核心纪律实证**：LLM 判 pass → 证据强转 conditional（summary 标注 "LLM-only judgement cannot constitute PASS"）——v0.1 §4.3 的机器化。
- 无凭据/HTTP 429/非 JSON/ECONNRESET → error 证据 → INCONCLUSIVE，全链不 crash。
- 门包 `gate-packs/llm/review-reasoner.yaml`，默认全 Profile 禁用（`disable llm.*`），项目显式启用。
- 测试 4 例（fetch 全程 stub，不碰真网络）：无凭据 / pass 强转 / fail 与 conditional / 三类故障。

## ② api.contract-alignment + schema.migration-safety 模板门

- 按 architecture.fitness 同模式：默认命令占位（`contract:check` / `db:migrate:check`），项目用 `.qgate/gates/` 同 id 覆盖为真实检查（openapi-diff / schemathesis / migrate up+down 复演）；未覆盖时命令不可执行 → INCONCLUSIVE 诚实暴露。
- appliesWhen 已按域裁剪（api: openapi/routes/controller；schema: db/migrations/sql）；feature-close/high-assurance/release 档默认禁用，项目显式启用。

## ③ Matrix delivery.gate 桥接（client store 层）

- `custom/client/matrix-teams/stores/qgate-bridge.ts`：
  - 换算表 `QGATE_TO_DELIVERY`（六态→三态，与 align 同源）：PASS→pass / FAIL→reject / CONDITIONAL·WAIVED·INCONCLUSIVE·NOT_APPLICABLE→conditional（**不确定绝不冒 pass**）。
  - domain→门号 DOMAIN_TO_GATE：L0→G1 / L1→G3 / L2·L3→G4 / L4·L5→G5 / 未知保守落 G4。
  - 判定来源统一 `decidedBy=qgate-bridge`（机器判定不冒人）；reject/conditional 必带 reason（条件摘要或回指 .qgate runs）。
  - 房间路由：delivery.case 事件学习案例房，未知案例落注册房兜底；本地镜像 bridge-state.json（不入 git）。
  - 读端复用 review-center 的 aggregateSignoffs 投影（桥接只写不读）。
- 测试 9 例：换算完整性 / wire 形态过 parseGateContent 复解析 / reason 纪律 / 案例房学习与兜底 / bot sender 合法性 / bridge-state 往返与坏文件兜底。

## 测试与收口

- 新增 14 例（llm 4 + bridge 9 + 既有 1 修正）；overlay 全量 **251 文件 2395/2395 绿**（零回归）；tsc 零错。
- 设计文档 §8 回写为"全部闭合"；README 明确不做清单同步。

## 至此 v0.1 路线图全部闭合

Phase 0-9 + §82 研发基线 15 项无一残留"未做/等外部"。后续演进只在真实需求驱动下加门包/Adapter，框架形态不再扩——与 v0.1 §82 纪律一致（不跨阶段顺手实现，本文档是最后一笔跨出）。
