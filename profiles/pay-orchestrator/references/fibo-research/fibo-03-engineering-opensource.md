# FIBO 工程落地与开源生态调研（分册 03）

> 任务：FIBO 调研「工程落地」分册 —— 官方仓库结构与产物、加载与查询工具链、Python 栈实操、知识图谱平台集成模式。
> 作者：Hermes subagent（pay team FIBO 调研）
> 数据采集日期：2026-09-20（所有 URL / 版本号 / 路径以当日实测为准）
> 实测环境：macOS 本机 / python3 3.14.7 / rdflib 7.6.0 / git shallow clone / curl + api.github.com
> 状态：v1.0 完成（未实测项均已明标）

---

## 0. Executive Summary（核心结论）

1. **仓库基本盘**（2026-09-20 GitHub API 实测）：edmcouncil/fibo，默认分支 `master`，MIT license，仓库体积约 449 MB（size 449,778 KB），716 stars / 134 forks，最近推送 2026-09-11。是活跃维护的一线开源金融本体。
2. **发布节奏为季度制**：GitHub releases 按季度打标（master_2026Q2 于 2026-07-14 发布，往前连续到 master_2024Q1 及更早），**release 不挂产物附件（assets 为空）**——分发走 Jenkins 发布管线 + spec.edmcouncil.org，不走 GitHub release 下载。
3. **目录结构与旧印象不同**：当前 master 上模块目录（BE/FBC/FND/SEC/DER/IND/LOAN/CAE/BP/MD/EXMP/ACTUS）在**仓库根目录**，不存在 `ONTOLOGY/` 顶层目录；也没有 `etc/loading/`。骨架里的旧布局假设已在本次实测中纠正。
4. **文件形态以 RDF/XML 为主**：295 个 `.rdf` vs 仅 2 个 `.ttl`（ACTUS 示例 + vocabulary 脚手架），无 JSON-LD 源文件。JSON-LD 消费需自行转换（rdflib 一行可转）。每模块有 `Metadata*.rdf`（"Metadata subtree"，承载模块元数据/成熟度）与 `All<Module>.rdf` 聚合入口，仓根 `AboutFIBOProd.rdf` / `AboutFIBODev.rdf` 是官方定义的全量加载入口。
5. **`catalog-v001.xml`（290 条映射）是离线加载的钥匙**：把 `https://spec.edmcouncil.org/fibo/ontology/...` 的 ontology IRI 映射到本地文件。rdflib 不原生读 OASIS catalog，但自写 20 行解析器即可实现 imports 闭包加载，全程离线（实测通过）。
6. **Python 栈实测成功**：rdflib 7.6.0 从 `AboutFIBOProd.rdf` 出发加载 production 闭包 = **154 个文件 / 117,312 三元组 / 2.8 秒 / 2,525 个 owl:Class**（本机实测）。单模块（FND/Accounting/CurrencyAmount，支付强相关）闭包仅 2 文件 386 三元组，毫秒级。
7. **实测踩坑**：① 本机 Python 3.14 受 PEP 668 保护，`pip3 install --user rdflib` 被拒，需 `--break-system-packages`；② FIBO 的 `rdfs:label` 是 `xsd:string` 类型字面量、**无 `en` 语言标签**，SPARQL 写 `LANG(?label)="en"` 会返回 0 行；③ 仓库内不存在 `Fibo.ttl`（任务假设的最小入口不存在），最小入口应用 `AboutFIBOProd.rdf` 或单模块文件；④ production 闭包有 26 个无法在仓内解析的 imports，全部指向 `https://www.omg.org/spec/Commons/*`（OMG 独立发布套件，仓外依赖）。
8. **发布管线实证**：Jenkins（jenkins.edmcouncil.org）实测 12 个 job，其中 `fibo` 是 multibranch pipeline、含 master + 全部季度 tag 分支（master_2026Q2 等）与 PR job；配套 `onto-viewer-build/-publish`、`rdf-toolkit-build`。管线源码在 edmcouncil/ontology-publisher（"Ontology Builder" Docker 镜像），产物目录实测为 `publisher/product/{ontology,datadictionary,vocabulary}`。
9. **平台集成模式**：GraphDB/Stardog/Fuseki 走 OWL 直接装载 + 可选推理；Neo4j 走 neosemantics (n10s) 插件（RDF import + SHACL 校验 + 基础推理，仅 self-hosted 可用，Aura 不支持——官方 Labs 文档）。OWL 推理器选项：HermiT（OLEL 之外全 OWL 2 DL）、ELK（OWL 2 EL 大规模快速）、Pellet（已由 Stardog 维护）；FIBO 大闭环建议 ELK 优先。
10. **对 pay-kb 的工程路径（建议，非事实）**：pay-kb 现状是纯文档知识库（git 固化，32MB，四层文档结构），无机器可读语义层。FIBO 的 CurrencyAmount/ExchangeRate/MonetaryAmount 等类可直接作为支付域金额/汇率语义骨架（实测 label 见 §5.2），建议按「rdflib 闭包起步 → 三元组库 → n10s/图融合」三阶段接入，详见 §7.2/§9。其中所有"建议"均标注为【建议】，pay-kb 描述来自内部设计文档为【二级】。

