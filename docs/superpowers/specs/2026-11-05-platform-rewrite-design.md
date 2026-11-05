# AIStudio 平台重写：身份、证据、交付与推演核心一次性切换

> 日期：2026-11-05
> 状态：已评审，待书面复核
> 类型：refactor / 安全与架构级变更
> 关联：2026-11-05 全仓批判性复盘；`2026-10-23-swarmstudio-integrated-design.md`；`2026-10-23-swarmstudio-design-ledger.md`

## 任务卡审查七项

### 业务完成条件

新平台在同一提交上独立完成身份认证、统一授权、执行审批、注入部署、产物证明、发布准出和推演运行；旧写入路径全部退役。全部负例先红后绿，主干全量测试、类型检查、完整构建、qgate 与 simharness 套件通过，一次性迁移演练可重复，实物验证未覆盖处明确标为未验证。

### 输入与来源

输入来自当前仓源码、补丁 series、用户与权限数据库、运行证据、runtime manifest、路由注册链、SIM_ROOT 状态和发布载体。外部身份断言只在配置的 IdP 上验证；任何缺失、损坏、过期或来源不明的输入均为 unknown 或 fail，不补猜。

### 工作流边界

P0 先建立身份、授权、执行与证据核心；P1 在其上建立注入、部署、产物和发布核心；P2 最后替换推演 owner、清账和文档投影。三阶段在同一 worktree 顺序提交，全部验收后一次性切换。活动 SIM 轮次、生产服务和宿主运行树未隔离时不得执行切换。

### 工具与副作用

开发期只写本 worktree；测试使用临时目录、内存数据库和隔离 SIM_ROOT。迁移工具分 `--dry-run` 与 `--apply`，apply 前必须在仓外完成带摘要的备份。不得在测试中调用真实外部写操作，不得清理其他会话 worktree，不得停止非本任务进程。

### 结果与证据

每项能力输出结构化状态、主体、来源摘要、提交、时间和证据引用。证据统一为 `pass/fail/unknown/waived`；发布只接受当前 HEAD、当前 bundleId、当前注入摘要下的 pass。迁移输出逐域计数、冲突清单、备份位置和恢复指引，不记录秘密原值。

### 异常与恢复

补丁失败按 journal 回滚本次注入；部署冲突返回 partial；身份冲突返回 409；待激活账号返回 403；无授权写操作返回 403；证据缺失返回 unknown；烧机最新失败覆盖历史成功。切换失败时停止新服务，使用上一版本程序和切换前备份恢复，不在新旧核心之间双写。

### 验收反例

以下情况必须失败：跨 IdP 认领已有账号；pending 账号获得 JWT；空授权普通账号访问受保护 API；跨 profile 读写或裁决；未知 MCP 工具判 read；相对路径、符号链接或终端命令越出沙箱；空状态产生六闸首过；类型工具崩溃退出 0；失败补丁进入 applied；部署保留旧文件仍报告 complete；缺 runtime 资源仍通过构建；重启复用图 runId；红测试或 waived 证据普通通过发布；双 supervisor 同时持有 owner；旧烧机 pass 覆盖新失败；清场清除未闭环债务；路由催办被展示为已发送。

## 批准前六问

1. **决策**：本变更决定 AIStudio 是否从局部叠加治理切换到可证明的平台核心；由项目所有者批准，供六团队使用与审计。
2. **口径**：测试数、补丁数、路由数和版本号只从当次执行报告、series、真实注册链和发布载体生成，不从历史报告抄写。
3. **可逆性**：代码可经 git 回退；数据与运行态通过切换前仓外备份恢复。新旧核心不双写。
4. **署名**：项目所有者对一次性切换授权负责；实现会话对代码、迁移和验证证据负责；安全与发布验收由独立审查角色复核。
5. **停止条件**：出现备份不可恢复、迁移计数不平、未授权路径仍可写、核心测试持续红、活动推演无法安全停止或真实构建不可用时停止切换。
6. **语法**：本变更收紧权限、证据、预算、数据权属和发布准出语法；未登记写端点默认拒绝，未验证证据不计成功。

## 变更

### 1. 为什么必须重写

