# 2026-11-24 Ycode 生产依赖安全刷新（zcode-patch 013 与依赖就绪判据）

> 状态：in_progress
> 基线：9448d43d9（main）

## 变更

**为什么做。** 全面复盘批的安全回归补做依赖漏洞审计时，发现 Ycode 基线（`vendor/zcode`，ZCode 4.0.0）的生产依赖带有大量已知通告：在 `vendor/zcode` 下执行 `pnpm audit --prod --registry=https://registry.npmjs.org/` 报 266 条，涉及 42 个包——严重 3、高危 93、中危 137、低危 33。它们落在产品的运行面上：

- 服务端与命令行：axios 1.13.6（34 条，服务器端请求伪造与重定向时的凭据处理）、undici 7.25.0（29 条，含走代理时 TLS 证书校验被绕过）、hono 4.12.12（32 条）、MCP 客户端与服务端 SDK 2.0.0（OAuth 凭据可能被发给由对端指定的授权服务器、共享通道把一个客户的消息发给另一个）、ws、form-data、follow-redirects、smol-toml。
- 桌面端：tar 7.5.13（严重，解压解析拒绝服务）、node-forge 1.4.0（21 条）、electron-updater 依赖的 js-yaml、会话录制库 rrweb 依赖的 postcss。
- 界面渲染：mermaid 11.14.0 与它固定在 3.3.3 的 dompurify（图表渲染的 HTML 与 CSS 注入、净化器绕过）、shell-quote 1.8.3（严重）。

上游 ZCode 的 main 与标签 v4.0.0 都还停在本仓钉的 `a4b44451`，没有更新可同步；仓里也没有任何自动的依赖审计（挂账 N35-11）。通告的发布时间从 2026-04 到 2026-11 不等，不是本仓改动引入的。

**做了什么。**

1. **zcode-patch 013**（`zcode-patches/013-deps-security-overrides.patch`）：在 Ycode 根 `package.json` 的 `pnpm.overrides` 追加 38 条，把带通告的包钉到同大版本内的最小修补版本；`pnpm-lock.yaml` 是据此重新解析的结果。覆盖项沿用上游已有的机制（上游自己就用 `pnpm.overrides` 钉 react 与 electron-to-chromium），各工作区 `package.json` 里上游写的版本声明不动。
2. **引擎依赖是否就绪改为以锁文件为准**（`scripts/zcode-engine.mjs`）：`ensure` 与 `install-cli` 此前只看 `node_modules` 目录在不在，锁文件变了已有安装不会跟进——只做第 1 项的话，安全修复只对新安装生效。现在装完依赖时把锁文件的摘要记进 `node_modules/.aistudio-lock-sha256`，摘要落后就补装；补装失败而依赖目录还在时带着现有依赖继续并在日志里说明，摘要不写，下次启动重试。
3. **把关测试**：`custom/__tests__/zcode-patches-guard.test.ts` 精确放行补丁目标里的根 `package.json` 与 `pnpm-lock.yaml` 两个文件，并新增一例逐条核对 38 条覆盖项已在注入态的两个文件里（干净树不得带着覆盖项）；新增 `scripts/__tests__/zcode-engine-ensure.test.ts` 八例。
4. **发布清单与文档**：`RELEASE-MANIFEST.json` 里 Ycode 的活跃补丁数由 11 改为 12；设计正本 6.4 表加一行；运维手册里 `zcode:ensure` 的语义与行号锚点更新；vendor 台账注明注入态锁文件由 013 刷新；挂账台账加 N35-10、N35-11。

**结果。** 同一条审计从 266 条降到 13 条：严重 3 → 0，高危 93 → 5，中危 137 → 6，低危 33 → 2。剩下的 13 条都要跨大版本才能修（例如 linkify-it 要从 3.x 升到 5.x），或属 Electron 本体，明细与去向见挂账 N35-10。

### 任务卡

#### 完成条件

1. 补丁 013 在干净基线上可应用，经真实注入管线以尾部增量应用后结论为 complete，二次运行为空操作。
2. 注入态的 `pnpm-lock.yaml` 与 `package.json` 和独立实验的结果逐字节一致；冻结模式安装通过，装上的版本与覆盖项逐一吻合。
3. 在刷新后的树上，Ycode 类型检查、工程测试、库表结构检查、lint 四条验证面全部通过。
4. 同一条审计的严重通告归零；剩余通告逐条写明原因与去向。
5. `ensure` 在锁文件变化时补装、指纹一致时不重装、补装失败时的两种结局，各有用例。
6. 发布清单里 Ycode 的活跃补丁数与序列一致，`release:check` 通过；引擎能用新依赖启动并接受握手。

#### 输入与来源

`pnpm audit --prod --json` 的两份输出（刷新前、刷新后）；`vendor/zcode` 基线的 `package.json` 与 `pnpm-lock.yaml`；上游 `zai-org/zcode` 的 main 与标签指向（`git ls-remote`）；pnpm 10.33.2（Ycode 声明的包管理器版本）。

