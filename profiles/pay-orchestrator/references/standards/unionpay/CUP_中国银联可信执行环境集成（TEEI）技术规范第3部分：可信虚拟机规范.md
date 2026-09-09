# 中国银联可信执行环境集成（TEEI）技术规范第3部分：可信虚拟机规范
> 来源: 银联规范 2015-12 存档 | 26页 | 提取: 2026-09-03


---
**[p1]**

Q/CUP 
中国银联股份有限公司企业标准 
Q/CUP 069—2015 
 
中国银联可信执行环境集成（TEEI）技术规范 
第3 部分 可信虚拟机规范 
UnionPay Trusted Execution Environment Integration Technical Specifications 
Part 3：Specification on Trusted Virtual machine 
 
 
 
 
 
2015 - 07-01 发布 
2015 - 07-01 实施 
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
II 
目  次 
前言 ................................................................................ IV 
引言 ................................................................................. V 
1 范围 .............................................................................. 1 
2 规范性引用文件 .................................................................... 1 
3 术语和定义 ........................................................................ 1 
4 文档约定 .......................................................................... 3 
5 需求级别 .......................................................................... 4 
6 概述 .............................................................................. 4 
7 可信虚拟机超调用接口 .............................................................. 5 
7.1 通信 .......................................................................... 5 
7.1.1 调用Portal ................................................................ 5 
7.1.2 Portal 应答 ................................................................ 6 
7.2 能力集管理 .................................................................... 7 
7.2.1 创建保护域 ................................................................ 7 
7.2.2 创建执行上下文 ............................................................ 7 
7.2.3 创建Portal ................................................................ 8 
7.2.4 创建数据空间 .............................................................. 8 
7.2.5 创建信号 .................................................................. 9 
7.2.6 撤销能力集 ................................................................ 9 
7.2.7 查找能力集 ............................................................... 10 
7.2.8 获取能力集 ............................................................... 10 
7.3 执行控制 ..................................................................... 11 
7.3.1 执行上下文控制 ........................................................... 11 
7.3.2 调度上下文控制 ........................................................... 11 
7.3.3 Portal 控制 ............................................................... 11 
7.3.4 数据空间控制 ............................................................. 12 
7.4 设备控制 ..................................................................... 12 
7.4.1 打开设备 ................................................................. 12 
7.4.2 操作设备 ................................................................. 13 
7.4.3 关闭设备 ................................................................. 13 
7.4.4 注册设备信号 ............................................................. 14 
7.4.5 注销设备信号 ............................................................. 14 
附录A（规范性附录） 辅助函数库 ..................................................... 15 
附录B（规范性附录） CAP_INFO ....................................................... 18 
中国银联 
版权所有

---
**[p4]**

Q/CUP 069—2015 
III 
附录C（规范性附录） 能力集获取 ..................................................... 19 
附录D（资料性附录） 实现与用例 ..................................................... 20 
 
中国银联 
版权所有

---
**[p5]**

Q/CUP 069—2015 
IV 
前  言 
 
本规范阐述了TEEI可信虚拟机的具体操作接口API。 
本规范由中国银联股份有限公司提出。 
本部分由中国银联股份有限公司组织制定。 
本部分的主要起草单位：中国银联电子支付研究院。 
本部分的主要起草人：徐燕军、鲁志军、何朔、周钰、郭伟、陈成钱、曾望年、李定洲、严翔翔、
张志坚、王军、孟庆洋、史航宇、张楚。 
中国银联 
版权所有

---
**[p6]**

Q/CUP 069—2015 
V 
引  言 
虚拟机技术使得一台物理计算机可以生产多个不同的虚拟机分别运行多个不同或者相同的操作系
统。虚拟机技术通过将不同的应用运行在不同的虚拟机上，可以避免不同应用程序之间的互相干扰，例
如一个应用的崩溃不会影响到其它的应用等。 
中国银联 
版权所有

---
**[p7]**

Q/CUP 069—2015 
1 
中国银联可信执行环境集成（TEEI）技术规范                 
第3 部分：可信虚拟机规范 
1 范围 
本规范可以为以下用户所用： 
——TEEI 平台发行者； 
——TEEM 发行者； 
——TEEI 内置可信服务软件开发商； 
——TEEI 应用服务器软件提供商； 
——TEEI 设备提供商。 
 
2 规范性引用文件 
下列文件对于本文件的应用是必不可少的。凡是注日期的引用文件，仅所注日期的版本适用于本文
件。凡是不注日期的引用文件，其最新版本（包括所有的修改单）适用于本文件。 
NOVA 接口规范 
《NOVA Microhypervisor interface specification》 
Xen 接口规范 
《Xen interface》 
3 术语和定义 
表3-1 术语和定义 
术语 
定义 
保护域 
1. 
保护域是一个保护和隔离的单元。 
2. 
每个保护域由一个保护域能力集（CAPOBJPD）所引用。 
3. 
保护域由一组持有平台资源或者内核对象的空间所组成，能够被保
护域执行上下文访问。当前有如下空间定义： 
 
