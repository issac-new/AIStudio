---
name: research-ledger-reconciliation
version: 1.0.0
description: 历史调研记录全量对账与查缺补漏：五面证据扫描→分类→悬空清账→台账落盘，可增量重跑。
tags: [devops, research, governance, reconciliation]
when_to_use:
  - "历史调研/学习记录盘点"
  - "调研落地状态对账"
  - "查缺补漏"
---

# 调研记录全量对账（research-ledger-reconciliation）

> 来源：2026-09-24 用户裁决「重新盘点历史上所有调研学习记录，不要有漏」。首跑：orchestrator 会话，
> 204 单元全量分类 + 3 真悬空 + 2 类记录欠账清零，产物 research/history-research-ledger-20260925.md。

## 何时用

用户要求盘点/对账/查缺补漏历史调研（或任何「产物→落地」需要对账的资产面）时。
另有一类相邻任务——**重校正（recheck）**：模型换代或方法升级后，用户裁决「重新调研一遍校正一遍」，重读调研**内容真伪**而非落地状态。对账与重校正两轴正交，可先后跑。操作程序见本 skill「全量重校正」节。
**范围口径**：用户说「历史所有记录」「不要有漏」= 全量对账（全部调研单元+全部记录欠账）；只盘某一类台账（如 gap_register）是子集，不满足「全量」口径。方向错跑满一轮再重跑=白烧预算。
半衰期建议：**每季度一次**（或 research/ 单元数增长 >30% 时增量重跑）。

## 对账管线（五面证据法）

调研「单元」= research/ 顶层 md + 专题目录（去资产类）。每个单元采五面证据：

| 面 | 判据 | 命令 |
|---|---|---|
| ① 裁决正册 | 设计文档/台账/changelog/adjudication/delivery-summary 是否提及 | `grep <key> research/hermes-*.md research/gap-closure-ledger.md` |
| ② skills 落地 | 中央库 SKILL.md 是否引用/承载 | `grep -rl <key> ~/.hermes/skills --include=SKILL.md` |
| ③ SOUL/规则 | profile SOUL 或 _shared 规则是否有痕 | `grep -rl <key> ~/.hermes/profiles --include=SOUL.md` |
| ④ 看板 | t_ 前缀产物按卡终态判定 | `sqlite3 <db> "SELECT status FROM tasks WHERE id='<tid>'"` |
| ⑤ 报告自带 | 文内 ADOPT/落地/收口/REJECT 标记 | 读尾部「结论/建议」节 |

## 分类与处置（frozen 口径）

| 类 | 判据 | 处置 |
|---|---|---|
| A1 正册有记录 | 面①命中 | ✓ 闭环 |
| A2 落地存在缺裁决 | 面②/③命中但面①空 | **不重做**，docsync 补账（单元名+一句话裁决入 gap-closure-ledger） |
| B 自带标记 | 面⑤命中 | ✓ 抽验后闭环 |
| C 真悬空 | 五面全空**且**报告尾部有未兑现承诺 | 建轻卡逐项收口（≤30min/项） |
| D 资产类 | figures/缓存/repo/venv/raw | 豁免（非承诺） |
| E 看板产物 | t_ 前缀 | 以卡终态为准 |

**C 类精查纪律（防误报）**：初扫的 C 候选必须逐个开报告尾部读「给消费方的建议」节再定性——
首跑 8 候选中 5 个是误报（openhuman 自称落地经查 4 skill 实存；同族文件已被代表；SOUL 有痕）。
同族多文件（如 aipay-01..07）按家族归并为一个单元再判。

## 记录性欠账检查（单元之外）

- `skill-proposals/pending-decision/`：挂起 >2 周未裁决的提案逐个 ADOPT/REJECT/DEFER
- `gap_register` done 无 resolved_fix：违反台账纪律 §5.2 条3，CLI 补一句话 fix 或转 dropped
- 历史用户指令线：对照 hindsight 可溯指令清单核对「指令→产物」无丢失

## 产物契约

