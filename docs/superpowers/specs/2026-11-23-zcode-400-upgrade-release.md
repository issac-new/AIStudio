# 2026-11-23 Ycode 基线升至 ZCode 4.0.0＋v1.0.20-overlay 发版批

> 状态：实施中。依据用户指令「Zcode 已升级至 4.0（zai-org/zcode），同步完成 AIStudio 的相关升级」，以及方案确认时的裁决「合并后接着发版」。

## 变更

1. **Ycode 源码基线 3.18.2 → 4.0.0**：`vendor/zcode` 由 `fec97590` 换血至上游 main `a4b44451`（＝tag `v4.0.0`，2026-11-23 发布；差量 2209 文件 +149,753/−24,801，因 3.19.x 从未发布源码，本差量含两个版本的全部变更）。经 `npm run vendor:sync -- zcode` 整树替换 pristine 基线，工具链不变（Node ≥24、pnpm 10.33.2）。与 3.19.x 批次不同，本次源码已公开，源码基线与安装版（本机 ZCode.app 4.0.0）合一，不再分账。
2. **Ycode 补丁 11 条在新基线重放**：按 `zcode-patches/series` 全量重放，逐件按实测处置。结果＝全部存续、零退役；7 条直放（002/003/005/007/008/010/012），4 条重锚：
   - 004（桌面控制回落）：4.0 把独立 CLI 的桌面控制改为「进程内 broker＋哨兵值 `in-process`」，开源树该路径恒报不可用；fork 接管哨兵分支，无宿主凭据与哨兵两形态统一回落自包含运行时，建运行时前先剥离 socket 变量；同步改写上游新增测试（三例）。
   - 006（电脑控制默认启用）：design 插件版本上下文 0.7.2→0.8.0 漂移，四段重切，语义不变。
   - 009（`.claude/skills` 兼容根）：补上游 4.0 新增测试的配套调整——新测试写死每级恰好 2 个技能根；补丁改为两文件（源码段原样＋测试段：预期根数 6，并新增一例钉住兼容根被加载、同名时原生根排前）。
   - 011（MCP 参数名消毒）：入口 `callTool` 拆行致上下文漂移；另补 4.0 的 live 入口回译语义（见 D8），新增两例钉住两种故障形态。
