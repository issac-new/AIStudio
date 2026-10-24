# 中国金融集成电路（IC）卡规范 第11部分：非接触式IC卡通讯规范
> 来源: PBOC3 | 64页 | 提取: 2026-09-03 pymupdf


---
**[p1]**

见
ICS 35.240.40 
A11 
备案号： 
中华人民共和国金融行业标准
JR
JR/T 0025.11—2013 
代替JR/T 0025.11—2010 
中国金融集成电路（IC）卡规范 
第11 部分：非接触式IC 卡通讯规范 
China financial integrated circuit card specifications— 
Part 11: Contactless integrated circuit card communication specification 
 
 
 
2013-02-05 发布 
2013-02-05 实施
中国人民银行 发布

---
**[p3]**

JR/T 0025.11—2013 
I 
目    次 
前言 ................................................................................ III 
引言 ................................................................................. IV 
1 范围 ................................................................................ 1 
2 规范性引用文件 ...................................................................... 1 
3 术语和定义 .......................................................................... 1 
4 符号和缩略语 ........................................................................ 3 
5 非接触式系统 ........................................................................ 5 
6 序列 ................................................................................ 5 
6.1 编码方式概述 ...................................................................... 6 
6.2 位速率 ............................................................................ 7 
6.3 Type A–位编码要求 .................................................................. 7 
6.4 Type B–位编码要求 .................................................................. 8 
6.5 同步和去同步化 ................................................................... 10 
7 帧 ................................................................................. 12 
7.1 帧格式 ........................................................................... 12 
7.2 帧时序 ........................................................................... 14 
8 Type A–命令与响应 ................................................................... 19 
8.1 Type A–命令集 ..................................................................... 19 
8.2 Type A–CRC_A .................................................................... 20 
8.3 WUPA ............................................................................ 20 
8.4 ANTICOLLISION .................................................................. 21 
8.5 SELECT .......................................................................... 22 
8.6 HLTA ............................................................................ 23 
8.7 选择应答请求（RATS） ............................................................ 23 
9 Type B–命令与响应 .................................................................. 26 
9.1 Type B–命令集 ..................................................................... 26 
9.2 Type B–CRC_B .................................................................... 27 
9.3 WUPB ............................................................................ 27 
9.4 ATTRIB .......................................................................... 31 
9.5 HLTB ............................................................................ 34 
10 Type A–PICC 状态机 ................................................................. 34 
10.1 状态图 .......................................................................... 34 
10.2 Type A PICC 的状态 ............................................................... 36 
11 Type B–PICC 状态机 ................................................................. 38 
11.1 状态图 .......................................................................... 38 
11.2 Type B PICC 的状态 ............................................................... 39 
12 PCD 处理 .......................................................................... 40 
12.1 主循环 .......................................................................... 40 
12.2 轮询 ............................................................................ 41

---
**[p4]**

JR/T 0025.11—2013 
 
II 
12.3 冲突检测 ........................................................................ 43 
12.4 激活 ............................................................................ 46 
12.5 移出 ............................................................................ 46 
12.6 异常处理 ........................................................................ 48 
13 半双工块传输协议 .................................................................. 48 
13.1 块格式 .......................................................................... 48 
13.2 帧等待时间延迟 .................................................................. 50 
13.3 协议操作 ........................................................................ 51 
附录A（规范性附录） 数值 ............................................................ 55 
附录B（资料性附录） PCD 异常处理 .................................................... 57 
参考文献 ............................................................................. 58

---
**[p5]**

JR/T 0025.11—2013 
III 
前    言 
JR/T 0025《中国金融集成电路（IC）卡规范》分为以下部分： 
――第1 部分：电子钱包/电子存折应用卡片规范（废止）； 
――第2 部分：电子钱包/电子存折应用规范（废止）； 
――第3 部分：与应用无关的IC 卡与终端接口规范； 
――第4 部分：借记/贷记应用规范； 
――第5 部分：借记/贷记应用卡片规范； 
――第6 部分：借记/贷记应用终端规范； 
――第7 部分：借记/贷记应用安全规范； 
――第8 部分：与应用无关的非接触式规范； 
――第9 部分：电子钱包扩展应用指南（废止）； 
――第10 部分：借记/贷记应用个人化指南； 
――第11 部分：非接触式IC 卡通讯规范； 
――第12 部分：非接触式IC 卡支付规范； 
――第13 部分：基于借记/贷记应用的小额支付规范； 
――第14 部分：非接触式IC 卡小额支付扩展应用规范； 
――第15 部分：电子现金双币支付应用规范； 
——第16 部分：IC 卡互联网终端规范； 
——第17 部分：借记/贷记应用安全增强规范。 
本部分为JR/T 0025的第11部分。 
本部分按照GB/T 1.1-2009给出的规则起草。 
本部分代替JR/T 0025.11—2010《中国金融集成电路（IC）卡规范  第11部分：非接触式IC卡通讯
规范》。 
本部分与JR/T 0025.11-2010相比主要变化如下： 
——修订了标准的前言； 
——对一些参数的值做出修订，使之兼容ISO/IEC 14443:2011。 
本部分由中国人民银行提出。 
本部分由全国金融标准化技术委员会（SAC/TC180）归口。 
本部分主要起草单位：中国人民银行、中国工商银行、中国银行、中国建设银行、中国农业银行、
交通银行、中国邮政储蓄银行、中国银联股份有限公司、中国金融电子化公司、银行卡检测中心、中钞
信用卡产业发展有限公司、捷德(中国)信息科技有限公司、惠尔丰（中国）信息系统有限公司、福建联
迪商用设备有限公司。 
本部分主要起草人：王永红、李晓枫、陆书春、潘润红、杜宁、陈则栋、吴晓光、李春欢、刘志刚、
张永峰、汤沁莹、李新、张栋、王红剑、李一凡、余沁、周新衡、张步、冯珂、李建峰、向前、涂晓军、
齐大鹏、陈震宇、郑元龙、聂舒、丁吉、白雪晶、李子达、沈卓群、刘世英、于海涛、翁秀诚。 
本部分所代替标准的历次版本发布情况为： 
——JR/T 0025.11—2010。

---
**[p6]**

JR/T 0025.11—2013 
 
IV 
引    言 
本部分为JR/T 0025 的第11 部分，在JR/T 0025.8 的基础上制定，详细规定了非接触式设备和非接
触式卡片之间无线通讯协议的有关要求。

---
**[p7]**

JR/T 0025.11—2013 
1 
中国金融集成电路（IC）卡规范 
第11 部分：非接触式IC 卡通讯规范 
1 范围 
本部分主要包括以下内容： 
—— 规定了非接触式通讯所使用的符号编码技术，并根据符号和符号序列定义了不同的逻辑值。
根据从PCD 到PICC 和从PICC 到PCD 通信的位编码需求，对Type A 和Type B 分别进行了
定义； 
—— 规定了Type A 和Type B 使用的数据帧格式。数据位被组合成帧的形式在PCD 和PICC 之间
进行传输； 
—— 规定了Type A 和Type B 数据帧的组成方式、帧大小和帧时序等详细内容； 
—— 规定了PCD 在轮询、冲突检测和激活PICC 过程中的有效命令格式； 
—— 规定了Type A 和Type B 的PICC 在初始化、轮询、冲突检测和状态机等方面内容； 
—— 规定了在PICC 初始化、轮询、冲突检测和PICC 激活、移出过程中，PCD 的处理流程。 
本部分定义的半双工块传输协议对Type A和Type B是通用的，它用于传输应用层所定义的信息
（C-APDU和R-APDU）。对应用层的规定超出本部分定义范围。 
本部分适用于由银行发行或接受的非接触式金融IC卡。其使用对象主要是与非接触式金融IC卡应用
相关的卡片设计、制造、管理、发行、受理以及应用系统的研制、开发、集成和维护等相关部门（单位）。 
2 规范性引用文件 
下列文件对于本文件的应用是必不可少的。凡是注日期的引用文件，仅注日期的版本适用于本文件。
凡是不注日期的引用文件，其最新版本（包括所有的修改单）适用于本文件。 
GB/T 16649.4  识别卡  带触点的集成电路卡  第4部分：用于交换的结构、安全和命令（GB/T 
16649.4－2010，ISO/IEC 7816-4:2005，IDT） 
JR/T 0025.8  中国金融集成电路（IC）卡规范  第8部分：与应用无关的非接触式规范 
ISO/IEC 13239  信息技术  系统间远程通信和信息交换  高级数据链路控制（HDLC）规程 
3 术语和定义 
下列术语和定义适用于本文件。 
3.1  
集成电路（IC）  integrated circuit（IC） 
用于执行处理和/或存储功能的电子器件。 
3.2  
无触点的  contactless 
完成与卡交换信号和给卡供应能量，而无需使用通电流元件（即不存在从外部接口设备到卡内所包
含集成电路的直接通路）。 
3.3  
无触点集成电路卡  contactless integrated circuit(s) card

---
**[p8]**

JR/T 0025.11—2013 
 
2 
一种ID-1型卡（如GB/T 14916中所规定），在它上面已装入集成电路，并且与集成电路的通信是
用无触点的方式完成的。 
3.4  
接近式卡（PICC）  proximity IC card（PICC） 
一种ID-1型卡，在它上面已装入集成电路和耦合电路，并且与集成电路的通信是通过与接近式耦
合设备的电感耦合完成的。 
3.5  
接近式耦合设备（PCD）  proximity coupling device（PCD） 
用电感耦合给PICC提供能量并控制与PICC交换数据的读/写设备。 
3.6  
位持续时间  bit duration 
确定一逻辑状态的时间，在这段时间结束时，一个新的位将开始。 
3.7  
二进制移相键控（BPSK） binary phase shift keying（BPSK） 
移相为180°的移相键控，从而导致两个可能的相位状态。 
3.8  
调制指数  modulation index 
定义为[a-b]/[a+b]，其中a和b分别是信号幅度的峰值和最小值。 
3.9  
不归零电平（NRZ-L）  non-return to zero（NRZ-L） 
位编码的方式，位持续期间的逻辑状态可以通过通信媒介的两个已定义的物理状态之一来表示。 
3.10  
副载波  subcarrier 
以频率fs调制载波频率fc而产生的RF信号。 
3.11  
防冲突环  anticollision loop 
在PCD激励场中，PCD准备和几个PICC中的一张或多张之间的对话所使用的算法。 
3.12  
位冲突检测协议  bit collision detection protocol 
在帧内比特级使用冲突检测的防冲突方法。冲突出现在至少两张PICC把互补位模式发送给PCD时。
在这种情况下，位模式被合并，在整个（100%）位持续时间内载波以副载波来调制。 
PCD检测出冲突位并按串联次序识别所有PICC ID。 
3.13  
字节  byte 
由指明的8位数据b1到b8组成，从最高有效位（MSB，b8）到最低有效位（LSB，b1）。 
3.14  
冲突  collision 
在同一时间周期内，在同一PCD的工作场中，有两张或两张以上的PICC进行数据传输，使得PCD不
能辨别数据是从哪一张PICC发出的。 
3.15  
基本时间单元（etu）  elementary time unit（etu） 
对于本部分，基本时间单元（etu）定义为：1etu=128/fc。 
3.16  
帧  frame

---
**[p9]**

JR/T 0025.11—2013 
3 
帧是一序列数据位和任选差错检测位，它在开始和结束处有定界符。 
注：Type A PICC 使用为Type A 定义的标准帧，Type B PICC 使用为Type B 定义的标准帧。 
3.17  
上层  higher layer 
属于应用或上层协议，它不在本部分描述。 
3.18  
时间槽协议  time slot protocol 
PCD与一张或多张PICC建立逻辑通道的方法，该方法对于PICC响应使用时间槽定位，类似于
slotted-Aloha 方法。 
3.19  
唯一识别符（UID）  unique identifier（UID） 
Type A防冲突算法所需的一个编号。 
3.20  
块  block 
帧的一种特殊类型，它包含有效协议数据格式。 
注：有效协议数据格式包括I-块、R-块或S-块。 
3.21  
头域  prologue field 
块的第一部分，包含协议控制字节（PCB）（在JR/T 0025.8中定义的CID和NAD未使用）。 
3.22  
尾域  epilogue field 
块的最后一部分，包括错误校验码（EDC）。 
4 符号和缩略语 
下列符号和缩略语适用于本文件。 
AC 
防冲突（AntiCollision） 
ACK 
肯定确认（Positive ACKnowledgement） 
ADC 
Type B 的应用数据编码（Application Data Coding, Type B） 
AFI 
Type B 的应用族识别符（Application Family Identifier, Type B） 
AM 
调幅（Amplitude Modulation） 
ASK 
移幅键控（Amplitude Shift Keying） 
ATQA 
Type A 的请求应答（Answer To reQuest, Type A） 
ATQB 
Type B 的请求应答（Answer To reQuest, Type B） 
ATS 
Type A 的选择应答（Answer To Select, Type A） 
ATTRIB Type B 的PICC 选择命令（PICC selection command, Type B） 
BCC 
Type A 的UID CLn 校验字节（UID CLn check byte, Type A） 
BPSK 
二进制移相键控（Binary Phase Shift Keying） 
CID 
卡标识符（Card IDentifier） 
CLn 
Type A 的串联级n，3≥n≥1（Cascade Level n, Type A） 
CRC_A 
Type A 的循环冗余校验差错检测码（Cyclic Redundancy Check error detection code 
for Type A） 
CRC_B 
Type B 的循环冗余校验差错检测码（Cyclic Redundancy Check error detection code 
for Type B） 
CT 
Type A 的串联标记（Cascade Tag, Type A）

---
**[p10]**

JR/T 0025.11—2013 
 
4 
D 
除数（Divisor） 
EDC 
错误校验码（Error Detection Code） 
EGT 
Type B 的额外保护时间（Extra Guard Time, Type B） 
EoF 
帧结束（End of Frame） 
EoS 
序列结束（End of Sequence） 
etu 
基本时间单元（Elementary time unit） 
fc 
载波频率（Carrier frequency） 
FDT 
帧延迟时间（Frame Delay Time） 
FO 
Type B 帧选项（Frame Option, Type B） 
fs 
副载波调制频率（Subcarrier frequency） 
FSC 
接近式卡帧长度（Frame Size for proximity Card） 
FSCI 
接近式卡帧长度整数（Frame Size for proximity Card Integer） 
FSD 
接近式耦合设备帧长度（Frame Size for proximity coupling Device） 
FSDI 
接近式耦合设备帧长度整数（Frame Size for proximity coupling Device Integer） 
FWI 
帧等待时间整数（Frame Waiting time Integer） 
FWT 
帧等待时间（Frame Waiting Time） 
HLTA 
Type A 的暂停命令（HaLT command, Type A） 
HLTB 
Tyep B 的暂停命令（HaLT command, Type B） 
IEC 
国际电工委员会（International Electrotechnical Commission） 
INF 
信息域（INFormation field） 
ISO 
国际标准化组织（International Organization for Standardization） 
LSB 
最低有效位（Least Significant Bit） 
max 
最大值（Index to define a maximum value） 
MBL 
最大缓冲长度（Maximum Buffer Length） 
MBLI 
最大缓冲长度指数（Maximum Buffer Length Index） 
min 
最小值（Index to define a minimum value） 
MSB 
最高有效位（Most Significant Bit） 
N/A 
不可用（Not Applicable） 
NAD 
结点地址（Node ADdress） 
NAK 
否定确认（Negative AcKnowledgement） 
NRZ-L 
不归零电平（L 为电平）（Non-Return to Zero,（L for level）） 
OOK 
开/关键控（On/Off Keying） 
P 
Type A 奇偶校验的奇校验位（Odd Parity bit, Type A） 
PCB 
协议控制字节（Protocol Control Byte） 
PCD 
接近式耦合设备（读写器）（Proximity Coupling Device（reader）） 
PICC 
接近式IC 卡（Proximity IC Card） 
PM 
调相（Phase Modulation） 
PUPI 
Type B 的伪唯一PICC 标识符（Pseudo-Unique PICC Identifier, Type B） 
RATS 
Type A 的选择应答请求（Request for Answer To Select, Type A） 
REQA 
Type A 的请求命令（REQuest command, Type A） 
REQB 
Type B 的请求命令（REQuest command, Type B） 
RF 
射频（Radio Frequency） 
RFU 
预留（Reserved for Future Use） 
SAK 
Type A 的选择确认（Select AcKnowledge, Type A）

---
**[p11]**

