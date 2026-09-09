# 中国银联移动支付技术规范 可信服务管理卷 第1部分 银联TSM与银行系统互联接口规范
> 来源: 银联规范 2015-12 存档 | 70页 | 提取: 2026-09-03


---
**[p1]**

Q/CUP 
Q/CUP 037.5.1—2015 
      
中国银联移动支付技术规范  
第5 卷:可信服务管理卷 
第1 部分:银联TSM 与银行系统互联 
接口规范 
China UnionPay Mobile Payment Specifications 
Volume 5 Trusted Service Manager Specifications 
Part 1 Specification for the Interface between CUP TSM and Bank 
 
 
 
2015 - 10 - 12 发布 
2015 - 10 - 12 实施 
中国银联股份有限公司   发布 
Q/CUP 
中国银联股份有限公司企业标准 
中国银联 
版权所有

---
**[p2]**

Q/CUP 037.5.1—2015 
 
I 
 
中国银联股份有限公司（以下简称“中国银联”）对该规范文档保留全部
知识产权权利，包括但不限于版权、专利、商标、商业秘密等。任何人对该
规范文档的任何使用都要受限于在中国银联成员机构服务平台
（http://member.unionpay.com/）与中国银联签署的协议之规定。中国银联不
对该规范文档的错误或疏漏以及由此导致的任何损失负任何责任。中国银联
针对该规范文档放弃所有明示或暗示的保证,包括但不限于不侵犯第三方知识
产权。 
未经中国银联书面同意，您不得将该规范文档用于与中国银联合作事项
之外的用途和目的。未经中国银联书面同意，不得下载、转发、公开或以其
它任何形式向第三方提供该规范文档。如果您通过非法渠道获得该规范文档，
请立即删除，并通过合法渠道向中国银联申请。 
中国银联对该规范文档或与其相关的文档是否涉及第三方的知识产权
（如加密算法可能在某些国家受专利保护）不做任何声明和担保，中国银联
对于该规范文档的使用是否侵犯第三方权利不承担任何责任，包括但不限于
对该规范文档的部分或全部使用。 
 
 
中国银联 
版权所有

---
**[p3]**

Q/CUP 037.5.1—2015 
 
II 
 
目 次 
前言 ................................................................. 错误!未定义书签。 
1 范围 ............................................................................... 1 
2 规范性引用文件 ..................................................................... 1 
3 术语和定义 ......................................................................... 1 
4 缩略语 ............................................................................. 1 
5 银联TSM 系统与银行系统之间的互联接口 ............................................... 2 
附录A （规范性附录） 应答码定义 ..................................................... 61 
A.1 应答码说明 ...................................................................... 61 
A.2 系统通讯状态应答码 .............................................................. 61 
A.3 业务处理状态应答码 .............................................................. 61 
附录B （规范性附录） EN-OTP 使用方法 ................................................ 65 
B.1 概述 ............................................................................ 65 
B.2 数据块构成 ...................................................................... 65 
B.3 加解密方式 ...................................................................... 65 
附录C （资料性附录） 报文接口实现要求 ............................................... 66 
 
 
中国银联 
版权所有

---
**[p4]**

Q/CUP 037.5.1—2015 
 
III 
 
前 言 
《中国银联移动支付技术规范》共分为五卷： 
——第1 卷：基础卷 
——第2 卷：设备卷 
——第3 卷：应用卷 
——第4 卷：交换系统卷 
——第5 卷：可信服务管理卷 
本部分为本规范的第5卷第1部分。 
本部分包含了银联TSM系统与银行系统之间的互联接口方面的内容。 
请注意本规范的某些内容可能涉及专利。本规范的发布机构不承担识别这些专利的责任。 
本部分由中国银联股份有限公司提出。 
本部分由中国银联技术部组织制定。 
本部分的主要起草单位：中国银联技术部。 
本部分起草单位：中国银联股份有限公司。 
本部分主要起草人：鲁志军、李伟、谭颖、夏庆凡、刘雪亮、邹震中、田丰、倪向远、王逸钦。 
 
 
中国银联 
版权所有

---
**[p5]**

Q/CUP 037.5.1—2015 
 
1 
 
中国银联移动支付技术规范 
第5 卷：可信服务管理卷 
第1 部分 银联TSM 与银行系统互联接口规范 
1 范围 
本规范主要适用于以标准实体银行卡申请移动设备卡的空中发卡业务，且申请加载的设备卡暂不支
持电子现金业务。 
本规范主要描述了银行接入到银联TSM系统所需符合的报文结构与互联接口。 
2 规范性引用文件 
下列文件对于本文件的应用是必不可少的。凡是注日期的引用文件，仅所注日期的版本适用于本文
件。凡是不注日期的引用文件，其最新版本（包括所有的修改单）适用于本文件。 
Q/CUP 002-2012 银联卡发卡行标识代码及卡号 
Q/CUP 003-2012 中国银联入网机构标识码编码规范 
Q/CUP 037.3.2—2015 中国银联移动支付技术规范 第3卷第2部分 用于可信服务管理平台的UICS
应用个人化规范 
3 术语和定义 
3.1  
    移动支付 Mobile Payment 
允许用户使用移动终端对所消费的商品或服务进行账务支付的一种服务方式，主要分为近场支付和
远程支付两种。[JR/T 0088.1-2012，定义2.2.4] 
3.2  
    移动移动设备卡 
指在空中发卡业务中对应于用户所持有的标准银行卡在移动终端中使用的一种银行卡统称。设备卡
与对应的实体银行卡关联至同一个银行后台账户。移动设备卡主账号应与实体银行卡不同。设备卡只能
在所加载的移动终端上使用。移动设备卡可基于标记化技术实现。 
4 缩略语 
下列缩略语适用于本文件，如表1所示。 
表1 缩略语说明 
Standard Primary Account Number 
sPan 
标准银行卡主账号 
中国银联 
版权所有

---
**[p6]**

Q/CUP 037.5.1—2015 
 
2 
 
Standard Primary Account Number Identifier sPanId 
标准银行卡主账号标识 
Mobile Primary Account Number 
mPan 
移动设备卡主账号 
Mobile Primary Account Number Identifier 
mPanId 
移动设备卡主账号标识 
One Time Password 
OTP 
一次性验证码 
Tokenization Service Provider 
TSP 
标记化服务提供商 
5 银联TSM 系统与银行系统之间的互联接口 
5.1 报文结构 
5.1.1 结构说明 
中国银联TSM与银行接口报文由两部分组成，包括报文头，报文体。接口采用Web Service方式。 
报文编码格式采用UTF-8。 
报文开发设计应遵循报文接口中数据元素的排列顺序。 
5.1.2 报文头 
报文头由一些公用元素组成，用于标识一笔交易的基本信息，如识别报文请求方和报文接收方；并
为系统维护人员提供收发报文消息的日志跟踪。 
报文头结构如下表所示： 
表2 报文头结构 
属性 
描述 
interfaceVersion 
接口版本号 
transTimeSource 
发起方交易时间 
transTimeDestination 
接收方交易时间 
transNoSource 
交易发起方流水号 
transNoDestination 
交易接收方流水号 
transType 
交易类型 
Source 
报文请求方，可选 
中国银联 
版权所有

---
**[p7]**

Q/CUP 037.5.1—2015 
 
3 
 
Destination 
报文接收方，可选 
 
5.1.3 报文体 
报文体包含了报文消息的核心内容。具体内容见5.3 报文接口中的定义。 
5.2 数据元素 
5.2.1 接口版本号- interfaceVersion 
5.2.1.1 元素说明 
 
 
<xs:element name="interfaceVersion"> 
 
 
 
<xs:simpleType> 
 
 
 
 
<xs:restriction base="xs:String"> 
 
 
 
 
 
<xs:length value="8"/> 
 
 
 
 
</xs:restriction> 
 
 
 
</xs:simpleType> 
 
 
</xs:element> 
5.2.1.2 使用说明 
使用说明如下表所示： 
位置 
属性 
用法说明 
第1-2位 
String 
版本号前两位，表示平台版本 
3 
String 
字符”.” 
4-5 
String 
版本号中间两位，表示某平台版本中涉及到报文接
口新增或删减等变动的版本 
6 
String 
字符”.” 
7-8 
String 
版本号后两位 
不涉及到报文接口新增或删减，仅涉及到报文接口
内部数据元素的变动的版本 
 
5.2.2 发起方交易时间 - transTimeSource 
5.2.2.1 元素说明 
<xs:element name="transTimeSource"> 
 
<xs:simpleType> 
中国银联 
版权所有

---
**[p8]**

Q/CUP 037.5.1—2015 
 
4 
 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:length value="14"/> 
 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.2.2 使用说明 
数据结构说明为“YYYYMMDDHHMMSS”，如下表所示： 
类型名称 
描述 
YYYY 
年份 
MM 
月份 
DD 
日 
HH 
小时，24小时制 
MM 
分钟 
SS 
秒 
由发起报文的请求方生成。 
5.2.3 接收方交易时间 - transTimeDestination 
5.2.3.1 元素说明 
<xs:element name="transTimeDestination"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:length value="14"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.3.2 使用说明 
使用说明同5.2.2.2 。 
在请求报文中可选填写。 
中国银联 
版权所有

---
**[p9]**

Q/CUP 037.5.1—2015 
 
5 
 
在响应报文中应按照请求报文中的发起方交易时间填写。 
5.2.4 交易发起方流水号- transNoSource 
5.2.4.1 元素说明 
<xs:element name="transNoSource"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="26"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.4.2 使用说明 
银联TSM发起交易：目前使用6位长度的交易流水号。 
由发起报文的请求方生成。 
5.2.5 交易接收方流水号- transNoDestination 
5.2.5.1 元素说明 
 
<xs:element name="transNoDestination"> 
 
 
<xs:simpleType> 
 
 
 
<xs:restriction base="xs:String"> 
 
 
 
 
<xs:maxlength value="26"/> 
 
 
 
</xs:restriction> 
 
 
</xs:simpleType> 
 
</xs:element> 
5.2.5.2 使用说明 
银联TSM发起交易：目前使用6位长度的交易流水号。 
在请求报文中可选填写。 
在响应报文中应按照请求报文中的交易发起方流水号填写。 
5.2.6 交易类型- transType 
5.2.6.1 元素说明 
<xs:element name="transType"> 
中国银联 
版权所有

