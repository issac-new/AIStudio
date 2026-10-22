# 长程任务可信执行层（trust）

来源文章：《我发现了渗透Agent长程任务的秘密》（FreeBuf，2026-09-28，https://mp.weixin.qq.com/s/Y1xerjN6eV0Bl4mABskqjQ ）。
文章复盘了 Sonic Harness 支撑 100 小时不间断 Agent 渗透测试的工程机制，核心判断是：长程任务的稳定性不取决于模型更聪明，而取决于执行框架能否让未经校验的"我完成了"无法生效。

## 变更

新增一个独立的服务端域 `custom/server/trust/`，把文章的四件机制落成产品能力：

1. **逐条主张三态审计**（`claims` / `audits`）：执行者提交结构化主张与证据锚，审计者逐条给出 `verified | unverified | refuted`。审计者身份必须不同于主张人；`verified` 至少需要一个机器可核验的证据锚（`file:` 必须存在于完整性清单，`git:` 必须是提交号形状，`sha256:` 必须是摘要形状）；同时给出 `file:` 与 `sha256:` 时，摘要必须与基线清单里的文件摘要一致，等价于审计者自己跑了一遍 `sha256sum`。只有自然语言说明不能判 `verified`。这与文章"Executor 的叙述不纳入证据范畴"一致。
2. **完成态双准入**（`admit`）：任务状态的唯一写入方是执行框架，不是 Agent。接口只接受"完成提议"，由框架自己读取最新审计裁决与工作区完整性状态；两条同时满足才写 `admitted`，否则强制降级为 `untrusted` 并累加 `forgeAttempts`。客户端传入的任何 `state` 字段一律忽略。
3. **工作区完整性栅栏 CSWI**（`integrity`）：审计开始时采集一次 SHA-256 清单（小文件全量哈希，超过阈值的文件退化为大小+修改时间），准入时再采集一次并比对。任何新增、修改、删除都判 `violated`，并且覆盖审计者自报的 `clean`，决策记录写明"以框架观察为准"。清单带排除目录、文件数上限与截断标记，覆盖不完整时如实标记 `truncated`。
4. **原子断点与恢复核对**（`checkpoint`）：案件状态用临时文件+原子替换写入；断点记录轮次、案件摘要与工作区摘要。恢复核对重新采集工作区清单，返回 `consistent | diverged | workspace_missing`，对应文章的"崩溃后从最近落盘点恢复"。

配套改动：

- `custom/server/harness/harness-controller.ts` 以子路由挂载 `/api/harness/trust/*`，不新增 bootstrap 补丁。
- `custom/server/trust/cli.ts` 提供本地命令行入口（`open / claim / audit / admit / checkpoint / verify`），供推演脚本或 Agent 运行时直接调用，退出码 `0=admitted`、`2=untrusted`、`3=错误`。
- 客户端在⑥治理阶段新增页签「长程可信」（`?tab=trust`），展示准入结果、伪造尝试次数、逐条裁决、完整性差异、角色工具面单调链与断点一致性。
- 服务端模块加入 `npm run typecheck:harness` 的显式文件清单。

## 决策记录

- **D1 独立域，不改推演驱动**：工作区规则限定只能修改 `overlay/`，`simharness/` 为只读消费方。因此本批把机制做成可被推演脚本通过 HTTP 或 CLI 调用的独立执行面，不改 `aipay-scenario.sh`。后续接入点见"D6 已知边界"。
- **D2 提议与写入分离**：`POST /cases/:id/admit` 只接受 `{ proposal, auditorReportedIntegrity, actor }`，不接受状态。状态由 `evaluateAdmission()` 纯函数计算后由存储层写入。重复提交不改变已满足条件的结论；失败提议每次都累加 `forgeAttempts`。
- **D3 审计独立性**：审计记录带 `auditor`，与主张的 `claimedBy` 相同即拒绝（400 `auditor_must_differ_from_claimant`）。同一主张以最后一条审计为准；审计记录自身进入前向哈希链，改写会现形。
- **D4 CSWI 时点**：基线在调用 `begin-audit` 时采集（对应文章"审计阶段开始前"），准入时采集终态。执行阶段产生的改动不算违规，审计阶段内的改动算违规。大文件阈值默认 1 MiB，可用 `bigFileBytes` 覆盖。
- **D5 工具面单调链**：内置三角色 `manager(0) < auditor(只读) < executor(只读+写入)`。校验三条：manager 是 auditor 子集、auditor 是 executor 子集、auditor 不含任何写入或命令执行工具。工具清单是静态注册表，不读取运行时配置，避免把"当前恰好没配置"当成保证。
- **D6 已知边界**：本批不做三件事，明确不声称已具备：① 不新建独立进程、容器或操作系统用户来隔离三个角色（当前是同一进程内的逻辑隔离与工具面校验）；② 不把准入接到上游 `/api/hermes/kanban/complete`（需要新增上游补丁，接入点是 `upstream/hermes-studio/packages/server/src/modules/hermes/controllers/kanban.ts` 的 `complete` 处理器，留给后续批次）；③ 不自动恢复 Agent 会话，只核对断点与工作区是否仍然一致。
- **D7 存储与安全**：默认目录 `~/.hermes-web-ui/trust`，`HERMES_TRUST_DIR` 可覆盖；每案一份 JSON，写入用临时文件+原子替换。工作区根目录默认限制在家目录与系统临时目录内，`HERMES_TRUST_ROOTS`（冒号分隔）可覆盖；解析后做真实路径前缀校验，越界返回 403。接口只返回相对路径、大小与摘要，不返回文件内容。
- **D8 页面位置**：放在⑥治理阶段页签，而不是新开专题页。页签由 `STAGE_TABS` 单一事实源驱动，导航、面包屑、深链自动生效，不需要新路由、新功能开关或上游语言包补丁。

## 验证

服务端：

```bash
npx vitest run custom/server/trust/__tests__/trust.test.ts
npm run typecheck:harness
```

覆盖点：三态裁决的合法性与审计独立性、`file:` 证据在清单中存在性、双准入四种组合、伪造尝试累加、自报 `clean` 被 CSWI 覆盖、大文件退化校验、排除目录与截断标记、工具面单调链、原子断点与恢复核对、哈希链改写现形、路径越界拒绝。

客户端：

```bash
npx vitest run custom/client/ia2/__tests__/long-horizon-trust.test.ts
```

覆盖点：⑥治理注册 `trust` 页签且组件映射存在、面板在空态/错误态/正常态下的锚点渲染。

整体：

```bash
npm test
cd custom/qgate && npm test
```

界面走查：`npm run dev`（8649，后端 8647），打开 `/app/stage/govern?tab=trust`，核对空态、新建检查后的案件列表、详情展开与验收文案。本轮不装机。
