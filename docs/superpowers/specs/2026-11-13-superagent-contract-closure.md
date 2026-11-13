# 超级智能体调研吸收第一批：交接合同与证据完整性闭环

> 日期：2026-11-13
> 状态：已评审（用户于 2026-11-13 批准，进入实施计划）
> 来源：《从超级智能体，到超级智能团队》（AI安全迪哥，2026-11-08，https://mp.weixin.qq.com/s/Gb7dSqR68GBNlYTTrIyrPg）
> 范围：用户已选择「A 分两批闭环」。本 spec 只批准第一批三项修复；第二批只记录边界，不在本批实施。
> 写作形态：AIStudio 四段速用形态，另附任务卡、安全约束和测试左移设计。

## 0. 任务卡审查七项

### 0.1 业务完成条件

三个缺陷分别由行为测试证明：隐藏 profile 的任务不能被三个写 handler 修改；全文归档失败时原始工具结果逐字返回；显式严格 schema 的子代理在最终输出不合格时不得报告完成。既有宽松 schema、同 profile 写操作和正常归档行为不回归。

### 0.2 输入与来源

输入来自现有 Koa 看板写请求、`delegate_task` 的 `tasks[]` 和 Hermes 工具结果。认证身份与 profile 映射沿用现有用户体系；schema 沿用 JSON Schema；工具结果不新增外部存储或外部服务。

### 0.3 工作流边界

三个写 handler 必须先过既有 `authorizeTaskIds` 再调用 CLI。严格模式只影响显式声明它的委派，不改变默认宽松模式。归档失败必须在摘要模型调用前终止压缩并返回原文，不能降级成“无全文可回溯的摘要”。

### 0.4 工具与副作用

看板副作用仍是现有 patch/delete/decompose CLI；未授权时副作用调用次数必须为零。委派只增加每任务布尔选项，不增加重试次数，仍最多纠正一次。归档仍写既有 spillover 区域，不扩大文件写权限，不引入新的幂等键。

### 0.5 结果与证据

严格 schema 失败的结果保留原始 `summary`、`schema_valid=false`、`schema_errors`。正常执行原本会完成时返回 `status=failed`、`exit_reason=output_schema_invalid` 和可诊断 `error`；中断、执行错误与 `max_iterations` 保留原终止原因，预算耗尽保留既有语义（`status=completed`＋`truncated=true`＋`schema_valid=false` 双旗识别，实现期勘误：终止类结果的状态不因严格标志改变）。归档失败记录 `passthrough_archive_error`，不生成 `<reduced-observation>`。

### 0.6 异常与恢复

任务不存在或不可见对受 profile 限制的身份统一返回 404，防止泄露任务存在性；super_admin 的任务不存在错误沿用现有 CLI 映射，本批不改变 `authorizeTaskIds` 对无 profile 限制身份的快速返回，也不为三个 handler 增加额外 CLI 预读。非法 board 沿用 400。`strict_output_schema=true` 但未提供 schema、或该值不是布尔类型时，在启动子代理前拒绝。归档返回空路径或抛异常均返回原文，后续 spillover 主流程仍可按既有规则再次尝试保存。

### 0.7 验收反例

必须拦住：admin/user 修改隐藏 profile 卡；归档失败后模型成功生成摘要并替换原文；严格任务连续两次输出不合格却为 `completed`；严格标志无 schema 仍启动子代理；宽松任务因新增严格分支而失去原始文本。

## 0.8 批准前六问

1. **决策**：确定第一批先修事实与证据闭环，而不是新建超级 Agent 层；由用户选择 A，交付给看板与委派调用方使用。
2. **口径**：差距以当前源码为准，不采用文章性能数字作为验收指标。Anthropic 数字只用于说明机制，DeepSeek Router 性能数字未完成原文复核。
3. **可逆性**：严格选项默认关闭，宽松线保持原样；补丁和 runtime 改动可由 git 回滚，无数据库迁移。
4. **署名**：主会话开发者负责实现，独立审查者负责核对权限与兼容性，用户批准本 spec 后生效。
5. **停止条件**：出现既有宽松委派大面积失败、同 profile 写路径被误拦、归档主链无法保存全文、补丁不能干净重放或全量回归新增红项时停止并回退。
6. **语法**：只调整权限检查覆盖、结构化结果的完成语义和证据降级顺序；不调整计费、考核、数据权属，不新增 Agent 或常驻进程。

