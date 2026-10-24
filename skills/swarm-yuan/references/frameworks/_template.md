---
ruleset_id: <id>
适用版本: <框架名> <主版本.x>（差异单独标注）
最后调研: <YYYY-MM-DD>（来源：<官方文档版本 / 官方仓库 commit / 书籍版次>）
深度门槛: 10
---

# <Framework> 规则集

<!--
使用说明：复制本模板为 <fw>.md（fw 即 ruleset_id，连字符保留，如 spring-boot.md / naiveui.md），
逐段填充。硬约束见设计文档 §4.1 三条：
  1. §3 每条规律必须挂门禁 id 或标注"人工检查"——不允许"写了规律但没有执法"
  2. §4 每个门禁 id 必须在 assets/framework-gates/<fw>.sh 中有同名实现（命名一一对应，可被脚本机械核验）
  3. §3 规律数 ≥ 深度门槛（默认 10）；成熟框架门槛更高（如 spring-boot/mybatis/vue/react ≥15），
     具体门槛由本文件头部 `深度门槛` 字段显式声明，未声明时默认 ≥10

frontmatter 四字段为 verify-framework-ruleset.sh 解析所用，命名不可改：
  ruleset_id  — 与片段 _fw_<id>_check（连字符转下划线）一一对应；文件名 = ruleset_id + .md
  适用版本    — 本规则集规律所基于的版本区间（用于规律版本区间匹配）
  最后调研    — 调研日期 + 来源（用于规则库时效检查，>6 个月 warn）
  深度门槛    — §3 规律数下限；默认 10，成熟框架可上调

§3 每条规律下须有 ```verify 块（id/cmd/expect，由 migrate-verify-blocks.sh 草稿生成 + 人工校对；framework-evidence.sh 消费）
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | <starter / 包名 / 模块名> | 高 |
| 注解 | <框架特征注解> | 高 |
| 文件 | <框架特征文件 glob> | 中（需排除他用） |
| 配置 | <框架特征配置节点> | 高 |

<!--
信号类型：依赖 / 注解 / 文件 / 配置 / 脚本调用 / 目录结构 任选能识别该框架者
置信度：高（独立可定框架）/ 中（需组合信号）/ 低（仅作辅助）
本表由 gen-framework-index.sh 扫描前几列组装成信号汇总索引，写入 assets/framework-signals.md（exploration-guide.md §C+.0.5 仅留指针）
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- <构件类>：<grep / find 命令>（计数核验基准：<如何机械计该构件个数>）
- <构件类>：<grep / find 命令>（计数核验基准：...）
- ...

<!--
枚举该框架特有的、生成时须全量列出的构件类型（与 §C+.1-FW 各框架枚举命令段呼应）
每类给一条可机械复现的命令 + 计数方式；四要素核验"构件枚举计数≥实际×0.95"依此判定
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：<标题>
- **适用版本**: 全版本 / <版本区间>
- **规律**: <规律陈述>
- **违反后果**: <后果>（尽量挂 CWE / 官方 issue / CVE 依据）
- **验证方法**: <具体 grep / read 命令，即"代码证据"采集方式>
- **对应门禁**: fw_<id>_<rule>（fail/warn 级）或"人工检查"

```verify
id: <fw>-r1
cmd: grep -rnE "pattern" --include="*.ext" "${PROJECT_DIR}"
expect: hits>0
```

### 规律：<标题>
- **适用版本**: ...
- **规律**: ...
- **违反后果**: ...
- **验证方法**: ...
- **对应门禁**: ...

```verify
id: <fw>-r2
cmd:
expect: always
```

<!-- 续至 ≥ 深度门槛 条。每条规律必须含"对应门禁"或"人工检查"——否则 verify 脚本报 NOGATE 不通过 -->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_<id>_<rule> | fail/warn | <检查逻辑一句话> | <CONF_VAR1> <CONF_VAR2> |

<!--
门禁 id 命名规范：fw_<ruleset_id>_<rule>（rule 全小写下划线）
本表每条 id 须在 assets/framework-gates/<fw>.sh 中有同名实现痕迹（grep 命中）
片段头注释 `# gates: fw_<id>_<rule>(fail) ...` 与本表 id 集合应一致
依赖变量在片段头注释 `# ruleset: <id>  requires_conf: VAR1 VAR2` 声明，
  命名约定 <RULESET_ID>_<VAR>（RULESET_ID 全大写、连字符转下划线），由 precheck.conf 框架适配段提供
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| <fw_a> × <fw_b> | <交互约束> | <机理> |

<!--
示例：
  mybatis × sharding：DML WHERE 须含分片键 / 否则跨库扫描
  lombok × jpa：@Data 排除懒加载关联字段 / 否则触发 N+1 序列化
  vue × vite：alias 须 @/custom 在 @ 前 / 否则路径解析错乱
无跨框架交互的框架可留空表头并注"无已知强交互"
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| <版本号> | <行为变化> | <对本规则集规律的影响> |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的
版本号匹配本表，落在受影响区间的项目须额外提示。
无已知陷阱可留空表头并注"无已知陷阱"
-->
