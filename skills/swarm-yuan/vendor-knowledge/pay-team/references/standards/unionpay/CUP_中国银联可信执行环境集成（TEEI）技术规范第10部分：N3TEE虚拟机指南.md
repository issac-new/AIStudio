# 中国银联可信执行环境集成（TEEI）技术规范第10部分：N3TEE虚拟机指南
> 来源: 银联规范 2015-12 存档 | 150页 | 提取: 2026-09-03


---
**[p1]**

Q/CUP 
中国银联股份有限公司企业标准 
中国银联可信执行环境集成（TEEI）技术规范 
第10 部分：N3TEE 虚拟机指南 
UnionPay Trusted Execution Environment Integration（TEEI）Technical Specifications 
Part 10：N3TEE Virtual Machine Guide 
 
 
2015-07-01 发布 
2015- 07-01 实施
Q/CUP 069—2015 
中国银联股份有限公司 发布 
中国银联 
版权所有

---
**[p2]**

Q/CUP 069—2015 
1 
 
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
2 
目  次 
目次 ................................................................................. 2 
前言 ................................................................................. 5 
1 范围 .............................................................................. 6 
2 规范性引用文件 .................................................................... 6 
3 符号和缩略语 ...................................................................... 6 
4 N3 TEE NEF 虚拟机 .................................................................. 7 
4.1 NEF 虚拟机Java 语言集 ............................................................. 7 
4.1.1 
类型 ........................................................................ 7 
4.1.2 
数组 ........................................................................ 7 
4.1.3 
类库 ........................................................................ 7 
4.1.4 
关键字 ...................................................................... 7 
4.1.5 
数据类型和值 ................................................................ 7 
4.1.6 
Native 接口 ................................................................. 7 
4.2 NEF 虚拟机架构 .................................................................... 7 
4.2.1 
NEF 虚拟机内部体系架构 ...................................................... 7 
4.2.2 
帧 .......................................................................... 9 
4.2.3 
应用 ........................................................................ 9 
4.2.4 
应用开发流程 ................................................................ 9 
4.2.5 
对象的表示 ................................................................. 10 
4.2.6 
异常 ....................................................................... 10 
4.2.7 
二进制文件格式 ............................................................. 10 
4.2.8 
指令集 ..................................................................... 10 
4.3 NEF 虚拟机链接文件 ............................................................... 10 
4.3.1 
概述 ....................................................................... 10 
4.3.2 
字符串语法 ................................................................. 13 
4.3.3 
NLF 文件总体结构 ........................................................... 14 
4.3.4 
NLF 文件组成结构 ........................................................... 14 
4.4 NEF 虚拟机可执行文件格式 ......................................................... 19 
4.4.1 
概述 ....................................................................... 19 
4.4.2 
NEF 文件总体结构 ........................................................... 19 
4.4.3 
NEF 文件组成结构 ........................................................... 20 
4.5 加载、链接与初始化 .............................................................. 37 
4.5.1 
NLF 索引链接的简易原理图 ................................................... 37 
4.5.2 
虚拟机的启动 ............................................................... 38 
4.5.3 
虚拟机目标文件的下载和安装 ................................................. 38 
4.5.4 
虚拟机目标文件的执行 ....................................................... 39 
中国银联 
版权所有

---
**[p4]**

Q/CUP 069—2015 
3 
4.6 NEF 虚拟机指令集 ................................................................. 40 
4.6.1 
指令描述的格式 ............................................................. 40 
4.6.2 
指令集 ..................................................................... 41 
5 N3 TEE DEX 虚拟机 ................................................................. 85 
5.1 DEX 虚拟机Java 语言集 ............................................................ 85 
5.1.1 
类型 ....................................................................... 85 
5.1.2 
数组 ....................................................................... 85 
5.1.3 
类库 ....................................................................... 85 
5.1.4 
关键字 ..................................................................... 85 
5.1.5 
Finalization ............................................................... 85 
5.1.6 
数据类型和值 ............................................................... 85 
5.1.7 
NATIVE 接口 ................................................................ 86 
5.2 DEX 虚拟机架构 ................................................................... 86 
5.2.1 
DEX 虚拟机内部结构 ......................................................... 86 
5.2.2 
类加载器 ................................................................... 87 
5.2.3 
运行时数据区域 ............................................................. 87 
5.2.4 
执行引擎 ................................................................... 88 
5.2.5 
字节码 ..................................................................... 88 
5.3 DEX 虚拟机可执行文件格式 ......................................................... 88 
5.3.1 
Dex 虚拟机可执行文件概述 ................................................... 88 
5.3.2 
文件头header .............................................................. 88 
5.3.3 
字符串表string_ids ........................................................ 89 
5.3.4 
类列表 ..................................................................... 89 
5.3.5 
字段表 ..................................................................... 89 
5.3.6 
方法表 ..................................................................... 89 
5.3.7 
类定义表 ................................................................... 89 
5.3.8 
代码头 ..................................................................... 90 
5.3.9 
本地变量列表 ............................................................... 90 
5.3.10 Class 文件和DEX 文件对应关系 ............................................... 90 
5.4 加载、链接与初始化 .............................................................. 91 
5.4.1 
虚拟机运行过程概述 ......................................................... 91 
5.4.2 
类加载器 ................................................................... 92 
5.4.3 
运行时常量池 ............................................................... 95 
5.4.4 
解释器 ..................................................................... 95 
5.5 DEX 虚拟机指令集 ................................................................. 97 
5.5.1 
DEX 指令描述的格式 ......................................................... 97 
5.5.2 
DEX 指令集 ................................................................. 97 
6 N3 TEE JEFF 虚拟机 ............................................................... 141 
6.1 JEFF 虚拟机概述 ................................................................. 141 
6.2 JEFF 虚拟机Java 语言集 .......................................................... 141 
6.2.1 
不支持的Java 特性 ......................................................... 141 
6.2.2 
类型 ...................................................................... 142 
中国银联 
版权所有

---
**[p5]**

Q/CUP 069—2015 
4 
6.2.3 
关键字 .................................................................... 142 
6.3 JEFF 虚拟机架构 ................................................................. 143 
6.3.1 
应用 ...................................................................... 143 
6.3.2 
类库 ...................................................................... 143 
6.3.3 
JEFF 虚拟机 ............................................................... 143 
6.4 虚拟机可执行文件格式 ........................................................... 144 
6.5 加载、链接与初始化 ............................................................. 145 
6.6 虚拟机指令集 ................................................................... 145 
 
 
中国银联 
版权所有

---
**[p6]**

Q/CUP 069—2015 
5 
前  言 
本指南阐述了N3 TEE虚拟机实现的概念、机制及其实现的相关内容。 
本部分由中国银联股份有限公司组织制定。 
本部分的主要起草单位：中国银联电子支付研究院。 
本部分的主要起草人：徐燕军、鲁志军、何朔、周钰、郭伟、李定洲、陈成钱、曾望年、严翔翔、
石玉平、张楚、陈吉、王立刚。 
 
本文档中的所有内容为中国银联股份有限公司的机密和专属所有。未经中国银联
股份有限公司的明确书面许可，任何组织或个人不得以任何目的、任何形式及任
何手段复制或传播本文档部分或全部内容。 
 
中国银联 
版权所有

---
**[p7]**

Q/CUP 069—2015 
6 
中国银联可信执行环境集成（TEEI）技术规范 
第10 部分：N3TEE 虚拟机指南 
1 
范围 
N3 TEE 应用虚拟机，指的是N3 TEE 上可信应用的专用虚拟机。它主要用于让使用高级程序语言所
编写的N3 TEE 可信应用在N3 TEE 上能够正常运行。 
本部分定义了N3 TEE 应用虚拟机的虚拟机结构、虚拟机所支持的指令集以及能够在虚拟机解析的
二进制文件的标准格式等。通过上述虚拟机的阐述，明确定义了能够在N3 TEE 应用虚拟机上正常运行
N3 TEE 应用的相关开发要求。 
     N3 TEE 虚拟机可以支持以下三种可执行文件格式： 
——支持NEF 可执行文件格式的虚拟机； 
——支持DEX 可执行文件格式的虚拟机； 
——支持JEFF 可执行文件格式的虚拟机。 
2 
规范性引用文件 
下列文件对于本文件的应用是必不可少的。凡是注日期的引用文件，仅所注日期的版本适用于本文
件。凡是不注日期的引用文件，其最新版本（包括所有的修改单）适用于本文件。 
 
ISO/IEC 20970: Information technology – Programming languages, their environments and 
system software interfaces – JEFF file format. First Edition, 2002-07-01 
该规范中定义了JEFF虚拟机文件格式和字节码指令集。 
3 
符号和缩略语 
API     应用编程接口（Application Programming Interface） 
NEF     N3 TEE NEF虚拟机的一种可执行文件格式（NEF Executable File） 
NLF  
N3 TEE NEF 虚拟机链接文件（NEF Link File） 
DEX  
N3 TEE DEX 虚拟机的一种可执行文件格式 
JEFF 
N3 TEE JEFF 虚拟机的一种可执行文件格式 
RFU  
保留供将来使用（Reserved For Future Use） 
VM  
虚拟机（Virtual Machine） 
CA  
客户应用（Client Application） 
FP  
桢指针（Frame Pointer） 
JIT  
即时编译技术（Just In Time） 
PC   
程序寄存器（Program Counter） 
REE  
富执行环境（Rich Execution Environment） 
SD  
安全域（Security Domain） 
中国银联 
版权所有

---
**[p8]**

Q/CUP 069—2015 
7 
TA  
可信应用（Trusted Application） 
TEE  
可信执行环境（Trusted Execution Environment） 
UUID 
通用唯一标识符（Universally Unique Identifier） 
TUI     可信图形界面（Trusted User Interface） 
4 
N3 TEE NEF 虚拟机 
4.1 NEF 虚拟机Java 语言集 
4.1.1 类型 
虚拟机不支持以下简单类型：long, double ,float,char。 
4.1.2 数组 
 虚拟机不支持多维数组。 
4.1.3 类库 
 虚拟机的基础类库有所局限，详情见《N3TEE 应用编程接口指南》。 
4.1.4 关键字 
 虚拟机不支持的Java 关键字： 
 
native  
synchronized  
 
transient 
 
volatile 
 
strictfp 
 
enum 
 
 
assert 
不支持对除简单类型数组之外的静态域在<clinit>方法中进行初始化。 
4.1.5 数据类型和值 
 虚拟机支持两种数据类型：简单数据类型和引用类型。相应地有简单值和引用值两类值可以被用
来： 
——保存在变量； 
——作为参数传递，方法返回和运算符操作等。 
简单数据类型包括数值类型(byte , short , int)，布尔类型。类型大小定义如下： 
——byte 类型为8 Bit； 
——short 类型为16 Bit； 
——int 类型为32 Bit； 
——布尔类型为 8 Bit。 
引用类型有：类、数组。他们的值分别为动态创建的实例对象。引用能被定义为空引用，表示不指
向任何对象。引用类型为32 Bit。 
4.1.6 Native 接口 
 虚拟机不支持应用的本地方法开发。 
4.2 NEF 虚拟机架构 
4.2.1 NEF 虚拟机内部体系架构 
中国银联 
版权所有

---
**[p9]**

Q/CUP 069—2015 
8 
在本虚拟机指南中，任何一个虚拟机实例的行为都是按照内存区、数据类型以及指令系统这些术语
描述而成的。这些组成部分一起组成了虚拟机的内部抽象体系。通过对于这些抽象组成部分以及组件间
交互的定义，从而明确了实现虚拟机所需要遵守的行为。 
虚拟机内部体系结构主要包括了运行时数据区以及执行引擎两个部分。则虚拟机内部体系结构图如
下图所示： 
堆
栈
程序寄存器
方法区
执行引擎
本地方法接口
运行时数据区
NEF文件
远程下载工具
OTA
本地方法库
 
图1 虚拟机内部体系结构图 
1) 执行引擎 
执行引擎是虚拟机实现的核心，主要用于控制二进制代码的载入以及解析字节码。执行引擎的行为
是由指令集来定义的。可以说，执行引擎对于字节码的解析即体现在指令对于字节码的执行过程。而在
应用执行过程中，所运行的每一个线程都是每一个独立的虚拟机执行引擎的实例。所有属于用户运行程
序的线程，也都是在实际工作中的执行引擎。 
2) 运行时数据区域 
虚拟机运行时数据区指运行N3 TEE 应用程序的时候，内存区中数据所存储的各个区域的总称。其
主要包括PC 寄存器、栈、堆以及方法区等部分： 
——PC 寄存器 
虚拟机运行时存在PC 寄存器，通过该寄存器可获取当前运行的虚拟机指令。如果当前运行的是本
地方法，该PC 寄存器的值是不确定的。 
——栈 
虚拟机运行时存在特定的虚拟机栈。 
虚拟机栈是用来储存帧的，它保存着参数、局部变量、中间运行结果以及返回值和调用方法等。虚
拟机采用了基于寄存器的指令设计，指令的运行不需要操作栈的支持，因此不存在操作栈。 
——堆 
 虚拟机堆在虚拟机的第一次启动时初始化，用于保存对象等运行时数据。 
 虚拟机要求具有垃圾回收能力。 
——方法区 
卡上的NEF文件中的类型信息（例如，类型信息、常量池、字段信息、方法信息、静态变量等）都
存储在堆中一块名为方法区的空间中。 
中国银联 
版权所有

---
**[p10]**

Q/CUP 069—2015 
9 
4.2.2 帧 
 虚拟机的方法调用会创建一个帧结构并压入帧栈,帧的内容有三个部分： 
——寄存器部分。寄存器个数是由本地变量，参数的个数来决定的； 
——辅助块。辅助块中包含该方法调用的必要信息，如：指令指针，方法标识等； 
只有能提供满足这两个部分的堆栈空间才能确保该函数调用的运行。 
本指南对具体实现的帧结构不做规定。 
4.2.3 应用 
 虚拟机的应用是以可执行文件（NEF）形式存在的，每个应用具有一个或多个NEF 文件，  
一个包对应一个NEF 文件。在装载后应用之间是独立存在的，N3 TEE 应用虚拟机支持不同应用之间的
访问。 
4.2.4 应用开发流程 
 
N3 TEE 包括： 虚拟机，N3 TEE 转换器，远程下载工具和REE 端运行的客户应用（安全域的客户应
用）以及N3 TEE 的安全域。而N3 TEE 应用开发流程则包括应用源码文件到虚拟机字节码指令的转化、
应用在虚拟机上的下载两部分。开发流程示意图如下图所示： 
源码编译文件
导入包NLF文件
N3转换器
源码编译文件
导入包NLF文件
远程下载工具
安全域
客户端应用（CA）
安全域
N3 虚拟机
Mobile Handset
 
图2 开发流程示意图 
中国银联 
版权所有

---
**[p11]**

Q/CUP 069—2015 
10 
用户使用高级程序语言开发适用于N3 TEE 应用虚拟机的应用过程步骤如下： 
——编写高级程序语言源程序，通过编译器生成中间文件（CLASS 文件）； 
——该应用在N3 TEE 应用虚拟机的模拟环境下运行，测试和调试； 
——运行和测试通过后，通过 转换器将中间文件转换成NEF 文件和 NLF 文件； 
 转换器的输入是该应用的所有中间文件（CLASS 文件）和所导入包的NLF 文件，生成若干个
NEF 文件，每一个包对应一个NEF 文件和NLF 文件。 
——转换完成后，NEF 文件被部署到N3 TEE。 
终端的安装工具将装载该NEF文件并传递到实现了 虚拟机的目标设备上，目标设备上的安装程序将
对该NEF文件进行解析。而 虚拟机再负责对应用的字节码进行执行，并生成相应的运行时结构，从而为
该应用的运行做好准备。 
4.2.5 对象的表示 
 虚拟机对对象的内部结构不做具体的规定。 
4.2.6  异常 
 虚拟机支持有限的预定义异常，自定义异常，抛出异常关键字throw。 
4.2.7  二进制文件格式 
 虚拟机的二进制文件为 NEF 文件： 可执行文件。详情见虚拟机可执行文件格式。 
 虚拟机每个包都同时保存了一个链接文件 NLF 文件，用于对引用该包的其他包的NEF 文件进行生
成。 
4.2.8 指令集 
虚拟机指令的主要特点有： 
—— 虚拟机是基于寄存器的，调用产生的堆栈需求在创建的时候就固定了。每个寄存器的大小都
是32 位的，可以通过寄存器对来保存64 位数据； 
——指令的保存单元是16 位的无符号数值； 
——除了特定类型的操作指令，其它指令并不会指定操作类型，如：move 指令并不管操作的是某
种特定类型； 
——在指令中的索引值是NEF 文件中LOCATION 部分的索引； 
——常量值直接在指令中表示。 
最多每条指令可支持256 个寄存器。 
4.3 NEF 虚拟机链接文件 
4.3.1 概述 
1) NLF 
NLF 链接文件主要是用于帮助应用生成基于索引链接的可执行文件。  该文件格式是小端的HEX 文
件。 
3) 基于索引的链接 
基于索引的链接是将链接中所用到的各类元素：类、域、方法等进行排列，使其在特定范围内具备
唯一索引值，然后使用该索引值来代替符号进行链接。由于这种方式使用索引值替代了字符串符号，因
此该方式也更有利于节省内存空间（NLF 索引链接的简易原理图）。索引类型信息如下表所示： 
中国银联 
版权所有

---
**[p12]**

Q/CUP 069—2015 
11 
表1 索引类型信息表 
索引类型 
取值范围 
类型 
作用域 
包 
0-127 
Private 
包 
类 
0-254 
Public 
包 
静态域 
0-255 
Public 
类 
静态方法 
0-255 
Public 
类 
实例域 
0-255 
Public 或Private 
类 
虚方法 
0-127 
Public 或Private 
继承类 
接口方法 
0-127 
Public 
类 
——索引的空间 
索引空间指的是索引的作用范围。 
(a) 包的索引空间在特定的应用内。 
(b) 类的索引空间在特定的包内。 
(c) 实例域和实例方法的索引空间在特定的类内。 
(d) 静态域和静态方法的索引空间在整个包内。 
——索引的类型 
(a) 包的索引 
模块内的包的索引必须从0 开始连续排列。包的索引取值范围是0~255。指南要求被引用 
包的索引必须小于引用包的索引。 
(b) 类和接口的索引 
模块中某个包对外界可见的类或接口的索引值在该包内有效。索引值必须从0 开始连续
排列。类或接口的索引取值范围为0~254，指南对其索引的排序不做规定。只包内可见的
类或接口不具有索引值。 
(c) 静态域的索引 
包中对外界可见的静态域的索引值必须从0 开始连续排列，取值范围为0~255，指南对其
索引的排序不做规定。只包内可见的静态域不具有索引值。 
(d) 静态方法和构造器的索引 
包中对外界可见的静态方法和构造器的索引值必须从0 开始连续排列，指南对其索引的
排序不做规定。只包内可见的静态方法或构造器不具有索引值。 
(e) 实例域的索引 
实例域的索引为该域在实例对象中的位置索引，实例域的命名空间在类内。所有的实例
域都具有一个实例域索引，该索引必须是从0 开始的连续排列。注意：这里所说的实例
域值包括类本身声明的实例域，不包括从父类继承而得的。 
中国银联 
版权所有

---
**[p13]**

Q/CUP 069—2015 
12 
Int 类型实例域的索引占据两位。例如，某Int 类型实例域的索引为a，其后续的实例域
索引的值为a+2。 
实例域索引的规则： 
a) 外部可见的实例域的索引值小于包内可见或私有的实例域的索引值。 
b) 对外部可见的实例域来说，引用类型的实例域的索引值必须大于简单类型的实例域的
索引值。 
c) 对包内可见或是私有的实例域来说，引用类型的实例域的索引值必须小于简单类型的
索引值。 
d) 实例域索引规则顺序示例简表如下表所示：  
表2 实例域索引规则顺序示例简表 
可见性 
种类 
类型 
索引值 
外部可见实例域
（Public、Protecte
类型）  
简单类型 
boolean 
0 
byte 
1 
short 
2 
引用类型 
byte[] 
3 
applet 
4 
包内可见实例域
（Package、Private
类型）  
引用类型 
short[] 
5 
object 
6 
简单类型 
int 
7 
short 
9 
(f) 虚方法的索引  
虚方法是指需要动态关联的实例方法，虚方法分为外部可见的和私有的两类。外部可见
的是指public、protected 类型的，私有的是指只包内可见的。两类方法的索引具有不
同的命名空间，外部可见方法索引最高位设置为0，私有方法索引最高位设置为1，剔除
最高的标志位，索引的取值范围为0~127。 
a) 外部可见的索引值从该类父类的最大外部虚方法索引加1 开始连续排列，如果覆盖
了父类的虚方法，本类中该虚方法的索引值等于父类中该虚方法的索引值。 
b) 私有的虚方法索引值有两种情况：如果该类的父类和该类在同一个包内，则该类的
私有虚方法索引从父类的私有虚方法索引最大值加1 开始连续排列，如果覆盖了父类的
虚方法，本类中该虚方法的索引值等于父类中该虚方法的索引值。如果该类的父类和该
类不在一个包内，则该类的私有虚方法索引从0 开始连续排列。 
(g) 接口方法的索引 
接口方法指该接口自身定义的方法和该接口从父接口继承的方法，接口方法的索引必须
从0 开始连续排列。接口和父接口各自的方法索引之间没有任何关系，即同一个接口方
法在父接口和子接口中可能具有不同的索引值。接口方法的索引取值范围为0~127，最高
位为0。 
4) 文件特定元素说明 
中国银联 
版权所有

---
**[p14]**

Q/CUP 069—2015 
13 
 NLF 文件支持的数据类型主要分为U1、U2、U4 三种： 
U1 
 
无符号的1 字节值 
U2 
 
无符号的2 字节值 
U4 
 
无符号的4 字节值  
4.3.2 字符串语法 
——SimpleName: 表示一个普通的字符串。 
SimpleName: 
 
 
SimpleNameChar(SimpleNameChar)* 
SimpleNameChar: 
 
‘A’…’Z’ 
| 
‘a’…’z’ 
| 
‘0’…’9’ 
| 
‘$’ 
|  ‘-’ 
| U+00a1…U+1ffff 
| U+2010…U+2027 
 
| U+2030…U+d7ff 
| U+e000…U+ffef 
| U+10000…U+10ffff 
——FullClassName: 表示一个完整的类名。 
FullClassName: 
 
OptionalPackagePrefix SimpleName 
OptionalPackagePrefix:   
 
(SimpleName’/’)*——ShortyDescriptor: 用来表示一个方法的原型.  
ShortyDescriptor: 
 
(ShortyFieldType)*ShortyReturnType 
ShortyReturnType: 
 
‘V’ 
| 
ShortyFieldType 
ShortyFieldType: 
 
‘Z’ 
| 
‘B’ 
| 
‘S’ 
| 
‘I’ 
| 
‘L’FullClassName’;’ 
——MemberName: 域或方法的名字。 
MemberName: 
 
SimpleName 
| 
‘<’SimpleName’>’ 
——FullMethodName: 完整的方法名 
FullMethodName: 
 
FullClassName+’.’+Membername+ ShortyDescriptor 
中国银联 
版权所有

---
**[p15]**

Q/CUP 069—2015 
14 
——FullFieldName: 完整的域名 
 
FullFieldName: 
 
FullClassName+’.’+Membername;  
4.3.3 NLF 文件总体结构 
NLF 文件一共包括了五个部分： 
Struct NLF{ 
 
U1[] header; 
 
U2 exportClassesCount; 
 
ClassInfo[] exportClasses; 
 
StringTable symbols; 
U1[] stringData; 
} 
header 
该部分是对整个文件的一个简要描述。 
exportClassesCount 
该部分描述了输出类及其相关子元素个数。 
exportClasses 
该部分描述了输出类及其相关子元素的具体信息，并存放着符号信息与对应索引间的映射关
系。 
symbols 
该部分描述了NLF 文件中所有符号信息的偏移值。 
stringData 
该部分描述了NLF 文件中的所有符号信息。 
4.3.4 NLF 文件组成结构 
1) Header 
Header 部分描述了整个NLF 文件的描述信息结构，其具体结构如下： 
Struct Header { 
 U4 magic; 
 U2 headerSize; 
 U2 expClassesSize; 
 U2 expClassesOffset; 
 U2 StringTableSize; 
 U2 StringTableOffset; 
 U2 StringDataSize; 
 U2 StringDataOffset; 
 U1[] packageInfo; 
} 
 
Magic 
 
.NLF  
headSize 
中国银联 
版权所有

---
**[p16]**

Q/CUP 069—2015 
15 
 
header[]的大小 
expClassesSize 
 
输出的类信息的长度 
expClassesOffset 
 
exportClasses 在文件中的偏移量 
StringTableSize 
 
字符串表的长度 
StringTableOffset 
 
字符串表在文件中的偏移量 
StringDataSize 
字符串内容的长度 
StringDataOffset 
 
字符串内容在文件中的偏移量 
packageInfo 
 
描述本模块信息的信息结构 
 
Struct packageInfo{ 
 
 
   U1 AIDLength; 
U1 aid[AIDLength]; 
U2 packageId; 
 
 
    U2 version 
 
 
    U2 packageDescription 
} 
AIDLength 
 
aid[]长度。 
aid[] 
 
表示应用模块的id。 
packageId 
 
包的索引值。 
 
packageId 编码规则：同一应用内包的索引由0 开始编码，保证引用包的索引值大于被引
用包的索引值。 
version 
 
该NLF 文件的版本，同一个包的NLF 文件和NEF 文件的版本必须相同 
packageDescription 
 
包的描述字符串在字符串表中的索引 
5) ExportClasses 
输出类信息部分具体描述了输出类及其相关子元素：静态域，静态方法，实例域，实例方法的索引
信息的具体结构，在该数组中输出类的顺序不做规定。 
Struct ClassInfo{ 
 
U1 index; 
 
U2 accessFlags; 
 
U2 nameidx; 
 
U2 exportSupersCount; 
 
U2 supers[exportSupersCount]; 
中国银联 
版权所有

---
**[p17]**

Q/CUP 069—2015 
16 
 
U2 exportInterfacesCount; 
 
U2 interfaces[exportInterfacesCount]; 
 
U2 exportFiledsCount; 
 
FieldInfo fields[exportFieldsCount]; 
 
U2 exportMethodsCount; 
MethodInfo methods[exportMethodCount]; 
} 
index 
类的索引值 
accessFlags 
该域的修饰标志，具体值见下表：  
表3 NLF 文件中类的标志 
名字 
值 
描述 
用处 
ACC_PUBLIC 
0x0001 
公共的，可以在包外获取 类和接口 
ACC_FINAL 
0x0010 
Final 属性，不允许子类 
类 
ACC-intERFACE 
0x0200 
接口 
接口 
ACC_ABSTRACT 
0x0400 
抽象类，无法实例化 
类，接口 
ACC_REMOTE 
0x1000 
远程的 
类，接口 
nameidx 
该类名的字符串表索引，索引指定的字符串必须是章节3.3 中的FullClassName，该类名必须
能在包内唯一标识该类。 
exportSupersCount 
supers 数组的个数。 
supers[] 
该类父类中包外可见的类列表。数组中的每一个元素是StringTable 中的String 索引，该索
引所指向的字符串必须是一个FullClassName。 
对于接口来说，supers 数组值包含一个元素，该元素所指向的字符串为 java/lang/Object;。 
exportInterfacesCount 
interfaces[] 数组的元素个数。 
interfaces[] 
如果该ClassInfo 描述的是一个类，interfaces 数组中排列了所有该类实现的、包外可见的
接口。数组中的每一个元素是StringTable 中的String 索引，该索引所指向的字符串必须是
一个FullClassName。 
如果该ClassInfo 描述的是一个接口，interfaces 数组中排列了所有给接口扩展的包外可见
的接口。数组中的每一个元素是StringTable 中的String 索引，该索引所指向的字符串必须
是一个FullClassName。 
exportFieldCount 
fields[] 数组中元素的个数。 
fields[] 
fields 是FieldInfo 结构的数组，每一个元素描述了该类或接口中定义的公共可见的域。注
意这里不包括从父类或父接口继承而来的域。 
中国银联 
版权所有

