---
name: public-repo-release-orch
description: "增量发布公开仓：shape 归一分类增量+全树复扫+泄露闭环"
tags: [devops, github, publishing, privacy, release]
---

# 公开仓增量发布（orchestrator 本域副本）

> default 原件 `public-repo-release` 为发布全流程权威源（六步工作流+保密扫描模式清单）；本件只补**发布仓为长期 git 工作树时的增量发布路径**——原件未覆盖、本轮实证有效的机制。两处冲突以原件为准。

## 增量发布（发布仓=长期 git 工作树时的补充规则）

0. **基线判定必须用 commit-ish**：`git ls-files HEAD -- <path>` / `git ls-tree HEAD <path>`。bare `git ls-files` 在 `git add` 之后返回**暂存区**而非已发布基线——2026-10-26 实证：同步后用 bare ls-files 判「[已移除]/trip 脚本已在基线」全错，实际全是本轮新带进来的，险些随基线豁免公开发布。判性基线=已发布 commit，不是 index。
0b. **域级排除要扫内容引用，不只扫文件名**：用户说「不包含 X 域的所有内容」时，目录层不同步≠干净——live 配置里的 X 域 profile 定义块（profiles.yaml/registries 的 2-空格缩进键块）、域专属路由表（*-routing-rules.md）、其他 SOUL/脚本里对 X 域 assignee 的引用（表格行/列表项/邮件投递清单）都会被通用同步带进公开树。处置=文件名 grep + 内容 `grep -P "(?<![A-Za-z0-9_])<域前缀>"` 双扫，YAML 键块整删（键行+更深缩进续行）、表格/短列表行整删、其余 inline 占位符化，YAML 改完 `yaml.safe_load` 验证结构合法。
0b2. **域排除之后还要跑「域内容词表」扫描**：按域前缀 scrub 只清带前缀的串；同一域的自然语言词（人名称呼/健康状况/城市小区/孩子活动名/机构名）不带前缀会漏网，藏在归档设计文档的 gap 记录行、rules 的段落标题、归档 skill 的示例里。完成判据=前缀扫描+内容词表扫描双零（词表从该域档案/规则文档提取）；「引用名可留本体不在树」与公开出版书籍正文命中的正常语汇不算残留。
0c. **`git grep --cached` 的 `--cached` 必须写在 pattern 前**：写在 pattern 后被当 pathspec、静默返回空——空结果被误读成「清洁」。本轮终扫两次假阴性（残留 5 处漏报）都源于此；最终以浅 clone 回读复扫为准。验证永远用「clone 远端 → 全模式 grep」，不信任本地 index 扫描。
1. **shape 归一 diff 分类**：行级 diff 会把全部已脱敏文件报成「不同」——用脚本把 live 内容先按占位符映射表归一，再与发布树逐文件比，只剩**真实内容差**。映射表从已发布 HEAD 反推：对每个改动文件比对 live 与 `git show HEAD:<path>`，逐对枚举 live值→占位符（路径、卷名、bot 账号 ID、微信用户 ID、昵称都算）——映射表缺一类，同步就把那一类真实值写回发布树。YAML 文件 load 后按 key 比语义（引号形态不误报）；live 已删除的配置块在发布侧同步删除。
2. **只同步真实内容差**，同步后立即重跑 shape 脱敏；cron/jobs.json 按 job id 三分 NEW/GONE/CHANGED 逐个定性，[已移除] 类 job 维持排除。
3. **扫描覆盖整个 staged 树，不是本轮增量**：先 `git add -A` 再全模式扫 git index——既往版本的漏网泄露（含已发布基线文件里的真实 token）只有全树扫描才暴露。

## 追平批实操管线（2026-10-28 实证，profiles/shared 配置层）

