# 中国银联可信执行环境集成（TEEI）技术规范第6部分：内置可信服务规范
> 来源: 银联规范 2015-12 存档 | 57页 | 提取: 2026-09-03


---
**[p1]**

Q/CUP 
中国银联股份有限公司企业标准 
Q/CUP 069—2015 
 
中国银联可信执行环境集成（TEEI）技术规范 
第6 部分 内置可信服务规范 
UnionPay Trusted Execution Environment Integration Technical Specifications 
Part 6：Specification on Internal Trusted Services 
 
 
 
 
2015 - 07-01 发布 
2015 - 07-01 实施
中国银联股份有限公司   发布 
中国银联 
版权所有

---
**[p2]**

Q/CUP 069—2015 
II 
中国银联股份有限公司（以下简称“中国银联”）对该规范文档保留全部知
识产权权利，包括但不限于版权、专利、商标、商业秘密等。任何人对该规范
文档的任何使用都要受限于在中国银联成员机构服务平台
（http://member.unionpay.com/）与中国银联签署的协议之规定。中国银联不对
该规范文档的错误或疏漏以及由此导致的任何损失负任何责任。中国银联针对
该规范文档放弃所有明示或暗示的保证,包括但不限于不侵犯第三方知识产权。 
未经中国银联书面同意，您不得将该规范文档用于与中国银联合作事项之
外的用途和目的。未经中国银联书面同意，不得下载、转发、公开或以其它任
何形式向第三方提供该规范文档。如果您通过非法渠道获得该规范文档，请立
即删除，并通过合法渠道向中国银联申请。 
中国银联对该规范文档或与其相关的文档是否涉及第三方的知识产权（如
加密算法可能在某些国家受专利保护）不做任何声明和担保，中国银联对于该
规范文档的使用是否侵犯第三方权利不承担任何责任，包括但不限于对该规范
文档的部分或全部使用。 
中国银联 
版权所有

---
**[p3]**

Q/CUP 069—2015 
III 
目  次 
前言 ................................................................................. VI 
引言 ................................................................................ VII 
1 范围 ................................................................................ 1 
2 规范性引用文件 ...................................................................... 1 
3 术语与定义 .......................................................................... 1 
3.1 内置可信服务 .................................................................... 1 
3.2 TEEI 应用服务器 ................................................................. 1 
3.3 可信应用 ........................................................................ 1 
3.4 多媒体执行环境 .................................................................. 1 
3.5 客户端应用 ...................................................................... 1 
3.6 TEEI 核心框架 ................................................................... 1 
4 符号和缩略语 ........................................................................ 2 
5 概述 ................................................................................ 2 
5.1 总体概况 ........................................................................ 2 
5.2 设计原则 ........................................................................ 3 
5.2.1 服务封装 .................................................................... 3 
5.2.2 服务松耦合 .................................................................. 3 
5.2.3 服务契约 .................................................................... 3 
5.2.4 服务可发现 .................................................................. 3 
6 服务模型 ............................................................................ 3 
6.1 标准服务 ........................................................................ 3 
6.1.1 标准服务 .................................................................... 3 
6.1.2 服务标识 .................................................................... 4 
6.2 访问流程 ........................................................................ 4 
6.3 访问鉴权 ........................................................................ 5 
7 共通定义 ............................................................................ 5 
7.1 原则 ............................................................................ 5 
7.2 常数 ............................................................................ 6 
7.2.1 响应状态值 .................................................................. 6 
7.3 数据类型 ........................................................................ 7 
7.3.1 ITS_Octet ................................................................... 7 
7.3.2 ITS_Integer ................................................................. 7 
7.3.3 ITS_String .................................................................. 7 
7.3.4 ITS_Buffer .................................................................. 7 
7.3.5 ITS_UUID .................................................................... 8 
7.3.6 ITS_Array ................................................................... 8 
8 可信存储服务SPI .................................................................... 8 
8.1 概述 ............................................................................ 8 
8.2 常数 ............................................................................ 9 
8.2.1 安全保护级别 ................................................................ 9 
8.2.2 起始偏移量 .................................................................. 9 
8.2.3 存储空间类型 ................................................................ 9 
8.2.4 数据访问控制标志位 .......................................................... 9 
8.2.5 用途标志位 ................................................................. 10 
8.2.6 范围限制常数 ............................................................... 10 
中国银联 
版权所有

---
**[p4]**

Q/CUP 069—2015 
IV 
8.2.7 对象类型及密钥长度 ......................................................... 11 
8.2.8 属性标识 ................................................................... 12 
8.3 数据类型 ....................................................................... 14 
8.3.1 NTS_Attribute .............................................................. 14 
8.3.2 NTS_ObjectInfo ............................................................. 15 
8.3.3 NTS_ObjectId ............................................................... 15 
8.3.4 NTS_ObjectAttributes ....................................................... 15 
8.3.5 NTS_ObjectHandle ........................................................... 15 
8.3.6 NTS_ObjectEnumerator ....................................................... 16 
8.4 操作 ........................................................................... 16 
8.4.1 操作定义 ................................................................... 16 
8.4.2 通用操作 ................................................................... 17 
8.4.3 对象访问操作 ............................................................... 17 
8.4.4 对象枚举操作 ............................................................... 23 
8.4.5 数据流访问操作 ............................................................. 25 
9 可信用户交互服务SPI ............................................................... 28 
9.1 概述 ........................................................................... 28 
9.2 数据类型 ....................................................................... 29 
9.2.1 TUI_EntryFieldMode ......................................................... 29 
9.2.2 TUI_EntryFieldType ......................................................... 29 
9.2.3 TUI_ScreenOrientation ...................................................... 30 
9.2.4 TUI_ButtonType ............................................................. 30 
9.2.5 TUI_ImageSource ............................................................ 30 
9.2.6 TUI_Image .................................................................. 30 
9.2.7 TUI_ScreenLabel ............................................................ 31 
9.2.8 TUI_Button ................................................................. 31 
9.2.9 TUI_ScreenConfiguration .................................................... 31 
9.2.10 TUI_ScreenButtonInfo ...................................................... 32 
9.2.11 TUI_ScreenInfo ............................................................ 32 
9.2.12 TUI_EntryField ............................................................ 33 
9.2.13 TUI_LabelField ............................................................ 34 
9.3 操作 ........................................................................... 34 
9.3.1 操作定义 ................................................................... 34 
9.3.2 TUI_CheckTextFormat ........................................................ 34 
9.3.3 TUI_GetScreenInfo .......................................................... 35 
9.3.4 TUI_InitSession ............................................................ 36 
9.3.5 TUI_CloseSession ........................................................... 36 
9.3.6 TUI_DisplayScreen .......................................................... 37 
9.3.7 TUI_DisplayScreenMessage ................................................... 37 
9.3.8 TUI_GetSecurityIndicatorType ............................................... 38 
9.3.9 TUI_GetLanguagesSupport .................................................... 39 
9.3.10 TUI_GetOrientationSupport ................................................. 39 
9.3.11 TUI_GetDefaultSessionTimeout .............................................. 40 
10 主机卡模拟服务 SPI ................................................................ 40 
10.1 概述 .......................................................................... 40 
10.2 数据类型 ...................................................................... 41 
10.2.1 HCE_ApduService ........................................................... 41 
10.3 操作 .......................................................................... 42 
10.3.1 操作定义 .................................................................. 42 
10.3.2 HCE_RegisterApduService ................................................... 42 
10.3.3 HCE_UnregisterApduService ................................................. 42 
中国银联 
版权所有

---
**[p5]**

Q/CUP 069—2015 
V 
10.3.4 HCE_ListApduService ....................................................... 43 
10.3.5 HCE_GetApduService ........................................................ 43 
11 生物识别服务SPI .................................................................. 44 
11.1 概述 .......................................................................... 44 
11.2 常数 .......................................................................... 44 
11.2.1 识别方式 .................................................................. 44 
11.2.2 识别状态 .................................................................. 44 
11.2.3 识别用途 .................................................................. 45 
11.3 数据类型 ...................................................................... 45 
11.3.1 BIO_ServiceInfo ........................................................... 45 
11.4 操作 .......................................................................... 45 
11.4.1 操作定义 .................................................................. 45 
11.4.2 BIO_GetServiceInfo ........................................................ 45 
11.4.3 BIO_OpenService ........................................................... 46 
11.4.4 BIO_CloseService .......................................................... 46 
11.4.5 BIO_StartIdentify ......................................................... 47 
11.4.6 BIO_CancelIdentify ........................................................ 47 
11.4.7 BIO_GetIdentifyStatus ..................................................... 48 
附 录 A （资料性附录） 支付应用时的可信用户交互 .................................... 49 
 
中国银联 
版权所有

---
**[p6]**

Q/CUP 069—2015 
VI 
前  言 
本规范阐述了TEEI内置的各种内置服务的功能说明和命令数据格式。 
本规范由中国银联股份有限公司提出。 
本部分由中国银联股份有限公司组织制定。 
本部分的主要起草单位：中国银联电子支付研究院。 
本部分的主要起草人：徐燕军、鲁志军、何朔、郭伟、周钰、陈成钱、曾望年、李定洲、严翔翔、张
志坚、王军、孟庆洋、冯希顺、张楚。 
中国银联 
版权所有

---
**[p7]**

Q/CUP 069—2015 
VII 
引  言 
本规范描述了TEEI内置可信服务规范的设计原则、服务模型，以及TEEI操作系统、TEEI应用服务器和
TEEI内置可信服务访问内置可信服务所利用的通信协议和编码格式。本规范还对可信用户交互（TUI）、
主机卡模拟（HCE）等服务的访问接口进行了定义。 
中国银联 
版权所有

---
**[p8]**

Q/CUP 069—2015 
1 
中国银联可信执行环境集成（TEEI）技术规范                  
第6 部分：内置可信服务规范 
1 范围 
TEEI内置可信服务（TEEI Internal Trusted Service，ITS）SPI规范描述的是TEEI平台上独立存在、
且仅为TEEI平台内部服务的服务组件，一个TEEI设备上可能存在一个或多个向TEEI可信应用服务器上的可
信应用提供服务的内部可信服务。本规范主要描述了TEEI的内置可信服务的概念模型、共通接口定义，以
及ITS服务的常数、数据类型和操作接口定义。 
本规范可以为以下使用者所用：TEEI平台发行者、TEEI内置可信服务软件开发商、TEEI应用服务器软
件提供商、TEEI设备提供商。 
2 规范性引用文件 
下列文件中的条款通过本标准的引用而成为本标准的条款。凡是注明日期的引用文件，其随后所有的
修改单（不包括勘误的内容）或修订版均不适用于本标准，然而，鼓励根据本标准达成协议的各方研究是
否可使用这些文件的最新版本。凡是不注明日期的引用文件，其最新版本适用于本标准。 
中国银联可信执行环境集成（TEEI）技术规范第1 部分 
《整体架构规范》 
中国银联可信执行环境集成（TEEI）技术规范第3 部分 
《可信虚拟机规范》 
中国银联可信执行环境集成（TEEI）技术规范第4 部分 
《可信网络规范》 
中国银联可信执行环境集成（TEEI）技术规范第5 部分 
《固件编程接口规范》 
中国银联可信执行环境集成（TEEI）技术规范第7 部分 
《可信虚拟机调试规范》 
中国银联可信执行环境集成（TEEI）技术规范第8 部分 
《可信虚拟机配置与维护规范》 
3 术语与定义 
3.1 内置可信服务 
部署在TEEI系统内仅供可信执行环境访问的通用服务单元。 
3.2 TEEI 应用服务器 
一种在TEEI上提供的执行机器和其上运行的一套软件服务平台，连接在TEEI虚拟网络内，通过TEEI虚
拟网络提供相应的服务。在本规范中，应用服务器是与TEE等同的概念：从功能上描述时，就是一个TEE；
从网络通信层面上描述时，就是一个应用服务器。 
3.3 可信应用 
部署在TEEI系统内对外提供服务的组件单元。 
3.4 多媒体执行环境 
提供开放编程接口的通用操作系统。 
3.5 客户端应用 
部署在多媒体执行环境端的应用。 
3.6 TEEI 核心框架 
实现TEEI规范、支持部署在TEEI平台上的各种组件运行的系统。 
中国银联 
版权所有

