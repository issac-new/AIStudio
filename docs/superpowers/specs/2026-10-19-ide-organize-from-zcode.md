# 侧栏组织取 zcode 信息：项目/时间线混排 zcode CLI 会话（spec）

日期：2026-10-19
分支：`feat/ide-organize-from-zcode`
来源：用户指令——「分组和项目、置顶等都取 zcode 的对应信息」。

## 变更

1. **「项目」组织取 zcode 项目信息**：zcode 的权威项目路径=CLI 会话库 `session.directory`。「项目」组织把 zcode CLI 会话按 directory 并入同名项目组（与 IDE 会话同组同维度）；只有 CLI 会话的项目也成组完整呈现；「未绑项目」兜底置底规则不变。
2. **「时间线」组织混排**：CLI 会话按 `timeUpdated` 并入今天/近 7 天/更早分层（同一时间口径）。
3. **「分组」组织**：zcode 无自建分组存储（CLI db 与桌面 setting.json 均查无——local_setting 仅权限/模型），CLI 保持独立段（既有行为），不伪造 zcode 分组。
4. **置顶**：zcode 同样无置顶存储，IDE 置顶保持本地偏好，不虚构数据源。
5. **数据流收敛**：CLI 会话单一数据源上提到侧栏（`cliAll/cliFiltered`），`IdeCliSessions` 组件改为可接收 `sessions` prop（侧栏场景不双拉；落地 hero 仍自拉）。混排行=「zcode」徽标+标题+工作区短名，点击=终端继续，⧉=复制 ID。

## 决策记录

1. **混排而非并列**：用户要的是「项目」分类取 zcode 信息——并列两段各说各话无法在同一项目维度聚合；混排后 ncwk 组同时看到 IDE 会话与 zcode CLI 会话。
2. **directory 是唯一可信 zcode 项目源**：网关会话 agentSessionId 全空（列表/详情均无），无法按会话反查；CLI 会话自带 directory 直接可用。
3. **分组/置顶如实缺省**：zcode 无对应存储就不接入，宁可保持本地语义也不造"看起来来自 zcode"的假数据。
4. **共享过滤口径**：`filterCliSessions` 提为纯函数（utils/sessionProjects），混排与独立段/hero 同口径（视图+搜索）。

## 验证

- 单测：organize-zcode-merge 6 例（cliProjectOf/filterCliSessions 纯函数；项目混排 ncwk 双源同组、独立段仅分组模式、时间线今天段含 CLI；源码守门）+ IDE 全套 119 文件 / 724 用例过；构建通过。
- 真实浏览器（8656）：项目组织=ncwk[cli:13]/Swarm-yuan[cli:2]/tmp[cli:14]/未绑项目[cli:1]（zcode directory 分组）；时间线=今天[cli:30]；分组模式=CLI 独立段在位。
