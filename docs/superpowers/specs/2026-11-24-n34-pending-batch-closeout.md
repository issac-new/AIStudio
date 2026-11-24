# 2026-11-24 N34 挂账台账清偿：注入哨兵盲区、宿主命令信封基线字段与发布口径订正

> 状态：in-progress（2026-11-24；分支 fix/n34-pending-batch，基线 55c719f2e）
> 承接：`2026-11-24-zcode-400-pending-batch.md`（N34-1 至 N34-11）

## 变更

用户令「按建议完成，修复所有」：按上一轮交付说明里的四条建议执行，并把 N34 台账的待办逐条处理。本规格是这批工作的决策事实源；台账文件只保留状态与编号，机制细节以本规格为准。

### 1. N34-9 注入哨兵：从「通道有没有差异」改为「补丁改过的已跟踪文件还在不在」

现状。`scripts/platform/inject/lane-touch.mjs` 的 `noopSentinel` 在 `inject` 与 `ensure-injected` 判定「无事可做」之前，逐个通道看 `git status` 有没有输出。问题是 `git checkout -- vendor/` 与 `git reset --hard` 只还原已跟踪文件，补丁新增的未跟踪文件原样留下，三个通道都「有输出」，哨兵判为健康，树保持半还原。

实测排除的方案。逐补丁做 `git apply --check --reverse`（内容精确校验）在健康注入态下 512 条里有 213 条失败，因为补丁是链式的，后面的补丁会改动前面补丁碰过的同一文件；内容校验还会把开发者在注入态上尚未生成补丁的在途改动误判成「不在位」。所以判别只能落在路径级证据上：被 git 还原的已跟踪文件会从状态输出里彻底消失，而被后续补丁或人工继续改过的文件仍在输出里。

改法：

- `scripts/lib/zcode-patch-manifest.mjs` 增加 `trackedFilesFromPatch`，与既有的 `addedFilesFromPatch` 同一处解析补丁的已跟踪文件（前置镜像不是 `/dev/null` 的文件：修改、删除、重命名的源）。计划项（`planner.buildPlan`）随之多带一个 `trackedFiles` 字段。
- `noopSentinel(manifest, lanes, items)` 对每个声明为已应用的通道，取其补丁已跟踪文件的并集，逐个核对是否出现在该通道的 `git status --porcelain -z --untracked-files=all` 输出里：
  - 全部在位，该通道记「在位」；
  - 一个都不在，记「已还原」——不管新增文件是否还残留；
  - 介于两者之间，记「部分还原」；
  - 通道里没有任何已跟踪文件面的补丁（纯新增文件），退回用清单声明的新增文件是否存在来判；
  - `git status` 执行失败（非 git 树）或通道里连新增文件声明都没有，记「在位」——没有可观察证据时不阻断既有的空操作语义。
- 结论三态不变：各通道都在位为 `ok`；各通道都已还原为 `reverted`；其余为 `mixed`。
- `reverted` 的自愈多一步：重放之前先删掉清单声明的、仍留在磁盘上的新增文件（`sweepResidualAddedFiles`，与 v2 清理的「分树删除新增文件」同一删除面），否则重放会在「文件已存在」上失败。无残留时行为与原来逐字相同。
- `mixed` 的拒绝信息列出各通道状态与缺失的已跟踪文件（有上限），继续指引 `npm run clean && npm run inject`，不自动处理。

### 2. N34-1 宿主三类命令信封补基线字段

引擎在命令入口校验信封：需要比对基线的命令必须带 `baseRevision`，按行定位的命令另带 `baseLogEpoch`，`issuedAt` 必须是毫秒数。宿主的三处构造点都没带，引擎全部拒绝。

改法（取值方式在实现中修订过，以此为准）：