复盘实测发现，当前系统中同一成功词承载了不同事实：补丁名称进入清单被视为已应用，部署保留旧文件仍返回成功，空运行状态被算成六闸首过，发布清单对账与测试类型门脱钩。身份侧还存在 Matrix 用户只按 MXID 绑定、profile 路径参数未进入统一 ACL、审批读接口产生自动批准副作用等问题。

截至本轮独立统计，活跃补丁为 454 个，触及 403 个文件，其中 162 个文件被多个补丁修改，`routes.ts` 的补丁链长为 69。该数字本身不是缺陷，但它放大了任何状态误判的影响。继续在现有入口追加判断无法统一这些语义，因此用户选择平台重写和一次性全量切换。

### 2. 目标架构与目录边界

```text
custom/platform/contracts/       身份、授权、证据、注入、发布、运行的共享契约
custom/server/platform/
  identity/                      身份绑定、账号生命周期、会话签发
  authz/                         路由策略、能力授权、profile/session 归属
  execution/                     工具分类、审批、沙箱裁决
  evidence/                      证据记录、六闸状态、指标投影
  delivery/                      图运行身份、bundle 与发布证据
scripts/platform/
  inject/                        Planner、Executor、Journal、manifest
  release/                       测试、类型、构建、证据的准出编排
  migrate/                       备份、迁移、对账、恢复说明
  runtime/                       SIM owner、driver、resident、clean、receipt CLI
custom/client/platform/          pending、授权、证据、催办状态的用户呈现
registries/                      路由策略与客户端投影注册
simharness/                      仅保留平台 CLI 的 Shell 适配与场景逻辑
```

`custom/qgate` 继续负责命令执行、JUnit/TAP 重解析和门执行，不另写测试框架。新平台拥有证据身份、状态机和最终裁决，qgate 输出成为证据来源之一。现有 vendor 基线仍只经补丁修改；平台替换的是二开层的裁决核心，不是上游源码本身。

### 3. P0：身份、授权、执行与证据核心

#### 3.1 身份绑定与零权限建号

1. 新契约 `IdentityBinding` 至少含 `issuerOrigin`、`subject`、`userId`、`status`、创建与更新时间。
2. Matrix 的 `issuerOrigin` 使用 SSRF 校验后的规范化 origin，`subject` 为完整 MXID；显示名、localpart 和 Matrix 管理标记不参与本地授权。
3. 已有账号仅允许 origin 与 MXID 同时匹配。origin 冲突返回 409；旧账号 origin 为空或不可规范化时返回 409，由 super_admin 离线核实后修复。
4. 新外部身份保存为 disabled、空 profiles；不签发 JWT，不保存 Matrix access token，不更新成功登录时间。
5. super_admin 通过现有用户管理入口在一次事务中激活并分配 profile。普通 admin 空 profiles 在统一认证层拒绝，防止下游把空集合解释为不限制。
6. 本批保留现有 MXID 全局唯一约束；同一 MXID 的跨 origin 冲突明确拒绝，不做用户表重建来实现双 origin 共存。
7. 首个外部身份不得自动成为管理员。无可用 super_admin 时仅返回既有 break-glass 管理流程指引。

#### 3.2 统一授权

1. 建立路由策略注册表，声明公开性、角色、能力、资源来源与归属提取器。
2. 未登记写端点默认拒绝；公开端点必须显式登记。读端点仍需登录，除非属于公开白名单。
3. userenv 的 GET/PUT 按路径 profile 鉴权，未授权时不得先探测目录存在性。
4. autonomy 与 permmode 的写操作限 super_admin；permmode 读操作按 profile 授权。
5. 审批六源未形成统一归属协议前，审批收件箱整体限 super_admin。新 `ApprovalRequest` 必须携带 actor、profile、session、动作摘要、风险和归属；历史缺归属项只允许 super_admin 处置。
6. 所有拒绝发生在文件写入、审批响应、引擎切档和审计成功记录之前。

#### 3.3 执行与沙箱