---
**[p10]**

Q/CUP 037.5.1—2015 
 
6 
 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:length value="4"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.6.2 使用说明 
目前银联TSM系统支持的交易类型见下表： 
交易类型 
报文接口 
2001 
移动设备卡卡申请 
1002 
映射关系状态通知 
1003 
触发动态验证请求 
1004 
验证动态信息请求 
1005 
映射关系查询请求 
1006 
移动设备卡映射关系状态变更通知（银行发起） 
1007 
移动设备卡映射关系状态变更通知（银联发起） 
1009 
操作执行结果通知 
1010 
免密限额更改通知 
1011 
黑名单报送（银行发起） 
1012 
黑名单报送（银联发起） 
1013 
移动设备卡卡面更新 
1014 
移动设备卡申请异常通知 
1015 
交易结果通知 
1016 
交易信息通知 
 
5.2.7 报文请求方 - source 
5.2.7.1 元素说明 
<xs:element name=" source"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:length value="10"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
中国银联 
版权所有

---
**[p11]**

Q/CUP 037.5.1—2015 
 
7 
 
</xs:element> 
5.2.7.2 使用说明 
可选填写，填写规则应符合JR/T 0088.2-2012的要求。 
对于金融行业，前两位取值00，后8位取值应符合Q/CUP 003-2012关于入网机构标识码的取值。 
5.2.8 报文接收方 - destination 
5.2.8.1 元素说明 
<xs:element name=" destination"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:length value="10"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.8.2 使用说明 
可选填写，填写规则应符合JR/T 0088.2-2012的要求。 
对于金融行业，前两位取值00，后8位取值应符合Q/CUP 003-2012关于入网机构标识码的取值。 
5.2.9 任务标识号- taskIdType  
5.2.9.1 元素说明 
<xs:element name=" taskIdType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="64"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.9.2 使用说明 
主要用于异步处理操作中，比如移动设备卡面更新或者移动设备卡删除等。由银联系统进行分配，
发卡行可依据TaskID关联处理操作请求与处理操作结果。 
5.2.10 应答码 – statusType 
中国银联 
版权所有

---
**[p12]**

Q/CUP 037.5.1—2015 
 
8 
 
5.2.10.1 元素说明 
<xs:complexType name="statusType"> 
 
<xs:sequence> 
 
 
<xs:element name="statusCode"> 
 
 
 
<xs:simpleType> 
 
 
 
 
<xs:restriction base="xs:String"> 
 
 
 
 
 
<xs:length value=”4”/> 
 
 
 
 
</xs:restriction> 
 
 
 
</xs;simpleType> 
 
 
</xs:element> 
 
 
<xs:element name="statusDescription"> 
 
 
 
<xs:simpleType> 
 
 
 
 
</xs:restriction base="xs:String"> 
 
 
 
 
 
<xs:maxlength value=”200”/> 
 
 
 
 
</xs:restriction> 
 
 
 
</xs:simpleType> 
 
 
</xs:element> 
 
</xs:sequence> 
</xs:complexType> 
5.2.10.2 使用说明 
用法见附录A。 
5.2.11 安全载体标识- seIdType 
5.2.11.1 元素说明 
<xs:element name="seIdType"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:hexBinary"> 
 
 
 
<xs:maxLength value="64"/> 
 
 
</xs:restriction> 
中国银联 
版权所有

---
**[p13]**

Q/CUP 037.5.1—2015 
 
9 
 
 
</xs:simpleType> 
</xs:element> 
5.2.11.2 使用说明 
根据项目，SEID有不同编码规则，宜采用符合Q/CUP 037.1.3—2013所定义的编码规则。 
5.2.12 安全芯片载体类型 — seTypeType 
5.2.12.1 元素说明 
<xs:element name=” seTypeType “> 
 
<xs:simpleType> 
 
 
<xs:restriction base=”xs:String”> 
 
 
 
<xs:length value="8"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.12.2 使用说明 
用于表示申请移动设备卡的安全芯片载体类型，具体取值见Q/CUP 037.3.2 中TAG 9F63的“卡片数
据元取值”第11字节“产品细类标识”中“基于SE的移动设备卡”（第10字节：0x80）的定义。 
5.2.13 载体发行方 — seIssuerType 
5.2.13.1 元素说明 
<xs:element name=” seIssuerType “> 
 
<xs:simpleType> 
 
 
<xs:restriction base=”xs:String”> 
 
 
 
<xs:maxlength value="16"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.13.2 使用说明 
用于表示申请设备卡的载体发行方，具体取值符合银联业务部门为不同载体发行方分配的代码。 
目前仅使用一字节，具体取值见Q/CUP 037.3.2 中TAG 9F63的“卡片数据元取值”第12字节中关于” 
载体发行方定义”的定义。 
中国银联 
版权所有

---
**[p14]**

Q/CUP 037.5.1—2015 
 
10 
 
5.2.14 应用AID  - appAidType 
5.2.14.1 元素说明 
<xs:element name="appAidType"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:hexBinary"> 
 
 
 
<xs:length value="16"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.14.2 使用说明 
前8个字节应符合下述要求： 
应用提供者标识符（RID） 
专有标识符 
应用类型标识符 
5个字节 
1个字节 
2个字节 
参照JR/T 0025-2013定义，取值如下： 
A0 00 00 03 33 01 01 01 借记 
A0 00 00 03 33 01 01 02 贷记 
5.2.15 手机号码- msisdnType 
5.2.15.1 元素说明 
<xs:element name="msisdnType"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxLength value="15"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.15.2 使用说明 
无。 
5.2.16 持卡人姓名 – cardHolderNameType 
5.2.16.1 元素说明 
中国银联 
版权所有

---
**[p15]**

Q/CUP 037.5.1—2015 
 
11 
 
<xs:element name=" cardHolderNameType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxLength value="32"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.16.2 使用说明 
无。 
5.2.17 持卡人证件类型- cardHolderIdTypeType 
5.2.17.1 元素说明 
<xs:element name=" cardHolderIdTypeType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:string"> 
 
 
 
<xs:length value="2"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.17.2 使用说明 
取值 
证件类型 
01 
身份证 
02 
军官证 
03 
护照 
04 
回乡证 
05 
台胞证 
06 
警官证 
07 
士兵证 
99 
其它证件 
5.2.18 持卡人证件号码- cardHolderIdNoType 
5.2.18.1 元素说明 
中国银联 
版权所有

---
**[p16]**

Q/CUP 037.5.1—2015 
 
12 
 
<xs:element name=" cardHolderIdNoType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:string"> 
 
 
 
<xs:maxLength value="20"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.18.2 使用说明 
最长20位。 
5.2.19 主账户 – panType 
5.2.19.1 元素说明 
<xs:element name="panType"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxLength value="19"/> 
 
 
 
<xs:minLength value="13"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.19.2 使用说明 
应符合Q/CUP 002-2006的规定。 
5.2.20 持卡人信息- cardHolderInfoType 
5.2.20.1 元素说明 
<xs:complexType name="cardHolderInfoType "> 
<xs:sequence> 
 
<xs:element name=” cardHolderName” type=” cardHolderNameType” minOccurs="0" /> 
 
<xs:element name=” cardHolderIdType ” type=” cardHolderIdTypeType” minOccurs="0" /> 
 
<xs:element name=” cardHolderIdNo” type=” cardHolderIdNoType” minOccurs="0" /> 
中国银联 
版权所有

---
**[p17]**

Q/CUP 037.5.1—2015 
 
13 
 
 
<xs:element name=” msisdn” type=” msisdnType” minOccurs="0" /> 
</xs:sequence> 
</xs:complexType> 
5.2.20.2 使用说明 
参数名 
参数类型 
M/O/C 
描述说明 
cardHolderName 
cardHolderNameType 
O 
持卡人姓名 
cardHolderIdType 
cardHolderIdTypeType 
O 
证件类型 
cardHolderIdNo  
cardHolderIdNoType 
O 
证件号码 
msisdn 
msisdnType 
O 
手机号 
注：不同的TSM项目中，可根据发卡行的配置要求，客户端申请界面上要求用户输入相应的身份认证要素。 
5.2.21 主账户标识 – panIdType 
<xs:element name="panIdType"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxLength value="64"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.22 联机密码 – pinType 
5.2.22.1 元素说明 
<xs:element name="pinType"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:length value="8"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
中国银联 
版权所有

---
**[p18]**

Q/CUP 037.5.1—2015 
 
14 
 
5.2.22.2 使用说明 
无。 
5.2.23 有效期 – expiryDateType 
5.2.23.1 元素说明 
<xs:element name="expiryDateType"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:length value="4"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.23.2 使用说明 
按照月年填写。 
5.2.24 安全码 – cvn2Type 
5.2.24.1 元素说明 
<xs:element name="cvn2Type"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:length value="3"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.24.2 使用说明 
无。 
5.2.25 账户信息 – accountInfoType 
5.2.25.1 元素说明 
<xs:complexType name=" accountInfoType "> 
 
<xs:sequence> 
中国银联 
版权所有

---
**[p19]**

Q/CUP 037.5.1—2015 
 
15 
 
 
 
<xs:element name="pan" type=”panType”/> 
 
 
<xs:element name="expiryDate" type=”expiryDateType” minOccurs="0"/> 
 
 
<xs:element name=”cvn2” type=”cvn2Type” minOccurs="0"/> 
 
 
<xs:element name="pin" type=”pinType” minOccurs="0" /> 
 
</xs:sequence> 
</xs:complexType> 
5.2.25.1.1 使用说明 
参数名 
参数类型 
M/O/C 
描述说明 
pan 
panType 
M 
账号 
expiryDate 
expiryDateType 
O 
有效期，按照MMYY填写 
cvn2 
cvn2Type 
O 
CVN2 
pin 
pinType 
O 
密码 
注：不同的TSM项目中，可根据发卡行的配置要求以及卡片的支持能力，客户端申请界面上要求用户输入相应的账
户认证要素。 
5.2.26 电子现金余额 – ecashBalanceType 
5.2.26.1 元素说明 
<xs:simpleType name="ecashBalanceType"> 
<xs:restriction base="xs:string"> 
 
