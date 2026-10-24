# 关于外卡收单的那点事之Visa篇（1）

> **作者**: 外卡收单知识库 (Enzo Sun) | **专栏**: 大数跨境 10100.com/author/251667 | **发布**: 2025-10-17 | **原文通道**: 大数跨境专栏镜像 (Channel 0 直连)
> **采集时间**: 2026-09-08

---

1、提供模拟VisaNet 接口的能力；
2、支持测试各种交易流程（如授权、清算、拒付等）；
3、配合VCX、CPT（Clearing & Processing Test）等工具使用；
适用场景：
1、系统联调；
2、新产品/功能上线前的验收测试；
3、日常回归测试；
VCMS（VisaNet Certification Management Service）
VCMS 是 VISA 卡组测试体系中用于开展各类测试的系统，其配置与生产环境（PROD，即正式对外提供服务的卡组运行环境）的工作站完全一致。这意味着测试人员在 VCMS中使用的工作站，在系统参数、功能逻辑等方面与实际生产场景保持同步，可确保基于该环境进行的应用测试具备较高的真实性和参考价值—开发者可直接将自己的应用程序部響到 VCMS的工作站上进行测试，无需担心因环境差异导致测试结果失真。
VCX（Visa Clearing Exchange）
VCX 是 Visa 提供的清算测试平台（Visa Clearing Exchange），用于模拟和验证清算（Clearing）流程，特别是用于 BASE I 与 BASE II 的数据交互测试。
功能特点：
1、支持批量文件格式验证（如TC33、IPM 报文）；
2、模拟VisaNet 清算应答；
3、提供数据格式校验、文件校验和测试报告；
安装结构：
1、包括多个模块，例如vcx-proxy, vcx-portal, vcx-ui；
2、提供配置文件、测试数据模板、脚本支持；
3、常用于Windows 或 Linux 环境下部署；
相关组件：
1、VCXProxyService：作为核心服务运行；
2、vcx-ui：提供 Web 可视化界面；
3、vcx-portal：服务管理界面；
EAS（Enhanced Authorization System）
EAS 是 Visa 的增强型授权系统（Enhanced Authorization System），用于提高交易授权处理的智能性和安全性，支持实时交易控制、风控校验与规则配置。
用途：
1、配合VisaNet 进行授权交易测试；
2、验证交易响应逻辑；
3、自定义规则以测试不同授权结果
VMG（Visa Message Generator）
VMG 是 Visa 提供的报文生成工具（Visa Message Generator），用于模拟发卡方或收单方发起的授权或清算交易，适用于联调测试。
功能：
1、生成符合Visa ISO 8583 报文规范的交易；
2、可配置MTI、DE 字段、Bit Map；
3、配合VCX/VTS 使用，模拟完整交易流；
account funding source
标识与卡主账户关联的资金来源。例如，签账、贷记、借记、递延借记和预付；
account number extension
帐号的三位扩展，允许帐号长度最多为19 位；
account prefix
持卡人账号的前九位数字；
account prefix range
低账户前缀和高账户前缀的集合，用于定义发卡机构使用的持卡人账号范围。（单个发卡机构可以使用多个范围。）所有范围均在ARDEF 表中维护，用于验证持卡人账号和发卡标识符;
account restricted use
标识帐户范围是否存在任何处理限制；
acquirer
与商户达成协议接受Visa 卡交易或向持卡人提供现金支出服务（或两者兼有）的客户金融机构。收单机构负责：
接受来自商家以及其自己的ATM 和银行分支机构的卡交易数据；
向那些接受卡的地点提供授权决策；
将交易信息作为交换交易传达给Visa；
acquirer center
支持一个或多个Visa 收单机构的 BASE II 处理中心。该处理中心代表收单机构接收来自商户和现金提取点的交易信息；处理本地交易，并将交换交易发送至 VIC，以便分发给发卡机构处理中心；并通过 BASE II 系统与商户、代理商以及其他客户（对于交换交易）进行交易结算；
Acquirer Reference Number
与每张汇票和凭证关联的23 位识别号码。它由格式代码、获取标识符、拍摄日期、胶片定位器和校验位组成；
administrative messages
所有在处理中心之间传递信息但不会在结算过程中产生借记或贷记的交易；
Advice File
BASE I 文件包含在 VIC 生成的授权和验证响应的记录；
ARDEF File
ARDEF（账户范围定义）表的永久文件，用于控制 Visa 清算交易所 (VCX) 处理的准确性。该表包含所有有效的 ARDEF 条目，即：账户前缀范围、其关联的发卡标识符、卡号长度指示符、校验位指示符、产品 ID 和账户资金来源；
balancing and reconciliation
在BASE II 周期中核算交易数量和金额以及每笔交易的货币的过程；
BASE I System
参见VIP 系统；
BASE II CIB
Visa 用于识别处理中心和客户的六位系统编号。中心识别块 (CIB) 分配给客户运营的处理中心、客户指定的非客户处理中心以及运营处理中心的客户；
注意：特定处理中心的BASE II CIB 不一定出现在该中心处理的持卡人账号中。
BASE II System
一种电子批量传输系统，主要用于Visa 交换交易数据的交换以及收单机构和发卡机构之间交易价值的结算。中心也使用该系统从通知文件中检索记录，Visa 也使用该系统与客户结算各种费用；
batch
通过BASE II 发送的一组交易记录，以批处理尾部结束；
batch acknowledgment transaction
每批传出交易在虚拟交换中心(VIC) 生成的收据确认。这些交易会被接收至中心的传入交换交易文件 (INV) 中；
batch trailer record
指示一批BASE II 交易结束的记录。它包含用于控制该批次交易数据完整性的计数和金额总计。另请参阅“商户批次尾随记录”；
Bill Payment Service
一项服务，允许客户接受来自其他客户Visa 卡持卡人的付款，并通过 BASE II 将款项存入发卡机构。发卡机构和收款客户必须位于同一国家/地区。在加拿大和巴西使用；
billing currency
发卡机构向持卡人收取交易费用的货币；
cash advance
使用Visa 或 Plus 卡从 ATM、银行出纳员或授权商家支付现金；
cashback
现金返还交易其本质是一种附加取现服务；持卡人在刷卡消费时，除了支付商品金额，还额外让收单行/商户从卡里多扣一笔钱，并直接拿到现金；比如：持卡人买了一块 1 美元糖果，结账时要求 取 20 美元现金，那么 TC 05（Sales Draft）里会这样填：
Total Transaction Amount（总交易额） = 21 美元
Purchase Amount（消费部分） = 1 美元
Cashback Amount（现金部分） = 20 美元
商户操作：
POS 机向发卡行发起一笔 21 美元的消费交易（不是两笔）；
发卡行授权成功后，商户收回1 美元货款，并从收银机里拿出 20 美元现金交给持卡人；
Interchange 费用的处理方式：
美国/加拿大：
Interchange 按 总金额 21 美元 收取，cashback 字段仅作信息；
部分亚太/拉美/欧洲国家：
模式1：只对 消费金额 1 美元 收 interchange，不对 20 美元现金收；
模式2：对 现金部分 20 美元 计算一个反向 interchange，等于说收单行会拿回一点手续费，作为商户“提供取现服务”的激励；
cashback field
一个九位数字的字段，指定发生购买交易时支付的货币金额；
Center Transaction File (CTF)
传出的中心交易文件包含交换交易由处理中心的预编辑程序生成。如果格式符合Visa 清算交易所 (VCX) 的要求，则将其转换为 ITF 并提交给 VIC。传入的中心交易文件包含从 VIC 通过 VAP 传输到 VCX 进行处理的 ITF 数据。如果没有错误，ITF 将被转换为 CTF 并用作后编辑程序的输入；
central processing date (CPD)
在VIC 生成相关 ITF 或报告的日期（基于格林威治标准时间）；
copy/original
发卡中心向收单中心索取的交易副本（与原件/复印件同义）；
collection-only transactions
提交给BASE II 仅用于收款的处理器内交易（不结算或交付）。正常的 BASE II 处理费和交换补偿费不适用于仅收款交易；
chargeback
经过发卡中心审查，发现不适当并与其他传出交换一起发回收单中心的销售汇票或其他项目；
Chargeback Reduction Service (CRS)
这是一项全球服务，为收单机构和发卡机构提供来自其他VisaNet 系统的信息，以减少不必要的退款和陈述的数量以及研究有效退款所需的时间；
chargeback reversal
向收单中心错误发送的退款取消信息；
check digit
添加到账号或收单行参考号末尾的数字，该数字是使用预定公式和账号前几位数字计算得出的。在编辑过程中，它会用于验证账号和收单行参考号；
clearing
以商家的货币从收单机构收取交易款项并以持卡人的货币将其交付给发卡机构所需的所有功能；
currency conversion rate
Visa International 将此费率应用于某些交易（原始销售汇票、陈述、旅行券、信用券和现金支出）以及此类交易的逆转；
Custom Payment Service (CPS)
这是一种Visa 支付服务，可最大程度地减少退款并促进通过分配一个在整个交易生命周期中始终伴随交易的唯一标识符来实现交易清算和结算；
Data Capture Service
商家使用销售点(POS) 上的电子终端来获取销售交易数据。客户可以收到每个商家地点发生的交易报告；
Data Capture Advice
批量交易将商户处捕获的交易数据传送至收单中心，随后提交给BASE II；
descriptive billing
一种计费方式，持卡人会收到一张账单，其中包含识别卡受理机构（商户、银行分行或营业地点）的描述性信息，以及记入账户的每笔交易的每笔收费或贷记的性质。原件不退还给持卡人；
Early Delivery Service
在结算完成之前将交易数据传送到处理中心的选项；
Edit Package
Visa International 向处理中心提供的计算机程序用于验证交换数据、生成包含从处理中心发送到 Visa 的所有交换数据的文件以及处理从 Visa 收到的传入交易的文件；
Edit Package processing date
编辑包在特定运行期间使用的日期。这可以是计算机的系统日期或RUNDATE 运行控制选项上指定的日期；
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
