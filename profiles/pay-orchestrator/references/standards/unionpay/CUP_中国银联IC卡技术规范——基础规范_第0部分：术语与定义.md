# 中国银联IC卡技术规范——基础规范 第0部分：术语与定义
> 来源: 银联规范 2015-12 存档 | 19页 | 提取: 2026-09-03


---
**[p1]**

中国银联股份有限公司企业标准
Q/CUP
Q/CUP 045.0—2014
代替Q/CUP 045.0—2013
中国银联IC 卡技术规范——基础规范 
第0 部分：术语与定义 
China UnionPay integrated circuit card specification 
—basic specification 
Part 0：Terms and definitions 
 
V1.0.2 
2014-11- 30 发布 
中国银联股份有限公司发布 
2014-11-30 实施 
中国银联 
版权所有

---
**[p2]**

Q/CUP 045.0-2014 
I 
中国银联股份有限公司（以下简称“中国银联”）对该规范文档
保留全部知识产权权利，包括但不限于版权、专利、商标、商业秘密
等。任何人对该规范文档的任何使用都要受限于在中国银联成员机构
服务平台（http://member.unionpay.com/）与中国银联签署的协议之
规定。中国银联不对该规范文档的错误或疏漏以及由此导致的任何损
失负任何责任。中国银联针对该规范文档放弃所有明示或暗示的保证,
包括但不限于不侵犯第三方知识产权。 
未经中国银联书面同意，您不得将该规范文档用于与中国银联合
作事项之外的用途和目的。未经中国银联书面同意，不得下载、转发、
公开或以其它任何形式向第三方提供该规范文档。如果您通过非法渠
道获得该规范文档，请立即删除，并通过合法渠道向中国银联申请。 
中国银联对该规范文档或与其相关的文档是否涉及第三方的知
识产权（如加密算法可能在某些国家受专利保护）不做任何声明和担
保，中国银联对于该规范文档的使用是否侵犯第三方权利不承担任何
责任，包括但不限于对该规范文档的部分或全部使用。 
 
 
中国银联 
版权所有

---
**[p3]**

Q/CUP 045.0-2014 
II 
目    次 
目    次 ......................................................................................................................................................... I 
前    言 ........................................................................................................................................................ II 
1 
范围 ....................................................................................................................................................... 443 
2 
规范性引用文件 ................................................................................................................................... 443 
3 
术语与定义 ........................................................................................................................................... 443 
3.1 应用层术语 ........................................................................................................................................... 443 
3.2 通讯层术语 ........................................................................................................................................... 665 
3.3 安全层术语 ............................................................................................................................................... 8 
4 
缩略语 ABBREVIATIONS ................................................................................................................. 111113 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
前    言 
中国银联 
版权所有

---
**[p4]**

Q/CUP 045.0-2014 
III 
本部分主要描述了中国银联IC卡技术规范——基础规范所涉及的所有术语和定义。 
本部分由中国银联股份有限公司提出 
本部分由中国银联技术部组织制定。 
本部分的主要起草单位：中国银联技术部。 
本部分的主要起草人：徐静雯、陈旭、白玫、杜秉一。 
 
 
中国银联 
版权所有

---
**[p5]**

Q/CUP 045.0-2014 
4 
中国银联IC 卡技术规范——基础规范 
第0 部分：术语与定义 
1 
范围 
Q/CUP 045的本部分包括术语定于与缩略语。 
本部分适用于由银行发行的或接受的金融IC卡，使用对象主要是与IC卡应用相关的卡片
设计、制造、管理、发行、受理以及应用系统的研制、开发、继承和维护等相关部门。 
2 
规范性引用文件 
下列文件中的条款通过Q/CUP 045规范的本部分的引用而成为本部分的条款。凡是注日
期的引用文件，其随后所有的修改单（不包括勘误的内容）或修订版均不适用于本部分，然
而，鼓励根据本部分达成协议的各方研究是否可使用这些文件的最新版本。凡是不注日期的
引用文件，其最新版本适用于本部分。 
Q/CUP 045.1 中国银联IC卡技术规范——基础规范 第1部分：借记/贷记应用规范 
Q/CUP 045.2 中国银联IC卡技术规范——基础规范 第2部分：借记贷记应用卡片规范 
Q/CUP 045.3 中国银联IC卡技术规范——基础规范 第3部分：借记贷记应用终端规范 
Q/CUP 045.4 中国银联IC卡技术规范——基础规范 第4部分：借记贷记应用安全规范 
Q/CUP 045.5 中国银联IC卡技术规范——基础规范 第5部分：非接触式IC卡支付规范 
3 
术语与定义 
下列术语与定义适用于Q/CUP 045。 
 
