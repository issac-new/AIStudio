# 中国银联可信执行环境集成（TEEI）技术规范第5部分：固件编程接口规范
> 来源: 银联规范 2015-12 存档 | 176页 | 提取: 2026-09-03


---
**[p1]**

Q/CUP 
中国银联股份有限公司企业标准 
Q/CUP 069—2015 
 
中国银联可信执行环境集成（TEEI）技术规范 
第5 部分 固件编程接口规范 
UnionPay Trusted Execution Environment Integration Technical Specifications 
Part 5：Specification on Firmware Interface 
 
 
 
 
 
2015-07-01 发布 
2015-07-01 实施
中国银联股份有限公司   发布 
中国银联 
版权所有

---
**[p2]**

Q/CUP 069—2015 
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

Q/CUP 069—2015 
I 
目  次 
前言 ................................................................................ IV 
引言 ................................................................................. V 
1 范围 ............................................................................... 1 
2 规范性引用文件 ..................................................................... 1 
3 术语与定义 ......................................................................... 1 
3.1 虚拟机镜像 ..................................................................... 1 
3.2 设备 ........................................................................... 1 
4 符号与缩略语 ....................................................................... 1 
5 固件编程接口概述 ................................................................... 2 
6 共通定义 ........................................................................... 3 
6.1 头文件 ......................................................................... 3 
6.2 响应状态值 ..................................................................... 3 
6.3 数据类型 ....................................................................... 5 
6.3.1 基本类型 ................................................................... 5 
6.3.2 TEEI_Result ................................................................ 5 
6.3.3 TEEI_HostInfo .............................................................. 5 
6.3.4 TEEI_SHCP_Key .............................................................. 5 
6.3.5 TEEI_DeviceHandle .......................................................... 6 
6.3.6 TEE_Host ................................................................... 6 
6.3.7 TEE_Pipe ................................................................... 6 
6.3.8 TEEI_UUID .................................................................. 6 
6.3.9 TEE_Message ................................................................ 7 
6.4 参数注释 ....................................................................... 7 
6.4.1 [in]，[out]和[inout] ....................................................... 7 
6.4.2 [outopt] ................................................................... 7 
6.4.3 [inbuf] .................................................................... 7 
6.4.4 [outbuf] ................................................................... 7 
6.4.5 [outbufopt] ................................................................ 7 
6.4.6 [instring]和[instringopt] .................................................. 7 
6.4.7 [outstring]和[outstringopt] ................................................ 7 
6.4.8 [ctx] ...................................................................... 7 
6.5 异常 ........................................................................... 8 
6.5.1 TEEI_Panic ................................................................. 8 
7 通用服务API ........................................................................ 8 
7.1 头文件 ......................................................................... 8 
7.2 证书服务 ....................................................................... 8 
7.2.1 TEEI_TVMCertType ........................................................... 8 
中国银联 
版权所有

---
**[p4]**

Q/CUP 069—2015 
II 
7.2.2 TEEI_TVMCert ............................................................... 8 
7.2.3 TEEI_GetTVMCert ............................................................ 9 
7.2.4 TEEI_UpdateTVMCert ......................................................... 9 
7.3 镜像服务API .................................................................... 9 
7.3.1 TEEI_UpdateTVMImage ........................................................ 9 
7.3.2 TEEI_DeleteTVMImage ....................................................... 10 
7.4 机器服务API ................................................................... 10 
7.4.1 TEEI_ResetTVM ............................................................. 10 
7.4.2 TEEI_GetHUK ............................................................... 10 
7.5 属性服务API ................................................................... 11 
7.5.1 TEEI_GetPropertyAsString .................................................. 12 
7.5.2 TEEI_GetPropertyAsU32 ..................................................... 12 
7.5.3 TEEI_GetPropertyAsBoolean ................................................. 12 
7.5.4 TEEI_GetPropertyAsUUID .................................................... 13 
7.5.5 TEEI_GetPropertyAsBinaryBlock ............................................. 13 
8 TEEI 服务API ...................................................................... 13 
8.1 可信网络API ................................................................... 14 
8.1.1 头文件 .................................................................... 14 
8.1.2 TEE 主机管理 ............................................................... 14 
8.1.3 Pipe 管理 .................................................................. 15 
8.1.4 主机访问控制管理 .......................................................... 16 
8.1.5 主机默认功能 .............................................................. 17 
8.1.6 安全HHCP 管理 ............................................................. 18 
8.2 TA 访问API .................................................................... 21 
8.2.1 头文件 .................................................................... 21 
8.2.2 TEEI_ConnectTA ............................................................ 21 
8.2.3 TEEI_DisConnectTA ......................................................... 21 
8.2.4 TEEI_TransceiveData ....................................................... 22 
8.3 基础服务API ................................................................... 22 
8.3.1 可信存储API ............................................................... 22 
8.3.2 算术运算API ............................................................... 47 
8.3.3 密码操作API ............................................................... 63 
8.3.4 时钟API ................................................................... 84 
8.3.5 安全Socket API ............................................................ 86 
8.3.6 近场通信API ............................................................... 98 
8.3.7 安全元件API .............................................................. 110 
8.3.8 RPMB 访问API ............................................................. 118 
8.3.9 文件系统API .............................................................. 121 
8.4 内置可信服务 ................................................................. 127 
8.4.1 可信存储服务SPI .......................................................... 127 
8.4.2 可信用户交互SPI .......................................................... 146 
8.4.3 主机卡模拟SPI ............................................................ 156 
8.4.4 生物识别SPI .............................................................. 159 
中国银联 
版权所有

---
**[p5]**

Q/CUP 069—2015 
III 
8.5 TEE 服务API .................................................................. 164 
8.5.1 头文件 ................................................................... 164 
8.5.2 数据类型 ................................................................. 164 
8.5.3 函数 ..................................................................... 165 
9 标准C 库 ......................................................................... 168 
中国银联 
版权所有

---
**[p6]**

Q/CUP 069—2015 
IV 
前  言 
本规范阐述了可支持TEEI软件开发所各种开发库。 
本规范由中国银联股份有限公司提出。 
本部分由中国银联股份有限公司组织制定。 
本部分的主要起草单位：中国银联电子支付研究院。 
本部分的主要起草人：徐燕军、鲁志军、何朔、周钰、郭伟、陈成钱、李定洲、曾望年、严翔翔、
张志坚、王军、孟庆洋、冯希顺、张楚。 
中国银联 
版权所有

---
**[p7]**

Q/CUP 069—2015 
V 
引  言 
本规范是为TEEI固件编程接口和协议制定的规范说明书。本规范包括：通用服务API、TEEI服务API
接口规范，本规范是在TEEI平台上开发TEE或内置可信服务的主要参考规范。 
 
中国银联 
版权所有

---
**[p8]**

Q/CUP 069—2015 
1 
中国银联可信执行环境集成（TEEI）技术规范                 
第5 部分 固件编程接口规范 
1 范围 
本规范主要描述了可信虚拟机的固件接口的概念和内容，目的在于为基于TEEI平台进行可信服务开
发的开发者更方便的和各种外部服务系统进行对接。规范的主要内容可分为以下几部分内容：通用服务
API、TEEI服务API以及标准C库和扩展C库。 
本规范适用于由金融机构发行的POS机、手机厂商发行的智能手机和其他智能终端。适用对象包括
与POS机、智能手机和其他智能终端的设计、生产、发行、受理以及应用系统的研制、开发、集成和维
护等相关部门。 
2 规范性引用文件 
下列文件中的条款通过本规范的引用而成为本规范的条款。凡是注明日期的引用文件，其随后所有
的修改单（不包括勘误的内容）或修订版均不适用于本规范，然而，鼓励根据本规范达成协议的各方研
究是否可使用这些文件的最新版本。凡是不注明日期的引用文件，其最新版本适用于本规范。 
中国银联可信执行环境集成（TEEI）技术规范第1 部分：  《整体架构规范》 
中国银联可信执行环境集成（TEEI）技术规范第2 部分 
《可信硬件规范》 
中国银联可信执行环境集成（TEEI）技术规范第3 部分 
《可信虚拟机规范》 
中国银联可信执行环境集成（TEEI）技术规范第4 部分 
《可信网络规范》 
中国银联可信执行环境集成（TEEI）技术规范第6 部分 
《内置可信服务规范》 
ISO/IEC 9899:1999 
Programming languages – C 
3 术语与定义 
3.1 虚拟机镜像 
打包成一个完整程序包的虚拟机的执行代码，虚拟机镜像有开发者进行打包，由TEEI平台负责载入
执行。 
3.2 设备 
虚拟机的外部设备，类似于一个独立计算机的外部设备，例如屏幕、存储、网络等设备。 
4 符号与缩略语 
DS 
Directory Service，目录服务 
IA 
Identity Authentication，身份认证服务 
中国银联 
版权所有

---
**[p9]**

Q/CUP 069—2015 
2 
TS 
Trusted Storage，可信存储服务 
AM 
Arithmetical，算术服务 
CP 
Cryptographic，密码学服务 
TUI 
Trusted User Interface，可信用户界面 
SS 
Secure Socket，安全Socket 服务 
NFC 
Near Field Communication，近场通信 
SE 
Secure Element，安全元件 
5 固件编程接口概述 
TEEI平台为运行在其之上的软件提供独立的虚拟机环境，开发者可以在此基础上直接利用TEEI虚拟
机接口进行GuestOS/TEE的开发，这种开发灵活性高但是难度较大。为了便于开发者开发，TEEI在TEEI
虚拟机接口的基础上提供了TEEI虚拟机固件接口以便加快开发过程。 
如下图所示，其中灰色背景的部分即为TEEI虚拟机固件接口，其主要内容包括通用服务、C标准库/
扩展库以及TEEI服务。 
 
图 5–1 固件编程接口 
中国银联 
版权所有

---
**[p10]**

Q/CUP 069—2015 
3 
6 共通定义 
6.1 头文件 
使用共通定义需要声明 “teei_platform_base_api.h”头文件。 
#include “teei_platform_base_api.h” 
6.2 响应状态值 
表6-1 响应状态值 
常量名和别名 
值 
描述 
TEEI_SUCCESS 
0x00000000 
操作成功 
TEEI_ERROR_INTERNAL 
0x00000001 
内部错误 
TEEI_ERROR_RESOURCE_LIMIT 
0x00000002 
资源限制 
TEEI_ERROR_DEVICE_BUSY 
0x00000003 
设备忙 
TEEI_ERROR_DEVICE_HANDLE_INVALID 
0x00000004 
设备句柄不合法 
TEEI_ERROR_DEVICE_OVERFLOW 
0x00000005 
超出设备能力 
TEEI_ERROR_DEVICE_EVENT_INVALID 
0x00000006 
设备事件不合法 
TEEI_ERROR_TA_NOT_EXIST 
0x00000009 
TA 不存在 
TEEI_ERROR_HOST_NAME_EXIST 
0x0000000a 
同名主机已经存在 
TEEI_ERROR_HOST_NOT_EXIST 
0x0000000b 
主机不存在 
TEEI_ERROR_GATE_NOT_EXIST 
0x0000000c 
Gate 不存在 
TEEI_ERROR_PIPE_CREATE_DENIED 
0x0000000d 
同名主机已经存在 
TEEI_ERROR_PIPE_BUSY 
0x0000000e 
Pipe 正在使用中 
TEEI_ERROR_NETWORK_ERROR 
0x00000010 
网络不可用 
TEEI_ERROR_CIPHERTEXT_ERROR 
0x00000011 
密文错误 
TEEI_ERROR_UNIQUE_CONFLICT 
0x00000012 
唯一性冲突 
TEEI_ERROR_CORRUPT_OBJECT 
0xF0100001 
对象损坏 
TEEI_ERROR_STORAGE_NOT_AVAILABLE 
0xF0100003 
对象所在的存储区域无法访问 
TEEI_ERROR_GENERIC  
0xFFFF0000 
一般错误 
TEEI_ERROR_ACCESS_DENIED  
0xFFFF0001 
拒绝访问 
TEEI_ERROR_CANCEL  
0xFFFF0002 
取消 
TEEI_ERROR_ACCESS_CONFLICT  
0xFFFF0003 
访问冲突 
中国银联 
版权所有

---
**[p11]**

Q/CUP 069—2015 
4 
常量名和别名 
值 
描述 
TEEI_ERROR_EXCESS_DATA  
0xFFFF0004 
多余的数据 
TEEI_ERROR_BAD_FORMAT  
0xFFFF0005 
格式错误 
TEEI_ERROR_BAD_PARAMETERS  
0xFFFF0006 
参数错误 
TEEI_ERROR_BAD_STATE  
0xFFFF0007 
状态错误 
TEEI_ERROR_ITEM_NOT_FOUND  
0xFFFF0008 
条目未发现 
TEEI_ERROR_NOT_IMPLEMENTED  
0xFFFF0009 
未实现 
TEEI_ERROR_NOT_SUPPORTED  
0xFFFF000A 
不支持 
TEEI_ERROR_NO_DATA  
0xFFFF000B 
无数据 
TEEI_ERROR_OUT_OF_MEMORY  
0xFFFF000C 
内存溢出 
TEEI_ERROR_BUSY  
0xFFFF000D 
资源忙 
TEEI_ERROR_COMMUNICATION  
0xFFFF000E 
通信错误 
TEEI_ERROR_SECURITY  
0xFFFF000F 
安全错误 
TEEI_ERROR_SHORT_BUFFER  
0xFFFF0010 
缓冲区不足 
TEEI_PENDING  
0xFFFF2000 
等待 
TEEI_ERROR_TIMEOUT  
0xFFFF3001 
超时 
TEEI_ERROR_OVERFLOW  
0xFFFF300F 
溢出 
TEEI_ERROR_TARGET_DEAD  
0xFFFF3024 
访问目标发生异常 
TEEI_ERROR_STORAGE_NO_SPACE  
0xFFFF3041 
无存储空间 
TEEI_ERROR_MAC_INVALID  
0xFFFF3071 
MAC 不合法 
TEEI_ERROR_SIGNATURE_INVALID  
0xFFFF3072 
签名不合法 
TEEI_ERROR_TIME_NOT_SET  
0xFFFF5000 
条目未设置 
TEEI_ERROR_TIME_NEEDS_RESET  
0xFFFF5001 
需要重置 
TEEI_ERROR_PROTOCOL 
0xFFFF6001 
协议错误 
TEEI_ERROR_REMOTE_CLOSED 
0xFFFF6002 
远端关闭连接 
TEEI_ERROR_HOSTNAME 
0xFFFF6003 
远端服务器主机名错误 
TEEI_ERROR_NFC_TECHNOLOGY_MODE 
0xFFFF6004 
NFC 技术和模式错误 
中国银联 
版权所有

---
**[p12]**

Q/CUP 069—2015 
5 
6.3 数据类型 
6.3.1 基本类型 
本规范利用C99规范（ISO/IEC 9899:1999）中的C语言类型来进行整数和布尔类型的定义，使用基
本数据类型有以下几种： 
uint32_t: 无符号的32 位整数； 
int32_t:  有符号的32 位整数； 
uint16_t: 无符号的16 位整数； 
int16_t:  有符号的16 位整数； 
uint8_t:  无符号的8 位整数； 
int8_t:   有符号的8 位整数； 
bool:     true 和false 的布尔类型； 
char:     0 结尾、UTF-8 编码的一个字符； 
size_t:   大到足够容纳对象在内存中大小的无符号整数。 
本规范中，所有的数值都是小端序。 
6.3.2 TEEI_Result 
typedef uint32_t TEEI_Result; 
——描述： 
用于表示调用API函数的返回结果。 
6.3.3 TEEI_HostInfo 
typedef struct 
{ 
uint8_t host_ID; 
char* hostName; 
char* description; 
}TEEI_HostInfo; 
——描述： 
用于TEEI主机信息。 
6.3.4 TEEI_SHCP_Key 
typedef struct 
{ 
uint16_t sequenceCounter; 
char rand[6]; 
}TEEI_SHCP_Key; 
中国银联 
版权所有

---
**[p13]**

Q/CUP 069—2015 
6 
——描述： 
用于安全HHCP通信的密钥信息。 
6.3.5 TEEI_DeviceHandle 
typedef struct __TEEI_DeviceHandle* TEEI_DeviceHandle; 
——描述： 
用于描述和操作TEEI设备的句柄。 
6.3.6 TEE_Host 
typedef struct 
{ 
uint8_t host_ID; 
<实现定义的类型>imp; 
}TEE_Host; 
——描述： 
用于定义所连接到的TEE主机的信息。 
6.3.7 TEE_Pipe 
typedef struct 
{ 
uint8_t pipe_ID; 
<实现定义的类型>imp; 
}TEE_Pipe; 
——描述： 
用于记录TA所使用的pipe信息。 
6.3.8 TEEI_UUID 
typedef struct 
{ 
uint32_ttimeLow; 
uint16_t timeMid; 
uint16_t timeHiAndVersion; 
uint8_tclockSeqAndNode[8]; 
}TEEI_UUID; 
——描述： 
可信模块的唯一识别码。 
中国银联 
版权所有

---
**[p14]**

Q/CUP 069—2015 
7 
6.3.9 TEE_Message 
typedef struct 
{ 
<实现定义的类型>imp; 
}TEE_Message; 
——描述： 
用于记录TA所要发送或接收的消息和数据。 
6.4 参数注释 
6.4.1 [in]，[out]和[inout] 
[in]输入、[out]输出、[inout]输入/输出。 
6.4.2 [outopt] 
可选输出。 
6.4.3 [inbuf] 
输入缓冲区。 
6.4.4 [outbuf] 
输出缓冲区。 
6.4.5 [outbufopt] 
可选输出缓冲区。 
6.4.6 [instring]和[instringopt] 
输入字符串和可选输入字符串。 
6.4.7 [outstring]和[outstringopt] 
输出字符串和可选输出字符串。 
6.4.8 [ctx] 
隐含为void*类型参数。 
中国银联 
版权所有

---
**[p15]**

Q/CUP 069—2015 
8 
6.5 异常 
6.5.1 TEEI_Panic 
void TEEI_Panic(TEEI_Result panicCode); 
——描述： 
产生异常。 
——参数： 
panicCode:异常代码。 
7 通用服务API 
通用服务API为运行在可信虚拟机上可信服务的开发者提供虚拟机级别服务的API接口，开发者可以
使用这些接口实现对虚拟机实例、以及虚拟机镜像的管理。 
7.1 头文件 
调用通用服务API之前需要声明 “teei_platform_common_api.h”头文件。 
#include “teei_platform_common_api.h” 
7.2 证书服务 
7.2.1 TEEI_TVMCertType 
typedef enum { 
TVM_CERT_TYPE_ROOT_KEY,//TVM根密钥证书，自签名 
TVM_CERT_TYPE_IMAGE_SIGN_KEY//TVM镜像签名密钥证书，根密钥签名 
} TEEI_TVMCertType; 
——描述： 
TVM证书类型。 
7.2.2 TEEI_TVMCert 
typedef struct {  
uint32_t size; //证书内容大小 
    void*certificate; //证书内容 
} TEEI_TVMCert; 
——描述： 
证书的内容。 
中国银联 
版权所有

---
**[p16]**

Q/CUP 069—2015 
9 
7.2.3 TEEI_GetTVMCert 
TEEI_Result TEEI_GetTVMCert( 
TEEI_TVMCertType type,  
TEEI_TVMCert* cert); 
——描述： 
获取TVM的证书列表。 
——参数： 
type:证书类型。 
cert:证书内容。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果没有足够的空间来执行操作，返回值为TEEI_ERROR_OUT_OF_MEMORY。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
7.2.4 TEEI_UpdateTVMCert 
TEEI_Result TEEI_UpdateTVMCert( 
TEEI_TVMCertType type,  
TEEI_TVMCert* cert); 
——描述： 
更新TVM证书。 
——参数： 
type: 证书类型。 
cert:证书信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
7.3 镜像服务API 
7.3.1 TEEI_UpdateTVMImage 
TEEI_Result TEEI_UpdateTVMImage(uint32_tsize, void*buffer); 
——描述： 
更新虚拟机镜像文件。 
中国银联 
版权所有

---
**[p17]**

Q/CUP 069—2015 
10 
镜像的格式是TEEI实现定义的，本规范不对格式进行规定。 
——参数： 
size:要更新的镜像大小。 
buffer:镜像内容。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果无足够的空间用于存储镜像，返回TEEI_ERROR_RESOURCE_LIMIT。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
7.3.2 TEEI_DeleteTVMImage 
TEEI_Result TEEI_DeleteTVMImage(); 
——描述： 
删除虚拟机镜像文件。 
——参数： 
无。 
——返回值： 
函数始终成功，返回值为TEEI_SUCCESS。 
7.4 机器服务API 
7.4.1 TEEI_ResetTVM 
TEEI_Result TEEI_ResetTVM(); 
——描述： 
重启虚拟机。 
——参数： 
无。 
——返回值： 
函数始终成功，返回值为TEEI_SUCCESS。 
7.4.2 TEEI_GetHUK 
TEEI_Result TEEI_GetHUK(uint32_t* huk); 
——描述： 
中国银联 
版权所有

---
**[p18]**

Q/CUP 069—2015 
11 
获得设备唯一密钥（HUK，Hardware Unique Key）。HUK相当于设备的主密钥，TEE或ITS实现可以
基于HUK派生自己的其他密钥。不同TVM使用该方法时获得HUK是不同的，并且无论何时调用该方法获得
HUK是相同的。 
——参数： 
huk:设备唯一密钥。 
——返回值： 
函数始终成功，返回值为TEEI_SUCCESS。 
7.5 属性服务API 
TEEI平台为运行在其之上的TAS提供有关TEEI平台本身的配置参数访问服务，TEEI的属性是一个键
值对的形式，开发者可以使用静态键值访问对应的属性值。对TAS来说TEEI属性只能读取不能修改，TEEI
预定义的属性如下表所示： 
表7-1TEEI 预定义的属性 
属性名 
类型 
描述 
org.teei.systemTime.protectionLevel 
整数 
100：REE 控制；1000：TEEI
控制 
org.teei.TVMPersistentTime.protectionLevel 
整数 
100：REE 控制；1000：TEEI
控制 
org.teei.apiversion 
字符串 
TEEI 版本 
org.teei.description 
字符串 
TEEI 描述 
org.teei.firmware.apiversion 
字符串 
设备固件版本 
org.teei.firmware.description 
字符串 
设备固件描述 
org.teei.firmware.manufacturer 
字符串 
设备固件制造商 
org.teei.deviceID 
UUID 
设备UUID 
org.teei.arith.maxBigIntSize 
整数 
最大整数大小 
org.teei.cryptography.ecc 
布尔 
是否支持ECC 密码学算法 
org.teei.trustedos.implementation.version 
字符串 
TEEI 可信OS 版本 
org.teei.trustedos.implementation.binaryversion 
二进制 
TEEI 可信OS 二进制版本 
org.teei.trustedos.manufacturer 
字符串 
TEEI 可信OS 制造商 
org.teei.tvm.firmware.implementation.version 
字符串 
TEEI 可信虚拟机固件版本 
org.teei.tvm.firmware.implementation.binaryversion 二进制 
TEEI 可信虚拟机固件二进制
版本 
中国银联 
版权所有

---
**[p19]**

Q/CUP 069—2015 
12 
7.5.1 TEEI_GetPropertyAsString 
TEEI_Result TEEI_GetPropertyAsString( 
char* name, char* buffer, uint32_t* size); 
——描述： 
获得字符串属性值。 
——参数： 
name:属性名。 
buffer:输出参数，保存的是字符串。 
size：输出参数，保存的是字符串的长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区大小不足，返回值为TEEI_ERROR_SHORT_BUFFER。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
7.5.2 TEEI_GetPropertyAsU32 
TEEI_Result TEEI_GetPropertyAsU32( 
char* name, uint32_t* value); 
——描述： 
获得无符号32位整型属性值。 
——参数： 
name:属性名。 
value:输出参数，保存属性值。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
7.5.3 TEEI_GetPropertyAsBoolean 
TEEI_Result TEEI_GetPropertyAsBoolean( 
char* name, bool* value); 
——描述： 
获得boolean属性值。 
——参数： 
name:属性名。 
中国银联 
版权所有

---
**[p20]**

Q/CUP 069—2015 
13 
value:输出参数，保存属性值。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
7.5.4 TEEI_GetPropertyAsUUID 
TEEI_Result TEEI_GetPropertyAsUUID( 
char* name, TEEI_UUID* uuid); 
——描述： 
获得TEEI设备的唯一标识。 
——参数： 
name:属性名。 
uuid:输出参数，保存的TEEI设备的唯一标识。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
7.5.5 TEEI_GetPropertyAsBinaryBlock 
TEEI_Result TEEI_GetPropertyAsBinaryBlock( 
char* name, void* buffer, uint32_t* size); 
——描述： 
获得二进制属性值。 
——参数： 
name:属性名。 
buffer:输出参数，保存的是二进制数据块。 
size：输出参数，保存的是二进制数据块长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区大小不足，返回值为TEEI_ERROR_SHORT_BUFFER。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8 TEEI 服务API 
TEEI服务API为运行在可信虚拟机上可信服务的开发者提供TEEI内部资源的访问接口，通过这些统
一的API接口，开发者可以访问连接在TEEI可信网络中的任意TEE中的TA以及任意内置可信服务。 
中国银联 
版权所有

---
**[p21]**

Q/CUP 069—2015 
14 
8.1 可信网络API 
8.1.1 头文件 
调用可信网络API之前需要声明 “teei_platform_tnet_api.h”头文件。 
#include “teei_platform_tnet_api.h” 
8.1.2 TEE 主机管理 
8.1.2.1 TEE_GetHostList 
TEEI_Result TEEI_GetHostList(uint32_t* size, TEEI_HostInfo**hosts); 
——描述： 
获得TEEI平台主机列表。 
——参数： 
size:输出参数，保存的是主机个数。 
hosts:输出参数，保存的是TEEI_HostInfo指针数组。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.2.2 TEE_RegisterHost 
TEEI_Result TEEI_RegisterHost(char* hostName, uint_8* hostID); 
——描述： 
注册TEE主机。 
——参数： 
hostName:要注册的主机名。 
hostID:输出参数，保存的是TEEI平台自动分配的主机ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果同名主机已经存在，返回值为TEEI_ERROR_HOST_NAME_EXIST。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.2.3 TEE_UnregisterHost 
TEEI_Result TEEI_UnregisterHost(uint8_t hostID); 
——描述： 
注销TEE主机。 
中国银联 
版权所有

---
**[p22]**

Q/CUP 069—2015 
15 
——参数： 
hostID:要注销的主机ID。 
——返回值： 
此函数始终成功完成，返回值为TEEI_SUCCESS。 
8.1.2.4 TEE_GetHostID 
TEEI_Result TEEI_GetHostID(char* hostName, uint8_t* hostID); 
——描述： 
获取TEE主机ID。 
——参数： 
hostName:要查询的主机名。 
hostID:输出参数，保存的是查询到的主机ID，如果未查到返回-1。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果同名主机已经存在，返回值为TEEI_ERROR_HOST_NAME_EXIST。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.3 Pipe 管理 
8.1.3.1 TEE_CreatePipe 
TEEI_Result TEE_CreatePipe( 
uint8_t targetHostID, 
uint8_t targetGateID, 
TEEI_UUID srcGateUUID, 
uint32_t pipeSize,  
uint8_t* pipeID); 
——描述： 
建立可信网络Pipe。 
——参数： 
targetHostID: 目标主机的ID。 
targetGateID:目标主机的Gate ID。 
srcGateUUID:发起创建请求主机的TA的UUID。 
pipeSize:字节表示的缓冲区长度，相当于通信带宽。 
pipeID:输出参数，保存的是创建好的Pipe ID，如果未成功返回-1。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
中国银联 
版权所有

---
**[p23]**

Q/CUP 069—2015 
16 
如果目标主机不存在，返回值为TEEI_ERROR_HOST_NOT_EXIST。 
如果目标主机的Gate不存在，返回值为TEEI_ERROR_GATE_NOT_EXIST。 
如果目标主机不运行访问，返回值为TEEI_ERROR_PIPE_CREATE_DENIED。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.3.2 TEE_DeletePipe 
TEEI_Result TEE_DeletePipe(uint8_t pipeID); 
——描述： 
删除可信网络Pipe。 
——参数： 
pipeID:要删除的Pipe ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果Pipe正在使用无法删除，返回值为TEEI_ERROR_PIPE_BUSY。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.4 主机访问控制管理 
8.1.4.1 TEE_AddWhiltelist 
TEEI_Result TEEI_AddWhitelist(uint8_t hostID); 
——描述： 
将受信任的TEE主机ID添加到白名单中。 
——参数： 
hostID:要添加到白名单中的受信任的主机ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.4.2 TEE_DeleteWhitelist 
TEEI_Result TEEI_DeleteWhitelist(uint8_t hostID); 
——描述： 
将TEE主机ID从白名单中删除。 
——参数： 
hostID:要删除的主机ID。 
中国银联 
版权所有

---
**[p24]**

Q/CUP 069—2015 
17 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.5 主机默认功能 
8.1.5.1 TEE_SetHostParameter 
TEEI_Result TEEI_SetHostParameter(uint8_t hostID,  
uint8_t parameterID, char* value); 
——描述： 
更新管理门注册表条目信息。 
——参数： 
hostID:访问的主机ID。 
parameterID:要设置的参数ID。 
value:条目信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数ID或参数值不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果指定的参数ID无权更新，返回值为TEEI_ERROR_ACCESS_DENIED。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.5.2 TEE_GetHostParameter 
TEEI_Result TEEI_GetHostParameter(uint8_t hostID,  
uint8_t parameterID, uint8_t* length, char* value); 
——描述： 
获取管理门注册表条目信息。 
——参数： 
gateID:访问的主机ID。 
parameterID:要设置的参数ID。 
length:输出参数，保存条目信息。 
value:输出参数，条目信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数ID或参数值不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果指定的参数ID无权访问，返回值为TEEI_ERROR_ACCESS_DENIED。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
中国银联 
版权所有

---
**[p25]**

Q/CUP 069—2015 
18 
8.1.5.3 TEE_GetGateID 
TEEI_Result TEEI_GetGateID( 
uint8_t hostID, 
TEEI_UUID* srcTaUUID, 
TEEI_UUID* destTaUUID, 
uint8_t* gateID); 
——描述： 
获取标识管理门注册表条目信息。 
——参数： 
hostID：要访问主机的ID。 
srcTaUUID:发起请求的TA 的UUID。 
destTaUUID:要查询的TA 的UUID。 
gateID:输出参数，保存TA 对应的Gate ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数ID或参数值不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.5.4 环回测试 
8.1.5.4.1 TEE_LookbackTest 
TEEI_Result TEEI_LookbackTest(uint8_t hostID, uint8_t gateID); 
——描述： 
提供对TEEI可信网络的环回测试服务。 
——参数： 
hostID:要测试的目标主机的ID。 
gateID:要测试的目标主机的Gate ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数ID或参数值不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果指定的目标主机或Gate无法访问，返回值为TEEI_ERROR_NETWORK_ERROR。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.6 安全HHCP 管理 
提供主机双方之间在传输层上的数据加密功能。 
中国银联 
版权所有

