# 中国银联银行卡交换系统技术规范（国际卷） 第6部分 附录
> 来源: 银联规范 2015-12 存档 | 63页 | 提取: 2026-09-03


---
**[p1]**

中国银联股份有限公司企业标准
Q/CUP
Q/CUP 006.6-2015
代替Q/CUP 006.6-2014 
中国银联银行卡交换系统技术规范 
（国际卷） 
第6 部分 附 录 
Technical Specifications on Bankcard Interoperability  
Part 6   Annex 
版本号： 2015.B 
 
 
 
2015-11-12 发布 
2016-4-30 实施
中国银联股份有限公司 发布 
中国银联 
版权所有

---
**[p2]**

中国银联 
版权所有

---
**[p3]**

Q/CUP 006.6-2015 
I 
中国银联股份有限公司（以下简称“中国银联”）对该规范文档保留全部
知识产权权利，包括但不限于版权、专利、商标、商业秘密等。任何人对该规
范文档的任何使用都要受限于在中国银联成员机构服务平台
（http://member.unionpay.com/）与中国银联签署的协议之规定。中国银联不
对该规范文档的错误或疏漏以及由此导致的任何损失负任何责任。中国银联
针对该规范文档放弃所有明示或暗示的保证,包括但不限于不侵犯第三方知识
产权。 
未经中国银联书面同意，您不得将该规范文档用于与中国银联合作事项
之外的用途和目的。未经中国银联书面同意，不得下载、转发、公开或以其它
任何形式向第三方提供该规范文档。如果您通过非法渠道获得该规范文档，请
立即删除，并通过合法渠道向中国银联申请。 
中国银联对该规范文档或与其相关的文档是否涉及第三方的知识产权
（如加密算法可能在某些国家受专利保护）不做任何声明和担保，中国银联对
于该规范文档的使用是否侵犯第三方权利不承担任何责任，包括但不限于对
该规范文档的部分或全部使用。 
中国银联 
版权所有

---
**[p4]**

Q/CUP 006.6-2015 
II 
目    次 
前    言 ............................................................................ III 
变更清单 .............................................................................. I 
附 录 A （规范性附录） 标准代码定义 ................................................. 1 
A.1 入网机构标识码 .................................................................... 1 
A.1.1 入网机构标识码定义 ............................................................... 1 
A.1.2 境内机构（包括境外银行在境内的机构） ............................................. 1 
A.1.3 境外机构（包括境内银行在境外的机构） ............................................. 1 
A.2 应答码 ............................................................................ 2 
A.2.1 按应答码序号排列的应答码表 ....................................................... 2 
A.2.2 按照业务要求建议细化的应答码表 ................................................... 8 
A.3 报文原因码 ........................................................................ 9 
A.4 拒绝码 ........................................................................... 15 
A.4.1 联机交易拒绝码 .................................................................. 15 
A.4.2 清算文件拒绝码 .................................................................. 18 
A.5 国家/地区和货币代码 ............................................................... 19 
A.6 标准ASCII 可打印字符 ............................................................. 27 
附 录 B （资料性附录） 交易种类区分表 .............................................. 29 
B.1 单信息金融、授权类请求、通知交易 ................................................. 29 
B.2 双信息交易 ....................................................................... 32 
B.3 应用管理及银联卡汇率查询类 ....................................................... 34 
B.4 差错信息种类区分表 ............................................................... 34 
B.5 CUPS 对UICS 借/贷记标准IC 卡交易的支持 ........................................... 37 
B.5.1 CUPS 对UICS 借/贷记标准IC 卡转接的支持 .......................................... 37 
B.5.2 CUPS 对UICS 借/贷记标准IC 卡代授权的支持 ........................................ 37 
B.5.3 CUPS 对UICS 借/贷记标准IC 卡代校验的支持 ........................................ 38 
附 录 C （资料性附录） 报表样例 .................................................... 39 
C.1 UPI 机构清算汇总报表C602DZ 样表 .................................................. 39 
C.1.1 报表头 .......................................................................... 39 
C.1.2 子报表 .......................................................................... 39 
C.1.3 机读格式 ........................................................................ 40 
C.1.4 样例 ............................................................................ 41 
C.2 机构划账凭证报表612DZ 样表 ....................................................... 53 
 
中国银联 
版权所有

---
**[p5]**

Q/CUP 006.6-2015 
III 
前    言 
本规范的目的： 
本规范对中国银联跨行交易中的标准代码、交易种类区分、交易信息关联、IC卡交易支持、清分对
账、标准版本转换等事项做了规定和说明。 
使用对象： 
本规范的使用对象为中国银联及其入网机构的员工。 
时区描述： 
中国银联在上海、北京、香港以及深圳分别建有运营中心。如无特殊说明，本规范中的时间专指‘北
京时间’。 
格林威治时间（UTC）是世界上的基准计时方式。北京时间相比UTC时间，提前8个小时。北京时间
没有夏令时的安排。 
除非特殊说明，本规范中的‘Day'是日历日期，‘Business Day'特指入网处理机构所在地的法定
工作日期。 
中国银联将根据所实施的升级改造以及所需要的更正定期对该规范进行修订并发布。必要时，部分
的修订及补充内容将通过‘运营公告’（Operation Bulletin）的形式对外发布。 
支持联系： 
电子邮件：spec-service@unionpay.com 
本标准主要起草人：徐静雯、赵伟、蒋慧科、杜秉一、白玫。 
中国银联 
版权所有

---
**[p6]**

中国银联 
版权所有

---
**[p7]**

Q/CUP 006.6-2015 
I 
变更清单  
序
号 
变更章节号 
变更内容 
变更原因 
系统改造影响性
分析（仅供机构
参考） 
变更人员 
变更时间 
1. 
B.4 国家/地区
和货币代码  
1. 货币名称由 
“Romanian 
Leu 
(new)” 
变更为 
“Romanian Leu”； 
2. 塞尔维亚第纳尔
的货币代码由CSD
（891）改为了RSD
（941），原来的货币
代码CSD（891）已于
2006 年10 月被废除 
与ISO 保持一致 
无影响 
张兰 
2015-9-10 
2. 
A.6 标准ASCII 可
打印字符 
将
ASCII
码表的
“Binary”列的取值
调整为8 位 
描述优化 
无影响 
张兰 
2015-9-10 
3. 
B.4 差错信息种
类区分表 
删除转账贷记调整
交易 
境外不支持转账交
易 
无影响 
白玫 
2015-7-29 
4. 
C.2 机构划账凭
证报表612DZ 样
表 
新增机构划账凭证
报表612DZ 样例 
方便机构对账，新增
报表样例 
需要对账的机构
清算系统可选改
造 
白玫 
2015-7-29 
 
 
 
中国银联 
版权所有

---
**[p8]**

中国银联 
版权所有

---
**[p9]**

Q/CUP 006.6-2015 
1 
附 录 A 
（规范性附录） 
标准代码定义 
中国银联信息处理中心（CUPS）与各入网机构之间的报文（Message）是根据ISO 8583:1987 定义
的。 
本附录的内容将根据银行和商户的信息不断增删，更新版本。 
A.1 入网机构标识码 
入网机构标识码用于在银行卡网络上唯一的标识：受理方、发卡方和CUPS、或者报文的转接方等，
通常是指下列数据元： 
域32：Acquiring Institution Identification Code 
域33： Forwarding Institution Identification Code 
域99： Settlement Institution Identification Code 
域100：Receiving Institution Identification Code 
A.1.1 入网机构标识码定义 
入网机构标识码是ISO 8583的变长数据元，目前长度为8位。 
A.1.2 境内机构（包括境外银行在境内的机构） 
1-4位：机构代码 
5-8位：地区代码。全国性入网机构总行为0000，全国性入网机构各分支机构的地区代码为当地的
地区代码。地方性入网机构的地区代码为当地的地区代码。） 
       XXXX         XXXX 
      机构代码       地区代码 
A.1.3 境外机构（包括境内银行在境外的机构） 
1-4 位：机构代码 
5-8 位：地区代码。（采用0+3 位国家代码） 
       XXXX        0XXX 
      机构代码      地区代码（采用0+3 位国家代码） 
国内入网机构在国外的分支机构的地区代码采用0+3 位国家代码。 
 
中国银联 
版权所有

---
**[p10]**

Q/CUP 006.6-2015 
2 
 
 
A.2 应答码 
A.2.1 按应答码序号排列的应答码表 
入网机构在遇到下表中列举的适用条件时，应使用与该适用条件对应的应答
码。 
应答 
含  义 
终端操作 
终端显示（推荐） 
适用条件 
适用角色 
AC 
SW 
IS 
00 
承兑或交易成
功 
成功 
交易成功 
  
√ √ √ 
01 
查发卡方 
失败 
请持卡人与发卡银行联
系 
发卡方原因拒绝该笔交易，只有必须要求联系
发卡行的情况才使用此应答码。 
√ √ √ 
03 
无效商户 
失败 
无效商户 
MCC 异常； 
本卡在该类商户（MCC）不允许此交易； 
此商户在黑名单中 
√ √ √ 
04 
没收卡 
呑卡、没收 
此卡应被吞没（ATM） 
此卡为无效卡（POS） 
发卡方确信该卡应被呑没 
 
 
√ 
05 
身份认证失败 
失败 
持卡人认证失败 
1、网上交易的交易信息超期送达 
2、持卡人身份认证失败（如委托关系或网上类
交易） 
3、证件信息（种类、号码等）不符 
4、交换中心判断安全信息与交易信息的时间
差超过24 小时 
5、持卡人出生日期校验不符 
6、助农取款业务中，受理方未上送卡片信息 
7、CVN2 检验失败 
 
√ √ 
10 
部分金额批准 
成功，需提
示 
显示部分批准金额，提
示操作员 
在允许部分金额的交易中使用 
 
 
√ 
11 
重要人物批准
（VIP） 
成功 
此为VIP 客户 
发卡方向收单行提示此为VIP 客户 
 
 
√ 
12 
无效的关联交
易 
失败 
无效交易 
1、原始交易未承兑，又收到了与其关联的关联
交易，例如冲正交易、撤销交易； 
2、应隔日发生的交易非隔日发生。 
3、对原始交易进行隔日撤销、冲正。 
4、交易没执行，却收到了关联交易的信息（例
如，预授权交易未承兑，又收到了预授权完成
或预授权撤销交易） 
√ √ √ 
中国银联 
版权所有

---
**[p11]**

Q/CUP 006.6-2015 
3 
应答 
含  义 
终端操作 
终端显示（推荐） 
适用条件 
适用角色 
AC 
SW 
IS 
13 
无效金额 
失败 
无效金额 
理应出现有效金额的交易中，金额域填0 或其
它非法值； 
超转付金额累计/超现付金额累计； 
交易超消费比例； 
小费金额超限 
此机构无法/不可进行该币种交易； 
√ √ √ 
14 
无效卡号（无此
账号） 
失败 
无效卡号 
1、发卡方无此主账号 
2、在找到原始交易的情况下，关联交易主账号
与原始交易主账号不匹配 
3、卡号校验位校验不正确 
4、帐户已作废或消户 
5、应答交易主账号与请求交易的主账号不匹
配 
√ √ √ 
15 
无此发卡方 
失败 
此卡无对应发卡方 
根据交易请求的主账号找不到对应的发卡方 
 
√ 
 
16 
批准更新第三
磁道 
成功 
更新第三磁道 
保留 
 
 
 
21 
卡未初始化 
失败 
该卡未初始化或睡眠卡 
1、该卡未激活、开卡； 
2、该卡初始密码未变更； 
3、初始密码限制的交易 
4、长期未使用而冻结或状态为“睡眠”的卡。 
 
 
√ 
22 
故障怀疑，关联
交易错误 
失败 
操作有误，或超出交易
允许天数 
非正常的关联交易，如以下情况： 
1、执行完冲正交易之后，又收到其撤销请求交
易 
2、当前交易已被撤销，又收到其关联交易，例
如冲正、撤销等 
3、执行完预授权撤销交易之后，又收到预授权
完成交易 
4、执行完预授权冲正交易之后，又收到预授权
完成交易 
5、当执行完预授权完成易后，又收到对同一笔
预授权交易的预授权完成请求 
6、预授权类交易（包括预授权完成和预授权撤
销）的发生时间超过允许的预授权类交易天数 
7、超出正常缴费时间 
√ √ √ 
25 
找不到原始交
易 
失败 
没有原始交易，请联系
发卡方 
可表示如下情况： 
1、查找不到原始交易，匹配原始请求交易出错 
2、匹配原始预授权、授权交易失败 
3、冲正交易请求未能与原始交易相匹配 
4、扣费、撤消和变更委托时使用，委托关系不
存在 
√ √ √ 
中国银联 
版权所有

---
**[p12]**

Q/CUP 006.6-2015 
4 
 
应答 
含  义 
终端操作 
终端显示（推荐） 
适用条件 
适用角色 
AC 
SW 
IS 
30 
报文格式错误 
失败 
请重试 
可表示如下情况： 
1、规定应出现的报文域未在报文中出现 
2、交易渠道取值不在规范定义中 
3、域解析出错 
4、子域解析出错 
5、域检查未通过 
6、域中出现非法字符 
7、接收报文中的bitmap 不符合规范的定义 
8、磁道信息出错 
9、理应出现交易金额的交易中没有交易金额 
√ √ √ 
34 
有作弊嫌疑 
呑卡、没收 作弊卡,呑卡 
该卡有作弊嫌疑（包括ARQC 校验错），ATM 呑
卡、操作员没收，适应以下情况： 
1、CVN 错误次数超过吞卡次数限额； 
2、卡片已被伪冒(借方) 
 
 
√ 
38 
超过允许的PIN
试输入 
失败 
密码错误次数超限，请
与发卡方联系 
密码错次数超限，并已对账户进行锁定，需持
卡人至发卡方办理解锁 
 
 
√ 
40 
请求的功能尚
不支持 
失败 
发卡方不支持的交易 
针对机构不支持的功能，可表示为如下情况： 
1、发卡机构尚未开通此交易 
2、虽然可以从联网机构的报文中确定出交易
种类，但该交易目前未开放 
3、联网机构虽然可以从接收到的报文中确定
出交易种类，但在接收方的权限表或特殊权限
表中未包含该交易 
4、虽然可以从联网机构的报文中确定出交易
种类，但接收方的报文版本不支持 
5、对于一笔 IC 卡交易，若接收方是Early 状
态，而接收方却不要求校验ARQC 
6、发卡方无法进行某些验证要素的校验 
 
√ √ 
41 
挂失卡 
呑卡、没收 
此卡已挂失,呑卡（ATM） 
挂失卡（POS） 
挂失的卡，吞没 
 
 
√ 
43 
被窃卡 
呑卡、没收 
此卡被没收，请与发卡
方联系（ATM） 
被窃卡（POS） 
发卡方确认此卡为被窃的卡，吞没 
 
 
√ 
  45 
