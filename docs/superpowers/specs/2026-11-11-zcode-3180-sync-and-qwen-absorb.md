# zcode 基线同步 a9fe401e → b95ebaff（v3.18.0）＋ Qwen Code 1.0 吸收轮

日期：2026-11-11
状态：implemented
触发：用户指令「ZCode 升级至 3.18.0，Qwen coder 也升级了（Qwen Code 1.0 正式发布：Qoder 与 Qwen Code Harness 融合开源），调研并消化吸收优势，完善 Ycode」。上游 main 单提交 `b95ebaff`（chore: sync ZCode source v3.18.0，5099 文件 +429348/−44745，包版本 3.17.2→3.18.0）；同步口径=跟 main 不看 tag（2026-10-25 用户裁定）。

## 变更

1. **基线整树替换**：`vendor/zcode` pristine @a9fe401e → @b95ebaff（upstream/zcode 缓存树同批 checkout 新基线保持 pristine；vendor/zcode 无 node_modules/构建产物入库，双锁上游原样）。
2. **活跃补丁重放**（9 条，按冲突预测三档处置，见「验证」节实记）：
   - 预测直放：003/005/007/008/009（`packages/zcode-cua/*` 全部与 `adapters/src/skills/roots.ts` 上游零变化）＋004（`node-repl-host/src/server.ts` 上游仅 ±1 行）；
   - 重生成：002（`zcodeAgentService.ts` 上游 +465/−14、`validation.ts` +91/−6、`transport.ts` +34/−3）、006（`official-plugin-definitions.ts` +68/−16、`bootstrap/tests/plugins.test.ts` +383/−158、`plugin-marketplaces.ts` +1/−4）、010（`desktop/src/main/index.ts` +142/−43）；
   - 上游吸收排查定谳：3.18.0 全树 `importSession` 零命中（002 保留）；desktop main diff 无 open-file/目录打开处理（010 保留）。
3. **新增补丁 011（Qwen Code 1.0 吸收项）**：MCP 工具 `inputSchema` 参数名消毒＋调用回译。吸收自 Qwen Code `packages/core/src/mcp/mcp-schema-sanitizer.ts`（Apache-2.0，Google LLC + Qwen Team 版权）；落点=`apps/zcode-cli/packages/core/src/mcp/`（新模块 `schema-sanitizer.ts` ＋ `createMcpToolEntry` 两个插桩位），不改 contracts/adapters。
4. **伴生台账**：`vendor/VENDOR.md` zcode 行＋同步注记、`zcode-patches/series` 头部基线注记、`RELEASE-MANIFEST.json` ycode 模块（version 3.18.0/baselineCommit b95ebaff/activePatchCount 9→10/notes）、设计总账 §C、组件台账、附录 A 登记。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | Qwen Code 1.0 逐项对照后**只吸收一项**（MCP 参数名消毒） | 源码级差距核对定谳：zcode 3.18.0 失败分类 18 类＞Qwen 8 类（contracts/src/model/index.ts L103-157 vs events.ts:36-46）；上下文超限恢复三级阶梯（microcompact→auto→reactive，`core/src/compact/`）+两层熔断＞Qwen 两级；流恢复预算 10 次（`streaming-recovery.ts:14`）＞Qwen 2 次；MCP 连接进程级池化已有（`adapters/src/mcp/pool.ts:58`）；取消收尾/ALS 上下文等价。唯一确凿差距=MCP inputSchema properties key 原样透传（`adapters/src/mcp/descriptor.ts:58-70` 只消毒工具名不消毒参数名） | 全面改造为事件总线架构（否决：zcode turn-loop+abort-scope 血统不同，补丁级改造风险与收益不成比例；3.18.0 `subagent/background-stall.ts` 已是同向自家演进） | 是 |
| D2 | 011 消毒位选模型面投影层（`createMcpToolEntry`）而非 descriptor 层 | descriptor 保留原始 schema（UI/调试/回放语义不变），消毒只发生在模型可见面；回译在 handler `toMcpRuntimeArguments` 后闭包内完成，校验（call-runner 对 entry.inputSchema）与模型面自动一致 | 消毒进 descriptor/adapters（否决：污染所有消费面，需动 contracts 类型） | 是 |
| D3 | daemon/AppServer/沙箱池化不吸收 | Qwen 开源面本身空心：`packages/cli/src/sdk/sdkServer.ts:24-26` `run()` 抛 `FatalInputError('SDK daemon mode is not supported by this build')`，服务端本体在 Qoder 产品侧闭源，无可搬运实现；沙箱池化在开源仓无对应代码 | 自研 daemon 层（否决：无参考实现，纯自研超本轮范围） | 是 |
| D4 | Ycode 模块版本随基线升 3.18.0 | release:check 对 ycode 走 `vendor/zcode/package.json` 真源（versionCarrier）；基线已升则模块须同拍（3171 轮 D3 先例） | 保持 3.17.2（否决：对账必红） | 是 |
| D5 | 3.18.0 结构性新能力（session-control 12 工具/插件 extension host+plugin-api 1.4.0/git worktree 隔离/设计模式/登录分区+凭据 v2/子代理失速治理）零成本随基线获得，不做二次开发 | 这些是上游自带能力，fork 语义（CUA 默认开/skills 兼容根/open-file/importSession RPC）全部保留；其中 `ReadSessionContext` 工具被上游删除属上游产品决策，AIStudio 侧无依赖（导入写入走 002 的 importSessionV4 RPC，不受影响） | 为 session-control 等新面追加 fork 定制（否决：无用户需求面，先观察） | 是 |
| D6 | vendor/zcode 提交形态对齐立法：**纯 pristine**（zcode-cua 等补丁产物转不入库，与 hermes 树同约定） | 仓库法=「git 跟踪 pristine 基线」；zcode-cua 补丁产物入库是 796257354 批量补录事件的历史形态，且构成潜伏缺陷——release 包取材面=git archive HEAD，含补丁产物则「解包后 zcode-patches 依序 git apply」遇已存在文件必炸（003/011 全是新建文件补丁）。转纯 pristine 后 fresh-clone `npm run inject` 全量重放实测通过（此前 zcode-cua 入库形态下必撞 already-exists） | 维持 zcode-cua 入库（否决：违反单一立法＋源码包安装链损坏）；worktree 内手工剔除（否决：git rm 整树替换天然达成，无需额外动作） | 是 |