- 新增 `custom/server/zcode/cas-command.ts`：基线取自引擎只读查询 `conversationRowsRangeV4` 返回的 `atRevision` 与 `atLogEpoch`（服务端取值时的修订号与日志纪元，契约见纯净基线 `transport.ts` 的 `v4ConversationRowsRangeResultSchema`）。按需拉取，每次都是新值；不取自宿主会话投影——投影只消费完整帧、跳过分片帧，长会话的快照恰恰是分片的，且投影未必在看这个会话。
- `fetchControlBase` 取不到基线时抛 `ControlBaseUnavailableError`（引擎没有该会话、只读查询不可用或返回形状不符）。
- `sendCasCommand`：用基线构造信封发送；引擎回 `stale`/`proto.staleRevision` 时重取基线、用同一 `commandId` 重发（stale 的命令不入幂等表，重试安全），最多三次，之后如实回报。
- `/fork` 与 `/checkpoint/recover` 经 `sendCasCommand` 发送；取不到基线时回 409 `session_base_unavailable`，不发必被拒的信封。`checkpoint-options.ts` 的 `RecoveryTarget` 增 `baseRevision`/`baseLogEpoch`，`buildRecoveryEnvelopes` 让按行定位的信封携带。
- `switchCollaborationMode`（`permmodes/session-mode-controller.ts`）同样带 `baseRevision`，`issuedAt` 改为 `Date.now()`；取不到修订号时在 `liveSwitch` 里如实回报原因码，不发命令。
- 守门测试新增测试辅助 `custom/server/__tests__/helpers/engine-command-validator.ts`：以 esbuild 把引擎的 `parseCommandEnvelope` 连同依赖打成内存包（`@zcode/*` 按各包 `exports` 指向源码解析，不依赖 `vendor/zcode` 的依赖目录，干净工作树也能跑），用真函数断言宿主构造的信封通过校验。

### 3. N34-2 建会话要求工作区是已登记项目

宿主 `zcode:serve` 拉起的是独立形态引擎（`packages/server` 的 `entry-http`），上游让它以「远端宿主」身份持库：会话必须属于已登记项目，未登记工作区建会话即拒 `project.remote-project-required`（规则锚＝纯净基线 `remote-policy.ts` 的 `assertRemoteTaskDirectories` 与 `node.ts` 的 `createServerHostServices` 身份装配）。这条规则从 3.18.2 到 4.0 未变，但宿主此前没有登记步骤。

改法：

- `engine-bridge.ts` 增项目通道代理（`client.getChannel('project')`，契约＝`IProjectService`）与 `ensureEngineProject`：先在项目通道里按根目录找未删除的单根项目，找不到再新建。引擎自带的「按根目录复用或新建」入口（`reuseExistingRoot`）只对本机身份开放（独立形态会拒 `project.invalid-directory-open`），所以分两步。
- `projection-runtime.ts` 增 `withBridge`（取含项目通道的完整桥接）。
- 派单引擎端口（`engine-controller.ts` 的 `getMentionDispatch`）建会话前登记项目、把项目标识带给 `createSession`；同一工作区的并发登记在进程内合并成一次。

隔离引擎实测（宿主真实握手）：不带项目建会话被拒 → 登记后项目落在 `remote:server:<主机名>` 身份下、重复登记返回同一标识 → 带项目标识建会话越过项目关（停在未配模型的下一关）。

### 4. N34-8 回归测试的可用性探针

`kanban-title-edit.regression-1.test.ts` 用 `hermes --version` 探测命令是否可用，超时 10 秒；本机冷启动实测 11 秒，负载下会静默跳过整组用例。改法：超时放宽到冷启动耗时的数倍，并对「命令存在但超时」给出显式提示。

### 5. N34-10 发布标签记录订正（标签不挪动）

标签 `v1.0.20-overlay` 指向合并提交，合并提交与打包提交的树对象相同，内容一致。按裁决 A：标签维持现状；主规格第 8 项「指向打包提交」一句改为实际指向；发布清单的规则句补「以树对象相同为准」与「打标签时显式写出提交号」。

### 6. N34-11 ModelScope 发布口径对齐

以用户级规则与近四版实际做法为准：ModelScope 只更新 `swarm-yuan/` 目录（everything 离线包与单条 `SHA256SUMS-v<版本>.txt`，旧版本保留），整体源码包只在 GitHub Release 发布；`aistudio/` 目录保留 1.0.15 与 1.0.16 两版历史件，不再更新。`docs/DESIGN.md` §5.5、`RELEASE-MANIFEST.json` 的 `artifactDistribution`、`RELEASE-NOTES.md`「产物分发口径」节改为同一表述。

### 7. N34-6、N34-7、N34-4：文档刷新与三项补验

