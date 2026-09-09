---
name: design-doc-sync-audit
description: 重大变更后同步设计文档的机械审计——口径扫描五件套+双份落盘+接线验证。
version: 1.0.0
metadata:
  hermes:
    tags: [devops, documentation, audit, orchestrator]
    related_skills: [orchestrator-kanban-tracing, fusion-implementation-patterns]
---

# 设计文档同步审计（design-doc-sync-audit）

> 来源：2026-09-03 三轮实战实锤——OpenExecutive 七机制融合落地后，主设计文档同步遗漏 6 处正文口径被用户怒斥「我说的是整体设计文档要同步更新！！！！」；payteam-design.md 在压缩快照中标记「新建完成」但实际未落盘（echo 被误记为 write_file 成功）。
> 定位：orchestrator 在重大变更（融合/团队新增/规则批量落地）后同步设计文档的机械审计配方。

## 触发条件

- 用户说「同步更新整体设计文档」「排查下，不要遗漏」「设计文档漏了 X」
- 重大融合落地完成（如 OpenExecutive 七机制）需要回写设计文档
- 新团队/profile 批量创建后需要更新主设计文档
- 任何对集群有结构性影响的变更（看板增删/共享协议新增/规则块计数变化）

## 核心纪律一：只更新演进路线 ≠ 同步设计文档

**演进路线/更新日志章节只是时间线快照**——正文口径（架构图/团队清单/计数表/覆盖范围列/附录清单）才是主战场。用户怒点：只改演进路线就声称「设计文档已同步」= 敷衍。

## 核心纪律二：全局口径扫描五件套（机械执行，无主观判断）

变更落地后对设计文档跑完五件套才算完：

```bash
# ① 总数口径：profile/团队/看板/共享文件 计数是否过期
grep -n "33/33\|33 Profile\|6 看板\|442.9" design.md
# ② 覆盖范围列：规则块/协议表的「覆盖范围」列
grep -n "33/33 profile\|33 worker profile\|32/33" design.md
# ③ 章节计数标题：「七大强制规则块」与头部数量声明是否一致
grep -n "七大\|九大" design.md
# ④ 架构图/路由表：看板列表、Gateway 端口、新团队整章是否缺
grep -n "看板路由\|### 2\." design.md
# ⑤ 附录清单：附录 A/B/C 的实体总数与新落地实体是否收录
grep -n "附录 A\|附录 B\|附录 C" design.md
```

**合法保留例外**：演进路线/时间线章节内的历史时点快照（如「✅ 33/33 profile 前线侦察（v2.0 时点）」）是当时事实，不改；**正文口径必须反映当前实机**。

## 核心纪律三：双份落盘防压缩丢产物

长会话中产出设计文档/调研报告**必须双份落盘**：
1. `~/.hermes/profiles/orchestrator/references/<topic>/`（持久层）
2. `workspace/research/` 或 `workspace/<doc>.md`（git 跟踪层）

**实锤**：payteam-design.md 在压缩快照中标记「新建完成」但实际未落盘（echo 输出被误记为 write_file 成功），下一轮排查时发现文件不存在。双份落盘后，即使压缩丢了一份，另一份仍在 git 里。

## 核心纪律四：融合产物接线覆盖必须全量验证

`_shared/` 新协议写完后**必须批量接线到全部活跃 profile SOUL.md**（python 批量在引用 review-gates.md 的行后追加新协议引用行），跑 `grep -l` 计数验收：

```bash
for f in <新协议1> <新协议2> <新协议3> <新协议4>; do
  echo -n "$f.md: "
  grep -l "$f" ~/.hermes/profiles/*/SOUL.md 2>/dev/null | wc -l
done
# 期望: 各 27（或当前活跃 profile 总数）
```

接线遗漏 = 协议存在但 worker 不知道 = 零效果。

## 核心纪律五：用户红线措辞解读

| 用户措辞 | 实际含义 | 执行范围 |
|---------|---------|---------|
| 「同步更新设计文档」 | 全量同步，非只改进演路线 | 五件套全扫 + 正文口径全部对齐 |
| 「排查下，不要遗漏」 | 穷尽式对账 | 不止补用户点名的那一项，全部相关章节过一遍 |
| 「整体设计文档漏了 X」 | X 是线索不是全部 | 以 X 为入口做全量扫描 |

## 落地清单（重大变更后必做）