1. 台账 `research/history-research-ledger-<date>.md`（分类总表+悬空清单+处置路径）
2. 底账 JSON 三件（scan/full/suspects，可增量重跑对比）
3. C 类清账卡 + 记录欠账清账卡（每卡 frozen 验收标准）
4. A2 类不占卡——随夜间 docsync 补账

## 增量重跑

```bash
python3 /tmp/ledger_scan.py     # 首跑脚本模板（或从本 skill scripts/ 取）
# 对比上次 _ledger_full_*.json：新增单元→走五面分类；旧 C 类→查清账卡终态
```

## 全量重校正（recheck）：换模型/方法升级后重读内容真伪

对账管「落地状态」，重校正管「内容真伪」——两轴正交。触发：模型换代、用户裁决「重新调研一遍校正一遍」。

**派发前**：
1. 分线单元清单各落盘为独立文件，卡 body 引用绝对路径（不内嵌 body——长清单内嵌会被截断且不可增量维护）
2. 分类器两跑一致性校验：派卡前重跑分类并 diff 底账 JSON，计数漂移 = 分类器不稳定，先修再派（防「分类器编故事」）
3. 同 profile 并行扇出受 `max_in_progress_per_profile` 硬 cap：超 cap 的卡停在 ready 自动排队，dispatcher 60s tick 放行，不视为卡滞

**worker 契约（写进卡 body）**：
- 逐单元四栏判定 KEEP / CORRECT / FLAG / STALE，`RECHECK-LOG.md` **随做随写**（每单元一行判定 + 证据锚），`RECHECK-VERDICT.md` 收尾汇总四栏——LOG 增量落盘是超时零损失的保险
- FLAG 必带可独立复跑的命令锚（无锚 FLAG 不可验收）

**验收（每张 done 卡）**：
1. LOG 判定行数 ≥ 单元数（跨版本链补充行会多不会少）
2. VERDICT 四栏总和 = 单元数
3. FLAG 逐个独立复跑锚命令——误报与漏报都在这步现形；对自己复验「零命中」与 worker 报「N 处」矛盾时，先升级扫描深度再定性（见 worker-completion-independence-verification §S）
4. 跨线汇总必须归一 FLAG 口径：各线「附标 FLAG 计入 KEEP」与「纯 FLAG 单元」混见，总表注明口径并单列纯 FLAG 数，否则合计行两跑不可比

**判读经验**：质量过硬的调研存量重校正后 KEEP 率约八成、零编造引用是常态；实质错误集中在转述措辞层（杜撰标签/语义反转）与落地声明层（「已落盘」与实体不符），不在数据层——验收火力按此分配。

## 增量基线（2026-10-16 年度复盘 + 当日清账）

在 2026-09-25 基线上跑增量：新增 69 单元，底账 `_ledger_increment_20261016.json`。
分类 A1=36 / A2=7 / B=6 / C=0。A2 散失率从基线 34% 降到 10%——裁决正册制度生效的可量化证据。
基线欠账全清：C1（bluearmy 修复痕在报告 §30-46）、C2（pay TRACKER.md 三维度模型）、
C3（skill-miner SOUL 4b 步）均实测落地；t_8fb229ad（6 提案+33 无 fix）done。
复盘报告 `research/2026-annual-research-retrospective.md`（ste-lint 0 硬违规）。

**坑：消失卡判据**。清账卡 t_de25eba6 末态 blocked(needs_input) 后从全部板库消失
（二进制 grep 零命中），只剩 `~/.hermes/kanban/logs/<id>.log`。下次对账遇板库无卡
但 log 在的，按 log 末行「交接/阻塞已落定」判，勿按「查无此卡」误报 C 类。

**坑：清账先 grep 正册（10-16 实证）**。复盘首版把基线 31 项 A2 计入欠账，实际
`gap-closure-ledger.md` 的 `gap-20260925-a2-backfill` 节早已补录在册。净欠账从
误报 43 项修正为 9 项。同理，ledger 记「4 gap OPEN」中 101/102 实际已由卡
t_6b0cddf1 / t_b5ea5ec1 关闭。清账第一步 = grep 正册 + 查卡终态，不是直接列欠账清单。
增量 6 项 A2 已于当日补录 `gap-20261016-a2-backfill` 节。

## 重校正基线（2026-10-16，八线全量重读，换模型后）

