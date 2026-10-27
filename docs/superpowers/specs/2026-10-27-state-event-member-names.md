# 房间状态事件成员文案缺账号名修复规格

- 日期：2026-10-27
- 状态：实施中
- 分支：`fix/state-event-member-names`
- 关联：用户实报（房间时间线「被邀请/加入了」不显示具体 matrix 账号或 agent 名称）

根因：`formatStateEvent` 代码层已正确传 `{sender}/{target}/{user}` 插值，但 zh/en locale 的 member 族词条**没写占位符**——`stateInvited: '被邀请'`、`stateJoined: '加入了'` 等。vue-i18n 对词条中不存在的占位符静默丢弃，用户看到裸文案。同文件 `stateNameSet: '{sender} 将房间名称…'` 是正确形态，member 族是漏写。

## 变更

- zh/en 两份 locale 的 member 族词条补占位符，语义对齐 element-web 完整句子：
  - `stateInvited: '{sender} 邀请了 {target}'`
  - `stateJoined: '{user} 加入了'`
  - `stateBanned: '{sender} 封禁了 {target}{reason}'`
  - `stateKicked: '{sender} 踢出了 {target}{reason}'`
  - `stateLeft: '{user} 离开了{reason}'`
  - `stateRejectedInvite: '{user} 拒绝了邀请'`
  - `stateWithdrewInvite: '{sender} 撤销了对 {target} 的邀请'`
  - `stateUnbanned: '{sender} 解封了 {target}'`
  - en 同步（`{sender} invited {target}` 等）
- 落位：B 类新补丁 `701-client-locale-member-names.patch`（vendor locale 改动必须走 patches/，series 登记，inject 重放验证）。

## 决策记录

| 编号 | 决策 | 类型 | 用户裁定 | 理由与边界 |
|---|---|---|---|---|
| D1 | 修词条而非改代码拼串 | Mechanical | approved | 代码层已传参且同文件 name/topic 族词条即占位符范式；拼串会让词条库失去 i18n 意义 |
| D2 | 走新补丁 701 而非改 473 | Mechanical | approved | 473 是 locales 基线大补丁（历史 hunks 不可搅动）；增量补丁追加在 series 尾部，可独立回滚 |

决策留痕写入本任务 worktree 的 `.swarm-yuan/decisions.jsonl`。

## 验证

- 先红后绿：词条占位符守门（zh/en 各 8 词条）+ formatStateEvent 端到端（invite 产出「fanfan 邀请了 chen」、join 产出「chen 加入了」）。
- 目标测试 → matrix-chat 全目录 → 全量 `npm test` → `npm run build`。
- 活体走查：房间时间线系统事件显示账号名。
- 净树验证：`npm run clean && npm run inject` 后测试仍绿（补丁可重放）。

### 实测回填（2026-10-27）

- 先红后绿：词条占位符守门 zh/en 各红 1 例（旧词条裸文案），端到端 2 例先即绿（证实代码层无缺陷，病灶纯在词条）。
- 净树验证：`OVERLAY_ALLOW_LIVE_CLEAN=1 npm run clean && npm run inject` 后 701 正常应用，matrix-chat 全目录 16 文件 67 用例全绿。
- 全量 `npm test`：929 文件（923 过/6 跳过），6,631 用例 6,620 过/11 跳过 0 败（rc=0）。`npm run build` 通过，verify-dist 零命中。
- 活体走查结果见交付说明。

### 未验证项

- ban/kick/leave 路径仅单测覆盖（本房间无此类事件可走查）。

## 设计文档影响

DESIGN_SYNC: none——纯文案缺陷修复，不触及整合正本与数字总账记载面；由节点⑦审查背书。

## 风险与回滚

- 回滚=移除 series 中 701 一行并重注入；无数据迁移。
