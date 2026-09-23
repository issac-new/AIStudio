---
name: aipaydev-dev
description: aipaydev 仓库定制化研发技能（swarm-yuan 规范）：研发资产地图、worktree 并行纪律、接口/数据模型设计、白盒扫描/单测/回归闭环
---

# aipaydev-dev（定制化研发技能）

> 由 swarm-yuan 方法生成的本仓定制技能。适用于 csw-cashier-mp / csw-pay-core /
> csw-channel-wechat / csw-channel-alipay 四个应用的分析、设计、开发与测试。

## 研发资产地图

- 仓库：github.com/issac-new/aipaydev
- 应用：`apps/csw-*/`；文档：`docs/`（requirements/analysis/design/plan/test/
  architecture/admin/issues/delivery）
- 架构基线：`docs/architecture/overview.md`（渠道抽象/幂等/状态机/密钥约束，
  违反即返工）
- 组织主责：`docs/admin/org.md`
- 技术栈：后端 Node.js 18+（TypeScript，无框架依赖的 service 形态）；
  前端双端小程序（微信原生 WXML/WXSS/JS + 支付宝 AXML/ACSS/JS 双端目录）；
  测试 vitest（后端）与自研 mp 断言脚本（前端逻辑层）

## 工作纪律（必须严格执行）

1. **worktree 并行**：任务开工先在任务 workspace 下建 worktree：
   `git worktree add ../wt-<taskId> -b feat/<taskId> origin/main`；
   完成合入 feature 分支后 push；不在 main 直接改。
2. **依赖隔离**（aipaydev 推演实锤 shared-node-modules-wipe）：`npm ci` /
   `npm install` 只在自己的 worktree 内跑，**禁止在仓根执行**——多 agent 并行时
   仓根 node_modules 会被互相清空。依赖一律随各自 worktree 安装。
3. **及时推送**（实锤 dev-branch-missing）：feature 分支每个稳定节点即 push——
   未推送的提交对其他 agent 不存在，跨 agent 协作以 origin 为唯一事实源。
4. **workspace 归集**：任务材料（需求/设计文档路径、环境链接、历史文档）统一
   放任务 workspace 的 `materials/` 子目录，供本机相关 agent 共享。
5. **提交规范**：Conventional Commits；push 前本地测试全绿。
6. **渠道 mock**：财付通/支付宝端点一律本地 mock（`apps/csw-*/test/mock*`），
   禁止请求真实渠道。
7. **测试报告是独立交付物**（实锤 test-report-missing）：测试任务完成必须产出
   `docs/test/<需求ID>-test-report.md`（范围/用例数/通过数/缺陷清单及状态/
   结论/通过时的 git commit id）并随测试分支 push——只在群里发结论行不算完成。

## 分析/设计产出（系分阶段）

- 跨模块交互接口与数据模型设计（接口签名、字段、错误码、幂等键）；
- 内部实现方案（聚焦接口与逻辑复杂度）；
- 工作量评估（人日，参考：简单 CRUD 0.5-1d、含状态机 2-3d、渠道对接 2-4d、
  前端页面 1-2d/页）；
- 输出：初步确认结论 / 待澄清 / 概设方案 / 前置依赖 / 风险点 / 工作量，
  写入 `docs/analysis/<taskId>-analysis.md` 并提交。

## 开发/测试闭环（实施阶段）

- 开发：详细设计（接口/数据模型/逻辑）→ 实现 → vitest 单测 → 接口测试 →
  全量回归；白盒安全扫描（签名验签/密钥泄露/注入/越权四个维度逐项过）。
- 测试：用例编写 → 测试数据生成 → 执行 → 缺陷经 matrix 回流研发。
- 结论行：`DEV-DONE-<taskId>` / `DEV-FAIL-<taskId>`；
  测试：`TEST-PASS-<taskId>` / `TEST-FAIL-<taskId>`。
