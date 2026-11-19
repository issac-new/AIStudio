# 不可变交付版本：验收绑定到确定交付物

> 日期：2026-11-19
> 状态：实施中（用户指令「继续 完成所有」）
> 来源：SoduWork 结果交付支柱的 `ArtifactVersion`（checksum/commit/state + 新版本作废旧版本）
> 关联：`2026-11-19-delivery-truth-acceptance.md`（逐条 AC 验收报告）、`2026-11-19-skill-call-authorization.md`（同日治理批）
> 读者：需要判断「这次验收审的是不是当前交付物」的审查者与运维

## 变更

### 问题

逐条 AC 验收报告解决了「审没审」，但没有解决「审的是不是当前交付物」：

1. 验收报告只绑定 `reviewRequestedEventId`（评审周期），同一周期内重新打包/覆盖产物不会被发现。
2. 完成契约的 receipt 有产物 sha256，但只存在于「已声明 AC/dod」的完成回执；`request_review` 路径不接收 receipt。
3. kanban 附件表只有 size，没有内容哈希；`delivery_snapshot` 证据只是 base/head 字符串。
4. 没有「新版本自动作废旧报告」的语义。

### 范围

**新增**

- `runtime/hermes_cli/delivery_version.py`：交付清单（bodySha256 + 附件 sha256/size/missing）、内容 checksum、`delivery_version` / `delivery_version_superseded` 事件、幂等与自校验。
- `runtime/tests/hermes_cli/test_delivery_version.py`：4 例（创建/幂等、新附件 supersede、body 变化换 checksum、坏版本识别）。

**修改**

- `runtime/hermes_cli/kanban_db.py`
  - `request_review`：评审交接事务内记录交付版本，`review_requested` payload 增加 `deliveryVersionId`/`deliveryChecksum`。
  - `complete_task`：直通完成也冻结一次交付清单（同 checksum 幂等）。
  - `_independent_acceptance`：存在 active 版本时，报告必须携带同一 `deliveryVersionId`/`artifactChecksum`；版本自校验失败即拒。
- `runtime/hermes_cli/acceptance_report.py`：报告 schema 增加可选 `deliveryVersionId`（`dv_` 前缀）与 `artifactChecksum`（64 hex），规范化返回。
- `runtime/tools/kanban_tools_schemas.py`：`kanban_complete.metadata` 说明补充交付版本绑定。
- `runtime/tests/hermes_cli/test_acceptance_report.py` / `test_acceptance_gate.py`：新增版本字段与版本不匹配/缺失用例。
- `runtime-manifest.json`：登记 `delivery_version.py` 与测试。

**不做**

- 不新建 `task_delivery_versions` 表、不加数据库级不可变触发器：本批用 append-only 事件 + 内容寻址；强不可变表结构留待后续批。
- 不把 `deliveryVersionId` 接入 HumanGate `DecisionGrant`：审批失效仍走既有 `taskRevision`；本批只作废「旧验收报告」。
- 不做 TS evidence 展示投影；看板 UI 暂不显示版本号。

### 验收判据

1. `request_review` 后存在 `delivery_version` 事件，payload 含 `versionId`/`checksum`/`content`/`seq`；`review_requested` 带同一组值。
2. 同内容重复记录不追加事件（幂等）；新增附件后旧版本被 `delivery_version_superseded` 标掉，`latest_delivery_version` 返回新版本。
3. 独立验收报告缺 `deliveryVersionId` → 拒，blocker `delivery_version_missing`，detail 含当前 active 值。
4. 报告 checksum 不匹配 → 拒，blocker `delivery_checksum_mismatch`。
5. 版本自身 checksum/内容不一致 → 拒，blocker `delivery_version_corrupt`。
6. 没有 active 版本的历史卡保持兼容（不追溯造版本）。
7. 既有 67 例验收/完成契约测试全绿；广域 kanban 回归无新增失败。

## 任务卡

