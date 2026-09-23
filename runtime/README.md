# 基础运行时层(overlay/runtime)

SwarmStudio 的「基础运行时」:两个经源码级调研后选定、按固定版本 pin 下来的外部
运行时,分别承载《AI-Native 研发范式实践手册》(2026-09-19)企业级基础设施框架中的
两大能力位。更新流程见下文 SOP —— 本目录是对上游的**受管镜像**,不是 fork:

| 运行时 | 能力位(手册章节) | 形态 | 接入方式 |
|---|---|---|---|
| **semantica** v0.7.0 | 企业知识库(§3.1.2)+ 工具体系(§3.1.3):Context Graph、知识图谱、实体/关系抽取、RETE/Datalog 推理、PROV-O 决策溯源 | Python 库 + stdio MCP server(14 工具) | `semantica/manifest.yaml` 经 patch 375 进 hermes-agent `optional-mcps/` 目录;`hermes mcp install semantica` 或 studio MCP 浏览器安装 |
| **pua** @e6e6cd2 | Skill 体系(§3.1.3):调试方法论五步法、抗借口/主动性强制、L0-L4 压力分级、15 味话术库 | 12 个文件系统技能(SKILL.md + references) | `pua/skills/` 经 `skills.external_dirs` 只读挂载(register-runtime.mjs 注册一次,所有会话可见)。实弹装载 12/12 |

## 目录

```
runtime/
├── semantica/
│   └── manifest.yaml      # MCP 目录清单(单一事实源;patch 375 的生成源)
└── pua/
    ├── PIN.yaml           # 上游 repo/ref/commit/技能清单(脚本生成)
    ├── ATTRIBUTION.md     # 来源与许可声明(脚本生成)
    └── skills/<12 个技能>/ # vendored 技能(脚本所有,勿手改)
```

## 更新 SOP(后续持续更新)

semantica 升版(改 pin 的 tag):

1. 改 `semantica/manifest.yaml` 的 `install.ref`(用新 release tag,不用 main)。
2. 重生成 patch:`git diff --no-index --src-prefix=a/ --dst-prefix=b/ /dev/null runtime/semantica/manifest.yaml > /tmp/m.yaml` 再套 `optional-mcps/semantica/` 路径(或临时目录法,见 patch 375 的生成记录)。
3. `npm run clean && npm run inject` 验证 375 应用;`npm run runtime:doctor` 过硬检查。
4. 用户侧 `hermes mcp install semantica` 重装(clone pinned tag,全新 venv)。

pua 升版(追上游):

```bash
npm run runtime:vendor-pua -- --ref main        # 从 GitHub 拉最新
# 或本地已有检出:npm run runtime:vendor-pua -- --source /path/to/pua --ref main
npm run runtime:doctor                          # PIN↔skills 对账硬检查
```

同步时会做一类最小规范化:frontmatter 里 YAML 1.1 布尔裸值
(`name: yes` 这类)加引号 —— 否则 hermes(pyyaml)把 name 读成布尔,
技能被静默跳过(2026-09-23 实弹发现,12 技能只装载 11)。规范化过的技能
记录在 PIN.yaml 的 `normalized` 段;上游修复后该段为空即自然撤销。

profile 注册(每个 HERMES_HOME 一次,幂等):

```bash
npm run runtime:register -- --hermes-home ~/.hermes
npm run runtime:doctor   -- --hermes-home ~/.hermes   # 软检查注册/安装状态
```

## 设计决策(为什么这么接)

- **semantica 走 MCP 目录清单而非改 agent 代码**:hermes-agent 的 `optional-mcps/`
  目录遵循 "presence = approval" 语义,studio MCP 浏览器与 `hermes mcp install` 都
  消费它 —— 一条 manifest 获得全链路(发现/安装/探测/工具清单/回滚)而零 agent 侧
  改动。安装走 git pinned tag + 独立 venv,与 agent 运行环境隔离。
- **pua 走 `skills.external_dirs` 而非复制进 `~/.hermes/skills/`**:外部目录语义是
  只读共享、本地优先 —— 升级只更新 overlay 一处,全部 profile 生效;不存在多 profile
  逐份复制漂移的问题。
- **两侧都 pin 不可变 ref**(tag / 40 位 commit),doctor 硬检查拒绝 `main`/`HEAD`
  浮动 ref:运行时可复现是《手册》"可复现环境"原则在本层的落法。
- **单一事实源**:`runtime/` 内文件是源,`optional-mcps/` 内的 patch 375 是派生
  物,doctor 校验两者逐字节一致 —— 改了一边忘另一边会在门禁当场失败。
