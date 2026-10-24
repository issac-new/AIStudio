# 外卡收单那点事儿之Visa篇（6）

> **作者**: 外卡收单知识库 (Enzo Sun) | **专栏**: 大数跨境 10100.com/author/251667 | **发布**: 2025-11-05 | **原文通道**: 大数跨境专栏镜像 (Channel 0 直连)
> **采集时间**: 2026-09-08

---

4.11 Visa VCX 系统的完整 File Type 代码表（ITF TC90 文件类型定义）
4.11.1 BASE II 自定义交付和拆分路由文件类型
File Type
BASE II Customized Delivery File Type (ITF TC90)
Business Description
文件类型
BASE II 定制交付文件类型 (ITF TC90)
业务描述
ACKNOWL EDGEMENT
MA
AK
Retired.
已停用
Acquirer Services Reporting Advices
ASRA
Acquirer services reporting
收单服务报告
Assessment — Generic
Retired.
已停用
ATM Back-Office
ATMBO
Back-office ATM transactions; dispute financials, dispute response financials, and their reversals.
后台ATM 交易；争议财务报表、争议响应财务报表及其撤销。
ATM Back-Office Credit
ATMBC
Back-office ATM transactions where the credit account was selected.
选择信用账户的后台ATM 交易。
ATM Back-Office Debit
ATMBD
Back-office ATM transactions where the savings or checking account was selected.
选择储蓄或支票账户的后台ATM 交易。
ATM Format Conversion: ALL
ATMAF
Used for ATM Format Conversion Service.
用于ATM 格式转换服务。
ATM Format Conversion: Credit
ATMFC
Used for ATM Format Conversion Service where credit account is selected.
用于选择信用账户的ATM 格式转换服务。
ATM Format Conversion: Debit
ATMFD
Used for ATM Format Conversion Service where debit account is selected.
用于选择借记账户的ATM 格式转换服务。
ATM Originated
ATMOR
Original and back-office ATM transactions, regardless of account type.
原始ATM 交易和后台 ATM 交易，无论账户类型如何。
ATM Originated Credit
ATMOC
Original and back-office ATM transactions where the credit account was selected.
选择信用账户的原始ATM 交易和后台 ATM 交易。
ATM Originated Debit
ATMOD
Original and back-office ATM transactions where the savings or checking account was selected.
选择储蓄或支票账户的原始ATM 交易和后台 ATM 交易。
Back-Office
BAKOF
All back-office transactions, both POS and ATM.
所有后台交易，包括POS 和 ATM。
BASE I Advices
B1ADV
Bulk file delivery of authorization Stand-in Advices
授权替代通知的批量文件传送
BASE II Returns
RTRN
Submitted transactions that failed clearing edits.
提交的未通过清算编辑的交易。
BASE I TC33 Report
B1T33
Specialized authorization reporting, such as special airline data.
专门的授权报告，例如特殊航空公司数据。
CAPTURE
Retired.
已停用
CAST33 NN/AN ADV
T33NN
Clearing and Settlement TC33 Advice – Allows Clearing and Settlement (CAS) TC33 advices for NNSS and ANSS transactions only to be sent in a separate delivery file. This will include transactions settled in a national or area net. Transactions will be combined if the same settlement window applies to both the national and area net.
清算和结算TC33 通知 – 仅允许将 NNSS 和 ANSS 交易的清算和结算 (CAS) TC33 通知以单独的交付文件发送。这将包括在国家或区域网络中结算的交易。如果同一结算窗口适用于国家和区域网络，则交易将被合并。
CAS TC33 ADV ISS
T33IS
Clearing and Settlement TC33 Advice – Allows Clearing and Settlement (CAS) TC33 advices for international transactions only to be sent in a separate delivery file. This will include transactions settled in the international settlement service. This can apply to domestic transactions settled in international settlement service.
清算和结算TC33 通知 – 仅允许将国际交易的清算和结算 (CAS) TC33 通知以单独的交付文件发送。这将包括在国际结算服务中结算的交易。这适用于在国际结算服务中结算的国内交易。
CDM ACQUIRER
CDMAQ
VDAS TC38 Flexible Routing options for Acquirers.
VDAS TC38 收单机构灵活路由选项。
CDM ISSUER
CDMIS
VDAS TC38 Flexible Routing options for Issuers.
VDAS TC38 发卡机构灵活路由选项。
Chargeback Reversals
CBREV
Used when an issuer wants to send dispute financials and their reversals and receive dispute response financials and their reversals and receive dispute financials.
当发卡机构想要发送争议财务报表及其撤销，并接收争议响应财务报表及其撤销以及接收争议财务报表时使用。
Clearing Data Capture
CDC
Data capture advices.
数据采集通知。
Clearing Settlement Advice
CAS33
TC33 Clearing and Settlement Advice – Allows Clearing and Settlement (CAS) TC33 Advices for ISS, NNSS, and ANSS transactions to be sent in a separate delivery file. This file will include transactions settled in an international and national or area net settlement service.
TC33 清算和结算通知 - 允许将 ISS、NNSS 和 ANSS 交易的清算和结算 (CAS) TC33 通知以单独的交付文件发送。该文件将包含通过国际和国内或区域网络结算服务结算的交易。
Combo Card
COMBO
Reserved for Brazil.
巴西保留。
Currency Rates
CURR
Daily (M-F) currency trading rates.
每日（周一至周五）货币交易汇率。
Debit Raw Data
DBRAW
Full Service detailed transaction data in a machine-readable format.
以机器可读格式提供全方位服务的详细交易数据。
Debit Reports
DBRPT
SMS detail reports.
短信详细报告。
Delta Balance File
UK Delta Service—Retired
英国Delta 服务 - 已停用
Detokenization
TKEXA
Support new TC33 Token Exchange Activity File to be used to populate on-us Clearing system data store.
支持新的TC33 代币交换活动文件，用于填充美国境内清算系统数据存储。
DISP CM SEND
DCMSO
Reserved for Brazil.
巴西保留
DISP CM SENDREC
DCMSR
Reserved for Brazil.
巴西保留
Edit Package ADP
Retired.
已停用
Edit Package ADT
Retired.
已停用
Edit Package MF
Retired.
已停用
Edit Package PC
Retired.
已停用
Edit Package Updates
EPUPD
Daily Edit Package VID and ARDEF table changes (TC54).
每日编辑包VID 和 ARDEF 表更改 (TC54)。
Edit Package Updates (VCX)
VCX54
VCX Daily Edit Package VID and ARDEF table changes (TC54).
VCX 每日编辑包 VID 和 ARDEF 表更改 (TC54)。
EP40 Code Update
EP4CB
Edit Package version 4 software updates (PC or Mainframe). Separates EP 4.0 Code update (software updates) from endpoint's regular daily incoming (UNDIF) files.
编辑包版本4 软件更新（PC 或大型机）。将 EP 4.0 代码更新（软件更新）与终端的每日常规传入文件 (UNDIF) 分离。
Fee/Funds
FEFUN
Used for issuers and acquirersto send and receive client-to-client Fee Collections and Funds Disbursements.
用于发卡机构和收单机构发送和接收客户间费用收取和资金支付。
Financial
FINAN
Any financial activity, segregated from nonfinancial transactions.
任何金融活动，与非金融交易分离。
Fraud
FRAUD
Fraud service data.
欺诈服务数据。
ICS Expedited
ICSX
Expedited issuer clearing house.
加急发卡机构清算所。
ICS Standard
ICS
Issuer clearing house.
发卡机构清算所。
IRF Detail Intl
IRFDI
Reserved for Japan.
为日本保留
IRF Detail NNSS
IRFDN
Reserved for Japan.
为日本保留
ISO Formatted
Retired.
已停用
Issuer Fee Service Report
Retired.
已停用
Japan National Net reports
JNS
Japan NNSS reports.
日本NNSS 报告。
NARS Expedited
NARS
National Application Review Service expedited.
国家应用审查服务加急。
National Net Settlement
NNSS
Allows clients within a country to settle domestic transactions through a local settlement agent bank. The service can be used for transactions where the merchant, acquirer, and issuer are in the same country. The custom file type puts all national net transactions into a separate file.
允许同一国家/地区的客户通过当地结算代理银行结算国内交易。该服务可用于商户、收单机构和发卡机构位于同一国家/地区的交易。自定义文件类型将所有国家净交易放入单独的文件中。
National Settlement Reports
NSRPT
National Net Settlement reports.
国家净结算报告。
NCRF Data
NCRF
Europe CRB.
欧洲CRB。
Nonfinancial
NONFI
All nonfinancial data segregated from financial transactions.
所有非金融数据与金融交易分离。
Non-Interchange
NONIC
Non-interchange Report File.
非交换报告文件。
Original Drafts
ORIG
Originals segregated from exception items and nonfinancial.
原件与异常项目和非财务项目分开。
PFX CAS Advice
PFX33
Alternate routing of the TC33 - PFX CAS Advice.
TC33 - PFX CAS 通知的替代路径。
POS Originals
POSOR
POS original transactions; that is, original presentments of clearing drafts and reversals.
POS 原始交易；即清算汇票和冲销的原始提示。
RC Adv Amt Total
REHV2
Reclassification advices reason code HV2.
重新分类通知原因代码HV2。
Reclassify Advices
READV
Reclassification advices.
重新分类通知。
Settlement report
SETLR
Settlement reports - machine-readable and print-ready (TC46 and TC47 combined)
结算报告- 机器可读且可打印（TC46 和 TC47 合并）
Settlement Reports (Machine-Readable)
SETLM
Settlement reports - machine-readable (TC46)
结算报告- 机器可读 (TC46)
Settlement Reports (Print)
SETLP
Print ready settlement reports (TC47).
可打印结算报告(TC47)。
SWEEPSTAKES
SWSTK
Sweepstakes - TC10 and TC20.
抽奖活动- TC10 和 TC20。
Sweepstakes VML Format
Retired.
已停用
TRID TC33 Report
TRRPT
Token Requestor ID (TRID) TC33 Report.
令牌请求者ID (TRID) TC33 报告。
UK Electronic HCF
UKNEG
UK electronic hot card file.
英国电子热卡文件。
Universal Biller File
Retired.
已停用
VCR Claim CO
VROLC
Split collection-only VCR disputes.
拆分仅收款的VCR 争议。
VCR Claim Msg
DFT33
Determine TC33 advice delivery for Dispute Financial to VROL.
确定将财务争议的TC33 通知交付给 VROL。
Visa Capture File
VCAPF
CyberSource Enhanced TC33 Capture File
CyberSource 增强型 TC33 捕获文件
Visa Rewards Assessment File
ASSMT
Visa Rewards fee collections/funds disbursements with TCQ 1.
使用TCQ 1 的 Visa Rewards 费用收取/资金支付。
Car Rental¹
CARNT
Level 3 commercial card data. TC50s with TCR0 Service Identifier = CORPCA
3 级商业卡数据。TC50 的 TCR0 服务标识符 = CORPCA
Car Rental¹
CRADE
Level 3 commercial card data. Car Rental (ADE). TC50s with TCR0 Service Identifier = CORPCD
3 级商业卡数据。汽车租赁 (ADE)。TC50 的 TCR0 服务标识符 = CORPCD
Car Rental¹
CRAD3
Level 3 commercial card data. TC50s with TCR0 Service Identifier = COMMCL
3 级商业卡数据。TC50 的 TCR0 服务标识符 = COMMCL
Car Rental - Line Item Detail¹
CRLID
Level 3 commercial card data. TC50s with TCR0 Service Identifier = CORPCL
3 级商业卡数据。TC50 的 TCR0 服务标识符 = CORPCL
Car Rental - Line Item Detail Third-Party¹
CR3RD
Level 3 commercial card data. TC50s with TCR0 Service Identifier = COMMCL
3 级商业卡数据。TC50 的 TCR0 服务标识符 = COMMCL
Electronic Bill Pres¹
EBFIL
TC50
TC50
Fleet Service¹
FLEET
Level 3 commercial card data. TC50s with TCR0 Service Identifier = COMFLT
三级商务卡数据。TC50s 带 TCR0 服务标识符 = COMFLT
General Use – Line Item Detail¹
GNLID
Level 3 commercial card data. TC50s with TCR0 Service Identifier = COMMXL
三级商务卡数据。TC50s 带 TCR0 服务标识符 = COMMXL
Generic Data¹
GENER
Level 3 commercial card data. TC50s with TCR0 Service identifier = COMMGN
三级商务卡数据。TC50s 带 TCR0 服务标识符 = COMMGN
Lodging¹
LODGE
Level 3 commercial card data. TC50s with TCR0 Service identifier = CORPLG
三级商务卡数据。TC50s 带 TCR0 服务标识符 = CORPLG
Lodging (ADE)¹
LGADE
Level 3 commercial card data. TC50s with TCR0 Service identifier = CORPLA
三级商务卡数据。TC50s 带 TCR0 服务标识符 = CORPLA
Lodging (ADE) Third-Party¹
LGAD3
Level 3 commercial card data. TC50s with TCR0 Service identifier = COMMIA
三级商务卡数据。TC50s 带 TCR0 服务标识符 = COMMIA
Lodging-Line Item Detail¹
LGLID
Level 3 commercial card data. TC50s with TCR0 Service identifier = CORPLL
三级商务卡数据。TC50s 带 TCR0 服务标识符 = CORPLL
Lodging-Line Item Detail (Third-Party)¹
LG3RD
Level 3 commercial card data. TC50s with TCR0 Service identifier = COMMLL
三级商务卡数据。TC50s 带 TCR0 服务标识符 = COMMLL
Open Format
OPNFM
Level 3 commercial card data. TC50s with TCR0 Service identifier = OPNFMT
三级商务卡数据。TC50s 带 TCR0 服务标识符 = OPNFMT
Passenger Itinerary Data¹
PASID
Level 3 commercial card data. TC50s with TCO Service identifier = CORPAI
三级商务卡数据。TC50s 带 TCO 服务标识符 = CORPAI
Passenger Itinerary Data Leg Perfifc (Third-Party)¹
PASL3
Level 3 commercial card data. TC50s with TCR0 Service identifier = COMMAS
三级商务卡数据。TC50s，TCR0 服务标识符 = COMMAS
Passenger Itinerary Data Leg Specific¹
PASLS
Level 3 commercial card data. TC50s with TCR0 Service Identifier = CORPAS
3 级商业卡数据。TC50s，TCR0 服务标识符 = CORPAS
Passenger Itinerary General¹
PASIG
Level 3 commercial card data. TC50s with TCR0 Service Identifier = COMMAG
3 级商业卡数据。TC50s，TCR0 服务标识符 = COMMAG
Purchase Txn ADE (TC50)¹
PRCHA
Level 3 commercial card data. TC50s with TCR0 Service Identifier = PURCHA
3 级商业卡数据。TC50s，TCR0 服务标识符 = PURCHA
Purchasing Transaction (ADE)¹
GNADE
Level 3 commercial card data. TC50s with a TCR0 Service Identifier = COMMXA
3 级商业卡数据。TC50s，TCR0 服务标识符 = COMMXA
Purchasing Transaction - Line Item Detail¹
PRCHL
Level 3 commercial card data. TC50s with TCR0 Service Identifier = PURCHL
3 级商业卡数据。TC50s，TCR0 服务标识符 = PURCHL
CRIS Reports
CRIS
Visa use only.
仅供Visa 使用
RFC
RFC
Visa use only.
仅供Visa 使用
RFC ACQUIRER
RFCAQ
Visa use only.
仅供Visa 使用
RFC ISSUER
RFCIS
Visa use only.
仅供Visa 使用
VCMS Responder
VCMSR
Visa use only.
仅供Visa 使用
Commercial Choice Select Reference Data
COMCH
The file type COMCH is used by the Visa Commercial Choice Select participating acquirers that subscribes to Commercial Choice Select reference data in RDMS. The file type of COMCH in the BASE II customized delivery file type identifies files containing the TC33 Commercial Choice Select reference data. The file is delivered weekly.
文件类型COMCH 由在 RDMS 中订阅 Commercial Choice Select 参考数据的 Visa Commercial Choice Select 参与收单机构使用。BASE II 定制交付文件类型中的 COMCH 文件类型标识包含 TC33 Commercial Choice Select 参考数据的文件。该文件每周交付一次。
CYB Capture File
Retired.
已停用
DUP TRANS RPTS
DUPCA
Duplicate Transaction Identification Detection and Reporting Service (GDTID) program reporting.
重复交易识别检测和报告服务(GDTID) 程序报告。
Generic GC File
GMRGC
TC50 BC file (EAS to APF).
TC50 BC 文件（EAS 到 APF）。
Generic GD File
GMRGD
Generic GD file (APF to Global Merchant Repository AMMF Server).
通用GD 文件（APF 到全球商户存储库 AMMF 服务器）。
GMR TC50 BC File
GMRBC
TC50 BC file ((EAS to APF).
TC50 BC 文件（EAS 到 APF）。
GMR TC50 BD File
GMRBD
TC50 BD file (APF to Global Merchant Repository AMMF Server).
TC50 BD 文件（APF 到全球商户存储库 AMMF 服务器）。
International Fee Advice
IFADV
Delivery of International Transaction Fee changes reports (ITFR).
国际交易费用变更报告(ITFR) 的递送。
Monthly Enrollment Detail
Retired.
已停用
Monthly Enrollment TC33
Retired.
已停用
Rewards Enrollment
Retired.
已停用
Rewards Points TC33
Retired.
已停用
RDMS
RDMS
Client reports from the Report Distribution Management System.
来自报告分发管理系统的客户报告。
Risk Adj Fee
FEE40
FEE 400 and FEE 500 series reports for Risk Adjusted fees.
FEE 400 和 FEE 500 系列风险调整费用报告。
Token Report
TKPRV
TC33 Token Provisioning Results (ODF to EAS)
TC33 代币配置结果（ODF 到 EAS）
4.11.2 整理推荐使用的收单行文件
文件类型
名称
是否必须
说明
收单行必须处理类文件
VCAPF
TC 33 Acquirer Capture File
✅ 必须
收单行最核心文件，包含已授权并清算的交易（即请款交易）；需每日接收与解析
SETLM
TC 46s - Machine Readable Settlement File
✅ 必须
用于结算金额的计算与入账，含各币种净额、汇率、结算日信息
CAS33
TC 33 Clearing and Settlement Advice Transactions
✅ 必须
提供详细交易结算数据明细，与VCAPF 相辅相成，用于清分入账
RTRN
BASE II Return File
✅ 必须
包含退货（Return / Chargeback）交易明细，用于退单处理
ASRA
Acquirer Services Reports and Advices
✅ 必须
各类清算、资金、报表通知集合（如收费、调整、异常等）
结算与汇率支持类文件
CURR
Currency Rates
✅ 必须
Visa 官方结算汇率，用于计算清算文件中交易的本币金额
SETLR
Settlement Report
✅ 建议
汇总每个清算周期的结算金额、汇率、账户信息；便于会计核对
NSRPT
Offline National Settlement Reports
⚙ 可选
仅部分区域（如本地清算）需要；若在英国地区一般不用
NNSS
National Net Settled Transactions
⚙ 可选
国家层级的净额结算统计报告；非核心文件
附加/分析类文件
IFADV
International Transaction Fee Program Report
⚙ 可选
国际交易手续费报告；如参与Visa International Fee Program 则需要
FRAUD
TC 40 Fraud File
✅ 建议
欺诈报告文件，重要用于监控可疑交易、合规要求
VCX54
VCX TC54 Table Updates
⚙ 可选
交易代码、费率参数更新；用于同步系统内部配置表
DBRAW
Debit Raw Data
⚙ 可选
原始借记交易数据；用于分析或本地合规申报
EPUPD
Edit Package Update
⚙ 可选
Visa 的数据校验规则更新（编辑包），供系统核查用；
UNDIF
Undefined File Type
⚙ 可选
兜底文件；存放任何未被明确路由到其他特定文件类型（如VCAPF、RTRN、CAS33 等）的交易
4.11.3 VCX配置文件示例
4.11.4 VCX Incoming run control profile文件配置
VCX从Visa EAS上拉取到对应类型文件输入到对应的文件夹，如下所示：
Transaction code
Output to
TC 10 - Fee Collection
File 02
TC 15 - Dispute Financial Message
File 03
TC 16 - Dispute Financial Message
File 03
TC 17 - Dispute Financial Message
File 03
TC 20 - Funds Disbursement
File 04
TC 30 - ICS/NARS Input Processing
File 05
TC 31 - ICS/NARS Response Processing
File 06
TC 33 - Multipurpose Message (All)
File 07
TC 35 - Sales Draft, Dispute Financial Reversal
File 08
TC 36 - Credit Voucher, Dispute Financial Reversal
File 09
TC 40 - Fraud Advice
File 10
TC 42 - Merchant File Update
File 11
TC 43 - Merchant File Update
File 11
TC 46 - Member Settlement Data
File 12
TC 56 - Currency Conversion Rate Update Record
File 13
TC 57 - Data Capture Advice
File 14
TC 58 - National Settlement Advice
File 15
TC 55 - RCRF Update Record
File 16
【声明】内容源于网络
0
0
外卡收单知识库
外卡收单知识库 聚焦Visa、Mastercard、JCB、Diners、Discover、AE、银联国际等卡组业务与技术体系，助力全面掌握外卡收单流程与标准。
内容 11
粉丝 0
关注 
在线咨询
外卡收单知识库  
外卡收单知识库 聚焦Visa、Mastercard、JCB、Diners、Discover、AE、银联国际等卡组业务与技术体系，助力全面掌握外卡收单流程与标准。
总阅读1.0k
 粉丝0
 内容11
旗下产品 M123.com
关于
 关于我们
商务合作
友情链接
加入大数
企业会员
帮助中心
隐私协议
版权声明
