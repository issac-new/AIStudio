# M-A 协议 v2 轮——实施计划

日期：2026-09-20
状态：v1——待 shell 环境恢复后执行（Bash 故障在案，见 ncwk 记忆 zsh-enoent-bash-broken）
受众：M-A 实施会话（人或 agent），按本计划可机械执行
上游依据：架构 spec v1.1（`docs/superpowers/specs/2026-09-19-swarm-cockpit-architecture-design.md`）、MVP 拆解计划 M-A 节、`custom/client/matrix-teams/protocol.ts` 与 `delivery-protocol.ts` 现行源码（2026-09-20 通读）

## 0. 三句话主旨

M-A 把已批架构的协议面一次升到 v2：六个字段族（projectId、parentId/capability/phase/dependsOn、agent.profile、agent.message、R1-R4、signoffs）+ 两级项目索引，全部纯 A 类落在 `custom/client/matrix-teams/` 两个协议文件及其测试。读码后有三处与 spec 措辞不同的实施细化（§6），执行时以本计划为准并回写 spec 升 v1.2。前置只有一件事：fleet 的 Synapse 上实测 bot 账号注册通道。

## 1. 前置：注册通道验证（半日内闭环）

```bash
docker start matrix-synapse                                   # fleet 记忆：全停状态的重启路径
docker exec matrix-synapse sh -c 'grep -n registr /data/homeserver.yaml || true'
# 看两行关键配置：registration_shared_secret 是否存在；enable_registration 是否 false（应 false，走共享密钥）
curl -s -XGET http://localhost:8008/_synapse/admin/v1/register   # 应答 JSON 含 nonce，证明新 API 通道可用
```

通过判据：共享密钥存在 + nonce 可取。用共享密钥实注册一个 `@probe-agent:matrix.test` 跑通一次即算过（注册脚本沿用 fleet-setup.sh 里既有账号创建函数，勿另写）。任一判据不满足：把 Synapse 配置调整（开启 registration_shared_secret）纳入 M-A 范围，在 fleet 配置仓而非 overlay 改。

## 2. 代码任务

文件两枚 + 测试两枚，全部在 `overlay/custom/client/matrix-teams/`，纯 A 类，不触 patches、不做 UI。

### T1 `delivery-protocol.ts` 升 v2

1. `DELIVERY_SCHEMA_VERSION` 1 → 2；**解析器读面同时认 1 和 2**（knownVersion 改为 `raw.schemaVersion === 1 || === 2`），写面只写 2。理由：在途 v1 案例房不丢状态；未知版本（3+）仍 null 降级只读，纪律不破。
2. `CaseContent` 增 `projectId?: string`（≤64 字符）；`parseCaseContent` 同步。
3. `DELIVERY_GATES` 扩 `['G1'..'G6', 'R1', 'R2', 'R3', 'R4']`；`HUMAN_GATES` 扩为 `['G1','G5','R1','R2','R3','R4']`（R 门任何 verdict 须人类 sender，validateGateSender 零改动自动生效）。
4. `GateContent` 增 `signoff?: { decidedBy: string; verdict: GateVerdict; at: number }`（单条，见 §6 细化 3）；解析校验 verdict 枚举与必填。
5. 新增 `PROJECT_INDEX_ACCOUNT_DATA_TYPE = 'com.swarmstudio.project'` 与 `ProjectIndexContent`：`{ schemaVersion, projects: Array<{ projectId: string; title: string; roomIds: string[] }>, updatedBy, updatedAt }`，`MAX_PROJECTS = 50`、每项目 roomIds 沿用 `MAX_ROOMS`；`parseProjectIndexContent` 照 `parseIndexContent` 模式写。
6. 投影：`latestGateVerdicts` 聚合逻辑扩展——同 (caseId, gate) 的多条事件按 decidedBy 各取最新 signoff/verdict，聚合规则「全员 pass 才 pass，任一 reject 即 reject，否则 conditional」；新增导出 `aggregateSignoffs(gates: GateContent[])` 纯函数。

### T2 `protocol.ts`（注册房 + 任务事件）扩展

