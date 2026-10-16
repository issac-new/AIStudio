# SwarmStudio 产品与 Hermes Agent Teams 安全检查报告

- 检查日期：2026-10-16
- 检查依据：《智能体安全检查清单》（2026-10-16 整理版，6 域 20 项）
- 检查对象：SwarmStudio 产品（upstream/hermes-studio 加 overlay 自研件）与 Hermes Agent Teams。后者含宿主 50 个 profile 目录（49 个可用，另有 _shared 共享配置目录）、sim 推演树 45 个 profile 及其实测配置。
- 检查方式：只读取证。未修改任何文件，未实际执行越界命令

## 一、检查结论

20 个检查项中没有一项完全符合：4 项不符合、15 项部分符合、1 项不适用。C2 判不适用，理由是单机单租户，残余风险见该条目。

三个最严重的问题：

1. 权限与岗位不挂钩。宿主 49 个可用 profile 全部挂 hermes-cli 全量工具集。每个 agent 都持有全套高危工具：terminal 任意 shell 执行、execute_code、write_file、delegate_task。情报岗 scout、编排岗 orchestrator、架构岗 [已移除] 三者的配置差异只有岗位名和少量标签。sim 推演树同构，45 个 profile 无一把工具集裁剪。
2. 文件系统无边界。agent 的 shell 与文件工具以当前用户身份在宿主上跑，可以读系统目录和其他用户目录。cwd 只是起始目录，模型一条命令就能出去。读路径黑名单只拦 Hermes 自己的凭证面，方向是防泄密不是防越界。上游把默认 local 后端标为不受支持的安全姿态（SECURITY.md:118-120），SwarmStudio 当前正是这个形态。
3. 工具调用审计半残加告警缺失。设计上字段最全的 run-trace 插件零输出，631 个 trace 文件无一条工具调用记录（已实测复核）。真正在记录的会话库缺用户身份、参数不脱敏。E2 要求的三条告警一条都没有，巡检官 15 个检测器没有一个监控工具调用。

## 二、检查结果汇总

| 编号 | 检查项 | 结论 |
|---|---|---|
| A1 | 最小权限原则 | 不符合 |
| A2 | 权限动态调整 | 部分符合 |
| A3 | 权限传递与边界控制 | 部分符合 |
| B1 | 无明文凭证 | 部分符合 |
| B2 | 凭证时效性 | 部分符合 |
| B3 | 人机权限分离 | 不符合 |
| B4 | 网络暴露最小化 | 部分符合 |
| C1 | 工具操作分级 | 部分符合 |
| C2 | 数据行级隔离 | 不适用 |
| C3 | 不暴露底层指令 | 部分符合 |
| C4 | 文件系统沙箱 | 不符合 |
| D1 | 安全红线固化 | 部分符合 |
| D2 | 高危操作审批门禁 | 部分符合 |
| D3 | 多跳权限衰减 | 部分符合 |
| E1 | 工具调用日志 | 部分符合 |
| E2 | 越权异常告警 | 不符合 |
| E3 | 日志留存 | 部分符合 |
| F1 | 异常调用监控 | 部分符合 |
| F2 | 告警规则齐全 | 部分符合 |
| F3 | 告警有效 | 部分符合 |

按域看：

- A 域 1 项不符合，问题在宿主 agent teams 的全量赋权。
- B 域 1 项不符合，问题在身份未分离；B1 另有出厂默认口令缺陷。
- C 域 1 项不符合，问题在文件系统无边界。
- D 域三项均部分符合，机制齐全；部署面分裂，默认 profile 关闭审批，命名 team 靠上游默认 smart 兜底。
- E 域 1 项不符合，问题在告警缺失；E1 审计半残。
- F 域三项均部分符合，监控面向工作流而非工具调用。

## 三、逐项证据

### A 域 赋权与权限治理

**A1 最小权限原则 — 不符合**

- 宿主 49 个可用 profile 全部挂 hermes-cli 全量工具集（实测统计 50 个，仅 `_shared` 不挂）。
- `upstream/hermes-agent/toolsets.py:11-39`：全量清单含 terminal、write_file、execute_code、browser_*、delegate_task、cronjob_manage。
- aiteam-orchestrator 与 aiteam-scout 的 config.yaml 差异只有岗位名、SOUL 路径等五项；[已移除] 只多 acp 工具集与技能标签。
- 25 个 profile 挂的 `acp` 与 2 个挂的 `messaging` 是无效工具集名，`resolve_toolset` 解析出 0 个工具且不报错（有效名是 `hermes-acp`）。这 27 个 profile 的实际工具面与声明不一致。
- sim 推演树 45 个 profile 同样全量（42 加 3，实测），无一把工具集裁剪。
- 叠加 D2（审批面分裂），多数高危操作实际没有人工确认。