3.1 应用层术语 
报文  message 
由终端向卡或卡向终端发出的，不含传输控制字符的字节串。 
 
    报文鉴别码  message authentication code 
对交易数据及其相关参数进行运算后产生的代码，主要用于验证报文的完整性。 
 
    磁条  magstripe 
包括磁编码信息的条状物。 
 
    电子现金功能（EC）  electronic cash (EC) 
基于借记/贷记应用上实现的小额脱机支付的功能。 
 
    电子现金余额  electronic cash balance 
一个计数器，表示卡片上可脱机消费的金额。 
 
    发卡行行为代码  issuer action code 
中国银联 
版权所有

---
**[p6]**

Q/CUP 045.0-2014 
5 
发卡行根据TVR的内容选择的动作。 
 
    函数  function 
由一个或多个命令及其合成的行为实现的一个处理过程，这些命令及其合成的行为用于
完成全部或部分交易。 
 
    集成电路  integrated circuit (IC) 
具有处理和/或存储功能的电子器件。 
 
    集成电路卡（IC 卡）  integrated circuit (s) card (ICC) 
内部封装一个或多个集成电路用于执行处理和存储功能的卡片。 
 
    交易日志  transaction log 
记录最近交易的信息细节，从中可以了解交易历史。 
 
    脚本  script 
发卡行向终端发送的命令或命令序列，目的是向IC卡连续输入命令。 
 
    接口设备  interface device 
终端上插入IC卡的部分，包括其中的机械和电气部分。 
 
    金融交易  financial transaction 
由于持卡者和商户之间的商品或服务交换行为而在持卡者、发卡机构、商户和收单行之
间产生的信息交换、资金清算和结算行为。 
 
    卡片  card 
发行的具有支付卡功能的卡片。 
 
    路径  path 
根据终端支持磁条数据模式或快速借记/贷记应用所选择的一个应用路径，卡片行为由
采用所选择的路径唯一确定。 
 
    命令  command 
终端向IC卡发出的一条报文，该报文启动一个操作或请求一个响应。 
 
    清算  clearing 
发卡行针对收单行提交的交易数据进行的处理过程。对于发卡行来说，清算是将后台计
数器与卡中计数器进行再同步的一次机会。对于收单行来说，清算是将交易数据上送给发卡
行。 
 
    圈存  load 
增加卡中电子现金余额的过程。圈存有多种实现方式，可以从主账户中划入金额，也可
以现金存款，又或者从其它账户转入金额，但圈存后的电子现金余额不能超过电子现金余额
上限。 
中国银联 
版权所有

---
**[p7]**

Q/CUP 045.0-2014 
6 
 
    响应  response 
IC卡处理完成收到的命令报文后，返回给终端的报文。 
 
    消费者设备  consumer device 
消费者用于支付交易的卡片（PICC）或其它具有交易芯片的设备（例如，移动电话或
PDA）。 
 
    应用  application 
卡片和终端之间的应用协议和相关的数据集。 
 
    应用交互特征  application interchange profile 
表明卡片所支持的功能。 
 
    应用文件定位器  application file locator 
用于指出应用相关的文件位置和记录范围。 
 
    支付系统环境  payment system environment 
当符合Q/CUP 045的支付系统应用被选择，IC卡中所确立的逻辑条件集合。 
 
    终端  terminal 
在交易点安装、用于与IC卡配合共同完成金融交易的设备。它应包括接口设备，也可包
括其它的部件和接口（如与主机的通讯）。 
 
    终端行为代码  terminal action code 
收单行根据TVR的内容选择的动作。 
 
    字节  byte 
由指明的8位数据b1到b8组成，从最高有效位（MSB，b8）到最低有效位（LSB，b1）。 
 
交易终止 transaction terminated 
因为一些原因（包括但不仅限于缺少某些必备数据，终端或卡片故障），规范规定的交
易流程没有被执行完成，交易无法继续。 
 
交易拒绝 transaction declined 
规范规定的流程被执行完毕，但卡片、终端或发卡行处于某些因素的考虑（包括但不仅
限于风险管理、业务规则、政策因素）不允许该笔交易的发生。 
 
 
3.2 通讯层术语 
 
    不归零电平（NRZ-L）  non-return to zero（NRZ-L） 
中国银联 
版权所有

---
**[p8]**

Q/CUP 045.0-2014 
7 
位编码的方式，位持续期间的逻辑状态可以通过通信媒介的两个已定义的物理状态之一
来表示。 
 
    冲突  collision 
在同一时间周期内，在同一PCD的工作场中，有两张或两张以上的PICC进行数据传输，
使得PCD不能辨别数据是从哪一张PICC发出的。 
 
    读写器  reader 
