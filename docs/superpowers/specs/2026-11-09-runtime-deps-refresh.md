# 第三方组件及 skill 运行时台账刷新（2026-11-09）

> 用户指令：更新 AIStudio 的所有台账组件及 skills 到最新版；追加指令——swarm-yuan 调研栈及其依赖的第三方运行时组件与 skill 必须包含在台账内不丢项。覆盖面=vendor 三树＋swarm-yuan runtimes.tsv 22 行全量＋物化技能面＋技术组件台账点名触发（§一.2：🔴🟡 两档＋RETIRED 线 pushed_at 复核）。全量上游实测锚=2026-11-09（git ls-remote/npm view/PyPI/gh api compare；台账点名面子代理 26 点位零失败）。

## 变更

1. **hermes-studio 基线 v0.8.17（`35a7158a1`）→ v0.8.20（`cedaceaef`）**：上游 2026-11-07~09 连发 v0.8.18/v0.8.19/v0.8.20 三 tag，谱系前进 10 提交/84 文件（+3691/−458，主题=Person 会话置顶/Hermes 0.23 运行时兼容收尾/系统指令并入聊天信封/DSH 升级守卫与 Antigravity 配置/authORIZED providers 恢复/实时语音重放防护）。执行=upstream/hermes-studio 缓存树 checkout 新基线＋vendor 整树 git archive 换血（VENDOR_SYNC=1）＋clean+inject 补丁重放（失配处置明细见验证段）。
2. **swarm-yuan 调研栈 runtimes.tsv 查新（22 行全量，6 行移动进位）**：claude-mem 15.11.0→**15.12.1**、impeccable cli-v4.8.0→**cli-v4.8.1**、ruflo 3.72.2→**3.74.1**（npm）；graphify v0.9.103→**v0.9.104**（PyPI）；gstack v1.96.0.0→**v1.98.0.0**（tag 通道两连发；`scripts/src-pins.conf` gstack SHA 随新 tag 同步）；semantica main `c0ec77be`→`39cf7216`（source 线 tip 前进记档，钉 v0.7.0 tag 口径不变）。持平 13 行记档：superpowers v7.0.2/ECC v2.2.3/dsh dsh-v0.2.2-rc.1/pua v3.5.1/pi v1.5.0/mattpocock-skills v1.3.2/claude-code 2.1.319/codex-cli rust-v0.167.0/openspec 1.16.1/comet 0.5.2/gsd-core 1.20.1/codex-security npm-v0.8.3/ocr 1.13.6；零移动特殊行：GitNexus 1.6.12（license-risk 不追）、codegraph 未接线。物化面：mattpocock-skills v1.3.2 持平免动；diagram-design 无 tag 通道，按上游 HEAD（`6a7f19fcc`）物化核差异（有差异则刷新＋四处同步：MANIFEST/facts/test-r122/capability-map）。
3. **台账点名刷新执行（tech-components-ledger §一.2 触发，26 点位实测并入批注）**：🔴 3 条维持（semantica main 252c 未发版、OpenExecutive 已发 **v0.7.0 跨 minor**（210c，10-18/10-31 两轮 delta 版本表过期）、mattpocock v1.3.2 后仅 3c 欠账关闭）；判级建议升 🔴 2 条（better-harness 基线后 359c、pi-harness v1.5.0 跨 minor 634c）——**派卡与否交用户裁决，本批只记档不派**；RETIRED 6 线零复活（openagentontology 静默 94 天复核通过，11-07 判定执行记档）；x402 的 11-07「≈1497c 异常」挂账经 compare 复核**证伪**（真实口径 343c），挂账关闭；Graph-Engineering 正名锚定 `DEEP-JLU/Awesome-Graph-Engineering`（10-31 仓 404 欠账可销，基线 sha compare 404 增量不猜数留待下轮）；ACP/HexStrikeAI/Startlux 仓名正名勘误（agentic-commerce-protocol / 0x4m4 小写 / StartLuxLabs）随批记档；ATT&CK v20.1 仍为最新（无 v20.2），技能面主引用句 v20.0 文档刷新欠账维持。
4. **vendor 三树其余两面持平记档**：hermes-agent 最新稳定 tag 仍 v0.23.0（v0.23.0+canary.2026110x 流不追，稳定 tag 口径）；zcode origin/main 与钉版 `a9fe401e` 同 commit；exa-mcp-server 3.4.3=npm latest。
5. **伴生台账同步**：`vendor/VENDOR.md`（钉版表 studio 行＋11-09 批注记）、`README.md` 组件表、根 `AGENTS.md` vendor 表、`RELEASE-MANIFEST.json` vendorBaseline studio 串、`2026-10-23-swarmstudio-design-ledger.md` §C 基线行、`team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`（§二 11-09 批注）；swarm-yuan 侧：`docs/research/R144-runtime-refresh.md` 新档＋`docs/research/upstream-changelog.md` 增 R144 节＋`registry-render.sh --write-upstream-baseline` 重渲状态表块＋`scripts/offline-manifest.conf` 通道行追平＋R144 复扫记档注释。
6. 本批**不是发布轮**：台账进位不触发 GitHub/ModelScope 发布（2026-11-03 先例口径）；cockpit 版本行随 studio 底座换血进位 **0.8.20-studio.1**（扩展序归 1、包不重发，0.8.17-studio.1 先例口径）。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | studio 升 v0.8.20（三 tag 连发全吃） | 10 提交小增量 vs 上轮 53 提交；含 Hermes 0.23 运行时兼容收尾（#3712），与本仓 agent v0.23.0 钉版直接相关 | 只到 v0.8.19（否决：v0.8.20 为最新且含 prepare release 正身） |
| D2 | hermes-agent/zcode/exa 持平 | 实测：agent 无新稳定 tag（canary 流）；zcode main 同点；exa=npm latest | 追 canary（否决：回归窗口不可控，D2 稳定 tag 口径先例） |
| D3 | gstack 基线 tag 通道进 v1.98.0.0＋src-pins SHA 同步 | R143 D1 tag 通道口径延续；tip 前进记档不追 | 追 tip（否决：stable 通道语义） |
| D4 | better-harness/pi-harness 判级升档建议＋OpenExecutive v0.7.0 delta 重跑——只记档交用户裁决 | 台账契约 §一.4：判级即派卡依据，放行前交用户裁决 | 自行派卡（否决：越权） |
| D5 | semantica main tip 前进只记档 | 钉 v0.7.0 tag 口径（2026-11-03 D1 先例）；未发版不追 main | 追 main（否决：runtime 地雷风险实存） |
| D6 | 非发版轮；cockpit 版本行随底座换血归 0.8.20-studio.1（包不重发） | 2026-11-07 studio 换血批 0.8.17-studio.1 先例；ycode/yuan 持平不动 | 顺手发版（否决：发版轮独立窗口） |

