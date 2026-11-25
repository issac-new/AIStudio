# 2026-11-24 ZCode 4.0.0 升级与 v1.0.20 发版挂账台账

口径：按挂账台账化约定（2026-11-03 用户令），未做项收敛为编号台账，每条给锚点、根因层、验收判据、状态。本台账承接 `2026-11-23-zcode-400-upgrade-release.md`（升级发版批）之后真正剩下的面，编号续 N33 序列。

## 待办

### N34-1 宿主三类命令信封被引擎校验拒绝（存量缺陷，P1 候选）
- 锚点：宿主构造点 `custom/server/zcode/engine-controller.ts:317-324`（`/fork` 的 `forkAssistant`）、`custom/server/zcode/checkpoint-options.ts:37-62`（检查点恢复的 `editUserQuery` 与 `applyFileRewind`）、`custom/server/permmodes/session-mode-controller.ts:71-80`（`switchCollaborationMode`，第 79 行 `issuedAt` 传 ISO 字符串）。引擎侧规则在纯净 4.0 树 `vendor/zcode/packages/shared/src/zcode-protocol-v4/command.ts:406-432`（两份命令名单）与 `:455-480`（`parseCommandEnvelope`），时间戳类型在 `…/zcode-protocol-v4/core.ts:20`（`timestampSchema = z.number()`）。
- 根因层：引擎命令入口（`apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/command-inbox.ts:175`）对每条信封做校验：名单内的命令缺 `baseRevision` 即拒，按行定位的命令缺 `baseLogEpoch` 即拒，`issuedAt` 必须是毫秒数。宿主这三类信封都没带基线字段，模式切换的时间戳类型也不对。两份名单与校验函数在 `fec97590` 与 `a4b44451` 之间逐行相同，所以这是存量缺陷，不是本次升级带来的回归。
- 实测：用 4.0 的 `parseCommandEnvelope` 直接校验宿主当前形态——`forkAssistant`、`editUserQuery`、`applyFileRewind` 均 `REJECT baseRevision:custom`；`switchCollaborationMode` 字符串时间戳 `REJECT issuedAt:invalid_type`、不带 `baseRevision` `REJECT baseRevision:custom`；补齐字段后四者均 `OK`；提及派发用的 `sendText` `OK`。经真实通道复现未做成：命令通道在信封校验之前先检查模型可用性，隔离引擎没有配置模型，全部返回「当前没有可用的模型供应商和模型」。
- 验收判据：①宿主为这四类命令补齐 `baseRevision`（按行定位的另补 `baseLogEpoch`），取值来自宿主已订阅的会话控制快照；`issuedAt` 改为毫秒数。②新增守门测试，直接用 `parseCommandEnvelope` 断言宿主构造的信封通过。③在配置了模型的真实引擎上，分叉、检查点恢复、模式切换各实测一例拿到 `accepted`。
- 状态：**已修复（2026-11-24 N34 清偿批，提交 61498e6af）**——信封经引擎 `parseCommandEnvelope` 真函数守门通过。**补验证完成（2026-11-25 批二，提交 02958a4）**——隔离引擎＋模拟供应商实测：`switchCollaborationMode` accepted×2、`forkAssistant` accepted（返回子会话）、`editUserQuery`（仅对话）accepted；宿主真实路由处理器 `/fork` accepted、检查点仅对话 ok（仅代码在全新会话回 `guard.actionUnavailable`，引擎正确拒无可回退文件）；旧信封（ISO 时间戳、缺基线）被拒。