不允许降级交
易 
失败 
请使用芯片 
1、 发卡方不支持复合卡降级交易 
2、 发卡方不支持该地区受理发起的复合卡
降级交易 
 
 
√ 
51 
资金不足 
失败 
可用余额不足 
账户可用余额不足，信用额度不足，取现额度
超限 
 
 
√ 
中国银联 
版权所有

---
**[p13]**

Q/CUP 006.6-2015 
5 
应答 
含  义 
终端操作 
终端显示（推荐） 
适用条件 
适用角色 
AC 
SW 
IS 
54 
过期的卡 
失败 
该卡已过期 
1、过期卡，到期日期不正确 
2、应上送有效期的交易未上送有效期 
 
 
√ 
55 
不正确的PIN 
失败 
密码错 
PIN 验证未通过 
 
 
√ 
57 
不允许持卡人
进行的交易 
失败 
不允许此卡交易 
发卡方对持卡人的信用及风险状况等原因，
不允许进行交易的情况，包括但不限于： 
1、该卡种不能做此种交易 
2、超服务范围 
3、不受理该种卡 
4、单位卡不能存款 
5、该帐户没有该币种 
6、此卡有套现嫌疑 
7、卡号或证件号在黑名单中 
√ √ √ 
58 
不允许终端进
行的交易 
失败 
发卡方不允许该卡在本
终端进行此交易 
1、发卡方在限制此类终端进行相关交易（可能
针对某些卡BIN） 
2、关联交易中终端号与原始交易中终端号不
匹配 
√ √ √ 
59 
有作弊嫌疑 
失败 
卡片校验错 
CVN 验证失败 
 
√ √ 
61 
超出金额限制 
失败 
交易金额超限 
交易金额超限，包括但不限于： 
1、超单笔消费限额/超ATM 单笔取现限额 
2、ATM 日取现/POS 日消费金额超限 
3、超持卡人自定义单笔取款/消费 
4、超转帐限额 
√ √ √ 
62 
受限制的卡 
失败 
受限制的卡 
受限制的卡（受理服务地区限制等原因），不
吞没 
 
√ √ 
64 
原始金额错误 
失败 
交易金额与原交易不匹
配 
1、请求报文中的交易金额与应答报文中的交
易金额不匹配（部分扣款情况除外） 
√ √ √ 
2、关联交易报文中的交易金额与原始交易报
文中的交易金额不匹配（部分扣款情况除外） 
65 
超出取款/消费
次数限制 
失败 
超出取款次数限制 
1、超出当日取款/消费次数限制 
2、超转付次数累计/超现付次数累计； 
 
 
√ 
68 
发卡行响应超
时 
失败 
交易超时，请重试 
接收机构超时未收到发卡方应答 
 
 
√ 
75 
允许的输入PIN
次数超限 
失败 
密码错误次数超限 
密码输入错误次数超限 
 
 
√ 
90 
正在日终处理
（） 
失败 
系统日切，请稍后重试 
正在进行日期切换 
 
√ √ 
中国银联 
版权所有

---
**[p14]**

Q/CUP 006.6-2015 
6 
 
应答 
含  义 
终端操作 
终端显示（推荐） 
适用条件 
适用角色 
AC 
SW 
IS 
91 
发卡方不能操
作 
失败 
发卡方状态不正常，请
稍后重试 
用于表示由于发卡方（或转入/转出方）的错误
而导致交易被拒绝，如以下情况： 
1、发卡方（或转入/转出方）运行不正常 
2、发卡方（或转入/转出方）异常，但又未和
银联处理中心签定代授权协议 
3、发卡方（或转入/转出方）签退、未签到 
4、发卡方（或转入/转出方）运行状态无效 
5、发卡方（或转入/转出方）被银联处理中心
关闭 
6、发卡方（或转入/转出方）线路异常 
7、发卡行（或转入/转出方）的内部系统超时 
 
√ √ 
92 
金融机构或中
间网络设施找
不到或无法达
到 
失败 
发卡方线路异常，请稍
后重试 
1、没有可用线路 
2、银联处理中心或入网机构的IP 地址格式及
端口号错误 
√ √ √ 
94 
重复交易 
失败 
拒绝，重复交易，请稍后
重试 
1、用于检测到原始交易是重复的交易； 
2、在建立委托时发现委托关系已存在 
3、交易序号重复 
√ √ √ 
96 
银联处理中心
系统异常、失效 
失败 
拒绝，交换中心异常，请
稍后重试 
用于表示由于银联处理中心的错误而导致交
易被拒绝，由银联给出。如以下情况： 
1、银联处理中心无法进行正常处理，发生了诸
如数据库操作失常、共享内存操作失常、函数
操作失常等内部处理失败的情况 
2、银联处理中心维护中，拒绝所有请求 
 
√ 
 
97 
ATM/POS 终端号
找不到 
失败 
终端号未登记 
终端号未登记 
√ √ 
 
98 
银联处理中心
收不到发卡方
应答 
失败 
发卡方超时 
1、发卡方超时 
2、转出方超时 
3、接收应答超时 
 
√ 
 
99 
PIN 格式错 
失败 
PIN 格式错，请重新签到 PIN 格式错 
√ √ √ 
A0 
MAC 鉴别失败 
失败 
MAC 校验错，请重新签到 MAC 校验失败 
√ √ √ 
A1 
转账货币不一
致 
失败 
转账货币不一致 
转账货币不一致 
√ √ √ 
A2 
有缺陷的成功 
成功 
交易成功，请向资金转
入行确认 
银联处理中心转发了原转入/存款/汇款交易
请求，但未收到发卡方应答时，银联处理中心
直接向受理方应答为有缺陷的成功交易 
 
√ 
 
中国银联 
版权所有

---
**[p15]**

Q/CUP 006.6-2015 
7 
应答 
含  义 
终端操作 
终端显示（推荐） 
适用条件 
适用角色 
AC 
SW 
IS 
A3 
资金到账行无
此账户 
失败 
资金到账行账号不正确 
资金到账行无此账户 
 
 
√ 
A4 
有缺陷的成功 
成功 
交易成功，请向资金到
账行确认 
未收到原转入/存款/汇款交易请求时，对关联
的确认交易的承兑为有缺陷的成功交易 
 
 
√ 
A5 
有缺陷的成功 
成功 
交易成功，请向资金到
账行确认 
原转入/存款/汇款交易为拒绝时，对关联的确
认交易的承兑为有缺陷的成功交易 
 
√ √ 
A6 
有缺陷的成功 
成功 
交易成功，请向资金到
账行确认 
银联处理中心转发了原转入/存款/汇款交易
请求，但未收到发卡方应答时，对受理方发来
的关联的确认交易的承兑为有缺陷的成功交
易 
 
√ 
 
A7 
安全处理失败 
  
  
  
  
  
  
  
  
  
安全处理失败 
1、调用MAC 校验程序失败 
2、调用PIN 校验程序失败 
3、PIN 转换错误 
4、MAC 生成失败 
5、密钥生成失败 
6、密钥启用失败 
7、密钥重置失败 
8、生成ARPC 失败 
9、处理MAC 异常时失败 
√ √ √ 
A8 
转入卡归属地
信息缺失 
失败 
未上送“转入卡归属地
信息” 
转账交易中未上送“转入卡归属地信息” 
 
 
√ 
B1 
无欠费（收据未
打） 
失败 
此业务无欠费 
费用查询时使用 
√ 
 
 
C1 
受理方状态非
法 
  
  
受理方状态非法 
用于表示由于受理方的错误而导致交易被拒
绝，如以下情况： 
1、受理方签退 
2、受理方运行状态无效 
3、受理方未签到 
 
√ 
 
D1 
机构代码错误 
  
  
机构代码错误 
√ √ √ 
D2 
日期错误 
  
  
日期错误 
√ √ √ 
D3 
无效的文件类
型 
  
  
无效的文件类型 
√ √ √ 
D4 
已经处理过的
文件 
  
  
已经处理过的文件 
√ √ √ 
D5 
无此文件 
  
  
无此文件 
√ √ √ 
D6 
接收者不支持 
  
  
接收者不支持 
√ √ √ 
D7 
文件锁定 
  
  
文件锁定 
√ √ √ 
D8 
未成功 
  
  
未成功 
√ √ √ 
中国银联 
版权所有

---
**[p16]**

Q/CUP 006.6-2015 
8 
 
应答 
含  义 
终端操作 
终端显示（推荐） 
适用条件 
适用角色 
AC 
SW 
IS 
D9 
文件长度不符 
  
  
文件长度不符 
√ √ √ 
DA 
文件解压缩错 
  
  
文件解压缩错 
√ √ √ 
DB 
文件名称错 
  
  
文件名称错 
√ √ √ 
DC 
无法接收文件 
  
  
无法接收文件 
√ √ √ 
F1 
文件记录格式
错误 
 
 
记录格式不符合规范要求 
 
√ 
 
F2 
文件记录重复 
 
 
与已有的记录重复 
 
√ 
 
F3 
文件记录不存
在 
 
 
要求进行操作的记录不存在 
 
√ 
 
F4 
文件记录错误 
 
 
对记录的其他操作出错 
 
√ 
 
F5 
文件批量转联
机未完成 
 
 
批量交易中文件批量转联机超时，未完成转换 √ √ 
 
N1 
未登折帐目已
超限，交易不成
功 
失败 
未登折帐目超限 
未登折帐目已超限，交易不成功 
 
 
√ 
P1 
当前卡未在发
卡机构留存手
机号等通讯联
系号码 
失败 
未留存手机号等通讯联
系号码 
1、当前交易卡片未在发卡机构留存手机号等
通讯联系号码 
 
 
√ 
Y1 
  
成功 
  
脱机交易成功（符合UICS 借/贷记标准的IC
卡专用，具体使用方法参见技术规范 第三部
分 文件接口规范） 
√ 
 
 
Y3 
  
成功 
  
不能联机，脱机交易成功（符合UICS 借/贷记
标准的IC 卡专用，具体使用方法参见技术规
范 第三部分 文件接口规范） 
√ 
 
 
Z1 
  
失败 
  
脱机交易失败（符合UICS 借/贷记标准的IC
卡专用，具体使用方法参见技术规范 第三部
分 文件接口规范） 
√ 
 
 
Z3 
  
失败 
  
不能联机，脱机交易失败（符合UICS 借/贷记
标准的IC 卡专用，具体使用方法参见技术规
范 第三部分 文件接口规范） 
√ 
 
 
A.2.2 按照业务要求建议细化的应答码表 
联网机构除在39域返回交易应答码之外，还可通过57域AR用法返回该应答码
对应的具体场景。按照业务要求，建议细化的应答码表如下： 
表 A.27  按业务要求建议细化的应答码表 
（以下细化码表仅适用于跨境汇款业务） 
应答码 
含义 
终端显示 
适用条件 
适用角色 
中国银联 
版权所有

---
**[p17]**

Q/CUP 006.6-2015 
9 
 
注：1）表格中所列细化应答码目前仅限于跨境汇款业务，其它业务中若出现57域
AS+AR用法，收单机构可忽略；  
    2）在跨境汇款业务中，若发卡返回表格中所列以外的应答码（F39），同时
57域出现AS+AR用法，收单机构可忽略57域AS+AR用法。 
A.3 报文原因码 
用于报文中的60.1域或手工提交差错，表示交易发生的原因。其定义若有变
动，请参见相关业务规则。 
（F39） 
终端
操作 
（推荐） 
(F57 AS+AR) 
取值 
含义 
AC SW IS 
05 
身份认证失
败 
失败 
持卡人认证失
败 
00 
缺省值，不细化应答场景 
 
√ √ 
03 
身份证号、手机号、姓名中有1 项或多项不符 
13 
汇款验证姓名比对失败 
14 
汇款交易证件类型不支持 
13 
无效金额 
失败 
无效金额 
00 
缺省值，不细化应答场景 
√ √ √ 
05 
此机构无法/不可进行该币种交易 
16 
在外汇管制国家，超过当地监管结汇额度 
22 
故障怀疑，
关联交易错
误 
失败 
操作有误，或
超出交易允许
天数 
00 
缺省值，不细化应答场景 
√ √ √ 
07 
汇款交易中，汇款验证后，已发起了对应的联机
的汇款交易（无论交易成功与否），又收到与汇
款验证关联的联机汇款 
57 
不允许持卡
人进行的交
易 
失败 
不允许此卡交
易 
发卡方对持卡人的信用及风险状况等原因，不允许进行
交易的情况，包括但不限于： 
√ √ √ 
00 
缺省值，不细化应答场景 
03 
该帐户没有该币种 
12 
汇款方命中黑名单，比如汇款国家、地区被制
裁，汇款人涉及反洗钱、反恐怖融资等 
13 
收款方命中黑名单，比如收款国家、地区被制
裁，收款人涉及反洗钱、反恐怖融资等 
61 
超出金额限
制 
失败 
交易金额超限 
00 
缺省值，不细化应答场景 
√ √ √ 
07 
跨境汇款超单笔限额 
08 
跨境汇款超日限额 
92 
金融机构或
中间网络设
施找不到或
无法达到 
失败 
发卡方线路异
常，请稍后重
试 
00 
缺省值，不细化应答场景 
√ √ √ 
03 
汇往中国的汇款交易中，国家外汇管理个人结售
汇系统（SAFE System）不在服务时间（建议在
下一个服务时间内再试） 
04 
汇往中国的汇款交易中，国家外汇管理个人结售
汇系统（SAFE System）暂时不能服务（建议10
分钟后重试） 
05 
汇往中国的汇款交易中，国家外汇管理个人结售
汇系统（SAFE System）系统超时 
中国银联 
版权所有

---
**[p18]**

Q/CUP 006.6-2015 
10 
 