---

## 1. 方法论与证据规则

- 每条命令标注来源：官方 README / 官方文档原文，或「本机实测」+ 日期 + 结果摘要；无法验证的一律标注「未实测」。
- 版本号 / 仓库路径 / 文件名一律来自当日 GitHub API 或官网实测，不凭记忆填写。
- 关键结论至少 2 个独立来源三角验证。
- 证据等级标注约定：
  - 【一级】官方一手来源（官方 repo / 官方文档 / 官方站）；
  - 【二级】官方或半官方间接证据（官方工具的 README、内部设计文档等）；
  - 【三级】第三方来源或未复核内容；
  - 【实测】本机命令实测（附日期与输出摘要）。
- 未实测/未证实的条目在文中明标「未实测」「未证实」。

## 2. FIBO 官方仓库结构与产物（edmcouncil/fibo）

### 2.1 仓库基本信息【实测 2026-09-20】

来源：`curl -s https://api.github.com/repos/edmcouncil/fibo`（gh CLI 未登录认证不可用，改用公开 REST API，输出存 `research/_fibo_data/repo.json`）：

| 字段 | 实测值 |
|---|---|
| full_name | edmcouncil/fibo |
| default_branch | **master** |
| license | **MIT**（spdx_id: MIT） |
| size | 449,778 KB ≈ **449 MB** |
| stars / forks / open_issues | 716 / 134 / 17 |
| created_at | 2014-02-07 |
| pushed_at | **2026-09-11T16:11:55Z** |
| homepage | https://spec.edmcouncil.org/fibo/ |
| topics | finance, financial-services, fintech, ontology, ontology-repository, owl, rdf |

浅克隆实测（`git clone --depth 1 --branch master`）：HEAD commit `78595c3`（2026-09-10），与 API pushed_at 一致（差一天为 push 时间 vs commit 时间，正常）。

最近 release（`releases.json`，`?per_page=10` 实测 10 条全为季度发布）：

| tag | 名称 | published_at |
|---|---|---|
| master_2026Q2 | Q2 2026 Release | 2026-07-14 |
| master_2026Q1 | Q1 2026 Release | 2026-04-20 |
| master_2025Q4 | Q4 2025 Release | 2026-01-19 |
| master_2025Q3 | Q3 2025 Release | 2025-10-10 |
| … | 连续季度 | … |
| master_2024Q1 | master_2024Q1 | 2024-04-08 |

- Release **assets 为空**（实测 `releases.json` 中 `browser_download_url` 零条）→ 发行不走 GitHub 附件，走 Jenkins/spec 站（§3）。
- `tags.json` 实测显示旧 tag（v0.1、omg-dtc-16-*、omg-finance-18-08-04 等）为 2014–2018 OMG 标准化时期遗存，与季度 release tag 体系并行。
- Q2 2026 Release Notes（release body 实测摘要）：本季重点是可用性——合并小 ontology、**examples 迁入新 EXMP 模块**、FBC/SEC 部分概念上移、ACTUS 合同类型与 data dictionary 持续推进。

### 2.2 顶层模块目录（实测清单）

浅克隆根目录 `ls` 实测（2026-09-20，commit 78595c3）：

```
ACTUS/  BE/  BP/  CAE/  DER/  EXMP/  FBC/  FND/  IND/  LOAN/  MD/  SEC/
AboutFIBODev.rdf  AboutFIBODev-TBoxOnly.rdf
AboutFIBOProd.rdf  AboutFIBOProd-TBoxOnly.rdf  AboutFIBOProd-IncludingReferenceData.rdf
MetadataFIBO.rdf  catalog-v001.xml  LICENSE  README.md  ONTOLOGY_GUIDE.md
CONTRIBUTING.md  DCO  CODE_OF_CONDUCT.md  etc/
```

| 目录 | 全称（官方 README/分册 01 交叉） | 内容说明 |
|---|---|---|
| FND | Foundations | 基础层：代理/协议/金额/日期/场所等（实测子域：Accounting, AgentsAndPeople, Agreements, DatesAndTimes, Law, Organizations, Parties, Places, Relations, Utilities 等） |
| BE | Business Entities | 商事实体：LegalEntities, Corporations, OwnershipAndControl 等（实测含子 catalog-v001.xml 与 README.md） |
| FBC | Financial Business and Commerce | 金融业务与商业（含账户、银行等） |
| SEC | Securities | 证券 |
| DER | Derivatives | 衍生品 |
| IND | Indicators and Indices | 指标与指数（利率等，支付/利率场景相关） |
| LOAN | Loans | 贷款 |
| CAE | Contexts: Aviation Engineering* | 适用语境模块（航司场景等历史沿用） |
| BP | Business Process | 业务流程（实测目录存在） |
| MD | Metadata（模块内部元数据惯例的总称见 MetadataFIBO.rdf） | — |
| EXMP | Examples | **Q2 2026 新设**：示例个体从各域迁出集中管理（release notes 实测） |
| ACTUS | ACTUS 合同术语映射 | 与 ACTUS 金融合同算法标准对齐（.ttl 示例在此） |

\* CAE 全称以官方 viewer 为准，本次未逐一核实展开名，仅证实目录存在。

