# 争议处理 Dispute Management 全流程（标准版）

> **作者**: 外卡收单知识库 (Enzo Sun) | **专栏**: 大数跨境 10100.com/author/251667 | **发布**: 2025-12-11 | **原文通道**: 大数跨境专栏镜像 (Channel 0 直连)
> **采集时间**: 2026-09-08

---

一、争议整体流程图

如下所示：
二、争议详细流程

卡收单争议流程详情如下：

🧩 第一阶段：持卡人投诉 / 发卡行初审
持卡人提出争议（Transaction Inquiry）

原因包括：
未授权交易（Fraud）
货不对板
未收到货
重复扣款
金额错误
取消订阅未退款

输出：争议 Case 编号
发卡行初步调查（Issuer Review）

发卡行评估：
交易合法性（3DS / EMV / PIN）
是否属于持卡人错误
风险评分
发卡行进行临时入账（Provisional Credit）

发卡行可 先给持卡人临时退款（不等于最终结果）

解释：

Provisional Credit = 发卡行先把争议金额临时退给持卡人，但不代表最终判定持卡人获胜。

这是一个暂时性的过账（Temporary Credit），主要用于：
防止持卡人因争议而资金长时间被占用
加速客户体验
发卡行在调查期间给持卡人缓冲

⚠ 重要：这笔钱不是最终退款。最终结果可能会被收回。

临时入账/退款发生在：持卡人投诉 → 发卡行初审之后

时间一般在持卡人投诉当日或 1–3 天内。

流程示例：
持卡人说：这笔交易不是我做的
发卡行对交易做初步判断：可能确实可疑
发卡行发起争议前（或同时）
给客户先退钱（Provisional Credit）

🧩 第二阶段：发起争议（Chargeback / Dispute）
发卡行发起争议（Issuer Raises Chargeback）

发卡行收集证据，根据卡组织规则选择：
Visa：Dispute Category
Mastercard：Chargeback Reason Code

输出：
争议理由代码（RC）
争议金额
证据文件

注：当前阶段商户、收单行或PSP机构可以选择接入Visa RDR（Rapid Dispute Resolution）、Mastercard Ethoca等拒付预警系统，在当前交易模块拦截拒付，以防止发生更严重的真实拒付；

Visa RDR（Rapid Dispute Resolution）
是 Visa 提供的“快速拒付预警 + 自动解决机制”
在发卡行提交争议前，Visa 拦截案件 → 推给收单行/商户
商户可以选择：
自动接受
自动拒绝
自动退款条件
Mastercard Ethoca
更早（发卡行接到持卡人投诉时）
发卡行向 Ethoca 网络广播预警
收单行 / 商户快速处理（发货未出 → 拦截订单 / 退款）
防止 chargeback 正式落地
阶段
是否触发 RDR/Ethoca？
持卡人投诉
❌ 不触发
发卡行初步调查
❌ 不触发
发卡行给 Provisional Credit
❌ 不触发
发卡行正式提交争议（Chargeback）
✅ 触发
Visa/Mastercard 仲裁阶段
已经过预警阶段
卡组织路由争议（VisaNet / Mastercard Network）

卡组织发送至：

→ 收单行 → PSP → 商户

🧩 第三阶段：收单行/PSP → 商户处理
收单行接收争议（Acquirer Receives Chargeback）

收单侧需要：
记录 dispute case
映射 MID/TID
进行风险分类（欺诈类 vs 商品类）
通知商户（Merchant Notification）

收单机构或 PSP 通知商户：
争议原因 RC
争议金额
响应截止时间（一般 7–14 天）
证据材料要求
商户准备证据（Merchant Evidence Preparation）

商户提交：
订单信息（订单号、交易号、Reference）
物流证明 / 交付证明
通信记录
风控信息（IP、指纹、手机号、风控日志）
3DS / EMV 数据（若支持）
签购单 / 消费凭证（Card-Present）
收单行审核证据（Acquirer Review Evidence）

检查是否完整、是否能反驳发卡行理由。

收单行决定：
提交抗辩（Representment）
或 接受争议（Write-off）

🧩 第四阶段：发卡行复审与 Pre-Arbitration / Second Chargeback

10. 收单行提交抗辩（Representment）

收单行把证据反馈给：

→ 卡组织 → 发卡行

11. 发卡行复审（Issuer Re-evaluation）

发卡行再次评估：
商户证据是否有效
是否维持争议

12. 发卡行决定：接受或继续争议

✔ 如果接受 → 案件关闭，商户胜诉  ✔ 如果拒绝 → 进入：继续争议流程

13. 发卡行发起 Pre-Arbitration（Visa） / Second Chargeback（Mastercard）

这是“第二轮争议”。

14. 收单行处理 Pre-Arb / Second Chargeback

收单行可以：
接受（商户承担损失）
拒绝（继续提交证据）

拒绝则进入 最终仲裁。

🧩 第五阶段：卡组织仲裁（Arbitration）

15. 卡组织正式仲裁（Arbitration Filing）

提交方通常为：
Visa：双方都可发起
Mastercard：通常由收单行发起第三阶段仲裁

仲裁内容：
审查所有证据
按卡组织规则判断责任方

16.卡组织裁决（Final Decision）

结果：
商户胜诉
商户败诉
金融责任双方分担

17. 卡组织费用扣除（Arbitration Fee）

包括：
仲裁费（500–1500 美元区间，视品牌与地区而定）
处理费用
违规处罚（如 Excessive Chargeback Program）

18.案件完全关闭（Case Close）

收单行更新系统：
dispute_case
结算状态
商户对账单

三、争议详细流程图

针对章节一、章节二 做出详细说明；
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
