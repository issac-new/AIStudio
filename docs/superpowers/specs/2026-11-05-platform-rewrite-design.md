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
| OS 证明可观测化（P1-1） | osSandboxProofActive 直接改名 osSandboxAttestation，不留废弃别名 | 保留旧名作 deprecated re-export | 全仓唯一消费方即执法门（grep 实证无其他调用方），别名只留死代码 | Mechanical | approved |
| declaredOnly 口径（P1-1） | 声明在案且三项探测（dockerenv/cgroup/sandbox-exec）无一命中即置位，不按声明口径匹配信号 | container 声明只认 dockerenv/cgroup 等同类信号 | vm 无文件系统级标记，按口径匹配会让全部 vm 部署恒报 declaredOnly（观测噪音淹没真信号）；事件携带全量探测信号供运维判读 | Mechanical | approved |
| 治理事件沙箱观测域（P1-1） | govbus 新增 sandbox 域收相对路径无基准等非拒绝观测事件 | 复用 security 域 | 拒绝留痕（security/high）与放行观测（info）分面，告警流不被观测噪音稀释 | Mechanical | approved |
| 无基准相对路径（P1-1） | 契约层返回 {skippedNoContext:true} 标记，执法门落事件并放行；fail-closed 拒绝留 P2 执行面统一 | 契约层直接拒绝；维持静默 null | 本任务只加可见性（P0 终审前置②书面裁定）；契约保持纯函数不落事件，事件归执法门（同 deny 事件先例） | Mechanical | approved |
| 路由重叠守卫接入点（P1-1） | assertNoPolicyPathOverlap 在 assertPlatformRoutePolicies 顶部调用（union assert 同点连带） | 改 patches/756 在 vendor 启动文件加第二处调用 | 启动对账已有 union 调用点，内联接入零补丁改动即覆盖真实启动；patches/ 变更受并行上限约束不必要触发 | Mechanical | approved |
| 证据记录改名（P1-2） | EvidenceRecord 三字段→九字段，subject→subjectId、source→sourceDigest 直接改名，不留旧字段别名 | 保留 subject/source 作废弃同义字段 | 唯一消费面 run-metrics 只读 status/supplement（grep 实证），旧字段无人消费；别名只留双轨歧义 | Mechanical | approved |
| commit 缺席口径（P1-2） | commit 键必须在场且取值 string|null（null=如实未绑定）；gate-evidence 产出附 declaredMissing 标记，run-metrics 调用点显式传 null，Task 9 接线传真值 | 允许 commit 键缺席（undefined 视同 null） | 「未绑定」必须与「遗漏」可区分：九字段校验把键缺席判非法，declaredMissing 让接线前的过渡态可审计而非静默 | Mechanical | approved |
| 证据存储错误面（P1-2） | appendEvidence 校验失败与写失败均向上抛，不吞 | 照 userperms/audit-store best-effort 只计数不抛 | 证据写失败被吞会让「以为记了」复活，与 P1 目标（记录在档不得伪装成功）直接冲突；audit-store 是业务请求面须 fail-soft，证据链是准出面须可见 | Mechanical | approved |
| 旧三字段行兼容读（P1-2） | 读面把 P0 形状 {subject,status,source} 行归一 LegacyEvidenceRecord（缺席字段 null+legacy 标记）；写面仍只收九字段 | 拒读旧行；或编造字段补齐九字段 | 兼容读取但缺席如实 null，不编造 evidenceId/producer/时戳（不猜原则）；坏行（JSON 损坏/校验不过）跳过不阻断读 | Mechanical | approved |
| manifest 逐项状态集（P1-3） | v2 逐补丁 status ∈ {applied,skipped,failed,rolled-back}，兼容数组只从 applied 派生；rolled-back 表达「本次会话曾应用后被事务回滚」 | 只用 applied/failed 两态（回滚项记 failed） | 回滚与失败语义必须可区分（回滚项无自身错误，失败项携带 apply 错误）；二者都不得进任何 success 投影 | Mechanical | approved |
| 增量拒绝分类次序（P1-3） | planIncrement 先位级前缀比对（rename/reorder/insert/modify），后长度差比对（removed）；集合级删除检查会让「同 sha 异名」误报 removed | 先做集合差再做位级比对 | 改名在集合视角=删旧名+增新名，位级 sha 等值是唯一的改名证据，必须先于集合判定咬住 | Mechanical | approved |
| 基线比对口径（P1-3） | baseline 记 {upstreamRoot, treeOids 三树}；任一侧为 null（树缺席/无 git）视为未观测不参与比对，双非空且不等才拒绝（root-change/baseline-change） | null 与任何值不等即拒绝 | standalone/无 git 树恒为 null，按不等拒绝会让部分检出永远无法增量；null=未观测不是基线承诺 | Mechanical | approved |
| v1 manifest 处置（P1-3） | planIncrement 对非 schemaVersion=2 一律 IncrementRefusedError('v1-manifest')，不自动收养 | 自动把 v1 appliedPatches 视作已验证前缀 | v1 只有名字数组无逐项状态/sha/基线，「曾记录」不可证明「已成功」——收养即复活伪装成功 | Mechanical | approved |
| 回滚域=失败 lane（P1-4） | 补丁失败时回滚该目标树（lane）本次会话已改文件；他 lane 不受牵连继续（既有树间独立语义：agent 失败从不阻断 studio） | 整会话全量回滚（跨树牵连） | studio/agent/zcode 是三棵独立树三个独立事务；agent 补丁失败牵连回滚 300+ studio 项属灾难面，且与历史容错语义冲突 | Mechanical | approved |
| 郄会话已应用项的回滚后状态（P1-4） | 回滚触及的已应用项改记 rolled-back（reason=after:<失败补丁>）；失败项自身记 failed（携 apply 错误） | 回滚项记 failed 或保留 applied | 回滚项无自身错误（是事务牺牲品），失败项携带真实 apply 错误——二者语义必须可区分；且 rolled-back 不得进 applied 投影 | Mechanical | approved |
| 部署预检失败不写 manifest（P1-4） | 预检 partial/failed 即中止：零补丁应用、不写 manifest（保留既有 manifest 原状）、results 全记 skipped/runtime-deploy-precheck | 写一个全 skipped 的 failed manifest | 预检失败时树未动——写 failed manifest 会毒化 planIncrement（last-failed）迫使用户无谓 clean；不写=修复部署漂移后可直接重试 | Mechanical | approved |
| 部署后置 partial/failed 降级（P1-4） | 补丁全部应用后 runtime apply=partial→整体 partial、failed→整体 failed，runtimeDeploy 字段如实记录两阶段 | 只记日志不改整体 status | 「补丁成功但部署 partial」若报 complete 即复活「保留旧文件仍报告成功」的 P0 实锤缺陷 | Mechanical | approved |
| journal 生命周期（P1-4） | 会话开始 reset（回滚数据只对本会话有效）；成功会话收尾 prune（回滚窗口关闭）；失败会话保留取证 | 永久累积或永不清理 | 失败会话的备份是取证面（对账回滚正确性）；成功会话再无回滚可能，累积=无谓占用 stateOut | Mechanical | approved |
| 脏树门与 v2 管理态（P1-5） | inject 先读 manifest 算增量：v2 noop/tail 时树为 manifest 管理态（注入产物是预期工作态），脏树门跳过；无清单/v1 才走「全量须净树」门 | 一律先过脏树门 | 注入态本就是脏树——门与管理态互斥；v1 无逐项状态不可信，维持净树要求（P0 行为不变） | Mechanical | approved |
| v1→v2 迁移通道（P1-5） | v1 manifest 可辅助 clean（反放+分树删新增文件），clean 收尾删除旧清单；随后 inject 全量重建 v2。ensure 对 v1 打印一次性迁移指引 exit 3，不自动收养 | ensure 自动把 v1 升级为 v2；或 v1 直接当成功放行 | 迁移只经「clean→inject」一条路（全量重放验证）；exit 3 与 0/1/2 区分让 CI/钩子可编程识别迁移态 | Mechanical | approved |
| clean 分树删除数据面（P1-5） | v2 clean 按 manifest 逐项 addedFiles×targetRoot 删除（containment 校验，越界拒绝+非零退出）；legacy 路径按补丁声明的目标树路由删除 | 维持旧实现（全部新增文件硬删在 hermesStudioRoot 下） | 旧实现是 P0 审查实锤缺陷：agent 树新增文件 clean 后永不消失、studio 同路径文件面临误删风险 | Mechanical | approved |
| clean 收尾删注入态指纹（P1-5） | clean 成功后删除 manifest 与 journal——树净=无注入态，下次 inject 全量重建 | 保留 manifest（旧行为） | 保留旧清单会让后续 inject/ensure 基于过期状态判断（P0 脏树假绿的根源之一） | Mechanical | approved |
| deploy 状态面（P1-5） | deploy-agent-runtime 末行 RESULT status=complete|partial|failed；exit 0/2/1；kept/conflict 一律 partial（--force 已覆盖的 conflict 亦然） | 只按 missing 退出非零（旧实现） | 「保留旧文件仍报告成功」是 P0 实锤缺陷；inject 预检/后置同步按退出码消费同一状态 | Mechanical | approved |
| ensure 假绿路径删除（P1-5） | 删除「cockpit 路由存在即放行 inject 部分失败」与「脏树无清单 exit 0」两条路径：inject 失败即非零；脏树无清单=不可验证=非零 | 保留放行（向后兼容） | 两条路径都是「尝试过伪装成成功」的实锤样本；P1 目标即消灭该语义 | Mechanical | approved |
| ensure 差量补套单写入门（P1-5） | series 领先 manifest（tail-append）时打印清单后 spawn inject 主链补套（runInjection 事务化+manifest 原子更新），ensure 不再裸 git apply | ensure 侧自建 applyDelta+手写 manifest（旧实现） | 单一写入路径消灭「手工登记 manifest」回退面；ensure 专职判定与守门 | Mechanical | approved |
| 证据 supplement 落盘口径（P1-9，task-2 审查 I1 清偿；round-2 修订） | supplement/declaredMissing 属 producer 层标记不落盘（九字段白名单投影滤除）；release:gate 产证全链携带当前 HEAD 真值（commit 恒非 null），「缺席」语义只在 producer 层表达。round-2 起（§4.4-3 接线清偿）：九键冻结不变，但 release:gate 证据的 sourceDigest 值面追加 bundleId 与注入清单摘要引用（值内引用非新键——身份绑定进既有 sourceDigest 字段，不为身份扩键）；release-report 步与 bundle-identity 终检证据锚定，身份缺席/过期（非本次构建产物）即准出失败 | 扩 store 白名单加第十字段；或身份另立新证据键 | 九键是结构冻结面，sourceDigest 本就是「判定来源摘要」——产物身份正是准出判定的来源之一，值内引用零结构变更；缺席拦截由终检承担不进每步证据 | Mechanical | approved |

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

