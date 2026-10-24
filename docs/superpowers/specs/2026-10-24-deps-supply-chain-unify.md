# 供应链统一治理轮：上游锚点回仓、registry 统一、team 层钉版收敛

日期：2026-10-24 ｜ 分支：fix/deps-supply-chain-unify ｜ 任务：依赖审计（同日上半天盘点）8 项不规范点全部治理并统一口径。

## 变更

| # | 不规范点 | 处置 |
|---|---|---|
| 1 | symbol-grounding 门禁 depsFile 指向仓外 gitignored 的 `../upstream/hermes-studio/package.json`（join(workspace) 解析后实为不存在的路径，门禁跑起来会 error） | depsFile 改指仓内 `vendor/hermes-studio/package.json`（注入态清单），架构注释同步 vendor 化 |
| 2 | overlay 依赖的 manifest 入册（补丁 017/080/103/136/137/138/573）从未同步进 vendor package-lock.json——matrix-js-sdk/lunar-typescript/cron-parser/pg/proper-lockfile 零锁条目、@playwright/test 锁在 1.60.0 而注入态 manifest 要 ^1.63.0，`npm ci` 必炸；另 upstream/hermes-studio 缓存树被手改出同样的依赖行（影子双源） | 新增补丁 687（纯锁收口）：以注入态 manifest 为源 `npm install --package-lock-only` 重生成一致锁；upstream/hermes-studio 缓存树还原 pristine。审计勘误：早前「vendor 清单未声明」系读了 main 主检出陈旧注入态（其 vendor 工作树仅含 017 行差），注入态清单经 worktree 全量重放核实一直完备 |
| 3 | 锁文件 registry 分裂：simharness/custom-qgate/wechat-search 三锁全锚 npmmirror，vendor 树全锚 npmjs，仓内无口径声明 | 根新增 `.npmrc`（registry=npmjs.org）；三锁 resolved 域名重写 npmjs.org（integrity 不变，同源镜像同包） |
| 4 | 根 package-lock.json 空壳且 name=hermes-overlay ≠ aistudio | 删除重生成（`npm install --package-lock-only`），name=aistudio |
| 5 | team 层宽松：requirements.txt `hermes-agent[all]>=0.20.0` 落后钉版；requirements-tools.txt 62 包裸名零约束；wechat-extractor 缺锁且依赖已弃用的 request-promise；archify 缺锁；ui-tui 离线快照落后 vendor 基线 | requirements 收敛 `>=0.22.4,<0.23`（对齐 VENDOR.md）；tools 文件分层重构（4 个宿主 venv 实测 == 钉版 + 58 个显式参考区，立法禁新增裸名）；extractor 以内建 fetch 重写弃用依赖并补锁；archify 补锁；ui-tui 快照对齐 nanostores 1.4.2/undici 6.29.0 |
| 6 | vendor/zcode npm+pnpm 双锁并存 | 定性为上游自带形态（upstream/zcode 同文件 53.8K 逐字一致），不删；VENDOR.md 立档说明构建只走 pnpm |
| 7 | swarm-yuan：README License 链接悬空（根/skills/ 无 LICENSE 实体）；dist 无 ignore；~/.zcode 已装副本落后 12 提交带脏残留 | 以 legacy 归档仓 LICENSE 实体（Apache-2.0）入库 skills/swarm-yuan/LICENSE，README 勘误为 Apache-2.0 并修链接；swarm-yuan 与根两级 .gitignore 补 dist；已装副本重装清残留（收口后执行） |
| 8 | CLAUDE.md（gitignored 本地文件）仍写 hermes-agent v0.22.2 | 本地改 v0.22.4 对齐台账（不入提交——该文件按 .gitignore 不入库） |

## 决策记录

- **D1 depsFile 锚 vendor 注入态**：depsFile 指认的清单必须（a）在版本控制内可复现、（b）反映构建实际解析的依赖面。vendor/hermes-studio/package.json 注入态（补丁后）同时满足两者；pristine 态缺 overlay 依赖属预期（gate 于 dev/CI 场景运行，predev/prebuild 的 ensure-injected 保证注入态存在）。原 `../upstream/...` 路径经 ops.ts `join(workspace, depsFile)` 解析后指向仓外不存在路径，门禁从未真正生效。
- **D2 补丁 687 定性为纯锁收口**：manifest 声明早已由 017/080/103/136/137/138/573 七补丁在各时期入册，缺口只在锁——vendor package-lock.json 是 pristine 基线件、从未随 manifest 补丁重生成，npm ci 一致性检查必失败。锁重生成以注入态 manifest 为源，新锁条目与物理安装对齐（echarts 6.1.0 / lunar-typescript 1.8.6 / cron-parser 5.10.2 / pg 8.23.1 / proper-lockfile 4.1.2 / matrix-js-sdk 41.9.0 / @playwright/test 1.63.0）。
- **D3 registry 统一取 npmjs.org**：vendor 三树锁已全锚官方源，反向统一（改 vendor 锁去镜像）既动基线又引入镜像信任；npmmirror 锁的 integrity 与官方源同包一致，域名重写安全。
- **D4 tools 参考区不造假钉版**：宿主 venv 实测仅 4/62 已安装；对未安装的 58 个凭 PyPI 最新版编造 == 属无锚点断言，改为显式「参考区 + 装时回填」立法。
- **D5 LICENSE 以实体文件为准**：legacy 仓 LICENSE=Apache-2.0 而 README 徽章写 MIT（历史矛盾随迁移带入）；以法律实体文件为准入册，README 勘误为 Apache-2.0。若著作权人（用户）意图 MIT，属重新授权决定，须另行明示。
- **D6 zcode 双锁保留**：删除 vendor 内上游自带文件=基线漂移；构建链（zcode-engine.mjs）只消费 pnpm 锁，npm 侧为无害历史残留，VENDOR.md 立档即可。
- **D7 CLAUDE.md 属本地文件**：.gitignore 显式忽略，修正不产生提交。
- **D8 根目录禁跑 `npm ci`**：借用架构下根 node_modules 是指向 vendor/hermes-studio/node_modules 的符号链，根 manifest 零依赖、清装通道在 vendor/hermes-studio（VENDOR.md 既定）；根锁仅作 manifest 镜像（name=aistudio），真跑根 npm ci 会沿符号链清空共享安装树。

## 验证

- 补丁 687 重放：worktree 内 `npm run clean` 反向复原 pristine（0 行差异）→ `npm run inject` 全量重放成功，vendor 注入态 manifest 含全部新增依赖。
- 锁一致性：`npm ci --dry-run`（vendor/hermes-studio）通过；三份重写锁与根锁 JSON 解析通过。
- 定向测试：`npx vitest run custom/qgate`（depsFile 消费方）绿；全量 `npm test` 结果见交付说明。
- skill 重装：`~/.zcode/skills/swarm-yuan` 的 `.swarm-yuan-version` 刷新至本仓源、zcode-plugin 目录恢复、旧布局残留清除（收口后验证）。
