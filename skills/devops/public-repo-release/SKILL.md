---
name: public-repo-release
description: "Safe public GitHub release of local agent team assets"
version: 1.1.0
metadata:
  hermes:
    tags: [devops, github, publishing, privacy, release]
    related_skills: [shared-workspace-git-commit, github]
---

# 公开仓库发布资产（public-repo-release）

> 触发词：发布到 GitHub / 公开仓库 / push profiles to repo / 同步 SwarmTeam / hermes agent teams 发布。
> 适用：把本机 agent profile / skills / 配置打包发布到公开 git 仓库。
> 与 shared-workspace-git-commit 的区别：那是共享 workspace 内部入库；这里是**对外公开发布**，隐私门禁严格得多。

## 常驻规则（每次发布必过）

1. **扫描打包后的树，不是只扫源目录**——cp/tar/rsync 会把嵌套 `.git`、`.bak`、运行日志重新带进来（references/ 里的嵌套 .git 携带含邮箱的完整历史）。
2. **[已移除] 团队与 hack 团队永不公开**（用户常设裁决：家庭隐私 + 攻击内容）；[已移除] 专属 skill（[已移除]-*、[已移除]、[已移除]-context-profile-enrichment、family-travel-planner、[已移除]* 等）随团队一并排除。家庭内容还会藏进通用类目 skill（devops/ 下的教案、旅行、家庭消息技能）——用家庭名词全库 grep，专属技能整目录排除，通用技能里的顺带提及泛化改写。
3. push 到公开仓库必须用户明示才执行；leak 修复的 force-push 属历史重写，单独获批。
4. secrets 一律占位符化（`${VAR}`），不删字段——下游 generate-configs.py 依赖 profiles.yaml 的结构。手工半脱敏的 key（值里带省略号）不算脱敏完成：凡非 `${VAR}` 且非空的 key/token 值一律重占位符化，半截 key 仍暴露供应商前缀与可比对片段。

## 工作流（六步）

### ① 圈定发布面（白名单制）

每 profile 只带内容资产：SOUL.md、*_rules.md、config.yaml、profile.yaml、cron/jobs.json、hindsight 部署脚本+config.json、references/、scripts/、plugins/。
排除全部运行态：logs/ cache/ sessions/ state.db* auth.json auth.lock .env gateway* memories/ pairing/ hindsight 运行数据/。

skills/ 目录是指向 default 库的绝对路径 symlink → 必须解引用复制：`rsync -aL`。**不要用 tar 管道**（bsdtar 解包端报 `Option -L is not permitted in mode -x`）；rsync 后检查目录自嵌套环（cognition-lattice 类会 cycle）。

### ② 保密扫描（全模式清单见 references/secret-scan-patterns.md）

在打包树上跑三类扫描：
- **secrets**：api_key/sk-/ghp_/syt_(Matrix)/xox/AIza/WEIXIN_TOKEN/`@im.bot` 账号ID+token/`@im.wechat`
- **隐私**：真实邮箱、`/Users/<name>` 硬编码路径、家人姓名/生日/住址/学校词、child-profile/mom-observations 档案本体
- **杂质**：嵌套 `.git`、`*.bak*`、`*.rollback*`、`*.log`、jobs.json 里的私人 cron 条目

判定「引用≠本体」：SOUL 规则里提 child-profile.md 路径可以保留（语义需要），只要 `find` 确认树里无该文件本体。所有命中清零后才进下一步。

### ③ 范围与方式裁决（编号选项问一次）

一次问清：排除哪些团队 / 全量同步还是只新增 / 直接 push main 还是发 PR。用户批准即执行，不二次确认。

### ④ 安装器与文档一致性

- distribution.yaml **每个 profile 必须有**——缺了 `hermes profile install` 逐个静默 SKIP，装 0 个且无报错。
- README / 安装指南 / Windows 指南的 profile 数、团队数、名册表同步更新。
- 死引用清扫：已删除的安装脚本（install-all.sh 类）grep 全部文档清零；文档里的版本史段落也算引用面。

### ⑤ push + 远端验证

push 报 408/连接超时 → `git config http.postBuffer 524288000` 后重试循环，每轮用 `git ls-remote origin main | grep $(git rev-parse HEAD)` 判成功，不看 push 命令退出码。
push 后 API 复核：commits API 确认 HEAD；contents API 拉回脱敏过的重点文件（base64 解码）再跑一遍泄露正则。

### ⑥ 泄露修复（secrets 已进公开历史时）

清洗 → `git commit --amend` 并入发布 commit → `git push --force`（需用户批准）→ API 验证远端 HEAD 不再含旧 commit。
**Force-push ≠ 彻底清除**：GitHub 可能短期服务 dangling commit 缓存 → 必须提示用户轮换已暴露的 token，轮换前不算闭环。

## Pitfalls

1. 扫描模式别只配 api_key——Matrix `syt_` 前缀、微信 `账号@im.bot:hex` token、裸 bot 账号 ID 都不在常规清单里，只扫常规模式必漏。
2. 剔除杂质后复查引用闭环：删了脚本就同步删 jobs.json 里引用它的条目；删了文件本体就确认树里无悬空本体（引用名可留）。
3. 终端跑 python heredoc 可能卡审批超时阻塞——清洗/过滤脚本用 write_file 落盘再 `python3 <file>` 执行。
4. 用户文档口径与安装器行为要对齐：安装器按 distribution.yaml 决定装什么，文档按 README 名册说有什么，两者数字必须来自同一次统计。