### N34-2 独立引擎建会话要求工作区是已登记项目（待确认是否影响真实流程）
- 锚点：纯净 4.0 树 `vendor/zcode/packages/services/src/project-storage/remote-policy.ts:19-30`（`assertRemoteTaskDirectories`），调用点 `…/project-storage/project-repository.ts:143,503,697`；宿主调用点 `custom/server/zcode/mention-dispatch.ts:470`。
- 根因层：请求归属主机不是 `local` 时，工作区必须是该主机标识下已登记的项目，否则抛 `project.remote-project-required`。独立引擎默认用主机名作标识，而本机真实库里 19 个项目的归属主机全是 `local`。该函数与三个调用点在新旧基线间没有变化。2026-11-22 的回归批已经为「导入会话」通道处理过同一要求（补丁 002 让 `importSessionV4` 接受 `projectId`，规格 `2026-11-22-full-regression-security-nfr.md`）；「建会话」通道的宿主参数里没有项目 id，未见对应处理。
- 实测：隔离引擎上对未登记的工作区调用 `createSession`，得到 `project.remote-project-required`；登记项目后越过了这一关。
- 存疑：宿主真实流程里提及派发是否受影响，只读代码定不了，需要在配置了模型的真实环境里，对一个没在 ZCode 桌面版打开过的工作区实测。
- 验收判据：完成上述实测并记录结果；若失败，补项目登记步骤，或确认引擎启动标识口径并在运维参考写明。
- 状态：**已修复（2026-11-24 N34 清偿批，提交 61498e6af）**——宿主真实握手实测复现，补项目登记步骤后越过。**第二步定谳并修复（2026-11-25 批二，提交 02958a4，主规格 `2026-11-25-n34-pending-batch-2.md`）**：隔离引擎整链实测抓到两个缺陷并修——①登记路径做 realpath 改写后与建会话的原始路径在引擎逐字校验（`project.cwd-not-in-roots`）下对不上，改为逐字沿用调用方路径；②旧 RPC `createSession` 建出的会话发文本稳定 FK 失败，建会话改走 4.0 的 v4 建会话命令（`createEngineSession`）。另修同源发现 clientMismatch：三入口信封 clientId 归一到桥接持久化标识。

### N34-3 3.19.x 与 4.0 新特性对本仓的功能级逐项对照
- 锚点：主规格「变更」第 8 条（明确不做）；`vendor/VENDOR.md` 的 2026-11-23 同步批两段。
- 根因层：3.19.x 从未发布源码，本次差量 2209 个文件同时含两版变更，本批只保证既有功能与补丁在新基线上成立，没有评估上游新增了哪些本仓可以吸收的能力。
- 验收判据：产出对照表（特性、对本仓的影响、是否吸收、依据），逐条交用户裁决。
- 状态：**对照已产出（2026-11-25 批二）**——聚焦版报告落盘 `/Volumes/nvme2230/lab/research/zcode-4000-delta-assessment-20261125/report.md`：契约面稳定（命令类型 39→39、服务通道 46→46、引擎服务方法 139→141 仅新增两个、本仓直接调用的方法实现零改动）；13 条补丁全部仍必要；四项可吸收能力（预装文档工具＋离线适配、工作区插件信任通道、设计插件、上下文微压缩）吸收与否待用户裁决。（订正：本条状态在 2026-11-24 批曾被误填为 N34-4 的 `tsc -b` 结果，随本批改正。）

### N34-4 补丁 010 所在桌面包的整体类型检查未跑成
- 锚点：主规格「验证」段的未验证项；`vendor/zcode/packages/desktop/tsconfig.main.json`。
- 根因层：桌面包的类型产物依赖 `tsc -b` 项目引用构建，`packages/shared`、`packages/services` 没有 `build` 脚本；只构建依赖闭包后 `tsc -p tsconfig.main.json --noEmit` 仍报 470 条 TS6305 级联错误。该包不在本 fork 的构建产物面。
- 验收判据：用上游的项目引用构建方式跑通后 `tsconfig.main.json` 零错；或由用户裁决该包不在 fork 产物面、予以豁免并记档。
- 状态：**已跑通（2026-11-24 N34 清偿批）**——`tsc -b tsconfig.main.json` 零错误。

### N34-5 真实 ZCode 数据库里的历史测试数据
- 锚点：`~/.zcode/v2/tasks-index.sqlite`——25 条带 `verify-import-` 标记的任务与 1 个名为 `QA isolated import` 的项目，创建于 2026-09-28 至 10-19。
- 根因层：本仓的会话导入集成测试在 2026-10-19 加显式开关之前，固定连共享引擎并直接写入真实数据。
- 验收判据：由用户裁决是否清理；清理须先备份该库。
- 状态：**已清理（2026-11-25 批二，用户令「完成未做及挂账」）**——按「先备份、副本演练、再执行」流程：49M 一致性快照备份到 `/Volumes/nvme2230/lab/archive/aistudio-n34-cleanup-20261125/`；副本演练通过后对真实库执行，任务行 2032→2007，25 个孤儿会话文件归档后移除，`integrity_check ok`。（只读核对时记的 24 条为不含 QA 项目自身任务行的口径，执行时以 25 条任务＋项目及其根目录行全清为准。）

