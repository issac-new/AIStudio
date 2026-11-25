# 2026-11-25 swarm-yuan 技术手册进位 v2.103.0：事实对齐与四版新内容补写

> 缘起：用户要求"swarm yuan 的版本更新到最新版"，并在两个方案里选了 B（对齐事实＋补新内容）。当前载体 `RELEASE-MANIFEST.json` 与 `skills/swarm-yuan/CHANGELOG.md` 为 **v2.103.0**（2026-11-22）；三份手册停在 v2.100.x，且 `custom/__tests__/interactive-training-manual.test.ts` 两处把 `v2.100.1` 写死为必须出现的字符串。探查以机械计数为据：`skills/swarm-yuan/assets/facts.conf` 的门禁数字（59＝FULL 53＋advisory-only 6；standard 32＝核心 12＋架构 20；compliance 19）与指南现行文字逐项吻合；**配置变量已由 204（core 30＋arch 126＋compliance 48）变为 205（core 31＋…）**（v2.100.4 起），两份手册仍写 204。v2.100.1→v2.103.0 四个版本新增的能力（v2.101.0 独立审查协议＋活文档漂移方法论＋回合计数分层；v2.103.0 三类门 vendor 盲区根治）在三份手册中零覆盖（关键词全文零命中）。

## 变更

1. **`docs/manuals/aistudio-swarm-yuan-guide.html`（技术指南）**
   - 版本：`<title>`、页头 `当前版本`、页脚三处 v2.100.1→v2.103.0；页头眉题与页脚"核实日期"改 2026-11-25。
   - 数字：第 01 节 `204 配置变量 = core 30 + arch 126 + compliance 48`→`205 = core 31 + arch 126 + compliance 48`。
   - **新增第 11 节「独立审查协议」**（原 11—14 顺延为 12—15；目录同步）：三个角色与独立性判据、冷读派发白名单/黑名单、派发阶梯与无子代理停机、S1—S4 四阶段、反谄媚语言契约、收敛语义（`not run`≠零发现、连续两轮 clean 才算 converged、上限 5 轮）、留痕字段、机检开关 `REVIEW_RECORD_REQUIRED`、最小可行做法。
   - 第 06 节新增 `<h3>`「活文档漂移：指纹没变，内容也可能已经漂移」：与结构指纹的分工、四类漂移、比对程序、修复双向。
   - 第 09 节新增段落「扫描范围不含 vendor/」：三处排除的真实落点与原因。
   - 第 06 节（顺延后）末尾补回合计数分层三判据。
   - 源码索引表新增三行：独立审查协议、活文档漂移、vendor 盲区。
2. **`docs/manuals/aistudio-interactive-training.html`（交互课件）**：`development-swarm-yuan-tech` 场景的 `summary` v2.100.1→v2.103.0；`proof` 的 `204 变量`→`205 变量`；步骤 `配置变量 204=30+126+48`→`205=31+126+48`；新增一步覆盖独立审查协议。
3. **`docs/manuals/aistudio-swarm-yuan-developer-guide.md`（研发指南）**：头部"当前版本"v2.100.3→v2.103.0；`CHANGELOG.md:3-11`→`:3-8`（两处）；头部新增一条"独立审查协议"要点；L753 的"不证明当前 v2.100.3"→v2.103.0。
4. **守门断言**（`custom/__tests__/interactive-training-manual.test.ts`）：两处写死的 `v2.100.1` 改为从 `RELEASE-MANIFEST.json` 读取版本后断言（不再硬编码）；新增结构断言：技术指南、交互课件、研发指南三处的 swarm-yuan 版本必须等于发布清单；指南里的配置变量分解必须等于 `facts.conf` 的三个 `FACT_CONF_VARS_*` 之和。
5. **决策留痕**：`decisions.jsonl` 落一条。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 选 B：对齐事实＋补新内容，不选只改数字 | 用户裁决（"B"）。只改版本号会让手册自称 v2.103.0 却不覆盖这四版的新能力 |
| D2 | 独立审查协议写成一整节，活文档漂移与 vendor 盲区写进既有节 | 协议自成体系（角色/派发/四阶段/收敛/留痕），内容量与现有第 08 节 spec-first 相当；后两者分别属于"升级与兼容"和"precheck 判读"的既有话题，单列成节会让目录碎片化 |
| D3 | 新增内容的每条源码行号以**当前 main 文件**为准，不以 CHANGELOG 或提交 diff 的行号为准 | 实测：v2.103.0 的提交 `77c104e8d` 里 `floor-guard.sh` 的排除在 80/91 行，当前文件已在 100/111/116 行；照抄提交 diff 即错 |
| D4 | 数字一律取机械计数或实测值，不抄 CHANGELOG | CHANGELOG 是叙述，可能与实物有出入。本批：门禁与配置变量数取自对 `assets/` 四个门禁文件与三个 conf 的机械计数（与 `facts.conf` 逐项吻合）；协议测试"15 断言"取自本批实跑 `tests/test-review-protocol.sh`（15 passed, 0 failed） |
| D5 | 守门断言从发布清单与 `facts.conf` 读版本与数字，不硬编码 | 上一批（2026-11-25-manual-sync-host-v0234）D5 同理：写死旧值的断言正是这三份文件停在 v2.100.x 却全绿的原因 |
| D6 | 回合计数分层（v2.102.0）只补三判据与出处，不展开 | 它是 `context-engineering-layering.md` 第 12.5 节的三条措辞纪律，篇幅小，放在技能维护语境里一句话带过即可 |
| D7 | 不动 `skills/swarm-yuan/` 技能本体与 CHANGELOG | 本批是手册进位；技能本体无改动需求 |