---
**[p26]**

Q/CUP 069—2015 
19 
8.1.6.1 TEE_SHCPInitContext 
TEEI_Result TEEI_SHCPInitContext(uint8_t pipeID); 
——描述： 
为创建安全Pipe初始化上下文。 
——参数： 
pipeID:要建立安全连接的Pipe ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数ID或参数值不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.6.2 TEE_SHCPCertificate 
TEEI_Result TEEI_SHCPCertificate(uint8_t pipeID,  
uint8_t length, void* bufferPK,  
uint8_t* targetLength, void* bufferTargetPK); 
——描述： 
验证加密通信用的公钥。 
——参数： 
pipeID:要建立安全连接的Pipe ID。 
length:公钥信息的长度。 
bufferPK:公钥信息。 
targetLength:目标主机的公钥信息长度。 
bufferTargetPK:目标主机的公钥信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数ID或参数值不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果指定的Pipe无法访问，返回值为TEEI_ERROR_NETWORK_ERROR。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.6.3 TEE_SHCPKeyExchange 
TEEI_Result TEEI_SHCPKeyExchange(uint8_t pipeID,  
TEEI_SHCP_Key* key,  
TEEI_SHCP_Key* targetKey); 
——描述： 
中国银联 
版权所有

---
**[p27]**

Q/CUP 069—2015 
20 
交换通信密钥。 
——参数： 
pipeID:要建立安全连接的Pipe ID。 
key:进行交换的密钥信息。 
targetKey:输出参数，保存目标主机提供的密钥信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数ID或参数值不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果指定的Pipe无法访问，返回值为TEEI_ERROR_NETWORK_ERROR。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.6.4 TEE_SHCPFinished 
TEEI_Result TEEI_SHCPFinished(uint8_t pipeID,  
uint8_t length, void* cyphertext,  
uint8_t* targetLength, void* targetCyphertext); 
——描述： 
验证密文，完成安全通道建立。 
——参数： 
pipeID:要建立安全连接的Pipe ID。 
length:用于验证的密文信息长度。 
cyphertext:用于验证的密文信息。 
targetLength:输出参数，保存目标主机提供的密文信息长度。 
targetCyphertext:输出参数，保存目标主机提供的密文信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数ID或参数值不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果指定的Pipe无法访问，返回值为TEEI_ERROR_NETWORK_ERROR。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.1.6.5 TEE_SHCPFinalizeContext 
TEEI_Result TEEI_SHCPFinalizeContext(uint8_t pipeID); 
——描述： 
销毁安全Pipe上下文。 
——参数： 
pipeID:建立安全连接的Pipe ID。 
中国银联 
版权所有

---
**[p28]**

Q/CUP 069—2015 
21 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果指定的参数ID或参数值不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.2 TA 访问API 
8.2.1 头文件 
调用TA访问API之前需要声明 “teei_platform_inter_tee_api.h”头文件。 
#include “teei_platform_inter_tee_api.h” 
 
8.2.2 TEEI_ConnectTA 
TEEI_Result TEEI_ConnectTA(TEE_Host* host_des, TEE_Pipe* pipe,  
TEEI_UUID* ta_src, TEEI_UUID* ta_des,  
uint8_t secure_pipe,  
TEE_Message* message, uint32_t bufferSize); 
——描述： 
连接TA。 
——参数： 
host_des:目标TEE主机信息。 
pipe: 用于保存创建的通信管道信息。 
ta_src:发起请求TEE主机的TA的TEEI_UUID信息。 
ta_des:目标TEE主机的TA的TEEI_UUID信息。 
secure_pipe:安全通道标识，1为创建安全通道，其他值创建非安全通道。 
message:创建连接所需的其他必要信息，由实现定义。 
bufferSize:字节表示的缓冲区长度，相当于通信带宽。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果无法连接到TEE主机，返回TEEI_ERROR_HOST_NOT_EXIST。 
如果无法连接到TA，返回TEEI_ERROR_TA_NOT_EXIST。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.2.3 TEEI_DisConnectTA 
TEEI_Result TEEI_DisConnectTA(TEE_Pipe* pipe); 
——描述： 
关闭TA连接。 
中国银联 
版权所有

---
**[p29]**

Q/CUP 069—2015 
22 
——参数： 
pipe:已经创建的通信管道信息。 
——返回值： 
函数始终成功，返回值为TEEI_SUCCESS。 
8.2.4 TEEI_TransceiveData 
TEEI_Result TEEI_TransceiveData(TEE_Pipe* pipe,  
uint8_t secure_pipe, TEE_Message* request, TEE_Message* response); 
——描述： 
发送数据。 
——参数： 
pipe:已经创建的通信管道信息。 
secure_pipe:安全通道标识，1为使用安全通道，其他值使用非安全通道。 
request:要发送的数据。 
response:接收到的数据。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果无法连接到TEE主机，返回TEEI_ERROR_HOST_NOT_EXIST。 
如果无法连接到TA，返回TEEI_ERROR_TA_NOT_EXIST。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL。 
8.3 基础服务API 
8.3.1 可信存储API 
8.3.1.1 概述 
TEEI的可信存储服务包括TEE的私有存储空间及网络存储空间。TEEI中部署的每个TEE都有独立的私
有存储空间。同时，为了扩展TEE的存储资源以及共享需要，TEEI还为TEE提供了网络存储空间，即为可
信存储服务SPI提供的存储空间。——可信存储服务SPI提供的存储空间可以为TEE独有，也可以为多个
TEE共享。本节介绍了私有可信存储服务API的功能和设计概要。 
可信存储空间包括多个对象，每个对象由一个对象标识符来标识，该标识符是一个从0到64字节大
小的可变长度的二进制缓冲区。对象标识符可以包括任何类型，包括非打印字符对应的字节。对象可以
是一个加密密钥对象、一个密钥对对象、或是一个数据对象；每个对象都有一个类型，可精确地定义该
对象的内容。例如，对象类型可以是AES密钥、RSA密钥对、数据对象等；对象可以有一个相关联的数据
流。数据对象仅有一个数据流。各加密对象（即密钥或密钥对）有一个数据流、对象属性和元数据。 
8.3.1.2 头文件 
调用可信存储API之前需要声明 “teei_platform_storage_api.h”头文件。 
#include “teei_platform_storage_api.h” 
中国银联 
版权所有

---
**[p30]**

Q/CUP 069—2015 
23 
8.3.1.3 数据类型 
8.3.1.3.1 TS_Attribute 
typedef struct {  
uint32_t attributeID;  
union  
{  
struct  
{  
[inbuf] void* buffer; size_t length;  
} ref;  
struct  
{  
uint32_t a, b;  
} value;  
} content;  
} TS_Attribute; 
——描述： 
指定属性时传递此类型数组。 
8.3.1.3.2 TS_ObjectInfo 
typedef struct {  
uint32_t objectType;  
uint32_t objectSize;  
uint32_t maxObjectSize;  
uint32_t objectUsage;  
uint32_t dataSize;  
uint32_t dataPosition;  
uint32_t handleFlags;  
} TS_ObjectInfo; 
——描述： 
对象的描述信息。 
8.3.1.3.3 TS_ObjectHandle 
typedef struct __TS_ObjectHandle* TS_ObjectHandle 
——描述： 
对象句柄。 
中国银联 
版权所有

---
**[p31]**

Q/CUP 069—2015 
24 
8.3.1.3.4 TS_ObjectEnumeratorHandle 
typedef struct __TS_ObjectEnumHandle* TS_ObjectEnumHandle 
——描述： 
对象枚举句柄。 
8.3.1.3.5 TS_Whence 
typedef enum  
{  
TS_DATA_SEEK_SET = 0, 
TS_DATA_SEEK_CUR = 1, 
TS_DATA_SEEK_END = 2 
} TS_Whence; 
——描述： 
代表持久对象数据流的偏移量。 
8.3.1.4 常量 
与持久对象相关联的数据流中移动数据位置时可能存在的起始偏移量。 
表8-1 偏移量 
名称 
值 
TS_DATA_SEEK_SET 
0 
TS_DATA_SEEK_CUR 
1 
TS_DATA_SEEK_END 
2 
表8-2 对象存储常量 
名称 
值 
TS_STORAGE_PRIVATE 
0x00000001 
表8-3 数据标志常量 
名称 
值 
TS_DATA_FLAG_ACCESS_READ  
0x00000001 
TS_DATA_FLAG_ACCESS_WRITE  
0x00000002 
TS_DATA_FLAG_ACCESS_WRITE_META  
0x00000004 
中国银联 
版权所有

---
**[p32]**

Q/CUP 069—2015 
25 
TS_DATA_FLAG_SHARE_READ  
0x00000010 
TS_DATA_FLAG_SHARE_WRITE  
0x00000020 
TS_DATA_FLAG_CREATE  
0x00000200 
TS_DATA_FLAG_EXCLUSIVE  
0x00000400 
表8-4 用法常量 
名称 
值 
TS_USAGE_EXTRACTABLE  
0x00000001 
TS_USAGE_ENCRYPT   
0x00000002 
TS_USAGE_DECRYPT   
0x00000004 
TS_USAGE_MAC   
0x00000008 
TS_USAGE_SIGN   
0x00000010 
TS_USAGE_VERIFY   
0x00000020 
TS_USAGE_DERIVE  
0x00000040 
表8-5 索引标志常量 
名称 
值 
TS_INDEX_FLAG_PERSISTENT  
0x00010000 
TS_INDEX_FLAG_INITIALIZED  
0x00020000 
TS_INDEX_FLAG_KEY_SET  
0x00040000 
TS_INDEX_FLAG_EXPECT_TWO_KEYS  
0x00080000 
表8-6 操作常量 
名称 
值 
TS_OPERATION_CIPHER  
1 
TS_OPERATION_MAC  
2 
TS_OPERATION_AE  
4 
TS_OPERATION_DIGEST  
5 
TS_OPERATION_ASYMMETRIC_CIPHER  
6 
TS_OPERATION_ASYMMETRIC_SIGNATURE  
7 
TS_OPERATION_KEY_DERIVATION  
8 
中国银联 
版权所有

---
**[p33]**

Q/CUP 069—2015 
26 
表8-7 其它常量 
名称 
值 
TS_DATA_MAX_POSITION  
0xFFFFFFFF 
TS_OBJECT_ID_MAX_LEN  
64 
表8-8 对象类型列表 
名称 
标识符 
TS_TYPE_AES 
0xA0000010 
TS_TYPE_DES 
0xA0000011 
TS_TYPE_DES3 
0xA0000013 
TS_TYPE_HMAC_MD5 
0xA0000001 
TS_TYPE_HMAC_SHA1 
0xA0000002 
TS_TYPE_HMAC_SHA224 
0xA0000003 
TS_TYPE_HMAC_SHA256 
0xA0000004 
TS_TYPE_HMAC_SHA384 
0xA0000005 
TS_TYPE_HMAC_SHA512 
0xA0000006 
TS_TYPE_RSA_PUBLIC_KEY 
0xA0000030 
TS_TYPE_RSA_KEYPAIR 
0xA1000030 
TS_TYPE_DSA_PUBLIC_KEY 
0xA0000031 
TS_TYPE_DSA_KEYPAIR 
0xA1000031 
TS_TYPE_DH_KEYPAIR 
0xA1000032 
TS_TYPE_ECDSA_PUBLIC_KEY 
0xA0000041 
TS_TYPE_ECDSA_KEYPAIR 
0xA1000041 
TS_TYPE_ECDH_PUBLIC_KEY 
0xA0000042 
TS_TYPE_ECDH_KEYPAIR 
0xA1000042 
TS_TYPE_GENERIC_SECRET 
0xA0000000 
TS_TYPE_CORRUPTED_OBJECT 
0xA00000BE 
TS_TYPE_DATA 
0xA00000BF 
中国银联 
版权所有

---
**[p34]**

Q/CUP 069—2015 
27 
8.3.1.4.1 对象或操作属性 
表8-9 对象或操作属性 
名字 
值 
保护 
类型 
格式 
备注 
TS_ATTR_SECRET_VALUE  
0xC0000000 
保护的 
 
引用 
二进制 
 
用于所有的对
称加密、MAC 和
HMAC 安全密钥 
TS_ATTR_RSA_MODULUS 
0xD0000130 
公开 
引用 
大数 
 
TS_ATTR_RSA_PUBLIC_EXPONENT 
0xD0000230 
公开 
引用 
大数 
 
TS_ATTR_RSA_PRIVATE_EXPONENT 
0xC0000330 
保护的 
引用 
大数 
 
TS_ATTR_RSA_PRIME1 
0xC0000430 
保护的 
引用 
大数 
通常指p 
TS_ATTR_RSA_PRIME2 
0xC0000530 
保护的 
引用 
大数 
q 
TS_ATTR_RSA_EXPONENT1 
0xC0000630 
保护的 
引用 
大数 
dp 
TS_ATTR_RSA_EXPONENT2 
0xC0000730 
保护的 
引用 
大数 
dq 
TS_ATTR_RSA_COEFFICIENT 
0xC0000830 
保护的 
引用 
大数 
iq 
TS_ATTR_DSA_PRIME 
0xD0001031 
公开 
引用 
大数 
p 
TS_ATTR_DSA_SUBPRIME 
0xD0001131 
公开 
引用 
大数 
q 
TS_ATTR_DSA_BASE 
0xD0001231 
公开 
引用 
大数 
g 
TS_ATTR_DSA_PUBLIC_VALUE 
0xD0000131 
公开 
引用 
大数 
y 
TS_ATTR_DSA_PRIVATE_VALUE 
0xC0000231 
保护的 
引用 
大数 
x 
TS_ATTR_DH_PRIME 
0xD0001032 
公开 
引用 
大数 
p 
TS_ATTR_DH_SUBPRIME 
0xD0001132 
公开 
引用 
大数 
q 
TS_ATTR_DH_BASE 
0xD0001232 
公开 
引用 
大数 
g 
TS_ATTR_DH_X_BITS 
0xF0001332 
公开 
值 
整数 
l 
TS_ATTR_DH_PUBLIC_VALUE 
0xD0000132 
公开 
引用 
大数 
y 
TS_ATTR_DH_PRIVATE_VALUE 
0xC0000232 
保护的 
引用 
大数 
x 
TS_ATTR_RSA_OAEP_LABEL 
0xD0000930 
公开 
引用 
二进制 
 
TS_ATTR_RSA_PSS_SALT_LENGTH 
0xF0000A30 
公开 
值 
整数 
 
TS_ATTR_ECC_PUBLIC_VALUE_Y 
0xD0000241 
公开 
引用 
大数 
 
TS_ATTR_ECC_PUBLIC_VALUE_X 
0xD0000141 
公开 
引用 
大数 
 
TS_ATTR_ECC_PRIVATE_VALUE 
0xC0000341 
保护的 
引用 
大数 
d 
中国银联 
版权所有

---
**[p35]**

Q/CUP 069—2015 
28 
TS_ATTR_ECC_CURVE 
0xF0000441 
公开 
值 
整数 
参考表9-9 
表8-10 属性格式定义 
格式 
描述 
二进制 
无符号字节数组 
大数 
大端序二进制格式的无符号大数 
允许前导多个空字节 
整数 
从参数a 读取或返回的单整数值属性 
表8-11 属性ID 的部分结构 
位 
功能 
值 
Bit[29] 
定义属性是一个缓冲区还是一个值 
0：缓冲区属性 
1：值属性 
Bit[28] 
定义属性是保护的还是公开 
0：保护的属性 
1：公开的属性 
受保护的属性值不能被摘出，除非对象有TS_USAGE_EXTRACTABLE标志位。 
表8-12 属性ID 标志位 
名字 
值 
TS_ATTR_FLAG_VALUE  
0x20000000  
TS_ATTR_FLAG_PUBLIC  
0x10000000  
分别表示bit[29]和bit[28]的常数，用于帮助解码属性ID。 
8.3.1.5 服务上下文 
8.3.1.5.1 TS_Initialize 
TEEI_ResultTS_Initialize(); 
——描述： 
初始化一个服务访问的上下文。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
中国银联 
版权所有

---
**[p36]**

Q/CUP 069—2015 
29 
8.3.1.5.2 TS_Finalize 
voidTS_Finalize(); 
——描述： 
清理服务访问的上下文。 
——参数： 
无。 
8.3.1.6 通用对象函数 
8.3.1.6.1 TS_GetObjectInfo 
void TS_GetObjectInfo(  
TS_ObjectHandle object,  
[out] TS_ObjectInfo* objectInfo  
) 
——描述： 
获取对象特征信息。 
——参数： 
object: 该对象句柄。 
objectInfo:指向填入该对象信息的结构体的指针。 
——返回值： 
无。 
8.3.1.6.2 TS_RestrictObjectUsage 
void TS_RestrictObjectUsage(  
TS_ObjectHandle object,  
uint32_t objectUsage  
) 
——描述： 
限制对象使用标识。 
——参数： 
object:对象句柄。 
objectUsage: 新的对象用法， TS_USAGE_XXX常量的一个或多个的“或”组合，具体定义参见表9-4。 
——返回值： 
无。 
中国银联 
版权所有

---
**[p37]**

Q/CUP 069—2015 
30 
8.3.1.6.3 TS_GetObjectBufferAttribute 
TEEI_Result TS_GetObjectBufferAttribute(  
TS_ObjectHandle object,  
uint32_t attributeID,  
[outbuf] void* buffer, size_t* size  
) 
——描述： 
从对象中提取一个缓冲区属性。 
——参数： 
object: 对象句柄。 
attributeID:要检索的该属性标识符。 
buffer, size:获得该属性内容的输出缓冲区。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
未找到该属性，返回值为TEEI_ERROR_ITEM_NOT_FOUND。 
缓冲区太小，返回值为TEEI_ ERROR_SHORT_BUFFER。 
8.3.1.6.4 TS_GetObjectValueAttribute 
TEEI_Result TS_GetObjectValueAttribute(  
TS_ObjectHandle object,  
uint32_t attributeID,  
[outopt] uint32_t* a,  
[outopt] uint32_t* b  
) 
——描述： 
从对象中提取一个值属性。 
——参数： 
object: 对象句柄。 
attributeID: 要检索的该属性标识符。 
a, b:填入属性字段a和b的占位符指针。如果对应的字段不是调用者所需要的，则每个都可以是
NULL。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
未找到该属性,返回值为TEEI_ERROR_ITEM_NOT_FOUND。 
容器不可提取，返回值为TEEI_ERROR_ACCESS_DENIED。 
中国银联 
版权所有

---
**[p38]**

Q/CUP 069—2015 
31 
 
8.3.1.6.5 TS_CloseObject 
void TS_CloseObject( TS_ObjectHandle object) 
——描述： 
关闭已开启的对象。 
——参数： 
object:要关闭的对象句柄。 
——返回值： 
无。 
8.3.1.7 临时对象函数 
8.3.1.7.1 TS_AllocateTransientObject 
TEEI_Result TS_AllocateTransientObject(  
uint32_t objectType,  
uint32_t maxObjectSize,  
[out] TS_ObjectHandle* object  
) 
——描述： 
分配一个未初始化的临时对象，即各属性的容器。临时对象用于存放加密对象（密钥或密钥对）。
必须指定该对象类型和最大的对象特性数，以使能够预先分配所有容器资源。 
分配的容器是未初始化的。它可以通过下面的操作来完成初始化：从可信存储器导入该对象信息、
生成一个对象、导出一个对象或者加载一个对象。 
与该容器相关联的密钥用法的初始值是0xFFFFFFFF，这表示其包含了所有的使用标志。可以用操作
TS_RestrictObjectUsage限制容器的使用。 
表8-13TS_AllocateTransientObject 和对象大小 
对象类型 
对象大小的可能值 
TS_TYPE_AES  
128 位, 192 位, 或 256 位。 
TS_TYPE_DES  
始终是56 位。 
TS_TYPE_DES3  
112 位或168 位。 
TS_TYPE_HMAC_MD5  
在64 位和512 位之间，且是8 位的整数倍。 
TS_TYPE_HMAC_SHA1  
在80 位和512 位之间，且是8 位的整数倍。 
TS_TYPE_HMAC_SHA224  
在112 位和512 位之间，且是8 位的整数倍。 
中国银联 
版权所有

---
**[p39]**

Q/CUP 069—2015 
32 
对象类型 
对象大小的可能值 
TS_TYPE_HMAC_SHA256  
在192 位和1024 位之间，且是8 位的整数倍。 
TS_TYPE_HMAC_SHA384  
在256 位和1024 位之间，且是8 位的整数倍。 
TS_TYPE_HMAC_SHA512  
在256 位和1024 位之间，且是8 位的整数倍。 
TS_TYPE_RSA_PUBLIC_KEY  
对象的大小是以模数内的位数为单位的。 
所有密钥大小必须支持最多2048 位。要支持更大的密钥大小，
这取决于实现。密钥大小最小值为256 位。 
TS_TYPE_RSA_KEYPAIR  
与RSA 公开密钥大小相同。 
TS_TYPE_DSA_PUBLIC_KEY  
在512 位和1024 位之间，且是64 位的整数倍。 
TS_TYPE_DSA_KEYPAIR  
TS_TYPE_DH_KEYPAIR  
在256 位到2048 位范围内。 
——参数： 
objectType: 要创建的未初始化对象容器的类型。 
maxObjectSize: 对象的大小。此参数的解释取决于该对象类型，在上面的表5-7中有具体定义。 
object:在新创建的密钥容器内填入的句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
内存溢出，返回值为TEEI_ERROR_OUT_OF_MEMORY。 
不支持的对象大小，返回值为TEEI_ERROR_NOT_SUPPORTED。 
8.3.1.7.2 TS_FreeTransientObject 
void TS_FreeTransientObject(  
TS_ObjectHandle object  
) 
——描述： 
释放一个由操作TS_AllocateTransientObject预先分配的临时对象。 
——参数： 
object: 要释放的对象句柄。 
——返回值： 
无。 
8.3.1.7.3 TS_ResetTransientObject 
void TS_ResetTransientObject(  
中国银联 
版权所有

---
**[p40]**

Q/CUP 069—2015 
33 
TS_ObjectHandle object  
) 
——描述： 
将临时对象重置为其分配后的初始状态。如果该对象当前已经初始化，则此操作会清除对象的所有
信息。然后该对象会再次回到未初始化状态。 
在任何情况下，此操作都会将容器的密钥用法重置为0xFFFFFFFFF。 
——参数： 
object: 要重置的临时对象句柄。 
——返回值： 
无。 
8.3.1.7.4 TS_PopulateTransientObject 
TEEI_Result TS_PopulateTransientObject(  
TS_ObjectHandle object,  
[in] TS_Attribute* attrs, uint32_t attrCount  
) 
——描述： 
将TA在请求消息体attrs中传递的对象属性填入一个未初始化的对象容器中。 
当执行此操作时，对象必须是未初始化的。如果对象已经初始化，则必须首先执行操作
TS_ResetTransientObject将其清除。 
请注意，如果对象类型是一个密钥对，则此操作会同时设置密钥对的私有和公有部分，attrs的解
释取决于该对象类型。 
表8-14TS_PopulateTransientObject: 支持的属性 
对象类型 
部分 
TS_TYPE_AES  
对于所有私密密钥对象，必须提供TS_ATTR_SECRET_VALUE。
其它部分可以忽略。 
对于TS_TYPE_DES 和TS_TYPE_DES3 关联到这个属性的缓冲区
必须包括奇偶校验位。 
TS_TYPE_DES  
TS_TYPE_DES3  
TS_TYPE_HMAC_MD5  
TS_TYPE_HMAC_SHA1  
TS_TYPE_HMAC_SHA224  
TS_TYPE_HMAC_SHA256  
TS_TYPE_HMAC_SHA384  
中国银联 
版权所有

---
**[p41]**

Q/CUP 069—2015 
34 
对象类型 
部分 
TS_TYPE_HMAC_SHA512  
TS_TYPE_GENERIC_SECRET  
TS_TYPE_RSA_PUBLIC_KEY  
必须提供以下部分： 
TS_ATTR_RSA_MODULUS 
TS_ATTR_RSA_PUBLIC_EXPONENT 
TS_TYPE_RSA_KEYPAIR  
必须提供以下部分： 
TS_ATTR_RSA_MODULUS 
TS_ATTR_RSA_PUBLIC_EXPONENT 
TS_ATTR_RSA_PRIVATE_EXPONENT 
 
CRT 参数是可选的。如果提供了上述部分中的任何一个，则
也必须提供所有下面这些部分： 
TS_ATTR_RSA_PRIME1 
TS_ATTR_RSA_PRIME2 
TS_ATTR_RSA_EXPONENT1 
TS_ATTR_RSA_EXPONENT2 
TS_ATTR_RSA_COEFFICIENT 
TS_TYPE_DSA_PUBLIC_KEY  
必须提供以下部分： 
TS_ATTR_DSA_PRIME 
TS_ATTR_DSA_SUBPRIME 
TS_ATTR_DSA_BASE 
TS_ATTR_DSA_PUBLIC_VALUE 
TS_TYPE_DSA_KEYPAIR  
必须提供以下部分： 
TS_ATTR_DSA_PRIME 
TS_ATTR_DSA_SUBPRIME 
TS_ATTR_DSA_BASE 
TS_ATTR_DSA_PRIVATE_VALUE 
TS_ATTR_DSA_PUBLIC_VALUE 
中国银联 
版权所有

---
**[p42]**

Q/CUP 069—2015 
35 
对象类型 
部分 
TS_TYPE_DH_KEYPAIR  
必须提供以下部分： 
TS_ATTR_DH_PRIME 
TS_ATTR_DH_BASE 
TS_ATTR_DH_PUBLIC_VALUE 
TS_ATTR_DH_PRIVATE_VALUE 
 
也可以选择提供TS_ATTR_DH_SUBPRIME。 
——参数： 
object: 已经创建的临时的未初始化对象句柄。 
attrs, attrCount: 对象属性数组。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
不正确的属性值，返回值为TEEI_ERROR_BAD_PARAMETERS。 
8.3.1.7.5 TS_InitRefAttribute 
void TS_InitRefAttribute(  
[out] TS_Attribute* attr,  
uint32_t attributeID  
[inbuf] void* buffer, size_t length  
) 
——描述： 
将一个缓冲区引用填入单个属性。 
注意，仅当复制的是缓冲器指针而不是该缓冲器的内容时，使用该操作。 
——参数： 
attr:对象属性。 
attributeID:要检索的该属性标识符。 
buffer,length:缓冲区长度。 
——返回值： 
无。 
8.3.1.7.6 TS_InitValueAttribute 
void TS_InitValueAttribute(  
[out] TS_Attribute* attr,  
uint32_t attributeID  
中国银联 
版权所有

---
**[p43]**

Q/CUP 069—2015 
36 
uint32_t a, b  
) 
——描述： 
将一个整数值填入单个属性。 
——参数： 
attr:对象属性。 
attributeID:要检索的该属性标识符。 
a,b:值属性。 
——返回值： 
无。 
8.3.1.7.7 TS_CopyObjectAttributes 
void TS_CopyObjectAttributes(  
TS_ObjectHandle destObject,  
TS_ObjectHandle srcObject  
) 
——描述： 
将一个对象的所有属性填入一个未初始化的对象中。即，它将srcObject的属性填入destObject的
属性中。此操作特别适用于以下情况： 
要从一个密钥对对象提取该公开密钥的所有属性； 
要将一个持久对象的所有属性复制到一个临时对象中。 
destObject必须引用未初始化的对象，且必须是一个临时对象。 
源对象和目标对象都必须具有可兼容的类型和大小，具体含义如下： 
destObject 的类型必须是srcObject 的一个子类型，即下面的其中一个条件必须为真： 
destObject 的类型等于srcObject 的类型。 
destObject
的类型是
TS_TYPE_RSA_PUBLIC_KEY ，且
srcObject
的类型是
TS_TYPE_RSA_KEYPAIR。 
destObject
的类型是
TS_TYPE_DSA_PUBLIC_KEY ，且
srcObject
的类型是
TS_TYPE_DSA_KEYPAIR。 
srcObject 的大小必须小于等于destObject 的大小的最大值。 
除了属性取自srcObject 而非参数，此操作对destObject 的作用与操作
TS_PopulateTransientObject是相同的。 
destObject的对象用法被设置为，destObject的当前对象用法和srcObject的对象用法按位“与”
后的结果。 
此操作不会失败，但如果源对象和目标对象不兼容，或者状态不正确，则可能会发生严重异常。 
——参数： 
destObject: 未初始化的临时对象句柄。 
srcObject: 已初始化的对象句柄。 
中国银联 
版权所有

---
**[p44]**

Q/CUP 069—2015 
37 
——返回值： 
无。 
8.3.1.7.8 TS_GenerateKey 
TEEI_Result TS_GenerateKey(  
TS_ObjectHandle object,  
uint32_t keySize,  
[in] TS_Attribute* params, uint32_t paramCount,  
) 
——描述： 
生成一个随机密钥或密钥对，并将该生成的密钥信息填入一个临时密钥对象。 
所需密钥的大小被传递到参数keySize中，且一定要小于该临时对象的大小的最大值。生成算法可
以带有依赖于对象类型的参数。 
表8-15TS_GenerateKey 参数 
对象类型 
详细 
TS_TYPE_AES  
每有任何参数是必需的。操作会生成属性
TS_ATTR_SECRET_VALUE。 
TS_TYPE_DES  
TS_TYPE_DES3  
TS_TYPE_HMAC_MD5  
TS_TYPE_HMAC_SHA1  
TS_TYPE_HMAC_SHA224  
TS_TYPE_HMAC_SHA256  
TS_TYPE_HMAC_SHA384  
TS_TYPE_HMAC_SHA512  
TS_TYPE_GENERIC_SECRET  
中国银联 
版权所有

---
**[p45]**

Q/CUP 069—2015 
38 
对象类型 
详细 
TS_TYPE_RSA_KEYPAIR  
 
没有任何参数是必需的。此操作生成并填入如下属性： 
TS_ATTR_RSA_MODULUS 
TS_ATTR_RSA_PUBLIC_EXPONENT 
TS_ATTR_RSA_PRIVATE_EXPONENT 
TS_ATTR_RSA_PRIME1 
TS_ATTR_RSA_PRIME2 
TS_ATTR_RSA_EXPONENT1 
TS_ATTR_RSA_EXPONENT2 
TS_ATTR_RSA_COEFFICIENT 
TS_TYPE_DSA_KEYPAIR  
 