### 完成条件

任务有可寻址的交付版本；验收报告必须绑定当前 active 版本；新版本创建后旧报告自然失效。

### 输入与来源

任务 body、`task_attachments` 持久附件（读文件算 sha256）、`review_requested` 周期；版本事件是唯一事实源。

### 工作流边界

只改 Python runtime 的评审/完成内核；不建表、不改 HumanGate、不改看板 UI/TS evidence 展示。

### 工具与副作用

`request_review`/`complete_task` 写事务内追加 `delivery_version` 与 supersede 事件；读取附件文件只算哈希，不改内容。

### 结果与证据

`task_events` 的 `delivery_version` 事件含完整 content（bodySha256 + attachments[{id,filename,size,sha256,missing}]）；`acceptance_report` 事件含绑定的 versionId/checksum。

### 异常与恢复

附件缺失 → `missing:true, sha256:null`，不猜；版本自校验失败 → 拒完成；旧报告 → `delivery_version_mismatch`；没有版本 → 兼容放行（历史卡）。

### 验收反例

同内容重复记录不应新增事件；新附件不应复用旧版本；报告缺版本应拒；报告 checksum 错应拒；手改事件内容应被 `verify_delivery_version` 识别。

## 决策记录

### D1 事件作为版本事实源，不建新表

任务/事件/附件/完成门都在 kanban DB；新表要加迁移、写闸、导出导入、重建一致性，成本远高于收益。事件是 append-only，配合内容 checksum 已能表达「不可变 + 可寻址」。强不可变（触发器/唯一约束）留待有明确审计需求时再做。

### D2 checksum 只覆盖内容字段

`checksum = sha256(canonical({taskId, bodySha256, attachments}))`，不含 `seq/createdAt/source`。理由：同内容重复记录必须幂等；时间/序号不是交付物内容。

### D3 版本创建点选 `request_review` 与 `complete_task`

`request_review` 是实现方最后一次交接，且已把 scratch 产物落持久附件；直通完成没有 review，在 `complete_task` 冻结。两处都走同 checksum 幂等，不会重复。

### D4 附件哈希在版本创建时计算

不在附件写入时强制哈希（要改表与所有写路径）；版本创建时流式读文件算 sha256，缺失记 `missing`。代价是重复 IO，但附件上限 25MB 且有界。

### D5 历史卡不追溯

没有 active 版本的历史卡，独立验收仍按旧规则（报告 AC/周期/独立性）通过。理由：追溯造版本会把「当时没有的事实」补出来，违反不造假。

### D6 报告字段可选但版本存在时必填

`acceptance_report` 的 `deliveryVersionId`/`artifactChecksum` 在 schema 层可选，由 `_independent_acceptance` 根据是否存在 active 版本决定是否必填。理由：同一报告 schema 兼容历史卡与新版卡。

## 验证

```sh
cd .claude/worktrees/sodowork-followups/vendor/hermes-agent
~/.hermes/hermes-agent/.venv/bin/python -m pytest \
  tests/hermes_cli/test_delivery_version.py \
  tests/hermes_cli/test_acceptance_report.py \
  tests/hermes_cli/test_acceptance_gate.py \
  tests/hermes_cli/test_kanban_verification_levels.py \
  tests/hermes_cli/test_completion_contract.py \
  tests/hermes_cli/test_completion_contract_gate.py -q
```

结果：**67 passed**。

广域 kanban 回归（21 文件）：**245 passed / 6 skipped / 8 failed**；8 个失败与 main 基线同红（review lifecycle 5 + project pause 3），非本批引入。

未覆盖：真实多 Agent 会话走查；HumanGate 旧授权作废；看板 UI 展示；数据库级不可变。

## 设计文档影响

DESIGN_SYNC: none

理由：新增运行时事件契约与验收字段，不触及整合正本、数字总账或架构图；版本 schema 以 `delivery_version.py` 与 spec 为单一事实源。
