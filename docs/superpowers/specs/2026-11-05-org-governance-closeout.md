# 2026-11-05 组织治理能力批·未做项收口（四件）

## 变更

上一批（main 7fb068b9a，spec 2026-11-05-org-governance-{autonomy-scale,premise-log,metric-discipline,thin-items}）如实登记了四项未做。本批逐项收口，每项都给出「为什么不按最初设想的形态做」。

### ① 双签真拦（原：只判定不阻断）

**改动**：`custom/server/autonomygov/dualsign.ts` 增判定闸 `decideDualSignGate`；`store.ts` 增签署台账 `dualSignSignatures.json`；`custom/server/approval-inbox/pending-controller.ts` 的 `/:id/decide` 在**已重算风险档**的分支（`fleet:` 与 `enf:`）插入闸门。

**判据**（纯函数，可测）：

| 情形 | 结果 |
|---|---|
| 风险档非 `high` | 放行（不适用） |
| 决策非批准类（`deny`/`reject`） | 放行（否决不需要双签） |
| `high` + 已有另一个不同签署人 | 放行，记第二签 |
| `high` + 仅自己一签 + 带 `waiver: 'single-operator'` | 放行，落 `dualSignGap`（含 waiver 理由） |
| `high` + 仅自己一签 + 无 waiver | **409 `dual-sign-required`**，返回已签人与缺项 |

**边界（必须写清）**：只在风险档可重算的两条分支生效（`fleet:` 命令审批、`enf:` 执法门）。其余分支（看板审批、评审卡、human-gate、文件队列）拿不到服务端风险档，**不判**——不猜档位，也不假装拦了。这条边界写进响应 `scope` 字段与页签提示。

**开关**：`AUTONOMY_DUAL_SIGN=off` 关闭（默认开）。默认开的安全依据：真实审批历史 500 单中 `high` 为 0（`~/.hermes-web-ui/approvals/history.json` 实测：medium 126、无档 374、high 0），不会卡住存量流程。

### ② 接口数（原：占位 unknown）

**改动**：`custom/server/metricpolicy/derive.ts` 的 `interfaceCount()` 改为真实派生。

**口径**：一个任务的上下文要从几个系统拼出来 = `buildPanorama(taskId)` 的八个面（任务卡/看板事件/证据/评测/评审/计划/图运行/trace）中 `available: true` 的面数。
取样：最近 3 个已完成任务，取**中位数**；`sample < 1` 或 panorama 全部不可用 → `available:false` 并写明缺口。

**为什么只取 3 个**：每任务 8 次跨面查询，取多了会把治理页签拖成秒级。取样数写进返回 `sample`，页签显示「样本 3」——读数可复核，不是全量。

### ③ 技能调用计量（原：只有声明覆盖率）

**改动**：`skillUsage()` 增 `invocations` 段：从 `~/.hermes/state/tool-audit.jsonl`（`HERMES_TOOL_AUDIT` 可覆盖）统计 `skill_view` / `skill_manage` / `skill_list` 的调用次数与失败率。

**诚实边界**：该审计面只记工具名与 ok，不记技能名（`argDigest` 是哈希、`inputKeys` 只有键名）。因此**能回答「技能被调用了多少次、失败率多少」，不能回答「哪个技能被用得多」**。返回里 `perSkill: null` 与 `perSkillGap` 明写这条，不编造分布。

### ④ 浏览器实物走查（原：未做）

代码改动之外的验证项。前置：worktree 的 dev 用户库有存量账号、密码未知，`HERMES_WEB_UI_DEV_BOOTSTRAP=1` 因用户数>0 不生效。改用 `NODE_ENV=production` + `HERMES_WEB_UI_HOME=<临时目录>` 让 DB 落到 `config.appHome`（`vendor/.../public/config.ts:56` 读该 env），空库首登即建号，不触碰主树 dev 库与真实用户库。

走查对象：姿态页签（自治刻度）、协作与知识页签（假设登记簿）、研发效能页签（度量纪律）。判据：三个 `data-testid` 区块存在、缺口/装饰/违规文字可见（不是只有空壳），截图留档。

## 决策记录

- **D1（双签只在高风险且档位可重算的分支拦）**：全分支硬拦需要给看板/评审/hgate 各补一套风险分类器，成本与回归面都大，且判定口径会分叉。改为「能判的判、判不了的明说」。代价：拦住的面不完整；收益：不制造第二份风险口径，也不假装全覆盖。
- **D2（拒绝不需要双签）**：双签的目的是防一个人放行高风险变更。否决是收紧方向，加双签会反向增加放行难度。
- **D3（默认开 + 单操作员豁免）**：默认关等于没做。默认开的安全依据是真实库 `high` 为 0；同时保留 `waiver: 'single-operator'` 让单人部署能继续跑，但豁免必落账可见——**从「悄悄单签」变成「显式豁免」**，这才是这条机制真正买到的。
- **D4（接口数只取 3 个任务）**：治理页签是给人看的，秒级以内才有用。取样数如实回报，读数带样本量比「看起来很准的全量」更可信。
- **D5（技能计量不插桩 vendor）**：插件侧只改记工具名不改传参，是隐私边界内的最小改动；为拿技能名去改运行时参数落账，会把参数内容带进审计面，代价高于收益。改为明写 perSkill 不可得。
- **D6（走查用 production + 空 appHome）**：dev 模式 DB 路径由 cwd 决定（`<upstream>/packages/server/data`），不受 `HERMES_WEB_UI_HOME` 控制，所以只能用 production 模式换库；不动任何既有库，也不改密码。

## 验证

- `npx vitest run custom/server/autonomygov custom/server/approval-inbox custom/server/metricpolicy` —— 双签闸五态（非 high/否决/双签满足/豁免/拦截）、幂等（同一人二次签不加人）、接口数取样与缺口、技能计量三段（覆盖/调用/失败率）与 perSkillGap。
- 真库只读核验：`approval-log history.json` 风险分布（high=0）作为「默认开不卡存量」的依据；`tool-audit.jsonl` 技能类调用计数与接口数派生实跑一次（读数写进交付说明）。
- `npm run typecheck:harness`；全量 `npm test` 零新增失败。
- 浏览器实物走查三页签，截图与本轮改动一起留档（截图不入库，按仓规只留路径与结论）。
- 附录 A 三处登记（H1 计数 550→551、A.1 逐份行、培训文档机械索引）。

## 设计文档影响

**DESIGN_SYNC: touched** —— 整合正本 §3.6 的「自治刻度与责任边界」段需补两句：双签在风险档可重算的审批分支上真拦（含单操作员显式豁免），不可判分支明示不拦；「度量纪律」段的接口数由占位改为按 panorama 面数取样派生、技能计量区分「声明覆盖率」与「工具调用频次」并声明 perSkill 不可得。同批修订附录 A 索引。