读写器在非接触式交易中通常有以下两种形式： 
——作为一种与POS设备分离，但与之通信的读写器； 
——集成到POS设备中的读写器。 
通常MSD方式采用第1种形式，但本部分对此并未规定。 
除非有其它的明确说明，本部分中“读写器”一词包括以上两种形式，不会特意指明特
定的操作是在哪一个物理模块（读写器或POS设备）中执行的。 
 
    二进制移相键控（BPSK） binary phase shift keying（BPSK） 
移相为180°的移相键控，从而导致两个可能的相位状态。 
 
    防冲突环  anticollision loop 
在PCD激励场中，PCD准备和几个PICC中的一张或多张之间的对话所使用的算法。 
 
    副载波  subcarrier 
以频率fs调制载波频率fc而产生的RF信号。 
 
    基本时间单元（etu）  elementary time unit（etu） 
对于本部分，基本时间单元（etu）定义为：1etu=128/fc。 
 
    接近式卡（PICC）  proximity IC card（PICC） 
一种ID-1型卡，在它上面已装入集成电路和耦合电路，并且与集成电路的通信是通过与
接近式耦合设备的电感耦合完成的。 
 
    接近式耦合设备（PCD）  proximity coupling device（PCD） 
用电感耦合给PICC提供能量并控制与PICC交换数据的读/写设备。 
 
    块  block 
帧的一种特殊类型，它包含有效协议数据格式。 
注：有效协议数据格式包括I-块、R-块或S-块。 
 
    上层  higher layer 
属于应用或上层协议，它不在本部分描述。 
 
    时间槽协议  time slot protocol 
PCD与一张或多张PICC建立逻辑通道的方法，该方法对于PICC响应使用时间槽定位，
类似于slotted-Aloha 方法。 
中国银联 
版权所有

---
**[p9]**

Q/CUP 045.0-2014 
8 
 
    调制指数  modulation index 
定义为[a-b]/[a+b]，其中a和b分别是信号幅度的峰值和最小值。 
 
    头域  prologue field 
块的第一部分，包含协议控制字节（PCB）。 
 
    唯一识别符（UID）  unique identifier（UID） 
Type A防冲突算法所需的一个编号。 
 
    尾域  epilogue field 
块的最后一部分，包括错误校验码（EDC）。   
 
    位持续时间  bit duration 
确定一逻辑状态的时间，在这段时间结束时，一个新的位将开始。 
 
    位冲突检测协议  bit collision detection protocol 
在帧内比特级使用冲突检测的防冲突方法。冲突出现在至少两张PICC把互补位模式发
送给PCD时。在这种情况下，位模式被合并，在整个（100%）位持续时间内载波以副载波
来调制。 
 
    无触点集成电路卡  contactless integrated circuit(s) card 
一种ID-1型卡（如GB/T 14916中所规定），在它上面已装入集成电路，并且与集成电路
的通信是用无触点的方式完成的。 
 
    无效块  invalid block 
帧的一种类型，它包含无效协议格式。 
注： 没有接收到帧的超时不被解释为一无效块。 
 
    帧  frame 
帧是一序列数据位和任选差错检测位，它在开始和结束处有定界符。 
（注：Type A PICC使用为Type A定义的标准帧，Type B PICC使用为Type B定义的标准
帧。） 
 
    字节  byte 
由指明的8位数据b1到b8组成，从最高有效位（MSB，b8）到最低有效位（LSB，b1）。 
 
 
3.3 安全层术语 
 
    提前回收  accelerated revocation 
在已公布的密钥失效日期到期前回收密钥。 
中国银联 
版权所有

---
**[p10]**

Q/CUP 045.0-2014 
9 
 
    持卡人验证方法  cardholder verification method 
验证持卡人是否合法的方法，终端用它来确保卡片不是丢失的或被盗的。 
 
    认证  authentication 
确认一个实体所宣称的身份的措施。 
 
    证书  certificate 
由发行证书的认证中心使用其私钥对实体的公钥、身份信息以及其它相关信息进行签名，
形成的不可伪造的数据。 
 
    认证中心  certification authority 
证明公钥和其它相关信息同其拥有者相关联的可信的第三方机构。 
 
    泄露  compromise 
机密或安全被破坏。 
 
    串联  concatenation 
通过把第二个元素的字节添加到第一个元素的结尾将两个元素连接起来。每个元素中的
字节在结果串中的顺序和原来从IC卡发到终端时的顺序相同，即高位字节在前。在每个字节
中位按由高到低的顺序排列。 
 
    密文  cryptogram 
加密运算的结果。 
 
    加密算法  cryptographic algorithm 
为了隐藏或显现数据信息内容的变换算法。 
 
    密钥有效期  cryptoperiod 
某个特定的密钥被授权可以使用的时间段，或者某个密钥在给定的系统中有效的时间段 
 
    解密  decipherment 
