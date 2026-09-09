# 中国银联可信执行环境集成（TEEI）技术规范第12部分：N3TEE应用编程接口指南
> 来源: 银联规范 2015-12 存档 | 343页 | 提取: 2026-09-03


---
**[p1]**

ICS 
Q/CUP069 —2015 
Q/CUP 
Q/CUP 069—2015 
 
中国银联股份有限公司企业标准 
中国银联可信执行环境集成（TEEI）技术规范 
第12 部分：N3TEE 应用编程接口指南 
UnionPay Trusted Execution Environment Integration（TEEI）Technical Specifications 
Part 12：N3TEE Application Programming Interface Guide 
 
 
2015-07-01 发布 
2015- 07-01 实施
中国银联股份有限公司 发布 
中国银联 
版权所有

---
**[p2]**

1 
 
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

2 
 
目   次 
目   次 ...................................................................................................................................... 2 
前  言 .................................................................................................................................... 4 
1. 
范围 .................................................................................................................................... 5 
2. 
规范性引用文件 .................................................................................................................. 5 
3. 
术语与定义 ......................................................................................................................... 5 
3.1. 
客户 ................................................................................................................. 5 
3.2. 
客户属性 .......................................................................................................... 5 
3.3. 
取消标志 .......................................................................................................... 5 
3.4. 
命令 ................................................................................................................. 5 
3.5. 
命令标识符 ...................................................................................................... 5 
3.6. 
密钥对象 .......................................................................................................... 5 
3.7. 
密钥对对象 ...................................................................................................... 5 
3.8. 
数据对象 .......................................................................................................... 5 
3.9. 
数据流 ............................................................................................................. 6 
3.10. 
初始化的对象................................................................................................... 6 
3.11. 
密钥大小 .......................................................................................................... 6 
3.12. 
密钥使用标志................................................................................................... 6 
3.13. 
元数据 ............................................................................................................. 6 
3.14. 
对象属性 .......................................................................................................... 6 
3.15. 
对象标识符 ...................................................................................................... 6 
3.16. 
持久化对象 ...................................................................................................... 6 
3.17. 
属性 ................................................................................................................. 6 
3.18. 
REE 时间 ........................................................................................................... 6 
3.19. 
多媒体执行环境 ............................................................................................... 6 
3.20. 
会话 ................................................................................................................. 6 
3.21. 
存储标识符 ...................................................................................................... 6 
3.22. 
系统时间 .......................................................................................................... 6 
3.23. 
可信应用的持久化时间 .................................................................................... 7 
3.24. 
临时对象 .......................................................................................................... 7 
3.25. 
可信的存储空间 ............................................................................................... 7 
3.26. 
未初始化的对象 ............................................................................................... 7 
3.27. 
统一资源标识符 ............................................................................................... 7 
4. 
符号和缩略语 ...................................................................................................................... 7 
5. 
基于ARM 可信硬件进行实现 ................................................................................................ 9 
5.1. 
综述 ................................................................................................................. 9 
5.2. 
可信应用编程接口 ........................................................................................... 9 
5.2.1. 
接口概述....................................................................................................... 9 
5.2.2. 
com.cup.tee.framework ............................................................................. 10 
5.2.3. 
com.cup.tee.cryptography........................................................................ 26 
5.2.4. 
com.cup.tee.trustedstorage .................................................................... 45 
中国银联 
版权所有

---
**[p4]**

3 
 
5.2.5. 
com.cup.tee.time ...................................................................................... 58 
5.2.6. 
com.cup.teex.tui ...................................................................................... 60 
5.2.7. 
com.cup.teex.secureelement .................................................................... 83 
5.2.8. 
com.cup.teex.arithmetical ...................................................................... 90 
5.2.9. 
com.cup.teex.socket ................................................................................. 98 
5.2.10. 
com.cup.teex.debug ............................................................................... 109 
5.2.11. 
com.cup.teex.nfc .................................................................................. 109 
5.2.12. 
com.cup.tee.fingerprint ...................................................................... 156 
5.2.13. 
java.lang ............................................................................................... 158 
5.2.14. 
java.util ............................................................................................... 217 
6. 
基于IA 可信硬件架构进行实现 ...................................................................................... 233 
6.1. 
综述 ............................................................................................................. 233 
6.2. 
可信应用编程接口 ....................................................................................... 233 
6.2.1. 
接口集概述 ............................................................................................... 233 
6.2.2. 
com.cup.crypto ........................................................................................ 234 
6.2.3. 
com.cup.langutil .................................................................................... 271 
6.2.4. 
com.cup.nfc ............................................................................................. 278 
6.2.5. 
com.cup.ui ............................................................................................... 292 
6.2.6. 
com.cup.util ........................................................................................... 312 
 
中国银联 
版权所有

---
**[p5]**

4 
 
前  言 
本指南阐述了N3TEE及其上可信应用开发实现相关的指南说明，包括N3TEE应用开发所需
的N3TEE可信应用编程接口等相关接口说明。 
本部分由中国银联股份有限公司组织制定。 
本部分的主要起草单位：中国银联电子支付研究院。 
本部分的主要起草人：徐燕军、鲁志军、何朔、周钰、郭伟、李定洲、陈成钱、曾望年、
严翔翔、石玉平、俞之浩、王立刚、张楚、邱建华。 
本文档中的所有内容为中国银联股份有限公司的机密和专属所有。未经中国银联
股份有限公司的明确书面许可，任何组织或个人不得以任何目的、任何形式及任
何手段复制或传播本文档部分或全部内容。 
中国银联 
版权所有

---
**[p6]**

5 
 
中国银联可信执行环境集成（TEEI）技术规范 
第12 部分：N3TEE 应用编程接口指南 
1. 范围 
N3TEE 应用开发指南定义了基于ARM 可信硬件和基于IA 可信硬件两种硬件架构下的
N3TEE 可信应用编程接口相关内容。 
本指南配套于TEEI 规范，适用于由金融机构发行的N3TEE 平台开发。 
2. 规范性引用文件 
[1] GlobalPlatform Device Technology TEE System Architecture 
[2] GlobalPlatform Device Technology TEE Client API Specfication 1.0 
[3] GlobalPlatform Device Technology TEE Internal API Specfication 1.0 
3. 术语与定义 
3.1. 客户 
代指以下任何一种情况： 
——使用N3TEE 客户端API 的客户端应用； 
——可信应用作为另一个可信应用的客户，使用内部客户端API。 
3.2. 客户属性 
和一个可信应用的客户关联的一组属性。 
3.3. 取消标志 
客户已经请求取消一个操作的指示符 
3.4. 命令 
由客户发送到可信应用的启动一个操作的消息（包括命令标识符以及操作参数）。 
3.5. 命令标识符 
标识一个命令的32 位整数。 
3.6. 密钥对象 
包括密钥数据的一个对象。 
3.7. 密钥对对象 
包括一个密钥对数据的一个对象。 
3.8. 数据对象 
包含数据流，没有密钥数据的对象。 
中国银联 
版权所有

---
**[p7]**

6 
 
3.9. 数据流 
和持久化对象关联的数据（不包括数据属性以及元数据）。 
3.10. 初始化的对象 
已经写入属性的临时对象。 
3.11. 密钥大小 
和密钥对象关联的密钥的大小，其值由使用的密钥算法限制。 
3.12. 密钥使用标志 
对密钥对象许可的操作的指示符。 
3.13. 元数据 
与密钥对象关联的附加数据，包括密钥大小以及密钥使用标志。 
3.14. 对象属性 
Object Attribute,以结构化方式存储密钥资料的少量数据。 
3.15. 对象标识符 
标识持久化对象的可变长度的二进制缓冲区。 
3.16. 持久化对象 
由对象标识符标识的具有数据流的对象。 
3.17. 属性 
Property,由名字标识的不变的值。 
3.18. REE 时间 
与REE 一样可信的时间值。 
3.19. 多媒体执行环境 
Rich Execution Environment(REE),由多媒体操作系统提供并控制的环境，位于TEE
的外部，该环境以及其内运行的应用认为是不可信的。 
3.20. 会话 
Session,被调用的多条可信应用命令的逻辑上的连接。 
3.21. 存储标识符 
可由可信应用访问的可信存储空间的32 位标识符。 
3.22. 系统时间 
可用于计算时间差和操作的最后期限的时间值。 
中国银联 
版权所有

---
**[p8]**

7 
 
3.23. 可信应用的持久化时间 
由可信应用设置的时间值，可跨越平台自举，其信任级别可查询。 
3.24. 临时对象 
Transient Object,只包含属性，不包括数据流的对象，当关闭或可信应用实例删除时
被回收。 
3.25. 可信的存储空间 
只有可信应用可以访问的存储空间. 
3.26. 未初始化的对象 
指定对象类型以及最大大小而分配的临时对象，但没有写入属性。 
3.27. 统一资源标识符 
Universally Unique Identifier (UUID),RFC 4122 指定的一个标识符。 
4. 符号和缩略语 
ABI  
应用二进制接口(Application Binary Interface) 
API  
应用编程接口(Application Programming Interface) 
OMTP   开放移动终端平台(Open Mobile Terminal Platform) 
REE  
多媒体执行环境(Rich Executive Environment) 
RFU   
留作将来使用(Reserved for Future Use) 
SIM   
用户识别模块(Subscriber Identity Module) 
TEE  
可信执行环境(Trusted Executive Environment) 
UICC   通用集成电路卡(Universal Integrated Circuit Card) 
UUID   通用唯一识别(Universal Unique Identifier) 
AES  
高级加密标准（Advanced Encryption Standard） 
CA  
客户端应用（Client Application） 
CBC  
分组密码算法加密块链模式（Cipher Block Chain） 
DAL  
动态应用加载（Dynamic Application Loader） 
DES  
数据加密标准 
DH   
Diffie-Hellman 
DSA  
数据签名算法 
CTR  
分组密码算法计数模式 
ECB  
分组密码算法电码本模式（Electronic Codebook） 
HMAC 
基于哈希的消息认证码 
IA  
英特尔平台架构（Intel Architecture） 
IV  
初始向量（Initialization Vector） 
MAC  
消息鉴别码 
MD5  
消息摘要5（Message Digest 5） 
N3TEE 
支持Java 语言编写可信应用的TEE 
OS  
操作系统（Operating System） 
PKCS 
公钥密钥标准（Public Key Cryptography Standards） 
中国银联 
版权所有

---
**[p9]**

8 
 
PTD  
受保护的交易显示（Protected Transaction Display） 
RSA  
Rivest, Shamir, Adleman 
SHA  
安全哈希算法（Secure Hash Algorithm） 
SSL  
加密套接字协议层（Security Socket Layer） 
TA  
可信应用（Trusted Application） 
TUI  
可信图形界面（Trusted User Interface） 
VM  
虚拟机（Virtual Machine） 
AAD  
附加的认证数据（Additional Authenticated Data） 
AE  
认证的加密（Authenticated Encryption） 
API  
应用编程接口（Application Programming Interface） 
CA  
客户端应用（Client Application） 
CMAC   基于密码的MAC 
CRT  
中国余数定理  
ISD  
初始安全域（Initial Security Domain） 
ISO  
国际标准化组织 
REE  
多媒体执行环境（Rich Execution Environment） 
RFC  
可表示由IETF 发布的一份备忘录（Request For Comments） 
RFU  
保留供将来使用（Reserved For Future Use） 
SD  
安全域（Security Domain） 
SSD  
辅助安全域（Supplementary Security Domain） 
 
中国银联 
版权所有

---
**[p10]**

9 
 
5. 基于ARM 可信硬件进行实现 
5.1. 综述 
N3TEE 是一个可移植、开放的可信执行环境，可在设备上执行可信的应用，N3TEE 使用
ARM TrustZone 技术将平台分隔为两个区域，其中一个区域运行传统的多媒体操作系统
（Android），可执行多媒体应用，另一个区域运行N3TEE 可执行环境。 
N3TEE 包括一个Java 运行环境以及使用Java 编写的可信应用。可信应用以设备上的客
户-服务器架构向Android 应用提供安全功能。Android 应用通过通信机制以及N3TEE 提供
的API 函数请求N3TEE 的安全功能，Android 的调用者通常是一个应用，称为客户端应用，
这些API 称为客户端API。 
    N3TEE 提供内部API 用于可信应用的开发，这些API 称为可信应用API，可信应用通过
调用这些API 实现安全功能。 
5.2. 可信应用编程接口 
5.2.1. 接口概述 
为更好地提升N3TEE 应用跨平台开发的便捷性，基于ARM 可信硬件设计的N3TEE 可信应
用编程接口集在设计上较好的兼容了现有主流TEE 相关的核心Internal API，同时，N3TEE
还根据金融安全的应用场景和使用需求设计和增加了包括NFC、指纹在内的各种重要功能
API，为N3TEE 的应用场景拓展提供了方便。 
本部分将功能API 分为核心接口集以及拓展接口集。 
开发者可以根据各自需要进行选择性实现。 
5.2.1.1. 核心接口集 
此部分的API 为N3TEE 所必须实现的基础接口，包括如下Java 包； 
表1 N3TEE 基础接口相关Java 包 
com.cup.tee.cryptography 
密码操作API 包，支持摘要、消息认证码、认证加密、
对称加密、非对称加密、生成随机数等密码操作。  
com.cup.tee.framework 
框架包定义了可信应用的框架。 
com.cup.tee.time 
时间API，可以访问系统时间、可信应用的持久化时间
以及REE 时间，对系统时间、可信应用的持久化时间
的信任程度可查询相关属性。  
com.cup.tee.trustedstorage 
可信存储API，支持可信应用的数据、密码的可信地存
储在可信存储空间，可以建立对象标识符标识的持久
化对象。 
5.2.1.2. 拓展接口集 
此部分的API 为N3TEE 提供的增强API 功能接口，包括如下Java 包； 
表2 N3TEE 提供的增强API 功能接口相关Java 包 
中国银联 
版权所有

---
**[p11]**

10 
 
com.cup.teex.arithmetical 
算术运算API，开发者使用这些API 可实现密码API 未提
供的非对称密码算法。 
com.cup.teex.debug 
Debug API 输出调试信息，Debug 类的静态方法可用于输
出指定的消息,用于开发阶段调试应用。 
com.cup.teex.nfc 
NFC API 实现卡仿真模式、读写器模式以及访问连接到NFC
控制器上的SE 等功能。 
com.cup.tee.biometric 
生物识别API，提供可信的生物识别身份认证方式 
com.cup.teex.secureelement 
安全模块访问API,通过服务类找到相关的读写器，与读写
器的中安全模块建立会话，通过逻辑通道选择安全模块内
的应用后，可以向应用发送APDU 命令。 
com.cup.teex.socket 
套接字API，TA 通过套接字可以与其他网络节点安全地通
信。 
com.cup.teex.tui 
TUI API，TA 通过调用TUI API 可以与用户进行交互，显
示敏感信息给用户或从用户获得敏感信息的输入。 
5.2.1.3. Java 编程基本类库 
表3 Java 编程基本类库 
java.io 
Java I/O 支持类。  
java.lang 
Java 语言支持类 。 
java.util 
Java 实用工具类。 
5.2.2. com.cup.tee.framework 
5.2.2.1. 描述 
框架包提供类和接口框架，用于构建N3TEE 可信应用，并与其通信以及协作；这些类以
及接口提供N3TEE 环境的最低功能要求。  
包括可信应用的格式，可信应用关联的属性访问，定义可信应用如何处理客户的取消请
求，以及可信应用间的访问等功能 。 
5.2.2.2. Identity 
5.2.2.2.1. 声明 
public interface Identity 
5.2.2.2.2. 描述 
这个类封装了客户的完整的身份。 
中国银联 
版权所有

---
**[p12]**

11 
 
5.2.2.2.3. 字段 
——TEE_LOGIN_PUBLIC 
static final int TEE_LOGIN_PUBLIC 
客户是在REE 端，既没有被识别也没有被认证，客户没有标识。 
——TEE_LOGIN_USER 
static final int TEE_LOGIN_USER 
客户端应用已被REE 识别，客户UUID 反映运行应用的实际用户。 
——TEE_LOGIN_GROUP 
static final int TEE_LOGIN_GROUP 
客户UUID 反映执行正调用应用的组标识，组标识以及对应UUID 是REE 特定的。 
——TEE_LOGIN_APPLICATION 
static final int TEE_LOGIN_APPLICATION 
客户已被REE 识别，且和执行应用的用户无关，标识的性质以及对应的UUID 是REE 特
定。 
——TEE_LOGIN_APPLICATION_USER 
static final int TEE_LOGIN_APPLICATION_USER 
客户UUID 标识正调用的应用以及执行应用的用户。 
——TEE_LOGIN_APPLICATION_GROUP 
static final int TEE_LOGIN_APPLICATION_GROUP 
客户UUID 标识正调用的应用以及执行应用的组。 
——TEE_LOGIN_TRUSTED_APP 
static final int TEE_LOGIN_TRUSTED_APP 
客户是另一个可信应用，客户的标识是这个可信应用的UUID。 
5.2.2.2.4. 方法 
getLogin 
int getLogin() 
返回客户的登录类型。 
返回:  
 返回某个 TEE_LOGIN_XXX 常量。 
getUUID 
UUID getUUID() 
返回客户端应用的UUID。 
返回:  
 客户端应用的UUID。 
5.2.2.3. InternalClient 
中国银联 
版权所有

---
**[p13]**

12 
 
5.2.2.3.1. 声明 
public interface InternalClient 
5.2.2.3.2. 描述 
这个接口定义3 个方法，允许一个可信应用成为另一个可信应用的客户，可信应用通过
调用TEESystem 的静态方法getInternalClient 得到该接口的实例。 
5.2.2.3.3. 方法 
openSession 
int openSession( 
UUID   
destination, 
               int    
cancellationRequestTimeout, 
               Parameters  parameters 
) 
可信应用可请求和另一个可信应用间打开一个会话。 
参数:  
 destination - 建立会话的目标可信应用 。 
 cancellationRequestTimeout - 以毫秒为单位的超时数，或
TEE_TIMEOUT_INFINITE 指示不超时，超时过后取消操作请求必须被自动发送 。 
 parameters - 操作中传递的参数 。 
返回:  
 返回起源。 
invokeCommand 
int invokeCommand(int   
cancellationRequestTimeout, 
                   int   
commandID, 
                   Parameters  
parameters 
) 
可信应用向提供服务的可信应用发送命令。 
参数:  
 cancellationRequestTimeout - 以毫秒为单位的超时数，或
TEE_TIMEOUT_INFINITE 指示不超时，超时过后取消操作请求必须被自动发送 。 
 commandID - 发送命令的标识 。 
 parameters - 操作中传递的参数 。 
返回:  
 返回起源。 
closeSession 
中国银联 
版权所有

---
**[p14]**

13 
 
void closeSession() 
关闭已打开的会话。 
5.2.2.4. Property 
5.2.2.4.1. 声明 
public interface Property 
5.2.2.4.2. 描述 
这个接口封装由名字和值对构成的属性，多个属性可组成一个属性组。 
5.2.2.4.3. 字段 
——TEE_PROSET_CURRENT_TA 
static final int TEE_PROSET_CURRENT_TA 
当前可信应用的配置属性。 
——TEE_PROSET_CURRENT_CLIENT 
static final int TEE_PROSET_CURRENT_CLIENT 
当前客户的属性。 
——TEE_PROSET_CURRENT_IMPLEMENTATION 
static final int TEE_PROSET_CURRENT_IMPLEMENTATION 
TEE 自身实现相关的属性。 
5.2.2.4.4. 方法 
getName 
int getName( 
byte[] name, 
        int offset 
        ) 
查询某个属性的名字。 
参数:  
 name - 存放属性名的字节数组引用 。 
 offset – 存放名字的数组偏移。  
返回:  
 属性名字的长度。 
getAsoBool 
boolean getAsoBool() 
中国银联 
版权所有

---
**[p15]**

14 
 
以布尔值形式返回属性值。 
返回:  
 true 或 false。 
getAsInt 
int getAsInt() 
以整数形式返回属性值。 
返回:  
 属性值表示的整数。 
getAsBinaryBlock 
int getAsBinaryBlock( 
  
 
byte[] value, 
            int offset 
  
 
) 
以二进制块形式返回属性值。 
参数:  
 value - 存放数据块的字节数组引用 。 
 offset - 字节数组的偏移。  
返回:  
 放数据块的实际长度。 
getAsUUID 
UUID getAsUUID() 
以UUID 形式返回属性值。 
返回:  
 属性值表示的UUID 
getAsIdentity 
Identity getAsIdentity() 
以Identity 形式返回属性值。 
返回:  
 属性值表示的Identity。 
5.2.2.5. PropertyEnumerator 
5.2.2.5.1. 声明 
public  interface  PropertyEnumerator 
5.2.2.5.2. 描述 
中国银联 
版权所有

---
**[p16]**

15 
 
该接口用于枚举出一个属性集的每个属性。 
5.2.2.5.3. 方法 
start 
void start(int propSet) 
指定要开始枚举的属性集。 
参数: 
 propSet - 枚举的属性集，必须为下属值之一： 
(1) TEE_PROSET_CURRENT_TA； 
(2) TEE_PROSET_CURRENT_CLIENT； 
(3) TEE_PROSET_CURRENT_IMPLEMENTATION； 
reset 
void reset() 
对枚举器进行复位，即重新开始枚举。 
hasNext 
boolean hasNext() 
检查属性集是否还有其他属性。 
返回: 
 true 表示有属性，false 表示没有属性可枚举了。 
next 
Property next() 
如果 hasNext 返回true，该方法返回枚举器的当前属性，移动到下一个属性（如果还有），
如果 hasNext 返回false ， 调用该方法应返回null。 
返回: 
 
Property 实例。 
5.2.2.6. Application 
5.2.2.6.1. 声明 
java.lang.Object 
  |  
+--com.cup.tee.framework.Application 
public abstract class Application extends Object 
5.2.2.6.2. 描述 
中国银联 
版权所有

---
**[p17]**

16 
 
该抽象类定义基于N3TEE 支持的可信应用。 用户实现的可信应用必须扩展该抽象类，
以便在N3TEE 实现下载、安装以及执行操作。 
5.2.2.6.3. 构造器 
Application 
public Application() 
5.2.2.6.4. 方法 
openSession 
public boolean openSession(Parameters parameters) 
由N3TEE 运行环境回调，通知该可信应用客户端应用请求与其建立会话。 客户端应用
打开一个会话时可以指定传递到可信应用的参数，可信应用也可以使用这些参数传输响应数
据到客户端应用。 
参数:  
 
parameters - 类Parameters 的实例，通过该类的方法可信应用可访问客户端应用
指定的输入参数 。 
返回:  
 
true 指示会话已打开成功，false 指示会话打开失败。 
invokeCommand 
public void invokeCommand( 
  
int  
 
cmdID,  
  
Parameters parameters 
        ) throws TEEException 
由N3TEE 运行环境调用，用于处理客户端应用发送的命令； 若方法从N3TEE 正常返回，
N3TEE 设置命令处理结果为TEE_SUCCESS，如果抛出TEEException，N3TEE 设置命令的返回
值为TEEException 中指定的错误码。 
参数:  
 
cmdID - 指定被调用的命令标识。  
 
parameters - 指定命令的参数。 
抛出： 
 
TEException – 指定了返回客户的错误码。 
closeSession 
public void closeSession() 
N3TEE 调用该方法关闭与客户端应用已建立的会话。 
5.2.2.7. Parameters 
中国银联 
版权所有

---
**[p18]**

17 
 
5.2.2.7.1. 声明 
java.lang.Object 
   |  
+--com.cup.tee.framework.Parameters  
public final class Parameters extends Object 
5.2.2.7.2. 描述 
  该类封装了客户端应用与可信应用通信的消息格式，消息格式由N3TEE客户端API定义。 
5.2.2.7.3. 字段 
——TEE_PARAM_TYPE_NONE 
public static final byte TEE_PARAM_TYPE_NONE 
无参数类型。 
——TEE_PARAM_TYPE_VALUE_INPUT 
public static final byte TEE_PARAM_TYPE_VALUE_INPUT 
输入整数值类型。 
——TEE_PARAM_TYPE_VALUE_OUTPUT 
public static final byte TEE_PARAM_TYPE_VALUE_OUTPUT 
输出整数值类型。 
——TEE_PARAM_TYPE_VALUE_INOUT 
public static final byte TEE_PARAM_TYPE_VALUE_INOUT 
输入输出整数值类型。 
——TEE_PARAM_TYPE_MEMREF_INPUT 
public static final byte TEE_PARAM_TYPE_MEMREF_INPUT 
输入引用类型。 
——TEE_PARAM_TYPE_MEMREF_OUTPUT 
public static final byte TEE_PARAM_TYPE_MEMREF_OUTPUT 
输出引用类型。 
——TYPE_PARAM_TYPE_MEMREF_INOUT 
public static final byte TYPE_PARAM_TYPE_MEMREF_INOUT 
输入输出引用类型。 
5.2.2.7.4. 构造器 
Parameters 
public Parameters() 
5.2.2.7.5. 方法 
中国银联 
版权所有

---
**[p19]**

18 
 
getType 
public short getType(short index) 
应用调用此方法来查询参数的类型。 
参数:  
 index - 参数索引号，从0 开始，最大值为3 。 
返回:  
 索引号对应参数类型。 
getBufferSize 
public int getBufferSize(short index) 
应用调用此方法来查询指定索引号的引用类型参数指向的缓冲区的大小。 
参数:  
 index - 参数的索引号，值的范围为0 到3 。 
返回:  
 引用类型指向的缓冲区的大小。 
getData 
public int getData( 
 
 
 
short  index, 
           int  
dataOffset, 
           int  
size, 
           byte[] buffer, 
           int  
offset 
     
 
) 
应用调用此方法来接收引用类型参数指向的缓冲区内的数据。 
参数:  
 
index - 参数的索引号，有效值范围为0 到3，指定索引位置的参数类型必须
为TEE_PARAM_TYPE_MEMREF_INPUT 或 TEE_PARAM_TYPE_MEMREF_INOUT 。 
 
dataOffset - 指向缓冲区内数据的偏移 。 
 
size - 要从缓冲区内复制的数据大小，以字节为单位。  
 
buffer - 接收数据的字节数组引用 。 
 
offset – 数组起始偏移 。 
返回:  
 
实际复制数据的字节大小。 
setData 
public int setData(short index, 
           int  
 
dataOffset, 
           int  
 
size, 
           byte[]  
buffer, 
           int  
 
offset 
  
 
) 
中国银联 
版权所有

---
**[p20]**

19 
 
应用调用此方法来返回数据块。 
参数:  
 index - 参数的索引号，有效值为0 到3，指定索引位置的参数类型必须为
TEE_PARAM_TYPE_MEMREF_OUTPUT 或 TEE_PARAM_TYPE_MEMREF_INOUT 。 
 dataOffset - 输出缓冲区的起始偏移地址 。 
 size - 应用想返回数据的大小。  
 buffer - 数组引用，存放应用想返回的数据。  
 offset - 数组偏移，从该偏移返回数据 。 
返回:  
 实际返回的数据，以字节为单位。 
getValue 
public int getValue( 
 
 
 
short   
index, 
            boolean  
valueA 
 
 
 
) 
应用调用此方法来接收整数类型的值。 
参数:  
 
index - 参数的索引号，有效值为0 到3，此索引的参数类型必须为
TEE_PARAM_TYPE_VALUE_INPUT 或TEE_PARAM_TYPE_VALUE_INOUT 。 
 
valueA - 获取value.a 值时置为 true, 获取value.b 值时置为 false。  
返回:  
 
返回整数类型的值。 
setValue 
public void setValue( 
 
 
 
short   
index, 
            boolean  
valueA, 
            int  
 
value 
 
 
 
) 
应用调用此方法来返回Value 类型的值。 
参数:  
 
index - 参数的索引号，有效值为0 到3，此索引的参数类型必须为
TEE_PARAM_TYPE_VALUE_OUTPUT 或TEE_PARAM_TYPE_VALUE_INOUT。  
 
valueA - 获取value.a 值时置为 true, 获取value.b 值时置为 false。  
 
value - Value 类型的值。 
5.2.2.8. TEESystem 
5.2.2.8.1. 声明 
java.lang.Object  
中国银联 
版权所有

---
**[p21]**

20 
 
| 
+--com.cup.tee.framework.TEESystem  
public class TEESystem  extends Object 
5.2.2.8.2. 描述 
该类提供支持取消操作、内部客户端API、以及查询可信应用的UUID 以及属性等功能。 
5.2.2.8.3. 构造器 
TEESystem 
public TEESystem() 
5.2.2.8.4. 方法 
getUUID 
public static UUID getUUID() 
查询调用此方法的当前应用的UUID。 
返回:  
 应用的UUID。 
getProperty 
public static Property getProperty( 
 
 
 
 
 
 
 
int  
propertySet, 
                  byte[] name, 
                  int  
offset, 
                  int  
length 
  
 
 
 
) 
查询指定属性集、指定属性名的Property 接口实例，通过该接口实例可得到属性的指
定类型的值。 
参数:  
 
propertySet - 指定属性集类型。  
 
name - 存放属性名字的字节数组的引用。  
 
offset - 字节数组的偏移。  
 
length - 属性名字的长度。  
返回:  
 
接口Property 的一个实例。 
getPropertyEnumerator 
public static PropertyEnumerator getPropertyEnumerator() 
得到一个属性集枚举器。 
中国银联 
版权所有

---
**[p22]**

21 
 
返回:  
 接口PropertyEnumerator 的一个实例。 
getInternalClient 
public static InternalClient getInternalClient() 
得到一个接口 InternalClient 的实例，用于请求另一个可信应用的服务。 
返回:  
 接口 InternalClient 的实例。 
getCancellationFlag 
public static boolean getCancellationFlag() 
确定当前应用的取消标志是否设置。 
返回:  
 true 取消标志已设置，false 取消标志未设置。 
UnmaskCancellation 
public static void UnmaskCancellation() 
允许对当前任务的设置取消标志。 
MaskCancellation 
public static void MaskCancellation() 
不允许对当前任务设置取消标志。 
5.2.2.9. UUID 
5.2.2.9.1. 声明 
java.lang.Object  
| 
+--com.cup.tee.framework.UUID  
 
public class UUID extends Object 
5.2.2.9.2. 描述 
这个类封装了和应用关联的UUID。 
5.2.2.9.3. 构造器 
UUID 
public UUID(int  timeLow, 
中国银联 
版权所有

---
**[p23]**

22 
 
     short   
timeMid, 
     short   
timeHiAndVersion, 
     byte[]  
clockSeqAndNode, 
     short   
clockSeqAndNodeOffset 
) 
      throws NullPointerException, ArrayIndexOutOfBoundsException 
构建一个 UUID 实例，封装指定UUID 字节。 
参数:  
 timeLow - 整数存放UUID 的32 位的timeLow 。 
 timeMid - 短整数存放UUID 的16 位的timeMid 。 
 timeHiAndVersion - 短整数存放UUID 的16 位的timeHiAndVersion。  
 clockSeqAndNode - 字节数组存放UUID 的clockSeqAndNode 的8 字节的数据 。 
 clockSeqAndNodeOffset - 字节数组的起始位置。  
抛出:  
 NullPointerException - 如果字节数组 clockSeqAndNode 为 null 时。  
 ArrayIndexOutOfBoundsException - 如果clockSeqAndNodeOffset 值为负数或
clockSeqAndNodeOffset+8 大于数组的长度。 
5.2.2.9.4. 方法 
getBytes 
public final byte getBytes(byte[] dest, short offset) 
                    throws NullPointerException, 
                    ArrayIndexOutOfBoundsException, 
                    SecurityException 
得到 UUID 封装UUID 字节数。 
参数:  
 dest - 复制UUID 数据的字节数组引用。  
 offset - 复制的开始位置。  
返回:  
 UUID 的数据的字节长度 。 
抛出:  
 SecurityException - 如果 dest 数组不可访问。  
 NullPointerException - 如果dest 参数为 null。  
 ArrayIndexOutOfBoundsException - 如果 offset 参数为负数或 offset + UUID
的数据的字节长度大于 数组 dest 的长度。 
equals 
public final boolean equals(Object anObject) 
比较在 this 与 UUID 实例的字节数据是否相同。结果是 true 当且仅当参数不为 null 
并且 UUID 对象封装了与
this
对象相同的数据。这个方法不抛出 
NullPointerException。 
中国银联 
版权所有

---
**[p24]**

23 
 
参数:  
 anObject - 要比较的对象。  
返回:  
 true 如果UUID 的字节数据值相同,否则为 false。 
equals 
public final boolean equals(byte[] bArray, short offset) 
           throws ArrayIndexOutOfBoundsException  
检查该对象实例封装的UUID 与数组 bArray 中存放的UUID 是否相同。 
参数:  
 bArray - 包含UUID 字节的数组引用。  
 offset - 数组bArray 的开始位置。  
返回:  
 true 如果相等, false 不相等。  
抛出:  
 ArrayIndexOutOfBoundsException - 如果参数 offset 为负数或 offset+16 大于
数组 bArray 参数的长度。 
5.2.2.10. 
TEEException 
5.2.2.10.1. 声明 
java.lang.Object  
  | 
+--java.lang.Throwable  
   |  
+--java.lang.Exception  
| 
+--java.lang.RuntimeException  
| 
+--com.cup.tee.framework.TEERuntimeException  
| 
+--com.cup.tee.framework.TEEException  
public class TEEException extends TEERuntimeException 
5.2.2.10.2. 描述 
TEEException 类封装N3TEE 定义的错误码。 
5.2.2.10.3. 字段 
——TEE_ERROR_ACCESS_CONFLICT 
public static int TEE_ERROR_ACCESS_CONFLICT 
中国银联 
版权所有

---
**[p25]**

24 
 
当前操作导致冲突。 
——TEE_ERROR_BAD_PARAMETERS 
public static int TEE_ERROR_BAD_PARAMETERS 
输入参数无效。 
——TEE_ERROR_BAD_STATE 
public static int TEE_ERROR_BAD_STATE 
当前状态下操作无效。 
——TEE_ERROR_ITEM_NOT_FOUND 
public static int TEE_ERROR_ITEM_NOT_FOUND 
没有发现请求的数据项。 
——TEE_ERROR_NOT_SUPPORTED 
public static int TEE_ERROR_NOT_SUPPORTED 
请求的操作有效，目前实现不支持。 
——TEE_ERROR_NO_DATA 
public static int TEE_ERROR_NO_DATA 
期望的数据丢失。 
——TEE_ERROR_OUT_OF_MEMORY 
public static int TEE_ERROR_OUT_OF_MEMORY 
系统运行资源不足。 
——TEE_ERROR_COMMUNICATION 
public static int TEE_ERROR_COMMUNICATION 
与远程方通信失败。 
——TEE_ERROR_SECURITY 
public static int TEE_ERROR_SECURITY 
检查到安全问题。 
——TEE_ERROR_SHORT_BUFFER 
public static int TEE_ERROR_SHORT_BUFFER 
对于生成的输出提供的缓冲区太短。 
——TEE_ERROR_OVERFLOW 
public static int TEE_ERROR_OVERFLOW 
数据位置指示符超出最大值。 
——TEE_ERROR_STORAGE_NO_SPACE 
public static int TEE_ERROR_STORAGE_NO_SPACE 
无足够可用的存储空间完成本次操作。 
——TEE_ERROR_MAC_INVALID 
public static int TEE_ERROR_MAC_INVALID 
计算出的MAC 无效。 
5.2.2.10.4. 构造器 
TEEException 
public TEEException(int sw) 
使用指定的错误码构建一个N3TEEException 实例，为节省资源可使用TEE 运行环境拥
中国银联 
版权所有

---
**[p26]**

25 
 
有的这个类的实例。 
5.2.2.10.5. 方法 
throwIt 
public static void throwIt(int reason) 
使用指定的错误码抛出TEE 运行环境拥有的类N3TEEException 的实例。 
参数:  
 reason – N3TEE 定义的错误码。  
抛出:  
 TEEException - 总是。 
5.2.2.11. 
TEERuntimeException 
5.2.2.11.1. 声明 
java.lang.Object  
| 
+--java.lang.Throwable  
| 
+--java.lang.Exception  
| 
+--java.lang.RuntimeException  
| 
+--com.cup.tee.framework.TEERuntimeException  
直接已知子类:  CryptoException, SEException, SocketException, 
StorageException, 
TEEArithmeticalException, 
TEEException, 
TimeException, 
TUIException  
 
public class TEERuntimeException extends RuntimeException 
5.2.2.11.2. 描述 
类CardRuntimeException 定义一个字段 reason 以及两个访问方法 getReason() 与 
setReason()。reason 字段封装一个例外原因标识符， 所有未检查的例外都应扩展
TEERuntimeException。 
5.2.2.11.3. 构造器 
TEERuntimeException 
public TEERuntimeException() 
中国银联 
版权所有

---
**[p27]**

26 
 
创建一个TEERuntimeException 实例。 
TEERuntimeException 
public TEERuntimeException(int reason) 
使用指定的例外原因标识码创建一个TEERuntimeException 实例。 
参数:  
 reason - 例外原因标识符码。 
5.2.2.11.4. 方法 
getReason 
public int getReason() 
返回例外原因标识符。 
返回:  
 例外原因标识码。 
setReason 
public void setReason(int reason) 
设置例外原因标识码。 
参数:  
 reason - 例外原因标识码。 
throwIt 
public static void throwIt(int reason) throws TEERuntimeException 
使用指定例外原因码抛出一个TEE 拥有的 CardRuntimeException 类实例。  
参数:  
 reason - 例外原因标识码。  
抛出:  
 TEERuntimeException - 总是。                      
5.2.3. com.cup.tee.cryptography 
5.2.3.1. 描述 
     密码操作API包支持摘要、消息认证码、认证加密、对称加密、非对称加密、生成随机
数等密码操作，其中摘要、消息认证码、认证加密、对称加密是多步骤操作，即数据可多次
提交给API，而非对称操作总是单步骤操作。注意有些密钥算法，如AES-XTS，需要两个密钥。 
密码计算基本流程如下： 
(1) 新建指定算法要求的密钥对象； 
(2) 新建一个类Operation 的实例，设置操作的密钥对象； 
(3) 新建指定的算法实例，设置已构建的Operation 实例； 
(4) 进行算法要求密钥操作； 
可支持的密码算法如表4： 
中国银联 
版权所有

---
**[p28]**

27 
 
表4 可支持的密码算法 
摘要 
MD5 
SHA-1 
SHA-256 
SHA-224 
SHA-384 
SHA-512 
对策加密 
DES 
Triple-DES 双长度以及三长度密钥 
AE 
消息认证码 
DES-MAC 
AES-MAC 
AES-CMAC 
HMAC  
认证加密 
AES-CCM 支持附加认证数据(AAD) 
AES-GCM 支持附加认证数据(AAD) 
非对称加密 
RSA PKCS1-V1.5 
RSA OAEP 
签名算法 
DSA 
RSA PKCS1-V1.5 
RSA PSS 
密钥交换算法 
Diffie-Hellman 
5.2.3.2. AE 
5.2.3.2.1. 声明 
java.lang.Object 
   |   
+--com.cup.tee.cryptography.AE  
public abstract class AE extends Object 
5.2.3.2.2. 描述 
认证加密操作。 
5.2.3.2.3. 方法 
setOperation 
public abstract void setOperation(Operation operation) 
设置指定操作对象。 
中国银联 
版权所有

---
**[p29]**

28 
 
参数:  
 operation - 操作对象。 
init 
public abstract void init( 
  
byte[] nonce, 
        int  nonceOffset, 
        int  nonceLen, 
        int  tagLen, 
        int  aADLen, 
        int  payloadLen 
  
) 
初始化认证加密操作。 
参数:  
 nonce - 随机数或初始向量 。 
 nonceOffset - 随机数或初始向量的开始位置。  
 nonceLen - 随机数或初始向量的长度。  
 tagLen - 标签长度。  
 aADLen - AAD 的长度 。 
 payloadLen - 负载的长度。 
updateAAD 
public abstract void updateAAD( 
  
 
 
byte[]  
data, 
              int  
 
offset, 
              int  
 
len 
  
 
 
) 
收集数据。 
参数:  
 data - 包含AAD 数据的字节数组。  
 offset - AAD 数据的开始位置。  
 len - AAD 数据的长度。 
update 
public abstract int update( 
  
 
byte[]  
src, 
          int  
 
srcOffset, 
          int  
 
srcLen, 
          byte[]  
dest, 
          int  
 
destOffset 
  
 
) 
收集数据 
中国银联 
版权所有

---
**[p30]**

29 
 
参数:  
 src - 用于加密或解密的输入数据。  
 srcOffset - 输入数据的开始位置。  
 srcLen - 输入数据的长度。  
 dest - 存放输出数据。  
 destOffset - 输出数据的开始位置。  
返回:  
 输出数据的长度，如果没有输出数据，返回0。 
encryptFinal 
public abstract int[] encryptFinal( 
  
 
 
 
byte[]  
src, 
                  int  
 
srcOffset, 
                  int  
 
srcLen, 
                  byte[]  
dest, 
                  int  
 
destOffset, 
                  byte[]  
tag, 
                  int  
 
tagOffset 
  
 
 
 
) 
处理前次update 调用没有处理的数据以及本次调用提供的源数据。 
参数:  
 src - 最后一块需要加密的数据。  
 srcOffset - 输入数据的开始位置。  
 srcLen - 输入数据的长度。  
 dest - 存放输出数据的字节数组。  
 destOffset - 输出数据的开始位置。  
 tag - 存放标签。  
 tagOffset - 标签的开始位置。  
返回:  
 两个元素的整数数组，第一个元素的值为输出数据的长度，第一个元素的值为标签
的长度。 
decryptFinal 
public abstract int decryptFinal( 
  
 
 
byte[]  
src, 
               int   
srcOffset, 
               int   
srcLen, 
               byte[]  
 
dest, 
               int   
destOffset, 
               byte[]  
 
tag, 
               int   
tagOffset, 
               int   
tagLen 
  
 
 
) 
中国银联 
版权所有

---
**[p31]**

30 
 
处理前次update 调用没有处理的数据以及本次调用提供的源数据。 
参数:  
 src - 最后一块需要解密的数据。  
 srcOffset - 最后一块需要解密的数据的开始地址。  
 srcLen - 最后一块需要解密的数据的长度。  
 dest - 输出数据。  
 destOffset - 输出数据的开始位置。  
 tag - 标签。  
 tagOffset - 标签的开始位置。  
 tagLen - 标签的长度。  
返回:  
 输出数据的长度。 
getInstance 
public static final AE getInstance() 
                 throws CryptoException 
创建一个AE 实例。 
返回:  
 AE 实例 。 
抛出:  
 CryptoException。 
5.2.3.3. Cipher 
5.2.3.3.1. 声明 
java.lang.Object 
   |  
+--com.cup.tee.cryptography.Cipher  
 
public abstract class Cipher extends Object 
5.2.3.3.2. 描述 
对称加解密操作。 
5.2.3.3.3. 方法 
setOperation 
public abstract void setOperation(Operation operation) 
设置操作对象。 
中国银联 
版权所有

---
**[p32]**

31 
 
参数:  
 operation - 操作对象。 
init 
public abstract void init( 
  
byte[] iv, 
        int  ivOffset, 
        int  ivLen 
  
) 
初始化对称加解密操作。 
参数:  
 iv - 提供初始向量的字节数组。  
 ivOffset - 初始向量的开始位置。  
 ivLen - 初始向量的大小。 
update 
public abstract int update( 
  
 
byte[]  
src, 
          int  
 
srcOffset, 
          int  
 
srcLen, 
          byte[]  
dest, 
          int  
 
destOffset 
  
 
) 
进行加密或解密操作。 
参数:  
 src - 提供源数据块的字节数组。  
 srcOffset - 源数据块的开始地址 。 
 srcLen - 源数据块的长度 。 
 dest - 存放目的数据块的字节数组。  
 destOffset - 目的数据块的开始地址。  
返回:  
 目的数据的长度。 
doFinal 
public abstract int doFinal( 
  
 
byte[]  
src, 
           int  
 
srcOffset, 
          int  
 
srcLen, 
           byte[]  
dest, 
           int  
 
destOffset 
  
 
) 
参数:  
中国银联 
版权所有

---
**[p33]**

32 
 
 src - 提供源数据块的字节数组 。 
 srcOffset - 源数据块的开始地址。  
 srcLen - 源数据块的长度。  
 dest - 存放目的数据块的字节数组。  
 destOffset - 目的数据块的开始地址。  
返回:  
 目的数据长度。 
encrypt 
public abstract int encrypt( 
  
 
Attribute[]  
params, 
           byte[]  
 
src, 
           int  
 
 
srcOffset, 
           int  
 
 
srcLen, 
           byte[]  
 
dest, 
           int  
 
 
destOffset 
  
 
) 
数据加密操作。 
参数:  
 params - 操作参数。  
 src - 提供源数据的字节数组。  
 srcOffset - 源数据的开始位置。  
 srcLen - 源数据的长度。  
 dest - 存放目的数据字节数组。  
 destOffset - 存放目的数据开始位置。  
返回:  
 目的数据长度 
decrypt 
public abstract int decrypt( 
  
 
Attribute[]  
params, 
           byte[]  
 
src, 
           int  
 
 
srcOffset, 
           int  
 
 
srcLen, 
           byte[]  
 
dest, 
           int  
 
 
destOffset 
  
 
) 
数据解密操作。 
参数:  
 params - 操作参数。  
 src - 提供源数据的字节数组。  
 srcOffset - 源数据的开始位置。  
 srcLen - 源数据的长度。  
中国银联 
版权所有

---
**[p34]**

33 
 
 dest - 存放目的数据字节数组。  
 destOffset - 存放目的数据开始位置。  
返回:  
 目的数据长度。 
getInstance 
public static final Cipher getInstance()  throws CryptoException 
创建一个Cipher 实例。 
返回:  
 Cipher 实例。  
抛出:  
 CryptoException。 
5.2.3.4. KeyDerivation 
5.2.3.4.1. 声明 
java.lang.Object  
   | 
+--com.cup.tee.cryptography.KeyDerivation  
 
public abstract class KeyDerivation extends Object 
5.2.3.4.2. 描述 
类KeyDerivation 中定义了密钥分散操作相关方法。 
5.2.3.4.3. 方法 
setOperation 
public abstract void setOperation(Operation operation) 
设定密钥分散操作所对应的的操作对象。 
参数:  
 operation – 密钥分散操作所对应的的操作对象实例 
DeriveKey 
public abstract void DeriveKey(Attribute[] params,  TEEObject deriveKey) 
完成密钥分散操作，该方法仅支持TEE_ALG_DH_DERIVE_SHARED_SECRET 算法。 
参数:  
 params – 操作参数。 
 deriveKey –分散出的密钥要写入的未初始化的临时对象实例。  
中国银联 
版权所有

---
**[p35]**

34 
 
getInstance 
public static final KeyDerivation getInstance()  throws CryptoException 
创建一个KeyDerivation 实例。 
返回:  
 KeyDerivation 实例。  
抛出:  
 CryptoException。 
5.2.3.5. MessageDigest 
5.2.3.5.1. 声明 
java.lang.Object 
    |  
+--com.cup.tee.cryptography.MessageDigest  
public abstract class MessageDigest extends Object 
5.2.3.5.2. 描述 
类MessageDigest 用于计算消息的摘要 
5.2.3.5.3. 方法 
setOperation 
public abstract void setOperation(Operation operation) 
设置操作对象。 
参数:  
 operation - 操作对象。 
update 
public abstract void update( 
  
 
byte[]  
chunk, 
           int  
 
chunkOffset, 
           int  
 
chunkSize 
  
 
) 
收集消息数据，可多次调用此方法，消息不必是块对齐。 
参数:  
 chunk - 提供消息的字节数组。  
 chunkOffset - 消息的开始地址。  
 chunkSize - 消息的大小。 
中国银联 
版权所有

---
**[p36]**

35 
 
doFinal 
public abstract int doFinal( 
  
 
byte[]  
chunk, 
           int  
 
chunkOffset, 
           int  
 
chunkSize, 
           byte[]  
hash, 
           int  
 
hashOffset 
  
 
) 
开始计算消息的摘要，计算结束后操作对象被复位。 
参数:  
 chunk - 提供消息块的字节数组。  
 chunkOffset - 消息的开始地址。  
 chunkSize - 消息的大小。  
 hash - 存放摘要计算的结果 。 
 hashOffset - 摘要计算的结果的开始位置。  
返回:  
 摘要的长度。 
getInstance 
public static final MessageDigest getInstance()  throws CryptoException 
创建一个MessageDigest 实例。 
返回:  
 MessageDigest 实例 。 
抛出:  
 CryptoException。 
5.2.3.6. Operation 
5.2.3.6.1. 声明 
java.lang.Object 
    |  
+--com.cup.tee.cryptography.Operation  
public abstract class Operation extends Object 
5.2.3.6.2. 描述 
密钥操作对象。 
算法允许的模式如表5： 
表5 算法允许的模式 
中国银联 
版权所有

---
**[p37]**

36 
 
算法 
模式 
TEE_ALG_AES_ECB_NOPAD 
TEE_MODE_ENCRYPT 
TEE_MODE_DECRYPT 
TEE_MODE_ENCRYPT 
TEE_MODE_DECRYPT 
TEE_ALG_AES_CBC_NOPAD 
TEE_ALG_AES_CTR 
TEE_ALG_AES_CTS 
TEE_ALG_AES_XTS 
TEE_ALG_AES_CCM 
TEE_ALG_AES_GCM 
TEE_ALG_DES_ECB_NOPAD 
TEE_ALG_DES_CBC_NOPAD 
TEE_ALG_AES_CBC_MAC_NOPAD 
TEE_MODE_MAC 
TEE_ALG_AES_CBC_MAC_PKCS5 
TEE_ALG_AES_CMAC 
TEE_ALG_DES_CBC_MAC_PKCS5 
TEE_ALG_DES3_CBC_MAC_NOPAD 
TEE_ALG_DES3_CBC_MAC_PKCS5 
TEE_ALG_RSASSA_PKCS1_V1_5_MD5 
TEE_MODE_SIGN 
TEE_MODE_VERIFY 
TEE_ALG_RSASSA_PKCS1_V1_5_SHA1 
TEE_ALG_RSASSA_PKCS1_V1_5_SHA224 
TEE_ALG_RSASSA_PKCS1_V1_5_SHA256 
TEE_ALG_RSASSA_PKCS1_V1_5_SHA384 
TEE_ALG_RSASSA_PKCS1_V1_5_SHA512 
TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA1 
TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA224 
TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA256 
TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA384 
TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA512 
TEE_ALG_DSA_SHA1 
TEE_ALG_RSAES_PKCS1_V1_5 
TEE_MODE_ENCRYPT 
TEE_MODE_DECRYPT 
TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA1 
TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA224 
TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA256 
TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA384 
TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA512 
TEE_ALG_RSA_NOPAD 
TEE_ALG_DH_DERIVE_SHARED_SECRET 
TEE_MODE_DERIVE 
TEE_ALG_MD5 
TEE_MODE_DIGEST 
TEE_ALG_SHA1 
TEE_ALG_SHA224 
TEE_ALG_SHA256 
中国银联 
版权所有

---
**[p38]**

37 
 
TEE_ALG_SHA384 
TEE_ALG_SHA512 
TEE_ALG_HMAC_MD5 
TEE_MODE_MAC 
TEE_ALG_HMAC_SHA1 
TEE_ALG_HMAC_SHA224 
TEE_ALG_HMAC_SHA256 
TEE_ALG_HMAC_SHA384 
TEE_ALG_HMAC_SHA512 
5.2.3.6.3. 字段 
下属字段是可支持的密码算法类型： 
——TEE_ALG_AES_CBC_MAC_NOPAD 
public static final int TEE_ALG_AES_CBC_MAC_NOPAD 
——TEE_ALG_AES_CBC_MAC_PKCS5 
public static final int TEE_ALG_AES_CBC_MAC_PKCS5 
——TEE_ALG_AES_CBC_NOPAD 
public static final int TEE_ALG_AES_CBC_NOPAD 
——TEE_ALG_AES_CCM 
public static final int TEE_ALG_AES_CCM 
——TEE_ALG_AES_CMAC 
public static final int TEE_ALG_AES_CMAC 
——TEE_ALG_AES_CTR 
public static final int TEE_ALG_AES_CTR 
——TEE_ALG_AES_CTS 
public static final int TEE_ALG_AES_CTS 
——TEE_ALG_AES_ECB_NOPAD 
public static final int TEE_ALG_AES_ECB_NOPAD 
——TEE_ALG_AES_GCM 
public static final int TEE_ALG_AES_GCM 
——TEE_ALG_AES_XTS 
public static final int TEE_ALG_AES_XTS 
——TEE_ALG_DES3_CBC_MAC_NOPAD 
public static final int TEE_ALG_DES3_CBC_MAC_NOPAD 
——TEE_ALG_DES3_CBC_MAC_PKCS5 
public static final int TEE_ALG_DES3_CBC_MAC_PKCS5 
——TEE_ALG_DES3_CBC_NOPAD 
public static final int TEE_ALG_DES3_CBC_NOPAD 
——TEE_ALG_DES3_ECB_NOPAD 
public static final int TEE_ALG_DES3_ECB_NOPAD 
——TEE_ALG_DES_CBC_MAC_NOPAD 
public static final int TEE_ALG_DES_CBC_MAC_NOPAD 
——TEE_ALG_DES_CBC_MAC_PKCS5 
中国银联 
版权所有

---
**[p39]**

38 
 
public static final int TEE_ALG_DES_CBC_MAC_PKCS5 
——TEE_ALG_DES_CBC_NOPAD 
public static final int TEE_ALG_DES_CBC_NOPAD 
——TEE_ALG_DES_ECB_NOPAD 
public static final int TEE_ALG_DES_ECB_NOPAD 
——TEE_ALG_DH_DERIVE_SHARED_SECRET 
public static final int TEE_ALG_DH_DERIVE_SHARED_SECRET 
——TEE_ALG_DSA_SHA1 
public static final int TEE_ALG_DSA_SHA1 
——TEE_ALG_HMAC_MD5 
public static final int TEE_ALG_HMAC_MD5 
——TEE_ALG_HMAC_SHA1 
public static final int TEE_ALG_HMAC_SHA1 
——TEE_ALG_HMAC_SHA224 
public static final int TEE_ALG_HMAC_SHA224 
——TEE_ALG_HMAC_SHA256 
public static final int TEE_ALG_HMAC_SHA256 
——TEE_ALG_HMAC_SHA384 
public static final int TEE_ALG_HMAC_SHA384 
——TEE_ALG_HMAC_SHA512 
public static final int TEE_ALG_HMAC_SHA512 
——TEE_ALG_MD5 
public static final int TEE_ALG_MD5 
——TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA1 
public static final int TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA1 
——TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA224 
public static final int TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA224 
——TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA256 
public static final int TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA256 
——TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA384 
public static final int TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA384 
——TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA512 
public static final int TEE_ALG_RSAES_PKCS1_OAEP_MGF1_SHA512 
——TEE_ALG_RSAES_PKCS1_V1_5 
public static final int TEE_ALG_RSAES_PKCS1_V1_5 
——TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA1 
public static final int TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA1 
——TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA224 
public static final int TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA224 
——TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA256 
public static final int TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA256 
——TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA384 
public static final int TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA384 
中国银联 
版权所有

---
**[p40]**

39 
 
——TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA512 
public static final int TEE_ALG_RSASSA_PKCS1_PSS_MGF1_SHA512 
——TEE_ALG_RSASSA_PKCS1_V1_5_MD5 
public static final int TEE_ALG_RSASSA_PKCS1_V1_5_MD5 
——TEE_ALG_RSASSA_PKCS1_V1_5_SHA1 
public static final int TEE_ALG_RSASSA_PKCS1_V1_5_SHA1 
——TEE_ALG_RSASSA_PKCS1_V1_5_SHA224 
public static final int TEE_ALG_RSASSA_PKCS1_V1_5_SHA224 
——TEE_ALG_RSASSA_PKCS1_V1_5_SHA256 
public static final int TEE_ALG_RSASSA_PKCS1_V1_5_SHA256 
——TEE_ALG_RSASSA_PKCS1_V1_5_SHA384 
public static final int TEE_ALG_RSASSA_PKCS1_V1_5_SHA384 
——TEE_ALG_RSASSA_PKCS1_V1_5_SHA512 
public static final int TEE_ALG_RSASSA_PKCS1_V1_5_SHA512 
——TEE_ALG_RSA_NOPAD 
public static final int TEE_ALG_RSA_NOPAD 
——TEE_ALG_SHA1 
public static final int TEE_ALG_SHA1 
——TEE_ALG_SHA224 
public static final int TEE_ALG_SHA224 
——TEE_ALG_SHA256 
public static final int TEE_ALG_SHA256 
——TEE_ALG_SHA384 
public static final int TEE_ALG_SHA384 
——TEE_ALG_SHA512 
public static final int TEE_ALG_SHA512 
下属字段是支持的密码计算的模式： 
——TEE_MODE_ENCRYPT 
public static final int TEE_MODE_ENCRYPT 
加密模式。 
——TEE_MODE_DECRYPT 
public static final int TEE_MODE_DECRYPT 
解密模式。 
——TEE_MODE_SIGN 
public static final int TEE_MODE_SIGN 
签名生成模式。 
——TEE_MODE_VERIFY 
public static final int TEE_MODE_VERIFY 
签名验证模式。 
——TEE_MODE_MAC 
public static final int TEE_MODE_MAC 
——TEE_MODE_DIGEST 
public static final int TEE_MODE_DIGEST 
中国银联 
版权所有

---
**[p41]**

40 
 
摘要模式。 
——TEE_MODE_DERIVE 
public static final int TEE_MODE_DERIVE 
密钥分散模式。 
getInfo 方法可查询信息的类型： 
——TEE_INFO_ALGORITHM 
public static final int TEE_INFO_ALGORITHM 
查询的密码算法。 
——TEE_INFO_OPERATION_CLASS 
public static final int TEE_INFO_OPERATION_CLASS 
查询算法的分类。 
——TEE_INFO_MODE 
public static final int TEE_INFO_MODE 
查询操作的模式。 
——TEE_INFO_DIGEST_LENGTH 
public static final int TEE_INFO_DIGEST_LENGTH 
查询摘要的长度。 
——TEE_INFO_MAX_KEY_SIZE 
public static final int TEE_INFO_MAX_KEY_SIZE 
查询该Operation 实例可支持的密钥的最大长度。 
——TEE_INFO_KEY_SIZE 
public static final int TEE_INFO_KEY_SIZE 
查询已设置密钥的实际大小。 
——TEE_INFO_REQUIRED_KEY_USAGE 
public static final int TEE_INFO_REQUIRED_KEY_USAGE 
查询要求的密钥使用方式。 
5.2.3.6.4. 方法 
reset 
public abstract void reset() 
对于多步骤操作，该方法在密钥设置后，初始化之前复位操作的状态。 
getInfo 
public abstract int getInfo(byte infoType) 
获得信息。 
参数:  
 infoType – 要查询信息的类型，必须为下述之一：  
(1) TEE_INFO_ALGORITHM 
(2) TEE_INFO_OPERATION_CLASS 
(3) TEE_INFO_MODE 
(4) TEE_INFO_DIGEST_LENGTH 
中国银联 
版权所有

---
**[p42]**

41 
 
(5) TEE_INFO_MAX_KEY_SIZE 
(6) TEE_INFO_KEY_SIZE 
(7) TEE_INFO_REQUIRED_KEY_USAGE 
返回:  
 信息的值。 
setKey 
public abstract void setKey(TEEObject key) 
设置密钥，密钥设置后，密钥对象就和Operation 对象没有任何关联；密钥对象的类型
和大小须和Operation 的类型以及大小兼容。 
参数:  
 
key - 密钥对象引用，key 可为临时对象或持久化对象。 
setKey2 
public abstract void setKey2( 
  
 
TEEObject key1, 
            
TEEObject key2 
  
 
) 
数组两个密钥。 
参数:  
 key1 - 密钥对象1 引用。  
 key2 - 密钥对象2 引用。 
getInstance 
public static final Operation getInstance( 
  
 
 
 
int algorithm, 
                  int mode, 
                  int maxKeySize 
  
 
 
 
)  throws CryptoException 
创建一个Operation 实例。 
参数:  
 algorithm – 指定密码算法，必须为某个名称以TEE_ALG_开头的字段。 
 mode - 密码计算的模式，必须为某个名称以TEE_MODE_开头的字段，且必须是指
定的算法支持的模式。  
 maxKeySize – 可允许的最大的密钥长度。  
返回:  
 Operation 实例。  
抛出:  
 CryptoException。 
5.2.3.7. RandomData 
中国银联 
版权所有

---
**[p43]**

42 
 
5.2.3.7.1. 声明 
java.lang.Object 
   |  
+--com.cup.tee.cryptography.RandomData  
public abstract class RandomData  extends Object 
5.2.3.7.2. 描述 
类Random 提供生成随机数的功能。 
5.2.3.7.3. 方法 
generate 
public abstract void generate(byte[] random, int offset, int len) 
生成指定长度的随机数。 
参数:  
 random - 存放随机数的字节数组。  
 offset - 存放随机数的开始位置 。 
 len - 随机数的长度。 
getInstance 
public static final RandomData getInstance() throws CryptoException 
创建一个RandomData 实例。 
返回:  
 RandomData 实例。  
抛出:  
 CryptoException。 
5.2.3.8. Signature 
5.2.3.8.1. 声明 
java.lang.Object  
   | 
+--com.cup.tee.cryptography.Signature  
public abstract class Signature  extends Object 
5.2.3.8.2. 描述 
中国银联 
版权所有

---
**[p44]**

43 
 
使用对称密码计算消息的消息认证码（MAC）， 使用非对称密钥对消息的摘要数据进行
签名以及签名认证操作。 
5.2.3.8.3. 方法 
setOperation 
public abstract void setOperation(Operation operation) 
设置指定操作对象。 
参数:  
 operation - 操作对象。 
init 
public abstract void init( 
  
byte[]  
iv, 
        int   
ivOffset, 
        int   
ivLen 
  
) 
初始化MAC 计算。 
参数:  
 iv - 提供初始向量的字节数组。  
 ivOffset - 初始向量的开始位置。  
 ivLen - 初始向量的大小。 
update 
public abstract void update( 
  
 
byte[] chunk, 
           int  
offset, 
           int  
chunkSize 
  
 
) 
收集MAC 计算的消息数据块。 
参数:  
 chunk - 提供消息数据块的字节数组。  
 offset - 消息数据块的开始位置。  
 chunkSize - 消息数据块的大小。 
doFinal 
public abstract int doFinal( 
  
 
byte[] message, 
           int  
msgOffset, 
           int  
msgLen, 
           byte[] mac, 
中国银联 
版权所有

---
**[p45]**

44 
 
           int  
macOffset 
  
 
) 
对输入的全部消息数据计算MAC。 
参数:  
 message - 提供消息数据块的字节数组 。 
 msgOffset - 消息数据块的开始位置。  
 msgLen - 消息数据块的大小。  
 mac - 存放MAC 的字节数组。  
 macOffset - 存放MAC 的开始地址。  
返回:  
 
MAC 的长度。 
compareFinal 
public abstract int compareFinal( 
  
 
 
 
byte[]  
message, 
        int   
msgOffset, 
        int   
msgLen, 
        byte[]  
mac, 
        int   
macOffset, 
        int   
macLen 
 
 
) 
对输入的消息数据块计算MAC，并与提供的MAC 比较。 
参数:  
 message - 提供消息数据块的字节数组 。 
 msgOffset - 消息数据块的开始位置。  
 msgLen - 消息数据块的大小 。 
 mac - 提供MAC 的字节数组。  
 macOffset - 提供MAC 的开始地址。  
 macLen - MAC 的长度 。 
返回:  
 true: 计算的MAC 与提供MAC 相同。 
signDigest 
public abstract int signDigest( 
  
 
 
Attribute[] params, 
    byte[]  
digest, 
    int   
digestOffset, 
    int   
digestLen, 
    byte[]  
signature, 
int   
sigOffset 
) 
使用非对称密钥对的私钥对消息的摘要数据进行签名操作。 
参数:  
中国银联 
版权所有

---
**[p46]**

45 
 
 params - 操作参数。  
 digest - 提供摘要数据的字节数组。  
 digestOffset - 摘要数据的开始位置。  
 digestLen - 摘要数据的长度。  
 signature - 保存签名数据的字节数组。  
 sigOffset - 签名数据的开始位置。  
返回:  
 签名数据的长度 
verifyDigest 
public abstract int verifyDigest( 
  
 
 
Attribute[] params, 
      byte[]  digest, 
      int   
digestOffset, 
      int   
digestLen, 
      byte[]  signature, 
      int   
sigOffset 
  
) 
使用非对称密钥对的公钥对摘要数据、摘要数据的签名进行签名验证操作。 
参数:  
 params - 操作参数。  
 digest - 提供摘要数据的字节数组。  
 digestOffset - 摘要数据的开始位置。  
 digestLen - 摘要数据的长度。  
 signature - 提供签名数据的字节数组。  
 sigOffset - 签名数据的开始位置。  
返回:  
 true： 签名验证成功， false：签名验证失败。 
getInstance 
public static final Signature getInstance() throws CryptoException 
创建一个 Signature 实例。 
返回:  
 Signature 实例 。 
抛出:  
 CryptoException。 
5.2.4. com.cup.tee.trustedstorage 
5.2.4.1. 描述 
可信存储API，支持可信应用的数据、密码的可信地存储可信存储空间 可以建立对象
标识符标识的持久化对象。 
可信存储空间包含持久化对象，每个持久化对象由一个对象标识符标识，对象标识符
中国银联 
版权所有

---
**[p47]**

46 
 
的长度可变，但不能超过64 字节，对象标识符可包含任何字节，包括不可打印字符。 
持久化对象可为密钥对象、密钥对对象或数据对象，每个持久化对象具有准确定义对象
内容的类型，例如AES 密钥类型、RSA 密钥对类型以及数据对象类型等。 
所有的持久化对象具有关联的数据流，数据对象只有数据流，密码对象具有数据流、对
象属性以及元数据。 
可信应用也可分配临时对象，相比持久化对象，具有如下特点： 
(1) 临时对象保存在内存中，当对象关闭或可信应用实例销毁时自动清除。 
(2) 临时对象只包含属性，没有数据流。 
(3) 临时对象没有标识符，目前只用于密钥对象。 
5.2.4.2. Attribute 
5.2.4.2.1. 声明 
java.lang.Object 
  |   
+--com.cup.tee.trustedstorage.Attribute  
public class Attribute  extends Object 
5.2.4.2.2. 描述 
封装对象属性，属性有两种类型，值属性以及缓冲区属性。 
5.2.4.2.3. 字段 
——TEE_ATTR_SECRET_VALUE 
public static final int TEE_ATTR_SECRET_VALUE 
——TEE_ATTR_RSA_MODULUS 
public static final int TEE_ATTR_RSA_MODULUS 
——TEE_ATTR_RSA_PUBLIC_EXPONENT 
public static final int TEE_ATTR_RSA_PUBLIC_EXPONENT 
——TEE_ATTR_RSA_PRIVATE_EXPONENT 
public static final int TEE_ATTR_RSA_PRIVATE_EXPONENT 
——TEE_ATTR_RSA_PRIME1 
public static final int TEE_ATTR_RSA_PRIME1 
——TEE_ATTR_RSA_PRIME2 
public static final int TEE_ATTR_RSA_PRIME2 
——TEE_ATTR_RSA_EXPONENT1 
public static final int TEE_ATTR_RSA_EXPONENT1 
——TEE_ATTR_RSA_EXPONENT2 
public static final int TEE_ATTR_RSA_EXPONENT2 
——TEE_ATTR_RSA_COEFFICIENT 
中国银联 
版权所有

---
**[p48]**

47 
 
public static final int TEE_ATTR_RSA_COEFFICIENT 
——TEE_ATTR_DSA_PRIME 
public static final int TEE_ATTR_DSA_PRIME 
——TEE_ATTR_DSA_SUBPRIME 
public static final int TEE_ATTR_DSA_SUBPRIME 
——TEE_ATTR_DSA_BASE 
public static final int TEE_ATTR_DSA_BASE 
——TEE_ATTR_DSA_PUBLIC_VALUE 
public static final int TEE_ATTR_DSA_PUBLIC_VALUE 
——TEE_ATTR_DSA_PRIVATE_VALUE 
public static final int TEE_ATTR_DSA_PRIVATE_VALUE 
——TEE_ATTR_DH_PRIME 
public static final int TEE_ATTR_DH_PRIME 
——TEE_ATTR_DH_SUBPRIME 
public static final int TEE_ATTR_DH_SUBPRIME 
——TEE_ATTR_DH_BASE 
public static final int TEE_ATTR_DH_BASE 
——TEE_ATTR_DH_X_BITS 
public static final int TEE_ATTR_DH_X_BITS 
——TEE_ATTR_DH_PUBLIC_VALUE 
public static final int TEE_ATTR_DH_PUBLIC_VALUE 
——TEE_ATTR_DH_PRIVATE_VALUE 
public static final int TEE_ATTR_DH_PRIVATE_VALUE 
——TEE_ATTR_RSA_OAEP_LABEL 
public static final int TEE_ATTR_RSA_OAEP_LABEL 
——TEE_ATTR_RSA_PSS_SALT_LENGTH 
public static final int TEE_ATTR_RSA_PSS_SALT_LENGTH 
5.2.4.2.4. 构造器 
Attribute 
public Attribute(int attributeID, 
         int a, 
         int b) 
构建一个值对象属性。 
参数:  
 attributeID - 属性标识 。 
 a - 属性的a 值。  
 b - 属性的b 值。 
Attribute 
public Attribute ( int attributeID, 
           
byte[] buffer, 
           
int offset, 
中国银联 
版权所有

---
**[p49]**

48 
 
           
int size 
) 
构建一个缓冲区属性。 
参数:  
 attributeID - 属性标识。  
 buffer - 存放属性缓冲区值的字节数组。  
 offset - 数组的偏移。  
 size - 缓冲区属性值的大小。 
5.2.4.3. PersistentObject 
5.2.4.3.1. 声明 
java.lang.Object  
| 
+--com.cup.tee.trustedstorage.TEEObject  
  | 
+--com.cup.tee.trustedstorage.PersistentObject  
public class PersistentObject  extends TEEObject 
5.2.4.3.2. 描述 
该类封装了创建、访问以及删除持久化存储对象的操作。可信应用需要调用该类的
create 方法创建一个新的持久化存储对象，或调用open 方法打开一个已存在的持久化对象
后，才能调用readData 或writeData 方法读写持久化存储对象的数据流。具体使用方法参
见下述示例。 
使用实例 
持久化数据的保存 
…… 
storageID = = PersistentObject .TEE _STORAGE_PRIVATE; 
int objLen; 
byte[] objectID; 
PersistentObject  po; 
int flags; 
TransientObject attributes;  
byte[] initialData ; 
…… 
// 创建objectID 数组并赋值 
…… 
po = new PersistentObject(storageID, objectID , 0, objLen); 
中国银联 
版权所有

---
**[p50]**

49 
 
 
 
//创建属性、初始化数据数组并赋值 
……. 
 
//创建TEE 可信持久化对象 
po.create(flags, attributes, initialData , offset, len); 
…… 
//准备写入数据对象的数据 
…… 
//将数据写入TEE 持久化数据对象 
po.writeData(buffer, offset, size); 
…. 
//关闭TEE 持久化数据对象 
po.close(); 
….. 
持久化数据的使用 
…… 
Int storageID = PersistentObject .TEE_STORAGE_PRIVATE; 
int objLen; 
byte[] objectID; 
PersistentObject  po; 
int flags; 
TransientObject attributes;  
byte[] initialData ; 
…… 
// 创建objectID 数组并赋值 
…… 
po = new PersistentObject(storageID, objectID , 0, objLen); 
…… 
//打开TEE 可信持久化对象 
po. open(flags); 
…… 
//从 TEE 持久化数据对象读数据 
dataLenReadFromDO = po.readData(buffer, offset, size); 
…. 
//关闭TEE 持久化数据对象 
po.close(); 
…… 
5.2.4.3.3. 字段 
中国银联 
版权所有

---
**[p51]**

50 
 
——TEE_DATA_SEEK_SET 
public static final byte TEE_DATA_SEEK_SET 
——TEE_DATA_SEEK_CUR 
public static final byte TEE_DATA_SEEK_CUR 
——TEE_DATA_SEEK_END 
public static final byte TEE_DATA_SEEK_END 
——TEE_DATA_FLAG_ACCESS_READ 
public static final int TEE_DATA_FLAG_ACCESS_READ 
——TEE_DATA_FLAG_ACCESS_WRITE 
public static final int TEE_DATA_FLAG_ACCESS_WRITE 
——TEE_DATA_FLAG_ACCESS_WRITE_META 
public static final int TEE_DATA_FLAG_ACCESS_WRITE_META 
——TEE_DATA_FLAG_SHARE_READ 
public static final int TEE_DATA_FLAG_SHARE_READ 
——TEE_DATA_FLAG_SHARE_WRITE 
public static final int TEE_DATA_FLAG_SHARE_WRITE 
——TEE_DATA_FLAG_CREATE 
public static final int TEE_DATA_FLAG_CREATE 
——TEE_DATA_FLAG_EXCLUSIVE 
public static final int TEE_DATA_FLAG_EXCLUSIVE 
——TEE_STORAGE_PRIVATE 
public static final int TEE_STORAGE_PRIVATE 
5.2.4.3.4. 构造器 
PersistentObject 
public PersistentObject(int storageID, 
                byte[] objectID, 
                int objectIDffset, 
                int objectIDLen) 
构建一个类PersistentObject 的实例。 
参数:  
 storageID – 指示访问那个存储空间，可能值是TEE_STORAGE_PRIVATE,指当前可
信应用私有的存储空间，该可信应用的所有实例都可以访问该存储空间。 
 objectID - 存放对象标识的字节数组。  
 objectIDffset - 数组的起始地址。  
 objectIDLen - 对象ID 的长度。 
5.2.4.3.5. 方法 
create 
public void create(int flags, 
中国银联 
版权所有

---
**[p52]**

51 
 
                     TransientObject attributes, 
                     byte[] initialData, 
                     int offset, 
                     int length 
) 
创建一个持久化存储对象。 
参数:  
 flags - 控制访问权限、共享许可以及创建机制的标志 ，只能 是
TEE_DATA_FLAG_XXX 常量。  
 attributes - 提供对象的属性的临时对象 。 
 initialData - 提供持久化对象初始内容的字节数组。  
 offset - 在数组中存放数据的起始位置。  
 length - 数据的长度。 
rename 
public void rename ( byte[] objectID, 
            
 
int objectIDffset, 
            
 
int objectIDLen 
) 
更换对象的标识。 
参数:  
 objectID - 提供对象标识的字节数组。  
 objectIDffset - 在数组中存放标识的开始位置。  
 objectIDLen - 对象标识的长度。 
open 
public void open(int flags) 
打开一个持久化对象 
参数:  
 flags - 控制访问权限、共享许可以及创建机制的标志，只能 是
TEE_DATA_FLAG_XXX 常量。 
closeAndDeleteObject 
public void closeAndDeleteObject() 
关闭并删除持一个久化对象。 
getID 
public int getID(byte[] objectID, 
        int objOffset) 
得到对象的标识。 
参数:  
 objectID - 存放对象标识的字节数组 。 
中国银联 
版权所有

---
**[p53]**

52 
 
 objOffset - 数组的开始位置。  
返回:  
 对象ID 的长度。 
readData 
public int readData(byte[] buffer,  int offset, int size) 
从持久化存储对象中读取数据并向后移动当前读取数据的位置。 
参数:  
 buffer - 存放数据的字节数组。  
 offset - 存放数据的开始地址。  
 size - 要读取数据的长度。  
返回:  
 实际读取的长度。 
writeData 
public int writeData(byte[] buffer, 
            int offset, 
            int size) 
向持久化存储对象写入数据，同时移动当前写入数据的位置。 
参数:  
 buffer - 存放数据的字节数组 。 
 offset - 数据在数组中的开始位置。  
 size - 数据的大小。  
返回:  
 实际写入的数据的大小。 
truncateData 
public void truncateData(int size) 
更变持久化对象的数据流大小。 
参数:  
 size - 要修改的数据流的大小。 
seekData 
public void seekData(int offset, int whence) 
设置当前读写位置。 
参数:  
 offset - 移动的偏移。  
 whence –控制offset 的含义： 
(1) TEE_DATA_SEEK_SET，数据位置被设置为从数据流开始的offset 字节； 
(2) TEE_DATA_SEEK_CUR，数据位置被设置为当前位置加offset； 
(3) TEE_DATA_SEEK_END，数据位置被设置为数据对象大小加offset。 
中国银联 
版权所有

---
**[p54]**

53 
 
5.2.4.4. PersistentObjectEnumerator 
5.2.4.4.1. 声明 
java.lang.Object 
   |  
+--com.cup.tee.trustedstorage.PersistentObjectEnumerator  
public class PersistentObjectEnumerator extends Object 
5.2.4.4.2. 描述 
该类实现一个持久化对象的枚举器。 
5.2.4.4.3. 构造器 
PersistentObjectEnumerator 
public PersistentObjectEnumerator(int storeageID) 
构造一个持久化对象枚举器。 
参数:  
 storeageID - 指定可信存储空间标识，枚举器可枚举存储在该空间内的全部持久
化对象。 
5.2.4.4.4. 方法 
setStoreageID 
public void setStoreageID(int storeageID) 
指定可信存储空间的标识。 
参数:  
 storeageID - 存储空间的标识。 
reset 
public void reset() 
对枚举器服复位。 
hasMoreElements 
public boolean hasMoreElements() 
确定是否还有对象。 
返回:  
 true 还有对象。 
中国银联 
版权所有

---
**[p55]**

54 
 
nextElement 
public PersistentObject nextElement() 
得到持久化对象。 
返回:  
 持久化的对象实例。 
5.2.4.5. TEEObject 
5.2.4.5.1. 声明 
java.lang.Object  
| 
+--com.cup.tee.trustedstorage.TEEObject  
直接已知子类: PersistentObject, TransientObject  
public abstract class TEEObject  extends Object 
5.2.4.5.2. 描述 
该类封装了临时对象，用于存放属性。 
5.2.4.5.3. 字段 
下属字段用于指定查询Object 的信息的类型： 
——TEE_OBJECT_TYPE_INDEX 
public static final byte TEE_OBJECT_TYPE_INDEX 
对象类型。 
——TEE_OBJECT_SIZE_INDEX 
public static final byte TEE_OBJECT_SIZE_INDEX 
对象大小。 
——TEE_OBJECT_MAX_SIZE_INDEX  
public static final byte TEE_OBJECT_MAX_SIZE_INDEX 
对象最大大小。 
——TEE_OBJECT_USAGE_INDEX  
public static final byte TEE_OBJECT_USAGE_INDEX 
对象适用限制。 
——TEE_OBJECT_DATA_SIZE_INDEX  
public static final byte TEE_OBJECT_DATA_SIZE_INDEX 
数据大小。 
——TEE_OBJECT_DATA_POSITION_INDEX  
public static final byte TEE_OBJECT_DATA_POSITION_INDEX 
数据当前位置。 
中国银联 
版权所有

---
**[p56]**

55 
 
——TEE_OBJECT_HANDLE_FLAG_INDEX 
public static final byte TEE_OBJECT_HANDLE_FLAG_INDEX 
处理标志。 
对象使用限制常量： 
——TEE_USAGE_EXTRACTABLE   
public static final int TEE_USAGE_EXTRACTABLE   
——TEE_USAGE_ENCRYPT   
public static final int TEE_USAGE_ENCRYPT   
——TEE_USAGE_DECRYPT   
public static final int TEE_USAGE_DECRYPT   
——TEE_USAGE_MAC   
public static final int TEE_USAGE_MAC   
——TEE_USAGE_SIGN   
public static final int TEE_USAGE_SIGN   
——TEE_USAGE_VERIFY   
public static final int TEE_USAGE_VERIFY   
——TEE_USAGE_DERIVE   
public static final int TEE_USAGE_DERIVE   
对象处理标志常量： 
——TEE_HANDLE_FLAG_PERSISTENT 
public static final int TEE_HANDLE_FLAG_PERSISTENT 
——TEE_HANDLE_FLAG_INITIALIZED 
public static final int TEE_HANDLE_FLAG_INITIALIZED 
——TEE_HANDLE_FLAG_KEY_SET 
public static final int TEE_HANDLE_FLAG_KEY_SET 
——TEE_HANDLE_FLAG_EXPECT_TWO_KEYS   
public static final int TEE_HANDLE_FLAG_EXPECT_TWO_KEYS   
5.2.4.5.4. 方法 
getAttributeValue 
public int getAttributeValue(int attributeID, boolean valueA) 
得到值属性的值。 
参数:  
 attributeID - 属性标识。  
 valueA - true 得到a 值，否则得到b 值。  
返回:  
 属性的值。 
getAttributeBuffer 
public int getAttributeBuffer(int attributeID, 
                     byte[] buffer, 
中国银联 
版权所有

---
**[p57]**

56 
 
                     int offset, 
                     int size) 
得到缓冲区属性的值。 
参数:  
 attributeID - 属性的标识。  
 buffer - 存放缓冲区的属性值的数组。  
 offset - 数组的开始位置。  
 size - 读取属性的大小。  
返回:  
 属性的长度。 
getInfo 
public int getInfo(short index) 
得到对象的信息。 
参数:  
 index - 信息的索引。  
返回:  
 信息的值。 
restrictObjectUsage 
public void restrictObjectUsage(int objectUsage) 
限制属性的使用。 
参数:  
 objectUsage - 对象的使用限制标志。 
closeObject 
public void closeObject() 
关闭临时对象。 
5.2.4.6. TransientObject 
5.2.4.6.1. 声明 
java.lang.Object  
   | 
+--com.cup.tee.trustedstorage.TEEObject  
  |  
+--com.cup.tee.trustedstorage.TransientObject  
public class TransientObject extends TEEObject 
5.2.4.6.2. 描述 
中国银联 
版权所有

---
**[p58]**

57 
 
创建临时对象，用于密钥操作。 
5.2.4.6.3. 字段 
——TEE_TYPE_AES 
public static final int TEE_TYPE_AES 
——TEE_TYPE_DES 
public static final int TEE_TYPE_DES 
——TEE_TYPE_DES3 
public static final int TEE_TYPE_DES3 
——TEE_TYPE_HMAC_MD5 
public static final int TEE_TYPE_HMAC_MD5 
——TEE_TYPE_HMAC_SHA1 
public static final int TEE_TYPE_HMAC_SHA1 
——TEE_TYPE_HMAC_SHA224 
public static final int TEE_TYPE_HMAC_SHA224 
——TEE_TYPE_HMAC_SHA256 
public static final int TEE_TYPE_HMAC_SHA256 
——TEE_TYPE_HMAC_SHA384 
public static final int TEE_TYPE_HMAC_SHA384 
——TEE_TYPE_HMAC_SHA512 
public static final int TEE_TYPE_HMAC_SHA512 
——TEE_TYPE_RSA_PUBLIC_KEY 
public static final int TEE_TYPE_RSA_PUBLIC_KEY 
——TEE_TYPE_RSA_KEYPAIR 
public static final int TEE_TYPE_RSA_KEYPAIR 
——TEE_TYPE_DSA_PUBLIC_KEY 
public static final int TEE_TYPE_DSA_PUBLIC_KEY 
——TEE_TYPE_DSA_KEYPAIR 
public static final int TEE_TYPE_DSA_KEYPAIR 
——TEE_TYPE_DH_KEYPAIR 
public static final int TEE_TYPE_DH_KEYPAIR 
——TEE_TYPE_GENERIC_SECRET 
public static final int TEE_TYPE_GENERIC_SECRET 
5.2.4.6.4. 构造器 
TransientObject 
public TransientObject() 
TransientObject 
public TransientObject(int type, int maxObjectSize) 
创建一个TransientObject 实例。 
中国银联 
版权所有

---
**[p59]**

58 
 
参数:  
 type - 对象的类型。  
 maxObjectSize - 最大对象的长度。 
5.2.4.6.5. 方法 
reset 
public void reset() 
复位TransientObject 到未初始化状态。 
populate 
public void populate(Attribute[] attributes) 
设置TransientObject 实例的内容。 
参数:  
 attributes - 属性。 
gererateKey 
public void gererateKey(int keySize, Attribute[] attributes) 
生成密钥。 
参数:  
 keySize - 密钥的大小。  
示例1：attributes - 生成密钥的参数 
5.2.5. com.cup.tee.time 
5.2.5.1. 描述 
时间API，可以访问系统时间、可信应用的持久化时间以及REE 时间 ，对系统时间、
可信应用的持久化时间的信任程度可查询相关属性。  
5.2.5.2. Time 
5.2.5.2.1. 声明 
java.lang.Object 
   |  
+--com.cup.tee.time.Time 
public class Time extends Object 
5.2.5.2.2. 描述 
类Time 提供访问时间的功能。 
中国银联 
版权所有

---
**[p60]**

59 
 
5.2.5.2.3. 构造器 
Time 
public Time() 
5.2.5.2.4. 方法 
getSystemTime 
public void getSystemTime(int[] time,int offset) 
获取当前系统时间，时间包括两个整数，第一个整数表示秒，第二个整数表示毫秒。 
参数:  
 time - 复制时间的整数数组，从offset 开始，至少需要两个成员。  
 offset - 时间在数组中的开始位置。 
wait 
public void wait(int timeout) 
等待指定的毫秒数或永久等待。 
 
参数:  
 
timeout - 等待的毫秒数， 若为TEE_TIMEOUT_INFINITE 表示永久等待。 
getTAPersistentTime 
public void getTAPersistentTime(int[] time,int offset) 
查询当前应用的持久化时间，从调用setTAPersistentTime 方法设置的任意起始时间开
始。 
参数:  
 time - 复制时间的整数数组，从offset 开始，至少需要两个成员。  
 offset - 时间在数组中的开始位置。 
setTAPersistentTime 
public void setTAPersistentTime(int[] time, int offset) 
设置当前可信应用的持久化时间。 
参数:  
 time - 复制时间的整数数组，从offset 开始，至少需要两个成员。  
 offset - 时间在数组中的开始位置。 
getREETime 
public void getREETime(int[] time, int offset) 
查询当前REE 的系统时间。 
参数:  
 time - 复制时间的整数数组，从offset 开始，至少需要两个成员。  
中国银联 
版权所有

---
**[p61]**

60 
 
 offset - 时间在数组中的开始位置。 
5.2.6. com.cup.teex.tui 
5.2.6.1. 描述 
TA 通过调用TUI API 可以与用户进行交互，显示敏感信息给用户或从用户获得敏感信
息。  
5.2.6.1.1. 可信用户界面API 目标 
允许显示屏幕内容给用户，并实现三个目的： 
(1) 安全显示 - 显示给用户的信息不能被访问，修改，或由REE 中的任何软件或TEE 未
经授权的应用程序掩盖。 
(2) 安全输入 - 由用户输入的信息不能由REE 的任何软件或者TEE 的未经授权的应用程
序导出或修改。 
(3) 安全指示 - 用户可以确信屏幕显示的内容实际上是由TA 要显示的内容。 
5.2.6.1.2. 可信用户接口原理 
5.2.6.1.2.1. 
整体架构 
带TUI的TEE整体架构如下图所示： 
 
图1 带TUI 的TEE 架构 
中国银联 
版权所有

---
**[p62]**

61 
 
 在本指南中，涉及到用户接口的外围设备必须连接到该设备,远程外设未在本指南考
虑。 
实现可信用户接口功能典型的架构，包括触摸屏或键盘外设以及显示控制器外设。当显
示一个可信用户界面屏幕，这些外设绝不能被REE 读或写访问,相关事件的指示也决不能被
REE 接收。其他时候，取决于特定平台或特定TEE 实现，是否交回这些外设的控制给REE，
或提供一些其他方法允许REE 访问这些外设。 
5.2.6.1.2.2. 
可信用户接口屏幕 
    TUI 屏幕依赖于TEE 独占访问UI 资源，它们必须始终显示在前景，他们必须始终具有
焦点。强烈建议使可信部分的屏幕接近全屏幕大小，而不是处理覆盖，以避免混乱和糟糕的
用户体验。TUI 的屏幕意味着关键和敏感的数据和需要直接和排它性的操作。 
    重要提示：下列各节描述了必须由TUI 屏幕支持的不同功能，然而，提议的数字仅供参
考。例如，如果一个实现更喜欢使用物理键盘，而不是使用虚拟键盘和虚拟按键让用户输入，
带虚拟键盘和按钮的屏幕数字，在这种情况下是不准确的。同样，输入框和按钮的文本标签
是示例，可能由TA 定制。 
    下文即主要描述了可信用户接口（UI）API 相关的典型屏幕。 
PIN 输入屏幕 
通常情况下，PIN 码输入屏幕的组成如下： 
(1) 一个标签，持有品牌信息和通常的详细说明由PIN 码输入进行验证的操作； 
(2) 一个输入字段指示输入的数字； 
(3) 允许输入数字的键盘 ； 
(4) 按键:  
i. 
改正  允许前面键入的数字被修改；  
ii. 
取消  允许取消操作并推出屏幕；  
iii. 
确认  触发PIN 输入的确认并退出屏幕；  
(5) 安全指示(文本, 图像, 发光二极管, …)。 
典型的PIN 输入屏幕如下图所示： 
中国银联 
版权所有

---
**[p63]**

62 
 
 
图2 典型的PIN 输入屏幕示例 
登录和口令输入屏幕 
通常情况下，一个登录名/密码输入屏幕的组成如下： 
(1) 一个标签，持有品牌信息和详细说明通常要求输入密码的操作； 
(2) 一个输入字段来显示所输入的字母数字字符用于登录； 
(3) 一个输入字段来显示所输入的字母数字字符的密码； 
(4) 键盘，允许字母数字字符输入； 
(5) 按键： 
i. 
改正  允许前面键入的数字被修改；  
ii. 
取消  允许取消操作并推出屏幕；  
iii. 
确认  触发PIN 输入的确认并退出屏幕；  
(1) 安全指示(文本, 图像, 发光二极管, …)。 
典型的登录/口令输入屏幕如下图所示： 
中国银联 
版权所有

---
**[p64]**

63 
 
 
图3 典型的登录/口令输入屏幕示例                        
消息屏幕 
通常情况下，一个信息屏的组成如下： 
(1) 包含要显示给用户的消息和任何关联的品牌的标签区； 
(2) 根据使用情况，最多五个按钮： 
i. OK    退出屏幕并通知TA 按键的ID ； 
ii. 取消  退出屏幕并通知TA 按键的ID ； 
iii. 确认  退出屏幕并通知TA 按键的ID ； 
iv. 下页  退出屏幕并通知TA 按键的ID，请求TA 显示另一个屏幕，它是当前屏幕延
续；  
v. 前页  退出屏幕并通知TA 按键的ID，要求TA 显示前面看到的屏幕； 
(3) 安全指示(文本, 图像, 发光二极管, …)。 
示例2：图4 是一个典型的消息屏幕例子；图5 是用于确认的消息屏幕典型例子；图6
是用于确认的带有前后页按键的典型消息屏幕示例。 
中国银联 
版权所有

---
**[p65]**

64 
 
 
图4 一个典型的消息屏幕的例子 
 
图5 用于确认的典型消息屏幕 
中国银联 
版权所有

---
**[p66]**

65 
 
 
图6 用于确认的带有前后页按键的典型消息屏幕           
5.2.6.1.2.3. 
授权的按钮组合 
     正如前面章节所述，六个按钮由TUI 的API 管理:  CORRECTION,  OK, CANCEL, 
VALIDATE, PREVIOUS 以及 NEXT。  
     CORRECTION 按钮是强制性的，必须提供至少一个输入框。在其他情况下， 表 6 描述
授权的组合:  
表6 授权的按钮组合 (CORRECTION 除外)  
OK 
CANCEL 
VALIDATE 
PREVIOUS 
NEXT 
X 
  
  
  
  
X 
  
  
X 
  
  
X 
X 
  
  
  
X 
  
  
X 
  
X 
  
X 
X 
  
X 
X 
X 
  
5.2.6.1.2.4. 
标签结构 
该标签由背景帆布构造，覆盖有两个额外的显示:  
(1) 可设置和可发现的整体标签区域画布颜色；  
(2) 可选的图像，等于或小于画布，可定位在标签内的任意位置区域。通常情况下，它
会包含一个服务提供商的标识； 
中国银联 
版权所有

---
**[p67]**

66 
 
(3) 该标签区域内的任意位置该图像的顶部可放置的可选文本； 
标签区内图像和文本区域的屏幕坐标是左上角，由0,0 偏移值增大朝向标签区域的右下
角，这些偏移值表示相关的图像或文本区的左上角。 
这三个区域的组合给出一个简单但灵活的显示区域。图7 和图8 是标签示例。 
 
图7 标签结构 
   
 
中国银联 
版权所有

---
**[p68]**

67 
 
图8 标签组合示例 
5.2.6.1.2.5. 
安全指示 
  安全指示是显示的画面可以被认为受用户信赖的特定指示，也就是说，该屏幕是由TEE
控制，与REE 甚至TA 隔离。它可以是下述之一或两者： 
(1) 硬件控制的安全指示，如LED 状态或使用TEE 一直控制的屏幕区。 
(2) 只有用户知道个人信息,如一幅图像或一个个人问题以及相应的答案；这些资料不
得被REE 知道或可被REE 访问；最好该安全指示器唯一地与一个用户而不是与设备
相关联。 
  强烈建议安全指示由TEE 本身直接管理：当显示TUI 屏幕时，TEE 默认情况下应提供安
全指示，如果不是这种情况，则属性值cup.tee.tui.securityIndicator 应设置为false，安全指
示的功能必须由TA 自身，无论是通过硬件控制外设，如果可用（且如果一个特定的TEE 实
现允许），或通过TUI 屏幕的标签信息来提供。在这最后情况下，图像和/或标签的文本必须
是可合理预期，使用户相信显示的画面是可以信任的，即它是由TEE 显示的。 
5.2.6.1.2.6. 
UI 会话 
  当TA 请求TUI 屏幕显示，它对UI 资源的访问必须独占的，这意味着它是不可能同时显
示多个TUI 屏幕。会话机制允许一个 TA 到预定独占访问TUI 资源，特别是保证的TUI 的屏
幕的特定序列是原子的；该屏幕拥有原子性通过覆盖第3.11 节描述的事件受限。 
    TUI 资源由TA 保留时，不得干预REE 的UI 行为；仅当TUI 的屏幕开始生效的第一次实
际显示，TA 才取得了UI 的输入输出的控制 。 
  虽然没有与TUI 屏幕相关的超时，有一个TUI 会话相关的超时，适用于TUI 会话中不显
示TUI 屏幕而消耗的时间，会话打开且TUI 的屏幕结束时开始； 如果超时时间已到，TUI
的会话将自动关闭，超时值由属性cup.tee.tui.session.timeout 指定。 
5.2.6.1.2.7. 
图像格式 
  本指南支持的唯一的图像格式是Portable Network Graphics (PNG) 格式，它必须预
缩放以适合标签的画布区域内。  
  虽然在实现可能支持PNG 标准的全部功能，本指南的强制性支持降低。它必须至少有以
下功能： 
(1) 两种颜色类型:  
i. 灰度 (0) 多达 8 位深度 ； 
ii. 真彩 (2) 多达24 位 ； 
(2) 隔行扫描方式0(无交错) ； 
(3) 辅助块被忽略 ； 
5.2.6.1.2.8. 
输入字段的最小个数 
  TUI 的API 允许TA 通过选择显示输入字段的数量来定制TUI 屏幕。该输入字段应该被
支持的最小数量有两个，因为支持登录/密码的使用情况是强制性的。然而一个实现可以为
每屏的给定朝向指定支持更多输入字段 ，并通过函数TEE_TUIGetScreenInfo 与TA 沟通这
类信息。 
中国银联 
版权所有

---
**[p69]**

68 
 
5.2.6.1.2.9. 
输入文本 
输入栏字母 
平台必须支持输入栏可输入的字符，至少是以下ASCII 表的字符的子集： 
 在区间 [Unicode (U+0020) – Unicode (U+007D)]中的字符；  
这个子集是足以符合大多数国家的PIN 码输入标准和登录密码输入。 
5.2.6.1.2.10. 
输出文本 
这一部分是针对可写入标签内的文本。 
缺省字母表 
默认情况下，实现必须支持Unicode 表的一个字符子集:  
(1) 回车符: Unicode (U+000D)；  
(2) 区间 [Unicode (U+0020) – Unicode (U+007D)] 中的字符； 
(3) TUI 标记: Unicode (U+E000) – (U+E003) 如3.10.5 节中指定； 
支持的语言 
  由特定实现来定义支持哪些语言，本指南保留的字符串是UTF-8 。 
   属性cup.tee.tui.languages 允许TA 指示实现支持哪些语言，这只是提供信息，因为
语言和需要支持的对应UTF-8 字符子集并没有直接的映射；为应付这种情况，函数
TEE_TUICheckTextFormat 允许TA 准确地知道哪些UTF-8 字符被实现支持。 
格式 
  由特定实现来定义字体和文本的大小显示给用户，只要通过提供这些字体和大小，它们
满足第13.1.2.10.1 节中定义最低限度的字符显示能力。 
  受信任的用户界面上显示的文本可能包含敏感信息，如货币量或将要签署的文本。TA
调用用户接口必须确保屏幕的图形绘制准确地反映提供给显示函数的文本；一个正常的显示
接口可影响绘制方法有两种： 
(1) 如果无法以图形方式显示了一些Unicode 字符，提供默认绘制； 
(2) 如果一行文本太长，无法在单一屏幕上一行显示，文本可以被截断或上显示几行，
有或没有连字符的单词；  
  这种行为对可信用户接口是不可接受的，TUI API 将拒绝任何包含不能由实现绘制的字
符的字符串，为了防止文本行绘制的问题，TUI API 要求显示之前调用TA 切割行以匹配屏
幕；如果一行过长，则显示操作将被拒绝。 
    这种格式化操作可以通过使用TUI 的API ，它提供了一种方法使用函数
TEE_TUICheckTextFormat 知道字符串将占据的确切宽度和高度的，取决于实现所有字符具
有固定的宽度和高度，或好的微调实现，依据绘制的文本可以调整高度和宽度。  
屏幕标签的最小文本区 
中国银联 
版权所有

---
**[p70]**

69 
 
  文本区具有最小的垂直和水平尺寸。这个最低值以最小ASCII 字体的字符数表示。它必
须至少为：  
(1) 4 行 ； 
(2) 每行25 字符 ； 
如果设备支持更复杂的字体，每个符号更高的信息密度，如许多亚洲Unicode 字体，那
么它必须支持至少4 行，每行10 个字符，用这些字体以可读文本。 
标记能力和文本调整 
标记文本是粗体和或加下划线是可能的，此标记功能是基于私有Unicode 字符。相同的
值被用于标记一个特殊格式段的起点和该格式段的结束，它们有可能重叠。 
(1) Unicode (U+E000)  加粗 ； 
(2) Unicode (U+E001)  加下划线 ； 
可以插入一个像素宽空间或者一个像素高度空间的倍数。这允许TA 对文本块执行它自
己的对齐，或调整文本适合特定的背景图像，对齐（右或左）与下述操作一致，紧跟文本的
语言。 
(1) Unicode (U+E002) 当前光标右移一个像素；  
(2) Unicode (U+E003) 当前光标下移一个像素； 
5.2.6.1.2.11. 
电源OS 事件管理 
  TUI 的屏幕经常显示关键和敏感数据和操作必须立即的和排斥的。它们必须导致体验让
用户对显示以及输入的数据有信心。在另一方面，REE 端的平台发生的一些事件，如那些与
电源管理相关的或来电也非常关键。本节阐明在这样的情况下TUI 的会话的预期行为；总的
规则是，单个TUI 的屏幕（在一个TUI 会话）必须被视为一个原子操作，它是有效的仅当它
没有被打断。 
  当TUI 会话期间以下的电源管理事件发生时，该设备必须触发TUI 会话终止： 
(1) 设备复位事件；  
(2) 设备关闭事件；  
(3) 睡眠模式打开事件；   
(4) 背景灯关闭事件；  
  当一个操作系统特定的事件在TUI 期间内发生，TUI 的会话可能会终止。典型的操作系
统特定事件是来电，日历事件，电子邮件通知等，对于特定操作系统的特定事件如何选择终
止TUI 会话是实现特定的。 
  当TUI 会话终止，TUI 的屏幕必须从显示屏上消失，以确保该用户不会被混淆，其屏幕
区的控制还给REE；TEE TUI 在移交显示控制给REE 之前，显示警告信息可信显示模式留下
是可接受的；当REE 事件已得到解决后TA 可重放中断的TUI 屏幕时，最可能的是，TA 和它
的客户端应用将决定在这种情况下适用的行为。 
中国银联 
版权所有

---
**[p71]**

70 
 
5.2.6.1.2.12. 
屏幕朝向 
  默认情况下，本指南允许屏幕的一个固定的方式显示垂直或水平；一个实现必须支持两
种操作之一，可以支持他们两个。 
  当前朝向知识不是关键，可以被视为信息。它不由这个AP 提供，可以由TA 的希望显示
TUI 屏幕的客户端应用来获得。 
5.2.6.2. Button 
5.2.6.2.1. 声明 
java.lang.Object  
    |  
+--com.cup.tee.tui.Button  
public abstract class Button extends Object 
5.2.6.2.2. 描述 
该抽象类定义一个按钮的内容。 
5.2.6.2.3. 字段 
下属字段定义按钮的类型： 
——TEE_TUI_BUTTON_CORRECTION 
public static final byte TEE_TUI_BUTTON_CORRECTION 
修改按钮类型。 
——TEE_TUI_BUTTON_OK 
public static final byte TEE_TUI_BUTTON_OK 
确认按钮类型。 
——TEE_TUI_BUTTON_CANCEL 
public static final byte TEE_TUI_BUTTON_CANCEL 
取消按钮类型。 
——TEE_TUI_BUTTON_VALIDATE 
public static final byte TEE_TUI_BUTTON_VALIDATE 
验证按钮类型。 
——TEE_TUI_BUTTON_PREVIOUS 
public static final byte TEE_TUI_BUTTON_PREVIOUS 
前一个按钮类型。 
——TEE_TUI_BUTTON_NEXT 
public static final byte TEE_TUI_BUTTON_NEXT 
下一个按钮类型。 
中国银联 
版权所有

---
**[p72]**

71 
 
5.2.6.2.4. 构造器 
Button 
public Button() 
5.2.6.2.5. 方法 
getWidth 
public abstract int getWidth() 
得到按钮的宽度，以像素为单位。 
返回:  
 按钮宽度。 
getHeight 
public abstract int getHeight() 
得到按钮的高度，以像素为单位。 
返回:  
 按钮高度 
getText 
public abstract int getText(byte[] text, int txtOffset) 
获得安全的文本。 
参数:  
 text - 存放文本的字节数组。  
 txtOffset - 文本的开始地址 。 
返回:  
 文本的长度。 
isButtonTextCustom 
public abstract boolean isButtonTextCustom() 
确定文本是否可以定制。 
返回:  
 true 可以定制。 
isButtonImageCustom 
public abstract boolean isButtonImageCustom() 
确定图像是否可以定制。 
返回:  
 true 可以定制。 
setButtonImage 
中国银联 
版权所有

---
**[p73]**

72 
 
public abstract void setButtonImage(Image image) 
设置和按钮关联的图像。 
参数:  
 image - Image 实例。 
setButtonText 
public abstract void setButtonText(byte[] text, 
                 int txtOffset, 
                 int txtLen) 
设置和按钮关联的文本串。 
参数:  
 text - 提供文本串的字节数组。  
 txtOffset - 文本的开始位置。  
 txtLen - 文本的长度。 
5.2.6.3. EntryField 
5.2.6.3.1. 声明 
java.lang.Object  
| 
+--com.cup.tee.tui.EntryField  
public abstract class EntryField extends Object 
5.2.6.3.2. 描述 
该类封装输入域控制的信息。 
5.2.6.3.3. 字段 
下属字段定义输入域的模式： 
——TEE_TUI_HIDDEN_MODE 
public static final byte TEE_TUI_HIDDEN_MODE 
输入字符不以明文显示。 
——TEE_TUI_CLEAR_MODE 
public static final byte TEE_TUI_CLEAR_MODE 
输入字符明文可见。  
——TEE_TUI_TEMPORARY_CLEAR_MODE 
public static final byte TEE_TUI_TEMPORARY_CLEAR_MODE 
输入字符短暂可见后隐藏。 
下属字段定义输入的类型： 
——TEE_TUI_NUMERICAL  
中国银联 
版权所有

---
**[p74]**

73 
 
public static final byte TEE_TUI_NUMERICAL  
只能输入数字。 
——TEE_TUI_ALPHANUMERICAL 
public static final byte TEE_TUI_ALPHANUMERICAL 
可输入字母数字。 
下属字段定义输入域标签的宽度和高度： 
——TEE_TUI_SCREEN_ENTRY_FIELD_LABEL_WIDTH 
public static final byte TEE_TUI_SCREEN_ENTRY_FIELD_LABEL_WIDTH 
输入域标签的宽度。 
——TEE_TUI_SCREEN_ENTRY_FIELD_LABEL_HEIGHT 
public static final byte TEE_TUI_SCREEN_ENTRY_FIELD_LABEL_HEIGHT 
输入域标签的高度。 
——TEE_TUI_SCREEN_MAX_ENTRY_FIELD_LENGTH 
public static final byte TEE_TUI_SCREEN_MAX_ENTRY_FIELD_LENGTH 
输入字段期望输入的最大字符数 
5.2.6.3.4. 方法 
getMaxCount 
public static int getMaxCount(int orientation) 
返回屏幕可以显示的最大输入域的个数。 
参数:  
 orientation - 屏幕的朝向 。 
返回:  
 最大输入域的个数。 
getWidth 
public static int getWidth(int orientation) 
返回输入域的宽度。 
参数:  
 orientation - 屏幕的朝向。  
返回:  
 输入域的宽度。 
getHeight 
public static int getHeight(int orientation) 
返回输入域的高度。 
参数:  
 orientation - 屏幕的朝向。  
返回:  
 输入域的高度。 
中国银联 
版权所有

---
**[p75]**

74 
 
getMaxLength 
public static int getMaxLength(int orientation) 
返回输入域可接受输入的最大字符数。 
参数:  
 orientation - 屏幕的朝向 。 
返回:  
 可输入的最大字符数。 
setLabel 
public abstract void setLabel(byte[] label, 
            int offset, 
            int size) 
设置输入域的标签。 
参数:  
 label - 存放标签内容的字节数组 。 
 offset - 标签内容的开始位置 。 
 size - 标签的大小。 
setMode 
public abstract void setMode(int mode) 
设置显示字符时使用的模式。 
参数:  
 mode - 字符显示模式,必须为下属值之一： 
 TEE_TUI_HIDDEN_MODE 
 TEE_TUI_CLEAR_MODE 
 TEE_TUI_TEMPORARY_CLEAR_MODE 
setType 
public abstract void setType(int type) 
设置可接受的输入类型。 
参数:  
 type - 输入类型，必须为下属值之一： 
 TEE_TUI_NUMERICAL  
 TEE_TUI_ALPHANUMERICAL 
setOutString 
public abstract void setOutString(byte[] buffer, 
                int offset) 
设置接收输入的缓冲区。 
参数:  
 buffer - 存放输入内容的字节数组。  
 offset - 存放输入内容的开始位置。 
中国银联 
版权所有

---
**[p76]**

75 
 
setExpectedLength 
public abstract void setExpectedLength( 
  
 
 
 
int min, 
                    int max 
  
 
 
 
) 
设置期望的长度范围。 
参数:  
 min – 期望输入的最小字符数。 
 max  - 期望输入的最大字符数。 
getInstance 
public static final EntryField getInstance() 
创建一个EntryField 实例。 
返回:  
 EntryField 实例。 
5.2.6.4. Image 
5.2.6.4.1. 声明 
java.lang.Object  
    | 
+--com.cup.tee.tui.Image  
public abstract class Image extends Object 
5.2.6.4.2. 描述 
该类定义图像的内容。 
5.2.6.4.3. 字段 
——TEE_TUI_NO_SOURCE 
public static final byte TEE_TUI_NO_SOURCE 
没有引用图像。 
——TEE_TUI_REF_SOURCE 
public static final byte TEE_TUI_REF_SOURCE 
引用图像以缓冲区方式指定。 
——TEE_TUI_OBJECT_SOURCE 
public static final byte TEE_TUI_OBJECT_SOURCE 
引用图像以数据对象方式指定。 
中国银联 
版权所有

---
**[p77]**

76 
 
5.2.6.4.4. 方法 
setSoure 
public abstract void setSoure(int source) 
设置图像的来源。 
参数:  
source - 图像的来源。 
setRef 
public abstract void setRef( 
  
 
 
 
byte[] image, 
        int  offset, 
        int  size 
 
 
) 
设置内存引用方式图像。 
参数:  
 image - 存放图像的字节数组。  
 offset - 图像内容的开始位置。  
 size - 图像的字节大小。 
setObject 
public abstract void setObject( 
  
 
 
int  
storageID, 
    byte[] objectID, 
    int  objOffset, 
int  objLen 
) 
参数:  
 storageID - 存放图像的可信存储空间的标识，必须为TEE_STORAGE_PRIVATE。 
 objectID - 字节数组存放图像的持久化对象的标识。  
 objOffset - 标识在字节数组中的开始位置 。 
 objLen - 标识的长度。 
setWidth 
public abstract void setWidth(int width) 
设置图像的宽度。 
参数:  
 width - 图像的宽度，以像素为单位。 
setHeight 
public abstract void setHeight(int height) 
中国银联 
版权所有

---
**[p78]**

77 
 
设置图像的高度。 
参数:  
 height - 图像的高度，以像素为单位。 
getInstance 
public static final Image getInstance() 
创建Image 实例。 
返回:  
 Image 实例。 
5.2.6.5. Label 
5.2.6.5.1. 声明 
java.lang.Object  
   | 
+--com.cup.tee.tui.Label  
public abstract class Label extends Object 
5.2.6.5.2. 描述 
类Label 封装了屏幕标签的信息。 
5.2.6.5.3. 方法 
getLabelColor 
public static void getLabelColor(byte[] lebalColor, int offset) 
查询标签的颜色。 
参数:  
 lebalColor - 存放标签颜色的字节数组。  
 offset - 标签颜色的开始位置。 
getLabelWidth 
public static int getLabelWidth() 
查询标签的宽度。 
返回:  
 标签的宽度，以像素为单位。 
getLabelHeight 
public int getLabelHeight() 
查询标签的高度。 
中国银联 
版权所有

---
**[p79]**

78 
 
返回:  
 标签的高度，以像素为单位。 
setText 
public abstract void setText(byte[] text, 
           int offset, 
           int len, 
           int x, 
           int y, 
           byte r, 
           byte g, 
           byte b) 
参数:  
 text - 存放文本的字节数组 。 
 offset - 文本的开始位置。  
 len - 文本的长度。 
setTextOffset 
public abstract void setTextOffset(int x, int y) 
设置文本的显示位置。 
参数:  
 x - 显示的X 坐标。  
 y - 显示的y 坐标。 
setText 
public abstract void setText(byte r, 
           byte g, 
           byte b) 
设置文本的显示颜色。 
参数:  
 r - 设置红。  
 g - 设置绿。  
 b - 设置蓝。 
setImage 
public abstract void setImage(Image image) 
设置屏幕的图像。 
参数:  
 image - 屏幕的图像。 
setImageOffset 
public abstract void setImageOffset(int x, int y) 
中国银联 
版权所有

---
**[p80]**

79 
 
设置标签的显示位置。 
参数:  
 x - 设置x 坐标 。 
 y - 设置y 坐标。 
getInstance 
public static final Label getInstance() 
创建一个Label 实例。 
返回:  
 Label 实例。 
5.2.6.6. Screen 
5.2.6.6.1. 声明 
java.lang.Object  
    | 
+--com.cup.tee.tui.Screen  
public abstract class Screen extends Object 
5.2.6.6.2. 描述 
该类定义图形用户接口的显示方法。 
5.2.6.6.3. 字段 
下属字段定义屏幕的按钮信息： 
——TEE_TUI_CORRECTION 
public static final byte TEE_TUI_CORRECTION 
——TEE_TUI_OK 
public static final byte TEE_TUI_OK 
 
——TEE_TUI_CANCEL 
public static final byte TEE_TUI_CANCEL 
——TEE_TUI_VALIDATE 
public static final byte TEE_TUI_VALIDATE 
——TEE_TUI_PREVIOUS 
public static final byte TEE_TUI_PREVIOUS 
——TEE_TUI_NEXT 
public static final byte TEE_TUI_NEXT 
下属字段定义屏幕的朝向： 
——TEE_TUI_ORIENTATION_PORTAIT 
中国银联 
版权所有

---
**[p81]**

80 
 
public static final byte TEE_TUI_ORIENTATION_PORTAIT 
——TEE_TUI_ORIENTATION_LANDSCAPE 
public static final byte TEE_TUI_ORIENTATION_LANDSCAPE 
下属字段定义屏幕的颜色： 
——TEE_TUI_SCREEN_GRAY_SCALE_BITS_DEPTH 
public static final byte TEE_TUI_SCREEN_GRAY_SCALE_BITS_DEPTH 
——TEE_TUI_SCREEN_RED_BITS_DEPTH 
public static final byte TEE_TUI_SCREEN_RED_BITS_DEPTH 
——TEE_TUI_SCREEN_GREEN_BITS_DEPTH 
public static final byte TEE_TUI_SCREEN_GREEN_BITS_DEPTH 
——TEE_TUI_SCREEN_BLUE_BITS_DEPTH 
public static final byte TEE_TUI_SCREEN_BLUE_BITS_DEPTH 
下属字段用于定义屏幕的宽度和高度： 
——TEE_TUI_SCREEN_WIDTH_INCH 
public static final byte TEE_TUI_SCREEN_WIDTH_INCH 
——TEE_TUI_SCREEN_HEIGHT_INCH 
public static final byte TEE_TUI_SCREEN_HEIGHT_INCH 
定义屏幕按钮的最大数量： 
——TEE_TUI_SCREEN_MAX_ENTRY_FIELDS 
public static final byte TEE_TUI_SCREEN_MAX_ENTRY_FIELDS 
下属字段定义字屏幕的大小： 
——TEE_TUI_SCREEN_LABEL_WIDTH 
public static final byte TEE_TUI_SCREEN_LABEL_WIDTH 
——TEE_TUI_SCREEN_LABEL_HEIGHT 
public static final byte TEE_TUI_SCREEN_LABEL_HEIGHT 
5.2.6.6.4. 方法 
getGrayScaleBitsDepth 
public abstract int getGrayScaleBitsDepth() 
查询屏幕的灰度信息。 
返回: 
 指定类型的信息值。 
getColour 
public abstract void getColour(int[] rgb, 
             int offset) 
返回屏幕的颜色。 
参数: 
 rgb - 存放红、绿、蓝的整数数组。 
 offset - 颜色的开始位置。 
中国银联 
版权所有

---
**[p82]**

81 
 
getWidth 
public abstract int getWidth(int orientation) 
返回屏幕的宽度。 
参数: 
 orientation - 屏幕的朝向。 
返回: 
 宽度，已像素为单位。 
getHeight 
public abstract int getHeight(int orientation) 
返回屏幕的高度。 
参数: 
 orientation - 屏幕的朝向。 
返回: 
 高度，已像素为单位。 
getButton 
public abstract Button getButton(int buttonType) 
得到指定按钮类型的Button 实例。 
返回: 
 Button。 
checkTextFormat 
public abstract void checkTextFormat(byte[] text, 
                   int txtOffset, 
                   int txtLen, 
                   int[] format, 
                   int offset)  throws TEEException 
检查给定的文本能否在当前实现显示，并检索一些用于显示的大小和宽度的信息。 
参数: 
 text - 存放文本的字节数组。 
 txtOffset - 文本的开始位置。 
 txtLen - 文本的长度。 
 format - 整数数组存放文本的宽度和高度，以像素为单位。 
 offset - 起始位置。 
抛出: 
 TEEException。 
initSession 
public abstract void initSession()  throws TEEException 
为当前TA 申请独占使用TUI 的资源。 
抛出: 
中国银联 
版权所有

---
**[p83]**

82 
 
 TEEException。 
displayScreen 
public abstract int displayScreen(int orientation, 
                Label label, 
                boolean[] requestedButtons, 
                EntryField[] entryFields, 
                boolean closeTUISession) 
                throws TEEException, TUIException 
在屏幕显示TUI，要求的输入域的显示顺序是从顶至低。 
参数: 
 orientation - 屏幕的朝向，可以是
TEE_TUI_ORIENTATION_PORTAIT 或 
TEE_TUI_ORIENTATION_LANDSCAPE 
 label - 屏幕的标签。 
 requestedButtons - 指定显示哪个按钮,true 指定对应的按钮显示。 
 closeTUISession - true 函数退出后，自动关闭屏幕。 
 entryFields - 要求的输入域。 
返回: 
 用户选择的按钮。 
抛出: 
 TEEException。 
 TUIException。 
closeSession 
public abstract void closeSession() throws TEEException 
释放前面申请的TUI 资源。 
抛出: 
 TEEException。 
getInstance 
public static final Screen getInstance() 
创建一个Screen 实例。 
返回: 
 Screen 实例。 
5.2.6.7. TUIException 
5.2.6.7.1. 声明 
java.lang.Object 
  |  
+--java.lang.Throwable  
中国银联 
版权所有

---
**[p84]**

83 
 
      | 
        +--java.lang.Exception  
              |  
+--java.lang.RuntimeException  
      | 
+--com.cup.tee.framework.TEERuntimeException  
      | 
+--com.cup.tee.tui.TUIException  
public class TUIException extends TEERuntimeException 
5.2.6.7.2. 描述 
TUI 操作异常类 
5.2.6.7.3. 字段 
——TEE_ERROR_EXTERNAL_CANCEL 
public static final int TEE_ERROR_EXTERNAL_CANCEL 
当TUI 屏幕显示时，操作已被REE 发生的外部事件取消。  
5.2.6.7.4. 构造器 
TUIException 
public TUIException(int sw) 
使用指定的错误码构建一个TUIException 实例， 为节省资源可使用TEE 运行环境拥有的
这个类的实例。 
5.2.6.7.5. 方法 
throwIt 
public static void throwIt(int reason) 
使用指定的错误码抛出TEE 运行环境拥有的类TUIException 的实例。 
参数:  
 reason - N3TEE 定义的错误码 。 
抛出:  
 TUIException - 总是。 
5.2.7. com.cup.teex.secureelement 
5.2.7.1. 描述 
安全模块访问API,通过服务类找到相关的读写器，与读写器的中安全模块建立会话，
中国银联 
版权所有

---
**[p85]**

84 
 
通过逻辑通道选择安全模块内的应用后，可以向应用发送APDU 命令。 
 
图9 具有多个SE 读写器的典型设备                       
如上图所示，安全模块可连接到REE 或由TEE 独占。 
(1) TA 可访问专门连接到TEE 的SE，无需使用任何REE 资源, 因此通信被认为是可
信的。 
(2) TA 通过使用REE 资源访问连接到REE 的SE，一种特有安全保护，如安全通道必
须实现，以防止在REE 攻击TA 和SE 之间的通信。 
一个SE 是否专门连接到TEE 与否的信息通过TEE SE API 传递给TA；一个SE 始终位
于读写器内，不管它是否被永久固定在设备或插入一个物理卡读写器（如SD 卡读卡器）或
槽（例如一个SIM 卡插槽）。一个设备可以支持任意数量的SE 和读写器，但在任何一个时间
具有的SE 数量仅同具有的读写器数量。 
运行在TEE 内的可信应用可得到该TEE 正在执行设备相关联读写器列表，读写器是存在
于该列表中，即使没有SE 的读写器，这是可能的，在某些系统中，当例如一个USB SD 卡
或智能卡阅读器被安装在设备中，可用的读写器列表可能会改变。 
在返回的标识读写器的字符串来应在设备内是唯一的，并应是人可读的，即它们应适用
于提示选择一个SE 进行交互。 
一旦与读写器连接，就能够查询所包含的SE 的ATR，然后与SE 中的应用建立基于APDU
的连接。 
5.2.7.2. Channel 
5.2.7.2.1. 声明 
中国银联 
版权所有

---
**[p86]**

85 
 
public interface Channel 
5.2.7.2.2. 描述 
与安全模块建立逻辑通道，发送命令。 
5.2.7.2.3. 字段 
——SE_CHANNEL_FREE 
static final int SE_CHANNEL_FREE 
——SE_CHANNEL_OPENED 
static final int SE_CHANNEL_OPENED 
——SE_CHANNEL_CLOSED 
static final int SE_CHANNEL_CLOSED 
5.2.7.2.4. 方法 
close 
void close() 
关闭与安全模块打开的逻辑通道。 
selectNext 
void selectNext() 
在同样通道上选择所有AID 部分匹配的下一个应用。 
getSelectResponse 
int getSelectResponse(byte[] response, int offset) 
得到SELECT 命令的响应数据与状态字。 
参数:  
 response - 复制响应数据的字节数组 。 
 offset - 复制的起始地址 。 
返回:  
 状态字。 
transmit 
int transmit( byte[] command, 
            
 
int cmdOffset, 
           
int cmdLen, 
            
 
byte[] response, 
            
 
int respOffset 
) 
中国银联 
版权所有

---
**[p87]**

86 
 
发送APDU 命令到安全模块，返回命令的响应。 
参数:  
 command - 包含APDU 命令的字节数组。  
 cmdOffset - 命令在数组中的起始地址。  
 cmdLen - 命令的长度 。 
 response - 存放响应数据的字节数组 。 
 respOffset - 存放响应数据的起始地址。  
返回:  
 命令的状态字。 
5.2.7.3. Reader 
5.2.7.3.1. 声明 
public interface Reader 
 
所有已知子接口:  
ReaderEx  
5.2.7.3.2. 描述 
应用使用该接口可以与读写器中的安全模块建立会话。 
5.2.7.3.3. 方法 
isSEPresent 
boolean isSEPresent() 
检测读写器中是否存在安全模块。 
返回:  
 如果读写器中存在安全模块返回true，否则返回false。 
idTEEOnly 
boolean idTEEOnly() 
确认读写器是否只有TEE 可访问。 
返回:  
 如果读写器只能通过TEE 访问返回true，否则(即只有REE 可访问或REE 与TEE 都
可以访问)返回false。 
isSelectResponseEnable 
boolean isSelectResponseEnable() 
确认SELECT 命令的响应TEE 可访问。 
中国银联 
版权所有

---
**[p88]**

87 
 
返回:  
 SELECT 命令的响应对TEE 可用，返回true。 
getName 
int getName(byte[] name, int offset) 
得到读写器的名字。 
参数:  
 name - 存放读写器的字节数组引用 。 
 offset - 数组的起始位置 。 
返回:  
 名字的长度。 
openSession 
Session openSession() 
与读写器中的安全模块建立连接。 
返回:  
 接口Session 一个实例。 
closeSession 
void closeSession() 
关闭与读写器中安全模块建立的连接。 
5.2.7.4. Session 
5.2.7.4.1. 声明 
public interface Session 
 
所有已知子接口:  
SessionEx  
5.2.7.4.2. 描述 
与指定读写器中的安全模块建立会话。 
5.2.7.4.3. 字段 
——SE_SESSION_FREE 
static final int SE_SESSION_FREE 
——SE_SESSION_OPENED 
static final int SE_SESSION_OPENED 
中国银联 
版权所有

---
**[p89]**

88 
 
——SE_SESSION_CLOSED 
static final int SE_SESSION_CLOSED 
5.2.7.4.4. 方法 
getATR 
int getATR(byte[] atr, int offset) 
得到安全模块的ATR。 
参数:  
 atr - 复制ATR 的字节数组 。 
 offset - 复制的起始位置  
返回: 。 
 ATR 的长度，如果没有ATR，返回0。 
isClosed 
boolean isClosed() 
确定这个会话是否已关闭。 
返回:  
 true 会话已关闭。 
close 
void close() 
关闭这个会话已打开的所有通道以及会话自身。 
closeChannel 
void closeChannel() 
关闭这个会话已打开的所有通道，但会话不关闭。 
openBasicChannel 
Channel openBasicChannel(byte[] aid, 
                       int aidOffset, 
                       int aidLen) 
访问ISO/IEC 7816-4 定义的基本逻辑通道，并选择aid 指定应用。 
参数:  
 aid - 字节数组包含yige 安全模块应用的AID 。 
 aidOffset - 存放AID 数组的起始位置。  
 aidLen - AID 的长度。  
返回:  
 接口Channel 的一个实例。 
openLogicChannel 
中国银联 
版权所有

---
**[p90]**

89 
 
Channel openLogicChannel(byte[] aid, 
                       int aidOffset, 
                       int aidLen) 
打开逻辑通道，并选择aid 指定应用。 
参数:  
 aid - 字节数组包含yige 安全模块应用的AID 。 
 aidOffset - 存放AID 数组的起始位置 。 
 aidLen - AID 的长度 。 
返回:  
 接口Channel 的一个实例。 
5.2.7.5. SEService 
5.2.7.5.1. 声明 
java.lang.Object 
  |  
+--com.cup.tee.secureelement.SEService  
public abstract class SEService extends Object 
5.2.7.5.2. 描述 
示例3：该接口封装了可信应用访问安全模块（SE）的入口点方法。 
5.2.7.5.3. 构造器 
SEService 
public SEService() 
5.2.7.5.4. 方法 
open 
public abstract void open() 
建立新的连接，用于连接到所有对TEE 可用的安全模块。 
close 
public abstract void close() 
关闭已建立的连接。 
getReader 
中国银联 
版权所有

---
**[p91]**

90 
 
public abstract Reader[] getReader() 
得到可用的安全模块读写器列表。 
返回:  
 类Reader 实例数组引用。 
getInstance 
public static final SEService getInstance() 
得到类 Service 的实例，用于和TEE 可用的安全模块读写器建立连接。 
返回:  
 类 Service 一个的实例。 
5.2.8. com.cup.teex.arithmetical 
5.2.8.1. 描述 
算术运算API，开发者使用这些API 可实现密码API 未提供的非对称密码算法 。 
5.2.8.2. BigInt 
5.2.8.2.1. 声明 
java.lang.Object 
   |  
+--com.cup.tee.arithmetical.BigInt 
public abstract class BigInt extends Object 
5.2.8.2.2. 描述 
算术类，对大整数的算术、逻辑操作。 
5.2.8.2.3. 构造器 
BigInt 
public BigInt() 
5.2.8.2.4. 方法 
init 
public abstract void init(byte[] buffer, 
          
 
 
 
int bufferOffset, 
          
 
 
 
int bufferLen, 
          
 
 
 
int sign) 
中国银联 
版权所有

---
**[p92]**

91 
 
将8 位组（Octet）串转换为BigInt 格式。 
参数:  
 buffer - 存放Octet 串的字节数组。  
 bufferOffset - Octet 串的开始位置 。 
 bufferLen - Octet 串的长度 。 
 sign - 转换后的整数符号。 
init 
public abstract void init(int src) 
将整数转化为BigInt 格式。 
参数:  
 src - 要转化格式的整数。 
toOctetString 
public abstract int toOctetString(byte[] buffer, 
                  
 
 
 
int bufferOffset) 
将BigInt 转换为Octet 串。 
参数:  
 buffer - 存放 Octet 串的字节数组。  
 bufferOffset - Octet 串的开始位置。  
返回:  
 Octet 串的长度。 
toS32 
public abstract int toS32() 
将BigInt 转换为整数。 
返回:  
 整数。 
add 
public static void add( BigInt op1, 
        
 
 
 
 
 
BigInt op2, 
        
 
 
 
 
 
BigInt dest) 
大整数加法。 
参数:  
 op1 - 操作数1 。 
 op2 - 操作 数2。  
 dest - 操作数1 和操作2 相加的结果 ,dest = op1 + op2。 
sub 
public static void sub(BigInt op1, BigInt op2, BigInt dest) 
大整数减法。 
中国银联 
版权所有

---
**[p93]**

92 
 
参数:  
 op1 - 操作数1 。 
 op2 - 操作 数2。  
 dest - 操作数1 和操作2 相减的结果, dest = op1 - op2。 
neg 
public abstract void neg(BigInt op, BigInt dest) 
变负操作。 
参数:  
 op - 操作 数。  
 dest - dest = -op。 
mul 
public static void mul( BigInt op1, 
        
 
 
 
 
 
BigInt op2, 
        
 
 
 
 
 
BigInt dest) 
大整数乘法运算。 
参数:  
 op1 - 操作数1 。 
 op2 - 操作 数2。  
 dest - 操作数1 和操作2 相乘的结果, dest = op1 * op2。 
square 
public static void square(BigInt op, 
           
 
 
 
BigInt dest) 
大整数的平方操作。 
参数:  
 op - 操作数 。 
 dest - dest = op * op。 
div 
public static void div(BigInt op1, 
        
 
 
 
 
BigInt op2, 
        
 
 
 
 
BigInt dest_q, 
        
 
 
 
 
BigInt dest_r) 
大整数的除法操作，即计算dest_q 与dest_r，使得op1 = dest_q * op2 + dest_r。 
参数:  
 op1 - 操作数1 。 
 op2 - 操作数2 。 
 dest_q - 操作数1 除以操作数2 的商 。 
 dest_r - 操作数1 除以操作数2 的余数。 
中国银联 
版权所有

---
**[p94]**

93 
 
mod 
public static void mod( BigInt op, 
        
 
 
 
 
 
BigInt n, 
        
 
 
 
 
 
BigInt dest) 
dest = op（mod n） 
参数:  
 op - 操作数 。 
 n - 模数 。 
 dest - 计算的结果。 
addMod 
public static void addMod(BigInt op1, 
           
 
 
 
BigInt op2, 
           
 
 
 
BigInt n, 
           
 
 
 
BigInt dest) 
模加操作。 
参数:  
 op1 - 操作数1。  
 op2 - 操作数2 。 
 n - 模 数。  
 dest - 计算结果 op1 + op2 (mode n)。 
subMod 
public static void subMod(BigInt op1, 
           
 
 
 
BigInt op2, 
           
 
 
 
BigInt n, 
           
 
 
 
BigInt dest) 
模减操作 
参数:  
 op1 - 操作数1 。 
 op2 - 操作数2 。 
 n - 模 数。  
 dest - 计算结果 op1 - op2 (mode n)。 
mulMod 
public static void mulMod(BigInt op1, 
           
 
 
 
BigInt op2, 
           
 
 
 
BigInt n, 
           
 
 
 
BigInt dest) 
模乘操作 
参数:  
 op1 - 操作数1 。 
中国银联 
版权所有

---
**[p95]**

94 
 
 op2 - 操作数2。  
 n - 模 数 。 
 dest - 计算结果 op1 * op2 (mode n)。 
squareMod 
public static void squareMod( 
BigInt op, 
               
 
 
 
BigInt n, 
               
 
 
 
BigInt dest) 
模平方操作。 
参数:  
 op - 操作数 。 
 n - 模数 。 
 dest - 计算结果 op * op (mode n)。 
invMod 
public static void invMod(BigInt op, 
           
 
 
 
BigInt n, 
           
 
 
 
BigInt dest) 
模计算 dest * op = 1(mod n)。 
参数:  
 op – 操作数。 
 dest – 计算结果。 
cmp 
public static int cmp(BigInt op1, 
       
 
 
 
BigInt op2) 
两大整数比较大小 
参数:  
 op1 - 操作数1。  
 op2 - 操作数2 。 
返回:  
 比较的结果 , <0: 如果 op1 < op2, =0: 如果 op1 == op2 , >0: 如果 op1 > op2。 
cmpS32 
public static int cmpS32( 
BigInt op, 
           
 
 
 
int shortVal) 
大整数与整数比较大小。 
参数:  
 op - 操作数 。 
 shortVal - 整数。  
返回:  
 比较结果, <0: 如果 op < shortVal, =0: 如果 op1 == shortVal , >0: 如果 op1 > 
中国银联 
版权所有

---
**[p96]**

95 
 
shortVal。 
shiftRight 
public static void shiftRight(BigInt op, 
               
 
 
 
int bits, 
               
 
 
 
BigInt dest) 
右移位操作，|dest| = |op| >> bits,dest 与op 有相同符号。 
参数:  
 op - 操作数 。 
 bits - 向右移动的位数 。 
 dest - 移位后的结果。 
getBit 
public static boolean getBit( 
BigInt src, 
               
 
 
 
int bitIndex) 
取大整数的指定位索引的位。 
参数:  
 src - 大整数 。 
 bitIndex - 位索引，最无效位的偏移为0 。 
返回:  
 true 指定位的值为1，否则为0。 
getBitCount 
public static int getBitCount(BigInt src) 
返回大整数的位数。 
参数:  
 src - 大整数。  
返回:  
 大整数的位数。 
relativePrime 
public static boolean relativePrime( BigInt op1, 
                      
 
 
 
BigInt op2) 
确定gcd(op1,op2) == 1 是否成立。 
参数:  
 op1 - 操作数1 。 
 op2 - 操作数2 。 
返回:  
 true，如果gcd(op1,op2) == 1。 
computeExtendedGcd 
public static void computeExtendedGcd(BigInt op1, 
中国银联 
版权所有

---
**[p97]**

96 
 
                       
 
 
 
BigInt op2, 
                       
 
 
 
BigInt gcd, 
                       
 
 
 
BigInt u, 
                       
 
 
 
BigInt v) 
计算两个操作数的最大公约数，同时计算系数u 和v，使得 u*op1 + v*op2 == gcd。 
参数:  
 op1 - 操作数1 。 
 op2 - 操作数2 。 
 gcd - 操作数1 与操作数2 的公约数 。 
 u - 系数1 。 
 v - 系数2。 
isProbablePrime 
public static int isProbablePrime(BigInt op, 
                   
 
 
 
int confidenceLevel) 
素性测试。 
参数:  
 op - 操作数。  
 confidenceLevel - 素性概率指数。  
返回:  
 0： 操作数是合数， 1：操作数是素数 ， -1： 检测无定论，但操作数
是合数的概率小于2^(-confidenceLevel)。 
getInstance 
public static final BigInt getInstance(int modulusSizeInBits) 
创建一个BigInt 实例。 
参数:  
 modulusSizeInBits - 模数的大小，以位为单位 。 
返回:  
 BigInt 实例。 
5.2.8.3. BigIntFMM 
5.2.8.3.1. 声明 
java.lang.Object 
   |  
+--com.cup.tee.arithmetical.BigIntFMM 
public abstract class BigIntFMM extends Object 
5.2.8.3.2. 描述 
中国银联 
版权所有

---
**[p98]**

97 
 
封装FMM 格式的大整数。 
5.2.8.3.3. 构造器 
BigIntFMM 
public BigIntFMM() 
5.2.8.3.4. 方法 
getInstance 
public static final BigIntFMM getInstance(int modulusSizeInBits) 
创建一个BigIntFMM 实例。 
参数:  
 modulusSizeInBits - 模数的大小，以位为单位。  
返回:  
 BigIntFMM 实例。 
5.2.8.4. FMM 
5.2.8.4.1. 声明 
java.lang.Object 
    |  
+--com.cup.tee.arithmetical.FMM  
public abstract class FMM extends Object 
5.2.8.4.2. 描述 
该类实现快速模乘操作，以及大数和快速模乘格式的相互转换。 
5.2.8.4.3. 构造器 
FMM 
public FMM() 
5.2.8.4.4. 方法 
getInstance 
public static final BigIntFMM getInstance(int modulusSizeInBits) 
创建一个BigIntFMM 实例。 
中国银联 
版权所有

---
**[p99]**

98 
 
参数:  
 modulusSizeInBits - 模数的大小，以位为单位。  
返回:  
 BigIntFMM 实例。 
5.2.9. com.cup.teex.socket 
5.2.9.1. 描述 
套接字API，TA 通过套接字可以与其他网络节点安全地通信。 
5.2.9.2. Socket 
5.2.9.2.1. 声明 
public interface Socket 
 
所有已知实现类:  
IPSocket, TLSSocket  
5.2.9.2.2. 描述 
该类定义IP 套接字接口。 
5.2.9.2.3. 方法 
open 
void open() 
根据预设的条件，尝试打开一个连接。 
close 
void close() 
关闭套接字，释放分配的资源。 
send 
int send( byte[] buf, 
        
 
int offset, 
        
 
int length, 
        
 
int timeout) 
传输数据到远程网络节点。 
参数:  
 buf - 要发送的数据的字节数组 。 
中国银联 
版权所有

---
**[p100]**

99 
 
 offset - 数据的开始位置 。 
 length - 数据的长度 。 
 timeout - 操作的超时时间，以毫秒为单位，如果为TEE_TIMEOUT_INFINITE,方法
阻塞直到所有数据发送完成。  
返回:  
 已发送的字节长度。 
recv 
int recv( byte[] buf, 
        
 
int offset, 
        
 
int length, 
        
 
int timeout) 
从远程节点接收数据。 
参数:  
 buf - 存放接收数据的字节数组 。 
 offset - 数据的开始位置。  
 length - 请求接收的字节数。  
 timeout - 操作的超时时间，以毫秒为单位，如果为TEE_TIMEOUT_INFINITE,方法
阻塞直到接收到请求长度的数据，如果为0，接收可用的数据，但最多接收length
字节数据 。 
返回:  
 实际接收数据的长度。 
ioctl 
int ioctl( 
 
int protocolId, 
          
int commandCode, 
          
byte[] buf, 
          
int offset, 
          
int length) 
提供协议特定的交互接口。 
参数:  
 protocolId - 标识命令的目标协议。  
 commandCode - 标识命令。  
 buf - 命令的输入数据 ，方法返回时存放命令的输出数据。  
 offset - 数据的开始位置，方法返回时存放命令的输出数据的开始位置 。 
 length - 命令的长度 。 
返回:  
 命令返回的数据的长度。 
5.2.9.3. IPSocket 
5.2.9.3.1. 声明 
中国银联 
版权所有

---
**[p101]**

100 
 
java.lang.Object  
   | 
+--com.cup.tee.socket.IPSocket  
 
public abstract class IPSocket  extends Object implements Socket 
 
所有已实现的接口:  
Socket  
 
5.2.9.3.2. 描述 
该类定义IP 套接字API 
5.2.9.3.3. 字段 
——IP_PROTOCOL_TCP 
public static final byte IP_PROTOCOL_TCP 
——IP_PROTOCOL_UDP 
public static final byte IP_PROTOCOL_UDP 
——IP_VERSION_4 
public static final byte IP_VERSION_4 
——IP_VERSION_6 
public static final byte IP_VERSION_6 
5.2.9.3.4. 方法 
setProtocol 
public abstract void setProtoco(byte protocol) 
设置IP 协议。 
参数:  
 protocol - IP 协议。 
setIPVersion 
public abstract void setIPVersion(byte version) 
设置IP 版本。 
参数:  
 version - IP 版本。 
setServerAddr 
public abstract void setServerAddr( 
中国银联 
版权所有

---
**[p102]**

101 
 
byte[] serverAddr, 
                int srvOffset, 
                int srvLength) 
设置远程服务器地址。 
参数:  
 serverAddr - 服务器地址的字节数组 。 
 srvOffset - 服务器地址的开始地址。  
 srvLength - 服务器地址的长度。 
setServerPort 
public abstract void setServerPort(int serverPort) 
设置端口号。 
参数:  
 serverPort - 端口号。 
open 
public abstract void open() 
根据预设的条件，尝试打开一个连接。 
close 
public abstract void close() 
关闭套接字，释放分配的资源。 
send 
public abstract int send( 
byte[] buf, 
        
int offset, 
        
int length, 
        
int timeout) 
传输数据到远程网络节点。 
参数:  
 buf - 要发送的数据的字节数组 。 
 offset - 数据的开始位置。  
 length - 数据的长度 。 
 timeout - 操作的超时时间，以毫秒为单位，如果为TEE_TIMEOUT_INFINITE,方法
阻塞直到所有数据发送完成 。 
返回:  
 已发送的字节长度。 
recv 
public abstract int recv( 
byte[] buf, 
中国银联 
版权所有

---
**[p103]**

102 
 
        
 
int offset, 
        
 
int length, 
        
 
int timeout) 
从远程节点接收数据。 
参数:  
 buf - 存放接收数据的字节数组 。 
 offset - 数据的开始位置。  
 length - 请求接收的字节数。  
 timeout - 操作的超时时间，以毫秒为单位，如果为TEE_TIMEOUT_INFINITE,方法
阻塞直到接收到请求长度的数据，如果为0，接收可用的数据，但最多接收length
字节数据 。 
返回:  
 实际接收数据的长度。 
ioctl 
public abstract int ioctl( 
int protocolId, 
        int commandCode, 
        byte[] buf, 
        int offset, 
        int length) 
提供协议特定的交互接口。 
参数:  
 protocolId - 标识命令的目标协议。  
 commandCode - 标识命令 。 
 buf - 命令的输入数据 ，方法返回时存放命令的输出数据。  
 offset - 数据的开始位置，方法返回时存放命令的输出数据的开始位置。  
 length - 命令的长度。  
返回:  
 命令返回的数据的长度。 
getInstance 
public static final IPSocket getInstance() 
创建一个IPSocket 实例。 
返回:  
 TLSSocket 实例。 
5.2.9.4. TLSSocket 
5.2.9.4.1. 声明 
java.lang.Object 
中国银联 
版权所有

---
**[p104]**

103 
 
   |  
+--com.cup.tee.socket.TLSSocket  
 
public abstract class TLSSocket  extends Object implements Socket 
 
所有已实现的接口:  
Socket  
 
5.2.9.4.2. 描述 
该类定义tls Socket 操作相关内容。 
5.2.9.4.3. 字段 
——ISOCKET_TLS_ERROR_REJECTED_SUITE 
public static final int ISOCKET_TLS_ERROR_REJECTED_SUITE 
——ISOCKET_TLS_ERROR_VERSION 
public static final int ISOCKET_TLS_ERROR_VERSION 
——ISOCKET_TLS_ERROR_UNSUPPORTED_SUITE 
public static final int ISOCKET_TLS_ERROR_UNSUPPORTED_SUITE 
——ISOCKET_TLS_ERROR_HANDSHAKE 
public static final int ISOCKET_TLS_ERROR_HANDSHAKE 
——TLS_VERSION_ALL 
public static final int TLS_VERSION_ALL 
——TLS_VERSION_1v2 
public static final int TLS_VERSION_1v2 
——TLS_KEYX_PSK 
public static final int TLS_KEYX_PSK 
——TLS_KEYX_DHE_PSK 
public static final int TLS_KEYX_DHE_PSK 
——TLS_KEYX_RSA_PSK 
public static final int TLS_KEYX_RSA_PSK 
——TLS_KEYX_SRP 
public static final int TLS_KEYX_SRP 
——TLS_KEYX_SRP_RSA 
public static final int TLS_KEYX_SRP_RSA 
——TLS_KEYX_SRP_DSS 
public static final int TLS_KEYX_SRP_DSS 
——TLS_KEYX_RSA 
public static final int TLS_KEYX_RSA 
——TLS_KEYX_DHE_RSA 
中国银联 
版权所有

---
**[p105]**

104 
 
public static final int TLS_KEYX_DHE_RSA 
——TLS_KEYX_DHE_DSS 
public static final int TLS_KEYX_DHE_DSS 
——TLS_KEYX_ECDHE_PSK 
public static final int TLS_KEYX_ECDHE_PSK 
——TLS_KEYX_ECDHE_RSA 
public static final int TLS_KEYX_ECDHE_RSA 
——TLS_KEYX_ECDHE_ECDSA 
public static final int TLS_KEYX_ECDHE_ECDSA 
——TLS_ENC_DES3_CBC 
public static final int TLS_ENC_DES3_CBC 
——TLS_ENC_AES_128_CBC 
public static final int TLS_ENC_AES_128_CBC 
——TLS_ENC_AES_256_CBC 
public static final int TLS_ENC_AES_256_CBC 
——TLS_ENC_AES_128_CCM 
public static final int TLS_ENC_AES_128_CCM 
——TLS_ENC_AES_256_CCM 
public static final int TLS_ENC_AES_256_CCM 
——TLS_ENC_AES_128_GCM 
public static final int TLS_ENC_AES_128_GCM 
——TLS_ENC_AES_256_GCM 
public static final int TLS_ENC_AES_256_GCM 
——TLS_MAC_AE 
public static final int TLS_MAC_AE 
——TLS_MAC_MD5 
public static final int TLS_MAC_MD5 
——TLS_MAC_SHA1 
public static final int TLS_MAC_SHA1 
——TLS_MAC_SHA256 
public static final int TLS_MAC_SHA256 
——TLS_MAC_SHA384 
public static final int TLS_MAC_SHA384 
——TLS_CRED_NONE 
public static final int TLS_CRED_NONE 
——TLS_CRED_PDC 
public static final int TLS_CRED_PDC 
——TLS_CRED_CSC 
public static final int TLS_CRED_CSC 
5.2.9.4.4. 方法 
setCipherSuites 
中国银联 
版权所有

---
**[p106]**

105 
 
public abstract void setCipherSuites( 
int akaAlg, 
                    
 
 
int bulkEncAlg, 
                    
 
 
int macAlg) 
设置协议的算法。 
参数:  
 akaAlg - 认证与密钥协商算法。  
 bulkEncAlg - 消息加解算法 。 
 macAlg - MAC 算法。 
setPSKInfo 
public abstract void setPSKInfo( 
Object pskKey, 
               
 
 
byte[] pskIdentity, 
               
 
 
int offset, 
               
 
 
int size) 
设置PSK 信息。 
参数:  
 pskKey - 存放PSK 的持久化对象。  
 pskIdentity - 存储密钥的标识的字节数组 。 
 offset - 密钥的标识的开始位置。  
 size - 密钥的标识的大小。 
setSRPInfo 
public abstract void setSRPInfo( 
byte[] srpPassword, 
               
 
 
int pswOffset, 
               
 
 
int pwdLength, 
               
 
 
byte[] srpIdentity, 
               
 
 
int idOffset, 
               
 
 
int idLength) 
安全远程口令(SRP Secure Remote Password),设置口令与用户标识信息。 
参数:  
 srpPassword - 存放用户口令的字节数组。  
 pswOffset - 口令的开始位置。  
 pwdLength - 口令的长度 。 
 srpIdentity - 存放用户标识的字节数字 。 
 idOffset - 用户标识的开始地址。  
 idLength - 用户标识的长度。 
setServeCredentials 
public abstract void setServeCredentials(int type, 
中国银联 
版权所有

---
**[p107]**

106 
 
                       Object serverPDC) 
设置服务证书。 
参数:  
 type - 证书类型 。 
 serverPDC - 服务器证书。 
setClientCredentials 
public abstract void setClientCredentials( 
int type, 
                        Object privateKey, 
                        byte[] bulkCertChain, 
                        int offset, 
                        int length) 
设置客户证书。 
参数:  
 type - 证书类型 。 
 privateKey - 私钥 。 
 bulkCertChain - 存放证书链的字节数组。  
 offset - 证书链的开始位置。  
 length - 证书链的长度。 
open 
public abstract void open() 
根据预设的条件，尝试打开一个连接。 
close 
public abstract void close() 
关闭套接字，释放分配的资源。 
send 
public abstract int send( 
byte[] buf, 
        
 
 
 
 
 
int offset, 
        
 
 
 
 
 
int length, 
        
 
 
 
 
 
int timeout) 
传输数据到远程网络节点。 
参数:  
 buf - 要发送的数据的字节数组 。 
 offset - 数据的开始位置 。 
 length - 数据的长度 。 
 timeout - 操作的超时时间，以毫秒为单位，如果为TEE_TIMEOUT_INFINITE,方法
阻塞直到所有数据发送完成 。 
中国银联 
版权所有

---
**[p108]**

107 
 
返回:  
 已发送的字节长度。 
recv 
public abstract int recv( 
 
byte[] buf, 
        
int  
offset, 
        
int  
length, 
        
int  
timeout 
) 
从远程节点接收数据。 
参数:  
 buf - 存放接收数据的字节数组。  
 offset - 数据的开始位置 。 
 length - 请求接收的字节数。  
 timeout - 操作的超时时间，以毫秒为单位，如果为TEE_TIMEOUT_INFINITE,方法
阻塞直到接收到请求长度的数据，如果为0，接收可用的数据，但最多接收length
字节数据 。 
返回:  
 实际接收数据的长度。 
ioctl 
public abstract int ioctl( 
int  protocolId, 
        int  commandCode, 
        byte[] buf, 
        int  offset, 
        int  length 
) 
提供协议特定的交互接口。 
参数:  
 protocolId - 标识命令的目标协议。  
 commandCode - 标识命令。  
 buf - 命令的输入数据 ，方法返回时存放命令的输出数据。  
 offset - 数据的开始位置，方法返回时存放命令的输出数据的开始位置。  
 length - 命令的长度。  
返回:  
 命令返回的数据的长度。 
getInstance 
public static final TLSSocket getInstance() 
创建一个TLSSocket 实例。 
中国银联 
版权所有

---
**[p109]**

108 
 
返回:  
 TLSSocket 实例。 
5.2.9.5. SocketException 
5.2.9.5.1. 声明 
java.lang.Object 
  |  
+--java.lang.Throwable  
     | 
+--java.lang.Exception  
      | 
+--java.lang.RuntimeException  
      | 
+--com.cup.tee.framework.TEERuntimeException  
      |   
+--com.cup.tee.socket.SocketException  
public class SocketException extends TEERuntimeException 
5.2.9.5.2. 描述 
套接字异常类。 
5.2.9.5.3. 字段 
——ISOCKET_ERROR_REMOTE_CLOSED 
public static int ISOCKET_ERROR_REMOTE_CLOSED 
远程主机关闭了连接。 
——ISOCKET_ERROR_PROTOCOL 
public static int ISOCKET_ERROR_PROTOCOL 
协议特定的错误。 
5.2.9.5.4. 构造器 
SocketException 
public SocketException(int sw) 
使用指定的错误码构建一个SocketException 实例， 为节省资源可使用TEE 运行环境
拥有的这个类的实例。 
5.2.9.5.5. 方法 
中国银联 
版权所有

---
**[p110]**

109 
 
throwIt 
public static void throwIt(int reason) 
使用指定的错误码抛出TEE 运行环境拥有的类SocketException 的实例。 
参数:  
 reason - N3TEE 定义的错误码 。 
抛出:  
 SocketException - 总是。 
5.2.10. com.cup.teex.debug 
5.2.10.1. 
描述 
Debug API 输出调试信息 。 
Debug 类的静态方法可用于输出指定的消息,开发阶段调试应用。 
5.2.10.2. 
Debug 
5.2.10.2.1. 声明 
java.lang.Object  
    | 
+--com.cup.tee.debug.Debug 
public class Debug extends Object 
5.2.10.2.2. 描述 
Debug 类的静态方法可用于输出指定的消息,开发阶段调试应用。 
5.2.10.2.3. 构造器 
Debug 
public Debug() 
5.2.10.2.4. 方法 
trace 
public static void trace(String message) 
输出指定调试消息。 
参数:  
 message - - 要输出的信息。 
5.2.11. com.cup.teex.nfc 
中国银联 
版权所有

---
**[p111]**

110 
 
5.2.11.1. 
描述 
NFC API 实现卡仿真模式、读写器模式以及访问连接到NFC 控制器上的SE。 
5.2.11.1.1. 卡仿真模式 
卡仿真是NFC 控制器的一个功能，使NFC 设备可仿真智能卡，下图描述了卡仿真的生命
周期。 
 
图10 卡仿真的生命周期 
 
使用CardEmulationRegistry.createCardEmulation()创建卡仿真实例： 
——启动卡仿真 
为仿真卡，客户端应用调用start()方法，当该方法成功返回时，外部读写器可启
动与仿真卡的交互。 
——应答读写器 
当命令收到命令并分析后，使用方法sendResponse()将应答发送回读写器。 
——排斥性 
     某一时刻只能仿真一种卡，如果几个应用试图同时仿真同样类型的卡，得到连接
的第一个应用具有该服务的独占使用。其他应用被拒绝。  
——停止卡仿真 
    调用方法stop()可停止卡仿真功能。 
5.2.11.1.2. 读写器模式 
中国银联 
版权所有

---
**[p112]**

111 
 
为每种类型的卡注册一个卡监听器，当NFC 控制器检查到卡时，调用卡检测事件处理程
序的方法。通过OnCardDetected 方法的连接参数Connection 接口实例的方法建立与卡的通
信。 
5.2.11.2. 
NFCService 
5.2.11.2.1. CollisionEventHandler 
5.2.11.2.1.1. 
声明 
public interface CollisionEventHandler 
5.2.11.2.1.2. 
描述 
接收卡冲突事件的事件处理程序的接口定义。 
5.2.11.2.1.3. 
方法 
onCollisionDetected 
void onCollisionDetected() 
当检测出新卡冲突时，该方法被调用。 
5.2.11.2.2. NFCController 
5.2.11.2.2.1. 
声明 
public interface NFCController 
5.2.11.2.2.2. 
描述 
该类控制NFC 控制器的硬件功能，只有系统级应用应当使用该类。 
5.2.11.2.2.3. 
方法 
reset 
void reset(NFCController.Mode mode) throws NFCException 
复位NFC 控制器。 
参数:  
 mode - 复位操作后进入控制器模式。  
(1) Mode.MAINTENANCE 维护模式, 或者。  
(2) Mode.ACTIVE 活动模式 。 
抛出:  
 IllegalArgumentException - 如果 mode 为 null 或者是错误的值。  
 IllegalStateException - reset() 复位在进行时不能被调用。  
中国银联 
版权所有

---
**[p113]**

112 
 
 NFCException - NFC 控制器出现错误。 
getFirmwareInfo 
String getFirmwareInfo(byte[] firmware) throws NFCException 
返回固件的名称以及版本。 
参数:  
 firmware - 固件缓冲区 。 
返回:  
 属性值。  
抛出:  
 IllegalArgumentException - 如果 firmware 为 null。  
 NFCException - 如果固件格式检测出错误。  
另请参阅:  
firmwareUpdate()。 
firmwareUpdate 
void firmwareUpdate(byte[] firmware, 
                  NFCController.Mode mode) 
                  throws NFCException 
更新固件或NFC 控制器的配置。  
在NFC 控制器固件可以用固件软件的一个新版本更新，固件文件应当由NFC 控制器制造
商提供。一个成功的更新操作之后，NFC 控制器重新启动，持久性信息被重置为默认值。 
如果更新未完成的，更新操作可能会失败（例如由于掉电），或者如果新的固件没有被
NFC 控制器验证（错误格式，错误版本或签名错误）。 一旦更新失败，以前版本的固件或它
的持久性数据可能会被破坏。 这可能会导致NFC 控制器无效的当前固件和NFC 控制器模式
变为 Mode.NO_FIRMWARE，如果以前版本的固件或它的持久性数据没有破坏，NFC 控制器以
模式Mode.MAINTENANCE 或 Mode.ACTIVE 重新启动。  
方法getFirmwareInfo()可检索固件文件信息。 
固件更新操作可能需要几秒钟才能完成，方法getFirmwareUpdateState()可用于跟踪
操作的进展。firmware 提供更新固件， 缓冲区的格式是专有的。方法firmwareUpdate()
从维护模式之一调用。 
参数:  
 
firmware - 固件的二进制值。  
 
mode - 更新操作后进入的NFC 控制器的模式:  
(1) Mode.MAINTENANCE 维护模式, 或者，  
(2) Mode.ACTIVE 活动模式。  
抛出:  
 
IllegalArgumentException - 如果 firmware 为 null。  
 
IllegalArgumentException - if mode 为 null 或具有错误的值。  
 
IllegalStateException - 当NFC 控制器不是维护模式之一时，调用
firmwareUpdate() 。 
 
NFCException - 具有下述错误码之一:  
(1) NFCErrorCode.TIMEOUT 与NFC 控制器通信时发生超时  
中国银联 
版权所有

---
**[p114]**

113 
 
(2) NFCErrorCode.BAD_FIRMWARE_FORMAT 固件更新缓冲区格式错误。  
(3) NFCErrorCode.BAD_FIRMWARE_VERSION 固件与NFC 控制器类型、HAL 绑定
或当前配置不兼容。 
(4) NFCErrorCode.BAD_FIRMWARE_SIGNATURE 固件更新缓冲区签名无效。  
(5) NFCErrorCode.DURING_FIRMWARE_BOOT 新固件没有正确自举。 
另请参阅:  
getFirmwareUpdateState(), getFirmwareInfo()。 
getFirmwareUpdateState 
int getFirmwareUpdateState() 
返回固件更新操作的当前进度状态。 
返回:  
 进展值是在NFC 控制器下载的固件的缓冲区中的当前字节数，这个值是零，如果没
有更新操作挂起。  
另请参阅:  
firmwareUpdate() 
getMode 
NFCController.Mode getMode() 
返回NFC 控制器的当前模式。 
返回:  
 NFC Controller Modes 描述的当前模式。 
registerExceptionEventHandler 
void registerExceptionEventHandler( 
NFCControllerExceptionEventHandler handler) 
        throws NFCException 
启动监视NFC 控制器异常。  
注册成功后，每次检测出异常处理程序被调用 unregisterExceptionEventHandler() 应
被调用注销该监听器。  
参数:  
 handler - NFCControllerExceptionEventHandler 实例，当检测出异常时其方法， 
NFCControllerExceptionEventHandler.onExceptionOccured() 将被调用。  
抛出:  
 IllegalArgumentException - 如果 handler 为 null。  
 IllegalArgumentException - 如果 handler 已经被注册。  
 NFCException - 出现注册错误。  
另请参阅:  
unregisterExceptionEventHandler(), NFCControllerExceptionEventHandler()。 
unregisterExceptionEventHandler 
void unregisterExceptionEventHandler( 
中国银联 
版权所有

---
**[p115]**

114 
 
NFCControllerExceptionEventHandler handler) 
停止使用registerExceptionEventHandler(NFCControllerExceptionEventHandler)监
视NFC 控制器异常。 
参数:  
 handler - 异常处理程序。  
抛出:  
 IllegalArgumentException - 如果 handler 为 null。  
 IllegalArgumentException - 如果 handler 已经注册。  
另请参阅:  
registerExceptionEventHandler()。 
selfTest 
void selfTest() throws NFCException 
执行NFC 控制器自检。  
该测试执行，如果测试成功则该方法无异常返回，当NFC 控制器处于维护模式时，自检必
须执行；自检的准确说明由NFC 控制器的文档提供 。 
抛出:  
 NFCException - 如果检测失败或发生错误。 
productionTest 
byte[] productionTest(byte[] testCommand) 
                      throws NFCException 
完成NFC 控制器生产测试。  
缓冲区中提供测试参数 结果缓冲区接收结果，生产测试并不总是返回测试结果，从外部
测试设备执行的测量可得到测试结果。 生产测试应当在NFC 控制器处于维护模式下执行，
任何正在进行生产测试应该在开始一个新的测试之前必须停止。生产测试以及相关参数的精
确描述由NFC 控制器的HAL 实现发行说明中提供。  
参数:  
 testCommand - 要执行的测试命令。  
返回:  
 测试命令的响应。  
抛出:  
 NFCException - 如果出现错误。 
switchStandbyMode 
void switchStandbyMode(boolean standbyOn) 
                       throws NFCException 
打开或关闭强制待机模式。  
调用switchStandbyMode() 开始切换到活动模式或待机模式. 方法的返回后，NFC 控制
器可能需要一些时间来切换到所需的模式。 See NFC Controller Modes。 
应当以下述模式之一调用:  
(1) Mode.ACTIVE,  
中国银联 
版权所有

---
**[p116]**

115 
 
(2) Mode.SWITCH_TO_STANDBY,  
(3) Mode.STANDBY, 或者，  
(4) Mode.SWITCH_TO_ACTIVE。  
参数:  
 
standbyOn - 是否强制待机模式被启用与否。  
抛出:  
 
IllegalStateException - 如果NFC 控制器是不是一个有效的模式下来调用这
个方法。  
 
NFCException - 如果待机模式不被NFC 控制器支持。 
registerCardCollisionHandler 
void registerCardCollisionHandler(CollisionEventHandler handler) 
                                  throws NFCException 
注册一个新卡冲突处理程序。  
下述条件满足时，检测到冲突:  
(1) NFC 设备在NFC 射频监听,  
(2) 检测出冲突, 并且，  
(3) 冲突解析不支持或不适用。  
那么一个事件发送到监听器，NFC 设备应当处理该事件，向用户显示如下信息 "检测到
多张卡, 请只放一张卡。  
注册成功后，每次检测新卡冲突时，处理程序被调用，方法
unregisterCardCollisionHandler() 应当被调用注销该监听器。  
参数:  
 
handler - CollisionEventHandler 实例， 当检测出冲突时，方法 
CollisionEventHandler.onCollisionDetected()将被调用。  
抛出:  
 
IllegalArgumentException - 如果 handler 为null。  
 
IllegalArgumentException - 如果 handler 已经注册。  
 
NFCException - 出现注册错误 。 
另请参阅:  
unregisterCardCollisionHandler(), CollisionEventHandler。 
unregisterCardCollisionHandler 
void unregisterCardCollisionHandler(CollisionEventHandler handler) 
注
销
使
用
registerCardCollisionHandler(com.cup.tee.nfc.NFCService.CollisionEventHandler)
注册的卡冲突处理程序。 
参数:  
 handler - 卡检测处理程序。  
抛出:  
 IllegalArgumentException - 如果handler 为 null。  
 IllegalArgumentException - 如果handler 未注册。  
另请参阅:  
中国银联 
版权所有

---
**[p117]**

116 
 
registerCardCollisionHandler()。 
5.2.11.2.3. NFCControllerExceptionEventHandler 
5.2.11.2.3.1. 
声明 
public interface NFCControllerExceptionEventHandler 
5.2.11.2.3.2. 
描述 
NFC 控制器异常处理程序实现的接口定义。 
5.2.11.2.3.3. 
方法 
onExceptionOccured 
void onExceptionOccured() 
当NFC 控制器异常被检测出，该方法被调用。 
5.2.11.2.4. NFCPriority 
5.2.11.2.4.1. 
声明 
java.lang.Object 
   |  
+--com.cup.tee.nfc. NFCService.NFCPriority 
public final class NFCPriority extends Object 
5.2.11.2.4.2. 
描述 
NFC 方法中使用的优先级值的具体常数 
5.2.11.2.4.3. 
字段 
EXCLUSIVE 
public static final int EXCLUSIVE 
独占访问，当排他性被请求，注册可接受，只有在没有其他客户已经注册此访问。 
MINIMUM 
public static final int MINIMUM 
最低优先级的共享访问。 
MAXIMUM 
public static final int MAXIMUM 
最高先级的共享访问。 
5.2.11.2.4.4. 
构造器 
NFCPriority 
中国银联 
版权所有

---
**[p118]**

117 
 
public NFCPriority() 
5.2.11.2.5. NFCManager 
5.2.11.2.5.1. 
声明 
java.lang.Object  
   | 
+--com.cup.tee.nfc.NFCService.NFCManager  
public final class NFCManager extends Object 
5.2.11.2.5.2. 
描述 
NFC Manager 是一个单实例类 ，用于访问NFC API 库。 
这个类的实例表示连接到NFC 控制器的安全模块的读写器，这些读写器可以是物理设备
或虚拟设备，它们可以是 可移动的或不可移动，它们可以包含一个安全模块，它们可以是
可移动的或不可移动的。 
5.2.11.2.5.3. 
构造器 
NFCManager 
public NFCManager() 
5.2.11.2.5.4. 
方法 
getInstance 
public static NFCManager getInstance(Object object) 
返回NFCManager 单实例。 
参数:  
 object - 提供给安全管理器盲对象。  
返回:  
 NFCManager 实例。  
抛出:  
 SecurityException - 如果检测安全问题。 
start 
public void start() throws IllegalStateException, NFCException 
启动NFC 管理器，在其他NFC 对象使用前，该方法应当被调用一次，当NFC 对象不在使用
时，调用 stop()。 
抛出:  
 IllegalStateException - 如果NFC 管理器已经启动。  
 NFCException - NFC 管理器初始化时发生错误。  
中国银联 
版权所有

---
**[p119]**

118 
 
stop 
public void stop() throws NFCException, IllegalStateException 
停止NFC 管理器， 当NFC 管理器不在使用，该方法应被调用一次，NFC 管理器会停止，
即使有异常抛出。 
抛出:  
 IllegalStateException - 如果NFC 管理器没有启动。  
 NFCException - 如果时间线程出现错误。  
另请参阅:  
start()。 
getProperty 
public String getProperty(String property) 
返回属性的字符串值，属性的定义，见 NFC Properties。 
参数:  
 property - 属性的标识符。  
返回:  
 属性的值。  
抛出:  
 IllegalArgumentException - 如果属性为 null。  
 IllegalArgumentException - 如果属性不是字符串属性。  
 SecurityException - 如果调用应用不允许访问该属性。 
getBooleanProperty 
public boolean getBooleanProperty(String property) 
返回布尔属性值，属性值的定义，见 NFC Properties。 
参数:  
 property - 属性的标识符。  
返回:  
 属性的值， false 如果属性不是布尔属性。  
抛出:  
 IllegalArgumentException - 如果属性为null。  
 SecurityException - 如果调用应用不允许访问该属性。 
getIntegerProperty 
public int getIntegerProperty(String property) 
返回整数属性，属性定义见NFC Properties。 
参数:  
 property - 属性的标识符。  
返回:  
 属性的值。  
抛出:  
 IllegalArgumentException - 如果属性为null。  
中国银联 
版权所有

---
**[p120]**

119 
 
 NumberFormatException - 如果属性不是整数属性。  
 SecurityException - 如果调用应用不允许访问该属性。 
setProperty 
public void setProperty(String property, 
               boolean value) 
设置布尔属性的值，属性的定义，见NFC Properties。 
参数:  
 property - 属性的标识符。  
 value - 属性的值。  
抛出:  
 IllegalArgumentException - 如果属性为null。  
 IllegalArgumentException - 如果属性不是布尔型属性。  
 IllegalArgumentException - 如果属性是只读的。  
 SecurityException - 如果调用应用不允许访问该属性。 
setProperty 
public void setProperty(String property, 
               int value) 
设置整数属性的值，属性定义，见 NFC Properties。 
参数:  
 property - 属性的标识符。  
 value - 属性的值。  
抛出:  
 IllegalArgumentException - 如果属性为null。  
 IllegalArgumentException - 如果属性不是整数属性。  
 IllegalArgumentException - 如果属性是只读的。  
 SecurityException - 如果调用应用不允许访问该属性。 
getCardListenerRegistry 
public CardListenerRegistry getCardListenerRegistry() 
返回卡监听器注册。 
返回:  
 卡监听器注册。  
抛出:  
 SecurityException - 如果调用应用不允许监听卡。 
getCardEmulationRegistry 
public CardEmulationRegistry getCardEmulationRegistry() 
返回卡仿真注册单实例。 
返回:  
 CardEmulationRegistry 实例。  
中国银联 
版权所有

---
**[p121]**

120 
 
抛出:  
 SecurityException - 如果调用应用不允许仿真卡。 
getReaderExs 
public ReaderEx[] getReaderExs() 
返回可用的安全模块读卡器列表，返回对象没有重复。 
返回:  
 读写器列表, 如果没有读写器，返回数组的长度为0。 
getNFCController 
public NFCController getNFCController() 
返回NFC 控制器的单实例。 
返回:  
 NFC 控制器实例。  
抛出:  
 SecurityException - 如果调用应用不允许访问硬件。 
5.2.11.2.6. NFCErrorCode 
5.2.11.2.6.1. 
声明 
java.lang.Object 
   |  
+--java.lang.Enum<NFCErrorCode>  
      | 
+--com.cup.tee.nfc. NFCService.NFCErrorCode  
public enum NFCErrorCode  extends Enum<NFCErrorCode> 
5.2.11.2.6.2. 
描述 
NFC 方法中使用的错误代码值的特定常数。 
5.2.11.2.6.3. 
枚举常量 
——VERSION_NOT_SUPPORTED 
public static final NFCErrorCode VERSION_NOT_SUPPORTED 
实现不支持请求的API 版本。 
——ITEM_NOT_FOUND 
public static final NFCErrorCode ITEM_NOT_FOUND 
指定项没有发现。 
——BUFFER_TOO_SHORT 
public static final NFCErrorCode BUFFER_TOO_SHORT 
接收结果的输出缓冲区太短。 
——PERSISTENT_DATA 
中国银联 
版权所有

---
**[p122]**

121 
 
public static final NFCErrorCode PERSISTENT_DATA 
写持久化内存错误。 
——NO_EVENT 
public static final NFCErrorCode NO_EVENT 
事件队列没有事件。 
——WAIT_CANCELLED 
public static final NFCErrorCode WAIT_CANCELLED 
等待操作取消。 
——BAD_HANDLE 
public static final NFCErrorCode BAD_HANDLE 
无效的句柄值。 
——EXCLUSIVE_REJECTED 
public static final NFCErrorCode EXCLUSIVE_REJECTED 
独占访问被拒绝，因为已经有该类型另一个注册。 
——SHARE_REJECTED 
public static final NFCErrorCode SHARE_REJECTED 
共享访问被拒绝，因为有另一个独占访问注册该类型。 
——BAD_PARAMETER 
public static final NFCErrorCode BAD_PARAMETER 
参数错误。 
——RF_PROTOCOL_NOT_SUPPORTED 
public static final NFCErrorCode RF_PROTOCOL_NOT_SUPPORTED 
指定协议不支持。 
——CONNECTION_COMPATIBILITY 
public static final NFCErrorCode CONNECTION_COMPATIBILITY 
连接不符合请求执行功能的协议。 
——BUFFER_TOO_LARGE 
public static final NFCErrorCode BUFFER_TOO_LARGE 
输入缓冲区太大。 
——INDEX_OUT_OF_RANGE 
public static final NFCErrorCode INDEX_OUT_OF_RANGE 
索引值超出这种类型的索引值的范围。 
——OUT_OF_RESOURCE 
public static final NFCErrorCode OUT_OF_RESOURCE 
执行操作的资源丢失。 
——BAD_TAG_FORMAT 
public static final NFCErrorCode BAD_TAG_FORMAT 
标签格式无效。 
——CANCEL 
public static final NFCErrorCode CANCEL 
异步操作没有执行，因为它被取消。 
——TIMEOUT 
public static final NFCErrorCode TIMEOUT 
中国银联 
版权所有

---
**[p123]**

122 
 
由于超时通信失败。 
——TAG_DATA_INTEGRITY 
public static final NFCErrorCode TAG_DATA_INTEGRITY 
数据完整性错误导致通信失败。 
——NFC_HAL_COMMUNICATION 
public static final NFCErrorCode NFC_HAL_COMMUNICATION 
NFC HAL 协议错误。 
——BAD_NFCC_MODE 
public static final NFCErrorCode BAD_NFCC_MODE 
方法在当前的NFC 控制器模式下不能执行。 
——TOO_MANY_HANDLERS 
public static final NFCErrorCode TOO_MANY_HANDLERS 
当达到最大处理程序个数时，注册方法返回错误， This error is returned by a 
registering method when the maximum number of handlers is reached. 
——BAD_STATE 
public static final NFCErrorCode BAD_STATE 
由于当前状态无效，方法不能执行。 
——BAD_FIRMWARE_FORMAT 
public static final NFCErrorCode BAD_FIRMWARE_FORMAT 
固件更新缓冲区格式错误。 
——BAD_FIRMWARE_SIGNATURE 
public static final NFCErrorCode BAD_FIRMWARE_SIGNATURE 
固件更新缓冲区签名无效。 
——DURING_HARDWARE_BOOT 
public static final NFCErrorCode DURING_HARDWARE_BOOT 
硬件不能正确自举。 
——DURING_FIRMWARE_BOOT 
public static final NFCErrorCode DURING_FIRMWARE_BOOT 
固件不能正确自举。 
——FEATURE_NOT_SUPPORTED 
public static final NFCErrorCode FEATURE_NOT_SUPPORTED 
请求的功能不支持。 
——CLIENT_SERVER_PROTOCOL 
public static final NFCErrorCode CLIENT_SERVER_PROTOCOL 
客户-服务器协议错误。 
——FUNCTION_NOT_SUPPORTED 
public static final NFCErrorCode FUNCTION_NOT_SUPPORTED 
当前版本的实现不支持该方法。 
——SYNC_OBJECT 
public static final NFCErrorCode SYNC_OBJECT 
操作系统的同步功能返回的错误。 
——RETRY 
public static final NFCErrorCode RETRY 
中国银联 
版权所有

---
**[p124]**

123 
 
临时错误码, 调用者应重新调用。 
——DRIVER 
public static final NFCErrorCode DRIVER 
驱动返回的错误。 
——MISSING_INFO 
public static final NFCErrorCode MISSING_INFO 
信息丢失导致的错误。 
——NFCC_COMMUNICATION 
public static final NFCErrorCode NFCC_COMMUNICATION 
NFC 控制器通信错误。 
——RF_COMMUNICATION 
public static final NFCErrorCode RF_COMMUNICATION 
射频接口通信错误. 在协议任何级。 
——BAD_FIRMWARE_VERSION 
public static final NFCErrorCode BAD_FIRMWARE_VERSION 
固件与NFC 控制器类型或NFC HAL 实现兼容。 
——HETEROGENEOUS_DATA 
public static final NFCErrorCode HETEROGENEOUS_DATA 
无法提供所需的信息，通常是由于不存在一个唯一值适用于所有指定的范围。 
——CLIENT_SERVER_COMMUNICATION 
public static final NFCErrorCode CLIENT_SERVER_COMMUNICATION 
客户-服务器错误。 
——SECURITY 
public static final NFCErrorCode SECURITY 
安全错误。 
——PROGRAMMING 
public static final NFCErrorCode PROGRAMMING 
编程错误。 
5.2.11.2.6.4. 
方法 
values 
public static NFCErrorCode[] values() 
按照声明该枚举类型的常量的顺序, 返回包含这些常量的数组。该方法可用于迭代常量, 
如下所示:  
for (NFCErrorCode c : NFCErrorCode.values()) 
    System.out.println(c); 
返回:  
 按照声明该枚举类型的常量的顺序返回的包含这些常量的数组。 
valueOf 
public static NFCErrorCode valueOf(String name) 
返回带有指定名称的该类型的枚举常量。字符串必须与用于声明该类型的枚举常量的标识
中国银联 
版权所有

---
**[p125]**

124 
 
符完全匹配。(不允许有多余的空格字符)。 
参数:  
 name - 要返回的枚举常量的名称。  
返回:  
 返回带有指定名称的枚举常量  
抛出:  
 IllegalArgumentException - 如果该枚举类型没有带有指定名称的常量。  
 NullPointerException - 如果参数为空值。 
getCode 
public static NFCErrorCode getCode(int value) 
返回错误码的错误值。 
参数:  
 value - 错误值。  
返回:  
 错误码。 
5.2.11.2.7. NFCException 
java.lang.Object 
   | 
+--java.lang.Throwable  
      |  
+--java.lang.Exception  
     | 
+--com.cup.tee.nfc. NFCService.NFCException  
5.2.11.2.7.1. 
声明 
public final class NFCException extends Exception 
5.2.11.2.7.2. 
描述 
NFC API 检测出错误时抛出NFCException。 
5.2.11.2.7.3. 
构造器 
NFCException 
public NFCException(String message, NFCErrorCode code) 
创建一个新的NFC 异常。 
参数:  
 message - 异常消息。 
 code - 导致异常的错误码。 
NFCException 
public NFCException(NFCErrorCode code) 
中国银联 
版权所有

---
**[p126]**

125 
 
创建一个新的NFC 异常。 
参数:  
 code - 导致异常的错误码。 
5.2.11.2.7.4. 
方法 
getCode 
public NFCErrorCode getCode() 
返回导致异常的错误码。 
返回:  
 错误码。 
toString 
public String toString() 
返回异常的字符串值。 
返回:  
 异常的字符串表示。 
getMessage 
public String getMessage() 
返回异常的消息。 
返回:  
 异常的消息, null 如果没有消息。 
5.2.11.2.8. NFCController.Mode 
5.2.11.2.8.1. 
声明 
java.lang.Object  
   | 
+--java.lang.Enum<NFCController.Mode>  
      | 
+--com.cup.tee.nfc. NFCService.NFCController.Mode   
 
public static enum NFCController.Mode  extends Enum<NFCController.Mode> 
5.2.11.2.8.2. 
描述 
5.2.11.2.8.3. 
枚举常量 
——BOOT_PENDING 
public static final NFCController.Mode BOOT_PENDING 
一个引导过程被挂起。 
中国银联 
版权所有

---
**[p127]**

126 
 
——MAINTENANCE 
public static final NFCController.Mode MAINTENANCE 
维护模式, 固件可以被使用。 
——NO_FIRMWARE 
public static final NFCController.Mode NO_FIRMWARE 
维护模式, 没有固件呈现。 
——FIRMWARE_NOT_SUPPORTED 
public static final NFCController.Mode FIRMWARE_NOT_SUPPORTED 
维护模式, 固件版本不被栈支持。 
——NOT_RESPONDING 
public static final NFCController.Mode NOT_RESPONDING 
NFC 控制器没有挂起。 
——LOADER_NOT_SUPPORTED 
public static final NFCController.Mode LOADER_NOT_SUPPORTED 
加载器的版本不支持。 
——ACTIVE 
public static final NFCController.Mode ACTIVE 
NFC 控制器不活动。 
——SWITCH_TO_STANDBY 
public static final NFCController.Mode SWITCH_TO_STANDBY 
NFC 控制器从活动模式切换待机模式。 
——STANDBY 
public static final NFCController.Mode STANDBY 
NFC 控制器处于待机模式。 
——SWITCH_TO_ACTIVE 
public static final NFCController.Mode SWITCH_TO_ACTIVE 
NFC 控制器从待机模式切换到活动模式。 
5.2.11.2.8.4. 
方法 
values 
public static NFCController.Mode[] values() 
按照声明该枚举类型的常量的顺序, 返回包含这些常量的数组；该方法可用于迭代常量, 
如下所示:  
for (NFCController.Mode c : NFCController.Mode.values()) 
    System.out.println(c); 
返回:  
按照声明该枚举类型的常量的顺序返回的包含这些常量的数组。 
valueOf 
public static NFCController.Mode valueOf(String name) 
返回带有指定名称的该类型的枚举常量。字符串必须与用于声明该类型的枚举常量的标识
符完全匹配。(不允许有多余的空格字符)。 
中国银联 
版权所有

---
**[p128]**

127 
 
参数:  
 name - 要返回的枚举常量的名称。  
返回:  
 返回带有指定名称的枚举常量  
抛出:  
 IllegalArgumentException - 如果该枚举类型没有带有指定名称的常量。  
 NullPointerException - 如果参数为空值。 
getValue 
public int getValue() 
 返回模式值。 
5.2.11.3. 
CardEmulation 
5.2.11.3.1. ConnectionProperty 
5.2.11.3.1.1. 
声明 
java.lang.Object  
  |  
+--java.lang.Enum<ConnectionProperty>  
      | 
+--com.cup.tee.nfc. CardEmulation.ConnectionProperty  
 
public enum ConnectionProperty  extends Enum<ConnectionProperty> 
5.2.11.3.1.2. 
描述 
连接属性是描述一个连接的功能的常数值。  
连接属性可以是:  
 
支持的协议,  
 
标签的格式, 或者。  
 
标签的物理类型。  
卡属性用于使用CardListenerRegistry.registerCardListener() 注册一个卡检测
事件处理程序，当收到卡连接时，Connection.getProperties() 或者 
Connection.checkProperty() 返回或检查卡的属性。 
对于卡检测功能，方法 CardListenerRegistry.checkConnectionProperty() 检查
一个属性是否被NFC 控制器支持。 
连接属性也用于卡仿真API，它们需要指定请求的卡仿真类型，对于卡仿真功能，
方法  
CardEmulationRegistry.checkConnectionProperty() 检查属性是否被NFC 控制器支
持。 
中国银联 
版权所有

---
**[p129]**

128 
 
5.2.11.3.1.3. 
枚举常量 
——ISO_14443_3_A 
public static final ConnectionProperty ISO_14443_3_A 
使用协议ISO 14443 part 3 type A 通信。 
——ISO_14443_4_A 
public static final ConnectionProperty ISO_14443_4_A 
使用协议ISO 14443 part 4 type A 通信。 
——ISO_14443_3_B 
public static final ConnectionProperty ISO_14443_3_B 
使用协议ISO 14443 part 3 type B 通信。 
——ISO_14443_4_B 
public static final ConnectionProperty ISO_14443_4_B 
使用协议ISO 14443 part 4 type B 通信。 
——ISO_7816_4 
public static final ConnectionProperty ISO_7816_4 
使用协议 ISO 7816 part 4 通信。 
5.2.11.3.1.4. 
方法 
values 
public static ConnectionProperty[] values() 
按照声明该枚举类型的常量的顺序,返回包含这些常量的数组。该方法可用于迭代常量, 
如下所示:  
for (ConnectionProperty c : ConnectionProperty.values()) 
    System.out.println(c); 
返回:  
 按照声明该枚举类型的常量的顺序返回的包含这些常量的数组。 
valueOf 
public static ConnectionProperty valueOf(String name) 
返回带有指定名称的该类型的枚举常量，字符串必须与用于声明该类型的枚举常量的标识
符完全匹配(不允许有多余的空格字符)。 
参数:  
 name - 要返回的枚举常量的名称。  
返回:  
 返回带有指定名称的枚举常量。 
抛出:  
 IllegalArgumentException - 如果该枚举类型没有带有指定名称的常量。  
 NullPointerException - 如果参数为空值。 
getValue 
public int getValue() 
中国银联 
版权所有

---
**[p130]**

129 
 
返回属性的值。 
返回:  
 属性值。 
getName 
public String getName() 
返回属性名。 
返回:  
 属性名。 
getConnectionProperty 
public static ConnectionProperty getConnectionProperty(int identifier) 
返回标识符对应的连接属性。 
参数:  
 identifier - 属性标识符。 
返回:  
 连接属性。 
 
5.2.11.3.2. CardDetectionEventHandler 
5.2.11.3.2.1. 
声明 
public interface CardDetectionEventHandler 
5.2.11.3.2.2. 
描述 
每次指定类型的卡被检测到后回调方法被调用的接口定义。 
5.2.11.3.2.3. 
方法 
onCardDetected 
void onCardDetected(Connection connection) 
当新卡被检测到时，该方法被调用. 方法的实现应调用 Connection.getProperties() 
或 Connection.checkProperty() 检查卡的类型并执行必要的操作。 
参数:  
 
connection - 与卡的连接。 
onCardDetectedError 
void onCardDetectedError(NFCErrorCode what) 
检查期间发生错误，该方法被调用。 
参数:  
 what - 发生错误的类型。 
中国银联 
版权所有

---
**[p131]**

130 
 
5.2.11.3.3. CardEmulation 
5.2.11.3.3.1. 
声明 
public interface CardEmulation 
5.2.11.3.3.2. 
描述 
卡仿真是NFC 控制器一个功能，用于NFC 设备仿真智能卡。  
5.2.11.3.3.3. 
方法 
start 
void start(CardEmulationEventHandler handler) throws NFCException 
启动卡仿真。 
参数:  
 handler - CardEmulationEventHandler 收到每个事件时其方法 
onEventReceived()将被调用， 收到每条命令时其方法 onCommandReceived()
将被调用。  
抛出:  
 IllegalArgumentException - 如果 handler 为 null。  
 IllegalStateException - 如果 仿真已经启动。  
 NFCException - 出现NFC 错误时抛出。 
stop 
void stop() 
停止卡仿真. 如果仿真已经停止, 该方法什么也不做。 
sendResponse 
void sendResponse(byte[] response)  throws NFCException 
向读卡器发送仿真卡的应答信息。 
参数:  
 response - 存放发送到读卡器的应答数据的缓冲区。  
抛出:  
 IllegalArgumentException - 如果 response 为 null。  
 NFCException - 如果卡仿真停止或发生NFC 错误。 
5.2.11.3.4. CardEmulationEventHandler 
5.2.11.3.4.1. 
声明 
public interface CardEmulationEventHandler 
中国银联 
版权所有

---
**[p132]**

131 
 
5.2.11.3.4.2. 
描述 
用于接受来自CardEmulation的通知的接口定义 如果CardEmulationEventHandler使用方
法CardEmulation.start(com.cup.tee.nfc.CardEmulation.CardEmulationEventHandler)
被注册到卡仿真注册表，这些回调方法被调用。 
5.2.11.3.4.3. 
字段 
——SELECTION 
static final int SELECTION 
卡仿真被外部读卡器选择。 
——DEACTIVATE 
static final int DEACTIVATE 
卡仿真被取消选择或场被切断。 
5.2.11.3.4.4. 
方法 
onEventReceived 
void onEventReceived(int event) 
从读卡器收到事件时，该方法被调用。 
参数:  
 event - 事件的值: SELECTION 或者 DEACTIVATE。 
onCommandReceived 
void onCommandReceived(byte[] command) 
卡从读卡器收到命令时，该方法被调用. 使用 CardEmulation.sendResponse()向读卡器
发送应答。 
参数:  
 command - 从读卡器接收到的命令。 
5.2.11.3.5. CardEmulationRegistry 
5.2.11.3.5.1. 
声明 
public interface CardEmulationRegistry 
5.2.11.3.5.2. 
描述 
卡仿真注册表用于注册一个卡仿真。 
5.2.11.3.5.3. 
方法 
createCardEmulation 
CardEmulation createCardEmulation( 
中国银联 
版权所有

---
**[p133]**

132 
 
ConnectionProperty cardType,  
byte[]   
 
identifier 
) 
创建一个卡仿真实例。  
卡仿真将启动仅当 方法CardEmulation.start()被调用。 
参数:  
 cardType - 要创建的卡类型:  
 ConnectionProperty.ISO_14443_4_A ISO 14443-4 A 卡类型, 或者  
 ConnectionProperty.ISO_14443_4_B ISO 14443-4 B 卡类型。 
 identifier - 卡标识. 对于类型A, 标识符的字节长度可以是4, 7 或 10 字节， 
对于类型B, 标识符的字节长度应当是4。  
返回:  
 卡仿真实例。  
抛出:  
 SecurityException - 如果应用不允许实现卡仿真。  
 IllegalArgumentException - 如果 cardType 或者 identifier 为 null。  
 IllegalArgumentException - 如果 cardType 未知 或者 identifier 的长度与
卡类型不兼容。 
createCardEmulation 
CardEmulation createCardEmulation( 
ConnectionProperty cardType, 
        int   
 
 
randomIdentifierLength 
) 
创建一个卡仿真实例 。 
卡仿真将启动仅当 方法CardEmulation.start()被调用。 
参数:  
 cardType - 要创建的卡类型:  
 ConnectionProperty.ISO_14443_4_A ISO 14443-4 A 卡类型, 或者  
 ConnectionProperty.ISO_14443_4_B ISO 14443-4 B 卡类型。  
 randomIdentifierLength - 每次读卡器选择时，随机生成的标识符的字节长度 对
于类型 A, 标识符的字节长度可以是4, 7 或 10 字节. 对于类型 B, 标识符的
字节长度应当是4。  
返回:  
 卡仿真实例。  
抛出:  
 SecurityException - 如果应用不允许实现卡仿真。  
 IllegalArgumentException - 如果cardType 为 null。  
 IllegalArgumentException 
- 
如
果
cardType 
未
知
，
或
者 
randomIdentifierLength 与卡类型不兼容。 
checkConnectionProperty 
boolean checkConnectionProperty(ConnectionProperty property) 
中国银联 
版权所有

---
**[p134]**

133 
 
检查NFC 控制器对于卡仿真功能是否支持指定的连接属性。 
参数:  
 property - 待检查的连接属性 。 
返回:  
 true 如果NFC 控制器支持该连接属性 false 如果NFC 控制器不支持该连接属性。  
抛出:  
 IllegalArgumentException - 如果属性为null。 
5.2.11.3.6. CardListenerRegistry 
5.2.11.3.6.1. 
声明 
public interface CardListenerRegistry 
5.2.11.3.6.2. 
描述 
监听卡检查事件的接口。 
5.2.11.3.6.3. 
方法 
registerCardListener 
void registerCardListener( 
int  
 
 
 
 
 
priority,  
        CardDetectionEventHandler  handler 
) throws NFCException 
为每种卡类型注册一个新卡监听器 ，一旦检测处理程序被注册，NFC 控制器为每种类
型的卡自动执行检查序列， NFC 控制器以低功率检测序列定期扫描射频场，如果卡被检测
到，事件处理程序被调用；每次新卡被检测出，事件处理程序被重新调用。  
unregisterCardListener() 应被调用注销注册的监听器。  
处
理
器
方
法
可
使
用
方
法
 
Connection.checkProperty() 
或
者 
Connection.getProperties() 检测连接的属性。  
参数:  
 
priority - 用于监听卡的优先级的值必须在NFCPriority.MINIMUM 和 
NFCPriority.MAXIMUM 之间 值NFCPriority.EXCLUSIVE 请求独占访问，如果已经
注册了某类型或子类型，请求此类型的独占访问会返回错误 
NFCPriority.EXCLUSIVE 如果已经注册了某类型或子类型的独占访问，请求此类型
的共享访问会返回错误 NFCErrorCode.SHARE_REJECTED。 
 
handler - CardDetectionEventHandler 实例，每次与新卡连接时，方法 
onCardDetected() 将被调用。 
抛出:  
 
SecurityException - 如果优先级是 NFCPriority.MAXIMUM 或 
NFCPriority.EXCLUSIVE. 而调用的方法不允许使用这些优先级值。  
 
IllegalArgumentException - 如果 handler 为 null。  
 
IllegalArgumentException - 如果 handler 已经被注册。  
中国银联 
版权所有

---
**[p135]**

134 
 
 
IllegalArgumentException - 如果 priority 是无效的。  
 
NFCException - 当优先级错误或注册错误发生时抛出。  
另请参阅:  
unregisterCardListener(), CardDetectionEventHandler。 
registerCardListener 
void registerCardListener( 
int  
 
 
 
 
 
priority, 
        ConnectionProperty[]   
properties, 
        CardDetectionEventHandler  handler 
) throws NFCException 
为特定类型卡注册一个新卡监听器，一旦检测处理程序被注册，NFC 控制器为每种类型
的卡自动执行检查序列 NFC 控制器以低功率检测序列定期扫描射频场；如果卡被检测到，
事件处理程序被调用；每次新卡被检测出，事件处理程序被重新调用。  
unregisterCardListener() 应被调用注销注册的监听器  
参数properties 定义检查的卡类型，返回到处理程序的连接应至少有一个在 
properties 定义的属性，可以有其他属性。  
如果properties 指定的属性不支持，该属性忽略，如果所有属性未知或不支持, 事件
处理程序不被调用， 使用 checkConnectionProperty() 检查属性是否被NFC 控制器支持。  
事件处理程序可使用方法 Connection.checkProperty() 或者 
Connection.getProperties() 得到或检查连接的属性，然后事件处理程序应完成必要的操
作以决定卡是否由该事件处理程序管理。  
如果卡是正确的类型，事件处理程序执行与卡的通信，方法应调用方法
Connection.close(boolean,boolean)，参数cardApplicationMatch 设置为true 以阻止未
知卡检测程序被调用。  
如果卡不是正确的类型，应调用Connection.close(boolean,boolean) ，参数
cardApplicationMatch 设置为false，giveToNextListener 设置为true； 这将导致另一个
处理程序被调用。 
处理程序应当调用方法 Connection.close(boolean,boolean)通知框架与卡的工作终
止 ，Connection.close(boolean,boolean) 关闭与卡的连接。  
如果卡连接应转移到其他处理程序，该函数应调用方法
Connection.close(boolean,boolean)，giveToNextListener 参数设置为true 否则该函数
应设置giveToNextListener 为false 阻止与卡进一步的通信。  
参数:  
 
priority - 用于监听卡的优先级的值必须在NFCPriority.MINIMUM 和 
NFCPriority.MAXIMUM 之间 值NFCPriority.EXCLUSIVE 请求独占访问，如果已经
注册了某类型或子类型，请求此类型的独占访问会返回错误 
NFCPriority.EXCLUSIVE 如果已经注册了某类型或子类型的独占访问，请求此类型
的共享访问会返回错误 NFCErrorCode.SHARE_REJECTED 。 
 
properties - 定义那些类型卡应当被检测的属性数组，数据可包含一个或多个 在
ConnectionProperty 定义的属性。  
 
handler - CardDetectionEventHandler 实例，每次与新卡连接时其方法 
onCardDetected() 将被调用。  
中国银联 
版权所有

---
**[p136]**

135 
 
抛出:  
 
SecurityException - 如果优先级是 NFCPriority.MAXIMUM
或者 
NFCPriority.EXCLUSIVE 以及调用应用不允许使用这些优先级参数值。  
 
IllegalArgumentException - 如果 properties 或者 handler 为 null。  
 
IllegalArgumentException - 如果 handler 已经注册。  
 
IllegalArgumentException - 如果 priority 无效。  
 
NFCException - 出现优先级错误或注册错误。  
另请参阅:  
unregisterCardListener(), CardDetectionEventHandler, ConnectionProperty, 
checkConnectionProperty() 
unregisterCardListener 
void unregisterCardListener(CardDetectionEventHandler handler) 
注销使用registerCardListener()注册的卡监听器。 
参数:  
 handler - 卡检测处理程序 。 
抛出:  
 IllegalArgumentException - 如果 handler 为 null。  
 IllegalArgumentException - 如果 handler 未注册。  
另请参阅:  
registerCardListener() 
checkConnectionProperty 
boolean checkConnectionProperty(ConnectionProperty property) 
检查NFC 控制器的卡监听功能是否支持某个连接属性。 
参数:  
 property - 待检查的连接属性 。 
返回:  
 true 如果连接类型被NFC 控制器支持 false 如果此类连接不支持。  
抛出:  
 IllegalArgumentException - 如果property 为 null。 
 
5.2.11.3.7. Connection 
5.2.11.3.7.1. 
声明 
public interface Connection 
 
所有已知子接口:  
ISO14443Part3AConnection, 
ISO14443Part3BConnection, 
ISO14443Part4AConnection, 
ISO14443Part4BConnection, ISO7816Part4Connection  
中国银联 
版权所有

---
**[p137]**

136 
 
5.2.11.3.7.2. 
描述 
接口connection 用于与卡建立连接。 
5.2.11.3.7.3. 
方法 
getIdentifier 
byte[] getIdentifier() 
返回连接的标识符。  
标识符的类型依赖连接使用的协议:  
 对于ISO 14443 A 协议时UID ； 
 对于协议 ISO 14443 B 是PUPI；  
返回:  
 连接的物理标识符 。 
抛出:  
 IllegalStateException - 如果连接关闭。 
exchangeData 
byte[] exchangeData(byte[] command) throws NFCException 
完成本地设备与卡的数据交换. 这种类型的连接使用通信协议是缺省协议。 
参数:  
 command - 发送到卡的命令. 命令可以是null 或者 空。  
返回:  
 从卡收到的响应. 响应可为空。  
抛出:  
 IllegalStateException - 如果connection 被关闭。  
 NFCException - 如果发生通信错误。 
exchangeData 
byte[] exchangeData( 
ConnectionProperty protocol, 
        byte[]   
 
command) throws NFCException 
使用指定的协议完成本地设备与卡的数据交换。 
参数:  
 protocol - 与卡通信的协议。  
 command - 发送到卡的命令. 命令可以是null 或者 空。  
返回:  
 从卡收到的响应. 响应可为空。  
抛出:  
 IllegalArgumentException - 如果 protocol 为null。  
 IllegalStateException - 如果连接关闭。  
 NFCException - 如果协议与连接不兼容或发生通信错误。 
中国银联 
版权所有

---
**[p138]**

137 
 
getProperties 
ConnectionProperty[] getProperties() 
检索连接关联的不同属性。 
返回:  
 连接属性 。 
抛出:  
 IllegalStateException - 如果连接被关闭。 
checkProperty 
boolean checkProperty(ConnectionProperty property) 
检测一个属性是否在连接中出现。 
参数:  
 property - 待检查的属性。  
返回:  
 true 如果属性出现。  
抛出:  
 IllegalArgumentException - 如果 property 为 null。  
 IllegalStateException - 如果 connection 关闭。 
previousApplicationMatch 
boolean previousApplicationMatch() 
检测是否这个连接是以前另一个监听器使用并由参数cardApplicationMatch 设置为
true 关闭。  
这个信息对为卡实现缺省应用是用用的，通过使用低优先级注册一个监听器，缺省应用
可监听某些卡类型， 当缺省应用接收到卡连接，使用previousApplicationMatch()检查卡
是否由更高优先级的监听器使用，如果没有使用 应用为卡执行缺省的活动。  
返回:  
 
true 如果卡由另一个监听器使用, 否则为false。 
close 
void close(boolean giveToNextListener, boolean cardApplicationMatch) 
通知框架在连接上执行的工作终止，连接将被关闭并不在可用，如果连接已经关闭, 这个
调用没效果。 
参数:  
 giveToNextListener - 通知框架是否卡连接可交给下一个该类型注册的卡监听
器。  
 cardApplicationMatch - 通知框架当前的卡监听器在卡上发现有用的内容，因此
未知的卡监听器将不被调用。 
close 
void close() 
通知框架在连接上执行的工作终止，连接将被关闭并不在可用，如果连接已经关闭, 这个
中国银联 
版权所有

---
**[p139]**

138 
 
调用没有效果，等价于 close( true, true )。  
registerEventHandler 
void registerEventHandler(ConnectionEventHandler handler) 
为这个连接注册一个事件处理程序。 
参数:  
 handler - 注册的事件处理程序。  
抛出:  
 IllegalArgumentException - 如果 handler 为 null。  
 IllegalStateException - 一个事件处理程序已经为这个槽注册。 
unregisterEventHandler 
void unregisterEventHandler(ConnectionEventHandler handler) 
注销为这个连接注册的事件处理程序。 
参数:  
 handler - 要注销的事件处理程序。  
抛出:  
 IllegalArgumentException - 如果 handler 为 null 或者不是注册的处理程序。  
 IllegalStateException - 如果没有任何事件处理程序为这个连接注册。 
5.2.11.3.8. ConnectionEventHandler 
5.2.11.3.8.1. 
声明 
public interface ConnectionEventHandler 
5.2.11.3.8.2. 
描述 
当卡被移除时被回调的接口定义。  
5.2.11.3.8.3. 
方法 
onCardRemoved 
void onCardRemoved() 
当卡移走时，该方法被调用。 
5.2.11.3.9. ISO14443Part3AConnection 
5.2.11.3.9.1. 
声明 
public interface ISO14443Part3AConnection extends Connection 
 
所有超级接口:  
中国银联 
版权所有

---
**[p140]**

139 
 
Connection 
5.2.11.3.9.2. 
描述 
该类可访问ISO 14443 协议第3 部分类型 A。 
5.2.11.3.9.3. 
方法 
getAtqa 
short getAtqa() 
返回ATQA 值。  
请求包含如下信息类型A 代码的应答：  
(1) 防碰撞帧,  
(2) UID 大小, 以及，  
(3) 专有的位。  
返回:  
 ATQA 值。  
抛出:  
 IllegalStateException - 如果连接关闭。 
getSak 
byte getSak() 
返回SAK 值，Select Acknowledge Type A 字节确定是否 UID 完整，且卡符合ISO/IEC 
14443-4 协议。 
返回:  
 SAK 字节值。  
抛出:  
 IllegalStateException - 如果连接关闭。 
exchangeDataRawBits 
int exchangeDataRawBits( 
byte[] rawCommand, 
        int  lastByteBitNumber, 
        byte[] responseBuffer, 
        int  expectedBits) 
        throws NFCException 
交换原命令， 没有奇偶校验或CRC 自动包括. 
参数:  
 rawCommand - 原位命令缓冲区。  
 lastByteBitNumber - 最后一个字节使用的位数，该值必须包含在 [1-8].  
 responseBuffer - 输出缓冲区。  
 expectedBits - 当用户知道预期的应答将不包含至少8个比特的数据 该参数必须
设置接收的位数（有效值是[1-7]） ， 其他情况下，该参数必须设置为0 。 
中国银联 
版权所有

---
**[p141]**

140 
 
返回:  
 输出缓冲区的位长度。  
抛出:  
 IllegalArgumentException - 如果 rawCommand 或 responseBuffer 为 null。  
 NFCException - 如果 发生通信错误。 
5.2.11.3.10. 
ISO14443Part3BConnection 
5.2.11.3.10.1. 声明 
public interface ISO14443Part3BConnection extends Connection 
 
所有超级接口:  
Connection  
5.2.11.3.10.2. 描述 
该类用于访问ISO 14443 协议第 4 部分 类型 B。 
5.2.11.3.10.3. 方法 
setTimeout 
void setTimeout(int timeout) 
设置 ISO 14443-3B 射频超时。 
参数:  
 timeout - 超时值（以毫秒为单位）。  
抛出:  
 IllegalStateException - 连接关闭。 
getAtqb 
byte[] getAtqb() 
返回卡返回的12 字节的ATQB。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getAfi 
byte getAfi() 
返回AFI 值. 应用系列标识符用于选择卡，该值被包括在ATQB 帧，在应用程序数据字段。 
抛出:  
 IllegalStateException - 如果连接关闭。 
isCidSupported 
boolean isCidSupported() 
中国银联 
版权所有

---
**[p142]**

141 
 
返回一个标志，指示是否支持该CID。true，如果支持，false，如果不支持。 该CID 的
值由字段nMBLI_CID 给出，这个值是由卡返回的ATQB 框架中的协议数据的FO 位返回。 
抛出:  
 IllegalStateException - 如果连接关闭。 
isNadSupported 
boolean isNadSupported() 
返回一个标志，指示是否支持NAD，true 支持NAD，false 不支持NAD，这个值是由卡返
回的ATQB 框架中的协议数据的FO 位返回。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getCardInputBufferSize 
int getCardInputBufferSize() 
返回卡输入缓冲区大小. 该数据由ATQB 框架中的协议数据返回 
抛出:  
 IllegalStateException - 如果连接关闭。 
getReaderInputBufferSize 
int getReaderInputBufferSize() 
返回卡读卡器输入缓冲区大小，该值总是256，该值通过ATTRIB 帧发送到卡中。 
抛出:  
 IllegalStateException - 如果连接关闭. 
getBaudRate 
int getBaudRate() 
返回PICC 与PCD 连接双向通信的波特率（kbits/s），该值由NFC 控制器与卡计算出。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getTimeout 
int getTimeout() 
返回当前的超时值，该值由包括在ATQB 中的值初始化，这个值可通过方法setTimeout(int)
更改。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getHigherLayerData 
byte[] getHigherLayerData() 
返回ATTRIB 帧中发送到卡的高层数据，该值可选，如果出现包括 ISO 14443-4 数据。 
抛出:  
中国银联 
版权所有

---
**[p143]**

142 
 
 IllegalStateException - 如果连接关闭。 
getHigherLayerResponse 
byte[] getHigherLayerResponse() 
返回卡返回的ATTRIB 应答帧中包括高层应答数据，该值可选，如果出现包括 ISO 14443-4 
应答。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getMbliCid 
byte getMbliCid() 
返回卡返回的ATTRIB 应答帧中包括MBLI-CID 字节。 
抛出:  
 IllegalStateException - 如果连接关闭。 
5.2.11.3.11. 
ISO14443Part4AConnection 
5.2.11.3.11.1. 声明 
public interface ISO14443Part4AConnection extends Connection 
 
所有超级接口:  
Connection  
5.2.11.3.11.2. 描述 
该类用于访问ISO 14443 协议 第 4 部分 类型 A。 
5.2.11.3.11.3. 方法 
setNad 
void setNad(byte nad) 
设置NAD 值。 
参数:  
 nad - 待设置NAD 的值。  
抛出:  
 IllegalStateException - 如果连接关闭。 
isCidSupported 
boolean isCidSupported() 
返回一个标志，指示是否支持CID，true 支持CID，false 不支持CID，当前值通过调用
方法getCid()给出， 这个值通过卡返回的ATS 帧返回。 
抛出:  
中国银联 
版权所有

---
**[p144]**

143 
 
 IllegalStateException - 如果连接关闭。 
getCid 
byte getCid() 
返回卡标识符（CID），如果CID 不支持CID，该值返回0，该值通过RATS 帧发送到卡中。 
抛出:  
 IllegalStateException - 如果连接关闭。 
isNadSupported 
boolean isNadSupported() 
返回一个标志，指示是否支持NAD，true 支持NAD，false 不支持NAD，当前值通过调用
方法getNad()给出， 这个值通过卡返回的ATS 帧返回。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getNad 
byte getNad() 
返回NAD 的当前值，如果NAD 不支持，该值返回0。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getApplicationData 
byte[] getApplicationData() 
返回包含历史字节的应用数据数组，该值由卡在ATS 帧中返回。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getCardInputBufferSize 
int getCardInputBufferSize() 
返回卡输入缓冲区的大小，该值由卡在ATS 帧中返回。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getReaderInputBufferSize 
int getReaderInputBufferSize() 
返回读卡器输入缓冲区的大小，该值通过RATS 帧发送卡中。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getFwiSfgi 
byte getFwiSfgi() 
中国银联 
版权所有

---
**[p145]**

144 
 
返回FWI 和SFGI 的值。该帧等待时间整数（最有意义半字节）和启动帧保护时间整数（最
有意义半字节）被用来定义分别定义FWI 和SFGT，这个值是 由卡在ATS 帧中返回。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getTimeout 
int getTimeout() 
返回连接的当前超时值，该值由包含在ATS 中的数据初始化。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getDataRateMaxDiv 
byte getDataRateMaxDiv() 
返回的数据速率最大值。数据传输速率除数编码两个方向的比特率能力：PICC 到PCD 以
及PPCD 到PICC。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getBaudRate 
int getBaudRate() 
返回PICC 与PCD 连接之间双向波特率（kbits/s）。 
抛出:  
 IllegalStateException - 如果连接关闭。 
5.2.11.3.12. 
ISO14443Part3BConnection 
5.2.11.3.12.1. 声明 
public interface ISO14443Part3BConnection extends Connection 
 
所有超级接口:  
Connection 
5.2.11.3.12.2. 描述 
该类用于访问ISO 14443 协议第 4 部分 类型 B。 
5.2.11.3.12.3. 方法 
setTimeout 
void setTimeout(int timeout) 
设置 ISO 14443-3B 射频超时。 
参数:  
中国银联 
版权所有

---
**[p146]**

145 
 
 timeout - 超时值（以毫秒为单位）。  
抛出:  
 IllegalStateException - 连接关闭。 
getAtqb 
byte[] getAtqb() 
返回卡返回的12 字节的ATQB 。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getAfi 
byte getAfi() 
返回AFI 值. 应用系列标识符用于选择卡，该值被包括在ATQB 帧，在应用程序数据字段。 
抛出:  
 IllegalStateException - 如果连接关闭。 
isCidSupported 
boolean isCidSupported() 
返回一个标志，指示是否支持该CID。true，如果支持，false，如果不支持。 该CID 的
值由字段nMBLI_CID 给出，这个值是由卡返回的ATQB 框架中的协议数据的FO 位返回。 
抛出:  
 IllegalStateException - 如果连接关闭。 
isNadSupported 
boolean isNadSupported() 
返回一个标志，指示是否支持NAD，true 支持NAD，false 不支持NAD，这个值是由卡返
回的ATQB 框架中的协议数据的FO 位返回。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getCardInputBufferSize 
int getCardInputBufferSize() 
返回卡输入缓冲区大小. 该数据由ATQB 框架中的协议数据返回。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getReaderInputBufferSize 
int getReaderInputBufferSize() 
返回卡读卡器输入缓冲区大小，该值总是256，该值通过ATTRIB 帧发送到卡中。 
抛出:  
 IllegalStateException - 如果连接关闭。 
中国银联 
版权所有

---
**[p147]**

146 
 
getBaudRate 
int getBaudRate() 
返回PICC 与PCD 连接双向通信的波特率（kbits/s），该值由NFC 控制器与卡计算出。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getTimeout 
int getTimeout() 
返回当前的超时值，该值由包括在ATQB 中的值初始化，这个值可通过方法setTimeout(int)
更改。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getHigherLayerData 
byte[] getHigherLayerData() 
返回ATTRIB 帧中发送到卡的高层数据，该值可选，如果出现包括 ISO 14443-4 数据。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getHigherLayerResponse 
byte[] getHigherLayerResponse() 
返回卡返回的ATTRIB 应答帧中包括高层应答数据，该值可选，如果出现包括 ISO 14443-4 
应答。 
抛出:  
 IllegalStateException - 如果连接关闭。 
getMbliCid 
byte getMbliCid() 
返回卡返回的ATTRIB 应答帧中包括MBLI-CID 字节。 
抛出:  
 IllegalStateException - 如果连接关闭。 
5.2.11.3.13. 
ISO14443Part4BConnection  
5.2.11.3.13.1. 声明 
public interface ISO14443Part4BConnection extends Connection 
 
所有超级接口:  
Connection 
中国银联 
版权所有

---
**[p148]**

147 
 
5.2.11.3.13.2. 描述 
该类用于访问ISO 14443 协议第4 分类型B。 
5.2.11.3.13.3. 方法 
setNad 
void setNad(byte nad) 
为连接设置NAD（ Node Identifier）值。 
参数:  
 nad - 待设置NAD 值。  
抛出:  
 IllegalStateException - 如果连接关闭。 
getNad 
byte getNad() 
返回NAD 的当前值，如果NAD 不支持,该值返回0。 
抛出:  
 IllegalStateException -如果连接关闭。 
5.2.11.3.14. 
ISO7816Part4Channel 
5.2.11.3.14.1. 声明 
public interface ISO7816Part4Channel 
5.2.11.3.14.2. 描述 
7816-4 连接打开的原（raw）, 基本或者逻辑通道与智能卡或智能卡上的应用通信。 
5.2.11.3.14.3. 方法 
exchangeApdu 
byte[] exchangeApdu(byte[] commandApdu) throws NFCException 
在卡监听器与卡之间完成APDU 交换。  
exchangeApdu 的实现包括APDU 命令的自动级联，对于T=0 协议，对于情况4 和情况2
的命令APDU， 卡可响应“61XX”或“6CXX”。如果响应是“61XX”，实现任何其他命令之前
发送GET RESPONSE 到卡获取响应数据；如果响应是“6CXX”，实现设置Le 等于XX 后重新发
送该命令，发送任何其他命令之前从卡接收应答。  
在这两个上面讨论的情况下，NFC 实现确保发送APDU 命令与接收状态字“61XX”或
“6CXX”，并发送GET RESPONSE 或重新发送APDU 命令 Le 分别设置为XX，在与该卡的任何
逻辑信道上没有任何其他的APDU 交换。在多次成功地从卡接收到状态字“61XX”的情况下， 
在返回到调用应用程序之前实现累积从卡接收到的所有的响应数据。调用应用程序仍然无视
中国银联 
版权所有

---
**[p149]**

148 
 
上述交换，应该只得作为接收上述操作的结果的响应。  
对于基本或逻辑通道, 实现在APDU 命令的自动CLS 字节，设置逻辑通道标识符。  
使用方法openBasicChannel() 或者 openLogicalChannel() 打开新通道，并选择一个
应用，有可能同时与相同的卡打开多个逻辑通道，然而由于APDU 协议是同步的，没有交错
的命令及其响应APDU 跨越逻辑通道； 在收到命令APDU 和发送响应该APDU 命令的之间，只
有一个逻辑通道活动的。  
对于基本以及逻辑通道，方法exchangeApdu() 拒绝MANAGE_CHANNEL 以及 
SELECT_BY_AID APDU 命令，抛出NfcException 异常。  
参数:  
 
commandApdu - 发送卡的APDU 命令。  
返回:  
 
由卡发送的应答APDU。  
抛出:  
 
IllegalArgumentException - 如果 commandApdu 为null 或空。  
 
IllegalStateException - 连接被关闭。  
 
SecurityException - 安全错误被检测出。  
 
NFCException - 发生通信错误。 
getSelectResponse 
byte[] getSelectResponse() 
返回应用选择命令返回的数据，包括状态字，返回的字节数组包含如下顺序的数据 [第一
个数据字节，…，最后一个字节数据, sw1, sw2]  
该函数仅对使用方法 openBasicChannel() 或者 openLogicalChannel() 打开的基本或
逻辑通道可用。  
返回:  
 应用选择命令返回的数据，包括状态字。  
 只有状态字，如果应用选择命令没有数据返回。  
 null 如果应用选择命令没有被执行或选择响应不能被读写器实现检索。  
抛出:  
 IllegalStateException - 如果连接关闭。  
 IllegalStateException - 如果当前实例是用于基本通道。 
isBasicChannel 
boolean isBasicChannel() 
检测通道是基本通过还是原（raw）通道. 
返回:  
true 如果通道是基本通道 false 如果是原通道 
close 
void close() 
通道将要被关闭且不再可用  
如果通道已经关闭, 这个调用不起作用 
中国银联 
版权所有

---
**[p150]**

149 
 
5.2.11.3.15. 
ISO7816Part4Connection 
5.2.11.3.15.1. 声明 
public interface ISO7816Part4Connection extends Connection 
 
所有超级接口:  
Connection  
5.2.11.3.15.2. 描述 
ISO7816-4 规范定义了一个与智能卡通讯的协议，最初这个协议为接触式智能卡设计，
但是它也可用于对ISO14443-4 的A/B 非接触卡通讯的顶部。 
5.2.11.3.15.3. 方法 
openRawChannel 
ISO7816Part4Channel openRawChannel() throws NFCException 
打开一个原生（raw）通道与卡通信。  
该方法与卡打开原生通道，没有APDU 发送 ，也没有应用被选择。 
openRawChannel() 返回一个原生通道. 新通道的方法exchangeApdu() 将用于与卡的通
信 
使用完毕, 原生通道应当被关闭。 
返回:  
 接口ISO7816Part4Channel 的实例。  
抛出:  
 IllegalStateException - 如果连接被关闭。  
 SecurityException - 如果检测出安全错误。  
 NFCException - 带错误码 EXCLUSIVE_REJECTED 如果基本或逻辑通道已经打开。 
openBasicChannel 
ISO7816Part4Channel openBasicChannel(byte[] aid) 
                                     throws NFCException 
打开一个基本通道与应用通信。  
该方法打开一个基本通道,使用指定的AID 选择应用。 
openBasicChannel() 返回一个新的逻辑通道. 新逻辑通道的方法 exchangeApdu() 应当
被用于选择的应用通信。使用完毕, 基本通道应当被关闭。 
参数:  
 aid - 目标应用的标识符(AID)。  
返回:  
 新基本通道。  
抛出:  
 IllegalArgumentException - 如果aid 无效。  
中国银联 
版权所有

---
**[p151]**

150 
 
 IllegalStateException - 如果连接被关闭。  
 SecurityException - 如果检测出安全错误。  
 NFCException - 错误码 EXCLUSIVE_REJECTED 如果原生或者基本通道在该连接上
已经打开。  
 NFCException - 错误码 ITEM_NOT_FOUND 如果应用不能被选择或AID 没有匹配应
用。 
openLogicalChannel 
ISO7816Part4Channel openLogicalChannel(byte[] aid) throws NFCException 
打开一个逻辑通道与应用通信。 此方法打开与该卡的逻辑信道，选择AID 指定的应用，
由卡选择哪个逻辑信道将被使用。 openLogicalChannel() 返回一个新逻辑通道，调用新逻
辑通道的方法 exchangeApdu() 用于与选择的应用通信。使用完毕, 逻辑通道应当被关闭。 
参数:  
 
aid - 目标应用的标识符(AID)。  
返回:  
 
新逻辑通道。  
抛出:  
 
IllegalArgumentException - 如果 aid 为 null 或者为空。  
 
IllegalStateException - 如果连接被关闭。  
 
SecurityException - 如果检测出安全错误。  
 
NFCException - 错误码 FEATURE_NOT_SUPPORTED 如果逻辑通道不被卡支持。  
 
NFCException - 错误码 EXCLUSIVE_REJECTED 如果原生通道已经在该连接上
打开。  
 
NFCException - 错误码 ITEM_NOT_FOUND 如果应用不能被选择或AID 没有发
现匹配的应用。  
 
NFCException - 错误码 RF_COMMUNICATION 如果逻辑创建时发生其他错误。 
getAtr 
byte[] getAtr() 
返回开的ATR。  
使用ISO 7816-4 协议, 接触卡通过ATR 标识，ATR 是定义卡属性的字节数组。  
接触卡直接返回ATR 值. 对于非接触卡ATR 通过PC/SC 规范的定义的防冲突信息构建, 
"Interoperability Specification for ICCs and Personal Computer Systems - Part 3. 
Requirements for PC-Connected Interface Devices - Revision 2.01.09 - June 2007" 
in the section "3.1.3.2.3.1 Contactless Smart Cards"。 
返回:  
 
包含ATR 字节数组。  
抛出:  
 
IllegalStateException - 如果连接已被关闭。 
5.2.11.4. 
SE 
中国银联 
版权所有

---
**[p152]**

151 
 
5.2.11.4.1. ReaderEx 
5.2.11.4.1.1. 
声明 
public interface ReaderEx extends Reader 
 
所有超级接口:  
Reader  
5.2.11.4.1.2. 
描述 
这个类的实例表示连接到NFC 控制器的安全模块的读写器，这些读写器可以是物理设备
或虚拟设备，它们可以是 可移动的或不可移动，它们可以包含一个安全模块，它们可以是
可移动的或不可移动的。 
5.2.11.4.1.3. 
方法 
openSession 
SessionEx openSession(boolean force) 
                      throws IOException 
连接到读写器中的安全模块，该方法在会话对象返回前准备（初始化）安全模块通信（即 
如果安全模块没有上电，就通过ICC ON 给安全模块上电） 可以同时在同一读卡器打开多个
会话，系统确保每个会话间APDU 的交错。  
如果 force 设置为 true, 连接将打开，即使:  
(1) SE 正进行卡仿真，这情况下会关闭卡仿真，  
(2) 读写器正与外部卡通信，这种情况会关闭读写器会话。  
如果 force 设置为 false, 连接将创建仅当卡仿真停止并且没有读写器与外部卡通信。 
如果没有卡仿真或读写器活动,连接立即建立。 
参数:  
 force - 强制连接的标志。  
返回:  
 创建通道的会话对象。  
抛出:  
 IllegalStateException - 和安全模块的连接已经打开。  
 IOException - 如果安全模块不支持通信。  
 IOException - 如果安全模块没有响应。  
 IOException - 如果与安全模块或读写器通信时，出现问题。 
getPolicy 
boolean getPolicy(ReaderEx.Scope scope, 
                boolean cardEmulation, 
                ConnectionProperty protocol) 
查询安全模块的策略。  
中国银联 
版权所有

---
**[p153]**

152 
 
策略定义安全模块与外部RF 接口的允许的协议。 
参数:  
 scope - 策略的范围是下述值之一:  
(1) ReaderEx.Scope.BOOT 策略适用当设备自举时 (持久化的值),  
(2) ReaderEx.Scope.CURRENT 当前值, 立即适用 (非持久化的值), 或者，  
(3) ReaderEx.Scope.BAT_OFF 策略适用，当电池关闭或电池电量低时(持久化的
值)。  
 cardEmulation - true 卡仿真策略， false 读写器策略。  
 protocol - 策略的协议。  
返回:  
 true 如果在指定的范围指定的协议被策略允许，否则false。  
抛出:  
 IllegalArgumentException - 如果 protocol 或者 scope 为 null。 
setPolicy 
void setPolicy( 
ReaderEx.Scope  scope, 
        
boolean  
 
 
cardEmulation, 
        ConnectionProperty protocol, 
        boolean   
 
value 
)throws NFCException 
设置安全模块的策略， 策略定义安全模块与外部RF 接口的允许的协议。 
参数:  
 scope - 策略的范围是下述值之一:  
(1) ReaderEx.Scope.BOOT 策略适用当设备自举时 (持久化的值),  
(2) ReaderEx.Scope.CURRENT 当前值, 立即适用 (非持久化的值), 或者，  
(3) ReaderEx.Scope.BAT_OFF 策略适用，当电池关闭或电池电量低时(持久化的
值)。 
 cardEmulation - true 卡仿真策略, false 读写器策略。  
 protocol - 策略的协议。  
 value - true ，如果在指定的范围指定的协议被策略允许, 否则返回false。  
抛出:  
 IllegalArgumentException - 如果 protocol 或者 scope 为 null。  
 IllegalArgumentException - 如果protocol 不被安全模块支持。  
 SecurityException - 如果应用不允许为安全模块设置策略。  
 IllegalStateException - 如果安全模块正进行另一个操作。  
 NfcException - 设置策略时出现错误。  
isProtocolSupported 
boolean isProtocolSupported(boolean cardEmulation, 
                          ConnectionProperty protocol) 
检查对于RF 接口一个协议是否被安全模块支持。 
参数:  
中国银联 
版权所有

---
**[p154]**

153 
 
 cardEmulation - true 卡仿真协议, false 卡监听协议。  
 protocol - 待检查的协议。  
返回:  
 true，如果协议被支持, 否则返回false。  
抛出:  
 IllegalArgumentException - 如果 protocol 为 null。 
checkProperty 
boolean checkProperty(ReaderEx.SeProperty property) 
检查安全模块的属性的值。 
参数:  
 property - 待检查的属性。  
返回:  
 属性的值。  
抛出:  
 IllegalArgumentException - 如果 property 为 null。 
5.2.11.4.2. SessionEx 
5.2.11.4.2.1. 
声明 
public interface SessionEx extends Session 
 
所有超级接口:  
Session 
5.2.11.4.2.2. 
描述 
这个类的实例表示一个与设备上可用的安全模块之一的连接会话，这些对象可以被用来
获得一个与安全模块的Applet 通信的通道，这个通道可以是基本通道或逻辑通道。 
5.2.11.4.2.3. 
方法 
openRawChannel 
Channel openRawChannel()  throws IOException,  
IllegalStateException, 
                         SecurityException 
打开一个新的原生通道与安全模块通信。  
该方法打开一个新的原生通道， 没有 APDU 发送到卡也没有应用被选择。 
openRawChannel(} 返回一个新通道，新通道的方法Channel.transmit() 用于与安全模
块通信；使用完毕, 原生通道应被关闭。 
返回:  
 原生通道。  
中国银联 
版权所有

---
**[p155]**

154 
 
抛出:  
 IllegalStateException - 如果安全模块关闭后被使用。  
 IllegalStateException - 如果原生通道,基本通道或者逻辑通道在这个连接上已
经打开。  
 SecurityException - 如果调用应用不允许与安全模块打开原生通道。  
 IOException - 如果与读写器或安全模块有通信问题 (例如 如果AID 不可用)。 
5.2.11.4.3. ReaderEx.Scope 
5.2.11.4.3.1. 
声明 
java.lang.Object 
  |  
+--java.lang.Enum<ReaderEx.Scope>  
      | 
+--com.cup.tee.nfc.SE.ReaderEx.Scope  
public static enum ReaderEx.Scope extends Enum<ReaderEx.Scope> 
5.2.11.4.3.2. 
描述 
读写器的策略范围。 
5.2.11.4.3.3. 
枚举常量 
——BOOT 
public static final ReaderEx.Scope BOOT 
策略范围：当设备自举时策略适用（持久化值）。 
——CURRENT 
public static final ReaderEx.Scope CURRENT 
策略范围：当前值，立即适用（非持久化值）。 
——BAT_OFF 
public static final ReaderEx.Scope BAT_OFF 
策略范围：当电池关闭或低电量时策略适用（持久化值）。 
5.2.11.4.3.4. 
方法 
values 
public static ReaderEx.Scope[] values() 
按照声明该枚举类型的常量的顺序, 返回包含这些常量的数组。该方法可用于迭代常量, 
如下所示:  
for (ReaderEx.Scope c : ReaderEx.Scope.values()) 
    System.out.println(c); 
返回:  
 按照声明该枚举类型的常量的顺序返回的包含这些常量的数组。 
中国银联 
版权所有

---
**[p156]**

155 
 
valueOf 
public static ReaderEx.Scope valueOf(String name) 
返回带有指定名称的该类型的枚举常量。字符串必须与用于声明该类型的枚举常量的标识
符完全匹配。(不允许有多余的空格字符)。 
参数:  
name - 要返回的枚举常量的名称。  
返回:  
返回带有指定名称的枚举常量。  
抛出:  
 IllegalArgumentException - 如果该枚举类型没有带有指定名称的常量。  
 NullPointerException - 如果参数为空。 
5.2.11.4.4. ReaderEx.SeProperty 
5.2.11.4.4.1. 
声明 
java.lang.Object 
  |  
+--java.lang.Enum<ReaderEx.SeProperty>  
      | 
+--com.cup.tee.nfc.SE.ReaderEx.SeProperty  
public static enum ReaderEx.SeProperty extends Enum<ReaderEx.SeProperty> 
5.2.11.4.4.2. 
描述 
读写器的安全元件属性 
5.2.11.4.4.3. 
枚举常量 
——UICC 
public static final ReaderEx.SeProperty UICC 
true 如果安全元件是UICC。 
——TRANSACTION_NOTIFICATION 
public static final ReaderEx.SeProperty TRANSACTION_NOTIFICATION 
true 如安全元件发送事务事件。 
——REMOVABLE 
public static final ReaderEx.SeProperty REMOVABLE 
true 如果安全元件移除。 
——HOT_PLUG_NOTIFICATION 
public static final ReaderEx.SeProperty HOT_PLUG_NOTIFICATION 
true 如果安全元件发送热插拔通知。 
——SWP_CONNECTIVITY_NOTIFICATION 
public static final ReaderEx.SeProperty SWP_CONNECTIVITY_NOTIFICATION 
true 如果安全元件发送SWP 连接通知。 
中国银联 
版权所有

---
**[p157]**

156 
 
——COMMUNICATION 
public static final ReaderEx.SeProperty COMMUNICATION 
true 如果安全元件支持使用ReaderEx.openSession(boolean)通信。 
values 
public static ReaderEx.SeProperty[] values() 
按照声明该枚举类型的常量的顺序, 返回包含这些常量的数组。该方法可用于迭代常量, 
如下所示:  
for (ReaderEx.SeProperty c : ReaderEx.SeProperty.values()) 
    System.out.println(c); 
返回:  
 按照声明该枚举类型的常量的顺序返回的包含这些常量的数组。 
valueOf 
public static ReaderEx.SeProperty valueOf(String name) 
返回带有指定名称的该类型的枚举常量。字符串必须与用于声明该类型的枚举常量的标识
符完全匹配。(不允许有多余的空格字符)。 
参数:  
 name - 要返回的枚举常量的名称。  
返回:  
 返回带有指定名称的枚举常量  
抛出:  
 IllegalArgumentException - 如果该枚举类型没有带有指定名称的常量。 
 NullPointerException - 如果参数为空值。 
5.2.12. com.cup.tee.fingerprint 
5.2.12.1. 
FPService 
5.2.12.1.1. 声明 
java.lang.Object  
 |  
+ --com.cup.tee.fingerprint.FPService 
   | 
+--public class FPService  extends java.lang.Object 
5.2.12.1.2. 描述 
指纹服务类 
中国银联 
版权所有

---
**[p158]**

157 
 
5.2.12.1.3. 构造器 
FPService 
public FPService() 
5.2.12.1.4. 方法 
getIds 
public int getIds(int[] ids,  int offset) 
取当前所有指纹模板索引 
参数：ids - 存放指纹索引结果的数组 offset - 存放指纹索引结果的数组的偏移返回:返
回已录入的指纹模板个数 
getName 
public java.lang.String getName(int id) 
 
获取指定ID 的指纹名称 
参数：id - 指纹索引 返回 - 指纹名称 
getIdentifyResult 
public int getIdentifyResult(int id)  throws FPException 
获取指纹校验结果  
参数：id - 指纹索引 
返回：0 - 成功 其他值 - 错误码 抛出FPException 
getInstance 
public static final FPService getInstance()  throws FPException 
创建一个FPService 实例 
返回：FPService 实例 抛出:FPException 
5.2.12.2. 
 FPException 
5.2.12.2.1. 声明 
java.lang.Object 
 | 
+--java.lang.Throwable 
    |  
中国银联 
版权所有

---
**[p159]**

158 
 
+--java.lang.Exception 
    | 
        +-- java.lang.RuntimeException 
            |  
            +-- com.cup.tee.framework.TEERuntimeException 
                 | 
                 +--com.cup.tee.framework.TEEException 
                     | 
+-- com.cup.tee.fingerprint.FPException 
public class FPException extends com.cup.tee.framework.TEEException 
5.2.12.2.2. 描述 
指纹操作异常类 
5.2.12.2.3. 构造器 
FPException 
public FPException(short reason) 
 
使用指定的错误码构建一个FPException 实例， 为节省资源可使用TEE 运行环境拥有的
这个类的实例 
5.2.12.2.4. 方法 
throwIt 
public static void throwIt(short reason)  throws FPException 
使用指定的错误码抛出TEE 运行环境拥有的类FPException 的实例。 
参数：reason - N3TEE 定义的错误码  抛出FPException 
5.2.13.  java.lang 
5.2.13.1. 
描述 
该包提供Java 语言的支持类。 
5.2.13.2. 
Boolean 
5.2.13.2.1. 声明 
中国银联 
版权所有

---
**[p160]**

159 
 
java.lang.Object 
  |  
+--java.lang.Boolean 
public final class Boolean extends Object 
5.2.13.2.2. 描述 
Boolean 类将基本类型为 boolean 的值包装在一个对象中。 一个Boolean 类型的
对象只包含一个类型为boolean 的字段。 此外，此类还为 boolean 和String 的相互转
换提供了许多方法， 并提供了处理 boolean 时非常有用的其他一些常量和方法。 
5.2.13.2.3. 字段 
TRUE 
public static final Boolean TRUE 
对应基值 true 的Boolean 对象。 
 
FALSE 
public static final Boolean FALSE 
对应基值 false 的Boolean 对象。 
5.2.13.2.4. 构造器 
Boolean 
Public Boolean(boolean value) 
分配一个表示 value 参数的Boolean 对象。 
参数: 
value - Boolean 的值。 
5.2.13.2.5. 方法 
booleanValue 
public boolean booleanValue() 
将此Boolean 对象的值作为基本布尔值返回。 
返回: 
 
此对象的基本 boolean 值。 
toString 
public String toString() 
返回一个表示指定布尔值的 String 对象。 如果指定布尔值为 true，则将返回字符
串 "true"，否则将返回字符串 "false"。 
中国银联 
版权所有

---
**[p161]**

160 
 
返回: 
 
该字符串所表示的 Boolean 值。 
hashCode 
public int hashCode() 
返回该 Boolean 对象的哈希码。 
返回: 
 如果此对象表示 true 则返回整数 1231；如果表示 false 则返回整数 1237。 
另请参阅: 
Object.equals(java.lang.Object), Hashtable。 
equals 
public boolean equals(Object obj) 
当且仅当参数不是 null，而是一个与此对象一样， 都表示同一个Boolean 值的 
boolean 对象时，才返回 true。 
参数: 
 obj - 比较的对象。 
返回: 
 如果这些布尔对象表示相同的值，则返回 true；否则返回 false。 
valueOf 
public static Boolean valueOf(boolean b) 
返回一个表示指定 boolean 值的 Boolean 实例。 如果指定的 boolean 值为 
true，则此方法返回 Boolean.TRUE；如果为 false，则返回 Boolean.FALSE。 如果
不需要新的 Boolean 实例，则应优先使用此方法，而不是构造方法 Boolean(boolean)，
因为此方法有可能大大提高空间和时间性能。 
5.2.13.3. 
Byte 
5.2.13.3.1. 声明 
java.lang.Object 
   | 
+--java.lang.Byte 
public final class Byte extends Object 
5.2.13.3.2. 描述 
Byte 类将基本类型 byte 的值包装在一个对象中。 一个 Byte 类型的对象只包含一
个类型为 byte 的字段。 此外，该类还为 byte 和 String 的相互转换提供了几种方法， 
并提供了处理 byte 时非常有用的其他一些常量和方法。 
中国银联 
版权所有

---
**[p162]**

161 
 
5.2.13.3.3. 字段 
——MIN_VALUE 
public static final byte MIN_VALUE 
一个常量，保存 byte 类型可取的最小值，即 -128。 
——MAX_VALUE 
public static final byte MAX_VALUE 
一个常量，保存 byte 类型可取的最大值，即 127。 
5.2.13.3.4. 构造器 
Byte 
public Byte(byte value) 
构造一个新分配的 Byte 对象，以表示指定的 byte 值。 
参数: 
 
value - Byte 对象所表示的初始值。 
5.2.13.3.5. 方法 
parseByte 
public static byte parseByte(String s) 
               throws NumberFormatException 
将String 参数解析为有符号的十进制 byte。 除了第一个字符可以是表示负值的 
ASCII 负号 '-' ('-') 之外， 该字符串中的字符必须都是十进制数字。返回得到的byte
值与以该 String 参数 和基数 10 为参数的 parseByte(java.lang.String, int) 方
法所返回的值一样。 
参数: 
 s - 要解析的包含 byte 表示形式的 String。 
返回: 
 以十进制的参数表示的 byte 值。 
抛出: 
 NumberFormatException-如果该 - string 不包含一个可解析的 byte。 
parseByte 
public static byte parseByte(String s, int radix)  
 throws NumberFormatException 
将string 参数解析为一个有符号的 byte，其基数由第二个参数指定。 除了第一个
字符可以是表示负值的 ASCII 负号 '-' ('-') 之外（这取决于 Character.digit(char, 
int)是否返回非负值）， 该 string 中的字符必须都是指定基数的数字。返回得到的 byte
值。 
参数: 
中国银联 
版权所有

---
**[p163]**

162 
 
 s - 要解析的包含 byte 表示形式的 String。 
 radix - 在解析 s 时使用的基数。 
返回: 
 以指定基数表示的 string 参数所表示的 byte 值。 
抛出: 
 NumberFormatException - 如果该 string 不包含一个可解析的 byte。 
byteValue 
public byte byteValue() 
作为一个 byte 返回此 Byte 的值。 
返回: 
 转换为 byte 类型后该对象表示的数值。 
toString 
public String toString() 
返回表示指定 byte 的一个新String 对象。假定基数为10。 
hashCode 
public int hashCode() 
返回此 Byte 的哈希码。 
返回: 
 
此对象的一个哈希码值。 
另请参阅: 
Object.equals(java.lang.Object), Hashtable。 
equals 
public boolean equals(Object obj) 
将此对象与指定对象比较。当且仅当参数不为 null， 而是一个与此对象一样包含相
同 Byte 值的 byte 对象时，结果才为 true。 
参数: 
 obj - 要进行比较的对象。 
返回: 
 如果这些对象相同，则为 true；否则为 false。 
valueOf 
public static Byte valueOf(byte b) 
返回表示指定 byte 值的一个 Byte 实例。如果不需要新的 Byte 实例， 则通常应优
先使用此方法，而不是构造方法 Byte(byte)， 因为该方法有可能通过缓存经常请求的值
来显著提高空间和时间性能。 
5.2.13.4. 
Character 
中国银联 
版权所有

---
**[p164]**

163 
 
5.2.13.4.1. 声明 
java.lang.Object 
  | 
+--java.lang.Character 
public final class Character extends Object 
5.2.13.4.2. 描述 
Character 类在对象中包装一个基本类型 char 的值。Character 类型的对象包含
类型为 char 的单个字段。 此外，该类提供了几种方法，以确定字符的类别（小写字母，
数字，等等），并将字符从大写转换成小写， 反之亦然。 字符信息基于 Unicode 标准, 版
本 3.0。但是，为了降低资源消耗，大小写转换只支持ISO Latin-1 标准字符。 其它字符
集可根据需求自行扩充。 
5.2.13.4.3. 字段 
——MIN_RADIX 
public static final int MIN_RADIX 
可用于与字符串相互转换的最小基数。 
另请参阅: 
Integer.toString(int, int), Integer.valueOf(java.lang.String)。 
——MAX_RADIX 
public static final int MAX_RADIX 
可用于与字符串相互转换的最大基数。 
另请参阅: 
Integer.toString(int, int), Integer.valueOf(java.lang.String)。  
——MIN_VALUE 
public static final char MIN_VALUE 
此字段的常量值是 char 类型的最小值，即 ''。 
——MAX_VALUE 
public static final char MAX_VALUE 
此字段的常量值是 char 类型的最大值，即 '?'。 
5.2.13.4.4. 构造器 
Character 
public Character(char value) 
构造一个新分配的 Character 对象，用以表示指定的 char 值。 
参数: 
 
value - Character 对象表示的值。 
中国银联 
版权所有

---
**[p165]**

164 
 
5.2.13.4.5. 方法 
charValue 
public char charValue() 
返回此 Character 对象的值。 
返回: 
 此对象表示的基本char 值。 
hashCode 
public int hashCode() 
返回此 Character 的哈希码。 
返回: 
 
此对象的哈希码值。 
另请参阅: 
Object.equals(java.lang.Object), Hashtable。 
equals 
public boolean equals(Object obj) 
将此对象与指定对象比较。当且仅当参数不是 null，而是一个与此对象包含相同 
char 值的 Character 对象时，结果才是true。 
参数: 
 
obj - 比较的对象。 
返回: 
 
如果对象相同，则返回true；否则返回 false。 
toString 
public String toString() 
返回表示此 Character 值的 String 对象。结果是一个长度为1 的字符串， 其唯一
组件是此Character 对象表示的基本char 值。 
返回: 
 
此对象的字符串表示形式。 
isLowerCase 
public static boolean isLowerCase(char ch) 
确定指定字符是否为小写字母。  
注意本版本只支持ISO Latin-1 标准的字符。  
在ISO Latin-1 字符集(编码从0x0000 到0x00FF)，下列字符是小写的：  
a b c d e f g h i j k l m n o p q r s t u v w x y z \u00DF \u00E0 \u00E1 \u00E2 \u00E3 
\u00E4 \u00E5 \u00E6 \u00E7 \u00E8 \u00E9 \u00EA \u00EB \u00EC \u00ED \u00EE \u00EF 
\u00F0 \u00F1 \u00F2 \u00F3 \u00F4 \u00F5 \u00F6 \u00F8 \u00F9 \u00FA \u00FB \u00FC 
\u00FD \u00FE \u00FF 
中国银联 
版权所有

---
**[p166]**

165 
 
参数: 
 ch - 要测试的字符。 
返回: 
 如果字符为小写，则返回true；否则返回false。 
isUpperCase 
public static boolean isUpperCase(char ch) 
确定指定字符是否为大写字母。  
注意本版本只支持ISO Latin-1 标准的字符。  
在ISO Latin-1 字符集(编码从0x0000 到0x00FF)，下列字符是大写的：  
A B C D E F G H I J K L M N O P Q R S T U V W X Y Z \u00C0 \u00C1 \u00C2 \u00C3 \u00C4 
\u00C5 \u00C6 \u00C7 \u00C8 \u00C9 \u00CA \u00CB \u00CC \u00CD \u00CE \u00CF \u00D0 
\u00D1 \u00D2 \u00D3 \u00D4 \u00D5 \u00D6 \u00D8 \u00D9 \u00DA \u00DB \u00DC \u00DD 
\u00DE 
参数: 
 
ch - 要测试的字符。 
返回: 
 
如果字符为大写，则返回true；否则返回false。 
另请参阅: 
isLowerCase(char), toUpperCase(char)。 
isDigit 
public static boolean isDigit(char ch) 
确定指定字符是否为数字。 
参数: 
 
ch - 要测试的字符。 
返回: 
 
如果字符为数字，则返回 true；否则返回 false。 
toLowerCase 
public static char toLowerCase(char ch) 
将字符参数转换为小写，如果对应字符无小写形式，则返回它本身。  
注意本版本只支持ISO Latin-1 标准的字符。 
参数: 
 
ch - 要转换的字符。 
返回: 
 
等效于字符的小写形式，如果没有的话；否则返回字符本身。 
另请参阅: 
isLowerCase(char), isUpperCase(char), toUpperCase(char)。 
toUpperCase 
public static char toUpperCase(char ch) 
中国银联 
版权所有

---
**[p167]**

166 
 
将字符参数转换为大写，如果对应字符无大写形式，则返回它本身。  
注意本版本只支持ISO Latin-1 标准的字符。 
参数: 
 ch - 要转换的字符。 
返回: 
 等效于字符的大写形式，如果没有的话；否则返回字符本身。 
另请参阅: 
isLowerCase(char), isUpperCase(char), toLowerCase(char)。 
digit 
public static int digit(char ch, int radix) 
返回使用指定基数的字符ch 的数值。 
参数: 
 ch - 要转换的字符。 
 radix - 基数。 
返回: 
 使用指定基数的字符所表示的数值。 
另请参阅: 
isDigit(char) 
5.2.13.5. 
Enum<E extends Enum<E>> 
5.2.13.5.1. 声明 
java.lang.Object 
   | 
+--java.lang.Enum<E> 
public abstract class Enum<E extends Enum<E>> extends Object 
5.2.13.5.2. 描述 
这是所有 Java 语言枚举类型的公共基本类。 
5.2.13.5.3. 方法 
name 
public final String name() 
返回此枚举常量的名称，在其枚举声明中对其进行声明。 与此方法相比，大多数程序
员应该优先考虑使用 toString()方法， 因为 toString 方法返回更加用户友好的名称。 该
方法主要设计用于特殊情形，其正确性取决于获取正确的名称，其名称不会随版本的改变而
改变。 
中国银联 
版权所有

---
**[p168]**

167 
 
返回: 
 
枚举常量的名称。 
ordinal 
public final int ordinal() 
返回枚举常量的序数（它在枚举声明中的位置，其中初始常量序数为零）。 大多数程序
员不会使用此方法。它被设计用于复杂的基于枚举的数据结构， 比如 EnumSet 和 
EnumMap.。 
返回: 
 
枚举常量的序数。 
toString 
public String toString() 
返回枚举常量的名称，它包含在声明中。可以重写此方法，虽然一般来说没有必要。 当
存在更加“程序员友好的”字符串形式时，应该使用枚举类型重写此方法。 
返回: 
 
枚举常量的名称。 
equals 
public final boolean equals(Object other) 
当指定对象等于此枚举常量时，返回 true。 
参数: 
 
other - 要与此对象进行相等性比较的对象。 
返回: 
 
如果指定对象等于此枚举常量，则返回 true。 
hashCode 
public final int hashCode() 
返回枚举常量的哈希码。 
返回: 
 
枚举常量的哈希码。 
另请参阅: 
Object.equals(java.lang.Object), Hashtable。 
5.2.13.6. 
Integer 
5.2.13.6.1. 声明 
java.lang.Object 
  | 
+--java.lang.Integer 
public final class Integer extends Object 
中国银联 
版权所有

---
**[p169]**

168 
 
5.2.13.6.2. 描述 
Integer 类在对象中包装了一个基本类型int 的值。Integer 类型 的对象包含一个
int 类型的字段。此外，该类提供了多个方法，能在 int 类型和String 类型之间 互相转
换，还提供了处理 int 类型时非常有用的其他一些常量和方法。 
5.2.13.6.3. 字段 
MIN_VALUE 
public static final int MIN_VALUE 
值为 -2147483648 的常量，它表示int 类型能够表示的最小值。 
MAX_VALUE 
public static final int MAX_VALUE 
值为2147483647 的常量，它表示 int 类型能够表示的最大值。 
5.2.13.6.4. 构造器 
Integer 
public Integer(int value) 
构造一个新分配的 Integer 对象，它表示指定的 int 值。 
参数: 
 value - Integer 对象表示的值。 
5.2.13.6.5. 方法 
toString 
public static String toString(int i, int radix) 
返回用第二个参数指定基数表示的第一个参数的字符串表示形式。  
如果基数小于Character.MIN_RADIX 或者大于Character.MAX_RADIX，则改用基
数 10。  
如果第一个参数为负，则结果中的第一个元素为 ASCII 的减号 '-' ('-')。 如果第一个参
数为非负，则没有符号字符出现在结果中。 结果中的剩余字符表示第一个参数的大小。如
果大小为零，则用一个零字符 '0' ('0') 表示； 否则，大小的表示形式中的第一个字符将
不是零字符。用以下 ASCII 字符作为数字：  
    0123456789abcdefghijklmnopqrstuvwxyz 
其范围是从 '\u0030'到'\u0039'和从'\u0061'到 '\u007a'。 如果 radix 为 N, 则按
照所示顺序，使用这些字符中的前 N 个作为其数字。 因此，十六进制（基数为 16）的数
字是0123456789abcdef。 
参数: 
 
i - 要转换成字符串的整数。 
 
radix - 用于字符串表示形式的基数。 
中国银联 
版权所有

---
**[p170]**

169 
 
返回: 
 
使用指定基数的参数的字符串表示形式。 
另请参阅: 
Character.MAX_RADIX, Character.MIN_RADIX。 
toHexString 
public static String toHexString(int i) 
以十六进制（基数 16）无符号整数形式返回一个整数参数的字符串表示形式。  
如果参数为负，那么无符号整数值为参数加上 2^32；否则等于该参数。 将该值转换为十六
进制（基数 16）的无前导 0 的 ASCII 数字字符串。 如果无符号数的大小值为零，则用一
个零字符 '0' (’0’) 表示它； 否则，无符号数大小的表示形式中的第一个字符将不是零
字符。 用以下字符作为十六进制数字：  
   0123456789abcdef 
这些字符的范围是从'\u0030'到 '\u0039'和从'u\0061'到 'f'。 
参数: 
 
i - 要转换成字符串的整数。 
返回: 
 
参数的十六进制（基数 16）无符号整数值的字符串表示形式。. 
toOctalString 
public static String toOctalString(int i) 
以八进制（基数 8）无符号整数形式返回一个整数参数的字符串表示形式。  
如果参数为负，那么无符号整数值为参数加上 2^32；否则等于该参数。 将该值转换为八进
制（基数 8）的无前导 0 的 ASCII 数字字符串。 如果无符号数的大小值为零，则用一个
零字符 '0' (’0’) 表示它； 否则，无符号数大小的表示形式中的第一个字符将不是零字
符。 用以下字符作为八进制数字：  
   01234567 
这些字符的范围是从'\u0030'到 '\u0037'。 
参数: 
 
i - 要转换成字符串的整数。 
返回: 
 
参数的八进制（基数 8）无符号整数值的字符串表示形式。 
toBinaryString 
public static String toBinaryString(int i) 
以二进制（基数 2）无符号整数形式返回一个整数参数的字符串表示形式。  
如果参数为负，该无符号整数值为参数加上 2
32；否则等于该参数。 将该值转换为二进制（基
数 2）形式的无前导 0 的 ASCII 数字字符串。 如果无符号数的大小为零，则用一个零字
符 '0' (’0’) 表示它； 否则，无符号数大小的表示形式中的第一个字符将不是零字符。 
参数: 
 
i - 要转换为字符串的整数。 
返回: 
中国银联 
版权所有

---
**[p171]**

170 
 
 
用二进制（基数 2）参数表示的无符号整数值的字符串表示形式。 
toString 
public static String toString(int i) 
返回一个表示指定整数的 String 对象。将该参数转换为有符号的十进制表示形式， 以
字符串形式返回它，就好像将参数和基数 10 作为参数赋予toString(int, int) 方法。 
参数: 
 
i - 要转换的整数。 
返回: 
 
十进制（基数 10）参数的字符串表示形式。 
parseInt 
public static int parseInt(String s, int radix) 
              throws NumberFormatException 
使用第二个参数指定的基数，将字符串参数解析为有符号的整数。 除了第一个字符可
以是用来表示负值的 ASCII 减号 '-' ('\u002d')外， 字符串中的字符必须都是指定基数
的数字（通过 Character.digit(char, int)是否返回一个负值确定）。返回得到的整数值。  
如果发生以下任意一种情况，则抛出一个 NumberFormatException 类型的异常：  
第一个参数为null 或一个长度为零的字符串。  
基数小于 Character.MIN_RADIX 或者大于 Character.MAX_RADIX。  
假如字符串的长度超过 1，那么除了第一个字符可以是减号'-' ('\u002d')外， 字符
串中存在任意不是由指定基数的数字表示的字符。  
字符串表示的值不是 int 类型的值。  
示例：  
   parseInt("0", 10) 返回 0 
   parseInt("473", 10) 返回473 
   parseInt("-0", 10) 返回0 
   parseInt("-FF", 16) 返回-255 
   parseInt("1100110", 2) 返回102 
   parseInt("2147483647", 10) 返回2147483647 
   parseInt("-2147483648", 10) 返回 -2147483648 
   parseInt("2147483648", 10) 抛出NumberFormatException 异常 
   parseInt("99", 8) 抛出NumberFormatException 异常 
   parseInt("Kona", 10) 抛出NumberFormatException 异常 
   parseInt("Kona", 27) 返回411787 
参数: 
 
s - 包含要解析的整数表示形式的String。 
 
radix - 解析 s 时使用的基数。 
返回: 
 
使用指定基数的字符串参数表示的整数。 
抛出: 
 
NumberFormatException - 如果 String 不包含可解析的 int。 
中国银联 
版权所有

---
**[p172]**

171 
 
parseInt 
public static int parseInt(String s) 
                    throws NumberFormatException 
将字符串参数作为有符号的十进制整数进行解析。除了第一个字符可以是用来表示负
值的 ASCII 减号'-' ('\u002d')外， 字符串中的字符都必须是十进制数字。返回得到
的整数值，就好像将该参数和基数 10 作为参数赋予 parseInt(java.lang.String, 
int)方法一样。 
参数: 
 
s - 包含要解析的 int 表示形式的 String。 
返回: 
 
用十进制参数表示的整数值。 
抛出: 
 
NumberFormatException - 如果字符串不包含可解析的整数。 
valueOf 
public static Integer valueOf(String s, int radix) 
                       throws NumberFormatException 
返回一个 Integer 对象，该对象中保存了用第二个参数提供的基数进行解析时从指定
的 String 中提取的值。将第一个参数解释为用第二个参数指定的基数表示的有符号整数， 
结果是一个表示字符串指定的整数值的 Integer 对象。  
换句话说，该方法返回一个等于以下值的 Integer 对象：  
 new Integer(Integer.parseInt(s, radix)) 
参数: 
 
s - 要解析的字符串。 
 
radix - 解释s 时使用的基数。 
返回: 
 
一个 Integer 对象，它含有字符串参数（以指定的基数）所表示的数值。 
抛出: 
 
NumberFormatException - 如果 String 不包含可解析的int。 
valueOf 
public static Integer valueOf(String s) 
                       throws NumberFormatException 
返回一个 Integer 对象，将该参数解释为表示一个有符号的十进制整数, 结果是一个
表示字符串指定的整数值的 Integer 对象。  
换句话说，该方法返回一个等于以下值的 Integer 对象：  
 new Integer(Integer.parseInt(s)) 
参数: 
 
s - 要解析的字符串。 
返回: 
中国银联 
版权所有

---
**[p173]**

172 
 
 
保存字符串参数表示的值的Integer 对象。 
抛出: 
 
NumberFormatException - 如果 String 不包含可解析的int。 
byteValue 
public byte byteValue() 
以 byte 类型返回该 Integer 的值。 
返回: 
 
转换为 byte 类型后该对象表示的数值。 
shortValue 
public short shortValue() 
以 short 类型返回该 Integer 的值。 
返回: 
 转换为 short 类型后该对象表示的数值。 
intValue 
public int intValue() 
以 int 类型返回该 Integer 的值。 
返回: 
 转换为 int 类型后该对象表示的数值。 
longValue 
public long longValue() 
以 long 类型返回该 Integer 的值。 
返回: 
 
转换为 long 类型后该对象表示的数值。 
toString 
public String toString() 
返回一个表示该 Integer 值的 String 对象。将该参数转换为有符号的十进制表示形
式，并以字符串的形式返回它， 就好像将该整数值作为参数赋予toString(int)方法一
样。 
返回: 
 
该对象的值（基数 10）的字符串表示形式。 
hashCode 
public int hashCode() 
返回此 Integer 的哈希码。 
返回: 
 
该对象的哈希码值，它的值即为该 Integer 对象表示的基本int 类型的数值。 
中国银联 
版权所有

---
**[p174]**

173 
 
另请参阅: 
Object.equals(java.lang.Object), Hashtable。 
equals 
public boolean equals(Object obj) 
比较此对象与指定对象。当且仅当参数不为 null, 并且是一个与该对象包含相同 int 
值的 Integer 对象时，结果为 true。 
参数: 
 
obj - 要比较的对象。 
返回: 
 
如果对象相同，则返回 true，否则返回 false。 
valueOf 
public static Integer valueOf(int value) 
返回一个表示指定的 int 值的 Integer 实例。如果不需要新的 Integer 实例，则通
常应优先使用该方法， 而不是构造方法Integer(int)，因为该方法有可能通过缓存经常请
求的值而显著提高空间和时间性能。 
参数: 
 
value - 一个 int 值。 
返回: 
 
表示i 的 Integer 实例。 
5.2.13.7. 
Math 
5.2.13.7.1. 声明 
java.lang.Object 
  | 
+--java.lang.Math 
public final class Math extends Object 
5.2.13.7.2. 描述 
Math 类包含用于执行基本数学运算的方法 
5.2.13.7.3. 方法 
abs 
public static int abs(int a) 
返回 int 值的绝对值。如果参数为非负数，则返回该参数。如果参数为负数，则返回
该参数的相反数。  
中国银联 
版权所有

---
**[p175]**

174 
 
注意，如果参数等于 Integer.MIN_VALUE 的值（即能够表示的最小负 int 值）， 那么
结果与该值相同且为负。 
参数: 
 
a - 要确定绝对值的参数。 
返回: 
 
参数的绝对值。 
另请参阅: 
Integer.MIN_VALUE 
abs 
public static long abs(long a) 
返回 long 值的绝对值。如果参数为非负数，则返回该参数。如果参数为负数，则返回
该参数的相反数 。 
注意，如果参数等于 Long.MIN_VALUE 的值（即能够表示的最小负 long 值）， 那么结
果与该值相同且为负。 
参数: 
 
a - 要确定绝对值的参数。 
返回: 
 
参数的绝对值。 
另请参阅: 
Long.MIN_VALUE 
max 
public static int max(int a,int b) 
返回两个int 值中较大的一个。也就是说，结果为更接近Integer.MAX_VALUE 值的参数。
如果参数值相同，那么结果也是同一个值。 
参数: 
 
a - 参数。 
 
b - 另一个参数。 
返回: 
 
a 和b 中的较大者. 
另请参阅: 
Long.MAX_VALUE 
max 
public static long max(long a,long b) 
返回两个long 值中较大的一个。也就是说，结果为更接近Long.MAX_VALUE 值的参数。
如果参数值相同，那么结果也是同一个值。 
参数: 
 
a - 参数。 
 
b - 另一个参数。 
返回: 
中国银联 
版权所有

---
**[p176]**

175 
 
 
a 和b 中的较大者. 
另请参阅: 
Long.MAX_VALUE 
min 
public static int min(int a,int b) 
返回两个int 值中较小的一个。也就是说，结果为更接近Long.MIN_VALUE 值的参数。
如果参数值相同，那么结果也是同一个值。 
参数: 
 
a - 参数。 
 
b - 另一个参数。 
返回: 
 
a 和b 中的较小者. 
另请参阅: 
Long.MIN_VALUE。 
min 
public static long min(long a,long b) 
返回两个long 值中较小的一个。也就是说，结果为更接近Long.MIN_VALUE 值的参数。
如果参数值相同，那么结果也是同一个值。 
参数: 
 
a - 参数。 
 
b - 另一个参数。 
返回: 
 
 
a 和b 中的较小者。 
另请参阅: 
Long.MIN_VALUE 
5.2.13.8. 
Object 
java.lang.Object 
5.2.13.8.1. 声明 
public class Object 
5.2.13.8.2. 描述 
类 Object 是类层次结构的根类。每个类都使用 Object 作为超类。所有对象（包括数
组）都实现这个类的方法。 
5.2.13.8.3. 构造器 
中国银联 
版权所有

---
**[p177]**

176 
 
Object 
public Object() 
5.2.13.8.4. 方法 
hashCode 
public int hashCode() 
返回该对象的哈希码值。支持此方法是为了提高哈希表（例如java.util.Hashtable
提供的哈希表）的性能。  
hashCode 的常规协定是：  
在 Java 应用程序执行期间，在对同一对象多次调用hashCode 方法时， 必须一致
地返回相同的整数，前提是将对象进行equals 比较时所用的信息没有被修改。 从某一
应用程序的一次执行到同一应用程序的另一次执行，该整数无需保持一致。  
如果根据 equals(Object) 方法，两个对象是相等的，那么对这两个对象中的每个对象
调用 hashCode 方法 都必须生成相同的整数结果。  
如果根据 equals(java.lang.Object)方法，两个对象不相等， 那么对这两个对象中的
任一对象上调用hashCode 方法不 要求一定生成不同的整数结果。 但是，程序员应该
意识到，为不相等的对象生成不同整数结果可以提高哈希表的性能。  
实际上，由 Object 类定义的 hashCode 方法确实会针对不同的对象返回不同的整
数。 (一般是通过将该对象的内部地址转换成一个整数来实现的, 但是 Java
TM 编程语言不
需要这种实现技巧）。 
返回: 
 
此对象的一个哈希码值。 
另请参阅: 
equals(java.lang.Object), Hashtable。 
equals 
public boolean equals(Object obj) 
指示其他某个对象是否与此对象“相等”。  
equals 方法在非空对象引用上实现相等关系：  
——自反性：对于任何非空引用值 x，x.equals(x) 都应返回 true。.  
——对称性：对于任何非空引用值 x 和 y，当且仅当 y.equals(x) 返回 true 时，
x.equals(y) 才应返回 true。  
——传递性：对于任何非空引用值 x、y 和 z，如果 x.equals(y) 返回 true，并且 
y.equals(z) 返回 true，那么 x.equals(z) 应返回 true。  
——一致性：对于任何非空引用值 x 和 y，多次调用 x.equals(y) 始终返回 true 或
始终返回 false，前提是对象上 equals 比较中所用的信息没有被修改。  
中国银联 
版权所有

---
**[p178]**

177 
 
对于任何非空引用值 x，x.equals(null) 都应返回 false。  
Object 类的 equals 方法实现对象上差别可能性最大的相等关系；即，对于任何非空
引用值 x 和 y， 当且仅当 x 和 y 引用同一个对象时，此方法才返回 true（x == y 具
有值 true）。 
参数: 
 
obj - 要与之比较的引用对象。 
返回: 
 
如果此对象与 obj 参数相同，则返回 true；否则返回 false。 
5.2.13.9. 
Runtime 
5.2.13.9.1. 声明 
java.lang.Object 
  | 
+--java.lang.Runtime 
public class Runtime extends Object 
5.2.13.9.2. 描述 
每个Java 应用程序都有一个 Runtime 类实例，使应用程序能够与其运行的环境相连
接。可以通过 getRuntime 方法获取当前运行时。 应用程序不能创建自己的 Runtime 类
实例。 
5.2.13.9.3. 方法 
getRuntime 
public static Runtime getRuntime() 
返回与当前 Java 应用程序相关的运行时对象。Runtime 类的大多数方法是实例方法，
并且必须根据当前的运行时对象对其进行调用。 
返回: 
 
与当前 Java 应用程序相关的 Runtime 对象。 
freeMemory 
public long freeMemory() 
返回 Java 虚拟机中的空闲内存量。调用 gc 方法可能导致 freeMemory 返回值的增加。 
返回: 
 供将来分配对象使用的当前可用内存的近似总量，以字节为单位。 
totalMemory 
public long totalMemory() 
中国银联 
版权所有

---
**[p179]**

178 
 
返回 Java 虚拟机中的内存总量。此方法返回的值可能随时间的推移而变化，这取决于
主机环境。  
注意，保存任意给定类型的一个对象所需的内存量可能取决于实现方法。 
返回: 
 
目前为当前和后续对象提供的内存总量，以字节为单位。 
gc 
ublic void gc() 
运行垃圾回收器。调用此方法意味着 Java 虚拟机做了一些努力来回收未用对象，以便
能够快速地重用这些对象当前占用的内存。当控制从方法调用中返回时，虚拟机已经尽最大
努力回收了所有丢弃的对象。  
名称 gc 代表“垃圾回收器”。虚拟机根据需要在单独的线程中自动执行回收过程，甚
至不用显式调用 gc 方法。  
方法System.gc() 是调用此方法的一种传统而便捷的方式。 
5.2.13.10. Short 
5.2.13.10.1. 
声明 
java.lang.Object 
  |  
+--java.lang.Short 
public final class Short extends Object 
5.2.13.10.2. 
描述 
Short 类在对象中包装基本类型 short 的值。一个 Short 类型的对象只包含一个 
short 类型的字段。  
5.2.13.10.3. 
字段 
——MIN_VALUE 
public static final short MIN_VALUE 
保存 short 可取的最小值的常量，最小值为-2
15 。 
——MAX_VALUE 
public static final short MAX_VALUE 
保存 short 可取的最大值的常量，最大值为2
15-1。 
5.2.13.10.4. 
构造器 
Short 
中国银联 
版权所有

---
**[p180]**

179 
 
public Short(short value) 
构造一个新分配的 Short 对象，用来表示指定的 short 值。 
参数: 
 value - Short 对象的初始值。 
5.2.13.10.5. 
方法 
parseShort 
public static short parseShort(String s) 
                        throws NumberFormatException 
将字符串参数解析为有符号的十进制 short。 该字符串中的字符必须都是十进制数字，
否则会抛出异常。 
参数: 
 
s - 包含要解析的 short 表示形式的 String。 
返回: 
 
参数（十进制）表示的 short 值。 
抛出: 
 
NumberFormatException - 如果该字符串不包含可解析的 short。 
parseShort 
public static short parseShort(String s, int radix) 
                        throws NumberFormatException 
将字符串参数解析为由第二个参数指定的基数中的有符号的 short。 如果该字符串中
的字符包含非法数字，会抛出异常。 
参数: 
 
s - 包含要解析的 short 表示形式的 String。 
 
radix - 将在解析 s 时使用的基数。 
返回: 
 
由指定基数中的字符串参数表示的 short。 
抛出: 
 
NumberFormatException - 如果String 不包含可解析的 short。 
shortValue 
public short shortValue() 
以 short 形式返回此 Short 的值。 
返回: 
 
转换为 short 类型后该对象表示的数值。 
toString 
public String toString() 
返回表示此 Short 的值的 String 对象。该值被转换成有符号的十进制表示形式，并
中国银联 
版权所有

---
**[p181]**

180 
 
作为一个字符串返回。 
hashCode 
public int hashCode() 
返回此 Short 的哈希码。 
返回: 
 
此对象的一个哈希码值。 
另请参阅: 
Object.equals(java.lang.Object), Hashtable. 
equals 
public boolean equals(Object obj) 
将此对象与指定对象比较。 
参数: 
 
obj - 将与之进行比较的对象。 
返回: 
如果这些对象相同，则返回 true；否则返回 false。 
valueOf 
public static Short valueOf(short value) 
返回表示指定 short 值的 Short 实例。 如果不需要新的 Short 实例，则通常应该
优先采用此方法， 而不是构造方法Short(short)，因为此方法很可能通过缓存经常请求的
值来显著提高空间和时间性能。 
参数: 
 
value - 一个 short 值。 
返回: 
 
表示 s 的 Short 实例 
5.2.13.11. String 
5.2.13.11.1. 
声明 
java.lang.Object 
  | 
+--java.lang.String 
public final class String extends Object 
5.2.13.11.2. 
描述 
String 类代表字符串。Java 程序中的所有字符串字面值（如 "abc"）都作为此类的实
例实现。  
字符串是常量；它们的值在创建之后不能更改。字符串缓冲区支持可变的字符串。因为 
中国银联 
版权所有

---
**[p182]**

181 
 
String 对象是不可变的，所以可以共享。例如：  
   String str = "abc"; 
   等效于：  
   char data[] = { 'a', 'b', 'c' }; 
   String str = new String(data); 
   下面给出了一些如何使用字符串的更多示例：  
 System.out.println("abc"); 
 String cde = "cde"; 
 System.out.println("abc" + cde); 
 String c = "abc".substring(2, 3); 
 String d = cde.substring(1, 2); 
String 类包括的方法可用于检查序列的单个字符、比较字符串、搜索字符串、提取子字
符串、创建字符串副本并将所有字符全部转换为大写或小写。大小写映射基于 Character 类
指定的 Unicode 标准版。  
Java 语言提供对字符串串联符号（"+"）以及将其他对象转换为字符串的特殊支持。字
符串串联是通过 StringBuilder 类及其 append 方法实现的。 字符串转换是通过 
toString 方法实现的，该方法由 Object 类定义，并可被 Java 中的所有类继承。 有关字
符串串联和转换的更多信息. 
5.2.13.11.3. 
构造器 
String 
public String() 
初始化一个新创建的 String 对象，使其表示一个空字符序列。注意，由于 String 是
不可变的，所以无需使用此构造方法。 
String 
public String(String value) 
初始化一个新创建的 String 对象，使其表示一个与参数相同的字符序列；换句话说，
新创建的字符串是该参数字符串的副本。 
参数: 
 
value - 一个 String。 
String 
public String(char[] value) 
分配一个新的 String，使其表示字符数组参数中当前包含的字符序列。该字符数组的
内容已被复制；后续对字符数组的修改不会影响新创建的字符串。 
参数: 
value - 字符串的初始值. 
抛出: 
NullPointerException - 如果 value 为null。 
String 
public String(char[] value,int offset,int count) 
分配一个新的 String，它包含取自字符数组参数一个子数组的字符。offset 参数是子
数组第一个字符的索引，count 参数指定子数组的长度。该子数组的内容已被复制；后续对
中国银联 
版权所有

---
**[p183]**

182 
 
字符数组的修改不会影响新创建的字符串。 
参数: 
 
value - 作为字符源的数组。 
 
offset - 初始偏移量。 
 
count - 长度。 
抛出: 
 
IndexOutOfBoundsException - 如果 offset 和 count 参数索引字符超出 
value 数组的范围。 
 
NullPointerException - 如果 value 为null。 
String 
public String(byte[] bytes,int off, int len,String enc) 
通过使用指定的字符集解码指定的 byte 子数组，构造一个新的 String。新 String 的
长度是一个字符集函数，因此可能不等于子数组的长度。 
参数: 
 
bytes - 要解码为字符的 byte。 
 
off - 要解码的第一个 byte 的索引。 
 
len - 要解码的 byte 数。 
 
enc - 受支持 charset 的名称。 
抛出: 
 
UnsupportedEncodingException - 如果指定的字符集不受支持。 
String 
public String(byte[] bytes,  String enc) 
通过使用指定的字符集解码指定的 byte 子数组，构造一个新的 String。新 String 的
长度是一个字符集函数，因此可能不等于子数组的长度。 
参数: 
 
bytes - 要解码为字符的 byte。 
 
enc - 受支持 charset 的名称。 
抛出: 
 
UnsupportedEncodingException - 如果指定的字符集不受支持。 
String 
public String(byte[] bytes, int off, int len) 
通过使用默认的字符集解码指定的 byte 子数组，构造一个新的 String。新 String 的
长度是一个字符集函数，因此可能不等于子数组的长度。 
参数: 
 
bytes - 要解码为字符的 byte。 
 
off - 要解码的第一个 byte 的索引。 
 
len - 要解码的 byte 数。 
抛出: 
 
IndexOutOfBoundsException - 如果 offset 和 count 参数索引字符超出 
value 数组的范围。 
String 
public String(byte[] bytes) 
通过使用默认的字符集解码指定的 byte 子数组，构造一个新的 String。新 String 的
中国银联 
版权所有

---
**[p184]**

183 
 
长度是一个字符集函数，因此可能不等于子数组的长度。 
参数: 
 
bytes - 要解码为字符的 byte。 
5.2.13.11.4. 
方法 
length 
public int length() 
返回此字符串的长度。长度等于字符串中16 位 Unicode 代码单元的数量。 
返回: 
 
此对象表示的字符序列的长度。 
charAt 
public char charAt(int index) 
返回指定索引处的 char 值。索引范围为从0 到length() - 1。 序列的第一个 char 值
位于索引 0 处，第二个位于索引1 处，依此类推，这类似于数组索引。 
参数: 
 
index - char 值的索引。 
返回: 
 
此字符串指定索引处的 char 值。第一个 char 值位于索引 0 处。 
抛出: 
 
IndexOutOfBoundsException - 如果 index 参数为负或大于等于此字符串的
长度。 
getChars 
public void getChars(int srcBegin, 
            int srcEnd, 
            char[] dst, 
            int dstBegin) 
将字符从此字符串复制到目标字符数组。  
要复制的第一个字符位于索引 srcBegin 处；要复制的最后一个字符位于索引 
srcEnd-1 处（因此要复制的字符总数是 srcEnd-srcBegin）。要复制到 dst 子数组的字符
从索引 dstBegin 处开始，并结束于索引：  
 dstbegin + (srcEnd - srcBegin) - 1 
 参数: 
 
srcBegin - 字符串中要复制的第一个字符的索引。 
 
srcEnd - 字符串中要复制的最后一个字符之后的索引。 
 
dst - 目标数组。 
 
dstBegin - 目标数组中的起始偏移量。 
抛出: 
 
IndexOutOfBoundsException - 如果下列任何一项为 true：  
(1) srcBegin 为负。  
中国银联 
版权所有

---
**[p185]**

184 
 
(2) srcBegin 大于 srcEnd。  
(3) srcEnd 大于此字符串的长度。  
(4) dstBegin 为负。  
(5) dstBegin+(srcEnd-srcBegin)大于dst.length。  
getBytes 
public byte[] getBytes(String enc) 
使用给定的 charset 将此 String 编码到 byte 序列，并将结果存储到新的 byte 数
组。 
参数: 
 
enc - 受支持的 charset 名称。 
返回: 
 
所得 byte 数组。 
抛出: 
 
UnsupportedEncodingException - 如果指定的字符集不受支持。 
getBytes 
public byte[] getBytes() 
使用平台的默认字符集将此 String 编码为 byte 序列，并将结果存储到一个新的 
byte 数组中。 
返回: 
 
所得 byte 数组。 
equals 
public boolean equals(Object anObject) 
将此字符串与指定的对象比较。当且仅当该参数不为 null，并且是与此对象表示相同
字符序列的 String 对象时，结果才为 true。 
参数: 
 
anObject - 与此 String 进行比较的对象。 
返回: 
 
如果给定对象表示的 String 与此 String 相等，则返回 true；否则返回 
false。 
另请参阅: 
compareTo(java.lang.String), equalsIgnoreCase(java.lang.String)。 
equalsIgnoreCase 
public boolean equalsIgnoreCase(String anotherString) 
将此 String 与另一个 String 比较，不考虑大小写。 如果两个字符串的长度相同，
并且其中的相应字符都相等（忽略大小写）， 则认为这两个字符串是相等的。  
在忽略大小写的情况下，如果下列至少一项为 true，则认为 c1 和 c2 这两个字符相
同：  
这两个字符相同（使用 == 运算符进行比较）。  
中国银联 
版权所有

---
**[p186]**

185 
 
对每个字符应用方法 Character.toUpperCase(char)生成相同的结果。  
对每个字符应用方法 Character.toLowerCase(char) 成相同的结果。  
参数: 
 
anotherString - 与此 String 进行比较的 String。 
返回: 
 
如果参数不为 null，且这两个 String 相等（忽略大小写），则返回 true；
否则返回 false。 
另请参阅: 
equals(Object), Character.toLowerCase(char), Character.toUpperCase(char)。 
compareTo 
public int compareTo(String anotherString) 
按字典顺序比较两个字符串。该比较基于字符串中各个字符的 Unicode 值。 按字典顺
序将此 String 对象表示的字符序列与参数字符串所表示的字符序列进行比较。 如果按字
典顺序此 String 对象位于参数字符串之前，则比较结果为一个负整数。 如果按字典顺序
此 String 对象位于参数字符串之后，则比较结果为一个正整数。 如果这两个字符串相等，
则结果为 0； compareTo 只在方法equals(Object)返回 true 时才返回 0。  
这是字典排序的定义。如果这两个字符串不同，那么它们要么在某个索引处的字符不同
（该索引对二者均为有效索引）， 要么长度不同，或者同时具备这两种情况。如果它们在一
个或多个索引位置上的字符不同，假设 k 是这类索引的最小值； 则在位置 k 上具有较小
值的那个字符串（使用 < 运算符确定），其字典顺序在其他字符串之前。在这种情况下， 
compareTo 返回这两个字符串在位置 k 处两个char 值的差，即值：  
this.charAt(k) - anotherString.charAt(k) 
  
果没有字符不同的索引位置，则较短字符串的字典顺序在较长字符串之前。 在这种情
况下，compareTo 返回这两个字符串长度的差，即值：  
  
his.length() - anotherString.length()。 
参数: 
 
anotherString - 要比较的 String。 
返回: 
 
如果参数字符串等于此字符串，则返回值 0； 如果此字符串按字典顺序小于
字符串参数，则返回一个小于 0 的值； 如果此字符串按字典顺序大于字符串
参数，则返回一个大于 0 的值。 
抛出: 
 
NullPointerException - 如果anotherString 为null。 
regionMatches 
public boolean regionMatches( 
boolean  
ignoreCase, 
        int  
 
toffset, 
        String  
other, 
        int  
 
ooffset, 
        int  
 
len 
) 
中国银联 
版权所有

---
**[p187]**

186 
 
测试两个字符串区域是否相等。  
将此String 对象的子字符串与参数 other 的子字符串进行比较。 如果这两个子字
符串表示相同的字符序列，则结果为 true，当且仅当 ignoreCase 为true 时忽略大小写。 
要比较的此 String 对象的子字符串从索引 toffset 处开始，长度为len； 要比较的 
other 的子字符串从索引 ooffset 处开始，长度为 len； 当且仅当下列至少一项为 true
时，结果才为 false：  
(1) toffset 为负。  
(2) ooffset 为负。  
(3) toffset+len 大于此String 对象的长度。  
(4) ooffset+len 大于另一个参数的长度。  
(5) ignoreCase 为 false，且存在某个小于 len 的非负整数 k，  
    this.charAt(toffset + k) != other.charAt(ooffset + k) 
(6) ignoreCase 为true ，且存在某个小于 len 的非负整数k，即：  
 Character.toLowerCase(this.charAt(toffset + k)) != 
 Character.toLowerCase(other.charAt(ooffset + k)) 
 以及： 
   Character.toUpperCase(this.charAt(toffset + k)) !=  
Character.toUpperCase(other.charAt(ooffset + k)) 
 参数: 
 
ignoreCase - 如果为true，则比较字符时忽略大小写。 
 
toffset - 此字符串中子区域的起始偏移量。 
 
other - 字符串参数。 
 
ooffset - 字符串参数中子区域的起始偏移量。 
 
len - 要比较的字符数。 
返回: 
 
如果此字符串的指定子区域匹配字符串参数的指定子区域，则返回 true；否
则返回 false。是否完全匹配或考虑大小写取决于 ignoreCase 参数。 
startsWith 
public boolean startsWith(String prefix, int toffset) 
测试此字符串从指定索引开始的子字符串是否以指定前缀开始。 
参数: 
 
prefix - 前缀。 
 
toffset - 在此字符串中开始查找的位置。 
返回: 
 
如果参数表示的字符序列是此对象从索引 toffset 处开始的子字符串前缀， 
则返回 true；否则返回 false。如果 toffset 为负或大于此 String 对象的
长度， 则结果为 false；否则结果与以下表达式的结果相同：  
 this.subString(toffset).startsWith(prefix) 
startsWith 
public boolean startsWith(String prefix) 
测试此字符串是否以指定的前缀开始。 
中国银联 
版权所有

---
**[p188]**

187 
 
参数: 
 
prefix - 前缀。 
返回: 
 
如果参数表示的字符序列是此字符串表示的字符序列的前缀，则返回 true；
否则返回 false。 还要注意，如果参数是空字符串，或者等于此 String 对
象 （用 equals(Object) 方法确定），则返回 true。 
抛出: 
 
NullPointerException - 如果 prefix 为null。 
endsWith 
public boolean endsWith(String suffix) 
测试此字符串是否以指定的后缀结束。 
参数: 
 
suffix - 后缀。 
返回: 
 
如果参数表示的字符序列是此对象表示的字符序列的后缀，则返回 true； 否
则返回 false。注意，如果参数是空字符串，或者等于此 String 对象 （用 
equals(Object)方法确定），则结果为 true。 
抛出: 
 
NullPointerException - 如果 prefix 为null。 
lastIndexOf 
public int lastIndexOf(int ch) 
返回指定字符在此字符串中最后一次出现处的索引。对于 0 到 0xFFFF（包括 0 和 
0xFFFF）范围内的 ch 的值，返回的索引（Unicode 代码单元）是  
  
this.charAt(k) == ch 
   true。 从最后一个字符开始反向搜索此 String。 
参数: 
 
ch - 一个字符。 
返回: 
 
在此对象表示的字符序列中最后一次出现该字符的索引；如果未出现该字符，
则返回 -1。 
lastIndexOf 
public int lastIndexOf(int ch, 
              int fromIndex) 
返回指定字符在此字符串中最后一次出现处的索引，从指定的索引处开始进行反向搜
索。对于 0 到 0xFFFF（包括 0 和 0xFFFF）范围内的 ch 值，返回的索引是  
 (this.charAt(k) == ch) && (k <= fromIndex) 
为 true 的最大 k 值。 
参数: 
 ch - 一个字符。 
中国银联 
版权所有

---
**[p189]**

188 
 
 fromIndex - 开始搜索的索引。fromIndex 的值没有限制。如果它大于等于此字
符串的长度，则与它小于此字符串长度减 1 的效果相同：将搜索整个字符串。
如果它为负，则与它为 -1 的效果相同：返回 -1。 
返回: 
 在此对象表示的字符序列（小于等于 fromIndex）中最后一次出现该字符的索引；
如果在该点之前未出现该字符，则返回 -1。 
hashCode 
public int hashCode() 
返回此字符串的哈希码。String 对象的哈希码根据以下公式计算：  
  s[0]*31ˆ(n-1) + s[1]*31ˆ(n-2) + ... + s[n-1] 
使用 int 算法，这里 s[i]是字符串的第 i 个字符，n 是字符串的长度，^ 表示求幂。 
（空字符串的哈希值为 0）。 
返回: 
 
此对象的哈希码值。 
另请参阅: 
Object.equals(java.lang.Object), Hashtable。 
indexOf 
public int indexOf(int ch) 
返回指定字符在此字符串中第一次出现处的索引。 如果在此 String 对象表示的字符
序列中出现值为 ch 的字符，则返回第一次出现该字符的索引（以 Unicode 代码单元表示）。 
对于 0 到 0xFFFF（包括 0 和 0xFFFF）范围内的 ch 的值，返回值是  
     this.charAt(k) == ch 
为 true 最小 k 值。无论哪种情况，如果此字符串中没有这样的字符，则返回 -1。 
参数: 
 
ch - 一个字符（Unicode 代码点）。 
返回: 
 
在此对象表示的字符序列中第一次出现该字符的索引；如果未出现该字符，则
返回 -1。 
indexOf 
public int indexOf(int ch, int fromIndex) 
返回在此字符串中第一次出现指定字符处的索引，从指定的索引开始搜索。  
在此 String 对象表示的字符序列中，如果带有值 ch 的字符的索引不小于 
fromIndex，则返回第一次出现该值的索引。对于 0 到 0xFFFF（包括 0 和 0xFFFF）范围
内的 ch 值，返回值是  
  (this.charAt(k) == ch) && (k >= fromIndex) 
为 true 的最小 k 值。对于其他 ch 值，返回值是  
为 true 的最小 k 值。无论哪种情况，如果此字符串中 fromIndex 或之后的位置没有
这样的字符出现，则返回 -1。 
参数: 
中国银联 
版权所有

---
**[p190]**

189 
 
 
ch - 一个字符。 
 
fromIndex - 开始搜索的索引。 
返回: 
 
在此对象表示的字符序列中第一次出现的大于或等于 fromIndex 的字符的索
引；如果未出现该字符，则返回 -1。 
indexOf 
public int indexOf(String str) 
返回指定子字符串在此字符串中第一次出现处的索引。返回的整数是  
  
this.startsWith(str, k) 
  
为 true 的最小 k 值。 
参数: 
 
str - 任意字符串。 
返回: 
 
如果字符串参数作为一个子字符串在此对象中出现，则返回第一个这种子字符
串的第一个字符的索引；如果它不作为一个子字符串出现，则返回 -1。 
抛出: 
 
NullPointerException - 如果str 为null。 
indexOf 
public int indexOf(String str, 
          int fromIndex) 
返回指定子字符串在此字符串中第一次出现处的索引，从指定的索引开始。返回的整数
是满足下式的最小 k 值：  
k >= Math.min(fromIndex, this.length()) && this.startsWith(str, k) 
如果不存在这样的 k 值，则返回 -1。 
参数: 
 
str - 要搜索的子字符串。 
 
fromIndex - 开始搜索的索引位置。 
返回: 
 
指定子字符串在此字符串中第一次出现处的索引，从指定的索引开始。 
substring 
public String substring(int beginIndex) 
返回一个新的字符串，它是此字符串的一个子字符串。该子字符串从指定索引处的字符
开始，直到此字符串末尾。  
示例：  
  "unhappy".substring(2) returns "happy" 
  "Harbison".substring(3) returns "bison" 
  "emptiness".substring(9) returns "" (an empty string) 
  
参数: 
中国银联 
版权所有

---
**[p191]**

190 
 
 
beginIndex - 起始索引（包括）。 
返回: 
 
指定的子字符串。 
抛出: 
 
IndexOutOfBoundsException - 如果 beginIndex 为负或大于此 String 对
象的长度。 
substring 
public String substring(int beginIndex, 
               int endIndex) 
返回一个新字符串，它是此字符串的一个子字符串。该子字符串从指定的 beginIndex 
处开始，直到索引 endIndex - 1 处的字符。因此，该子字符串的长度为 
endIndex-beginIndex。  
示例：  
  "hamburger".substring(4, 8) returns "urge" 
  "smiles".substring(1, 5) returns "mile" 
 参数: 
 beginIndex - 起始索引（包括）。 
 endIndex - 结束索引（不包括）。 
返回: 
 指定的子字符串。 
抛出: 
 IndexOutOfBoundsException - 如果 beginIndex 为负，或 endIndex 大于此 
String 对象的长度，或 beginIndex 大于 endIndex。 
concat 
public String concat(String str) 
将指定字符串连接到此字符串的结尾。  
如果参数字符串的长度为 0，则返回此 String 对象。否则，创建一个新的 String 对
象，用来表示由此 String 对象表示的字符序列和参数字符串表示的字符序列连接而成的字
符序列。  
示例：  
  "cares".concat("s") returns "caress" 
  "to".concat("get").concat("her") returns "together" 
参数: 
 str - 连接到此 String 结尾的 String。 
返回: 
 一个字符串，它表示在此对象字符后连接字符串参数字符而成的字符。 
抛出: 
 NullPointerException - 如果str 为null。 
replace 
中国银联 
版权所有

---
**[p192]**

191 
 
public String replace(char oldChar, 
             char newChar) 
返回一个新的字符串，它是通过用 newChar 替换此字符串中出现的所有 oldChar 得到
的。  
如果 oldChar 在此 String 对象表示的字符序列中没有出现，则返回对此 String 对象的
引用。否则，创建一个新的 String 对象，它所表示的字符序列除了所有的 oldChar 都被
替换为 newChar 之外，与此 String 对象表示的字符序列相同。  
示例：  
  "mesquite in your cellar".replace('e', 'o') 
          returns "mosquito in your collar" 
  "the war of baronets".replace('r', 'y') 
          returns "the way of bayonets" 
  "sparring with a purple porpoise".replace('p', 't') 
          returns "starring with a turtle tortoise" 
  "JonL".replace('q', 'x') returns "JonL" (no change) 
  参数: 
 oldChar - 原字符。 
 newChar - 新字符。 
返回: 
 一个从此字符串派生的字符串，它将此字符串中的所有 oldChar 替代为 newChar。 
toLowerCase 
public String toLowerCase() 
使用默认语言环境的规则将此 String 中的所有字符都转换为小写。这等效于调用 
toLowerCase(Locale.getDefault())。 
返回: 
 
要转换为小写的 String。 
另请参阅: 
Character.toLowerCase(char), toUpperCase()。 
toUpperCase 
public String toUpperCase() 
将此 String 中的所有字符都转换为大写。 
返回: 
 
要转换为大写的 String。 
另请参阅: 
Character.toLowerCase(char), toUpperCase()。 
trim 
public String trim() 
返回字符串的副本，忽略前导空白和尾部空白。  
如果此 String 对象表示一个空字符序列，或者此 String 对象表示的字符序列的第一
中国银联 
版权所有

---
**[p193]**

192 
 
个和最后一个字符的代码都大于 ' '（空格字符），则返回对此 String 对象的引用。  
否则，若字符串中没有代码大于 ' ' 的字符，则创建并返回一个表示空字符串的新 String 
对象。  
否则，假定 k 为字符串中代码大于 ' ' 的第一个字符的索引，m 为字符串中代码大于 ' ' 
的最后一个字符的索引。创建一个新的 String 对象，它表示此字符串中从索引 k 处的字
符开始，到索引 m 处的字符结束的子字符串，即 this.substring(k, m+1)的结果。  
此方法可用于截去字符串开头和末尾的空白（如上所述）。 
返回: 
 
此字符串移除了前导和尾部空白的副本；如果没有前导和尾部空白，则返回此
字符串。 
toString 
public String toString() 
返回此对象本身（它已经是一个字符串！）。 
返回: 
 
字符串本身。 
toCharArray 
public char[] toCharArray() 
将此字符串转换为一个新的字符数组。 
返回: 
 
一个新分配的字符数组，它的长度是此字符串的长度，它的内容被初始化为包
含此字符串表示的字符序列。 
valueOf 
public static String valueOf(char[] data) 
返回 char 数组参数的字符串表示形式。字符数组的内容已被复制，后续修改不会影响
新创建的字符串。 
参数: 
 
data - char 数组。 
返回: 
 
一个新分配的字符串，它表示包含在字符数组参数中的相同字符序列。 
valueOf 
public static String valueOf(char[] data, 
             int offset, 
             int count) 
返回 char 数组参数的特定子数组的字符串表示形式。  
offset 参数是子数组的第一个字符的索引。count 参数指定子数组的长度。字符数组的内
容已被复制，后续修改不会影响新创建的字符串。 
参数: 
 
data - 字符数组。 
中国银联 
版权所有

---
**[p194]**

193 
 
 
offset - String 值的初始偏移量。 
 
count - String 值的长度。 
返回: 
 
一个字符串，它表示在字符数组参数的子数组中包含的字符序列。 
抛出: 
 
NullPointerException - 如果data 为null。 
 
IndexOutOfBoundsException - 如果 offset 为负，count 为负，或者 
offset+count 大于 data.length。 
valueOf 
public static String valueOf(boolean b) 
返回 boolean 参数的字符串表示形式。 
参数: 
 
b - 一个 boolean。 
返回: 
 
如果参数为 true，则返回一个等于 "true" 的字符串；否则，返回一个等于 
"false" 的字符串。 
valueOf 
public static String valueOf(char c) 
返回 char 参数的字符串表示形式。 
参数: 
 
c - 一个 char。 
返回: 
 
一个长度为 1 的字符串，它包含参数 c 的单个字符。 
valueOf 
public static String valueOf(int i) 
返回 int 参数的字符串表示形式。  
该表示形式恰好是单参数的Integer.toString 方法返回的结果。 
参数: 
 
i - 一个 int。 
返回: 
 
参数的字符串表示形式。 
另请参阅: 
Integer.toString(int, int)。 
intern 
public String intern() 
返回字符串对象的规范化表示形式。  
一个初始为空的字符串池，它由类 String 私有地维护。  
当调用 intern 方法时，如果池已经包含一个等于此 String 对象的字符串（用 
中国银联 
版权所有

---
**[p195]**

194 
 
equals(Object) 方法确定），则返回池中的字符串。 否则，将此 String 对象添加到池中，
并返回此 String 对象的引用。  
它遵循以下规则：对于任意两个字符串 s 和 t，当且仅当s.equals(t)为true 时， 
s.intern() == t.intern()才为 true  
所有字面值字符串和字符串赋值常量表达式都使用 intern 方法进行操作。 字符串字
面值在Java Language Specification 的3.10.5 中定义。 
返回: 
 
一个字符串，内容与此字符串相同，但一定取自具有唯一字符串的池。 
5.2.13.12. StringBuilder 
5.2.13.12.1. 
声明 
java.lang.Object 
  | 
+--java.lang.StringBuilder 
public final class StringBuilder extends Object 
5.2.13.12.2. 
描述 
一个可变的字符序列。 此类提供一个与 StringBuffer 兼容的 API，但不保证同步。 该
类被设计用作 StringBuffer 的一个简易替换，用在字符串缓冲区被单个线程使用的时候
（这种情况很普遍）。 如果可能，建议优先采用该类，因为在大多数实现中，它比 
StringBuffer 要快。  
在 StringBuilder 上的主要操作是 append 和 insert 方法，可重载这些方法， 以接受任
意类型的数据。每个方法都能有效地将给定的数据转换成字符串，然后将该字符串的字符添
加或插入到字符串生成器中。 append 方法始终将这些字符添加到生成器的末端；而 insert
方法则在指定的点添加字符。  
例如，如果 z 引用一个当前内容为“start”的字符串生成器对象，则该方法调用 
z.append("le") 将使字符串生成器包含“startle”，而 z.insert(4, "le") 将更改字符
串生成器，使之包含“starlet”。  
通常，如果 sb 引用 StringBuilder 的实例，则 sb.append(x) 和 
sb.insert(sb.length(), x) 具有相同的效果。 每个字符串生成器都有一定的容量。只要
字符串生成器所包含的字符序列的长度没有超出此容量，就无需分配新的内部缓冲区。如果
内部缓冲区溢出，则此容量自动增大。  
每个字符串缓冲区都有一定的容量。只要字符串缓冲区所包含的字符序列的长度没有超出此
容量，就无需分配新的内部缓冲区数组。如果内部缓冲区溢出，则此容量自动增大。  
另请参阅: 
String 
5.2.13.12.3. 
构造器 
中国银联 
版权所有

---
**[p196]**

195 
 
StringBuilder 
public StringBuilder() 
构造一个其中不带字符的字符串生成器，初始容量为 16 个字符。 
StringBuilder 
public StringBuilder(int capacity) 
构造一个其中不带字符的字符串生成器，初始容量由 capacity 参数指定。 
参数: 
 
capacity - 初始容量。 
抛出: 
 
NegativeArraySizeException - 如果 capacity 参数小于 0。 
StringBuilder 
public StringBuilder(String str) 
构造一个字符串缓冲区，并将其内容初始化为指定的字符串内容。该字符串的初始容量
为 16 加上字符串参数的长度。 
参数: 
 
str - 缓冲区的初始内容。 
5.2.13.12.4. 
方法 
length 
public int length() 
返回包含的character 个数 
返回: 
 
character 个数 
capacity 
public int capacity() 
返回缓冲区长度。 
返回: 
 
缓冲区长度 
ensureCapacity 
public void ensureCapacity(int minimumCapacity) 
确保缓冲区长度大于参数minimumCapacity 。 如果当前的缓冲区长度小于
minimumCapacity，则分配一个新的更大容量内部缓冲区。 容量是下面两个值中较大的一个：  
(1) minimumCapacity 参数  
(2) 旧缓冲区长度的两倍，加上2  
如果 minimumCapacity 参数为非正值, 此方法直接返回。 
参数: 
 
minimumCapacity - 请求的最小缓冲区容量。 
trimToSize 
中国银联 
版权所有

---
**[p197]**

196 
 
public void trimToSize() 
尝试减小缓冲区。 如果缓冲区长度大于当前的有效字符序列，重新分配一个更小够用
的缓冲区。 调用可方法后，可能但不一定影响 capacity()方法的返回值。 
setLength 
public void setLength(int newLength) 
设置缓冲区的新长度。 如果新长度大于原长度，则多出来的空间会用0 值填充； 否则，
原有字符串会被截断到新长度。  
newLength 不能为负值。 
参数: 
 
newLength - 缓冲区新长度。 
抛出: 
 
IndexOutOfBoundsException - 如果newLength 参数为负值。 
另请参阅: 
length()。 
charAt 
public char charAt(int index) 
返回指定索引处的 char 值。索引范围为从0 到length() - 1。 序列的第一个 char 
值位于索引 0 处，第二个位于索引1 处，依此类推，这类似于数组索引。 
参数: 
 
index - char 值的索引。 
返回: 
 
此字符串指定索引处的 char 值。第一个 char 值位于索引 0 处。 
抛出: 
 
IndexOutOfBoundsException - 如果 index 参数为负或大于等于length()。 
另请参阅: 
length()。 
getChars 
public void getChars(int srcBegin, 
            int srcEnd, 
            char[] dst, 
            int dstBegin) 
拷贝缓冲区中的部分字符串到指定的char 数组。 
参数: 
 
srcBegin - 拷贝操作的起始位置（包含）。 
 
srcEnd - 拷贝操作的结束位置（不包含）。 
 
dst - 拷贝操作的目的数组。 
 
dstBegin - 拷贝操作的目的数组偏移。 
抛出: 
 
NullPointerException - 如果dst 为null。 
中国银联 
版权所有

---
**[p198]**

197 
 
 
IndexOutOfBoundsException - 下列条件之一满足：  
(1) srcBegin 为负；  
(2) dstBegin 为负；  
(3) srcBegin 参数大于srcEnd 参数；  
(4) srcEnd 参数大于 this.length()（当前StringBuffer 的长度）；  
(5) dstBegin+srcEnd-srcBegin 大于dst.length 。 
setCharAt 
public void setCharAt(int index,  char ch) 
用ch 替换缓冲区中index 位置的就字符。 
参数: 
 
index - 更新字符的位置。 
 
ch - 新字符。 
抛出: 
 
IndexOutOfBoundsException - 如果index 为负或者不小于此对象的
length()。 
另请参阅: 
length()。 
append 
public StringBuilder append(String str) 
追加一个字符串常量到缓冲区.  
参数: 
 
str - 一个string 类型的变量。 
返回: 
 
追加了str 的StringBuilder。 
append 
public StringBuilder append(char[] str) 
将一个char 数组的内容追加到缓冲区。 等效于：  
append.(String.valueOf(char[]))  
参数: 
 
str - 追加到缓冲区的char 数组。 
返回: 
 
追加了char 数组的StringBuilder 对象。 
append 
public StringBuilder append(char[] str, 
                   int offset, 
                   int len) 
将一个char 数组变量的一部分追加缓冲区。 等效于：  
append.(String.valueOf(char[], int offset, int size))  
中国银联 
版权所有

---
**[p199]**

198 
 
参数: 
 
str - 追加到缓冲区的char 数组。 
 
offset - char 数组的偏移。 
 
len - 使用char 数组的长度。 
返回: 
 
追加了char 数组的StringBuilder 对象。 
append 
public StringBuilder append(boolean b) 
将一个boolean 变量转换为字符后追加当前的缓冲区。 
参数: 
 
b - 一个boolean 值。 
返回: 
 
StringBuilder。 
另请参阅: 
String.valueOf(boolean), append(java.lang.String)。 
append 
public StringBuilder append(char c) 
将一个char 变量追加当前的缓冲区。 
参数: 
 
c - 一个char 值。 
返回: 
 
StringBuffer。 
另请参阅: 
String.valueOf(char), append(java.lang.String)。 
append 
public StringBuilder append(int i) 
将一个int 变量转换为string 后追加当前的缓冲区。 等效于：  
append.(String.valueOf(int i))  
参数: 
 
i - 追加到StringBuilder 的int 值。 
返回: 
 
追加了int 值的StringBuilder 对象。 
delete 
public StringBuilder delete(int start, 
                   int end) 
移除此StringBuilder 中的一个子字符串。 被移除的子字符串起始位置由start 参数
确定，结束位置由end - 1 参数或字符串末尾确定。 如果start 等于end，则忽略该请求。 
参数: 
中国银联 
版权所有

---
**[p200]**

199 
 
 
start - 起始位置（包含）。 
 
end - 结束位置（不包含）。 
返回: 
 
返回StringBuilder 本身。 
抛出: 
 
StringIndexOutOfBoundsException - 如果 start 为负值，或者大于 length()
和end 中任意一个。 
deleteCharAt 
public StringBuilder deleteCharAt(int index) 
移除StringBuilder 指定位置的单个字符。 
参数: 
 
index - 指定移除字符的位置。 
返回: 
 
StringBuilder 本身。 
抛出: 
 
StringIndexOutOfBoundsException - 如果 index 为负值，或者不小于
length()。 
另请参阅: 
length()。 
replace 
public StringBuilder replace(int start, 
                         int end, 
                         String str) 
将指定区间的字符序列替换为参数str 指定的字符串。 
参数: 
 
start - 区间起始位置（包括）。 
 
end - 区间结束位置（不包括）。 
 
str - 用来替换区间的字符串。 
返回: 
 
StringBuilder 本身。 
抛出: 
 
StringIndexOutOfBoundsException 
- 
如
果
 
start<0
或
者
start>this.length()， 再或者start>end。 
insert 
public StringBuilder insert(int index, 
                       char[] str, 
                       int offset, 
                       int len) 
在缓冲区指定位置插入给定的字符数组区间。 完成后，StringBuilder 长度增长len
中国银联 
版权所有

---
**[p201]**

200 
 
个长度。 
参数: 
 
index - 缓冲区插入点。 
 
str - 带插入的字符数组。 
 
offset - 字符数组的偏移。 
 
len - 插入长度 
返回: 
 
StringBuilder 本身 
抛出: 
 
StringIndexOutOfBoundsException - 如果index 为负值，或者大于
length()；又或者 offset 和len 其中一个参数是负值， 再或者(offset+len)
大于 str.length。 
insert 
public StringBuilder insert(int offset, 
                   String str) 
将一个字符串常量所含内容插入缓冲区。  
str 参数所代表的字符序列被插入到缓冲区中，对应的，原位置上的其它字符会被平移
到后面。 完成后，StringBuilder 对象的length 增长值为str.length 如果str 为null, 那
个"null"四个字符会被插入到 缓冲区中。  
要求 
0<= offset <= this.length()  
参数: 
 
offset - 插入位置。 
 
str - 一个字符串。 
返回: 
 
StringBuilder 对象本身。 
抛出: 
 
StringIndexOutOfBoundsException - 如果offset 参数无效。 
另请参阅: 
StringBuffer.length()。 
insert 
public StringBuilder insert(int offset, 
                       char[] str) 
将char 数组的内容插入缓冲区。  
字符数组的内容插入位置由offset 参数指定，操作完成后，StringBuilder 的长度增
长为此字符数组的大小  
等效于下面两个操作： 
String.valueOf(char[]) 
StringBuffer.insert(int,String) 
参数: 
 
offset - 插入位置。 
中国银联 
版权所有

---
**[p202]**

201 
 
 
str - 字符数组。 
返回: 
 
StringBuilder 对象本身。 
抛出: 
 
StringIndexOutOfBoundsException - 如果offset 参数无效。 
insert 
public StringBuilder insert(int offset, 
                   boolean b) 
将boolean 转换为字符后插入到缓冲区的指定位置； 该位置之后的字符会进行平移，
StringBuilder 的长度加一。  
要求 
0<= offset <= this.length()  
参数: 
 
offset - 位置。 
 
b - 一个boolean 值。 
返回: 
 
StringBuilder 对象本身。 
抛出: 
 
StringIndexOutOfBoundsException - offset 参数为负。 
insert 
public StringBuilder insert(int offset, 
                   char c) 
将指定字符插入到缓冲区的指定位置； 该位置之后的字符会进行平移，StringBuilder
的长度加一。  
要求： 
0<= offset <= this.length()  
参数: 
 
offset - 位置。 
 
c - 一个char 值。 
返回: 
 
StringBuilder 对象本身。 
抛出: 
 
StringIndexOutOfBoundsException - offset 参数为负。 
insert 
public StringBuilder insert(int offset, int i) 
将int 转换为string 后插入缓冲区。  
字符数组的内容插入位置由offset 参数指定。  
等效于下面两个操作： 
String.valueOf(int) 
中国银联 
版权所有

---
**[p203]**

202 
 
insert(int,String) 
参数: 
 
offset - 插入位置。 
 
i - 一个int 值。 
返回: 
 
StringBuffer 对象本身。 
抛出: 
 
StringIndexOutOfBoundsException - 如果offset 参数无效。 
reverse 
public StringBuilder reverse() 
将缓冲区的内部字符序列进行反序。  
假设字符序列的长度为n，反序完成后，新序列中k 位置存放的是原序列位置为n-k-1
的字符。 
返回: 
 
StringBuilder 对象本身，但内部字符序列已经过反序处理。 
toString 
public String toString() 
返回一个与当前缓冲区字符数据相同的String 对象。 之后，对此StringBuffer 的修
改不影响已返回的String 对象。  
实现指导：运行环境可以采用“写时复制”机制减少资源消耗，即返回的String 与原
StringBuffer 共用内部缓冲区；只有StringBuilder 进行修改时，再为String 分配单
独缓冲区。 
返回: 
 
一个与此StringBuilder 内容相同的String 对象 
5.2.13.13. Throwable 
5.2.13.13.1. 
声明 
java.lang.Object 
  |  
+--java.lang.Throwable 
直接已知子类: 
Error, Exception 
public class Throwable extends Object 
5.2.13.13.2. 
描述 
在基于java 语法的N3 平台api 中，Throwable 类做为所有 errors 类 和 exceptions
的基类。 当对象在实例化出错的时候，N3 虚拟机会抛出对应的Throwable 对象。 同样，
中国银联 
版权所有

---
**[p204]**

203 
 
只有这个Throwable 对象或Throwable 的子类对象被抛出时，才能被java 的catch 语句捕
获。 
5.2.13.13.3. 
构造器 
Throwable 
public Throwable() 
构建一个新的Throwable 实例. 
Throwable 
public Throwable(String message) 
构造带指定详细消息的新 throwable 对象。 
参数: 
 
message - 详细消息。 保存这个详细消息，以便以后通过 getMessage()方法
对其进行获取。 
5.2.13.13.4. 
方法 
getMessage 
public String getMessage() 
返回此 throwable 的详细消息字符串。 
返回: 
 
此 Throwable 实例（可以为 null）的详细消息字符串。 
5.2.13.14. ArithmeticException 
5.2.13.14.1. 
声明 
java.lang.Object 
  | 
+--java.lang.Throwable 
      | 
+--java.lang.Exception 
     | 
+--java.lang.RuntimeException 
      | 
+--java.lang.ArithmeticException 
public class ArithmeticException extends RuntimeException  
5.2.13.14.2. 
描述 
当出现异常的运算条件时，抛出此异常。例如，一个整数”除以零“时，抛出此类的一
中国银联 
版权所有

---
**[p205]**

204 
 
个实例。 
5.2.13.14.3. 
构造器 
ArithmeticException 
public ArithmeticException() 
构建一个新的ArithmeticException 实例。 
5.2.13.15. ArrayIndexOutOfBoundsException 
5.2.13.15.1. 
声明 
java.lang.Object 
  | 
+--java.lang.Throwable 
      | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.IndexOutOfBoundsException 
      | 
+--java.lang.ArrayIndexOutOfBoundsException 
public class ArrayIndexOutOfBoundsException 
extends IndexOutOfBoundsException 
5.2.13.15.2. 
描述 
用非法索引访问数组时抛出的异常。如果索引为负或大于等于数组大小，则该索引为非
法索引。 
5.2.13.15.3. 
构造器 
ArrayIndexOutOfBoundsException 
public ArrayIndexOutOfBoundsException() 
构建一个新的ArrayIndexOutOfBoundsException 实例。 
ArrayIndexOutOfBoundsException 
public ArrayIndexOutOfBoundsException(int index) 
构造具有指示非法索引的参数的新ArrayIndexOutOfBoundsException 类。 
参数: 
 
index - 非法索引。 
ArrayIndexOutOfBoundsException 
中国银联 
版权所有

---
**[p206]**

205 
 
public ArrayIndexOutOfBoundsException(String s) 
构造具有指定详细消息的ArrayIndexOutOfBoundsException 类。 
参数: 
 
s - 详细消息。 
5.2.13.16. ArrayStoreException 
5.2.13.16.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.ArrayStoreException 
public class ArrayStoreException extends RuntimeException 
5.2.13.16.2. 
描述 
对象数组存储类型不匹配时，N3 环境会抛出 ArrayStoreException 异常。举例  
          Object x[] = new Boolean[3]; 
          x[0] = new Byte((byte)3); 
5.2.13.16.3. 
构造器 
ArrayStoreException 
public ArrayStoreException() 
构建一个新的ArrayStoreException 实例。 
5.2.13.17. ClassCastException 
5.2.13.17.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
中国银联 
版权所有

---
**[p207]**

206 
 
+--java.lang.RuntimeException 
      | 
+--java.lang.ClassCastException 
public class ClassCastException extends RuntimeException 
5.2.13.17.2. 
描述 
当试图将对象强制转换为不是实例的子类时，抛出该异常。例如，以下代码将生成一个 
ClassCastException ： NullPointerException x = new NullPointerException(); 
ArrayStoreException y = (ArrayStoreException)x; 
5.2.13.17.3. 
构造器 
ClassCastException 
public ClassCastException() 
5.2.13.18. Exception 
5.2.13.18.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
直接已知子类: 
IllegalAccessException, IOException, NFCException, RuntimeException 
public class Exception extends Throwable 
5.2.13.18.2. 
描述 
Exception 类及其子类是 Throwable 的一种形式， 它指出了合理的应用程序想要捕
获的条件。 
5.2.13.18.3. 
构造器 
Exception 
public Exception() 
构建一个新的Exception 实例。 
Exception 
public Exception(String s) 
中国银联 
版权所有

---
**[p208]**

207 
 
构造带指定详细消息的新异常。 
参数: 
 
s - 详细消息。 
5.2.13.19. IllegalAccessException 
5.2.13.19.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.IllegalAccessException 
public class IllegalAccessException extends Exception 
5.2.13.19.2. 
描述 
当应用程序试图加载一个类，但当前正在执行的方法无法访问指定类的定义时，抛出 
IllegalAccessException。 无法访问的原因是被访问类是位于其它包，且是非public 类型
的。  
另外，当应用程序试图使用Class 的newInstance 方法创建 一个类的实例，但是当
前方法没有访问这个类的零参构造方法时，也会抛出该异常。  
5.2.13.19.3. 
构造器 
IllegalAccessException 
public IllegalAccessException() 
构造不带详细消息的 IllegalAccessException 。 
IllegalAccessException 
public IllegalAccessException(String s) 
构造带指定详细消息的 IllegalAccessException。 
参数: 
 
s - 详细消息。 
5.2.13.20. IllegalArgumentException 
5.2.13.20.1. 
声明 
java.lang.Object 
   | 
中国银联 
版权所有

---
**[p209]**

208 
 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.IllegalArgumentException 
直接已知子类: 
NumberFormatException 
public class IllegalArgumentException extends RuntimeException 
5.2.13.20.2. 
描述 
抛出的异常表明向方法传递了一个不合法或不正确的参数。 
另请参阅: 
Thread.setPriority(int) 
5.2.13.20.3. 
构造器 
IllegalArgumentException 
public IllegalArgumentException() 
构造不带详细消息的 IllegalArgumentException。 
IllegalArgumentException 
public IllegalArgumentException(String s) 
构造带指定详细消息的 IllegalArgumentException。 
参数: 
 s - 详细消息。 
5.2.13.21. IllegalStateException 
5.2.13.21.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.IllegalStateException 
public class IllegalStateException extends RuntimeException 
中国银联 
版权所有

---
**[p210]**

209 
 
5.2.13.21.2. 
描述 
在非法或不适当的时间调用方法时产生的信号。换句话说， 即 Java 环境或 Java 应
用程序没有处于请求操作所要求的适当状态下。 
5.2.13.21.3. 
构造器 
IllegalStateException 
public IllegalStateException() 
构造不带详细消息的 IllegalStateException。详细消息是描述这个特定异常的 String。 
IllegalStateException 
public IllegalStateException(String s) 
构造带指定详细消息的 IllegalStateException。详细消息是描述这个特定异常的 
String。 
参数: 
 s - 包含详细消息的 String。 
5.2.13.22. IndexOutOfBoundsException 
5.2.13.22.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.IndexOutOfBoundsException 
直接已知子类 
ArrayIndexOutOfBoundsException, StringIndexOutOfBoundsException 
public class IndexOutOfBoundsException extends RuntimeException 
5.2.13.22.2. 
描述 
寻址越界时，会抛出 IndexOutOfBoundsException 异常 
5.2.13.22.3. 
构造器 
IndexOutOfBoundsException 
中国银联 
版权所有

---
**[p211]**

210 
 
public IndexOutOfBoundsException() 
构建一个新的IndexOutOfBoundsException 实例。 
IndexOutOfBoundsException 
public IndexOutOfBoundsException(String s) 
构造带指定详细消息的 IndexOutOfBoundsException。 
参数: 
 
s - 详细消息。 
5.2.13.23. NegativeArraySizeException 
5.2.13.23.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.NegativeArraySizeException 
public class NegativeArraySizeException extends RuntimeException 
5.2.13.23.2. 
描述 
当N3TEE 虚拟机环境尝试为应用申请数组，空间为负的情况下，N3TEE 拟机环境会抛出 
NegativeArraySizeException 异常。 N3TEE 多应用环境本身不限定开发语言，本套API
为采用Java 语言，参照了java.lang.NegativeArraySizeException 的定义。  
5.2.13.23.3. 
构造器 
NegativeArraySizeException 
public NegativeArraySizeException() 
构建一个新的NegativeArraySizeException 实例。 
5.2.13.24. NullPointerException 
5.2.13.24.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
中国银联 
版权所有

---
**[p212]**

211 
 
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.NullPointerException 
public class NullPointerException extends RuntimeException 
5.2.13.24.2. 
描述 
当应用程序试图在需要对象的地方使用 null 时，抛出该异常。这种情况包括：  
(1) 调用 null 对象的实例方法。  
(2) 访问或修改 null 对象的字段。  
(3) 将 null 作为一个数组，获得其长度。  
(4) 将 null 作为Throwable 值抛出。  
5.2.13.24.3. 
构造器 
NullPointerException 
public NullPointerException() 
构建一个新的 NullPointerException 实例。 
NullPointerException 
public NullPointerException(String s) 
构造带指定详细消息的NullPointerException。 
参数: 
 s - 详细消息。 
5.2.13.25. NumberFormatException 
5.2.13.25.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.IllegalArgumentException 
      | 
      +--java.lang.NumberFormatException 
中国银联 
版权所有

---
**[p213]**

212 
 
public class NumberFormatException extends IllegalArgumentException 
5.2.13.25.2. 
描述 
当应用程序试图将字符串转换成一种数值类型，但该字符串不能转换为适当格式时，抛
出该异常。 
5.2.13.25.3. 
构造器 
NumberFormatException 
public NumberFormatException() 
构造不带详细消息的 NumberFormatException。 
NumberFormatException 
public NumberFormatException(String s) 
构造带指定详细消息的 NumberFormatException。 
参数: 
 s - 详细消息。 
5.2.13.26. RuntimeException 
5.2.13.26.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
直接已知子类: 
ArithmeticException, 
ArrayStoreException, 
ClassCastException, 
EmptyStackException, 
IllegalArgumentException, 
IllegalStateException, 
IndexOutOfBoundsException, NegativeArraySizeException, NoSuchElementException, 
NullPointerException, SecurityException, TEERuntimeException 
public class RuntimeException extends Exception 
5.2.13.26.2. 
描述 
RuntimeException 是那些可能在 Java 虚拟机正常运行期间抛出的异常的超类。  
可能在执行方法期间抛出但未被捕获的RuntimeException 的任何子类都无需在 throws 
子句中进行声明。 
中国银联 
版权所有

---
**[p214]**

213 
 
5.2.13.26.3. 
构造器 
RuntimeException 
public RuntimeException() 
构建一个新的RuntimeException 实例。 
RuntimeException 
public RuntimeException(String s) 
用指定的详细消息和原因构造一个新的运行时异常。 
参数: 
 
s - 详细消息。 
5.2.13.27. SecurityException 
5.2.13.27.1. 
声明 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.SecurityException 
public class SecurityException extends RuntimeException 
5.2.13.27.2. 
描述 
N3TEE 运行环境在检测到威胁时，会抛出SecurityException 异常。  
安全威胁包括但不限于： 1. 试图访问不属于当前应用的对象。 2. 试图调用另外一个
类的私有方法。  
5.2.13.27.3. 
构造器 
SecurityException 
public SecurityException() 
构建一个新的 SecurityException 示例。 
5.2.13.28. StringIndexOutOfBoundsException 
5.2.13.28.1. 
声明 
中国银联 
版权所有

---
**[p215]**

214 
 
java.lang.Object 
   | 
+--java.lang.Throwable  
     | 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.lang.IndexOutOfBoundsException 
        | 
+--java.lang.StringIndexOutOfBoundsException 
public class StringIndexOutOfBoundsException 
extends IndexOutOfBoundsException 
5.2.13.28.2. 
描述 
此异常由 String 方法抛出，指示索引或者为负，或者超出字符串的大小。对诸如 
charAt 的一些方法，当索引等于字符串的大小时，也会抛出该异常。 
5.2.13.28.3. 
构造器 
StringIndexOutOfBoundsException 
public StringIndexOutOfBoundsException() 
构造不带详细消息的 StringIndexOutOfBoundsException。 
StringIndexOutOfBoundsException 
public StringIndexOutOfBoundsException(String s) 
构造带指定详细消息的 StringIndexOutOfBoundsException。 
参数: 
 s - 详细消息。 
StringIndexOutOfBoundsException 
public StringIndexOutOfBoundsException(int index) 
构造一个新的 StringIndexOutOfBoundsException 类，该类带有一个指示非法索引的参
数。 
参数: 
 index - 非法索引。 
5.2.13.29. Error 
5.2.13.29.1. 
声明 
java.lang.Object 
  | 
中国银联 
版权所有

---
**[p216]**

215 
 
+--java.lang.Throwable 
     | 
+--java.lang.Error 
直接已知子类: 
NoSuchFieldError, VirtualMachineError 
public class Error extends Throwable 
5.2.13.29.2. 
描述 
Error 是 Throwable 的子类，用于指示合理的应用程序不应该 试图捕获的严重问
题。大多数这样的错误都是异常条件。 在执行该方法期间，无需在其throws 子句中声明
可能抛出但是未能捕获 的 Error 的任何子类，因为这些错误可能是再也不会发生的异常
条件。 
5.2.13.29.3. 
构造器 
Error 
public Error() 
构造详细消息为 null 的新错误。 
Error 
public Error(String s) 
构造带指定详细消息的新错误。 
参数: 
 s - 详细消息。 
5.2.13.30. NoSuchFieldError 
5.2.13.30.1. 
声明 
java.lang.Object 
  | 
+--java.lang.Throwable 
      | 
+--java.lang.Error 
     | 
+--java.lang.NoSuchFieldError 
public class NoSuchFieldError extends Error 
5.2.13.30.2. 
描述 
类不包含指定名称的字段时产生的信号。 
中国银联 
版权所有

---
**[p217]**

216 
 
5.2.13.30.3. 
构造器 
NoSuchFieldError 
public NoSuchFieldError() 
构造方法。 
NoSuchFieldError 
public NoSuchFieldError(String s) 
带有详细消息的构造方法。 
参数: 
 s - 详细消息。 
5.2.13.31. OutOfMemoryError 
5.2.13.31.1. 
声明 
java.lang.Object 
  | 
+--java.lang.Throwable 
      | 
+--java.lang.Error 
      | 
+--java.lang.VirtualMachineError 
     |  
+--java.lang.OutOfMemoryError 
public class OutOfMemoryError extends VirtualMachineError 
5.2.13.31.2. 
描述 
因为内存溢出或没有可用的内存提供给垃圾回收器时，Java 虚拟机无法分配一个对象，
这时抛出该异常。 
5.2.13.31.3. 
构造器 
OutOfMemoryError 
public OutOfMemoryError() 
构造不带详细消息的 OutOfMemoryError。 
OutOfMemoryError 
public OutOfMemoryError(String s) 
构造带指定详细消息的 OutOfMemoryError。 
参数: 
 s - 详细消息。 
中国银联 
版权所有

---
**[p218]**

217 
 
5.2.13.32. VirtualMachineError 
5.2.13.32.1. 
声明 
java.lang.Object 
  | 
+--java.lang.Throwable 
      | 
+--java.lang.Error 
     | 
+--java.lang.VirtualMachineError 
直接已知子类: 
OutOfMemoryError。 
public abstract class VirtualMachineError extends Error 
5.2.13.32.2. 
描述 
当 Java 虚拟机崩溃或用尽了它继续操作所需的资源时，抛出该错误。  
5.2.13.32.3. 
构造器 
VirtualMachineError 
public VirtualMachineError() 
构造不带详细消息的 VirtualMachineError。 
VirtualMachineError 
public VirtualMachineError(String s) 
构造带指定详细消息的 VirtualMachineError。 
参数: 
 s - 详细消息。 
5.2.14.  java.util 
5.2.14.1. 
描述 
该包提供了集合操作操作实用类。 
5.2.14.2. 
Enumeration<E> 
5.2.14.2.1. 声明 
public interface Enumeration<E> 
中国银联 
版权所有

---
**[p219]**

218 
 
5.2.14.2.2. 描述 
实现 Enumeration 接口的对象，它生成一系列元素，一次生成一个。连续调用 
nextElement 方法将返回一系列的连续元素。  
例如，要输出 Vector v 的所有元素，可使用以下方法：  
      for (Enumeration e = v.elements() ; e.hasMoreElements() ;) { 
          System.out.println(e.nextElement()); 
       } 
  
这些方法主要通过向量的元素、哈希表的键以及哈希表中的值进行枚举。 
另请参阅: 
nextElement(), Hashtable, Hashtable.elements(), Hashtable.keys(), Vector。 
5.2.14.2.3. 方法 
hasMoreElements 
boolean hasMoreElements() 
测试此枚举是否包含更多的元素。 
返回: 
当且仅当此枚举对象至少还包含一个可提供的元素时，才返回 true；否则返回 false。 
nextElement 
E nextElement() 
如果此枚举对象至少还有一个可提供的元素，则返回此枚举的下一个元素。 
返回: 
 
此枚举的下一个元素。 
抛出: 
 
NoSuchElementException - 如果没有更多的元素存在。 
5.2.14.3. 
Iterator<E> 
5.2.14.3.1. 声明 
public interface Iterator<E> 
5.2.14.3.2. 描述 
对 collection 进行迭代的迭代器。 适合用在"foreach"语句中。 
5.2.14.3.3. 方法 
中国银联 
版权所有

---
**[p220]**

219 
 
hasNext 
boolean hasNext() 
如果仍有元素可以迭代，则返回 true。 
返回: 
 
如果迭代器具有多个元素，则返回 true。 
next 
E next() 
返回迭代的下一个元素。 
返回: 
 
迭代的下一个元素。 
抛出: 
 
NoSuchElementException - 没有元素可以迭代。 
5.2.14.4. 
Hashtable<K,V> 
5.2.14.4.1. 声明 
java.lang.Object 
   | 
+--java.util.Hashtable<K,V> 
public class Hashtable<K,V> extends Object 
5.2.14.4.2. 描述 
此类实现一个哈希表，该哈希表将键映射到相应的值。任何非 null 对象都可以用作键
或值。  
为了成功地在哈希表中存储和获取对象，用作键的对象必须实现 hashCode 方法和
equals 方法。  
Hashtable 的实例有两个参数影响其性能：初始容量和加载因子。容量 是哈希表中桶
的数量，加载因子是对哈希表在其容量自动增加之前可以达到多满的一个尺度。 加载因子
在本实现中固定为75%。当桶的使用数量超过这个比率时，会通过调用rehash 增加同的数
量。  
如果很多条目要存储在一个 Hashtable 中，那么与根据需要执行自动 rehashing 操作
来增大表的容量的做法相比，使用足够大的初始容量创建哈希表或许可以更有效地插入条
目。  
下面这个示例创建了一个数字的哈希表。它将数字的名称用作键：  
 Hashtable numbers = new Hashtable(); 
 numbers.put("one", new Integer(1)); 
 numbers.put("two", new Integer(2)); 
 numbers.put("three", new Integer(3)); 
要获取一个数字，可以使用以下代码：  
中国银联 
版权所有

---
**[p221]**

220 
 
 Integer n = (Integer) numbers.get("two"); 
 if (n != null) { 
     System.out.println("two = " + n); 
 } 
   这个类可以保证线程安全(synchronzied)。 
5.2.14.4.3. 构造器 
Hashtable 
public Hashtable(int initialCapacity) 
用指定初始容量和默认的加载因子 (0.75) 构造一个新的空哈希表。 
参数: 
initialCapacity - 哈希表的初始容量。 
抛出: 
IllegalArgumentException - 如果初始容量小于零。 
Hashtable 
public Hashtable() 
用默认的初始容量 (11) 和加载因子 (0.75) 构造一个新的空哈希表。 
5.2.14.4.4. 方法 
size 
public int size() 
返回此哈希表中的键的数量。 
返回: 
 此哈希表中的键的数量。 
isEmpty 
public boolean isEmpty() 
测试此哈希表是否没有键映射到值。 
返回: 
 如果此哈希表没有将任何键映射到值，则返回 true；否则返回 false。 
keys 
public Enumeration<K> keys() 
返回此哈希表中的键的枚举。 
返回: 
 此哈希表中的键的枚举。 
另请参阅: 
Enumeration, elements()。 
中国银联 
版权所有

---
**[p222]**

221 
 
elements 
public Enumeration<V> elements() 
返回此哈希表中的值的枚举。对返回的对象使用 Enumeration 方法，以便按顺序获取这
些元素。 
返回: 
 此哈希表中的值的枚举。 
另请参阅: 
Enumeration, keys()。 
contains 
public boolean contains(Object value) 
测试此映射表中是否存在与指定值关联的键。此操作比 containsKey 方法的开销更大。 
参数: 
 value - 要搜索的值。 
返回: 
 当且仅当此哈希表中某个键映射到 value 参数（由 equals 方法确定）时，返回 
true；否则返回 false。 
抛出: 
 NullPointerException - 如果该值为 null 
另请参阅: 
containsKey(java.lang.Object)。 
containsKey 
public boolean containsKey(Object key) 
测试指定对象是否为此哈希表中的键。 
参数: 
key - 可能的键 
返回: 
当且仅当指定对象（由 equals 方法确定）是此哈希表中的键时，才返回 true；否则返
回 false。 
另请参阅: 
contains(java.lang.Object)。 
get 
public V get(K key) 
返回指定键所映射到的值，如果此映射不包含此键的映射，则返回 null. 
参数: 
 key - 要返回其相关值的键。 
返回: 
 指定键映射到的值，如果此映射不包含到键的映射，则返回 null。 
另请参阅: 
put(java.lang.Object, java.lang.Object)。 
中国银联 
版权所有

---
**[p223]**

222 
 
put 
public V put(K key, V value) 
将指定 key 映射到此哈希表中的指定 value。  
参数: 
 key - 键值。 
 value - 待赋值。 
返回: 
 该键值映射的原值，为空则返回null。 
抛出: 
 NullPointerException - key 或value 参数为 null。 
另请参阅: 
Object.equals(java.lang.Object), get(java.lang.Object)。 
remove 
public V remove(K key) 
从哈希表中移除该键及其相应的值。如果该键不在哈希表中，则此方法不执行任何操作。 
参数: 
 key - 需要移除的键。 
返回: 
 此哈希表中与该键存在映射关系的值；如果该键没有映射关系，则返回 null。 
clear 
public void clear() 
将此哈希表清空，使其不包含任何键。 
equals 
public boolean equals(Object o) 
按照 Map 接口的定义，比较指定 Object 与此 Map 是否相等。 
参数: 
 - 将与此哈希表进行比较相等性的对象。 
返回: 
 如果指定的 Object 与此 Map 相等，则返回 true。 
hashCode 
public int hashCode() 
按照 Map 接口的定义，返回此 Map 的哈希码值。 
返回: 
 此对象的一个哈希码值。 
另请参阅: 
Object.equals(Object), equals(Object) 
5.2.14.5. 
Stack 
中国银联 
版权所有

---
**[p224]**

223 
 
5.2.14.5.1. 声明 
java.lang.Object 
  |  
+--java.util.Vector 
      | 
+--java.util.Stack 
public class Stack extends Vector 
5.2.14.5.2. 描述 
Stack 类表示后进先出（LIFO）的对象堆栈。它通过五个操作对类 Vector 进行了扩展 ，
允许将向量视为堆栈。它提供了通常的 push 和 pop 操作，以及取堆栈顶点的 peek 方法、
测试堆栈是否为空的 empty 方法、在堆栈中查找项并确定到堆栈顶距离的 search 方法。  
首次创建堆栈时，它不包含项。  
5.2.14.5.3. 构造器 
Stack 
public Stack() 
创建一个空堆栈。 
5.2.14.5.4. 方法 
push 
public Object push(Object item) 
把项压入堆栈顶部。其作用与下面的方法完全相同：  
 addElement(item) 
参数: 
 item - 压入堆栈的项。 
返回: 
 item 项。 
另请参阅: 
Vector.addElement(java.lang.Object)。 
pop 
public Object pop() 
移除堆栈顶部的对象，并返回该对象作为此函数的值。 
返回: 
 堆栈顶部的对象（Vector 对象中的最后一项）。 
抛出: 
中国银联 
版权所有

---
**[p225]**

224 
 
 EmptyStackException - 如果堆栈为空。 
peek 
public Object peek() 
查看堆栈顶部的对象，但不从堆栈中移除它。 
返回: 
 堆栈顶部的对象（Vector 对象的最后一项。 
抛出: 
 EmptyStackException - 如果堆栈为空。 
empty 
public boolean empty() 
测试堆栈是否为空。 
返回: 
 当且仅当堆栈中不含任何项时返回 true；否则返回 false。 
search 
public int search(Object o) 
返回对象在堆栈中的位置，以 1 为基数。如果对象 o 是堆栈中的一个项，此方法返回距
堆栈顶部最近的出现位置到堆栈顶部的距离；堆栈中最顶部项的距离为 1。使用 equals 
方法比较对象 o 与堆栈中的项。 
参数: 
 - 目标对象。 
返回: 
 对象到堆栈顶部的位置，以 1 为基数；返回值 -1 表示此对象不在堆栈中。 
5.2.14.6. 
Vector 
5.2.14.6.1. 声明 
java.lang.Object 
  | 
+--java.util.Vector 
直接已知子类: 
Stack 
public class Vector extends Object 
5.2.14.6.2. 描述 
Vector 类可以实现可增长的对象数组。与数组一样，它包含可以使用整数索引进行访
问的组件。但是，Vector 的大小可以根据需要增大或缩小，以适应创建 Vector 后进行添
加或移除项的操作。  
中国银联 
版权所有

---
**[p226]**

225 
 
每个向量会试图通过维护 capacity 和 capacityIncrement 来优化存储管理。
capacity 始终至少应与向量的大小相等；这个值通常比后者大些，因为随着将组件添加到
向量中，其存储将按 capacityIncrement 的大小增加存储块。应用程序可以在插入大量组
件前增加向量的容量；这样就减少了增加的重分配的量。  
由 Vector 的 iterator 和 listIterator 方法所返回的迭代器是快速失败的：如果在
迭代器创建后的任意时间从结构上修改了向量（通过迭代器自身的 remove 或 add 方法之
外的任何其他方式），则迭代器将抛出 ConcurrentModificationException。因此，面对并
发的修改，迭代器很快就完全失败，而不是冒着在将来不确定的时间任意发生不确定行为的
风险。Vector 的 elements 方法返回的 Enumeration 不是 快速失败的。 注意，迭代器的
快速失败行为不能得到保证，一般来说，存在不同步的并发修改时，不可能作出任何坚决的
保证。快速失败迭代器尽最大努力抛出 ConcurrentModificationException。因此，编写依
赖于此异常的程序的方式是错误的，正确做法是：迭代器的快速失败行为应该仅用于检测 
bug。  
5.2.14.6.3. 构造器 
Vector 
public Vector(int initialCapacity, 
      int capacityIncrement) 
使用指定的初始容量和容量增量构造一个空的向量。 
参数: 
 
initialCapacity - 向量的初始容量。 
 
capacityIncrement - 当向量溢出时容量增加的量。 
抛出: 
 
IllegalArgumentException - 如果指定的初始容量为负数。 
Vector 
public Vector(int initialCapacity) 
使用指定的初始容量和等于零的容量增量构造一个空向量。 
参数: 
 initialCapacity - 向量的初始容量。 
Vector 
public Vector() 
构造一个空向量，使其内部数据数组的大小为 10，其标准容量增量为零。 
5.2.14.7. 
EmptyStackException 
5.2.14.7.1. 声明 
java.lang.Object 
  | 
+--java.lang.Throwable 
      | 
中国银联 
版权所有

---
**[p227]**

226 
 
+--java.lang.Exception 
      | 
+--java.lang.RuntimeException 
      | 
+--java.util.EmptyStackException 
public class EmptyStackException extends RuntimeException 
5.2.14.7.2. 描述 
该异常由 Stack 类中的方法抛出，以表明堆栈为空。 
5.2.14.7.3. 构造器 
EmptyStackException 
public EmptyStackException() 
构建一个不带详细信息EmptyStackException 对象。 
5.2.14.7.4. 方法 
copyInto 
public void copyInto(Object[] anArray) 
将此向量的组件复制到指定的数组中。此向量中索引 k 处的项将复制到 anArray 的组件 
k 中。 
参数: 
 anArray - 要将组件复制到其中的数组。 
trimToSize 
public void trimToSize() 
对此向量的容量进行微调，使其等于向量的当前大小。如果此向量的容量大于其当前大
小，则通过将其内部数据数组（保存在字段 elementData 中）替换为一个较小的数组，从
而将容量更改为等于当前大小。应用程序可以使用此操作最小化向量的存储。 
ensureCapacity 
public void ensureCapacity(int minCapacity) 
增加此向量的容量（如有必要），以确保其至少能够保存最小容量参数指定的组件数。 
参数: 
 
minCapacity - 需要的最小容量。 
setSize 
public void setSize(int newSize) 
设置向量的大小，如果新的大小大于目前的大小，新的空项添加到向量的尾部。如果新
中国银联 
版权所有

---
**[p228]**

227 
 
的大小小于当前大小，索引newSize 处成员以及之后的所有成员被丢弃。 
参数: 
 newSize – 该向量新的大小。 
抛出: 
 ArrayIndexOutOfBoundsException – 如果大小是负数。 
capacity 
public int capacity() 
返回此向量的当前容量。 
返回: 
 当前容量（保存在此向量的 elementData 字段中的内部数据数组的长度）。 
size 
public int size() 
返回此向量中的组件数。 
返回: 
 此向量中的组件数。 
isEmpty 
public boolean isEmpty() 
测试此向量是否不包含组件。 
返回: 
 当且仅当此向量没有组件（也就是说其大小为零）时返回 true；否则返回 false。 
contains 
public boolean contains(Object elem) 
如果此向量包含指定的元素，则返回 true。 
参数: 
 elem - 测试在此向量中是否存在的元素。 
返回: 
 如果此向量包含指定的元素，则返回 true。 
indexOf 
public int indexOf(Object elem) 
返回此向量中第一次出现的指定元素的索引，如果此向量不包含该元素，则返回 -1。 
参数: 
 elem - 要搜索的元素。 
返回: 
 此向量中第一次出现的指定元素的索引；如果此向量不包含该元素，则返回 -1。 
另请参阅: 
Object.equals(java.lang.Object)。 
中国银联 
版权所有

---
**[p229]**

228 
 
indexOf 
public int indexOf(Object elem, 
          int index) 
返回此向量中第一次出现的指定元素的索引，从 index 处正向搜索，如果未找到该元素，
则返回 -1。 
参数: 
 elem - 要搜索的元素。 
 index - 搜索开始处的索引。 
返回: 
 此向量中 index 位置或之后位置处第一次出现的指定元素的索引；如果未找到该
元素，则返回 -1。 
另请参阅: 
Object.equals(java.lang.Object)。 
lastIndexOf 
public int lastIndexOf(Object elem) 
返回此向量中最后一次出现的指定元素的索引；如果此向量不包含该元素，则返回 -1。 
参数: 
 elem - 要搜索的元素。 
返回: 
 此向量中最后一次出现的指定元素的索引；如果此向量不包含该元素，则返回 -1。 
lastIndexOf 
public int lastIndexOf(Object elem, 
                   int index) 
返回此向量中最后一次出现的指定元素的索引，从 index 处逆向搜索，如果未找到该元
素，则返回 -1。 
参数: 
 elem - 要搜索的元素。 
 index - 逆向搜索开始处的索引。 
返回: 
 此向量中小于等于 index 位置处最后一次出现的指定元素的索引；如果未找到该
元素，则返回 -1。 
抛出: 
 IndexOutOfBoundsException - 如果指定索引大于等于此向量的当前大小。 
elementAt 
public Object elementAt(int index) 
返回指定索引处的组件。 
参数: 
 index - 此向量的一个索引。 
返回: 
中国银联 
版权所有

---
**[p230]**

229 
 
 指定索引处的组件。 
抛出: 
 ArrayIndexOutOfBoundsException - 如果该索引超出范围。 
firstElement 
public Object firstElement() 
返回此向量的第一个组件（位于索引 0) 处的项）。 
返回: 
 此向量的第一个组件。 
抛出: 
 NoSuchElementException - 如果此向量没有组件。 
lastElement 
public Object lastElement() 
返回此向量的最后一个组件。 
返回: 
 向量的最后一个组件，即索引 size() - 1 处的组件。 
抛出: 
 NoSuchElementException - 如果此向量为空。 
setElementAt 
public void setElementAt(Object obj, 
                int index) 
将此向量指定 index 处的组件设置为指定的对象。丢弃该位置以前的组件。  
索引必须为一个大于等于 0 且小于向量当前大小的值。 
参数: 
 obj - 将用来设置组件的内容。 
 index - 指定的索引。 
抛出: 
 ArrayIndexOutOfBoundsException - 如果索引超出范围。 
另请参阅: 
size()。 
removeElementAt 
public void removeElementAt(int index) 
删除指定索引处的组件。此向量中的每个索引大于等于指定 index 的组件都将下移，
使其索引值变成比以前小 1 的值。此向量的大小将减 1。  
索引必须为一个大于等于 0 且小于向量当前大小的值。 
参数: 
 
index - 要移除对象的索引。 
抛出: 
 
ArrayIndexOutOfBoundsException - 如果索引超出范围。 
中国银联 
版权所有

---
**[p231]**

230 
 
另请参阅: 
size()。 
insertElementAt 
public void insertElementAt(Object obj, 
                   int index) 
将指定对象作为此向量中的组件插入到指定的 index 处。此向量中的每个索引大于等
于指定 index 的组件都将向上移位，使其索引值变成比以前大 1 的值。  
索引必须为一个大于等于 0 且小于等于向量当前大小的值（如果索引等于向量的当前
大小，则将新元素添加到向量）。 
参数: 
 
obj - 要插入的组件。 
 
index - 新组件的插入位置。 
抛出: 
 
ArrayIndexOutOfBoundsException - 如果索引超出范围。 
另请参阅: 
size()。 
addElement 
public void addElement(Object obj) 
将指定元素添加到此向量的末尾。 如果容量不够，容量会自动增加。 
参数: 
 
obj - 要添加到此向量的元素。 
removeElement 
public boolean removeElement(Object obj) 
从此向量中移除变量的第一个（索引最小的）匹配项。如果在此向量中找到该对象，那
么向量中索引大于等于该对象索引的每个组件都会下移，使其索引值变成比以前小 1 的值。 
参数: 
 
obj - 要移除的组件。 
返回: 
 
如果变量值是此向量的一个组件，则返回 true；否则返回 false。 
removeAllElements 
public void removeAllElements() 
从此向量中移除全部组件，并将其大小设置为零。 
equals 
public boolean equals(Object o) 
比较指定对象与此向量的相等性。当且仅当指定的对象也是一个 Vector、两个 比较指
定对象与此向量的相等性。当且仅当指定的对象也是一个 Vector、两个 Vector 大小相同，
并且其中所有对应的元素对都相等 时才返回 true。（大小相同，并且其中所有对应的元素
中国银联 
版权所有

---
**[p232]**

231 
 
对都相等 时才返回 true。 换句话说，如果两个 List 包含相同顺序的相同元素，则这两
个 List 就定义为相等。 
参数: 
 
- 要与此向量进行相等性比较的对象。 
返回: 
 
如果指定的 Object 与此向量相等，则返回 true。 
hashCode 
public int hashCode() 
返回此向量的哈希码值。 哈希码值按照下面的方法进行计算：  
  int hashCode = 1; 
  Iterator<E> i = list.iterator(); 
  while (i.hasNext()) { 
      E obj = i.next(); 
      hashCode = 31*hashCode + (obj==null ? 0 : obj.hashCode()); 
  } 
返回: 
 此向量的哈希码值。 
另请参阅: 
Object.equals(java.lang.Object), Hashtable。 
5.2.14.8. 
NoSuchElementException 
5.2.14.8.1. 声明 
java.lang.Object 
  |  
+--java.lang.Throwable 
      | 
+--java.lang.Exception 
     | 
+--java.lang.RuntimeException 
    | 
+--java.util.NoSuchElementException 
public class NoSuchElementException extends RuntimeException 
5.2.14.8.2. 描述 
由Enumeration 的 nextElement 方法抛出，表明枚举中没有更多的元素 
5.2.14.8.3. 构造器 
中国银联 
版权所有

---
**[p233]**

232 
 
NoSuchElementException 
public NoSuchElementException() 
构造一个 NoSuchElementException，用 null 作为其错误消息字符串。 
NoSuchElementException 
public NoSuchElementException(String s) 
构造一个 NoSuchElementException，保存对错误消息字符串 s 的引用，以便将来通过 
getMessage 方法进行获取。 
参数: 
 s - 错误消息。 
 
中国银联 
版权所有

---
**[p234]**

233 
 
6. 基于IA 可信硬件架构进行实现 
6.1. 综述 
可信执行环境（TEE，Trusted Execution Environment）是一个独立的执行环境，包含
硬件和固件，同多媒体执行环境（REE, Rich Execution Environment）一同工作并提供安
全服务。可信执行环境将它的硬件和软件资源的访问，同多媒体执行环境和它的应用进行了
隔离。 
可信应用（TA，Trusted Application）是由可信执行环境提供安全执行，并验证授权
的安全的软件或固件。可信应用在IA 可信硬件架构上由JAVA 语言开发，并在运行时动态加
载到可信执行环境中。在可信执行环境中，每一个可信应用是独立于其它可信应用的。并且
可信执行环境会强制对这些可信应用的资源和数据做安全性、完整性和访问权限的保护。一
个可信应用对其它可信应用的安全资产不可以执行未被授权的访问操作。 
可信执行环境通过可信应用编程接口对可信应用提供对安全资源和服务的受控访问。这
些服务包括，密码学相关功能，安全存储，安全输入输出，NFC，等。 
一个可信应用需要一个位于多媒体执行环境的客户端应用编程接口服务提供访问支持，
该客户端应用编程接口是一个底层的通信接口，它被用来帮助在多媒体执行环境运行的客户
端应用同在可信执行环境中运行的可信应用之间访问和交换数据，开发者可以通过该客户端
应用编程接口访问可信执行环境下的可信应用及其相关安全服务。 
6.2. 可信应用编程接口 
6.2.1. 接口集概述 
本部分所定义的可信应用编程接口集是IA 可信硬件架构基于N3TEE 指南实现所定义的
一套可信应用编程接口集。它有效结合了IA 可信硬件架构的主要硬软件功能，能够较好地
适配IA 可信硬件架构上基于虚拟机开发的运行环境。因此，本部分适用于符合N3TEE 指南
的基于IA 可信硬件架构的N3TEE 相关产品开发。主要提供了如下安全相关功能的应用编程
接口： 
-- 密码学功能； 
-- 单调计数器； 
-- 近场通信； 
-- 安全输入，安全输出； 
-- 安全时间； 
-- 安全存储； 
-- SSL； 
-- 系统util； 
根据本部分参考文档开发的应用在生成可执行文件时需要进行一些包结构方面的转换，
使得符合N3TEE 指南的应用能够在基于IA 可信硬件架构芯片生产的产品（如Intel 系列产
品）上更好地实施部署。 
以下所列Java 包即为N3TEE 在IA 可信硬件架构上所必须实现的基础接口集，主要有； 
表7 N3TEE IA 架构相关Java 包 
Java 包名称 
描述 
中国银联 
版权所有

---
**[p235]**

234 
 
com.cup.crypto 
提供密码学服务相关接口 
com.cup.langutil 
提供语言util 相关扩展 
com.cup.nfc 
提供服务接口，使得可信应用可以识别以及同非接智能卡通
讯 
com.cup.ui 
提供服务接口客制化用户对话框，并且可以使用受保护的方
式进行显示 
com.cup.util 
供其他可信应用可用到util 的服务接口 
 
6.2.2. com.cup.crypto 
6.2.2.1. 接口概述 
6.2.2.1.1. 简要功能描述 
本章节接口设计主要有四个目的： 
—— 数据完整性 – 确保数据只能被授权方创立或修改。 
—— 机密性 – 限定只有授权方才有访问权限。 
—— 身份验证 – 验证识别身份特性。 
—— 抗抵赖性 – 核实操作或数据。 
主要使用两种方法加密数据： 
—— 对称密钥加密算法： 
 
对加密以及解密操作使用同一个密钥。 
—— 公开（非对称）密钥算法： 
 
加密 – 一个公钥被用于加密操作；一个私钥被用于解密操作。 
 
数字签名 – 一个私钥被用于签名操作；一个公钥被用于验证操作。 
 
在提供对称密钥算法、非对称密钥算法、哈希算法等主要算法功能以外， 还根据可信
应用的存储和通信需要提供了对“平台绑定密钥”和SSL 协议的支持。 
6.2.2.1.1.1. 
平台绑定密钥(Pbind) 
可信应用通常不会获得并被分配非易失的存储空间。然而，可信应用仍然需要一种机制
将数据安全地存储在客户端侧。 
为了这个目的，特殊的“平台绑定密钥”相关的安全加密及签名应用程序接口被提供给
可信应用调用。这个密钥本身被安全地存放在虚拟机的存储中并且不会暴露给可信应用程序
可见。每个平台的绑定密钥对机器、可信应用和算法来说都是唯一的。一个可信应用程序可
以将它需要存储的数据做加密并签名，然后传递给客户端应用，存储到客户端侧的非易失性
存储介质上。为了防止恶意软件进行重放攻击，利用旧版本的数据来替换存储在非易失性存
储介质上现有的数据，可信应用程序可以调用单调计数器的应用程序接口，将此信息添加到
原始数据中并验证数据是否是正确的版本。 
中国银联 
版权所有

---
**[p236]**

235 
 
6.2.2.1.1.2. 
SSL 
可信应用可以使用PKI同远端服务器建立一个SSL连接。 
—— 协议版本SSL3.0, TLS1.0, TLS1.1 
—— 会话加密方式 
 
RSA-AES 
 
RSA-RC4 
 
RSA 密钥长度：1024，2048，4096 
—— 支持唯服务器鉴权认证 
—— 使用CRLs 支持撤回机制 
—— TLS 客户端支持多数据块以及整个数据包 
—— TLS 客户端支持安全选项的配置 
6.2.2.1.2. 相关接口描述 
该包提供了一个密码学服务的接口。 
关键类和接口 
描述 
HashAlg 类 
实现标准哈希算法。 
SymmetricBlockCipherAlg 类 实现标准的对称加密算法。 
SymmetricSignatureAlg 类 
实现标准的对称签名算法。 
RsaAlg 类 
实现RSA 加密和签名算法。 
 
接口摘要： 
接口 
描述 
Cipher 
该接口提供了一个加密算法。 
Hash 
该接口提供了一个哈希算法。 
SecureSession 
该接口提供了一个安全对话。 
SequentialCipher 
该接口是一个加密接口的扩展。 
SequentialSignature 
该接口是一个基本签名接口的扩展。 
Signature 
该接口提供了一个签名算法。 
StreamCipher 
该接口提供了一个数据流加密算法。 
 
类摘要： 
类 
描述 
CertificateStore 
该类提供一个证书存储。 
HashAlg 
该抽象类提供一个哈希算法。 
PasswordKeyDerivationAlg 
该抽象类提供一个密钥扩展算法，基于PBKDF2。 
中国银联 
版权所有

---
**[p237]**

236 
 
Random 
该类提供一个随机数生成器来生成可变字节长度的随机
数。 
RsaAlg 
该抽象类提供RSA 加密和签名算法。 
SslSession 
该抽象类提供一个SSL 会话。这个类实现了包括数据流加
密和安全会话接口，允许同远端SSL 服务器建立一个安全
的SSL 会话，并在这个对话中传递加密的数据。 
SslSession.CertificateInfo 该类提供了在握手阶段从SSL 服务器接收到的整个证书链
中的单一证书的信息。 
SslSession.Crl 
该类提供了一个证书撤销列表对象。 
SymmetricBlockCipherAlg 
该抽象类提供了一个对称加密算法。 
SymmetricSignatureAlg 
该抽象类提供了一个对称签名算法。 
 
异常摘要： 
异常 
描述 
ComputationException 
提供一个加密算法的异常，当由于提供不正确参数导致方法
失败，或者其他任何加密算法发生计算错误的时候被抛出。 
CryptoException 
提供一个常规的加密算法的异常。 
IllegalParameterException 提供一个加密算法的异常，当一个或者多个输入参数是无效
的时候被抛出。 
IllegalUseException 
提供一个加密算法的异常，当用户创建的若干操作流程是非
法的时候被抛出。 
NotInitializedException 
提供一个加密算法的异常，当一个对象还没有被正确初始化
前就被使用时被抛出。 
NotSupportedException 
提供一个加密算法的异常，当一个方法或者提供的参数没有
被一个实例支持的时候，或者当用户尝试去创建一个不支持
的算法的实例的时候被抛出。 
OperationFailedException 
提供一个加密算法的异常，当用户的请求无法被执行的时候
被抛出。 
OutOfResourcesException 
提供一个加密算法的异常，当用户的请求由于系统当前没有
可用资源而无法被执行的时候被抛出。 
 
6.2.2.2. 接口 
6.2.2.2.1. 加密 
com.cup.crypto 
中国银联 
版权所有

---
**[p238]**

237 
 
Interface Cipher 
 
所有已知子接口： 
SequentialCipher 
 
所有已知实现的类： 
RsaAlg, SymmetricBlockCipherAlg 
 
public interface Cipher 
 
该接口提供了一个加密算法。该接口只支持无状态操作，所有的数据在一个方法调用中
被处理。 
 
方法摘要： 
修饰符和类型 
方法和描述 
short 
decryptComplete(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用在当前实例中存储的密钥对提供的输入数据进行解密
操作。 
short 
encryptComplete(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用在当前实例中存储的密钥对提供的输入数据进行加密
操作。 
 
6.2.2.2.2. 哈希算法 
com.cup.crypto 
Interface Hash 
 
所有已知实现的类： 
HashAlg 
 
public interface Hash 
 
该接口提供了一个哈希算法。该接口支持： 
-- 无状态操作，在一个方法调用中处理所有数据。 
-- 顺序操作，多次调用这个接口并将数据分成几个数据块进行处理。 
请注意在顺序操作中如果一个算法的实例抛出一个异常，这个实例将无法继续被使用。
一个新的实例需要被重新创建来继续进行顺序操作。 
 
中国银联 
版权所有

---
**[p239]**

238 
 
方法摘要： 
修饰符和类型 
方法和描述 
short 
getHashAlg() 
 
返回这个哈希实例使用的具体哈希算法。 
short 
getHashLength() 
 
返回这个哈希实例所计算的哈希值的长度。 
short 
processComplete(byte[] input, short inputIndex, short 
inputLength, byte[] outputArray, short outputIndex) 
 
对输入的数据做哈希操作并得出结果。 
void 
processUpdate(byte[] input, short inputIndex, short 
inputLength) 
 
对输入数据做哈希操作，并将中间哈希值保存在该实例的内
部上下文中。 
 
6.2.2.2.3. 安全会话 
com.cup.crypto 
Interface SecureSession 
 
所有已知实现的类： 
SslSession 
 
public interface SecureSession 
 
该接口提供一个安全会话。该接口内部有区分多种状态，每一次的接口调用通过内部状
态改变来实现握手或者销毁等目的。  
 
方法摘要： 
修饰符和类型 
方法和描述 
void 
destroy() 
 
销毁一个会话并清除系统中所占资源。 
int 
getFailure() 
 
返回该安全会话的最后一个失败ID。 
short 
getMaxBufferLength() 
 
返回函数performHandshake() 输入缓存能接受的最大字
节数。 
中国银联 
版权所有

---
**[p240]**

239 
 
boolean 
hasMoreOutput() 
 
返回最后操作是否已经加载到输出缓存中。当返回值为真的
时候将没有更多输入被提供给这个会话。 
boolean 
isEstablished() 
 
返回这个安全会话有没有被建立。 
short 
performHandshake(byte[] input, short inputIndex, 
short inputLength, byte[] output, short outputIndex, 
short outputLength) 
 
实现一次握手能够和其他端点建立一个安全会话。 
 
在调用该函数后，调用者需要调用isEstablished 来确认会
话有没有建立。 
 
这个函数有可能需要被多次调用，取决于潜在的会话类型。 
 
6.2.2.2.4. 顺序加密 
com.cup.crypto 
Interface SequentialCipher 
 
所有超接口： 
Cipher 
 
所有已知实现的类： 
SymmetricBlockCipherAlg 
 
public interface SequentialCipher extends Cipher 
 
该接口是基础加密接口的一个扩展。该接口增加支持了顺序加密，通过多次调用接口来
处理多个数据块。 
 
方法摘要： 
修饰符和类型 
方法和描述 
short 
decryptComplete(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用当前存储在实例中的密钥对输入数据做解密操作。 
short 
decryptUpdate(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用当前存储在实例中的密钥对输入数据做解密操作，并维
中国银联 
版权所有

---
**[p241]**

240 
 
护实例的中间状态供下次操作使用。 
short 
encryptComplete(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用当前存储在实例中的密钥对输入数据做加密操作。 
short 
encryptUpdate(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用当前存储在实例中的密钥对输入数据做加密操作，并维
护实例的中间状态供下次操作使用。 
 
6.2.2.2.5. 顺序签名 
com.cup.crypto 
Interface SequentialSignature 
 
所有超接口： 
Signature 
 
所有已知实现的类： 
SymmetricSignatureAlg 
 
public interface SequentialSignature extends Signature 
 
这个接口是一个基础签名接口的扩展。这个接口加入的顺序操作，通过多次调用接口处
理多个数据块。 
 
方法摘要： 
修饰符和类型 
方法和描述 
short 
signComplete(byte[] data, short dataIndex, short 
dataLength, byte[] signature, short signatureIndex) 
 
使用当前存储在实例中的密钥对输入数据做签名操作。 
void 
signUpdate(byte[] data, short dataIndex, short 
dataLength) 
 
使用当前存储在实例中的密钥对输入数据做签名操作，并维
护实例的中间状态供下次操作使用。 
boolean 
verifyComplete(byte[] data, short dataIndex, short 
dataLength, byte[] signature, short signatureIndex, 
short signatureLength) 
中国银联 
版权所有

---
**[p242]**

241 
 
 
使用当前存储在实例中的密钥对输入数据做验证操作。 
void 
verifyUpdate(byte[] data, short dataIndex, short 
dataLength) 
 
使用当前存储在实例中的密钥对输入数据做验证操作，并维
护实例的中间状态供下次操作使用。 
 
6.2.2.2.6. 签名 
com.cup.crypto 
Interface Signature 
 
所有已知超接口： 
SequentialSignature 
 
所有已知实现的类： 
RsaAlg, SymmetricSignatureAlg 
 
public interface Signature 
 
该接口提供一个签名算法。该接口只支持在一次方法调用中，处理所有数据的无状态操
作。 
 
方法摘要： 
修饰符和类型 
方法和描述 
Short 
getSignatureLength() 
 
返回实例生成的签名值的长度。 
short 
signComplete(byte[] data, short dataIndex, short 
dataLength, byte[] signature, short signatureIndex) 
 
使用当前存储在实例中的密钥对输入数据做签名操作。 
boolean 
verifyComplete(byte[] data, short dataIndex, short 
dataLength, byte[] signature, short signatureIndex, 
short signatureLength) 
 
使用当前存储在实例中的密钥对输入数据做签名验证操作。 
 
6.2.2.2.7. 流加密 
com.cup.crypto 
中国银联 
版权所有

---
**[p243]**

242 
 
Interface StreamCipher 
 
所有已知实现的类： 
SslSession 
 
public interface StreamCipher 
 
该接口提供一个流加密算法。输入数据流被加密直到全部处理完成。输出数据被缓存直
到被完全读取。输入输出数据长度并不总能被预先知道，因此调用者不需要为全部的输入输
出数据分配对应长度缓存，可以提供部分的输入，或者是读取部分的输出。状态将由加密算
法内部处理。 
 
方法摘要： 
修饰符和类型 
方法和描述 
short 
decrypt(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex, short 
outputLength) 
 
使用当前存储在实例中的密钥对输入数据做解密操作。 
short 
encrypt(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex, short 
outputLength) 
 
使用当前存储在实例中的密钥对输入数据做加密操作。 
short 
getMaxBufferLength() 
 
返回函数encrypt() 和 decrypt()允许的最大输入缓存的
长度。 
boolean 
hasMoreOutput() 
 
返回最后的操作是否被加入到输出缓存中。当返回为真的时
候，没有更多的输入会被提供给加密算法。 
 
6.2.2.3. 类 
6.2.2.3.1. 证书存储 
com.cup.crypto 
Class CertificateStore 
 
java.lang.Object 
        | 
+--com.cup.crypto.CertificateStore 
中国银联 
版权所有

---
**[p244]**

243 
 
 
public abstract class CertificateStore extends java.lang.Object 
 
该类提供了一种证书存储。可信根证书需要被加入到一个证书存储中，SslSession 会
使用它作为可信源来验证证书链，并同远端SSL 服务器建立安全连接。  
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract void 
addCertificate(byte[] input, short inputIndex, short 
inputLength) 
 
加入一个单一自签名的X.509 v3 证书，以DER 解码格式放
到证书存储中。 
static CertificateStore 
create() 
 
该方法用来建立证书存储实例。 
abstract void 
destroy() 
 
销毁证书存储实例，并将释放那些不会再被其他证书存储所
引用到的证书的系统资源。 
static short 
getMaxCertificateLength() 
 
返回一个单一证书能允许的最大字节值。 
 
由类 java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.2.3.2. 哈希算法 
com.cup.crypto 
Class HashAlg 
 
java.lang.Object 
|  
+--com.cup.crypto.HashAlg 
 
所有实现的接口： 
Hash 
 
public abstract class HashAlg extends java.lang.Object  
implements Hash 
 
中国银联 
版权所有

---
**[p245]**

244 
 
该抽象类提供一个哈希算法。该类实现了哈希算法的接口，并可用create 方法来创建
特有的哈希算法实现。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static short 
HASH_TYPE_SHA1 
 
SHA1 哈希算法。 
static short 
HASH_TYPE_SHA256 
 
SHA256 哈希算法。 
static short 
SHA1_HASH_LENGTH 
 
SHA1 哈希值的字节长度。 
static short 
SHA256_HASH_LENGTH 
 
SHA256 哈希值的字节长度。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static HashAlg 
create(short algType) 
 
建立一个具体实例。 
short 
getHashAlg() 
 
返回被哈希算法实例实际使用的哈希算法。 
 
由类 java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
由接口 com.cup.crypto.Hash 继承的方法 
getHashLength, processComplete, processUpdate 
 
6.2.2.3.3. 密钥扩展算法 
com.cup.crypto 
Class PasswordKeyDerivationAlg 
 
java.lang.Object 
|  
+--com.cup.crypto.PasswordKeyDerivationAlg 
中国银联 
版权所有

---
**[p246]**

245 
 
 
public abstract class PasswordKeyDerivationAlg extends java.lang.Object 
 
该抽象类提供一个密钥扩展算法，基于PBKDF2。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static short 
HASH_TYPE_SHA1 
 
该常量表示在密钥扩展算法中使用SHA1 哈希算法。 
static short 
HASH_TYPE_SHA256 
 
该常量表示在密钥扩展算法中使用SHA256 哈希算法。 
static short 
PASSWORD_MAX_LENGTH 
 
该常量表示密码长度允许的最大值。 
static short 
RANDOM_SALT_LENGTH 
 
该常量表示如果没有salt 被提供，可以被使用的随机salt
值的长度。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static  
PasswordKeyDerivationAlg 
create() 
 
返回一个密钥扩展算法类的实例。 
abstract void 
deriveKey(byte[] password, short passwordIndex, short 
passwordLength, byte[] key, short keyIndex, short 
keyLength) 
 
基于提供的密码创建一个密钥。 
abstract short 
getHashAlgorithm() 
 
返回当前被使用的哈希算法。 
abstract int 
getIterationCount() 
 
返回当前算法运行时的迭代次数。 
static int 
getIterationMaxCount() 
 
返回最大的迭代计数值。 
abstract short 
getSalt(byte[] salt, short saltIndex) 
 
返回当前被使用的salt 缓存值。 
abstract short 
getSaltSize() 
中国银联 
版权所有

---
**[p247]**

246 
 
 
返回当前的salt 大小。 
abstract void 
setHashAlgorithm(short hashAlg) 
 
设置被密钥扩展算法使用的具体的哈希算法类型。 
abstract void 
setIterationCount(int count) 
 
设置算法需要运行的迭代次数。 
abstract void 
setSalt(byte[] 
salt, 
short 
saltIndex, 
short 
saltLength) 
 
设置算法使用的salt 值。 
 
由类 java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.2.3.4. 随机数 
com.cup.crypto 
Class Random 
 
java.lang.Object 
     
|  
+--com.cup.crypto.Random 
 
public final class Random extends java.lang.Object 
 
该类提供一个随机数生成器来产生一个可变字节数的随机数。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static void 
getRandomBytes(byte[] 
destinationArray, 
short 
destinationIndex, short destinationLength) 
 
将输入的数组填充随机数。 
 
由类 java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.2.3.5. RSA 算法 
中国银联 
版权所有

---
**[p248]**

247 
 
com.cup.crypto 
Class RsaAlg 
 
java.lang.Object 
    |  
+--com.cup.crypto.RsaAlg 
 
所有实现的接口： 
Cipher, Signature 
 
public abstract class RsaAlg extends java.lang.Object  
implements Cipher, Signature 
 
该抽象类提供RSA 加密和签名算法。该类实现包括加密和签名接口，并可通过create
方法实例化一个RSA 具体实现类。所有的方法在该类中是独立的。不需要在调用一个方法同
另一个方法之间维护特有状态。 
该类支持下列加密和签名算法：  
-- RSA 加密，支持1024, 2048 和 4096 位密钥长度。 
-- RSA 加密，支持1024, 2048 和 4096 位密钥长度，以及PKCS1 填充方案。 
-- RSA 加密，支持1024, 2048 和 4096 位密钥长度，以及OAEP 填充方案。 
-- RSA 签名，支持1024, 2048 和 4096 位密钥长度，以及SHA1 和SHA256 哈希算法
和PKCS1 填充方案。 
支持1024 位以及2048 位密钥生成算法。在使用该类的功能性方法来做加密或者签名操
作之前，该类需要配置下列参数： 
-- 密钥（使用setKey 或者generateKeys 方法）：公钥用作加密或者验证签名，私钥用
作解密或者签名操作。 
-- 填充方案（使用setPadding 方法）。 
-- 哈希算法（使用setHashAlg 方法）用于签名或者签名验证。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static short 
HASH_TYPE_SHA1 
 
SHA1 哈希算法。 
static short 
HASH_TYPE_SHA256 
 
SHA256 哈希算法。 
static short 
PAD_TYPE_NONE 
 
无填充。 
static short 
PAD_TYPE_OAEP 
 
OAEP 填充方案。 
static short 
PAD_TYPE_PKCS1 
中国银联 
版权所有

---
**[p249]**

248 
 
 
PKCS1 填充方案。 
static short 
PRIVATE_KEY_COMPONENT_TYPE_COEFFICIENT 
 
私钥成员 - coefficient 
static short 
PRIVATE_KEY_COMPONENT_TYPE_DP 
 
私钥成员 - dP 
static short 
PRIVATE_KEY_COMPONENT_TYPE_DQ 
 
私钥成员 - dQ 
static short 
PRIVATE_KEY_COMPONENT_TYPE_P 
 
私钥成员 - prime p 
static short 
PRIVATE_KEY_COMPONENT_TYPE_Q 
 
私钥成员 - prime q 
 
方法摘要： 
修饰符和类型 
方法和描述 
static RsaAlg 
create() 
 
该方法用来创建具体实例。 
abstract short 
decryptComplete(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用存储在实例中的密钥对输入数据做解密操作。 
abstract short 
encryptComplete(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用存储在实例中的密钥对输入数据做加密操作。 
abstract void 
generateKeys(short modulusSize) 
 
根据被提供的模数大小来生成RSA 的公钥和私钥，并将它们
存储在实例内部。 
abstract short 
getHashAlg() 
 
获得当前实例在进行签名操作的时候所使用的哈希算法。 
abstract void 
getKey(byte[] mod, short modIndex, byte[] e, short 
eIndex) 
 
获得存储在实例中的RSA 公钥。 
abstract void 
getKey(byte[] mod, short modIndex, byte[] e, short 
eIndex, byte[] d, short dIndex) 
 
获得存储在实例中的RSA 公钥和私钥。 
abstract short 
getModulusSize() 
中国银联 
版权所有

---
**[p250]**

249 
 
 
返回当前被实例使用的RSA 密钥的模数（N）大小。 
abstract short 
getPaddingScheme() 
 
获得实例在加密、解密、签名和验证操作中当前使用的填充
方案。 
abstract short 
getPrivateExponentSize() 
 
返回当前被实例使用的RSA 密钥private exponent 的大小。 
abstract void 
getPrivateKeyComponents(byte[] p, short pIndex, 
byte[] q, short qIndex, byte[] dP, short dPIndex, 
byte[] dQ, short dQIndex, byte[] coefficient, short 
coefficientIndex) 
 
得到在密钥生成算法中产生的私钥 components 值。 
abstract short 
getPrivateKeyComponentSize(short type) 
 
根据输入参数类型返回RSA 密钥的components 大小。 
abstract short 
getPublicExponentSize() 
 
返回当前被实例使用的RSA 密钥public exponent (E) 的
大小。 
abstract void 
setHashAlg(short hashAlgType) 
 
设置实例在签名操作中使用的哈希算法类型。 
abstract void 
setKey(byte[] mod, short modIndex, short modLength, 
byte[] e, short eIndex, short eLength) 
 
设置被实例使用的RSA 公钥。 
abstract void 
setKey(byte[] mod, short modIndex, short modLength, 
byte[] e, short eIndex, short eLength, byte[] d, short 
dIndex, short dLength) 
 
设置实例使用的RSA 公钥和私钥。 
abstract void 
setPaddingScheme(short paddingType) 
 
设置实例在后续的加密、解密、签名和验证操作中使用的填
充方案。 
abstract short 
signComplete(byte[] data, short dataIndex, short 
dataLength, byte[] signature, short signatureIndex) 
 
使用当前存储在实例中的密钥值对输入数据签名。 
abstract short 
signHash(byte[] 
hash, 
short 
hashIndex, 
short 
hashLength, byte[] signature, short signatureIndex) 
 
使用当前存储在实例中的密钥值对已做哈希操作的散列值
进行签名。 
中国银联 
版权所有

---
**[p251]**

250 
 
abstract boolean 
verifyComplete(byte[] data, short dataIndex, short 
dataLength, byte[] signature, short signatureIndex, 
short signatureLength) 
 
使用当前存储在实例中的密钥对输入的数据进行签名验证。 
abstract boolean 
verifyHash(byte[] hash, short hashIndex, short 
hashLength, byte[] signature, short signatureIndex, 
short signatureLength) 
 
使用当前存储在实例中的密钥对输入的已做哈希操作的散
列值进行签名验证。 
 
由类 java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
由接口com.cup.crypto.Signature 继承的方法 
getSignatureLength 
 
6.2.2.3.6. SSL 会话 
com.cup.crypto 
Class SslSession 
 
java.lang.Object 
     
|  
+--com.cup.crypto.SslSession 
 
All Implemented Interfaces: 
SecureSession, StreamCipher 
 
public abstract class SslSession extends java.lang.Object  
implements StreamCipher, SecureSession 
 
该抽象类提供了一个SSL 会话。该类实现了包括数据流加密以及安全会话接口，并允许
和一个远端SSL 服务器创建一个安全的SSL 会话，并在会话内传递加密数据。  
 
创建一个会话： 
(1) 调用CertificateStore.create()创建一个新的证书存储实例。这个存储可被多个
会话重用。 
(2) 使用addCertificate()将根证书添加到存储中。 
(3) 创建一个Calendar 实例并初始化时间来确定该会话的时间逻辑。 
中国银联 
版权所有

---
**[p252]**

251 
 
(4) 调用SslSession.create()和会话的参数(时间，FQDN 和证书存储)来创建一个新的
会话实例。 
(5) 调用performHandshake() 在会话和远端SSL 服务器之间顺续地传递握手消息。 
一旦会话被建立，调用者可以在SSL 会话内部继续使用encrypt()和decrypt()。 
 
验证CRLs（在握手之后）： 
(1) 调用getChainInfo()来取回SslSession.CertificateInfo 实例的一个数组，提供
了在握手阶段从SSL 服务器接收到的证书链，顺序从叶到根证书。 
(2) 由第一个中间证书（在数组最后位置之前的一个）开始并且在叶结束。 
(3) 针对在链中的每个证书： 
a) 对证书使用CertificateInfo.getInfo()来取回CRL 分发点并将它发送给客户
端软件。 
b) 在客户端软件获得CRLs 之后，针对每个CRL 分发点： 
1) 调用createCrl()使用证书索引以及CRL 分发点。  
2) 使用Crl.appendChunk()一个接一个数据块地添加CRL。 
3) 调用Crl.verify()来确保CRL 是正确的格式并被签名过。 
4) 调用Crl.getTimeRange()来验证执行中的CRL 是最新的。 
5) 使用CertificateInfo.getInfo()获得证书序列号。 
6) 使用Crl.findSerialNumber()搜索证书序列号来确保证书没有被撤销。 
7) 调用Crl.destroy()释放系统资源。 
 
结束会话： 
(1) 调用generateAlertMessage()同警告类型SSL_ALERT_CLOSE_NOTIFY，并发送输出
缓存到远端SSL 服务器。 
(2) 调用destroy()释放系统资源。 
在结束或销毁会话之后，它的实例不能够被重用。如果需要重用，一个新的会话需要被
创建。 
 
停止使用SSL 服务： 
如果不再需要SSL 服务，用户需要调用每个被创建实例的证书存储的
CertificateStore.destroy()方法和每个SSL 会话实例的destroy()方法来释放系统资源。 
 
SSL 警告： 
任何会话方法抛出操作失败异常，代表在同SSL 服务器通讯过程中，从服务器接收到或
者本地产生了一个SSL 警告。所有的警告都表示会话处于不可用状态。在该状态，只有下列
方法被允许： 
-- destroy() 
-- getFailure() 
-- isServerAlert() 
-- generateAlertMessage() 
-- hasMoreOutput() 
对话状态收到操作失败异常的处理如下： 
(1) 调用isServerAlert()来理解该警告是从服务器端发送过来的，还是本地产生的警
中国银联 
版权所有

---
**[p253]**

252 
 
告。  
a) 如果是服务器产生的警告 
1) 调用getFailure()来检测服务器发出的警告类型， 
if (alertType == SSL_ALERT_CLOSE_NOTIFY) – 请求结束会话 
调用generateAlertMessage()和警告类型，并输出缓存到远端SSL 服务
器。 
b) 如果是本地产生的警告 
1) 调用getFailure()来决定警告类型并产生警告。 
2) 调用generateAlertMessage()，并且和从getFailure()获得的警告类型
做比较，最终将输出缓存发送到远端SSL 服务器。 
(2) 调用destroy()释放系统资源。 
嵌套类摘要： 
修饰符和类型 
类和描述 
static class  
SslSession.CertificateInfo 
 
该类提供在握手状态下从SSL 服务器收到的证书链中的单
一证书。 
static class  
SslSession.Crl 
 
该类提供一个证书撤销列表对象。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static int 
ASYMMETRIC_KEY_RSA_1024 
 
一个1024 位长度的RSA 密钥。 
static int 
ASYMMETRIC_KEY_RSA_2048 
 
一个2048 位长度的RSA 密钥。 
static int 
ASYMMETRIC_KEY_RSA_4096 
 
一个4096 位长度的RSA 密钥。 
static short 
PROTOCOL_VERSION_SSL_3_0 
 
SSLv3 协议版本。 
static short 
PROTOCOL_VERSION_TLS_1_0 
 
TLSv1 协议版本。 
static short 
PROTOCOL_VERSION_TLS_1_1 
 
TLSv1.1 协议版本。 
static short 
SSL_ALERT_ACCESS_DENIED  
 
产生访问拒绝警告 
static short 
SSL_ALERT_BAD_CERTIFICATE  
中国银联 
版权所有

---
**[p254]**

253 
 
 
产生错误证书警告 
static short 
SSL_ALERT_BAD_CERTIFICATE_HASH_VALUE  
 
产生错误证书哈希值警告 
static short 
SSL_ALERT_BAD_CERTIFICATE_STATUS_RESPONSE  
 
产生错误证书状态响应警告 
static short 
SSL_ALERT_BAD_CERTIFICATE_UNKNOWN_PSK  
 
产生错误证书未知PSK 警告 
static short 
SSL_ALERT_BAD_RECORD_MAC  
 
产生错误记录MAC 警告 
static short 
SSL_ALERT_CERTIFICATE_EXPIRED  
 
产生证书过期警告 
static short 
SSL_ALERT_CERTIFICATE_REVOKED  
 
产生证书撤销警告 
static short 
SSL_ALERT_CERTIFICATE_UNKNOWN  
 
产生证书未知警告 
static short 
SSL_ALERT_CERTIFICATE_UNOBTAINABLE  
 
由于证书无法获得产生的警告 
static short 
SSL_ALERT_CLOSE_NOTIFY  
 
产生关闭通知警告 
static short 
SSL_ALERT_DECODE_ERROR  
 
产生解码错误警告 
static short 
SSL_ALERT_DECOMPRESSION_FAILURE  
 
产生解压失败警告 
static short 
SSL_ALERT_DECRYPT_ERROR  
 
产生解密错误警告 
static short 
SSL_ALERT_DECRYPTION_FAILED  
 
产生解密失败警告 
static short 
SSL_ALERT_EXPORT_RESTRICTION  
 
产生导出受限警告 
static short 
SSL_ALERT_HANDSHAKE_FAILURE  
 
产生握手失败警告 
static short 
SSL_ALERT_ILLEGAL_PARAMETER  
中国银联 
版权所有

---
**[p255]**

254 
 
 
产生非法参数警告 
static short 
SSL_ALERT_INSUFFICIENT_SECURITY  
 
不足的安全等级产生的警告 
static short 
SSL_ALERT_INTERNAL_ERROR  
 
产生内部错误警告 
static short 
SSL_ALERT_NO_CERTIFICATE  
 
产生无证书警告 
static short 
SSL_ALERT_NO_RENEGOTIATION  
 
产生无协商警告 
static short 
SSL_ALERT_NONE 
 
表示成功状态，没有警告发生，对应JOM_SSL_ALERT_NONE。 
static short 
SSL_ALERT_PROTOCOL_VERSION  
 
产生协议版本警告 
static short 
SSL_ALERT_RECORD_OVERFLOW  
 
产生记录溢出警告 
static short 
SSL_ALERT_UNEXPECTED_MESSAGE  
 
产生意外消息警告 
static short 
SSL_ALERT_UNKNOWN_CA  
 
产生未知CA 警告 
static short 
SSL_ALERT_UNRECOGNIZED_NAME  
 
不可辨识的姓名产生的警告 
static short 
SSL_ALERT_UNSUPPORTED_CERTIFICATE  
 
未支持的证书产生的警告 
static short 
SSL_ALERT_UNSUPPORTED_EXTENSION  
 
为支持的扩展产生的警告 
static short 
SSL_ALERT_USER_CANCELED  
 
用户取消操作产生的警告 
static short 
TLS_RSA_WITH_AES_128_CBC_SHA 
 
其中RSA 算法方案包含AES-128-CBC 和SHA-1 哈希算法。 
static short 
TLS_RSA_WITH_AES_256_CBC_SHA 
 
其中RSA 算法方案包含AES-256-CBC 和SHA-1 哈希算法。 
static short 
TLS_RSA_WITH_RC4_128_SHA 
中国银联 
版权所有

---
**[p256]**

255 
 
 
其中RSA 算法方案包含RC4-128 和SHA-1 哈希算法。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static SslSession 
create(Calendar calendar, byte[] setTimeInfo, 
short setTimeInfoIndex, java.lang.String fqdn, 
CertificateStore certStore) 
 
提供方法创建一个SSL 会话。 
abstract SslSession.Crl 
createCrl(byte chainIndex, int crlLength) 
 
提供方法根据预先分配的大小创建一个新的CRL 实例。 
abstract short 
decrypt(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex, 
short outputLength) 
 
使用实例中当前存储的密钥对输入数据进行解密操作。 
abstract void 
destroy() 
 
销毁一个会话并清除相关系统资源。 
abstract short 
encrypt(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex, 
short outputLength) 
 
使用实例中当前存储的密钥对输入数据进行加密操作。 
abstract short 
generateAlertMessage(short 
alertType, 
byte[] 
output, short outputIndex, short outputLength) 
 
产生一个SSL 警告消息发给远端服务器并明确地结束会
话。 
 
如果有更多的输出需要发送，这个方法就需要被多次调
用。 
 
产生一个警告消息使任何同这次会话相关的
SslSession.Crl 和SslSession.CertificateInfo 实例
失效，但是不会销毁它们。一旦实例不再被需要，显式
调用destory 函数释放系统资源仍是需要的。 请注意，
该方法不能够被调用当isServerAlert()返回真。 
abstract  
SslSession.CertificateInfo[] 
getChainInfo() 
 
返回一个实例数组来提供在握手阶段从远端SSL 服务器
收到的证书链。 
 
这个数组是零基准起始的，并且从叶节点到根，0 表示
中国银联 
版权所有

---
**[p257]**

256 
 
叶节点，最后一个证书是根证书。 
 
在数组中的第一个这个证书是叶节点，最后一个是作为
整个证书链的可信源的根证书。 
abstract short[] 
getCipherSuite() 
 
返回该会话当前的加密组。 
abstract int 
getFailure() 
 
返回该安全会话最后一个失败信息。 
abstract int 
getKeySizes() 
 
返回该会话当前支持的非对称密钥大小。 
short 
getMaxBufferLength() 
 
返回Handshake()，encrypt()和decrypt()方法能够支
持的输入缓存的最大数据大小。 
abstract short 
getMinProtocolVersion() 
 
返回该会话当前能够支持的最小的协议版本集合。 
abstract boolean 
isEstablished() 
 
返回安全会话是否被建立。 
abstract boolean 
isServerAlert() 
 
返回最新的SSL 警告消息是否是由远端服务器产生的。 
abstract short 
performHandshake(byte[] input, short inputIndex, 
short 
inputLength, 
byte[] 
output, 
short 
outputIndex, short outputLength) 
 
执行一次握手操作，为了与其他端点能够建立一个安全
会话。 
 
调用者需要在调用这个方法后调用isEstablished 来确
认会话是否被创建了。 
 
该函数依赖于潜在的会话类型，有可能需要被多次调用。 
abstract void 
setCipherSuite(short[] ciphers, short index, short 
length) 
 
设置在握手时需要约定的加密算法组。 
 
如果没有被显式调用，将会默认设置为
(TLS_RSA_WITH_AES_128_CBC_SHA, 
TLS_RSA_WITH_RC4_128_SHA, 
TLS_RSA_WITH_AES_256_CBC_SHA) 
abstract void 
setKeySizes(int asymmetricKeySizes) 
中国银联 
版权所有

---
**[p258]**

257 
 
 
设置会话支持的非对称密钥大小。 
 
如果没有显式调用，将会默认设置为所有密钥大小。 
abstract void 
setMinProtocolVersion(short minProtocolVersion) 
 
设置该会话支持的最小协议版本的集合。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
由接口com.cup.crypto.StreamCipher 继承的方法 
hasMoreOutput 
 
由接口com.cup.crypto.SecureSession 继承的方法 
hasMoreOutput 
 
6.2.2.3.7. SSL 会话 -- 证书信息 
com.cup.crypto 
Class SslSession.CertificateInfo 
 
java.lang.Object 
     
|  
+--com.cup.crypto.SslSession.CertificateInfo 
 
外层类： 
SslSession 
 
public 
abstract 
static 
class 
SslSession.CertificateInfo 
extends 
java.lang.Object 
 
该类提供了在握手阶段从远端SSL 服务器接收到的证书链中的单一证书。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static short 
INFO_TYPE_CRL_DIST_POINT 
 
在证书中CRL 分配点的扩展。 
static short 
INFO_TYPE_RAW_DATA 
中国银联 
版权所有

---
**[p259]**

258 
 
 
证书原始数据是DER 格式。 
static short 
INFO_TYPE_SERIAL_NUMBER 
 
证书序列号。 
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract byte 
getIndex() 
 
返回在通过调用getChainInfo()取回的证书链中特定证书
的位置。 
abstract List 
getInfo(short infoType) 
 
返回证书被请求信息的缓存列表。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.2.3.8. SSL 会话 – CRL 
com.cup.crypto 
Class SslSession.Crl 
 
java.lang.Object 
|  
+--com.cup.crypto.SslSession.Crl 
 
外层类： 
SslSession 
 
public abstract static class SslSession.Crl extends java.lang.Object 
 
该类提供一个证书撤销的对象列表。该对象可以在CRL内验证CRL并且搜索证书序列号。 
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract void 
appendChunk(byte[] input, short inputIndex, short 
inputLength) 
 
在预分配的CRL 缓存后添加一个CRL 数据块。 
 
添加的数据块的总大小，必须同在调用createCrl()创建
中国银联 
版权所有

---
**[p260]**

259 
 
CRL 时提供的大小相等。 
 
所有数据块需要按照在原始CRL 文件中的相同顺序添加。 
abstract void 
destroy() 
 
销毁一个CRL 并清除它的系统资源。 
 
必须在CRL 不再被需要的时候调用。 
abstract boolean 
findSerialNumber(byte[] serial) 
 
在CRL 中调用CertificateInfo.getInfo()取回证书信息，
本方法将搜索指定的证书序列号。 
 
只可以在成功调用verify()方法后才可以被调用。 
static int 
getMaxCrlLength() 
 
返回单一CRL 可以允许的最大数据大小。 
abstract 
Calendar.TimeRange 
getTimeRange() 
 
返回该CRL 有效的时间范围。 
abstract boolean 
verify() 
 
验证该CRL 是否是格式正确并被正确签名的。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.2.3.9. 对称数据块加密算法 
com.cup.crypto 
Class SymmetricBlockCipherAlg 
 
java.lang.Object 
    
|  
+--com.cup.crypto.SymmetricBlockCipherAlg 
 
所有实现的接口： 
Cipher, SequentialCipher 
 
public abstract class SymmetricBlockCipherAlg extends java.lang.Object 
implements SequentialCipher 
 
该抽象类提供一个对称加密算法。该类实现了一个加密接口，并可通过调用create 方
中国银联 
版权所有

---
**[p261]**

260 
 
法来实现特有的加密算法。另外，该类支持在多个交互过程中加密或者解密输入数据，并可
以在他们之间保存中间的内部状态。 
 
该类支持下列加密方法： 
-- AES，128、256 位长度密钥，CBC、ECB 和CTR 模式。 
-- AES，128 和256 位长度平台绑定密钥，CBC 模式。 
a) 
单一数据块操作 – 所有数据被一次性加密 
1) 
encryptComplete 
2) 
decryptComplete 
b) 
顺序操作 –当数据太大，无法一次性在内存中处理时，数据顺序按照一个个
数据块来加密 
1) 
encryptUpdate，encryptComplete 操作最后一个数据块 
2) 
decryptUpdate，decryptComplete 操作最后一个数据块 
 
-- DES，64、128 和192 位长度密钥，CBC、ECB 和CTR 模式。 
 
在使用该类的加密或者解密方法之前，需要配置该类的下列参数： 
-- 加密密钥 – 使用setKey 方法(在如果没有使用一个已经实现了平台绑定算法的实
例的前提下)。 
-- 初始向量 – 使用setIV 方法针对那些工作在CBC 或者CTR 模式的算法。在CBC 模
式中，调用setIV 方法是可选项，默认的初始化向量值为0。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static short 
AES_BLOCK_SIZE 
 
AES 数据块字节大小。 
static short 
ALG_TYPE_AES_CBC 
 
AES 加密算法采用128、256 位长度密钥，CBC 模式。 
static short 
ALG_TYPE_AES_CTR 
 
AES 加密算法采用128、256 位长度密钥，CTR 模式。 
static short 
ALG_TYPE_AES_ECB 
 
AES 加密算法采用128、256 位长度密钥，ECB 模式。 
static short 
ALG_TYPE_DES_CBC 
 
DES 加密算法采用64、128 或者192 位长度密钥，CBC 模式。 
static short 
ALG_TYPE_DES_CTR 
 
DES 加密算法采用64、128 或者192 位长度密钥，CTR 模式。 
static short 
ALG_TYPE_DES_ECB 
 
DES 加密算法采用64、128 或者192 位长度密钥，ECB 模式。 
中国银联 
版权所有

---
**[p262]**

261 
 
static short 
ALG_TYPE_PBIND_AES_128_CBC 
 
AES 加密算法采用128 位平台绑定密钥，CBC 模式。 
static short 
ALG_TYPE_PBIND_AES_256_CBC 
 
AES 加密算法采用256 位平台绑定密钥，CBC 模式。 
static short 
DES_BLOCK_SIZE 
 
DES 数据块字节数。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static 
SymmetricBlockCipherAlg 
create(short algType) 
 
该方法用来创建具体实例。 
abstract short 
decryptComplete(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用当前存储在实例中的密钥对输入参数进行解密操作。 
abstract short 
encryptComplete(byte[] input, short inputIndex, short 
inputLength, byte[] output, short outputIndex) 
 
使用当前存储在实例中的密钥对输入参数进行加密操作。 
short 
getAlgType() 
 
返回该实例实现的算法类型。 
abstract short 
getBlockSize() 
 
返回该算法实例能够处理的数据块字节数。 
abstract short 
getKey(byte[] keyArray, short keyIndex) 
 
获得实例当前使用的密钥。 
abstract short 
getKeySize() 
 
获得该算法实例能够处理的密钥大小。 
abstract void 
setIV(byte[] ivArray, short ivIndex, short ivLength) 
 
为加密、解密操作对该实例设置被使用的初始化向量。 
abstract void 
setKey(byte[] keyArray, short keyIndex, short 
keyLength) 
 
为加密、解密操作对该实例设置被使用的密钥。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
中国银联 
版权所有

---
**[p263]**

262 
 
 
由接口com.cup.crypto.SequentialCipher 继承的方法 
decryptUpdate, encryptUpdate 
 
6.2.2.3.10. 对称签名算法 
com.cup.crypto 
Class SymmetricSignatureAlg 
 
java.lang.Object 
        |  
+--com.cup.crypto.SymmetricSignatureAlg 
 
所有实现接口： 
SequentialSignature, Signature 
 
public abstract class SymmetricSignatureAlg extends java.lang.Object 
implements SequentialSignature 
 
该抽象类提供一个对称签名算法。该类实现了签名接口并可通过调用create 方法来实
现特有的签名算法。另外，该类支持在若干交互中签名或验证数据，并保存它们之间的中间
状态。 
 
该类支持下列签名算法： 
-- HMAC SHA-1  
-- HMAC SHA-256  
-- HMAC SHA-1 with Platform Binding key  
-- HMAC SHA-256 with Platform Binding key  
在使用该类的签名或者验证方法之前，该类需要配置下列的参数：  
-- 签名密钥 – 使用setKey 方法(前提是被使用的实例没有实现平台绑定算法)。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static short 
ALG_TYPE_HMAC_SHA1 
 
HMAC SHA1 算法。 
static short 
ALG_TYPE_HMAC_SHA256 
 
HMAC SHA256 算法。 
static short 
ALG_TYPE_PBIND_HMAC_SHA1 
 
HMAC SHA1 with Platform Binding key 算法。 
中国银联 
版权所有

---
**[p264]**

263 
 
static short 
ALG_TYPE_PBIND_HMAC_SHA256 
 
HMAC SHA256 with Platform Binding key 算法。 
static short 
HMAC_SHA1_SIGNATURE_LENGTH 
 
HMAC SHA1 签名长度的字节数。 
static short 
HMAC_SHA256_SIGNATURE_LENGTH 
 
HMAC SHA256 签名长度的字节数。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static 
SymmetricSignatureAlg 
create(short algType) 
 
方法被用来创建具体实例。 
short 
getAlgType() 
 
返回该实例使用的算法类型。 
abstract short 
getKey(byte[] keyArray, short keyIndex) 
 
返回该实例当前使用的密钥。 
abstract short 
getKeySize() 
 
返回该实例当前使用的密钥大小。 
abstract void 
setKey(byte[] keyArray, short keyIndex, short 
keyLength) 
 
设置该实例要使用的密钥。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
由接口com.cup.crypto.SequentialSignature 继承的方法 
signComplete, signUpdate, verifyComplete, verifyUpdate 
 
由接口com.cup.crypto.Signature 继承的方法 
getSignatureLength 
 
6.2.2.4. 异常 
6.2.2.4.1. 计算异常 
中国银联 
版权所有

---
**[p265]**

264 
 
com.cup.crypto 
Class ComputationException 
 
java.lang.Object 
    
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
    |  
+--com.cup.crypto.CryptoException 
    
 
 
 
 
 
 
 
  |  
+--com.cup.crypto.ComputationException 
 
public class ComputationException extends CryptoException 
 
提供一个加密算法的异常，当由于提供不正确参数导致方法失败，或者其他任何加密算
法发生计算错误的时候被抛出。 
 
构造函数摘要： 
构造函数和描述 
ComputationException()  
ComputationException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.2.4.2. 加密异常 
com.cup.crypto 
Class CryptoException 
中国银联 
版权所有

---
**[p266]**

265 
 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
                          |  
+--com.cup.langutil.CupRuntimeException 
                                |  
+--com.cup.crypto.CryptoException 
 
直接的已知子类： 
ComputationException, 
IllegalParameterException, 
IllegalUseException, 
NotInitializedException, 
NotSupportedException, 
OperationFailedException, 
OutOfResourcesException 
 
public class CryptoException extends CupRuntimeException 
 
提供一个常规的加密算法的异常。所有特定的密码学异常需要从该基类扩展。 
 
构造函数摘要： 
构造函数和描述 
CryptoException()  
CryptoException(java.lang.String msg)   
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.2.4.3. 非法参数异常 
com.cup.crypto 
Class IllegalParameterException 
中国银联 
版权所有

---
**[p267]**

266 
 
 
java.lang.Object 
       |  
+--java.lang.Throwable 
              |  
+--java.lang.Exception 
                    |  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.crypto.CryptoException 
                                  |  
+--com.cup.crypto.IllegalParameterException 
 
public class IllegalParameterException extends CryptoException 
 
提供一个加密算法的异常，当一个或者多个输入参数是无效的时候被抛出。 
 
构造函数摘要： 
构造函数和描述 
IllegalParameterException()  
IllegalParameterException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.2.4.4. 非法使用异常 
com.cup.crypto 
Class IllegalUseException 
 
java.lang.Object 
     
|  
中国银联 
版权所有

---
**[p268]**

267 
 
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
                     
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.crypto.CryptoException 
     
 
 
 
 
 
 
  |  
+--com.cup.crypto.IllegalUseException 
 
public class IllegalUseException extends CryptoException 
 
提供一个加密算法的异常，当用户创建的若干操作流程是非法的时候被抛出。 
 
构造函数摘要： 
构造函数和描述 
IllegalUseException()  
IllegalUseException(java.lang.String msg)  
 
方法描述： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.2.4.5. 未初始化异常 
com.cup.crypto 
Class NotInitializedException 
 
java.lang.Object 
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
中国银联 
版权所有

---
**[p269]**

268 
 
     
 
 
 
|  
+--java.lang.RuntimeException 
    
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.crypto.CryptoException 
     
 
 
 
 
 
 
  |  
+--com.cup.crypto.NotInitializedException 
 
public class NotInitializedException extends CryptoException 
 
提供一个加密算法的异常，当一个对象还没有被正确初始化前就被使用时被抛出。例如，
如果在调用setKey 方法之前就调用加密对象的加密方法。 
 
构造函数摘要： 
构造函数和描述 
NotInitializedException()  
NotInitializedException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
6.2.2.4.6. 未支持异常 
com.cup.crypto 
Class NotSupportedException 
 
java.lang.Object 
       |  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
中国银联 
版权所有

---
**[p270]**

269 
 
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.crypto.CryptoException 
     
 
 
 
 
 
 
  |  
+--com.cup.crypto.NotSupportedException 
 
public class NotSupportedException extends CryptoException 
 
提供一个加密算法的异常，当一个方法或者提供的参数没有被一个实例支持的时候，或
者当用户尝试去创建一个不支持的算法的实例的时候被抛出。 
 
构造函数摘要： 
构造函数和描述 
NotSupportedException()  
NotSupportedException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的摘要 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的摘要 
equals, getClass, hashCode 
 
6.2.2.4.7. 操作失败异常 
com.cup.crypto 
Class OperationFailedException 
 
java.lang.Object 
       |  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
    
 
 
 
 
  |  
中国银联 
版权所有

---
**[p271]**

270 
 
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.crypto.CryptoException 
     
 
 
 
 
 
 
  |  
+--com.cup.crypto.OperationFailedException 
 
public class OperationFailedException extends CryptoException 
 
提供一个加密算法的异常，当用户的请求无法被执行的时候被抛出。 
 
构造函数摘要： 
构造函数和描述 
OperationFailedException()  
OperationFailedException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.2.4.8. 缺少资源异常 
com.cup.crypto 
Class OutOfResourcesException 
 
java.lang.Object 
    
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.crypto.CryptoException 
中国银联 
版权所有

---
**[p272]**

271 
 
     
 
 
 
 
 
 
  |  
+--com.cup.crypto.OutOfResourcesException 
 
public class OutOfResourcesException extends CryptoException 
 
提供一个加密算法的异常，当用户的请求由于系统当前没有可用资源而无法被执行的时
候被抛出。 
 
构造函数摘要： 
构造函数和描述 
OutOfResourcesException()  
OutOfResourcesException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.3. com.cup.langutil 
6.2.3.1. 描述 
该包提供语言相关的util 的扩展。 
 
该包包含下列关键类和接口： 
ArrayUtils 类 – 提供基础的数组util。 
TypeConverter 类 – 提供基础的类型转换util。 
List 类 – 提供基础的列表对象功能。 
Enumerator 接口 – 提供基础的枚举接口。 
 
接口摘要： 
接口 
描述 
Enumerator 
该类提供基础的枚举对象的接口。 
 
类摘要： 
中国银联 
版权所有

---
**[p273]**

272 
 
类 
描述 
ArrayUtils 
该类提供基础的数组util，例如数组复制，数组比较，数
组填充，等。 
List 
该类提供基础的列表util。 
TypeConverter 
该类提供基础的类型转换util。 
 
异常摘要： 
异常 
描述 
CupRuntimeException 
提供一个通用的异常。 
 
6.2.3.2. 接口 
6.2.3.2.1. 枚举 
com.cup.langutil 
Interface Enumerator 
 
public interface Enumerator 
 
该类提供枚举对象的基础接口。比如，它可以被用来枚举一个列表中的所有对象。 
 
方法摘要： 
修饰符和类型 
方法和描述 
java.lang.Object 
getNext() 
 
返回在容器中的下个元素。 
boolean 
hasNext() 
 
返回该容器是否包含更多元素。 
 
6.2.3.3. 类 
6.2.3.3.1. 数组 
com.cup.langutil 
Class ArrayUtils 
 
java.lang.Object 
中国银联 
版权所有

---
**[p274]**

273 
 
        |  
+--com.cup.langutil.ArrayUtils 
 
public final class ArrayUtils extends java.lang.Object 
 
该类提供基础的数组util，例如，数组复制，数组比较，数组填充，等。 
 
构造函数摘要： 
构造函数和描述 
ArrayUtils()  
 
方法摘要： 
修饰符和类型 
方法和描述 
static void 
checkBooleanArrayRange(boolean[] array, int index, 
int length) 
 
验证输入的数组参数是否在该数组范围内，否则抛出异常。 
static void 
checkByteArrayRange(byte[] array, int index, int 
length) 
 
验证输入的数组参数是否在该数组范围内，否则抛出异常。 
static void 
checkIntArrayRange(int[] array, int index, int 
length) 
 
验证输入的数组参数是否在该数组范围内，否则抛出异常。 
static void 
checkShortArrayRange(short[] array, int index, int 
length) 
 
验证输入的数组参数是否在该数组范围内，否则抛出异常。 
static boolean 
compareBooleanArray(boolean[] 
sourceArray, 
int 
sourceIndex, 
boolean[] 
destinationArray, 
int 
destinationIndex, int length) 
 
比较两个输入的布尔型数组数据。 
static boolean 
compareByteArray(byte[] 
sourceArray, 
int 
sourceIndex, 
byte[] 
destinationArray, 
int 
destinationIndex, int length) 
 
比较两个输入的字节型数组数据。 
static boolean 
compareIntArray(int[] sourceArray, int sourceIndex, 
int[] destinationArray, int destinationIndex, int 
length) 
 
比较两个输入的整型数据数据。 
中国银联 
版权所有

---
**[p275]**

274 
 
static boolean 
compareShortArray(short[] 
sourceArray, 
int 
sourceIndex, 
short[] 
destinationArray, 
int 
destinationIndex, int length) 
 
比较两个输入的短整型数据数据。 
static void 
copyBooleanArray(boolean[] 
sourceArray, 
int 
sourceIndex, 
boolean[] 
destinationArray, 
int 
destinationIndex, int length) 
 
从源数组复制布尔型数据到目标数组。 
static void 
copyByteArray(byte[] sourceArray, int sourceIndex, 
byte[] destinationArray, int destinationIndex, int 
length) 
 
从源数组复制字节型数据到目标数组。 
static void 
copyIntArray(int[] sourceArray, int sourceIndex, 
int[] destinationArray, int destinationIndex, int 
length) 
 
从源数组复制整型数据到目标数组。 
static void 
copyShortArray(short[] sourceArray, int sourceIndex, 
short[] destinationArray, int destinationIndex, int 
length) 
 
从源数组复制短整型数据到目标数组。 
static void 
fillBooleanArray(boolean[] array, int index, int 
length, boolean value) 
 
使用输入的布尔型数据值填充数组。 
static void 
fillByteArray(byte[] array, int index, int length, 
byte value) 
 
使用输入的字节型数据值填充数组。 
static void 
fillIntArray(int[] array, int index, int length, int 
value) 
 
使用输入的整型数据值填充数组。 
static void 
fillShortArray(short[] array, int index, int length, 
short value) 
 
使用输入的短整型数据值填充数组。 
static int 
findInBooleanArray(boolean[] 
subArray, 
int 
subArrayIndex, 
int 
subArrayLength, 
boolean[] 
destinationArray, 
int 
destinationIndex, 
int 
destinationLength) 
中国银联 
版权所有

---
**[p276]**

275 
 
 
在布尔型目标数组中搜索输入的子数组。 
static int 
findInByteArray(byte[] subArray, int subArrayIndex, 
int subArrayLength, byte[] destinationArray, int 
destinationIndex, int destinationLength) 
 
在字节型目标数组中搜索输入的子数组。 
static int 
findInIntArray(int[] subArray, int subArrayIndex, int 
subArrayLength, 
int[] 
destinationArray, 
int 
destinationIndex, int destinationLength) 
 
在整型目标数组中搜索输入的子数组。 
static int 
findInShortArray(short[] 
subArray, 
int 
subArrayIndex, 
int 
subArrayLength, 
short[] 
destinationArray, 
int 
destinationIndex, 
int 
destinationLength) 
 
在短整型目标数组中搜索输入的子数组。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.3.3.2. 列表 
com.cup.langutil 
Class List 
 
java.lang.Object 
        |  
+--com.cup.langutil.List 
 
public abstract class List extends java.lang.Object 
 
该类实现了一个列表对象的基本接口。 
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract void 
add(java.lang.Object o) 
 
在列表中增加一个对象。 
abstract void 
add(java.lang.Object[] arr) 
 
在列表中添加一个数组对象。 
中国银联 
版权所有

---
**[p277]**

276 
 
abstract void 
clear() 
 
在列表中移除所有对象。 
static List 
create(boolean checkForNull) 
 
该方法创建一个具体列表实例。 
abstract Enumerator 
getEnumerator() 
 
返回这个列表的枚举。 
abstract int 
length() 
 
返回列表中的元素数量。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.3.3.3. 类型转换 
com.cup.langutil 
Class TypeConverter 
 
java.lang.Object 
  
    |  
+--com.cup.langutil.TypeConverter 
 
public final class TypeConverter extends java.lang.Object 
 
该类提供了一个类型转换util。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static int 
INT_BYTE_SIZE 
 
一个整型值使用的字节数。 
static int 
SHORT_BYTE_SIZE 
 
一个短整型值使用的字节数。 
 
构造函数摘要： 
构造函数和描述 
TypeConverter()  
 
中国银联 
版权所有

---
**[p278]**

277 
 
方法摘要： 
修饰符和类型 
方法和描述 
static int 
bytesToInt(byte[] value, int index) 
 
将输入的字节数组转换成整型值。 
static short 
bytesToShort(byte[] value, int index) 
 
将输入的字节数组转换成短整型值。 
static int 
intToBytes(int value, byte[] destinationArray, int 
destinationIndex) 
 
将输入的整型值转换成字节并按照高位优先存储在目标数
组中。 
static int 
shortToBytes(short value, byte[] destinationArray, 
int destinationIndex) 
 
将输入的短整型值转换成字节并按照高位优先存储在目标
数组中。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.3.3.4. 异常 
6.2.3.3.5. 运行时异常 
com.cup.langutil 
Class CupRuntimeException 
 
java.lang.Object 
  
    |  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
 
直接的已知子类： 
CryptoException, NfcException, UiException, UtilException 
中国银联 
版权所有

---
**[p279]**

278 
 
 
public class CupRuntimeException extends java.lang.RuntimeException 
 
提供一个通用的异常。所有在本Java 包中的异常都需要从该基类扩展。 
 
构造函数摘要： 
构造函数和描述 
CupRuntimeException()  
CupRuntimeException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.4. com.cup.nfc 
6.2.4.1. 功能描述 
在移动平台上可以通过近场通信的方式同非接触式卡进行交互。NFC 功能允许平台识别
智能卡，并同智能卡进行信息交互，比如安全电子交易中的信用卡卡号等信息。 
NFC 射频可能会同客户端的其他近场服务共享，所以有时它们之间会互相干扰。 
 
6.2.4.2. 编程接口描述 
该包提供了可用的服务接口，允许应用可以识别并同非接触式卡进行通信。 
该包包含下列关键类和接口： 
CardClient 接口 - 该接口需要被应用实现来接收卡事件通知。 
CardDescriptor 类 - 该类被用来描述当前卡的信息。 
CLFManager 类 - 该类实现一个接口来同非接触卡管理器（CLF，ContactLess Frontend 
Manager）通信。 
 
接口摘要： 
接口 
描述 
CardClient 
该接口需要被应用实现来接收卡事件通知。 
中国银联 
版权所有

---
**[p280]**

279 
 
 
类摘要： 
类 
描述 
CardDescriptor 
该类提供一个卡的描述并且被用来获得被检测卡片的属性。 
CLFManager 
实现一个接口来同非接卡管理器（CLF，ContactLess 
Frontend Manager）通信。 
 
异常摘要： 
异常 
描述 
NfcAccessDeniedException 
提供一个异常当一个应用没有权限去执行被要求的操作
时抛出。 
NfcException 
提供一个的通用的NFC 异常。 
NfcFlashWearoutException 
提供一个输入输出异常当闪存损耗机制阻止对闪存的写
和擦操作时被抛出。 
NfcHardwareException 
提供一个异常当NFC 硬件无响应或失效的时候被抛出。 
NfcIllegalParameterException 提供一个异常当传递给一个方法的一个或多个输入参数
是无效的时候被抛出。 
NfcIllegalUseException 
提供一个异常当用户操作请求不被支持，或者用户创建
的流程或若干操作是非法的时候被抛出。 
NfcIOException 
提供一个通用的输入输出异常。 
NfcNotInitializedException 
提供一个异常当使用一个没有初始化属性的对象的时候
被抛出。 
NfcNotSupportedException 
提供一个异常当一个方法或输入参数没有被一个实例支
持，或者当用户尝试去创建一个不支持的算法的实例的
时候被抛出。 
NfcOutOfResourcesException 
提供一个异常当由于系统上缺乏资源导致用户请求的动
作无法执行的时候被抛出。 
 
6.2.4.3. 接口 
6.2.4.3.1. 卡客户端 – CardClient 
com.cup.nfc 
Interface CardClient 
 
public interface CardClient 
 
中国银联 
版权所有

---
**[p281]**

280 
 
该接口需要被应用实现来接收卡事件通知。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static byte 
CARD_COLLISION 
 
这个错误表示超过一张卡同时被读卡器识别到。 
static byte 
CARD_LOST 
 
这个错误表示在数据交互过程当中卡失去了响应。在数据交
互状态前客户端应用干涉卡识别动作，这个错误也会发生。 
 
方法摘要： 
修饰符和类型 
方法和描述 
void 
cardDataReceived(byte[] data, int length) 
 
当从卡接收到数据的时候，该方法被调用。 
void 
cardDetected(CardDescriptor card) 
 
当一张新卡接近读卡器被识别到的时候，该方法被调用。 
void 
cardError(byte error) 
 
当卡发生错误时，该方法被调用。比如在通信状态中卡超出
射频场范围。 
 
6.2.4.4. 类 
6.2.4.4.1. 卡描述 – CardDescriptor 
com.cup.nfc 
Class CardDescriptor 
 
java.lang.Object 
       |  
+--com.cup.nfc.CardDescriptor 
 
public abstract class CardDescriptor extends java.lang.Object 
 
该类提供了一个卡描述，并被用来获得被识别到的卡的属性。 
 
方法摘要： 
修饰符和类型 
方法和描述 
中国银联 
版权所有

---
**[p282]**

281 
 
abstract byte 
getCardType() 
 
该方法返回识别到的卡的类型。 
abstract int 
getUID(byte[] data, int offset) 
 
该方法从卡描述信息中返回卡的UID。 
abstract int 
getUidLength() 
 
该方法从卡描述信息中返回卡UID 的长度。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.4.4.2. 非接触卡管理器 
com.cup.nfc 
Class CLFManager 
 
java.lang.Object 
     
|  
+--com.cup.nfc.CLFManager 
 
public abstract class CLFManager extends java.lang.Object 
 
实现一个接口来与非接卡管理器(CLF, ContactLess Frontend Manager)通信。 
 
嵌套类摘要： 
修饰符和类型 
类和描述 
class  
CLFManager.CardApplication 
 
该类被用于创建与被识别到的NFC 目标设备之间的通信，以
及控制识别操作。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static byte 
CARD_TYPE_14443_4A 
 
被用于预定识别14443-4 Type A 卡。 
static byte 
CARD_TYPE_14443_4B 
 
被用于预定识别14443-4 Type B 卡。 
static byte 
CARD_TYPE_P2P_INIT 
中国银联 
版权所有

---
**[p283]**

282 
 
 
被用于预定识别P2P 发起设备。 
static byte 
CARD_TYPE_P2P_TARGET 
 
被用于预定识别P2P 目标设备。 
static byte 
CARD_TYPE_UNKNOWN  
static byte 
MAX_CARD_APPLICATION_COUNT 
 
允许的最大卡应用的数量。 
static int 
MAX_CARD_TIMEOUT_VALUE 
 
卡超时机制允许的最大值（毫秒级）。 
static int 
MIN_CARD_TIMEOUT_VALUE 
 
卡超时机制允许的最小值（毫秒级）。 
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract CLFManager.CardApplication createCardApplication(byte 
cardTypes, 
CardClient client, int inactivityTimeout) 
 
该方法被用来创建一个CardApplication 的新
实例。该实例允许应用识别并与非接触卡进行通
信。 
static CLFManager 
getInstance() 
 
该方法被调用来进行CLF 初始化。 
abstract short 
getMaxDataLength() 
 
返回发送到卡的命令数据的被允许的最大长度。 
abstract short 
getMinDataLength() 
 
返回发送到卡的命令数据的被允许的最小长度。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.4.5. 异常 
6.2.4.5.1. NFC 拒绝访问异常 
com.cup.nfc 
Class NfcAccessDeniedException 
中国银联 
版权所有

---
**[p284]**

283 
 
 
java.lang.Object 
       |  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
    
 
 
 
 
 
 
  |  
+--com.cup.nfc.NfcAccessDeniedException 
 
public class NfcAccessDeniedException extends NfcException 
 
提供一个异常，当一个应用没有被允许去执行被要求的操作时抛出。比如，当一个应用
尝试在闪存上超过分配的容量写更多数据的时候。 
 
构造函数摘要： 
构造函数和描述 
NfcAccessDeniedException()  
NfcAccessDeniedException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.4.5.2. NFC 异常 
com.cup.nfc 
Class NfcException 
 
java.lang.Object 
中国银联 
版权所有

---
**[p285]**

284 
 
    
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
 
直接的已知子类： 
NfcAccessDeniedException, NfcFileNotFoundException, NfcHardwareException, 
NfcIllegalParameterException, 
NfcIllegalUseException, 
NfcIOException, 
NfcNotInitializedException, NfcNotSupportedException, NfcOutOfResourcesException 
 
public class NfcException extends CupRuntimeException 
 
提供一个的通用的NFC 异常。所有在Java 包com.cup.nfc 中的异常都需要通过这个基
类扩展。 
 
构造函数摘要： 
构造函数和描述 
NfcException()  
NfcException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.4.5.3. NFC 闪存损耗异常 
com.cup.nfc 
Class NfcFlashWearoutException 
 
中国银联 
版权所有

---
**[p286]**

285 
 
java.lang.Object 
       |  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
    
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
     
 
 
 
 
 
 
  |  
+--com.cup.nfc.NfcIOException 
     
 
 
 
 
 
 
 
  |  
+--com.cup.nfc.NfcFlashWearoutException 
 
public class NfcFlashWearoutException extends NfcIOException 
 
提供一个输入输出异常，当闪存损耗机制阻止闪存写和擦的操作时被抛出。 
 
构造函数摘要： 
构造函数和描述 
NfcFlashWearoutException()  
NfcFlashWearoutException(java.lang.String msg)  
 
方法摘要： 
由类class java.lang.Throwable 继承方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类class java.lang.Object 继承方法 
equals, getClass, hashCode 
 
6.2.4.5.4. NFC 硬件异常 
com.cup.nfc 
Class NfcHardwareException 
 
java.lang.Object 
中国银联 
版权所有

---
**[p287]**

286 
 
       |  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
    
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
    
 
 
 
 
 
 
  |  
+--com.cup.nfc.NfcHardwareException 
 
public class NfcHardwareException extends NfcException 
 
提供一个异常，当NFC 硬件无响应或失效的时候被抛出。 
 
构造函数摘要： 
构造函数和描述 
NfcHardwareException()  
NfcHardwareException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.4.5.5. NFC 非法参数异常 
com.cup.nfc 
Class NfcIllegalParameterException 
 
java.lang.Object 
    
|  
+--java.lang.Throwable 
     
 
  |  
中国银联 
版权所有

---
**[p288]**

287 
 
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
  
 
 
 
 
 
 
 
  |  
+--com.cup.nfc.NfcIllegalParameterException 
 
public class NfcIllegalParameterException extends NfcException 
 
提供一个异常，当传递给一个方法的一个或多个输入参数是无效的时候被抛出。 
 
构造函数摘要： 
构造函数和描述 
NfcIllegalParameterException()  
NfcIllegalParameterException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.4.5.6. NFC 非法使用异常 
com.cup.nfc 
Class NfcIllegalUseException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
    
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
中国银联 
版权所有

---
**[p289]**

288 
 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
  
 
 
 
 
 
 
 
  |  
+--com.cup.nfc.NfcIllegalUseException 
 
public class NfcIllegalUseException extends NfcException 
 
提供一个异常，当用户操作请求不被支持，或者用户创建的流程或若干操作是非法的时
候被抛出。 
 
构造函数摘要： 
构造函数和描述 
NfcIllegalUseException()  
NfcIllegalUseException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.4.5.7. NFC 输入输出异常 
com.cup.nfc 
Class NfcIOException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
                          |  
+--com.cup.langutil.CupRuntimeException 
中国银联 
版权所有

---
**[p290]**

289 
 
     
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
     
 
 
 
 
 
 
  |  
+--com.cup.nfc.NfcIOException 
 
直接的已知子类： 
NfcFlashWearoutException 
 
public class NfcIOException extends NfcException 
 
提供一个通用的输入输出异常。 
 
构造函数摘要： 
构造函数和描述 
NfcIOException()  
NfcIOException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.4.5.8. NFC 未初始化异常 
com.cup.nfc 
Class NfcNotInitializedException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
中国银联 
版权所有

---
**[p291]**

290 
 
     
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
    
 
 
 
 
 
 
  |  
+--com.cup.nfc.NfcNotInitializedException 
 
public class NfcNotInitializedException extends NfcException 
 
提供一个异常，当使用一个对象的属性没有被初始化的时候抛出。 
 
构造函数摘要： 
构造函数和描述 
NfcNotInitializedException()  
NfcNotInitializedException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.4.5.9. NFC 未支持异常 
com.cup.nfc 
Class NfcNotSupportedException 
 
java.lang.Object 
       |  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
                                  |  
中国银联 
版权所有

---
**[p292]**

291 
 
+--com.cup.nfc.NfcNotSupportedException 
 
public class NfcNotSupportedException extends NfcException 
 
提供一个异常，当一个方法或提供参数没有被一个实例支持，或者当用户尝试去创建一
个不支持的算法的实例的时候被抛出。 
 
构造函数摘要： 
构造函数和描述 
NfcNotSupportedException()  
NfcNotSupportedException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.4.5.10. NFC 缺乏资源异常 
com.cup.nfc 
Class NfcOutOfResourcesException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.nfc.NfcException 
    
 
 
 
 
 
 
  |  
+--com.cup.nfc.NfcOutOfResourcesException 
 
中国银联 
版权所有

---
**[p293]**

292 
 
public class NfcOutOfResourcesException extends NfcException 
 
提供一个异常，当由于系统上缺乏资源导致用户请求的动作无法执行的时候被抛出。 
 
构造函数摘要： 
构造函数和描述 
NfcOutOfResourcesException()  
NfcOutOfResourcesException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.5. com.cup.ui 
6.2.5.1. 功能描述 
当涉及到部署一个Internet或者Intranet服务的时候，在线服务提供商没有办法确保，
用户的客户端设备上没有一些恶意软件会修改用户所要看到的内容。同时也没法确保网络服
务提供商是在同一个真正的使用者做交互。 
针对这些安全漏洞，网络服务提供者很大程度上需要依赖用户本身具有一定的安全常
识。同时也造成了在一些交易中用户可能会产生纠纷的情况，原因是网络服务提供者没有办
法获得用户不可抵赖性的保证。 
What You See Is What You Sign (WYSIWYS) 所见即所得技术解决了在当今的在线服务
部署环境中的这些漏洞。WYSIWYS在实现上又可以称为Protected Transaction Display (PTD)
受保护的交易显示。当WYSIWYS 技术被使用时，一个在线服务供应者可以得到下列的保证： 
恶意程序无法从用户的显示设备上窃取被用户看到并认可的敏感数据。 
对用户来说安全敏感的输入，比如PIN，密码等是实际上由人为手动输入的，而不是由
恶意软件做重放尝试。 
真实服务的用户无法抵赖他们的终端设备参与了一个被认可的交易当中，因为需要人为
去做授权动作。 
总之，WYSIWYS/PTD 技术的目的是提供相关交易的完整性，保证用户的真实参与，以及
不可抵赖性。由于WYSIWYS 技术的设计实现并不依赖用户自身需要一定的安全常识，所以它
有助于提高安全性并减少服务提供商同用户产生争议的可能。 
WYSIWYS/PTD 利用具有加密功能的显示设备，可以防止向用户显示的内容被截取，从而
创造一个“加密的显示窗口”。由于这种加密的显示窗口是处于操作系统的窗口管理器的控
制下，所以操作系统可以通过鼠标移动和接收触屏输入，来同加密显示窗口上可点击（以及
中国银联 
版权所有

---
**[p294]**

293 
 
可接触的）显示窗口元素进行交互。 
此外，通过随机布局可点击（可接触）的显示窗口元素，这些元素在加密显示窗口
（WYSIWYS 窗口）上的显示与用户之间的交互是无法被客户端侧的恶意软件进行重放的。用
户对所有安全敏感数据的生成和解释只限定在隔离的环境中。 
这个技术的直接作用是，在不需要用户对任何的输入或显示窗口做可信度判断的前提
下，创建了一个不受欺骗的可信的用户输入及显示输出的途径。 
 
6.2.5.2. 编程接口描述 
该包提供一个接口创建客制化的用户对话框，并可以使用一种受保护的方式来做显示。 
该包包含下列关键类和接口： 
Button, Image, Label, Line, Rectangle, Widget - 这些类实现了基本的窗口组件，能
够被用来构造客制化的对话框。 
Dialog - 该类的实现被用来描述用户对话框包含的基本窗口组件。 
ProtectedOutput - 该类的实现被用来使用一种受保护的方式显示用户对话框。 
 
接口摘要： 
接口 
描述 
Clickable 
该接口提供了一个窗口组件可以响应外部的鼠标按
键操作。 
 
类摘要： 
类 
描述 
Button 
该抽象类提供了一个通用的Clickable 容器来包含
更多的窗口组件。 
CompositeWidget 
该抽象类提供了一个窗口组件能够包含其他窗口组
件。 
Dialog 
该抽象类提供了一个最高等级的容器能够包含所有
其他的窗口组件。 
Image 
该抽象类提供了一个位图的窗口组件，可按照指定格
式被画出来。 
Label 
该抽象类提供了一个标签的窗口组件，在一个透明的
框上有文字。 
Line 
该抽象类提供了一个线的的窗口组件，从起始点到终
止点。 
ProtectedOutput 
该类使一个应用能够使用受保护的方式实现输出功
能。 
Rectangle 
该抽象类提供一个矩形的窗口组件。 
中国银联 
版权所有

---
**[p295]**

294 
 
Widget 
该抽象类为所有窗口上的组件提供了一个父类。 
WidgetMapping 
该类提供了在对话框上窗口组件的尺寸和位置。 
XYPair 
该类提供一对数字来表示尺寸和位置。 
 
异常摘要： 
异常 
描述 
UiException 
提供一个通用UI 异常。 
UiIllegalParameterException 
提供一个UI 异常，当传递给方法的一个或多个输入
参数是无效的时候抛出。 
UiIllegalUseException 
提供一个UI 异常，当用户创建流程或若干操作是非
法的时候抛出。 
UiNotInitializedException 
提供一个UI 异常，当使用一个没有被初始化的对象
的时候抛出。 
UiNotSupportedException 
提供一个UI 异常，当一个方法或提供的参数没有被
实例支持，或者用户区尝试创建一个不支持的格式、
算法的实例的时候抛出。 
UiOutOfResourcesException 
提供一个UI 异常，当用户请求的动作因为缺乏系统
资源无法被执行的时候抛出。 
 
6.2.5.3. 接口 
6.2.5.3.1. 可点击组件 
com.cup.ui 
Interface Clickable 
 
所有已知的实现类： 
Button 
 
public interface Clickable 
 
该接口提供了一个窗口组件可以响应外部的鼠标按键操作。一个可点击的窗口组件不能
够被加到另一个组合的可点击的窗口组件中。 
 
方法摘要： 
修饰符和类型 
方法和描述 
boolean 
intersect(XYPair clickLocation) 
中国银联 
版权所有

---
**[p296]**

295 
 
 
如果当鼠标按到窗口组件区域返回真，否则返回假。 
 
6.2.5.4. 类 
6.2.5.4.1. 按键 
com.cup.ui 
Class Button 
 
java.lang.Object 
     
|  
+--com.cup.ui.Widget 
    
 
|  
+--com.cup.ui.CompositeWidget 
     
 
 
|  
+--com.cup.ui.Button 
 
所有实现的接口： 
Clickable 
 
public abstract class Button extends CompositeWidget 
implements Clickable 
 
该抽象类提供了一个通用的Clickable 容器来包含更多的窗口组件。比如，一个有字符
的矩形按键，能够通过在一个按键对象中加入矩形窗口组件和标签窗口组件来创建。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static Button 
create(short 
id, 
XYPair 
size, 
XYPair 
relLocation) 
 
该方法用来创建具体实例，并根据指定参数来做初始
化。 
boolean 
intersect(XYPair clickLocation) 
 
如果当鼠标按到窗口组件区域返回真，否则返回假。 
 
由类com.cup.ui.CompositeWidget 继承的方法 
addWidget, addWidgets, getWidgets 
 
中国银联 
版权所有

---
**[p297]**

296 
 
由类com.cup.ui.Widget 继承的方法 
getId, getRelativeLocation, getSize 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.4.2. 复合窗口组件 
com.cup.ui 
Class CompositeWidget 
 
java.lang.Object 
  |  
+--com.cup.ui.Widget 
     
 
|  
+--com.cup.ui.CompositeWidget 
 
直接的已知子类： 
Button 
 
public abstract class CompositeWidget extends Widget 
 
该抽象类提供了一个窗口组件能够包含其他窗口组件。该窗口组件会画在父组件的上
部，并且位置取决于该组件的左上角坐标。 
 
方法摘要： 
修饰符和类型 
方法和描述 
Void 
addWidget(Widget widget) 
 
在该复合组件中加入一个子组件。 
void 
addWidgets(Widget[] widgets) 
 
在该复合组件中加入多个子组件。 
Widget[] 
getWidgets() 
 
返回这个复合组件包含的组件列表。 
 
由类com.cup.ui.Widget 继承的方法 
getColor, getId, getRelativeLocation, getSize 
 
中国银联 
版权所有

---
**[p298]**

297 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.4.3. 对话框 
com.cup.ui 
Class Dialog 
 
java.lang.Object 
     
|  
+--com.cup.ui.Dialog 
 
public abstract class Dialog extends java.lang.Object 
 
该抽象类提供了一个最高等级的容器能够包含所有其他的窗口组件。当所有组件就位，
该对话框可以传递给ProtectedOutput 类来产生图片。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static short 
DIALOG_MAX_HEIGHT 
 
对话框高的最大值。 
static short 
DIALOG_MAX_WIDTH 
 
对话框宽的最大值。 
static short 
DIALOG_MIN_WIDTH 
 
对话框宽的最小值。 
 
方法摘要： 
修饰符和类型 
方法和描述 
void 
addWidget(Widget widget) 
 
在对话框中加入一个子组件。 
void 
addWidgets(Widget[] widgets) 
 
在对话框中加入多个子组件。 
static Dialog 
create(int bgColor, XYPair size) 
 
方法供创建具体实例，并用指定的参数初始化。 
int 
getBgColor() 
中国银联 
版权所有

---
**[p299]**

298 
 
 
以RGB 格式返回对话框的背景颜色(第0-7 位比特是
蓝色，8-15 位比特是绿色，16-23 位比特是红色，
24-31 位保留)。 
abstract WidgetMapping[] 
getClickableWidgetMappings() 
 
返回在对话框中可点击的窗口组件的映射。 
abstract Widget 
getClickedWidget(XYPair clickLocation) 
 
检查窗口对象上的可点击组件是否同鼠标按键有重
合，并返回该组件。 
XYPair 
getSize() 
 
返回该对话框总像素点大小。 
Widget[] 
getWidgets() 
 
返回该对话框包含的组件列表。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.4.4. 图片 
com.cup.ui 
Class Image 
 
java.lang.Object 
     
|  
+--com.cup.ui.Widget 
    
    |  
+--com.cup.ui.Image 
 
public abstract class Image extends Widget 
 
该抽象类提供了一个位图窗口组件，可按照指定格式被画出来。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static byte 
FORMAT_RGB_24BPP 
 
标准RGB 颜色格式：第0-7 位比特是蓝色，8-15 位
比特是绿色，16-23 位比特是红色。 
中国银联 
版权所有

---
**[p300]**

299 
 
static byte 
FORMAT_RGB_32BPP 
 
XRGB 颜色格式：第0-7 位比特是蓝色，8-15 位比特
是绿色，16-23 位比特是红色，24-31 位保留。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static Image 
create(short 
id, 
XYPair 
size, 
XYPair 
relLocation, byte format, byte[] imageData) 
 
该方法创建一个具体实例，并用指定参数进行初始
化。 
byte 
getFormat() 
 
返回图片格式。 
byte[] 
getImage() 
 
返回图片缓存。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.4.5. 标签 
com.cup.ui 
Class Label 
 
java.lang.Object 
    
|  
+--com.cup.ui.Widget 
     
 
|  
+--com.cup.ui.Label 
 
public abstract class Label extends Widget 
 
该抽象类提供了一个标签窗口组件，在一个透明的框上有文字。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static byte 
FONT_TYPE_CLEAR_SANS 
 
Clear Sans 字体。 
中国银联 
版权所有

---
**[p301]**

300 
 
static short 
LABEL_MAX_LENGTH 
 
标签文字最大长度。 
static short 
LABEL_MIN_LENGTH 
 
标签文字最小长度。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static Label 
create(short 
id, 
int 
fontColor, 
XYPair 
relLocation, 
java.lang.String 
text, 
byte 
fontType) 
 
该方法被用来创建一个具体实例，并用指定参数进行
初始化。 
byte 
getFontType() 
 
返回字体类型。 
java.lang.String 
getText() 
 
返回标签中包含的文字。 
static XYPair 
getTextSize(byte fontType, java.lang.String 
text) 
 
返回文字的大小，按照像素点（宽和高）来表示。 
 
由类com.cup.ui.Widget 继承的方法 
getColor, getId, getRelativeLocation, getSize 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.4.6. 线 
com.cup.ui 
Class Line 
 
java.lang.Object 
     
|  
+--com.cup.ui.Widget 
    
 
|  
+--com.cup.ui.Line 
中国银联 
版权所有

---
**[p302]**

301 
 
 
public abstract class Line extends Widget 
 
该抽象类提供了一个线的子窗口组件，从起始点到终止点。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static Line 
create(short id, int color, XYPair start, XYPair 
end, short thickness) 
 
该方法被用来创建一个具体实例，并使用指定参数进
行初始化操作。 
XYPair 
getEnd() 
 
返回在对应的父窗口组件上线的终止点。 
XYPair 
getStart() 
 
返回在对应的父窗口组件上线的起始点。 
short 
getThickness() 
 
返回线的宽度。 
 
由类com.cup.ui.Widget 继承的方法 
getColor, getId, getRelativeLocation 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.4.7. 保护输出 
com.cup.ui 
Class ProtectedOutput 
 
java.lang.Object 
    
|  
+--com.cup.ui.ProtectedOutput 
 
public abstract class ProtectedOutput extends java.lang.Object 
 
该类使一个应用能够使用受保护的方式实现输出功能。它实现了加密功能，能够加密渲
染图片并替换加密密钥。 
中国银联 
版权所有

---
**[p303]**

302 
 
 
字段摘要： 
修饰符和类型 
字段和描述 
static short 
AES_CTR_IV_LENGTH 
 
支持PAVP 的加密计数器长度。 
static short 
KEY_LENGTH 
 
支持PAVP 的密钥长度。 
static byte 
RENDERING_FORMAT_XRGB 
 
XRGB 图片格式，能被startRendering 方法支持。 
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract short 
getEncryptedKeyRecord(byte[] keyStorage, short 
keyIndex) 
 
该方法取回加密密钥，并被提供给GFX 驱动作为密钥
注入。 
abstract int 
getImageBlock(byte[] data, int index, int 
maxLength) 
 
该方法取回对话框图片的数据块并发送到客户端。 
static ProtectedOutput 
getInstance(int handle, byte[] key, short 
keyIndex, short keyLength) 
 
该方法被用来创建一个ProtectedOutput 的实例。 
abstract short 
getIV(byte[] buffer, short index) 
 
该方法取回初始化向量值。 
abstract void 
releaseImage() 
 
该方法释放掉内部系统的渲染缓存。 
abstract void 
setNewKey(byte[] key, short keyIndex, short 
keyLength) 
 
该方法用一个新的密钥替换当前使用的加密密钥。 
abstract int 
startRendering(Dialog dialog, byte format) 
 
处理输入的对话框对象，并将结果图片在内部系统的
渲染缓存中进行渲染操作。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
中国银联 
版权所有

---
**[p304]**

303 
 
 
6.2.5.4.8. 矩形 
com.cup.ui 
Class Rectangle 
 
java.lang.Object 
    
|  
+--com.cup.ui.Widget 
     
 
|  
+--com.cup.ui.Rectangle 
 
public abstract class Rectangle extends Widget 
 
该抽象类提供一个矩形的窗口组件。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static byte 
FILL_TYPE_ALL 
 
使用fillColor 将矩形填充满。 
static byte 
FILL_TYPE_BORDER 
 
使用borderColor 将矩形的边框充满。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static Rectangle 
create(short id, int fillColor, XYPair size, 
XYPair relLocation, byte fillType, boolean 
curvedEdges, 
int 
borderColor, 
short 
borderWidth) 
 
该方法被用来创建具体实例，并使用指定的参数进行
初始化操作。 
int 
getBorderColor() 
 
按照RGB 格式返回边框颜色。 
short 
getBorderWidth() 
 
返回边框的宽度的像素值。 
byte 
getFillType() 
 
返回填充类型。 
中国银联 
版权所有

---
**[p305]**

304 
 
boolean 
hasCurvedEdges() 
 
返回该矩形是否有弯曲的边缘。 
 
由类com.cup.ui.Widget 继承的方法 
getColor, getId, getRelativeLocation, getSize 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.4.9. 窗口组件 
com.cup.ui 
Class Widget 
 
java.lang.Object 
     
|  
+--com.cup.ui.Widget 
 
直接的已知子类： 
CompositeWidget, Image, Label, Line, Rectangle 
 
public abstract class Widget extends java.lang.Object 
 
该抽象类为所有窗口上的组件提供了一个父类。一个窗口组件包含下列属性：ID，大小，
颜色，和相关的在对应父组件上所处的位置。调用应用通过组件ID 来进行快速索引，组件
ID 不会被Java 包类内部使用。 
 
方法摘要： 
修饰符和类型 
方法和描述 
int 
getColor() 
 
返回组件的RGB 颜色。 
short 
getId() 
 
返回组件ID。 
XYPair 
getRelativeLocation() 
 
返回组件在对应的父组件上的相对位置。 
XYPair 
getSize() 
中国银联 
版权所有

---
**[p306]**

305 
 
 
返回组件的大小。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.4.10. 组件映射 
com.cup.ui 
Class WidgetMapping 
 
java.lang.Object 
     
|  
+--com.cup.ui.WidgetMapping 
 
public class WidgetMapping extends java.lang.Object 
 
该类提供了在对话框上窗口组件的尺寸和位置。 
方法摘要： 
修饰符和类型 
方法和描述 
XYPair 
getLocation() 
 
返回组件在父对话框上的绝对位置。 
XYPair 
getSize() 
 
返回组件的整个像素尺寸。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.4.11. XY 坐标对 
com.cup.ui 
Class XYPair 
 
java.lang.Object 
    
|  
+--com.cup.ui.XYPair 
 
public class XYPair extends java.lang.Object 
中国银联 
版权所有

---
**[p307]**

306 
 
 
该类提供一对数字来表示尺寸和位置。 
 
构造函数摘要： 
构造函数和描述 
XYPair(short x, short y) 
根据指定的X 和Y 值，创建一个新的XYPair。 
 
方法摘要： 
修饰符和类型 
方法和描述 
Short 
getX() 
 
返回X 值。 
Short 
getY() 
 
返回Y 值。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.5.5. 异常 
6.2.5.5.1. UI 异常 
com.cup.ui 
Class UiException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
    
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.ui.UiException 
 
直接的已知子类： 
中国银联 
版权所有

---
**[p308]**

307 
 
UiIllegalParameterException, 
UiIllegalUseException, 
UiNotInitializedException, UiNotSupportedException, UiOutOfResourcesException 
 
public class UiException extends CupRuntimeException 
 
提供一个通用UI 异常。所有特定的UI 异常需要从这个基类上扩展。 
 
构造函数摘要： 
构造函数和描述 
UiException()  
UiException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.5.5.2. UI 非法参数异常 
com.cup.ui 
Class UiIllegalParameterException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.ui.UiException 
     
 
 
 
 
 
 
  |  
+--com.cup.ui.UiIllegalParameterException 
 
中国银联 
版权所有

---
**[p309]**

308 
 
public class UiIllegalParameterException extends UiException 
 
提供一个UI 异常，当传递给方法的一个或多个输入参数是无效的时候抛出。 
 
构造函数摘要： 
构造函数和描述 
UiIllegalParameterException()  
UiIllegalParameterException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.5.5.3. UI 非法使用异常 
com.cup.ui 
Class UiIllegalUseException 
 
java.lang.Object 
    
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.ui.UiException 
     
 
 
 
 
 
 
  |  
+--com.cup.ui.UiIllegalUseException 
 
public class UiIllegalUseException extends UiException 
 
提供一个UI 异常，当用户创建流程或若干操作是非法的时候抛出。 
中国银联 
版权所有

---
**[p310]**

309 
 
 
构造函数摘要： 
构造函数和描述 
UiIllegalUseException()  
UiIllegalUseException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
6.2.5.5.4. UI 未初始化异常 
com.cup.ui 
Class UiNotInitializedException 
 
java.lang.Object 
       |  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.ui.UiException 
     
 
 
 
 
 
 
  |  
+--com.cup.ui.UiNotInitializedException 
 
public class UiNotInitializedException extends UiException 
 
提供一个UI 异常，当使用一个没有被初始化的对象的时候抛出。 
 
构造函数摘要： 
中国银联 
版权所有

---
**[p311]**

310 
 
构造函数和描述 
UiNotInitializedException()  
UiNotInitializedException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
6.2.5.5.5. UI 未支持异常 
com.cup.ui 
Class UiNotSupportedException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.ui.UiException 
     
 
 
 
 
 
 
  |  
+--com.cup.ui.UiNotSupportedException 
 
public class UiNotSupportedException extends UiException 
 
提供一个UI 异常，当一个方法或提供的参数没有被实例支持，或者用户区尝试创建一
个不支持的格式、算法的实例的时候抛出。 
 
构造函数摘要： 
构造函数和描述 
中国银联 
版权所有

---
**[p312]**

311 
 
UiNotSupportedException()  
UiNotSupportedException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.5.5.6. UI 缺乏资源异常 
com.cup.ui 
Class UiOutOfResourcesException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
    
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.ui.UiException 
    
 
 
 
 
 
 
  |  
+--com.cup.ui.UiOutOfResourcesException 
 
public class UiOutOfResourcesException extends UiException 
 
提供一个异常，当用户请求的动作因为缺乏系统资源无法被执行的时候抛出。 
 
构造函数摘要： 
构造函数和描述 
UiNotSupportedException()  
UiNotSupportedException(java.lang.String msg)  
中国银联 
版权所有

---
**[p313]**

312 
 
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6. com.cup.util 
6.2.6.1. 功能描述 
6.2.6.1.1. 安全时间 – Secure Time 
6.2.6.1.1.1. 
描述 
使用平台的受保护运行时钟（PRTC）来获取和设置一个安全时间。由于没有全局可用的
初始时间，因此，可信应用程序仍需要从一些可信赖的来源得到初始的安全时间。 
出于安全原因，每组可信应用程序的时间设置独立于所有其他可信应用程序所设置的时
间。 
应用程序可以使用这个功能来创建自己同时间相关的概念逻辑。这个功能可以被用来获
得当前时间。 
 
6.2.6.1.1.2. 
初始化 
Calendar对象被实例化时需要将Calendar.CLOCK_SOURCE_PRTC作为参数。 
当前时间需要从一个可信赖的来源获得，并且只能被一次性初始化注入。 
Calendar.setTime() 需要被调用。返回的字节数组包括Calendar的元数据。 
该元数据需要被安全地保存在存储介质上供将来使用。 
 
6.2.6.1.1.3. 
使用 
Calendar对象被实例化时需要将Calendar.CLOCK_SOURCE_PRTC作为参数。 
Calendar的元数据需要从存储介质上被取回。 
Calendar.setTime() 能够将字节数组元数据作为输入被调用。 
当前的时间按照UNIX时间戳格式返回：从1970年1月1日起至今的总的秒数。 
 
6.2.6.1.2. 存储 – Flash Storage 
中国银联 
版权所有

---
**[p314]**

313 
 
支持可信应用程序在内部存储介质上有一块很小的存储空间，最大为256字节。这个数
据块不能被可信应用程序用于一般性存储目的，只能用于存储那些一旦丢失会危害可信应用
程序的敏感数据。 
该数据块（同时也包括PBIND密钥）在清除CMOS或移除纽扣电池的情况下会丢失。所以
如果数据是重要的（比如用户数据等），它需要用另一个不同的密钥保护在别处做备份存储。 
针对普通的存储目的，应用可以将数据用PBIND密钥加密，并使用单调计数器来防止重
放攻击。 
多实例的可信应用程序可以访问同一数据（包括在内部存储介质上，或在客户端侧做加
密存储）。 
 
6.2.6.1.3. 计时器 
支持是在某个时间点进行异步的回调，也就是计时器机制。 
计时器的精度是限制到毫秒级别，并可能依赖于其他可信应用程序的执行和上下文切
换。因此，可信应用程序不应该基于计时器机制来做高精度的时间计算。同时，可信应用程
序不应该使用会非常快过期的计时器，例如，在几毫秒内计时器过期的情况。可信应用程序
可以假定一个计时器将不会在它的时间期满前被调用。 
可信应用程序可以使用Calendar类来得到没有太大偏离的精确结果。 
 
6.2.6.1.4. 事件 
支持从其他可信应用程序或本地服务发送和接收事件。使用事件机制，可信应用程序必
须在权限清单中定义一个发送/接收事件的特殊许可。可信应用程序事件发送到相同的可信
应用程序的所有实例，而不是一个特定的可信应用程序实例。相反，本地事件被发送到一个
可信应用程序的一个具体的实例。 
事件机制可以被其他服务，例如计时器和NFC等服务利用到。为了使用事件机制，这些
服务需要在实现的时候就包含事件机制相关的权限。 
可信应用程序可以使用SendAnyMessage()方法向客户端侧应用发送事件。可信应用程序
不能在处理事件的同时处理从客户端侧收到的命令。发送太多的事件将会塞满事件队列并导
致消息丢失。 
 
6.2.6.2. 编程接口描述 
该包提供了util 接口。 
该包包含了下列关键的类和接口： 
Calendar 类 - 为应用提供时间配置服务。 
MTC 类 - 为应用提供单调计数器服务。 
DebugPrint 类 - 为应用提供调试打印服务。 
中国银联 
版权所有

---
**[p315]**

314 
 
FlashStorage 类 - 为应用提供闪存访问服务。 
EventClient, EventManager, AppletEvent 类 - 提供应用间访问的事件功能 
TimerClient, TimerManager 类 - 为应用提供计时器服务 
 
接口摘要： 
接口 
描述 
TimerClient 
应用在创建TimerManager.Timer 的时候需要实现这
个接口来接收计时器的运转通知。 
 
类摘要： 
类 
描述 
AppletEvent 
该类提供了数据访问并将事件交付给EventClient。 
Calendar 
该抽象类提供一些方法，给应用创建它们自己的时间
逻辑。 
Calendar.DateTime 
该类提供了一个不可变的日期和时间设置。 
Calendar.TimeRange 
该类提供了一个时间范围，该时间范围是一个两端闭
合的区间。 
DebugPrint 
该类使用调试事件服务，将调试信息通过不同接口发
送，例如网络，HECI 和其他。 
EventClient 
该类需要被应用实现，并在EventManager 通过
register 方法进行注册，从而能够从其他应用处收
到事件通知。 
EventManager 
该类允许注册应用同系统中的其他应用或者本地应
用接收以及发送事件。 
FlashStorage 
该类提供了供应用访问flash 存储的API。 
CupApplet 
这是一个需要被所有应用类继承的基类。 
MTC 
该类为应用提供了一个调用单调计数器功能的接口。 
PlatformId 
该类提供了配置平台ID 的能力。 
PlatformInfo 
该类提供了查询和配置各种平台信息的能力。 
PlatformInfo.Version 
 
TimerManager 
该类提供了计时器的创建和管理功能。 
TimeZone 
该类提供了一个时区和提供一种方法来计算从格林
尼治时间时区的偏移量。 
 
异常摘要： 
中国银联 
版权所有

---
**[p316]**

315 
 
异常 
描述 
AccessDeniedException 
提供一个异常，当一个应用没有权限去执行申请的操
作是抛出。 
FileNotFoundException 
提供一个输入输出异常，当尝试去对一个不存在的文
件做文件操作的时候抛出。 
FlashWearoutException 
提供一个输入输出异常，当闪存损耗机制阻止对闪存
的写和擦除操作时抛出。 
IllegalParameterException 
提供一个异常，当传递给方法的一个或多个输入参数
是无效的时候抛出。 
IllegalUseException 
提供一个异常，当用户创建流程或若干操作是非法的
时候抛出。 
IOException 
提供一个通用的输入输出异常。 
NotInitializedException 
提供一个异常，当使用一个没有被初始化的对象的时
候抛出。 
NotSupportedException 
提供一个异常，当一个方法或提供的参数没有被实例
支持，或者用户去尝试创建一个不支持的格式、算法
的实例的时候抛出。 
UtilException 
提供一个通用的util 异常。 
UtilOutOfResourcesException 
提供一个异常，当用户请求的动作因为缺乏系统资源
无法被执行的时候抛出。 
 
6.2.6.3. 接口 
6.2.6.3.1. 计时器客户端 
com.cup.util 
Interface TimerClient 
 
public interface TimerClient 
 
应用在创建TimerManager.Timer 的时候需要实现这个接口来接收计时器的运转通知。 
 
方法摘要： 
修饰符和类型 
方法和描述 
void 
onTimerTick(byte[] userData) 
 
当计时器客户端被注册或者过期时，系统会调用该接
口。 
中国银联 
版权所有

---
**[p317]**

316 
 
 
6.2.6.4. 类 
6.2.6.4.1. AppletEvent 
com.cup.util 
Class AppletEvent 
 
java.lang.Object 
     
|  
+--com.cup.util.AppletEvent 
 
public class AppletEvent extends java.lang.Object 
 
该类提供了数据访问并将事件交付给EventClient。 
 
方法摘要： 
修饰符和类型 
方法和描述 
byte[] 
getData() 
 
取回应用定义的同这个事件关联的数据。 
int 
getData(byte[] destination, int index) 
 
将应用定义的同这个事件关联的数据复制到被输入
的数组中。 
int 
getDataLength() 
 
返回应用定义的同该事件关联的数据长度。 
int 
getReason() 
 
返回事件的原因代码。 
java.lang.String 
getSource() 
 
使用字串形式返回发送事件的应用的UUID。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.2. 日历 
com.cup.util 
中国银联 
版权所有

---
**[p318]**

317 
 
Class Calendar 
 
java.lang.Object 
  
    |  
+--com.cup.util.Calendar 
 
public abstract class Calendar extends java.lang.Object 
 
该抽象类提供一些方法，给应用创建它们自己的时间逻辑。允许创建下列日历类别的实
例： 
CLOCK_SOURCE_PRTC - 基于安全时间 - 受保护的实时时钟 
该类可以使不同的应用配置它们自身的时间，而不会影响别的应用的时间，或者其他使
用安全时钟的实体。 
 
嵌套类摘要： 
修饰符和类型 
类和描述 
static class  
Calendar.DateTime 
 
该类提供一个不可变的日期时间设置。 
static class  
Calendar.TimeRange 
 
该类提供一个时间区间。 
 
该时间范围是一个两端闭合的区间。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static byte 
CLOCK_SOURCE_PRTC 
 
日历实例使用这个时钟源来创建并配置它们自己的
安全时间（secure time - Protected Real Time 
Clock）的时间逻辑。 
static byte 
SET_TIME_INFO_LENGTH 
 
当调用setTime 方法时需要被set_time_info 数组使
用这个长度值。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static Calendar.DateTime 
createDateTime(int unixTime) 
 
创建一个新的DateTime 实例。 
static Calendar.DateTime 
createDateTime(short year, byte month, byte 
day, byte hour, byte minute, byte second) 
中国银联 
版权所有

---
**[p319]**

318 
 
 
创建一个新的DateTime 实例。 
static Calendar.TimeRange 
createTimeRange(Calendar.DateTime 
start, 
Calendar.DateTime end) 
 
创建一个新的Calendar.TimeRange。 
static Calendar 
getInstance(byte clock_source, TimeZone zone) 
 
创建一个Calendar 实例，并使用指定的时钟源。 
static long 
getMillisFromStartup() 
 
返回从系统启动开始的毫秒总数。 
abstract int 
getTime(byte[] set_time_info, int offset) 
 
获得Calendar 实例的时间。 
abstract void 
setTime(int time, byte[] set_time_info, int 
offset) 
 
设置Calendar 实例的时间。 
abstract void 
setTimeZone(TimeZone zone) 
 
更新被Calendar 实例使用的时区设置。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.3. Calendar.DateTime 
com.cup.util 
Class Calendar.DateTime 
 
java.lang.Object 
  
 
|  
+--com.cup.util.Calendar.DateTime 
 
外层类： 
Calendar 
 
public abstract static class Calendar.DateTime extends java.lang.Object 
 
该类提供了一个不可变的日期和时间设置。 
 
构造函数摘要： 
中国银联 
版权所有

---
**[p320]**

319 
 
构造函数和描述 
Calendar.DateTime()  
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract byte 
day() 
 
返回DateTime 天数 
abstract boolean 
equals(Calendar.DateTime other) 
 
判断实例中的时间同提供的时间是否相等。 
abstract byte 
hour() 
 
返回DateTime 小时数。 
abstract boolean 
isAfter(Calendar.DateTime other) 
 
判断实例中的时间是否在提供的时间之后。 
abstract boolean 
isBefore(Calendar.DateTime other) 
 
判断实例中的时间是否早于提供的时间。 
abstract byte 
minute() 
 
返回DateTime 的分钟数。 
abstract byte 
month() 
 
返回DateTime 的月数。 
abstract byte 
second() 
 
返回DateTime 的秒数。 
abstract short 
year() 
 
以YYYY 的格式返回DateTime 的年数。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.4. Calendar.TimeRange 
com.cup.util 
Class Calendar.TimeRange 
 
java.lang.Object 
     
|  
中国银联 
版权所有

---
**[p321]**

320 
 
+--com.cup.util.Calendar.TimeRange 
 
外层类： 
Calendar 
 
public abstract static class Calendar.TimeRange extends java.lang.Object 
 
该类提供一个时间范围。该时间范围是两端闭合的区间。 
 
构造函数摘要： 
构造函数和描述 
Calendar.TimeRange()  
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract boolean 
contains(Calendar.DateTime date) 
 
检查DateTime 是否在指定的范围内。 
abstract Calendar.DateTime 
end() 
 
返回一个calendar.datetime 对象的时间范围的结
束值。 
abstract Calendar.DateTime 
start() 
 
返回一个calendar.datetime 对象的时间范围的起
始值。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.5. 调试打印 
com.cup.util 
Class DebugPrint 
 
java.lang.Object 
    
|  
+--com.cup.util.DebugPrint 
 
public class DebugPrint extends java.lang.Object 
 
中国银联 
版权所有

---
**[p322]**

321 
 
该类使用调试事件服务机制，将调试信息通过不同接口发送，例如网络，HECI 和其他。
该调试信息可以被捕获和显示。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static int 
SEVERITY_CRITICAL_ERROR 
 
消息重要性来标识一个危险的错误。 
static int 
SEVERITY_EXPECTED_ERROR 
 
消息重要性来标识一个预料中的错误。 
static int 
SEVERITY_NO_ERROR 
 
消息重要性标识没有错误的消息。 
static int 
SEVERITY_UNEXPECTED_ERROR 
 
消息重要性标识一个意料之外的错误。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static void 
printBuffer(byte[] buffer) 
 
打印到缓存中的每个字节的十六进制值。 
static void 
printBuffer(int type, int severity, byte[] 
buffer, int bufOffset, int bufLength) 
 
打印缓存中的部分字节的十六进制值。 
static void 
printInt(int value) 
 
将整型的四个字节的值打印成字串。 
static void 
printInt(int type, int severity, int value) 
 
将整型的四个字节的值打印成字串。 
static void 
printString(int 
type, 
int 
severity, 
java.lang.String str) 
 
打印一个字串。 
static void 
printString(java.lang.String str) 
 
打印一个字串。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
中国银联 
版权所有

---
**[p323]**

322 
 
6.2.6.4.6. 事件客户端 
com.cup.util 
Class EventClient 
 
java.lang.Object 
       |  
+--com.cup.util.EventClient 
 
public abstract class EventClient extends java.lang.Object 
 
该类需要被应用实现，并在EventManager 通过register 方法进行注册，从而能够从其
他应用处收到事件通知。当事件发送到这个应用的时候，系统会调用这个应用实现的处理方
法。 
 
构造函数摘要： 
构造函数和描述 
EventClient()  
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract void 
process(AppletEvent event) 
 
当为已注册的EventClient 发送一个事件的时候，系
统会调用这个方法。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.7. 事件管理器 
com.cup.util 
Class EventManager 
 
java.lang.Object 
     
|  
+--com.cup.util.EventManager 
 
public class EventManager extends java.lang.Object 
 
中国银联 
版权所有

---
**[p324]**

323 
 
该类允许注册应用同系统中的其他应用或者本地应用接收以及发送事件。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static int 
ACTOR_APPLET 
 
事件去往或起源于系统中的另一个应用。 
static int 
ACTOR_NATIVE 
 
事件去往或起源于本地应用 
 
方法摘要： 
修饰符和类型 
方法和描述 
static void 
post(int reason, byte[] data, int index, int 
length) 
 
该方法向系统中所有注册的客户端发送事件。 
static void 
post(int reason, byte[] data, int index, int 
length, 
java.lang.String 
targetUUID, 
int 
targetType) 
 
该方法发送一个事件到一个指定的应用（根据提供的
UUID）或本地应用。 
static void 
register(int reason, EventClient client) 
 
这个方法使用指定的原因代码注册提供的
EventClient 来处理事件。 
static void 
unregister(int reason) 
 
这个方法使用指定的原因代码将所有注册的
EventClient 清除掉。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.8. 闪存存储 
com.cup.util 
Class FlashStorage 
 
java.lang.Object 
     
|  
中国银联 
版权所有

---
**[p325]**

324 
 
+--com.cup.util.FlashStorage 
 
public class FlashStorage extends java.lang.Object 
 
该类提供了供应用访问flash 存储的API。  
在一般情况下，使用flash 存储应用程序数据是不推荐，因为应用可用的flash 空间是
非常有限的。此外，默认情况下，应用程序没有Flash 存储器的访问权限，除非应用程序的
安装包的权限部分能隐式的指定。应用程序数据存储在flash 上作为一个加密的BLOB 并有
数据完整性保护，每个应用程序只能访问其自己的数据。 
程序应该使用离线数据存储（例如，硬盘）来保存相关的的非易失数据，而不是使用
Flash 存储器。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static void 
eraseFlashData(int fileName) 
 
将指定的应用文件从flash 上清除掉。 
static int 
getFlashDataSize(int fileName) 
 
返回在flash 上的指定应用文件的大小。 
static int 
readFlashData(int fileName, byte[] dest, int 
destOff) 
 
从flash 上读取指定的应用文件中的数据，并复制到
指定的目标数组。 
static void 
writeFlashData(int fileName, byte[] src, int 
srcOff, int srcLen) 
 
将提供的数据写到flash 上指定的应用文件里。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.9. CupApplet 
com.cup.util 
Class CupApplet 
 
java.lang.Object 
     
|  
+--com.cup.runtime.core.Service 
     
 
|  
中国银联 
版权所有

---
**[p326]**

325 
 
+--com.cup.util.CupApplet 
 
public abstract class CupApplet extends com.cup.runtime.core.Service 
 
这是一个需要被所有应用类继承的基类。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static int 
APPLET_ERROR_BAD_PARAMETERS  
static int 
APPLET_ERROR_BAD_STATE  
static int 
APPLET_ERROR_GENERIC  
static int 
APPLET_ERROR_NOT_SUPPORTED  
static int 
APPLET_ERROR_SMALL_BUFFER  
static int 
APPLET_SUCCESS  
 
由类com.cup.runtime.core.Service 继承的字段 
CMD_CLOSE, CMD_PING, ERR_BAD_PARAMETERS, ERR_BAD_STATE, ERR_GENERIC, ERR_NONE, 
ERR_SMALL_BUFFER, ERR_UNCAUGHT_EXCEPTION 
 
构造函数摘要： 
构造函数和描述 
CupApplet()  
 
方法摘要： 
修饰符和类型 
方法和描述 
int 
getResponseBufferSize() 
 
返回应用响应能返回的最大缓存大小。 
int 
getSessionId(byte[] sessionId, int index) 
 
返回一个唯一的应用会话标识。 
int 
getSessionIdLength() 
 
返回一个应用会话标识的长度。 
java.lang.String 
getUUID() 
 
返回一个应用的UUID，并输出对应字串。 
abstract int 
invokeCommand(int commandId, byte[] request) 
 
该方法被调用来处理应用实例发出的命令。 
中国银联 
版权所有

---
**[p327]**

326 
 
int 
onClose() 
 
该方法被调用来关闭应用实例的会话，并且清除应用
实例。 
int 
onCloseSession() 
 
关闭会话，该方法不能被直接使用。 
int 
onCommand(int command, byte[] params) 
 
发送命令，该方法不能被直接使用。 
int 
onInit(byte[] request) 
 
该方法被调用来创建处理一个应用实例的一个新会
话，而且该新会话被应用打开。 
int 
onOpenSession(byte[] params) 
 
打开会话，该方法不能被直接使用。 
void 
sendAsynchMessage(byte[] data, int index, int 
length) 
 
软件应用程序同应用通过异步接口发送消息通信。 
void 
setResponse(byte[] response, int index, int 
length) 
 
在invokeCommand 方法中更新返回的响应数据。 
void 
setResponseCode(int responseCode) 
 
在invokeCommand 方法中更新返回的响应代码。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.10. 单调计数器 
com.cup.util 
Class MTC 
 
java.lang.Object 
    
|  
+--com.cup.util.MTC 
 
public class MTC extends java.lang.Object 
 
中国银联 
版权所有

---
**[p328]**

327 
 
该类提供程序使用单调计数器功能的接口。可用于应用程序在flash 存储一个Int32
值，每个应用一个计数器。单调计数器能够帮助可信应用程序来检测离线存储数据是否遭到
重放攻击。每一次附上计数器机制的可信应用程序的调用，单调计数器会增加，并且将计数
器值同对应的数据一起做哈希运算。在重放攻击中，数据由于没有同正确的单调计数器值一
起做哈希运算，所以会被甄别出来。 
 
方法摘要： 
修饰符和类型 
方法和描述 
static int 
getMTC() 
 
返回调用应用的当前单调计数器的值。 
static int 
incrementMTC() 
 
增加并返回调用应用的新的单调计数器的值。 
static int 
resetMTC() 
 
将调用应用的单调计数器的值重置为0 并返回。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.11. 平台ID 
com.cup.util 
Class PlatformId 
 
java.lang.Object 
    
|  
+--com.cup.util.PlatformId 
 
public abstract class PlatformId extends java.lang.Object 
 
该类提供了平台ID 的配置功能。 
 
字段摘要： 
修饰符和类型 
字段和描述 
static short 
TYPE_OEM_ID 
 
OEM ID, 由OEM 在生产过程中配置在镜像中。 
static short 
TYPE_RESERVED_ID 
 
保留ID，当前未被使用(将来可能被用于销售商
中国银联 
版权所有

---
**[p329]**

328 
 
IDReseller ID)。 
static short 
TYPE_SYSTEM_INTEGRATOR_ID 
 
系统整合者ID, 由OEM 在生产过程中配置在镜像中。 
 
构造函数摘要： 
构造函数和描述 
PlatformId()  
 
方法摘要： 
修饰符和类型 
方法和描述 
static PlatformId[] 
getOemIds() 
 
返回所有OEM 在平台上配置的ID。 
abstract int 
getType() 
 
返回实例表现的ID 类型。 
abstract byte[] 
getValue() 
 
返回实例表现的ID 的值。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.12. 平台信息 
com.cup.util 
Class PlatformInfo 
 
java.lang.Object 
     
|  
+--com.cup.util.PlatformInfo 
 
public class PlatformInfo extends java.lang.Object 
 
该类提供了应用查询和配置各种平台信息的能力。 
 
嵌套类摘要： 
修饰符合类型 
类和描述 
static class  
PlatformInfo.Version  
中国银联 
版权所有

---
**[p330]**

329 
 
 
字段摘要： 
修饰符和类型 
字段和描述 
static int 
FEATURE_SET_CRYPTO 
 
一个常量标识支持的加密算法能力(RSA，对称加密算
法，哈希和签名算法） 
static int 
FEATURE_SET_NFC 
 
一个常量标识平台支持NFC 能力。 
static int 
FEATURE_SET_PLATFORM_API 
 
一个常量标识平台指定util API 被支持。 
static int 
FEATURE_SET_SSL 
 
一个常量标识SSL 能力被支持。 
static int 
FEATURE_SET_STORAGE 
 
一个常量标识flash 存储能力被支持。 
static int 
FEATURE_SET_TRUSTED_INPUT 
 
一个常量标识可信输入能力被支持。 
static int 
FEATURE_SET_TRUSTED_OUTPUT 
 
一个常量标识可信输出能力被支持。 
static int 
FEATURE_SET_UTILS 
 
一个常量标识util 被支持（事件，定时器，日历，
单调计数器） 
 
方法摘要： 
修饰符和类型 
方法和描述 
static int 
getFeatureSet() 
 
返回平台支持的功能。 
static short 
getSecurityEngineFamily() 
 
返回被使用的安全引擎。 
static PlatformInfo.Version 
getSecurityEngineVersion() 
 
返回安全引擎版本。 
static int 
getSkuId() 
 
返回平台特定SKU 的代表值。 
 
由类java.lang.Object 继承的方法 
中国银联 
版权所有

---
**[p331]**

330 
 
equals, getClass, hashCode, toString 
 
6.2.6.4.13. 平台信息 – 版本信息 
com.cup.util 
Class PlatformInfo.Version 
 
java.lang.Object 
     
|  
+--com.cup.util.PlatformInfo.Version 
 
外层类： 
PlatformInfo 
 
public static class PlatformInfo.Version extends java.lang.Object 
 
方法摘要： 
修饰符和类型 
方法和描述 
int 
hotfix() 
 
返回安全引擎的补丁版本。 
int 
major() 
 
返回安全引擎的最大版本。 
int 
minor() 
 
返回安全引擎的最小版本。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.14. 定时器管理器 
com.cup.util 
Class TimerManager 
 
java.lang.Object 
     
|  
+--com.cup.util.TimerManager 
 
中国银联 
版权所有

---
**[p332]**

331 
 
public abstract class TimerManager extends java.lang.Object 
 
该类允许创建和管理计时器。 
 
嵌套类摘要： 
修饰符和类型 
类和描述 
class  
TimerManager.Timer 
 
该类描述一个单一的定时器对象，并且允许执行开
始，结束和销毁定时器操作。 
 
构造函数摘要： 
构造函数和描述 
TimerManager()  
 
方法摘要： 
修饰符和类型 
方法和描述 
abstract TimerManager.Timer 
createTimer(TimerClient client) 
 
创建一个定时器对象，并注册TimerClient 在定时器
期满时被调用。 
static TimerManager 
getInstance() 
 
返回TimerManager 类的单一实例。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.4.15. 时区 
com.cup.util 
Class TimeZone 
 
java.lang.Object 
     
|  
+--com.cup.util.TimeZone 
 
public class TimeZone extends java.lang.Object 
 
该类提供了一个时区和提供一种方法来计算从格林尼治时间时区的偏移量。它可以被应
中国银联 
版权所有

---
**[p333]**

332 
 
用通过使用Calendar 对象来配置它自己的时间逻辑。 
 
构造函数摘要： 
构造函数和描述 
TimeZone() 
默认构造函数。 
TimeZone(byte hours, boolean halfHourAdjust, boolean dayLightSaving) 
构造函数 - 根据给出的参数创建一个时区实例。 
 
方法摘要： 
修饰符和类型 
方法和描述 
int 
getRawOffset() 
 
返回同GMT 偏移的原始秒数来获得本地时间。 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode, toString 
 
6.2.6.5. 异常 
6.2.6.5.1. 拒绝访问异常 
com.cup.util 
Class AccessDeniedException 
 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.util.UtilException 
     
 
 
 
 
 
 
  |  
+--com.cup.util.AccessDeniedException 
中国银联 
版权所有

---
**[p334]**

333 
 
 
public class AccessDeniedException extends UtilException 
 
提供一个异常，当一个应用没有权限去执行申请的操作时抛出。比如，一个应用尝试往
没有足够存储空间的闪存上写入更多数据的时候。 
 
构造函数摘要： 
构造函数和描述 
AccessDeniedException()  
AccessDeniedException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6.5.2. 文件缺失异常 
com.cup.util 
Class FileNotFoundException 
 
java.lang.Object 
    
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.util.UtilException 
     
 
 
 
 
 
 
  |  
+--com.cup.util.IOException 
     
 
 
 
 
 
 
 
  |  
+--com.cup.util.FileNotFoundException 
中国银联 
版权所有

---
**[p335]**

334 
 
 
public class FileNotFoundException extends IOException 
 
提供一个输入输出异常，当尝试去对一个不存在的文件做文件操作的时候抛出。 
 
构建函数摘要： 
构建函数和描述 
FileNotFoundException()  
FileNotFoundException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6.5.3. 闪存损耗异常 
com.cup.util 
Class FlashWearoutException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
                              |  
+--com.cup.util.UtilException 
     
 
 
 
 
 
 
  |  
+--com.cup.util.IOException 
     
 
 
 
 
 
 
 
  |  
+--com.cup.util.FlashWearoutException 
 
中国银联 
版权所有

---
**[p336]**

335 
 
public class FlashWearoutException extends IOException 
 
提供一个输入输出异常，当闪存损耗机制阻止对闪存的写和擦除操作时抛出。 
 
构造函数摘要： 
构造函数和描述 
FlashWearoutException()  
FlashWearoutException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6.5.4. 非法参数异常 
com.cup.util 
Class IllegalParameterException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.util.UtilException 
     
 
 
 
 
 
 
  |  
+--com.cup.util.IllegalParameterException 
 
public class IllegalParameterException extends UtilException 
 
提供一个异常，当传递给方法的一个或多个输入参数是无效的时候抛出。 
中国银联 
版权所有

---
**[p337]**

336 
 
 
构造函数摘要： 
构造函数和描述 
IllegalParameterException()  
IllegalParameterException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6.5.5. 非法使用异常 
com.cup.util 
Class IllegalUseException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
    
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.util.UtilException 
     
 
 
 
 
 
 
  |  
+--com.cup.util.IllegalUseException 
 
public class IllegalUseException extends UtilException 
 
提供一个异常，当用户创建流程或若干操作是非法的时候抛出。 
 
构造函数摘要： 
构造函数和描述 
中国银联 
版权所有

---
**[p338]**

337 
 
IllegalUseException()  
IllegalUseException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6.5.6. 输入输出异常 
com.cup.util 
Class IOException 
 
java.lang.Object 
     
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
  
 
 
 
 
 
 
  |  
+--com.cup.util.UtilException 
     
 
 
 
 
 
 
  |  
+--com.cup.util.IOException 
 
直接的已知子类： 
FileNotFoundException, FlashWearoutException 
 
public class IOException extends UtilException 
 
提供一个通用的输入输出异常。 
 
构造函数摘要： 
构造函数和描述 
中国银联 
版权所有

---
**[p339]**

338 
 
IOException()  
IOException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6.5.7. 未初始化异常 
com.cup.util 
Class NotInitializedException 
 
java.lang.Object 
  
    |  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.util.UtilException 
     
 
 
 
 
 
 
  |  
+--com.cup.util.NotInitializedException 
 
public class NotInitializedException extends UtilException 
 
提供一个异常，当使用一个没有被初始化的对象的时候抛出。 
 
构造函数摘要： 
构造函数和描述 
NotInitializedException()  
NotInitializedException(java.lang.String msg)  
中国银联 
版权所有

---
**[p340]**

339 
 
 
方法描述： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6.5.8. 未支持异常 
com.cup.util 
Class NotSupportedException 
 
java.lang.Object 
    
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.util.UtilException 
     
 
 
 
 
 
 
  |  
+--com.cup.util.NotSupportedException 
 
public class NotSupportedException extends UtilException 
 
提供一个异常，当一个方法或提供的参数没有被实例支持，或者用户去尝试创建一个不
支持的格式、算法的实例的时候抛出。 
 
构造函数摘要： 
构造函数和描述 
NotSupportedException()  
NotSupportedException(java.lang.String msg)  
 
方法摘要： 
中国银联 
版权所有

---
**[p341]**

340 
 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6.5.9. util 异常 
com.cup.util 
Class UtilException 
 
java.lang.Object 
    
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
     
 
 
 
 
 
  |  
+--com.cup.util.UtilException 
 
直接的已知子类： 
AccessDeniedException, 
IllegalParameterException, 
IllegalUseException, 
IOException, 
NotInitializedException, 
NotSupportedException, 
UtilOutOfResourcesException 
 
public class UtilException extends CupRuntimeException 
 
提供一个通用的util 异常。所有在Java 包com.cup.util 中的具体的异常类都需要基
于该基类做扩展。 
 
构造函数摘要： 
构造函数和描述 
UtilException()  
UtilException(java.lang.String msg)  
 
中国银联 
版权所有

---
**[p342]**

341 
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
6.2.6.5.10. util 缺乏资源异常 
com.cup.util 
Class UtilOutOfResourcesException 
 
java.lang.Object 
    
|  
+--java.lang.Throwable 
     
 
  |  
+--java.lang.Exception 
     
 
 
 
|  
+--java.lang.RuntimeException 
     
 
 
 
 
  |  
+--com.cup.langutil.CupRuntimeException 
    
 
 
 
 
 
  |  
+--com.cup.util.UtilException 
    
 
 
 
 
 
 
  |  
+--com.cup.util.UtilOutOfResourcesException 
 
public class UtilOutOfResourcesException extends UtilException 
 
提供一个util 异常，当用户请求的动作因为缺乏系统资源无法被执行的时候抛出。 
 
构造函数摘要： 
构造函数和描述 
UtilOutOfResourcesException()  
UtilOutOfResourcesException(java.lang.String msg)  
 
方法摘要： 
由类java.lang.Throwable 继承的方法 
中国银联 
版权所有

---
**[p343]**

342 
 
fillInStackTrace, getMessage, getStackTrace, printStackTrace, printStackTrace, 
toString 
 
由类java.lang.Object 继承的方法 
equals, getClass, hashCode 
 
中国银联 
版权所有