---
**[p9]**

Q/CUP 069—2015 
2 
4 符号和缩略语  
TEE 
Trusted Execution Environment，可信执行环境 
TEEI 
Trusted Execution Enviorment Integration 可信执行环境集成 
REE 
Rich Execution Environment，多媒体执行环境 
ITS 
Internal Trusted Service，内置可信服务 
ISV 
Independent Software Vendor，独立软件供应商 
TAS 
TEEI Application Server，TEEI 应用服务器 
TVMM 
TrustedVM Management，可信虚拟机管理 
TA 
Trusted Application，可信应用 
CA 
Client Application，REE 系统客户端应用 
SPI  
Service Programming Interface 服务编程接口 
DEK  
Data Encryption Key 数据加密密钥 
DES  
Data Encryption Standard 数据加密标准 
HEX  
Hexadecimal 十六进制 
HMAC  
Keyed-Hash Message Authentication Code 带键的消息散列鉴别码 
ISO  
International Organization for Standardization 国际标准化组织 
MAC  
Message Authentication Code 消息鉴别码 
PIN  
Personal Identification Number 个人身份识别码 
PKI  
Public Key Infrastructure 公共密钥体系 
RFU  
Reserved for Future Use 保留为将来用途 
RSA  
Rivest/Shamir/Adleman asymmetric algorithm RSA 非对称加密算法 
TUI 
Trusted User Interaction，可信用户交互 
NFC 
Near Field Communication，近场通讯 
HCE 
Host based Card Emulation，主机卡模拟 
5 概述  
5.1 总体概况 
TEEI内置可信服务（TEEI Internal Trusted Service，ITS）SPI规范描述的是TEEI平台上独立存在、
且仅为TEEI平台内部服务的组件。一个TEEI设备上可能存在一个或多个ITS。ITS的使用者是TEE或TA。 
如图 5–1所示，TEEI环境中可以部署有多个ITS和TEE。ITS为部署在TEE中的TA提供服务。TA使用虚
拟网络API访问ITS。 
中国银联 
版权所有

---
**[p10]**

Q/CUP 069—2015 
3 
 
图 5–1 整体架构 
5.2 设计原则 
TEEI ITS规范基于以下原则定义： 
5.2.1 服务封装 
服务是一系列功能相关的机能集合，例如NFC服务是访问NFC相关的命令的集合。服务封装使得系统功
能的组织和管理更加灵活和便利，并且由于对外提供统一的接口，使得TEEI系统的结构更加富有条理性。 
5.2.2 服务松耦合 
服务与其访问者之间的关系最小化，只是互相知道。服务的实现方式可以根据其实现者的喜好决定，
并且服务的访问者完全不必知晓服务是如何实现的，它只需知道如何发现服务、访问服务即可。 
5.2.3 服务契约 
服务按照服务描述文档所定义的服务契约行事。在TEEIITSSPI规范中，服务契约就是服务所支持的一
系列命令的接口描述，包括命令请求的消息体、返回的响应及状态信息的格式描述。 
5.2.4 服务可发现 
服务需要对外部提供描述信息，这样可以通过TEEI系统提供的发现机制发现并访问这些服务。具体实
现请参见虚拟网络规范中相关内容。 
6 服务模型  
6.1 标准服务 
6.1.1 标准服务 
TEEI规范定义了以下几个标准内置可信服务，这些内置可信服务是每个TEEI平台实现必须提供的服
务。依据具体平台的不同，同一个内置可信服务可能同时有多个不同的实现，例如：某个平台可能同时存
在指纹和面部两个生物识别服务，这是可能的。 
中国银联 
版权所有

---
**[p11]**

Q/CUP 069—2015 
4 
表 6-1 标准服务 
服务名称 
描述 
缩写 
可信存储服务 
提供网络环境的数据和密钥的可信存储服务 
NTS 
可信用户交互 
提供图形化用户界面的布局管理和显示服务 
TUI 
主机卡模拟 
提供近场通讯的主机卡模拟的管理和访问服务 
HCE 
生物识别 
提供指纹、声纹等统一的生物识别访问服务 
BIO 
6.1.2 服务标识 
内置可信服务使用主机名、内置可信服务UUID来进行唯一标识，客户端在访问内置服务时需以这些标
识为参数经由虚拟网络进行，关于主机名、内置可信服务UUID的概念请参考《中国银联可信执行环境集成
（TEEI）技术规范第4部分：可信网络规范》。 
表 6-2 服务标识示例 
服务名称 
主机名 
ITS UUID 
可信存储服务 
org.teei.its.NTS 
8f870e7d-4cf3-49f3-8190-4b2e1de82dd4 
可信用户交互 
org.teei.its.TUI 
23ef19b5-84ad-4433-92fa-820291951e7f 
主机卡模拟 
org.teei.its.HCE 
38968dc0-0eef-4b7b-8660-ba3e3bafdf4d 
主机卡模拟 
org.teei.its.BIO 
5e28f97d-3d54-4f5a-a77c-0647f75d4830 
6.2 访问流程 
对TA来说，ITS相当于TEEI虚拟网络中的一台机器，因此TA对ITS的访问需要经由TEEI虚拟网络API进
行，详细的API定义请参考《中国银联可信执行环境集成（TEEI）技术规范第4部分：可信网络规范》。 
中国银联 
版权所有

---
**[p12]**

Q/CUP 069—2015 
5 
 
图 6–1 访问流程 
访问流程的详细描述如下： 
1) 调用TEEI 虚拟网络API 函数TEEI_Connect_TA 连接ITS，虚拟网络创建发起请求的TA 和目标ITS
的HHCP 连接，并将标识连接的pipe ID 返回给调用方TA； 
2) TA 利用前一次调用返回的pipe ID 作为参数调用虚拟网络API 函数TEEI_Send_Data 向ITS 发送
命令传递参数，ITS 将会解码编译在HHCP 消息中的ITS 调用参数，然后调用对应的ITS 命令； 
3) 根据实际需要继续可以多次调用TEEI_Send_Data 方法，只要传递正确的pipe ID 即可； 
4) 调用TEEI 虚拟网络API 的TEEI_DisConnect_TA 方法关闭Pipe 连接，释放当前ITS 实例供其他
TA 调用。 
6.3 访问鉴权 
TEEI ITS仅供TEEI平台内部访问，可信应用对ITS的访问可以不需要鉴权。可信执行环境以外的实体，
例如多媒体执行环境内的客户端应用如果需要访问ITS提供的服务，则必须经过可信应用代理。ITS之间也
可以互相访问，其访问方式同可信应用访问ITS的访问方式。 
7 共通定义  
共通定义部分的内容描述所有ITS共享的信息，包括：基本概念、常数、数据类型和操作。 
7.1 原则 
本规范中提到的所有的字符串均需使用ISO/IEC 10646/Unicode编码。 
本规范中提到的所有长度信息均指字节长度。 
中国银联 
版权所有

---
**[p13]**

Q/CUP 069—2015 
6 
7.2 常数 
7.2.1 响应状态值 
表 7-1 响应状态值 
常量名和别名 
值 
描述 
ITS_SUCCESS  
0x0000 
操作成功 
ITS_ERROR_GENERIC 
0x0000 
通用错误 
ITS_ERROR_ACCESS_DENIED  
0x0001 
访问错误 
ITS_ERROR_CANCEL 
0x0002 
取消 
ITS_ERROR_ACCESS_CONFLICT  
0x0003 
访问冲突 
ITS_ERROR_EXCESS_DATA  
0x0004 
冗余数据 
ITS_ERROR_BAD_FORMAT  
0x0005 
格式错误 
ITS_ERROR_BAD_PARAMETERS 
0x0006 
参数错误 
ITS_ERROR_BAD_STATE 
0x0007 
状态错误 
ITS_ERROR_ITEM_NOT_FOUND 
0x0008 
项目未找到 
ITS_ERROR_NOT_IMPLEMENTED 
0x0009 
无法执行 
ITS_ERROR_NOT_SUPPORTED  
0x000A 
不支持 
ITS_ERROR_NO_DATA 
0x000B 
无数据 
ITS_ERROR_OUT_OF_MEMORY  
0x000C 
内存溢出 
ITS_ERROR_BUSY 
0x000D 
系统繁忙 
ITS_ERROR_COMMUNICATION 
0x000E 
连接错误 
ITS_ERROR_SECURITY  
0x000F 
安全错误 
ITS_ERROR_SHORT_BUFFER  
0x0010 
缓冲区空间不足 
ITS_PENDING  
0x2000 
待处理项目 
ITS_ERROR_TIMEOUT  
0x3001 
超时 
ITS_ERROR_OVERFLOW  
0x300F 
溢出 
ITS_ERROR_TARGET_DEAD  
0x3024 
对象不存在 
ITS_ERROR_STORAGE_NO_SPACE  
0x3041 
存储空间不足 
ITS_ERROR_MAC_INVALID  
0x3071 
消息认证码失效 
ITS_ERROR_SIGNATURE_INVALID  
0x3072 
签名无效 
ITS_ERROR_TIME_NOT_SET  
0x5000 
时间未设定 
ITS_ERROR_TIME_NEEDS_RESET  
0x5001 
时间需要重置 
ITS_ERROR_SERVICE_NOT_AVAIABLE 
0x5002 
服务不存在 
ITS_ERROR_COMMAND_NOT_SUPPORT 
0x5003 
不支持的命令 
ITS_ERROR_PARAMETER_INVALID 
0x5004 
参数不合法 
中国银联 
版权所有

---
**[p14]**

Q/CUP 069—2015 
7 
常量名和别名 
值 
描述 
ITS_ERROR_STATE_INVALID 
0x5005 
ITS 服务状态不合法 
ITS_ERROR_CURRUPT_OBJECT 
0x5006 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
0x5007 
如果存储对象无法访问 
ITS_ERROR_RESOURCE_LIMIT 
0x5008 
资源限制 
7.3 数据类型 
TEEI ITS共同使用的数据类型，特定于具体ITS实现的数据类型在每个ITS规范内部定义，此处的数据
类型是所有ITS共用的。各个ITS应该尽可能的复用共通的数据类型。 
7.3.1 ITS_Octet 
代表8位位组，也就是1个字节的数据，例如：0x00、0xFF。 
表 7-2 ITS_Octet 数据类型 
长度 
字段/描述 
必须 
1 
1 个字节数据。 
是 
 
7.3.2 ITS_Integer 
代表数值类型数据。 
表 7-3 ITS_Integer 数据类型 
长度 
字段/描述 
必须 
4 
数据值。 
是 
7.3.3 ITS_String 
代表字符串数据类型。TEEI ITS SPI规范中的字符串数据类型是Unicode编码，详细格式请参考Unicode
相关规范。 
表 7-4 ITS_String 数据类型 
长度 
字段/描述 
必须 
2 
字节数：字符串的字节长度 
是 
可变 
字符：字符串字符code 信息，编码格式遵守Unicode 规范 
是 
7.3.4 ITS_Buffer 
代表一个通用类型的缓冲区。 
表 7-5 ITS_Buffer 数据类型 
长度 
字段/描述 
必须 
4 
数据结构的字节长度 
是 
可变 
缓冲区的内容，不包括长度部分 
是 
中国银联 
版权所有

---
**[p15]**

