# 执行内核统一 P0b-2 / P1 实施规格（2026-11-10）

> 母决策正本=`2026-11-10-execution-kernel-unification.md`（已批准）。本文件只固定本批实施边界，不重开内核、白名单或审批口径的裁决。

## 变更

1. P0b-2：在 Hermes Python 审批守卫终态与 IDE/群聊编码启动成功点写统一账本，使八条入口均可对账；不将同一审批在 Bridge 回调与 Python 守卫重复写入。
2. P1：新增四挡纯函数判定器；Hermes/Ekko 工具面、ZCode、DeepSeek Harness 使用同一 `build/guarded/plan/yolo` 词表；未知档不自动放行，`edit` 保留历史语义。
3. 生成 13 家待退役后端的承接清单与状态守门；本批不实际删除后端，不把未采集能力标为已承接。
4. 补丁化修改 `vendor/**` 注入态，登记 `patches/series`；新服务端模块进 `typecheck:harness` 点名清单与域索引。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| P0B2-D1 | Hermes 终态只在 Python 审批守卫写一次，Bridge 回调不另写 | Bridge 只是同一裁决的 UI 往返；双写破坏 I4 计数 | 在 Bridge 再写（否决：重复） |
| P0B2-D2 | IDE/群聊编码入口在启动成功点合成记录，失败不写放行 | 启动失败没有获准执行的事实 | 启动前写（否决：把失败伪记为放行） |
| P1-D1 | 四挡判定器为纯函数，未知档返回 ask，硬拒绝优先于 yolo | fail-closed 执法与既有 Hermes hardline 底线 | 未知档按 yolo（否决：静默提权） |
| P1-D2 | 本批只建承接清单与退役门，不删除 13 家 | 母 spec 先立后破，避免无承接的中间态 | 直接删注册项（否决：能力断档） |

## 验证

- Python：新增审批账本 pytest（人工/自动/拒绝/fail-soft/脱敏）＋既有 approval 测试；语法与真实 tmpdir 写入验证。
- TypeScript：入口写账、四挡×风险矩阵、ZCode/DSH 启动参数、承接清单状态与变异探针。
- 工程：`npm run typecheck:harness`、目标 Vitest、`npm test` 全量、clean+inject 补丁重放、`runtime:doctor`。
- 验收口径：八入口有真实或自动化测试证据；四挡不是只改 UI，服务端执行参数与审批账本一致。

## 设计文档影响

DESIGN_SYNC: none

本文件是已批准母 spec 的阶段实施规格；架构定位与四挡契约已由母 spec 批写入 `docs/DESIGN.md` §3.5/§4.2，本批不新增或改变设计边界。实施结果与未完成项回填母 spec 验证段，不另立设计正本。