表 A.29  报文原因码表 
代码 
英文定义 
中文定义 
适用范围 
通知报文而非请求报文的理由 
1004 
Terminal processed 
终端处理 
暂不启用 
1005 
ICC processed 
IC 卡处理 
暂不启用 
请求报文而非通知报文的理由 
1500 
ICC application unable to 
process 
ICC 应用，公共数据文件不能处理 
暂不启用 
1502 
ICC random selection 
ICC 应用，应用数据文件不能处理 
暂不启用 
1503 
Terminal random selection 
ICC 随机选择 
暂不启用 
1504 
Terminal not able to process ICC 
终端不能处理ICC 
暂不启用 
1505 
On line forced by ICC 
ICC 强制联机 
暂不启用 
1506 
On line forced by card acceptor 
受卡人强制联机 
暂不启用 
1507 
On line forced by CAD 
CAD 强制联机去更新 
暂不启用 
1508 
On line forced by terminal 
终端强制联机 
暂不启用 
1509 
On line forced by card issuer 
发卡方强制联机 
暂不启用 
1510 
Over floor limit 
超出下限 
暂不启用 
1511 
Card acceptor suspicious 
商户质疑 
暂不启用 
再请款理由 
2000 
Refund or Credit Adjustment Processed  已退货或已做贷记调整 
再请款报文 
2001 
Incorrect 
Trace 
No. 
in 
Chargeback 
退单交易的受理机构流水号不正确 再请款报文 
2002 
Non-Receipt 
of 
Supporting 
Documentation 
支持退单的文件未收到 
再请款报文 
2003 
Correct 
Transaction 
Date 
Provided 
正确的交易日期 
再请款报文 
2005 
Correct 
Merchant 
Location 
Provided 
正确的商户地址 
再请款报文 
2008 
Transaction 
Authorized 
by 
Issuer 
交易得到发卡机构授权 
再请款报文 
2702 
Invalid First Chargeback 
无效的一次退单 
再请款报文 
2704 
Legible Transaction Receipt 
Provided  
提供清晰的交易凭证 
再请款报文 
2706 
Acquirer Can Prove That The 
Transaction Is Correct 
收单机构证明原交易无误 
再请款报文 
2707 
Illegible 
Supporting 
Documentation for  chargeback 
支持退单的文件不清晰 
再请款报文 
冲正理由 
4003 
Format error, no action taken 
格式错误，不采取行动 
冲正报文 
4004 
Completed partially 
部分完成 
冲正报文 
4005 
Original amount incorrect 
原始金额不正确 
冲正报文 
4006 
Response received too late 
收到应答太迟 
冲正报文 
4007 
Card acceptor device unable to 
complete transaction 
受卡设备不能完成交易 
冲正报文 
中国银联 
版权所有

---
**[p19]**

Q/CUP 006.6-2015 
11 
代码 
英文定义 
中文定义 
适用范围 
4008 
Deposit out of balance 
存款不平 
冲正报文 
4010 
Payment out of balance 
付款不平 
冲正报文 
4011 
Deposit out of balance/applied 
contents 
存款不平/与应用内容不符 
冲正报文 
4012 
Payment out of balance/applied 
contents 
付款不平/与应用内容不符 
冲正报文 
4013 
Unable to deliver message to 
terminal 
不能传送报文至终端 
冲正报文 
4014 
Suspected malfunction/card 
retained 
怀疑故障/卡被扣 
冲正报文 
4015 
Suspected malfunction/card 
returned 
怀疑故障/卡退回 
冲正报文 
4016 
Suspected malfunction/track 3 
not updated 
怀疑故障/第三磁道未更新 
冲正报文 
4017 
Suspected malfunction/no cash 
dispensed 
怀疑故障/未吐钞 
冲正报文 
4018 
Timed-out at taking money/no 
cash dispensed 
取款超时/未吐钞 
冲正报文 
4019 
Timed-out at taking card/card 
retained and no cash dispensed 
取卡超时/扣卡，未吐钞 
冲正报文 
4020 
Invalid response, no action 
taken 
无效应答，不采取行动 
冲正报文 
4021 
Timeout waiting for response 
应答超时 
冲正报文 
（4351—4499）ISO 保留给民间使用 
4351 
Terminal-generated reversal 
(full amount) 
终端引发冲正（ 全 额 ） 
冲正报文 
4352 
Terminal-generated reversal 
(partial amount) 
终端引发冲正（ 部 分 ） 
冲正报文 
4353 
Acquirer received late response 
from CUPS 
受理方收到CUPS 迟到的应答 
冲正报文 
4354 
Acquirer detected time-out 
受理方检测到超时 
冲正报文 
4355 
Acquirer detected incorrect MAC 
from response message 
受理方检测到应答报文的MAC 不
对 
冲正报文 
4356 
Acquirer not able to send 
operating command to terminal 
受理方不能向终端发操作命令 
冲正报文 
4360 
CUPS received late response from 
card issuer  
银联处理中心收到发卡方迟到的应
答 
冲正报文 
4361 
CUPS waiting for issuer’s 
response until time-out 
银联处理中心等发卡方应答超时 
冲正报文 
4362 
CUPS detected incorrect MAC from 
issuer’s response message 
银联处理中心检测到发卡方应答报
文的MAC 不对 
冲正报文 
4363 
CUPS unable to forward issuer’s 
response message to acquirer 
银联处理中心不能向受理方转发发
卡方应答报文 
冲正报文 
4364 
CUPS unable to forward request 
to transfer-in party 
银联处理中心不能向转入方转发交
易请求 
冲正报文 
4365 
dispenser out of notes 
终端正常，钞箱无钞票 
冲正报文 
4366 
refused by transfer-in 
转入方拒绝银联处理中心转发的转
入转账请求 
冲正报文 
退单(一次、二次)理由 
中国银联 
版权所有

---
**[p20]**

Q/CUP 006.6-2015 
12 
 
代码 
英文定义 
中文定义 
适用范围 
4501 
Non-Disbursement 
or 
Partial 
Disbursement of Cash at ATM 
ATM 未吐钞或部分吐钞 
退单报文 
4502 
Purchase Not Completed 
消费未成功，已扣账 
退单报文 
4503 
Dispute on Debit Adjustment 
对请款交易有争议 
退单报文 
4507 
Cardholder 
Dispute-
Transaction Amount Differs 
持卡人对交易金额有争议 
退单报文 
4508 
Exceeds Limited or Authorized 
Amount 
交易金额超过授权金额 
退单报文 
4512 
Duplicate Processing 
交易重复提交清算 
退单报文 
4514 
Fraudulent 
Multiple 
Transactions 
疑似欺诈的多笔交易 
退单报文 
4515 
Transaction Not Recognized 
持卡人否认已完成的交易 
退单报文 
4522 
Declined Authorization 
交易未被批准 
退单报文 
4526 
Illegible Fulfilment 
收单机构书面说明未收到或原始凭
证影印件要素不完整、不清晰 
退单报文 
4527 
Fulfillment Not Received or 
Fulfilled with Response Code 
04 
收单机构查复超过时限或回复码为
04 
退单报文 
4528 
Cancelled Pre-authorization 
已取消的预授权交易 
退单报文 
4531 
Questionable 
Transaction 
Receipt 
持卡人对消费签单其他内容有争议 退单报文 
4532 
Refund Not Processed 
退货交易资金未提交清算 
退单报文 
4536 
Late Presentment 
逾期提交结算 
退单报文 
4544 
Cancelled Transaction 
已撤消的交易 
退单报文 
4557 
Transaction was settled but 
goods or services was not 
received 
已扣帐，但客户未收到商户承诺的
服务或订购的商品 
退单报文 
4558 
Verification for Transaction 
Certificate (TC) Fails 
交易证书TC 验证失败 
退单报文 
4559 
Transaction Certificate (TC) 
and Relevant Calculation Data 
cannot be Provided 
不能提供TC 及相关计算数据 
退单报文 
4562 
Counterfeit Card 
伪卡欺诈 
退单报文 
4570 
Invalid Representment 
再请款不正确 
退单报文 
4571 
New Supporting Documentation 
Provided 
发卡机构能够提供一次退单中缺少
的证明资料 
退单报文 
4572 
Chargeback Reason Adjusted 
发卡机构纠正一次退单原因 
退单报文 
4752 
Fees Refund for Unsuccessful 
Balance Inquiry 
余额查询未成功,索还手续费 
退单报文 
4802 
High Risk Merchant 
高风险商户 
退单报文 
4803 
Prohibited Merchant 
违规拓展商户 
退单报文 
中国银联 
版权所有

---
**[p21]**

Q/CUP 006.6-2015 
13 
代码 
英文定义 
中文定义 
适用范围 
4806 
Paid by Other Means 
以其他方式支付 
退单报文 
4810 
The Cardholder denies the 
Transaction-Non-face-to-face 
Transaction 
持卡人否认交易-非面对面交易 
退单报文 
查询的理由/查复的结果 
6300 
ATM Location Inquiry by Cardholder 
持卡人提出查询ATM 取现地址 
查询消息 
6301 
Merchant Name or Address Inquiry 
by Cardholder 
持卡人提出查询消费商户地址或名
称 
查询消息 
6302 
Transaction Result Inquiry by 
Cardholder 
持卡人提出查询原始交易是否成功 查询消息 
6309 
Inquiry for Prohibited Merchant 
查核商户是否违规拓展商户 
查询消息 
6303 
Transaction Receipt Request by 
Cardholder Directly 
持卡人对原始交易有疑问直接索取
交易凭证 
查询消息 
6304 
Transaction Receipt Request by 
Cardholder after Responded 
Inquiry 
持卡人查询完成后需要索取交易凭
证 
查询消息 
6305 
Transaction Receipt Request 
after Un-responded Inquiry 
查询商户地址或名称后未查复而索
取交易凭证 
查询消息 
6340 
Second Inquiry 
发卡机构查询后仍有疑问，进行二
次查询 
查询消息 
6343 
Transaction Receipt Request by 
Justice  
司法需要索取交易凭证 
查询消息 
6345 
Transaction Receipt Request for 
Fraudulent Transactions 
欺诈分析需要索取交易凭证 
查询消息 
收付费理由，保留使用 
8010 
CUP system performs stand-in fee 
collection or fund disbursement 
银联处理中心代做收付费 
手工收付费 
7525 
 
紧急现金服务费—服务已申请，持
卡人已按约定领取现金 
收/付费报文 
7526 
 
紧急现金服务费—服务已申请，持
卡人未按约定领取现金 
收/付费报文 
7610 
Inquire Retrieval Request 
调单查询 
调单查询 
7611 
Application fee for second 
appeal 
二次申诉申请费 
收/付费报文 
7612 
Disputed amount 
争议资金 
收/付费报文 
7613 
Penalty for late payment of 
disputed amount 
争议延迟付款违约金 
收/付费报文 
7614 
Return interchange fee due to 
incorrect region code 
地区代码填写不规范退还手续费 
收/付费报文 
7620 
Arbitration request/inspect fee 
仲裁请求/检查费 
收/付费报文 
7630 
Authorization processing charge 
授权处理费 
收/付费报文 
7640 
Misc. charges 
杂费 
收/付费报文 
7650 
Service charge for clearing of 
issuer 
发卡方的票据清分服务费 
收/付费报文 
中国银联 
版权所有

---
**[p22]**

Q/CUP 006.6-2015 
14 
 
代码 
英文定义 
中文定义 
适用范围 
7660 
Merchant risk validation fee  
商户风险验证费 
收/付费报文 
7680 
Charge for delayed settlement   清算延误费 
收/付费报文 
7690 
Account follow-up fee 
账户跟踪费 
收/付费报文 
7700 
Value-added tax 
增值税 
收/付费报文 
7710 
Register/annual fee for non 
member 
非成员机构注册费/年费 
收/付费报文 
7720 
Commission charge for chargeback  退单手续费 
收/付费报文 
7730 
Commission charge for 
representment/appeal  
再请款/申诉手续费 
收/付费报文 
7740 
Non performance fee 
不履行费 
收/付费报文 
7750 
BIN copyright and register fee 
BIN 版权和注册费 
收/付费报文 
7760 
Register fee for guaranteed 
member 
被担保成员的注册费 
收/付费报文 
7770 
Charge for data exchange forms 
数据交换报表费 
收/付费报文 
7785 
Service charge/charge for 
postponing  
服务费/延误费 
收/付费报文 
7790 
Repayment 
赔偿费 
收/付费报文 
7800 
Telegraph, telephone and cable 
charge 
电报，电话及电缆费 
收/付费报文 
7810 
Lost card reporting fee 
失窃卡报失费 
收/付费报文 
7820 
Merchant service fee 
商户服务费 
收/付费报文 
9806 
 
技术违规处理费 
收/付费报文 
9807 
 
风险补偿费 
收/付费报文 
贷记调整的原因 
 
 
 
 
9600 
Transaction Cancelled by 
Cardholder 
交易被持卡人取消 
贷记调整报文 
9601 
Surplus of Transaction Amount 
Identified by Acquirer or 
receiver 
收单机构（或转入行）发现长款 
贷记调整报文 
9602 
Non-Disbursement of Cash at ATM 
交易已清算，ATM 未吐钞 
贷记调整报文 
9603 
Partial Disbursement of Cash at ATM 
ATM 部分吐钞 
贷记调整报文 
请款的原因 
9650 
Transaction Amount Differs-
Purchase 
实际消费金额大于记账金额 
请款报文 
9651 
Transaction Amount Differs-ATM 
ATM 吐钞金额大于记账金额 
请款报文 
9652 
Incorrect Credit Adjustment 
贷记调整或退货失误 
请款报文 
9653 
Time Frame for Pre-authorization 
Completion Exceeded 
延期预授权完成 
请款报文 
9654 
Abnormal Reversal Transaction 
异常冲正交易 
请款报文 
9655 
Abnormal Cancellation 
Transaction 
异常撤销交易 
请款报文 
中国银联 
版权所有

---
**[p23]**

Q/CUP 006.6-2015 
15 
代码 
英文定义 
中文定义 
适用范围 
9656 
Transaction Amount Differs-
Purchase Due to System 
Malfunction 
收单机构系统故障导致清算金额小
于消费金额 
请款报文 
9657 
Incorrect Credit Adjustment, 
Manual Refund or Credit Voucher 
贷记调整或手工（单）退货失误 
请款报文 
差错例外的原因 
9700 
Incorrect Credit Adjustment of 
Debit Card 
收单机构借记卡贷记调整失误 
差错例外通知 
9701 
Questionable First Chargeback of 
Debit Card 
对发卡机构借记卡一次退单有疑义 差错例外通知 
9702 
Deficit of Transaction Amount at 
Acquirer 
收单机构原始交易短款 
差错例外通知 
9703 
Time Frame Exceeded 
超过提交时限的差错交易 
差错例外通知 
9704 
General Dispute Resolution Cycle 
Ended 
差错处理流程已经结束但仍未解决 差错例外通知 
9705 
Transaction Record Not Found in 
UPI System 
中心未找到原始交易记录 
差错例外通知 
9706 
Other Mutually Agreed Payment 
其它经协商同意付款的交易 
差错例外通知 
手工退货的原因 
9707 
Manual Refund 
手工退货 
手工退货通知 
托收协商的原因 
9720 
Transaction Amount Differs-
Purchase 
交易金额小于消费金额 
托收协商报文 
9721 
Transaction Amount Differs-ATM 
ATM 吐钞金额大于记账金额 
托收协商报文 
9722 
Incorrect Refund 
退货失误 
托收协商报文 
9723 
Time Frame for Pre-authorization 
Completion Exceeded 
延期预授权完成 
托收协商报文 
9724 
Abnormal Reversal Transaction 
异常冲正交易 
托收协商报文 
9725 
Abnormal Cancellation 
Transaction 
异常撤销交易 
托收协商报文 
A.4 拒绝码 
A.4.1 联机交易拒绝码 
拒绝码说明 
拒绝码由5位代码组成，第一位代表该错误发生的地点：为0表示报文头位元
出错；为1表示报文体位元出错；为2表示由于银联处理中心的原因导致交易被拒
绝。当第一位为0或1时，后3位表示错误发生的位元号，最后1位为错误类型；当
第一位为2时，后四位表示错误的原因。 
拒绝码表 
错误类型码表 
适用于拒绝码的第1位为“0”（报文头位元出错）或“1”（报文体位元出错）
时，拒绝码的最后一位表示该位元的错误类型。 
中国银联 
版权所有