Q/CUP 069—2015 
8 
7.3.5 ITS_UUID 
代表UUID数据，例如TA的UUID。 
表 7-6 ITS_UUID 数据类型 
长度 
类型 
字段/描述 
必须 
4 
ITS_Octet[4] timeLow，详细描述参考RFC 4122 标准。 
是 
2 
ITS_Octet[2] timeMid，详细描述参考RFC 4122 标准。 
是 
2 
ITS_Octet[2] timeHiAndVersion，详细描述参考RFC 4122 标准。 
是 
1 
ITS_Octet 
clockSeqAndNode[0]，详细描述参考RFC 4122 标准。 
是 
1 
ITS_Octet 
clockSeqAndNode[1]，详细描述参考RFC 4122 标准。 
是 
1 
ITS_Octet 
clockSeqAndNode[2]，详细描述参考RFC 4122 标准。 
是 
1 
ITS_Octet 
clockSeqAndNode[3]，详细描述参考RFC 4122 标准。 
是 
1 
ITS_Octet 
clockSeqAndNode[4]，详细描述参考RFC 4122 标准。 
是 
1 
ITS_Octet 
clockSeqAndNode[5]，详细描述参考RFC 4122 标准。 
是 
1 
ITS_Octet 
clockSeqAndNode[6]，详细描述参考RFC 4122 标准。 
是 
1 
ITS_Octet 
clockSeqAndNode[7]，详细描述参考RFC 4122 标准。 
是 
7.3.6 ITS_Array 
代表某种类型数据结构的数组。例如：ITS_Array(ITS_String)，代表ITS_String类型的数组）。 
表 7-7 ITS_Array 数据类型 
长度 
类型 
字段/描述 
必须 
4 
ITS_Integer 数组元素数量，如果数量为0，那么该数据结构不包括
元素集合部分。 
是 
可变 
元素列表 
数组元素集合，根据元素数量和类型的不同而不同。 
否 
8 可信存储服务SPI 
8.1 概述 
TEEI的可信存储服务包括TEE的私有存储空间及网络存储空间。TEEI中部署的每个TEE都有独立的私有
存储空间。同时，为了扩展TEE的存储资源以及共享需要，TEEI还为TEE提供了网络存储空间，即为可信存
储服务SPI提供的存储空间。——可信存储服务SPI提供的存储空间可以为TEE独有，也可以为多个TEE共享。
本节介绍了网络可信存储服务SPI的功能和设计概要。 
可信存储空间包括多个对象，每个对象由一个对象标识符来标识，该标识符是一个从0到64字节大小
的可变长度的二进制缓冲区。对象标识符可以包括任何类型，包括非打印字符对应的字节。对象可以是一
个加密密钥对象、一个密钥对对象、或是一个数据对象；每个对象都有一个类型，可精确地定义该对象的
内容。例如，对象类型可以是AES密钥、RSA密钥对、数据对象等；对象可以有一个相关联的数据流。数据
对象仅有一个数据流。各加密对象（即密钥或密钥对）有一个数据流、对象属性和元数据。 
中国银联 
版权所有

---
**[p16]**

Q/CUP 069—2015 
9 
8.2 常数 
8.2.1 安全保护级别 
可信存储服务必须对对象提供对回滚攻击提供最低级别的保护，实际数据存储区域REE系统是否可以
访问都是可以接受的。本规范定义了以下两个级别的保护级别。 
表 8-1 回滚攻击安全保护级别 
名称 
值 
描述 
NTS_ROLLBACK_REE 
0x0064 防回滚攻击机制由REE 实现 
NTS_ROLLBACK_ITS 
0x03e8 防回滚攻击机制由ITS 控制的硬件机制实现 
8.2.2 起始偏移量 
在对象相关联的数据流中，移动数据位置时可能存在的起始偏移量。 
表 8-2 偏移量 
名称 
值 
描述 
NTS_DATA_SEEK_SET 
0x0000 设置为起始位置+偏移量 
NTS_DATA_SEEK_CUR 
0x0001 设置为当前位置+偏移量 
NTS_DATA_SEEK_END 
0x0002 设置为最终位置+偏移量 
8.2.3 存储空间类型 
数据对象所存储的空间类型。 
表 8-3 对象存储 
名称 
值 
描述 
保留区域 
0x00000000 
 
NTS_STORAGE_PRIVATE 
0x00000001 
TEE 独有的存储区域 
RFU 区域 
0x00000002-0x7FFFFFFF  
NTS_STORAGE_PUBLIC 
0x80000000 
TEE 之间共享的存储区域 
实现定义的区域 
0x80000001-0xFFFFFFFF  
8.2.4 数据访问控制标志位 
数据访问控制标志。 
表 8-4 数据访问控制标志 
名称 
值 
描述 
NTS_DATA_FLAG_ACCESS_READ  
0x00000001 
读权限 
NTS_DATA_FLAG_ACCESS_WRITE  
0x00000002 
写权限 
NTS_DATA_FLAG_ACCESS_WRITE_META  
0x00000004 
写元数据权限 
NTS_DATA_FLAG_SHARE_READ  
0x00000010 
共享读权限 
中国银联 
版权所有

---
**[p17]**

Q/CUP 069—2015 
10 
NTS_DATA_FLAG_SHARE_WRITE  
0x00000020 
共享写权限 
NTS_DATA_FLAG_CREATE  
0x00000200 
创建对象权限 
NTS_DATA_FLAG_OVERWRITE 
0x00000400 
覆盖写权限 
执行NTS_OpenObject 或者NTS_CreateObject操作时，可以同时打开多个指向同一个对象的操作句柄，
打开操作成功与否依赖于指定的访问控制条件，以下是该规则描述。 
表 8-5 共享访问规则 
首次开启/ 
创建标志的值 
再次开启/ 
创建标志的值 
再次开启/结果 
注释 
读权限 
读权限 
访问冲突 
只有首次调用时能成功。 
读|共享读权限 
读权限 
访问冲突 
只有首次调用时能成功。 
读|共享读权限 
读+共享读权限 
访问成功 
调用成功。 
读权限 
写权限 
访问冲突 
只有首次调用时能成功。 
读|共享读|写权限 
写|共享读|共享写权限 
访问成功 
调用成功。 
读|共享读|写|共享写权
限 
元数据写权限 
访问冲突 
只有首次调用时能成功。 
共享读权限 
写|共享写权限 
访问冲突 
调用失败。 
0 
读+共享读权限 
访问冲突 
调用失败。 
8.2.5 用途标志位 
密钥对象用途标志。 
表 8-6 用途标志 
名称 
值 
描述 
NTS_USAGE_EXTRACTABLE  
0x00000001 
获取数据 
NTS_USAGE_ENCRYPT   
0x00000002 
加密 
NTS_USAGE_DECRYPT   
0x00000004 
解密 
NTS_USAGE_MAC   
0x00000008 
消息认证码 
NTS_USAGE_SIGN   
0x00000010 
签名 
NTS_USAGE_VERIFY   
0x00000020 
验证签名 
NTS_USAGE_DERIVE  
0x00000040 
派生密钥 
8.2.6 范围限制常数 
其他常数。 
表 8-7 其它常数 
名称 
值 
描述 
NTS_DATA_MAX_POSITION 0xFFFFFFFF 数据对象的最大长度 
中国银联 
版权所有

---
**[p18]**

Q/CUP 069—2015 
11 
NTS_OBJECT_ID_MAX_LEN 64 
对象ID 的最大长度 
8.2.7 对象类型及密钥长度 
可信存储服务支持的对象类型，以及密钥类型的对象的允许长度范围。 
表 8-8 对象类型及密钥长度 
名称 
标识符 
可能的大小 
NTS_TYPE_AES  
0xA0000010 
128 位, 192 位, 或 256 位。 
NTS_TYPE_DES  
0xA0000011 
始终是56 位。 
NTS_TYPE_DES3  
0xA0000013 
112 位或168 位。 
NTS_TYPE_HMAC_MD5  
0xA0000001 
在64 位和512 位之间，且是8 位的整数倍。 
NTS_TYPE_HMAC_SHA1  
0xA0000002 
在80 位和512 位之间，且是8 位的整数倍。 
NTS_TYPE_HMAC_SHA224  
0xA0000003 
在112 位和512 位之间，且是8 位的整数倍。 
NTS_TYPE_HMAC_SHA256  
0xA0000004 
在192 位和1024 位之间，且是8 位的整数倍。 
NTS_TYPE_HMAC_SHA384  
0xA0000005 
在256 位和1024 位之间，且是8 位的整数倍。 
NTS_TYPE_HMAC_SHA512  
0xA0000006 
在256 位和1024 位之间，且是8 位的整数倍。 
NTS_TYPE_RSA_PUBLIC_KEY  
0xA0000030 
对象的大小是以模数内的位数为单位的。 
所有密钥大小必须支持最多2048 位。要支持更大的密
钥大小，这取决于实现。密钥大小最小值为256 位。 
NTS_TYPE_RSA_KEYPAIR  
0xA1000030 
与RSA 公开密钥大小相同。 
NTS_TYPE_DSA_PUBLIC_KEY  
0xA0000031 
在512 位和1024 位之间，且是64 位的整数倍。 
NTS_TYPE_DSA_KEYPAIR  
0xA1000031 
同DSA 公钥长度相同  
NTS_TYPE_DH_KEYPAIR  
0xA1000032 
在256 位到2048 位范围内。 
NTS_TYPE_ECDSA_PUBLIC_KEY  0xA0000041 
如果支持ECC，那么定义在椭圆曲线类中的的密钥长度
必须支持。 
NTS_TYPE_ECDSA_KEYPAIR  
0xA1000041 
如果支持ECC，那么必须同ECDSA 公钥长度相同。 
NTS_TYPE_ECDH_PUBLIC_KEY  
0xA0000042 
如果支持ECC，那么定义在椭圆曲线类中的的密钥长度
必须支持。 
NTS_TYPE_ECDH_KEYPAIR  
0xA1000042 
如果支持ECC，那么必须同ECDH 公钥长度相同。 
NTS_TYPE_GENERIC_SECRET  
0xA0000000 
8 位的整数倍，最高4096 位。通常不直接用于密码学
操作，而是用来进行密钥派生。 
NTS_TYPE_CORRUPTED_OBJECT  0xA00000BE 
损坏的对象 
NTS_TYPE_DATA  
0xA00000BF 
0 – 所有的数据都存在于关联的数据流对象中 
中国银联 
版权所有

---
**[p19]**

Q/CUP 069—2015 
12 
8.2.8 属性标识 
表 8-9 对象属性标识列表 
ID 
值 
保护 
类型 
格式 
描述 
NTS_ATTR_SECRET_VALUE 
0xC0000000 
Protected 
Ref 
binary 
对称加密、
MACs 和
HMACs 算法
用密钥 
 
NTS_ATTR_RSA_MODULUS 
0xD0000130 
Public 
Ref 
bignum 
 
NTS_ATTR_RSA_PUBLIC_EXPONENT 
0xD0000230 
Public 
Ref 
bignum 
 
NTS_ATTR_RSA_PRIVATE_EXPONENT 
0xC0000330 
Protected 
Ref 
bignum 
 
