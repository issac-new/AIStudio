# D20 挂账清偿轮：五项能力缺口落地＋Matrix 开发态链接

日期：2026-10-17（D19 同日晚）
状态：开工依据（用户指令「挂账项都完成」「链接 matrix 完成开发态局限的五项能力缺口」）
分支：`feat/d20-backlog-clearance`
上游：D18 设计正本（`2026-10-17-journey-ia-terminology-redesign.md` §5.6 挂账四项＋§5.8 缺陷 4 CenterKey＋§5.6 步 4 模型服务商入口）

## 〇、结论先行

D18 报告的挂账项本轮全部清偿：组织创建（表单归位＋governance 仓落地）、账号邀请流（预建号＋一次性领取）、agent 级模型绑定（复用上游按 profile 定向写 config 端点，零新端点）、agent 启停（复用上游 restart 端点）、CenterKey 改 stage1-6、模型服务商统一入口入设置页；外加把 dev 浏览器真实连上 Matrix 使团队管理全功能可用。侦察确认其中三项**不需要任何新后端端点**（上游 `PUT /api/hermes/config` 支持 `x-hermes-profile` 定向写 model 段、restart 端点登录即可、registry PUT 整表写已在），唯一新增后端是邀请 redeem（走非 `/api` 前缀路径天然免 JWT，绕开上游守卫零 patch）与 governance 仓 env 默认值。

## 一、六件挂账的落地方案（每件带锚点）

### 1. 组织创建（真表单）

问题不是没有写通道，是两处断链：OrgEditor 可编辑组件（`custom/client/ia2/components/gov/OrgEditor.vue:27-36` 有 saveRegistry PUT）却藏在治理签 6 文档评审里（`GovDocsReviewView.vue:232`），签 2「组织与资产」只有只读投影；且 `GOVERNANCE_REPO` env 未配置，org.md 无处落地（`registry-admin.ts` repoRoot 只读 env，实测 GET org 401/ENOENT）。

修法：OrgEditor（含新增行按钮补齐）迁挂签 2；`scripts/serve-server.mjs` 注入 `GOVERNANCE_REPO` 缺省值（ncwk/governance 新 git 仓，含 docs/admin/org.md 初始表头），env 显式设置时尊重不动。验收：签 2 表单加一行保存成功、git log 出现提交、重新读取回显。

### 2. 账号邀请流（服务端生成一次性初始口令）

实现修订（原设想的公开 redeem 页需改上游路由守卫=patch=inject，禁 inject 期不可行；且仓内无 cipheriv 先例，不引入服务端存管理凭据的加密原语）：复用既有建号链路（`provisionMatrixAccount` 防假成功链），`POST /api/governance/invites`（superAdmin JWT＋body.adminToken 双闸，与 matrix-users 同面）→ 服务端 `randomBytes(18)` 生成一次性初始口令（只进本次响应，绝不落盘）→ 预建 matrix 号（含可选 -agent 双号）→ invites 台账登记审计行（谁被邀/何时/过期/状态）。前端账户管理页加「邀请账号」表单与结果卡（账号＋初始口令＋复制邀请文本）。被邀人闭环：登录页 Matrix 页签（既有）首登 → 设置页改密（既有）。台账：`docs/admin/invites.md`（governance 仓）。

### 3. agent 级模型绑定（零新端点）

上游 `PUT /api/hermes/config`（`modules/hermes/routes/config.ts:7`）body `{section:'model', values:{default, provider}, restart}` 经 `x-hermes-profile` 头定向 profile（`controllers/config.ts:24-32` requestedProfile），safeFileStore.updateYaml 带 backup。前端表单直读 profile 详情（model/provider 字段）写回即可。

### 4. agent 启停（零新端点）

`POST /api/hermes/profiles/:name/gateway/restart` 与 `/restart`（client `api/hermes/profiles.ts:98-108`）登录即可（受 per-user 白名单过滤）。前端挂重启按钮。

### 3+4 载体：智能体工作台 `/app/agents`（新视图 ia2.agents）

profile 列表（name/model/网关状态）＋行操作：重启网关｜重启运行时｜模型绑定（展开：model.default＋model.provider→PUT config）。旅程步骤 5 目标从 `hermes.agentManager`（双门控默认关）改为 `ia2.agents`，摘除「未开启」门控与挂账注。

### 5. CenterKey 改 stage1-6

`CenterKey`/`IaAreaKey` 从 workbench/sim/gov/workbench2/accept/govern 改 stage1-6；联动：nav-centers（类型＋键表＋centerForPath）、routes（IA_AREAS＋areaForPath）、store/ia.ts（默认 ref 'collab' 陈旧值一并修为 'stage1'）、IaCentersNav（workbench2 判断→stage4；testid 变 `ia-nav-center-stage1..6`）、IaPopoutBar、四个测试文件断言。纯内部命名，用户不可见。

### 6. 模型服务商统一入口

IdeEngineModelsDialog（`custom/client/ide/components/IdeEngineModelsDialog.vue`）零组件库依赖、表单自包含（侦察确认可平铺）：提取表单为 `GovModelProvidersSection.vue`（GET `/api/ide/engine-models`＋POST `/api/ide/engine-models-put` 同源），挂治理·系统设置 资产域。

### 7. Matrix 开发态链接（零代码改动，运行时操作）

synapse（docker :8008）有 registration_shared_secret（homeserver.yaml:30）→ 宿主用共享密钥 nonce+mac 流程建 dev 账号 → 8649 登录页 matrix tab（默认 tab，homeserver 默认 localhost:8008）登录 → matrix 凭据四键＋hermes JWT 双写 → `/app/teams` 建注册房（account_data 每账号指针，与仿真注册房零串扰，侦察 §5 确认）→ 自声明 leader 过准入五问 → 面板全功能。走查取证「Matrix 已连接」。

## 二、非目标

不动上游文件（零 patch——redeem 路径设计专门绕开）；不动仿真在用的注册房与 30 个仿真账号；不引入 cipheriv 加密原语；不在 sim 运行期执行 inject。

## 三、运行约束与风险

1. sim 网关在跑且 `kanban_gates.py:183` 默认调 8647 本体端点（卡片过列时）——8647 重启存在秒级失败窗。缓解：重启前全量 vitest 绿＋后端改动最小化＋重启后立即三探针（/health、login、ontology 端点）；今晨有推演期重启成功先例。
2. serve-server ts-node 全量编译冷启动慢（tens of seconds），重启窗口预期 20-60s，一次性带齐 env 与后端改动。
3. governance 仓初始化位置 `ncwk/governance`（overlay 仓外、工作区内），不进代码仓历史。

## 四、验收

1. 签 2 组织表单可增行保存（git 提交出现）。
2. 邀请链接全链：创建→领取页显示凭据→matrix tab 登录成功→（改密入口在）。
3. /app/agents：列表渲染、模型绑定保存后 profile 详情回显新值、重启按钮返回结果提示。
4. grep 无 'workbench2' 残留；nav testid 全 stage1-6；测试全绿。
5. 设置页资产域出现模型服务商区，可读写。
6. dev 浏览器 Matrix 已连接，/app/teams 建房+leader 自声明+值守分派可操作，截图取证。
7. 全量 vitest 绿；8647 重启后三探针绿；sim 网关进程存活不变。
