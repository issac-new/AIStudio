---
name: constraint-contract
description: "项目质量底线契约：把「好到能上线」写成 CONSTRAINTS.md（带数字、带命令、可机械检查），配棘轮（记录今日值只许变好）与 diff 级弱化守卫 floor-guard.py（拦阈值下移/测试变易/检查器静默/工作未完/例外凭空出现五种降标动作）。适用项目级长期工程（hermes-agent 源码、taskguard 部署、radar 管线）；一次性调研卡、抛弃型原型不适用。触发：项目无成文质量底线、用户说「立约束/定标准/加质量门」、agent 反复静默检查器或跳测试换绿、覆盖率或性能阈值每个 PR 争一次、需要阈值但不知定多少（先测后守）。"
version: 1.0.0
metadata:
  hermes:
    tags: [devops-worker, quality-floor, constraints, ratchet, diff-guard]
    related_skills: [pua-harness-governance, rule-system-verification, mutate-test-acceptance]
---

# 约束驱动开发（质量底线契约 + 棘轮 + 弱化守卫）

## 上游锚点（溯源必读）

来源：agent-skills v0.6.13 `constraint-driven-development`（六线增量调研 A1 裁决「强推荐」，2026-10-18 全库 grep 证实 CONSTRAINTS.md/floor-guard/棘轮 与本侧既有 skill 零重叠）。上游原文：

- `SKILL.md:29-33`（三分定位）：spec 管建什么，test 证能用，constraint 定「好到能上线」——第三者此前没人管。
- `SKILL.md:99-127`（CONSTRAINTS.md 模板）：Floor / Enforced with numbers / Measured, not yet enforced / Exceptions 四节结构，每行带命令。
- `SKILL.md:204-238`（五弱化动作 + 棘轮 + Sane Defaults）：agent 碰红灯走 cheapest road to green，看 diff 拦五种降标动作；没有数字就先测今日值再守线。
- `references/floor-guard.md`（182 行）：diff 级守卫参考实现，exit 0/1/2 契约。本 skill 的 `scripts/floor-guard.py` 是其 Python3 零依赖移植（契约逐条一致，含 untracked 文件、`.constraintsignore`）。

本文件为本地化语义复述（非翻译拼贴），锚点指向上游原文供对照。上游路径：`workspace/research/agent-skills-delta-20261018/upstream/agent-skills-main/skills/constraint-driven-development/`。

## 一句话定位

人写的代码自己读就知道好坏；agent 一个下午写的比你一周读的多，判断必须从脑子里搬到围着循环跑的检查里。这个 skill 产出的是**本项目的**质量底线成文记录——带数字、比会话活得久、能机械检查。规格驱动说建什么，测试驱动证能用，约束驱动定义「好到能上线」，让争论发生在写进文件之前而不是每个 PR 里。

## 适用面声明

适用：项目级长期工程——hermes-agent 源码、taskguard 部署（~/.hermes/services/taskguard）、radar 管线这类会持续接收变更、值得守线的目标。

不适用：一次性调研卡、spike、抛弃型原型；项目已有 CONSTRAINTS.md 且用户没要改（此时读它并遵守，而不是重建）；用户要的是即时 code review（走 review 技能）或 CI 流水线搭建。与非交互上下文（CI/cron/headless kanban run）四问访谈不可用——落 Floor + Sane Defaults 兜底并注明。

## 核心循环（五步）

### 第 1 步：先查后问

能读到的不要问。动手前先盘：语言栈（pyproject.toml/package.json/go.mod/Cargo.toml）、测试跑器（dev 依赖、test 胫本）、既有 linter（ruff/eslint/biome 配置）、当前覆盖率（coverage/ 输出或先跑一遍套件）、CI（workflows）、agent 入口（AGENTS.md/CLAUDE.md/.claude/）。两行汇报盘到了什么，只问剩下缺的。

### 第 2 步：四问访谈（各有默认值，「不知道」是完整答案）

遵守一问一题纪律，但每问都带默认值——用户答「不知道/随便」仍能产出可用配置。问到四问为止，十二问的 intake 只会产出没人懂的配置。

```
Q1 除了底线，还要强制哪些维度？
    (a) 新代码测试覆盖率 (b) 安全扫描 (c) 性能预算 (d) 无障碍 (e) 架构边界
    默认：(a)+(b)。说清代价：(c)(d) 需要可访问的 URL，(e) 需要写规则文件。

Q2 检查在任务中途失败，阻断还是警告？
    默认：底线阻断，其余前两周只警告。无人值守跑的 agent，没人读的警告等于没有。

Q3 有目标数字吗，还是先测今日值守线？
    默认：先测后守（见棘轮）。拍脑袋的数字会被无视；凭空定 80% 只会换来永久红灯。

Q4 交还工作前能容忍最慢的检查是多少秒？
    默认：任务收尾 90 秒内，CI 不限。超了就会被关掉，被关掉的门比没有门更糟——线看起来还在。
```

