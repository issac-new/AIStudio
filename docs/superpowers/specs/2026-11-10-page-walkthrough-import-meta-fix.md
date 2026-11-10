# 全页面走查轮：serve 链 import.meta TS1343 修复（2026-11-10）

## 变更

全量页面走查（121 路由＋37 阶段页签＝158 站，300 判定点）发现一处 P1 缺陷并修复：

**D1：`custom/server/executioncontract/index.ts:100` 使用 `import.meta.url` 定位契约正本，在 serve 链（ts-node，server tsconfig `module: "commonjs"`）首次编译即抛 TS1343，后端无法启动。**

该文件由执行内核统一批 P0a（merge `10c6fd1d6`）引入；同仓 `simrun/supervisor.ts:61` 与 `lib/upstream.ts:25` 的注释均已立法「CJS 编译产物里不可用 import.meta」，本批又踩同一坑。修复＝按既有先例改 `__dirname` 双运行时口径：

- serve 链（ts-node/CJS）：`__dirname` 为 `custom/server/executioncontract` 源码目录，三级向上即仓根；
- vitest（SSR 转换）：注入的 `__dirname` 同源码目录，路径不变；
- 契约正本路径解析结果不变：`仓根/config/execution-contract.json`，`loadExecutionContract` 的 fail-closed 语义不动。

改动面：单文件单点（`executioncontract/index.ts` import 与 `contractPath` 常量），无行为变更。

## 决策记录

- D1（Mechanical）：`import.meta` → `resolve(__dirname, '../../..', 'config', 'execution-contract.json')`。不引入 `repoRoot()`（cwd 上溯）——`__dirname` 锚定模块位置，比 cwd 上溯更确定，且与 supervisor.ts 先例同型。
- 走查环境（Mechanical，不入库）：因主树 vendor 被另一会话实时写入（双活冲突），本轮走查在独立 worktree `qa-walk-1110`＋隔离端口 8657/8659＋隔离数据根（`HERMES_HOME`/`HERMES_WEB_UI_HOME`=/tmp）＋借用宿主 venv（`HERMES_AGENT_BRIDGE_PYTHON`＋desktop selection lock）进行。runtime 部署预检经影子 manifest（`RUNTIME_DEPLOY_MANIFEST`）重定向到隔离目录，未触碰宿主 `~/.hermes` 安装树。
- 走查 14 条 DEFECT 全部定性为环境态，非产品缺陷：kanban 500 族＝空 home 依赖环境冷启动竞态（依赖锁 10s 超时，重试自愈）；plugins 500＝python 桥依赖环境缺席（`HERMES_AGENT_ROOT` 未指 vendor）；matrix gateway-credentials 404＝`configured:false` 设计内语义（`custom/server/matrix/routes.ts:49` 成文：无凭据时客户端回落手动登录）。

## 验证

- `npx vitest run custom/__tests__/execution-contract.test.ts`：10/10 过（契约四表完整性与白名单断言不变）。
- 修复前 serve 链实测：`TS1343: The 'import.meta' meta-property is only allowed when ...` 启动即挂；修复后 ts-node 编译通过、`:8657` 正常监听、`/api/auth/login` 与业务端点实测通。
- 全路由走查（158 站）：复跑验证环境缺陷消除后的真实缺陷面。

## 设计文档影响

DESIGN_SYNC: none——单点编译修复，不改变契约语义与执行内核统一批的设计决策（该批 spec 的「验证」节所缺 serve 链回归由本缺陷暴露，防复发建议：合入前 npm test 之外补 serve 冷启动冒烟）。
