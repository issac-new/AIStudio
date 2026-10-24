from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db import SessionLocal
from models import Order


def list_orders():
    # 2.x select() + selectinload 预加载关联，出块后访问安全
    with SessionLocal() as session:
        stmt = select(Order).options(selectinload(Order.customer))
        return list(session.scalars(stmt).all())


def create_order(customer_id):
    # 写操作有明确事务边界
    with SessionLocal() as session:
        order = Order(customer_id=customer_id)
        session.add(order)
        session.commit()
        return order.id


def bulk_create(rows):
    # 批量插入用 bulk_insert_mappings
    with SessionLocal() as session:
        session.bulk_insert_mappings(Order, rows)
        session.commit()