- N34-6：五份手册的头注快照基线、设计导读的行号锚点、两份 Windows 说明的当前版本表刷新到本批提交与当前载体值。
- N34-7：在主检出拉起一次引擎，确认端口监听与健康探测，然后停止。
- N34-4：用上游的项目引用构建方式（`tsc -b`）跑桌面包 `tsconfig.main.json`。**已跑通零错误**（此前报 470 条级联错误是因为只构建了 CLI 依赖闭包、官方依赖包 `dist/` 缺失；`tsc -b` 会先构建被引用包）。

### 8. N34-5、N34-3：不属修复，分别交裁决

- N34-5：真实 ZCode 库里的历史测试数据属用户真实数据。本批只做只读核对并给出可直接执行的清理方案（先备份），是否执行由用户明示。
- N34-3：差量对照是调研产出，逐条交用户裁决是否吸收，不在本批改代码。

### 任务卡

#### 完成条件

1. N34-9：负例（已跟踪改动被还原、新增文件残留，`git checkout -- .` 与 `git reset --hard` 两种触发）下 `inject` 与 `ensure-injected` 都不再空操作，重放后树恢复完整注入态；单通道内部分还原响亮拒绝；既有「全部通道还原」「健康空操作」用例不回归；在本批工作树上真实复现一次并自愈。
2. N34-1：`parseCommandEnvelope` 对宿主四类信封全部返回通过；缺基线时接口返回明确失败原因。
3. N34-2：有结论（受影响并修复，或不受影响并写明依据）。
4. N34-8：探针超时不再静默，全量测试里该用例不因探针超时被跳过。
5. N34-10、N34-11：四处表述一致，主规格句与事实相符。
6. N34-6、N34-7、N34-4：各有实测结果写回「验证」。
7. 回归矩阵合并档通过；台账各条状态回填。

#### 输入与来源

N34 台账各条的锚点与验收判据；本批开工时的实测（逐补丁反向校验 213/512 失败、`git status` 耗时、ModelScope 本地仓近六次提交的改动面）；纯净 4.0 树的协议契约 `command.ts`、`snapshot.ts`、`delta.ts`。

#### 工作流边界

只改本仓的 `scripts/`、`custom/`、`docs/` 与发布记录文件；不直接改 `vendor/` 下受跟踪文件；不碰宿主运行时与用户真实数据（N34-5 只读）。

#### 工具与副作用

`inject` 与 `ensure-injected` 的空操作判定多一次按文件的核对；判为已还原时多一步删除清单声明的残留新增文件。回归测试、类型检查、构建经回归矩阵执行。

#### 结果与证据

见「验证」。

#### 异常与恢复

哨兵改动可通过反向提交恢复；误删的残留新增文件是补丁产物，重放即重建。N34-5 的清理方案未执行前不产生任何副作用。

#### 验收反例

- N34-9：撤掉修复后，两个负例用例必须变红（空操作放行、树保持半还原）。
- N34-1：去掉任一基线字段后，守门用例必须变红。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | 哨兵按路径级已跟踪证据判别，不做内容精确校验 | 逐补丁反向校验在健康注入态下 213/512 失败（补丁链式叠加）；内容校验还会误伤注入态上的在途改动 | 逐补丁 `git apply --check --reverse`（否决：实测不可用）；整链一次性反向校验（否决：同样会在在途改动上误报，且每次测试前多跑数秒） |
| D2 | 判为「已还原」时自动删残留新增文件再重放，不改成只报错 | 残留文件是清单声明的补丁产物，删除面与 v2 清理完全相同；三个通道的已跟踪改动全部消失只能是外部还原，归属没有歧义 | 一律拒绝并指引手工清理（否决：测试前置步骤会在可自愈的状态上失败，使用者要手工跑两条命令才能继续） |
| D3 | 单通道内部分还原仍只拒绝、不自动处理 | 部分在位可能是开发者在重生成补丁的中途，自动清理会毁掉在途改动 | 自动清理（否决：与既有「混合态不自动处理」语义相反，且有数据丢失风险） |
| D4 | N34-1 的基线值由引擎只读查询提供，不由浏览器传入也不靠投影帧 | 修订号与日志纪元是服务端会话状态；只读查询 `conversationRowsRangeV4` 每次取新值，不依赖投影是否在看该会话、不受分片帧跳过影响；投影方案在实现中被否（宿主投影只消费完整帧、跳过分片帧，长会话快照恰是分片的，会拿不到基线） | 浏览器随请求带上（否决：可被伪造）／投影从快照与增量帧记基线（否决：分片帧被跳过、拿不到；且投影未必订阅该会话） |
| D5 | 投影里没有该会话基线时接口明确失败，不发必被拒绝的信封 | 引擎对缺基线的信封固定拒绝；提前失败能把原因说清 | 照旧发送（否决：用户只看到「被拒绝」，原因丢失） |
| D6 | N34-10 取裁决 A：标签不挪动 | 内容与发布包一致（树对象相同）；强制更新已发布的标签难以回退 | 挪回打包提交（否决：对外产物的强制更新，收益只是满足规则字面） |
| D7 | N34-11 以用户级规则与近四版实际做法为准 | v1.0.17 至 v1.0.20 四版都只更新 `swarm-yuan/` 目录，设计文档与清单的表述停在 1.0.16 的做法 | 把整体源码包补传到 ModelScope（否决：用户级规则明确只传 everything 档） |
| D8 | N34-5 不在本批执行清理 | 属用户真实数据，台账验收判据写明由用户裁决；删除难以撤回 | 直接清理（否决：没有用户明示） |