<xs:maxLength value="12"/> 
</xs:restriction> 
</xs:simpleType> 
5.2.26.2 使用说明 
参数名 
参数类型 
长度 
描述说明 
ecashBalanceType 
string 
最大12 电子现金余额。 
本元素中取值不带小数点。当币种为人
民币时，本元素的最右两位表示人民币
的角和分。 
 
中国银联 
版权所有

---
**[p20]**

Q/CUP 037.5.1—2015 
 
16 
 
5.2.27 一次性验证码– otpValueType 
5.2.27.1 元素说明 
<xs:element name="otpValueType"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="8"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.27.2 使用说明 
无。 
5.2.28 OTP 方法类型- otpTypeType 
5.2.28.1 元素说明 
<xs:element name=" otpTypeType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="32"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.28.2 使用方法 
取值 
描述 
cellPhone  
手机动态验证 
email  
电子邮件动态验证 
customerService 
客户服务 
bankApp 
银行客户端 
5.2.29 OTP 方法取值- otpResolutionValueType 
5.2.29.1 元素说明 
<xs:element name=" otpResolutionValueType "> 
中国银联 
版权所有

---
**[p21]**

Q/CUP 037.5.1—2015 
 
17 
 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="64"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.29.2 使用方法 
每种OTP方法跟用户对应的具体取值，对于手机动态验证，即为用户用于接收动态验证的手机号码；
对于电子邮件动态验证，即为用户用于接收动态验证的电子邮件地址；对于客户服务，即为银行客服电
话；对于银行客户端，即为客户端地址。 
5.2.30 OTP 方法标识- otpResolutionIdType 
5.2.30.1 元素说明 
<xs:element name=" otpResolutionIdType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="32"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.30.2 使用方法 
银行后台为每种OTP方法生成的标识号，后续可根据标识号来确认用户选中的OTP验证方法。 
5.2.31 OTP 发送源– otpSourceAddressType 
<xs:element name=" otpSourceAddressType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="64"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
中国银联 
版权所有

---
**[p22]**

Q/CUP 037.5.1—2015 
 
18 
 
</xs:element> 
5.2.32 OTP 发送方法-otpResolutionType 
5.2.32.1 元素说明 
<xs:complexType name="otpResolutionType"> 
<xs:sequence> 
 
 
<xs:element name="otpType" type=”otpTypeType”/> 
 
 
<xs:element name=”otpResolutionValue” type=”otpResolutionValueType”/> 
 
 
<xs:element name="otpResolutionId" type=”otpResolutionIdType”/> 
<xs:element name="otpSourceAddress" type=” otpSourceAddressType”/> 
 
</xs:sequence> 
</xs:complexType> 
5.2.32.2 使用说明 
参数名 
参数类型 
M/O/C 
描述说明 
otpType 
otpTypeType 
M 
OTP类型，目前支持手机动态验
证||电子邮件动态验证||客户
服务||银行客户端等四种方式 
otpResolutionValue otpResolutionValueType 
M 
每种OTP方法具体对应到用户的
具体取值：对于手机动态验证，
即为用户用于接收动态验证的
手机号码；对于电子邮件动态验
证，即为用户用于接收动态验证
的电子邮件地址；对于客户服
务，即为银行客服电话；对于银
行客户端，即为客户端地址； 
otpResolutionId 
otpResolutionIdType 
M 
每种OTP方法所对应的标识号，
由银行生成； 
otpSourceAddress 
otpSourceAddressType 
O 
银行发送OTP的源地址，如银行
提供该字段，则默认支持手机设
备自动截取OTP并填写； 
5.2.33 OTP 发送方法列表-otpResolutionListType 
5.2.33.1 元素说明 
中国银联 
版权所有

---
**[p23]**

Q/CUP 037.5.1—2015 
 
19 
 
<xs:complexType name=" otpResolutionListType "> 
<xs:sequence> 
 
 
 
<xs:element name="otpResolution" type=”otpResolutionType” minOccurs=”0” 
maxOccurs=”10”/> 
</xs:sequence> 
</xs:complexType> 
5.2.34 限额 – quotaType 
5.2.34.1 元素说明 
<xs:element name="quotaType"> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="12"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.34.2 使用说明 
参数名 
M/O/C 
类型 
长度 
描述说明 
quotaType 
M 
String 
最大12位 
免密交易限额。 
本元素中取值不带小数
点。当币种为人民币时，
本元素的最右两位表示
人民币的角和分。 
5.2.35 映射关系状态 – mappingStatusType 
5.2.35.1 元素说明 
<xs:element name=” mappingStatusType “> 
 
<xs:simpleType> 
 
 
 
<xs:restriction base=”xs:String”> 
 
 
 
<xs:enumeration value=”00”/> 
中国银联 
版权所有

---
**[p24]**

Q/CUP 037.5.1—2015 
 
20 
 
 
 
 
<xs:enumeration value=”01”/> 
 
 
 
<xs:enumeration value=”02”/> 
 
 
 
<xs:enumeration value=”03”/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
 
</xs:element> 
5.2.35.2 使用说明 
取值 
描述 
00 
初始状态 
01 
关联状态 
02 
锁定状态 
03 
注销状态 
5.2.36 映射关系信息 – mappingInfoType 
5.2.36.1 元素说明 
<xs:complexType name="mappingInfoType"> 
 
<xs:sequence> 
 
 
<xs:element name=” span” type=”panType”/> 
 
 
<xs:element name=” spanId” type=”panIdType”/> 
<xs:element name=” mpan” type=”panType”/> 
 
 
<xs:element name=” mpanId” type=”panIdType”/> 
<xs:element name=” mstpan” type=”panType”/> 
 
 
<xs:element name=” mstpanId” type=”panIdType”/> 
<xs:element name=” seId” type=”seIdType”/> 
<xs:element name=” mappingStatus” type=”mappingStatusType”/> 
 
</xs:sequence> 
</xs:complexType> 
5.2.36.2 使用说明 
参数名 
参数类型 
M/O/C 
描述说明 
span 
panType 
M 
用户用于移动设备加申请的标
中国银联 
版权所有

---
**[p25]**

Q/CUP 037.5.1—2015 
 
21 
 
准卡主账号 
spanId 
panIdType 
M 
用户标准卡主账号对应的标识
符 
mpan 
panType 
M 
用户成功加载的移动设备卡主
账号 
mpanId 
panIdType 
M 
用户移动设备卡主账号对应的
标识符 
mstpan 
panType 
O 
用户成功加载的移动MST设备
卡主账号 
mstpanId 
panIdType 
O 
用户移动MST设备卡主账号对
应的标识符 
seId 
seIdType 
M 
安全芯片标识符 
mappingStatus 
mappingStatusType 
M 
映射关系状态 
5.2.37 Application 标识符 – applicationIdType 
5.2.37.1 元素说明 
<xs:element name=" applicationIdType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="128"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.37.2 使用说明 
关于Application Identifier的具体用法，请见Apple公司相关文档。 
5.2.38  Application 标识符列表 – applicationIdListType 
5.2.38.1.1 元素说明 
<xs:complexType name="applicationIdListType"> 
中国银联 
版权所有

---
**[p26]**

Q/CUP 037.5.1—2015 
 
22 
 
<xs:sequence> 
<xs:element name="applicationId" type=”applicationIdType” minOccurs=”0” 
maxOccurs=”15”/> 
</xs:sequence> 
</xs:complexType> 
5.2.38.1.2 使用说明 
无。 
5.2.39 storeIdentifier – storeIdentifierType 
5.2.39.1 元素说明 
<xs:element name=" storeIdentifierType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="128"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.39.2 使用说明 
关于Store Identifier（又称为Adam ID）的具体用法，请见Apple公司相关文档。。 
5.2.40 storeIdentifier 列表 - storeIdentifierListType 
5.2.40.1.1 元素说明 
<xs:complexType name=" storeIdentifierListType "> 
<xs:sequence> 
<xs:element name="storeIdentifier" type=”storeIdentifierType” minOccurs=”0” 
maxOccurs=”15”/> 
</xs:sequence> 
</xs:complexType> 
5.2.40.1.2 使用说明 
无。 
中国银联 
版权所有

---
**[p27]**

Q/CUP 037.5.1—2015 
 
23 
 
5.2.41 操作结果 – operationResultType 
5.2.41.1 元素说明 
<xs:element name=” operationResultType “> 
<xs:simpleType> 
 
 
<xs:restriction base=”xs:String”> 
 
 
<xs:enumeration value=”00”/> 
 
 
<xs:enumeration value=”01”/>  
 
 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.41.2 使用说明 
取值 
含义 
00 
成功 
01 
失败 
5.2.42 变更操作原因-operationReasonType 
5.2.42.1 元素说明 
<xs:element name=" operationReasonType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="256"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.42.2 使用说明 
发起移动设备状态变更操作时，用于标明具体的变更操作原因。 
5.2.43 申请处理结果 – applyProcessResultType 
5.2.43.1 元素说明 
<xs:element name=” applyProcessResultType “> 
中国银联 
版权所有

---
**[p28]**

Q/CUP 037.5.1—2015 
 
24 
 
 
<xs:simpleType> 
 
 
 
<xs:restriction base=”xs:String”> 
 
 
 
<xs:enumeration value=”01”/> 
<xs:enumeration value=”10”/> 
 
 
 
<xs:enumeration value=”11”/>  
 
 
 
<xs:enumeration value=”12”/>  
 
 
 
<xs:enumeration value=”13”/>  
<xs:enumeration value=”20”/> 
 
 
 
<xs:enumeration value=”21”/>  
 
 
 
<xs:enumeration value=”22”/>  
 
 
 
<xs:enumeration value=”23”/>  
 
 
 
<xs:enumeration value=”24”/>  
 
 
 
<xs:enumeration value=”25”/>  
 
 
</xs:restriction> 
 
</xs:simpleType> 
 
</xs:element> 
5.2.43.2 使用说明 
取值 
含义 
备注 
01 
成功（但银行提供的CartArtID不满足使用条件，使用
默认配置卡面） 
使用默认配置卡面构成
了完整的卡面信息，设
备卡加载成功 
 
10  
申请失败（因银联判断用户重复申请） 
 
11 
申请失败（因用户申请信息中的CVN2信息不符合要求）  
12 
申请失败（因银联TSM对EN-OTP校验失败） 
EN-OTP 目前仅用于
Apple Pay项目 
13 
申请失败（因银联风控原因拒绝） 
 
 
20  
映射关系建立失败（因设备端个人化数据加载失败） 
不用于基于标记化技术
实现且银联做TSP的实
现方案中；  
21 
映射关系建立失败（因银行返回个人化数据超时） 
不用于基于标记化技术
实现且银联做TSP的实
中国银联 
版权所有

