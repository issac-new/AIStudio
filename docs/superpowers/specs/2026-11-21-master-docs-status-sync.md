# 2026-11-21 三正本状态同步批（宿主 v0.23.3 收口＋SIM 拆除现况）

> 背景：2026-11-21 换血批 N-1/N-2 收口后两大环境事实——①宿主 `~/.hermes/hermes-agent` 已收口 v0.23.3 稳态（基线＋热修回灌两批入库承载＋deploy complete＋网关重启稳定，详见 spec 2026-11-20-vendor-upgrade-agent-v0233 N-1 销账行）；②SIM 实体已拆除（SIM_ROOT 仅剩 logs/，42 profile 与 agent-src 供给随 2026-11-18 归档轮拆除，重建即 v0.23.3 全新面）。三大正本（设计方案 DESIGN.md／全流程推演方案 V8 正本／全流程推演程序 simharness）中含状态性叙述需同步，避免正本与现实漂移。

## 变更

1. `docs/DESIGN.md`：`simharness/` 表行与「SIM」词典行补 2026-11-21 现状（实体已拆除、程序随仓保留可重建）。
2. `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`（V8 正本）：总述后增「2026-11-21 运行基面」状态块——宿主基线 v0.23.3 收口、SIM 实体拆除态、重建入口=mx-setup（自带 deploy 至 SIM agent 树＋migrate_config 幂等盖章）、供给链现状（runtime 清单 71 件含 watchdog 热修）。
3. `simharness/README.md`：头部状态标注（同口径）；**程序代码零改动**——mx-setup 幂等盖章走产品自身 `migrate_config`（v0.23.3 兼容，宿主 config.py 已带 v0.23.3 面实证），AGENT_SRC 供给链不变。
4. 补勾 `2026-11-21-host-watchdog-hotfix-backfill.md`（4 项）与 `2026-11-21-host-hotfix-backfill2.md`（3 项）验证段——验证在收口轮已实际完成（deploy complete 194/0/0、SMOKE OK、网关 kickstart 后稳定、清单守门 10/10、inject manifest complete 493），当时提交早于验证时序未回勾。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 状态同步型修订，不改三正本的结构/规则/判据 | V8 方案与 DESIGN.md 中宿主/SIM 引用多为语义规则（隔离口径/保真形态），不因实体拆除过期；只修「现状态」叙述。run30 复盘二轮先例（§5.14 进正本=方案程序同步通道） |
| D2 | 推演程序零代码改动 | mx-setup 的 4d 盖章=产品 `migrate_config` 幂等调用（版本自适应）；deploy 通道 `--runtime` 独立于宿主树；SIM 拆除非程序缺陷 |
| D3 | spec 补勾走本批而非散提交 | 同日四批已合入，两 spec 验证段与事实一致只是时序脱节；随批 SPEC_REBIND 集中回勾＋本 spec 留档依据 |

## 验证

- [x] 三正本修订后 grep 复核：DESIGN.md SIM 两行带现状注；V8 状态块在总述后；README 头部带标注（提交前树内验）。
- [x] 两 spec 补勾后 `- [ ]` 计数归零。
- [x] `node scripts/maintenance/gen-doc-indexes.mjs --write` 后 `--check` 0 problem。
- [x] `node scripts/merge-invariants.mjs --check` pass。

## 设计文档影响

DESIGN_SYNC: touched —— 本批修订对象即整合正本 `docs/DESIGN.md`（SIM 词典行/表行现状标注，随批兑现）；数字总账已于 N-1/N-2 销账批（ef49227c7）同批更新，本批不重复触碰。