JR/T 0025.11—2013 
5 
SEL 
Type A 的选择码（SELect code, Type A） 
SFGI 
启动帧保护时间整数（Start-up Frame Guard time Integer） 
SFGT 
启动帧保护时间（Start-up Frame Guard Time） 
SoF 
帧开始（Start of Frame） 
SoS 
序列开始（Start of Sequence） 
UID 
Type A 的唯一标识符（Unique Identifier, Type A） 
uidn 
Type A 的唯一标识符的字节数目n，n≥0（Byte number n of UID, Type A） 
WTX 
等待时间延迟（Waiting Time eXtension） 
WTXM 
等待时间延迟乘数（Waiting Time eXtension Multiplier） 
WUPA 
Type A 的唤醒命令（Wake-UP command, Type A） 
WUPB 
Type B 的唤醒命令（Wake-UP command, Type B） 
5 非接触式系统 
非接触式系统基本组成部分包括非接触读写器（或者是PCD）和响应器（或者是PICC）。非接触
读写器主要由连接在电路上的天线构成。响应器包括一个感应天线和接在天线尾部的集成电路。读写器
和响应器结合起来，功能类似于一个变压器。当交流电通过主线圈（读写器天线）后可形成电磁场,并
在次线圈（响应器天线）生成感应电流。响应器将非接触读写器传播的电磁场（或射频场）通过一个二
极管整流器转换成直流电，为响应器的内部电路供电。两个天线的配置和调整决定了两个设备之间的耦
合率。 
图1是读写器和卡片的配置示例。 
图1 读写器和卡片的配置 
对电子（或光）载波信号添加信息称之为调制，载波信号通过它的振幅、相位和频率来具体定义。
因此，可以通过改变这些特征中的一个或多个来向载波添加信息。本部分中所用的调制方法包括： 
—— 振幅调制（AM）：信号载波的振幅随时间的变化而变化； 
—— 相位调制（PM）：信号载波的相位随时间的变化而变化。 
对于非接触卡，由非接触读写器（PCD）传输并由非接触卡（PICC）接收的射频能量不仅用来对
非接触卡上电，而且通过调制载波传输数据。PICC对PCD传输的数据进行解码和处理，然后通过加载
调制反馈给读写器。非接触读写器（PCD）应可以正确识别正向和反向负载调制的非接触卡片。 
加载调制的实现基于PICC和PCD之间的电磁耦合（即相互感应），与PCD到PICC的能量转移和通
信类似。PICC天线中电流的变化将对PCD天线中的电流产生微弱的影响，而被PCD感应到，典型的感
应情况是PCD天线中串联电阻上电压的升高。 
6 序列 
按本部分要求正确定义的信号称之为序列。接收设备需要有关信息确定如何识别需要解调的序列以
及何时开始和终止解调。此外，如果使用相位调制，发送方和接收方应设置共同的参考相位，即两者之
间必须同步。 
读写器 
电子线圈 
电磁场
卡片 
芯片
能量 
数据

---
**[p12]**

JR/T 0025.11—2013 
 
6 
在Type A或Type B中，序列以一个特定的波形开始，称之为序列开始（SoS），以一个特定的波形
结束，称之为序列结束（EoS）。SoS和EoS帮助接收设备与发送方同步，并识别一个有效序列，以实现
对序列中信息的提取，此信息是帧中位的集合，详细内容见第7章。 
本部分使用术语“命令”表示PCD发送的命令序列，采用术语“响应”表示PICC的响应序列。 
6.1 编码方式概述 
在数字通信系统中，数字数据要被转换成可传输符号。典型情况是，这些符号由脉冲序列（或“低
电平”）组成。最常见的数据传输方法是切换发送装置的开关，开时发送1，关时发送0。这种编码方式
被称为开/关键控（OOK），如图2所示。 
  
图2 OOK 编码 
因为0比特位和发送装置开关确实关闭之间的差别很难区分，数据信号需要额外的规则，即它必须
是被编码的。本部分使用下列编码方式： 
—— NRZ-L 编码； 
—— 曼彻斯特编码； 
—— 改进的米勒编码。 
图3给出了NRZ-L、曼彻斯特编码和改进的米勒编码的例子。 
不归零电平
曼彻斯特
改进的米勒
 
图3 编码图解 
Type A和Type B采用不同的编码方式，表1对其进行了总结。 
表1 编码方式概括 
通信 
Type A 
Type B 
PCD 到PICC 
改进的米勒编码 
NRZ-L 编码 
PICC 到PCD 
曼彻斯特编码 
NRZ-L 编码

---
**[p13]**

JR/T 0025.11—2013 
7 
6.2 位速率 
数字信号的计时是通过基本时间单元（etu）表示的。在本部分中，1etu等于一个位周期，即发送一
个单位信息的时间。 
在从PCD到PICC的通信中，etu 做如下定义： 
1 etu = 128 /（fc × DPCD→PICC） 
在从PICC到PCD的通信中，etu 做如下定义： 
1 etu = 8 /（fs × DPICC→PCD） 
其中fc是由PCD产生的载波频率，fs是PICC产生的副载波频率。除数DPCD→PICC和DPICC→PCD的初始值
是1，初始位速率是106kbits/s。初始etu定义如下： 
1 etu = 128/ fc = 8/fs 
要求： 位速率 
PCD 和PICC 
6.2.1.1 在本部分的这个版本中，通讯的位速率在双方向上设为fc/128（~106kbits/s）（即 
DPCD→PICC=DPICC→PCD=1） 
6.3 Type A–位编码要求 
本条规定了Type A是如何定义逻辑值的。 
6.3.1 从PCD 到PICC 的位编码 
PCD使用ASK100%调制的改进的米勒编码方式进行位编码，见图4。 
 
 
图4 ASK100%调制的改进米勒编码 
本部分定义了下列符号： 
—— 符号 X：在半个位持续时间之后，出现一个低电平； 
—— 符号 Y：在整个位持续时间中，没有出现调制； 
—— 符号 Z：在位持续时间开始时，出现一个低电平。 
要求： 从PCD 到PICC-Type A 的位编码 
PCD 
PICC 
6.3.1.1 PCD 编码逻辑0 和逻辑1 的规定如下： 
—— 逻辑1：符号X 
—— 逻辑0：符号Y 
下列情况除外： 
—— 符号Z 用于编码第一个逻辑0（SoF） 
6.3.1.2 PICC 解码逻辑0 和逻辑1 的规定如下： 
—— 第一个符号Z 应解码为逻辑0 
—— 如果有符号X，应解码为逻辑1 
—— 如果在符号X 后是符号Y，则将符号Y
解码为逻辑0

---
**[p14]**

JR/T 0025.11—2013 
 
8 
—— 如果存在两个或以上的连续逻辑0，则
从第二个开始以及紧随其后的逻辑0 都
使用符号Z 编码 
—— 如果在符号Y 后是符号Z，则将符号Z
解码为逻辑0 
—— 如果在符号Z 后是符号Z，则后一个符
号Z 解码为逻辑0 
6.3.2 从PICC 到PCD 的位编码 
PICC使用OOK副载波调制的曼彻斯特编码方式进行位编码，见图5。 
加载状态
 
图5 OOK 调制的曼彻斯特编码 
本部分定义了下列符号： 
—— 符号 D：载波在位持续时间的前半部分被副载波调制，在位持续时间的后半部分未被副载波
调制； 
—— 符号 E：载波在位持续时间的前半部分未被副载波调制，在位持续时间的后半部分被副载波
调制； 
—— 符号 F：载波在整个位持续时间内未被副载波调制。 
要求： 从PICC 到PCD–Type A 位编码 
PCD 
PICC 
如果PCD 检测到在前半个位持续时间载波被调
制，但是位周期不是从副载波加载状态开始，则
PCD 可认为发生传输错误 
6.3.2.1 如果载波在位持续时间的前半部分被
副载波调制（符号D），则位周期应从副载波加
载状态开始 
6.3.2.2 PCD 解码逻辑0 和逻辑1 的规定如下： 
—— 如果检测到符号D，解码为逻辑1 
—— 如果检测到符号E，解码为逻辑0 
6.3.2.3 PICC编码逻辑0和逻辑1的规定如下： 
—— 逻辑1：符号D 
—— 逻辑0：符号E 
6.4 Type B–位编码要求 
本条规定了Type B是如何定义逻辑值的。 
6.4.1 从PCD 到PICC 的位编码 
PCD使用ASK10%调制的NRZ-L编码方式进行位编码，见图6。

---
**[p15]**

JR/T 0025.11—2013 
9 
 
 
图6 ASK10%调制的NRZ-L 编码 
本部分定义了下列符号： 
—— 符号L：在整个位持续时间内，载波保持为低（调制）； 
—— 符号H：在整个位持续时间内，载波保持为高（未调制）。 
要求： 从PCD到PICC-Type B的位编码 
PCD 
PICC 
6.4.1.1 PCD 编码逻辑0 和逻辑1 的规定如下： 
—— 逻辑0：符号L 
—— 逻辑1：符号H 
6.4.1.2 PICC解码逻辑0和逻辑1的规定如下： 
—— 如果检测到符号L，解码为逻辑0 
—— 如果检测到符号H，解码为逻辑1 
6.4.2 从PICC 到PCD 的位编码 
PICC使用BPSK调制的NRZ-L编码方式进行编码，其中，逻辑电平的改变是通过副载波的相位变换
（180º）来表示，见图7。 
 
图7 BPSK 调制的NRZ-L 编码 
要求： 从PICC到PCD–Type B位编码 
PCD 
PICC

---
**[p16]**

JR/T 0025.11—2013 
 
10 
6.4.2.1 如果连续检测到以下情况，解码为逻辑
1： 
—— 副载波相位发生了Φ 0 到Φ 0 或Φ 0+180º
到Φ 0 的变化 
—— 随后副载波在一个位持续时间内保持相
位为Φ 0 
6.4.2.2 按以下连续情况编码为逻辑1： 
—— 副载波相位发生了Φ 0 到Φ 0 或Φ 0+180
º到Φ 0 的变化 
—— 随后副载波在一个位持续时间内保持
相位为Φ 0 
6.4.2.3 如果连续检测到以下情况，解码为逻辑
0： 
—— 副载波相位发生了Φ 0 到Φ 0+180º或Φ
0+180º到Φ 0+180º的变化 
—— 随后副载波在一个位持续时间内保持相
位为Φ 0+180º 
6.4.2.4 按以下连续情况编码为逻辑0： 
—— 副载波相位发生了Φ 0 到Φ 0+180º或Φ
0+180º到Φ 0+180º的变化 
—— 随后副载波在一个位持续时间内保持
相位为Φ 0+180º 
 
6.5 同步和去同步化 
6.5.1 Type A–同步 
Type A没有单独定义同步序列，主要是因为以下原因： 
—— 从PCD 到PICC 的通讯，使用ASK100%的方法调制，其低电平足以触发解调和指明第一个符
号的开始； 
—— 对于PICC 到PCD 的通讯，采用同步固定格式，从PCD 命令的最后一个低电平起，在等待规
定的载波周期后，PICC 应发送SoS。 
6.5.2 Type B–同步 
PCD发送命令后，PICC响应的开始如图8所示。 
 
图8 PICC 的开始序列 
PICC响应后，PCD发送新的命令的开始如图9所示。 
 
图9 PCD 的开始序列 
要求： 从PCD到PICC-Type B的同步

---
**[p17]**

JR/T 0025.11—2013 
11 
PCD 
PICC 
6.5.2.1 PCD 编码SoS 的规定如下： 
—— 载波在tPCD,S,1 内保持低电平（调制），
其后在tPCD,S,2 内保持高电平（未调制） 
tPCD,S,1和tPCD,S,2的取值见附录A 
6.5.2.2 PICC 解码SoS 的规定如下： 
—— 在tPCD,S,1 期间，载波为低电平（调制），
并且其后在tPCD,S,2 内保持高电平（未调
制） 
 
要求： 从PICC到PCD-Type B的同步 
PCD 
PICC 
6.5.2.3 PCD 设置参考相位Φ0 的流程如下： 
—— PCD 发送完命令之后，应忽略在TR0MIN
时间内PICC 产生的任何副载波 
—— PCD 在TR1 时间内检测到的副载波应
为参考相位Φ 0 
如果PCD在TR1MAX时间后没有检测到相位
变化，可认为发生传输错误 
如果PCD在TR1MIN之前检查到相位变化，可
认为发生传输错误 
6.5.2.4 PICC 设置参考相位Φ0 的流程如下： 
—— 在任何PCD 命令之后，PICC 在最小保
护时间TR0MIN 内，不应产生任何副载波 
—— 在TR0 时间后，PICC 应在同步时间TR1
内产生没有相位变化的副载波，此副载
波的相位即为参考相位Φ 0 
TR0MIN、TR1MAX、TR1MIN的取值见附录A 
6.5.2.5 如果在同步时间TR1 后PCD 连续检测
到以下情况，应解码为SoS： 
—— 副载波相位发生Φ 0 到Φ 0+180°的变化 
—— 随后副载波在tPICC,S,1 时间内保持相位
为Φ 0+180° 
—— 随后副载波相位发生Φ 0+180°到Φ 0 变
化 
—— 最后副载波在tPICC,S,2 时间内保持相位
为Φ 0 
6.5.2.6 在同步时间TR1 之后，PICC 将以下连
续情况编码为SoS： 
—— 副载波相位发生Φ 0 到Φ 0+180°的变化 
—— 随后副载波在tPICC,S,1 时间内保持相位为
Φ 0+180° 
—— 随后副载波相位发生Φ 0+180°到Φ 0 变
化 
—— 最后副载波在tPICC,S,2 时间内保持相位为
Φ 0 
tPICC,S,1和tPICC,S,2的取值见附录A 
6.5.3 符号同步 
Type A的符号无需同步。对于Type B，一个字符和下一个字符之间的时间间隔被称之为额外保护时
间（EGT）。EGTPCD是从PCD发送到PICC的两个连续字符之间的时间间隔；EGTPICC是从PICC发送到
PCD的两个连续字符之间的时间间隔。EGTPCD和EGTPICC的取值见附录A。 
对于Type B一个字符中的两个位（bit）之间的分隔，应遵循以下要求： 
—— 从PCD 到PICC 传输字符中，位的分界线应在 n etu±8/fc 之间，此处n 为从起始位下降沿计
算的位的分界线个数（1≤n≤9） 
—— 从PICC 到PCD 传输字符中，位分界线只发生在副载波上升或下降沿位置，即n etu±1/fs 
6.5.4 去同步化 
去同步化是通过采取违反正常逻辑0和逻辑1的编码/解码规则的方式来实现的。 
要求： 从PCD到PICC-Type A的序列结束 
PCD 
PICC 
6.5.4.1 PCD 编码EoS 的规定如下： 
—— EoS：符号Y 
 
6.5.4.2 PICC 解码EoS 的规定如下： 
—— 如果在符号Y 后检测到符号Y，则将后
一个符号Y 解码为EoS 
—— 如果PICC 在符号Z 后检测到符号Y，则
将符号Y 解码为EoS

---
**[p18]**

JR/T 0025.11—2013 
 
12 
要求： 从PICC到PCD-Type A的序列结束 
PCD 
PICC 
6.5.4.3 PCD 解码EoS 的规定如下： 
—— 如果PCD 检测到符号F，则解码为EoS 
6.5.4.4 PICC 编码EoS 的规定如下： 
—— EoS：符号F 
要求： 从PCD到PICC-Type B的序列结束 
PCD 
PICC 
6.5.4.5 PCD 编码EoS 的规定如下： 
—— PCD 将低电平（调制）持续tPCD,E 时间
后变为高电平（未调制）的载波编码为
EoS 
6.5.4.6 PICC 解码EoS 的规定如下： 
—— PICC 应将低电平（调制）持续tPCD,E 时
间后变为高电平（未调制）的载波解码
为EoS 
要求： 从PICC到PCD-Type B的序列结束 
PCD 
PICC 
6.5.4.7 PCD 将以下连续情况解码为EoS： 
—— 副载波相位发生Φ 0 到Φ 0+180°的变化 
—— 随后，副载波在tPICC,E 时间内保持相位
为Φ 0+180° 
—— 最后，副载波相位发生Φ 0+180°到Φ 0
变化 
6.5.4.8 PICC 编码EoS 的规定如下： 
—— 副载波相位发生Φ 0 到Φ 0+180°的变化 
—— 随后，副载波在tPICC,E 时间内保持相位为
Φ 0+180° 
—— 最后，副载波相位发生Φ 0+180°到Φ 0 变
化 
6.5.4.9 EoS 之后，PCD 应支持PICC 在tFSOFF
时间内保持着副载波 
如果PICC保持副载波的的时间长于tFSOFF，
PCD可认为发生通讯错误 
6.5.4.10 EoS 后，PICC 应保持副载波tFSOFF 时
间，然后停止副载波。 
tPICC,E和tFSOFF的取值见附录A 
如果副载波相位发生Φ0+180°到Φ0 变化的时间(i.e. tFSOFF=0)关闭，那么副载波的停止表示EOS 结束 
7 帧 
7.1 帧格式 
7.1.1 介绍 
数据组合成帧的形式在PCD和PICC之间传输，Type A 和Type B的帧格式不同。Type A的帧是由所
有数据位加上一个帧开始（SoF）和一个帧结束（EoF），并且在每8个数据位之后有一个奇偶校验位（P）
组成（短帧除外），EoF只用于PCD到PICC的通讯，PICC到PCD的通讯不使用EoF。 
Type B是基于字符的协议，首先要将数据字节（=8 bits）组合成字符，一个字符包括一个起始位，
8个数据位和一个停止位，然后字符再组成帧进行传输。Type B不使用SoF和EoF。 
两种协议都假设数据都已经编码成字节格式（即数据位的个数是8的整数倍），且LSB（或b1）先
传。本部分后续的命令和数据都按照传统的方式定义，即MSB（b8）在左， LSB（b1）在右。字节用
相反的顺序组织：字节1在最左边或最高有效字节，字节的传输首先从最高有效字节开始。 
图10说明了Type A和Type B帧格式的差异。