NTS_ATTR_RSA_PRIME1 
0xC0000430 
Protected 
Ref 
bignum 
通常指p 
NTS_ATTR_RSA_PRIME2 
0xC0000530 
Protected 
Ref 
bignum 
q 
NTS_ATTR_RSA_EXPONENT1 
0xC0000630 
Protected 
Ref 
bignum 
dp 
NTS_ATTR_RSA_EXPONENT2 
0xC0000730 
Protected 
Ref 
bignum 
dq 
NTS_ATTR_RSA_COEFFICIENT 
0xC0000830 
Protected 
Ref 
bignum 
iq 
NTS_ATTR_DSA_PRIME 
0xD0001031 
Public 
Ref 
bignum 
p 
NTS_ATTR_DSA_SUBPRIME 
0xD0001131 
Public 
Ref 
bignum 
q 
NTS_ATTR_DSA_BASE 
0xD0001231 
Public 
Ref 
bignum 
g 
NTS_ATTR_DSA_PUBLIC_VALUE 
0xD0000131 
Public 
Ref 
bignum 
y 
NTS_ATTR_DSA_PRIVATE_VALUE 
0xC0000231 
Protected 
Ref 
bignum 
x 
NTS_ATTR_DH_PRIME 
0xD0001032 
Public 
Ref 
bignum 
p 
NTS_ATTR_DH_SUBPRIME 
0xD0001132 
Public 
Ref 
bignum 
q 
NTS_ATTR_DH_BASE 
0xD0001232 
Public 
Ref 
bignum 
g 
NTS_ATTR_DH_X_BITS 
0xF0001332 
Public 
Value 
int 
l 
NTS_ATTR_DH_PUBLIC_VALUE 
0xD0000132 
Public 
Ref 
bignum 
y 
NTS_ATTR_DH_PRIVATE_VALUE 
0xC0000232 
Protected 
Ref 
bignum 
x 
NTS_ATTR_RSA_OAEP_LABEL 
0xD0000930 
Public 
Ref 
binary 
 
NTS_ATTR_RSA_PSS_SALT_LENGTH 
0xF0000A30 
Public 
Value 
int 
 
NTS_ATTR_ECC_PUBLIC_VALUE_X 
0xD0000141 
Public 
Ref 
bignum 
 
NTS_ATTR_ECC_PUBLIC_VALUE_Y 
0xD0000241 
Public 
Ref 
bignum 
 
NTS_ATTR_ECC_PRIVATE_VALUE 
0xC0000341 
Protected 
Ref 
bignum 
d 
NTS_ATTR_ECC_CURVE 
0xF0000441 
Public 
Value 
int 
椭圆曲线类
型 
属性类型描述： 
——binary，无符号的字节数组； 
中国银联 
版权所有

---
**[p20]**

Q/CUP 069—2015 
13 
——bignum，无符号的大端序格式大数，起始部分为0x00 是运行的； 
——int，代表单一整数属性值； 
——描述列中的p,q,dp,dq,iq,g,y,x,l,d 均为密码学算法中的变量； 
属性ID格式： 
——[29]位：定义属性是数值类型还是缓冲区类型 
 
0: 缓冲区类型属性 
 
1: 数值类型属性 
——[28]位：定义属性是被保护还是公开的 
 
0: 被保护的属性 
 
1: 公开属性 
不同的对象类型包含的属性是不同的，以下是对象类型所对应的属性列表。 
表 8-10 对象类型与属性对应 
对象类型 
对应的属性 
NTS_TYPE_AES  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_DES  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_DES3  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_HMAC_MD5  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_HMAC_SHA1  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_HMAC_SHA224  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_HMAC_SHA256  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_HMAC_SHA384  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_HMAC_SHA512  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_RSA_PUBLIC_KEY  
NTS_ATTR_RSA_MODULUS 
NTS_ATTR_RSA_PUBLIC_EXPONENT 
NTS_TYPE_RSA_KEYPAIR  
NTS_ATTR_RSA_MODULUS 
NTS_ATTR_RSA_PUBLIC_EXPONENT 
NTS_ATTR_RSA_PRIVATE_EXPONENT 
NTS_ATTR_RSA_PRIME1 
NTS_ATTR_RSA_PRIME2 
NTS_ATTR_RSA_EXPONENT1 
NTS_ATTR_RSA_EXPONENT2 
NTS_ATTR_RSA_COEFFICIENT 
NTS_TYPE_DSA_PUBLIC_KEY  
NTS_ATTR_DSA_PRIME 
NTS_ATTR_DSA_SUBPRIME 
NTS_ATTR_DSA_BASE 
NTS_ATTR_DSA_PUBLIC_VALUE 
中国银联 
版权所有

---
**[p21]**

Q/CUP 069—2015 
14 
对象类型 
对应的属性 
NTS_TYPE_DSA_KEYPAIR  
NTS_ATTR_DSA_PRIME 
NTS_ATTR_DSA_SUBPRIME 
NTS_ATTR_DSA_BASE 
NTS_ATTR_DSA_PUBLIC_VALUE 
NTS_ATTR_DSA_PRIVATE_VALUE 
NTS_TYPE_DH_KEYPAIR  
NTS_ATTR_DH_PRIME 
NTS_ATTR_DH_BASE 
NTS_ATTR_DH_SUBPRIME 
NTS_ATTR_DH_X_BITS 
NTS_ATTR_DH_PUBLIC_VALUE 
NTS_ATTR_DH_PRIVATE_VALUE 
NTS_ATTR_DH_X_BITS 
NTS_TYPE_ECDSA_PUBLIC_KEY  
NTS_ATTR_ECC_CURVE 
NTS_ATTR_ECC_PUBLIC_VALUE_X 
NTS_ATTR_ECC_PUBLIC_VALUE_Y 
NTS_TYPE_ECDSA_KEYPAIR  
NTS_ATTR_ECC_CURVE 
NTS_ATTR_ECC_PUBLIC_VALUE_X 
NTS_ATTR_ECC_PUBLIC_VALUE_Y 
NTS_ATTR_ECC_PRIVATE_VALUE 
NTS_TYPE_ECDH_PUBLIC_KEY  
NTS_ATTR_ECC_CURVE 
NTS_ATTR_ECC_PUBLIC_VALUE_X 
NTS_ATTR_ECC_PUBLIC_VALUE_Y 
NTS_TYPE_ECDH_KEYPAIR  
NTS_ATTR_ECC_CURVE 
NTS_ATTR_ECC_PUBLIC_VALUE_X 
NTS_ATTR_ECC_PUBLIC_VALUE_Y 
NTS_ATTR_ECC_PRIVATE_VALUE 
NTS_TYPE_GENERIC_SECRET  
NTS_ATTR_SECRET_VALUE 
NTS_TYPE_CORRUPTED_OBJECT  
 
NTS_TYPE_DATA  
 
 
8.3 数据类型 
8.3.1 NTS_Attribute 
对象属性信息。可能是缓冲区类型的对象，也可能是值类型对象。 
中国银联 
版权所有

---
**[p22]**

Q/CUP 069—2015 
15 
表 8-11 NTS_Attribute 数据类型 
长度 
字段/描述 
必须 
4 
属性类型标识。0：缓冲区属性；1：值属性。 
是 
4 
属性标识，参考“属性标识”。 
是 
可变 
该区域是一个ITS_Buffer 类型的对象。 
二者选其一 
该区域是固定为两个ITS_Integer 数值。 
8.3.2 NTS_ObjectInfo 
表 8-12 NTS_ObjectInfo 数据类型 
长度 
字段/描述 
必须 
4 
对象类型，参考NTS_TYPE_XXX 名称的常量定义。 
是 
4 
密钥长度，以比特为单位。普通数据对象该项设为0。 
是 
4 
描述对象用途的位向量，参考NTS_USAGE_XXX 名称的常量定义。 
是 
4 
对象的关联数据对象的大小。 
是 
4 
对象的关联数据对象的位置偏移量。 
是 
4 
对象的数据访问控制标志位，参考NTS_DATA_FLAG_XXX 名称的常量定义。 
是 
8.3.3 NTS_ObjectId 
对象唯一标识。 
表 8-13 NTS_ObjectId 数据类型 
长度 
类型 
字段/描述 
必须 
4 
ITS_Integer 
对象ID 长度，不能超过NTS_OBJECT_ID_MAX_LEN。 
是 
可变 
Unicode 
对象ID 字符：字符串字符code 信息，编码格式遵守
Unicode 规范。 
是 
8.3.4 NTS_ObjectAttributes 
对象属性信息的集合。 
表 8-14 NTS_ObjectAttributes 数据类型 
长度 
类型 
字段/描述 
必须 
可变 
ITS_Array(NTS_Attribute) 
NTS_Attribute 类型的对象属性数组。 
是 
可变 
NTS_ObjectId 
对象标识。 
否 
8.3.5 NTS_ObjectHandle 
对象操作句柄。 
中国银联 
版权所有

---
**[p23]**

Q/CUP 069—2015 
16 
表 8-15 NTS_ObjectHandle 数据类型 
长度 
类型 
字段/描述 
必须 
4 
ITS_Integer 
对象操作句柄标识。 
是 
4 
ITS_Integer 
存储空间类型。 
是 
4 
ITS_Integer 
对象的访问控制标志位。 
是 
可变 
NTS_ObjectId 被操作的对象ID。 
是 
8.3.6 NTS_ObjectEnumerator 
对象枚举器。 
表 8-16 NTS_ObjectEnumerator 数据类型 
长度 
类型 
字段/描述 
必须 
4 
ITS_Integer 
对象枚举器ID。 
是 
8.4 操作 
8.4.1 操作定义 
表 8-17 操作定义 
操作 
版本 
指令码 
操作ID 值 
NTS_GetProtectionLevel 
0x0001 
0x0001 
0x00010001 
NTS_OpenObject 
0x0001 
0x0002 
0x00010002 
NTS_CreateObject 
0x0001 
0x0003 
0x00010003 
NTS_GetObjectInfo 
0x0001 
0x0004 
0x00010004 
NTS_RestrictObjectUsage 
0x0001 
0x0005 
0x00010005 
NTS_GetObjectBufferAttribute 
0x0001 
0x0006 
0x00010006 
NTS_GetObjectValueAttribute 
0x0001 
0x0007 
0x00010007 
NTS_CloseObject 
0x0001 
0x0008 
0x00010008 
NTS_CloseAndDeleteObject 
0x0001 
0x0009 
0x00010009 
NTS_RenameObject 
0x0001 
0x000a 
0x0001000a 
NTS_AllocateObjectEnumerator 
0x0001 
0x000b 
0x0001000b 
NTS_FreeObjectEnumerator 
0x0001 
0x000c 
0x0001000c 
NTS_ResetObjectEnumerator 
0x0001 
0x000d 
0x0001000d 
NTS_StartObjectEnumerator 
0x0001 
0x000e 
0x0001000e 
NTS_GetNextObject 
0x0001 
0x000f 
0x0001000f 
NTS_ReadObjectData 
0x0001 
0x0010 
0x00010010 
NTS_WriteObjectData 
0x0001 
0x0011 
0x00010011 
NTS_TruncateObjectData 
0x0001 
0x0012 
0x00010012 
中国银联 
版权所有

---
**[p24]**

Q/CUP 069—2015 
17 
NTS_SeekObjectData 
0x0001 
0x0013 
0x00010013 
8.4.2 通用操作 
NTS_GetProtectionLevel 
获取可信存储服务SPI的防止回滚攻击的安全保护级别。 
——请求消息体： 
无。 
——响应消息体： 
表 8-18 NTS_GetProtectionLevel 响应消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
安全保护级别，参考对应的常数描述。 
是 
——响应状态值： 
表 8-19 NTS_GetProtectionLevel 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
8.4.3 对象访问操作 
8.4.3.1 NTS_OpenObject 
打开一个可信存储对象，返回一个对象操作句柄，并且能够用该句柄访问对象的属性和数据流。可以
同时打开指向同一个对象的多个操作句柄，但必须在访问控制限制运行的条件下。 
——请求消息体： 
表 8-20 NTS_OpenObject 请求消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
存储空间类型，参考对应的常数定义。 
是 
可变 
NTS_ObjectId 
对象唯一标识。注意，该参数内容不能够驻留于共享内存。 是 
4 
ITS_Integer 
对象访问控制标志。 
是 
——响应消息体： 
表 8-21 NTS_OpenObject 响应消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
中国银联 
版权所有

---
**[p25]**