---
**[p24]**

Q/CUP 006.6-2015 
16 
 
表 A.30  错误类型表 
错误类型 
错误描述 
1 
位元总长度有误 
2 
Bit map 非法，位元XXX 不应存在（如：0052，为出现本系统未定义的位元5） 
3 
长度域中出现非法字符 
4 
长度值大于某一特定值 
5 
出现非法字符/非法内容 
6 
缺少必要位元 
注：错误类型2和错误类型6对每一个域都有可能出现，本节以下的列表中不
再一一列举。 
报文头位元的拒绝码表 
表 A.31  报文头位元的拒绝码表 
拒绝码 
错误描述 
位元号 
错误类型 
001 
5 
报文头长度中出现非法字符 
002 
5 
头标识和版本中出现非法字符 
003 
5 
报文总长度中出现非数字字符 
004 
5 
目的ID 中出现非法字字符 
005 
5 
源ID 中出现非法字字符 
006 
5 
保留使用域中出现非法字符 
007 
5 
批次号中出现非数字字符 
008 
5 
保留给银联内部使用中出现非法字符 
报文体位元的拒绝码表 
表 A.32  报文体位元的拒绝码表 
拒绝码 
错误描述 
位元号 
错误类型 
000 
5 
报文类型标识符中出现非数字字符/报文类型标识符非法 
002 
3 
主账号长度域中出现非法字符 
002 
4 
主账号长度值大于19 
002 
5 
主账号中出现非法字符 
003 
5 
非法交易处理码或非法字符 
004 
5 
交易金额中出现非法字符 
005 
5 
清算金额中出现非法字符 
006 
5 
持卡人扣账金额中出现非法字符 
007 
5 
传输日期和时间中出现非法数字或字符 
009 
5 
清算汇率中出现非法字符 
010 
5 
持卡人扣账汇率金额中出现非数字字符 
011 
5 
系统跟踪号中出现非数字字符 
012 
5 
受卡方所在地时间中出现非法数字或字符 
013 
5 
受卡方所在地日期中出现非法数字或字符 
014 
5 
卡有效期中出现非法数字或字符 
015 
5 
清算日期中出现非法数字或字符 
016 
5 
兑换日期中出现非法数字或字符 
018 
5 
商户类型中出现非法字符 
019 
5 
代理机构国家代码中出现非法字符 
022 
5 
服务点输入方式码中出现非法字符 
023 
5 
卡顺序号中出现非法字符 
025 
5 
服务点条件代码中出现非法字符 
026 
5 
服务点PIN 获取码中出现非法字符 
028 
5 
交易费金额中出现非数字字符 
029 
5 
清算费金额中出现非数字字符 
031 
5 
清算处理费金额中出现非数字字符 
中国银联 
版权所有

---
**[p25]**

Q/CUP 006.6-2015 
17 
拒绝码 
错误描述 
位元号 
错误类型 
032 
3 
长度域中出现非法字符 
032 
4 
长度值大于11 
032 
5 
受理机构标识码中出现非法字符 
033 
3 
长度域中出现非法字符 
033 
4 
长度值大于11 
033 
5 
发送机构标识码中出现非法字符 
034 
5 
扩展主帐号中出现非法字符 
035 
3 
长度域中出现非法字符 
035 
4 
长度值大于37 
035 
5 
非法第二磁道内容或出现非法字符 
036 
3 
长度域中出现非法字符 
036 
4 
长度值大于104 
036 
5 
非法第三磁道内容或出现非法字符 
037 
5 
检索参考号中出现非法字符 
038 
5 
授权标识响应中出现非法字符 
039 
5 
应答码中出现非法字符 
040 
5 
服务限制代码中出现非法字符 
041 
5 
非法字符 
042 
5 
非法字符 
043 
5 
非法字符 
044 
3 
长度域中出现非法字符 
044 
4 
长度值大于25 
045 
3 
长度域中出现非法字符 
045 
4 
长度值大于76 
045 
5 
非法字符 
048 
3 
长度域中出现非法字符 
048 
4 
长度值大于512 
048 
5 
非法字符 
049 
5 
交易货币代码中出现非法字符 
050 
5 
清算货币代码中出现非法字符 
051 
5 
持卡人帐户货币代码中出现非数字字符 
053 
5 
安全控制信息中出现非法字符 
054 
3 
长度域中出现非法字符 
054 
4 
长度值不等于40 
054 
5 
附加金额中出现非法字符 
055 
3 
长度域中出现非法字符 
055 
4 
长度值大于100 
055 
5 
非法字符 
057 
3 
长度域中出现非法字符 
057 
4 
长度值大于100 
057 
5 
非法字符 
059 
3 
长度域中出现非法字符 
059 
4 
长度值大于600 
059 
5 
非法字符 
060 
3 
长度域中出现非法字符 
060 
4 
长度值大于100 
060 
5 
非法字符/非法内容 
061 
3 
长度域中出现非法字符 
061 
4 
长度值大于60 
070 
5 
网络管理代码中出现非法代码 
090 
5 
原始数据元中出现非法字符 
100 
3 
长度域中出现非法字符 
100 
4 
长度值大于11 
100 
5 
接收机构标识代码中出现非法字符 
102 
3 
转出帐号的长度位元中出现非法字符 
中国银联 
版权所有

---
**[p26]**

Q/CUP 006.6-2015 
18 
 
拒绝码 
错误描述 
位元号 
错误类型 
102 
4 
长度值大于28 
102 
5 
转出帐号出现非数字字符 
121 
3 
长度域中出现非法字符 
121 
4 
长度值大于100 
121 
5 
非法字符 
122 
3 
长度域中出现非法字符 
122 
4 
长度值大于100 
122 
5 
非法字符 
123 
3 
长度域中出现非法字符 
123 
4 
长度值大于100 
123 
5 
非法字符 
银联处理中心出错拒绝码表 
表 A.33  交换系统出错拒绝码表 
拒绝码 
错误描述 
错误原因 
0000 
银联处理中心系统忙，请求未被处理 
0001 
银联处理中心出错，交易被拒绝 
0002 
银联处理中心处于灾备切换状态中 
特殊取值拒绝码表 
表 A.34  特殊取值拒绝码表 
拒绝码 
错误描述 
09990 
银联处理中心无法对收到的报文进行拆包处理或虽然拆包成功，但却无法识别交易类型 
09991 
无法识别是IC 卡，还是磁条卡，或者是Fall back 卡 
A.4.2 清算文件拒绝码 
拒绝码说明 
拒绝码由两位代码组成，在拒绝文件IFCyymmdd51R中用来表示请款交易的拒
绝原因。 
拒绝码表 
 
51R 文件里面的拒绝码 
(文件记录的第7-8 位) 
含义 
01 
不正确的文件尾记录 
02 
MAC 校验错误 
12 
无效的关联交易 
13 
无效金额 
14 
无效卡号（无此账号） 
15 
无此发卡方 
16 
无法通过卡BIN 确定发卡机构 
25 
无法关联原交易 
40 
未授权的卡BIN 
61 
超出金额限制 
62 
受限制的卡 
94 
重复交易 
F1 
电子现金脱机消费未提交段2 
中国银联 
版权所有

---
**[p27]**

Q/CUP 006.6-2015 
19 
F4 
文件记录错误 
99 
其他 
 
A.5 国家/地区和货币代码 
 入网机构可参考此表，处理银联卡交易的国家/地区代码，以及货币代码。 
 
表 A.34  国家/地区和货币代码表 
 
国家(地区)名称 
国家(地
区)代码 
缩写 
货币名称 
货币代码 
缩写 
小数位 
Afghanistan 
004 
AFG 
Afghani 
971 
AFN 
2 
Albania 
008 
ALB 
Lek 
008 
ALL 
2 
Algeria 
012 
DZA 
Algerian Dinar 
012 
DZD 
2 
American Samoa 
016 
ASM 
U.S. Dollar 
840 
USD 
2 
Andorra 
020 
AND 
Euro 
978 
EUR 
2 
Angola 
024 
AGO 
Angola Kwanza 
973 
AOA 
2 
Anguilla 
660 
AIA 
East 
Caribbean 
Dollar 
951 
XCD 
2 
Antarctica 
010 
ATA 
No universal currency  
Antigua 
and 
Barbuda 
028 
ATG 
East 
Caribbean 
Dollar 
951 
XCD 
2 
Argentina 
032 
ARG 
Argentine Peso 
032 
ARS 
2 
Armenia 
051 
ARM 
Armenian Dram 
051 
AMD 
2 
Aruba 
533 
ABW 
Aruban Guilder 
533 
AWG 
2 
Australia 
036 
AUS 
Australian Dollar 
036 
AUD 
2 
Austria 
040 
AUT 
Euro 
978 
EUR 
2 
Azerbaijan 
031 
AZE 
Azerbaijanian 
Manat 
944 
AZN 
2 
Bahamas 
044 
BHS 
Bahamian Dollar 
044 
BSD 
2 
Bahrain 
048 
BHR 
Bahraini Dinar 
048 
BHD 
3 
Bangladesh 
050 
BGD 
Taka 
050 
BDT 
2 
Barbados 
052 
BRB 
Barbados Dollar 
052 
BBD 
2 
Belarus 
112 
BLR 
Belarussian Ruble 
974 
BYR 
0 
Belgium 
056 
BEL 
Euro 
978 
EUR 
2 
Belize 
084 
BLZ 
Belize Dollar 
084 
BZD 
2 
Benin 
204 
BEN 
CFA Franc BCEAO 
952 
XOF 
0 
Bermuda 
060 
BMU 
Bermudian Dollar 
060 
BMD 
2 
Bhutan 
064 
BTN 
Indian Rupee 
356 
INR 
2 
Ngultrum 
064 
BTN 
2 
Bolivia 
068 
BOL 
Boliviano 
068 
BOB 
2 
Mvdol 
984 
BOV 
2 
中国银联 
版权所有

---
**[p28]**

Q/CUP 006.6-2015 
20 
 
国家(地区)名称 
国家(地
区)代码 
缩写 
货币名称 
货币代码 
缩写 
小数位 
Bosnia 
and 
Herzegovina 
070 
BIH 
Convertible Mark 
977 
BAM 
2 
Botswana 
072 
BWA 
Pula 
072 
BWP 
2 
Bouvet Island 
074 
BVT 
Norwegian Krone 
578 
NOK 
2 
Brazil 
076 
BRA 
Brazilian Real 
986 
BRL 
2 
British 
Indian 
Ocean Territory 
086 
IOT 
U.S. Dollar 
840 
USD 
2 
Brunei 
Darussalam 
096 
BRN 
Brunei Dollar 
096 
BND 
2 
Bulgaria 
100 
BGR 
Bulgarian Lev 
975 
BGN 
2 
Burkina Faso 
854 
BFA 
CFA Franc BCEAO 
952 
XOF 
0 
Burundi 
108 
BDI 
Burundi Franc 
108 
BIF 
0 
Cambodia 
116 
KHM 
Riel 
116 
KHR 
2 
Cameroon 
120 
CMR 
CFA Franc BEAC 
950 
XAF 
0 
Canada 
124 
CAN 
Canadian Dollar 
124 
CAD 
2 
Cape Verde 
132 
CPV 
Cape Verde Escudo 
132 
CVE 
2 
Cayman Islands 
136 
CYM 
Cayman 
Islands 
Dollar 
136 
KYD 
2 
Central 
African 
Republic 
140 
CAF 
CFA Franc BEAC 
950 
XAF 
0 
Chad 
148 
TCD 
CFA Franc BEAC 
950 
XAF 
0 
Chile 
152 
CHL 
Chilean Peso 
152 
CLP 
0 
Unidades 
de 
fomento 
990 
CLF 
0 
China 
156 
CHN 
Yuan Renminbi 
156 
CNY 
2 
Christmas Island 
162 
CXR 
Australian Dollar 
036 
AUD 
2 
Cocos 
(Keeling) 
Islands 
166 
CCK 
Australian Dollar 
036 
AUD 
2 
Colombia 
170 
COL 
Colombian Peso 
170 
COP 
2 
Unidad 
de 
Valor 
Real 
970 
COU 
2 
Comoros 
174 
COM 
Comoro Franc 
174 
KMF 
0 
Congo 
178 
COG 
CFA Franc BEAC 
950 
XAF 
0 
 Congo(the 
Democratic 
Republic of the 
congo) 
180 
COD 
Congolese Franc 
976 
CDF 
2 
Cook Islands 
184 
COK 
New Zealand Dollar 
554 
NZD 
2 
Costa Rica 
188 
CRI 
Costa Rican Colon 
188 
CRC 
2 
Côte D’Ivoire 
384 
CIV 
CFA Franc BCEAO 
952 
XOF 
0 
中国银联 
版权所有

---
**[p29]**

Q/CUP 006.6-2015 
21 
国家(地区)名称 
国家(地
区)代码 
缩写 
货币名称 
货币代码 
缩写 
小数位 
Croatia 
191 
HRV 
Kuna 
191 
HRK 
2 
Cuba 
192 
CUB 
Cuban Peso 
192 
CUP 
2 
Peso Convertible 
931 
CUC 
2 
Curaçao 
531 
CUW 
Netherlands 
Antillean Guilder 
532 
ANG 
2 
Cyprus 
196 
CYP 
Euro 
978 
EUR 
2 
Czech Republic 
203 
CZE 
Koruna 
203 
CZK 
2 
Denmark 
208 
DNK 
Danish Krone 
208 
DKK 
2 
Djibouti 
262 
DJI 
Djibouti Franc 
262 
DJF 
0 
Dominica 
212 
DMA 
East 
Caribbean 
Dollar 
951 
XCD 
2 
Dominican 
Republic 
214 
DOM 
Dominican Peso 
214 
DOP 
2 
East Timor 
626 
TMP 
Rupiah 
360 
IDR 
21 
Ecuador 
218 
ECU 
U.S.Dollar 
840 
USD 
2 
Egypt 
818 
EGY 
Egyptian Pound 
818 
EGP 
2 
El Salvador 
222 
SLV 
El Salvador Colon  
222 
SVC 
2 
U.S.Dollar 
840 
USD 
2 
Equatorial 
Guinea 
226 
GNQ 
CFA Franc BEAC 
950 
XAF 
0 
Eritrea 
232 
ERI 
Nafka 
232 
ERN 
2 
Estonia 
233 
EST 
Euro 
978 
EUR 
2 
Ethiopia 
230 
ETH 
Ethiopian Birr 
230 
ETB 
2 
Faroe Islands 
234 
FRO 
Danish Krone 
208 
DKK 
2 
Falkland Islands 
(Malvinas) 
238 
FLK 
Falkland 
Islands 
Pound 
238 
FKP 
2 
Fiji 
242 
FJI 
Fiji Dollar 
242 
FJD 
2 
Finland 
246 
FIN 
Euro 
978 
EUR 
2 
France 
250 
FRA 
Euro 
978 
EUR 
2 
France, 
Metropolitan 
249 
FXX 
Euro 
978 
EUR 
2 
French Guiana 
254 
GUF 
Euro 
978 
EUR 
2 
French Polynesia 
258 
PYF 
CFP Franc 
953 
XPF 
0 
French Southern 
Territories 
260 
ATF 
Euro 
978 
EUR 
2 
Gabon 
266 
GAB 
CFA Franc BEAC 
950 
XAF 
0 
Gambia 
270 
GMB 
Dalasi 
270 
GMD 
2 
                                                             