---
**[p19]**

JR/T 0025.11—2013 
13 
数据位
帧
数据位
帧
字符
 
图10 Type A 和Type B 的帧格式 
7.1.2 Type A–帧格式 
本条定义了Type A使用的帧格式。Type A使用两种帧：短帧和标准帧，短帧用于通讯初始化，标
准帧用于数据交换。 
7.1.2.1 短帧 
短帧用于通讯初始化，按以下次序组成，见图11。 
—— 帧开始（SoF）； 
—— 从LSB 开始传输的7 个数据位； 
—— 帧结束（EoF）。 
不加奇偶校验位。 
 
图11 短帧 
7.1.2.2 标准帧 
标准帧用于数据交换，并按以下次序组成，见图12： 
—— 帧开始（SoF）； 
—— n×（8 个数据位+奇校验位），n≥1； 
—— 帧结束（EoF）（只用于PCD 到PICC 通讯）。 
 
图12 标准帧 
对于Type A帧格式，PCD和PICC应遵循以下要求：

---
**[p20]**

JR/T 0025.11—2013 
 
14 
—— 帧应以SoF 开始。从PCD 到PICC 的通讯，SoF 应为逻辑0；从PICC 到PCD 的通讯，SoF
为逻辑1； 
—— 从PCD 到PICC 的通讯，帧应以EoF 结束，EoF 为逻辑0； 
—— 帧中的每8 个数据位应跟一个奇校验位P，设置P 值，使得（b1 到b8，P）中1 的个数为奇数。 
7.1.3 Type B–帧格式 
本条定义了Type B中字符和帧的格式。 
7.1.3.1 字符格式 
PICC和PCD之间的数据传输使用低位（LSB）在前的数据格式。每8个数据位都要加一个逻辑0起始
位和一个逻辑1停止位一起传输，如图13所示。一个字符包括一个起始位、8个数据位和一个停止位。停
止位、起始位和每个数据位都占用一个基本时间单元（etu）。 
 
 
图13 Type B 的字符格式 
7.1.3.2 帧格式 
PCD和PICC之间以帧形式传输字符，如图14所示。Type B不使用SoF和EoF。 
 
 
图14 Type B 的帧格式 
7.1.4 帧长度 
7.1.4.1 FSD（PCD 的帧长度） 
FSD定义了PCD可以接收的单一帧的最大长度，表示帧中数据字节的个数。对于Type A，PCD通过
RATS命令中的FSDI向PICC指明FSD；对于Type B，PCD用ATTRIB命令中的参数2向PICC指明FSD。 
PCD和PICC遵循以下规定： 
—— PCD 应能接收数据字节数为FSD 的帧，如果数据字节数超过FSD，PCD 应认为发生协议错误； 
—— PICC 应只发送小于或等于FSD 数据字节数的帧； 
—— PCD 支持的FSD 应为FSDMIN ； 
—— PICC 应支持FSD 为FSDMIN 的PCD，可支持FSD 小于FSDMIN 的PCD。 
7.1.4.2 FSC（PICC 的帧长度） 
FSC定义了PICC可以接收的单一帧的最大长度，表示帧中数据字节的个数。对于Type A，PICC通
过ATS的T0中的FSCI向PCD指明FSC；对于Type B，PICC通过ATQB中的Max_Frame_Size向PCD指明
FSC。 
PCD和PICC应遵循以下规定： 
—— PCD 发送的帧，其数据字节数应小于或等于FSC； 
—— PICC 应能接收数据字节数为FSC 的帧，如果数据字节数超过FSC，PICC 应认为发生协议错
误； 
—— PCD 应能发送数据字节数大于或等于FSCMIN 的帧，并可支持FSC 小于FSCMIN 的PICC； 
—— PICC 支持的FSC 应至少为FSCMIN。 
7.2 帧时序 
本条规定了Type A和Type B对不同的帧延迟时间的要求。帧延迟时间（FDT）定义为在相反方向传
输的两个序列之间的间隔时间。

---
**[p21]**

JR/T 0025.11—2013 
15 
7.2.1 从PCD 到PICC 的帧延迟时间 
从PCD命令发送结束到PICC响应开始的时间间隔，定义为从PCD到PICC的帧延迟时间（FDTPICC），
FDTA,PICC表示Type A的FDTPICC，FDTB,PICC表示Type B的FDTPICC。 
7.2.1.1 FDTA, PICC 
对于Type A，FDTA,PICC是从PCD命令的最后一个低电平的上升沿开始，到PICC响应的SoF起始为止
的时间间隔，如图15所示。 
 
（a）最后一位为逻辑1 
 
（b）最后一位为逻辑0 
图15 FDTA, PICC 
FDTA, PICC取决于PCD发送的在EoF之前的最后一位逻辑值如表2中定义。 
表2 FDTA, PICC 和EoF 之前最后一位逻辑值对应关系 
逻辑值 
FDT A, PICC 
0 
（n×128+20）/fc 
1 
（n×128+84）/fc 
n值为整数，根据表3中定义的命令类型设置。 
表3 FDTA, PICC 和命令类型 
命令类型 
N 
WUPA 
ANTICOLLISION 
SELECT 
9 
所有其它Type A 命令 
≥9 
PCD在发送完命令之后，PICC返回响应的起始位的第一个调制沿应在FDTA,PICC时出现，FDT的误
差范围为0到0.44μs。 
PCD在发送完命令之后，应能在FDTA,PICC（误差范围-1/fc到0.4μs+1/fc）时间收到PICC响应的开始，
并应忽略PICC在FDTA,PICC,MIN-128/fc时间内返回的任何响应。 
对于WUPA、SELECT和ANTICOLLISION命令，PICC应准确地在FDTA,PICC,MIN（n=9时的FDTA,PICC）
时返回响应，PCD在等待超过FDTA,PICC,MIN时间后，如果收到响应，应视为超时错误。

---
**[p22]**

JR/T 0025.11—2013 
 
16 
7.2.1.2 FDTB, PICC 
对于TypeB，FDTB,PICC是从PCD命令的EoS结束到PICC响应的SoS开始之间的时间间隔，为TR0与
TR1之和，如图16所示。 
 
图16 FDTB, PICC 
FDTB,PICC,MIN（=TR0MIN+TR1MIN）定义为从PCD命令结束到PICC响应的SoS开始，PICC应需等待的
最少时间。在命令的EoS后，PCD应能在至少等待FDTB,PICC,MIN时间后收到PICC响应的SoS；PICC应在
收到PCD命令的EoS后，至少等待FDTB,PICC,MIN时间，方可发送响应的SoS。 
7.2.1.3 FDTPICC,MAX 
从PCD命令结束后，到PICC响应开始的最长等待时间（FDTPICC,MAX）被定义为帧等待时间（FWT）。
对于Type A和Type B，FWT的定义是通用的，分别定义为FDTA,PICC和FDTB,PICC的最大值（WUPA、
SELECT、ANTICOLLISION、RATS和WUPB命令除外）。FWT按如下公式计算： 
FWT=（256×16/fc）×2FWI 
其中，FWI的取值范围是0到14。Type B的FWI在ATQB中，Type A的FWI在ATS的接口字节TB（1）
中。例如，当FWI=0时，FWT≈302µs；FWI=7时，FWT≈39ms。 
PCD和PICC应遵循以下规则： 
—— 除WUPA、SELECT、ANTICOLLISION、RATS 和WUPB 命令外，PCD 等待PICC 响应的时
间至少应为FWT+∆FWT。如果在此时间内没有收到PICC 的响应，则应认为发生了超时错误。
∆FWT 的取值见附录A； 
—— 除WUPA、SELECT、ANTICOLLISION、RATS 和WUPB 命令外，PICC 应在PCD 命令结束
后的FWT 时间内发起响应； 
—— PCD 应支持FWT 小于或等于FWTMAX 的PICC，FWTMAX 的取值见附录A； 
—— PICC 的FWT 最大值应为FWTMAX。 
对于Type A的RATS命令，PICC应在激活帧等待时间（FWTACTIVATION）内开始响应。PCD应在
FWTACTIVATION时间内收到PICC的响应，如果未收到则认为发生超时错误。FWTACTIVATION的取值见附录
A。 
对于Type B的WUPB命令，PICC应在FWTATQB时间内开始响应。PCD应在FWTATQB时间内收到PICC
的响应，如果未收到则认为发生超时错误。FWTATQB的取值见附录A。 
7.2.1.4 tnn,min 
tnn,min是PICC在发送响应前不应产生任何可察觉扰动的最小时间周期。 
对于Type A，tnn,min被定义为FDTA,PICC-（FDTA,PICC,MIN-128/fc）和tnn两者中的最小值。对tnn,min的计
量到PICC响应的SoF开始为止，如图17所示。

---
**[p23]**

JR/T 0025.11—2013 
17 
 
图17 Type A 的tnn,min 
对于Type B，tnn,min被定义为TR0-TR0MIN和tnn两者中的最小值。TR0MIN是PCD的必备值，对tnn,min的
计量到TR1开始为止，如图18所示。 
 
图18 Type B 的tnn,min 
tnn的取值见附录A。tnn,min定义中“任何可察觉扰动”的具体值不在本部分的此版本中定义。

---
**[p24]**

JR/T 0025.11—2013 
 
18 
7.2.2 从PICC 到PCD 的帧延迟时间 
从PICC响应结束到PCD新命令开始之间的时间间隔，定义为从PICC到PCD的帧延迟时间（FDTPCD）。 
7.2.2.1 FDTA, PCD 
对于Type A，FDTA,PCD是从PICC传输的最后一个调制信号开始，到PCD下一个命令的SoF中低电平
的开始为止的时间间隔，如图19所示。 
 
（a）最后一位为逻辑1 
 
（b）最后一位为逻辑0 
图19 FDTA, PCD 
7.2.2.2 FDTB, PCD 
对于Type B，FDTB,PCD是从PICC传输的EoS开始起，到PCD传输的SoS开始为止的时间间隔，如图
20所示。 
 
图20 FDTB, PCD 
7.2.2.3 FDTPCD,MIN 
FDTPCD,MIN是从PICC响应结束到PCD发送一个新命令的开始，PCD应等待的最少时间（除了PICC
在RATS和ATTRIB命令的响应中指明需要保护时间（SFGT））。FDTPCD,MIN对于Type A和Type B是通
用的，定义为FDTA,PCD和FDTB,PCD的最小值。FDTPCD,MIN的取值见附录A。

---
**[p25]**

JR/T 0025.11—2013 
19 
PICC响应结束之后，PCD应至少等待FDTPCD,MIN时间方可发送新的命令；PICC响应结束之后，PICC
应能在FDTPCD,MIN时间后接收新的PCD命令的开始。 
如果PICC在FDTPCD,MIN之前收到新的PCD命令的开始，可认为是传输错误。 
7.2.2.4 SFGT 
对于Type A，SFGT是PICC在发送完ATS后到准备好接收下一个命令之前所需要的保护时间；对于
Type B，SFGT是PICC在发送完ATTRIB响应后到准备好接收下一个命令之前所需要的保护时间。 
使用下列公式计算SFGT： 
SFGT = （256×16/fc）× 2SFGI  
其中，SFGI的范围是1到14。如果PICC返回的SFGI为零或没有返回，则不需要SFGT而只使用
FDTPCD,MIN。对于Type A，PICC在ATS中的接口字节TB（1）中返回SFGI，对于Type B，PICC在ATQB
中返回SFGI。 
PCD和PICC应遵循以下规则： 
—— 如果PICC 返回非零的SFGI，在PICC 发送ATS（Type A）或ATTRIB 响应（Type B）后，
PCD 应至少等待SFGT+∆SFGT 时间，再发送下一条命令； 
—— 如果PICC 返回非零的SFGI，在PICC 发送ATS（Type A）或ATTRIB 响应（Type B）后，
PICC 应能接收在SFGT 时间后的PCD 新命令的开始。如果在SFGT 时间内收到PCD 新命令
的开始，PICC 可认为发生传输错误。∆SFGT 的取值见附录A； 
—— 如果PICC 返回的SFGI 为0 或者没有返回SFGI，在PICC 发送ATS（Type A）或ATTRIB 响
应（Type B）后，PCD 应至少等待FDTPCD,MIN 时间，再发送新的命令； 
—— 如果PICC 返回的SFGI 为0 或者没有返回SFGI，在PICC 发送ATS（Type A）或ATTRIB 响
应（Type B）后，PICC 应能接收在FDTPCD,MIN 时间后的PCD 新命令的开始。如果在FDTPCD,MIN
时间内收到PCD 新命令的开始，PICC 可认为发生传输错误。 
7.2.3 小结 
本条给出了帧延迟时间（FDT）的最小值和最大值，具体见表4。 
表4 FDT 时间 
 
最小值 
最大值 
FDTA,PCD 
FDTPCD,MIN 
N/A 
FDTA,PICC 
FDTA,PICC（n=9） 
对于WUPA、ANTICOLLISION、和SELECT 命令，
为FDTA,PICC（n=9） 
对于RATS 命令，为FWTACTIVATION 
对于其它Type A 命令为FWT 
FDTB,PCD 
FDTPCD,MIN 
N/A 
FDTB,PICC 
TR0MIN+TR1MIN 
对于ATQB，为FWTATQB 
对于其它Type B 命令，为FWT 
8 Type A–命令与响应 
本章说明了在轮询、冲突检测、激活和移出过程中PCD可用的Type A命令。 
8.1 Type A–命令集 
表5列出的命令适用于PCD与Type A的PICC之间的通讯，与所有这些命令对应的PICC的响应也同时
列出。本章将详细介绍这些PCD命令格式和PICC的响应格式。 
表5 Type A 的命令集 
PCD 命令 
PICC 响应 
WUPA 
ATQA

---
**[p26]**

JR/T 0025.11—2013 
 
20 
ANTICOLLISION CL1 
UID CL1 
ANTICOLLISION CL2 
UID CL2 
ANTICOLLISION CL3 
UID CL3 
SELECT CL1 
SAK 
SELECT CL2 
SAK 
SELECT CL3 
SAK 
HLTA 
— 
RATS 
ATS 
要求： 协议错误 
PCD 
PICC 
8.1.1.1 PCD 应将任何以有效帧传输（无传输错
误）但编码规则与本部分不兼容的PICC 响应视为
协议错误 
8.1.1.2 PICC 应将任何以有效帧传输（无传输
错误）但编码规则与本部分不兼容的PCD 命令视
为协议错误 
8.2 Type A–CRC_A 
在表5中列出的部分命令使用CRC进行差错校验。CRC_A是用来对k个数据位的数据进行差错校验
的，这k个数据位是由命令内所有数据位组成。由于所有使用CRC_A的命令以字节编码，因此k是8的整
数倍。 
图21说明了标准帧中命令和CRC_A所处的位置。其中CRC_A1是最低有效字节，CRC_A2是最高有
效字节。 
 
图21 CRC_A 在标准帧命令中的位置 
要求： CRC_A 
PCD 和PICC 
8.2.1.1 当标准帧中包含CRC_A 时，CRC_A 应插入到帧中数据位的最后一个奇偶校验位之后。
每个CRC_A 字节后应跟随一个奇偶校验位。短帧不需要CRC_A 
8.2.1.2 CRC_A 如ISO/IEC 13239 中定义，但其寄存器初始值应为‘6363’并且计算后寄存器值
不应取反 
8.3 WUPA 
WUPA命令用于PCD检测工作场内的Type A PICC。 
8.3.1 WUPA 命令 
WUPA命令采用短帧格式传输，命令的编码格式见表6。 
表6 WUPA 短帧编码 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
1 
0 
1 
0 
0 
1 
0 
WUPA 
8.3.2 WUPA 响应（ATQA） 
当PCD发出WUPA请求时，一张Type A PICC将根据其状态返回两字节长度的ATQA。ATQA采用不
包含CRC_A字节的标准帧传输，其编码格式见表7和表8。

---
**[p27]**

JR/T 0025.11—2013 
21 
表7 ATQA 的Byte 1 编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
0 
0 
 
 
 
 
 
 
UID 长度：1 级（4 字节） 
0 
1 
 
 
 
 
 
 
UID 长度：2 级（7 字节） 
1 
0 
 
 
 
 
 
 
UID 长度：3 级（10 字节） 
1 
1 
 
 
 
 
 
 
禁止 
 
 
0 
 
 
 
 
 
预留 
 
 
 
1 
0 
0 
0 
0 
位帧防冲突 
 
 
 
0 
1 
0 
0 
0 
位帧防冲突 
 
 
 
0 
0 
1 
0 
0 
位帧防冲突 
 
 
 
0 
0 
0 
1 
0 
位帧防冲突 
 
 
 
