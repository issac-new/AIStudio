# 2026-11-12 双轨经验台账（TTSE 吸收）

> 来源：量子位《Agent自演进驶入"双轨时代"！openJiuwen RSI再升级，首发TTSE经验学习框架》＋论文
> TTSE: A Two-Track Online Self-Evolution Framework for LLM Agents（arXiv 2609.24289）。
> 现状缺口：本仓经验面三套（expcandidates/workbench/premiselog）均为单轨、追加制，无归因与矛盾合成；
> `custom/server/harness/primitives.ts:144` 自述「记忆四类型/作用域为纯域，无独立存储」「退役无留痕」。

## 变更

新建双轨经验域 `custom/server/expdual/`，把经验分成 FACT（环境事实，无动作无条件）与 TIP（条件式技巧，
必须是「在什么条件下：做什么」）两轨，两轨独立编号、独立证据计数、独立生命周期：

| 文件 | 职责 |
|---|---|
| `dual-types.ts` | 记录模式与论文常量（ADD +2 / AGREE +1 / EDIT +1 / REMOVE −1 或 −3；blame τ=1；每批 ≤4 操作、每规则 ≤1 操作） |
| `dual-classify.ts` | FACT/TIP 结构性初判（主语测试＋必要性代理信号）＋形态校验；拿不准默认 TIP |
| `dual-text.ts` | 分词/相似度/极性判定＋条件-动作句解析与规范化（TIP 正文唯一生成点） |
| `dual-prompts.ts` | 归因/归纳/合成的提示词契约（论文的语义半环）：输出 schema 固定，ops 回传引擎校验 |
| `dual-lifecycle.ts` | 四阶段确定性引擎：归因（Blame）→ 退役（Retire）→ 矛盾检测/合成（Contradict/Synthesize）→ 归纳（Induce，接受调用方起草的 EDIT/AGREE/REMOVE/ADD）＋批次快照 |
| `dual-store.ts` | JSON 台账（`EXP_DUAL_STORE` 可覆写；原子写；ENOENT 返回空库） |
| `dual-inject.ts` | 分通道 top-K 检索＋独立编号渲染（`EXP_DUAL_INJECT=1` 选通，默认关） |
| `dual-controller.ts` | `/api/expdual/*` 读写面（banks/retired/blames/blame/retire/induce/synthesize/chunk/classify） |
| `__tests__/*.test.ts` | 分类/计数/归因/退役/矛盾/合成/注入/存储/HTTP/提示词十组（43 断言） |

接线：

- `custom/server/kanban/column-dispatch.ts` 派单简报在既有经验行之后追加双轨块（一条真实消费者，
  避免本仓「pure/unwired 休眠域」前科）。
- `patches/767-server-expdual-routes.patch` 把路由注册进 `bootstrap/routes.ts`（沿 627 号先例）。
- `custom/server/expcandidates/scope-match.ts` 抽出作用域判定，exp-inject 与 expdual 共用一份口径。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | 新建独立域而非扩展 expcandidates/workbench | 候选抽取（从看板事件提三型候选）与经验演进（双轨生命周期）语义不同；塞进同一记录会让「候选」与「定理」混型。复用面保留：expcandidates 仍是候选来源，premiselog 仍是 FACT 的复核信号 |
| D2 | 分类用结构性初判且默认 TIP，不宣称语义准确 | 论文的两项测试里「必要性测试」（违反即失败）不可机检；本仓不造假，初判只做形态与主语代理信号，`rationale` 记录命中了哪条，存疑一律 TIP（防 FACT 污染） |
| D3 | 归纳由调用方起草 typed ops，引擎只做确定性校验与计数 | 论文的 Induce 是 LLM 读轨迹出操作；本仓没有常驻 LLM 调用面，且 DESIGN 4.8 已立法「AI 只起草，门禁和人工批准原样生效」。`dual-prompts.ts` 固定提示词契约与输出 schema，引擎校验 ≤4 操作/每规则 ≤1 操作/形态合法，拒绝项逐条返回 |
| D4 | 矛盾检测只产候选对，合成必须显式提交 | 「真矛盾」是语义判断，机检只能给「同条件不同动作／同动作相反极性」的结构证据；自动改写经验库会制造不可归因变更（R109-D8 同哲学） |
| D5 | 计数与阈值照论文原值，不另调参 | 论文表 10 与 τ=1 是可复现口径；本仓无实验数据支撑别的取值，改值即失去可比性 |
| D6 | 注入独立开关 `EXP_DUAL_INJECT` 默认关，K=3/通道 | 与既有 `EXPERIENCE_INJECT` 同纪律：不改变现网派单内容；渲染只带正文，不带 id/哈希/时刻（防被当作本轮实测凭据） |
| D7 | 路由走 patch 767 而非新增 gate/script/ledger | 机制预算 `gates=48/scripts=136/ledgers=6` 已紧；server 域模块不在计数类目（managedsettings 先例），路由注册是唯一必须的 vendor 触碰 |
| D8 | 台账存 JSON 而非 SQLite | 单机单写、规模 ≤ 数百条；与 expcandidates/premiselog 同存储形态，备份与审计简单；超规模再迁移，不在本批预支 |