3. **宿主 RPC 复制面同步**：`custom/server/zcode/vendor/rpc/` 按既有确定性规则（上游原文→仅去相对 import 的 `.js`→逐文件 X3 头注）同步至 `a4b44451`，10 文件闭包中仅 `proxy-channel.ts` 有差量；头注与会话投影的 pin 对齐；会话投影头注补 4.0 新增的可选字段 `hasCompactWork`（X5 白名单按设计不透传），并把该头注里早已失真的服务面行号锚点改准（旧值 `:5494`/`:5473` 在上一基线上就已对不上）。
4. **词条快照**：按本机 4.0.0 应用重建 `docs/superpowers/notes/zcode-400/`（安装版事实源，与源码基线分属两口径）。
5. **版本载体进位（与升级同批）**：Ycode 模块 `3.18.2`→`4.0.0`；驾驶舱 `0.8.30-studio.1`→`0.8.30-studio.2`（本仓扩展序：Ycode 底座换血＋补丁适配＋宿主 RPC 同步，先例＝0.8.28-studio.3 记 Ycode 002/012）；整体包 `1.0.19-overlay`→`1.0.20-overlay`；agent-teams `v0.23.3-team.2` 与 yuan-skill `v2.103.0` 载体未变、维持。版本台账与投影随批对齐（`vendor/VENDOR.md`、`zcode-patches/series` 头、`RELEASE-MANIFEST.json`、`RELEASE-NOTES.md`、`AGENTS.md`、`README.md`、`docs/DESIGN.md`、设计总账、设计导读、培训载体、team README、技术组件台账）。
6. **发版 v1.0.20-overlay**：全量测试→`release:preflight`→打包（整体源码包＋swarm-yuan everything）→tag 指向实际打包 commit→GitHub Release 三资产→ModelScope everything 通道→`releaseBatches` 回填。
7. **引擎部署位**：全部验证通过并合入 main 后，在主检出执行 `npm run zcode:ensure` 与 `node scripts/zcode-engine.mjs install-cli`，更新本机 `~/.hermes/ycode/zcode.cjs`（覆盖前备份旧件）。
8. **明确不做**：不升级 hermes-studio / hermes-agent 基线；不写宿主 `~/.hermes/hermes-agent`；不做 3.19.x＋4.0 全部新特性的逐项功能对照与吸收（挂账台账）。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | 源码基线升 `a4b44451`（＝tag v4.0.0＝main 头，三者同一提交） | 既定口径「按上游 main 同步、不看版本 tag」；本次 main 与 tag 恰好一致，无歧义 | 停在 3.18.2 只做安装版分账（否决：3.19.x 批次分账是因为源码未公开，本次前提已不成立） |
| D2 | 升级与发版合为一批，版本载体一次进位 | 用户在方案确认时裁决「合并后接着发版」；拆两批会让版本载体分两次进位、各带一遍传播面（上一版先例） | 先升级合并、再另开发版批（否决：多一轮合并与传播面） |
| D3 | 补丁退役只凭重放实测的上游原生实现证据，不按交集预判 | 交集只说明「目标文件被改过」；上一版 Studio 升级预判 54 条交集、实际只 5 条需适配 | 按文件交集批量重生成（否决：会把未被触及的补丁无谓改动，且掩盖真实根因） |
| D4 | 驾驶舱扩展序进位 `0.8.30-studio.2` | Ycode 补丁变更计入驾驶舱扩展序有先例（0.8.28-studio.3） | 不进位（否决：发布说明无法承载本版 Ycode 变更的追溯） |
| D5 | 词条快照目录沿用脚本既定命名规则 `zcode-400` | `notesDirFor` 按去点规则机械生成，非缺陷；不为单个版本改脚本 | 改脚本补零对齐位数为 `zcode-4000`（否决：制造第二套命名规则） |
| D6 | 引擎部署位更新放在合并 main 之后，且先备份旧件 | 部署位在仓外（`~/.hermes/ycode/`）；先保证仓内验证全过再动宿主 | 升级过程中途部署（否决：分支若放弃则宿主残留未验证件） |
| D7 | 004 接管 4.0 的哨兵分支，而不是只把旧语义挪到新位置 | 4.0 上游对哨兵值走「进程内 broker」，依赖原生 addon `ax_native.node`，开源树 `broker-in-process.js` 恒抛 not available；只挪旧语义会让顶层 CLI 的桌面控制静默失效。另一处必须一并处理：`createComputerUseRuntime()` 缺省读 env 推导 socket，会把字面量 `in-process` 当真实路径去连 | 退役 004 改用上游进程内 broker（否决：本 fork 源码构建不带该 addon，功能不可用）；保留哨兵分支原样只回落无 env 形态（否决：顶层 CLI 正是走哨兵形态的那条路） |
| D8 | 011 的 live 入口沿用注册态回译映射；校验面保持 live | 4.0 执行前用 live 描述符重建入口。消毒名的碰撞消歧依赖兄弟参数与顺序，注册态与 live 形状不同时同一原始参数的消毒名就不同，而模型是照注册态 schema 产出参数的；按 live 映射回译会漏参或错投。校验用 live schema 是上游有意行为（live 更严格时让模型下次按新定义重试），不在本补丁改动范围 | live 入口连模型面 schema 一并用注册态（否决：会盖掉上游「live 定义更严格则本次不调用」的保护）；禁用 live 重建（否决：动上游调度语义） |
| D9 | 009 扩为两文件，连带调整上游新增测试并补 fork 行为用例 | 上游 4.0 新增测试写死每级恰好 2 个技能根，与 fork 有意追加的 `.claude/skills` 冲突；不改则套件留一条永久红，掩盖真回归。fork 该行为此前零测试覆盖 | 只改源码、接受这条红（否决：永久红等于关闭守门）；退役 009（否决：兼容根是有意的产品行为） |

## 验证

已完成项回填实测结果（锚点＝命令与输出；未完成项标「待办」）：