在年度归线（250 单元、8 线）上重读内容真伪：KEEP 196 / CORRECT 23 / STALE 16，纯 FLAG 10 项。
无一处编造引用或虚构 URL——旧底子质量可验；实质错误集中在转述措辞层与「已落盘」声明层。
总报告 `research/recheck-20261016/MASTER-RECHECK-REPORT.md`，逐线 LOG+VERDICT 在
`research/recheck-20261016/<线>/`。批次纪律见上文「全量重校正」节。

## 首跑基线（2026-09-25）

204 单元：A1=125 / A2=31 / B=26 / C=3 / D=6 / E=7 / REJECT=4；指令线 12 条全覆盖零丢失。
C1 bluearmy 过门 / C2 aipay pay 域沉淀 / C3 skill-miner 检索扩权 → 卡 t_de25eba6（10-16 复验全清）；
6 提案+33 无 fix → 卡 t_8fb229ad（done）。

## Pitfalls

- **范围歧义先行**：用户说「不要漏」或「所有」时，按全量口径（全单元面+全欠账面）开工，子集盘点只能是全量的报告切片——方向错跑满一轮再重跑=白烧预算
- **初扫必多报**：关键词 grep 的 C 候选约 60% 是误报，必须人读报告尾部再定性
- **行号漂移**：引用旧报告的 file:line 修复项时先 grep 内容重定位（8 月报告的行号到 9 月已漂移）
- **家族归并**：同前缀系列文件（aipay-01..07）不归并会把 1 个单元数成 7 个欠账
- **资产豁免防漏判**：figures/templates/repo 目录不是承诺，但若含 ADJUDICATION 类文件需移出豁免
- **跨线 FLAG 口径必归一**：各 worker 自报四栏（KEEP/CORRECT/FLAG/STALE）时存在「附标 FLAG 计入 KEEP」与「纯 FLAG 单元」混见，跨线汇总必须单列纯 FLAG 数 + 注明口径，否则两跑合计行不可比
- **自验「0 命中」与 worker 报「N 处」矛盾时升级扫描深度**：浅扫（两层 glob、关键字 grep）易漏深层结构（如嵌套子目录的 per-profile 软链），先升级深度再定性，勿以浅扫结论驳 worker（10-16 集群自审线 FLAG① 实证：浅 0 断链，深 48 断链）
- **超时通知先还原事件流**：`max_runtime=0s` 字面易读成 wall-clock 超时，实际可能是轮次预算耗尽。回查 events 表（iteration_budget_exhausted / API 超时 / SIGINT 退出码）才能定性根因——根因决定「重派续作」vs「换通道」vs「改任务结构」
- **软链清理双口径复扫**：跨 profile 软链悬空清理时，glob 与 unlink 存在竞态（报 ENOENT 重复计数），以双口径复扫残留（glob + os.walk 交叉验证）为权威判据；删前清单必落盘含原 target
- **「按建议执行」= P1/P2 全批后等裁决**（用户口径）：批量建议呈现时不要自作主张分批执行，单条说「按建议执行」时按建议序号全做（1A+2A+...），不必逐条二次确认
- **双裁决收敛以「在盘核验」定唯一口径**：同一源文档出现两份结论相反的裁决时，不比对文字优劣，逐项核验双方落点是否在盘——落点全在的一方为唯一口径，另一方头部加显式「历史草稿」注释（含源指纹 sha256 对照+落点核验结论）。0 在盘的裁决=从未真正落地，无论文字多完整
- **「幽灵承诺」重建前先全盘找本体**：报告称「已落盘」但 0 实体时，先在 archive/research 旧报告目录找原始素材本体（原始编号清单往往完整躺在归档 md 里），用本体重建比凭报告摘要二手重建保真；同时扫各 profile 侧技能目录——主库丢失的实体常以 profile 物理副本形态幸存（搜索只查中央库会误判「全丢」）
- **「软着陆」优先于「删除」**：修悬空引用时若被引内容本身是好纪律（如错误自愈循环），改写为「纪律在此行承载，无独立 skill」，保留能力、只去掉假路径——不把能力跟着幽灵路径一起删