1 印尼盾小数位将调整为2 位，2014 年10 月生效。银联国际将通过公告发布具
体实施安排。 
中国银联 
版权所有

---
**[p30]**

Q/CUP 006.6-2015 
22 
 
国家(地区)名称 
国家(地
区)代码 
缩写 
货币名称 
货币代码 
缩写 
小数位 
Georgia 
268 
GEO 
Lari 
981 
GEL 
2 
Germany 
276 
DEU 
Euro 
978 
EUR 
2 
Ghana 
288 
GHA 
Cedi 
936 
GHS 
2 
Gibraltar 
292 
GIB 
Gibraltar Pound 
292 
GIP 
2 
Greece 
300 
GRC 
Euro 
978 
EUR 
2 
Greenland 
304 
GRL 
Danish Krone 
208 
DKK 
2 
Grenada 
308 
GRD 
East 
Caribbean 
Dollar 
951 
XCD 
2 
Guadeloupe 
312 
GLP 
Euro 
978 
EUR 
2 
Guam 
316 
GUM 
U.S. Dollar 
840 
USD 
2 
Guatemala 
320 
GTM 
Quetzal 
320 
GTQ 
2 
Guinea 
324 
GIN 
Guinea Franc 
324 
GNF 
0 
Guinea-Bissau 
624 
GNB 
CFA Franc BCEAO 
952 
XOF 
0 
Guyana 
328 
GUY 
Guyana Dollar 
328 
GYD 
2 
Haiti 
332 
HTI 
Gourde  
332 
HTG 
2 
US Dollar 
840 
USD  
2 
Heard 
and 
McDonald 
Islands 
334 
HMD 
Australian Dollar 
036 
AUD 
2 
Honduras 
340 
HND 
Lempira 
340 
HNL 
2 
Hong Kong 
344 
HKG 
Hong Kong Dollar 
344 
HKD 
2 
Hungary 
348 
HUN 
Forint 
348 
HUF 
2 
Iceland 
352 
ISL 
Iceland Krona 
352 
ISK 
2 
India 
356 
IND 
Indian Rupee 
356 
INR 
2 
Indonesia 
360 
IDN 
Rupiah 
360 
IDR 
22 
Iran, 
Islamic 
Republic of 
364 
IRN 
Iranian Rial 
364 
IRR 
2 
Iraq 
368 
IRQ 
Iraqi Dinar 
368 
IQD 
3 
Ireland 
372 
IRL 
Euro 
978 
EUR 
2 
Isle of Man 
833 
IMN 
Pound Sterling 
826 
GBP 
2 
Israel 
376 
ISR 
Israeli Shekel 
376 
ILS 
2 
Italy 
380 
ITA 
Euro 
978 
EUR 
2 
Jamaica 
388 
JAM 
Jamaican Dollar 
388 
JMD 
2 
Japan 
392 
JPN 
Yen 
392 
JPY 
0 
Jordan 
400 
JOR 
Jordanian Dinar 
400 
JOD 
3 
Kazakhstan 
398 
KAZ 
Tenge 
398 
KZT 
2 
Kenya 
404 
KEN 
Kenyan Shilling 
404 
KES 
2 
                                                             
2 印尼盾小数位将调整为2 位，2014 年10 月生效。银联国际将通过公告发布具
体实施安排。 
中国银联 
版权所有

---
**[p31]**

Q/CUP 006.6-2015 
23 
国家(地区)名称 
国家(地
区)代码 
缩写 
货币名称 
货币代码 
缩写 
小数位 
Kiribati 
296 
KIR 
Australian Dollar 
036 
AUD 
2 
Korea, 
Democratic 
People’s 
Republic of 
408 
PRK 
North Korean Won 
408 
KPW 
2 
Korea, Republic 
of 
410 
KOR 
Won 
410 
KRW 
0 
Kuwait 
414 
KWT 
Kuwaiti Dinar 
414 
KWD 
3 
Kyrgyzstan 
417 
KGZ 
SOM 
417 
KGS 
2 
Lao 
People’s 
Democratic 
Republic 
418 
LAO 
Kip 
418 
LAK 
2 
Latvia 
428 
LVA 
Euro 
978 
EUR 
2 
Lebanon 
422 
LBN 
Lebanese Pound 
422 
LBP 
2 
Lesotho 
426 
LSO 
Loti  
426 
LSL 
2 
Rand 
710 
ZAR 
2 
Liberia 
430 
LBR 
Liberian Dollar 
430 
LRD 
2 
Libya 
434 
LBY 
Libyan Dinar 
434 
LYD 
3 
Liechtenstein 
438 
LIE 
Swiss Franc 
756 
CHF 
2 
Lithuania 
440 
LTU 
Euro 
978 
EUR 
2 
Luxembourg 
442 
LUX 
Euro 
978 
EUR 
2 
Macau 
446 
MAC 
Pataca 
446 
MOP 
2 
Macedonia 
807 
MKD 
Denar 
807 
MKD 
2 
Madagascar 
450 
MDG 
Malagasy Ariary 
969 
MGA 
2 
Malawi 
454 
MWI 
Kwacha 
454 
MWK 
2 
Malaysia 
458 
MYS 
Malaysian Ringgit 
458 
MYR 
2 
Maldives 
462 
MDV 
Rufiyaa 
462 
MVR 
2 
Mali 
466 
MLI 
CFA Franc BCEAO 
952 
XOF 
0 
Malta 
470 
MLT 
Euro 
978 
EUR 
2 
Marshall Islands 
584 
MHL 
U.S. Dollar 
840 
USD 
2 
Martinique 
474 
MTQ 
Euro 
978 
EUR 
2 
Mauritania 
478 
MRT 
Ouguiya 
478 
MRO 
2 
Mauritius 
480 
MUS 
Mauritius Rupee 
480 
MUR 
2 
Mayotte 
175 
MYT 
Euro 
978 
EUR 
2 
Mexico 
484 
MEX 
Mexican Peso 
484 
MXN 
2 
Micronesia 
583 
FSM 
U.S. Dollar 
840 
USD 
2 
Midway Islands 
488 
MID 
U.S. Dollar 
840 
USD 
2 
Moldova, 
Republic of 
498 
MDA 
Moldovan Leu 
498 
MDL 
2 
Monaco 
492 
MCO 
Euro 
978 
EUR 
2 
中国银联 
版权所有

---
**[p32]**

Q/CUP 006.6-2015 
24 
 
国家(地区)名称 
国家(地
区)代码 
缩写 
货币名称 
货币代码 
缩写 
小数位 
Mongolia 
496 
MNG 
Tugrik 
496 
MNT 
2 
Montenegro 
499 
MNE 
Euro 
978 
EUR 
2 
Montserrat 
500 
MSR 
East 
Caribbean 
Dollar 
951 
XCD 
2 
Morocco 
504 
MAR 
Moroccan Dirham 
504 
MAD 
2 
Mozambique 
508 
MOZ 
Metical 
943 
MZN 
2 
Myanmar 
104 
MMR 
Kyat 
104 
MMK 
2 
Namibia 
516 
NAM 
Dollar 
516 
NAD 
2 
Nauru 
520 
NRU 
South African Rand 
710 
ZAR 
2 
Nauru 
520 
NRU 
Australian Dollar 
036 
AUD 
2 
Nepal 
524 
NPL 
Nepalese Rupee 
524 
NPR 
2 
Netherlands 
528 
NLD 
Euro 
978 
EUR 
2 
Netherlands 
Antilles 
530 
ANT 
Netherlands 
Antillian Guilder 
532 
ANG 
2 
New Caledonia 
540 
NCL 
CFP Franc 
953 
XPF 
0 
New Zealand 
554 
NZL 
New Zealand Dollar 
554 
NZD 
2 
Nicaragua 
558 
NIC 
Cordoba Oro 
558 
NIO 
2 
Niger 
562 
NER 
CFA Franc BCEAO  
952 
XOF 
0 
Nigeria 
566 
NGA 
Naira 
566 
NGN 
2 
Niue 
570 
NIU 
New Zealand Dollar 
554 
NZD 
2 
Norfolk Island 
574 
NFK 
Australian Dollar 
036 
AUD 
2 
Northern 
Mariana Islands 
580 
MNP 
U.S. Dollar 
840 
USD 
2 
Norway 
578 
NOR 
Norwegian Krone 
578 
NOK 
2 
Oman 
512 
OMN 
Rial Omani 
512 
OMR 
3 
Pakistan 
586 
PAK 
Pakistan Rupee 
586 
PKR 
2 
Palau 
585 
PLW 
U.S. Dollar 
840 
USD 
2 
Palestinian 
(Palestine) 
275 
PSE 
U.S. Dollar 
840 
USD 
2 
Panama 
591 
PAN 
Balboa 
590 
PAB 
2 
U.S. Dollar 
840 
USD 
2 
Papua 
New 
Guinea 
598 
PNG 
Kina 
598 
PGK 
2 
Paraguay 
600 
PRY 
Guarani 
600 
PYG 
0 
Peru 
604 
PER 
Nuevo Sol 
604 
PEN 
2 
Philippines 
608 
PHL 
Philippine Peso 
608 
PHP 
2 
Pitcairn 
612 
PCN 
New Zealand Dollar 
554 
NZD 
2 
Poland 
616 
POL 
Zloty 
985 
PLN 
2 
Portugal 
620 
PRT 
Euro 
978 
EUR 
2 
中国银联 
版权所有

---
**[p33]**

Q/CUP 006.6-2015 
25 
国家(地区)名称 
国家(地
区)代码 
缩写 
货币名称 
货币代码 
缩写 
小数位 
Puerto Rico 
630 
PRI 
U.S. Dollar 
840 
USD 
2 
Qatar 
634 
QAT 
Qatari Rial 
634 
QAR 
2 
Réunion 
638 
REU 
Euro 
978 
EUR 
2 
Romania 
642 
 
ROM 
Romanian Leu 
946 
RON 
2 
Russian 
Federation 
643 
RUS 
New Ruble（Russian 
Ruble） 
643 
RUB 
2 
Rwanda 
646 
RWA 
Rwanda Franc 
646 
RWF 
0 
Saint Barthelemy 652 
BLM 
Euro 
978 
EUR 
2 
Saint 
Martin 
(French part) 
663 
MAF 
Euro 
978 
EUR 
2 
Samoa 
882 
WSM 
Tala 
882 
WST 
2 
San Marino 
674 
SMR 
Euro 
978 
EUR 
2 
Sao Tome and 
Principe 
678 
STP 
Dobra 
678 
STD 
2 
Saudi Arabia 
682 
SAU 
Saudi Riyal 
682 
SAR 
2 
Senegal 
686 
SEN 
CFA Franc BCEAO 
952 
XOF 
0 
Serbia 
and 
Montenegro 
891 
YUG 
Serbian Dinar 
941 
RSD 
2 
Serbia 
688 
SRB 
Serbian Dinar 
941 
RSD 
2 
Seychelles 
690 
SYC 
Seychelles Rupee 
690 
SCR 
2 
Sierra Leone 
694 
SLE 
Leone 
694 
SLL 
2 
Singapore 
702 
SGP 
Singapore Dollar 
702 
SGD 
2 
Sint 
Maarten 
(Dutch part) 
534 
SXM 
Netherlands 
Antillean Guilder 
532 
ANG 
2 
Slovakia 
703 
SVK 
Euro 
978 
EUR 
2 
Slovenia 
705 
SVN 
Euro 
978 
EUR 
2 
Solomon Islands 
090 
SLB 
Solomon 
Islands 
Dollar 
090 
SBD 
2 
Somalia 
706 
SOM 
Somali Shilling 
706 
SOS 
2 
South Africa 
710 
ZAF 
Rand 
710 
ZAR 
2 
South 
Georgia 
and The South 
Sandwich Islands 
239 
SGS 
No universal currency 
South Sudan 
728 
SSD 
South Sudanese Po
und 
728 
SSP 
2 
Spain 
724 
ESP 
Euro 
978 
EUR 
2 
Sri Lanka 
144 
LKA 
Sri Lanka Rupee 
144 
LKR 
2 
St. Helena 
654 
SHN 
St. Helena Pound 
654 
SHP 
2 
St. Kitts-Nevis 
659 
KNA 
East 
Caribbean 951 
XCD 
2 
中国银联 
版权所有

---
**[p34]**

Q/CUP 006.6-2015 
26 
 
国家(地区)名称 
国家(地
区)代码 
缩写 
货币名称 
货币代码 
缩写 
小数位 
Dollar 
St. Lucia 
662 
LCA 
East 
Caribbean 
Dollar 
951 
XCD 
2 
St. 
Pierre 
and 
Miquelon 
666 
SPM 
Euro 
978 
EUR 
2 
Saint 
Vincent 
and 
the 
Grenadines 
670 
VCT 
East 
Caribbean 
Dollar 
951 
XCD 
2 
Sudan 
736 
SDN 
Sudanese Pound 
938 
SDG 
2 
Suriname 
740 
SUR 
Surinam Dollar 
968 
SRD 
2 
Svalbard and Jan 
Mayen Islands 
744 
SJM 
Norwegian Krone 
578 
NOK 
2 
Swaziland 
748 
SWZ 
Lilangeni 
748 
SZL 
2 
Sweden 
752 
SWE 
Swedish Krona 
752 
SEK 
2 
Switzerland 
756 
CHE 
Swiss Franc 
756 
CHF 
2 
Syrian 
Arab 
Republic 
760 
SYR 
Syrian Pound 
760 
SYP 
2 
Taiwan 
158 
TWN 
New Taiwan Dollar 
901 
TWD 
2 
Tajikistan 
762 
TJK 
Somoni 
972 
TJS 
2 
Tanzania, United 
Republic of 
834 
TZA 
Tanzanian Shilling 
834 
TZS 
2 
Thailand 
764 
THA 
Baht 
764 
THB 
2 
Togo 
768 
TGO 
CFA Franc BCEAO  
952 
XOF 
0 
Tokelau 
772 
TKL 
New Zealand Dollar 
554 
NZD 
2 
Tonga 
776 
TON 
Pa’anga 
776 
TOP 
2 
Trinidad 
and 
Tobago 
780 
TTO 
Trinidad and Tobago 
Dollar 
780 
TTD 
2 
Tunisia 
788 
TUN 
Tunisian Dinar 
788 
TND 
3 
Turkey 
792 
TUR 
New Turkish Lira 
949 
TRY 
2 
Turkmenistan 
795 
TKM 
New Manat 
934 
TMT 
2 
Turks and Caicos 
Islands 
796 
TCA 
U.S. Dollar 
840 
USD 
2 
Tuvalu 
798 
TUV 
Australian Dollar 
036 
AUD 
2 
U.S. 
Minor 
Outlying Islands 
581 
UMI 
U.S. Dollar 
840 
USD 
2 
Uganda 
800 
UGA 
Uganda Shilling 
800 
UGX 
0 
Ukraine 
804 
UKR 
Hryvnia 
980 
UAH 
2 
United 
Arab 
Emirates 
784 
ARE 
UAE Dirham 
784 
AED 
2 
中国银联 
版权所有