---
**[p18]**

Q/CUP 069—2015 
17 
FieldInfo 
 
FieldInfo 结构如下所示：  
Struct FieldInfo{ 
 
   U1 index; 
U2 accessFlags; 
U2 nameIndex; 
U4 constant[]; 
} 
 
index 
 
Index 的值有如下情况： 
——如果该域是final,static 属性的简单类型，该值为0xFF. 
——如果该域是静态的，非final 的，该值为一个静态域索引。 
——如果该域是一个实例域，该值为一个实例域索引。 
accessFlags 
 
该域的修饰标志，具体值见下表： 
表4 NLF 文件中域的获取和修饰标志位。 
名字 
值 
描述 
使用 
ACC_PUBLIC 
0x0001 
具有public 属性，可以包外
存取 
任何类型的域都可以使用 
ACC_PROTECTED 
0x0004 
具有protected 属性，可以
被子类获取 
类域，实例域 
ACC_STATIC 
0x0008 
静态属性 
类域，实例域 
ACC_FINAL 
0x0010 
Final 属性，初始化后无法改
变 
任何类型域 
ACC_CONSTANT 
0x0002 
表示该域具有常量值 
简单类型的静态变量 
nameIndex 
StringTable 中字符串索引，该索引所指定字符串能唯一标识一个域。该字符串是
FullFieldName 类型。 
constant[] 
当index 为0xFF 时，该数组具有一个元素，表示该域的常数值。 
exportMethosCount 
methods[]数组的元素个数。 
Methods[] 
Methods 是MethodInfo 结构的数组，每一个元素描述了该类或接口中定义的公共可见的方法。
注意这里包括从父类或父接口定义的方法。 
MethodInfo 
Struct MethodInfo { 
  
U1 index; 
 
    U2 accessFlags; 
 
    U2 nameIdx; 
} 
中国银联 
版权所有

---
**[p19]**

Q/CUP 069—2015 
18 
 
index 
如果是静态方法或构造函数,该index 值为5.3 简介中讲述的静态方法的索引值。 
如果是虚方法，该index 值为虚方法的索引值。 
 
    如果是接口方法，该index 值为接口方法的索引值。 
accessFlags 
方法的获取和修饰标志，具体见下表：  
表5 NLF 文件中方法的获取和修饰标志。 
名字 
值 
描述 
使用 
ACC_PUBLIC 
0x0001 
Public 属性，可以包外获取。 
任何类型方法。 
ACC_PROTECTED 
0x0004 
Protected 属性，可以被子类获
取 
类方法和实例方法 
ACC_STATIC 
0x0008 
Static 属性 
类方法和实例方法 
ACC_FINAL 
0x0010 
Final 属性 
类方法和实例方法 
ACC_ABSTRACT 
0x0400 
Abstract 属性 
任何类型方法 
nameIdx 
StringTable 中的索引值，该索引所指定的字符串格式必须FullMethodName。 
6) StringTable  
该部分的具体结构如下： 
Struct StringTable{ 
 
U4 stringCount; 
U4[] stringContentOffset; 
} 
stringCount 
字符串的个数 
stringContentOffset 
4 字节的无符号整数数组，每个数组的值为该数组下标所指向的字符串的具体内容在文件中的
偏移量，指定的偏移量处必须是一个StringEntry 结构 
7) StringData 
 
该部分内容为以空字符结束的字符串的具体内容。结构如下： 
 
Struct StringData{ 
 
 
StringEntry strings[];  
} 
Struct StringEntry{ 
U4 length; 
U1 bytes[length];  
} 
 
length 
bytes[] 数组的长度。 
bytes[] 
中国银联 
版权所有

---
**[p20]**

Q/CUP 069—2015 
19 
UTF-8 格式的字符串具体内容。 
4.4 NEF 虚拟机可执行文件格式 
4.4.1 概述 
NEF文件作为应用部署中的重要成分，和其他静态资源一起组成应用。NEF文件是和包对应的，NEF
文件包含应用某一个包中的每一个类和接口的定义、描述。通过装载和链接，NEF文件能产生应用的可
运行状态，使得应用可以正常运行。其文件格式为小端的HEX文件。 
1) 文件特定元素说明 
 NEF 文件支持的数据类型与NLF 一致，也主要分为U1、U2、U4 三种： 
——U1  
无符号的1 字节值； 
——U2  
无符号的2 字节值； 
——U4  
无符号的4 字节值 。 
4.4.2 NEF 文件总体结构 
 
NEF 文件结构主要包括以下方面：HEAD、IMPORT、TAPPLICATION、CLASSES、METHODS、STATICFIELDS、
EXPORT、LOCATIONS、LINKASSIST 以及DEBUGINFO 共十个组成部分。具体内容则如下表所示：  
表6 NEF 文件总体结构表 
组成 
描述 
HEAD 
NEF 文件的头结构。 
IMPORT 
NEF 文件导入的包的信息 
TAPPLICATION 
NEF 文件中TAPPLICATION 的定义 
CLASSES 
NEF 文件中所有的类信息。 
METHODS 
NEF 文件中所有的方法信息。 
STATICFIELDS 
NEF 文件中所有的静态域信息。 
EXPORT 
NEF 文件导出的类的信息。 
LOCATIONS 
NEF 文件的位置常量池。 
LINKASSIST 
NEF 文件链接的帮助结构。 
DEBUGINFO 
NEF 文件的调试信息，置放于卡外。 
 
 虚拟机的实现必须能正确处理除了DEBUGINFO 之外的其它所有NEF 文件成分。 
 
HEAD 
 
 
该部分是对整个文件的一个简要描述，主要内容包括： 
——NEF 文件本身的信息 
——应用的描述信息 
——NEF 文件各个组成成分的描述信息 
 
IMPORT 
该部分描述了应用需要导入的包的信息，这些包是应用部署的前提条件，只有这些包在N3 TEE
应用虚拟机上已经正确部署，该应用才有部署的可能。 
TAPPLICATION  
 
 
该部分描述了应用中该NEF 文件对应应用中TAPPLICATION 的描述信息。 
中国银联 
版权所有

---
**[p21]**

Q/CUP 069—2015 
20 
 
CLASSES 
 
 
该部分描述了应用中该NEF 文件对应包定义的类和接口的描述信息。 
 
METHODS 
该部分描述了应用中该NEF 文件对应包所有方法的信息，包括方法的描述信息，CODE 区，异
常。 
 
STATICFIELDS 
 
 
该部分描述了应用中该NEF 文件对应包定义的所用静态域的信息。 
 
EXPORT 
该部分定义了应用中该NEF 文件对应包向外界提供的接口。 
 
LOCATION 
该部分是该NEF 文件中定义的元素运行时位置信息，包括类，方法，域等。对于简单类型的常
数直接在指令中体现。 
 
LINKASSIT 
定义了在NEF 文件下载后需要进行链接的部分。当通过LINKASSIT 部分的帮助完成链接工作后
该NEF 文件的部署才算完成，否则失败。 
DEBUGINFO 
当N3 TEE 应用虚拟机卡片支持调试时，NEF 文件附带的调试信息部分，该部分不随NEF 文件
装载到卡片上，而只存在于IDE 端用于调试。 
4.4.3 NEF 文件组成结构 
1) HEAD 
HEAD 部分的结构如下 
 
Struct HEAD{ 
 
 
U1[4] magic; 
 
 
U4 fileSize; 
 
    U4 headerSize; 
 
 
u1[] package; 
 
 
U4 importSize; 
 
 
U4 importOffset; 
 
 
U4 tappSize; 
 
 
U4 tappOffset; 
 
 
U4 classesSize; 
 
 
U4 classesOffset; 
 
 
U4 methodsSize; 
 
 
U4 methodsOffset; 
 
 
U4 staticFieldsSize; 
 
 
U4 staticFieldsOffset; 
 
 
U4 exportSize; 
 
 
U4 exportOffset; 
 
 
U4 locationsSize; 
 
 
U4 locationsOffset; 
 
 
U4 linkAssistSize; 
 
 
U4 linkAssistOffset; 
中国银联 
版权所有

---
**[p22]**

Q/CUP 069—2015 
21 
} 
Magic 
NEF 文件的魔力数字，值为.NEF。 
fileSize 
NEF 文件的大小，以字节为单位（后面所涉及到的Size 均以字节为单位）。 
headerSize 
HEAD 部分的大小， 
package 
该NEF 文件所代表的包的描述结构。具体结构如下： 
 
Struct PACKAGEINFO { 
 
 
U1 AIDLength; 
 
 
U1 aid[AIDLength]; 
 
 
U1 packageindex; 
 
 
U2 version 
} 
AIDLength 
 
aid[]长度。 
aid[] 
 
表示应用模块的id。 
version 
NEF 文件对应包的版本，N3 TEE 应用虚拟机上部署的包版本必须是唯一确认的，对
不匹配版本包的IMPORT 结果是未知的。 
packageIndex 
包在应用中的编号。当一个应用中有多个包存在时，被引用包的编号必须小于引用
包的编号。 
 
importSize 
 
 
IMPORT 部分的大小。 
 
importOffset 
 
 
IMPORT 部分在NEF 文件中的偏移。 
tappSize 
 
TApp 部分的大小。 
tappOffset 
 
TApp 部分的偏移。 
 
classesSize 
 
 
CLASSES 部分的大小。 
 
classesOffset 
 
 
CLASSES 部分在NEF 文件中的偏移 
 
methodsSize 
 
 
METHODS 部分的大小。 
methodsOffset 
 
 
METHODs 部分在NEF 文件中的偏移。 
staticFieldsSize 
STATICFIELDS 部分的大小。 
中国银联 
版权所有

---
**[p23]**

Q/CUP 069—2015 
22 
 
staticFieldsOffset 
 
 
STATICFIELDS 部分在NEF 文件中的偏移。 
exportSize 
EXPORT 部分的大小。 
exportOffset 
 
 
EXPORT 部分在NEF 文件中偏移。 
locationsSize 
LOCATIONS 部分的大小。 
 
locationsOffset 
 
 
LOCATIONS 部分在NEF 文件中的偏移。 
 
linkAssistSize 
 
 
LINKASSIST 部分的大小。 
 
linkAssistOffset 
LINKASSIST 部分在NEF文件中的偏移。 
8) IMPORT 
 
IMPORT 部分描述了该NEF 文件对应包所引用的包的信息。结构如下： 
 
Struct IMPORT{ 
 
 
U1 count; 
 
 
PACKAGEINFO packages[count]; 
 
} 
 
count 
 
 
Packages 数组的元素个数 
packages 
所引用的包的信息列表，PACKAGEINFO 结构见5.4.3 HEAD。 
9) TAPP 
该模块描述了包中定义的TApp 的入口点信息，TApp 通过实现类TApp 的一个非抽象的子类定义。
具体结构如下： 
 
Struct TAPP { 
U1 count;  
{ 
    U1 AID_length 
    U1 AID[AID_length];  
    U2 class_addr;  
    U2 init_method_addr;  
} TApps [count] 
} 
 
count  
    表示Java 包中定义的TApp 的数目 
AID_length 
    AID 项的字节长度 
AID 
中国银联 
版权所有

---
**[p24]**

Q/CUP 069—2015 
23 
    AID 项表示一个TApp 在N3 TEE 中的名字 
 
class_addr 
         该TApp 类在ClassComponent 中的偏移 
 
init_method_addr 
 
 
该TApp 类的无参数构造函数在METHOD 组件中的偏移。 
10) CLASSES 
CLASSES 部分描述了该NEF 文件对应包内定义的所有接口和类。 
 
这里描述的类或接口信息包含有其它类和接口的引用，比如：父类、父接口、实现接口的引用等，  
这些引用的元素也可能来自CLASSES 部分本身，也可能来自于其它包。 
 
这里描述的类信息包括对METHOD 部分中定义的虚方法的引用。如果某类的虚方法是定义在其它导
入包，这些虚方法的引用不在此定义，而是通过对父类的查找来找到该虚方法的引用。 
 
CLASSES 部分的基本机构如下： 
 
 
Struct CLASSES { 
 
 
 
CLASSITEM 
 
classes[]; 
 
 
} 
 
 
classes[] 
classes[]是ClassInfo 结构的数组，描述了该NEF 文件对应包定义的所有类和接口，描
述的顺序是父类先于子类，父接口先于子接口。 
a) 接口 
CLASSITEM 的结构描述的接口和类具有不同的结构，通过第一个字节的最高位来区别类和接口。 
 
当classes[]数组中的元素描述的是接口的信息，CLASSITEM 结构如下： 
 
Struct CLASSITEM{ 
 
 
U1 byte1{ 
 
 
 
Bit[4] flags; 
 
 
 
Bit[4] interfaceCount; 
 
 
} 
 
 
Loc_class superInterfaces[interfaceCount] 
} 
 
flags 
 
 
flags 的具体值如下表所示： 
表7 Flags 值表 
名字 
值 
ACC_CLASS 
0x0 
ACC-intERFACE 
0x8 
 
 
ACC-intERFACE 指定了该结构是一个interfaceItem 结构。 
 
interfaceCount 
 
 
interfaceCount 指定了父接口的个数，包括直接的父接口和间接的父接口。
 
superInterfaces[] 
superInterfaces 是Location_class 类型的数组，描述的是该接口的所有父接口的位置信息。
当该接口没有父接口时，数组为空。 
 
b) 类 
中国银联 
版权所有

---
**[p25]**

Q/CUP 069—2015 
24 
CLASSITEM 当表示类时结构如下： 
Struct CLASSITEM{ 
 
U1 byte1 { 
 
 
Bite[4] flags; 
 
 
Bite[4] interfaceCount; 
 
} 
 
Loc_class superClass; 
 
U1 instanceSize; 
 
U1 firstRefereceIndex; 
 
U1 referenceCount; 
 
U1 publicMethodTableBase; 
U1 publicMethodTableCount; 
 
U1 packageMethodTableBase; 
 
U1 packageMehodTableCount 
 
U2 publicVirtualMehodTable[publicMethodTableCount]; 
 
U2 packageVirtualMethodTable[packageMethodTableCount]; 
 
implementInterfaceInfo interfaces[interfaceCount]; 
} 
flags 
flags 的定义见5.4.3 CLASSES 接口中CLASSITEM 对flags 的定义。 
interfaceCount 
interfaceCount 表示该类实现的的接口个数。包括该类实现接口的父接口和该类父类实现的
接口。 
superClass 
superClass 是LOCATION 部分里的location_class 结构，表示了父类的引用。如果该类没有
父类，该值为0xFFFFFFFF. 
instanceSize 
表示该类实例域的大小，大小的表示单位为16 位长度单元。该字段数值表示该类实例域占多
少个长度单元。注意这里不包括父类的实例域。 
firstReferenceIndex 
firstReferenceIndex 表示了该类实例域中第一个引用类型实例域的索引。实例域的索引见
5.3.1 基于索引的链接中关于实例域索引值的规定。这儿的实例域并不包括父类的实例域。如
果该类实例域中没有引用类型，该值为0xff。 
referenceCount 
referenceCount 表示了该类实例域引用类型的实例域的个数，不包括该类父类的实例域。 
publicMethodTableBase 
publicMethodTableBase 等于publicVirtualMethodTable 数组中第一个方法的索引值。虚方
法的索引值详细规定见5.3.1 基于索引的链接中关于虚方法索引值的规定。如果该类的
publicVirtualMethodTable
为空，publicMethodTableBase
的值等于该类父类的
publicMethodTable 表的个数。如果该类父类为空，并且该类的publicMethodTable 表为空，
publicMethodTableBase 的值为0。 
publicMethodTableCount 
publicMethodTable 表中方法的个数。如果该类没有覆盖父类的公共虚方法，该值等于类自身
中国银联 
版权所有

---
**[p26]**

Q/CUP 069—2015 
25 
定义的publicMethodTable 表的个数，如果该类覆盖了父类中的公共虚方法，该值等于类自身
定义的公共虚方法的个数加上覆盖的父类方法中索引值最小的方法起（包括）到父类
publicMethodTable 表结束的方法个数。 
packageMethodTableBase 
packageMethodTableBase 等于packageMethodTableTable 数组中第一个虚方法的索引值。虚
方法的索引值详细规定见5.3.1 基于索引的链接中关于虚方法中私有方法索引值的规定。如果
该类的packageMethodTableTable 为空，packageMethodTableBase 的值等于该类父类的
packageMethodTableTable
表的个数。如果该类父类为空，并且该类的
packageMethodTableTable 
表为空，packageMethodTableBase 的值为0。 
packageMethodTableCount 
packageMethodTable 表中方法的个数。如果该类没有覆盖父类的包可见虚方法，该值等于类
自身定义的packageMethodTable 表的个数，如果该类覆盖了父类中的包可见虚方法，该值等
于类自身定义的包可见虚方法的个数加上覆盖的父类方法中索引值最小的方法起（包括）到父
类packageMethodTable 表结束的方法个数。 
publicVirtualMethodTable[] 
publicVirtualMehtodTable 是一个表示该类中定义的虚方法，属性为public 或protected 的
方法。 
该表中包括类自身定义的的虚方法，还包括父类定义而该类覆盖了的虚方法。该数组元素的
下标等于指定方法的索引值减去publicMethodTableBase 的值。该数组中的每一个元素表示指
定方法在METHOD 部分中的偏移。 
packageVirtualMehtodTable[] 
packageVirtualMethodTable 数组包括了包内可见的虚方法。包内可见的虚方法是指该类自身
定义的包内可见方法和同一个包内的父类定义的protected 方法。该数组元素的下标等于指定
方法的索引值减去packageVirtualMehtodTable Base 的值。该数组中的每一个元素表示指定
方法在METHOD 部分中的偏移。 
interfaces[] 
interfaces 数组是implementedInterfaceInfo 结构的数组，表示该类实现的所有接口及其接
口方法和虚方法的对应信息。 
 
 
ImplementedInterfaceInfo 
ImplementedInterfaceInfo 结构如下： 
 
 
Struct ImplementedInterfaceInfo{ 
 
 
 
Location_class interface; 
 
 
 
U1 count; 
 
 
 
U1 index[count]; 
 
 
} 
 
 
interface 
 
 
 
Location_class 结构表示该接口的引用。 
 
 
count 
 
 
 
Index 数组的个数。 
 
 
index[] 
该数组表示接口方法到实现该接口的类的虚方法的索引值。该数组的下标等于该接口
定义的接口方法的索引值，该下标所在元素的值等于该接口方法被实现后在实现类中
中国银联 
版权所有

---
**[p27]**

Q/CUP 069—2015 
26 
的虚方法索引值。 
5) METHODS 
 
该部分描述了NEF 文件对应包中定义的所有方法的执行信息，除了<clinit>方法和接口的方法声
明。该部分还包括用于异常处理的信息。 
 
METHODS 部分的结构如下： 
 
Struct METHODS { 
 
 
U1 handlerCount; 
 
 
CatchHandlerInfo  catchHandlers[handlerCount]; 
 
 
MethodItem methods[]; 
 
} 
 
handlerCount 
 
 
异常处理信息数组catchHandlers 的个数。 
catchHandlers 
 
 
异常处理结构描述了一个catch 或finally 块，其排列顺序是 
 
 
——如果是嵌套的catch 或finally 块，先内层再外层。 
 
 
——如果是同层次有多个catch 块，则按照在方法中出现的顺序排列。 
 
 
CatchHandlerInfo 结构如下： 
 
 
 
Struct CatchHandlerInfo{ 
 
 
 
 
U2 startAddr; 
 
 
 
 
U2 workLength; 
 
 
 
 
U2 handlerOff; 
 
 
 
 
U2 catchTypeIndex; 
} 
 
 
 
startAddr 
try 块的起始位置，该值为指令相对于METHODS 部分的偏移。 
 
 
 
workLength 
 
 
 
 
try 块的长度，以字节为单位。 
 
 
 
HandlerOff 
 
 
 
 
异常处理指令所在的位置，该值为指令所在位置相对于METHODS 部分的偏移。 
 
 
 
catchTypeIndex 
该索引指向LOCATION 部分中的位置列表中的摸个位置信息。如果catchTypeIndex
值为0，则表示这个异常处理块是finally 模块。否则这个异常处理块捕捉
catchTypeIndex 所指定类型的异常。 
 
methods 
methods 是一个不定长度的MethodItem 结构的列表，这里的方法包括除了<clinit>和接口的
方法声明之外的所用方法的定义。 
MethodItem 结构如下： 
 
 
struct methodInfo{ 
MethodHead methHeader; 
 
 
 
U2 bytecodes[]; 
 
 
} 
 
 
methHeader 
 
 
 
MethodHead 结构描述了方法的概要信息，包括以下两种具体结构： 
中国银联 
版权所有

---
**[p28]**

Q/CUP 069—2015 
27 
 
 
 
Struct MethodHead { 
 
 
 
 
U1 bit1{ 
 
 
 
 
 
Bit[4] flags; 
 
 
 
 
 
Bit[4] registerSize; 
} 
U1 bit2{ 
 
Bit[4] insSize; 
 
Bit[4] notUsed;  
} 
 
 
 
} 
 
 
 
Struct ExtendMethodHead{ 
 
 
 
 
U1 bit1{ 
 
 
 
 
 
Bit[4] flags; 
 
 
 
 
 
Bit[4] notUsed; 
 
 
 
 
} 
 
 
 
 
U1 registerSize; 
 
 
 
 
U1 insSize; 
 
 
 
 
U1 notUsed; 
} 
 
 
 
Flags 
 
 
 
 
方法的标志，该处值如下表所示：  
表8 NEF 文件方法标志表 
标志 
值 
ACC_EXTENDED 
0x8 
ACC_ABSTRACT 
0x4 
ACC_NATIVE  
0x2 
 
 
 
 
ACC_EXTENDED 指定该METHODHEAD 结构是ExtendMethodHead 结构。 
 
 
 
 
ACC_ABSTRACT 指定该方法是ABSTRACT 方法。 
 
 
 
 
ACC_NATIVE 指定该方法是Native 方法。 
 
 
 
registerSize 
 
 
 
 
表示该方法所使用的寄存器的个数，寄存器个数由参数和本地变量决定。 
 
 
 
insSize 
 
 
 
 
表示该方法的参数个数。 
 
 
 
registerSize 的值是方法运行时需要的寄存器总数，registerSize 总是大于或等于
insSize. 
 
 
bytecodes 
字节码数组，字节码以2 字节为基本单元。当该方法为abstract 方法是，该数组必
须包含0 个元素。 
1) STATICFIELDS 
该部分用来生成保存NEF 文件对应包的所有静态域的镜像,该静态域不包括具有final 属性的简单
类型的静态域，final 简单类型静态域在使用其的指令中直接以常数存在。 
中国银联 
版权所有

---
**[p29]**

Q/CUP 069—2015 
28 
 
静态域的偏移指的是对于静态域镜像的偏移，而不是对NEF 文件STATICFIELD 部分的偏移。 
 
静态域镜像是指依据NEF 文件的STATICFIELDS 产生的，用来表示NEF 文件对应包的静态域运行时
的镜像。静态域在镜像中出现的顺序如下表所示：  
表9 静态域镜像分段表 
类型 
顺序 
内容 
引用类型 
1 
在<clinit>方法中初始化的简单类型数组 
2 
初始化为null 的引用类型，包括数组 
简单类型 
3 
初始化为默认值的简单类型 
4 
初始化为非默认值的简单类型 
  
在静态域镜像中每个静态域的表示大小如下表所示： 
表10 静态域范围表 
类型 
字节数 
Boolean 
1 
Byte 
1 
Short 
2 
Int  
4 
引用类型，包括数组 
2 
STATICFIELD 部分的结构如下： 
Struct STATICFIELD { 
 
U2 imageSize; 
 
U2 referenceCount; 
 
U2 initArrayCount; 
 
InitArrayInfo initArray[initArrayCount]; 
 
U2 defaultValueCount; 
 
U2 notDefaultValueCount; 
 
U1 notDefaultValues[notDefaultValueCount]; 
} 
 
imageSize 
 
 
生成的静态域镜像的大小。 
imageSize = referencecount*2 + defaultValueCount + notDefaultValueCount; 
referenceCount 
 
 
静态域镜像中引用类型的个数。 
 
initArrayCount 
 
 
静态域镜像中在<clinit>方法中被初始化的简单类型数组的个数。 
 
initArray 
 
 
用来初始化简单类型数组的数据信息，其结构struct InitArrayInfo 如下： 
 
 
 
Struct InitArrayInfo{ 
 
 
 
 
U1 type; 
 
 
 
 
U2 count; 
 
 
 
 
U1 vaules[count]; 
中国银联 
版权所有

---
**[p30]**

Q/CUP 069—2015 
29 
 
 
 
} 
 
 
 
type 
数组元素的类型，其值如下表所示： 
表11 简单类型数组元素类型值表 
类型 
值 
Boolean 
2 
Byte 
3 
Short 
4 
Int  
5 
 
 
 
count 
 
 
 
 
数组元素个数。 
 
 
 
values 
 
 
 
 
用来初始化数组的值。 
 
 
defaultValueCount 
 
 
 
使用默认值的简单类型所占的字节数，不同类型所占字节数见静态域范围表。 
 
 
NotDefaultValueCount 
 
 
 
不使用默认值的简单静态类型所占的字节数。 
 
 
notDefaultValues 
用来初始化不使用默认值的简单类型静态域的值。 
2) EXPORT 
 
EXPORT 部分描述了本NEF 文件所向外界暴露的所有静态方法和静态域。结构如下 
 
Struct EXPORT { 
 
 
U1 count; 
 
 
ExpClass expclasses[count]; 
 
} 
 
count 
表示向外界提供的类的个数 
 
expclasses[] 
 
 
所有向外界提供的类的信息列表，具体结构如下： 
 
 
 