**A2 权限动态调整 — 部分符合**

- 机制齐全：自治阶梯 `overlay/custom/server/autonomyladder/autonomy-ladder.ts:26-45`；会话权限七档 `custom/server/permmodes/session-mode-store.ts:15-17`；目标预算 `custom/server/goalbudget/goal-budget.ts:29-45`。
- 实测零实例：ladder.json 与 session-modes.json 均不存在，启动环境无 `HERMES_TOOL_ENFORCE=1`。
- 上游工具集在 agent 初始化时定，启动后不可收窄。

**A3 权限传递与边界控制 — 部分符合**

- 强项：子进程凭证净化 `upstream/hermes-agent/tools/environments/local.py:342-355`；env 透传 fail-closed `tools/env_passthrough.py:46-65`；MCP stdio 子进程只拿基线 env `tools/mcp_tool_config.py:146-197`。
- 缺口：子 agent 继承父 api_key 与 endpoint `tools/delegate_tool_config.py:423-424`。
- 缺口：profile 的 MCP 子进程固定带 SwarmStudio 控制面地址 `http://127.0.0.1:8647`，api/use/plan 工具集可直接驱动产品 API。

### B 域 身份与凭证管理

**B1 无明文凭证 — 部分符合**

- 合规面：全量正则扫描无真实密钥命中；`~/.hermes/.env` 与 `~/.hermes/secrets/` 均为 600 权限且未入 git。
- 缺陷面：出厂 bundle 含 `username:"admin",password:"123456"`（`upstream/hermes-studio/dist/client/assets/js/index-DEfNfJTL.js`，2026-10-16 构建，已实测复核）。
- 同口令还写在源码 `packages/client/src/components/hermes/pets/WebPet.vue:189`、`overlay/registries/client/entry.mts:93` 和七个语言的 i18n 登录提示里。

**B2 凭证时效性 — 部分符合**

- 合规面：用户 JWT 30 天 `packages/server/src/modules/studio/middleware/auth.ts:62`；model-run JWT 1 小时；App 授权码 5 分钟用后即焚 `repositories/app-connections-store.ts:5`；OAuth 凭证有刷新逻辑。
- 缺口：第三方 API Key 与机器令牌（`HERMES_GATEWAY_TOKEN`、`API_SERVER_KEY`）无有效期、无轮换台账。需求档已自标为设计缺口 R13。

**B3 人机权限分离 — 不符合**

- git 身份全部为个人账号：宿主与 sim profiles 均 `user.name=plusprimer`。
- 5 个抽样 profile 的 39 项 provider 凭证 md5 完全相同，orchestrator 为超集。
- 全仓无 service_account、bot_token、deploy_key 类配置。
- 缓解面：主推理走本地代理，模型密钥是 `PROXY_MANAGED` 占位，由代理托管。

**B4 网络暴露最小化 — 部分符合**

- 合规面：SQLite 文件库不网络监听；桌面端仅绑 127.0.0.1 `packages/desktop/src/main/webui-server.ts:541`；全部 API 需 JWT `middleware/auth.ts:168-172`。
- 缺口：自托管默认监听 0.0.0.0 且无 IP 白名单 `packages/server/src/bootstrap/http.ts:169`。
- 缺口：沙箱 compose（dev 与 sim 用）Redis 无认证、Postgres 弱口令 `overlay/docker-compose.yml:75,84-91`。

### C 域 工具与数据权限粒度

**C1 工具操作分级 — 部分符合**

- 机制：上游三级分级 `upstream/hermes-agent/tools/approval_detection.py:107-146,228-362`；overlay 七档矩阵 `custom/server/permmodes/permission-modes.ts:19-31`；风险三档 `custom/server/approvals/risk-tier.ts:23-53`。
- 缺口：上游对高危档的设计是「需审批」，不是「默认禁用」。
- 部署面分裂：默认 profile 的根配置 mode off（`~/.hermes/config.yaml:399`）；命名 team 未设 approvals，生效上游默认 smart；overlay 执法门总闸默认 0 `custom/server/toolpipeline/enforce-gate.ts:123`。

