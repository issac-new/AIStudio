> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# 汽车行业 profile 立法文档（industry-profile-automotive）

# 汽车行业 profile 立法文档（industry-profile-automotive）

> 条款纪律：条款号仅采用已核验事实；不虚构条款号、不虚构 URL——标准统一指向 ISO/IEC 官方页或国家标准全文公开系统检索页，法规统一指向国家法律法规数据库，访问日期均 2026-07-23。
> 配套配置包：`assets/industry-profiles/automotive.conf`（用法：`cat` 追加到 `precheck.conf` 末尾后按项目裁剪）。
> 门禁基线：49 既有（`precheck.sh` GATE_FLAGS 注册表，含合规门禁）；本 profile 不新增门禁，仅覆盖配置开关。
> 边界声明：ISO 26262 功能安全评估、ASIL 定级、CSMS/SUMS 认证属线下外审，本范式不覆盖认证——门禁输出**不构成型式认证合规证据**（§3 差额项）。

## 0. 定位与适用

**适用对象**：整车厂（OEM）、Tier 1/Tier 2 供应商的车载 E/E 系统软件研发交付；车机/座舱软件、车云后端（OTA 平台/数据采集/远程诊断）、AUTOSAR 经典/自适应平台组件、自动驾驶/ADAS 算法软件、车规级基础软件（操作系统/中间件/驱动）等面向车规交付的软件研发项目。新能源汽车三电（BMS/MCU/VCU）控制软件、智能座舱 SOC 软件栈亦属此列。

**监管基线**：汽车软件交付的合规底座是「功能安全 + 网络安全 + 软件更新」三角——
1. **功能安全**：ISO 26262《Road vehicles — Functional safety》道路车辆功能安全（12 部分，ASIL A/B/C/D 四级）；
2. **网络安全**：UNECE R155（车辆网络安全，要求 OEM 建立 CSMS 网络安全管理系统）、GB 44495-2024《汽车整车信息安全技术要求》（强制性国标，2024-08-23 发布、2026-01-01 实施，与 R155 对标，已现行）、GB/T 36572-2018《电力监控系统网络安全防护》十六字方针（安全分区/网络专用/横向隔离/纵向认证）为工业控制系统的横向参照；
3. **软件更新**：UNECE R156（软件更新管理系统 SUMS，要求 OTA 包完整性签名/物料清单）、GB 44496-2024《汽车软件升级通用技术要求》（强制性国标，2024-08-23 发布、2026-01-01 实施，与 R156 对标，已现行）。

汽车行业**不强制**等级保护（GB/T 22239-2019 不直接管辖车载 E/E 系统）、**不强制**国密密评（GB/T 39786-2021 不适用车规密码件）。本 profile 把上述三角落到门禁开关，差额项（功能安全评估/ASIL 定级/CSMS 认证/型式试验）显式登记人工核对，不做「门禁通过=合规通过」的越界承诺。

---

## 1. 适用标准清单（标准号+年号+条款）

### 1.1 国际法规（UNECE）与国际标准（ISO）

| 标准 | 对研发交付物的关键条款 | 置信 | 证据（访问日期均 2026-07-23） |
|---|---|---|---|
| UNECE R155《Uniform provisions concerning the approval of motor vehicles with regard to cybersecurity and cybersecurity management system》 | 要求 OEM 建立 CSMS（Cybersecurity Management System）网络安全管理系统，覆盖车辆全生命周期威胁分析（TARA）、风险评估、安全监测与事件响应；型式认证前提 | 高 | UNECE 官方页（§5-1） |
| UNECE R156《Uniform provisions concerning the approval of motor vehicles with regard to software update and software update management system》 | 要求 OEM 建立 SUMS（Software Update Management System）软件更新管理系统，覆盖软件物料清单（SBOM）、版本管理、OTA 完整性签名、回滚机制、更新记录留存；型式认证前提 | 高 | UNECE 官方页（§5-1） |
| ISO 26262:2018《Road vehicles — Functional safety》（12 部分） | Part 6：软件级产品开发（软件安全需求/架构设计/实现/验证/单元测试/集成测试）；Part 8：支持过程（配置/变更/文档/需求可追溯/软件工具置信度 TCL/软件组件鉴定）；ASIL A/B/C/D 四级（D 最严）；需求追溯到测试 | 高 | ISO 官方页（§5-2） |
| ISO/SAE 21434:2021《Road vehicles — Cybersecurity engineering》 | 车辆网络安全工程：威胁分析与风险评估（TARA）、网络安全目标、网络安全声明、全生命周期安全监测 | 高 | ISO 官方页（§5-2） |