---
**[p29]**

Q/CUP 037.5.1—2015 
 
25 
 
现方案中； 
22 
映射关系建立失败（因银行返回个人化数据解析失败） 不用于基于标记化技术
实现且银联做TSP的实
现方案中； 
23  
映射关系建立失败（因银行返回的移动设备卡主账号已
被使用） 
不用于基于标记化技术
实现且银联做TSP的实
现方案中； 
24  
映射关系建立失败（因银行返回的cardArtId找不到对
应配置卡面，且银行未在银联配置默认卡面的情况下） 
此时因无法构建完成卡
面信息，导致设备卡加
载失败； 
25  
映射关系建立失败（因银行响应报文解析出错） 
比如某元素格式不符合
要求等； 
26 
PBOC设备卡申请成功，但银联TSM申请MST Token失败 
仅用于Samsung Pay 的
MST方案 
注：对于申请失败、映射关系建立失败的场景，发卡行后台系统应进行回退处理，允许用户使用同一张卡在同一台
设备上再次发起移动设备卡申请。 
5.2.44 申请渠道类型 – applyChannelType  
5.2.44.1 元素说明 
<xs:simpleType name=” applyChannelType “> 
 
<xs:restriction base=”xs:String”> 
 
 
 
<xs:enumeration value=”00”/> 
 
 
 
<xs:enumeration value=”01”/> 
<xs:enumeration value=”02”/> 
<xs:enumeration value=”03”/> 
 
</xs:restriction> 
</xs:simpleType> 
5.2.44.2 使用说明 
用户移动设备卡申请渠道类型定义如下表所示： 
取值 
说明 
备注 
00 
银行自有渠道 
如银行柜面、手机银行等 
01 
全手机厂商渠道 
如Passbook、三星Wallet等 
02 
银联渠道 
如银联钱包等； 
04 
第三方渠道 
如微信等； 
5.2.45 操作渠道标识 – operationChannelIdType  
5.2.45.1 元素说明 
中国银联 
版权所有

---
**[p30]**

Q/CUP 037.5.1—2015 
 
26 
 
<xs:simpleType name=” operationChannelIdType “> 
 
<xs:restriction base=”xs:string”> 
 
 
 
<xs:enumeration value=”00”/> 
 
 
 
<xs:enumeration value=”01”/> 
<xs:enumeration value=”02”/> 
<xs:enumeration value=”03”/> 
 
</xs:restriction> 
</xs:simpleType> 
5.2.45.2 使用说明 
取值 
说明 
00 
发卡行 
01 
载体发行方 
02 
银联 
03 
第三方服务提供商 
5.2.46 协议和条款ID – termAndConditionIdType 
<xs:element name=" termAndConditionIdType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="64"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.47 协议和条款签署日期 – termAndConditionAcceptedDateType 
<xs:element name=" termAndConditionAcceptedDateType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="32"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
中国银联 
版权所有

---
**[p31]**

Q/CUP 037.5.1—2015 
 
27 
 
</xs:element> 
5.2.48 协议和条款信息 – termAndConditionInfoType 
5.2.48.1 元素说明 
<xs:complexType name=" termAndConditionInfoType "> 
<xs:sequence> 
 
<xs:element name=” termAndConditionId” type=” termAndConditionIdType”/> 
 
<xs:element name=” termAndConditionAcceptedDate”  type=” 
termAndConditionAcceptedDateType”/> 
</xs:sequence> 
</xs:complexType> 
5.2.48.2 使用说明 
参数名 
参数类型 
M/O/C 
描述说明 
termAndConditionId 
termAndConditionIdType 
M 
协议和条款对应的ID 
termAndConditionAccepted
Date 
termAndConditionAcceptedDateType M 
用户接受协议和条款的日
期和具体时间 
5.2.49 银行自定义数据块 – bankDefinedDataType 
5.2.49.1 元素说明 
<xs:simpleType name=" bankDefinedDataType"> 
<xs:restriction base="xs:String"> 
 
<xs:minLength value="8"/> 
 
<xs:maxLength value="1024"/> 
</xs:restriction> 
</xs:simpleType> 
5.2.49.2 使用说明 
具体内容由银行自定义。银联系统中只负责透传。 
5.2.50 卡面配置方案ID – cardArtIdType 
5.2.50.1 元素说明 
中国银联 
版权所有

---
**[p32]**

Q/CUP 037.5.1—2015 
 
28 
 
<xs:element name=" cardArtIdType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="40"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.51 卡面信息 –cardMetaDataType 
5.2.51.1 元素说明 
<xs:complexType name=" cardMetaDataType"> 
<xs:sequence> 
 
<xs:element name="cardArtId" type=” cardArtIdType”/> 
<xs:element name=”cardholderName” type=” cardHolderNameType” minOccurs="0"/> 
 
<xs:element name="expiryDate" type=”expiryDateType”/> 
<xs:element name="storeIdentifierList " type=” storeIdentifierListType” minOccurs="0"/> 
<xs:element name="applicationIdList " type=” applicationIdListType” minOccurs="0"/> 
</xs:sequence> 
</xs:complexType> 
5.2.51.2 使用说明 
参数名 
参数类型 
M/O/C 
描述说明 
cardArtId 
cardArtIdType 
M 
卡面配置方案ID 
cardHolderName 
cardHolderNameType 
O 
持卡人姓名拼音 
expiryDate 
expiryDateType 
M 
有效期，按照MMYY填写 
storeIdentifierList 
storeIdentifierListType 
O 
银行返回的Bank App应
用商店标识符； 
银行可选返回，仅用于
Apple Pay项目； 
中国银联 
版权所有

---
**[p33]**

Q/CUP 037.5.1—2015 
 
29 
 
applicationIdList 
applicationIdListType 
C 
该卡对应的
Application ID列表； 
银行可选返回，仅用于
Apple Pay项目，当用户
使用苹果设备申请并验
证通过时必须出现； 
 
5.2.52 CASD 证书信息-casdCertInfoType 
5.2.52.1 元素说明 
<xs:element name=" casdCertInfoType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="512"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.52.2 使用说明 
目前主要用于Apple Pay项目，表示每个SEID对应的SE中CASD证书信息。 
在用户使用Apple设备进行申请时，银行可通过前端客户端读取到SE中CASD证书信息，用于前后台
的匹配，以确定用户当前操作的手机所对应的SE信息。 
5.2.53 Message Authentication Code – macType 
5.2.53.1 元素说明 
<xs:simpleType name=”macType”> 
<xs:restriction base=”xs:hexBinary”> 
 
<xs:length value=”8”/> 
</xs:restriction> 
</xs:simpleType> 
5.2.54 账单地址 - billingAddressType 
5.2.54.1 元素说明 
中国银联 
版权所有

---
**[p34]**

Q/CUP 037.5.1—2015 
 
30 
 
<xs:element name=" billingAddressType "> 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="256"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.54.2 使用说明 
用户账单地址信息； 
5.2.55 账单邮编 - billingZipType 
5.2.55.1 元素说明 
<xs:element name=" billingZipType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="16"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.55.2 使用说明 
用户账单邮编信息； 
5.2.56 账户标识哈希 – accountIdHashType 
5.2.56.1 元素说明 
<xs:element name=" accountIdHashType "> 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="64"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
中国银联 
版权所有

---
**[p35]**

Q/CUP 037.5.1—2015 
 
31 
 
</xs:element> 
5.2.56.2 使用说明 
用来标识用户在全手机厂商的登录账号ID信息的哈希值，与用户登录账号ID是一一对应关系。 
目前仅用于Apple Pay项目。 
5.2.57 设备类型 - deviceTypeType 
5.2.57.1 元素说明 
<xs:element name=" deviceTypeType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="2"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.57.2 使用说明 
设备厂商自己对用来做交易的设备类型所做的编码，每类设备对应一个整数值，取值范围从1至99。 
目前仅在Apple Pay项目中出现。 
5.2.58 设备位置 – deviceLocationType 
5.2.58.1 元素说明 
<xs:element name=" deviceLocationType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="9"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.58.2 使用说明 
用来做设备卡加载时的用户设备位置信息，按照“纬度/经度”格式填写。 
5.2.59 设备号码 - deviceNumberType 
中国银联 
版权所有

---
**[p36]**

Q/CUP 037.5.1—2015 
 
32 
 
5.2.59.1 元素说明 
<xs:element name=" deviceNumberType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="4"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.59.2 使用说明 
用来做设备卡加载时用户设备所对应的手机号码后四位数字。 
5.2.60 设备别名 – deviceNameType 
5.2.60.1 元素说明 
<xs:element name=" deviceNameType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="100"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.60.2 使用说明 
用户给设备所添加的设备别名，比如“**的iphone”。 
5.2.61 加载流程颜色 – colorType 
5.2.61.1 元素说明 
<xs:element name=" colorType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="8"/> 
 
</xs:restriction> 
中国银联 
版权所有

---
**[p37]**

Q/CUP 037.5.1—2015 
 
33 
 
</xs:simpleType> 
</xs:element> 
5.2.61.2 使用说明 
设备厂商建议的加载流程对应颜色级别。 
目前仅用于Apple Pay项目。 
5.2.62 流程颜色判断版本 – colorStandardVersionType 
5.2.62.1 元素说明 
<xs:element name=" colorStandardVersionType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="8"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.62.2 使用说明 
设备厂商给出加载流程颜色建议时所基于的颜色判断原则对应的版本。 
目前仅用于Apple Pay项目，取值从“0001.00”开始。 
5.2.63 设备评分 – deviceScoreType 
5.2.63.1 元素说明 
<xs:element name=" deviceScoreType "> 
<xs:simpleType> 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="1"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.63.2 使用说明 
设备厂商给设备的评分，取值从1到5。分值越高，代表该设备的可信度越高。 
中国银联 
版权所有

---
**[p38]**

Q/CUP 037.5.1—2015 
 
34 
 