对应加密过程的逆操作。 
 
    数字签名  digital signature 
对数据的一种非对称加密变换。该变换可以使数据接收方确认数据的来源和完整性，保
护数据发送方发出和接收方收到的数据不被第三方篡改，也保护数据发送方发出的数据不被
接收方篡改。 
 
    加密  encipherment 
基于某种加密算法对数据做可逆的变换从而生成密文的过程。 
 
    哈希函数  hash function 
将位串映射为定长位串的函数，它满足以下两个条件： 
中国银联 
版权所有

---
**[p11]**

Q/CUP 045.0-2014 
10 
——对于一个给定的输出，不可能推导出与之相对应的输入数据； 
——对于一个给定的输入，不可能通过计算得到具有相同的输出的另一个输入。 
另外，如果要求哈希函数具备防冲突功能，则还应满足以下条件： 
——不可能通过计算找到两个不同的输入具有相同的输出。 
 
    哈希结果  hash result 
哈希函数的输出位串。 
 
    密钥  key 
控制加密转换操作的符号序列。 
 
    密钥失效日期  key expiry date 
用特定密钥产生的签名不再有效的最后期限。用此密钥签名的发卡行证书必须在此日期或此
日期之前失效。在此日期后，此密钥可以从终端删除。 
    密钥引入  key introduction 
产生、分发和开始使用密钥对的过程。 
 
    密钥生命周期  key life cycle 
密钥管理的所有阶段，包括计划、生成、回收、销毁和存档。 
 
    密钥更换  key replacement 
回收一个密钥，同时引入另外一个密钥来代替它。 
 
    密钥回收  key revocation 
回收使用中的密钥以及处理其使用后的遗留问题的密钥管理过程。密钥回收可以按计划
回收或提前回收。 
 
    密钥回收日期  key revocation date 
在此日期后，任何仍在使用的合法卡不会包含用此密钥签名的证书。因此，密钥可以从
终端上被删除。对按计划的密钥回收，密钥回收日期应等同于密钥失效日期。 
 
    逻辑泄露  logical compromise 
由于密码分析技术和/或计算能力的提高，对密钥造成的泄露。 
 
    填充  padding 
向数据串某一端添加附加位。 
 
    密码键盘  PIN pad 
用于输入个人识别码的一组数字和命令按键。 
 
    明文  plaintext 
未被加密的信息。 
 
    物理泄露  physical compromise 
中国银联 
版权所有

---
**[p12]**

Q/CUP 045.0-2014 
11 
由于没有安全的保护，或者硬件安全模块的被盗或被未经授权的人存取等事实对密钥造
成的泄露。 
 
    计划回收  planned revocation 
按照公布的密钥失效日期进行的密钥回收。 
 
    潜在泄露  potential compromise 
密码分析技术和/或计算能力的提高达到了可能造成某个特定长度的密钥的泄露的情况 
 
    对称加密技术  symmetric cryptographic technique 
发送方和接收方使用相同保密密钥进行数据变换的加密技术。在不掌握保密密钥的情况
下，不可能推导出发送方或接收方的数据变换。 
 
    非对称加密技术  asymmetric cryptographic technique 
采用两种相关变换的加密技术：公开变换（由公钥定义）和私有变换（由私钥定义）。
这两种变换存在在获得公开变换的情况下是不能够通过计算得出私有变换的特性。 
 
    私钥  private key 
一个实体的非对称密钥对中含有的供实体自身使用的密钥，在数字签名方案中，私钥用
于签名。 
 
    公钥  public key 
在一个实体使用的非对称密钥对中可以公开的密钥。在数字签名方案中，公钥用于验证。 
 
    公钥证书  public key certificate 
由认证中心签名的不可伪造的某个实体的公钥信息。 
 
    保密密钥  secret key 
对称加密技术中仅供指定实体所用的密钥。 
 
    中国余数定理（CRT）  chinese remainder theorem (CRT) 
RSA私钥的一种特殊表示格式，可加速签名计算速度。 
 
4 
缩略语 Abbreviations 
 
A mod n 
A整除n的余数，即：唯一的整数r，0≤r<n，存在一个整数d，使得A=dn+r 
A:=B 
A被赋予数值B 
A=B 
数值A等于数值B 
A≡B mod n 
整数A与B对于模n同余，即存在一个整数d，使得(A－B)=dn 
AAC 
应用认证密文（Application Authentication Cryptogram） 
AAR 
应用授权参考（Application Authorization Referral） 
AC 
应用密文（Application Cryptogram）（适用于第4部分：借记/贷记应用
规范） 
中国银联 
版权所有

---
**[p13]**