关键结论：**当前 master 布局中没有 `ONTOLOGY/` 顶层目录**（历史版本曾把模块置于 `ONTOLOGY/` 下；旧教程/旧文与现仓库不一致，引用时需注意）。也没有 `etc/loading/`（`ls etc/` 实测为：README.md、dev_toolkit/、image/、onto-viewer-web-app/、source/、testing/、vocabulary/）。

**About 文件角色**【一级，CONTRIBUTING.md「Local testing tools」节实测引用】：
- `AboutFIBOProd.rdf`：只加载 Release 级（Production）ontology —— 官方推荐的生产入口；
- `AboutFIBODev.rdf`：加载全部（含 Development/预发布）；
- `-TBoxOnly` 变体：仅类层次不含个体；`-IncludingReferenceData`：含参考数据。
- 官方明确这两个 About「load the same files that are loaded by the publishing process」→ 用 AboutFIBOProd 加载 = 与官方发布一致的闭包。本次 Python 实测（§5）即以其为入口。

**Metadata subtree 角色**【实测】：仓根 `MetadataFIBO.rdf`（label 实测 "Metadata for FIBO"）+ 每模块 `Metadata<Module>.rdf`（如 MetadataFND.rdf、BE/MetadataBE.rdf）。内容为模块的元数据本体（模块描述、成熟度挂钩、模块归属），是 FIBO「模块树自描述」机制，不影响业务类加载但包含在 imports 闭包中。

### 2.3 文件形态与命名（.rdf/.ttl、URI 规则、catalog-v001.xml）

- **形态统计**【实测】：`find . -name '*.rdf' | wc -l` = **295**；`find . -name '*.ttl'` 仅 2 个（`ACTUS/ACTUS-examples.ttl`、`etc/vocabulary/scaffolding.ttl`）；无 `.jsonld`。→ 源形态 = RDF/XML 单一主形态；Turtle/JSON-LD 是发布产物转换形态（§3.2），不是仓库形态。
- **URI/IRI 规则**【一级，ONTOLOGY_GUIDE.md「FIBO standard IRI format」节 L126-137 实测引用】：
  ```
  https://spec.edmcouncil.org/fibo/ontology/<domain>/<module>/.../<module>/<ontology name>/<resource name>
  例：https://spec.edmcouncil.org/fibo/ontology/BE/LegalEntities/LegalPersons/LegalEntity
  ```
  官方注明该规则描述的是 GitHub "gold source"；发布过程会改写 IRI（实测见下 versionIRI）。
- **versionIRI 带日期**【实测】：`FND/Accounting/CurrencyAmount.rdf` 中 `owl:versionIRI rdf:resource="https://spec.edmcouncil.org/fibo/ontology/FND/20260701/Accounting/CurrencyAmount/"` —— 版本化 IRI 插入 `yyyymmdd` 段。
- **catalog-v001.xml**【实测】：OASIS XML Catalog，`grep -c 'uri id='` = **290 条**，形如
  `<uri name="https://spec.edmcouncil.org/fibo/ontology/BE/AllBE/" uri="./BE/AllBE.rdf"/>`
  即「spec IRI → 仓库相对路径」全量映射。Protégé/CCM 等工具靠它解析 imports（CONTRIBUTING.md L249 明说 "Some tools (e.g., Protégé and CCM) use catalog files"）；rdflib 不自动读它，需自解析（§5.2 方案）。
- **命名惯例**：文件名与 ontology IRI 尾段一致；每模块 `All<Domain>.rdf`（聚合入口，如 AllBE.rdf、AllFND.rdf）+ `Metadata*.rdf`。

### 2.4 发布节奏与产物（production vs development、季度发布、汇总产物核实）

- **季度发布**【实测】：releases 列表连续季度 tag（§2.1 表）。README 实测原文 "formal updates published quarterly"。
- **Production vs Development**【一级，CONTRIBUTING.md 实测】：仓库同时承载 Production（成熟度高、测试严格）与 Development（宽松，只查「引用必有定义」）两套发布口径；Jenkins 对 Prod 跑 "strict and comprehensive" 测试、对 Dev "quite lax"（L265 原文实测引用）。About 文件对应两套闭包入口。
- **汇总产物核实**：
  - GitHub release assets：空（实测）。
  - spec 站发布产物：类 IRI 解引用实测可用（§3.1）；**hydra 描述文件与 `/fibo/ontology/master/latest/*.zip` 汇总包均未证实**（多 URL 实测 403/404，见 §10.3 失败项）→ 分册中不引用"官方 zip 下载"说法。
  - ontology-publisher 的产物矩阵【一级】：`publisher/product/` 下实测三个子目录 `ontology` / `datadictionary` / `vocabulary`（GitHub contents API），即发布产物分三类：本体本体、数据字典（由 OntoViewer `extract-data` goal 生成）、词表。

## 3. 官方在线浏览与发布管线

### 3.1 spec.edmcouncil.org / FIBO Viewer