5.2.64 账户评分 – accountScoreType 
5.2.64.1 元素说明 
<xs:element name=" accountScoreType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="1"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.64.2 使用说明 
设备厂商给用户账户的评分，取值从1到5。分值越高，代表该设备的可信度越高。 
5.2.65 流程颜色判断原因 – colorReasonCodeType 
5.2.65.1 元素说明 
<xs:element name=" colorReasonCodeType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="30"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.65.2 使用说明 
设备厂商给出的颜色判断原因，只在建议选择黄色流程的时候才出现，解释为什么要建议选择黄色
流程。 
目前仅用于Apple Pay项目。 
5.2.66 源IP – sourceIpType 
5.2.66.1 元素说明 
<xs:element name=" sourceIpType "> 
<xs:simpleType> 
中国银联 
版权所有

---
**[p39]**

Q/CUP 037.5.1—2015 
 
35 
 
 
<xs:restriction base="xs:String"> 
 
 
<xs:maxlength value="15"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.66.2 使用说明 
设备厂商提供的一个信息，用于合规性检查。 
5.2.67 加载风险信息数据 – riskInfoType 
5.2.67.1 元素说明 
<xs:complexType name=" riskInfoType "> 
 
<xs:sequence> 
 
 
<xs:element name=”accountScore” type=” accountScoreType” minOccurs="0"/> 
 
 
<xs:element name=”deviceScore” type=” deviceScoreType” minOccurs="0"/> 
 
 
<xs:element name=”sourceIp”  type=” sourceIpType” minOccurs="0"/> 
<xs:element name=”color” type=” colorType” minOccurs="0"/>  
 
 
<xs:element name=”reasonCodes”  type=” colorReasonCodeType” minOccurs="0"/> 
<xs:element name=”deviceType” type=” deviceTypeType” minOccurs="0"/> 
 
 
<xs:element name=”deviceName”  type=” deviceNameType” minOccurs="0"/> 
 
 
<xs:element name=”deviceNumber”  type=” deviceNumberType” minOccurs="0"/> 
<xs:element name=”accountIdHash” type=” accountIdHashType” minOccurs="0"/> 
 
 
<xs:element name=”deviceLocation”  type=” deviceLocationType” minOccurs="0"/> 
<xs:element name=”billingAddress” type=” billingAddressType” minOccurs="0"/> 
 
 
<xs:element name=”billingZip”  type=” billingZipType” minOccurs="0"/> 
<xs:element name=” colorStandardsVersion” type=” colorStandardVersionType” 
minOccurs="0"/> 
 
 
<xs:element name=” cardHolderName”  type=” cardHolderNameType” 
minOccurs="0"/> 
 
</xs: sequence > 
中国银联 
版权所有

---
**[p40]**

Q/CUP 037.5.1—2015 
 
36 
 
</xs:complexType> 
5.2.67.2 使用说明 
参数名 
参数类型 
M/O/C 
备注 
accountScore 
accountScoreType 
O 
 
deviceScore 
deviceScoreType 
O 
 
sourceIp 
sourceIpType 
O 
 
color 
colorType 
O 
 
reasonCodes 
colorReasonCodeType 
O 
 
deviceType 
deviceTypeType 
O 
 
deviceName 
deviceNameType 
O 
 
deviceNumber 
deviceNumberType 
O 
 
accountIdHash 
accountIdHashType 
O 
 
deviceLocation 
deviceLocationType 
O 
 
billingAddress 
billingAddressType 
O 
 
billingZip 
billingZipType 
O 
 
colorStandardsVersion 
colorStandardVersionType 
O 
 
cardHolderName 
cardHolderNameType 
O 
 
 
5.2.68 黑名单列表类型 – blackListCategoryType 
5.2.68.1 元素说明 
<xs:element name=” blackListCategoryType “> 
 
<xs:simpleType> 
 
 
 
<xs:restriction base=”xs:String”> 
中国银联 
版权所有

---
**[p41]**

Q/CUP 037.5.1—2015 
 
37 
 
 
 
 
<xs:enumeration value=”00”/> 
 
 
 
<xs:enumeration value=”01”/> 
 
 
 
<xs:enumeration value=”02”/> 
 
 
 
<xs:enumeration value=”03”/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
 
</xs:element> 
5.2.68.2 使用说明 
取值 
描述 
00 
SEID 
01 
手机号 
02 
实体银行卡 
03 
移动设备卡 
 
5.2.69 黑名单失效时间-blackInvalidTimeType 
<xs:element name=" blackInvalidTimeType "> 
<xs:simpleType> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:length value="14"/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.70 黑名单操作类型-blackOperationTypeType 
5.2.70.1 元素说明 
<xs:element name=” blackOperationTypeType “> 
 
<xs:simpleType> 
 
 
<xs:restriction base=”xs:String”> 
 
 
 
<xs:enumeration value=”I”/> 
 
 
 
<xs:enumeration value=”D”/> 
中国银联 
版权所有

---
**[p42]**

Q/CUP 037.5.1—2015 
 
38 
 
 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.70.2 使用说明 
取值 
描述 
I 
增加 
D 
删除 
5.2.71 PAN 类型黑名单-panBlackListType 
5.2.71.1 元素说明 
<xs:complexType name=" panBlackListType "> 
<xs:sequence> 
 
<xs:element name="pan" type=” panType”/> 
 
<xs:element name=”blackInvalidTime” type=” blackInvalidTimeType”/> 
 
<xs:element name="blackOperationType" type=” blackOperationTypeType ”/> 
</xs:sequence> 
</xs:complexType> 
5.2.71.2 使用说明 
参数名 
参数类型 
M/O/C 
描述说明 
pan 
panType 
M 
Pan号（可为sPan，也可为mPan） 
blackInvalidTime 
blackInvalidTimeType 
M 
该PAN号对应的黑名单失效时间 
blackOperationType 
blackOperationTypeType 
M 
建议的操作类型（增加或删除） 
 
5.2.72 黑名单列表 – blackListType 
5.2.72.1 元素说明 
<xs:complexType name=" blackListType "> 
<xs:choice> 
<xs:sequence> 
 
 
 
中国银联 
版权所有

---
**[p43]**

Q/CUP 037.5.1—2015 
 
39 
 
<xs:element name="span" type=”panBlackListType” minOccurs=”0” 
maxOccurs=”100”/> 
 
 
</xs:sequence> 
<xs:sequence> 
 
 
 
<xs:element name="mpan" type=”panBlackListType” minOccurs=”0” 
maxOccurs=”100”/> 
 
 
</xs:sequence> 
 
</xs:choice> 
</xs:complexType> 
5.2.72.2 使用说明 
目前只支持sPan 和mPan 的黑名单情况。 
5.2.73 密钥密文 – keyValueType 
5.2.73.1 元素说明 
<xs:simpleType name=”keyValueType”> 
<xs:restriction base=”xs:hexBinary”> 
 
<xs:maxLength value=”16”/> 
</xs:restriction> 
</xs:simpleType> 
5.2.73.2 使用说明 
无。 
5.2.74 应用提供方个人化数据 – spPersoDataType 
5.2.74.1 元素说明 
<xs:simpleType name="spPersoDataType"> 
 
<xs:restriction base="xs:String"> 
 
 
<xs:minLength value="8"/> 
 
 
<xs:maxLength value="8192"/> 
 
</xs:restriction> 
中国银联 
版权所有

---
**[p44]**

Q/CUP 037.5.1—2015 
 
40 
 
</xs:simpleType> 
5.2.74.2 使用说明 
无。 
5.2.75 移动设备卡个人化数据信息- mpanPersoDataInfoType 
5.2.75.1 元素说明 
<xs:complexType name=" mpanPersoDataInfoType "> 
 
 
 
<xs:sequence> 
 
 
 
 
<xs:element name=” mpan” type=” panType”/> 
 
 
 
 
<xs:element name=" spPersodata " type=” spPersoDataType”/> 
 
 
 
 
<xs:element name=" kekKeyValue " type=” keyValueType” minOccurs=”0”/> 
 
 
 
 
<xs:element name=" kekKeyMac " type=” macType” minOccurs=”0”/> 
 
 
 
</xs:sequence> 
 
 
</xs:complexType> 
5.2.75.2 使用说明 
参数名 
参数类型 
M/O/C 
描述说明 
mpan 
panType 
M 
银行返回的移动设备卡mPAN号 
spPersodata 
spPersoDataType 
M 
银行返回的个人化数据 
kekKeyValue 
keyValueType 
C 
如果个人化数据是动态密钥方
式加密应该出现 
kekKeyMac 
macType 
C 
如果个人化数据是动态密钥方
式加密应该出现； 
5.2.76 交易标识符 –transactionIdType 
5.2.76.1 元素说明 
<xs:element name=" transactionIdType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="32"/> 
中国银联 
版权所有

---
**[p45]**

Q/CUP 037.5.1—2015 
 
41 
 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.76.2 使用说明 
只在基于mPan的交易中出现，其生成规则为：SHA-256（mPan|ATC|Application Cryptogram）； 
如果发卡行无IC卡交易信息，可默认返回全0，由银联系统自行计算。 
5.2.77 交易类型 -transactionTypeType  
5.2.77.1 元素说明 
<xs:element name=” transactionTypeType “> 
<xs:simpleType> 
 
 
<xs:restriction base=”xs:String”> 
 
 
<xs:enumeration value=”Purchase”/> 
 
 
<xs:enumeration value=”Refund”/>  
<xs:enumeration value=”preAuthorized”/> 
<xs:enumeration value=”CashATM”/> 
<xs:enumeration value=”DepositATM”/> 
<xs:enumeration value=”TransferATM”/> 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.77.2 使用说明 
目前仅定义了Purchase、Refund、preAuthorized、CashATM、DepositATM、TransferATM六种，
分别代表购物、退货、预授权、ATM取款、ATM存款、ATM转账。 
5.2.78 交易日期 –transactionDateType 
5.2.78.1 元素说明 
<xs:element name=" transactionDateType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
中国银联 
版权所有

---
**[p46]**

Q/CUP 037.5.1—2015 
 
42 
 
 
 
 
<xs:maxlength value="32"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.78.2 使用说明 
包括交易日期和时间，格式应符合格式：YYMMDDhhmmss。其中： 
YY: 00－99 
MM：01－12 
DD：01－31 
hh：00－23 
mm：00－59 
ss：00－59 
5.2.79 货币代码 –currencyCodeType 
5.2.79.1 元素说明 
<xs:element name=" currencyCodeType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="3"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.79.2 使用说明 
符合ISO 4217的要求。 
5.2.80 交易金额 –transactionAmountType 
5.2.80.1 元素说明 
<xs:element name=" transactionAmountType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="12"/> 
 
 
</xs:restriction> 
中国银联 
版权所有