下面的域参数必须传递到此操作。 
TS_ATTR_DSA_PRIME 
TS_ATTR_DSA_SUBPRIME 
TS_ATTR_DSA_BASE 
 
此操作生成和填入如下属性: 
TS_ATTR_DSA_PUBLIC_VALUE 
TS_ATTR_DSA_PRIVATE_VALUE 
TS_TYPE_DH_KEYPAIR  
 
下面的域参数必须传递到此操作. 
TS_ATTR_DH_PRIME 
TS_ATTR_DH_BASE 
 
下面的参数可以有选择的传递: 
如果存在,则将私有值x 限制在[2, q-2]范围内。 
如果存在，则将私有值x 限制为有
位。 
如果没有指定这些可选部分中的任何一个，则对x 的唯一限制
是它要小于p-1。 
 
此操作生成和填入了如下属性： 
TS_ATTR_DH_PUBLIC_VALUE 
TS_ATTR_DH_PRIVATE_VALUE 
TS_ATTR_DH_X_BITS (number of bits in x) 
一旦该密钥信息已经生成，除了密钥信息是内部随机产生的而非执行者传递的以外，该临时对象将
被填入与操作TS_PopulateTransientObject一样的内容。 
中国银联 
版权所有

---
**[p46]**

Q/CUP 069—2015 
39 
——参数： 
object: 用已生成密钥填入的一个未初始化临时密钥的句柄。 
keySize: 要求的密钥大小。必须小于等于该对象容器大小的最大值。 
params, paramCount: 该密钥生成器的参数。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
不正确的属性值，返回值为TEEI_ERROR_BAD_PARAMETERS。 
8.3.1.8 持久对象函数 
8.3.1.8.1 TS_OpenPersistentObject 
TEEI_Result TS_OpenPersistentObject(  
uint32_t storageID,  
[in(objectIDLength)] void* objectID, size_t objectIDLen,  
uint32_t flags,  
[out] TS_ObjectHandle* object); 
——描述： 
开启一个既存的持久对象。返回一个对象索引，能够用于访问对象的属性和数据流。 
storageID参数表示访问的可信存储空间，可能的值有： 
TS_STORAGE_PRIVATE: 表示当前可信应用的私有可信存储。该可信应用的全部实例都可以访问这个
存储空间。 
flags参数是一组标志，用于控制已开启的对象索引的访问权限和共享权限。flags参数的值是遵照
如下列表逐位进行或运算获得的： 
访问控制标签： 
TS_DATA_FLAG_ACCESS_READ: 开启对象的读取访问权限。允许可信应用执行
TS_ReadObjectData 操作； 
TS_DATA_FLAG_ACCESS_WRITE: 开启对象的写入访问权限。允许可信应用执行
TS_WriteObjectData 和 TS_TruncateObjectData 操作； 
TS_DATA_FLAG_ACCESS_WRITE_META: 开启对象的write-meta 访问权限。允许可信应用执行
TS_CloseAndDeletePersistentObject 和 TS_RenamePersistentObject 操作。 
共享权限控制标志： 
TS_DATA_FLAG_SHARE_READ: 执行者允许另一个指向要创建的索引可以读取访问； 
TS_DATA_FLAG_SHARE_WRITE: 执行者允许另一个指向要创建的索引可以写入访问。 
其它标志被保留以供将来使用，并将被设置为0。 
可以同时开启指向同一个对象的多个索引，但必须明确共享。 
设置数据流的初始数据位置为0。 
——参数： 
storageID: 使用存储器，值必须是TS_STORAGE_PRIVATE。 
objectID, objectIDLen: 对象标识符。注意，该缓冲区不能够驻留共享内存。 
flags: 已开启对象的标签设定。 
中国银联 
版权所有

---
**[p47]**