### N34-6 手册里的快照基线提交、行号锚点与 Windows 说明版本表陈旧
- 锚点：`docs/manuals/aistudio-design-document-guide.md:5`、`docs/manuals/aistudio-feature-inventory.md:5`、`docs/manuals/aistudio-operations-reference.md:5`、`docs/manuals/aistudio-design-document-index.md:4` 仍写快照基线 `3690ceba3`；设计导读引用的 `RELEASE-NOTES.md:55`、`RELEASE-MANIFEST.json:18,…` 等行号已随多次改写漂移；`docs/windows-x64-setup.md:5-12,81`（整体 1.0.18-overlay、agent teams v0.23.0-team.2、底座 0.23.0、yuan v2.100.1、Ycode 3.17.2）与 `scripts/offline-template/install/README-windows.md:3,28,31`（1.0.15-overlay、v0.23.1-team.2 等）的当前版本表停在几版之前。
- 根因层：这些头注与版本表只在特定批次手工刷新，没有守门；本批在发版说明顶部新增条目后行号又移了一次。两份 Windows 说明的陈旧由独立审查发现（往期发版遗漏，相关测试只断言文件非空）。
- 验收判据：下次文档批统一刷新为当前提交与当前载体值（Windows 说明里技能数量等需要重新核实的数字一并核对），并把行号锚点改为节标题锚或补一道锚点守门。
- 状态：**已修复（2026-11-24 N34 清偿批，提交 7a9f9259f）**——四份手册头注、导读行号锚改节名锚、两份 Windows 说明版本表刷新为当前载体值。

### N34-7 真实环境下宿主引擎拉起未实测
- 锚点：主规格「验证」第 4 项；`docs/manuals/aistudio-operations-reference.md` 3.4 节。
- 根因层：验证时 IDE 正占用真实数据目录，不能对它启动第二个引擎。已有依据是钥匙串条目存在（只读查询）与账户名按路径哈希匹配的源码逻辑。
- 验收判据：合并后在主检出拉起一次 `zcode:serve`，确认端口监听、健康探测通过，然后停止并回填。
- 状态：**已实测（2026-11-24 N34 清偿批）**——真实主目录（HOME＋`~/.zcode` 数据、走系统钥匙串）下，引擎服务 5 秒在 127.0.0.1:3030 监听就位（`http://127.0.0.1:3030`），停止后端口即释放；ZCode.app 桌面版同时在跑互不冲突。快照：`/tmp/z400-scripts/real-dir.txt` 指向的探针日志。

### N34-8 kanban 真 CLI 回归测试的可用性探针会静默跳过
- 锚点：`custom/server/services/hermes/__tests__/kanban-title-edit.regression-1.test.ts:14,31`（`spawnSync('hermes', ['--version'], { timeout: 10_000 })` 非零即整组跳过）。
- 根因层：本机实测 `hermes --version` 冷启动 11 秒、预热后 1～2 秒，探针超时 10 秒贴近冷启动耗时。全量测试在负载下会把它跳过而不报失败（本批第二次全量 9905/0/12 比第一次多出的 1 条跳过即此），回归覆盖面静默缩水。该测试由 2026-11-22 回归修复批引入，与本批无关。
- 验收判据：探针超时放宽到冷启动耗时的数倍并对「命令存在但超时」给出显式提示；或改为一次性预热线程复用结果。全量测试报告中该用例不得因探针超时而跳过。
- 状态：**已修复（2026-11-24 N34 清偿批，提交 f672c83a1）**——超时放宽到 60 秒探针＋显式失败用例；用例超时放宽到 90 秒。真实 CLI 用例红因宿主 install.lock 被另一会话 hermes update 持锁，环境外部因，待锁释放复跑。