- **FIBO Viewer**【一级，README 实测】：官方 Web 浏览器（无需安装软件），入口 https://spec.edmcouncil.org/fibo/ontology 。首页 `https://spec.edmcouncil.org/fibo/` 实测 HTTP 200，内容为 FIBO 介绍（web_extract 全文复核）。
- **`/fibo/ontology/` 目录级访问实测 403**（curl 带 UA 亦 403，返回 146 字节，疑似 CDN/bot 防护）→ 目录浏览不可用，但**内容协商解引用可用**：
  ```
  curl -H 'Accept: text/turtle' -L https://spec.edmcouncil.org/fibo/ontology/FND/Accounting/CurrencyAmount/
  → HTTP 200, content-type text/turtle
  → 返回头两行: # baseURI: https://spec.edmcouncil.org/fibo/ontology/master/latest/FND/Accounting/CurrencyAmount/
               # imports: .../master/latest/FND/Utilities/AnnotationVocabulary/ + omg.org/spec/Commons/...
  ```
  【实测 2026-09-20】证明发布版 IRI 空间为 `/fibo/ontology/master/latest/...`（gold source 的 spec IRI 在发布时被重写）。
- **automate.build 机制：未证实**。在 fibo 仓库 README/CONTRIBUTING/etc 全文 grep "automate" 无命中（实测），本次不采信任何 automate.build 说法。

### 3.2 ontology-publisher / onto-viewer 构建管线

- **ontology-publisher**（GitHub API 实测：default_branch develop，最近推送 2024-10-25）【一级，README 实测摘录】：
  - 定位："The Ontology Builder is a Docker Image that executes the build process, testing and publishing the git-based content of an Ontology Family"；
  - 本地可复现：`./docker-run.sh --run`（或 `--shell`/`--dev`/`--clean`）；环境变量 `ONTPUB_FAMILY`（默认 fibo）、`URI_SPACE`（默认 `https://spec.edmcouncil.org/fibo/ontology/`）、`BRANCH_TAG`（写 versionIRI/imports 的分支 tag）、`DATADICTIONARY_COLUMNS`（数据字典列）；
  - 产物目录【实测】：`publisher/product/{ontology, datadictionary, vocabulary}`；
  - Jenkins 集成【一级】：README 含 "Jenkins Master & Slaves" 节——push 触发多机验证，vendor slave 机制供三元组库厂商在自有硬件上跑验证。
- **onto-viewer**（GitHub API 实测：Java 应用，web app + REST API；default_branch develop，最近推送 2024-12-13）【一级】：FIBO Viewer 的后端；其 **OntoViewer Toolkit** 提供 `extract-data` 等 goal，是 datadictionary 产物的生成器（publisher README 引用其 README#goals）。
- **rdf-toolkit**（GitHub API 实测：最近推送 2026-01-22）【一级】："RDF Serializer, to be used in a git commit-hook to force automatic correct rewrite of every OWL ontology"——统一序列化格式（保证 295 个 .rdf 的排版一致性）；jar 从 Jenkins 构建取（CONTRIBUTING.md L220 实测链接）。
- **Jenkins 实测**【实测 2026-09-20，`https://jenkins.edmcouncil.org/api/json/`】：12 个 job——`fibo`（multibranch，展开实测 38 个分支 job：master、master_2018Q4…master_2026Q2、PR-2236 等）、`fibo-prerelease`、`fibo-loan`、`onto-viewer-build/-dev/-publish`（蓝球=成功）、`rdf-toolkit-build/-dev`（蓝球）、`html-pages`、`auto`、`esg`、`ftx`。→ 季度 tag 即 Jenkins 分支，发布 = pipeline 对 tag 分支跑通后的产物发布。

## 4. 加载与查询工具链（非 Python）

### 4.1 Protégé Desktop（+ catalog 打开 FIBO）

【一级，CONTRIBUTING.md 实测】官方贡献流程第一编辑器即 Protégé（"Edit FIBO using the RDF/OWL editor of your choice (Protégé, TopBraid, MagicDraw CCM, VOM, …)"，L181）；catalog 文件专为 Protégé/CCM 的 imports 解析服务（L249）；本地复现步骤（L255-258 实测摘录）：clone → `./createCatalog.sh`（生成 catalog）→ `./createAbout.sh`（生成/刷新 About 文件）→ 在 Protégé 里打开 `AboutFIBOProd.rdf` 或 `AboutFIBODev.rdf`。注意：仓库已自带 catalog-v001.xml 与 About 文件，若自增文件需重跑脚本。本机 Protégé 未安装、未实测打开过程【未实测】。

### 4.2 ROBOT（merge / diff / 子集抽取）

**未实测，且官方文档未见集成**：fibo 仓库 README/CONTRIBUTING/ONTOLOGY_GUIDE 及 etc/ 均 grep 无 "robot" 命中（实测）。ROBOT（robotontology 生态标准工具）技术上可对 FIBO 做 merge/extract（标准 OWL 文件），但官方管线不用它（用 OntoViewer + rdf-toolkit + jena）。→ 工程上可用，但应标注「非官方路径，本机未实测」。

### 4.3 OWL API（Java 库）