内存空间 
 
I/O 空间 
 
对象空间 
 
镜像空间 
中国银联 
版权所有

---
**[p8]**

Q/CUP 069—2015 
2 
术语 
定义 
4. 
保护域的内存空间持有指向物理内存页表的能力集。 
5. 
保护域的对象空间持有指向的能力集指向如下内核对象： 
 
保护域（PD） 
 
执行上下文（EC） 
 
调度上下文（SC） 
 
Portal（PT） 
 
信号（SG） 
 
数据空间（DS） 
 
设备（DEV） 
6. 
保护域的镜像空间指持有复制及执行镜像的能力集。 
执行上下文 
1. 
执行上下文（EC）是一个描述保护域内部活动的抽象概念。 
2. 
每个执行上下文有一个执行上下文能力集（CAPOBJEC）所引用。 
3. 
执行上下文永久绑定在创建它的保护域上。 
4. 
执行上下文可以选择拥有一个调度上下文，并被其绑定。 
5. 
执行上下文包含以下信息： 
 
引用保护域 
 
执行实体 
 
执行栈 
调度上下文 
1. 
调度上下文（SC）是一个调度和优先级的单元。 
2. 
每个调度上下文由一个调度上下文能力集（CAPOBJSC）所引用。 
3. 
一个调度上下文准确地永久绑定在一个保护域上。 
中国银联 
版权所有

---
**[p9]**

Q/CUP 069—2015 
3 
术语 
定义 
4. 
一个调度上下文包含如下信息： 
 
时间量子 
 
优先级 
Portal 
1. 
Portal（PT）代表一个专门的保护域中的入口指针，该portal 由
此保护域创建。 
2. 
每个portal 由一个Portal 能力集（CAPOBJEC）所引用。 
3. 
一个portal 是永久绑定在一个正确的执行上下文上。 
4. 
一个portal 包含如下信息： 
 
引用执行上下文 
数据空间 
数据空间是代表一个数据或内存区域，可用来共享内存或数据。 
每个DS 由一个DS 能力集（CAPOBJDS）所引用, 具体包括一个数据空间
的地址与SIZE。 
信号 
用于设备向虚拟机上返事件。 
互斥锁 
用于PD 内部EC 互斥。 
能力集名称 
能力集名称由Micro Hypervisor 自动分配，通过一个能力集名称可获
取一个具体的SEL。 
量子优先级描述符 
量子优先级描述符（QPD）指定一个调度上下文和其时间量子的优先级，
时间以微秒计算，优先级02-45 可用。 
 
4 文档约定 
 
表4-1 缩略语和符号 
缩写 
定义 
CAP 
能力集 
CAP0 
空能力集 
CAPMEM  
内存能力集 
CAPIMG 
镜像能力集 
CAPOBJ  
对象能力集 
CAPOBJEC  
执行上下文能力集 
CAPOBJPD 
保护域能力集 
中国银联 
版权所有

---
**[p10]**

Q/CUP 069—2015 
4 
缩写 
定义 
CAPOBJPT  
Portal 能力集 
CAPOBJSC  
调度上下文能力集 
CAPOBJSG  
信号能力集 
CAPOBJDS 
数据空间能力集 
CAPOBJDEV 
设备能力集 
CAPOBJDEV_OP 
操作设备能力集 
CPU  
中央处理单元 
EC  
执行上下文 
GSI  
全局系统中断 
PD  
保护域 
PID  
端口标识 
PT  
端口 
PTM 
端口传输消息 
QPD  
量子优先集描述符 
SC  
调度上下文 
Cap_Name 
能力集名称 
SEL 
 
能力集选择器 
SELIMG 
镜像能力集选择器 
SELOBJ  
对象能力集选择器 
SELOBJ0  
对象能力集选择器：空能力集 
SELOBJEC  
对象能力集选择器：执行上下文能力集 
SELOBJPD 
对象能力集选择器：保护域能力集 
SELOBJPT  
对象能力集选择器：Portal 能力集 
SELOBJSC  
对象能力集选择器：调度上下文能力集 
SELOBJSG  
对象能力集选择器：信号能力集 
SELOBJDS 
对象能力集选择器：数据空间 
SELOBJDEV  
对象能力集选择器：设备 
SELOBJDEV_OP  
对象能力集选择器：操作设备 
SG  
信号 
MT 
信号量 
VM  
虚拟机 
 
