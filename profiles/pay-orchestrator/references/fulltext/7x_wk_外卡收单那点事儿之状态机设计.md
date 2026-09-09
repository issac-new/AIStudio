# 外卡收单那点事儿之状态机设计

> **作者**: 外卡收单知识库 (Enzo Sun) | **专栏**: 大数跨境 10100.com/author/251667 | **发布**: 2025-12-16 | **原文通道**: 大数跨境专栏镜像 (Channel 0 直连)
> **采集时间**: 2026-09-08

---

导读：外卡收单那点事儿之状态机设计
1、外卡收单之收单行状态机设计

1.1、设计原则

✅ 原则 1：授权 ≠ 清算 ≠ 结算
必须强拆三条状态线，哪怕表里只存一个主状态。

✅ 原则 2：Pending 是常态，不是异常
Visa / MC（Mastercard、万事网联） 授权超时
网络抖动
异步 Advice / Reversal  👉 Pending 是一等公民

✅ 原则 3：Reversal 只解决“不确定授权”
未确认授权 → Reversal
已确认授权但未清算 → Void
已清算 → Refund

三者绝不能混

✅ 原则 4：Clearing 以“卡组文件”为准
实时返回 ≠ 可清算
一切以 BASE II / GCMS 文件 为最终事实

✅ 原则 5：最终账务状态只由 Settlement 决定
Auth 成功 ≠ 钱到
Clearing 成功 ≠ 已结算

1.2、状态机设计之主交易状态机（Authorization → Clearing → Settlement）

1.2.1、Authorization（授权）
1.2.2、Void（授权成功但不清算）
1.2.3、清算阶段（Clearing / Capture）
1.2.3、退款（Refund）
1.2.4、争议（Chargeback）
1️⃣ 标准定义（卡组术语）
Representment  The process by which the Acquirer contests a chargeback by submitting supporting documentation to the Issuer through the card network.

直译：收单行通过卡组，向发卡行提交证据，反驳拒付理由。

2️⃣ 什么情况下会进入 REPRESENTMENT
已发生 Chargeback
收单行评估后认为：
交易合规
有充足证据
成本值得
......
3️⃣ 常见应诉证据类型（你一定见过）
争议类型
常见证据
Fraud
3DS 认证、AVS、CVV、设备指纹
No Show
酒店政策、入住记录
No Receipt
签名、EMV 数据
Services Not Rendered
交付证明、物流签收
4️⃣ 账务含义（非常关键）
阶段
钱在哪里
Chargeback
钱被扣回 Issuer
Representment 提交中
钱仍然不在你这
Representment 胜诉
钱返还给 Acquirer
Representment 失败
进入下一阶段或认亏
👉 REPRESENTMENT 本身不等于钱回来了

5️⃣ 为什么必须在状态机里显式建这个状态？

因为：
有 SLA（通常 7–30 天）
有证据链
有成本
有结果分叉

如果你不建这个状态：
风控无法统计成功率
财务无法预测损失
商户体验无法解释

注：WRITE_OFF（核销 / 认亏）——到底意味着什么？

1️⃣ 标准定义（会计 + 卡组）
Write-off  The act of recognizing a disputed transaction as a loss and removing it from recoverable accounts.

直译：确认无法追回，作为损失核销。

2️⃣ 哪些情况会进入 WRITE_OFF
场景
说明
Representment 失败
Issuer 拒绝证据
Arbitration 败诉
卡组裁决失败
放弃应诉
成本 > 金额
超时未提交
操作失误
3️⃣ WRITE_OFF 的账务影响（非常重要）
维度
影响
资金
永久损失
会计
计入坏账 / 争议损失
风控
提高商户风险等级
合规
计入 CB Ratio
4️⃣ WRITE_OFF ≠ 退款（很多人搞混）
对比项
WRITE_OFF
REFUND
主动性
被动
主动
是否违规
否
否
是否影响 CB Ratio
✅ 会
❌ 不会
是否可追回
❌ 否
❌ 否
5️⃣ 放进状态机里的“工程级定义”

✅ REPRESENTMENT

状态含义：

已发生拒付，收单行已向卡组提交应诉材料，等待发卡行/卡组裁决。

状态特征：
有截止时间
有证据集
有后续状态分叉

✅ WRITE_OFF

状态含义：

争议流程已结束，该交易确认无法追回，作为损失核销。

状态特征：
终态
触发财务入账
影响商户与风控指标

2、外卡收单3方/4方状态机设计
其中交易撤销、冲正一般作为原始交易的载体更新原始数据即可。撤销、冲正之后的交易不可二次操作。

撤销：VOID

冲正：REVERSAL

退款操作同交易操作基本一致；
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
