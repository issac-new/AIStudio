# EMV / PBOC 3.0 标准规范知识框架

> 来源: 用户提供的官方规范 PDF 23 份（2026-09-03 入库） | 全文: `standards/` 目录，共 273 万字符
> 定位: 补齐 STANDARDS-COVERAGE.md 缺口 #1/#4/#11（PBOC IC 卡规范/支付标记化框架/EMV Books）

---

## 一、EMV v4.4 四大 Book（EMVCo 官方，ICC 芯片卡全球标准）

| Book | 主题 | 字符量 | 核心内容 |
|------|------|--------|---------|
| Book 1 | ICC to Terminal Interface | 14.5万 | 电气物理特性、交易协议、TLV 编解码 |
| Book 2 | Security and Key Management | 40万 | 静态/动态数据认证（SDA/DDA/CDA）、密钥体系、PIN 管理 |
| Book 3 | Application Specification | 44.2万 | 应用内核、数据元（Tag/TLV）、交易流程（GPO/生成AC/脚本） |
| Book 4 | Other Interfaces | 25.8万 | 持卡人/收单行接口、借记/贷记互操作 |

**关键机制速查**：
- 交易流程: Application Selection → GPO → 记录读取 → 终端风险管理 → 生成密文（ARQC 授权/TC 批准/AAC 拒绝）→ 发卡行脚本
- 密文体系: ARQC（在线授权请求）/ TC（交易证书）/ AAC（拒绝）；ARPC 回复
- 认证演进: SDA（静态）→ DDA（动态）→ CDA（组合）

## 二、EMVCo Payment Tokenisation（支付标记化，v2.3 框架 + v2.2.1 用例指南）

- **架构角色**: Token Service Provider (TSP)、Token Requestor、Token 生命周期（provisioning/suspend/resume/delete）
- **用例指南 187 页**: 电商/钱包/可穿戴/xPyT（card-on-file、CNIP 交易）
- **PAR 白皮书**: Payment Account Reference——与 PAN 解耦的账户引用标识，跨 Token 关联

## 三、PBOC 3.0《中国金融集成电路（IC）卡规范》13 册（央行/全国金标委）

| 分册 | 主题 | 字符量 |
|------|------|--------|
| 第3部分 | 与应用无关的 IC 卡与终端接口 | 7.3万 |
| 第4部分 | 借记贷记应用规范（PBOC 借贷记核心） | 5.4万 |
| 第5部分 | 借记贷记应用卡片规范 | 12.6万 |
| 第6部分 | 借记贷记应用终端规范 | 7.7万 |
| 第7部分 | 借记贷记应用安全规范 | 6.1万 |
| 第8部分 | 与应用无关的非接触式规范 | 7.5万 |
| 第10部分 | 个人化指南 | 2.7万 |
| 第11部分 | 非接触式 IC 卡通讯规范 | 6.4万 |
| 第12部分 | 非接触式 IC 卡支付规范（qPBOC） | 6.0万 |
| 第13部分 | 小额支付（电子现金）规范 | 4.4万 |
| 第14部分 | 非接触式小额支付扩展 | 3.5万 |
| 第15部分 | 电子现金双币支付 | 1.1万 |
| 第16部分 | IC 卡互联网终端 | 4.6万 |
| 第17部分 | 借记贷记安全增强 | 3.2万 |

**PBOC 与 EMV 关系**: PBOC 借贷记 = EMV Book 1-3 的中国本土化（国密算法 SM1/SM4 替代 RSA/DES、CVR/TCV 差异、电子现金脱机余额）

## 四、payteam 引用路由

| 任务类型 | 首选规范 | worker |
|---------|---------|--------|
| IC 卡/终端/交易流程 | EMV Book 3 + PBOC 第4/5/6部分 | pay-infra |
| 卡安全/密钥/认证 | EMV Book 2 + PBOC 第7/17部分 | pay-infra + pay-fintech |
| 非接触/移动支付 (NFC/qPBOC/HCE) | PBOC 第8/11/12部分 | pay-infra |
| 电子现金/小额支付 | PBOC 第13/14/15部分 | pay-clearing |
| 支付标记化/Token/钱包绑卡 | EMVCo Tokenisation 4 份 | pay-infra |
| PAR/账户引用/跨 Token 关联 | PAR 白皮书 | pay-fintech |
| 个人化/发卡 | PBOC 第10部分 | pay-infra |

## 五、覆盖度对账更新（对 STANDARDS-COVERAGE.md）

- ✅ 缺口 #1 PBOC IC 卡规范 → **已全文**（13 册）
- ✅ 缺口 #4 支付标记化技术框架 → **已全文**（EMVCo 4 份）
- ✅ 缺口 #11 EMV Book 具体规范 → **已全文**（4 Books）
- 仍缺口: ISO 8583 详解、银联/网联接口规范（Downloads 有 Q-NUC 系列待处理）、JR/T 数据分级、二维码规范、移动金融 HCE/SE/TSM、W3C/FIDO、8583→20022 对照