**非交互上下文禁访**（CI、cron、kanban headless run）：四问需要活人。此时直接落 Floor + Sane Defaults 兜底，在交付物里注明「未访谈，用了默认值」，把待定项 flag 给人。

### 第 3 步：落 CONSTRAINTS.md（每维度映射本侧 de facto 工具）

仓库根目录一文件，任何 harness 上的任何 agent 都能读，改动它会在 review 里露面。四节结构：

```markdown
# Constraints
Last reviewed: 日期 by 责任人

## Floor（始终强制，零安装）
- 不新增压制注释：# noqa、# type: ignore、@ts-ignore、eslint-disable
- 不留未完成工作：throw NotImplemented、空 catch{}、TODO 顶实现
- 不跳过/删测试而无 commit 理由
- 溎码无密钥
- 本文件不得为让变更通过而弱化

## Enforced with numbers（带数字）
| 维度 | 规则 | 命令 | 期望 | 跑在 |
（每行命今天就跑得通；带数字没有命令的维度是愿望，不是约束）

## Measured, not yet enforced（棘轮）
| 指标 | 今日值 | 方向 |
（记录实测值 + must not fall / must not grow）

## Exceptions（例外）
| ID | 规则 | 路径 | 理由 | 主 | 到期 |
（例外必须有主和到期日，新行会被守卫拦下要求讨论）
```

每个维度选了就要装对应工具，别留数字不给机制。本侧 de facto 工具映射：

| 维度 | 本侧工具 | 命令样例 |
|------|---------|---------|
| 测试（Python） | pytest | `pytest -q` |
| 覆盖率 | pytest-cov | `pytest --cov --cov-report=term`（读既有输出与 git diff 求交，别跑第二遍套件） |
| Lint | ruff | `ruff check .` |
| 类型 | mypy / tsc | `mypy .` / `tsc --noEmit` |
| 密钥 | gitleaks | `gitleaks detect --redact --no-banner`（--redact 不是可选项——命中的密钥值落进 transcript 就是泄漏） |
| 安全代码 | semgrep | `semgrep scan --config p/default`（贵检查限定到 diff 涉及路径） |
| 依赖漏洞 | osv-scanner | `osv-scanner scan source -r .` |
| 存在性/锚点 | rg / 自定义脚本 | 部署定制类维度（文件在位数、补丁在位数、模式值、端点数）用 grep 计数即可机械判定 |

落完在 AGENTS.md/CLAUDE.md 各加一行：`Read CONSTRAINTS.md before writing code. Do not weaken it to make a change pass.`

接线到生命周期（成本决定位置）：编辑后快查 <5s 只动变更文件；任务收尾相关测试+变更行覆盖 <90s；review 阶段全量+守卫；CI 方向检查。把命令同时写进项目 script（check:fast / check:task / check:full），但 CONSTRAINTS.md 是唯一真源，script 漂移以文件为准。

### 第 4 步：棘轮（没有数字时的免决策采纳）

在 62% 覆盖率的库上定 80%，得到的是永久红灯和习惯性无视红灯的团队。棘轮不要求任何决策：**记录今日值，拒绝变差**。落在「Measured, not yet enforced」表里，每次检查对照记录值而非愿景值。数字变好了就更新记录；变差了，那个变更就是 finding。这补上了训练不惩罚的缺口——架构腐化以月计，永远到不了权重里，棘轮就是写在建能看见的地方的罚项。容差 0.5%，吸收无关文件挪动的漂移。

### 第 5 步：守卫底线本身（diff 级五弱化拦截）

「agent 写代码也写检查，检查就证明不了什么」——半对。agent 不钻精巧漏洞，它碰红灯走最便宜的变绿路。在 diff 上看五种动作（本侧判定语义）：

1. **阈值移动**：CONSTRAINTS.md 里 min 数字变小、max 数字变大、快查阶段被移走一条检查。对照分支点版本读。方向读不出的数字变化一律上报（守卫分不清收紧放松时，沉默是错误的默认）。
2. **测试变易**：新增 .skip/@pytest.mark.skip/xit、删测试文件、留存测试里抽断言。
3. **检查器静默**：新增 # noqa、# type: ignore、@ts-ignore、eslint-disable；四种尤其危险——istanbul ignore 把代码从覆盖里剔掉、Stryker disable 藏活突变、nosemgrep 和 gitleaks:allow 灭安全发现。
4. **工作未完**：throw NotImplemented 的 stub、空 catch 把失败变沉默、TODO 站在实现该在的位置。
5. **例外凭空出现**：Exceptions 表多了一行没人讨论的。

