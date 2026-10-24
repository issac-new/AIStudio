# 并入项目知识汇编总纲（2026-10-24）

## 变更

ncwk 多仓整合为 AIStudio 单仓（2026-10-24）后，四个来源项目的 spec 设计文档、决策记录、历史会话与既有汇编散布仓内多处。本册收拢为**单一索引正本**：只做映射与对账，不复制正文（单一事实源不变）。

## 一、并入项目总账（源 → 落点）

| 来源项目 | 原载体 | 仓内落点 | git 历史去向 |
|---|---|---|---|
| ncwk / SwarmStudio 二开层 | `~/lab/ncwk`（overlay 体系） | 仓库根：`custom/` `patches/` `simharness/` `docs/` `registries/` | 原仓历史即本仓主干（目录改名继承）；NVMe 旧位与退役过程件已于 10-24 清除 |
| Swarm-yuan 技能 | `~/lab/Swarm-yuan` 独立仓 | `skills/swarm-yuan/`（六段目录 + docs 102 份轮档 + tests） | 全量归档 `archive/swarm-yuan-legacy`（.git + bundle）；GitHub 旧仓已转私有 |
| SwarmTeam 部署包 | issac-new/SwarmTeam | `team/`（profiles + skills + patches + shared） | GitHub 归档仓已转私有（保持 archived 态）；并入见 merge `39dfe92` 系列 |
| 上游基线 | ncwk/upstream | `vendor/`（hermes-studio v0.7.38 / hermes-agent v0.22.4 / zcode） | 台账 `vendor/VENDOR.md`；升级一律 `npm run vendor:sync` 显式通道 |
| simharness | ncwk/simharness | `simharness/`（mx-* 脚本/场景/守门测试） | 原仓史入本仓；SIM_ROOT 等运行态按设计在仓外 |

## 二、spec 设计文档索引

- `docs/superpowers/specs/`：324 份。域分布前列：cockpit 26、ide 17、swarmstudio 11、loop 10、swarm 8、aipaydev 8、eval 7、zcode/matrix/ia/fibo/harness/agent 各 6。专题索引正本＝`2026-10-21-swarmstudio-appendix-a-spec-index.md`。
- `simharness/specs/`：推演方案正本（V8.5x 系）与 run 档案（run21/run22 复盘、tri-node 等）。
- 附录族：A spec 索引（300 行）/ B plans-research（143）/ C 能力语料（191）/ D 教训规则（141）。

## 三、决策记录总账

- **Swarm-yuan**：`skills/swarm-yuan/docs/design-evolution.md`＝编号决策 1–56 正本（2,879 行）；轮档 102 份在同目录 `research/`，评审在 `reviews/`。
- **ncwk/SwarmStudio**：各 spec 内「决策记录」段＋数字台账 `2026-10-23-swarmstudio-design-ledger.md`；单仓整合决策 #1–#10 见 `2026-10-24-aistudio-single-repo-integration.md`。
- **team/**：`README_zh.md` + `MIGRATION-GUIDE.md` + `global_kanban_rules.md`（治理与部署约定）。
- **10-24 追加**：#11 敏感域清除与本汇编（本册「决策记录」段）。

## 四、历史会话对账（zcode 项目史）

2026-10-24 将 ncwk、Swarm-yuan 四个旧根的 zcode 状态全量并入本仓项目（机制与回滚见项目记忆 `zcode-project-session-migration-20261024`）：

| 现落点 | 会话数 |
|---|---|
| AIStudio 根（ncwk 主线/overlay/worktree） | 1,656 |
| skills/swarm-yuan（Swarm-yuan 双址 + HermesSwarm） | 574 |
| vendor/（upstream 基线工作） | 57 |
| simharness/ | 32 |
| 其他归并路径 | 25 |
| SIM 运行态（sim-mux 工作区，路径保留） | 16 |

入口：ZCode 桌面端 AIStudio 项目历史。任务/自动化/闲时任务同步并入（640 任务、3 自动化、127 闲时）。

## 五、汇编内容挂接

- 整合正本：`2026-10-23-swarmstudio-integrated-design.md`（八章，取代已退役拼接册）。
- 六卷全量：`skills/swarm-yuan/docs/design-compendium-full.md`（4,703 行）。
- 拼接册退役指针：`2026-10-23-ncwk-complete-design-compilation.md`（全文存于 git 史；注意敏感域清除重写后旧提交哈希已变，以重写后历史为准）。
- 手册（本轮新入仓）：`docs/manuals/AI协作标准手册.md`、`docs/manuals/个人语言规范与有效指令复盘报告.md`（原 hermes-docker-sandbox instruction-retrospective 正本）。

## 六、仓外材料清单（有意留外）

- `~/.hermes` 运行态与 profiles 分发源、`~/.hermes/knowledge`（184K，路由型知识库）。
- docker-sandbox 第三方调研仓（BossEyeCodeX、RD-Agent、TradingAgents 等开源克隆）。
- NVMe `_archive`：迁移回滚备份与敏感域清除前全量 bundle（**含已清除域字样**，观察期后建议清除）。
- SIM_ROOT 推演现场（家目录 18G，脚本默认值锚 `simharness/mux/*.sh`）与推演证据归档（NVMe 917M）。

## 决策记录

- D1（#11-a）汇编只做索引与映射，正文一律指向原正本，避免双源漂移。
- D2（#11-b）hermes 侧两件手册入 `docs/manuals/`；其语料 jsonl 与第三方调研仓不入（体量/版权）。
- D3（#11-c）已清除的两个业务域不在本册具名，防止敏感词回写入库。
- D4（#11-d）会话史以 zcode 库为准，本册只记对账数字，不复制会话内容。

## 验证

- 索引指向存在性：`ls docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md skills/swarm-yuan/docs/design-evolution.md simharness/specs docs/manuals` → 全部存在。
- 数字来源：`ls docs/superpowers/specs | wc -l`＝324；`sqlite3 …db.sqlite` 会话分布查询（见第四节表）。
- 敏感域零残留验证：路径/内容/消息三面 grep 计数为 0（重写后全 refs）。