Q/CUP 045.0-2014 
12 
AC 
防冲突（AntiCollision）（适用于第11部分：非接触式IC卡通讯规范） 
ACK 
肯定确认(Positive ACKnowledgement) 
ADA 
应用缺省行为（Application Default Action） 
ADC 
Type B的应用数据编码（Application Data Coding, Type B） 
ADF 
应用定义文件（Application Definition File） 
AEF 
应用基本文件（Application Elementary File） 
AFI 
Type B的应用族识别符 (Application Family Identifier,Type B) 
AFL 
应用文件定位器（Application File Locator） 
AID 
应用标识符（Application Identifier） 
AIP 
应用交互特征（Application Interchange Profile） 
AM 
调幅（Amplitude Modulation） 
APDU 
应用协议数据单元（Application Protocol Data Unit） 
Apf 
在REQB/WUPB中使用的防冲突前缀f（Type B）( Anticollision Prefix f, 
used in REQB/WUPB, Type B) 
Apn 
在Slot-MARKER命令中使用的防冲突前缀n（Type B） (Anticollision 
Prefix n, used in Slot-MARKER Command, Type B) 
ARC 
授权响应码（Authorization Response Code） 
ARPC 
授权响应密文（Authorization Response Cryptogram） 
ARQC 
授权请求密文（Authorization Request Cryptogram） 
ASK 
移幅键控(Amplitude Shift Keying) 
ATC 
应用交易计数器（Application Transaction Counter） 
ATM 
自动柜员机（Automated Teller Machine） 
ATQ 
请求应答(Answer To Request) 
ATQA 
Type A的请求应答(Answer To reQuest, Type A) 
ATQB 
Type B的请求应答（Answer To reQuest, Type B） 
ATS 
Type A的选择应答（Answer To Select, Type A） 
ATTRIB 
Type B的PICC选择命令(PICC selection command, Type B) 
AUC 
应用用途控制（Application Usage Control） 
AuthC 
授权控制(Authorization Controls) 
b 
二进制（Binary） 
BCC 
UID CLn校验字节，4个先前字节的“异或”值（Type A）(UID CLn check 
byte, calculated as exclusive-or over the 4 previous bytes, Type A) 
BCD 
二进制编码的十进制表示法（Binary Coded Decimal） 
BER 
基本编码规则（Basic Encoding Rules） 
BIN 
银行标识号(Bank Identification Number) 
BPSK 
二进制移相键控(Binary Phase Shift Keying) 
C：=(A||B) 
将m位数字B和n位数字A进行链接，定义为：C=2mA+B 
CA 
认证中心（Certificate Authority） 
CAM 
卡片认证方法（Card Authentication Method） 
CBC 
密码块链接（Cipher Block Chaining） 
CDA 
复合动态数据认证/应用密文生成（Combined DDA/AC Generation） 
CDOL 
卡片风险管理数据对象列表（Card Risk Management Data Object List） 
CID 
密文信息数据（Cryptogram Information Data） 
CLA 
命令报文的类别字节（Class Byte of the Command Message） 
中国银联 
版权所有

---
**[p14]**