### 1.2 国家标准（GB/T）

| 标准 | 对研发交付物的关键条款 | 置信 | 证据 |
|---|---|---|---|
| GB 44495-2024《汽车整车信息安全技术要求》（强制性） | 整车信息安全技术要求，与 UNECE R155 对标：信息安全管理体系、风险识别与处置、车辆外部连接/数据/软件升级安全要求（条款号待原文核实） | 高 | 国家标准全文公开系统（§5-3，2026-07-27 核验：强标、现行、2026-01-01 实施） |
| GB 44496-2024《汽车软件升级通用技术要求》（强制性） | 汽车软件升级（OTA）通用技术要求，与 UNECE R156 对标：升级包完整性校验、版本管理、升级失败回滚、升级记录留存（条款号待原文核实） | 高 | 国家标准全文公开系统（§5-3，2026-07-27 核验：强标、现行、2026-01-01 实施） |
| GB/T 43848-2024《网络安全技术 软件产品开源代码安全评价方法》 | 开源代码安全评价四维：来源/安全质量/知识产权/管理；成分清单与许可证合规纳入评价体系（措辞纪律：本标准不宣称「强制提交 SBOM」，automotive.conf 以 SBOM_REQUIRED 工程手段支撑评价证据） | 高 | 国家标准全文公开系统（§5-3） |
| GB/T 8567-2006《计算机软件文档编制规范》 | 软件开发/交付文档包体系（需求/设计/测试/用户手册等） | 高 | 国家标准全文公开系统（§5-3） |

### 1.3 通用工程标准（经本 profile 强化引用）

| 标准 | 关键要求 | 置信 |
|---|---|---|
| ISO/IEC/IEEE 29148（需求工程） | 需求条目唯一标识、无待定项、需求↔测试双向追溯（ISO 26262 Part 8 软件级需求追溯同构） | 高 |
| NIST SP 800-218（SSDF）PS.2 | 提供软件发布完整性验证机制（OTA 包签名/校验，与 UNECE R156 联动） | 高 |
| SLSA v1.0 Build L2 | 托管构建平台签名 provenance（车规软件构建可追溯） | 高 |

---

## 2. 条款 → 门禁映射

「门禁」列给出 `precheck.sh` flag 名。状态：✅=门禁承担；🟡=部分承担（剩余人工核对）；❌=无门禁承担（见 §3 差额项）。安全类门禁未配置静默跳过、启用后 fail-closed。