1. 工具分类只接受明确元数据或精确动词规则。知名连接器中的未知工具不再默认 read。
2. 未知 MCP 工具产生 `mcp-unknown` 硬拒，不进入普通审批快道。
3. 文件路径按真实 `cwd/workspaceRoot` 解析；对 root 与 target 做 realpath，包含不存在文件的最近存在祖先；路径包含判断使用 `path.relative`。
4. root 不可规范化、目标越界或符号链接逃逸均 fail-closed。
5. 配置 `HERMES_TOOL_SANDBOX_ROOTS` 后，terminal/code 执行必须具有真实 OS 沙箱证明；当前直接 spawn 链不满足时返回 unavailable，不通过命令文本猜测安全性。

#### 3.4 证据与指标

1. 新证据记录至少含 `evidenceId`、`subjectId`、`status`、`producer`、`commit`、`startedAt`、`endedAt`、`sourceDigest` 与 `artifactRefs`。
2. 六闸完成键缺失即 unknown；打回证据优先于完成键；首过、补过和打回只从已知证据计数。
3. 任一闸 unknown 时不生成 M1 数值行；界面与报告呈现未观测，不显示 0/6 或 6/6 成绩。
4. `waived` 保留风险可见性，但不等于 pass。
5. 客户端类型工具缺席、崩溃、超时、信号退出或输出不可判定时统一退出 2，不写基线。

### 4. P1：注入、部署、产物与发布核心

#### 4.1 注入 Planner、Executor 与 Journal

1. Planner 从 series 生成有序计划，记录 channel、目标树、seriesIndex、内容 SHA-256 与新增文件。
2. manifest v2 保存 baseline treeOid、规范化 upstreamRoot、逐项实际状态、runtimeDeploy 和整体状态；兼容数组只从 applied 项派生。
3. 只允许已验证前缀之后的尾部增量。改名、修改、插入、删除、重排、baseline 变化、根变化和上次失败均要求 clean 后全量重放。
4. v1 manifest 可辅助 clean，但不能自动升级为可信 v2。
5. Executor 在任何写入前保存目标文件恢复数据，并先完成 runtime 部署预检。失败后停止同 lane 后续项，并按 journal 恢复本次改动。
6. manifest 采用原子写入；失败状态不得被 ensure 当作成功。删除 cockpit 路由存在即放行部分失败的逻辑。
7. clean 按 journal 中的目标树和新增文件恢复，所有路径做 root containment；清理失败保留非零状态。

#### 4.2 部署与统一入口

1. 保留“默认不覆盖宿主差异、--force 先备份”的安全边界。
2. `kept/conflict` 输出 partial；missing、复制或备份失败输出 failed；只有全部一致或成功同步才是 complete。
3. build、build:full、build-dmg、serve 显式调用同一个上游根解析和严格注入前置，不能依赖 npm 生命周期的偶然覆盖。
4. worktree 依赖共享必须核对 realpath 与注入后锁文件摘要；不匹配时明确失败并给出安装指引。

#### 4.3 产物身份与图运行

1. 构建生成 bundleId，绑定源码提交、vendor 基线、补丁摘要、runtime manifest 和必需资源摘要。
2. runtime 资源统一复制到真实 `dist/server/runtime`；pricing、roster、columns、governance 使用同一资源解析器。
3. verify-dist 与桌面 afterPack 共用资源清单，缺 server 入口、价目表、名册、列配置或 semantica bridge 时失败。
4. 新图运行与 fork 使用 UUID；旧序号事件保留读取、重建和恢复能力，新事件不得复用旧 runId。

#### 4.4 发布准出

1. 轻量 release:check 继续负责版本和清单对账；新 release:gate 负责真实准出。
2. release:gate 顺序执行 qgate 构建、全量测试、评测门、服务端类型、客户端类型、完整构建与严格证据报告。
3. 每个步骤产生当前 HEAD、当前 bundleId 和当前注入摘要绑定的证据；缓存证据不得用于发布。
4. FAIL、INCONCLUSIVE、CONDITIONAL、WAIVED、过期或缺席均阻断普通准出。
5. release:packages 在实际写包前调用 release:gate；dry-run 只展示计划并明确未执行准出。

### 5. P2：推演、清账与文档投影核心

#### 5.1 单一运行所有权

