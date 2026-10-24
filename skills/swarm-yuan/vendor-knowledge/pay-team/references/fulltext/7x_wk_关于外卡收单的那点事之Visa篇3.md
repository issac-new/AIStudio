# 关于外卡收单的那点事之Visa篇（3）

> **作者**: 外卡收单知识库 (Enzo Sun) | **专栏**: 大数跨境 10100.com/author/251667 | **发布**: 2025-10-20 | **原文通道**: 大数跨境专栏镜像 (Channel 0 直连)
> **采集时间**: 2026-09-08

---

1.1 消息结构说明
VisaNet 直连交易消息遵循 ISO 8583:1993 (Visa Extended Format) 标准，结合 Visa 自定义的报文头（Message Header）、专用私有域（如 Field 63 等）及 VisaNet 路由标识信息。
一条完整的Visa 交易请求或应答消息通常由以下部分组成：
序号
结构部分
说明
1
Message Header（消息头）
VisaNet 在 ISO8583 报文前增加的专有头部，用于标识报文方向、来源及目标系统。主要字段包括： 
- Destination Station ID（目的站点号） 
- Source Station ID（源站点号） 
- Message Status Indicator（消息状态） 
- Round Trip Control Information (用于匹配请求应答) 
- Message Format Indicator (MFI) 
- Message Function Code 等
2
MTI（Message Type Identifier）消息类型标识
表示交易报文的类型，例如：
0100 – 授权请求（Authorization Request） 
0110 – 授权应答（Authorization Response） 
0200 – 财务请求（Financial Request） 
0210 – 财务应答（Financial Response） 
0420 – 冲正通知（Reversal Advice） 
0430 – 冲正应答（Reversal Response） 等
3
Primary Bitmap & Secondary Bitmap & ThirdBitmap
位图用于标识报文中实际存在的Data Element 字段。每个 bit 对应 1 个 ISO 字段，当 bit 值为 1 时表示该字段存在。
4
Data Elements (ISO Fields)
报文主体数据，包含DE 1 至 DE 128 等标准域，常见字段包括： 
- DE 2 主账号（PAN） 
- DE 3 处理码（Processing Code） 
- DE 4 交易金额（Amount, Transaction） 
- DE 7 传输日期时间（Transmission Date & Time） 
- DE 11 系统跟踪号（STAN） 
- DE 37 检索参考号（RRN） 
- DE 41 终端标识号（TID） 
- DE 43 商户名称与地址 - DE 49 交易货币代码（Currency Code） 等
5
Private Data Fields (Visa Private Use)
Visa 专用私有域，包括但不限于： 
- DE 62 Visa Private Data（可包含各类控制数据） 
- DE 63 VIP Private Use Field（用于 VisaNet 内部标识及控制信息） 
- DE 126 Private Data（根据产品/业务类型定义） 等
补充说明：
1.VisaNet 采用 Big-Endian 编码，字符串为 EBCDIC及自定义字段编码、解码格式；
2.消息头根据请求、响应其头的长度及字段类型不同，具体请参考Visa相关文档；
3.VisaNet 消息通过 TCP/IP 或 TLS 直连方式传输，采用 VisaNet Session Control 协议（VSCP）进行会话管理；
4.在开发与调试时，应优先确认Header、MTI 与 Bitmap 的正确性，以确保 Visa 可识别报文类型与字段结构；
+------------------------+
| Reject Message Header  |  <-- VisaNet 加的(Header field 1 length must be 26 or higher)
+------------------------+
| Original Msg Header    |  <-- 原始发过来的报文头
+------------------------+
| Original Msg Data      |  <-- 原始发过来的数据部分（如 Bitmap + Data Elements）
+------------------------+
3.1.1 消息结构概述
VISA的授权类消息采用ISO 8583标准格式，主要由以下部分组成：
1、消息类型标识符（MTI）：指示消息的类型，如0100表示授权请求。
2、位图（Bitmap）：指示后续数据字段的存在与否。
3、数据字段（Data Elements）：包含具体的交易信息，如卡号、金额、交易时间等。
3.1.2 主要消息类型
常见的ISO 8583消息类型包括：
1、0100：授权请求（Authorization Request）
2、0110：授权请求响应（Authorization Request Response）
3、0400：授权撤销请求（Authorization Reversal Request）
4、0420：授权撤销请求响应（Authorization Reversal Request Response）
3.1.2.1 授权请求
0100：授权请求（Authorization Request）对应关系：
案例：
StandardMessageHeader.[1](headerLength): 16
StandardMessageHeader.[2](headerFlagAndFormat): 01
StandardMessageHeader.[3](textFormat): 02
StandardMessageHeader.[4](totalMessageLength): 009E
StandardMessageHeader.[5](destinationStationId): 000000
StandardMessageHeader.[6](sourceStationId): 132550
StandardMessageHeader.[7](roundTripControlInformation): 00
StandardMessageHeader.[8](vipFlags): 0000
StandardMessageHeader.[9](messageStatusFlags): 000000
StandardMessageHeader.[10](batchNumber): 00
StandardMessageHeader.[11](reserved): 000000
StandardMessageHeader.[12](userInformation): 00
------------------------------------------------------------------------------------
Message Type Indicator (MTI): 0100
Bitmap[64]: 723C648108608012
Active Fields ✅: [2, 3, 4, 7, 11, 12, 13, 14, 18, 19, 22, 25, 32, 37, 42, 43, 49, 60, 63]
DE [  2] (primaryAccountNumber): 4229989999000012
DE [  3] (processingCode): 000000
DE [  4] (amountTransaction): 000000012345
DE [  7] (transmissionDateAndTime): 1015061340
DE [ 11] (systemTraceAuditNumber): 999999
DE [ 12] (timeLocalTransaction): 141340
DE [ 13] (dateLocalTransaction): 1015
DE [ 14] (dateExpiration): 2512
DE [ 18] (merchantType): 5311
DE [ 19] (acquiringInstitutionCountryCode): 840
DE [ 22] (pointOfServiceEntryModeCode): 0000
DE [ 25] (pointOfServiceConditionCode): 59
DE [ 32] (acquiringInstitutionIdentificationCode): 401228
DE [ 37] (retrievalReferenceNumber): 528806999999
DE [ 42] (cardAcceptorIdentificationCode): 123456789111111
DE [ 43] (acceptorNameAndLocation): John                     London       US
DE [ 49] (currencyCodeTransaction): 840
DE [ 60] (additionalPosInformation): 010000000730
DE [ 63] (vipPrivateUseField): 8000000002
------------------------------------------------------------------------------------
DE 63 详情：
DE 63.[2](timeLimit): 0002
字段编号
字段名称
名称
长度
描述
2
primaryAccountNumber
主账号（PAN）
19
卡片的主账号
3
processingCode
处理码
6
指示交易类型和处理方式
4
amountTransaction
交易金额
12
交易金额，单位为分
7
transmissionDateAndTime
交易日期时间
10
交易发生的日期和时间
11
systemTraceAuditNumber
系统跟踪号
6
唯一标识一次交易的编号
12
timeLocalTransaction
本地时间
6
交易发生地的本地时间
13
dateLocalTransaction
本地日期
4
交易发生地的本地日期
14
dateExpiration
卡片有效期
4
卡片的有效期
18
merchantType
商户类型
4
商户类型
19
acquiringInstitutionCountryCode
收单机构国家代码
3
收单机构国家的标识码
22
pointOfServiceEntryModeCode
输入方式码
3
指示卡片输入方式，如刷卡、插卡、挥卡等
25
pointOfServiceConditionCode
点服务条件代码
2
点服务条件代码
32
acquiringInstitutionIdentificationCode
受理机构标识码
11
受理机构的标识码
37
retrievalReferenceNumber
参考号
12
交易的参考号
42
cardAcceptorIdentificationCode
受理机构标识码
15
受理机构的标识码
43
acceptorNameAndLocation
受理机构名称/位置
40
受理机构的名称和位置
49
currencyCodeTransaction
交易货币代码
3
交易使用的货币代码
60
additionalPosInformation
附加位置信息
可变
附加位置信息
63
vipPrivateUseField
VIP专用场地
可变
VIP专用场地
3.1.2.2 授权响应
0110：授权请求响应（Authorization Request Response）对应关系
案例：
StandardMessageHeader.[1](headerLength): 16
StandardMessageHeader.[2](headerFlagAndFormat): 01
StandardMessageHeader.[3](textFormat): 02
StandardMessageHeader.[4](totalMessageLength): 00ED
StandardMessageHeader.[5](destinationStationId): 132550
StandardMessageHeader.[6](sourceStationId): 000000
StandardMessageHeader.[7](roundTripControlInformation): 01
StandardMessageHeader.[8](vipFlags): 1000
StandardMessageHeader.[9](messageStatusFlags): 479410
StandardMessageHeader.[10](batchNumber): 05
StandardMessageHeader.[11](reserved): 013801
StandardMessageHeader.[12](userInformation): 00
------------------------------------------------------------------------------------
Message Type Indicator (MTI): 0110
Bitmap[128]: F22020810E5081060000000001020000
Active Fields ✅: [2, 3, 4, 7, 11, 19, 25, 32, 37, 38, 39, 42, 44, 49, 56, 62, 63, 104, 111]
DE [  2] (primaryAccountNumber): 4229989999000012
DE [  3] (processingCode): 003600
DE [  4] (amountTransaction): 000000012345
DE [  7] (transmissionDateAndTime): 1015061340
DE [ 11] (systemTraceAuditNumber): 999999
DE [ 19] (acquiringInstitutionCountryCode): 840
DE [ 25] (pointOfServiceConditionCode): 59
DE [ 32] (acquiringInstitutionIdentificationCode): 401228
DE [ 37] (retrievalReferenceNumber): 528806999999
DE [ 38] (authorizationIdentificationResponse): 057658
DE [ 39] (responseCode): 00
DE [ 42] (cardAcceptorIdentificationCode): 123456789111111
DE [ 44] (additionalResponseData): V
DE [ 49] (currencyCodeTransaction): 840
DE [ 56] (customerRelatedData): 01001F011DE5F0F0F1F0F0F1F3F0F2F0F1F6F1F4F8F9F7F5F9F5F1F7F9F8F0F6F0F3
DE [ 62] (customPaymentServiceFieldsBitmapFormat): E000020000000000C40305288224235660D2F4F7E5E2F1
DE [ 63] (vipPrivateUseField): 8000000002
DE [104] (transactionDescriptionAndTransactionSpecificData): 57000483025298
DE [111] (additionalTransactionSpecificData): 01002E8018E589A28140C995834B6B40C5A783888195878540D981A3858105C1F1F1F6F38208F5F0F4F2F3F5F4F98E01F1
------------------------------------------------------------------------------------
DE 44 详情：
DE 44.[1](responseSourceReasonCode): V
DE 44.[2](addressVerificationResultCode): null
DE 44.[3](additionalTokenResponseInformation): null
DE 44.[4](extendedSTIPReasonCode): null
DE 44.[5](cvvICVVResultsCode): null
DE 44.[6](pacmDiversionLevel): null
DE 44.[7](pacmDiversionReasonCode): null
DE 44.[8](cardAuthenticationResultsCode): null
DE 44.[9](reserved): null
DE 44.[10](cvv2ResultCode): null
DE 44.[11](originalResponseCode): null
DE 44.[12](reserved2): null
DE 44.[13](cavvResultCode): null
DE 44.[14](responseReasonCode): null
DE 44.[15](primaryAccountNumberLastFourDigitsForReceipt): null
DE 44.[16](cvmRequirementForPinLess): null
DE 56 详情：
DE56Dataset[01].Tag[01](paymentAccountReference): V0010013020161489759517980603
DE 62 详情：
DE 62.[1](authorizationCharacteristicsIndicator): D
DE 62.[2](transactionIdentifier): 305288224235660
DE 62.[3](validationCode): K47V
DE 62.[23](productId): S1
DE 63 详情：
DE 63.[2](timeLimit): 0002
DE 104 详情：
DE104Dataset[57].Tag[83](unknownField): êq
DE 111 详情：
Dataset ID: 01
Dataset Length: 002E
TLV Length: 46
➤ Tag: 80, Length: 18, Value: E589A28140C995834B6B40C5A783888195878540D981A385，真实值：Visa Inc., Exchange Rate
➤ Tag: 81, Length: 05, Value: C1F1F1F6F3，真实值：A1163
➤ Tag: 82, Length: 08, Value: F5F0F4F2F3F5F4F9，真实值：50423549
➤ Tag: 8E, Length: 01, Value: F1，真实值：1
字段编号
字段名称
名称
长度
描述
2
primaryAccountNumber
主账号（PAN）
19
卡片的主账号
3
processingCode
处理码
6
指示交易类型和处理方式
4
amountTransaction
交易金额
12
交易金额，单位为分
7
transmissionDateAndTime
交易日期时间
10
交易发生的日期和时间
11
systemTraceAuditNumber
系统跟踪号
6
唯一标识一次交易的编号
19
acquiringInstitutionCountryCode
收单机构国家代码
3
收单机构国家的标识码
25
pointOfServiceConditionCode
点服务条件代码
2
点服务条件代码
32
acquiringInstitutionIdentificationCode
受理机构标识码
11
受理机构的标识码
37
retrievalReferenceNumber
参考号
12
交易的参考号
38
authorizationIdentificationResponse
授权识别响应
6
授权识别响应码
39
responseCode
响应代码
2
响应标识码
42
cardAcceptorIdentificationCode
受理机构标识码
15
受理机构的标识码
44
additionalResponseData
附加响应数据
25
包含各种各样的响应消息数据。在所有0110授权响应中
49
currencyCodeTransaction
交易货币代码
3
交易使用的货币代码
56
customerRelatedData
客户相关数据
可变
该数据集以单字节格式存储客户数据
62
customPaymentServiceFieldsBitmapFormat
自定义支付服务字段位图格式
可变
自定义支付服务字段位图格式
63
vipPrivateUseField
VIP专用场地
可变
VIP专用场地
104
transactionDescriptionAndTransactionSpecificData
事务描述和事务特定数据
可变
事务描述和事务特定数据
111
additionalTransactionSpecificData
其他交易特定数据(TLV格式）
可变
事务数据集
3.1.2.3 授权撤销请求
0420：授权撤销请求（Authorization Reversal Request）对应关系
案例：
StandardMessageHeader.[1](headerLength): 16
StandardMessageHeader.[2](headerFlagAndFormat): 01
StandardMessageHeader.[3](textFormat): 02
StandardMessageHeader.[4](totalMessageLength): 00CE
StandardMessageHeader.[5](destinationStationId): 000000
StandardMessageHeader.[6](sourceStationId): 132550
StandardMessageHeader.[7](roundTripControlInformation): 00
StandardMessageHeader.[8](vipFlags): 0000
StandardMessageHeader.[9](messageStatusFlags): 000000
StandardMessageHeader.[10](batchNumber): 00
StandardMessageHeader.[11](reserved): 000000
StandardMessageHeader.[12](userInformation): 00
------------------------------------------------------------------------------------
Message Type Indicator (MTI): 0420
Bitmap[128]: F23C6481086080160000004000000000
Active Fields ✅: [2, 3, 4, 7, 11, 12, 13, 14, 18, 19, 22, 25, 32, 37, 42, 43, 49, 60, 62, 63, 90]
DE [  2] (primaryAccountNumber): 4229989999000012
DE [  3] (processingCode): 000000
DE [  4] (amountTransaction): 000000012345
DE [  7] (transmissionDateAndTime): 1015071325
DE [ 11] (systemTraceAuditNumber): 999998
DE [ 12] (timeLocalTransaction): 151325
DE [ 13] (dateLocalTransaction): 1015
DE [ 14] (dateExpiration): 2512
DE [ 18] (merchantType): 5311
DE [ 19] (acquiringInstitutionCountryCode): 840
DE [ 22] (pointOfServiceEntryModeCode): 0000
DE [ 25] (pointOfServiceConditionCode): 59
DE [ 32] (acquiringInstitutionIdentificationCode): 401228
DE [ 37] (retrievalReferenceNumber): 528807999998
DE [ 42] (cardAcceptorIdentificationCode): 123456789111111
DE [ 43] (acceptorNameAndLocation): John                     London       US
DE [ 49] (currencyCodeTransaction): 840
DE [ 60] (additionalPosInformation): 010000000730
DE [ 62] (customPaymentServiceFieldsBitmapFormat): 40000000000000000305288224235660
DE [ 63] (vipPrivateUseField): A0000000022501
DE [ 90] (originalDataElements): 010099999910150613400000040122800000000000
------------------------------------------------------------------------------------
DE 62 详情：
DE 62.[2](transactionIdentifier): 305288224235660
DE 63 详情：
DE 63.[2](timeLimit): 0002
DE 63.[4](switchReasonCode): 2501
字段编号
字段名称
名称
长度
描述
2
primaryAccountNumber
主账号（PAN）
19
卡片的主账号
3
processingCode
处理码
6
指示交易类型和处理方式
4
amountTransaction
交易金额
12
交易金额，单位为分
7
transmissionDateAndTime
交易日期时间
10
交易发生的日期和时间
11
systemTraceAuditNumber
系统跟踪号
6
唯一标识一次交易的编号
12
timeLocalTransaction
本地时间
6
交易发生地的本地时间
13
dateLocalTransaction
本地日期
4
交易发生地的本地日期
14
dateExpiration
卡片有效期
4
卡片的有效期
18
merchantType
商户类型
4
商户类型
19
acquiringInstitutionCountryCode
收单机构国家代码
3
收单机构国家的标识码
22
pointOfServiceEntryModeCode
输入方式码
3
指示卡片输入方式，如刷卡、插卡、挥卡等
25
pointOfServiceConditionCode
点服务条件代码
2
点服务条件代码
32
acquiringInstitutionIdentificationCode
受理机构标识码
11
受理机构的标识码
37
retrievalReferenceNumber
参考号
12
交易的参考号
42
cardAcceptorIdentificationCode
受理机构标识码
15
受理机构的标识码
43
acceptorNameAndLocation
受理机构名称/位置
40
受理机构的名称和位置
49
currencyCodeTransaction
交易货币代码
3
交易使用的货币代码
60
additionalPosInformation
附加位置信息
可变
附加位置信息
63
vipPrivateUseField
VIP专用场地
可变
VIP专用场地
90
originalDataElements
原始数据元素
42
原始数据元素
3.1.2.4 授权撤销响应
0420：授权撤销请求响应（Authorization Reversal Request Response）
案例：
StandardMessageHeader.[1](headerLength): 16
StandardMessageHeader.[2](headerFlagAndFormat): 01
StandardMessageHeader.[3](textFormat): 02
StandardMessageHeader.[4](totalMessageLength): 00E4
StandardMessageHeader.[5](destinationStationId): 132550
StandardMessageHeader.[6](sourceStationId): 000000
StandardMessageHeader.[7](roundTripControlInformation): 01
StandardMessageHeader.[8](vipFlags): 1000
StandardMessageHeader.[9](messageStatusFlags): 479410
StandardMessageHeader.[10](batchNumber): 07
StandardMessageHeader.[11](reserved): 013801
StandardMessageHeader.[12](userInformation): 00
------------------------------------------------------------------------------------
Message Type Indicator (MTI): 0430
Bitmap[128]: E22020810A5001060000004000020000
Active Fields ✅: [2, 3, 7, 11, 19, 25, 32, 37, 39, 42, 44, 56, 62, 63, 90, 111]
DE [  2] (primaryAccountNumber): 4229989999000012
DE [  3] (processingCode): 003600
DE [  7] (transmissionDateAndTime): 1015071325
DE [ 11] (systemTraceAuditNumber): 999998
DE [ 19] (acquiringInstitutionCountryCode): 840
DE [ 25] (pointOfServiceConditionCode): 59
DE [ 32] (acquiringInstitutionIdentificationCode): 401228
DE [ 37] (retrievalReferenceNumber): 528807999998
DE [ 39] (responseCode): 00
DE [ 42] (cardAcceptorIdentificationCode): 123456789111111
DE [ 44] (additionalResponseData): V
DE [ 56] (customerRelatedData): 01001F011DE5F0F0F1F0F0F1F3F0F2F0F1F6F1F4F8F9F7F5F9F5F1F7F9F8F0F6F0F3
DE [ 62] (customPaymentServiceFieldsBitmapFormat): 40000200000000000305288224235660E2F1
DE [ 63] (vipPrivateUseField): 8000000002
DE [ 90] (originalDataElements): 010099999910150613400000040122800000000000
DE [111] (additionalTransactionSpecificData): 01002B8018E589A28140C995834B6B40C5A783888195878540D981A3858105C1F1F1F6F38208F5F0F4F2F3F5F4F9
------------------------------------------------------------------------------------
DE 44 详情：
2025-10-15 15:13:26.322  INFO 10004 --- [nio-8006-exec-7] c.s.payment.utils.VisaNetPrintLogs       : 
DE 44.[1](responseSourceReasonCode): V
DE 44.[2](addressVerificationResultCode): null
DE 44.[3](additionalTokenResponseInformation): null
DE 44.[4](extendedSTIPReasonCode): null
DE 44.[5](cvvICVVResultsCode): null
DE 44.[6](pacmDiversionLevel): null
DE 44.[7](pacmDiversionReasonCode): null
DE 44.[8](cardAuthenticationResultsCode): null
DE 44.[9](reserved): null
DE 44.[10](cvv2ResultCode): null
DE 44.[11](originalResponseCode): null
DE 44.[12](reserved2): null
DE 44.[13](cavvResultCode): null
DE 44.[14](responseReasonCode): null
DE 44.[15](primaryAccountNumberLastFourDigitsForReceipt): null
DE 44.[16](cvmRequirementForPinLess): null
DE 56 详情：
DE56Dataset[01].Tag[01](paymentAccountReference): V0010013020161489759517980603
DE 62 详情：
DE 62.[2](transactionIdentifier): 305288224235660
DE 62.[23](productId): S1
DE 63 详情：
DE 63.[2](timeLimit): 0002
DE 111 详情：
Dataset ID: 01
Dataset Length: 002B
TLV Length: 43
➤ Tag: 80, Length: 18, Value: E589A28140C995834B6B40C5A783888195878540D981A385，真实值：Visa Inc., Exchange Rate
➤ Tag: 81, Length: 05, Value: C1F1F1F6F3，真实值：A1163
➤ Tag: 82, Length: 08, Value: F5F0F4F2F3F5F4F9，真实值：50423549
字段编号
字段名称
名称
长度
描述
2
primaryAccountNumber
主账号（PAN）
19
卡片的主账号
3
processingCode
处理码
6
指示交易类型和处理方式
4
amountTransaction
交易金额
12
交易金额，单位为分
7
transmissionDateAndTime
交易日期时间
10
交易发生的日期和时间
11
systemTraceAuditNumber
系统跟踪号
6
唯一标识一次交易的编号
19
acquiringInstitutionCountryCode
收单机构国家代码
3
收单机构国家的标识码
25
pointOfServiceConditionCode
点服务条件代码
2
点服务条件代码
32
acquiringInstitutionIdentificationCode
受理机构标识码
11
受理机构的标识码
37
retrievalReferenceNumber
参考号
12
交易的参考号
39
responseCode
响应代码
2
响应标识码
42
cardAcceptorIdentificationCode
受理机构标识码
15
受理机构的标识码
44
additionalResponseData
附加响应数据
25
包含各种各样的响应消息数据。在所有0110授权响应中
49
currencyCodeTransaction
交易货币代码
3
交易使用的货币代码
56
customerRelatedData
客户相关数据
可变
该数据集以单字节格式存储客户数据
62
customPaymentServiceFieldsBitmapFormat
自定义支付服务字段位图格式
可变
自定义支付服务字段位图格式
63
vipPrivateUseField
VIP专用场地
可变
VIP专用场地
90
originalDataElements
原始数据元素
42
原始数据元素
111
additionalTransactionSpecificData
其他交易特定数据(TLV格式）
可变
事务数据集
注：具体字段长度和内容可能根据不同的交易类型和实现方式有所调整。
3.1.3 消息构成
Visa的报文主要由两个主要部分组成：报文头（12或14个字段）、报文体；其中请求参数中作为标准报文组装，但响应参数分为两种：正常响应、异常响应；
正常响应：12个字段的请求头、报文体（MTI、Bitmap、Fields）；
异常响应：14个字段的请求头（含错误码）、12个字段的请求头（原始请求头）、报文体（MTI、Bitmap、Fields）；
其中无论是Message Header还是Message Type Indicator (MTI)、BitMap、Fields都是按照固定格式组装的报文数据；组装完成的数据在上送Visa VTS或者VCMS交易模拟器之前必须按照对应数据长度配置格式（2 或 4个byte）填充数据长度位标识；
3.1.3.1 位图组成格式：
3.1.3.2 消息头组成格式
3.1.3.3 报文组装 - 参数注解通用版
@Getter
public enum VisaFldFlag {
/**
* 十六进制
* */
HEX_DECIMAL,
/**
* 固定长度字段，使用 ASCII 编码
* */
ASCII_FIXED,
/**
* 1位byte可变长度的 ASCII 编码
* */
ASCII_VAR1,
/**
* 2位byte可变长度的 ASCII 编码
* */
ASCII_VAR2,
/**
* 3位byte可变长度的 ASCII 编码
* */
ASCII_VAR3,
/**
* 固定长度的 EBCDIC 编码
* */
EBCDIC_FIXED,
/**
* 1位byte可变长度的 EBCDIC 编码
* */
EBCDIC_VAR1,
/**
* 2位byte可变长度的 EBCDIC 编码
* */
EBCDIC_VAR2,
/**
* 3位byte可变长度的 EBCDIC 编码
* */
EBCDIC_VAR3,
/**
* 固定长度的 BCD 编码
* */
BCD_FIXED,
/**
* 1位byte可变长度的 BCD 编码
* */
BCD_VAR1,
/**
* 2位byte可变长度的 BCD 编码
* */
BCD_VAR2,
/**
* 3位byte可变长度的 BCD 编码
* */
BCD_VAR3,
/**
* 固定长度的 binary 编码
* */
BINARY_FIXED,
/**
* 1位byte可变长度的 binary 编码
* */
BINARY_VAR1,
/**
* 2位byte可变长度的 binary 编码
* */
BINARY_VAR2,
/**
* 3位byte可变长度的 binary 编码
* */
BINARY_VAR3,
/**
* BINARY_EBCDIC_FIXED 编码
* */
BINARY_EBCDIC_FIXED;
}
@Target({ElementType.FIELD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface IsoVisa8583Annotation {
/**
* 域索引
* @return
*/
int fldIndex();
/**
* 域字段标识
* FIXED:固定长度；UNFIXED_2:2位变长；UNFIXED_3:3位变长
* @return
*/
VisaFldFlag fldFlag();
/**
* 数据域长度
* @return
*/
int dataFldLength();
/**
* 字段描述
*/
String filedDescription();
/**
* 数据域字节长度
*/
//    String dataByteLength();

}
3.1.3.4 报文组装 - Header通用版
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class StandardMessageHeader {
//+------------------------+
//| Reject Message Header  |  <-- VisaNet 加的(Header field 1 length must be 26 or higher)
//+------------------------+
//| Original Msg Header    |  <-- 原始发过来的报文头
//+------------------------+
//| Original Msg Data      |  <-- 原始发过来的数据部分（如 Bitmap + Data Elements）
//+------------------------+
/**
* Field 1 – Header Length
*  fixed length：报头字段 1 以十六进制指定此报头中的字节数
*  1 byte
*/
@IsoVisa8583Annotation(
fldIndex = 1, dataFldLength = 1, fldFlag = VisaFldFlag.HEX_DECIMAL, filedDescription = "头长度")
private String headerLength;
/**
* Header Field 2 – Header Flag and  Format
*  8 N, bit string
*  1 byte
*/
@IsoVisa8583Annotation(
fldIndex = 2, dataFldLength = 1, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "头标识和格式")
private String headerFlagAndFormat;
/**
* Header Field 3 – Text Format
*  1B (binary)
*  1 byte
*/
@IsoVisa8583Annotation(
fldIndex = 3, dataFldLength = 1, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "文本格式")
private String textFormat;
/**
* Header Field 4 – Total Message Length
*  2B (binary)
*  2 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 4, dataFldLength = 2, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "消息总长度")
private String totalMessageLength;
/**
* Header Field 5 – Destination Station ID
*  6 N, 4-bit Binary-Coded Decimal Notation (BCD) (unsigned packed)
*  3 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 5, dataFldLength = 3, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "目的地ID")
private String destinationStationId;
/**
* Header Field 6 – Source Station ID
*  6 N, 4-bit BCD (unsigned packed)
*  3 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 6,
dataFldLength = 6, // �� 明确指明数字长度为 6（将会编码为 3 字节）
fldFlag = VisaFldFlag.BCD_FIXED,
filedDescription = "源站 ID"
)
private String sourceStationId;
/**
* Header Field 7 – Round-Trip Control Information
*  8 N, bit string
*  1 byte
*/
@IsoVisa8583Annotation(
fldIndex = 7, dataFldLength = 1, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "往返控制信息")
private String roundTripControlInformation;
/**
* Header Field 8 – V.I.P. Flags
*  16 N, bit string
*  2 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 8, dataFldLength = 2, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "VIP标识")
private String vipFlags;
/**
* Header Field 9 – Message Status Flags:此字段用于控制消息的处理。当前定义的标志在图中以复选标记标识
*  3 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 9, dataFldLength = 3, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "消息状态标志")
private String messageStatusFlags;
/**
* Header Field 10 – Batch Number
* 此字段包含 VisaNet 为该报文分配的批次号。VisaNet 收到每个新的请求或通知时，都会将当前的对账批次号插入此字段。
* 当 VisaNet 收到之前已处理的重复报文时，批次号和字段 15 中的结算日期将设置为先前处理时确定的值。
* VisaNet 为来自清算端点的交易创建的通知分配批次号 255
*  1B (binary)
*  1 byte
*/
@IsoVisa8583Annotation(
fldIndex = 10, dataFldLength = 1, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "批次号")
private String batchNumber;
/**
* Header Field 11 – Reserved
* 3B (binary)
* 3 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 11, dataFldLength = 3, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "保留字段")
private String reserved;
/**
* Header Field 12 – User Information
*  1B (binary)
*  1 byte
*/
@IsoVisa8583Annotation(
fldIndex = 12, dataFldLength = 1, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "用户信息")
private String userInformation;
/**
* Header Field 13 – Bitmap
* 16 N, bit string   拒绝的头中才会有此数据信息
* 2 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 13, dataFldLength = 2, fldFlag = VisaFldFlag.BINARY_FIXED, filedDescription = "位图")
private String bitmap;
/**
* Header Field 14 – Bitmap, Reject Data Group
* 4 N, 4-bit BCD (unsigned packed) 拒绝的头中才会有此数据信息
* 2 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 14, dataFldLength = 4, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "位图，拒绝数据组")
private String bitmapRejectDataGroup;

}
3.1.3.5 报文组装 - Body通用版
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class VisaIso8583InterfaceDTO  {
/**
* 位图域
*/
private int bitMapLength;
/**
* 完整位图
*/
private String bitMap;
/**
* 消息类型
*  fixed length
* 4 N, 4–bit BCD (unsigned packed), 2 bytes
*/
//    @IsoVisa8583Annotation(
//            fldIndex = 0, dataFldLength = 4, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "Message Type Identifier Structure")
private String messageTypeIdentifierStructure;
/**
* Field 2 – Primary Account Number
*  variable length
*  1 byte, binary +
*  19 N, 4-bit BCD (unsigned packed); maximum 11 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 2, dataFldLength = 19, fldFlag = VisaFldFlag.BCD_VAR1, filedDescription = "卡号")
private String primaryAccountNumber;
/**
* Field 3 – Processing Code 使用枚举 VisaProcessingCodeEnum 组装此字段
*  fixed length
*  6 N, 4-bit BCD (unsigned packed); 3 bytes
*  Positions 1-2, Transaction Type: A 2-digit code identifying the customer transaction type or the center function being processed.
*  Positions 3-4, Account Type (From): A 2-digit code identifying the account type affected by this transaction or from which an account transfer is made.
*  Positions 5-6, Account Type (To): For ATM account transfers, a two-digit code identifying the account type to which an account transfer is made.
*/
@IsoVisa8583Annotation(
fldIndex = 3, dataFldLength = 6, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "处理码"
)
private String processingCode;
private ProcessingCode processingCodeObj;
/**
* Field 4 – Amount, Transaction
*  fixed length
*  12 N, 4-bit BCD (unsigned packed); 6 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 4, dataFldLength = 12, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "交易金额"
)
private String amountTransaction;
/**
* Field 6 – Amount, Cardholder Billing
*  fixed length
*  12 N, 4-bit BCD (unsigned packed); 6 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 6, dataFldLength = 12, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "持卡人账单金额"
)
private String amountCardholderBilling;
/**
* Field 7 – Transmission Date and Time
*  fixed length
*  10 N, 4-bit BCD (unsigned packed); 5 bytes
*  format: MMDDhhmmss
*/
@IsoVisa8583Annotation(
fldIndex = 7, dataFldLength = 10, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "传输日期和时间"
)
private String transmissionDateAndTime;
/**
* Field 9 – Conversion Rate, Settlement
*  fixed length
*  8 N, 4-bit BCD (unsigned packed); 4 bytes
*  示例：69985022 = 9.985022
*/
@IsoVisa8583Annotation(
fldIndex = 9, dataFldLength = 8, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "结算转换率"
)
private String conversionRateSettlement;
/**
* Field 10 – Conversion Rate, Cardholder Billing
*  fixed length
*  8 N, 4-bit BCD (unsigned packed); 4 bytes
*  示例：69985022 = 9.985022
*/
@IsoVisa8583Annotation(
fldIndex = 10, dataFldLength = 8, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "持卡人账单转换率"
)
private String conversionRateCardholderBilling;
/**
* Field 11 – System Trace Audit Number
*  fixed length
*  6 N, 4-bit BCD (unsigned packed); 3 bytes
*  Visa 明确要求：冲正（Reversal）或撤销（Cancellation）必须使用原始授权请求中的 Field 11（System Trace Audit Number, STAN），而不是新生成的 STAN。
*  所有属于同一笔交易生命周期的消息（授权、撤销、冲正、完成、完成冲正等）都必须复用相同的 Field 11 值
*/
@IsoVisa8583Annotation(
fldIndex = 11, dataFldLength = 6, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "系统跟踪审计号"
)
private String systemTraceAuditNumber;
/**
* Field 12 – Time, Local Transaction
*  fixed length
*  6 N, 4-bit BCD (unsigned packed); 3 bytes
*  format: hhmmss
*/
@IsoVisa8583Annotation(
fldIndex = 12, dataFldLength = 6, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "本地交易时间"
)
private String timeLocalTransaction;
/**
* Field 13 – Date, Local Transaction
*  fixed length
*  4 N, 4-bit BCD (unsigned packed); 2 bytes
*  format: mmdd
*/
@IsoVisa8583Annotation(
fldIndex = 13, dataFldLength = 4, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "本地交易日期"
)
private String dateLocalTransaction;
/**
* Field 14 – Date, Expiration
*  fixed length
*  4 N, 4-bit BCD (unsigned packed); 2 bytes
*  format: yymm
*/
@IsoVisa8583Annotation(
fldIndex = 14, dataFldLength = 4, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "卡号过期日期"
)
private String dateExpiration;
/**
* Field 15 – Date, Settlement
*  fixed length
*  4 N, 4-bit BCD (unsigned packed); 2 bytes
*  format: mmdd
*/
@IsoVisa8583Annotation(
fldIndex = 15, dataFldLength = 4, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "结算日期"
)
private String dateSettlement;
/**
* Field 18 – Merchant Type
*  fixed length
*  4 N, 4-bit BCD (unsigned packed); 2 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 18, dataFldLength = 4, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "商户类型"
)
private String merchantType;
/**
* Field 19 – Acquiring Institution Country Code
*  fixed length
*  3 N, 4-bit BCD (unsigned packed); 2 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 19, dataFldLength = 3, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "收单机构国家代码"
)
private String acquiringInstitutionCountryCode;
/**
* Field 20 – PAN Extended, Country Code
*  fixed length
*  3 N, 4-bit BCD (unsigned packed); 2 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 20, dataFldLength = 3, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "PAN扩展国家代码"
)
private String panExtendedCountryCode;
/**
* Field 22 – Point-of-Service Entry Mode Code
*  fixed length
*  4 N, 4-bit BCD (unsigned packed); 2 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 22, dataFldLength = 4, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "服务点输入模式代码"
)
private String pointOfServiceEntryModeCode;
/**
* Field 23 – Card Sequence Number
*  fixed length
*  3 N, 4-bit BCD (unsigned packed); 2 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 23, dataFldLength = 3, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "卡序列号"
)
private String cardSequenceNumber;
/**
* Field 25 – Point-of-Service Condition Code
*  fixed length
*  2 N, 4-bit BCD (unsigned packed); 1 byte
*/
@IsoVisa8583Annotation(
fldIndex = 25, dataFldLength = 2, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "服务点条件代码"
)
private String pointOfServiceConditionCode;
/**
* Field 26 – Point-of-Service PIN Capture Code
*  fixed length
*  2 N, 4-bit BCD (unsigned packed); 1 byte
*/
@IsoVisa8583Annotation(
fldIndex = 26, dataFldLength = 2, fldFlag = VisaFldFlag.BCD_FIXED, filedDescription = "服务点PIN捕获代码"
)
private String pointOfServicePinCaptureCode;
/**
* Field 28 – Amount, Transaction Fee
*  fixed length
*  1 AN, EBCDIC +
*  8 N, EBCDIC
*  total: 9 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 28, dataFldLength = 9, fldFlag = VisaFldFlag.EBCDIC_FIXED, filedDescription = "交易费用金额"
)
private String amountTransactionFee;
/**
* Field 32 – Acquiring Institution Identification Code
*  variable length
*  1 byte, binary +
*  11 N, 4-bit BCD (unsigned packed); maximum 7 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 32, dataFldLength = 11, fldFlag = VisaFldFlag.BCD_VAR1, filedDescription = "收单机构标识代码"
)
private String acquiringInstitutionIdentificationCode;
/**
* Field 33 – Forwarding Institution Identification Code
*  variable length
*  1 byte, binary +
*  11 N, 4-bit BCD (unsigned packed); maximum 7 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 33, dataFldLength = 11, fldFlag = VisaFldFlag.BCD_VAR1, filedDescription = "转发机构标识代码"
)
private String forwardingInstitutionIdentificationCode;
/**
* Field 34 – Acceptance Environment Data (TLV Format)
*  variable length
*  2 bytes, binary
*  1535 bytes, variable by usage, maximum 1537 bytes
*/
@IsoVisa8583Annotation(
fldIndex = 34, dataFldLength = 1535, fldFlag = VisaFldFlag.BINARY_VAR2, filedDescription = "接受环境数据(TLV格式)"
)
private String acceptanceEnvironmentData;
<
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