### 4. P0 实施验证（2026-11-05）

Task 1-8 实施完成后的真实命令与计数（隔离 HOME=/tmp/aistudio-platform-p0-home.cTijpN，仅空 profiles 目录夹具、无凭证）：

- P0 目标测试 `npx vitest run custom/server/platform custom/server/userenv custom/server/autonomyladder custom/server/permmodes custom/server/approval-inbox custom/server/toolpipeline custom/server/mcpcatalog custom/server/governance custom/client/loop custom/client/shared scripts/__tests__/typecheck-client-baseline.test.ts`：103 文件 / 954 通过 / 0 失败 / 0 skip（custom/server/platform/evidence 含于 platform 目录）。
- `npm run typecheck:harness`：exit 0。
- 客户端棘轮 `typecheck:client:ratchet`：修复前 29 > 基线 18（新增 11 = ProactivitySection quietHours 双源 5 + HarnessImprovePanel 约束/晋级 DTO 缺字段 6）；Task 8 改 ProactivitySection 以嵌套 quietHours 为唯一数据源、客户端 workbench DTO 对齐服务端（ConstraintRecordDto、constraints、appliedVia/verificationTier）后 18 ≤ 18、exit 0；基线 config/typecheck-client-baseline.json 保持 18 未上调。
- 全量 `npm test`：1,078 文件通过 / 8 文件 skip；8,159 通过 / 16 skip / 0 失败，exit 0。
- `npx vitest run --root simharness tests/harness-gate-integrity.test.ts`：132/132 通过。
- 变异探针四连（临时改动→对应测试红→还原→绿，探针态不入提交）：①移除 evaluateIdentityBinding 的 origin 等值检查 → matrix-login+policy 3 用例红（跨 origin 认领/来源不同/origin 不可规范化），还原后 39/39 绿；②requireProfileParameterAccess 直通 → route-policy+policy+userenv 6 用例红，还原后 65/65 绿；③禁用 enforce-gate 的 mcp-unknown 硬拒 → enforce-gate 3 用例红（bypass 档也拦/allowlist 不豁免/不属审批类规则），还原后 25/25 绿；④gate-evidence 完成键缺失误判 pass → gate-evidence+run-metrics 5 用例红，还原后 21/21 绿。
- Task 8 承接的三批审查挂账（负例先行，先红后绿）：Task3①RegExp 写路由启动即抛错（原被字符串过滤静默吞掉）+②启动对账补"悬垂政策"方向（含 method 不一致负例）；Task7-Important 存量债——typecheck-client-baseline `--check` 基线缺席由恒 exit 0 改为 exit 2 INCONCLUSIVE（生成模式仍可建初始基线）；Task5 五处"两层信号"旧注释改单层表述（动词启发式单层分类信号）。
- Task 8 审查轮（round 2，Critical 1 修复）：悬垂检查使 753 补丁原"两组各传全量政策"的启动对账形态在真实 registerRoutes 必抛（审查探针复现：两方向各判对方组政策悬垂）——patches/753 改为两组并集单次对账（enforce 双链挂载不变），经 inject --clean→inject 真通道重放并以隔离快照 git apply --check + cmp 字节对账；route-policy 生产形态测试升级为执行式（并集对账不抛 + 双链 enforce 可执行）并加旧形态负例锚定；ProactivitySection 安静时段交互面补守门 4 条（开关派生/禁用门控/嵌套载荷/畸形重载不残留）。
- 未执行项（如实登记）：真实 Matrix/IdP 服务活体链路、桌面构建与 afterPack、SIM 活体烧机、build:full/release:check/release:gate 未在本阶段执行——属 P1/P2 验证面或需外部依赖，不以 mock 结果替代。