1. 用同一 TypeScript 模块和 CLI 提供 owner、driver lock、resident registry、clean lease 与 receipt 校验。
2. owner 记录 PID、kind、runId、instance token、启动时间、host 和规范化 SIM_ROOT；释放必须匹配 PID 与 instance。
3. product、Bash、relay 和 sim-launch 均经过该模块。三种启动顺序最多一个 owner 和一个 driver。
4. 判活同时检查 PID、命令身份与根路径；禁止用全局 pgrep/pkill 决定清理对象。
5. 同进程 start/tick 需要互斥；手工启动遇其他 owner 返回 409，自动启动让位并记录事件。

#### 5.2 清场、烧机与清账

1. 所有常驻角色登记到本 SIM_ROOT 的 resident registry；clean 先获得 clean lease，再在任何变更前检查活角色。
2. driver lock 统一使用 `.driver.lock.d/info` 的结构化记录；烧机不再读取不存在的 pid 文件。
3. 烧机收据绑定机制文件清单 digest、覆盖范围、日志摘要和终态。当前 digest 的最新记录必须 pass；后失败覆盖先成功。
4. prelaunch 同时要求工具自检和有效 pass 收据；dry-run、旧 digest、coverage 不足、坏 JSON 或缺失均阻断。
5. clean 前生成独立 clearance 活账投影；open、延后、无效 DISP 在 runs 删除后继续阻断。冻结归档与后续活账分名，不回改 tar。
6. DISP 按每个问题键的最后适用记录判定；修复需证据锚，观察需复核理由，延后不闭环，generic 不批量关闭不同问题。

#### 5.3 文档、催办与培训

1. 文档生成器复用真实 route manifest、发布清单、package 版本和 features；输出限定在 marker 块。
2. 提供 `--write/--check`，漂移时 check 非零；release:check 消费同一检查。
3. 催办状态分 routed/sent/received；当前仅实现 routed 时，sent 与 received 必须为 null，UI 不得显示送达成功。
4. 培训交互页只声明模拟完成；真实实操只指向手册对应章节。六团队章节指引由测试验证真实标题存在。

### 6. 一次性迁移与旧路径退役

1. 切换前停止本任务涉及的服务、supervisor、driver 和常驻角色，确认无活动写入。
2. 迁移工具在仓外备份用户库、身份绑定、审批状态、图事件、runtime manifest、SIM 清账和发布证据，生成逐文件摘要。
3. dry-run 输出逐域总数、可迁移数、冲突数、待人工数和恢复路径；计数不平即停止。
4. Matrix 来源冲突账号迁移为 disabled 待审；缺归属审批限 super_admin；活动 SIM 轮次必须先收官或归档。
5. 旧注入 manifest 不作为新成功证明；切换时执行完整 clean、迁移和新注入。
6. 切换后删除旧成功判定、旧 owner/lock 写入器和旧状态写入口，只保留历史档案只读读取。
7. 回滚使用上一版本程序与切换前备份；不提供新旧核心并行写入开关。

### 7. 主要改造面

- 新增平台契约与服务端核心：`custom/platform/contracts/`、`custom/server/platform/`。
- 新增平台命令：`scripts/platform/`；原 `scripts/inject.mjs`、`ensure-injected.mjs`、`build*.mjs`、`serve-server.mjs`、部署和发布脚本转为兼容入口或退役。
- 上游 Matrix、认证和路由骨架只经 `patches/` 修改。
- 客户端只修改 pending、授权、证据、催办和培训相关组件。
- 推演 Shell 脚本改为平台 CLI 适配，场景业务流程不重写。
- 整合正本、数字总账、README、使用指南、功能清单、运维参考和培训手册随最终切换同步。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 | 用户裁定 |
|---|---|---|---|---|---|
| Matrix 多 IdP 兼容 | 任意 IdP＋零权限建号 | 受信白名单；单 homeserver | 保留外部 IdP 兼容，同时由 disabled＋空授权切断自动提权 | UserChallenge | approved |
| 改造深度 | 平台重写 | 三周期局部契约修复 | 局部修复无法统一身份、证据、运行和发布的成功语义 | UserChallenge | approved |
| 迁移方式 | 一次性全量切换 | 新核逐域切换；只重写新增面 | 避免长期双裁决；以仓外备份、迁移对账和最终回归控制风险 | UserChallenge | approved |
| 新账号形态 | disabled＋空 profiles＋不签 JWT | 新增 member 角色；active 空授权 | 复用现有账号生命周期，避免空授权被下游解释为全通 | Mechanical | approved |
| 同 MXID 跨 origin | 409 冲突，不双建 | 重建 users 表支持双共存 | 当前全局 UNIQUE 仍在，高风险表重建超出安全止血所需 | Mechanical | approved |
| 审批归属未齐时 | 整体限 super_admin | 仅过滤列表 | 只过滤列表不能阻止直接 ID 裁决 | Mechanical | approved |
| 沙箱执行 | 无 OS 沙箱证明即拒绝 | Shell 文黑名单；只查 cwd | 命令展开、重定向和符号链接无法靠词法检查形成硬边界 | Mechanical | approved |
| 旧证据 | 只读迁移，缺证即 unknown | 自动收养为 pass | 历史记录不能证明当前提交和当前产物 | Mechanical | approved |
| 交付组织 | 单 worktree 三阶段提交，最终一次合入 | 三 worktree 分别合入 | 用户选择一次性切换，避免中间版本形成混合核心 | Mechanical | approved |

