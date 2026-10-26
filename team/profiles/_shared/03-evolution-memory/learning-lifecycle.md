# learnings 置信度生命周期协议（learning-lifecycle）

> 版本：v1.0（2026-10-18）
> 来源：Tencent/teamai-cli v0.27.0 maintenance 模块（`src/maintenance/confidence.ts:21-40` + `promote.ts:26-29` + `prune.ts:25` + `hot-cold.ts:4-5`）
> 融合路径：增量调研报告 `workspace/research/teamai-cli-v0.27-delta-report.md` §2.1 + §三 G1 → 任务 t_69039aaa（用户裁决「都做」G1）
> **语境转译声明（协议头部，禁删）**：teamai-cli 由投票流（upvote/recall 事件）驱动置信度与晋升。**Hermes 无投票流**，等价物 = recall 命中引用（`hindsight_recall` 命中该条记忆的次数）+ 人工确认（用户/审阅者明确肯定）。**终审晋升必须人拍板**——与 structure-evolution-rollback 的候选重测闸 R2 同构（提案落地后必须用提案自身声称的验证方式重测原问题，"提案写得很对"不构成免测理由）。禁照抄投票基础设施，机制靠纪律执行。

---

## 一、定位：管「经验转正」，不管「要不要沉淀」

分工边界（与 friction-signal-capture.md 的关系）：

| 协议 | 回答的问题 | 判据 |
|---|---|---|
| friction-signal-capture.md | 这个任务**要不要触发**反思沉淀 | 4 摩擦信号计分 ≥20 且 toolCount ≥15 |
| 本协议 | 沉淀后的经验**何时转正/归档/降权** | confidence 公式 + 四门槛 + <0.15 归档线 |

friction 触发的是「候选经验」的入库（hindsight_retain + redact，走 memory-governance §2 写侧门），本协议管入库后那条经验的生命周期。两协议只通过 hindsight 记忆条目衔接，不新建存储。

## 二、confidence 公式（数字照源码，禁调参）

源码锚点 `src/maintenance/confidence.ts:21-40`：

```
base     = min(1.0, recalled × 0.1 + upvoted × 0.3)
recency  = max(0, 1 - daysSinceLastRecall / 180)     # 180 天线性半衰
ratio    = upvoted / max(1, recalled)
confidence = base × 0.4 + recency × 0.3 + ratio × 0.3
```

- `recalled` = recall 命中引用次数（Hermes 等价物，见头部声明）
- `upvoted` = 人工确认次数（用户/审阅者明确肯定）
- `lastRecalledAt` 缺失时 `daysSinceRecall` 取 180（recency 归零），从未被召回的经验不因新而加分。
- 回写 frontmatter 仅当变化 >0.05（源码 `confidence.ts:115`）；Hermes 侧无自动回写，只作盘点时的对账纪律。

### Hermes 侧等价物映射表

| teamai-cli 概念 | 源码形态 | Hermes 等价物 | 记录方式 |
|---|---|---|---|
| recalled（召回计数） | votes 文件 `recalled_count` 逐事件累计 | `hindsight_recall` 命中该条记忆的次数 | 无自动计数；盘点时对 recall 结果与审计日志（memory-governance §6）人工核对 |
| upvoted（投票计数） | upvote 事件逐次累计 | 人工确认次数：用户/审阅者对「这条经验有效」的明确肯定（采纳引用、明确背书；沉默不算） | 确认发生时记入该记忆 context 或案例库备注，盘点时累计 |
| users（独立投票人） | 每用户一个 votes 文件 | 独立确认人数：不同用户/不同审阅者各算 1 人 | 同上，注明确认人身份 |
| lastRecalledAt | 最近一次 recall 事件时间戳 | 该记忆最近一次被 recall 命中的时间 | 盘点时从审计日志/会话记录核对 |
| confidence 回写 | frontmatter `confidence` 字段，变化 >0.05 才写 | 无自动回写；作为盘点对账纪律（当前值 vs 重算值） | 季度巡检（memory-governance §7）时人工评估 |

## 三、promote 四门槛与晋升改写纪律（阈值照源码，禁调参）

源码锚点 `src/maintenance/promote.ts:26-29`：

