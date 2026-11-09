# 2026-11-09 swarm-yuan 技能根统一 ~/.agents/skills（自身安装＋生成技能默认落点）

> 来源：用户裁定（2026-11-09 会话指令）「swarm yuan skill 及生成的定制化研发技能 skill 都默认放到 ~/.agents/skills 统一起来实现跨工具通用」。动机＝消除三处口径分裂：install.sh 检测到宿主即分流装各宿主目录（本机实况 `~/.zcode/skills/swarm-yuan`）、generate-skill.sh 默认落项目内 `.agents/skills`（2026-10-29 口径）、本机 aistudio-dev 为历史显式 target-dir 装到 `~/.zcode/skills` 的家级部署。zcode 侧 `~/.agents/skills` 已是原生发现根（原生 `.agents` root＋zcode-patches 009 兼容面），技能模板内部跨根探测（`.claude/.agents/.zcode` 多根候选）已就绪——家级统一只需改默认值，不动模板探测逻辑。

## 变更

1. **install.sh auto 默认统一（A）**：`skills/swarm-yuan/install.sh` auto 分支改为**无论检测到几个宿主，默认一律装 `~/.agents/skills`**；打印检测到的宿主清单＋分流提示（zcode 原生可见；claude 等非原生宿主用 `--claude` 显式旗标或符号链接）。删除 auto 分支的单宿主分流与多宿主交互菜单；`--all`、`--zcode`、`--claude` 等显式旗标全部保留。文件头用法注释同步。
2. **generate-skill.sh 默认落点改家级（B）**：`skills/swarm-yuan/scripts/generator/subcommands.sh` `detect_skill_dir` 改四级探测（新增 skill-name 参数，调用点 `generate-skill.sh` 传入）：①项目内既有 skills 目录→复用（探测序不变，存量兼容）；②`~/.agents/skills/<name>` 存在→家级正位（upgrade 命中）；③`~/.zcode/skills/<name>` 存在→legacy 家级原位续命＋打印迁移建议；④兜底→`~/.agents/skills`（新默认）。`detect_runtime_name` 文案同步。SKILLS_PATH_REWRITE 自动推导不扩展到家级目标（与现存家级部署 aistudio-dev 同构：家级不重写、靠模板多根探测兜底）。
3. **render-tools 家级判定补 `.agents`＋HOME 归一化加固（C）**：`skills/swarm-yuan/assets/tool-adapters/common.sh` `ta_is_user_level` 枚举加 `~/.agents`（经新增 `ta_home_norm` 归一化比对）——否则 `~/.agents/skills/swarm-yuan` 被误判项目级，渲染块会写错目标文件。归一化修存量潜伏缺陷：skill_dir 经 cd+pwd 绝对化会折叠路径双斜杠（macOS TMPDIR 尾斜杠产生 `T//`），而 `$HOME` 原串不折叠，原串比对在该形态失配（test-default-skill-dir 沙箱实测复现）；比对前 `cd $HOME && pwd` 归一，HOME 不可达回退原串。
3a. **agents 安装目标交叉渲染/注销（A 续）**：`skills/swarm-yuan/install.sh` 新增 `_agents_native_tools='zcode'` 单一事实源——装/卸 `~/.agents/skills/` 时自动向原生读该根的宿主（当前 zcode）渲染/注销 AGENTS.md 集成块。否则统一默认后 zcode 会话集成块缺失（新装）或指向已卸载旧路径（迁移），门禁命令全死链。user 级「只写宿主已装的」守卫（R126）自动兜住未装宿主；hermes/dsh/ccswitch 维持纯 skills-dir 零渲染。
4. **文档口径（D）**：`skills/swarm-yuan/SKILL.md` 安装/落点口径行、`docs/usage-manual.md`（选项表补 `--agents` 行、检测说明、示例路径、auto 行为）、`README.md` 离线描述核对、`CHANGELOG.md` 补条目。
5. **离线通道核对（E）**：`skills/swarm-yuan/scripts/make-offline-bundle.sh` 注释漂移修正＋知识入驻落点枚举核对；`scripts/offline-template/zcode/AGENTS.md` 渲染块路径随新默认更新。
6. **测试锁定（F）**：`skills/swarm-yuan/tests/test-default-skill-dir.sh` 改造——空项目断言家级落点；家级目标不推导重写＋项目级显式 target-dir 仍推导；存量项目内复用/双目录探测序不变；新增 legacy `~/.zcode/skills/<name>` upgrade 命中、家级 `.agents` 命中、install.sh auto 在伪造含 `~/.zcode` 宿主的 HOME 下仍装 `~/.agents/skills`。

### 涉及文件

- 修改：`skills/swarm-yuan/install.sh`、`skills/swarm-yuan/scripts/generator/subcommands.sh`、`skills/swarm-yuan/scripts/generate-skill.sh`（调用点传 skill-name）、`skills/swarm-yuan/assets/tool-adapters/common.sh`、`skills/swarm-yuan/SKILL.md`、`skills/swarm-yuan/docs/usage-manual.md`、`skills/swarm-yuan/README.md`、`skills/swarm-yuan/CHANGELOG.md`、`skills/swarm-yuan/scripts/make-offline-bundle.sh`、`skills/swarm-yuan/tests/test-default-skill-dir.sh`、`scripts/offline-template/zcode/AGENTS.md`
- 登记件：`.swarm-yuan/decisions.jsonl`（UserChallenge 条目）、`.qgate/scope.yaml`（核对既有 `skills/swarm-yuan/**` 覆盖）、附录 A（计数 603→604＋A.1 行）、`docs/manuals/aistudio-design-document-index.md`

