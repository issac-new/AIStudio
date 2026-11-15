# Proactive AI 二轮三处挂账清偿：自动收紧写档、卡级 standing、会话溯源面

日期：2026-11-15
状态：implemented
触发：用户「全做」裁决（三处挂账出自 `2026-11-14-proactive-ai-round2.md`：`EARNED_AUTONOMY_AUTO_TIGHTEN`／vendor 卡级 standing 语义／完整会话溯源面）。同源综述已两轮吸收，本批只清挂账、不新开吸收轮。

## 变更

### 一、自动收紧写档（原挂账理由：四挡→七档映射缺失）

- `custom/server/executioncontract/earned-autonomy.ts`：
  - 新增 `MODE_TO_PERMISSION`（build/guarded/plan/yolo → default/acceptEdits/plan/bypassPermissions）与 `permissionModeFor()`——**四挡→七档的唯一映射声明**，按权限强度单调排列，测试锁表；挂账理由「映射缺失」由此解除。
  - 新增 `applyTighten(profile, recommendation, deps?)`：唯一写口。`EARNED_AUTONOMY_AUTO_TIGHTEN=1` 才写；`direction!=='tighten'` 一律不写（放宽/维持须人确认）；写 `session-mode-store` 并返回原档供回滚。
  - 新增 `POST /api/hermes/execution/earned-autonomy/apply`：hold/loosen → 409（`no_tighten`）；env 未开 → 409（`auto_tighten_disabled`）；成功 → 200 `{applied:true, previous, next}`。
- 边界：写的是**会话权限档**（per-profile，可被全局档/阶梯覆盖），不是全局默认档；只收紧不放宽，与 enforcement-policy 同纪律。

### 二、卡级 standing（原挂账：vendor kanban 卡级语义补丁）

- `custom/server/standingagenda/agenda-store.ts`：`StandingAgendaRecord` 增 `cardId?`；`ResumeProposal` 回显 `cardId`；校验接受 `cardId`（≤120）。
- `custom/server/standingagenda/agenda-matcher.ts`：**卡级约束**——记录带 `cardId` 时，kanban 事件必须同卡才算命中（跨卡同列流转不再误触发）；非 kanban 事件不受此约束。
- `custom/server/standingagenda/agenda-controller.ts`：`POST /` 存 `cardId`；`GET /` 支持 `?cardId=`／`?status=` 过滤；恢复建议摘要带卡锚便于深链与台账检索。
- **不新增 vendor 补丁**：卡锚落本域存储即可实现「按卡存活＋按卡恢复」，价值在闭环语义不在存储位置；同时遵守「加补丁的任务串行」在途约束（另有会话在改 patches/）。

### 三、会话溯源面（原挂账：意图+diff 一体留存）

- 新增 `custom/server/lineage/lineage.ts`：
  - `buildLineage(key, sources)` 纯函数：按 `sessionId`／`taskId` 过滤——审批账（决策轨迹）／standing agenda（持久意图）／evidence（交付证据＋`delivery_snapshot` 的 base..head diff）；卡锚可由 agenda 反查派生。
  - `collectLineage(key)` IO 适配器：三源各自 fail-soft（单源坏不拖垮其余），审批账扫最近 2000 条、单任务证据最多 200 条。
  - `note` 显式声明**未覆盖面**：会话档案（sessionarchive 无统一读取器）与会话 fork 血缘（sessionfork 需调用方喂会话集）——如实写「未接入」，不冒充完整。
- `custom/server/harness/harness-controller.ts`：挂 `GET /api/harness/lineage?sessionId=|taskId=`（复用既有路由，无需新补丁）；缺 key 400。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 四挡→七档映射写在 earned-autonomy 一处并测试锁表 | 挂账理由就是「映射缺失＝怕第三套词表」；单点声明＋守门测试把「第三套」变成「唯一一套」 | 映射放 permmodes（否决：反向依赖——permmodes 不该知道 executioncontract 的四挡） | 是 |
| D2 | 卡级锚落本域 JSONL，不改 vendor kanban schema | 卡锚能力（按卡存活/按卡恢复/跨卡不误触发）在本域即可闭环；改 vendor 要加补丁，而在途另有会话改 patches/（串行纪律） | vendor 加 `standing` 字段补丁（否决：本期收益不抵补丁重放回归面） | 是 |
| D3 | 自动收紧只写会话档、只收紧 | 收紧是安全方向；放宽等于把权限升级交给被评估者自己（论文与首轮 D7 同向）；会话档可被全局/阶梯覆盖，影响面可控 | 写全局默认档（否决：一刀切影响他人） | 是 |
| D4 | 溯源面只读聚合、不新开账本 | 机制预算纪律（只加不减）；三源已是事实账本，再开一份＝第四事实源 | 新建 lineage 事件账（否决：双写漂移） | 是 |
| D5 | 溯源未覆盖面写进 note 而非省略 | 「完整会话溯源」名不副实会被下游当完整证据用；宁可显式标未接入 | 假装覆盖（否决：违反 fail-soft 不造假） | 是 |

## 验证

- `custom/server/executioncontract/__tests__/earned-autonomy.test.ts`：映射表锁死、env 闸、只收紧、写档＋原档回滚、REST 三态（hold 409／env 关 409／开启 200 写档）——14/14。
- `custom/server/standingagenda/__tests__/standingagenda.test.ts`：卡级矩阵（同卡命中／邻卡不触发／非 kanban 不受限）——12/12。
- `custom/server/lineage/__tests__/lineage.test.ts`：sessionId 过滤＋卡锚派生＋diff 提取、taskId 直给、缺 key 抛错、缺口诚实、IO 三源 fail-soft、REST 400/200——7/7。
- 目标域合计 33 例；全量 `npm test` 与 `npm run typecheck:harness`；`governance-lint --budget` 0 problem。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md`（整合正本）：主动性治理段补三行——自动收紧只写会话档且只收紧、卡级 standing 锚在本域、会话溯源面三源聚合与未覆盖面。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§A 增两行（四挡→七档映射、溯源面覆盖边界）。
- `docs/manuals/aistudio-design-document-index.md`：`gen-doc-indexes --write` 机械登记（附录 A 已冻结，新增只进机械索引）。