Q/CUP 069—2015 
40 
object: 一个指向句柄的指针，包含成功完成后已开启的句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
未找到该属性，返回值为TEEI_ERROR_ITEM_NOT_FOUND。 
访问权限冲突，返回值为TEEI_ERROR_ACCESS_CONFLICT。 
内存溢出，返回值为TEEI_ERROR_OUT_OF_MEMORY。 
8.3.1.8.2 TS_CreatePersistentObject 
TEEI_Result TS_CreatePersistentObject(  
uint32_t storageID,  
[in(objectIDLength] void* objectID, size_t objectIDLen,  
uint32_t flags,  
TS_ObjectHandle attributes,  
[inbuf] void* initialData, size_t initialDataLen,  
[out] TS_ObjectHandle* object); 
——描述： 
创建一个附带初始化属性和初始化数据流内容的持久对象，并且可以有选择性的返回一个指向已创
建对象索引。 
storageID参数表示访问的可信存储空间，可能的值有： 
TS_STORAGE_PRIVATE: 表示当前可信应用的私有可信存储。该可信应用的全部实例都可以访问这
个存储空间。 
flags参数是一组标志，用于控制已开启的对象索引的访问权限和共享权限。flags参数的值是遵照
如下列表逐位进行或运算获得的： 
访问控制标签： 
TS_DATA_FLAG_ACCESS_READ: 开启对象的读取访问权限。允许可信应用执行
TS_ReadObjectData 操作； 
TS_DATA_FLAG_ACCESS_WRITE: 开启对象的写入访问权限。允许可信应用执行
TS_WriteObjectData 和 TS_TruncateObjectData 操作； 
TS_DATA_FLAG_ACCESS_WRITE_META: 开启对象的write-meta 访问权限。允许可信应用执行
TS_CloseAndDeletePersistentObject 和 TS_RenamePersistentObject 操作。 
共享权限控制标志： 
TS_DATA_FLAG_SHARE_READ: 执行者允许另一个指向要创建的索引可以读取访问。 
TS_DATA_FLAG_SHARE_WRITE: 执行者允许另一个指向要创建的索引可以写入访问。 
TS_DATA_FLAG_EXCLUSIVE: 如果对象不是既存的，则创建一个对象。否则返回错误
TS_ERROR_ACCESS_CONFLICT。详细如下表： 
表8-16 对象存在时TS_CreatePersistentObject 操作行为 
TS_DATA_FLAG_EXCLUSIVE 是否存在 
对象是否存在 
响应状态码 
否 
否 
TEEI_SUCCESS 
中国银联 
版权所有

---
**[p48]**

Q/CUP 069—2015 
41 
TS_DATA_FLAG_EXCLUSIVE 是否存在 
对象是否存在 
响应状态码 
否 
是 
TEEI_ERROR_ACCESS_CONFLICT 
是 
否 
TEEI_SUCCESS 
是 
是 
TEEI_SUCCESS 
其它标志被保留以供将来使用，并将被设置为0。 
从attributes获得新创建的持久对象的属性，该对象可能是另一个持久对象或者一个初始化瞬时对
象。该属性也可以是NULL（例如，对于一个纯数据对象）。对象类型、大小和用法都仿照attributes
参数。 
可以同时开启指向同一个对象的多个索引，但必须明确共享。 
设置数据流的初始数据位置为0。 
——参数： 
storageID: 使用存储器，值必须是TS_STORAGE_PRIVATE。 
objectID, objectIDLen: 对象标识符。注意，该缓冲区不能够驻留共享内存。 
flags: 已开启对象的标签设定。 
attributes:用于获得持久对象属性的一个持久对象或者一个初始化瞬时对象的句柄。 
initialData, initialDataLen: 持久对象的初始化数据内容。 
object: 一个指向句柄的指针，包含成功完成后已开启的句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
未找到该属性，返回值为TEEI_ERROR_ITEM_NOT_FOUND。 
访问权限冲突，返回值为TEEI_ERROR_ACCESS_CONFLICT。 
内存溢出，返回值为TEEI_ERROR_OUT_OF_MEMORY。 
没有足够存储空间，返回值为TEEI_ERROR_STORAGE_NO_SPACE。 
8.3.1.8.3 持久对象共享原则 
执行TS_OpenPersistentObject 或者TS_CreatePersistentObject操作时，可以同时开启多个索引
指向同一个对象，但是共享必须被明确地允许。更精确的是，在以下约束应用的任何一次：如果不止一
个索引被开启用于指向同一个对象，并且如果这些对象索引中的任何一个被开启使用标志
TS_DATA_FLAG_ACCESS_READ，那么所有对象索引必须用标志TS_DATA_FLAG_SHARE_READ启动。存在一个
对应的约束，标志为TS_DATA_FLAG ACCESS_WRITE 和TS_DATA_FLAG_SHARE_WRITE。访问一个附带
write-meta权限的对象是独有的并且不可能被共享的。 
当TS_OpenPersistentObject操作或者TS_CreatePersistentObject操作其中之一被执行时，如果开
启对象违反了这些约束，那么操作返回错误码TS_ERROR_ACCESS_CONFLICT。 
中国银联 
版权所有

---
**[p49]**

Q/CUP 069—2015 
42 
表8-17 TS_OpenPersistentObject 共享规则 
首次开启/创
建标志的值 
再次开启/创
建标志的值 
再次开启/创建
标志的返回码 
注释 
ACCESS_READ  
ACCESS_READ  ACCESS_CONFLICT 对象索引不使用SHARE_READ标志开启。只有
首次调用时能成功。 
ACCESS_READ | 
SHARE_ READ 
ACCESS_READ 
ACCESS_CONFLICT 不是所有对象索引使用SHARE_READ 标志开
启。只有首次调用时能成功。 
ACCESS_READ | 
SHARE_READ  
ACCESS_READ 
| SHARE_READ 
TS_SUCCESS 
所以对象索引都是使用SHARE_READ标志开启
的。 
ACCESS_READ 
ACCESS_WRITE ACCESS_CONFLICT 对象不是用共享标志开启的。只有第一次可
以成功执行。 
ACCESS_READ | 
SHARE_READ 
|ACCESS_WRITE 
ACCESS_WRITE 
| SHARE_READ 
|SHARE_WRITE 
TS_SUCCESS 
所以对象索引都是使用共享标志开启的。 
ACCESS_READ | 
SHARE_READ | 
ACCESS_WRITE 
| SHARE_WRITE 
ACCESS_WRITE 
_META 
ACCESS_CONFLICT write-meta 标志表示对一个对象的独立访
问。只有第一次可以成功执行。 
SHARE_READ 
ACCESS_WRITE 
| HARE_WRITE 
ACCESS_CONFLICT 只能由共享标志开启的对象，针对一个给定
模式，锁定访问对象。在这里，第一次执行
防止在写入模式下的后续访问。 
0 
ACCESS_READ 
| SHARE_READ 
ACCESS_CONFLICT 不使用标志开启一个对象，锁定所有后续的
试图访问的对象。只有第一次可以成功执行。 
8.3.1.8.4 TS_CloseAndDeletePersistentObject 
void TS_CloseAndDeletePersistentObject( TS_ObjectHandle object ) 
——描述： 
关闭和删除持久对象。 
对象索引必须使用write-meta访问权限开启，这意味着独立访问对象。 
——参数： 
object: 对象句柄 
——返回值： 
无。 
中国银联 
版权所有

---
**[p50]**

Q/CUP 069—2015 
43 
8.3.1.8.5 TS_RenamePersistentObject 
TEEI_Result TS_RenamePersistentObject(  
TS_ObjectHandle object,  
[in(newObjectIDLen)] void* newObjectID, size_t newObjectIDLen  
) 
——描述： 
改变对象的标识符。对象索引必须由write-meta访问权限开启，这意味着访问对象是独立的。 
——参数： 
object:对象句柄。 
newObjectID, newObjectIDLen:包含新对象标识符的缓冲区。标识符可以包含任意的字节，包括零
字节。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
访问权限冲突，返回值为TEEI_ERROR_ACCESS_CONFLICT。 
8.3.1.9 持久对象枚举函数 
8.3.1.9.1 TS_AllocatePersistentObjectEnumerator 
TEEI_Result TS_AllocatePersistentObjectEnumerator(  
[out] TS_ObjectEnumHandle* objectEnumerator ) 
——描述： 
分配指向对象枚举的索引。一旦一个对象枚举索引被分配完成，那么它可以重复使用多个枚举。 
——参数： 
objectEnumerator: 一个指针成功指向新分配的对象枚举或者句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
没有足够的内存分配给枚举句柄,返回值为TS_ERROR_OUT_OF_MEMORY。 
8.3.1.9.2 TS_FreePersistentObjectEnumerator 
voidTS_FreePersistentObjectEnumerator( 
TS_ObjectEnumHandle objectEnumerator ) 
——描述： 
释放全部关联对象枚举索引的资源。在执行该操作之后，此索引不再有效。 
——参数： 
中国银联 
版权所有

---
**[p51]**

Q/CUP 069—2015 
44 
objectEnumerator: 关闭句柄。 
——返回值： 
无。 
8.3.1.9.3 TS_ResetPersistentObjectEnumerator 
void TS_ResetPersistentObjectEnumerator( 
TS_ObjectEnumHandle objectEnumerator ) 
——描述： 
重置对象枚举索引为初始化状态，如果枚举已经开始，那么将被暂停。 
——参数： 
objectEnumerator: 重置句柄 
——返回值： 
无。 
8.3.1.9.4 TS_StartPersistentObjectEnumerator 
TEEI_Result TS_StartPersistentObjectEnumerator(  
TS_ObjectEnumHandle objectEnumerator,  
uint32_t storageID  
) 
——描述： 
启动既定可信存储中的所有持久对象的枚举。对象信息可以执行TS_GetNextPersistentObject操作
重新获得。 
枚举不一定要反映一个给定的相一致的存储状态：在枚举过程中，其它可信应用或者其它可信应用
的实例都可以创建、删除或者重命名对象。 
停止一个枚举，可信应用可以调用TS_ResetPersistentObjectEnumerator操作，从可信存储中分离
枚举。可信应用可以调用TS_FreePersistentObjectEnumerator操作释放对象枚举。 
如果当一个枚举已经被启动的时候调用该操作，那么首先重置该枚举然后再重启。 
——参数： 
objectEnumerator:一个指向对象枚举的有效句柄。 
storageID:存放枚举对象的存储器标识符。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
未找到该属性，返回值为TS_ERROR_ITEM_NOT_FOUND。 
中国银联 
版权所有

---
**[p52]**

Q/CUP 069—2015 
45 
8.3.1.9.5 TS_GetNextPersistentObject 
TEEI_Result TS_GetNextPersistentObject(  
TS_ObjectEnumHandle objectEnumerator,  
[out] TS_ObjectInfo* objectInfo,  
[out] void* objectID,  
[out] size_t* objectIDLen ) 
——描述： 
获得下一个枚举对象，并且返回该对象的信息：类型、大小、标识符，等等。 
如果不再有枚举对象，或者没有已启动的枚举，那么操作返回TS_ERROR_ITEM_NOT_FOUND。 
——参数： 
objectEnumerator: 一个指向对象枚举的句柄。 
objectInfo:一个TS_ObjectInfo类型，装载对象信息的指针。 
objectID:指针指向一个TS_OBJECT_ID_MAX_LEN字节长度的数组，存储对象标识符。 
objectIDLen: 存储对象标识符长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
未找到该属性，返回值为TS_ERROR_ITEM_NOT_FOUND。 
8.3.1.10 数据流访问函数 
8.3.1.10.1 TS_ReadObjectData 
TEEI_Result TS_ReadObjectData(  
TS_ObjectHandle object,  
[out] void* buffer,  
size_t size,  
[out] uint32_t* count ) 
——描述： 
从数据流中读取size字节，该数据流与存储在指针buffer指向的缓冲区中的对象object相一致。 
对象索引必须由读取访问权限开启。 
读取字节的起始位置是存储对象索引的数据流的当前位置。索引位置根据实际读取字节的数目递
增。 
实现TS_ReadObjectData设定实际读取的以uint32_t类型指向的字节数。写入到*count中的值可以
小于size，如果直到数据流的末端的字节数都小于size的话。如果读取位置在或者超出了数据流的末端，
那么设置为0。这是唯一一种*count值小于size的情况。 
没有数据传输能够通过当前数据流的末端。如果试图读取通过数据流末端，那么TS_ReadObjectData
操作将停止在数据流末端的数据读取，并且返回数据读取到这一点上。这样仍然是成功的。位置指示设
定在数据流的末端。如果在或者超出了数据末端，在此操作调用时，那么没有字节被拷贝给*buffer和
*count，并设置为0。 
中国银联 
版权所有

---
**[p53]**

Q/CUP 069—2015 
46 
——参数： 
object: 对象句柄。 
buffer: 在成功完成后，一个指向内存的指针包含读取的字节。 
size: 读取的字节数。 
count: 在成功完成后，一个包含读取字节的指针。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.3.1.10.2 TS_WriteObjectData 
TEEI_Result TS_WriteObjectData(  
TS_ObjectHandle object,  
[in] void* buffer, size_t size ) 
——描述： 
从buffer指向的缓冲区向数据流中写入size字节，该数据流与开启对象索引object相一致。 
对象必须由写入访问权限开启。 
如果当前数据位置指在数据流末端之前，那么size字节写入到数据流中，覆盖在当前数据位置开始
的字节。如果当前数据位置超出了数据流末端，那么数据流首先用０字节扩展，直到到达数据位置指示
所器所表示的长度，然后将size字节写入流。因此，从结果可见，数据流的大小可以增加。 
数据位置指示器是以size大小扩展的。为同一个对象开启的其它对象索引的数据位置指示器不可被
更改。 
写入数据流是一个原子；操作完全成功，或者不写入。 
——参数： 
object: 对象句柄。 
buffer: 包含写入数据的缓冲区。 
size:  写入的字节数。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
没有足够存储空间,返回值为TEEI_ERROR_STORAGE_NO_SPACE。 
8.3.1.10.3 TS_TruncateObjectData 
TEEI_Result TS_TruncateObjectData(  
TS_ObjectHandle object,  
uint32_t size ) 
——描述： 
改变数据流的大小。如果size小于当前数据流大小，那么所有超出size的字节将被删除。如果size
大于当前数据流大小，那么用０填充数据流，一直扩充到数据流末端。 
对象索引必须由写入访问许可开启。 
中国银联 
版权所有

---
**[p54]**

Q/CUP 069—2015 
47 
该操作不能够改变为对象开启的任何索引的数据位置。注意，如果这种索引的当前数据位置超过了
size，那么在传输后，数据位置将指在超出数据末端的位置上。 
截取数据流是一个原子：数据流成功被截取，或者不做任何操作。 
——参数： 
object: 对象句柄 
size: 数据流新的尺寸 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
没有足够存储空间,返回值为TEEI_ERROR_STORAGE_NO_SPACE。 
8.3.1.10.4 TS_SeekObjectData 
TEEI_Result TS_SeekObjectData(  
TS_ObjectHandle object,  
int32_t offset,  
TS_Whence whence ) 
——描述： 
设置与对象索引相关的数据位置指示器。 
参数whence控制偏移量： 
如果whence 等于TS_DATA_SEEK_SET，那么数据位置从数据流开始的位置设置offset 字节； 
如果whence 等于TS_DATA_SEEK_CUR，那么数据位置设置为当前位置加offset； 
如果whence 等于TS_DATA_SEEK_END，那么数据位置设置为对象数据大小加offset。 
TS_SeekObjectData操作可以用于设定流末端前的数据位置；这样做并不构成一个错误。然而，数
据位置指示器拥有最大值TS_DATA_MAX_POSITION。如果此操作产生的数据位置指示器的值大于
TS_DATA_MAX_POSITION，那么返回错误TS_ERROR_OVERFLOW。 
如果试图在数据流开始前移动数据位置，那么数据位置被设置在流开始的位置。这样做并不构成一
个错误。 
——参数： 
object:对象句柄。 
offset:移动数据位置的字节数。正值表示向前移动数据位置；负值表示向后移动数据位置。 
whence:从数据流的位置到计算的新位置。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
数值超出数据类型存储范围，返回值为TEEI_ERROR_OVERFLOW。 
8.3.2 算术运算API 
8.3.2.1 头文件 
算术运算API的头文件名字必须是“teei_platform_arithmetical_api.h”。 
中国银联 
版权所有

---
**[p55]**

Q/CUP 069—2015 
48 
#include “teei_platform_arithmetical_api.h”; 
8.3.2.2 数据类型 
8.3.2.2.1 ARITH_BigInt 
typedef uint32_t ARITH_BigInt; 
——描述： 
该类型是一个占位符，适用于一个大型多精度整数的内存结构。 
8.3.2.2.2 ARITH_BigIntFMMContext 
typedef uint32_t ARITH_BigIntFMMContext; 
——描述： 
通常，这样的快速模乘算法需要一些额外的数据或者导数。额外的数据存储在传递给快速模乘的函
数上下文中。ARITH_BigIntFMMContext是TEE内核内部表达式的占位符，它存在于适用快速模乘操作的
上下文里。 
8.3.2.2.3 ARITH_BigIntFMM 
typedef uint32_t ARITH_BigIntFMM; 
——描述： 
一些实现可以支持快速模乘算法，比如Montgomery 或者 Barrett乘法这样适用于模指数运算中。
通常情况，在执行乘运算之前，算法要求输入的数据进行一些转变。ARITH_BigIntFMM是内存结构的占
位符，用于存放数据转换后的整数部分。 
8.3.2.3 函数 
8.3.2.3.1 服务上下文 
8.3.2.3.1.1 ARITH_Initialize 
TEEI_ResultARITH_Initialize(); 
——描述： 
初始化一个服务访问的上下文。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
中国银联 
版权所有

---
**[p56]**

Q/CUP 069—2015 
49 
8.3.2.3.1.2 ARITH_Finalize 
voidARITH_Finalize(); 
——描述： 
清理服务访问的上下文。 
——参数： 
无。 
8.3.2.3.2 内存分配和对象大小 
8.3.2.3.2.1 ARITH_BigIntSizeInU32 
#define ARITH_BigIntSizeInU32(n) ((((n)+31)/32)+2) 
——描述： 
该宏定义用来计算数组的大小，该数组用于存储表示一个n-bit整数的uint32_t类型的值。定义一
个宏而不是一个函数，因此TA开发者可以使用宏在静态编译声明一个数组。注意，内部算术运算函数的
实现负责ARITH_BigInt*指向的内存是32位的。 
——参数： 
n: 能够表示的最大位数。 
——返回值： 
无。 
8.3.2.3.2.2 ARITH_BigIntFMMContextSizeInU32 
size_t ARITH_BigIntFMMContextSizeInU32( size_t modulusSizeInBits ); 
——描述： 
返回数组大小，该数组存储表示一个快速模运算上下文的uint32_t类型的值，该运算使用一个给定
的模大小。此函数必须保证始终成功。 
——参数： 
modulusSizeInBits:以位为单位的模大小 
——返回值： 
需要存储ARITH_BigIntFMMContext的字节数，该函数的参数是一个给定的modulusSizeInBits长度
的系数。 
8.3.2.3.2.3 ARITH_BigIntFMMSizeInU32 
size_t ARITH_BigIntFMMSizeInU32( size_t modulusSizeInBits ); 
中国银联 
版权所有

---
**[p57]**

Q/CUP 069—2015 
50 
——描述： 
返回数组的大小，该数组存储在快速模乘运算表达式中一个整数的uint32_t类型的值，给定的模大
小以位为单位。 
——参数： 
modulusSizeInBits: 以位为单位的模的大小。 
——返回值： 
需要存储ARITH_BigIntFMM的字节数，该函数的参数是一个给定的modulusSizeInBits长度的系数。 
8.3.2.3.3 初始化函数 
8.3.2.3.3.1 ARITH_BigIntInit 
void ARITH_BigIntInit(  
[out] ARITH_BigInt *bigInt,  
size_t len ); 
——描述： 
初始化bigInt，并且设置它的表示值为０。函数负责将bigInt指针指向一个len 长度uint32_t类型
的内存空间。 
——参数： 
bigInt:一个ARITH_BigInt类型的要初始化的指针 
len: 类型为uint32_t的由bigInt指针指向的内存大小。 
——返回值： 
无。 
8.3.2.3.3.2 ARITH_BigIntInitFMMContext 
void ARITH_BigIntInitFMMContext(  
[out] ARITH_BigIntFMMContext *context,  
size_t len,  
[in] ARITH_BigInt *modulus ); 
——描述： 
为快速模乘运算计算必要的前提条件并将它们存储在上下文中。该函数负责将context指向一个len
长度uint32_t类型的内存空间。 
——参数： 
context: 一个ARITH_BigIntFMMContext类型的要初始化的指针 
len: 类型为uint32_t的由context指针指向的内存大小。 
modulus:模，gpd.tee.arith.maxBigIntSize力度中大于２和小于２的奇数。 
——返回值： 
中国银联 
版权所有

---
**[p58]**

Q/CUP 069—2015 
51 
无。 
8.3.2.3.3.3 ARITH_BigIntInitFMM 
void ARITH_BigIntInitFMM(  
[in] ARITH_BigIntFMM *bigIntFMM, size_t len ); 
——描述： 
初始化bigIntFMM，并且设定它的表示值为０。该函数负责将bigIntFMM指针指向一个len长度
uint32_t类型的内存空间。 
——参数： 
bigIntFMM:一个ARITH_BigIntFMM类型的要初始化的指针。 
len: 类型为uint32_t的由bigIntFMM指针指向的内存大小。 
——返回值： 
无。 
8.3.2.3.4 转化器函数 
8.3.2.3.4.1 ARITH_BigIntConvertFromOctetString 
TEEI_Result ARITH_BigIntConvertFromOctetString(  
[out] ARITH_BigInt *dest,  
[inbuf] uint8_t *buffer, size_t bufferLen, int32_t sign ); 
——描述： 
将一个bufferLen长度的8位字符串缓冲区转换成一个ARITH_BigInt格式。8位字符串最显著的字节
首先表示。输入参数sign将设置dest的标志。如果sign<0则设置为负值，如果sign>=0则设置为正值。 
——参数： 
dest:一个ARITH_BigInt类型的保存结果的指针。 
buffer:指向缓冲区的指针，该缓冲区包含整数的8位字符串表达式。 
bufferLen: 以字节为单位的*buffer长度。 
sign:dest的标志被设置成sign的标志。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果分配给dest的内存太少，返回值为TEEI_ERROR_OVERFLOW。 
8.3.2.3.4.2 ARITH_BigIntConvertToOctetString 
TEEI_Result ARITH_BigIntConvertToOctetString(  
[outbuf] void* buffer, size_t *bufferLen,  
[in] ARITH_BigInt *bigInt ); 
中国银联 
版权所有

---
**[p59]**

Q/CUP 069—2015 
52 
——描述： 
将ARITH_BigInt格式的整数的绝对值转换成为一个8位字符串。8位字符串被写成一个最显著的字节
来首先表示。 
 
——参数： 
buffer, bufferLen: 写入整数转换成8为字符串的表达式的输出缓冲区。 
bigInt:指向将被转换成8位字符串的整数的指针。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
输出缓冲区过小而不能够保存8位字符串，返回值为TEEI_ERROR_SHORT_BUFFER。 
8.3.2.3.4.3 ARITH_BigIntConvertFromS32 
void ARITH_BigIntConvertFromS32(  
[out] ARITH_BigInt *dest, int32_t shortVal); 
——描述： 
将shortVal的值赋给*dest 。 
——参数： 
dest:ARITH_BigInt类型的用于存储结果的指针。 
shortVal: 输入值。 
——返回值： 
无。 
8.3.2.3.4.4 ARITH_BigIntConvertToS32 
TEEI_Result ARITH_BigIntConvertToS32(  
[out] int32_t *dest,  
[in] ARITH_BigInt *src ); 
——描述： 
将src的值赋给*dest，包括src的标志。如果src不符合int32_t数据类型，那么不定义*dest的值。 
——参数： 
dest:一个int32_t类型的用于存储结果的指针 
src: 指向输入值。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
src不符合int32_t数据类型的要求，返回值为TEEI_ERROR_OVERFLOW。 
中国银联 
版权所有

---
**[p60]**

Q/CUP 069—2015 
53 
8.3.2.3.5 逻辑运算函数 
8.3.2.3.5.1 ARITH_BigIntCmp 
int32_t ARITH_BigIntCmp(  
[in] ARITH_BigInt *op1,  
[in] ARITH_BigInt *op2 ); 
——描述： 
比较op1和op2的大小，结果是op1>op2, op1==op2, 或者 op1<op2。 
——参数： 
op1: 指向第一个操作数的指针。 
op2: 指向第二个操作数的指针。 
 
——返回值： 
如果op1<op2，该函数返回负数；如果op1==op2，返回0；如果op1>op2，返回正数。 
8.3.2.3.5.2 ARITH_BigIntCmpS32 
int32_t ARITH_BigIntCmpS32(  
[in] ARITH_BigInt *op, int32_t shortVal ); 
——描述： 
比较op和shortVal的大小，结果是op>shortVal, op==shortVal,或者op<shortVal。 
——参数： 
op: 指向第一个操作数的指针。 
shortVal: 指向第二个操作数的指针。 
——返回值： 
如果op<shortVal，该函数返回负数；如果op==shortVal，返回0；如果op>shortVal，返回正数。 
8.3.2.3.5.3 ARITH_BigIntShiftRight 
void ARITH_BigIntShiftRight(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op, 
size_t bits ); 
——描述： 
计算|dest| = |op| >> bits，并且dest的符号与op相同。如果bits大于op的位数，那么结果为0。
允许dest和op指向同一个内存区域。 
中国银联 
版权所有

---
**[p61]**

Q/CUP 069—2015 
54 
——参数： 
dest:ARITH_BigInt类型的存储移位后结果的指针 
op: 指向被移位的操作数的指针 
bits: 要移的位数 
——返回值： 
无。 
8.3.2.3.5.4 ARITH_BigIntGetBit 
bool ARITH_BigIntGetBit(  
[in] ARITH_BigInt *src,  
uint32_t bitIndex ); 
——描述： 
函数返回|src|以二进制表达式的第bitIndex位的值。如果返回值为真，表示第bitIndex位的值是
“1”，而如果返回的值为假，表示第bitIndex位的值是“0”。 
——参数： 
src: 指向整数的指针 
bitIndex: 读出的位的偏移量，为了最不显著的位从偏移量0开始。 
——返回值： 
|src|中第bitIndex位的值作为布尔值。真表示值为“1”，假表示值为“0”。 
8.3.2.3.5.5 ARITH_BigIntGetBitCount 
uint32_t ARITH_BigIntGetBitCount(  
[in] ARITH_BigInt *src ); 
——描述： 
函数返回|src|以二进制表达式的位数。即，src的大小。 
——参数： 
• src: 指向整数的指针 
——返回值： 
|src|以二进制表达式的位数。如果src值为0，那么返回值为0。 
8.3.2.3.6 基础算数运算函数 
8.3.2.3.6.1 ARITH_BigIntAdd 
void ARITH_BigIntAdd(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op1,  
中国银联 
版权所有

---
**[p62]**

Q/CUP 069—2015 
55 
[in] ARITH_BigInt *op2 ); 
——描述： 
计算dest = op1 + op2。允许dest, op1和op2所有或者几个选项可以指向同一个内存区域。 
——参数： 
dest: ARITH_BigInt类型的保存op1 + op2结果的指针。 
op1:指向第一个操作数的指针。 
op2:指向第二个操作数的指针。 
——返回值： 
无。 
8.3.2.3.6.2 ARITH_BigIntSub 
void ARITH_BigIntSub(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op1,  
[in] ARITH_BigInt *op2 ); 
——描述： 
计算dest = op1 – op2。允许dest, op1和op2所有或者几个选项可以指向同一个内存区域。 
——参数： 
计算dest = op1 – op2。允许dest, op1和op2所有或者几个选项可以指向同一个内存区域。 
dest: ARITH_BigInt类型的保存op1 - op2结果的指针。 
op1:指向第一个操作数的指针。 
op２:指向第二个操作数的指针。 
——返回值： 
无。 
8.3.2.3.6.3 ARITH_BigIntNeg 
void ARITH_BigIntNeg(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op ); 
——描述： 
非运算：dest = -op。允许dest, op可以指向同一个内存区域。 
——参数： 
dest: ARITH_BigInt类型的保存op1 - op2结果的指针。 
op:指向将要被执行非运算的操作数的指针。 
中国银联 
版权所有

---
**[p63]**

Q/CUP 069—2015 
56 
——返回值： 
无。 
8.3.2.3.6.4 ARITH_BigIntMul 
void ARITH_BigIntMul(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op1,  
[in] ARITH_BigInt *op2 ); 
——描述： 
计算dest = op1 * op2。允许dest, op1和op2所有或者几个选项可以指向同一个内存区域。 
——参数： 
dest: ARITH_BigInt类型的保存op1 * op2结果的指针。 
op1:指向第一个操作数的指针。 
op２:指向第二个操作数的指针。 
——返回值： 
无。 
8.3.2.3.6.5 ARITH_BigIntSquare 
void ARITH_BigIntSquare(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op ); 
——描述： 
计算dest = op * op。允许dest, op可以指向同一个内存区域。 
——参数： 
dest: ARITH_BigInt类型的保存op * op结果的指针。 
op:指向将要被执行平方运算的操作数的指针。 
——返回值： 
无。 
8.3.2.3.6.6 ARITH_BigIntDiv 
void ARITH_BigIntDiv(  
[out] ARITH_BigInt *dest_q,  
[out] ARITH_BigInt *dest_r,  
[in] ARITH_BigInt *op1,  
[in] ARITH_BigInt *op2 ); 
中国银联 
版权所有

---
**[p64]**

Q/CUP 069—2015 
57 
——描述： 
计算dest_r和dest_q，使得 op1 = dest_q * op2 + dest_r。dest_q将舍入为０，并且dest_r与op1
的符号相同。 
 
——参数： 
dest_q: ARITH_BigInt类型的存储商的指针。dest_q可能为空。 
dest_r: ARITH_BigInt类型的存储余数的指针。dest_r可能为空。 
op1:指向第一个操作数的指针，作为被除数。 
op2:指向第二个操作数的指针，作为除数。 
 
——返回值： 
无。 
8.3.2.3.7 模运算函数 
8.3.2.3.7.1 ARITH_BigIntMod 
void ARITH_BigIntMod(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op,  
[in] ARITH_BigInt *n ); 
——描述： 
计算dest = op (mod n)，使得0 <= dest < n。允许dest和op指向同一个内存区域，但是n必须指
向一个单独的内存区域。对于负的op，按照通常惯例处理-1 = (n-1) mod n。 
 
——参数： 
dest: ARITH_BigInt类型的存储op (mod n)结果的指针。结果dest的值在[0, n-1]范围内。 
op:指向被执行mod n消减处理的操作数的指针。 
n:指向模数的指针。模数必须大于１。 
 
——返回值： 
无。 
8.3.2.3.7.2 ARITH_BigIntAddMod 
void ARITH_BigIntAddMod(  
[out] ARITH_BigInt *dest,  
中国银联 
版权所有

---
**[p65]**

Q/CUP 069—2015 
58 
[in] ARITH_BigInt *op1,  
[in] ARITH_BigInt *op2,  
[in] ARITH_BigInt *n ); 
——描述： 
计算dest = (op1 + op2) (mod n)。允许dest, op1和op2所有或者几个选项可以指向同一个内存区
域，但是n必须指向一个单独的内存区域。 
 
——参数： 
dest: ARITH_BigInt类型的存储(op1 + op2) (mod n)结果的指针。 
op1:指向第一个操作数的指针。操作数必须在[0,n-1]的范围内。 
op2:指向第二个操作数的指针。操作数必须在[0,n-1]的范围内。 
n:指向模数的指针。模数必须大于１。 
——返回值： 
无。 
8.3.2.3.7.3 ARITH_BigIntSubMod 
void ARITH_BigIntSubMod(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op1,  
[in] ARITH_BigInt *op2,  
[in] ARITH_BigInt *n ); 
——描述： 
计算dest = (op1 - op2) (mod n)。允许dest, op1和op2所有或者几个选项可以指向同一个内存区
域，但是n必须指向一个单独的内存区域。 
——参数： 
op1:指向第一个操作数的指针。操作数必须在[0,n-1]的范围内。 
dest: ARITH_BigInt类型的存储(op1 - op2) (mod n)结果的指针。 
op2:指向第二个操作数的指针。操作数必须在[0,n-1]的范围内。 
n:指向模数的指针。模数必须大于１。 
——返回值： 
无。 
8.3.2.3.7.4 ARITH_BigIntMulMod 
void ARITH_BigIntMulMod(  
[out] ARITH_BigInt *dest,  
中国银联 
版权所有

---
**[p66]**

Q/CUP 069—2015 
59 
[in] ARITH_BigInt *op1,  
[in] ARITH_BigInt *op2,  
[in] ARITH_BigInt *n ); 
——描述： 
计算dest = （op1 * op2） (mod n)。允许dest, op1和op2所有或者几个选项可以指向同一个内存
区域，但是n必须指向一个单独的内存区域。 
——参数： 
dest: ARITH_BigInt类型的存储（op1 * op2） (mod n)结果的指针。 
op1:指向第一个操作数的指针。操作数必须在[0,n-1]的范围内。 
op2:指向第二个操作数的指针。操作数必须在[0,n-1]的范围内。 
n:指向模数的指针。模数必须大于１。 
——返回值： 
无。 
8.3.2.3.7.5 ARITH_BigIntSquareMod 
void ARITH_BigIntSquareMod(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op,  
[in] ARITH_BigInt *n ); 
——描述： 
计算dest = （op * op） (mod n)。允许dest, op指向同一个内存区域，但是n必须指向一个单独
的内存区域。 
——参数： 
dest: ARITH_BigInt类型的存储（op * op） (mod n)结果的指针。 
op:指向操作数的指针。操作数必须在[0,n-1]的范围内。 
n:指向模数的指针。模数必须大于１。 
——返回值： 
无。 
8.3.2.3.7.6 ARITH_BigIntInvMod 
void ARITH_BigIntInvMod(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigInt *op,  
[in] ARITH_BigInt *n ); 
——描述： 
中国银联 
版权所有

---
**[p67]**

Q/CUP 069—2015 
60 
计算dest，使得dest * op = 1 (mod n)。允许dest, op指向同一个内存区域。 
——参数： 
dest: ARITH_BigInt类型的存储op^-1 (mod n)结果的指针。 
op:指向操作数的指针。操作数必须在[0,n-1]的范围内。 
n:指向模数的指针。模数必须大于１。 
——返回值： 
无。 
8.3.2.3.8 其它算数运算函数 
8.3.2.3.8.1 ARITH_BigIntRelativePrime 
bool ARITH_BigIntRelativePrime(  
[in] ARITH_BigInt *op1,  
[in] ARITH_BigInt *op2 ); 
——描述： 
判断gcd(op1, op2)==1是否成立。允许op1和op2指向同一个内存区域。 
——参数： 
op1:指向第一个操作数的指针。 
op2:指向第二个操作数的指针。 
——返回值： 
如果，cd(op1, op2)==1，结果为真，否则为假。 
8.3.2.3.8.2 ARITH_BigIntComputeExtendedGcd 
void ARITH_BigIntComputeExtendedGcd(  
[out] ARITH_BigInt *gcd,  
[out] ARITH_BigInt *u,  
[out] ARITH_BigInt *v,  
[in] ARITH_BigInt *op1,  
[in] ARITH_BigInt *op2 ); 
——描述： 
计算输入参数op1和op2的最大公约数。此外，计算系数u和v，使得u*op1+v*op2==gcd。允许op1和
op2指向同一个内存区域。允许u，v，或者二者的值都为空。如果两个系数的值都为空，那么函数只计
算op1和op2的最大公约数。 
——参数： 
gcd: ARITH_BigInt类型的存储op1和op2最大公约数的指针。 
u: ARITH_BigInt类型的存储第一个系数的指针。 
中国银联 
版权所有

---
**[p68]**

Q/CUP 069—2015 
61 
v: ARITH_BigInt类型的存储第二个系数的指针。 
op1:指向第一个操作数的指针。 
op2:指向第二个操作数的指针。 
——返回值： 
无。 
8.3.2.3.8.3 ARITH_BigIntIsProbablePrime 
int32_t ARITH_BigIntIsProbablePrime(  
[in] ARITH_BigInt *op,  
uint32_t confidenceLevel ); 
——描述： 
执行一个基于op的概率素数测试。参数confidenceLevel用于指定不确定应答的概率。如果函数不
能够保证op是素数还是合数，那么必须遍历测试直到确认op是一个小于2^(-confidenceLevel)的合数。 
——参数： 
op: 素数测试的候选数据 
confidenceLevel: 一个不确定测试的所需信任级别。这个参数（通常情况下）映射迭代的次数和
进而测试运行消耗的时间。小于80的值将被视为80。 
——返回值： 
如果op是一个合数，返回值为0。 
如果op是一个素数，返回值为1。 
如果测试是不确定但是可能的，那么op是一个小于2^(-confidenceLevel)的合数，返回值为-1。 
8.3.2.3.9 快速模乘运算函数 
8.3.2.3.9.1 ARITH_BigIntConvertToFMM 
void ARITH_BigIntConvertToFMM(  
[out] ARITH_BigIntFMM *dest,  
[in] ARITH_BigInt *src,  
[in] ARITH_BigInt *n,  
[in] ARITH_BigIntFMMContext *context ); 
——描述： 
将src转换成一个表达式用于实现快速模乘运算。如果操作成功，那么结果将以实现时指定格式的
格式写入缓冲区dest中，该缓冲区有TA分配并使用ARITH_BigIntInitFMM函数初始化。 
——参数： 
dest: 指向一个已初始化的ARITH_BigIntFMM类型内存区域的指针。 
src: 指向要转换的ARITH_BigInt类型的指针。 
n:模数的指针。 
中国银联 
版权所有

---
**[p69]**

Q/CUP 069—2015 
62 
context:指向一个提前使用ARITH_BigIntInitFMMContext函数初始化了上下文的指针。 
——返回值： 
无。 
8.3.2.3.9.2 ARITH_BigIntConvertFromFMM 
void ARITH_BigIntConvertFromFMM(  
[out] ARITH_BigInt *dest,  
[in] ARITH_BigIntFMM *src,  
[in] ARITH_BigInt *n,  
[in] ARITH_BigIntFMMContext *context ); 
——描述： 
将src转换成为快速模乘运算表达式，并备份为一个ARITH_BigInt类型的表达式。 
——参数： 
dest: 指向一个已初始化的ARITH_BigIntFMM类型内存区域的指针。 
src: ARITH_BigIntFMM类型的指针，用于存储快速模乘运算表达式的值 
n:模数的指针。 
context:指向一个提前使用ARITH_BigIntInitFMMContext函数初始化了上下文的指针。 
——返回值： 
无。 
8.3.2.3.9.3 ARITH_BigIntComputeFMM 
void ARITH_BigIntComputeFMM(  
[out] ARITH_BigIntFMM *dest,  
[in] ARITH_BigIntFMM *op1,  
[in] ARITH_BigIntFMM *op2,  
[in] ARITH_BigInt *n,  
[in] ARITH_BigIntFMMContext *context ); 
——描述： 
使用快速模乘运算表达式计算dest = op1 * op2。指针dest, op1和op2必须全部指向一个之前初始
化为ARITH_BigIntFMM类型的相同模和上下文，用于该函数的调用。因此，结果未定义。允许dest, op1
和op2全部或者部分参数指向同一个内存区域。 
——参数： 
dest: ARITH_BigIntFMM类型的指针，用于存储使用快速模乘运算表达式计算op1 * op2的结果 
op1:指向第一个操作数的指针 
op2:指向第二个操作数的指针。 
n:模数的指针。 
中国银联 
版权所有

---
**[p70]**

Q/CUP 069—2015 
63 
context:指向一个提前使用ARITH_BigIntInitFMMContext函数初始化了上下文的指针。 
——返回值： 
无。 
8.3.3 密码操作API 
密码操作API定义如何实际执行加解密操作，本规范支持如下加密算法，请参见下表。 
表8-18 支持的加密算法 
摘要（摘要算法） 
MD5 
SHA-1 
SHA-256 
SHA-224 
SHA-384 
SHA-512 
对称密码 
DES 
三重DES，使用双倍长度和三陪长度的密钥 
AES 
消息认证码 
DES-MAC 
AES-MAC 
AES-CMAC 
HMAC 支持摘要算法其中一种的HMAC 
认证加密 
AES-CCM 支持附加认证的AES-CCMData (AAD) 
支持附加认证的AES-GCMData (AAD) 
非对称加密方案 
RSA PKCS1-V1.5 
RSA OAEP 
非对称签名加密 
DSA 
RSA PKCS1-V1.5 
RSA PSS 
密钥交换算法 
Diffie-Hellman 
如果org.teei.cryptography.ecc属性值为true，那么支持另外两个算法，非对称签名算法：ECDSA
和密钥交换算法：ECDH。 
8.3.3.1 头文件 
加解密API的头文件名字必须是“teei_platform_crypto_api.h”。 
中国银联 
版权所有

---
**[p71]**

Q/CUP 069—2015 
64 
#include “teei_platform_crypto_api.h”; 
8.3.3.2 数据类型 
8.3.3.2.1 CP_OperationMode 
typedef enum { 
CP_MODE_ENCRYPT,  
CP_MODE_DECRYPT, 
CP_MODE_SIGN,  
CP_MODE_VERIFY, 
CP_MODE_MAC, 
CP_MODE_DIGEST, 
CP_MODE_DERIVE 
} CP_OperationMode; 
——描述： 
加解密操作的模式。 
8.3.3.2.2 CP_OperationInfo 
typedef struct { 
uint32_t algorithm; 
uint32_t operationClass; 
uint32_t mode; 
uint32_t digestLength; 
uint32_t maxKeySize; 
uint32_t keySize; 
uint32_t requiredKeyUsage; 
uint32_t handleState; 
} CP_OperationInfo; 
——描述： 
操作信息。 
8.3.3.2.3 CP_OperationHandle 
typedef struct __CP_OperationHandle* CP_OperationHandle; 
——描述： 
代表加解密操作的透明句柄。 
中国银联 
版权所有

---
**[p72]**

Q/CUP 069—2015 
65 
8.3.3.3 服务上下文 
8.3.3.3.1 CP_Initialize 
TEEI_ResultCP_Initialize(); 
——描述： 
初始化一个服务访问的上下文。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.3.3.3.2 CP_Finalize 
voidCP_Finalize(); 
——描述： 
清理服务访问的上下文。 
——参数： 
无。 
8.3.3.4 通用操作函数 
8.3.3.4.1 CP_AllocateOperation 
TEEI_Result CP_AllocateOperation(  
CP_OperationHandle *operation, 
uint32_t algorithm, 
uint32_t mode, 
uint32_t maxKeySize 
); 
——描述： 
分配操作句柄。 
——参数： 
operation:引用已生成的操作句柄。 
algorithm: 密码算法。 
mode: 操作模式。 
maxKeySize:操作的最大密钥大小（位）。 
中国银联 
版权所有

---
**[p73]**

Q/CUP 069—2015 
66 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果内存不足，返回TEEI_ERROR_OUT_OF_MEMORY。 
如果指定了不支持算法，返回TEEI_ERROR_NOT_SUPPORT。 
——操作模式定义： 
表8-19 操作模式定义 
算法 
可能的模式 
CP_ALG_AES_ECB_NOPAD 
CP_MODE_ENCRYPT 
CP_MODE_DECRYPT 
CP_ALG_AES_CBC_NOPAD 
CP_ALG_AES_CTR 
CP_ALG_AES_CTS 
CP_ALG_AES_XTS 
CP_ALG_AES_CCM 
CP_ALG_AES_GCM 
CP_ALG_DES_ECB_NOPAD 
CP_ALG_DES_CBC_NOPAD 
CP_ALG_DES3_ECB_NOPAD 
CP_ALG_DES3_CBC_NOPAD 
CP_ALG_DES_CBC_MAC_NOPAD 
CP_MODE_MAC 
CP_ALG_AES_CBC_MAC_NOPAD 
CP_ALG_AES_CBC_MAC_PKCS5 
CP_ALG_AES_CMAC 
CP_ALG_DES_CBC_MAC_PKCS5 
CP_ALG_DES3_CBC_MAC_NOPAD 
CP_ALG_DES3_CBC_MAC_PKCS5 
CP_ALG_RSASSA_PKCS1_V1_5_MD5 
CP_MODE_SIGN 
CP_MODE_VERIFY 
CP_ALG_RSASSA_PKCS1_V1_5_SHA1 
CP_ALG_RSASSA_PKCS1_V1_5_SHA224 
CP_ALG_RSASSA_PKCS1_V1_5_SHA256 
CP_ALG_RSASSA_PKCS1_V1_5_SHA384 
中国银联 
版权所有

---
**[p74]**

Q/CUP 069—2015 
67 
算法 
可能的模式 
CP_ALG_RSASSA_PKCS1_V1_5_SHA512 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA1 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA224 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA256 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA384 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA512 
CP_ALG_DSA_SHA1 
CP_ALG_ECDSA（如果支持） 
CP_ALG_RSAES_PKCS1_V1_5 
CP_MODE_ENCRYPT 
CP_MODE_DECRYPT 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA1 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA224 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA256 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA384 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA512 
CP_ALG_RSA_NOPAD 
CP_ALG_DH_DERIVE_SHARED_SECRET 
CP_MODE_DERIVE 
CP_ALG_ECDH_DERIVE_SHARED_SECRET（如果支持） 
CP_ALG_MD5 
CP_MODE_DIGEST 
CP_ALG_SHA1 
CP_ALG_SHA224 
CP_ALG_SHA256 
CP_ALG_SHA384 
CP_ALG_SHA512 
CP_ALG_HMAC_MD5 
CP_MODE_MAC 
CP_ALG_HMAC_SHA1 
CP_ALG_HMAC_SHA224 
CP_ALG_HMAC_SHA256 
CP_ALG_HMAC_SHA384 
CP_ALG_HMAC_SHA512 
中国银联 
版权所有

---
**[p75]**

Q/CUP 069—2015 
68 
8.3.3.4.2 CP_FreeOperation 
void CP_FreeOperation(CP_OperationHandle operation); 
——描述： 
释放操作句柄。 
——参数： 
operation:引用已生成的操作句柄。 
8.3.3.4.3 CP_GetOperationInfo 
void CP_GetOperationInfo( 
CP_OperationHandle operation, 
[out] CP_OperationInfo* operationInfo 
); 
——描述： 
获取操作句柄信息。 
——参数： 
operation:引用已生成的操作句柄。 
operationInfo:操作信息。 
8.3.3.4.4 CP_ResetOperation 
void CP_ResetOperation(CP_OperationHandle operation); 
——描述： 
重置操作句柄。 
——参数： 
operation:引用已生成的操作句柄。 
8.3.3.4.5 CP_SetOperationKey 
TEEI_Result CP_SetOperationKey( 
CP_OperationHandle operation, 
TS_ObjectHandle key 
); 
——描述： 
设置操作的密钥。 
中国银联 
版权所有

---
**[p76]**

Q/CUP 069—2015 
69 
——参数： 
operation:引用已生成的操作句柄。 
key:密钥对象句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.3.3.4.6 CP_SetOperationKey2 
TEEI_Result CP_SetOperationKey2( 
CP_OperationHandle operation, 
TS_ObjectHandle key1, 
TS_ObjectHandle key2 
); 
——描述： 
设置操作密钥（2个）。 
——参数： 
operation:引用已生成的操作句柄。 
key1:密钥对象句柄。 
key2:密钥对象句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.3.3.4.7 CP_CopyOperation 
void CP_CopyOperation( 
CP_OperationHandle dstOperation, 
CP_OperationHandle srcOperation 
); 
——描述： 
复制操作句柄信息。 
——参数： 
dstOperation:引用已生成的操作句柄。 
srcOperation:引用已生成的操作句柄。 
8.3.3.5 消息摘要函数 
8.3.3.5.1 CP_DigestUpdate 
void CP_DigestUpdate( 
中国银联 
版权所有

---
**[p77]**

Q/CUP 069—2015 
70 
CP_OperationHandle* operation, 
[inbuf] void* chunk,  
size_t chunkSize 
); 
——描述： 
聚集摘要数据。 
——参数： 
operation:引用已生成的操作句柄。 
chunk:进行hash运算的数据块。 
chunkSize:数据块大小。 
8.3.3.5.2 CP_DigestDoFinal 
TEEI_Result CP_DigestDoFinal(  
CP_OperationHandle* operation, 
[inbuf] void* chunk,  
size_t chunkLen, 
[outbuf] void* hash,  
size_t *hashLen 
); 
——描述： 
摘要操作，返回摘要值。 
——参数： 
operation:引用已生成的操作句柄。 
chunk:进行hash运算的数据块。 
chunkLen:数据块大小。 
hash:存储hash值的缓冲区。 
hashLen:hash值长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
8.3.3.6 对称加密函数 
8.3.3.6.1 CP_CipherInit 
void CP_CipherInit(  
CP_OperationHandle operation, 
[inbuf] void* IV,  
size_t IVLen 
中国银联 
版权所有

---
**[p78]**

Q/CUP 069—2015 
71 
); 
——描述： 
初始化对称加解密操作。 
——参数： 
operation:引用已生成的操作句柄。 
IV:包含操作初始向量的缓冲区。 
IVLen:缓冲区大小。 
8.3.3.6.2 CP_CipherUpdate 
TEEI_Result CP_CipherUpdate(  
CP_OperationHandle operation, 
[inbuf] void* srcData, size_t srcLen, 
[outbuf] void* destData, size_t *destLen 
); 
——描述： 
加解密输入数据。 
——参数： 
operation:引用已生成的操作句柄。 
srcData:进行加密或解密的输入数据缓冲区。 
srcLen:输入数据缓冲区大小。 
destData: 输出缓冲区。 
destLen:输出缓冲区数据长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
8.3.3.6.3 CP_CipherDoFinal 
TEEI_Result CP_CipherDoFinal(  
CP_OperationHandle operation, 
[inbuf] void* srcData, size_t srcLen, 
[outbufopt] void* destData, size_t *destLen 
); 
——描述： 
完成加解密操作。 
——参数： 
中国银联 
版权所有

---
**[p79]**

Q/CUP 069—2015 
72 
operation:引用已生成的操作句柄。 
srcData:进行加密或解密的输入数据缓冲区。 
srcLen:输入数据缓冲区大小。 
destData: 输出缓冲区。 
destLen:输出缓冲区数据长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
8.3.3.7 MAC 函数 
8.3.3.7.1 CP_MACInit 
void CP_MACInit(  
CP_OperationHandle operation, 
[inbuf] void* IV, size_t IVLen 
); 
——描述： 
初始化MAC操作。 
——参数： 
operation:引用已生成的操作句柄。 
IV:包含操作初始向量的缓冲区。 
IVLen:缓冲区大小。 
8.3.3.7.2 CP_MACUpdate 
void CP_MACUpdate(  
CP_OperationHandle operation, 
[inbuf] void* chunk, size_t chunkSize 
); 
——描述： 
聚集MAC操作数据。 
——参数： 
operation:引用已生成的操作句柄。 
chunk:进行hash运算的数据块。 
chunkSize:数据块大小。 
8.3.3.7.3 CP_MACComputeFinal 
TEEI_Result CP_MACComputeFinal(  
中国银联 
版权所有

---
**[p80]**

Q/CUP 069—2015 
73 
CP_OperationHandle operation, 
[inbuf] void* message, size_t messageLen, 
[outbuf] void* mac, size_t *macLen 
); 
——描述： 
完成MAC操作。 
——参数： 
operation:引用已生成的操作句柄。 
message:进行MAC运算的数据块。 
messageLen:数据块大小。 
mac: MAC值缓冲区 
macLen: 缓冲区大小 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
8.3.3.7.4 CP_MACCompareFinal 
TEEI_Result CP_MACCompareFinal(  
CP_OperationHandle operation, 
[inbuf] void* message, size_t messageLen, 
[inbuf] void* mac, size_t *macLen 
); 
——描述： 
完成MAC操作，比较MAC值。 
——参数： 
operation:引用已生成的操作句柄。 
message:进行MAC运算的数据块。 
messageLen:数据块大小。 
mac: MAC值缓冲区 
macLen: 缓冲区大小 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果MAC不合法，返回值为TEEI_ERROR_MAC_INVALID。 
中国银联 
版权所有

---
**[p81]**

Q/CUP 069—2015 
74 
8.3.3.8 认证的加密函数 
8.3.3.8.1 CP_AEInit 
TEEI_Result CP_AEInit( 
CP_OperationHandle operation, 
[inbuf] void* nonce, size_t nonceLen, 
uint32_t tagLen, 
uint32_t AADLen, 
uint32_t payloadLen 
); 
——描述： 
初始化认证加密操作。 
——参数： 
operation:引用已生成的操作句柄。 
nonce:操作用的乱数或IV。 
nonceLen:乱数或IV大小。 
tagLen: 标记长度（位）。 
AADLen: AAD长度（字节）。 
payloadLen: 负载长度（字节）。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果长度不支持，返回值为TEEI_ERROR_NOT_SUPPORT。 
8.3.3.8.2 CP_AEUpdateAAD 
void CP_AEUpdateAAD( 
CP_OperationHandle operation, 
[inbuf] void* AADdata, size_t AADdataLen 
); 
——描述： 
更新AAD数据。 
——参数： 
operation:引用已生成的操作句柄。 
AADdata: AAD数据块。 
AADdataLen: AAD长度（字节）。 
 
中国银联 
版权所有

---
**[p82]**

Q/CUP 069—2015 
75 
8.3.3.8.3 CP_AEUpdate 
TEEI_Result CP_AEUpdate( 
CP_OperationHandle operation, 
[inbuf] void* srcData, size_t srcLen, 
[outbuf] void* destData, size_t *destLen 
); 
——描述： 
聚集用于认证加密操作的数据。 
——参数： 
operation:引用已生成的操作句柄。 
srcData:用于加密或解密的输入数据。 
srcLen:输入数据长度。 
destData: 输出缓冲区。 
destLen: 输出缓冲区内容长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
8.3.3.8.4 CP_AEEncryptFinal 
TEEI_Result CP_AEEncryptFinal( 
CP_OperationHandle operation, 
[inbuf] void* srcData, size_t srcLen, 
[outbuf] void* destData, size_t* destLen, 
[outbuf] void* tag, size_t* tagLen 
); 
——描述： 
完成认证加密操作。 
——参数： 
operation:引用已生成的操作句柄。 
srcData:用于加密或解密的输入数据。 
srcLen:输入数据长度。 
destData: 输出缓冲区。 
destLen: 输出缓冲区内容长度。 
tag: 计算的标记内容。 
tagLen: 计算的标记长度（位）。 
——返回值： 
中国银联 
版权所有

---
**[p83]**

Q/CUP 069—2015 
76 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
8.3.3.8.5 CP_AEDecryptFinal 
TEEI_Result CP_AEDecryptFinal( 
CP_OperationHandle operation, 
[inbuf] void* srcData, size_t srcLen, 
[outbuf] void* destData, size_t *destLen, 
[in] void* tag, size_t tagLen 
); 
——描述： 
完成认证解密操作。 
——参数： 
operation:引用已生成的操作句柄。 
srcData:用于加密或解密的输入数据。 
srcLen:输入数据长度。 
destData: 输出缓冲区。 
destLen: 输出缓冲区内容长度。 
tag: 计算的标记内容。 
tagLen: 计算的标记长度（位）。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
如果MAC不合法，返回值为TEEI_ERROR_MAC_INVALID。 
8.3.3.9 非对称函数 
8.3.3.9.1 CP_AsymmetricEncrypt 
TEEI_Result CP_AsymmetricEncrypt(  
CP_OperationHandle operation, 
[in] TS_Attribute* params, uint32_t paramCount, 
[inbuf] void* srcData, size_t srcLen, 
[outbuf] void* destData, size_t *destLen, 
); 
——描述： 
非对称加密操作。 
——参数： 
operation:引用已生成的操作句柄。 
中国银联 
版权所有

---
**[p84]**

Q/CUP 069—2015 
77 
params:可选的参数。 
paramsCount:参数个数。 
srcData:输入缓冲区。 
srcLen:输入缓冲区长度。 
destData: 输出缓冲区。 
destLen: 输出缓冲区长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
 
8.3.3.9.2 CP_AsymmetricDecrypt 
TEEI_Result CP_AsymmetricDecrypt(  
CP_OperationHandle operation, 
[in] TS_Attribute* params, uint32_t paramCount, 
[inbuf] void* srcData, size_t srcLen, 
[outbuf] void* destData, size_t *destLen 
); 
——描述： 
非对称解密操作。 
——参数： 
operation:引用已生成的操作句柄。 
params:可选的参数。 
paramsCount:参数个数。 
srcData:输入缓冲区。 
srcLen:输入缓冲区长度。 
destData: 输出缓冲区。 
destLen: 输出缓冲区长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
8.3.3.9.3 CP_AsymmetricSignDigest 
TEEI_Result CP_AsymmetricSignDigest(  
CP_OperationHandle operation, 
[in] TS_Attribute* params, uint32_t paramCount, 
[inbuf] void* digest, size_t digestLen, 
[outbuf] void* signature, size_t *signatureLen 
中国银联 
版权所有

---
**[p85]**

Q/CUP 069—2015 
78 
); 
——描述： 
非对称签名信息摘要。 
——参数： 
operation:引用已生成的操作句柄。 
params:可选的参数。 
paramsCount:参数个数。 
digest:摘要计算数据输入缓冲区。 
digestLen:摘要计算数据输入缓冲区长度。 
signature: 签名数据输出缓冲区。 
signatureLen: 签名数据输出缓冲区长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回值为TEEI_ ERROR_SHORT_BUFFER。 
 
8.3.3.9.4 CP_AsymmetricVerifyDigest 
TEEI_Result CP_AsymmetricVerifyDigest(  
CP_OperationHandle operation, 
[in] TS_Attribute* params, uint32_t paramCount, 
[inbuf] void* digest, size_t digestLen, 
[inbuf] void* signature, size_t signatureLen 
); 
——描述： 
非对称验证摘要。 
——参数： 
operation:引用已生成的操作句柄。 
params:可选的参数。 
paramsCount:参数个数。 
digest:摘要计算数据输入缓冲区。 
digestLen:摘要计算数据输入缓冲区长度。 
signature: 签名数据输出缓冲区。 
signatureLen: 签名数据输出缓冲区长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果签名验证错误，返回值为TEEI_ERROR_SIGNATURE_INVALID。 
中国银联 
版权所有

---
**[p86]**

Q/CUP 069—2015 
79 
8.3.3.10 密钥派生函数 
8.3.3.10.1 CP_DeriveKey 
void CP_DeriveKey(  
CP_OperationHandle operation, 
[in] TS_Attribute* params, uint32_t paramCount, 
TS_ObjectHandle derivedKey 
); 
——描述： 
派生密钥。 
——参数： 
operation:引用已生成的操作句柄。 
params:可选的参数。 
paramsCount:参数个数。 
derivedKey: 派生的密钥。 
8.3.3.11 随机数生成函数 
8.3.3.11.1 CP_GenerateRandom 
void CP_GenerateRandom( 
[out] void* randomBuffer,size_t randomBufferLen 
); 
——描述： 
产生随机数。 
——参数： 
randomBuffer:生成的随机数缓冲区。 
randomBufferLen:缓冲区内容长度。 
8.3.3.12 加密算法规范 
8.3.3.12.1 算法标识符 
表8-20 算法标识符列表 
名称 
标识符 
注释 
CP_ALG_AES_ECB_NOPAD 
0x10000010 
 
CP_ALG_AES_CBC_NOPAD 
0x10000110 
 
中国银联 
版权所有

---
**[p87]**

Q/CUP 069—2015 
80 
名称 
标识符 
注释 
CP_ALG_AES_CTR 
0x10000210 
计数器必须被编码为
大端序16 字节的缓冲
区。两个连续块之间，
计数器必须按1 递增。
如果到达128 位都已
经设置为1 了，那么必
须重新从0 开始。 
CP_ALG_AES_CTS 
0x10000310 
 
CP_ALG_AES_XTS 
0x10000410 
 
CP_ALG_AES_CBC_MAC_NOPAD 
0x30000110 
 
CP_ALG_AES_CBC_MAC_PKCS5 
0x30000510 
 
CP_ALG_AES_CMAC 
0x30000610 
 
CP_ALG_AES_CCM 
0x40000710 
 
CP_ALG_AES_GCM 
0x40000810 
 
CP_ALG_DES_ECB_NOPAD 
0x10000011 
 
CP_ALG_DES_CBC_NOPAD 
0x10000111 
 
CP_ALG_DES_CBC_MAC_NOPAD 
0x30000111 
 
CP_ALG_DES_CBC_MAC_PKCS5 
0x30000511 
 
CP_ALG_DES3_ECB_NOPAD 
0x10000013 
三重DES 必须是需要
两个或者三个密钥，通
过加密-解密-加密来
实现的加密算法。 
CP_ALG_DES3_CBC_NOPAD  
0x10000113  
 
CP_ALG_DES3_CBC_MAC_NOPAD  
0x30000113  
 
CP_ALG_DES3_CBC_MAC_PKCS5  
0x30000513 
 
CP_ALG_RSASSA_PKCS1_V1_5_MD5  
0x70001830  
 
CP_ALG_RSASSA_PKCS1_V1_5_SHA1  
0x70002830 
 
CP_ALG_RSASSA_PKCS1_V1_5_SHA224 
0x70003830 
 
CP_ALG_RSASSA_PKCS1_V1_5_SHA256 
0x70004830 
 
CP_ALG_RSASSA_PKCS1_V1_5_SHA384 
0x70005830 
 
CP_ALG_RSASSA_PKCS1_V1_5_SHA512 
0x70006830 
 
中国银联 
版权所有

---
**[p88]**

Q/CUP 069—2015 
81 
名称 
标识符 
注释 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA1 
0x70212930 
 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA224 
0x70313930 
 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA256 
0x70414930 
 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA384 
0x70515930 
 
CP_ALG_RSASSA_PKCS1_PSS_MGF1_SHA512 
0x70616930 
 
CP_ALG_RSAES_PKCS1_V1_5 
0x60000130 
 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA1 
0x60210230 
 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA224 
0x60310230 
 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA256 
0x60410230 
 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA384 
0x60510230 
 
CP_ALG_RSAES_PKCS1_OAEP_MGF1_SHA512 
0x60610230 
 
CP_ALG_RSA_NOPAD 
0x60000030 
 
CP_ALG_DSA_SHA1 
0x70002131 
 
CP_ALG_DH_DERIVE_SHARED_SECRET 
0x80000032 
 
CP_ALG_MD5 
0x50000001 
 
CP_ALG_SHA1 
0x50000002 
 
CP_ALG_SHA224 
0x50000003 
 
CP_ALG_SHA256 
0x50000004 
 
CP_ALG_SHA384 
0x50000005 
 
CP_ALG_SHA512 
0x50000006 
 
CP_ALG_HMAC_MD5 
0x30000001 
 
CP_ALG_HMAC_SHA1 
0x30000002 
 
CP_ALG_HMAC_SHA224 
0x30000003 
 
CP_ALG_HMAC_SHA256 
0x30000004 
 
CP_ALG_HMAC_SHA384 
0x30000005 
 
CP_ALG_HMAC_SHA512 
0x30000006 
 
中国银联 
版权所有

---
**[p89]**

Q/CUP 069—2015 
82 
表8-21 算法标识符的构成 
位信息 
功能 
值描述 
Bits [31:28] 
指定算法类，并且确定哪
个函数可以被调用 
0x1: 块加密 
0x3: MAC 
0x4: 认证加密密码学 
0x5: 摘要 
0x6: 非对称加密 
0x7: 非对称签名 
0x8: 密钥派生 
Bits [7:0] 
确定基本主体算法本身 
0x01: MD5 
0x02: SHA-1 
0x03: SHA-224 
0x04: SHA-256 
0x05: SHA-384 
0x06: SHA-512 
0x10: AES 
0x11: DES 
0x12: DES2 (只用于密钥产生) 
0x13: DES3 
0x30: RSA 
0x31: DSA 
0x32: DH 
Bits [11:8] 
定义链接模式或填充 
 
Bits [15:12] 
定义非对称签名算法的消
息摘要 
 
Bits [19:16] 
定义RSA PSS 和RSA OAEP
算法的MGF 
 
Bits [23:20] 
定义RSA OAEP 的MGF 使用
的内部哈希算法（签名算
法，相当于消息摘要） 
 
Bits [27:24] 
未使用 
 
 
中国银联 
版权所有

---
**[p90]**

Q/CUP 069—2015 
83 
8.3.3.12.2 对象类型 
表8-22 对象类型 
名字 
ID 
CP_TYPE_AES  
0xA0000010 
CP_TYPE_DES  
0xA0000011 
CP_TYPE_DES3  
0xA0000013 
CP_TYPE_HMAC_MD5  
0xA0000001 
CP_TYPE_HMAC_SHA1  
0xA0000002 
CP_TYPE_HMAC_SHA224  
0xA0000003 
CP_TYPE_HMAC_SHA256  
0xA0000004 
CP_TYPE_HMAC_SHA384  
0xA0000005 
CP_TYPE_HMAC_SHA512  
0xA0000006 
CP_TYPE_RSA_PUBLIC_KEY  
0xA0000030 
CP_TYPE_RSA_KEYPAIR  
0xA1000030 
CP_TYPE_DSA_PUBLIC_KEY  
0xA0000031 
CP_TYPE_DSA_KEYPAIR  
0xA1000031 
CP_TYPE_DH_KEYPAIR  
0xA1000032 
CP_TYPE_ECDSA_PUBLIC_KEY  
0xA0000041 
CP_TYPE_ECDSA_KEYPAIR  
0xA1000041 
CP_TYPE_ECDH_PUBLIC_KEY  
0xA0000042 
CP_TYPE_ECDH_KEYPAIR  
0xA1000042 
CP_TYPE_GENERIC_SECRET  
0xA0000000 
CP_TYPE_CORRUPTED_OBJECT  
0xA00000BE 
CP_TYPE_DATA  
0xA00000BF 
8.3.3.12.3 椭圆曲线类型 
如果支持椭圆曲线算法，那么可以参考下表的曲线定义，所有的曲线定义来自：
http://csrc.nist.gov/groups/ST/toolkit/documents/dss/NISTReCur.pdf。 
中国银联 
版权所有

---
**[p91]**

Q/CUP 069—2015 
84 
表8-23 椭圆曲线类型 
名字 
ID 
TS_ECC_CURVE_NIST_P192  
0x00000001  
TS_ECC_CURVE_NIST_P224  
0x00000002 
TS_ECC_CURVE_NIST_P256 
0x00000003 
TS_ECC_CURVE_NIST_P384  
0x00000004 
TS_ECC_CURVE_NIST_P521  
0x00000005 
RFC 
0x00000006-0x7FFFFFFF  
实现定义 
0x80000000-0xFFFFFFFF  
8.3.4 时钟API 
该API提供三种时钟资源的访问：系统时钟、TEE持久时间、REE时钟。 
8.3.4.1 头文件 
调用时钟API之前需要声明 “teei_platform_time_api.h”头文件。 
#include “teei_platform_time_api.h” 
8.3.4.2 数据类型 
8.3.4.2.1 TIME_Time 
typedef struct 
{  
    uint32_t seconds; 
    uint32_t mills; 
} TIME_Time; 
——描述： 
代表时间长度。 
8.3.4.3 函数 
8.3.4.3.1 TIME_Initialize 
TEEI_ResultTIME_Initialize(); 
——描述： 
初始化一个服务访问的上下文。 
——参数： 
中国银联 
版权所有

---
**[p92]**

Q/CUP 069—2015 
85 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.3.4.3.2 TIME_Finalize 
voidTIME_Finalize(); 
——描述： 
清理服务访问的上下文。 
——参数： 
无。 
8.3.4.3.3 TIME_GetSystemTime 
TEEI_Result TIME_GetSystemTime([out] TIME_Time* time); 
——描述： 
获取当前的系统时钟（从UTC 1970年1月1日午夜开始）。 
——参数： 
time: 输出参数，表示当前系统时间。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.3.4.3.4 TIME_Wait 
TEEI_Result TIME_Wait(uint32_t timeout); 
——描述： 
等待一段时间。 
——参数： 
timeout: 毫秒为单位的等待时间。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.3.4.3.5 TIME_GetTEEPersistentTime 
TEEI_Result TIME_GetTEEPersistentTime([out] TIME_Time* time); 
中国银联 
版权所有

---
**[p93]**

Q/CUP 069—2015 
86 
——描述： 
获取TEE的持久时间。 
——参数： 
time: 输出参数，表示TEE的持久时间。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.3.4.3.6 TIME_SetTEEPersistentTime 
TEEI_Result TIME_SetTEEPersistentTime([in] TIME_Time* time); 
——描述： 
设置TEE的持久时间。 
——参数： 
time: TEE的持久时间。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.3.4.3.7 TIME_GetREETime 
TEEI_Result TIME_GetREETime([out] TIME_Time* time); 
——描述： 
获取REE的时间（从UTC 1970年1月1日午夜开始）。 
——参数： 
time: 输出参数，表示REE的时间。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
 
8.3.5 安全Socket API 
8.3.5.1 头文件 
安全Socket API的头文件名字必须是“teei_platform_socket_api.h”。 
#include “teei_platform_socket_api.h”; 
中国银联 
版权所有

---
**[p94]**

Q/CUP 069—2015 
87 
8.3.5.2 常数 
8.3.5.2.1 特定于协议的错误码 
以下错误码特定于具体的协议。 
表8-24 特定于协议的错误码 
名字 
值 
目标函数 
含义 
SS_TCP_ERROR_HOSTNAME 
0xF1010001 SS_Open 
主机名无法解析 
SS_UDP_ERROR_HOSTNAME 
0xF1020001 SS_Open 
SS_Ioctl(SS_UD
P_CHANGEADDR) 
主机名无法解析，必须
允许使用ioctl 切换主
机地址复用实例 
SS_TLS_ERROR_REJECTED_SUITE 
0xF1030001 SS_Open 
服务器拒绝所有的加
解密套件 
SS_TLS_ERROR_VERSION 
0xF1030002 SS_Open 
服务器只支持低版本
的TLS 协议 
SS_TLS_ERROR_UNSUPPORTED_SUITE 0xF1030003 SS_Open 
指定的密码学套件组
合不被支持 
SS_TLS_ERROR_HANDSHAKE 
0xF1030004 SS_Open 
TLS 协议握手阶段发生
错误 
SS_TLS_ERROR_AUTHENTICATION 
0xF1030005 SS_Open 
服务器无法被认证 
 
8.3.5.2.2 特定于协议的指令码 
以下指令码用于SS_Ioctl函数。 
表8-25 特定于协议的指令码 
名字 
值 
参数类型 
描述 
SS_UDP_CHANGEADDR 
0x66000001 
char*buf 
修改当前实例的主机地址，其
格式必须为SS_UDPSetup 的字
段serverAddr 相同 
SS_UDP_CHANGEPORT 
0x66000002 
int *port 
修改当前实例的主机端口 
SS_TLS_BINDING_INFO 
0x67000001 
[out]char *buf 
返回类型
SS_TLS_SocketCBData 的通道
绑定信息，如果绑定信息不存
在则缓冲区长度为0 
中国银联 
版权所有

---
**[p95]**

Q/CUP 069—2015 
88 
8.3.5.3 数据类型 
8.3.5.3.1 SS_ProtocolType 
typedef enum 
{ 
TCP = 0x01; 
UDP = 0x02; 
TLS = 0x03; 
} SS_ProtocolType; 
——描述： 
协议类型的枚举值。 
8.3.5.3.2 SS_IPVersion 
typedef enum 
{ 
IP_VERSION_DC = 0;//don’t care 
IP_VERSION_4 = 1; 
IP_VERSION_6 = 2; 
} SS_IPVersion; 
——描述： 
IP协议类型的枚举值。 
8.3.5.3.3 SS_TLS_Version 
typedef enum 
{ 
TLS_VERSION_ALL = 0; 
TLS_VERSION_1v2 = 1; 
} SS_TLS_Version; 
——描述： 
TLS协议版本的枚举值。 
8.3.5.3.4 SS_TLS_CredentialType 
typedef enum 
{ 
TLS_CRED_NONE = 1; 
TLS_CRED_PDC = 2; 
TLS_CRED_CSC = 3; 
中国银联 
版权所有

---
**[p96]**

Q/CUP 069—2015 
89 
} SS_TLS_CredentialType; 
——描述： 
TLS协议的凭据类型的枚举值。 
8.3.5.3.5 SS_TLS_CipherSuites 
typedef enum 
{ 
TLS_NULL_WITH_NULL_NULL = 0x0000, 
TLS_RSA_WITH_3DES_EDE_CBC_SHA = 0x000A, 
TLS_DHE_DSS_WITH_3DES_EDE_CBC_SHA = 0x0013, 
TLS_DHE_RSA_WITH_3DES_EDE_CBC_SHA = 0x0016, 
TLS_RSA_WITH_AES_128_CBC_SHA = 0x002F, 
TLS_DHE_DSS_WITH_AES_128_CBC_SHA = 0x0032, 
TLS_DHE_RSA_WITH_AES_128_CBC_SHA = 0x0033, 
TLS_RSA_WITH_AES_256_CBC_SHA = 0x0035, 
TLS_DHE_DSS_WITH_AES_256_CBC_SHA = 0x0038, 
TLS_DHE_RSA_WITH_AES_256_CBC_SHA = 0x0039, 
TLS_RSA_WITH_AES_128_CBC_SHA256 = 0x003C, 
TLS_RSA_WITH_AES_256_CBC_SHA256 = 0x003D, 
TLS_DHE_DSS_WITH_AES_128_CBC_SHA256 = 0x0040, 
TLS_DHE_RSA_WITH_AES_128_CBC_SHA256 = 0x0067, 
TLS_DHE_DSS_WITH_AES_256_CBC_SHA256 = 0x006A, 
TLS_DHE_RSA_WITH_AES_256_CBC_SHA256 = 0x006B, 
TLS_PSK_WITH_3DES_EDE_CBC_SHA = 0x008B, 
TLS_PSK_WITH_AES_128_CBC_SHA = 0x008C, 
TLS_PSK_WITH_AES_256_CBC_SHA = 0x008D, 
TLS_DHE_PSK_WITH_3DES_EDE_CBC_SHA = 0x008F, 
TLS_DHE_PSK_WITH_AES_128_CBC_SHA = 0x0090, 
TLS_DHE_PSK_WITH_AES_256_CBC_SHA = 0x0091, 
TLS_RSA_PSK_WITH_3DES_EDE_CBC_SHA = 0x0093, 
TLS_RSA_PSK_WITH_AES_128_CBC_SHA = 0x0094, 
TLS_RSA_PSK_WITH_AES_256_CBC_SHA = 0x0095, 
TLS_RSA_WITH_AES_128_GCM_SHA256 = 0x009C, 
TLS_RSA_WITH_AES_256_GCM_SHA384 = 0x009D, 
TLS_DHE_RSA_WITH_AES_128_GCM_SHA256 = 0x009E, 
TLS_DHE_RSA_WITH_AES_256_GCM_SHA384 = 0x009F, 
TLS_DHE_DSS_WITH_AES_128_GCM_SHA256 = 0x00A2, 
TLS_DHE_DSS_WITH_AES_256_GCM_SHA384 = 0x00A3, 
TLS_PSK_WITH_AES_128_GCM_SHA256 = 0x00A8, 
TLS_PSK_WITH_AES_256_GCM_SHA384 = 0x00A9, 
TLS_DHE_PSK_WITH_AES_128_GCM_SHA256 = 0x00AA, 
中国银联 
版权所有

---
**[p97]**

Q/CUP 069—2015 
90 
TLS_DHE_PSK_WITH_AES_256_GCM_SHA384 = 0x00AB, 
TLS_RSA_PSK_WITH_AES_128_GCM_SHA256 = 0x00AC, 
TLS_RSA_PSK_WITH_AES_256_GCM_SHA384 = 0x00AD, 
TLS_PSK_WITH_AES_128_CBC_SHA256 = 0x00AE, 
TLS_PSK_WITH_AES_256_CBC_SHA384 = 0x00AF, 
TLS_DHE_PSK_WITH_AES_128_CBC_SHA256 = 0x00B2, 
TLS_DHE_PSK_WITH_AES_256_CBC_SHA384 = 0x00B3, 
TLS_RSA_PSK_WITH_AES_128_CBC_SHA256 = 0x00B6, 
TLS_RSA_PSK_WITH_AES_256_CBC_SHA384 = 0x00B7, 
TLS_ECDHE_ECDSA_WITH_3DES_EDE_CBC_SHA = 0xC008, 
TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA = 0xC009, 
TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA = 0xC00A, 
TLS_ECDHE_RSA_WITH_3DES_EDE_CBC_SHA = 0xC012, 
TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA = 0xC013, 
TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA = 0xC014, 
TLS_SRP_SHA_WITH_3DES_EDE_CBC_SHA = 0xC01A, 
TLS_SRP_SHA_RSA_WITH_3DES_EDE_CBC_SHA = 0xC01B, 
TLS_SRP_SHA_DSS_WITH_3DES_EDE_CBC_SHA = 0xC01C, 
TLS_SRP_SHA_WITH_AES_128_CBC_SHA = 0xC01D, 
TLS_SRP_SHA_RSA_WITH_AES_128_CBC_SHA = 0xC01E, 
TLS_SRP_SHA_DSS_WITH_AES_128_CBC_SHA = 0xC01F, 
TLS_SRP_SHA_WITH_AES_256_CBC_SHA = 0xC020, 
TLS_SRP_SHA_RSA_WITH_AES_256_CBC_SHA = 0xC021, 
TLS_SRP_SHA_DSS_WITH_AES_256_CBC_SHA = 0xC022, 
TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA256 = 0xC023, 
TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA384 = 0xC024, 
TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA256 = 0xC027, 
TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA384 = 0xC028, 
TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256 = 0xC02B, 
TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 = 0xC02C, 
TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 = 0xC02F, 
TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384 = 0xC030, 
TLS_ECDHE_PSK_WITH_3DES_EDE_CBC_SHA = 0xC034, 
TLS_ECDHE_PSK_WITH_AES_128_CBC_SHA = 0xC035, 
TLS_ECDHE_PSK_WITH_AES_256_CBC_SHA = 0xC036, 
TLS_ECDHE_PSK_WITH_AES_128_CBC_SHA256 = 0xC037, 
TLS_ECDHE_PSK_WITH_AES_256_CBC_SHA384 = 0xC038, 
TLS_RSA_WITH_AES_128_CCM = 0xC09C, 
TLS_RSA_WITH_AES_256_CCM = 0xC09D, 
TLS_DHE_RSA_WITH_AES_128_CCM = 0xC09E, 
TLS_DHE_RSA_WITH_AES_256_CCM = 0xC09F, 
TLS_PSK_WITH_AES_128_CCM = 0xC0A4, 
TLS_PSK_WITH_AES_256_CCM = 0xC0A5, 
中国银联 
版权所有

---
**[p98]**

Q/CUP 069—2015 
91 
TLS_DHE_PSK_WITH_AES_128_CCM = 0xC0A6, 
TLS_DHE_PSK_WITH_AES_256_CCM = 0xC0A7 
} SS_TLS_CipherSuites; 
——描述： 
TLS协议的密码学套件。 
8.3.5.3.6 SS_TLS_PSKInfo 
typedef struct 
{ 
TS_ObjectHandle pskKey; 
char* pskIdentity; 
} SS_TLS_PSKInfo; 
——描述： 
TLS协议的PSK信息。 
8.3.5.3.7 SS_TLS_SRPInfo 
typedef struct 
{ 
char* srpPassword; 
char* srpIdentity; 
} SS_TLS_SRPInfo; 
——描述： 
TLS协议的SRP信息。 
 
8.3.5.3.8 SS_TLS_ClientPDC 
typedef struct 
{ 
TS_ObjectHandleprivateKey; 
char*bulkCertChain; 
uint32_t bulkSize; 
} SS_TLS_ClientPDC; 
——描述： 
TLS协议的客户端PDC信息。 
中国银联 
版权所有

---
**[p99]**

Q/CUP 069—2015 
92 
8.3.5.3.9 SS_TLS_ServerPDC 
typedef struct 
{ 
TS_ObjectHandle publicKey; 
uint32_t size; 
} SS_TLS_ServerPDC; 
——描述： 
TLS协议的服务端PDC信息。 
8.3.5.3.10 SS_TLS_CertStorageCredential 
typedef struct 
{ 
void* buffer; 
uint32_t size; 
} SS_TLS_CertStorageCredential; 
——描述： 
TLS协议的存储的凭据信息。 
8.3.5.3.11 SS_TLS_Credentials 
typedef struct 
{ 
SS_TLS_CredentialType serverCredentials; 
union { 
SS_TLS_ServerPDC*serverCred; 
SS_TLS_CertStorageCredential*rootCertStore;//未使用 
}; 
 
SS_TLS_CredentialType clientCredentials; 
union { 
SS_TLS_ClientPDC*clientCred; 
SS_TLS_CertStorageCredential*clientCertStore;//未使用 
}; 
} SS_TLS_Credentials; 
——描述： 
TLS协议的凭据信息。 
中国银联 
版权所有

---
**[p100]**

Q/CUP 069—2015 
93 
8.3.5.3.12 SS_TLS_SocketCBData 
typedef struct { 
uint32_t cb_data_size;//数据长度 
uint8_t cb_data[];//数据缓冲区 
} SS_TLS_SocketCBData; 
——描述： 
通过指令码SS_TLS_BINDING_INFO和函数SS_Ioctl返回的数据缓冲区格式。其内容为符合RFC5929
规范的通道绑定信息。 
8.3.5.3.13 SS_TCPSetup 
typedef struct 
{ 
SS_IPVersionversion; 
char*serverAddr; 
uint16_t serverPort; 
} SS_TCPSetup; 
——描述： 
TCP协议的设定信息。 
8.3.5.3.14 SS_UDPSetup 
typedef struct 
{ 
SS_IPVersionversion; 
char*serverAddr; 
uint16_t serverPort; 
} SS_UDPSetup; 
——描述： 
UDP协议的设定信息。 
8.3.5.3.15 SS_TLSSetup 
typedef struct 
{ 
SS_TLS_VersionacceptServerVersion; 
SS_TLS_CipherSuites allowedCipherSuites; 
union { 
SS_TLS_PSKInfo PSKInfo; 
中国银联 
版权所有

---
**[p101]**

Q/CUP 069—2015 
94 
SS_TLS_SRPInfo SRPInfo; 
}; 
 
SS_TLS_Credentials credentials; 
SS_Socket *baseSocket; 
SS_Handle baseContext; 
} SS_TLSSetup; 
——描述： 
TLS协议的设定信息。 
8.3.5.3.16 SS_Socket 
typedef struct 
{ 
    const uint8_t protocolId; 
    TEEI_Result (* const SS_Open)(SS_Handle* ctx,  
void* setup, uint32_t* protocolError); 
 
    void (* const SS_Close)(SS_Handle ctx); 
 
    TEEI_Result (* const SS_Send)(SS_Handle ctx,  
const uint8_t* buf, uint32_t* length, uint32_t timeout); 
 
    TEEI_Result (* const SS_Recv)(SS_Handle ctx,  
uint8_t* buf, uint32_t* length, uint32_t timeout); 
 
    uint32_t (* const SS_Error)(SS_Handle ctx); 
 
    TEEI_Result (* const SS_Ioctl)(SS_Handle ctx,  
uint32_t commandCode, uint8_t* buf, uint32_t* length); 
 
} SS_Socket; 
——描述： 
代表一种socket协议的实现描述。 
8.3.5.3.17 SS_Handle 
typedef struct __TEEI_SSHandle* SS_Handle; 
——描述： 
socket连接的句柄。 
中国银联 
版权所有

---
**[p102]**

Q/CUP 069—2015 
95 
8.3.5.4 函数 
8.3.5.4.1 SS_Initialize 
TEEI_ResultSS_Initialize(); 
——描述： 
初始化一个服务访问的上下文。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.3.5.4.2 SS_Finalize 
voidSS_Finalize(); 
——描述： 
清理服务访问的上下文。 
——参数： 
无。 
8.3.5.4.3 SS_GetSocket 
TEEI_ResultSS_GetSocket(SS_ProtocolType protocol, SS_Socket** socket); 
——描述： 
获取指定协议实现的结构体。如果指定的协议参数没有在SS_ProtocolType枚举值中定义，那么即
为实现定义的协议。 
——参数： 
protocol:协议类型，可以指定自定义的协议。 
socket:输出参数，存储实现支持的结构体； 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果协议不支持，返回TEEI_ERROR_PROTOCOL。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
中国银联 
版权所有

---
**[p103]**

Q/CUP 069—2015 
96 
8.3.5.4.4 SS_Open 
TEEI_Result (* const SS_Open)(SS_Handle* ctx,  
void* setup, uint32_t* protocolError); 
——描述： 
打开Socket连接。 
——参数： 
ctx:输出参数，保存打开的socket连接。 
setup:特定于连接配置信息。 
protocolError:特定于协议的错误信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果超过指定时间，返回TEEI_ERROR_TIMEOUT。 
如果参数格式有误A，返回TEEI_ERROR_BAD_PARAMETERS。 
如果内存不足，返回TEEI_ERROR_OUT_OF_MEMORY。 
如果无法建立连接，返回TEEI_ERROR_COMMUNICATION。 
如果协议错误，返回TEEI_ERROR_PROTOCOL，具体错误可从参数protocolError获取。 
如果远端连接关闭，返回TEEI_ERROR_REMOTE_CLOSED。 
如果资源不足以建立连接，返回TEEI_ERROR_RESOURCE_LIMIT。 
如果主机名无法解析，返回TEEI_ERROR_HOSTNAME。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL_ERROR。 
8.3.5.4.5 SS_Close 
TEEI_Result (* const SS_Close)(SS_Handle ctx); 
——描述： 
关闭socket连接。 
——参数： 
ctx:打开的socket连接。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果超过指定时间，返回TEEI_ERROR_TIMEOUT。 
8.3.5.4.6 SS_Send 
TEEI_Result (* const SS_Send)(SS_Handle ctx,  
const uint8_t* buf, uint32_t* length, uint32_t timeout); 
中国银联 
版权所有

---
**[p104]**

Q/CUP 069—2015 
97 
——描述： 
发送数据。 
——参数： 
ctx:打开的socket连接。 
buf:要发送的数据。 
length:输入输出参数，要发送的数据的长度，返回时保存已发送数据的长度。 
timeout:超时时间。超时时间单位为毫秒，指定了超时时间后，函数有两种返回的情况：所有数据
都已经成功发送，或到达指定的超时时间。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果超过指定时间，返回TEEI_ERROR_TIMEOUT。 
如果参数格式有误，返回TEEI_ERROR_BAD_PARAMETERS。 
如果buf参数为NULL，返回TEEI_ERROR_BAD_PARAMETERS。 
如果无法建立连接，返回TEEI_ERROR_COMMUNICATION。 
如果远端连接关闭，返回TEEI_ERROR_REMOTE_CLOSED。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL_ERROR。 
8.3.5.4.7 SS_Recv 
TEEI_Result (* const SS_Recv)(SS_Handle ctx,  
uint8_t* buf, uint32_t* length, uint32_t timeout); 
——描述： 
接收数据。 
——参数： 
ctx:打开的socket连接。 
buf:接收数据的缓冲区。 
length:输出参数，返回时保存已接收数据的长度。 
timeout:超时时间。超时时间单位为毫秒，如果timeout指定为0，那么直接返回已经接收到的数据；
如果指定为大于0的值，那么函数会在buf填满后，或超时时间到达后返回。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果超过指定时间，返回TEEI_ERROR_TIMEOUT。 
如果参数格式有误A，返回TEEI_ERROR_BAD_PARAMETERS。 
如果无法建立连接，返回TEEI_ERROR_COMMUNICATION。 
如果远端连接关闭，返回TEEI_ERROR_REMOTE_CLOSED。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL_ERROR。 
中国银联 
版权所有

---
**[p105]**

Q/CUP 069—2015 
98 
8.3.5.4.8 SS_Error 
uint32_t (* const SS_Error)(SS_Handle ctx); 
——描述： 
获取特定于协议的错误信息。 
——参数： 
ctx:打开的socket连接。 
——返回值： 
返回获得的错误码。 
 
8.3.6 近场通信API 
8.3.6.1 头文件 
近场通信 API的头文件名字必须是“teei_platform_nfc_api.h”。 
#include “teei_platform_nfc_api.h”; 
8.3.6.2 数据类型 
8.3.6.2.1 NFC_WorkMode 
typedef enum { 
NFC_MODE_READER_WRITER, 
NFC_MODE_P2P, 
NFC_MODE_CARD_EMULATION 
} NFC_WorkMode; 
——描述： 
NFC的工作模式。 
8.3.6.2.2 NFC_RF_Protocol 
typedef enum { 
NFC_PROTOCOL_UNKNOWN, 
NFC_PROTOCOL_T1T, 
NFC_PROTOCOL_T2T, 
NFC_PROTOCOL_T3T, 
NFC_PROTOCOL_ISO_DEP, 
NFC_PROTOCOL_NFC_DEP 
} NFC_RF_Protocol; 
——描述： 
中国银联 
版权所有

---
**[p106]**

Q/CUP 069—2015 
99 
RF协议。 
8.3.6.2.3 NFC_RF_Technology 
typedef enum { 
NFC_RF_TECHNOLOGY_A= 0x00, 
NFC_RF_TECHNOLOGY_B= 0x01, 
NFC_RF_TECHNOLOGY_F= 0x02, 
NFC_RF_TECHNOLOGY_15693 = 0x03 
} NFC_RF_Technology; 
——描述： 
RF技术。 
8.3.6.2.4 NFC_RF_TechnologyAndMode 
typedef enum { 
NFC_DISCOVERY_TYPE_POLL_A= 0x00, 
NFC_DISCOVERY_TYPE_POLL_B= 0x01, 
NFC_DISCOVERY_TYPE_POLL_F= 0x02, 
NFC_DISCOVERY_TYPE_POLL_A_ACTIVE= 0x03, 
NFC_DISCOVERY_TYPE_POLL_F_ACTIVE= 0x05, 
NFC_DISCOVERY_TYPE_POLL_ISO15693= 0x06, 
NFC_DISCOVERY_TYPE_LISTEN_A= 0x80, 
NFC_DISCOVERY_TYPE_LISTEN_B= 0x81, 
NFC_DISCOVERY_TYPE_LISTEN_F= 0x82, 
NFC_DISCOVERY_TYPE_LISTEN_A_ACTIVE= 0x83, 
NFC_DISCOVERY_TYPE_LISTEN_F_ACTIVE= 0x85, 
NFC_DISCOVERY_TYPE_LISTEN_ISO15693= 0x86 
} NFC_RF_TechnologyAndMode; 
——描述： 
RF技术和工作模式。 
枚举值范围内，0x04,0x07–0x6F,0x87–0xEF为RFU，保留将来使用；0x70–0x7F为轮询模式下私有技
术枚举值，0xF0–0xFF为监听模式下私有技术枚举值。 
8.3.6.2.5 NFC_NFCEEStatus 
typedef enum { 
NFC_NFCEE_CONNECTED_ENABLED, 
NFC_NFCEE_CONNECTED_DISABLED, 
NFC_NFCEE_REMOVED 
} NFC_NFCEEStatus; 
中国银联 
版权所有

---
**[p107]**

Q/CUP 069—2015 
100 
——描述： 
RF协议。 
8.3.6.2.6 NFC_NFCEEProtocol 
typedef enum { 
NFC_NFCEE_PROTOCOL_APDU, 
NFC_NFCEE_PROTOCOL_HCI, 
NFC_NFCEE_PROTOCOL_T3T_CMDSET, 
NFC_NFCEE_PROTOCOL_TRANSPARENT 
} NFC_NFCEEProtocol; 
——描述： 
NFCEE协议。 
8.3.6.2.7 NFC_RoutingItemType 
typedef enum { 
NFC_ROUTING_ITEM_TYPE_TECH_BASED, 
NFC_ROUTING_ITEM_TYPE_PROTOCOL_BASED, 
NFC_ROUTING_ITEM_TYPE_AID_BASED 
} NFC_RoutingItemType; 
——描述： 
NFC路由表的路由项目型。 
8.3.6.2.8 NFC_PowerState 
typedef enum { 
NFC_POWER_STATE_BATTERY_OFF, 
NFC_POWER_STATE_SWITCHED_OFF, 
NFC_POWER_STATE_SWITCHED_ON 
} NFC_PowerState; 
——描述： 
NFC路由表的路由项目的电源状态。 
8.3.6.2.9 NFC_ConnectionHandle 
typedef struct __TEEI_NFC_ConnectionHandle* NFC_ConnectionHandle; 
——描述： 
代表逻辑连接的透明句柄。 
中国银联 
版权所有

---
**[p108]**

Q/CUP 069—2015 
101 
8.3.6.2.10 NFC_Device 
typedef struct __TEEI_NFC_Device* NFC_Device; 
——描述： 
代表NFC设备的透明句柄。 
8.3.6.2.11 NFC_Endpoint 
typedef struct { 
uint8_t id, 
NFC_RF_Protocol protocol, 
NFC_RF_TechnologyAndMode techAndMode 
} NFC_Endpoint; 
——描述： 
RF端点。 
8.3.6.2.12 NFC_NFCEE 
typedef struct { 
uint8_t id, 
NFC_NFCEEStatus status, 
uint8_t protocolCount, 
NFC_NFCEEProtocol* protocols, 
} NFC_NFCEE; 
——描述： 
NFCEE描述信息。 
8.3.6.2.13 NFC_RoutingItem 
typedef struct { 
    uint8_t nfceeId, 
    NFC_RoutingItemType type, 
    NFC_PowerState powerState, 
    union { 
        NFC_RF_Technology tech, 
NFC_RF_Protocol protocol, 
char* AID 
    } 
} NFC_RoutingItem; 
中国银联 
版权所有

---
**[p109]**

Q/CUP 069—2015 
102 
——描述： 
NFC控制器路由表项目。 
8.3.6.2.14 NFC_RoutingTable 
typedef struct { 
    uint8_t itemCount, 
    NFC_RoutingItem* items 
} NFC_RoutingTable; 
——描述： 
NFC控制器路由表。 
 
8.3.6.3 函数 
8.3.6.3.1 NFC_Initialize 
TEEI_ResultNFC_Initialize(); 
——描述： 
初始化一个服务访问的上下文。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.3.6.3.2 NFC_Finalize 
voidNFC_Finalize(); 
——描述： 
清理服务访问的上下文。 
——参数： 
无。 
8.3.6.3.3 NFC_DeviceUp 
TEEI_Result NFC_DeviceUp(NFC_Device* device); 
——描述： 
中国银联 
版权所有

---
**[p110]**

Q/CUP 069—2015 
103 
启动NFC设备。 
——参数： 
device:输出参数，代表NFC设备的不透明句柄对象。使用时在调用本函数时声明一个NFC_Device
结构体的对象，然后将其地址作为参数传递。函数内部会将开发者传递的空结构体进行填充，获得初始
化后的结构体对象。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果已经启动了NFC设备，返回TEEI_ERROR_BUSY。 
如果资源不足以执行操作，返回TEEI_ERROR_OUT_OF_MEMORY。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
 
8.3.6.3.4 NFC_DeviceDown 
TEEI_Result NFC_DeviceDown(NFC_Device device); 
——描述： 
关闭NFC设备。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.5 NFC_SetWorkMode 
TEEI_Result NFC_SetWorkMode(NFC_Device device, uint8_t mode); 
——描述： 
设置NFC设备工作模式。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
mode: NFC设备的工作模式。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果NFC设备正在进行轮询操作，返回TEEI_ERROR_BUSY。 
如果资源不足以执行操作，返回TEEI_ERROR_OUT_OF_MEMORY。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
中国银联 
版权所有

---
**[p111]**

Q/CUP 069—2015 
104 
8.3.6.3.6 NFC_StartPoll 
TEEI_Result NFC_StartPoll(NFC_Device device, 
uint_8 length, unsigned char* techModes); 
——描述： 
启动轮询过程。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
length：轮询的目标设备的技术模式数量。 
techModes：目标设备的技术模式，NFC_RF_TechnologyAndMode枚举值数组。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果NFC设备正在进行轮询操作，返回TEEI_ERROR_BUSY。 
如果资源不足以执行操作，返回TEEI_ERROR_OUT_OF_MEMORY。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
如果指定的NFC技术和模式不合法，返回TEEI_ERROR_NFC_TECHNOLOGY_MODE。 
8.3.6.3.7 NFC_StopPoll 
TEEI_Result NFC_StopPoll(NFC_Device device); 
——描述： 
停止轮询。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.8 NFC_ListEndpoint 
TEEI_Result NFC_ListEndpoint(NFC_Device device, 
uint8_t* count, NFC_Endpoint* endpoints); 
——描述： 
列出已发现的RF端点。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
中国银联 
版权所有

---
**[p112]**

Q/CUP 069—2015 
105 
count: 已发现的RF节点的数量。 
endpoints: 已发现的RF节点列表。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区容量不足，返回TEEI_ERROR_SHORT_BUFFER。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.9 NFC_ActivateEndpoint 
TEEI_Result NFC_ActivateEndpoint(NFC_Device device, uint8_t id); 
——描述： 
激活RF端点。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
id: 节点ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.10 NFC_DeactivateEndpoint 
TEEI_Result NFC_DeactivateEndpoint(NFC_Device device, uint8_t id); 
——描述： 
停用RF端点。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
id: 节点ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
 
8.3.6.3.11 NFC_OpenEndpointConnection 
TEEI_Result NFC_OpenEndpointConnection(NFC_Device device,  
uint8_t id, [out]NFC_ConnectionHandle* handle); 
中国银联 
版权所有

---
**[p113]**

Q/CUP 069—2015 
106 
——描述： 
打开同RF端点的连接。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
id: 节点ID。 
handle: 输出参数，代表连接的句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.12 NFC_CloseEndpointConnection 
TEEI_Result NFC_CloseEndpointConnection( 
NFC_ConnectionHandle handle); 
——描述： 
关闭同RF端点的连接。 
——参数： 
handle: 代表连接的句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.13 NFC_TransceiveEndpoint 
TEEI_Result NFC_TransceiveEndpoint( 
NFC_ConnectionHandle handle,  
[inbuf] unint32_t lengthRequest, void* request, 
[outbuf] unint32_t* lengthResponse, void* response); 
——描述： 
收发RF端点的信息。 
——参数： 
handle: 代表连接的句柄。 
lengthRequest: 请求消息体的长度。 
request: 请求消息体。 
lengthResponse: 响应消息体长度。 
中国银联 
版权所有

---
**[p114]**

Q/CUP 069—2015 
107 
response: 响应消息体。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果缓冲区容量不足，返回TEEI_ERROR_SHORT_BUFFER。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.14 NFC_ListNFCEE 
TEEI_Result NFC_ListNFCEE(NFC_Device device,  
unit8_t* count, NFC_NFCEE* nfcees); 
——描述： 
列举和NFC控制器连接的NFCEE。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
count: 请求消息体的长度。 
nfcees: 请求消息体。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果缓冲区容量不足，返回TEEI_ERROR_SHORT_BUFFER。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.15 NFC_SetNFCEEMode 
TEEI_Result NFC_SetNFCEEMode(NFC_Device device,  
uint8_t id, bool enable); 
——描述： 
设置NFCEE的工作模式。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
id: NFCEE对应的ID。 
enable: 启用或禁用NFCEE。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
中国银联 
版权所有

---
**[p115]**

Q/CUP 069—2015 
108 
8.3.6.3.16 NFC_OpenNFCEEConnection 
TEEI_Result NFC_OpenNFCEEConnection(NFC_Device device,  
uint8_t id, NFC_ConnectionHandle* handle); 
——描述： 
打开同NFCEE的连接。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
id: NFCEE对应的ID。 
handle: 输出参数，代表连接的句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.17 NFC_CloseNFCEEConnection 
TEEI_Result NFC_CloseNFCEEConnection(NFC_ConnectionHandle handle); 
——描述： 
关闭同NFCEE的连接。 
——参数： 
handle: 代表连接的句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.18 NFC_TransceiveNFCEE 
TEEI_Result NFC_TransceiveNFCEE(NFC_ConnectionHandle handle,  
[inbuf] unint32_t lengthRequest, void* request, 
[outbuf] unint32_t* lengthResponse, void* response); 
——描述： 
收发NFCEE的信息。 
——参数： 
handle: 代表连接的句柄。 
中国银联 
版权所有

---
**[p116]**

Q/CUP 069—2015 
109 
lengthRequest: 请求消息体的长度。 
request: 请求消息体。 
lengthResponse: 响应消息体长度。 
response: 响应消息体。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果缓冲区容量不足，返回TEEI_ERROR_SHORT_BUFFER。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
 
8.3.6.3.19 NFC_GetRoutingTable 
TEEI_Result NFC_GetRoutingTable(NFC_Device device,  
NFC_RoutingTable* table); 
——描述： 
获取NFC控制器路由表信息。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
table: NFC控制器路由表信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果资源不足以执行操作，返回TEEI_ERROR_OUT_OF_MEMORY。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.6.3.20 NFC_SetRoutingTable 
TEEI_Result NFC_SetRoutingTable(NFC_Device device, 
NFC_RoutingItem* item); 
——描述： 
设置NFC控制器路由表信息。 
——参数： 
device:代表NFC设备的不透明句柄对象。 
item: NFC控制器路由表条目信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
中国银联 
版权所有

---
**[p117]**

Q/CUP 069—2015 
110 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果资源不足以执行操作，返回TEEI_ERROR_OUT_OF_MEMORY。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.3.7 安全元件API 
8.3.7.1 头文件 
安全元件API的头文件名字必须是“teei_platform_se_api.h”。 
#include “teei_platform_se_api.h”; 
8.3.7.2 数据类型 
8.3.7.2.1 SE_ReaderProperties 
typedef struct __SE_ReaderProperties 
{ 
bool sePresent; //读卡器中是否存在SE 
bool teeOnly; //读卡器是否是TEE专有设备 
bool selectResponseEnable; // 是否存在SELECT命令的响应 
} SE_ReaderProperties; 
——描述： 
读卡器的属性信息。 
8.3.7.2.2 SE_AID 
typedef struct __TEEI_SEAID 
{ 
uint8_t *buffer //应用的AID值 
size_t bufferLen //应用AID的长度 
} SE_AID; 
——描述： 
SE应用的AID信息。 
8.3.7.2.3 句柄 
typedef struct __SE_ServiceHandle* SE_ServiceHandle 
typedef struct __SE_ReaderHandle* SE_ReaderHandle 
typedef struct __SE_SessionHandle* SE_SessionHandle 
typedef struct __SE_ChannelHandle* SE_ChannelHandle 
——描述： 
不透明的句柄类型，代表安全元件服务、读卡器、会话和通道。 
中国银联 
版权所有

---
**[p118]**

Q/CUP 069—2015 
111 
8.3.7.3 服务上下文 
8.3.7.3.1 SE_Initialize 
TEEI_ResultSE_Initialize(); 
——描述： 
初始化一个服务访问的上下文。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.3.7.3.2 SE_Finalize 
voidSE_Finalize(); 
——描述： 
清理服务访问的上下文。 
——参数： 
无。 
8.3.7.4 SE_Service 
8.3.7.4.1 SE_ServiceOpen 
TEEI_Result SE_ServiceOpen( 
[out] SE_ServiceHandle *seServiceHandle 
) 
——描述： 
打开安全元件服务。 
——参数： 
seServiceHandle:安全元件服务。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果已经打开服务，返回TEEI_ERROR_ACCESS_CONFLICT。 
如果资源不足以执行操作，返回TEEI_ERROR_OUT_OF_MEMORY。 
中国银联 
版权所有

---
**[p119]**

Q/CUP 069—2015 
112 
8.3.7.4.2 SE_ServiceClose 
void SE_ServiceClose(SE_ServiceHandle seServiceHandle) 
——描述： 
关闭安全元件服务。 
——参数： 
seServiceHandle:安全软件服务。 
8.3.7.4.3 SE_ServiceGetReaders 
TEEI_Result SE_ServiceGetReaders(  
SE_ServiceHandle seServiceHandle, 
[out] SE_ReaderHandle* seReaderHandleList, 
[inout] size_t* seReaderHandleListLen 
) 
——描述： 
获得可用的读卡器列表。 
——参数： 
seServiceHandle:安全元件服务。 
seReaderHandleList:读卡器句柄列表。 
seReaderHandleListLen:读卡器句柄列表长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果未找到读卡器，返回TEEI_ERROR_ITEM_NOT_FOUND。 
如果资源不足以执行操作，返回TEEI_ERROR_OUT_OF_MEMORY。 
如果缓冲区大小不足，返回TEEI_ERROR_SHORT_BUFFER。 
8.3.7.5 SE_Reader 
8.3.7.5.1 SE_ReaderGetProperties 
void SE_ReaderGetProperties( 
SE_ReaderHandle seReaderHandle 
[out] SE_ReaderProperties* readerProperties 
) 
——描述： 
获得读卡器属性信息。 
——参数： 
中国银联 
版权所有

---
**[p120]**

Q/CUP 069—2015 
113 
seReaderHandle:读卡器句柄。 
readerProperties:读卡器属性。 
8.3.7.5.2 SE_ReaderGetName 
TEEI_Result SE_ReaderGetName(SE_ReaderHandle seReaderHandle 
[outstring] char* readerName, size_t* readerNameLen 
) 
——描述： 
获得读卡器的名字。 
——参数： 
seReaderHandle:读卡器句柄。 
readerName:读卡器名字。 
readerNameLen:读卡器名字长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区大小不足，返回TEEI_ERROR_SHORT_BUFFER。 
8.3.7.5.3 SE_ReaderOpenSession 
TEEI_Result SE_ReaderOpenSession( 
SE_ReaderHandle seReaderHandle 
[out] SE_SessionHandle* seSessionHandle 
) 
——描述： 
打开安全元件会话。 
——参数： 
seReaderHandle:读卡器句柄。 
seSessionHandle:读卡器会话句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果无法建立会话，返回TEEI_ERROR_COMMUNICATION。 
如果资源不足以执行操作，返回TEEI_ERROR_OUT_OF_MEMORY。 
8.3.7.5.4 SE_ReaderCloseSessions 
void SE_ReaderCloseSessions(SE_ReaderHandle seReaderHandle) 
中国银联 
版权所有

---
**[p121]**

Q/CUP 069—2015 
114 
——描述： 
关闭所有安全元件会话。 
——参数： 
seReaderHandle:读卡器句柄。 
8.3.7.6 SE_Session 
8.3.7.6.1 SE_SessionGetATR 
TEEI_Result SE_SessionGetATR( 
SE_SessionHandle seSessionHandle 
[outbuf] void* atr, size_t* atrLen 
) 
——描述： 
获得安全元件的ATR信息。 
——参数： 
seSessionHandle:安全元件会话句柄。 
atr:ATR信息。 
atrLen: ATR信息长度 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果ATR不可用或I/O错误，返回TEEI_ERROR_COMMUNICATION。 
如果缓冲区大小不足，返回TEEI_ERROR_SHORT_BUFFER。 
8.3.7.6.2 SE_SessionIsClosed 
TEEI_Result SE_SessionIsClosed(SE_SessionHandle seSessionHandle) 
——描述： 
判断安全元件会话是否关闭。 
 
——参数： 
seSessionHandle:安全元件会话句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果ATR不可用或I/O错误，返回TEEI_ERROR_COMMUNICATION。 
8.3.7.6.3 SE_SessionClose 
void SE_SessionClose(SE_SessionHandle seSessionHandle) 
中国银联 
版权所有

---
**[p122]**

Q/CUP 069—2015 
115 
——描述： 
关闭安全元件会话。 
——参数： 
seSessionHandle:安全元件会话句柄。 
8.3.7.6.4 SE_SessionCloseChannels 
void SE_SessionCloseChannels(SE_SessionHandle seSessionHandle) 
——描述： 
关闭安全元件会话下打开的所有通道。 
——参数： 
seSessionHandle:安全元件会话句柄。 
8.3.7.6.5 SE_SessionOpenBasicChannel 
TEEI_ResultSE_SessionOpenBasicChannel( 
SE_SessionHandle seSessionHandle, 
[in] SE_AID *seAID, 
[out] SE_ChannelHandle *seChannelHandle 
) 
——描述： 
打开安全元件的基本通道。 
——参数： 
seSessionHandle:安全元件会话句柄。 
seAID:应用的AID信息。 
seChannelHandle:安全元件通道句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果ATR不可用或I/O错误，返回TEEI_ERROR_COMMUNICATION。 
如果安全元件会话已经关闭，返回TEEI_ERROR_BAD_STATE。 
如果参数格式有误，返回TEEI_ERROR_BAD_PARAMETERS。 
如果指定的AID不支持，返回TEEI_ERROR_NOT_SUPPORTED。 
如果访问没有得到授权，返回TEEI_ERROR_SECURITY。 
8.3.7.6.6 SE_SessionOpenLogicalChannel 
TEEI_Result SE_SessionOpenLogicalChannel( 
SE_SessionHandle seSessionHandle, 
中国银联 
版权所有

---
**[p123]**

Q/CUP 069—2015 
116 
[in] SE_AID *seAID, 
[out] SE_ChannelHandle *seChannelHandle 
) 
——描述： 
打开安全元件的逻辑通道。 
——参数： 
seSessionHandle:安全元件会话句柄。 
seAID:应用的AID信息。 
seChannelHandle:安全元件通道句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果ATR不可用或I/O错误，返回TEEI_ERROR_COMMUNICATION。 
如果安全元件会话已经关闭，返回TEEI_ERROR_BAD_STATE。 
如果参数格式有误，返回TEEI_ERROR_BAD_PARAMETERS。 
如果指定的AID不支持，返回TEEI_ERROR_NOT_SUPPORTED。 
如果访问没有得到授权，返回TEEI_ERROR_SECURITY。 
8.3.7.7 SE_Channel 
8.3.7.7.1 SE_ChannelClose 
void SE_ChannelClose(SE_ChannelHandle seChannelHandle) 
——描述： 
关闭安全元件通道。 
——参数： 
seChannelHandle:安全元件通道句柄。 
8.3.7.7.2 SE_ChannelSelectNext 
TEEI_Result SE_ChannelSelectNext( 
SE_ChannelHandle seChannelHandle) 
——描述： 
选择当前通道上的下一个应用。 
——参数： 
seChannelHandle:安全元件通道句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
中国银联 
版权所有

---
**[p124]**

Q/CUP 069—2015 
117 
如果ATR不可用或I/O错误，返回TEEI_ERROR_COMMUNICATION。 
如果安全元件会话已经关闭，返回TEEI_ERROR_BAD_STATE。 
如果安全元件不支持本功能，返回TEEI_ERROR_NOT_SUPPORTED。 
如果未找到下一个应用，返回TEEI_ERROR_ITEM_NOT_FOUND。 
8.3.7.7.3 SE_ChannelGetSelectResponse 
TEEI_Result SE_ChannelGetSelectResponse(  
SE_ChannelHandle seChannelHandle, 
[outbuf] void* response, size_t *responseLen 
) 
——描述： 
获得当前通道的SELECT命令的响应。 
——参数： 
seChannelHandle:安全元件通道句柄。 
response:响应消息。 
responseLen: 响应消息长度 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果ATR不可用或I/O错误，返回TEEI_ERROR_COMMUNICATION。 
如果安全元件会话已经关闭，返回TEEI_ERROR_BAD_STATE。 
如果数据不存在，返回TEEI_ERROR_NO_DATA。 
8.3.7.7.4 SE_ChannelTransmit 
TEEI_Result SE_ChannelTransmit(  
SE_ChannelHandle seChannelHandle 
[inbuf] void* command, size_t commandLen 
[outbuf] void* response, size_t *responseLen 
) 
——描述： 
收发安全元件APDU命令。 
——参数： 
seChannelHandle:安全元件通道句柄。 
command:命令。 
commandLen: 命令长度。 
response:响应消息。 
responseLen: 响应消息长度 
中国银联 
版权所有

---
**[p125]**

Q/CUP 069—2015 
118 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果ATR不可用或I/O错误，返回TEEI_ERROR_COMMUNICATION。 
如果安全元件会话已经关闭，返回TEEI_ERROR_BAD_STATE。 
如果参数格式错误，返回TEEI_ERROR_BAD_PARAMETERS。 
如果访问没有得到授权，返回TEEI_ERROR_SECURITY。 
8.3.7.7.5 SS_Ioctl 
TEEI_Result (* const SS_Ioctl)(SS_Handle ctx,  
uint32_t commandCode, uint8_t* buf, uint32_t* length); 
——描述： 
通过指令码执行特定于协议的功能。 
——参数： 
ctx:打开的socket连接。 
commandCode:操作指令码。 
buf:输入输出参数，要发送的数据，返回时保存接收的数据。 
length:输入输出参数，要发送的数据的长度，返回时保存已发送数据的长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果协议错误，返回TEEI_ERROR_PROTOCOL。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL_ERROR。 
8.3.8 RPMB 访问API 
RPMB（Replay Protected Memory Block），是防回放攻击的持久存储空间。RPMB可以以各种形式
实现，包括使用eMMC的RPMB存储区域，或配合单向计数器的普通存储区域。 
8.3.8.1 头文件 
RPMB访问API的头文件名字必须是“teei_platform_rpmb_api.h”。 
#include “teei_platform_rpmb_api.h”; 
8.3.8.2 数据类型 
8.3.8.2.1 句柄 
typedef struct __RPMB_ServiceHandle* RPMB_ServiceHandle; 
中国银联 
版权所有

---
**[p126]**

Q/CUP 069—2015 
119 
8.3.8.3 服务上下文 
8.3.8.3.1 RPMB_Initialize 
TEEI_ResultRPMB_Initialize(); 
——描述： 
初始化一个服务访问的上下文。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.3.8.3.2 RPMB_Finalize 
voidRPMB_Finalize(); 
——描述： 
清理服务访问的上下文。 
——参数： 
无。 
8.3.8.4 RPMB_Open 
TEEI_Result RPMB_Open(RPMB_ServiceHandle *handle) 
——描述： 
打开RPMB服务。 
——参数： 
handle:输出参数，RPMB服务访问句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果资源不足以执行操作，返回TEEI_ERROR_RESOURCE_LIMIT。 
8.3.8.5 RPMB_Close 
void RPMB_Close(RPMB_ServiceHandlehandle) 
——描述： 
关闭RPMB服务。 
中国银联 
版权所有

---
**[p127]**

Q/CUP 069—2015 
120 
——参数： 
handle:RPMB服务访问句柄。 
8.3.8.6 RPMB_GetBlockSpaceLimit 
TEEI_Result RPMB_GetBlockSpaceLimit( 
RPMB_ServiceHandle handle,  
uint32_t* limit); 
——描述： 
获得RPMB存储块的空间大小。 
——参数： 
handle:RPMB服务访问句柄。 
limit:输出参数，RPMB存储块的空间大小。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL_ERROR。 
8.3.8.7 RPMB_GetBlockCount 
TEEI_Result RPMB_GetBlockCount( 
RPMB_ServiceHandle handle,  
uint32_t* count); 
——描述： 
获得RPMB存储区可用存储块数量。 
——参数： 
handle:RPMB服务访问句柄。 
count:输出参数，RPMB存储区可用存储块数量。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL_ERROR。 
8.3.8.8 RPMB_ReadBlock 
TEEI_Result RPMB_ReadBlock( 
RPMB_ServiceHandle handle,  
uint32_t blockIndex, 
unsigned char* buffer); 
中国银联 
版权所有

---
**[p128]**

Q/CUP 069—2015 
121 
——描述： 
读取指定的RPMB存储块内容。 
——参数： 
handle:RPMB服务访问句柄。 
blockIndex: RPMB存储块索引，从0开始计数。 
buffer:输出参数，读取的RPMB存储块内容，缓冲区大小必须大于或等于RPMB存储块的空间大小。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区空间不足，返回TEEI_ERROR_SHORT_BUFFER。 
如果块索引不合法，返回TEEI_ERROR_BAD_PARAMETERS。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL_ERROR。 
8.3.8.9 RPMB_WriteBlock 
TEEI_Result RPMB_WriteBlock( 
RPMB_ServiceHandle handle,  
uint32_t blockIndex, 
unsigned char* buffer); 
——描述： 
把内容写入指定的RPMB存储块。 
——参数： 
handle:RPMB服务访问句柄。 
blockIndex: RPMB存储块索引，从0开始计数。 
buffer: 要写入RPMB存储块的内容，缓冲区大小必须等于RPMB存储块的空间大小。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果块索引不合法，返回TEEI_ERROR_BAD_PARAMETERS。 
如果输入内容过大，返回TEEI_ERROR_OVERFLOW。 
如果发生其他错误，返回TEEI_ERROR_INTERNAL_ERROR。 
8.3.9 文件系统API 
8.3.9.1 头文件 
文件系统API的头文件名字必须是“teei_platform_fs_api.h”。 
#include “teei_platform_fs_api.h”; 
中国银联 
版权所有

---
**[p129]**

Q/CUP 069—2015 
122 
8.3.9.2 数据类型 
8.3.9.2.1 文件访问模式 
#define FS_RDONLY 0x00000000//只写 
#define FS_WRONLY 0x00000001//只读 
#define FS_RDWR 0x00000002//可读可写 
#define FS_CREAT 0x00000100//如果文件不存在，就创建。 
#define FS_EXCL 0x00000200//和FS_CREAT一起使用，如果文件不存在，就创建，否则错误。 
#define FS_TRUNC 0x00001000//如果文件已经存在，打开方式也允许写，就会将文件变成0长度。 
#define FS_APPEND 0x00002000//如果设定，在write方法调用前，文件偏移量会变成文件结尾。 
——描述： 
文件访问模式。 
8.3.9.2.2 偏移量起始模式 
#define FS_SEEK_SET 0 //从起始位置开始的偏移量 
#define FS_SEEK_CUR 1 //从当前位置开始的偏移量 
#define FS_SEEK_END 2 //从末尾位置开始的偏移量 
——描述： 
偏移量起始模式。 
8.3.9.3 服务上下文 
8.3.9.3.1 FS_Initialize 
TEEI_ResultFS_Initialize(); 
——描述： 
初始化一个服务访问的上下文。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.3.9.3.2 FS_Finalize 
voidFS_Finalize(); 
——描述： 
清理服务访问的上下文。 
中国银联 
版权所有

---
**[p130]**

Q/CUP 069—2015 
123 
——参数： 
无。 
8.3.9.4 文件操作 
8.3.9.4.1 FS_Error 
intFS_Error(); 
——描述： 
获得上一次操作的错误码。 
——参数： 
无。 
——返回值： 
上一次操作的错误码。 
8.3.9.4.2 FS_Open 
TEEI_Result FS_Open(const char *pathname, int flags, int* fd); 
——描述： 
打开文件。 
——参数： 
pathname:文件名字，包括路径。 
flags:文件访问模式。 
fd：输出参数，文件描述符。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.4.3 FS_Rename 
TEEI_Result FS_Rename(const char *old_name, const char *new_name); 
——描述： 
重命名文件。 
——参数： 
old_name:原来的文件名字，包括路径。 
new_name:新的文件名字，包括路径。 
——返回值： 
中国银联 
版权所有

---
**[p131]**

Q/CUP 069—2015 
124 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.4.4 FS_Read 
TEEI_Result FS_Read(int fd, void *buf, uint32_t nbyte, uint32_t* size); 
——描述： 
读取文件内容。 
——参数： 
fd:文件描述符。 
buf:容纳读取的文件内容的缓冲区。 
nbyte：要读取的文件内容大小。 
size：输出参数，实际读取的文件内容大小。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.4.5 FS_Seek 
TEEI_Result FS_Seek(int fd, int32_t size, int whence, uint32_t* offset); 
——描述： 
设置当前的文件偏移量。 
——参数： 
fd:文件描述符。 
size:偏移量大小。 
whence：偏移量起始模式。 
offset：输出参数，设置后的偏移量位置。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.4.6 FS_Tell 
TEEI_Result FS_Tell(int fd, int32_t* offset); 
——描述： 
返回当前的文件偏移量。 
中国银联 
版权所有

---
**[p132]**

Q/CUP 069—2015 
125 
——参数： 
fd:文件描述符。 
offset：输出参数，当前的偏移量。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.4.7 FS_Close 
TEEI_Result FS_Close(int fd); 
——描述： 
关闭已经打开的文件。 
——参数： 
fd:文件描述符。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.4.8 FS_Size 
TEEI_Result FS_Size(int fd, uint32_t* size); 
——描述： 
获取文件大小。 
——参数： 
fd:文件描述符。 
size：输出参数，文件大小。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.4.9 FS_Write 
TEEI_Result FS_Write(int fd, const void * buf, uint32_t size, size_t* count); 
——描述： 
写入文件。 
——参数： 
中国银联 
版权所有

---
**[p133]**

Q/CUP 069—2015 
126 
fd:文件描述符。 
buf：要写入的内容。 
size：要写入的内容长度。 
count：输出参数，实际写入的字节数。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.4.10 FS_Unlink 
TEEI_Result FS_Unlink(const char *pathname); 
——描述： 
删除文件。 
——参数： 
pathname:文件名字，包括路径。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.4.11 FS_Truncate 
TEEI_Result FS_Truncate(int fd, uint32_t length); 
——描述： 
把文件变成指定长度。如果length < 文件长度，截断。如果length > 文件长度，添加'\0'填补。 
——参数： 
fd:文件描述符。 
length：文件的新长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.5 目录操作 
8.3.9.5.1 FS_Mkdir 
TEEI_Result FS_Mkdir(char* pathname); 
——描述： 
创建文件夹。 
中国银联 
版权所有

---
**[p134]**

Q/CUP 069—2015 
127 
——参数： 
pathname:文件夹路径。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.3.9.5.2 FS_Rmdir 
TEEI_Result FS_Rmdir(char* pathname);  
——描述： 
删除文件夹。 
——参数： 
pathname:文件夹路径。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了错误，返回TEEI_ERROR_INTERNAL，具体错误码使用FS_Error获取。 
8.4 内置可信服务 
8.4.1 可信存储服务SPI 
8.4.1.1 概述 
TEEI的可信存储服务包括TEE的私有存储空间及网络存储空间。TEEI中部署的每个TEE都有独立的私
有存储空间。同时，为了扩展TEE的存储资源以及共享需要，TEEI还为TEE提供了网络存储空间，即为可
信存储服务SPI提供的存储空间。——可信存储服务SPI提供的存储空间可以为TEE独有，也可以为多个
TEE共享。本节介绍了网络可信存储服务SPI的功能和设计概要。 
可信存储空间包括多个对象，每个对象由一个对象标识符来标识，该标识符是一个从0到64字节大
小的可变长度的二进制缓冲区。对象标识符可以包括任何类型，包括非打印字符对应的字节。对象可以
是一个加密密钥对象、一个密钥对对象、或是一个数据对象；每个对象都有一个类型，可精确地定义该
对象的内容。例如，对象类型可以是AES密钥、RSA密钥对、数据对象等；对象可以有一个相关联的数据
流。数据对象仅有一个数据流。各加密对象（即密钥或密钥对）有一个数据流、对象属性和元数据。 
8.4.1.2 头文件 
调用可信存储服务SPI之前需要声明“teei_platform_storage_spi.h”头文件。 
#include “teei_platform_storage_spi.h” 
8.4.1.3 常数 
8.4.1.3.1 安全保护级别 
typedef enum  
中国银联 
版权所有

---
**[p135]**

Q/CUP 069—2015 
128 
{  
NTS_ROLLBACK_REE = 0x0064,//防回滚攻击机制由REE实现 
NTS_ROLLBACK_ITS = 0x03e8//防回滚攻击机制由ITS控制的硬件机制实现 
} NTS_RollbackProtectLevel; 
——描述： 
可信存储服务必须对对象提供对回滚攻击提供最低级别的保护，实际数据存储区域REE系统是否可
以访问都是可以接受的。本规范定义了以下两个级别的保护级别。 
8.4.1.3.2 起始偏移位置 
typedef enum  
{  
NTS_DATA_SEEK_SET = 0x0000,//设置为起始位置+偏移量 
NTS_DATA_SEEK_CUR = 0x0001,//设置为当前位置+偏移量 
NTS_DATA_SEEK_END = 0x0002//设置为最终位置+偏移量 
} NTS_SEEK_OFFSET; 
——描述： 
在对象相关联的数据流中，移动数据位置时可能存在的起始偏移量。 
8.4.1.3.3 存储空间类型 
typedef enum  
{  
NTS_STORAGE_PRIVATE = 0x00000001,//TEE独有的存储区域 
NTS_STORAGE_PUBLIC = 0x80000000//TEE之间共享的存储区域 
} NTS_StorageType; 
——描述： 
数据对象所存储的空间类型。 
8.4.1.3.4 数据访问控制标志位 
typedef enum  
{  
NTS_DATA_FLAG_ACCESS_READ = 0x00000001,//读权限 
NTS_DATA_FLAG_ACCESS_WRITE = 0x00000002,//写权限 
NTS_DATA_FLAG_ACCESS_WRITE_META = 0x00000004,//写元数据权限 
NTS_DATA_FLAG_SHARE_READ = 0x00000010,//共享读权限 
NTS_DATA_FLAG_SHARE_WRITE = 0x00000020,//共享写权限 
NTS_DATA_FLAG_CREATE = 0x00000200,//创建对象权限 
NTS_DATA_FLAG_OVERWRITE = 0x00000400//覆盖写权限 
中国银联 
版权所有

---
**[p136]**

Q/CUP 069—2015 
129 
} NTS_DataAccessFlag; 
——描述： 
数据访问控制标志。执行NTS_OpenObject 或者NTS_CreateObject操作时，可以同时打开多个指向
同一个对象的操作句柄，打开操作成功与否依赖于指定的访问控制条件，以下是该规则描述。 
表8-26 共享访问规则 
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
8.4.1.3.5 用途标志位 
typedef enum  
{  
NTS_USAGE_EXTRACTABLE = 0x00000001,//获取数据 
NTS_USAGE_ENCRYPT = 0x00000002,//加密 
NTS_USAGE_DECRYPT = 0x00000004,//解密 
NTS_USAGE_MAC = 0x00000008,//消息验证码 
NTS_USAGE_SIGN = 0x00000010,//签名 
NTS_USAGE_VERIFY = 0x00000020,//验证签名 
NTS_USAGE_DERIVE = 0x00000040//派生密钥 
} NTS_KeyUsage; 
——描述： 
密钥对象用途标志。 
中国银联 
版权所有

---
**[p137]**

Q/CUP 069—2015 
130 
 
8.4.1.3.6 范围限制常数 
typedef enum  
{  
TS_DATA_MAX_POSITION = 0xFFFFFFFF,//数据对象的最大长度 
TS_OBJECT_ID_MAX_LEN = 64 //对象ID的最大长度 
} NTS_LimitConstants; 
——描述： 
其他常数信息，描述参考上面的代码模板。 
 
8.4.1.3.7 对象类型及密钥长度 
typedef enum  
{  
NTS_TYPE_AES = 0xA0000010,//128位, 192位, 或 256位。 
NTS_TYPE_DES = 0xA0000011,//始终是56位。 
NTS_TYPE_DES3 = 0xA0000013,//112位或168位。 
NTS_TYPE_HMAC_MD5 = 0xA0000001,//在64位和512位之间，且是8位的整数倍。 
NTS_TYPE_HMAC_SHA1 = 0xA0000002,//在80位和512位之间，且是8位的整数倍。 
NTS_TYPE_HMAC_SHA224 = 0xA0000003,//在112位和512位之间，且是8位的整数倍。 
NTS_TYPE_HMAC_SHA256 = 0xA0000004,//在192位和1024位之间，且是8位的整数倍。 
NTS_TYPE_HMAC_SHA384 = 0xA0000005,//在256位和1024位之间，且是8位的整数倍。 
NTS_TYPE_HMAC_SHA512 = 0xA0000006,//在256位和1024位之间，且是8位的整数倍。 
//对象的大小是以模数内的位数为单位的。所有密钥大小必须支持最多2048位。 
//要支持更大的密钥大小，这取决于实现。密钥大小最小值为256位。 
NTS_TYPE_RSA_PUBLIC_KEY = 0xA0000030, 
NTS_TYPE_RSA_KEYPAIR = 0xA1000030,//与RSA公开密钥大小相同。 
NTS_TYPE_DSA_PUBLIC_KEY = 0xA0000031,//在512位和1024位之间，且是64位的整数倍。 
NTS_TYPE_DSA_KEYPAIR = 0xA1000031,//同DSA公钥长度相同 
NTS_TYPE_DH_KEYPAIR = 0xA1000032,//在256位到2048位范围内。 
//如果支持ECC，那么定义在椭圆曲线类中的的密钥长度必须支持。 
NTS_TYPE_ECDSA_PUBLIC_KEY = 0xA0000041, 
NTS_TYPE_ECDSA_KEYPAIR = 0xA1000041,//如果支持ECC，那么必须同ECDSA公钥长度相同。 
//如果支持ECC，那么定义在椭圆曲线类中的的密钥长度必须支持。 
NTS_TYPE_ECDH_PUBLIC_KEY = 0xA0000042, 
NTS_TYPE_ECDH_KEYPAIR = 0xA1000042,//如果支持ECC，那么必须同ECDH公钥长度相同。 
//8位的整数倍，最高4096位。通常不直接用于密码学操作，而是用来进行密钥派生。 
NTS_TYPE_GENERIC_SECRET = 0xA0000000, 
NTS_TYPE_CORRUPTED_OBJECT = 0xA00000BE,//损坏的对象 
中国银联 
版权所有

---
**[p138]**

Q/CUP 069—2015 
131 
NTS_TYPE_DATA = 0xA00000BF//0 –所有的数据都存在于关联的数据流对象中 
} NTS_ObjectType; 
——描述： 
可信存储服务支持的对象类型，以及密钥类型的对象的允许长度范围。 
8.4.1.3.8 属性标识 
表8-27 属性标识 
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
中国银联 
版权所有

---
**[p139]**

Q/CUP 069—2015 
132 
ID 
值 
保护 
类型 
格式 
描述 
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
binary，无符号的字节数组； 
bignum，无符号的大端序格式大数，起始部分为0x00 是运行的； 
int，代表单一整数属性值； 
描述列中的p,q,dp,dq,iq,g,y,x,l,d 均为密码学算法中的变量； 
属性ID格式： 
[29]位：定义属性是数值类型还是缓冲区类型 
0: 缓冲区类型属性 
1: 数值类型属性 
[28]位：定义属性是被保护还是公开的 
0: 被保护的属性 
1: 公开属性 
 
不同的对象类型包含的属性是不同的，以下是对象类型所对应的属性列表。 
表8-28 对象类型与属性对应 
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
中国银联 
版权所有

---
**[p140]**

Q/CUP 069—2015 
133 
对象类型 
对应的属性 
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
中国银联 
版权所有

---
**[p141]**

Q/CUP 069—2015 
134 
对象类型 
对应的属性 
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
 
 
8.4.1.4 数据类型 
8.4.1.4.1 NTS_Attribute 
typedef struct  
{  
uint32_tattrType; //0：缓冲区属性；1：值属性 
    uint32_t attrId;//属性标识，参考NTS_ATTR_XXX类型的常量 
union  
{  
struct  
{  
void* buffer; uint32_tlength;  
} bufferAttr; //对应缓冲区类型的属性 
struct  
{  
中国银联 
版权所有

---
**[p142]**

Q/CUP 069—2015 
135 
uint32_t a;  
uint32_t b; 
}valueAttr; //对应值类型的属性 
};  
} NTS_Attribute; 
——描述： 
对象属性信息。可能是缓冲区类型的对象，也可能是值类型对象。 
8.4.1.4.2 NTS_ObjectInfo 
typedef struct  
{  
    uint32_tobjectType;//对象类型，参考NTS_TYPE_XXX名称的常量定义 
    uint32_t keySize;//密钥长度，以比特为单位。普通数据对象该项设为0 
    uint32_t objectUsage;//描述对象用途的位向量，参考NTS_USAGE_XXX名称的常量定义 
    uint32_t dataSize;//对象的关联数据对象的大小 
    uint32_t dataPosition;//对象的关联数据对象的位置偏移量 
    uint32_t handleFlags;//对象的数据访问控制标志位，参考NTS_DATA_FLAG_XXX名称的常量定义 
} NTS_ObjectInfo; 
——描述： 
对象描述信息。 
8.4.1.4.3 NTS_ObjectAttributes 
typedef struct  
{  
    uint32_tattrCount;//对象属性的数量 
NTS_Attribute[] attributes;//属性数组，数组元素个数为attrCount 
char* objectId;//属性所述对象的唯一标识 
} NTS_ObjectAttributes; 
——描述： 
对象属性信息的集合。 
8.4.1.4.4 NTS_ObjectHandle 
typedef struct __NTS_ObjectHandle* NTS_ObjectHandle 
——描述： 
对象操作句柄。 
中国银联 
版权所有

---
**[p143]**

Q/CUP 069—2015 
136 
8.4.1.4.5 NTS_ObjectEnumerator 
typedef struct __NTS_ObjectEnumerator* NTS_ObjectEnumerator 
——描述： 
对象枚举器。 
8.4.1.5 服务上下文 
8.4.1.5.1 NTS_Initialize 
TEEI_ResultNTS_Initialize(uint8_t secure_pipe,  
TEE_Message* message, uint32_t bufferSize); 
——描述： 
初始化一个服务访问的上下文。本函数接收安全Pipe标志为参数，并且在内部使用TEEI_ConnectTA
方法初始化服务访问Pipe。本函数调用后，对于本服务的所有后续访问都在此Pipe和安全Pipe参数基础
上进行。 
——参数： 
secure_pipe:安全通道标识，1为使用安全通道，其他值使用非安全通道。 
message:创建连接所需的其他必要信息，由实现定义。 
bufferSize:字节表示的缓冲区长度，相当于通信带宽。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果无法连接到内置服务主机，返回TEEI_ERROR_HOST_NOT_EXIST。 
如果无法连接到内置服务，返回TEEI_ERROR_TA_NOT_EXIST。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
 
8.4.1.5.2 NTS_Finalize 
voidNTS_Finalize(); 
——描述： 
清理服务访问的上下文。本函数内部自动使用TEEI_DisConnectTA来关闭已经打开的Pipe。 
——参数： 
无。 
中国银联 
版权所有

---
**[p144]**

Q/CUP 069—2015 
137 
8.4.1.6 通用操作 
8.4.1.6.1 NTS_GetProtectionLevel 
TEEI_ResultNTS_GetProtectionLevel(uint32_t *level); 
——描述： 
获取可信存储服务SPI的防止回滚攻击的安全保护级别。 
——参数： 
level: 输出参数，包含回滚攻击安全保护级别信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
 
8.4.1.7 对象访问操作 
8.4.1.7.1 NTS_OpenObject 
TEEI_ResultNTS_GetProtectionLevel( 
uint32_t storageType,  
char* objectId,  
uint32_t dataAccessFlag,  
NTS_ObjectHandle* handle); 
——描述： 
打开一个可信存储对象，返回一个对象操作句柄，并且能够用该句柄访问对象的属性和数据流。可
以同时打开指向同一个对象的多个操作句柄，但必须在访问控制限制运行的条件下。 
——参数： 
storageType: 存储空间类型，参考对应的常数定义。 
objectId: 对象唯一标识。注意，该参数内容不能够驻留于共享内存。 
dataAccessFlag: 对象访问控制标志。 
handle: 输出参数，包含打开的对象句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果未找到该对象，TEEI_ERROR_ITEM_NOT_FOUND  
如果访问权限冲突，TEEI_ERROR_ACCESS_CONFLICT  
如果内存溢出，TEEI_ERROR_OUT_OF_MEMORY  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE  
中国银联 
版权所有

---
**[p145]**

Q/CUP 069—2015 
138 
8.4.1.7.2 NTS_CreateObject 
TEEI_ResultNTS_CreateObject( 
uint32_t storageType,  
char* objectId,  
uint32_t dataAccessFlag, 
NTS_ObjectAttributes* attributes, 
uint32_t bufferLength, 
void* buffer, 
NTS_ObjectHandle* handle); 
——描述： 
创建一个附带初始化属性和初始化数据流内容的对象，并且可以有选择性的返回一个指向已创建对
象句柄。 
——参数： 
storageType: 存储空间类型，参考对应的常数定义。 
objectId: 对象唯一标识。注意，该参数内容不能够驻留于共享内存。 
dataAccessFlag: 对象访问控制标志。 
attributes: 对象属性集合。 
bufferLength: 数据对象内容长度。 
buffer: 数据对象内容。 
handle: 输出参数，包含打开的对象句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS。 
未找到指定的存储空间，TEEI_ERROR_ITEM_NOT_FOUND。  
如果访问权限冲突，TEEI_ERROR_ACCESS_CONFLICT。 
如果内存溢出，TEEI_ERROR_OUT_OF_MEMORY。 
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT。 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE。 
 
8.4.1.7.3 NTS_GetObjectInfo 
TEEI_ResultNTS_GetObjectInfo( 
NTS_ObjectHandle handle, 
NTS_ObjectInfo* objectInfo); 
——描述： 
获取对象特征信息。 
——参数： 
中国银联 
版权所有

---
**[p146]**

Q/CUP 069—2015 
139 
handle:包含打开的对象句柄。 
objectInfo: 输出参数，包含对象信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS。  
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE。 
如果没有足够的存储空间，TEEI_ERROR_STORAGE_NO_SPACE。 
8.4.1.7.4 NTS_RestrictObjectUsage 
TEEI_ResultNTS_RestrictObjectUsage( 
NTS_ObjectHandle handle, 
uint32_tdataAccessFlag); 
——描述： 
限制对象使用标识。 
——参数： 
handle:包含打开的对象句柄。 
dataAccessFlag: 对象访问控制标志。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS。  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT。  
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE。 
 
8.4.1.7.5 NTS_GetObjectBufferAttribute 
TEEI_ResultNTS_GetObjectBufferAttribute( 
NTS_ObjectHandle handle, 
uint32_t attributeId, 
NTS_Attribute attribute); 
——描述： 
从对象中提取一个缓冲区属性。 
——参数： 
handle:包含打开的对象句柄。 
attributeId: 目标属性标识。 
attribute: 输出参数，目标属性信息。 
中国银联 
版权所有

---
**[p147]**

Q/CUP 069—2015 
140 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果未找到该属性，TEEI_ERROR_ITEM_NOT_FOUND  
如果缓冲区太小，TEEI_ERROR_SHORT_BUFFER 
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE  
8.4.1.7.6 NTS_GetObjectValueAttribute 
TEEI_ResultNTS_GetObjectValueAttribute( 
NTS_ObjectHandle handle, 
uint32_t attributeId, 
NTS_Attribute attribute); 
——描述： 
从对象中提取一个值属性。 
——参数： 
handle:包含打开的对象句柄。 
attributeId: 目标属性标识。 
attribute: 输出参数，目标属性信息。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果未找到该属性，TEEI_ERROR_ITEM_NOT_FOUND  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE  
8.4.1.7.7 NTS_CloseObject 
TEEI_ResultNTS_CloseObject(NTS_ObjectHandle handle); 
——描述： 
关闭已开启的对象。 
——参数： 
handle:包含打开的对象句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
中国银联 
版权所有

---
**[p148]**

Q/CUP 069—2015 
141 
8.4.1.7.8 NTS_CloseAndDeleteObject 
TEEI_ResultNTS_CloseAndDeleteObject(NTS_ObjectHandle handle); 
——描述： 
关闭和删除对象。对象索引必须使用TS_DATA_FLAG_ACCESS_WRITE_META访问权限开启，这意味着访
问对象是排他的。 
——参数： 
handle:包含打开的对象句柄。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE。 
8.4.1.7.9 NTS_RenameObject 
TEEI_ResultNTS_RenameObject(NTS_ObjectHandle handle, char* objectId); 
——描述： 
改变对象的标识符。对象索引必须由TS_DATA_FLAG_ACCESS_WRITE_META访问权限开启，这意味着访
问对象是排他的。 
——参数： 
handle:包含打开的对象句柄。 
objectId: 新的对象唯一标识。注意，该参数内容不能够驻留于共享内存。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果访问权限冲突，TEEI_ERROR_ACCESS_CONFLICT。  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT。  
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE。 
8.4.1.8 对象枚举操作 
8.4.1.8.1 NTS_AllocateObjectEnumerator 
TEEI_ResultNTS_AllocateObjectEnumerator(NTS_ObjectEnumerator* enumerator); 
——描述： 
分配对象枚举器。 
——参数： 
中国银联 
版权所有

---
**[p149]**

Q/CUP 069—2015 
142 
enumerator: 输出参数，分配的对象枚举器。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果内存溢出，TEEI_ERROR_OUT_OF_MEMORY  
8.4.1.8.2 NTS_FreeObjectEnumerator 
TEEI_ResultNTS_FreeObjectEnumerator(NTS_ObjectEnumerator enumerator); 
——描述： 
释放全部关联对象枚举器的资源。在执行该操作之后，此枚举器不再有效。 
——参数： 
enumerator: 已分配的对象枚举器。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
8.4.1.8.3 NTS_ResetObjectEnumerator 
TEEI_ResultNTS_ResetObjectEnumerator(NTS_ObjectEnumerator enumerator); 
——描述： 
重置对象枚举索引为初始化状态，如果枚举已经开始，那么将被重置。 
——参数： 
enumerator: 已分配的对象枚举器。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
8.4.1.8.4 NTS_StartObjectEnumerator 
TEEI_ResultNTS_StartObjectEnumerator( 
uint32_t storageType, 
NTS_ObjectEnumerator enumerator); 
——描述： 
启动既定可信存储中的所有对象的枚举。对象信息可以执行NTS_GetNextObject操作重新获得。枚
举不一定要反映一个给定的相一致的存储状态：在枚举过程中，其它TEE或者其它TEE的实例都可以创建、
删除或者重命名对象。停止一个枚举，TEE可以调用NTS_ResetObjectEnumerator操作，从可信存储中分
中国银联 
版权所有

---
**[p150]**

Q/CUP 069—2015 
143 
离枚举。TEE可以调用NTS_FreeObjectEnumerator操作释放对象枚举。如果当一个枚举已经被启动的时
候调用该操作，那么首先重置该枚举然后再重启。 
——参数： 
storageType: 存储空间类型，参考对应的常数定义。 
enumerator: 已分配的对象枚举器。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果未找到该存储对象，TEEI_ERROR_ITEM_NOT_FOUND  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE  
8.4.1.8.5 NTS_GetNextObject 
TEEI_ResultNTS_GetNextObject( 
NTS_ObjectEnumerator enumerator, 
NTS_ObjectInfo* objectInfo, 
char* objectId); 
——描述： 
枚举下一个对象，并且返回该对象的信息：类型、大小、标识符，等等。如果不再有枚举对象，或
者没有已启动的枚举，那么操作返回TS_ERROR_ITEM_NOT_FOUND。 
——参数： 
enumerator: 已分配的对象枚举器。 
objectInfo: 输出参数，对象信息，同NTS_GetObjectInfo方法返回的信息相同。 
objectId: 输出参数，对象唯一标识，可用来打开对象。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果未找到下一个对象，TEEI_ERROR_ITEM_NOT_FOUND  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE  
8.4.1.9 数据流访问操作 
8.4.1.9.1 NTS_ReadObjectData 
TEEI_ResultNTS_ReadObjectData( 
NTS_ObjectHandle handle, 
uint32_t size, 
void* buffer, 
中国银联 
版权所有

---
**[p151]**

Q/CUP 069—2015 
144 
uint32_t* count); 
——描述： 
从数据流中读取指定数量的字节内容。 
——参数： 
handle:包含打开的对象句柄。 
size: 要读取的数据的字节数量。 
buffer: 输出参数，读取的字节内容。 
count: 输出参数，实际读取的字节数。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE  
8.4.1.9.2 NTS_WriteObjectData 
TEEI_ResultNTS_WriteObjectData( 
NTS_ObjectHandle handle, 
uint32_t size, 
void* buffer); 
——描述： 
数据流中写入指定数量的字节内容。写入数据流是一个原子；操作完全成功，或者不写入。 
——参数： 
handle:包含打开的对象句柄。 
size: 要写入的数据的字节数量。 
buffer: 要写入的字节内容。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果没有足够的存储空间，TEEI_ERROR_STORAGE_NO_SPACE  
如果数值超出数据类型存储范围，TEEI_ERROR_OVERFLOW  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE  
8.4.1.9.3 NTS_TruncateObjectData 
TEEI_ResultNTS_TruncateObjectData( 
NTS_ObjectHandle handle, 
中国银联 
版权所有

---
**[p152]**

Q/CUP 069—2015 
145 
uint32_t size); 
——描述： 
改变数据流的大小。如果新长度小于当前数据流大小，那么所有超出新长度的字节将被删除。如果
新长度大于当前数据流大小，那么用０填充数据流，一直扩充到数据流末端。截取数据流是一个原子：
数据流成功被截取，或者不做任何操作。 
——参数： 
handle:包含打开的对象句柄。 
size:数据流对象的新大小。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果没有足够的存储空间，TEEI_ERROR_STORAGE_NO_SPACE  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE  
8.4.1.9.4 NTS_SeekObjectData 
TEEI_ResultNTS_SeekObjectData( 
NTS_ObjectHandle handle, 
uint32_t offset, 
uint32_t whence); 
——描述： 
设置当前对象的数据位置指示器。 
——参数： 
handle:包含打开的对象句柄。 
offset: 指定的偏移量。 
whence: 数据流偏移的位置基点，参考“起始偏移量”。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，TEEI_ERROR_BAD_PARAMETERS  
如果数值超出数据类型存储范围，TEEI_ERROR_OVERFLOW  
如果对象损坏，TEEI_ERROR_CORRUPT_OBJECT 
如果对象所在的存储区域无法访问，TEEI_ERROR_STORAGE_NOT_AVAILABLE  
 
中国银联 
版权所有

---
**[p153]**

Q/CUP 069—2015 
146 
8.4.2 可信用户交互SPI 
针对需要为用户显示敏感信息或者获取用户敏感数据的TA的实现，为软件开发人员定义了可信用户
交互服务。 
8.4.2.1 头文件 
调用可信用户交互API之前需要声明 “teei_platform_tui_spi.h”头文件。 
#include “teei_platform_tui_spi.h” 
8.4.2.2 常数 
表8-29 常数 
常量名和别名 
值 
描述 
TUI_NUMBER_BUTTON_TYPES 
0x00000006 
指定按钮类型的数目 
8.4.2.3 数据类型 
8.4.2.3.1 TUI_EntryFieldMode 
typedef enum  
{  
TUI_HIDDEN_MODE=0,  
TUI_CLEAR_MODE,  
TUI_TEMPORARY_CLEAR_MODE  
} TUI_EntryFieldMode; 
——描述： 
输入域显示字符时所支持的模式。 
8.4.2.3.2 TUI_EntryFieldType   
typedef enum  
{  
TUI_NUMERICAL=0,  
TUI_ALPHANUMERICAL  
} TUI_EntryFieldType; 
——描述： 
输入域的可能类型。 
中国银联 
版权所有

---
**[p154]**

Q/CUP 069—2015 
147 
8.4.2.3.3 TUI_ScreenOrientation 
typedef enum  
{  
TUI_PORTRAIT=0,  
TUI_LANDSCAPE  
} TUI_ScreenOrientation; 
——描述： 
支持的画面显示方向。 
8.4.2.3.4 TUI_ButtonType 
typedef enum  
{  
TUI_CORRECTION=0,  
TUI_OK,  
TUI_CANCEL,  
TUI_VALIDATE,  
TUI_PREVIOUS,  
TUI_NEXT  
} TUI_ButtonType;   
——描述： 
可信用户交互画面上可能出现的6种按钮。大于0x8000的数值可由实现者利用进行自定义类型的定
义。 
——可能的button组合方式： 
表8-30 可能的button 组合方式 
TUI_OK 
TUI_CANCEL 
TUI_VALIDATE 
TUI_PREVIOUS 
TUI_NEXT 
● 
 
 
 
 
● 
 
 
● 
 
 
● 
● 
 
 
 
● 
 
 
● 
 
● 
 
● 
● 
 
● 
● 
● 
 
另外，只要存在输入字段，TUI_CORRECTION 按钮就必须存在。 
中国银联 
版权所有

---
**[p155]**

Q/CUP 069—2015 
148 
8.4.2.3.5 TUI_ImageSource 
typedef enum  
{  
TUI_NO_SOURCE=0,  
TUI_REF_SOURCE,  
TUI_OBJECT_SOURCE  
} TUI_ImageSource; 
——描述： 
图片的所有可能来源。 
8.4.2.3.6 TUI_Image 
typedef struct  
{  
TUI_ImageSource source;  
union  
{  
struct  
{  
[inbuf] void* image; size_t imageLength;  
} 
ref;  
struct  
{  
uint32_t storageID;  
[in(objectIDLength)] void* objectID; size_t objectIDLen;  
} 
object;  
};  
uint32_t width;  
uint32_t height;  
} TUI_Image; 
——描述： 
定义了一种处理标签域和按钮图片的方式。一个图片来源可以是一个缓冲区或可信存储内的对象。 
8.4.2.3.7 TUI_ScreenLabel 
typedef struct  
{  
char * text;  
中国银联 
版权所有

---
**[p156]**

Q/CUP 069—2015 
149 
uint32_t textXOffset;  
uint32_t textYOffset;  
uint8_t textColor[3];  
TUI_Image image;  
uint32_t imageXOffset;  
uint32_t imageYOffset;  
} TUI_ScreenLabel; 
——描述： 
定义了TA所定义的标签域的内容，其能支持TA品牌信息和TA定义的消息。 
8.4.2.3.8 TUI_Button 
typedef struct  
{  
char* text;  
TUI_Image image;  
} TUI_Button; 
——描述： 
定义一个按钮的内容。 
8.4.2.3.9 TUI_ScreenConfiguration 
typedef struct  
{  
TUI_ScreenOrientation screenOrientation;  
TUI_ScreenLabel label;  
TUI_Button* buttons[TUI_NUMBER_BUTTON_TYPES];  
bool requestedButtons[TUI_NUMBER_BUTTON_TYPES];  
} TUI_ScreenConfiguration; 
——描述： 
能够配置一个可信用户交互画面。 
8.4.2.3.10 TUI_ScreenButtonInfo 
typedef struct  
{  
char* buttonText;  
uint32_t buttonWidth;  
uint32_t buttonHeight;  
bool buttonTextCustom;  
中国银联 
版权所有

---
**[p157]**

Q/CUP 069—2015 
150 
bool buttonImageCustom;  
} TUI_ScreenButtonInfo; 
——描述： 
表示一个给定方向的可信用户交互画面上的按钮信息。 
8.4.2.3.11 TUI_ScreenInfo 
typedef struct  
{  
uint32_t grayscaleBitsDepth;  
uint32_t redBitsDepth;  
uint32_t greenBitsDepth;  
uint32_t blueBitsDepth;  
uint32_t widthInch;  
uint32_t heightInch;  
uint32_t maxEntryFields;  
uint32_t entryFieldLabelWidth;  
uint32_t entryFieldLabelHeight;  
uint32_t maxEntryFieldLength;  
uint8_t labelColor[3];  
uint32_t labelWidth;  
uint32_t labelHeight;  
TUI_ScreenButtonInfo buttonInfo[TUI_NUMBER_BUTTON_TYPES];  
} TUI_ScreenInfo; 
——描述： 
表示一个给定方向的画面信息。 
8.4.2.3.12 TUI_EntryField 
typedef struct  
{  
char* label;  
TUI_EntryFieldMode mode;  
TUI_EntryFieldType type;  
uint32_t minExpectedLength;  
uint32_t maxExpectedLength;  
[outstring] char* buffer; size_t bufferLength,  
} TUI_EntryField; 
——描述： 
表示获取用户输入的输入域。 
中国银联 
版权所有

---
**[p158]**

Q/CUP 069—2015 
151 
8.4.2.4 函数 
8.4.2.4.1 TUI_Initialize 
TEEI_ResultTUI_Initialize(uint8_t secure_pipe,  
TEE_Message* message, uint32_t bufferSize); 
——描述： 
初始化一个服务访问的上下文。本函数接收安全Pipe标志为参数，并且在内部使用TEEI_ConnectTA
方法初始化服务访问Pipe。本函数调用后，对于本服务的所有后续访问都在此Pipe和安全Pipe参数基础
上进行。 
——参数： 
secure_pipe:安全通道标识，1为使用安全通道，其他值使用非安全通道。 
message:创建连接所需的其他必要信息，由实现定义。 
bufferSize:字节表示的缓冲区长度，相当于通信带宽。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果无法连接到内置服务主机，返回TEEI_ERROR_HOST_NOT_EXIST。 
如果无法连接到内置服务，返回TEEI_ERROR_TA_NOT_EXIST。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.4.2.4.2 TUI_Finalize 
voidTUI_Finalize(); 
——描述： 
清理服务访问的上下文。本函数内部自动使用TEEI_DisConnectTA来关闭已经打开的Pipe。 
——参数： 
无。 
8.4.2.4.3 TUI_GetSecurityIndicatorType 
TEEI_Result TUI_GetSecurityIndicatorType(  
[out] bool* type 
) 
——描述： 
此操作允许检测可信用户交互服务的安全指示实现方式。true表示安全指示是TUI管理的， false
要由调用方自己管理。 
——参数： 
中国银联 
版权所有

---
**[p159]**

Q/CUP 069—2015 
152 
type: 输出参数，安全指示的实现方式 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.4.2.4.4 TUI_GetLanguagesSupport 
TEEI_Result TUI_GetLanguagesSupport(  
[out] char* languages 
) 
——描述： 
此操作允许检测可信用户交互服务支持的语言。返回结果是以“:”分隔的支持语言列表字符串，
语言编码参考ISO 639-1规范。 
——参数： 
languages: 输出参数，支持的语言列表。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.4.2.4.5 TUI_GetOrientationSupport 
TEEI_Result TUI_GetOrientationSupport(  
[out] uint32_t* orientation 
) 
——描述： 
此操作允许检测可信用户交互服务支持屏幕显示方式。0x00000001：支持纵屏显示；0x00000002：
支持横屏显示；0x00000003：横屏或纵屏均支持。 
——参数： 
orientation: 输出参数，支持的屏幕显示类型。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.4.2.4.6 TUI_GetDefaultSessionTimeout 
TEEI_Result TUI_GetDefaultSessionTimeout(  
[out] uint32_t* timeout 
) 
——描述： 
此操作允许检测可信用户交互服务的会话的缺省超时时间。以毫秒为单位，缺省情况下是10秒。 
中国银联 
版权所有

---
**[p160]**

Q/CUP 069—2015 
153 
——参数： 
timeout: 输出参数，缺省超时时间。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
8.4.2.4.7 TUI_CheckTextFormat 
TEEI_Result TUI_CheckTextFormat(  
[in] char* text,  
[out] uint32_t* width,  
[out] uint32_t* height,  
    [out] uint32_t* lastIndex  
) 
——描述： 
此操作允许一个TA检测能否在当前的实现中显示给定的文本，并且检索所要呈现的文本需要的大小
和宽度。 
——参数： 
text: 被检测的字符串 
width: 需要显示的文本宽度的像素数. 
height: 需要显示的文本高度得像素数. 
lastIndex: 表示已检查的最后一个字符。检测到的情况下，它对应该文本字符串的最后一个字符。
在失败的情况下，它表示导致失败的字符的索引。索引的起始值是0。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
文本字符串中有至少一个字符不能被渲染，返回值为TEEI_ERROR_NOT_SUPPORTED。 
——异常： 
如果输出参数为NULL或指向一个不合法的区域。 
8.4.2.4.8 TUI_GetScreenInfo 
TEEI_Result TUI_GetScreenInfo(  
[in]TUI_ScreenOrientation screenOrientation,  
[in] uint32_t nbEntryFields,  
[out] TUI_ScreenInfo* screenInfo  
) 
——描述：   
此操作获取定向画面的信息和要求的输入域个数。 
中国银联 
版权所有

---
**[p161]**

Q/CUP 069—2015 
154 
——参数： 
screenOrientaion: 定义请求的定向画面信息 
nbEntryFields: 定义请求的输入域个数 
screenInfo: 返回给请求的定向画面的信息 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
所要求的输入域数量不被支持, 返回值为TEEI_ERROR_NOT_SUPPORTED。 
——异常： 
如果输出参数为NULL或指向一个不合法的区域。 
如果请求的屏幕方向不被属性 org.tee.tui.orientation 支持。 
8.4.2.4.9 TUI_InitSession 
TEEI_Result TUI_InitSession(void) 
——描述：   
此操作为当前TA声明了一个单独访问可信用户交互资源的权限。在该阶段，TEE不能控制画面和键
盘。这只是为这个特殊的TA预留了使用可信用户交互的能力，并将通知其它可信应用，预留已经完成且
资源正在被使用。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
TUI资源正在使用中，返回值为TEEI_ERROR_BUSY。 
内存溢出，返回值为TEEI_ERROR_OUT_OF_MEMORY。 
8.4.2.4.10 TUI_CloseSession 
TEEI_Result TUI_CloseSession(void) 
——描述： 
此操作释放之前获得的可信用户交互资源。 
——参数： 
无。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
TUI资源正在使用中，返回值为TEEI_ERROR_BUSY。 
由会话超时或操作系统外部特定事件所导致的可信用户交互自动关闭，返回值为TEEI_BAD_STATE。 
中国银联 
版权所有

---
**[p162]**

Q/CUP 069—2015 
155 
8.4.2.4.11 TUI_DisplayScreen 
TEEI_ResultTUI_DisplayScreen(  
[in]TUI_ScreenConfiguration* screenConfiguration,  
[in] bool closeTUISession,  
[in]TUI_EntryField* entryFields,uint32_t entryFieldCount,  
[out] TUI_ButtonType* selectedButton  
)   
——描述： 
此操作显示可信用户交互画面。 
——参数： 
screenConfiguration: 配置画面上的标签和任意按钮。 
closeTUISession: 如果为true，当退出该函数时，可信用户界面会话会自动关闭。 
nbEntryFields:指定了请求的要显示输入域的数目。这是表entryFields、 entryFieldBuffers、
entryFieldBuffersLength的长度。 
entryFieldEntries: 指定用于画面显示的输入域。 
entryFieldBuffers[], entryFieldBuffersLength[]:包含由用户在输入域中输入的字符串。如果
nbEntryFields被设为0，则忽略它们。 
selectedButton: 如果成功，表示用户选中的按钮用于退出可信用户界面画面。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
TUI资源正在使用中，返回值为TEEI_ERROR_BUSY。 
内存溢出，返回值为TEEI_ERROR_OUT_OF_MEMORY。 
由会话超时或操作系统外部特定事件所导致的可信用户交互自动关闭，返回值为TEEI_ 
ERROR_BAD_STATE。 
图片不存在，返回值为TEEI_ERROR_ITEM_NOT_FOUND。 
访问权限冲突，返回值为TEEI_ERROR_ACCESS_CONFLICT。 
图片格式不是PNG，返回值为TEEI_ERROR_BAD_FORMAT。 
可信用户交互画面显示时，该操作被取消，返回值为TEEI_ERROR_CANCEL，此时当前session被自动
关闭，输入字段中已经输入的值被返回给TA。 
可信用户交互画面显示时，该操作被发生在REE 中的外部事件取消，返回值为
TEEI_ERROR_EXTERNAL_CANCEL，此时当前session被自动关闭，输入字段中已经输入的值被返回给TA。 
——异常： 
如果输出参数为NULL或指向一个不合法的区域。 
如果参数screenConfiguration为NULL。 
如果参数selectedButton为NULL。 
如果label字段不匹配TUI_GetScreenInfo返回的对应屏幕方向和输入域个数值。 
如果button字段不匹配TUI_GetScreenInfo返回的对应屏幕方向和输入域个数值。 
中国银联 
版权所有

---
**[p163]**

Q/CUP 069—2015 
156 
如果输入字段不匹配TUI_GetScreenInfo返回的对应屏幕方向和输入域个数值，或不符合
TUI_EntryField定义的规则。 
如果请求显示的button不匹配8.3.8.3.4定义的按钮组合。 
 
8.4.3 主机卡模拟SPI 
8.4.3.1 头文件 
主机卡模拟SPI的头文件名字必须是“teei_platform_hce_spi.h”。 
#include “teei_platform_hce_spi.h”; 
8.4.3.2 数据类型 
8.4.3.2.1 HCE_ApduService 
typedef struct { 
uint8_t filterAIDCount,//该服务感兴趣的AID数量 
char* filterAIDs[],//该服务感兴趣的AID列表 
uint32_t serviceType,//该服务的类型，1为支付服务，否则为其他服务 
char* hostname,//该服务所在的主机名 
TEEI_UUID* uuid,//该服务（通常为TA）的UUID 
uint32_t command//该服务用来接收APDU消息的指令ID 
} HCE_ApduService; 
——描述： 
APDU服务模块描述信息，通常为一个TEE中的TA的公开接口。 
8.4.3.3 函数 
8.4.3.3.1 HCE_Initialize 
TEEI_ResultHCE_Initialize(uint8_t secure_pipe,  
TEE_Message* message, uint32_t bufferSize); 
——描述： 
初始化一个服务访问的上下文。本函数接收安全Pipe标志为参数，并且在内部使用TEEI_ConnectTA
方法初始化服务访问Pipe。本函数调用后，对于本服务的所有后续访问都在此Pipe和安全Pipe参数基础
上进行。 
——参数： 
secure_pipe:安全通道标识，1为使用安全通道，其他值使用非安全通道。 
message:创建连接所需的其他必要信息，由实现定义。 
bufferSize:字节表示的缓冲区长度，相当于通信带宽。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
中国银联 
版权所有

---
**[p164]**

Q/CUP 069—2015 
157 
如果参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果无法连接到内置服务主机，返回TEEI_ERROR_HOST_NOT_EXIST。 
如果无法连接到内置服务，返回TEEI_ERROR_TA_NOT_EXIST。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.4.3.3.2 HCE_Finalize 
voidHCE_Finalize(); 
——描述： 
清理服务访问的上下文。本函数内部自动使用TEEI_DisConnectTA来关闭已经打开的Pipe。 
——参数： 
无。 
 
8.4.3.3.3 HCE_RegisterApduService 
TEEI_Result HCE_RegisterApduService( 
uint8_t filterAIDCount, 
char* filterAIDs[], 
uint32_t serviceType, 
char* hostname, 
TEEI_UUID* uuid, 
uint32_t command, 
uint32_t* serviceId 
); 
——描述： 
注册基于AID路由的APDU服务模块。 
——参数： 
filterAIDCount: APDU服务模块模拟的应用数量。 
filterAIDs: APDU服务模块模拟的应用AID列表。 
serviceType: 该服务的类型，1为支付服务，否则为其他服务。 
hostname: 该服务所在的主机名。 
uuid: 该服务（通常为TA）的UUID。 
command: 该服务用来接收APDU消息的指令ID。 
serviceId: 自动分配的APDU服务模块的ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了通信错误，返回TEEI_ERROR_COMMUNICATION。 
如果资源不足以执行操作，返回TEEI_ERROR_OUT_OF_MEMORY。 
中国银联 
版权所有

---
**[p165]**

Q/CUP 069—2015 
158 
如果参数格式错误，返回TEEI_ERROR_BAD_PARAMETERS。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.4.3.3.4 HCE_UnregisterApduService 
TEEI_Result HCE_UnregisterApduService(uint32_t* serviceId); 
——描述： 
解除APDU服务模块的注册。 
——参数： 
serviceId: 自动分配的APDU服务模块的ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.4.3.3.5 HCE_ListApduService 
TEEI_Result HCE_ListApduService(uint8_t* count, HCE_ApduService* services); 
——描述： 
列出所有已经注册的APDU服务模块信息。 
——参数： 
count: APDU服务模块的数量。 
services: APDU服务模块列表。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果缓冲区容量不足，返回TEEI_ERROR_SHORT_BUFFER。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.4.3.3.6 HCE_GetApduService 
TEEI_Result HCE_GetApduService( 
uint32_t serviceId, HCE_ApduService* service); 
——描述： 
获取指定的HCE信息。 
——参数： 
serviceId: APDU服务模块的ID。 
service: APDU服务模块描述信息。 
中国银联 
版权所有

---
**[p166]**

Q/CUP 069—2015 
159 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果发生了其他错误，返回TEEI_ERROR_INTERNAL。 
8.4.4 生物识别SPI 
8.4.4.1 头文件 
生物识别SPI的头文件名字必须是“teei_platform_bio_spi.h”。 
#include “teei_platform_bio_spi.h”; 
8.4.4.2 常数 
8.4.4.2.1 识别方式 
typedef enum  
{  
BIO_TYPE_FINGER_PRINT= 0x00000001,//指纹识别 
BIO_TYPE_VOICE_PRINT= 0x00000002, //声纹识别 
BIO_TYPE_FACE_PRINT = 0x00000003, //面部识别 
BIO_TYPE_EYE_PRINT= 0x00000004, //虹膜识别 
BIO_TYPE_HAND_PRINT = 0x00000005, //掌纹识别 
} BIO_TypeIdentification; 
——描述： 
描述生物识别服务所使用的识别方式。 
8.4.4.2.2 识别状态 
typedef enum  
{  
BIO_STATUS_SUCCESS= 0x00000000,//识别成功 
BIO_STATUS_FAILURE= 0x00000001,//识别失败 
BIO_STATUS_WAIT_USER= 0x00000002, //等待用户动作 
BIO_STATUS_IN_PROCESS= 0x00000003, //识别处理中 
BIO_STATUS_WAIT_DEVICE= 0x00000004, //等待硬件设备初始化 
BIO_STATUS_IDLE= 0x00000005, //服务空闲 
} BIO_StatusRecognition; 
——描述： 
描述生物识别服务的识别状态。 
8.4.4.2.3 识别用途 
typedef enum  
中国银联 
版权所有

---
**[p167]**

Q/CUP 069—2015 
160 
{  
BIO_USAGE_PAYMENT_CONFIRM= 0x00000001,//支付交易确认 
BIO_USAGE_SECURE_WORLD_LOGIN= 0x00000002, //允许进入安全的世界 
BIO_USAGE_RICH_APP_LOGIN= 0x00000003, //REE应用程序登录 
BIO_USAGE_TRUSTED_APP_LOGIN= 0x00000004, //可信应用程序登录 
BIO_USAGE_REMOTE_SERVER_LOGIN = 0x00000005, //远程服务器登录 
} BIO_UsageRecognition; 
——描述： 
描述使用生物识别服务的目的。 
8.4.4.3 数据类型 
8.4.4.3.1 BIO_ServiceInfo 
typedef struct  
{  
BIO_TypeIdentificationtype;//识别方式 
    uint32_t version;//版本号，二进制形式 
char* serviceInfo;//服务提供商描述信息 
char* description;//特定于提供商的服务描述信息，实现定义 
} BIO_ServiceInfo; 
——描述： 
生物识别服务的描述信息。 
8.4.4.4 函数 
8.4.4.4.1 BIO_Initialize 
TEEI_ResultBIO_Initialize(uint8_t secure_pipe,  
TEE_Message* message, uint32_t bufferSize); 
——描述： 
初始化一个服务访问的上下文。本函数接收安全Pipe标志为参数，并且在内部使用TEEI_ConnectTA
方法初始化服务访问Pipe。本函数调用后，对于本服务的所有后续访问都在此Pipe和安全Pipe参数基础
上进行。 
——参数： 
secure_pipe:安全通道标识，1为使用安全通道，其他值使用非安全通道。 
message:创建连接所需的其他必要信息，由实现定义。 
bufferSize:字节表示的缓冲区长度，相当于通信带宽。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
中国银联 
版权所有

---
**[p168]**

Q/CUP 069—2015 
161 
如果无法连接到内置服务主机，返回TEEI_ERROR_HOST_NOT_EXIST。 
如果无法连接到内置服务，返回TEEI_ERROR_TA_NOT_EXIST。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.4.4.4.2 BIO_Finalize 
voidBIO_Finalize(); 
——描述： 
清理服务访问的上下文。本函数内部自动使用TEEI_DisConnectTA来关闭已经打开的Pipe。 
——参数： 
无。 
 
8.4.4.4.3 BIO_GetServiceInfo 
TEEI_Result BIO_GetServiceInfo(  
[inout] BIO_ServiceInfo* serviceInfo 
); 
——描述： 
此操作获得生物识别服务描述信息。 
——参数： 
serviceInfo: 返回读取的服务描述信息； 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果服务无法访问, 返回值为TEEI_ERROR_SERVICE_NOT_AVAIABLE。 
如果参数内容或格式不合法，返回TEEI_ERROR_BAD_PARAMETERS。 
8.4.4.4.4 BIO_OpenService 
TEEI_Result BIO_OpenService( 
   [in]char* params, 
   [out]uint32_t*connectId 
); 
——描述： 
打开生物识别服务。 
——参数： 
params: 特定于服务的初始化参数信息，实现定义。 
中国银联 
版权所有

---
**[p169]**

Q/CUP 069—2015 
162 
connectId: 自动生成的标识当前服务连接的连接ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，返回TEEI_ERROR_BAD_PARAMETERS。 
如果服务无法访问，返回TEEI_ERROR_SERVICE_NOT_AVAIABLE。 
如果没有足够的资源创建连接，返回TEEI_ERROR_RESOURCE_LIMIT。 
8.4.4.4.5 BIO_CloseService 
TEEI_Result BIO_CloseService(uint32_t*connectId); 
——描述： 
关闭生物识别服务。 
——参数： 
connectId: 自动生成的标识当前服务连接的连接ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，返回TEEI_ERROR_BAD_PARAMETERS。 
8.4.4.4.6 BIO_StartIdentify 
TEEI_Result BIO_StartIdentify( 
[in] uint32_t connectId,  
[in] uint32_t useTUI, 
[in] uint32_t timeout, 
[in] BIO_UsageRecognition usage, 
[out] BIO_StatusRecognition* status, 
[inout] void* confidential, 
[inout] uint32_t* length 
); 
——描述： 
开始生物识别过程。 
——参数： 
connectId: 自动生成的标识当前服务连接的连接ID。 
useTUI:是否利用生物识别服务提供的TUI界面，0代表不使用，其他值使用。 
timeout:会话超时时间，以毫秒为单位。 
usage:认证用途，表明当前认证的目的。 
status:输出参数，识别状态。 
confidential: 输入输出参数，认证结果凭证，其格式由实现定义，可能为签名或证书。 
中国银联 
版权所有

---
**[p170]**

Q/CUP 069—2015 
163 
length:输入输出参数，认证结果凭证缓冲区长度。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，返回TEEI_ERROR_BAD_PARAMETERS。 
如果处理超过了指定的时间，返回TEEI_ERROR_TIMEOUT。 
如果服务无法访问，返回TEEI_ERROR_SERVICE_NOT_AVAIABLE。 
如果缓冲区大小不足，返回值为TEEI_ERROR_SHORT_BUFFER。 
8.4.4.4.7 BIO_CancelIdentify 
TEEI_Result BIO_CancelIdentify( 
uint32_t connectId,BIO_StatusRecognition* status); 
——描述： 
取消正在进行的生物识别过程。 
——参数： 
connectId: 自动生成的标识当前服务连接的连接ID。 
status: 取消时的识别状态。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数内容或格式不合法，返回TEEI_ERROR_BAD_PARAMETERS。 
8.4.4.4.8 BIO_GetIdentifyStatus 
TEEI_Result BIO_GetIdentifyStatus ( 
uint32_t connectId, BIO_StatusRecognition* status); 
——描述： 
获得当前的识别状态。 
——参数： 
connectId: 自动生成的标识当前服务连接的连接ID。 
status: 当前的识别状态。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果服务无法访问，返回TEEI_ERROR_SERVICE_NOT_AVAIABLE。 
如果参数内容或格式不合法，返回TEEI_ERROR_BAD_PARAMETERS。 
中国银联 
版权所有

---
**[p171]**

Q/CUP 069—2015 
164 
8.5 TEE 服务API 
提供运行在TEEI环境中的TEE接收外部消息的入口回调相关功能API。当一个TEE得到执行后，其首
先需要定义一些入口函数，并利用TEEI_RegisterTEECCallback函数将这些入口函数注册到TEEI平台中。
当外部消息到来时，TEEI会将外部消息作为入口回调函数的参数，并调用入口函数进行实际的业务处理。 
8.5.1 头文件 
调用TEE服务API之前需要声明 “teei_platform_tee_api.h”头文件。 
#include “teei_platform_tee_api.h” 
 
8.5.2 数据类型 
8.5.2.1 TEEC_Param 
typedef union 
{ 
struct{ 
void* buffer;  
uint32_t size; 
} memref; 
struct{ 
uint32_t a, b; 
} value; 
} TEEC_Param; 
——描述： 
TEE参数的类型定义。 
8.5.2.2 TEEC_Callback 
typedef struct { 
    TEEI_Result (*InitializeContext)( 
        unsigned int* contextId//out 
    ); 
 
    void (* FinalizeContext)(unsigned int contextId); 
 
    TEEI_Result (* OpenSession)( 
        unsigned int contextId,  
        const TEEI_UUID* destination,  
        uint32_t connectionMethod,  
        const void* connectionData, 
中国银联 
版权所有

---
**[p172]**

Q/CUP 069—2015 
165 
        int  connectionDataLength, 
        uint32_t paramTypes, 
        TEEC_Param params[4],//[inout]  
        unsigned int* sessionId,//out 
        uint32_t* returnOrigin//out 
    ); 
 
    void (* CloseSession)(unsigned int sessionId); 
 
    TEEI_Result (* InvokeCommand)( 
        unsigned int sessionId, 
        uint32_t commandID,  
        uint32_t paramTypes, 
        TEEC_Param params[4],//[inout]  
        uint32_t* returnOrigin//out 
    ); 
 
    //optional 
    void (* RequestCancellation)( 
        uint32_t paramTypes, 
        TEEC_Param params[4],//[inout]  
    ); 
 
} TEEC_Callback; 
——描述： 
TEE入口回调函数结构体。 
8.5.3 函数 
8.5.3.1 TEEI_RegisterTEECCallback 
void TEEI_Register_TEEC_Callback(char* hostName, TEEC_Callback* callback); 
——描述： 
注册TEE入口回调函数结构体。 
——参数： 
hostName:TEE的主机名。 
callback:TEE入口回调函数结构体。 
8.5.3.2 InitializeContext 
TEEI_Result (*InitializeContext)( 
中国银联 
版权所有

---
**[p173]**

Q/CUP 069—2015 
166 
    unsigned int* contextId//out 
); 
——描述： 
初始化TEE服务访问的上下文。 
——参数： 
contextId:输出参数，表示已经创建的上下文ID。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.5.3.3 FinalizeContext 
void (* FinalizeContext)(unsigned int contextId); 
——描述： 
销毁TEE服务访问的上下文。 
 
——参数： 
contextId:表示已经创建的上下文ID。 
8.5.3.4 OpenSession 
TEEI_Result (* OpenSession)( 
unsigned int contextId, 
const TEEI_UUID* destination,  
uint32_t connectionMethod,  
const void* connectionData, 
int  connectionDataLength, 
uint32_t paramTypes, 
TEEC_Param params[4],//[inout]  
unsigned int* sessionId,//out 
uint32_t* returnOrigin//out 
); 
——描述： 
打开同指定TA的会话。 
——参数： 
contextId:表示已经创建的上下文ID。 
中国银联 
版权所有

---
**[p174]**

Q/CUP 069—2015 
167 
destination：目标TA的UUID。 
connectionMethod：建立会话使用的连接方法。 
connectionData：支持连接方法的数据。 
connectionDataLength：支持连接方法的数据的长度。 
paramTypes：编码为操作参数类型的数值。 
params：类型为TEEC_Param，长度为4的参数数组。 
sessionId：输出参数，表示创建的会话ID。 
returnOrigin：发生异常情况时，程序返回的位置。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.5.3.5 CloseSession 
void (* CloseSession)(unsigned int sessionId); 
——描述： 
关闭指定TA的会话。 
——参数： 
sessionId：表示创建的会话ID。 
8.5.3.6 InvokeCommand 
TEEI_Result (* InvokeCommand)( 
unsigned int sessionId, 
    uint32_t commandId,  
    uint32_t paramTypes, 
    TEEC_Param params[4],//[inout]  
    uint32_t* returnOrigin//out 
); 
——描述： 
通过命令ID调用TA的功能。 
——参数： 
sessionId：表示创建的会话ID。 
commandId：要执行的操作ID。 
paramTypes：编码为操作参数类型的数值。 
params：类型为TEEC_Param，长度为4的参数数组。 
returnOrigin：发生异常情况时，程序返回的位置。 
中国银联 
版权所有

---
**[p175]**

Q/CUP 069—2015 
168 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
8.5.3.7 RequestCancellation 
void (* RequestCancellation)( 
    uint32_t paramTypes, 
    TEEC_Param params[4],//[inout]  
); 
——描述： 
取消正在等待执行的操作命令。 
此函数是可选函数，TEE实现可以不提供该函数的定义。 
——参数： 
paramTypes：编码为操作参数类型的数值。 
params：类型为TEEC_Param，长度为4的参数数组。 
——返回值： 
函数成功完成后，返回值为TEEI_SUCCESS。 
如果参数不合法，返回值为TEEI_ERROR_BAD_PARAMETERS。 
如果发生其他错误，返回值为TEEI_ERROR_INTERNAL。 
9 标准C 库 
TEEI虚拟机固件接口支持标准C语言库函数的子集，其支持的功能子集如下表所示，详细的API定义
可参考ISO/IEC 9899:1999Programminglanguages–C的[7. Library]章节中相关内容。 
表9-1 功能子集 
功能 
描述 
参照 
<assert.h> 
诊断 
ISO/IEC 9899:1999，章节7.2 
<complex.h> 
复杂数学运算 
ISO/IEC 9899:1999，章节7.3 
<ctype.h> 
字符处理 
ISO/IEC 9899:1999，章节7.4 
<errno.h> 
错误 
ISO/IEC 9899:1999，章节7.5 
<fenv.h> 
浮点数环境 
ISO/IEC 9899:1999，章节7.6 
<inttypes.h> 
整数类型的格式转换 
ISO/IEC 9899:1999，章节7.8 
<limits.h> 
整数类型的大小 
ISO/IEC 9899:1999，章节7.10 
中国银联 
版权所有

---
**[p176]**

Q/CUP 069—2015 
169 
功能 
描述 
参照 
<locale.h> 
本地化 
ISO/IEC 9899:1999，章节7.11 
<math.h> 
数学运算 
ISO/IEC 9899:1999，章节7.12 
<setjmp.h> 
非本地跳转 
ISO/IEC 9899:1999，章节7.13 
<signal.h> 
信号处理 
ISO/IEC 9899:1999，章节7.14 
<stdint.h> 
整数类型 
ISO/IEC 9899:1999，章节7.18 
<stdio.h> 
输入/输出 
ISO/IEC 9899:1999，章节7.19 
<stdlib.h> 
通用辅助函数 
ISO/IEC 9899:1999，章节7.20 
<string.h> 
字符串处理 
ISO/IEC 9899:1999，章节7.21 
<tgmath.h> 
泛型数学计算 
ISO/IEC 9899:1999，章节7.22 
<time.h> 
日期和时间 
ISO/IEC 9899:1999，章节7.23 
<wchar.h> 
扩展的多字节和宽字符函数 
ISO/IEC 9899:1999，章节7.24 
<wctype.h> 
宽字符分类和映射函数 
ISO/IEC 9899:1999，章节7.25 
 
中国银联 
版权所有