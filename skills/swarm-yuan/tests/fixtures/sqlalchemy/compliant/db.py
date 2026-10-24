import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 连接串经环境变量注入；池回收 + 探活防 wait_timeout 断连；池大小按并发显式配置
engine = create_engine(
    os.environ["DATABASE_URL"],
    pool_size=10,
    max_overflow=20,
    pool_recycle=1800,
    pool_pre_ping=True,
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)