## 验证

### 1. 测试策略

1. 所有复盘缺陷先写负例并在旧实现上确认失败，再实现新核心使其通过；无法安全执行的真实利用只做静态链证明并明确标注。
2. P0 覆盖身份冲突、pending、激活授权、空授权、跨 profile、审批副作用、未知 MCP、路径与符号链接、终端无沙箱、空证据和类型工具故障。
3. P1 覆盖注入失败回滚、严格增量、v1 拒绝收养、按目标树 clean、部署 partial、统一根、runtime 资源、afterPack、图重启和发布红门。
4. P2 覆盖三启动顺序、陈 owner、PID 复用、resident 清场阻断、烧机 digest、清场后债务、DISP 末次处置、文档漂移和催办状态。
5. 使用变异探针验证关键守门测试确实能失败，不能只断言源码字符串存在。

### 2. 必跑验证面

- 根：`npm test`、`npm run typecheck:harness`、`npm run typecheck:client:ratchet`、`npm run build:full`、`npm run release:check`、`npm run release:gate`。
- qgate：构建及核心、缓存、严格报告测试。
- simharness：独立 Vitest、Shell 门、隔离边界、清场与清账测试。
- 注入：干净克隆或隔离副本上的 clean→inject→clean→inject，逐项摘要对账。
- 桌面：真实构建与 afterPack；未执行时不得宣称桌面安装包已验收。
- 活体：隔离 Matrix 身份链、真实 UI 走查和授权 SIM 烧机；外部依赖不可用时如实标记未验证。

### 3. 收口判据

1. 当前提交所有强制验证为零失败，skipped 与未执行项逐项登记。
2. 迁移 dry-run 与 apply 的逐域计数一致，备份恢复演练通过。
3. 旧写入路径代码和调用方清零，历史档案只读读取仍可用。
4. 整合正本、数字总账、手册、实现和发布清单一致。
5. 独立审查确认权限、证据和切换回滚没有自指验收。

## 风险与回滚

| 风险 | 缓解与回滚 |
|---|---|
| 一次性切换回归面大 | 单 worktree 三阶段行为测试、完整迁移演练和最终全量回归；失败不切换 |
| 旧账号来源缺失 | 转 disabled 待审，不自动绑定；备份保留原始行 |
| 旧审批缺归属 | 限 super_admin；不猜测 profile 或 session |
| 活动 SIM 状态无法安全迁移 | 切换前收官或归档；未闭环债务进入 clearance 投影 |
| 新注入事务中途失败 | journal 恢复原文件；失败 manifest 不作为成功输入 |
| 回滚时数据已写入新核心 | 停止写入后恢复备份；回滚窗口内不接受新业务流量 |
| 真实环境不可用 | 保持切换未完成，不用 mock 结果替代实物准出 |

## 设计文档影响

DESIGN_SYNC: none——本提交仅形成已批准的平台重写正本规格，尚未改变现行实现。P0/P1/P2 实施及最终切换批次必须将本声明修订为 touched，并同批更新 `2026-10-23-swarmstudio-integrated-design.md`、`2026-10-23-swarmstudio-design-ledger.md`、README、使用与运维手册；合入前以实际改动面核验，不以本声明预支完成状态。
