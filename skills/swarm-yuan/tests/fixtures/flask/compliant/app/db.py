import os
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker

# 连接串经环境变量注入
engine = create_engine(os.environ["DATABASE_URL"])

SessionLocal = scoped_session(sessionmaker(bind=engine))
