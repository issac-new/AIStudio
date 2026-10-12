---
name: article-methodology-fusion
description: "Fuse external methodology articles into Hermes cluster."
version: 1.2.0
metadata:
  hermes:
    tags: [devops, fusion, research, methodology, wechat]
    related_skills: [harness-fusion-patterns, fusion-governance-patterns, wechat-article-research]
---

# 外部方法论文章吸收（无 repo 源融合）

触发词：公众号文章/论文/博客/培训课件等本地文档「调研并增强集群」「吸收方法论」。本 skill 管无 repo 可 clone 的**文章/文档源**融合；仓库源融合走 harness-fusion-patterns（default profile，本侧只读）。

## 与 repo 源融合的关键差异

文章源（1-2 万字方法论）**不派子代理深读、不 clone、蓝军评审可降级**——总量在单会话通读能力内，直接建机制清单。派 delegate 深读是给仓库规模准备的，用在文章源上是纯浪费。

## 流程（6 步）

1. **抓取+存档**：网页源 curl+regex 提取正文（机制见 wechat-article-research，default 侧只读）；本地文档源（PPTX/PDF/docx）用 python-pptx/pdfplumber 等逐页抽文本——**全文落 JSON 存档**（fetch 时间戳+标题+字数/页数）——存档是融合报告引用与后续对账的唯一原文凭证。纯 markdown 本地源最简：`copy2` 到 research/ 来源目录 + ARCHIVE.md 记 sha256/行数/字数即可，无需抽文本；大文件（40KB+/3000 行+）read_file 分页读到 truncated:false 才算全文通读，禁读片段即出裁决。
2. **通读建机制清单**：从存档分页读（read_file offset/limit），产出机制编号清单（每条：机制名/解决什么问题/依附语境）。
3. **现状扫描+防重复融合**：把每个候选机制的独特关键词（如 `黄金集|错题集|挑战集|Pass@k|分层门禁`）横扫 `_shared/` 与目标资产。**命中≠0 先读既有融合节再判新增**；同时盘点目标文件头部的「来源+日期」融合标注——目标文件往往已被多轮融合过，吸收历史一目了然。不 grep 就宣称「新增」是最常见的重复融合事故。**扫描面含运行时数据面，不止文本资产**：影子日志（jsonl）/台账/sqlite/cron 落盘 grep 不到机制名，却可能已积累大量从未被查询的数据——「文本零命中=集群空白」只在扫过数据面后才成立；反向看，存量数据面常是新机制最好的实锤锚（「只落不查」本身就是问题）。
4. **语境过滤先于机制映射**：源语境（高流量线上业务/多人团队/训练管线）与本集群语境（batch=1 单人多域/冻结权重/无线上流量）不同类时，依附语境的机制**整类 DROP**（线上 AB/影子流量/巡检/多人标注一致率/训练配方），写进「显式不吸收清单」附理由——清单同时防后续 session 重复提议同一机制。
5. **裁决矩阵四判定**（逐行带理由）：**吸收**（新机制落新节）/ **收缩吸收**（机制成立但全量成本不可承受→缩到关键子集，注明收缩比与选题依据，如全题 Pass@k→关键题 Pass@3）/ **等效印证**（集群已有等效物→不新增机制只加引用，判「印证」不判「吸收」）/ **不吸收**（附理由）。裁决矩阵全文落盘（research/ 下带来源名的报告）。
6. **落地+机械验收**：方法纪律类落点=**领域事实源文件追加带来源锚的新节**（评测/回归纪律→`_shared/evals/baseline.md`），设计文档对应行只追加一句增量摘要+指回事实源的锚——机制细节不进设计文档正文（单一事实源）。设计文档同步是多锚不是一处：正文新机制节（仿既有融合节六件套骨架：来源/落地表/对位/显式不吸收/边界声明/落点/同源收敛声明——若同源同构表集群已有落点，头部标注「执行正本在 X」并给分工，防双表漂移）+ 关联机制节增量段 + 载体清单表行 + 附录 A 术语（大白话口径）+ gap-closure-ledger 台账条目；验收四查=新锚 grep 在位、章节编号递进无重排（新节接最大号，既有编号不动防悬空 § 引用）、旧口径残留零命中、单一事实源计数（细节只在事实源文件，正文至多枚举一次）。验收三查：新节锚点 grep 在位、设计文档摘要 grep 在位、旧口径残留扫描（未限定旧表述应零命中）。**gap 登记类交付物必须双库 grep 验收**：gap_register 有小库（`~/.hermes/gap_register.yaml`）与 life-workbench 大库两个活跃副本，worker 自述「已登记」可能落错库或根本没登记——派单 body 明确指定目标库路径与 CLI 命令，验收时双库 grep 关键词确认条目真实存在；落错库（条目仍在）记口径备注不算漏登。单文件落点+无跨资产冲突+不新增基础设施的融合，蓝军 5-lens 降级为本验收；多方案/多资产/结构性融合仍走蓝军。