---
**[p47]**

Q/CUP 037.5.1—2015 
 
43 
 
 
</xs:simpleType> 
</xs:element> 
5.2.80.2 使用说明 
参数名 
参数类型 
长度 
描述说明 
transactionAmoun
tType 
string 
最大12 交易金额。 
本元素中取值不带小数点,最右两位表
示交易金额小数点后两位。例如，对于
人民币，最右两位分别表示角和分； 
 
5.2.81 交易状态 –transactionStatusType 
5.2.81.1 元素说明 
<xs:element name=” transactionStatusType “> 
<xs:simpleType> 
 
 
<xs:restriction base=”xs:String”> 
 
 
<xs:enumeration value=”Approved”/> 
 
 
<xs:enumeration value=”Declined”/> 
 
 
 
 
<xs:enumeration value=”Pending”/> 
 
 
<xs:enumeration value=”Refunded”/> 
 
 
 
</xs:restriction> 
</xs:simpleType> 
</xs:element> 
5.2.81.2 使用说明 
目前仅定义了Approved（交易成功）、Declined（交易被拒绝）、Pending（交易处理中）和Refunded
（已退款）四种状态。 
5.2.82 商户名称 –merchantNameType 
5.2.82.1 元素说明 
<xs:element name=" merchantNameType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
中国银联 
版权所有

---
**[p48]**

Q/CUP 037.5.1—2015 
 
44 
 
 
 
 
<xs:maxlength value="64"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.82.2 使用说明 
商户名称。 
5.2.83 原始商户名称 –rawMerchantNameType 
5.2.83.1 元素说明 
<xs:element name=" rawMerchantNameType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="64"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.83.2 使用说明 
未经处理的原始商户名称。 
5.2.84 行业分类 –industryCategoryType 
5.2.84.1 元素说明 
<xs:element name=" industryCategoryType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxlength value="32"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.84.2 使用说明 
主要用于描述商户所属于的行业范围。 
中国银联 
版权所有

---
**[p49]**

Q/CUP 037.5.1—2015 
 
45 
 
5.2.85 行业代码 –industryCodeType 
5.2.85.1 元素说明 
<xs:element name=" industryCodeType "> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:length value="4"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.85.2 使用说明 
应符合ISO 18245编码格式。 
 
5.2.86 MST 交易计数器- mstatcType 
5.2.86.1 元素说明 
<xs:element name=" mstatcType"> 
 
<xs:simpleType> 
 
 
<xs:restriction base="xs:String"> 
 
 
 
<xs:maxLength value="5"/> 
 
 
</xs:restriction> 
 
</xs:simpleType> 
</xs:element> 
5.2.86.2 使用说明 
用于表示MST交易的计数器，不同于PBOC的交易计数器。 
 
5.3 报文接口 
5.3.1 移动设备卡申请 
5.3.1.1 接口说明 
发起方：银联TSM系统； 
接收方：银行系统； 
中国银联 
版权所有

---
**[p50]**

Q/CUP 037.5.1—2015 
 
46 
 
功能：银联TSM将用户申请移动设备卡的请求转发给银行，包含申请载体和渠道类信息、持卡人验
证信息、风险辅助类信息等内容。发卡行应根据请求信息验证持卡人身份并决定是否批准此次申请，如
批准，则应在响应报文中带回与加载设备和渠道相对应的待加载卡片数据，如个人化数据、卡面数据等。 
发卡行可根据载体类型判断用户此次申请的移动设备卡待加载设备信息，如设备形态、载体发行方
等。 
发卡行可根据申请渠道信息判断用户此次申请的受理渠道，如银行自有渠道、银联客户端或者第三
方客户端软件等。 
对于经银联客户端或第三方客户端渠道发起的申请，发卡行可根据持卡人验证信息（含身份信息、
账户信息等）判断申请人的合法身份。 
对于经银行自有渠道发起的申请，发卡行可根据自有渠道验证信息确认申请人的合法身份。 
请求报文中可选存在风险辅助信息，辅助发卡行进行申请授权，如银联客户端采集的设备指纹信息
或前端设备提供的风险信息，发卡行可根据本行策略使用这些风险辅助信息。 
在某些项目中，前端设备还可提供一些其他辅助信息，如CASD证书等，发卡行可根据本行策略使用。 
5.3.1.2 请求报文——mpanApplyRequest 
参数名 
元素类型 
M/O/C 
描述说明 
seId 
seIdType 
M 
用户移动设备中安全芯片所
对应的标识符； 
seType 
seTypeType 
M 
载体类型 
seIssuer 
seIssuerType 
M 
载体发行方编码 
applyChannel 
applyChannelType 
M 
用户申请的渠道 
instanceAid 
appAidType 
O 
应用安装实例AID 
accountInfo 
accountInfoType 
M 
持卡人提供的账户信息 
cardHolderInfo 
cardHolderInfoType 
O 
持卡人提供的身份信息 
bankChannelData 
bankDefinedDataType 
C 
银行渠道自有的数据，当用
户申请的渠道为银行自有渠
道时必须出现； 
termAndConditionInfo 
termAndConditionInfoType 
O 
用户签署协议条款的信息 
riskInfo 
riskInfoType 
O 
前端提供的风险信息，目前
主要用于Apple Pay项目； 
casdCertInfo 
casdCertInfoType 
O 
前端提供的CASD证书信息，
中国银联 
版权所有

---
**[p51]**

Q/CUP 037.5.1—2015 
 
47 
 
目前仅用于Apple Pay项目 
mac 
macType 
C 
Message Authentication 
Code 
 
5.3.1.3 应答报文——mpanApplyResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mPanId 
panIdType 
C 
当银行返回3317应答码时存在； 
mpanPersoDataInfo 
mpanPersoDataInfoType 
C 
银行返回的设备卡个人化数据
信息； 
当申请验证通过且由银行自主
发卡时必须出现；银联代发卡模
式下无需存在。 
initQuota  
quotaType 
C 
初始免密限额； 
当申请验证通过时必须出现； 
mpanCardMetaData 
cardMetaDataType 
C 
银行给出的卡面信息； 
当申请验证通过时必须出现； 
otpResolutionList 
otpResolutionListType 
C 
银行返回的所支持的OTP验证方
法列表； 
当非银行自有渠道申请且验证
通过时必须出现； 
mac 
macType 
C 
Message Authentication Code 
 
其中，相关的StatusCode用法如下： 
 
0000 
代表成功且无后继 
3317 
应用下载重复申请 
注：如所使用的标准银行卡在此设备芯片中已成功申
请并加载了移动设备卡，且当前移动设备卡并未
被注销； 
3604 
用户账户信息不存在 
中国银联 
版权所有

---
**[p52]**

Q/CUP 037.5.1—2015 
 
48 
 
注：无效卡号； 
3608 
用户帐户信息无业务申请权限 
注：即卡片类型不允许加载移动设备卡，如纯电子现
金卡等 
3609 
用户帐户信息已失效 
注：如过期卡、挂失卡等； 
3602 
用户卡片信息校验失败，请确认输入的账户信息是
否正确 
注：卡片校验信息包括有效期、CVN2、手机号、PIN等；
在Apple pay项目中，如为从银行APP渠道发起的
加载，该应答码可表示银行自定义数据部分验证
失败； 
3610 
用户未留存手机号 
3611 
用户帐户信息已列入黑名单 
 
5.3.2 映射关系状态通知 
5.3.2.1 接口说明 
发起方：银联TSM系统 
接收方：银行系统； 
用于银联将建立的映射关系状态发送至银行。 
5.3.2.2 请求报文——mappingNotifyRequest 
参数名 
元素类型 
M/O/C 
描述说明 
seId 
seIdType 
M 
用户移动设备中安全芯片所对应
的标识符； 
mappingInfo 
mappingInfoType 
M 
此次设备卡申请所建立的映射关
系； 
mpanPersoResult 
operationResultType 
O 
mPan应用个人化执行结果 
mac 
macType 
C 
Message Authentication Code 
5.3.2.3 应答报文——mappingNotifyResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
中国银联 
版权所有

---
**[p53]**

Q/CUP 037.5.1—2015 
 
49 
 
5.3.3 触发动态验证请求 
5.3.3.1 接口说明 
发起方：银联TSM系统； 
接收方：银行系统； 
功能：用于触发银行向用户发送动态验证信息，银行应根据用户选中的OTP方法发送。 
5.3.3.2 请求报文——triggerOtpRequest 
参数名 
元素类型 
M/O/C 
描述说明 
seId 
seIdType 
M 
用户移动设备中安全芯片所对应
的标识符； 
mpanId 
panIdType 
M 
用户移动设备卡所对应的标识
符； 
msisdn 
msisdnType 
O 
手机号；（仅三星项目需要） 
otpResolutionId 
otpResolutionIdType 
M 
用户选中的OTP方法对应的标识 
mac 
macType 
C 
Message Authentication Code 
 
5.3.3.3 应答报文—— triggerOtpResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
 
其中，相关的StatusCode用法如下： 
 
0000 
代表成功且无后继 
3105 
OTP 发送服务不可用 
3106 
OTP 发送失败 
3602 
用户手机号验证失败 
3613 
重复验证，用户OTP 验证已通过 
 
5.3.4 验证动态信息请求 
5.3.4.1 接口说明 
中国银联 
版权所有

---
**[p54]**

Q/CUP 037.5.1—2015 
 
50 
 
发起方：银联TSM系统 
接收方：银行系统； 
功能： 用于将用户输入的动态验证信息发送至银行进行验证。 
5.3.4.2 请求报文——verifyOtpRequest 
参数名 
参数类型 
M/O/C 
描述说明 
seId 
seIdType 
M 
用户移动设备中安全芯片所对
应的标识符； 
mpanId 
panIdType 
M 
用户移动设备卡所对应的标识
符； 
otp 
otpValueType 
M 
用户输入的OTP信息 
mac 
macType 
C 
Message Authentication Code 
 
5.3.4.3 应答报文——verifyOtpResponse 
 
参数名 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
其中，相关的StatusCode用法如下： 
 