## 验证

- `npx vitest run custom/server/expdual/__tests__ --config vitest.config.ts`：分类（命令式→TIP／陈述式→FACT／两难→TIP）、计数（ADD 2／AGREE+1／EDIT+1／REMOVE−1 存活、−3 删除）、操作上限（>4 拒、同规则两操作拒）、归因（同轨迹第二条拒、τ=1 退役并留原因＋批次）、矛盾检测（同条件异动作／相反极性命中、无关不误报）、合成（必须条件-动作、落库为 TIP、退役记录回指）、注入（独立编号、退役不注入、默认关、正文不含 id）、存储（原子写、坏文件不静默、重读一致）。
- `npm run typecheck:harness`（新模块已点名进清单）。
- `npm run inject` 重放 patches/767，`git apply` 链上应用成功（clean→inject 全量重放实测）。
- 全量 `npm test`（并行默认与 `--maxWorkers=4` 两轮）：1138 文件通过 / 8761 用例通过 / 11 跳过 /
  **0 失败**；两轮均伴随 1 个 `[vitest-worker] Timeout calling onTaskUpdate`（仓内既有 spec
  2026-11-06-design-doc-descaffold 与 2026-11-07-zcode-patches-pristine-replay 两次记录的同型
  负载 flake，不落任何用例），vitest 3.2.7 下退出码 1——不作为本批回归。
- 分片串行净绿（`--no-file-parallelism`，绕开上述 flake 的仓内配方）：`custom/server` 607 文件
  4795 用例 EXIT=0；`custom/__tests__`＋`custom/qgate`＋`scripts`＋desktop/plugin 兼容面 101 文件
  803 用例 EXIT=0。`custom/client` 单独串行集合耗时超出本工具单次 15 分钟窗口未跑完；该组在
  全量并行两轮中全部通过（无失败用例）。
- HTTP 级：`dual-controller.test.ts` 以真实 Koa 路由（临时端口）验证 `/api/expdual/*` 前缀、
  响应形状、400 拒绝码与写后读一致（5/5）。未起 8647 全服：auth 中间件在场，无凭证的 curl
  只能验证到 401，不证明路由存在。
- 注入：`dual-inject.test.ts` 验证 `EXP_DUAL_INJECT` 未设返回 0 行、设后两块各自独立编号、
  各封顶 3 条、渲染正文不含 id/计数。

## 任务卡

### 完成条件

FACT/TIP 双库可写可读；归因/退役/矛盾/归纳四阶段可执行且拒绝项带原因；派单注入在开关打开时
出现两块且默认关；目标测试、typecheck、注入重放全绿。

### 输入与来源

来源=量子位文章＋论文 arXiv 2609.24289；本仓现状=expcandidates（候选三型）/workbench（Experience
retired 状态）/premiselog（refutedBy/supersededBy）三套单轨记录＋`harness/primitives.ts:144` 缺口自述。

### 工作流边界

只动 `custom/server/expdual/`、`expcandidates/scope-match.ts`、`kanban/column-dispatch.ts`、patch 767
与四份文档登记；不动 vendor 基线内容、不改既有 `EXPERIENCE_INJECT` 语义、不新增 gate/script/ledger。

### 工具与副作用

写入 `<webui>/expdual/dual-store.json`（`EXP_DUAL_STORE` 可覆写，原子写）；派单简报增加两块文本
（仅 `EXP_DUAL_INJECT=1`）；无网络、无外部服务、无后台进程。

### 结果与证据

八个模块＋六份测试；`/api/expdual/*` 十一端点；43 断言全绿；typecheck 0 错；全量并行两轮
8761 用例 0 失败（伴 1 个既有 worker RPC flake）；分片串行 custom/server 4795 过/8 跳、
root/qgate/scripts 803 过，均 EXIT=0；patch 767 经 clean→inject 全量重放应用。

### 异常与恢复

存储损坏：注入侧 fail-soft 返回空块，写路径抛错不覆盖现场；规则误退役：retired 池保留正文/原因/
批次，可人工 ADD 重入；批次异常：快照 digest 可复算对账。

### 验收反例

FACT 携带条件/动作必须被拒；TIP 缺条件必须被拒；同一失败轨迹第二次归因必须被拒；未设
`EXP_DUAL_INJECT` 必须 0 行注入；注入正文不得含 id/计数/时刻。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §4.8「评测、记忆与经验回流」增补双轨经验台账一段（FACT/TIP 分离、四阶段、
  注入默认关、退役留痕），与实现同批落地。
- 同批登记：`docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`（A.1 行＋标题计数 628）；
  `docs/manuals/aistudio-design-document-index.md`（2026-11 分组 184）。后者顺带补登两份存量漏登
  （`2026-11-11-g4-principal-status-backfill`、`2026-11-11-userenv-escape-400-preauthz`）——属代登记：
  该守门测试在本批之前即为红（main 同态），本批按「存量债随批清偿」修齐，非本批引入。