1. **跑五件套扫描**，命中项逐处修改
2. **新增团队/机制写进对应章节**（§二 团队设计新章 / §四 规则块表 / 附录 A/B/C）
3. **双份落盘**验证（references/ + workspace/ 各一份，`ls -la` 两份都存在）
4. **融合产物接线验证**（`grep -l` 计数 = 活跃 profile 总数）
5. **commit message 四段式**：新增/修改/接线/来源
6. **机械终验**：`for kw in <新机制名> <新团队名> <新协议文件名>; do grep -c "$kw" design.md; done` 全部 > 0

## 高频坑补充（2026-09-07 实锤）

- **计数类数字在文档里有多个副本，只改一处=没同步**：头部「规模维度表」、正文机制小节、附录术语表各有一份（如 skill 主库数出现在 §一头表 + §3.5 + §5.4 + 术语表 4 处）。上一轮同步只改了头表，正文 741/5,331/36/18 全部残留。修法：sync 时对每个计数旧值全文 `grep -n`，逐处更新到实机值，不能只改扫到的第一处。
- **「挂载数」列是活数字，每轮整体 -1~-3 漂移**：主库增长自动扩白名单，`hermes skills list -p <profile>` 的 enabled 数逐轮变化——验收时全列重测（约 47 个 profile × 数秒），不要抽查替代全量，也不要按「主库增长 +N」推算。
- **auto-backup cron 会在任务中途收走工作区改动**：长会话里先改的部分可能已进 auto-backup commit，`git diff` 看起来远小于实际改动量。判断修订完整性以「工作区文件内容 + grep 终验」为准，不以 diff 统计为准；提交前先 `git log --oneline -5` 确认哪些已被 backup 收走，避免 commit message 与实际 diff 对不上。
- **done 差距缺 `resolved_fix` 不得补伪造锚点**：schema 建立前的早期 done 条目该字段为空，docsync 机制上不回写——设计实质已吸收的（如 soul_git_sync.py 之于提示词资产保护）把载体写进对应机制小节，台账里记「锚点豁免判例」说明原因，并立规矩：此后 done 且无 resolved_fix = 未收口。
- **台账追加必须「新增独立条目」，禁把旧条目文本当替换锚**：附录 C 类逐条独立行的台账，加新条目时 old_string 只锚插入点（上一条行尾/下一锚），绝不能用新锚点直接替换旧条目开头——那会把旧条目全文并进新条目行尾，一行两条脏数据（旧收口记录表面消失）。patch 后 grep 旧锚点确认仍独立成行、条目总数 +1 而非不变。
- **计数写入前当场重测基线**：长会话中途基线可能被并行事件挪动（如 update 同步事故使主库 skill 数一夜多次跳动 727→683→751→753）——写计数前重跑验证命令取当场值，禁沿用会话早前测得的值；落笔后基线又变则再改一轮，文档永远记最后一次实机重测值，不留历史值。
- **表格行尾 patch 会吃掉前导管道符**：markdown 表格行 `| a | b |` 用 patch 替换时，old_string 若只含单元格内容（不含行首 `| `），替换后该行会失去行首管道符变成畸形行（diff 里会多出一行带 `||` 前缀）。修法：old_string/new_string 都必须包含完整行（从行首 `|` 到行尾），或 patch 后逐行 `grep -n "^||"` 检查畸形行并手工修复。
- **新机制回写设计文档五处落点清单**（重大变更后机械执行，缺一=没同步）：① 机制小节正文（§5.x 对应域）；② 六层目录表/规则块表的文件清单与职责列（§5.5）；③ 维护契约新增横切纪律段（§六，适用全部后续决策的如「环境阶段纪律」）；④ 附录 A 术语表（新术语大白话定义）；⑤ 附录 C 台账（TRACK 待建条目以 gap-closed 注释锚追加，新行独立于旧条目）。每处都要 grep 终验>0。
- **语义化 commit 撞上 auto-backup 先收**：auto-backup cron 常在文档刚改完时就 commit（混杂 message），轮到你 commit 时 `git status` 已干净、`git diff HEAD` 为空。不要 amend/rebase 改写历史（会破坏 auto-backup 记录），也不要重复 commit 文件——先机械终验改动确实在 HEAD（`git show HEAD:<file> | grep <关键新词>` 命中即入库），再补一个 `--allow-empty` 的语义化提交留检索锚点（完整 message 写明各章节落点与来源，注明「文件改动已由 Auto-backup <sha> 收录，本提交为语义化锚点」）。
- **git index.lock 残留的处置**：commit 报 index.lock exists 时先 `ps aux | grep git` 确认无活跃 git 进程，再 `rm .git/index.lock` 清除（auto-backup 与手动 commit 撞车时常见）；lock mtime 很新时先等几秒观察是否自行释放，禁在 git 进程存活时强删。