1. `TASK_EVENT_TYPES` 增 `message: 'com.swarmstudio.agent.message'`；`REGISTRY_ROOM_POWER_LEVELS.events` 增 `[TASK_EVENT_TYPES.message]: 0`（bot 可发）。
2. `AssignContent` 增四可选字段：`parentId?: string`（≤128）、`capability?: string[]`（≤10 项，每项 ≤64 字符、`/^[a-z0-9][a-z0-9:-]*$/`）、`phase?: string`（枚举校验用 `DELIVERY_STAGES`，从 delivery-protocol 导入）、`dependsOn?: string[]`（≤20 项）。**不新增 dueDate——`dueAt?: number` 已存在（protocol.ts:62），直接复用**。
3. `ReceiptStatus` 扩 `'waiting-human'`（HumanGate 挂起态落这里，执行轴六态收口：created/running/waiting-human/done/failed 五枚举 + stage 事件 outcome 的 started/done/failed 交叉印证）。
4. 新增 `AGENT_PROFILE_EVENT_TYPE = 'com.swarmstudio.agent.profile'`（state 事件，PL = 50 进 `REGISTRY_ROOM_POWER_LEVELS.events`）与 `AgentProfileContent`：`{ schemaVersion, agents: Array<{ agentId: string; agentType: string; capabilities: string[]; maxParallel?: number; needsHumanConfirm?: string[]; permissions?: string[]; lastReportAt?: number }>, updatedBy, updatedAt }`，`MAX_AGENTS = 20`、capabilities 规则同 T2-2；`parseAgentProfileContent` 照既有容错模式。
5. 新增 `parseAgentMessageContent`：`{ agentId, agentType, text }`，text ≤ 4000；非法返回 null，UI 回落普通文本（渲染留 M-D）。

### T3 测试（照 `__tests__/delivery-protocol.test.ts` 既有体例）

新增用例清单（每条一个 it，中文命名同现行风格）：

1. 版本双认：schemaVersion 1 与 2 的 case/gate/stage content 均解析；3 与未知 → null。
2. projectId 超长 / 非串 → null；缺省容忍。
3. R 门枚举：`aggregateSignoffs` 全 pass → pass、任一 reject → reject、混合 → conditional 三例；单判定人退化为单 signoff。
4. R 门 sender 负例：`@bob-agent` 发 R2 verdict，validateGateSender 报两条错（human 要求 + decidedBy 主体）。
5. `parseProjectIndexContent`：合法解析、projects 混非对象 → null、超 MAX_PROJECTS → null、roomIds 混非串 → null。
6. assign 扩展字段：capability 正例（`module:payment`）/坏例（大写、超 64 字符、超 10 项）→ null；phase 非 P1-P6 → null；dependsOn 超 20 项 → null；dueAt 保留原语义回归。
7. ReceiptStatus：waiting-human 合法、其他字符串 → null。
8. `parseAgentProfileContent`：合法解析（含可选项）、agents 超 20 → null、maxParallel 非正数 → null。
9. `parseAgentMessageContent`：合法、text 超 4000 → null、缺 agentId → null。
10. grep 守门扩面：新增四个类型字符串仍只出现在协议单文件（沿用 readFileSync+readdirSync 扫描法）。
11. 既有 31 例回归全绿（版本夹具从 1 改 2 时逐个更新，保留一条 v1 正例）。

### T4 文档同步

架构 spec 升 v1.2 回写 §6 三处细化；MVP 计划 M-A 节勾掉；PRD §4 任务树行状态更新。

## 3. 验收门（全过才收口）

1. §2-T3 用例清单逐条存在且绿；既有 31 例零回退。
2. `npm test` 在 overlay 根跑全绿（cwd 漂移坑：确认跑的是 overlay 面不是上游面，看输出头部路径）。
3. grep 守门零漂移（新类型字符串无第二处出现）。
4. 注册通道 runbook 一页入库（§1 判据 + 实测输出贴档）。
5. spec v1.2 回写完成，三方（PRD/spec/计划）状态一致。

## 4. 实施步骤

1. worktree：`git -C overlay worktree add /Volumes/nvme2230/lab/ncwk/.claude/worktrees/feat-ma-protocol -b feat/ma-protocol-v2 main`。
2. 测试前置：worktree 内挂 `feat/upstream` 符号链接与 node_modules 挂链（loop-multiview 轮已验证的方法）；先跑一次 `npm test` 确认基线绿再动代码。
3. T1 → T2 → T3 顺序提交（Conventional Commits：`feat(matrix-teams): ...`），随时可中断续跑。
4. 收口：rebase main → `npm test` 终跑 → `--no-ff` 合 main → 分支保留。

## 5. 回滚

纯增量 + 双版本读面，回滚 = revert 两个协议文件与测试的提交；无数据迁移、无房间破坏（v2 客户端读 v1 房间无感）。

## 6. 与 spec v1.1 的三处实施细化（执行以本计划为准，完成后回写 spec 升 v1.2）

1. **dueDate → dueAt**：spec §5.1 写「增 dueDate」，但 `AssignContent.dueAt` 已存在（protocol.ts:62，epoch 毫秒），复用不改名。
2. **执行轴落点**：不新增回执事件族，`ReceiptStatus` 扩 `waiting-human` 一枚举即收口六态（created≈received、running≈started/progress）。
3. **会签 wire 形态**：spec §5.4 写「content 增 signoffs[]」，实施定为「每事件单 signoff（本人），多人会签 = 多条 gate 事件，投影按 decidedBy 聚合」——sender 校验逐条生效，防冒语义更强，线上结果等价。