### 本机部署迁移（合并后执行，不属于提交面）

`install.sh --agents` 装新位 → `--uninstall --zcode` 旧位存档移除（防 zcode root 序 `.zcode` 优先遮蔽）→ `mv ~/.zcode/skills/aistudio-dev ~/.agents/skills/` 后 `--upgrade` 家级原位升级 → `--render-tools` 重渲染 `~/.zcode/AGENTS.md` 块内绝对路径 → 新会话活体验证。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | auto 安装检测到宿主仍统一 `~/.agents/skills`，不再分流单宿主/多宿主菜单（用户指令字面） | 「检测到 claude-only 就装 ~/.claude」会重新引入分裂——统一默认＋输出面提示（非原生宿主走显式旗标/符号链接）才达成跨工具单副本；`--all`/`--<host>` 显式通道全保留，多宿主需求有出路 |
| D2 | 生成技能默认改**家级** `~/.agents/skills`（`~` 前缀，用户指令字面），不是项目内 `.agents/skills` | 项目内落点会让技能随仓不随人，与本机 aistudio-dev 家级实况及「跨工具通用」目标不符；家级的跨项目重名风险以「命名建议带项目标识＋覆盖时告警」缓解 |
| D3 | 存量项目内 skills 目录仍复用优先（探测序不变） | 一律家级会打破存量项目（2026-10-29 口径下生成的技能原地失联）；只对**新默认**生效，存量零迁移成本 |
| D4 | legacy 家级 `~/.zcode/skills/<name>` 探测续命（upgrade 原位＋迁移建议），不强制搬 | 本机与其他机器存在历史家级 `.zcode` 安装；升级链静默失联比暂留旧位更危险；迁移由本机部署动作显式完成 |
| D5 | SKILLS_PATH_REWRITE 推导不扩展家级 | 现存家级 aistudio-dev 即「不重写＋多根探测」形态且活体可用；扩展推导会改变与存量家级部署的内部一致性，收益为零 |
| D6 | `ta_is_user_level` 补 `~/.agents` 为随批必改 | 渲染块目标文件定位依赖该枚举；缺它则 `~/.agents` 家级技能的 render-tools 全部落错位置 |
| D7 | team/ 域的 `~/.zcode/skills` 符号链接逻辑与 Windows 离线包 `.zcode` 配置面整树落位不动 | 前者是 hermes team 域自有机能（跨域）；后者是 D14 决策的配置面通道，仅核对 AGENTS.md 文案与实际落位一致 |
| D8 | agents 安装目标向 zcode 交叉渲染/注销（`_agents_native_tools` 单一事实源，空格分隔可扩） | 不交叉渲染＝统一默认后 zcode 集成块缺失/死链；全量 8 宿主渲染会给 codex/gemini 等不读 `~/.agents` 的宿主写死引用；只渲 zcode（原生读该根）是最小正确面 |
| D9 | `ta_is_user_level` 比对前 HOME 归一化（cd+pwd） | 存量缺陷：HOME 原串与绝对化路径形态不一致（TMPDIR 尾斜杠 `T//`）时家级误判 project 级——渲染块写错文件；新默认使该比对成为关键路径，随批根治（修好新不欠旧账） |

## 验证

- `bash skills/swarm-yuan/tests/test-default-skill-dir.sh`——14/14 断言绿（①家级落点/②家级不重写＋项目级仍推导/③④存量复用/⑤家级命中/⑥legacy 续命/⑦安装交叉渲染与卸载注销/⑧⑨auto 不分流；生成与安装断言全部伪造 HOME 隔离）。
- `bash skills/swarm-yuan/tests/test-r128-install-uninstall.sh`（rc 0）、`test-r118-install-hardening.sh`（PASS，④⑫段随 auto 零交互语义更新）、`test-r141-relocate.sh`（PASS）、`test-r103-host-hooks.sh`（PASS，5b 改行为断言锁 `~/.kimi-code`＋`~/.agents` user 级）、`test-r134-everything-bundle.sh`（rc 0）、`test-zcode-adapter.sh`、`test-codex-adapter.sh`（均 PASS）——回归面绿。
- `bash skills/swarm-yuan/scripts/self-check.sh`——rc 0。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`——7/7；`node scripts/maintenance/gen-doc-indexes.mjs --check`——0 problem（随批修复 design 索引存量合并冲突标记与两处陈旧计数：613/160 按文件系统实盘归一）。
- 全量 `npm test`（合并前）——结果见合并时留痕。
- 本机迁移后活体：新会话从 `~/.agents/skills` 加载 swarm-yuan/aistudio-dev；`bash ~/.agents/skills/swarm-yuan/assets/precheck.sh --all` 跑通；aistudio-dev self-check 新根跑通。

## 设计文档影响

DESIGN_SYNC: none——本批不触及 DESIGN_DOCS 注册表四正本（docs/DESIGN.md／design-ledger／harness2-improvement-workbench／rrsi-regularized-workbench）；swarm-yuan 技能自身操作正本（SKILL.md 安装与落点口径行、usage-manual 安装节、CHANGELOG Unreleased 节）已随批修订保持三方一致（规范=本 spec、设计=SKILL.md 口径、实现=install.sh/generate-skill.sh 探测序），附录 A 计数（603→604）与 design 索引（存量合并冲突标记随批定谳）亦随批同步——技能自身文档不属于注册表面（先例：Ponytail v5 批技能 README 走 none 附理由）。
