# 会话级数据流护栏（敏感读 → 外发链路拦截）（2026-10-21）

> 来源：微软 AGT 调研轮二。文章第七章头号承认空白——「治理的是动作，不是推理」：
> `read_database` 与 `send_slack_message` 各自都合规，链起来就是客户名单外泄；
> 跨会话变体借持久记忆把攻击链摊到多个会话上，每个会话单看都干净。
> 本仓现状同款：执法门/策略引擎都是**单调用**裁决，没有「链」的维度。
> 并行会话（agt-governance-absorption，A-F 六件）也不覆盖此面——本件补位，零撞车。

## 设计

**定位**：tool-hooks 瀑布的独立执法钩子（`ekkoToolExecuteHooks` 链尾），
不动 enforce-gate / policy 引擎（并行会话在改前者）。链尾语义由 patch 565
瀑布短路保证：排在前面的钩子拒绝即短路，**只有真正会执行的调用才记污点**。

**规则（会话键 = sessionId，缺席回落 profileId，再缺席不执法）**：

1. **敏感直发拒**：外发面调用 + 本次入参已含敏感内容 → 拒（`sequence-sensitive-send`）。
2. **污点外发拒**：外发面调用 + 本会话在 TTL 窗口内触碰过敏感内容 → 拒（`sequence-taint-deny`）。
3. **敏感触碰记账**：非外发调用但入参命中敏感模式 → 记污点（工具名+时刻，**不落参数值**），放行。

**敏感模式**（env `HERMES_TOOL_SEQUENCE_SENSITIVE` 覆盖，缺省凭证面正则）：
`.ssh/`、`.aws/credentials`、`id_rsa`、`id_ed25519`、`.env`、`.npmrc`、`.netrc`、
`secrets?.(json|yaml|yml|txt)`、`credentials?`。与工具策略起步规则的凭证面同源。

**外发面**（确定性判定，不做语义猜测）：`toolCategoryOf(tool)==='network'`
（browser_click/type/press、delegate_task）∪ MCP 动态工具名含
send/publish/upload/post/commit/push/notify/webhook。env
`HERMES_TOOL_SEQUENCE_SINKS` 追加工具模式（尾部 * 前缀）。

**窗口与规模**：TTL 缺省 30 分钟（`HERMES_TOOL_SEQUENCE_TTL_MS`）；会话表上限
500，超限逐出最旧。状态仅进程内（重启清零=保守收紧，不落盘）。

**失败语义**：护栏内部异常 fail-closed 拒（执法链纪律；总闸默认关，爆炸半径可控）。
**总闸**：`HERMES_TOOL_SEQUENCE_GUARD=1` 才生效（缺省 0=零行为变化，同执法门先例）。

**留痕**：拒绝发 govbus security/high；同时落执法决策账
（rule=`sequence-taint-deny`/`sequence-sensitive-send`），既有
`/api/harness/policy-decisions` 与治理事件流面直接可见，不新建 UI。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 独立钩子而非策略引擎新动作 | 并行会话在改 enforce-gate；链尾挂载零撞车，且污点状态天然是会话级不是单调用级 |
| D2 | 敏感源=入参值文本命中（不限工具类别） | `cat ~/.ssh/id_rsa` 是 exec、`read_file` 是 read——按类别枚举必漏；文本匹配口径单一可解释 |
| D3 | 外发面只认确定性形态（类别/动词） | 文章自己也只做模式检测；语义判读「这段话算不算外泄」需要理解内容，不做 |
| D4 | 状态进程内不落盘 | v1 最小面；重启清零=窗口收紧不是放宽，方向安全。跨重启/跨会话序列属后续轮 |
| D5 | 拒绝而非挂审批 | 审批桥消费语义绑定 callHash（单调用），污点场景批一次≠链路安全；v1 拒+人话指引，走人工开闸（关总闸/等 TTL/新会话） |
| D6 | 决策账带 rule 前缀 sequence- | 与 policy-* 裁决同账本不同前缀，聚合面天然分流 |

## 变更清单

- 新增 `custom/server/toolpipeline/sequence-guard.ts`：纯判定 + 会话污点表 + 钩子。
- 改 `custom/server/toolpipeline/tool-hooks.ts`：`ekkoToolExecuteHooks` 链尾挂 `sequenceGuardHook()`。
- 新增 `custom/server/toolpipeline/__tests__/sequence-guard.test.ts`。
- 改 `package.json`：typecheck:harness 纳入新文件。

## 边界（本轮不做）

- 跨会话/跨重启污点（持久记忆变体）——需落盘状态与清理面，单独轮。
- 审批式放行（污点场景的定向批单）——审批桥语义扩展后另做。
- 知识治理（RAG 检索源授权）与 outcome 校验——仍是空白。
- UI 面板——govbus 事件流与决策账已有视图，不重复建面。

## 验证

- `npx vitest run custom/server/toolpipeline`：73/73 通过（含新增 10 例；执法门/
  审批桥/审计瀑布零回归）。
- `npm run typecheck:harness`：零错误（sequence-guard.ts 已入清单）。
- `npm test` 全量：5601 通过 / 3 失败——失败三例经 `git stash -u` 在干净 main
  （54691bea）上复现为同款失败，均为他人本轮合入面的既有问题，与本件无关：
  - `custom/client/ia2/__tests__/unified-nav-guard.test.ts` v12.4 窗控守门
    （断言 IaShell.vue 含 `event.key === 'Escape'`，源/测漂移）；
  - `custom/server/controllers/ide/__tests__/zcode-usage.live.test.ts` ×2
    （真库 `~/.zcode/cli/db` 活体探针，随机器态波动）。
  本件相关套件全绿，不为他人的红阻断合入；该三例应回给对应会话处理。