### 5. P1 实施验证（2026-11-05）

P1 Task 1（终审前置①②③⑤ 清扫）负例先红后绿的真实命令与计数（同一隔离 HOME）：

- 负例先红：`npx vitest run custom/server/toolpipeline/__tests__/enforce-identity-sandbox.test.ts custom/server/platform/__tests__/route-policy.test.ts` 在实现前 14 用例失败（attestation 契约 4 + declaredOnly 事件 1 + no-context 观测事件 1 + skippedNoContext 旧断言 2 + 重叠守卫 6，失败原因均为新符号不存在/旧行为静默放行）。
- 实现后目标面 `npx vitest run custom/server/toolpipeline/ custom/server/platform/ custom/server/mcpcatalog/ custom/server/govbus/`：20 文件 / 220 通过 / 0 失败（基线 198 + 新增 22）；相邻面 `npx vitest run custom/server/governance/ custom/server/permmodes/ custom/server/autonomyladder/ custom/server/userenv/ custom/server/approval-inbox/`：383 通过 / 0 失败。
- `npm run typecheck:harness`：exit 0。
- 终审前置落点：①osSandboxAttestation 声明+探测+declaredOnly，解锁 terminal 且仅声明时 fire-and-forget autonomy/warn 事件；②skippedNoContext 第三返回形态，执法门落 sandbox/info 观测事件并放行；③assertNoPolicyPathOverlap 静态/参数段同位重叠抛错并接入启动对账；⑤注册表文件头书面化默认拒绝覆盖边界（6 受管 router，harness/eval/orchestrator 写面按 P2 节奏登记）。前置④（EvidenceRecord 九字段）属 Task 2。
- 宿主差异处理：探测信号可注入（测试注入全 false 保证跨 macOS/Linux/容器确定性）；macOS 宿主 sandbox-exec 在案即有佐证不误报 declaredOnly（osAttestationOf 缺省走真实探测有用例锚定）。

