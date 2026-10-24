# 差错服务联网对接技术规范V1.0 第2部分 报文接口规范
> 来源: 银联规范 2015-12 存档 | 88页 | 提取: 2026-09-03


---
**[p1]**

中国银联股份有限公司技术规范
Q/CUP
差错服务联网对接技术规范V1.0 
第2 部分 报文接口规范 
Technical Specifications on Bankcard Exeption Service V1.0 
Part 2   Specification on Message Interface 
 
 
 
2013-11-07 发布 
2013-11-07 实施
中国银联股份有限公司 发布 
Q/CUP 054.2—2013
代替Q/CUP 054.2-2012

---
**[p3]**

Q/CUP 054.2—2013 
I 
版本控制信息 
 
版本 
日期 
拟稿和修改 
说明 
    1.0 
2012-7-20 
工作组 
征求意见稿 
1.0 
2012-11-02 
工作组 
发布稿

---
**[p5]**

Q/CUP 054.2—2013 
I 
目    次 
前    言 ..................................................................................................................................................................... II 
1 范围 ................................................................................ 3 
2 报文结构 ............................................................................ 3 
2.1 报文结构说明 ...................................................................... 3 
2.2 报文格式检查 ...................................................................... 4 
3 数据类型 ............................................................................ 4 
3.1 数据属性说明 ...................................................................... 4 
3.2 简单数据类型说明 .................................................................. 4 
3.3 复杂数据类型说明 .................................................................. 8 
4 数据域标签说明 ...................................................................... 9 
4.1 数据域标签定义 .................................................................... 9 
5 报文域标签说明 ..................................................................... 36 
5.1 请求类报文域标签定义 ............................................................. 36 
5.2 应答类报文域标签定义 ............................................................. 38 
6 报文格式说明 ....................................................................... 39 
6.1 说明 ............................................................................. 39 
6.2 请求类报文接口定义 ............................................................... 39 
6.3 应答类报文接口定义 ............................................................... 56 
附 录 A （规范性附录） 标准代码定义 ........................................................................................................ 67 
A.1 应答码 ........................................................................... 67 
A.2 交易代码表 ....................................................................... 79

---
**[p6]**

Q/CUP 054.2—2013 
II 
 
前    言 
本标准对入网机构与中国银联差错服务系统之间进行联机交易时使用的报文接口，包括差错服务交
易报文的结构、格式以及报文域做了规定。 
本标准由中国银联股份有限公司提出。 
本标准由中国银联股份有限公司制定。 
本标准起草单位：中国银联股份有限公司。 
本标准主要起草人：周继恩，徐静雯，李伟，郭弘强，洪隽，蒋慧科，杨曦，唐真，吴海生。

---
**[p7]**

Q/CUP 054.2—2013 
 
 
3 
差错服务联网对接技术规范V1.0 
第2 部分 报文接口规范 
1 范围 
本规范规定了境内入网机构与中国银联差错服务系统之间进行服务对接交易时使用的
报文接口，包括交易报文的结构、格式以及报文域。 
本规范适用于境内加入中国银联银行卡差错服务网络的入网机构。 
2 报文结构 
2.1 报文结构说明 
差错通过WebService方式对外提供服务，使用XML报文传输业务数据。报文分为多个层
级，每个层级由报文标签组成。按照是否包含子域来区分，报文标签可分为数据域标签和报
文域标签。数据域标签值不包含子域，只包含具体的数据信息。报文域标签以数据域或更低
层级的报文域标签作为子域，报文域标签的信息都包含在内部的数据域标签中，本身不包含
数据信息。 
对于每个报文来说，最顶层的报文域标签用于标识报文的名称，是该业务报文的唯一标
识，其他层级的报文域标签和数据域标签均作为0级报文域标签的子域。 
报文体为XML 格式。（以贷记调整报文为例如下） 
<soapenv:Envelope 
xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"  
xmlns:par="http://www.unionpay.com/exp/paras" 
xmlns:data="http://www.unionpay.com/exp/data"> 
   <soapenv:Header/> 
   <soapenv:Body> 
      <par:CreditMsg> 
         <data:RequestSeqNumber>?</data:RequestSeqNumber> 
         <data:PriAccountNumber>?</data:PriAccountNumber> 
         <data:SettleDt>?</data:SettleDt> 
         <data:TransAmount>?</data:TransAmount> 
         <data:TransKey>?</data:TransKey> 
         <data:TransLogCd>?</data:TransLogCd> 
         <data:ExpTransAt>?</data:ExpTransAt> 
         <data:CuexpTranRsnCd>?</data:CuexpTranRsnCd> 
         <!--Optional:--> 
         <data:Remark>?</data:Remark> 
         <!--Optional:--> 
         <data:VouFileSize>?</data:VouFileSize> 
         <!--Optional:--> 
         <data:VouFile>cid:80122226261</data:VouFile> 
         <!--Optional:-->

---
**[p8]**

Q/CUP 054.2—2013 
4 
 
         <data:VouFileName>?</data:VouFileName> 
         <data:RequestUserName>?</data:RequestUserName> 
         <data:SubmitInsIdCd>?</data:SubmitInsIdCd> 
         <data:RequestUserSign>?</data:RequestUserSign> 
         <data:MsgVersionCd>?</data:MsgVersionCd> 
         <data:RequestPswd>?</data:RequestPswd> 
         <data:MsgInfoMAC>?</data:MsgInfoMAC> 
      </par:CreditMsg> 
   </soapenv:Body> 
</soapenv:Envelope> 
 
2.2 报文格式检查 
每个报文都有对应的schema文件用来进行报文格式检查，schema文件名称与报文域标签
相同。 
机构发送报文给银联差错服务系统时，应将待发送往帐报文的报文体使用XML Schema
进行格式检查，检查通过后，才能提交给银联差错服务系统。 
机构从银联差错服务系统接收报文后，应使用XML Schema对收到的来帐报文的报文体进
行格式检查，检查通过后，才能提交给行内系统进行业务处理。对检查失败的来帐报文，返
回相应的失败应答。 
3 数据类型 
 
3.1 数据属性说明 
3.1.1 符号说明 
表1 字符含义表 
字符 
含义 
MM 
月份，01至12 
DD 
日期，01至31 
YY 
年份，00至99 
hh 
时，00至23 
mm 
分，00至59 
ss 
秒，00至59 
X 
借贷符号，贷记为“C”，借记为“D”，并且总是与一个数字型金额数据元相连，例如， 
交易费金额中X+N8含义为前缀“C”或“D”和交易费金额的8位数字。 
 
 
3.2 简单数据类型说明 
本章包含简单类型（只包含一级的类型）的说明 
序
号 
类型名称 
类型定义 
附加说明 
1  MaxNNumeric 
表示数字串，最多N 位。 
1 位表示1 个数字字符。 
2  MaxNText 
表示数字、字母串，最多N
位。 
1 位表示1 个字母、数字字符。

---
**[p9]**

Q/CUP 054.2—2013 
 
 
5 
3  MaxNTextSpec 
表示数字、字母或特殊字符
串，最多N 位。 
1 位表示1 个字母、数字或特殊字符，汉字
算两位特殊字符，特殊字符。 
4  ExactNNumeric 
表示数字串，固定N 位。 
1 位表示1 个数字字符。 
5  ExactNText 
表示数字、字母串，固定N
位。 
1 位表示1 个字母、数字字符。 
6  ExactNTextSpec 
表示数字、字母或特殊字符
串，固定N 位。 
1 位表示1 个字母、数字或特殊字符，汉字
算两位特殊字符。 
7  AccountNumberType 
2 个字节的长度值+长度为
13-19 个数字字符 
表示账号，定义同《中国银联银行卡联网联
合技术规范V2.1》
（以下简称“2.1 规范”）
2 域 
8  InsIdCdType 
最长11 位的数字、字母。 表示机构代码 
9  KeyType 
定长42 位的数字、字母或
特殊字符 
表示交易的关键信息，取值为交易的受理机
构标识码（11 位）、系统跟踪号（6 位）、
传输日期时间（10 位）、转账标识（1 位，
转账转入交易为1，其他交易为0）、发送
机构标识码（11 位）的顺次组合。 
10 LogCdType 
定长2 位数字字符 
表示历史交易的交易日志代码。定义：01-
联机交易，05-差错交易，06-脱机消费交
易 
11 UserNameType 
最长8 位的字母、数字。 
表示服务系统为入网机构分配的用户名。 
12 PswdType 
最长500 位的数字、字母 
表示密码，密码规则同银联统一的密码策
略。基于安全考虑，密码需加密传输，加密
方法参见CFCA 的《证书应用工具包技术白
皮书》。 
13 MACType 
最长32 位的表示十六进制
数字的字母 
表示报文来源正确性鉴别码，是请求方对报
文特定域的组合做摘要后生成的MAC 
(Message Authentication Code)，
银联差错服务系统的应答报文中不包括本
域。本域的生成规则如下： 
1、 根据域标识号，将参与MAC 计算的元
素依次拼接，拼接顺序以“6.2 请求类报
文接口定义”描述顺序； 
2、 在域和域之间插入一个空格； 
3、使用MD5 加密算法、以提交机构代码为
密钥对1-6 步骤处理后的字符串做加密。 
14 SignType 
最长2000 位的字母、数字
或特殊字符 
本类型表示入网机构使用CFCA 颁发的证
书对报文信息摘要域进行签名后的签名结
果。签名方法参见CFCA 的《证书应用工具
包技术白皮书》。 
15 MsgVersionCdType 
定长2 位数字 
表示了报文的版本号，默认填01 
16 TransIdType 
定长3 位的数字、字母 
表示银联系统内部交易代码，区分交易的业
务类型，具体见附录中的交易代码表 
17 YYYYMMDDType 
定长8 位数字 
表示日期，格式为YYYYMMDD，年月日 
18 MMDDhhmmssType 
定长10 位数字 
表示日期及时间，格式为MMDDhhmmss，

---
**[p10]**

Q/CUP 054.2—2013 
6 
 
月日时分秒 
19 YYMMType 
定长4 位数字 
表示日期，格式为YYMM，年份后两位加月
份 
20 YYYYMMDDhhmmssType 
定长14 位数字 
表示日期，格式为YYYYMMDDhhmmss，年
月日时分秒 
21 MMDDType 
定长4 位数字 
表示日期，格式为MMDD，月日。 
22 FileNSizeType 
大小不超过N 兆的文件的
Base64 编码的字符 
 
23 TransAmountType 
定长12 位数字 
表示金额，本域中不带小数点，小数位根据
交易币种来决定。如金额为1000．02,该
域值为000000100002，定义同2.1 规范
4 域 
24 TransChannelType 
定长2 位数字 
表示交易渠道，定义同联机60.2.5 域定义 
25 MchntCdType 
15 位定长的字母、数字和
特殊字符 
表示商户代码，定义同2.1 规范42 域 
26 MchntTypeType 
4 位定长的数字 
表示交易商户分类编码(MCC)，定义同2.1
规范18 域 
27 TermIdType 
8 位定长的字母、数字和特
殊字符 
表示终端代码，定义同2.1 规范41 域 
28 SysTraNumberType 
6 位定长数字 
表示系统跟踪号，定义同2.1 规范11 域 
29 FlagInType 
定长1 位数字 
表示标志位 
30 SrvRspCdType 
定长4 位数字、字母 
表示差错服务请求的应答码 
31 CardAttributeType 
定长2 位数字、字母 
表示卡性质，与2.1 规范60.3.8 定义一
致 
32 AuthCdType 
定长6 位数字、字母 
表示授权码，定义同2.1 规范38 域 
33 TransMediaType 
1 位定长的数字 
定义同2.1 规范60.3.6 域。 
34 PosEntryMdCdType 
3 位定长数字 
服务点输入方式码,即持卡人数据（如PAN
和PIN）的输入方式。服务点（Point Of 
Service）是指各种交易始发场合。定义
以2.1 规范22 域定义为准 
35 PosCondCdType 
2 位定长数字 
表示服务点条件码，定义以2.1 规范25 域
的定义为准 
36 TransSubModeType   
定长1 位数字     
表示交易的发起方式，定义：0-未知，1-
现场，2-自助，3-联机代理，4-批量代理 
同2.1 规范60.3.5 定义 
37 SubMchntCdType       
8 位定长的数字。 
表示网上交易的子商户代码，定义参见2.1
规范61.6 域中对子商户代码的定义 
38 LogisticIdType 
1 位定长的数字 
表示网上交易的物流配送标识，定义参见
2.1规范61.6域中对物流配送标志的定义 
39 ECIType 
定长2 位数字、字母 
表示交易的交易电子商务标识，定义同2.1
规范60.2.8 域 
40 RsnCdType 
4 位定长数字 
指明发起差错交易的原因，原因码的定义以
《银联卡业务运作规章 第四卷 投诉差错

---
**[p11]**

Q/CUP 054.2—2013 
 
 
7 
及争议处理》
（以下简称“《第四卷》”）为准。 
41 RegCdType  
定长4 位数字 
表示地区代码，定义可以在中国银联差错平
台的文档下载里获取。 
42 CardClassType    
定长2 位数字 
表示卡种，定义：01-人民币卡 
02-人民币境外卡 
03-双币种卡 
04-国际卡 
05-境外卡 
06-外资卡 
07-外卡 
43 RespCdType  
2 位定长数字、字母 
表示交易联机的应答码，定义同2.1 规范
39 域 
44 RetrRefNoType  
12 位定长的字母和数字 
表示入网机构、POS 或商户给予交易的系统
检索参考号，定义同2.1 规范37 域 
45 QueryPageType 
3 位定长数字 
表示查询页数，从001-999 
46 RecCountType 
4 位定长数字 
表示记录数，从0001-9999 
47 SrvRspCdType 
定长4 位数字、字母 
表示差错服务请求的应答码 
48 File10SizeType 
表示大小不超过10M 的文
件 
对于Base64 方式传输的文件，表示大小不
超过10M 的二进制字符；对于MTOM 方式
传输的文件，表示大小不超过10M 的文件
的引用。

---
**[p12]**

Q/CUP 054.2—2013 
8 
 
3.3 复杂数据类型说明 
本章包含复杂类型（包含二级或以上类型），具体包含子域请参见：6 报文格式说明。 
编号 
数据名称 
英文名称 
标签 
说明 
1. 
历史交易
列表检索
结果 
History 
Transaction 
Information List 
HistTransList 
本域是解析历史交易列表检索
应答的标签域，其子域为历史
信息列表检索的数据域。由于
返回的历史交易检索结果可能
是多条，因此该域在同一层级
中可能出现多次。 
2. 
差错列表
检索结果 
Exp 
Transaction 
Information List 
ExpTransList 
本域是解析差错列表检索应答
的标签域，其子域为差错信息
列表检索的数据域。由于返回
的差错检索结果可能是多条，
因此该域在同一层级中可能出
现多次。 
3. 
手工列表
检索结果 
Manual 
Transaction 
Information List 
ManuTransList 
本域是解析手工列表检索应答
的标签域，其子域为手工信息
列表检索的数据域。由于返回
的手工检索结果可能是多条，
因此该域在同一层级中可能出
现多次。 
4. 
操作过程
列表检索
结果 
Operation List 
OperList 
本域是解析操作过程列表检索
应答的标签域，其子域为操作
过程列表检索的数据域。由于
返回的检索结果可能是多条，
因此该域在同一层级中可能出
现多次。 
5. 
凭证列表
检索结果 
Voucher List 
VouList 
本域是解析凭证列表检索应答
的标签域，其子域为凭证列表
检索的数据域。由于返回的检
索结果可能是多条，因此该域
在同一层级中可能出现多次。 
6. 
请求报文
头 
Request 
Message 
Header 
ReqMsgHeader 
包括在请求报文中，用来验证
请求方的身份、报文安全性和
完整性的信息。 
7. 
应答报文
头 
Response 
Message 
Header 
ResMsgHeader 
包括在应答报文中，包括差错
服务对请求的通用应答信息。

---
**[p13]**

Q/CUP 054.2—2012 
 
 
9 
4 数据域标签说明 
4.1 数据域标签定义 
 
序号 名称 
XML 标签名 
数据类型 
数据类型说明 
域描述 
用法 
1. 
报文版本号 
Message Version 
Code 
MsgVersionCd 
MsgVersionCdType  定长2 位数字 
指明了报文的版本号，默认填
01 
本域指明了服务客户端发送的报文
版本号 
2. 
提交机构代码 
Submit 
Institution 
Identity Code 
SubmitInsIdC
d 
InsIdCdType        最长11 位的可变
长度的字母、数字 
差错服务系统为入网机构分配
的代码 
差错服务系统根据安全验证信息域
判断请求的合法性，提交机构代码
是请求方的安全验证信息域之一 
3. 
请求用户名 
Request 
User 
Name 
RequestUserN
ame 
UserNameType       最长8 位的字母、
数字。 
差错服务系统为入网机构分配
的用户名。 
差错服务系统根据安全验证信息域
判断请求的合法性，请求用户名是
请求方的安全验证信息域之一 
4. 
请求用户密码 
Request 
Password 
RequestPswd 
PswdType            最长500 位的字
母、数字 
表示密码，密码规则同银联统一
的密码策略。基于安全考虑，密
码需加密传输，加密方法参见
CFCA 的《证书应用工具包技术
白皮书》。 
差错服务系统根据安全验证信息域
判断请求的合法性，请求用户密码
是请求方的安全验证信息域之一 
5. 
请求用户新密码 
Request 
New 
Password 
RequestNewPs
wd 
PswdType            最长500 位的字
母、数字 
表示密码，密码规则同银联统一
的密码策略。基于安全考虑，密
码需加密传输，加密方法参见
CFCA 的《证书应用工具包技术
白皮书》。 
本域在重置用户密码交易中使用，
用来指明用户更新后的密码 
6. 
报文信息摘要 
MsgInfoMAC 
MACType             最长32 位的表示
指明了报文来源正确性鉴别码，
差错服务系统根据安全验证信息域

---
**[p14]**

Q/CUP 054.2—2013 
10 
 
Message 
Information MAC 
十六进制数字的
字母 
是请求方对报文特定域的组合
做摘要后生成的MAC 
(Message Authentication 
Code)，银联差错服务系统的应
答报文中不包括本域。本域的生
成规则如下： 
1、 根据域标识号，将参与MAC
计算的元素依次拼接，拼接顺序
以“6.2 请求类报文接口定义”
描述顺序； 
2、 在域和域之间插入一个空
格； 
3、使用HMAC MD5 加密算法、
以提交机构代码为密钥对1-6
步骤处理后的字符串做加密。 
判断请求的合法性，报文信息摘要
是请求方的安全验证信息域之一 
7. 
请求用户签名 
Request 
User 
Digital 
Signature 
RequestUserS
ign 
SignType 
最长2000 位的
字母、数字或特殊
字符 
本域指明了入网机构使用CFCA
颁发的证书对报文信息摘要域
进行签名后的签名结果。签名方
法参见CFCA 的《证书应用工具
包技术白皮书》。 
差错服务系统根据安全验证信息域
判断请求的合法性，请求用户签名
是请求方的安全验证信息域之一 
8. 
请求流水号 
Request 
Sequence Number 
RequestSeqNu
mber 
Exact10Text       
10 位定长数字、
字母 
交易请求方赋予交易的一组数
字，用来标识机构在一个月内提
交的请求类差错交易。 
交易请求方对发出的每一笔请求类
交易，必须赋予一个请求流水号，
机构保证该流水号在两天内不能重
复。对于上一笔交易超时未收到应
答，可以通过请求流水号对交易状
态进行检索

---
**[p15]**

