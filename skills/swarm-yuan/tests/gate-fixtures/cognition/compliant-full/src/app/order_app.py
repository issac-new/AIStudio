# 订单应用服务样本：承载术语表代码标识符（供 ④映射 概念↔空间 一致性核对）
class OrderAppService:
    def place(self, raw_id):
        order_id = OrderId(raw_id)
        return OrderAggregate(order_id)