## 带附件的文档平台抓取（2026-09-17 轻雀文档实证）

页面本身 SSR 可 curl，但**附件 PDF 的 SSR 下载链是死的**（`/merlot/api/blob-store/v2/download?...` 返回 80011「下载链接已失效」）——真链在前端渲染后动态生成的 iframe 里（`pdf/generic/web/viewer.html?file=<yfile/api/stream/preview?...anonToken=>`）。完整路径：

1. 本机 Chrome 若有 `DevToolsActivePort` 文件（`~/Library/Application Support/Google/Chrome/`）→ 读 port + browser ws path，`websocket.create_connection(suppress_origin=True)` 绕 403（默认 origin 头会被拒）。
2. `Target.getTargets` 找目标 tab → `Target.attachToTarget(flatten=True)` → `Runtime.evaluate`（消息带 sessionId）。
3. 懒加载内容（如未渲染的附件预览 iframe）：对附件元素执行 `el.click()` 触发生成，等 2-3s 再收集 `document.querySelectorAll('iframe')`。
4. 页内 `fetch(url, {headers:{Range:"bytes=start-end"}})` 实测 206 → base64 分块（512KB/块，`String.fromCharCode` 32768 步进防栈溢出）→ Python `b64decode` 拼接落盘， `%PDF` 头尾校验。
5. 无文本层 PDF → `pdf-scan-ocr-pipeline`（ocrmac）补 OCR；正文抽完先清洗平台水印行（如「快手技术，仅供学习」）再通读。

Chrome 的 AppleScript JS 执行默认关闭（View > Developer > Allow JavaScript from Apple Events），CDP websocket 是免开权限的替代通道。

## Pitfalls