P1 Task 2（终审前置④：EvidenceRecord 九字段契约与追加式存储）负例先红后绿的真实命令与计数（同一隔离 HOME）：

- 负例先红：`npx vitest run custom/server/platform/evidence/__tests__/evidence-store.test.ts custom/server/platform/evidence/__tests__/gate-evidence.test.ts` 实现前 2 文件全红（`Failed to load url ../evidence-store`——缺关键字段抛错、不存在主体 null 等负例随模块缺失先行咬住）。
- 实现后证据面：同命令 2 文件 / 22 通过 / 0 失败（evidence-store 14 + gate-evidence 8，负例与兼容读全绿）。
- 回归面：`npx vitest run custom/server/toolpipeline/ custom/server/platform/ custom/server/mcpcatalog/ custom/server/govbus/ custom/server/governance/` 49 文件 / 463 通过 / 0 失败；`npx vitest run custom/server/permmodes/ custom/server/autonomyladder/ custom/server/userenv/ custom/server/approval-inbox/` 158 通过 / 0 失败。run-metrics 既有用例未改断言即绿（其只读 status/supplement，调用点显式传 commit:null）。
- `npm run typecheck:harness`：exit 0（清单已补 custom/server/platform/evidence/evidence-store.ts）。
- 交付面：九字段契约（缺关键字段/非法值抛错点名，键缺席与显式 null 区分）；JSONL 行级原子追加（白名单九字段固定键序，父目录按需创建，写失败抛不吞）；latestEvidenceFor 文件不存在/主体不存在=null、坏行跳过；P0 三字段行归一 LegacyEvidenceRecord（缺席=null 不编造）；路径序 PLATFORM_EVIDENCE_FILE → underWebUi('platform-evidence.jsonl')。