**C2 数据行级隔离 — 不适用**

- 单机单租户形态，无多租户设计。
- 全仓无暴露给模型的通用 SQL 工具 `upstream/hermes-agent/toolsets.py:9-46`。
- 唯一强制行级隔离（Postgres RLS）在 SaaS 适配器 `custom/server/loop/store/saas-store.ts:84-105`，本机走 LocalStore 不经过。
- 残余风险：kanban_list 不带 tenant 即返回全量任务 `hermes_cli/kanban_db.py:1563-1592`；单用户部署下 REST 层鉴权整体缺席 `custom/server/zcode/workspace-access.ts:11-13`。

**C3 不暴露底层指令 — 部分符合**

- 合规面：工具注册表白名单成立 `upstream/hermes-agent/tools/registry.py:709-787`；插件不可覆盖他人工具 `:590-625`。
- 缺口：terminal 工具即任意 shell `tools/terminal_tool.py:1498-1530`。
- 缺口：execute_code 可直调 subprocess，纯本地会话跳过整脚本审批 `tools/approval.py:1206-1276`。
- 上游自述：进程内筛查不构成安全边界 `SECURITY.md:60-63`。

**C4 文件系统沙箱 — 不符合**

- 全仓无 allowed_roots、chroot 类机制。
- `terminal.cwd` 只是起始目录 `tools/terminal_tool.py:667-675`。
- 读路径黑名单只拦 Hermes 自己的凭证面 `agent/file_safety.py:386-432`，不拦 /etc、/root、~/.ssh。
- `~/.hermes/sandboxes/` 实为空目录，隔离后端从未启用。
- 上游把默认 local 后端标为不受支持的安全姿态 `SECURITY.md:118-120`。

### D 域 系统指令与操作控制

**D1 安全红线固化 — 部分符合**

- 结构面：三段式构造顺序固定，用户内容进不了 stable 层 `upstream/hermes-agent/agent/system_prompt.py:743-808`。
- 缺口：stable 层没有三条红线；唯一涉密句是「除非用户明确要求」的可覆盖软指令 `agent/coding_context.py:126-128`。
- 缺口：身份段 SOUL.md 是磁盘文件且不在写保护集内 `agent/file_safety.py:180-208`，agent 可自改写。

**D2 高危操作审批门禁 — 部分符合**

- 机制三层齐全：上游 approvals `hermes_cli/config_defaults.py:1665-1692`；overlay 人审收件箱 `custom/server/approvals/pending-controller.ts:47-49`；执法门票据 `custom/server/toolpipeline/enforce-approvals.ts`。
- 部署面分裂，三处生效值不一样。默认 profile 的根配置 mode off（`~/.hermes/config.yaml:399`）。
- 49 个命名 team 的 config.yaml 无 approvals 段，生效上游默认 smart。
- sim 树只设 timeout_action: escalate，同样生效 smart。
- home 对应有进程实证：agent 进程以 HERMES_HOME=<profile 目录> 启动（实测 pid 6597 worker-coder、pid 32376 aiteam-orchestrator）。`hermes_cli/main.py:595-660` 的 `_apply_profile_override()` 把 HERMES_HOME 重指到 profile 目录，`get_config_path()` 读该目录下的 config.yaml，不读根配置。
- 执法门有结构性覆盖缺口。它是 studio server 进程内的 TypeScript 钩子，patch 566 把它注入 manager 的两处 createRuntime。agent teams 是 Python 子进程（`hermes_cli/kanban_db_dispatch.py:2959-3010`），hermes-agent 仓全量检索无 `HERMES_TOOL_ENFORCE` 消费点。即使打开总闸，49 个 team 也读不到。
- sim 面：审批插件已部署 42/42 个 profile（ncwk-sim-mux 树，实测），但决策由导演代批脚本完成 `simharness/mux/mx-approval-proxy.sh:41-84`。hermes-docker-sandbox 树 3 个 profile 未部署该插件。

**D3 多跳权限衰减 — 部分符合**

- 正向：子 agent 工具集与父取交集 `upstream/hermes-agent/tools/delegate_tool_toolsets.py:77-110`；黑名单双重扣除 `:14-22,120-122`。
- 违背一：orchestrator 角色的子 agent 会重新获得 delegation 工具集，即使父智能体禁用了它 `:116-119`。
- 违背二：MCP 工具集默认不衰减 `tools/delegate_tool_config.py:175-177` 加 `hermes_cli/config_defaults.py:1357-1359`。