### N34-9 注入哨兵的盲区：半还原态被判为健康（P1 候选）
- 锚点：`scripts/platform/inject/lane-touch.mjs:15-19`（`treeDirty` 以「通道根下 git status 有任何输出」为有差异，未跟踪新增也计入）。
- 根因层：N33-1 的哨兵只在「还原＋清理」的完全干净态上验证过。`git checkout -- vendor/` 或 `git reset --hard` 只还原已跟踪文件，补丁新增的未跟踪文件（hermes-agent 95、hermes-studio 15、zcode 6）仍在，各通道都判「有差异」，结论为 ok，noop 放行，树保持半还原。本批实证：工作树内一次 `git reset --hard` 之后，清单 status=complete，`connectionsExtras` 计数为 0，`ensure-injected` 报「注入态与 series 前缀精确一致（v2 noop），无需动作」，直到 `docs:check` 报路由 130 才暴露；清理后全量重放恢复（路由 129）。
- 验收判据：①哨兵按通道区分「已跟踪修改」与「未跟踪新增」，对声明 applied 且含非新增文件补丁的通道要求至少一处已跟踪修改，否则判 reverted 或 mixed。②负例测试：注入后 `git checkout -- vendor/`（不清理）与 `git reset --hard` 两种形态下，`ensure-injected` 都必须触发重放或拒绝 noop。③现有「全部通道被外部还原」用例保留。
- 状态：**已修复（2026-11-24 N34 清偿批，提交 95a450089）**——另立规格并登记机制预算（四类别零增量）；真实工作树三形态验证与实现过程事故（前缀换行、中性证据）如实记录在该规格。

### N34-10 发布标签落在合并提交而非打包提交（待裁决）
- 锚点：标签 `v1.0.20-overlay`（标注对象 `c97dfb140`）指向合并提交 `fe7a9f6bc`；打包提交 `f4e0f1c15`；二者的树对象同为 `489d8622…`。`RELEASE-MANIFEST.json` 的 `packaging.fullPackage.note` 写「tag 必须指向实际打包的 commit」。
- 根因层：打标签在主检出执行，未显式指定提交，落在主干头（合并提交）。标签内容与发布的包一致，但不满足规则的字面要求。发布清单的批次记录已按事实订正。
- 验收判据（二选一）：A 维持现状。标签不挪动，规则补一句「以树对象相同为准」，各处记录写明实际指向。B 挪回打包提交。强制更新已发布的标签，并回验发布页三件资产仍挂接。无论选哪种，主规格 `2026-11-23-zcode-400-upgrade-release.md` 第 8 项「标签指向打包提交」一句都要订正；该规格声明触及 `docs/DESIGN.md`，单独改它会被提交钩子拦，须随一次真实的设计文档修订一并处理。
- 状态：**已按裁决 A 订正（2026-11-24 N34 清偿批首提交 26b384046）**——标签不挪动，规则补「以树对象相同为准」，主规格句与批次记录已回填。

### N34-11 ModelScope 发布口径四方不一致（待裁决）
- 锚点：用户级规则「swarm-yuan 只传 everything 档，`swarm-yuan/` 目录按版本放 zip 与单条 `SHA256SUMS-v<版本>.txt`」；`docs/DESIGN.md` §5.5「ModelScope 的 `aistudio/` 只替换 full 包，仓根放 everything」；`RELEASE-MANIFEST.json` 的 `packaging.artifactDistribution`「ModelScope（aistudio/ 只换 full＋仓根 everything zip）」；v1.0.18、v1.0.19、v1.0.20 三版的实际做法都是只在 `swarm-yuan/` 目录放两件。
- 根因层：发布清单与设计文档的表述停在 2026-11-03 的口径，用户级规则与其后三版的实际做法是另一个口径。
- 验收判据：用户裁决以哪份为准后，`docs/DESIGN.md` §5.5、`RELEASE-MANIFEST.json` 的 `artifactDistribution` 与用户级规则三处表述一致。
- 状态：**已对齐（2026-11-24 N34 清偿批首提交 26b384046）**——以用户级规则与近四版实际做法为准，设计文档/发布清单/发版说明/设计导读手册四方表述一致。

### N34-12 真实派单台账里的测试污染数据
- 锚点：`~/.hermes-web-ui/overlay/dispatch-ledger.jsonl`——3485 行里 3034 行是测试写入的 `/w/anywhere`（工作区形态即 `zcode-engine-controller.test.ts` 归属闸用例的固定值）。
- 根因层：全局测试设置未隔离派单台账路径，`/mention` 等用例把派发结果追加进真实台账。写入侧已在 N34 清偿批修复（`fd2f94444`，未指定时落一次性临时文件＋守门用例），真实台账不再随测试增长。
- 验收判据：用户裁决是否清理真实台账里既有的 3034 行测试数据；清理须先备份该文件。
- 状态：**已清理（2026-11-25 批二，用户令「完成未做及挂账」）**——整文件备份到 `/Volumes/nvme2230/lab/archive/aistudio-n34-cleanup-20261125/` 后原子重写：3507→451 行（移除 3056 行 `/w/anywhere` 测试行），451 行真实推演记录全保留。写入侧第二道防线随批二下沉到 `dispatchLedgerPath()` 本体（vitest 进程自判落临时文件，不依赖全局 setup），守门用例两个。另查明修复后新增的 22 行来自其他会话工作树（其分支尚未含修复），非修复漏洞。

