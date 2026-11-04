# 2026-11-04 生产链交互级全量走查（r26 未做项收口批）

## 变更

r26 回归收口报告的两项未做，本批清偿：

1. **push origin main**：已完成（9159f573a..6e8c990de，含 fix/regression-tooling-r26 merge）。
2. **生产链交互级全量走查**：路由级已在 8653 验过（430/0），交互级此前只有 dev 链。本批：
   - **工装可移植化**：absorb-msg-surface / absorb-round2 / gateway-caps / feature-off / dual-user 五脚本 `BASE`/`API` 改 `WALK_BASE`/`WALK_API` 环境可配（默认值不变，dev 链零行为变化）；run-surface-fusion 补 `WALK_LOGIN` 显式登录注入（此前依赖 dev 自动登录，生产链无自动登录必挂）；ide-workspace-verify 已有 `IDE_VERIFY_BASE` 无需改。
   - **新增 `scripts/regression/prod-board-write-walkthrough.mjs`**：daily-workbench E 块（行内建卡→板面出现→抽屉开/关→triage→review 拒 409→ready→review 深链审批按钮区）的生产链移植——daily 的 A1 断言依赖 dev 自动登录链（矩阵桥注入 matrix 凭据）故 dev 专属，本脚本走 API 显式登录任意链可跑。daily-workbench / sim-center / matrix-session 三个依赖 dev 自动登录的脚本不在生产链重复跑（路由级 8653 已覆盖＋交互级 dev 链全绿），如实声明。
   - 生产链实跑：从当前 main（6e8c990de，v1.0.11 基线）重建 dist→serve-dist 8653→七个交互脚本全部对 8653 跑。

## 决策记录

- **D1（Mechanical）**：交互脚本可移植化用环境变量默认值不变的形态（`process.env.WALK_BASE || 'http://localhost:8649'`），dev 链调用方零改动；不复制脚本（禁第二份维护面）。
- **D2（Taste）**：daily E 块移植成独立生产链脚本而非给 daily 加注入开关——daily 的 A1（自动登录+矩阵双凭据断言）与生产链显式登录是两种会话语义，混在一起会让两链各带一组条件分支；独立脚本各自单一职责。

## 验证

- 生产链（8653，dist 由当前 main 6e8c990de 重建，verify-dist 口令扫描零命中）交互级八脚本全绿：
  - absorb-msg-surface 5/5、absorb-round2 10/10、gateway-caps 5/5、feature-off 8/8、run-surface-fusion 10/10（WALK_LOGIN 注入生效）、dual-user 6/6、**prod-board-write 6/6**（行内建卡→抽屉→409 语义→审批按钮区全链）、ide-workspace-verify 11/11（IDE_VERIFY_BASE）。
- dev 链回归抽查（默认参数，不设 WALK_BASE）：absorb-msg-surface 5/5、feature-off 8/8——移植零行为变化。
- `node --check` 全部通过。

### 实跑中抓出的两个走查工装缺陷（已修，非产品缺陷）

1. **生产链冷启动竞态**：注入 token 后不 reload 直接 goto hash，app 可能已按未认证态启动，hash 直达被落地重定向覆盖（实测 `#/hermes/connections` 落到 `/hermes/chat`、assets 页 selector 等不到）。修法：四脚本（feature-off/gateway-caps/prod-board-write/dual-user×2 处）注入后 reload＋waitForFunction 等 Vue 挂载与启动占位消失（walk-routes ensureLogin 同款判据）。
2. **connections 断言文本采样假红**：页头「设备互联」在 body.innerText 的位置随壳层排版漂移，文本 regex 采样在生产链 len=121 时未命中；实况 DOM 判据（pageHeader/connEls）定谳页面渲染正常。断言改 DOM 判据。
- 附带环境事故：worktree 内跑 `npm run build` 弄坏共享符号链 node_modules 的 vite 依赖预构建（dev 8649 全 504）——重启 dev server 重建即愈；本轮已恢复。

## 设计文档影响

DESIGN_SYNC: none
纯回归走查工装环境变量化与新增专项脚本（scripts/regression/），不改产品代码、不触及整合正本与数字总账。