Struct ExpClass{ 
 
 
 
 
U2 classesOffset; 
 
 
 
 
U1 staticFieldCount; 
 
 
 
 
U1 staticMethodCount; 
 
 
 
 
U2 staticFieldoffset[staticFieldCount]; 
 
 
 
 
U2 staticMethodOffset[staticMethodCount]; 
 
 
} 
 
 
classesOffset 
 
 
 
该类在CLASSES 部分中的偏移。 
staticFieldCount 
 
 
 
该类提供的静态域的个数 
 
 
staticMethodCount 
中国银联 
版权所有

---
**[p31]**

Q/CUP 069—2015 
30 
 
 
 
该类提供的静态方法的个数 
 
 
staticFieldOffset 
staticFieldOffset 是一个2 字节偏移量的数组，每一个值表示的是该静态域在静态域镜
像中 的偏移量，该数组的下标等于该静态域在NLF 文件定义中的该域的索引值。 
 
 
staticMethodOffset 
staticMethodOffset 是一个2 字节偏移量的数组，每一个值表示在静态方法在METHOD 部
分中的偏移量，该数组的下标等于该静态方法在NLF 文件定义中的该方法的索引值。 
3) LOCATION   
 
LOCATION 部分描述了METHOD 部分中涉及到的类、方法、域的位置信息。该部分为NEF 文件的常量
池结构，这些元素的位置信息有两类： 
——包内元素：位置信息为两个字节的偏移量。不同类型的元素的偏移是相对于文件中的不同部分
来说的。 
 
——包外元素：位置信息为索引信息。 
 
LOCATION 部分的基本就机构如下： 
 
 
Struct LOCATION { 
 
 
 
U2 count; 
 
 
 
LOCATION_INFO lco_infos[count]; 
 
 
} 
 
 
count 
 
 
 
LOCATION 部分中元素的个数。 
 
 
lco_infos 
 
 
 
元素的位置信息列表。LOCATION_INFO 的结构如下： 
 
 
 
 
Struct LOCATION_INFO { 
 
 
 
 
 
U1 type; 
 
 
 
 
 
U1 location[3]; 
 
 
 
 
} 
 
 
 
 
type 
表示该元素的类型。 METHOD 部分中对LOCATION 部分中某个元素的引用必须是
类型匹配的。元素的类型值如下表所示：  
表12 位置信息类型值表 
元素类型 
Type 值 
Location_class 
1 
Location_InstanceField 
2 
Location_VirtualMethod 
3 
Location_superMethod 
4 
Location_StaticField 
5 
Location_StaticMethod 
6 
 
 
 
 
location 
 
 
 
 
 
4 个字节的位置信息描述，根据不同的类型有不同的定义。 
a) Location_Class 
该类型的位置信息表示此为一个类或者接口的位置信息。该类型的LOCATION_INFO 结构如下： 
中国银联 
版权所有

---
**[p32]**

Q/CUP 069—2015 
31 
 
 
Struct Location_class { 
 
 
 
U1:type = 1; 
 
 
 
U2:Union{ 
 
 
 
 
{ 
U2 internaloffset;  
} inner_class 
 
 
 
 
{ 
 
 
 
 
 
U1:importIndex; 
 
 
 
 
 
U1:classIndex; 
 
 
 
 
} external_class 
 
 
 
} Loc_class; 
U1 notused; 
 
 
} 
 
 
4 个字节的LOCATION_INFO 结构分别包括： 
——type。值为1 表示这个一个类或接口。 
——Loc_class 
如果是包内定义的类或接口，位置信息为2 个字节的相对于NEF 文件中CLASS 部分的偏移。 
如果是包外定义的类或接口，位置信息为1 个字节IMPORT 部分内packages 包表的索引和
一个字节的包内类索引 
区别是索引或者是偏移的依据是信息的最高为是否为1。也就是说：inner_class 的
internaloffset 的最高位是0。而external_class 这部分的最高位是1。 
这里出现的index 索引值对应于相应引用包的NLF 文件中对该类或接口定义的索引值。 
——另外有1 个字节未被使用。 
c) Location_InstanceField、Location_VirtualMethod、Location_SuperMethod 
 
这3 个元素是对应实例域、虚方法的位置信息。结构为： 
 
 
Struct Location_***{ 
 
 
 
U1 type; 
 
 
 
Loc_class class; 
 
 
 
U1 index; 
 
 
} 
 
 
type 
 
 
 
type 的值见表12 位置信息类型值表。 
 
 
class 
 
 
 
表示该实例域或虚方法所在类的位置信息，见上节Loc_class。 
 
 
index 
 
 
 
 
该实例域或虚方法的索引值。 
 
 
 
——Location_InstanceField 中的索引值为该实例域在该类对象中的索引值。 
——Location_VirtualMethod 中的索引值为对应方法在类的虚拟方法表中的索引值。如
果该方法是包内可见的，该index 的最高位为1，Loc_class 中定义的类必须是包内
的。如果该方法是包外可见的，该index 的最高位为0。 
——Location_SuperMethod 中的索引值和Location_VirtualMethod 中的索引值区别是
该索引值的index 不在该类的虚方法表取值范围内，而在其父类的虚方法表取值范
围中。 
中国银联 
版权所有

---
**[p33]**

Q/CUP 069—2015 
32 
d) Location_StaiticField、Location_StaticMethod 
 
分别为静态域或静态方法的位置信息。结构如下： 
 
 
Struct Location_***{ 
 
 
 
U1 type; 
 
 
 
Union { 
 
 
 
 
{ 
 
 
 
 
 
U1 notused1; 
 
 
 
 
 
U2 offset; 
 
 
 
 
}internal_loc 
 
 
 
 
{ 
U1:importIndex; 
 
 
 
 
 
U1:classIndex; 
 
 
 
 
 
U1 index; 
 
 
 
 
}external_loc 
 
 
 
} 
} 
  
 
type 
 
 
 
type 的值见表1 位置信息类型值。 
 
 
internal_loc or external_loc 
 
 
 
——如果该位置信息为包内位置（notused1=0）： 
如果是Location_StaticField,则offset 为相对于NEF 文件STATICFIELD 部分的偏
移。 
如果是Location_StaticMethod，则offset 为相对于NEF 文件METHOD 部分的偏移。 
——如果为包外位置信息（moduleindex最高位为1），位置信息为1个字节IMPORT部分内packages
包表的索引和一个字节的包内类索引, 1个字节对应静态方法的索引。 
9) LINKASSIST  
LINKASSIST 部分保存了METHOD 部分中的偏移列表，每一个偏移位置是指令中使用了常量池索引
的位置。该常量池索引将通过链接转换为对实际对象的引用。LINKASSIST 结构如下： 
 
Struct LINKASSIST{ 
 
 
U2 count; 
 
 
U1[] offsets; 
 
} 
 
count  
 
 
偏移数组的个数的个数 
 
offsets 
一个字节的偏移数组，第一个元素的值为第一个出现常量池索引的位置相对于METHOD  
部分的偏移，而接下来的值为下一个出现常量池的位置相对于上一个位置的偏移。如果偏
移超过255，则将值255 填充到数组中，直到偏差小于255。 
例如：数组10,255,255,2，表示第一个偏移为10，第二个偏移为10+255+255+2 = 512。 
METHOD 中每一个出现的常量池索引为2 字节。 
1) DEBUGINFO 
DEBUGINFO 主要用于存储NEF 文件附带的调试信息部分以备调试所需。DEBUGINFO 结构如下： 
Struct DEBUGINFO { 
中国银联 
版权所有

---
**[p34]**

Q/CUP 069—2015 
33 
 
U2 stringCount; 
 
UTF8INFO stringTable[stringCount]; 
 
U2 packageNameIndex; 
 
U2 classCount; 
 
ClassDebugInfo classes[classCount]; 
} 
stringCount 
用于调试的所有字符串的个数。 
stringTable 
用于调试的所有字符串的列表，字符串以UTF8INFO 的结构存在。 
 
Struct UTF8INFO{ 
 
 
U2 length; 
 
 
U1 content[length]; 
 
} 
 
length 
 
UTF8 编码的字符串长度。 
 
content[] 
 
字符串的具体UTF8 编码 
packageNameIndex 
该NEF 文件对应的包的包名在stringTable 中的索引。 
classCount 
该NEF 文件对应的包中类的个数。 
classes 
该NEF 文件对应的包中所有类的调试信息，每个类的调试信息都以ClassDebugInfo 结构
给出。 
b) ClassDebugInfo 
ClassDebugInfo中包含了类中用于调试的必要信息，具体结构如下： 
Struct ClassDebugInfo{ 
 
U2 nameIndex; 
 
U2 accessFlags; 
 
U2 location; 
 
U2 superClassNameIndex; 
 
U2 sourceFileIndex; 
 
U1 interfaceCount; 
 
U2 fieldCount; 
 
U2 methodCount; 
 
U2 interfaceNames[interfaceCount]; 
 
FieldDebugInfo fields[fieldCount]; 
 
MethodDebugInfo methods[methodCount]; 
} 
nameIndex 
该类类名在stringTable 中的索引。 
accessFlags 
中国银联 
版权所有

---
**[p35]**

Q/CUP 069—2015 
34 
类的获取标志位，具体如下表所示：  
表13 类的获取标志位表 
标志 
值 
意义 
ACC_PUBLIC 
0x0001 
该类是公共可见的 
ACC_FINAL 
0x0010 
该类是最终的，无法继承 
ACC-intERFACE 
0x0200 
这是一个接口类 
ACC_ABSTRACT 
0x0400 
这是一个抽象类 
location 
该类值CLASSES 部分中的偏移量。 
superClassNameIndex 
该类父类的类名在stringTable 中的索引。 
interfaceCount 
interfaceNames 数组的个数。 
fieldCount 
fields 列表的个数。 
methodCount 
methods 列表的个数。 
interfaceNames 
如果该类是一个接口，该数组表示该接口的所有父接口类的类名在stringTable 中的索引
列表，如果该类不是一个接口，该数组表示该类实现的所有接口类的类名在stringTable
中的索引列表。 
fields 
该类定义的所有域的调试信息，包括静态域和实例域，不包括继承而来的域。 
methods 
该类定义的所有方法的调试信息，不包括继承而来的方法。 
c) FieldDebugInfo 
FieldDebugInfo 结构描述了类中某个域的信息，该结构具体如下： 
Struct FieldDebugInfo｛ 
 
 
U2 nameIndex; 
 
 
U2 descriptorIndex; 
 
 
U2 accessFlags 
 
 
Union { 
 
 
 
{ 
 
 
 
 
U1 pad1; 
 
 
 
 
U1 pad2; 
U1 pad3; 
U1 token; 
}  InstanceType; 
 
 
 
{ 
 
 
 
  
U2 pad; 
 
 
 
 
U2 location; 
中国银联 
版权所有

---
**[p36]**

Q/CUP 069—2015 
35 
 
 
 
}  locationType; 
 
 
 
 U4 constValue; 
 
 
   }  contents 
 
} 
 
nameIndex 
 
 
该域的域名在stringTable 中的索引。 
 
descriptorIndex 
 
 
该域的描述符在stringTable 中的索引。 
 
accessFlags 
 
 
该域的获取标志位，具体如下表所示： 
表14 域的获取标志位表 
标志 
值 
意义 
ACC_PUBLIC 
0x0001 
这是一个公共可见的域 
ACC_PRIVATE 
0x0002 
这是一个私有的域 
ACC_PROTECTED 
0x0004 
这是一个具有protected 属性的域 
ACC_STATIC 
0x0008 
这是一个静态域 
ACC_FINAL 
0x0010 
这是一个具有final 属性的域 
 
contents 
 
 
该域的具体内容，具体内容根据域的类型有不同的形式。 
 
 
InstanceType 
 
 
   该域是一个实例域，4 个字节的contents 内容为3 个字节的填充加1 个字节域索引。 
 
 
locationVar 
该域是一个非final 属性的静态域或是一个final 属性的、简单类型的静态数组。4 个字
节的contents 内容为2 个字节的填充，和2 个字节的该域在静态镜像中的偏移。 
constValue 
 该域是一个简单类型的，final 属性的静态域，contents 内容为该域的常量值。 
e) MethodDebugInfo 
 
MethodDebugInfo 描述方法的调试信息，具体结构如下： 
 
struct MethodDebugInfo { 
 
 
U2 nameIndex; 
 
 
U2 descriptorIndex; 
U2 accessFlags 
 
 
U2 location; 
 
 
U2 headerSize; 
 
 
U2 bodySize; 
 
 
U2 variablaCount; 
 
 
U2 lineCount; 
 
 
VariableInfo variableTable[variableCount]; 
 
 
LineInfo lineTable[lineCount]; 
 
} 
 
nameIndex 
中国银联 
版权所有

---
**[p37]**

Q/CUP 069—2015 
36 
 
 
方法名字符串在stringTable 中的索引。方法名如：process. 
 
descriptorIndex 
 
 
方法描述符在stringTable 中的索引，描述符如:(S)V. 
 
accessFlags 
 
 
方法的获取标志位。具体值见下表所示： 
表15 方法获取标志位表 
 
 
location 
 
 
该方法在METHODCOMPONENT 中的偏移。abstract 方法的方法的偏移为0。 
 
headerSize 
 
 
该方法的方法头的大小。abstract 方法的方法头大小为0。 
 
bodySize 
 
 
该方法的方法体的大小。abstract 方法的方法体大小为0。 
 
varialbleCount 
 
 
variableTable 中的元素个数。 
 
lineCount 
 
 
lineTable 中的元素个数。 
 
variableTable[] 
 
 
方法中的所有变量的描述，每个变量以VariableInfo 结构给出： 
 
 
struct VariableInfo { 
 
 
 
U1 index; 
U2 nameIndex; 
 
 
 
U2 descriptorIndex; 
 
 
 
U2 startPC; 
 
 
 
U2 length; 
 
 
} 
 
 
index 
 
 
 
该变量在frame 中的寄存器索引。 
 
 
nameIndex 
 
 
 
该变量名在stringTable 中的索引。 
 
 
descriptorIndex 
 
 
 
该变量描述符在stringTable 中的索引。 
标志 
值 
ACC_PUBLIC 
0x0001 
ACC_PRIVATE 
0x0002 
ACC_PROTECTED 
0x0004 
ACC_STATIC 
0x0008 
ACC_FINAL 
0x0010 
ACC_NATIVE 
0x0100 
ACC_ABSTRACT 
0x0400 
中国银联 
版权所有

---
**[p38]**

Q/CUP 069—2015 
37 
 
 
startPC 
 
 
 
该变量可见的起始指令位置。该值为在METHODCOMPONENT 中的偏移。 
 
 
length 
 
 
 
该变量可见的指令范围的长度。 
 
lineTable 
 
 
该方法对应的行信息列表，每个元素LineInfo 结构给出： 
 
 
struct LineInfo { 
 
 
 
U2 startPC; 
 
 
 
U2 endPC; 
 
 
 
U2 sourceLine; 
 
 
} 
 
 
startPC 
 
 
 
某一个源码第一条指令的位置。该值为METHODCOMPONENT 中的偏移。 
 
 
endPC 
 
 
 
该行源码指令结束的位置，该值为METHODCOMPONENT 中的偏移。 
 
 
sourceLine 
 
 
    该行在源码文件中的行数。 
4.5 加载、链接与初始化 
4.5.1 NLF 索引链接的简易原理图 
NLF 索引链接的过程主要涉及到三个部分，即应用NEF 文件、引用NLF 文件以及内存区。首先，在
源码编译文件使用N3 TEE 应用虚拟机转换器转换成NEF 文件的过程中，会对源码文件中引用其他包信
息对象的符号信息，在引用NLF 文件中进行查找并将其替代为对应索引值返回存储到应用NEF 文件内。
故而，当应用NEF 文件下载到卡时，该索引将能够正确链接到其在内存中的真实存储位置。 
NLF索引链接的简易原理图如下图所示： 
中国银联 
版权所有

---
**[p39]**

Q/CUP 069—2015 
38 
一个对象的引用
（索引）
应用TEF文件
该对象在内存中
的存储位置
内存区
引用TEF文件
符号
索引+符号
(a)对象
符号信
息查找
(c)索引
值取
代符号
2.通过索
引值查
找链接
(b)通过符
号查找对
应索引值
一个对象的引用
（符号）
源码编译文件
1.转换
 
图3 NLF 索引链接的简易原理图 
4.5.2 虚拟机的启动 
N3 TEE 虚拟机的运行是以本地任务的形式存在的。 
 虚拟机的启动是为了完成运行环境的初始化。如：必要的类对象的创建，一些全局变量必要的初
始化等。 
4.5.3 虚拟机目标文件的下载和安装 
1) 下载 
虚拟机的目标文件是以NEF 文件形式存在的，N3 TEE 应用虚拟机将NEF 文件和其它文件下载到设
备端。 
 
2) 安装 
NEF 文件的安装工作有以下2 个过程： 
——NEF 文件的部署； 
——NEF 文件的链接。对NEF 文件执行验证，准备，以及解析；     
验证：确保被导入类型的准确性。主要是用于检验文件的二进制兼容性，并对NEF 文件的结
构、有效的字节码子集和程序包内依赖性等进行确认。 
准备：为类变量分配内存，并初始化为默认值。 
解析：把类型中的索引值（NLF 文件索引链接后将符号引用替换成了索引值）转换为直接引用。
如将类、方法、域中的索引值都链接到堆中的相关存储地址。 
 
 虚拟机目标文件链接初始化过程如下图所示： 
中国银联 
版权所有

---
**[p40]**

Q/CUP 069—2015 
39 
下载
应用NEF文件
远程下载工具
Download
Class Component
Method Component
Static Field 
Component
Export Component
文件系统
生成特定目录结构
验证
准备
解析
安装
内存区
链接时存储地址
替换相关索引值
 
图4 虚拟机目标文件链接初始化示意图 
 
4.5.4 虚拟机目标文件的执行 
在目标文件成功下载安装到虚拟机后，虚拟机就会创建一个文件结构来存储该文件的各个组件信息
（如类、方法、域等）。一旦目标文件对应的应用被选择，虚拟机就会开始激活该目标文件所生成的指
定文件结构。 
执行步骤： 
——CA 和指定的应用建立会话 
 
实例化应用，即在堆中创建该应用的实例，执行应用的openSession 入口点方法。 
——执行CA 命令 
即执行应用的入口点方法invokeCommand，并根据应用的文件结构，在堆中开辟足够的空间存
储运行时数据。同时将执行过程中所产生的临时数据存储于栈内，并将所需要执行的指令用
PC 寄存器来进行标识。 
——CA 关闭已建立的会话 
 
即执行应用的入口点方法closeSession，删除应用实例。 
虚拟机文件执行示意图如下图所示： 
中国银联 
版权所有

---
**[p41]**

Q/CUP 069—2015 
40 
可信应用
创建应用实例，应用
处于可运行状态
虚拟机的PC寄存器
Java对象
栈帧
N3 TEE堆
N3 TEE栈
和指定应用建立会话
执行入口点方法
取指令
数据
执行指令
可信应用的
对象和密钥
可信存储区
API
 
图5 虚拟机文件执行示意图 
注1：若一个应用中存在多个NEF文件，则当虚拟机安装这些文件的时候，按照先被应用包NEF，后引用者NEF的顺序
来进行处理。 
4.6 NEF 虚拟机指令集 
4.6.1 指令描述的格式 
指令描述的格式是通过助记符来进行标识的。而助记符则是一些用于帮助记忆指令的符号，每一个
助记符都表示了特定指令的功能。 
——助记符 
指令： 
 该指令的简单描述。 
格式： 
 该指令的格式。 
值： 
 助记符 = opcode 或 opcode:助记符。 
助记符/语法： 
 该指令的语法。 
参数： 
 该指令的参数。 
说明： 
中国银联 
版权所有

---
**[p42]**

Q/CUP 069—2015 
41 
该指令的说明。 
指令格式中说明： 
（1）指令以16 位为代码单元，按小端排列。 
（2）指令基本单元之间以空格分隔，基本单元内以“|”分隔。 
（3）“φ”：用于指出在指定位置上的所有位都为0。 
（4）“op”：用于指出格式中的8 位操作码的位置。 
（5）“A-Z”：指令中的不同类型值。 
（6）“vA”：表示寄存器索引类型 
（7）“#+X”：表示字面常数 
（8）“+X”：用于表示相对指令地址偏移。 
4.6.2 指令集 
1） nop 
指令： 
空操作。 
格式： 
ØØ|op 
值： 
nop = 0x00 
助记符/语法： 
nop 
说明： 
空闲一个指令周期。 
2） move 
指令： 
 寄存器间数据的转移。 
格式： 
 B|A|op 
值： 
 move = 0x01 
助记符/语法： 
 move vA,vB 
参数： 
 A：目的寄存器（4 位）; 
B：源寄存器（4 位）。 
说明： 
将B寄存器中的内容移动到A寄存器。 
3） move/from16 
指令： 
寄存器间数据的转移。 
中国银联 
版权所有

---
**[p43]**

Q/CUP 069—2015 
42 
格式： 
 AA|op BBBB 
值： 
 move/from16 = 0x02 
助记符/语法： 
 move/from16 VAA,VBBBB  
参数： 
 A：目的寄存器（8 位）； 
B：源寄存器（16 位）。 
说明： 
 将B 寄存器中的内容移动到A 寄存器中。 
4） move/16 
指令: 
寄存器间数据的转移。 
格式: 
ØØ|op AAAA BBBB 
值: 
 move/16 = 0x03 
助记符/语法: 
move/16 VAAAA,VBBBB 
参数: 
 A:目的寄存器（16 位）；B：源寄存器（16 位）。 
说明: 
将B 寄存器中的内容移动到A 寄存器。 
5） move-object 
指令: 
 和对象相关的寄存器之间数据的移动。 
格式: 
 B|A|op 
值: 
 move_instance = 0x07 
助记符/语法: 
 move_instance vA,vB。 
参数: 
 A：目的寄存器（4 位）； 
B：源寄存器（4 位）。 
说明: 
 将vB 中的对象引用拷贝到vA 中。 
6） move-object/from16 
指令: 
中国银联 
版权所有

---
**[p44]**

Q/CUP 069—2015 
43 
 和对象相关的寄存器之间数据的移动。 
格式: 
 AA|op BBBB 
值: 
 move-object/from16 = 0x08 
助记符/语法: 
 move-object/from16 VAA,VBBBB 
参数: 
 A:目的寄存器（8 位）；B：源寄存器（16 位）。 
说明: 
 将vB 中的对象引用拷贝到vA 中。 
7） move-object/16 
指令: 
 和对象相关的寄存器之间数据的移动。 
格式: 
 ØØ|op AAAA BBBB 
值: 
 move-object/16 = 0x09 
助记符/语法: 
 move-object/16 VAAAA,VBBBB 
参数: 
 A：目的寄存器（16 位）； 
B：源寄存器（16 位）。 
说明: 
寄存器A 中保存有一个对象的引用，B 中保存有一个对象的引用，该操作是A 中的引用也指向
B 中引用所指的对象。 
8） move-result 
指令: 
 将最近调用invoke-kind 指令的返回结果移动到指定寄存器。 
格式: 
 AA|op 
值: 
 move-result = 0x0a 
助记符/语法: 
 move-result vAA 
参数: 
 A：目的寄存器（8 位）。 
说明: 
 将最近调用返回的非对象，单字长的结果移动到指定的A 寄存器。 
9） move-result-object 
中国银联 
版权所有

---
**[p45]**

Q/CUP 069—2015 
44 
指令: 
 将最近调用函数调用指令的返回结果移动到指定寄存器。 
格式: 
 AA|op 
值: 
 move-result-object = 0x0c 
助记符/语法: 
 move-result-object vAA。 
参数: 
 A：目的寄存器（8 位）。 
说明: 
 将最近调用返回的对象的引用储存到寄存器A 中。 
10） 
move-exception 
指令: 
 将exception 储存到寄存器中。 
格式: 
 AA|op 
值: 
 move-exception = 0x0d 
助记符/语法: 
 move-exception vAA 
参数: 
 A：目的寄存器。 
说明: 
将刚刚捕获到的异常放到A 寄存器中，该指令做为对某特定异常有一定处理的exception 
handler 的第一条指令，并且只能作为exception handler 的第一条指令出现。 
11） 
return-void 
指令: 
 空返回 
格式: 
 ØØ|op 
值: 
 return-void = 0x0e 
助记符/语法: 
 return-void 
说明: 
 返回为空的函数返回指令。 
12） 
return 
指令: 
 函数返回。 
中国银联 
版权所有

---
**[p46]**

Q/CUP 069—2015 
45 
格式: 
 AA|op 
值: 
 return = 0x0f 
助记符/语法: 
 return vAA 
参数: 
 A：源寄存器。 
说明: 
将寄存器中A的值作为函数返回。 
13） 
return-object 
指令: 
 函数返回。 
格式: 
 AA|op 
值: 
 return-object = 0x11 
助记符/语法: 
 return-object vAA 
参数: 
 A：源寄存器。 
说明: 
 将寄存器中A 的值作为函数返回。 
14） 
const/4 
指令: 
 给指定寄存器赋值。 
格式: 
 B|A|op 
值: 
 const/4 = 0x12 
助记符/语法: 
 const/4 vA,#+B 
参数: 
 A：目的寄存器； 
B：有符号整数（4 位，最高位为符号位）。 
说明: 
 将整数B 的值赋给寄存器A 中，B 自动由4 位按有符号数扩展方式扩展到32 为。 
 vA =(int) (vB << 28)>>28; 
15） 
const/16 
指令: 
中国银联 
版权所有

---
**[p47]**

Q/CUP 069—2015 
46 
 给指定寄存器赋值。 
格式: 
 AA|op BBBB 
值: 
 const/16= 0x13 
助记符/语法: 
 const/16 vAA,#+BBBB 
参数: 
 A：目的寄存器 （8 位）； 
B：有符号整数值（16 位）。 
说明: 
 将整数值B 赋给寄存器A，B 在指令中以16 位长度给出，按有符号数扩展方式扩展到32 位。 
16） 
const 
指令: 
 给指定寄存器赋值。 
格式: 
 AA|op BBBBlo BBBBhi 
值: 
 const = 0x14 
助记符/语法: 
 const VAA,#+BBBBBBBB 
参数: 
 A：目的寄存器(8 位)； 
B：有符号整数值。 
说明: 
 将整数值B 赋给寄存器A；B 在指令中以32 字节长度出现,第一字节位底16 位。 
17） 
const/high16 
指令: 
 给指定寄存器赋值。 
格式: 
 AA|op BBBB 
值: 
 const/high16 = 0x15 
助记符/语法: 
 const/high16 vAA,#+BBBB0000 
参数: 
 A：目的寄存器（8 位）， 
B：有符号整数值。 
说明: 
 将给定的有符号的整数值B（16 位）做为整数的高位储存到寄存器A 中，低位填充0。 
中国银联 
版权所有

---
**[p48]**

Q/CUP 069—2015 
47 
18） 
check-cast 
指令: 
 类型转换指令。 