#### 工作流边界

只改 `zcode-patches/`、`scripts/zcode-engine.mjs`、两个测试文件与文档；不直接改 `vendor/` 下的受跟踪文件，不碰宿主运行时，不做跨大版本的依赖升级，不改 Electron 版本。

#### 工具与副作用

补丁只增加 Ycode 根 `package.json` 的 40 行、改写 `pnpm-lock.yaml`。生效条件是装依赖时解析：新克隆与 CI 自然生效；已有安装由 `ensure` 在下一次运行时补装（本机实测增量安装 32 秒、下载 79 个包）。`ensure` 的安装命令从 `pnpm install` 改为 `pnpm install --frozen-lockfile --prefer-offline`：锁文件与清单不一致时直接报错，不再静默重新解析并改写 `vendor/zcode` 里的锁文件。

#### 结果与证据

见“验证”。

#### 异常与恢复

补丁可按序列登记的反向撤出，撤出后 `ensure` 会因锁文件变化再补装一次回到基线依赖。补丁 013 改的是锁文件，上游一旦刷新自己的锁文件，本补丁多半冲突：先在新基线上复扫，通告已清则退役，未清则在新基线上重做（把覆盖项并入新根 `package.json`，执行 `pnpm install --lockfile-only`，复扫确认，再生成补丁），不要带着冲突硬合。

#### 验收反例

把注入态的两个文件退回基线：新增的把关用例必须当场失败并指出哪条覆盖项没有写入。补装失败而依赖目录缺失时，`ensure` 必须以非零退出，不得报告就绪。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | 用 `pnpm.overrides`，不用 `pnpm update` | 实测 `pnpm update`（带不带包名、带不带 `--lockfile-only`）都会把工作区各项目的直接依赖一并升到范围内最新版，两轮分别连带 48 个与通告无关的包，其中有发布不足两天的版本；带通告的包又多被第三方父包固定在精确版本上（如 cheerio 把 undici 固定在 7.25.0、electron-updater 把 js-yaml 固定在 4.1.1），只有覆盖项能改 | `pnpm update` 后手工挑拣（否决：锁文件由解析器生成，手工挑拣等于手写锁文件）；等上游（否决：上游 main 未动，严重与高危通告在运行面上可达） |
| D2 | 只升到同大版本内的最小修补版本 | 跨大版本升级可能改变行为，等于替第三方父包做未经验证的兼容承诺；Electron 是桌面应用运行时本体，升级后要做桌面端整包验证 | 一并跨大版本（否决，理由同左）；取范围内最新版（否决：没有必要的行为漂移，且会引入刚发布的版本） |
| D3 | 覆盖项写在根 `package.json`，不改各工作区的钉版 | 单一一处可审、可退役；沿用上游既有机制与位置 | 逐个改工作区 `package.json` 的版本声明（否决：分散在 6 个文件，且上游精确钉版的意图被改写） |
| D4 | `ensure` 以锁文件指纹判就绪；补装失败时有目录则继续 | 可用性优先：离线时引擎仍能带着现有依赖启动；指纹不写，下次启动自动重试 | 补装失败一律退出（否决：离线用户引擎起不来，比带着旧依赖运行更糟）；维持只看目录（否决：修复对已有安装永不生效） |
| D5 | 安装命令改为冻结模式 | 锁文件是事实源；非冻结安装会在清单与锁文件不一致时静默重新解析并改写 `vendor` 树 | 维持非冻结（否决：会把偏离悄悄写进基线树） |
| D6 | 把关白名单精确放行两个根文件 | 依赖解析的落点只有这两处；白名单沿用 `scripts/engineering-test-files.json` 的精确文件先例 | 放开到“根目录任意文件”（否决：边界退化到目录级） |
| D7 | 依赖漏洞扫描暂不进自动关口 | 审计要联网，结果随新通告发布变化，放进推送前会让无关提交变红，且需要一份“已接受的通告”清单；是否进、进哪一档属用户裁决 | 直接加进矩阵（否决：范围外的新机制，未经裁决） |

## 验证