1. **mtime 锚点过滤先行**：欠账 = 同步范围内、mtime 晚于上批同步锚点、内容异，三条件交集。live↔发布树的纯惯例差（脱敏/品牌改写如 Claude Code→Ycode、[已移除]→[已移除]）不是欠账，反向 port 会撤销脱敏。orchestrator SOUL 曾 mtime 新但内容与发布树仅差惯例——skip。
2. **方向感知**：发布树可能领先 live（repo 侧开发如 feat(acp) env_extra、design-doc 正本在 repo）——blind rsync 会回退发布树。plugins/design-doc 类先判哪边新再动。
3. **config.yaml 转换**：丢 api_key≠PROXY_MANAGED 的 provider 块；fallback_providers 归 []；mcp env 的 HERMES_WEB_UI_PROFILE 被桌面运行时污染成他名（曾现 [已移除]）→归一为本 profile 名；列表剥 [已移除]/eda/lcm 项。风格：pyyaml 缩进序列 dumper + custom_providers 块单独 dedent 2 格（发布惯例混合风格）+ `'off'`→`"off"`、`'1'`→`"1"` 引号对齐。
4. **profiles.yaml 转换**：[已移除]/eda/lcm profile 块整删；fallback 的 model: glm-5.3-flash→aim+api_mode: anthropic_messages；WEIXIN_TOKEN/MATRIX_PASSWORD/WEIXIN_ACCOUNT_ID→${同名VAR}；MATRIX_HOME_ROOM→<matrix-room-id>；api_key 按 base_url 域名映射 ${BIGMODEL/KIMI/TOKEN_PLAN/STEPFUN/MINIMAX/DEEPSEEK_API_KEY}，未匹配→${REDACTED_API_KEY}。dump 用 default-flush（与 HEAD 差 235 行 vs indented 1599 行）；roundtrip 丢注释与 YAML 锚点，语义等价可接受。
5. **jobs.json**：家庭域 job 按「文本转换后仍含 孩子/家长称呼/育儿/感统/识字/儿童等家庭域词|[已移除] 前缀|@im.wechat 真实ID」剔除（先转换再判，防 prompt 里可转换的 [已移除] 板名误伤 skill-mining 类 job）；board 清单 [已移除] 板名→[已移除]、家庭称呼→用户；**last_error/last_failure 运行时日志字段会嵌入全 fleet profile 名与更新输出——遥测字段必须做域名占位符化**。
6. **验证**：yaml 语义 diffwalk（load 双侧递归比）替代文本 diff 判真实变更数；staged 全文件对 HEAD 做敏感模式新增命中扫描（pats 含裸 cuishi、家庭词、[已移除]、各 token 前缀），HEAD 已存在的形态不算新增。action_gate_shadow.jsonl 被 team/.gitignore 排除属既定设计，工作树副本是未跟踪残留。

## 同步后覆盖度核验（用户侧跑完 sync 后，发布树≠live 状态）

`team/` 快照同步是**分层非镜像**：profiles/SOUL/config/shared/scripts 层随 sync 全量刷新，但 `team/skills` 按批点名增量刷新（每次 release 只点名若干技能）——sync commit 晚于你的改动**不构成**技能已入树的证据。实证：同日快照提交收齐了 SOUL/config/research 层，但同批改的技能仍是两个版本前的旧版+references 整目录缺失。

核验规程（融合/技能改动收尾后对发布树跑）：
1. 逐标记点验：`grep -m1 'version:' team/skills/<类目>/<name>/SKILL.md` 对比 live 版本号；`ls team/skills/.../references/<新目录>/ | wc -l` 对比 live 条目数；特征串（新增节能的唯一关键词）双向 grep。
2. 目录级：`diff -rq ~/.hermes/skills/<类目>/<name>/ team/skills/<类目>/<name>/`，差异行数>0 即未同步。
3. 补同步只点名 add 本轮涉及的技能路径，不碰仓内挂着的其他未提交改动（如 vendor/ 工作树）；沿用既有 `sync(team...)` 提交惯例。

## 扫描判读两条边界

- **自述行豁免有例外**：扫描正则的排除行自身也是命中源，复核时先排除文档自述行——但自述行里带**真实值**的（如脱敏扫描命令示例里嵌着真 bot ID）仍属泄露，进历史重写范围，不能当自述行豁免。
- **基线扫描**：对已发布基线也扫一遍（`git grep -nE "<模式>" <已发布commit> -- .`）——基线里的真实 token 意味着修复=新 HEAD 占位符化 + filter-repo 历史重写（单独获批）+ 轮换；仅在新 HEAD 消失不算闭环。

## 文档一致性

- 增量发布无名册变动也必须更新 README 与 README_zh 各自的版本节（What changed in this release / ## 版本）——两语言各自维护，不自动同代。
- 发布树若是长期工作树，先核对本地 HEAD 与 `git ls-remote origin main` 一致，避免在旧基线上做增量。

