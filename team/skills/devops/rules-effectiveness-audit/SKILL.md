---
name: rules-effectiveness-audit
description: "规则有效性机械审计：扫失效命令/悬空引用/不可索引skill。触发：检查SOUL规则可落地性。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, audit, rules, skills, pragmatism]
    related_skills: [harness-entropy-management, open-source-skill-fusion-v2]
---

# 规则有效性审计（Rules Effectiveness Audit）

> 产出：2026-08-21 全集群审计实战（27 profile / 72 文件 / 修前 40 处失效 → 修后 0）。
> 核心纪律：**实用主义——每条"规则失效"结论必须可追溯到真实命令输出**，先机械扫描再人工甄别，能修当场修+回归验证。

## When to Use

- 用户要求"检查规则有效性/可落地性/避免样子货"
- 怀疑 SOUL 强制规则块引用的 skill 加载会失败（执行卡死或被静默跳过）
- 命令手册里的命令疑似失效（子命令改名/脚本丢失/DB 移位）
- 大规模 SOUL/rules 变更后的回归验证

## 审计流程（5 步）

1. **机械扫描**：跑 `scripts/rules_audit_scanner.py`（6 维度：D1 悬空引用/D2 失效 skill/D3 模糊措辞/D4 重复块/D5 死链/D6 失效命令），输出 JSON。
2. **误报甄别**（关键，勿跳过）：扫描器命中 ≠ 真问题。逐条用真实命令复核：
   - `hermes -z "..." --skills <name>` 实测 Unknown skill（比 grep 更硬的证据）
   - `hermes session list` 实测报错信息（确认是 invalid choice 还是参数错）
   - 引用文件的 rglob 子目录（`_shared/decisions/` 下的文件 glob("*.md") 看不见）
3. **重复块语义判定**：跨 profile 重复 ≠ 漂移。提取核心语义要素（如退出协议三要素：complete/block 二选一+文本不算数）逐 profile grep 核对；措辞变异（17 个 hash 组）但语义 100% 保留 = 刻意本地化，**不修**。
4. **当场修复 + 回归**：修完重跑扫描器，目标 D1/D2/D6 归零。
5. **蓝军比对包终审**：多文件修复后组装 Part A（修复全文）+ Part B（基准）单文件比对包，派独立子代理四维审查（忠实性/一致性/可执行性/越界）。

## 🔴 索引结构坑（最高频失效根因）

hermes skills 索引器**只收 `<skills_root>/<category>/<name>/SKILL.md` 二级结构**：
- 顶层平铺 `~/.hermes/skills/<name>` → 不收录（cognition-lattice 案例：6 profile 12 处强制引用全失效）
- `_shared/skills/<name>/` 平铺 → 不收录（codex-guardian-review 案例：落地次日审计发现协议空转）
- **修法**：`ln -sfn <真源> ~/.hermes/profiles/<p>/skills/devops/<name>`，验证 `hermes skills list [--profile p]` 显示 enabled + 子会话 `--skills` 实测非 Unknown

## 🔴 命令验证纪律

- SOUL 命令手册的 hermes 子命令必须对照 `hermes --help` 真实表（历史坑：`hermes session`×8 实为 `sessions`；`hermes hindsight`×6 根本无此子命令——hindsight 是 localhost:8888 API 服务，CLI 等价物是会话内 `hindsight_recall` 工具或 `hermes sessions search` 桥）
- 引用 `python3 <path>/xxx.py` 的脚本要 `ls` 验证存在（worldmonitor-intel 案例：调研报告产出但脚本从未落盘，按报告记录的算法参数重建+5 算法实测）
- 扫描器 D6 正则需排除 `-z` 等全局参数形态，D2 需 `find -L` 穿透 symlink

## 输出契约

审计报告模式：范围→总体结论表（维度×发现×状态）→逐项修复明细（现象/根因/修复/回归验证）→判定健康不修项（含不修理由）→待用户拍板项→修复总账。

## References

- `references/audit-findings-20260821.md` — 全集群审计实战记录（27 处失效细节、误报甄别、重复块判定）
- `scripts/rules_audit_scanner.py` — 6 维度机械扫描器（可直接复跑）

## Pitfalls

1. **扫描器误报三大源**：glob 不进子目录、rglob 不穿 symlink、正则把说明文当命令。命中后先修扫描器再信结果。
2. **grep -A6 窗口太窄会误判语义缺失**（ops 系退出协议"缺失"实为段落更靠后）——扩窗到 -A12 复核再下结论。
3. **terminal 内联命令过长触发 parser limit hardline 拦截**——拆小命令或写脚本文件后 bash 执行。
4. **同 inode（APFS clone）让 cp 报 identical**——内容共享是预期行为，非错误。
5. **跨 profile skill 归属**：`harness-entropy-management` 等真身在 default profile，orchestrator 档 skill_manage 会报 not found——本技能吸收其在本 profile 的规则审计职能，不与之冲突。