5 需求级别 
以下是规范文档中出现的斜体关键字的含义说明，详细描述请参考【RFC 2119】。必须，意味着必
须遵守的规范内容。 
必须不，意味着必须绝对禁止的规范内容。 
应该，或推荐，意味着在特殊的环境下可能存在正当的理由可以忽略的规范条目。 
不应该，或不推荐，意味着在特殊的环境下可能存在正当的理由可以接收的规范条目。 
可以，意味着一个规范条目是真正可选的。 
中国银联 
版权所有

---
**[p11]**

Q/CUP 069—2015 
5 
6 概述 
虚拟化架构有利于多个传统的客户操作系统和多服务器的用户环境共存在一个独立的平台上。本规
范主要描述的是一种基于能力集管理的可信虚拟化架构，该架构采用半虚拟化技术对TEEI 的可信硬件
芯片进行虚拟化以提供多个的可信虚拟机。每个可信虚拟机配以相应的外设，成为可信虚拟机。如果没
有特别说明，在TEEI 规范中所提及的可信虚拟机与可信虚拟机在概念上等同。具体由下图所示。 
 
 
图6.1 虚拟机接口整体架构图 
 
7 可信虚拟机超调用接口 
7.1 通信 
7.1.1 调用Portal 
 
——简介： 
status =tvm_call(SELOBJPT, PTM，FLAG)。 
 
——参数: 
SELOBJPT: 目标Portal, 参数类型为In。 
PTM: 端口传输消息，参数类型为In，具体可描述如下： 
中国银联 
版权所有

---
**[p12]**

Q/CUP 069—2015 
6 
CC
TP
CAP
UM_LEN
USR_MSG
…….
CAP
……
200 Bytes
1 Bytes
4 Bytes
1 Bytes
 
TP：消息类型，0为CALL消息，1为RESPONSE消息，占半个字节。 
CC：CAP数量，决定后续传递多少个CAP，CC为0时将不传递任何CAP，占半个字节。 
CAP：具体的能力集。 
UM_LEN：用户消息长度，决定后续传递消息的大小。 
USR_MSG: 用户自定义消息。 
FLAG：调用标识，参数类型为In，具体如下所示： 
       
~
D
0
1
7
 
 
DB 解除阻塞(0=blocking, 1=nonblocking)  
 
——描述: 
a）如果目标portal的执行上下文处于繁忙状态，Micro Hypervisor将判定DB标签：如果DB设置为1，
那么hypercall返回一个超时；否则该调用会一直等待，只有被调用者的执行上下文为有效时调用者才能
够解除阻塞； 
b）通过Micro Hypervisor调用者向被调用者传送一条消息，内容由PTM来决定。 
 
——状态: 
SUCCESS  (0)：Hypercall成功完成。 
COM_TIM  (-1)：与被调用者执行上下文会合超时。 
COM_ABT (-2)：被调用者执行上下文执行过程中操作中止。 
BAD_CAP (-3)： SELOBJPT  没能引用到一个Portal能力集 (CAPOBJPT )。 
7.1.2 Portal 应答 
 
——简介： 
tvm_reply(R_Entity(PID,PTM),FLAG)。 
 
——参数: 
 
R_Entity: 由reply所触发的执行实体指针，参数类型为In/Out。  
 
PTM: 端口传输消息，参数类型为In/Out, 传输格式同Portal调用中的PTM。 
 
PID：Portal ID，参数类型为In. 
 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述: 
a）当被调用者调用reply时， Micro Hypervisor会自动调用R_Entity，并将调用者发送的PTM信息发
送给R_Entity，R_Entity由被调用者自行定义。R_Entity处理后，应重新填充PTM，Micro Hypervisor会
将该消息返还给调用者； 
b）后续的请求达到后被调用者才能够解除阻塞。 
 
——状态: 
该hypercall没有返回值。 
中国银联 
版权所有

---
**[p13]**

Q/CUP 069—2015 
7 
7.2 能力集管理 
7.2.1 创建保护域 
 
——简介： 
status = tvm_create_pd (SELOBJ0, SELOBJPD, CAP_INFO, n, FLAG)。 
 
——参数： 
SELOBJ0: 空能力集，用于创建PD，参数类型为Out。 
SELOBJPD: 拥有者PD, 参数类型In。 
CAP_INFO: CAP信息描述指针，具体包括Cap_Name, Cap_Type, Cap_Index，Ctl_Value四个成员变
量,用于父PD向子PD传递初始能力集。 
n：传递CAP_INFO的个数。 
Flag：用于传递能力集允许位，PD=0,不允许子PD再创建子PD；PD=1，允许子PD再创建子PD。 
~
PD
0
1
7
 
 
——描述： 
创建一个新的保护域，该执行环境根据参数SELOBJPD绑定到某一PD上。在hypercall处理之前，SELOBJ0
必须引用一个空的能力集，并且SELOBJPD必须引用一个带有允许位CAPPD集的保护域能力集。调用者PD
获取的一个新创建的PD能力集，并将其赋予参数SELOBJ0。Micro Hypervisor从调用者PD向创建的PD委
托一个能力集，具体由CAP_INFO来传递。Flag用于初始化能力集允许位，目前主要用于限定子PD是否
还有能力创建子PD，其余7位可扩展。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP(-3)： 
 