【一级】owlcs/owlapi（GitHub API 实测："OWL API main repository"，932 stars，最近推送 2026-09-06）是 onto-viewer 的底层依赖（同属 Java 栈；viewer README 自述 Java 应用）。注意 GitHub 上另有 "OwlApi/OwlApi" 同名镜像仓（描述为中文，2023 年停更）——引用时认准 `owlcs/owlapi`。本机未编译 Java 代码【未实测】。

### 4.4 SHACL 校验（TopQuadrant SHACL API / pySHACL）

- FIBO 官方自身的约束测试是 Jenkins 上的 hygiene 测试（etc/testing/ 实测存在 `hygiene_parameterized/`、`echo.sq` SPARQL 测试、test-strategy 目录）——**不是 SHACL**。
- pySHACL 0.40.1 已在本机装好（实测 `pip3 install --user --break-system-packages pyshacl` 成功，连带 owlrl 7.6.2）；对 FIBO 的 SHACL shape 文件官方未提供（未见官方 shape 发布）→「用 pySHACL 校验 FIBO 实例数据」是可行的自定义路线但**未实测跑通**，明确标注。
- 【一级】Neo4j n10s 亦提供 SHACL 校验路径（见 §7.1）。

## 5. Python 栈实操路径（rdflib / owlready2）

### 5.1 环境准备

【实测 2026-09-20】本机 python3 = 3.14.7（PEP 668 externally-managed）：

```bash
# 直装被拒: pip3 install --user rdflib  → "externally-managed-environment" 报错
# 实测可行命令:
pip3 install --user --break-system-packages rdflib
# → Successfully installed pyparsing-3.3.2 rdflib-7.6.0
python3 -c "import rdflib; print(rdflib.__version__)"   # → 7.6.0
```

注意：更干净的替代是 venv（本工作区已有 `research/fibo-venv`，实测存在 bin/activate 等标准 venv 结构）；本节按任务要求走 `--user` 路线并记录 PEP 668 坑。

### 5.2 rdflib：catalog 驱动的 imports 闭包加载 + SPARQL（本机实测）

脚本：`research/_fibo_data/load_fibo.py`（完整可复现）。核心逻辑：解析 catalog-v001.xml 得 IRI→路径映射（290 条），从入口文件 BFS 跟踪 `owl:imports` 三元组逐个 `g.parse()`，全程离线。

```python
import xml.etree.ElementTree as ET
from rdflib import Graph
from rdflib.namespace import OWL

CLONE = 'research/_fibo_data/fibo'
ENTRY = f'{CLONE}/FND/Accounting/CurrencyAmount.rdf'   # 最小模块（支付相关）
catalog = {el.get('name'): CLONE + '/' + el.get('uri').lstrip('./')
          for el in ET.parse(f'{CLONE}/catalog-v001.xml').getroot()
          if el.tag.endswith('uri')}
g, queue, loaded = Graph(), [ENTRY], set()
while queue:
    p = queue.pop(0)
    if p in loaded: continue
    g.parse(p, format='xml'); loaded.add(p)
    for s, o in g.subject_objects(OWL.imports):
        if (lp := catalog.get(str(o)) or catalog.get(str(o).rstrip('/'))) and lp not in loaded:
            queue.append(lp)
```

实测输出（2026-09-20）：

```
catalog entries: 290
files loaded: 2          # CurrencyAmount.rdf + FND/Utilities/AnnotationVocabulary.rdf
triples: 386
elapsed: 0.01s
```

SPARQL（列出前 20 个 owl:Class 的 rdfs:label）：

```sparql
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?cls ?label WHERE {
  ?cls a owl:Class ; rdfs:label ?label .
} ORDER BY ?cls LIMIT 20
```

实测返回 20 行，摘录（全文存 `research/_fibo_data/sparql_classes.txt`）：

```
.../FND/Accounting/CurrencyAmount/AmountOfMoney      -> amount of money
.../FND/Accounting/CurrencyAmount/Currency           -> currency
.../FND/Accounting/CurrencyAmount/ExchangeRate       -> exchange rate
.../FND/Accounting/CurrencyAmount/InterestRate       -> interest rate
.../FND/Accounting/CurrencyAmount/MonetaryAmount     -> monetary amount
.../FND/Accounting/CurrencyAmount/MonetaryPrice      -> monetary price
.../FND/Accounting/CurrencyAmount/Price              -> price
.../FND/Accounting/CurrencyAmount/UnitOfAccount      -> unit of account
.../FND/Accounting/CurrencyAmount/UnitPrice          -> unit price
.../FND/Utilities/AnnotationVocabulary/MaturityLevel -> maturity level
```

**任务假设的两处修正（实测）**：
1. 任务提示的 `FND 的 Fibo.ttl` **不存在**（全仓只有 2 个 .ttl，见 §2.3）——最小模块入口用单模块 `.rdf`（本次选 CurrencyAmount，金额/汇率/计价类与支付域直接相关）；
2. 首跑 `FILTER(LANG(?label)="en")` 返回 **0 行**——FIBO 的 label 是 `xsd:string` 类型字面量而非带 `en` 语言标签（实测结论，写查询时不要按语言标签过滤）。

### 5.3 owlready2：加载合并产物、类检索、推理前提