Q/CUP 045.0-2014 
13 
CLn 
Type A的串联级n，3≥n≥1(Cascade Level n, Type A) 
C-MAC 
命令—报文鉴别码（Command-Message Authentication Code） 
cn 
压缩数字型（Compressed Numeric） 
CRC 
循环冗余校验(Cyclic Redundancy Check) 
CRC_A 
Type A的循环冗余校验差错检测码(Cyclic Redundancy Check error 
detection code A) 
CRC_B 
Type B的循环冗余校验差错检测码（Cyclic Redundancy Check error 
detection code for Type B） 
CT 
Type A的串联标记(Cascade Tag, Type A) 
CTTA 
累计脱机交易总金额（Cumulative Total Transaction Amount） 
CTTAL 
累计脱机交易总金额限制（Cumulative Total Transaction Amount Limit） 
CTTAUL 
累计脱机交易总金额上限（Cumulative Total Transaction Amount Upper 
Limit） 
CVM 
持卡人验证方法（Cardholder Verification Method） 
CVN 
卡片验证值（Card Verification Number） 
D 
除数(Divisor) 
dCVN 
动态卡片验证值（Dynamic Card Verification Number），由卡片应用产
生的一个动态签名。动态CVN替代了在磁道2等价数据中的静态CVN 
DDA 
动态数据认证（Dynamic Data Authentication），在脱机认证中可以防
止伪卡，卡片对交易中的特定数据产生RSA签名用于终端验证 
DDF 
目录定义文件（Directory Definition File） 
DDOL 
动态数据认证数据对象列表（Dynamic Data Authentication Data Object 
List） 
DEK/TK 
数据加密密钥(Data Encryption Key) 
DES 
数据加密标准（Data Encryption Standard） 
DF 
专用文件（Dedicated File） 
DGI 
数据分组标识符(Data Grouping Identifier) 
DIR 
目录（Directory） 
DKI 
子密钥索引（Derivation Key Index） 
DOL 
数据对象列表（Data Object List） 
DR 
接收的除数（PCD到PICC）(Divisor Receive (PCD to PICC)) 
DRI 
接收的除数整数（PCD到PICC）(Divisor Receive Integer (PCD to PICC)) 
DS 
发送的除数（PICC到PCD）(Divisor Send (PICC to PCD)) 
DSI 
发送的除数整数（PICC到PCD）(Divisor Send Integer (PICC to PCD) 
E 
Type A的通信结束(End of communication , Type A) 
EC 
电子现金（Electronic Cash） 
ECB 
电子密码本（Electronic Code Book） 
EDC 
错误校验码（Error Detection Code） 
EF 
基本文件（Elementary File） 
EGT 
Type B的额外保护时间(Extra Guard Time, Type B) 
EMV 
Europay、MasterCard和VISA 
ENC MDK 
数据加密的DEA主密钥(Master Data encipherment DEA Key) 
EOF 
帧结束(End Of Frame) 
EoS 
序列结束（End of Sequence） 
中国银联 
版权所有

---
**[p15]**

Q/CUP 045.0-2014 
14 
etu 
基本时间单元(Elementary time unit) 
fc 
载波频率（Carrier frequency） 
FCI 
文件控制信息（File Control Information），当读写器或终端选择卡片应
用（使用SELECT命令）时，由卡片响应返回 
fDDA 
快速DDA（Fast DDA），符合JR/T 0025定义的一种快速DDA。用于qUICS
交易，允许读写器发出READ RECORD命令从卡片获取动态数据认证
（DDA）相关的数据，在卡片离开感应区后执行DDA计算 
FDT 
帧延迟时间(Frame Delay Time) 
FIPS 
联邦信息处理标准（Federal Information Processing Standard） 
FO 
Type B帧选项（Frame Option, Type B） 
fs 
副载波调制频率(Frequency of subcarrier modulation) 
FSC 
接近式IC卡帧长度(Frame Size for proximity Card) 
FSCI 
接近式卡帧长度整数（Frame Size for proximity Card Integer） 
FSD 
接近式耦合设备帧长度(Frame Size for proximity coupling Device) 
FSDI 
接近式耦合设备帧长度整数（Frame Size for proximity coupling Device 
Integer） 
FWI 
帧等待时间整数（Frame Waiting Time）——用于定义时间段的整数值
编码，定义了PICC在读写器帧结束后开始响应的最大时间 
FWT 
帧等待时间(帧等待时间)( Frame Waiting Time) 
FWTTEMP 
临时帧等待时间(temporary Frame Waiting Time) 
GPO 
获取处理选项（Get Processing Options） 
H:=Hash[MS
G] 
用160位的HASH函数对任意长度的报文MSG进行HASH运算。 
Hex 
十六进制（Hexadecimal） 
HLTA 
Type A PICC暂停命令(Halt Command, Type A) 
HLTB 
Type B PICC暂停命令(Halt Command, Type B) 
HSM 
硬件安全模块(Hardware Secure Module) 
IAC 
发卡行行为代码（Issuer Action Code），确定脱机交易拒绝（IAC Denial）、
发送至联机（IAC Online）以及如果不能联机则返回脱机拒绝（IAC 
Default）的条件 
IC 
集成电路（Integrated Circuit） 
ICC 
集成电路卡(Integrated Circuit(s) Card) 
iCVN 
替代的CVN，用于个人化在芯片中的磁道2等价数据的镜像 
ID 
标识号(IDentification number) 
IDD 
发卡行自定义数据（Issuer Defined Data） 
IEC 
国际电工委员会（International Electrotechnical Commission） 
IFD 
接口设备（Interface Device） 
INF 
信息域(INFormation field) 
INS 
命令报文的指令字节（Instruction Byte of Command Message） 
ISO 
国际标准化组织(International Organization for Standardization) 
ISS 
发卡行(ISSuer) 
KDEK 
卡片独有的密钥，用于产生DES密钥或其他可选保密数据会话密钥 
KEK/TK 
密钥交换密钥/传输密钥—由数据准备系统和个人化设备共享(Key 
Exchange Key Transport Key) 
中国银联 
版权所有

---
**[p16]**

Q/CUP 045.0-2014 
15 
KEKISS 
密钥交换密钥—由发行方和数据准备系统共享(Key Exchange Key) 
KENC 
卡片独有的密钥，用于产生加密会话密钥 
KMAC 
卡片独有的密钥，用于产生C-MAC会话密钥 
KMC 
DES主密钥，用于在个人化过程中分散密钥来产生KENC，KDEK，
KMAC） 
KMCID 
DES主密钥标识符 
KS 
过程密钥（Session Key） 
Lc 
终端应用层（TAL）在情况3或情况4命令中发出数据的实际长度（Exact 
Length of Data Sent by the TAL in a Case 3 or 4 Command） 
LDD 
IC卡动态数据长度（Length of the ICC Dynamic Data） 
LRC 
纵向冗余校验（Longitudinal Redundancy Check）。用于验证数据以保
证数据从物理磁条中读出过程中不发生丢失 
LSB 
最低有效位(Least Significant Bit) 
LV 
非接触快速借记/贷记的小额支付选项（Low Value） 
M 
必备（Mandatory） 
MAC 
报文鉴别码（Message Authentication Code） 
MAC MDK 
报文鉴别码DEA主密钥 
MAC UDK 
报文鉴别码DEA唯一子密钥 
max 
最大值（Index to define a maximum value） 
MBL 
最大缓冲长度（Maximum Buffer Length） 
MBLI 
最大缓冲区长度索引（Maximum Buffer Length Index） 
MDK 
主密钥（Master DEA Key），用于派生卡片唯一密钥（用于联机卡片
认证）的一个双长度DES密钥 
MF 
主文件（Master File） 
min 
最小值（Index to define a minimum value） 
MMYY 
月、年（Month,Year） 
MSB 
最高有效位(Most Significant Bit) 
 
 
MSI 
磁条位图（Magnetic Stripe Image），不能用于非接触磁条技术上 
n 
数字型（Numeric） 
N 
Type B 防冲突槽的数目或每个槽内PICC响应的概率(Number of 
anticollision slots or PICC response probability in each slot, Type B) 
N/A 
不可用（Not Applicable） 
NAD 
结点地址(Node ADdress) 
NAK 
否定确认（Negative AcKnowledgement） 
NCA 
认证中心公钥模长（Length of the Certification Authority Public Key  
Modulus） 
NI 
发卡行公钥模长（Length of the Issuer Public Key Modulus） 
NIC 
IC卡公钥模长（Length of the ICC Public Key Modulus） 
NRZ-L 
不归零电平（L为电平）(Non-Return to Zero, (L for level)) 
NVB 
Type A的有效位的数目(Number of Valid Bits, Type A) 
O 
可选（Optional） 
OOK 
开/关键控(On/Off Keying) 
OSI 
开放系统互连(Open System Interconnection) 
中国银联 
版权所有

---
**[p17]**

Q/CUP 045.0-2014 
16 
P 
Type A的奇校验位(Odd Parity Bit, Type A) 
P1 
参数1（Parameter 1） 
P2 
参数2（Parameter 2） 
PAN 
主账号（Primary Account Number） 
PARAM 
属性格式中的参数(PARAMeter) 
PCA 
认证中心公钥（Certification Authority Public Key） 
PCB 
协议控制字节(Protocol Control Byte) 
PCD 
接近式耦合设备（读写器）（Proximity Coupling Device），使用感应
耦合向消费者设备提供电源、并控制与消费者设备交换数据的读写器 
PDA 
个人数字助理（Personal Digital Assistant） 
PDOL 
处理选项数据对象列表（Processing Options Data Object List）。卡片需
要的终端数据对象的一个列表 
PEK/TK 
PIN加密密钥—一个专门用于PIN传输的传输密钥 
PI 
发卡行公钥（Issuer Public Key） 
PIC 
IC卡公钥（ICC Public Key） 
PICC 
接近式IC卡（Proximity IC Card），在耦合设备上操作、卡片类型为ID-1
（大尺寸卡）的识别卡 
PIN 
个人识别码（Personal Identification Number） 
PIX 
扩展的专用应用标识符(Proprietary Application Identifier Extension) 
PKI 
公钥基础设施(Public Key Infrastructure) 
PM 
调相（Phase Modulation） 
PPS 
协议和参数选择(Protocol and Parameter Selection) 
PPS0 
协议和参数选择参数0(Protocol and Parameter Selection parameter 0) 
PPS1 
协议和参数选择参数1(Protocol and Parameter Selection parameter 1) 
PPSE 
近距离支付系统环境（Proximity Payment Systems Environment），支持
的应用标识、应用标签和应用优先指示器的一个列表，可以通过非接
触界面访问。该列表包括所有目录的入口，由卡片在SELECT PPSE
（“2PAY.SYS.DDF01”）响应的FCI中返回 
PPSS 
协议和参数选择开始(Protocol and Parameter Selection Start) 
Proximity 
本文档中，proximity是指JR/T 0025所描述的非接触技术 
PSE 
支付系统环境（Payment System Environment） 
PUPI 
Type B的伪唯一PICC标识符 (Pseudo-Unique PICC Identifier, Type B) 
PVKI 
PIN验证密钥索引（PIN Verification Key Index） 
qUICS 
快速借记/贷记应用（quick UICS），以保证通过非接触界面进行快速
交易 
R 
Type B的防冲突序列期间PICC所选定的槽号 (Slot number chosen by 
the PICC during the anticollision sequence, Type B) 
R(ACK) 
包含肯定确认的R-块(R-block containing a positive acknowledge) 
R(NAK) 
包含否定确认的R-块(R-block containing a negative acknowledge) 
RATS 
Type A的选择应答请求(Request for Answer To Select, Type A) 
REQA 
Type A的请求命令（REQuest command, Type A） 
REQB 
Type B的请求命令(Request Command, Type B) 
RF 
射频（Radio Frequency） 
RFU 
预留（Reserved for Future Use） 
中国银联 
版权所有

---
**[p18]**

Q/CUP 045.0-2014 
17 
RID 
注册的应用提供商标识（Registered Application Provider Identifier） 
RSA 
Rivest、Sharmir和Adleman提出的一种非对称密钥算法，用于加密和认
证 
S 
Type A的通信开始(Start of communication, Type A) 
SAD 
签名的静态应用数据（Signed Static Application Data） 
SAK 
Type A的选择确认(Select AcKnowledge, Type A) 
SCA 
认证中心私钥（Certification Authority Private Key） 
SDA 
静态数据认证（Static Data Authentication） 
SDAD 
签名的动态应用数据（Signed Dynamic Application Data） 
SEL 
Type A的选择码(SELect code, Type A) 
SFGI 
启动帧保护时间整数(Start-up Frame Guard time Integer) 
SFI 
短文件标识符（Short File Identifier） 
SHA 
安全哈希算法（Secure Hash Algorithm） 
SI 
发卡行私钥（Issuer Private Key） 
SIC 
IC卡私钥（ICC Private Key） 
SKUENC 
用于加密的会话密钥，由KENC生成 
SKUKEK 
用于加密DES密钥或其他可选保密数据的会话密钥, 由KDEK生成 
SKUMAC 
用于在命令处理过程中创建C-MAC，由KMAC生成 
SOF 
帧开始(Start Of Frame) 
SoS 
序列开始（Start of Sequence） 
Status Check 
一些商户（例如，加油站）为了对特定金额取得联机认证而采用的一
种状态检查。该状态检查采用一个单位货币来执行 
SUDK ENC 
由MAC ENC产生的独有数据加密会话密钥 
SUDK MAC 
由MAC UDK产生的报文鉴别码会话密钥 
SW1 
状态字1（Status Word One） 
SW2 
状态字2(Status Word Two) 
TAC 
终端行为代码（Terminal Action Code） 
TAL 
终端应用层（Terminal Application Layer） 
TC 
交易证书（Transaction Certificate），当接受交易时产生的应用密文 
TDOL 
交易证书数据对象列表(Transaction Certificate Data Object List) 
TK 
传输密钥 
TLV 
标签、长度、值（Tag Length Value） 
TR0 
Type B的PCD off和PICC on之间静默的最小延迟 (Guard Time, Type B) 
TR1 
Type B的PICC数据传输之前最小副载波的持续期 (Synchronization 
Time, Type B) 
TSI 
交易状态信息(Transaction Status Information) 
TVR 
终端验证结果(Terminal Verification Results) 
UDK 
子密钥（Unique DEA Key），从主密钥派生出的卡片唯一双长度DES
密钥，用于卡片联机认证 
UID 
Type A的唯一标识符 (Unique Identifier, Type A) 
uidn 
Type A的唯一标识符的字节数目n，n≥0（Byte number n of UID, Type 
A） 
WTX 
等待时间延迟(Waiting Time eXtension) 
WTXM 
等待时间延迟乘数(Waiting Time eXtension Multiplier) 
中国银联 
版权所有

---
**[p19]**

Q/CUP 045.0-2014 
18 
WUPA 
Type A 的唤醒命令（Wake-UP command, Type A） 
WUPB 
Type B 的唤醒命令（Wake-UP command, Type B） 
X：= Recover(PK)[Y] 用公钥PK，通过非对称可逆算法，对数据块Y进行恢复 
X:=ALG-1(K)[Y] 
用密钥K，通过64位或128位分组加密方法，对64位或128位数据
块Y进行解密 
Y:=ALG(K)[X] 
用密钥K，通过64位或128位分组加密方法，对64位或128位数据
块X进行加密 
Y：=Sign(SK)[X] 
用私钥SK，通过非对称可逆算法，对数据块X进行签名 
 
中国银联 
版权所有