0 
0 
0 
0 
1 
位帧防冲突 
其它数值 
禁止 
表8 ATQA 的Byte 2 编码 
b8 
b7 
B6 
b5 
b4 
b3 
b2 
b1 
说明 
0 
0 
0 
0 
 
 
 
 
预留 
 
 
 
 
x 
X 
x 
x 
任意值 
要求： PCD对ATQA的处理 
PCD 
8.3.2.1 PCD 应忽略PICC 返回的ATQA 中Byte 2 的最低有效半字节（b4-b1） 
要求： UID长度 
PCD 
PICC 
8.3.2.2 PCD 应能成功恢复长度为4、7 或者10
字节的UID 
8.3.2.3 PICC 应拥有一个长度为4、7 或者10
字节的UID。UID 应为固定值或为PICC 动态生
成的随机数 
要求： 随机UID 
PICC 
8.3.2.4 随机UID 应只在POWER-OFF 状态转换到IDLE 状态时生成 
8.3.2.5 随机UID 的长度应为4 个字节 
8.4 ANTICOLLISION 
ANTICOLLISION命令用于获得一张Type A PICC完整的UID，并检测工作场内是否存在多张Type A 
PICC。 
8.4.1 ANTICOLLISION 命令 
ANTICOLLISION命令采用不含CRC_A字节的标准帧传输，其编码格式见表9。 
表9 ANTICOLLISION 命令的编码 
Byte 1 
Byte 2 
SEL 
‘20’ 
SEL编码格式见表10。 
表10 SEL 的编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
1 
0 
0 
1 
0 
0 
1 
1 
‘93’：防冲突串联级别1 
1 
0 
0 
1 
0 
1 
0 
1 
‘95’：防冲突串联级别2

---
**[p28]**

JR/T 0025.11—2013 
 
22 
1 
0 
0 
1 
0 
1 
1 
1 
‘97’：防冲突串联级别3 
1 
0 
0 
1 
除了以上所列的其它值 
禁止 
ANTICOLLISION命令中的SEL字节定义了UID请求的串联级别。 
8.4.2 ANTICOLLISION 响应（UID CLn） 
当PCD发出ANTICOLLISION命令时，所有在工作场内的PICC都会响应被请求UID的串联级别（UID 
CLn，其中n = 1，2或3），Type A PICC的UID长度可以是4、7或10字节。响应信息的长度固定为5字
节，其编码取决于SEL的值和UID的长度。响应信息采用无CRC_A的标准帧传输，其编码格式见表11。 
表11 UID CLn 
SEL 
UID 长度 
响应（UID CLn） 
‘93’ 
4 
UID CL1: 
uid0 
uid1 
uid2 
uid3 
BCC 
‘93’ 
>4 
UID CL1: 
CT 
uid0 
uid1 
uid2 
BCC 
‘95’ 
7 
UID CL2: 
uid3 
uid4 
uid5 
uid6 
BCC 
‘95’ 
>7 
UID CL2: 
CT 
uid3 
uid4 
uid5 
BCC 
‘97’ 
10 
UID CL3: 
uid6 
uid7 
uid8 
uid9 
BCC 
说明： 
—— CT 是值为‘88’的串联标签。使用CT 的目的是为了使该卡能与较短UID 长度的卡产生一个
冲突。因此，1 级UID 的uid0 和2 级UID 的uid3 的值不能是‘88’； 
—— BCC 是UID CLn 的校验字节，为前4 个字节的异或值； 
—— uidn 是UID 的第n 个字节，其中uid0 是最高有效字节。 
要求： PCD对BCC的处理 
PCD 
8.4.2.1 PCD 应校验UID 各串联级别的BCC。PCD 应把BCC 错误视为传输错误 
8.5 SELECT 
SELECT命令通过使用Type A PICC的UID来选择该PICC。 
8.5.1 SELECT 命令 
SELECT命令采用带有CRC_A的标准帧传输，其格式见表12。 
表12 SELECT 的编码 
Byte 1 
Byte 2 
Byte 3 – 7 
SEL 
‘70’ 
UID CLn 
 
SEL 字节的编码格式见表13。 
表13 SEL 的编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
1 
0 
0 
1 
0 
0 
1 
1 
‘93’：选择串联级别1 
1 
0 
0 
1 
0 
1 
0 
1 
‘95’：选择串联级别2 
1 
0 
0 
1 
0 
1 
1 
1 
‘97’：选择串联级别3 
1 
0 
0 
1 
其它值 
禁止 
UID CLn的编码取决于SEL的值和UID的长度，其格式与ANTICOLLISION响应的格式相同，相关格
式见表11。 
8.5.2 SELECT 确认响应（SAK） 
当PICC接收到SELECT命令时，如果命令中的数据位（即UID CLn）和PICC的UID CLn完全相匹配，
则PICC回送SAK。SAK的长度为1个字节，使用带有CRC_A的标准帧传输。SAK的具体编码格式见表14。

---
**[p29]**

JR/T 0025.11—2013 
23 
表14 SAK 编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
x 
x 
 
 
 
 
 
 
任意值 
 
 
x 
 
 
 
 
 
如果b6 = 1，则PICC 遵循JR/T 0025.8 第8 章 
 
 
 
x 
x 
 
 
 
任意值 
 
 
 
 
 
x 
 
 
串联位：如果b3 = 1，则UID 不完整 
 
 
 
 
 
 
x 
x 
任意值 
要求： PICC遵循JR/T 0025.8第8章 
PCD 
PICC 
8.5.2.1 PCD 应支持遵循JR/T 0025.8 第8 章的
PICC 
PCD可支持不遵循JR/T 0025.8第8章的PICC 
8.5.2.2 当UID 是完整的（i.e. b3=0）PICC 应
应通过设置SAK 的b6=1 向PCD 指出自己遵循
JR/T 0025.8  
8.5.2.3 对于b3=(1)b，PCD 应忽略任何PICC 返
回SAK 中的任何其它位的值 
     对于b3=(0)b, PCD应解释b6，并忽略SAK
中的剩余的其它位的值 
 
8.6 HLTA 
HLTA命令用于使处于轮询和移出过程中的PICC返回IDLE状态。 
8.6.1 HLTA 命令 
HLTA命令包含两个字节，采用带有CRC_A的标准帧传输，其格式见表15。 
表15 HLTA 编码 
Byte 1 
Byte 2 
‘50’ 
‘00’ 
8.6.2 HLTA 响应 
PICC对HLTA命令不做任何响应，PCD总是假设PICC已经确认收到HLTA命令。 
要求： HLTA响应 
PCD 
PICC 
8.6.2.1 PCD 应始终认为HLTA 命令被确认接
收 
8.6.2.2 PICC 应不响应HLTA 命令 
8.7 选择应答请求（RATS） 
PCD在协议激活过程中使用RATS命令和PICC协商通讯的最大帧长度（FSD和FSC）、帧等待时间
（FWT）和启动帧保护时间（SFGT）。 
8.7.1 RATS 命令 
RATS命令使用带有CRC_A的标准帧进行传输，其格式见表16。 
表16 RATS 的编码 
Byte 1 
Byte 2 
‘E0’ 
PARAM 
PARAM（参数字节）包含两部分，见表17。 
表17 PARAM 的格式 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
x 
x 
x 
x 
 
 
 
 
FSDI 
 
 
 
 
x 
x  
x 
x 
CID

---
**[p30]**

JR/T 0025.11—2013 
 
24 
PARAM的最高有效半字节b8到b5为接近式耦合设备帧长度整数（FSDI），它用于编码接近式耦合
设备帧长度（FSD）。FSD和FSDI的编码对应关系见表18。 
表18 FSDI 到FSD 的转换 
FSDI 
‘0’ 
‘1’ 
‘2’ 
‘3’ 
‘4’ 
‘5’ 
‘6’ 
‘7’ 
‘8’ 
‘9’-‘F’ 
FSD（bytes） 
16 
24 
32 
40 
48 
64 
96 
128 
256 
预留 
要求： FSDIMIN 
PCD 
8.7.1.1 PCD 应设置FSDI 为FSDIMIN。FSDIMIN 的取值见附录A 
要求： PICC对FSDI预留值的处理 
PICC 
8.7.1.2 当接收到的FSDI 的值为‘9’-‘F’时，PICC 应按照FSDI 为‘8’处理 
PARAM的最低有效半字节b4到b1命名为卡标识符（CID），它定义了已定位的、在0-14之间的PICC
逻辑号（不允许CID=15）。PCD设置CID为0表示每次仅支持对一张PICC进行定位。 
要求： 支持的CID 
PCD 
PICC 
8.7.1.3 PCD 应不使用CID，设置b1-b4 的值为
（0000）b 
8.7.1.4 PICC 应接受CID 值为0-14 的RATS
命令。 
 PICC可忽略RATS中的CID值，并在TC（1）
中指明不支持CID 
8.7.2 RATS 响应（ATS） 
PICC使用ATS响应RATS命令。ATS使用带有CRC_A的标准帧进行传输，ATS结构定义见表19。 
表19 ATS 结构 
Byte 1 
Byte 2 
Byte 3 
Byte 4 
Byte 5 
Byte 6 – 6+k-1 
TL 
T0 
TA（1） 
TB（1） 
TC（1） 
T1…Tk 
长度字节TL之后按照如下顺序紧跟一串变长字节的信息： 
—— 格式字节T0； 
—— 接口字节TA（1），TB（1），TC（1）； 
—— 历史字节T1-Tk。 
8.7.2.1 长度字节TL 
长度字节TL是必备的，它规定了ATS（包括TL自身）的长度，不包括两个CRC_A字节。 
要求： ATS的长度字节TL 
PCD 
PICC 
 
8.7.2.1.1 ATS 的第一个字节TL 指定ATS（包
括TL）的长度 
8.7.2.1.2 PCD 应能支持PICC 返回TL 值不大
于20 的ATS 
PCD可支持PICC返回TL值大于20的ATS 
8.7.2.1.3 TL 值不应大于20 
8.7.2.2 格式字节T0 
格式字节T0的编码格式见表20。 
表20 T0 编码格式 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
0 
 
 
 
 
 
 
 
预留 
 
x 
 
 
 
 
 
 
b7 为1 时，TC（1）被传输

---
**[p31]**

JR/T 0025.11—2013 
25 
 
 
x 
 
 
 
 
 
b6 为1 时，TB（1）被传输 
 
 
 
x 
 
 
 
 
b5 为1 时，TA（1）被传输 
 
 
 
 
x 
x 
x 
x 
FSCI 
T0的最低有效半字节位b4-b1为FSCI，它用于编码FSC。FSC和FSCI的编码对应关系见表21。缺省
FSCI值为2，即FSC为32字节。 
表21 FSCI 到FSC 的转换 
FSCI 
‘0’ 
‘1’ 
‘2’ 
‘3’ 
‘4’ 
‘5’ 
‘6’ 
‘7’ 
‘8’ 
‘9’-‘F’ 
FSC（bytes） 
16 
24 
32 
40 
48 
64 
96 
128 
256 
预留 
要求： FSCIMIN 
PICC 
8.7.2.2.1 PICC 应设置FSCI 大于或等于FSCIMIN，FSCI 最大值是8。FSCIMIN 见附录A 
要求： PCD对FSCI预留值的处理 
PCD 
8.7.2.2.2 当FSCI 的值为‘9’-‘F’时，PCD 应按照FSCI 为‘8’处理 
要求： ATS的格式字节T0 
PCD 
PICC 
8.7.2.2.3 PCD 应支持PICC 返回包含T0、TA
（1）、TB（1）和TC（1）的ATS。如果ATS 缺
少T0、TA（1）、TB（1）和TC（1）中的一个
或者多个，则PCD 使用本条指定的缺省值 
8.7.2.2.4 TA（1）、TB（1）和TC（1）应包
含在ATS 中，并在T0 中指示 
8.7.2.3 接口字节TA（1） 
接口字节TA（1）传送了PICC支持的位速率能力信息，其编码格式见表22。位b7-b5编码了从PICC
到PCD的PICC位速率能力（DPICC→PCD ），其缺省值为（000）b（DPICC→PCD = 1）。位b3-b1编码了从PCD
到PICC的PICC位速率能力（DPCD→PICC），其缺省值为（000）b（DPCD→PICC = 1）。 
表22 TA（1）编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
x 
 
 
 
 
 
 
 
如果b8=1，则仅支持两个方向上相同的位速率除
数D（（DPICC→PCD） = （DPCD→PICC）） 
如果b8=0，则支持每个方向上不同的位速率除数
D 
 
x 
 
 
 
 
 
 
如果b7=1，则支持DPICC→PCD = 8 
 
 
x 
 
 
 
 
 
如果b6=1，则支持DPICC→PCD = 4 
 
 
 
x 
 
 
 
 
如果b5=1，则支持DPICC→PCD = 2 
 
 
 
 
0 
 
 
 
预留 
 
 
 
 
 
x 
 
 
如果b3=1，则支持DPCD→PICC = 8 
 
 
 
 
 
 
x 
 
如果b2=1，则支持DPCD→PICC = 4 
 
 
 
 
 
 
 
x 
如果b1=1，则支持DPCD→PICC = 2 
要求： ATS中的TA（1） 
PCD 
PICC 
8.7.2.3.1 PCD 应支持双向的106kbits/s 的位速
率 
PCD可支持位速率大于106kbits/s 
8.7.2.3.2 PICC 应设置TA（1）的b1-b3、b5-b7
为0，即PICC 仅支持两个方向都采用106kbits/s
的位速率 
8.7.2.4 接口字节TB（1）

---
**[p32]**

JR/T 0025.11—2013 
 
26 
接口字节TB（1）传送了定义帧等待时间（FWT）和启动帧保护时间（SFGT）的信息，其编码格
式见表23。 
表23 TB（1）编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
x 
x 
x 
x 
 
 
 
 
FWI 
 
 
 
 
x 
x 
x 
x 
SFGI 
最高有效半字节b8-b5称为FWI（帧等待时间整数），它用于编码FWT。FWI缺省值为4，即FWT
的值为4.8ms。 
要求： ATS的接口字节TB（1） 
PICC 
8.7.2.4.1 PICC 应设置FWI 不大于FWIMAX。FWIMAX 的取值见附录A 
TB（1）的最低有效半字节b4-b1为SFGI，它用于编码SFGT。SFGI缺省值为0。 
要求： ATS的接口字节TB（1） 
PCD 
PICC 
8.7.2.4.2 PCD 应支持SFGI 小于或等于
SFGIMAX 的PICC 
PCD可支持SFGI大于SFGIMAX的PICC 
8.7.2.4.3 PICC 应设置SFGI 小于或等于
SFGIMAX，SFGIMAX 的取值见附录A 
8.7.2.5 接口字节TC（1） 
接口字节TC（1）指出PICC是否支持NAD和CID。TC（1）的编码格式见表24。 
表24 TC（1）编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
0 
0 
0 
0 
0 
0 
 
 
预留 
 
 
 
 
 
 
x 
 
如果b2=1，则支持CID 
 
 
 
 
 
 
 
x 
如果b1=1，则支持NAD 
位b2和b1被PICC用于定义头域中支持的可选字段。 
要求： ATS的接口字节TC（1） 
PCD 
PICC 
8.7.2.5.1 PCD 应不使用CID 和NAD，并应忽
略PICC 返回TC（1）中的b1-b2 的任何值 
PICC可支持CID和NAD 
8.7.2.6 历史字节 
历史字节T1-Tk可选，PICC用它来指明一般信息。 
要求： ATS的历史字节 
PCD 
PICC 
8.7.2.6.1 PCD 应允许PICC 发送最多15 个历史
字节 
PCD 可支持ATS 包含的历史字节超过15 个 
8.7.2.6.2 PICC 发送的历史字节应不多于15
个 
9 Type B–命令与响应 
本章说明了在轮询、冲突检测、激活和移出过程中PCD 可用的Type B 命令。命令与响应均按7.1.3
所规定的帧进行传输。 
9.1 Type B–命令集 
表25列出了PCD与Type B PICC之间进行通讯的命令，所有命令和响应都使用7.1.3定义的包含
CRC_B的帧格式进行通讯。

---
**[p33]**

JR/T 0025.11—2013 
27 
表25 Type B 的命令集 
 
要求： 协议错误 
 
9.2 Type B–CRC_B 
在表25中列出的所有命令使用CRC进行差错校验。CRC_B是用来对k个数据位的数据进行差错校验
的，这k个数据位是由命令内所有数据位组成。由于所有命令以字节编码，因此k是8的整数倍。 
图22说明了帧中命令和CRC_B所处的位置。其中CRC_B1是最低有效字节，CRC_B2是最高有效字
节。 
 
图22 CRC_B 在帧中的位置 
要求： CRC_B 
PCD 和PICC 
9.2.1.1 两个CRC_B 字节应位于帧中的数据字节之后 
9.2.1.2 CRC_B 如ISO/IEC 13239 中定义，寄存器的初始值应为‘FFFF’ 
9.3 WUPB 
WUPB命令被PCD用于检测工作场内的Type B PICC。 
9.3.1 WUPB 命令 
WUPB命令格式见表26。 
表26 WUPB 格式 
Byte 1 
Byte 2 
Byte 3 
‘05’ 
AFI 
PARAM 
 