---
**[p35]**

Q/CUP 006.6-2015 
27 
国家(地区)名称 
国家(地
区)代码 
缩写 
货币名称 
货币代码 
缩写 
小数位 
United Kingdom 
826 
GBR 
Pound Sterling 
826 
GBP 
2 
United States 
840 
USA 
U.S. Dollar 
840 
USD 
2 
Uruguay 
858 
URY 
Peso Uruguayo 
858 
UYU 
2 
Uzbekistan 
860 
UZB 
Uzbekistan Sum 
860 
UZS 
2 
Vanuatu 
548 
VUT 
Vatu 
548 
VUV 
0 
Holy See (Vatican 
City State) 
336 
VAT 
Euro 
978 
EUR 
2 
Venezuela 
862 
VEN 
Bolivar 
937 
VEF 
2 
Vietnam 
704 
VNM 
Dong 
704 
VND 
03 
Virgin 
Islands, 
British 
092 
VGB 
U.S. Dollar 
840 
USD 
2 
Virgin 
Islands, 
U.S. 
850 
VIR 
U.S. Dollar 
840 
USD 
2 
Wake Island 
872 
WAK 
U.S. Dollar 
840 
USD 
2 
Wallis 
and 
Futuna Islands 
876 
WLF 
CFP Franc 
953 
XPF 
0 
Western Sahara 
732 
ESH 
Moroccan Dirham 
504 
MAD 
2 
Yemen 
887 
YEM 
Yemen Rial 
886 
YER 
2 
Zambia 
894 
ZMB 
Kwacha 
967 
ZMW 
2 
Zimbabwe 
716 
ZWE 
Zimbabwe Dollar 
932 
ZWL 
2 
 
A.6 标准ASCII可打印字符 
入网机构可参考此表，作为标准ASCII可打印字符集。 
表 A.35  标准ASCII 可打印字符表 
                                                             
3 从13 年4 月开始，越南盾将小数点调整为0。  
二进制 
八进
制 
十进
制 
十六
进制 
字符 
二进制 
八进
制 
十进
制 
十六
进制 
字符 
0010 0000 
40 
32 
20 
(space) 
0101 0000 
120 
80 
50 
P 
0010 0001 
41 
33 
21 
! 
0101 0001 
121 
81 
51 
Q 
0010 0010 
42 
34 
22 
" 
0101 0010 
122 
82 
52 
R 
0010 0011 
43 
35 
23 
# 
0101 0011 
123 
83 
53 
S 
0010 0100 
44 
36 
24 
$ 
0101 0100 
124 
84 
54 
T 
0010 0101 
45 
37 
25 
% 
0101 0101 
125 
85 
55 
U 
0010 0110 
46 
38 
26 
& 
0101 0110 
126 
86 
56 
V 
0010 0111 
47 
39 
27 
' 
0101 0111 
127 
87 
57 
W 
0010 1000 
50 
40 
28 
( 
0101 1000 
130 
88 
58 
X 
0010 1001 
51 
41 
29 
) 
0101 1001 
131 
89 
59 
Y 
中国银联 
版权所有

---
**[p36]**

Q/CUP 006.6-2015 
28 
 
 
 