SELOBJPD没有引用到一个保护域能力集 (CAPOBJPD )； 
 
CAPOBJPD没有足够的权限。 
BAD_PAR (-4)： Cap_Type, Ctl_Value不能够识别。 
7.2.2 创建执行上下文 
 
——简介: 
status = tvm_create_ec (SELOBJ0, SELOBJPD,EC_Entity, EC_SP, EC_SZ, FLAG)。 
 
——参数： 
SELOBJ0:  空能力集，用于创建EC，参数类型为Out。 
SELOBJPD:  拥有者PD，参数类型为In。 
EC_Entity：执行上下文实体指针, 参数类型为In。 
   EC_SP：执行上下文栈顶指针, 参数类型为In。 
    EC_SZ：执行上下文堆栈大小, 参数类型为In。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述： 
创建一个新的执行环境，该执行环境根据参数SELOBJPD绑定到某一PD上。在hypercall处理之前，
SELOBJ0必须引用一个空的能力集，并且SELOBJPD必须引用一个带有允许位CAPEC集的保护域能力集。 
Micro Hypervisor将创立一个执行上下文，其执行上下文的优先级与时间量子可通过创建调度上下
来设定。 
中国银联 
版权所有

---
**[p14]**

Q/CUP 069—2015 
8 
 
在创建执行上下文过程中，Micro Hypervisor设定初始栈指针仅一次。随后，执行上下文通过hypercall
负责维护它的栈指针。在它们启动并发起异常时，应用也可以使用初始栈指针值来标识执行上下文。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJPD不能够引用一个保护域能力集 (CAPOBJPD )； 
 
CAPOBJPD没有足够的权限。 
BAD_PAR (-4)：EC_Entity,  EC_SP 或EC_SZ是0。 
7.2.3 创建Portal 
 
——简介： 
status = tvm_create_pt (SELOBJ0, SELOBJPD, SELOBJEC, PID,FLAG)。 
 
——参数： 
SELOBJ0: 空能力集，用于创建PT，参数类型为Out。 
SELOBJPD: 拥有者PD，参数类型为In 
SELOBJEC: 绑定 EC，参数类型为In。 
PID: Portal ID，参数类型为In。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述： 
创建一个新的portal，该执行环境根据参数SELOBJPD绑定到某一PD上。在hypercall处理之前，SELOBJ0
必须引用一个空的能力集，并且SELOBJPD必须引用一个带有允许位CAPPT集的保护域能力集，SELOBJEC
必须引用一个带有允许位CAPPT集的执行上下文能力集。调用者PD获取的一个新创建的portal能力集，
并赋给参数SELOBJ0。Micro Hypervisor绑定portal到执行上下文上，该上下文由调用者PD的SELOBJEC所引
用。PID由用户自行设定。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJPD没能引用到一个保护域能力集 (CAPOBJPD )； 
 
CAPOBJPD 没有足够的权限； 
 
SELOBJEC没能引用到一个执行上下文能力集 (CAPOBJEC )； 
 
绑定portal到执行上下文失败。 
7.2.4 创建数据空间 
 
——简介： 
status = create_ds(SEL, SELOBJPD, DS_ADDR, DS_SZ, FLAG)。 
 
——参数： 
SEL: 创建DS, 需根据不同的FLAG进行使用, 当创建一个数据空间实体时，参数类型为Out，当创
建一个数据空间引用时，参数类型为In。 
SELOBJPD: 拥有者PD，参数类型为In。 
DS_ADDR: 数据空间地址，需根据不同的FLAG进行使用，当在指定地址上创建数据空间实体时，
DS_ADDR的参数类型为In；当不指定地址时，系统将根据自动分配一个地址，DS_ADDR的参数类型
为Out。 
中国银联 
版权所有

---
**[p15]**

Q/CUP 069—2015 
9 
DS_SZ: 数据空间大小，当创建一个数据空间实体时，参数类型为In，当创建一个数据空间引用时，
参数类型为Out。 
 
FLAG： 
~
DS
0
1
7
ADDR
2
 
DS为1，Micro Hypervisor创建一个数据空间实体；DS为0，Micro Hypervisor创建一个数据空间引用。 
ADDR位只有在DS为1时有效，当ADDR为1，Micro Hypervisor在指定地址上创建一个数据空间实
体，ADDR为0时，Micro Hypervisor将自动分配一个数据空间地址。 
 