- **审计**：`pnpm audit --prod`（官方源）刷新前 266 条（严重 3、高危 93、中危 137、低危 33），刷新后 13 条（严重 0、高危 5、中危 6、低危 2）。
- **为什么不用 `pnpm update`**：临时副本里两轮实验，单包 `pnpm update axios@1.20.0 --no-save --lockfile-only` 也连带 48 个包名、新增 50 个条目；覆盖项方案的两份锁文件差异只含目标包及其子依赖。
- **真实注入管线**：`npm run ensure-injected` 识别出尾部增量 1 条（013），结论 complete；注入态锁文件 sha256 前 16 位 `f6242ece96c4b68a`，与独立实验的结果一致，`package.json` 逐字节相同。
- **增量安装**：在克隆了旧依赖的树上执行 `pnpm install --frozen-lockfile --prefer-offline`，用时 32 秒，下载 79 个包、复用 266 个；抽查 19 个包的实际安装版本与覆盖项一致；安装没有改写锁文件。
- **Ycode 四条验证面**：见下方“Ycode 验证面”。
- **把关测试**：`zcode-patches-guard` 6 例、`zcode-engine-ensure` 8 例通过。变异探针——把注入态的两个文件退回基线后，新增用例当场失败并报“axios@1 未写入注入态 package.json”；重新应用补丁后恢复通过，锁文件摘要回到 `f6242ece96c4b68a`。

**Ycode 验证面。** 在修复分支的 worktree 里经回归矩阵执行（`node scripts/regression-matrix.mjs run --axis yc-typecheck --axis yc-test-eng --axis yc-db-schema --axis yc-lint`），四面全部通过，合计 427 秒：

| 测试面 | 结果 | 与刷新前对照 |
|---|---|---|
| 类型检查 | 通过，205 秒 | 刷新前 337 秒通过，同为 0 错误 |
| 工程测试 | 180 个文件通过、3 个跳过；1164 个用例通过、25 个跳过，216 秒 | 与刷新前逐项相同 |
| 库表结构检查 | 通过，3 秒 | 相同 |
| lint | 通过，3 秒 | 相同 |

刷新前的对照数字取自同一天在主干最终树上跑的全量档（树 `f16814ebf`，20 个测试面全部通过）。工程测试只覆盖注册在 `scripts/engineering-test-files.json` 里的 180 个文件，桌面的端到端用例与需要真实模型的用例不在其中——这是本轮验证的边界。

**开发依赖。** 不带 `--prod` 的同一审计在刷新后的树上报 77 条，其中 64 条属于开发依赖（构建与测试工具链），本批没有处理，见挂账 N35-12。

**引擎冒烟。** 在修复分支的 worktree 里按依赖闭包构建 `@zcode/server`（35 秒），用隔离的 `HOME`、`ZCODE_DATA_BASE_DIR`、凭据密钥文件与端口 3133 启动引擎：1.0 秒内监听，`/ws` 握手成功，设置文件落在隔离目录，随后停止。第一次冒烟失败，原因是新 worktree 里只有 `@zcode/server` 自己的产物、工作区依赖没有构建（`ERR_MODULE_NOT_FOUND`）；按闭包构建后通过，与依赖刷新无关。这只证明引擎能用新依赖启动并接受握手，没有发真实对话。

**发布清单。** 新增补丁后 `release:check` 当场报“活跃补丁数不符：清单=11 series 实际=12”；`RELEASE-MANIFEST.json` 的 `modules.ycode.activePatchCount` 改为 12 后通过。这是关口按设计拦截，不是缺陷。

**合并前档第一轮的失败与处置。** 14 个测试面里 4 个失败。两个（`release-check`、`merge-invariants`）与根 `vitest` 里的 3 个用例同源，都是上面这条补丁数失配。其余 9 个 `vitest` 用例与 `sim-gates` 是执行方式造成的：我把 `RUNTIME_DEPLOY_TARGET` 带在命令环境里（本意是不让前置的注入确认写宿主），子测试继承后，部署与注入相关的 9 个用例失败；同一时间后台在构建引擎，推演测试里一个文件加载超时（10 秒）。处置：去掉环境变量、等机器空闲后重跑。

**合并前档重跑。** 14 个测试面全部通过，合计 451 秒（去掉 `RUNTIME_DEPLOY_TARGET` 环境变量、等机器空闲后）。第一轮的 4 个失败已在上文定性：一个是补丁数失配（真问题，已修），三个是执行方式问题。

**合并前档（修复分支）**

| 测试面 | 结果 | 用时 |
|---|---|---|
| 根 vitest | 1242 文件通过、6 跳过；9944 用例通过、11 跳过、零失败 | 253 秒 |
| typecheck-harness | 通过 | 9 秒 |
| typecheck-client | 通过 | 41 秒 |
| build | 通过 | 23 秒 |
| bundle-budget | 通过 | 0 秒 |
| qgate | 通过 | 12 秒 |
| governance-budget | 通过 | 1 秒 |
| merge-invariants | 通过 | 0 秒 |
| sim-gates | 通过 | 72 秒 |
| py-runtime | 通过 | 16 秒 |
| py-team | 通过 | 1 秒 |
| yuan-registry | 通过 | 18 秒 |
| release-check | 通过 | 2 秒 |
| catalog-check | 通过 | 2 秒 |

## 设计文档影响

DESIGN_SYNC: touched。设计正本 6.4“实现边界与开放问题”表新增“Ycode 依赖安全刷新（2026-11-24）”一行，同批修订。
