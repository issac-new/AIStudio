---
name: skill-market-index
version: 0.1.0
description: 技能市集索引三件套：build_skill_index.py 生成静态 index.json、query_skill_index.py 按 tag/团队过滤+CJK 模糊搜索、安装前 trust 档+engines.hermes 信任门。需要技能发现/盘点/安装兼容校验时用。
license: MIT
engines:
  hermes: "^0.22"
metadata:
  hermes:
    tags: [skills, market, index, discovery, cjk-search, trust-gate, engines]
    upstream: "dsh v0.2.1-rc.2 plugin-market: packages/boot/plugin-market/src/index.ts:1,27,92 + search.ts + apps/plugin-market-generator README"
    related_skills: [skill-library-maintenance, skill-library-slimming, skill-board-scoping, hermes-skill-installation]
---

# 技能市集索引三件套（skill-market-index）

单一静态 index.json + 过滤查询脚本 + 安装信任门。解决「数百个 skill 散在
~/.hermes/skills 树（含 symlink 互指），无统一发现面」的问题。源自 dsh
v0.2.1-rc.2 插件市场机制的本地化转译（索引+Discover 思想、engines 声明门）。

## 触发条件

- 盘点/发现本机 skill：「有哪些 skill 能干 X」「按 tag/团队过滤」
- 生成或更新技能市集索引（审计、跨 profile 桥接、治理线输入）
- 安装/引用外部 skill 前的 trust 档与 engines.hermes 兼容校验

## 三件套

### 1. 索引格式 index.json（format 1）

生成：`python3 scripts/build_skill_index.py --root <dir> -o index.json`

条目字段（权威定义=`schemas/index.schema.json`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| name / version / description | str | 取自 SKILL.md frontmatter，缺省回退目录名/空 |
| tags | [str] | frontmatter `tags` 或 `metadata.hermes.tags`，缺省 [] |
| category | str | root 下第一级目录名（团队 board 的近似） |
| source | {type:"local", path} | 本机目录绝对路径；git URL 留作扩展位 |
| compat | {engines:{hermes:"范围"}} 或 null | 未声明 engines.hermes 时为 null |
| trust | {level, basis} | L0-Trusted(official-bundled) / L1-Reviewed(local-managed) / unclassified |
| installed_at | ISO8601 | SKILL.md mtime（UTC，安装时间近似） |

顶层附 `stats`（total/warnings/without_engines/trust 计数）与 `warnings`
（无 frontmatter、重名、解析失败各一条，含路径与原因）。exit 0=已写盘
（warnings 不致败）；1=root 不可读或零条目；2=参数非法。输出确定性：
内容不变则不重写文件（上游 generator 同款纪律）。

### 2. 发现面（索引+过滤查询脚本，不做 UI）

`python3 scripts/query_skill_index.py --index index.json [--text '关键词'] [--tag t]... [--category c] [--name n] [--offset N] [--limit N] [--json]`

- 切词=上游 search.ts `searchTerms()` 的 stdlib 移植：NFKC 归一，
  CJK 连续段出重叠二元组+末字，非 CJK 字母段整段一词，小写化
- 组合语义 AND；命中分级：精确 1.0 / 前缀 0.85 / 模糊 0.6
  （编辑距离 ≤max(1, len//5) 且 ≤2，仅 len≥4 词条开模糊）
- 字段权重 name×3 / tags×2 / description×1 / category×1（上游 boost 同型）
- 分页上限 100；返回 total + next_offset（上游 search() 返回形状同型）

### 3. 信任门（安装/引用前）

1. trust.level 判档：来源不明的 unclassified 按 L2-Sandboxed 处置
   （分级制度全表见 platform SOUL「Skill 安全分级制度」）；
   L3 特征（curl|bash、要全权限）直接拒绝
2. compat.engines.hermes 区间校验：
   - 未声明 → 警告不拒绝（沿用上游 engines.dsh 缺省走旧规则的语义）
   - 已声明且区间满足当前 `hermes --version` → 放行
   - 已声明且不满足，或区间语法非法（如 `workspace:*`）→ 拒绝安装，
     回复给两侧版本号

机械校验：`query_skill_index.py --index ... --check-engines <name>`
（退出码 0=ok/undeclared，1=incompatible 或未找到；undeclared 会打 warning）。
区间语法子集：`>= <= > < = ^ ~ *`、空格 AND、`||` OR。

## 上游锚（dsh v0.2.1-rc.2 源码快照，2026-10-18 delta 调研）

上游快照在位：`/Volumes/nvme2230/lab/hermes-docker-sandbox/workspace/research/dsh-delta-20261018/upstream/deepseek-harness-dsh-v0.2.1-rc.2/`

| 上游锚 | 在位职责 | 本侧转译 |
|---|---|---|
| packages/boot/plugin-market/src/index.ts:1,27,92 | Host reader / pluginMarket 服务注册 / ctx 键 | 查询脚本只读消费 index.json（无 Cordis 服务层） |
| packages/boot/plugin-market/src/search.ts | MiniSearch 模糊索引 + CJK 二元组切词 + 分页一致性 | stdlib 重实现 search_terms / select |
| apps/plugin-market-generator/README.md | index.json 格式、npm+Git 源、invalid list 判定 | 本机树扫描替代 npm+Git 源；确定性写盘沿用 |
| packages/util/plugin-market-index/src/types.ts | MarketIndex format:1 权威类型定义 | schemas/index.schema.json |

不吸收（上游 N10 裁决维持）：npm 分发面、Web UI、versions 多版本数组
（本侧 skill=frontmatter 单版本）、marketInstallTarget/安装态标注
（本侧按需用 `hermes skills list`）。

## 标准步骤

```bash
SKILL=~/.hermes/skills/devops/skill-market-index/scripts
# 1. 生成索引（对全树）
python3 $SKILL/build_skill_index.py --root ~/.hermes/skills -o /tmp/skill-index.json
# 2. 发现：模糊搜 + 过滤（CJK 二元组切词；多词=AND 交集）
python3 $SKILL/query_skill_index.py --index /tmp/skill-index.json --text '微信 失败' --limit 20
python3 $SKILL/query_skill_index.py --index /tmp/skill-index.json --tag wechat --category devops
# 3. 安装前信任门
python3 $SKILL/query_skill_index.py --index /tmp/skill-index.json --check-engines <name>
```

## 陷阱

- symlink 互指：~/.hermes/skills 顶层 symlink 指进 hermes-agent 树与兄弟
  目录，扫描必须按 realpath 去重（脚本内置 visited 集合），否则重复计数
- 顶层 symlink 目录的 category 取「可达路径首段」（如 computer-use），
  与真身分类可能不一致——判重按 name，不按 category
- 无 frontmatter 的旧 skill 进 warnings（missing_frontmatter），不进 skills
- frontmatter 解析是 YAML 子集（平铺键+点路径+行内列表+折叠块）；
  锚点、多文档等复杂 YAML 不支持，够用即可，勿向通用 YAML 扩
- installed_at 是 mtime 近似，不是真实安装时间
- 查询的模糊档是简化版（无 MiniSearch 索引结构），大索引下前缀/模糊
  扫描是线性开销；千条量级毫秒级，十万条再考虑倒排

## 验证

```bash
python3 ~/.hermes/skills/devops/skill-market-index/scripts/selftest.py
# → 全 PASS（tokenizer/frontmatter/区间/索引生成/查询/engines 门 49 项）
# 真实树基线（2026-10-19）：802 条（symlink 真身去重后），exit 0
```