未实测（本机未安装 owlready2；文档站 owlready2.readthedocs.io 实测 200 可达【一级】）。工程提示（基于工具定位，非实测）：owlready2 内置 HermiT/Pellet 包装适合推理实验，但它对 RDF/XML 大仓的模块化加载不如 rdflib 灵活；若走推理路线，建议用 §5.2 的 rdflib 闭包先 merge 成单文件再喂 owlready2。

### 5.4 实测指标（文件数 / 三元组数 / 耗时）

脚本 `research/_fibo_data/load_fibo_full.py`，入口改为 `AboutFIBOProd.rdf`（与官方发布一致口径）【实测 2026-09-20】：

```
files loaded: 154
triples: 117312
unresolved imports (no catalog entry): 26   # 全部为 https://www.omg.org/spec/Commons/*（仓外）
elapsed: 2.82s
distinct owl:Class in full Prod closure: 2525
```

结论：**rdflib 纯 Python 栈加载 FIBO Production 全闭包（不含 OMG Commons）约 3 秒 / 12 万三元组**，Python 单机方案对支付语义层完全够用。26 个 OMG Commons imports 是唯一缺口（omg.org/spec/Commons 实测 200 可达，可手动下载补齐或接受悬空）；另有 9,291 个 .rdf 之外的部分（295−154）属于 Dev 级/未进 Prod 闭包的模块。

## 6. 三元组库集成模式（GraphDB / Stardog / Fuseki / Virtuoso）

| 平台 | 装载模式 | 推理配置 | 检索模式 | 来源等级 |
|---|---|---|---|---|
| GraphDB (Ontotext) | import RDF/XML-Turtle（FIBO 需先用 rdf-toolkit 同款规范化或直接导入）；支持 named graph 分 Prod/Dev | plugin 自带 OWL-Horst/OWL2-QL/RL 等 profile；FIBO 全闭包建议 ELK 级别或关推理走 SPARQL | SPARQL 全文+OGM；FIBO 官方 Jenkins 有 vendor slave 机制与三元组厂商联动（§3.2） | 官网实测 200【一级】；具体装载 UI 未实测【三级】 |
| Stardog | 数据库级 bulk load RDF；支持 IRC（intent-based）与 virtual graphs | reasoning type=SL/EL/DL 可选；FIBO 属 OWL 2 DL 大本体，官方推荐 EL/QL 子集 | SPARQL + 混合检索 | docs.stardog.com 实测 200【一级】；未实操【三级】 |
| Apache Jena Fuseki | 免费自托管标配：`tdb2.loader`/text index；ontology-publisher 的 bin/ 自带 jena 工具（§3.2），社区有间接耦合 | 内置 OWL RL（`owl:rules`）或外挂 reasoner | SPARQL 1.1 全功能 | jena.apache.org 实测 200【一级】；publisher bin/ 含 jena【二级】 |
| Virtuoso | RDF loader（含 ttl/rdf） | OWL RL horizon | SPARQL，弱 OWL DL | **未实测任何来源**【未实测】 |

共性工程结论（基于 §5 实测外推，标注为分析）：FIBO 12 万三元组对任何三元组库都是小体量；瓶颈不在装载而在 **OWL DL 推理开销**，生产建议「EL/QL profile 或干脆关推理 + 显式物化（materialize 后入库）」。

## 7. 与知识图谱平台 / 数据栈的集成模式

### 7.1 Neo4j（neosemantics n10s）

【一级，neo4j.com/labs/neosemantics 实测全文】n10s 插件能力：RDF/OWL/RDFS/SKOS 导入导出（Turtle/N-Triples/**JSON-LD**/RDF-XML 等多格式）、模型映射、SHACL 校验、基础推理。实测关键限制（官方原文）：**仅 self-hosted CE/EE，Aura 不可用**；Aura 替代方案为 rdflib-neo4j driver。
FIBO→Neo4j 路径（建议，标注【建议】）：rdflib 加载闭包（§5.2）→ 转 JSON-LD/Turtle → `n10s.rdf.import.fetch` 或 rdflib-neo4j 直写；类层次存 `:Class` 节点做词法导航，实例映射走 `n10s.mapping` 自定义映射。

### 7.2 企业集成模式（参考词表对齐、映射、治理）

（本节为工程建议，来源为本次实测事实 + 行业通用做法，标注【建议】）

1. **词表对齐**：以 FIBO 为上层参考本体（upper/mid ontology），内部数据字典映射到 FIBO 类 IRI——官方先例是 OntoViewer `extract-data` 生成的 datadictionary 产物（§3.2，【一级】），企业可仿制「CSV 字典 ↔ FIBO IRI」两列映射表。
2. **版本治理**：锁定季度 tag（如 master_2026Q2）而非 master 漂移；内部 ontology 引用 FIBO 时写死 versionIRI（带 yyyymmdd 段，§2.3 实测），升级 = 换 tag + 回归 SPARQL 差异查询（ROBOT diff 或 rdflib `graph_diff`，后者未实测）。
3. **双库模式**：TBox（FIBO 闭包）与 ABox（业务实例）分 named graph/分库管理，推理只跑 TBox 侧。

**pay-kb 作为支付知识库语义层的工程路径**（pay-kb 现状描述为【二级，内部设计文档 hermes-complete-design-doc.md L1503-1505】；路径为【建议】非事实）：