1. **来源与基线（已过）**：tag `v4.0.0`＝main 头＝`a4b44451`，`vendor/zcode/package.json` version 4.0.0。提交后全树逐文件对账：路径集 19,355＝上游 19,355；内容 oid 19,354 个相同，唯一差异 `packages/android/gradlew.bat` 为换行符规范化（上游 blob `5eed7ee` CRLF 2937 字节，入库 `db3a6ac` LF 2843 字节；换血前 HEAD 同一 blob，非本批引入）。整树替换清掉 2 个上游没有的钩子留痕文件（`apps/zcode-cli/packages/bootstrap/.swarm-yuan/gate-{audit,deny}.jsonl`）。
2. **补丁重放（已过）**：净基线 `npm run clean && npm run inject` → manifest `status=complete`、510/510 applied（Studio/agent 499＋Ycode 11）、runtimeDeploy precheck/apply 均 complete；二次 inject 工作区指纹逐位不变（status/diff 两指纹前后相同），日志判定 `manifest v2 与 series 前缀精确一致（noop）`。
   - 变异探针（去掉 fork 改动后配套用例必红）：011 朴素重锚形态 `2 failed | 9 passed`，失败内容＝消毒名 `foo_bar_1` 原样漏给 server／参数被投给原生 `foo_bar`；004 上游原文 `2 failed | 5 passed`（无宿主凭据时返回 undefined；`ZCODE_CUA_DISABLE=1` 不再关闭）；006 上游定义表 `5 failed | 54 passed`，其中 2 条为 fork 默认态用例；009 上游源码段 `2 failed | 34 passed`。
   - 真实工具链（pnpm 10.33.2；`turbo run build` 于 `apps/zcode-cli` 25 任务全过）：011 所在包 `11 passed`；004 所在包 `10 files / 81 passed`；006 所在文件 `59 passed`；009 两文件 `36 passed`；012 文件 `7 passed | 1 skipped`；002 多源校验 `7 passed`；003/005/007/008 运行时 `3 passed`。
   - 006 的前置条件：只构建 CLI 依赖闭包时该文件有 3 条红（`documents` 等官方插件的 `dist/` 缺失，属上游测试的构建前置），全量构建工作区后 59/59。
3. **宿主 RPC（已过）**：同步前守门 2 红（`proxy-channel.ts` 与上游源漂移；pin 失配），按归一化规则重拷后 10 文件闭包仅 `proxy-channel.ts` 变化，守门转绿（两件 15 passed）；`npm run typecheck:harness` exit 0；会话投影与桥接测试 `31 passed`。
4. **引擎（已过）**：`npm run zcode:ensure` exit 0（pnpm install 4m37s、2712 包；`packages/server/dist/entry-http.js` 4.2MB）；CLI 闭包构建 `dist/zcode.cjs` 29.9MB。隔离真引擎：`PORT=3031`，`HOME` 与 `ZCODE_DATA_BASE_DIR` 指向临时目录，`zcode-import-session-int.test.ts` → `1 passed`（`importSessionV4` 写入后 `listSessions` 回读到导入会话）。隔离实证：测试数据只落在隔离库（项目 `QA isolated import` 1 行，指向隔离目录的记录分布在 4 张表）；真实库中指向隔离目录的记录为 0。真实库内另有 25 条历史测试任务，创建于 2026-09-28～10-19，是该测试加显式开关之前的遗留，不在本批处置（属用户真实数据，留待裁决）。CLI `--version` 输出 `0.18.0`，读的是 `apps/zcode-cli/package.json`（旧基线 `0.17.1`），与仓根 4.0.0 分属两套版本号；宿主侧无对该版本串的依赖。
   - 4.0 新增的启动前置：服务端要求凭据加密密钥可用，来源是系统钥匙串（条目账户名＝凭据文件绝对路径的哈希）或显式配置的 `ZCODE_CREDENTIAL_SECRET`／`ZCODE_CREDENTIAL_SECRET_FILE`。隔离实例的路径没有钥匙串条目，首次启动报 `CREDENTIAL_SECURE_STORAGE_UNAVAILABLE`，改用一次性密钥文件后启动成功。真实路径 `~/.zcode/v2/credentials.json` 对应的钥匙串条目经只读查询确认存在，故真实环境下 `zcode:serve` 不需要额外配置；真实环境的拉起本身未实测（IDE 正占用真实数据目录）。已写入运维参考 3.4 节。
5. **词条快照（已过）**：`npm run catalog-check -- --refresh` 生成 `docs/superpowers/notes/zcode-400/`（4.0.0，7870 键／110 命名空间）；`npm run catalog-check` → `OK：4.0.0，7870 键 / 110 命名空间，与快照一致`。相对 3.19.1 快照（7869 键）新增 1 键、移除 0。
6. **回归（待办）**：目标测试先行，合并前全量 `npm test`；`npm run release:check` 四模块对齐。
7. **独立审查（待办）**：未参与实现的审查者核查 pristine 混入、补丁丢段、RPC 归一化是否掩盖差异、版本投影。
8. **发版（待办）**：`release:preflight` 全过；打包产物尺寸与 SHA256 回验；GitHub Release 资产尺寸、远端 SUMS 逐字比对；ModelScope 推送后 `Content-Length` 逐字节一致。