## 1. 背景与目标

### 1.1 现状

调研确认 AIStudio 已有工具结果 spill/recall、Tool Search、Skills 三层加载、后台 worker、claim CAS 与局部独立验收，不应重复建设。当前第一批针对三个源码级缺口：

1. `patchTask/deleteTask/decomposeTask` 未调用其他写 handler 使用的 `authorizeTaskIds`，形成 profile 写授权不一致风险。该结论是静态代码事实，本批以 handler 行为测试验证并修复。
2. `runtime/tools/evidence_reducer.py` 在 `_write_to_spillover` 返回空路径或抛异常后仍继续生成摘要，可能让没有全文归档的 receipt 替换原始结果，违背函数自己的 fail-through 合同。
3. `delegate_task` 声明 `output_schema` 后，即使一次纠正仍未通过，结果也可为 `status=completed`。原始文本需要保留，但调用方缺少“schema 必须通过”的显式选择。

### 1.2 目标

1. 三个看板写 handler 与既有写路径使用同一授权函数，隐藏 profile 写入在 CLI 调用前返回 404。
2. 任何全文归档失败都逐字返回原工具结果，不调用摘要模型，不伪造可回溯证据。
3. 新增每任务 `strict_output_schema` 布尔选项；默认缺失/为 false 时保持当前宽松结果形状和状态语义，为 true 时最终 schema 不合格必须失败且保留原文。
4. 非目标：不新建 Router/Worker 层；不重建四层记忆；不改任务状态机；不强制所有看板任务独立评审；不改默认 schema 宽松行为；不实施第二批。

## 2. 决策记录

| 编号 | 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 | 依据问题号 | decisions.jsonl 行号 |
|---|---|---|---|---|---|---|---|---|
| D1 | 两批推进范围 | 第一批三项修复，第二批另立 spec | 一次完成全部版本化/验证/调度改造 | 用户选择 A；先清偿可独立验证的事实缺陷，降低大改耦合 | UserChallenge | approved | Q1 | 122 |
| D2 | 上游改造方式 | 三项各追加新补丁 769/770/771（reducer 代码正本在 runtime/，770 镜像 vendor；测试落 runtime/tests 与 771 内新增 vendor 测试文件） | 回写 013/614 | vendor 是钉版基线；重生成旧补丁会把后续同文件改动折叠进历史载体，独立补丁才可独立回滚 | Mechanical | approved | — | — |
| D3 | schema 完成语义 | 每任务显式 `strict_output_schema`，默认 false | 全局把所有 schema 失败改成 failed | 长研究任务的原文仍有恢复价值，不能全局打断既有委派；严格合同必须由调用方选择 | Taste | approved as proposal | Q1 | — |
| D4 | 授权实现 | 三 handler 复用 `authorizeTaskIds` 与 `requestBoard` | 各写一套 profile 过滤 | 单一事实源，隐藏任务统一 404，避免再次漏接 | Mechanical | approved | — | — |
| D5 | 归档降级 | 归档失败在模型调用前返回原文 | 继续摘要但标注无归档 | 没有全文时摘要不可核验，必须优先保真 | Mechanical | approved | — | — |

## 3. 变更

### 3.1 Requirement: 看板写授权一致化

`patchTask/deleteTask/decomposeTask` SHALL 在任何任务副作用前使用 `authorizeTaskIds` 检查当前请求的任务可见性，并 SHALL 使用 `requestBoard` 保留现有 board 校验与默认值。

#### Scenario: 隐藏 profile 任务写入

- **WHEN** 已认证 admin 或普通用户请求 patch/delete/decompose 一张不属于其可见 profile 的任务
- **THEN** handler 返回 404，且对应 `kanbanCli.patchTask/deleteTask/decomposeTask` 均未被调用

#### Scenario: 可见任务与超级管理员

- **WHEN** 同 profile 用户操作自己的任务，或 super_admin 操作任意 profile 任务
- **THEN** 授权通过并调用原有 CLI，返回格式保持不变

### 3.2 Requirement: 证据压缩归档失败保真

`maybe_reduce_observation` SHALL 在全文归档未得到可用路径时立即返回原始 content，且 MUST NOT 调用摘要模型或输出 reduced receipt。

#### Scenario: 归档返回空路径或抛异常

