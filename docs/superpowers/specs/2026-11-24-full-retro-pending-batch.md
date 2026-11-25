# 2026-11-24 全面复盘批挂账台账

口径：按挂账台账化约定（2026-11-03 用户令），未做项收敛为编号台账，每条给锚点、根因层、验收判据与状态。本台账承接 `2026-11-23-full-retro-regression-matrix.md`（全面复盘批）做完之后真正剩下的面，编号续 N34（`2026-11-24-zcode-400-pending-batch.md`，ZCode 4.0.0 发版批台账）之后。

## 待办

### N35-1 CI 未覆盖推演 harness、Python 与 Ycode 三个测试面
- 锚点：`.github/workflows/product-tests.yml:13-27`（`paths-ignore` 含 `team/**`）；工作流步骤只跑 `typecheck:harness` 与根 vitest；`config/regression-matrix.json` 中 `sim-gates`、`py-runtime`、`py-team`、`yc-*` 的 `ci` 均为 `null`。
- 根因层：CI 任务的路径过滤与步骤清单是手写的工作流文件，加任务只能在推送后验证，本批不推送，所以没有加。
- 现状：这三个面由推送前钩子强制（`config/regression-matrix.json` 的推送前档）；绕过钩子的推送（`QGATE_PREPUSH_SKIP=1`）或未装钩子的克隆没有自动覆盖。
- 验收判据：在分支上加 CI 任务并见到绿记录后再合入 main；矩阵里对应测试面的 `ci` 字段从 `null` 改为工作流与锚点；`product-tests` 的 `paths-ignore` 不再忽略 `team/**`。
- 状态：**已修复（2026-11-25 清偿批 C）**——新增 `.github/workflows/regression-axes.yml` 两个作业覆盖推演、Python、Ycode 七个面，命令即回归矩阵的测试面；分支 `chore/ci-regression-axes` 推送后 CI 三次运行，最终 success（含 CI 暴露并修好的三处跨端/环境坑）。矩阵里这七面的 ci 字段已指向该工作流。

### N35-2 `/ekko/skills` 指向已退役的运行时，页面恒显示“暂无技能”
- 锚点：路由 `ekko.skills`（`scripts/regression/route-manifest.ts` 生成的清单）；设计正本 4.2 节“通用对话内核只此一个（Ekko 运行时退役）”。
- 根因层：运行时退役后入口没有按“受管迁移与保留”原则处理，既没有下线也没有改接到 Hermes 技能面。
- 验收判据：用户裁决去向——下线该路由并在导航中移除，或改接 Hermes 技能清单；裁决后全路由走查该页不再出现空列表。
- 状态：**已更正并结案（2026-11-25 清偿批 D）**——初版判断有误。`/ekko/skills` 并非指向已退役的运行时：补丁 760（2026-11-10「Ekko 与 Hermes 技能库统一」，规格 `2026-11-10-ekko-hermes-skill-store-unification`）已让该页直接读写 Hermes 的 `~/.hermes/profiles/<p>/skills` 技能树，旧的 `~/.ekko/skills` 逐 profile 副本由一次性迁移器搬空后删除。11-24 在隔离 HOME 的走查里看到「暂无技能」，是空技能库的正确表现，不是页面坏了。补丁 760/762/764 与统一规格测试均在位。不改产品。

### N35-3 机制预算里 14 条退役条件没有机检判定器
- 锚点：`config/mechanism-budget.json` 的 `sunset` 数组（15 条，仅 `capability-matrix` 带 `check`）；`node scripts/governance-lint.mjs --budget` 报 14 条 `retireWhen 仅为自然语言` 告警。
- 根因层：退役条件写成自然语言，到期是否达成只能靠人读。
- 验收判据：7 条 `reviewBy=2026-12-05` 的条目在到期复核时逐条补 `check`，或按条件退役并移出 sunset 册；告警数随之下降。
- 状态：**已修复（2026-11-25 清偿批 A，见 `2026-11-25-full-retro-pending-closeout.md`）**——治理检查器新增 symbolPresent 判定器，并拦截写错的判定器类型；15 条登记全部带判定器（此前只有 1 条），“无机检判定器”告警 14 条全部消失。到期复核顺带订正 merge-invariants 一条：旧条件“CI 覆盖后”写成时就已经达成，改为“远端改为服务端强制后”，本地拦截按仓规 13 保留。