### E 域 审计能力

**E1 工具调用日志 — 部分符合**

- run-trace 插件五个字段齐全 `overlay/custom/hermes-agent-plugins/run-trace/__init__.py:371-424`，生产零输出：631 个 trace 文件 0 条 tool_span（已实测复核）。
- state.db messages 表有记录，但 user_id 全空、参数未脱敏、无结构化结果状态。
- overlay 工具执行账缺会话 ID、仅 12 条、写失败不阻断执行 `custom/server/toolpipeline/tool-hooks.ts:17-70`。

**E2 越权异常告警 — 不符合**

- 无工具调用频次限制：现有 rate limit 全是模型供应商配额。
- 无按小时判定的高危操作规则。
- 无工具黑名单：browsersec 是 URL denylist，与工具无关。

**E3 日志留存 — 部分符合**

- 覆盖面：工具调用（缺身份）、治理事件 12008 条、文件日志轮转中。
- 文件日志 5MB×3 轮转 `config.yaml:445-446`。
- 会话 retention_days 90 但 auto_prune 关闭 `:476-478`，手动剪枝会级联删除工具调用记录。
- traces 631 个文件无清理策略；清理插件明确跳过 logs 目录。

### F 域 异常控制能力

**F1 异常调用监控 — 部分符合**

- 有集群巡检官 15 个检测器 `overlay/custom/server/clusterinspector/detectors.ts:19-51`。
- 有 simharness 夜哨与看守脚本。
- 缺口：全部面向工作流与集群健康，没有一个监控工具调用本身。

**F2 告警规则齐全 — 部分符合**

- 工作流异常规则成体系：阈值可调、三级严重度、升级熔断降级三种联动。
- 缺口：E2 指定三条无规则。
- 缺口：Matrix 催办依赖的房间变量宿主未配置，规则在宿主上静默关闭 `custom/server/clusterinspector/inspector.ts:155`。

**F3 告警有效 — 部分符合**

- 通道三条：治理事件流加只读 REST、Matrix 催办、destructive 审批队列。
- 实证：867 条 tool.denied 事件、1078 条网关降级、网关重启日志、夜哨在岗记录。
- 短板：治理事件流无内置消费方，只落账；宿主 Matrix 房间未配；告警自动转处置的链路只在 sim 环境成立。

## 四、重点问题与根因

六个问题按严重程度排序，第五节整改建议与它们对应。

### 1. 权限与岗位不挂钩（A1）

49 个可用 profile 全部挂 hermes-cli 全量工具集。写调研报告的情报岗与跑实验的训练岗同样能删库、推代码、执行任意命令。sim 推演树同构，45 个 profile 无一把工具集裁剪。叠加问题 4 的审批分裂状态，多数高危操作实际没有人工确认。

### 2. 文件系统无边界（C4）

agent 的 shell 与文件工具以当前用户身份在宿主上跑，可以读系统目录和其他用户目录。cwd 只是起始目录，模型一条命令就能出去。读路径黑名单的方向是防泄密，不是防越界。沙箱目录是空的，隔离后端从未启用。上游 SECURITY.md:118-120 写明：跑默认 local 后端且存在不可信输入面的部署，处于不受支持的安全姿态之外。SwarmStudio 当前正是这个形态。

### 3. 审计与监控不覆盖工具调用（E1、E2、F1）

三层审计面各缺一环。run-trace 插件字段最全但零输出。state.db 有记录，但缺身份、不脱敏、无结构化状态。overlay 执行账只有 12 条且缺会话 ID。监控面同样不碰工具调用。巡检官 15 个检测器全部面向工作流健康，E2 要求的三条告警一条都没有。

### 4. 审批门禁处于分裂状态（D2、C1）

三处部署面的生效值不一样。默认 profile 的根配置 `~/.hermes/config.yaml:399` 是 mode: off，危险档整体失效。49 个命名 team 的 profile config.yaml 没有 approvals 段。它们生效上游默认 smart，即 guardian LLM 预审、DENY 才升级人工。sim 树同样只设 timeout_action: escalate，生效 smart。

profile 与 home 的对应有进程实证。agent 进程以 HERMES_HOME=<profile 目录> 启动，`hermes_cli/main.py:595-660` 的 `_apply_profile_override()` 把 HERMES_HOME 重指到 profile 目录，`get_config_path()` 读该目录下的 config.yaml，不读根配置。所以根配置的 off 影响不到命名 team。