## 验证

开工前的实测（2026-11-24，本批工作树，健康注入态）：

- **逐补丁反向校验不可用作判别**：对清单声明的 512 条已应用补丁逐条执行 `git apply --check --reverse`，通过 299 条、失败 213 条，总耗时 6392 毫秒；失败的都是被后续补丁改动过同一文件的链式补丁（如 `008`、`010` 至 `017`、`022` 至 `035`）。
- **状态查询耗时**：`vendor/hermes-agent` 下 `git status --porcelain` 307 毫秒、185 行。
- **ModelScope 现状**：本地仓最近六次提交里，`32cfc75`（v1.0.16）及之前同时含 `aistudio/` 整体源码包与 `swarm-yuan/` 离线包；`9edfede`（v1.0.17）至 `37eca12`（v1.0.20）四次只含 `swarm-yuan/` 下两件。`aistudio/` 目录现存 1.0.15、1.0.16 两版整体包与一条校验文件。

各条的修复验证在收口时按条回填。

### 各条修复的验证（2026-11-24，本批工作树）

**N34-9 注入哨兵**

- 守门 `scripts/__tests__/inject-noop-guard.test.ts` 16 例全绿（既有「全部通道还原」「混合态拒绝」「健康空操作」不回归；新增「`git checkout -- .` 不清理」「`git reset --hard` 两种事故形态」「单文件还原响亮拒绝」）。
- 注入相关 9 个测试面合跑 73 例全绿（planner/executor/manifest/clean-v2/absent-tree/check/sfcfs/patch-manifest/noop-guard）。
- 三处关键判别逻辑各有变异探针用例拦住（剥前缀不去换行／去掉「通道另有已跟踪改动」判据／中性证据当作缺失），探针后已还原修复版。
- 真实工作树三形态验证：健康态判空操作且不做任何删除；事故形态（`git checkout -- vendor/`、新增文件残留）判「已还原」，清 117 个残留新增文件后全量重放恢复（`connectionsExtras`=5、`docs:check` 路由 129、清单 complete）；单文件还原判「部分还原」响亮拒绝、指引 `clean && inject` 可执行恢复。
- 机制预算已登记（四类别零增量，`governance-lint --budget` 零问题）。
- 实现过程中的事故如实记录：首版判别在真实工作树上误判健康态为「已还原」、清掉了 117 个补丁新增文件。根因＝取通道目录前缀时没去结尾换行，路径全部对不上；且判别把「只以未跟踪形态出现的补丁文件」误当作在位证据（补丁链上「前面补丁新建、后面补丁又修改」的文件，还原后仍以 `??` 出现在状态里）。修复＝剥前缀去换行＋状态位分组（已跟踪改动才算在位证据，只以未跟踪形态出现的记中性不参与判定）＋「通道里另有已跟踪改动时绝不判已还原」这道判据。工作树经清理重放恢复，无人工改动丢失。

**N34-1 比对基线字段**

