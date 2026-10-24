from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker

# 违规：明文凭据 URI
engine = create_engine("postgresql://shop:secretpass123@localhost/shop")

# 违规：scoped_session 无 teardown/remove
Session = scoped_session(sessionmaker(bind=engine))