Q/CUP 069—2015 
18 
——响应状态值： 
表 8-22 NTS_OpenObject 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_ITEM_NOT_FOUND 
未找到该对象 
ITS_ERROR_ACCESS_CONFLICT 
访问权限冲突 
ITS_ERROR_OUT_OF_MEMORY 
内存溢出 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.3.2 NTS_CreateObject 
创建一个附带初始化属性和初始化数据流内容的对象，并且可以有选择性的返回一个指向已创建对象
索引。 
——请求消息体： 
表 8-23 NTS_CreateObject 请求消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
存储空间类型，参考对应的常数定义。 
是 
可变 
NTS_ObjectId 
对象唯一标识。注意，该参数内容不能够驻留于共享内存。 是 
4 
ITS_Integer 
对象访问控制标志。 
是 
可变 
NTS_ObjectAttributes 对象属性集合。 
是 
可变 
ITS_Buffer 
数据对象内容。 
否 
——响应消息体： 
表 8-24 NTS_CreateObject 响应消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
——响应状态值： 
表 8-25 NTS_CreateObject 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_ITEM_NOT_FOUND 
未找到指定的存储空间 
中国银联 
版权所有

---
**[p26]**

Q/CUP 069—2015 
19 
ITS_ERROR_ACCESS_CONFLICT 
访问权限冲突 
ITS_ERROR_OUT_OF_MEMORY 
内存溢出 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.3.3 NTS_GetObjectInfo 
获取对象特征信息。 
——请求消息体： 
表 8-26 NTS_GetObjectInfo 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
——响应消息体： 
表 8-27 NTS_GetObjectInfo 响应消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectInfo 
对象特征信息。 
是 
——响应状态值： 
表 8-28 NTS_GetObjectInfo 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
ITS_ERROR_STORAGE_NO_SPACE 
没有足够存储空间 
8.4.3.4 NTS_RestrictObjectUsage 
限制对象使用标识。 
——请求消息体： 
表 8-29 NTS_RestrictObjectUsage 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
4 
ITS_Integer 
对象访问控制标志。 
是 
——响应消息体： 
无。 
中国银联 
版权所有

---
**[p27]**

Q/CUP 069—2015 
20 
——响应状态值： 
表 8-30 NTS_RestrictObjectUsage 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.3.5 NTS_GetObjectBufferAttribute 
从对象中提取一个缓冲区属性。 
——请求消息体： 
表 8-31 NTS_GetObjectBufferAttribute 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
4 
缓冲区类型的属性标识，参考“属性标识”。 
属性标识符。 
是 
——响应消息体： 
表 8-32 NTS_GetObjectBufferAttribute 响应消息体 
长度 
类型 
描述 
必须 
可变 
NTS_Attribute 
属性内容。 
是 
——响应状态值： 
表 8-33 NTS_GetObjectBufferAttribute 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_ITEM_NOT_FOUND 
未找到该属性 
ITS_ERROR_SHORT_BUFFER 
缓冲区太小 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.3.6 NTS_GetObjectValueAttribute 
从对象中提取一个值属性。 
中国银联 
版权所有

---
**[p28]**

Q/CUP 069—2015 
21 
——请求消息体： 
表 8-34 NTS_GetObjectValueAttribute 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
4 
值类型的属性标识，参考“属性标识”。 
属性标识符。 
是 
——响应消息体： 
表 8-35 NTS_GetObjectValueAttribute 响应消息体 
长度 
类型 
描述 
必须 
可变 
NTS_Attribute 
属性内容。 
是 
——响应状态值： 
表 8-36 NTS_GetObjectValueAttribute 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_ITEM_NOT_FOUND 
未找到该属性 
ITS_ERROR_ACCESS_DENIED 
容器不可提取 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.3.7 NTS_CloseObject 
关闭已开启的对象。 
——请求消息体： 
表 8-37 NTS_CloseObject 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
——响应消息体： 
无。 
中国银联 
版权所有

---
**[p29]**

Q/CUP 069—2015 
22 
——响应状态值： 
表 8-38 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
8.4.3.8 NTS_CloseAndDeleteObject 
关闭和删除对象。对象索引必须使用NTS_DATA_FLAG_ACCESS_WRITE_META访问权限开启，这意味着访
问对象是排他的。 
——请求消息体： 
表 8-39 NTS_CloseAndDeleteObject 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
——响应消息体： 
无。 
——响应状态值： 
表 8-40 NTS_CloseAndDeleteObject 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.3.9 NTS_RenameObject 
改变对象的标识符。对象索引必须由NTS_DATA_FLAG_ACCESS_WRITE_META访问权限开启，这意味着访
问对象是排他的。 
——请求消息体： 
表 8-41 NTS_RenameObject 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 对象操作句柄。 
是 
可变 
NTS_ObjectId 
对象唯一标识。注意，该参数内容不能够驻留于共享内存。 
是 
——响应消息体： 
无。 
中国银联 
版权所有

---
**[p30]**

Q/CUP 069—2015 
23 
——响应状态值： 
表 8-42 NTS_RenameObject 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_ACCESS_CONFLICT 
访问权限冲突 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.4 对象枚举操作 
8.4.4.1 NTS_AllocateObjectEnumerator 
分配对象枚举器。 
——请求消息体： 
无。 
——响应消息体： 
表 8-43 NTS_AllocateObjectEnumerator 响应消息体 
长度 
类型 
描述 
必须 
4 
ObjectEnumerator 分配完成的对象枚举器。 
是 
——响应状态值： 
表 8-44 NTS_AllocateObjectEnumerator 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_OUT_OF_MEMORY 
内存溢出 
8.4.4.2 NTS_FreeObjectEnumerator 
释放全部关联对象枚举器的资源。在执行该操作之后，此枚举器不再有效。 
——请求消息体： 
表 8-45 NTS_FreeObjectEnumerator 请求消息体 
长度 
类型 
描述 
必须 
4 
NTS_ObjectEnumerator 分配完成的对象枚举器。 
是 
——响应消息体： 
无。 
中国银联 
版权所有

---
**[p31]**

Q/CUP 069—2015 
24 
——响应状态值： 
表 8-46 NTS_FreeObjectEnumerator 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
8.4.4.3 NTS_ResetObjectEnumerator 
重置对象枚举索引为初始化状态，如果枚举已经开始，那么将被重置。 
——请求消息体： 
表 8-47 NTS_FreeObjectEnumerator 请求消息体 
长度 
类型 
描述 
必须 
4 
NTS_ObjectEnumerator 分配完成的对象枚举器。 
是 
——响应消息体： 
无。 
——响应状态值： 
表 8-48 NTS_FreeObjectEnumerator 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
8.4.4.4 NTS_StartObjectEnumerator 
启动既定可信存储中的所有对象的枚举。对象信息可以执行NTS_GetNextObject操作重新获得。枚举
不一定要反映一个给定的相一致的存储状态：在枚举过程中，其它TEE或者其它TEE的实例都可以创建、删
除或者重命名对象。停止一个枚举，TEE可以调用NTS_ResetObjectEnumerator操作，从可信存储中分离枚
举。TEE可以调用NTS_FreeObjectEnumerator操作释放对象枚举。如果当一个枚举已经被启动的时候调用
该操作，那么首先重置该枚举然后再重启。 
——请求消息体： 
表 8-49 NTS_StartObjectEnumerator 请求消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
存储空间类型，参考对应的常数定义。 
是 
4 
NTS_ObjectEnumerator 分配完成的对象枚举器。 
是 
——响应消息体： 
无。 
中国银联 
版权所有

---
**[p32]**

Q/CUP 069—2015 
25 
——响应状态值： 
表 8-50 NTS_StartObjectEnumerator 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_ITEM_NOT_FOUND 
未找到该存储对象 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.4.5 NTS_GetNextObject 
枚举下一个对象，并且返回该对象的信息：类型、大小、标识符，等等。如果不再有枚举对象，或者
没有已启动的枚举，那么操作返回ITS_ERROR_ITEM_NOT_FOUND。 
——请求消息体： 
表 8-51 NTS_GetNextObject 请求消息体 
长度 
类型 
描述 
必须 
4 
NTS_ObjectEnumerator 已经启动的对象枚举器。 
是 
——响应消息体： 
表 8-52 NTS_GetNextObject 响应消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectInfo 
对象信息。 
是 
可变 
NTS_ObjectId 
对象唯一标识。 
是 
——响应状态值： 
表 8-53 NTS_GetNextObject 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_ITEM_NOT_FOUND 
未找到下一个对象 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.5 数据流访问操作 
8.4.5.1 NTS_ReadObjectData 
从数据流中读取指定数量的字节内容。 
中国银联 
版权所有

---
**[p33]**

Q/CUP 069—2015 
26 
——请求消息体： 
表 8-54 NTS_ReadObjectData 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
4 
ITS_Integer 
要读取的字节数
量。 
是 
——响应消息体： 
表 8-55 NTS_ReadObjectData 响应消息体 
长度 
类型 
描述 
必须 
可变 
ITS_Buffer 
读取的数据内容。 
是 
——响应状态值： 
表 8-56 NTS_ReadObjectData 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.5.2 NTS_WriteObjectData 
数据流中写入指定数量的字节内容。写入数据流是一个原子；操作完全成功，或者不写入。 
——请求消息体： 
表 8-57 NTS_WriteObjectData 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
可变 
ITS_Buffer 
要写入的数据内
容。 
是 
——响应消息体： 
无。 
中国银联 
版权所有

---
**[p34]**

Q/CUP 069—2015 
27 
——响应状态值： 
表 8-58 NTS_WriteObjectData 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_STORAGE_NO_SPACE 
没有足够存储空间 
ITS_ERROR_OVERFLOW 
数值超出数据类型存储范围 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.5.3 NTS_TruncateObjectData 
改变数据流的大小。如果新长度小于当前数据流大小，那么所有超出新长度的字节将被删除。如果新
长度大于当前数据流大小，那么用0填充数据流，一直扩充到数据流末端。截取数据流是一个原子：数据
流成功被截取，或者不做任何操作。 
——请求消息体： 
表 8-59 NTS_TruncateObjectData 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
4 
ITS_Integer 
数据流的新大小。 
是 
——响应消息体： 
无。 
——响应状态值： 
表 8-60 NTS_TruncateObjectData 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_STORAGE_NO_SPACE 
没有足够存储空间 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
8.4.5.4 NTS_SeekObjectData 
设置当前对象的数据位置指示器。 
中国银联 
版权所有

---
**[p35]**

Q/CUP 069—2015 
28 
——请求消息体： 
表 8-61 NTS_SeekObjectData 请求消息体 
长度 
类型 
描述 
必须 
可变 
NTS_ObjectHandle 
对象操作句柄。 
是 
4 
ITS_Integer 
指定的偏移。 
是 
4 
ITS_Integer 
数据流偏移的位置基点，参考“起始偏移量”。 是 
——响应消息体： 
无。 
——响应状态值： 
表 8-62 NTS_SeekObjectData 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_OVERFLOW 
数值超出数据类型存储范围 
ITS_ERROR_CURRUPT_OBJECT 
如果对象损坏 
ITS_ERROR_STORAGE_NOT_AVAILABLE 
对象所在的存储区域无法访问 
9 可信用户交互服务SPI  
9.1 概述 
在许多敏感的金融服务及企业用途使用场景中会涉及到与用户的交互，如账单支付、转账、文件签名
验证、隐私等等。这些使用场景中，某些应用可能需要将敏感信息向用户公开以寻求验证，或者需要从用
户那里获得某些敏感信息。输入一个个人识别码命令或签名一份文件，诸如这类操作，需要在TEEI平台的
TA内处理，而不是REE。因此，本小节针对需要为用户显示敏感信息或者获取用户敏感数据的TA的实现，
为软件开发人员定义了可信用户交互服务SPI。 
可信用户交互SPI允许在屏幕上为用户显示内容，并达到以下三个目标： 
——安全显示——显示给用户的信息不能够被任何REE 内的软件或TEEI 中未经授权的应用所访问、
修改或遮蔽； 
——安全输入：用户输入的信息不能够被任何REE 内的软件或TEEI 中未经授权的应用窃取或修改； 
——安全指示：用户能够确定画面实际上是由TA 显示的。 
可信用户交互服务的整体架构如下图所示: 
中国银联 
版权所有

