# 驾驶舱挂账清偿：REAP 内容恢复与 element-web 部署

- 日期：2026-10-26
- 分支：`fix/cockpit-debt-completion`
- 基线：`main` 的 `442136d9e`
- 前批：`2026-10-26-cockpit-followup.md`

## 修改

本批处理前批明确挂账的两项，并为 serve-main 换装：

1. 从本地提交 `0a4776b1b` 恢复 `rea-reverse-engineering` 与 `upstream-agent-skill-fusion` 两个技能，以及 REAP 26 个场景包。恢复前已逐字节校验源工作树与该提交一致，不跨 worktree cherry-pick。
2. 使用本地官方 `upstream/element-web` v1.12.32 构建 `apps/web/webapp`。补齐静态中间件对 `ELEMENT_WEB_DIR` 的支持，消除 `server-info` 已支持环境覆盖、静态路由却只认固定目录的矛盾。
3. serve-main 切换到本批合入后的 main，验证后端、前端、Matrix server-info 和 element-web 实际页面。

REAP 是第三方 MIT 许可的逆向分析资料。本批只做本地恢复、内容校验与版本管理，不运行其中的逆向任务，不把资料送往外部服务。element-web 使用本地官方源码和锁文件构建，不从非官方镜像获取资源。

## 决策记录

| # | 决策 | 理由 |
|---|---|---|
| E1 | REAP 从已校验的本地提交恢复，不 cherry-pick | 遵守不跨 worktree cherry-pick 的仓规。只恢复该提交中的两个技能目录，不带入其他旧血统内容 |
| E2 | element-web 用 `ELEMENT_WEB_DIR` 指向官方构建产物 | 与 server-info 既有环境覆盖契约一致，不复制静态资源进 vendor，也不改默认关闭矩阵认证等产品决策 |
| E3 | 复用 serve-main，不新建任务树 | 当前在途 worktree 超过三个，避免继续扩张。未提交的启动脚本保持原样且不纳入本批提交 |
| E4 | Matrix 房间数据与宠物功能不通过伪造账号或改默认开关验收 | 这两项是环境与产品决策，不能用技术手段包装成已完成。可验证的环境与功能将实测，受限部分单列 |

## 验证

- REAP：两个技能目录 29 个文件与 `0a4776b1b` 逐字节一致（shasum 全对账）。26 个场景包目录齐全，frontmatter 全部可解析。
  新增 `scripts/__tests__/reap-skill-content.test.ts` 守门：各包 frontmatter 的 ready-to-paste 声明合计 102 条，与实际场景代码块数逐包相等。全库代码块 105 个，安装说明、索引、通配模板三个辅助块单列。
- element-web 源码面：`element-web-failsoft.test.ts` 新增 ELEMENT_WEB_DIR 断言先红，旧实现静态路由不读该变量。补丁 693 后 4/4 绿，`server-info.test.ts` 10/10 不回归。
- 补丁 693 可应用性：先按 series 序单独重放触及 http.ts 的 11 个补丁，定位到 693 的生成缺陷。缺陷是 +++ 路径双 b/ 前缀让 git apply 把文件识别成新增并落错目录。修正头部后全净态 clean→inject 重放 401 个补丁全绿（含 693）。
- element-web 构建与运行面（实测）：
  - 官方源码 v1.12.32 以 `pnpm install --frozen-lockfile` 安装、`pnpm --filter element-web build` 构建，产物 `apps/web/webapp` 169MB，含 index.html 与 bundles。
  - `ELEMENT_WEB_DIR=<webapp> npm run serve` 后 `/health` 200，`/api/matrix/server-info` 返回 `elementWebAvailable:true`。`/element-web/` 200 text/html，深链 bundle 资源 200。`/element-web/config.json` 仍返回 server-info 单源配置。
  - 无头浏览器实测：页面渲染「Welcome to Hermes Matrix Chat / Sign in」。点开 Sign in 出现完整登录表单，homeserver 显示 matrix.test 与 http://localhost:8008，与 server-info 一致。
    唯一 4xx 是 `localhost:8008/_matrix/client/v1/auth_metadata`。本地 Synapse 版本只到 r0.5.0 不实现该端点，属服务端版本能力而非本链路缺陷。
  - 走查器抽查 board/inbox 2 页 PASS（WALK_BASE=localhost:8649，vite 绑 [::1] 故 localhost 可达、127.0.0.1 不可达）。
- 全量回归：`npm test` 结果回填交付说明。
- 未验证项：element-web 用真实 Matrix 账号登录收发消息，本机无已配账号，不伪造。宠物功能内容属产品默认关的产品决策，不改开关凑数。

## 设计文档影响

DESIGN_SYNC: none。REAP 恢复属于已有内容的补回。element-web 只补齐既有环境变量的实际消费路径，不改产品定位、导航、权限或数据结构。设计正本无需修订。
