# R144 运行时刷新轮（2026-11-09）

> 触发：用户指令——更新 AIStudio 所有台账组件及 skills 到最新版（swarm-yuan 调研栈及依赖的第三方运行时组件与 skill 一并纳入不丢项）。第十轮同型例行轮（R124/R132/R140/R141/R142/R143 谱系），R143 后仅 2 天小窗，属点名刷新型（vendor studio v0.8.20 换血为主件，本档只记运行时面；换血与全仓台账批见 AIStudio 仓 spec `2026-11-09-runtime-deps-refresh.md`）。

## 一、移动面（22 行多通道查新，2026-11-09 实测：6 移动 / 16 零移动）

| 运行时 | R143 基线 | 远端最新 | 判定 |
|---|---|---|---|
| claude-mem | v15.11.0 | **v15.12.1**（15.11.1→15.12.0→15.12.1 三连发） | **移动**（15.12.1 两 critical：macOS 12 系统 SQLite 3.37 下 `RETURNING` 语句读法致 observations 每写必败「SQL logic error」改 `.all()` 读；CMEM Pro 登录自 15.11.0 起 OAuth 首步卡死（setup id 回显链接未接）；证据=`gh release view v15.12.1 -R thedotmack/claude-mem`） |
| ruflo | v3.72.2 | **v3.74.1** | **移动·供应链修复**（**3.74.0 tarball 携带 3.63.4 陈旧 `.claude/helpers` 且锁死该版本——3.74.1 从 main 重发且发布脚本拒绝 helpers 与 commit 不一致的发布**（#4900）；`@metaharness/darwin` 由 optional 转 regular 依赖（ADR-526），bench verify 与 gepa 四操作进程内调用缓存 darwin 模块、加载失败回退脚本；证据=`gh release view v3.74.1 -R ruvnet/ruflo`） |
| gstack | v1.96.0.0 tip 6666b729 | **v1.98.0.0 tip 350d4196**（tag 通道两连发） | **移动**（v1.97.0.0/v1.98.0.0 各一主题：v1.98 **opt-in `/autoplan` gate——管线跑完前按住会话**（GST-1666），与本仓 autoplan 技能先例同构；stable 通道随发；src-pins 随 tag 9100930 同步、tip 记档不追；证据=`gh release view v1.98.0.0 -R garrytan/gstack`） |
| graphify | v0.9.103 | **v0.9.104**（PyPI） | **移动**（0.9.104 正确性跟进版；npm 同名异源禁用不变——通道陷阱①） |
| impeccable | cli-v4.8.0 | **cli-v4.8.1** | **移动**（patch 跟进版） |
| semantica | main c0ec77be | **main 39cf7216**（tip 前进） | **移动（tip 记档）**（钉 v0.7.0 tag 口径不变——未发版不追 main 入库；技术台账同日点名：v0.7.0...main 已 252c、11-09 当日仍 push） |
| diagram-design | v2.6.142 | **v2.6.148**（物化刷新） | **移动·物化**（e57eda610→6a7f19fcc 12 提交：SKILL.md、references 五档（export/import-mermaid/layout-budget/type-dependency/type-scatter）、scripts 两件（export_svg/mermaid_extract）、assets arc-diagram 三示例新增；类型数 45 持平；五锚面同步——MANIFEST/facts/runtimes/capability-map/methodology+test-r122 基线断言 36/0/0） |

零移动 15 行（npm view/PyPI/git ls-remote 实测）：superpowers v7.0.2/ECC tag v2.2.3/dsh dsh-v0.2.2-rc.1（alpha.3 在 alpha 通道非 latest）/pua v3.5.1/pi v1.5.0/mattpocock-skills v1.3.2/claude-code 2.1.319/codex-cli rust-v0.167.0/openspec 1.16.1/comet 0.5.2/gsd-core 1.20.1/codex-security npm-v0.8.3/ocr 1.13.6；零移动特殊行：GitNexus 1.6.12（license-risk 不追）/codegraph 未接线。

本轮主题观察：**供应链一致性自锁**（ruflo 发布脚本拒绝 helpers 与 commit 不符的 tarball——「装到的不是看到过的」防线产品化）＋**小版本里的真致命**（claude-mem observations 每写必败属静默数据丢失面）＋**会话门控先例扩散**（gstack autoplan gate 与本仓 plan/autoplan 面同构）。

## 二、吸收

本轮 2 天小窗无机制层增量，**不设吸收档**（决策 46 两问：ruflo 供应链自锁为发布工程实现细节、gstack autoplan gate 与本仓既有 plan 门同构无新增量——均记同构不吸收）。

## 三、随批

- `assets/registry/runtimes.tsv` 6 行进位＋`docs/upstream-baseline.md` 重渲（registry-render --check 全绿 32 项）。
- `scripts/src-pins.conf` gstack SHA 随 tag 9100930 同步；superpowers/ECC 持平不动。
- `scripts/offline-manifest.conf` claude-mem 15.12.1/graphify 0.9.104 两行进位＋R144 复扫记档注释行；test-r118 对账随验。
- `runtime/diagram-design/` 物化刷新（rsync 上游 skills/diagram-design 全目录）＋五锚面同步。
- 宿主克隆面（~/lab/upstream/，仓外不入库）：本轮零紧急（claude-code/codex/dsh 基线持平）。
