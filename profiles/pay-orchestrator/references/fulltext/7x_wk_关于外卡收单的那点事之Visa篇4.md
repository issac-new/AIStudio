# 关于外卡收单的那点事之Visa篇（4）

> **作者**: 外卡收单知识库 (Enzo Sun) | **专栏**: 大数跨境 10100.com/author/251667 | **发布**: 2025-10-20 | **原文通道**: 大数跨境专栏镜像 (Channel 0 直连)
> **采集时间**: 2026-09-08

---

导读：VCX（Visa Clearing Exchange）介绍：VCX（Visa Clearing Exchang
VCX（Visa Clearing Exchange）介绍：
VCX（Visa Clearing Exchange）介绍
VCX 是编辑包 4.0 版的软件替代品。Visa 向 VisaNet 终端提供 VCX，用于处理发送至 VisaNet 和从 VisaNet 接收的交易文件。VCX 充当客户端处理中心内部支付处理系统与 VisaNet 之间的接口。它负责准备终端处理中心的传出清算文件，以便传输至 Visa。VCX 还接收并报告来自 Visa 的传入清算文件，并将其准备就绪，以供处理中心的主机系统使用。
文件修饰符：
P – 生产运行指定文件识别修饰符；
T – 测试运行指定文件标识修饰符；
空白（默认）— 文件标识修饰符将与 RUNMODE 指定的值相同；
注意：如果文件ID 修饰符留空，位置 94 将基于运行模式运行控制选项中指定的值；
文件ID 修改器使处理中心能够修改唯一文件ID，以便轻松识别在其数据中心创建的文件。通过为处理日内安排的不同运行指定不同的文件ID 修改器值，文件可以轻松被唯一文件 ID 修改器识别。在传出运行期间生成的唯一文件 ID 会显示在 VCX 报告 VX-120F、VX-220、VX-221B、VX-221D 和 VX-221E 中。
文件类型：
文件类型运行控制选项用于指定用于BASE II 定制交付处理的传出 ITF 的 TC 90 文件头记录中的文件类型。文件类型运行控制选项仅应在 Visa 要求使用该选项的处理中心使用。Visa 将提供相应的值。
注意：处理中心在指定“文件类型”值时务必谨慎。Visa Clearing Exchange (VCX) 不会检查值是否有效。
BASE II 清算流程：
文件处理流程：Edit Package4:
4.2.3 OPGS -> VCX -> VisaNet文件处理
Pre-Edit Processing（预编辑处理）
输出流程的第一部分由客户处理中心的软件执行。这通常被称为预编辑处理，因为它是在Visa 清算交易所 (VCX) 处理之前进行的。预编辑处理涉及交换数据的捕获、编辑和格式化。提交到交换的交易通过客户处理中心的预编辑软件进行处理，该软件将这些信息放入中心交易文件 (CTF) 中。预编辑完成后，数据即可通过 VCX 运行；
VCX Processing（VCX 处理）
传出运行会处理输入CTF 文件中找到的每笔交易。运行控制配置文件用于识别存储库表中定义的一组用于传出处理的指定选项。处理结束时，控制程序会生成必要的报告。然后，VCX 会生成交换交易文件 (ITF)，该文件会被传输到扩展访问服务器 (EAS)、直接交换 (DEX)、开放文件交付 (OFD) 或 Visa 文件网关平台，并在那里保存，直到达到预定的收集时间；
BASE II System Processing（BASE II 系统处理）
BASE II 系统会在预定时间从 EAS、DEX OFD 或 VFG 收集交换文件。当 BASE II 收到交换交易后，系统会进行清算。系统会验证交易，将其转换为相应的货币，然后进行总计并按目的地排序。之后，系统会计算费用。在每个 BASE II 周期结束时，系统会计算所有有收款或付款交易的客户结算头寸；
注：VCX检测重复文件是根据TC 90 头记录中的两个数据元素：Processing Date （YYDDD：OPGS预编辑系统的处理日期）、File ID（三位数字）来确认的；
4.2.4 VisaNet -> VCX -> 系统文件处理
VCX Processing（VCX 处理）
传入VCX 运行会处理在输入 ITF 文件中找到的每个事务。您可以定义一个运行控制配置文件，用于识别存储库表中定义的一组命名选项，用于传入处理，在处理结束时，如果交换文件中没有严重错误，控制程序将生成必要的报告并使 CTF 文件可供客户端的处理中心使用；
传入的VCX 文件包含：
①　金融和非金融互换交易；
②　VSS 结算报告；
③　VCX 表更新；
注意：为确保正确应用表更新事务，所有传入文件都必须经过处理。文件必须按其创建的中央处理日期(CPD) 顺序进行处理，以便正确更新存储库表和代码相关文件；
Post-Edit Processing（编辑后处理）
后期编辑软件由客户的处理中心或外部供应商提供，用于重新格式化并处理从VisaNet 收到的传入交换数据。该软件负责对交换数据进行准备，以便持卡人和商户的过账程序能够处理交换数据，并用于处理中心的其他用途，例如欺诈分析；
Input File Sequence（输入文件序列）
输入序列功能根据传入文件的内容自动对其进行排序；
此功能允许对连续文件进行排序，无需人工干预；
4.2.5 VCX 三种安全连接方式
1、VCX Secure EAS Interface
用途：通过FTPS 连接到 Extended Access Server (EAS)；
要求：FTPS 客户端必须符合 RFC 4217 标准、支持命令行（方便脚本自动化）
2、 VCX Secure DEX OFD Interface
用途：通过FTPS 向 Direct Exchange (DEX) Open File Delivery (OFD) 传输文件；
要求：FTPS 客户端必须符合 RFC 4217 / RFC 2228、支持命令行接口、支持 TLS 1.2 或更高版本；
3、VCX Secure VFG Interface
用途：通过FTPS 向 Visa File Gateway (VFG) 传输文件；
要求：FTPS 客户端符合 RFC 4217 / RFC 2228、支持命令行接口、支持 TLS 1.2 或更高；
总结：Visa 提供了三种 基于 FTPS 的安全文件传输方式，都要求：
RFC 4217 / RFC 2228 兼容
命令行可调用（方便自动化/批处理）
TLS ≥ 1.2（保证加密强度）
差别在于接入点不同：
EAS → Extended Access Server
DEX OFD → Direct Exchange / Open File Delivery
VFG → Visa File Gateway
FTPS：FTPS 是一种 基于 FTP（File Transfer Protocol）加上 SSL/TLS 加密的安全文件传输协议；
详细解释：
FTP：最传统的文件传输协议，默认端口 21，但数据明文传输（用户名、密码、文件内容都可能被窃听）；
FTPS (FTP Secure)：在 FTP 基础上加入了 SSL/TLS（类似 HTTPS 对 HTTP 的升级），这样就能保证传输过程的 机密性、完整性、身份验证；
FTPS 有两种工作模式：
显式FTPS（Explicit FTPS）：客户端先连接 FTP 服务器（通常 21 端口），然后发送 AUTH TLS 命令来请求加密；支持兼容纯 FTP 客户端（如果服务器允许明文）；更灵活，也是目前主流的方式；
隐式FTPS（Implicit FTPS）：连接时就强制使用 SSL/TLS 加密（通常端口 990）；不能回退到明文 FTP，现在已经比较少见；
应用场景：
银行、支付机构、跨境清算系统常用FTPS 交换文件（比如 Visa、Mastercard 文件传输）；
企业批量传输敏感报表或日志；
FTPS：和 SFTP（基于 SSH）一样，都是安全文件传输协议，但 FTPS 更偏向传统 FTP 的扩展；
特性
FTPS (FTP Secure)
SFTP (SSH File Transfer Protocol)
协议基础
基于FTP 协议，扩展了 SSL/TLS 加密
基于SSH 协议的文件传输子系统
端口
控制端口21，数据端口可能为 20 或者动态端口（取决于主动/被动模式）
默认端口22
加密方式
SSL/TLS（对控制和/或数据通道加密）
SSH 提供的端到端加密
认证方式
用户名+密码、TLS/SSL 证书
用户名+密码、SSH 公钥认证
防火墙穿透
较复杂（需要开放多个动态端口，尤其是被动模式下）
较简单（只需开放22 端口）
兼容性
传统FTP 客户端/服务器的扩展版本，兼容性较好
专门支持SFTP 的客户端/服务器才能使用
数据完整性
通过TLS/SSL 提供校验
通过SSH 协议自带的完整性校验
实现复杂度
部署时需要证书管理，配置复杂
部署较简单，只需要SSH 服务
典型应用场景
银行、支付机构、需要符合PCI DSS 等合规的场景（和已有 FTP 系统兼容）
内部安全文件传输、自动化任务、跨平台安全传输
性能
较高（SSL/TLS 有硬件加速支持）
较稳定，但加解密在高并发下可能稍慢
4.3 请款交互文件格式
Format
补充
介绍
AN
Alphanumeric
仅包含字母（A–Z）和数字（0–9），不含空格和特殊符号
ANS
Alphanumeric Special
包含字母、数字、空格及部分特殊字符（如 -, /, &, : 等）
DX
Display Hexadecimal
表示为十六进制字符串的二进制数据；
N
Numeric
仅包含数字
UN
Unpacked Numeric
数字以未压缩格式存储，即每个数字占用1 字节
【声明】内容源于网络
0
0
外卡收单知识库
外卡收单知识库 聚焦Visa、Mastercard、JCB、Diners、Discover、AE、银联国际等卡组业务与技术体系，助力全面掌握外卡收单流程与标准。
内容 11
粉丝 0
关注 
在线咨询
外卡收单知识库  
外卡收单知识库 聚焦Visa、Mastercard、JCB、Diners、Discover、AE、银联国际等卡组业务与技术体系，助力全面掌握外卡收单流程与标准。
总阅读1.0k
 粉丝0
 内容11
旗下产品 M123.com
关于
 关于我们
商务合作
友情链接
加入大数
企业会员
帮助中心
隐私协议
版权声明