命令的各部分定义如下。 
9.3.1.1 AFI 编码 
应用族识别符（AFI）用于PCD指明选择的应用族。 
要求： AFI 
PCD 
PICC 
9.3.1.1.1 AFI 应设为‘00’，表示选择所有应
用族  
PICC 可支持一个AFI 不为‘00’的WUPB 命令 
PCD 命令 
PICC 响应 
WUPB 
ATQB 
ATTRIB 
Answer to ATTRIB 
HLTB 
‘00’ 
PCD  
PICC  
9.1.1.1 PCD 应将任何以有效帧传输（无传输错
误）但编码规则与本部分不兼容的PICC 响应视为
协议错误 
9.1.1.2 PICC 应将任何以有效帧传输（无传输
错误）但编码规则与本部分不兼容的PCD 命令视
为协议错误

---
**[p34]**

JR/T 0025.11—2013 
 
28 
9.3.1.2 PARAM 编码 
表27规定了PARAM的编码。 
表27 WUPB 命令的PARAM 编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
0 
0 
0 
 
 
 
 
 
预留 
 
 
 
x 
 
 
 
 
b5=0：PCD 不支持扩展的ATQB 
b5=1：PCD 支持扩展的ATQB 
 
 
 
 
1 
 
 
 
WUPB 
 
 
 
 
 
x 
x 
x 
时间槽个数（N） 
时间槽个数（N）用于JR/T 0025.8第7章中定义的防冲突方案。防冲突方案以时间槽的定义为基础，
要求PICC在时间槽内用最小标识数据进行响应。 
要求： 时间槽个数（N） 
PCD 
PICC 
9.3.1.3 时间槽个数（N）应一直设为（000）b，
以强制所有的PICC 在第一时间槽以ATQB 响应 
PICC可支持一个时间槽个数（N）不为（000）
b的WUPB命令 
PARM编码的b5位用于指示PCD是否支持ATQB扩展字节。ATQB扩展字节是包含在ATQB响应中的
一个可选字节，它被PICC用于对SFGT进行编码。 
要求： 对扩展的ATQB的支持 
PCD 
PICC 
PCD应设置b5=(0)b（表示不支持扩展的ATQB） 9.3.1.4 当对一个b5=0的WUPB 命令进行响应
时，PICC 不应在其ATQB 响应中包含ATQB 扩
展字节 
PICC应接受b5=1的WUPB命令（即支持扩展的
ATQB） 
当对一个b5=1的WUPB命令进行响应时，
PICC可在其ATQB响应中带有或不带有ATQB扩
展字节 
9.3.2 WUPB 响应（ATQB） 
ATQB的格式见表28。 
表28 ATQB 格式 
Byte 1 
Byte 2 – 5 
Byte 6 – 9 
Byte 10 – 13 
‘50’ 
PUPI 
Application Data 
Protocol Info 
ATQB的第13字节是可选字节。如果它没有被使用，ATQB也需由13个字节组成。 
9.3.2.1 PUPI（伪唯一PICC 标识符） 
 
PUPI 在防冲突期间用于区分不同的PICC。 
要求： ATQB中的PUPI 
PICC 
9.3.2.1.1 PUPI 长度应为4 字节，PUPI 应为固定值或为PICC 动态生成的随机数 
9.3.2.1.2 随机产生的PUPI 只应在PICC 从POWER-OFF 状态向IDLE 状态转换时生成 
9.3.2.2 Application Data（应用数据） 
PCD通过应用数据得知PICC上安装的应用。 
要求： 应用数据 
PCD

---
**[p35]**

JR/T 0025.11—2013 
29 
9.3.2.2.1 PCD 应当忽略任何PICC 返回的应用数据的值 
9.3.2.3 Protocol Info（协议信息） 
协议信息指出了PICC所支持的参数，详见表29。 
表29 协议信息格式 
Byte 1 
Byte 2 
Byte 3 
Byte 4（可选） 
Bit_Rate_Capability 
(8bits) 
Max_Frame_Size 
(4 bits) 
Protocol_Type 
(4 bits) 
FWI 
(4 bits) 
ADC 
(2 bits) 
FO 
(2 bits) 
SFGI 
(4 bits) 
RFU 
(4 bits) 
9.3.2.3.1 Bit_Rate_Capability（位速率能力） 
表30规定了PICC支持的位速率。其中，b7-b5编码了从PICC到PCD方向的PICC的位速率能力
（DPICC→PCD），该部分取值（000）b 表示DPICC→PCD=1。b3-b1编码了从PCD到PICC方向的PICC的位速
率能力（DPCD→PICC），该部分取值（000）b 表示DPCD→PICC=1。 
表30 PICC 支持的位速率 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
x 
 
 
 
 
 
 
 
b8=1：在两个传输方向上只支持同样的位速率除数
（DPICC→PCD =DPCD→PICC） 
b8=0：在两个方向上支持不同的位速率除数 
 
x 
 
 
 
 
 
 
b7=1：DPICC→PCD = 8 
 
 
x 
 
 
 
 
 
b6=1：DPICC→PCD = 4 
 
 
 
x 
 
 
 
 
b5=1：DPICC→PCD = 2 
 
 
 
 
0 
 
 
 
预留 
 
 
 
 
 
x 
 
 
b3=1：DPCD→PICC = 8 
 
 
 
 
 
 
x 
 
b2=1：DPCD→PICC = 4 
 
 
 
 
 
 
 
x 
b1=1：DPCD→PICC = 2 
要求： PICC支持的位速率 
PCD 
PICC 
9.3.2.3.1.1 PCD 应在两个方向上支持
106kbits/s 的位速率 
PCD可支持更高的位速率 
9.3.2.3.1.2 PICC 应分别设置b7-b5 位、b3-b1
位的值为（000）b，即PICC 仅支持两个方向都
采用106kbits/s 的位速率 
9.3.2.3.2 Max_Frame_Size（最大帧长度） 
Max_Frame_Size用于编码最大的帧长度（FSC），FSC与Max_Frame_Size的对应关系见表31。 
表31 与Max_Frame_Size 对应的FSC 
Max_Frame_Size 
‘0’ 
‘1’ 
‘2’ 
‘3’ 
‘4’ 
‘5’ 
‘6’ 
‘7’ 
‘8’ 
‘9’-
‘F’ 
FSC（bytes） 
16 
24 
32 
40 
48 
64 
96 
128 
256 
预留 
要求： FSCIMIN 
PICC 
9.3.2.3.2.1 PICC 应设置Max_Frame_Size 的值大于等于FSCIMIN，Max_Frame_Size 的最大值为8。
FSCIMIN 的取值见附录A 
要求： PCD对Max_Frame_Size预留值的处理 
PCD 
9.3.2.3.2.2 如果接收到的Max_Frame_Size 值为‘9’-‘F’之间，则PCD 应按照Max_Frame_Size=
‘8’处理

---
**[p36]**

JR/T 0025.11—2013 
 
30 
 
9.3.2.3.3 Protocol_Type（协议类型） 
Protocol_Type指明PICC支持的协议类型及TR2的最小值，参见表32和表33。 
表32 协议类型 
b4 
b3 
b2 
b1 
说明 
0 
 
 
 
预留 
 
X 
x 
 
TR2 最小值 
 
 
 
x 
含义见表33 
表33 PICC 支持的协议类型 
b1 
说明 
1 
PICC 遵循JR/T 0025.8第8章 
0 
PICC 不遵循JR/T 0025.8 第8 章 
要求： PICC支持的Type B协议类型 
PCD 
PICC 
9.3.2.3.3.1 PCD 应支持声明遵循JR/T 0025.8
第8 章的PICC 
PCD可支持未声明遵循JR/T 0025.8第8章的
PICC 
9.3.2.3.3.2 PICC应声明它支持JR/T 0025.8第
8 章，即Protocol_Type 的b1=1 
Protocol_Type的b2及b3位定义了PICC支持的TR2的最小值，如表34所示 
表34 TR2 最小值编码 
b3 
b2 
说明 
0 
0 
1792/fc（≈ 134 μs） 
0 
1 
3328/fc（≈ 250 μs） 
1 
0 
5376/fc（≈ 403 μs） 
1 
1 
9472/fc（≈ 710 μs） 
要求： TR2最小值编码 
PCD 
PICC 
9.3.2.3.3.3 PCD 应当忽略所有由PICC 返回的
Protocol_Type 的b3、b2 值，并总是把FDTPCD,MIN
值作为TR2 的最小值。关于FDTPCD,MIN 值的定义
请参考附录A 
 
9.3.2.3.3.4 PICC 应设置Protocol_Type 的b3、
b2 为（00）b 
9.3.2.3.4 FWI（帧等待时间整数） 
帧等待时间整数用于定义帧等待时间（FWT）。 
要求： Type B FWI的最大值 
PICC 
9.3.2.3.4.1 PICC 应设置FWI 的值小于或等于FWIMAX。FWIMAX 的定义见附录A 
9.3.2.3.5 ADC（应用数据编码） 
ADC表示被PICC支持的应用数据编码，如下表35定义： 
表35 ADC 编码 
B4 
B3 
说明 
0 
 
RFU

---
**[p37]**

JR/T 0025.11—2013 
31 
 
x 
(0)b： 私有 
(1)b： JR/T0025.8中定义 
 
要求： ADC 
PCD 
9.3.2.3.5.1 PCD 应忽略由PICC 在ADC 中返回的b3 的值 
 
9.3.2.3.6 FO（帧选项） 
PICC支持的帧选项如表36所示。 
表36 PICC 支持的帧选项 
b2 
b1 
说明 
X 
 
b2=1：支持NAD 
 
X 
b1=1：支持CID 
要求： FO 
PCD 
PICC 
9.3.2.3.6.1 PCD 应不使用CID 和NAD，并忽
略PICC 返回的FO 
PICC 可支持CID 和NAD 
9.3.2.3.7 SFGI 启动帧保护时间整数 
可选的ATQB 扩展字节的最高有效半字节b8-b5 用于编码SFGI，PICC 使用SFGI 定义SFGT。SFGI
的缺省值为0。 
要求： SFGI 
PICC 
9.3.2.3.7.1 PICC 应设置SFGI 小于或等于SFGIMAX，SFGIMAX 的取值见附录A 
9.4 ATTRIB 
PCD发送的ATTRIB命令包含了选择PICC所需的信息。PICC在收到一条有效的ATTRIB命令并发送
ATTRIB响应后，PICC仅应按第13章的规定进行响应。 
9.4.1 ATTRIB 命令 
ATTRIB命令的格式见表37。 
表37 ATTRIB 命令格式 
Byte 1 
Byte 2 – 5 
Byte 6 
Byte 7 
Byte 8 
Byte 9 
Byte 10 –（10+k-1） 
‘1D’ 
PUPI 
Param 1 
Param 2 
Param 3 
Param 4 
上层信息域 
9.4.1.1 PUPI 
 
Byte2－Byte5 是PICC 在 ATQB 中发送的PUPI 值。 
要求： ATTRIB命令中的PUPI 
PCD 
PICC 
9.4.1.1.1 PCD 发送的ATTRIB 命令中的PUPI，
应使用PICC 返回的有效ATQB 中的PUPI 
9.4.1.1.2 PICC 应识别其自身的PUPI，并且仅
响应包含自身PUPI 的有效ATTRIB 命令 
9.4.1.2 Param 1 编码 
无论是否使用SoS和EoS，PCD都应使用TR0和TR1的最小值来编码Param 1。Param 1编码格式见表
38。 
表38 ATTRIB 命令中的Param 1 编码

---
**[p38]**

JR/T 0025.11—2013 
 
32 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
x 
x 
 
 
 
 
 
 
TR0 最小值 
 
 
x 
x 
 
 
 
 
TR1 最小值 
 
 
 
 
x 
x 
 
 
禁止SoS/EoS 
 
 
 
 
 
 
0 
0 
预留 
要求： ATTRIB命令中的Param 1编码 
PCD 
PICC 
9.4.1.2.1 PCD 应设置b8、b7 的值为（00）b，
表示必须使用TR0 的缺省最小值TR0MIN 
PICC 可支持b8、b7 的值不为（00）b 
9.4.1.2.2 PCD 应设置b6、b5 的值为（00）b，
表示必须使用TR1 的缺省最小值TR1MIN 
PICC 可支持b6、b5 的值不为（00）b 
9.4.1.2.3 PCD 应设置b4、b3 的值为（00）b，
表示不支持禁止SoS/EoS 
PICC 可支持禁止SoS/EoS 
9.4.1.3 Param 2 编码 
PCD对Param 2的编码见表39。 
表39 ATTRIB 命令中的Param 2 编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
x 
x 
 
 
 
 
 
 
PICC 到PCD 的位速率 
 
 
x 
x 
 
 
 
 
PCD 到PICC 的位速率 
 
 
 
 
x 
x 
x 
x 
Max_Frame_Size 
Param 2的最低有效半字节（b4-b1）用来编码PCD可接收的最大帧长度（FSD）。FSD与
Max_Frame_Size的对应关系见表40。 
表40 FSD 与Max_Frame_Size 的对应关系 
Max_Frame_Size 
‘0’ 
‘1’ 
‘2’ 
‘3’ 
‘4’ 
‘5’ 
‘6’ 
‘7’ 
‘8’ 
‘9’-‘F’ 
FSD（bytes） 
16 
24 
32 
40 
48 
64 
96 
128 
256 
预留 
要求： FSDIMIN 
PCD 
9.4.1.3.1 PCD 应设置Max_Frame_Size 的值为FSDIMIN。FSDIMIN 取值见附录A 
要求： PICC对Max_Frame_Size预留值的处理 
PICC 
9.4.1.3.2 如果PICC 接收到的Max_Frame_Size 为’9’-’F’，按照Max_Frame_Size=’8’处理 
最高有效半字节b8-b5被PCD用于选择位速率，见表41和42。 
表41 Param 2 的b8、b7 编码 
b8 
b7 
说明 
0 
0 
DPICC→PCD = 1 
0 
1 
DPICC→PCD = 2 
1 
0 
DPICC→PCD = 4 
1 
1 
DPICC→PCD = 8 
表42 Param 2 的b6、b5 编码 
b6 
b5 
说明 
0 
0 
DPCD→PICC = 1 
0 
1 
DPCD→PICC = 2

---
**[p39]**

JR/T 0025.11—2013 
33 
1 
0 
DPCD→PICC = 4 
1 
1 
DPCD→PICC = 8 
 
要求： Type B位速率设置 
PCD 
PICC 
PCD可设置大于106kbits/s的位速率，此位速
率应与PICC在ATQB响应中要求的位速率一致 
9.4.1.3.3 如果PCD 在ATTRIB 命令中请求的
位速率与PICC 在ATQB 响应中要求的位速率一
致，则PICC 应使用该位速率 
9.4.1.4 Param 3 编码 
Param 3用于确认协议类型，其编码格式见表43。 
表43 ATTRIB 命令中的Param 3 的编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
0 
0 
0 
0 
 
 
 
 
其他值为预留 
 
 
 
 
0 
0 
0 
1 
PICC遵循JR/T 0025.8第8章 
 
 
 
 
0 
0 
0 
0 
PICC 不遵循JR/T 0025.8 第8 章 
                                              其它值 
预留 
要求： ATTRIB命令中的Param 3的编码 
PCD 
9.4.1.4.1 PCD 应设置最低有效半字节b4-b1 为（0001）b，用来响应遵循JR/T 0025.8 第8 章的PICC 
9.4.1.5 Param 4 编码 
Param 4的编码见表44。 
表44 ATTRIB 命令中的Param 4 编码 
b8 
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
0 
0 
0 
0 
 
 
 
 
预留 
 
 
 
 
x 
x 
x 
x 
CID 
要求： ATTRIB命令中的Param 4的编码 
PCD 
PICC 
9.4.1.5.1 PCD 应不使用CID。Param 4 的最低
有效半字节b4-b1 应设置为（0000）b 
9.4.1.5.2 PICC 应接受不使用CID 的PCD 
PICC可支持CID 
9.4.1.6 Higher layer – INF（上层信息域）  
上层信息域可包含任何能在信息域（INF）中传输的上层命令，信息域的定义见13.1条。 
要求： 上层信息域 
PCD 
PICC 
9.4.1.6.1 PCD 不应在上层信息域中包含上层
的命令 
  在卡片个人化时，PCD 可在上层信息域包含
上层命令 
9.4.1.6.2 无论ATTRIB 命令是否带有上层信
息域，PICC 都应接受 
9.4.2 ATTRIB 响应 
PICC应按照表45定义的格式对任何有效的ATTRIB命令做出应答。有效的ATTRIB命令应答表示
PCD对PICC的选择成功。 
表45 ATTRIB 响应格式 
Byte 1 
Byte 2 –（2+n-1）

---
**[p40]**

JR/T 0025.11—2013 
 