Q/CUP 054.2—2012 
 
 
11 
9. 
差错交易编号 
Exp transaction 
record 
Identification 
ExpTransRecI
d 
Exact15Text        15 位定长数字、
字母 
发起成功的差错交易在差错服
务系统中的编号，是差错交易的
关键信息域之一，与交易代码组
合唯一确定一笔差错交易 
请求方发起请求类交易成功后，差
错服务系统在应答中包含差错交易
编号、交易代码和发起日期。请求
方需记录差错交易编号、交易代码
和发起日期，作为差错更新类交易
和差错交易明细检索的关键域。 
10. 
交易代码 
Transaction 
Identification 
ExpTransId 
TransIdType        3 位定长的字母、
数字 
表示银联系统内部交易代码，区
分交易的业务类型，具体见附录
中的交易代码表 
请求方发起请求类交易成功后，差
错服务系统在应答中包含差错交易
编号、交易代码和发起日期。请求
方需记录差错交易编号、交易代码
和发起日期，作为差错更新类交易
和差错交易明细检索的关键域 
11. 
清算日期 
Settlement Date 
SettleDt 
YYYYMMDDType       
表示日期，格式为
YYYYMMDD，年月
日 
本域指明交易的清算日期 
清算日期是提交类、检索类请求中
确定原始交易的关键信息之一。 
12. 
交易关键域 
Transaction Key 
Field 
TransKey 
KeyType             
最长42 位的字
母、数字、特殊字
符 
本域指明了交易的关键信息。在
请求类交易中，本域表示原交易
的关键域，在列表检索及明细检
索中，该域表示了查询结果交易
的关键域。本域指明了交易的关
键信息。在请求类交易中，本域
表示原交易的关键域，在列表检
索及明细检索中，该域表示了查
询结果交易的关键域。该域的取
值为交易的受理机构标识码（11
位）、系统跟踪号（6 位）、传输
交易关键域是基于原交易的一般请
求类交易中确定历史交易的关键信
息之一。

---
**[p16]**

Q/CUP 054.2—2013 
12 
 
日期时间（10 位）、转账标识（1
位，转账转入交易为1，其他交
易为0）、发送机构标识码（11
位）的顺次组合。 
13. 
交易日志代码 
Transaction Log 
Code 
TransLogCd 
LogCdType          2 位定长数字字
符 
本域是差错服务系统保留使用
域，是确定原始交易的关键信息
之一，与原交易关键域组合唯一
确定一笔原始交易。在请求类交
易中，本域表示原交易的交易日
志代码。在历史交易列表检索及
明细检索中，该域表示了历史交
易的交易日志代码。定义：01-
联机交易，05-差错交易，06-
脱机消费交易 
原始交易发送机构标识码是差错服
务系统确定原始交易的关键信息之
一 
14. 
相关交易关键域 
Related 
Transaction Key 
Field 
RelatedTrans
Key 
KeyType             
42 位定长的字
母、数字、特殊字
符 
本域指明相关联交易的关系，互
相关联交易的相关交易关键域
相同，且与最先发起的交易的交
易关键域相同 
机构发起历史交易列表检索交易
后，差错服务系统返回的应答中包
含本域，机构可使用本域发起相关
交易列表检索交易。本域是差错服
务系统确定历史交易的关键信息之
一。 
15. 
相关交易日志代码 
Related 
Log 
Code 
RelatedLogCd 
LogCdType          2 位定长数字字
符 
本域指明相关交易中，最先发起
的交易的交易日志代码。 
本域指明相关交易中，最先发起的
交易的交易日志代码 
16. 
系统跟踪号 
System 
Trace 
Number 
SysTraNumber 
SysTraNumberType  6 位定长数字字
符 
交易的系统跟踪号，定义同联机
报文11 域 
交易系统跟踪号是差错服务系统确
定历史交易的关键信息之一

---
**[p17]**

Q/CUP 054.2—2012 
 
 
13 
17. 
传输日期时间 
Transaction 
Transmission 
Date Time 
TsmDtTm 
MMDDhhmmssType    10 位定长数字 
本域指明了交易的传输日期时
间 
传输日期时间是差错服务系统确定
原始交易的关键信息之一。 
18. 
受理机构标识码 
Acquiring 
Institution 
Identification 
Code 
AcqInsIdCd 
 
InsIdCdType        最长11 位的可变
长度的字母、数字 
本域指明了交易的受理机构标
识码 
受理机构标识码是差错服务系统确
定历史交易的关键信息之一 
19. 
发送机构标识码 
Forwarding 
Institution 
Identification 
Code 
FwdInsIdCd 
InsIdCdType        最长11 位的可变
长度的字母、数字 
本域指明了交易的发送机构标
识码 
发送机构标识码是差错服务系统确
定原始交易的关键信息之一 
20. 
凭证文件名称 
Voucher 
File 
Name 
VouFileName 
Max30TextSpec      
最长30 位定长数
字，字母或特殊字
符 
上传的差错凭证文件名称 
机构发起凭证获取类交易后，差错
服务系统在返回应答中包含凭证文
件名称、凭证文件 
21. 
凭证文件大小 
Voucher 
File 
Size 
VouFileSize 
Max8Numeric        最长8 位数字 
表示上传的文件大小，以字节
（Byte 为单位），如5M 大小的
文件表示为5242880 
请求机构发起上传凭证的差错交易
时，需填写正确的凭证文件大小 
22. 
凭证文件 
Voucher File 
VouFile 
File10SizeType    
大小不超过10M
的
文
件
的
Base64 编码的
字符 
本域包含差错交易包括的凭证
文件。 
请求方发起获取凭证交易后，差错
服务系统的应答中包括凭证文件。 
23. 
索取凭证类型 
Voucher Type 
VouTp 
Exact2Numeric      2 位定长数字 
本域包含索取的凭证文件类型，
定义：01-原始凭证扫描件、02-
机构发起调单交易时可以通过本域
指定需要获取的凭证交易类型。

---
**[p18]**

Q/CUP 054.2—2013 
14 
 
原始交易凭证、03-原始交易凭
证影印件、04-帐务处理记录、
05-其他相关资料。 
24. 
交易状态 
Transaction 
Status 
TranStatus 
Exact5Numeric      5 位定长数字。 
每位表示一种状态，0-否，1-
是： 
第一位：是否应答 
第二位：是否撤消 
第三位：是否预授权完成 
第四位：是否冲正/是否确认 
第五位：是否退货 
本域一般包含在检索类应答中返回 
25. 
转换后交易状态 
Convert 
Transaction 
Status 
ConvTransSt 
Exact2Numeric      2 位定长数字 
本域指明交易转换后的状态 
01-成功 
02-后续联机汇款成功 
03-通知报文无应答 
04-成功被撤消 
05-成功被冲正 
06-后续联机汇款失败 
07-失败 
08-受理方超时冲正 
09-中心超时冲正 
10-迟到应答 
11-向受理方回应答失败，中心
冲正 
12-生效后撤消 
13-其他 
本域一般包含在检索类应答中返回 
26. 
交易金额 
TransAmount 
TransAmountType   12 位定长数字 
交易金额，本域中不带小数点，
当交易币种为人民币时，本域的最

---
**[p19]**

Q/CUP 054.2—2012 
 
 
15 
Transaction 
Amount 
小数位根据交易币种来决定。如
金额为1000．02,该域值为
000000100002。 
右两位应包含人民币的角和分。 
当交易币种为外币时，如果该币种
没有小数位，则该域的值代表实际
交易金额；如果该币种有两个小数
位，则表示方法同人民币;如果该币
种有3 个小数位，则最后一位取0 
27. 
主账号 
Primary Account 
Number (PAN) 
PriAccountNu
mber 
AccountNumberTyp
e 
 2 个字节的长度
值+ 长度为
13-19 个数字字
符 
用于标识主账号 
该域在所有的提交类、检索类报文
中中都要求存在。 
28. 
卡性质 
Transaction 
Card Attribute 
CardAttribut
e 
CardAttributeTyp
e 
2 位定长数字 
本域指明交易的卡性质，与2.1
规范60.3.8 定义一致。如下： 
00-未知 
01-借记卡 
02-贷记卡 
03-准贷记卡 
04-借贷合一卡 
05-预付费卡 
本域指明交易的卡性质。 
29. 
交易渠道 
Transaction 
Channel 
TransChannel 
TransChannelType  2 位定长数字或
字母 
本域指明交易的交易渠道，定义
如下（同联机60.2.5 域定义） 
本域指明交易的交易渠道。 
30. 
ECI 标识 
Electronic 
Commerce 
Identification 
ECI 
ECIType             2 位定长数字、字
母 
指明交易的交易电子商务标识，
定义同2.1 规范60.2.8 域 
本域指明交易电子商务标识（ECI） 
31. 
商户代码 
MchntCd 
MchntCdType        15 位定长的字
受卡方的标识码，即商户代码，
本域指明交易的商户代码。

---
**[p20]**

Q/CUP 054.2—2013 
16 
 
Card 
Acceptor 
Identification 
Code 
母、数字和特殊字
符 
定义方法同2.1 规范42 域。 
32. 
终端号 
Card 
Acceptor 
Terminal 
Identification 
TermId 
TermIdType         8 位定长的字母、
数字 
受卡机的终端标识码，定义方法
同联机报文41 域 
本域指明交易的终端标识代码。 
33. 
卡有效期 
Card Expiration 
Date 
CardExpiDt 
YYMMType            
表示日期，格式为
YYMM，年份后两
位加月份 
本域指明卡的有效期，域值是银
行卡到期的年月。例如：卡有效
期是2005 年4 月，那么从2005
年5 月1 日起该卡即为过期卡 
填入银行卡的有效期 
34. 
交易发起方式 
Transaction 
Submit Mode 
TransSubMode 
TransSubModeType  1 位定长的数字、
字母及特殊字符 
交易的发起方式，有四种：0-
未知，1-现场，2-自助，3-联
机代理，4-批量代理 
同2.1 规范60.3.5 定义 
本域指明交易的发起方式 
35. 
授权码 
Authorization 
Code 
AuthCd 
AuthCdType         6 位定长的字母、
数字。 
发卡方给予交易的授权号，或
CUPS 在对交易进行代授权时产
生的代授权号 
本域指明交易的授权号 
36. 
商户类型 
Merchant Type 
MchntTp 
MchntTypeType      4 位定长的数字 
表示交易商户分类编码(MCC) 
商户类型码表示商户的服务范围和
属性 
37. 
交易介质 
Transaction 
Media 
TransMedia 
TransMediaType    1 位定长的数字 
表示交易的交易介质，0-未知，
1-磁条卡，2-IC 卡，3-Fall 
Back 卡，4-虚拟卡，5-纯字符，
6-生物特征，7-无卡，定义同
联机报文60.3.6 域定义。 
本域一般包含在检索类应答中返
回。 
38. 
子商户代码 
SubMchntCd 
SubMchntCdType    最长8 位的数字、本域指明交易的子商户代码 
本域一般包含在检索类应答中返

---
**[p21]**

Q/CUP 054.2—2012 
 
 
17 
Sub 
Merchant 
Code 
字母和特殊字符。 
回。 
39. 
物流配送标识 
Logistic 
Identity 
LogisticId 
LogisticIdType    1 位定长的数字 
指明物流配送标识，定义： 
0-物流配送 
1-非物流配送 
2-未知 
本域一般包含在检索类应答中返
回。 
40. 
差错交易金额 
Exp Transaction 
Amount 
ExpTransAt 
TransAmountType   12 位定长数字 
交易金额，本域中不带小数点，
小数位根据交易币种来决定。如
金额为1000．02,该域值为
000000100002。 
本域指明差错或手工交易涉及的金
额。 
41. 
差错交易原因码 
Cuexp 
Transaction 
Reason Code 
CuexpTranRsn
Cd 
RsnCdType          4 位定长数字 
指明发起差错交易的原因，原因
码的定义以《银联卡业务运作规
章 第四卷 投诉差错及争议处
理》（以下简称“《第四卷》”）为
准。 
机构发起差错请求时需按照业务运
作规章填写适当的原因码。 
42. 
发起角色 
Submit Role 
SubmitRole 
Exact1Numeric      1 位定长的数字 
指明交易的角色，1-发卡 2-受
理。 
机构发起无原差错交易一般需要填
写本域，用来指定差错交易的请求
方在原始交易中是发卡方还是受理
方。 
43. 
差错回复码 
Exp 
Response 
Code 
ExpRspCd 
Exact2Numeric      2 位定长数字 
表示差错交易回复码，对于不同
差错交易定义不同，具体参见
《第四卷》 
机构发起回复类交易时，需按照业
务运作规章填写适当的回复码，回
复调单和查询交易：01-交易成功，
收单机构无长款， 02-交易有差错，
收单机构长款，已做账务调整，03-
交易有差错，收单机构长款，待做
账务调整，04-交易凭证无法提供，

---
**[p22]**

Q/CUP 054.2—2013 
18 
 
05-商户属违规拓商户，06-商户非
违规拓展商户，00-已回复，但无回
复码");回复托收交易：01-同意付
款，02-同意部分付款，04-持卡人
拒绝付款，05-持卡人难以联系，
06-持卡人账户异常，07-补充提供
凭证材料，08-不同意托收；回复例
外协商交易：01-同意，02-不同意，
具体用法参见《第四卷》 
44. 
备注 
Remark 
Remark 
Max200TextSpec    
最长200 位变长
的字母、数字和特
殊字符 
表示备注信息. 回复码不能阐
明的额外信息可在备注中申明。 
请求方发起一般请求类交易时本域
作为备注说明其中，发起欺诈相关
的交易时，如果该笔交易已经报送
到银联风险平台，可以将欺诈交易
序列号填写在该域中；发起查询和
无原查询时，可将要查询的要素填
写在其中。请求方发起查询回复、
调单回复、例外协商回复、托收回
复时本域作为回复意见，请求方发
起手工交易撤销时本域作为撤销原
因。 
45. 
商户名称地址 
Card 
Acceptor 
Name Location 
MchntNameLoc 
Max200TextSpec    
最长200 位的字
母、数字和特殊字
符。 
交易商户的名称和所在地 
本域指明交易商户的名称和所在
地。 
46. 
商户URL 
Merchant URL 
MchntURL 
Max100TextSpec    
最长100 位的字
母、数字和特殊字
符 
交易商户的网页地址 
一般用于请求方发起查询回复交易
时指明交易商户的网页地址

---
**[p23]**

Q/CUP 054.2—2012 
 
 
19 
47. 
购物明细 
Good 
Description 
GoodDesc 
Max256TextSpec    
最长256 位的字
母、数字和特殊字
符 
交易所购买的商品或服务的详
细信息 
一般用于请求方发起查询回复交易
时指明商品或服务的详细信息。 
48. 
回复TC 信息 
Confirm 
TC 
Iinformation 
ConfirmTcInf
o 
 
Max16TextSpec    
16 位定长字母、
数字和特殊字符 
表示IC 卡交易中的TC 信息 
一般用于请求方发起查询回复交易
时指明IC 卡交易中的TC 信息。 
49. 
差错接收机构代码 
Exp 
Receive 
Institution 
Code 
ExpRcvInsIdC
d 
InsIdCdType        最长11 位的可变
长度的字母、数字 
表示机构代码 
请求方发起无原差错交易时，一般
需要指明接收该差错交易的机构代
码。 
50. 
欺诈类型 
Fraud Type 
 
FraudTp 
Exact2Numeric      2 位定长数字 
欺诈类型定义： 
01-失窃卡 
02-未达卡 
04-伪卡 
07-其他欺诈 
08-帐户盗用 
31-虚假身份欺诈 
32-虚假资料欺诈 
51-互联网欺诈 
52-电购/邮购欺诈 
53-欺诈转帐 
61-欺诈性多笔交易 
62-套现。 
请求方发起欺诈相关的差错交易
时，一般需指明欺诈的类型。 
51. 
欺诈调查状态 
Fraud 
Investigate 
FraudInvSt 
Exact2Numeric      2 位定长数字 
欺诈调查状态包括：01-已退
单，02-已赔款，03-调查中，
04-其他。 
请求方发起欺诈相关的差错交易
时，一般需指明欺诈的调查状态。

---
**[p24]**

Q/CUP 054.2—2013 
20 
 
state 
52. 
POS 终端类型 
POS 
Acceptor 
Type 
PosAccpTp 
Exact2Numeric      2 位定长数字 
表示Pos 终端读取能力，包括
三种：00-未知类型，02-可读
取磁条卡，05-可读取IC 卡。 
请求方发起欺诈相关的差错交易
时，一般需指明交易pos 终端的读
取能力。 
53. 
商户所在省份 
Province 
of 
Merchant 
ProvOfMchnt 
RegCdType          4 位定长数字 
交易商户所在省份代码，代码定
义可以在中国银联差错平台的
文档下载里获取。 
请求方发起欺诈相关的差错交易
时，一般需指明交易商户所在省份
代码。 
54. 
商户所在城市 
City 
of 
Merchant 
CityOfMchnt 
RegCdType          4 位定长数字 
交易商户所在城市代码，代码定
义可以在中国银联差错平台的
文档下载中获取 
请求方发起欺诈相关的差错交易
时，一般需指明交易商户所在省份
代码。 
55. 
读卡器ID 
Card 
Reader 
Identification 
CardRdId 
Max8TextSpec       最长8 位数字、字
母或特殊字符。 
交易商户读卡器的编码号 
请求方发起欺诈相关的差错交易
时，一般需指明交易商户读卡器的
编码号。 
56. 
欺诈备注 
Fraud Remark 
FraudRemark 
Max40TextSpec      最长40 位字母、
数字和特殊字符 
表示欺诈备注 
请求方发起欺诈相关的差错交易
时，可填写欺诈备注。 
57. 
争议编号 
Dispute 
Identification 
DisputeId 
Exact8Numeric   
8 位定长数字 
表示差错争议的记录编号 
请求方发起与争议相关的付费时，
一般需填写争议案件编号。 
58. 
吞没卡日期 
Seize Card date 
SeizeCardDt 
YYYYMMDDType       
表示日期，格式为
YYYYMMDD，年月
日 
 本域指明吞没卡发生的日期。 
对于吞没卡发起交易，一般需填写
该域 
59. 
销毁日期 
Destruction 
date 
DestrDt 
YYYYMMDDType       
表示日期，格式为
YYYYMMDD，年月
日 
指明吞没卡的销毁日期。 
对于吞没卡发起交易，一般需填写
该域。 
60. 
吞没卡原因码 
Seize 
Card 
SeizeCardRsn
Cd 
Exact2Numeric   
2 位定长数字 
指明吞没卡的原因，定义如下：
07-没收卡，34-作弊卡，35-
对于吞没卡发起交易，一般需填写
该域。

---
**[p25]**

Q/CUP 054.2—2012 
 
 
21 
Reason Code 
与发卡行安全保密部门联系，
37-与收单行安全保密部门联
系，41-挂失卡，43-被窃卡，
67-ATM 需捕捉的卡，68-ATM
机器故障，69-ATM 无人取卡 
61. 
检索页码 
Query Page Code 
QueryPage 
QueryPageType 
3 位定长数字 
表示页码，定义：001-999 
差错服务系统对请求方发起的列表
类检索结果分页包含于应答中。请
求方发起列表类检索交易时，请求
中需包含检索页码，以指明应答包
含的查询结果的页号。差错服务系
统返回的应答中，检索页码指明返
回结果的列表的页号。 
62. 
检索结果起始时间 
Querty 
Result 
Begin Time 
QryRsltBgnTi
me 
YYYYMMDDhhmmssTy
pe   
表示日期和时间，
格
式
为
YYYYMMDDhhmm
ss 
本域指明了差错、手工列表检索
类交易的起始时间 
请求方发起差错、手工列表检索类
交易，需指明查询的时间范围，差
错服务系统返回在此时间范围内更
新（发起、回复、撤销、展期等）
的交易。本域为时间范围的起始时
间。 
63. 
检索结果结束时间 
Querty 
Result 
End Time 
QryRsltEndTi
me 
YYYYMMDDhhmmssTy
pe   
表示日期和时间，
格
式
为
YYYYMMDDhhmm
ss 
本域指明了差错、手工列表检索
类查询结果的结束时间 
请求方发起差错、手工列表检索类
交易，需指明查询的时间范围，差
错服务系统返回在此时间范围内更
新（发起、回复、撤销、展期等）
的交易。本域为时间范围的结束时
间。 
64. 
本机构发起/收到 
Institution 
InsSubOrRcv 
Exact1Numeric     1 位定长数字。 
指明了差错交易检索中本机构
发起或收到的查询条件。定义：
请求方发起差错、手工列表检索类
交易，需指明查询交易是本机构发

---
**[p26]**

Q/CUP 054.2—2013 
22 
 