## 验证

- [x] 新增内容引用的每个 `file:line` 用脚本逐条回查：47 条引用、36 个文件、66 个行号区间，文件全存在、无越界；本批新增的 15 条引用另做内容核对（区间首尾行含所述主题关键词）全过。核对在**本 worktree** 内做——首次核对是在主检出做的，而 worktree 基于更新的 origin/main，floor-guard.sh 行号已从 80/91 漂到 83/94/99，当场抓出并修正（"照抄旧 diff 必错"的实证）。
- [x] 机械计数复核：门禁 59／FULL 53／standard 32／compliance 19／核心 12／架构 20／advisory-only 6；配置变量 205＝31＋126＋48——均与 facts.conf 逐项吻合。
- [x] 守门测试 `interactive-training-manual` **22/22 全绿**（先红后绿：手册未改时新断言红在"技术指南缺少 v2.103.0"，证明断言检查实物）。
- [x] 变异探针 **6/6 必红**（指南标题版本、配置变量、研发指南版本、课件版本、课件配置变量、审查判据写反——每次恰好 1 条红），还原后三文件与改前一致、22/22 复绿。
- [x] 技术指南 HTML 结构完好：section 15/15、h2 15、h3 22、table 18/18、tr 122/122，目录 15 条与章节编号逐条一致，16 个页内锚点全部可解析，无 `<script>`、无外链、无 `@import`；指向仓内文件的 34 个链接目标全存在（`/aistudio-swarm-yuan-developer-guide.md` 是启动器路由，scripts/start-training-manual.mjs:51 在册）。
- [x] 浏览器实物走查：培训启动器服务 200、页面 68733 字节、新增节在 DOM 偏移 35026 字符处、目录锚点可跳；无头浏览器改前/改后整页截图（均 1.1MB+），改后比改前多 4KB 像素数据，新增节真实渲染非空白。
- [x] `gen-doc-indexes --check` 0 problem（771/771）。
- [ ] `npm run release:check`、`npm run regress -- --scope merge`（随提交前执行）。
- [ ] 独立审查（上一批因子代理用量上限未取得；本批复跑）。

## 设计文档影响

DESIGN_SYNC: none —— 本批只修订培训手册与守门测试，不改整合正本与数字总账：`RELEASE-MANIFEST.json` 的 yuan-skill 版本已是 v2.103.0，无需变动；`docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md` 的 yuan 行同样已是 v2.103.0。手册是这些载体的下游读者，方向是手册向载体对齐。

## 挂账

| # | 项 | 处置建议 |
|---|---|---|
| Y-1 | 研发指南 L743/773/783 的 "R143 v2.100.0" 是历史案例的版本标注（"历史版本为 v2.100.0，日期 2026-11-07"），属明确的历史叙述 | 不改。改了反而抹掉证据的时间范围 |
| Y-2 | 技术指南第 04 节等处的源码行号索引（如 `generate-skill.sh:63-198`）成文于 2026-11-09，此后技能有改动，未逐条复核 | 本批只保证新增内容的行号；存量索引的整体复核是独立工作量，随下一次手册盘点批 |
| Y-3 | `docs/manuals/aistudio-training-and-user-guide.md` 等其他手册里与 swarm-yuan 相关的能力描述是否覆盖 v2.101—v2.103 新内容 | 未扫描；这些手册按产品面组织，不是 swarm-yuan 的技术说明页 |
