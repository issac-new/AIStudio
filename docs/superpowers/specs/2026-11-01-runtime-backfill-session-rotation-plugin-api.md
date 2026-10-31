# runtime 模板回灌：session_rotation（705）与 plugin_api（RFC 9457）

日期：2026-11-01
状态：implemented
触发：模型波动加固批部署时 deploy-agent-runtime 报「目标与模板不同，已保留」7 件中的 2 件非本批改动：宿主 `~/.hermes/hermes-agent` 比模板新。按既定规则（模板落后于宿主时把宿主已知良好态回灌 runtime/，先例 3edd5e32e），本批回灌并随批入库。

## 变更

- `runtime/gateway/session_rotation.py` ← 宿主版：补 705 软轮换第四类判据（`last_prompt_tokens` 回合末绝对尺寸超 `soft_rotate_tokens` 默认 60000，水位百分比在长上限模型上永不咬合的实测形态）＋`HERMES_SESSION_SOFT_ROTATE_TOKENS` env 覆盖＋配置键收编。对账：宿主文件与主树注入态 vendor 副本逐字节相同（补丁 705 产物）。
- `runtime/plugins/kanban/dashboard/plugin_api.py` ← 宿主版：409 冲突统一渲染 RFC 9457 `application/problem+json`（`ProblemConflict`，稳定 `type` token `kanban/<variant>`，非 409 保持原形状、`detail` 语义兼容）。该改造未上游化为补丁，宿主为唯一正本，回灌后 runtime/ 成为入库源。
- 回灌后 `deploy-agent-runtime` 全量 `--apply` 应零保留差异（kanban 五件＋completion_contract 已于 10-31 23:59 定向部署）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 逐字节回灌宿主态，不手工重写 | 部署通道以 runtime/ 为源；宿主＝运行验证过的良好态 | 重写为"更干净"版本（否决：引入未经运行验证的差异） | 是 |
| D2 | plugin_api 的 RFC 9457 改造暂不补丁化 | 该文件同时在 manifest（部署通道已闭环）；vendor 侧补丁化留待后续专项（涉及 dashboard 前端联动） | 立即生成 B 类补丁（否决：超出本批范围，且需配套前端对账） | 是 |
| D3 | session_rotation 回灌不叠加本批 auto 档 | 模板承载机制（705 判据）；执行档位（report/auto）属部署配置（team/config.yaml＋宿主 config.yaml），单一事实源不在模板 | 在模板里写死 auto（否决：混淆机制与配置） | 是 |

## 验证

- `diff` 宿主 ↔ runtime/ 回灌后两文件：零差异。
- `python3.14 -m py_compile` 两文件通过。
- `node scripts/deploy-agent-runtime.mjs`（dry-run）→ 保留目标归零（全部 same/待同步完成后 same）。
- 诚实边界：705 判据与 RFC 9457 渲染的行为级验证依赖后续真机运行观察（本批只保证部署一致性）。

## 设计文档影响

DESIGN_SYNC: none

纯部署模板与宿主对齐，不改设计参数/机制语义；机制描述仍以各自来源 spec（705＝2026-10-30 run23 轮、RFC 9457＝宿主侧 dashboard 契约）与本仓 runtime README 的镜像纪律为准。