Submit 
Or 
Recieve 
1-发起，2-收到，3-全部 
起或是本机构收到的交易。 
65. 
发送方状态 
Transmission 
forward status 
TransFwdSt 
Exact1Numeric 
1 位定长的数字 
本域指明交易的发送方状态： 
0：不成功 
1：成功 
2：无效。 
本域一般包含在检索类应答中返
回。 
66. 
接收方状态 
Transmission 
receive status 
TransRcvSt 
Exact1Numeric 
1 位定长的数字 
本域指明交易的接收方状态： 
0：不成功 
1：成功 
2：无效。 
本域一般包含在检索类应答中返
回。 
67. 
单双转换标识 
Single Message 
And 
Double 
Message 
Conversion 
Indication 
SmsDmsConvIn 
Exact1Numeric     1 位定长数字 
显示交易的单双转换性质：1：
单/单，2：单/双，3：双/单，
4：双/双。 
本域一般包含在检索类应答中返
回。 
68. 
交易模式 
Transaction 
Mode 
TransMode 
Exact1Numeric      1 位定长数字。 
显示交易的接收方状态：1-同
城，2-异地，3-南南，4-北南 
5-南北 
本域一般包含在检索类应答中返
回。 
69. 
源地区代码 
Source 
Region 
Code 
SourRegCd 
RegCdType          4 位定长数字 
显示交易的源地区代码 
本域一般包含在检索类应答中返
回。 
70. 
目的地区代码 
destination 
Region Code 
DestRegCd 
RegCdType          4 位定长数字 
显示交易的目标地区代码 
本域一般包含在检索类应答中返
回。 
71. 
卡种 
CardClass 
CardClassType 
2 位定长数字 
表示交易的主账号卡种： 
本域一般包含在检索类应答中返

---
**[p27]**

Q/CUP 054.2—2012 
 
 
23 
Card class 
01-人民币卡 
02-人民币境外卡 
03-双币种卡 
04-国际卡 
05-境外卡 
06-外资卡 
07-外卡 
回。 
72. 
代授权标识 
Stand-in 
Indication 
StiIn 
FlagInType         1 位定长数字 
显示交易的是否代授权 
本域一般包含在检索类应答中返
回。 
73. 
发卡机构标识码 
Issuers 
Institution 
Identification 
Code 
IssInsIdCd 
InsIdCdType        最长11 位的可变
长度的字母、数字 
显示交易的发卡机构标识码 
本域一般包含在检索类应答中返
回。 
74. 
接收机构标识码 
Receive 
Institution 
Identification 
Code 
RcvInsIdCd 
InsIdCdType        最长11 位的可变
长度的字母、数字 
显示交易的接收机构标识码 
本域一般包含在检索类应答中返
回。 
75. 
授权日期 
Authiorize Date 
AuthDt 
MMDDType            4 位定长数字,格
式为MMDD。 
显示交易的授权日期。 
本域一般包含在检索类应答中返
回。 
76. 
手工交易应答码 
Manual 
Transaction 
Response Code 
ManuTransRsp
Cd 
RespCdType 
2 位定长数字、字
母 
显示手工交易的应答码 
本域一般包含在检索类应答中返
回。

---
**[p28]**

Q/CUP 054.2—2013 
24 
 
77. 
发卡方应答码 
Issuer Response 
Code 
IssRspCd 
RespCdType 
2 位定长数字、字
母 
显示交易的发卡方应答码 
本域一般包含在检索类应答中返
回。 
78. 
受理方应答码 
Acquirer 
Response Code 
AcqRspCd 
RespCdType  
2 位定长数字、字
母 
显示交易的受理方应答码 
本域一般包含在检索类应答中返
回。 
79. 
清算发送机构标识
码 
Settle Forward 
Insstitution 
Identification 
Code 
StlFwdInsIdC
d 
InsIdCdType        最长11 位的可变
长度的字母、数字 
显示交易的清算发送机构标识
码 
本域一般包含在检索类应答中返
回。 
80. 
清算接收机构标识
码 
Settle Receive 
Insstitution 
Identification 
Code 
StlRcvInsIdC
d 
InsIdCdType        最长11 位的可变
长度的字母、数字 
显示交易的清算接收机构标识
码 
本域一般包含在检索类应答中返
回。 
81. 
服务点输入方式 
Point 
Of 
Service 
Entry 
Mode Code 
PosEntryMdCd 
PosEntryMdCdType  最长3 位数字 
服务点输入方式码,即持卡人数
据（如PAN 和PIN）的输入方
式。服务点（Point Of 
Service）是指各种交易始发场
合。定义以2.1 规范22 域定义
为准 
本域一般包含在检索类应答中返
回。 
82. 
服务点条件码 
Point 
Of 
PosCondCd 
PosCondCdType      2 位定长数字字
符 
表示服务点条件码，定义以2.1
规范25 域的定义为准 
本域一般包含在检索类应答中返
回。

---
**[p29]**

Q/CUP 054.2—2012 
 
 
25 
Service 
Condition Code 
83. 
检索参考号 
Retrive 
Reference 
Number 
RetrRefNo 
RetrRefNoType  
定长12 位定长字
母或数字 
入网机构、POS 或商户给予交易
的系统检索参考号 
本域一般包含在检索类应答中返
回。 
84. 
转入主账号 
Transform 
in 
account number 
TfrInAcctNo 
AccountNumberTyp
e 
2 个字节的长度
值+ 长度为
13-19 个数字字
符 
转账交易的转入主账号 
本域一般包含在检索类应答中返
回。 
85. 
转出主账号 
Transform 
out 
account number 
TfrOutAcctNo 
AccountNumberTyp
e 
2 个字节的长度
值+ 长度为
13-19 个数字字
符 
转账交易的转出主账号 
本域一般包含在检索类应答中返
回。 
86. 
凭证标识 
Voucher 
Indication 
VouIn 
FlagInType         1 位数字 
表示是否包含凭证，1-是，0-
否 
本域一般包含在检索类应答中返
回。 
87. 
记录总数 
Record Count 
RecordCount 
RecCountType 
4 位定长数字 
表示记录数，定义：0001-9999 
本域一般包含在列表检索类应答中
返回。 
88. 
当前页记录数 
Current 
Page 
Count 
CurrentPgCou
nt 
RecCountType 
4 位定长数字 
表示当前页记录数，定义：
0001-9999 
本域一般包含在列表检索类应答中
返回。 
89. 
总页数 
Record 
Page 
Count 
RecordPgCoun
t 
QueryPageType 
3 位定长数字 
本域指明查询结果中包含的页
数，定义001-999 
本域一般包含在列表检索类应答中
返回。 
90. 
当前页码 
CurrenPgNumb
QueryPageType      3 位定长数字 
指明了列表类检索交易的查询
本域一般包含在检索类应答中返回

---
**[p30]**

Q/CUP 054.2—2013 
26 
 
Current 
Page 
Number 
er 
页码，定义：001-999 
91. 
接收方清算金额 
Receive Settle 
Amount 
RcvSettleAt 
TransAmountType   12 位定长数字 
表示交易清算金额大小 
本域一般包含在检索类应答中返回 
92. 
本地交易日期 
Local 
transaction 
date 
LocTransDt 
MMDDType            4 位定长数字,格
式为MMDD。 
表示本地交易日期 
本域一般包含在检索类应答中返回 
93. 
相关交易机构标识
码 
Related 
Institution 
Identification 
Code 
RelInsIdCd 
InsIdCdType        最长11 位的可变
长度的字母、数字 
显示表示相关交易机构标识码 
本域一般包含在检索类应答中返
回。 
94. 
查询标识 
Inquire 
Indication 
InqIn 
FlagInType         1 位定长数字 
表示基于原交易的确认查询交
易状态，定义为： 
0：未发起 
1：已发起未回复 
2：过期未回复 
3：回复同意 
4：回复不同意 
5：过期回复 
6：受理方回复04（交易凭证无
法提供） 
本域一般包含在检索类应答中返
回。 
95. 
调单标识 
RetrlIn 
FlagInType         1 位定长数字 
表示基于原交易的调单交易状
本域一般包含在检索类应答中返

---
**[p31]**

Q/CUP 054.2—2012 
 
 
27 
Retrieval 
Indication 
态，定义同询标识。 
回。 
96. 
二次查询标识 
Second Inquire 
Indication 
SecInqIn 
FlagInType         1 位定长数字 
表示基于原交易的二次查询交
易状态，定义同询标识。 
本域一般包含在检索类应答中返
回。 
97. 
贷记调整标识 
Credit 
Adjustment 
Indication 
CredAdjIn 
FlagInType         1 位定长数字 
表示针对原交易是否发起过贷
调.0：未发起，1：已发起，2：
已生效 
本域一般包含在检索类应答中返
回。 
98. 
请款标识 
Debit 
Adjustment 
Indication 
DebAdjIn 
FlagInType         1 位定长数字 
表示针对原交易是否发起过请
款，0：未发起，1：已发起，2：
已生效 
本域一般包含在检索类应答中返
回。 
99. 
退单标识 
Chargeback 
Indication 
ChrgbakIn 
FlagInType         1 位定长数字 
表示针对原交易是否发起过退
单，0：未发起，1：已发起，2：
已生效 
本域一般包含在检索类应答中返
回。 
100. 
对贷调的请款标识 
Credit 
Adjustment 
Debit 
Adjustment 
Indication 
CadjDadjIn 
FlagInType         1 位定长数字 
表示针对原交易是否发起过对
贷调的请款，0：未发起，1：已
发起，2：已生效 
本域一般包含在检索类应答中返
回。 
101. 
对请款的退单标识 
Debit 
Adjustment 
Chargeback 
DadjChrgbakI
n 
FlagInType         1 位定长数字 
表示针对原交易是否发起过对
请款的退单，0：未发起，1：已
发起，2：已生效 
本域一般包含在检索类应答中返
回。

---
**[p32]**

Q/CUP 054.2—2013 
28 
 
Indication 
102. 
再请款标识 
Re-payment 
Indication 
ReptIn 
FlagInType         1 位定长数字 
表示针对原交易是否发起过再
请款，0：未发起，1：已发起，
2：已生效 
本域一般包含在检索类应答中返
回。 
103. 
二次退单标识 
Re-chargeback 
Indication 
ReChrgbakIn 
FlagInType         1 位定长数字 
表示针对原交易是否发起过二
次退单，0：未发起，1：已发起，
2：已生效 
本域一般包含在检索类应答中返
回。 
104. 
吞没卡标识 
Seize 
Card 
Indication 
SeizeCardIn 
FlagInType         1 位定长数字 
表示该主账号是否发起过吞没
卡，0：未发起，1：已发起，2：
已生效 
本域一般包含在检索类应答中返
回。 
105. 
单边账标识 
Unfitbill 
Indication 
UnFitBillIn 
FlagInType         1 位定长数字 
表示针对原交易是否发起过单
边帐，0：未发起，1：已发起，
2：已生效 
本域一般包含在检索类应答中返
回。 
106. 
手工退货标识 
Manual 
Return 
Indication 
RefundIn 
 
FlagInType         1 位定长数字 
表示针对原交易是否发起过手
工退货，0：未发起，1：已发起，
2：已生效 
本域一般包含在检索类应答中返
回。 
107. 
延期预授权完成标
识 
Overtime 
Pre-authorizat
ion 
Finish 
Indication 
OtAuthFinIn 
FlagInType         1 位定长数字 
表示针对原交易是否发起过延
期预授权完成，0：未发起，1：
已发起，2：已生效 
本域一般包含在检索类应答中返
回。 
108. 
手工汇款标识 
Manual 
Remit 
Indication 
ManuRemitIn 
FlagInType         1 位定长数字 
表示针对原交易是否发起过手
工汇款，0：未发起，1：已发起，
2：已生效 
本域一般包含在检索类应答中返
回。 
109. 
原交易传输日期时
OrigTsmDtTm 
MMDDhhmmssType    10 位定长数字, 
本域指明了差错交易的原始交
本域一般包含在检索类应答中返

---
**[p33]**

Q/CUP 054.2—2012 
 
 
29 
间 
Origional 
Transaction 
Transmission 
Date&Time 
格
式
：
MMDDhhmmss 
易的传输日期时间 
回。 
110. 
原交易系统跟踪号 
Original 
Transaction 
System 
Trace 
Audit Number 
OrigSysTraNu
mber 
SysTraNumberType  6 位定长数字字
符 
本域一般指差错交易的原交易
的系统跟踪号 
本域一般包含在检索类应答中返
回。 
111. 
原交易状态 
Original 
Transaction 
Status 
OrigTranSt 
Exact5Numeric      5 位定长数字。 
每位表示一种状态，0-否，1-
是： 
第一位：是否应答 
第二位：是否撤消 
第三位：是否预授权完成 
第四位：是否冲正/是否确认 
第五位：是否退货 
本域一般包含在检索类应答中返回 
112. 
原交易清算日期 
Origional 
Transaction 
Settlement Date 
OrigSettleDt 
YYYYMMDDType       
表示日期，格式为
YYYYMMDD，年月
日 
本域表示差错交易的原始交易
的清算日期，如对一笔消费交易
做贷调交易，消费交易的清算日
期就是贷调交易的原交易清算
日期。 
本域一般包含在检索类应答中返
回。 
113. 
原交易代码 
Origional 
Transaction 
Identification 
OrigTranId 
TransIdType        3 位定长的字母、
数字 
指明了差错交易的原交易代码，
具体见附录中的交易代码表。 
本域指明差错交易的原交易的交易
代码。

---
**[p34]**

Q/CUP 054.2—2013 
30 
 
114. 
原交易金额 
Origional 
Transaction 
Amount 
OrigTransAt 
TransAmountType   12 位定长数字 
本域指明差错交易原交易的交
易金额，本域中不带小数点，小
数位根据交易币种来决定 
当交易币种为人民币时，本域的最
右两位应包含人民币的角和分。 
当交易币种为外币时，如果该币种
没有小数位，则该域的值代表实际
交易金额；如果该币种有两个小数
位，则表示方法同人民币；若有三
个小数位，则最后一个小数位必须
为零。 
115. 
回复机构代码 
Confirm 
Institution 
Identification 
Code 
CfmInsIdCd 
InsIdCdType        最长11 位的可变
长度的字母、数字 
表示回复机构代码 
本域一般包含在检索类应答中返回 
116. 
回复日期 
Confirm Date 
CfmDt 
YYYYMMDDType       
表示日期，格式为
YYYYMMDD，年月
日 
表示回复机构进行回复的日期 
本域一般包含在检索类应答中返回 
117. 
回复结果 
Confirm Result 
CfmRslt 
FlagInType         1 位定长数字 
指明回复结果： 
0：同意；1：不同意 
本域一般包含在检索类应答中返回 
118. 
回复意见 
Confirm 
Description 
CfmDesc 
Max200TextSpec    最长200 位字母、
数字和特殊字符 
指明对发起机构发起的差错处
理的意见 
本域一般包含在检索类应答中返回 
119. 
回复备注 
Confirm Remark 
CfmRemark 
Max200TextSpec    
最长200 位变长
的字母、数字和特
殊字符 
对于查询交易回复，其含义为商
户名称地址。 
本域一般包含在检索类应答中返回 
120. 
发起日期 
Submit Date 
SubmitDt 
YYYYMMDDType       表示日期，格式为
YYYYMMDD，年月
指明差错交易的发起日期。 
本域一般包含在检索类应答中返回

---
**[p35]**

Q/CUP 054.2—2012 
 
 
31 
日 
121. 
最后回复日期 
Conform 
Deadline 
CfmDeadline 
YYYYMMDDType       
表示日期，格式为
YYYYMMDD，年月
日 
指明差错交易的最后回复期限 
本域一般包含在检索类应答中返回 
122. 
目标机构代码1 
Target 
Institution 
Identity Code1 
TgtInstIdCd1 
InsIdCdType        最长11 位的可变
长度的字母、数字 
指明差错交易的目标机构，即差
错交易发起的相对机构 
差错服务系统通过目标机构代码确
定可以处理差错交易的机构范围。 
123. 
目标机构代码2 
Target 
Institution 
Identity Code2 
TgtInstIdCd2 
InsIdCdType        最长11 位的可变
长度的字母、数字 
指明差错交易的目标机构，即差
错交易发起的相对机构 
差错服务系统通过目标机构代码确
定可以处理差错交易的机构范围。 
124. 
目标机构代码3 
Target 
Institution 
Identity Code3 
TgtInstIdCd3 
InsIdCdType        最长11 位的可变
长度的字母、数字 
指明差错交易的目标机构，即差
错交易发起的相对机构 
差错服务系统通过目标机构代码确
定可以处理差错交易的机构范围。 
125. 
目标机构代码4 
Target 
Institution 
Identity Code4 
TgtInstIdCd4 
InsIdCdType        最长11 位的可变
长度的字母、数字 
指明差错交易的目标机构，即差
错交易发起的相对机构 
差错服务系统通过目标机构代码确
定可以处理差错交易的机构范围。 
126. 
目标机构代码5 
Target 
Institution 
Identity Code5 
TgtInstIdCd5 
InsIdCdType        最长11 位的可变
长度的字母、数字 
指明差错交易的目标机构，即差
错交易发起的相对机构 
差错服务系统通过目标机构代码确
定可以处理差错交易的机构范围。 
127. 
操作标识 
Operation 
OperIn 
FlagInType 
1 位定长数字 
指明差错交易是否被删除撤销： 
0：正常 
本域一般包含在检索类应答中返回

---
**[p36]**

Q/CUP 054.2—2013 
32 
 
Indication 
1：已删除 
2：已撤销 
128. 
展期标识 
Extend 
Indication 
ExtIn 
FlagInType 
1 位定长数字 
指明差错交易是否展期，0-未展
期，1-已展期 
本域一般包含在检索类应答中返回 
129. 
回复标识 
Confirm 
Indication 
CfmIn 
FlagInType         1 位定长数字 
指明差错交易是否回复。 
0：未回复 
1：已回复 
本域一般包含在检索类应答中返回 
130. 
差错交易处理状态 
Exp Transaction 
Process Status 
ExpProcSt 
FlagInType 
1 位定长数字 
本域指明差错或手工交易的处
理状态： 
0-未复核  
1-复核通过 
2-复核不通过 
3-复核被系统拒绝  
4-双复核未通过  
5-双复核被系统拒绝 
6-生效  
7-已清算 
本域一般包含在检索类应答中返回 
131. 
手工交易处理状态 
Manual 
Transaction 
Process Status 
ManuProcSt 
FlagInType       
1 位定长数字 
指明手工交易的状态标识，其定
义为：1-未复核 
3-复核通过 
4-复核未通过 
5-已删除 
6-已撤销。 
本域一般包含在检索类应答中返回 
132. 
操作类型 
Operation Type 
OperTp 
Max2Numeric        最长2 位数字 
指明对差错交易的操作类型，定
义： 
本域一般包含在检索类应答中返回

---
**[p37]**

Q/CUP 054.2—2012 
 
 
33 
01-经办 
02-复核 
03-双复核 
04-撤销 
05-删除 
06-回复 
07-文件装载 
08-隐藏 
09-展期 
15-发起裁定申请 
16-裁定凭证无效 
17-裁定凭证有效 
18-裁定撤销 
133. 
操作机构代码 
Operate 
institution 
Identification 
Code 
OperInsIdCd 
InsIdCdType        最长11 位的可变
长度的字母、数字 
指明操作机构代码 
本域一般包含在检索类应答中返回 
134. 
操作用户代码 
Operate 
User 
Identification 
OperUsrId 
UserNameType 
最长8 位字母、数
字 
指明操作的用户代码 
本域一般包含在检索类应答中返回 
135. 
操作时间 
Oparate 
Timestamp 
OperTm 
YYYYMMDDhhmmssTy
pe 
14 位定长数字 
指明操作时间 
本域一般包含在检索类应答中返回 
136. 
应答码 
Service 
SrvRspCd 
SrvRspCdType       定长4 位字母、数
字 
指明差错对接服务请求的应答
码 
本域包含在银联差错服务系统的应
答中返回

---
**[p38]**

Q/CUP 054.2—2013 
34 
 
