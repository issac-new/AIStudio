# 2026-11-22 全功能、非功能与安全回归修复批

> 状态：in_progress
> 基线：941a9f4674d5474c619cabafec121ecd8cdca74e（origin/main）

## 变更

本轮在独立 worktree 对 AIStudio 全产品面执行功能、非功能和安全回归，覆盖根 Node/Vue/Koa、Python runtime、simharness、swarm-yuan、Ycode、隔离前后端服务与真实浏览器。证据保存在 `.gstack/qa-reports/run-20261122T133641Z/`；最终报告逐项区分通过、失败、跳过、阻塞和未执行，不用单测全绿替代活体与整体验收。

已确认并纳入修复的首批问题：

1. **Ycode 补丁 002 类型与真实会话契约断裂**：`pnpm typecheck` 复现 7 个错误。`migrationSource` 在 `validation.ts` 已扩为 `claudeCode/codex/kimi`，但 `zcode-task-types-core.ts`、`task-realtime-core.ts` 与 `importedHistory` schema 仍只认 `claudeCode`；`importSessionV4` 未登记 `IZCodeAgentService`；实现还调用当前基线已不存在的 `persistImportedClaudeTask`。修复遵循当前 Claude 原生导入链：共享枚举单一事实源、接口与实现同步、真实 `createSession(importedHistory)` 与任务索引/快照各自承担既有职责。真实引擎又确认 standalone-server 需要可选 `projectId`，且历史导入不得要求模型供应商，因此导入使用只读客户端，普通新会话模型门禁保持不变。最终 `listSessions` 回读证明真实会话而非仅文件或索引落盘。
2. **Ycode 基线元数据漂移**：`vendor/VENDOR.md` 与 `vendor/zcode/package.json` 已是 `fec97590 / 3.18.2`，`zcode-patches/series` 头部和 `RELEASE-MANIFEST.json.baselineCommit` 仍停在 `b95ebaff / 3.18.0`。修订残留元数据，并给发布检查增加跨文件一致性守门，防止只改一处再次漏检。
3. **Ycode 真引擎集成测试隔离不足**：`zcode-import-session-int.test.ts` 固定连接 3030 且写入硬编码历史工作区。修复为显式环境变量指定引擎地址和隔离工作区；默认仍 skip，只有测试者明确提供隔离引擎与工作区才执行写探针。夹具统一 `HOME/ZCODE_DATA_BASE_DIR/ZCODE_SERVER_ID` 及 remote storage host 编码，避免写错宿主。
4. **测试前置构建缺口**：工程测试中 `@zcode/e2e-report` 与 `@zcode/contracts` 两个收集失败先通过真实依赖构建补齐，再原命令复跑；不把收集失败误记为产品失败，也不为消红删除测试。
5. **swarm-yuan 生成源与产物漂移**：`test-registry.sh` 稳定复现 `gates-warn.sh 过期`。上一轮给依赖扫描加 `/vendor/` 排除时只改了生成产物 `assets/gates-warn.sh`，未同步域源 `assets/gates/process/deps.sh`，导致生成器会把修复洗掉。把排除规则回移域源并重生成，保留既有 `test-registry` 红灯作为回归门。
6. **Python 数字、协程与 Python 3.14 兼容性**：当前拼合树实测为 273 通过，不是旧 spec 的 249；授权修订旧验证数字。两条 `gateway/run_busy.py` 协程未等待警告定位为测试桩丢弃 coroutine，新增 `recwarn` 断言先红后，夹具改为关闭 coroutine。`plugins_manifest.py` 的 `re.split` 位置参数弃用警告由补丁 815 改为 `maxsplit=1`，并携带零警告回归。最终 runtime＋插件版本门 306 通过、零警告。

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

### 回归测试记录（value cards）

- ISSUE-001（多源导入）：`packages/shared/test/taskMigrationSource.regression-1.test.ts`。Value: protects=三种来源同时通过 task/realtime/importedHistory 校验且非法来源仍拒绝; fails_when=任一 schema 回退单来源; why_new=原工程清单没有 shared schema 测试; seam=none; no_claim=真实 provider 网络调用（不需要也不执行）。修复前 codex/kimi 共 4 个断言红，修复后 7/7；真实引擎导入并由 `listSessions` 回读 3 行。
- ISSUE-002（发布元数据）：`scripts/__tests__/verify-release-manifest.test.ts` 的 ycode 基线用例。Value: protects=series/vendor/manifest 指向同一源码钉版; fails_when=任一文件残留旧 commit; why_new=旧用例只查 manifest 能在 series 找到旧值; seam=none; no_claim=上游源码内容真实性（由 vendor 台账和构建另证）。修复前 `b95ebaff ≠ fec97590` 红，修复后该用例及发布文件 17/17、`release:check` 全绿。
- ISSUE-005（生成源漂移）：`skills/swarm-yuan/tests/test-registry.sh`。Value: protects=重生成不会洗掉 vendor 排除; fails_when=域源与 gates-warn 不一致; why_new=上一轮只改生成产物; seam=none; no_claim=全部 fixture 已跑（由 sweep 另证）。修复前 12 ok/1 fail，修复后 13 ok/0 fail。
- ISSUE-006（协程夹具）：`runtime/tests/gateway/test_capacity_retry_anchor.py` 两条 `recwarn` 断言。Value: protects=create_task 桩不遗留未等待协程; fails_when=桩只返回 completed 而不关闭 coroutine; why_new=原测试只测队列逻辑不看资源回收; seam=none; no_claim=生产后台任务无其他泄漏。修复前 2 失败，修复后目标 5/5。
- ISSUE-007（Python 3.14）：补丁 815 内 `test_version_parsing_has_no_python314_deprecation_warning`。Value: protects=版本比较行为不变且无弃用警告; fails_when=re.split 恢复位置 maxsplit; why_new=全量 pytest 有警告无断言; seam=none; no_claim=全部 Python 上游文件无弃用（仅覆盖本调用）。修复前 1 失败/17 警告，修复后 runtime＋版本门 306/306、零警告。

最终还须完成：Python runtime pytest、swarm-yuan 全 sweep 与生成器门、Ycode CLI/CUA/构建、全量应用 build/bundle、依赖与秘密扫描、业务 API 持久效果及负面契约、跨角色/属主授权、真实浏览器导航/移动端/无障碍、并发/幂等/超时/恢复和最终全量复验。未实际执行的项目一律标为未验证，不写“覆盖”。

## 设计文档影响（DESIGN_SYNC 声明）

DESIGN_SYNC: none

理由：本批恢复既定导入契约、基线事实源与测试隔离，不新增产品架构或改变既定用户流程；补丁号、基线 commit 和测试数字分别由 `zcode-patches/series`、`vendor/VENDOR.md`、实际测试收据承载，不触及整合正本或数字总账。若后续发现需要改变产品行为或架构，先修订本声明并同批更新对应正本。