### N35-4 sia 线到点复核已具备转退役条件，台账未改
- 锚点：`team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md` 第 69 行（`hexo-ai/sia`，观察至 2026-11-24）；`2026-11-23-compat-release-pending-batch.md` 的 N33-4。
- 实测（2026-11-24）：`pushed_at=2026-08-26T17:02:30Z`，`v0.6.0...main` 领先 1 个提交，零新推送。
- 验收判据：按台账 §一.3 把该行改为 RETIRED，同步 §八 变更日志与判级汇总计数。
- 状态：**已完成（2026-11-25 清偿批 A，见 `2026-11-25-full-retro-pending-closeout.md`）**——实测 pushed_at=2026-08-26T17:02:30Z 零新 push（末提交 7fd04d0），静默 90 天达线；台账 §3.2 该行已转 RETIRED，判级汇总的 RETIRED 计数 4→5。

### N35-5 降标守卫对“一对一断言替换”机械判红，是否改按文件净量判定
- 锚点：`skills/swarm-yuan/scripts/floor-guard.sh` 的“删除断言”循环（测试文件里任何含 `expect`、`assert` 的被删行都报降标）；`skills/swarm-yuan/tests/gate-fixtures/summary/compliant`（以宿仓库相对 `origin/main` 的差异窗口为输入）。
- 根因层：守卫按行判定，不区分“删一条、补一条的更新”与“真的删掉断言”；按设计，合法替换须在 `decisions.jsonl` 逐条登记理由（决策 26.2）。两日内因此误红两次：2026-11-22 批（断言替换）与本批所见（另一会话随 ZCode 基线升级更新断言里的提交号，提交 `756d2fe54`）。
- 现状：这是有意的严格策略，不是缺陷。副作用是本地 main 领先远端时，别人未推送提交里的替换会落进自己的检查窗口，使 `summary` 组在本机误红；远端推送后自愈（本批复跑即如此）。
- 验收判据：用户裁决去向——维持严格并要求登记，或改为“同一测试文件内新增断言数不少于删除数才放行”；若改，`floor-guard` 夹具组须新增对应的正例与反例。
- 状态：**已修复（2026-11-25 清偿批 A，见 `2026-11-25-full-retro-pending-closeout.md`）**——策略维持逐行严格，没有改按文件净量判定（那会让“删一条强断言、补一条空断言”通过）。真正的根因在判定范围：守卫拿到项目目录后一律上溯到仓库根、比较整个仓库，别的目录里未推送的断言改动也被判进来。已改为只判项目目录，自举门配置把范围限定在技能目录。顺带查出并修复两处：守卫的 `.skip`、`xit`、`xdescribe`、`TODO` 四条规则用了 awk 的 `\b`（退格符，不是词边界），从落地起一条都没命中过；自举门命令里守卫脚本不在运行目录，这道门一直被跳过。门禁夹具由 3 组增至 10 组，新增范围测试 7 例；换回旧版守卫，新用例与新夹具当场转红。

### N35-6 注入干跑（`inject --check`）在已注入的树上失败且不提示原因
- 锚点：`scripts/inject.mjs` 的 `--check` 干跑档。
- 实测：在干净树（未注入）上干跑 500 条补丁，失败 0、退出码 0；在已注入的树上（主检出与本批 worktree，真实注入结论均为 complete）干跑报 2 条“链式检查失败”（记在 `001-schemas-matrix-columns.patch` 与 `117-agent-default-workspace-kind-dir.patch` 名下），退出码 1。
- 根因层：干跑以当前工作树为输入。已注入的树上补丁已经应用，链式检查在每个通道的第一枚补丁处即失败；输出里没有说明“树处于注入态”，使用者会误判为补丁坏了。
- 现状：易用性缺口，不影响真实注入。
- 验收判据：`--check` 识别出注入态（清单在且树有差异）时给出明确提示——直接报“当前树已注入，请在干净树上干跑”，或改以基线为输入；补一条用例锁定。
- 状态：**已修复（2026-11-25 清偿批 A，见 `2026-11-25-full-retro-pending-closeout.md`）**——干跑前先识别注入态：树已注入时直接说明“当前树已注入、补丁已落盘、链式检查没有执行”并指引到干净树；半注入态逐通道列出不在位的状态；干净树照常干跑（实测 501 条补丁、失败 0）。新增 5 例，含真实进程用例。