---
**[p36]**

Q/CUP 069—2015 
29 
 
TEEI 环境 
TEE 
REE 环境 
CA 
TEEI 虚拟网络 
TA 
CA 
TUI 
 
图 9–1 可信用户交互服务整体架构 
一个典型的实现可信用户交互功能的架构，包括一个触摸屏或键盘外设和显示控制器外设。当一个可
信用户交互画面被显示时，这些外围设备无法通过REE进行读取或写入访问，并且REE也不会接收到任何相
关事件的指示。其他时间，对于是否将那些外设的控制权归还给REE，或是否提供一些其它的方法以准许
REE访问那些外设，都取决于特定的平台或特定的TEEI实现。 
9.2 数据类型 
9.2.1 TUI_EntryFieldMode 
输入域显示字符时所支持的模式。 
表 9-1 TUI_EntryFieldMode 数据类型 
名称 
描述 
值 
TUI_HIDDEN_MODE 
显示的字符是不可见的 
0x00 
TUI_CLEAR_MODE 
显示的字符是始终可见的 
0x01 
TUI_TEMPORARY_CLEAR_MODE 显示的字符在输入后很短时间内是可见的，之后会被
隐藏 
0x02 
9.2.2 TUI_EntryFieldType 
输入域的可能类型。 
表 9-2 TUI_EntryFieldType 数据类型 
名称 
描述 
值 
TUI_NUMERICAL 
该区域只接受数字作为输入 
0x00 
TUI_ALPHANUMERICAL 
该区域接受字符和数字作为输入 
0x01 
中国银联 
版权所有

---
**[p37]**

Q/CUP 069—2015 
30 
TUI_CURRENCY 
该区域接受金额数据作为输入 
0x02 
9.2.3 TUI_ScreenOrientation 
支持的画面显示方向。 
表 9-3 TUI_ScreenOrientation 数据类型 
名称 
描述 
值 
TUI_PORTRAIT 
要求可信用户交互画面纵向显示，即垂直的方向 
0x00 
TUI_LANDSCAPE 
要求可信用户交互画面横向显示，即水平的方向 
0x01 
9.2.4 TUI_ButtonType 
可信用户交互画面上可能出现的6种按钮。 
表 9-4 TUI_ButtonType 数据类型 
名称 
描述 
值 
TUI_CORRECTION 
表示“更正”按钮 
0x00 
TUI_OK 
表示“确定”按钮 
0x01 
TUI_CANCEL 
表示“取消”按钮 
0x02 
TUI_VALIDATE 
表示“验证”按钮 
0x03 
TUI_PREVIOUS 
表示“上一页”按钮 
0x04 
TUI_NEXT 
表示“下一页”按钮 
0x05 
9.2.5 TUI_ImageSource 
图片的所有可能来源 
表 9-5 TUI_ImageSource 数据类型 
名称 
描述 
值 
TUI_NO_SOURCE 
没有提供输入图片 
0x00 
TUI_OBJECT_SOURCE 
该图片源是以可信存储内的数据对象方式提供的 
0x01 
9.2.6 TUI_Image 
定义了一种处理标签域和按钮图片的方式。一个图片来源可以是一个缓冲区或可信存储内的对象。 
表 9-6 TUI_Image 数据类型 
长度 
描述 
必须 
4 
数据结构的字节长度 
是 
1 
表示该图片的来源 
是 
20 
ITS_DataObject（当图片来源是TUI_OBJECT_SOURCE 时） 
否 
4 
该图片宽度的像素数（当图片来源是TUI_OBJECT_SOURCE 时） 
否 
中国银联 
版权所有

---
**[p38]**

Q/CUP 069—2015 
31 
4 
该图片高度的像素数（当图片来源是TUI_OBJECT_SOURCE 时） 
否 
9.2.7 TUI_ScreenLabel 
定义了TA所定义的标签域的内容，其能支持TA品牌信息和TA定义的消息。 
表 9-7 TUI_ScreenLabel 数据类型 
长度 
描述 
必须 
4 
数据结构的字节长度 
是 
可变 
输入到标签域的字符串（ITS_String 类型） 
是 
4 
要渲染文本左上角的x 坐标 
是 
4 
要渲染文本左上角的y 坐标 
是 
1 
以RGB 形式定义文本颜色中的红色值，在0 到255 之间取值，但为了适应
其画面的最佳匹配颜色要求，实现可以重新调试 
是 
1 
以RGB 形式定义文本颜色中的绿色值，在0 到255 之间取值，但为了适应
其画面的最佳匹配颜色要求，实现可以重新调试 
是 
1 
以RGB 形式定义文本颜色中的蓝色值，在0 到255 之间取值，但为了适应
其画面的最佳匹配颜色要求，实现可以重新调试 
是 
可变 
放入标签域中的图片（TUI_Image 类型） 
否 
4 
要渲染图片左上角的x 坐标 
否 
4 
要渲染图片左上角的y 坐标 
否 
9.2.8 TUI_Button 
定义一个按钮的内容。 
表 9-8 TUI_Button 数据类型 
长度 
描述 
必须 
4 
数据结构的字节长度 
是 
可变 
描述按钮的字符串（ITS_String 类型） 
是 
可变 
按钮的图片（TUI_Image 类型） 
是 
9.2.9 TUI_ScreenConfiguration 
能够配置一个可信用户交互画面。 
表 9-9 TUI_ScreenConfiguration 数据类型 
长度 
描述 
必须 
4 
数据结构的字节长度 
是 
2 
要求的画面方向（TUI_ScreenOrientation 类型） 
是 
可变 
背景图片（TUI_Image 类型） 
是 
可变 
指定画面的标签（TUI_ScreenLabel 类型） 
是 
中国银联 
版权所有

---
**[p39]**

Q/CUP 069—2015 
32 
长度 
描述 
必须 
可变 
能够自定义[TUI_CORRECTION]“更正”按钮（TUI_Button 类型） 
是 
可变 
能够自定义[TUI_OK]“确认”按钮（TUI_Button 类型） 
是 
可变 
能够自定义[TUI_CANCEL]“取消”按钮（TUI_Button 类型） 
是 
可变 
能够自定义[TUI_VALIDATE]“验证”按钮（TUI_Button 类型） 
是 
可变 
能够自定义[TUI_PREVIOUS]“上一页”按钮（TUI_Button 类型） 
是 
可变 
能够自定义[TUI_NEXT] “下一页”按钮（TUI_Button 类型） 
是 
2 
指定是否显示[TUI_CORRECTION]“更正”按钮，如果按钮被要求显示，则将
值设置为0x01 
是 
2 
指定是否显示[TUI_OK]“确认”按钮，如果按钮被要求显示，则将值设置为
0x01 
是 
2 
指定是否显示[TUI_CANCEL]“取消”按钮，如果按钮被要求显示，则将值设
置为0x01 
是 
2 
指定是否显示[TUI_VALIDATE]“验证”按钮，如果按钮被要求显示，则将值
设置为0x01 
是 
2 
指定是否显示[TUI_PREVIOUS]“上一页”按钮，如果按钮被要求显示，则将
值设置为0x01 
是 
2 
指定是否显示[TUI_NEXT] “下一页”按钮，如果按钮被要求显示，则将值设
置为0x01 
是 
9.2.10 TUI_ScreenButtonInfo 
表示一个给定方向的可信用户交互画面上的按钮信息。 
表 9-10 TUI_ScreenButtonInfo 数据类型 
长度 
描述 
必须 
4 
数据结构的字节长度 
是 
可变 
默认标签值（ITS_String 类型） 
是 
4 
按钮宽度的像素数，如果不能自定义按钮的文本和图像，则值为0x0000 
是 
4 
按钮高度的像素数，如果不能自定义按钮的文本和图像，则值为0x0000 
是 
2 
如果可以自定义按钮文本，则值为0x01，否则为0x00 
是 
2 
如果可以自定义按钮图像，则值0x01，否则为0x00 
是 
文本和图像不能同时自定义，两者不可能同时为0x01。 
9.2.11 TUI_ScreenInfo 
表示一个给定方向的画面信息。 
表 9-11 TUI_ScreenInfo 数据类型 
长度 
描述 
必须 
4 
数据结构的字节长度 
是 
中国银联 
版权所有

---
**[p40]**

Q/CUP 069—2015 
33 
长度 
描述 
必须 
4 
可用的灰阶深度 
是 
4 
可用的红位深度 
是 
4 
可用的绿位深度 
是 
4 
可用的蓝位深度 
是 
4 
画面能够显示的输入域的最大数量。这取决于实现，但强制至少支持两个输入
域。 
是 
4 
输入域标签宽度的像素数 
是 
4 
输入域标签高度的像素数 
是 
1 
默认标签画布的RGB 红色值，在0…255 范围内，但是，实现可能会重新调整
这些值，以适应其画面所要求的最佳匹配颜色。 
是 
1 
默认标签画布的RGB 绿色值，在0…255 范围内，但是，实现可能会重新调整
这些值，以适应其画面所要求的最佳匹配颜色。 
是 
1 
默认标签画布的RGB 蓝色值，在0…255 范围内，但是，实现可能会重新调整
这些值，以适应其画面所要求的最佳匹配颜色。 
是 
4 
该标签画布的宽度像素数 
是 
4 
该标签画布的高度像素数 
是 
可变 
定义的画面中[TUI_ CORRECTION]“更正”按钮信息（TUI_ScreenButtonInfo 类
型） 
是 
可变 
定义的画面中[TUI_OK]“确认”按钮信息（TUI_ScreenButtonInfo 类型） 
是 
可变 
定义的画面中[TUI_CANCEL]“取消”按钮信息（TUI_ScreenButtonInfo 类型） 
是 
可变 
定义的画面中[TUI_VALIDATE]“验证”按钮信息（TUI_ScreenButtonInfo 类型） 是 
可变 
定义的画面中[TUI_PREVIOUS]“上一页”按钮信息（TUI_ScreenButtonInfo 类
型） 
是 
可变 
定义的画面中[TUI_NEXT] “下一页”按钮信息（TUI_ScreenButtonInfo 类型） 
是 
9.2.12 TUI_EntryField 
表示获取用户输入的输入域。 
表 9-12 TUI_EntryField 数据类型 
长度 
描述 
必须 
4 
数据结构的字节长度 
是 
可变 
输入域相关的标签（ITS_String 类型） 
是 
4 
显示字符的模式 
是 
4 
输入域接受的输入的类型 
是 
4 
输入域的最小输入字符数 
是 
4 
输入域的最大输入字符数 
是 
可变 
用户输入的内容（ITS_String 类型） 
是 
中国银联 
版权所有

---
**[p41]**