## 🔴 标记化改写只能作用于发布树——发布动作的爆炸半径不止发布仓

脱敏 / 占位符化 / filter-repo 替换表里的每一串真实值，**在发布仓改是脱敏，在本机 live 树上改是自伤**：这些串同时是本机在用凭证（token、bot 账号 ID、微信用户 wxid、pairing 白名单键、hindsight bank alias、cron 投递来源、profile `.env` 的 user_id）。批量替换若命中 live 侧，通道当场失效，而症状离因很远（表现为「消息发不出」「撞配对码」「记忆路由错」，没人会想到是发布动作干的）。

铁律：

1. **替换只在发布工作树内跑**，`cwd` / 目标路径必须钉死在发布仓根；任何会写回 `~/.hermes/` 的 sed/脚本先 dry-run 打回显目标清单，确认全部落在发布树内再执行。发布树与 live 源的 rsync 是单向的（live → pub），别让反向路径也存在。
2. **标记化后在 live 侧全库反查残留标记串**（形如 `__ROTATED-<日期>__`、占位符形态的 token/ID/邮箱前缀）。扫描范围是全 `~/.hermes/`（各 profile 子树 + `shared/` + `cron/` + `memories/` + 各 profile 的 `weixin/accounts/`），不是只有发布树。命中即为发布事故的次生影响，按下方「恢复」处理。
3. **标记化过的本机值 ≠ 已失效**。别凭「文件被改过」推断腾讯/供应商侧已失效：先拿候选凭据打只读探针（iLink `getconfig`/`getupdates`、供应商只读接口）看是否仍鉴权通过。仍有效说明只是本机存点被换，丢的是**明文副本**而非会话。**找回路径按优先级**：发布前回滚锚（`git bundle` 里的旧 blob）→ 备份文件 → git 历史 → 上游服务端（用户重新配对/扫码会下发新真值）。「恢复真值」与「需用户重新授权」是两件事，先分清再动手。
4. **恢复要一次覆盖全部落点**，别只修主文件。同一凭据散落在账号 JSON、profile `.env`、`profiles.yaml` env_extra、pairing store、cron 的 origin 投递来源、bank alias、`user_id` 字段里；漏一处 = 该通道或路由继续静默故障。修完跑全库反查确认零残留。
5. **凭据标为「无法恢复」前先证明真的不可恢复**。终端输出的脱敏显示（`***`）会被误读成「文件内容就是 `***`」——本轮就是把脱敏显示误判成文件真实内容，绕了一大圈。用读取/解析类路径取真值（如 python 解析 json/env），不靠终端回显判断。确认不可恢复的（如另一批供应商 API key）也要显式上报让用户决定是否重置，不静默省略、不擅自发起重置。
6. **恢复顺序**：① pairing 白名单键（否则家长发消息撞配对码，看起来像 token 没生效）→ ② 陈旧标记键清理（被标记化的旧项会覆盖真实项，导致路由到错误的人/银行）→ ③ 改完重启通道进程验证。
7. **重启前判 scope**：修复需要重启通道进程才生效时，先确认当前会话是否挂在被重启进程上（`ps` 看进程树 + 端口归属）。TUI/CLI 会话独立于网关进程树时可放心重启——别为「怕断会话」拖延重启。
8. **自述行里的真实值也算泄露**（本轮再次实证）：脱敏说明/扫描命令示例中嵌入的真 bot ID 必须一并占位符化，不能当「自述行豁免」。见下方「扫描判读两条边界」。

## filter-repo 历史重写实证（2026-10-14 SwarmTeam v3.3）

