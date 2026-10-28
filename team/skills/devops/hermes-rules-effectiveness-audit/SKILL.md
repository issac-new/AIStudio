---
name: hermes-rules-effectiveness-audit
description: "审计集群规则可落地性。触发：检查规则有效性、SOUL 实用主义审计、命令手册失效排查。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, audit, rules, soul, skills, practicality]
    related_skills: [harness-entropy-management, skill-library-maintenance, soul-rule-enforceability-audit]
---

# Hermes 规则有效性审计（实用主义版）

> 来源：2026-08-21 全集群规则有效性审计实战（27 profile / 293 条命令 / 6 维扫描）。
> 核心哲学：规则的唯一检验标准是**能不能落地**——引用的 skill 可见吗、命令真跑得通吗、
> SQL 对时间戳真的有结果吗。语义存在≠可执行。

## 触发条件
- 用户说"全面检查规则有效性 / 避免 SOUL 里有无法落地的东西 / 实用主义检查"
- 融合落地后做回归验证
- 定期防漂移（建议挂 entropy-management cron）

## 核心工作流（5 步）

1. **机械扫描先行**：写/复用 `scripts/rules_audit_scanner.py`（D1 悬空引用 / D2 失效
   skill 引用 / D3 模糊措辞 / D4 跨 profile 重复块 / D5 死链 / D6 失效命令）。
   误报控制：D2 正则要收紧到 `skill_view('name')` 形态、D6 排除 `-z` 全局参数、
   文件收集用 `rglob` 并跟随 symlink（`find -L`），否则误报淹没真问题。
2. **逐项人工复核**：每个扫描命中先验证再修（如"重复块"先查语义是否全保留再判定
   刻意同构 vs 漂移；grep `-A6` 窗口太窄会漏语义，扩窗复核）。
3. **命令逐条实测**：抽 SOUL bash 块命令真跑（which / hermes 子命令表 / 路径 exists /
   DB 可开）。分类处置：真失效→修；任务内生成物→注释"任务 workspace 内由本任务创建"；
   守卫式（`command -v x &&`）→可降级不修；目标环境命令（terraform 无后端）→注释前提。
4. **修复后回归**：重跑扫描器 + 从 SOUL **原样复制**命令执行验证（不是"看着对"）。
5. **蓝军比对包终审**（复杂任务纪律）：预组装被审内容+验证证据进单文件，独立子代理核查。

## Pitfalls（全部实战实证）

### 1. hermes 子命令名陷阱
`hermes session`（单数）不存在——正确是 `hermes sessions`；`hermes hindsight` 从未存在
（hindsight 是 localhost:8888 API 服务，无 CLI；长期记忆检索走会话内 hindsight_recall 工具，
CLI 侧等价桥是 `hermes sessions search "关键词"`）。批量修：sed/python 按 SOUL 逐文件替换。

### 2. skill 索引可见性（最高频失效，占 D2 大头）
索引器**只认 `<profile>/skills/<分类>/<名>/SKILL.md` 二级结构**：
- 顶层平铺（`~/.hermes/skills/<name>/`）→ 不可见（cognition-lattice 曾因此 12 处强制规则空转）
- `_shared/skills/<name>/` → 不可见（codex-guardian-review 落地即空转）
- 修复：目标 profile `skills/<分类>/` 下建 symlink → 实体。验证 `hermes skills list | grep <name>`
- 跨 profile 推广用 for 循环批量 ln -sfn，逐 profile 抽验 list 命中
- **disabled 状态会真挡加载**（子会话实测 skill_view 返回"已禁用"），非仅显示标记

### 3. symlink 环事故（修复操作的安全序列）
严禁对同一 skill 混用 `cp -cR` 与 `os.symlink` 交错操作：clone 副本→master 之间可能形成
**自指 symlink 环**，`hermes skills list` 报 `Symlink loop` 后连 skills_list/skill_view 全被
拖垮。安全序列：①master 必须真实体（断言非 symlink 且含 SKILL.md）②link 侧真目录先
`shutil.move` 到 cache 备份区（不删）③建单一 symlink ④list 验证。
注意备份区若含污染内层链，恢复时 copytree 会把环带回来——恢复源必须先验证。
（2026-08-21 实测：环导致本会话工具迭代耗尽，2 个 skill 目录待手工清理，
实体 SKILL.md 在 `~/.hermes/profiles/orchestrator/cache/audit-bak/` 完好）

### 4. sqlite3 WAL 库只读的正确姿势
`sqlite3 -readonly <db>` 对 **WAL 模式库直接报错**（unable to open database file 14，
WAL 需写 shm）。正确：`sqlite3 "file:$db?immutable=1" "SELECT ..."`。
多 board 遍历用 for 循环（file:URI 内不展开 glob）。

### 5. kanban.db 时间戳是秒级 unix int
`WHERE created_at >= date('now','-7 days')` 对 `created_at`（如 1787213644）**永远空结果
＝静默失效**（比路径错更隐蔽——命令跑通了，报告是空的）。正确：
`created_at >= strftime('%s','now','-7 days')`。
另有：`~/.hermes/kanban/current` 是**文件**（内容=board 名）非目录；全集群任务几乎都在
swarm 库（37 条），ops/product/eda 等 board 库常为 0——评估类 SQL 应 for 循环遍历
`boards/*/kanban.db`。

### 6. 扫描器自身的坑
循环变量名 `out` 会覆盖输出函数 `out()`；行号对多字节 CJK 文件要用 awk NR 复核；
命令太长（多重 for + hermes 组合）会触发 hardline 解析器拦截——拆小或先写脚本文件
再 `bash <script>`。

### 7. 判定"合理同构"防过度修复
退出协议块 23 profile 措辞 17 个 hash 变体但核心语义 23/23 保留（complete/block 二选一
+文本不算数）——这是"SOUL 摘要 + _shared 正式版"刻意双层设计，**不要**去重统一，
机械验证语义即可。知识陈述句里的"尽量"（如测试金字塔原则）不是模糊规则，不修。

## 与其他 skill 的联动
- 定期化：挂 `harness-entropy-management` cron（周一 9 点第三检查项，防漂移回归）
- 修复 SOUL 时：`soul-rule-enforceability-audit` 管规则可判定性，本 skill 管机械可执行性
- skill 可见性修复后：`skill-library-maintenance` 做全局一致性复查

## references/
- `references/rules-audit-20260821.md` — 本次全量审计的发现明细与修复台账（含 symlink 环事故完整还原）
