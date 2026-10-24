# CORE-USAGE-PRINCIPLE.md — payteam 核心使用原则（红线）

> 版本: v20260903 | 优先级: **最高（强制规则，违者任务不合格）**
> 适用: payteam 4 个 worker 所有任务、pay-orchestrator 所有路由、所有知识库引用

---

## 🔴 核心红线：所有资料仅供参考，实际使用必须核实

### 规则文本
> **凡引用知识库（fulltext/、books/、standards/、蚂蚁系列、调研报告、索引、框架文档）中的任何数据、结论、限额、版本、技术参数、法规条文、统计数字、交易流程、报文字段定义、算法细节、合规要求——在实际交付（代码/方案/报告/设计文档）前，必须进行独立核实，确认无误后方可使用。**

### 核实方式（按资料类型分层）

| 资料类型 | 核实最低要求 | 核实工具/渠道 |
|---------|-------------|-------------|
| **法规/监管文件**（国令、央行文、外管局文、JR/T 标准） | 原文官网/金融标准全文公开系统核对条文编号、发布日期、实施日期、是否废止 | http://www.gov.cn/、http://www.pbc.gov.cn/、http://www.cfstc.org/、http://www.safe.gov.cn/ |
| **技术规范**（ISO 8583、EMV、PBOC、银联 QCUP、网联 Q-NUC、PCI DSS、3DS） | 官方标准原文/会员门户最新版 / 银联官网/网联官网/EMVCo 官网 | https://www.iso.org/、https://www.emvco.com/、https://cn.unionpay.com/、https://www.netsunion.com.cn/ |
| **统计/市场数据**（份额、累计额、交易量、用户数） | 权威机构最新公报/年报/季报，标注时间窗口 | 央行支付体系运行情况、银联年报、网联年报、第三方权威机构（如艾瑞/Analysys） |
| **产品/技术参数**（限额、费率、字段定义、响应码、TLV TAG） | 官方接口文档/开发者门户/沙箱实测 | 银联开放平台、网联开放平台、各大银行开放平台、支付宝/微信支付开发文档 |
| **内部经验/案例**（蚂蚁系列、陈天宇宙文章、调研报告） | 标注时间窗口，标注"仅供参考/案例"，不作为规范依据 | 对照最新法规/规范/官方文档，发现冲突以官方为准 |
| **书籍/教材**（《支付之门》、《跨境支付及金融服务》） | 确认版次/印次，核对是否有勘误表/再版更新 | 机械工业出版社官网、作者公众号、得到/微信读书最新版 |

### 违规判定
| 场景 | 判定 |
|------|------|
| 直接引用知识库限额/阈值/版本号未核实 | **任务不合格** |
| 引用陈天宇宙文章数据未标注"仅供参考/时间窗口" | **任务不合格** |
| 发现 known-conflicts.md 冲突未按裁决结论执行 | **任务不合格** |
| 交付物中出现已知过期信息（如 296 号文旧限额、PBOC 2.0 版本、SWIFT MT 未结束等） | **任务不合格** |
| 未在 completion metadata 记录核实来源 | **任务不合格** |

---

## 强制完成检查项（kanban_complete 前必须勾选）

```
[ ] 所有引用的法规/标准/规范条文编号、版本、日期已在官方渠道核对
[ ] 所有限额/阈值/费率/统计数字已在权威最新渠道核对并标注时间窗口
[ ] 所有技术参数（字段/响应码/TLV/算法）已对照官方接口文档/沙箱核对
[ ] 所有引用陈天宇宙/蚂蚁系列/调研报告数据已标注"仅供参考/时间窗口"
[ ] 所有 known-conflicts.md 涉及的冲突点均按裁决结论处理
[ ] completion.metadata.verification_sources 记录核实渠道+时间+结果
```

### verification_sources 标准格式
```json
{
  "verification_sources": [
    {"claim": "静态码单笔限额500元", "source": "央行296号文/银联官网2024版收单规则", "verified_at": "2026-09-03", "status": "confirmed"},
    {"claim": "ISO 8583 DE39响应码表", "source": "银联交换系统技术规范第2部分(2015版)/官网最新版", "verified_at": "2026-09-03", "status": "confirmed"},
    {"claim": "e-CNY累计16.7万亿", "source": "央行2025年支付体系运行情况", "verified_at": "2026-09-03", "status": "confirmed", "time_window": "截至2025年年底"}
  ]
}
```