Response Code 
137. 
公告栏内容 
Bulletin 
Bulletin 
Max5000Text        
最长5000 位字
母、数字及特殊字
符。 
指明银联差错服务的对外公告，
其内容与银联差错平台网页上
内容相同 
本域包含在银联差错服务系统的公
告栏检索应答中返回 
138. 
查询条件特征码 
Query Condition 
Identity 
QrCdnId 
Exact2Text        
定长2 位字母、数
字 
指明列表检索的查询条件，定
义：00-全部，01-借记卡查询，
02-贷记卡查询，03-准贷记卡
查询，04-预付费卡查询，05-
贷记卡及准贷记卡查询，06-借
记卡及预付费卡查询。 
本域包含在列表检索请求中作为查
询条件 
139. 
时间戳 
Request 
TimeStamp 
ReqResTimeSt
amp 
YYYYMMDDhhmmssTy
pe         
14 位定长数字, 
表示日期和时间，
格
式
为
YYYYMMDDhhmm
ss 
指明请求发送的时间 
本域包含在列表检索请求中作为查
询条件 
140. 
特殊计费类型 
Special 
Fee 
Type Identity 
SpeFeeTpId 
Exact2Text 
定长2 位字母、数
字。 
指明特殊计费的类型，定义：
00-无特殊计费类型、01-周期
计费、02-微额打包、03-固定
比例、04-县乡优惠。 
本域包含在无原交易的请求中 
141. 
特殊计费档次 
Special 
Fee 
Class Identity 
SpeFeeClsId 
Exact1Text 
定长1 位字母、数
字 
指明特殊计费的档次，定义0-
无特殊计费档次， 1-月结且按
照MCC 计费、2-月结且不按照
MCC 计费， 3-普通商户，4-三
农商户。 
本域包含在无原交易的请求中 
142. 
请
求
保
留
域
Request  
ReqtResFld 
 
Max20TextSpec  
最长20 位字母、
数字或特殊字符 
 
请求报文保留使用

---
**[p39]**

Q/CUP 054.2—2012 
 
 
35 
Reserve Field 
143. 
应答保留域 
Response 
Reverve Field 
RespResFld 
 
Max20TextSpec   
最长20 位字母、
数字或特殊字符 
 
应答保温保留使用

---
**[p40]**

Q/CUP 054.2—2013 
36 
 
5 报文域标签说明 
5.1 请求类报文域标签定义 
 
报文大
类 
序号 
报文名称 
报文标签 
备注 
一般请
求类 
1.  
贷调 
Credit Message 
CreditMsg 
 
2.  
请款 
Debit Message 
DebitMsg 
 
3.  
退单 
ChargeBack Message 
ChgBackMsg 
 
4.  
再请款 
Representment Message 
RepsentMsg 
 
5.  
二次退单 
RecargeBack Message 
RechgBkMsg 
 
6.  
查询 
Inquire Message 
InquireMsg 
 
7.  
无原查询 
Inquire Without History 
Message 
InqWoHisMsg 
在找不到历史交易的情况
下，发起无原查询交易。 
8.  
调单 
Retrieval Message 
RetrvMsg 
 
9.  
无原调单 
Retrieval Without History 
Message 
RetWoHisMsg 
在找不到历史交易的情况
下，发起无原调单交易。 
10. 
例外协商 
Consult Message 
ConsultMsg 
 
11. 
无原例外协
商 
Consult Without History 
Message 
CnsltWoHisMsg 
在找不到历史交易的情况
下，发起无原例外协商交易。 
12. 
例外长款 
Overage Message 
OverageMsg 
 
13. 
无原例外长
款 
Overage Without History 
Message 
OvrgWoHisMsg 
在找不到历史交易的情况
下，发起无原例外长款交易。 
14. 
托收协商 
Consign Message 
ConsignMsg 
 
15. 
无原托收协
商 
Consign Without History 
Message 
CnsgnWoHisMsg 
在找不到历史交易的情况
下，发起无原托收协商交易。 
16. 
付费 
Pay Fee Message 
PayFeeMsg 
 
17. 
吞没卡 
Seize Card Message 
SeizeCdMsg 
 
18. 
无原吞没卡 
Seize 
Card 
Without 
HistoryMessage 
SeizeCdWoHisMsg 
在找不到历史交易的情况
下，发起无原吞没卡交易。 
19. 
单边账 
Unfit Bill 
UnfitBillMsg 
 
20. 
手工单预授
权完成 
Manual 
Authorization 
Complete 
Without 
HistoryMessage 
AuthCmpWoHisMsg 
 
21. 
延期手工预
授权完成 
OverTime 
Manual 
Authorization 
Complete 
Message 
OvTmAuthCplMsg 
 
22. 
手工退货 
Manual Refund Message 
RefundMsg 
 
23. 
手工单退货 
Manual Refund Without 
History Message 
RefundWoHisMsg 
 
24. 
手工汇款 
Manual Remit Message 
RemitMsg 
 
请求确
认类交
1.  
手工预授权
完成 
Manual 
Authorization 
Complete Message 
AuthCmpltMsg

---
**[p41]**

Q/CUP 054.2—2012 
 
 
37 
易 
2.  
手工预授权
撤销 
Manual 
Authorization 
Cancel Message 
AuthCancelMsg 
 
3.  
手工预授权
完成撤销 
Manual 
Authorization 
Complete Cancel Message 
AuthCmpltCanMsg 
 
更新类 
1.  
回复 
Reply Message 
ReplyMsg 
 
2.  
撤销 
Cancel Message 
CancelMsg 
 
3.  
托收协商展
期 
Consign 
Extend 
Date 
Message 
CnsgnExtDtMsg 
 
检索类-
列表检
索 
1.  
历史交易列
表检索 
History Transaction List 
Query Message 
HisListQrMsg 
 
2.  
相关交易列
表检索 
Related Transaction List 
Query Message 
RltListQrMsg 
 
3.  
当日交易列
表检索 
Current Transaction List 
Query Message 
CrntListQrMsg 
 
4.  
差错交易列
表检索 
Exception Transaction List 
Query Message 
ExpListQrMsg 
 
5.  
手工交易列
表检索 
Manual Transaction List 
Query Message 
ManuListQrMsg 
 
6.  
差错/ 手工
交易操作过
程列表检索 
Exception&Manual 
Transaction Operation List 
Query Message 
ExMnListQrMsg 
 
7.  
凭证列表检
索 
Voucher 
List 
Query 
Message 
VouListQrMsg 
 
检索类-
明细检
索 
1.  
历史交易明
细检索 
History Transaction Detail 
Query Message 
HisDtlQrMsg 
 
2.  
交易差错状
态明细检索 
Status 
of 
Original 
Transaction Detail Query 
Message 
OrgStDtlQrMsg 
 
3.  
差错交易明
细检索 
Exception 
Transaction 
Detail Query Message 
ExpDtlQrMsg( 交易
标识码检索方式) 
ExpDtlQrMsg2（请
求流水号检索方
式） 
 
4.  
手工交易明
细检索 
Manual Transaction Detail 
Query Message 
ManuDtlQrMsg( 交
易标识码检索方式) 
ManuDtlQrMsg2（请
求流水号检索方
式） 
 
5.  
凭证获取检
索 
Voucher 
Detail 
Query 
Message 
VouDtlQrMsg
（MTOM 方式获取
凭证） 
VouDtlQrMsg2
（Base64 编码方式
获取凭证）

---
**[p42]**

Q/CUP 054.2—2013 
38 
 
管理类 
1.  
重置用户密
码 
Reset Password Message 
RstPswdMsg 
 
2.  
公告栏获取 
Bulletin Message 
BulletMsg 
 
 
5.2 应答类报文域标签定义 
 
序号 
报文名称 
报文标签 
备注 
1. 
通用请求类应
答报文 
Transaction 
Process 
Response Message 
TransProRspMsg 
一般请求类、请求确认和更
新类应答 
2. 
通用交易列表
检索应答 
History&Related&Current 
Transaction List Query 
Response Message 
HsRlCrListQrRspMsg 
历史交易列表检索、相关交
易列表检索和当日交易列表
检索应答 
3. 
差错列表检索
应答 
Excetion 
List 
Query 
Response Message 
ExpListQrRspMsg 
 
4. 
手工交易列表
检索应答 
Manual Transaction List 
Query Response Message 
ManuListQrRspMsg 
 
5. 
凭证列表检索
应答 
Voucher 
List 
Query 
Response Message 
VouListQrRspMsg 
 
6. 
操作过程列表
检索应答 
Operation 
List 
Query 
Response Message 
OperListQrRspMsg 
 
7. 
历史交易明细
检索应答 
History Transaction Detail 
Query Response Message 
HisDtlQrRspMsg 
 
8. 
交易差错状态
明细检索应答 
Status 
of 
Original 
Transaction Detail Query 
Response Message 
OrgStDtlQrRspMsg 
 
9. 
差错交易明细
检索应答 
Excetion 
Transaction 
Detail Query Response 
Message 
ExpDtlQrRspMsg( 交
易标识码检索方式) 
ExpDtlQrRspMsg2
（请求流水号检索方
式） 
 
10. 
手工交易明细
检索应答 
Manual Transaction Detail 
Query Response Message 
 ManuDtlQrRspMsg 
 (交易标识码检索方
式) 
ManuDtlQrRspMsg 
2（请求流水号检索方
式） 
 
11. 
凭证获取检索
应答 
Voucher 
Detail 
Query 
Message 
VouDtlQrRspMsg
（MTOM 方式获取
凭证） 
VouDtlQrRspMsg2
（Base64 编码方式
获取凭证） 
 
12. 
重置用户密码
Reset Password Response RstPswdRspMsg

---
**[p43]**

Q/CUP 054.2—2012 
 
 
39 
应答 
Message 
13. 
公告栏获取应
答 
Bulletin 
Response 
Message 
BulletRspMsg 
 
 
6 报文格式说明 
本节描述了报文接口的格式。银联差错服务系统采用0级域来标识每种报文的格式，用
来确定请求和应答报文所需要遵循的格式规范。每种报文格式的0级域定义及用法参见报文
域说明。本章主要描述每种报文1级域和2级域的格式规范。 
6.1 说明 
6.1.1 符号约定 
表2 符号约定 
符号类型 
标识取值 
备注栏标记 
含义 
数据元
符号 
必须 
出现 
属性： [1..1] 
 
必须出现 
条件 
出现 
属性： [0..1]  
C 
某条件成立时必须出现, 
可选 
出现 
属性： [0..1] 
O 
可选出现 
多次 
出现 
属性： [0..N] 
 
最多出现N次，最少不出现。 
是否摘
要元素 
摘要元素： E 
 
摘要元素 
摘要元素： N 
 
非摘要元素 
报文要
素级别 
1级报
文要素 
 
 
报文要素前不存在“----”标记的代表该要素
为一级报文要素 
2级报
文要素 
---- 
 
报文要素前存在“----”标记的代表该要素为
二级报文要素，为在本要素之前最后出现的1
级要素的下级报文要素 
报文表格中“属性”字段格式为[x..y]，其中x表示该字段最少出现次数，y表示该字段
最多出现次数；例如[1..10]表示该字段最少出现1次，最多出现10次。 
 
6.2 请求类报文接口定义 
6.2.1 请求报文头格式 
机构发出的请求类报文需包含应答报文头，用来验证请求方的身份、报文安全性和完整
性。格式定义如下： 
表3 请求报文头格式说明 
 
序号 
报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
2 
--请求用户名 
RequestUserName 
[1..1] 
UserNameType     
E 
  
3 
--提交机构代码 
SubmitInsIdCd 
[1..1] 
InsIdCdType     
E 
  
4 
--请求用户签名 
RequestUserSign 
[1..1] 
SignType 
N 
  
5 
--报文版本号 
MsgVersionCd 
[1..1] 
MsgVersionCdType   
E 
  
6 
--请求用户密码 
RequestPswd 
[1..1] 
PswdType       
N 
  
7 
--报文信息摘要 
MsgInfoMAC 
[1..1] 
MACType       
N 
  
8 
--时间戳 
ReqResTimeStamp 
[1..1] 
YYYYMMDDhhmmssType  
E 
  
9 
--请求保留域 
ReqtResFld 
[0..1] 
Max20TextSpec 
N

---
**[p44]**

Q/CUP 054.2—2013 
40 
 
 
 
6.2.2 一般请求类报文接口定义 
6.2.2.1 发起交易报文格式 
6.2.2.1.1 发起贷调报文格式 
表4 贷调交易报文格式说明 
 
序号 
报文要素 
XML tag 
属性 
数据类型 
摘要元
素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType    
E 
  
2 
主账号 
PriAccountNumber 
[1..1] AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType    
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType   
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType       
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType      
E 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType   
E 
  
8 
差错交易原因
码 
CuexpTranRsnCd 
[1..1] 
RsnCdType      
E 
  
9 
备注 
Remark 
[0..1] 
Max200TextSpec   
N 
  
10 
凭证大小 
VouFileSize 
[0..1] 
Max8Numeric     
N 
  
11 
凭证文件 
VouFile 
[0..1] 
File10SizeType   
N 
  
12 
凭证文件名称 
VouFileName 
[0..1] 
Max30TextSpec    
N 
  
13 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
 
6.2.2.1.2 发起请款报文格式 
表5 请款交易报文格式说明 
 
序号 
报文要素 
XML tag 
属性 
数据类型 
摘要元
素 
备注 
1 
请求流水号 
RequestSeqNumber [1..1] 
SeqNumberType    
E 
  
2 
主账号 
PriAccountNumber [1..1] AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType    
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType   
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType       
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType      
E 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType   
E 
  
8 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType      
E 
  
9 
备注 
Remark 
[0..1] 
Max200TextSpec   
N 
O 
10 
凭证大小 
VouFileSize 
[0..1] 
Max8Numeric     
N 
C0 
11 
凭证文件 
VouFile 
[0..1] 
File10SizeType   
N 
C0

---
**[p45]**

Q/CUP 054.2—2012 
 
 
41 
12 
凭证文件名称 
VouFileName 
[0..1] 
Max30TextSpec    
N 
C0 
13 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
C0：对于某些差错交易原因码，凭证文件必须上传，具体规则以《第四卷》为准。 
6.2.2.1.3 发起退单报文格式 
表6 退单交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
5 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
8 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
9 
备注 
Remark 
[1..1] 
Max200TextSpec    
N 
  
10 
凭证大小 
VouFileSize 
[0..1] 
Max8Numeric      
N 
C1 
11 
凭证文件 
VouFile 
[0..1] 
File10SizeType    
N 
C1 
12 
凭证文件名称 
VouFileName 
[0..1] 
Max30TextSpec     
N 
C1 
13 
欺诈类型 
FraudTp 
[0..1] 
Exact2Numeric     
N 
C0 
14 
欺诈调查状态 
FraudInvSt 
[0..1] 
Exact2Numeric     
N 
C0 
15 
POS 终端类型 
PosAccpTp 
[0..1] 
PosAccpTypeType    
N 
C0 
16 
商户所在省份 
ProvOfMchnt 
[0..1] 
ProvOfMchntType    
N 
C0 
17 
商户所在城市 
CityOfMchnt 
[0..1] 
CityOfMchntType    
N 
C0 
18 
读卡器ID 
CardRdId 
[0..1] 
Max8TextSpec     
N 
O 
19 
卡有效期 
CardExpiDt 
[0..1] 
YYMMType       
N 
C0 
20 
欺诈备注 
FraudRemark 
[0..1] 
Max40TextSpec     
N 
O 
21 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
C0：对于退单交易原因码4802、4803、4810、4514、4515、4562，必须提交风险欺
诈信息，具体规则以《第四卷》为准。 
C1：对于某些退单交易原因码，必须提交凭证信息，具体规则以《第四卷》为准。 
6.2.2.1.4 发起再请款报文格式 
表7 再请款交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E

---
**[p46]**

Q/CUP 054.2—2013 
42 
 
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
8 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
9 
备注 
Remark 
[1..1] 
Max200TextSpec    
N 
  
10 
凭证大小 
VouFileSize 
[1..1] 
Max8Numeric      
N 
  
11 
凭证文件 
VouFile 
[1..1] 
File10SizeType    
N 
  
12 
凭证文件名称 
VouFileName 
[1..1] 
Max30TextSpec     
N 
  
13 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.5 发起二次退单报文格式 
表8 二次退单交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
8 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
9 
备注 
Remark 
[1..1] 
Max200TextSpec    
N 
  
10 
凭证大小 
VouFileSize 
[1..1] 
Max8Numeric      
N 
  
11 
凭证文件 
VouFile 
[1..1] 
File10SizeType    
N 
  
12 
凭证文件名称 
VouFileName 
[1..1] 
Max30TextSpec     
N 
O 
13 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.6 发起查询报文格式 
表9 查询交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E

---
**[p47]**

Q/CUP 054.2—2012 
 
 
43 
7 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
备注1: 
8 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
9 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
备注1:使用查询原因码来表明查询的原因和需要查询的要素，例如持卡人提出查询ATM 取现地址、查
询消费商户地址或名称，具体参见《业务规则 第四卷》 
 
6.2.2.1.7 发起无原查询报文格式 
表10 无原查询交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
E 
  
5 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
6 
交易渠道 
TransChannel 
[1..1] 
TransChannelType   
E 
  
7 
传输日期时间 
TsmDtTm 
[0..1] 
MMDDhhmmssType    
N 
O 
8 
受理机构标识码 
AcqInsIdCd 
[1..1] 
InsIdCdType      
E 
  
9 
商户代码 
MchntCd 
[0..1] 
MchntCdType      
N 
O 
10 
终端号 
TermId 
[0..1] 
TermIdType      
N 
O 
11 
交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
E 
  
12 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
13 
备注 
Remark 
[0..1] 
Max100TextSpec    
N 
O 
14 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.8 发起调单报文格式 
表11 调单交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
 
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
 
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
 
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
 
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
 
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
 
7 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
 
8 
索取凭证类型 
VouTp 
[0..1] 
Exact2NumericType   
N 
O 
9 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
10 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N

---
**[p48]**

Q/CUP 054.2—2013 
44 
 
 
6.2.2.1.9 发起无原调单报文格式 
表12 无原调单交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
E 
  
5 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
6 
交易渠道 
TransChannel 
[1..1] 
TransChannelType   
E 
  
7 
传输日期时间 
TsmDtTm 
[0..1] 
MMDDhhmmssType    
N 
O 
8 
受理机构标识码 
AcqInsIdCd 
[1..1] 
InsIdCdType      
E 
  
9 
商户代码 
MchntCd 
[0..1] 
MchntCdType      
N 
O 
10 
终端号 
TermId 
[0..1] 
TermIdType      
N 
O 
11 
交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
E 
  
12 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
13 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
14 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.10 发起例外协商报文格式 
表13 例外协商交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
8 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
9 
凭证大小 
VouFileSize 
[0..1] 
Max8Numeric      
N 
O 
10 
凭证文件 
VouFile 
[0..1] 
File10SizeType    
N 
O 
11 
凭证文件名称 
VouFileName 
[0..1] 
Max30TextSpec     
N 
O 
12 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.11 发起无原例外协商报文格式 
表14 无原例外协商交易报文格式说明

---
**[p49]**

Q/CUP 054.2—2012 
 
 
45 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
E 
  
5 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
6 
交易渠道 
TransChannel 
[1..1] 
TransChannelType   
E 
  
7 
商户代码 
MchntCd 
[0..1] 
MchntCdType      
N 
O 
8 
终端号 
TermId 
[0..1] 
TermIdType      
N 
O 
9 
交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
E 
  
10 
差错接收机构代
码 
ExpRcvInsIdCd 
[1..1] 
InsIdCdType      
E 
  
11 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
12 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
13 
凭证大小 
VouFileSize 
[0..1] 
Max8Numeric      
N 
O 
14 
凭证文件 
VouFile 
[0..1] 
File10SizeType    
N 
O 
15 
凭证文件名称 
VouFileName 
[0..1] 
Max30TextSpec     
N 
O 
16 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.12 发起例外长款报文格式 
表15 例外长款交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
8 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
9 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
10 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.13 发起无原例外长款报文格式 
表16 无原例外长款交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E

---
**[p50]**