### N34-13 隔离引擎在「建会话因缺模型被拒」后不应答新连接的握手
- 锚点：N34 清偿批隔离引擎实测（2026-11-24，端口 3031，`packages/server/dist/entry-http.js`）。
- 根因层（2026-11-25 批二改写，原归因撤销）：对照实验证明这是**宿主桥接的首帧竞态**——`connectZCodeEngine` 等 WebSocket `open` 之后才挂 `message` 监听，而引擎在连接建立的同一拍发出 RPC 初始化帧；两帧合并到达时初始化帧在监听挂上之前被派发而丢失，`ChannelClient` 停在未初始化态，此后所有请求排队不发（表现＝握手超时）。隔离引擎各 200 次新连接实测：等 open 后挂监听失败 20 次（失败的全部是「打开瞬间首帧已到达」），创建时即挂监听失败 0 次。与建会话被拒无关、不是 4.0 回归（旧构建同样出现）。
- 验收判据：在 4.0 与 3.18.2 构建上分别复现；若属实，定位引擎侧原因并修复或记录规避。
- 状态：**已修复（2026-11-25 批二，提交 02958a4）**——修法在宿主侧：创建 `ws` 后立即构造协议客户端与通道代理，再等 `open`。确定性回归用例（假连接复刻最坏时序＋真 ChannelServer 对端；修复绿、变异红）；真实引擎修复后连续新建连接 60/60、30/30 成功。原验收判据中的「引擎侧原因」经实测不成立（引擎行为正确），按批二规格 D1 改写归因。

## 已裁定不处置（本轮）

- **`packages/android/gradlew.bat` 换行符与上游不同**：本机 `core.autocrlf=input` 在入库时转换，换血前入库的就是同一 blob，按既有口径保留。
- **技能清单里同名技能不去重**：`.zcode`、`.agents`、`.claude` 三个根之间同名技能都列出，按名查找取首个命中。这是上游对原生根的既有设计，009 的兼容根沿用同一语义，已用测试钉住。
- **测试描述名「pin fec97590 新语义」**：`custom/server/__tests__/zcode-engine-bridge.test.ts` 里这个描述指的是该版本引入的错误字段语义，属历史指称，不改。
- **词条快照目录 `zcode-3191` 保留**：安装版 3.19.1 的历史快照，与新的 `zcode-400` 并存。

## 计数

已清偿 13（N34-1/2/5/6/7/8/9/10/11/12/13 已修复或已清理、N34-4 已跑通）｜待裁决 1（N34-3 四项可吸收能力，对照报告已产出）｜已裁定不处置 4。N34-1 补验证、N34-2 第二步、N34-13 归因改写均完成于 2026-11-25 批二（提交 02958a4，主规格 `2026-11-25-n34-pending-batch-2.md`）。

## 变更