Q/CUP 069—2015 
34 
9.2.13 TUI_LabelField 
定义了TA所定义消息域的内容，其能支持TA定义的提示消息。 
表 9-13 TUI_LabelField 数据类型 
长度 
描述 
必须 
4 
数据结构的字节长度 
是 
可变 
输入到标签域的字符串（ITS_String 类型） 
是 
4 
要渲染文本左上角的x 坐标 
是 
4 
要渲染文本左上角的y 坐标 
是 
1 
以RGB 形式定义文本颜色中的红色值，在0 到255 之间取值，但为了适应
其画面的最佳匹配颜色要求，实现可以重新调试 
是 
1 
以RGB 形式定义文本颜色中的绿色值，在0 到255 之间取值，但为了适应
其画面的最佳匹配颜色要求，实现可以重新调试 
是 
1 
以RGB 形式定义文本颜色中的蓝色值，在0 到255 之间取值，但为了适应
其画面的最佳匹配颜色要求，实现可以重新调试 
是 
可变 
放入标签域中的图片（TUI_Image 类型） 
否 
4 
要渲染图片左上角的x 坐标 
否 
4 
要渲染图片左上角的y 坐标 
否 
9.3 操作 
9.3.1 操作定义 
表 9-14 操作定义 
操作 
版本 
指令码 
操作ID 值 
TUI_CheckTextFormat 
0x0001 
0x0001 
0x00010001 
TUI_GetScreenInfo 
0x0001 
0x0002 
0x00010002 
TUI_InitSession 
0x0001 
0x0003 
0x00010003 
TUI_CloseSession 
0x0001 
0x0004 
0x00010004 
TUI_DisplayScreen 
0x0001 
0x0005 
0x00010005 
TUI_DisplayScreenMessage 
0x0001 
0x0006 
0x00010006 
TUI_GetSecurityIndicatorType 0x0001 
0x0007 
0x00010007 
TUI_GetLanguagesSupport 
0x0001 
0x0008 
0x00010008 
TUI_GetOrientationSupport 
0x0001 
0x0009 
0x00010009 
TUI_GetDefaultSessionTimeout 0x0001 
0x000a 
0x0001000a 
9.3.2 TUI_CheckTextFormat 
此操作允许一个TA检测能否在当前的实现中显示给定的文本，并且检索所要呈现的文本需要的大小和
宽度。 
中国银联 
版权所有

---
**[p42]**

Q/CUP 069—2015 
35 
——请求消息体： 
表 9-15 TUI_CheckTextFormat 请求消息体 
名字 
长度 
描述 
必须 
text 
可变 
被检测的文本字符串 
是 
——响应消息体： 
表 9-16 TUI_CheckTextFormat 响应消息体 
名字 
长度 
描述 
width 
4 
需要显示的文本宽度的像素数 
height 
4 
需要显示的文本高度得像素数 
lastIndex 
4 
已检查的最后一个字符 
——响应状态值： 
表 9-17 TUI_CheckTextFormat 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_NOT_SUPPORTED 
文本字符串中有至少一个字符不
能被渲染 
9.3.3 TUI_GetScreenInfo 
此操作获取定向画面的信息和要求的输入域个数。 
——请求消息体： 
表 9-18 TUI_GetScreenInfo 请求消息体 
名字 
长度 
描述 
必须 
screenOrientation 
4 
定义所要求的定向画面信息 
是 
nbEntryFields 
4 
定义所要求的输入域个数 
是 
——响应消息体： 
表 9-19 TUI_GetScreenInfo 响应消息体 
名字 
长度 
描述 
screenInfo 
4 
返回所要求的定向画面信息 
中国银联 
版权所有

---
**[p43]**

Q/CUP 069—2015 
36 
——响应状态值： 
表 9-20 TUI_GetScreenInfo 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_NOT_SUPPORTED 
所要求的输入域数量不被支持 
9.3.4 TUI_InitSession 
此操作为当前TA声明了一个单独访问可信用户交互资源的权限。在该阶段，TEE不能控制画面和键盘。
这只是为这个特殊的TA预留了使用可信用户交互的能力，并将通知其它可信应用，预留已经完成且资源正
在被使用。例如，当其它TA尝试该操作时，响应状态值为TUI_ERROR_BUSY。 
——请求消息体： 
无。 
——响应消息体： 
无。 
——响应状态值： 
表 9-21 TUI_InitSession 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BUSY 
TUI 资源正在使用中 
ITS_ERROR_OUT_OF_MEMORY 
内存溢出 
9.3.5 TUI_CloseSession 
此操作释放之前获得的可信用户交互资源。 
——请求消息体： 
无。 
——响应消息体： 
无。 
——响应状态值： 
表 9-22 TUI_CloseSession 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BUSY 
TUI 资源正在使用中 
ITS_BAD_STATE 
由会话超时或操作系统外部特定
事件所导致的可信用户交互自动
关闭 
中国银联 
版权所有

---
**[p44]**

Q/CUP 069—2015 
37 
9.3.6 TUI_DisplayScreen 
此操作显示可信用户交互画面。 
——请求消息体： 
表 9-23 TUI_DisplayScreen 请求消息体 
名字 
长度 
描述 
必须 
screenConfiguration 
可变 
配置画面上的标签和任选按钮
（TUI_ScreenConfiguration 类型） 
是 
closeTUISession 
2 
此操作结束时，是否自动关闭可信用户交互会话 是 
entryFieldCount 
4 
输入字段个数 
是 
entryFields 
可变 
输入字段数组（TUI_EntryField 类型） 
是 
——响应消息体： 
表 9-24 TUI_DisplayScreen 响应消息体 
名字 
长度 
描述 
selectedButton 
4 
选中的按钮用于退出可信用户交互画面 
entryFieldCount 
4 
输入字段个数 
entryFieldValues 
可变 
输入内容数组（ITS_String 类型） 
——响应状态值： 
表 9-25 TUI_DisplayScreen 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BUSY 
TUI 资源正在使用中 
ITS_ERROR_OUT_OF_MEMORY 
内存溢出 
ITS_ERROR_BAD_STATE 
由会话超时或操作系统外部特定事件所
导致的可信用户交互自动关闭 
ITS_ERROR_ITEM_NOT_FOUND 
图片不存在 
ITS_ERROR_ACCESS_CONFLICT 
访问权限冲突 
ITS_ERROR_BAD_FORMAT 
图片格式不是PNG 
ITS_ERROR_CANCEL 
可信用户交互画面显示时，该操作被取
消 
9.3.7 TUI_DisplayScreenMessage 
此操作显示包含提示信息的可信用户交互画面。 
中国银联 
版权所有

---
**[p45]**

Q/CUP 069—2015 
38 
——请求消息体： 
表 9-26 TUI_DisplayScreenMessage 请求消息体 
名字 
长度 
描述 
必须 
screenConfiguration 
可变 
配置画面上的标签和任选按钮
（TUI_ScreenConfiguration 类型） 
是 
closeTUISession 
2 
此操作结束时，是否自动关闭可信用户交互会话 是 
labelFieldCount 
4 
消息域个数 
是 
labelFields 
可变 
消息域数组（TUI_LabelField 类型） 
是 
——响应消息体： 
表 9-27 TUI_DisplayScreenMessage 响应消息体 
名字 
长度 
描述 
selectedButton 
4 
选中的按钮用于退出可信用户交互画面 
——响应状态值： 
表 9-28 TUI_DisplayScreenMessage 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BUSY 
TUI 资源正在使用中 
ITS_ERROR_OUT_OF_MEMORY 
内存溢出 
ITS_ERROR_BAD_STATE 
由会话超时或操作系统外部特定事件所
导致的可信用户交互自动关闭 
ITS_ERROR_ITEM_NOT_FOUND 
图片不存在 
ITS_ERROR_ACCESS_CONFLICT 
访问权限冲突 
ITS_ERROR_BAD_FORMAT 
图片格式不是PNG 
ITS_ERROR_CANCEL 
可信用户交互画面显示时，该操作被取消 
9.3.8 TUI_GetSecurityIndicatorType 
此操作允许检测可信用户交互服务的安全指示实现方式。0x00000000表示安全指示是TUI管理的， 
0x00000001要由使用方自己管理。 
——请求消息体： 
无。  
中国银联 
版权所有

---
**[p46]**

Q/CUP 069—2015 
39 
——响应消息体： 
表 9-29 TUI_GetSecurityIndicatorType 响应消息体 
名字 
长度 
描述 
securityIndicatorType 4 
安全指示类型 
——响应状态值： 
表 9-30 TUI_GetSecurityIndicatorType 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
9.3.9 TUI_GetLanguagesSupport 
此操作允许检测可信用户交互服务支持的语言。返回结果是以“:”分隔的支持语言列表字符串，语
言编码参考ISO 639-1规范。 
——请求消息体： 
无。  
——响应消息体： 
表 9-31 TUI_GetLanguagesSupport 响应消息体 
名字 
长度 
描述 
languages 
可变 
支持的语言列表(ITS_String 类型) 
——响应状态值： 
表 9-32 TUI_GetLanguagesSupport 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
9.3.10 TUI_GetOrientationSupport 
此操作允许检测可信用户交互服务支持屏幕显示方式。0x00000001：支持纵屏显示；0x00000002：支
持横屏显示；0x00000003：横屏或纵屏均支持。 
——请求消息体： 
无。  
——响应消息体： 
表 9-33 TUI_GetOrientationSupport 响应消息体 
名字 
长度 
描述 
orientation 
4 
支持的屏幕显示类型 
中国银联 
版权所有

---
**[p47]**

Q/CUP 069—2015 
40 
——响应状态值： 
表 9-34 TUI_GetOrientationSupport 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
9.3.11 TUI_GetDefaultSessionTimeout 
此操作允许检测可信用户交互服务的会话的缺省超时时间。以毫秒为单位，缺省情况下是10秒。 
——请求消息体： 
无。  
——响应消息体： 
表 9-35 TUI_GetDefaultSessionTimeout 响应消息体 
名字 
长度 
描述 
timeout 
4 
缺省超时时间 
——响应状态值： 
表 9-36 TUI_GetDefaultSessionTimeout 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
10 主机卡模拟服务 SPI  
10.1 概述 
TEEI的主机卡模拟服务是对TEEI系统内部服务提供HC相关的APDU处理模块的注册和管理功能的内置
可信服务。 
中国银联 
版权所有

---
**[p48]**

Q/CUP 069—2015 
41 
 
 
TA 
 
NFCEEs 
 
TA 
APDU 处理模块 
（TAs） 
数据通信 
NFCC 
（Routing） 
HCE 内置可信服务 
（Device Host） 
数据通信 
数据通信 
 
图 10–1 主机卡模拟服务整体架构 
10.2 数据类型 
10.2.1 HCE_ApduService 
表 10-1 HCE_ApduService 数据类型 
长度 
类型 
字段/描述 
必须 
4 
ITS_Integer 
该服务感兴趣的AID 数量。 
是 
可变 
ITS_Array(ITS_String) 该服务感兴趣的AID 列表。 
是 
4 
ITS_Integer 
该服务所属的服务类型，1 为支付服务，否则为其他服务。 是 
4 
ITS_Integer 
作为APDU 处理模块的TA 所在的TAS 主机ID。 
是 
16 
ITS_UUID 
作为APDU 处理模块的TA 的UUID。 
是 
4 
ITS_Integer 
要调用的TA 的操作ID，当该操作被调用时，参数/响应均
为封装成ITS_Buffer 数据类型的数据流信息，例如：APDU
请求/响应。 
是 
4 
ITS_Integer 
自动分配的服务 ID（如果未分配，则为0x00000000）。 是 
中国银联 
版权所有

---
**[p49]**

Q/CUP 069—2015 
42 
10.3 操作 
10.3.1 操作定义 
表 10-2 操作定义 
操作 
版本 
指令码 
操作ID 值 
HCE_RegisterApduService 
0x0001 
0x0001 
0x00010001 
HCE_UnregisterApduService 
0x0001 
0x0002 
0x00010002 
HCE_ListApduService 
0x0001 
0x0003 
0x00010003 
HCE_GetApduService 
0x0001 
0x0004 
0x00010004 
10.3.2 HCE_RegisterApduService 
注册APDU服务模块。 
——请求消息体： 
表 10-3 HCE_RegisterApduService 请求消息体 
长度 类型 
描述 
必须 
可变 HCE_ApduService 
主机卡模拟的执行单元以及路由描述 
是 
——响应消息体： 
表 10-4 HCE_RegisterApduService 响应消息体 
长度 类型 
描述 
必须 
4 
ITS_Integer 
自动分配的服务 ID 
是 
——响应状态值： 
表 10-5 HCE_RegisterApduService 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_INTERNAL 
内部错误 
10.3.3 HCE_UnregisterApduService 
注销APDU服务模块。 
——请求消息体： 
表 10-6 HCE_UnregisterApduService 请求消息体 
长度 类型 
描述 
必须 
4 
ITS_Integer 
自动分配的服务 ID 
是 
中国银联 
版权所有

