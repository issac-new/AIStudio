# 2026-11-22 全功能、非功能与安全回归修复批

> 状态：in_progress
> 基线：941a9f4674d5474c619cabafec121ecd8cdca74e（origin/main）

## 变更

本轮在独立 worktree 对 AIStudio 全产品面执行功能、非功能和安全回归，覆盖根 Node/Vue/Koa、Python runtime、simharness、swarm-yuan、Ycode、隔离前后端服务与真实浏览器。证据保存在 `.gstack/qa-reports/run-20261122T133641Z/`；最终报告逐项区分通过、失败、跳过、阻塞和未执行，不用单测全绿替代活体与整体验收。

已确认并纳入修复的首批问题：

1. **Ycode 补丁 002 类型契约断裂**：`pnpm typecheck` 复现 7 个错误。`migrationSource` 在 `validation.ts` 已扩为 `claudeCode/codex/kimi`，但 `zcode-task-types-core.ts` 与 `task-realtime-core.ts` 仍只认 `claudeCode`；`importSessionV4` 未登记 `IZCodeAgentService`；实现还调用当前基线已不存在的 `persistImportedClaudeTask`。修复遵循当前 Claude 原生导入链：共享枚举单一事实源、接口与实现同步、快照写入与任务索引写入各自承担既有职责。
2. **Ycode 基线元数据漂移**：`vendor/VENDOR.md` 与 `vendor/zcode/package.json` 已是 `fec97590 / 3.18.2`，`zcode-patches/series` 头部和 `RELEASE-MANIFEST.json.baselineCommit` 仍停在 `b95ebaff / 3.18.0`。修订残留元数据，并给发布检查增加跨文件一致性守门，防止只改一处再次漏检。
3. **Ycode 真引擎集成测试隔离不足**：`zcode-import-session-int.test.ts` 固定连接 3030 且写入硬编码历史工作区。修复为显式环境变量指定引擎地址和隔离工作区；默认仍 skip，只有测试者明确提供隔离引擎与工作区才执行写探针。
4. **测试前置构建缺口**：工程测试中 `@zcode/e2e-report` 与 `@zcode/contracts` 两个收集失败先通过真实依赖构建补齐，再原命令复跑；不把收集失败误记为产品失败，也不为消红删除测试。
5. **swarm-yuan 生成源与产物漂移**：`test-registry.sh` 稳定复现 `gates-warn.sh 过期`。上一轮给依赖扫描加 `/vendor/` 排除时只改了生成产物 `assets/gates-warn.sh`，未同步域源 `assets/gates/process/deps.sh`，导致生成器会把修复洗掉。把排除规则回移域源并重生成，保留既有 `test-registry` 红灯作为回归门。
6. **既有 pytest 数字与警告对账**：当前拼合树实测为 273 通过，不是旧 spec 的 249；授权修订旧验证数字。两条 `gateway/run_busy.py` 的 coroutine 未 await 警告另做根因调查，不把“pytest 全绿”扩大解释为警告-free。

后续新发现必须先精确重放、完成根因分类并追记本 spec，再修改产品或测试。浏览器驱动缓存、宿主引擎连接和间歇超时先按环境/产品边界调查，不在根因未明时改代码。

## 决策记录

1. **迁移来源采用单一事实源**（Mechanical）：枚举值只在 shared 核心类型文件定义，Zod schema 与 realtime schema 共同复用；禁止再各自手写字面量形成三处漂移。
2. **导入实现跟随当前上游持久化架构**（Mechanical）：当前基线已把快照备份与 CLI/索引会话事实写入拆开，不恢复已删除的 `persistImportedClaudeTask`，也不把备份文件当成第二个运行态会话写者。
3. **发布元数据以 vendor 台账和包版本为锚**（Mechanical）：series 与 release manifest 必须和实际钉版一致；守门失败时阻断发布，不用人工解释替代一致性。
4. **真引擎写入探针必须显式隔离**（Mechanical）：任何真实写入只进入调用者明确提供的隔离 HOME、工作区和引擎端点，不因为本机 3030 有服务就默认写入宿主数据。
5. **不削弱既有测试与门**（Mechanical）：收集失败先补真实构建；类型错误修实现与契约，不用 `skip`、`@ts-ignore`、放宽基线或删除断言消红。

## 验证

每个缺陷执行“原命令精确重放 → 原生红灯回归 → 最小修复 → 原探针与相邻路径复验”。首轮基线已收集：

- `npm test`：1237 文件通过、6 跳过；9878 用例通过、11 跳过。
- `npm run typecheck:harness`：exit 0；`npm run typecheck:client:ratchet`：15 ≤ 19。
- `bash simharness/tests/run-gates.sh`：首次 capability-probes hook 10 秒超时，第二次同命令全绿；按间歇稳定性风险保留记录。
- `npm --prefix custom/qgate test`：22 文件、237 用例通过。
- `npm run test:ide-smoke`：11/11，自检 10 通过、5 告警、0 失败。
- 鉴权活体：合法 200、无 token/坏 token 401、缺字段 400、错误密码 401 且无 token。
- `pnpm typecheck`：修复前 7 个错误；修复后必须归零。
- `pnpm test:engineering`：修复前 1027 通过、9 跳过、2 个收集失败；补齐构建并重跑后必须零收集错误、零失败。

最终还须完成：Python runtime pytest、swarm-yuan 全 sweep 与生成器门、Ycode CLI/CUA/构建、全量应用 build/bundle、依赖与秘密扫描、业务 API 持久效果及负面契约、跨角色/属主授权、真实浏览器导航/移动端/无障碍、并发/幂等/超时/恢复和最终全量复验。未实际执行的项目一律标为未验证，不写“覆盖”。

## 设计文档影响（DESIGN_SYNC 声明）

DESIGN_SYNC: none

理由：本批恢复既定导入契约、基线事实源与测试隔离，不新增产品架构或改变既定用户流程；补丁号、基线 commit 和测试数字分别由 `zcode-patches/series`、`vendor/VENDOR.md`、实际测试收据承载，不触及整合正本或数字总账。若后续发现需要改变产品行为或架构，先修订本声明并同批更新对应正本。