P1 Task 3（注入 Planner 与 manifest v2 契约）负例先红后绿的真实命令与计数（同一隔离 HOME）：

- 负例先红：`npx vitest run scripts/__tests__/inject-planner.test.ts scripts/__tests__/inject-manifest.test.ts` 实现前 2 文件全红（23 用例随模块缺失先行咬住：Failed to load url ../platform/inject/planner.mjs）。
- 实现后：同命令 2 文件 / 23 通过 / 0 失败（planner 7 + manifest 16）。覆盖：中插/重排/改名/删除/改内容/v1 收养/last-failed/基线变/根变九类增量拒绝；尾部纯追加 tail-append；absent-tree partial 可增量（standalone 语义）；applied 投影排除 failed/skipped/rolled-back；原子写无 tmp 残留、读缺席=null。
- 变异探针：摘除 last-failed 拒绝 → last-failed 负例红；applied 投影放宽为含 skipped → 投影负例红；还原后 23 绿。
- 相邻回归：`npx vitest run custom/server/__tests__/ensure-injected-delta-guard.test.ts` 5 通过（inject.mjs 未动，接线留 Task 5）。

P1 Task 4（事务化注入 Executor 与 Journal）负例先红后绿的真实命令与计数（同一隔离 HOME）：

- 负例先红：`npx vitest run scripts/__tests__/inject-executor.test.ts` 实现前 1 文件全红（7 用例随 executor.mjs 缺失先行咬住）。
- 实现后：同命令 1 文件 / 7 通过 / 0 失败。夹具=临时 git 仓双树（studio/agent 各自 init+基线提交）+ 增量差量补丁链（每步提交推进 HEAD，下一补丁 context 建立在前补丁之上）+ 临时 patchDir/stateOut。覆盖：①第 3 补丁强制失败→前 2 项字节级回滚（src.txt equals 基线 Buffer、新增文件删除）、后续 blocked-by-failed、journal 备份留档且字节与基线一致；②部署预检 partial→零应用零 manifest、results 全 skipped/runtime-deploy-precheck:partial；③成功→complete、appliedPatches 与 plan 一致、journal 清理、studio 树 agent/ 同路径既有文件不动；④failed manifest→planIncrement 抛 last-failed 且消息含 clean；⑤agent lane 失败不牵连 studio（lane 独立）；⑥后置部署 partial→整体 partial 非 complete；⑦zcode 缺树→skipped/absent-tree、整体 partial（standalone 语义）。
- 实现中修复的真实缺陷（红阶段实测）：journal checkpoint 对纯新增文件补丁不建入口目录（__index.json ENOENT）；rollbackLane 按绝对根匹配而调用方传树名（restore 0）——两者均以负例咬住后修复。
- 变异探针：摘除失败回滚 → 负例①红；预检 partial 放行 → 负例②红；还原后全绿。
- 相邻回归：`npx vitest run scripts/__tests__/inject-planner.test.ts scripts/__tests__/inject-manifest.test.ts custom/server/__tests__/ensure-injected-delta-guard.test.ts` 与 executor 合跑 4 文件 / 35 通过 / 0 失败。

P1 Task 5（inject/ensure-injected/clean 切换平台核心）负例先红后绿与隔离完整重放（同一隔离 HOME；重放用独立临时 HOME/HERMES_HOME/SIM_ROOT）：

