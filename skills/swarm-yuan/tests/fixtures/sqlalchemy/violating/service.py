from sqlalchemy import text

from models import Order, SessionLocal


def list_orders():
    # 违规：1.x query() 风格
    session = SessionLocal()
    orders = session.query(Order).all()
    # 违规：session 关闭后返回，访问 o.customer 将 DetachedInstanceError
    session.close()
    return orders


def get_order(oid):
    # 违规：with 块内 return ORM 对象且无加载策略
    with SessionLocal() as session:
        return session.query(Order).filter_by(id=oid).first()


def bulk_create(rows):
    session = SessionLocal()
    # 违规：循环逐条 add（须 bulk_insert_mappings）+ 无 commit 边界
    for r in rows:
        session.add(Order(customer_id=r['cid']))


def search(name):
    session = SessionLocal()
    # 违规：text() f-string 拼接 SQL（注入）
    stmt = text(f"SELECT * FROM orders WHERE name = '{name}'")
    return session.execute(stmt).all()