34 
MBLI 
CID 
上层响应域 
Byte 1最低有效半字节b4-b1包含返回的CID。 
要求： ATTRIB响应中的CID 
PICC 
9.4.2.1 当ATTRIB 命令中的CID 为（0000）b 时，ATTRIB 响应中的CID 值应为（0000）b 
最高有效半字节b8-b5编码了最大缓冲长度指数（MBLI）。PICC使用MBLI通知PCD其最大缓冲长
度（MBL），MBL是用下面公式计算： 
MBL = FSC x 2MBLI-1 
其中，MBLI是大于零的整数，如果PICC返回的MBLI = 0，则表示PICC不提供其MBL信息。 
要求： ATTRIB响应中的MBLI 
PCD 
PICC 
9.4.2.2 PCD 应忽略在MBLI 域返回的任何值 
9.4.2.3 在ATTRIB 响应中返回的MBLI 总为
（0000）b 
上层响应域包含了对ATTRIB命令中上层信息域内的上层命令的应答。 
要求： 上层响应域 
PCD 
PICC 
9.4.2.4 PCD 应接受一个上层响应域为空的
ATTRIB 响应 
9.4.2.5 对一个上层信息域为空的ATTRIB 命
令，PICC 应返回一个上层响应域为空的ATTRIB
响应 
对一个带有上层信息域的ATTRIB命令，
PICC可返回一个带有上层响应域的ATTRIB响应 
PICC也可使用空的上层响应域来响应带有
上层信息域的ATTRIB命令，以表示PICC不支持
上层信息域中的上层命令 
9.5 HLTB 
HLTB命令用于将Type B PICC状态设置为HALT状态。 
9.5.1 HLTB 命令 
HLTB命令格式见表46。 
表46 HLTB 命令格式 
Byte 1 
Byte 2-5 
‘50’ 
PUPI 
HLTB命令中的PUPI是PICC在ATQB中返回的PUPI。 
9.5.2 HLTB 响应 
 
HLTB 响应的格式见表47。 
表47 HLTB 响应格式 
Byte 1 
‘00’ 
10 Type A–PICC 状态机 
本章规定了Type A PICC状态机的行为。 
10.1 状态图 
图23显示了Type A PICC的状态图。此状态图考虑了所有由第8章定义的命令引起的可能状态转换。 
以下是对Type A状态机的要求。

---
**[p41]**

JR/T 0025.11—2013 
35 
要求： Type A PICC – 状态机 
PICC 
10.1.1.1 对任何非PROTOCOL 状态，应使用缺省的通讯参数 
10.1.1.2 当检测到传输错误时，PICC 应不发送响应 
在ACTIVE状态，当PICC检测到传输错误时，可返回（0001）b或（0101）b 
10.1.1.3 PICC 应只对本部分中规定的命令做出响应。当检测到协议错误时，PICC 应不发送响应 
10.1.1.4 PICC 应不对任何Type B 命令做出响应 
下列符号应用于图23的状态图： 
 
AC  
 
8.4条定义的任何防冲突命令； 
 
AC CLn  
UID串联级别n的防冲突命令； 
 
SELECT  
8.5条定义的任何选择命令； 
 
SELECT CLn 选择UID串联级别n的选择命令； 
 
ERROR  
一个检测到的传输或协议错误； 
 
 
表示一个本部分定义的PICC状态，此状态总是存在，而与UID的长度无关； 
 
  
表示一个本部分定义的PICC状态，此状态是否存在与UID长度有关； 
 
  
表示一个JR/T 0025.8第7章定义的PICC状态，但不被本部分使用； 
 
 
表示本部分定义并使用的PICC状态转换； 
 
 
表示一个JR/T 0025.8第7章定义的PICC状态转换，但不被本部分使用。

---
**[p42]**

JR/T 0025.11—2013 
 
36 
 
图23 Type A 的PICC 状态图 
10.2 Type A PICC 的状态 
本条说明了PICC不同的状态及状态转换条件。 
10.2.1 POWER-OFF 状态 
当处于POWER-OFF状态时，PICC由于缺少载波能量而未上电。 
当PICC被置于未调制载波中时，它在tP时间内进入IDLE状态。 
当工作场关闭时，PICC在tRESET时间内退回到POWER-OFF状态。此转换没有在图23中显示。 
10.2.2 IDLE 状态 
本条的要求适用于处于IDLE状态的PICC。在IDLE状态，PICC上电并且准备好接收WUPA命令。 
要求： Type A-IDLE状态 
PICC 
10.2.2.1 PICC 应在接收到一条有效的WUPA 命令并且发送其ATQA 后进入READY 状态 
当接收到JR/T 0025.8第7章定义的有效REQA命令并且发送其ATQA后，PICC可从IDLE状态进入

---
**[p43]**

JR/T 0025.11—2013 
37 
READY状态 
10.2.2.2 在收到任何Type B 命令后，PICC 应保持IDLE 状态，并能在未调制载波时间tP 内对一个
WUPA 命令做出响应 
10.2.2.3 PICC 应忽略所有其它的命令和错误，并保持IDLE 状态 
10.2.3 READY 状态 
本条的要求适用于处于READY状态的PICC。在READY状态，ANTICOLLISION命令用于获得PICC
的完整UID。 
要求： Type A-READY状态 
PICC 
10.2.3.1 在接收到有效的ANTICOLLISION CL1 命令并且发送了其UID CL1 后，PICC 应保持
READY 状态 
10.2.3.2 在接收到和其UID CL1 匹配的有效SELECT CL1 命令并发送了其SAK 后，1 级UID 的
PICC应进入ACTIVE状态。PICC应在SAK响应中指明UID是完整的。1级UID的PICC没有 READY’
和READY”状态 
10.2.3.3 在接收到和其UID CL1 匹配的有效SELECT CL1 命令并发送了其SAK 后.，2 级或3 级
UID 的PICC 应进入READY’状态 
10.2.3.4 在所有其它的情况，PICC 应返回到IDLE 状态并不应发送响应至PCD 
10.2.4 READY’状态 
本条的要求适用于处于READY’状态的PICC。READY’状态是一个中间状态，仅2级和3级UID的
PICC存在此状态。在READY’状态，UID的串联级别1已被选择。 
要求： Type A-READY’状态 
PICC 
10.2.4.1 在接收到有效的ANTICOLLISION CL2 命令并发送其UID CL2 后，PICC 应保持READY’
状态 
10.2.4.2 在接收到和其UID CL2 匹配的有效SELECT CL2 命令并发送其SAK 后，2 级UID 的PICC
应进入ACTIVE 状态。PICC 应在其SAK 响应中指示UID 是完整的。2 级UID 的PICC 没有READY”
状态 
10.2.4.3 在接收到和其UID CL2 匹配的有效SELECT CL2 命令并发送其SAK 后，3 级UID 的PICC
应进入READY”状态 
10.2.4.4 在其它情况下，PICC 应返回到IDLE 状态，并不应发送响应至PCD 
10.2.5 READY”状态 
本条的要求适用于处于READY”状态的PICC。READY”状态是一个中间状态，仅3级UID的PICC
存在此状态。在READY”状态，UID的串联级别1和2已被选择。 
要求： Type A-READY” 状态 
PICC 
10.2.5.1 在接收到有效的ANTICOLLISIOIN CL3 命令并发送其UID CL3 后，PICC 应保持READY”
状态 
10.2.5.2 在接收到和其UID CL3 匹配的有效SELECT CL3 命令并发送其SAK 后，3 级UID 的PICC
应进入ACTIVE 状态。PICC 应在SAK 响应中指明UID 是完整的 
10.2.5.3 在其它情况下，PICC 应返回IDLE 状态，并且不应发送响应至PCD 
10.2.6 ACTIVE 状态 
本条的要求适用于处于ACTIVE状态的PICC。在ACTIVE状态，PICC监听RATS命令。 
要求： Type A-ACTIVE 状态

---
**[p44]**

JR/T 0025.11—2013 
 
38 
PICC 
10.2.6.1 在接收到有效的RATS 命令并发送其ATS 后，PICC 应进入PROTOCOL 状态 
10.2.6.2 当检测到传输错误时，PICC 应进入IDLE 状态，并且： 
——不对PCD 发送响应，或者 
——发送（0001）b 或（0101）b 给PCD（之前应有一个SoF） 
在接收到遵循JR/T 0025.8第7章定义的有效HLTA命令后，PICC可进入HALT状态 
10.2.6.3 在其它情况下，PICC 应返回IDLE 状态，并且不应发送响应至PCD 
10.2.7 PROTOCOL 状态 
本条的要求适用于处于PROTOCOL状态的PICC。在PROTOCOL状态，PICC监听所有上层的消息。 
要求： Type A-PROTOCOL状态 
PICC 
10.2.7.1 PICC 应只对第13 章定义的有效块做出响应。PICC 应忽略所有其它的Type A 命令（即
WUPA、AC、SELECT、HLTA 和RATS）和错误 
在接收到遵循JR/T 0025.8 第7 章定义的有效S（DESELECT）请求块后，PICC 可进入HALT 状
态 
11 Type B–PICC 状态机 
本章说明了Type B PICC状态机的行为。 
11.1 状态图 
图24为Type B PICC的状态图。此状态图考虑了所有由第9章定义的命令引起的可能状态转换。 
以下是对状态机的要求。 
要求： Type B PICC状态机 
PICC 
11.1.1.1  在非ACTIVE 状态时，PICC 应使用缺省的通讯参数 
11.1.1.2  当检测到传送错误时，PICC 应不发送响应 
11.1.1.3  PICC 应只对本部分中规定的命令做出响应。当检测到协议错误时，PICC 应不发送响应 
11.1.1.4  PICC 应不响应任何Type A 命令 
下列符号应用于图24的状态图： 
 
ERROR  
一个检测到的传输或协议错误； 
 
 
表示一个本部分定义的PICC状态 ； 
 
  
表示一个JR/T 0025.8第7章定义的PICC状态，但不被本部分使用； 
 
 
表示本部分定义并使用的PICC状态转换； 
 
 
表示一个JR/T 0025.8第7章定义的PICC状态转换，但不被本部分使用。

---
**[p45]**

JR/T 0025.11—2013 
39 
 
图24 Type B PICC 状态图 
11.2 Type B PICC 的状态 
本条说明了PICC不同的状态和它们的转换条件。 
11.2.1 POWER-OFF 状态 
当处于POWER-OFF状态时，PICC由于缺少载波能量而未上电。 
当PICC被置于未调制载波中时，它在tP时间内进入IDLE状态。 
当工作场关闭时，PICC在tRESET时间内退回到POWER-OFF状态。此转换没有在图24中显示。 
11.2.2 IDLE 状态 
本条的要求适用于处于IDLE状态的PICC，在IDLE状态时，PICC上电并准备好接收WUPB命令。 
要求： Type B-IDLE状态 
PICC 
11.2.2.1 在接收到有效WUPB 命令并发送其ATQB 后，PICC 进入READY 状态 
在接收到遵循JR/T 0025.8第7章定义的有效REQB命令并且发送其ATQB后，PICC可进入READY
状态 
11.2.2.2 在接收到任何Type A 命令后，PICC 应保持IDLE 状态并能在未调制载波时间tP 内对
WUPB 命令进行响应 
11.2.2.3 PICC 应忽略所有其它的命令和错误，并保持IDLE 状态 
11.2.3 READY 状态 
本条的要求适用于处于READY状态的PICC，在READY状态，PICC识别ATTRIB命令。当接收到
ATTRIB命令后，PICC进入ACTIVE状态。

---
**[p46]**

JR/T 0025.11—2013 
 
40 
要求： Type B-READY状态 
PICC 
11.2.3.1 如果接收到的有效ATTRIB 命令中的PUPI 与PICC 的PUPI 相匹配，则PICC 在发送了其
ATTRIB 响应后应进入ACTIVE 状态 
11.2.3.2 如果接收到的ATTRIB 命令中的PUPI 与PICC 的PUPI 不匹配，PICC 应该保持READY
状态，不发送任何响应 
11.2.3.3 在接收到有效的WUPB 命令并发送了其ATQB 后，PICC 应保持READY 状态 
在接收到遵循JR/T 0025.8第7章定义的有效REQB命令并发送其ATQB后，PICC可保持READY状
态 
11.2.3.4 在接收到有效的HLTB 命令并发送了其HLTB 响应后，PICC 应进入到HALT 状态 
11.2.3.5 在接收到任何Type A 命令后，PICC 应保持READY 状态或回退到IDLE 状态，并应能在
未调制载波时间tP 内对WUPB 命令进行响应 
11.2.3.6 PICC 应忽略所有其它命令和错误，并保持READY 状态 
11.2.4 ACTIVE 状态 
本条的要求适用于处于ACTIVE状态的PICC，在ACTIVE状态，PICC已进入了上层模式。 
要求： Type B-ACTIVE状态 
PICC 
在接收到遵循JR/T 0025.8第7章定义的有效S（DESELECT）请求块时，PICC可进入HALT状态 
11.2.4.1 在ACTIVE 状态，PICC 应只对在13 章定义的有效块做出响应，并应忽略所有的Type B
命令（即WUPB、HLTB 和ATTRIB）和错误 
11.2.5 HALT 状态 
本条的要求适用于处于HALT状态的PICC，在HALT状态，PICC仅响应WUPB命令。 
要求： Type B-HALT状态 
PICC 
11.2.5.1 在收到有效的WUPB 命令并发送其ATQB 后，PICC 应进入READY 状态 
11.2.5.2 PICC 应忽略所有其它的Type B 命令和错误，并保持HALT 状态 
11.2.5.3 在收到WUPA 命令后，具有固定PUPI 的PICC 应保持HALT 状态或回退到IDLE 状态并
应能在未调制载波时间tP 内对WUPB 命令进行响应 
11.2.5.4 在接收到WUPA 命令后,具有随机PUPI 的PICC 应保持HALT 状态 
12 PCD 处理 
本章详细说明在PCD中执行的功能，包括：轮询、冲突检测、激活和移出过程。用于处理交易的传
输协议在第13章中详细说明，实际的交易处理属于应用层，超出了本部分的范畴。 
本章将PCD视为终端的一个外围设备，终端包含主循环和不同的应用。 
12.1 主循环 
本条描述了完整的终端主循环。终端使用PCD中的功能执行主循环。本条包含两部分内容： PCD
中执行的不同过程和对主循环的要求。 
12.1.1 主循环-描述 
终端和PCD处理如下（见图25）: 
1. 
为了检测在工作场中的PICC，PCD 轮询其支持的不同通讯信号接口（Type A 和Type B 是强
制要求的，其它技术可选）。轮询过程在12.2 条中详细说明； 
2. 
在冲突检测过程中，PCD 确保工作场中仅有单张PICC。如果收到多张PICC 的响应，则PCD
向终端报告一个冲突，复位工作场并重新开始轮询。冲突检测过程在12.3 条中详细说明； 
3. 
如果工作场中仅有一张PICC，则PCD 激活该PICC。激活过程在12.4 条中详细说明；

---
**[p47]**

JR/T 0025.11—2013 
41 
4. 
在PICC 被激活之后，PCD 使用第13 章定义的半双工传输协议，终端应用执行交易。交易处
理位于应用层，超出本部分的范围； 
5. 
当交易完成后，PCD 等待至PICC 移出工作场。移出过程在12.5 条详细说明。当PICC 从工作
场移出后，PCD 复位工作场并等待未调制载波时间tPAUSE（可选），然后重新开始轮询和冲突
检测（可选）。tPAUSE 是一个与实现相关的值。 
 
图25 终端主循环 
12.1.2 主循环-要求 
要求： 与主循环相关的PCD要求 
 
PCD 
12.1.2.1 PCD 在通讯会话期间应该只有一种技术处于激活状态，或者激活Type A 或者激活Type B
（或激活其它可选技术）。除了在12.1.2.2 描述的条件下，PCD 不应混用不同的技术 
12.1.2.2 PCD 应只在轮询期间从一种技术变为另一种 
12.1.2.3 PCD 应使用不同技术交替轮询。一旦在冲突检测过程期间检测到唯一的PICC，PCD 应激
活PICC 以初始化交易处理。在交易处理过程中，PCD 不应发起与其它PICC 的通讯。当交易完成后，
PCD 应继续执行移出过程（除了发生不可恢复错误的情况，见13.3.5.9） 
 
 
12.2 轮询

---
**[p48]**

JR/T 0025.11—2013 
 
42 
本条详细说明PCD如何轮询不同技术的PICC。在轮询期间，PCD发送轮询命令直至收到一个响应。
在一个轮询周期内，PCD将发送所有支持技术的轮询命令。在一种技术被检测到后，PCD应继续轮询其
它技术，至少完成一个轮询周期。 
PCD总是在Type A和Type B之间进行轮询，但也可轮询其它技术。PCD通过发送WUPA和WUPB命
令来轮询Type A和Type B，其它技术的轮询命令未在本部分中定义。如果至少检测到一种技术，则PCD
终止轮询过程。 
轮询过程如图26所示。 
 