以上落 `.swarm-yuan/decisions.jsonl`（合并时点）。

## 验证

（2026-11-09 实测回填定稿）

- **vendor 基线门**：vendor-sync 后 git status 84 files changed（+3691/−458）与上游 `git diff --stat v0.8.17..v0.8.20` **精确吻合**；VENDOR_SYNC=1 提交前 pristine 抽验 3/3（package.json/zh.ts/group-chat.ts md5 与 upstream HEAD 一致）。
- **补丁重放门**：首放发现 5 枚失配（042 版本行 0.8.17 上下文、329/690/718 prompt.ts browser guidance 行——上游 v0.8.20 将该行改为「Hermes native browser tools/browser_exec」新文案与品牌替换撞行、473 locale rebaseline 大补丁）→ 处置：042 版本行校准；329/690/718 以「上游新文案＋品牌词替换」语义重写 −/+/上下文行；**473 三方合并重生成**（base=v0.8.17 原文×ours=17+旧473×theirs=v0.8.20 原文，git merge-file 两文件零冲突，新补丁 +7106/−1030）；终态 **clean+inject 全量重放 status=complete、461/461 applied（453 studio+agent＋8 zcode）、零 WARN/零 FAILED/零 SKIP**，与上轮 v0.8.17 批 461 枚持平（零退役零新增）。
- **swarm-yuan 面**：`registry-render.sh --check` 32 项全绿（22 行↔runtimes.tsv/baseline 面积 5556B）；`self-check.sh --check-only` 自检通过；test-r118 离线对账 PASS（10 版本化清单行同步 0 豁免）；test-r122 36/0/0（物化五锚面随动）；doc-numbers 254/0。
- **release 面**：`npm run release:check` 四模块对账全绿（cockpit=0.8.20-studio.1/agent-teams=v0.23.0-team.2/ycode=3.17.2/yuan-skill=v2.100.2）；docs:check 手册投影块一致（docs:sync 两次重写随版本进位）；`npm run runtime:doctor` 硬检查 6 过 0 败；`npm run typecheck:harness` rc=0。
- **全量**：worktree `npm test` 终态——**1126 文件全过/6 skipped、8638 测试全过/11 skipped、零失败**（首跑 3 failed=新 spec 三处登记欠账 2 例＋设计索引冲突标记所致守门红 1 例，补登记并根治后复跑全绿）；并行通道伴生 1 个 vitest-worker RPC 超时 unhandled error（基建噪声非断言失败），`npx vitest run --no-file-parallelism` 串行复跑 **rc=0 零 error**（v1.0.13 批同型先例配方）。
- **存量缺陷顺手根治**：`docs/manuals/aistudio-design-document-index.md` 头部计数块**带未解决 merge 冲突标记**（main 4f10460bb v1.0.14 发布批 merge 遗留，两侧计数 611/605 均已过期）——本批按文件系统实测 613 份裁决重写并随批提交。
- **台账门**：docs-ssot-guard 7/7（附录 A 行/标题计数 604/并集覆盖全过）；scope.yaml 同批声明 10 行。

## 设计文档影响

DESIGN_SYNC: touched——`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md` §C hermes-studio 基线行 v0.8.17→v0.8.20＋核对行；`vendor/VENDOR.md` 钉版表＋批注；`team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md` §二 11-09 批注；A.1 三处登记（附录索引计数进位＋机械索引行＋design 索引两清单）；scope.yaml 同批声明。
