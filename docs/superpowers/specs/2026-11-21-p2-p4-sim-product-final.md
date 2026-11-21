# 2026-11-21 P2-P4 收尾批：场景库/capture-plan REST 化＋归档预备态

> 背景：用户令「完成所有」（路线图 P2/P3/P4）。开工探查修正工作量认知：①P4 驱动产品化已深——supervisor 默认 `spawnDriver=spawn('bash',['aipay-scenario.sh'])`（11-02 批已绑定产品端点 start→真实驱动）；②场景库实体仅 1 个（mixed-mote-bidding，另两个是模板）；③capture-plan.env=四态管道语法注册表（守门测试在 simharness/tests）。真增量=P2/P3 的**产品消费面**（REST 暴露）＋P4 的归档预备态标注。
> 事故留痕：本批首版完成时 commit 被 L2 拦（roadmap spec 声明 DESIGN_SYNC touched 而变更集未含 DESIGN.md 修订）且收尾命令链用 `;` 分隔导致 worktree 被 force 清、未提交工作丢失——从会话历史全量重建，根因（DESIGN.md 同批修订）与链纪律（全 && ）双双修正。

## 变更

1. **P2 场景库 REST**（`custom/server/controllers/sim/scenarios.ts`）：`GET /api/sim/scenarios`（发现：目录扫描排除 _template，含 roster USERS 摘要）＋`GET /api/sim/scenarios/:name`（roster 数组面）。诚实边界：roster.env 是 bash 源文件，函数体不解析——REST 只投影数据数组面。
2. **P3 采集面 REST**（`custom/server/controllers/sim/capture-plan.ts`）：`GET /api/sim/capture-plan`——四态解析（page/none/repo/file）为结构化 JSON；语义正本仍是 capture-plan.env（只读投影，不建第二事实源）。
3. **补丁 811**（`811-server-sim-library-routes.patch`）：bootstrap/routes.ts 挂载两控制器（704/706 每端点族一枚补丁先例）。
4. **P4 归档预备态**：simharness/README 标注——能力面全产品化（P1 对账＋P2/P3 本批＋驱动绑定在案）；归档执行挂 SIM 重建端到端验证。
5. fail-soft 契约：simharness 缺席（未来归档后）＝available:false 空态。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | REST 投影而非物理迁移 scenarios/ | 物理迁移破坏 mx-* 相对路径引用；能力产品化=消费面产品化，数据宿主随 P4 归档一并处置 |
| D2 | roster 只解析数组面、不解析 bash 函数 | 函数语义属驱动域，硬解析=造第二事实源 |
| D3 | P4 归档预备≠归档执行 | 删除毁重建通道；端到端验收被 SIM 缺席卡死，「完成所有」的诚实终态=能力面全产品化＋归档条件就绪 |
| D4 | DESIGN.md 随批一行（P2-P4 落地入表行） | L2 根因修正：roadmap spec 声明 touched 须同批兑现（首版事故根因） |

## 验证

- [x] 两控制器测试 7/7 绿（发现/摘要/fail-soft/四态/非法名）。
- [x] 补丁 811 重放：clean+inject manifest complete 全量；注入树挂载在位。
- [x] 域套件＋`npm test` 全量绿。
- [x] 路线图 P2/P3/P4 状态闭环＋README 归档预备标注＋DESIGN.md 同批修订在位。

## 设计文档影响

DESIGN_SYNC: touched —— 整合正本 `docs/DESIGN.md` simharness 表行随批补 P2-P4 落地与归档预备态（D4：与路线图 spec 声明同批兑现）；路线图 spec 状态修订（SPEC_REBIND）。
