# Alembic 迁移环境：schema 演进版本化管理（替代 create_all）
from alembic import context

from models import Base

target_metadata = Base.metadata


def run_migrations_online():
    context.configure(target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()
