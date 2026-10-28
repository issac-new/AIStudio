---
name: mutate-test-acceptance
description: "变异测试验收：mutmut 改坏源码跑测试，量化断言质量。用于增量/修改的单测验收，产出变异得分+存活变异体清单。"
version: 1.0.0
metadata:
  hermes:
    tags: [testing, mutation-testing, mutmut, test-quality, verification, wx-fusion-20261016]
    related_skills: [rule-system-verification, test-driven-development, defect-fix-acceptance]
---

# 变异测试验收（mutation testing acceptance）

> 来源：文章A《3个月用Harness重写90万行旧代码》§2.2 机制 A3，2026-10-16 由 C2 子卡落地（demo 实测见 research/wx-fusion-20261016/ws-c2-mutation/REPORT.md）。
> 定位：**测试质量防线**——覆盖率只说明"覆盖到没有"，说明不了断言质量；AI 既写函数又写测试时易出定制化断言，错的行为也能通过测试。变异测试通过故意改坏源码（`<`→`<=`、条件反转）再跑测试来量化：改坏后测试必须失败，否则断言弱。

## 何时用

- **增量/修改的单测**：本次 diff 新增或改动的测试模块（对齐文章A建议——全量变异跑数百遍测试，只对增量跑）。
- 收到 coder handoff 声称"测试全绿"但需评估断言质量时。
- 验收标准含"测试有效性/断言严谨性"要求的卡。
- **不适用**：旧存量单测不当场验收（登记为技术债另开卡）；无纯函数/逻辑分支的纯配置文件。

## 命令

```bash
# 0. 前置：被测项目自己的 venv 内装工具（禁系统级安装）
pip install mutmut

# 1. 配置（setup.cfg 或 pyproject.toml，二选一）
#    setup.cfg:
#    [mutmut]
#    source_paths=src/          # 旧名 paths_to_mutate 已弃用
#    tests_dir=tests/           # 旧名仍兼容，会有 UserWarning
#
#    防缓存坑（mutmut 3.8 实测）：mutants/ 内含同名测试副本，
#    残留后裸跑 pytest 报 import file mismatch rc=2，必须排除：
#    [tool:pytest]
#    norecursedirs = mutants .venv history .mutmut-cache

# 2. 跑变异测试（先确保 pytest 本身全绿，绿了再跑，否则结果无意义）
python -m pytest -q && mutmut run

# 3. 看结果
mutmut results              # 存活变异体清单
mutmut show <mutant-id>     # 单个存活变异体的具体 diff（改了哪行）

# 4. 判读每个存活变异体：
#    - 真弱断言 → 补边界断言（见下方模式），修复后重跑 mutmut run 确认被杀死
#    - 等价变异体 → 用区分点输入实测证明"任何断言都无法区分"后记录豁免，不计入弱断言
```

得分公式：`变异得分 = 被杀死变异体数 / 总变异体数`。行业参照（文章A，会随 AI 演进变化）：AI 生成测试常 20-40 分，人写 60-80。

## 弱断言修复模式（demo 实测验证）

- 分支边界类（最常见）：`x < 0` 存活 → 测试漏了 x=0 或 (0,1) 区间小数。补**区分点输入**的精确断言。
- 比较符相邻类：`<=` 改 `<` 存活 → 补边界等值断言（如 shipping_fee(3)==8）。
- 区间中点类：`x<=3` 改 `x<=4` 存活 → 补 (3,4) 区间内一个值（如 3.5）。
- 等价变异体识别：边界两路返回值数学相等（如 absolute(0)：`-0 == 0`）→ 豁免并记录。

## 耗时估算

- 环境准备（venv + 装包 + setup.cfg）：~5 分钟。
- 跑一轮 mutmut：约 `总变异体数 × 单测全量时长`。demo 实测 34 变异体 × 0.14s 测试 ≈ 7-11s（mutmut 3.8 有测试-变异体关联裁剪，实际更快）。
- 生产仓估算：全量单测 1 分钟的仓，数百变异体 → 30 分钟起。**所以只对增量跑**。
- 每个存活变异体判读+修复+复跑：约 5-10 分钟。

## 红线

- **旧单测不当场验收还债**：存量单测的弱断言登记技术债另开卡，不在当前验收卡内顺手修。
- **禁对大仓全量跑**：只跑本卡 diff 涉及的模块/文件（mutmut source_paths 指向增量目录）。对 hermes 仓或其他仓全量跑变异测试 = 禁止。
- **禁系统级安装**：mutmut 只装进被测项目自己的 venv。
- **pytest 不绿禁止跑 mutmut**：基线红了先报 block，变异结果无意义。
- **得分不设硬门禁一刀切**：得分是质量信号不是 KPI；存活变异体必须逐个判读（真弱断言 vs 等价变异体），禁止不判读就批量豁免或批量补断言。
- **改坏源码只发生在 mutmut 管理的 mutants/ 缓存里**，跑完确认 `git status` 源码无残留改动。
- **变异跑完清缓存或配 norecursedirs**：mutants/ 残留会让同目录裸 pytest 收集冲突 rc=2；验收前确认该目录已清或已被排除。