Q/CUP 054.2—2013 
46 
 
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
E 
  
5 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
6 
交易渠道 
TransChannel 
[1..1] 
TransChannelType   
E 
  
7 
商户代码 
MchntCd 
[0..1] 
MchntCdType      
N 
O 
8 
终端号 
TermId 
[0..1] 
TermIdType      
N 
O 
9 
交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
E 
  
10 
差错接收机构代
码 
ExpRcvInsIdCd 
[1..1] 
InsIdCdType      
E 
  
11 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
12 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
13 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
14 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.14 发起托收协商报文格式 
表17 托收协商交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
8 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
9 
备注 
Remark 
[1..1] 
Max200TextSpec    
N 
  
10 
凭证大小 
VouFileSize 
[1..1] 
Max8Numeric      
N 
  
11 
凭证文件 
VouFile 
[1..1] 
File10SizeType    
N 
  
12 
凭证文件名称 
VouFileName 
[1..1] 
Max30TextSpec     
N 
  
13 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.15 发起无原托收协商报文格式 
表18 无原托收协商交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E

---
**[p51]**

Q/CUP 054.2—2012 
 
 
47 
4 
系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
E 
  
5 
卡性质 
CardAttribute 
[1..1] 
CardAttributeType   
E 
  
6 
交易渠道 
TransChannel 
[1..1] 
TransChannelType   
E 
  
7 
商户代码 
MchntCd 
[0..1] 
MchntCdType      
N 
O 
8 
终端号 
TermId 
[0..1] 
TermIdType      
N 
O 
9 
交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
E 
  
10 
差错接收机构代
码 
ExpRcvInsIdCd 
[1..1] 
InsIdCdType      
E 
  
11 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
12 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
13 
备注 
Remark 
[1..1] 
Max200TextSpec    
E 
  
14 
凭证大小 
VouFileSize 
[1..1] 
Max8Numeric      
N 
  
15 
凭证文件 
VouFile 
[1..1] 
File10SizeType    
N 
  
16 
凭证文件名称 
VouFileName 
[1..1] 
Max30TextSpec     
N 
  
17 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
 
6.2.2.1.16 发起付费报文格式 
表19 付费交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[0..1] 
AccountNumberType 
N 
C0 
3 
差错接收机构代码 
ExpRcvInsIdCd 
[1..1] 
InsIdCdType      
E 
  
4 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
5 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
E 
  
6 
争议编号 
DisputeId 
[0..1] 
Exact8Numeric     
N 
C1 
7 
备注 
Remark 
[0..1] 
Max100TextSpec    
N 
O 
8 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
C0：对于付费原因码9803，必须提交交易主账号。 
C1：对于付费原因码7611、7612、7613、9800、9801、9802，必须提交争议编号。 
6.2.2.1.17 发起吞没卡报文格式 
表20 吞没卡交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E

---
**[p52]**

Q/CUP 054.2—2013 
48 
 
7 
销毁日期 
DestrDt 
[1..1] 
YYYYMMDDType 
E 
  
8 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
9 
凭证大小 
VouFileSize 
[1..1] 
Max8Numeric      
N 
O 
10 
凭证文件 
VouFile 
[1..1] 
File10SizeType    
N 
O 
11 
凭证文件名称 
VouFileName 
[1..1] 
Max30TextSpec     
N 
O 
12 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.18 发起无原吞没卡报文格式 
表21 无原吞没卡交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
差错接收机构代
码 
ExpRcvInsIdCd 
[1..1] 
InsIdCdType      
E 
  
4 
吞没卡日期 
SeizeCardDt 
[1..1] 
YYYYMMDDType     
E 
  
5 
销毁日期 
DestrDt 
[1..1] 
YYYYMMDDType     
E 
  
6 
吞没卡原因码 
SeizeCardRsnCd 
[1..1] 
Exact2Numeric   
E 
  
7 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
8 
凭证大小 
VouFileSize 
[0..1] 
Max8Numeric      
N 
O 
9 
凭证文件 
VouFile 
[0..1] 
File10SizeType    
N 
O 
10 
凭证文件名称 
VouFileName 
[0..1] 
Max30TextSpec     
N 
O 
11 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
6.2.2.1.19 发起单边账报文格式 
表22 单边账交易报文格式说明 
 
序号 
报文要素 
XML tag 
属性 
数据类型 
摘要元
素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType    
E 
  
2 
主账号 
PriAccountNumber 
[1..1] AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType    
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType   
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType       
E 
  
6 
交易日志代
码 
TransLogCd 
[1..1] 
LogCdType      
E 
  
7 
备注 
Remark 
[0..1] 
Max200TextSpec   
N 
  
8 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
P 
 
 
6.2.2.1.20 发起手工单预授权完成报文格式 
表23 手工单预授权完成交易报文格式说明

---
**[p53]**

Q/CUP 054.2—2012 
 
 
49 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
商户代码 
MchntCd 
[1..1] 
MchntCdType      
E 
  
5 
终端号 
TermId 
[1..1] 
TermIdType      
E 
  
6 
卡有效期 
CardExpiDt 
[0..1] 
YYMMType       
N 
O 
7 
交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
E 
  
8 
授权码 
AuthCd 
[0..1] 
AuthCdType      
N 
O 
9 
商户类型 
MchntTp 
[1..1] 
MchntTypeType     
E 
  
10 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
11 
特殊计费类型 
SpeFeeTpId 
[0..1] 
Exact2Text 
N 
 
12 
特殊计费档次 
SpeFeeClsId 
[0..1] 
Exact1Text 
N 
 
13 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.21 发起手工退货报文格式 
表24 手工退货交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
8 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.2.1.22 发起手工单退货报文格式 
表25 手工单退货交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
商户代码 
MchntCd 
[1..1] 
MchntCdType      
E 
  
5 
终端号 
TermId 
[1..1] 
TermIdType      
E 
  
6 
交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
E 
  
7 
商户类型 
MchntTp 
[1..1] 
MchntTypeType     
E

---
**[p54]**

Q/CUP 054.2—2013 
50 
 
8 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
9 
特殊计费类型 
SpeFeeTpId 
[0..1] 
Exact2Text 
N 
 
10 
特殊计费档次 
SpeFeeClsId 
[0..1] 
Exact1Text 
N 
 
11 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
 
6.2.2.1.23 发起手工汇款报文格式 
表26 手工汇款交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
6.2.3 请求确认类报文接口定义 
6.2.3.1 发起交易报文格式 
6.2.3.1.1 发起手工预授权完成报文格式 
表27 手工预授权完成交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
E 
  
8 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.3.1.2 发起手工预授权撤销报文格式 
表28 手工预授权撤销交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E

---
**[p55]**

Q/CUP 054.2—2012 
 
 
51 
4 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
E 
  
5 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
6 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
7 
备注 
Remark 
[0..1] 
Max200TextSpec    
N 
O 
8 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.3.1.3 发起手工预授权完成撤销报文格式 
表29 手工预授权完成撤销交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
3 
差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
E 
  
4 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.4 更新类报文接口定义 
6.2.4.1 回复交易报文格式 
6.2.4.1.1 回复报文格式 
表30 回复报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
2 
发起日期 
SubmitDt 
[1..1] 
YYYYMMDDType     
E 
  
3 
差错交易代码 
ExpTransId 
[1..1] 
TransIdType      
E 
  
4 
差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
E 
  
5 
差错回复码 
ExpRspCd 
[0..1] 
Exact2Numeric     
N 
C5 
6 
回复意见 
CfmDesc 
[0..1] 
Max200TextSpec    
N 
O 
7 
商户名称地址 
MchntNameLoc 
[0..1] 
Max200TextSpec    
N 
C3、C4 
8 
商户URL 
MchntURL 
[0..1] 
Max100TextSpec    
N 
C3 
9 
购物明细 
GoodDesc 
[0..1] 
Max256TextSpec    
N 
C3 
10 
回复TC 信息 
ConfirmTcInfo 
[0..1] 
Max16TextSpec    
N 
C0 
11 
凭证大小 
VouFileSize 
[0..1] 
Max8Numeric      
N 
C1 
12 
凭证文件 
VouFile 
[0..1] 
File10SizeType    
N 
C1 
13 
凭证文件名称 
VouFileName 
[0..1] 
Max30TextSpec     
N 
C1 
14 
差错交易金额 
ExpTransAt 
[0..1] 
TransAmountType    
N 
C2 
15 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
以下具体规则以《第四卷》为准 
C0：回复对TC 相关的查询交易，必须提交TC 信息。 
C1：对于调单回复，如果回复码为01、02、03、05、06，必须提交凭证信息。 
C2：对于托收协商回复，如果回复码为01、02，必须填写托收金额。

---
**[p56]**

Q/CUP 054.2—2013 
52 
 
C3：回复互联网交易相关的查询交易，必须填写商户相关信息。 
C4：回复商户名称地址相关的查询交易，必须填写商户的名称地址。 
C5：对于《第四卷》中注明可以不提供回复码的，回复码可以不填。 
6.2.4.2 撤销交易报文格式 
6.2.4.2.1 撤销差错/手工交易报文格式 
表31 撤销类交易报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
主账号 
PriAccountNumber 
[0..1] 
AccountNumberType 
N 
C1  
2 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
3 
发起日期 
SubmitDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
差错交易代码 
ExpTransId 
[1..1] 
TransIdType      
E 
  
5 
差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
E 
  
6 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
C1：对于付费交易的撤销，可以不上传主账号，其他交易的撤销必须上传主账号。 
6.2.4.3 展期交易交易报文格式 
 
6.2.4.3.1 托收协商展期报文格式 
表32 托收协商展期报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
2 
差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
E 
  
3 
发起日期 
SubmitDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.5 交易检索类报文接口定义 
6.2.5.1 列表检索报文格式 
6.2.5.1.1 历史交易列表检索报文格式 
表33 历史交易列表检索报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
主账号 
PriAccountNumber 
[0..1] 
AccountNumberType 
N 
C0 
2 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
3 
系统跟踪号 
SysTraNumber 
[0..1] 
SysTraNumberType   
N 
O 
4 
交易金额 
TransAmount 
[0..1] 
TransAmountType    
N 
O 
5 
交易渠道 
TransChannel 
[0..1] 
TransChannelType   
N 
O 
6 
ECI 标识 
ECI 
[0..1] 
ECIType        
N 
O 
7 
商户代码 
MchntCd 
[0..1] 
MchntCdType      
N 
C0 
8 
授权码 
AuthCd 
[0..1] 
AuthCdType      
N 
O 
9 
页码 
QueryPage 
[1..1] 
QueryPageType 
E

---
**[p57]**

Q/CUP 054.2—2012 
 
 
53 
10 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
C0：主账号和商户代码必填其一。 
6.2.5.1.2 相关交易列表检索报文格式 
表34 相关交易列表检索报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
相关交易关键域 
RelatedTransKey 
[1..1] 
KeyType        
E 
  
2 
相关交易日志代码 
RelatedLogCd 
[1..1] 
LogCdType       
E 
  
3 
页码 
QueryPage 
[1..1] 
QueryPageType     
E 
  
4 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.5.1.3 当日交易列表检索报文格式 
表35 当日交易列表检索报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
E 
  
2 
系统跟踪号 
SysTraNumber 
[0..1] 
SysTraNumberType   
N 
O 
3 
交易金额 
TransAmount 
[0..1] 
TransAmountType    
N 
O 
4 
交易渠道 
TransChannel 
[0..1] 
TransChannelType   
N 
O 
5 
商户代码 
MchntCd 
[1..1] 
MchntCdType      
E 
  
6 
授权码 
AuthCd 
[0..1] 
AuthCdType      
N 
O 
7 
页码 
QueryPage 
[1..1] 
QueryPageType     
E 
  
8 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.5.1.4 差错交易列表检索报文格式 
表36 差错交易列表检索报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
查询条件特征码 
QrCdnId 
[1..1] 
Exact2Text 
E 
  
2 
本机构发起/收到 
InsSubOrRcv 
[1..1] 
Exact1Numeric     
E 
  
3 
检索结果起始时
间 
QryRsltBgnTime 
[1..1] 
YYYYMMDDhhmmssType  
E 
  
4 
检索结果结束时
间 
QryRsltEndTime 
[1..1] 
YYYYMMDDhhmmssType  
E 
  
5 
页码 
QueryPage 
[1..1] 
QueryPageType     
E 
  
6 
差错交易编号 
ExpTransRecId 
[1..1] 
Exact15Text      
E 
 
7 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
--差错交易编号域填写上一次差错交易列表检索中获得的最大检索的差错交易编号。 
 
6.2.5.1.5 手工交易列表检索报文格式

---
**[p58]**

Q/CUP 054.2—2013 
54 
 
同差错交易列表检索报文格式 
6.2.5.1.6 差错/手工交易操作过程列表检索报文格式 
表37 差错/手工交易操作过程列表检索报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
差错交易代码 
ExpTransId 
[1..1] 
TransIdType      
E 
  
2 
差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
E 
  
3 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.5.1.7 凭证列表检索报文格式 
表38 凭证列表检索报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
差错交易代码 
ExpTransId 
[1..1] 
TransIdType      
E 
  
2 
差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
E 
  
3 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
6.2.5.1.8 无原吞没卡交易列表检索报文格式 
表39 无原吞没卡交易列表检索报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
本机构发起/收到 
InsSubOrRcv 
[1..1] 
Exact1Numeric     
E 
  
2 
检索结果起始时
间 
QryRsltBgnTime 
[1..1] 
YYYYMMDDhhmmssType  
E 
  
3 
检索结果结束时
间 
QryRsltEndTime 
[1..1] 
YYYYMMDDhhmmssType  
E 
  
4 
页码 
QueryPage 
[1..1] 
QueryPageType     
E 
  
5 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
P 
 
 
 
6.2.5.2 明细检索报文格式 
6.2.5.2.1 历史交易明细检索报文格式 
表40 历史交易明细检索报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
交易关键域 
TransKey 
[1..1] 
KeyType        
E 
  
2 
交易日志代码 
TransLogCd 
[1..1] 
LogCdType       
E 
  
3 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
E 
  
4 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N

---
**[p59]**

Q/CUP 054.2—2012 
 
 
55 
6.2.5.2.2 交易差错状态明细检索报文格式 
表41 交易差错状态明细检索报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
相关交易关键域 
RelatedTransKey 
[1..1] 
KeyType        
E 
  
2 
相关交易日志代
码 
RelatedLogCd 
[1..1] 
LogCdType       
E 
  
3 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.5.2.3 差错交易明细检索报文格式 
分为差错交易明细检索交易（交易标识码检索方式）和差错交易明细检索交易（流水号
检索方式）2种报文： 
1）根据差错交易代码和差错交易编号获取差错交易详细信息，适用于发起差错交易请
求，收到应答的情况； 
表42 差错交易明细检索报文格式说明（交易标识码检索方式） 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
发起日期 
SubmitDt 
[1..1] 
YYYYMMDDType     
E 
  
2 
差错交易代码 
ExpTransId 
[1..1] 
TransIdType      
E 
  
3 
差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
E 
  
4 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
2）根据请求流水号获取差错交易代码和差错交易编号，适用于发起差错交易请求，没
有收到应答的情况； 
表43 差错交易明细检索报文格式说明（流水号检索方式） 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
发起日期 
SubmitDt 
[1..1] 
YYYYMMDDType     
E 
  
2 
请求流水号 
RequestSeqNumber 
[1..1] 
SeqNumberType     
E 
  
3 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.5.2.4 手工交易明细检索报文格式 
同差错交易明细检索报文格式 
 
6.2.5.2.5 凭证获取检索报文格式 
机构通过指定凭证获取检索请求报文的类型（VouDtlQrMsg或VouDtlQrMsg2）来指定获
取凭证报文中凭证文件的格式（MTOM 或Base64 ）方式。两种类型（VouDtlQrMsg 或
VouDtlQrMsg2）报文名称不同，但格式相同。 
表44 凭证获取检索报文格式说明

---
**[p60]**

Q/CUP 054.2—2013 
56 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
差错交易代码 
ExpTransId 
[1..1] 
TransIdType      
E 
  
2 
差错交易编号 
ExpTransRecId 
[1..1] 
Exact15Text      
E 
  
3 
凭证文件编号 
VouFileId 
[1..1] 
Exact6Numeric 
E 
 
4 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
P 
 
 
6.2.6 管理及安全控制类报文接口定义 
6.2.6.1 重置用户密码报文格式 
表45 重置用户密码报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求用户新密码 
RequestNewPswd 
[1..1] 
PswdType       
N 
  
2 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
 
 
 
6.2.6.2 公告栏获取报文格式 
表46 公告栏获取报文格式说明 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
请求报文头 
ReqMsgHeader 
[1..1] 
ReqMsgHeaderType 
N 
  
 
 
6.3 应答类报文接口定义 
6.3.1 应答报文头格式 
差错服务系统对机构发出的应答类报文将包含应答报文头，格式定义如下： 
表47 应答报文头格式说明 
 
序号 
报文要素 
XML tag 
属性 
数据类型 
摘要
元素 
备注 
1 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
2 
--报文版本号 
MsgVersionCd 
[1..1] 
MsgVersionCdType   
 
  
3 
--时间戳 
ReqResTimeStamp [1..1] 
YYYYMMDDhhmmssType  
 
  
4 
--应答保留域 
RespResFld 
[0..1] 
Max20TextSpec 
 
  
5 
--应答码 
SrvRspCd 
[1..1] 
SrvRspCdType  
 
  
 
6.3.2 一般请求类、请求确认和更新类应答报文格式 
表48 发起交易类应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
差错交易编号 
ExpTransRecId 
[0..1] 
RecIdType       
 
C0 
2 
交易代码 
ExpTransId 
[0..1] 
TransIdType      
 
C0 
3 
发起日期 
SubmitDt 
[0..1] 
YYYYMMDDType     
 
C0

---
**[p61]**

Q/CUP 054.2—2012 
 
 
57 
4 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
C0 ：对于成功发起的请求类交易，差错服务系统返回差错交易编码和交易代码。 
 
6.3.3 交易检索类应答报文格式 
6.3.3.1 历史交易列表检索、相关交易列表检索和当日交易列表检索报文格式   
表49 历史列表检索交易应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
历史交易列表检索结果 
HistTransList 
[0..n] 
HistTransListType  
 
  
2 
--清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
 
  
3 
--主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
 
  
4 
--交易金额 
TransAmount 
[1..1] 
TransAmountType    
 
  
5 
--交易介质 
TransMedia 
[1..1] 
TransMediaType    
 
  
6 
--交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
 
  
7 
--交易渠道 
TransChannel 
[1..1] 
TransChannelType   
 
  
8 
--转换后交易状态 
Exact2Numeric 
[1..1] 
Exact2NumericType   
 
  
9 
--系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
 
  
10 
--差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
 
  
11 
--商户类型 
MchntTp 
[1..1] 
MchntTypeType     
 
  
12 
--商户代码 
MchntCd 
[1..1] 
MchntCdType      
 
  
13 
--终端号 
TermId 
[1..1] 
TermIdType      
 
  
14 
--商户名称地址 
MchntNameLoc 
[1..1] 
Max200TextSpec    
 
  
15 
--发卡方应答码 
IssRspCd 
[1..1] 
RespCdType      
 
  
16 
--受理方应答码 
AcqRspCd 
[1..1] 
RespCdType      
 
  
17 
--传输日期时间 
TsmDtTm 
[1..1] 
MMDDhhmmssType    
 
  
18 
--接收方清算金额 
RcvSettleAt 
[1..1] 
TransAmountType    
 
  
19 
--卡性质 
CardAttribute 
[1..1] 
CardAttributeType   
 
  
20 
--交易模式 
TransMode 
[1..1] 
Exact1Numeric     
 
  
21 
--发送机构标识码 
FwdInsIdCd 
[1..1] 
InsIdCdType      
 
  
22 
--受理机构标识码 
AcqInsIdCd 
[1..1] 
InsIdCdType      
 
  
23 
--接收机构标识码 
RcvInsIdCd 
[1..1] 
InsIdCdType      
 
  
24 
--发卡机构标识码 
IssInsIdCd 
[1..1] 
InsIdCdType      
 
  
25 
--清算发送机构标识码 
StlFwdInsIdCd 
[1..1] 
InsIdCdType      
 
  
26 
--清算接收机构标识码 
StlRcvInsIdCd 
[1..1] 
InsIdCdType      
 
  
27 
--授权码 
AuthCd 
[1..1] 
AuthCdType      
 
  
28 
--检索参考号 
RetrRefNo 
[1..1] 
RetrRefNoType     
 
  
29 
--ECI 标识 
ECI 
[1..1] 
ECIType        
 
  
30 
--凭证标识 
VouIn 
[1..1] 
VouInType       
 
  
31 
--交易关键域 
TransKey 
[1..1] 
KeyType        
 
  
32 
--交易日志代码 
TransLogCd 
[1..1] 
LogCdType