——描述： 
    在指定的PD内，创建一个Dataspace，可用于数据及内存共享。当FLAG中的DS位为1时，SEL参数
应为SELOBJ0，其必须引用一个空的能力集，并且SELOBJPD必须引用一个带有允许位CAPDS集的保护域能
力集，完成该调用后，Micro Hypervisor会创立一个DS实体，并将其能力集填充到SELOBJ0中；当DS为0
时，SEL参数应为SELOBJDS，Micro Hypervisor将会创立一个到该DS的一个引用。最后，在创建数据空间
实体时，用户还可以通过指定FLAG中的ADDR位来指定数据空间地址。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成. 
BAD_CAP (-3)： 
 
SELOBJPD没能引用到一个保护域能力集 (CAPOBJPD )； 
 
CAPOBJPD 没有足够的权限； 
 
SEL 没有引用到一个数据空间能力集 (CAPOBJDB)（DS=0 情况下）。 
BAD_PAR (-4)： DS_ADDR(ADDR=1时)或 DS_SZ是0。 
7.2.5 创建信号 
 
——简介： 
   status = tvm_create_sg(SELOBJ0, SELOBJPD, SELOBJEC,FLAG)。 
 
——参数： 
SELOBJ0:  SG空能力集，用于创建SG，参数类型为Out。 
SELOBJPD: 拥有者PD, 参数类型为In。 
SELOBJEC: 绑定EC，参数类型为In。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
    ——描述: 
创建一个新的信号，该执行环境根据参数SELOBJEC绑定到某一EC上，其优先级要高于hypercall，
SELOBJ0必须引用一个空的能力集，并且SELOBJPD必须引用一个带有允许位CAPSG集的保护域能力集。
Micro Hypervisor将一个新的信号量能力填充SELOBJ0。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成. 
BAD_CAP (-3)： 
 
SELOBJPD没能引用到一个保护域能力集 (CAPOBJPD )； 
 
SELOBJEC没能引用到一个执行上下文能力集 (CAPOBJEC )； 
 
CAPOBJPD 没有足够的权限。 
7.2.6 撤销能力集 
中国银联 
版权所有

---
**[p16]**

Q/CUP 069—2015 
10 
 
——简介： 
status = tvm_revoke (SEL, SELOBJPD,FLAG)。 
 
——参数： 
SEL：能力集索引,参数类型为In。 
SELOBJPD： 指定的PD能力集，参数类型为In。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述: 
在一个指定的PD范围内，根据指定的SEL，撤销所有继承能力集的权限。如果SELOBJPD是PD本身，
Micro Hypervisor将包括自身及子PD所引用的能力一起撤销；如果SELOBJPD是一个子PD的能力集，将只
撤销子PD的能力级。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJPD没能引用到一个保护域能力集 (CAPOBJPD )； 
 
CAPOBJPD 没有足够的权限。 
 
7.2.7 查找能力集 
 
——简介： 
status = tvm_lookup (SEL,FLAG)。 
 
——参数: 
SEL: 能力集索引,参数类型为In。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述: 
在调用者的保护域中查找一个能力集。调用者必须在hypercall之前指定一个基地址。如果在指定的
地址中存在一个能力集，那么Micro Hypervisor返回一个填满能力集描述的SEL。否则，返回一个空的能
力集描述符。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
指定的能力集不存在。 
7.2.8 获取能力集 
 
——简介： 
status = tvm_get(SELOBJ0,Cap_Name, FLAG)。 
 
——参数: 
SELOBJ0: 空能力集索引,参数类型为Out。 
Cap_Name：能力集名称，参数类型为In。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述: 
在调用者的保护域中通过Cap_Name获取一个能力集索引。如果成功，那么Micro Hypervisor返回一
个正确的SEL。否则，返回一个空SEL。 
 
中国银联 
版权所有

---
**[p17]**

Q/CUP 069—2015 
11 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
指定的能力集索引不存在。 
7.3 执行控制 
7.3.1 执行上下文控制 
 
——简介: 
status = tvm_ec_ctrl(FLAG)。 
 
——参数 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位, 默认只能对调用者EC进行控制。 
 
——描述： 
为执行上下文自身挂起一个事件, 用于其下次从Micro Hypervisor返回之前产生RECALL异常。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
7.3.2 调度上下文控制 
 
——简介: 
status = tvm_sc_ctrl (SELOBJSC, SELOBJEC,QPD,FLAG)。 
 
——参数 
SELOBJSC: 调度上下文，参数类型为In。 
SELOBJEC:指定需要调整的执行上下文 
QPD: 量子优先集描述，参数类型为In，具体如下所示。 
                                             
                                               Time Quantum
