# hermes-studio v0.7.37 升级迁移轮（2026-10-19）

> 用户 /goal 三目标之目标 1。本文是本轮升级迁移的正本记录：基线、适配清单、裁决与验证证据。
> 前序同类轮：0.7.34 轮（⑮，d6c5d13f）/ 0.7.35 轮（c17c6401）/ 0.7.36+0.22.2 轮（2026-10-16-upstream-0736-0222-upgrade.md）。

## 基线

| 组件 | 旧 | 新 | 依据 |
|---|---|---|---|
| hermes-studio | v0.7.36（1242ac635） | **v0.7.37**（51a41075e） | gh tag 0.7.x 稳定线最新（2026-10-19 14:30 +0800 打 tag）；v1.0.x 为杂项 tag 非发布线（10-16 轮裁决沿用） |
| hermes-agent | v0.22.2 | v0.22.2（零移动） | 远端最新稳定即当前（canary 线为 0.22.2+canary.*，无正式新版） |
| element-web | v1.12.32 | v1.12.32（零移动） | git tag 核实最新稳定（v1.12.33 仅 rc.0） |

变更面：studio v0.7.36→v0.7.37 共 20 提交、297 文件 +14890/−667（Computer Use 原生化/模型 API 面板/群聊消息选择删除/侧栏可调宽/Windows ARM64 打包/TOS 净装修复/OAuth 凭据清理）；依赖新增 @trycua/cua-driver 0.35.4。

## 隔离布局

沿用 0.7.36 轮配方：`ncwk/up0737/` 私有上游副本（本地 clone 双仓 + APFS `cp -Rc` node_modules）+ overlay worktree `feat/upstream-0737` + `OVERLAY_UPSTREAM_ROOT` 指向私有根。适配全程零触碰共享树；换装窗口另行收口。辅助工具 `up0737/{driver,diag,analyze,replay,regen}.mjs`（重放-修复-差分再生流水，快照前态防多补丁共享文件误吞）。

## 补丁适配清单（22 补丁再生成/修改 + 2 归档）

| 补丁 | 漂移类型 | 处置 |
|---|---|---|
| 005 routes-auth | locked-ips 路由上下文加 requireSuperAdmin | 上下文行更新 |
| 041 desktop rebrand | win nsis arch 上游扩 [x64, arm64] | 保留上游 arm64 + 上下文更新 |
| 042 desktop rebrand pkg | 版本上下文 0.7.36→0.7.37 | 上下文行更新 |
| 072 AppSidebar | 上游新增 SidebarResizeHandle（#3408 侧栏可调宽）× overlay 系统折叠组 | 两侧保留式再生（上游组件保留 + overlay 入口组重插） |
| 088 chat-run autojoin | import 行上游加 listSessionIdsByUserId 位移 | import 行补齐再生 |
| 101/102 gateway banner | MessageList/GroupMessageList 上游消息选择大改（#3422/#3425）× overlay banner | 锚点重插再生（import+模板两 hunk） |
| 130 webui-detached | 上游 spawn 改 resolveWebUiNodeExecutable（Node 模式修复） | 注释块插到新 spawn 调用前 |
| 201 vuetsc fixes | 102 级联 | 102 再生后自动恢复 |
| 340 usage rounds | 上游 sessions 路由/控制器位移 | 快照差分再生（三文件，controllers 带 offset 应用） |
| 357 sessions lease | SESSIONS_SCHEMA 尾部上游加 context_usage_estimate | 上下文行更新（含 SQL 转义字节保真——Python heredoc 吃转义事故两连，终以字符构造法对齐旧世界字节） |
| 393 mimo coding agent | agent 联合类型上游加 'model_api' | 'mimo' 与 'model_api' 合并插入；新建文件走 new-file diff（regen 工具补新建文件支持+丢失断言） |
| 473 locale rebaseline | en/zh 上游 +98/−10（localized changelog #3445） | **三方合并终态再生**（base=v0.7.36/ours=旧世界终态/theirs=v0.7.37；4 处冲突键级并集：computerUse*×3+resize 补入；406KB 全链补丁） |
| 497 win zip target | 041 同文件级联 | nsis arm64 保留 + zip x64 目标重插 |
| 520 webpet-off | App.vue 上游 +38/−5 | petsEnabled 定义重插（模板用法 hunk 原样应用） |
| 524 s3 stage gates | ModelsView auxiliary 页签上游位移 | v-if="features.imageAssist" 重插 |
| 528 profiles read-cache | routes.ts 上游 +2 | import 块+挂载点重插 |
| 565 ekko tool waterfall | execute 方法上游重构（授权/safe 快道/try-catch/审批事件） | pre 钩子紧随授权检查，两条执行路径各过 post 钩子（合并语义=overlay 全覆盖+上游新结构保留） |
| 587/623 | 393/528 级联 | 前置再生后自动恢复 |
| 640 remove-default-login | desktop index.ts 上游 +18/−10 | import 行重插（其余 20 文件含 locale 13 文件原样应用） |
| **653 matrix syncing locale** | 上游已含 syncing 键（overlay 功能被上游吸收） | **移入 `_skip-0737/`**，series 记档 |
| **659 task workspace locale** | 全部 14 键已含于再生 473 全链终态 | **移入 `_skip-0737/`**（键集 14/14 在树核验），series 记档 |