---
**[p62]**

Q/CUP 054.2—2013 
58 
 
33 
--相关交易关键域 
RelatedTransKey 
[1..1] 
KeyType        
 
  
34 
--相关交易日志代码 
RelatedLogCd 
[1..1] 
LogCdType       
 
  
35 
--差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
 
  
36 
--交易代码 
ExpTransId 
[1..1] 
TransIdType      
 
  
37 
--原交易清算日期 
OrigSettleDt 
[1..1] 
YYYYMMDDType 
 
 
38 
--原交易传输时间 
OrigTsmDtTm  
[1..1] 
MMDDhhmmssType 
 
 
39 
--原交易系统跟踪号 
OrigSysTraNumber 
[1..1] 
SysTraNumberType 
 
 
40 
总页数 
RecordPgCount 
[1..1] 
QueryPageType 
 
  
41 
当前页记录数 
CurrentPgCount 
[1..1] 
RecCountTpye     
 
  
42 
总记录数 
RecordCount 
[1..1] 
RecCountTpye     
 
  
43 
页码 
QueryPage 
[1..1] 
QueryPageType     
 
  
44 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
6.3.3.2 差错列表检索应答报文格式 
表50 差错列表检索应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
差错列表检索结果 
ExpTransList 
[0..n] 
ExpTransListType 
 
 
2 
--差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
 
 
3 
--交易代码 
ExpTransId 
[1..1] 
TransIdType      
 
 
4 
--提交机构代码 
SubmitInsIdCd 
[1..1] 
InsIdCdType      
 
 
5 
--受理机构标识码 
AcqInsIdCd 
[1..1] 
InsIdCdType      
 
 
6 
--回复机构代码 
CfmInsIdCd 
[1..1] 
InsIdCdType      
 
 
7 
--发起日期 
SubmitDt 
[1..1] 
YYYYMMDDType     
 
 
8 
--回复日期 
CfmDt 
[1..1] 
YYYYMMDDType     
 
 
9 
--原交易代码 
OrigTranId 
[1..1] 
TransIdType      
 
 
10 
--原交易清算日期 
OrigSettleDt 
[1..1] 
YYYYMMDDType     
 
 
11 
--原交易系统跟踪号 
OrigSysTraNumber 
[1..1] 
SysTraNumberType   
 
 
12 
--主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
 
 
13 
--原交易金额 
OrigTransAt 
[1..1] 
TransAmountType    
 
 
14 
--交易介质 
TransMedia 
[1..1] 
TransMediaType    
 
 
15 
--交易渠道 
TransChannel 
[1..1] 
TransChannelType   
 
 
16 
--原交易传输日期时间 
OrigTsmDtTm 
[1..1] 
MMDDhhmmssType    
 
 
17 
--终端号 
TermId 
[1..1] 
TermIdType      
 
 
18 
--交易模式 
TransMode 
[1..1] 
Exact1Numeric     
 
 
19 
--原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
 
 
20 
--回复标志 
CfmIn 
[1..1] 
FlagInType      
 
 
21 
--回复结果 
CfmRslt 
[1..1] 
FlagInType      
 
 
22 
--目标机构代码1 
TgtInstIdCd1 
[1..1] 
InsIdCdType      
 
 
23 
--目标机构代码2 
TgtInstIdCd2 
[1..1] 
InsIdCdType

---
**[p63]**

Q/CUP 054.2—2012 
 
 
59 
24 
--目标机构代码3 
TgtInstIdCd3 
[1..1] 
InsIdCdType      
 
 
25 
--差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
 
 
26 
--传输日期时间 
TsmDtTm 
[1..1] 
MMDDhhmmssType    
 
  
27 
--系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
 
 
28 
--清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
 
 
28 
--凭证标识 
VouIn 
[1..1]  
FlagInType 
 
 
29 
--差错交易处理状态 
ExpProcSt 
[1..1] 
FlagInType 
 
 
30 
--操作标识 
OperIn 
[1..1] 
FlagInType 
 
 
31 
--回复意见 
CfmDesc 
[0..1] 
Max200TextSpec    
 
  
32 
--回复备注 
CfmRemark 
[0..1] 
Max200TextSpec 
 
 
33 
--备注 
Remark 
[0..1] 
Max200TextSpec 
 
 
34 
--交易更新时间戳 
TransUpdTimeStamp 
[1..1] 
YYYYMMDDhhmmssType  
 
 
35 
--差错回复码 
ExpRspCd 
[0..1] 
Exact2Numeric     
 
 
36 
页码 
QueryPage 
[0..1] 
QueryPageType     
 
 
37 
总页数 
RecordPgCount 
[0..1] 
QueryPageType 
 
 
38 
当前页记录数 
CurrentPgCount 
[0..1] 
RecCountTpye     
 
 
39 
总记录数 
RecordCount 
[0..1] 
RecCountTpye     
 
 
40 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
6.3.3.3 手工交易列表检索应答报文格式 
表51 手工交易列表检索应答报文格式 
     
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
手工交易列表检索结果 
ManuTransList 
[0..n] 
ManuTransListType 
0 
  
2 
--传输日期和时间 
TsmDtTm 
[1..1] 
MMDDhhmmssType    
0 
  
3 
--主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
0 
  
4 
--交易类型 
ExpTransId 
[1..1] 
TransIdType      
0 
  
5 
--交易金额 
TransAmount 
[1..1] 
TransAmountType    
0 
  
6 
--交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
0 
  
7 
--商户代码 
MchntCd 
[1..1] 
MchntCdType      
0 
  
8 
--商户名称地址 
MchntNameLoc 
[1..1] 
Max200TextSpec    
0 
  
9 
--手工交易处理状态 
ManuProcSt 
[1..1] 
FlagInType      
0 
  
10 
--提交用户代码 
OperUsrId 
[1..1] 
UserNameType 
0 
  
11 
--发起时间 
OperTm 
[1..1] 
YYYYMMDDhhmmssType 
0 
  
12 
--原交易金额 
OrigTransAt 
[1..1] 
TransAmountType    
0 
  
13 
--差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
0 
  
14 
--清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
 
 
15 
--系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
 
 
16 
--凭证标识 
VouIn 
[1..1]  
FlagInType 
 
 
17 
--交易更新时间戳 
TransUpdTimeStamp 
[1..1] 
YYYYMMDDhhmmssType  
0 
 
18 
--发起日期 
SubmitDt 
[0..1] 
YYYYMMDDType

---
**[p64]**

Q/CUP 054.2—2013 
60 
 
19 
当前页记录数 
CurrentPgCount 
[1..1] 
RecCountTpye     
0 
  
20 
总记录数 
RecordCount 
[1..1] 
RecCountTpye     
0 
  
21 
页码 
QueryPage 
[1..1] 
QueryPageType     
0 
  
22 
总页数 
RecordPgCount 
[1..1] 
QueryPageType 
0 
  
23 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
6.3.3.4 凭证列表检索应答报文格式 
表52 凭证列表检索应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
总记录数 
RecordCount 
[1..1] 
RecCountTpye     
0 
  
2 
凭证列表检索结果 
VouList 
[0..n] 
VouListType  
0 
  
3 
--凭证文件名称 
VouFileName 
[1..1] 
Max30TextSpec     
0 
  
4 
--凭证文件 
VouFile 
[1..1] 
File10SizeType    
0 
  
5 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
6.3.3.5 操作过程列表检索 
表53 操作过程检索应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
操作过程检索结果 
OperList 
[0..n] 
OperListType  
 
 
2 
--操作类型 
OperTp 
[1..1] 
Max2Numeric 
 
 
3 
--操作机构代码 
OperInsIdCd 
[1..1] 
InsIdCdType      
 
 
4 
--操作用户代码 
OperUsrId 
[1..1] 
UserNameType 
 
 
5 
--操作时间 
OperTm 
[1..1] 
YYYYMMDDhhmmssType 
 
 
6 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
6.3.3.6 无原吞没卡交易列表检索 
表54 无原吞没卡交易检索应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
无原吞没卡列表检索结果 
SzCdWoHisTransList 
[0..n] 
SzCdWoHisTransType 
 
 
2 
--差错交易编号 
ExpTransRecId 
[0..1] 
Exact15Text      
 
 
3 
--交易代码 
ExpTransId 
[0..1] 
TransIdType      
 
 
4 
--提交机构代码 
SubmitInsIdCd 
[0..1] 
InsIdCdType      
 
 
5 
--发起日期 
SubmitDt 
[0..1] 
YYYYMMDDType     
 
 
6 
--吞没卡日期 
SeizeCardDt 
[0..1] 
YYYYMMDDType     
 
 
7 
--吞没卡原因码 
SeizeCardRsnCd 
[0..1] 
Exact2Numeric   
 
 
8 
--主账号 
PriAccountNumber 
[0..1] 
AccountNumberType 
 
 
9 
--目标机构代码1 
TgtInstIdCd1 
[0..1] 
InsIdCdType

---
**[p65]**

Q/CUP 054.2—2012 
 
 
61 
10 
--备注 
Remark 
[0..1] 
Max200TextSpec 
 
 
11 
页码 
QueryPage 
[0..1] 
QueryPageType     
 
 
12 
总页数 
RecordPgCount 
[0..1] 
QueryPageType 
 
 
13 
当前页记录数 
CurrentPgCount 
[0..1] 
RecCountTpye     
 
 
14 
总记录数 
RecordCount 
[0..1] 
RecCountTpye     
 
 
15 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
 
6.3.4 明细检索应答报文格式 
6.3.4.1 历史交易明细检索、相关交易明细检索和当日交易明细检索应答报文格式 
表55 历史交易明细检索应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
交易代码 
ExpTransId 
[1..1] 
TransIdType      
 
  
2 
单双转换标识 
SmsDmsConvIn 
[1..1] 
Exact1Numeric     
 
  
3 
传输日期时间 
TsmDtTm 
[1..1] 
MMDDhhmmssType    
 
  
4 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
 
  
5 
系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
 
  
6 
受理机构标识码 
AcqInsIdCd 
[1..1] 
InsIdCdType      
 
  
7 
发送机构标识码 
FwdInsIdCd 
[1..1] 
InsIdCdType      
 
  
8 
接收机构标识码 
RcvInsIdCd 
[1..1] 
InsIdCdType      
 
  
9 
发卡机构标识码 
IssInsIdCd 
[1..1] 
InsIdCdType      
 
  
10 
清算发送机构标
识码 
StlFwdInsIdCd 
[1..1] 
InsIdCdType      
 
  
11 
清算接收机构标
识码 
StlRcvInsIdCd 
[1..1] 
InsIdCdType      
 
  
12 
商户代码 
MchntCd 
[1..1] 
MchntCdType      
 
  
13 
商户名称地址 
MchntNameLoc 
[1..1] 
Max200TextSpec    
 
  
14 
商户类型 
MchntTp 
[1..1] 
MchntTypeType     
 
  
15 
终端号 
TermId 
[1..1] 
TermIdType      
 
  
16 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
 
  
17 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
 
  
18 
交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
 
  
19 
备注 
Remark 
[1..1] 
Max200TextSpec    
 
  
20 
卡种 
CardClass 
[1..1] 
CardClassType     
 
  
21 
卡性质 
CardAttribute 
[1..1] 
CardAttributeType   
 
  
22 
转出主账号 
TfrOutAcctNo 
[1..1] 
AccountNumberType 
 
  
23 
转入主账号 
TfrInAcctNo 
[1..1] 
AccountNumberType 
 
  
24 
授权码 
AuthCd 
[1..1] 
AuthCdType      
 
  
25 
授权日期 
AuthDt 
[1..1] 
MMDDType       
 
  
26 
交易渠道 
TransChannel 
[1..1] 
TransChannelType

---
**[p66]**

Q/CUP 054.2—2013 
62 
 
27 
交易介质 
TransMedia 
[1..1] 
TransMediaType    
 
  
28 
交易模式 
TransMode 
[1..1] 
Exact1Numeric     
 
  
29 
源地区代码 
SourRegCd 
[1..1] 
RegCdType       
 
  
30 
目的地区代码 
DestRegCd 
[1..1] 
RegCdType       
 
  
31 
检索参考号 
RetrRefNo 
[1..1] 
RetrRefNoType     
 
  
32 
服务点输入方式 
PosEntryMdCd 
[1..1] 
PosEntryMdCdType   
 
  
33 
服务点条件代码 
PosCondCd 
[1..1] 
PosCondCdType     
 
  
34 
发卡方应答码 
IssRspCd 
[1..1] 
RespCdType      
 
  
35 
受理方应答码 
AcqRspCd 
[1..1] 
RespCdType      
 
  
36 
原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
 
  
37 
交易状态 
OrigTranSt 
[1..1] 
Exact5Numeric     
 
  
38 
接收方状态 
TransRcvSt 
[1..1] 
Exact1Numeric  
 
  
39 
发送方状态 
TransFwdSt 
[1..1] 
Exact1Numeric  
 
  
40 
ECI 标识 
ECI 
[1..1] 
ECIType        
 
  
41 
代授权标识 
StiIn 
[1..1] 
FlagInType      
 
  
42 
子商户代码 
SubMchntCd 
[1..1] 
SubMchntCdType    
 
  
43 
物流配送标识 
LogisticId 
[1..1] 
LogisticIdType    
 
  
44 
凭证文件标识 
VouIn 
[1..1] 
VouInType       
 
  
45 
特殊计费类型 
SpeFeeTpId 
[1..1] 
Exact2Text 
 
 
46 
特殊计费档次 
SpeFeeClsId 
[1..1] 
Exact1Text 
 
 
47 
原交易清算日期 
OrigSettleDt 
[1..1] 
YYYYMMDDType 
 
 
48 
原交易传输时间 
OrigTsmDtTm  
[1..1] 
MMDDhhmmssType 
 
 
49 
原交易系统跟踪
号 
OrigSysTraNumber  
[1..1] 
SysTraNumberType 
 
 
50 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
6.3.4.2 交易差错状态明细检索应答报文格式 
表56 原交易状态检索应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
查询标识 
InqIn 
[1..1] 
FlagInType      
 
  
2 
调单标识 
RetrlIn 
[1..1] 
FlagInType      
 
  
3 
贷记调整标识 
CredAdjIn 
[1..1] 
FlagInType      
 
  
4 
请款标识 
DebAdjIn 
[1..1] 
FlagInType      
 
  
5 
退单标识 
ChrgbakIn 
[1..1] 
FlagInType      
 
  
6 
对贷记调整的请款
标识 
CadjDadjIn 
[1..1] 
FlagInType      
 
  
7 
对请款的退单标识 
DadjChrgbakIn 
[1..1] 
FlagInType      
 
  
8 
再请款标识 
ReChrgbakIn 
[1..1] 
FlagInType      
 
  
9 
二次退单标识 
ReptIn 
[1..1] 
FlagInType

---
**[p67]**

Q/CUP 054.2—2012 
 
 
63 
10 
单边账标识 
UnFitBillIn 
[1..1] 
FlagInType      
 
  
11 
手工退货标识 
RefundIn 
[1..1] 
FlagInType      
 
  
12 
二次查询标识 
SecInqIn 
[1..1] 
FlagInType      
 
  
13 
吞没卡标识 
SeizeCardIn 
[1..1] 
FlagInType      
 
  
14 
交易关键域 
RelatedTransKey 
[1..1] 
KeyType        
 
  
15 
交易日志代码 
RelatedLogCd 
[1..1] 
LogCdType       
 
  
19 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
6.3.4.3 差错明细检索应答报文格式 
1）根据差错交易代码和差错交易编号获取差错交易详细信息的应答报文格式，适用于
发起差错交易请求，收到应答的情况； 
表57 差错明细检索应答报文格式（交易标识码检索方式） 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元
素 
备注 
1 
差错交易代码 
ExpTransId 
[1..1] 
TransIdType      
 
  
2 
差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
 
  
3 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
 
  
4 
转入主账号 
TfrInAcctNo 
[1..1] 
AccountNumberType 
 
  
5 
商户代码 
MchntCd 
[1..1] 
MchntCdType      
 
  
6 
终端号 
TermId 
[1..1] 
TermIdType      
 
  
7 
差错交易金额 
ExpTransAt 
[1..1] 
TransAmountType    
 
  
8 
交易发起方式 
TransSubMode 
[1..1] 
TransSubModeType   
 
  
9 
发起日期 
SubmitDt 
[1..1] 
YYYYMMDDType     
 
  
10 
原交易清算日期 
OrigSettleDt 
[1..1] 
YYYYMMDDType 
 
  
11 
原交易系统跟踪号 
OrigSysTraNumber 
[1..1] 
SysTraNumberType   
 
  
12 
原交易传输日期时间 
OrigTsmDtTm 
[1..1] 
MMDDhhmmssType    
 
  
13 
发送机构标识码 
FwdInsIdCd 
[1..1] 
InsIdCdType      
 
  
14 
受理机构标识码 
AcqInsIdCd 
[1..1] 
InsIdCdType      
 
  
15 
目标机构代码1 
TgtInstIdCd1 
[1..1] 
InsIdCdType      
 
  
16 
目标机构代码2 
TgtInstIdCd2 
[1..1] 
InsIdCdType      
 
  
17 
目标机构代码3 
TgtInstIdCd3 
[1..1] 
InsIdCdType      
 
  
18 
目标机构代码4 
TgtInstIdCd4 
[1..1] 
InsIdCdType      
 
  
19 
目标机构代码5 
TgtInstIdCd5 
[1..1] 
InsIdCdType      
 
  
20 
差错交易原因码 
CuexpTranRsnCd 
[1..1] 
RsnCdType       
 
  
21 
最后回复日期 
CfmDeadline 
[1..1] 
YYYYMMDDType     
 
  
22 
回复标识 
CfmIn 
[1..1] 
FlagInType      
 
  
23 
回复机构标识码 
CfmInsIdCd 
[1..1] 
InsIdCdType      
 
  
24 
回复日期 
CfmDt 
[1..1] 
YYYYMMDDType     
 
  
25 
回复结果 
CfmRslt 
[1..1] 
FlagInType      
 
  
26 
回复TC 信息 
ConfirmTcInfo 
[1..1] 
Max16TextSpec

---
**[p68]**

Q/CUP 054.2—2013 
64 
 
27 
商户名称地址 
MchntNameLoc 
[1..1] 
Max200TextSpec    
 
  
28 
回复意见 
CfmDesc 
[1..1] 
Max200TextSpec    
 
  
29 
传输日期时间 
TsmDtTm 
[1..1] 
MMDDhhmmssType    
 
  
30 
系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
 
  
31 
备注 
Remark 
[0..1] 
Max200TextSpec    
 
O 
32 
ECI 标识 
ECI 
[0..1] 
ECIType        
 
O 
33 
子商户代码 
SubMchntCd 
[0..1] 
SubMchntCdType    
 
O 
34 
物流配送标识 
LogisticId 
[0..1] 
LogisticIdType    
 
O 
35 
商户URL 
MchntURL 
[0..1] 
Max100TextSpec    
 