这五种不需要超出 git diff 的工具。**Tightening should be silent; loosening should be loud**（收紧可以无声，放松必须响亮）。机械执行用本 skill 自带守卫：

```bash
python3 <skill目录>/scripts/floor-guard.py [--base origin/main]
# exit 0=干净；1=至少一条弱化，阻断变更；2=无法判定（非 git/无 merge base），绝不当 0 读
```

按来源分检查的循环度：外部（axe 编码 WCAG、osv-scanner 读漏洞库——agent 争不动）＞ 项目（自家 lint 规则，人持有）＞ 套件（自家测试，最有用也唯一真正循环的）。全是第三种的质量线，价值低于有一条外部意见的。确保至少一条外部约束在场。

## Sane Defaults（用户无偏好时用，均多数库首日可达）

| 纳束 | 默认值 | 为什么是这个数 |
|------|--------|---------------|
| 变更行覆盖 | ≥ 80% | 高到逼出测试，低到放配置行过去 |
| 项目覆盖率 | 今日值，不得下降 | 采纳零争论 |
| 突变得分（如启用） | ≥ 60% 起步 | 从没突变过的套件的典型值；80% 是成熟 |
| 依赖漏洞 | 无 high 及以上 | 再往下多是噪音 |
| LCP / CLS | ≤ 2500ms / ≤ 0.1 | Core Web Vitals good 档 |
| 无障碍 | axe critical/serious 归零 | moderate/minor 常有争议 |
| 例外寿命 | 90 天 | 够排修复，还不至于忘 |
| 棘轮容差 | 0.5% | 吸收无关文件挪数 |

报数字必须连理由一起说；没有理由的阈值会被下一个撞上它的人删掉。

## 升级阶梯（牙齿三档，多数项目停在 2）

1. **成文**：CONSTRAINTS.md 存在且 agent 读它。零成本，拦诚实错误，依赖 agent 自觉。
2. **脚本化**：check:fast 挂 post-edit 钩子与 CI + floor-guard.py 守 diff。确定性，无新依赖。首次可以只落 Floor——守卫纯 diff 无需安装，第一天就能保护首个 commit。
3. **工具化**：配置长过 ~30 行 check 脚本时才上专用 runner（预算/棘轮/守卫托管）。

## 常见合理化对照

| 借口 | 现实 |
|------|------|
| 「代码稳了再加约束」 | 代码会稳在它动的时候被允许的样子上 |
| 「测试就是约束」 | 自己写的测试只证明你同意自己；新代码覆盖、依赖风险、体积增长它一个都不说 |
| 「80% 打不到」 | 那就别定 80%，定今日值守住它 |
| 「例外太麻烦」 | 带主带到期日的例外解一时的锁；删约束解的是永远的锁 |
| 「这会拖慢 agent」 | 只有慢检查塞进快循环才拖——那是放置错误，不是反对约束的论据 |

红旗：访谈超四问、定了今天就不达标的预算且无路径、有数字无工具的维度、手搓 de facto 已有的检查器、全约束出自自家套件无一外部、CONSTRAINTS.md 与失败功能同 commit 改动、例外无主或到期超一年、agent 提议放宽阈值而不是修代码、慢检查进了编辑循环且有人开始 --no-verify。

## 与姊妹技能的边界

- `pua-harness-governance` 管**谁来验证**（四权分离防 agent 自评作弊）；本 skill 管**验证什么标准**（质量底线契约）。二者正交，常组合：契约定线，四权定权。pua 管不到「项目质量底线会被 diff 悄悄磨低」——那是本 skill 的 floor-guard 的职责。
- `rule-system-verification` 管**规则系统自身的测试**；本 skill 管项目代码质量的守线，不测规则引擎。
- `mutate-test-acceptance` 是本 skill「断言质量」维度的一个具体执行器。

## 验收（本 skill 应用正确的标志）

- [ ] CONSTRAINTS.md 存在，每个数字都带理由
- [ ] Floor 在当前代码库上不改一行就能全过
- [ ] 用户选的每个维度都有已装工具 + 今天就跑得通的命令
- [ ] 每条约束写明跑在哪一层，快层保持秒级
- [ ] 至少一条约束是外部的（不由本项目自家测试判定）
- [ ] 只测不罚的指标记录了今日值和方向
- [ ] 例外有主有到期日
- [ ] AGENTS.md 或 CLAUDE.md 指向该文件
- [ ] 当前分支试跑一次，没有用户不同意的失败