~
Priority
31
12    11
8    7
0
 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述： 
针对某一执行上下文，重新赋予一个调度上下文优先级及时间片。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJSC没有引用到一个调度上下文能力集 (CAPOBJSC )。 
7.3.3 Portal 控制 
 
——简介: 
 
status = tvm_pt_ctrl (SELOBJPT, SELOBJEC, PID,FLAG)。 
 
——参数 
SELOBJPT:  Portal，参数类型为In。 
SELOBJEC: 执行上下文，参数类型为In。 
PID: Portal ID，参数类型为In。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
中国银联 
版权所有

---
**[p18]**

Q/CUP 069—2015 
12 
 
——描述： 
    将Portal绑定到制定执行上下文上，并赋予PID，可用于Portal动态或二次绑定执行上下文，绑定Portal
能力集的执行上下文将作为Server端存在，并且其结果以最后一次绑定为准。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJPT没有引用到一个Portal 能力集 (CAPOBJPT )； 
 
SELOBJEC没有引用到一个执行上下文能力集 (CAPOBJEC )。 
7.3.4 数据空间控制 
 
——简介: 
 
status = tvm_ds_ctrl (SELOBJDS, DS_ADDR, FLAG)。 
 
——参数: 
 
SELOBJDS: 数据空间能力标识,参数类型为In。 
 
DS_ADDR：数据空间地址,参数类型为In。 
 
FLAG: 
~
DS
0
1
7
 
  
DS为1是一个数据空间实体操作，0为一个数据空间引用操作。 
 
——描述： 
 
在指定的SELOBJDS内，将首地址为DS_ADDR的一段内存或数据区域解除绑定。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJDS没有引用到一个数据空间能力集 (CAPOBJDB)。 
BAD_PAR(-4): 
 
输入DS_ADDR 为0 或与实际数据空间地址不匹配。 
7.4 设备控制 
7.4.1 打开设备 
 
——简介: 
status = tvm_open_dev (SELOBJDEV, SELOBJ0,FLAG)。 
 
——参数: 
SELOBJDEV: 设备能力集, 参数类型为In。 
SELOBJ0:  空能力集，用于创建设备操作能力集，参数类型为Out。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述： 
根据SELOBJDEV能力集打开一个设备，如果成功将SELOBJDEV_OP能力集赋予SELOBJ0，否则返回空能力集。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
中国银联 
版权所有

---
**[p19]**

Q/CUP 069—2015 
13 
 
SELOBJDEV没有引用到一个设备能力集 (CAPOBJDEV)； 
 
获取SELOBJDEV_OP能力级失败。 
7.4.2 操作设备 
 
——简介: 
status = tvm_op_dev (SELOBJDEV_op, DEV_MSG, FLAG)。 
 
——参数： 
 
SELOBJDEV_op: 设备操作能力集, 参数类型为In。 
    DEV_MSG：设备消息，参数类型为In/Out，具体描述如下： 
DC
TP
CAP_DS
UM_LEN
USR_MSG
…….
CAP_DS
……
200 Bytes
1 Bytes
4 Bytes
1 Bytes
 
    TP：消息类型，0为CALL消息，1为RESPONSE消息，占半个字节 
    DC：数据空间使用数量，占半个字节。 
    CAP_DS：数据空间能力集，由具体设备提供。 
    UM_LEN：设备消息长度。 
    USR_MSG：设备消息，根据不同设备定义不同消息体。 
 
FLAG：调用标识，参数类型为In，具体如下所示: 
       
~
D
0
1
7
 
 
DB 解除阻塞(0=blocking, 1=nonblocking) 
 
——描述： 
根据设备操作能力集SELOBJDEV_op, 向指定设备发送消息，消息格式具体由DEV_MSG来决定，其返回
消息也具体DEV_MSG来描述。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJDEV_op没有引用到一个设备操作能力集 (CAPOBJDEV_OP)。 
7.4.3 关闭设备 
 
——简介: 
 status = tvm_close_dev (SELOBJDEV, SELOBJDEV_OP, FLAG)。 
 
——参数： 
SELOBJDEV: 设备能力集，参数类型为In。 
SELOBJDEV_op: 设备操作能力集，参数类型为In。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
中国银联 
版权所有

---
**[p20]**

Q/CUP 069—2015 
14 
    
 
——描述： 
 关闭一个设备，具体是向设备返还操作能力，执行该操作后SELOBJDEV_OP能力将被销毁。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJDEV没有引用到一个设备能力集 (CAPOBJDEV)。 
 
SELOBJDEV_op没有引用到一个设备操作能力集 (CAPOBJDEV_OP)。 
7.4.4 注册设备信号 
 