O 
36 
展期标识 
ExtIn 
[1..1] 
FlagInType 
 
  
37 
提交机构代码 
SubmitInsIdCd 
[1..1] 
InsIdCdType      
 
  
38 
凭证标识 
VouIn 
[1..1]  
FlagInType 
 
 
39 
差错交易处理状态 
ExpProcSt 
[1..1] 
FlagInType 
 
 
40 
操作标识 
OperIn 
[1..1] 
FlagInType 
 
 
41 
回复备注 
CfmRemark 
[0..1] 
Max200TextSpec 
 
 
42 
特殊计费类型 
SpeFeeTpId 
[1..1] 
Exact2Text 
 
 
43 
特殊计费档次 
SpeFeeClsId 
[1..1] 
Exact1Text 
 
 
44 
相关交易关键域 
RelatedTransKey 
[1..1] 
KeyType        
 
  
45 
相关交易日志代码 
RelatedLogCd 
[1..1] 
LogCdType       
 
  
46 
差错回复码 
ExpRspCd 
[0..1] 
Exact2Numeric     
N 
 
47 
交易更新时间戳 
TransUpdTimeS
tamp 
[1..1] 
YYMMDDhhmmssType 
 
 
48 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
2）根据请求流水号获取差错交易代码、差错交易编号和发起日期，适用于发起差错交
易请求，没有收到应答的情况； 
表58 差错明细检索应答报文格式（流水号检索方式） 
 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
差错交易代码 
ExpTransId 
[1..1] 
TransIdType      
 
  
2 
差错交易编号 
ExpTransRecId 
[1..1] 
RecIdType       
 
  
3 
发起日期 
SubmitDt 
[1..1] 
YYYYMMDDType     
 
  
4 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
6.3.4.4 手工交易明细检索应答报文格式 
1）根据手工交易代码和手工交易编号获取差错交易详细信息的应答报文格式，适用于
发起手工交易请求，收到应答的情况； 
表59 手工交易明细检索应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元
素 
备注 
1 
差错交易编号 
RecordCount 
[1..1] 
RecCountTpye

---
**[p69]**

Q/CUP 054.2—2012 
 
 
65 
2 
主账号 
PriAccountNumber 
[1..1] 
AccountNumberType 
 
  
3 
商户代码 
MchntCd 
[1..1] 
MchntCdType      
 
  
4 
商户名称 
MchntNameLoc 
[1..1] 
Max200TextSpec    
 
  
5 
商户类型 
MchntTp 
[1..1] 
MchntTypeType     
 
  
6 
受理机构标识码 
AcqInsIdCd 
[1..1] 
InsIdCdType      
 
  
7 
发送机构标识码 
FwdInsIdCd 
[1..1] 
InsIdCdType      
 
  
8 
发卡机构标识码 
IssInsIdCd 
[1..1] 
InsIdCdType      
 
  
9 
接收机构标识码 
RcvInsIdCd 
[1..1] 
InsIdCdType      
 
  
10 
原交易状态 
OrigTranSt 
[1..1] 
Exact5Numeric     
 
  
11 
原交易清算日期 
OrigSettleDt 
[1..1] 
 YYYYMMDDType 
 
  
12 
原交易代码 
OrigTranId 
[1..1] 
TransIdType      
 
  
13 
授权码 
AuthCd 
[1..1] 
AuthCdType      
 
  
14 
原交易金额 
OrigTransAt 
[1..1] 
TransAmountType    
 
  
15 
原交易传输日期时间 
OrigTsmDtTm 
[1..1] 
MMDDhhmmssType    
 
  
16 
原交易系统跟踪号 
OrigSysTraNumber 
[1..1] 
SysTraNumberType   
 
  
17 
操作用户代码 
OperUsrId 
[1..1] 
UserNameType 
 
  
18 
手工交易处理状态 
ManuProcSt 
[1..1] 
FlagInType      
 
  
19 
交易代码 
ExpTransId 
[1..1] 
TransIdType      
 
  
20 
交易金额 
TransAmount 
[1..1] 
TransAmountType    
 
  
21 
终端号 
TermId 
[1..1] 
TermIdType      
 
  
22 
备注 
Remark 
[1..1] 
Max200TextSpec    
 
  
23 
清算日期 
SettleDt 
[1..1] 
YYYYMMDDType     
 
 
24 
传输日期时间 
TsmDtTm 
[1..1] 
MMDDhhmmssType    
 
 
25 
系统跟踪号 
SysTraNumber 
[1..1] 
SysTraNumberType   
 
 
26 
凭证标识 
VouIn 
[1..1]  
FlagInType 
 
 
27 
特殊计费类型 
SpeFeeTpId 
[1..1] 
Exact2Text 
 
 
28 
特殊计费档次 
SpeFeeClsId 
[1..1] 
Exact1Text 
 
 
29 
交易更新时间戳 
TransUpdTimeSta
mp 
[1..1] 
YYMMDDhhmmssType 
 
 
30 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
2）根据请求流水号获取手工交易代码、手工交易编号和发起日期，适用于发起手工交
易请求，没有收到应答的情况； 
表60 手工交易明细检索应答报文格式（流水号检索方式） 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
差错交易代码 
ExpTransId 
[0..1] 
TransIdType      
 
  
2 
差错交易编号 
ExpTransRecId 
[0..1] 
Exact15Text      
 
  
3 
发起日期 
SubmitDt 
[0..1] 
YYYYMMDDType     
 
  
4 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
6.3.4.5 凭证获取检索应答报文格式

---
**[p70]**

Q/CUP 054.2—2013 
66 
 
银联差错服务系统根据机构指定的凭证获取检索请求报文的类型（VouDtlQrMsg或
VouDtlQrMsg2）来确定凭证获取检索应答报文中凭证文件的格式（MTOM或Base64）。应答报
文的类型也与请求的一致，如请求报文为VouDtlQrMsg，银联差错服务系统认为机构需要MTOM
方式的凭证，则报文域中的凭证文件域中填写MTOM方式的引用地址，应答报文为名称为
VouDtlQrRspMsg；如请求报文为VouDtlQrMsg2，银联差错服务系统认为机构需要Base64方式
的凭证，则报文域中的凭证文件域中填写文件的Base64二进制编码，应答报文为名称为
VouDtlQrRspMsg2。 
表61 凭证获取检索应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
凭证文件名称 
VouFileName 
[0..1] 
Max30TextSpec     
 
  
2 
凭证文件大小 
VouFileSize 
[0..1] 
Max8Numeric      
 
 
3 
凭证文件编号 
VouFileId 
[0..1] 
Exact6Numeric 
 
  
4 
凭证文件 
VouFile 
[0..1] 
File10SizeType   
 
 
5 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
6.3.5 管理及安全控制类应答报文格式 
 
6.3.5.1  重置用户密码应答报文格式 
表62 重置用户密码应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType 
 
 
 
 
6.3.5.2  公告栏获取应答报文格式 
表63 公告栏获取应答报文格式 
 
序号 报文要素 
XML tag 
属性 
数据类型 
摘要元素 
备注 
1 
公告栏内容 
Bulletin 
[1..1] 
Max5000Text 
 
  
2 
应答报文头 
ResMsgHeader 
[1..1] 
ResMsgHeaderType

---
**[p71]**

Q/CUP 054.2—2012 
 
 
67 
附 录 A 
（规范性附录） 
标准代码定义 
本附录的内容将根据银联差错服务系统信息不断增删，更新版本。 
A.1 应答码 
联网机构在收到银联差错服务系统应答码时，其含义参照下表。 
 
表 A.27  按序号排列的应答码表 
代码 
 含义 
0000 
 成功 
0110 
成功登陆，密码将在一个月内过期 
0111 
成功登陆，证书将在一个月内过期 
0200 
成功收到请求，交易处理中 
1000 
报文不可解析 
1001 
报文头错误 
1002 
报文体格式错误 
2001 
没有查找到相应的差错原因码期限参数 
2002 
原因码和交易代码不匹配 
2003 
差错交易发起时间已经超过差错交易原因码期限限制 
2004 
清算日期数据有误，无法生成正确的SQL 语句 
2005 
方法调用者设置的SQL 组装类型和调用的方法不匹配, 
2006 
非转帐原交易查询SQL 组装中，清算日期必须输入 
2007 
非转帐原交易查询SQL 组装中，主账号必须输入 
2008 
转出原交易查询SQL 组装中，转出主账号必须输入 
2009 
转入原交易查询SQL 组装中，转入主账号必须输入 
2010 
差错工作表记录查找失败, 
2011 
历史清算明细表记录查找失败, 
2012 
差错贷记调整交易已提交,不能重复提交 
2013 
差错请款交易已提交,不能重复提交 
2014 
差错退单交易已提交,不能重复提交 
2015 
差错再请款交易已提交,不能重复提交 
2016 
差错二次退单交易已提交,不能重复提交 
2017 
差错对贷记调整的请款交易已提交,不能重复提交 
2018 
差错对请款的退单交易已提交,不能重复提交 
2019 
贷记调整尚未生效,无法对贷调做请款 
2020 
请款尚未生效无法对请款作退单 
2021 
差错贷记调整交易已生效,不能再次提交 
2022 
差错请款交易已生效,不能再次提交 
2023 
差错退单交易已生效,不能再次提交

---
**[p72]**

Q/CUP 054.2—2013 
68 
 
2024 
差错再请款交易已生效,不能再次提交 
2025 
差错二次退单交易已生效,不能再次提交 
2026 
差错对贷记调整的请款交易已生效,不能再次提交 
2027 
差错对请款的退单交易已生效,不能再次提交 
2028 
对方已退单,不能再提交贷记调整 
2029 
对方已贷记调整,不能再退单 
2030 
已做过手工退货的交易不能再进行调帐 
2031 
已做过调帐的交易不能再手工退货 
2032 
原交易已过了提交差错的期限 
2033 
借记卡尚未查询不能退单 
2034 
请款已生效不能对原交易做退单 
2035 
借记卡确认查询尚未回复不能退单 
2036 
借记卡确认查询结果不同意退单 
2037 
再输入交易失败 
2038 
文件装载差错交易被拒绝，可参看拒绝原因码 
2039 
做过贷记调整了,不能做请款 
2040 
作过请款了,不能做贷记调整 
2041 
SQL 语句执行错误 
2042 
文件不存在 
2043 
打开文件错误 
2044 
文件格式错误 
2045 
插入临时表失败 
2046 
文件装载错误 
2047 
差错金额填写错误，不能超过原交易 
2048 
差错交易金额应为正数 
2049 
原因码填写有错误，交易已进行过查询，不是直接调单 
2050 
原因码填写有错误，交易尚未进行过查询，不是查询后调单 
2051 
原因码填写有错误，商户地址查询未发起、仍在查复 
期内或已被查复 
2052 
确认查询回复有误，调TC 却没有回复TC 值 
2053 
对请款有疑问退单需要上传文件 
2054 
调单回复不同意退单要上传凭证 
2055 
请款交易需要上传证明文件 
2056 
再请款交易需要上传证明文件 
2057 
二次退单交易需要上传证明文件 
2058 
现金类交易不能对再请款发起二次退单 
2059 
对方已退单,不能请款,请进行再请款 
2060 
查询过期未回复无权再请款 
2061 
调单过期未回复无权再请款 
2062 
找不到转帐交易的另一笔原交易 
2063 
找不到原交易 
2064 
获取机构类型失败

---
**[p73]**

Q/CUP 054.2—2012 
 
 
69 
2065 
查询已提交不能再查询 
2066 
不能回复，原查询未提交 
2067 
查询已回复，不能重复回复 
2069 
托收回复已展期，不能重复展期 
2071 
已过期，不能展期 
2072 
借记卡不允许请款 
2073 
借记卡不允许再请款 
2074 
借记卡不允许二次退单 
2075 
获取目标机构失败 
2076 
原交易不是转帐交易 
2077 
调单未回复，不能重复发起 
2078 
调单过期未回复，不能重复发起 
2079 
调单请求已经回复，不能重复回复 
2080 
未发起该调单请求，不能回复 
2081 
调单请求已经回复，不能重复回复 
2082 
单边帐已提交，不能重复发起 
2083 
单边帐已回复，不能重复回复 
2084 
不能添加吞没卡信息 
2085 
不能隐藏吞没卡信息 
2086 
找不到例外标识 
2087 
找不到相关信息 
2088 
例外协商交易已经回复，不能重复回复 
2089 
差错交易已经复核过不能再次复核 
2090 
差错交易已经双复核过不能再次双复核 
2091 
不能执行指定的SQL 语句 
2092 
计算最后处理日期错误 
2093 
调单已提交，不能再次提交 
2094 
系统未知错误,差错交易操作失败 
2095 
机构基本表访问失败 
2096 
读取机构基本表访问结果集失败 
2097 
提交机构和接收机构不能是同一家机构 
2098 
提交机构和接收机构的总行不能是同一家机构 
2099 
无法确定差错交易的接收或发送方，交易被拒绝 
2100 
差错交易已做过，交易被拒绝 
2101 
发起方不允许作该交易 
2102 
交易接收方不允许接收该交易 
2103 
差错交易已经被删除不能再进行其他操作 
2104 
原因码使用错误，普通交易不能使用网上CupSecure 
专用原因码 
2105 
原因码使用错误,凭密交易不能使用原因码4515 
2107 
无法对余额查询进行退单 
2108 
对该交易的没收卡已经提交待复核，不能再次提交 
2109 
对该交易的没收卡已经生效，不能再次提交

---
**[p74]**

Q/CUP 054.2—2013 
70 
 
2110 
已经提交了两次查询，不允许再次提交查询 
2111 
已提交了调单不允许再作查询 
2112 
二次查询只能使用固定的原因码6340 
2113 
非二次查询，原因码不能为6340 
2114 
当原因码为不为6300 和6301 时，必须查复应答码 
2115 
该笔交易无法进行后续差错处理 
2116 
获取吞没卡收付费交易失败 
2117 
获取托收回复例外长款交易失败 
2118 
托收协商已经回复了，不允许再进行展期或回复 
2119 
6308 是IC 卡专用原因码 
2120 
只有受理方、发送方或其代理机构可以没收卡片 
2121 
不能撤销没收卡片奖励费，请直接撤销吞没卡交易 
2122 
内卡差错平台已经不再允许对跨境交易发起差错，请到 
跨境差错平台提交 
2123 
借记卡未经调单，不能以当前原因码退单 
2124 
借记卡查询期限内,不能以当前原因码退单 
2125 
信用卡未经调单，不能以当前原因码退单 
2126 
信用卡未经确认查询，不能以当前原因码发起退单 
2127 
信用卡确认查询未回复，不能以当前原因码发起退单 
2128 
信用卡查询结果不同意退单，不能以当前原因码发 
起退单 
2129 
该原因码对应的交易必须是成功被撤销的交易 
2130 
该原因码对应的交易必须是成功被冲正的交易 
2131 
该原因码对应的交易必须是成功的交易 
2132 
系统中不存在对应的原交易手续费代码 
2133 
大额封顶类商户的退货交易不能提交请款 
2134 
系统无法处理您提交的操作，请稍后再试 
2135 
当前交易状态不能做删除 
2136 
当前交易状态不能做撤销 
2137 
交易已经做过机构地区代码不规范退单，不能重复发起 
2138 
交易已经做过商户类别不规范退单，不能重复发起 
2139 
不能对惩罚性退单做再请款 
2142 
确认查询回复码04 退单原因码4527 的交易不能做再请款 
2143 
目前无法查找到原交易，请稍后再试 
2144 
对于已用6345 原因码发起调单的交易不能使用原因码4527 
进行退单 
2145 
发起机构无可清算的一级机构，请联系自己总行或所属 
银联分公司处理 
2146 
接收机构无可清算的一级机构，请联系接收机构总行或其 
所属银联分公司处理 
2147 
获取机构版本信息出错 
2148 
获取机构所属可用转接子系统出错

---
**[p75]**

Q/CUP 054.2—2012 
 
 
71 
2149 
查询转接子系统的状态信息出错 
2150 
更新差错日志表发送差错通知报文状态失败 
2151 
组装字节数组的报文头出错 
2152 
组装字节数组的报文体出错 
2153 
转接返回的报文体没有应答码 
2154 
解析转接返回的字节流响应报文出错 
2155 
解析字节流响应报文头为空或长度不符合要求 
2156 
该预授权交易不是成功的交易 
2157 
发送差错报文报错 
2158 
组装差错报文报错 
2159 
记录格式错误 
2160 
找不到原交易 原始交易信息有误 
2161 
原始交易是失败的交易 
2162 
原始交易已被撤销或冲正 
2163 
超过差错提交时限 
2164 
重复提交差错请求 
2165 
非法原因码 
2166 
提交机构无权提交该差错请求 
2167 
非法差错金额 
2168 
对方已退单，不得发起贷记调整 
2169 
已发起请款，不得发起贷记调整 
2170 
对方已贷调，不能退单 
2171 
借记卡未查询或不同意退单 
2172 
找到多笔原交易 
2173 
差错交易与原交易主帐号信息不一致 
2174 
原交易清算日期填写不正确 
2175 
新机构代码对应多个旧机构代码，无法继续 
查找，找不到原交易 
2176 
交易货币代码与原交易不一致 
2177 
接收机构没有权限做该交易 
2178 
本退单原因码须上传凭证文件，不适合批量提交，请 
到页面手工录入 
2179 
无效的提交机构代码 
2180 
无效的接收机构代码 
2181 
吞卡时间有误 
2182 
销毁时间有误 
2183 
原交易是成功交易不能提交吞没卡 
2184 
用6345 调单的交易不能用4527 请款 
2185 
信用卡未查询或不同意退单 
2186 
其他 
2187 
跨境交易不能在内卡差错平台上做 
4001 
无法获取数据操作服务DAO,请检查服务是否正确部署 
4002 
无法获取序列号生成服务,请检查服务是否正确部署

---
**[p76]**

Q/CUP 054.2—2013 
72 
 
4003 
无法获取公共服务,请检查服务是否正确部署 
4004 
无法访问原交易状态表 
4005 
更新原交易状态表失败 
4006 
原交易状态表添加记录失败 
4007 
操作过程表添加失败 
4008 
差错工作表添加记录失败 
4009 
差错工作表更新失败 
4010 
获取交易过期限制参数失败 
4011 
前后台更新接口填写错误 
4012 
内部日期接口起止日期填写错误 
4013 
插入凭证信息失败 
4014 
插入差错交易日志失败 
4015 
访问期限分段值表失败 
4016 
访问机构关系表未上收分公司代码失败 
4017 
读取未上收分公司代码结果集失败 
4018 
访问接收机构表/发送机构表失败 
4019 
读取接收机构表/发送机构表访问结果集失败 
4020 
接口错误,交易提交机构代码为空 
4021 
接口错误,交易接收机构代码为空 
0300 
请求流水号重复，请先按流水号查询差错交易 
9000 
系统超时 
9001 
调用失败根据主键取得的记录多于一条 
9002 
根据主键取得的记录多于一条 
9003 
不能取下一个值 
9004 
不能删除具有除内卡差错和跨境差错之外子系统权限的用户 
9005 
要查询的子系统既非内卡又非跨境 
9006 
查询到的用户个数不为1 
9007 
要改权限的子系统既非内卡又非跨境 
9008 
直接插入LDAP 参数传入有误 
9009 
插入LDAP 信息出错 
9010 
修改用户LDAP 信息出错 
9011 
删除用户LDAP 信息出错 
9012 
新增删除修改传入参数有误 
9013 
前台传入参数有误 
9014 
只有未复核的记录才能复核 
9015 
复核被系统拒绝，请核查 
9016 
查询有误 
9017 
双复核被系统拒绝，请核查直接生效时,复核被系统拒绝，请核查 
9018 
直接生效时,复核被系统拒绝，请核查 
9019 
数据库中参数错误 
9020 
只有复核通过的记录才能双复核 
9021 
插入管理日志时，传入参数有误

---
**[p77]**