| # | 条款（标准号+条款） | 承担门禁 | 状态 |
|---|---|---|---|
| 1 | UNECE R156（SUMS：软件物料清单/版本管理/OTA 完整性签名/回滚）+ GB 44496-2024 | `--sbom`（SBOM_REQUIRED=1：许可证块名单命中 → fail）+ `--release-sign`（RELEASE_SIGN_REQUIRED=1：产物缺 .sig/.asc/.att/.bundle → fail；cosign 验签失败 → fail） | ✅🟡 词法层；SUMS 体系认证属线下（§3-①） |
| 2 | GB/T 43848-2024（开源评价四维：来源/安全质量/知识产权/管理） | `--oss-eval`（OSS_EVAL_REQUIRED=1，复用 --sbom 产物）+ `--sbom`（许可证块名单） | ✅🟡 |
| 3 | ISO 26262 Part 8（需求可追溯：软件安全需求↔设计↔代码↔测试）+ ISO/IEC/IEEE 29148 | `--requirements`（REQUIREMENTS_STRICT/ID_REQUIRED=1：spec 含 TBD/待定 → fail；需求缺 REQ- 编号 → fail）+ `--rtm`（RTM_REQUIRED/MATRIX_REQUIRED=1：追溯矩阵缺失 → fail） | ✅🟡 词法层；功能安全评估属线下（§3-②） |
| 4 | UNECE R156 + NIST SP 800-218 PS.2 + SLSA Build L2（发布完整性签名/provenance） | `--release-sign`（产物缺 .sig/.asc/.att/.bundle → fail；cosign 验签失败 → fail） | ✅ 启用后 |
| 5 | GB/T 8567-2006（文档包）+ ISO 26262 Part 8 软件级文档（需求/设计/测试/验证） | `--docs-pack`（DOCS_PACK_PROFILE=gbt8567 + DOCS_PACK_REQUIRED 六件套） | ✅🟡；功能安全案例/安全档案文档本体人工核对 |
| 6 | UNECE R155（CSMS：威胁分析 TARA/风险监测/事件响应）+ ISO/SAE 21434（TARA） | 无自动门禁——TARA/CSMS 体系认证属线下外审（§3-①） | ❌ 差额项 |
| 7 | ISO 26262 Part 6（软件级开发：单元/集成测试） | `--test`（测试证据）+ `--security`（SAST 词法层） | 🟡；功能安全测试覆盖率/背靠背测试属线下（§3-②） |
| 8 | ISO/IEC 42001（AI 管理体系：成文信息+可追溯） | `--review-record`（AI_DISCLOSURE_REQUIRED=1：AI 辅助生成产物带 AI 生成声明+人工复核记录） | ✅🟡 |
| 9 | 证据留痕（UNECE R156 SUMS 审计日志、ISO 26262 Part 8 软件配置/构建记录） | GATE_RUNS_DIR 运行记录 JSONL 落盘 | ✅ |

其余通用工程门禁（`--branch/--scope/--build/--test/--security/--authz/--shift-left/--sast-deep` 等）承担工程基线，automotive profile 不改变其判定语义（姿态表见 standards-compliance.md §F.1）。

---

## 3. 差额项（汽车行业特有、门禁不可替代的线下环节）

| # | 差额项 | 条款依据 | 处置 |
|---|---|---|---|
| ① | CSMS 网络安全管理系统认证（UNECE R155 型式认证前提）+ SUMS 软件更新管理系统认证（UNECE R156 型式认证前提） | UNECE R155/R156 | **人工核对/外审**：CSMS/SUMS 体系认证证书、TARA 报告、风险评估记录、安全监测与事件响应流程；门禁仅覆盖词法层 SBOM/签名/文档存在性 |
| ② | ISO 26262 功能安全评估（ASIL A/B/C/D 定级、HARA 危害分析与风险评估、安全案例 Safety Case、软件工具置信度 TCL 鉴定、软件组件鉴定 SC） | ISO 26262:2018（Part 3/4/6/8/9） | **人工核对/外审**：ASIL 定级报告、HARA 记录、安全案例文档、TCL/SC 鉴定报告；门禁仅做需求追溯词法预检，**不构成功能安全合规证据** |
| ③ | 车规密码件合规（HSM/SE 硬件安全模块、车规密码算法选型） | ISO 26262 Part 6 + 车规密码件行业标准 | **人工核对**：HSM/SE 选型报告、密码算法合规论证；`--crypto` 在 automotive profile 中 SKIP（汽车不强制国密） |
| ④ | 软件更新型式试验（OTA 升级失败回滚验证、升级包兼容性验证） | UNECE R156 + GB 44496-2024 | **人工核对/外审**：型式试验报告、回滚测试记录；门禁仅覆盖 SBOM/签名存在性 |
| ⑤ | 自动驾驶功能安全（ODD 运行设计域、动态驾驶任务 DDT、自动驾驶系统安全案例） | ISO 21448（SOTIF 预期功能安全）+ 行业惯例 | **人工核对/外审**：ODD 描述文档、SOTIF 分析报告；门禁不覆盖自动驾驶域外审 |

