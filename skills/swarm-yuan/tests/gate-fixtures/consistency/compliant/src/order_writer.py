# 订单写入样本（compliant）：仅 2 处写入，低于幂等性提醒阈值（>5）
def create_order(cursor, order):
    cursor.execute("INSERT INTO orders (id, amount) VALUES (%s, %s)", (order.id, order.amount))


def create_order_item(cursor, item):
    cursor.execute("INSERT INTO order_items (id, order_id) VALUES (%s, %s)", (item.id, item.order_id))
