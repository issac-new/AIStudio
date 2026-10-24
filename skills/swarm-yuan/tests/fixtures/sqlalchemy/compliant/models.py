from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Customer(Base):
    __tablename__ = 'customers'
    id = Column(Integer, primary_key=True)
    # String 显式长度，跨方言可移植
    name = Column(String(100), nullable=False)


class Order(Base):
    __tablename__ = 'orders'
    id = Column(Integer, primary_key=True)
    # 外键显式索引（PG 不自动建 FK 索引）
    customer_id = Column(Integer, ForeignKey('customers.id'), index=True)
    # 加载策略：selectin 消除 N+1
    customer = relationship('Customer', lazy='selectin')
