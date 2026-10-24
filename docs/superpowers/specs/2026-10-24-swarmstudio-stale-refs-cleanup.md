# 全面清理 SwarmStudio 过期描述（单仓整合与主名切 AIStudio 的遗留）

日期：2026-10-24　分支：docs/swarmstudio-stale-refs-cleanup　类型：docs（含少量注释/元数据）

## 背景

两轮裁定改变了项目的名实关系，但只更新了门面（README/intro.html/gh about），仓内仍残留旧表述：

1. **单仓整合**（2026-10-24，spec `2026-10-24-aistudio-single-repo-integration.md`）：ncwk 多仓（overlay 产品仓 + 外置 upstream/ + simharness 独立仓）整合为单一 AIStudio 仓，上游基线入 `vendor/`。
2. **主名切 AIStudio**（2026-10-24，spec `2026-10-24-intro-interactive-page.md` 二批决策）：AIStudio 仓 ⊃ SwarmStudio 体系/产品面。介绍页主名已切、README 层级已正确。

## 判定标准（什么是「过期」）

- **过期、须清理**：把仓库/项目本身称作 SwarmStudio 或描述已消失的多仓布局（overlay 仓、`../overlay` 链接、`cd overlay`、`../upstream/` clone 步骤、「独立仓」自述）的活文档与代码注释。
- **合法、保留**：SwarmStudio 作为产品应用/体系名的用法（应用标题、`com.swarmstudio.*` 协议事件、patches 品牌补丁、RELEASE-NOTES 产品版本行、`SwarmStudio.app` 路径、设计文档正本标题《SwarmStudio 完整设计文档》等）。
- **历史、不改写**：带日期的 specs/plans/notes/报告/发布记录（决策事实源，历史归 git）；`skills/swarm-yuan/docs/design-evolution.md`（自声明「施工档案——过程记录，非定稿」）。

## 变更

| # | 文件 | 改动 |
|---|---|---|
| 1 | `README.md` | 删除宣传稿死链行（文件已随整合移入 gitignored `archive/`，链接失效）；「一页看懂 SwarmStudio」改为「一页看懂 AIStudio 与 SwarmStudio 体系」（与介绍页主名一致） |
| 2 | `docs/USAGE.md` | §1.1/§1.2/§4/§5 从旧多仓布局（clone 三上游到 `../upstream/`、`cd overlay`、`scripts/serve-server.sh`、`upstream/` 产物路径）改为镜像 README 的 vendor 单仓四步（`npm run inject` → `vendor/hermes-studio` 装依赖 → `npm run serve` → `npm run dev`）；启动命令合一到 `npm run serve` 正本 |
| 3 | `docs/windows-x64-setup.md` | 头注追加「撰写于多仓布局时期，单仓整合后未重验」声明（正文为 2026-09-22 实测记录，不重写、不虚构单仓流程） |
| 4 | `simharness/README.md` | 「与 overlay 的关系」段改为单仓事实（原独立仓 2026-10-24 并入，产品本体=本仓 custom/patches 注入 vendor 基线）；`../overlay/docs/...` 断链×2 与「对账正本=overlay/docs/...」「overlay 仓《…》」改为仓内 `../docs/superpowers/specs/...` 实路径 |
| 5 | `simharness/package.json` | description「独立仓（与 SwarmStudio 产品仓隔离）」→「AIStudio 单仓内目录（原独立仓）」；「回退借道 overlay」→「回退借道产品树」 |
| 6 | `runtime/README.md` | 标题「(overlay/runtime)」→「（runtime/）」；「升级只更新 overlay 一处」→「升级只更新本仓 runtime 一处」 |
| 7 | `runtime/clef/README.md` | `bash overlay/runtime/clef/...` ×3 → `bash runtime/clef/...`（自仓根执行） |
| 8 | `runtime/plugins/studio-file-approval/plugin.yaml`、`runtime/plugins/style-charter/plugin.yaml` | `author: SwarmStudio overlay` → `author: AIStudio`（已核无补丁逐字节钉住该字段） |
| 9 | `runtime/tools/efficiency_ledger.py` | 注释「overlay server reads」→「custom server reads」 |
| 10 | `custom/server/cua/broker.ts` | 头注释路径戳 `overlay/custom/...` 与「overlay 补丁源码（upstream/zcode …）」→ 仓内实况（`vendor/zcode` + `zcode-patches/003`） |
| 11 | `skills/swarm-yuan/docs/usage-manual.md` | 「落地示例（SwarmStudio overlay 项目）」特征卡更新为 AIStudio 单仓实况（可改本仓 custom/patches 等、只读 vendor/ 钉版基线） |
| 12 | `.swarm-yuan/notes/{feature-cards,explore-structure,explore-conventions,explore-codeorg}.md` | 四份 2026-10-16 探查快照（自称仓库=`/Users/cuishi/lab/ncwk/overlay`）各加一行过期横幅：单仓整合后未重生成，数字与路径以仓内现状为准 |