图26 轮询 
要求： 轮询 
PCD 
12.2.1.1 PCD 应轮询Type A 和Type B 
PCD可轮询其它技术 
12.2.1.2 PCD 应为每一种支持的技术分配一个轮询标志并初始化为0：TYPE_A=0、TYPE_B=0、
TYPE_O1=0、……、TYPE_ON=0（标记1） 
PCD应使轮询标志对于冲突检测过程可用 
12.2.1.3 PCD 应检查轮询标志TYPE_A 的值（标记2） 
如果TYPE_A不为0，PCD应结束轮询过程，进入冲突检测过程 
如果TYPE_A为0，PCD应在发送WUPA命令之前（标记4）等待未调制载波时间tP（标记3） 
如果PCD收到WUPA命令的任何响应（不管正确与否），PCD应设置TYPE_A为1（标记6），并
应发送HLTA命令（标记7）将PICC置回IDLE状态 
PCD应继续步骤12.2.1.4 
12.2.1.4 PCD 应检查轮询标志TYPE_B 的值（标记8）。 
如果TYPE_B不为0，PCD应结束轮询过程，进入冲突检测过程

---
**[p49]**

JR/T 0025.11—2013 
43 
如果TYPE_B为0，PCD应在发送WUPB命令之前（标记10）等待未调制载波时间tP（标记9） 
如果PCD收到WUPB命令的任何响应（不管正确与否），PCD应设置TYPE_B为1（标记12）   
PCD应继续步骤12.2.1.5 
12.2.1.5 如果PCD 仅支持Type A 和Type B，则PCD 应继续步骤12.2.1.3。否则，PCD 应继续步
骤12.2.1.6 
12.2.1.6 如果PCD 支持其它技术，PCD 应对每一种其它技术X 进行如下处理： 
—— PCD 应检查TYPE_OX 的值（标记13 和标记18） 
—— 如果TYPE_OX 不为0，PCD 应结束轮询过程，进入冲突检测过程 
—— 如果TYPE_OX 为0，则PCD 可发送一个技术X 专有的轮询命令（标记15 和标记20）。
如果技术X 要求，PCD 可在发送技术X 专有的轮询命令之前等待tPOX 时间。tPOX 的取值是
由技术X 决定的、不在本部分中定义。如果技术X 要求，PCD 可在专有轮询命令前后复位
工作场 
—— 专有轮询命令应不同于本部分所定义的WUPA 和WUPB 以及JR/T 0025.8 第7 章所定义的
REQA 和REQB 命令 
—— 如果PCD 检测到技术X，则PCD 应设置TYPE_OX 为1（标记17 和标记22） 
PCD应继续步骤12.2.1.7 
12.2.1.7 如果PCD 支持其它技术，则PCD 在继续步骤12.2.1.3 之前应复位工作场（标记23） 
12.3 冲突检测 
本条详细说明PCD如何确保在工作场内只有一张PICC。当存在多张PICC时，终端不会初始化交易。 
PCD首先检查在轮询过程中是否检测到不同的技术。如果发生这种情况，则向终端报告一个冲突。
如果在轮询过程中只检测到一种技术，则PCD执行这种技术的冲突检测。本部分仅包含Type A和Type B
的冲突检测过程。 
要求： 冲突检测 
PCD 
12.3.1.1 PCD 应检查轮询标志。 
如果有多个轮询标志设置为1，则PCD应向终端报告一个冲突、复位工作场并返回轮询过程。PCD
应在时间tRESETDELAY（从最后轮询命令响应的开始计量）内启动复位PICC 
如果仅有一个轮询标志设置为1，PCD应继续步骤12.3.1.2 
12.3.1.2 如果TYPE_A 设置为1，则PCD 应进入Type A 冲突检测过程（见12.3.2 条）。如果TYPE_B
设置为1，则PCD 应进入Type B 冲突检测过程（见12.3.3 条）。 
如果TYPE_OX设置为1，则PCD可进入技术X的冲突检测过程 
12.3.2 Type A 冲突检测 
本条详细说明PCD如何验证工作场内只有一张Type A PICC。 
当Type A PICC使用曼彻斯特编码同步响应一个WUPA命令时，PCD应能检测Type A PICC在比特级
的冲突（即至少两张以上的Type A PICC同时在一个或多个比特位上传送互补的位模式）。在这种情况
下，位模式被合并、并且在整个（100%）位持续时间内载波以副载波来调制。 
为了验证在工作场是否只有一张Type A PICC，并且检索PICC的UID，PCD应进行如下处理（见图
27）。 
要求： Type A冲突检测 
PCD 
12.3.2.1 PCD 应在发送WUPA 命令（标记1）之前等待未调制载波时间tP（标记0）。 
如果PCD在WUPA命令的响应中检测到一个传输错误，则它应在时间tRESETDELAY（从响应的开始
计量）内继续步骤12.3.2.8 
否则，PCD应继续步骤12.3.2.2

---
**[p50]**

JR/T 0025.11—2013 
 
44 
12.3.2.2 PCD 应发送一个ANTICOLLISION 命令（SEL='93'）（标记3）。 
如果PCD在ANTICOLLISION命令的响应中检测到一个传输错误，则它应在时间tRESETDELAY（从
响应的开始计量）内继续步骤12.3.2.8。否则，PCD应继续步骤12.3.2.3 
12.3.2.3 如果ATQA 表明一个1 级UID, 则PCD 检索到完整的UID（= UID CL1: uid0 uid1 uid2 uid3 
BCC）。PCD 应通过发送一个SELECT 命令（SEL='93',UID CL1）（标记8）将PICC 置为ACTIVE
状态。 
PCD应通过Type A冲突检测过程得出在工作场只有一张Type A PICC的结论，并进入Type A激活
过程 
12.3.2.4 如果ATQA 表明2 级或3 级UID, 则PCD 应在处理串联级别2 之前，首先发送SELECT
命令（SEL=‘93’，UID CL1）（标记6）选择串联级别1 
PCD应通过发送一个ANTICOLLISION命令（SEL=‘95’）（标记7）处理串联级别2 
如果PCD在ANTICOLLISION命令的响应中检测到一个传输错误，则它应在时间tRESETDELAY（从
响应的开始计量）内继续步骤12.3.2.8 
否则，PCD应继续步骤12.3.2.5 
12.3.2.5 如果ATQA 表明2 级UID, 则PCD 检索到完整的UID（=UID CL1：CT uid0 uid1 uid2 BCC；
UID CL2：uid3 uid4.uid5.uid6 BCC） 
PCD应通过发送一个SELECT命令（SEL=‘95’,UID CL2）（标记12）将PICC置为ACTIVE状态 
PCD应通过Type A冲突检测过程得出在工作场只有一张Type A PICC的结论，并进入Type A激活
过程 
12.3.2.6 如果ATQA 表明3 级UID, 则PCD 应在处理串联级别3 前，首先通过发送SELECT 命令
（SEL=‘95’,UID CL2）（标记11）选择串联级别2 
PCD应通过发送一个ANTICOLLISION 命令（SEL='97'）（标记13）处理串联级别3 
如果PCD在ANTICOLLISION命令的响应中检测到一个传输错误，则它应在时间tRESETDELAY（从
响应的开始计量）内继续步骤12.3.2.8 
否则，PCD应继续步骤12.3.2.7 
12.3.2.7 PCD 检索到的完整UID（=UID CL1：CT uid0 uid1 uid2 BCC；UID CL2：CT uid3 uid4 uid5 
BCC；UID CL3：uid6 uid7 uid8 uid9 BCC） 
PCD应通过发送一个SELECT命令（SEL=‘97’，UID CL3）（标记15）将PICC置为ACTIVE状
态 
PCD应通过Type A冲突检测过程得出在工作场只有一张Type A PICC的结论，并进入Type A激活
过程 
12.3.2.8 PCD 应向终端报告一个冲突、复位工作场并返回轮询过程

---
**[p51]**

JR/T 0025.11—2013 
45 
 
图27 Type A 冲突检测 
12.3.3 Type B 冲突检测 
本条详细说明PCD如何验证在工作场中只有一张Type B PICC。

---
**[p52]**

JR/T 0025.11—2013 
 
46 
Type B PICC不同步响应WUPB命令。为检测在工作场中是否有多张Type B PICC，PCD将执行
WUPB命令（N=1）。它强迫所有Type B PICC在首个时间槽响应。如果在工作场内有多张Type B PICC, 
不同步响应将导致传输错误。 
为了验证在工作场是否只有一张Type B PICC，PCD必须如下处理（见图28）。 
要求： Type B冲突检测 
PCD 
12.3.3.1 PCD 应在发送WUPB 命令（标记1）之前等待未调制载波时间tP（标记0） 
如果PCD在WUPB命令的响应中检测到一个传输错误，则PCD应向终端报告一个冲突、复位工作
场并返回轮询过程。它应在时间tRESETDELAY（从响应的开始计量）内复位工作场 
否则，PCD应进入Type B激活过程 
 
图28 Type B 冲突检测 
12.4 激活 
本条详细说明PCD如何激活Type A PICC和Type B PICC。 
12.4.1 Type A 激活 
本条详细说明在得出工作场内只有一张Type A PICC的结论后，PCD如何激活Type A PICC。 
要求： 激活Type A PICC 
PCD 
12.4.1.1 PCD 应发送一个RATS 命令将PICC 从ACTIVE 状态变为PROTOCOL 状态 
12.4.1.2 在发送RATS 并收到有效的ATS 后，PCD 应进入交易处理过程 
12.4.2 Type B 激活 
本条详细说明在得出工作场内只有一张Type B PICC的结论后，PCD如何激活Type B PICC 
要求： 激活Type B PICC 
PCD 
12.4.2.1 PCD 应发送一个ATTRIB 命令将PICC 从READY 状态变为ACTIVE 状态 
12.4.2.2 在PCD 发送ATTRIB 命令并收到有效的ATTRIB 响应后，PCD 应进入交易处理过程 
12.5 移出 
本条详细说明当交易完成后PCD应如何处理，如图29所示。

---
**[p53]**

JR/T 0025.11—2013 
47 
 
图29 Type A PICC 和Type B PICC 的移出过程 
要求： Type A移出过程 
PCD 
12.5.1.1 PCD 应复位工作场，并且等待未调制载波时间tP 
12.5.1.2 PCD 应通过发送WUPA 命令轮询一张Type A PICC。如果PCD 收到任何响应（不管正确
与否），则PCD 应继续步骤12.5.1.3；如果PCD 未收到WUPA 命令的响应，则PCD 应继续步骤12.5.1.4 
12.5.1.3 PCD 应发送一个HTLA 命令将PICC 置回IDLE 状态。发送HTLA 命令后，PCD 在继续
步骤12.5.1.2 之前应等待未调制载波时间tP 
12.5.1.4 PCD 应至多再发送两个WUPA 命令。在最长允许响应时间后，PCD 应在时间
tRETRANSMISSION 内重新发送WUPA 命令。如果PCD 收到任何响应（不管正确与否），则PCD 应继续
步骤12.5.1.3；如果没有收到第三个WUPA 命令的响应，PCD 应向终端报告一个超时错误，并且终
止移出过程 
要求： Type B移出过程 
PCD 
12.5.1.5 PCD 应复位工作场，并且等待未调制载波时间tP 
12.5.1.6 PCD 应通过发送WUPB 命令轮询一张Type B PICC。如果PCD 收到任何响应（不管正确

---
**[p54]**

JR/T 0025.11—2013 
 
48 
与否），则PCD 应继续步骤12.5.1.7；如果PCD 未收到WUPB 命令的响应，则PCD 应继续步骤12.5.1.8 
12.5.1.7 PCD 应等待未调制载波时间tP，再继续步骤12.5.1.6 
12.5.1.8 PCD应至多再发送两个WUPB命令。在最长允许响应时间后，PCD应在时间tRETRANSMISSION
内重新发送WUPB 命令。如果PCD 收到任何响应（不管正确与否），则PCD 应继续步骤12.5.1.7；
如果没有收到第三个WUPB 命令的响应，PCD 应向终端报告一个超时错误，并且终止移出过程 
12.6 异常处理 
本条规定当PICC在非PROTOCOL（Type A）或者非ACTIVE（Type B）状态发生异常，PCD应如
何进行处理。PICC在PROTOCOL（Type A）或ACTIVE（Type B）状态发生异常，PCD的错误处理参
见第13章。 
要求： 异常处理 
PCD 
12.6.1.1 在激活过程中，如果检测到传输错误的响应，并且以下条件全部成立，PCD 应向终端报
告传输错误、复位工作场并且返回轮询过程 
—— 响应封装在至少4 个字符长的帧内 
—— 响应封装在没有多余位的一个帧内（即数据位数是8 的整数倍） 
—— 响应包含一个CRC 并且CRC 是错误的，或者响应封装在一个存在奇偶校验错的帧内 
在上述传输错误响应结束之后，PCD应忽略任何其它传输错误，并在时间tRECOVERY内准备好处理
正确的响应。 
PCD应在时间tRESETDELAY（从错误响应的开始计量）内启动复位PICC。 
附录B包含了一张说明上述处理的流程图 
12.6.1.2 如果检测到协议错误（除了在轮询和移出过程中），PCD 应向终端报告协议错误、复位
工作场并且返回轮询过程。PCD 应在时间tRESETDELAY（从包含协议错误的响应帧的开始计量）内启
动复位PICC 
12.6.1.3 如果检测到超时错误（除了在轮询和移出过程中），PCD 应至多重新发送命令两次。在
命令适用的最长允许响应时间（参见7.2 条）后，PCD 应在时间tRETRANSMISSION 内重新发送命令。如
果在第三次尝试不能收到有效响应，PCD 应向终端报告一个超时错误、复位工作场并且返回轮询过
程。在命令适用的最长允许响应时间后，PCD 应在时间tRESETDELAY 内启动复位PICC 
13 半双工块传输协议 
本章定义了高级数据传输协议。在本章中定义的半双工块传输协议对Type A和Type B是通用的。本
章中定义的块作为帧中数据字节进行传输（如第7章的定义）。 
13.1 块格式 
如表48所示，块格式由一个头域（必备）、一个信息域（可选）和一个尾域（必备）组成。 
表48 块格式 
头域 
信息域 
尾域 
PCB（1 byte） 
[INF] 
EDC（2 bytes） 
13.1.1 块长度 
本条列出了与块的总长度相关的PCD和PICC要求。 
要求： 半双工块格式的总长度 
PCD 
PICC 
13.1.1.1 PCD 发送的块的总长度应小于或等于
FSC（FSC 在协议安装时由PICC 指定） 
13.1.1.2 PICC 发送的块的总长度应小于或等
于FSD（FSD 在协议安装时由PCD 指定） 
13.1.1.3 PCD 应能接受长度小于或等于FSD 个
字节的块。字节数超过FSD 的块应被PCD 视为协
13.1.1.4 PICC 应能接受长度小于或等于FSC
个字节的块。字节数超过FSC 的块应被PICC 视

---
**[p55]**

JR/T 0025.11—2013 
49 
议错误块 
为协议错误块 
13.1.2 头域 
头域是必备的，包含协议控制字节（PCB）（在JR/T 0025.8第8章中定义的CID和NAD未使用）。
协议控制字节（PCB）被用来传送控制数据传输需要的信息。协议定义了三种基本的传输块类型： 
—— I 块用于应用层的信息传送； 
—— R 块用于传送肯定或否定的确认，此确认与最后的接收块有关。R 块不包含INF 域； 
—— S 块用于在PCD 和PICC 之间交换控制信息。两种不同类型的S 块定义如下： 
1） 等待时间延迟（WTX），包含1 字节长的INF 域； 
2） DESELECT，不包含INF 域（本部分未使用）。 
PCB的编码取决于它的类型。I块、R块和S块的编码分别见表49、表50和表51。 
表49 I 块的PCB 编码 
b8  
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
0 
0 
 
 
 
 
 
 
I 块 
 
 
0 
 
 
 
 
 
预留 
 
 
 
X 
 
 
 
 
b5=1：链接 
 
 
 
 
0 
 
 
 
b4=1：跟随CID 
 
 
 
 
 
0 
 
 
b3=1：跟随NAD 
 
 
 
 
 
 
1 
 
必须置为1 
 
 
 
 
 
 
 
x 
块编号 
表50 R 块的PCB 编码 
b8  
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
1 
0 
 
 
 
 
 
 
R 块 
 
 
1 
 
 
 
 
 
必须置为1 
 
 
 
X 
 
 
 
 
b5=0：ACK 
b5=1：NAK 
 
 
 
 
0 
 
 
 
b4=1：跟随CID 
 
 
 
 
 
0 
 
 
必须置为0 
 
 
 
 
 
 
1 
 
预留 
 
 
 
 
 
 
 
x 
块序号 
表51 S（WTX）块的PCB 编码 
b8  
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
1 
1 
 
 
 
 
 
 
S 块 
 
 
1 
1 
 
 
 
 
WTX 
 
 
 
 
0 
 
 
 
b4=1：跟随CID 
 
 
 
 
 
0 
 
 
必须置为0 
 
 
 
 
 
 
1 
 
预留 
 
 
 
 
 
 
 
0 
预留 
13.1.3 信息域（INF） 
信息域是可选的。当出现在I块中时,信息域传送的是应用数据，当出现在S块中时，它传送的是非
应用数据和状态信息。信息域的长度可以通过计算整个块的长度减去头域和尾域的长度来得到。 
 
 
13.1.4 尾域

---
**[p56]**

JR/T 0025.11—2013 
 