——简介: 
status = tvm_reg_dev(SELOBJDEV, SELOBJSG, SELOBJ0, FLAG)。 
 
——参数 
SELOBJDEV: 设备能力集，参数类型In。 
SELOBJSG : 信号能力集，参数类型In。 
SELOBJ0 : 空能力集，参数类型Out，如果设备上返事件时需要传递传递参数，将该能力集填充为一
个Dataspace。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述： 
       将一个信号量与一个设备进行绑定，可用于设备向虚拟机上返事件。 
 
——状态： 
SUCCESS (0)：Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJDEV没有引用到一个设备能力集 (CAPOBJDEV)； 
 
SELOBJSG没有引用到一个信号能力集 (CAPOBJSG)。 
7.4.5 注销设备信号 
 
——简介: 
status = tvm_unreg_dev(SELOBJDEV, SELOBJSG, SELOBJDS, FLAG)。 
 
——参数 
SELOBJDEV: 设备能力集，参数类型为In。 
SELOBJSG : 信号能力集，参数类型为In。 
SELOBJDS : 数据空间能力集，参数类型为In。 
FLAG：调用标识，参数类型为In，占一个字节，目前为保留位。 
 
——描述： 
       将一个信号量与一个设备进行解除绑定，并回收共享数据空间。 
 
——状态： 
SUCCESS (0): Hypercall成功完成。 
BAD_CAP (-3)： 
 
SELOBJDEV没有引用到一个设备能力集 (CAPOBJDEV)； 
 
SELOBJSG没有引用到一个信号能力集 (CAPOBJSG)。 
SELOBJDS没有引用到一个数据空间能力集 (CAPOBJDB)。 
中国银联 
版权所有

---
**[p21]**

Q/CUP 069—2015 
15 
附 录 A 
（规范性附录） 
辅助函数库 
A.1 原子操作 
 
该操作主要用于实现信号量、互斥锁等功能，主要包括两个操作： 
 
（1）status = tvm_atomic_cmpxchg(tvm_u32 *dest,tvm_u32 cmp_val, tvm_u32 new_val) 
 
——参数描述： 
 
dest 目标变量，参数类型为In； 
 
cmp_val 比较值，参数类型为In； 
 
new_val 新值，参数类型为In。 
    ——函数简介： 
 
比较dest与cmp_val值，如果成功将dest设定为new_val。 
 
——返回值： 
 
0 代表比较成功，-1 代表比较失败 
 
（2）status = tvm_atomic_xchg(tvm_u32 *dest, tvm_u32  val) 
 
——参数描述： 
 
dest 目标变量，参数类型为In； 
 
new_val 新值，参数类型为In。 
——函数简介： 
 
将dest 设定为new_val值。 
——返回值： 
0代表设定成功，-1代表设定失败。 
A.2 内存操作 
该操作用于申请与回收物理连续的内存空间，可用于DMA类操作。 
（1）status =  tvm_create_cmem(tvm_u32 size, SEL mem, tvm_u32 *vir_mem, tvm_u32 *phy_mem ) 
  
——参数描述： 
 
size 申请内存大小，参数类型为In； 
 
mem 内存能力集索引，参数类型为Out； 
 
vir_mem 返回虚拟内存地址，参数类型为Out； 
 
phy_mem 返回物理内存地址，参数类型为Out。 
——函数简介： 
该操作用于申请一段物理连续的内存，并返回对应的虚拟地址与物理地址。 
——返回值： 
0代表操作成功，-1代表操作失败。 
（2）status =  tvm_destroy_cmem(SEL mem) 
  
——参数描述： 
 
mem 内存能力集索引，参数类型为In。 
 
     
中国银联 
版权所有

---
**[p22]**

Q/CUP 069—2015 
16 
 
——函数简介： 
 
该操作用于销毁所申请的内存空间。 
    ——返回值： 
 
0代表操作成功，-1代表操作失败。 
A.3 I/O设备操作 
该类操作主要用于开发设备驱动，并向上提供8.4节中所描述的设备控制接口。 
（1）status = tvm_io_lookup_device(const char *devname, tvm_io_device_handle  
*dev_handle, tvm_io_device_info *dev_info, tvm_io_resource_handle *res_handle) 
——参数描述 
 
devname 设备名称，与系统设备配置文件中的名称相对应，参数类型为In； 
 
dev_handle 用于返回所查找设备句柄，参数类型为Out； 
 
dev_info  用于返回设备信息，参数类型为Out； 
 
res_handle 用于返回设备所对应的资源句柄，参数类型为Out。 
 
——函数简介： 
该操作用于查找设备及其相关资源。 
 
——返回值： 
 
0代表操作成功，-1代表操作失败。 
 
（2）tvm_addr = tvm_io_request_resource_iomem(tvm_io_device_handle dev_handle, 
tvm_io_resource_handle *res_handle) 
    ——参数描述： 
 