- **大段正文禁 print 进 execute_code stdout**：10K+ 级文本在工具结果里中段截断（首尾保留、中间挖洞）。全文落存档文件，stdout 只报标题+字数核对；超限结果尾部会给自动落盘路径，可补读但直接落盘省一轮。
- **通用 DAG 编排器硬套单线数据流会退化（2026-10-02 动态本体三部曲实证）**：通用 Pipeline/DAG 执行器的 handler 签名常是「上一步输出=下一步唯一输入」；多输入阶段（治理要拿去重结果+现有规模、合并要拿主本体+候选+决策）硬套会把所有上下文打包成大 dict 在 handler 间传递，可读性反而更差。来源文章自证：实测后主动简化为普通函数顺序调用是工程正确，不是「没试就放弃」。融合建管线时先核对各阶段真实输入形状，再选编排形态。
- **「等效」误判「吸收」会造双事实源**：映射前先问「集群里谁已经在干这件事」，有等效物就加引用，不新建机制。
- **「落地」必须标注成色（QGate 复盘沉淀，2026-09-23 三问裁决升级为集群规则）**：落地有三种成色——**语义落地**（检查项写进 skill/文档）≠ **机制落地**（有机械执行面）≠ **效力落地**（有坏样本证明它能抓住错）。融合收尾时必须显式标注达到哪层（如「语义+机制落地，效力待首次实战/T12-T17」），禁用「已落地」笼统表述。反面实锤：QGate 三轮融合产出 20+ 检查项全部 Wired，直至 Golden Prompts（evals T12-T17）才补上效力验证通道。域级/机制级判定不许连带：判某机制等效时须显式确认不携带相邻子项（判 L0.3 等效≠L0.4 覆盖）；语境 drop 时独立成立的检查项须单独重判（FIBO drop≠L2.3 drop）。详证 `workspace/research/qgate-fusion-20260923/DEEP-PLAN-20260923.md`。
- **收缩吸收必须写明收缩依据**：不写依据的收缩=擅自砍机制，后续无法审计当初为何只取一半。
- **粘贴页的提取正则禁用贪婪边界**：正文用粘贴/SSR 页（含 `js_content` 边界）提正文时，贪婪 `.*` 会越过真实闭合吞进尾部防拷贝 script，且 script 内反引号/正则字面量破坏后续清洗——锚定真实闭合标签（如 `id="js_content"`）收紧边界，再剥 `<script>` 块；**落盘文件含头部元数据行时，正文串 sha ≠ 文件字节 sha**——指纹以落盘文件 `shasum -a 256` 口径为准（可独立复现），事后核对 sha 不符先复核口径再判损坏，禁凭数字不同直接断言存档被改。
- **跨 profile 落点受限**：目标 skill 在 default profile 时 skill_manage 拒写（整批回滚）——融合落点是 `_shared/` 资产与 research/ 报告（可直接写），经验沉淀回本 skill；要改 default 侧 skill 需用户前台会话或 terminal 直编。
- **共享落点文件可能有并发写入者**：patch 报 modified-since-read 必须先重读实况再改；编号冲突做合并（既有项保留、新项顺延），禁凭旧内容盲改第二次。
- **patch 锚点禁行中截断（2026-10-04 设计文档 §4.28 落点行实锤）**：old_string 若在行中截断（如只写到 `references/ve` 就当锚），fuzzy match 会把锚点命中处之后剩余的行尾切下来拼到 new_string 末尾——旧行被腰斩、残尾出现在新节里（修复时又把残尾拼错一处，两轮才清干净）。构造 old_string/new_string 必须含**完整行**（到换行为止）；多锚 patch 后必跑「锚点行完整性」检查：每条被 patch 行的行尾特征串 grep 在位、无孤儿片段（孤儿特征=上一节专有名词出现在下一节文本里）。
- **插桩锚点先验相对位置再验唯一性（2026-10-07 baseline.md G6 实锤）**：长融合目标文件的节物理顺序可能非单调（baseline.md 里 WHALE 节物理位置在图灵 G 节之前、H4 在 X3 之前）——用「兄弟节标题」当插入锚时，先 `text.find()` 核对锚点与新节的**相对顺序**（如 G6 必须落 G 节内部且 G1→G6 编号递进），只验唯一性会把新节插进错误的父节（WHALE 节前）。插桩后机械终验在四查外加「章节编号顺序」查；插错位置不要在错误文本上二次 patch 修补——删错误插桩+用正确锚重插，两步各留 diff。
- **裁决是前提绑定的，集群前提变化须翻案**：语境 DROP/不吸收 依附裁决当时的语境（某域=评估态、无生产流量）；前提改变（域转生产运维、新栈上线）后旧裁决自动失效——翻案三步：①现状摸底（既有资产对该机制的覆盖率，防翻案变重复融合）②翻案落盘（设计文档裁决行改判+新理由+commit）③真缺口拆依赖卡派工。禁凭旧裁决挡新提议（旧判据已不成立），也禁不摸现状就整类翻案吸收。
- **同源多文融合先建「已收基线对账」再出矩阵（2026-10-10 麦肯锡双文实证）**：同一上游机构（如麦肯锡）的多篇文章融合前，必须先做同源已收基线对账——grep 既有资产里的旧融合锚（ontology.md 融合史、目标 skill 头部「来源+日期」标注、research/ 旧报告）列出已收机制清单，新裁决矩阵只对**增量机制**逐行判定，已收基线在报告中单列一节（防后续 session 误判「首次融合」而重复收录）。实测：文1 同源框架 2026-08-21 已收 Process/ValueChain+产能三指标+技能智能（分散在 ontology/archive/entropy-skill 三处），不做对账就会把三机制重评一遍。
- **标准/规范类文章必找一手文本再吸收（2026-10-10 GB/T 48000.3 实证）**：国标/行标/国际标准类文章常是「解读稿」，量化数字与章节结构可能与草案/正式文本有实质出入（实例：转述文称「五要素含公理+18/34/47 数字」，官方征求意见稿实为四章骨架+13 个一级实体类，无独立公理章、数字零命中）。渠道：全国标准信息公共服务平台 std.samr.gov.cn、中国标准化研究院 cnis.ac.cn（编制说明 PDF 常含征求意见稿全文，pdftotext 可提取）、国家标准全文公开系统在线预览。吸收口径以一手文本为准，转述差异写入融合报告「保真度分级」表；转述文的洞见（如 OWL/SHACL 实践建议）可保留但须标注「作者补充非标准条款」。
- **验收 grep 用词必须从落点文件实际文本复制（2026-10-10 实证）**：写验收检查清单时若凭记忆措辞（如「三层分工声明」）而文件里实际写的是「三层粒度互补」，会出假 ❌——验收关键词一律从落点文件实际内容复制粘贴；验收出 ❌ 时先怀疑 grep 词与文本不一致，再怀疑内容缺失。

## Related Skills

- **harness-fusion-patterns**（default，只读）— repo 源融合工作流母本，本 skill 的文章源分支与其互补
- **wechat-article-research**（default，只读）— 抓取机制（curl+regex/搜狗通道）
- **fusion-governance-patterns**（default，只读）— 蓝军评审与批量落地纪律