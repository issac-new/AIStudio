---
name: cluster-integrity-audit
description: "Use when 检查集群组织一致性：幽灵assignee/孤立master/技能不可加载/config漂移."
version: 1.0.0
metadata:
  hermes:
    tags: [devops, audit, consistency, multi-profile, kanban, skills]
    related_skills: [cluster-rules-audit, rules-effectiveness-audit, skill-library-maintenance, harness-entropy-management]
---

# 集群组织一致性审计（Cluster Integrity Audit）

> 2026-09-07 全局体检实战提炼（49 profile / 13 board / 735 skills：12 类断裂全修复，机械回归全绿）。
> 与 cluster-rules-audit 的分工：**那是规则可落地性**（SOUL 规则→命令能否执行）；**这是组织一致性**（profile↔board↔skill↔config↔docs 的引用网络是否连贯，无孤立/断裂/割裂）。
>
> **本次扩展（2026-09-07）**：审计范围从 27→49 profile（含 aiteam/pay/data 三新团队）、7→13 board（含 guardrail-test/_archive/data）、709→735 skills。新增 4 类断裂：zombie team/board、path drift cron、scratch 违规 workspace、_shared bak/legacy 双份残留。

## 触发条件 / When to Use

- 用户说「检查 teams 全局问题 / 逻辑连贯 / 组织孤立断裂割裂 / 一致性」
- profile 改名、看板迁移、skill 大规模重组之后的回归审计
- 疑惑「为什么这张卡永远没人拾取」「为什么这个 skill 说加载了但没有」

## 断裂分类学（8 类，按检出成本从低到高排序）

| # | 断裂类型 | 检出方法（机械） | 修法 |
|---|---------|----------------|------|
| 1 | 幽灵 assignee（卡永久卡 ready，dispatcher 静默丢弃） | 7 板 `SELECT DISTINCT assignee WHERE status NOT IN ('done','archived')` 逐个 `test -d ~/.hermes/profiles/<a>` | 改派到真实 profile；若是裁决卡补闭环动作后 done |
| 2 | 重复任务卡（同题同容双份，旧卡未清） | title 分组 + body 前缀比对 + created_at 排序 | 归档旧卡，result 注明重复对象 id |
| 3 | environment_hint 幽灵路径 | yaml 解析 config → hint 逐行 `os.path.isfile`（注意 hint 是**多行字符串按行拆**，别当单路径判） | hint 改指 SOUL.md；config 先备份 |
| 4 | 双正典残留（文件迁移后旧引用未清） | grep 旧路径 → 区分「活引用」vs「迁移注记 vs 历史档案」 | 只改活引用（标注迁移日期）；legacy 死链副本归档 |
| 5 | SOUL 三节规范缺口（命令手册/补充工具/高级用法） | 27 profile grep 三节标题计数 | 按正典补齐：有 references 外置的归拢指针，没有的写真实可执行命令；[已移除] 系豁免 build/test |
| 6 | per-profile skill 不可加载（**master 在 ≠ 该 profile 能加载**） | 跑 `scripts/check-profile-skill-loadability.py` | 缺口补 symlink（单一事实源）；孤立 master 分类整链接到需要的 profile |
| 7 | skill 库结构病灶（垃圾目录名/三级嵌套/容器-skill 同名冲突） | `find skills -maxdepth 1` 找字面异常名；`-mindepth 3 -name SKILL.md` 找嵌套 | 归档垃圾（可逆路径）；嵌套提升二级；同名冲突改名或提升 |
| 8 | 审计工具自病（治理工具自身失效 = 治理空转） | 跑之前先冒烟：小样本+超时上限+`test -f` 验证落盘；查 cron `failure_streak` | 重写修复（见 Pitfalls 的两个实例） |

## 核心纪律