Q/CUP 054.2—2012 
 
 
73 
9022 
删除参数时，插入管理日志表参数传递有误，请确认 
9023 
增加参数时，插入管理日志表参数传递有误，请确认 
9024 
更新参数时，插入管理日志表参数传递有误，请确认 
9025 
复核参数时，插入管理日志表参数传递有误，请确认 
9026 
双复核参数时，插入管理日志表参数传递有误，请确认 
9027 
无法获取手工交易工作表的记录编号 
9028 
无法获取转账标识 
9029 
无法判断更新受理方还是发卡方应答码 
9030 
系统异常，清算日期不正确 
9031 
数据操作异常 
9032 
托收金额字段小数点后面只能有两位数字 
9033 
输入的托收金额格式不正确 
9034 
原交易的状态信息有误，不允许发起托收协商 
9035 
余额查询无法执行该操作 
9036 
冲正类无法执行该操作 
9037 
撤销类交易无法执行该操作 
9038 
该笔无卡支付先行垫付交易银联已经审核通过，机构无法做撤销 
9039 
撤销失败 
9040 
登陆超时，请重新登陆 
9041 
清算日期在180 天内，请从历史交易发起查询 
9042 
清算日期超过了360 天的期限 
9043 
该交易还未清算，请核对数据后重新录入 
9044 
请选择正确的原因码 
9045 
证书丢失 
9046 
数据签名验证出错 
9047 
不能对这笔历史交易发此类差错 
9048 
原交易的状态信息有误，不允许发起差错 
9049 
贷调原交易非代付或代付确认，不允许发起请款 
9050 
非IC 卡类交易请使用其它原因码 
9051 
销毁日期应大于等于吞卡日期 
9052 
查询记录数超过1000 条，请缩短清算日期或交易传输时间日期 
9053 
不是展期的请求 
9054 
交易已撤销或交易未生效，无法撤销 
9055 
文件路径为空 
9056 
交易状态不正确，无法发起手工汇款交易 
9057 
帐户验证交易状态无法发起手工汇款 
9058 
目标机构不支持手工汇款交易 
9059 
帐户验证交易已作过联机汇款，无法再作手工汇款 
9060 
交易时限不在范围内，不能发起延期手工预授权完成 
9061 
无权限发起该笔交易的MOTO 手工预授权完成 
9062 
交易不能做MOTO 手工预授权完成 
9063 
无权限发起该笔交易的手工自助预授权完成 
9064 
交易不能做手工自助预授权完成

---
**[p78]**

Q/CUP 054.2—2013 
74 
 
9065 
无权限发起该笔交易的手工退货 
9066 
交易不能做手工退货 
9067 
无法找到SQL 语句 
9068 
系统异常 
9069 
数据遗失 
9070 
无法得到数据 
9071 
查询用户权限信息出错 
9072 
无此权限 
9073 
从工作表中查询数据失败 
9074 
上传凭证有问题 
9075 
获取后台服务失败 
9076 
同意付款时托收金额必须等于原交易金额 
9077 
请至少选中一笔交易 
9078 
无该用户信息 
9079 
角色数据为空 
9080 
权限数据为空 
9081 
上传文件失败 
9082 
报文域取值非法 
9083 
原交易不可做差错处理 
9084 
原因码不能用于确认查询 
9085 
原因码不能用于调单 
9086 
差错交易代码不正确 
9087 
不支持该类交易的双复核撤销 
9088 
该交易不是（双）复核通过交易 
9089 
不支持该类渠道的双复核撤销 
9090 
原交易不支持双复核撤销 
9091 
该交易已被删除或撤销 
9092 
原交易未生效,请先完成复核 
9093 
原交易的状态信息有误，不允许发起托收协商、例外协商或例外长款 
9094 
例外长款只能从成功清算的交易发起 
9095 
行行通交易不能发起例外长款交易 
9096 
您没有权限发起例外交易 
9097 
贷调原交易非存款或存款确认，不允许发起托收协商 
9098 
您无权限发起该笔交易的托收协商 
9099 
凭证文件必须上传 
9100 
该交易是未超过60 天的信用卡交易，请优先考虑进行请款操作 
9101 
备注必须填写 
9102 
证书异常 
9103 
本退单原因码要求报送欺诈交易，您没有报送权限。请联系风控人员
报送欺诈交易并获取欺诈交易报告序列号后再发起退单 
9104 
风险报告管理系统不能访问，请确认交易已报送欺诈，获取欺诈交易
报告序列号并在退单时填入备注

---
**[p79]**

Q/CUP 054.2—2012 
 
 
75 
9105 
对于[本机构发出]，[本机构收到]复选框，请至少选择一个 
9106 
预授权完成金额不能超过原交易金额的115% 
9107 
交易已经发起过延期预授权完成 
9108 
不能用此原因码对该历史交易发起差错，或已超出原因码期限 
9109 
访问用户权限暂存表出错 
9110 
信息丢失 
9111 
托收金额必须小于原交易金额 
9112 
找不到对应的当日交易 
9113 
任务删除用户信息时出错 
9114 
在复核信息时，传入参数错误 
9115 
系统错误 
9116 
业务管委秘书处只能是00010000 的机构用户 
9117 
您输入的权限信息有误，请核对 
9118 
输入的证书已经被使用，请重新输入证书编号 
9119 
输入证书有误 
9120 
下载失败 
9121 
请选择需要删除记录 
9122 
查询操作过程表有误 
9123 
找不到对应的发送/接收机构信息 
9124 
计算当季度Left Table 失败 
9125 
没有查询到历史交易 
9126 
查询历史库失败 
9127 
找不到对象 
9128 
主键丢失 
9129 
计算日期间隔错误 
9130 
差错回复码表没有相关记录 
9131 
系统异常，机构长度位添加失败 
9132 
没有选择任何操作 
9133 
没有查询未生效用户信息的权限 
9134 
读取手工交易记录失败 
9135 
非法的欺诈类型 
9136 
非法的欺诈调查状态 
9137 
非法的POS 终端类型 
9138 
该交易不能做手工预授权完成 
9139 
无权限发起该笔交易的MOTO 手工预授权撤销 
9140 
无权限发起该笔交易的自助手工预授权撤销 
9141 
无权限发起该笔交易的手工预授权撤销 
9142 
欺诈交易已存在，请直接发起退单 
9143 
请求报文账号与原交易账号不符 
9144 
请求报文清算日期与原交易清算日期不符 
9145 
请求报文交易金额与原交易交易金额不符 
9146 
金额转换错误 
9147 
差错交易、手工类交易均未找到

---
**[p80]**

Q/CUP 054.2—2013 
76 
 
9148 
必须填写托收金额 
9149 
未查到该凭证文件记录 
9150 
读取凭证文件内容失败 
9151 
历史清算明细中有数据为空值，请核查后重新提交吞没卡交易 
9152 
吞卡无相应的发卡方应答码，不能提交吞没卡交易 
9153 
没收卡无相应的发卡方应答码，不能提交吞没卡交易 
9154 
原交易状态不正确，不能提交吞没卡交易 
9155 
原交易为转入类交易时，请求报文账号必须同于原交易转入账号 
9201 
原交易与当前用户机构无关 
9202 
不支持此方法 
9203 
历史交易的交易代码不正确 
9204 
手工交易的状态不是已生效 
9205 
手工交易的提交机构不是当前用户机构 
9206 
手工交易的交易代码不正确 
9207 
历史交易不是成功交易 
9208 
差错交易的目标机构不是当前用户机构 
9209 
差错交易的交易代码不正确 
9210 
差错交易已经被回复 
9211 
差错交易已经被隐藏 
9212 
差错交易状态不是已生效或已清算 
9213 
差错交易的原因码是9710 
9214 
差错交易的提交机构不是当前用户机构 
9215 
差错交易状态不是已复核通过 
9216 
差错交易的操作标志不是正常 
9217 
差错交易的审核机构不是当前用户机构 
9218 
差错交易状态不是已审核通过 
9219 
无卡垫付交易请通过差错平台页面经办 
9220 
读取公告栏出错 
9221 
请求流水号表新增记录出错 
9222 
找不到请求流水表记录 
9223 
找不到差错交易 
9224 
找不到历史交易 
9225 
找不到手工交易 
9226 
找不到原交易状态表记录 
9227 
该交易已经发起过延期预授权完成 
9228 
该授权被冲正（撤销/完成/失败），您不能在此提交延期预授权完成请
求 
9229 
该授权仍在30 天授权有效期内或已超过60 天，您不能在此提交延期
预授权完成请求 
9230 
发送机构为双信息方式，不得提交单信息交易 
9231 
您无权限发起该笔交易的MOTO 延期预授权完成 
9232 
该交易不能发起MOTO 延期预授权完成，接收机构未开通此类交易

---
**[p81]**

Q/CUP 054.2—2012 
 
 
77 
9233 
您无权限发起该笔交易的自助延期预授权完成 
9234 
该交易不能发起自助延期预授权完成，接收机构未开通此类交易 
9235 
您无权限发起该笔交易的延期手工预授权完成 
9236 
该交易不能发起延期手工预授权完成，接收机构未开通此类交易 
9237 
错误码:数据校验失败 
9238 
错误码:权限校验失败 
9239 
错误码:数据记录不存在 
9240 
错误码:数据记录已经存在 
9241 
错误码：数据记录添加失败 
9242 
错误码: 当前状态不允许该操作 
9243 
错误码: 数据记录更新失败 
9244 
错误码: 数据记录删除失败 
9245 
错误码: 数据记录撤销失败 
9246 
错误码: 数据记录复核失败 
9247 
错误码: 数据记录审核失败 
9248 
错误码: 无效状态 
9249 
错误码: 未知错误 
9250 
错误码:  原始交易状态不符合该操作 
9251 
错误码:  用来填入错误信息 
9252 
交易代码不合法 
9253 
未知的交易代码 
9254 
原始交易状态不符合当前交易所需的条件 
9255 
当前交易金额超出了授权金额 
9256 
当前登录机构没有权限做该交易 
9257 
当前主帐号不是合法的帐号 
9258 
当前批次状态不符合当前交易所需的条件, 要求'00' 
9259 
当前交易日期不符合当前交易所需的条件 
9260 
当前退货交易找不到退货手续费 
9261 
原始交易不是一个成功的交易, 或者已经对它做过相关的差错处理 
9262 
接收机构没有权限做该交易 
9263 
当前交易金额超出了指定的最大限制金额 
9264 
当前清算日期与原始交易清算日期不超过180 天, 不能做当前交易 
9265 
当前清算日期与原始交易清算日期超过了180 天, 不能做当前交易 
9266 
当前交易金额超出了原始交易金额 
9267 
当前日期已超过帐户验证交易的期限了 
9268 
该笔帐户验证交易已作过手工汇款交易 
9269 
积分消费和分期付款交易的退货金额必须与原交易金额一致 
9270 
该交易已经发起过延期预授权完成 
9271 
当日交易与当前用户机构无关 
9272 
查询当日交易记录出错 
9273 
当日交易的交易代码不正确 
9274 
当日交易不是成功交易 
9275 
请求报文中的提交日期域与交易提交日期不符

---
**[p82]**

Q/CUP 054.2—2013 
78 
 
9276 
用户机构不是交易回复机构 
9401 
已退货不能做差错 
9401 
已差错不能退货 
9403 
贷调尚未提交不能对贷调请款 
9404 
请款尚未提交不能对请款退单 
9405 
差错交易已被复核过 
9406 
差错交易已被双复核过 
9408 
借记卡不允许再请款 
9409 
借记卡不允许二次退单 
9410  
原交易不是转帐交易 
9411  
对请款有疑问退单需要上传文件 
9412  
用4527 原因码退单，但是原交易状态不为2（过期未回复）或6（回
复码04） 
9413  
请款交易需要上传证明文件 
9414  
再请款交易需要上传证明文件 
9415 
二次退单交易需要上传证明文件 
9416  
没有查找到相应的差错原因码期限纪录 
9417  
不能隐藏吞没卡信息 
9418  
找不到例外标识 
9419  
找不到相关信息 
9420 
原因码使用错误,非03 渠道不能使用原因码4521 
9421 
余额查询是从20060401 开始 
9422  
操作动作与交易类型不匹配 
9423 
当前交易状态不能做删除 
9424  
交易已经做过机构地区代码不规范退单，不能重复发起 
9425  
交易已经做过商户类别不规范退单，不能重复发起 
9426  
惩罚性退单不能作再请款 
9427 
非延期预授权交易退单不能使用4503/4522 原因码 
9428  
发送差错报文报错 
9429  
拼装差错通知报文出错 
9430  
调单回复期限内未回复，不支持当前原因码的退单或无卡支付先行垫
付请求  
9431 
调单回复期限内未回复，不支持退单或无卡支付先行垫付请求 
9432 
贷调已提交不能重复做 
9277 
6309 原因码查询或调单只能回复05 或06 
9278 
新密码不符合格式要求 
9279 
密码修改出错 
9280 
6307 原因码情况下，商户名称、商户URL、商品明细必填  
9281 
报文中有文件内容，但文件名为空 
9282 
报文中有文件名，但文件内容为空  
9283 
凭证文件名过长  
9284 
经办此类差错交易时，差错交易金额必须等于原交易金额

---
**[p83]**

Q/CUP 054.2—2012 
 
 
79 
9285 
此差错交易是经办另一差错交易时附带自动产生的，不能做撤销 
9286 
报文中凭证文件长度的值与凭证文件的实际长度不相符 
9287 
报文中的差错交易代码与交易的不匹配 
9288 
查询范围内的记录数太多，请缩小查询范围  
9289 
日期时间不符合格式 
9290 
报文版本号取值错误 
9291 
对应差错交易的提交机构和目标机构都不是当前用户机构 
9292 
对应手工交易的提交机构和目标机构都不是当前用户机构 
9293 
交易的当前状态不允许做撤销 
9294 
设置手工交易目标机构错误 
9295 
生效过的差错交易既不是复核通过状态又不是双复核通过状态 
9296 
差错手工列表查询单次查询时间跨度不能大于7 天 
 
A.2 交易代码表 
联网机构在收到银联的交易代码时，其含义参照下表。 
 
表 A.27  按序号排列的交易代码表 
代码 
 含义 
E00 
差错-查询                                
E01 
查询（受理方提出）                       
E02 
差错-查复                                
E03 
查复（受理方提出查询）                   
E04 
差错-调单                                
E05 
差错-调单回复                            
E06 
单边帐通知                               
E07 
单边帐回复                               
E08 
没收卡片登记                             
E09 
没收卡片回复                             
E12 
托收协商                                 
E13 
托收协商回复                             
E14 
差错-受理向转出查询                      
E15 
差错-转出向受理查复                      
E16 
差错-受理向转入查询                      
E17 
差错-转入向受理查复                      
E18 
差错-PBOC IC 发卡转帐圈存调单（转入）     
E19 
差错-PBOC IC 发卡转帐圈存调单回复（转入） 
E20 
差错-收费                                
E22 
差错-请款                                
E23 
差错-结算的退单                          
E24 
差错-结算再请款                          
E25 
差错-结算二次退单                        
E26 
差错例外协商

---
**[p84]**

Q/CUP 054.2—2013 
80 
 
E27 
差错例外协商回复                         
E28 
差错-受理-调单                           
E29 
差错-受理-调单回复                       
E30 
差错-付费                                
E31 
差错例外-贷（受理方）                    
E32 
差错-贷记调整                            
E33 
差错-一般转帐转入贷记调整                
E34 
一般转帐转出贷记调整                     
E35 
差错-一般转帐转入对贷调请款              
E36 
差错-一般转帐转出请款                    
E37 
差错-一般转账转出一次退单                
E38 
差错-一般转账转入一次退单                
E39 
差错-转入转帐对贷调请款                  
E63 
差错-PBOC 转帐圈存贷记调整（转入）        
E64 
差错-PBOC 转帐圈存贷记调整（转出）        
E65 
差错-PBOC 现金充值贷记调整                
E66 
差错-PBOC 圈存贷记调整                    
E67 
差错-PBOC 转帐圈存一次退单（转出）        
E68 
差错-PBOC 转帐圈存一次退单（转入）        
E70 
差错-转出转帐请款                        
E71 
差错-受理向转出查询                      
E72 
差错-转出向受理查复                      
E73 
差错例外-贷（发卡方）                    
E74 
退货（手工）                             
E75 
差错-付费撤消                            
E77 
差错-退货二次退单撤消                    
E80 
差错-发卡-存款的贷记调整                 
E81 
差错-发卡-请款                           
E82 
差错-受理-一次退单                       
E84 
退货（手工单）                           
S00 
余额查询                                 
S01 
明细查询                                 
S02 
一般转账                                 
S03 
圈存                                     
S04 
圈提                                     
S05 
圈提确认                                 
S06 
建立委托关系                             
S07 
撤销委托关系                             
S08 
修改密码                                 
S09 
PBOC 转账圈存                             
S10 
预授权/授权                              
S11 
转账还款

---
**[p85]**

Q/CUP 054.2—2012 
 
 
81 
S12 
追加预授权                               
S13 
分期付款消费                             
S14 
帐户验证(银联通汇款)                     
S15 
PBOC 转账圈存转出                         
S16 
PBOC 转账圈存转入                         
S17 
帐户验证                                 
S18 
PBOC 现金充值                             
S19 
银行卡信息下载                           
S20 
预授权完成                               
S21 
结算通知（中心发）                       
S22 
消费                                     
S23 
实时代收                                 
S24 
取现                                     
S25 
一般转账转出                             
S26 
转账还款转出                             
S27 
MDS/ATM 购物                              
S28 
银联通汇款(联机)                         
S29 
发卡MDS 预授权完成                        
S30 
联机退货                                 
S31 
代付                                     
S32 
存款                                     
S33 
一般转账转入                             
S34 
转帐还款转入                             
S35 
预授权结算（机构发）                     
S36 
积分消费                                 
S37 
联盟积分消费                             
S38 
联盟积分查询                             
S39 
联盟积分联机退货                         
S40 
磁条卡现金充值                           
S41 
账户充值转账                             
S43 
充值转账转出                             
S44 
充值转账转入                             
S45 
脱机转联机通知                           
S46 
MO/TO 消费                                
S47 
MO/TO 退货                                
S48 
MO/TO 预授权                              
S49 
MO/TO 预授权完成                          
S50 
MO/TO 预授权完成通知（机构发）            
S51 
MO/TO 预授权完成通知(中心发，实际不启用） 
S54 
预约消费                                 
S55 
建立委托                                 
S56 
自助消费                                 
S57 
自助脱机消费通知

---
**[p86]**

Q/CUP 054.2—2013 
82 
 
S59 
助农取款                                 
S60 
脱机退货通知                             
S64 
批量代收                                 
S65 
自助预授权                               
S67 
自助预授权完成                           
S70 
预约助农无卡取款                         
S71 
自助预授权完成通知（机构发）             
S73 
自助预授权完成（手工）                   
S80 
预授权完成（手工）                       
S81 
预授权完成（手工单）                     
S82 
银联通汇款(手工)                         
S83 
MO/TO 预授权完成（手工）                  
S90 
MC/MDS 拒绝承认0290                       
S91 
代付通知                                 
S92 
存款确认                                 
S93 
转入转帐确认                             
S94 
转帐还款转入确认                         
S95 
磁条卡现金充值确认                       
S96 
充值转账转入确认                         
V13 
分期付款消费撤销                         
V40 
预授权/授权撤消                          
V42 
授权冲撤                                 
V43 
BASEI 发起POS 授权冲撤                     
V44 
BASEI 发起ATM 取现授权                     
V50 
预授权完成撤消                           
V52 
消费撤消                                 
V53 
实时代收撤销                             
V54 
柜面取现撤消                             
V57 
联盟积分消费撤销                         
V58 
POSCashAdvance 撤销                       
V61 
代付撤消                                 
V62 
存款撤消                                 
V63 
积分消费撤消                             
V66 
自助预授权撤销                           
V68 
PBOC 现金充值撤销                         
V69 
自助预授权完成撤销                       
V73 
自助预授权完成撤销（手工）               
V76 
MO/TO 消费撤销                            
V78 
MO/TO 预授权撤销                          
V79 
MO/TO 预授权完成撤销                      
V81 
预授权完成撤销（手工）                   
V83 
MO/TO 预授权完成撤销（手工）

---
**[p87]**

Q/CUP 054.2—2012 
 
 
83 
V84 
预约消费撤消                             
V85 
撤销委托                                 
V93 
BASE1POS 授权冲撤通知                     
V94 
BASE1ATM 授权冲撤通知

---
**[p88]**

Q/CUP 054.2—2013 
84 
 
参考文献 
[1] 中国银联股份有限公司：《中国银联银行卡联网联合技术规范V2.1》 
[2] 中国银联股份有限公司： 《银联卡业务运作规章》第四卷《投诉 差错及争议处理》 
[3] 中国金融认证中心： 《证书应用工具包技术白皮书》