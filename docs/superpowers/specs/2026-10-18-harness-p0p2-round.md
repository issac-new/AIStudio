# Harness 改进队列 P0-P2：身份裁决、审批凭证、运行清单、七维评测、沙箱与经验回流（spec）

日期：2026-10-18
分支：`feat/harness-p0p2`
来源：`docs/superpowers/specs/2026-10-18-harness-research-gap-analysis.md` 的剩余队列，按 P0→P2 顺序落地。

## 变更

### P0-1 按发起用户裁决（`toolpipeline/enforce-gate.ts`）

- `preExecute` 上下文补 `userId/sessionId/runId`；`evaluateEnforcement` 的 `EnforceEnv` 增加 `userId` 与 `identityOf`。
- 新增策略链第 0 层：`agentidentity` 中按 `id` 或 `name` 匹配到 `userId`，且 `toolAllowlist` 非空时，工具必须精确命中或以 `*` 前缀命中；否则拒绝，规则 `identity-tool-denied`；命中则 `identity-pass` 后继续走阶梯/模式链。
- 无身份记录或 `toolAllowlist` 为空 = 未声明，不改变现有行为（诚实边界：不把“没登记”当“已治理”）。

### P0-2 审批凭证补全与放行审计

- `ApprovalLogEntry` 增加可选 `scope`、`expiresAt`、`source`（human/policy/system），向后兼容旧记录。
- 收件箱 `/:id/decide` 各分支写入 `source: 'human'` 与 `scope/expiresAt`；自动放行写 `source: 'policy'`。
- `enforce-approvals` 记录增加 `expiresAt`（默认取挂起 TTL）与 `source`；过期批单不可消费，同调用再次挂单时重置为新 pending。
- `/api/approval/decide`（规则学习）补写审批历史与 govbus 事件，避免“学了规则但没有决策记录”。
- 新增 `toolpipeline/policy-decisions.ts`：每次执法裁决（放行与拒绝）追加一行 JSONL（工具/用户/profile/会话/规则/风险/时间），独立于工具执行审计，避免 govbus 事件洪泛；提供查询面与 `/api/harness/policy-decisions`。

### P1-3 运行清单与运行级成本（新增 `custom/server/runmanifest/`）

- `RunManifest`：runId/sessionId/userId/profile/model/provider/apiMode/reasoningEffort/promptHash/contextRevision/permissionMode/toolContractVersion/workspace/startedAt。
- 落盘 `~/.hermes-web-ui/run-manifests/YYYY-MM-DD.jsonl`（0600，14 天保留），按 runId 幂等。
- 生产者在 chat-run 启动处经新 patch 调用（模型与模式解析完成后、会话创建前后）；prompt 只存 SHA-1 指纹，不存正文。
- `GET /api/harness/run-manifests?sessionId=&runId=&days=` 查询。
- 运行级成本：读取 trace（`HERMES_TRACES_DIR` 可覆写），汇总 manifest.startedAt 之后的 LLM chunk usage，用 `tokens/pricing` 估价；未收录模型金额为 null，不瞎算。

### P1-4 固定能力评测集七维覆盖 + 门禁

- 扩展 `eval/__tests__/eval-regression.test.ts` 内置集到七个任务，分别覆盖：任务完成、工具参数、失败恢复、长任务状态保持、权限越界/注入、成本与无效循环、人工升级正确性。
- 断言仍为纯 S0（regex/threshold/risk），样本为固定 fixture；它守的是“评测引擎对七维都能给出判定”，不是“某个 agent 在七维都达标”，交付说明如实标注。
- 新增 qgate L1 门 `engineering.harness-eval`（命令 `npm run test:eval`，failure=block），`vibe-fast` 的 `enable: engineering.*` 自动启用；L3 的 `behavior.eval-regression` 保留给高保证档。

### P2-5 执行沙箱与失败经验回流

- 沙箱（执法门内，仅 `HERMES_TOOL_ENFORCE=1` 时生效）：
  - 路径：`HERMES_TOOL_SANDBOX_ROOTS`（冒号分隔）配置后，`terminal_exec` 的显式 `cwd/workdir` 与文件工具的 `path` 必须在任一根内，否则拒绝 `sandbox-path`；未配置=不检查（不假装有沙箱）。
  - 网络：`HERMES_BROWSER_ALLOWLIST/DENYLIST` 配置后，浏览器类工具从入参提取 URL，按 `browsersec` 的 denylist 优先规则裁决，拒绝 `sandbox-network`。
- 经验回流：`expcandidates` 的提取面新增 qgate run 扫描，把 FAIL/CONDITIONAL 门的 `gateId + failureSummary` 转成 antipattern 候选（指纹幂等）；注入仍由 `EXPERIENCE_INJECT=1` 控制，避免未经审核的经验直接进简报。

## 决策记录

1. **身份裁决不追溯未登记用户**：只有登记过的身份且声明了 toolAllowlist 才执法；否则沿用 profile/阶梯/模式链。理由是现有部署大量用户没有身份台账，直接拒绝会制造大面积停摆，也不符合“未配置不装已治理”。
2. **放行审计用独立 JSONL 而非 govbus**：执法门每次工具调用都会裁决，写入 govbus（CAP 2000）会冲掉真正需要关注的安全事件；独立账本可查询、可轮转，不影响事件流。
3. **审批凭证加期限，但从批准起算**：待审单不设期限（不会在收件箱里腐烂）；人工批准后按挂起 TTL 生效，过期不可消费，同调用重试会重置为新 pending。这样既防止“三个月前批过的命令今天仍可执行”，又不让人工来不及处理的单子消失。
4. **运行清单只存提示词指纹**：正文可能含敏感信息，哈希足以回答“两次运行用的是不是同一套提示词”，又不制造新的泄露面。模型参数只记录实际可得的 apiMode/reasoningEffort，温度等未取到就留空，不造假。
5. **七维评测守的是评测引擎**：仓库内没有可离线重放的七维真实轨迹，固定 fixture 只能证明引擎对七维都有判定与聚合；真实能力评测需要接入运行轨迹样本，列为后续项。
6. **沙箱 opt-in**：没有配置根目录/域名时不做任何拦截，避免误伤既有工作流；配置后是硬边界，不走审批桥。
7. **经验候选与注入分离**：qgate 失败自动成为候选，但必须人工审核并显式开启注入；自动注入未审核经验会把一次偶发失败固化成长期指令。

## 验证

- 定向测试：`enforce-gate`（身份/沙箱）、`approval`（字段/期限/放行审计）、`runmanifest`、`eval-regression`、`expcandidates`。
- 全量 `npm test` 与 `npm run typecheck:harness`。
- patch 用 `git apply --check` 验证可应用；不做整包 inject（共享树被并行会话占用）。