不改清单（核过为合法用法或历史）：RELEASE-NOTES.md、release-notes-*.md、patches/**、`com.swarmstudio.*` 协议字面量、team/profiles 的 `SwarmStudio.app` 路径与产品叙述、`swarmstudio.style-charter` 插件命名空间、`docs/superpowers/specs/**` 全部带日期正本、design-evolution.md、habits.md（机械生成快照自带时间戳）、decisions.jsonl（追加式日志）。

## 决策记录

1. **USAGE 启动步骤以 README「五分钟跑起来」为单一事实源镜像**，不另造命令序列；启动命令收敛到 `npm run serve`（serve-server.mjs），弃用 USAGE 私有的 `bash scripts/serve-server.sh` 变体。
2. **windows-x64-setup.md 只加声明不重写正文**：正文是 2026-09-22 Windows 实测记录，单仓布局下的 Windows 流程未实测，按「不虚构」红线不编写未验证步骤。
3. **.swarm-yuan/notes 用过期横幅而非改写**：四份快照是 swarm-yuan 技能机械探查产物（2026-10-16 轮），计数细节（359 补丁、v0.7.35 等）应由技能指纹感知重生成，手改会与生成机制打架；横幅如实标注过期即满足「fail-soft 不造假」。
4. **plugin.yaml author 字段核实无补丁耦合**（grep patches/ 无嵌入）后才改；`swarmstudio.style-charter` 命名空间保留（协议标识，非品牌叙述）。
5. **simharness/package.json「独立仓」表述改为历史说明**：隔离边界语义（本目录只消费产品、不改产品）保留，由 `tests/isolation-boundary.test.sh` 三断言继续看守，隔离主体从「仓对仓」变为「目录对产品树」。

## 验证（2026-10-24 实测）

- `gongwen-lint`：README.md 23 处/硬 11（与改动前持平，存量）；docs/USAGE.md 12 处/硬 6（改动前 13/6，净改善）；simharness/README.md 7 处/硬 5（与改动前持平；初版引入的句长/破折号已拆句消除）。
- `vitest run custom/server/cua/__tests__`：10 通过、2 跳过（gate.test.ts 平台门控）、0 失败。
- `python3 -m py_compile runtime/tools/efficiency_ledger.py` 通过；`simharness/package.json` JSON 解析通过。
- 链接实存核验全过：vendor/VENDOR.md、2026-10-05-mux-v8-fullflow-plan.md、2026-10-05-mux-history-and-engineering-archive.md、2026-10-18-fullflow-v844-workbench-refactor.md、docs/intro.html；README 宣传稿死链行已删除（grep 0 命中）。

## 未做 / 交接项

- `skills/swarm-yuan/docs/usage-manual.md` 落地示例已就地修正（该文件当前是未跟踪的整合在途内容，不在 origin/main，无法随本分支提交；随整合批入库）。
- `docs/windows-x64-setup.md` 正文保留多仓时期实测记录，仅加头注声明；单仓布局下的 Windows 流程未实测，不虚构。