- **WHEN** reducer 已启用且工具结果达到阈值，但 `_write_to_spillover` 返回空路径或抛出异常
- **THEN** 返回值与原始 content 逐字一致，账本记录 `passthrough_archive_error`，摘要模型调用次数为零

#### Scenario: 正常归档与原有失败路径

- **WHEN** 归档成功且 receipt 通过逐字引用校验，或既有模型/密钥/引用校验失败
- **THEN** 分别保持正常 receipt 或原有 passthrough 行为，不改变其他阈值

### 3.3 Requirement: 委派结构化输出显式严格模式

每个 `tasks[]` 项 SHALL 接受可选 `strict_output_schema: boolean`。其默认值为 false；为 true 时必须有合法 `output_schema`。严格任务在一次既有纠正后仍不合格时 MUST 返回失败状态并保留未验证原文。只有正常执行且原本会进入 completed 的结果才把 `exit_reason` 改为 `output_schema_invalid`；不得覆盖 interrupted、执行错误或 max_iterations 的原始终止原因。

#### Scenario: 严格任务最终不合格

- **WHEN** 子代理首次输出与一次纠正输出均未通过 schema
- **THEN** 结果为 `status=failed`、`exit_reason=output_schema_invalid`、`schema_valid=false`，`summary` 保留最后原始文本，`schema_errors` 给出校验原因，且纠正次数不增加

#### Scenario: 严格任务纠正后合格

- **WHEN** 首次输出不合格而唯一一次纠正后合格
- **THEN** 结果为 `status=completed`、`schema_valid=true`，不新增失败字段

#### Scenario: 终止原因优先级

- **WHEN** 严格任务被中断、执行出错或耗尽 max_iterations，且最终文本不满足 schema
- **THEN** interrupted/error/max_iterations 的原始终止原因不被 output_schema_invalid 覆盖；预算耗尽保留既有语义（`status=completed`、`exit_reason=max_iterations`、`truncated=true`），机器消费者以 truncated＋schema_valid 双旗识别不可解析（实现期勘误：状态语义不因严格标志改变）

#### Scenario: 默认宽松与非法配置

- **WHEN** 未声明 strict 的现有任务最终不合格，或 strict 为 true 但没有 schema/类型不是布尔值
- **THEN** 前者保持现有 `completed + schema_valid=false + 原始 summary`；后者在启动任何子代理前返回明确参数错误

### 3.4 预计改动文件

补丁策略：三项修复各追加新补丁，不回写历史 013/614——重生成旧补丁会把后续补丁的同文件改动折叠进历史载体，且逐项独立回滚需要独立载体。

- `patches/769-server-kanban-mutation-authorization.patch`：三个 handler 接入既有授权函数与 board 校验。
- `custom/server/services/hermes/__tests__/kanban-mutation-access.test.ts`：新增控制器行为测试（mock kanban-service 与 users，先例 overview-access）。
- `runtime/tools/evidence_reducer.py`：归档失败提前返回（代码正本）。
- `patches/770-agent-evidence-reducer-archive-failthrough.patch`：同一改动镜像 vendor/hermes-agent 树。
- `runtime/tests/test_evidence_reducer_archive.py`：归档失败回归测试（runtime/tests 常驻套件，免注入即可跑）。
- `patches/771-agent-delegate-strict-output-schema.patch`：委派参数、校验、状态判定与新增 vendor 测试文件 `tests/tools/test_delegate_strict_output_schema.py`。
- `patches/series`：登记 769/770/771；不改既有补丁顺序。
- `config/mechanism-budget.json`：patches 计数随 series 实算抬位＋changes 条目。
- `docs/DESIGN.md`：能力边界表补一行「交接合同闭环」（见 §7）。

不新增门、钩子、脚本、账本、npm script 或依赖。

## 4. 复用、版本与安全约束

### 4.1 复用的稳定单元

- `authorizeTaskIds` / `requestBoard`：直接复用，不新写 profile 过滤规则。
- `_build_children` 的 `_delegate_output_schema` 附着点：同点附加 strict 标志，不另建配置通道。
- `_coerce_task_schemas`：同点校验 strict 与 schema 的组合，保证任何子代理启动前失败。
- `_validate_child_output_schema`：复用现有一次纠正，不新增模型调用。
- `_write_to_spillover` 与 efficiency ledger：复用既有归档和观测通道。

### 4.2 版本约束