- 负例先红（deploy 面）：`npx vitest run scripts/__tests__/deploy-agent-runtime.test.ts` 实现前 5 用例全红（kept→exit 2/RESULT 行/状态映射均不存在）。
- 负例先红（主链面）：`npx vitest run scripts/__tests__/inject-clean-v2.test.ts` 实现前 8/9 红（v2 manifest 不产、noop 不成立、clean 不删 agent 树新增文件、ensure 无 v1/failed/脏树非零语义）。
- 实现后：两文件 5+9 通过；适配后 `inject-absent-tree` 2 通过（standalone 真实全量 inject 保持 rc=0/SKIP 汇总/applied>300，新增 v2 manifest=partial 断言）、`ensure-injected-delta-guard` 5 通过（差量守卫迁移 v2 语义：planIncrement tail-append→inject 主链补套、v1/last-failed 拒绝、前缀双源对账保留）。
- 注入核心全量回归：`npx vitest run scripts/__tests__/` 28 文件 / 204 通过 / 0 失败。
- 隔离完整重放（本 worktree 真实 468 补丁链，独立 HOME）：v1 注入态快照 → clean（legacy 分树路径，348 M+87 ?? 全清、dirty=0、v1 manifest 删除）→ inject#1（v2 complete，460 hermes+8 zcode）→ noop inject（exit 0 零重放）→ clean → inject 全量重放；6 关键文件（三树 tracked/untracked 代表+派生 config）+ 归一 manifest 逐字节 cmp 全等；deploy 幂等 62/62 same（RESULT status=complete）；journal 无残留；ensure noop exit 0。
- 迁移语义实证：本 worktree v1 manifest 已被 clean+inject 迁移为 v2（clean 删旧清单→inject 重建），后续 pretest/ensure 走 v2 noop。

P1 Task 6（统一上游根解析与入口注入前置）负例先红后绿（同一隔离 HOME）：

- 负例先红：`npx vitest run scripts/__tests__/upstream-root.test.ts` 实现前 8/8 红（resolver 模块缺失）。
- 实现后 8/8：解析序 5（vendor 优先于旧兄弟 upstream——build-dmg 旧实现无 vendor 分支的反面、env 最高、realpath 符号链、无 vendor 回落兄弟、缺省锚本仓）+ serve 干净检出真子进程 3（vendor 路径报错不回落兄弟、ensure 非零拒绝起服且无 starting 行、exit 3 透传）。
- 五处内联副本收敛（build/build-dmg/serve-server/verify-dist/inject）；build:full 显式 ensure 前置、build-dmg 走 ensure 主链 + treeGitCtx 语义 tracked restore；注入链回归 8 文件 59/59。

P1 Task 7（runtime 资源单一解析器与产物清单校验）负例先红后绿：

- 负例先红：runtime-resources 5 用例 + verify-dist-runtime 6 用例随模块缺失/无 --server 校验先行红。
- 实现后 19/19（含既有口令扫描回归 7）；消费面回归 44 文件 324/324（tokens/zcode-squad/kanban/governance）。
- build.mjs 复制落点修正为真 dist/server/runtime（旧落点 packages/server/dist/server 为上游旧布局残影）；真实仓清单 19 项（roster 全目录+pricing+semantica-bridge），canonical digest c847becc…。

P1 Task 8（产物身份与图运行 UUID）负例先红后绿：

- 负例先红：bundle-identity 8 用例随模块缺失、UUID 形态 3 用例随序号实现先行红；实现后 18/18。
- loop 域回归 52 文件 578/578；typecheck:harness exit 0（清单补 bundle-identity.ts + runtime-resources.ts）。
- 双 service 同 event log 重建后新 runId 不复用（P0 审查实锤缺陷反面）；旧 run-approval-flow-1 序号记录以真实 checkpoint 拷贝种入，rebuild/resume 语义不回归。

P1 Task 9（release:gate 真实准出执行链）负例先红后绿：

- qgate 严格面 8 用例（缺席/晚于 since 绿/早于 since 拦/WAIVED 拦/CONDITIONAL 拦/缓存命中拦+no-cache 重跑真执行/CLI exit 码/gitContext 首路径完整性）+ release-gate stub 编排 6 用例（步失败即停 marker 证不执行后续、JUnit 复析拦 exit-0 含 1 failed、全绿九键证据+HEAD 真值、{START_TS} 注入、内建步序完整性）。
- qgate 全套 21 文件 230/230；scripts 全套 31 文件 224/224；附带修复 parse.ts EXECUTIONS 词表补 cached（缓存证据此前落盘不可回读）。
- spec 决策表补 P1-9 行：supplement/declaredMissing 属 producer 层不落盘，release:gate 全链 commit 真值。