---

## 2. 集成到现有质量门

### Diamond 质量门第 0 门（新增，硬门）
> **前置核实门**：所有引用外部资料的数据点，必须完成上述核实清单，否则直接 `kanban_request_changes(reason="未完成前置核实门")`

### 现有第 1/3/4/7 门强化
- 第 1 门（Eligibility）：新增"是否完成前置核实"
- 第 3 门（Privacy）：新增"引用数据是否含未核实敏感信息"
- 第 4 门（Asset）：新增"交付物中数据点是否全部可追溯核实来源"
- 第 7 门（Repair-prompt）：核实失败时自动生成修正 prompt

---

## 3. SOUL.md 强制植入（4 个 worker + orchestrator）

在每个 SOUL.md「共享规则」或「核心纪律」段落插入：

```markdown
### 🔴 核心红线：资料仅供参考，使用前必须核实

**凡引用知识库任何数据/结论/参数，交付前必须独立核实，确认无误方可使用。**
- 核实最低要求见 `standards/CORE-USAGE-PRINCIPLE.md`
- 完成检查项见上文"强制完成检查项"
- `kanban_complete` 时 `metadata.verification_sources` 必须记录核实渠道+时间+结果
- 违规 = 任务不合格，直接 `kanban_request_changes`
```

---

## 4. 索引挂接
- `pay-knowledge-index.md` 新增核心红线条目
- 所有框架文档（`*_FRAMEWORK.md`、`kernel-frameworks.md`、`BOOKS-KNOWLEDGE-FRAMEWORK.md`、`UNIONPAY-FRAMEWORK.md`、`WANGLIAN-QNUC.md`、`STANDARDS-FRAMEWORK.md`、`ant-ledger-domain-frameworks.md`）头部追加红线提示

---

## 执行确认

要我现在：
1. 写入 `standards/CORE-USAGE-PRINCIPLE.md`（已完成上方内容）
2. 批量 patch 4 个 SOUL.md + pay-orchestrator SOUL.md 植入红线
3. 更新索引挂接
4. 给 7 个框架文档头部追加红线提示

回复"执行"即开始<tool_call>
<function=write_file>
<parameter=content>
# CORE-USAGE-PRINCIPLE.md — payteam 核心使用原则（红线）

> 版本: v20260903 | 优先级: **最高（强制规则，违者任务不合格）**
> 适用: payteam 4 个 worker 所有任务、pay-orchestrator 所有路由、所有知识库引用

---

## 🔴 核心红线：所有资料仅供参考，实际使用必须核实

### 规则文本
> **凡引用知识库（fulltext/、books/、standards/、蚂蚁系列、调研报告、索引、框架文档）中的任何数据、结论、限额、版本、技术参数、法规条文、统计数字、交易流程、报文字段定义、算法细节、合规要求——在实际交付（代码/方案/报告/设计文档）前，必须进行独立核实，确认无误后方可使用。**

### 核实方式（按资料类型分层）

| 资料类型 | 核实最低要求 | 核实工具/渠道 |
|---------|-------------|-------------|
| **法规/监管文件**（国令、央行文、外管局文、JR/T 标准） | 原文官网/金融标准全文公开系统核对条文编号、发布日期、实施日期、是否废止 | http://www.gov.cn/、http://www.pbc.gov.cn/、http://www.cfstc.org/、http://www.safe.gov.cn/ |
| **技术规范**（ISO 8583、EMV、PBOC、银联 QCUP、网联 Q-NUC、PCI DSS、3DS） | 官方标准原文/会员门户最新版 / 银联官网/网联官网/EMVCo 官网 | https://www.iso.org/、https://www.emvco.com/、https://cn.unionpay.com/、https://www.netsunion.com.cn/ |
| **统计/市场数据**（份额、累计额、交易量、用户数） | 权威机构最新公报/年报/季报，标注时间窗口 | 央行支付体系运行情况、银联年报、网联年报、第三方权威机构（如艾瑞/Analysys） |
| **产品/技术参数**（限额、费率、字段定义、响应码、TLV TAG） | 官方接口文档/开发者门户/沙箱实测 | 银联开放平台、网联开放平台、各大银行开放平台、支付宝/微信支付开发文档 |
| **内部经验/案例**（蚂蚁系列、陈天宇宙文章、调研报告） | 标注时间窗口，标注"仅供参考/案例"，不作为规范依据 | 对照最新法规/规范/官方文档，发现冲突以官方为准 |
| **书籍/教材**（《支付之门》、《跨境支付及金融服务》） | 确认版次/印次，核对是否有勘误表/再版更新 | 机械工业出版社官网、作者公众号、得到/微信读书最新版 |