### N35-7 仓规第 13 条引用了不存在的脚本
- 锚点：`AGENTS.md` 第 13 条“由 `scripts/merge-invariants.mjs --check` 在 `pre-push` 与 `merge-to-main.mjs` 双点拦截”；`scripts/merge-to-main.mjs` 不存在。
- 根因层：脚本被移除或改名后，规则文字没有同步。
- 验收判据：核实合并不变量的真实拦截点后改写该句，只引用存在的入口。
- 状态：**已更正并修复（2026-11-25 清偿批 A，见 `2026-11-25-full-retro-pending-closeout.md`）**——初版判断有误：脚本存在，位于 `scripts/maintenance/merge-to-main.mjs`，仓规写的是不带路径的文件名。已把仓规第 13 条的引用补成完整路径。

### N35-8 katex 低危通告：修复版超出上游声明的依赖范围
- 锚点：`vendor/hermes-studio/package.json` 的直接依赖 katex（受影响范围 0.11.0 至 0.18.1，修复版 0.18.2）；通告 GHSA-238p-pmpm-9mq7（既有原型污染可绕过信任限制）；经 `@vscode/markdown-it-katex` 引入的同一问题在扫描里另计一条。
- 根因层：上游基线声明的 katex 版本范围不含修复版，升级属于依赖升级而非补丁级更新，可能影响公式渲染。
- 现状：低危；本批的安全扫描在 studio 生产依赖里报出（`npm audit --omit=dev`）。同一批报出的 follow-redirects 高危已由补丁 818 修复，见 `2026-11-24-follow-redirects-override.md`。
- 验收判据：上游基线升级到 katex 不低于 0.18.2 的版本，或经上游验证后在本仓用 overrides 钉版本；复扫 katex 相关两条归零，公式渲染走查无回归。
- 状态：**已更正并结案（2026-11-25 清偿批 B）**——今天复查有两处变化。①高危已清：昨天补丁 818 把 `vendor/hermes-studio` 的 overrides 钉到 ^1.16.3，但共享依赖树当时还装着旧版 1.16.0；本次 `npm update follow-redirects` 后实装 1.16.3，studio 生产依赖的高危归零。②katex 低危仍在，但性质更正：受影响的是顶层 `katex@0.17.0`（声明 ^0.17.0）与经 `@vscode/markdown-it-katex` 引入的嵌套 `katex@0.16.47`，都在 0.18.1 及以下；修复版 0.18.2 超出两条声明的范围，是真正的依赖升级（可能影响公式渲染），随上游基线处理。挂账的本意是“随上游基线升级”，现状相符，结案。

### N35-9 宿主 hermes 更新后不同步，真实 CLI 回归测试在本机失败
- 锚点：宿主 `hermes --version` 的两条警告（“此前有一次 `hermes update` 拉取了新代码但没有重启运行中的网关”“虚拟环境与锁文件不同步，请运行 `hermes pm install`”）；`hermes pm doctor` 报 `python: realized bytes do not match recorded digest`；受影响的用例 `custom/server/services/hermes/__tests__/kanban-title-edit.regression-1.test.ts`。
- 根因层：宿主安装树被更新（或自动更新）后，依赖与网关进程没有跟上；不在仓内，本会话没有执行过 `hermes update` 或安装类命令。2026-11-24 18:55 同一用例在本机通过，20:03 失败。
- 现状：宿主侧问题，可能是运行中的网关仍在用更新前的模块，需要宿主属主处置（`hermes pm install`、`hermes gateway restart`）。
- 验收判据：宿主 `hermes --version` 不再有警告，`hermes pm doctor` 的 python 项通过，该用例在本机重新通过。
- 状态：观察（2026-11-24 20:18 复查：两条警告消失，`hermes pm doctor` 的 python 项通过，该用例在主检出连续通过；期间谁做了修复未核实，本会话没有执行过宿主侧修复动作）。另：20:18 那次查询时 `hermes gateway status` 显示网关未运行（状态文件记录为运行中、进程已不在，提示为非正常关闭）；20:27 复查，网关已在 20:18:58 重新启动（由 default 档网关代管，PID 90072，`hermes gateway status` 报运行中），`hermes --version` 无警告、`hermes pm doctor` 的 python 项通过。启停动作不是本会话执行的，执行者未核实。2026-11-25 10:29 复查：宿主已被升级到 v0.23.4（与仓内基线一致），`hermes --version` 无警告、网关在运行，受影响用例在本机通过（2 例）；`hermes pm doctor` 的 python 项再次报“已安装文件与记录的摘要不一致”，是升级后依赖环境没有同步，属宿主侧，待宿主属主执行 `hermes pm install`。本会话没有执行过宿主侧修复动作。