---

## 4. 配置包用法与姿态

`assets/industry-profiles/automotive.conf` 为 conf 片段：`cat assets/industry-profiles/automotive.conf >> precheck.conf`（bash 后赋值覆盖先赋值），再按项目裁剪——占位值 `<...>` 必须替换为真实路径。姿态约定：

- 未配置静默跳过；启用后 fail-closed（`--sbom`/`--oss-eval`/`--docs-pack`/`--release-sign`/`--requirements`/`--rtm`/`--review-record` 均属此列）；
- 豁免必须按 standards-compliance.md §F.2 五字段格式登记（对象|规则|理由|审批人|日期），空理由视为无效豁免 → fail；
- `DENGBAO_LEVEL`/`CRYPTO_PROFILE`/`PRIVACY_SCAN_DIRS`/`AUTHZ_SCAN_DIRS`/`PIA_REQUIRED` 在 automotive profile 中留空 SKIP（汽车不强制等保/国密/个人信息强监管）；项目侧若处理车云个人信息或车云后端承载关基，按 gov/energy profile 自行叠加；
- 门禁输出**不构成** UNECE R155/R156 型式认证合规证据，亦**不构成** ISO 26262 功能安全评估证据（§3 差额项须线下外审）。

---

## 5. 证据清单（URL 汇总，访问日期均为 2026-07-23）

回避纪律：不虚构条款号、不虚构深层 URL。国际法规/标准统一经官方页核验；国家标准统一经国家标准全文公开系统按标准号检索核验。

1. UNECE 车辆法规 155 号：https://unece.org/transport/documents/2021/01/standards/un-regulation-no-155-cyber-security-and-cyber-security
2. ISO 26262:2018 道路车辆功能安全（12 部分标准页，Part 6 软件级产品开发、Part 8 支持过程）：https://www.iso.org/standard/68383.html
3. 国家标准全文公开系统（GB 44495-2024、GB 44496-2024、GB/T 43848-2024、GB/T 8567-2006 检索入口）：https://openstd.samr.gov.cn/bzgk/gb/
4. ISO/SAE 21434:2021 道路车辆网络安全工程（标准页）：https://www.iso.org/standard/70918.html
5. NIST SP 800-218（SSDF v1.1，PS.2 发布完整性）：https://csrc.nist.gov/pubs/sp/800/218/final
6. ISO/IEC/IEEE 29148（需求工程标准页）：https://www.iso.org/standard/72089.html
7. ISO/IEC 42001:2023 人工智能管理体系（标准页，AI 过程信息项参照）：https://www.iso.org/standard/81230.html

## 6. 典型技术栈 → 框架映射表

> 行业典型技术栈常激活的框架门禁（与 `assets/industry-profiles/automotive.conf` 的 `ACTIVE_FRAMEWORKS_HINT` 对齐；
> 非强制启用——实际以探查信号为准，详见对应 `references/frameworks/<id>.md`）。

| 典型技术栈 | 激活框架门禁 |
|-----------|-------------|
| Spring Boot | `spring-boot` |
| Spring Cloud | `spring-cloud` |
| Spring Security | `spring-security` |
| MyBatis | `mybatis` |
| Redis 缓存 | `redis` |
| Kafka 车云消息 | `kafka` |
| Nacos 配置/注册 | `nacos` |
| Sentinel 限流 | `sentinel` |
| Seata 分布式事务 | `seata` |
| Netty 车载通信 | `netty` |
| Dubbo 车云 RPC | `dubbo` |