版本载体（已过）：`npm run release:check` → `四模块对账全绿（cockpit=0.8.30-studio.2 agent-teams=v0.23.3-team.2 ycode=4.0.0 yuan-skill=v2.103.0）`；`docs:check` → `手册投影块与真实载体一致（routes=129，version=1.0.20-overlay）`；手册与清单守门 4 文件 54 passed，文档单一事实源与清单锁文件守门 3 文件 15 passed。

未验证项（如实列出）：010 所在桌面包（`packages/desktop`）的整体类型检查未跑成——其类型产物依赖 `tsc -b` 项目引用构建，`packages/shared`、`packages/services` 无 `build` 脚本，只构建依赖闭包后 `tsc -p tsconfig.main.json --noEmit` 仍报 470 条 TS6305 级联错误；已有证据限于补丁应用通过、依赖符号在 4.0 存续（`handleOpenWorkspacePath` 见 `src/main/desktopOAuthDeepLink.ts:188`）、赋值字面量与上游自身 argv 路径一致（`src/main/index.ts:1040`）。引擎真实调用模型（需 API 配置）不在本批验证；工作台真机 UI 走查不做；3.19.x＋4.0 新特性对本仓的功能级影响不逐项评估。

## 设计文档影响

DESIGN_SYNC: touched —— 本批改变 `vendor/VENDOR.md` 钉版基线（zcode 行）、`RELEASE-MANIFEST.json` 的 `vendorBaseline` 与模块版本、`README.md`/`AGENTS.md` 当前版本行、`docs/DESIGN.md` §5.4 当前基线表与核实日、`docs/DESIGN.md` §4.7 技能根约定（补 Ycode 分叉直读 `.claude/skills` 一句）、设计总账 §C 基线行与模块行；均须同批修订。

## 任务卡

### 完成条件

Ycode 源码基线、宿主协议面、词条快照与版本载体同批进位：净基线全量重放 complete 且二次注入幂等；四条重做补丁去掉 fork 改动后配套用例必红；隔离真引擎跑通会话导入到回读；`release:check` 四模块对齐；双通道发布资产的尺寸与 SHA256 逐字节回验一致。

### 输入与来源

上游 `zai-org/zcode` main 头 `a4b44451`（与 tag v4.0.0 同一提交），经缓存仓 `upstream/zcode` 取得；`zcode-patches/series` 的 11 条活跃补丁；本机 `/Applications/ZCode.app` 4.0.0（词条快照事实源）。

### 工作流边界

只换 `vendor/zcode` 基线并适配其补丁、宿主 RPC 复制面、词条快照与版本载体。不升 hermes-studio 与 hermes-agent 基线；不写宿主 `~/.hermes/hermes-agent`；不做 3.19.x 与 4.0 新特性的逐项功能对照。

### 工具与副作用

`npm run vendor:sync -- zcode`、`npm run clean && npm run inject`、`turbo run build`（在 `vendor/zcode/apps/zcode-cli`）、vitest、`npm run catalog-check`、隔离引擎实例（独立端口与数据目录）。副作用限于检出内的影子部署目录与临时目录；宿主部署位 `~/.hermes/ycode/zcode.cjs` 只在合并后更新，覆盖前先备份。

### 结果与证据

注入清单 `.overlay-injected.json` 的 status 与逐补丁状态；二次注入前后的工作区指纹；各包 vitest 计数；`zcode-import-session-int.test.ts` 的通过记录与隔离库、真实库的只读比对；`release:check` 输出；发布资产的 SHA256 与远端尺寸。

### 异常与恢复

补丁失配按语义重做，并保留变异探针证据，不靠放宽上下文硬套。纯净重放守门为红时不得合并。集成测试只连隔离实例；一旦发现写入真实 `~/.zcode`，立即停止并排查数据目录解析。发布回验不一致时按 tag 规程处理，同一版本号不复用于不同内容。

### 验收反例

- 只确认补丁“能打上”而不跑测试：上游新增的技能根测试与 fork 行为冲突会漏检（009 实证）。
- 只构建 CLI 依赖闭包就跑插件测试：3 条红来自官方插件产物缺失这一构建前置，会被误判成上游缺陷（006 实证）。
- 在 `clean` 之前替换补丁文件：清理步骤用当前补丁反向应用会原子失败，带着旧补丁态进入正向应用（本轮实证）。
- 集成测试连共享的 3030 引擎：会写进本机真实会话库（真实库中 25 条历史测试任务即此因）。