0. 2026-11-25 N34 清偿批二（`2026-11-25-n34-pending-batch-2.md`，分支 `fix/n34-pending-batch-2`，提交 02958a4）：按用户令「完成未做及挂账」清偿——N34-5 真实库测试数据清理（备份＋演练先行）、N34-12 台账测试数据清理＋隔离第二道防线、N34-13 归因改写为宿主桥接首帧竞态并修复、N34-2 第二步（v4 建会话命令＋路径形态逐字约束＋clientMismatch 归一）、N34-1 真实引擎补验证、N34-3 对照报告落盘（四项能力吸收待裁决）。
1. 2026-11-24 N34 清偿批（`2026-11-24-n34-pending-batch-closeout.md`，分支 `fix/n34-pending-batch`）：按用户令「按建议完成，修复所有」清偿——N34-1/2/8/9 修复、N34-10/11 订正、N34-4 跑通、N34-5 只读核对；新增挂账 N34-12（台账测试污染数据）、N34-13（引擎拒后不应答握手）。
1. 立本台账：收敛 ZCode 4.0.0 升级发版批的全部剩余面，编号 N34-1..8。
2. 登记兼容性自查中发现的两项存量问题（N34-1、N34-2），均只登记不修复。
3. 并入独立审查的遗留项：N34-6 增补两份 Windows 说明的陈旧版本表；N34-8 登记全量测试复跑时暴露的回归测试静默跳过。
4. 并入发布收尾时发现的三项：N34-9 注入哨兵半还原态盲区（本批自己误操作 `git reset --hard` 后暴露）；N34-10 发布标签指向合并提交；N34-11 ModelScope 发布口径不一致。后两项属对外产物与口径裁决，只登记。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | 两项存量发现只登记、不在本批修复 | 它们在新旧基线间逐行相同，不属于升级引入的回归；范围外的顺手修复按规则列为清单待批 | 随手修掉（否决：修复需要从会话控制快照取基线字段并做真实引擎验证，超出本批范围，且未经用户裁决） |
| D2 | N34-1 列 P1 候选而不是直接定 P1 | 校验规则已被纯函数实测证实，但宿主真实界面上的表现还没有在配置了模型的环境里看到 | 直接定 P1（否决：缺最后一环实测，不拔高） |
| D3 | 编号续 N33 序列为 N34 | 延续挂账台账的编号约定，便于复盘 spec 引用 | 另起一套编号（否决：割裂与 N33 的承接关系） |
| D4 | N34-9 只登记不当场修 | 哨兵判定逻辑的改动是机制变更，须另立 spec、补负例测试并登记机制预算；发版收尾途中改守门逻辑风险大于收益 | 当场补判据（否决：仓规 13 要求机制变更带退役条件与预算登记，不便夹带） |
| D5 | 已发布的标签不擅自挪动 | 标签是对外产物，强制更新难以回退；内容与发布包一致，不构成紧急问题 | 立即挪回打包提交（否决：未经用户确认的对外改动） |

## 验证

- N34-1：`parseCommandEnvelope` 对宿主七种信封形态的校验结果见该条「实测」；`fec97590` 与 `a4b44451` 的两份名单与函数体经 `diff` 逐行相同。
- N34-2：隔离引擎两次调用（未登记→`project.remote-project-required`；登记后越过）；真实库只读查询得到 19 个项目归属主机均为 `local`。
- N34-5：真实库只读查询，25 条任务的创建时间分布为 2026-09-28 至 10-19；指向隔离目录的记录为 0。
- N34-7：`security find-generic-password` 只读查询，真实路径对应的条目存在、隔离路径无条目。
- N34-9：半还原态下 `node scripts/ensure-injected.mjs` 输出「注入态与 series 前缀精确一致（v2 noop，status=complete），无需动作」；同态 `docs:check` 报「期望 routes=130（page 88 / redirect 42），在册 129」；`npm run clean && npm run inject` 后 `connectionsExtras` 回到 5、`docs:check` 回到 129。
- N34-10：`git rev-parse 'v1.0.20-overlay^{commit}'`＝`fe7a9f6bc`；`git rev-parse 'fe7a9f6bc^{tree}'` 与 `'f4e0f1c15^{tree}'` 同为 `489d8622…`。
- N34-11：ModelScope 本地仓 `e45bb73`（v1.0.19）与 `37eca12`（v1.0.20）两次提交均只含 `swarm-yuan/` 下两件。
- 本台账的锚点行号取自纯净 4.0 树（`git show HEAD:vendor/zcode/<路径>`）与当前工作树，提交前逐条核对。

## 设计文档影响

DESIGN_SYNC: none。本台账是待办收敛与过程留痕，不触及整合正本与数字总账；N34-1、N34-2 将来修复时按各自验收判据另做门验证与设计同步。

## 任务卡

### 完成条件

本批剩余面逐条有编号、锚点、验收判据与状态；两项存量发现被后续批次的 spec 按编号引用，不再重复展开。

### 输入与来源

主规格 `2026-11-23-zcode-400-upgrade-release.md` 的变更、验证与未验证项；兼容性自查的命令输出；真实库与钥匙串的只读查询结果。

### 工作流边界

只登记与分类，不修改宿主代码、引擎基线或用户真实数据。

### 工具与副作用

文本编辑一处（本文件）；只读查询不产生副作用。

### 结果与证据

待办 11 条、不处置 4 条、计数一行；每条待办带可机械核对的验收判据。

### 异常与恢复

后续批次关闭某条时在该条「状态」回填依据与提交号；判定不再成立时移入「已裁定不处置」并写明理由，不删条目。

### 验收反例

- 只写「待修」而没有锚点和验收判据，后续无法机械核对是否关闭。
- 把存量问题混进升级批顺手修掉，会让发版内容超出已裁决的范围。
