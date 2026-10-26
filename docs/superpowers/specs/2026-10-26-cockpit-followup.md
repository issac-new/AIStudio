# 驾驶舱收尾批：未做项清偿（2026-10-26）

- 日期：2026-10-26
- 状态：已落地
- 分支：`fix/cockpit-followup-20261026`（基 main `c776edbe5`）
- 前批：`2026-10-26-cockpit-source-design-refactor.md`

## 修改

前批交付说明列出的未做项，本批清偿四件、如实挂账两件：

1. **走查器外链弹回标签精确化**：路由守卫把 `share.groupChat`/`groupChat.link` 等页面送回 `/app`，此前记为「页面 PASS」。现按实际落点分类：离开原址记「守卫弹回」WARN，不冒充内容验收。停在原址才判页面失败。探针纯函数补单测。
2. **useRunTrace 既有 TS 债清偿**：删除未使用的 `childSessionsByParent`，该逻辑早已内联到循环内的 `isChild` 判定。诊断的另一处报点复核后不成立。
3. **生产包浏览器验收**：新增 `scripts/regression/serve-dist.mjs`，静态托管 dist/client 并把 `/api` 等路径反代到指定后端。生产链走查支持 `WALK_LOGIN` 显式登录，对生产构建跑全量只读走查，补上前批只在 dev 链验收的缺口。
4. **写流与权限矩阵验收**：新增 `scripts/regression/walk-writes.mjs`，用 dev-bootstrap 凭据在真实 API 上做可逆写回路。回路为建临时板、建卡、blocked→ready 真实迁移、running 显式拒绝、删卡、删板、复核消失。
   权限面验证无 token 或坏 token 访问受保护端点必 401。测试对象自带前缀与清理，失败也走清理路径。
5. **补丁 692，写流验收发现的真缺陷**：PATCH 把 status 设为 running 在服务端无分支静默 no-op，返回 200 带旧任务。CLI 无手动 running 动词，running 由 worker 领卡进入，bulk 链 default 已显式抛错。补 else 分支抛人话错误，PATCH 链同样 fail-loud，守门测试加锚点。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| F1 | 外链弹回记 WARN 而非 FAIL | 守卫把 externalLinks 关闭的外链页送回 /app 是产品行为（S3 立法），验收面应如实呈现「未验收该页内容」而不是红 |
| F2 | 写流验收用临时对象并保证清理 | 真实板卡数据不可动。回路对象名带 walkthrough 前缀，异常退出时下次运行先清残留 |
| F3 | 生产包验收走静态服务加反代，不起第二后端 | 走查是只读的，反代到既有 8647 即可。起隔离后端属另一档成本，本轮不付 |
| F4 | REAP 26 包缺失不代领 | 属并行会话在旧血统上的提交，按仓规不跨 worktree cherry-pick。列明待该会话落地或用户裁决 |

## 验证

- **探针单测**：走查判定纯函数 4 用例绿，含弹回判定的红→绿实录。
- **生产包走查**：`npm run build` 后经 serve-dist（8653）与生产链显式登录（`WALK_LOGIN`）跑全量，180 记录 0 缺陷、39 条警告分类在案，152 截图落在 `/tmp/aistudio-prod-full-20261026/`。
  9 个守卫弹回页全部记「守卫弹回 WARN」。走查后端为 serve-main（b3351e93 基，未含本批 692），只读面不受影响。
- **写流验收**：对隔离后端 8655（含 692 注入态、`HERMES_WEB_UI_DEV_BOOTSTRAP=1` 首登建号）跑 `walk-writes`，16/16 全绿。覆盖权限矩阵三例 401、建板建卡、blocked→ready 真实迁移、回读一致、删卡、删后 404、删板归档语义、CLI 硬删清残留。
  首轮对旧基线实锤 PATCH running 静默 no-op（200 带旧任务），这就是补丁 692 的红。
- **补丁 692**：全净态 clean→inject 重放通过，series 含 692 后逐字应用。守门测试 `kanban-state-machine-gate` 增锚点断言，断 else 抛错与人话消息，10/10 绿。
- **类型**：诊断 tsconfig 下本轮涉改文件零类型错误。`useRunTrace` 未用变量已删，余两条为该诊断配置自身的类型库解析噪声，非源码问题。
- Matrix 房间数据与宠物内容维持环境受限，不强行造数验收。受限原因：homeserver 在线但 studio 侧 element-web 503、无已配 matrix 账号，pet 默认关是产品决策。
- serve-dist 反代适配了后端 socket.io 的 Origin 校验。直连实测：8651/8653 等源遭拒（400 origin not allowed），同源或无 Origin 放行，dev 链靠 vite `changeOrigin` 通过。serve-dist 对升级代理做同款 Origin 改写。

## 挂账与未代领

- **REAP 26 包缺失**：旧血统尖端提交 `0a4776b1b`（rea v1.2.0 + upstream-agent-skill-fusion v1.2.0）在新 main 无等价内容（`git cherry` 唯一 `+`）。属并行会话 cockpit-full-audit 分支的工作，按仓规不跨 worktree cherry-pick——待该会话落地或用户裁决。
- element-web 503（/element-web/ 静态资源未挂）：与九点轮记录的 element fail-soft 同源，非本批范围。

## 设计文档影响

DESIGN_SYNC: none——本批为验收工具脚本（scripts/regression）与补丁 692（服务端单点 fail-loud 修正）及一处 TS 债清理，不改导航结构、页面归属、契约阈值与 UI 形态；`2026-10-23-swarmstudio-integrated-design.md` 等设计正本无对应条目需要修订。