无新增、升级或替换依赖。无数据库 schema、配置文件格式、路由和 UI 变更。

### 4.3 安全约束

- 权限检查覆盖三个写 handler 的水平越权路径；不可见任务与不存在任务都返回 404。
- 不记录原始任务正文、工具结果或密钥；测试使用虚构任务和诊断文本。
- 不拼接 SQL/shell，不新增路径输入，不关闭 TLS，不引入动态代码执行。
- 严格模式的原始 summary 只返回给原有父代理结果链，不新增外部投递面。

## 5. 验证

### 5.1 测试左移用例

| 特性 | M 主流程 | A 替代流程 | E 异常/边界 | T 终止与状态 |
|---|---|---|---|---|
| 看板授权 | 同 profile 三个写操作成功 | super_admin 可操作；super_admin 不存在任务沿用原 CLI 错误映射 | 隐藏 profile 404 且副作用零调用；受限身份任务不存在 404；非法 board 400 | 未授权后任务未被 patch/delete/decompose |
| reducer | 归档成功且 receipt 合法 | 既有模型失败/引用失败仍 passthrough | 空路径、抛异常均原文返回；不调用模型 | 不写 reduced receipt，记录 archive_error |
| strict schema | 首次合格即完成 | 一次纠正后合格即完成 | 两次不合格即 failed；strict 无 schema/非布尔在 spawn 前拒绝；中断/执行错误不被覆盖 | 保留 summary/schema_errors，纠正最多一次；max_iterations 保留原原因且 truncated=true，资源按原 finally 清理 |
| 宽松兼容 | 未声明 strict 的结果形状不变 | schema-less 不新增 schema 字段 | 宽松最终不合格仍 completed | 原文不丢，原有一次纠正不变 |

### 5.2 定向命令

```bash
npx vitest run \
  custom/server/services/hermes/__tests__/kanban-mutation-access.test.ts \
  custom/__tests__/kanban-admin-scope-guard.test.ts \
  custom/__tests__/kanban-patch-409-guard.test.ts

PYTHONPATH=runtime:vendor/hermes-agent python3.14 -m pytest -q \
  runtime/tests/test_evidence_reducer_archive.py

PYTHONPATH=vendor/hermes-agent:runtime python3.14 -m pytest -q \
  vendor/hermes-agent/tests/tools/test_delegate_strict_output_schema.py \
  vendor/hermes-agent/tests/tools/test_delegate_output_schema.py \
  vendor/hermes-agent/tests/tools/test_evidence_reducer.py \
  vendor/hermes-agent/tests/tools/test_tool_result_storage.py
```

判定口径：以上全绿；新增测试先在未修实现上证明至少各有一条失败，再实现到全绿。宽松既有用例 `test_schema_failure_returns_raw_text_with_schema_valid_false` 必须原义继续通过。vitest 侧读注入态源码，未注入树先 `npm run inject`；runtime 归档测试用 runtime 优先的 PYTHONPATH 锁正本。

### 5.3 回归与运行验证

1. `npm run clean && npm run inject`：补丁重放零 FAILED，并检查 013/614/769 目标文件含预期行为。
2. `npm run typecheck:harness`：服务端类型检查通过。
3. `npm test`：合并前全量通过；若失败，先区分 main 既有红与本批新增红，本批新增红必须清零。
4. 后端运行：按仓内隔离 serve 配方启动本 worktree，使用两个不同 profile 的测试身份对三个写端点各做一次隐藏/可见请求，记录状态码和 CLI 副作用；不做真实外部发布。
5. 变异探针：临时移除任一授权调用、归档提前返回或 strict 失败赋值，对应新增测试必须重新变红，随后恢复实现。

### 5.4 实测回填（2026-11-13/14，worktree feat/superagent-contract-p0）