- 相关 6 个测试面合跑 74 例全绿；服务端类型检查通过。
- 守门：信封经引擎真校验函数 `parseCommandEnvelope` 断言通过（测试辅助以 esbuild 把校验函数连同依赖打成内存包）；四项变异探针（分叉去 `baseLogEpoch`／模式切换去 `baseRevision`／时间戳改回 ISO／检查点仅代码档去基线）各有用例拦住。
- 未验证项如实披露：在配置了模型的真实引擎上拿到 `accepted` 未验（独立引擎只接受配了供应商的数据目录；本机真实库为桌面版所有、不能动）。引擎侧行为已用纯函数与隔离引擎的部分路径覆盖。

**N34-2 建会话前登记项目**

- 隔离引擎实测（宿主真实握手，隔离数据目录与一次性密钥）：不带项目建会话被拒 `project.remote-project-required` → `ensureEngineProject` 登记后项目落在 `remote:server:<主机名>` 身份下、重复登记返回同一标识（幂等）→ 带项目标识建会话越过项目关（隔离实例未配模型，停在「没有可用的模型供应商」属预期）。
- 单测＋接口守门：`zcode-engine-bridge.test.ts`/`zcode-engine-controller.test.ts`/`zcode-mention-dispatch.test.ts` 相关用例全绿。
- 顺带发现：独立引擎在「建会话因缺模型被拒」后不再应答新连接的握手（复现三次，重启后约一分多钟才恢复）。未在本批定谳，登记为新挂账 N34-14。

**N34-8 看板真 CLI 回归探针**

- 三种情形验证：hermes 在场＋锁空闲 → 2 例通过（真 CLI 用例 12 秒）；`HERMES_BIN` 指向非零退出命令 → 显式失败；指向不存在路径 → 1 通过 1 跳过。
- 本机复跑真实 CLI 用例时抓到宿主 `install.lock` 被另一会话的 `hermes update` 持锁 10 秒、真实 CLI 抛错——这是环境外部因，如实记录：真实 CLI 用例在当前宿主状态下会红，待锁释放后复跑。

**N34-4 桌面包类型检查**：`tsc -b tsconfig.main.json` 零错误退出（`vendor/zcode/packages/desktop`）。

**N34-5 历史测试数据（只读核对，未清理）**：`verify-import-` 标记任务实有 24 条（`import-claudeCode-<hash>`，标题前缀 `[imported:claudeCode] verify-import-20260929…`，全部 completed、未删未归档，创建于 2026-09-29 至 10-19，工作区＝`/Users/cuishi/lab/AIStudio`，与推演工作区零交叠）；`QA isolated import` 项目 1 个（已软删 deleted=1，关联任务数 0，根目录指向已不存在的 `/tmp/aistudio-qa-…`）。清理方案：先备份 `~/.zcode/v2/tasks-index.sqlite` 再删除这 24 条任务行与该项目及其根目录行；执行与否待用户明示。

**新发现（并入本批处理）**

- **派单台账测试污染**：真实 `~/.hermes-web-ui/overlay/dispatch-ledger.jsonl` 3485 行里 3034 行是测试写入的 `/w/anywhere`。已修（全局测试设置未指定台账路径时落一次性临时文件＋守门用例），修复后真实台账行数不再随测试增长。真实台账里既有的 3034 行测试数据清理与否待用户裁决。
- **引擎服务端构建产物陈旧**：`zcode-engine.mjs ensure` 此前只看产物在不在——4.0 换血后主检出的服务端产物仍停在 11-11 的 3.18.0 构建。已补构建指纹判定（`vendor/zcode` 在 HEAD 的树对象＋`zcode-patches/` 逐文件内容）与守门测试，主检出产物已重建为 22:30 的新构建（旧件备份 `/tmp/z400-scripts/entry-http.js.bak-20261124`）；合并后由新脚本补戳记。


## 设计文档影响

DESIGN_SYNC: touched。

- `docs/DESIGN.md` §5.5「发布与版本」：ModelScope 分发口径改为与用户级规则一致（只更新 `swarm-yuan/` 目录，整体源码包只在 GitHub Release 发布）。
- `docs/DESIGN.md` §5.4（zcode 4.0.0 段）：补「引擎服务端以独立宿主身份持库、会话须属已登记项目」一句（N34-2 根因的对外表述）——随收口提交一并修订。
