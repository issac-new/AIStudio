# Harness 残余项：委托范围、恢复判定、过程指标、采样、预算、沙箱与 UI（spec）

日期：2026-10-18
分支：`feat/harness-next`
来源：`2026-10-18-harness-research-gap-analysis.md` 第四节「仍未完成」七项。

## 变更

### 1. 委托范围参与裁决（`agent-identity` + `enforce-gate`）

- `DelegationRecord` 增加可选 `toolAllowlist?: string[]`；`delegate()` 与治理 REST 接受该字段。
- 生效规则：执法时**双清单同时校验**——身份自身 `toolAllowlist` 与活跃委托的结构化白名单并集都必须放行；任一未覆盖即拒绝。委托只能收窄、不能扩大身份权限。
- 身份 `toolAllowlist` 为空（未声明）时只按委托范围校验；委托只写自然语言 `scope` 而没有结构化工具列表时，不额外限制（不把无法机读的文本当权限）。
- 未登记身份、空白名单、无活跃委托均不改变既有行为。

### 2. 自动恢复判定（新增 `resume/resume-planner.ts`）

- 统一 run 键：图检查点按 `runId` 读取（状态/下一步/interrupt/成本/时间），agent 检查点按 `sessionId/runId` 匹配交接目录与进展目录。
- 输出三档：`auto_resume`（检查点新鲜、无 pending interrupt、无冲突标记）、`manual_gate`（有 pending interrupt 或检查点过旧）、`new_session`（无检查点/检查点损坏/session 不匹配）。
- 只给判定与证据，不自动执行；`GET /api/harness/resume-plan?runId=&sessionId=` 返回判定。
- 新鲜度阈值可配（`HERMES_RESUME_MAX_AGE_MS`，默认 2 小时）。

### 3. 过程质量指标（新增 `observability/process-quality.ts`）

- 从工具审计与 trace 计算：重复调用率、工具失败率（无效步骤代理）、超长链占比（步数 > 阈值）、首过成功率（无失败工具的 run 占比）、qgate 规范符合率（PASS/(PASS+FAIL+CONDITIONAL)）。
- `GET /api/harness/process-quality?days=`；数据缺席返回 `null`，不造数。
- 九层体检的 Evals/观测证据接入这些指标（可选字段）。

### 4. 真实轨迹采样（新增 `eval/trace-sampler.ts`）

- 把真实 session trace 转成 Eval Studio 可用的 sample（transcript、toolCalls、efficiency、risk 标记），`POST /api/hermes/eval/sample-from-trace` 返回 sample；不自动写评测集（避免污染密封集）。
- 工具参数与结果只保留摘要，敏感值脱敏；缺 trace 返回 404 语义。

### 5. 预算事前阻断/降级（新增 `tokenbudget/budget-policy.ts`）

- 策略存储：按 `profileId` 或 `userId` 配置日预算（USD）与动作 `warn|downgrade|block`。
- 支出计算：复用 run manifest + trace 估价（60 秒缓存）；无价目模型不计入金额但计入“未定价 run”计数。
- `GET /api/harness/budget-status?userId=&profileId=` 返回当日支出/限额/建议动作。
- 执法：`HERMES_BUDGET_ENFORCE=1` 且策略动作为 `block` 时，enforce-gate 在工具调用前拒绝（规则 `budget-exceeded`）；`downgrade` 只返回建议（模型切换属上游路由，裁决层不擅自改模型）。

### 6. 完整沙箱（新增 `sandbox/sandbox-lease.ts` + patch 662）

- 租约：每次 run 登记 workspace/临时目录与到期时间；janitor 只删除**配置根目录下**、名字匹配 runId 的过期目录，root 未配置不删任何东西。
- OS 级限额：patch 662 给 ekko `terminal_exec` 加可选资源包装——`HERMES_TOOL_RLIMIT_CPU_SEC/FSize_MB/NPROC`（macOS/Linux）与 `RLIMIT_MEM_MB`（仅 Linux，macOS `ulimit -v` 不支持），通过 `/bin/sh -c 'ulimit …; exec "$@"'` 施加；未配置时命令路径完全不变。
- `POST /api/harness/sandbox/lease` 登记，`POST /api/harness/sandbox/sweep` 手动清扫；失败/缺配置如实返回。

### 7. 治理页可视化

- 新增 `HarnessRunOpsSection.vue`：执法决策账（放行/拒绝/规则聚合）、运行清单（模型/权限模式/成本）、过程质量指标三块，数据来自新增 `/api/harness/*`，失败态自管。
- 挂到「治理中心 → 驾驭工程」页，i18n 中英成对。

## 决策记录

1. **委托 scope 只认结构化工具列表，且只能收窄**：自然语言 scope 无法可靠解析，硬解析会误伤；结构化 `toolAllowlist` 是唯一可执行语义。执法用“身份 allowlist ∧ 委托白名单”双检查，避免委托成为提权通道。
2. **恢复判定只建议不自动执行**：自动续跑可能重复副作用；先给证据与三档建议，执行仍走既有 resume 端点。
3. **过程指标用代理口径并写明**：工具失败率是“无效步骤”的代理，不是完整语义判定；报告里标注代理关系。
4. **采样不自动入库**：真实轨迹可能含敏感内容或不适合作为固定题；采样 API 返回 sample，由人决定是否建集。
5. **预算阻断 opt-in**：默认只观测与建议；显式 `HERMES_BUDGET_ENFORCE=1` 才阻断，避免一次配置错误停掉所有 agent。
6. **OS 限额按平台能力落地**：macOS 不支持 `ulimit -v`，内存限额只在 Linux 生效；不假装 macOS 有内存上限。
7. **清扫只动自己管的目录**：janitor 只删 sandbox root 下匹配租约的目录，root 未配置时拒绝清扫。

## 验证

- 定向测试：身份委托、恢复判定、过程指标、采样、预算、沙箱租约、UI 组件。
- `npm test` 全量 + `npm run typecheck:harness`。
- patch 662 用 `git apply --check` 验证；不执行整包 inject。