| 项 | 实测 |
|---|---|
| Task 1 红绿 | 新测试先跑 9 failed/2 passed（隐藏 profile、同 profile、非法 board 全红）→ 实现后 13/13（含 2 个守门旧测试）；补丁 769 clean+inject 重放 complete，注入树 `authorizeTaskIds` 命中 16→20 |
| Task 2 红绿 | 新测试 3 failed（现状归档失败仍调模型）→ 实现后 81/81（新增 3＋reducer 17＋storage 61）；runtime/ 与 vendor/ 两份 `diff -q` 同构；补丁 770 重放 complete |
| Task 3 红绿 | 新测试 9 例先红（`_validate_strict_flags` ImportError）→ 实现后 45/45（新增 9＋宽松既有 36）；预算耗尽场景实现期勘误（见 §0.5/§3.3）；补丁 771 重放 complete |
| 预算门 | `governance-lint --budget` 0 problems；随批补账 scripts 137→138（第 138 个=ensure-vitest-birpc-patch.mjs，v1.0.16 批 766a92847 漏登，责任归属原批）；patches 实测 465≤562 |
| 实施勘误 | 归档测试落位 `runtime/tests/tools/`（spec 原写 runtime/tests/ 根）；PYTHONPATH 统一拼合树口径 `vendor/hermes-agent:runtime`（runtime/tools 无 `__init__.py`，命名空间包让位正包——行为测正本，双侧同构由 diff 断言） |
| 全量回归 | npm test 8906 例：首轮 6 failed→处置后本批新增红清零——①②设计索引（docs-ssot/interactive-training-manual）＝新 spec 未入索引，`gen-doc-indexes --write` 重建后 29/29 绿；③④deploy/inject 两测＝worktree 陈旧影子目录（首次 pretest 部署的旧 runtime 与 770 后模板 kept→partial），移出隔离后全绿；余 2 例 raw-hex＝main 同红存量（本批零客户端 CSS），cockpit 版本节 1 例＝分支落后 main 的 RELEASE-NOTES 0.8.21 行（main 实测绿，rebase 后复跑确认）。typecheck:harness 0 错；runtime pytest 155/155（152 基线＋3 新增） |
| 变异探针 | 3/3 有效：摘 deleteTask 授权→2 例红；摘归档短路→3 例红；摘 strict 翻转→1 例红；恢复后全部回绿 |
| 实施勘误 | 归档测试落位 `runtime/tests/tools/`（spec 原写 runtime/tests/ 根）；PYTHONPATH 统一拼合树口径 `vendor/hermes-agent:runtime`（runtime/tools 无 `__init__.py`，命名空间包让位正包——行为测正本，双侧同构由 diff 断言）；**坑：worktree 内改 runtime 模板后，首次 pretest 留下的 `.runtime-deploy-shadow` 会使后续注入/部署预检 partial 中止——移出该生成目录或用 `RUNTIME_DEPLOY_TARGET` 指新隔离目标** |

## 6. 风险与回滚

| 风险 | 缓解 | 回滚 |
|---|---|---|
| 授权误拦同 profile/admin | 同 profile、admin 隐藏、super_admin 三组行为测试 | 回退 013，不影响其他两项 |
| 严格模式被误用到长研究任务 | 默认 false，工具描述明确只有机器必须消费完整 schema 才开启 | 调用方移除 strict；实现可单独回退 769 |
| 归档失败增加上下文 token | 保真优先于省 token；由后续主 spillover 再尝试保存，不伪造摘要 | 回退 runtime 与 614 对应测试 |
| 补丁相互覆盖 | 分树生成并执行 clean+inject，目标文件逐段对账 | 恢复 series 与补丁文件，重新注入 |

## 7. 设计文档影响

`DESIGN_SYNC: touched`

`DESIGN_DOCS`：

- `docs/DESIGN.md`：能力边界表补一行「交接合同闭环（2026-11-13）」——看板三写入口统一授权、证据压缩归档保真、严格结构化委派；严格模式非默认须明示。
- 设计数字总账：**不触及**——本批无稳定设计参数变化；补丁计数按总账 §D 维护规则不入表（以 `patches/series` 实算为准，验证数字回填 spec 验证段）。

## 8. 第二批边界（本批不实施）

第二批必须另写 spec 并重新批准，候选项按优先级为：

1. 任务级 `version/expectedVersion` 与统一迁移 envelope（version/actor/time/reason/trace_id），覆盖 API、CLI、dashboard 写路径。
2. 按风险分级的完成验证策略，复用 Person fresh verifier、PR acceptance 与既有 claims/acceptance，不强制所有任务一律独立评审。
3. 将已有 `reasoningEffort` 和订阅 `wake/notify/context` 接入实际派单/投递，配套成本与覆盖度对照，不新建第三套 Router。

第二批启动前需第一批合入并回归稳定；不得借本 spec 直接修改任务表、done 状态机或 orchestrator 运行时。
