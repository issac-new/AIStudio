# 注册表（Registry）

六张 TSV 是生成器能力的权威源（WP1）：

| 表 | 回答的问题 |
|----|------------|
| `gates.tsv` | 门禁 id/flag/函数/域/执行档/enforce/conf 变量/夹具/证据等级 |
| `frameworks.tsv` | 框架规则/门禁片段/夹具/信号变量/探测命令 |
| `references.tsv` | 方法论档来源/证据/消费节点/随技能分发范围/触发 |
| `runtimes.tsv` | 上游运行时许可证/通道/包名/tag 规则/基线/整合/等级/状态 |
| `hosts.tsv` | 宿主检测/安装路径/hooks schema/适配器/证据状态（8 个有原生规则适配器 + 3 个纯技能目录目标） |
| `dist.tsv` | 目标技能文件清单/档位/模式/离线/源码包/依赖/上下文字节 |

行数与档位分布不在此手抄：运行 `bash registry-render.sh --counts`，或看 `--check` 的逐表输出。

## 规则

- TSV 为 UTF-8、制表符分隔，`#` 开头为注释；字段内禁止制表符与换行。
- 结构字段（id/path/fn/flag/计数）由初始机械导出；语义字段（`consumer_node`/`conf_vars`/`wiring`/`claim`/`family`）一次校准后，变更须评审。
- `dist.tsv` 的 `bytes` 只对 `references/` 计量（上下文税）；脚本/资产记 `-`，执行税另计。
- `claim` 只允许 M0–M4；M2+ 必须有对照证据；M3+ 必须有环境证据指针。

### 证据分级（M0–M4）

| 等级 | 含义 | 准入要求 |
|---|---|---|
| M0 | 已登记 | 注册表存在对应行，且有负责人 |
| M1 | 已接入 | 存在真实消费点，不限于文档描述 |
| M2 | 双态验证 | 违规与合规样例均通过，违规侧必须检出 |
| M3 | 环境实证 | 在真实宿主或真实仓库执行通过，附证据指针 |
| M4 | 持续回归 | 纳入每轮全量回归，失败即判定红 |

等级即对外宣称上限，不得高报；逐项退役候选由 `registry-render.sh --lifecycle` 输出。
- 不手改派生视图：`assets/facts.generated.conf`、`assets/gates-{strict,warn,advisory}.sh`（WP6 起）、`docs/upstream-baseline.md` 的 `registry:runtimes` 标记块（2026-10-24 起）。
- `references/capability-map.md` 当前仍为人工维护的策展视图；G25 做双向对账，`--capability-map` 为预留生成入口，尚未接管。

## 校验

```bash
bash scripts/registry-render.sh --check      # 六表 ↔ 代码 ↔ 夹具 ↔ facts ↔ upstream 状态表（G26）
bash scripts/registry-render.sh --facts      # 重新生成 facts.generated.conf
bash scripts/registry-render.sh --counts     # 行数与档位分布（不手抄）
bash scripts/registry-render.sh --write-upstream-baseline # 重渲 docs/upstream-baseline.md 状态表块
bash scripts/registry-render.sh --lifecycle  # claim 不足/未整合/未实证的退役候选（只读）
bash scripts/registry-render.sh --dead-facts # 列出未豁免的零消费 FACT 键
```

`--check` 已接入 `scripts/self-check.sh` 的 G26；失败即 `FAIL=1`。豁免登记：

- `docs/facts-waivers.md`：无执行消费面的叙述/台账级 FACT 键。
- `docs/coverage-waivers.md`：暂无夹具/负向断言的证据缺口（WP8 起使用）。
- `docs/enforce-waivers.md`：已知 enforce 静态/有效分层差异（WP6 起使用）。

## 当前记分（WP1 机械推算）

- 门禁 56：M2 53 / M1 3（framework/spec-first 专用执行器；pr-quality 纯 _ai_hint，见 `docs/coverage-waivers.md`）；域分布 security 10 / architecture 18 / process 11 / quality 6 / compliance 11。
- 框架 81：M2 81 / M1 0（compliance 侧 `expected-pass-ids` 全覆盖）。
- 运行时 22：15 已整合 + 2 个宿主 CLI + 5 个机制源/观察源（登记未整合）。宿主 11：6 proven（三个原生已实测 + 三个纯目录目标）/ 5 rendered（配置已渲染未实测）。
- 随技能分发与档位分布以 `--counts` 输出为准（`REG_DIST_TOTAL` / `REG_DIST_LITE` / `REG_DIST_STANDARD` / `REG_DIST_COMPLIANCE`）。