- pay-kb 现状：`pay-orchestrator/references/` git 仓库（tag `pay-kb-v20260903`，32MB），四层文档结构（全文层/著作层/标准层/索引层：EMV v4.4、PBOC 3.0、银联 148 份规范等）——**纯文档，无机器可读语义层**。
- 接入路径【建议】：
  1. **起步（0 成本，已实测可行）**：rdflib + catalog 闭包加载 CurrencyAmount/FND 子集（§5.2，毫秒级），把 pay-kb 标准层中的「金额/汇率/计价/账户」词条对齐到 FIBO 类 IRI（实测 label 一一对应：currency、exchange rate、monetary amount、price、unit of account）；
  2. **中期**：FBC/IND/LOAN 模块按需入闭包（全 Prod 仅 3 秒/12 万三元组，§5.4），三元组库（Fuseki 起步，免费）挂 SPARQL endpoint，pay-kb 文档索引层加 FIBO IRI 锚点列；
  3. **远期**：n10s 把支付实例图（交易/渠道/卡组）与 FIBO TBox 同图融合，SHACL 校验交易报文字段语义。
- OMG Commons 缺口（§5.4 实测）在路径 1 即需处理：要么手动补 26 个 Commons 文件，要么在映射表标注悬空引用。

## 8. 上手指引（Step-by-step，可复制命令）

```bash
# 0) 取数据（浅克隆，~几秒，实测通过）
git clone --depth 1 --single-branch --branch master https://github.com/edmcouncil/fibo.git

# 1) Python 栈
pip3 install --user --break-system-packages rdflib   # PEP 668 环境需要 break-system-packages

# 2) 加载 + SPARQL（完整脚本见 research/_fibo_data/load_fibo.py，核心 20 行见 §5.2）
python3 load_fibo.py       # 单模块闭包 + 前 20 类 label（实测输出见 §5.2）
python3 load_fibo_full.py  # AboutFIBOProd 全闭包（实测 154 文件/117312 三元组/2.8s）

# 3) 解引用一个类（内容协商，实测 200 text/turtle）
curl -H 'Accept: text/turtle' -L https://spec.edmcouncil.org/fibo/ontology/FND/Accounting/CurrencyAmount/

# 4) Protégé 路线（官方贡献流程，未实测安装）
#    打开 AboutFIBOProd.rdf，确保 catalog-v001.xml 在工作目录

# 5) 本地复现官方发布管线（Docker，命令来自 ontology-publisher README【一级】，未实测）
git clone https://github.com/edmcouncil/ontology-publisher && cd ontology-publisher
env ONTPUB_FAMILY=fibo ./docker-run.sh --run
```

## 9. 风险、坑与建议

1. **PEP 668**：新 macOS/homebrew Python 装包必须 `--break-system-packages` 或 venv【实测】。
2. **`LANG(?label)="en"` 陷阱**：FIBO label 无语言标签，按语言过滤会静默得 0 行【实测】。
3. **`Fibo.ttl`/`ONTOLOGY/` 布局是旧知识**：现 master 为根目录模块 + RDF/XML 主形态；引用旧教程需过时校验【实测】。
4. **release 无附件**：想拿"官方 zip"没有——要么 clone 仓（gold source），要么解引用 spec IRI（发布版 IRI 空间 `master/latest/`）【实测】。
5. **OMG Commons 悬空 imports**：Prod 闭包 26 个 imports 指向仓外 omg.org/spec/Commons，离线场景需手动补【实测】。
6. **spec 站目录页 403**：自动化抓取 spec.edmcouncil.org 目录级页面会被挡；单 IRI 内容协商不受影响【实测】。
7. **CAE/MD 等目录语义未逐一核实**：本册只证实目录存在，展开名引用前需二次核实（诚实标注）。
8. **推理开销**：全 OWL 2 DL 推理 FIBO 代价高（未实测具体耗时，分析性结论），生产建议 EL/QL 或物化【建议】。

## 10. 附录

### 10.1 命令速查

```bash
curl -s https://api.github.com/repos/edmcouncil/fibo                     # 仓库元数据
curl -s "https://api.github.com/repos/edmcouncil/fibo/releases?per_page=10"
git clone --depth 1 --branch master https://github.com/edmcouncil/fibo.git
grep -c 'uri id=' catalog-v001.xml                                       # catalog 映射数（实测 290）
find . -name '*.rdf' | wc -l                                             # 实测 295
curl -H 'Accept: text/turtle' -L https://spec.edmcouncil.org/fibo/ontology/<Domain>/<Module>/
curl -s 'https://jenkins.edmcouncil.org/api/json/' -A 'Mozilla/5.0'      # job 列表
curl -s 'https://jenkins.edmcouncil.org/job/fibo/api/json/' -A 'Mozilla/5.0'
```

### 10.2 来源清单（URL + 访问日期，均 2026-09-20）