0010 1010 
52 
42 
2A 
* 
0101 1010 
132 
90 
5A 
Z 
0010 1011 
53 
43 
2B 
+ 
0101 1011 
133 
91 
5B 
[ 
0010 1100 
54 
44 
2C 
, 
0101 1100 
134 
92 
5C 
\ 
0010 1101 
55 
45 
2D 
- 
0101 1101 
135 
93 
5D 
] 
0010 1110 
56 
46 
2E 
. 
0101 1110 
136 
94 
5E 
^ 
0010 1111 
57 
47 
2F 
/ 
0101 1111 
137 
95 
5F 
_ 
0011 0000 
60 
48 
30 
0 
0110 0000 
140 
96 
60 
` 
0011 0001 
61 
49 
31 
1 
0110 0001 
141 
97 
61 
a 
0011 0010 
62 
50 
32 
2 
0110 0010 
142 
98 
62 
b 
0011 0011 
63 
51 
33 
3 
0110 0011 
143 
99 
63 
c 
0011 0100 
64 
52 
34 
4 
0110 0100 
144 
100 
64 
d 
0011 0101 
65 
53 
35 
5 
0110 0101 
145 
101 
65 
e 
0011 0110 
66 
54 
36 
6 
0110 0110 
146 
102 
66 
f 
0011 0111 
67 
55 
37 
7 
0110 0111 
147 
103 
67 
g 
0011 1000 
70 
56 
38 
8 
0110 1000 
150 
104 
68 
h 
0011 1001 
71 
57 
39 
9 
0110 1001 
151 
105 
69 
i 
0011 1010 
72 
58 
3A 
: 
0110 1010 
152 
106 
6A 
j 
0011 1011 
73 
59 
3B 
; 
0110 1011 
153 
107 
6B 
k 
0011 1100 
74 
60 
3C 
< 
0110 1100 
154 
108 
6C 
l 
0011 1101 
75 
61 
3D 
= 
0110 1101 
155 
109 
6D 
m 
0011 1110 
76 
62 
3E 
> 
0110 1110 
156 
110 
6E 
n 
0011 1111 
77 
63 
3F 
? 
0110 1111 
157 
111 
6F 
o 
0100 0000 
100 
64 
40 
@ 
0111 0000 
160 
112 
70 
p 
0100 0001 
101 
65 
41 
A 
0111 0001 
161 
113 
71 
q 
0100 0010 
102 
66 
42 
B 
0111 0010 
162 
114 
72 
r 
0100 0011 
103 
67 
43 
C 
0111 0011 
163 
115 
73 
s 
0100 0100 
104 
68 
44 
D 
0111 0100 
164 
116 
74 
t 
0100 0101 
105 
69 
45 
E 
0111 0101 
165 
117 
75 
u 
0100 0110 
106 
70 
46 
F 
0111 0110 
166 
118 
76 
v 
0100 0111 
107 
71 
47 
G 
0111 0111 
167 
119 
77 
w 
0100 1000 
110 
72 
48 
H 
0111 1000 
170 
120 
78 
x 
0100 1001 
111 
73 
49 
I 
0111 1001 
171 
121 
79 
y 
0100 1010 
112 
74 
4A 
J 
0111 1010 
172 
122 
7A 
z 
0100 1011 
113 
75 
4B 
K 
0111 1011 
173 
123 
7B 
{ 
0100 1100 
114 
76 
4C 
L 
0111 1100 
174 
124 
7C 
| 
0100 1101 
115 
77 
4D 
M 
0111 1101 
175 
125 
7D 
} 
0100 1110 
116 
78 
4E 
N 
0111 1110 
176 
126 
7E 
~ 
0100 1111 
117 
79 
4F 
O 
 
 
 
 
 
中国银联 
版权所有

---
**[p37]**

Q/CUP 006.6-2015 
29 
附 录 B 
（资料性附录） 
交易种类区分表 
注：附录B 中，交易对应的“第3 域取值”，对每个交易，其前两位固定取值（用于区分交易
类型），后四位为建议参考值（不用于区分交易类型），但后四位的取值必须符合规范第2 部
分对第3 域定义的取值要求和范围。 
 
B.1 单信息金融、授权类请求、通知交易 
下表包含银联卡跨境业务中所涵盖的所有此类交易类型。 
表 B.1  单信息金融、授权类请求、通知及其相关代授权通知交易种类区分表 
交易
类型 
交易名称 
消息类型 
（请求/应
答） 
第3 域取
值 
第18 域取
值 
第25
域取值 
第60.2.5
域取值 
余额
查询 
ATM 余额查
询 
0200/0210 
30x000 
6011 
02 
01 
余额查询 
0200/0210 
30x000 
非6011 
00 
根据交易发
起渠道取值 
取现 
ATM 取现 
0200/0210 
01x000 
6011 
02 
01 
柜面取现 
0200/0210 
01x000 
6010 
00 
06 
取现
冲正 
ATM 取现冲
正 
0420/0430 
01x000 
6011 
02 
01 
柜面取现冲
正 
0420/0430 
01x000 
6010 
00 
06 
汇款 
汇款验证 
0100/0110 
24x000 
根据实际情
况取值 
00 
根据交易发
起渠道取值 
汇款（联
机） 
0200/0210 
24x000 
根据实际情
况取值 
00 
根据交易发
起渠道取值 
手工汇款 
0200 
24x000 
根据实际情
况取值 
00 
12 
预授
权 
预授权 
0100/0110 
03x000 
非6010、
6011 
06 
根据交易发
起渠道取值 
预授
权撤
销 
预授权撤销 
0100/0110 
20x000 
非6010、
6011 
06 
根据交易发
起渠道取值 
手工预授权
撤消 
0100/0110 
20x000 
非6010、
6011 
06 
12 
预授
权冲
正 
预授权冲正 
 
0420/0430 
 
03x000 
 
非6010、
6011 
 
06 
 
根据交易发
起渠道取值 
 
预授
权撤
销冲
正 
预授权撤销
冲正 
0420/0430 
20x000 
非6010、
6011 
06 
根据交易发
起渠道取值 
手工预授权
撤消冲正 
0420/0430 
20x000 
非6010、
6011 
06 
12 
预授
权完
成 
预授权完成
（请求） 
0200/0210 
00x000 
非6010、
6011 
06 
根据交易发
起渠道取值 
预授权完成
（通知） 
0220/0230 
00x000 
非6010、
6011 
06 
根据交易发
起渠道取值 
手工预授权
完成 
0220 
00x000 
非6010、
6011 
06 
12 
中国银联 
版权所有

---
**[p38]**

Q/CUP 006.6-2015 
30 
 
交易
类型 
交易名称 
消息类型 
（请求/应
答） 
第3 域取
值 
第18 域取
值 
第25
域取值 
第60.2.5
域取值 
预授
权完
成撤
销 
预授权完成
撤销 
0200/0210 
20x000 
非6010、
6011 
06 
根据交易发
起渠道取值 
预授
权完
成冲
正 
预授权完成
冲正 
0420/0430 
00x000 
非6010、
6011 
06 
根据交易发
起渠道取值 
预授
权完
成撤
销冲
正 
预授权完成
撤销冲正 
0420/0430 
20x000 
非6010、
6011 
06 
根据交易发
起渠道取值 
预授
权 
MOTO 预授权 
0100/0110 
03x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
预授
权撤
销 
MOTO 预授权
撤销 
0100/0110 
20x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
手工MOTO 预
授权撤消 
0100/0110 
20x000 
非6010、
6011 
18 
12 
预授
权冲
正 
MOTO 预授权
冲正 
0420/0430 
03x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
预授
权撤
销冲
正 
MOTO 预授权
撤销冲正 
0420/0430 
20x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
手工MOTO 预
授权撤消冲
正 
0420/0430 
20x000 
非6010、
6011 
18 
12 
预授
权完
成 
MOTO 预授权
完成（请
求） 
0200/0210 
00x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
MOTO 预授权
完成（通
知） 
0220/0230 
00x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
手工MOTO 预
授权完成 
0220 
00x000 
非6010、
6011 
18 
12 
预授
权完
成撤
销 
MOTO 预授权
完成撤销 
0200/0210 
20x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
预授
权完
成
（请
求）
冲正 
MOTO 预授权
完成（请
求）冲正 
0420/0430 
00x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
预授
权完
成撤
销冲
正 
MOTO 预授权
完成撤销冲
正 
0420/0430 
20x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
代收 
代收 
0200/0210 
00x000 
非6010、
6011 
28 
根据交易发
起渠道取值 
代收
冲正 
代收冲正 
0420/0430 
00x000 
非6010、
6011 
28 
根据交易发
起渠道取值 
中国银联 
版权所有

---
**[p39]**

Q/CUP 006.6-2015 
31 
交易
类型 
交易名称 
消息类型 
（请求/应
答） 
第3 域取
值 
第18 域取
值 
第25
域取值 
第60.2.5
域取值 
代收
撤销 
代收撤销 
0200/0210 
20x000 
非6010、
6011 
28 
根据交易发
起渠道取值 
代收
撤销
冲正 
代收撤销冲
正 
0420/0430 
20x000 
非6010、
6011 
28 
根据交易发
起渠道取值 
消费 
消费（一次
性付款） 
0200/0210 
00x000 
非6010、
6011 
00 
根据交易发
起渠道取值 
消费
冲正 
消费（一次
性付款）冲
正 
0420/0430 
00x000 
非6010、
6011 
00 
根据交易发
起渠道取值 
消费
撤销 
消费（一次
性付款）撤
销 
0200/0210 
20x000 
非6010、
6011 
00 
根据交易发
起渠道取值 
消费
撤销
冲正 
消费（一次
性付款）撤
销冲正 
0420/0430 
20x000 
非6010、
6011 
00 
根据交易发
起渠道取值 
消费 
消费（分期
付款） 
0200/0210 
00x000 
非6010、
6011 
64 
根据交易发
起渠道取值 
消费
冲正 
消费（分期
付款）冲正 
0420/0430 
00x000 
非6010、
6011 
64 
根据交易发
起渠道取值 
消费
撤销 
消费（分期
付款）撤销 
0200/0210 
20x000 
非6010、
6011 
64 
根据交易发
起渠道取值 
消费
撤销
冲正 
消费（分期
付款）撤销
冲正 
0420/0430 
20x000 
非6010、
6011 
64 
根据交易发
起渠道取值 
消费 
MOTO 消费 
0200/0210 
00x000 
非6010、
6011 
08 
根据交易发
起渠道取值 
消费
冲正 
MOTO 消费冲
正 
0420/0430 
00x000 
非6010、
6011 
08 
根据交易发
起渠道取值 
消费
撤销 
MOTO 消费撤
销 
0200/0210 
20x000 
非6010、
6011 
08 
根据交易发
起渠道取值 
消费
撤销
冲正 
MOTO 消费撤
销冲正 
0420/0430 
20x000 
非6010、
6011 
08 
根据交易发
起渠道取值 
退货 
退货（联
机） 
0220/0230 
20x000 
非6010、
6011 
00 
根据交易发
起渠道取值 
MOTO 退货
（联机） 
0220/0230 
20x000 
非6010、
6011 
08 
根据交易发
起渠道取值 
分期付款退
货（联机） 
0220/0230 
20x000 
非6010、
6011 
64 
根据交易发
起终端取值 
手工退货 
（包含查找
到原始交易
和无法查找
到原始交易
两种） 
0220 
20x000 
非6010、
6011 
61 
12 
手工单退货 
0220 
20x000 
非6010、
6011 
62 
12 
结算
通知 
结算通知 
0220/0230 
00x000 
非6010、
6011 
06 
根据交易发
起渠道取值 
MOTO 结算通
知 
0220/0230 
00x000 
非6010、
6011 
18 
根据交易发
起渠道取值 
中国银联 
版权所有

---
**[p40]**

Q/CUP 006.6-2015 
32 
 
交易
类型 
交易名称 
消息类型 
（请求/应
答） 
第3 域取
值 
第18 域取
值 
第25
域取值 
第60.2.5
域取值 
基于
UICS
借贷
记标
准的
电子
现金
的
IC
卡指
定账
户圈
存 
基于UICS 借
贷记标准的
电子现金的
IC 卡指定账
户圈存 
0200/0210 
60x000 
根据实际情
况填写 
91 
根据交易发
起渠道取值 
基于UICS 借
贷记标准的
电子现金的
IC 卡指定账
户圈存冲正 
0420/0430 
60x000 
根据实际情
况填写 
91 
根据交易发
起渠道取值 
基于
UICS
借贷
记标
准的
电子
现金
的
IC
卡现
金充
值 
现金充值 
0200/0210 
63x000 
根据实际情
况填写 
91 
根据交易发
起渠道取值 
现金充值冲
正 
0420/0430 
63x000 
根据实际情
况填写 
91 
根据交易发
起渠道取值 
委托
关系 
建立委托关
系 
0100/0110 
89X000 
根据实际情
况填写 
00 
根据交易发
起渠道取值 
建立委托关
系冲正 
0420/0430 
89X000 
根据实际情
况填写 
00 
根据交易发
起渠道取值 
撤销委托关
系 
0100/0110 
92X000 
根据实际情
况填写 
00 
根据交易发
起渠道取值 
撤销委托关
系冲正 
0420/0430 
92X000 
根据实际情
况填写 
00 
根据交易发
起渠道取值 
账户
验证 
账户验证 
0100/0110 
33X000 
根据实际情
况填写 
00 
根据交易发
起渠道取值 
代付 
代付 
0200/0210 
29X000 
根据实际情
况填写 
00 
根据交易发
起渠道取值 
代付
确认 
代付确认 
0220/0230 
29X000 
根据实际情
况填写 
68 
根据交易发
起渠道取值 
B.2 双信息交易 
下表包含银联卡跨境业务中所涵盖的所有此类交易类型。 
表 B.2  双信息交易及其代授权通知交易种类区分表 
交
易
类
型 
交易名称 
消息类型 
（请求/应
答） 
第3 域
取值 
第18 域取
值 
第25 域取值 
第60.2.5 域取
值 
余
额
查
询 
余额查询 
0100/0110 
30x000 
非6011 
00 
根据交易上送渠
道取值 
中国银联 
版权所有

---
**[p41]**

Q/CUP 006.6-2015 
33 
交
易
类
型 
交易名称 
消息类型 
（请求/应
答） 
第3 域
取值 
第18 域取
值 
第25 域取值 
第60.2.5 域取
值 
授
权 
消费授权
（一次性付
款） 
0100/0110 
00x000 
非6010、
6011 
00 
非01，根据交易
发起渠道取值 
柜面取现 
0100/0110 
01x000 
6010 
00 
06 
消费授权
（分期付
款） 
0100/0110 
00x000 
非6010、
6011 
64 
根据交易发起渠
道取值 
MOTO 授权 
0100/0110 
00x000 
非6010、
6011 
08 
根据交易发起渠
道取值 
代收授权 
0100/0110 
00x000 
非6010、
6011 
28 
根据交易发起渠
道取值 
授
权
撤
销 
消费授权
（一次性付
款）撤销 
0100/0110 
20x000 
非6010、
6011 
00 
根据交易发起渠
道取值 
手工授权撤
销 
0100/0110 
20x000 
非6010、
6011 
00 
12 
消费授权
（分期付
款）撤销 
0100/0110 
20x000 
非6010、
6011 
64 
根据交易发起渠
道取值 
MOTO 授权撤
销 
0100/0110 
20x000 
非6010、
6011 
08 
根据交易发起渠
道取值 
手工MOTO 授
权撤销 
0100/0110 
20x000 
非6010、
6011 
08 
12 
代收授权撤
销 
0100/0110 
20x000 
非6010、
6011 
28 
根据交易发起渠
道取值 
授
权
冲
正 
消费授权
（一次性付
款）冲正 
0420/0430 
00x000 
非6010、
6011 
00 
根据交易发起渠
道取值 
柜面取现冲
正 
0420/0430 
01x000 
6010 
00 
06 
消费授权
（分期付
款）冲正 
0420/0430 
00x000 
非6010、
6011 
64 
根据交易发起渠
道取值 
MOTO 授权冲
正 
0420/0430 
00x000 
非6010、
6011 
08 
根据交易发起渠
道取值 
代收授权冲
正 
0420/0430 
00x000 
非6010、
6011 
28 
根据交易发起渠
道取值 
授
权
撤
销
冲
正 
消费授权
（一次性付
款）撤销冲
正 
0420/0430 
20x000 
非6010、
6011 
00 
根据交易发起渠
道取值 
消费授权
（分期付
款）撤销冲
正 
0420/0430 
20x000 
非6010、
6011 
64 
根据交易发起渠
道取值 
MOTO 授权撤
销冲正 
0420/0430 
20x000 
非6010、
6011 
08 
根据交易发起渠
道取值 
代收授权撤
销冲正 
0420/0430 
20x000 
非6010、
6011 
28 
根据交易发起渠
道取值 
授
权
请
款 
手工授权请
款 
0220 
00x000 
非6010、
6011 
06 
12 
中国银联 
版权所有

---
**[p42]**

Q/CUP 006.6-2015 
34 
 
注：手工授权请款交易是针对双信息受理机构提供的通过银联统一业务门户
提交请款文件的交易。对于双信息受理方和发卡方，交易体现在日终双信息清算
文件中，对于单信息发卡方，交易体现在日终流水文件中。  
B.3 应用管理及银联卡汇率查询类 
下表包含银联卡跨境业务中所涵盖的所有此类交易类型。 
表 B.3  应用管理及对账类交易种类区分表 
交易类型 
交易名称 
消息类型 
（请求/应答） 
第70 域取值 
签到 
签到 
0820/0830 
001 
签退 
签退 
0820/0830 
002 
打开入网机
构 
打开入网机
构 
0820/0830 
001 
关闭入网机
构 
关闭入网机
构 
0820/0830 
002 
线路测试 
线路测试 
0820/0830 
301 
重置密钥 
申请重置密
钥（入网机
构发起） 
0820/0830 
101 
重置密钥
（中心发
起） 
0800/0810 
101 
日切通知 
日切开始 
0820/0830 
201 
日切结束 
0820/0830 
202 
银联卡汇率
查询 
银联卡汇率
查询 
0600/0610 
801 
风险  
可疑欺诈交
易通知 
0620/0630 
802 
辅助交易 
脚本结果通
知 
0620/0630 
951 
代授权参数
信息通知 
0620/0630 
902 
 
B.4 差错信息种类区分表 
该表中的交易要素信息不代表有真实的联机报文，只是为了在文件中区分差
错信息的类型，对于受理方和发卡方来说该表中的要素信息是相同的。 
差错类
型 
差错名
称 
差错信息类型 
（报文类型标
识符） 
第3 域取值 
第18 域
取值 
第25
域取值 
第
60.2.5
域取值 
普通交
易贷记
调整 
发往受
理方的
贷记调
整 
0422 
22x000 
与原始交
易取值一
致 
00 
与原始
交易取
值一致 
发往发
卡方的
贷记调
整 
0220 
22x000 
与原始交
易取值一
致 
00 
与原始
交易取
值一致 
存款的
贷记调
整 
发往受
理方的
贷记调
整 
0422 
22x000 
与原始交
易取值一
致 
83 
与
原始交
易取值
一致 
中国银联 
版权所有

---
**[p43]**

Q/CUP 006.6-2015 
35 
差错类
型 
差错名
称 
差错信息类型 
（报文类型标
识符） 
第3 域取值 
第18 域
取值 
第25
域取值 
第
60.2.5
域取值 
发往发
卡方的
贷记调
整 
0220 
22x000 
与原始交
易取值一
致 
83 
与原始
交易取
值一致 
 
 
 
 
 
 
 
 
 
 
 
 
 
请款 
发往受
理方的
请款 
0422 
02x000 
与原始交
易取值一
致 
00 
与原始
交易取
值一致 
发往发
卡方的
请款 
0220 
02x000 
与原始交
易取值一
致 
00 
与原始
交易取
值一致 
再请款 
发往受
理方的
再请款
（原始
交易
请款
退单
再请
款） 
0422 
02x000 
与原始交
易取值一
致 
13 
与原始
交易取
值一致 
发往发
卡方的
再请款
（原始
交易
请款
退单
再请
款） 
0220 
02x000 
与原始交
易取值一
致 
13 
与原始
交易取
值一致 
发往受
理方的
再请款
（原始
交易
退单
再请
款） 
0422 
与原始交易取
值一致 
与原始交
易取值一
致 
13 
与原始
交易取
值一致 
发往发
卡方的
再请款
（原始
交易
退单
再请
款） 
0220 
与原始交易取
值一致 
与原始交
易取值一
致 
13 
与原始
交易取
值一致 
退单 
发往受
理方的
退单
（针对
请款交
易） 
0422 
02x000 
与原始交
易取值一
致 
17 
与原始
交易取
值一致 
中国银联 
版权所有

---
**[p44]**

Q/CUP 006.6-2015 
36 
 
差错类
型 
差错名
称 
差错信息类型 
（报文类型标
识符） 
第3 域取值 
第18 域
取值 
第25
域取值 
第
60.2.5
域取值 
发往发
卡方的
退单
（针对
请款交
易） 
0220 
02x000 
与原始交
易取值一
致 
17 
与原始
交易取
值一致 
发往受
理方的
退单
（针对
其他交
易） 
0422 
与原始交易取
值一致 
与原始交
易取值一
致 
17 
与原始
交易取
值一致 
发往发
卡方的
退单
（针对
其他交
易） 
0220 
与原始交易取
值一致 
与原始交
易取值一
致 
17 
与原始
交易取
值一致 
二次退
单 
发往受
理方的
二次退
单 
0422 
02x000 
与原始交
易取值一
致 
41 
与原始
交易取
值一致 
发往发
卡方的
二次退
单 
0220 
02x000 
与原始交
易取值一
致 
41 
与原始
交易取
值一致 
差错例
外 
发往发
起方的
差错例
外 
0422 
22x000 
与原始交
易取值一
致 
82 
与原始
交易取
值一致 
发往接
收方的
差错例
外 
0220 
22x000 
与原始交
易取值一
致 
82 
与原始
交易取
值一致 
收/付
费 
收费 
0220 
19x000 
无 
00 
缺省值
填充 
付费 
0220 
29x000 
无 
00 
缺省值
填充 
 
中国银联 
版权所有

---
**[p45]**

Q/CUP 006.6-2015 
37 
 
（资料性附录） 
CUPS 对IC 卡交易的支持 
B.5 CUPS对UICS借/贷记标准IC卡交易的支持 
B.5.1 CUPS对UICS借/贷记标准IC卡转接的支持 
CUPS 支持55 域的出现，因此能够识别终端发送上来的IC 卡信息，并能够跟
据接收机构（由报文中的100 域判断）的改造程度，选择是否需要将这些IC 卡信
息转接给发卡行。具体实现方式，参见下表： 
表 D.1  CUPS 对UICS 借/贷记标准IC 卡转接的支持 
结点情况 
接收方 
发卡方 
CUPS 的处理 
1 
Early 
Early 
删除23、55 域信息转发，代为校验ARQC
和代为生成ARPC。 
2 
Early 
Full 
删除23、55 域信息转发，代为校验AQRC
和代为生成。其中的风险由接收方承担。 
3 
Full 
Early 
直接转发23、55 域信息。由接收方做Full
到Early 的转换。接收方需要具有此处理能力。 
4 
Full 
Full 
直接转发23、55 域信息。 
 
B.5.2 CUPS对UICS借/贷记标准IC卡代授权的支持 
实现IC卡代授权功能，需要做到如下几点： 
安全认证功能 
安全认证功能是代授权功能中最关键的一项功能。在IC卡的认证过程中涉及
到发卡行的共包含2个层次的认证。 
联机交易时，发卡行对卡片的认证（Online Card Authentication） 
联机交易时，卡片产生ARQC（Authorization Request Cryptogram）。发卡
行对ARQC进行验证，判断卡片真伪。 
CUPS在验证ARQC时需使用UDK（Unique Derivation Key，唯一分散密钥）。
UDK是MDK（Master Derivation Key，主分散密钥）结合卡片PAN和卡片PAN序列
号分散生成的，存放在卡片里面用来产生ARQC。 
每个UDK对应唯一的卡片。ARQC一般由8个终端域和3个卡片域及UDK采用双字
节密钥算法生成。发卡行也采用同样的计算方法计算ARQC。但这些数据源也可以
由发卡方自行约定，下面给出通用的数据源及其顺序： 
表 D.2  构成ARQC 的数据源列表 
序号 
tag 号 
中文域名 
8 个终端域 
1 
9F02 
授权金额 
2 
9F03 
其它金额 
3 
9F1A 
终端国家代码 
4 
95 
终端验证结果 
5 
5F2A 
交易货币代码 
6 
9A 
交易日期 
7 
9C 
交易类型 
8 
9F37 
不可预知数 
3 个卡片域 
中国银联 
版权所有

---
**[p46]**

Q/CUP 006.6-2015 
38 
 
序号 
tag 号 
中文域名 
9 
82 
应用交互特征 
10 
9F36 
应用交易计数器 
11 
9F10 
卡验证结果（发卡行应用数据的一部分） 
 
CUPS在执行代授权操作时，需要代替发卡行计算ARQC并对其进行验证。为了
计算ARQC，需要知道发卡行的MDK。这里有两种方法，一种是由CUPS替发卡行产生
MDK，一种是发卡行将它的MDK通过ZCMK（Zone Control Master Key，地区控制
主密钥）加密后传送给CUPS。CUPS在得到MDK后，可以通过上述的方法计算出ARQC，
与终端传来的ARQC进行比较，检验卡片的真伪，若校验失败则拒绝该交易。 
联机交易时，卡片对发卡行的认证（Online Issuer Authentication） 
联机交易时，发卡行产生ARPC（Authorization Response Cryptogram）。卡
片对ARPC进行验证，判断发卡行的真伪。 
ARPC的产生方法是首先将ARQC和tag为91的子域发卡行认证数据的响应代码
异或，然后再采用双字节密钥算法结合UDK生成ARPC，存放在tag为91的子域发卡
行认证数据中。 
CUPS在执行代授权操作时需要代替发卡行计算ARPC，同样需要知道发卡行的
MDK，操作同D.3.2。CUPS在得到MDK后，可以通过上述的方法得到ARPC，传送给卡
片，和卡片自己计算的ARPC进行比较，检验发卡行的真伪。 
发卡行脚本处理 
在发卡行脚本处理方面，根据与发卡行签订的代授权协议支持应用锁定等脚
本。 
B.5.3 CUPS对UICS借/贷记标准IC卡代校验的支持 
代校验只涉及安全认证功能，只代替发卡行验证ARQC的值并将验证结果传递
给发卡行。至于该笔交易是接收还是拒绝由发卡行做最终决定，CUPS不对交易结
果做判断。 
发卡行在收到CUPS代为计算的ARQC后可以信任这个结果，也可以不信任，自
己再行判断。因此可能出现以下情况：CUPS计算的ARQC值为真，但发卡行仍然拒
绝了该笔交易。反之亦然。 
CUPS对代校验的处理以发卡方的卡bin判断。CUPS首先查找该卡bin对应的代
校验字段。若该卡bin要求CUPS代为校验ARQC并生成ARPC，则CUPS进行相应处理；
若该卡bin不要求CUPS代为校验ARQC并生成ARPC，则CUPS不进行代校验处理。需
要注意的是，如果该卡BIN不要求代校验ARQC及代生成ARPC，而接收方却是Early，
则拒绝这种EMV交易。 
代校验认证过程包含如下1个层次的认证： 
联机交易时，发卡行对卡片的认证（Online Card Authentication） 
联机交易时，卡片产生ARQC。发卡行对ARQC 进行验证，判断卡片真伪。 
在这种情况下，代校验主要是银联处理中心为发卡行产生ARQC，并和来自卡
片的ARQC 比较。根据发卡行向UICS 借/贷记迁移的不同程度，可以将发卡行分
为Early Issuer 和Full Issuer，即不完全迁移（表示入网机构不具备卡片认证的能
力，同时也无法接收与卡片认证有关的IC 卡信息。）和完全迁移（表示入网机构
既具备卡片认证的能力也能接收与卡片认证有关的IC 信息。）。对于Early Issuer
且要求CUPS 代校验，CUPS 将代其产生ARQC 并将校验结果存放在61.5 域中。对
中国银联 
版权所有

---
**[p47]**

Q/CUP 006.6-2015 
39 
于Full Issuer 且要求CUPS 代校验，CUPS 将代其产生ARQC 并将比较结果也存放
在61.5 域中传递给发卡行。 
在代校验过程中产生的ARPC都存放在tag为91的发卡行认证数据中传递给卡
片以判断发卡方的真伪。 
 
附 录 C 
（资料性附录） 
报表样例 
C.1 UPI 机构清算汇总报表C602DZ样表  
该报表为日报表。 
对于发卡机构，报表名称为IFRYYMMDD01C602DZ-XXX (扣帐货币代码)-XXX 
(清算货币代码)； 
对于收单机构，报表名称为IFRYYMMDD01C602DZ-XXX (交易货币代码)-XXX 
(清算货币代码)。 
本报表中费用单位统一为币种最小精度的万分之一。 
C.1.1 报表头 
报表头包含以下信息：  
 
IIN(Institution identification number). 机构代码 
 
Institution Name. 机构名称  
 
Transaction Settlement Date.交易日期  
 
Settlement Date. 清算日期  
 
Billing/Transaction Currency (Billing Currency for Issuer,Transaction 
Currency for Acquirer).扣帐/交易币种（发卡机构为扣帐币种，收单机构
为交易币种）  
 
Settlement Currency. 清算币种 
C.1.2 子报表 
UPI机构清算汇总日报表包含以下字表: 
 
C602-DZ-001 UPI Institution Settlement Summary Report (Daily Report) 
 
C602-DZ-002 UPI Institution Settlement Fee Report (Daily Report) 
 
C602-DZ-003 UPI Institution Settlement Dispute Fee Report (Daily Report) 
 
C602-DZ-004 UPI Institution Stand-in Fee Report (Daily Report) 
These reports include all fees that are that are settled in a given settlement 
service. Fees are reported by the following categories: 
 
Business mode 
 
Transaction type 
Report ID 
Report Title 
Report Description 
C602-DZ-001 
(mandatory) 
UPI Institution 
Settlement Summary 
Report (Daily Report) 
Provides summarized totals of 
the settlement amount, 
reimbursement fee,  
中国银联 
版权所有

---
**[p48]**

Q/CUP 006.6-2015 
40 
 
service fee, 
total fee 
and net settlement amount. 
Debit amount, credit amount 
and total amount is given. 
C602-DZ-002 
(mandatory) 
UPI Institution 
Settlement Fee Report 
(Daily Report) 
Provide count, 
transaction amount, 
settlement amount, 
reimbursement fees, 
service fees 
and net settlement amount 
information summarized by 
business transaction type. 
C602-DZ-003 
(mandatory) 
UPI Institution 
Settlement Dispute 
Fee Report (Daily 
Report) 
Provide count, 
transaction amount, 
settlement amount, 
reimbursement fees, 
service fees 
and net settlement amount 
information summarized by 
dispute transaction type. 
C602-DZ-004 
(optional) 
UPI Institution Stand-
in Fee Report (Daily 
Report) 
Provide count and Additional 
Fee information summarized by 
Stand-in Transaction Type 
C.1.3 机读格式 
C602-DZ-01, C602-DZ-02, C602-DZ-03 report layout 
Position 
Field Length 
Format 
Alignment 
Content 
1-13 
13 
AN 
left-alignment 
Institution Role 
14-49 
36 
AN 
left-alignment 
Transaction Type 
50-66 
17 
UN 
right-alignment 
Settlement Count 
67-90 
24 
AN 
right-alignment 
Transaction Amount 
91-111 
21 
AN 
right-alignment 
Settlement Amount 
112-132 
21 
AN 
right-alignment 
Reimbursement Fee 
133-153 
21 
AN 
right-alignment 
Service Fee 
154-174 
21 
AN 
right-alignment 
Additional Fee 
175-197 
23 
AN 
right-alignment 
Net Settlement Amount 
Format: AN = Alphanumeric, UN = Unpacked Numeric 
 
C602-DZ-04 report layout 
Position 
Field Length 
Format 
Alignment 
Content 
1-36 
36 
AN 
left-alignment 
Transaction Type 
37-49 
13 
AN 
left-alignment 
Institution Role 
中国银联 
版权所有

---
**[p49]**

Q/CUP 006.6-2015 
41 
50-66 
17 
UN 
right-alignment 
Settlement Count 
67-89 
23 
AN 
right-alignment 
Additional Fee 
Format: AN = Alphanumeric, UN = Unpacked Numeric 
C.1.4 样例 
以下是以单信息确定币种交易为例的UIS 样表。样表中的子表编号对应UIS 报表
编号。 
注：对于机构每个清算日期内同一个清算币种下的1张或多张报表，收单机
构应按照每张报表中收单高精度净清算金额的加总后四舍五入后到最小货币单
位的值（A）进行清算划账；发卡机构应按照每张报表中发卡高精度净清算金额
的总和加总后四舍五入后到最小货币单位的值（B）进行清算划账；如机构同时
为收单、发卡且钆差清算，应以收单加总后四舍五入的值（A）和发卡加总四舍
五入的值（B）钆差后进行清算划账。 
中国银联 
版权所有

---
**[p50]**

Q/CUP 006.6-2015 
42 
 
Header 
IIN：                         47040344 
Institution Name：             test bank 
Transaction Settlement Date：  20120320 
Settlement Date：              20120322 
Transaction Currency：         344 
Settlement Currency：          344 
C602-DZ-001 
Report Code:  C602-DZ-001 
Report Name:  UPI Institution Settlement Summary Report (Daily Report)     
Report Date:   20120322 
Ins Role 
Transaction Type 
Settlement  
Count 
Transaction 
Amount 
Settlement 
Amount 
Reimbursement 
Fee 
Service Fee 
Additional 
Fee 
Net Settlement 
Amount 
Issuer 
Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
All 
Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
C602-DZ-002 
Report Code:  C602-DZ-002 
Report Name:  UPI Institution Settlement Fee Report (Daily Report)     
Report Date:   20120322 
Ins Role 
Transaction Type 
Settlement  
Count 
Transaction 
Amount 
Settlement 
Amount 
Reimbursement 
Fee 
Service Fee 
Additional 
Fee 
Net Settlement 
Amount 
Issuer 
ATM Cash Withdrawal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
ATM Inquiry 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p51]**

Q/CUP 006.6-2015 
43 
Issuer 
ATM Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
POS Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
POS Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
POS Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Commerce Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Commerce Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Commerce Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Installment Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Installment Purchase 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E-cash Loading 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Designated Account 
Loading 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Offline Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Offline Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E-Cash Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Remittance 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Remittance Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
MO/TO Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
MO/TO Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
MO/TO Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Manual Cash 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Manual Cash Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Recurring Txn 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p52]**

Q/CUP 006.6-2015 
44 
 
Issuer 
Recurring Txn Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Original Credit Txn 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Original Credit Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Others 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Non-dispute Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
ATM Cash Withdrawal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
ATM Inquiry 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
ATM Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
POS Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
POS Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
POS Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
E Commerce Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
E Commerce Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
E Commerce Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Installment Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Installment Purchase 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
E-cash Loading 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Designated Account 
Loading 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Offline Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Offline Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
E-Cash Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Remittance 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p53]**

Q/CUP 006.6-2015 
45 
D Acquirer 
Remittance Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
MO/TO Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
MO/TO Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
MO/TO Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Manual Cash 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Manual Cash Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Recurring Txn 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Recurring Txn Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Original Credit Txn 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Original Credit Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Others 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
D Acquirer 
Non-dispute Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
ATM Cash Withdrawal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
ATM Inquiry 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
ATM Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
POS Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
POS Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
POS Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
E Commerce Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
E Commerce Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
E Commerce Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Installment Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Installment Purchase 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p54]**

Q/CUP 006.6-2015 
46 
 
I Acquirer 
E-cash Loading 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Designated Account 
Loading 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Offline Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Offline Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
E-Cash Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Remittance 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Remittance Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
MO/TO Purchase 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
MO/TO Refund 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
MO/TO Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Manual Cash 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Manual Cash Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Recurring Txn 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Recurring Txn Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Original Credit Txn 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Original Credit Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Others 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
I Acquirer 
Non-dispute Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Non-dispute Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
All 
Non-dispute Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
C602-DZ-003 
Report Code:  C602-DZ-003                                                                                                                  
Report Name:  UPI Institution Dispute Fee Report (Daily Report)                                                                                    
中国银联 
版权所有

---
**[p55]**

Q/CUP 006.6-2015 
47 
Report Date:  20120322  
Ins Role 
Transaction Type 
Settlement 
Count 
Transaction 
Amount 
Settlement 
Amount 
Reimbursement 
Fee 
Service Fee 
Additional 
Fee 
Net Settlement 
Amount 
Issuer 
ATM Credit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
ATM Presentment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
ATM Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
ATM Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
POS Credit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
POS Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
POS Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
POS Second Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
POS Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Commerce Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Commerce Debit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Commerce Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Commerce 
Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Commerce Second 
Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Commerce Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p56]**

Q/CUP 006.6-2015 
48 
 
Issuer 
Installment Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Installment Presentment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Installment Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Installment Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Installment Second 
Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Installment Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Cash Credit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
E Cash Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Remittance Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Remittance Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
MO/TO Credit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
MO/TO Presentment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
MO/TO Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
MO/TO Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
MO/TO Second Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
MO/TO Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Manual Cash Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p57]**

Q/CUP 006.6-2015 
49 
Issuer 
Manual Cash Debit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Manual Cash Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Manual Cash 
Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Manual Cash Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Recurring Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Recurring Debit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Recurring Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Recurring Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Recurring Second 
Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Recurring Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Original Credit Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Original Credit Debit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Original Credit Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Original Credit Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Special Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p58]**

Q/CUP 006.6-2015 
50 
 
Issuer 
Fee Collection/Funds 
Disbursement 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Issuer 
Dispute Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
ATM Credit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
ATM Presentment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
ATM Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
ATM Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
POS Credit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
POS Presentment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
POS Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
POS Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
POS Second Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
POS Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
E Commerce Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
E Commerce Debit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
E Commerce Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
E Commerce 
Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
E Commerce Second 
Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
E Commerce Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p59]**

Q/CUP 006.6-2015 
51 
Acquirer 
Installment Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Installment Presentment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Installment Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Installment Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Installment Second 
Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Installment Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
E Cash Credit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
E Cash Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Remittance Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Remittance Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
MO/TO Credit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
MO/TO Presentment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
MO/TO Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
MO/TO Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
MO/TO Second Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
MO/TO Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Manual Cash Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p60]**

Q/CUP 006.6-2015 
52 
 
Acquirer 
Manual Cash Debit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Manual Cash Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Manual Cash 
Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Manual Cash Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Recurring Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Recurring Debit Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Recurring Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Recurring Representment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Recurring Second 
Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Recurring Dispute Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Original Credit Credit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Original Credit Debit 
Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Original Credit Chargeback 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Original Credit Dispute 
Subtotal 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Special Adjustment 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
中国银联 
版权所有

---
**[p61]**

Q/CUP 006.6-2015 
53 
Acquirer 
Fee Collection/Funds 
Disbursement 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
Acquirer 
Dispute Txn Total 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
All 
Acquirer 
0 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
0.000000 
 
C602-DZ-003 
Report Code:  C602-DZ-004 
Report Name:  UPI Institution Stand-in Fee Report (Daily Report) 
Report Date:  20140630 
Transaction Type 
Ins_Role 
Settlement Count 
Additional Fee 
Fees of Stand-in Authorization 
Issuer 
0 
0.00 
 
C.2 机构划账凭证报表612DZ样表  
Report Code:  C612-DZ 
Report Name:  UPI Institution Settlement Reconciliation Report (Daily Report) 
Report Date:  YYYYMMDD 
================================================================================================================================= 
IIN:                           xxxxxxxx 
Institution Name:              xxxxxxxxxxxxxxxxxxxxx 
Transaction Settlement Date:   YYYYMMDD    
================================================================================================================================= 
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- 
Settlement Currency        Acquirer Net Settlement Amount        Issuer Net Settlement Amount        All Net Settlement Amount 
中国银联 
版权所有

---
**[p62]**

Q/CUP 006.6-2015 
54 
 
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- 
XXX                                 -729181.80                                0.00                        -729181.80 
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- 
XXX                                  -729181.80                                0.00                        -729181.80 
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- 
XXX                                  -729181.80                                0.00                        -729181.80
中国银联 
版权所有

---
**[p63]**

Q/CUP 006.6-2015 
55 
 
 
 
中国银联 
版权所有