### N35-10 Ycode 依赖安全刷新后仍余 13 条通告：要跨大版本才能修，或属 Electron 本体
- 锚点：`zcode-patches/013-deps-security-overrides.patch`（38 条覆盖项）；在 `vendor/zcode` 下执行 `pnpm audit --prod --registry=https://registry.npmjs.org/` 的输出；处理经过见 `2026-11-24-ycode-deps-security-refresh.md`。
- 明细（高危 5、中危 6、低危 2，严重 0）：linkify-it 3.0.3（2 条，需 5.x；经 ansi-to-react）；basic-ftp 5.3.1（3 条，需 6.2.1；经 get-uri，只在 PAC 代理解析 ftp 地址时用到）；zod 3.25.76（1 条，需 4.6.6；经 @jimp/plugin-blit）；electron 44.7.0（1 条，需 44.9.1；桌面端开发依赖的精确钉版）；uuid 9.0.1（需 11.1.1；经 http-mitm-proxy）；@opentelemetry/core 2.6.1（需 2.8.0；OpenTelemetry 家族成组钉版）；@hono/node-server 1.19.19（需 2.1.3；另两条已由 1.19.19 修掉）；minimatch 10.2.5（需 11.0.1；经 @ts-morph/common）；katex 0.16.45（需 0.18.2）；@babel/core 7.29.0（低危；只在代码生成工具 shadcn 的子树里）。
- 根因层：这些包被第三方父包钉在旧的大版本上，本仓的覆盖项若强行跨大版本，等于替那些父包做未经验证的兼容承诺；Electron 是桌面应用的运行时本体，升级后要做桌面端整包验证。
- 现状：严重与高危通告里，产品运行面上还剩 linkify-it（渲染模型输出时的二次复杂度拒绝服务）、basic-ftp（代理解析路径）、zod 3（图片处理插件）与 Electron（对某张被攻陷的中间证书的缓解）四处。
- 验收判据：上游基线升级后在新基线上复扫，逐条消失即从本条划掉；Electron 一条由基线属主连同桌面端端到端验证一起处置；复扫后若仍有残留，按 013 的重做步骤处理。
- 状态：**部分修复（2026-11-25 清偿批 B，见 `2026-11-25-full-retro-pending-closeout.md`）**——本条原有的 13 条生产依赖残留不变（都要跨大版本或属 Electron 本体）；N35-12 清偿后开发依赖的 20 条同类残留并入本条跟踪，合计 33 条，全部只能随上游基线升级解决。Electron 44.7.0 → 44.9.1 那一条需要桌面端整包验证，本批没有做（下载 Electron 二进制并跑 wdio 端到端超出当前环境条件），仍待基线属主处置。

### N35-11 依赖漏洞扫描不在任何自动关口
- 锚点：`config/regression-matrix.json` 的 20 个测试面里没有依赖审计；本轮三处审计全是手工执行——`npm audit --omit=dev`（`vendor/hermes-studio`）、`pnpm audit --prod`（`vendor/zcode`）、`pip-audit`（hermes-agent 的锁定依赖，装在临时环境里跑）。
- 根因层：审计要联网查通告库，结果随新通告的发布而变化，放进推送前关口会让与代码无关的提交变红；仓里也没有“已接受的通告”清单可供比对。
- 现状：Ycode 4.0.0 基线在 2026-11-23 进入主线并随 v1.0.20-overlay 发版时已带着 266 条通告，次日才被手工扫描发现。
- 验收判据：用户裁决后实施。建议只在全量档加一个依赖审计面（studio 与 Ycode 两处），配一份已接受通告清单（现余的 13 条与 katex 的 2 条入册），出现清单之外的高危或严重通告才失败；登记进矩阵后补一条把关用例，并在发布前检查里引用。
- 状态：**已修复（2026-11-25 清偿批 B，见 `2026-11-25-full-retro-pending-closeout.md`）**——新增 `scripts/dependency-audit.mjs`，在 studio 与 Ycode 两处做生产依赖审计，比对 `config/accepted-vulnerabilities.json`：清单内的高危与中危不拦，清单之外的高危或严重才失败。登记为回归矩阵的 `dependency-audit` 面（合并前档与全量档），机制预算上限 75→76。现存 14 条通告入册。变异探针：移除清单内一条高危即转红。

