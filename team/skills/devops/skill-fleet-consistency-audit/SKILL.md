---
name: skill-fleet-consistency-audit
description: "技能库四层对账：SOUL引用↔board声明↔symlink↔运行时。触发：集群skill体检、fence前后."
version: 1.0.0
metadata:
  hermes:
    tags: [devops, audit, skills, multi-profile, reconciliation]
    related_skills: [cluster-rules-audit, rules-effectiveness-audit, skill-board-scoping]
---

# Skill Fleet Consistency Audit（技能舰队四层一致性对账）

> 2026-08-27 全集群两轮体检实战提炼（27 profile / 709 skill master / 7 board）。
> 核心发现：**单层检查全绿 ≠ 集群健康**——SOUL 引用、board 声明、文件系统 symlink、运行时索引四层各自独立演化，断裂只出现在跨层对账时（本轮 10 处断裂全部是"某层单独看正常"）。

## 触发条件 / When to Use

- 用户要求"检查集群 skill 一致性 / SOUL 引用加载不了 / 全局体检"
- 跑 `skill-fence.py apply` **之前**（防误归档，见 Pitfall 1）和**之后**（验证对齐结果）
- 新增/移动 master skill、修改 profiles.yaml 之后
- cron watchdog（inventory-drift / master-integrity）报警时的人工诊断

## 四层模型与对账链

| 层 | 事实源 | 检查命令 |
|----|--------|----------|
| L1 SOUL 引用 | `profiles/*/SOUL.md` 中 `skill_view('X')` | 正则抽取引用集 |
| L2 board 声明 | `~/.hermes/shared/profiles.yaml` 的 `skills_enabled` ∪ `skills_pinned` | yaml.safe_load（禁手写行解析，见 Pitfall 2） |
| L3 文件系统 | `profiles/<p>/skills/<cat>/<name>/SKILL.md` isfile（**穿透 symlink**） | glob + os.path.isfile |
| L4 运行时 | `hermes -z "hi" --skills <name> --profile <p>` 输出无 "Unknown skill" | **唯一权威**（`.skills_prompt_snapshot.json` 刷新滞后，不可作准） |

**判定规则**：L1 引用 ⊆ L2 声明（引用未声明 = fence 会剪掉它）；L2 声明 ⊆ L3 可达；L3 ⊆ L4 实际加载。任何一环断裂 = 该 profile 的 skill 对该任务实际不可用，即使 SOUL 写了强制引用。

对账脚本：`scripts/check_profile_skill_loadability.py`（L1×L3，含顶层单例支持）；master 完整性对账：`~/.hermes/profiles/orchestrator/scripts/master_integrity_check.py`（断链/数量骤降/引用无实体三检，快照对比）。

## 授权分级（修复时的正确姿势）

- **整类授权**：`ln -sfn ~/.hermes/skills/<分类> ~/.hermes/profiles/<p>/skills/<分类>` + profiles.yaml `skills_enabled` 加分类名
- **单技能授权**（默认首选）：把 skill 提为**顶层单例分类** `~/.hermes/skills/<name>/SKILL.md`（name 即分类）+ profiles.yaml `skills_pinned: [<name>]` + profile 侧 `ln -s`
- 🔴 **禁为单技能开整类**：devops 类 = 204 skill，开给 [已移除] 曾把 inventory 期望值从 37 打到 250（prompt 膨胀 + watchdog DRIFT）
- 顶层单例**可索引可加载**（实测 LOAD-OK，skill-fence `_expected_count` 原生支持）——修正旧结论"顶层平铺不收录"（仅适用于无 SKILL.md 的裸目录）

## master 化（profile 本地实体 → 单一事实源）

散落在多个 profile 的同类 skill 合并流程：
1. `mkdir ~/.hermes/skills/<分类>`，逐个 `mv` profile 本地实体入 master
2. profile 侧 `rm -rf` 后建**单条整类 symlink** 指向 master
3. profiles.yaml 为每个引用 profile 补声明（**先声明后 fence**，见 Pitfall 1）
4. 跑四层对账 + `master_integrity_check.py` 归零

## Pitfalls（血泪，全部本轮实测）

1. **fence apply 会归档未声明的 profile 本地实体目录**（移到 `skills-archive/<profile>/` + 写 MANIFEST，可恢复但会当场打断引用链）。铁律：**先补 profiles.yaml 声明，再跑 fence apply**；apply 后立刻跑 L1×L3 对账，归档了就 `mv` 回来 + 补声明。
2. **yaml.safe_dump 重排缩进会打断手写行解析器**：profiles.yaml 被 safe_dump 重写后列表项 4 空格，inventory_watchdog 的 `^\s{6}- ` 匹配失效 → 全员 UNSCOPED 误报。修**解析器**（`^\s+- `）而非回改文件——解析器对合法 YAML 变体鲁棒才是根治。
3. **倒挂 symlink 自指环**：master 化时若目标位置已有指回 profile 的 symlink，`mv` 会静默穿过/吞掉真身。合并前先 `find <dst> -type l` 清点；丢失后从 `skills-archive/<profile>/<name>.*` 时间戳目录找 fence 归档。
4. **评估脚本自身可能假阴性**：`ontology-cq-regression.py` 用单行正则 `^clearances:\s*(.+)$` 读多行 YAML 列表 → 捕获组永远空 → 集群永远报 GAP，实际 7 profile 有 PII。**修工具先于信工具**：块状正则 `^clearances:\s*\n((?:\s+-\s*\S+\n?)+)` 后 GAP 2→0。
5. **snapshot 滞后陷阱**：文件系统已修复但 `.skills_prompt_snapshot.json` 是旧缓存，看它会误判"没修好"。终验一律 `hermes -z --skills` 运行时实测。
6. **审计脚本 O(n²) 子进程炸弹**：709² 次 grep 必超时 exit 1 且**谎报**"报告已保存 /tmp"（从不写文件）。审计工具三宗罪自查：复杂度、退出码、落盘声明。重写范式：awk 单遍替代双层 while grep、预拼大文本一次批查、`tee` 真实落盘。
7. **"消失的文档"先查并入再定罪**：7 份契约文档（dod-checklist/diamond-quality-gates 等）物理不存在但正文完整并入 review-gates.md（头部"原 X.md"标记）。判据：接收方文档含 `## N、XXX（原 name.md）` 章节 + SOUL 层无 `_shared/<name>` 路径引用 = 刻意合并，非丢失。

## 输出契约

报告模式同 cluster-rules-audit（范围→结论表→逐项修复明细→健康不修项→总账），追加一列"层"（L1-L4 断在哪层）。修复后必须给出四层对账 + watchdog + `master_integrity_check.py` 三件套归零证据，禁自评打分。

## References

| File | Content |
|------|---------|
| `references/fleet-audit-20260827.md` | 两轮体检实战记录：10 处跨层断裂细节、fence 误归档恢复全程、master 化操作序列、未闭环项追踪 |
| `scripts/check_profile_skill_loadability.py` | L1×L3 对账器（穿透 symlink + 顶层单例支持，ALL-OK/逐 profile 列断链） |