格式: 
 AA|op BBBB atype 
值: 
 check-cast = 0x1f 
助记符/语法: 
 check-cast vAA, BBBB,atype 
参数: 
 A：含有指定对象引用的寄存器;. 
B：16 位常量池索引。 
atype：指定是否是简单类型的数组，引用数组，或对象。其值如下表所示： 
表16 check-cast 类型值对应表 
类型 
值 
T_BOOLEAN 
10 
T_BYTE 
11 
T_SHORT 
12 
T-int 
13 
T_REFERENCE 
14 
T_NOT 
00 
分别表示boolean,byte,short,int,reference 类型的数组或非数组。 
说明:  
将A 中所指向对象转换为索引B 出的类型。如果A 中所指向的对象不能转换为索引B 所指定的
类型则抛出异常。索引B 处所指定的类型必须是引用类型。 
19） 
instance-of 
指令: 
 instanceof 指令。 
格式: 
 B|A|op CCCC atype 
值: 
 instance-of = 0x20 
助记符/语法: 
 instance-of VA，VB， CCCC , atype 
参数: 
 A：目的寄存器(4 位)； 
B：含有指定对象引用的寄存器； 
C：16 位的常量池索引。 
atype：指定是否是简单类型的数组，引用数组，或对象。其值如下所示： 
中国银联 
版权所有

---
**[p49]**

Q/CUP 069—2015 
48 
表17 instance-of 类型值对应表 
T_BOOLEAN 
10 
T_BYTE 
11 
T_SHORT 
12 
T-int 
13 
T_REFERENCE 
14 
T_NOT 
00 
分别表示boolean,byte,short,int,reference 类型的数组或非数组。 
说明: 
 判断B 指向的对象是否是索引C 指定类型的对象。将结果储存到寄存器A 中。C 所指定类型必
须是索引类型。 
20） 
array-length 
指令: 
 求数组长度。 
格式: 
 B|A|op 
值: 
 array-length = 0x21 
助记符/语法:  
 array-length VA,VB 
参数: 
 A：目的寄存器（4 位）； 
B：源寄存器（4 位）。 
说明: 
将寄存器B中所指向的数组的长度赋给寄存器A。 
21） 
new-instance 
指令: 
 创建实例。 
格式: 
 AA|op BBBB 
值: 
 new-instance = 0x22 
助记符/语法: 
 new-instance VAA, BBBB 
参数: 
 A：目的寄存器（8 位）； 
B：16 位的常量池索引。 
说明: 
 创建B 指定类型的对象，把该对象的引用储存到寄存器A 中，B 所指类型必须是引用类型。 
中国银联 
版权所有

---
**[p50]**

Q/CUP 069—2015 
49 
22） 
new-array 
指令: 
 创建数组。 
格式: 
 B|A|op CCCC atype 
值: 
 new-array = 0x23 
助记符/语法: 
 new-array VA,VB, CCCC,atype 
参数: 
A: 目的寄存器（4 位）； 
B：指定长度的寄存器； 
C：16 位的常量池索引。 
atype:指定是否是简单类型的数组，引用数组，或对象。其值如下表所示： 
表18 类型值对应表 
类型 
值 
T_BOOLEAN 
10 
T_BYTE 
11 
T_SHORT 
12 
T-int 
13 
T_REFERENCE 
14 
分别表示boolean,byte,short,int,reference 类型的数组或非数组。 
说明: 
 创建C 指定的类型，长度由B 指定的数组，将引用储存到A 处。 
23） 
fill-array-data 
指令: 
 给指定数组赋值。 
格式: 
 AA|op BBBBlo BBBBhi 
值: 
 fill-array-data = 0x26 
助记符/语法: 
 fill-array-data vAA,+BBBBBBBB 
参数: 
 A：带有指定数组引用的寄存器； 
B：32 位的相对于本指令偏移量,低16 字节在前。 
说明: 
 使用本指令下偏移B 处的数据来填充A 所指定的数组。 
24） 
throw 
中国银联 
版权所有

---
**[p51]**

Q/CUP 069—2015 
50 
指令: 
 抛出异常。 
格式: 
 AA|op 
值: 
 Throw = 0x27 
助记符/语法: 
 Throw vAA 
参数: 
 A:储存指定异常引用的寄存器。 
说明: 
 抛出寄存器A 所指定的异常。 
25） 
goto 
指令: 
 跳转指令。 
格式: 
 AA|op 
值: 
goto = 0x28 
助记符/语法 
 goto #+AA。 
参数 
 A: 8 位的指令偏移量,不能为零。 
说明 
 跳转到距离该指令A 距离的指令位置。 
26） 
goto/16 
指令: 
 跳转指令。 
格式: 
 ØØ|op AAAA 
值: 
 goto/16 = 0x29 
助记符/语法: 
 goto/16 +AAAA 
参数: 
 A:16 位的指令偏移量,不能为零。 
说明: 
 跳转到距离该指令A 距离的指令位置。 
27） 
goto/32 
指令: 
中国银联 
版权所有

---
**[p52]**

Q/CUP 069—2015 
51 
 跳转指令。 
 
格式: 
 ØØ|op AAAAlo AAAAhi 
值: 
 goto/32 = 0x2a 
助记符/语法: 
 goto/32 +AAAAAAAA 
参数: 
 A:32 位的指令偏移量,不能为零,低16 位字节在前。 
说明: 
 跳转到距离该指令A 距离的指令位置。 
28） 
switch 
指令: 
 switch 跳转。 
格式: 
 AA|op BBBBlo BBBBhi 
值: 
 packed-switch = 0x2b 
 sparse_switch = 0x2c 
助记符/语法: 
 packed-switch (sparse_switch) VAA,+BBBBBBBB 
参数: 
 A：存放选择跳转偏移的依据值，就是switch（**）的结果； 
B：switch 跳转偏移表的偏移位置。 
说明: 
 
偏转表具体结构： 
表19 偏转表 
packed-switch: 
名字 
格式 
描述 
ident 
ushort = 0x0100 
packed-switch 跳转表的标识。 
size 
ushort 
跳转表入口的个数 
first_key int 
最小的switch case 值 
targets 
int[] 
所有switch case 的跳转目标，值为相对当前PC 的偏移值 
 
sparse-switch: 
名字 
格式 
描述 
ident 
ushort=0x0300 
sparse-switch 跳转表的标识。 
size 
ushort 
跳转表入口的个数 
keys 
int[] 
所有switch case key 值数组 
中国银联 
版权所有

---
**[p53]**

Q/CUP 069—2015 
52 
targets 
int[] 
所有跳转目标，值为相对当前PC 的偏移值 
 
29） 
If 指令 
If指令共分为if-eq、if-ne、if-it、if-ge、if-gt、if-le六种： 
a) if-eq 
指令： 
 比较两个寄存器的值是否相等。 
格式： 
 B|A|op +CCCC 
值： 
32： if-eq 
助记符/语法： 
 if-eq vA，vB，+CCCC 
参数： 
 A：用来比较的第一个寄存器； 
B：用来比较的第二个寄存器； 
C：跳转的偏移值。 
说明： 
 如果vA 值等于vB 值，则跳转到当前PC 的C 偏移处。 
 
b) if-ne 
指令： 
 比较两个寄存器的值是否不相等。 
格式： 
 B|A|op +CCCC 
值： 
33： if-ne 
助记符/语法： 
 if-ne vA，vB，+CCCC 
参数： 
 A：用来比较的第一个寄存器； 
B：用来比较的第二个寄存器； 
C：跳转的偏移。 
说明： 
 如果vA 值不等于vB 值，则跳转到当前PC 的C 偏移处。 
c) if-it 
指令： 
 比较寄存器vA 是否小于vB。 
格式： 
 B|A|op +CCCC 
值： 
34： if-it 
中国银联 
版权所有

---
**[p54]**

Q/CUP 069—2015 
53 
助记符/语法： 
 if-it vA，vB，+CCCC 
参数： 
 A：用来比较的第一个寄存器； 
B：用来比较的第二个寄存器； 
C：跳转的偏移。 
说明： 
 如果vA 值小于vB 值，则跳转到当前PC 的C 偏移处。 
d) if-ge 
指令： 
比较寄存器vA 是否大于等于vB。 
格式： 
B|A|op +CCCC 
值： 
if-ge = 0x35 
助记符/语法： 
if-ge vA，vB，+CCCC 
参数： 
 
 A：用来比较的第一个寄存器； 
B：用来比较的第二个寄存器； 
C：跳转的偏移。 
说明： 
 
 如果vA 值大于等于vB 值，则跳转到当前PC 的C 偏移处。 
e) if-gt 
指令： 
 
  比较寄存器vA 是否大于vB。 
格式： 
 
  B|A|op CCCC 
值： 
if-gt = 0x36 
助记符/语法： 
 
 if-gt vA，vB，+CCCC 
参数： 
 
 A：用来比较的第一个寄存器； 
B：用来比较的第二个寄存器； 
C：跳转的偏移。 
说明： 
 
如果vA 值大于vB 值，则跳转到当前PC 的C 偏移处。 
f) if-le 
指令： 
 比较寄存器vA 是否小于等于vB。 
格式： 
 B|A|op +CCCC 
中国银联 
版权所有

---
**[p55]**

Q/CUP 069—2015 
54 
值： 
if-le = 0x37 
助记符/语法： 
 if-le vA，vB，+CCCC 
参数： 
 A：用来比较的第一个寄存器； 
B：用来比较的第二个寄存器； 
C：跳转表的偏移。 
说明： 
如果vA值小于等于vB值，则跳转到当前PC的C偏移处 
30） 
If-zero 指令 
if-zero 命令主要有if-eqz、if-nez、if-ltz、if-gez、if-gtz、if-lez 六种： 
a) if-eqz 
指令： 
  
判断比较值是否等于0。 
格式： 
  
AA|op BBBB 
值： 
if-eqz = 0x38 
助记符/语法： 
 If-testz VAA，+BBBB 
参数： 
 A：用来比较的寄存器； 
B：偏移的位置。 
说明： 
 如果vA 的值等于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
b) if-nez 
指令： 
  
判断比较值是否不等于0。 
格式： 
  
AA|op BBBB 
值： 
if-nez = 0x39 
助记符/语法： 
 If-testz VAA，+BBBB 
参数： 
 A：用来比较的寄存器； 
B：偏移的位置。 
说明： 
如果vA 的值不等于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
c) if- ltz 
指令： 
中国银联 
版权所有

---
**[p56]**

Q/CUP 069—2015 
55 
  
判断比较值是否小于0。 
格式： 
  
AA|op BBBB 
值： 
if-ltz = 0x3a 
助记符/语法： 
 If-testz VAA，+BBBB 
参数： 
 A：用来比较的寄存器；B：偏移的位置。 
说明： 
 如果vA 的值小于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
d) if-gez 
指令： 
  
判断比较值是否大于或等于0。 
格式： 
  
AA|op BBBB 
值： 
if-gez = 0x3b 
助记符/语法： 
 If-testz VAA，+BBBB 
参数： 
 A：用来比较的寄存器； 
B：偏移的位置。 
说明： 
 如果vA 的值大于等于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
e) if-gtz 
指令： 
  
判断比较值是否大于0。 
格式： 
  
AA|op BBBB 
值： 
if-gtz = 0x3c 
助记符/语法： 
 If-testz VAA，+BBBB 
参数： 
 A：用来比较的寄存器； 
B：偏移的位置。 
说明： 
 如果vA 的值大于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
f) if-lez 
指令： 
  
判断比较值是否小于或等于0。 
格式： 
中国银联 
版权所有

---
**[p57]**

Q/CUP 069—2015 
56 
  
AA|op BBBB 
值： 
if-lez = 0x3d 
 
助记符/语法： 
 If-testz VAA，+BBBB 
参数： 
 A：用来比较的寄存器； 
B：偏移的位置。 
说明： 
 如果vA的值小于0跳转到当前PC的BBBB偏移处，否则继续执行。 
31） 
数组操作指令 
数组操作指令主要有array-get、array-get_instance、array-get_boolean、array-get_byte、
array-get_short、array-put、array-put_instance、array-put_boolean、array-put_byte、
array-put_short 共10 种： 
a) array-get 
指令： 
 取整数类型数组数组元素值。 
格式： 
 AA|op CC|BB 
值： 
array-get = 0x44 
助记符/语法： 
 arrayop VAA，VBB，VCC 
参数： 
 A：目的寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 取vB 所指定的整数类型数组的第vC 个元素存放在vA 中。 
b) array-get_instance 
指令： 
 取对象类型数组数组元素值。 
格式： 
 AA|op CC|BB 
值： 
array-get_instance = 0x46 
助记符/语法： 
 arrayop VAA，VBB，VCC 
参数： 
A：目的寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
中国银联 
版权所有

---
**[p58]**

Q/CUP 069—2015 
57 
说明： 
 取vB 所指定的对象类型数组的第vC 个元素存放在vA 中。 
c) array-get_boolean 
指令： 
 取布尔类型数组数组元素值。 
格式： 
 AA|op CC|BB 
值： 
array-get_boolean = 0x47 
助记符/语法： 
 arrayop VAA，VBB，VCC 
参数： 
 A：目的寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 取vB 所指定的布尔类型数组的第vC 个元素存放在vA 中。 
d) array-get_byte 
指令： 
 取字节类型数组数组元素值。 
格式： 
 AA|op CC|BB 
值： 
array-get_byte = 0x48 
助记符/语法： 
arrayop VAA，VBB，VCC 
参数： 
 A：目的寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 取vB 所指定的字节类型数组的第vC 个元素存放在vA 中。 
e) array-get_short  
指令： 
 取short 类型数组数组元素值。 
格式： 
 AA|op CC|BB 
值： 
array-get_short = 0x4a 
助记符/语法： 
arrayop VAA，VBB，VCC 
参数： 
 A：目的寄存器。 
中国银联 
版权所有

---
**[p59]**

Q/CUP 069—2015 
58 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 取vB 所指定的short 类型数组的第vC 个元素存放在vA 中。 
f) array-put  
指令： 
 设置整数类型数组数组元素的值。 
格式： 
 AA|op CC|BB 
值： 
array-put = 0x4b 
助记符/语法： 
arrayop VAA，VBB，VCC 
参数： 
 A：值寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 将vA 的值赋给vB 所指向的整数类型数组的vC 位置。 
g) array-put_instance  
指令： 
 设置对象类型数组数组元素的值。 
格式： 
 AA|op CC|BB 
值： 
array-put_instance = 0x4d 
助记符/语法： 
 arrayop VAA，VBB，VCC 
参数： 
 A：值寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 将vA 的值赋给vB 所指向的对象类型数组的vC 位置。 
h) array-put_boolean  
指令： 
 设置布尔类型数组数组元素的值。 
格式： 
 AA|op CC|BB 
值： 
array-put_boolean = 0x4e 
助记符/语法： 
 arrayop VAA，VBB，VCC 
中国银联 
版权所有

---
**[p60]**

Q/CUP 069—2015 
59 
参数： 
 A：值寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 将vA 的值赋给vB 所指向的布尔类型数组的vC 位置。 
i) array-put_byte  
指令： 
 设置字节类型数组数组元素的值。 
格式： 
 AA|op CC|BB 
值： 
array-put_byte = 0x4f 
助记符/语法： 
 arrayop VAA，VBB，VCC 
参数： 
 A：值寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 将vA 的值赋给vB 所指向的字节类型数组的vC 位置。 
j) array-put_short  
指令： 
 设置short 类型数组数组元素的值。 
格式： 
 AA|op CC|BB 
值： 
array-put_short = 0x51 
助记符/语法： 
 arrayop VAA，VBB，VCC 
参数： 
 A：值寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
将vA的值赋给vB所指向的short类型数组的vC位置。 
32） 
实例操作指令 
对象操作指令主要分为instance-get 、instance-get_instance 、instance-get_boolean 、
instance-get_byte 、instance-get_short 、instance-put 、instance-put_instance 、
instance-put_boolean、instance-put_byte、instance-put_short 共10 种： 
a) instance-get 
指令： 
中国银联 
版权所有

---
**[p61]**

Q/CUP 069—2015 
60 
 取整数型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-get = 0x52 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 将vB 对象的vC 所指向的整数型实例域的值存储在vA 中。 
b) instance-get_instance  
指令： 
 取对象类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-get_instance = 0x54 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 将vB 对象的vC 所指向的对象类型实例域的值存储在vA 中。 
c) instance-get_boolean  
指令： 
 取布尔类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-get_boolean = 0x55 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 将vB 对象的vC 所指向的布尔类型实例域的值存储在vA 中。 
中国银联 
版权所有

---
**[p62]**

Q/CUP 069—2015 
61 
d) instance-get_byte  
指令： 
 取字节类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-get_byte = 0x56 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 将vB 对象的vC 所指向的字节类型实例域的值存储在vA 中。 
e) instance-get_short  
指令： 
 取short 类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-get_short = 0x58 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 将vB 对象的vC 所指向的short 类型实例域的值存储在vA 中。 
f) instance-put  
指令： 
 设置整数类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-put = 0x59 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：值寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
中国银联 
版权所有

---
**[p63]**

Q/CUP 069—2015 
62 
说明： 
 将vA 的值设置到vB 所指对象的vC 整数型实例域。 
g) instance-put_instance  
指令： 
 设置对象类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-put_instance = 0x5b 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：值寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 将vA 的值设置到vB 所指对象的vC 对象类型实例域。 
h) instance-put_boolean  
指令： 
 设置布尔类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-put_boolean = 0x5c 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：值寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 将vA 的值设置到vB 所指对象的vC 布尔类型实例域。 
i) instance-put_byte  
指令： 
 设置字节类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-put_byte = 0x5d 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：值寄存器。 
中国银联 
版权所有

---
**[p64]**

Q/CUP 069—2015 
63 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 将vA 的值设置到vB 所指对象的vC 字节类型实例域。 
j) instance-put_short  
指令： 
 设置short 类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance-put_short = 0x5f 
助记符/语法： 
 op VA，VB， CCCC 
参数： 
 A：值寄存器。 
B：对象寄存器； 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
将vA的值设置到vB所指对象的vCshort类型实例域。 
33） 
静态域操作指令 
静态域操作指令主要分为static-get 、static-get_instatce 、static-get_boolean 、
static-get_byte、static-get_short、static-put、static-put_instance、static-put_boolean、
static-put_byte、static-put_short 共10 个： 
a) static-get 
指令： 
 取整数型的静态域的值。  
格式： 
 
 
AA|op BBBB 
值： 
static-get = 0x60 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：目的寄存器。  
B：静态域的16 位常量池索引。 
说明： 
 将BBBB 所指的整形静态域的值存储在vA 中。 
b) static-get_instance 
指令： 
 取对象类型的静态域的值。  
格式： 
 
 
AA|op BBBB 
中国银联 
版权所有

---
**[p65]**

Q/CUP 069—2015 
64 
值： 
static-get_instance = 0x62 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：目的寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 将BBBB 所指的对象类型静态域的值存储在vA 中。 
c) static-get_boolean 
指令： 
 取布尔类型的静态域的值。  
格式： 
 
 
AA|op BBBB 
值： 
static-get_boolean = 0x63 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：目的寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 将BBBB 所指的布尔类型静态域的值存储在vA 中。 
d) static-get_byte 
指令： 
 取字节类型的静态域的值。  
格式： 
 
 
AA|op BBBB 
值： 
static-get_byte = 0x64 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：目的寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 将BBBB 所指的字节类型静态域的值存储在vA 中。 
e) static-get_short 
指令： 
 取short 类型的静态域的值。  
格式： 
 
 
AA|op BBBB 
值： 
中国银联 
版权所有

---
**[p66]**

Q/CUP 069—2015 
65 
static-get_short = 0x66 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：目的寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 将BBBB 所指的short 类型静态域的值存储在vA 中。 
f) static-put 
指令： 
 设置整形类型静态域的值。  
格式： 
 
 
AA|op BBBB 
值： 
static-put = 0x67 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：值寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 将vA 的值存放在BBBB 指定的整型静态域。 
g) static-put_instance 
指令： 
 设置对象类型静态域的值。  
格式： 
 
 
AA|op BBBB 
值： 
static-put_instance = 0x69 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：值寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 将vA 的值存放在BBBB 指定的对象类型静态域。 
h) static-put_boolean 
指令： 
 设置布尔类型静态域的值。  
格式： 
 
 
AA|op BBBB 
值： 
static-put_boolean = 0x6a 
中国银联 
版权所有

---
**[p67]**

Q/CUP 069—2015 
66 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：值寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 将vA 的值存放在BBBB 指定的布尔类型静态域。 
i) static-put_byte 
指令： 
 设置字节类型静态域的值。  
格式： 
 
 
AA|op BBBB 
值： 
static-put_byte = 0x6b 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：值寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 将vA 的值存放在BBBB 指定的字节类型静态域。 
j) static-put_short 
指令： 
 设置short 类型静态域的值。。  
格式： 
 
 
AA|op BBBB 
值： 
static-put_short = 0x6d 
助记符/语法： 
 op VAA， BBBB 
参数： 
 A：值寄存器。 
B：静态域的16 位常量池索引。 
说明： 
将vA的值存放在BBBB指定的short类型静态域。 
34） 
方法调用指令 
a) invoke-kind 
指令: 
 通过指定具体寄存器传递参数的函数调用指令。 
格式: 
 
 
B|A|op CCCC G|F|E|D 
值: 
中国银联 
版权所有

---
**[p68]**

Q/CUP 069—2015 
67 
6e: invokevirtual 
6f: invokesuper 
70: invokedirect 
71: invokestatic 
   助记符/语法:  
Invokevirtual {VD,VE,VF,VG,VA} CCCC 
Invokesuper {VD,VE,VF,VG,VA} CCCC 
 Invokedirect {VD,VE,VF,VG,VA} CCCC 
 Invokestatic {VD,VE,VF,VG,VA} CCCC 
   参数: 
 B：参数的个数； 
 D，E，F，G，A：参数寄存器，分别对应于第一个参数，第二个参数，第三个参数，
第四个参数，第五个参数。其意义由B 决定。 
 CCCC：相关方法的常量池索引。 
注：在函数调用产生的新的调用帧中，寄存器的编号规则为： 
1. 寄存器从0 开始编号。 
2. 函数调用中参数传递到新寄存器编号的最后。即：第一个参数传递到最后一个编
号的寄存器，第二个参数传递到倒数第二个编号的寄存器，以其类推。 
说明: 
 invoke-virtual：调用通用的virtual 方法（非static 方法,非final 方法和非构造函
数）。 
 invoke-super：调用父类的virtual 方法。 
 invoke-direct：调用private 实例方法或构造函数。 
 invoke-static：:调用static 方法。 
b) invoke-interface 
指令: 
 通过指定具体寄存器传递参数的接口函数调用指令。 
格式: 
 
 
B|A|op CCCC G|F|E|D methodIndex 
值: 
 invokeinterface = 0x72 
助记符/语法: 
 invokeinterface {VD,VE,VF,VG,VA} , CCCC ，methodIndex 
参数: 
 
B：参数的个数； 
 
D，E，F，G，A：参数寄存器，分别对应于第一个参数，第二个参数，第三个参数，
第四个参数，第五个参数。其意义由B 决定，B 指定参数个数。 
 
CCCC：在invokeinterface 中为所调用接口的接口类的常量池索引 
 
methodIndex：:该值为接口方法在接口类的方法表中的索引位置，该索引值由具体实
现决定。 
注：在函数调用产生的新的调用帧中，寄存器的编号规则为： 
1. 
寄存器从0 开始编号。 
2. 
函数调用中参数传递到新寄存器编号的最后。即：第一个参数传递到最后一个编号
中国银联 
版权所有

---
**[p69]**

Q/CUP 069—2015 
68 
的寄存器，第二个参数传递到倒数第二个编号的寄存器，以其类推。 
说明: 
 invoke-interface:调用接口方法。 
c) invoke-kind/rang 
指令: 
 通过指定寄存器范围传递参数的函数调用指令。 
格式: 
 
 
AA|op BBBB CCCC 
值: 
74: invokevirtual/range 
75: invokesuper/range 
76: invokedirect/range 
77: invokestatic/range 
 
助记符/语法: 
invokevirtual/range  {vCCCC .. vNNNN}, meth@BBBB 
invokesuper/range   {vCCCC .. vNNNN}, meth@BBBB 
invokedirect/range   {vCCCC .. vNNNN}, meth@BBBB 
invokestatic/range   {vCCCC .. vNNNN}, meth@BBBB 
参数: 
 
AA：参数的个数。 
 
CCCC：存放参数的起始寄存器。 
 
NNNN = C + A – 1。 
 
BBBB：为方法的常量池索引。 
 
注：在函数调用产生的新的调用帧中，寄存器的编号规则为： 
1. 
寄存器从0 开始编号。 
2. 
函数调用中参数传递到新寄存器编号的最后。即：第一个参数传递到最后一个编号
的寄存器，第二个参数传递到倒数第二个编号的寄存器，以其类推。 
 
说明: 
 invoke-virtual：调用通用的virtual 方法（非static 方法,非final 方法和非构造函
数）。 
 invoke-super：调用父类的virtual 方法。 
 invoke-direct：调用private 实例方法或构造函数。 
 invoke-static：调用static 方法 
d) invoke-interface/rang 
指令: 
 通过指定寄存器范围传递参数的函数调用指令。 
格式: 
 
 
AA|op BBBB CCCC methodIndex 
值: 
78: invokeinterface/range 
中国银联 
版权所有

---
**[p70]**

Q/CUP 069—2015 
69 
助记符/语法: 
 Invokeinterface {vCCCC .. vNNNN}, meth@BBBB , methodIndex 
参数: 
 
AA：参数的个数； 
 
CCCC：存放参数的起始寄存器,NNNN = C + A – 1. 
 
BBBB：为所调用接口的接口类的常量池索引。 
 
methodIndex：该值为接口方法在接口类的方法表中的索引位置，该索引值由具体实
现决定。 
 
注：在函数调用产生的新的调用帧中，寄存器的编号规则为： 
1. 寄存器从0 开始编号。 
2. 函数调用中参数传递到新寄存器编号的最后。即：第一个参数传递到最后一个编号的
寄存器，第二个参数传递到倒数第二个编号的寄存器，以其类推。 
说明: 
invoke-interface:调用接口方法。 
35） 
一元操作 
一元操作指令主要分为neg-int、not-int、itob、itoc、itos 共五种： 
a) neg-int 
指令： 
 取负数。 
格式： 
 
 
B|A|op 
值： 
neg-int = 0x7b 
助记符/语法： 
 neg-int VA，VB 
参数： 
 A：目的寄存器； 
B：源寄存器。 
说明： 
 vA = - vB 
b) not-int 
指令： 
 取反。 
格式： 
 
 
B|A|op 
值： 
not-int = 0x7c 
助记符/语法： 
 not-int VA，VB 
参数： 
 A：目的寄存器； 
中国银联 
版权所有

---
**[p71]**