dev_handle , 用于输入设备句柄，参数类型为In； 
 
res_handle, 用于输入设备所对应的资源句柄，参数类型为In。 
    ——函数简介：  
 
该操作主要用于通过相应的设备句柄与资源句柄查找对应的设备I/O地址。  
    ——返回值：   
 
返回值为对应设备的I/O地址,失败返回为空。 
 
（3）int tvm_io_request_resource_irq(tvm_io_device_handle dev_handle, 
tvm_io_resource_handle *res_handle) 
 
——参数描述： 
 
dev_handle , 用于输入设备句柄，参数类型为In； 
 
res_handle, 用于输入设备所对应的资源句柄，参数类型为In。 
——函数简介： 
该操作用于通过相应的设备句柄与资源句柄查找对应的设备的irq号。 
——返回值： 
操作成功将会返回一个irq号，失败将会返回-1。 
（3）tvm_irq * tvm_irq_request(int irqnum, void (*isr_handler)(void *), void *isr_data, 
int irq_thread_prio, unsigned flow_type) 
 
——参数描述： 
 
irqnum  所申请的irq 号，参数类型为In； 
 
isr_handle  中断处理函数句柄，参数类型为In； 
 
isr_data  中断处理函数的输入参数，参数类型为In； 
中国银联 
版权所有

---
**[p23]**

Q/CUP 069—2015 
17 
 
irq_thread_prio  中断处理函数所在线程的优先级，参数类型为In； 
 
flow_type 中断类型，参数类型为In。 
——函数简介： 
该操作用于通过指定的irq号注册中断处理函数。 
——返回值： 
操作成功将会返回一个irq句柄，失败将会返回空。 
A.4 cache操作 
（1）void tvm_cache_clean_data ( unsigned long start, unsigned long end ) 
——参数描述： 
 
start  起始地址，参数类型为In； 
 
end   结束地址，参数类型为In。 
——函数简介 
将cache中的内容写回内存。 
——返回值： 
无。 
（2）void tvm_cache_flush_data ( unsigned long start, unsigned long end ) 
——参数描述： 
 
start  起始地址，参数类型为In； 
 
end   结束地址，参数类型为In。 
——函数简介： 
无效化cache中的内容并将其写回内存。 
——返回值： 
无。 
（3）void tvm_cache_inv_data ( unsigned long start, unsigned long end ) 
 
——参数描述： 
 
start  起始地址，参数类型为In； 
 
end   结束地址，参数类型为In。 
——函数简介： 
使cache内容无效。 
 
——返回值： 
 
无。 
 
 
 
 
 
 
 
中国银联 
版权所有

---
**[p24]**

Q/CUP 069—2015 
18 
附 录 B 
（规范性附录） 
CAP_INFO 
CAP_INFO主要主要用于父PD向子PD传递能力集及配置参数，具体包括Cap_Name, Cap_Type, 
Cap_Index，Ctl_Value四个成员变量。下表介绍了可传递的能力集的具体参数定义与设定方法。 
 
 
Cap_Name（char*） 
Cap_Type（u8） 
Cap_Index（u32） 
Ctl_Value（u32） 
内存空间 
-- 
MEM 
-- 
MEM_SIZE 
镜像空间 
  user-defined 
IMG 
SELIMG 
-- 
对象空间-SC 
“Scheduler” 
OBJ_SC 
SELOBJSC 
QPD 
对象空间-PT 
user-defined 
OBJ_PT 
SELOBJPT 
-- 
对象空间
-DEV 
user-defined 
OBJ_DEV 
SELOBJDEV 
-- 
对象空间-DS 
user-defined 
OBJ_DS 
SELOBJDS 
-- 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
中国银联 
版权所有

---
**[p25]**

Q/CUP 069—2015 
19 
附 录 C 
（规范性附录） 
能力集获取 
    在能力集获取的过程中，一些能力集已经默认初始化到PD中，其Cap_Name由Micro Hypervisor设定，
具体包括： 
Cap_Name 
描述 
“Current_PD” 
用于获取当前进程的能力集索引 
“Main_EC” 
用于获取当前进程主线程的能力集索引 
“Portal_IN” 
用于获取当前进程与其父进程通信PT的能力集索引，方向为IN。 
“Portal_OUT” 
用于获取当前进程与其父进程通信PT的能力集索引，方向为OUT。 
“Scheduler” 
用于获取当前进程调度器对象的能力集索引 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
中国银联 
版权所有

---
**[p26]**

Q/CUP 069—2015 
20 
附 录 D 
（资料性附录） 
实现与用例 
    所有TVM虚拟机接口的实现均包含在teei_tvm.h中。 
 
中国银联 
版权所有