### N35-12 Ycode 开发依赖另有 64 条通告（构建与测试工具链）
- 锚点：在 `vendor/zcode` 下执行不带 `--prod` 的 `pnpm audit`（官方源），刷新后的树上报 77 条；扣除生产依赖里仍余的 13 条（N35-10），开发依赖独有 64 条——严重 4、高危 31、中危 24、低危 5。
- 明细（按条数）：@xmldom/xmldom 0.8.12（14 条，经 plist）、vite 7.3.3 与 8.0.8（14 条，工作区各项目与 vitest 的开发依赖，上游精确钉版）、brace-expansion 1.1.14 与 2.1.0（12 条）、postcss 8.5.9（4 条，vite 带入）、serialize-javascript（3 条，经 mocha）、handlebars 4.7.9（3 条，经 conventional-changelog-writer）、tinypool 2.1.0（2 条，经 oxfmt）、extract-zip（2 条，经 @puppeteer/browsers）、@vitest/mocker、esbuild 0.27.7 等。
- 根因层：这些包不随产品发布，只存在于开发机与 CI 的构建和测试环境里；vite 一类开发服务器的通告关系到在本机开着开发服务器时的文件读取边界。vitest 在根 `package.json` 的 `patchedDependencies` 里按精确版本挂了补丁，升级要连补丁一起重做。
- 现状：本批只处理生产依赖（013）。开发依赖没有动。
- 验收判据：上游基线升级后复扫，或另立一批按 013 的做法处理开发依赖；处置后不带 `--prod` 的审计里，开发依赖独有的严重与高危通告归零，构建、打包体积与工程测试不回归。
- 状态：**已修复到同大版本内的上限（2026-11-25 清偿批 B，见 `2026-11-25-full-retro-pending-closeout.md`）**——zcode-patch 014 追加 15 条覆盖项（含 vitest 升 4.1.12、补丁文件沿用），Ycode 全部依赖通告 77→20 条：严重 4→0、高危 36→9、中危 30→7。Ycode 四条验证面与全量工作区构建在刷新后的树上通过。剩下的 20 条每一条都要跨大版本才能修（serialize-javascript、linkify-it、deepmerge-ts、basic-ftp、zod 3、uuid 8/9、@hono/node-server、glob、minimatch、esbuild 0.27、katex 0.16），或没有修复版（extract-zip），或属 Electron 本体——同大版本内已无可修项，随上游基线升级处理，并入 N35-10 跟踪。

## 已裁定不处置

- **Ycode `windowsInstallerCompile.test.ts` 首次运行超时**：首次运行要联网下载 NSIS 工具集，冷缓存叠加并发负载时超过 120 秒；缓存就位后独立复跑 26.5 秒通过。属环境因素，矩阵里该测试面的说明已写明。
- **隔离 HOME 下服务端调用 `kanban complete` 报“依赖环境未提交”**：hermes 的依赖环境按 `HERMES_HOME` 提交，隔离的空 HOME 下本就没有；同一条命令用真实 HOME 直接执行成功。属走查配方注意事项：隔离走查要验证完整看板流转时，需用一个已初始化的 HOME。
- **登录页公告接口 502**：外部公告源在当前网络不可达，属外部依赖缺席。
- **Ycode 类型检查与工程测试两次“未执行”**：4.0.0 基线新增的 3 个包需联网取一次，两次都赶上 `registry.npmjs.org` 域名解析失败（机器负载均值 130 至 250 的时段）；网络恢复后重跑，结果记在主 spec。
- **`governance-lint` 对 `decisions.jsonl` 的 42 条形态告警**：针对历史行，红线是不改写历史行；新增行按标准字段书写即可。

## 计数

待办 2（观察 1＝N35-9；随上游基线升级 1＝N35-10，含 N35-12 并入的 20 条）｜已完成 10（N35-1 至 N35-8、N35-11、N35-12）｜已裁定不处置 5。

## 变更