- **stale already_ran 会卡交互确认**：`.git/filter-repo/already_ran` mtime 超过 24h 时，即使带 `--force` 也会触发 Y/N 交互确认并在非交互 shell 里 EOFError 崩掉。处置：删掉 `already_ran` 再跑（meta 目录其余文件保留无妨，本轮重写会刷新）。
- **--replace-text 默认整串匹配**：替换表写 `<bot-account-id>@im.bot` 不会命中裸 ID `<bot-account-id>`——每类敏感串同表写完整形态+裸形态两条。第一轮跑完必须 pickaxe 复扫，命中就补规则再跑一轮（filter-repo 幂等续写）。
- **`--replace-message` 只认字面量替换表**（`旧串==>新串`），传 Python 脚本路径会被静默当字面量表解析——跑完 hash 全变但消息原样。程序化清洗必须走 `--message-callback "$(cat cb.py)"`。
- **message-callback 是函数体语义**：末行必须 `return`；filter-repo 以 bytes 传 message——回调开头 `message.decode("utf-8","surrogateescape")`，结尾 `return x.encode(...)` 同构返回，否则 `TypeError: cannot use a string pattern on a bytes-like object` + fast-import 崩。
- **-S pickaxe 假阳性**：`git log -S"串"` 对「该串被删除的 diff」也计数——命中 commit 逐个 `git grep <串> <commit>` 区分「仍在树上」（需补规则）还是「只是删除动作」（无需处理）。
- **filter-repo 会移除 origin remote**：重写后 remote -v 为空，force-push 前先 `git remote add origin <url>`；分块推送循环若在此期间空转报 `'origin' does not appear to be a git repository`，挂回 remote 即自动续。
- **~20MB 仓 force-push 实测 3-5 分钟**（`http.postBuffer 524288000` 已设仍慢）：前台 180s 超时不够，用 background push + `git ls-remote origin main` 轮询，判据=远端 hash == 本地重写后 HEAD。全史重写的大仓分块推送走 skill `large-push-chunking` 的 v4 程序（本地游标制）。
- **验证闭环三步**：① ls-remote = 新 HEAD；② `git clone` 拉回远端**全量**逐 commit 复扫消息（浅 clone 看不到历史）；③ 对旧泄露 hash `git fetch origin <旧hash>`——能 fetch = GitHub dangling 缓存期未过，force-push ≠ 彻底清除，轮换凭据 +（可选）联系 GitHub Support 才闭环。
- **回滚锚先打**：`git bundle create <卷>/archive/<日期>-<主题>.bundle --all` + 自述 README（重写前后 hash、回滚命令、轮换义务）；bundle 自证=新 clone 里对旧 commit `git show` 仍见泄露值。

## 提交信息降噪（消息级重写，树零改动）

触发：用户要求「处理历史提交信息，消除噪声、保留有效信息」。原则=**降信息密度不删信息**：主题行压到 ≤120 字（超长在句读边界拆分，余文移入 body），测试数/补丁号/验证结论保留，内部过程痕迹清除。

Procedure：
1. **先摸噪声形态再定规则**：`git log --format=%s | awk '{print length}'` 出长度分布；分桶统计（内部卡片号 `t_[0-9a-f]{6}`、并行会话叙事、超长主题、用户名/路径/家庭词）。规则分层：①敏感值→占位符（用户名/孩子名/城市小区/域前缀/内部 id）②过程噪声→通用化或删除（「（并行会话 xxx）」括号注记）③超长主题→拆分进 body。
2. **回调脚本落盘再引用**（`--message-callback "$(cat cb.py)"`）；现成模板见 `templates/msg-callback.py`（bytes 进出/return/句读边界拆分已处理），改 SENSITIVE/NOISE 两个规则表即可。
3. **守恒与完整性验证**：提交数前后一致；树不动——抽前 N 提交比 `git log --format=%T` 树 hash 全一致；正文首行长度用 **`git cat-file commit`** 逐条统计——`git log --format=%s` 接管道会把 body 行混进统计，虚报超长数千条（假阳性）。
4. **敏感词终验以 cat-file 为准**：`git rev-list main` 全量 + 逐条 cat-file 取 message 正则扫；`git log --format="%s %b"` 管道同理会混行。
5. **重写期间的并行提交要二次清洗**：cherry-pick/并行会话带上来的新提交带原始消息——重写完成→集成新提交→**再全量 filter-repo 一遍**，一次做完再推。
6. **多机并行僵局是硬前置**：重写+force-push 期间若有另一台机器（或本机另一 agent 会话）在同一仓持续 push，它的 merge 会把旧消息提交带回远端直系，无限互相覆盖。动手前查并行源：`git reflog main`（reset to origin/main 后接 merge = 有人基于远端在活）、`git log 远端新提交的 author/committer`、`ps aux` 找 cwd=该仓的 agent 进程。**判定存在并行源→停止对推，向用户摆 A/B/C（停那台机器后重推 / 等它批次结束 / 确认窗口后合流重推）**；单方面重推 N 次只是烧带宽。
