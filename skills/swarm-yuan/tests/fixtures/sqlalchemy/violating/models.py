from sqlalchemy import Column, ForeignKey, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

# 违规：明文凭据 + 无 pool_recycle/pool_pre_ping + 无 pool_size
engine = create_engine("postgresql://shop:secretpass123@localhost/shop")
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class Customer(Base):
    __tablename__ = 'customers'
    id = Column(Integer, primary_key=True)
    # 违规：String 无长度（MySQL 建表报错）
    name = Column(String)


class Order(Base):
    __tablename__ = 'orders'
    id = Column(Integer, primary_key=True)
    # 违规：外键无 index=True
    customer_id = Column(Integer, ForeignKey('customers.id'))
    # 违规：relationship 无加载策略
    customer = relationship('Customer')


# 违规：create_all 直接建表，无 Alembic 迁移
Base.metadata.create_all(engine)
