# 订单写入样本（warn 态）：7 处写入，超过幂等性提醒阈值（>5）
def create_order(cursor, order):
    cursor.execute("INSERT INTO orders (id, amount) VALUES (%s, %s)", (order.id, order.amount))


def create_order_item(cursor, item):
    cursor.execute("INSERT INTO order_items (id, order_id) VALUES (%s, %s)", (item.id, item.order_id))


def create_payment(cursor, payment):
    cursor.execute("INSERT INTO payments (id, order_id) VALUES (%s, %s)", (payment.id, payment.order_id))


def create_shipment(cursor, shipment):
    cursor.execute("INSERT INTO shipments (id, order_id) VALUES (%s, %s)", (shipment.id, shipment.order_id))


def create_invoice(cursor, invoice):
    cursor.execute("INSERT INTO invoices (id, order_id) VALUES (%s, %s)", (invoice.id, invoice.order_id))


def create_coupon_usage(cursor, usage):
    cursor.execute("INSERT INTO coupon_usages (id, order_id) VALUES (%s, %s)", (usage.id, usage.order_id))


def create_points_record(cursor, record):
    cursor.execute("INSERT INTO points_records (id, user_id) VALUES (%s, %s)", (record.id, record.user_id))