两层风险。其一，smart 档的判定者是进程内的 guardian LLM。上游 SECURITY.md:60-63 自述进程内筛查不构成安全边界，危险命令可以改写措辞绕过。其二，overlay 的执法门总闸 `HERMES_TOOL_ENFORCE` 默认 0，自治阶梯与会话权限矩阵对 agent teams 不生效。sim 面有审批插件，但决策由导演代批脚本完成。

### 5. 出厂默认超管口令（B1）

admin/123456 存在于源码、七个语言的 UI 登录提示和今天的构建产物里。它的位置是桌面壳自动登录的回落路径，有 getToken 守卫，纯浏览器可达性未实机验证。与 0.0.0.0 默认监听叠加时，同网段设备访问即得超级管理员会话。overlay/package.json:17-18 的 dev:lan 注释自己承认了这一点。

### 6. 身份未分离（B3）

所有 agent 以个人 git 身份提交推送，5 个抽样 profile 的 39 项 provider 凭证完全相同。攻击者控制某个 agent 后，行为直接归属个人账号，影响面覆盖全部仓库和全部供应商密钥。

## 五、整改建议

涉及 upstream 的改动必须走 `overlay/patches/` 加 `npm run inject` 通道，不直接改上游（工作区规则）。

### P0（建议本周内完成）

1. 把默认 profile 的 `approvals.mode` 从 off 改回 smart 或 manual（根配置 `~/.hermes/config.yaml:399`），并给 49 个命名 team 显式配置审批档位，不靠上游默认兜底。高危岗位考虑 manual。
2. 按岗位裁剪 toolsets：至少给 scout 类只读情报岗去掉 terminal、write_file、execute_code、delegate_task。
3. 打开 overlay 执法门总闸 `HERMES_TOOL_ENFORCE=1`，让自治阶梯与会话权限矩阵对 agent teams 生效。

### P1（两周内）

4. 修 run-trace 插件 span 不落盘的问题（用 HERMES_PLUGINS_DEBUG=1 定位）。修不了就明确该插件降级，改用 state.db 方案并补上用户身份字段和参数脱敏。
5. 文件系统边界二选一：把 terminal backend 切到容器（上游支持的安全姿态），或在 overlay 侧用 patch 给文件工具加 allowed_roots 守门。前者的代价是给 agent 换一套执行环境，后者是长期维护一个上游 patch。
6. 出厂默认口令：生产构建剔除 admin/123456 字符串，i18n 提示改为引导首次登录时创建强口令。

### P2（排期）

7. 落地 E2 三条告警：工具调用频次、非工作时段高危操作、黑名单工具。可挂巡检官新增检测器。告警走已有的治理事件流与 Matrix 催办通道。
8. 为 agent teams 建专用 git 服务账号和按岗最小凭证集，替换共享的个人身份与全量密钥。
9. 把 D1 三条安全红线写进 System Prompt 的 stable 层，并把 SOUL.md 纳入写保护集（需上游 patch）。
10. 堵 D3 两个权限扩大面：orchestrator 子 agent 重授 delegation、MCP 工具集默认不衰减（需上游 patch）。
11. 建静态 API Key 与机器令牌的轮换台账（B2 缺口，需求档已自标为 R13）。

## 六、检查范围与未覆盖项

**取证方式**：以静态代码与配置锚点为主，辅以部署实测。

四项关键结论由我重新执行命令确认：

- 根配置（默认 profile）审批 mode 实测为 off
- 49/50 profile 工具集统计
- 出厂 bundle 含默认口令
- 631 个 trace 文件零 span

**未覆盖的范围**：

1. 未实际启动 agent 执行越界命令验证边界（只读取证，按要求未做任何写操作或提权操作）。
2. 命名 team 的审批实际生效值未做端到端触发验证，未实跑一条危险命令看它落到哪一级放行。结论基于配置叠加链与进程环境实证。
3. run-trace span 不落盘的运行时根因未定位。
4. 414 个 overlay patch 文本只做了正则扫描，未逐条人工审读。
5. 宿主 50 个 profile 目录做了全量统计与抽样深读，未逐一人工审查。
6. hermes-studio 上游自身的审计面未深读，前端对治理事件的消费深度也未验证。
7. 密钥真实性与有效性未验证（只取键名与长度，未调用供应商接口检查）。
8. 沙箱 compose 的 Redis 无认证与 Postgres 弱口令属 dev 与 sim 编排，非 agent 生产库，未评估其实际暴露面。
