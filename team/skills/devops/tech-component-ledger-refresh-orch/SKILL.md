---
name: tech-component-ledger-refresh-orch
description: "刷技术组件台账：全调研区组件线扫描→基线锚→上游实测→判级分档。"
version: 1.3.0
tags: [research, ledger, delta, upstream-tracking, orchestrator]
---

# 技术组件台账刷新（orchestrator 本域版）

> 本件承载「组件型台账差异比较」程序——调研对账的第三轴（另两轴：落地对账/内容重校正在
> default 的 `research-ledger-reconciliation`，读无边界写有边界，勿在此重述）。
> 三轴分工：落地对账管「产物→落地」、重校正管「内容真伪」、本件管「上游版本轴」。

## When to Use

- 用户要「技术组件台账」「补全历史所有差异比较」「更新到最新版」
- 上次调研过的 repo/CLI/框架要對上游版本增量（含派增量卡前约判级）

## 口径铁律

- **只收组件型调研线**：有版本轴的对象（本地 clone / 调研单元以仓库名命名 / 报告含 HEAD-commit-tag 锚）。方法论类（微信文/论文/无版本轴）不入组件表，其落地归单元对账。
- **「历史所有」= 全部调研区**：不止 `shared/research/`，含外置盘归档区（如 hermes-docker-sandbox/workspace/research）与 `~/workspace/research`。只盘一个目录=子集，方向错跑满一轮=白烧预算。旧基线台账本体常在外置盘，先 find 定位再开工。
- **3 个月退役线（用户裁决，长期有效）**：上游 `pushed_at` 距基准日 >90 天 → 保留历史轨迹、标 RETIRED、不再跟进。退役 ≠ 删除——调研报告/裁决矩阵/落地物原位保留，只停上游增量跟进（移出 🔴🟡 观察名单）。临线（75-89 天）标「观察至 +90 天日期」；在跑卡未收口的临线组件，卡收口后退役。复活条款：重跑时对 RETIRED 线仍查一次 pushed_at，复活即回观察名单按新增量重判级。

## Procedure（4 步）

1. **组件面扫描**：os.walk 全调研区（跳 .git/node_modules/.worktrees/.citation-cache）抓两信号——本地 clone（目录含 .git 或 README+LICENSE/pyproject/package.json）+ 调研单元名含 repo 关键词；再对全部 md 跑 `github.com/<o>/<r>` 正则汇总。正则直出数虚高一个量级（引用噪声），几百候选里真调研对象只有几十个——三层信号交叉后人工确认。
2. **基线锚提取**：逐组件从报告头部抓版本锚（HEAD <sha> / commit <sha> / tag / npm/PyPI 版本）。仓库名拿不准时从报告正文或卡 body 抓 github.com 正名，禁凭印象猜 owner——猜错仓 404 会把活仓误判死水。
3. **上游实测**（全部 gh api，5000/hr；禁裸 curl api.github.com，60/hr 一次批量就耗尽）：
   - `gh api repos/<o>/<r> --jq '{pushed_at,stargazers_count}'` + tags 批量拉
   - npm 包走 `dist-tags --json`（latest 可能落后 next/alpha 数个 rc，只看 latest 漏增量）
   - PyPI 走 `/pypi/<pkg>/json`
   - 活跃度：`commits?since=<基线次日>——per_page=100 返回 100 是封顶值，写「≥N」不写精确值`
   - 精确总数（delta 报告验收要求时）：`gh api repos/<o>/<r>/compare/<基线sha>...HEAD --jq .ahead_by`；上游 CHANGELOG 不可作增量唯一源——多数仓发版才 backfill，增量判定以 compare/commits API 为准
   - git 快照型基线：`git fetch origin <branch> && git rev-list --count HEAD..origin/<branch>` 零成本出落后数
4. **判级与落盘**：🔴 大增量（>20 commits 或跨 minor）→ 派增量调研卡；🟡 轻跟 → 合观察卡；🟢 零增量/死水/已裁决退役 → 完结。表四栏：基线/上游现况/差异判读/处置。🔴🟡 判级即派卡依据，放行前交用户裁决。派增量卡验收冻结五件：精确 commit 总数（compare API 非封顶）、主题聚类表、基线过期结论清单（逐条引基线报告原节）、吸收建议三档（必吸收/可选/不吸收）、关键论断带 sha/tag 锚点 + 落盘路径写死。

## 产物契约

- 台账落 `shared/research/<主题>-ledger-<date>/` 目录（专题目录，勿散在 research 顶层）
- **终态 = 单文件**（2026-10-28 用户裁决整合）：`tech-components-ledger.md` 一件统管（维护契约+判级汇总+分域总表+能力差异明细+欠账登记+验证锚+勘误+变更日志）。历史三件套（主索引/动作验收卷/历史差异卷）已归档同目录 `archive/`，不再生成
- 退役登记两处落位：终态文件判级汇总节列 RETIRED 名单（组件/末次 push/静默天数/处置），分域表对应行内加 `→ RETIRED <日期>` 后缀
- 勘误纪律：整合/重跑时发现的判级矛盾、幽灵条目记入「整合勘误」节，不静默改
- 每行差异判读必须本日实测锚（gh api/npm/pypi 输出），禁记忆引用
- 半衰期：随单元对账季度重跑；点名「组件台账」时增量重查 🔴🟡 两档（🟢 死水线与 RETIRED 线各查一次 pushed_at 即可判是否复活；🔴 观察面附带派卡优先级排序——本机常驻 runtime 依赖的组件排最前）

## Pitfalls

- **产物异位回收**：建卡即被误派 worker 的话，worker 可能把台账文件从专题目录挪到 research/ 顶层——回收时先 ls 全目录定位再归并，md5 对上原指纹才认；按「专题目录缺文件」误报丢失后重写会造双事实源。
- **外置盘与 shared 副本不同步**：同名调研目录在外置盘与 shared/research 内容可能不同步，增量调研以 shared/research 为准。
- **api.github.com 限流**：批量查上游必须 gh api（认证 5000/hr）；裸 curl 60/hr，30 仓一次批量就耗尽。
- **整合/合并台账必须机械对账收尾**：脚本提取源件与终态件的行集（首列组件名归一化）做差集——人工通读合并必漏行；合并行/归并索引行（一行列多组件）逐项展开核对。漏行与判级矛盾记入勘误节，不静默改。
- **相近仓库名混记**：两条依赖线可能共用一个俗称（`<o>/agent-skills` 与 `<o>/skills` 可以是两家）。写基线行前 `gh api repos/<o>/<r>` 验证存在性，404 即混记信号；「某产物依赖此线」的表述对产物 upstream 字段核实，勿转述任务卡。
- **挂起条件即时落位**：表内条件行（如「卡收口后退役」「观察至 <日期>」）在触发事件发生当天改写对应行——已满足未执行的条件行会在下一轮机械抽查被抓。