1. 立本台账：收敛全面复盘批（`2026-11-23-full-retro-regression-matrix.md`）之后剩余的面，编号 N35-1 至 N35-5。
2. 全量档复跑中新增 N35-5（降标守卫对断言替换的判定策略）。
3. 合入 main 之后新增 N35-6（注入干跑在已注入的树上失败且不提示原因）与 N35-7（仓规引用不存在的脚本）。
4. 安全补测（依赖漏洞扫描）新增 N35-8（katex 低危，随上游基线升级）；同一扫描里的 follow-redirects 高危当批修复，见 `2026-11-24-follow-redirects-override.md`。
5. 依赖修复批验证时新增 N35-9（宿主 hermes 更新后不同步）。
6. Ycode 依赖安全刷新批新增 N35-10（刷新后仍余的 13 条通告）、N35-11（依赖漏洞扫描不在自动关口）与 N35-12（开发依赖另有 64 条通告），见 `2026-11-24-ycode-deps-security-refresh.md`。另：主 spec 的状态行仍为 in_progress——改动该 spec 的提交必须同时带上设计正本的修订（L2 design-sync），仅改状态行的提交被拦下，留待下次合法触及设计正本的批次顺带更新。
7. 清偿批 A 结案 N35-3 至 N35-7，并补记 N35-9 的复查结果；见 `2026-11-25-full-retro-pending-closeout.md`。
8. 清偿批 B 更正并结案 N35-8（katex：高危已清、低危随上游基线）；清偿批 D 更正并结案 N35-2（/ekko/skills 为误记，技能库统一后的正确表现）。
9. 清偿批 B 结案 N35-11（依赖审计进合并前档与全量档）与 N35-12（Ycode 开发依赖刷新，补丁 014，通告 77→20）；N35-10 并入开发依赖的剩余面。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | CI 补面不在本批做 | 工作流改动只能在推送后验证，本批不推送 | 当批改工作流文件（否决：未见绿记录就合入，等于把未验证的东西放上主干） |
| D2 | `/ekko/skills` 只记观察 | 入口去向是产品决定 | 当批下线路由（否决：越权替用户做产品决定） |
| D3 | sia 转 RETIRED 只记实测、不改台账 | 改台账要同步判级汇总计数与受其约束的测试，属台账维护批 | 顺手改（否决：收尾阶段改一处计数容易漏同步） |
| D4 | N35-5 只记待裁决，不当批放宽守卫 | 守卫的严格是有意设计（删除断言须登记理由），放宽属于策略变更 | 改按文件净量判定（否决：未经用户裁决改变质量门的语义） |
| D5 | Ycode 带通告的依赖只升到同大版本内的最小修补版本 | 跨大版本升级可能改变行为；Electron 本体升级后要做桌面端整包验证 | 一并跨大版本升级（否决：替第三方父包做未经验证的兼容承诺）；只记录不修（否决：严重与高危通告落在产品运行面上） |
| D6 | N35-5 维持逐行严格，只修判定范围 | 按文件净量会让“删一条强断言、补一条空断言”通过；误红的根因是范围不是规则 | 改按文件净量判定（否决） |

## 验证

- 四个待办项的锚点与本批实测数字均来自本会话的命令输出（`gh api repos/hexo-ai/sia`、`governance-lint --budget`、`config/regression-matrix.json`、路由清单）。
- `node scripts/maintenance/gen-doc-indexes.mjs --write` 随批重建索引；`node scripts/merge-invariants.mjs --check` 通过。

## 任务卡

### 完成条件

四条待办各自按其“验收判据”达成；未达成前不得改写状态。

### 输入与来源

全面复盘批的实测输出与 `config/regression-matrix.json`、`.github/workflows/product-tests.yml`、路由清单、`gh api repos/hexo-ai/sia` 的返回。

### 工作流边界

台账只登记不实施；实施走各自的批次并另立 spec。

### 工具与副作用

只读查询（`gh api`、`governance-lint`、路由清单）；无写入副作用。

### 结果与证据

每条的“实测”字段即证据；实施后的结果回填到对应批次的 spec，不回写本台账的锚点。

### 异常与恢复

条目长期无法达成时显式归档并写明原因，不无限顺延。

### 验收反例

把一条未达成的待办改成“已完成”：下一位接手者按验收判据复跑必须能当场发现。

## 设计文档影响

DESIGN_SYNC: none。本台账是过程留痕与待办收敛，不改变设计正本的陈述；其中 CI 未覆盖三个测试面一事已在 `docs/DESIGN.md` 6.3 与 6.4 如实写明，无需重复修订。
