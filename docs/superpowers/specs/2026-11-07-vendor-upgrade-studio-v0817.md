# 组件与调研栈第三方运行时版本更新批（2026-11-07）

> 用户指令：更新所有组件版本＋skill 等运行时依赖＋swarm-yuan 调研栈第三方运行时到最新。本批=vendor studio 基线升级（主件）＋全组件面盘点对账（六面＋npm 双前缀＋brew＋官方插件市场＋SKILL 依赖扫描）＋本机运行时升级＋台账全面刷新。

## 变更

1. **hermes-studio 基线 v1.0.9（`dad736a93`）→ v0.8.17（`35a7158a1`）**：谱系前进 53 提交/1354 文件（大头=tests 面 1100 文件重写＋二进制截图删除，−267K 行由此而来；依赖零变化——package-lock 仅 2 行差、package.json 只动 scripts 段，主检出 node_modules 免重装）。tag 命名说明：v1.0.9 tag 的 package.json 本就是 0.8.11，上游此后回归 0.8.x 线连发 v0.8.12~v0.8.17，**ancestry 为前进非降级**（`git rev-list --count v1.0.9..v0.8.17`=53）。执行=vendor-sync 整树换血＋VENDOR_SYNC=1 基线先行提交＋inject 重放修补。**重放修复明细（357 枚 studio 补丁全链通过）**：8 枚纯测试补丁退役（037/038/039/175/176/235/585/641，目标被上游 081b9393f 整删）；7 枚混合补丁剥除已删测试段（322/323/329/640/642/690/718）；上下文漂移重锚 8 枚（000 vitest 配置、042 版本行 0.8.11→0.8.17 校准、110 登出按钮四段重锚、393 mimo 大补丁快照重生成（上游 import 重排）、473 locale rebaseline 语义重锚（品牌行落地＋尾逗号对跳过＋overlay i18n 段 811 行尾插）、507 standalone 三段、660/690/718 GNU patch fuzz＋快照重生成）。
2. **全组件面盘点对账（2026-11-07 实测，均免动）**：hermes-agent 最新稳定 tag 仍 v0.23.0（main +216 canary 不追，稳定 tag 口径）；zcode origin/main 与钉版 `a9fe401e` 同 commit；exa 3.4.3=npm latest；semantica 最新 tag 仍 v0.7.0（main +217c 不追，D1 口径）；pua main 仍 `e6e6cd2`；REA MCP 6.8.0=npm latest；Ghidra wrapper 已绑 12.2＋JDK25=上游最新（revision 8ca9077 一致）；element-web v1.12.33=最新稳定（studio 侧无 pin，ELEMENT_WEB_DIR failsoft 引用）。
3. **本机运行时升级（不入库面，v109 批 B/C 面先例）**：superpowers 插件 6.2.0→**7.0.2**（obra/superpowers v7.0.2 缓存落位＋installed_plugins.json 备份换指，sha `22f0b463`，新会话生效）；npm 双前缀安全面 **30 包升级**（/usr/local 15 包：openspec 1.16/qwen-code 0.26.9/agent-browser 0.41.2/mmdc 12.2/cdxgen 12.9.1/depcruise 18.7/canvas 3.2.3/antv 图表三件套等；/opt/homebrew 15 包：dsh 0.2.2-rc.1/dsh-tui 0.19.0/gemini 0.67/codex 0.167/codex-security 0.8.3/playwright-cli 0.1.23/agently-cli 1.0.18/agent-desktop 1.2.0/comet 0.5.1/promptfoo 0.125.1/sharp 0.35.5 等；二进制逐个回读验证通过，sharp/canvas 原生绑定 require ok）；brew poppler →26.11.0（pdftoppm，pdf 技能面）。
4. **官方插件市场定谳**：CDN 市场（cdn-zcode.z.ai，52 项）与缓存仅 tencent-meeting-cli 相交且已对齐（0.1.3）；其余 20 个缓存插件（browser-use/documents/pdf/android-emulator 等）为 ZCode 应用自带面，随应用升级、无独立市场通道。
5. **台账订正与全面刷新**：tech-components-ledger Ghidra §4.2 行过期订正（wrapper 实为 12.2+JDK25，非 12.1.4）；DSH 行数字订正（0.1.1-rc.2/0.10.0，升级后 0.2.2-rc.1/0.19.0）；全台账 11-07 上游核对结论批注（核对子代理结果随批并入）。
6. **伴生台账同步（活登记 6 处）**：`vendor/VENDOR.md`（钉版表行＋批注记）、`README.md` 组件表、根 `AGENTS.md` vendor 表、`RELEASE-MANIFEST.json` vendorBaseline 串（顺带修 agent v0.22.7→v0.23.0 存量漂移）、`2026-10-23-swarmstudio-design-ledger.md` §C 基线行、`docs/manuals/aistudio-design-document-guide.md` 引用行。

## 决策记录