| 门槛 | 阈值 | 源码常量 | Hermes 侧判据 |
|---|---|---|---|
| 置信度 | ≥ 0.90 | MIN_CONFIDENCE | §二 公式重算值 |
| 人工确认次数 | ≥ 5 | MIN_UPVOTED | 累计明确肯定 ≥5 次 |
| 独立确认人 | ≥ 2 | MIN_USERS | ≥2 个不同确认人（单人重复确认只算 1 人） |
| 库龄 | ≥ 14 天 | MIN_AGE_DAYS | 入库满 14 天（防一时热度） |

四门槛全过只是「具备候选资格」，**终审必须人拍板**：晋升=写入 SOUL/规则/skill 的固化动作，由用户或审阅者明确批准后执行（与候选重测闸 R2 同构，见头部声明）。Hermes 不建自动 promote，晋升窗口=季度巡检与专项盘点，由人执行。

晋升改写纪律（去时间性）——「经验条目」改写为「正式知识」时：

1. 删日期与时间锚：「2026-10-18 发现」→ 删（时间进 frontmatter，不进正文规则）。
2. 删人名与任务号：「t_xxx 里踩的坑」→ 删任务号，保留坑的模式本身。
3. 删一次性事件细节：特定路径、特定报错现场 → 泛化为可复现判据（触发条件 + 处置命令）。
4. 保留可复用内核：阈值、命令、判据、反例。与 memory-governance §8 一致——无证据锚的教训不得固化；有证据锚的晋升时也把「证据现场」留在原条目，正式知识只携带结论与判据。

## 四、归档线：<0.15 软归档，非删除

源码锚点 `src/maintenance/prune.ts:25-27`（DEFAULT_THRESHOLD=0.15, STALE_DAYS=180）：

1. **置信度线**：confidence < 0.15 → 归档候选。
2. **休眠线**：入库超 180 天（源码判 `daysSinceCreate`，即 frontmatter `date` 创建日距今，非最近活动）且 confidence < 0.3 → 归档候选（源码 `daysSinceCreate > STALE_DAYS && confidence < 0.3`，`prune.ts:67`）。

Hermes 侧执行纪律：

- 归档动作=memory-governance §4 阶梯的「归档」级：`PATCH /v1/default/banks/{bank}/memories/{id}` 置 `state=invalidated`（软退役，可逆，reason 必填），等价源码 `archive=true` 拷入 `_archive` 的语义。**禁物理删除**。
- 无 recall/确认数据的条目**跳过**（源码 `confidence === undefined continue`）：新入库未被盘点过的经验不误伤。
- 归档候选按置信度升序处理（源码排序语义），一次盘点批量处置，逐条留 reason。

## 五、hot/cold 检索降权提示（0.5 / 0.3）

源码锚点 `src/maintenance/hot-cold.ts:4-5`（HOT_THRESHOLD=0.5, COLD_PENALTY=0.3）：

- confidence ≥ 0.5 → hot（检索权重 1.0，正常引用）。
- confidence < 0.5 → cold（检索权重 0.3，降权提示）。
- 无 confidence 数据 → 中性 1.0（源码注释 "No data = new doc (neutral)"——新条目不降权，防未盘点经验被埋）。

Hermes 侧转译：hindsight 检索无 hotness 字段，**不改 hindsight 配置**。纪律=recall 结果引用前的核对义务：对已知 confidence < 0.5 的经验条目，引用时标注「低置信（未复验）」，只作线索不作依据；据此采取处置动作前，先按该条目声称的验证方式复验一次。与 memory-governance §3 读侧门「批判-重构」三步衔接：cold 条目=三步中第 2 步（按当前环境改写）约束更强的输入。

## 六、接线与边界

- 上游：friction-signal-capture.md 管「要不要入库」（候选经验产生），本协议管「入库后何时转正/归档/降权」。两协议通过 hindsight 记忆条目衔接，不新建存储、不建投票设施、不建 cron。
- 盘点挂点：memory-governance §7 季度巡检四问扩展第五问「该转正的转正了吗」——按 §三 门槛筛查、按 §四 归档线处置。
- 明确排除（任务契约）：不建 cron/脚本；不改 hindsight 配置；不碰 SOUL；晋升与归档均为人工动作，本协议只提供判据。
- 修订：v1.0（2026-10-18）首次落地，源码锚点与阈值以 teamai-cli v0.27.0 为准；调参须回源码复核后升版，禁本轮内擅调。