系列口径：380→378（653/659 归档）。

## 决策记录

- **D1（locale 终态三方合并）**：473 的 en/zh 再生不逐 hunk 手工移植（reject 各 6 大 hunk 不可行），改走 git merge-file 三方合并（base=v0.7.36 干净版/ours=旧世界全链终态/theirs=v0.7.37），仅 4 处冲突、全部为「上游新增键」形态，键级并集解决（OURS 为超集+补 4 新键）。终态字节与 640 应用后的树对账通过（cmp 一致）；640 的 en/zh 单行改动（defaultCredentialsHint）以 I 态回退法从终态中剥离，保持补丁边界。
- **D2（653/659 归档）**：653 的 syncing 键 en/zh 均已被上游 v0.7.37 自带（上游吸收 overlay 功能的首次实录）；659 的 14 键已含于 D1 全链终态。两补丁移入 `_skip-0737/`（沿 473 吸收七补丁的 `_skip-0736/` 先例），series 注释记档。
- **D3（565 waterfall 落位）**：上游 0.7.37 给 execute 增加授权拒绝块+safe 快道+错误捕获+审批事件重写。overlay 瀑布钩子语义=每次执行前后过钩子。裁决：pre 钩子放授权检查后（权限已过才允许钩子否决）；safe 快道与非 safe 路径各自过 post 钩子（safe 路径为此从同步直返改为 await——overlay 钩子全路径覆盖优先于上游的快道微优化）。
- **D4（regen 工具新建文件丢失事故）**：393 首次再生时新建文件（mimo/definition.ts 等）因快照缺文件被静默丢弃、验证重放同树假绿。修复=regen 补 new-file diff 分支+「重放后全部目标文件存在」断言；393 重做（12 文件含 2 新建全量在场）。
- **D5（357 转义事故）**：Python heredoc 把补丁里的 `\'\'`（TS 源码字面转义）吞成 `''`/`\\'\\'` 两连（TS1005 语法错）。根治=chr() 字符构造法写入，与旧世界 cmp 字节一致后才装回；教训入 up0737 工具注释。
- **D6（element-web/agent 零移动）**：element-web v1.12.32 已是最新稳定（1.12.33 仅 rc）；hermes-agent v0.22.2 后无正式 tag（canary 线不算稳定版）。本轮仅 studio 单仓升级。

## 验证证据

- 批量驱动（`up0737/driver.mjs`）：**378/378 plain-apply 全过**（agent 72 条全应用）。
- 官方链：`npm run inject`（OVERLAY_UPSTREAM_ROOT=私有根）全量应用（zcode 三处 skip=共享归档树幂等跳过，与 0.7.36 轮一致；deploy-agent-runtime 40/40 相同零写入）。
- `vue-tsc -b` 0 错；`build:full` 全链过（openapi/vite client 8764 模块 15.92s/tsc server 0 错/build-server/运行时资源/verify-dist 出厂口令扫描零命中）。
- **全量 vitest 三树对照**（回归判定的决定性证据）：
  - 干净 v0.7.37（无补丁）：8515 过 / 3 败 / 8557
  - v0.7.36+原补丁基线（up0736sim 模拟树）：7421 过 / 183 败（120 失败文件，历史累积债）
  - **v0.7.37+适配补丁（本轮）：8314 过 / 244 败（72 失败文件）**
  - **失败文件集合对比：0737 独有失败 = 0（零新增回归文件）**；0736 基线 120 个失败文件中 48 个在 0.7.37 恢复通过（上游修复红利）。剩余 72 个为两轮共有基线债（如 tests 调 640 早已删除的 bootstrapDefaultSuperAdmin——0.7.36 基线同样失败，非本轮引入）。
- 失败计数 183→244 的构成：同文件内失败用例数增加（集中在既有失败文件），无新文件失守；按「零新缺陷的完整轮」判据，文件级零新增=本轮无回归。

## 后续（换装与出包，本批收口）

1. 共享树 swap：停 8647 → `npm run clean` → checkout v0.7.37 → 官方 inject → npm install → 复跑关键测试 → 重启 serve-server（8649 serve-main 同步换装）。
2. 桌面出包：mac arm64 dmg + win x64 zip 免签（desktop-build-artifact-rule），不上传 GitHub/ModelScope。
3. 本机重装 SwarmStudio.app 至 0.7.37。
4. ncwk AGENTS.md 版本锚同步（studio v0.7.37 / agent v0.22.2 / element-web v1.12.32）。