0000 
代表成功且无后继 
3612 
用户输入的OTP 验证信息未通过； 
3613 
重复验证，用户OTP 验证已通过 
3614 
用户提供的OTP 信息已失效； 
 
5.3.5 映射关系查询请求 
5.3.5.1 接口说明 
发起方：银行系统 
接收方：银联TSM系统 
功能： 银行可通过本接口查询一张移动设备卡所对应的映射关系信息。 
5.3.5.2 请求报文 - mappingInquiryRequest 
参数名 
元素类型 
M/O/C 
描述说明 
中国银联 
版权所有

---
**[p55]**

Q/CUP 037.5.1—2015 
 
51 
 
mpanId 
panIdType 
M 
用户移动设备卡所对应的标识
符； 
mac 
macType 
C 
Message Authentication Code 
 
5.3.5.3 应答报文 - mappingInquiryResponse 
 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mappingInfo 
mappingInfoType 
O 
如果查询成功，则返回该移动设
备卡标识符对应的映射关系； 
operationChannelId 
operationChannelIdType 
C 
条件存在； 
如果查询成功且当前映射关系为
锁定状态时存在； 
mac 
macType 
C 
Message Authentication Code 
 
其中，相关的StatusCode用法如下： 
 
0000 
代表成功且无后继 
1340 
未查询到对应的映射关系； 
 
5.3.6 设备卡映射关系状态变更通知（银行发起） 
5.3.6.1 接口说明 
发起方：银行系统 
接收方：银联TSM系统 
功能： 当持卡人通知银行进行移动设备卡挂失/解挂/注销等操作时，银行系统在完成了对移动设
备卡后台账户的对应操作后，可通过本接口将其状态变更结果通知到银联TSM系统。 
5.3.6.2 请求报文——bankMpanOperationNotifyRequest 
参数名 
参数类型 
M/O/C 
描述说明 
mpanId 
panIdType 
M 
用户移动设备卡所对应的标识
符； 
中国银联 
版权所有

---
**[p56]**

Q/CUP 037.5.1—2015 
 
52 
 
mappingStatus 
mappingStatusType 
M 
标识当前银行后台端对设备卡映
射关系变更后的状态（暂停、恢
复或者解除） 
operationChannelId 
operationChannelIdType 
M 
标识当前发起该变更操作的渠道
方； 
operationReason 
operationReasonType 
M 
标识当前变更操作的变更原因 
mac 
macType 
C 
Message Authentication Code 
 
5.3.6.3 应答报文——bankMpanOperationNotifyResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
taskId 
taskIdType 
C 
Task ID 
MappingStatus为解除映射关系
类型时必须出现 
mac 
macType 
C 
Message Authentication Code 
 
其中，相关的StatusCode用法如下： 
0000 
代表成功且无后继 
1341 
PAN 操作渠道不符合； 
1342 
不存在对应的移动设备卡； 
1343 
映射关系不允许该操作； 
 
5.3.7 移动设备卡映射关系状态变更通知（银联发起） 
5.3.7.1 接口说明 
发起方：银联TSM系统 
接收方：银行系统 
功能：当用户手机中移动设备卡应用锁定/解锁/删除时，银联通过本接口将状态变更结果通知至银
行系统。当删除应用时且前端能够读取并返回电子余额时，也可通过本接口将电子现金余额待会给发卡
行。 
5.3.7.2 请求报文——cupMpanOperationNotifyRequest 
 
中国银联 
版权所有

---
**[p57]**

Q/CUP 037.5.1—2015 
 
53 
 
参数名 
参数类型 
M/O/C 
描述说明 
mpanId 
panIdType 
M 
用户移动设备卡所对应的标
识符； 
mappingStatus 
mappingStatusType 
M 
标识当前用户手机端移动设
备卡应用变更所导致的银联
端的映射关系变更后状态 
operationChannelId 
operationChannelIdType 
M 
标识当前发起该变更操作的
渠道方； 
operationReason 
operationReasonType 
M 
标识当前变更操作的变更原
因 
ecashBalance 
ecashBalanceType 
O 
电子现金余额 
mac 
macType 
C 
Message Authentication 
Code 
 
5.3.7.3 应答报文——cupMpanOperationNotifyResponse 
 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
 
其中，相关的StatusCode用法如下： 
0000 
代表成功且无后继 
3343 
映射关系不允许该操作； 
5.3.8 设备卡卡面更新 
5.3.8.1 接口说明 
发起方： 银行系统； 
接收方： 银联TSM系统； 
功能：当持卡人的标准实体银行卡因某种原因变更时（如实体卡补办、实体卡等级调整等），需将
映射关系中的对应的实体银行卡卡号进行更新。银行可通过本接口将实体银行卡更新情况通知银联，并
由银联返回更新后的映射关系。 
中国银联 
版权所有

---
**[p58]**

Q/CUP 037.5.1—2015 
 
54 
 
该接口用于银行向银联发起移动设备卡卡面更新，包括卡面更新或者设备卡对应的实体银行卡号更
新等。设备卡卡面更新执行结果将通过操作执行结果通知反馈给银行，使用TaskID关联。。 
5.3.8.2 请求报文——mpanCardMetaUpdateRequest 
 
参数名 
参数类型 
M/O/C 
描述说明 
mpanId 
panIdType 
M 
用户移动设备卡所对应的标识
符； 
operationReason 
operationReasonType 
M 
标识当前变更操作的变更原因 
newSpan 
panType 
O 
新的标准实体银行卡； 
mpanCardMetaData 
cardMetaDataType 
O 
银行给出的更新后移动设备卡卡
面信息； 
mac 
macType 
C 
Message Authentication Code 
 
5.3.8.3 应答报文——mpanCardMetaUpdateResponse 
 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
taskId 
taskIdType 
M 
Task ID 
mappingInfo 
mappingInfoType 
O 
更新后的映射关系 
mac 
macType 
C 
Message Authentication Code 
 
5.3.9 操作执行结果通知 
5.3.9.1 接口说明 
发起方：银联TSM系统 
接收方：银行系统 
功能：该接口主要将之前银行发起的异步操作的执行结果返回给银行，通过TaskID进行关联。比如：
在银行发起的移动设备卡注销场景中，当前端将他们在手机端的操作结果返回到银联时，银联就可通过
该接口将执行结果发至银行。 
5.3.9.2 请求报文——operationResultNotifyRequest 
中国银联 
版权所有

---
**[p59]**

Q/CUP 037.5.1—2015 
 
55 
 
参数名 
参数类型 
M/O/C 
描述说明 
mpanId 
panIdType 
M 
用户移动设备卡所对应的标识
符； 
taskId 
taskIdType 
M 
Task ID 
operationResult 
operationResultType  
M 
Task ID操作执行结果 
ecashBalance 
ecashBalanceType 
O 
电子现金余额 
mac 
macType 
C 
Message Authentication Code 
 
5.3.9.3 应答报文——operationResultNotifyResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
 
5.3.10 免密限额更改请求 
5.3.10.1 接口说明 
发起方：银行系统 
接收方：银联TSM系统 
功能： 银行可通过本接口修改移动设备卡的交易免密限额。 
5.3.10.2 请求报文——quatoModifyNotifyRequest 
参数名 
参数类型 
M/O/C 
描述说明 
mpanId 
panIdType 
M 
用户移动设备卡所对应的标识
符； 
quota 
quotaType 
M 
新设的交易免密限额 
mac 
macType 
C 
Message Authentication Code 
 
5.3.10.3 应答报文——quatoModifyNotifyResponse 
参数名 
参数类型 
M/O/C 
描述说明 
中国银联 
版权所有

---
**[p60]**

Q/CUP 037.5.1—2015 
 
56 
 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
 
5.3.11 黑名单报送（银联发起） 
5.3.11.1 接口说明 
发起方：银联TSM系统 
接收方：银行系统 
功能：该接口用于银联向银行同步黑名单。 
5.3.11.2 请求报文——cupBlackListSyncRequest 
参数名 
参数类型 
M/O/C 
描述说明 
blackListCategory 
blackListCategoryType 
M 
黑名单类型 
blackList 
blackListType 
M 
黑名单列表 
mac 
macType 
C 
Message Authentication Code 
 
5.3.11.3 应答报文——cupBlackListSyncResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
5.3.12 黑名单报送（银行发起） 
5.3.12.1 接口说明 
发起方：银行系统 
接收方：银联TSM系统 
功能：该接口用于银行向银联同步黑名单。 
5.3.12.2 请求报文——bankBlackListSyncRequest 
参数名 
参数类型 
M/O/C 
描述说明 
blackListCategory 
blackListCategoryType 
M 
黑名单类型 
blackList 
blackListType 
M 
黑名单列表 
中国银联 
版权所有

---
**[p61]**

Q/CUP 037.5.1—2015 
 
57 
 
mac 
macType 
C 
Message Authentication Code 
 
5.3.12.3 应答报文——bankBlackListSyncResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
 
5.3.13 设备卡申请异常通知 
5.3.13.1 接口说明 
发起方：银联TSM  
接收方：银行系统 
功能：本接口主要是用来通知银行系统有关用户移动设备卡申请的异常处理结果，包括：对于部分
在银联TSM系统侧即拒绝的用户申请；对于部分已经通过发卡行审核，但是在后续建立映射关系时出现
异常，比如个人化数据获取超时、发卡行返回的CartArtID不符合使用条件等。 
5.3.13.2 请求报文——mpanApplyExceptionNotifyRequest 
参数名 
元素类型 
M/O/C 
描述说明 
seId 
seIdType 
M 
用户手机中eSE的SEID 
span 
panType 
M 
用户申请所使用的实体银行卡信
息 
applyExceptionResult 
applyProcessResultType M 
移动设备卡申请异常处理结果 
exceptionResultReason 
operationReasonType  
O 
移动设备卡申请异常处理结果原
因描述 
applyChannel 
applyChannelType 
O 
用户申请加载移动设备卡的渠道 
mac 
macType 
C 
Message Authentication Code 
5.3.13.3 应答报文——mpanApplyExceptionNotifyResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
中国银联 
版权所有

---
**[p62]**

Q/CUP 037.5.1—2015 
 
58 
 
mac 
macType 
C 
Message Authentication Code 
 
