# HumanGate store 合并统一：旧版裸 grant 行装载迁移

日期：2026-10-31 ｜ 轮次：IDE 工作区回归收尾·HumanGate 数据冲突根治（用户令「两者合并统一」） ｜ 类型：fix（store 契约统一＋装载宽容迁移）

## 变更

1. `custom/server/approval-inbox/human-gate.ts`（A 类）：`ensureLoaded` 装载分区改造——请求信封行原样装载；**旧版裸 grant 行**（`{scope:'task', board|task, grant}`，旧 TS 写入、2026-10-28 实录三条，使新收件箱 fail-closed 500 的直接肇因）装载时经 `upgradeLegacyGrantRow` 升级为请求信封行（grant 原样内嵌、id 带 `legacy-` 前缀防撞真批次、note=`legacy-grant-migrated`），并**归一化回写**文件；未知形状（既非请求也非裸 grant／裸 grant 缺 taskId-board 无法定位任务）保持 fail-closed 不猜数。

契约事实（本轮取证确认，无代码改动）：双消费者在新契约下**本已统一**——新 TS task 批准在请求行内嵌 `grant: DecisionGrant`（human-gate.ts decide，taskId/board/tier/decision/actor/issuedAt/decidedAt/choice/expiresAt/taskRevision 全字段）；python `runtime/tools/kanban_tools.py _read_task_grants` 兼容裸数组与 `{requests:[...]}` 双形态并按 `scope=='task' && grant 对象` 提取——升级后的信封行天然可被提取。唯一断层即旧裸 grant 行，本批以装载迁移补齐。

2. 守门测试：`custom/server/approval-inbox/__tests__/human-gate.test.ts` 增四场景——裸 grant 行升级＋归一化回写（python 提取判据不变）、混合装载互不干扰、未知形状 fail-closed、缺定位字段 fail-closed。
3. `runtime/tests/hermes_cli/test_decision_grant.py:18`（顺手清偿，先于本批的既有债）：fixture 路径仍指旧目录名 `approvals/__tests__`（目录已改名 `approval-inbox`），测试收集即 FileNotFoundError——改指现行路径后 9/9 过。属测试债一行修，不改任何判定逻辑。

## 决策记录

- **装载迁移而非清洗工具/双段 store**：断层只在历史行形状，双消费者目标契约（信封行内嵌 grant）已一致——迁移到目标形状即统一，无需引入双段 schema 或一次性脚本（每台存量机/每份历史存档在下次装载时自愈）。fail-closed 语义完整保留：可识别的旧形态升级，不可识别的照旧拒绝。
- **grant 原样内嵌不重算**：grant 内 taskRevision/choice/actor 是当时人责证据，迁移只补信封不改动裁决内容；过期与修订失配交由 python `check_decision_grant` 既有判据拒绝（expired/revision_mismatch）——迁移不复活任何已失效授权。
- **id 规则**：`hgate:task:<board>:<taskId>:legacy-<decidedAt>`——与 createTaskRequest 的 revision 幂等键（`hgate:task:<board>:<id>:<revision>`）不同名空间，不会拦截同任务后续真人再审。
- **python 侧零改动**：`_read_task_grants` 已兼容双形态；本批不动 runtime/（避免部署链），部署树行为回归以既有 `runtime/tests/hermes_cli/test_decision_grant.py` 佐证。

## 验证

- 单测：`npx vitest run custom/server/approval-inbox/__tests__/human-gate.test.ts` 14/14（既有 10＋新增 4）。
- 活体（旁路实例，不动共享 8647）：`PORT=8999 HUMAN_GATE_STORE=<存档副本>` 起临时服务端 → `GET /api/approvals/human-gate/` 200 且三条旧 grant 升级为信封行、文件归一化回写无裸行 → 部署树 python `HUMAN_GATE_STORE` 指向归一化文件读出 3 条 grant（过期→authorize 拒绝原因=expired，语义正确）。
- 回归：approval-inbox 域全量 85/85；runtime `test_decision_grant.py` 9/9（拼合树 PYTHONPATH）。
- 活库统一落位：~/.hermes/approvals/human-gate.json 已写回**迁移后的信封形态**（3 条历史 grant，grant 原样内嵌）——新旧装载器与 python 消费者三方实测读通（旧装载器 200 / python 提取 3 条 / authorize 对过期 grant 判 expired）；.bak 存档保留。

## 设计文档影响

DESIGN_SYNC: none——store 契约统一在既有人审信封设计内收口（新 TS 的 additive scope＋内嵌 grant 本即目标形态），未新增契约或阈值；「裸 grant 行=可识别旧形态装载迁移、未知形态 fail-closed」边界以本 spec 决策记录为事实源。
