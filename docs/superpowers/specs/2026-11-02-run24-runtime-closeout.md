# run24 运行面收口：补丁真正加载＋板围栏修正＋studio 换装＋归档自洽

日期：2026-11-02 ｜ 类型：fix（运行面运维执行；无产品代码改动）｜ 关联：2026-11-02-run24-retro.md

## 变更

1. **722/723 真正生效**：两补丁原仅登记 `patches/series`，未进 `mx_apply_agent_patches` 白名单 → `mx-up` 从不应用（run24 值守热打 SIM 快照后又被下次 provision 洗掉）。修复＝白名单追加（同日 spec 2026-11-02-agent-patch-injection-list.md）＋`mx-up` 02:05 重放；SIM 快照实测：`EmptyStreamError→timeout` 分类生效、`_spawn_refusal_reasons/_refusal_hint` 在位。
2. **板团队围栏修正（dispatcher 死锁根因的数据面）**：4 个板 `board.json profiles` 补入任务实际 assignee（子编制全名＋`default` 等），干跑实测 `skipped_nonspawnable 5→0`；网关实际派出 1 个 worker（t_80612828 running 实证）。
3. **遗留卡冻结**：run24 已收官，5 张 ready/running 卡（qi-test-pay 4＋fei-test-mp 1）全部 `kanban block`，原因入卡注释——防围栏修复后过期任务被持续派发；worker 进程精确停（89834/90015）。
4. **studio 换装**：`build:full`（02:03，dist/server 20.7MB 含 CN_VERDICT 正则字面量）→ `rsync vendor/hermes-studio/dist → SIM product-dist`（02:08）→ 重启 8802；活体三态：分项「结论 1：过」→PASS、散落「通过率 95%」→空、 「结论：不通过」→FAIL。
5. **run24 归档自洽**：补 source `governance-client.sh` 重跑 `gov_report`（DTO 35 键）＋两单 DISP（`lifecycle-service-unreachable` 已修：原发因为调用缺客户端库；`m3-v3-events` 已修：FAIL 收尾终态如实）→ 重生成报告链 → 审计 **rc=0**（原 A3a 33≠34 时滞消解）。
6. **pending-batch 清单收口对账**：9 件 8 闭环 1 维持立项（B6 chat 第二块），清单转历史档。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 板围栏修数据而非改 spawn 行为 | 围栏是防越权派发的安全语义；改判真伪风险高，修数据即可 |
| D2 | 遗留卡 block 而非置回 todo | block 带原因进卡注释、可审计；避免围栏修复后被派发跑过期任务 |
| D3 | studio 换装走 runbook G 段（build→rsync product-dist→重启） | 仓内既有唯一换装通道；直接重启下载树=旧 bundle（run24 实证） |
| D4 | run24 归档重跑而非改审计判据 | 时滞源于快照旧，重跑即消解；不动审计口径（判据只收不改） |

## 验证

- `grep EmptyStreamError` SIM 快照=2 处；`_spawn_refusal_reasons` 在位；python 实测分类=timeout。
- 干跑：qi-test-pay/fei-test-mp `skipped_nonspawnable` 均 0；fei 实派 spawned=1。
- 服务：gw 200 / studio 200；判词端点活体三态符合预期。
- 归档：`mx-report-audit --run 20261031-v8-run24` rc=0；final-report 525,797B 重新生成。
- 全量回归（run24 复盘批已跑）：主检出 7207/0；本批为运行面数据操作，不改代码（仅 pending-batch 文档与白名单已在先前提交验证）。

## 设计文档影响

DESIGN_SYNC: none——运行面运维执行＋清单状态回填；方案/模板面改动已在 2026-11-02-run24-retro.md 同批落定。