---
**[p50]**

Q/CUP 069—2015 
43 
——响应消息体： 
无。 
——响应状态值： 
表 10-7 HCE_UnregisterApduService 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_INTERNAL 
内部错误 
10.3.4 HCE_ListApduService 
获取已经注册的全部APDU服务模块描述信息。 
——请求消息体： 
无。 
——响应消息体： 
表 10-8 HCE_ListApduService 响应消息体 
长度 类型 
描述 
必须 
可变 
ITS_Array(HCE_ApduService) HCE_ApduService 类型的数组 
是 
——响应状态值： 
表 10-9 HCE_ListApduService 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_INTERNAL 
内部错误 
10.3.5 HCE_GetApduService 
获取APDU服务模块描述信息。 
——请求消息体： 
表 10-10 HCE_GetApduService 请求消息体 
长度 类型 
描述 
必须 
4 
ITS_Integer 
自动分配的服务 ID 
是 
中国银联 
版权所有

---
**[p51]**

Q/CUP 069—2015 
44 
——响应消息体： 
表 10-11 HCE_GetApduService 响应消息体 
长度 类型 
描述 
必须 
可变 HCE_ApduService 
主机卡模拟的执行单元以及路由描述 
是 
——响应状态值： 
表 10-12 HCE_GetApduService 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_INTERNAL 
内部错误 
 
11 生物识别服务SPI  
11.1 概述 
生物识别服务SPI是提供TEEI系统内部各种生物识别服务标准访问接口。生物识别服务SPI屏蔽了各种
生物识别技术的差异，将基本的访问及操作流程进行了抽象，提供给TEEI内部的TEE/TA使用。 
11.2 常数 
11.2.1 识别方式 
描述生物识别服务所使用的识别方式。 
表 11-1 识别方式 
名称 
值 
描述 
BIO_TYPE_FINGER_PRINT 
0x00000001 
指纹识别 
BIO_TYPE_VOICE_PRINT 
0x00000002 
声纹识别 
BIO_TYPE_FACE_PRINT 
0x00000003 
面部识别 
BIO_TYPE_EYE_PRINT 
0x00000004 
虹膜识别 
BIO_TYPE_HAND_PRINT 
0x00000005 
掌纹识别 
 
11.2.2 识别状态 
描述生物识别服务的识别状态。 
表 11-2 识别状态 
名称 
值 
描述 
BIO_STATUS_SUCCESS 
0x00000000 
识别成功 
BIO_STATUS_FAILURE 
0x00000001 
识别失败 
BIO_STATUS_WAIT_USER 
0x00000002 
等待用户动作 
BIO_STATUS_IN_PROCESS 
0x00000003 
识别处理中 
BIO_STATUS_WAIT_DEVICE 
0x00000004 
等待硬件设备初始化 
BIO_STATUS_IDLE 
0x00000005 
服务空闲 
中国银联 
版权所有

---
**[p52]**

Q/CUP 069—2015 
45 
 
11.2.3 识别用途 
描述使用生物识别服务的目的。 
表 11-3 识别用途 
名称 
值 
描述 
BIO_USAGE_PAYMENT_CONFIRM 
0x00000001 
支付交易确认 
BIO_USAGE_SECURE_WORLD_LOGIN 
0x00000002 
允许进入安全的世界 
BIO_USAGE_RICH_APP_LOGIN 
0x00000003 
REE 应用程序登录 
BIO_USAGE_TRUSTED_APP_LOGIN 
0x00000004 
可信应用程序登录 
BIO_USAGE_REMOTE_SERVER_LOGIN 
0x00000005 
远程服务器登录 
 
11.3 数据类型 
11.3.1 BIO_ServiceInfo 
生物识别服务的描述信息。 
表 11-4 BIO_ServiceInfo 数据类型 
长度 
类型 
字段/描述 
必须 
4 
ITS_Integer 
识别方式，参考识别方式常数定义 
是 
4 
ITS_Octet[4] 
版本号，二进制形式 
是 
可变 
ITS_String 
服务提供商描述信息 
是 
可变 
ITS_String 
特定于提供商的服务描述信息，实现定义 
否 
11.4 操作 
11.4.1 操作定义 
表 11-5 操作定义 
操作 
 
操作ID 值 
版本 
指令码 
BIO_GetServiceInfo 
0x0001 
0x0001 
0x00010001 
BIO_OpenService 
0x0001 
0x0002 
0x00010002 
BIO_CloseService 
0x0001 
0x0003 
0x00010003 
BIO_StartIdentify 
0x0001 
0x0004 
0x00010004 
BIO_CancelIdentify 
0x0001 
0x0005 
0x00010005 
BIO_GetIdentifyStatus 
0x0001 
0x0006 
0x00010006 
 
11.4.2 BIO_GetServiceInfo 
获得生物识别服务描述信息。 
 
——请求消息体： 
无。 
 
——响应消息体： 
中国银联 
版权所有

---
**[p53]**

Q/CUP 069—2015 
46 
表 11-6 BIO_GetServiceInfo 响应消息体 
长度 
类型 
描述 
必须 
可变 
BIO_ServiceInfo 
读取的服务描述信息。 
是 
 
——响应状态值： 
表 11-7 BIO_GetServiceInfo 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_SERVICE_NOT_AVAIABLE 
如果服务无法访问 
 
11.4.3 BIO_OpenService 
打开生物识别服务。 
 
——请求消息体： 
表 11-8 BIO_OpenService 请求消息体 
长度 
类型 
描述 
必须 
可变 
ITS_String 
特定于服务的初始化信息，实现定义。 
否 
 
——响应消息体： 
表 11-9 BIO_OpenService 响应消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
标识当前服务连接的连接ID。 
是 
 
——响应状态值： 
表 11-10 BIO_OpenService 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_SERVICE_NOT_AVAIABLE 
如果服务无法访问 
ITS_ERROR_RESOURCE_LIMIT 
如果没有足够的资源创建连接 
 
11.4.4 BIO_CloseService 
关闭生物识别服务。 
 
——请求消息体： 
表 11-11 BIO_CloseService 请求消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
标识当前服务连接的连接ID。 
是 
中国银联 
版权所有

---
**[p54]**

Q/CUP 069—2015 
47 
 
——响应消息体： 
无。 
 
——响应状态值： 
表 11-12 BIO_CloseService 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
 
11.4.5 BIO_StartIdentify 
开始生物识别过程。 
 
——请求消息体： 
表 11-13 BIO_StartIdentify 请求消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
标识当前服务连接的连接ID。 
是 
4 
ITS_Integer 
是否利用生物识别服务提供的TUI 界面，
0x00000000 代表不使用，其他值使用。 
是 
4 
ITS_Integer 
会话超时时间，以毫秒为单位。 
是 
4 
ITS_Integer 
认证用途，表明当前认证的目的。 
是 
可变 
ITS_String 
特定于用途的描述信息，实现定义。 
否 
 
——响应消息体： 
表 11-14 BIO_StartIdentify 响应消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
识别状态。 
是 
可变 
ITS_Buffer 
认证结果凭证，实现定义。 
否 
 
——响应状态值： 
表 11-15 BIO_StartIdentify 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
ITS_ERROR_TIMEOUT 
如果处理超过了指定的时间 
ITS_ERROR_SERVICE_NOT_AVAIABLE 
如果服务无法访问 
 
11.4.6 BIO_CancelIdentify 
取消正在进行的生物识别过程。 
 
——请求消息体： 
中国银联 
版权所有

---
**[p55]**

Q/CUP 069—2015 
48 
表 11-16 BIO_CancelIdentify 请求消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
标识当前服务连接的连接ID。 
是 
 
——响应消息体： 
表 11-17 BIO_CancelIdentify 响应消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
取消时的识别状态。 
否 
 
——响应状态值： 
表 11-18 BIO_CancelIdentify 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
 
11.4.7 BIO_GetIdentifyStatus 
获得当前的识别状态。 
 
——请求消息体： 
表 11-19 BIO_GetIdentifyStatus 请求消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
标识当前服务连接的连接ID。 
是 
 
——响应消息体： 
表 11-20 BIO_GetIdentifyStatus 响应消息体 
长度 
类型 
描述 
必须 
4 
ITS_Integer 
当前的识别状态。 
是 
 
——响应状态值： 
表 11-21 BIO_GetIdentifyStatus 响应状态值 
名字 
描述 
ITS_SUCCESS 
操作成功 
ITS_ERROR_SERVICE_NOT_AVAIABLE 
如果服务无法访问 
ITS_ERROR_BAD_PARAMETERS 
如果参数内容或格式不合法 
 
中国银联 
版权所有

---
**[p56]**

Q/CUP 069—2015 
49 
附 录 A 
（资料性附录） 
支付应用时的可信用户交互 
本用例出现在购物付款的应用场景中，旨在说明整个付款过程里，有关支付验证的人机交互流程的
具体实现，以便于本规范的理解和应用。 
用户购物付款时REE端的消费类CA提示是否付款，当用户选择确认付款，系统将从REE端切换到TEEI
端，启动消费类TA。该TA通过虚拟网络调用TUI（可信用户交互）提供身份验证和支付操作中涉及人机
交互的服务。此时的显示画面和操作数据的交互和存储全部是在TEEI端进行，REE端将被隔离而无法获
得受保护数据。当交易结束后，系统将退出TEEI，切换回REE端。具体过程描述如下： 
 
TEEI 
REE 
消费类CA 
TEEI Client API 
REE 代理 
TEEI 虚拟网络 
REE 网关 
TAS 
 
TUI 
消费类TA 
TVM（可信虚拟机） 
TVM（可信虚拟机） 
Session
 
图A-1 TUI 应用场景图 
用户确定购买商品进入支付程序，从REE的消费类CA处发起请求，调用TEEI Client API，传递对应
TA的UUID，通过REE代理和网关的解析，找到TEEI中对应的消费类TA。 
1) TA 调用TEEI 虚拟网络API 函数TEEI_Connect_TA，将TUI 的Host_ID(0x20)和
UUID(23ef19b5-84ad-4433-92fa-820291951e7f)作为参数传递给函数。虚拟网络创建发起请求
的TA 和目标ITS 的HHCP 连接，并将标识连接的pipe ID 返回给调用方TA，即图中的消费类
TA； 
2) TA 利用前一次调用返回的pipe ID 作为参数调用虚拟网络API 函数TEEI_Send_Data 向TUI 发
送命令。具体实现按先后顺序说明如下： 
 
发送TUI_GetScreenInfo 操作码和参数值，获取屏幕信息； 
 
发送TUI_CheckTextFormat 操作码和参数值，检测能否在当前的显示设备上显示给定的文
本，并且检索所要呈现的文本需要的大小和宽度； 
中国银联 
版权所有

---
**[p57]**

Q/CUP 069—2015 
50 
 
以上操作成功后，配置待显示内容和界面配置信息； 
 
发送TUI_InitSession 操作码，获取独立访问TUI 的权限，此时其它TA 尝试该操作时，
状态值为TUI_ERROR_BUSY 表示TUI 资源正在使用中； 
 
发送TUI_DisplayScreen 操作码和参数值，显示可信用户交互； 
 
用户根据提示输入支付密码并提交，TA 获得密码信息并进行验证； 
 
验证通过，完成支付，显示支付成功的提示，流程同上； 
 
用户确认支付完成，系统准备退出TEEI，发送TUI_CloseSession 操作码，释放之前获得
的TUI 资源。 
TA调用TEEI虚拟网络API的TEEI_DisConnect_TA方法关闭Pipe连接，释放当前TUI实例供其他TA调
用。 
 
中国银联 
版权所有