Q/CUP 069—2015 
70 
B：源寄存器或。 
说明： 
 vA = vB ^ 0xFFFFFFFF 
c) itob 
指令： 
 int 类型 转换为 byte 类型。 
格式： 
 
 
B|A|op 
值： 
itob = 0x8d 
助记符/语法： 
 itob VA，VB 
参数： 
 A：目的寄存器； 
B：源寄存器。 
说明： 
 vA = (byte)vB 
d) itos 
指令： 
 int 类型转换为short 类型。 
格式： 
 
 
B|A|op 
值： 
itos 
 = 0x8f 
助记符/语法： 
 itos VA，VB 
参数： 
 A：目的寄存器； 
B：源寄存器。 
说明： 
 vA = (short)vB 
 
36） 
二元操作 
a) add-int 
指令: 
 
 
将两个寄存器中的值进行有符号的整数加法运算，将运算结果存放在目的寄存器中。 
格式: 
 
 
AA|op CC|BB 
值: 
add-int = 0x90 
助记符/语法: 
 
 
add-int VAA,VBB,VCC 
中国银联 
版权所有

---
**[p72]**

Q/CUP 069—2015 
71 
参数: 
 
A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
 vA = vB +vC 
b) sub-int 
指令: 
 
 
将两个寄存器中的值进行有符号的整数减法运算，将运算结果存放在目的寄存器中。 
格式: 
 
 
AA|op CC|BB 
值: 
sub-int = 0x91 
助记符/语法: 
 
 
sub-int VAA,VBB,VCC 
参数: 
 
 
A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
 vA = vB – vC 
c) mul-int 
指令: 
 将两个寄存器中的值进行有符号的整数乘法运算，将运算结果存放在目的寄存器中。 
格式: 
 AA|op CC|BB 
值: 
 mul-int = 0x92 
助记符/语法: 
 mul-int VAA,VBB,VCC 
参数: 
 A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
 vA = vB * vC 
d) div-int 
指令: 
 将两个寄存器中的值进行有符号的除法乘法运算，将运算结果存放在目的寄存器中。 
格式: 
 AA|op CC|BB 
值: 
div-int = 0x93 
中国银联 
版权所有

---
**[p73]**

Q/CUP 069—2015 
72 
助记符/语法: 
 div-int VAA,VBB,VCC 
参数: 
 A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 vA = vB / vC 
e) rem-int 
指令: 
 将两个寄存器中的值进行有符号的取模运算，将运算结果存放在目的寄存器中。 
格式: 
 AA|op CC|BB 
值: 
rem-int = 0x94 
助记符/语法: 
 rem-int VAA,VBB,VCC 
参数: 
 A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
 vA = vB % vC 
f) and-int 
指令: 
 将两个寄存器中的值进行有符号的与运算，将运算结果存放在目的寄存器中。 
格式: 
 AA|op CC|BB 
值: 
and-int = 0x95 
助记符/语法: 
 and-int  VAA,VBB,VCC 
参数: 
 A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
 vA = vB & vC 
g) or-int 
指令: 
 将两个寄存器中的值进行有符号的或运算，将运算结果存放在目的寄存器中。 
格式: 
 AA|op CC|BB 
值: 
or-int = 0x96 
中国银联 
版权所有

---
**[p74]**

Q/CUP 069—2015 
73 
助记符/语法: 
 or-int  VAA,VBB,VCC 
参数: 
 A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
 vA = vB | vC 
h) xor-int 
指令: 
 将两个寄存器中的值进行有符号的异或运算，将运算结果存放在目的寄存器中。 
格式: 
 AA|op CC|BB 
值: 
xor-int = 0x97 
助记符/语法: 
 xor-int  VAA,VBB,VCC 
参数: 
 A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
 vA = vB ^ vC 
i) shl-int 
指令: 
 将两个寄存器中的值进行有符号的左移运算，将运算结果存放在目的寄存器中。 
格式: 
 AA|op CC|BB 
值: 
shl-int = 0x98 
助记符/语法: 
 shl-int  VAA,VBB,VCC 
参数: 
 A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
 vA = vB << vC 
j) shr-int 
指令: 
 将两个寄存器中的值进行有符号的右移运算，将运算结果存放在目的寄存器中。 
格式: 
 AA|op CC|BB 
中国银联 
版权所有

---
**[p75]**

Q/CUP 069—2015 
74 
值: 
shr-int = 0x99 
助记符/语法: 
 shr-int  VAA,VBB,VCC 
参数: 
 A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
 vA = vB >> vC 
k) ushr-int 
指令: 
 将两个寄存器中的值进行无符号数的右移运算，将运算结果存放在目的寄存器中。 
格式: 
 AA|op CC|BB 
值: 
ushr-int = 0x9a 
助记符/语法: 
 ushr-int  VAA,VBB,VCC 
参数: 
 A：目的寄存器； 
B：第一个源寄存器； 
C：第二个源寄存器。 
说明: 
vA = (无符号整数)vB >> vC 
 
37） 
二元操作指令（一个运算数和目的寄存器为同一个寄存器） 
a) add-int/2addr 
指令: 
 将两个寄存器中的值进行加法运算，将运算结果存放在目的寄存器中。 
格式: 
 B|A|op 
值: 
add-int/2addr = 0xb0 
助记符/语法: 
 add-int/2addr VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器； 
B：第二个源寄存器。 
说明: 
 vA = vA +vB 
b) sub-int/2addr 
中国银联 
版权所有

---
**[p76]**

Q/CUP 069—2015 
75 
指令: 
 将两个寄存器中的值进行减法运算，将运算结果存放在目的寄存器中。 
格式: 
 B|A|op 
值: 
sub-int/2addr = 0xb1 
助记符/语法: 
 sub-int/2addr VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器； 
B：第二个源寄存器。 
说明: 
 vA = vA - vB 
c) mul-int/2addr 
指令: 
 将两个寄存器中的值进行乘法运算，将运算结果存放在目的寄存器中。 
格式: 
 B|A|op 
值: 
mul-int/2addr = 0xb2 
助记符/语法: 
 mul-int/2addr  VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器； 
B：第二个源寄存器。 
说明: 
 vA = vA * vB 
d) div-int/2addr 
指令: 
 将两个寄存器中的值进行除法运算，将运算结果存放在目的寄存器中。 
格式: 
 B|A|op 
值: 
div-int/2addr = 0xb3 
助记符/语法: 
 div-int/2addr  VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器； 
B：第二个源寄存器。 
说明: 
 vA = vA / vB 
e) rem-int/2addr 
指令: 
中国银联 
版权所有

---
**[p77]**

Q/CUP 069—2015 
76 
 将两个寄存器中的值进行取模运算，将运算结果存放在目的寄存器中。 
格式: 
 B|A|op 
值: 
rem-int/2addr = 0xb4 
助记符/语法: 
 rem-int/2addr  VA,VB 
参数: 
 A:目的寄存器，同时也是第一个源寄存器； 
B：第二个源寄存器。 
说明: 
 vA = vA % vB 
f) and-int/2addr 
指令: 
 将两个寄存器中的值进行与运算，将运算结果存放在目的寄存器中。 
格式: 
 B|A|op 
值: 
and-int/2addr = 0xb5 
助记符/语法: 
 and-int/2addr VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器； 
B：第二个源寄存器。 
说明: 
 vA = vA & vB 
g) or-int/2addr 
指令: 
 将两个寄存器中的值进行或运算，将运算结果存放在目的寄存器中。 
格式: 
 B|A|op 
值: 
or-int/2addr = 0xb6 
助记符/语法: 
 or-int/2addr  VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器； 
B：第二个源寄存器。 
说明: 
 vA = vA | vB 
h) xor-int/2addr 
指令: 
 将两个寄存器中的值进行异或运算，将运算结果存放在目的寄存器中。 
中国银联 
版权所有

---
**[p78]**

Q/CUP 069—2015 
77 
格式: 
 B|A|op 
值: 
xor-int/2addr = 0xb7 
助记符/语法: 
 xor-int/2addr VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器； 
B：第二个源寄存器。 
说明: 
 vA = vA ^ vB 
i) shl-int/2addr 
指令: 
 将两个寄存器中的值进行左移运算，将运算结果存放在目的寄存器中。 
格式: 
 B|A|op 
值: 
shl-int/2addr = 0xb8 
助记符/语法: 
 shl-int/2addr  VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器，该寄存器值为有符号数； 
B：第二个源寄存器。 
说明: 
 vA = vA << vB 
j) shr-int/2addr 
指令: 
 将两个寄存器中的值进行右移运算，将运算结果存放在目的寄存器中。 
格式: 
 B|A|op 
值: 
shr-int/2addr = 0xb9 
助记符/语法: 
 shr-int/2addr  VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器，该寄存器值为有符号数； 
B：第二个源寄存器。 
说明: 
 vA = vA >> vB 
k) ushr-int/2addr 
指令: 
 将两个寄存器中的值进行无符号数右移运算，将运算结果存放在目的寄存器中。 
格式: 
中国银联 
版权所有

---
**[p79]**

Q/CUP 069—2015 
78 
 B|A|op 
值: 
ushr-int/2addr = 0xba 
助记符/语法: 
 ushr-int/2addr VA,VB 
参数: 
 A：目的寄存器，同时也是第一个源寄存器，该寄存器值为有符号数； 
B：第二个源寄存器。 
说明: 
vA = (无符号数)vA >> vB 
38） 
带16 位常量的二元操作指令 
a) add-int/lit16 
指令: 
 给定寄存器和给定值(有符号数)的加法运算。结果保存到给定的寄存器内。 
格式: 
 B|A|op CCCC 
值: 
add-int/lit16 = 0xd0 
助记符/语法: 
 add-int/lit16 VA,VB,#+CCCC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的16 位有符号的值。 
说明: 
 vA = vB + #+C 
b) rsub-int(reverse subtract) 
指令: 
 给定寄存器和给定值(有符号数)的反向减法运算。结果保存到给定的寄存器内。 
格式: 
 B|A|op CCCC 
值: 
rsub-int (reverse subtract) = 0xd1 
助记符/语法: 
 rsub-int (reverse subtract) VA,VB,#+CCCC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C： 
给定的16 位有符号的值。 
说明: 
 vA = #+C – vB 
c) mul-int/lit16 
中国银联 
版权所有

---
**[p80]**

Q/CUP 069—2015 
79 
指令: 
 给定寄存器和给定值(有符号数)的乘法运算。结果保存到给定的寄存器内。 
格式: 
 B|A|op CCCC 
值: 
mul-int/lit16 = 0xd2 
助记符/语法: 
 mul-int/lit16 VA,VB,#+CCCC 
参数: 
  A：目的寄存器； 
B：源寄存器； 
C： 
给定的16 位有符号的值。 
说明: 
 vA = vB * #+C 
d) div-int/lit16 
指令: 
 给定寄存器和给定值(有符号数)的除法运算。结果保存到给定的寄存器内。 
格式: 
 B|A|op CCCC 
值: 
div-int/lit16 = 0xd3 
助记符/语法: 
 mul-int/lit16 VA,VB,#+CCCC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的16 位有符号的值。 
说明: 
 vA = vB / #+C 
e) rem-int/lit16 
指令: 
 给定寄存器和给定值(有符号数)的取模运算。结果保存到给定的寄存器内。 
格式: 
 B|A|op CCCC 
值: 
rem-int/lit16 = 0xd4 
助记符/语法: 
 rem-int/lit16 VA,VB,#+CCCC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：:给定的16 位有符号的值。 
说明: 
中国银联 
版权所有

---
**[p81]**

Q/CUP 069—2015 
80 
 vA = vB % #+C 
f) and-int/lit16 
指令: 
 给定寄存器和给定值(有符号数)的与运算。结果保存到给定的寄存器内。 
格式: 
 B|A|op CCCC 
值: 
and-int/lit16 = 0xd5 
助记符/语法: 
 and-int/lit16 VA,VB,#+CCCC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的16 位有符号的值。 
说明: 
 vA = vB & #+C 
g) or-int/lit16 
指令: 
 给定寄存器和给定值(有符号数)的或运算。结果保存到给定的寄存器内。 
格式: 
 B|A|op CCCC 
值: 
or-int/lit16 = 0xd6 
助记符/语法: 
 or-int/lit16 VA,VB,#+CCCC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的16 位有符号的值。 
说明: 
 vA = vB | #+C 
h) xor-int/lit16 
指令: 
 给定寄存器和给定值(有符号数)的异或运算。结果保存到给定的寄存器内。 
格式: 
 B|A|op CCCC 
值: 
xor-int/lit16 = 0xd7 
助记符/语法: 
 or-int/lit16 VA,VB,#+CCCC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
中国银联 
版权所有

---
**[p82]**

Q/CUP 069—2015 
81 
C：:给定的16 位有符号的值。 
说明: 
 vA = vB ^ #+C 
 
39） 
带8 位常量的二元操作指令 
a) add-int/lit8 
指令: 
 给定寄存器和给定值的加法运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
值: 
add-int/lit8 = d8 
助记符/语法: 
 op/lit8 VAA,VBB,#+CC 
参数: 
  A：目的寄存器； 
B：源寄存器； 
C： 
给定的8 位的有符号值。 
 说明： 
  
vA = vB + C  
b) rsub-int/lit8 
指令: 
 给定寄存器和给定值的减法运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
值: 
rsub-int/lit8 = 0xd9 
助记符/语法: 
 op/lit8 VAA,VBB,#+CC 
参数: 
  A：目的寄存器； 
B：源寄存器； 
C： 
给定的8 位有符号值。 
说明： 
 vA = vC – vB 
c) mul-int/lit8 
指令: 
 给定寄存器和给定值的乘法运算。结果保存到给定的寄存器内。 
 
格式: 
 AA|op CC|BB 
值: 
mul-int/lit8 = 0xda 
中国银联 
版权所有

---
**[p83]**

Q/CUP 069—2015 
82 
助记符/语法: 
 mul-int/lit8 VAA,VBB,#+CC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的8 位有符号值。 
说明： 
 vA = vB / C 
d) div-int/lit8 
指令: 
 给定寄存器和给定值的除法运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
值: 
div-int/lit8 = 0xdb 
助记符/语法: 
 div-int/lit8 VAA,VBB,#+CC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的8 位有符号值。 
说明： 
 vA = vB / C 
e) rem-int/lit8 
指令: 
 给定寄存器和给定值的取模运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
值: 
rem-int/lit8 = 0xdc 
助记符/语法: 
 rem-int/lit8 VAA,VBB,#+CC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的8 位有符号值。 
 说明： 
  
vA = vB % C 
f) and-int/lit8 
指令: 
 给定寄存器和给定值的取模运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
中国银联 
版权所有

---
**[p84]**

Q/CUP 069—2015 
83 
值: 
and-int/lit8 = 0xdd 
助记符/语法: 
 and-int/lit8 VAA,VBB,#+CC 
参数: 
  A：目的寄存器； 
B：源寄存器； 
C: 给定的8 位有符号值。 
 
说明： 
 
 
vA = vB & C 
g) and-int/lit8 
指令: 
 给定寄存器和给定值的与运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
值: 
and-int/lit8 = 0xdd 
助记符/语法: 
 and-int/lit8 VAA,VBB,#+CC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的8 位有符号值。 
 
说明： 
 
 
vA = vB % C 
h) or-int/lit8 
指令: 
 给定寄存器和给定值的或运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
值: 
or_in/lit8 = 0xde 
助记符/语法: 
 or_in/lit8 VAA,VBB,#+CC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的8 位有符号值。 
 
说明： 
 
 
vA =vB | C 
i) xor-int/lit8 
指令: 
 给定寄存器和给定值的异或运算。结果保存到给定的寄存器内。 
中国银联 
版权所有

---
**[p85]**

Q/CUP 069—2015 
84 
格式: 
 AA|op CC|BB 
值: 
xor-int/lit8 = 0xdf 
助记符/语法: 
 xor-int/lit8 VAA,VBB,#+CC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的8 位有符号值。 
 
说明： 
 
 
vA = vB ^ C 
j) shl-int/lit8 
指令: 
 给定寄存器做给定值的有符号左移运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
值: 
shl-int/lit8 = 0xe0 
助记符/语法: 
 shl-int/lit8 VAA,VBB,#+CC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的8 位有符号值。 
 
说明： 
 
 
vA = vB << C 
k) shr-int/lit8 
指令: 
 给定寄存器做给定值的有符号数右移运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
值: 
shr-int/lit8 = 0xe1 
助记符/语法: 
 shr-int/lit8 VAA,VBB,#+CC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的8 位有符号值。 
 
说明： 
 
 
vA =vB << C 
l) ushr-int/lit8 
中国银联 
版权所有

---
**[p86]**

Q/CUP 069—2015 
85 
指令: 
 给定寄存器做给定值的无符号数右移运算。结果保存到给定的寄存器内。 
格式: 
 AA|op CC|BB 
值: 
ushr-int/lit8 = 0xe2 
助记符/语法: 
 ushr-int/lit8 VAA,VBB,#+CC 
参数: 
 A：目的寄存器； 
B：源寄存器； 
C：给定的8 位有符号值。 
 
说明： 
vA = (无符号整数)vB >> C 
5 
N3 TEE DEX 虚拟机 
5.1 DEX 虚拟机Java 语言集 
5.1.1 类型 
DEX 虚拟机不支持double、float。 
5.1.2 数组 
DEX 虚拟机不支持多维数组。 
5.1.3 类库 
DEX 虚拟机的基础类库有所局限。 
5.1.4 关键字 
DEX 虚拟机不支持的Java 关键字： 
native  
synchronized  
 
transient 
 
volatile 
strictfp 
 
enum 
 
 
assert 
5.1.5 Finalization 
DEX 虚拟机不支持不支持类实例的finalization。方法Object.finalize()无法被虚拟机自动调用。 
5.1.6 数据类型和值 
DEX 虚拟机支持两种数据类型：简单数据类型和引用类型。相应地有简单值和引用值两类值可以被
用来： 
——保存在变量； 
——作为参数传递，方法返回和运算符操作等。 
简单数据类型包括数值类型(byte , char, short , int, long)，布尔类型。类型大小定义如下： 
表20 布尔类型大小 
中国银联 
版权所有

---
**[p87]**

Q/CUP 069—2015 
86 
名称 
描述 
byte 
8-bit 有符号整数 
ubyte 
8-bit 无符号整数 
short 
16-bit 有符号整数, 小端格式 
ushort 
16-bit 无符号整数, 小端格式 
int 
32-bit 有符号整数, 小端格式 
uint 
32-bit 无符号整数, 小端格式 
long 
64-bit 有符号整数, 小端格式 
ulong 
64-bit 无符号整数, 小端格式 
引用类型有：类、数组。他们的值分别为动态创建的实例对象。引用能被定义为空引用，表示不指
向任何对象。引用类型为32 Bit。 
5.1.7 NATIVE 接口 
DEX 虚拟机不支持应用的本地方法开发。 
5.2 DEX 虚拟机架构 
5.2.1 DEX 虚拟机内部结构 
DEX 虚拟机内部结构如下图所示： 
Java源代码
Java编译器
Java字节码
dx工具
dx字节码
类加载器
字节码检测
解释器
运行时系统
N3 DEX虚拟机
 
图6 N3DEX 虚拟机结构 
DEX 虚拟机内部结构包括类加载器、运行时数据区和执行引擎等重要组成部分。 
DEX 虚拟机的内部体系结构如图所示，DEX 虚拟机由多个独立的子系统组成： 
——类加载器，负责加载类和对类的初始化等； 
——字节码验证器，验证字节码，确保类文件格式的正确性； 
——虚拟机执行引擎。 
中国银联 
版权所有

---
**[p88]**

Q/CUP 069—2015 
87 
5.2.2 类加载器 
类加载器在虚拟机中负责查找并加载字节码文件，即通过解析二进制的字节码文件，存入该类的运
行时数据结构，供运行时解析调用。并且同时装载并连接该类的所有超类和父类实现的接口。当虚拟机
装载某个类时，类加载器会定位相应的字节码文件，然后读入这个字节码文件，提取其中的数据信息，
并将这些信息存储到对应的内存中。 
当虚拟机在运行时需要调用的一个成员方法或者一个成员变量所属的类没有被解析的时候，虚拟机
会调用类加载模块，对这个类、父类以及这些类的相关接口进行加载和连接。 
5.2.3 运行时数据区域 
运行时数据区存储字节码、方法调用信息、常量池和类对象等。在类加载阶段，DEX 虚拟机的类加
载器解析字节码文件，将其中需要运行的类信息存储为相应的数据结构，在虚拟机运行程序的过程中，
会查找并使用这些数据。 
程序寄存器PC
栈帧寄存器FP
常量池
字节码
父帧
执行环境
虚拟寄存器
对象
对象
当前帧
堆
栈
线程私有
所有线程共享
寄存器
 
图7 DEX 虚拟机运行时数据区域 
DEX 虚拟机的常量池存储在 DEX 文件中，运行时虚拟机在常量池中查找数据。常量池中包含的数
据有：字符串常量、类型信息、字段信息和方法信息等； 
堆用来存储DEX 虚拟机在运行时所创建的类实例或者数组，虚拟机创建一个对象时，需要在堆空间
申请内存，DEX 虚拟机的垃圾收集模块会完成这个任务。 
方法的字节码以二进制流的方式存储在 DEX 文件中，虚拟机运行时解释执行每条字节码，PC 寄存
器用来表示当前正在执行的字节码指令。 
DEX 虚拟机的方法调用需要两个数据结构：方法调用栈和栈帧寄存器 FP。方法调用栈中有多个帧，
每个帧记录了一个方法调用的信息，当发生方法调用时，虚拟机会创建一个帧并将其压入方法调用栈，
方法调用结束时，这个帧被弹出；栈帧寄存器 FP 始终指向当前正在执行方法的帧。 
每个方法被创建时都会分配一组虚拟寄存器， v0~v15 共 16 个寄存器，每个方法所需要的虚拟寄
存器个数在编译时确定，并且记录在 DEX 文件里。每个寄存器都是 32 位，相邻的一对寄存器可用于
保存64位数据。 
中国银联 
版权所有

---
**[p89]**

Q/CUP 069—2015 
88 
5.2.4 执行引擎 
执行引擎是虚拟机的核心，负责执行字节码。DEX 虚拟机主要采用解释执行的方式。 
解释执行方式是指虚拟机在执行过程中将每一条字节码指令解释成本地代码运行，字节码的解释过
程是一个循环结构，每次循环完成一条字节码的执行工作：取指令、执行功能和跳转。 
5.2.5 字节码 
——DEX 字节码指令使用了常量池来对字符串、类型、字段、方法、类进行引用； 
——DEX 虚拟机存储数据在DEX 字节码指令中将以小端形式放置； 
——DEX 字节码指令操作码所对应的操作数类型没有限制。 
关于DEX 字节码指令的具体信息可参见本章7.5 虚拟机指令。 
5.3 DEX 虚拟机可执行文件格式 
5.3.1 Dex 虚拟机可执行文件概述 
DEX虚拟机的可执行文件被封装成DEX文件格式。DEX 文件由 header、string_ids、type_ids、
proto_ids、field_ids、method_ids、class_defs 和 data 等部分组成。DEX 文件分为不同的常量池
区域，每个常量池区域包含一个特定的类型，string_ids区域标识了 DEX 文件中所有的字符串，例如，
代码中使用的字符串、方法或者函数的名字。DEX 文件最后包含了一系列的类定义，使用这些定义可以
对这些类进行操作。 
5.3.2 文件头header 
文件头在 DEX 文件的开始位置，它标识了 DEX 文件的校验码和文件中其它数据结构的偏移地址。 
表21 文件头header 
偏移量 
大小 
描述 
0x0 
8 
“dex\n009\n” 
0x8 
4 
DEX 文件校验码 
0xC 
20 
SHA-1 签名 
0x20 
4 
DEX 文件长度（以字节计算） 
0x24 
4 
文件头的长度，当前值总是0x5C 
0x28 
8 
填充 
0x30 
4 
字符串表中字符串的个数 
0x34 
4 
字符串表在DEX 文件中的绝对偏移量 
0x38 
4 
与字符串表相关的数据 
0x3C 
4 
类列表中类的数量 
0x40 
4 
类列表在DEX 文件中的绝对偏移量 
0x44 
4 
字段表中字段的数量 
0x48 
4 
字段表在DEX 文件中的绝对偏移量 
0x4C 
4 
方法表中方法的数量 
0x50 
4 
方法表在DEX 文件中的绝对偏移量 
0x54 
4 
类定义表中类定义的数量 
0x58 
4 
类定义表在DEX 文件中的绝对偏移量 
中国银联 
版权所有

---
**[p90]**

Q/CUP 069—2015 
89 
5.3.3 字符串表string_ids 
字符串表中存储 DEX 文件中的每个字符串的长度和数据偏移量，这些字符串包括程序中的字符串
常量、类名、方法名、字段名以及变量的名字等。字符串表中的每个入口的格式如下： 
表22 字符串表string_ids 
偏移量 
大小 
描述 
0x0 
4 
字符串数据在DEX 文件中绝对偏移量 
0x4 
4 
字符串长度 
5.3.4 类列表 
类列表中包含了 DEX 文件引用或者使用的类，类列表中每个入口的格式参照下表所示，类列表只
存储 DEX 文件中被使用类的名字索引，对类的详细描述是在类定义表中。 
表23 类列表入口格式 
偏移量 
大小 
描述 
0x0 
4 
类名的字符串索引 
5.3.5 字段表 
字段表中包含了 DEX 文件中所有类的字段，字段表中的每个入口格式如表： 
表24 字段表入口格式 
偏移量 
大小 
描述 
0x0 
4 
字段所属类的索引 
0x4 
4 
字段名的字符串索引 
0x8 
4 
字段类型描述符的字符串索引 
5.3.6 方法表 
方法表包含了DEX 文件中所有类的方法，方法表中每个入口格式如下： 
表25 方法表入口格式 
偏移量 
大小 
描述 
0x0 
4 
方法所属类的索引 
0x4 
4 
方法名的字符串索引 
0x8 
4 
方法类型描述符的字符串索引 
5.3.7 类定义表 
类定义表中包含的类有：类定义表中包含的类有：DEX 文件中定义的类和 DEX 文件代码所访问其
方法或者字段的类，类定义表中每个入口格式如表： 
表26 类定义表入口格式 
偏移量 
大小 
描述 
中国银联 
版权所有

---
**[p91]**

