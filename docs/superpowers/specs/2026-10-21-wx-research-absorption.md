# Spec：三公众号调研吸收——本体 Action 层 / 工具契约面 / 调用闸 / 裁判校准 / 退化禁发 / 任务账本（2026-10-21）

## 背景与目标

用户指令：深调研三篇微信文章及三位作者公众号的全部文章，汇总整合，完善 SwarmStudio（用子智能体并行加速）。语料 295 篇（枚举与缺口见 `docs/2026-10-21-wx-3accounts-research.md` §1），七个子代理分块精读产出 126 条借鉴项；对照 SwarmStudio 基线（五处空白/部分），本轮实施六项最有共识的补齐——每项都有至少两家来源互相印证或直击已盘点空白。

## 实施内容

1. **本体可执行 Action 层（T-Box 契约层）**
   - `ontology-types.ts`：`ActionType`（id/label/iri/provenance/targetTypes/kind 四级/inputSchema/outputSchema/preconditions/approval/permissionTags/idempotent/auditNote/modality）+ `actionIri` + `effectiveApproval`（write/execute 缺省 mandatory）+ `specStats.actionCount`；`OntologySpec.actionTypes?`（旧 spec 读取兼容=空）。
   - `ontology-validate.ts`：四道闸——dup-action / action-target-unknown / action-precondition-unknown / action-no-authz（write·execute 无 permissionTags=error）/ action-unidempotent（execute 未声明幂等=warning）。
   - `ontology-export.ts`：JSON-LD 与 Turtle 增 `core:Action` 节点（rdfs:domain=目标类型、core:actionKind/approval/permissionTag/precondition/idempotent/inputSchema/auditNote）。
2. **工具契约扩展**：`ToolParamSchema`（JSON Schema 子集）+ `validateAgainstSchema`/`validateToolCallArgs`；`ToolAuthRule` 三模式 + `authzAllowed`（无声明放行=向后兼容）；`rateLimitPerMinute`；`TOOL_CONTRACT_VERSION=2026-10-21.1`；web_search（schema+限速）与 kanban_*（permission-tag）为示范声明。
3. **callgate 域**：熔断三态纯函数（recordFailure/recordSuccess/breakerAllows/beginHalfOpenProbe，按资源隔离）+ 滑窗限流 tryAcquire + admit（次序：熔断>速率>并发；队列容量内排队否则拒）+ degradeActionFor 五档降级阶梯 + retryPermitted（OPEN 禁重试/半开只放探测）+ CallgateRegistry（可注入时钟，缺省规则 fail-open）。
4. **评测裁判×人工一致率 + 盲测**：`human-agreement.ts`（collectAgreementPairs 只认 source=human 且 previousValue 在案；cohenKappa；judgeHumanAgreement 出裸一致率/κ/混淆/假通过假失败清单/档位）；`blind-review.ts`（blindTrimmedMean 截尾均值：并列极值各截一、<4 人降级全量、不足最少评审数不给分；blindPairChoice 背靠背盲选平票如实 tie）。端点 `GET /api/hermes/eval/runs/:id/agreement`、`POST /api/hermes/eval/blind-reviews/trimmed-mean`。
5. **指标退化禁发闸**：`release-hold.ts` evaluateReleaseHold（候选绝对闸 fail 先拦；三项数值相对基线对比越线即 hold；基线缺失如实 no_baseline；no_data 指标跳过）。端点 `GET /api/hermes/eval/runs/:id/release-hold?baselineRunId=`。
6. **统一任务生命周期账本**：`taskledger.ts`（InstructionLifecycle 七态 + kanban/A2A/pipeline/matrix 四源映射纯函数，未登记值返回 null 不猜 + isTerminal）+ `taskledger-store.ts`（JSON 账本 tmp+rename 原子写、upsert、终态锁定、no-op 不写盘）。端点 `GET/POST /api/harness/taskledger`、`GET /api/harness/callgate`（观测面）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | Action 层先落 T-Box 契约（声明+校验+导出），不落执行运行时 | 壹号讲狮：Action 是唯一写通道，契约先行才有治理面；执行运行时需接审批域与写回管线，单轮做不完 | 直接做 Proposal 执行闭环（范围过大，列入挂账#2） | 是（纯增量字段） |
| D2 | write/execute 动作缺省 approval=mandatory 且 permissionTags 必填（error 级） | 执行治理宁严勿宽：「无 authz 的写动作等于裸后门」 | 缺省 none 靠人工声明（漏声明即裸奔） | 是 |
| D3 | κ 校准只加聚合层，复用 recordHumanVerdict 的 previousValue 基线 | 机判基线已落库且「只记第一次不漂移」，重造标注管道无增量 | 新建人工标注黄金集存储（银翼建议的完整形态，挂账） | 是 |
| D4 | 盲测分数不回写判词、独立读数 | 不污染机判账；分歧样本另有仲裁链路 | 盲测分并入七维加权（污染机判口径） | 是 |
| D5 | 退化闸无基线时不 hold、如实 no_baseline | 首版无稳定基线时一刀切会冻结发布；诚实契约=缺口披露而非虚报已比对 | 无基线即 hold（过度阻断） | 是 |
| D6 | taskledger 是只读投影+登记账本，不接管五源状态机 | 各源状态机自有语义且在生产运行；统一口径以映射层供给（DDD：投影读模型） | 改造五源写入路径统一到 Instruction（侵入面过大，挂账#7 接线） | 是 |
| D7 | 映射不上的源值返回 null 拒绝登记 | 不猜口径；null 计数本身就是口径缺口的产品面 | 未知值兜底映射到 pending（制造假统一） | 是 |
| D8 | callgate 本轮只给域+观测端点，不接线执法 | 执法接线需动 LLM 客户端与 MCP 网关（跨 upstream 面，须 patch），单独成轮 | 本轮直接接线（patch 面扩大、验证成本超轮） | 是 |
| D9 | 工具契约新字段全部可选、无声明不检查 | 向后兼容：旧契约语义零变化；示范声明只挑参数面稳定的工具 | 全量补 schema（上游工具参数面未盘点，臆造即错） | 是 |
| D10 | 语料库留在 /tmp、精读笔记与索引入库 docs | 295 篇约 1MB 属原始语料，仓库只留加工产物；/tmp 清理后可由合集 API 复抓 | 全量语料入仓（体积与价值不匹配） | 是 |

## 验证

- 域内测试：`npx vitest run custom/server/{ontology,toolcontract,callgate,eval,taskledger,harness}` = 41 文件 393 用例全绿（新增：ontology-actions 9、tool-contract-schema 9、callgate 10、human-agreement 8、release-hold 5、taskledger 10）。
- 类型门禁：`npm run typecheck:harness` rc=0（新文件已入白名单）。
- 决策门禁：本文件含「## 决策记录」段（十行五列）。

## 挂账

见 `docs/2026-10-21-wx-3accounts-research.md` §5 编号清单（14 项高价值未实施项）。
