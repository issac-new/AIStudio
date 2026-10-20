# 驾驶舱 M3 独立验收与兄弟遗失提交恢复（2026-10-20）

> 分支：`feat/sibling-recovery`。性质：接管后的验收轮——全量活页面走查（65 页）、
> matrix 链路活体验证、全量回归（5653 通过/10 环境性失败）、走查发现修复、
> 兄弟会话遗失四提交恢复。上游正本=《2026-10-20-cockpit-audit-reconciliation.md》第九节接管记录。

## 一、验收范围与结果

### 1. 全量活页面走查（65 页面态，Playwright 逐页截图+布局启发式）

覆盖：/app 全路由 + 六阶段 33 页签 + 推演专区 6 页 + 4 岛屿 + IDE + 设置域 + hermes 并入页抽样。
证据：`.claude/walkthrough-m3/shots/*.png` + `report.json`（采集器 `crawl.mjs`）。

**正面结论**：拆分后的导航形态（日常/推演侧栏模式切换、顶栏三段、阶段页面包屑）全线渲染正常；
审批收件箱对 503 台账端点优雅降级（如实空态）；推演专区对不可达 run 给内联提示；
看板页/阶段看板签数据真实（1082 任务、跨板 chips）。布局裁切启发式标记（.ia-attn__text 等）
经截图复核均为正常省略号，不构成缺陷。

**发现与处置**：

| # | 发现 | 严重度 | 处置 |
|---|---|---|---|
| W1 | 阶段③④看板页签未捕获异常：`Kanban capability "diagnostics" is not supported`（上游 store 的断言在自身 try/catch 之外抛出；dev 后端无此能力） | P1（页面可渲染但错误监控被污染） | **已修**：SwarmKanbanView 三处调用点改能力守卫（fetchDiagnosticsIfSupported），并补守门测试 1 例；活页面复验 pageerror 归零。上游 store 断言次序问题挂账（下轮补丁再生时处理） |
| W2 | 工作台（/app/collab）首载 >3.8s 白屏（加载态无骨架屏） | P2 体验 | 挂账：加载骨架/数据并行化另立批 |
| W3 | 导演 run（run-sim-director-*）出现在推演运行选择器，但旧 26 步 run-state/journal 体系读不到 → 四页 404 噪音（UI 已内联如实提示，useStageProgress 已会清死 run 记忆） | P2 结构性 | 挂账：导演 run 与 run-state 两套体系贯通是设计决策（见决策 D3），不在验收轮代决 |
| W4 | orgloop/ledger 503 控制台噪音（UI 已优雅降级） | P3 | 挂账：端点未配置环境的前端降噪（可选项） |
| W5 | dev 链 main.ts 以 admin/dev-bootstrap 自动超管登录（M8b 已知机制，服务端 HERMES_WEB_UI_DEV_BOOTSTRAP=1 门控建号） | 提示 | 挂账：装机/生产链须复核该桩不生效（安全轮范畴） |

### 2. matrix 链路活体验证

| 项 | 方法 | 结果 |
|---|---|---|
| `GET /api/matrix/server-info` | curl 8647 | PASS `{homeserverUrl:"http://127.0.0.1:8008",serverName:"matrix.test",elementWebUrl:"/element-web/"}` |
| `GET /element-web/config.json` | curl 8647 | PASS base_url=`http://127.0.0.1:8008`、server_name=`matrix.test`（旧值 `https://matrix.org` 已退役；patch 008 遮蔽修复后动态分支真正可达） |
| 登录页 homeserver 预填 | Playwright（清存储+拦截自动登录强制登录页现身，截图 m3-login-prefill.png） | PASS 输入框值=`http://127.0.0.1:8008`（补丁 669 生效，非写死 localhost） |
| 分享对话框产品内链 | 兄弟 5d815c06（恢复后随带 share-link.test.ts 5 例全绿）；本环境无 matrix 凭据，活体房间分享未验（如实声明） | 测试证据通过 |

### 3. 全量回归

`vitest run` 全量：**5653 通过 / 10 失败 / 8 跳过（779 文件）**。10 失败全部环境性、
与本轮改动零交集：diagram-export×3（playwright chromium 版本缺口 1243 vs 缓存 1234，
CDN 下载 socket hang up 未补）、cua-node-backend-platforms×5（upstream/zcode 未构建
node-backend.js）、tool-waterfall-gate×1（注入态守门依赖 git refs）。

## 二、兄弟会话遗失提交恢复

**事故**：兄弟会话的 `feat/cockpit-split-hygiene` 分支五提交中，仅拆分主批以另一条
提交线（a2901f8d）合入 main；**spec 正本（f0db3ac8，D1-D12 裁定记录）、matrix B1 修复
（5d815c06）、术语清理（e02c03a1）、交接附录（3d0e1af0）四提交遗失**（与 2026-10-19
"合并丢失事故"同形态——分支腾挪中漏线；MatrixShareDialog 在 main 上仍是 matrix.to 旧版，
被本验收轮走查+文件复核抓出）。

**恢复**：按序 cherry-pick 四提交回本分支（f0db3ac8 → 5d815c06 → e02c03a1 → 3d0e1af0），
冲突如实记录。`08cb83f3`（与 main 的 a2901f8d 同题拆分主批）不重复拣选。

## 三、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | diagnostics 修在 custom 调用侧守卫，不打上游补丁 | 唯一受影响消费方是 custom SwarmKanbanView；守卫零补丁成本；上游断言次序问题登记挂账，随下轮补丁再生统一处理 |
| D2 | 兄弟遗失提交用 cherry-pick 恢复而非整支 merge | 其分支尖端 08cb83f3 与 main 的 a2901f8d 是同题拆分主批的两条线，整支 merge 会双重引入拆分改动；只拣 main 缺失的四提交 |
| D3 | 导演 run 与 run-state 两体系贯通不在验收轮代决 | 属产品设计决策（导演 run 详情该走图运行时面板还是 26 步面板），需用户裁定方向；验收轮如实登记 W3 |
| D4 | dev-bootstrap 自动登录只登记不处置 | M8b 安全轮既定机制且有服务端门控；生产链复核属安全轮范畴，越权处置可能打断全部走查脚本（它们共用该凭据） |

## 四、验证账（收口）

- [x] 走查 65 页完成，台账见本文第一节
- [x] matrix 三项活体 PASS + 登录页预填 PASS
- [x] 全量回归 5653/10 环境性失败（失败域与本轮改动零交集，已逐条核对报错）
- [x] SwarmKanbanView 修复：看板测试 53/53 绿（含新守门）、活页面 pageerror 复验归零
- [x] 遗失四提交恢复（cherry-pick 结果与冲突记录见提交信息）
- [ ] 分享对话框活体房间验证（本环境无 matrix 凭据，留待有凭据环境）
- [ ] W2/W3/W4/W5 挂账项后续批次
