# userenv 路由挂载清偿（补丁 743）＋ env-store 类型修复

日期：2026-11-04
状态：implemented
触发：推演工装刷新第二轮的活体验证（用户令「完成未做」）——`mx-capability-probes.mjs` 对在跑 8647 实探测得 29/31，userenv 组两红定谳为**真产品缺陷**：N01 profile 环境变量编辑域只有 handler、从未挂载（原批 spec 2026-11-04-agentteams-ledger-items 自记「挂载补丁由后续批次接」，后续批次遗忘）。夹具直挂路由所以守门全绿，组装面上能力 404 不可达——探测框架首次在活体上抓到「写完了没接线」。

## 变更

1. **补丁 743**（`patches/743-server-userenv-routes.patch`，照 740 形态两行）：vendor `bootstrap/routes.ts` 增 `import { userenvRoutes }`＋auth 后 `app.use(userenvRoutes.routes())`；series 登记于 742 后。干净树 `npm run clean && npm run inject` 全链重放零 WARN（743 正确性终局证明）。
2. **env-store 类型修复**（`custom/server/userenv/env-store.ts`）：`.filter((e): e is EnvEntryInput => e.value !== undefined)` 类型谓词——原裸 filter 不收窄 `string|undefined`，四处下游 TS2345。该域从未被 ts-node 服务端装载编译过（无挂载即无编译），挂载后首次暴露；vitest（esbuild 不检型）与 typecheck 点名清单（未入单）双双漏网。
3. **typecheck 点名清单清偿**（package.json `typecheck:harness`）：补入 userenv/userperms/projectworkflow/execution-records 四域文件——四域均为 2026-11-04 新增服务端模块，原批未按仓规并入点名清单（规则 4 债）。补入后 rc=0。
4. **旁路实例活体复验**：worktree 树起 PORT=8686 ts-node 实例（真实组装面：vendor bootstrap 全链装配＋严型编译＋JWT 门＋宿主真实档位数据；用户库经 sqlite 在线备份自主树复制），`mx-capability-probes.mjs` 全量 **31/31**——含 userenv 逃逸负例真 400（路由真匹配后 handler 拒绝）、敏感键无确认位 409、38 条真实 entries 脱敏回显。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 挂载走补丁而非改 custom 装配 | 与 731/735/740 同族——custom 路由进 vendor 服务的唯一通道是 bootstrap 挂载补丁；N01 原批「custom 端点直读写」指实现落位，不含挂载免补丁 | 无补丁挂载（否决：无通道） | 是 |
| D2 | 类型谓词就地收窄，不放宽 EnvEntryInput | 收窄点即语义点（undefined=掩码丢弃语义），谓词如实表达；放宽类型=把丢弃语义塞进类型系统 | 改 `as` 断言（否决：掩盖） | 是 |
| D3 | 旁路实例验证而非重启 8647 | 8647 是他会话/用户在用服务（ts-node require 缓存持旧代码），重启属他人裁决面；8686 旁路同构验证（全链装配＋同编译器）已充分 | 重启活体 8647（否决：越权扰动） | 是 |
| D4 | 四域一并补入 typecheck 点名清单 | 同一类债一次清偿；四域当前全部通过，零回归风险 | 只补 userenv（否决：留三颗同型雷） | 是 |

## 验证

- 干净树重放：`OVERLAY_ALLOW_LIVE_CLEAN=1 npm run clean && npm run inject` → 743 applied 零 WARN（活体闸为全局 8647 端口探测；本 worktree 树非在跑服务的工作树，豁免安全）。
- 旁路实例 8686：探测 **31/31**（`/tmp/live-probe-8686/capability-probes.json`）；userenv 负例 escape=400、sensitive=409；projectworkflow 空态如实缺省（宿主板无 project_id 任务）。
- `npm run typecheck:harness`（含新四域）rc=0。
- 守门：`bash tests/run-gates.sh`（合并前）＋根 `npm test` 全量（合并前）。
- 残留：在跑 8647 服务仍是挂载前代码（ts-node 进程内缓存），userenv 端点在该实例上仍 404——待该服务下次重启换装即生效；不由本批越权重启。

## 设计文档影响

DESIGN_SYNC: none——纯挂载清偿（原批 spec 已声明的能力面接通），不改契约、架构或数字；typecheck 点名清单是工程配置非设计文档。