背景调研档案：ZCode 3.18.0 主题=①跨会话控制一等能力（`packages/session-control` 纯核心库+12 PascalCase 工具，模型只见 sessionId）②插件系统升级扩展进程（utilityProcess 直连 Window Host，能力表授权，`@zcode-dev/plugin-api@1.4.0` types-only）③原生 git worktree 隔离（worktree=会话 cwd 不新建 workspace）④登录/凭据大改（分区登录 zai_cn、keyring+enc:v2、CAS 原子提交）⑤core 重构（session-fork-commit 模块化、子代理后台失速检测 15min 首警+指数加倍+出队再校验、context 组成分类器）。Qwen Code 1.0 主题=事件驱动 harness（三 handler 分权+settled 幂等+roundId 迟到事件丢弃）、wire 协议纯类型单源、MCP 三层治理（进程级连接池+fail-closed gate+schema sanitizer）、ThreadManager 会话承接层。

## 验证

- 基线替换：`vendor/zcode/package.json` version=3.18.0；archive 文件数=git 索引数（18657/18657，无 .gitignore 误伤）；upstream/zcode 缓存树 checkout b95ebaff pristine。
- 净基线重放（/tmp 再生成树实测）：10/10 全 APPLIED 零 threeway——003/004/005/007/008/009/010 直放（010 上游 +142 未触插入锚，优于预测）；002/006 手工锚移植后重生成（002=zcodeAgentService import 锚前插 contextCompositionClient 致漂、006=official-plugin-definitions 前插 design 条目＋marketplaces 尾注并句 visualize）。
- 注入管线：worktree `node scripts/inject.mjs` rc=0、zcode 10 条全 applied；二次执行幂等（manifest 跳过、status=complete）。
- **pristine 真管线守门（L2 测试 `overlay-pristine-replay`）**：临时 worktree 自 HEAD 全量 clean+inject 达 manifest complete、三 lane 全 applied——首跑红、修复后绿，事故实录：判定 006 失败的存量排查（bootstrap 两失败 stash 对照）时用了 `git stash push -- <4文件>`+默认 pop，**不带 --index 的 pop 不恢复暂存态**，导致那批文件 index 回退到旧 HEAD（3.17.2）内容随首次提交入库；pristine 守门当场拦截，全树 oid 审计（HEAD ls-tree vs b95ebaff ls-tree）定损=恰 3 文件（official-plugin-definitions/plugins.test/plugin-marketplaces；officialPluginCache 两基线同内容幸免），`update-index --cacheinfo` 直填 upstream blob 修复后 amend；终态审计=仅 gradlew.bat 一处 CRLF 规范化差（仓库 autocrlf=input 既有约定，与旧基线形态一致）。教训=对已暂存的基线做 stash 对照必须 `pop --index`，且 **VENDOR_SYNC 提交前必须跑全树 oid 对账**（本批守门测试兜住了，流程上补为显式步骤）。
- 011 单测：`core/tests/mcp-schema-sanitizer.test.ts` 9/9 过（违规名改写/碰撞消歧/ghost required 剪除/超长截断/回译往返/entry 接线两例/descriptor 原始 schema 不动）。
- 类型面：`core` 包 `tsc --noEmit` 0 错（011 插桩类型正确）。
- 引擎构建：`node scripts/zcode-engine.mjs ensure` rc=0（pnpm install＋packages/server tsup＋build:remote 全绿）。
- 冒烟：importSessionV4 RPC 在构建产物 entry-http.js 命中；skills 三根（.zcode/.agents/.claude）在注入态 roots.ts；CUA broker.js/node-backend.js `node --check` 过；011 schema-sanitizer.js 进 core dist 且被 dist/mcp/index.js 引用。
- bootstrap `plugins.test.ts`：56 例 54 过，2 失败（documents 发现缺席两例）**pristine 同败定谳=上游 3.18.0 存量测试债**（stash 四文件回 pristine 复跑同败，与本批补丁无关）；006 翻转测试「computer-use 默认启用」过。
- 台账对账：`npm run release:check` ycode=3.18.0 对账（见提交描述实记）。

## 设计文档影响

DESIGN_SYNC: touched

- `vendor/VENDOR.md`：zcode 行 `b95ebaff`/包版本 3.18.0＋同步注记（2026-11-11 升级批）。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：§C zcode 基线谱系行与 Ycode 模块核实值 3.18.0。
- `RELEASE-MANIFEST.json`：ycode 模块 version/baselineCommit/activePatchCount/notes。
- `zcode-patches/series`：头部基线注记＋011 登记。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记。
- `team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`：§八变更日志补行（如组件台账对账需要）。