5.3.14 交易结果通知 
5.3.14.1 接口说明 
发起方：银行系统  
接收方：银联TSM 
功能：本接口主要用于在发生交易后，由银行将相关交易详情信息通知到银联系统。 
5.3.14.2 请求报文——transactionNotifyRequest 
参数名 
元素类型 
M/O/C 
描述说明 
spanId 
panIdType 
C 
当存在mPanId时不应存在； 
当不存在mPanId时应存在； 
mPanId 
panIdType 
C 
当存在sPanId时不应存在； 
当不存在sPanId时应存在； 
备注：可表示mPanId或mstPanId 
transactionId 
transactionIdType 
C 
当出现mPanId且交易为UICS交易
时出现； 
transactionType 
transactionTypeType  
M 
交易类型 
transactionDate 
transactionDateType 
M 
交易日期 
currencyCode 
currencyCodeType 
M 
货币代码 
transactionAmount 
transactionAmountType 
M 
交易金额 
transactionStatus 
transactionStatusType 
M 
交易状态 
merchantName 
merchantNameType 
M 
商户名称 
rawMerchantName 
rawmerchantNameType 
O 
商户原始名称 
industryCategory 
industryCategoryType 
O 
行业分类 
industryCode 
industryCodeType 
O 
行业代码 
中国银联 
版权所有

---
**[p63]**

Q/CUP 037.5.1—2015 
 
59 
 
geolocation 
deviceLocationType 
O 
地理位置信息 
mac 
macType 
C 
Message Authentication Code 
 
5.3.14.3 应答报文——transactionNotifyResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
 
 
 
中国银联 
版权所有

---
**[p64]**

Q/CUP 037.5.1—2015 
 
60 
 
5.3.15 交易信息通知 
5.3.15.1 接口说明 
发起方：银联TSM 
接收方：银行系统 
功能：本接口主要用于MST交易且MST数据由银行自发时，银联将本次交易的交易计数器通知到银行，
以让银行通过此计数器判断是否有交易风险发生。 
5.3.15.2 请求报文——transactionmstNotifyRequest 
参数名 
元素类型 
M/O/C 
描述说明 
mstpanId 
panIdType 
M 
仅用于MST交易时。 
mstatc 
mstatcType 
M 
MST交易计数器 
mac 
macType 
C 
Message Authentication Code 
 
5.3.15.3 应答报文——transactionmstNotifyResponse 
参数名 
参数类型 
M/O/C 
描述说明 
status 
statusType 
M 
应答码 
mac 
macType 
C 
Message Authentication Code 
 
 
 
 
 
 
 
 
 
 
 
 
 
中国银联 
版权所有

---
**[p65]**

Q/CUP 037.5.1—2015 
 
61 
 
附 录 A 
（规范性附录） 
应答码定义 
A.1 应答码说明 
应答码可分成两类，一类用于描述系统间通讯状态，一类用于描述不同系统平台对于某笔业务处理
的状态。 
A.2 系统通讯状态应答码 
statusCode 
statusDescription 
0000 
代表成功且无后继 
0099 
代表成功且有后继 
0098 
代表交易超时 
0097 
代表报文格式错误 
0096 
代表交易不支持 
A.3 业务处理状态应答码 
作为业务处理状态码时，应答码的第一位表示生成该应答码的系统平台主体，第二位表示该应答码
所属的业务分类，第三位和第四位表示具体的业务处理状态。 
左起第一位 
左起第二位 
左起第三、四位 
1：银联TSM 
2：合作方TSM 
3：应用提供方 
1：SYSTEM 
01：通信异常 
02：系统错误 
03：系统缓存刷新错误 
04：系统繁忙 
05：OTP发送服务不可用 
06: OTP发送失败； 
07：对端服务不存在 
09：表示权限校验失败 
10：表示卡bin校验失败 
2：SE 
01：安全载体未注册 
02：安全载体批次重复 
03：SEID格式错误 
04：安全载体无预置应用 
05：安全载体通讯功能异常（数据库中查
到的安全载体都处于通讯功能异常的状
态） 
06：安全载体通讯功能不合法  （由于运
营商的原因，导致查到的安全载体通讯功
能状态出现不合法的状态，例如出现同一
中国银联 
版权所有

---
**[p66]**

Q/CUP 037.5.1—2015 
 
62 
 
左起第一位 
左起第二位 
左起第三、四位 
手机号对应多个通讯功能正常的安全载
体） 
07：安全载体型号不支持该业务 
08：获取ESE PROFILE ID失败 
09：安全载体状态异常 
10：安全载体手机号不一致 
11：安全载体预置批次信息未送达 
3：APP 
01：应用不存在 
02：应用下载申请未通过 
03：应用更新申请未通过 
04：应用锁定申请未通过 
05：应用解锁申请未通过 
06：应用删除申请未通过 
07：应用下载申请不存在 
08：应用下载申请中 
09：应用下载申请超限 
12：应用重复下载 
13：应用重复锁定 
14：应用重复解锁 
15：应用重复删除 
16：应用重复更新 
17：应用下载重复申请 
18：应用未安装 
19：应用有尚未处理的预操作 
20：电子现金有余额，请到银行柜台销卡 
21: 主账户有余额，请到银行柜台销卡 
22：应用预操作不存在  
23：个人化失败 
24：应用锁定失败 
25：应用解锁失败  
26：个人化数据不存在 
27: 未完成UPcard应用个人化 
28: 应用不允许从手机客户端申请 
29: 预置应用不允许删除 
30：未预置此应用 
31：应用不允许从第三方申请 
32：应用交易要素不存在 
33：请求机构发送短信验证码失败 
34：应用AC规则不存在 
35：应用已下架 
36：（与合作方间）应用发布状态不同步 
中国银联 
版权所有

---
**[p67]**

Q/CUP 037.5.1—2015 
 
63 
 
左起第一位 
左起第二位 
左起第三、四位 
37：失卡保险已领完 
38：不允许开通扩展应用 
39：预置应用激活失败 
40：远程添加应用AC规则失败 
41：移动设备卡操作渠道不符合； 
42：不存在对应的移动设备卡主账号； 
43：映射关系不允许该操作； 
44：未查询到对应的映射关系； 
45：应用不对当前渠道开放； 
46：该应用无提示信息； 
47：应用激活失败； 
4：SD 
01：安全域密钥需要更新 
02：安全域密钥重复更新 
03：安全域没有足够可变数据空间 
04：安全域没有足够非可变数据空间 
05：安全域INITIAL UPDATE验证卡片错误 
06：找不到安全域 
07：安全域为安装完成； 
5：APDU 
01：APDU应用下载失败 
02：APDU应用安装失败 
03：APDU应用删除失败 
04： APDU应用让渡失败 
05： APDU STORE DATA失败 
99：指令执行失败 
6：USER 
01：用户身份信息校验失败，请确认输入
的身份信息是否正确 
02: 用户卡片信息校验失败，请确认输入
的账户信息是否正确 
03：用户当日申请次数超出限制 
04：用户账户信息不存在 
05：用户当日失败次数超出限制 
06：用户账户未开通，请联系银行开通 
07：用户账户未注销，请联系银行销卡 
08：用户帐户信息无业务申请权限； 
09：用户帐户信息已失效； 
10：用户未留存手机号； 
11：用户帐户信息已列入黑名单 
12：用户输入的OTP信息验证未通过； 
13：重复验证，用户OTP验证已通过； 
14：用户提供的OTP信息已失效； 
15：不支持关联账户查询； 
中国银联 
版权所有

---
**[p68]**

Q/CUP 037.5.1—2015 
 
64 
 
左起第一位 
左起第二位 
左起第三、四位 
16：申请单号不存在，请重试； 
7：SECURITY 01：MAC校验错误 
02：密钥交换错误 
A 
 
 
 
中国银联 
版权所有

---
**[p69]**

Q/CUP 037.5.1—2015 
 
65 
 
附 录 B 
（规范性附录） 
EN-OTP 使用方法 
B.1 概述 
EN-OTP目前仅用于AM项目中通过银行自有渠道开展移动设备卡申请业务的场景。主要是供银联系统
验证用户申请的合法性。 
B.2 数据块构成 
EN-OTP数据块采用TLV结构，如下图所示： 
TAG 1
Length1 Value 1
TAG n
Lengthn
Value n
 
 
EN-OTP的TLV格式是采用了BER-TLV数据对象格式的定义，但所定义的Tag值用途仅限于本规范。 
当前必须包含的Tag为如下： 
Tag 
描述 
长度说明 
DF7D 
机构代码 
10位字符 
5A 
实体银行卡号 
13到19位字符 
DF7F 
银行自定义数据块 
最长1024个字符 
 
B.3 加解密方式 
对EN-OTP数据块的加解密规则如下： 
——机构代码为明文，不做加密，用于区分不同银行客户端和银联客户端； 
——实体银行卡号使用对称算法进行加解密，密钥由银行和银联协商产生，采用3DES 算法； 
——银行自定义数据块银联不做解密处理，直接透传给银行系统。 
 
中国银联 
版权所有

---
**[p70]**

Q/CUP 037.5.1—2015 
 
66 
 
附 录 C 
（资料性附录） 
报文接口实现要求 
交易类型 
报文接口 
实现要求 
银行返回 
个人化数据 
银行委托 
银联TSP代发卡 
2001 
移动设备卡申请 
√ 
√ 
1002 
映射关系状态通知 
√ 
√ 
1003 
触发动态验证请求 
√ 
√ 
1004 
验证动态信息请求 
√ 
√ 
1005 
映射关系查询请求 
○ 
○ 
1006 
设备卡映射关系状态变更通
知（银行发起） 
√ 
○ 
1007 
设备卡映射关系状态变更通
知（银联发起） 
√ 
√* 
1009 
操作执行结果通知 
√ 
√* 
1010 
免密限额更改通知 
○ 
○ 
1011 
黑名单报送（银行发起） 
○ 
○ 
1012 
黑名单报送（银联发起） 
√* 
√* 
1013 
设备卡卡面更新 
√ 
○ 
1014 
设备卡申请异常通知 
√ 
√* 
1015 
交易结果通知 
○ 
○ 
注1：√表示必须实现； 
注2：○表示可选实现； 
注3：√*代表业务上可不支持处理该逻辑功能，但接口层面需要支持，即接口层面需支持银联发送的交易，返回成
功应答； 
 
 
_________________________________ 
中国银联 
版权所有