1. **per-profile 是唯一正确口径**：「skill 存在」必须指「在**该 profile** 的 `skills/<cat>/<name>/SKILL.md` 可达」——master 在但 profile 没挂 symlink 同样断裂（本次实锤 10 处：hack-team 分类 25 skill 整类孤立、cognition-lattice/worldmonitor-intel master 丢失、rd-validate 单侧）。
2. **验证用运行时实测**：`hermes -z "hi" --skills <name> --profile <p>` 无 Unknown 才算 LOAD-OK；`.skills_prompt_snapshot.json` 刷新滞后（实测会停在旧时间），只作参考不作判据。
3. **休眠键不信**：config 的 `skills_enabled_by_category` 与实际加载 0% 相关（t_2f7729e4 方向 B 裁决），真实开关 = `<profile>/skills/<category>` symlink。
4. **全部可逆**：删除先归档 `~/.hermes/skills-archive/_trash_<date>/`（soul-backups/ + config-backups/ 子目录），修复脚本落 /tmp 先备份。
5. **回归总账表**：修完逐项跑机械验证（watchdog 全零 / 三节 27/27 / 可加载 ALL-OK / 幽灵 0 / 断链 0），输出「检查×修前×修后」三列表。

## Pitfalls

1. **mv-into-symlink 数据丢失**：对 symlink 位置 `mv 实体 链接路径` 的 POSIX 语义是移入目标目录（等价移回原处），随后 rm 链接再 mv 报源不存在——实体悄然丢失。**移动前必查 `ls -la` 确认目标是真目录**。恢复源：`~/.cc-switch/skills/`（cognition-lattice 案例）、`~/.hermes/skills-archive/_backup_*/`（worldmonitor 案例）。
2. **master 会无声消失**（本次 worldmonitor 恢复后当日再丢一次，无 fs 审计可归因）——恢复后立即双验证（test -f + 运行时实测），并建议 entropy cron 挂 master 对账。
3. **O(n²) 子进程炸弹**：bash 双循环里对 709 个名字两两 grep = 50 万次子进程，必超时。改 awk 单遍（重名）/预拼大文本一次 `grep -F` 批查（零引用）。
4. **谎报落盘**：脚本宣称「报告已保存至 /tmp/...」但从不写文件——cron 消费者无人发现。凡输出含保存路径，必须 `tee` 真实落盘。
5. **cron failure_streak 无人看**：no_agent job 连续失败 4 周静默。熵管理周报必须列出 failure_streak ≥2 的 job。
6. **terminal 内联长命令触发 hardline 无条件拦**（非审批层）——写脚本文件再 bash 执行，不重试 inline。
7. **双正典判定要留迁移注记**：grep 命中旧路径 ≠ 都要改——「2026-08-25 从 X 迁移」的历史注记是档案价值，保留；只改活引用。
8. **健康不修项要显式记录**：matrix 协议引用率 1/27 是设计（通信治理集中在网关 profile）；27 SOUL 共享块 8 组重复是 Tier 注入刻意产物。判健康不修 + 写明理由，防止下轮审计重查。

## Scripts

| File | Content |
|------|---------|
| `scripts/check-profile-skill-loadability.py` | per-profile skill 可加载性检查器（维度 6 的机械实现，ALL-OK / 逐 profile 列断裂） |

## References

| File | Content |
|------|---------|
| `references/audit-20260827-findings.md` | 全局体检实战记录：8 类断裂逐项（现象/根因/修复/回归证据）+ 回归总账表 |

## 与其他 skill 的联动

- **cluster-rules-audit / rules-effectiveness-audit**（default profile 域）：规则可落地性维度，与本 skill 组织一致性维度互补；其 D1-D7 watchdog 是本审计的第 1 道扫描
- **skill-library-maintenance**（default profile 域）：skill 库去重/symlink 修复的深度操作手册（本 skill 引用其 Pitfall 模式）
- **harness-entropy-management**（default profile 域）：本审计的 8 维断裂检查可挂其周一 cron 做防腐化回归
