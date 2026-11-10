# 执行内核统一 P0b-2 / P1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐八个入口的统一审批账本，并让 ZCode 四挡权限在保留的编码后端与 Hermes 工具面使用同一词表和判定语义。

**Architecture:** P0b-2 保持现有执行行为不变，只在最终判定与启动成功点写账。Hermes 侧在 Python 审批守卫出口记录终态，IDE/群聊编码入口在 `handleCodingAgentRun` 的唯一点合成免审记录。P1 以 `config/execution-contract.json` 为唯一词表，新增纯函数权限判定器；ZCode 原生四挡直接下传，DSH 与其他入口经同一映射，Hermes 按工具风险类别执行 build/guarded/plan/yolo 的准入与记账。

**Tech Stack:** TypeScript / Node.js、Python 3.14、Vitest、pytest、AIStudio patches 注入链。

**Spec:** `docs/superpowers/specs/2026-11-10-execution-kernel-unification.md`

## Global Constraints

- 只保留 Ycode、Zcode、DeepSeek Harness 三个编码 app；注册表终态为 `zcode`、`dsh` 两项。
- 四挡只取 `build`、`guarded`、`plan`、`yolo`；`edit` 保留历史映射，禁止降为 `build`。
- 自动放行继续生效，但必须写 `approval.exempted`，含 `policyVersion`；账本失败不得阻断业务。
- `vendor/**` 不直接提交；改动必须生成补丁、登记 `patches/series` 并重放验证。
- 本批不删除 13 家后端，不关闭群聊业务并发，不声称已有 OS 沙箱。
- 本批不动另一在途 worktree `ekko-hermes-skill-store-unification` 的文件。

## Review Focus

- 同一审批调用不得因 Bridge 回调与 Python 守卫双写而重复计数：以 Python 守卫为终态唯一写者。
- 未配置档位的 IDE 编程任务仍按现有 yolo 行为执行，账本应如实记 `yolo`，不得伪造人工批准。
- `plan` 必须禁止写入与执行；`build` 对写入逐次询问；`guarded` 仅风险命中时询问；`yolo` 仍须经过硬拒绝底线。
- 账本缺失、路径不可写、契约未知档位均不得把业务调用变成静默放行或进程崩溃。
- 13 家承接清单必须区分“源码确认”“未采集”“已承接”，禁止把注册表存在当作能力已吸收。

---

### Task 1: P0b-2 Hermes 审批守卫写账

**Files:**
- Create（经补丁）: `vendor/hermes-agent/tools/approval_ledger.py`
- Modify（经补丁）: `vendor/hermes-agent/tools/approval.py`
- Create（经补丁）: `vendor/hermes-agent/tests/test_approval_ledger.py`
- Modify: `patches/series`

**Interfaces:**
- Produces: `record_approval_decision(tool, result, session_id, profile, platform) -> None`，从审批结果识别 `user_approved`、`user_consent`、`pre_approved` 与 yolo/mode=off，写同构终态记录。
- Consumes: `HERMES_APPROVAL_LEDGER_DIR`，缺省 `HERMES_WEB_UI_HOME/approval-ledger`；缺路径或写失败只记日志，不阻断。

- [ ] 写失败测试：yolo 放行、人工放行、人工拒绝、硬底线拒绝、缺目录 fail-soft 各一条；断言敏感命令原文不落账。
- [ ] 运行 pytest 确认新模块缺失而失败。
- [ ] 在 Python 守卫公共出口接唯一记录点，避免 `_approved()` 等底层构造函数重复写账。
- [ ] 运行目标 pytest 与既有 approval 测试，确认行为返回字典不变。
- [ ] 生成补丁、登记 series、clean+inject 重放并提交。

### Task 2: P0b-2 IDE 与群聊编码入口写账

**Files:**
- Modify（经补丁）: `vendor/hermes-studio/packages/server/src/modules/studio/services/chat-run/handle-coding-agent-run.ts`
- Create: `custom/__tests__/coding-agent-approval-ledger.test.ts`
- Modify: `patches/series`

**Interfaces:**
- Consumes: `synthesizeExempted()`、`fourModeOf()`、`sessionModeOf(profile)`。
- Produces: `entryPoint=ide-coding-agent` 或 `group-chat-coding-agent`；`detail.codingAgentId` 只落后端标识。

- [ ] 写失败测试：启动成功各产生一条 exempted；启动失败不产生；群聊与 IDE 的 entryPoint 正确；未配置档位记 yolo。
- [ ] 在启动成功单点接线，失败路径不写放行记录。
- [ ] 运行目标 Vitest、coding-agent 既有测试和账本测试。
- [ ] 生成补丁、登记 series、重放并提交。

### Task 3: P1 四挡判定器与 Hermes 工具面接线

**Files:**
- Modify: `custom/server/executioncontract/index.ts`
- Create: `custom/server/executioncontract/mode-policy.ts`
- Create: `custom/__tests__/execution-mode-policy.test.ts`
- Modify: `custom/server/toolpipeline/tool-hooks.ts`
- Modify: `custom/server/zcode/mention-dispatch.ts`

**Interfaces:**
- Produces: `evaluateFourMode({mode, tool, riskClass}) -> {action:'allow'|'ask'|'deny', recordType, decidedBy}`；未知档位 fail-closed 为 `ask`，不猜成 yolo。
- Produces: `zcodeNativeMode(mode)`，仅返回 `build|guarded|plan|yolo`；`edit` 历史映射单独处理。
- Consumes: Hermes 审批结果中的 `user_approved`、`user_consent` 与硬拒绝字段。

- [ ] 用参数化测试锁定四挡 × 工具风险矩阵、未知档、edit 历史值与硬拒绝优先。
- [ ] 实现纯函数判定器，不在判定器内做 IO。
- [ ] Ekko 瀑布改从当前会话档位取数；放行与待审/拒绝分账，ledger 故障不改变判定。
- [ ] mention-dispatch 的 `ENGINE_MODE_MAP` 结果归一为四挡原生值，禁止再由二值开关覆盖。
- [ ] 运行四挡矩阵与既有工具瀑布测试并提交。

### Task 4: P1 ZCode/DSH 原生档与承接清单

**Files:**
- Modify（经补丁）: `vendor/hermes-studio/packages/server/src/modules/coding-agents/services/runtime/run-manager.ts`
- Modify（经补丁）: `vendor/hermes-studio/packages/server/src/modules/coding-agents/services/zcode/chat-turn.ts`
- Modify（经补丁）: `vendor/hermes-studio/packages/server/src/modules/coding-agents/services/dsh/chat-turn.ts`
- Create: `config/coding-backend-absorption.json`
- Create: `custom/__tests__/coding-backend-absorption.test.ts`
- Modify: `patches/series`

**Interfaces:**
- Produces: 启动上下文的 `permissionMode: ModeId`；ZCode `--mode` 直接消费四挡，DSH 适配器接收同一档并保留人工权限请求。
- Produces: 13 家 × 十面承接清单，状态只允许 `source-confirmed`、`implemented`、`not-collected`、`waived`；未签字不得 waived。

- [ ] 写启动参数测试：build/guarded/plan/yolo 原样到 ZCode；DSH 不再只收到布尔值；旧 edit 可回显但不作为新选择。
- [ ] 以契约目录和真实注册表/配置模板生成 13 家清单，标出证据路径与未采集项。
- [ ] 守门断言白名单、退役家数、状态枚举、waived 签字和每项证据锚点。
- [ ] 运行 Vitest、pytest、typecheck:harness 与全量回归。
- [ ] 更新 spec 验证段、DESIGN.md、索引与 decisions，独立审查后合入。