50 
尾域包含传输块的错误校验码（EDC）。对于Type A PICC，EDC为在8.2条中定义的CRC_A；对
于Type B PICC，EDC为在9.2条中定义的CRC_B。 
13.1.5 协议错误 
要求： 协议错误 
PCD 和PICC 
13.1.5.1 如果接收到有效帧中的块，其编码不符合本部分规定（例如，PCB 不符合本部分规定），
则应视为一个协议错误 
13.2 帧等待时间延迟 
如果PICC需要比FWT更长的时间来处理接收到的块，应发送一个S（WTX）请求等待时间延迟。S
（WTX）请求包含1个字节长的信息域，如表52所描述。 
表52 S（WTX）请求的信息域编码 
b8  
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
x 
x 
 
 
 
 
 
 
功率水平指示 
 
 
x 
X 
x 
x 
x 
x 
WTXM 
13.2.1 功率水平指示 
两个最高有效位b8和b7编码了功率水平指示。 
要求： 功率水平指示 
PCD 
PICC 
PCD可支持编码不为（00）b的功率水平指示 13.2.1.1 不使用功率水平指示。b8、b7 应置为
（00）b 
13.2.2 WTXM 
低6位b6-b1编码了WTXM，WTXM的范围是1-59。 
PCD通过发送S（WTX）响应确认PICC的S（WTX）请求。响应也包含1个字节长的信息域，信息
域由两部分组成（见表53），其中包含与请求信息中同样的WTXM。 
表53 S（WTX）响应的信息域编码 
b8  
b7 
b6 
b5 
b4 
b3 
b2 
b1 
说明 
0 
0 
 
 
 
 
 
 
预留 
 
 
x 
X 
x 
x 
x 
x 
WTXM 
FWTTEMP根据下面的公式计算: 
FWTTEMP = FWT x WTXM。 
PICC请求的FWTTEMP时间从PCD发送S（WTX）响应之后开始。 
要求： 帧等待时间延迟 
PCD 
PICC 
13.2.2.1 PCD 应接受一个WTXM 取值范围在
1-59 的S（WTX）。当接收到WTXM 值为0 的S
（WTX）时，PCD 应采取异常处理 （协议错误） 。
接收到的WTXM 取值范围在60-63 时，应被当做
59 处理 
13.2.2.2 PICC 应将WTXM 编码为1-59 
13.2.2.3 PCD 应支持帧等待时间延迟小于或等
于FWTMAX。（即 FWTTEMP ≤ FWTMAX） 
13.2.2.4 PICC 应对WTXM 进行编码使
FWTTEMP 小于或等于FWTMAX 
这个要求适用于PICC个人化之后。 PICC在
初始化和个人化阶段可对WTXM进行编码使
FWTTEMP大于 FWTMAX

---
**[p57]**

JR/T 0025.11—2013 
51 
13.2.2.5 PCD 应在S（WTX）响应中使用与S
（WTX）请求中相同的WTXM 
13.2.2.6 S（WTX）响应中的WTXM 值与S
（WTX）请求中的WTXM 值不同时，PICC 应视
为协议错误 
13.2.2.7 在发送S（WTX）响应块回应一个S
（WTX）请求块之后，PCD 持续时间FWTTEMP+
（ Δ FWT×WTXM）等待接收PICC 发送的块。
如果PCD 在此时间内没有接收到PICC 发送的块，
则PCD 应采取异常处理（超时错误） 
13.2.2.8 在接收到PCD 发送的 S（WTX） 响
应块之后，PICC 应在时间FWTTEMP 内开始发送
下一个块 
13.2.2.9 PCD 应仅等待FWTTEMP+（Δ FWT×
WTXM），直至接收到PICC 发送的下一个块或
PCD 采取异常处理 
13.2.2.10 PICC 应仅等待 FWTTEMP 直到
PICC 发送下一个块 
13.3 协议操作 
13.3.1 通用规则 
本条详细说明了半双工传输协议的规则。 
PCD 
PICC 
13.3.1.1 在发送一个块之后, PCD 应切换至接
收模式，在转回传输模式之前等待接收块 
13.3.1.2 在PICC 激活之后, PICC 应等待由
PCD 发送的块 
13.3.1.3 在当前的命令/响应对已经完成或帧等
待时间已经超限（在此时间内未收到响应）之前，
PCD 不应初始化一个新的命令/响应对 
13.3.1.4 只有在接收到PCD 发送的一个有效
块之后，PICC 才能发送块。在响应之后, PICC 应
返回到接收模式 
13.3.2 链接 
当需要传送的数据不适合放在由FSC或FSD各自定义的单个数据块中时，链接功能允许PCD或 
PICC将信息拆分成若干块传送。 
要求： 链接规则 
PCD 和PICC 
13.3.2.1 块的链接由I 块中PCB 的链接位控制。每个设置链接位的I 块必须用R（ACK）块确认 
要求： 链接块的大小 
PCD 
13.3.2.2 当PCD 发送一组链接的I 块，每个指示了链接的块的大小应等于FSC 
链接功能的一个实例如图30中所示。这个例子描述了一个16字节长的字符串分成三个块来传输。它
使用下列的符号： 
—— I（1）x  
设置链接位和块号x 的I 块； 
—— I（0）x  
未设置链接位和带块号x 的I 块（链接的最后一个块）； 
—— R（ACK）x  指示一个肯定确认的R 块。

---
**[p58]**

JR/T 0025.11—2013 
 
52 
 
图30 链接 
13.3.3 块编号规则 
本条详细说明了块的编号规则。 
要求： 块编号规则 
PCD 
PICC 
13.3.3.1 对于当前被激活的PICC，PCD 块编号
应初始化为0 
13.3.3.2 在激活时，PICC 块编号应初始化为1 
13.3.3.3 当接收到一个块编号与当前块编号相
等的正确的I 块或正确的 R（ACK） 块时, PCD 在
发送任意一个块之前，为当前PICC 反转当前块编
号 
13.3.3.4 当接收到一个I 块, PICC 应在接收I
块之后立即反转它的块编号。 
PICC可检查收到的块编号是否不符合PCD
规则，以决定不反转它的内部块编号，也不发送
响应块 
 
13.3.3.5 当接收到一个块编号不等于目前的
PICC 的块编号的R（ACK）块时, PICC 应在接
收R（ACK）块之后立即反转它的块编号。 
PICC可检查收到的块编号是否不符合PCD
规则，以决定不反转它的内部块编号，也不发送
响应块 
13.3.4 块处理规则 
本条详细说明了PCD和PICC的块处理规则。 
要求： PCD和PICC的块处理规则 
PCD 和PICC 
13.3.4.1 第一个块应由PCD 发送 
13.3.4.2 S（WTX）块只能成对使用。一个S（WTX）请求块后应总是跟随一个S（WTX）响应块 
要求：  PCD块处理规则 
PCD

---
**[p59]**

JR/T 0025.11—2013 
53 
13.3.4.3 如果收到的R（ACK）块的块编号与PCD 当前的块编号不相等，并且这个R（ACK）块
是PCD 发送的通知PICC 超时的R（NAK）块的响应，则PCD 应重发最后的I 块 
在任何其它情况下，当收到R（ACK）块的块编号与PCD当前的块编号不相等时，则PCD可直接
向终端报告一个协议错误，或者重发最后的I块 
13.3.4.4 如果PCD 已经重发了一个I 块两次（即相同的I 块发送了3 次）,并且接收到R（ACK）
块的编号与PCD 的当前块编号不相等时,应认为发生协议错误 
13.3.4.5 如果收到R（ACK）块的块编号与PCD 当前的块编号相等，并且PCD 最后所发的I 块指
示链接，则链接应继续；如果PCD 最后所发的I 块未指示链接，则PCD 应视收到R（ACK）块为协
议错误 
13.3.4.6 如果PCD 接收到R（NAK）块，则应视为协议错误 
要求： PICC的块处理规则 
PICC 
13.3.4.7 允许PICC 发送S（WTX）块代替I 块或R（ACK）块。（除了重发I 块或重发R（ACK）
块的情况） 
13.3.4.8 当接收到一个未指示链接的I 块时,PICC 应使用I 块确认 
13.3.4.9 当接收到一个R（ACK）块或一个R（NAK）块，并且它的块编号与PICC 当前的块编号
相等，则：  
—— 如果最后的块是由PICC 所发（即PICC 发送的最后块未得到PCD 的确认），应重发最后的
块 
—— 如果最后的块是由PCD 所发（即PICC 发送的最后块得到PCD 的确认），应发送下一块 
13.3.4.10 当接收到一个R（NAK）块时，如果它的块编号与PICC 当前的块编号不相等，则PICC
应发送一个R（ACK）块 
13.3.4.11 当接收到一个R（ACK）块时，如果它的块编号与PICC 当前的块编号不相等，并且PICC
所发最后的I 块指示了链接，链接应继续 
如果PICC所发最后的I块未指示链接，则PICC可将收到R（ACK）块视为一个协议错误 
13.3.5 异常处理 
当检测到错误时，将尝试以下异常处理。 
要求： PICC异常处理 
PICC 
13.3.5.1 PICC 应检测传输错误（帧错误或EDC 错误）和协议错误（违背协议规则） 
13.3.5.2 PICC 不应尝试错误恢复。当一个传输错误或一个协议错误发生时，PICC 总是保持接收状
态。PICC 不应发送R（NAK）块 
PCD异常处理的目的在于区分PICC响应之前工作场内出现的任何可察觉扰动和PICC所发的带有传
输错误的真实响应。附录B包含了一张说明PCD异常处理的流程图。 
要求： PCD异常处理 
PCD 
13.3.5.3 如果在收到一个未指示链接的块之后，又接收到发生传输错误的块，在以下条件全部成立
的情况下，PCD 应发送R（NAK）块： 
—— 块封装在至少4 个字符长的帧内 
—— 块封装在没有多余位的一个帧内（即数据位数是8 的整数倍） 
—— CRC 不正确或者帧存在奇偶校验错 
在发生上述传输错误的块结束之后，PCD应忽略任何其它传输错误，并在时间tRECOVERY内准备好
处理正确的块

---
**[p60]**

JR/T 0025.11—2013 
 
54 
PCD应在时间tRETRANSMISSION（从发生传输错误块的开始计量）内发送R（NAK）块 
PCD应至多连续发送两次R（NAK）块请求重新传输。如果没有接收到对第二个R（NAK）块的
正确响应, PCD应向终端报告传输错误，并在时间tRESETDELAY（从最后无效响应的开始计量）内按
13.3.5.9的规定继续处理 
13.3.5.4 如果在收到一个未指示链接的块之后，又接收到一个发生协议错误的块，则PCD 应向终
端报告协议错误，并且在时间tRESETDELAY（从发生协议错误响应块的开始计量）内按13.3.5.9 的规定
继续处理 
13.3.5.5 如果在接收到一个未指示链接的块之后，发生了超时错误，PCD 应重发R（NAK）块，
至多发送两次以请求重新传输。PCD 应在tTIMEOUT 和tTIMEOUT+tRETRANSMISSION 之间发送R（NAK）块。
如果没有收到对第二个R（NAK）响应的有效块或者PCD 在连续三个S（WTX）响应块之后检测到
一个超时（即PCD 在每次S（WTX）响应后都未检测到PICC 的正确I 块或R 块，检测三次后，发
生超时错误），PCD 应向终端报告超时错误，然后在tTIMEOUT 和tTIMEOUT+tRESETDELAY 之间按13.3.5.9
的规定继续处理。如果PICC 没有请求帧等待时间延迟（WTX），tTIMEOUT 等于FWT+ΔFWT；否则，
tTIMEOUT 等于（FWT+ΔFWT）×WTXM 
13.3.5.6 如果在收到一个指示了链接的块之后接收到一个发生传输错误的块，在以下条件全部成立
的情况下，PCD 发送的最后一个R（ACK）块应重发： 
—— 块封装在至少4 个字符长的帧内 
—— 块封装在没有多余位的一个帧内（即数据位数是8 的整数倍） 
—— CRC 不正确或者帧存在奇偶校验错 
在发生上述传输错误的块结束之后，PCD应忽略任何其它传输错误，并在时间tRECOVERY内准备好
处理正确的帧 
PCD应在时间tRETANSMISSION（从发生传输错误块的开始计量）内发送R（ACK）块 
PCD应至多连续发送两次R（ACK）块以请求重新传输。如果没有接收到第二个R（ACK）块的
正确响应, PCD应向终端报告传输错误，并且在时间tRESETDELAY（从最后无效响应的开始计量）内按
13.3.5.9的规定继续处理 
13.3.5.7 如果在收到一个指示了链接的块之后接收到一个发生协议错误的块，PCD 应向终端报告
协议错误，并且在时间tRESETDELAY（从发生协议错误响应块的开始计量）内按13.3.5.9 的规定继续处
理 
13.3.5.8 如果在接收到一个指示链接的块之后发生了超时错误，PCD 发送的最后一个R（ACK）
块应重发，最多连续发送两次以请求重新传输。PCD 应在tTIMEOUT 和tTIMEOUT+tRETRANSMISSION 之间发
送R（ACK）块。如果没有收到第二个R（ACK）响应的有效块或者PCD 在连续三个S（WTX）响
应块之后检测到超时（即PCD 在每次S（WTX）响应后都未检测到PICC 的正确I 块或R 块，检测
三次后，发生超时错误），PCD 应向终端报告超时错误，然后在tTIMEOUT 和tTIMEOUT+tRESETDELAY 之间
按13.3.5.9 的规定继续处理。如果PICC 没有请求帧等待时间延迟（WTX），则tTIMEOUT 等于
FWT+ΔFWT；否则，tTIMEOUT 等于（FWT+ΔFWT）×WTXM 
13.3.5.9 如果错误恢复是不可能的，则PCD 应复位工作场 
在这个阶段，需对终端和PCD如何继续处理予以定义，可以（但不限于）： 
—— 等待未调制载波时间tPAUSE，按12.2 条的规定重新开始轮询过程 
—— 按12.5 条的规定继续移出过程 
—— PCD 返回POW-OFF 状态。注意在这种情况下，仅有tRESET的最小值可用

---
**[p61]**

JR/T 0025.11—2013 
55 
附 录 A 
（规范性附录） 
数值 
表A.1列出了本部分内用于表示参数的符号真实数值。 
表A.1 参数数值 
标题 
参数 
PCD 
PICC 
单位 
Min 
 
Max 
Min 
 
Max 
Type A 
FWTACTIVATION 
 
71680 
 
 
65536 
 
1/fc 
Type B 
 
tPCD,S,1 
1280 
 
1408 
1264 
 
1424 
1/fc 
tPCD,S,2 
256 
 
384 
240 
 
400 
1/fc 
tPCD,E 
1280 
 
1408 
1264 
 
1424 
1/fc 
tPICC,S,1 
1264 
 
1424 
1280 
 
1408 
1/fc 
tPICC,S,2 
240 
 
400 
256 
 
384 
1/fc 
tPICC,E 
1264 
 
1424 
1280 
 
1408 
1/fc 
TR0MIN 
 
1024 
 
 
1152 
 
1/fc 
TR1MIN 
 
1152 
 
 
1280 
 
1/fc 
TR1MAX 
 
3328 
 
 
3200 
 
1/fc 
tFSOFF 
0 
 
272 
0 
 
256 
1/fc 
EGTPCD 
0 
 
752 
0 
 
768 
1/fc 
EGTPICC 
0 
 
272 
0 
 
256 
1/fc 
FWTATQB 
 
7680 
 
 
7296 
 
1/fc 
通用 
FWTMAX 
 
4096×2
ΜΑX
FWI
 
 
 
4096×2
ΜΑX
FWI
 
 
1/fc 
∆FWT 
 
384×2FWI 
 
 
 
 
1/fc 
FDTPCD,MIN 
 
6780 
 
 
5376 
 
1/fc 
FSDMIN 
 
256 
 
 
256 
 
—— 
FSCMIN 
 
16 
 
 
32 
 
—— 
SFGIMAX 
 
8 
 
 
8 
 
—— 
∆SFGT 
 
384×2SFGI 
 
 
 
 
1/fc 
FWIMAX 
 
14 
 
 
7 
 
—— 
FSDIMIN 
 
8 
 
 
8 
 
—— 
FSCIMIN 
 
0 
 
 
2 
 
—— 
tnn 
 
 
 
1408 
 
 
1/fc

---
**[p62]**

JR/T 0025.11—2013 
 
56 
PCD 
处理 
tRESET 
5.1 
 
10 
 
5 
 
Ms 
tP 
5.1 
 
10 
 
5 
 
Ms 
tRETRANSMISSION 
0 
 
33 
 
 
 
Ms 
tRESETDELAY 
0 
 
33 
 
 
 
Ms 
tRECOVERY 
0 
 
1280 
 
 
 
1/fc

---
**[p63]**

JR/T 0025.11—2013 
57 
附 录 B 
（资料性附录） 
PCD 异常处理 
本附录阐明在第12章和13章所规定的异常处理。图B.1描述了PCD如何区分工作场内出现的任何可察
觉扰动和PICC所发的带有传输错误的真实响应。 
 
图B.1：PCD 干扰

---
**[p64]**

JR/T 0025.11—2013 
 
58 
参考文献 
[1]  EMV支付系统非接触规范：2.2，第D册