Q/CUP 069—2015 
90 
0x0 
4 
类索引 
0x4 
4 
访问标志 
0x8 
4 
父类的索引 
0xC 
4 
接口列表的绝对偏移量 
0x10 
4 
静态字段列表的绝对偏移量 
0x14 
4 
实例字段列表的绝对偏移量 
0x18 
4 
直接方法列表的绝对偏移量 
0x1C 
4 
虚拟方法列表的绝对偏移量 
5.3.8 代码头 
此区域包含实现一个方法代码的信息，数据结构如下： 
表27 代码头数据结构 
偏移量 
大小 
描述 
0x0 
2 
方法中使用寄存器的数量 
0x2 
2 
方法传入参数的数量 
0x4 
2 
方法调用过程中方法传出参数的数量 
0x6 
2 
代码中try 的数量 
0x8 
4 
指令列表的大小，16 位单元 
0xC 
4 
实现这个方法的字节码的绝对偏移量 
0x10 
4 
方法抛出的异常列表的绝对偏移量 
0x14 
4 
代码行号的对应地址 
0x1C 
4 
方法本地变量的绝对偏移量 
5.3.9 本地变量列表 
本地变量列表保存了方法使用的本地变量，每个本地变量的数据格式如下： 
表28 本地变量列表 
偏移量 
大小 
描述 
0x0 
4 
变量名的字符串索引 
0x4 
4 
变量类型描述符的字符串索引 
0x8 
4 
变量的寄存器号 
5.3.10 Class 文件和DEX 文件对应关系 
中国银联 
版权所有

---
**[p92]**

Q/CUP 069—2015 
91 
 
图8 Class 文件和DEX 文件对应关系 
可信应用程序先被编译成class 文件，通过dx 转换工具（Android Dalvik 格式转换工具），class
文件转换为Dalvik 字节码，dx 工具重新安排class 文件的内容，并以dex 文件格式安排文件内容。 
dx工具能够将多个class文件转化为一个dex文件，保存在每个class文件中的常量池中的信息被分
类放在dex文件的同构常量池中。 
5.4 加载、链接与初始化 
5.4.1 虚拟机运行过程概述 
DEX虚拟机运行过程如图所示： 
中国银联 
版权所有

---
**[p93]**

Q/CUP 069—2015 
92 
开始
初始化虚拟机
装载运行时核心类，并校验字节码
执行程序字节码流
结束
 
图9 DEX 虚拟机运行流程 
DEX 虚拟机工作的流程如下：  
（1）初始化虚拟机的各个模块，包括初始化垃圾收集器、类加载器、字节码校验模块和解释器等，
完成各模块的初始化后创建一个进程； 
（2）装载DEX 虚拟机运行时核心类库； 
（3）初始化解释器并开始解释执行字节码流。 
5.4.2 类加载器 
DEX 虚拟机负责执行编译后的字节码。首先要读取并分析 DEX 文件中的内容得到字节码。在整个
执行过程中，加载 DEX 文件中类的信息是重要的一个步骤，这些类包括将要运行的应用程序类，以及
这个应用程序执行所需的 API 类，类中包含方法，而方法又包含字节码。所以通过对类的加载，才能
获得将要执行的字节码。 
3) DEX 文件的结构 
中国银联 
版权所有

---
**[p94]**

Q/CUP 069—2015 
93 
 
图10 DEX 文件结构 
DEX 文件的结构体如图所示，主要有三部分组成：头部，索引，数据。通过头部可知索引的位置和
数目，再通过索引可知本索引的数据在数据区的位置。其中classDefsOff 指定了 DexClassDef 在文
件的起始位置，dataOff 指定了数据区在文件的起始位置，DexClassDef 为类的索引，数据结构定义如
下： 
typedef struct DexClassDef { 
u4 classIdx; //索引，标识类的类型 
u4 accessFlags; //访问标志 
u4 superclassIdx; //索引，标识父类的类型 
u4 interfacesOff; // DexTypeList 的位置 
u4 sourceFileIdx; //索引，标识源文件名 
u4 annotationsOff; //annotations_directory_item 的位置 
u4 classDataOff; //数据区的位置 
u4 staticValuesOff; //DexEncodedArray 的位置 
} DexClassDef; 
通过读取 DexClassDef 可获知类的基本信息，其中 classDataOff 指定了此类数据在数据区的位
置。 
虚拟机对文件进行分析，其数据结构如下。 
typedef struct DexFile { 
const DexOptHeader* pOptHeader; 
const DexHeader* pHeader; 
const DexStringId* pStringIds; 
const DexTypeId* pTypeIds; 
const DexFieldId* pFieldIds; 
const DexMethodId* pMethodIds; 
const DexProtoId* pProtoIds; 
中国银联 
版权所有

---
**[p95]**

Q/CUP 069—2015 
94 
const DexClassDef* pClassDefs; 
const DexLink* pLinkData; 
const DexClassLookup* pClassLookup; 
DexIndexMap indexMap; 
const void* pRegisterMapPool; 
const u1* baseAddr; 
int overhead; 
} DexFile; 
其中 baseAddr 指向文件内存映射区的起始位置，pClassDefs 指向 DexClassDefs 的起始位
置。在查找类的时候，都是使用类的名字进行查找，虚拟机可以使用哈希表，以节省运行过程中的查找
时间。 
4) 类加载过程 
在加载用户类文件时，首先根据类的描述符查找类，并判断此类是否加载，如果已加载则直接返回，
如果未加载则查找 DEX 文件，首先获取类的索引，然后从 ClassDataoff 处读取类的具体数据，建立
ClassObject 结构并将加载的类放到哈希表中，至此，类加载工作完成。 
5) 类加载后的表现形式 
ClassObject 数据结构负责存放加载类的信息。如图所示，加载过程会创建几个区域，分别存放 
directMethods、virtualMethods、itables、sfields、 和ifields，这些信息是从 DEX 文件的数据
区中读取。 
——directMethods：直接方法表，存放静态方法、私有方法和构造方法； 
——virtualMethods：虚方法表，存放此类中的虚方法； 
——itables：接口表，存放此类中的接口实现； 
——sfields：静态字段表，存放此类中定义的静态字段； 
——ifields：实例字段表，存放类中直接定义的字段和对象引用。 
另外ClassObject 结构中有个名为 super 的成员，通过 super 成员来指向它的超类。 
中国银联 
版权所有

---
**[p96]**

Q/CUP 069—2015 
95 
 
图11 ClassObject 数据结构 
5.4.3 运行时常量池 
N3 TEE 应用一般由多个Java 类组成，编译的过程中首先是要javac 编译器将程序中的每个类或接
口编程成一个class 文件，然后使用dx 工具将这些class 文件转化为单一的DEX 文件，文件中包含了
所有类的信息。在转换过程中，dx 工具将所有 class 文件的常量池分解，去除重复的常量描述符，最
后形成一个公共的常量池并写入 DEX 文件中。在运行过程中，每个类的描述信息都通过索引的方式使
用这个公共常量池中的数据。 
DEX 文件的常量池分为不同的区域，每个常量池区域存储了一种特定类型的索引，常量池的区域划
分如下： 
——string_ids（字符串索引区）：包含了虚拟机使用所有的字符串的索引，每个索引标识了此字
符串在 DEX 文件数据区的位置； 
——type_ids（类型索引区）：包含了所有类型信息的索引，每个索引标识了此类型描述符的字符
串索引； 
——field_ids（字段索引区）：包含了所有字段信息的索引，每个索引标识了此字段的名字、类
型和所属类； 
——proto_ids（方法原型索引）：包含了所有方法原型信息的索引，每个索引标识了此方法的描
述符、参数和返回类型； 
——method_ids（方法索引区）：包含了所有方法信息的索引，每个索引标识了此方法的名字、原
型和所属类。 
5.4.4 解释器 
解释器是虚拟机的核心功能模块。解释器的基本功能是获取字节码指令，然后分析，执行。 
中国银联 
版权所有

---
**[p97]**

Q/CUP 069—2015 
96 
1) 字节码解释执行过程 
解释器保存了所有字节码的解释程序入口地址，使用字节码的操作码的值作为索引，每执行完一个
字节码就会跳转到下一个字节码的解释程序入口地址并执行。 
2) 方法调用过程 
在解释执行字节码过程中，经常会执行方法调用的字节码，解释程序有专门的方法调用处理函数，
常用有以下调用： 
——invokeVirtual 用于调用虚方法； 
——invokeInterface 用于调用接口方法； 
——invokeDirect 用于调用私有方法和构造方法； 
——invokeStatic 用于调用静态方法。 
这些函数开始执行前要为方法调用做准备，包括获取类中的方法数据，提取字节码中的操作数并检
查操作数的合法性，异常处理等，然后进行方法调用过程。 
 
执行栈和栈帧 
DEX 虚拟机启动一个新应用的时候，都会为其在堆中分配一个栈，称之为执行栈（Executoin Stack）。
执行栈的空间是连续的，栈是由许多的栈帧（Stack Frame）组成的，一个栈帧包含了一个方法调用的
状态以及方法调用所需的虚拟寄存器。 
 
图12 栈帧结构 
DEX 虚拟机调用方法时，需要两种栈帧：第一种是 break 帧，用来记录调用返回和异常发生的时
间；另一种则是方法运行帧，用来记录每个被调用方法的属性。DEX 虚拟机中使用结构体 StackSaveArea 
记录方法调用的信息，方法运行所需要的虚拟寄存器存储在栈帧中，虚拟寄存器分为三种：locals、ins 
和 outs，locals 代表局部变量，ins 代表导入的参数，方法执行所需寄存器的个数为 ins 与 locals 
的数量和，outs 在方法调用时用来传递参数。如图，StackSaveArea 结构中字 method 字段指向该栈
帧所属的方法；prevFrame 和 savedPc 分别为该帧所表示的方法的调用者的 frame 指针、PC 指针；
currentPc 指向该帧所表示方法的字节码指令。 
 
方法调用过程 
方法调用的工作内容是在当前的线程的栈上建立一个帧结构，并根据字节码指令的内容填充方法执
行所需的信息。方法调用的过程分为 4 个步骤： 
中国银联 
版权所有

---
**[p98]**

Q/CUP 069—2015 
97 
（1）根据方法的字节码确定参数个数，复制参数到当前方法栈帧的 outs 区域； 
（2）为新方法分配 StackSaveArea，帧指针向上移动(ins+locals)*4 个字节的空间，并判断栈是
否溢出； 
（3）设置新方法的 StackSaveArea，主要设置当前方法的帧指针和 PC； 
（4）更新 pc 为将要调用的方法的第一条指令，更新帧指针并从 pc 处获得第一条指令。 
当方法返回的主要功能流程如下： 
（1）更新 fp 指向调用函数的 StackSaveArea； 
（2）更新 pc 为调用此函数之前时指向的位置； 
（3）更新 调用函数和调用函数的帧； 
（4）跳转到下一条指令继续执行。 
 
参数传递 
在方法调用过程中存在如何传递参数和返回值的问题。由于在栈帧中，传出的参数放在调用帧
的顶端，即 outs 寄存器，传入的参数 ins 寄存器放在被调用帧的底端。为了简化函数间的参数传递，
允许两个有调用关系的栈帧结构的outs区域和ins区域相互重叠，这样就完成了调用参数的传递。 
5.5 DEX 虚拟机指令集 
5.5.1 DEX 指令描述的格式 
DEX 指令描述的格式是通过助记符来进行标识的。而助记符则是一些用于帮助记忆指令的符号，每
一个助记符都表示了特定指令的功能。 
助记符 
指令： 
 
该指令的简单描述。 
格式： 
 
该指令的格式。 
值： 
 
助记符 = opcode 或 opcode:助记符。 
助记符/语法： 
 
该指令的语法。 
参数： 
 
该指令的参数。 
说明： 
 
该指令的说明。 
DEX 指令格式中说明： 
 
（1）指令以16 位为基本单元，按小端排列。 
 
（2）指令基本单元之间以空格分隔，基本单元内以“|”分隔。 
 
（3）“φ”：用于指出在指定位置上的所有位都为0。 
（4）“op”：用于指出格式中的8 位操作码的位置。 
（5）“A-Z”：指令中的不同类型值。 
（6） vA: 表示寄存器索引类型。 
（7）#+X：“#+” 表示其后所带为常数。 
（8）“+X”：用于表示当前指令的地址偏移。 
5.5.2 DEX 指令集 
中国银联 
版权所有

---
**[p99]**

Q/CUP 069—2015 
98 
1） nop 
指令： 
 空操作。 
格式： 
 ØØ|op 
值： 
 nop = 0x00 
助记符/语法： 
 Nop 
说明： 
 
空闲一个指令周期。 
2） move 
指令： 
 寄存器间数据的转移。 
格式： 
 B|A|op 
值： 
 Move = 0x01 
助记符/语法： 
 Move vA,vB 
参数： 
 A:目的寄存器（4 位）;B:源寄存器（4 位）。 
说明： 
 将B 寄存器中的内容移动到A 寄存器。 
3） move/from16 
指令： 
 寄存器间数据的转移。 
格式： 
 AA|op BBBB 
值： 
 move/from16 = 0x02 
助记符/语法： 
 move/from16 VAA,VBBBB  
参数： 
 A:目的寄存器（8 位）；B：源寄存器（16 位）。 
说明： 
 将B 寄存器中的内容移动到A 寄存器中。 
4） move/16 
指令: 
中国银联 
版权所有

---
**[p100]**

Q/CUP 069—2015 
99 
 寄存器间数据的转移。 
格式: 
ØØ|op AAAA BBBB 
 
值: 
 move/16 = 0x03 
助记符/语法: 
 move/16 VAAAA,VBBBB 
参数: 
 A:目的寄存器（16 位）；B：源寄存器（16 位）。 
说明: 
 将B 寄存器中的内容移动到A 寄存器。 
5） move-object 
指令: 
 和对象相关的寄存器之间数据的移动。 
格式: 
 B|A|op 
值: 
 Move_instance = 0x07 
助记符/语法: 
 Move_instance vA,vB。 
参数: 
 A:目的寄存器（4 位）；B：源寄存器（4 位）。 
说明: 
 将vB 中的对象引用拷贝到vA 中。 
6） move-object/from16 
指令: 
 
和对象相关的寄存器之间数据的移动。 
格式: 
 
AA|op BBBB 
值: 
 
move-object/from16 = 0x08 
助记符/语法: 
 
move-object/from16 VAA,VBBBB 
参数: 
 A:目的寄存器（8 位）；B：源寄存器（16 位）。 
说明: 
 
将vB 中的对象引用拷贝到vA 中。 
7） move-object/16 
指令: 
中国银联 
版权所有

---
**[p101]**

Q/CUP 069—2015 
100 
 
和对象相关的寄存器之间数据的移动。 
格式: 
 
ØØ|op AAAA BBBB 
值: 
 
move-object/16 = 0x09 
助记符/语法: 
 
move-object/16 VAAAA,VBBBB 
参数: 
 
A:目的寄存器（16 位）；B：源寄存器（16 位）。 
说明: 
 寄存器A 中保存有一个对象的引用，B 中保存有一个对象的引用，该操作是A 中的引用也指向B 中
引用所指的对象。 
8） move-result 
指令: 
 
将最近调用invoke-kind 指令的返回结果移动到指定寄存器。 
格式: 
 
AA|op 
值: 
 
move-result = 0x0a 
助记符/语法: 
 
move-result vAA 
参数: 
 
A:目的寄存器（8 位）。 
说明: 
 
将最近调用返回的非对象，单字长的结果移动到指定的A 寄存器。 
9） move-result-object 
指令: 
 
将最近调用函数调用指令的返回结果移动到指定寄存器。 
格式: 
 
AA|op 
值: 
 
move-result-object = 0x0c 
助记符/语法: 
 
move-result-object vAA。 
参数: 
 
A：目的寄存器（8 位）。 
说明: 
 
将最近调用返回的对象的引用储存到寄存器A 中。 
10） 
move-exception 
指令: 
中国银联 
版权所有

---
**[p102]**

Q/CUP 069—2015 
101 
 
将exception 储存到寄存器中。 
格式: 
 
AA|op 
值: 
 
move-exception = 0x0d 
助记符/语法: 
 
move-exception vAA 
参数: 
 
A:目的寄存器。 
说明: 
 将刚刚捕获到的异常放到A 寄存器中，该指令做为对某特定异常有一定处理的exception handler
的第一条指令，并且只能作为exception handler 的第一条指令出现。 
11） 
return-void 
指令: 
 
空返回 
格式: 
 
ØØ|op 
值: 
 
return-void = 0x0e 
助记符/语法: 
 
return-void 
说明: 
 
返回为空的函数返回指令。 
12） 
Return 
指令: 
 
函数返回。 
格式: 
 
AA|op 
值: 
 
Return = 0x0f 
助记符/语法: 
 
Return vAA 
参数: 
 
A:源寄存器。 
说明: 
 
将寄存器中A 的值作为函数返回。 
13） 
return-object 
指令: 
 
函数返回。 
格式: 
中国银联 
版权所有

---
**[p103]**

Q/CUP 069—2015 
102 
 
AA|op 
值: 
 
return-object = 0x11 
助记符/语法: 
 
return-object vAA 
参数: 
 
A:源寄存器。 
说明: 
 
将寄存器中A 的值作为函数返回。 
14） 
const/4 
指令: 
 
给指定寄存器赋值。 
格式: 
 
B|A|op 
值: 
 
const/4 = 0x12 
助记符/语法: 
 
const/4 vA,#+B 
参数: 
 
A:目的寄存器；B：有符号整数（4 位，最高位为符号位）。 
说明: 
 
将整数B 的值赋给寄存器A 中，B 自动由4 位按有符号数扩展方式扩展到32 为。 
 
vA =(int) (vB << 28)>>28; 
15） 
const/16 
指令: 
 
给指定寄存器赋值。 
格式: 
 
AA|op BBBB 
值: 
 
const/16= 0x13 
助记符/语法: 
 
const/16 vAA,#+BBBB 
参数: 
 
A:目的寄存器 （8 位）；B：有符号整数值（16 位）。 
说明: 
 将整数值B 赋给寄存器A，B 在指令中以16 位长度给出，按有符号数扩展方式扩展到32 位。 
16） 
Const 
指令: 
 
给指定寄存器赋值。 
格式: 
中国银联 
版权所有

---
**[p104]**

Q/CUP 069—2015 
103 
 
AA|op BBBBlo BBBBhi 
值: 
 
Const = 0x14 
助记符/语法: 
 
Const VAA,#+BBBBBBBB 
参数: 
 
A:目的寄存器(8 位)；B：有符号整数值。 
说明: 
 
将整数值B 赋给寄存器A；B 在指令中以32 字节长度出现，第一字节位低16 位。 
17） 
const/high16 
指令: 
 
给指定寄存器赋值。 
格式: 
 
AA|op BBBB 
值: 
 
const/high16 = 0x15 
助记符/语法: 
 
const/high16 vAA,#+BBBB0000 
参数: 
 
A:目的寄存器（8 位），B：有符号整数值。 
说明: 
 
将给定的有符号的整数值B（16 位）做为整数的高位储存到寄存器A 中，低位填充0。 
18） 
check-cast 
指令: 
 
类型转换指令。 
格式: 
 
AA|op BBBB atype 
值: 
 
check-cast = 0x1f 
助记符/语法: 
 
check-cast vAA, BBBB,atype 
参数: 
 
A:含有指定对象引用的寄存器;. 
B:16 位常量池索引。 
atype:指定是否是简单类型的数组，引用数组，或对象。其值如以下类型对应表： 
 
类型 
值 
T_BOOLEAN 
10 
T_BYTE 
11 
T_SHORT 
12 
中国银联 
版权所有

---
**[p105]**

Q/CUP 069—2015 
104 
T_INT 
13 
T_REFERENCE 
14 
T_NOT 
00 
分别表示boolean, byte, short ,int, reference 类型的数组或非数组。 
说明:  
 将A 中所指向对象转换为索引B 出的类型。如果A 中所指向的对象不能转换为索引B 所指定的类型
则抛出异常。索引B 处所指定的类型必须是引用类型。 
19） 
Instance-of 
指令: 
 
Instanceof 指令。 
格式: 
 
B|A|op CCCC atype 
值: 
 
Instance-of = 0x20 
助记符/语法: 
 
Instance-of VA，VB， CCCC , atype 
参数: 
 
A :目的寄存器(4 位)； 
B :含有指定对象引用的寄存器； 
C: 16 位的常量池索引。 
atype:指定是否是简单类型的数组，引用数组，或对象。其值如下： 
T_BOOLEAN 
10 
T_BYTE 
11 
T_SHORT 
12 
T_INT 
13 
T_REFERENCE 
14 
T_NOT 
00 
分别表示boolean,byte,short,int,reference 类型的数组或非数组。 
说明: 
 判断B 指向的对象是否是索引C 指定类型的对象。将结果储存到寄存器A 中。C 所指定类型必须是
索引类型。 
20） 
array-length 
指令: 
 
求数组长度。 
格式: 
 
B|A|op 
值: 
 
array-length = 0x21 
助记符/语法:  
 
array-length VA,VB 
中国银联 
版权所有

---
**[p106]**

Q/CUP 069—2015 
105 
参数: 
 
A:目的寄存器（4 位）；B：源寄存器（4 位）。 
说明: 
 
将寄存器B 中所指向的数组的长度赋给寄存器A。 
21） 
new-instance 
指令: 
 
创建实例。 
格式: 
 
AA|op BBBB 
值: 
 
new-instance = 0x22 
助记符/语法: 
 
new-instance VAA, BBBB 
参数: 
 
A:目的寄存器（8 位）；B：16 位的常量池索引。 
说明: 
 
创建B 指定类型的对象，把该对象的引用储存到寄存器A 中，B 所指类型必须是引用类型。 
22） 
new-array 
指令: 
 
创建数组。 
格式: 
 
B|A|op CCCC atype 
值: 
 
new-array = 0x23 
助记符/语法: 
 
new-array VA,VB, CCCC,atype 
参数: 
 
A:目的寄存器（4 位）； 
B：指定长度的寄存器； 
C：16 位的常量池索引。 
atype:指定是否是简单类型的数组，引用数组，或对象。其值如以下类型对应表： 
表29 atype 对应表 
类型 
值 
T_BOOLEAN 
10 
T_BYTE 
11 
T_SHORT 
12 
T_INT 
13 
T_REFERENCE 
14 
分别表示boolean,byte,short,int,reference 类型的数组或非数组。 
中国银联 
版权所有

---
**[p107]**

Q/CUP 069—2015 
106 
说明: 
 
创建C 指定的类型，长度由B 指定的数组，将引用储存到A 处。 
23） 
fill-array-data 
指令: 
 
给指定数组赋值。 
格式: 
 
AA|op BBBBlo BBBBhi 
值: 
 
fill-array-data = 0x26 
助记符/语法: 
 
fill-array-data vAA,+BBBBBBBB 
参数: 
 
A:带有指定数组引用的寄存器；B：32 位的相对于本指令偏移量,低16 字节在前。 
说明: 
 
使用本指令下偏移B 处的数据来填充A 所指定的数组。 
24） 
Throw 
指令: 
 
抛出异常。 
格式: 
 
AA|op 
值: 
 
Throw = 0x27 
助记符/语法: 
 
Throw vAA 
参数: 
 
A:储存指定异常引用的寄存器。 
说明: 
 
抛出寄存器A 所指定的异常。 
25） 
Goto 
指令: 
 
跳转指令。 
格式: 
 
AA|op 
值: 
 
Goto = 0x28 
助记符/语法 
 
Goto +AA。 
参数 
 
A:8 位的指令偏移量,不能为零。 
说明 
中国银联 
版权所有

---
**[p108]**

Q/CUP 069—2015 
107 
 
跳转到距离该指令A 距离的指令位置。 
26） 
Goto/16 
指令: 
 
跳转指令。 
格式: 
 
ØØ|op AAAA 
值: 
 
Goto/16 = 0x29 
助记符/语法: 
 
Goto/16 +AAAA 
参数: 
 
A:16 位的指令偏移量,不能为零。 
说明: 
 
跳转到距离该指令A 距离的指令位置。 
27） 
Goto/32 
指令: 
 
跳转指令。 
格式: 
 
ØØ|op AAAAlo AAAAhi 
值: 
 
Goto/32 = 0x2a 
助记符/语法: 
 
Goto/32 +AAAAAAAA 
参数: 
 
A:32 位的指令偏移量,不能为零,低16 位字节在前。 
说明: 
 
跳转到距离该指令A 距离的指令位置。 
28） 
switch 
指令: 
 
Switch 跳转。 
格式: 
 
AA|op BBBBlo BBBBhi 
值: 
 
Packed-switch = 0x2b 
 
sparse_switch = 0x2c 
助记符/语法: 
 
Packed-switch (sparse_switch) VAA,+BBBBBBBB 
参数: 
 A:存放选择跳转偏移的依据值，就是switch（**）的结果；B：switch 跳转偏移表的偏移位置。 
说明: 
中国银联 
版权所有

---
**[p109]**

Q/CUP 069—2015 
108 
 
偏转表具体结构： 
表30 Packed-switch 
名字 
格式 
描述 
ident 
ushort = 0x0100 
packed-switch 跳转表的标识。 
size 
ushort 
跳转表入口的个数 
first_k
ey 
int 
最小的switch case 值 
targets 
int[] 
所有switch case 的跳转目标，值为相对当前PC 的
偏移值 
表31 sparse-switch 
名字 
格式 
描述 
ident 
ushort=0x0300 
sparse-switch 跳转表的标识。 
size 
ushort 
跳转表入口的个数 
keys 
int[] 
所有switch case key 值数组 
targets int[] 
所有跳转目标，值为相对当前PC 的偏移值 
29） 
If 指令 
If指令共分为if_eq、if_ne、if_it、if_ge、if_gt、if_le六种： 
a) if_eq 
指令： 
 
比较两个寄存器的值是否相等。 
格式： 
 
B|A|op +CCCC 
值： 
32： if_eq 
助记符/语法： 
 
if_eq vA，vB，+CCCC 
参数： 
 
A：用来比较的第一个寄存器；B：用来比较的第二个寄存器；C：跳转的偏移值。 
说明： 
 
如果vA 值等于vB 值，则跳转到当前PC 的C 偏移处。 
b) if_ne 
指令： 
 
比较两个寄存器的值是否不相等。 
格式： 
 
B|A|op +CCCC 
值： 
33： if_ne 
助记符/语法： 
 
if_ne vA，vB，+CCCC 
中国银联 
版权所有

---
**[p110]**

Q/CUP 069—2015 
109 
参数： 
 
A：用来比较的第一个寄存器；B：用来比较的第二个寄存器；C：跳转的偏移。 
说明： 
 
如果vA 值不等于vB 值，则跳转到当前PC 的C 偏移处。 
c) if_lt 
指令： 
 
比较寄存器vA 是否小于vB。 
格式： 
 
B|A|op +CCCC 
值： 
34： if_it 
助记符/语法： 
 
if_it vA，vB，+CCCC 
参数： 
 
A：用来比较的第一个寄存器；B：用来比较的第二个寄存器；C：跳转的偏移。 
说明： 
 
如果vA 值小于vB 值，则跳转到当前PC 的C 偏移处。 
d) if_ge 
指令： 
 
比较寄存器vA 是否大于等于vB。 
格式： 
 
B|A|op +CCCC 
值： 
if_ge = 0x35 
助记符/语法： 
if_ge vA，vB，+CCCC 
参数： 
 
A：用来比较的第一个寄存器；B：用来比较的第二个寄存器；C：跳转的偏移。 
说明： 
 
