from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.database import DATABASE_URL, Base
from app import platform_models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# DATABASE_URL (env var, same one app/database.py reads) takes precedence
# over alembic.ini's sqlalchemy.url, so migrations run against whatever
# database the app itself is actually configured for.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=DATABASE_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
    connectable = create_engine(DATABASE_URL, connect_args=connect_args, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