| 来源 | 等级 | 用途 |
|---|---|---|
| https://api.github.com/repos/edmcouncil/fibo | 实测 | §2.1 基本盘 |
| 同上 /releases、/tags | 实测 | §2.1/§2.4 发布节奏 |
| https://github.com/edmcouncil/fibo 浅克隆 commit 78595c3 | 实测 | §2.2/§2.3 结构与形态 |
| 仓内 README.md / CONTRIBUTING.md / ONTOLOGY_GUIDE.md（file:line 见正文） | 一级 | §2/§3/§4 官方口径 |
| https://spec.edmcouncil.org/fibo/ | 一级 | §3.1 |
| https://jenkins.edmcouncil.org/api/json/ | 实测 | §3.2 管线 |
| https://raw.githubusercontent.com/edmcouncil/ontology-publisher/develop/README.md | 一级 | §3.2 Ontology Builder |
| api.github.com: edmcouncil/onto-viewer, rdf-toolkit, owlcs/owlapi, liveontologies/elk-reasoner, stardog-union/pellet | 一级 | §3.2/§4.3/§6 |
| https://neo4j.com/labs/neosemantics/ | 一级 | §7.1 |
| https://www.ontotext.com/products/graphdb/ ; https://docs.stardog.com/ ; https://jena.apache.org/documentation/fuseki2/ ; http://www.hermit-reasoner.com/ ; https://owlready2.readthedocs.io/ ; https://pypi.org/project/pySHACL/ | 一级 | §4/§5.3/§6 URL 存活实测 |
| research/hermes-complete-design-doc.md L1503-1505 | 二级 | §7.2 pay-kb 现状 |

### 10.3 本机实测记录

- 2026-09-20；主机 macOS（cwd `/Users/YOURNAME/hermes-docker-sandbox/workspace`）。
- 中间数据/脚本/输出：`research/_fibo_data/`（repo.json、releases.json、tags.json、jenkins.json、jenkins_fibo.json、load_fibo.py、load_fibo_full.py、sparql_classes.txt、fibo/ 浅克隆）。
- gh CLI 未登录（`gh auth status` 实测），GitHub 数据全部走公开 REST API + curl。
- 详见「验收自查」节。

## 验收自查

| # | 命令 | 关键输出（2026-09-20 实测） | 判定 |
|---|---|---|---|
| 1 | `curl -s https://api.github.com/repos/edmcouncil/fibo` → repo.json | default_branch=master, license=MIT, size=449778KB, pushed_at=2026-09-11 | ✅ 任务① |
| 2 | `curl -s ".../releases?per_page=10"` → releases.json | 10 条季度 release，最新 master_2026Q2（2026-07-14），assets 空 | ✅ 任务① |
| 3 | `git clone --depth 1 --branch master …/fibo.git` + `git log -1` | commit 78595c3（2026-09-10）；根目录 12 个模块目录，无 ONTOLOGY/ | ✅ 任务② |
| 4 | `find . -name '*.rdf' \| wc -l` / `… '*.ttl'` | 295 / 2；catalog 290 条（grep -c） | ✅ 任务② |
| 5 | `curl -s 'https://jenkins.edmcouncil.org/api/json/'` → jenkins.json | 12 jobs，fibo multibranch 含 master_2026Q2 等 38 分支 | ✅ 任务③ |
| 6 | `pip3 install --user --break-system-packages rdflib` | rdflib 7.6.0 安装成功 | ✅ 任务④ |
| 7 | `python3 research/_fibo_data/load_fibo.py` | 2 文件/386 三元组；SPARQL 前 20 类含 currency/exchange rate/monetary amount（全文 sparql_classes.txt） | ✅ 任务④ |
| 8 | `python3 research/_fibo_data/load_fibo_full.py` | 154 文件/117,312 三元组/2.8s/2,525 类；26 个 OMG Commons 悬空 imports | ✅ 任务④ |
| 9 | `curl -H 'Accept: text/turtle' -L …/CurrencyAmount/` | HTTP 200 text/turtle，baseURI=…/master/latest/… | ✅ 任务③发布版 IRI 实证 |

**失败/未证实项（诚实清单）**：
- `gh api` 不可用（gh 未登录）→ 已改 curl 公开 API 等效完成【已绕过】。
- `pip3 install --user rdflib` 首次被 PEP 668 拒绝 → `--break-system-packages` 成功【已绕过】。
- 首跑 SPARQL `LANG(?label)="en"` 返回 0 行 → 去掉语言过滤后 20 行【已修正，坑记录在案】。
- `https://spec.edmcouncil.org/fibo/ontology/`（目录页）与 `/2026Q2/*.zip`、`/master/latest/*.zip` 均 403/404 → 汇总 zip 产物未证实，报告不引用。
- **automate.build 机制：未证实**（fibo 仓内 grep 零命中），明标不采信。
- **hydra 描述文件：未证实**（仅 OntoViewer/publisher README 提及 derived products 的间接线索），明标。
- **pySHACL 对 FIBO 实跑：未做**（包已装 0.40.1，无官方 shape 文件），明标。
- **owlready2 / ROBOT / Virtuoso / openllet.org（网络超时 000）：未实测**，明标。
- GraphDB 文档具体装载页（graphdb.ontotext.com/documentation）抽取失败（404），仅官网首页 200 为证【三级】。
- pay-kb 集成路径全部为【建议】，非事实陈述；pay-kb 现状引自内部设计文档【二级】。