如果vA 值大于等于vB 值，则跳转到当前PC 的C 偏移处。 
e) if_gt 
指令： 
 
比较寄存器vA 是否大于vB。 
格式： 
 
B|A|op CCCC 
值： 
if_gt = 0x36 
助记符/语法： 
 
if_gt vA，vB，+CCCC 
参数： 
 
A：用来比较的第一个寄存器；B：用来比较的第二个寄存器；C：跳转的偏移。 
说明： 
 
如果vA 值大于vB 值，则跳转到当前PC 的C 偏移处。 
中国银联 
版权所有

---
**[p111]**

Q/CUP 069—2015 
110 
f) if_le 
指令： 
 
比较寄存器vA 是否小于等于vB。 
格式： 
 
B|A|op +CCCC 
值： 
if_le = 0x37 
助记符/语法： 
 
if_le vA，vB，+CCCC 
参数： 
 
A：用来比较的第一个寄存器；B：用来比较的第二个寄存器；C：跳转表的偏移。 
说明： 
 
如果vA 值小于等于vB 值，则跳转到当前PC 的C 偏移处 
30） 
If_zero 指令 
if_zero 命令主要有if_eqz、if_nez、if_ltz、if_gez、if_gtz、if_lez 六种： 
a) if_eqz 
指令： 
 
判断比较值是否等于0。 
格式： 
 
AA|op BBBB 
值： 
if_eqz = 0x38 
助记符/语法： 
 
If-testz VAA，+BBBB 
参数： 
 
A：用来比较的寄存器；B：偏移的位置。 
说明： 
 
如果vA 的值等于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
b) if_nez 
指令： 
 
判断比较值是否不等于0。 
格式： 
 
AA|op BBBB 
值： 
if_nez = 0x39 
助记符/语法： 
 
If-testz VAA，+BBBB 
参数： 
 
A：用来比较的寄存器；B：偏移的位置。 
说明： 
 
如果vA 的值不等于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
c) if_ ltz 
中国银联 
版权所有

---
**[p112]**

Q/CUP 069—2015 
111 
指令： 
 
判断比较值是否小于0。 
格式： 
 
AA|op BBBB 
值： 
if_ltz = 0x3a 
助记符/语法： 
 
If-testz VAA，+BBBB 
参数： 
 
A：用来比较的寄存器；B：偏移的位置。 
说明： 
 
如果vA 的值小于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
d) if_ gez 
指令： 
 
判断比较值是否大于或等于0。 
格式： 
 
AA|op BBBB 
值： 
if_gez = 0x3b 
助记符/语法： 
 
If-testz VAA，+BBBB 
参数： 
 
A：用来比较的寄存器；B：偏移的位置。 
说明： 
 
如果vA 的值大于等于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
e) if_ gtz 
指令： 
 
判断比较值是否大于0。 
格式： 
 
AA|op BBBB 
值： 
if_gtz = 0x3c 
助记符/语法： 
 
If-testz VAA，+BBBB 
参数： 
 
A：用来比较的寄存器；B：偏移的位置。 
说明： 
 
如果vA 的值大于0 跳转到当前PC 的BBBB 偏移处，否则继续执行。 
f) if_lez 
指令： 
 
判断比较值是否小于或等于0。 
格式： 
 
AA|op BBBB 
中国银联 
版权所有

---
**[p113]**

Q/CUP 069—2015 
112 
值： 
if_lez = 0x3d  
助记符/语法： 
 
If-testz VAA，+BBBB 
参数： 
 
A：用来比较的寄存器；B：偏移的位置。 
说明： 
如果vA的值小于0跳转到当前PC的BBBB偏移处，否则继续执行。 
31） 
数组操作指令 
数组操作指令主要有array_get、array_get_instance、array_get_boolean、array_get_byte、
array_get_short、array_put、array_put_instance、array_put_boolean、array_put_byte、
array_put_short 共10 种： 
a) array_get 
指令： 
 
取整数类型数组数组元素值。 
格式： 
 
AA|op CC|BB 
值： 
array_get = 0x44 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
 
A：目的寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 
取vB 所指定的整数类型数组的第vC 个元素存放在vA 中。 
b) array_get_instance 
指令： 
 
取对象类型数组数组元素值。 
格式： 
 
AA|op CC|BB 
值： 
array_get_instance = 0x46 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
A：目的寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 
取vB 所指定的对象类型数组的第vC 个元素存放在vA 中。 
中国银联 
版权所有

---
**[p114]**

Q/CUP 069—2015 
113 
c) array_get_boolean 
指令： 
 
取布尔类型数组数组元素值。 
格式： 
 
AA|op CC|BB 
值： 
array_get_boolean = 0x47 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
 
A：目的寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 
取vB 所指定的布尔类型数组的第vC 个元素存放在vA 中。 
d) array_get_byte 
指令： 
 
取字节类型数组数组元素值。 
格式： 
 
AA|op CC|BB 
值： 
array_get_byte = 0x48 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
 
A：目的寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 
取vB 所指定的字节类型数组的第vC 个元素存放在vA 中。 
e) array_get_short  
指令： 
 
取short 类型数组数组元素值。 
格式： 
 
AA|op CC|BB 
值： 
array_get_short = 0x4a 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
 
A：目的寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
中国银联 
版权所有

---
**[p115]**

Q/CUP 069—2015 
114 
说明： 
 
取vB 所指定的short 类型数组的第vC 个元素存放在vA 中。 
f) array_put  
指令： 
 
设置整数类型数组数组元素的值。 
格式： 
 
AA|op CC|BB 
值： 
array_put = 0x4b 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
 
A：值寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 
将vA 的值赋给vB 所指向的整数类型数组的vC 位置。 
g) array_put_instance  
指令： 
 
设置对象类型数组数组元素的值。 
格式： 
 
AA|op CC|BB 
值： 
array_put_instance = 0x4d 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
 
A：值寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 
将vA 的值赋给vB 所指向的对象类型数组的vC 位置。 
h) array_put_boolean  
指令： 
 
设置布尔类型数组数组元素的值。 
格式： 
 
AA|op CC|BB 
值： 
array_put_boolean = 0x4e 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
 
A：值寄存器。 
中国银联 
版权所有

---
**[p116]**

Q/CUP 069—2015 
115 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 
将vA 的值赋给vB 所指向的布尔类型数组的vC 位置。 
i) array_put_byte  
指令： 
 
设置字节类型数组数组元素的值。 
格式： 
 
AA|op CC|BB 
值： 
array_put_byte = 0x4f 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
 
A：值寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 
将vA 的值赋给vB 所指向的字节类型数组的vC 位置。 
j) array_put_short  
指令： 
 
设置short 类型数组数组元素的值。 
格式： 
 
AA|op CC|BB 
值： 
array_put_short = 0x51 
助记符/语法： 
 
Arrayop VAA，VBB，VCC 
参数： 
 
A：值寄存器。 
B：数组寄存器，保留指定数组的引用。 
C：索引寄存器，指令操作的数组索引位置。 
说明： 
 
将vA 的值赋给vB 所指向的short 类型数组的vC 位置。 
指令: 
 
数组类操作指令。 
格式: 
 
AA|op CC|BB 
值: 
44: array_get 
46: array_get_instance 
 
47: array_get_boolean 
中国银联 
版权所有

---
**[p117]**

Q/CUP 069—2015 
116 
48: array_get_byte 
49: array_get_char 
4a: array_get_short 
4b: array_put 
4d: array_put_instance 
4e: array_put_boolean 
4f: array_put_byte 
50: array_put_char 
51: array_put_short 
助记符/语法: 
 
Arrayop VAA,VBB,VCC 
参数: 
 
A:值寄存器或寄存器对，根据存或取指令该寄存器可能是源寄存器，也可能是目的寄存器；
B：数组寄存器，保留指定数组的引用；C：索引寄存器，指令操作的数组索引位置。 
说明: 
 
对指定数组的特定位置元素进行存取操作。 
32） 
对象操作指令 
对象操作指令主要分为instance_get、instance_get_instance、instance_get_boolean、
instance_get_byte、instance_get_short、instance_put、instance_put_instance、
instance_put_boolean、instance_put_byte、instance_put_short 共10 种： 
a) instance_get 
指令： 
 
取整数型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance_get = 0x52 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vB 对象的vC 所指向的整数型实例域的值存储在vA 中。 
b) instance_get_instance  
指令： 
 
取对象类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance_get_instance = 0x54 
中国银联 
版权所有

---
**[p118]**

Q/CUP 069—2015 
117 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vB 对象的vC 所指向的对象类型实例域的值存储在vA 中。 
c) instance_get_boolean  
指令： 
 
取布尔类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance_get_boolean = 0x55 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vB 对象的vC 所指向的布尔类型实例域的值存储在vA 中。 
d) instance_get_byte  
指令： 
 
取字节类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance_get_byte = 0x56 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vB 对象的vC 所指向的字节类型实例域的值存储在vA 中。 
e) instance_get_short  
指令： 
 
取short 类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
中国银联 
版权所有

---
**[p119]**

Q/CUP 069—2015 
118 
值： 
instance_get_short = 0x58 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：目的寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vB 对象的vC 所指向的short 类型实例域的值存储在vA 中。 
f) instance_put  
指令： 
 
设置整数类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance_put = 0x59 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：值寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vA 的值设置到vB 所指对象的vC 整数型实例域。 
g) instance_put_instance  
指令： 
 
设置对象类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance_put_instance = 0x5b 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：值寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vA 的值设置到vB 所指对象的vC 对象类型实例域。 
h) instance_put_boolean  
指令： 
 
设置布尔类型的实例域的值。 
中国银联 
版权所有

---
**[p120]**

Q/CUP 069—2015 
119 
格式： 
 
 
B|A|op CCCC 
值： 
instance_put_boolean = 0x5c 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：值寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vA 的值设置到vB 所指对象的vC 布尔类型实例域。 
i) instance_put_byte  
指令： 
 
设置字节类型的实例域的值。 
格式： 
 
B|A|op CCCC 
值： 
instance_put_byte = 0x5d 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：值寄存器。 
B：对象寄存器。 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vA 的值设置到vB 所指对象的vC 字节类型实例域。 
j) instance_put_short  
指令： 
 
设置short 类型的实例域的值。 
格式： 
 
 
B|A|op CCCC 
值： 
instance_put_short = 0x5f 
助记符/语法： 
 
op VA，VB， CCCC 
参数： 
 
A：值寄存器。 
B：对象寄存器； 
C：要操作的域在指定对象域部分的常量池索引。 
说明： 
 
将vA 的值设置到vB 所指对象的vCshort 类型实例域。 
 
中国银联 
版权所有

---
**[p121]**

Q/CUP 069—2015 
120 
指令: 
 
对象域操作。 
格式: 
 
 
B|A|op CCCC 
值: 
52: instance_get 
53: instance_get_pair 
54: instance_get_instance 
55: instance_get_boolean 
56: instance_get_byte 
57: instance_get_char 
58: instance_get_short 
59: instance_put 
5a: instance_put_pair 
5b: instance_put_instance 
5c: instance_put_boolean 
5d: instance_put_byte 
5e: instance_put_char 
5f: instance_put_short  
 
助记符/语法: 
 
op VA,VB, CCCC 
参数: 
 
A:值寄存器或寄存器对，根据存或取指令该寄存器可能是源寄存器，也可能是目的寄存器； 
B：对象寄存器； 
C：要操作的域在指定对象域部分的常量池索引。 
说明: 
 
对指定对象的指定域进行存取操作。 
33） 
静态域操作指令 
静态域操作指令主要分为static_get、static_get_instatce、static_get_boolean、
static_get_byte、static_get_short、static_put、static_put_instance、static_put_boolean、
static_put_byte、static_put_short 共10 个： 
a) static_get 
指令： 
 
取整数型的静态域的值。  
格式： 
 
AA|op BBBB 
值： 
static_get = 0x60 
助记符/语法： 
 
op VAA， BBBB 
参数： 
中国银联 
版权所有

---
**[p122]**

Q/CUP 069—2015 
121 
 
A：目的寄存器。  
B：静态域的16 位常量池索引。 
说明： 
 
将BBBB 所指的整形静态域的值存储在vA 中。 
b) static_get_instance 
指令： 
 
取对象类型的静态域的值。  
格式： 
 
AA|op BBBB 
值： 
static_get_instance = 0x62 
助记符/语法： 
 
op VAA， BBBB 
参数： 
 
A：目的寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 
将BBBB 所指的对象类型静态域的值存储在vA 中。 
c) static_get_boolean 
指令： 
 
取布尔类型的静态域的值。  
格式： 
 
AA|op BBBB 
值： 
static_get_boolean = 0x63 
助记符/语法： 
 
op VAA， BBBB 
参数： 
 
A：目的寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 
将BBBB 所指的布尔类型静态域的值存储在vA 中。 
d) static_get_byte 
指令： 
 
取字节类型的静态域的值。  
格式： 
 
AA|op BBBB 
值： 
static_get_byte = 0x64 
助记符/语法： 
 
op VAA， BBBB 
参数： 
 
A：目的寄存器。 
中国银联 
版权所有

---
**[p123]**

Q/CUP 069—2015 
122 
B：静态域的16 位常量池索引。 
说明： 
 
将BBBB 所指的字节类型静态域的值存储在vA 中。 
e) static_get_short 
指令： 
 
取short 类型的静态域的值。  
格式： 
 
AA|op BBBB 
值： 
static_get_short = 0x66 
助记符/语法： 
 
op VAA， BBBB 
参数： 
 
A：目的寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 
将BBBB 所指的short 类型静态域的值存储在vA 中。 
f) static_put 
指令： 
 
设置整形类型静态域的值。  
格式： 
 
AA|op BBBB 
值： 
static_put = 0x67 
助记符/语法： 
 
op VAA， BBBB 
参数： 
 
A：值寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 
将vA 的值存放在BBBB 指定的整型静态域。 
g) static_put_instance 
指令： 
 
设置对象类型静态域的值。  
格式： 
 
AA|op BBBB 
值： 
static_put_instance = 0x69 
助记符/语法： 
 
op VAA， BBBB 
参数： 
 
A：值寄存器。 
B：静态域的16 位常量池索引。 
中国银联 
版权所有

---
**[p124]**

Q/CUP 069—2015 
123 
说明： 
 
将vA 的值存放在BBBB 指定的对象类型静态域。 
h) static_put_boolean 
指令： 
 
设置布尔类型静态域的值。  
格式： 
 
AA|op BBBB 
值： 
static_put_boolean = 0x6a 
助记符/语法： 
 
op VAA， BBBB 
参数： 
 
A：值寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 
将vA 的值存放在BBBB 指定的布尔类型静态域。 
i) static_put_byte 
指令： 
 
设置字节类型静态域的值。  
格式： 
 
AA|op BBBB 
值： 
static_put_byte = 0x6b 
助记符/语法： 
 
op VAA， BBBB 
参数： 
 
A：值寄存器。 
B：静态域的16 位常量池索引。 
说明： 
 
将vA 的值存放在BBBB 指定的字节类型静态域。 
j) static_put_short 
指令： 
 
设置short 类型静态域的值。。  
格式： 
 
AA|op BBBB 
值： 
static_put_short = 0x6d 
助记符/语法： 
 
op VAA， BBBB 
参数： 
 
A：值寄存器。 
B：静态域的16 位常量池索引。 
说明： 
中国银联 
版权所有

---
**[p125]**

Q/CUP 069—2015 
124 
 
将vA 的值存放在BBBB 指定的short 类型静态域。 
 
指令: 
 
对静态域的存取操作。  
格式: 
 
 
AA|op BBBB 
值: 
60: static_get 
61: static_get_pair 
62: static_get_instance 
63: static_get_boolean 
64: static_get_byte 
65: static_get_char 
66: static_get_short 
67: static_put 
68: static_put_pair 
69: static_put_instance 
6a: static_put_boolean 
6b: static_put_byte 
6c: static_put_char 
6d: static_put_short 
助记符/语法: 
 
op VAA, BBBB 
参数: 
 
A:值寄存器或寄存器对，根据存或取指令该寄存器可能是源寄存器，也可能是目的寄存器； 
B:静态域的16 位常量池索引。 
说明: 
对指定的静态域进行存取操作。 
34） 
函数调用指令 
a) invokeKind 
指令: 
 
通过指定具体寄存器传递参数的函数调用指令。 
格式: 
 
 
B|A|op CCCC G|F|E|D 
值: 
6e: invokevirtual 
6f: invokesuper 
70: invokedirect 
71: invokestatic 
助记符/语法: 
 
Invokevirtual {VD,VE,VF,VG,VA} CCCC 
Invokesuper {VD,VE,VF,VG,VA} CCCC 
中国银联 
版权所有

---
**[p126]**

Q/CUP 069—2015 
125 
 
Invokedirect {VD,VE,VF,VG,VA} CCCC 
 
Invokestatic {VD,VE,VF,VG,VA} CCCC 
参数: 
 
B:参数的个数； 
D，E，F，G，A：参数寄存器，分别对应于第一个参数，第二个参数，第三个参数，第四个
参数，第五个参数。其意义由B 决定，B 指定参数个数。  
CCCC:在invokeinterface 中为所调用接口的接口类的常量池索引，在其他类型的方法调用
中为方法的常量池索引。 
说明: 
 
invoke-virtual:调用通用的virtual 方法（非static 方法,非final 方法和非构造函
数）。 
 
invoke-super: 调用父类的virtual 方法。 
 
invoke-direct:调用private 实例方法或构造函数。 
 
invoke-static:调用static 方法。 
b) invokeInterface 
指令: 
 
通过指定具体寄存器传递参数的接口函数调用指令。 
格式: 
 
 
B|A|op CCCC G|F|E|D methodIndex 
值: 
 
Invokeinterface = 0x72 
助记符/语法: 
 
Invokeinterface {VD,VE,VF,VG,VA} , CCCC ，methodIndex 
参数: 
 
B:参数的个数； 
D，E，F，G，A：参数寄存器，分别对应于第一个参数，第二个参数，第三个参数，第四个
参数，第五个参数。其意义由B 决定，B 指定参数个数。 
 
CCCC:在invokeinterface 中为所调用接口的接口类的常量池索引，在其他类型的方法调
用中为方法的常量池索引。 
 
methodIndex:该值为接口方法在接口类的方法表中的索引位置，该索引值由具体实现决
定。 
说明: 
 
invoke-interface:调用接口方法。 
c) invokeKind/rang 
指令: 
 
通过指定寄存器范围传递参数的函数调用指令。 
格式: 
 
 
AA|op BBBB CCCC 
值: 
74: invokevirtual/range 
75: invokesuper/range 
76: invokedirect/range 
77: invokestatic/range 
中国银联 
版权所有

---
**[p127]**

Q/CUP 069—2015 
126 
 
助记符/语法: 
 
Invokevirtual/range  {vCCCC .. vNNNN}, meth@BBBB 
Invokesuper/range   {vCCCC .. vNNNN}, meth@BBBB 
 
Invokedirect/range   {vCCCC .. vNNNN}, meth@BBBB 
 
Invokestatic/range   {vCCCC .. vNNNN}, meth@BBBB 
参数: 
 
AA:参数的个数； 
CCCC:存放参数的起始寄存器,NNNN = C + A – 1. 
 
BBBB:在invokeinterface 中为所调用接口的接口类的常量池索引，在其他类型的方法调
用中为方法的常量池索引。 
说明: 
 
invoke-virtual:调用通用的virtual 方法（非static 方法,非final 方法和非构造函
数）。 
 
invoke-super: 调用父类的virtual 方法。 
 
invoke-direct:调用private 实例方法或构造函数。 
 
invoke-static:调用static 方法 
d) invokeInterface/rang 
指令: 
 
通过指定寄存器范围传递参数的函数调用指令。 
格式: 
 
 
AA| invokeinterface/range  {vCCCC .. vNNNN}, meth@BBBB 
值: 
78: invokeinterface/range 
助记符/语法: 
 
Invokeinterface {vCCCC .. vNNNN}, meth@BBBB ，methodIndex 
参数: 
 
AA:参数的个数； 
CCCC:存放参数的起始寄存器,N = C + A – 1. 
 
BBBB:在invokeinterface 中为所调用接口的接口类的常量池索引，在其他类型的方法调
用中为方法的常量池索引。 
 
methodIndex:只出现在invokeinterface 中，该值为接口方法在接口类的方法表中的索引
位置，该索引值由具体实现决定。 
说明: 
 
invoke-interface:调用接口方法。 
35） 
一元操作 
一元操作指令主要分为neg_int、not_int、itob、itoc、itos 共五种： 
a) neg_int 
指令： 
 
取负数。 
格式： 
 
B|A|op 
中国银联 
版权所有

---
**[p128]**

Q/CUP 069—2015 
127 
值： 
neg_int = 0x7b 
助记符/语法： 
 
neg_int VA，VB 
参数： 
 
A：目的寄存器；B：源寄存器。 
说明： 
 
vA = - vB 
b) not_int 
指令： 
 
取反。 
格式： 
 
B|A|op 
值： 
not_int = 0x7c 
助记符/语法： 
 
not_int VA，VB 
参数： 
 
A：目的寄存器；B：源寄存器或。 
说明： 
 
vA = vB ^ 0xFFFFFFFF 
c) itob 
指令： 
 
int 类型 转换为 byte 类型。 
格式： 
 
B|A|op 
值： 
itob = 0x8d 
助记符/语法： 
 
itob VA，VB 
参数： 
 
A：目的寄存器；B：源寄存器。 
说明： 
 
vA = (byte)vB 
d) itos 
指令： 
 
int 类型转换为short 类型。 
格式： 
 
B|A|op 
值： 
itos = 0x8f 
助记符/语法： 
 
itos VA，VB 
中国银联 
版权所有

---
**[p129]**

Q/CUP 069—2015 
128 
参数： 
 
A：目的寄存器；B：源寄存器。 
说明： 
 
vA = (short)vB 
36） 
二元操作 
a) add_int 
指令: 
 
将两个寄存器中的值进行有符号的整数加法运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
add_int = 0x90 
助记符/语法: 
 
add_int VAA,VBB,VCC 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = vB +vC 
 
b) sub_int 
指令: 
 
将两个寄存器中的值进行有符号的整数减法运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
sub_int = 0x91 
助记符/语法: 
 
sub_int VAA,VBB,VCC 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = vB – vC 
 
c) mul_int 
指令: 
 
将两个寄存器中的值进行有符号的整数乘法运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
 mul_int = 0x92 
助记符/语法: 
 
mul_int VAA,VBB,VCC 
中国银联 
版权所有

---
**[p130]**

Q/CUP 069—2015 
129 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = vB * vC 
 
d) div_int 
指令: 
 
将两个寄存器中的值进行有符号的除法乘法运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
div_int = 0x93 
助记符/语法: 
 
div_int VAA,VBB,VCC 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = vB / vC 
 
e) rem_int 
指令: 
 
将两个寄存器中的值进行有符号的取模运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
rem_int = 0x94 
助记符/语法: 
 
rem_int VAA,VBB,VCC 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = vB % vC 
 
f) and_int 
指令: 
 
将两个寄存器中的值进行有符号的与运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
and_int = 0x95 
助记符/语法: 
 
and_int  VAA,VBB,VCC 
参数: 
中国银联 
版权所有

---
**[p131]**

Q/CUP 069—2015 
130 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = vB & vC 
 
g) or_int 
指令: 
 
将两个寄存器中的值进行有符号的或运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
or_int = 0x96 
助记符/语法: 
 
or_int  VAA,VBB,VCC 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = vB | vC 
 
h) xor_int 
指令: 
 
将两个寄存器中的值进行有符号的异或运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
xor_int = 0x97 
助记符/语法: 
 
xor_int  VAA,VBB,VCC 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = vB ^ vC 
 
i) shl_int 
指令: 
 
将两个寄存器中的值进行有符号的左移运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
shl_int = 0x98 
助记符/语法: 
 
shl_int  VAA,VBB,VCC 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
中国银联 
版权所有

---
**[p132]**

Q/CUP 069—2015 
131 
说明: 
 
vA = vB << vC 
 
j) shr_int 
指令: 
 
将两个寄存器中的值进行有符号的右移运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
shr_int = 0x99 
助记符/语法: 
 
shr_int  VAA,VBB,VCC 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = vB >> vC 
 
k) ushr_int 
指令: 
 
将两个寄存器中的值进行无符号数的右移运算，将运算结果存放在目的寄存器中。 
格式: 
 
AA|op CC|BB 
值: 
ushr_int = 0x9a 
助记符/语法: 
 
ushr_int  VAA,VBB,VCC 
参数: 
 
A:目的寄存器；B：第一个源寄存器；C：第二个源寄存器。 
说明: 
 
vA = (无符号整数)vB >> vC 
37） 
二元操作指令（一个运算数和目的寄存器为同一个寄存器） 
a) and_int/2addr 
指令: 
 
将两个寄存器中的值进行加法运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
add_int/2addr = 0xb0 
助记符/语法: 
 
add_int/2addr VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器；B：第二个源寄存器。 
中国银联 
版权所有

---
**[p133]**

Q/CUP 069—2015 
132 
说明: 
 
vA = vA +vB 
 
b) sub_int/2addr 
指令: 
 
将两个寄存器中的值进行减法运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
sub_int/2addr = 0xb1 
助记符/语法: 
 
sub_int/2addr VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器；B：第二个源寄存器。 
说明: 
 
vA = vA - vB 
 
c) mul_int/2addr 
指令: 
 
将两个寄存器中的值进行乘法运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
mul_int/2addr = 0xb2 
助记符/语法: 
 
mul_int/2addr  VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器；B：第二个源寄存器。 
说明: 
 
vA = vA * vB 
d) div_int/2addr 
指令: 
 
将两个寄存器中的值进行除法运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
div_int/2addr = 0xb3 
助记符/语法: 
 
div_int/2addr  VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器；B：第二个源寄存器。 
说明: 
 
vA = vA / vB 
中国银联 
版权所有

---
**[p134]**

Q/CUP 069—2015 
133 
 
e) rem_int/2addr 
指令: 
 
将两个寄存器中的值进行取模运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
rem_int/2addr = 0xb4 
助记符/语法: 
 
rem_int/2addr  VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器；B：第二个源寄存器。 
说明: 
 
vA = vA % vB 
 
指令: 
 
将两个寄存器中的值进行与运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
and_int/2addr = 0xb5 
助记符/语法: 
 
and_int/2addr  VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器；B：第二个源寄存器。 
说明: 
 
vA = vA & vB 
 
f) or_int/2addr 
指令: 
 
将两个寄存器中的值进行或运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
or_int/2addr = 0xb6 
助记符/语法: 
 
or_int/2addr  VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器；B：第二个源寄存器。 
说明: 
 
vA = vA | vB 
 
指令: 
中国银联 
版权所有

---
**[p135]**

Q/CUP 069—2015 
134 
 
将两个寄存器中的值进行异或运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
xor_int/2addr = 0xb7 
助记符/语法: 
 
xor_int/2addr  VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器；B：第二个源寄存器。 
说明: 
 