### 违规判定
| 场景 | 判定 |
|------|------|
| 直接引用知识库限额/阈值/版本号未核实 | **任务不合格** |
| 引用陈天宇宙文章数据未标注"仅供参考/时间窗口" | **任务不合格** |
| 发现 known-conflicts.md 冲突未按裁决结论执行 | **任务不合格** |
| 交付物中出现已知过期信息（如 296 号文旧限额、PBOC 2.0 版本、SWIFT MT 未结束等） | **任务不合格** |
| 未在 completion metadata 记录核实来源 | **任务不合格** |

---

## 强制完成检查项（kanban_complete 前必须勾选）

```
[ ] 所有引用的法规/标准/规范条文编号、版本、日期已在官方渠道核对
[ ] 所有限额/阈值/费率/统计数字已在权威最新渠道核对并标注时间窗口
[ ] 所有技术参数（字段/响应码/TLV/算法）已对照官方接口文档/沙箱核对
[ ] 所有引用陈天宇宙/蚂蚁系列/调研报告数据已标注"仅供参考/时间窗口"
[ ] 所有 known-conflicts.md 涉及的冲突点均按裁决结论处理
[ ] completion.metadata.verification_sources 记录核实渠道+时间+结果
```

### verification_sources 标准格式
```json
{
  "verification_sources": [
    {"claim": "静态码单笔限额500元", "source": "央行296号文/银联官网2024版收单规则", "verified_at": "2026-09-03", "status": "confirmed"},
    {"claim": "ISO 8583 DE39响应码表", "source": "银联交换系统技术规范第2部分(2015版)/官网最新版", "verified_at": "2026-09-03", "status": "confirmed"},
    {"claim": "e-CNY累计16.7万亿", "source": "央行2025年支付体系运行情况", "verified_at": "2026-09-03", "status": "confirmed", "time_window": "截至2025年年底"}
  ]
}
```

---

## 2. 集成到现有质量门

### Diamond 质量门第 0 门（新增，硬门）
> **前置核实门**：所有引用外部资料的数据点，必须完成上述核实清单，否则直接 `kanban_request_changes(reason="未完成前置核实门")`

### 现有第 1/3/4/7 门强化
- 第 1 门（Eligibility）：新增"是否完成前置核实"
- 第 3 门（Privacy）：新增"引用数据是否含未核实敏感信息"
- 第 4 门（Asset）：新增"交付物中数据点是否全部可追溯核实来源"
- 第 7 门（Repair-prompt）：核实失败时自动生成修正 prompt

---

## 3. SOUL.md 强制植入（4 个 worker + orchestrator）

在每个 SOUL.md「共享规则」或「核心纪律」段落插入：

```markdown
### 🔴 核心红线：资料仅供参考，使用前必须核实

**凡引用知识库任何数据/结论/参数，交付前必须独立核实，确认无误方可使用。**
- 核实最低要求见 `standards/CORE-USAGE-PRINCIPLE.md`
- 完成检查项见上文"强制完成检查项"
- `kanban_complete` 时 `metadata.verification_sources` 必须记录核实渠道+时间+结果
- 违规 = 任务不合格，直接 `kanban_request_changes`
```

---

## 4. 索引挂接
- `pay-knowledge-index.md` 新增核心红线条目
- 所有框架文档（`*_FRAMEWORK.md`、`kernel-frameworks.md`、`BOOKS-KNOWLEDGE-FRAMEWORK.md`、`UNIONPAY-FRAMEWORK.md`、`WANGLIAN-QNUC.md`、`STANDARDS-FRAMEWORK.md`、`ant-ledger-domain-frameworks.md`）头部追加红线提示