P1 Task 10（集成验收）真跑与变异探针（2026-11-06）：

- 隔离全链重放（真实 468 补丁链）：clean（exit 0，三树 dirty=0）→ inject（exit 0，468 补丁 v2 complete，runtimeDeploy 双 complete）→ 6 代表文件+归一 manifest 逐字节全等 → noop inject exit 0 零重放；deploy 三态真机观测 kept→partial(2)/--apply --force conflict→partial/收敛 complete，测试矩阵另 5/5。
- 真实 build:full exit 0（产物不入提交）：verify-dist --server 全绿（19 项逐项存在且摘要一致）。
- release:gate 真跑两轮：第一轮在 gate-basic-check 拦下 1 个存量红（zcode-patches-guard 断言旧实现 applyZcodePatches——批一 Task 5 已切换平台 executor，守门断言迁移 v2 语义后 5/5）；第二轮 13 步中 12 步全绿（含真 npm test 8,407 用例 0 失败 / JUnit 编排层复析 0 failures、评测门、6 启用门池、typecheck 双门 17≤17、build:full），严格证据面 strict: pass（require-pass/no-cache/since 全满足，8 启用门全 PASS 非缓存晚于起点）；最终 release-report 步非零的唯一未决项=存量治理配置债（claim orgscale.spec-six-questions 的唯一覆盖门 governance.orgscale 属 L4，在现行 vibe-fast 档被域级禁用——2026-11-05 组织治理批引入，任何 release-report 恒红直至裁决：启用该门/撤销该 claim/发布流切 release 档，三选一待用户裁定，未放宽判据）。release:gate 每步九字段证据落平台证据存储（15 行，全部绑定 HEAD 40 位真值）。
- 真跑前置检查逮住并修复四个存量缺陷（修复实现不放宽判据）：①qgate gitContext 首路径截字符（gitOut .trim() 吃 porcelain 首行前导空格→slice(3) 吃路径首字符，改 trimEnd+回归锚定）；②symbols 扫描面静默截断（仓 5.2 万件超 5000 走读顶按 readdir 序随机截断，executor 增 scanGlobs 字面根剪枝+截断 fail-closed，symbol-grounding 声明管辖面 custom/scripts/config ~2.8k 件）；③scripts/maintenance/graph-migrate-cli.ts 迁址后烂掉的相对 import（接地门逮住修正）；④ai-native-scorecard.ts 历史误植死代码（TS2774 阻断 build:full，P0 未执行项实锤，摘除后 7/7 绿）。
- 变异探针四连（临时变异→目标测试红→还原→绿，探针态不入提交）：①manifest failed 混入 appliedPatches 投影→inject-manifest 红；②deploy kept 仍 complete→deploy 测试红；③release-gate 内建步序摘除 typecheck-harness→编排测试红；④bundle 身份忽略 runtimeManifestDigest→敏感性测试红。四连全部先红后绿。

### 6. P2 实施验证（2026-11-06）

P2 Task 1（SIM 运行时单一所有权核心，c37016a0c）+ Task 2（烧机收据真身绑定与清账跨清场存活，637d79a5f）的真实验证见两提交说明；本节记录批次二（Task 3 文档投影与催办三态 b6e1600e4、Task 4 挂账扫尾九项 efe208ec2、Task 5 验收）：

Task 3/4 负例先红后绿与回归计数（隔离 HOME，worktree 树）：