vA = vA ^ vB 
 
g) shl_int/2addr 
指令: 
 
将两个寄存器中的值进行左移运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
shl_int/2addr = 0xb8 
助记符/语法: 
 
shl_int/2addr  VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器，该寄存器值为有符号数；B：第二个源寄存器。 
说明: 
 
vA = vA << vB 
 
h) shr_int/2addr 
指令: 
 
将两个寄存器中的值进行右移运算，将运算结果存放在目的寄存器中。 
格式: 
 
B|A|op 
值: 
shr_int/2addr = 0xb9 
助记符/语法: 
 
shr_int/2addr  VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器，该寄存器值为有符号数；B：第二个源寄存器。 
说明: 
 
vA = vA >> vB 
 
i) ushr_int/2addr 
指令: 
 
将两个寄存器中的值进行无符号数右移运算，将运算结果存放在目的寄存器中。 
中国银联 
版权所有

---
**[p136]**

Q/CUP 069—2015 
135 
格式: 
 
B|A|op 
值: 
ushr_int/2addr = 0xba 
助记符/语法: 
 
ushr_int/2addr  VA,VB 
参数: 
 
A:目的寄存器，同时也是第一个源寄存器，该寄存器值为有符号数；B：第二个源寄存器。 
说明: 
 
vA = (无符号数)vA >> vB 
 
38） 
带16 位常量的二元操作指令 
a) add_int/lit16 
指令: 
 
给定寄存器和给定值(有符号数)的加法运算。结果保存到给定的寄存器内。 
格式: 
 
B|A|op CCCC 
值: 
add_int/lit16 = 0xd0 
 
助记符/语法: 
 
add_int/lit16 VA,VB,#+CCCC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的16 位有符号的值。 
说明: 
 
vA = vB + #+C 
 
b) rsub_int(reverse subtract) 
指令: 
 
给定寄存器和给定值(有符号数)的反向减法运算。结果保存到给定的寄存器内。 
格式: 
 
B|A|op CCCC 
值: 
rsub_int (reverse subtract) = 0xd1 
助记符/语法: 
 
rsub_int (reverse subtract) VA,VB,#+CCCC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的16 位有符号的值。 
说明: 
 
vA = #+C – vB 
c) mul_int/lit16 
指令: 
中国银联 
版权所有

---
**[p137]**

Q/CUP 069—2015 
136 
 
给定寄存器和给定值(有符号数)的乘法运算。结果保存到给定的寄存器内。 
格式: 
 
B|A|op CCCC 
值: 
mul_int/lit16 = 0xd2 
助记符/语法: 
 
mul_int/lit16 VA,VB,#+CCCC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的16 位有符号的值。 
说明: 
 
vA = vB * #+C 
 
d) div_int/lit16 
指令: 
 
给定寄存器和给定值(有符号数)的除法运算。结果保存到给定的寄存器内。 
格式: 
 
B|A|op CCCC 
值: 
div_int/lit16 = 0xd3 
助记符/语法: 
 
mul_int/lit16 VA,VB,#+CCCC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的16 位有符号的值。 
说明: 
 
vA = vB / #+C 
 
e) rem_int/lit16 
指令: 
 
给定寄存器和给定值(有符号数)的取模运算。结果保存到给定的寄存器内。 
格式: 
 
B|A|op CCCC 
值: 
rem_int/lit16 = 0xd4 
助记符/语法: 
 
rem_int/lit16 VA,VB,#+CCCC 
参数: 
 
A:目的寄存器；B：源寄存器；C:给定的16 位有符号的值。 
说明: 
 
vA = vB % #+C 
 
f) and_int/lit16 
指令: 
 
给定寄存器和给定值(有符号数)的与运算。结果保存到给定的寄存器内。 
中国银联 
版权所有

---
**[p138]**

Q/CUP 069—2015 
137 
格式: 
 
B|A|op CCCC 
值: 
and_int/lit16 = 0xd5 
助记符/语法: 
 
and_int/lit16 VA,VB,#+CCCC 
参数: 
 
A:目的寄存器；B：源寄存器；C:给定的16 位有符号的值。 
说明: 
 
vA = vB & #+C 
 
g) or_int/lit16 
指令: 
 
给定寄存器和给定值(有符号数)的或运算。结果保存到给定的寄存器内。 
格式: 
 
B|A|op CCCC 
值: 
or_int/lit16 = 0xd6 
助记符/语法: 
 
or_int/lit16 VA,VB,#+CCCC 
参数: 
 
A:目的寄存器；B：源寄存器；C:给定的16 位有符号的值。 
说明: 
 
vA = vB | #+C 
 
h) xor_int/lit16 
指令: 
 
给定寄存器和给定值(有符号数)的异或运算。结果保存到给定的寄存器内。 
格式: 
 
B|A|op CCCC 
值: 
xor_int/lit16 = 0xd7 
助记符/语法: 
 
or_int/lit16 VA,VB,#+CCCC 
参数: 
 
A:目的寄存器；B：源寄存器；C:给定的16 位有符号的值。 
说明: 
 
vA = vB ^ #+C 
39） 
带8 位常量的二元操作指令 
a) and_int/lit8 
指令: 
 
给定寄存器和给定值的加法运算。结果保存到给定的寄存器内。 
中国银联 
版权所有

---
**[p139]**

Q/CUP 069—2015 
138 
格式: 
 
AA|op CC|BB 
值: 
add_int/lit8 = d8 
助记符/语法: 
 
op/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位的有符号值。 
 
说明： 
 
 
vA = vB + C  
b) rsub_int/lit8 
指令: 
 
给定寄存器和给定值的减法运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
值: 
rsub_int/lit8 = 0xd9 
助记符/语法: 
 
op/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA = vC – vB 
c) mul_int/lit8 
指令: 
 
给定寄存器和给定值的乘法运算。结果保存到给定的寄存器内。 
 
 
格式: 
 
AA|op CC|BB 
值: 
mul_int/lit8 = 0xda 
助记符/语法: 
 
mul_int/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA = vB / C 
 
d) div_int/lit8 
指令: 
 
给定寄存器和给定值的除法运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
中国银联 
版权所有

---
**[p140]**

Q/CUP 069—2015 
139 
值: 
div_int/lit8 = 0xdb 
助记符/语法: 
 
div_int/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA = vB / C 
e) rem_int/lit8 
指令: 
 
给定寄存器和给定值的取模运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
值: 
rem_int/lit8 = 0xdc 
助记符/语法: 
 
rem_int/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA = vB % C 
f) and_int/lit8 
指令: 
 
给定寄存器和给定值的取模运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
值: 
and_int/lit8 = 0xdd 
助记符/语法: 
 
and_int/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA = vB & C 
g) and_int/lit8 
指令: 
 
给定寄存器和给定值的与运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
值: 
and_int/lit8 = 0xdd 
助记符/语法: 
 
and_int/lit8 VAA,VBB,#+CC 
中国银联 
版权所有

---
**[p141]**

Q/CUP 069—2015 
140 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA = vB % C 
h) or_int/lit8 
指令: 
 
给定寄存器和给定值的或运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
值: 
or_in/lit8 = 0xde 
助记符/语法: 
 
or_in/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA =vB | C 
i) xor_int/lit8 
指令: 
 
给定寄存器和给定值的异或运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
值: 
xor_int/lit8 = 0xdf 
助记符/语法: 
 
xor_int/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA = vB ^ C 
j) shl_int/lit8 
指令: 
 
给定寄存器做给定值的有符号左移运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
值: 
shl_int/lit8 = 0xe0 
助记符/语法: 
 
shl_int/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA = vB << C 
中国银联 
版权所有

---
**[p142]**

Q/CUP 069—2015 
141 
 
k) shr_int/lit8 
指令: 
 
给定寄存器做给定值的有符号数右移运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
值: 
shr_int/lit8 = 0xe1 
助记符/语法: 
 
shr_int/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
 
vA =vB << C 
 
l) ushr_int/lit8 
指令: 
 
给定寄存器做给定值的无符号数右移运算。结果保存到给定的寄存器内。 
格式: 
 
AA|op CC|BB 
值: 
ushr_int/lit8 = 0xe2 
助记符/语法: 
 
ushr_int/lit8 VAA,VBB,#+CC 
参数: 
 
A:目的寄存器；B：源寄存器；C: 
给定的8 位有符号值。 
说明： 
vA = (无符号整数)vB >> C 
6 
N3 TEE JEFF 虚拟机 
6.1 JEFF 虚拟机概述 
JEFF 虚拟机是专门用于TEE 的高级语言虚拟机。JEFF 虚拟机上运行的程序二进制格式为JEFF 文件。
开发者可以用Java 语言开发TA，然后把Java 程序转化成JEFF 文件。 
JEFF 虚拟机具有内存使用少、灵活易扩展等特点。 
6.2 JEFF 虚拟机Java 语言集 
JEFF 虚拟机支持的编程语言是Java 的一个子集，支持Java 的大部分特性。 
6.2.1 不支持的Java 特性 
表32 不支持的java 特性表 
特性 
JEFF 虚拟机 
备注 
中国银联 
版权所有

---
**[p143]**

Q/CUP 069—2015 
142 
Dynamic class loading 
 
 
User-defined class loader 
 
 
Security manager 
 
 
Finalization 
 
 
Multi-Threading 
 
 
Thread groups and daemon 
threads 
 
 
Asynchronous exception 
 
 
Object Cloning 
 
 
Typesafe Enums 
 
 
Enhanced for Loop 
部分支持 
支持数组，但不支持集合类 
Annotation 
 
 
Assertion 
 
 
RMI 
 
 
Native method 
部分支持 
支持本地方法，但不支持TA 直接
调用本地方法 
 
6.2.2 类型 
表33 类型表 
类型 
JEFF 虚拟机 
Comments 
char 
 
 
double 
 
 
float 
 
 
long 
 
 
boolean 
 
 
byte 
 
 
short 
 
 
int 
 
 
object 
 
 
array 
 
 
 
6.2.3 关键字 
关键字 
JEFF 虚拟机 
备注 
native 
 
 
Strictfp 
 
 
synchronized 
 
 
中国银联 
版权所有

---
**[p144]**

Q/CUP 069—2015 
143 
Enum 
 
 
transient 
 
 
assert 
 
 
volatile 
 
 
 
6.3 JEFF 虚拟机架构 
应用1
应用2
应用3
类库
JEFF加载器
执行引擎
（解释器或即时编译器）
垃圾收集器
Native接口
JEFF虚拟机
 
图13 JEFF 虚拟机架构 
 
6.3.1 应用 
以Java 编写、JEFF 为执行格式的TA。每个TA 可以由多个Java 文件构成，经过编译、转换成为
单个JEFF 文件，在JEFF 虚拟机上运行。 
6.3.2 类库 
供TA 调用的Java 类库，包括Java 系统库和TEE 功能模块库，如加解密、安全存储等。所有类库
封装在一个单个的JEFF 文件中，在JEFF 虚拟机启动后立即加载。所有TA 均共享同一份类库。 
6.3.3 JEFF 虚拟机 
1) JEFF 加载器 
用于将TA 的JEFF 可执行文件加载到虚拟机上执行。每个TA 的JEFF 文件所包含的所有class 是
一次性加载完成的。 
2) 执行引擎 
执行引擎可以是解释器（interpreter）或即时编译器（Just-In-Time Compiler），用于执行JEFF
字节码。 
3) 垃圾收集器 
中国银联 
版权所有

---
**[p145]**

Q/CUP 069—2015 
144 
自动回收不再使用的Java 对象。 
4) Native 接口 
连接Java 代码和native 代码。Native 接口只允许类库使用，TA 程序不能定义自己的native 方
法。 
6.4 虚拟机可执行文件格式 
JEFF 虚拟机采用JEFF 文件格式。JEFF 是一个公开的ISO 标准（ISO/IEC 20970: 
http://www.iso.org/iso/catalogue_detail.htm?csnumber=35604）。JEFF 文件格式包含可执行文件和链接信
息。因为JEFF 虚拟机对JEFF 文件格式并没有做修改，所以本指南只做概要性描述。 
一个applet 程序可能由几个Java 源文件组成。所有Java 文件需要编译为class 文件，然后用JEFF
转换器转换成一个JEFF 文件。所有用于链接的符号信息也存储在JEFF 文件中。 
JEFF 文件和其他metadata 组合在一起就组成了最终用于发布的applet 安装包。 
 
图14 JEFF 文件结构 
JEFF 文件分为六个区段： 
1) 文件头（File Header） 
文件头放在每个JEFF 文件的开始，用于标识该文件和存储访问其他部分的索引。在JEFF 文件结构
中，有些区（section）具有可变的区长度。文件头中的索引提供了快速访问每个区的方法。 
2) 类区段（Class Section） 
用于描述每个类的内容和特性。 
每个类区（class area）存储该类的信息，所有类的类区按顺序连续地存储在类区段中。每个类的
类区包含以下内容，并按下表中的顺序存储： 
表34 类区段存储表 
中国银联 
版权所有

---
**[p146]**

Q/CUP 069—2015 
145 
区域 
描述 
类头 
(Class Header) 
类标识及下列区域索引 
接口表 
(Interface Table) 
该类所实现的所有接口的列表 
引用类表 
(Referenced Class Table) 
该类所引用的类的列表 
内部域表 
(Internal Field Table) 
该类定义的域的列表 
内部方法表 
(Internal Method Table) 
该类定义的方法的列表 
引用域表 
(Referenced Field Table) 
该类所引用的其他类的域的列表 
引用方法表 
(Referenced Method Table) 
该类所引用的其他类的方法的列表 
字节码区域 
(Bytecode Area List) 
该类定义的方法的字节码列表 
异常表 
(Exception Table List) 
该类定义的方法的异常处理表的列表 
常量数据区域 
(Constant Data Section) 
该类所使用的常量数据集合 
 
3) 属性区段（Attributes Section） 
属性区是一个可选区。它存放该文件和类（class）、方法（method）、域（field）的可选属性。 
4) 符号数据区段（Symbolic Data Section） 
存放包、类、域、方法的符号表信息，即包、类、域、方法的索引值到名字的对应关系。 
5) 常量数据池（Constant Data Pool） 
存放属性区段和符号数据区段中用到的常量字符串和描述符。 
6) 电子签名（Digital Signature） 
整个JEFF 文件的电子签名。因为N3 TEE 中，JEFF 文件与metadata 一起打包签名，所以JEFF 文
件不需要单独的电子签名，所以在JEFF 虚拟机中，本区段没有用到。 
6.5 加载、链接与初始化 
Applet 程序安装时，需要对安装包做完整性验证，然后解析metadata。JEFF 文件作为安装包的一
部分也被解析出来，交给JEFF 虚拟机来加载。 
在加载JEFF 文件时，JEFF 文件中的所有class 是一起被加载的，applet 的所有class 会被链接到
系统库。JEFF 虚拟机不支持动态加载类，也不支持用户定义类加载器。 
每个applet 的类只能链接到系统库，不能链接到其他applet 定义的类。 
除以上特殊要求外，JEFF 虚拟机遵循标准的Java 加载、链接和初始化过程。 
6.6 虚拟机指令集 
JEFF 指令集与Java Bytecode 指令集在功能上完全等同。为了适用于JEFF 文件结构，JEFF 标准对
中国银联 
版权所有

---
**[p147]**

Q/CUP 069—2015 
146 
少部分Java Bytecode 指令做了相应调整。 
下面是JEFF 指令集的列表，跟Java Bytecode 指令有差异的部分用标出，差异一栏不标出的部
分表示该指令在Java Bytecode 中也存在相应指令。 
需要说明的是，本指南中的JEFF 指令集是在原有ISO 规范中JEFF 虚拟机规范（见规范性引用文件）
指令集的基础上进行了适当剪裁，部分指令集在本指南中暂未支持，其中虚拟机所支持的指令在下表支
持一栏中用标出。 
表35 虚拟机支持指令集 
编码 助记符 
差异 
支持 
 
编码 
助记符 
差异 
支持 
0x00 jeff_nop 
 
 
 
0x70 
jeff_irem 
 
 
0x01 jeff_aconst_null 
 
 
 
0x71 
jeff_lrem 
 
 
0x02 jeff_iconst_m1 
 
 
 
0x72 
jeff_frem 
 
 
0x03 jeff_iconst_0 
 
 
 
0x73 
jeff_drem 
 
 
0x04 jeff_iconst_1 
 
 
 
0x74 
jeff_ineg 
 
 
0x05 jeff_iconst_2 
 
 
 
0x75 
jeff_lneg 
 
 
0x06 jeff_iconst_3 
 
 
 
0x76 
jeff_fneg 
 
 
0x07 jeff_iconst_4 
 
 
 
0x77 
jeff_dneg 
 
 
0x08 jeff_iconst_5 
 
 
 
0x78 
jeff_ishl 
 
 
0x09 jeff_lconst_0 
 
 
 
0x79 
jeff_lshl 
 
 
0x0a 
jeff_lconst_1 
 
 
 
0x7a 
jeff_ishr 
 
 
0x0b jeff_fconst_0 
 
 
 
0x7b 
jeff_lshr 
 
 
0x0c 
jeff_fconst_1 
 
 
 
0x7c 
jeff_iushr 
 
 
0x0d jeff_fconst_2 
 
 
 
0x7d 
jeff_lushr 
 
 
0x0e 
jeff_dconst_0 
 
 
 
0x7e 
jeff_iand 
 
 
0x0f 
jeff_dconst_1 
 
 
 
0x7f 
jeff_land 
 
 
0x10 jeff_bipush 
 
 
 
0x80 
jeff_ior 
 
 
0x11 jeff_sipush 
 
 
 
0x81 
jeff_lor 
 
 
0x12 jeff_unused_0x12 
 
 
 
0x82 
jeff_ixor 
 
 
0x13 jeff_unused_0x13 
 
 
 
0x83 
jeff_lxor 
 
 
0x14 jeff_unused_0x14 
 
 
 
0x84 
jeff_iinc 
 
 
0x15 jeff_iload 
 
 
 
0x85 
jeff_i2l 
 
 
0x16 jeff_lload 
 
 
 
0x86 
jeff_i2f 
 
 
0x17 jeff_fload 
 
 
 
0x87 
jeff_i2d 
 
 
0x18 jeff_dload 
 
 
 
0x88 
jeff_l2i 
 
 
0x19 jeff_aload 
 
 
 
0x89 
jeff_l2f 
 
 
0x1a 
jeff_iload_0 
 
 
 
0x8a 
jeff_l2d 
 
 
0x1b jeff_iload_1 
 
 
 
0x8b 
jeff_f2i 
 
 
0x1c 
jeff_iload_2 
 
 
 
0x8c 
jeff_f2l 
 
 
0x1d jeff_iload_3 
 
 
 
0x8d 
jeff_f2d 
 
 
0x1e 
jeff_lload_0 
 
 
 
0x8e 
jeff_d2i 
 
 
中国银联 
版权所有

---
**[p148]**

Q/CUP 069—2015 
147 
0x1f 
jeff_lload_1 
 
 
 
0x8f 
jeff_d2l 
 
 
0x20 jeff_lload_2 
 
 
 
0x90 
jeff_d2f 
 
 
0x21 jeff_lload_3 
 
 
 
0x91 
jeff_i2b 
 
 
0x22 jeff_fload_0 
 
 
 
0x92 
jeff_i2c 
 
 
0x23 jeff_fload_1 
 
 
 
0x93 
jeff_i2s 
 
 
0x24 jeff_fload_2 
 
 
 
0x94 
jeff_lcmp 
 
 
0x25 jeff_fload_3 
 
 
 
0x95 
jeff_fcmpl 
 
 
0x26 jeff_dload_0 
 
 
 
0x96 
jeff_fcmpg 
 
 
0x27 jeff_dload_1 
 
 
 
0x97 
jeff_dcmpl 
 
 
0x28 jeff_dload_2 
 
 
 
0x98 
jeff_dcmpg 
 
 
0x29 jeff_dload_3 
 
 
 
0x99 
jeff_ifeq 
 
 
0x2a 
jeff_aload_0 
 
 
 
0x9a 
jeff_ifne 
 
 
0x2b jeff_aload_1 
 
 
 
0x9b 
jeff_iflt 
 
 
0x2c 
jeff_aload_2 
 
 
 
0x9c 
jeff_ifge 
 
 
0x2d jeff_aload_3 
 
 
 
0x9d 
jeff_ifgt 
 
 
0x2e 
jeff_iaload 
 
 
 
0x9e 
jeff_ifle 
 
 
0x2f 
jeff_laload 
 
 
 
0x9f 
jeff_if_icmpeq 
 
 
0x30 jeff_faload 
 
 
 
0xa0 
jeff_if_icmpne 
 
 
0x31 jeff_daload 
 
 
 
0xa1 
jeff_if_icmplt 
 
 
0x32 jeff_aaload 
 
 
 
0xa2 
jeff_if_icmpge 
 
 
0x33 jeff_baload 
 
 
 
0xa3 
jeff_if_icmpgt 
 
 
0x34 jeff_caload 
 
 
 
0xa4 
jeff_if_icmple 
 
 
0x35 jeff_saload 
 
 
 
0xa5 
jeff_if_acmpeq 
 
 
0x36 jeff_istore 
 
 
 
0xa6 
jeff_if_acmpne 
 
 
0x37 jeff_lstore 
 
 
 
0xa7 
jeff_goto 
 
 
0x38 jeff_fstore 
 
 
 
0xa8 
jeff_jsr 
 
 
0x39 jeff_dstore 
 
 
 
0xa9 
jeff_ret 
 
 
0x3a 
jeff_astore 
 
 
 
0xaa 
jeff_tableswitch 
 
 
0x3b jeff_istore_0 
 
 
 
0xab 
jeff_lookupswitch 
 
 
0x3c 
jeff_istore_1 
 
 
 
0xac 
jeff_ireturn 
 
 
0x3d jeff_istore_2 
 
 
 
0xad 
jeff_lreturn 
 
 
0x3e 
jeff_istore_3 
 
 
 
0xae 
jeff_freturn 
 
 
0x3f 
jeff_lstore_0 
 
 
 
0xaf 
jeff_dreturn 
 
 
0x40 jeff_lstore_1 
 
 
 
0xb0 
jeff_areturn 
 
 
0x41 jeff_lstore_2 
 
 
 
0xb1 
jeff_return 
 
 
0x42 jeff_lstore_3 
 
 
 
0xb2 
jeff_getstatic 
 
 
0x43 jeff_fstore_0 
 
 
 
0xb3 
jeff_pustatic 
 
 
0x44 jeff_fstore_1 
 
 
 
0xb4 
jeff_getfield 
 
 
0x45 jeff_fstore_2 
 
 
 
0xb5 
jeff_putfield 
 
 
0x46 jeff_fstore_3 
 
 
 
0xb6 
jeff_invokevirtual 
 
 
中国银联 
版权所有

---
**[p149]**

Q/CUP 069—2015 
148 
0x47 jeff_dstore_0 
 
 
 
0xb7 
jeff_invokespecial 
 
 
0x48 jeff_dstore_1 
 
 
 
0xb8 
jeff_invokestatic 
 
 
0x49 jeff_dstore_2 
 
 
 
0xb9 
jeff_invokeinterfa
ce 
 
 
0x4a 
jeff_dstore_3 
 
 
 
0xba 
jeff_unused_0xba 
 
 
0x4b jeff_astore_0 
 
 
 
0xbb 
jeff_new 
 
 
0x4c 
jeff_astore_1 
 
 
 
0xbc 
jeff_newarray 
 
 
0x4d jeff_astore_2 
 
 
 
0xbd 
jeff_unused_0xbd 
 
 
0x4e 
jeff_astore_3 
 
 
 
0xbe 
jeff_arraylength 
 
 
0x4f 
jeff_iastore 
 
 
 
0xbf 
jeff_athrow 
 
 
0x50 jeff_lastore 
 
 
 
0xc0 
jeff_checkcast 
 
 
0x51 jeff_fastore 
 
 
 
0xc1 
jeff_instanceof 
 
 
0x52 jeff_dastore 
 
 
 
0xc2 
jeff_monitorenter 
 
 
0x53 jeff_aastore 
 
 
 
0xc3 
jeff_monitorexit 
 
 
0x54 jeff_bastore 
 
 
 
0xc4 
jeff_unused_0xc4 
 
 
0x55 jeff_castore 
 
 
 
0xc5 
jeff_multianewarr
ay 
 
 
0x56 jeff_sastore 
 
 
 
0xc6 
jeff_ifnull 
 
 
0x57 jeff_pop 
 
 
 
0xc7 
jeff_ifnonnull 
 
 
0x58 jeff_pop2 
 
 
 
0xc8 
jeff_unused_0xc8 
 
 
0x59 jeff_dup 
 
 
 
0xc9 
jeff_unused_0xc9 
 
 
0x5a 
jeff_dup_x1 
 
 
 
0xca 
jeff_breakpoint 
 
 
0x5b jeff_dup_x2 
 
 
 
0xcb 
jeff_newconstarra
y 
 
 
0x5c 
jeff_dup2 
 
 
 
0xcc 
jeff_slookupswitc
h 
 
 
0x5d jeff_dup2_x1 
 
 
 
0xcd 
jeff_stableswitch 
 
 
0x5e 
jeff_dup2_x2 
 
 
 
0xce 
jeff_ret_w 
 
 
0x5f 
jeff_swap 
 
 
 
0xcf 
jeff_iinc_w 
 
 
0x60 jeff_iadd 
 
 
 
0xd0 
jeff_sldc 
 
 
0x61 jeff_ladd 
 
 
 
0xd1 
jeff_ildc 
 
 
0x62 jeff_fadd 
 
 
 
0xd2 
jeff_lldc 
 
 
0x63 jeff_dadd 
 
 
 
0xd3 
jeff_fldc 
 
 
0x64 jeff_isub 
 
 
 
0xd4 
jeff_dldc 
 
 
0x65 jeff_lsub 
 
 
 
0xd5 
jeff_dload_w 
 
 
0x66 jeff_fsub 
 
 
 
0xd6 
jeff_dstore_w 
 
 
0x67 jeff_dsub 
 
 
 
0xd7 
jeff_fload_w 
 
 
0x68 jeff_imul 
 
 
 
0xd8 
jeff_fstore_w 
 
 
0x69 jeff_lmul 
 
 
 
0xd9 
jeff_iload_w 
 
 
0x6a 
jeff_fmul 
 
 
 
0xda 
jeff_istore_w 
 
 
中国银联 
版权所有

---
**[p150]**

Q/CUP 069—2015 
149 
0x6b jeff_dmul 
 
 
 
0xdb 
jeff_lload_w 
 
 
0x6c 
jeff_idiv 
 
 
 
0xdc 
jeff_lstore_w 
 
 
0x6d jeff_ldiv 
 
 
 
0xdd 
jeff_aload_w 
 
 
0x6e 
jeff_fdiv 
 
 
 
0xde 
jeff_astore_w 
 
 
0x6f 
jeff_ddiv 
 
 
 
 
 
 
 
 
中国银联 
版权所有