| # | 决策 | 依据 | 备选（否决理由） |
|---|---|---|---|
| D1 | studio 升 v0.8.17（tag 数字回落≠降级） | ancestry 实测 53 提交前进；v1.0.9 tag 内 package.json=0.8.11，上游版本轴本就是 0.8.x | 停留 v1.0.9（否决：放弃 6 个上游修复版） |
| D2 | hermes-agent 维持 v0.23.0，main +216 不追 | 钉版策略=稳定 tag（VENDOR.md 口径＋2026-11-03 spec D2 先例） | 追 main（否决：canary 流，回归窗口不可控） |
| D3 | zcode-acp-server 0.43.2 不升（npm latest 0.82.1） | coding-delegate 按 0.43.2 实测 schema 钉版（`runtime/hermes-skills/coding-delegate/scripts/zcode-acp-delegate.py:201`），0.43→0.82 跨协议面 | 直升（否决：破 delegate 协议假设，需独立迁移批）**→ 2026-11-07 用户令「完成未做」撤销本决策：已升 0.82.1 并真机冒烟全绿（握手/会话/工具流/end_turn/实物落盘，24s），delegate 双形态 sessionUpdate 解析天然兼容，脚本注记同批更新；属授权修订非主干漂移** |
| D4 | npm 风险面 8 项挂账待裁不盲升 | n8n 1.119→2.46（工作流基础设施大版本）/claude-mem 12→15（记忆库迁移）/oh-my-opencode 3→5/echarts 5→6（图表主版本）/zcode-acp-server（D3）/ollama（在跑 LLM 服务）/node@22（核心运行时）/openjdk@11（消费者不明）——修好新不得弄坏旧 | 全升（否决：可能击穿在跑服务）**→ 2026-11-07 用户令「完成未做」全数执行：n8n 2.46.6/claude-mem 15.11.0（双前缀）/oh-my-opencode 5.1.62/echarts 6.1.0/npm@local 12.2.2/ollama 0.40.14（服务未运行无需重启）/node@22 22.23.4_2/openjdk@11 11.0.33，二进制逐项回读可用；属授权修订非主干漂移** |
| D5 | REA BYO 缺失三件（tshark/wabt/frida）待裁 | 技能面无引用缺口在 REA pcap/wasm/instrument 三面；brew 安装各数分钟 | 本批直装（否决：扩能力非升版本，等用户点头）**→ 2026-11-07 用户令「完成未做」已装：tshark/capinfos 4.6.9（brew wireshark CLI 版）＋wabt 1.0.42（恰与 REA 验证版本精确一致）＋frida-tools 17.26.1（frida CLI 软链 /opt/homebrew/bin）；属授权修订非主干漂移** |
| D6 | 官方插件不逐个「更新」 | 市场对账定谳=应用自带面（变更 4）；市场通道唯一相交项已对齐 | 手动下载塞缓存（否决：无更新源） |
| D7 | superpowers 7.0.2 走缓存落位＋换指 | installed_plugins.json 钉 installPath 生效版本（v109 C 面配方先例） | 仅刷新缓存（否决：不换指不生效） |

## 验证

- 盘点面（已毕，2026-11-07 实测）：上游五面 git ls-remote/npm view/WebFetch 核对（结论表见变更 2）；npm 双前缀 `npm outdated -g` 对账＋升级后二进制逐个回读（30/30 可用，qwen bin 名=qwen 0.26.9）；官方插件市场 marketplace.json 拉取对账；SKILL.md 全量扫描 368 个、被引用且在装第三方命令 21 个清单化。
- **studio 基线门（已毕，2026-11-07 实测）**：vendor-sync 1345 文件与上游 `git diff --stat v1.0.9..v0.8.17`（1354 文件）吻合（差=gitignored 面）；VENDOR_SYNC=1 基线提交前 pristine 抽验 3/3（git show index vs upstream archive md5）；**clean+inject 全量重放 status=complete、461 枚 applied、零 WARN/零 FAILED/零 SKIP**（=v0230 批 469−退役 8，studio 362＋agent 91＋zcode 8）；`npm run release:check` 四模块对账全绿（cockpit=1.0.9-studio.12/agent-teams=v0.23.0-team.1/ycode=3.17.2/yuan-skill=v2.99.3，docs:check 121 路由一致）；`npm run typecheck:harness` rc=0（顺手修 pre-existing 红：golden-gate.ts 两处 Result 联合 `.problems` 访问改 `'problems' in x` 收窄，主树同错定谳=fc3ecbcca 既有非本批引入）；worktree 全量 `npm test`（manifest complete 在位，pretest noop，无 N-4 建链需求）。
- 台账门：docs-ssot-guard（spec 三处登记，附录 A 计数 588→589）；merge-invariants --check（pre-push 面）。

## 设计文档影响

DESIGN_SYNC: touched —— `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`（数字总账 §C hermes-studio 基线行 v1.0.9→v0.8.17＋核对行）、`vendor/VENDOR.md`（vendor 台账正本，钉版表行＋批注记）、`README.md`（组件表行）、`AGENTS.md`（vendor 表行）、`RELEASE-MANIFEST.json`（vendorBaseline 串，顺带修 agent v0.22.7→v0.23.0 存量漂移）、`docs/manuals/aistudio-design-document-guide.md`（版本引用行）、`team/shared/research/tech-components-ledger-20261027/tech-components-ledger.md`（Ghidra §4.2 过期行订正＋DSH 行订正＋11-07 核对结论）；A.1 三处登记（附录索引计数 588→589＋机械索引行＋design 索引两清单）；scope.yaml 同批声明。