- Task 3 负例：sync-training-docs 8 例（版本漂移/路由漂移/手改投影块/块缺席均非零+写入幂等+接线+usage）实现前全红（生成器缺席）；owner-routed-nudge delivery 契约 3 例红（响应无 delivery 字段）；催办文案负例 2 例红（含旧文案「催办已路由」触发已发送语义禁令）；手册分层 4 例红（§1.1 旧指引 产品 2、6/项目 7—11/运维 12/审计 13 与期望章节集不符、§8.4 无三态定义、12 幕无 layer/practiceRef、命令块无「本页不执行」标注）。实现后 `npx vitest run scripts/__tests__/sync-training-docs.test.ts custom/server/kanban/__tests__/owner-routed-nudge.test.ts custom/client/ia2/__tests__/humangate-nudge-wiring.test.ts custom/__tests__/interactive-training-manual.test.ts`：41 通过 / 0 失败；route-manifest 真链对账集成例绿（真注册链 121 路由/37 页签投影与手册 marker 块逐字节一致）。
- Task 4 负例：trailing-slash 重叠/对账 4 例先红；治理域平价 1 例红（客户端缺 sandbox）；SkippedNoContext re-export 与 sandboxNetworkViolation 契约导出 2 例红；junit 顶层属性用例红（旧正则恒漏检顶层聚合形态）；复算比对 3 例红（变异摘除比对后双红）；build.mjs 硬编码断言红。纯注释项（M4 双口径措辞）直接改。变异探针三处红→还原绿：回滚不还原字节→叠加回滚断言红；顶层属性不计入→方言用例红；摘除复算比对→重放双红。存量红清偿：capability-probes userenv 401（25c7c8e77 授权边界后测试 Koa 缺认证夹具）补 super_admin principal 夹具转绿，判据未放宽。
- 回归面：受影响面 63 文件 584 通过 / 0 失败；simharness 全套 `npx vitest run --root simharness` 296/296（转绿后零红）；`npm run typecheck:harness` exit 0。

Task 5 验收（隔离 SIM_ROOT/随机端口，不碰宿主运行态）：

- SIM 三启动顺序活体夹具（真进程+真 ps 探针+真 cmdMatcher，事件流留痕）：product→bash / bash→product / 并发三序各 8 断言共 24/24 PASS×两轮（恰一 owner、败方响应携 holder、owner-acquired 恰 1、owner-refused≥1、活 driver 互斥、死 holder 陈锁可接管、收尾无活锁；并发胜者两轮分属不同方，恰一不变量对称成立）。
- 烧机收据链：`mx-burn-test.sh --dry-run` 双根（默认根+隔离根）BURN-DRY-RUN-OK（工具自检含 guard CLI lock-status）；真跑未活体——40 分钟真 gateway 驱动会向宿主 sim 网关（127.0.0.1:8801 活体在册）写真实房间/板库，按「不碰宿主进程/服务」纪律不执行，以收据链活体夹具证机制：当前仓真实 digest（dc5d2591…，16 机制文件）emit pass→verify-latest 放行→追发后 fail→拦→末行恢复 pass→放行→短场景（until=smoke）→coverage 拦，四态全验。**未活体标注：机制四类组合行为（恢复/催办/闸门等待/熔断）本轮未在真 gateway 上复跑**，prelaunch ㉛ 面由上述链路+mechanism-behavior 34/34 覆盖。
- 清场-清账跨轮：`bash simharness/tests/issue-clearance.test.sh` ALL-PASS（10 场景：造 open 债→mx-clean --apply 清场前原子写投影→轮目录已清后清偿门回落投影仍拦 open/延后→append-disp 回写终态→resolve 作用于投影→放行）。
- 变异探针三连（临时变异→红→还原→绿，探针态不入提交）：①owner 并发败方放行→runtime-guard 8 路恰一用例红；②verify-latest 后 fail 放行→mechanism-behavior 末行用例红；③mx-clean 投影跳过（清场删债）→issue-clearance ⑥/⑥b 双红（债务蒸发被逮）。三连全部先红后绿。
- 文档与发布门：`npm run docs:check` 绿（routes=121，version=1.0.12-overlay）；`npm run release:check` 绿（四模块对账）；release:gate 全绿（计数见批报告；运行树=本批提交内容）。
- 真启动冒烟（P0 终审前置⑥）逮住三个存量启动缺陷并修复：①custom/platform 树缺 CJS 屏蔽 package.json（根 package.json type:module 泄漏，ts-node CJS require contracts/execution 即 ERR_REQUIRE_ESM——P0 Task 5 引入值导入后从未活体起服）；②registries/server 同型泄漏（platform-route-policy 值导入）；③eval 路由 5 处 `./shared.js` 后缀导入（80e70c36c 引入，vitest 可解析、ts-node CJS 不能）。修复=custom/platform/package.json 与 registries/server/package.json 同形 CJS 声明+导入去后缀回归全树约定。冒烟结果：隔离 HOME、随机端口 18747 起 serve，~33s 后 `/livez`=200（{"status":"ok"}）且 `/health`=200（gateway:running、agent_bridge:ready）；serve cwd=本 worktree；探毕即停、端口零残留。

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
